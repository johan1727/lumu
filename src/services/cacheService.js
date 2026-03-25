const supabase = require('../config/supabase');
const Redis = require('ioredis');

// --- Configuración Redis Opcional ---
const redisClient = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL) : null;
if (redisClient) {
    redisClient.on('error', (err) => console.error('[Redis Error]', err.message));
    redisClient.on('connect', () => console.log('🟢 Redis conectado exitosamente para caché ultrarrápida'));
}

/**
 * Normaliza query para cache: lowercase, quita acentos, ordena palabras, quita negativos
 * FIX: Mejorar normalización para colisiones como "playstation 5" vs "play station 5"
 */
const normalizeQuery = (query) => {
    return query
        .toLowerCase()
        .trim()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita acentos
        .replace(/\s+-\w+/g, '')                          // quita -filtros negativos
        .replace(/[^a-z0-9\s]/g, '')                      // quita caracteres especiales
        // FIX: Normalizar espacios entre palabras compuestas comunes
        .replace(/playstation/g, 'play station')
        .replace(/xboxone/g, 'xbox one')
        .replace(/macbook/g, 'mac book')
        .replace(/airpods/g, 'air pods')
        .replace(/iphone(\d+)/g, 'iphone $1')
        .replace(/samsung(\w+)/g, 'samsung $1')
        .split(/\s+/)
        .filter(w => w.length > 1)                         // quita palabras de 1 letra
        .sort()                                            // ordena alfabéticamente
        .join(' ');
};

const normalizeCanonicalKey = (value = '') => String(value || '')
    .toLowerCase()
    .trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 160);

/**
 * Genera una key única basada en país, query normalizada, lat, lng y radius
 */
const generateCacheKey = (query, radius, lat, lng, countryCode = 'MX') => {
    let key = `ct_${String(countryCode || 'MX').toUpperCase()}_${normalizeQuery(query)}`;
    if (radius && radius !== 'global') {
        // Truncar lat/lng a 1 decimal (~11 km de precisión) para más cache hits
        const normLat = lat != null ? parseFloat(lat).toFixed(1) : '0';
        const normLng = lng != null ? parseFloat(lng).toFixed(1) : '0';
        key += `_loc_${radius}_${normLat}_${normLng}`;
    }
    return key;
};

const generateCanonicalCacheKey = (canonicalKey, radius, lat, lng, countryCode = 'MX') => {
    const normalizedCanonical = normalizeCanonicalKey(canonicalKey);
    if (!normalizedCanonical) return '';
    let key = `ctc_${String(countryCode || 'MX').toUpperCase()}_${normalizedCanonical}`;
    if (radius && radius !== 'global') {
        const normLat = lat != null ? parseFloat(lat).toFixed(1) : '0';
        const normLng = lng != null ? parseFloat(lng).toFixed(1) : '0';
        key += `_loc_${radius}_${normLat}_${normLng}`;
    }
    return key;
};

const normalizeProductUrl = (url) => {
    if (!url) return '';
    try {
        const parsed = new URL(String(url));
        return `${parsed.origin}${parsed.pathname}`.toLowerCase();
    } catch {
        return String(url).split('?')[0].toLowerCase();
    }
};

/**
 * In-memory LRU cache layer (avoids Supabase round-trips for hot queries)
 * Max 500 entries, auto-evicts oldest. Persists across requests in same serverless instance.
 * FIX: Agregar límite por instancia serverless y TTL más agresivo
 */
const RAM_CACHE_MAX = 1000;
const RAM_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutos
const _ramCache = new Map();
const _ramCacheAccessTimes = new Map(); // Para LRU tracking

function ramCacheGet(key) {
    const entry = _ramCache.get(key);
    if (!entry) return null;
    
    const now = Date.now();
    if (now - entry.ts > RAM_CACHE_TTL_MS) {
        _ramCache.delete(key);
        _ramCacheAccessTimes.delete(key);
        return null;
    }
    
    // Update access time for LRU
    _ramCacheAccessTimes.set(key, now);
    return entry.data;
}

function ramCacheSet(key, data) {
    const now = Date.now();
    
    // Evict oldest if full (LRU eviction)
    if (_ramCache.size >= RAM_CACHE_MAX) {
        let oldestKey = null;
        let oldestTime = Infinity;
        
        for (const [k, accessTime] of _ramCacheAccessTimes.entries()) {
            if (accessTime < oldestTime) {
                oldestTime = accessTime;
                oldestKey = k;
            }
        }
        
        if (oldestKey) {
            _ramCache.delete(oldestKey);
            _ramCacheAccessTimes.delete(oldestKey);
        }
    }
    
    _ramCache.set(key, { data, ts: now });
    _ramCacheAccessTimes.set(key, now);
    ramCacheCleanup();
}

// Periodic cleanup (10% de probabilidad en cada set)
function ramCacheCleanup() {
    if (Math.random() < 0.1) {
        const now = Date.now();
        for (const [key, entry] of _ramCache.entries()) {
            if (now - entry.ts > RAM_CACHE_TTL_MS) {
                _ramCache.delete(key);
                _ramCacheAccessTimes.delete(key);
            }
        }
    }
}

/**
 * Busca resultados en caché: primero RAM, luego Supabase (24 horas TTL)
 */
function getMaxCacheHours(queryKey = '', priceVolatility = 'medium') {
    if (priceVolatility === 'high') return 6;
    if (priceVolatility === 'low') return 48;
    const isGenericQuery = String(queryKey || '').split(' ').length <= 3;
    return isGenericQuery ? 48 : 24;
}

async function getCachedResultsByKey(queryKey, priceVolatility = 'medium') {
    if (!queryKey) return null;

    const ramHit = ramCacheGet(queryKey);
    if (ramHit) {
        console.log(`[Cache RAM Hit] Resultados instantáneos para: ${queryKey}`);
        return ramHit;
    }

    if (redisClient) {
        try {
            const redisHitText = await redisClient.get(`lumu:search:${queryKey}`);
            if (redisHitText) {
                console.log(`[Cache Redis Hit] Resultados ultrarrápidos para: ${queryKey}`);
                const redisData = JSON.parse(redisHitText);
                ramCacheSet(queryKey, redisData);
                return redisData;
            }
        } catch (e) {
            console.error('[Redis Get Error]:', e.message);
        }
    }

    if (!supabase) return null;

    try {
        const { data, error } = await supabase
            .from('search_cache')
            .select('results, created_at')
            .eq('query_key', queryKey)
            .single();

        if (error || !data) return null;

        const cacheTime = new Date(data.created_at).getTime();
        const now = new Date().getTime();
        const hoursDiff = (now - cacheTime) / (1000 * 60 * 60);
        const maxHours = getMaxCacheHours(queryKey, priceVolatility);

        if (hoursDiff < maxHours) {
            console.log(`[Cache Supabase Hit] Resultados para: ${queryKey} (${Math.round(hoursDiff)}h old, max ${maxHours}h)`);
            ramCacheSet(queryKey, data.results);
            return data.results;
        }

        console.log(`[Cache Expired] Los resultados para ${queryKey} tienen más de ${maxHours}h.`);
        return null;
    } catch (err) {
        console.error('Error buscando en la caché de Supabase:', err.message);
        return null;
    }
}

exports.getCachedResults = async (query, radius, lat, lng, countryCode = 'MX', canonicalKey = '', priceVolatility = 'medium') => {
    const queryKey = generateCacheKey(query, radius, lat, lng, countryCode);
    const directHit = await getCachedResultsByKey(queryKey, priceVolatility);
    if (directHit) return directHit;

    const canonicalCacheKey = generateCanonicalCacheKey(canonicalKey, radius, lat, lng, countryCode);
    if (!canonicalCacheKey) return null;
    return getCachedResultsByKey(canonicalCacheKey, priceVolatility);
};

/**
 * Guarda resultados en Supabase (haciendo un upsert si ya existía la key)
 */
async function persistCacheKey(queryKey, results, priceVolatility = 'medium') {
    if (!queryKey) return;

    ramCacheSet(queryKey, results);

    if (redisClient) {
        try {
            await redisClient.set(`lumu:search:${queryKey}`, JSON.stringify(results), 'EX', 43200);
        } catch(e) {
            console.error('[Redis Set Error]:', e.message);
        }
    }

    if (!supabase) return;

    try {
        const { error } = await supabase
            .from('search_cache')
            .upsert({
                query_key: queryKey,
                results: results,
                created_at: new Date().toISOString()
            }, { onConflict: 'query_key' });

        if (error) {
            console.error('Error al guardar en caché:', error.message);
        } else if (Math.random() < 0.05) {
            exports.cleanExpiredCache();
        }
    } catch (err) {
        console.error('Excepción al guardar en caché Supabase:', err.message);
    }
}

exports.saveToCache = async (query, radius, lat, lng, results, countryCode = 'MX', canonicalKey = '', priceVolatility = 'medium') => {
    if (!supabase) return;

    const queryKey = generateCacheKey(query, radius, lat, lng, countryCode);
    await persistCacheKey(queryKey, results, priceVolatility);

    const canonicalCacheKey = generateCanonicalCacheKey(canonicalKey, radius, lat, lng, countryCode);
    if (canonicalCacheKey) {
        await persistCacheKey(canonicalCacheKey, results, priceVolatility);
    }
    console.log(`[Cache Saved] Resultados guardados para: ${queryKey}${canonicalCacheKey ? ` y ${canonicalCacheKey}` : ''}`);
};

/**
 * Función de limpieza automática: borra registros con más de 48 horas
 */
exports.cleanExpiredCache = async () => {
    if (!supabase) return;

    try {
        // Obtenemos la fecha de hace 96 horas (4 días — allows 72h cache + buffer)
        const expirationDate = new Date();
        expirationDate.setHours(expirationDate.getHours() - 96);

        const { error, count } = await supabase
            .from('search_cache')
            .delete({ count: 'exact' })
            .lt('created_at', expirationDate.toISOString());

        if (error) {
            console.error('Error limpiando caché vieja:', error.message);
        } else if (count && count > 0) {
            console.log(`🧹 Caché limpia: se borraron ${count} registros expirados.`);
        }
    } catch (err) {
        console.error('Excepción al limpiar caché:', err.message);
    }
};

/**
 * Guarda snapshot de precios para historial/tendencia
 */
exports.savePriceSnapshot = async (query, radius, lat, lng, products = [], countryCode = 'MX') => {
    if (!supabase || !Array.isArray(products) || products.length === 0) return;

    const queryKey = generateCacheKey(query, radius, lat, lng, countryCode);
    const snapshotRows = products
        .map((product) => {
            const rawPrice = product.precio;
            const price = typeof rawPrice === 'number'
                ? rawPrice
                : parseFloat(String(rawPrice || '').replace(/[^0-9.]/g, ''));
            const url = product.urlMonetizada || product.urlOriginal;
            if (!url || !Number.isFinite(price) || price <= 0) return null;

            return {
                query_key: queryKey,
                normalized_url: normalizeProductUrl(url),
                product_title: product.titulo || null,
                store_name: product.tienda || null,
                price: Number(price.toFixed(2))
            };
        })
        .filter(Boolean)
        .slice(0, 30);

    if (snapshotRows.length === 0) return;

    try {
        const { error } = await supabase.from('price_history').insert(snapshotRows);
        if (error) {
            console.error('Error guardando snapshot de precios:', error.message);
        }
    } catch (err) {
        console.error('Excepción guardando snapshot de precios:', err.message);
    }
};

/**
 * Crea un mapa de tendencias por URL normalizada
 */
exports.getPriceHistoryMap = async (query, radius, lat, lng, products = [], countryCode = 'MX') => {
    if (!supabase || !Array.isArray(products) || products.length === 0) return {};

    const queryKey = generateCacheKey(query, radius, lat, lng, countryCode);
    const normalizedUrls = products
        .map((p) => normalizeProductUrl(p.urlMonetizada || p.urlOriginal))
        .filter(Boolean);

    if (normalizedUrls.length === 0) return {};

    try {
        const { data, error } = await supabase
            .from('price_history')
            .select('normalized_url, price, created_at')
            .eq('query_key', queryKey)
            .in('normalized_url', [...new Set(normalizedUrls)])
            .gte('created_at', new Date(Date.now() - (30 * 24 * 60 * 60 * 1000)).toISOString())
            .order('created_at', { ascending: false })
            .limit(600);

        if (error || !data) return {};

        const historyMap = {};
        for (const row of data) {
            if (!historyMap[row.normalized_url]) {
                historyMap[row.normalized_url] = [];
            }
            historyMap[row.normalized_url].push(row);
        }
        return historyMap;
    } catch (err) {
        console.error('Error consultando historial de precios:', err.message);
        return {};
    }
};

exports.normalizeProductUrl = normalizeProductUrl;
exports.generateCacheKey = generateCacheKey;
exports.generateCanonicalCacheKey = generateCanonicalCacheKey;
exports.normalizeCanonicalKey = normalizeCanonicalKey;
/**
 * LLM Response Cache: Reduce Gemini API costs by caching analysis results
 * TTL: 7 days for stable queries, 24h for volatile ones
 */
const LLM_CACHE_TTL_STABLE = 7 * 24 * 60 * 60;
const LLM_CACHE_TTL_VOLATILE = 24 * 60 * 60;

function generateLLMCacheKey(userText, countryCode = 'MX') {
    const normalized = normalizeQuery(userText);
    return `llm:${String(countryCode || 'MX').toUpperCase()}:${normalized}`;
}

exports.getCachedLLMResponse = async (userText, countryCode = 'MX') => {
    if (!userText) return null;
    const cacheKey = generateLLMCacheKey(userText, countryCode);

    const ramHit = ramCacheGet(cacheKey);
    if (ramHit) {
        console.log(`[LLM Cache RAM Hit] Análisis instantáneo para: "${String(userText).slice(0, 40)}..."`);
        return ramHit;
    }

    if (redisClient) {
        try {
            const redisHit = await redisClient.get(`lumu:${cacheKey}`);
            if (redisHit) {
                console.log(`[LLM Cache Redis Hit] Análisis ultrarrápido para: "${String(userText).slice(0, 40)}..."`);
                const parsed = JSON.parse(redisHit);
                ramCacheSet(cacheKey, parsed);
                return parsed;
            }
        } catch (e) {
            console.error('[Redis LLM Get Error]:', e.message);
        }
    }

    return null;
};

exports.saveLLMResponse = async (userText, llmResponse, countryCode = 'MX') => {
    if (!userText || !llmResponse) return;
    const cacheKey = generateLLMCacheKey(userText, countryCode);

    ramCacheSet(cacheKey, llmResponse);

    if (redisClient) {
        try {
            const isVolatile = llmResponse.queryType === 'speculative' || llmResponse.isSpeculative;
            const ttl = isVolatile ? LLM_CACHE_TTL_VOLATILE : LLM_CACHE_TTL_STABLE;
            await redisClient.set(`lumu:${cacheKey}`, JSON.stringify(llmResponse), 'EX', ttl);
            console.log(`[LLM Cache Saved] Análisis cacheado (TTL=${ttl}s) para: "${String(userText).slice(0, 40)}..."`);
        } catch (e) {
            console.error('[Redis LLM Set Error]:', e.message);
        }
    }
};

exports.getPopularQueries = async (limit = 50) => {
    if (!supabase) return [];
    try {
        const since = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000)).toISOString();
        const { data, error } = await supabase
            .from('searches')
            .select('query, created_at')
            .gte('created_at', since)
            .order('created_at', { ascending: false })
            .limit(5000);

        if (error || !Array.isArray(data)) return [];

        const counter = new Map();
        data.forEach(row => {
            const normalized = normalizeQuery(row.query || '');
            if (!normalized) return;
            counter.set(normalized, (counter.get(normalized) || 0) + 1);
        });

        return [...counter.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([query, count]) => ({ query, count }));
    } catch (err) {
        console.error('Error obteniendo queries populares:', err.message);
        return [];
    }
};
