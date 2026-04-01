const supabase = require('../config/supabase');

const activeCoupons = [
    {
        store: 'coppel',
        code: 'APPCOPPEL',
        discount: 'Beneficio visible en app para compras seleccionadas',
        expires_at: '2026-04-15',
        country: 'MX',
        verified: true,
        source_url: 'https://www.coppel.com/',
        disclaimer: 'Verifica vigencia y monto mínimo directamente en la tienda.'
    },
    {
        store: 'elektra',
        code: 'APP ELEKTRA',
        discount: 'Promoción visible en app o campañas activas de la tienda',
        expires_at: '2026-04-15',
        country: 'MX',
        verified: true,
        source_url: 'https://www.elektra.com.mx/',
        disclaimer: 'Verifica vigencia y categorías participantes directamente en la tienda.'
    },
    {
        store: 'amazon',
        code: 'MSI AMAZON',
        discount: 'Promociones frecuentes con meses sin intereses y ofertas relámpago en productos seleccionados',
        expires_at: '2026-04-30',
        country: 'MX',
        verified: true,
        source_url: 'https://www.amazon.com.mx/',
        disclaimer: 'Verifica vigencia, banco participante y monto mínimo directamente en Amazon.'
    },
    {
        store: 'walmart',
        code: 'APP WALMART',
        discount: 'Descuentos exclusivos en app y campañas activas de Walmart',
        expires_at: '2026-04-30',
        country: 'MX',
        verified: true,
        source_url: 'https://www.walmart.com.mx/',
        disclaimer: 'Verifica vigencia y productos participantes directamente en la tienda.'
    },
    {
        store: 'liverpool',
        code: 'APP LIVERPOOL',
        discount: 'Promociones exclusivas de app y descuentos temporales en categorías seleccionadas',
        expires_at: '2026-04-30',
        country: 'MX',
        verified: true,
        source_url: 'https://www.liverpool.com.mx/',
        disclaimer: 'Verifica vigencia y restricciones directamente en Liverpool.'
    },
    {
        store: 'best buy mx',
        code: 'PROMO TECH',
        discount: 'Promociones recurrentes en tecnología y accesorios seleccionados',
        expires_at: '2026-04-30',
        country: 'MX',
        verified: true,
        source_url: 'https://www.bestbuy.com.mx/',
        disclaimer: 'Verifica disponibilidad y vigencia directamente en la tienda.'
    },
    {
        store: 'shein mx',
        code: 'SHEIN20',
        discount: 'Hasta 20% de descuento en campañas y categorías participantes',
        expires_at: '2026-04-30',
        country: 'MX',
        verified: true,
        source_url: 'https://mx.shein.com/',
        disclaimer: 'Verifica vigencia, mínimo de compra y exclusiones directamente en Shein.'
    },
    {
        store: 'temu',
        code: 'TEMU10',
        discount: 'Descuento de bienvenida o promociones activas en productos seleccionados',
        expires_at: '2026-04-30',
        country: 'MX',
        verified: true,
        source_url: 'https://www.temu.com/',
        disclaimer: 'Verifica elegibilidad de cuenta y restricciones directamente en Temu.'
    },
    {
        store: "sam's club mx",
        code: 'SOCIO SAMS',
        discount: 'Beneficios y promociones exclusivas para socios en artículos participantes',
        expires_at: '2026-04-30',
        country: 'MX',
        verified: true,
        source_url: 'https://www.sams.com.mx/',
        disclaimer: 'Verifica membresía requerida y vigencia directamente en Sam\'s Club.'
    },
    {
        store: 'bodega aurrera',
        code: 'APP BODEGA',
        discount: 'Ofertas y descuentos visibles en app para productos seleccionados',
        expires_at: '2026-04-30',
        country: 'MX',
        verified: true,
        source_url: 'https://www.bodegaaurrera.com.mx/',
        disclaimer: 'Verifica vigencia y cobertura directamente en la tienda.'
    },
    {
        store: 'linio mx',
        code: 'LINIO10',
        discount: 'Descuentos estacionales y promociones activas en artículos participantes',
        expires_at: '2026-04-30',
        country: 'MX',
        verified: true,
        source_url: 'https://www.linio.com.mx/',
        disclaimer: 'Verifica vigencia y monto mínimo directamente en Linio.'
    },
    {
        store: 'claro shop',
        code: 'CLARO10',
        discount: 'Cupones recurrentes y campañas temporales en productos seleccionados',
        expires_at: '2026-04-30',
        country: 'MX',
        verified: true,
        source_url: 'https://www.claroshop.com/',
        disclaimer: 'Verifica vigencia y restricciones directamente en Claro Shop.'
    }
];

function normalizeStoreName(name) {
    if (!name) return '';
    const lower = name.toLowerCase().trim();
    if (lower.includes('amazon')) return 'amazon';
    if (lower.includes('mercado') || lower.includes('libre') || lower.includes('meli')) return 'mercado libre';
    if (lower.includes('walmart')) return 'walmart';
    if (lower.includes('aliexpress')) return 'aliexpress';
    if (lower.includes('coppel')) return 'coppel';
    if (lower.includes('elektra')) return 'elektra';
    if (lower.includes('liverpool')) return 'liverpool';
    if (lower.includes('best buy')) return 'best buy mx';
    if (lower.includes('shein')) return 'shein mx';
    if (lower.includes("sam's") || lower.includes('sams')) return "sam's club mx";
    if (lower.includes('bodega aurrera')) return 'bodega aurrera';
    if (lower.includes('linio')) return 'linio mx';
    if (lower.includes('claro shop') || lower.includes('claroshop')) return 'claro shop';
    if (lower.includes('falabella')) return 'falabella';
    if (lower.includes('ripley')) return 'ripley';
    if (lower.includes('paris')) return 'paris';
    if (lower.includes('lider')) return 'lider';
    if (lower.includes('éxito') || lower.includes('exito')) return 'exito';
    if (lower.includes('alkosto')) return 'alkosto';
    if (lower.includes('frávega') || lower.includes('fravega')) return 'fravega';
    if (lower.includes('garbarino')) return 'garbarino';
    if (lower.includes('musimundo')) return 'musimundo';
    if (lower.includes('plaza vea')) return 'plaza vea';
    return lower;
}

function normalizeCouponRow(row = {}) {
    return {
        store: normalizeStoreName(row.store || row.store_name || ''),
        code: String(row.code || row.coupon_code || '').trim(),
        discount: String(row.discount || row.description || '').trim(),
        expires_at: row.expires_at || row.expiresAt || null,
        country: String(row.country || row.country_code || 'ALL').toUpperCase(),
        verified: row.verified !== false,
        source_url: row.source_url || row.sourceUrl || null,
        disclaimer: row.disclaimer || null,
        is_live: true
    };
}

async function getLiveCouponsForStore(storeName, countryCode = 'MX') {
    if (!supabase) return [];
    const normalized = normalizeStoreName(storeName);
    const normalizedCountry = String(countryCode || 'MX').toUpperCase();
    if (!normalized) return [];
    try {
        const { data, error } = await supabase
            .from('live_coupons')
            .select('store, store_name, code, coupon_code, discount, description, expires_at, country, country_code, verified, source_url, disclaimer, created_at')
            .or(`store.eq.${normalized},store_name.eq.${normalized}`)
            .order('created_at', { ascending: false })
            .limit(10);
        if (error || !Array.isArray(data)) return [];
        const now = Date.now();
        return data
            .map(normalizeCouponRow)
            .filter(c => c.store === normalized)
            .filter(c => c.code && c.discount)
            .filter(c => c.country === 'ALL' || c.country === normalizedCountry)
            .filter(c => !c.expires_at || new Date(c.expires_at).getTime() > now)
            .filter(c => c.verified);
    } catch {
        return [];
    }
}

exports.getCouponsForStore = (storeName, countryCode = 'MX') => {
    const normalized = normalizeStoreName(storeName);
    const normalizedCountry = String(countryCode || 'MX').toUpperCase();
    const now = Date.now();
    return activeCoupons.filter(c => {
        const isStoreMatch = c.store === normalized;
        const isActive = new Date(c.expires_at).getTime() > now;
        const isCountryMatch = c.country === 'ALL' || c.country === normalizedCountry;
        return isStoreMatch && isActive && c.verified && isCountryMatch;
    });
};

exports.getAllActiveCoupons = (countryCode = 'MX') => {
    const normalizedCountry = String(countryCode || 'MX').toUpperCase();
    const now = Date.now();
    return activeCoupons.filter(c => {
        const isActive = new Date(c.expires_at).getTime() > now;
        const isCountryMatch = c.country === 'ALL' || c.country === normalizedCountry;
        return isActive && c.verified && isCountryMatch;
    });
};

exports.getBestCouponForStore = async (storeName, countryCode = 'MX', options = {}) => {
    const allowLiveLookup = Boolean(options.allowLiveLookup);
    if (allowLiveLookup) {
        const liveCoupons = await getLiveCouponsForStore(storeName, countryCode);
        if (liveCoupons.length > 0) {
            return liveCoupons[0];
        }
    }
    const fallbackCoupons = exports.getCouponsForStore(storeName, countryCode);
    return fallbackCoupons.length > 0 ? fallbackCoupons[0] : null;
};

exports.normalizeStoreName = normalizeStoreName;
