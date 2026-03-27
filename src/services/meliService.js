'use strict';

/**
 * meliService.js — Direct Mercado Libre API integration
 * Uses the public Items Search API (no OAuth needed for read-only searches)
 * Docs: https://developers.mercadolibre.com/es_ar/buscar-productos
 */

const fetchWithTimeout = require('../utils/fetchWithTimeout');

const MELI_APP_ID = process.env.MERCADOLIBRE_APP_ID;

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
        originalPrice: originalPrice,
        moneda: currency,
        tienda: `Mercado Libre (${seller})`,
        source: 'Mercado Libre',
        urlOriginal: productUrl,
        url: productUrl,
        imagen: thumbnail,
        shippingText: shippingText || undefined,
        condition: conditionLabel,
        isLocalStore: false,
        hasStockSignal: item.available_quantity > 0,
        isPotentiallyUnavailable: item.available_quantity === 0,
        priceConfidence: 0.95, // Direct API price is highly reliable
        priceSource: 'meli_api', // Prevents applyResultMetadata from overwriting confidence
        resultSource: 'meli_api',
        matchScore: computeTokenOverlap(query, item.title),
        storeTier: 1, // MELI is a trusted tier-1 marketplace
        isKnownStoreDomain: true,
        isDirectProductPage: true,
        _meliItemId: item.id,
        _meliSiteId: siteId
    };
}

/**
 * Search Mercado Libre directly via API for a given query
 * @param {string} query - Search term
 * @param {string} countryCode - ISO country code (MX, AR, CO, CL, …)
 * @param {Object} options
 * @param {number} [options.limit=50] - Max items to fetch
 * @param {AbortSignal} [options.signal] - Abort signal for timeout propagation
 * @returns {Promise<Array>} Normalised product results
 */
async function searchMeli(query, countryCode = 'MX', options = {}) {
    const siteId = COUNTRY_TO_SITE_ID[String(countryCode).toUpperCase()] || 'MLM';
    const limit = Math.min(Number(options.limit) || 50, 50); // API cap is 50 per call
    const currency = countryCode === 'AR' ? 'ARS' : countryCode === 'CO' ? 'COP' : countryCode === 'CL' ? 'CLP' : countryCode === 'BR' ? 'BRL' : 'MXN';
    const conditionMode = String(options.conditionMode || 'all').toLowerCase();

    const params = new URLSearchParams({
        q: String(query).trim(),
        limit: String(limit),
        sort: 'price_asc' // cheapest first — key goal of deep search
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

    console.log(`[MELI API] Searching site=${siteId} q="${query}" limit=${limit}`);

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

        const normalised = validItems.map(item => normaliseMeliItem(item, siteId, currency, query));
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

module.exports = { searchMeli };
