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

exports.normalizeStoreName = normalizeStoreName;
