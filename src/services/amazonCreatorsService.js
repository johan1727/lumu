'use strict';
const axios = require('axios');
const {assessResult} = require('./resultQuality');
const TOKEN_ENDPOINTS = Object.freeze({
    '3.1': 'https://api.amazon.com/auth/o2/token',
    '3.2': 'https://api.amazon.co.uk/auth/o2/token',
    '3.3': 'https://api.amazon.co.jp/auth/o2/token'
});
const MARKETS = Object.freeze({MX: {host:'www.amazon.com.mx', currency:'MXN'}, US: {host:'www.amazon.com', currency:'USD'}});
const resources = ['images.primary.medium','itemInfo.title','offersV2.listings.price',
    'offersV2.listings.availability','offersV2.listings.condition','offersV2.listings.isBuyBoxWinner',
    'offersV2.listings.dealDetails','offersV2.listings.type'];
function configFor(env, country) {
    const market = MARKETS[country];
    const id = env.AMAZON_CREATORS_CREDENTIAL_ID, secret = env.AMAZON_CREATORS_CREDENTIAL_SECRET;
    const endpoint = TOKEN_ENDPOINTS[env.AMAZON_CREATORS_CREDENTIAL_VERSION];
    const tag = country === 'MX' ? env.AMAZON_AFFILIATE_TAG_MX || env.AMAZON_AFFILIATE_TAG : env.AMAZON_AFFILIATE_TAG_US;
    if (env.AMAZON_CREATORS_ENABLED !== 'true' || !market || !id || !secret || !endpoint || !tag || /^(pending|todo|null|undefined)$/i.test(tag)) return null;
    return {...market, id, secret, endpoint, tag};
}
function mapItem(item, market, query, observedAt) {
    let url;
    try { url = new URL(item.detailPageURL); } catch { return null; }
    if (url.protocol !== 'https:' || url.hostname !== market.host || url.username || url.password) return null;
    const listings = item.offersV2?.listings;
    if (!Array.isArray(listings)) return null;
    // A product URL lands on the featured offer. Never borrow a different seller's price.
    const listing = listings.find(x => x.isBuyBoxWinner === true);
    if (!listing || listing.violatesMAP || (listing.type && listing.type !== 'LIGHTNING_DEAL' && listing.type !== 'LIGHTNINGDEAL')) return null;
    if (listing.dealDetails?.accessType && listing.dealDetails.accessType !== 'ALL') return null;
    const money = listing.price?.money, title = item.itemInfo?.title?.displayValue;
    if (!title || typeof money?.amount !== 'number' || !Number.isFinite(money.amount) || money.amount <= 0 || money.currency !== market.currency) return null;
    const availabilityType = String(listing.availability?.type || '').replace(/_/g,'').toUpperCase();
    const availability = ({INSTOCK:'InStock',INSTOCKSCARCE:'LimitedAvailability',OUTOFSTOCK:'OutOfStock',UNAVAILABLE:'OutOfStock',PREORDER:'PreOrder',AVAILABLEDATE:'PreOrder',LEADTIME:'PreOrder'})[availabilityType] || '';
    const result = assessResult({title, price:money.amount, currency:money.currency, moneda:money.currency,
        url:item.detailPageURL, urlOriginal:item.detailPageURL, source:market.currency === 'MXN' ? 'Amazon MX' : 'Amazon',
        image:item.images?.primary?.medium?.url || '', condition:listing.condition?.value || '',
        availability, availabilitySource:'amazon_creators_api', availabilityObservedAt:observedAt,
        priceObservedAt:observedAt, priceEvidenceSource:'amazon_creators_api', priceSource:'amazon_creators_api',
        resultSource:'amazon_creators_api', priceConfidence:0.95, isDirectProductPage:true,
        isMerchantReference:false, costsComplete:false, affiliateAttributionStatus:'unverified'
    }, query);
    return result.qualityRejected ? null : result;
}
function createAmazonCreatorsService({env = process.env, request = options => axios(options), now = Date.now} = {}) {
    env = {...env};
    let token = null, tokenPending = null, blockedUntil = 0;
    // Credentials are read once per service instance; redeploy after changing configuration.
    async function post(url, data, headers, signal) {
        try {
            const response = await request({method:'POST',url,data,headers:{'Content-Type':'application/json',...headers},
                signal,timeout:4500,maxRedirects:0,maxContentLength:2*1024*1024,maxBodyLength:16384});
            return response.data;
        } catch (error) {
            const status = Number(error?.response?.status) || 0;
            if ([401,403,429].includes(status)) {
                blockedUntil = now() + (status === 429 ? 60000 : 300000);
                if (status !== 429) token = null;
            }
            // Never propagate Axios request headers, credential bodies, URLs or provider messages.
            const safe = new Error(signal?.aborted ? 'Amazon Creators request cancelled' : `Amazon Creators request failed (${status || 'network'})`);
            safe.code = signal?.aborted ? 'ERR_CANCELED' : 'AMAZON_CREATORS_REQUEST_FAILED';
            safe.status = status;
            throw safe;
        }
    }
    async function getToken(cfg) {
        if (token && token.expiresAt > now()) return token.value;
        if (!tokenPending) tokenPending = (async()=>{
            const data = await post(cfg.endpoint,{grant_type:'client_credentials',client_id:cfg.id,client_secret:cfg.secret,scope:'creatorsapi::default'},{});
            if (typeof data?.access_token !== 'string' || !data.access_token || !Number.isFinite(Number(data.expires_in)) || Number(data.expires_in) <= 60) throw new Error('Amazon Creators invalid token response');
            token = {value:data.access_token,expiresAt:now()+(Math.min(Number(data.expires_in),3600)-60)*1000};
            return token.value;
        })().finally(()=>{tokenPending=null;});
        return tokenPending;
    }
    async function search(query, country='MX', signal) {
        const cfg=configFor(env,String(country).toUpperCase());
        if (!cfg) return null;
        if (!String(query || '').trim() || String(query).length > 500 || signal?.aborted || now() < blockedUntil) return [];
        const accessToken=await getToken(cfg);
        if (signal?.aborted || now() < blockedUntil) return [];
        const data=await post('https://creatorsapi.amazon/catalog/v1/searchItems',{
            keywords:String(query).trim(),searchIndex:'All',itemCount:10,partnerTag:cfg.tag,marketplace:cfg.host,resources
        },{Authorization:`Bearer ${accessToken}`,'x-marketplace':cfg.host},signal);
        const items=data?.searchResult?.items;
        return Array.isArray(items) ? items.slice(0,10).map(item=>mapItem(item,cfg,query,new Date(now()).toISOString())).filter(Boolean) : [];
    }
    return {search};
}
const service=createAmazonCreatorsService();
module.exports={searchAmazonCreators:service.search,createAmazonCreatorsService};
