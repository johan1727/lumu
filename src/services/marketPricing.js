function marketKey(offer = {}) {
    const currency = String(offer.currency || '').trim().toUpperCase();
    const country = String(offer.countryCode || offer.country_code || '').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency) || !/^[A-Z]{2}$/.test(country)) return null;
    return `${country}:${currency}`;
}

function sameMarket(a, b) {
    const aKey = marketKey(a);
    return Boolean(aKey && aKey === marketKey(b));
}

function canCompareOfferPrices(a, b) {
    if (!sameMarket(a, b) || a?._variantMismatch || b?._variantMismatch) return false;
    const aMatch = Number(a?._modelMatchScore);
    const bMatch = Number(b?._modelMatchScore);
    if (!Number.isFinite(aMatch) || !Number.isFinite(bMatch) || aMatch < 0.65 || bMatch < 0.65) return false;
    return Math.abs(aMatch - bMatch) <= 0.15;
}

module.exports = { marketKey, sameMarket, canCompareOfferPrices };
