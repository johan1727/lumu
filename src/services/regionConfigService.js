/**
 * regionConfigService.js
 * Centralizes all country/region-specific configuration:
 * - Serper API params (gl, hl)
 * - Store domains for web search
 * - Store name mappings
 * - Currency and locale
 * - Trust tier overrides per region
 */

const REGION_CONFIGS = {
    MX: {
        countryCode: 'MX',
        gl: 'mx',
        hl: 'es',
        currency: 'MXN',
        locale: 'es-MX',
        currencySymbol: '$',
        searchSuffix: 'precio comprar',
        webSearchDomains: [
            'amazon.com.mx', 'mercadolibre.com.mx', 'walmart.com.mx', 'liverpool.com.mx', 'coppel.com', 'bestbuy.com.mx',
            'elektra.com.mx', 'costco.com.mx', 'sams.com.mx', 'officedepot.com.mx',
            'soriana.com', 'sears.com.mx', 'mx.shein.com', 'temu.com',
            'bodegaaurrera.com.mx', 'linio.com.mx', 'claroshop.com', 'sanborns.com.mx'
        ],
        storeMap: {
            'amazon.com.mx': 'Amazon MX',
            'mercadolibre.com.mx': 'Mercado Libre MX',
            'walmart.com.mx': 'Walmart MX',
            'liverpool.com.mx': 'Liverpool',
            'coppel.com': 'Coppel',
            'bestbuy.com.mx': 'Best Buy MX',
            'elektra.com.mx': 'Elektra',
            'costco.com.mx': 'Costco MX',
            'sams.com.mx': "Sam's Club MX",
            'officedepot.com.mx': 'OfficeDepot MX',
            'soriana.com': 'Soriana',
            'sears.com.mx': 'Sears MX',
            'mx.shein.com': 'Shein MX',
            'shein.com': 'Shein MX',
            'temu.com': 'Temu',
            'bodegaaurrera.com.mx': 'Bodega Aurrera',
            'linio.com.mx': 'Linio MX',
            'claroshop.com': 'Claro Shop',
            'sanborns.com.mx': 'Sanborns'
        },
        placesQuery: 'comprar',
        regionLabel: 'México'
    },

    CL: {
        countryCode: 'CL',
        gl: 'cl',
        hl: 'es',
        currency: 'CLP',
        locale: 'es-CL',
        currencySymbol: '$',
        searchSuffix: 'precio comprar chile',
        webSearchDomains: [
            'falabella.com', 'ripley.cl', 'paris.cl', 'lider.cl',
            'pcfactory.cl', 'solotodo.cl', 'mercadolibre.cl',
            'hites.com', 'abcdin.cl', 'lapolar.cl', 'easy.cl',
            'sodimac.cl', 'microplay.cl', 'spdigital.cl',
            'wom.cl', 'entel.cl', 'movistar.cl',
            'temu.com', 'aliexpress.com', 'amazon.com'
        ],
        storeMap: {
            'falabella.com': 'Falabella',
            'ripley.cl': 'Ripley',
            'paris.cl': 'Paris',
            'lider.cl': 'Lider',
            'pcfactory.cl': 'PC Factory',
            'solotodo.cl': 'SoloTodo',
            'mercadolibre.cl': 'Mercado Libre CL',
            'hites.com': 'Hites',
            'abcdin.cl': 'ABCDin',
            'lapolar.cl': 'La Polar',
            'easy.cl': 'Easy',
            'sodimac.cl': 'Sodimac',
            'microplay.cl': 'Microplay',
            'spdigital.cl': 'SP Digital',
            'wom.cl': 'WOM',
            'entel.cl': 'Entel',
            'movistar.cl': 'Movistar',
            'temu.com': 'Temu',
            'aliexpress.com': 'AliExpress',
            'amazon.com': 'Amazon US'
        },
        placesQuery: 'comprar',
        regionLabel: 'Chile'
    },

    CO: {
        countryCode: 'CO',
        gl: 'co',
        hl: 'es',
        currency: 'COP',
        locale: 'es-CO',
        currencySymbol: '$',
        searchSuffix: 'precio comprar colombia',
        webSearchDomains: [
            'falabella.com.co', 'exito.com', 'mercadolibre.com.co',
            'alkosto.com', 'ktronix.com', 'homecenter.com.co',
            'linio.com.co', 'olimpica.com', 'jumbo.com.co',
            'panamericana.com.co', 'amazon.com', 'temu.com'
        ],
        storeMap: {
            'falabella.com.co': 'Falabella CO',
            'exito.com': 'Éxito',
            'mercadolibre.com.co': 'Mercado Libre CO',
            'alkosto.com': 'Alkosto',
            'ktronix.com': 'Ktronix',
            'homecenter.com.co': 'Homecenter',
            'linio.com.co': 'Linio CO',
            'olimpica.com': 'Olímpica',
            'jumbo.com.co': 'Jumbo CO',
            'panamericana.com.co': 'Panamericana',
            'amazon.com': 'Amazon US',
            'temu.com': 'Temu'
        },
        placesQuery: 'comprar',
        regionLabel: 'Colombia'
    },

    AR: {
        countryCode: 'AR',
        gl: 'ar',
        hl: 'es',
        currency: 'ARS',
        locale: 'es-AR',
        currencySymbol: '$',
        searchSuffix: 'precio comprar argentina',
        webSearchDomains: [
            'mercadolibre.com.ar', 'fravega.com', 'garbarino.com',
            'musimundo.com', 'megatone.net', 'cetrogar.com.ar',
            'cotodigital.com.ar', 'carrefour.com.ar',
            'falabella.com.ar', 'tiendamovistar.com.ar',
            'amazon.com', 'temu.com'
        ],
        storeMap: {
            'mercadolibre.com.ar': 'Mercado Libre AR',
            'fravega.com': 'Frávega',
            'garbarino.com': 'Garbarino',
            'musimundo.com': 'Musimundo',
            'megatone.net': 'Megatone',
            'cetrogar.com.ar': 'Cetrogar',
            'cotodigital.com.ar': 'Coto Digital',
            'carrefour.com.ar': 'Carrefour AR',
            'falabella.com.ar': 'Falabella AR',
            'tiendamovistar.com.ar': 'Movistar AR',
            'amazon.com': 'Amazon US',
            'temu.com': 'Temu'
        },
        placesQuery: 'comprar',
        regionLabel: 'Argentina'
    },

    PE: {
        countryCode: 'PE',
        gl: 'pe',
        hl: 'es',
        currency: 'PEN',
        locale: 'es-PE',
        currencySymbol: 'S/',
        searchSuffix: 'precio comprar peru',
        webSearchDomains: [
            'falabella.com.pe', 'ripley.com.pe', 'plazavea.com.pe',
            'mercadolibre.com.pe', 'oechsle.pe', 'promart.pe',
            'sodimac.com.pe', 'hiraoka.com.pe', 'linio.com.pe',
            'amazon.com', 'temu.com'
        ],
        storeMap: {
            'falabella.com.pe': 'Falabella PE',
            'ripley.com.pe': 'Ripley PE',
            'plazavea.com.pe': 'Plaza Vea',
            'mercadolibre.com.pe': 'Mercado Libre PE',
            'oechsle.pe': 'Oechsle',
            'promart.pe': 'Promart',
            'sodimac.com.pe': 'Sodimac PE',
            'hiraoka.com.pe': 'Hiraoka',
            'linio.com.pe': 'Linio PE',
            'amazon.com': 'Amazon US',
            'temu.com': 'Temu'
        },
        placesQuery: 'comprar',
        regionLabel: 'Perú'
    },

    US: {
        countryCode: 'US',
        gl: 'us',
        hl: 'en',
        currency: 'USD',
        locale: 'en-US',
        currencySymbol: '$',
        searchSuffix: 'price buy',
        webSearchDomains: [
            'amazon.com', 'walmart.com', 'bestbuy.com', 'target.com',
            'ebay.com', 'newegg.com', 'costco.com', 'homedepot.com',
            'lowes.com', 'bhphotovideo.com', 'adorama.com',
            'temu.com', 'aliexpress.com'
        ],
        storeMap: {
            'amazon.com': 'Amazon',
            'walmart.com': 'Walmart',
            'bestbuy.com': 'Best Buy',
            'target.com': 'Target',
            'ebay.com': 'eBay',
            'newegg.com': 'Newegg',
            'costco.com': 'Costco',
            'homedepot.com': 'Home Depot',
            'lowes.com': "Lowe's",
            'bhphotovideo.com': 'B&H Photo',
            'adorama.com': 'Adorama',
            'temu.com': 'Temu',
            'aliexpress.com': 'AliExpress'
        },
        placesQuery: 'buy',
        regionLabel: 'United States'
    }
};

// Map of timezone prefixes to country codes for client-side fallback
const TIMEZONE_COUNTRY_MAP = {
    'America/Santiago': 'CL',
    'America/Punta_Arenas': 'CL',
    'America/Bogota': 'CO',
    'America/Buenos_Aires': 'AR',
    'America/Argentina': 'AR',
    'America/Cordoba': 'AR',
    'America/Mendoza': 'AR',
    'America/Lima': 'PE',
    'America/Mexico_City': 'MX',
    'America/Monterrey': 'MX',
    'America/Cancun': 'MX',
    'America/Merida': 'MX',
    'America/Chihuahua': 'MX',
    'America/Mazatlan': 'MX',
    'America/Hermosillo': 'MX',
    'America/Tijuana': 'MX',
    'America/New_York': 'US',
    'America/Chicago': 'US',
    'America/Denver': 'US',
    'America/Los_Angeles': 'US',
    'America/Phoenix': 'US',
    'America/Anchorage': 'US',
    'Pacific/Honolulu': 'US'
};

// Map language tags to likely countries (fallback)
const LANG_COUNTRY_MAP = {
    'es-cl': 'CL',
    'es-co': 'CO',
    'es-ar': 'AR',
    'es-pe': 'PE',
    'es-mx': 'MX',
    'es-ve': 'MX', // Venezuela → fallback to MX config for now
    'es-ec': 'PE', // Ecuador → similar stores to Peru
    'es-uy': 'AR', // Uruguay → similar to Argentina
    'es-py': 'AR', // Paraguay → similar to Argentina
    'es-bo': 'PE', // Bolivia → similar to Peru
    'en-us': 'US',
    'en-gb': 'US',
    'en': 'US'
};

/**
 * Detect country from Vercel headers (server-side, most reliable)
 */
function detectCountryFromHeaders(req) {
    // Vercel provides this automatically on all deployments
    const vercelCountry = (req.headers['x-vercel-ip-country'] || '').toUpperCase().trim();
    if (vercelCountry && REGION_CONFIGS[vercelCountry]) {
        return vercelCountry;
    }
    // Cloudflare fallback
    const cfCountry = (req.headers['cf-ipcountry'] || '').toUpperCase().trim();
    if (cfCountry && REGION_CONFIGS[cfCountry]) {
        return cfCountry;
    }
    return null;
}

/**
 * Detect country from client hints (Accept-Language header)
 */
function detectCountryFromAcceptLanguage(req) {
    const acceptLang = (req.headers['accept-language'] || '').toLowerCase();
    // Try exact match first (e.g., es-CL)
    for (const [langTag, country] of Object.entries(LANG_COUNTRY_MAP)) {
        if (acceptLang.startsWith(langTag) || acceptLang.includes(langTag)) {
            return country;
        }
    }
    return null;
}

/**
 * Main function: resolve country for a request.
 * Priority: 1) explicit param, 2) Vercel IP header, 3) Accept-Language, 4) default MX
 */
function resolveCountry(req, explicitCountry = null) {
    if (explicitCountry && REGION_CONFIGS[explicitCountry.toUpperCase()]) {
        return explicitCountry.toUpperCase();
    }
    const fromHeaders = detectCountryFromHeaders(req);
    if (fromHeaders) return fromHeaders;
    const fromLang = detectCountryFromAcceptLanguage(req);
    if (fromLang) return fromLang;
    return 'MX'; // default
}

/**
 * Get full region config for a country code
 */
function getRegionConfig(countryCode) {
    return REGION_CONFIGS[(countryCode || 'MX').toUpperCase()] || REGION_CONFIGS.MX;
}

function getPriorityWebDomains(countryCode, limit = 6) {
    const config = getRegionConfig(countryCode);
    return (config.webSearchDomains || []).slice(0, Math.max(1, limit));
}

/**
 * Build the Serper web search query with region-specific domains
 */
function buildWebSearchQuery(query, countryCode) {
    const config = getRegionConfig(countryCode);
    const siteFilters = getPriorityWebDomains(countryCode)
        .map(d => `site:${d}`)
        .join(' OR ');
    return `${query} ${config.searchSuffix} ${siteFilters}`;
}

function buildBroadWebSearchQuery(query, countryCode) {
    const config = getRegionConfig(countryCode);
    return `${query} ${config.searchSuffix}`.trim();
}

/**
 * Build adaptive web search query using preferred stores from intent memory.
 * Maps store name keys (e.g. "amazon mx") back to domains, prioritizes them,
 * then fills remaining slots from the static list.
 */
function buildAdaptiveWebSearchQuery(query, countryCode, preferredStoreKeys = []) {
    const config = getRegionConfig(countryCode);
    if (!preferredStoreKeys || preferredStoreKeys.length === 0) {
        return buildWebSearchQuery(query, countryCode);
    }

    // Reverse map: store name (lowercase) -> domain
    const reverseMap = {};
    for (const [domain, name] of Object.entries(config.storeMap)) {
        reverseMap[name.toLowerCase().trim()] = domain;
    }

    // Map preferred store keys to domains
    const preferredDomains = [];
    for (const key of preferredStoreKeys) {
        const domain = reverseMap[key];
        if (domain) preferredDomains.push(domain);
    }

    // Fill remaining slots from static list (up to 6 total)
    const staticDomains = (config.webSearchDomains || []);
    const finalDomains = [...preferredDomains];
    for (const d of staticDomains) {
        if (finalDomains.length >= 6) break;
        if (!finalDomains.includes(d)) finalDomains.push(d);
    }

    const siteFilters = finalDomains.map(d => `site:${d}`).join(' OR ');
    return `${query} ${config.searchSuffix} ${siteFilters}`;
}

/**
 * Resolve store name from a URL domain using region-specific map
 */
function resolveStoreName(url, countryCode) {
    const config = getRegionConfig(countryCode);
    const domain = (url.match(/https?:\/\/(?:www\.)?([^/]+)/) || [])[1] || '';
    const match = Object.entries(config.storeMap).find(([d]) => domain.includes(d));
    return match ? match[1] : domain;
}

/**
 * Get list of all supported country codes
 */
function getSupportedCountries() {
    return Object.keys(REGION_CONFIGS);
}

module.exports = {
    REGION_CONFIGS,
    TIMEZONE_COUNTRY_MAP,
    LANG_COUNTRY_MAP,
    detectCountryFromHeaders,
    detectCountryFromAcceptLanguage,
    resolveCountry,
    getRegionConfig,
    getPriorityWebDomains,
    buildWebSearchQuery,
    buildBroadWebSearchQuery,
    buildAdaptiveWebSearchQuery,
    resolveStoreName,
    getSupportedCountries
};
