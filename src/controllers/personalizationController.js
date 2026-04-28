const userProfileService = require('../services/userProfileService');
const { z } = require('zod');

/**
 * Controller para Personalización Predictiva
 * Endpoints para perfil de usuario y recomendaciones personalizadas
 */

// Schemas de validación
const updatePreferencesSchema = z.object({
    preferred_stores: z.array(z.string()).optional(),
    excluded_stores: z.array(z.string()).optional(),
    condition_preference: z.enum(['new', 'used', 'refurbished', 'any']).optional(),
    auto_apply_filters: z.boolean().optional(),
    personalization_enabled: z.boolean().optional()
});

/**
 * GET /api/me/profile
 * Obtener perfil personalizado del usuario actual
 */
exports.getMyProfile = async (req, res) => {
    try {
        const userId = req.userId;
        if (!userId) {
            return res.status(401).json({ error: 'Se requiere autenticación' });
        }

        const profile = await userProfileService.getProfileSummary(userId);
        
        if (!profile) {
            return res.status(404).json({ 
                error: 'Perfil no encontrado',
                message: 'Realiza una búsqueda para crear tu perfil personalizado'
            });
        }

        res.json({
            success: true,
            profile,
            message: profile.personalizationEnabled 
                ? 'Personalización activa'
                : 'Personalización desactivada'
        });

    } catch (error) {
        console.error('[PersonalizationController] Error en getMyProfile:', error);
        res.status(500).json({ error: 'Error al obtener perfil' });
    }
};

/**
 * GET /api/me/profile/full
 * Obtener perfil completo (para debugging/admin)
 */
exports.getFullProfile = async (req, res) => {
    try {
        const userId = req.userId;
        if (!userId) {
            return res.status(401).json({ error: 'Se requiere autenticación' });
        }

        const fullProfile = await userProfileService.getOrCreateProfile(userId);
        
        if (!fullProfile) {
            return res.status(404).json({ error: 'Perfil no encontrado' });
        }

        // No exponer user_id en la respuesta
        const { user_id, ...safeProfile } = fullProfile;

        res.json({
            success: true,
            profile: safeProfile
        });

    } catch (error) {
        console.error('[PersonalizationController] Error en getFullProfile:', error);
        res.status(500).json({ error: 'Error al obtener perfil completo' });
    }
};

/**
 * PUT /api/me/profile
 * Actualizar preferencias explícitas del usuario
 */
exports.updatePreferences = async (req, res) => {
    try {
        const userId = req.userId;
        if (!userId) {
            return res.status(401).json({ error: 'Se requiere autenticación' });
        }

        // Validar input
        const validation = updatePreferencesSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ 
                error: 'Datos inválidos', 
                details: validation.error.errors 
            });
        }

        const supabase = require('../config/supabase');
        const { data: updated, error } = await supabase
            .from('user_profiles')
            .update(validation.data)
            .eq('user_id', userId)
            .select()
            .single();

        if (error) {
            console.error('[PersonalizationController] Error updating profile:', error);
            return res.status(500).json({ error: 'Error al actualizar preferencias' });
        }

        res.json({
            success: true,
            message: 'Preferencias actualizadas',
            personalizationEnabled: updated.personalization_enabled
        });

    } catch (error) {
        console.error('[PersonalizationController] Error en updatePreferences:', error);
        res.status(500).json({ error: 'Error al actualizar perfil' });
    }
};

/**
 * POST /api/me/personalization/toggle
 * Activar/desactivar personalización
 */
exports.togglePersonalization = async (req, res) => {
    try {
        const userId = req.userId;
        if (!userId) {
            return res.status(401).json({ error: 'Se requiere autenticación' });
        }

        const { enabled } = req.body;
        if (typeof enabled !== 'boolean') {
            return res.status(400).json({ error: 'Se requiere enabled: boolean' });
        }

        const success = await userProfileService.togglePersonalization(userId, enabled);

        if (!success) {
            return res.status(500).json({ error: 'Error al cambiar estado' });
        }

        const country = String(req.query.country || req.headers['x-country'] || 'MX').toUpperCase();
        const isUS = country === 'US';
        
        res.json({
            success: true,
            personalizationEnabled: enabled,
            message: enabled 
                ? (isUS ? 'Personalization enabled. Results will adapt to your preferences.' : 'Personalización activada. Tus resultados se ajustarán a tus preferencias.')
                : (isUS ? 'Personalization disabled. You will see general results.' : 'Personalización desactivada. Verás resultados generales.')
        });

    } catch (error) {
        console.error('[PersonalizationController] Error en togglePersonalization:', error);
        res.status(500).json({ error: 'Error al cambiar personalización' });
    }
};

/**
 * GET /api/recommendations/personalized
 * Obtener recomendaciones personalizadas proactivas
 */
exports.getPersonalizedRecommendations = async (req, res) => {
    try {
        const userId = req.userId;
        const country = String(req.query.country || 'MX').toUpperCase();
        
        if (!userId) {
            return res.status(401).json({ error: 'Se requiere autenticación' });
        }

        const profile = await userProfileService.getOrCreateProfile(userId);
        const isUS = country === 'US';
        if (!profile || !profile.personalization_enabled) {
            return res.json({
                success: true,
                recommendations: [],
                message: isUS ? 'Enable personalization to see recommendations' : 'Activa la personalización para ver recomendaciones'
            });
        }

        // Generar recomendaciones basadas en perfil
        const recommendations = await generateRecommendations(profile, userId, country);

        res.json({
            success: true,
            recommendations,
            basedOn: {
                topCategory: Object.entries(profile.category_affinities || {})
                    .sort((a, b) => b[1] - a[1])[0]?.[0],
                topBrand: Object.entries(profile.brand_preferences || {})
                    .sort((a, b) => b[1] - a[1])[0]?.[0],
                totalSearches: profile.search_patterns?.total_searches || 0
            }
        });

    } catch (error) {
        console.error('[PersonalizationController] Error en getPersonalizedRecommendations:', error);
        res.status(500).json({ error: 'Error al generar recomendaciones' });
    }
};

/**
 * POST /api/me/search-feedback
 * Recibir feedback sobre una búsqueda para mejorar perfil
 */
exports.recordSearchFeedback = async (req, res) => {
    try {
        const userId = req.userId;
        if (!userId) {
            return res.status(401).json({ error: 'Se requiere autenticación' });
        }

        const { query, resultsCount, clickedResult, sessionDurationSec, results } = req.body;

        if (!query) {
            return res.status(400).json({ error: 'Se requiere query' });
        }

        // Actualizar perfil con esta búsqueda (incluyendo resultados para análisis de entidades)
        const updated = await userProfileService.updateProfileFromSearch(userId, {
            query,
            results: results || [], // Ahora recibe resultados reales del frontend
            clickedResult,
            sessionDurationSec: sessionDurationSec || 0
        });

        if (!updated) {
            return res.status(500).json({ error: 'Error al actualizar perfil' });
        }

        res.json({
            success: true,
            message: 'Feedback registrado',
            profileUpdated: true
        });

    } catch (error) {
        console.error('[PersonalizationController] Error en recordSearchFeedback:', error);
        res.status(500).json({ error: 'Error al registrar feedback' });
    }
};

/**
 * Generar recomendaciones basadas en perfil
 */
async function generateRecommendations(profile, userId, country) {
    const recommendations = [];
    const supabase = require('../config/supabase');
    const isUS = country === 'US';

    try {
        // 1. Recomendación por categoría preferida
        const topCategory = Object.entries(profile.category_affinities || {})
            .filter(([_, score]) => score > 0.4)
            .sort((a, b) => b[1] - a[1])[0];

        if (topCategory) {
            recommendations.push({
                type: 'category_suggestion',
                title: isUS ? `Looking for ${topCategory[0]}?` : `¿Buscas ${topCategory[0]}?`,
                reason: isUS ? 'Based on your recent searches' : 'Basado en tus búsquedas recientes',
                suggestedQuery: topCategory[0],
                confidence: topCategory[1]
            });
        }

        // 2. Recomendación por marca preferida
        const topBrand = Object.entries(profile.brand_preferences || {})
            .filter(([_, score]) => score > 0.4)
            .sort((a, b) => b[1] - a[1])[0];

        if (topBrand) {
            recommendations.push({
                type: 'brand_alert',
                title: isUS ? `${topBrand[0]} deals` : `Ofertas en ${topBrand[0]}`,
                reason: isUS ? 'Brand you like' : 'Marca que te interesa',
                suggestedQuery: topBrand[0],
                confidence: topBrand[1]
            });
        }

        // 3. Verificar productos vigilados con bajada de precio
        if (supabase) {
            const { data: priceAlerts } = await supabase
                .from('price_alerts')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(3);

            if (priceAlerts && priceAlerts.length > 0) {
                recommendations.push({
                    type: 'price_alerts',
                    title: isUS ? 'Your watched products' : 'Tus productos vigilados',
                    reason: isUS ? `${priceAlerts.length} products being tracked` : `${priceAlerts.length} productos en seguimiento`,
                    count: priceAlerts.length,
                    alerts: priceAlerts.map(a => ({
                        productName: a.product_name,
                        targetPrice: a.target_price,
                        currentPrice: a.current_price
                    }))
                });
            }
        }

        // 4. Sugerencia de accesorio (simulado - en producción sería más sofisticado)
        const recentPurchase = profile.search_patterns?.last_purchase_category;
        if (recentPurchase) {
            const accessoryMap = {
                'smartphone': {
                    es: ['funda', 'cargador', 'audífonos'],
                    en: ['case', 'charger', 'headphones']
                },
                'laptop': {
                    es: ['mochila', 'mouse', 'teclado'],
                    en: ['backpack', 'mouse', 'keyboard']
                },
                'audio': {
                    es: ['estuche', 'cable', 'adaptador'],
                    en: ['case', 'cable', 'adapter']
                }
            };
            
            const accessories = accessoryMap[recentPurchase];
            if (accessories) {
                recommendations.push({
                    type: 'accessory_suggestion',
                    title: isUS 
                        ? `Need accessories for your ${recentPurchase}?`
                        : `¿Necesitas accesorios para tu ${recentPurchase}?`,
                    reason: isUS ? 'Popular add-ons' : 'Complementos populares',
                    suggestedQueries: isUS ? accessories.en : accessories.es,
                    forCategory: recentPurchase
                });
            }
        }

    } catch (err) {
        console.error('[PersonalizationController] Error generating recommendations:', err);
    }

    return recommendations.slice(0, 4); // Máximo 4 recomendaciones
}

/**
 * POST /api/me/product-click
 * Registrar que un usuario hizo clic en un producto (para aprendizaje)
 */
exports.recordProductClick = async (req, res) => {
    try {
        const userId = req.userId;
        if (!userId) {
            return res.status(401).json({ error: 'Se requiere autenticación' });
        }

        const { productId, productTitle, productStore, productPrice, productCategory, searchQuery } = req.body;

        if (!productTitle) {
            return res.status(400).json({ error: 'Se requiere productTitle' });
        }

        // Obtener perfil y actualizar con información del click
        const profile = await userProfileService.getOrCreateProfile(userId);
        if (!profile) {
            return res.status(500).json({ error: 'Error al obtener perfil' });
        }

        // Actualizar patrones de búsqueda con click-through
        const updatedPatterns = { ...profile.search_patterns };
        const totalSearches = updatedPatterns.total_searches || 1;
        const currentCTR = updatedPatterns.click_through_rate || 0;
        updatedPatterns.click_through_rate = ((currentCTR * (totalSearches - 1)) + 1) / totalSearches;
        updatedPatterns.last_clicked_category = productCategory || updatedPatterns.last_clicked_category;
        updatedPatterns.last_purchase_category = productCategory || updatedPatterns.last_purchase_category;
        updatedPatterns.last_clicked_at = new Date().toISOString();

        // Boost afinidad de CATEGORÍA por click (señal fuerte, +0.2)
        // NOTA: NO se actualiza brand_preferences con tienda para no mezclar tiendas con marcas
        const updatedCategories = { ...profile.category_affinities };

        if (productCategory) {
            const current = updatedCategories[productCategory] || 0;
            updatedCategories[productCategory] = Math.min(1.0, current + 0.2);
        }

        // Guardar en BD
        const supabase = require('../config/supabase');
        const { error } = await supabase
            .from('user_profiles')
            .update({
                category_affinities: updatedCategories,
                search_patterns: updatedPatterns
            })
            .eq('user_id', userId);

        if (error) {
            console.error('[PersonalizationController] Error updating profile on click:', error);
            return res.status(500).json({ error: 'Error al actualizar perfil' });
        }

        res.json({
            success: true,
            message: 'Click registrado',
            productClicked: productTitle
        });

    } catch (error) {
        console.error('[PersonalizationController] Error en recordProductClick:', error);
        res.status(500).json({ error: 'Error al registrar click' });
    }
};

module.exports = exports;
