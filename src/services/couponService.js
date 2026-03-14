const activeCoupons = [
    {
        store: 'amazon',
        code: 'AMZNBNEW',
        discount: '10% OFF en primera compra',
        expires_at: '2027-12-31',
        verified: true
    },
    {
        store: 'mercado libre',
        code: 'MELI10',
        discount: '10% OFF pagando con Mercado Pago',
        expires_at: '2026-12-31',
        verified: true
    },
    {
        store: 'walmart',
        code: 'WALMART15',
        discount: '$150 OFF min. $1000',
        expires_at: '2026-06-30',
        verified: true
    },
    {
        store: 'aliexpress',
        code: 'AEUS15',
        discount: '$15 USD OFF',
        expires_at: '2026-12-31',
        verified: true
    },
    {
        store: 'coppel',
        code: 'APPCOPPEL',
        discount: 'Envío Gratis + 5% OFF',
        expires_at: '2026-12-31',
        verified: true
    },
    {
        store: 'elektra',
        code: 'ELEKTRA10',
        discount: '10% OFF en Tecnología',
        expires_at: '2026-12-31',
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
    return lower;
}

exports.getCouponsForStore = (storeName) => {
    const normalized = normalizeStoreName(storeName);
    const now = Date.now();
    return activeCoupons.filter(c => {
        const isStoreMatch = c.store === normalized;
        const isActive = new Date(c.expires_at).getTime() > now;
        return isStoreMatch && isActive && c.verified;
    });
};

exports.getAllActiveCoupons = () => {
    const now = Date.now();
    return activeCoupons.filter(c => new Date(c.expires_at).getTime() > now && c.verified);
};
