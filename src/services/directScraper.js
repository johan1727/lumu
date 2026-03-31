const axios = require('axios');
const cheerio = require('cheerio');
const crypto = require('crypto');

// Pool de User-Agents reales para rotación — reduce bloqueos en producción
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3.1 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3.1 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.105 Mobile Safari/537.36',
];

const getRandomUA = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

const ACCEPT_LANGUAGE_MAP = {
    MX: 'es-MX,es;q=0.9,en-US;q=0.8,en;q=0.7',
    CL: 'es-CL,es;q=0.9,en-US;q=0.8,en;q=0.7',
    CO: 'es-CO,es;q=0.9,en-US;q=0.8,en;q=0.7',
    AR: 'es-AR,es;q=0.9,en-US;q=0.8,en;q=0.7',
    PE: 'es-PE,es;q=0.9,en-US;q=0.8,en;q=0.7',
    US: 'en-US,en;q=0.9,es;q=0.7'
};

const getAcceptLanguage = (countryCode = 'MX') => {
    const normalizedCountry = String(countryCode || 'MX').toUpperCase();
    return ACCEPT_LANGUAGE_MAP[normalizedCountry] || ACCEPT_LANGUAGE_MAP.MX;
};

const getAxiosConfig = (countryCode = 'MX') => {
    const config = {
        headers: {
            'User-Agent': getRandomUA(),
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': getAcceptLanguage(countryCode),
            'Accept-Encoding': 'gzip, deflate, br',
            'Cache-Control': 'no-cache',
        },
        timeout: 5000,
    };

    // Smart Proxy Rotation (Sprint 3)
    if (process.env.SCRAPER_PROXIES) {
        const proxies = process.env.SCRAPER_PROXIES.split(',').map(p => p.trim()).filter(Boolean);
        if (proxies.length > 0) {
            const randomProxyUrl = proxies[Math.floor(Math.random() * proxies.length)];
            try {
                const proxyUrl = new URL(randomProxyUrl);
                config.proxy = {
                    protocol: proxyUrl.protocol.replace(':', ''),
                    host: proxyUrl.hostname,
                    port: parseInt(proxyUrl.port, 10) || 80,
                };
                if (proxyUrl.username && proxyUrl.password) {
                    config.proxy.auth = { 
                        username: decodeURIComponent(proxyUrl.username), 
                        password: decodeURIComponent(proxyUrl.password) 
                    };
                }
                console.log(`[Proxy] Using rotated proxy: ${config.proxy.host}`);
            } catch (e) {
                console.warn('[Proxy Error] URL de proxy inválida en SCRAPER_PROXIES');
            }
        }
    }
    return config;
};

const MARKETPLACE_CACHE_TTL_MS = 2 * 60 * 60 * 1000;

// SerpApi daily budget tracker (resets on day change)
let serpApiDailyCount = 0;
let serpApiDayKey = new Date().toISOString().slice(0, 10);
const SERPAPI_DAILY_CAP = 50;

function canUseSerpApi() {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== serpApiDayKey) {
        serpApiDayKey = today;
        serpApiDailyCount = 0;
    }
    return serpApiDailyCount < SERPAPI_DAILY_CAP;
}

function recordSerpApiUsage() {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== serpApiDayKey) {
        serpApiDayKey = today;
        serpApiDailyCount = 0;
    }
    serpApiDailyCount++;
    console.log(`[SerpApi Budget] ${serpApiDailyCount}/${SERPAPI_DAILY_CAP} used today`);
}
const marketplaceApiCache = new Map();

function getMarketplaceCache(key) {
    const entry = marketplaceApiCache.get(key);
    if (!entry) return null;
    if ((Date.now() - entry.ts) > MARKETPLACE_CACHE_TTL_MS) {
        marketplaceApiCache.delete(key);
        return null;
    }
    return entry.data;
}

function setMarketplaceCache(key, data) {
    if (!data || (Array.isArray(data) && data.length === 0)) return;
    marketplaceApiCache.set(key, {
        ts: Date.now(),
        data
    });
    if (marketplaceApiCache.size > 200) {
        const oldestKey = marketplaceApiCache.keys().next().value;
        if (oldestKey) marketplaceApiCache.delete(oldestKey);
    }
}

function simplifyMarketplaceQuery(query = '') {
    return String(query || '')
        .replace(/\b\d+(gb|tb|mb|ram|ssd|hdd|mah|mp|hz|w)\b/gi, '')
        .replace(/\b(ultra|pro|max|plus|mini|gen\s*\d+|\d+th gen)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function sha256Hex(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function hmac(key, value, encoding) {
    return crypto.createHmac('sha256', key).update(value).digest(encoding);
}

function getAmazonPaapiConfig(countryCode = 'MX') {
    const normalizedCountry = String(countryCode || 'MX').toUpperCase();
    const host = process.env.AMAZON_PAAPI_HOST || (normalizedCountry === 'US' ? 'webservices.amazon.com' : 'webservices.amazon.com.mx');
    const region = process.env.AMAZON_PAAPI_REGION || 'us-east-1';
    const marketplace = process.env.AMAZON_PAAPI_MARKETPLACE || (normalizedCountry === 'US' ? 'www.amazon.com' : 'www.amazon.com.mx');
    return { host, region, marketplace };
}

function getAmazonDomainConfig(countryCode = 'MX') {
    const normalizedCountry = String(countryCode || 'MX').toUpperCase();
    return normalizedCountry === 'US'
        ? {
            sourceLabel: 'Amazon',
            domain: 'amazon.com',
            marketplace: 'www.amazon.com',
            amazonDomain: 'https://www.amazon.com'
        }
        : {
            sourceLabel: 'Amazon MX',
            domain: 'amazon.com.mx',
            marketplace: 'www.amazon.com.mx',
            amazonDomain: 'https://www.amazon.com.mx'
        };
}

async function searchAmazonSerpApi(query, countryCode = 'MX', signal) {
    const apiKey = (process.env.SERPAPI_KEY || '').trim();
    if (!apiKey) return null;
    if (!canUseSerpApi()) {
        console.warn('[Amazon SerpApi] Daily budget exhausted, skipping');
        return null;
    }

    const normalizedCountry = String(countryCode || 'MX').toUpperCase();
    const { sourceLabel, domain } = getAmazonDomainConfig(normalizedCountry);
    const cacheKey = `amazon_serpapi:${normalizedCountry}:${String(query || '').toLowerCase().trim()}`;
    const cacheHit = getMarketplaceCache(cacheKey);
    if (cacheHit) {
        console.log(`[Amazon SerpApi Cache Hit] ${sourceLabel} -> ${query}`);
        return cacheHit;
    }

    recordSerpApiUsage();
    let response;
    try {
        response = await axios.get('https://serpapi.com/search.json', {
            timeout: 6000,
            signal,
            params: {
                engine: 'amazon',
                api_key: apiKey,
                amazon_domain: domain,
                k: query,
                sort_by: 'price_low_to_high',
                language: normalizedCountry === 'US' ? 'en_US' : 'es'
            }
        });
    } catch (err) {
        const status = err?.response?.status;
        const detail = JSON.stringify(err?.response?.data || {}).slice(0, 300);
        console.warn(`[Amazon SerpApi] HTTP ${status || err.code}: ${detail || err.message}`);
        return null;
    }

    const products = Array.isArray(response.data?.organic_results) ? response.data.organic_results : [];
    const mapped = products.map((item) => {
        const price = Number(
            item?.price?.value
            || item?.extracted_price
            || item?.prices?.[0]?.value
            || 0
        );
        const originalPrice = Number(
            item?.price?.before_discount_value
            || item?.list_price?.value
            || item?.prices?.[1]?.value
            || item?.prices?.find?.((entry, index) => index > 0 && Number(entry?.value) > price)?.value
            || 0
        );
        const hasDiscount = Number.isFinite(originalPrice) && originalPrice > price;
        const url = item?.link || item?.product_link || '';
        const shippingText = item?.shipping || item?.delivery || item?.extensions?.join(' ') || '';
        const couponText = item?.coupon_text || item?.coupon || '';
        if (!item?.title || !url || !Number.isFinite(price) || price <= 0) return null;
        return {
            title: item.title,
            price,
            url,
            source: sourceLabel,
            image: item.thumbnail || item.image || '',
            rating: item.rating || null,
            snippet: [shippingText, couponText].filter(Boolean).join(' · '),
            shippingText,
            couponText,
            originalPrice: hasDiscount ? originalPrice : null,
            discountPct: hasDiscount ? Math.round((1 - price / originalPrice) * 100) : 0,
            isDealPrice: hasDiscount,
            hasStrikeThroughPrice: hasDiscount,
            couponApplied: /coupon applied|cup[oó]n aplicado/i.test(String(couponText || '')),
            observedPrices: [price].filter(Boolean),
            priceConfidence: 0.95,
            priceSource: 'amazon_serpapi',
            resultSource: 'amazon_serpapi',
            isDirectProductPage: true,
            hasStockSignal: !/currently unavailable|agotado|unavailable/i.test(String(item?.availability || '')),
            hasVerifiedStoreSignal: true
        };
    }).filter(Boolean);

    setMarketplaceCache(cacheKey, mapped);
    return mapped;
}

async function searchAmazonPaapi(query, countryCode = 'MX', signal) {
    const accessKey = process.env.AMAZON_PAAPI_ACCESS_KEY;
    const secretKey = process.env.AMAZON_PAAPI_SECRET_KEY;
    const partnerTag = process.env.AMAZON_PAAPI_PARTNER_TAG;
    if (!accessKey || !secretKey || !partnerTag) return null;

    const { host, region, marketplace } = getAmazonPaapiConfig(countryCode);
    const service = 'ProductAdvertisingAPI';
    const target = 'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems';
    const payload = JSON.stringify({
        Keywords: query,
        SearchIndex: 'All',
        ItemCount: 10,
        PartnerTag: partnerTag,
        PartnerType: 'Associates',
        Marketplace: marketplace,
        Resources: [
            'Images.Primary.Medium',
            'ItemInfo.Title',
            'ItemInfo.ByLineInfo',
            'Offers.Listings.Price',
            'Offers.Summaries.LowestPrice'
        ]
    });

    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const canonicalHeaders = `content-encoding:amz-1.0\ncontent-type:application/json; charset=utf-8\nhost:${host}\nx-amz-date:${amzDate}\nx-amz-target:${target}\n`;
    const signedHeaders = 'content-encoding;content-type;host;x-amz-date;x-amz-target';
    const canonicalRequest = `POST\n/paapi5/searchitems\n\n${canonicalHeaders}\n${signedHeaders}\n${sha256Hex(payload)}`;
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${sha256Hex(canonicalRequest)}`;
    const kDate = hmac(`AWS4${secretKey}`, dateStamp);
    const kRegion = hmac(kDate, region);
    const kService = hmac(kRegion, service);
    const kSigning = hmac(kService, 'aws4_request');
    const signature = hmac(kSigning, stringToSign, 'hex');
    const authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const response = await axios.post(`https://${host}/paapi5/searchitems`, payload, {
        timeout: 4500,
        signal,
        headers: {
            'Content-Encoding': 'amz-1.0',
            'Content-Type': 'application/json; charset=utf-8',
            'X-Amz-Date': amzDate,
            'X-Amz-Target': target,
            'Authorization': authorization,
            'Host': host
        }
    });

    const items = Array.isArray(response.data?.SearchResult?.Items) ? response.data.SearchResult.Items : [];
    return items.map((item) => {
        const price = Number(item?.Offers?.Listings?.[0]?.Price?.Amount || item?.Offers?.Summaries?.[0]?.LowestPrice?.Amount || 0);
        const originalPrice = Number(item?.Offers?.Listings?.[0]?.SavingBasis?.Amount || 0);
        const savingsAmount = Number(item?.Offers?.Listings?.[0]?.Price?.Savings?.Amount || 0);
        const hasDiscount = (Number.isFinite(originalPrice) && originalPrice > price) || (Number.isFinite(savingsAmount) && savingsAmount > 0);
        const url = item?.DetailPageURL || '';
        if (!item?.ItemInfo?.Title?.DisplayValue || !url || !Number.isFinite(price) || price <= 0) return null;
        return {
            title: item.ItemInfo.Title.DisplayValue,
            price,
            url,
            source: String(countryCode || 'MX').toUpperCase() === 'US' ? 'Amazon' : 'Amazon MX',
            image: item?.Images?.Primary?.Medium?.URL || '',
            rating: null,
            originalPrice: hasDiscount ? (originalPrice > price ? originalPrice : price + savingsAmount) : null,
            discountPct: hasDiscount
                ? Math.round((1 - (price / Math.max(price + savingsAmount, originalPrice || 0))) * 100)
                : 0,
            isDealPrice: hasDiscount,
            hasStrikeThroughPrice: hasDiscount,
            couponApplied: false
        };
    }).filter(Boolean);
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function throwIfAborted(signal) {
    if (signal?.aborted) {
        const error = new Error('Aborted');
        error.name = 'AbortError';
        error.code = 'ERR_CANCELED';
        throw error;
    }
}

async function fetchMercadoLibreApi(url, apiOpts, signal, label = 'query', maxRetries = 2) {
    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            throwIfAborted(signal);
            return await axios.get(url, apiOpts);
        } catch (error) {
            lastError = error;
            if (error?.name === 'AbortError' || error?.code === 'ERR_CANCELED') {
                throw error;
            }
            const status = error?.response?.status;
            const retryable = error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT' || [403, 429, 500, 502, 503, 504].includes(status);
            if (attempt < maxRetries && retryable) {
                const delay = status === 403
                    ? (1500 + (attempt * 1200) + Math.round(Math.random() * 400))
                    : (700 + (attempt * 900) + Math.round(Math.random() * 300));
                console.warn(`[ML API] ${label} failed (${status || error.code || error.message}). Retry ${attempt + 1}/${maxRetries} in ${delay}ms`);
                await sleep(delay);
                continue;
            }
            console.warn(`[ML API] ${label} failed definitivamente: ${status || error.code || error.message}`);
            return null;
        }
    }
    return null;
}

function getAxiosConfigWithSignal(countryCode = 'MX', signal) {
    const config = getAxiosConfig(countryCode);
    if (signal) {
        config.signal = signal;
    }
    return config;
}

const MERCADO_LIBRE_SITE_MAP = {
    MX: 'MLM',
    CL: 'MLC',
    AR: 'MLA',
    CO: 'MCO',
    PE: 'MPE',
    US: 'MLM'
};

const MERCADO_LIBRE_SOURCE_MAP = {
    MX: 'Mercado Libre MX',
    CL: 'Mercado Libre CL',
    AR: 'Mercado Libre AR',
    CO: 'Mercado Libre CO',
    PE: 'Mercado Libre PE',
    US: 'Mercado Libre'
};

const MERCADO_LIBRE_BASE_DOMAIN_MAP = {
    MX: 'www.mercadolibre.com.mx',
    CL: 'www.mercadolibre.cl',
    AR: 'www.mercadolibre.com.ar',
    CO: 'www.mercadolibre.com.co',
    PE: 'www.mercadolibre.com.pe',
    US: 'www.mercadolibre.com.mx'
};

const FALABELLA_CONFIG_MAP = {
    CL: {
        baseUrl: 'https://www.falabella.com/falabella-cl/search',
        source: 'Falabella CL'
    },
    CO: {
        baseUrl: 'https://www.falabella.com.co/falabella-co/search',
        source: 'Falabella CO'
    },
    PE: {
        baseUrl: 'https://www.falabella.com.pe/falabella-pe/search',
        source: 'Falabella PE'
    }
};

const scrapeWithRetry = async (url, maxRetries = 2, countryCode = 'MX', signal) => {
    let lastError;
    for (let i = 0; i <= maxRetries; i++) {
        try {
            throwIfAborted(signal);
            const config = getAxiosConfigWithSignal(countryCode, signal);
            return await axios.get(url, config);
        } catch (error) {
            lastError = error;
            if (error?.name === 'AbortError' || error?.code === 'ERR_CANCELED') {
                throw error;
            }
            const isRetryable = error.code === 'ECONNABORTED' || (error.response && [503, 429, 403].includes(error.response.status));

            if (i < maxRetries && isRetryable) {
                const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
                console.warn(`[Scraper Retry] Intento ${i + 1} fallido (${error.message}). Reintentando en ${Math.round(delay)}ms...`);
                await sleep(delay);
                continue;
            }
            break;
        }
    }
    throw lastError;
};

function mapMercadoLibreApiResults(data, sourceLabel) {
    return Array.isArray(data?.results)
        ? data.results.map((item) => {
            const price = Number(item.price);
            const permalink = item.permalink || item.url || '';
            if (!item.title || !Number.isFinite(price) || !permalink) return null;
            const originalPrice = Number(item.original_price);
            const hasDiscount = Number.isFinite(originalPrice) && originalPrice > price;
            const shippingFree = item.shipping?.free_shipping === true;
            const shippingText = shippingFree ? 'Envío gratis' : '';
            const conditionLabel = item.condition === 'used' ? 'used' : (item.condition === 'refurbished' ? 'refurbished' : 'new');
            const sellerRep = item.seller?.seller_reputation?.level_id || '';
            const sellerPowerLevel = item.seller?.seller_reputation?.power_seller_status || '';
            const installments = item.installments;
            const installmentText = installments ? `${installments.quantity}x $${installments.amount}` : '';
            return {
                title: item.title,
                price,
                url: permalink,
                source: sourceLabel,
                image: item.thumbnail || item.secure_thumbnail || item.pictures?.[0]?.url || '',
                originalPrice: hasDiscount ? originalPrice : null,
                discountPct: hasDiscount ? Math.round((1 - price / originalPrice) * 100) : 0,
                shippingText,
                hasShippingLanguage: shippingFree,
                conditionLabel,
                sellerReputation: sellerRep,
                sellerPowerLevel,
                installmentText,
                hasInstallmentLanguage: Boolean(installments),
                isDealPrice: hasDiscount,
                hasStrikeThroughPrice: hasDiscount,
                couponApplied: false,
                observedPrices: [price].filter(Boolean),
                priceConfidence: 0.95,
                priceSource: 'ml_api_direct',
                resultSource: 'ml_api_direct',
                isDirectProductPage: true,
                hasStockSignal: item.available_quantity > 0,
                hasVerifiedStoreSignal: ['5_green', '4_light_green', '3_yellow'].includes(sellerRep) || Boolean(sellerPowerLevel),
                rating: item.reviews?.rating_average || null
            };
        }).filter(Boolean)
        : [];
}

function buildMercadoLibreConditionParam(conditionMode = '') {
    const normalized = String(conditionMode || '').toLowerCase();
    if (normalized === 'new') return '&condition=new';
    if (normalized === 'used') return '&condition=used';
    return '';
}

exports.scrapeMercadoLibreDirect = async (query, signal) => {
    try {
        throwIfAborted(signal);
        console.log(`[Direct Scraper] Iniciando búsqueda ultra-rápida en MercadoLibre para: ${query} (Con Retry)`);
        const url = `https://listado.mercadolibre.com.mx/${encodeURIComponent(query)}`;
        const response = await scrapeWithRetry(url, 2, 'MX', signal);
        const $ = cheerio.load(response.data);

        const results = [];
        // Support both old (.ui-search-result__wrapper) and new poly-card layout
        $('.ui-search-result__wrapper, .poly-card, [class*="poly-card"]').slice(0, 8).each((index, element) => {
            const title = $(element).find(
                'h2.ui-search-item__title, a.poly-component__title, [class*="poly-component__title"]'
            ).first().text().trim();

            const urlNode = $(element).find(
                'a.ui-search-link, a.poly-component__title, a[class*="title"]'
            ).first().attr('href');

            // Price: try multiple selectors for old and poly-card layouts
            let priceText = $(element).find(
                '.andes-money-amount__fraction, [class*="price__fraction"], [class*="money-amount__fraction"]'
            ).first().text().replace(/[,.]/g, '').replace(/\D/g, '');

            if (!priceText) {
                priceText = $(element).find('[class*="price"]').first().text().replace(/[^0-9]/g, '');
            }

            // Image: try multiple lazy-load attributes
            const imgEl = $(element).find(
                'img.ui-search-result-image__image, img.poly-component__picture, [class*="image"] img'
            ).first();
            const imageNode = imgEl.attr('data-src') ||
                              imgEl.attr('src') ||
                              imgEl.attr('data-lazy-src') ||
                              imgEl.attr('data-original') || '';

            const parsedPrice = parseFloat(priceText);
            if (title && urlNode && Number.isFinite(parsedPrice) && parsedPrice > 0) {
                results.push({
                    title,
                    price: parsedPrice,
                    url: urlNode,
                    source: 'Mercado Libre MX',
                    image: imageNode || ''
                });
            }
        });

        console.log(`[Direct Scraper] MercadoLibre encontró: ${results.length} resultados.`);
        return results;

    } catch (error) {
        console.error('[Direct Scraper] Error crítico en MercadoLibre tras reintentos:', error.message);
        return [];
    }
};

exports.scrapeMercadoLibreAPI = async (query, countryCode = 'MX', signal, conditionMode = '') => {
    try {
        throwIfAborted(signal);
        const normalizedCountry = String(countryCode || 'MX').toUpperCase();
        const siteId = MERCADO_LIBRE_SITE_MAP[normalizedCountry] || 'MLM';
        const sourceLabel = MERCADO_LIBRE_SOURCE_MAP[normalizedCountry] || 'Mercado Libre';
        const baseDomain = MERCADO_LIBRE_BASE_DOMAIN_MAP[normalizedCountry] || 'www.mercadolibre.com.mx';
        const encodedQuery = encodeURIComponent(query);
        const apiOpts = {
            timeout: 6000,
            signal,
            headers: {
                'User-Agent': getRandomUA(),
                'Accept': 'application/json',
                'Accept-Language': getAcceptLanguage(normalizedCountry),
                'Accept-Encoding': 'gzip, deflate',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Origin': `https://${baseDomain}`,
                'Referer': `https://${baseDomain}/`
            }
        };
        const conditionParam = buildMercadoLibreConditionParam(conditionMode);
        const cacheKey = `ml_api:${normalizedCountry}:${String(conditionMode || 'any').toLowerCase()}:${query.toLowerCase().trim()}`;
        const cacheHit = getMarketplaceCache(cacheKey);
        if (cacheHit) {
            console.log(`[ML API Cache Hit] ${sourceLabel} -> ${query}`);
            return cacheHit;
        }

        // PERF: Two parallel queries — cheapest + most relevant (ML default is "recommended", not cheapest)
        const priceUrl = `https://api.mercadolibre.com/sites/${siteId}/search?q=${encodedQuery}${conditionParam}&sort=price_asc&limit=50`;
        const relevanceUrl = `https://api.mercadolibre.com/sites/${siteId}/search?q=${encodedQuery}${conditionParam}&limit=50`;
        console.log(`[ML API] Buscando en ${siteId} para ${normalizedCountry}: ${query} (precio + relevancia en paralelo, condition=${conditionMode || 'any'})`);

        const [priceRes, relevanceRes] = await Promise.all([
            fetchMercadoLibreApi(priceUrl, apiOpts, signal, 'price_asc'),
            fetchMercadoLibreApi(relevanceUrl, apiOpts, signal, 'relevance')
        ]);

        const priceResults = mapMercadoLibreApiResults(priceRes?.data, sourceLabel);
        const relevanceResults = mapMercadoLibreApiResults(relevanceRes?.data, sourceLabel);

        // Deduplicate by URL
        const seenUrls = new Set();
        const combined = [];
        for (const item of [...priceResults, ...relevanceResults]) {
            const key = item.url.split('?')[0].toLowerCase();
            if (!seenUrls.has(key)) {
                seenUrls.add(key);
                combined.push(item);
            }
        }

        if (combined.length === 0) {
            console.warn(`[ML API] 0 resultados para "${query}". Intentando fallback simple...`);
            await sleep(1500);
            const fallbackUrl = `https://api.mercadolibre.com/sites/${siteId}/search?q=${encodedQuery}${conditionParam}&limit=30`;
            const fallbackRes = await fetchMercadoLibreApi(fallbackUrl, apiOpts, signal, 'fallback_simple', 1);
            for (const item of mapMercadoLibreApiResults(fallbackRes?.data, sourceLabel)) {
                const key = item.url.split('?')[0].toLowerCase();
                if (!seenUrls.has(key)) {
                    seenUrls.add(key);
                    combined.push(item);
                }
            }
        }

        // If zero results, retry with simplified query (strip specs like "256gb", model numbers)
        if (combined.length === 0 && query.split(/\s+/).length > 2) {
            const simplified = simplifyMarketplaceQuery(query);
            if (simplified !== query && simplified.length > 2) {
                console.log(`[ML API] Retry con query simplificada: "${simplified}"`);
                const retryUrl = `https://api.mercadolibre.com/sites/${siteId}/search?q=${encodeURIComponent(simplified)}${conditionParam}&limit=30`;
                const retryRes = await fetchMercadoLibreApi(retryUrl, apiOpts, signal, 'fallback_simplified', 1);
                combined.push(...mapMercadoLibreApiResults(retryRes?.data, sourceLabel).filter(item => {
                    const key = item.url.split('?')[0].toLowerCase();
                    if (seenUrls.has(key)) return false;
                    seenUrls.add(key);
                    return true;
                }));
            }
        }

        setMarketplaceCache(cacheKey, combined);
        console.log(`[ML API] ${sourceLabel} encontró: ${combined.length} resultados.`);
        return combined;
    } catch (error) {
        console.error('[ML API] Error consultando MercadoLibre API:', error.message);
        return [];
    }
};

exports.scrapeFalabellaRegional = async (query, countryCode = 'CL', signal) => {
    try {
        throwIfAborted(signal);
        const normalizedCountry = String(countryCode || 'CL').toUpperCase();
        const falabellaConfig = FALABELLA_CONFIG_MAP[normalizedCountry];
        if (!falabellaConfig) return [];

        console.log(`[Direct Scraper] Buscando en ${falabellaConfig.source}: ${query}`);
        const baseDomain = falabellaConfig.baseUrl.split('/search')[0];
        const url = `${falabellaConfig.baseUrl}?Ntt=${encodeURIComponent(query)}`;
        const response = await scrapeWithRetry(url, 2, normalizedCountry, signal);
        const $ = cheerio.load(response.data);
        const results = [];

        $('script[type="application/ld+json"]').each((i, el) => {
            try {
                const raw = $(el).html();
                if (!raw) return;
                const json = JSON.parse(raw);
                const items = json['@type'] === 'ItemList'
                    ? (json.itemListElement || [])
                    : (json['@type'] === 'Product' ? [json] : []);

                items.slice(0, 8).forEach((item) => {
                    const product = item.item || item;
                    const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;
                    const productUrl = product.url || product['@id'] || '';
                    const numericPrice = Number(offer?.price);
                    if (!product?.name || !productUrl || !Number.isFinite(numericPrice)) return;

                    results.push({
                        title: product.name,
                        price: numericPrice,
                        url: productUrl.startsWith('http') ? productUrl : `${baseDomain}${productUrl}`,
                        source: falabellaConfig.source,
                        image: typeof product.image === 'string' ? product.image : (product.image?.[0] || '')
                    });
                });
            } catch (error) { }
        });

        if (results.length === 0) {
            $('[data-pod], [class*="pod"], [class*="ProductCard"], a[href*="/product/"]').slice(0, 8).each((i, el) => {
                const title = $(el).find('[class*="title"], b, h3, h4').first().text().trim();
                const link = $(el).is('a') ? $(el).attr('href') : $(el).find('a').first().attr('href');
                const priceRaw = $(el).find('[class*="price"], [class*="Price"], [data-internet-price]').first().text().trim();
                const image = $(el).find('img').first().attr('src') || $(el).find('img').first().attr('data-src');
                const normalizedPrice = String(priceRaw || '').replace(/[^\d.,]/g, '');
                const parsedPrice = normalizedPrice ? parseFloat(normalizedPrice.replace(/\./g, '').replace(',', '.')) : NaN;

                if (title && link && Number.isFinite(parsedPrice)) {
                    results.push({
                        title,
                        price: parsedPrice,
                        url: link.startsWith('http') ? link : `${baseDomain}${link}`,
                        source: falabellaConfig.source,
                        image: image ? (image.startsWith('//') ? `https:${image}` : image) : ''
                    });
                }
            });
        }

        console.log(`[Direct Scraper] ${falabellaConfig.source} encontró: ${results.length} resultados.`);
        return results;
    } catch (error) {
        console.error('[Direct Scraper] Error en Falabella regional:', error.message);
        return [];
    }
};

exports.scrapeAmazonDirect = async (query, countryCode = 'MX', signal) => {
    try {
        throwIfAborted(signal);
        const normalizedCountry = String(countryCode || 'MX').toUpperCase();
        const { sourceLabel, amazonDomain } = getAmazonDomainConfig(normalizedCountry);
        const serpApiResults = await searchAmazonSerpApi(query, normalizedCountry, signal).catch((error) => {
            console.warn(`[Amazon SerpApi] Fallback a otras fuentes: ${error.message}`);
            return null;
        });
        if (Array.isArray(serpApiResults) && serpApiResults.length > 0) {
            console.log(`[Amazon SerpApi] ${sourceLabel} encontró: ${serpApiResults.length} resultados.`);
            return serpApiResults;
        }
        const paApiResults = await searchAmazonPaapi(query, normalizedCountry, signal).catch((error) => {
            console.warn(`[Amazon PAAPI] Fallback al scraper HTML: ${error.message}`);
            return null;
        });
        if (Array.isArray(paApiResults) && paApiResults.length > 0) {
            console.log(`[Amazon PAAPI] ${sourceLabel} encontró: ${paApiResults.length} resultados.`);
            return paApiResults;
        }
        console.log(`[Direct Scraper] Iniciando búsqueda ultra-rápida en ${sourceLabel} para: ${query} (Con Retry)`);
        const url = `${amazonDomain}/s?k=${encodeURIComponent(query)}`;
        const response = await scrapeWithRetry(url, 2, normalizedCountry, signal);
        const $ = cheerio.load(response.data);

        // Detect CAPTCHA/block
        const bodyText = $('body').text().toLowerCase();
        if (bodyText.includes('robot') || bodyText.includes('captcha') || bodyText.includes('sorry')) {
            console.warn(`[Direct Scraper] ${sourceLabel} parece bloqueado (CAPTCHA detectado).`);
            return [];
        }

        const results = [];
        $('.s-result-item[data-component-type="s-search-result"]').slice(0, 15).each((index, element) => {
            const title = $(element).find('h2 span').text().trim();
            const urlPath = $(element).find('h2').parent('a').attr('href') || $(element).find('h2 a').attr('href');
            const priceWhole = $(element).find('.a-price-whole').first().text().replace(/,/g, '');
            const priceFraction = $(element).find('.a-price-fraction').first().text().trim();
            const strikePriceRaw = $(element).find('.a-price.a-text-price .a-offscreen, .a-price[data-a-strike="true"] .a-offscreen').first().text().trim();
            const couponText = $(element).find('[class*="coupon"], .s-coupon-unclipped, .couponBadge').first().text().trim();
            const imageNode = $(element).find('img.s-image').attr('src');
            // Also try to get rating info
            const ratingText = $(element).find('.a-icon-alt').first().text().trim();
            const price = parseFloat(`${priceWhole}.${priceFraction || '00'}`);
            const strikePrice = strikePriceRaw ? parseFloat(String(strikePriceRaw).replace(/[^0-9.]/g, '')) : NaN;
            const hasDiscount = Number.isFinite(strikePrice) && strikePrice > price;

            if (title && priceWhole && urlPath) {
                results.push({
                    title: title,
                    price,
                    url: urlPath.startsWith('http') ? urlPath : `${amazonDomain}${urlPath}`,
                    source: sourceLabel,
                    image: imageNode || '',
                    rating: ratingText || null,
                    couponText,
                    originalPrice: hasDiscount ? strikePrice : null,
                    discountPct: hasDiscount ? Math.round((1 - price / strikePrice) * 100) : 0,
                    isDealPrice: hasDiscount,
                    hasStrikeThroughPrice: hasDiscount,
                    couponApplied: /coupon applied|cup[oó]n aplicado/i.test(String(couponText || '')),
                    snippet: couponText || ''
                });
            }
        });

        console.log(`[Direct Scraper] ${sourceLabel} encontró: ${results.length} resultados.`);
        return results;
    } catch (error) {
        console.error('[Direct Scraper] Error crítico en Amazon tras reintentos:', error.message);
        return [];
    }
};

/**
 * Scraper para Walmart México
 */
exports.scrapeWalmartMX = async (query, signal) => {
    try {
        throwIfAborted(signal);
        console.log(`[Direct Scraper] Buscando en Walmart MX: ${query}`);
        const url = `https://www.walmart.com.mx/productos?Ntt=${encodeURIComponent(query)}`;
        const response = await scrapeWithRetry(url, 2, 'MX', signal);
        const $ = cheerio.load(response.data);

        const results = [];
        $('[data-testid="product-card"], .product-card, [class*="ProductCard"]').slice(0, 8).each((i, el) => {
            const title = $(el).find('[class*="title"], h3, h4, [data-testid="product-title"]').first().text().trim();
            const link = $(el).find('a[href*="/ip/"], a[href*="/productos/"]').first().attr('href');
            const priceText = $(el).find('[class*="price"], [data-testid="product-price"]').first().text().replace(/[^0-9.]/g, '');
            const img = $(el).find('img').first().attr('src') || $(el).find('img').first().attr('data-src');

            if (title && priceText && link) {
                results.push({
                    title,
                    price: parseFloat(priceText),
                    url: link.startsWith('http') ? link : `https://www.walmart.com.mx${link}`,
                    source: 'Walmart MX',
                    image: img || ''
                });
            }
        });

        console.log(`[Direct Scraper] Walmart MX encontró: ${results.length} resultados.`);
        return results;
    } catch (error) {
        console.error('[Direct Scraper] Error en Walmart MX:', error.message);
        return [];
    }
};

/**
 * Scraper para Liverpool México
 */
exports.scrapeLiverpoolMX = async (query, signal) => {
    try {
        throwIfAborted(signal);
        console.log(`[Direct Scraper] Buscando en Liverpool MX: ${query}`);
        const url = `https://www.liverpool.com.mx/tienda?s=${encodeURIComponent(query)}`;
        const response = await scrapeWithRetry(url, 2, 'MX', signal);
        const $ = cheerio.load(response.data);

        const results = [];
        // Liverpool uses JSON-LD structured data and product cards
        $('script[type="application/ld+json"]').each((i, el) => {
            try {
                const json = JSON.parse($(el).html());
                if (json['@type'] === 'ItemList' && json.itemListElement) {
                    json.itemListElement.slice(0, 8).forEach(item => {
                        const product = item.item || item;
                        if (product.name && product.offers) {
                            const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;
                            results.push({
                                title: product.name,
                                price: parseFloat(offer.price) || null,
                                url: product.url || product['@id'] || '',
                                source: 'Liverpool',
                                image: product.image || ''
                            });
                        }
                    });
                }
            } catch (e) { /* skip invalid JSON-LD */ }
        });

        // Fallback: parse HTML product cards
        if (results.length === 0) {
            $('[class*="product-card"], [class*="plp-card"], .card-product, a[class*="product"]').slice(0, 8).each((i, el) => {
                const title = $(el).find('[class*="title"], [class*="name"], h3, h4').first().text().trim();
                const link = $(el).is('a') ? $(el).attr('href') : $(el).find('a').first().attr('href');
                const priceText = $(el).find('[class*="price"], [class*="Price"]').first().text().replace(/[^0-9.]/g, '');
                const img = $(el).find('img').first().attr('src') || $(el).find('img').first().attr('data-src');

                if (title && title.length > 3 && link) {
                    results.push({
                        title,
                        price: priceText ? parseFloat(priceText) : null,
                        url: link.startsWith('http') ? link : `https://www.liverpool.com.mx${link}`,
                        source: 'Liverpool',
                        image: img || ''
                    });
                }
            });
        }

        console.log(`[Direct Scraper] Liverpool MX encontró: ${results.length} resultados.`);
        return results;
    } catch (error) {
        console.error('[Direct Scraper] Error en Liverpool MX:', error.message);
        return [];
    }
};

/**
 * Scraper para Coppel México
 */
exports.scrapeCoppelMX = async (query, signal) => {
    try {
        throwIfAborted(signal);
        console.log(`[Direct Scraper] Buscando en Coppel MX: ${query}`);
        const url = `https://www.coppel.com/search?searchTerms=${encodeURIComponent(query)}`;
        const response = await scrapeWithRetry(url, 2, 'MX', signal);
        const $ = cheerio.load(response.data);

        const results = [];
        // Coppel product cards
        $('[class*="product-card"], .productCard, [class*="ProductCard"], [data-product]').slice(0, 8).each((i, el) => {
            const title = $(el).find('[class*="title"], [class*="name"], [class*="Title"], h3, h4').first().text().trim();
            const link = $(el).find('a[href*="/producto/"], a[href*="/p/"]').first().attr('href') || $(el).find('a').first().attr('href');
            const priceText = $(el).find('[class*="price"], [class*="Price"], [class*="precio"]').first().text().replace(/[^0-9.]/g, '');
            const img = $(el).find('img').first().attr('src') || $(el).find('img').first().attr('data-src');

            if (title && title.length > 3 && link) {
                results.push({
                    title,
                    price: priceText ? parseFloat(priceText) : null,
                    url: link.startsWith('http') ? link : `https://www.coppel.com${link}`,
                    source: 'Coppel',
                    image: img || ''
                });
            }
        });

        // Fallback: JSON-LD structured data
        if (results.length === 0) {
            $('script[type="application/ld+json"]').each((i, el) => {
                try {
                    const json = JSON.parse($(el).html());
                    const items = json['@type'] === 'ItemList' ? (json.itemListElement || []) : (json['@type'] === 'Product' ? [json] : []);
                    items.slice(0, 8).forEach(item => {
                        const product = item.item || item;
                        if (product.name && product.offers) {
                            const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;
                            results.push({
                                title: product.name,
                                price: parseFloat(offer?.price) || null,
                                url: product.url || '',
                                source: 'Coppel',
                                image: typeof product.image === 'string' ? product.image : (product.image?.[0] || '')
                            });
                        }
                    });
                } catch (e) { /* skip */ }
            });
        }

        console.log(`[Direct Scraper] Coppel MX encontró: ${results.length} resultados.`);
        return results;
    } catch (error) {
        console.error('[Direct Scraper] Error en Coppel MX:', error.message);
        return [];
    }
};

/**
 * Scraper para AliExpress (productos internacionales baratos)
 */
exports.scrapeAliExpress = async (query, signal) => {
    try {
        throwIfAborted(signal);
        console.log(`[Direct Scraper] Buscando en AliExpress: ${query}`);
        // Use wholesale.aliexpress or the search page with ship-from MX/US filter
        const url = `https://www.aliexpress.com/w/wholesale-${encodeURIComponent(query).replace(/%20/g, '-')}.html?g=y&SearchText=${encodeURIComponent(query)}&shipCountry=MX`;
        const config = getAxiosConfigWithSignal('MX', signal);
        config.headers['Accept-Language'] = 'es-MX,es;q=0.9';
        config.timeout = 8000;
        
        const response = await axios.get(url, config);
        const $ = cheerio.load(response.data);

        const results = [];

        // AliExpress renders product cards with various class patterns
        $('[class*="search-item-card"], [class*="SearchItem"], [class*="product-card"], .list--gallery--C2f2tvm a').slice(0, 5).each((i, el) => {
            const title = $(el).find('[class*="title"], h3, h1').first().text().trim();
            const link = $(el).is('a') ? $(el).attr('href') : $(el).find('a').first().attr('href');
            const priceText = $(el).find('[class*="price"], [class*="Price"]').first().text().replace(/[^0-9.]/g, '');
            const img = $(el).find('img').first().attr('src') || $(el).find('img').first().attr('data-src');

            if (title && title.length > 3 && link) {
                const fullUrl = link.startsWith('http') ? link : `https://www.aliexpress.com${link}`;
                results.push({
                    title: title.slice(0, 200),
                    price: priceText ? parseFloat(priceText) : null,
                    url: fullUrl.split('?')[0], // Clean tracking params
                    source: 'AliExpress',
                    image: img ? (img.startsWith('//') ? `https:${img}` : img) : ''
                });
            }
        });

        // Fallback: Try to extract from __NEXT_DATA__ or window.runParams JSON
        if (results.length === 0) {
            const scriptContent = $('script').toArray()
                .map(s => $(s).html())
                .find(s => s && (s.includes('itemList') || s.includes('productId')));
            
            if (scriptContent) {
                const priceMatches = [...scriptContent.matchAll(/"(?:min|original)?[Pp]rice"\s*:\s*"?([\d.]+)"?/g)];
                const titleMatches = [...scriptContent.matchAll(/"(?:title|subject|productTitle)"\s*:\s*"([^"]{5,200})"/g)];
                const urlMatches = [...scriptContent.matchAll(/"(?:productDetailUrl|itemUrl)"\s*:\s*"([^"]+)"/g)];

                for (let i = 0; i < Math.min(titleMatches.length, 5); i++) {
                    results.push({
                        title: titleMatches[i]?.[1] || 'Producto AliExpress',
                        price: priceMatches[i] ? parseFloat(priceMatches[i][1]) : null,
                        url: urlMatches[i] ? urlMatches[i][1] : `https://www.aliexpress.com/w/wholesale-${encodeURIComponent(query)}.html`,
                        source: 'AliExpress',
                        image: ''
                    });
                }
            }
        }

        console.log(`[Direct Scraper] AliExpress encontró: ${results.length} resultados.`);
        return results;
    } catch (error) {
        console.error('[Direct Scraper] Error en AliExpress:', error.message);
        return [];
    }
};

/**
 * Scraper para Elektra México (gratis, sin Serper)
 */
exports.scrapeElektraMX = async (query, signal) => {
    try {
        throwIfAborted(signal);
        console.log(`[Direct Scraper] Buscando en Elektra MX: ${query}`);
        const url = `https://www.elektra.com.mx/busqueda?q=${encodeURIComponent(query)}`;
        const response = await scrapeWithRetry(url, 2, 'MX', signal);
        const $ = cheerio.load(response.data);

        const results = [];

        // Try JSON-LD structured data first (most reliable)
        $('script[type="application/ld+json"]').each((i, el) => {
            try {
                const json = JSON.parse($(el).html());
                const items = json['@type'] === 'ItemList' ? (json.itemListElement || [])
                    : json['@type'] === 'Product' ? [json] : [];
                items.slice(0, 5).forEach(item => {
                    const product = item.item || item;
                    if (product.name && product.offers) {
                        const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;
                        results.push({
                            title: product.name,
                            price: parseFloat(offer?.price) || null,
                            url: product.url || product['@id'] || url,
                            source: 'Elektra',
                            image: typeof product.image === 'string' ? product.image : (product.image?.[0] || '')
                        });
                    }
                });
            } catch (e) { /* skip */ }
        });

        // Fallback: HTML product cards
        if (results.length === 0) {
            $('[class*="product-card"], [class*="ProductCard"], [data-product], .vtex-search-result-3-x-galleryItem').slice(0, 5).each((i, el) => {
                const title = $(el).find('[class*="productName"], [class*="title"], [class*="name"], h3, h2').first().text().trim();
                const link = $(el).find('a[href*="/producto/"], a[href*="/p"]').first().attr('href') || $(el).find('a').first().attr('href');
                const priceText = $(el).find('[class*="sellingPrice"], [class*="price"], [class*="Price"]').first().text().replace(/[^0-9.]/g, '');
                const img = $(el).find('img').first().attr('src') || $(el).find('img').first().attr('data-src');

                if (title && title.length > 3 && link) {
                    results.push({
                        title,
                        price: priceText ? parseFloat(priceText) : null,
                        url: link.startsWith('http') ? link : `https://www.elektra.com.mx${link}`,
                        source: 'Elektra',
                        image: img || ''
                    });
                }
            });
        }

        console.log(`[Direct Scraper] Elektra MX encontró: ${results.length} resultados.`);
        return results;
    } catch (error) {
        console.error('[Direct Scraper] Error en Elektra MX:', error.message);
        return [];
    }
};

/**
 * Scraper para Best Buy México (gratis, sin Serper)
 */
exports.scrapeBestBuyMX = async (query, signal) => {
    try {
        throwIfAborted(signal);
        console.log(`[Direct Scraper] Buscando en Best Buy MX: ${query}`);
        const url = `https://www.bestbuy.com.mx/c/search?text=${encodeURIComponent(query)}`;
        const response = await scrapeWithRetry(url, 2, 'MX', signal);
        const $ = cheerio.load(response.data);

        const results = [];

        // JSON-LD structured data
        $('script[type="application/ld+json"]').each((i, el) => {
            try {
                const json = JSON.parse($(el).html());
                const items = json['@type'] === 'ItemList' ? (json.itemListElement || [])
                    : json['@type'] === 'Product' ? [json] : [];
                items.slice(0, 5).forEach(item => {
                    const product = item.item || item;
                    if (product.name && product.offers) {
                        const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;
                        results.push({
                            title: product.name,
                            price: parseFloat(offer?.price) || null,
                            url: product.url || url,
                            source: 'Best Buy MX',
                            image: typeof product.image === 'string' ? product.image : (product.image?.[0] || '')
                        });
                    }
                });
            } catch (e) { /* skip */ }
        });

        // Fallback: HTML product cards
        if (results.length === 0) {
            $('[class*="product-card"], [class*="ProductCard"], .sku-item, [class*="list-item"]').slice(0, 5).each((i, el) => {
                const title = $(el).find('[class*="title"], [class*="name"], h4, h3, .sku-title a').first().text().trim();
                const link = $(el).find('a[href*="/p/"]').first().attr('href') || $(el).find('a').first().attr('href');
                const priceText = $(el).find('[class*="price"], [class*="Price"], .priceView-customer-price span').first().text().replace(/[^0-9.]/g, '');
                const img = $(el).find('img').first().attr('src') || $(el).find('img').first().attr('data-src');

                if (title && title.length > 3 && link) {
                    results.push({
                        title,
                        price: priceText ? parseFloat(priceText) : null,
                        url: link.startsWith('http') ? link : `https://www.bestbuy.com.mx${link}`,
                        source: 'Best Buy MX',
                        image: img || ''
                    });
                }
            });
        }

        console.log(`[Direct Scraper] Best Buy MX encontró: ${results.length} resultados.`);
        return results;
    } catch (error) {
        console.error('[Direct Scraper] Error en Best Buy MX:', error.message);
        return [];
    }
};

/**
 * Scraper para Costco México (gratis, sin Serper)
 */
exports.scrapeCostcoMX = async (query, signal) => {
    try {
        throwIfAborted(signal);
        console.log(`[Direct Scraper] Buscando en Costco MX: ${query}`);
        const url = `https://www.costco.com.mx/search?text=${encodeURIComponent(query)}`;
        const response = await scrapeWithRetry(url, 2, 'MX', signal);
        const $ = cheerio.load(response.data);

        const results = [];

        // Costco uses product-list items
        $('[class*="product"], .product-tile, [class*="ProductCard"]').slice(0, 5).each((i, el) => {
            const title = $(el).find('[class*="description"], [class*="title"], [class*="name"], h3, h2, a[class*="product"]').first().text().trim();
            const link = $(el).find('a[href*="/p/"], a[href*=".product."]').first().attr('href') || $(el).find('a').first().attr('href');
            const priceText = $(el).find('[class*="price"], [class*="Price"]').first().text().replace(/[^0-9.]/g, '');
            const img = $(el).find('img').first().attr('src') || $(el).find('img').first().attr('data-src');

            if (title && title.length > 3 && link) {
                results.push({
                    title,
                    price: priceText ? parseFloat(priceText) : null,
                    url: link.startsWith('http') ? link : `https://www.costco.com.mx${link}`,
                    source: 'Costco MX',
                    image: img || ''
                });
            }
        });

        // Fallback: JSON-LD
        if (results.length === 0) {
            $('script[type="application/ld+json"]').each((i, el) => {
                try {
                    const json = JSON.parse($(el).html());
                    if (json['@type'] === 'ItemList' && json.itemListElement) {
                        json.itemListElement.slice(0, 5).forEach(item => {
                            const product = item.item || item;
                            if (product.name && product.offers) {
                                const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;
                                results.push({
                                    title: product.name,
                                    price: parseFloat(offer?.price) || null,
                                    url: product.url || url,
                                    source: 'Costco MX',
                                    image: typeof product.image === 'string' ? product.image : ''
                                });
                            }
                        });
                    }
                } catch (e) { /* skip */ }
            });
        }

        console.log(`[Direct Scraper] Costco MX encontró: ${results.length} resultados.`);
        return results;
    } catch (error) {
        console.error('[Direct Scraper] Error en Costco MX:', error.message);
        return [];
    }
};

/**
 * Scraper para Sam's Club México (gratis, sin Serper)
 */
exports.scrapeSamsClubMX = async (query, signal) => {
    try {
        throwIfAborted(signal);
        console.log(`[Direct Scraper] Buscando en Sam's Club MX: ${query}`);
        const url = `https://www.sams.com.mx/buscar?q=${encodeURIComponent(query)}`;
        const response = await scrapeWithRetry(url, 2, 'MX', signal);
        const $ = cheerio.load(response.data);

        const results = [];

        // Sam's uses VTEX-style product cards
        $('[class*="product-card"], [class*="ProductCard"], [class*="vtex-search"], [data-testid*="product"]').slice(0, 5).each((i, el) => {
            const title = $(el).find('[class*="productName"], [class*="title"], [class*="name"], h3, h2').first().text().trim();
            const link = $(el).find('a[href*="/producto/"], a[href*="/p"]').first().attr('href') || $(el).find('a').first().attr('href');
            const priceText = $(el).find('[class*="sellingPrice"], [class*="price"], [class*="Price"]').first().text().replace(/[^0-9.]/g, '');
            const img = $(el).find('img').first().attr('src') || $(el).find('img').first().attr('data-src');

            if (title && title.length > 3 && link) {
                results.push({
                    title,
                    price: priceText ? parseFloat(priceText) : null,
                    url: link.startsWith('http') ? link : `https://www.sams.com.mx${link}`,
                    source: "Sam's Club MX",
                    image: img || ''
                });
            }
        });

        // Fallback: JSON-LD
        if (results.length === 0) {
            $('script[type="application/ld+json"]').each((i, el) => {
                try {
                    const json = JSON.parse($(el).html());
                    const items = json['@type'] === 'ItemList' ? (json.itemListElement || [])
                        : json['@type'] === 'Product' ? [json] : [];
                    items.slice(0, 5).forEach(item => {
                        const product = item.item || item;
                        if (product.name && product.offers) {
                            const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;
                            results.push({
                                title: product.name,
                                price: parseFloat(offer?.price) || null,
                                url: product.url || url,
                                source: "Sam's Club MX",
                                image: typeof product.image === 'string' ? product.image : ''
                            });
                        }
                    });
                } catch (e) { /* skip */ }
            });
        }

        console.log(`[Direct Scraper] Sam's Club MX encontró: ${results.length} resultados.`);
        return results;
    } catch (error) {
        console.error('[Direct Scraper] Error en Sam\'s Club MX:', error.message);
        return [];
    }
};

/**
 * Scraper para Home Depot México (gratis, sin Serper)
 */
exports.scrapeHomeDepotMX = async (query, signal) => {
    try {
        throwIfAborted(signal);
        console.log(`[Direct Scraper] Buscando en Home Depot MX: ${query}`);
        const url = `https://www.homedepot.com.mx/busqueda/${encodeURIComponent(query)}`;
        const response = await scrapeWithRetry(url, 2, 'MX', signal);
        const $ = cheerio.load(response.data);

        const results = [];

        $('[class*="product"], .product-card, [class*="ProductCard"]').slice(0, 5).each((i, el) => {
            const title = $(el).find('[class*="title"], [class*="name"], h3, h2').first().text().trim();
            const link = $(el).find('a[href*="/producto/"], a[href*="/p/"]').first().attr('href') || $(el).find('a').first().attr('href');
            const priceText = $(el).find('[class*="price"], [class*="Price"]').first().text().replace(/[^0-9.]/g, '');
            const img = $(el).find('img').first().attr('src') || $(el).find('img').first().attr('data-src');

            if (title && title.length > 3 && link) {
                results.push({
                    title,
                    price: priceText ? parseFloat(priceText) : null,
                    url: link.startsWith('http') ? link : `https://www.homedepot.com.mx${link}`,
                    source: 'Home Depot MX',
                    image: img || ''
                });
            }
        });

        console.log(`[Direct Scraper] Home Depot MX encontró: ${results.length} resultados.`);
        return results;
    } catch (error) {
        console.error('[Direct Scraper] Error en Home Depot MX:', error.message);
        return [];
    }
};

/**
 * Scraper para Office Depot México (gratis, sin Serper)
 */
exports.scrapeOfficeDepotMX = async (query, signal) => {
    try {
        throwIfAborted(signal);
        console.log(`[Direct Scraper] Buscando en Office Depot MX: ${query}`);
        const url = `https://www.officedepot.com.mx/officedepot/en/search/?text=${encodeURIComponent(query)}`;
        const response = await scrapeWithRetry(url, 2, 'MX', signal);
        const $ = cheerio.load(response.data);

        const results = [];

        $('[class*="product"], .product-item, [class*="ProductCard"]').slice(0, 5).each((i, el) => {
            const title = $(el).find('[class*="title"], [class*="name"], h3, h2, .product-name').first().text().trim();
            const link = $(el).find('a[href*="/p/"], a[href*="/producto"]').first().attr('href') || $(el).find('a').first().attr('href');
            const priceText = $(el).find('[class*="price"], [class*="Price"]').first().text().replace(/[^0-9.]/g, '');
            const img = $(el).find('img').first().attr('src') || $(el).find('img').first().attr('data-src');

            if (title && title.length > 3 && link) {
                results.push({
                    title,
                    price: priceText ? parseFloat(priceText) : null,
                    url: link.startsWith('http') ? link : `https://www.officedepot.com.mx${link}`,
                    source: 'Office Depot MX',
                    image: img || ''
                });
            }
        });

        console.log(`[Direct Scraper] Office Depot MX encontró: ${results.length} resultados.`);
        return results;
    } catch (error) {
        console.error('[Direct Scraper] Error en Office Depot MX:', error.message);
        return [];
    }
};

/**
 * Scraper para Soriana México (supermercado/electrónica)
 */
exports.scrapeSorianaMX = async (query, signal) => {
    try {
        throwIfAborted(signal);
        console.log(`[Direct Scraper] Buscando en Soriana MX: ${query}`);
        const url = `https://www.soriana.com/buscar?q=${encodeURIComponent(query)}`;
        const response = await scrapeWithRetry(url, 2, 'MX', signal);
        const $ = cheerio.load(response.data);

        const results = [];

        // JSON-LD structured data
        $('script[type="application/ld+json"]').each((i, el) => {
            try {
                const json = JSON.parse($(el).html());
                const items = json['@type'] === 'ItemList' ? (json.itemListElement || [])
                    : json['@type'] === 'Product' ? [json] : [];
                items.slice(0, 5).forEach(item => {
                    const product = item.item || item;
                    if (product.name && product.offers) {
                        const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;
                        results.push({
                            title: product.name,
                            price: parseFloat(offer?.price) || null,
                            url: product.url || url,
                            source: 'Soriana',
                            image: typeof product.image === 'string' ? product.image : (product.image?.[0] || '')
                        });
                    }
                });
            } catch (e) { /* skip */ }
        });

        // Fallback: HTML product cards
        if (results.length === 0) {
            $('[class*="product-card"], [class*="ProductCard"], [class*="product-tile"], .product-item').slice(0, 5).each((i, el) => {
                const title = $(el).find('[class*="title"], [class*="name"], h3, h2').first().text().trim();
                const link = $(el).find('a[href*="/producto"], a[href*="/p/"]').first().attr('href') || $(el).find('a').first().attr('href');
                const priceText = $(el).find('[class*="price"], [class*="Price"]').first().text().replace(/[^0-9.]/g, '');
                const img = $(el).find('img').first().attr('src') || $(el).find('img').first().attr('data-src');

                if (title && title.length > 3 && link) {
                    results.push({
                        title,
                        price: priceText ? parseFloat(priceText) : null,
                        url: link.startsWith('http') ? link : `https://www.soriana.com${link}`,
                        source: 'Soriana',
                        image: img || ''
                    });
                }
            });
        }

        console.log(`[Direct Scraper] Soriana MX encontró: ${results.length} resultados.`);
        return results;
    } catch (error) {
        console.error('[Direct Scraper] Error en Soriana MX:', error.message);
        return [];
    }
};

/**
 * Scraper para Sears México
 */
exports.scrapeSearsMX = async (query, signal) => {
    try {
        throwIfAborted(signal);
        console.log(`[Direct Scraper] Buscando en Sears MX: ${query}`);
        const url = `https://www.sears.com.mx/buscar/${encodeURIComponent(query)}`;
        const response = await scrapeWithRetry(url, 2, 'MX', signal);
        const $ = cheerio.load(response.data);

        const results = [];

        // JSON-LD structured data
        $('script[type="application/ld+json"]').each((i, el) => {
            try {
                const json = JSON.parse($(el).html());
                const items = json['@type'] === 'ItemList' ? (json.itemListElement || [])
                    : json['@type'] === 'Product' ? [json] : [];
                items.slice(0, 5).forEach(item => {
                    const product = item.item || item;
                    if (product.name && product.offers) {
                        const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;
                        results.push({
                            title: product.name,
                            price: parseFloat(offer?.price) || null,
                            url: product.url || url,
                            source: 'Sears MX',
                            image: typeof product.image === 'string' ? product.image : (product.image?.[0] || '')
                        });
                    }
                });
            } catch (e) { /* skip */ }
        });

        // Fallback: HTML product cards
        if (results.length === 0) {
            $('[class*="product-card"], [class*="ProductCard"], [class*="product-item"]').slice(0, 5).each((i, el) => {
                const title = $(el).find('[class*="title"], [class*="name"], h3, h2').first().text().trim();
                const link = $(el).find('a[href*="/producto"], a[href*="/p/"]').first().attr('href') || $(el).find('a').first().attr('href');
                const priceText = $(el).find('[class*="price"], [class*="Price"]').first().text().replace(/[^0-9.]/g, '');
                const img = $(el).find('img').first().attr('src') || $(el).find('img').first().attr('data-src');

                if (title && title.length > 3 && link) {
                    results.push({
                        title,
                        price: priceText ? parseFloat(priceText) : null,
                        url: link.startsWith('http') ? link : `https://www.sears.com.mx${link}`,
                        source: 'Sears MX',
                        image: img || ''
                    });
                }
            });
        }

        console.log(`[Direct Scraper] Sears MX encontró: ${results.length} resultados.`);
        return results;
    } catch (error) {
        console.error('[Direct Scraper] Error en Sears MX:', error.message);
        return [];
    }
};

/**
 * Scraper para Shein México (moda barata)
 */
exports.scrapeSheinMX = async (query, signal) => {
    try {
        throwIfAborted(signal);
        console.log(`[Direct Scraper] Buscando en Shein MX: ${query}`);
        const url = `https://mx.shein.com/pdsearch/${encodeURIComponent(query)}/`;
        const config = getAxiosConfigWithSignal('MX', signal);
        config.headers['Accept-Language'] = 'es-MX,es;q=0.9';
        config.timeout = 8000;
        
        const response = await axios.get(url, config);
        const $ = cheerio.load(response.data);

        const results = [];

        // Try to find products from inline JSON data
        const scriptContent = $('script').toArray()
            .map(s => $(s).html())
            .find(s => s && (s.includes('productList') || s.includes('goods_id')));
        
        if (scriptContent) {
            const priceMatches = [...scriptContent.matchAll(/"(?:retail|sale|display)?[Pp]rice"\s*:\s*"?([\d.]+)"?/g)];
            const titleMatches = [...scriptContent.matchAll(/"(?:goods_name|productName|title)"\s*:\s*"([^"]{5,200})"/g)];
            const urlMatches = [...scriptContent.matchAll(/"(?:goods_url_name|productRelationID)"\s*:\s*"([^"]+)"/g)];

            for (let i = 0; i < Math.min(titleMatches.length, 5); i++) {
                results.push({
                    title: titleMatches[i]?.[1] || 'Producto Shein',
                    price: priceMatches[i] ? parseFloat(priceMatches[i][1]) : null,
                    url: urlMatches[i] ? `https://mx.shein.com/${urlMatches[i][1]}` : url,
                    source: 'Shein MX',
                    image: ''
                });
            }
        }

        // Fallback: HTML product cards
        if (results.length === 0) {
            $('[class*="product-card"], [class*="S-product-item"], .product-list__item').slice(0, 5).each((i, el) => {
                const title = $(el).find('[class*="title"], [class*="name"], [class*="goods-title"]').first().text().trim();
                const link = $(el).find('a').first().attr('href');
                const priceText = $(el).find('[class*="price"], [class*="Price"]').first().text().replace(/[^0-9.]/g, '');
                const img = $(el).find('img').first().attr('src') || $(el).find('img').first().attr('data-src');

                if (title && title.length > 3 && link) {
                    results.push({
                        title: title.slice(0, 200),
                        price: priceText ? parseFloat(priceText) : null,
                        url: link.startsWith('http') ? link : `https://mx.shein.com${link}`,
                        source: 'Shein MX',
                        image: img ? (img.startsWith('//') ? `https:${img}` : img) : ''
                    });
                }
            });
        }

        console.log(`[Direct Scraper] Shein MX encontró: ${results.length} resultados.`);
        return results;
    } catch (error) {
        console.error('[Direct Scraper] Error en Shein MX:', error.message);
        return [];
    }
};

/**
 * Scraper para Temu México (marketplace barato)
 */
exports.scrapeTemuMX = async (query, signal) => {
    try {
        throwIfAborted(signal);
        console.log(`[Direct Scraper] Buscando en Temu MX: ${query}`);
        const url = `https://www.temu.com/mx/search_result.html?search_key=${encodeURIComponent(query)}`;
        const config = getAxiosConfigWithSignal('MX', signal);
        config.headers['Accept-Language'] = 'es-MX,es;q=0.9';
        config.timeout = 8000;
        
        const response = await axios.get(url, config);
        const $ = cheerio.load(response.data);

        const results = [];

        // Try inline JSON data
        const scriptContent = $('script').toArray()
            .map(s => $(s).html())
            .find(s => s && (s.includes('goodsList') || s.includes('goods_id') || s.includes('itemList')));
        
        if (scriptContent) {
            const priceMatches = [...scriptContent.matchAll(/"(?:price|salePrice|displayPrice)"\s*:\s*"?([\d.]+)"?/g)];
            const titleMatches = [...scriptContent.matchAll(/"(?:goods_name|title|productTitle)"\s*:\s*"([^"]{5,200})"/g)];

            for (let i = 0; i < Math.min(titleMatches.length, 5); i++) {
                results.push({
                    title: titleMatches[i]?.[1] || 'Producto Temu',
                    price: priceMatches[i] ? parseFloat(priceMatches[i][1]) : null,
                    url: url,
                    source: 'Temu MX',
                    image: ''
                });
            }
        }

        // Fallback: HTML product cards
        if (results.length === 0) {
            $('[class*="product-card"], [class*="ProductCard"], [class*="goods-card"]').slice(0, 5).each((i, el) => {
                const title = $(el).find('[class*="title"], [class*="name"]').first().text().trim();
                const link = $(el).find('a').first().attr('href');
                const priceText = $(el).find('[class*="price"], [class*="Price"]').first().text().replace(/[^0-9.]/g, '');
                const img = $(el).find('img').first().attr('src') || $(el).find('img').first().attr('data-src');

                if (title && title.length > 3) {
                    results.push({
                        title: title.slice(0, 200),
                        price: priceText ? parseFloat(priceText) : null,
                        url: link ? (link.startsWith('http') ? link : `https://www.temu.com${link}`) : url,
                        source: 'Temu MX',
                        image: img ? (img.startsWith('//') ? `https:${img}` : img) : ''
                    });
                }
            });
        }

        console.log(`[Direct Scraper] Temu MX encontró: ${results.length} resultados.`);
        return results;
    } catch (error) {
        console.error('[Direct Scraper] Error en Temu MX:', error.message);
        return [];
    }
};

/**
 * Scraper para Bodega Aurrera México
 */
exports.scrapeBodegaAurreraMX = async (query, signal) => {
    try {
        throwIfAborted(signal);
        console.log(`[Direct Scraper] Buscando en Bodega Aurrera: ${query}`);
        const url = `https://www.bodegaaurrera.com.mx/productos?Ntt=${encodeURIComponent(query)}`;
        const response = await scrapeWithRetry(url, 2, 'MX', signal);
        const $ = cheerio.load(response.data);

        const results = [];
        $('[data-testid="product-card"], .product-card, [class*="ProductCard"], [class*="product-item"]').slice(0, 5).each((i, el) => {
            const title = $(el).find('[class*="title"], h3, h4, [data-testid="product-title"], [class*="description"]').first().text().trim();
            const link = $(el).find('a[href*="/ip/"], a[href*="/productos/"]').first().attr('href');
            const priceText = $(el).find('[class*="price"], [data-testid="product-price"]').first().text().replace(/[^0-9.]/g, '');
            const img = $(el).find('img').first().attr('src') || $(el).find('img').first().attr('data-src');

            if (title && priceText && link) {
                results.push({
                    title: title.slice(0, 200),
                    price: parseFloat(priceText),
                    url: link.startsWith('http') ? link : `https://www.bodegaaurrera.com.mx${link}`,
                    source: 'Bodega Aurrera MX',
                    image: img || ''
                });
            }
        });

        // Fallback: try JSON-LD structured data
        if (results.length === 0) {
            $('script[type="application/ld+json"]').each((i, el) => {
                try {
                    const json = JSON.parse($(el).html());
                    const items = json.itemListElement || (json['@type'] === 'Product' ? [json] : []);
                    items.slice(0, 5).forEach(item => {
                        const product = item.item || item;
                        if (product.name && product.offers) {
                            const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;
                            results.push({
                                title: product.name.slice(0, 200),
                                price: parseFloat(offer.price) || null,
                                url: product.url || url,
                                source: 'Bodega Aurrera MX',
                                image: product.image || ''
                            });
                        }
                    });
                } catch (e) { }
            });
        }

        console.log(`[Direct Scraper] Bodega Aurrera encontró: ${results.length} resultados.`);
        return results;
    } catch (error) {
        console.error('[Direct Scraper] Error en Bodega Aurrera:', error.message);
        return [];
    }
};

/**
 * Scraper para Linio México
 */
exports.scrapeLinioMX = async (query, signal) => {
    try {
        throwIfAborted(signal);
        console.log(`[Direct Scraper] Buscando en Linio MX: ${query}`);
        const url = `https://www.linio.com.mx/search?scroll=&q=${encodeURIComponent(query)}`;
        const response = await scrapeWithRetry(url, 2, 'MX', signal);
        const $ = cheerio.load(response.data);

        const results = [];
        $('.catalogue-product, [class*="ProductCard"], .product-card, [data-product-id]').slice(0, 5).each((i, el) => {
            const title = $(el).find('.product-title, .product-name, [class*="title"], h2, h3').first().text().trim();
            const link = $(el).find('a').first().attr('href');
            const priceText = $(el).find('.price-main, .product-price, [class*="price"]').first().text().replace(/[^0-9.]/g, '');
            const img = $(el).find('img').first().attr('src') || $(el).find('img').first().attr('data-src');

            if (title && title.length > 3 && link) {
                results.push({
                    title: title.slice(0, 200),
                    price: priceText ? parseFloat(priceText) : null,
                    url: link.startsWith('http') ? link : `https://www.linio.com.mx${link}`,
                    source: 'Linio MX',
                    image: img ? (img.startsWith('//') ? `https:${img}` : img) : ''
                });
            }
        });

        // Fallback: JSON-LD
        if (results.length === 0) {
            $('script[type="application/ld+json"]').each((i, el) => {
                try {
                    const json = JSON.parse($(el).html());
                    const items = json.itemListElement || (json['@type'] === 'Product' ? [json] : []);
                    items.slice(0, 5).forEach(item => {
                        const product = item.item || item;
                        if (product.name && product.offers) {
                            const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;
                            results.push({
                                title: product.name.slice(0, 200),
                                price: parseFloat(offer.price) || null,
                                url: product.url || url,
                                source: 'Linio MX',
                                image: product.image || ''
                            });
                        }
                    });
                } catch (e) { }
            });
        }

        console.log(`[Direct Scraper] Linio MX encontró: ${results.length} resultados.`);
        return results;
    } catch (error) {
        console.error('[Direct Scraper] Error en Linio MX:', error.message);
        return [];
    }
};

/**
 * Scraper para Claro Shop México
 */
exports.scrapeClaroShopMX = async (query, signal) => {
    try {
        throwIfAborted(signal);
        console.log(`[Direct Scraper] Buscando en Claro Shop: ${query}`);
        const url = `https://www.claroshop.com/buscar/${encodeURIComponent(query)}`;
        const response = await scrapeWithRetry(url, 2, 'MX', signal);
        const $ = cheerio.load(response.data);

        const results = [];
        $('[class*="product-card"], [class*="ProductCard"], .product-item, [class*="card-product"]').slice(0, 5).each((i, el) => {
            const title = $(el).find('[class*="title"], [class*="name"], h3, h4, .product-name').first().text().trim();
            const link = $(el).find('a').first().attr('href');
            const priceText = $(el).find('[class*="price"], [class*="Price"]').first().text().replace(/[^0-9.]/g, '');
            const img = $(el).find('img').first().attr('src') || $(el).find('img').first().attr('data-src');

            if (title && title.length > 3 && link) {
                results.push({
                    title: title.slice(0, 200),
                    price: priceText ? parseFloat(priceText) : null,
                    url: link.startsWith('http') ? link : `https://www.claroshop.com${link}`,
                    source: 'Claro Shop MX',
                    image: img ? (img.startsWith('//') ? `https:${img}` : img) : ''
                });
            }
        });

        // Fallback: embedded JSON data in script tags
        if (results.length === 0) {
            const scripts = $('script').toArray().map(s => $(s).html()).filter(Boolean);
            for (const script of scripts) {
                try {
                    const jsonMatch = script.match(/"products"\s*:\s*(\[[\s\S]*?\])/);
                    if (jsonMatch) {
                        const products = JSON.parse(jsonMatch[1]);
                        products.slice(0, 5).forEach(p => {
                            if (p.name || p.title) {
                                results.push({
                                    title: (p.name || p.title).slice(0, 200),
                                    price: parseFloat(p.price || p.salePrice) || null,
                                    url: p.url ? (p.url.startsWith('http') ? p.url : `https://www.claroshop.com${p.url}`) : url,
                                    source: 'Claro Shop MX',
                                    image: p.image || p.imageUrl || ''
                                });
                            }
                        });
                    }
                } catch (e) { }
            }
        }

        console.log(`[Direct Scraper] Claro Shop encontró: ${results.length} resultados.`);
        return results;
    } catch (error) {
        console.error('[Direct Scraper] Error en Claro Shop:', error.message);
        return [];
    }
};
