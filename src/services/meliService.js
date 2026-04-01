'use strict';

/**
 * meliService.js — Direct Mercado Libre API integration
 * Uses the public Items Search API (no OAuth needed for read-only searches)
 * Docs: https://developers.mercadolibre.com/es_ar/buscar-productos
 */

const fetchWithTimeout = require('../utils/fetchWithTimeout');

const MELI_APP_ID = process.env.MERCADOLIBRE_APP_ID;
const flashDealsCache = new Map();

// Maps ISO country code → MELI site_id
const COUNTRY_TO_SITE_ID = {
    MX: 'MLM',
    AR: 'MLA',
    CO: 'MCO',
    CL: 'MLC',
    BR: 'MLB',
    PE: 'MPE',
    UY: 'MLU',
    BO: 'MBO',
    EC: 'MEC',
    PY: 'MPY',
    VE: 'MLV',
    US: 'MLC' // fallback to Chile for US; MELI doesn't have a US site
};

const MELI_BASE = 'https://api.mercadolibre.com';

function getCurrencyByCountry(countryCode = 'MX') {
    return countryCode === 'AR' ? 'ARS' : countryCode === 'CO' ? 'COP' : countryCode === 'CL' ? 'CLP' : countryCode === 'BR' ? 'BRL' : countryCode === 'PE' ? 'PEN' : 'MXN';
}

/**
 * Compute a normalised [0,1] token overlap score between two strings.
 * Used to fill matchScore for MELI API results.
 */
function computeTokenOverlap(query, title) {
    const tokenize = (str) => String(str || '')
        .toLowerCase()
        .replace(/[^a-z0-9áéíóúñü\s]/gi, ' ')
        .split(/\s+/)
        .filter(t => t.length > 2);
    const qTokens = new Set(tokenize(query));
    const tTokens = tokenize(title);
    if (!qTokens.size || !tTokens.length) return 0.5;
    const hits = tTokens.filter(t => qTokens.has(t)).length;
    return Math.min(1, hits / qTokens.size);
}

/**
 * Normalise a MELI item into the same shape used by shoppingService results
 */
function normaliseMeliItem(item, siteId, currency, query) {
    const price = Number(item.price);
    const originalPrice = item.original_price ? Number(item.original_price) : null;
    const hasDiscount = Number.isFinite(originalPrice) && originalPrice > price;
    const seller = item.seller?.nickname || item.seller_id || 'Mercado Libre';
    // Upgrade from tiny 30x30 (-I.jpg) to 270x270 (-O.jpg) thumbnail
    const rawThumb = item.thumbnail ? item.thumbnail.replace(/^http:\/\//, 'https://') : null;
    const thumbnail = rawThumb ? rawThumb.replace(/-I(\.jpg)$/i, '-O$1') : null;

    // Build purchase URL — prefer permalink, fall back to constructed URL
    const productUrl = item.permalink || `https://www.mercadolibre.com/p/${item.id}`;

    const shippingText = item.shipping?.free_shipping
        ? 'Envío gratis'
        : item.shipping?.logistic_type === 'fulfillment'
            ? 'Envío Mercado Envíos'
            : '';

    const conditionLabel = item.condition === 'new' ? 'Nuevo' : item.condition === 'used' ? 'Usado' : '';

    return {
        titulo: String(item.title || '').trim(),
        title: String(item.title || '').trim(),
        precio: price,
        price: price,
        originalPrice: hasDiscount ? originalPrice : null,
        moneda: currency,
        tienda: `Mercado Libre (${seller})`,
        source: 'Mercado Libre',
        urlOriginal: productUrl,
        url: productUrl,
        imagen: thumbnail,
        snippet: hasDiscount ? `Oferta ${Math.round((1 - price / originalPrice) * 100)}% · Antes $${originalPrice}` : '',
        shippingText: shippingText || undefined,
        condition: conditionLabel,
        isLocalStore: false,
        hasStockSignal: item.available_quantity > 0,
        isPotentiallyUnavailable: item.available_quantity === 0,
        priceConfidence: 0.95, // Direct API price is highly reliable
        priceSource: 'meli_api', // Prevents applyResultMetadata from overwriting confidence
        resultSource: 'meli_api',
        discountPct: hasDiscount ? Math.round((1 - price / originalPrice) * 100) : 0,
        isDealPrice: hasDiscount,
        hasStrikeThroughPrice: hasDiscount,
        couponApplied: false,
        matchScore: computeTokenOverlap(query, item.title),
        storeTier: 1, // MELI is a trusted tier-1 marketplace
        isKnownStoreDomain: true,
        isDirectProductPage: true,
        _meliItemId: item.id,
        _meliSiteId: siteId,
        _meliSoldQuantity: Number(item.sold_quantity || 0),
        _meliCatalogListing: Boolean(item.catalog_listing),
        _meliOfficialStoreId: item.official_store_id || null,
        _meliThumbnailId: rawThumb || null
    };
}

/**
 * Search Mercado Libre directly via API for a given query
 * @param {string} query - Search term
 * @param {string} countryCode - ISO country code (MX, AR, CO, CL, …)
 * @param {Object} options
 * @param {number} [options.limit=50] - Max items to fetch
 * @param {number} [options.offset=0] - Offset for pagination
 * @param {string} [options.sort=price_asc] - MELI sort mode
 * @param {AbortSignal} [options.signal] - Abort signal for timeout propagation
 * @returns {Promise<Array>} Normalised product results
 */
async function searchMeli(query, countryCode = 'MX', options = {}) {
    const siteId = COUNTRY_TO_SITE_ID[String(countryCode).toUpperCase()] || 'MLM';
    const limit = Math.min(Number(options.limit) || 50, 50); // API cap is 50 per call
    const offset = Math.max(0, Number(options.offset) || 0);
    const sort = String(options.sort || 'price_asc').trim() || 'price_asc';
    const currency = getCurrencyByCountry(countryCode);
    const conditionMode = String(options.conditionMode || 'all').toLowerCase();

    const params = new URLSearchParams({
        q: String(query).trim(),
        limit: String(limit),
        sort,
        offset: String(offset)
    });
    if (conditionMode === 'new') {
        params.set('condition', 'new');
    } else if (conditionMode === 'used') {
        params.set('condition', 'used');
    }
    if (MELI_APP_ID) {
        params.set('app_id', MELI_APP_ID);
    }

    const url = `${MELI_BASE}/sites/${siteId}/search?${params.toString()}`;

    console.log(`[MELI API] Searching site=${siteId} q="${query}" limit=${limit} offset=${offset} sort=${sort}`);

    try {
        const response = await fetchWithTimeout(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'consiguemelo/1.0'
            },
            timeout: 10000,
            signal: options.signal
        });

        if (!response.ok) {
            console.warn(`[MELI API] Non-OK status ${response.status} for query "${query}"`);
            return [];
        }

        const data = await response.json();
        const items = data?.results;

        if (!Array.isArray(items) || items.length === 0) {
            console.log(`[MELI API] No results for "${query}" on ${siteId}`);
            return [];
        }

        // Filter: only items with a valid price and available stock
        const validItems = items.filter(item =>
            Number.isFinite(Number(item.price)) &&
            Number(item.price) > 0 &&
            item.available_quantity !== 0
        );

        const page = Math.floor(offset / Math.max(1, limit)) + 1;
        const normalised = validItems.map(item => ({
            ...normaliseMeliItem(item, siteId, currency, query),
            _meliQuery: String(query).trim(),
            _meliOffset: offset,
            _meliLimit: limit,
            _meliPage: page,
            _meliSort: sort
        }));
        console.log(`[MELI API] Got ${normalised.length} valid items for "${query}"`);
        return normalised;

    } catch (err) {
        if (err.name === 'AbortError' || err.name === 'TimeoutError') {
            console.warn(`[MELI API] Request timed out for "${query}"`);
        } else {
            console.error(`[MELI API] Error searching "${query}":`, err.message);
        }
        return [];
    }
}

async function fetchMeliSearch(url, signal) {
    const response = await fetchWithTimeout(url, {
        method: 'GET',
        headers: {
            'Accept': 'application/json',
            'User-Agent': 'consiguemelo/1.0'
        },
        timeout: 10000,
        signal
    });

    if (!response.ok) {
        throw new Error(`meli_status_${response.status}`);
    }

    return response.json();
}

function mapFlashDealItem(item, siteId, currency, countryCode) {
    const price = Number(item?.price);
    const originalPrice = Number(item?.original_price);
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(originalPrice) || originalPrice <= price) {
        return null;
    }

    const discountPct = Math.round((1 - price / originalPrice) * 100);
    const rawThumb = item.thumbnail ? String(item.thumbnail).replace(/^http:\/\//, 'https://') : '';
    const image = rawThumb ? rawThumb.replace(/-I(\.jpg)$/i, '-O$1') : '';

    return {
        id: item.id,
        title: String(item.title || '').trim(),
        price,
        originalPrice,
        discountPct,
        image,
        url: item.permalink || `https://www.mercadolibre.com/p/${item.id}`,
        source: 'Mercado Libre',
        shipping: item.shipping?.free_shipping ? 'Envío gratis' : '',
        currencyCode: currency,
        countryCode: String(countryCode || 'MX').toUpperCase(),
        soldQuantity: Number(item.sold_quantity || 0)
    };
}

async function getFlashDeals(countryCode = 'MX', limit = 8, signal) {
    const normalizedCountry = String(countryCode || 'MX').toUpperCase();
    const siteId = COUNTRY_TO_SITE_ID[normalizedCountry] || 'MLM';
    const currency = getCurrencyByCountry(normalizedCountry);
    const normalizedLimit = Math.max(1, Math.min(Number(limit) || 8, 12));
    const cacheKey = `deals:${siteId}`;
    const cached = flashDealsCache.get(cacheKey);

    if (cached && (Date.now() - cached.createdAt) < (30 * 60 * 1000)) {
        return cached.items.slice(0, normalizedLimit);
    }

    const dealParams = new URLSearchParams({
        tag: 'deal_of_the_day',
        sort: 'relevance',
        limit: '20'
    });
    const fallbackParams = new URLSearchParams({
        q: normalizedCountry === 'US' ? 'deals' : 'ofertas',
        sort: 'best_sellers',
        limit: '30'
    });
    if (MELI_APP_ID) {
        dealParams.set('app_id', MELI_APP_ID);
        fallbackParams.set('app_id', MELI_APP_ID);
    }

    const dealUrl = `${MELI_BASE}/sites/${siteId}/search?${dealParams.toString()}`;
    const fallbackUrl = `${MELI_BASE}/sites/${siteId}/search?${fallbackParams.toString()}`;

    try {
        let data = await fetchMeliSearch(dealUrl, signal).catch(() => null);
        let items = Array.isArray(data?.results) ? data.results : [];
        let mapped = items
            .map(item => mapFlashDealItem(item, siteId, currency, normalizedCountry))
            .filter(Boolean)
            .sort((a, b) => (b.discountPct - a.discountPct) || (b.soldQuantity - a.soldQuantity));

        if (mapped.length === 0) {
            data = await fetchMeliSearch(fallbackUrl, signal).catch(() => null);
            items = Array.isArray(data?.results) ? data.results : [];
            mapped = items
                .map(item => mapFlashDealItem(item, siteId, currency, normalizedCountry))
                .filter(Boolean)
                .sort((a, b) => (b.discountPct - a.discountPct) || (b.soldQuantity - a.soldQuantity));
        }

        const trimmed = mapped.slice(0, normalizedLimit).map(({ soldQuantity, ...item }) => item);
        flashDealsCache.set(cacheKey, {
            createdAt: Date.now(),
            items: trimmed
        });
        return trimmed;
    } catch (err) {
        console.error(`[MELI API] Error loading flash deals for ${siteId}:`, err.message);
        return [];
    }
}

module.exports = { searchMeli, getFlashDeals };
