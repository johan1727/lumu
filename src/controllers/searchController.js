const llmService = require('../services/llmService');
const shoppingService = require('../services/shoppingService');
const affiliateManager = require('../utils/affiliateManager');
const cacheService = require('../services/cacheService');
const supabase = require('../config/supabase');
const visionService = require('../services/visionService');
const couponService = require('../services/couponService');
const storeTrustService = require('../services/storeTrustService');
const regionConfigService = require('../services/regionConfigService');

function buildFallbackSuggestions(baseQuery, altQueries = []) {
    const cleanBase = String(baseQuery || '').trim();
    const baseSuggestions = cleanBase
        ? [
            `${cleanBase} precio`,
            `${cleanBase} ofertas`,
            `${cleanBase} descuento`,
            `${cleanBase} tienda local`,
            `${cleanBase} mercado libre`,
            `${cleanBase} amazon`,
            `${cleanBase} walmart`,
            `${cleanBase} liverpool`
        ]
        : [];

    return [...new Set([...(altQueries || []), ...baseSuggestions])]
        .filter(Boolean)
        .slice(0, 4);
}

function buildDealVerdict(currentPrice, history = []) {
    const normalizedHistory = (history || [])
        .map(entry => ({
            price: Number(entry.price),
            created_at: entry.created_at
        }))
        .filter(entry => Number.isFinite(entry.price) && entry.price > 0)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    if (!Number.isFinite(currentPrice) || currentPrice <= 0 || normalizedHistory.length < 3) {
        return null;
    }

    const prices = normalizedHistory.map(entry => entry.price);
    const avgPrice = prices.reduce((sum, value) => sum + value, 0) / prices.length;
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const recentWindow = normalizedHistory.slice(-7, -1);
    const baselineWindow = normalizedHistory.slice(Math.max(0, normalizedHistory.length - 37), Math.max(0, normalizedHistory.length - 7));
    const recentAvg = recentWindow.length ? recentWindow.reduce((sum, item) => sum + item.price, 0) / recentWindow.length : null;
    const baselineAvg = baselineWindow.length ? baselineWindow.reduce((sum, item) => sum + item.price, 0) / baselineWindow.length : avgPrice;
    const belowAveragePct = avgPrice > 0 ? Number((((avgPrice - currentPrice) / avgPrice) * 100).toFixed(1)) : 0;
    const belowMaxPct = maxPrice > 0 ? Number((((maxPrice - currentPrice) / maxPrice) * 100).toFixed(1)) : 0;
    const recentInflation = recentAvg && baselineAvg ? recentAvg > baselineAvg * 1.2 : false;

    if (recentInflation && currentPrice >= baselineAvg * 0.95) {
        return {
            status: 'suspicious_discount',
            label: 'Descuento sospechoso',
            confidence: 'media',
            stats: {
                avgPrice: Number(avgPrice.toFixed(2)),
                minPrice: Number(minPrice.toFixed(2)),
                maxPrice: Number(maxPrice.toFixed(2)),
                belowAveragePct,
                belowMaxPct
            }
        };
    }

    if (currentPrice <= minPrice * 1.03 || belowAveragePct >= 10) {
        return {
            status: 'real_deal',
            label: 'Oferta real',
            confidence: currentPrice <= minPrice * 1.01 || belowAveragePct >= 18 ? 'alta' : 'media',
            stats: {
                avgPrice: Number(avgPrice.toFixed(2)),
                minPrice: Number(minPrice.toFixed(2)),
                maxPrice: Number(maxPrice.toFixed(2)),
                belowAveragePct,
                belowMaxPct
            }
        };
    }

    return {
        status: 'normal_price',
        label: 'Precio normal',
        confidence: 'media',
        stats: {
            avgPrice: Number(avgPrice.toFixed(2)),
            minPrice: Number(minPrice.toFixed(2)),
            maxPrice: Number(maxPrice.toFixed(2)),
            belowAveragePct,
            belowMaxPct
        }
    };
}

function createSearchCostMetrics() {
    return {
        llmGenerateCalls: 0,
        llmEmbeddingCalls: 0,
        serperShoppingCalls: 0,
        serperWebCalls: 0,
        serperPlacesCalls: 0,
        cacheHit: false,
        retrySearches: 0,
        altQueryDirectCalls: 0
    };
}

function parseUsdRate(envName) {
    const parsed = parseFloat(process.env[envName] || '0');
    return Number.isFinite(parsed) ? parsed : 0;
}

function estimateSearchCostUsd(metrics = {}) {
    const total =
        (metrics.llmGenerateCalls || 0) * parseUsdRate('EST_COST_GEMINI_GENERATE_USD') +
        (metrics.llmEmbeddingCalls || 0) * parseUsdRate('EST_COST_GEMINI_EMBED_USD') +
        (metrics.serperShoppingCalls || 0) * parseUsdRate('EST_COST_SERPER_SHOPPING_USD') +
        (metrics.serperWebCalls || 0) * parseUsdRate('EST_COST_SERPER_WEB_USD') +
        (metrics.serperPlacesCalls || 0) * parseUsdRate('EST_COST_SERPER_PLACES_USD');

    return Number(total.toFixed(6));
}

function tokenizeSearchText(value = '') {
    return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9áéíóúñü\s]/gi, ' ')
        .split(/\s+/)
        .filter(token => token.length > 2);
}

function buildMatchSignals(searchText = '', titleText = '') {
    const queryTokens = [...new Set(tokenizeSearchText(searchText))];
    const titleTokens = new Set(tokenizeSearchText(titleText));
    if (queryTokens.length === 0) {
        return { matchScore: 0, strongMatch: false, weakMatch: false };
    }

    const matchedTokens = queryTokens.filter(token => titleTokens.has(token)).length;
    const matchScore = matchedTokens / queryTokens.length;
    return {
        matchScore,
        strongMatch: matchScore >= 0.72 || (matchedTokens >= 3 && matchScore >= 0.6),
        weakMatch: matchScore < 0.45
    };
}

function bumpProviderCostMetrics(metrics, { intentType, radius, lat, lng }) {
    if (!process.env.SERPER_API_KEY) {
        return;
    }

    if (intentType === 'mayoreo_perecedero') {
        return;
    }

    const hasLocation = Boolean(lat && lng && radius !== 'global' && radius !== '999999');

    if (intentType === 'servicio_local') {
        if (hasLocation) metrics.serperPlacesCalls += 1;
        return;
    }

    metrics.serperShoppingCalls += 1;
    metrics.serperWebCalls += 1;

    if (hasLocation) {
        metrics.serperPlacesCalls += 1;
    }
}

function logSearchCostMetrics(context, metrics, extra = {}) {
    const estimatedCostUsd = estimateSearchCostUsd(metrics);
    console.log('[Search Cost]', JSON.stringify({
        context,
        ...metrics,
        estimatedCostUsd,
        ...extra
    }));
}

exports.analyzeImage = async (req, res) => {
    try {
        const { image } = req.body;
        if (!image) {
            return res.status(400).json({ error: 'No se proporcionó ninguna imagen.' });
        }

        // Validate base64 payload size (max ~5MB decoded = ~6.7MB base64)
        const MAX_BASE64_LENGTH = 7 * 1024 * 1024; // 7MB in base64 chars
        if (image.length > MAX_BASE64_LENGTH) {
            return res.status(413).json({ error: 'La imagen es demasiado grande. Máximo 5MB.' });
        }

        // Limpiar prefijo base64 si existe
        const base64Data = image.replace(/^data:image\/\w+;base64,/, "");

        const result = await visionService.identifyProduct(base64Data);
        res.json(result);
    } catch (error) {
        console.error('Error en analyzeImage:', error);
        res.status(500).json({ error: 'Error al procesar la imagen con IA.' });
    }
};

exports.searchProduct = async (req, res) => {
    const costMetrics = createSearchCostMetrics();
    try {
        console.log('[DEBUG /buscar] req.body:', JSON.stringify(req.body));
        const {
            chatHistory = [],
            radius,
            lat,
            lng,
            skipLLM,
            safeStoresOnly = false,
            includeKnownMarketplaces = true,
            includeHighRiskMarketplaces = false,
            conditionMode = 'all',
            country: explicitCountry
        } = req.body;

        // Detect country: explicit from frontend > Vercel IP header > Accept-Language > MX default
        const countryCode = regionConfigService.resolveCountry(req, explicitCountry);
        const regionCfg = regionConfigService.getRegionConfig(countryCode);
        console.log(`[Search] Detected country: ${countryCode} (${regionCfg.regionLabel}, ${regionCfg.currency})`);

        // Use verified userId from auth middleware (JWT), ignore body.userId
        const userId = req.userId || null;

        // Sanitize: strip HTML tags, trim whitespace, limit to 200 chars
        const query = (typeof req.body.query === 'string')
            ? req.body.query.replace(/<[^>]*>/g, '').trim().slice(0, 200)
            : null;

        if (!query) {
            return res.status(400).json({ error: 'Falta el texto de búsqueda (query) en el body.' });
        }

        let usageWarning = null;

        // PAYWALL Enforcement: Rate limit anonymous users by IP (Supabase-based for serverless safety)
        if (!userId) {
            // Bypass anonymous IP rate limiting in development
            if (process.env.NODE_ENV !== 'production') {
                console.log('[Dev] Bypassing IP rate limit');
            } else {
                // x-vercel-forwarded-for is authoritative on Vercel (can't be spoofed by client)
                const ip = req.headers['x-vercel-forwarded-for']?.split(',')[0]?.trim() || req.headers['x-real-ip'] || req.headers['x-forwarded-for']?.split(',').pop()?.trim() || req.ip || 'unknown';
                const ANON_DAILY_LIMIT = 3;

            if (supabase) {
                try {
                    const todayStart = new Date();
                    todayStart.setHours(0, 0, 0, 0);
                    const searchIpKey = `search:${ip}`;
                    const { count, error } = await supabase
                        .from('rate_limits')
                        .select('*', { count: 'exact', head: true })
                        .eq('ip', searchIpKey)
                        .gte('created_at', todayStart.toISOString());

                    if (!error && count >= ANON_DAILY_LIMIT) {
                        return res.status(402).json({
                            error: `Límite diario de ${ANON_DAILY_LIMIT} búsquedas gratuitas alcanzado.Inicia sesión o hazte VIP para más búsquedas.`,
                            paywall: true
                        });
                    }
                    // Log this anonymous search (fire & forget)
                    supabase.from('rate_limits').insert({ ip: searchIpKey, created_at: new Date().toISOString() }).then(() => { }).catch(() => { });
                } catch (e) {
                    console.warn('[Anon Paywall] Supabase error, allowing request:', e.message);
                }
            } else {
                // RAM fallback (unreliable in serverless but better than nothing)
                if (!global._anonSearchLog) global._anonSearchLog = {};
                const todayKey = new Date().toISOString().slice(0, 10);
                const ipKey = `${ip}:${todayKey}`;
                global._anonSearchLog[ipKey] = (global._anonSearchLog[ipKey] || 0) + 1;
                if (global._anonSearchLog[ipKey] > ANON_DAILY_LIMIT) {
                    return res.status(402).json({
                        error: `Límite diario de ${ANON_DAILY_LIMIT} búsquedas gratuitas alcanzado.Inicia sesión o hazte VIP para más búsquedas.`,
                        paywall: true
                    });
                }
            }
            } // Close the else block for NODE_ENV
        }

        // PAYWALL Enforcement: Verificar límites por plan en backend (authenticated users)
        if (userId && supabase) {
            const { data: profile } = await supabase.from('profiles').select('plan, is_premium, vip_temp_unlocked_at').eq('id', userId).single();
            if (profile) {
                let reqLimit = 3;
                let isDaily = true;
                let planName = 'Gratis';

                // SEC-3: Check if user has active temporary VIP from Lumu Coins (1 hour window)
                const VIP_TEMP_DURATION_MS = 60 * 60 * 1000; // 1 hour
                const hasTempVIP = profile.vip_temp_unlocked_at &&
                    (Date.now() - new Date(profile.vip_temp_unlocked_at).getTime()) < VIP_TEMP_DURATION_MS;

                if (profile.plan === 'b2b') {
                    reqLimit = 500;
                    isDaily = false;
                    planName = 'Revendedor B2B';
                } else if (profile.is_premium || profile.plan === 'personal_vip') {
                    reqLimit = 100;
                    isDaily = false;
                    planName = 'VIP';
                } else if (hasTempVIP) {
                    reqLimit = 20;
                    isDaily = true;
                    planName = 'VIP Temporal';
                }

                let queryDate = new Date();
                if (isDaily) {
                    queryDate.setHours(0, 0, 0, 0);
                } else {
                    queryDate.setDate(1); // Inicio de mes
                    queryDate.setHours(0, 0, 0, 0);
                }

                const { count, error } = await supabase.from('searches')
                    .select('*', { count: 'exact', head: true })
                    .eq('user_id', userId)
                    .gte('created_at', queryDate.toISOString());

                // Subtract bonus credits (from claimReward) earned today
                let bonusCredits = 0;
                try {
                    const bonusKey = `bonus:user:${userId}`;
                    const { count: bCount } = await supabase.from('rate_limits')
                        .select('*', { count: 'exact', head: true })
                        .eq('ip', bonusKey)
                        .gte('created_at', queryDate.toISOString());
                    bonusCredits = bCount || 0;
                } catch { /* ignore */ }

                const effectiveUsed = Math.max(0, (count || 0) - bonusCredits);

                if (!error) {
                    if (effectiveUsed >= reqLimit) {
                        const errorMsg = isDaily
                            ? 'Límite diario de búsquedas gratuitas alcanzado. Mejora a VIP para búsquedas sin límites.'
                            : `Límite mensual de búsquedas alcanzado(${reqLimit} para el plan ${planName}).Por favor espera a tu siguiente ciclo o contacta a soporte.`;
                        return res.status(402).json({
                            error: errorMsg,
                            paywall: !profile.is_premium && !hasTempVIP,
                            upgrade_required: !!profile.is_premium && !hasTempVIP
                        });
                    }

                    // Generar Warning si está cerca del límite
                    if (!isDaily && effectiveUsed >= reqLimit * 0.9) {
                        usageWarning = `⚠️ Te estás acercando a tu límite mensual(${effectiveUsed} / ${reqLimit} búsquedas).`;
                    } else if (isDaily && effectiveUsed === reqLimit - 1) {
                        usageWarning = `⚠️ Te queda 1 búsqueda gratuita hoy.`;
                    }
                }
            }
        }

        // MASTER TIMEOUT: AbortController para cancelar operaciones si excedemos 45s
        const MASTER_TIMEOUT_MS = 45000;
        const abortController = new AbortController();
        const searchStartTime = Date.now();
        
        // Setup timeout abort
        const timeoutId = setTimeout(() => {
            abortController.abort();
            console.warn('[Master Timeout] Abortando operaciones por exceso de tiempo');
        }, MASTER_TIMEOUT_MS);

        // Check if aborted before LLM call
        if (abortController.signal.aborted) {
            clearTimeout(timeoutId);
            return res.status(504).json({ error: 'La búsqueda tomó demasiado tiempo. Intenta con una búsqueda más específica.' });
        }

        if (!skipLLM) {
            costMetrics.llmGenerateCalls += 1;
            if (supabase) costMetrics.llmEmbeddingCalls += 1;
        }

        let llmAnalysis;
        if (skipLLM) {
            console.log(`[Direct Search] Saltando LLM para: ${query}`);
            llmAnalysis = {
                action: 'search',
                searchQuery: query,
                condition: conditionMode === 'used' ? 'used' : 'new',
                reason: 'Direct category search'
            };
        } else {
            // 1. Evaluar el mensaje del usuario con la IA Conversacional (incluyendo historial)
            llmAnalysis = await llmService.analyzeMessage(query, chatHistory, abortController.signal);
            console.log('Análisis LLM:', llmAnalysis);
        }

        if (conditionMode === 'used') {
            llmAnalysis.condition = 'used';
        } else if (conditionMode === 'new') {
            llmAnalysis.condition = 'new';
        }

        // 2. Si faltan datos, devolver la pregunta de seguimiento al frontend
        if (llmAnalysis.action === 'ask') {
            logSearchCostMetrics('search.ask', costMetrics, {
                query,
                userId: Boolean(userId)
            });
            return res.json({
                tipo_respuesta: 'conversacion',
                pregunta_ia: llmAnalysis.question,
                sugerencias: llmAnalysis.sugerencias || [],
                advertencia_uso: usageWarning
            });
        }

        // 3. Si la acción es 'search', ejecutamos Google Shopping
        let searchQuery = llmAnalysis.searchQuery;
        if (conditionMode === 'used') {
            searchQuery = `${searchQuery} usado reacondicionado refurbished seminuevo open box segunda mano marketplace mercadolibre`;
        } else if (conditionMode === 'new') {
            searchQuery = `${searchQuery} -usado -reacondicionado -refurbished -"open box"`;
        }

        // NUEVO: Verificamos en Caché
        const cachedResults = await cacheService.getCachedResults(searchQuery, radius, lat, lng, countryCode);
        if (cachedResults) {
            costMetrics.cacheHit = true;
            logSearchCostMetrics('search.cache_hit', costMetrics, {
                query: searchQuery,
                userId: Boolean(userId),
                resultCount: cachedResults.length
            });
            return res.json({
                tipo_respuesta: 'resultados',
                intencion_detectada: {
                    busqueda: searchQuery,
                    condicion: llmAnalysis.condition,
                    desde_cache: true
                },
                region: {
                    country: countryCode,
                    currency: regionCfg.currency,
                    locale: regionCfg.locale,
                    label: regionCfg.regionLabel
                },
                top_5_baratos: cachedResults,
                advertencia_uso: usageWarning
            });
        }

        // Check if aborted
        if (abortController.signal.aborted) {
            clearTimeout(timeoutId);
            return res.status(504).json({ error: 'La búsqueda fue cancelada por timeout.' });
        }

        bumpProviderCostMetrics(costMetrics, { intentType: llmAnalysis.intent_type, radius, lat, lng });
        console.log(`[Search Pipeline] Buscando: "${searchQuery}" | radius=${radius} | lat=${lat} | lng=${lng} | intent=${llmAnalysis.intent_type}`);
        const shoppingResults = await shoppingService.searchGoogleShopping(searchQuery, radius, lat, lng, llmAnalysis.intent_type, abortController.signal, conditionMode, countryCode);
        console.log(`[Search Pipeline] Resultados de shoppingService: ${shoppingResults.length}`);

        // Check remaining time before alt queries (skip if running low)
        const elapsedMs = Date.now() - searchStartTime;
        const remainingMs = MASTER_TIMEOUT_MS - elapsedMs;
        console.log(`[Search Pipeline] Elapsed: ${elapsedMs}ms, Remaining: ${remainingMs}ms`);

        // NUEVO: Multi-Query Background Scraper para Variantes (skip if < 15s remaining)
        const cleanSearchQuery = searchQuery.replace(/\s+-\w+/g, '').trim();
        const altQueries = llmAnalysis.alternativeQueries || [];
        if (altQueries.length > 0 && remainingMs > 15000 && !abortController.signal.aborted) {
            console.log(`Ejecutando Multi-Query alternativas: ${altQueries.join(', ')}`);
            const directScraper = require('../services/directScraper');
            const altPromises = [];
            const altAbortControllers = [];
            
            for (const altQ of altQueries.slice(0, 2)) {
                const cleanAltQ = altQ.replace(/\bsite:\S+/gi, '').trim();
                if (!cleanAltQ) continue;
                
                // Crear AbortController para cada scraper
                const altAbortController = new AbortController();
                altAbortControllers.push(altAbortController);
                
                altPromises.push(
                    directScraper.scrapeMercadoLibreDirect(cleanAltQ, altAbortController.signal)
                        .catch(() => []),
                    directScraper.scrapeAmazonDirect(cleanAltQ, altAbortController.signal)
                        .catch(() => [])
                );
            }

            costMetrics.altQueryDirectCalls += altPromises.length;
            
            // Race alt queries against remaining time minus buffer
            const altTimeout = Math.min(remainingMs - 10000, 10000);
            
            let altResultsRaw;
            try {
                altResultsRaw = await Promise.race([
                    Promise.allSettled(altPromises),
                    new Promise((_, reject) => {
                        const timer = setTimeout(() => {
                            // Abortar todos los scrapers
                            altAbortControllers.forEach(ctrl => ctrl.abort());
                            reject(new Error('AltQueries timeout'));
                        }, altTimeout);
                        abortController.signal.addEventListener('abort', () => {
                            clearTimeout(timer);
                            altAbortControllers.forEach(ctrl => ctrl.abort());
                            reject(new Error('Aborted'));
                        });
                    })
                ]);
            } catch (timeoutErr) {
                console.log(`[Search Pipeline] Alt queries timeout o abortado`);
                altAbortControllers.forEach(ctrl => ctrl.abort());
                altResultsRaw = [];
            }
            
            if (Array.isArray(altResultsRaw)) {
                altResultsRaw.forEach(altResult => {
                    if (altResult.status === 'fulfilled' && altResult.value) {
                        shoppingResults.push(...altResult.value);
                    }
                });
            }
            
            // Limpiar AbortControllers
            altAbortControllers.forEach(ctrl => ctrl.abort());
        } else if (altQueries.length > 0) {
            console.log(`[Search Pipeline] Skipping alt queries — only ${remainingMs}ms remaining o abortado`);
        }

        console.log(`[Search Pipeline] Total resultados(con alt queries): ${shoppingResults.length} `);

        if (shoppingResults.length === 0) {
            console.warn(`[Search Pipeline] ⚠️ CERO resultados para "${searchQuery}".Serper key: ${process.env.SERPER_API_KEY ? 'SET' : 'MISSING'} `);
            
            // --- NUEVO: Fallback Simplificado ---
            const simplifiedQuery = searchQuery.split(/\s+/).slice(0, 3).join(' ');
            if (simplifiedQuery.length < searchQuery.length) {
                console.log(`[Search Pipeline] 🔄 Reintentando con query simplificado: "${simplifiedQuery}"`);
                costMetrics.retrySearches += 1;
                bumpProviderCostMetrics(costMetrics, { intentType: llmAnalysis.intent_type, radius, lat, lng });
                const retryResults = await shoppingService.searchGoogleShopping(simplifiedQuery, radius, lat, lng, llmAnalysis.intent_type, null, conditionMode, countryCode);
                if (retryResults && retryResults.length > 0) {
                    shoppingResults.push(...retryResults);
                    console.log(`[Search Pipeline] ✅ Reintento exitoso: ${retryResults.length} resultados.`);
                }
            }

            if (shoppingResults.length === 0) {
                logSearchCostMetrics('search.no_results', costMetrics, {
                    query: searchQuery,
                    userId: Boolean(userId),
                    resultCount: 0
                });
                return res.json({
                    tipo_respuesta: 'resultados',
                    intencion_detectada: {
                        busqueda: searchQuery,
                        condicion: llmAnalysis.condition,
                        desde_cache: false
                    },
                    top_5_baratos: [],
                    sugerencias: buildFallbackSuggestions(searchQuery, llmAnalysis.alternativeQueries),
                    advertencia_uso: usageWarning
                });
            }
        }

        // 4. Filtrar y Procesar resultados (Simular filtro Condition + Deduplicar)
        // --- PRE-FILTER: Remove garbage results & Apply Safe Stores Filter ---
        const cleanedResults = shoppingResults.filter(item => {
            item.storeTrust = storeTrustService.classifyStore(item);

            // Apply Safe Stores Filter if requested
            if (safeStoresOnly) {
                if (!storeTrustService.shouldAllowSafeStore(item)) {
                    console.log(`[Safe Filter] Excluyendo tienda no segura: ${item.source || item.store || 'desconocida'}`);
                    return false;
                }
            }

            if (!safeStoresOnly) {
                if (!includeKnownMarketplaces && item.storeTrust.storeTier === 2 && !item.storeTrust.isTrustedRetail) {
                    return false;
                }
                if (!includeHighRiskMarketplaces && item.storeTrust.storeTier === 3) {
                    return false;
                }
            }

            // Keep local store results even without price
            if (item.isLocalStore) return true;
            // Remove items with no title or garbage titles (navigation pages, category pages)
            const title = (item.title || '').trim();
            if (title.length < 5) return false;
            if (/^(compra|ver|buscar|encuentra|tienda|catálogo|categoría|página|p\.\-?\d)/i.test(title)) return false;
            // Robust price parsing: handle "$1,299.00", "MXN 1299", "1,299", numbers, etc.
            let price = null;
            const hasTrustedSource = item.storeTrust.isKnownStore || item.isLocalStore;
            if (item.price != null) {
                const priceStr = String(item.price).replace(/[^0-9.,]/g, '').replace(/,/g, '');
                price = parseFloat(priceStr);
                // Fix: update item.price to numeric so downstream code works
                if (Number.isFinite(price) && price > 0) {
                    item.price = price;
                }
            }
            if (price === null || !Number.isFinite(price) || price <= 0) {
                if (!item.isLocalStore && !hasTrustedSource) return false;
                item.price = null;
                return true;
            }
            const expensiveProductSearch = /iphone|playstation|ps5|macbook|ipad|galaxy|xbox|switch oled|switch|ultra|s24|s25/i.test(searchQuery);
            const titleLower = title.toLowerCase();
            if (expensiveProductSearch && price < 1500 && /funda|case|mica|protector|cable|correa|carcasa|templado|adaptador/i.test(titleLower)) {
                return false;
            }
            if (/(meses|msi|mensual|mensualidades|quincena|por mes|semanales)/i.test(`${item.snippet || ''} ${item.title || ''}`)) {
                item.isSuspicious = true;
            }
            if (expensiveProductSearch && price < 1500) {
                item.isSuspicious = true;
            }
            // Remove suspiciously cheap items (likely price-per-unit or errors) — lowered from 10 to 5
            if (price < 5) return false;
            return true;
        });
        console.log(`[Search Pipeline] Después de pre - filter: ${cleanedResults.length} de ${shoppingResults.length} `);

        const classifyCondition = (item) => {
            const text = `${item.title || ''} ${item.snippet || ''} ${item.source || ''} ${item.url || ''}`.toLowerCase();
            const isRefurbished = /reacond|refurb|renewed|remanufacturado|open box|certified renewed/.test(text);
            const isUsed = /usad|seminuev|segunda mano|preowned|pre-owned|pre loved|preloved/.test(text);
            const isC2C = item.storeTrust?.sellerModel === 'c2c' || /facebook|marketplace|ebay|vivanuncios|segundamano/.test(text);
            return {
                conditionLabel: isRefurbished ? 'refurbished' : (isUsed ? 'used' : 'new'),
                isC2C
            };
        };

        for (const item of cleanedResults) {
            const conditionMeta = classifyCondition(item);
            const matchSignals = buildMatchSignals(llmAnalysis.searchQuery || query, item.title || '');
            item.conditionLabel = conditionMeta.conditionLabel;
            item.isC2C = conditionMeta.isC2C;
            item.matchScore = matchSignals.matchScore;
            item.strongMatch = matchSignals.strongMatch;
            item.weakMatch = matchSignals.weakMatch;
        }

        // Deduplicación: por URL exacta + Jaccard similarity en títulos
        const seen = new Set();
        const uniqueResults = [];
        for (const item of cleanedResults) {
            // Dedup by exact URL first
            const urlKey = (item.url || '').split('?')[0].toLowerCase();
            if (urlKey && seen.has(urlKey)) continue;
            if (urlKey) seen.add(urlKey);

            // Jaccard similarity on title tokens
            const tokensI = new Set(item.title.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(t => t.length > 2));
            const isDuplicate = uniqueResults.some(u => {
                const sameStore = String(u.source || '').trim().toLowerCase() === String(item.source || '').trim().toLowerCase();
                if (!sameStore) {
                    return false;
                }
                const tokensU = new Set(u.title.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(t => t.length > 2));
                const intersection = [...tokensI].filter(t => tokensU.has(t)).length;
                const union = new Set([...tokensI, ...tokensU]).size;
                return union > 0 && (intersection / union) > 0.70;
            });
            if (!isDuplicate) {
                uniqueResults.push(item);
            }
        }

        // --- FILTRO ANTI-ACCESORIOS: Detectar si la búsqueda es un producto principal caro ---
        const mainProductKeywords = /consola|laptop|iphone|samsung|galaxy|macbook|ipad|playstation|xbox|nintendo|switch|televisor|tv |pantalla|refrigerador|lavadora|aire acondicionado|pc gamer|computadora|airpods|watch|pixel|fold|flip/i;
        const accessoryKeywords = /funda|case|protector|mica|cristal|templado|cable|cargador|soporte|base|skin|sticker|grip|joystick|thumb|screen protector|película|pelicula|correa|strap|bolsa|estuche|adaptador|hub|dock(?!ing)|batería|battery|replacement|reemplazo|vidrio|silicona|silicone|tpu|rubber|cover|carcasa|cubierta|holder|mount|stand|sleeve|pouch|cleaning|limpieza|ear.?tip|ear.?bud|ear.?pad|ear.?cushion|hook/i;
        const isMainProductSearch = mainProductKeywords.test(searchQuery);

        // Marcar cada item como accesorio o no
        if (isMainProductSearch) {
            for (const item of uniqueResults) {
                const titleLower = (item.title || '').toLowerCase();
                const price = item.price != null ? parseFloat(item.price) : null;
                item._isAccessory = accessoryKeywords.test(titleLower);
            }
            console.log(`[Anti - Accesorio] ${uniqueResults.filter(i => !i._isAccessory).length} productos principales, ${uniqueResults.filter(i => i._isAccessory).length} accesorios marcados`);
        }

        // Ordenamos: productos principales por precio, luego accesorios por precio
        const hasLocation = Boolean(lat && lng && radius !== 'global');
        const sortedResults = uniqueResults.sort((a, b) => {
            // Tier sort: main products first, accessories last
            if (isMainProductSearch) {
                if (a._isAccessory && !b._isAccessory) return 1;
                if (!a._isAccessory && b._isAccessory) return -1;
            }

            const aConditionBoost = conditionMode === 'used'
                ? ((a.conditionLabel === 'used' || a.conditionLabel === 'refurbished') ? -900 : 700)
                : conditionMode === 'new'
                    ? (a.conditionLabel === 'new' ? -220 : 350)
                    : (a.conditionLabel === 'refurbished' ? -120 : a.conditionLabel === 'used' ? -80 : 0);
            const bConditionBoost = conditionMode === 'used'
                ? ((b.conditionLabel === 'used' || b.conditionLabel === 'refurbished') ? -900 : 700)
                : conditionMode === 'new'
                    ? (b.conditionLabel === 'new' ? -220 : 350)
                    : (b.conditionLabel === 'refurbished' ? -120 : b.conditionLabel === 'used' ? -80 : 0);
            const aTrustPenalty = storeTrustService.getTrustPenalty(a, {
                conditionMode,
                expensiveProductSearch: isMainProductSearch,
                strongMatch: Boolean(a.strongMatch),
                weakMatch: Boolean(a.weakMatch)
            });
            const bTrustPenalty = storeTrustService.getTrustPenalty(b, {
                conditionMode,
                expensiveProductSearch: isMainProductSearch,
                strongMatch: Boolean(b.strongMatch),
                weakMatch: Boolean(b.weakMatch)
            });
            const aSuspiciousPenalty = a.isSuspicious ? 3000 : 0;
            const bSuspiciousPenalty = b.isSuspicious ? 3000 : 0;
            const aMatchPenalty = a.weakMatch ? (isMainProductSearch ? 900 : 320) : (a.strongMatch ? -120 : 0);
            const bMatchPenalty = b.weakMatch ? (isMainProductSearch ? 900 : 320) : (b.strongMatch ? -120 : 0);

            const aPrice = a.price == null ? Infinity : parseFloat(a.price);
            const bPrice = b.price == null ? Infinity : parseFloat(b.price);

            if (hasLocation) {
                const aBoost = a.isLocalStore ? Math.min(aPrice * 0.10, 150) : 0;
                const bBoost = b.isLocalStore ? Math.min(bPrice * 0.10, 150) : 0;
                return (aPrice - aBoost + aConditionBoost + aTrustPenalty + aMatchPenalty + aSuspiciousPenalty) - (bPrice - bBoost + bConditionBoost + bTrustPenalty + bMatchPenalty + bSuspiciousPenalty);
            } else {
                return (aPrice + aConditionBoost + aTrustPenalty + aMatchPenalty + aSuspiciousPenalty) - (bPrice + bConditionBoost + bTrustPenalty + bMatchPenalty + bSuspiciousPenalty);
            }
        });

        // --- DIVERSIDAD: Round-robin por tienda (máx 3 por tienda) ---
        const MAX_PER_STORE = 4;
        const MAX_RESULTS = 18;
        const storeCount = {};
        const topResults = [];
        for (const item of sortedResults) {
            if (topResults.length >= MAX_RESULTS) break;
            const storeKey = (item.source || 'Desconocida').toLowerCase().replace(/[^a-záéíóúñ0-9]/g, '');
            storeCount[storeKey] = (storeCount[storeKey] || 0) + 1;
            if (storeCount[storeKey] <= MAX_PER_STORE) {
                topResults.push(item);
            }
        }
        // Completar con los restantes sin importar tienda si no se llenó
        if (topResults.length < MAX_RESULTS) {
            for (const item of sortedResults) {
                if (topResults.length >= MAX_RESULTS) break;
                if (!topResults.includes(item)) topResults.push(item);
            }
        }

        // 5. Inyectar links de afiliados (o dejarlos como Loss Leaders)
        const finalProducts = topResults.map(product => {
            return {
                titulo: product.title,
                precio: product.price,            // null for local stores
                tienda: product.source,
                imagen: product.image,
                urlOriginal: product.url,
                urlMonetizada: affiliateManager.generateAffiliateLink(product.url, product.source),
                isLocalStore: product.isLocalStore || false,
                localDetails: product.localDetails || null,
                cupon: llmAnalysis.cupon || null,
                conditionLabel: product.conditionLabel || 'new',
                isC2C: Boolean(product.isC2C),
                isSuspicious: Boolean(product.isSuspicious),
                storeCanonical: product.storeTrust?.canonicalStore || 'desconocida',
                storeTier: product.storeTrust?.storeTier || 2,
                trustLabel: product.storeTrust?.trustLabel || 'Marketplace',
                sellerModel: product.storeTrust?.sellerModel || 'marketplace',
                riskFlags: product.storeTrust?.riskFlags || [],
                matchScore: Number(product.matchScore || 0),
                strongMatch: Boolean(product.strongMatch),
                weakMatch: Boolean(product.weakMatch)
            };
        });

        // Historial de precios: comparar con snapshots previos por URL
        const priceHistoryMap = await cacheService.getPriceHistoryMap(searchQuery, radius, lat, lng, finalProducts, countryCode);
        const productsWithTrend = finalProducts.map((product) => {
            const normalizedUrl = cacheService.normalizeProductUrl(product.urlMonetizada || product.urlOriginal);
            const productHistory = priceHistoryMap[normalizedUrl] || [];
            const previous = productHistory[0];

            const currentPrice = typeof product.precio === 'number'
                ? product.precio
                : parseFloat(String(product.precio || '').replace(/[^0-9.]/g, ''));

            const dealVerdict = buildDealVerdict(currentPrice, productHistory);

            if (!previous || !Number.isFinite(currentPrice) || currentPrice <= 0) {
                return {
                    ...product,
                    ...(dealVerdict ? { dealVerdict } : {})
                };
            }

            const previousPrice = Number(previous.price);
            const delta = Number((currentPrice - previousPrice).toFixed(2));
            const absDelta = Math.abs(delta);
            const direction = absDelta < 1 ? 'same' : (delta < 0 ? 'down' : 'up');
            const percent = previousPrice > 0 ? Number(((absDelta / previousPrice) * 100).toFixed(1)) : 0;

            return {
                ...product,
                ...(dealVerdict ? { dealVerdict } : {}),
                priceTrend: {
                    direction,
                    delta: absDelta,
                    percent,
                    previousPrice,
                    comparedAt: previous.created_at,
                    history: productHistory.slice(0, 7).map(h => ({ price: Number(h.price), date: h.created_at }))
                }
            };
        });

        // NUEVO: Guardar en Caché
        await cacheService.saveToCache(searchQuery, radius, lat, lng, productsWithTrend, countryCode);
        await cacheService.savePriceSnapshot(searchQuery, radius, lat, lng, productsWithTrend, countryCode);

        // FIX #6: Unificar logging - solo loguear en searches (no en rate_limits para autenticados)
        // Las búsquedas anónimas ya se loguearon arriba en rate_limits
        if (userId && supabase) {
            supabase.from('searches').insert({
                user_id: userId,
                query: searchQuery,
                created_at: new Date().toISOString()
            }).then(() => { }).catch(e => console.error('[Search Logging] Error:', e.message));
        }

        // NUEVO: Inyectar Cupones Universales Conocidos
        const finalProductsConCupones = productsWithTrend.map(product => {
            const tienda = (product.tienda || product.fuente || '').toLowerCase();
            let injectedCoupon = null;
            let couponDetails = null;
            
            // Si el LLM detectó un cupón universal validado, usarlo
            if (llmAnalysis.cupon && llmAnalysis.cupon.length > 2) {
                injectedCoupon = llmAnalysis.cupon;
                couponDetails = "Cupón sugerido por IA";
            } else {
                // Lookup active universal coupons for this specific store
                const storeCoupons = couponService.getCouponsForStore(tienda, countryCode);
                if (storeCoupons && storeCoupons.length > 0) {
                    injectedCoupon = storeCoupons[0].code;
                    couponDetails = storeCoupons[0].discount;
                }
            }

            if (injectedCoupon && !product.cupon) {
                product.cupon = injectedCoupon;
                product.couponDetails = couponDetails;
            }
            return product;
        });

        // Clear master timeout at the end
        clearTimeout(timeoutId);

        // 6. Devolver respuesta estandarizada al frontend
        logSearchCostMetrics('search.results', costMetrics, {
            query: searchQuery,
            userId: Boolean(userId),
            resultCount: finalProductsConCupones.length
        });
        return res.json({
            tipo_respuesta: 'resultados',
            intencion_detectada: {
                busqueda: searchQuery,
                condicion: llmAnalysis.condition,
                modo_condicion: conditionMode
            },
            region: {
                country: countryCode,
                currency: regionCfg.currency,
                locale: regionCfg.locale,
                label: regionCfg.regionLabel
            },
            top_5_baratos: finalProductsConCupones,
            sugerencias: buildFallbackSuggestions(searchQuery, llmAnalysis.alternativeQueries),
            advertencia_uso: usageWarning,
            lumu_coins_awarded: (userId && finalProductsConCupones.length > 2) ? 1 : 0
        });

    } catch (error) {
        // Clear timeout on error
        if (typeof timeoutId !== 'undefined') clearTimeout(timeoutId);
        
        console.error('🔥🔥🔥 ERROR FATAL en /buscar:', error.stack || error);
        try {
            logSearchCostMetrics('search.error', costMetrics, {
                query,
                userId: Boolean(userId),
                error: error.message
            });
        } catch { }
        
        // No exponer stack trace en producción
        const isDev = process.env.NODE_ENV !== 'production';
        res.status(500).json({ 
            error: 'Ocurrió un error al buscar las mejores ofertas. Si estás probando en local, asegúrate de configurar las variables de entorno.',
            ...(isDev && { details: error.message, stack: error.stack })
        });
    }
};

// NUEVO: Endpoint para B2B Bulk Search (Plan Revendedor)
exports.bulkSearch = async (req, res) => {
    let bulkCostMetrics = createSearchCostMetrics();
    try {
        const { queries, radius, lat, lng } = req.body;
        // Use verified userId from auth middleware (JWT)
        const userId = req.userId || null;
        if (!userId) {
            return res.status(401).json({ error: 'Debes iniciar sesión para usar el Plan Revendedor.' });
        }
        if (!supabase) {
            return res.status(503).json({ error: 'Base de datos no disponible' });
        }
        const { data: profile } = await supabase.from('profiles').select('plan, is_premium').eq('id', userId).single();
        if (!profile || (!profile.is_premium && profile.plan !== 'b2b')) {
            return res.status(402).json({ error: 'Esta función es exclusiva del Plan Revendedor VIP ($199 MXN/mes). Actualiza tu cuenta para acceder.', upgrade_required: true });
        }

        // --- Verificación de Límite Mensual B2B ---
        let reqLimit = 500;
        let queryDate = new Date();
        queryDate.setDate(1);
        queryDate.setHours(0, 0, 0, 0);

        const { count, error } = await supabase.from('searches')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .gte('created_at', queryDate.toISOString());

        let usageWarning = null;
        if (!error) {
            if (count >= reqLimit) {
                return res.status(402).json({ error: `Límite mensual B2B alcanzado(${reqLimit} búsquedas).Por favor espera a tu siguiente ciclo para más lotes.`, upgrade_required: false });
            }
            if (count >= reqLimit * 0.9) {
                usageWarning = `⚠️ Límite mensual al ${Math.floor((count / reqLimit) * 100)}% (${count}/${reqLimit}).`;
            }
        }

        // Hard limit: max 5 queries per request (Vercel 60s timeout)
        const queriesToProcess = queries.slice(0, 5);

        console.log(`[B2B BULK SEARCH] Procesando lote de ${queriesToProcess.length} artículos en paralelo...`);

        // Process all queries in parallel with individual timeouts
        const QUERY_TIMEOUT = 10000; // 10s per query
        const bulkPromises = queriesToProcess.map(async (q) => {
            try {
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Timeout')), QUERY_TIMEOUT)
                );

                const searchPromise = (async () => {
                    bulkCostMetrics.llmGenerateCalls += 1;
                    if (supabase) bulkCostMetrics.llmEmbeddingCalls += 1;
                    const llmAnalysis = await llmService.analyzeMessage(q, []);
                    const searchQuery = llmAnalysis.searchQuery || q;

                    // Cache check first
                    const cachedResults = await cacheService.getCachedResults(searchQuery, radius, lat, lng);
                    if (cachedResults && cachedResults[0]) {
                        bulkCostMetrics.cacheHit = true;
                        return { ...cachedResults[0], desde_cache: true };
                    }

                    // Real search
                    bumpProviderCostMetrics(bulkCostMetrics, { intentType: llmAnalysis.intent_type, radius, lat, lng });
                    const shoppingResults = await shoppingService.searchGoogleShopping(searchQuery, radius, lat, lng);
                    if (shoppingResults.length > 0) {
                        const sortedResults = shoppingResults.sort((a, b) => {
                            if (a.price == null) return 1;
                            if (b.price == null) return -1;
                            return a.price - b.price;
                        });
                        const cheapest = sortedResults[0];
                        const topResult = {
                            titulo: cheapest.title,
                            precio: cheapest.price,
                            tienda: cheapest.source,
                            imagen: cheapest.image,
                            urlOriginal: cheapest.url,
                            urlMonetizada: affiliateManager.generateAffiliateLink(cheapest.url, cheapest.source),
                            desde_cache: false
                        };
                        // Save to cache async
                        cacheService.saveToCache(searchQuery, radius, lat, lng, [topResult]).catch(() => { });
                        return topResult;
                    }
                    return null;
                })();

                const result = await Promise.race([searchPromise, timeoutPromise]);
                return { query_original: q, encontrado: !!result, mejor_oferta: result };
            } catch (err) {
                console.error(`Error procesando item B2B "${q}": `, err.message);
                return { query_original: q, encontrado: false, error: err.message === 'Timeout' ? 'Tiempo agotado' : 'Fallo al extraer datos' };
            }
        });

        const bulkResults = await Promise.all(bulkPromises);

        // Charge usage AFTER successful processing (not before)
        const successCount = bulkResults.filter(r => r.encontrado).length;
        if (supabase && successCount > 0) {
            const inserts = bulkResults
                .filter(r => r.encontrado)
                .map(r => ({ user_id: userId, query: r.query_original }));
            supabase.from('searches').insert(inserts).then(() => { }).catch(e => console.error('Bulk insert error:', e));
        }

        logSearchCostMetrics('bulk.results', bulkCostMetrics, {
            userId: Boolean(userId),
            requestedCount: Array.isArray(queries) ? queries.length : 0,
            processedCount: bulkResults.length,
            successCount
        });
        return res.json({
            lote_procesado: bulkResults.length,
            resultados: bulkResults,
            ...(usageWarning ? { usageWarning } : {})
        });

    } catch (error) {
        console.error('Error en /bulk-search:', error);
        try {
            logSearchCostMetrics('bulk.error', bulkCostMetrics, {
                error: error.message
            });
        } catch { }
        res.status(500).json({ error: 'Error del servidor en bulk search.' });
    }
};

exports.claimReward = async (req, res) => {
    try {
        const userId = req.userId || null;
        const BONUS_SEARCHES = 3;
        const CLAIM_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour between claims
        const rewardedAdTagUrl = process.env.REWARDED_AD_TAG_URL || '';

        if (!rewardedAdTagUrl.trim()) {
            return res.status(409).json({ error: 'Las búsquedas extra por anuncio no están disponibles actualmente.' });
        }

        if (!supabase) {
            return res.json({ success: true, bonus: BONUS_SEARCHES, msg: 'Modo local (sin Supabase)' });
        }

        // SECURITY FIX SEC-1: Rate-limit claims to 1 per hour per user/IP
        const ip = req.headers['x-vercel-forwarded-for']?.split(',')[0]?.trim() || req.headers['x-real-ip'] || req.headers['x-forwarded-for']?.split(',').pop()?.trim() || req.ip || 'unknown';
        const claimKey = userId ? `claim:user:${userId}` : `claim:ip:${ip}`;
        const oneHourAgo = new Date(Date.now() - CLAIM_COOLDOWN_MS).toISOString();

        try {
            const { count, error: claimCheckErr } = await supabase
                .from('rate_limits')
                .select('*', { count: 'exact', head: true })
                .eq('ip', claimKey)
                .gte('created_at', oneHourAgo);

            if (!claimCheckErr && count > 0) {
                return res.status(429).json({
                    error: 'Ya reclamaste búsquedas extra recientemente. Intenta de nuevo en 1 hora.',
                    retry_after: 3600
                });
            }
        } catch (e) {
            console.warn('[ClaimReward] Rate-limit check failed, allowing:', e.message);
        }

        // Log this claim (fire & forget)
        supabase.from('rate_limits').insert({ ip: claimKey, created_at: new Date().toISOString() }).then(() => {}).catch(() => {});

        if (userId) {
            // BUG FIX: Instead of deleting from 'searches' (which reduces Lumu Coins),
            // insert bonus credit entries into rate_limits that the rate limiter can count.
            // The searchProduct rate limiter will subtract these credits from the used count.
            const creditEntries = [];
            for (let i = 0; i < BONUS_SEARCHES; i++) {
                creditEntries.push({ ip: `bonus:user:${userId}`, created_at: new Date().toISOString() });
            }
            await supabase.from('rate_limits').insert(creditEntries);
        } else {
            // Anonymous user
            const ip = req.headers['x-vercel-forwarded-for']?.split(',')[0]?.trim() || req.headers['x-real-ip'] || req.headers['x-forwarded-for']?.split(',').pop()?.trim() || req.ip || 'unknown';
            const searchIpKey = `search:${ip}`;
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);

            const { data: recentLimits } = await supabase
                .from('rate_limits')
                .select('id')
                .eq('ip', searchIpKey)
                .gte('created_at', todayStart.toISOString())
                .order('created_at', { ascending: false })
                .limit(BONUS_SEARCHES);

            if (recentLimits && recentLimits.length > 0) {
                const idsToDelete = recentLimits.map(s => s.id);
                await supabase.from('rate_limits').delete().in('id', idsToDelete);
            }
        }

        return res.json({ success: true, bonus: BONUS_SEARCHES });
    } catch (err) {
        console.error('[Reward] Error:', err);
        return res.status(500).json({ error: 'Error al reclamar recompensa' });
    }
};

// NUEVO: Fase 6 - Lumu Coins (with real 1-hour VIP unlock)
exports.getCoins = async (req, res) => {
    try {
        const userId = req.userId;
        if (!userId) {
            return res.json({ coins: 0, is_premium_temp: false });
        }
        if (!supabase) {
            return res.json({ coins: 0, is_premium_temp: false });
        }

        // Coins = Total de búsquedas válidas realizadas
        const { count, error } = await supabase.from('searches')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId);

        if (error) {
            console.error('[Lumu Coins] Error:', error.message);
            return res.status(500).json({ error: 'Error al obtener monedas' });
        }

        const exactCoins = count || 0;
        const currentCoins = exactCoins % 50;
        const totalVIPUnlocked = Math.floor(exactCoins / 50);

        // SEC-3: Check if temp VIP is currently active (1 hour window)
        const VIP_TEMP_DURATION_MS = 60 * 60 * 1000; // 1 hour
        const { data: profile } = await supabase.from('profiles')
            .select('vip_temp_unlocked_at, vip_temp_last_milestone')
            .eq('id', userId).single();

        const lastUnlock = profile?.vip_temp_unlocked_at ? new Date(profile.vip_temp_unlocked_at).getTime() : 0;
        const isActiveTemp = lastUnlock > 0 && (Date.now() - lastUnlock) < VIP_TEMP_DURATION_MS;
        const timeRemainingMs = isActiveTemp ? VIP_TEMP_DURATION_MS - (Date.now() - lastUnlock) : 0;
        const lastMilestone = Number(profile?.vip_temp_last_milestone || 0);
        const currentMilestone = totalVIPUnlocked;

        // Unlock temp VIP only when the user reaches a NEW 50-search milestone.
        if (currentMilestone > 0 && currentMilestone > lastMilestone) {
            const now = new Date().toISOString();
            await supabase.from('profiles')
                .update({
                    vip_temp_unlocked_at: now,
                    vip_temp_last_milestone: currentMilestone
                })
                .eq('id', userId);

            return res.json({
                total_searches: exactCoins,
                coins: currentCoins,
                is_premium_temp: true,
                vip_temp_remaining_min: 60,
                next_goal: 50
            });
        }

        return res.json({
            total_searches: exactCoins,
            coins: currentCoins,
            is_premium_temp: isActiveTemp,
            vip_temp_remaining_min: isActiveTemp ? Math.ceil(timeRemainingMs / 60000) : 0,
            next_goal: 50
        });

    } catch (err) {
        console.error('[Lumu Coins] TryCatch Error:', err);
        return res.status(500).json({ error: 'Fallo interno' });
    }
};
