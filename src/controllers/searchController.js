const llmService = require('../services/llmService');
const shoppingService = require('../services/shoppingService');
const affiliateManager = require('../utils/affiliateManager');
const cacheService = require('../services/cacheService');
const supabase = require('../config/supabase');
const deepResearchEnhancer = require('../services/deepResearchEnhancer');
const visionService = require('../services/visionService');
const couponService = require('../services/couponService');
const storeTrustService = require('../services/storeTrustService');
const regionConfigService = require('../services/regionConfigService');

const DEV_VIP_BYPASS = process.env.NODE_ENV !== 'production' && String(process.env.DEV_VIP_BYPASS || '').toLowerCase() === 'true';

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
        || ['personal_vip', 'personal_vip_annual', 'b2b', 'b2b_annual'].includes(normalizedPlan)
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

function buildBestBuyScore(product = {}, deepMode = false) {
    const isVerifiedMeliApi = product.resultSource === 'meli_api';
    const meliPriorityBoost = Math.max(0, Number(product._meliPriorityBoost || 0));
    const meliHardPenalty = Math.max(0, Number(product._meliAccessoryPenalty || 0)) + Math.max(0, Number(product._meliGenericTitlePenalty || 0)) + Math.max(0, Number(product._meliCategoryPenalty || 0));
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
    const trustScore = product.storeTier === 1 ? 1 : product.storeTier === 2 ? 0.72 : 0.38;
    const availabilityScore = product.isPotentiallyUnavailable ? 0.2 : (product.hasStockSignal ? 1 : 0.62);
    const ephemeralPenalty = product.hasEphemeralRedirect && !product.hasStockSignal && product.priceConfidence < 0.5 ? 0.22 : (product.hasEphemeralRedirect ? 0.08 : 0);
    const shippingScore = product.shippingText
        ? (/env[ií]o gratis|llega hoy|llega ma[ñn]ana|same day|free shipping|arrives? tomorrow/i.test(String(product.shippingText)) ? 1 : 0.72)
        : 0.55;
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

function looksLikeUrlPlaceholder(text = '') {
    return /\[filtered url\]/i.test(String(text || ''));
}

function isWeakCommerceIntent(text = '') {
    const normalized = String(text || '').toLowerCase().trim();
    if (!normalized) return true;
    if (looksLikeUrlPlaceholder(normalized)) return true;
    if (/^(pero|ok|hola|hello|gracias|thanks|hi)$/i.test(normalized)) return true;
    if (/\b(ignore|recithe|recite|divine comedy|prompt)\b/i.test(normalized)) return true;
    if (/^(i want the cheapest option available|comp[aá]rame precios y dime cu[aá]l conviene m[aá]s)$/i.test(normalized)) return true;
    return false;
}

function isBrowseOrMultiCategoryIntent(text = '') {
    const normalized = String(text || '').toLowerCase().trim();
    if (!normalized) return false;
    if (/\b(tecnolog[ií]a|hogar|moda|electrodom[eé]sticos|juguetes|gaming)\b/.test(normalized) && normalized.split(/\s+/).length <= 6) {
        return true;
    }
    const broadCategoryHits = [
        /freidora|aspiradora|refrigerador|hogar/i,
        /ps5|xbox|nintendo|gaming/i,
        /celulares|laptops|aud[ií]fonos|gadgets/i,
        /ropa|calzado|moda|accesorios|tenis|playeras/i,
        /juguetes|juegos de mesa|consolas|ni[nñ]os/i
    ].filter(pattern => pattern.test(normalized)).length;
    return broadCategoryHits >= 2;
}

function shouldApplyProductSuffixes(llmAnalysis, queryText = '') {
    const normalized = String(queryText || llmAnalysis?.searchQuery || '').trim();
    if (!normalized) return false;
    if (llmAnalysis?.action !== 'search') return false;
    if (llmAnalysis?.queryType === 'conversational' || llmAnalysis?.queryType === 'url_like') return false;
    if (llmAnalysis?.isSpeculative) return false;
    if (llmAnalysis?.needsDisambiguation && !llmAnalysis?.productCategory) return false;
    if (llmAnalysis?.isComparison && (!Array.isArray(llmAnalysis?.comparisonProducts) || llmAnalysis.comparisonProducts.length === 0)) return false;
    if (isWeakCommerceIntent(normalized) || isBrowseOrMultiCategoryIntent(normalized)) return false;
    return true;
}

async function resolveWithSoftTimeout(label, promiseFactory, fallbackValue, timeoutMs) {
    const startedAt = Date.now();
    let timeoutId = null;
    try {
        const result = await Promise.race([
            Promise.resolve().then(() => promiseFactory()),
            new Promise(resolve => {
                timeoutId = setTimeout(() => resolve({ __softTimeout: true }), timeoutMs);
            })
        ]);
        if (timeoutId) clearTimeout(timeoutId);

        const elapsed = Date.now() - startedAt;
        if (result && result.__softTimeout) {
            console.warn(`[Search Timing] ${label} timed out after ${elapsed}ms. Using fallback.`);
            return fallbackValue;
        }

        console.log(`[Search Timing] ${label} completed in ${elapsed}ms`);
        return result;
    } catch (err) {
        if (timeoutId) clearTimeout(timeoutId);
        const elapsed = Date.now() - startedAt;
        console.warn(`[Search Timing] ${label} failed after ${elapsed}ms: ${err.message}`);
        return fallbackValue;
    }
}

function buildDealVerdict(currentPrice, history = []) {
    const normalizedHistory = (history || [])
        .map(entry => ({
            price: Number(entry.price),
            created_at: entry.created_at
        }))
        .filter(entry => Number.isFinite(entry.price) && entry.price > 0)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    if (!Number.isFinite(currentPrice) || currentPrice <= 0 || normalizedHistory.length < 3) {
        return null;
    }

    const prices = normalizedHistory.map(entry => entry.price);
    const avgPrice = prices.reduce((sum, value) => sum + value, 0) / prices.length;
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const recentWindow = normalizedHistory.slice(-7, -1);
    const baselineWindow = normalizedHistory.slice(Math.max(0, normalizedHistory.length - 37), Math.max(0, normalizedHistory.length - 7));
    const recentAvg = recentWindow.length ? recentWindow.reduce((sum, item) => sum + item.price, 0) / recentWindow.length : null;
    const baselineAvg = baselineWindow.length ? baselineWindow.reduce((sum, item) => sum + item.price, 0) / baselineWindow.length : avgPrice;
    const belowAveragePct = avgPrice > 0 ? Number((((avgPrice - currentPrice) / avgPrice) * 100).toFixed(1)) : 0;
    const belowMaxPct = maxPrice > 0 ? Number((((maxPrice - currentPrice) / maxPrice) * 100).toFixed(1)) : 0;
    const recentInflation = recentAvg && baselineAvg ? recentAvg > baselineAvg * 1.2 : false;

    if (recentInflation && currentPrice >= baselineAvg * 0.95) {
        return {
            status: 'suspicious_discount',
            label: 'Descuento sospechoso',
            confidence: 'media',
            stats: {
                avgPrice: Number(avgPrice.toFixed(2)),
                minPrice: Number(minPrice.toFixed(2)),
                maxPrice: Number(maxPrice.toFixed(2)),
                belowAveragePct,
                belowMaxPct
            }
        };
    }

    if (currentPrice <= minPrice * 1.01 || belowAveragePct >= 15) {
        return {
            status: 'real_deal',
            label: 'Oferta verificada',
            confidence: currentPrice <= minPrice * 1.01 || belowAveragePct >= 20 ? 'alta' : 'media',
            stats: {
                avgPrice: Number(avgPrice.toFixed(2)),
                minPrice: Number(minPrice.toFixed(2)),
                maxPrice: Number(maxPrice.toFixed(2)),
                belowAveragePct,
                belowMaxPct
            }
        };
    }

    if (currentPrice >= avgPrice * 1.1) {
        return {
            status: 'above_average',
            label: 'Por encima del promedio',
            confidence: currentPrice >= avgPrice * 1.2 ? 'alta' : 'media',
            stats: {
                avgPrice: Number(avgPrice.toFixed(2)),
                minPrice: Number(minPrice.toFixed(2)),
                maxPrice: Number(maxPrice.toFixed(2)),
                belowAveragePct,
                belowMaxPct
            }
        };
    }

    return {
        status: 'normal_price',
        label: 'Precio normal',
        confidence: 'media',
        stats: {
            avgPrice: Number(avgPrice.toFixed(2)),
            minPrice: Number(minPrice.toFixed(2)),
            maxPrice: Number(maxPrice.toFixed(2)),
            belowAveragePct,
            belowMaxPct
        }
    };
}

function createSearchCostMetrics() {
    return {
        llmGenerateCalls: 0,
        llmEmbeddingCalls: 0,
        llmCacheHits: 0,
        serperShoppingCalls: 0,
        serperWebCalls: 0,
        serperPlacesCalls: 0,
        serperBroadWebCalls: 0,
        serperOfficialWebCalls: 0,
        serperMlAmazonCalls: 0,
        serperMlPriorityCalls: 0,
        serperMlPrioritySkipped: 0,
        cacheHit: false,
        retrySearches: 0,
        altQueryDirectCalls: 0,
        directScraperCalls: 0,
        supabaseQueries: 0
    };
}

function parseUsdRate(envName) {
    const parsed = parseFloat(process.env[envName] || '0');
    return Number.isFinite(parsed) ? parsed : 0;
}

function estimateSearchCostUsd(metrics = {}) {
    const geminiCost = (metrics.llmGenerateCalls || 0) * parseUsdRate('EST_COST_GEMINI_GENERATE_USD');
    const embeddingCost = (metrics.llmEmbeddingCalls || 0) * parseUsdRate('EST_COST_GEMINI_EMBED_USD');
    const serperShoppingCost = (metrics.serperShoppingCalls || 0) * parseUsdRate('EST_COST_SERPER_SHOPPING_USD');
    const serperWebCost = (
        (metrics.serperWebCalls || 0) +
        (metrics.serperBroadWebCalls || 0) +
        (metrics.serperOfficialWebCalls || 0) +
        (metrics.serperMlAmazonCalls || 0) +
        (metrics.serperMlPriorityCalls || 0)
    ) * parseUsdRate('EST_COST_SERPER_WEB_USD');
    const serperPlacesCost = (metrics.serperPlacesCalls || 0) * parseUsdRate('EST_COST_SERPER_PLACES_USD');
    
    const total = geminiCost + embeddingCost + serperShoppingCost + serperWebCost + serperPlacesCost;
    
    return Number(total.toFixed(6));
}

function buildCostBreakdown(metrics = {}) {
    const geminiCost = (metrics.llmGenerateCalls || 0) * parseUsdRate('EST_COST_GEMINI_GENERATE_USD');
    const embeddingCost = (metrics.llmEmbeddingCalls || 0) * parseUsdRate('EST_COST_GEMINI_EMBED_USD');
    const serperShoppingCost = (metrics.serperShoppingCalls || 0) * parseUsdRate('EST_COST_SERPER_SHOPPING_USD');
    const serperWebCost = (
        (metrics.serperWebCalls || 0) +
        (metrics.serperBroadWebCalls || 0) +
        (metrics.serperOfficialWebCalls || 0) +
        (metrics.serperMlAmazonCalls || 0) +
        (metrics.serperMlPriorityCalls || 0)
    ) * parseUsdRate('EST_COST_SERPER_WEB_USD');
    const serperPlacesCost = (metrics.serperPlacesCalls || 0) * parseUsdRate('EST_COST_SERPER_PLACES_USD');
    
    return {
        gemini: Number(geminiCost.toFixed(6)),
        embedding: Number(embeddingCost.toFixed(6)),
        serperShopping: Number(serperShoppingCost.toFixed(6)),
        serperWeb: Number(serperWebCost.toFixed(6)),
        serperPlaces: Number(serperPlacesCost.toFixed(6)),
        total: Number((geminiCost + embeddingCost + serperShoppingCost + serperWebCost + serperPlacesCost).toFixed(6)),
        savings: {
            llmCacheHits: metrics.llmCacheHits || 0,
            mlPrioritySkipped: metrics.serperMlPrioritySkipped || 0,
            estimatedSavedUsd: Number((
                (metrics.llmCacheHits || 0) * parseUsdRate('EST_COST_GEMINI_GENERATE_USD') +
                (metrics.serperMlPrioritySkipped || 0) * parseUsdRate('EST_COST_SERPER_WEB_USD')
            ).toFixed(6))
        }
    };
}

function tokenizeSearchText(value = '') {
    return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9áéíóúñü\s]/gi, ' ')
        .split(/\s+/)
        .filter(token => token.length > 2);
}

function extractStructuredProductTokens(value = '') {
    const text = String(value || '').toLowerCase();
    const tokens = [];
    // Storage/RAM: 64gb, 128gb, 256gb, 1tb, 8gb ram, 16gb
    const storageMatches = text.match(/\b\d{1,4}\s*(gb|tb|mb)\b/gi) || [];
    tokens.push(...storageMatches.map(m => m.replace(/\s+/g, '')));
    // Screen sizes: 6.1", 55 pulgadas, 13.3"
    const screenMatches = text.match(/\b\d{1,3}(?:\.\d{1,2})?\s*(?:"|pulgadas?|inch(?:es)?)\b/gi) || [];
    tokens.push(...screenMatches.map(m => m.replace(/\s+/g, '')));
    // Processor/chip: m1, m2, m3, m4, i3-12100, i5, i7, ryzen 5, snapdragon 8
    const cpuMatches = text.match(/\b(?:m[1-5](?:\s*pro|\s*max|\s*ultra)?|i[3579]-?\d{3,5}[a-z]{0,2}|ryzen\s?[3579]\s?\d{3,4}[a-z]{0,2}|snapdragon\s?\d{3,4}|a\d{2}\s*bionic|dimensity\s?\d{3,4}|exynos\s?\d{4})\b/gi) || [];
    tokens.push(...cpuMatches.map(m => m.replace(/\s+/g, ' ').trim()));
    // Phone/tablet models: iphone 15, iphone 16 pro, galaxy s24, pixel 9, a55
    const modelMatches = text.match(/\b(?:iphone\s?\d{1,2}(?:\s*(?:pro|plus|max|mini|se))*|galaxy\s?(?:s|a|z|note|tab)\s?\d{1,2}(?:\s*(?:ultra|plus|fe|\+))?|pixel\s?\d{1,2}(?:\s*(?:pro|a))?|ipad\s*(?:pro|air|mini)?\s*(?:\d{1,2}(?:th|va|nd|rd)?)?|watch\s*(?:ultra\s*)?\d{0,2}|airpods\s*(?:pro|max)?\s*\d{0,2})\b/gi) || [];
    tokens.push(...modelMatches.map(m => m.replace(/\s+/g, ' ').trim()));
    // Alphanumeric model codes: a55, s24, a15, g84, note 12
    const codeMatches = text.match(/\b(?:a\d{2,3}|s\d{2,3}|note\s?\d{1,2}|g\d{1,3}|edge\s?\d{1,3}|redmi\s*(?:note\s*)?\d{1,2}[a-z]?)\b/gi) || [];
    tokens.push(...codeMatches.map(m => m.replace(/\s+/g, ' ').trim()));
    // Colors (common in product variants)
    const colorMatches = text.match(/\b(?:negro|blanco|azul|rojo|rosa|verde|morado|gris|plateado|dorado|titanio|natural|midnight|starlight|black|white|blue|red|pink|green|purple|gray|silver|gold|titanium|graphite|sierra blue|space gray|space black|desert titanium|cream)\b/gi) || [];
    tokens.push(...colorMatches.map(m => m.trim()));
    // WiFi/Cellular variants
    const connMatches = text.match(/\b(?:wifi|wi-fi|cellular|5g|4g|lte)\b/gi) || [];
    tokens.push(...connMatches.map(m => m.trim()));
    // Generation markers
    const genMatches = text.match(/\b(?:\d{1,2}(?:th|va|nd|rd|ta|ma)\s*(?:gen|generaci[oó]n)?|gen\s*\d{1,2})\b/gi) || [];
    tokens.push(...genMatches.map(m => m.replace(/\s+/g, ' ').trim()));
    return [...new Set(tokens.map(t => t.toLowerCase()).filter(Boolean))];
}

function extractVariantKey(value = '') {
    const tokens = extractStructuredProductTokens(value);
    const storageTokens = tokens.filter(t => /\d+(?:gb|tb)/.test(t)).sort();
    const colorTokens = tokens.filter(t => /^(negro|blanco|azul|rojo|rosa|verde|morado|gris|plateado|dorado|titanio|natural|midnight|starlight|black|white|blue|red|pink|green|purple|gray|silver|gold|titanium|graphite|cream|space\s*(?:gray|black)|sierra\s*blue|desert\s*titanium)$/.test(t));
    return { storage: storageTokens.join('+'), color: colorTokens[0] || '', allTokens: tokens };
}

function buildMatchSignals(searchText = '', titleText = '') {
    const queryTokens = [...new Set(tokenizeSearchText(searchText))];
    const titleTokens = new Set(tokenizeSearchText(titleText));
    if (queryTokens.length === 0) {
        return { matchScore: 0, strongMatch: false, weakMatch: false, structuredTokenOverlap: 0, exactStructuredMatch: false, variantMismatch: false };
    }

    const matchedTokens = queryTokens.filter(token => titleTokens.has(token)).length;
    const baseScore = matchedTokens / queryTokens.length;
    const queryStructuredTokens = extractStructuredProductTokens(searchText);
    const titleStructuredTokens = new Set(extractStructuredProductTokens(titleText));
    const structuredMatches = queryStructuredTokens.filter(token => titleStructuredTokens.has(token)).length;
    const structuredTokenOverlap = queryStructuredTokens.length > 0 ? (structuredMatches / queryStructuredTokens.length) : 0;
    const exactStructuredMatch = queryStructuredTokens.length > 0 && structuredMatches === queryStructuredTokens.length;
    // Detect variant mismatch: query asks for "256gb" but title says "128gb"
    const queryVariant = extractVariantKey(searchText);
    const titleVariant = extractVariantKey(titleText);
    const variantMismatch = Boolean(
        (queryVariant.storage && titleVariant.storage && queryVariant.storage !== titleVariant.storage) ||
        (queryVariant.color && titleVariant.color && queryVariant.color !== titleVariant.color)
    );
    const variantPenalty = variantMismatch ? 0.15 : 0;
    const matchScore = Math.min(1, Math.max(0, baseScore + (structuredTokenOverlap * 0.28) - variantPenalty));
    return {
        matchScore,
        strongMatch: !variantMismatch && (exactStructuredMatch || matchScore >= 0.72 || (matchedTokens >= 3 && matchScore >= 0.6)),
        weakMatch: variantMismatch || (matchScore < 0.45 && structuredTokenOverlap < 0.5),
        structuredTokenOverlap,
        exactStructuredMatch,
        variantMismatch
    };
}

function buildBroadSearchProfile(text = '') {
    const normalized = String(text || '').toLowerCase().trim();
    const tokens = [...new Set(tokenizeSearchText(normalized))];
    const detectedFamilies = [
        { key: 'gaming', pattern: /ps5|playstation|xbox|nintendo|switch|gaming/i },
        { key: 'smartphone', pattern: /iphone|galaxy|pixel|xiaomi|motorola|celular|smartphone/i },
        { key: 'laptop', pattern: /laptop|macbook|lenovo|hp|asus|acer|dell|notebook/i },
        { key: 'audio', pattern: /aud[ií]fonos|airpods|headphones|earbuds|bocina|speaker/i },
        { key: 'tv', pattern: /tv|televisor|pantalla|oled|qled/i },
        { key: 'home', pattern: /robot aspiradora|aspiradora|freidora|cafetera|licuadora|refrigerador|lavadora|hogar/i }
    ].filter(entry => entry.pattern.test(normalized)).map(entry => entry.key);
    const brandTokens = tokens.filter(token => /apple|iphone|samsung|galaxy|xiaomi|motorola|google|pixel|lenovo|hp|asus|acer|dell|sony|lg|jbl|bose|anker|nike|adidas|roomba|ecovacs|dreame|eufy|huawei/.test(token));
    const needBased = /trabajo|estudio|gaming|oficina|hogar|escuela|viaje|correr|regalo|barato|econ[oó]mico|oferta|mejor/i.test(normalized);
    const broad = detectedFamilies.length >= 2 || brandTokens.length >= 2 || tokens.length >= 4 || needBased;

    return {
        broad,
        isMultiFamily: detectedFamilies.length >= 2,
        isMultiBrand: brandTokens.length >= 2,
        detectedFamilies,
        brandTokens,
        tokens,
        needBased
    };
}

function isBroadProductIntent(text = '') {
    return buildBroadSearchProfile(text).broad;
}

function inferResultFamily(item = {}) {
    const text = `${item.title || ''} ${item.snippet || ''} ${item.source || ''}`.toLowerCase();
    if (/robot aspiradora|aspiradora robot|roomba|vacuum robot/i.test(text)) return 'robot_aspiradora';
    if (/laptop|macbook|notebook|thinkpad|ideapad|vivobook|inspiron|pavilion|victus/i.test(text)) return 'laptop';
    if (/iphone|galaxy|pixel|xiaomi|motorola|smartphone|celular/i.test(text)) return 'smartphone';
    if (/playstation|ps5|ps4|xbox|nintendo|switch|steam deck/i.test(text)) return 'gaming';
    if (/aud[ií]fonos|airpods|earbuds|headphones|speaker|bocina/i.test(text)) return 'audio';
    if (/televisor|smart tv|oled|qled|pantalla|tv\b/i.test(text)) return 'tv';
    if (/freidora|cafetera|licuadora|refrigerador|lavadora|microondas/i.test(text)) return 'appliance';
    return 'general';
}

function inferResultBrand(item = {}) {
    const text = `${item.title || ''} ${item.snippet || ''} ${item.source || ''}`.toLowerCase();
    const brands = [
        'apple', 'iphone', 'samsung', 'xiaomi', 'motorola', 'google', 'pixel', 'lenovo', 'hp', 'asus', 'acer', 'dell', 'sony', 'lg', 'huawei', 'roborock', 'roomba', 'ecovacs', 'dreame', 'eufy', 'jbl', 'bose', 'steren'
    ];
    const match = brands.find((brand) => new RegExp(`\\b${brand}\\b`, 'i').test(text));
    if (!match) return 'unknown';
    if (match === 'iphone') return 'apple';
    if (match === 'pixel') return 'google';
    return match;
}

function looksGenericListingTitle(item = {}) {
    const title = String(item.title || '').trim().toLowerCase();
    if (!title) return true;
    return /^(televisores?|pantallas?|laptops?|computadoras? y laptops|celulares? y smartphones|aud[íi]fonos y bocinas|aud[íi]fonos|smart ?tv|oled pantallas y proyectores|asus laptop exclusivos en l[íi]nea|lenovo laptop computadoras y laptops)$/i.test(title)
        || /^(belleza|productos de belleza|cosm[eé]ticos|maquillaje|belleza y cuidado personal|bases de maquillaje|perfumes?|fragancias?|hogar|electrodom[eé]sticos|moda|tenis|zapatos|ropa)$/i.test(title)
        || /\b(todos los accesorios|exclusivos en l[íi]nea|computadoras y laptops|pantallas y proyectores|belleza y cuidado personal|cosm[eé]ticos belleza|productos de belleza|maquillaje belleza)\b/i.test(title);
}

function looksLikeGarbageTitle(value = '') {
    const title = String(value || '').replace(/\s+/g, ' ').trim();
    if (!title) return true;
    const normalized = title.toLowerCase();
    if (title.length < 5) return true;
    if (/^(ingresa tu|adjust|mexican peso|sign in|inicia sesi[oó]n|continuar|continue|ver m[aá]s|shop|comprar|buy now)$/i.test(normalized)) return true;
    if (/^(mxn|usd|clp|cop|ars|pen|peso|pesos|d[oó]lar(?:es)?)$/i.test(normalized)) return true;
    if (/^[^a-záéíóúñü]*$/.test(normalized)) return true;
    if (/^(home|inicio|ofertas|sale|rebajas|promociones?)$/i.test(normalized)) return true;
    const tokens = tokenizeSearchText(normalized);
    if (tokens.length === 0) return true;
    if (tokens.length <= 2 && !/\d/.test(normalized) && !/(nike|adidas|apple|samsung|xiaomi|motorola|sony|lg|jbl|bose|coppel|liverpool|walmart|amazon)/i.test(normalized)) {
        return true;
    }
    return false;
}

function computeProductSpecificity(item = {}) {
    const text = `${item.title || ''} ${item.snippet || ''}`.toLowerCase();
    const structuredTokens = extractStructuredProductTokens(text);
    let score = 0;
    if (structuredTokens.length > 0) score += Math.min(3, structuredTokens.length) * 0.22;
    if (/\b(pro|max|mini|ultra|plus|lite|air|studio|gaming|5g|oled|qled|anc|ssd|ram)\b/i.test(text)) score += 0.22;
    if (/\b(128gb|256gb|512gb|1tb|2tb|16gb|8gb|32gb|4k|144hz|120hz)\b/i.test(text)) score += 0.22;
    if (item.isDirectProductPage) score += 0.18;
    if (item.isOfficialBrandResult) score += 0.12;
    return Number(Math.min(1, score).toFixed(2));
}

function buildComparableFingerprint(item = {}) {
    const brand = inferResultBrand(item);
    const family = inferResultFamily(item);
    const structured = extractStructuredProductTokens(`${item.title || ''} ${item.snippet || ''}`);
    const coreTokens = tokenizeSearchText(`${item.title || ''}`)
        .filter(token => !/nuevo|nueva|oferta|precio|comprar|tienda|envio|gratis|hombre|mujer|para|con|sin/.test(token))
        .slice(0, 8);
    return [family, brand, ...structured, ...coreTokens].filter(Boolean).join('|');
}

function getAffiliatePriorityMeta(item = {}, countryCode = 'MX') {
    const text = `${item.source || ''} ${item.url || ''}`.toLowerCase();
    const normalizedCountry = String(countryCode || 'MX').toUpperCase();
    if (/mercadolibre\./.test(text) || /mercado\s*libre/.test(text)) {
        return { rank: 0, boost: -320, capBoost: 4 };
    }
    if (/amazon\./.test(text) || /\bamazon\b/.test(text)) {
        if (normalizedCountry === 'MX') {
            if (/amazon\.com\.mx/.test(text)) {
                return { rank: 1, boost: -140, capBoost: 3 };
            }
            if (/amazon\.com(\/|\?|$)/.test(text) || /\bamazon\b/.test(String(item.source || '').toLowerCase())) {
                return { rank: 1, boost: -190, capBoost: 4 };
            }
        }
        return { rank: 1, boost: -260, capBoost: 4 };
    }
    if (/aliexpress\./.test(text) || /\baliexpress\b/.test(text)) {
        return { rank: 2, boost: -170, capBoost: 3 };
    }
    return { rank: 9, boost: 0, capBoost: 0 };
}

function selectBalancedResults(sortedResults = [], broadProfile = {}, maxResults = 36, maxPerStore = 6) {
    const rankedResults = [...sortedResults].sort((a, b) => {
        const affiliateRankDelta = Number(a.affiliatePriorityRank || 9) - Number(b.affiliatePriorityRank || 9);
        if (affiliateRankDelta !== 0) return affiliateRankDelta;

        const aHasImage = Boolean(a.hasUsefulImage || a.image);
        const bHasImage = Boolean(b.hasUsefulImage || b.image);
        if (aHasImage !== bHasImage) return aHasImage ? -1 : 1;

        const specificityDelta = Number(b.productSpecificity || 0) - Number(a.productSpecificity || 0);
        if (Math.abs(specificityDelta) >= 0.18) return specificityDelta > 0 ? 1 : -1;

        const comparabilityDelta = Number(b.structuredTokenOverlap || 0) - Number(a.structuredTokenOverlap || 0);
        if (Math.abs(comparabilityDelta) >= 0.2) return comparabilityDelta > 0 ? 1 : -1;

        const aSourceRank = a.resultSource === 'shopping_api' ? 0 : a.resultSource === 'direct_scraper' ? 1 : a.resultSource === 'official_web' ? 2 : a.resultSource === 'web_search' ? 3 : 4;
        const bSourceRank = b.resultSource === 'shopping_api' ? 0 : b.resultSource === 'direct_scraper' ? 1 : b.resultSource === 'official_web' ? 2 : b.resultSource === 'web_search' ? 3 : 4;
        if (aSourceRank !== bSourceRank) return aSourceRank - bSourceRank;

        const aConfidence = Number(a.priceConfidence || 0);
        const bConfidence = Number(b.priceConfidence || 0);
        return bConfidence - aConfidence;
    });

    const storeCount = {};
    const familyCount = {};
    const brandCount = {};
    const topResults = [];
    const broadSearch = Boolean(broadProfile?.broad);
    const maxPerFamilyFirstPass = broadSearch ? 4 : maxResults;
    const maxPerBrandFirstPass = broadSearch ? 3 : maxResults;

    for (const item of rankedResults) {
        if (topResults.length >= maxResults) break;
        const storeKey = (item.source || 'Desconocida').toLowerCase().replace(/[^a-záéíóúñ0-9]/g, '');
        const familyKey = item.resultFamily || 'general';
        const brandKey = item.resultBrand || 'unknown';
        const currentStore = storeCount[storeKey] || 0;
        const currentFamily = familyCount[familyKey] || 0;
        const currentBrand = brandCount[brandKey] || 0;
        const effectiveMaxPerStore = maxPerStore + Number(item.affiliateCapBoost || 0);
        if (currentStore >= effectiveMaxPerStore) continue;
        if (currentFamily >= maxPerFamilyFirstPass) continue;
        if (brandKey !== 'unknown' && currentBrand >= maxPerBrandFirstPass) continue;
        storeCount[storeKey] = currentStore + 1;
        familyCount[familyKey] = currentFamily + 1;
        if (brandKey !== 'unknown') brandCount[brandKey] = currentBrand + 1;
        topResults.push(item);
    }

    if (topResults.length < maxResults) {
        for (const item of rankedResults) {
            if (topResults.length >= maxResults) break;
            if (!topResults.includes(item)) {
                topResults.push(item);
            }
        }
    }

    return topResults;
}

function stripSearchOperators(text = '') {
    return String(text || '')
        .replace(/\s-"[^"]+"/g, ' ')
        .replace(/\s-[^\s]+/g, ' ')
        .replace(/\b(usado|reacondicionado|refurbished|seminuevo|segunda mano|marketplace|mercadolibre|open box)\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function looksInformationalResult(item = {}) {
    const text = `${item.title || ''} ${item.snippet || ''} ${item.url || ''}`.toLowerCase();
    return /\b(what is|qué es|vale la pena|which one should you buy|vs\.?\s|compare|comparison|comparativa|review|reseña|guía|guide|how to|cómo|switch from|cámbiate|pasarse de|launched|news|blog|foro|forum|app store|community|comunidad|soporte|support|faq|preguntas frecuentes)\b/i.test(text);
}

function hasUsefulCommercialUrl(item = {}) {
    const url = String(item.url || '').trim().toLowerCase();
    if (!url) return false;
    if (/^https?:\/\//.test(url)) return true;
    return false;
}

function normalizeObservedPrices(values = []) {
    return [...new Set((values || [])
        .map(value => Number(value))
        .filter(value => Number.isFinite(value) && value > 0)
        .map(value => Number(value.toFixed(2))))];
}

function simplifySearchQuery(query = '') {
    return String(query || '')
        .replace(/\s+-\w+/g, ' ')
        .replace(/\b(usado|reacondicionado|refurbished|open box|segunda mano|seminuevo|mercadolibre|marketplace)\b/gi, ' ')
        .replace(/\b\d+(gb|tb|ram|ssd|hdd|mah|hz|pulgadas?)\b/gi, ' ')
        .split(/\s+/)
        .filter(token => token.length > 2)
        .slice(0, 4)
        .join(' ')
        .trim();
}

function inferBudgetFromText(value = '') {
    const source = String(value || '').toLowerCase();
    const match = source.match(/(?:menos de|under|below|máximo|max(?:imo)?|hasta|up to)\s*\$?\s*([\d.,]+)/i);
    if (!match) return undefined;
    const numeric = parseFloat(String(match[1]).replace(/,/g, ''));
    return Number.isFinite(numeric) && numeric > 0 ? numeric : undefined;
}

function sanitizeProductTitle(rawTitle = '', storeName = '', isLocalStore = false) {
    if (isLocalStore) {
        return String(rawTitle || storeName || 'Tienda local').trim();
    }

    const title = String(rawTitle || '')
        .replace(/\s+/g, ' ')
        .replace(/[|•]+/g, ' - ')
        .trim();

    if (!title) return '';

    return title
        .replace(/\s*-\s*(amazon|mercado libre|mercadolibre|walmart|target|costco|best buy|liverpool|coppel|sam'?s club)\b.*$/i, '')
        .replace(/\b(check in-store price|ver precio en tienda|agotado|out of stock|sold out)\b/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

function sanitizeShippingText(value = '') {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text) return '';
    if (/coupon|cup[oó]n|promoci[oó]n|descuento/i.test(text)) return '';

    const shippingMatch = text.match(/(llega(?:\s+gratis)?\s+mañana|llega\s+hoy|env[ií]o gratis|arrives?\s+(?:free\s+)?tomorrow|free shipping|same day delivery|check in-store price|ver precio en tienda)/i);
    return shippingMatch ? shippingMatch[0].trim() : '';
}

function sanitizeProductImage(value = '') {
    const image = String(value || '').trim();
    if (!image) return '';
    if (/^(null|undefined|about:blank)$/i.test(image)) return '';
    if (/placeholder|no[\s_-]?image/i.test(image)) return '';
    const normalizedImage = image.toLowerCase();
    const looksLikeStoreLogo = /logo|brandmark|favicon|store-logo|icon|sprite|avatar|seller/i.test(normalizedImage)
        || (/(mercadolibre|costco|walmart|amazon|coppel|liverpool|sams|best[\s_-]?buy|elektra|target)/i.test(normalizedImage)
            && /(logo|icon|badge|avatar|seller)/i.test(normalizedImage));
    const looksLikeCatalogAsset = /product|products|prod|sku|image|images|item|catalog|catalogo|pdp|media|photo/i.test(normalizedImage);
    if (looksLikeStoreLogo && !looksLikeCatalogAsset) return '';
    if (/^https?:\/\//i.test(image) || image.startsWith('data:image/') || image.startsWith('/')) {
        return image;
    }
    return '';
}

function calculateMedian(values = []) {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (sorted.length === 0) return null;
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
}

function bumpProviderCostMetrics(metrics, { intentType, radius, lat, lng }) {
    if (!process.env.SERPER_API_KEY) {
        return;
    }

    if (intentType === 'mayoreo_perecedero') {
        return;
    }

    const hasLocation = Boolean(lat && lng && radius !== 'global' && radius !== '999999');

    if (intentType === 'servicio_local') {
        if (hasLocation) metrics.serperPlacesCalls += 1;
        return;
    }

    const broadProfile = arguments[1]?.broadProfile || null;
    const brandOfficialQuery = arguments[1]?.brandOfficialQuery || null;
    const alternativeQueries = Array.isArray(arguments[1]?.alternativeQueries) ? arguments[1].alternativeQueries.filter(Boolean) : [];
    const productCategory = String(arguments[1]?.productCategory || '').toLowerCase();
    const queryType = String(arguments[1]?.queryType || 'generic').toLowerCase();
    const isSpecificProduct = queryType === 'brand_model' || queryType === 'comparison';
    const isBroadExploration = Boolean(broadProfile?.broad);
    const shouldQueryBroadWeb = !isSpecificProduct && (isBroadExploration
        || alternativeQueries.length >= 2
        || ['fashion', 'home', 'appliance'].includes(productCategory));
    const shouldQueryOfficialWeb = !isSpecificProduct && Boolean(String(brandOfficialQuery || '').trim());
    const preferredStoreKeys = Array.isArray(arguments[1]?.preferredStoreKeys) ? arguments[1].preferredStoreKeys.filter(Boolean) : [];
    const shouldQueryMlAmazon = !isSpecificProduct;
    const shouldQueryMlPriority = !isSpecificProduct && preferredStoreKeys.length === 0;
    const isLocalFastMode = process.env.NODE_ENV !== 'production' && process.env.FORCE_FULL_SEARCH !== 'true';
    const serperAltQueryCount = isSpecificProduct ? 0 : (isLocalFastMode
        ? 1
        : (isBroadExploration ? 2 : 1));
    const altShoppingCalls = Math.min(
        alternativeQueries.length,
        serperAltQueryCount
    );

    metrics.serperShoppingCalls += 1 + altShoppingCalls;
    // Note: mlPriority is pre-counted here but may be skipped in shoppingService
    // The actual skip is tracked via serperMlPrioritySkipped metric
    metrics.serperWebCalls += 1 + (shouldQueryBroadWeb ? 1 : 0) + (shouldQueryOfficialWeb ? 1 : 0) + (shouldQueryMlAmazon ? 1 : 0) + (shouldQueryMlPriority ? 1 : 0);

    if (hasLocation) {
        metrics.serperPlacesCalls += 1;
    }
}

function logSearchCostMetrics(eventName, metrics = {}, context = {}) {
    const breakdown = buildCostBreakdown(metrics);
    const serperTotal = (metrics.serperShoppingCalls || 0) + 
                       (metrics.serperWebCalls || 0) + 
                       (metrics.serperBroadWebCalls || 0) + 
                       (metrics.serperOfficialWebCalls || 0) + 
                       (metrics.serperMlAmazonCalls || 0) + 
                       (metrics.serperMlPriorityCalls || 0) + 
                       (metrics.serperPlacesCalls || 0);
    
    console.log(`[Cost Metrics] ${eventName}`);
    console.log(`  Total: $${breakdown.total} | Saved: $${breakdown.savings.estimatedSavedUsd}`);
    console.log(`  Gemini: $${breakdown.gemini} (${metrics.llmGenerateCalls || 0} calls, ${metrics.llmCacheHits || 0} cached)`);
    console.log(`  Serper: $${breakdown.serperShopping + breakdown.serperWeb + breakdown.serperPlaces} (${serperTotal} calls)`);
    console.log(`    - Shopping: ${metrics.serperShoppingCalls || 0}`);
    console.log(`    - Web: ${metrics.serperWebCalls || 0}`);
    console.log(`    - BroadWeb: ${metrics.serperBroadWebCalls || 0}`);
    console.log(`    - OfficialWeb: ${metrics.serperOfficialWebCalls || 0}`);
    console.log(`    - ML+Amazon: ${metrics.serperMlAmazonCalls || 0}`);
    console.log(`    - MLPriority: ${metrics.serperMlPriorityCalls || 0} (skipped: ${metrics.serperMlPrioritySkipped || 0})`);
    console.log(`    - Places: ${metrics.serperPlacesCalls || 0}`);
    console.log(`  Cache: ${metrics.cacheHit ? 'HIT' : 'MISS'} | Scrapers: ${metrics.directScraperCalls || 0} | DB: ${metrics.supabaseQueries || 0}`);
    console.log(`  Query: "${String(context.query || '').slice(0, 50)}" | User: ${context.userId ? 'auth' : 'anon'} | Results: ${context.resultCount || 0}`);
}

exports.analyzeImage = async (req, res) => {
    try {
        const { image } = req.body;
        if (!image) {
            return res.status(400).json({ error: 'No se proporcionó ninguna imagen.' });
        }

        // Validate base64 payload size (max ~5MB decoded = ~6.7MB base64)
        const MAX_BASE64_LENGTH = 7 * 1024 * 1024; // 7MB in base64 chars
        if (image.length > MAX_BASE64_LENGTH) {
            return res.status(413).json({ error: 'La imagen es demasiado grande. Máximo 5MB.' });
        }

        // Limpiar prefijo base64 si existe
        const base64Data = image.replace(/^data:image\/\w+;base64,/, "");

        const result = await visionService.identifyProduct(base64Data);
        res.json(result);
    } catch (error) {
        console.error('Error en analyzeImage:', error);
        res.status(500).json({ error: 'Error al procesar la imagen con IA.' });
    }
};

exports.searchProduct = async (req, res) => {
    const costMetrics = createSearchCostMetrics();
    try {
        console.log('[DEBUG /buscar] req.body:', JSON.stringify(req.body));
        const {
            chatHistory = [],
            radius,
            lat,
            lng,
            skipLLM,
            deepResearch = false,
            safeStoresOnly = false,
            includeKnownMarketplaces = true,
            includeHighRiskMarketplaces = false,
            conditionMode = 'all',
            country: explicitCountry
        } = req.body;

        // Detect country: explicit from frontend > Vercel IP header > Accept-Language > MX default
        const countryCode = regionConfigService.resolveCountry(req, explicitCountry);
        const regionCfg = regionConfigService.getRegionConfig(countryCode);
        console.log(`[Search] Detected country: ${countryCode} (${regionCfg.regionLabel}, ${regionCfg.currency})`);

        // Use verified userId from auth middleware (JWT), ignore body.userId
        const userId = req.userId || null;

        // Sanitize: strip HTML tags, trim whitespace, limit to 200 chars
        const query = (typeof req.body.query === 'string')
            ? req.body.query.replace(/<[^>]*>/g, '').trim().slice(0, 200)
            : null;

        if (!query) {
            return res.status(400).json({ error: 'Falta el texto de búsqueda (query) en el body.' });
        }

        let usageWarning = null;
        let userProfile = null;
        let isVipSearch = DEV_VIP_BYPASS;
        let deepResearchRequested = Boolean(deepResearch);

        // PAYWALL Enforcement: Rate limit anonymous users by IP (Supabase-based for serverless safety)
        if (!userId) {
            // Bypass anonymous IP rate limiting in development
            if (process.env.NODE_ENV !== 'production') {
                console.log('[Dev] Bypassing IP rate limit');
            } else {
                // x-vercel-forwarded-for is authoritative on Vercel (can't be spoofed by client)
                const ip = req.headers['x-vercel-forwarded-for']?.split(',')[0]?.trim() || req.headers['x-real-ip'] || req.headers['x-forwarded-for']?.split(',').pop()?.trim() || req.ip || 'unknown';
                const ANON_DAILY_LIMIT = 3;

            if (supabase) {
                try {
                    const todayStart = new Date();
                    todayStart.setHours(0, 0, 0, 0);
                    const searchIpKey = `search:${ip}`;
                    const { count, error } = await supabase
                        .from('rate_limits')
                        .select('*', { count: 'exact', head: true })
                        .eq('ip', searchIpKey)
                        .gte('created_at', todayStart.toISOString());

                    if (!error && count >= ANON_DAILY_LIMIT) {
                        return res.status(402).json({
                            error: 'Inicia sesión para seguir buscando gratis.',
                            paywall: false,
                            login_required: true
                        });
                    }
                    // Store IP key for logging after successful search
                    req._anonSearchIpKey = searchIpKey;
                } catch (e) {
                    console.warn('[Anon Paywall] Supabase error, allowing request:', e.message);
                }
            } else {
                // RAM fallback (unreliable in serverless but better than nothing)
                if (!global._anonSearchLog) global._anonSearchLog = {};
                const todayKey = new Date().toISOString().slice(0, 10);
                const ipKey = `${ip}:${todayKey}`;
                global._anonSearchLog[ipKey] = (global._anonSearchLog[ipKey] || 0) + 1;
                if (global._anonSearchLog[ipKey] > ANON_DAILY_LIMIT) {
                    return res.status(402).json({
                        error: 'Inicia sesión para seguir buscando gratis.',
                        paywall: false,
                        login_required: true
                    });
                }
            }
            } // Close the else block for NODE_ENV
        }

        // PAYWALL Enforcement: Verificar límites por plan en backend (authenticated users)
        if (userId && supabase) {
            const { data: profile } = await supabase.from('profiles').select('plan, is_premium, vip_temp_unlocked_at').eq('id', userId).single();
            userProfile = profile || null;
            isVipSearch = DEV_VIP_BYPASS || isVipProfile(userProfile);
            if (profile) {
                let reqLimit = 10;
                let isDaily = false;
                let planName = 'Gratis';
                const isFreePlan = !profile.is_premium && !['personal_vip', 'personal_vip_annual', 'b2b', 'b2b_annual'].includes(String(profile.plan || '').toLowerCase());

                // SEC-3: Check if user has active temporary VIP from Lumu Coins (1 hour window)
                const VIP_TEMP_DURATION_MS = 60 * 60 * 1000; // 1 hour
                const hasTempVIP = profile.vip_temp_unlocked_at &&
                    (Date.now() - new Date(profile.vip_temp_unlocked_at).getTime()) < VIP_TEMP_DURATION_MS;

                if (profile.plan === 'b2b' || profile.plan === 'b2b_annual') {
                    reqLimit = 200;
                    isDaily = false;
                    planName = profile.plan === 'b2b_annual' ? 'Revendedor B2B Anual' : 'Revendedor B2B';
                } else if (profile.is_premium || profile.plan === 'personal_vip' || profile.plan === 'personal_vip_annual') {
                    reqLimit = 40;
                    isDaily = false;
                    planName = (profile.plan === 'personal_vip_annual') ? 'VIP Anual' : 'VIP';
                } else if (hasTempVIP) {
                    reqLimit = 20;
                    isDaily = true;
                    planName = 'VIP Temporal';
                }

                const todayStart = new Date();
                todayStart.setHours(0, 0, 0, 0);
                const monthStart = new Date();
                monthStart.setDate(1);
                monthStart.setHours(0, 0, 0, 0);

                const bonusKey = `bonus:user:${userId}`;

                if (isFreePlan && !hasTempVIP) {
                    const FREE_DAILY_LIMIT = 2;
                    const FREE_MONTHLY_LIMIT = 10;

                    const [dailySearches, monthlySearches, dailyBonus, monthlyBonus] = await Promise.all([
                        getSearchUnitsUsed({ userId, sinceIso: todayStart.toISOString() }),
                        getSearchUnitsUsed({ userId, sinceIso: monthStart.toISOString() }),
                        supabase.from('rate_limits')
                            .select('*', { count: 'exact', head: true })
                            .eq('ip', bonusKey)
                            .gte('created_at', todayStart.toISOString()),
                        supabase.from('rate_limits')
                            .select('*', { count: 'exact', head: true })
                            .eq('ip', bonusKey)
                            .gte('created_at', monthStart.toISOString())
                    ]);

                    const dailyUsed = Math.max(0, (dailySearches.used || 0) - (dailyBonus.count || 0));
                    const monthlyUsed = Math.max(0, (monthlySearches.used || 0) - (monthlyBonus.count || 0));
                    const dailyRemaining = Math.max(0, FREE_DAILY_LIMIT - dailyUsed);
                    const monthlyRemaining = Math.max(0, FREE_MONTHLY_LIMIT - monthlyUsed);

                    if (!dailySearches.error && !monthlySearches.error) {
                        if (monthlyUsed >= FREE_MONTHLY_LIMIT) {
                            return res.status(402).json({
                                error: 'Ya agotaste tus 10 búsquedas gratis de este mes. Hazte VIP para seguir buscando sin límites mensuales.',
                                paywall: true,
                                upgrade_required: false
                            });
                        }

                        if (dailyUsed >= FREE_DAILY_LIMIT) {
                            return res.status(402).json({
                                error: 'Ya usaste tus 2 búsquedas gratis de hoy. Vuelve mañana o hazte VIP para seguir buscando ahora mismo.',
                                paywall: true,
                                upgrade_required: false
                            });
                        }

                        if (dailyRemaining === 1 && monthlyRemaining <= 3) {
                            usageWarning = `⚠️ Te queda 1 búsqueda gratis hoy y ${monthlyRemaining} este mes.`;
                        } else if (dailyRemaining === 1) {
                            usageWarning = '⚠️ Te queda 1 búsqueda gratis hoy.';
                        } else if (monthlyRemaining <= 2) {
                            usageWarning = `⚠️ Te quedan ${monthlyRemaining} búsquedas gratis este mes.`;
                        }
                    }
                } else {
                    let queryDate = new Date();
                    if (isDaily) {
                        queryDate = todayStart;
                    } else {
                        queryDate = monthStart;
                    }

                    const { used, error } = await getSearchUnitsUsed({
                        userId,
                        sinceIso: queryDate.toISOString()
                    });

                    let bonusCredits = 0;
                    if (!deepResearchRequested) {
                        try {
                            const { count: bCount } = await supabase.from('rate_limits')
                                .select('*', { count: 'exact', head: true })
                                .eq('ip', bonusKey)
                                .gte('created_at', queryDate.toISOString());
                            bonusCredits = bCount || 0;
                        } catch { /* ignore */ }
                    }

                    const effectiveUsed = Math.max(0, (used || 0) - bonusCredits);

                    if (!error) {
                        if (effectiveUsed >= reqLimit) {
                            const errorMsg = isDaily
                                ? 'Límite diario de búsquedas alcanzado. Mejora a VIP para seguir buscando sin restricciones.'
                                : `Tu capacidad de uso mensual para el plan ${planName} ya se utilizó en este ciclo. Por favor espera a tu siguiente ciclo o contacta a soporte.`;
                            return res.status(402).json({
                                error: errorMsg,
                                paywall: !profile.is_premium && !hasTempVIP,
                                upgrade_required: !!profile.is_premium && !hasTempVIP
                            });
                        }

                        if (!isDaily && effectiveUsed >= reqLimit * 0.9) {
                            usageWarning = '⚠️ Te estás acercando a la capacidad de uso de tu ciclo actual.';
                        } else if (isDaily && effectiveUsed === reqLimit - 1) {
                            usageWarning = '⚠️ Te queda 1 búsqueda disponible hoy.';
                        }
                    }
                }
            }
        }

        if (deepResearchRequested && !isVipSearch) {
            return res.status(402).json({
                error: 'Deep Research requiere cambiar a plan VIP.',
                upgrade_required: true,
                upgrade_target: 'vip_deep_research',
                feature: 'deep_research'
            });
        }

        const deepSearchEnabled = Boolean(deepResearchRequested && isVipSearch);
        const effectiveSearchTier = isVipSearch ? 'vip' : 'free';

        // MASTER TIMEOUT: AbortController para cancelar operaciones si excedemos 45s
        const MASTER_TIMEOUT_MS = 45000;
        const abortController = new AbortController();
        const searchStartTime = Date.now();
        req.on('aborted', () => {
            if (!abortController.signal.aborted) {
                console.warn('[Search Abort] Request aborted by client');
                abortController.abort();
            }
        });
        res.on('close', () => {
            if (!res.writableEnded && !abortController.signal.aborted) {
                console.warn('[Search Abort] Response closed before completion');
                abortController.abort();
            }
        });
        
        // Setup timeout abort
        const timeoutId = setTimeout(() => {
            abortController.abort();
            console.warn('[Master Timeout] Abortando operaciones por exceso de tiempo');
        }, MASTER_TIMEOUT_MS);

        // Check if aborted before LLM call
        if (abortController.signal.aborted) {
            clearTimeout(timeoutId);
            return res.status(504).json({ error: 'La búsqueda tomó demasiado tiempo. Intenta con una búsqueda más específica.' });
        }

        if (!skipLLM) {
            costMetrics.llmGenerateCalls += 1;
            if (supabase) costMetrics.llmEmbeddingCalls += 1;
        }

        let llmAnalysis;
        if (skipLLM) {
            console.log(`[Direct Search] Saltando LLM para: ${query}`);
            llmAnalysis = {
                action: 'search',
                searchQuery: query,
                normalizedQuery: query,
                queryType: 'generic',
                condition: conditionMode === 'used' ? 'used' : 'new',
                reason: 'Direct category search',
                canonicalKey: cacheService.normalizeCanonicalKey(query),
                priceVolatility: 'medium',
                productCategory: '',
                maxBudget: inferBudgetFromText(query),
                aiSummary: null,
                isComparison: false,
                comparisonProducts: [],
                isSpeculative: false,
                needsDisambiguation: false,
                disambiguationOptions: [],
                commercialReadiness: 0.5,
                searchLanguage: 'auto',
                excludeTerms: [],
                brandOfficialQuery: null,
                reasoning: 'Direct category search - LLM skipped'
            };
        } else {
            // 1. Evaluar el mensaje del usuario con la IA Conversacional (incluyendo historial)
            llmAnalysis = await llmService.analyzeMessage(query, chatHistory, {
                countryCode,
                abortSignal: abortController.signal,
                searchTier: effectiveSearchTier,
                deepSearchEnabled
            });
            
            // Track cache hit if LLM response came from cache
            if (llmAnalysis._cacheHit) {
                costMetrics.llmCacheHits += 1;
                costMetrics.llmGenerateCalls -= 1; // Don't count as API call
                if (supabase) costMetrics.llmEmbeddingCalls -= 1;
                delete llmAnalysis._cacheHit; // Remove internal flag
            }
            
            console.log('Análisis LLM:', llmAnalysis);
        }

        llmAnalysis.canonicalKey = cacheService.normalizeCanonicalKey(llmAnalysis.canonicalKey || llmAnalysis.searchQuery || query);
        llmAnalysis.priceVolatility = llmAnalysis.priceVolatility || 'medium';
        llmAnalysis.productCategory = llmAnalysis.productCategory || '';
        llmAnalysis.maxBudget = llmAnalysis.maxBudget || inferBudgetFromText(query);
        llmAnalysis.aiSummary = llmAnalysis.aiSummary || null;
        llmAnalysis.isComparison = Boolean(llmAnalysis.isComparison);
        llmAnalysis.comparisonProducts = Array.isArray(llmAnalysis.comparisonProducts) ? llmAnalysis.comparisonProducts.filter(Boolean).slice(0, 4) : [];
        llmAnalysis.queryType = llmAnalysis.queryType || 'generic';
        llmAnalysis.normalizedQuery = llmAnalysis.normalizedQuery || llmAnalysis.searchQuery || query;
        llmAnalysis.isSpeculative = Boolean(llmAnalysis.isSpeculative);
        llmAnalysis.needsDisambiguation = Boolean(llmAnalysis.needsDisambiguation);
        llmAnalysis.disambiguationOptions = Array.isArray(llmAnalysis.disambiguationOptions) ? llmAnalysis.disambiguationOptions.filter(Boolean).slice(0, 4) : [];
        llmAnalysis.commercialReadiness = typeof llmAnalysis.commercialReadiness === 'number' ? llmAnalysis.commercialReadiness : 0.8;
        llmAnalysis.searchLanguage = llmAnalysis.searchLanguage || 'auto';
        llmAnalysis.excludeTerms = Array.isArray(llmAnalysis.excludeTerms) ? llmAnalysis.excludeTerms.filter(Boolean).slice(0, 8) : [];
        llmAnalysis.brandOfficialQuery = llmAnalysis.brandOfficialQuery || null;
        llmAnalysis.broadProfile = buildBroadSearchProfile(llmAnalysis.searchQuery || query);
        llmAnalysis.universalQueryDomain = llmAnalysis.universalQueryDomain || 'shopping';
        const effectiveBrandOfficialQuery = llmAnalysis.isSpeculative ? null : llmAnalysis.brandOfficialQuery;
        const deterministicNeedsClarification = (!llmAnalysis.productCategory && /\b(quiero|necesito|busco)\b/i.test(query) && /\b(estudiar|trabajo|oficina|gaming|regalo|viaje|escuela)\b/i.test(query))
            || /^(apple|samsung|xiaomi|motorola|sony|lg|nike|adidas)$/i.test(String(query || '').trim());
        if (deterministicNeedsClarification) {
            llmAnalysis.needsDisambiguation = true;
            if (!Array.isArray(llmAnalysis.disambiguationOptions) || llmAnalysis.disambiguationOptions.length === 0) {
                llmAnalysis.disambiguationOptions = buildClarifyingSuggestions(query, llmAnalysis.productCategory, countryCode);
            }
            if (!llmAnalysis.question) {
                llmAnalysis.question = 'Necesito un poco más de contexto para recomendarte el producto correcto y comparar mejores opciones.';
            }
        }
        const llmFallbackFailure = /fallback/i.test(String(llmAnalysis.reasoning || ''));

        if (llmAnalysis.action === 'ask' && llmFallbackFailure && !llmAnalysis.needsDisambiguation && (llmAnalysis.universalQueryDomain || 'shopping') === 'shopping') {
            llmAnalysis = {
                ...llmAnalysis,
                action: 'search',
                searchQuery: query,
                normalizedQuery: query,
                queryType: llmAnalysis.queryType === 'conversational' ? 'generic' : (llmAnalysis.queryType || 'generic'),
                question: null,
                sugerencias: [],
                needsDisambiguation: false,
                commercialReadiness: Math.max(Number(llmAnalysis.commercialReadiness || 0), 0.55),
                reasoning: `${llmAnalysis.reasoning || 'Fallback'} | Converted ask fallback to direct search`,
                canonicalKey: cacheService.normalizeCanonicalKey(llmAnalysis.canonicalKey || query)
            };
        }

        const allowedUniversalDomains = new Set(['shopping', 'service_local', 'commercial_info', 'general_info', 'out_of_scope']);
        if (!allowedUniversalDomains.has(llmAnalysis.universalQueryDomain)) {
            llmAnalysis.universalQueryDomain = 'shopping';
        }

        if (supabase && !skipLLM) {
            supabase.from('llm_analysis_log').insert({
                user_query: query,
                llm_action: llmAnalysis.action || null,
                llm_search_query: llmAnalysis.searchQuery || null,
                llm_alternatives: llmAnalysis.alternativeQueries || [],
                llm_intent_type: llmAnalysis.intent_type || null,
                llm_condition: llmAnalysis.condition || null,
                llm_query_type: llmAnalysis.queryType || null,
                llm_commercial_readiness: llmAnalysis.commercialReadiness || null,
                llm_is_speculative: llmAnalysis.isSpeculative || false,
                llm_search_language: llmAnalysis.searchLanguage || null,
                country_code: countryCode,
                created_at: new Date().toISOString()
            }).then(() => { }).catch((err) => console.error('[LLM Log] Error:', err.message));
        }

        if (conditionMode === 'used') {
            llmAnalysis.condition = 'used';
        } else if (conditionMode === 'new') {
            llmAnalysis.condition = 'new';
        }

        // 2. Si faltan datos, devolver la pregunta de seguimiento al frontend
        if (llmAnalysis.action === 'ask') {
            logSearchCostMetrics('search.ask', costMetrics, {
                query,
                userId: Boolean(userId)
            });
            return res.json({
                tipo_respuesta: 'conversacion',
                pregunta_ia: llmAnalysis.question,
                sugerencias: llmAnalysis.sugerencias || [],
                region: {
                    country: countryCode,
                    currency: regionCfg.currency,
                    locale: regionCfg.locale,
                    label: regionCfg.regionLabel
                },
                intencion_detectada: {
                    busqueda: query,
                    condicion: llmAnalysis.condition || 'new',
                    modo_condicion: conditionMode
                },
                search_metadata: {
                    canonical_key: llmAnalysis.canonicalKey || '',
                    product_category: llmAnalysis.productCategory || '',
                    max_budget: llmAnalysis.maxBudget || null,
                    ai_summary: llmAnalysis.aiSummary || null,
                    is_comparison: llmAnalysis.isComparison || false,
                    comparison_products: llmAnalysis.comparisonProducts || [],
                    query_type: llmAnalysis.queryType || 'generic',
                    is_speculative: llmAnalysis.isSpeculative || false,
                    needs_disambiguation: llmAnalysis.needsDisambiguation || false,
                    disambiguation_options: llmAnalysis.disambiguationOptions || [],
                    commercial_readiness: llmAnalysis.commercialReadiness || 0.5,
                    reasoning: llmAnalysis.reasoning || null
                },
                advertencia_uso: usageWarning
            });
        }

        if (['commercial_info', 'general_info', 'out_of_scope'].includes(llmAnalysis.universalQueryDomain)) {
            return res.json({
                tipo_respuesta: llmAnalysis.universalQueryDomain === 'commercial_info' ? 'pregunta' : 'conversacion',
                pregunta_ia: llmAnalysis.question || null,
                mensaje: llmAnalysis.question || llmAnalysis.reasoning || 'Puedo ayudarte mejor si conviertes tu consulta en una búsqueda de compra o servicio.',
                sugerencias: llmAnalysis.sugerencias || llmAnalysis.disambiguationOptions || [],
                search_metadata: {
                    canonical_key: llmAnalysis.canonicalKey,
                    product_category: llmAnalysis.productCategory || '',
                    max_budget: llmAnalysis.maxBudget || null,
                    ai_summary: llmAnalysis.aiSummary,
                    query_type: llmAnalysis.queryType,
                    universal_query_domain: llmAnalysis.universalQueryDomain,
                    needs_disambiguation: llmAnalysis.needsDisambiguation,
                    disambiguation_options: llmAnalysis.disambiguationOptions || [],
                    commercial_readiness: llmAnalysis.commercialReadiness,
                    reasoning: llmAnalysis.reasoning || null
                },
                region: {
                    country: countryCode,
                    currency: regionCfg.currency,
                    locale: regionCfg.locale,
                    label: regionCfg.regionLabel
                },
                advertencia_uso: usageWarning
            });
        }

        // 2b. Smart Routing: detect non-shoppable & multi-category queries
        const NON_SHOPPABLE_PATTERNS = /\b(hyundai|toyota|honda|nissan|chevrolet|ford|volkswagen|bmw|audi|mercedes|kia|mazda|suzuki|subaru|jeep|dodge|ram|tesla|porsche|ferrari|lamborghini)\s+(i\d+|corolla|civic|sentra|versa|kicks|march|aveo|jetta|polo|golf|tiguan|tucson|sportage|cx-\d|swift|model\s*[3ysx]|mustang|camaro|wrangler|rav4|crv|hrv|outback|forester)\b/i;
        const REAL_ESTATE_PATTERNS = /\b(casa|departamento|terreno|lote|rancho|hacienda|apartment|house|condo|land|property)\s+(en\s+venta|en\s+renta|for\s+sale|for\s+rent)\b/i;

        if (NON_SHOPPABLE_PATTERNS.test(llmAnalysis.searchQuery || query)) {
            console.log(`[Smart Routing] Non-shoppable vehicle detected: "${llmAnalysis.searchQuery}"`);
            if (lat && lng && radius !== 'global') {
                llmAnalysis.intent_type = 'servicio_local';
                llmAnalysis.searchQuery = `${llmAnalysis.searchQuery} concesionario dealer`;
            }
        }
        if (REAL_ESTATE_PATTERNS.test(llmAnalysis.searchQuery || query)) {
            console.log(`[Smart Routing] Real estate query detected: "${llmAnalysis.searchQuery}"`);
            if (lat && lng && radius !== 'global') {
                llmAnalysis.intent_type = 'servicio_local';
            }
        }

        const rawIntentQuery = String(llmAnalysis.searchQuery || query || '').trim();
        const isBroadBrowseIntent = isBrowseOrMultiCategoryIntent(rawIntentQuery);
        const universalShoppingLike = llmAnalysis.universalQueryDomain === 'shopping' || llmAnalysis.universalQueryDomain === 'service_local';
        const lacksSearchDirection = !rawIntentQuery || (
            !llmAnalysis.productCategory &&
            (!Array.isArray(llmAnalysis.alternativeQueries) || llmAnalysis.alternativeQueries.length === 0) &&
            Number(llmAnalysis.commercialReadiness || 0) < 0.45
        );
        const shouldBypassCommerceSearch =
            llmAnalysis.queryType === 'url_like' ||
            isWeakCommerceIntent(rawIntentQuery) ||
            (!universalShoppingLike) ||
            llmAnalysis.needsDisambiguation ||
            (isBroadBrowseIntent && lacksSearchDirection && llmAnalysis.universalQueryDomain !== 'shopping') ||
            (llmAnalysis.isComparison && (!Array.isArray(llmAnalysis.comparisonProducts) || llmAnalysis.comparisonProducts.length === 0));

        if (shouldBypassCommerceSearch) {
            const fallbackSuggestions = isBroadBrowseIntent
                ? (llmAnalysis.disambiguationOptions && llmAnalysis.disambiguationOptions.length > 0
                    ? llmAnalysis.disambiguationOptions.slice(0, 4)
                    : buildClarifyingSuggestions(rawIntentQuery, llmAnalysis.productCategory, countryCode))
                : (llmAnalysis.needsDisambiguation
                    ? buildClarifyingSuggestions(rawIntentQuery, llmAnalysis.productCategory, countryCode)
                    : buildFallbackSuggestions(rawIntentQuery, llmAnalysis.alternativeQueries, countryCode));
            return res.json({
                tipo_respuesta: 'pregunta',
                mensaje: llmAnalysis.question || 'Necesito un poco más de detalle para darte resultados mejor comparados y adaptados a tu compra.',
                sugerencias: fallbackSuggestions,
                search_metadata: {
                    canonical_key: llmAnalysis.canonicalKey,
                    product_category: llmAnalysis.productCategory || '',
                    max_budget: llmAnalysis.maxBudget || null,
                    ai_summary: llmAnalysis.aiSummary,
                    is_comparison: llmAnalysis.isComparison,
                    comparison_products: llmAnalysis.comparisonProducts,
                    query_type: llmAnalysis.queryType,
                    is_speculative: llmAnalysis.isSpeculative,
                    needs_disambiguation: true,
                    disambiguation_options: fallbackSuggestions,
                    commercial_readiness: Math.min(Number(llmAnalysis.commercialReadiness || 0.5), 0.35),
                    reasoning: llmAnalysis.reasoning || 'Query gated before commerce search due to weak or ambiguous shopping intent'
                },
                region: {
                    country: countryCode,
                    currency: regionCfg.currency,
                    locale: regionCfg.locale,
                    label: regionCfg.regionLabel
                },
                advertencia_uso: usageWarning
            });
        }

        // 3. Si la acción es 'search', ejecutamos Google Shopping
        let searchQuery = llmAnalysis.searchQuery;
        const shoppingBaseQuery = stripSearchOperators(llmAnalysis.searchQuery || query) || String(llmAnalysis.searchQuery || query || '').trim();
        const shouldApplySuffixes = shouldApplyProductSuffixes(llmAnalysis, searchQuery);

        // Append LLM-generated exclude terms (e.g., -funda -case -protector for phone searches)
        if (shouldApplySuffixes && llmAnalysis.excludeTerms && llmAnalysis.excludeTerms.length > 0) {
            const excludeSuffix = llmAnalysis.excludeTerms.map(t => `-${t.replace(/^-/, '')}`).join(' ');
            searchQuery = `${searchQuery} ${excludeSuffix}`;
        }

        if (shouldApplySuffixes && conditionMode === 'used') {
            searchQuery = `${searchQuery} usado reacondicionado refurbished seminuevo open box segunda mano marketplace mercadolibre`;
        } else if (shouldApplySuffixes && conditionMode === 'new') {
            searchQuery = `${searchQuery} -usado -reacondicionado -refurbished -"open box"`;
        }

        // Deep Research: pre-generate product variants and prepend as real alternative queries
        let deepVariantQueries = [];
        if (deepSearchEnabled) {
            deepVariantQueries = deepResearchEnhancer.generateProductVariants(
                searchQuery,
                llmAnalysis.productCategory || ''
            );
            console.log(`[Deep Research] Pre-search variants generated: ${deepVariantQueries.join(', ')}`);
        }

        const cleanAlternativeQueries = [
            ...deepVariantQueries,
            ...(llmAnalysis.alternativeQueries || [])
        ]
            .map(value => stripSearchOperators(value))
            .filter(Boolean)
            .filter((value, index, arr) => arr.indexOf(value) === index)
            .slice(0, deepSearchEnabled ? 14 : (isVipSearch ? 8 : 6));

        const isLocalFastMode = process.env.NODE_ENV !== 'production';
        const preSearchTimeoutMs = isLocalFastMode ? 1200 : 4000;
        const shouldUseCache = llmAnalysis.intent_type !== 'servicio_local';

        // PERF: Run cache lookup + intent memory lookup IN PARALLEL (saves 1-4s)
        const cachePromise = shouldUseCache
            ? resolveWithSoftTimeout(
                'cacheService.getCachedResults',
                () => cacheService.getCachedResults(
                    searchQuery,
                    radius,
                    lat,
                    lng,
                    countryCode,
                    llmAnalysis.canonicalKey,
                    llmAnalysis.priceVolatility,
                    llmAnalysis.queryType || 'generic'
                ),
                null,
                preSearchTimeoutMs
            )
            : Promise.resolve(null);

        const intentPromise = supabase
            ? resolveWithSoftTimeout(
                'query_intent_memory lookup',
                async () => {
                    const normalizedQ = (llmAnalysis.searchQuery || query).toLowerCase().trim();
                    const canonicalK = llmAnalysis.canonicalKey || '';
                    let intentQuery = supabase.from('query_intent_memory')
                        .select('store_name_key, clicked_count, success_score')
                        .eq('country_code', countryCode)
                        .order('clicked_count', { ascending: false })
                        .limit(20);

                    if (canonicalK) {
                        intentQuery = intentQuery.or(`normalized_query.eq.${normalizedQ},canonical_key.eq.${canonicalK}`);
                    } else {
                        intentQuery = intentQuery.eq('normalized_query', normalizedQ);
                    }

                    const { data: intentData, error: intentErr } = await intentQuery;
                    const nextBoostMap = {};
                    const nextSignalMetaMap = {};
                    if (!intentErr && intentData && intentData.length > 0) {
                        const maxClicks = Math.max(...intentData.map(r => Number(r.clicked_count || 0)), 1);
                        const maxSuccessScore = Math.max(...intentData.map(r => Number(r.success_score || 0)), 1);
                        intentData.forEach(row => {
                            const key = row.store_name_key;
                            if (key) {
                                nextBoostMap[key] = buildIntentMemoryBoost(row, maxClicks, maxSuccessScore);
                                nextSignalMetaMap[key] = {
                                    clickedCount: Number(row.clicked_count || 0),
                                    successScore: Number(row.success_score || 0)
                                };
                            }
                        });
                        console.log(`[Intent Memory] Found ${intentData.length} store preferences for "${normalizedQ}" (boost map: ${JSON.stringify(nextBoostMap)})`);
                    }
                    return { boostMap: nextBoostMap, signalMetaMap: nextSignalMetaMap };
                },
                { boostMap: {}, signalMetaMap: {} },
                preSearchTimeoutMs
            )
            : Promise.resolve({ boostMap: {}, signalMetaMap: {} });

        const [cachedResults, resolvedIntentSignals] = await Promise.all([cachePromise, intentPromise]);

        let intentBoostMap = resolvedIntentSignals?.boostMap || {};
        let intentSignalMetaMap = resolvedIntentSignals?.signalMetaMap || {};

        if (cachedResults) {
            const filteredCachedResults = cachedResults.filter(item => {
                const sourceText = `${item?.tienda || item?.source || ''} ${item?.urlOriginal || item?.url || ''}`.toLowerCase();
                if (countryCode === 'MX' && /apple\.com\/(us-edu|ca|us-es)\//i.test(sourceText)) return false;
                if (countryCode === 'MX' && (/apple\.com\/.+\/newsroom\//i.test(sourceText) || /apple\.com\/newsroom\//i.test(sourceText))) return false;
                return true;
            });
            await logSuccessfulSearchUsage({
                userId,
                query: searchQuery,
                deepSearchEnabled,
                countryCode
            });
            costMetrics.cacheHit = true;
            const cacheEstimatedCostUsd = estimateSearchCostUsd(costMetrics);
            logSearchCostMetrics('search.cache_hit', costMetrics, {
                query: searchQuery,
                userId: Boolean(userId),
                resultCount: filteredCachedResults.length
            });
            return res.json({
                tipo_respuesta: 'resultados',
                intencion_detectada: {
                    busqueda: searchQuery,
                    condicion: llmAnalysis.condition,
                    modo_condicion: conditionMode,
                    desde_cache: true
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
                    estimatedCostUsd: cacheEstimatedCostUsd,
                    search_tier: effectiveSearchTier,
                    deep_search_enabled: deepSearchEnabled
                },
                region: {
                    country: countryCode,
                    currency: regionCfg.currency,
                    locale: regionCfg.locale,
                    label: regionCfg.regionLabel
                },
                top_5_baratos: filteredCachedResults,
                advertencia_uso: usageWarning,
                vip_auto_alert: null
            });
        }

        // Check if aborted
        if (abortController.signal.aborted) {
            clearTimeout(timeoutId);
            return res.status(504).json({ error: 'La búsqueda fue cancelada por timeout.' });
        }

        // Extract preferred store keys from intent memory for adaptive site: operators
        const preferredStoreKeys = Object.keys(intentBoostMap).filter(k => intentBoostMap[k] < 0).slice(0, 4);

        bumpProviderCostMetrics(costMetrics, {
            intentType: llmAnalysis.intent_type,
            radius,
            lat,
            lng,
            broadProfile: llmAnalysis.broadProfile || null,
            brandOfficialQuery: effectiveBrandOfficialQuery,
            alternativeQueries: cleanAlternativeQueries,
            productCategory: llmAnalysis.productCategory || '',
            preferredStoreKeys,
            queryType: llmAnalysis.queryType || 'generic'
        });

        console.log(`[Search Pipeline] Buscando: "${searchQuery}" | radius=${radius} | lat=${lat} | lng=${lng} | intent=${llmAnalysis.intent_type}`);
        let shoppingResults;
        try {
            shoppingResults = await shoppingService.searchGoogleShopping(
                shoppingBaseQuery,
                radius,
                lat,
                lng,
                llmAnalysis.intent_type,
                abortController.signal,
                conditionMode,
                countryCode,
                cleanAlternativeQueries,
                llmAnalysis.productCategory || '',
                preferredStoreKeys,
                effectiveBrandOfficialQuery,
                {
                    webQuery: searchQuery,
                    broadProfile: llmAnalysis.broadProfile || null,
                    queryType: llmAnalysis.queryType || 'generic',
                    searchTier: effectiveSearchTier,
                    deepSearchEnabled
                }
            );
        } catch (shoppingError) {
            console.error(`[Search Pipeline] Shopping search failed gracefully: ${shoppingError.message}`);
            shoppingResults = [];
        }
        if (!Array.isArray(shoppingResults)) shoppingResults = [];
        
        // Extract optimization metadata and update cost metrics
        if (shoppingResults._optimizationMeta) {
            if (shoppingResults._optimizationMeta.mlPrioritySkipped) {
                costMetrics.serperMlPrioritySkipped += 1;
            }
            if (shoppingResults._optimizationMeta.directScraperCalls) {
                costMetrics.directScraperCalls += shoppingResults._optimizationMeta.directScraperCalls;
            }
            delete shoppingResults._optimizationMeta; // Clean up metadata
        }

        const hasStrongPrimaryResultSet = shoppingResults.length >= 6;
        const hasAlternativeSignals = cleanAlternativeQueries.length > 0 || Boolean(effectiveBrandOfficialQuery);

        if (shoppingResults.length < 3 || (!hasStrongPrimaryResultSet && !hasAlternativeSignals && shoppingResults.length < 5)) {
            console.warn(`[Search Pipeline] âš ï¸ CERO resultados para "${searchQuery}".Serper key: ${process.env.SERPER_API_KEY ? 'SET' : 'MISSING'} `);

            const rescueSeenKeys = new Set(shoppingResults.map(item => String(item?.url || '').split('?')[0].toLowerCase()).filter(Boolean));
            const rescuedQueries = [];
            const simplifiedQuery = simplifySearchQuery(searchQuery);
            if (!isLocalFastMode && simplifiedQuery.length < searchQuery.length) {
                rescuedQueries.push({
                    label: 'simplified',
                    query: simplifiedQuery,
                    alternativeQueries: [],
                    preferredStoreKeys: [],
                    brandOfficialQuery: effectiveBrandOfficialQuery
                });
            }

            (llmAnalysis.alternativeQueries || [])
                .filter(Boolean)
                .slice(0, 1)
                .forEach((altQuery, index) => {
                    if (String(altQuery).trim().toLowerCase() === String(searchQuery).trim().toLowerCase()) return;
                    rescuedQueries.push({
                        label: `alternative_${index + 1}`,
                        query: altQuery,
                        alternativeQueries: [],
                        preferredStoreKeys,
                        brandOfficialQuery: null
                    });
                });

            if (shoppingResults.length <= 2 && effectiveBrandOfficialQuery && String(effectiveBrandOfficialQuery).trim().toLowerCase() !== String(searchQuery).trim().toLowerCase()) {
                rescuedQueries.push({
                    label: 'official',
                    query: effectiveBrandOfficialQuery,
                    alternativeQueries: [],
                    preferredStoreKeys,
                    brandOfficialQuery: effectiveBrandOfficialQuery
                });
            }

            if (deepSearchEnabled && shoppingResults.length <= 4) {
                // Smart site: operator queries for deep mode — directly target marketplaces
                const meliDomain = countryCode === 'US' ? 'mercadolibre.com'
                    : countryCode === 'MX' ? 'mercadolibre.com.mx'
                    : countryCode === 'AR' ? 'mercadolibre.com.ar'
                    : countryCode === 'CO' ? 'mercadolibre.com.co'
                    : countryCode === 'CL' ? 'mercadolibre.cl'
                    : 'mercadolibre.com';
                const amazonDomain = countryCode === 'US' ? 'amazon.com'
                    : countryCode === 'MX' ? 'amazon.com.mx'
                    : 'amazon.com';
                rescuedQueries.push({
                    label: 'deep_meli_site',
                    query: `site:${meliDomain} "${searchQuery}" nuevo`,
                    alternativeQueries: [],
                    preferredStoreKeys: [],
                    brandOfficialQuery: null
                });
                rescuedQueries.push({
                    label: 'deep_amazon_site',
                    query: `site:${amazonDomain} "${searchQuery}" nuevo`,
                    alternativeQueries: [],
                    preferredStoreKeys: [],
                    brandOfficialQuery: null
                });
            }

            const maxRescueQueries = deepSearchEnabled
                ? (shoppingResults.length === 0 ? 4 : 3)
                : (isVipSearch ? (shoppingResults.length === 0 ? 3 : 2) : (shoppingResults.length === 0 ? 2 : 1));
            const boundedRescuedQueries = rescuedQueries.slice(0, maxRescueQueries);

            // PERF: Run ALL rescue queries in PARALLEL instead of sequentially (saves 8-16s)
            costMetrics.retrySearches += boundedRescuedQueries.length;
            boundedRescuedQueries.forEach((rescueStep) => bumpProviderCostMetrics(costMetrics, {
                intentType: llmAnalysis.intent_type,
                radius,
                lat,
                lng,
                broadProfile: null,
                brandOfficialQuery: rescueStep.brandOfficialQuery || null,
                alternativeQueries: rescueStep.alternativeQueries || [],
                productCategory: llmAnalysis.productCategory || '',
                preferredStoreKeys: rescueStep.preferredStoreKeys || [],
                queryType: 'brand_model'
            }));
            console.log(`[Search Pipeline] Running ${boundedRescuedQueries.length} rescue queries in parallel...`);
            const rescuePromises = boundedRescuedQueries.map(rescueStep =>
                shoppingService.searchGoogleShopping(
                    rescueStep.query,
                    radius,
                    lat,
                    lng,
                    llmAnalysis.intent_type,
                    abortController.signal,
                    conditionMode,
                    countryCode,
                    rescueStep.alternativeQueries || [],
                    llmAnalysis.productCategory || '',
                    rescueStep.preferredStoreKeys || [],
                    rescueStep.brandOfficialQuery,
                    { queryType: 'brand_model', rescue: true, searchTier: effectiveSearchTier, deepSearchEnabled }
                ).catch(err => {
                    console.warn(`[Search Pipeline] Rescue "${rescueStep.label}" failed: ${err.message}`);
                    return [];
                })
            );
            const rescueResults = await Promise.all(rescuePromises);
            rescueResults.forEach(resultSet => {
                if (!Array.isArray(resultSet)) return;
                resultSet.forEach(item => {
                    const normalizedKey = String(item?.url || '').split('?')[0].toLowerCase();
                    if (!normalizedKey || rescueSeenKeys.has(normalizedKey)) return;
                    rescueSeenKeys.add(normalizedKey);
                    shoppingResults.push(item);
                });
            });
        }

        shoppingResults = shoppingResults.map((product) => {
            const resolvedOriginalUrl = String(product.urlOriginal || product.url || '').trim();
            const resolvedStore = product.tienda || product.fuente || product.source || '';
            const resolvedAffiliateUrl = String(product.urlMonetizada || '').trim()
                || affiliateManager.generateAffiliateLink(resolvedOriginalUrl, resolvedStore)
                || resolvedOriginalUrl;
            const resolvedTitle = product.titulo || product.title || 'Sin título';
            const clonePenalty = computeClonePenalty(resolvedTitle, searchQuery);
            const modelMatchScore = computeModelMatchScore(resolvedTitle, searchQuery);
            const qualityFlags = [];
            if (clonePenalty >= 0.34) qualityFlags.push('likely_clone');
            if (modelMatchScore <= 0.35) qualityFlags.push('model_mismatch');
            return {
                ...product,
                titulo: resolvedTitle,
                precio: product.precio != null ? product.precio : product.price,
                tienda: resolvedStore,
                fuente: product.fuente || resolvedStore,
                urlOriginal: resolvedOriginalUrl,
                urlMonetizada: resolvedAffiliateUrl,
                imagen: product.imagen || product.image || '',
                currency: product.currency || regionCfg.currency,
                countryCode: product.countryCode || countryCode,
                _clonePenalty: clonePenalty,
                _modelMatchScore: modelMatchScore,
                _qualityFlags: qualityFlags
            };
        });

        const qualityFilteredResults = shoppingResults.filter(product => {
            if (product._clonePenalty >= 0.5 && product._modelMatchScore <= 0.25) return false;
            return true;
        });

        const finalProductsConCupones = await Promise.all(qualityFilteredResults.map(async (product) => {
            const tienda = (product.tienda || product.fuente || '').toLowerCase();
            let injectedCoupon = null;
            let couponDetails = null;
            let couponDisclaimer = null;
            let couponSourceUrl = null;

            if (llmAnalysis.cupon && llmAnalysis.cupon.length > 2) {
                injectedCoupon = llmAnalysis.cupon;
                couponDetails = 'Cupón sugerido por IA';
                couponDisclaimer = 'Cupón sugerido por IA — verifica vigencia y condiciones antes de usarlo.';
            } else {
                const dynamicCoupon = await couponService.getBestCouponForStore(tienda, countryCode, {
                    vipOnly: isVipSearch,
                    allowLiveLookup: isVipSearch
                });
                if (dynamicCoupon) {
                    injectedCoupon = dynamicCoupon.code;
                    couponDetails = dynamicCoupon.discount;
                    couponDisclaimer = dynamicCoupon.disclaimer || null;
                    couponSourceUrl = dynamicCoupon.source_url || null;
                }
                const storeCoupons = !injectedCoupon ? couponService.getCouponsForStore(tienda, countryCode) : [];
                if (storeCoupons && storeCoupons.length > 0) {
                    injectedCoupon = storeCoupons[0].code;
                    couponDetails = storeCoupons[0].discount;
                    couponDisclaimer = storeCoupons[0].disclaimer || null;
                    couponSourceUrl = storeCoupons[0].source_url || null;
                }
            }

            if (injectedCoupon && !product.cupon) {
                product.cupon = injectedCoupon;
                product.couponDetails = couponDetails;
                product.couponDisclaimer = couponDisclaimer;
                product.couponSourceUrl = couponSourceUrl;
            }
            product.bestBuyScore = buildBestBuyScore(product);
            product.bestBuyLabel = buildBestBuyLabel(product.bestBuyScore);
            return product;
        }));

        // Deep Research: compute relative price rank across all results before deep scoring
        if (deepSearchEnabled && finalProductsConCupones.length > 1) {
            const validPrices = finalProductsConCupones
                .map(p => Number(p.precio || p.price || 0))
                .filter(p => p > 0);
            const minPrice = Math.min(...validPrices);
            const maxPrice = Math.max(...validPrices);
            const priceRange = maxPrice - minPrice || 1;
            finalProductsConCupones.forEach(p => {
                const price = Number(p.precio || p.price || 0);
                if (price > 0) {
                    // 1 = cheapest, 0 = most expensive
                    p._deepPriceRank = 1 - ((price - minPrice) / priceRange);
                } else {
                    p._deepPriceRank = 0.35;
                }
                // Re-score with deep mode weights
                p.bestBuyScore = buildBestBuyScore(p, true);
                p.bestBuyLabel = buildBestBuyLabel(p.bestBuyScore);
            });
        }

        const comparablePrices = finalProductsConCupones
            .map(p => Number(p.precio || p.price || 0))
            .filter(price => Number.isFinite(price) && price > 0);
        const comparableAverage = comparablePrices.length > 0
            ? comparablePrices.reduce((sum, value) => sum + value, 0) / comparablePrices.length
            : null;
        finalProductsConCupones.forEach(product => {
            const productPrice = Number(product.precio || product.price || 0);
            if (comparableAverage && productPrice > 0) {
                const diffPct = Math.round(((productPrice - comparableAverage) / comparableAverage) * 100);
                product.priceDiffPct = diffPct;
                product.verifiedPriceDelta = diffPct <= -10
                    ? {
                        pct: Math.abs(diffPct),
                        label: `ML verificado: ${Math.abs(diffPct)}% más barato que el promedio`
                    }
                    : null;
            } else {
                product.priceDiffPct = null;
                product.verifiedPriceDelta = null;
            }
        });

        finalProductsConCupones.sort((a, b) => Number(b.bestBuyScore || 0) - Number(a.bestBuyScore || 0));

        // Deep Research: AI-powered comparative analysis and variant suggestions
        let deepResearchEnhancements = null;
        if (deepSearchEnabled && finalProductsConCupones.length > 0) {
            try {
                const enhancementResult = await deepResearchEnhancer.enhanceResults(finalProductsConCupones, {
                    query: searchQuery,
                    deepSearchEnabled,
                    countryCode,
                    currency: regionCfg.currency,
                    productCategory: llmAnalysis.productCategory || ''
                });
                deepResearchEnhancements = enhancementResult.enhancements;
            } catch (enhanceError) {
                console.warn('[Deep Research] Enhancement failed:', enhanceError.message);
            }
        }

        let vipAutoAlert = null;
        if (isVipSearch && userId && finalProductsConCupones.length > 0) {
            vipAutoAlert = await createVipAutoAlert({
                userId,
                product: finalProductsConCupones[0]
            });
        }

        // Clear master timeout at the end
        clearTimeout(timeoutId);

        // 6. Devolver respuesta estandarizada al frontend
        const estimatedCostUsd = estimateSearchCostUsd(costMetrics);
        await logSuccessfulSearchUsage({
            userId,
            query: searchQuery,
            deepSearchEnabled,
            countryCode
        });
        logSearchCostMetrics('search.results', costMetrics, {
            query: searchQuery,
            userId: Boolean(userId),
            resultCount: finalProductsConCupones.length
        });
        return res.json({
            tipo_respuesta: 'resultados',
            intencion_detectada: {
                busqueda: searchQuery,
                condicion: llmAnalysis.condition,
                modo_condicion: conditionMode
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
                estimated_cost_breakdown: buildCostBreakdown(costMetrics)
            },
            deep_research_analysis: deepResearchEnhancements?.comparativeAnalysis || null,
            suggested_variants: deepResearchEnhancements?.suggestedVariants || null,
            best_buy_pick: finalProductsConCupones.length > 0
                ? {
                    title: finalProductsConCupones[0].titulo,
                    store: finalProductsConCupones[0].tienda,
                    price: finalProductsConCupones[0].precio,
                    score: finalProductsConCupones[0].bestBuyScore,
                    label: finalProductsConCupones[0].bestBuyLabel,
                    url: finalProductsConCupones[0].urlMonetizada || finalProductsConCupones[0].urlOriginal
                }
                : null,
            region: {
                country: countryCode,
                currency: regionCfg.currency,
                locale: regionCfg.locale,
                label: regionCfg.regionLabel
            },
            top_5_baratos: finalProductsConCupones,
            sugerencias: buildFallbackSuggestions(searchQuery, llmAnalysis.alternativeQueries, countryCode),
            advertencia_uso: usageWarning,
            lumu_coins_awarded: (userId && finalProductsConCupones.length > 2) ? 1 : 0,
            vip_auto_alert: vipAutoAlert
        });

    } catch (error) {
        // Clear timeout on error
        if (typeof timeoutId !== 'undefined') clearTimeout(timeoutId);
        
        console.error('ðŸ”¥ðŸ”¥ðŸ”¥ ERROR FATAL en /buscar:', error.stack || error);
        try {
            logSearchCostMetrics('search.error', costMetrics, {
                query,
                userId: Boolean(userId),
                error: error.message
            });
        } catch { }
        
        // No exponer stack trace en producción
        const isDev = process.env.NODE_ENV !== 'production';
        res.status(500).json({ 
            error: 'Ocurrió un error al buscar las mejores ofertas. Si estás probando en local, asegúrate de configurar las variables de entorno.',
            ...(isDev && { details: error.message, stack: error.stack })
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
        const { data: profile } = await supabase.from('profiles').select('plan, is_premium').eq('id', userId).single();
        if (!profile || (!profile.is_premium && profile.plan !== 'b2b' && profile.plan !== 'b2b_annual')) {
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

        let usageWarning = null;
        if (!error) {
            if (count >= reqLimit) {
                return res.status(402).json({ error: `Límite mensual B2B alcanzado(${reqLimit} búsquedas).Por favor espera a tu siguiente ciclo para más lotes.`, upgrade_required: false });
            }
            if (count >= reqLimit * 0.9) {
                usageWarning = `âš ï¸ Límite mensual al ${Math.floor((count / reqLimit) * 100)}% (${count}/${reqLimit}).`;
            }
        }

        // Hard limit: max 5 queries per request (Vercel 60s timeout)
        const queriesToProcess = queries.slice(0, 5);

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
    try {
        const userId = req.userId || null;
        const BONUS_SEARCHES = 3;
        const CLAIM_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour between claims
        const rewardedAdTagUrl = process.env.REWARDED_AD_TAG_URL || '';

        if (!rewardedAdTagUrl.trim()) {
            return res.status(409).json({ error: 'Las búsquedas extra por anuncio no están disponibles actualmente.' });
        }

        if (!userId) {
            return res.status(401).json({ error: 'Inicia sesión para reclamar búsquedas extra.' });
        }

        if (!supabase) {
            return res.json({ success: true, bonus: BONUS_SEARCHES, msg: 'Modo local (sin Supabase)' });
        }

        // SECURITY FIX SEC-1: Rate-limit claims to 1 per hour per user/IP
        const claimKey = `claim:user:${userId}`;
        const oneHourAgo = new Date(Date.now() - CLAIM_COOLDOWN_MS).toISOString();

        try {
            const { count, error: claimCheckErr } = await supabase
                .from('rate_limits')
                .select('*', { count: 'exact', head: true })
                .eq('ip', claimKey)
                .gte('created_at', oneHourAgo);

            if (!claimCheckErr && count > 0) {
                return res.status(429).json({
                    error: 'Ya reclamaste búsquedas extra recientemente. Intenta de nuevo en 1 hora.',
                    retry_after: 3600
                });
            }
        } catch (e) {
            console.warn('[ClaimReward] Rate-limit check failed, allowing:', e.message);
        }

        // Log this claim (fire & forget)
        supabase.from('rate_limits').insert({ ip: claimKey, created_at: new Date().toISOString() }).then(() => {}).catch(() => {});

        const creditEntries = [];
        for (let i = 0; i < BONUS_SEARCHES; i++) {
            creditEntries.push({ ip: `bonus:user:${userId}`, created_at: new Date().toISOString() });
        }
        await supabase.from('rate_limits').insert(creditEntries);

        return res.json({ success: true, bonus: BONUS_SEARCHES });
    } catch (err) {
        console.error('[Reward] Error:', err);
        return res.status(500).json({ error: 'Error al reclamar recompensa' });
    }
};

// NUEVO: Fase 6 - Lumu Coins (with real 1-hour VIP unlock)
exports.claimSignupBonus = async (req, res) => {
    try {
        const userId = req.userId || null;
        const BONUS_SEARCHES = 2;
        const MAX_SIGNUP_BONUS_ACCOUNT_AGE_MS = 7 * 24 * 60 * 60 * 1000;

        if (!userId) {
            return res.status(401).json({ error: 'Inicia sesión para reclamar el bono de bienvenida.' });
        }

        if (!supabase) {
            return res.json({ success: true, bonus: BONUS_SEARCHES, msg: 'Modo local (sin Supabase)' });
        }

        const bonusKey = `signup-bonus:user:${userId}`;
        const { count, error: bonusCheckErr } = await supabase
            .from('rate_limits')
            .select('*', { count: 'exact', head: true })
            .eq('ip', bonusKey);

        if (!bonusCheckErr && count > 0) {
            return res.json({ success: true, bonus: 0, already_claimed: true });
        }

        const { data: profile, error: profileErr } = await supabase
            .from('profiles')
            .select('created_at')
            .eq('id', userId)
            .maybeSingle();

        if (profileErr) {
            throw profileErr;
        }

        const createdAtMs = profile?.created_at ? new Date(profile.created_at).getTime() : 0;
        if (!createdAtMs || Number.isNaN(createdAtMs)) {
            return res.status(403).json({ error: 'No se pudo validar la antigüedad de tu cuenta para este bono.' });
        }

        if ((Date.now() - createdAtMs) > MAX_SIGNUP_BONUS_ACCOUNT_AGE_MS) {
            return res.status(403).json({ error: 'El bono de bienvenida solo está disponible para cuentas recientes.' });
        }

        await supabase.from('rate_limits').insert({ ip: bonusKey, created_at: new Date().toISOString() });

        const creditEntries = [];
        for (let i = 0; i < BONUS_SEARCHES; i++) {
            creditEntries.push({ ip: `bonus:user:${userId}`, created_at: new Date().toISOString() });
        }
        await supabase.from('rate_limits').insert(creditEntries);

        return res.json({ success: true, bonus: BONUS_SEARCHES });
    } catch (err) {
        console.error('[SignupBonus] Error:', err);
        return res.status(500).json({ error: 'Error al reclamar bono de bienvenida' });
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

