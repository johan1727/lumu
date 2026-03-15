const axios = require('axios');
const directScraper = require('./directScraper');
const monitor = require('./scraperMonitor');
const localPriceExtractor = require('./localPriceExtractor');

// Timeout por defecto para Serper API
const SERPER_TIMEOUT = 8000;
const SERPER_MAX_RETRIES = 2;

function extractSnippetPrice(text) {
    const source = String(text || '');
    const lowered = source.toLowerCase();
    if (!source) return null;
    if (/meses|msi|mensual|mensualidades|quincena|quincenal|semanales|semana|por mes|desde \$/.test(lowered)) {
        return null;
    }
    const match = source.match(/\$([\d,]+(?:\.\d{2})?)/);
    if (!match) return null;
    const parsed = parseFloat(match[1].replace(/,/g, ''));
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

// Helper para limitar concurrencia
async function runWithConcurrencyLimit(promiseFns, limit) {
    const results = [];
    const executing = new Set();
    
    for (const [index, promiseFn] of promiseFns.entries()) {
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

exports.searchGoogleShopping = async (query, radius, lat, lng, intentType, abortSignal, conditionMode = 'all') => {
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
                    data: JSON.stringify({ q: query, ll: `@${lat},${lng},14z`, gl: 'mx', hl: 'es' }),
                    timeout: SERPER_TIMEOUT
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
            data: JSON.stringify({ q: query, gl: 'mx', hl: 'es', num: 40 }),
            timeout: SERPER_TIMEOUT
        }).catch(err => { console.error('Error Google Shopping:', err.message); return null; });

        const webPromise = fetchWithRetry({
            method: 'post',
            url: 'https://google.serper.dev/search',
            headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
            data: JSON.stringify({
                q: `${query} precio comprar site:walmart.com.mx OR site:liverpool.com.mx OR site:coppel.com OR site:bestbuy.com.mx OR site:elektra.com.mx OR site:costco.com.mx OR site:sams.com.mx OR site:officedepot.com.mx OR site:soriana.com OR site:sears.com.mx OR site:mx.shein.com OR site:temu.com OR site:bodegaaurrera.com.mx OR site:linio.com.mx OR site:claroshop.com OR site:sanborns.com.mx`,
                gl: 'mx', hl: 'es', num: 20
            }),
            timeout: SERPER_TIMEOUT
        }).catch(err => { console.error('Error Serper Web:', err.message); return null; });

        const [shoppingRes, webRes] = await Promise.all([shoppingPromise, webPromise]);

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
            const storeMap = {
                'walmart.com.mx': 'Walmart MX',
                'liverpool.com.mx': 'Liverpool',
                'coppel.com': 'Coppel',
                'bestbuy.com.mx': 'Best Buy MX',
                'elektra.com.mx': 'Elektra',
                'costco.com.mx': 'Costco MX',
                'sams.com.mx': "Sam's Club MX",
                'officedepot.com.mx': 'OfficeDepot MX',
                'soriana.com': 'Soriana',
                'sears.com.mx': 'Sears MX',
                'mx.shein.com': 'Shein MX',
                'shein.com': 'Shein MX',
                'temu.com': 'Temu MX',
                'bodegaaurrera.com.mx': 'Bodega Aurrera MX',
                'linio.com.mx': 'Linio MX',
                'claroshop.com': 'Claro Shop MX',
                'sanborns.com.mx': 'Sanborns MX'
            };
            const webMapped = webResults.map(r => {
                const domain = (r.link.match(/https?:\/\/(?:www\.)?([^/]+)/) || [])[1] || '';
                const storeName = Object.entries(storeMap).find(([d]) => domain.includes(d))?.[1] || domain;
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
                const simplifiedPlacesQuery = `comprar ${coreTerms}`;
                console.log(`[Serper Places] Buscando "${simplifiedPlacesQuery}" en @${lat},${lng},${zoomFromRadius}z`);
                const localConfig = {
                    method: 'post',
                    url: 'https://google.serper.dev/places',
                    headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
                    data: JSON.stringify({ q: simplifiedPlacesQuery, ll: `@${lat},${lng},${zoomFromRadius}z`, gl: 'mx', hl: 'es' }),
                    timeout: SERPER_TIMEOUT
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
    if (!isService && intentType !== 'mayoreo_perecedero') {
        // Strip Google-only negative keywords (-funda -case etc.) since direct scrapers use URL search params
        const cleanQuery = query.replace(/\s+-\w+/g, '').trim();
        console.log(`Ejecutando scrapers directos y rápidos para: ${cleanQuery} ...`);
        
        const scraperFunctions = [
            () => monitor.wrap(directScraper.scrapeAmazonDirect, 'amazon_direct', cleanQuery),
            () => monitor.wrap(directScraper.scrapeMercadoLibreDirect, 'ml_direct', cleanQuery),
            () => monitor.wrap(directScraper.scrapeWalmartMX, 'walmart_direct', cleanQuery),
            () => monitor.wrap(directScraper.scrapeLiverpoolMX, 'liverpool_direct', cleanQuery),
            () => monitor.wrap(directScraper.scrapeCoppelMX, 'coppel_direct', cleanQuery),
            () => monitor.wrap(directScraper.scrapeAliExpress, 'aliexpress_direct', cleanQuery),
            () => monitor.wrap(directScraper.scrapeElektraMX, 'elektra_direct', cleanQuery),
            () => monitor.wrap(directScraper.scrapeBestBuyMX, 'bestbuy_direct', cleanQuery),
            () => monitor.wrap(directScraper.scrapeCostcoMX, 'costco_direct', cleanQuery),
            () => monitor.wrap(directScraper.scrapeSamsClubMX, 'sams_direct', cleanQuery),
            () => monitor.wrap(directScraper.scrapeHomeDepotMX, 'homedepot_direct', cleanQuery),
            () => monitor.wrap(directScraper.scrapeOfficeDepotMX, 'officedepot_direct', cleanQuery),
            () => monitor.wrap(directScraper.scrapeSorianaMX, 'soriana_direct', cleanQuery),
            () => monitor.wrap(directScraper.scrapeSearsMX, 'sears_direct', cleanQuery),
            () => monitor.wrap(directScraper.scrapeSheinMX, 'shein_direct', cleanQuery),
            () => monitor.wrap(directScraper.scrapeTemuMX, 'temu_direct', cleanQuery),
            () => monitor.wrap(directScraper.scrapeBodegaAurreraMX, 'bodega_aurrera_direct', cleanQuery),
            () => monitor.wrap(directScraper.scrapeLinioMX, 'linio_direct', cleanQuery),
            () => monitor.wrap(directScraper.scrapeClaroShopMX, 'claroshop_direct', cleanQuery)
        ];
        
        const CONCURRENCY_LIMIT = 5;
        const scraperResultsRaw = await runWithConcurrencyLimit(scraperFunctions, CONCURRENCY_LIMIT);
        
        scraperResultsRaw.forEach(result => {
            if (result.status === 'fulfilled' && result.value) {
                directResults = directResults.concat(result.value);
            }
        });
    }

    // 3. Unir resultados
    return [...serperResults, ...directResults];
};
