const ML_AFFILIATE_CAMPAIGN = process.env.ML_AFFILIATE_CAMPAIGN || '';
const AMAZON_AFFILIATE_TAG = (process.env.AMAZON_AFFILIATE_TAG || '').trim();

const missingAffiliateConfigs = [];
if (!ML_AFFILIATE_CAMPAIGN) missingAffiliateConfigs.push('ML_AFFILIATE_CAMPAIGN');
if (!AMAZON_AFFILIATE_TAG) missingAffiliateConfigs.push('AMAZON_AFFILIATE_TAG');
if (missingAffiliateConfigs.length > 0) {
    console.warn(`[Affiliate] Variables faltantes: ${missingAffiliateConfigs.join(', ')}. Se usarán enlaces sin afiliado en esas tiendas.`);
}

const DIRECT_URL_PARAM_KEYS = ['url', 'q', 'adurl', 'imgurl', 'rct', 'u'];

function decodeRepeated(value = '', maxPasses = 3) {
    let current = String(value || '');
    for (let i = 0; i < maxPasses; i++) {
        try {
            const decoded = decodeURIComponent(current);
            if (decoded === current) break;
            current = decoded;
        } catch (error) {
            break;
        }
    }
    return current;
}

function tryBuildUrl(candidate) {
    const normalized = decodeRepeated(String(candidate || '').trim());
    if (!normalized) return null;
    if (/^(javascript|data|vbscript):/i.test(normalized)) return null;
    try {
        const url = new URL(normalized);
        if (url.protocol === 'http:' || url.protocol === 'https:') {
            return url;
        }
        return null;
    } catch (error) {
        const nestedMatch = normalized.match(/https?:\/\/[^\s"'<>]+/i);
        if (!nestedMatch) return null;
        try {
            const nestedUrl = new URL(nestedMatch[0]);
            return nestedUrl.protocol === 'http:' || nestedUrl.protocol === 'https:' ? nestedUrl : null;
        } catch (nestedError) {
            return null;
        }
    }
}

function resolveGoogleRedirect(urlObj) {
    for (const key of DIRECT_URL_PARAM_KEYS) {
        const candidate = urlObj.searchParams.get(key);
        const resolved = tryBuildUrl(candidate);
        if (resolved && !resolved.hostname.toLowerCase().includes('google.')) {
            return resolved;
        }
    }

    for (const [key, value] of urlObj.searchParams.entries()) {
        if (!value || /^(ved|ei|sa|oq|gs_lcp|sca_esv|biw|bih|hl|gl)$/i.test(key)) {
            continue;
        }
        const resolved = tryBuildUrl(value);
        if (resolved && !resolved.hostname.toLowerCase().includes('google.')) {
            return resolved;
        }
    }

    const nestedUrlMatch = decodeRepeated(urlObj.toString()).match(/https?:\/\/[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]+/g);
    if (!nestedUrlMatch) return urlObj;
    const firstExternal = nestedUrlMatch
        .map(candidate => tryBuildUrl(candidate))
        .find(candidate => candidate && !candidate.hostname.toLowerCase().includes('google.'));
    return firstExternal || urlObj;
}

const normalizeStoreUrl = (urlObj) => {
    const host = (urlObj.hostname || '').toLowerCase();
    const path = (urlObj.pathname || '').toLowerCase();

    if (host.includes('google.') && path === '/url') {
        const redirectTarget = urlObj.searchParams.get('url') || urlObj.searchParams.get('q');
        if (redirectTarget) {
            try {
                return new URL(redirectTarget);
            } catch (e) {
                return urlObj;
            }
        }
    }

     if (host.includes('google.')) {
        return resolveGoogleRedirect(urlObj);
    }

    return urlObj;
};

exports.resolveDirectProductUrl = (originalUrl) => {
    try {
        const raw = (originalUrl || '').trim();
        if (!raw || /^(javascript|data|vbscript):/i.test(raw)) {
            return '';
        }

        const original = new URL(raw);
        if (original.protocol !== 'http:' && original.protocol !== 'https:') {
            return '';
        }

        return normalizeStoreUrl(original).toString();
    } catch (error) {
        return originalUrl || '';
    }
};

exports.generateAffiliateLink = (originalUrl, source) => {
    try {
        const raw = (originalUrl || '').trim();

        // SECURITY FIX #18: Block javascript: and data: URI injection
        if (/^(javascript|data|vbscript):/i.test(raw)) {
            console.warn('[Affiliate] Blocked dangerous URI:', raw.slice(0, 50));
            return '';
        }

        const original = new URL(raw);

        // Only allow http/https protocols
        if (original.protocol !== 'http:' && original.protocol !== 'https:') {
            console.warn('[Affiliate] Blocked non-HTTP protocol:', original.protocol);
            return '';
        }

        const urlObj = normalizeStoreUrl(original);
        const sourceLower = String(source || '').toLowerCase();

        // 1. Inyectar afiliado de Mercado Libre
        if (sourceLower.includes('mercadolibre') || sourceLower.includes('mercado libre')) {
            if (ML_AFFILIATE_CAMPAIGN) {
                urlObj.searchParams.set('re_id', ML_AFFILIATE_CAMPAIGN);
            }
            return urlObj.toString();
        }

        // 2. Inyectar afiliado de Amazon Associates
        const host = (urlObj.hostname || '').toLowerCase();
        if (host.includes('amazon.com') && AMAZON_AFFILIATE_TAG) {
            urlObj.searchParams.set('tag', AMAZON_AFFILIATE_TAG);
            return urlObj.toString();
        }

        // 3. Loss Leader: Dejar intacto para otras tiendas (Liverpool, Walmart, Coppel, etc.)
        return urlObj.toString();

    } catch (error) {
        // Si la URL no es válida o hay un error, devolvemos la original
        return originalUrl;
    }
};
