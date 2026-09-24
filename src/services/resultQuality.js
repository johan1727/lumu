const {resolveDirectProductUrl} = require('../utils/affiliateManager');
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
function availabilityOf(result) {
    const status = Number(result.productHttpStatus);
    if ([404,410].includes(status)) return 'removed';
    if (status >= 400 || result.verificationError) return 'unknown';
    const structured = normalize(result.availability || result.stockStatus || result.status);
    if (/^(?:https?:\/\/schema.org\/)?(?:outofstock|soldout|discontinued|closed|inactive|paused)$/.test(structured) || result.available_quantity === 0) return 'out_of_stock';
    if (/^(?:https?:\/\/schema.org\/)?(?:instock|limitedavailability)$/.test(structured) || Number(result.available_quantity) > 0) return 'in_stock';
    if (/preorder|presale|backorder/.test(structured)) return 'preorder';
    // Snippets can describe shipping or related products. They are not current
    // product-page verification; use an uncertainty state instead of a stock claim.
    if (/\b(agotado|sin stock|out of stock|sold out|publicacion finalizada)\b/.test(normalize(result.snippet))) return 'possibly_unavailable';
    return 'unknown';
}
function relevanceOf(result, query, conditionMode = 'all') {
    const q=normalize(query).replace(/(?:^|\s)-(?:"[^"]*"|\S+)/g, ' ').trim(), title=normalize(result.title || result.titulo);
    const accessories=/\b(funda|case|mica|protector|refaccion|repuesto|cargador|charger|cable|carcasa|adaptador|adapter)\b/;
    const device=/\b(iphone|galaxy|pixel|macbook|playstation|ps5|ps4|xbox|nintendo|laptop|celular|smartphone)\b/;
    if(device.test(q) && !accessories.test(q) && accessories.test(title.split(/\b(?:incluye|incluido|incluida|with|includes)\b/)[0])) return {score:0,reject:true,reason:'accessory_for_device'};
    // Explicit model generations are hard constraints; budgets are not models.
    const models=[...q.matchAll(/\b(iphone|galaxy\s*s|pixel|playstation|ps|rtx|gopro)\s*(\d{1,4})\b/g)];
    for(const [,brand,model] of models){
        const prefix=brand.replace(/\s+/g,'\\s*');
        const match=title.match(new RegExp('\\b'+prefix+'\\s*(\\d{1,4})\\b'));
        if(match && match[1]!==model)return {score:0,reject:true,reason:'different_model'};
    }
    const capacity = text => [...text.matchAll(/\b(\d+)\s*(gb|tb)\b/g)].map(m => Number(m[1]) * (m[2] === 'tb' ? 1024 : 1));
    const wantedCapacity = capacity(q), offeredCapacity = capacity(title);
    if (wantedCapacity.length && offeredCapacity.length && wantedCapacity.some(n => !offeredCapacity.includes(n))) return {score:0,reject:true,reason:'different_capacity'};
    const variant = text => (text.match(/\b(?:pro max|pro|plus|ultra|mini|lite|fe)\b/) || [null])[0];
    if (models.length && variant(q) !== variant(title) && (variant(q) || variant(title))) return {score:0,reject:true,reason:'different_variant'};
    const condition = text => /\b(reacondicionado|refurbished|renewed)\b/.test(text) ? 'refurbished' : /\b(usado|used|segunda mano)\b/.test(text) ? 'used' : /\b(nuevo|new)\b/.test(text) ? 'new' : null;
    const wantedCondition = condition(q) || (conditionMode === 'new' ? 'new' : null), offeredCondition = condition(title) || condition(normalize(result.condition || result.condicion || result.conditionLabel));
    if (conditionMode === 'used' && offeredCondition === 'new') return {score:0,reject:true,reason:'different_condition'};
    if (wantedCondition && offeredCondition && wantedCondition !== offeredCondition) return {score:0,reject:true,reason:'different_condition'};
    const ignored=new Set(['para','con','sin','por','los','las','una','uno','que','busco','quiero','comprar','precio','barato','mejor','menos','pesos','hasta','the','for','with','under','buy','best']);
    const words=q.match(/[a-z0-9]+/g)||[];
    const terms=words.filter(w=>w.length>2 && !ignored.has(w) && !/^\d+$/.test(w));
    const titleWords=new Set(title.match(/[a-z0-9]+/g)||[]);
    const score=terms.length ? terms.filter(t=>titleWords.has(t)).length/terms.length : .5;
    return {score,reject:false,reason:null};
}
function assessResult(result, query, {conditionMode = 'all'} = {}) {
    const availability=availabilityOf(result), relevance=relevanceOf(result,query,conditionMode);
    const originalUrl=result.urlOriginal || result.url;
    const resolvedUrl=originalUrl ? resolveDirectProductUrl(originalUrl) : '';
    const unresolved=Boolean(originalUrl && !resolvedUrl);
    return {...result,...offerEvidence(result),...(resolvedUrl ? {url:resolvedUrl,urlOriginal:resolvedUrl}:{}),availabilityState:availability,relevanceScore:relevance.score,
        qualityRejected:unresolved || relevance.reject || ['removed','out_of_stock','preorder','possibly_unavailable'].includes(availability),
        qualityReason:unresolved ? 'unresolved_merchant_url' : relevance.reason || availability};
}
// Only numeric, explicitly supplied amounts in one declared currency can form a total.
function offerEvidence(result) {
    const amount = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
    const price = amount(result.precio ?? result.price);
    const shipping = amount(result.shippingCost), fees = amount(result.additionalFees);
    const currency = /^[A-Z]{3}$/.test(result.currency || '') ? result.currency : null;
    const total = price !== null && price > 0 && shipping !== null && fees !== null && currency && result.costsComplete === true ? price + shipping + fees : null;
    const rawDate = result.availabilityObservedAt;
    const date = typeof rawDate === 'string' && Number.isFinite(Date.parse(rawDate)) && Date.parse(rawDate) <= Date.now() ? new Date(rawDate).toISOString() : null;
    return {
        totalCost: total, totalCostCurrency: total === null ? null : currency,
        availabilityEvidence: {state: availabilityOf(result), source: typeof result.availabilitySource === 'string' ? result.availabilitySource.slice(0,120) : null, observedAt: date},
        comparisonExplanation: 'Orden por coincidencia y grupos de moneda/costo conocido; dentro de cada grupo comparable, menor total informado primero. Si falta, no se compara como cero.',
        affiliateDisclosure: 'Algunos enlaces pueden generar una comisión para Lumu. La comisión no determina el orden.'
    };
}
function compareOffers(a, b) {
    if (Boolean(a.isMerchantReference) !== Boolean(b.isMerchantReference)) return a.isMerchantReference ? 1 : -1;
    const relevance = (b.relevanceScore || 0) - (a.relevanceScore || 0);
    if (relevance) return relevance;
    // Group complete totals by currency; keep unknown costs in a separate group.
    const group = item => Number.isFinite(item.totalCost) && item.totalCostCurrency ? item.totalCostCurrency : '~unknown';
    if ((group(a) === '~unknown') !== (group(b) === '~unknown')) return group(a) === '~unknown' ? 1 : -1;
    const currencyOrder = group(a).localeCompare(group(b));
    if (currencyOrder) return currencyOrder;
    if (a.totalCost !== null && b.totalCost !== null && Number.isFinite(a.totalCost) && Number.isFinite(b.totalCost) && a.totalCostCurrency === b.totalCostCurrency) return a.totalCost - b.totalCost || String(a.title || a.titulo || '').localeCompare(String(b.title || b.titulo || ''));
    return String(a.title || a.titulo || '').localeCompare(String(b.title || b.titulo || ''));
}
function rankOffers(results, query, options = {}) {
    return results.map(item => assessResult(item, query, options)).filter(item => !item.qualityRejected).sort(compareOffers);
}
module.exports={availabilityOf,relevanceOf,assessResult,offerEvidence,compareOffers,rankOffers};
