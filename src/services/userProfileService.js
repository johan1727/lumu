const supabase = require('../config/supabase');
const llmService = require('./llmService');

/**
 * Servicio de Perfil de Usuario para Personalización Predictiva
 * Analiza historial de búsquedas para extraer preferencias implícitas
 */

const WEIGHTS = {
    RECENCY_DAYS_1: 1.0,
    RECENCY_DAYS_7: 0.7,
    RECENCY_DAYS_30: 0.4,
    RECENCY_OLD: 0.2,
    CLICKED_RESULT: 0.3,
    TIME_SPENT_SEC_PER_10: 0.05, // +0.05 por cada 10 segundos
    MAX_TIME_BONUS: 0.3
};

/**
 * Obtener o crear perfil de usuario
 */
async function getOrCreateProfile(userId) {
    if (!supabase || !userId) return null;

    try {
        // Intentar obtener perfil existente
        const { data: existing, error: fetchError } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (fetchError && fetchError.code !== 'PGRST116') {
            console.error('[UserProfile] Error fetching profile:', fetchError);
            return null;
        }

        if (existing) {
            return existing;
        }

        // Crear perfil nuevo con valores por defecto
        const { data: created, error: createError } = await supabase
            .from('user_profiles')
            .insert({
                user_id: userId,
                category_affinities: {},
                price_range_preference: { min: null, max: null, currency: 'MXN' },
                brand_preferences: {},
                feature_priorities: {},
                search_patterns: {
                    total_searches: 0,
                    avg_session_duration_sec: 0,
                    preferred_times: [],
                    click_through_rate: 0
                },
                preferred_stores: [],
                excluded_stores: [],
                condition_preference: 'any',
                personalization_enabled: true,
                auto_apply_filters: true
            })
            .select()
            .single();

        if (createError) {
            console.error('[UserProfile] Error creating profile:', createError);
            return null;
        }

        console.log(`[UserProfile] Created new profile for user ${userId}`);
        return created;

    } catch (err) {
        console.error('[UserProfile] Exception in getOrCreateProfile:', err);
        return null;
    }
}

/**
 * Calcular peso de recencia para una búsqueda
 */
function calculateRecencyWeight(searchDate) {
    const daysAgo = (Date.now() - new Date(searchDate).getTime()) / (1000 * 60 * 60 * 24);
    
    if (daysAgo <= 1) return WEIGHTS.RECENCY_DAYS_1;
    if (daysAgo <= 7) return WEIGHTS.RECENCY_DAYS_7;
    if (daysAgo <= 30) return WEIGHTS.RECENCY_DAYS_30;
    return WEIGHTS.RECENCY_OLD;
}

// Mapa de tiendas/países a moneda para derivar currency sin depender del LLM
const COUNTRY_CURRENCY_MAP = {
    US: 'USD', MX: 'MXN', CL: 'CLP', CO: 'COP', AR: 'ARS', PE: 'PEN', BR: 'BRL'
};

const KNOWN_BRANDS = ['apple', 'samsung', 'xiaomi', 'sony', 'lg', 'hp', 'dell', 'lenovo', 'asus',
    'nike', 'adidas', 'puma', 'huawei', 'motorola', 'google', 'microsoft', 'logitech',
    'jbl', 'bose', 'anker', 'intel', 'amd', 'nvidia', 'corsair', 'razer', 'philips'];

const CATEGORY_KEYWORDS = {
    smartphone: /iphone|celular|smartphone|galaxy|xiaomi|motorola|pixel/,
    laptop: /laptop|notebook|macbook|computadora|chromebook/,
    audio: /audifono|earbuds|airpods|bocina|parlante|auricular/,
    tv: /tv|televisor|smart\s*tv|oled|qled/,
    fashion: /tenis|zapatos|ropa|camisa|pants|vestido|sneaker/,
    home: /cafetera|aspiradora|licuadora|microondas|refrigerador|lavadora/,
    gaming: /ps5|xbox|nintendo|playstation|switch|gaming/,
    tablet: /tablet|ipad|kindle|fire\s*hd/
};

/**
 * Extraer marcas desde texto usando regex local (no requiere LLM)
 */
function extractBrandsLocal(text) {
    const lower = (text || '').toLowerCase();
    return KNOWN_BRANDS.filter(brand => {
        const re = new RegExp(`\\b${brand}\\b`);
        return re.test(lower);
    });
}

/**
 * Extraer categoría desde texto usando keywords locales
 */
function extractCategoryLocal(text) {
    const lower = (text || '').toLowerCase();
    for (const [cat, regex] of Object.entries(CATEGORY_KEYWORDS)) {
        if (regex.test(lower)) return cat;
    }
    return null;
}

/**
 * Derivar currency desde resultados de búsqueda o fallback
 */
function deriveCurrencyFromResults(searchResults) {
    for (const r of (searchResults || [])) {
        const country = String(r.countryCode || r.country || r.region || '').toUpperCase();
        if (COUNTRY_CURRENCY_MAP[country]) return COUNTRY_CURRENCY_MAP[country];
    }
    return 'MXN';
}

/**
 * Extraer entidades de una búsqueda usando LLM con fallback local robusto
 */
async function extractSearchEntities(query, searchResults = []) {
    // Extracción local como base (siempre disponible)
    const localBrands = extractBrandsLocal(query);
    const localCategory = extractCategoryLocal(query);
    const localCurrency = deriveCurrencyFromResults(searchResults);

    // Extraer marcas también de los títulos de resultados
    const resultsBrands = [];
    for (const r of searchResults.slice(0, 3)) {
        const b = extractBrandsLocal(r.titulo || '');
        resultsBrands.push(...b);
    }
    const allLocalBrands = [...new Set([...localBrands, ...resultsBrands])];

    try {
        // Usar análisis de LLM para enriquecer
        const analysis = await llmService.analyzeMessage(query, searchResults.slice(0, 3));
        
        return {
            category: analysis.productCategory || localCategory || null,
            brands: allLocalBrands.length > 0 ? allLocalBrands : [],
            features: analysis.importantFeatures || [],
            priceRange: {
                min: analysis.minBudget || null,
                max: analysis.maxBudget || null,
                currency: localCurrency  // derivar de resultados, más confiable que LLM
            },
            intent: analysis.intent_type || 'general'
        };
    } catch (err) {
        console.log('[UserProfile] LLM extraction failed, using local fallback:', err.message);
        
        return {
            category: localCategory,
            brands: allLocalBrands,
            features: [],
            priceRange: { min: null, max: null, currency: localCurrency },
            intent: 'general'
        };
    }
}

/**
 * Actualizar perfil basado en una nueva búsqueda
 */
async function updateProfileFromSearch(userId, searchData) {
    if (!supabase || !userId) return null;

    try {
        const profile = await getOrCreateProfile(userId);
        if (!profile) return null;

        const { query, results = [], clickedResult = null, sessionDurationSec = 0 } = searchData;
        
        // Extraer entidades
        const entities = await extractSearchEntities(query, results);
        
        // Calcular pesos
        const recencyWeight = calculateRecencyWeight(new Date());
        const clickBonus = clickedResult ? WEIGHTS.CLICKED_RESULT : 0;
        const timeBonus = Math.min(
            (sessionDurationSec / 10) * WEIGHTS.TIME_SPENT_SEC_PER_10,
            WEIGHTS.MAX_TIME_BONUS
        );
        const totalWeight = recencyWeight + clickBonus + timeBonus;

        // Actualizar afinidades de categoría
        const updatedCategories = { ...profile.category_affinities };
        if (entities.category) {
            const current = updatedCategories[entities.category] || 0;
            updatedCategories[entities.category] = Math.min(1.0, current + (totalWeight * 0.15));
        }

        // Actualizar preferencias de marca
        const updatedBrands = { ...profile.brand_preferences };
        entities.brands.forEach(brand => {
            const current = updatedBrands[brand] || 0;
            updatedBrands[brand] = Math.min(1.0, current + (totalWeight * 0.2));
        });

        // Actualizar prioridades de features
        const updatedFeatures = { ...profile.feature_priorities };
        entities.features.forEach(feature => {
            const current = updatedFeatures[feature] || 0;
            updatedFeatures[feature] = Math.min(1.0, current + (totalWeight * 0.1));
        });

        // Actualizar rango de precios preferido
        let updatedPriceRange = { ...profile.price_range_preference };
        if (entities.priceRange.max) {
            const currentMax = updatedPriceRange.max || entities.priceRange.max;
            const newMax = (currentMax * 0.7) + (entities.priceRange.max * 0.3); // Media móvil
            updatedPriceRange.max = Math.round(newMax);
            updatedPriceRange.currency = entities.priceRange.currency || 'MXN';
        }

        // Actualizar patrones de búsqueda
        const updatedPatterns = { ...profile.search_patterns };
        updatedPatterns.total_searches = (updatedPatterns.total_searches || 0) + 1;
        updatedPatterns.avg_session_duration_sec = 
            ((updatedPatterns.avg_session_duration_sec || 0) * 0.9) + (sessionDurationSec * 0.1);

        // Guardar en BD
        const { data: updated, error } = await supabase
            .from('user_profiles')
            .update({
                category_affinities: updatedCategories,
                brand_preferences: updatedBrands,
                feature_priorities: updatedFeatures,
                price_range_preference: updatedPriceRange,
                search_patterns: updatedPatterns,
                last_search_at: new Date().toISOString()
            })
            .eq('user_id', userId)
            .select()
            .single();

        if (error) {
            console.error('[UserProfile] Error updating profile:', error);
            return null;
        }

        return updated;

    } catch (err) {
        console.error('[UserProfile] Exception in updateProfileFromSearch:', err);
        return null;
    }
}

/**
 * Obtener perfil simplificado para uso en frontend
 */
async function getProfileSummary(userId) {
    const profile = await getOrCreateProfile(userId);
    if (!profile) return null;

    // Ordenar y filtrar solo valores significativos (>0.3)
    const significantCategories = Object.entries(profile.category_affinities || {})
        .filter(([_, score]) => score > 0.3)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    const significantBrands = Object.entries(profile.brand_preferences || {})
        .filter(([_, score]) => score > 0.3)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    return {
        personalizationEnabled: profile.personalization_enabled,
        topCategories: significantCategories.map(([name, score]) => ({ name, score })),
        topBrands: significantBrands.map(([name, score]) => ({ name, score })),
        priceRange: profile.price_range_preference,
        totalSearches: profile.search_patterns?.total_searches || 0,
        lastUpdated: profile.last_updated
    };
}

/**
 * Calcular score de personalización para un producto
 */
async function calculatePersonalizationScore(userId, product) {
    const profile = await getOrCreateProfile(userId);
    if (!profile || !profile.personalization_enabled) return 0;

    let score = 0;
    const maxPossibleScore = 1.0;

    // Match de categoría (30%)
    const categoryScore = profile.category_affinities?.[product.productCategory] || 0;
    score += categoryScore * 0.3;

    // Match de marca (25%)
    const productBrand = (product.brand || product.tienda || '').toLowerCase();
    let brandScore = 0;
    for (const [brand, prefScore] of Object.entries(profile.brand_preferences || {})) {
        if (productBrand.includes(brand.toLowerCase())) {
            brandScore = Math.max(brandScore, prefScore);
        }
    }
    score += brandScore * 0.25;

    // Match de precio (20%)
    const price = parseFloat(product.precio || 0);
    const preferredMax = profile.price_range_preference?.max;
    if (preferredMax && price > 0) {
        const priceRatio = Math.min(price, preferredMax) / preferredMax;
        score += priceRatio * 0.2;
    }

    // Match de features (15%)
    // (Implementación futura: analizar título/descripción)

    // Preferencia de condición (10%)
    if (profile.condition_preference !== 'any') {
        const productCondition = product.conditionLabel || 'new';
        if (productCondition === profile.condition_preference) {
            score += 0.1;
        }
    }

    return Math.min(score, maxPossibleScore);
}

/**
 * Aplicar re-ranking personalizado a resultados
 */
async function personalizeResults(userId, results) {
    if (!userId || !results || results.length === 0) return results;

    const profile = await getOrCreateProfile(userId);
    if (!profile || !profile.personalization_enabled) return results;

    // Asignar rank original real (1-based) antes de cualquier reordenamiento
    const scoredResults = await Promise.all(
        results.map(async (product, idx) => {
            const personalScore = await calculatePersonalizationScore(userId, product);
            return {
                ...product,
                _personalizedScore: personalScore,
                _originalRank: idx + 1  // 1-based, posición original real
            };
        })
    );

    // Combinar con score original (70% original, 30% personalizado)
    const reRanked = scoredResults.map(p => ({
        ...p,
        _finalScore: (p.bestBuyScore || 0.5) * 0.7 + (p._personalizedScore * 0.3)
    }));

    // Ordenar por score final
    reRanked.sort((a, b) => b._finalScore - a._finalScore);

    // Marcar hasta 3 resultados que REALMENTE subieron de posición por personalización
    let personalizationAppliedCount = 0;
    const MAX_PERSONALIZED_BADGES = 3;
    return reRanked.map((p, index) => {
        const newRank = index + 1;
        const movedUp = p._originalRank > newRank; // subió al menos 1 posición
        const hasSignificantScore = p._personalizedScore > 0.3;
        const wasBoosted = hasSignificantScore && movedUp && personalizationAppliedCount < MAX_PERSONALIZED_BADGES;
        if (wasBoosted) personalizationAppliedCount++;
        
        return {
            ...p,
            _isPersonalized: wasBoosted,
            _personalizedRank: wasBoosted ? personalizationAppliedCount : null,
            _personalizedReason: wasBoosted ? generatePersonalizedReason(profile, p) : null
        };
    });
}

/**
 * Generar razón de personalización para mostrar al usuario
 */
function generatePersonalizedReason(profile, product) {
    const reasons = [];
    
    const category = product.productCategory;
    if (category && profile.category_affinities?.[category] > 0.5) {
        reasons.push(`Buscas mucho ${category}`);
    }
    
    const brand = Object.keys(profile.brand_preferences || {})
        .find(b => (product.brand || product.tienda || '').toLowerCase().includes(b));
    if (brand) {
        reasons.push(`Te gusta ${brand}`);
    }
    
    return reasons.length > 0 ? reasons.join(' + ') : 'Recomendado para ti';
}

/**
 * Toggle personalización on/off
 */
async function togglePersonalization(userId, enabled) {
    if (!supabase || !userId) return false;

    try {
        const { error } = await supabase
            .from('user_profiles')
            .update({ personalization_enabled: enabled })
            .eq('user_id', userId);

        return !error;
    } catch (err) {
        console.error('[UserProfile] Error toggling personalization:', err);
        return false;
    }
}

module.exports = {
    getOrCreateProfile,
    getProfileSummary,
    updateProfileFromSearch,
    calculatePersonalizationScore,
    personalizeResults,
    togglePersonalization,
    extractSearchEntities
};
