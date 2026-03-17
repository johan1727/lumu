const axios = require('axios');
const directScraper = require('./directScraper');
const monitor = require('./scraperMonitor');
const localPriceExtractor = require('./localPriceExtractor');
const regionConfigService = require('./regionConfigService');

// Timeout por defecto para Serper API
const SERPER_TIMEOUT = 8000;
const SERPER_MAX_RETRIES = 2;
const LOCAL_FAST_TIMEOUT = 5000;

function extractSnippetPrice(text) {
    const source = String(text || '');
    const lowered = source.toLowerCase();
    if (!source) return null;
    if (/meses|msi|mensual|mensualidades|quincena|quincenal|semanales|semana|por mes|desde \$/.test(lowered)) {
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

// Helper para limitar concurrencia
async function runWithConcurrencyLimit(promiseFns, limit, abortSignal) {
    const results = [];
    const executing = new Set();
    
    for (const [index, promiseFn] of promiseFns.entries()) {
        if (abortSignal?.aborted) {
            break;
        }
        const p = Promise.resolve().then(() => promiseFn).then(result => ({ status: 'fulfilled', value: result, index })).catch(err => ({ status: 'rejected', reason: err, index }));
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

exports.searchGoogleShopping = async (query, radius, lat, lng, intentType, abortSignal, conditionMode = 'all', countryCode = 'MX', alternativeQueries = [], productCategory = '', preferredStoreKeys = []) => {
    const regionCfg = regionConfigService.getRegionConfig(countryCode);
    const isLocalFastMode = process.env.NODE_ENV !== 'production';
    const serperTimeout = isLocalFastMode ? LOCAL_FAST_TIMEOUT : SERPER_TIMEOUT;
    const serperRetries = isLocalFastMode ? 0 : SERPER_MAX_RETRIES;
    console.log(`[ShoppingService] Region: ${regionCfg.countryCode} (gl=${regionCfg.gl}, hl=${regionCfg.hl}, currency=${regionCfg.currency})`);
    const apiKey = process.env.SERPER_API_KEY;
    let serperResults = [];
    let isService = intentType === 'servicio_local';
    const searchConditionMode = conditionMode || 'all';

    // 1. Resolver búsqueda según la intención de la IA
    if (intentType === 'mayoreo_perecedero') {
        const supermarketScraper = require('./supermarketScraper');
        serperResults = await supermarketScraper.searchSupermarkets(query);
    } else if (isService) {
        // O.1: Para servicios locales (plomero, dentista), saltamos Google Shopping de Productos
        if (apiKey && lat && lng && radius !== 'global' && radius !== '999999') {
            try {
                const localConfig = {
                    method: 'post',
                    url: 'https://google.serper.dev/places',
                    headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
                    data: JSON.stringify({ q: query, ll: `@${lat},${lng},14z`, gl: regionCfg.gl, hl: regionCfg.hl }),
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
        console.log(`[ShoppingService] Ejecutando Serper Shopping + Web para: "${query}" (${searchConditionMode})`);
        
        const shoppingPromise = fetchWithRetry({
            method: 'post',
            url: 'https://google.serper.dev/shopping',
            headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
            data: JSON.stringify({ q: query, gl: regionCfg.gl, hl: regionCfg.hl, num: 40 }),
            timeout: serperTimeout,
            signal: abortSignal
        }, serperRetries).catch(err => { console.error('Error Google Shopping:', err.message); return null; });

        const webPromise = fetchWithRetry({
            method: 'post',
            url: 'https://google.serper.dev/search',
            headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
            data: JSON.stringify({
                q: preferredStoreKeys.length > 0
                    ? regionConfigService.buildAdaptiveWebSearchQuery(query, countryCode, preferredStoreKeys)
                    : regionConfigService.buildWebSearchQuery(query, countryCode),
                gl: regionCfg.gl, hl: regionCfg.hl, num: 20
            }),
            timeout: serperTimeout,
            signal: abortSignal
        }, serperRetries).catch(err => { console.error('Error Serper Web:', err.message); return null; });

        // Broad web search removed — shopping + site:web + direct scrapers provide sufficient coverage.
        // This saves 1 Serper API call per search (~33% cost reduction).

        const serperAltQueryCount = isLocalFastMode ? 0 : (Math.max(0, parseInt(process.env.ALT_QUERY_SERPER_COUNT || '1', 10) || 1));
        const altShoppingPromises = (alternativeQueries || [])
            .filter(Boolean)
            .slice(0, serperAltQueryCount)
            .map(altQuery => fetchWithRetry({
                method: 'post',
                url: 'https://google.serper.dev/shopping',
                headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
                data: JSON.stringify({ q: altQuery, gl: regionCfg.gl, hl: regionCfg.hl, num: 20 }),
                timeout: serperTimeout,
                signal: abortSignal
            }, serperRetries).catch(err => {
                console.error(`Error Google Shopping alt query "${altQuery}":`, err.message);
                return null;
            }));

        const [shoppingRes, webRes, ...altShoppingResponses] = await Promise.all([shoppingPromise, webPromise, ...altShoppingPromises]);

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
                    price: parsedPrice,
                    url: item.link || '',
                    source: item.source || 'Tienda Desconocida',
                    image: item.imageUrl || '',
                    isGoogleRedirect: (item.link || '').includes('google.com/search'),
                    snippet: item.snippet || ''
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
                return {
                    title: item.title || 'Sin Título',
                    price: parsedPrice,
                    url: item.link || '',
                    source: item.source || 'Tienda Desconocida',
                    image: item.imageUrl || '',
                    isGoogleRedirect: (item.link || '').includes('google.com/search'),
                    snippet: item.snippet || ''
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
            ];
            const webResults = webRes.data.organic.filter(r => {
                if (!r.link || r.link.includes('google.com')) return false;
                // Exclude category-type URLs
                const path = r.link.toLowerCase();
                return !categoryPatterns.some(pattern => pattern.test(path));
            });
            const webMapped = webResults.map(r => {
                const storeName = regionConfigService.resolveStoreName(r.link, countryCode);
                const price = extractSnippetPrice(r.snippet || '') ?? extractSnippetPrice(r.title || '');
                return {
                    title: r.title || 'Sin Título',
                    price,
                    url: r.link,
                    source: storeName,
                    image: r.imageUrl || '',
                    snippet: r.snippet || ''
                };
            });
            serperResults = [...serperResults, ...webMapped];
            console.log(`[Serper Web] Encontró ${webMapped.length} resultados web complementarios`);
        }

        // Broad web results processing removed (call eliminated above)

        // Búsqueda local de productos (tiendas físicas) si hay ubicación
        if (lat && lng && radius !== 'global' && radius !== '999999') {
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
                    return {
                        title: storeName,
                        price: extractedPrice,
                        isLocalStore: true,
                        localDetails: { address: p.address || '', rating: p.rating || null, phone: p.phoneNumber || null, distance: distanceKm },
                        url: mapsUrl,
                        source: `📍 Local · ${ratingStr}${phoneStr}${distStr}`,
                        image: 'https://cdn-icons-png.flaticon.com/512/854/854878.png'
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
        }
    } else {
        console.warn('[ShoppingService] ⚠️ SERPER_API_KEY no está configurado. Solo se usarán scrapers directos.');
    }

    // 2. Ejecutar Scrapers DIRECTOS solo si NO es un servicio
    // FIX: Limitar concurrencia a 5 scrapers simultáneos para evitar agotar conexiones
    let directResults = [];
    if (!isLocalFastMode && !isService && intentType !== 'mayoreo_perecedero') {
        // Strip Google-only negative keywords (-funda -case etc.) since direct scrapers use URL search params
        const cleanQuery = query.replace(/\s+-\w+/g, '').trim();
        console.log(`Ejecutando scrapers directos rápidos para ${countryCode}: ${cleanQuery} ...`);

        const scraperFunctions = [
            () => monitor.wrap(() => directScraper.scrapeMercadoLibreAPI(cleanQuery, countryCode, abortSignal), 'ml_api_direct'),
            () => monitor.wrap(directScraper.scrapeAliExpress, 'aliexpress_direct', cleanQuery, abortSignal)
        ];

        if (countryCode === 'MX') {
            scraperFunctions.unshift(() => monitor.wrap(directScraper.scrapeAmazonDirect, 'amazon_direct', cleanQuery, abortSignal));
            scraperFunctions.push(
                () => monitor.wrap(directScraper.scrapeWalmartMX, 'walmart_direct', cleanQuery, abortSignal),
                () => monitor.wrap(directScraper.scrapeLiverpoolMX, 'liverpool_direct', cleanQuery, abortSignal),
                () => monitor.wrap(directScraper.scrapeCoppelMX, 'coppel_direct', cleanQuery, abortSignal),
                () => monitor.wrap(directScraper.scrapeElektraMX, 'elektra_direct', cleanQuery, abortSignal),
                () => monitor.wrap(directScraper.scrapeBestBuyMX, 'bestbuy_direct', cleanQuery, abortSignal),
                () => monitor.wrap(directScraper.scrapeCostcoMX, 'costco_direct', cleanQuery, abortSignal),
                () => monitor.wrap(directScraper.scrapeSamsClubMX, 'sams_direct', cleanQuery, abortSignal),
                () => monitor.wrap(directScraper.scrapeHomeDepotMX, 'homedepot_direct', cleanQuery, abortSignal),
                () => monitor.wrap(directScraper.scrapeOfficeDepotMX, 'officedepot_direct', cleanQuery, abortSignal),
                () => monitor.wrap(directScraper.scrapeSorianaMX, 'soriana_direct', cleanQuery, abortSignal),
                () => monitor.wrap(directScraper.scrapeSearsMX, 'sears_direct', cleanQuery, abortSignal),
                () => monitor.wrap(directScraper.scrapeSheinMX, 'shein_direct', cleanQuery, abortSignal),
                () => monitor.wrap(directScraper.scrapeTemuMX, 'temu_direct', cleanQuery, abortSignal),
                () => monitor.wrap(directScraper.scrapeBodegaAurreraMX, 'bodega_aurrera_direct', cleanQuery, abortSignal),
                () => monitor.wrap(directScraper.scrapeLinioMX, 'linio_direct', cleanQuery, abortSignal),
                () => monitor.wrap(directScraper.scrapeClaroShopMX, 'claroshop_direct', cleanQuery, abortSignal)
            );
        } else if (['CL', 'CO', 'PE'].includes(countryCode)) {
            scraperFunctions.unshift(() => monitor.wrap(() => directScraper.scrapeFalabellaRegional(cleanQuery, countryCode, abortSignal), 'falabella_direct'));
        } else if (countryCode === 'US') {
            scraperFunctions.unshift(() => monitor.wrap(directScraper.scrapeAmazonDirect, 'amazon_direct', cleanQuery, abortSignal));
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
        
        const CONCURRENCY_LIMIT = 5;
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
    [...serperResults, ...directResults].forEach(result => {
        const key = String(result?.url || '').split('?')[0].toLowerCase();
        if (!key || !seenUrls.has(key)) {
            if (key) seenUrls.add(key);
            dedupedByUrl.push(result);
        }
    });
    return dedupedByUrl;
};
