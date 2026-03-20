const axios = require('axios');
const directScraper = require('./directScraper');
const monitor = require('./scraperMonitor');
const localPriceExtractor = require('./localPriceExtractor');
const regionConfigService = require('./regionConfigService');

// Timeout por defecto para Serper API
const SERPER_TIMEOUT = 6000;
const SERPER_MAX_RETRIES = 1;
const LOCAL_FAST_TIMEOUT = 4000;

function extractSnippetPrice(text) {
    const source = String(text || '');
    const lowered = source.toLowerCase();
    if (!source) return null;
    if (/meses|msi|mensual|mensualidades|quincena|quincenal|semanales|semana|por mes/.test(lowered)) {
        return null;
    }
    const match = source.match(/(?:\$|s\/\.?|s\/)\s*([\d.,]+)/i);
    if (!match) return null;
    let numeric = match[1].trim();
    const hasDot = numeric.includes('.');
    const hasComma = numeric.includes(',');

    if (hasDot && hasComma) {
        const lastDot = numeric.lastIndexOf('.');
        const lastComma = numeric.lastIndexOf(',');
        if (lastDot > lastComma) {
            numeric = numeric.replace(/,/g, '');
        } else {
            numeric = numeric.replace(/\./g, '').replace(',', '.');
        }
    } else if (hasDot) {
        const parts = numeric.split('.');
        const looksLikeThousands = parts.length > 1 && parts.slice(1).every(part => part.length === 3);
        numeric = looksLikeThousands ? numeric.replace(/\./g, '') : numeric;
    } else if (hasComma) {
        const parts = numeric.split(',');
        const looksLikeThousands = parts.length > 1 && parts.slice(1).every(part => part.length === 3);
        numeric = looksLikeThousands ? numeric.replace(/,/g, '') : numeric.replace(',', '.');
    }

    const parsed = parseFloat(numeric);
    return Number.isFinite(parsed) ? parsed : null;
}

function extractAllSnippetPrices(text) {
    const source = String(text || '');
    if (!source) return [];
    const matches = [...source.matchAll(/(?:\$|mxn|usd|s\/\.?|s\/)\s*([\d.,]+)/ig)];
    const parsed = matches
        .map(match => extractSnippetPrice(match[0]))
        .filter(value => Number.isFinite(value) && value > 0);
    return [...new Set(parsed.map(value => Number(value.toFixed(2))))];
}

function resolvePriceMetadata({ primaryPrice = null, text = '', sourceType = 'unknown', isRedirect = false, isDirectProductPage = false }) {
    const snippetPrices = extractAllSnippetPrices(text);
    const hasInstallmentLanguage = /meses|msi|mensual|mensualidades|quincena|quincenal|semanales|semana|por mes|desde\s+\$|pagos de|pay as low as|monthly/i.test(String(text || ''));
    const hasSaleLanguage = /ahora|rebaja|descuento|oferta|sale|promo|promoci[oó]n|precio final|antes|hot sale|buen fin|liquidaci[oó]n/i.test(String(text || ''));
    const sortedSnippetPrices = [...snippetPrices].sort((a, b) => a - b);
    const lowestSnippetPrice = sortedSnippetPrices[0] || null;
    const highestSnippetPrice = sortedSnippetPrices[sortedSnippetPrices.length - 1] || null;

    let price = Number.isFinite(primaryPrice) && primaryPrice > 0 ? primaryPrice : null;
    let priceSource = price != null ? sourceType : 'missing';
    let priceConfidence = sourceType === 'shopping_api'
        ? (isRedirect ? 0.82 : 0.94)
        : sourceType === 'official_web'
            ? 0.72
            : sourceType === 'web_snippet'
                ? 0.46
                : sourceType === 'broad_web'
                    ? 0.38
                    : sourceType === 'local_extractor'
                        ? 0.64
                        : sourceType === 'direct_scraper'
                            ? 0.9
                            : 0.55;

    const observedPrices = [];
    if (Number.isFinite(primaryPrice) && primaryPrice > 0) observedPrices.push(Number(primaryPrice.toFixed(2)));
    observedPrices.push(...sortedSnippetPrices.filter(value => !observedPrices.includes(value)));

    if (!price && !hasInstallmentLanguage && lowestSnippetPrice) {
        price = lowestSnippetPrice;
        priceSource = `${sourceType}_snippet`;
        priceConfidence = Math.min(priceConfidence, sourceType === 'official_web' ? 0.62 : 0.44);
    }

    if (price && lowestSnippetPrice && !hasInstallmentLanguage && hasSaleLanguage) {
        const gapRatio = Math.abs(price - lowestSnippetPrice) / Math.max(price, lowestSnippetPrice);
        if (lowestSnippetPrice < price && gapRatio >= 0.08) {
            price = lowestSnippetPrice;
            priceSource = `${sourceType}_discounted`;
            priceConfidence = Math.max(Math.min(priceConfidence, 0.72), sourceType === 'shopping_api' ? 0.68 : 0.5);
        }
    }

    const priceSpreadRatio = price && highestSnippetPrice && lowestSnippetPrice
        ? ((highestSnippetPrice - lowestSnippetPrice) / Math.max(highestSnippetPrice, 1))
        : 0;
    const priceNeedsVerification = Boolean(
        hasInstallmentLanguage ||
        priceSpreadRatio >= 0.18 ||
        (!isDirectProductPage && sourceType !== 'shopping_api' && sourceType !== 'direct_scraper')
    );

    if (priceNeedsVerification) {
        priceConfidence = Math.max(0.22, priceConfidence - (hasInstallmentLanguage ? 0.18 : 0.1) - (priceSpreadRatio >= 0.18 ? 0.08 : 0));
    }

    return {
        price,
        priceSource,
        priceConfidence: Number(Math.max(0, Math.min(0.99, priceConfidence)).toFixed(2)),
        observedPrices: observedPrices.slice(0, 4),
        priceNeedsVerification,
        hasSaleLanguage,
        hasInstallmentLanguage
    };
}

function applyResultMetadata(item = {}) {
    if (!item || typeof item !== 'object') return item;
    if (item.resultSource && item.priceSource && item.priceConfidence != null) return item;
    const inferredSource = item.isLocalStore
        ? 'places'
        : item.isDirectProductPage
            ? 'direct_web'
            : 'direct_scraper';
    const numericPrice = Number(item.price);
    const metadata = resolvePriceMetadata({
        primaryPrice: Number.isFinite(numericPrice) && numericPrice > 0 ? numericPrice : null,
        text: `${item.title || ''} ${item.snippet || ''}`,
        sourceType: item.isLocalStore ? 'local_extractor' : 'direct_scraper',
        isRedirect: Boolean(item.isGoogleRedirect || item.hasEphemeralRedirect),
        isDirectProductPage: Boolean(item.isDirectProductPage)
    });
    return {
        ...item,
        price: metadata.price,
        priceSource: metadata.priceSource,
        priceConfidence: metadata.priceConfidence,
        observedPrices: metadata.observedPrices,
        priceNeedsVerification: metadata.priceNeedsVerification,
        hasInstallmentLanguage: metadata.hasInstallmentLanguage,
        resultSource: inferredSource
    };
}

function normalizeIncomingImage(value = '') {
    const image = String(value || '').trim();
    if (!image) return '';
    if (/^(null|undefined|about:blank)$/i.test(image)) return '';
    if (/placeholder|no[\s_-]?image/i.test(image)) return '';
    // Allow product images that happen to contain store domains. Only block if "logo" is strictly in the name coupled with a store name.
    if (/logo.*(mercadolibre|costco|walmart|amazon|coppel|liverpool|sams|best[\s_-]?buy|elektra|target)/i.test(image) || /default-?image/i.test(image)) return '';
    if (/^https?:\/\//i.test(image) || image.startsWith('data:image/') || image.startsWith('/')) {
        return image;
    }
    return '';
}

// Helper para retry con backoff
async function fetchWithRetry(config, retries = SERPER_MAX_RETRIES) {
    let lastError;
    for (let i = 0; i <= retries; i++) {
        try {
            return await axios(config);
        } catch (err) {
            lastError = err;
            const isTimeout = err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT';
            const is5xx = err.response?.status >= 500;
            const is429 = err.response?.status === 429;
            
            if ((isTimeout || is5xx || is429) && i < retries) {
                const delay = Math.pow(2, i) * 1000 + Math.random() * 500;
                console.warn(`[Serper Retry] Intento ${i + 1}/${retries + 1} falló, reintentando en ${Math.round(delay)}ms...`);
                await new Promise(r => setTimeout(r, delay));
            } else {
                throw err;
            }
        }
    }
    throw lastError;
}

function getStorePriorityForCategory(category = '', countryCode = 'MX') {
    const normalizedCategory = String(category || '').toLowerCase();
    const normalizedCountry = String(countryCode || 'MX').toUpperCase();
    const priorityMaps = {
        MX: {
            smartphone: ['amazon', 'mercado libre', 'liverpool', 'walmart', 'coppel'],
            laptop: ['amazon', 'liverpool', 'costco', 'walmart', 'best buy'],
            gaming: ['amazon', 'mercado libre', 'best buy', 'walmart', 'costco'],
            audio: ['amazon', 'mercado libre', 'liverpool', 'walmart'],
            home: ['walmart', 'amazon', 'home depot', 'liverpool', 'bodega aurrera'],
            fashion: ['mercado libre', 'shein', 'liverpool', 'coppel'],
            appliance: ['walmart', 'liverpool', 'coppel', 'elektra', 'amazon']
        },
        CL: {
            smartphone: ['falabella', 'ripley', 'paris', 'pc factory', 'mercado libre'],
            laptop: ['pc factory', 'falabella', 'ripley', 'paris', 'solotodo'],
            gaming: ['microplay', 'sp digital', 'falabella', 'ripley'],
            home: ['falabella', 'lider', 'easy', 'sodimac'],
            appliance: ['falabella', 'lider', 'ripley', 'paris']
        },
        US: {
            smartphone: ['amazon', 'walmart', 'best buy', 'target'],
            laptop: ['amazon', 'best buy', 'walmart', 'costco', 'newegg'],
            gaming: ['amazon', 'best buy', 'walmart', 'target'],
            audio: ['amazon', 'best buy', 'target'],
            home: ['walmart', 'amazon', 'home depot', 'costco'],
            appliance: ['best buy', 'walmart', 'amazon', 'costco']
        }
    };

    return priorityMaps[normalizedCountry]?.[normalizedCategory] || [];
}

function looksLikeProductPage(url = '', countryCode = 'MX') {
    const normalizedUrl = String(url || '').toLowerCase();
    const cc = String(countryCode || 'MX').toUpperCase();
    if (!normalizedUrl) return false;

    const genericCategoryPatterns = [
        /\/browse\//,
        /\/search\?/,
        /\/search\//,
        /\/categoria\//,
        /\/categorias\//,
        /\/ofertas/,
        /\/collections?\//,
        /\/department\//,
        /\/shop\//,
        /\/s\?/,
        /[?&](ntt|searchterms|k|q|query)=/i
    ];
    if (genericCategoryPatterns.some(pattern => pattern.test(normalizedUrl))) {
        return false;
    }

    if (/amazon\./.test(normalizedUrl)) return /\/dp\/[a-z0-9]{10}|\/gp\/product\/[a-z0-9]{10}/i.test(normalizedUrl);
    if (/bestbuy\./.test(normalizedUrl)) return /\/site\/.+\/\d+\.p/i.test(normalizedUrl);
    if (/walmart\./.test(normalizedUrl)) return /\/ip\/|\/producto\//i.test(normalizedUrl);
    if (/target\./.test(normalizedUrl)) return /\/p\//i.test(normalizedUrl);
    if (/ebay\./.test(normalizedUrl)) return /\/itm\//i.test(normalizedUrl);
    if (/newegg\./.test(normalizedUrl)) return /\/p\/|\/product\//i.test(normalizedUrl);
    if (/mercadolibre\./.test(normalizedUrl)) return /\/ml[macop]-\d+/i.test(normalizedUrl);
    if (/liverpool\./.test(normalizedUrl)) return /\/pdp\//i.test(normalizedUrl);
    if (/coppel\./.test(normalizedUrl)) return /\/producto\//i.test(normalizedUrl);
    if (/cyberpuerta\./.test(normalizedUrl)) return /\/producto\//i.test(normalizedUrl);
    if (/ddtech\./.test(normalizedUrl)) return /\/producto\//i.test(normalizedUrl);
    if (/elektra\./.test(normalizedUrl)) return /\/[^/]+\/p/i.test(normalizedUrl) || /\/producto\//i.test(normalizedUrl);
    if (/costco\./.test(normalizedUrl)) return /\/[^/]+\.html/i.test(normalizedUrl) || /\/CatalogSearch/i.test(normalizedUrl) === false;
    if (/nintendo\.com|playstation\.com|sony\.com|apple\.com|samsung\.com/.test(normalizedUrl)) return /\/products?\//i.test(normalizedUrl);
    if (/shopify|myshopify|tiendanube|vtexassets|woocommerce|wixsite|square\.site/.test(normalizedUrl)) return /\/products?\/|\/product\/|\/p\//i.test(normalizedUrl);

    return cc === 'US'
        ? /\/p\/|\/product\/|\/products\/|\/dp\/|\/site\/|\/ip\//i.test(normalizedUrl)
        : /\/p\/|\/producto\/|\/product\/|\/products\/|\/dp\/|\/ip\//i.test(normalizedUrl);
}

function isKnownStoreUrl(url = '', countryCode = 'MX') {
    const resolved = regionConfigService.resolveStoreName(url, countryCode);
    const domain = String((url.match(/https?:\/\/(?:www\.)?([^/]+)/i) || [])[1] || '').trim().toLowerCase();
    return Boolean(resolved && resolved !== domain && resolved.length > 1);
}

function shouldRunPlacesQuery(query = '', intentType = '') {
    const normalized = String(query || '').toLowerCase().trim();
    if (!normalized) return false;
    if (intentType === 'servicio_local') return true;
    return /\b(cerca de mi|cerca|near me|nearby|pickup|pick up|recoger hoy|recoger en tienda|tienda f[ií]sica|in store|in-store|localmente|disponible en tienda|same day pickup)\b/i.test(normalized);
}

// Helper para limitar concurrencia
async function runWithConcurrencyLimit(promiseFns, limit, abortSignal) {
    const results = [];
    const executing = new Set();
    
    for (const [index, promiseFn] of promiseFns.entries()) {
        if (abortSignal?.aborted) {
            break;
        }
        const p = Promise.resolve().then(() => promiseFn()).then(result => ({ status: 'fulfilled', value: result, index })).catch(err => ({ status: 'rejected', reason: err, index }));
        results.push(p);
        
        if (promiseFns.length >= limit) {
            const tracked = p.then(() => executing.delete(tracked));
            executing.add(tracked);
            if (executing.size >= limit) {
                await Promise.race(executing);
            }
        }
    }
    
    return Promise.all(results);
}

exports.searchGoogleShopping = async (query, radius, lat, lng, intentType, abortSignal, conditionMode = 'all', countryCode = 'MX', alternativeQueries = [], productCategory = '', preferredStoreKeys = [], brandOfficialQuery = null, searchOptions = {}) => {
    const regionCfg = regionConfigService.getRegionConfig(countryCode);
    const isLocalFastMode = process.env.NODE_ENV !== 'production' && process.env.FORCE_FULL_SEARCH !== 'true';
    const serperTimeout = isLocalFastMode ? LOCAL_FAST_TIMEOUT : SERPER_TIMEOUT;
    const serperRetries = isLocalFastMode ? 0 : SERPER_MAX_RETRIES;
    console.log(`[ShoppingService] Region: ${regionCfg.countryCode} (gl=${regionCfg.gl}, hl=${regionCfg.hl}, currency=${regionCfg.currency})`);
    const apiKey = process.env.SERPER_API_KEY;
    let serperResults = [];
    let isService = intentType === 'servicio_local';
    const searchConditionMode = conditionMode || 'all';
    const shoppingQuery = String(query || '').trim();
    const webQuery = String(searchOptions.webQuery || query || '').trim();
    const isBroadExploration = Boolean(searchOptions?.broadProfile?.broad);
    const shouldRunDirectScrapers = !isService
        && intentType !== 'mayoreo_perecedero'
        && (!isLocalFastMode || isBroadExploration || ['smartphone', 'laptop', 'audio', 'tv', 'fashion', 'home', 'appliance'].includes(String(productCategory || '').toLowerCase()));

    // 1. Resolver búsqueda según la intención de la IA
    if (intentType === 'mayoreo_perecedero') {
        const supermarketScraper = require('./supermarketScraper');
        serperResults = await supermarketScraper.searchSupermarkets(query);
    } else if (isService) {
        // O.1: Para servicios locales (plomero, dentista), saltamos Google Shopping de Productos
        if (apiKey) {
            try {
                const localPayload = { q: query, gl: regionCfg.gl, hl: regionCfg.hl };
                if (lat && lng && radius !== 'global' && radius !== '999999') {
                    localPayload.ll = `@${lat},${lng},14z`;
                }
                const localConfig = {
                    method: 'post',
                    url: 'https://google.serper.dev/places',
                    headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
                    data: JSON.stringify(localPayload),
                    timeout: SERPER_TIMEOUT,
                    signal: abortSignal
                };
                const localRes = await axios(localConfig);
                const places = localRes.data.places || [];

                serperResults = places.map(p => {
                    const mapsUrl = p.cid
                        ? `https://www.google.com/maps?cid=${p.cid}`
                        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.address || p.title)}`;
                    const ratingStr = p.rating ? `⭐ ${p.rating}` : '';
                    const phoneStr = p.phoneNumber ? ` · 📞 ${p.phoneNumber}` : '';
                    return {
                        title: p.title || 'Servicio Local',
                        price: null,
                        isLocalStore: true,
                        localDetails: { address: p.address || '', rating: p.rating || null, phone: p.phoneNumber || null },
                        url: mapsUrl,
                        source: `📍 Profesional Local · ${ratingStr}${phoneStr}`,
                        image: 'https://cdn-icons-png.flaticon.com/512/854/854878.png'
                    };
                });
            } catch (err) {
                console.error('Error consultando Google Places para Servicio:', err.message);
            }
        }
    } else if (apiKey) {
        // Flujo normal: Google Shopping + Web en PARALELO para máxima velocidad y variedad
        console.log(`[ShoppingService] Ejecutando Serper Shopping + Web para: "${shoppingQuery}" (${searchConditionMode})`);
        
        const shoppingPromise = fetchWithRetry({
            method: 'post',
            url: 'https://google.serper.dev/shopping',
            headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
            data: JSON.stringify({ q: shoppingQuery, gl: regionCfg.gl, hl: regionCfg.hl, num: 50 }),
            timeout: serperTimeout,
            signal: abortSignal
        }, serperRetries).catch(err => { console.error('Error Google Shopping:', err.message); return null; });

        // Build web query with priority: 1) intent-memory preferred stores, 2) category-specific domains, 3) general domains
        let webSearchQ;
        if (preferredStoreKeys.length > 0) {
            webSearchQ = regionConfigService.buildAdaptiveWebSearchQuery(webQuery, countryCode, preferredStoreKeys);
        } else if (productCategory) {
            webSearchQ = regionConfigService.buildCategoryWebSearchQuery(webQuery, countryCode, productCategory);
        } else {
            webSearchQ = regionConfigService.buildWebSearchQuery(webQuery, countryCode);
        }

        const webPromise = fetchWithRetry({
            method: 'post',
            url: 'https://google.serper.dev/search',
            headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
            data: JSON.stringify({
                q: webSearchQ,
                gl: regionCfg.gl, hl: regionCfg.hl, num: countryCode === 'US' ? 30 : 20
            }),
            timeout: serperTimeout,
            signal: abortSignal
        }, serperRetries).catch(err => { console.error('Error Serper Web:', err.message); return null; });

        const broadWebPromise = fetchWithRetry({
            method: 'post',
            url: 'https://google.serper.dev/search',
            headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
            data: JSON.stringify({
                q: regionConfigService.buildBroadWebSearchQuery(query, countryCode),
                
                gl: regionCfg.gl, hl: regionCfg.hl, num: countryCode === 'US' ? 20 : 15
            }),
            timeout: serperTimeout,
            signal: abortSignal
        }, serperRetries).catch(err => { console.error('Error Serper Broad Web:', err.message); return null; });

        const officialSearchQuery = brandOfficialQuery || query;
        const officialWebPromise = ['US', 'MX', 'CL', 'CO', 'AR', 'PE'].includes(countryCode)
            ? fetchWithRetry({
                method: 'post',
                url: 'https://google.serper.dev/search',
                headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
                data: JSON.stringify({
                    q: regionConfigService.buildOfficialWebSearchQuery(officialSearchQuery, countryCode),
                    gl: regionCfg.gl, hl: regionCfg.hl, num: 10
                }),
                timeout: serperTimeout,
                signal: abortSignal
            }, serperRetries).catch(err => { console.error('Error Official Serper Web:', err.message); return null; })
            : Promise.resolve(null);

        // PERF: Dedicated ML+Amazon Serper query to guarantee results from top marketplaces
        const mlAmazonDomains = countryCode === 'US'
            ? 'site:amazon.com OR site:ebay.com'
            : countryCode === 'CL'
                ? 'site:mercadolibre.cl OR site:amazon.com'
                : countryCode === 'CO'
                    ? 'site:mercadolibre.com.co OR site:amazon.com'
                    : countryCode === 'AR'
                        ? 'site:mercadolibre.com.ar'
                        : countryCode === 'PE'
                            ? 'site:mercadolibre.com.pe OR site:amazon.com'
                            : 'site:mercadolibre.com.mx OR site:amazon.com.mx';
        const mlAmazonPromise = fetchWithRetry({
            method: 'post',
            url: 'https://google.serper.dev/search',
            headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
            data: JSON.stringify({
                q: `${webQuery} ${mlAmazonDomains}`,
                gl: regionCfg.gl, hl: regionCfg.hl, num: 20
            }),
            timeout: serperTimeout,
            signal: abortSignal
        }, serperRetries).catch(err => { console.error('Error Serper ML+Amazon:', err.message); return null; });

        const serperAltQueryCount = isLocalFastMode ? 1 : (Math.max(0, parseInt(process.env.ALT_QUERY_SERPER_COUNT || '1', 10) || 1));
        const altShoppingPromises = (alternativeQueries || [])
            .filter(Boolean)
            .slice(0, isBroadExploration ? Math.max(serperAltQueryCount, 4) : Math.max(serperAltQueryCount, 2))
            .map(altQuery => fetchWithRetry({
                method: 'post',
                url: 'https://google.serper.dev/shopping',
                headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
                data: JSON.stringify({ q: altQuery, gl: regionCfg.gl, hl: regionCfg.hl, num: isBroadExploration ? 30 : 20 }),
                timeout: serperTimeout,
                signal: abortSignal
            }, serperRetries).catch(err => {
                console.error(`Error Google Shopping alt query "${altQuery}":`, err.message);
                return null;
            }));

        const [shoppingRes, webRes, broadWebRes, officialWebRes, mlAmazonRes, ...altShoppingResponses] = await Promise.all([shoppingPromise, webPromise, broadWebPromise, officialWebPromise, mlAmazonPromise, ...altShoppingPromises]);

        // Procesar Shopping
        if (shoppingRes?.data?.shopping) {
            const rawShopping = shoppingRes.data.shopping;
            // Accept ALL shopping results including Google redirect URLs.
            // Google redirect URLs (google.com/search?ibp=oshop) are functional —
            // they redirect the user to the actual store product page.
            // Discarding them loses 100% of Shopping results, images, and store diversity.
            serperResults = rawShopping.map(item => {
                // Robust price parsing: handle "$1,299.00 MXN", "1299", "$1,299", etc.
                let parsedPrice = null;
                if (item.price != null) {
                    const priceStr = String(item.price).replace(/[^0-9.,]/g, '').replace(/,/g, '');
                    parsedPrice = parseFloat(priceStr);
                    if (!Number.isFinite(parsedPrice)) parsedPrice = null;
                }
                return {
                    title: item.title || 'Sin Título',
                    price: resolvePriceMetadata({
                        primaryPrice: parsedPrice,
                        text: `${item.title || ''} ${item.snippet || ''}`,
                        sourceType: 'shopping_api',
                        isRedirect: (item.link || '').includes('google.com/search'),
                        isDirectProductPage: true
                    }).price,
                    url: item.link || '',
                    source: item.source || 'Tienda Desconocida',
                    image: normalizeIncomingImage(item.imageUrl || ''),
                    isGoogleRedirect: (item.link || '').includes('google.com/search'),
                    snippet: item.snippet || '',
                    ...resolvePriceMetadata({
                        primaryPrice: parsedPrice,
                        text: `${item.title || ''} ${item.snippet || ''}`,
                        sourceType: 'shopping_api',
                        isRedirect: (item.link || '').includes('google.com/search'),
                        isDirectProductPage: true
                    }),
                    resultSource: 'shopping_api',
                    isDirectProductPage: true
                };
            });
            console.log(`[Serper Shopping] ${serperResults.length} resultados procesados`);
        }

        altShoppingResponses.forEach((altRes) => {
            if (!altRes?.data?.shopping) return;
            const altMapped = altRes.data.shopping.map(item => {
                let parsedPrice = null;
                if (item.price != null) {
                    const priceStr = String(item.price).replace(/[^0-9.,]/g, '').replace(/,/g, '');
                    parsedPrice = parseFloat(priceStr);
                    if (!Number.isFinite(parsedPrice)) parsedPrice = null;
                }
                const isGoogleRedirect = (item.link || '').includes('google.com/search');
                const priceMeta = resolvePriceMetadata({
                    primaryPrice: parsedPrice,
                    text: `${item.title || ''} ${item.snippet || ''}`,
                    sourceType: 'shopping_api',
                    isRedirect: isGoogleRedirect,
                    isDirectProductPage: true
                });
                return {
                    title: item.title || 'Sin Título',
                    price: priceMeta.price,
                    url: item.link || '',
                    source: item.source || 'Tienda Desconocida',
                    image: normalizeIncomingImage(item.imageUrl || ''),
                    isGoogleRedirect,
                    hasEphemeralRedirect: isGoogleRedirect,
                    snippet: item.snippet || '',
                    ...priceMeta,
                    resultSource: 'shopping_api',
                    isDirectProductPage: true
                };
            });
            serperResults = [...serperResults, ...altMapped];
        });

        // Procesar Web complementario
        if (webRes?.data?.organic) {
            // Filter out category/listing pages that aren't actual product pages
            const categoryPatterns = [
                /\/c\//,           // walmart.com.mx/c/
                /\/browse\//,      // generic browse pages
                /\/tienda\?/,      // ?s= search results pages
                /\/catst\//,       // category listings
                /\/categoria\//,   // category pages
                /\/categorias\//,
                /\/l\//,           // mercadolibre.com.mx/l/
                /\/b\//,           // mercadolibre category 
                /\/ofertas/,       // offers landing pages
                /\/search\?/,      // search result pages
                /\/s\?/,           // amazon search pages
                /\/dp\/(?![A-Z0-9]{10})/, // broken amazon dp links
                /\/collections?\//,
                /\/department\//,
                /[?&](k|q|query|search|searchterm|searchterms|ntt)=/i
            ];
            const webResults = webRes.data.organic.filter(r => {
                if (!r.link || r.link.includes('google.com')) return false;
                // Exclude category-type URLs
                const path = r.link.toLowerCase();
                const knownStore = isKnownStoreUrl(r.link, countryCode);
                const snippetHasPrice = Number.isFinite(extractSnippetPrice(r.snippet || '') ?? extractSnippetPrice(r.title || ''));
                if (categoryPatterns.some(pattern => pattern.test(path)) && !knownStore) return false;
                return knownStore || looksLikeProductPage(r.link, countryCode) || snippetHasPrice;
            });
            const webMapped = webResults.map(r => {
                const storeName = regionConfigService.resolveStoreName(r.link, countryCode);
                const knownStore = isKnownStoreUrl(r.link, countryCode);
                const directProductPage = looksLikeProductPage(r.link, countryCode);
                const priceMeta = resolvePriceMetadata({
                    primaryPrice: extractSnippetPrice(r.snippet || '') ?? extractSnippetPrice(r.title || ''),
                    text: `${r.title || ''} ${r.snippet || ''}`,
                    sourceType: 'web_snippet',
                    isDirectProductPage: directProductPage
                });
                return {
                    title: r.title || 'Sin Título',
                    price: priceMeta.price,
                    url: r.link,
                    source: storeName,
                    image: normalizeIncomingImage(r.imageUrl || ''),
                    snippet: r.snippet || '',
                    isDirectProductPage: directProductPage,
                    isKnownStoreDomain: knownStore,
                    ...priceMeta,
                    resultSource: 'web_search'
                };
            });
            serperResults = [...serperResults, ...webMapped];
            console.log(`[Serper Web] Encontró ${webMapped.length} resultados web complementarios`);
        }

        if (officialWebRes?.data?.organic) {
            const officialMapped = officialWebRes.data.organic
                .filter(r => r.link && (looksLikeProductPage(r.link, countryCode) || isKnownStoreUrl(r.link, countryCode)))
                .map(r => {
                    const priceMeta = resolvePriceMetadata({
                        primaryPrice: extractSnippetPrice(r.snippet || '') ?? extractSnippetPrice(r.title || ''),
                        text: `${r.title || ''} ${r.snippet || ''}`,
                        sourceType: 'official_web',
                        isDirectProductPage: true
                    });
                    return {
                        title: r.title || 'Sin Título',
                        price: priceMeta.price,
                        url: r.link,
                        source: regionConfigService.resolveStoreName(r.link, countryCode),
                        image: normalizeIncomingImage(r.imageUrl || ''),
                        snippet: r.snippet || '',
                        isDirectProductPage: looksLikeProductPage(r.link, countryCode),
                        isKnownStoreDomain: true,
                        isOfficialBrandResult: true,
                        ...priceMeta,
                        resultSource: 'official_web'
                    };
                });
            serperResults = [...serperResults, ...officialMapped];
            console.log(`[Serper Official Web] Encontró ${officialMapped.length} resultados oficiales`);
        }

        // Process dedicated ML+Amazon results
        if (mlAmazonRes?.data?.organic) {
            const mlAmazonMapped = mlAmazonRes.data.organic
                .filter(r => r.link && !r.link.includes('google.com'))
                .filter(r => looksLikeProductPage(r.link, countryCode) || isKnownStoreUrl(r.link, countryCode) || Number.isFinite(extractSnippetPrice(r.snippet || '') ?? extractSnippetPrice(r.title || '')))
                .map(r => {
                    const knownStore = isKnownStoreUrl(r.link, countryCode);
                    const directProductPage = looksLikeProductPage(r.link, countryCode);
                    const priceMeta = resolvePriceMetadata({
                        primaryPrice: extractSnippetPrice(r.snippet || '') ?? extractSnippetPrice(r.title || ''),
                        text: `${r.title || ''} ${r.snippet || ''}`,
                        sourceType: 'web_snippet',
                        isDirectProductPage: directProductPage
                    });
                    return {
                        title: r.title || 'Sin Título',
                        price: priceMeta.price,
                        url: r.link,
                        source: regionConfigService.resolveStoreName(r.link, countryCode),
                        image: normalizeIncomingImage(r.imageUrl || ''),
                        snippet: r.snippet || '',
                        isDirectProductPage: directProductPage,
                        isKnownStoreDomain: knownStore,
                        ...priceMeta,
                        resultSource: 'ml_amazon_web'
                    };
                });
            serperResults = [...serperResults, ...mlAmazonMapped];
            console.log(`[Serper ML+Amazon] Encontró ${mlAmazonMapped.length} resultados dedicados de marketplaces`);
        }

        if (broadWebRes?.data?.organic && serperResults.length < 50) {
            const broadMapped = broadWebRes.data.organic
                .filter(r => r.link && !r.link.includes('google.com'))
                .filter(r => looksLikeProductPage(r.link, countryCode) || isKnownStoreUrl(r.link, countryCode) || Number.isFinite(extractSnippetPrice(r.snippet || '') ?? extractSnippetPrice(r.title || '')))
                .map(r => {
                    const knownStore = isKnownStoreUrl(r.link, countryCode);
                    const directProductPage = looksLikeProductPage(r.link, countryCode);
                    const priceMeta = resolvePriceMetadata({
                        primaryPrice: extractSnippetPrice(r.snippet || '') ?? extractSnippetPrice(r.title || ''),
                        text: `${r.title || ''} ${r.snippet || ''}`,
                        sourceType: 'broad_web',
                        isDirectProductPage: directProductPage
                    });
                    return {
                        title: r.title || 'Sin Título',
                        price: priceMeta.price,
                        url: r.link,
                        source: regionConfigService.resolveStoreName(r.link, countryCode),
                        image: normalizeIncomingImage(r.imageUrl || ''),
                        snippet: r.snippet || '',
                        isDirectProductPage: directProductPage,
                        isKnownStoreDomain: knownStore,
                        isBroadMatch: true,
                        ...priceMeta,
                        resultSource: 'broad_web'
                    };
                });
            serperResults = [...serperResults, ...broadMapped];
            console.log(`[Serper Broad Web] Rescató ${broadMapped.length} resultados amplios`);
        }

        // Búsqueda local de productos (tiendas físicas) si hay ubicación
        if (lat && lng && radius !== 'global' && radius !== '999999' && shouldRunPlacesQuery(query, intentType)) {
            try {
                // Map radius (km) to Google Maps zoom level for Serper Places API
                const radiusZoomMap = { '5': 15, '10': 14, '15': 13, '25': 12, '50': 11, '100': 10, 'local_only': 15 };
                const zoomFromRadius = radiusZoomMap[String(radius)] || 14;
                // Strip negative keywords for Places (they only work on Google Search)
                // For Places, search for stores that sell the category, not the exact model
                const placesClean = query.replace(/\s+-\w+/g, '').replace(/\b(nueva?o?|usado?)\b/gi, '').trim();
                // Take just first 2-3 meaningful words + "comprar" to find relevant stores
                // Filter out numbers, technical specs (825GB, 256GB, etc.), and short words
                const coreTerms = placesClean.split(/\s+/)
                    .filter(w => w.length > 2 && !/^\d+\w*$/.test(w) && !/^\d+GB|TB|MB|RAM|SSD|HDD$/i.test(w))
                    .slice(0, 3).join(' ');
                const simplifiedPlacesQuery = `${regionCfg.placesQuery} ${coreTerms}`;
                console.log(`[Serper Places] Buscando "${simplifiedPlacesQuery}" en @${lat},${lng},${zoomFromRadius}z`);
                const localConfig = {
                    method: 'post',
                    url: 'https://google.serper.dev/places',
                    headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
                    data: JSON.stringify({ q: simplifiedPlacesQuery, ll: `@${lat},${lng},${zoomFromRadius}z`, gl: regionCfg.gl, hl: regionCfg.hl }),
                    timeout: SERPER_TIMEOUT,
                    signal: abortSignal
                };
                const localRes = await axios(localConfig);
                const places = localRes.data.places || [];
                console.log(`[Serper Places] Encontró ${places.length} lugares cercanos`);

                // Extraer precios web si existen con IA + calcular distancia
                const localPromises = places.slice(0, 8).map(async p => {
                    const mapsUrl = p.cid ? `https://www.google.com/maps?cid=${p.cid}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.address || p.title)}`;
                    const storeName = p.title || 'Tienda Física';
                    const ratingStr = p.rating ? `⭐ ${p.rating}` : '';
                    const phoneStr = p.phoneNumber ? ` · 📞 ${p.phoneNumber}` : '';

                    // Calculate distance from user (Haversine formula)
                    let distanceKm = null;
                    if (p.latitude && p.longitude) {
                        const toRad = (deg) => deg * Math.PI / 180;
                        const R = 6371;
                        const dLat = toRad(p.latitude - lat);
                        const dLng = toRad(p.longitude - lng);
                        const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat)) * Math.cos(toRad(p.latitude)) * Math.sin(dLng / 2) ** 2;
                        distanceKm = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
                    }
                    const distStr = distanceKm != null ? ` · ${distanceKm} km` : '';

                    const extractedPrice = await localPriceExtractor.extractLocalStorePrice(storeName, query, `${lat},${lng}`);
                    const priceMeta = resolvePriceMetadata({
                        primaryPrice: extractedPrice,
                        text: `${storeName} ${p.address || ''}`,
                        sourceType: 'local_extractor',
                        isDirectProductPage: false
                    });
                    return {
                        title: storeName,
                        price: priceMeta.price,
                        isLocalStore: true,
                        localDetails: { address: p.address || '', rating: p.rating || null, phone: p.phoneNumber || null, distance: distanceKm },
                        url: mapsUrl,
                        source: `📍 Local · ${ratingStr}${phoneStr}${distStr}`,
                        image: 'https://cdn-icons-png.flaticon.com/512/854/854878.png',
                        ...priceMeta,
                        resultSource: 'places'
                    };
                });
                const localResults = await Promise.all(localPromises);

                // Filter out places that are too far away
                // Max distance = 3x the selected radius, capped at 150km
                const radiusKm = radius === 'local_only' ? 5 : parseFloat(radius) || 15;
                const maxDistanceKm = Math.min(radiusKm * 3, 150);
                const nearbyResults = localResults.filter(r => {
                    if (r.localDetails?.distance == null) return true; // Keep if no GPS data from Serper
                    return r.localDetails.distance <= maxDistanceKm;
                });
                if (nearbyResults.length < localResults.length) {
                    console.log(`[Serper Places] Filtró ${localResults.length - nearbyResults.length} lugares demasiado lejanos (>${maxDistanceKm}km)`);
                }
                serperResults = [...nearbyResults, ...serperResults];
            } catch (err) {
                console.error('Error consultando Google Places:', err.message);
            }
        } else if (lat && lng && radius !== 'global' && radius !== '999999') {
            console.log(`[Serper Places] Skip: query without strong local intent -> "${query}"`);
        }
    } else {
        console.warn('[ShoppingService] ⚠️ SERPER_API_KEY no está configurado. Solo se usarán scrapers directos.');
    }

    // 2. Ejecutar Scrapers DIRECTOS solo si NO es un servicio
    // FIX: Limitar concurrencia a 5 scrapers simultáneos para evitar agotar conexiones
    let directResults = [];
    if (shouldRunDirectScrapers) {
        // Strip Google-only negative keywords (-funda -case etc.) since direct scrapers use URL search params
        const cleanQuery = query.replace(/\s+-\w+/g, '').trim();
        console.log(`Ejecutando scrapers directos rápidos para ${countryCode}: ${cleanQuery} ...`);

        const scraperFunctions = [
            () => monitor.wrap(() => directScraper.scrapeMercadoLibreAPI(cleanQuery, countryCode, abortSignal, conditionMode), 'ml_api_direct'),
            () => monitor.wrap(() => directScraper.scrapeMercadoLibreDirect(cleanQuery, abortSignal), 'ml_web_direct'),
        ];

        if (countryCode === 'MX') {
            scraperFunctions.unshift(() => monitor.wrap(() => directScraper.scrapeAmazonDirect(cleanQuery, 'MX', abortSignal), 'amazon_direct'));
            scraperFunctions.push(
                () => monitor.wrap(directScraper.scrapeWalmartMX, 'walmart_direct', cleanQuery, abortSignal),
                () => monitor.wrap(directScraper.scrapeLiverpoolMX, 'liverpool_direct', cleanQuery, abortSignal),
                () => monitor.wrap(directScraper.scrapeCoppelMX, 'coppel_direct', cleanQuery, abortSignal),
                () => monitor.wrap(directScraper.scrapeElektraMX, 'elektra_direct', cleanQuery, abortSignal),
                () => monitor.wrap(directScraper.scrapeBestBuyMX, 'bestbuy_direct', cleanQuery, abortSignal),
                () => monitor.wrap(directScraper.scrapeCostcoMX, 'costco_direct', cleanQuery, abortSignal)
            );
        } else if (['CL', 'CO', 'PE'].includes(countryCode)) {
            scraperFunctions.unshift(() => monitor.wrap(() => directScraper.scrapeFalabellaRegional(cleanQuery, countryCode, abortSignal), 'falabella_direct'));
        } else if (countryCode === 'US') {
            scraperFunctions.unshift(() => monitor.wrap(() => directScraper.scrapeAmazonDirect(cleanQuery, 'US', abortSignal), 'amazon_direct'));
        }

        const preferredStores = getStorePriorityForCategory(productCategory, countryCode);
        if (preferredStores.length > 0) {
            scraperFunctions.sort((a, b) => {
                const rankFor = (fn) => {
                    const source = String(fn).toLowerCase();
                    const index = preferredStores.findIndex(store => source.includes(store));
                    return index === -1 ? 999 : index;
                };
                return rankFor(a) - rankFor(b);
            });
        }
        
        const CONCURRENCY_LIMIT = isLocalFastMode ? (isBroadExploration ? 3 : 2) : 8;
        const scraperResultsRaw = await runWithConcurrencyLimit(scraperFunctions, CONCURRENCY_LIMIT, abortSignal);
        
        scraperResultsRaw.forEach(result => {
            if (result.status === 'fulfilled' && result.value) {
                directResults = directResults.concat(result.value);
            }
        });
    }

    // 3. Unir resultados
    const dedupedByUrl = [];
    const seenUrls = new Set();
    [...serperResults, ...directResults].map(applyResultMetadata).forEach(result => {
        const key = String(result?.url || '').split('?')[0].toLowerCase();
        if (!key || !seenUrls.has(key)) {
            if (key) seenUrls.add(key);
            dedupedByUrl.push(result);
        }
    });
    return dedupedByUrl;
};
