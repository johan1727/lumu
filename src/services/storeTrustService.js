const TIER_1_STORES = [
    'amazon',
    'walmart',
    'liverpool',
    'coppel',
    'best buy',
    'best buy mx',
    'elektra',
    'costco',
    "sam's club",
    'sams club',
    'office depot',
    'soriana',
    'sears',
    'home depot',
    'bodega aurrera',
    'sanborns',
    'falabella',
    'ripley',
    'paris',
    'lider',
    'pc factory',
    'hites',
    'abcdin',
    'la polar',
    'easy',
    'sodimac',
    'microplay',
    'sp digital',
    'entel',
    'movistar',
    'wom',
    'éxito',
    'exito',
    'alkosto',
    'ktronix',
    'homecenter',
    'olímpica',
    'olimpica',
    'jumbo',
    'panamericana',
    'frávega',
    'fravega',
    'garbarino',
    'musimundo',
    'megatone',
    'cetrogar',
    'coto digital',
    'carrefour',
    'plaza vea',
    'oechsle',
    'promart',
    'hiraoka',
    'local'
];

const TIER_2_STORES = [
    'mercado libre',
    'aliexpress',
    'linio',
    'claro shop'
];

const TIER_3_STORES = [
    'temu',
    'shein',
    'wish',
    'shopee'
];

const RISKY_C2C_PATTERNS = /facebook|marketplace|segunda mano|segundamano|locanto|vivanuncios|ebay|craigslist/;
const OFFICIAL_STORE_PATTERNS = /tienda oficial|official store|officialseller|official seller|store official|vendido por amazon|mercado shops/;
const VERIFIED_PATTERNS = /mercado lider|mercado platinum|verified|verificado|verified seller/;

function normalizeText(value) {
    return String(value || '').toLowerCase().trim();
}

function canonicalizeStoreName(name = '', url = '') {
    const source = `${normalizeText(name)} ${normalizeText(url)}`;
    if (!source) return 'desconocida';
    if (/amazon\.|\bamazon\b/.test(source)) return 'amazon';
    if (/mercadolibre\.|mercado libre|\bmeli\b/.test(source)) return 'mercado libre';
    if (/walmart\.|\bwalmart\b/.test(source)) return 'walmart';
    if (/liverpool\.|\bliverpool\b/.test(source)) return 'liverpool';
    if (/coppel\.|\bcoppel\b/.test(source)) return 'coppel';
    if (/bestbuy\.|best buy/.test(source)) return 'best buy';
    if (/elektra\.|\belektra\b/.test(source)) return 'elektra';
    if (/costco\.|\bcostco\b/.test(source)) return 'costco';
    if (/sams\.|sam'?s/.test(source)) return "sam's club";
    if (/officedepot\.|office depot/.test(source)) return 'office depot';
    if (/soriana\.|\bsoriana\b/.test(source)) return 'soriana';
    if (/sears\.|\bsears\b/.test(source)) return 'sears';
    if (/homedepot\.|home depot/.test(source)) return 'home depot';
    if (/bodegaaurrera\.|bodega aurrera/.test(source)) return 'bodega aurrera';
    if (/sanborns\.|\bsanborns\b/.test(source)) return 'sanborns';
    if (/falabella\.|\bfalabella\b/.test(source)) return 'falabella';
    if (/ripley\.|\bripley\b/.test(source)) return 'ripley';
    if (/paris\.cl|\bparis\b/.test(source)) return 'paris';
    if (/lider\.|\blider\b/.test(source)) return 'lider';
    if (/pcfactory\.|pc factory/.test(source)) return 'pc factory';
    if (/hites\.|\bhites\b/.test(source)) return 'hites';
    if (/abcdin\.|\babcdin\b/.test(source)) return 'abcdin';
    if (/lapolar\.|la polar/.test(source)) return 'la polar';
    if (/easy\.cl|\beasy\b/.test(source)) return 'easy';
    if (/sodimac\.|\bsodimac\b/.test(source)) return 'sodimac';
    if (/microplay\.|\bmicroplay\b/.test(source)) return 'microplay';
    if (/spdigital\.|sp digital/.test(source)) return 'sp digital';
    if (/entel\.|\bentel\b/.test(source)) return 'entel';
    if (/movistar\.|\bmovistar\b/.test(source)) return 'movistar';
    if (/wom\.|\bwom\b/.test(source)) return 'wom';
    if (/exito\.|\béxito\b|\bexito\b/.test(source)) return 'éxito';
    if (/alkosto\.|\balkosto\b/.test(source)) return 'alkosto';
    if (/ktronix\.|\bktronix\b/.test(source)) return 'ktronix';
    if (/homecenter\.|\bhomecenter\b/.test(source)) return 'homecenter';
    if (/olimpica\.|\bolímpica\b|\bolimpica\b/.test(source)) return 'olímpica';
    if (/jumbo\.com\.co|\bjumbo\b/.test(source)) return 'jumbo';
    if (/panamericana\.|panamericana/.test(source)) return 'panamericana';
    if (/fravega\.|\bfrávega\b|\bfravega\b/.test(source)) return 'frávega';
    if (/garbarino\.|\bgarbarino\b/.test(source)) return 'garbarino';
    if (/musimundo\.|\bmusimundo\b/.test(source)) return 'musimundo';
    if (/megatone\.|\bmegatone\b/.test(source)) return 'megatone';
    if (/cetrogar\.|\bcetrogar\b/.test(source)) return 'cetrogar';
    if (/cotodigital\.|coto digital/.test(source)) return 'coto digital';
    if (/carrefour\.|\bcarrefour\b/.test(source)) return 'carrefour';
    if (/plazavea\.|plaza vea/.test(source)) return 'plaza vea';
    if (/oechsle\.|\boechsle\b/.test(source)) return 'oechsle';
    if (/promart\.|\bpromart\b/.test(source)) return 'promart';
    if (/hiraoka\.|\bhiraoka\b/.test(source)) return 'hiraoka';
    if (/linio\.|\blinio\b/.test(source)) return 'linio';
    if (/claroshop\.|claro shop/.test(source)) return 'claro shop';
    if (/aliexpress\./.test(source) || /\baliexpress\b/.test(source)) return 'aliexpress';
    if (/temu\./.test(source) || /\btemu\b/.test(source)) return 'temu';
    if (/shein\./.test(source) || /\bshein\b/.test(source)) return 'shein';
    if (/wish\./.test(source) || /\bwish\b/.test(source)) return 'wish';
    if (/shopee\./.test(source) || /\bshopee\b/.test(source)) return 'shopee';
    if (/google\.com\/maps|📍 local|profesional local/.test(source)) return 'local';
    return normalizeText(name) || 'desconocida';
}

function getStoreTier(canonical) {
    if (TIER_1_STORES.includes(canonical)) return 1;
    if (TIER_2_STORES.includes(canonical)) return 2;
    if (TIER_3_STORES.includes(canonical)) return 3;
    return 2;
}

function getSellerModel(text, canonical) {
    if (canonical === 'local') return 'local';
    if (RISKY_C2C_PATTERNS.test(text)) return 'c2c';
    if (OFFICIAL_STORE_PATTERNS.test(text)) return 'official_store';
    if (VERIFIED_PATTERNS.test(text)) return 'verified_marketplace';
    if (canonical === 'mercado libre' || canonical === 'aliexpress' || canonical === 'linio' || canonical === 'claro shop') return 'marketplace';
    if (canonical === 'temu' || canonical === 'shein' || canonical === 'wish' || canonical === 'shopee') return 'marketplace';
    return 'retail';
}

function getTrustLabel(tier, sellerModel) {
    if (sellerModel === 'official_store') return 'Tienda oficial';
    if (sellerModel === 'verified_marketplace') return 'Vendedor verificado';
    if (sellerModel === 'c2c') return 'Marketplace/C2C';
    if (tier === 1) return 'Confiable';
    if (tier === 2) return 'Marketplace conocido';
    if (tier === 3) return 'Riesgo alto';
    return 'Marketplace';
}

function classifyStore(item = {}) {
    const source = item.source || item.store || '';
    const url = item.url || item.link || '';
    const text = `${normalizeText(item.title)} ${normalizeText(item.snippet)} ${normalizeText(source)} ${normalizeText(url)}`;
    const canonicalStore = canonicalizeStoreName(source, url);
    const storeTier = getStoreTier(canonicalStore);
    const sellerModel = getSellerModel(text, canonicalStore);
    const isKnownStore = canonicalStore !== 'desconocida';
    const isRiskyMarketplace = storeTier === 3 || sellerModel === 'c2c';
    const isTrustedRetail = storeTier === 1 || sellerModel === 'official_store';
    const trustLabel = getTrustLabel(storeTier, sellerModel);
    const riskFlags = [];

    if (sellerModel === 'c2c') riskFlags.push('c2c');
    if (storeTier === 3) riskFlags.push('high_risk_marketplace');
    if (!isKnownStore) riskFlags.push('unknown_store');
    if (sellerModel === 'marketplace') riskFlags.push('marketplace');

    return {
        canonicalStore,
        storeTier,
        sellerModel,
        trustLabel,
        isKnownStore,
        isRiskyMarketplace,
        isTrustedRetail,
        riskFlags
    };
}

function getTrustPenalty(item = {}, { conditionMode = 'all', expensiveProductSearch = false, strongMatch = false, weakMatch = false } = {}) {
    const trust = item.storeTrust || classifyStore(item);
    if (trust.sellerModel === 'local') return 0;

    let penalty = 0;

    if (trust.storeTier === 2) penalty += 120;
    if (trust.storeTier === 3) penalty += expensiveProductSearch ? 900 : 450;
    if (trust.sellerModel === 'marketplace') penalty += conditionMode === 'new' ? 180 : 0;
    if (trust.sellerModel === 'verified_marketplace') penalty += conditionMode === 'new' ? 80 : 0;
    if (trust.sellerModel === 'official_store') penalty -= 80;
    if (trust.sellerModel === 'c2c') penalty += conditionMode === 'used' ? -220 : 550;

    if ((trust.sellerModel === 'marketplace' || trust.sellerModel === 'verified_marketplace') && weakMatch) {
        penalty += expensiveProductSearch ? 850 : 420;
    }

    if ((trust.sellerModel === 'marketplace' || trust.sellerModel === 'verified_marketplace') && strongMatch) {
        penalty -= trust.sellerModel === 'verified_marketplace' ? 120 : 70;
    }

    if (trust.sellerModel === 'official_store' && strongMatch) {
        penalty -= 90;
    }

    return penalty;
}

function shouldAllowSafeStore(item = {}) {
    const trust = item.storeTrust || classifyStore(item);
    return trust.storeTier === 1 || trust.sellerModel === 'official_store' || trust.sellerModel === 'local';
}

module.exports = {
    canonicalizeStoreName,
    classifyStore,
    getTrustPenalty,
    shouldAllowSafeStore
};
