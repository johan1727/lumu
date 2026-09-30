Warning: truncated output (original token count: 42063)
Total output lines: 3250

const { availabilityOf, assessResult, rankOffers } = require('../services/resultQuality');
const { sameMarket, canCompareOfferPrices } = require('../services/marketPricing');
const { claimBonus } = require('../services/bonusService');
const llmService = require('../services/llmService');
const shoppingService = require('../services/shoppingService');
const affiliateManager = require('../utils/affiliateManager');
const cacheService = require('../services/cacheService');
const supabase = require('../config/supabase');
const profileCache = require('../utils/profileCache');
const deepResearchEnhancer = require('../services/deepResearchEnhancer');
const visionService = require('../services/visionService');
const couponService = require('../services/couponService');
const storeTrustService = require('../services/storeTrustService');
const regionConfigService = require('../services/regionConfigService');
const buyTimingService = require('../services/buyTimingService');
const userProfileService = require('../services/userProfileService');

const DEV_VIP_BYPASS = process.env.NODE_ENV !== 'production' && String(process.env.DEV_VIP_BYPASS || '').toLowerCase() === 'true';

function cleanProductTitleForUI(title = '', llmAnalysis = {}) {
    if (!title) return '';
    let cleaned = String(title).trim();
    
    if (llmAnalysis.searchQuery && llmAnalysis.queryType === 'brand_model') {
        const brandModelBase = llmAnalysis.searchQuery.replace(/\s+/g, ' ').trim();
        const specs = cleaned.match(/\b(8gb|16gb|32gb|64gb|128gb|256gb|512gb|1tb|5g|4k|8k|oled|qled|wifi|wi-fi|cellular)\b/ig);
        if (specs) {
            const uniqueSpecs = [...new Set(specs.map(s => s.toUpperCase()))].join(' - ');
            // If the original title is very long, we replace it. If it's short, maybe leave it.
            if (cleaned.length > brandModelBase.length + 15) {
                return `${brandModelBase} (${uniqueSpecs})`;
            }
        }
    }
    
    cleaned = cleaned.replace(/\b(original|nuevo|sellado|caja|garant[ií]a|meses|msi|env[ií]o gratis|oferta|descuento|remate|liquidacion|liquidaci[oó]n|promocion|promoci[oó]n|100%|importado|nacional|liberado|desbloqueado|global|version|versi[oó]n|envio inmedaito|env[ií]o inmediato)\b/gi, '')
                     .replace(/\s{2,}/g, ' ').trim();
    
    if (cleaned.length > 80) {
        cleaned = cleaned.substring(0, 77) + '...';
    }
    
    return cleaned;
}

function buildFallbackSuggestions(baseQuery, altQueries = [], countryCode = 'MX') {
    const cleanBase = String(baseQuery || '').trim();
    const isUS = countryCode === 'US';
    const baseSuggestions = cleanBase
        ? isUS
            ? [
                `${cleanBase} price`,
                `${cleanBase} deals`,
                `${cleanBase} discount`,
                `${cleanBase} local store`,
                `${cleanBase} amazon`,
                `${cleanBase} walmart`,
                `${cleanBase} target`,
                `${cleanBase} best buy`
            ]
            : [
                `${cleanBase} precio`,
                `${cleanBase} ofertas`,
                `${cleanBase} descuento`,
                `${cleanBase} tienda local`,
                `${cleanBase} mercado libre`,
                `${cleanBase} amazon`,
                `${cleanBase} walmart`,
                `${cleanBase} liverpool`
            ]
        : [];

    return [...new Set([...(altQueries || []), ...baseSuggestions])]
        .filter(Boolean)
        .slice(0, 4);
}

function buildClarifyingSuggestions(query = '', productCategory = '', countryCode = 'MX') {
    const normalized = String(query || '').trim().toLowerCase();
    const isUS = countryCode === 'US';
    const generic = [
        isUS ? 'under 300 dollars' : 'menos de 5000 pesos',
        isUS ? 'official stores only' : 'solo tiendas oficiales',
        isUS ? 'best value' : 'mejor calidad-precio',
        isUS ? 'fast shipping' : 'envío rápido'
    ];

    if (productCategory === 'smartphone' || /iphone|celular|smartphone|galaxy|xiaomi|motorola/.test(normalized)) {
        return isUS 
            ? ['under 500 dollars', 'samsung or xiaomi only', '256gb', 'best camera']
            : ['menos de 7000 pesos', 'solo samsung o xiaomi', '256gb', 'mejor cámara'];
    }
    if (productCategory === 'laptop' || /laptop|notebook|macbook|computadora/.test(normalized)) {
        return isUS
            ? ['for studying', 'for gaming', '16gb ram', 'under 1000 dollars']
            : ['para estudiar', 'para gaming', '16gb ram', 'menos de 15000 pesos'];
    }
    if (productCategory === 'audio' || /aud[ií]fonos|earbuds|airpods|bocina/.test(normalized)) {
        return isUS
            ? ['bluetooth', 'noise cancelling', 'under 150 dollars', 'best battery']
            : ['bluetooth', 'noise cancelling', 'menos de 2000 pesos', 'mejor batería'];
    }
    if (productCategory === 'fashion' || /tenis|ropa|zapatos|calzado/.test(normalized)) {
        return isUS
            ? ['nike or adidas', 'men', 'women', 'running']
            : ['nike o adidas', 'hombre', 'mujer', 'running'];
    }
    if (productCategory === 'home' || productCategory === 'appliance' || /hogar|electrodom[eé]sticos|cafetera|freidora|aspiradora/.test(normalized)) {
        return isUS
            ? ['under 200 dollars', 'for kitchen', 'best value', 'fast shipping']
            : ['menos de 3000 pesos', 'para cocina', 'mejor valor', 'envío rápido'];
    }

    return generic;
}

function isVipProfile(profile = null) {
    if (!profile) return false;
    const normalizedPlan = String(profile.plan || '').toLowerCase();
    const VIP_TEMP_DURATION_MS = 60 * 60 * 1000;
    const hasTempVIP = profile.vip_temp_unlocked_at
        && (Date.now() - new Date(profile.vip_temp_unlocked_at).getTime()) < VIP_TEMP_DURATION_MS;
    return Boolean(
        profile.is_premium
        || hasTempVIP
        || ['personal_vip', 'personal_vip_annual', 'b2b', 'b2b_annual', 'vip', 'pro'].includes(normalizedPlan)
    );
}

function tokenizeComparableText(text = '') {
    return String(text || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9+]+/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(token => token && token.length > 1);
}

function detectQueryBrand(query = '') {
    const normalized = String(query || '').toLowerCase();
    const knownBrands = ['apple', 'iphone', 'samsung', 'xiaomi', 'motorola', 'sony', 'lg', 'lenovo', 'asus', 'acer', 'hp', 'dell', 'huawei', 'google', 'nintendo', 'playstation', 'ps5', 'xbox', 'dyson', 'nikon', 'canon'];
    return knownBrands.find(brand => normalized.includes(brand)) || '';
}

function extractSpecificTokens(query = '') {
    return tokenizeComparableText(query).filter(token => {
        return /\d/.test(token)
            || /^(ultra|plus|pro|max|mini|oled|fe|air|m1|m2|m3|m4|256gb|512gb|1tb|128gb|16gb|8gb|4k)$/i.test(token)
            || /^[a-z]{1,4}\d{1,4}$/i.test(token);
    });
}

function computeModelMatchScore(title = '', query = '') {
    const titleTokens = new Set(tokenizeComparableText(title));
    const queryTokens = tokenizeComparableText(query);
    const specificTokens = extractSpecificTokens(query);
    if (queryTokens.length === 0) return 0.5;
    const overlap = queryTokens.filter(token => titleTokens.has(token)).length / queryTokens.length;
    if (specificTokens.length === 0) return Number(Math.min(1, Math.max(0, overlap)).toFixed(3));
    const specificOverlap = specificTokens.filter(token => titleTokens.has(token)).length / specificTokens.length;
    const missingCriticalVariant = specificTokens.some(token => titleTokens.has(token) === false && /^(ultra|plus|pro|max|mini|oled|fe|air)$/i.test(token));
    const variantConflict = (/\bs23\s*fe\b/i.test(title) && /\bs23\s*ultra\b/i.test(query))
        || (/\bs23\+\b/i.test(title) && /\bs23\s*ultra\b/i.test(query))
        || (/\b15\s*pro\s*max\b/i.test(query) && /\b15\s*pro\b/i.test(title) && !/\bmax\b/i.test(title));
    let score = (specificOverlap * 0.7) + (overlap * 0.3);
    if (missingCriticalVariant) score -= 0.18;
    if (variantConflict) score -= 0.24;
    return Number(Math.min(1, Math.max(0, score)).toFixed(3));
}

function computeClonePenalty(title = '', query = '') {
    const normalizedTitle = String(title || '').toLowerCase();
    const brand = detectQueryBrand(query);
    let penalty = 0;
    if (/global version|android\s*\d+\s*pro\s*max|smartphone\s*promax|telefono inteligente|dual sim fake|tel[eé]fono inteligente android/i.test(normalizedTitle)) penalty += 0.34;
    if (/8gb\+?\/?256gb|12gb\+?\/?512gb/i.test(normalizedTitle) && !/(apple|iphone|samsung|xiaomi|motorola|sony|google|oneplus|huawei)/i.test(normalizedTitle)) penalty += 0.18;
    if (brand && !normalizedTitle.includes(brand) && !(brand === 'iphone' && normalizedTitle.includes('apple'))) penalty += 0.14;
    if ((normalizedTitle.match(/smartphone|telefono|android/gi) || []).length >= 2) penalty += 0.12;
    return Number(Math.min(0.85, penalty).toFixed(3));
}

async function getSearchUnitsUsed({ userId = null, sinceIso = null } = {}) {
    if (!userId || !sinceIso || !supabase) return { used: 0, error: null };
    const { data, error } = await supabase
        .from('searches')
        .select('billed_units')
        .eq('user_id', userId)
        .gte('created_at', sinceIso);
    if (error) {
        return { used: 0, error };
    }
    const used = (data || []).reduce((sum, row) => sum + Math.max(1, Number(row?.billed_units || 1)), 0);
    return { used, error: null };
}

async function logSuccessfulSearchUsage({ userId = null, query = '', deepSearchEnabled = false, countryCode = 'MX' } = {}) {
    if (!userId || !supabase) return;
    const chargeUnits = deepSearchEnabled ? 3 : 1;
    const insertPayload = {
        user_id: userId,
        query,
        is_deep: deepSearchEnabled,
        country_code: countryCode,
        billed_units: chargeUnits,
        created_at: new Date().toISOString()
    };
    try {
        await supabase.from('searches').insert(insertPayload);
    } catch (error) {
        console.error('[Search Usage] Error logging successful search:', error.message);
    }
}

async function createVipAutoAlert({ userId = null, product = null }) {
    if (!userId || !product || !supabase) return { created: false, reason: 'not_eligible' };
    const numericPrice = Number(product.precio);
    const productUrl = String(product.urlOriginal || product.urlMonetizada || '').trim();
    const productName = String(product.titulo || '').trim().slice(0, 200);
    const storeName = String(product.tienda || '').trim().slice(0, 100) || null;
    if (!productName || !Number.isFinite(numericPrice) || numericPrice < 500) {
        return { created: false, reason: 'low_signal_product' };
    }
    try {
        let existingQuery = supabase
            .from('price_alerts')
            .select('id', { head: true, count: 'exact' })
            .eq('user_id', userId)
            .eq('triggered', false);
        if (productUrl) {
            existingQuery = existingQuery.eq('product_url', productUrl);
        } else {
            existingQuery = existingQuery.ilike('product_name', productName);
        }
        const { count, error: existingError } = await existingQuery;
        if (existingError) return { created: false, reason: 'lookup_failed' };
        if ((count || 0) > 0) return { created: false, reason: 'already_exists' };
        const targetPrice = Number((numericPrice * 0.85).toFixed(2));
        const { error: insertError } = await supabase
            .from('price_alerts')
            .insert({
                user_id: userId,
                product_name: productName,
                target_price: targetPrice,
                product_url: productUrl || null,
                store_name: storeName
            });
        if (insertError) return { created: false, reason: 'insert_failed' };
        return { created: true, targetPrice };
    } catch {
        return { created: false, reason: 'unexpected_error' };
    }
}

function buildBestBuyScore(product = {}, deepMode = false, countryCode = 'MX') {
    const isVerifiedMeliApi = product.resultSource === 'meli_api';
    const isVerifiedAmazonApi = product.resultSource === 'amazon_serpapi';
    const meliPriorityBoost = Math.max(0, Number(product._meliPriorityBoost || 0));
    const meliHardPenalty = Math.max(0, Number(product._meliAccessoryPenalty || 0)) + Math.max(0, Number(product._meliGameContentPenalty || 0)) + Math.max(0, Number(product._meliGenericTitlePenalty || 0)) + Math.max(0, Number(product._meliCategoryPenalty || 0));
    const priceConfidence = Math.min(1, Math.max(0, Number(product.priceConfidence || 0)));
    const matchScore = Math.min(1, Math.max(0, Number(product.matchScore || 0)));
    const modelMatchScore = Math.min(1, Math.max(0, Number(product._modelMatchScore != null ? product._modelMatchScore : 0.55)));
    const specificity = Math.min(1, Math.max(0, Number(product.productSpecificity || 0)));
    const comparability = Math.min(1, Math.max(0, Number(product.structuredTokenOverlap || 0)));
    const hasPurchasableSignal = Boolean(product.precio != null || product.price != null || product.isLocalStore || product.hasStockSignal || product.shippingText);
    const isInformational = looksInformationalResult({
        title: product.titulo || product.title,
        snippet: product.shippingText || product.snippet,
        url: product.urlOriginal || product.urlMonetizada || product.url
    });
    // NUEVO: Trust score mejorado para México - elevar ML y Amazon MX, penalizar importación
    const isMexicanStore = product.canonicalStore === 'mercado libre' || 
                           product.canonicalStore === 'amazon' && /amazon\.com\.mx/i.test(product.urlOriginal || product.url || '') ||
                           ['walmart', 'liverpool', 'coppel', 'costco', "sam's club", 'elektra', 'best buy'].includes(product.canonicalStore);
    const isImportStore = ['aliexpress', 'temu', 'shein', 'wish', 'shopee'].includes(product.canonicalStore);
    const hasMexicanShipping = countryCode === 'MX' ? hasMexicanShippingSignal(product, countryCode) : true;
    let trustScore = product.storeTier === 1 ? 1 : product.storeTier === 2 ? 0.72 : 0.38;
    // Boost para tiendas mexicanas verificadas
    if (isVerifiedMeliApi || isVerifiedAmazonApi) trustScore = Math.min(1, trustScore + 0.08);
    if (isMexicanStore && hasMexicanShipping === true) trustScore = Math.min(1, trustScore + 0.04);
    // Penalización para importaciones sin envío claro a México
    if (countryCode === 'MX' && isImportStore) {
        if (hasMexicanShipping === false) trustScore = Math.max(0.15, trustScore - 0.25);
        else if (hasMexicanShipping === null) trustScore = Math.max(0.25, trustScore - 0.15);
    }
    const availabilityScore = product.isPotentiallyUnavailable ? 0.2 : (product.hasStockSignal ? 1 : 0.62);
    const ephemeralPenalty = product.hasEphemeralRedirect && !product.hasStockSignal && product.priceConfidence < 0.5 ? 0.22 : (product.hasEphemeralRedirect ? 0.08 : 0);
    const titleText = String(product.titulo || product.title || '').toLowerCase();
    const queryText = String(product.query || product.searchQuery || product.originalQuery || '').toLowerCase();
    const productCategory = String(product.productCategory || '').toLowerCase();
    const queryLooksLikeConsoleSearch = productCategory === 'gaming' && /\b(xbox|series\s*[xs]|playstation|ps5|ps4|nintendo\s+switch|switch|steam\s*deck|consola)\b/i.test(queryText) && !/\b(juego|videojuego|game|bundle|pack|dlc|season\s+pass|codigo|c[oó]digo|key|gift\s*card|tarjeta\s+de\s+regalo)\b/i.test(queryText);
    const gameContentPenalty = !isVerifiedMeliApi && queryLooksLikeConsoleSearch && /\b(juego|videojuego|game\s+pass|game\s+key|gift\s*card|tarjeta\s+de\s+regalo|season\s+pass|dlc|expansi[oó]n|expansion|moneda\s+virtual|skin|c[oó]digo\s+digital|digital\s+key|c[oó]digo\s+de\s+activaci[oó]n|codigo\s+de\s+activacion)\b/i.test(titleText) ? 0.3 : 0;
    // NUEVO: Shipping score mejorado para México
    let shippingScore = product.shippingText
        ? (/env[ií]o gratis|llega hoy|llega ma[ñn]ana|same day|free shipping|arrives? tomorrow/i.test(String(product.shippingText)) ? 1 : 0.72)
        : 0.55;
    // Penalizar si no hay señal de envío a México
    if (countryCode === 'MX' && hasMexicanShipping === false) shippingScore = Math.max(0.25, shippingScore - 0.3);
    else if (countryCode === 'MX' && hasMexicanShipping === null) shippingScore = Math.max(0.4, shippingScore - 0.15);
    const dealScore = product.dealVerdict?.status === 'real_deal'
        ? 1
        : product.dealVerdict?.status === 'normal_price'
            ? 0.65
            : product.dealVerdict?.status === 'above_average'
                ? 0.35
                : product.dealVerdict?.status === 'suspicious_discount'
                    ? 0.2
                    : 0.5;
    const penalty = (product.isSuspicious ? 0.18 : 0)
        + (product.isPriceAnomaly ? 0.16 : 0)
        + ephemeralPenalty
        + Number(product._clonePenalty || 0)
        + (product.isC2C ? 0.12 : 0)
        + (!hasPurchasableSignal ? 0.18 : 0)
        + (isInformational ? 0.4 : 0)
        + (!product.isLocalStore && !product.precio && !product.price && !product.shippingText ? 0.16 : 0)
        + gameContentPenalty
        + meliHardPenalty;

    if (deepMode) {
        // Deep Research: price rank is the dominant signal (~32% combined)
        // priceRank (0-1) is computed externally and attached to product before scoring
        const priceRank = Math.min(1, Math.max(0, Number(product._deepPriceRank || 0)));
        const rawScore = (priceRank * 0.18)
            + (priceConfidence * 0.14)
            + (matchScore * 0.10)
            + (modelMatchScore * 0.12)
            + (dealScore * 0.14)
            + (trustScore * 0.10)
            + (specificity * 0.10)
            + (comparability * 0.08)
            + (availabilityScore * 0.07)
            + (shippingScore * 0.05);
        return Number(Math.max(0, Math.min(1, rawScore - penalty + (isVerifiedMeliApi ? 0.04 : 0) + meliPriorityBoost)).toFixed(3));
    }

    const rawScore = (priceConfidence * 0.16)
        + (matchScore * 0.16)
        + (modelMatchScore * 0.12)
        + (specificity * 0.12)
        + (comparability * 0.12)
        + (trustScore * 0.16)
        + (availabilityScore * 0.10)
        + (shippingScore * 0.05)
        + (dealScore * 0.07);
    return Number(Math.max(0, Math.min(1, rawScore - penalty + (isVerifiedMeliApi ? 0.04 : 0) + Math.min(0.04, meliPriorityBoost))).toFixed(3));
}

function buildBestBuyLabel(score = 0) {
    if (score >= 0.84) return 'Excelente compra';
    if (score >= 0.72) return 'Mejor opción';
    if (score >= 0.58) return 'Buena opción';
    return 'Opción aceptable';
}

// NUEVO: Comparador central barato + relevante + confiable + tienda preferida
function compareCheapestRelevant(a, b, options = {}) {
    const {
        preferredStoreKeys = [],
        countryCode = 'MX',
        prioritizePrice = false
    } = options;

    const aPrice = Number(a.precio || a.price || 0);
    const bPrice = Number(b.precio || b.price || 0);
    const aHasPrice = aPrice > 0;
    const bHasPrice = bPrice > 0;

    // 1. Prioridad: Tienda preferida con buen match
    const aIsPreferred = preferredStoreKeys.includes(a.canonicalStore);
    const bIsPreferred = preferredStoreKeys.includes(b.canonicalStore);
    const aGoodMatch = (a._modelMatchScore || 0) >= 0.35;
    const bGoodMatch = (b._modelMatchScore || 0) >= 0.35;
    const aConfident = (a.priceConfidence || 0) >= 0.5;
    const bConfident = (b.priceConfidence || 0) >= 0.5;

    const aPreferredValid = aIsPreferred && aGoodMatch && aConfident && !a.isPotentiallyUnavailable;
    const bPreferredValid = bIsPreferred && bGoodMatch && bConfident && !b.isPotentiallyUnavailable;

    if (aPreferredValid !== bPreferredValid) return bPreferredValid - aPreferredValid;

    // 2. Prioridad: Fuentes verificadas (API)
    const sourceRank = {
        'meli_api': 0,
        'amazon_serpapi': 1,
        'shopping_api': 2,
        'direct_scraper': 3,
        'official_web': 4,
        'web_search': 5
    };
    const aSourceRank = sourceRank[a.resultSource] ?? 99;
    const bSourceRank = sourceRank[b.resultSource] ?? 99;
    if (aSourceRank !== bSourceRank) return aSourceRank - bSourceRank;

    // 3. Prioridad: Precio (si ambos tienen precio válido)
    if (aHasPrice && bHasPrice) {
        // Solo comparar precio si la diferencia de relevancia no es muy grande
        const matchDiff = Math.abs((a._modelMatchScore || 0) - (b._modelMatchScore || 0));
        if ((matchDiff < 0.25 || prioritizePrice) && canCompareOfferPrices(a, b)) {
            if (aPrice !== bPrice) return aPrice - bPrice;
        }
    } else if (aHasPrice !== bHasPrice) {
        return aHasPrice ? -1 : 1;
    }

    // 4. Prioridad: Confianza de precio
    const aConf = Number(a.priceConfidence || 0);
    const bConf = Number(b.priceConfidence || 0);
    if (Math.abs(aConf - bConf) >= 0.1) return bConf - aConf;

    // 5. Prioridad: Match del modelo
    const aMatch = Number(a._modelMatchScore || 0);
    const bMatch = Number(b._modelMatchScore || 0);
    if (Math.abs(aMatch - bMatch) >= 0.15) return bMatch - aMatch;

    // 6. Prioridad: Score general
    const aScore = Number(a.bestBuyScore || 0);
    const bScore = Number(b.bestBuyScore || 0);
    if (Math.abs(aScore - bScore) >= 0.05) return bScore - aScore;

    // 7. Desempate final: más barato
    if (aHasPrice && bHasPrice && aPrice !== bPrice && canCompareOfferPrices(a, b)) return aPrice - bPrice;

    return 0;
}

function buildIntentMemoryBoost(row = {}, maxClicks = 1, maxSuccessScore = 1) {
    const clicks = Math.max(0, Number(row.clicked_count || 0));
    const successScore = Math.max(0, Number(row.success_score || 0));
    const clickRatio = maxClicks > 0 ? (clicks / maxClicks) : 0;
    const successRatio = maxSuccessScore > 0 ? (successScore / maxSuccessScore) : 0;
    const combinedSignal = (clickRatio * 0.58) + (successRatio * 0.42);
    return -Math.min(260, Math.round(combinedSignal * 260));
}

function buildIntentMemoryMeta(storeKey = '', intentBoostMap = {}, intentSignalMetaMap = {}) {
    return {
        rerankBoost: intentBoostMap[storeKey] || 0,
        successScore: Number(intentSignalMetaMap[storeKey]?.successScore || 0),
        clickedCount: Number(intentSignalMetaMap[storeKey]?.clickedCount || 0)
    };
}

// NUEVO: Encuentra el mejor resultado de tienda preferida (más barato relevante)
function findBestPreferredResult(results = [], preferredStoreKeys = [], minConfidence = 0.5) {
    if (!preferredStoreKeys || preferredStoreKeys.length === 0) return null;
    const preferredResults = results.filter(r => {
        const isPreferred = preferredStoreKeys.includes(r.canonicalStore);
        const hasGoodMatch = (r._modelMatchScore || 0) >= 0.35;
        const hasConfidentPrice = (r.priceConfidence || 0) >= minConfidence;
        const isAvailable = !r.isPotentiallyUnavailable && r.hasStockSignal !== false;
        return isPreferred && hasGoodMatch && hasConfidentPrice && isAvailable;
    });
    if (preferredResults.length === 0) return null;
    // FIX: Ordenar por precio primero entre resultados comparables (match similar)
    // Luego por confianza de precio, luego por match
    preferredResults.sort((a, b) => {
        const aPrice = Number(a.precio || a.price || Number.MAX_SAFE_INTEGER);
        const bPrice = Number(b.precio || b.price || Number.MAX_SAFE_INTEGER);
        const aMatch = a._modelMatchScore || 0;
        const bMatch = b._modelMatchScore || 0;
        const matchDiff = Math.abs(aMatch - bMatch);
        
        // Si el match es similar (diferencia < 0.2), priorizar el más barato
        if (matchDiff < 0.2 && aPrice !== bPrice && c…30063 tokens truncated…cking)
        if (balancedProducts.length > 0 && balancedProducts[0].urlOriginal) {
            try {
                const predictionTimeout = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Prediction timeout')), 3000)
                );
                const predictionPromise = buyTimingService.getQuickPredictionForWinner(
                    balancedProducts[0],
                    searchQuery,
                    countryCode
                );
                const prediction = await Promise.race([predictionPromise, predictionTimeout]);
                if (prediction) {
                    res.locals.buyTimingPrediction = prediction;
                }
            } catch (predErr) {
                console.log('[Search] Buy timing prediction skipped:', predErr.message);
            }
        }

        // Apply personalization re-ranking if user is authenticated
        // NOTE: Profile update happens via POST /api/me/search-feedback from frontend
        // to avoid double-counting searches and to capture real sessionDurationSec.
        let personalizedProducts = balancedProducts;
        let personalizationApplied = false;
        if (userId && balancedProducts.length > 0) {
            try {
                const reRanked = await userProfileService.personalizeResults(userId, balancedProducts);
                if (reRanked && reRanked.length > 0) {
                    personalizedProducts = reRanked;
                    personalizationApplied = true;
                }
            } catch (personalizationErr) {
                console.log('[Search] Personalization skipped:', personalizationErr.message);
            }
        }

        personalizedProducts = rankOffers(personalizedProducts, shoppingBaseQuery || query, {conditionMode});

        return res.json({
            tipo_respuesta: 'resultados',
            intencion_detectada: {
                busqueda: searchQuery,
                condicion: llmAnalysis.condition,
                modo_condicion: conditionMode,
                tienda_preferida: searchPolicy.preferredStoreKey || null,
                tiendas_preferidas: searchPolicy.preferredStoreKeys || [],
                modo_tienda_preferida: (searchPolicy.preferredStoreKeys || []).length > 0 ? searchPolicy.preferredStoreMode : null
            },
            search_metadata: {
                canonical_key: llmAnalysis.canonicalKey,
                product_category: llmAnalysis.productCategory || '',
                max_budget: llmAnalysis.maxBudget || null,
                ai_summary: llmAnalysis.aiSummary,
                is_comparison: llmAnalysis.isComparison,
                comparison_products: llmAnalysis.comparisonProducts,
                query_type: llmAnalysis.queryType,
                is_speculative: llmAnalysis.isSpeculative,
                needs_disambiguation: llmAnalysis.needsDisambiguation,
                disambiguation_options: llmAnalysis.disambiguationOptions,
                commercial_readiness: llmAnalysis.commercialReadiness,
                reasoning: llmAnalysis.reasoning || null,
                search_tier: effectiveSearchTier,
                deep_search_enabled: deepSearchEnabled,
                billed_search_units: deepSearchEnabled ? 3 : 1,
                estimated_cost_usd: estimatedCostUsd,
                estimated_cost_breakdown: buildCostBreakdown(costMetrics),
                preferred_store_key: searchPolicy.preferredStoreKey || null,
                preferred_store_keys: searchPolicy.preferredStoreKeys || [],
                preferred_store_mode: (searchPolicy.preferredStoreKeys || []).length > 0 ? searchPolicy.preferredStoreMode : null,
                safe_stores_only: searchPolicy.safeStoresOnly,
                include_known_marketplaces: searchPolicy.includeKnownMarketplaces,
                include_high_risk_marketplaces: searchPolicy.includeHighRiskMarketplaces,
                cache_status: cacheStatus
            },
            deep_research_analysis: deepResearchEnhancements?.comparativeAnalysis || null,
            ai_pick: deepResearchEnhancements?.comparativeAnalysis
                ? {
                    best_option_rank: deepResearchEnhancements.comparativeAnalysis.bestOptionRank,
                    reasoning: deepResearchEnhancements.comparativeAnalysis.reasoning,
                    price_comparison: deepResearchEnhancements.comparativeAnalysis.priceComparison,
                    recommendation: deepResearchEnhancements.comparativeAnalysis.recommendation
                }
                : null,
            suggested_variants: deepResearchEnhancements?.suggestedVariants || null,
            best_buy_pick: personalizedProducts.length > 0
                ? {
                    title: cleanProductTitleForUI(personalizedProducts[0].titulo || personalizedProducts[0].title, llmAnalysis),
                    store: personalizedProducts[0].tienda,
                    price: personalizedProducts[0].precio,
                    score: personalizedProducts[0].bestBuyScore,
                    label: personalizedProducts[0].bestBuyLabel,
                    url: personalizedProducts[0].urlMonetizada || personalizedProducts[0].urlOriginal,
                    winner_reason: personalizedProducts[0].winnerReason,
                    is_preferred_store: personalizedProducts[0].isPreferredStoreResult,
                    savings_vs_preferred: personalizedProducts[0].savingsVsPreferred,
                    price_confidence_label: personalizedProducts[0].priceConfidenceLabel,
                    buy_timing_prediction: res.locals?.buyTimingPrediction || null,
                    is_personalized: personalizedProducts[0]._isPersonalized || false,
                    personalized_reason: personalizedProducts[0]._personalizedReason || null
                }
                : null,
            // NUEVO: Metadata de tienda preferida y alternativa más barata
            preferred_store_summary: bestPreferredResult
                ? {
                    has_preferred_result: true,
                    best_preferred: {
                        title: cleanProductTitleForUI(bestPreferredResult.titulo || bestPreferredResult.title, llmAnalysis),
                        store: bestPreferredResult.canonicalStore,
                        price: bestPreferredResult.precio,
                        url: bestPreferredResult.urlMonetizada || bestPreferredResult.urlOriginal,
                        match_score: bestPreferredResult._modelMatchScore,
                        price_confidence: bestPreferredResult.priceConfidence,
                        winner_reason: bestPreferredResult.winnerReason
                    },
                    cheaper_alternative: bestCheaperAlternative
                        ? {
                            title: cleanProductTitleForUI(bestCheaperAlternative.titulo || bestCheaperAlternative.title, llmAnalysis),
                            store: bestCheaperAlternative.canonicalStore,
                            price: bestCheaperAlternative.precio,
                            url: bestCheaperAlternative.urlMonetizada || bestCheaperAlternative.urlOriginal,
                            savings_amount: Math.round((bestPreferredResult.precio || bestPreferredResult.price || 0) - (bestCheaperAlternative.precio || bestCheaperAlternative.price || 0)),
                            savings_pct: Math.round((((bestPreferredResult.precio || bestPreferredResult.price || 0) - (bestCheaperAlternative.precio || bestCheaperAlternative.price || 0)) / (bestPreferredResult.precio || bestPreferredResult.price || 1)) * 100),
                            match_score: bestCheaperAlternative._modelMatchScore,
                            price_confidence: bestCheaperAlternative.priceConfidence,
                            price_confidence_label: bestCheaperAlternative.priceConfidenceLabel
                        }
                        : null,
                    message: bestCheaperAlternative
                        ? `Encontré ${bestPreferredResult.canonicalStore} a $${Math.round(bestPreferredResult.precio || bestPreferredResult.price || 0)}, pero hay una alternativa ${bestCheaperAlternative.savingsVsPreferred?.pct || 0}% más barata en ${bestCheaperAlternative.canonicalStore}.`
                        : `El mejor resultado en tu tienda preferida ${bestPreferredResult.canonicalStore} es este:`
                }
                : {
                    has_preferred_result: false,
                    message: searchPolicy.preferredStoreKeys?.length > 0
                        ? `No encontré buenos resultados en ${searchPolicy.preferredStoreKeys.join(', ')}. Te muestro las mejores alternativas disponibles.`
                        : null
                },
            region: {
                country: countryCode,
                currency: regionCfg.currency,
                locale: regionCfg.locale,
                label: regionCfg.regionLabel
            },
            top_5_baratos: personalizedProducts.map(p => ({ ...p, titulo: cleanProductTitleForUI(p.titulo || p.title, llmAnalysis) })),
            top_resultados: [],
            personalization: {
                applied: personalizationApplied,
                user_id: userId || null,
                top_personalized_product: personalizedProducts.find(p => p._isPersonalized)?.titulo || null
            },
            vip_auto_alert: vipAutoAlert,
            advertencia_uso: usageWarning,
            lumu_coins_awarded: userId ? 1 : 0
        });
    } catch (error) {
        // Clear timeout on error
        if (typeof timeoutId !== 'undefined') clearTimeout(timeoutId);
        
        // Classify error source for better diagnostics
        const errMsg = error.message || String(error);
        const errSource = /gemini|generativelanguage/i.test(errMsg) ? 'gemini_api'
            : /serper|google\.serper/i.test(errMsg) ? 'serper_api'
            : /supabase|postgres/i.test(errMsg) ? 'supabase'
            : /timeout|ETIMEDOUT|AbortError/i.test(errMsg) ? 'timeout'
            : /rate.?limit|429/i.test(errMsg) ? 'rate_limit'
            : 'unknown';
        console.error(`[ERROR FATAL /buscar] source=${errSource} query="${query}" msg=${errMsg}`, error.stack ? `\n${error.stack}` : '');
        try {
            logSearchCostMetrics('search.error', costMetrics, {
                query,
                userId: Boolean(userId),
                error: errMsg,
                error_source: errSource
            });
        } catch { }
        
        // No exponer stack trace en produccion
        const isDev = process.env.NODE_ENV !== 'production';
        res.status(500).json({ 
            error: 'Ocurrió un error al buscar las mejores ofertas. Si estás probando en local, asegúrate de configurar las variables de entorno.',
            ...(isDev && { details: errMsg, error_source: errSource, stack: error.stack })
        });
    }
};

// NUEVO: Endpoint para B2B Bulk Search (Plan Revendedor)
exports.bulkSearch = async (req, res) => {
    let bulkCostMetrics = createSearchCostMetrics();
    try {
        const { queries, radius, lat, lng } = req.body;
        // Use verified userId from auth middleware (JWT)
        const userId = req.userId || null;
        if (!userId) {
            return res.status(401).json({ error: 'Debes iniciar sesión para usar el Plan Revendedor.' });
        }
        if (!supabase) {
            return res.status(503).json({ error: 'Base de datos no disponible' });
        }
        const profile = await profileCache.getProfile(supabase, userId, 'plan, is_premium');
        if (!profile || (profile.plan !== 'b2b' && profile.plan !== 'b2b_annual')) {
            return res.status(402).json({ error: 'Esta función es exclusiva del Plan Revendedor VIP ($199 MXN/mes). Actualiza tu cuenta para acceder.', upgrade_required: true });
        }

        // --- Verificación de Límite Mensual B2B ---
        let reqLimit = 200;
        let queryDate = new Date();
        queryDate.setDate(1);
        queryDate.setHours(0, 0, 0, 0);

        const { count, error } = await supabase.from('searches')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .gte('created_at', queryDate.toISOString());

        // Hard limit: max 5 queries per request (Vercel 60s timeout)
        const queriesToProcess = queries.slice(0, 5);

        let usageWarning = null;
        if (!error) {
            if (count + queriesToProcess.length > reqLimit) {
                const remaining = Math.max(0, reqLimit - count);
                return res.status(402).json({ error: `Límite mensual B2B alcanzado. Te quedan ${remaining} búsqueda(s) disponibles (${count}/${reqLimit}).`, upgrade_required: false });
            }
            if (count >= reqLimit * 0.9) {
                usageWarning = `⚠️ Límite mensual al ${Math.floor((count / reqLimit) * 100)}% (${count}/${reqLimit}).`;
            }
        }

        console.log(`[B2B BULK SEARCH] Procesando lote de ${queriesToProcess.length} artículos en paralelo...`);

        // Process all queries in parallel with individual timeouts
        const QUERY_TIMEOUT = 10000; // 10s per query
        const bulkPromises = queriesToProcess.map(async (q) => {
            try {
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Timeout')), QUERY_TIMEOUT)
                );

                const searchPromise = (async () => {
                    bulkCostMetrics.llmGenerateCalls += 1;
                    if (supabase) bulkCostMetrics.llmEmbeddingCalls += 1;
                    const llmAnalysis = await llmService.analyzeMessage(q, []);
                    
                    // Track LLM cache hits
                    if (llmAnalysis._cacheHit) {
                        bulkCostMetrics.llmCacheHits += 1;
                        bulkCostMetrics.llmGenerateCalls -= 1;
                        if (supabase) bulkCostMetrics.llmEmbeddingCalls -= 1;
                    }
                    const searchQuery = llmAnalysis.searchQuery || q;

                    // Cache check first
                    const cachedResults = await cacheService.getCachedResults(searchQuery, radius, lat, lng);
                    if (cachedResults && cachedResults[0]) {
                        bulkCostMetrics.cacheHit = true;
                        return { ...cachedResults[0], desde_cache: true };
                    }

                    // Real search
                    bumpProviderCostMetrics(bulkCostMetrics, { intentType: llmAnalysis.intent_type, radius, lat, lng });
                    const shoppingResults = await shoppingService.searchGoogleShopping(searchQuery, radius, lat, lng);
                    if (shoppingResults.length > 0) {
                        const sortedResults = shoppingResults.sort((a, b) => {
                            if (a.price == null) return 1;
                            if (b.price == null) return -1;
                            return a.price - b.price;
                        });
                        const cheapest = sortedResults[0];
                        const topResult = {
                            titulo: cheapest.title,
                            precio: cheapest.price,
                            tienda: cheapest.source,
                            imagen: cheapest.image,
                            urlOriginal: cheapest.url,
                            urlMonetizada: affiliateManager.generateAffiliateLink(cheapest.url, cheapest.source),
                            desde_cache: false
                        };
                        // Save to cache async
                        cacheService.saveToCache(searchQuery, radius, lat, lng, [topResult]).catch(() => { });
                        return topResult;
                    }
                    return null;
                })();

                const result = await Promise.race([searchPromise, timeoutPromise]);
                return { query_original: q, encontrado: !!result, mejor_oferta: result };
            } catch (err) {
                console.error(`Error procesando item B2B "${q}": `, err.message);
                return { query_original: q, encontrado: false, error: err.message === 'Timeout' ? 'Tiempo agotado' : 'Fallo al extraer datos' };
            }
        });

        const bulkResults = await Promise.all(bulkPromises);

        // Charge usage AFTER successful processing (not before)
        const successCount = bulkResults.filter(r => r.encontrado).length;
        if (supabase && successCount > 0) {
            const inserts = bulkResults
                .filter(r => r.encontrado)
                .map(r => ({ user_id: userId, query: r.query_original }));
            supabase.from('searches').insert(inserts).then(() => { }).catch(e => console.error('Bulk insert error:', e));
        }

        logSearchCostMetrics('bulk.results', bulkCostMetrics, {
            userId: Boolean(userId),
            requestedCount: Array.isArray(queries) ? queries.length : 0,
            processedCount: bulkResults.length,
            successCount
        });
        return res.json({
            lote_procesado: bulkResults.length,
            resultados: bulkResults,
            ...(usageWarning ? { usageWarning } : {})
        });

    } catch (error) {
        console.error('Error en /bulk-search:', error);
        try {
            logSearchCostMetrics('bulk.error', bulkCostMetrics, {
                error: error.message
            });
        } catch { }
        res.status(500).json({ error: 'Error del servidor en bulk search.' });
    }
};

exports.claimReward = async (req, res) => {
    if (!req.userId) return res.status(401).json({ error: 'Inicia sesión para reclamar este bono.' });
    if (!String(process.env.REWARDED_AD_TAG_URL || '').trim()) return res.status(409).json({ error: 'Las búsquedas extra por anuncio no están disponibles actualmente.' });
    try {
        const result = await claimBonus(supabase, req.userId, 'reward', null);
        return res.status(result.status).json(result.body);
    } catch (error) {
        return res.status(503).json({ error: 'Los bonos no están disponibles temporalmente. Intenta más tarde.' });
    }
};

// NUEVO: Fase 6 - Lumu Coins (with real 1-hour VIP unlock)
// ─── Referral System ────────────────────────────────────────────────────────

exports.getReferralCode = async (req, res) => {
    const userId = req.userId || null;
    if (!userId) return res.status(401).json({ error: 'Inicia sesión para obtener tu código de referido.' });
    if (!supabase) return res.status(503).json({ error: 'Base de datos no disponible.' });

    try {
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('referral_code')
            .eq('id', userId)
            .single();

        if (error) throw error;

        let code = profile?.referral_code;
        if (!code) {
            // Generar código único de 8 chars basado en userId
            code = userId.replace(/-/g, '').slice(0, 8).toUpperCase();
            // Verificar unicidad y agregar sufijo si colisiona
            const { data: collision } = await supabase
                .from('profiles')
                .select('id')
                .eq('referral_code', code)
                .neq('id', userId)
                .maybeSingle();
            if (collision) code = code.slice(0, 6) + Math.floor(Math.random() * 99).toString().padStart(2, '0');

            await supabase.from('profiles').update({ referral_code: code }).eq('id', userId);
        }

        const appUrl = process.env.PUBLIC_APP_URL || 'https://www.lumu.dev';
        return res.json({ code, url: `${appUrl}/?ref=${code}` });
    } catch (err) {
        console.error('[Referral] getReferralCode error:', err);
        return res.status(500).json({ error: 'No se pudo obtener el código de referido.' });
    }
};

exports.claimReferral = async (req, res) => {
    if (!req.userId) return res.status(401).json({ error: 'Inicia sesión para reclamar este bono.' });
    if (typeof req.body?.code !== 'string' || !/^[A-Z0-9]{1,32}$/i.test(req.body.code.trim())) return res.status(400).json({ error: 'Código de referido inválido.' });
    try {
        const result = await claimBonus(supabase, req.userId, 'referral', req.body.code.trim().toUpperCase());
        return res.status(result.status).json(result.body);
    } catch (error) {
        return res.status(503).json({ error: 'Los bonos no están disponibles temporalmente. Intenta más tarde.' });
    }
};

exports.claimSignupBonus = async (req, res) => {
    if (!req.userId) return res.status(401).json({ error: 'Inicia sesión para reclamar este bono.' });
    try {
        const result = await claimBonus(supabase, req.userId, 'signup', null);
        return res.status(result.status).json(result.body);
    } catch (error) {
        return res.status(503).json({ error: 'Los bonos no están disponibles temporalmente. Intenta más tarde.' });
    }
};

exports.getCoins = async (req, res) => {
    try {
        const userId = req.userId;
        if (!userId) {
            return res.json({ coins: 0, is_premium_temp: false });
        }
        if (!supabase) {
            return res.json({ coins: 0, is_premium_temp: false });
        }

        // Coins = Total de búsquedas válidas realizadas
        const { count, error } = await supabase.from('searches')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId);

        if (error) {
            console.error('[Lumu Coins] Error:', error.message);
            return res.status(500).json({ error: 'Error al obtener monedas' });
        }

        const exactCoins = count || 0;
        const currentCoins = exactCoins % 50;
        const totalVIPUnlocked = Math.floor(exactCoins / 50);

        // SEC-3: Check if temp VIP is currently active (1 hour window)
        const VIP_TEMP_DURATION_MS = 60 * 60 * 1000; // 1 hour
        const { data: profile } = await supabase.from('profiles')
            .select('vip_temp_unlocked_at, vip_temp_last_milestone')
            .eq('id', userId).single();

        const lastUnlock = profile?.vip_temp_unlocked_at ? new Date(profile.vip_temp_unlocked_at).getTime() : 0;
        const isActiveTemp = lastUnlock > 0 && (Date.now() - lastUnlock) < VIP_TEMP_DURATION_MS;
        const timeRemainingMs = isActiveTemp ? VIP_TEMP_DURATION_MS - (Date.now() - lastUnlock) : 0;
        const lastMilestone = Number(profile?.vip_temp_last_milestone || 0);
        const currentMilestone = totalVIPUnlocked;

        // Unlock temp VIP only when the user reaches a NEW 50-search milestone.
        if (currentMilestone > 0 && currentMilestone > lastMilestone) {
            const now = new Date().toISOString();
            await supabase.from('profiles')
                .update({
                    vip_temp_unlocked_at: now,
                    vip_temp_last_milestone: currentMilestone
                })
                .eq('id', userId);

            return res.json({
                total_searches: exactCoins,
                coins: currentCoins,
                is_premium_temp: true,
                vip_temp_remaining_min: 60,
                next_goal: 50
            });
        }

        return res.json({
            total_searches: exactCoins,
            coins: currentCoins,
            is_premium_temp: isActiveTemp,
            vip_temp_remaining_min: isActiveTemp ? Math.ceil(timeRemainingMs / 60000) : 0,
            next_goal: 50
        });

    } catch (err) {
        console.error('[Lumu Coins] TryCatch Error:', err);
        return res.status(500).json({ error: 'Fallo interno' });
    }
};
