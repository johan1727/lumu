const activeCoupons = [
    {
        store: 'amazon',
        code: 'AMZNBNEW',
        discount: '10% OFF en primera compra',
        expires_at: '2027-12-31',
        country: 'MX',
        verified: true
    },
    {
        store: 'mercado libre',
        code: 'MELI10',
        discount: '10% OFF pagando con Mercado Pago',
        expires_at: '2026-12-31',
        country: 'MX',
        verified: true
    },
    {
        store: 'walmart',
        code: 'WALMART15',
        discount: '$150 OFF min. $1000',
        expires_at: '2026-06-30',
        country: 'MX',
        verified: true
    },
    {
        store: 'aliexpress',
        code: 'AEUS15',
        discount: '$15 USD OFF',
        expires_at: '2026-12-31',
        country: 'ALL',
        verified: true
    },
    {
        store: 'coppel',
        code: 'APPCOPPEL',
        discount: 'Envío Gratis + 5% OFF',
        expires_at: '2026-12-31',
        country: 'MX',
        verified: true
    },
    {
        store: 'elektra',
        code: 'ELEKTRA10',
        discount: '10% OFF en Tecnología',
        expires_at: '2026-12-31',
        country: 'MX',
        verified: true
    },
    {
        store: 'falabella',
        code: 'FALA-CL',
        discount: 'Hasta 10% OFF con banco asociado',
        expires_at: '2026-12-31',
        country: 'CL',
        verified: true
    },
    {
        store: 'ripley',
        code: 'RIPLEY-CL',
        discount: 'Descuento extra en app',
        expires_at: '2026-12-31',
        country: 'CL',
        verified: true
    },
    {
        store: 'paris',
        code: 'PARIS-CL',
        discount: 'Cupón de temporada',
        expires_at: '2026-12-31',
        country: 'CL',
        verified: true
    },
    {
        store: 'lider',
        code: 'LIDER-CL',
        discount: 'Descuento en compras seleccionadas',
        expires_at: '2026-12-31',
        country: 'CL',
        verified: true
    },
    {
        store: 'exito',
        code: 'EXITO-CO',
        discount: 'Cupón app en productos seleccionados',
        expires_at: '2026-12-31',
        country: 'CO',
        verified: true
    },
    {
        store: 'alkosto',
        code: 'ALKOSTO-CO',
        discount: 'Descuento online en tecnología',
        expires_at: '2026-12-31',
        country: 'CO',
        verified: true
    },
    {
        store: 'falabella',
        code: 'FALA-CO',
        discount: 'Hasta 15% OFF con medio de pago aliado',
        expires_at: '2026-12-31',
        country: 'CO',
        verified: true
    },
    {
        store: 'fravega',
        code: 'FRAVEGA-AR',
        discount: 'Descuento web en electro',
        expires_at: '2026-12-31',
        country: 'AR',
        verified: true
    },
    {
        store: 'garbarino',
        code: 'GARBA-AR',
        discount: 'Promo online seleccionada',
        expires_at: '2026-12-31',
        country: 'AR',
        verified: true
    },
    {
        store: 'musimundo',
        code: 'MUSI-AR',
        discount: 'Cupón en categorías seleccionadas',
        expires_at: '2026-12-31',
        country: 'AR',
        verified: true
    },
    {
        store: 'falabella',
        code: 'FALA-PE',
        discount: 'Cupón exclusivo online',
        expires_at: '2026-12-31',
        country: 'PE',
        verified: true
    },
    {
        store: 'ripley',
        code: 'RIPLEY-PE',
        discount: 'Descuento extra en compras web',
        expires_at: '2026-12-31',
        country: 'PE',
        verified: true
    },
    {
        store: 'plaza vea',
        code: 'PLAZAVEA-PE',
        discount: 'Cupón para compras seleccionadas',
        expires_at: '2026-12-31',
        country: 'PE',
        verified: true
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
