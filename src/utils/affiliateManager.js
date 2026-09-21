const sanitizeAffiliateValue = (value = '') => {
    const normalized = String(value || '').trim();
    return !normalized || /^(pending|todo|n\/a|null|undefined)$/i.test(normalized) ? '' : normalized;
};
const onDomain = (host, domain) => host === domain || host.endsWith(`.${domain}`);
const amazonTags = {
    'amazon.com.mx': sanitizeAffiliateValue(process.env.AMAZON_AFFILIATE_TAG_MX || process.env.AMAZON_AFFILIATE_TAG),
    'amazon.com': sanitizeAffiliateValue(process.env.AMAZON_AFFILIATE_TAG_US)
};
function parseHttp(value) {
    try {
        const url = new URL(String(value || '').trim());
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
        return url;
    } catch { return null; }
}
function isGoogleHost(host) {
    return ['google.com', 'google.com.mx', 'google.co.uk', 'google.cl', 'google.com.co', 'google.com.ar', 'google.com.pe']
        .some(domain => onDomain(host, domain));
}
function resolveDirectProductUrl(originalUrl) {
    let url = parseHttp(originalUrl);
    if (!url) return '';
    // Decode only the nested target, never the entire URL: signed affiliate URLs
    // may contain escaped separators that must survive normalization unchanged.
    for (let hop = 0; hop < 3 && isGoogleHost(url.hostname); hop++) {
        let target;
        for (const key of ['url','q','adurl','u']) {
            const value = url.searchParams.get(key);
            if (!value) continue;
            target = parseHttp(value);
            if (!target) { try { target = parseHttp(decodeURIComponent(value)); } catch {} }
            if (target) break;
            if (/^(?:javascript|data|vbscript):/i.test(value)) return '';
        }
        if (!target) break;
        url = target;
    }
    return isGoogleHost(url.hostname) ? '' : url.toString();
}
function generateAffiliateLink(originalUrl) {
    const resolved = resolveDirectProductUrl(originalUrl);
    const url = parseHttp(resolved);
    if (!url) return '';
    for (const [domain, tag] of Object.entries(amazonTags)) {
        if (onDomain(url.hostname, domain) && tag) {
            url.searchParams.set('tag', tag);
            return url.toString();
        }
    }
    // Preserve official generated links for Mercado Libre, AliExpress, CJ/Impact
    // and other networks. Adding guessed re_id/aff_id parameters does not establish
    // attribution. Import provider-issued links once the account/feed is approved.
    return resolved;
}
module.exports = { resolveDirectProductUrl, generateAffiliateLink };
