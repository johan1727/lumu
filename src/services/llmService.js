const fetchWithTimeout = require('../utils/fetchWithTimeout');
const supabase = require('../config/supabase');
const { z } = require('zod');

let _supabaseFailing = false;
let _supabaseFailingSince = 0;
const SUPABASE_CIRCUIT_BREAKER_MS = 5 * 60 * 1000;

const REGION_PROMPT_CONTEXT = {
    MX: {
        label: 'México',
        language: 'es',
        currency: 'MXN',
        storeHints: 'Amazon MX, Mercado Libre MX, Walmart MX, Liverpool, Coppel, Elektra'
    },
    US: {
        label: 'United States',
        language: 'en',
        currency: 'USD',
        storeHints: 'Amazon, Walmart, Best Buy, Target, Costco, eBay'
    },
    CL: {
        label: 'Chile',
        language: 'es',
        currency: 'CLP',
        storeHints: 'Falabella, Ripley, Paris, Lider, PC Factory, SoloTodo'
    },
    CO: {
        label: 'Colombia',
        language: 'es',
        currency: 'COP',
        storeHints: 'Falabella, Éxito, Mercado Libre CO, Alkosto, Ktronix'
    },
    AR: {
        label: 'Argentina',
        language: 'es',
        currency: 'ARS',
        storeHints: 'Mercado Libre AR, Frávega, Garbarino, Musimundo, Megatone'
    },
    PE: {
        label: 'Perú',
        language: 'es',
        currency: 'PEN',
        storeHints: 'Falabella PE, Ripley PE, Plaza Vea, Mercado Libre PE, Oechsle'
    }
};

// Zod schema to validate LLM output (SECURITY FIX #8)
const llmResponseSchema = z.object({
    action: z.enum(['ask', 'search', 'search_service']),
    intent_type: z.enum(['producto', 'servicio_local', 'mayoreo', 'mayoreo_perecedero', 'ocio', 'otro']).optional(),
    queryType: z.enum(['generic', 'brand_model', 'conversational', 'speculative', 'comparison', 'url_like', 'cross_locale', 'need_based', 'coupon_deal']).optional().default('generic'),
    question: z.string().max(1000).nullable().optional(),
    sugerencias: z.array(z.string().max(300)).max(10).optional(),
    cupon: z.string().max(100).nullable().optional(),
    searchQuery: z.string().max(500).optional().default(''),
    normalizedQuery: z.string().max(500).optional(),
    alternativeQueries: z.array(z.string().max(500)).max(12).optional(),
    brandOfficialQuery: z.string().max(300).nullable().optional(),
    condition: z.enum(['new', 'used']).optional().default('new'),
    canonicalKey: z.string().max(160).optional(),
    priceVolatility: z.enum(['high', 'medium', 'low']).optional().default('medium'),
    productCategory: z.string().max(80).optional(),
    maxBudget: z.number().positive().max(100000000).optional(),
    aiSummary: z.string().max(600).nullable().optional(),
    isComparison: z.boolean().optional().default(false),
    comparisonProducts: z.array(z.string().max(200)).max(4).optional(),
    isSpeculative: z.boolean().optional().default(false),
    needsDisambiguation: z.boolean().optional().default(false),
    disambiguationOptions: z.array(z.string().max(200)).max(4).optional(),
    commercialReadiness: z.number().min(0).max(1).optional().default(0.8),
    searchLanguage: z.enum(['es', 'en', 'auto']).optional().default('auto'),
    excludeTerms: z.array(z.string().max(60)).max(8).optional(),
    reasoning: z.string().max(400).nullable().optional()
});

// --- PRE-PROCESSING: LatAm slang/abbreviation expansion ---
const SLANG_EXPANSIONS = {
    // MX slang
    'cel': 'celular', 'compu': 'computadora', 'lap': 'laptop', 'refri': 'refrigerador',
    'micro': 'microondas', 'lavadora': 'lavadora', 'tele': 'televisión', 'bici': 'bicicleta',
    'moto': 'motocicleta', 'depa': 'departamento', 'chamba': 'trabajo', 'jale': 'trabajo',
    'lana': 'dinero', 'neta': 'verdad', 'chido': 'bueno', 'padre': 'bueno',
    // AR slang
    'celu': 'celular', 'compu': 'computadora', 'birra': 'cerveza', 'facu': 'facultad',
    'laburo': 'trabajo', 'guita': 'dinero', 'pila': 'batería',
    // CL slang
    'celu': 'celular', 'note': 'notebook', 'pega': 'trabajo',
    // Tech abbreviations
    'tb': 'terabyte', 'ssd': 'ssd', 'hdd': 'disco duro', 'ram': 'ram',
    'gpu': 'tarjeta gráfica', 'cpu': 'procesador', 'fps': 'fps',
    'bt': 'bluetooth', 'wifi': 'wifi', 'usb': 'usb', 'hdmi': 'hdmi',
    'oled': 'oled', 'qled': 'qled', 'uhd': '4k uhd', '4k': '4k',
    // Common misspellings
    'iphome': 'iphone', 'ipone': 'iphone', 'samung': 'samsung', 'samsun': 'samsung',
    'huawey': 'huawei', 'huaway': 'huawei', 'xaomi': 'xiaomi', 'xiomi': 'xiaomi',
    'lapto': 'laptop', 'lapton': 'laptop', 'audifo': 'audífonos', 'audifono': 'audífonos',
    'plastation': 'playstation', 'pleisteishon': 'playstation', 'nintengo': 'nintendo',
    'mackbook': 'macbook', 'macbok': 'macbook', 'airpod': 'airpods',
    'imac': 'imac', 'ipad': 'ipad', 'aipod': 'airpods', 'airpot': 'airpods'
};

function preExpandSlang(text) {
    if (!text || typeof text !== 'string') return text;
    const words = text.split(/\s+/);
    const expanded = words.map(word => {
        const lower = word.toLowerCase().replace(/[^a-záéíóúñü0-9]/gi, '');
        return SLANG_EXPANSIONS[lower] || word;
    });
    return expanded.join(' ');
}

function detectQueryLanguage(text) {
    if (!text) return 'auto';
    const lower = text.toLowerCase();
    const esIndicators = /\b(busco|quiero|necesito|comprar|precio|barato|bueno|mejor|donde|cual|cuál|para|con|sin|menos|más|oferta|descuento|tienda)\b/;
    const enIndicators = /\b(buy|price|cheap|best|where|which|for|with|without|under|deal|discount|store|looking|want|need)\b/;
    const esScore = (lower.match(esIndicators) || []).length;
    const enScore = (lower.match(enIndicators) || []).length;
    if (esScore > enScore) return 'es';
    if (enScore > esScore) return 'en';
    return 'auto';
}

// SECURITY FIX #7: Sanitize user input to prevent prompt injection
function sanitizeUserInput(text) {
    if (typeof text !== 'string') return '';
    // Strip common injection patterns
    return text
        .replace(/```[\s\S]*?```/g, '')           // Remove code blocks
        .replace(/\{[^{}]*"role"\s*:/gi, '')       // Remove role injection attempts  
        .replace(/\bsystem\s*:/gi, 'system ')      // Defang "system:" prefix
        .replace(/\bignore\s+(previous|above|all)\s+(instructions?|prompts?|rules?)/gi, '[filtered]')
        .replace(/\b(forget|disregard|override)\s+(everything|instructions?|rules?|prompts?)/gi, '[filtered]')
        .replace(/\byou\s+are\s+now\b/gi, '[filtered]')
        .replace(/\bact\s+as\b/gi, '[filtered]')
        .replace(/\bnew\s+instructions?\s*:/gi, '[filtered]')
        .replace(/(site:\S+|http\S+)/gi, '[filtered url]') // Prevents force-domain injections
        .slice(0, 500);  // Hard limit
}

function slugifyCanonicalKey(text) {
    return String(text || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 160);
}

function detectCondition(text) {
    const normalized = String(text || '').toLowerCase();
    return /\b(usado|seminuevo|segunda mano|preowned|pre-owned|refurbished|reacondicionado|renewed|open box)\b/.test(normalized)
        ? 'used'
        : 'new';
}

function extractMaxBudget(text) {
    const normalized = String(text || '').toLowerCase();
    const budgetMatch = normalized.match(/(?:menos de|under|max(?:imo)?|hasta|budget|presupuesto de?)\s*\$?\s*([\d.,]+)/i);
    if (!budgetMatch) return undefined;
    const parsed = Number(String(budgetMatch[1]).replace(/,/g, ''));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function isUrlLikeQuery(text) {
    return /\[filtered url\]|https?:\/\/|www\.|\b[a-z0-9-]+\.(com|mx|cl|co|ar|pe|net|org)\b/i.test(String(text || ''));
}

function isWeakCommerceQuery(text) {
    const normalized = String(text || '').toLowerCase().trim();
    if (!normalized) return true;
    if (isUrlLikeQuery(normalized)) return true;
    if (/^(pero|ok|hola|hello|hi|gracias|thanks)$/i.test(normalized)) return true;
    if (/\b(ignore|forget|override|prompt|divine comedy|recite|recithe)\b/i.test(normalized)) return true;
    if (/^(i want the cheapest option available|comp[aá]rame precios y dime cu[aá]l conviene m[aá]s)$/i.test(normalized)) return true;
    return false;
}

function isBrowseIntent(text) {
    const normalized = String(text || '').toLowerCase().trim();
    if (!normalized) return false;
    if (/\b(tecnolog[ií]a|hogar|moda|electrodom[eé]sticos|juguetes|gaming)\b/.test(normalized) && normalized.split(/\s+/).length <= 6) {
        return true;
    }
    if (/^(celulares?|smartphones?|telefonos?|tel[eé]fonos?|laptops?|notebooks?|computadoras?|aud[ií]fonos|headphones|earbuds|bocinas?|televisores?|pantallas?|tvs?|smart tv|hogar|electrodom[eé]sticos|aspiradoras?|freidoras?|cafeteras?)$/i.test(normalized)) {
        return true;
    }
    const broadMatches = [
        /freidora|aspiradora|refrigerador|hogar/i,
        /ps5|xbox|nintendo|gaming/i,
        /celulares|laptops|aud[ií]fonos|gadgets/i,
        /juguetes|juegos de mesa|consolas|ni[nñ]os/i
    ].filter(pattern => pattern.test(normalized)).length;
    return broadMatches >= 2;
}

function inferFallbackQueryType(text) {
    const normalized = String(text || '').toLowerCase();
    if (isUrlLikeQuery(normalized)) return 'url_like';
    if (isWeakCommerceQuery(normalized)) return 'conversational';
    if (/\b(vs|versus|comparar|compare|cu[aá]l es mejor)\b/.test(normalized)) return 'comparison';
    if (/\b(cup[oó]n|cupon|oferta|descuento|deal|promo)\b/.test(normalized)) return 'coupon_deal';
    if (/\b(ps6|playstation 6|iphone 17|iphone 18|s26|s27|switch 2|gta 6)\b/.test(normalized) || /\b(fecha de salida|release date|rumor|rumores|filtraci[oó]n|pr[oó]ximo)\b/.test(normalized)) return 'speculative';
    if (/^(hola|buenas|hello|hi|gracias|thanks)\b/.test(normalized)) return 'conversational';
    if (isBrowseIntent(normalized)) return 'need_based';
    if (/\b(necesito|quiero|algo para|regalo para|busco algo)\b/.test(normalized)) return 'need_based';
    if (/\b(iphone|macbook|airpods|playstation|ps5|xbox|galaxy|s24|s25|ipad|apple watch)\b/.test(normalized) && /\b(\d{2,4}gb|m1|m2|m3|pro|max|ultra|\d{1,2})\b/.test(normalized)) return 'brand_model';
    return 'generic';
}

function inferDisambiguation(text) {
    const normalized = String(text || '').toLowerCase().trim();
    if (/\bapple\b/.test(normalized) && !/\b(iphone|ipad|macbook|watch|airpods|imac)\b/.test(normalized)) {
        return {
            needsDisambiguation: true,
            disambiguationOptions: ['Apple iPhone', 'Apple MacBook', 'Apple Watch', 'Apple iPad']
        };
    }
    if (/\b(apple|samsung|xiaomi|motorola|sony|lg|nike|adidas)\b/.test(normalized)
        && /\b(barato|barata|bueno|buena|mejor|econ[oó]mico|econ[oó]mica|daily|diario|daily use|para diario)\b/.test(normalized)
        && !inferProductCategory(normalized)
        && !/\b(iphone|ipad|macbook|watch|airpods|imac|galaxy|redmi|poco|moto g|tenis|zapatillas|playera|sudadera)\b/.test(normalized)) {
        return {
            needsDisambiguation: true,
            disambiguationOptions: ['celulares', 'laptops', 'audífonos', 'tienda oficial']
        };
    }
    if (/^(apple|samsung|xiaomi|motorola|sony|lg|nike|adidas)$/i.test(normalized)) {
        return {
            needsDisambiguation: true,
            disambiguationOptions: ['celulares', 'laptops', 'audífonos', 'tienda oficial']
        };
    }
    if (/\b(quiero|necesito|busco)\b/.test(normalized) && /\b(estudiar|trabajo|oficina|gaming|regalo|viaje|escuela)\b/.test(normalized) && !inferProductCategory(normalized)) {
        return {
            needsDisambiguation: true,
            disambiguationOptions: ['laptop', 'tablet', 'audífonos', 'mochila']
        };
    }

    return {
        needsDisambiguation: false,
        disambiguationOptions: []
    };
}

function inferSpeculativeMetadata(text) {
    const normalized = String(text || '').toLowerCase();
    const isSpeculative = inferFallbackQueryType(normalized) === 'speculative';
    if (!isSpeculative) {
        return {
            isSpeculative: false,
            commercialReadiness: isBrowseIntent(normalized) ? 0.62 : (isWeakCommerceQuery(normalized) ? 0.2 : 0.5)
        };
    }

    return {
        isSpeculative: true,
        commercialReadiness: 0.15
    };
}

function inferProductCategory(text) {
    const normalized = String(text || '').toLowerCase();
    if (/iphone|galaxy|pixel|xiaomi|motorola|smartphone|celular|telefono|teléfono/.test(normalized)) return 'smartphone';
    if (/laptop|notebook|macbook|thinkpad|vivobook|ideapad|computadora/.test(normalized)) return 'laptop';
    if (/airpods|aud[ií]fonos|headphones|earbuds|bocina|speaker/.test(normalized)) return 'audio';
    if (/smart tv|televisor|tv |pantalla|qled|oled/.test(normalized)) return 'tv';
    if (/playstation|ps5|ps4|xbox|nintendo|switch|steam deck|gaming/.test(normalized)) return 'gaming';
    if (/refri|refrigerador|lavadora|microondas|aspiradora|freidora|cafetera|licuadora/.test(normalized)) return 'appliance';
    if (/tenis|playera|ropa|sudadera|zapatos|mochila|bolsa/.test(normalized)) return 'fashion';
    if (/colch[oó]n|silla|escritorio|sof[aá]|mueble|hogar|home/.test(normalized)) return 'home';
    return '';
}

function inferUniversalQueryDomain(text) {
    const normalized = String(text || '').toLowerCase().trim();
    const productCategory = inferProductCategory(normalized);
    const serviceLocal = /plomero|dentista|doctor|mec[aá]nico|taller|restaurantes?|taquer[ií]as?|cafeter[ií]as?|pizzer[ií]as?|barber[ií]as?|peluquer[ií]as?|spa|gimnasio|hotel|cerrajero|electricista|uber|taxi|dealer|concesionario|abogado|veterinario|farmacia|lavander[ií]a|ferreter[ií]a/i.test(normalized);
    const commercialInfo = /conviene|vale la pena|recomiendas|mejor para|cu[aá]l me recomiendas|qu[eé] celular|qu[eé] laptop|qu[eé] tv|cu[aá]l comprar|cu[aá]l elegir/i.test(normalized);
    const generalInfo = /clima|capital de|historia de|qu[ií]mica|matem[aá]ticas|programaci[oó]n|receta|traduce|traducir|resumen de|explica|qu[eé] significa|definici[oó]n de/i.test(normalized);
    const outOfScope = /hazme una tarea|escribe un ensayo|resolver examen|predice loter[ií]a|hackea|piratea/i.test(normalized);

    if (outOfScope) return 'out_of_scope';
    if (serviceLocal) return 'service_local';
    if (productCategory || isBrowseIntent(normalized) || /precio|oferta|cup[oó]n|descuento|comprar|tienda|barato|caro|env[ií]o/i.test(normalized)) {
        return commercialInfo ? 'commercial_info' : 'shopping';
    }
    if (commercialInfo) return 'commercial_info';
    if (generalInfo || isWeakCommerceQuery(normalized)) return 'general_info';
    return 'shopping';
}

function buildUniversalAssistantReply(text, domain, productCategory = '') {
    const query = String(text || '').trim();
    if (domain === 'service_local') {
        return {
            message: 'Puedo ayudarte a encontrar servicios locales si me dices la ciudad o permites usar ubicación. También puedes agregar qué tipo de servicio necesitas.',
            suggestions: ['plomero cerca de mí', 'dentista en CDMX', 'taller mecánico en Guadalajara', 'hotel en Cancún']
        };
    }
    if (domain === 'commercial_info') {
        return {
            message: `Puedo orientarte sobre ${productCategory || 'esa compra'} y luego buscar opciones reales si quieres. Si prefieres, dime presupuesto, uso o marcas para afinar mejor.`,
            suggestions: ['dame opciones baratas', 'solo nuevo', 'menos de 10000 pesos', 'compara marcas']
        };
    }
    if (domain === 'general_info') {
        return {
            message: 'Esa consulta no parece una búsqueda de compra directa. Puedo ayudarte mejor si la conviertes en algo comprable, por ejemplo un producto, servicio, tienda, presupuesto o comparación.',
            suggestions: ['mejor celular por 5000', 'laptop para estudiar', 'audífonos con mejor precio', 'plomero cerca de mí']
        };
    }
    if (domain === 'out_of_scope') {
        return {
            message: 'Esa consulta está fuera del enfoque principal de Lumu. Estoy optimizado para ayudarte a comprar productos, comparar precios, encontrar tiendas y buscar algunos servicios locales.',
            suggestions: ['buscar celular barato', 'comparar laptops', 'ofertas de smart tv', 'servicios locales']
        };
    }
    return {
        message: `Puedo buscar opciones reales para "${query}" o ayudarte a refinar la búsqueda si me dices marca, presupuesto o uso.`,
        suggestions: ['más barato', 'mejor calidad-precio', 'solo tiendas oficiales', 'comparar opciones']
    };
}

function inferExcludeTerms(text, category = '') {
    const normalized = String(text || '').toLowerCase();
    const commonAccessoryTerms = ['funda', 'case', 'protector', 'mica', 'cable', 'cargador'];
    if (['smartphone', 'audio', 'gaming', 'laptop', 'tv'].includes(category) || /iphone|galaxy|airpods|ps5|xbox|switch|macbook|laptop|tv/.test(normalized)) {
        return commonAccessoryTerms;
    }
    return [];
}

function inferOfficialQuery(searchQuery, category = '') {
    const base = String(searchQuery || '').trim();
    if (!base) return null;
    if (isUrlLikeQuery(base) || isWeakCommerceQuery(base) || isBrowseIntent(base)) return null;
    if (/apple|iphone|ipad|macbook|airpods|watch/i.test(base)) return `${base} Apple Store`;
    if (/samsung|galaxy/i.test(base)) return `${base} Samsung oficial`;
    if (/playstation|ps5|ps4/i.test(base)) return `${base} PlayStation`;
    if (/xbox/i.test(base)) return `${base} Microsoft Store`;
    if (/nintendo|switch/i.test(base)) return `${base} Nintendo`;
    if (/nike|adidas|puma/i.test(base)) return `${base} tienda oficial`;
    if (category === 'smartphone') return `${base} tienda oficial`;
    return null;
}

function buildExploratoryAlternativeQueries(base = '', searchLanguage = 'auto') {
    const normalized = String(base || '').trim().toLowerCase();
    if (!normalized) return [];

    const pushUnique = (bucket, values = []) => {
        values.forEach((value) => {
            const clean = String(value || '').replace(/\s+/g, ' ').trim();
            if (clean && !bucket.includes(clean)) {
                bucket.push(clean);
            }
        });
    };

    const queries = [];
    const brandMatches = [...new Set((normalized.match(/iphone|apple|samsung|galaxy|xiaomi|motorola|google|pixel|lenovo|hp|asus|acer|dell|sony|lg|nintendo|playstation|xbox|jbl|bose|anker|nike|adidas/gi) || []).map(term => term.toLowerCase()))];
    const normalizedWithoutBrands = normalized
        .replace(/\b(iphone|apple|samsung|galaxy|xiaomi|motorola|google|pixel|lenovo|hp|asus|acer|dell|sony|lg|nintendo|playstation|xbox|jbl|bose|anker|nike|adidas)\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const pushBrandVariants = (values = []) => {
        if (brandMatches.length === 0) return;
        values.forEach((value) => {
            brandMatches.slice(0, 4).forEach((brand) => {
                pushUnique(queries, [`${value} ${brand}`]);
            });
        });
    };

    if (/robot aspiradora|aspiradora robot|roomba|vacuum robot/i.test(normalized)) {
        pushUnique(queries, [
            'robot aspiradora',
            'robot aspiradora ofertas',
            'roomba robot aspiradora',
            'robot aspiradora mapeo',
            'robot aspiradora autovaciado'
        ]);
        pushBrandVariants(['robot aspiradora', 'aspiradora robot']);
    }

    if (/laptop|macbook|lenovo|hp|asus|acer|dell|notebook/i.test(normalized)) {
        pushUnique(queries, [
            'laptop',
            'laptop trabajo estudio',
            'laptop ofertas',
            'laptop 16gb 512gb ssd',
            'laptop ryzen 5 16gb',
            'laptop intel core i5 16gb'
        ]);
        pushBrandVariants(['laptop', 'notebook']);
    }

    if (/iphone|galaxy|pixel|xiaomi|motorola|smartphone|celular/i.test(normalized)) {
        pushUnique(queries, [
            'celular',
            'smartphone',
            'celular desbloqueado',
            'smartphone ofertas',
            'celular 256gb',
            'smartphone gama media',
            'smartphone buena camara'
        ]);
        pushBrandVariants(['celular', 'smartphone']);
    }

    if (/aud[ií]fonos|airpods|earbuds|headphones|bocina|speaker/i.test(normalized)) {
        pushUnique(queries, [
            'audifonos gamer',
            'audifonos bluetooth',
            'audifonos noise cancelling',
            'audifonos ofertas',
            'bocina bluetooth potente'
        ]);
        pushBrandVariants(['audifonos bluetooth', 'audifonos gamer']);
    }

    if (/tv|televisor|pantalla|oled|qled/i.test(normalized)) {
        pushUnique(queries, [
            'televisor',
            'smart tv 4k',
            'televisor ofertas',
            'smart tv oled',
            'smart tv qled'
        ]);
        pushBrandVariants(['smart tv', 'televisor oled', 'smart tv oled']);
    }

    if (/belleza|cosm[eé]ticos|maquillaje|perfume|fragancia|skincare|cuidado personal/i.test(normalized)) {
        pushUnique(queries, [
            'perfumes mujer',
            'perfumes hombre',
            'maquillaje ofertas',
            'skincare coreano',
            'cosmeticos originales',
            'cuidado personal ofertas'
        ]);
        pushBrandVariants(['perfume', 'maquillaje', 'skincare']);
    }

    if (/hogar|cocina|electrodom[eé]sticos|muebles|decoraci[oó]n/i.test(normalized)) {
        pushUnique(queries, [
            'electrodomesticos ofertas',
            'articulos para cocina',
            'cafetera',
            'freidora de aire',
            'aspiradora',
            'muebles para hogar'
        ]);
    }

    if (/moda|ropa|tenis|zapatos|calzado|playera|sudadera/i.test(normalized)) {
        pushUnique(queries, [
            'tenis nike',
            'tenis adidas',
            'ropa deportiva',
            'sudadera hombre',
            'ropa mujer ofertas',
            'zapatos casuales'
        ]);
        pushBrandVariants(['tenis', 'ropa deportiva', 'zapatos']);
    }

    if (/^(celulares?|smartphones?|telefonos?|tel[eé]fonos?)$/i.test(normalized)) {
        pushUnique(queries, [
            'celular desbloqueado',
            'smartphone 5g',
            'celular samsung',
            'celular xiaomi',
            'celular motorola',
            'iphone ofertas'
        ]);
    }

    if (/^(laptops?|notebooks?|computadoras?)$/i.test(normalized)) {
        pushUnique(queries, [
            'laptop lenovo',
            'laptop hp',
            'laptop asus',
            'laptop dell',
            'laptop ryzen 5',
            'laptop intel core i5'
        ]);
    }

    if (/^(aud[ií]fonos|headphones|earbuds|bocinas?)$/i.test(normalized)) {
        pushUnique(queries, [
            'audifonos bluetooth',
            'audifonos gamer',
            'audifonos sony',
            'audifonos jbl',
            'audifonos bose'
        ]);
    }

    if (/^(televisores?|pantallas?|tvs?|smart tv)$/i.test(normalized)) {
        pushUnique(queries, [
            'smart tv samsung',
            'smart tv lg',
            'smart tv sony',
            'smart tv 4k',
            'televisor oled'
        ]);
    }

    if (/^(belleza|cosm[eé]ticos|maquillaje|perfumes?|fragancias?)$/i.test(normalized)) {
        pushUnique(queries, [
            'perfume calvin klein',
            'perfume versace',
            'labial maybelline',
            'base maquillaje loreal',
            'skincare cerave',
            'protector solar facial'
        ]);
    }

    if (/^(hogar|electrodom[eé]sticos|cocina)$/i.test(normalized)) {
        pushUnique(queries, [
            'freidora de aire',
            'cafetera nespresso',
            'licuadora oster',
            'aspiradora robot',
            'microondas',
            'refrigerador'
        ]);
    }

    if (/^(moda|ropa|tenis|zapatos|calzado)$/i.test(normalized)) {
        pushUnique(queries, [
            'tenis running nike',
            'tenis casual adidas',
            'ropa deportiva hombre',
            'ropa deportiva mujer',
            'zapatos casuales hombre',
            'sudadera nike'
        ]);
    }

    if (brandMatches.length >= 2) {
        brandMatches.slice(0, 4).forEach((brand) => {
            if (/apple|iphone/.test(brand)) pushUnique(queries, ['iphone 15 128gb', 'iphone 15 ofertas']);
            if (/samsung|galaxy/.test(brand)) pushUnique(queries, ['samsung galaxy a55', 'samsung galaxy s24']);
            if (/xiaomi/.test(brand)) pushUnique(queries, ['xiaomi redmi note 13', 'xiaomi 13t']);
            if (/motorola/.test(brand)) pushUnique(queries, ['motorola edge 50', 'motorola g84']);
            if (/lenovo/.test(brand)) pushUnique(queries, ['laptop lenovo ideapad', 'laptop lenovo thinkpad']);
            if (/hp/.test(brand)) pushUnique(queries, ['laptop hp pavilion', 'laptop hp victus']);
            if (/asus/.test(brand)) pushUnique(queries, ['laptop asus vivobook', 'laptop asus tuf']);
            if (/dell/.test(brand)) pushUnique(queries, ['laptop dell inspiron', 'laptop dell xps']);
        });
    }

    if (queries.length === 0) {
        pushUnique(queries, [
            `${base} ofertas`,
            `${base} mejor precio`,
            `${base} tienda online`,
            searchLanguage === 'en' ? `${base} deal` : `${base} descuento`
        ]);
    }

    if (normalizedWithoutBrands && queries.length < 6) {
        pushUnique(queries, [
            normalizedWithoutBrands,
            `${normalizedWithoutBrands} ofertas`,
            `${normalizedWithoutBrands} mejor precio`
        ]);
    }

    return queries.slice(0, 12);
}

function buildAlternativeQueries(searchQuery, originalQuery, category = '', searchLanguage = 'auto') {
    const base = String(searchQuery || originalQuery || '').trim();
    if (!base) return [];
    if (isUrlLikeQuery(base) || isWeakCommerceQuery(base)) return [];
    if (isBrowseIntent(base)) {
        return [...new Set(buildExploratoryAlternativeQueries(base, searchLanguage)
            .map(q => q.replace(/\s+/g, ' ').trim())
            .filter(Boolean))].slice(0, 12);
    }

    const queries = [
        base,
        `${base} oferta`,
        `${base} precio`,
        `${base} descuento`
    ];

    if (category === 'smartphone' || category === 'laptop' || category === 'gaming') {
        queries.push(`${base} nuevo`);
    }

    if (searchLanguage === 'en') {
        queries.push(`${base} deal`);
    }

    if (category === 'laptop' || category === 'smartphone' || category === 'audio' || category === 'gaming' || category === 'tv') {
        queries.push(...buildExploratoryAlternativeQueries(base, searchLanguage).slice(0, 4));
    }

    return [...new Set(queries.map(q => q.replace(/\s+/g, ' ').trim()).filter(Boolean))]
        .filter(q => q.toLowerCase() !== String(originalQuery || '').trim().toLowerCase() || q.toLowerCase() === base.toLowerCase())
        .slice(0, 12);
}

function repairAnalysis(rawAnalysis, originalText) {
    const analysis = { ...(rawAnalysis || {}) };
    const fallbackText = String(originalText || analysis.searchQuery || '').trim();
    const normalizedQuery = String(analysis.normalizedQuery || analysis.searchQuery || fallbackText).trim() || fallbackText;
    const searchQuery = String(analysis.searchQuery || normalizedQuery || fallbackText).trim() || fallbackText;
    const productCategory = analysis.productCategory || inferProductCategory(`${searchQuery} ${normalizedQuery}`);
    const disambiguation = inferDisambiguation(searchQuery);
    const searchLanguage = analysis.searchLanguage || detectQueryLanguage(searchQuery);
    const excludeTerms = Array.isArray(analysis.excludeTerms) && analysis.excludeTerms.length > 0
        ? analysis.excludeTerms.slice(0, 8)
        : inferExcludeTerms(`${searchQuery} ${normalizedQuery}`, productCategory);
    const alternativeQueries = Array.isArray(analysis.alternativeQueries) && analysis.alternativeQueries.length > 0
        ? [...new Set(analysis.alternativeQueries.map(q => String(q || '').trim()).filter(Boolean))].slice(0, 12)
        : buildAlternativeQueries(searchQuery, fallbackText, productCategory, searchLanguage);
    const brandOfficialQuery = analysis.brandOfficialQuery || inferOfficialQuery(searchQuery, productCategory);
    const universalQueryDomain = analysis.universalQueryDomain || inferUniversalQueryDomain(searchQuery);
    const universalReply = buildUniversalAssistantReply(searchQuery, universalQueryDomain, productCategory);
    const forceAskForAmbiguity = Boolean(disambiguation.needsDisambiguation && !productCategory);

    return {
        ...analysis,
        action: forceAskForAmbiguity ? 'ask' : analysis.action,
        question: forceAskForAmbiguity
            ? (analysis.question || universalReply.message || 'Necesito un poco más de detalle para encontrar exactamente lo que buscas.')
            : analysis.question,
        sugerencias: forceAskForAmbiguity
            ? ((Array.isArray(analysis.sugerencias) && analysis.sugerencias.length > 0 ? analysis.sugerencias : disambiguation.disambiguationOptions).slice(0, 4))
            : analysis.sugerencias,
        searchQuery,
        normalizedQuery,
        canonicalKey: analysis.canonicalKey || slugifyCanonicalKey(normalizedQuery || searchQuery),
        productCategory,
        searchLanguage,
        needsDisambiguation: Boolean(analysis.needsDisambiguation || disambiguation.needsDisambiguation),
        disambiguationOptions: Array.isArray(analysis.disambiguationOptions) && analysis.disambiguationOptions.length > 0
            ? analysis.disambiguationOptions.slice(0, 4)
            : disambiguation.disambiguationOptions,
        excludeTerms,
        alternativeQueries,
        brandOfficialQuery,
        universalQueryDomain,
        reasoning: analysis.reasoning || 'LLM response repaired with deterministic query enrichment'
    };
}

function buildFallbackResponse(fallbackQuery) {
    const queryType = inferFallbackQueryType(fallbackQuery);
    const { needsDisambiguation, disambiguationOptions } = inferDisambiguation(fallbackQuery);
    const { isSpeculative, commercialReadiness } = inferSpeculativeMetadata(fallbackQuery);
    const condition = detectCondition(fallbackQuery);
    const maxBudget = extractMaxBudget(fallbackQuery);
    const searchLanguage = detectQueryLanguage(fallbackQuery);
    const productCategory = inferProductCategory(fallbackQuery);
    const searchQuery = String(fallbackQuery || '').trim();
    const weakCommerce = isWeakCommerceQuery(fallbackQuery);
    const browseIntent = isBrowseIntent(fallbackQuery);
    const isUrlLike = isUrlLikeQuery(fallbackQuery);
    const universalQueryDomain = inferUniversalQueryDomain(fallbackQuery);
    const universalReply = buildUniversalAssistantReply(searchQuery, universalQueryDomain, productCategory);
    const exploratoryCandidates = buildExploratoryAlternativeQueries(searchQuery, searchLanguage);
    const hasExploratoryCoverage = exploratoryCandidates.length >= 3 || Boolean(productCategory);
    const shouldAsk = universalQueryDomain === 'service_local' || universalQueryDomain === 'commercial_info' || universalQueryDomain === 'general_info' || universalQueryDomain === 'out_of_scope' || isUrlLike || queryType === 'conversational' || weakCommerce || needsDisambiguation || (browseIntent && (!hasExploratoryCoverage || !productCategory));
    const fallbackSuggestions = browseIntent
        ? ['Smartphones', 'Laptops', 'Audífonos', 'Hogar']
        : ['iPhone', 'Laptop', 'Audífonos', 'Smart TV'];

    return {
        action: universalQueryDomain === 'shopping' ? (shouldAsk ? 'ask' : 'search') : 'ask',
        intent_type: universalQueryDomain === 'service_local' ? 'servicio_local' : 'producto',
        queryType,
        question: shouldAsk
            ? (isUrlLike
                ? 'Puedo ayudarte con ese enlace, pero necesito saber qué quieres hacer: comparar precio, ver alternativas o revisar la tienda.'
                : universalReply.message)
            : null,
        sugerencias: shouldAsk ? (universalReply.suggestions || fallbackSuggestions) : [],
        searchQuery,
        normalizedQuery: searchQuery,
        alternativeQueries: buildAlternativeQueries(searchQuery, fallbackQuery, productCategory, searchLanguage),
        brandOfficialQuery: inferOfficialQuery(searchQuery, productCategory),
        condition,
        canonicalKey: slugifyCanonicalKey(searchQuery),
        priceVolatility: 'medium',
        productCategory,
        maxBudget,
        aiSummary: null,
        isComparison: queryType === 'comparison',
        comparisonProducts: [],
        isSpeculative,
        needsDisambiguation: needsDisambiguation || browseIntent || isUrlLike,
        disambiguationOptions: disambiguationOptions && disambiguationOptions.length > 0 ? disambiguationOptions : (shouldAsk ? (universalReply.suggestions || fallbackSuggestions) : []),
        commercialReadiness,
        searchLanguage,
        excludeTerms: shouldAsk ? [] : inferExcludeTerms(searchQuery, productCategory),
        universalQueryDomain,
        reasoning: 'Fallback: LLM response was invalid or empty'
    };
}

exports.analyzeMessage = async (userText, chatHistory = [], context = {}) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY no está configurado en .env");
    }

    const regionCode = String(context.countryCode || 'MX').toUpperCase();
    const regionContext = REGION_PROMPT_CONTEXT[regionCode] || REGION_PROMPT_CONTEXT.MX;

    // SECURITY: Sanitize user input before sending to LLM
    const sanitizedText = sanitizeUserInput(userText);

    // PRE-PROCESSING: Expand slang/abbreviations and detect language
    const preExpandedText = preExpandSlang(sanitizedText);
    const detectedLang = detectQueryLanguage(sanitizedText);

    // Limit chat history to prevent context window overrun and save tokens
    const recentHistory = chatHistory.slice(-6);

    // Formatear el historial para el prompt
    const historyText = recentHistory.length > 0
        ? recentHistory.map(msg => `${msg.role === 'user' ? 'Usuario' : 'Asistente'}: ${msg.content}`).join('\n')
        : 'Sin historial previo.';

    // --- RAG: Extraer memorias relevantes de Supabase ---
    let extraContext = '';
    if (_supabaseFailing && (Date.now() - _supabaseFailingSince) > SUPABASE_CIRCUIT_BREAKER_MS) {
        _supabaseFailing = false;
        console.log('[RAG] Supabase circuit breaker reset — retrying.');
    }
    if (supabase && !_supabaseFailing) {
        try {
            // ALWAYS use models that output 768 dimensions to match Supabase RPC `match_ai_memory`
            const candidateModels = [
                process.env.GEMINI_EMBEDDING_MODEL || 'text-embedding-004'
            ];

            let queryVector = null;

            for (const modelName of candidateModels) {
                const embedResponse = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:embedContent?key=${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: `models/${modelName}`,
                        content: { parts: [{ text: sanitizedText }] },
                        outputDimensionality: 768
                    })
                }, 10000);

                const embedData = await embedResponse.json().catch(() => ({}));
                if (embedResponse.ok && embedData?.embedding?.values) {
                    queryVector = embedData.embedding.values;
                    break;
                }
            }

            if (queryVector) {
                const { data: matches, error } = await supabase.rpc('match_ai_memory', {
                    query_embedding: queryVector,
                    match_threshold: 0.78,
                    match_count: 3
                });

                if (error) {
                    _supabaseFailing = true;
                    _supabaseFailingSince = Date.now();
                    console.warn('[RAG] Supabase failing, disabling RAG for 5 min:', error.message);
                } else if (matches && matches.length > 0) {
                    extraContext = "\n\n=== MEMORIA DE ÉXITO PREVIA (Usa esto para dar mejores resultados) ===\n";
                    matches.forEach(m => {
                        extraContext += `- Contexto Exitoso Pasado: ${m.content}\n`;
                    });
                }
            }
        } catch (err) {
            _supabaseFailing = true;
            _supabaseFailingSince = Date.now();
            console.error("RAG no disponible temporalmente:", err.message || err);
        }

        if (!_supabaseFailing) {
            try {
                const clickTerms = [...new Set(sanitizedText.toLowerCase().split(/\s+/).filter(token => token.length >= 4))].slice(0, 3);
                if (clickTerms.length > 0) {
                    const { data: clickRows, error: clickError } = await supabase
                        .from('click_events')
                        .select('search_query, product_title, store, created_at')
                        .eq('event_type', 'click')
                        .not('search_query', 'is', null)
                        .order('created_at', { ascending: false })
                        .limit(50);

                    if (clickError) {
                        _supabaseFailing = true;
                        _supabaseFailingSince = Date.now();
                        console.warn('[Click-RAG] Supabase failing, disabling for 5 min:', clickError.message);
                    } else if (Array.isArray(clickRows) && clickRows.length > 0) {
                        const relevantClicks = clickRows
                            .filter(row => {
                                const source = `${row.search_query || ''} ${row.product_title || ''}`.toLowerCase();
                                return clickTerms.some(term => source.includes(term));
                            })
                            .slice(0, 5);

                        if (relevantClicks.length > 0) {
                            extraContext += "\n\n=== QUERIES EXITOSOS BASADOS EN CLICS REALES ===\n";
                            relevantClicks.forEach(row => {
                                extraContext += `- Query exitosa: ${row.search_query || ''} -> Producto: ${row.product_title || ''} @ ${row.store || 'tienda desconocida'}\n`;
                            });
                        }
                    }
                }
            } catch (err) {
                _supabaseFailing = true;
                _supabaseFailingSince = Date.now();
                console.error("Click-RAG no disponible temporalmente:", err.message || err);
            }
        }
    }

    const today = new Date();
    const currentDateStr = today.toISOString().split('T')[0];

    const systemPrompt = `Eres Lumu, el Personal Shopper AI de ${regionContext.label}.
Región activa: ${regionContext.label} (${regionCode})
Idioma preferido de búsqueda: ${regionContext.language}
Idioma detectado del usuario: ${detectedLang}
Moneda principal: ${regionContext.currency}
Tiendas de referencia: ${regionContext.storeHints}
FECHA ACTUAL: ${currentDateStr}
Texto pre-expandido (slang resuelto): "${preExpandedText}"
${extraContext}`;

    const userPrompt = `
    HISTORIAL RECIENTE:
    ${historyText}
    
    MENSAJE ACTUAL:
    "${sanitizedText}"

    === REGLAS DE CLASIFICACIÓN Y BÚSQUEDA ===

    PASO 1 — CLASIFICAR queryType (OBLIGATORIO):
    Analiza el mensaje y clasifícalo en exactamente UNO de estos tipos:
    - "brand_model": Marca+modelo específico ("iPhone 15 Pro Max", "Samsung S24 Ultra 256gb")
    - "generic": Categoría sin modelo ("laptop para gaming", "audífonos buenos")
    - "need_based": Necesidad sin producto claro ("algo para correr", "regalo para mamá")
    - "conversational": Saludo, charla, o pregunta sin intención de compra ("hola", "gracias", "qué tal")
    - "speculative": Producto no lanzado, rumor, futuro ("iPhone 17", "PS6", "Galaxy S26"). Si aplica: isSpeculative=true, commercialReadiness=0.1-0.3, usa como searchQuery el modelo actual más cercano y manda el especulativo a alternativeQueries.
    - "comparison": Comparando 2+ productos ("A vs B", "cuál es mejor A o B"). Si aplica: isComparison=true, searchQuery = el producto más comprable y el resto va en alternativeQueries + comparisonProducts.
    - "coupon_deal": Busca ofertas/cupones/descuentos ("ofertas buen fin", "cupón Amazon")
    - "url_like": Parece una URL o dominio
    - "cross_locale": Producto que suele buscarse en otro idioma al de la región

    PASO 2 — GENERAR searchQuery (OBLIGATORIO si action=search):
    - Estrategia LONG-TAIL: Expande queries vagas → frases de catálogo reales.
      Ej: "laptop i7" → "laptop intel core i7 13va gen 16gb ram 512gb ssd"
      Ej: "cel samsung" → "Samsung Galaxy A55 5G 128GB"
      Ej: "tele 55" → "smart tv 55 pulgadas 4k"
    - Máximo 6-8 palabras enfocadas en UN producto comprable.
    - NUNCA copies listas de categorías como searchQuery.

    PASO 3 — CAMPOS NUEVOS OBLIGATORIOS:
    - normalizedQuery: versión limpia/corregida del query original sin typos, sin slang, con marca/modelo correctos
    - queryType: clasificación del PASO 1
    - searchLanguage: "es" para LatAm, "en" para US, o "auto" si el producto se busca mejor en inglés (ej: "AirPods" en MX → "en")
    - commercialReadiness: 0.0 a 1.0 — qué tan listo está para comprarse. 1.0=producto específico claro, 0.5=genérico, 0.1=rumor/especulativo
    - reasoning: 1 frase corta explicando tu decisión de búsqueda (máx 50 palabras)
    - excludeTerms: array de palabras a excluir para evitar accesorios/basura (ej: ["funda","case","protector","cable"] para búsqueda de celular)
    - brandOfficialQuery: si el producto tiene tienda oficial (Apple, Samsung, Nike, etc), genera un query optimizado para esa tienda. null si no aplica.
    - needsDisambiguation: true si hay múltiples interpretaciones válidas. Llena disambiguationOptions (ej: "apple" → ["Apple iPhone","Apple MacBook","Apple Watch","Apple iPad"]). Aún así genera searchQuery con la interpretación más probable.
    - disambiguationOptions: opciones concretas cuando la query es ambigua
    - isSpeculative: true si el producto aún no existe, es rumor o es futuro
    - isComparison + comparisonProducts: úsalo cuando el usuario compare 2+ productos

    === REGLAS GENERALES ===
    1. ACCIÓN: "search" si hay producto/compra, "search_service" para servicios locales (plomero, dentista, restaurante), "ask" SOLO si realmente no puedes buscar.
    2. intent_type: producto, servicio_local, mayoreo, mayoreo_perecedero, ocio, otro.
    3. condition: "new" por defecto, "used" solo si dice usado/seminuevo/refurbished.
    4. alternativeQueries: 3-5 variaciones de alta calidad pensando en catálogos de ${regionContext.storeHints}. INCLUYE al menos una variante de oferta/descuento. NO uses "site:".
    5. IDIOMA: Región ${regionCode}. Para US usa inglés. Para LatAm usa español excepto nombres de producto que se buscan mejor en inglés (ej: "AirPods Pro" no se traduce).
    6. TYPOS Y SLANG: Corrige usando normalizedQuery y searchQuery; el sistema ya pre-expandió slang.
    7. MULTI-CATEGORÍA: Elige UNA categoría para searchQuery, las demás van a alternativeQueries.
    8. PRESUPUESTO: Extrae maxBudget en ${regionContext.currency} si el usuario lo menciona.
    9. NO-COMPRABLES: Vehículos, inmuebles → intent_type="otro". Restaurantes/servicios → "servicio_local".
    10. canonicalKey: "marca_modelo_variante" en minúsculas sin caracteres especiales.
    11. priceVolatility: "high" (electrónica, gaming, flash sales), "low" (muebles, ropa básica), "medium" (resto).
    12. productCategory: etiqueta corta: smartphone, laptop, audio, tv, fashion, home, gaming, appliance, beauty, sports, toys, local_service.
    13. aiSummary: 1-2 frases de guía de compra concreta y útil. null si no aporta.
    14. CONVERSACIÓN: Saludos sin producto → action="ask", sugiere 3 categorías populares.
    15. CUPONES: Si conoces códigos de descuento activos para la marca/tienda, ponlos en cupon.

    === EJEMPLOS (FEW-SHOT) ===
    Input: "busco unos airpods"
    → queryType:"brand_model", searchQuery:"Apple AirPods Pro 2da generación", normalizedQuery:"apple airpods", brandOfficialQuery:"AirPods Pro Apple Store", commercialReadiness:0.9, excludeTerms:["funda","case","protector"]

    Input: "algo bueno para correr"
    → queryType:"need_based", searchQuery:"tenis para correr hombre Nike", normalizedQuery:"calzado running", needsDisambiguation:true, disambiguationOptions:["tenis running hombre","tenis running mujer","smartwatch running","audífonos deportivos"], commercialReadiness:0.5

    Input: "iphone 17 pro"
    → queryType:"speculative", searchQuery:"iPhone 16 Pro Max 256GB", normalizedQuery:"iphone 17 pro", isSpeculative:true, commercialReadiness:0.1, alternativeQueries:["iPhone 16 Pro 256GB","iPhone 15 Pro Max"]

    Input: "hola qué tal"
    → queryType:"conversational", action:"ask", question:"¡Hola! Soy Lumu, tu asistente de compras. ¿Qué te gustaría buscar hoy?", sugerencias:["Smartphones","Laptops","Audífonos"]

    Devuelve ESTRICTAMENTE un JSON validado.
  `;

    const payload = {
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: userPrompt }] }],
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
                type: "OBJECT",
                properties: {
                    action: { type: "STRING", enum: ["ask", "search", "search_service"] },
                    intent_type: { type: "STRING", enum: ["producto", "servicio_local", "mayoreo", "mayoreo_perecedero", "ocio", "otro"] },
                    queryType: { type: "STRING", enum: ["generic", "brand_model", "conversational", "speculative", "comparison", "url_like", "cross_locale", "need_based", "coupon_deal"], description: "Classification of the user query type" },
                    question: { type: "STRING" },
                    sugerencias: { type: "ARRAY", items: { type: "STRING" } },
                    cupon: { type: "STRING", description: "Active promo codes for the brand/store (e.g., 'SAVE20')" },
                    searchQuery: { type: "STRING", description: "Long-tail optimized query: Brand + Model + Key Specs" },
                    normalizedQuery: { type: "STRING", description: "Clean version of user input: typos fixed, slang resolved, brand/model corrected" },
                    alternativeQueries: { type: "ARRAY", items: { type: "STRING" }, description: "3-5 alternative high-quality queries including at least one deal/offer variant" },
                    brandOfficialQuery: { type: "STRING", description: "Query optimized for official brand store search (Apple Store, Samsung, Nike). null if N/A" },
                    condition: { type: "STRING", enum: ["new", "used"] },
                    canonicalKey: { type: "STRING" },
                    priceVolatility: { type: "STRING", enum: ["high", "medium", "low"] },
                    productCategory: { type: "STRING", description: "Short category label: smartphone, laptop, audio, tv, fashion, home, gaming, appliance, beauty, sports, toys, local_service" },
                    maxBudget: { type: "NUMBER", description: "Max budget in active region currency" },
                    aiSummary: { type: "STRING", description: "1-2 sentence expert shopping guidance" },
                    isComparison: { type: "BOOLEAN", description: "True if user is comparing 2+ products" },
                    comparisonProducts: { type: "ARRAY", items: { type: "STRING" }, description: "Normalized product names being compared" },
                    isSpeculative: { type: "BOOLEAN", description: "True if product is unreleased, rumored, or future" },
                    needsDisambiguation: { type: "BOOLEAN", description: "True if query has multiple valid interpretations" },
                    disambiguationOptions: { type: "ARRAY", items: { type: "STRING" }, description: "Possible interpretations when ambiguous" },
                    commercialReadiness: { type: "NUMBER", description: "0.0-1.0 score: 1.0=specific buyable product, 0.5=generic, 0.1=speculative" },
                    searchLanguage: { type: "STRING", enum: ["es", "en", "auto"], description: "Best language for search results in this region" },
                    excludeTerms: { type: "ARRAY", items: { type: "STRING" }, description: "Terms to exclude to avoid accessories/junk results" },
                    reasoning: { type: "STRING", description: "Brief explanation of search strategy decision (max 50 words)" }
                },
                required: ["action", "searchQuery", "queryType"]
            }
        }
    };

    const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;
    let retries = 0;
    const maxRetries = 2;

    while (retries <= maxRetries) {
        try {
            const response = await fetchWithTimeout(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
                body: JSON.stringify(payload)
            }, 15000);

            if (response.status === 429 && retries < maxRetries) {
                retries++;
                const delay = retries * 1500 + Math.random() * 500;
                console.warn(`[LLM] Error 429 Rate Limit. Reintentando en ${Math.round(delay)}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }

            if (!response.ok) {
                const errorBody = await response.text().catch(() => '');
                throw new Error(`Fallo en la API de Gemini: HTTP ${response.status} - ${errorBody.slice(0, 200)}`);
            }

            const data = await response.json();

            // Defensive: check candidates exist and have content
            if (!data.candidates || data.candidates.length === 0 || !data.candidates[0].content) {
                console.warn('[LLM] Gemini returned empty/blocked candidates:', JSON.stringify(data).slice(0, 500));
                throw new Error('Gemini returned no candidates (possibly blocked by safety filter)');
            }

            const textResult = data.candidates[0].content.parts[0].text;
            if (!textResult) {
                throw new Error('Gemini returned empty text in candidates');
            }

            const parsed = JSON.parse(textResult);

            // Validar que searchQuery no esté vacío
            if (!parsed.searchQuery || parsed.searchQuery.trim().length === 0) {
                console.warn('[LLM] searchQuery vacío, usando fallback con query original');
                return buildFallbackResponse(sanitizedText || userText);
            }

            // SECURITY FIX #8: Validate LLM output with Zod
            const validated = llmResponseSchema.safeParse(parsed);
            if (!validated.success) {
                console.warn('[LLM] Response validation failed:', validated.error.issues.map(i => i.message).join(', '));
                return buildFallbackResponse(sanitizedText || userText);
            }

            // Structured logging for analytics and improvement
            const repaired = repairAnalysis(validated.data, sanitizedText || userText);
            console.log(`[LLM Decision] queryType=${repaired.queryType} | readiness=${repaired.commercialReadiness} | speculative=${repaired.isSpeculative} | disambig=${repaired.needsDisambiguation} | lang=${repaired.searchLanguage} | q="${repaired.searchQuery}"`);

            return repaired;

        } catch (error) {
            if (retries >= maxRetries) {
                console.error('Error en LLM Assistant tras reintentos:', error.message);
                return buildFallbackResponse(sanitizedText || userText);
            }
            retries++;
            await new Promise(resolve => setTimeout(resolve, retries * 1000));
        }
    }
};
