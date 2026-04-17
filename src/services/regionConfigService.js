/**
 * regionConfigService.js
 * Centralizes all country/region-specific configuration:
 * - Serper API params (gl, hl)
 * - Store domains for web search
 * - Store name mappings
 * - Currency and locale
 * - Trust tier overrides per region
 */

const storeTrustService = require('./storeTrustService');

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
            'elektra.com.mx', 'costco.com.mx', 'sams.com.mx', 'officedepot.com.mx', 'homedepot.com.mx',
            'soriana.com', 'sears.com.mx', 'suburbia.com.mx', 'elpalaciodehierro.com', 'doto.com.mx',
            'cyberpuerta.mx', 'ddtech.mx', 'gameplanet.com', 'bodegaaurrera.com.mx', 'linio.com.mx',
            'claroshop.com', 'sanborns.com.mx', 'officemax.com.mx', 'mx.shein.com', 'temu.com', 'aliexpress.com',
            'apple.com', 'samsung.com', 'motorola.com.mx', 'mi.com', 'huawei.com', 'nike.com.mx', 'adidas.mx', 'innovasport.com'
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
            'homedepot.com.mx': 'Home Depot MX',
            'soriana.com': 'Soriana',
            'sears.com.mx': 'Sears MX',
            'suburbia.com.mx': 'Suburbia',
            'elpalaciodehierro.com': 'Palacio de Hierro',
            'doto.com.mx': 'Doto',
            'cyberpuerta.mx': 'Cyberpuerta',
            'ddtech.mx': 'DDTech',
            'gameplanet.com': 'Game Planet',
            'mx.shein.com': 'Shein MX',
            'shein.com': 'Shein MX',
            'temu.com': 'Temu',
            'aliexpress.com': 'AliExpress',
            'bodegaaurrera.com.mx': 'Bodega Aurrera',
            'linio.com.mx': 'Linio MX',
            'claroshop.com': 'Claro Shop',
            'sanborns.com.mx': 'Sanborns',
            'officemax.com.mx': 'OfficeMax MX',
            'apple.com': 'Apple',
            'samsung.com': 'Samsung',
            'motorola.com.mx': 'Motorola',
            'mi.com': 'Xiaomi',
            'huawei.com': 'Huawei',
            'nike.com.mx': 'Nike',
            'adidas.mx': 'Adidas',
            'innovasport.com': 'InnovaSport'
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
            'falabella.com', 'ripley.cl', 'paris.cl', 'lider.cl', 'jumbo.cl',
            'pcfactory.cl', 'solotodo.cl', 'mercadolibre.cl', 'knasta.cl', 'maconline.com',
            'hites.com', 'abcdin.cl', 'lapolar.cl', 'easy.cl',
            'sodimac.cl', 'microplay.cl', 'spdigital.cl', 'weplay.cl',
            'wom.cl', 'entel.cl', 'movistar.cl',
            'temu.com', 'aliexpress.com', 'amazon.com',
            'apple.com', 'samsung.com', 'mi.com', 'nike.cl', 'adidas.cl'
        ],
        storeMap: {
            'falabella.com': 'Falabella',
            'ripley.cl': 'Ripley',
            'paris.cl': 'Paris',
            'lider.cl': 'Lider',
            'jumbo.cl': 'Jumbo CL',
            'pcfactory.cl': 'PC Factory',
            'solotodo.cl': 'SoloTodo',
            'mercadolibre.cl': 'Mercado Libre CL',
            'knasta.cl': 'Knasta',
            'maconline.com': 'MacOnline',
            'hites.com': 'Hites',
            'abcdin.cl': 'ABCDin',
            'lapolar.cl': 'La Polar',
            'easy.cl': 'Easy',
            'sodimac.cl': 'Sodimac',
            'microplay.cl': 'Microplay',
            'spdigital.cl': 'SP Digital',
            'weplay.cl': 'WePlay',
            'wom.cl': 'WOM',
            'entel.cl': 'Entel',
            'movistar.cl': 'Movistar',
            'temu.com': 'Temu',
            'aliexpress.com': 'AliExpress',
            'amazon.com': 'Amazon US',
            'apple.com': 'Apple',
            'samsung.com': 'Samsung',
            'mi.com': 'Xiaomi',
            'nike.cl': 'Nike',
            'adidas.cl': 'Adidas'
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
            'linio.com.co', 'olimpica.com', 'jumbo.com.co', 'alkomprar.com', 'pepeganga.com',
            'panamericana.com.co', 'mac-center.com', 'amazon.com', 'temu.com', 'aliexpress.com',
            'apple.com', 'samsung.com', 'xiaomi-store.co', 'nike.com.co', 'adidas.co'
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
            'alkomprar.com': 'Alkomprar',
            'pepeganga.com': 'Pepe Ganga',
            'panamericana.com.co': 'Panamericana',
            'mac-center.com': 'Mac Center',
            'amazon.com': 'Amazon US',
            'temu.com': 'Temu',
            'aliexpress.com': 'AliExpress',
            'apple.com': 'Apple',
            'samsung.com': 'Samsung',
            'xiaomi-store.co': 'Xiaomi',
            'nike.com.co': 'Nike',
            'adidas.co': 'Adidas'
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
            'cotodigital.com.ar', 'carrefour.com.ar', 'oncity.com', 'venex.com.ar',
            'falabella.com.ar', 'tiendamovistar.com.ar', 'compragamer.com',
            'amazon.com', 'temu.com', 'aliexpress.com',
            'apple.com', 'samsung.com', 'mi.com', 'nike.com.ar', 'adidas.com.ar'
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
            'oncity.com': 'OnCity',
            'venex.com.ar': 'Venex',
            'falabella.com.ar': 'Falabella AR',
            'tiendamovistar.com.ar': 'Movistar AR',
            'compragamer.com': 'Compra Gamer',
            'amazon.com': 'Amazon US',
            'temu.com': 'Temu',
            'aliexpress.com': 'AliExpress',
            'apple.com': 'Apple',
            'samsung.com': 'Samsung',
            'mi.com': 'Xiaomi',
            'nike.com.ar': 'Nike',
            'adidas.com.ar': 'Adidas'
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
            'sodimac.com.pe', 'hiraoka.com.pe', 'linio.com.pe', 'wong.pe', 'tottus.com.pe',
            'coolbox.pe', 'curacao.pe', 'impacto.com.pe',
            'amazon.com', 'temu.com', 'aliexpress.com',
            'apple.com', 'samsung.com', 'xiaomiperu.com', 'nike.com.pe', 'adidas.pe'
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
            'wong.pe': 'Wong',
            'tottus.com.pe': 'Tottus',
            'coolbox.pe': 'Coolbox',
            'curacao.pe': 'Curacao',
            'impacto.com.pe': 'Impacto',
            'amazon.com': 'Amazon US',
            'temu.com': 'Temu',
            'aliexpress.com': 'AliExpress',
            'apple.com': 'Apple',
            'samsung.com': 'Samsung',
            'xiaomiperu.com': 'Xiaomi',
            'nike.com.pe': 'Nike',
            'adidas.pe': 'Adidas'
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
            'temu.com', 'aliexpress.com', 'nintendo.com', 'store.nintendo.com',
            'playstation.com', 'direct.playstation.com', 'apple.com', 'samsung.com'
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
            'aliexpress.com': 'AliExpress',
            'nintendo.com': 'Nintendo',
            'store.nintendo.com': 'Nintendo',
            'playstation.com': 'PlayStation',
            'direct.playstation.com': 'PlayStation Direct',
            'apple.com': 'Apple',
            'samsung.com': 'Samsung'
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

function getPriorityWebDomains(countryCode, limit = 10) {
    const config = getRegionConfig(countryCode);
    return (config.webSearchDomains || []).slice(0, Math.max(1, limit));
}

function inferCategoryFromQuery(query = '') {
    const normalized = String(query || '').toLowerCase();
    if (/iphone|galaxy|pixel|xiaomi|motorola|smartphone|celular|telefono|teléfono/.test(normalized)) return 'smartphone';
    if (/laptop|notebook|macbook|thinkpad|vivobook|ideapad|computadora/.test(normalized)) return 'laptop';
    if (/airpods|aud[ií]fonos|headphones|earbuds|speaker|bocina|wh-1000|sony wh/i.test(normalized)) return 'audio';
    if (/smart tv|televisor|tv |pantalla|qled|oled|55 inch|55 pulgadas/.test(normalized)) return 'tv';
    if (/playstation|ps5|ps4|xbox|nintendo|switch|steam deck|gaming/.test(normalized)) return 'gaming';
    if (/refrigerador|lavadora|microondas|aspiradora|freidora|cafetera|coffee maker|dryer|appliance/.test(normalized)) return 'appliance';
    if (/tenis|playera|ropa|sudadera|zapatos|mochila|bolsa|adidas|nike|reebok/.test(normalized)) return 'fashion';
    if (/mueble|sof[aá]|couch|desk|table|chair|storage|home|hogar/.test(normalized)) return 'home';
    return '';
}

const OFFICIAL_DOMAIN_MAP = {
    MX: {
        smartphone: ['apple.com', 'samsung.com', 'motorola.com.mx', 'mi.com'],
        laptop: ['apple.com', 'samsung.com', 'huawei.com'],
        audio: ['apple.com', 'samsung.com', 'sony.com', 'bose.com'],
        tv: ['samsung.com', 'lg.com', 'sony.com', 'hisense.com', 'tcl.com'],
        gaming: ['nintendo.com', 'store.nintendo.com', 'playstation.com', 'direct.playstation.com', 'xbox.com'],
        fashion: ['nike.com.mx', 'adidas.mx', 'puma.com'],
        sports: ['nike.com.mx', 'adidas.mx', 'puma.com']
    },
    US: {
        smartphone: ['apple.com', 'samsung.com', 'motorola.com', 'mi.com'],
        laptop: ['apple.com', 'dell.com', 'lenovo.com', 'hp.com'],
        audio: ['apple.com', 'sony.com', 'bose.com', 'jbl.com', 'samsung.com'],
        tv: ['samsung.com', 'lg.com', 'sony.com', 'hisense.com', 'tcl.com'],
        gaming: ['nintendo.com', 'store.nintendo.com', 'playstation.com', 'direct.playstation.com', 'xbox.com'],
        fashion: ['nike.com', 'adidas.com', 'puma.com'],
        sports: ['nike.com', 'adidas.com', 'puma.com']
    },
    CL: {
        smartphone: ['apple.com', 'samsung.com', 'mi.com'],
        audio: ['apple.com', 'sony.com', 'bose.com'],
        gaming: ['nintendo.com', 'playstation.com', 'xbox.com'],
        fashion: ['nike.cl', 'adidas.cl']
    },
    CO: {
        smartphone: ['apple.com', 'samsung.com', 'xiaomi-store.co'],
        gaming: ['nintendo.com', 'playstation.com', 'xbox.com'],
        fashion: ['nike.com.co', 'adidas.co']
    },
    AR: {
        smartphone: ['apple.com', 'samsung.com', 'mi.com'],
        gaming: ['nintendo.com', 'playstation.com', 'xbox.com'],
        fashion: ['nike.com.ar', 'adidas.com.ar']
    },
    PE: {
        smartphone: ['apple.com', 'samsung.com', 'xiaomiperu.com'],
        gaming: ['nintendo.com', 'playstation.com', 'xbox.com'],
        fashion: ['nike.com.pe', 'adidas.pe']
    }
};

const OFFICIAL_BRAND_DOMAIN_MAP = {
    apple: ['apple.com'],
    iphone: ['apple.com'],
    ipad: ['apple.com'],
    macbook: ['apple.com'],
    airpods: ['apple.com'],
    watch: ['apple.com'],
    samsung: ['samsung.com'],
    galaxy: ['samsung.com'],
    motorola: ['motorola.com.mx', 'motorola.com'],
    xiaomi: ['mi.com', 'xiaomiperu.com', 'xiaomi-store.co'],
    sony: ['sony.com'],
    bose: ['bose.com'],
    jbl: ['jbl.com'],
    lg: ['lg.com'],
    hisense: ['hisense.com'],
    tcl: ['tcl.com'],
    nintendo: ['nintendo.com', 'store.nintendo.com'],
    switch: ['nintendo.com', 'store.nintendo.com'],
    playstation: ['playstation.com', 'direct.playstation.com'],
    ps5: ['playstation.com', 'direct.playstation.com'],
    xbox: ['xbox.com'],
    nike: ['nike.com', 'nike.com.mx', 'nike.cl', 'nike.com.co', 'nike.com.ar', 'nike.com.pe'],
    adidas: ['adidas.com', 'adidas.mx', 'adidas.cl', 'adidas.co', 'adidas.com.ar', 'adidas.pe'],
    puma: ['puma.com']
};

/**
 * Build the Serper web search query with region-specific domains
 */
function buildWebSearchQuery(query, countryCode) {
    const config = getRegionConfig(countryCode);
    const inferredCategory = inferCategoryFromQuery(query);
    const domains = inferredCategory ? getCategoryDomains(countryCode, inferredCategory) : getPriorityWebDomains(countryCode);
    const siteFilters = domains
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
function buildAdaptiveWebSearchQuery(query, countryCode, preferredStoreKeys = [], preferredStoreMode = 'prefer') {
    const config = getRegionConfig(countryCode);
    if (!preferredStoreKeys || preferredStoreKeys.length === 0) {
        return buildWebSearchQuery(query, countryCode);
    }

    // Reverse map: store name (lowercase) -> domain
    const reverseMap = {};
    for (const [domain, name] of Object.entries(config.storeMap)) {
        reverseMap[name.toLowerCase().trim()] = domain;
        const canonicalName = storeTrustService.canonicalizeStoreName(name, domain);
        if (canonicalName && canonicalName !== 'desconocida') {
            reverseMap[canonicalName] = domain;
        }
    }

    // Map preferred store keys to domains
    const preferredDomains = [];
    for (const key of preferredStoreKeys) {
        const domain = reverseMap[key];
        if (domain) preferredDomains.push(domain);
    }

    // Fill remaining slots from static list (up to 10 total)
    const staticDomains = (config.webSearchDomains || []);
    const finalDomains = [...preferredDomains];
    if (preferredStoreMode !== 'exclusive') {
        for (const d of staticDomains) {
            if (finalDomains.length >= 10) break;
            if (!finalDomains.includes(d)) finalDomains.push(d);
        }
    }

    const siteFilters = finalDomains.map(d => `site:${d}`).join(' OR ');
    return `${query} ${config.searchSuffix} ${siteFilters}`;
}

function buildOfficialWebSearchQuery(query, countryCode) {
    const config = getRegionConfig(countryCode);
    const normalizedQuery = String(query || '').toLowerCase();
    const inferredCategory = inferCategoryFromQuery(query);
    const matchedBrandDomains = Object.entries(OFFICIAL_BRAND_DOMAIN_MAP)
        .filter(([brand]) => normalizedQuery.includes(brand))
        .flatMap(([, domains]) => domains);
    const categoryDomains = OFFICIAL_DOMAIN_MAP[(countryCode || 'MX').toUpperCase()]?.[inferredCategory] || [];
    const officialDomains = [...new Set([...matchedBrandDomains, ...categoryDomains])]
        .filter(domain => (config.webSearchDomains || []).includes(domain) || /^(apple|samsung|sony|bose|jbl|lg|hisense|tcl|nintendo|playstation|direct\.playstation|xbox|nike|adidas|puma|motorola|xiaomi)/i.test(domain))
        .slice(0, 8);
    if (officialDomains.length === 0) return `${query} ${config.searchSuffix}`.trim();
    const siteFilters = officialDomains.map(d => `site:${d}`).join(' OR ');
    return `${query} ${siteFilters}`;
}

/**
 * Dynamic domain prioritization by product category and region.
 * Returns the most relevant domains for a given category, falling back to general list.
 */
const CATEGORY_DOMAIN_MAP = {
    MX: {
        smartphone: ['amazon.com.mx', 'mercadolibre.com.mx', 'doto.com.mx', 'cyberpuerta.mx', 'liverpool.com.mx', 'walmart.com.mx', 'coppel.com', 'apple.com', 'samsung.com'],
        laptop: ['amazon.com.mx', 'cyberpuerta.mx', 'ddtech.mx', 'liverpool.com.mx', 'costco.com.mx', 'walmart.com.mx', 'bestbuy.com.mx', 'apple.com'],
        gaming: ['amazon.com.mx', 'mercadolibre.com.mx', 'gameplanet.com', 'ddtech.mx', 'bestbuy.com.mx', 'walmart.com.mx', 'costco.com.mx'],
        audio: ['amazon.com.mx', 'mercadolibre.com.mx', 'liverpool.com.mx', 'cyberpuerta.mx', 'walmart.com.mx', 'apple.com'],
        tv: ['amazon.com.mx', 'liverpool.com.mx', 'walmart.com.mx', 'bestbuy.com.mx', 'costco.com.mx', 'sams.com.mx', 'elpalaciodehierro.com'],
        fashion: ['mercadolibre.com.mx', 'liverpool.com.mx', 'suburbia.com.mx', 'mx.shein.com', 'coppel.com', 'nike.com.mx', 'adidas.mx', 'innovasport.com'],
        home: ['walmart.com.mx', 'amazon.com.mx', 'homedepot.com.mx', 'liverpool.com.mx', 'bodegaaurrera.com.mx', 'costco.com.mx'],
        appliance: ['walmart.com.mx', 'liverpool.com.mx', 'coppel.com', 'elektra.com.mx', 'homedepot.com.mx', 'amazon.com.mx', 'costco.com.mx'],
        beauty: ['mercadolibre.com.mx', 'amazon.com.mx', 'liverpool.com.mx', 'mx.shein.com', 'walmart.com.mx'],
        sports: ['amazon.com.mx', 'mercadolibre.com.mx', 'liverpool.com.mx', 'innovasport.com', 'nike.com.mx', 'adidas.mx'],
        toys: ['amazon.com.mx', 'walmart.com.mx', 'liverpool.com.mx', 'mercadolibre.com.mx', 'coppel.com']
    },
    US: {
        smartphone: ['amazon.com', 'bestbuy.com', 'walmart.com', 'target.com', 'apple.com', 'samsung.com'],
        laptop: ['amazon.com', 'bestbuy.com', 'walmart.com', 'costco.com', 'newegg.com', 'apple.com'],
        gaming: ['amazon.com', 'bestbuy.com', 'walmart.com', 'target.com', 'newegg.com'],
        audio: ['amazon.com', 'bestbuy.com', 'target.com', 'apple.com'],
        tv: ['amazon.com', 'bestbuy.com', 'walmart.com', 'costco.com', 'target.com'],
        fashion: ['amazon.com', 'walmart.com', 'target.com', 'ebay.com'],
        home: ['amazon.com', 'walmart.com', 'homedepot.com', 'lowes.com', 'costco.com', 'target.com'],
        appliance: ['bestbuy.com', 'homedepot.com', 'lowes.com', 'walmart.com', 'amazon.com', 'costco.com']
    },
    CL: {
        smartphone: ['falabella.com', 'ripley.cl', 'paris.cl', 'pcfactory.cl', 'mercadolibre.cl', 'knasta.cl', 'samsung.com'],
        laptop: ['pcfactory.cl', 'falabella.com', 'ripley.cl', 'paris.cl', 'spdigital.cl', 'solotodo.cl', 'maconline.com'],
        gaming: ['microplay.cl', 'weplay.cl', 'spdigital.cl', 'pcfactory.cl', 'falabella.com', 'ripley.cl'],
        home: ['falabella.com', 'lider.cl', 'jumbo.cl', 'easy.cl', 'sodimac.cl', 'paris.cl'],
        appliance: ['falabella.com', 'lider.cl', 'jumbo.cl', 'ripley.cl', 'paris.cl', 'hites.com']
    },
    CO: {
        smartphone: ['falabella.com.co', 'mercadolibre.com.co', 'alkosto.com', 'ktronix.com', 'alkomprar.com', 'exito.com'],
        laptop: ['alkosto.com', 'ktronix.com', 'alkomprar.com', 'falabella.com.co', 'mercadolibre.com.co', 'exito.com', 'mac-center.com'],
        home: ['homecenter.com.co', 'falabella.com.co', 'exito.com', 'jumbo.com.co', 'mercadolibre.com.co']
    },
    AR: {
        smartphone: ['mercadolibre.com.ar', 'fravega.com', 'garbarino.com', 'musimundo.com', 'oncity.com', 'samsung.com'],
        laptop: ['mercadolibre.com.ar', 'fravega.com', 'garbarino.com', 'venex.com.ar', 'compragamer.com', 'megatone.net'],
        home: ['mercadolibre.com.ar', 'fravega.com', 'cotodigital.com.ar', 'carrefour.com.ar', 'oncity.com']
    },
    PE: {
        smartphone: ['falabella.com.pe', 'ripley.com.pe', 'mercadolibre.com.pe', 'oechsle.pe', 'hiraoka.com.pe', 'samsung.com'],
        laptop: ['falabella.com.pe', 'ripley.com.pe', 'hiraoka.com.pe', 'impacto.com.pe', 'coolbox.pe', 'mercadolibre.com.pe'],
        home: ['falabella.com.pe', 'sodimac.com.pe', 'promart.pe', 'plazavea.com.pe', 'wong.pe', 'tottus.com.pe']
    }
};

function getCategoryDomains(countryCode, category, limit = 8) {
    const cc = (countryCode || 'MX').toUpperCase();
    const cat = (category || '').toLowerCase();
    const categoryDomains = CATEGORY_DOMAIN_MAP[cc]?.[cat];
    if (categoryDomains && categoryDomains.length > 0) {
        return categoryDomains.slice(0, Math.max(1, limit));
    }
    return getPriorityWebDomains(cc, limit);
}

function buildCategoryWebSearchQuery(query, countryCode, category) {
    const config = getRegionConfig(countryCode);
    const domains = getCategoryDomains(countryCode, category, 5);
    const siteFilters = domains.map(d => `site:${d}`).join(' OR ');
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
    resolveCountry,
    getRegionConfig,
    buildWebSearchQuery,
    buildBroadWebSearchQuery,
    buildAdaptiveWebSearchQuery,
    buildOfficialWebSearchQuery,
    buildCategoryWebSearchQuery,
    getCategoryDomains,
    resolveStoreName,
    getSupportedCountries
};
