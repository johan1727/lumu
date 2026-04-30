const supabase = require('../config/supabase');
const cacheService = require('./cacheService');
const { z } = require('zod');

// Zod schema for LLM prediction response
const buyTimingPredictionSchema = z.object({
  recommendation: z.enum(['buy_now', 'wait', 'uncertain']),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().max(500),
  pricePercentile: z.number().min(0).max(100),
  typicalDropDays: z.number().min(0).optional(),
  nextDropEstimate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  urgencyLevel: z.enum(['high', 'medium', 'low']),
  factors: z.array(z.string().max(200)).max(5).optional()
});

// Minimum data points required for prediction
const MIN_HISTORY_DAYS = 7;
const MIN_PRICE_POINTS = 5;

// Cache prediction for 6 hours
const PREDICTION_CACHE_HOURS = 6;

/**
 * Generate cache key for buy timing prediction
 */
function generatePredictionCacheKey(query, productUrl, countryCode) {
  const normalizedQuery = String(query || '').toLowerCase().trim().slice(0, 100);
  const urlHash = productUrl 
    ? Buffer.from(productUrl).toString('base64').slice(0, 20)
    : 'no_url';
  return `bt_${countryCode}_${normalizedQuery}_${urlHash}`;
}

/**
 * Check RAM/Redis cache for prediction
 */
async function getCachedPrediction(cacheKey) {
  // Check RAM cache via cacheService mechanism
  const ramCache = global._buyTimingCache?.get?.(cacheKey);
  if (ramCache && ramCache.expires > Date.now()) {
    return ramCache.data;
  }
  return null;
}

/**
 * Save prediction to cache
 */
async function cachePrediction(cacheKey, prediction) {
  if (!global._buyTimingCache) {
    global._buyTimingCache = new Map();
  }
  global._buyTimingCache.set(cacheKey, {
    data: prediction,
    expires: Date.now() + (PREDICTION_CACHE_HOURS * 60 * 60 * 1000)
  });
  
  // Clean old entries if cache too big
  if (global._buyTimingCache.size > 1000) {
    const now = Date.now();
    for (const [key, value] of global._buyTimingCache.entries()) {
      if (value.expires < now) {
        global._buyTimingCache.delete(key);
      }
    }
  }
}

/**
 * Fetch price history from Supabase
 */
async function fetchPriceHistory(query, productUrl, countryCode) {
  if (!supabase) return null;
  
  try {
    const queryPattern = productUrl 
      ? `%${productUrl}%`
      : `%${cacheService.generateCacheKey(query, 'global', null, null, countryCode).replace(/[%_]/g, '')}%`;
    
    const { data, error } = await supabase
      .from('price_history')
      .select('normalized_url, product_title, store_name, price, created_at')
      .ilike(productUrl ? 'normalized_url' : 'query_key', queryPattern)
      .gte('created_at', new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: true })
      .limit(1000);
    
    if (error) {
      console.error('[BuyTiming] DB error:', error.message);
      return null;
    }
    
    return data;
  } catch (err) {
    console.error('[BuyTiming] Error fetching history:', err);
    return null;
  }
}

/**
 * Calculate price statistics and patterns
 */
function analyzePriceHistory(rawHistory) {
  if (!rawHistory || rawHistory.length < MIN_PRICE_POINTS) {
    return { insufficient: true, reason: 'insufficient_data' };
  }
  
  // Group by product URL
  const productGroups = {};
  for (const row of rawHistory) {
    const key = row.normalized_url;
    if (!productGroups[key]) {
      productGroups[key] = {
        url: key,
        title: row.product_title || 'Producto',
        store: row.store_name || 'Desconocida',
        prices: []
      };
    }
    productGroups[key].prices.push({
      price: parseFloat(row.price),
      date: row.created_at
    });
  }
  
  // Find product with most data points (likely the main one)
  const products = Object.values(productGroups).sort((a, b) => b.prices.length - a.prices.length);
  const mainProduct = products[0];
  
  if (mainProduct.prices.length < MIN_PRICE_POINTS) {
    return { insufficient: true, reason: 'insufficient_data' };
  }
  
  // Sort by date
  const sortedPrices = mainProduct.prices.sort((a, b) => 
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  
  const prices = sortedPrices.map(p => p.price);
  const currentPrice = prices[prices.length - 1];
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
  
  // Calculate percentiles
  const sortedUnique = [...new Set(prices)].sort((a, b) => a - b);
  const currentPercentile = (sortedUnique.indexOf(currentPrice) / sortedUnique.length) * 100;
  
  // Detect drops (price decreases > 3%)
  const drops = [];
  for (let i = 1; i < sortedPrices.length; i++) {
    const prev = sortedPrices[i - 1].price;
    const curr = sortedPrices[i].price;
    const drop = (prev - curr) / prev;
    if (drop > 0.03) {
      drops.push({
        date: sortedPrices[i].date,
        prevPrice: prev,
        newPrice: curr,
        dropPercent: drop * 100
      });
    }
  }
  
  // Calculate days between drops
  let typicalDropDays = null;
  if (drops.length >= 2) {
    const dropIntervals = [];
    for (let i = 1; i < drops.length; i++) {
      const days = (new Date(drops[i].date) - new Date(drops[i - 1].date)) / (1000 * 60 * 60 * 24);
      dropIntervals.push(days);
    }
    typicalDropDays = Math.round(dropIntervals.reduce((a, b) => a + b, 0) / dropIntervals.length);
  }
  
  // Calculate volatility (coefficient of variation)
  const stdDev = Math.sqrt(prices.reduce((sq, n) => sq + Math.pow(n - avgPrice, 2), 0) / prices.length);
  const volatility = stdDev / avgPrice;
  
  // Determine volatility level
  let volatilityLevel = 'low';
  if (volatility > 0.15) volatilityLevel = 'high';
  else if (volatility > 0.08) volatilityLevel = 'medium';
  
  // Calculate trend
  const firstWeek = sortedPrices.slice(0, Math.max(1, Math.ceil(sortedPrices.length * 0.3)));
  const lastWeek = sortedPrices.slice(-Math.max(1, Math.ceil(sortedPrices.length * 0.3)));
  const firstAvg = firstWeek.reduce((s, p) => s + p.price, 0) / firstWeek.length;
  const lastAvg = lastWeek.reduce((s, p) => s + p.price, 0) / lastWeek.length;
  
  let trend = 'same';
  if (Math.abs(lastAvg - firstAvg) > avgPrice * 0.02) {
    trend = lastAvg < firstAvg ? 'down' : 'up';
  }
  
  // Days since last drop
  const lastDropDate = drops.length > 0 ? drops[drops.length - 1].date : null;
  const daysSinceDrop = lastDropDate 
    ? Math.round((Date.now() - new Date(lastDropDate).getTime()) / (1000 * 60 * 60 * 24))
    : null;
  
  return {
    insufficient: false,
    product: {
      title: mainProduct.title,
      store: mainProduct.store,
      url: mainProduct.url
    },
    currentPrice,
    minPrice,
    maxPrice,
    avgPrice,
    pricePercentile: Math.round(currentPercentile),
    dataPoints: prices.length,
    daysOfHistory: Math.round((new Date(sortedPrices[sortedPrices.length - 1].date) - new Date(sortedPrices[0].date)) / (1000 * 60 * 60 * 24)),
    drops: {
      count: drops.length,
      lastDrop: lastDropDate,
      daysSinceDrop,
      typicalInterval: typicalDropDays,
      averageDropPercent: drops.length > 0 
        ? (drops.reduce((s, d) => s + d.dropPercent, 0) / drops.length).toFixed(1)
        : null
    },
    volatility: volatilityLevel,
    trend,
    priceHistory: sortedPrices.map(p => ({ price: p.price, date: p.date.slice(0, 10) }))
  };
}

/**
 * Call LLM for prediction (using Gemini via existing pattern)
 */
async function callLLMForPrediction(analysis, productCategory, countryCode) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    return generateFallbackPrediction(analysis);
  }
  
  // Build upcoming events context
  const upcomingEvents = getUpcomingEvents(countryCode);
  
  const prompt = `Eres un analista de precios experto en comercio electrónico latinoamericano.

Analiza el siguiente historial de precios y determina la mejor estrategia de compra:

PRODUCTO: ${analysis.product.title}
${productCategory ? `CATEGORÍA: ${productCategory}` : ''}
PAÍS: ${countryCode}

DATOS HISTÓRICOS (últimos ${analysis.daysOfHistory} días):
- Precio actual: $${analysis.currentPrice.toFixed(2)}
- Precio mínimo histórico: $${analysis.minPrice.toFixed(2)}
- Precio promedio: $${analysis.avgPrice.toFixed(2)}
- Precio máximo: $${analysis.maxPrice.toFixed(2)}
- Percentil del precio actual: ${analysis.pricePercentile}% (0%=mínimo, 100%=máximo)
- Volatilidad: ${analysis.volatility}
- Tendencia: ${analysis.trend === 'down' ? 'a la baja' : analysis.trend === 'up' ? 'al alza' : 'estable'}
- Bajadas detectadas: ${analysis.drops.count} en ${analysis.daysOfHistory} días
${analysis.drops.typicalInterval ? `- Intervalo típico entre bajadas: ${analysis.drops.typicalInterval} días` : ''}
${analysis.drops.daysSinceDrop !== null ? `- Días desde última bajada: ${analysis.drops.daysSinceDrop}` : ''}
${analysis.drops.averageDropPercent ? `- Descuento promedio en bajadas: ${analysis.drops.averageDropPercent}%` : ''}

EVENTOS PRÓXIMOS:
${upcomingEvents.map(e => `- ${e.name}: ${e.daysUntil} días (${e.typicalDiscount} descuento típico)`).join('\n') || 'Sin eventos relevantes próximos'}

Tu tarea:
1. Evalúa si el precio actual es buena oportunidad vs el historial
2. Considera la frecuencia de bajadas y cuándo ocurrió la última
3. Pondera eventos de ventas próximos (Hot Sale, Buen Fin, etc.)
4. Determina: ¿comprar ahora o esperar?

Responde ÚNICAMENTE en JSON válido:
{
  "recommendation": "buy_now" | "wait" | "uncertain",
  "confidence": número entre 0 y 1,
  "reasoning": "explicación breve en español para el usuario de por qué comprar o esperar",
  "pricePercentile": ${analysis.pricePercentile},
  "typicalDropDays": ${analysis.drops.typicalInterval || 'null'},
  "nextDropEstimate": "YYYY-MM-DD" o null,
  "urgencyLevel": "high" | "medium" | "low",
  "factors": ["factor 1", "factor 2", "factor 3"]
}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 500,
            responseMimeType: 'application/json'
          }
        }),
        timeout: 10000
      }
    );
    
    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }
    
    const result = await response.json();
    const rawText = result?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    
    // Parse and validate
    const parsed = JSON.parse(rawText.replace(/```json\n?|\n?```/g, '').trim());
    const validated = buyTimingPredictionSchema.parse(parsed);
    
    return validated;
  } catch (err) {
    console.error('[BuyTiming] LLM error:', err.message);
    return generateFallbackPrediction(analysis, upcomingEvents);
  }
}

/**
 * Get upcoming sale events for a country
 */
function getUpcomingEvents(countryCode) {
  const now = new Date();
  const year = now.getFullYear();
  
  // Define events by country
  const events = {
    MX: [
      { name: 'Hot Sale', month: 5, day: 1, duration: 7, typicalDiscount: '10-20%' },
      { name: 'Buen Fin', month: 11, day: 15, duration: 4, typicalDiscount: '15-30%' },
      { name: 'El Buen Fin', month: 11, day: 15, duration: 4, typicalDiscount: '15-30%' },
      { name: 'Black Friday', month: 11, day: 28, duration: 5, typicalDiscount: '20-40%' }
    ],
    US: [
      { name: 'Black Friday', month: 11, day: 28, duration: 5, typicalDiscount: '20-50%' },
      { name: 'Cyber Monday', month: 12, day: 1, duration: 1, typicalDiscount: '15-40%' },
      { name: 'Prime Day', month: 7, day: 15, duration: 2, typicalDiscount: '20-40%' }
    ],
    CL: [
      { name: 'CyberDay', month: 5, day: 27, duration: 3, typicalDiscount: '15-25%' },
      { name: 'Black Friday', month: 11, day: 28, duration: 5, typicalDiscount: '20-35%' }
    ],
    CO: [
      { name: 'Black Friday', month: 11, day: 28, duration: 5, typicalDiscount: '20-35%' },
      { name: 'Cyberlunes', month: 11, day: 30, duration: 1, typicalDiscount: '15-30%' }
    ],
    AR: [
      { name: 'Hot Sale', month: 5, day: 1, duration: 7, typicalDiscount: '10-20%' },
      { name: 'CyberMonday', month: 10, day: 7, duration: 3, typicalDiscount: '15-25%' }
    ],
    PE: [
      { name: 'Cyber Days', month: 7, day: 15, duration: 5, typicalDiscount: '15-25%' },
      { name: 'Black Friday', month: 11, day: 28, duration: 5, typicalDiscount: '20-35%' }
    ]
  };
  
  const countryEvents = events[countryCode] || events.MX;
  
  return countryEvents
    .map(e => {
      const eventDate = new Date(year, e.month - 1, e.day);
      if (eventDate < now) {
        // Event passed this year, check next year
        eventDate.setFullYear(year + 1);
      }
      const daysUntil = Math.ceil((eventDate - now) / (1000 * 60 * 60 * 24));
      return { ...e, daysUntil, date: eventDate.toISOString().slice(0, 10) };
    })
    .filter(e => e.daysUntil <= 60) // Only events within 60 days
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .slice(0, 3); // Top 3 upcoming
}

/**
 * Generate fallback prediction when LLM is unavailable
 */
function generateFallbackPrediction(analysis, upcomingEvents = []) {
  const events = upcomingEvents || [];
  const hasEventSoon = events.some(e => e.daysUntil <= 30);
  
  let recommendation = 'uncertain';
  let confidence = 0.5;
  let reasoning = 'No hay suficiente información para una recomendación clara.';
  let urgencyLevel = 'low';
  
  // Simple heuristics
  if (analysis.pricePercentile <= 20) {
    recommendation = 'buy_now';
    confidence = 0.75;
    reasoning = `El precio actual está en el percentil ${analysis.pricePercentile}, cerca del mínimo histórico. Buen momento para comprar.`;
    urgencyLevel = 'high';
  } else if (analysis.pricePercentile >= 80) {
    recommendation = 'wait';
    confidence = 0.7;
    reasoning = `El precio actual está en el percentil ${analysis.pricePercentile}, significativamente por encima del promedio. Considera esperar.`;
    urgencyLevel = 'low';
  } else if (hasEventSoon && analysis.pricePercentile > 40) {
    recommendation = 'wait';
    confidence = 0.65;
    const nextEvent = events[0];
    reasoning = `Evento ${nextEvent.name} en ${nextEvent.daysUntil} días con descuentos típicos del ${nextEvent.typicalDiscount}.`;
    urgencyLevel = 'medium';
  } else if (analysis.drops.typicalInterval && analysis.drops.daysSinceDrop !== null) {
    const daysToNext = analysis.drops.typicalInterval - analysis.drops.daysSinceDrop;
    if (daysToNext <= 7 && analysis.pricePercentile > 50) {
      recommendation = 'wait';
      confidence = 0.6;
      reasoning = `Basándonos en el patrón histórico, una bajada podría ocurrir en aproximadamente ${daysToNext} días.`;
      urgencyLevel = 'medium';
    }
  }
  
  // Estimate next drop if applicable
  let nextDropEstimate = null;
  if (recommendation === 'wait' && analysis.drops.typicalInterval && analysis.drops.lastDrop) {
    const lastDrop = new Date(analysis.drops.lastDrop);
    const nextDrop = new Date(lastDrop.getTime() + analysis.drops.typicalInterval * 24 * 60 * 60 * 1000);
    nextDropEstimate = nextDrop.toISOString().slice(0, 10);
  }
  
  return {
    recommendation,
    confidence,
    reasoning,
    pricePercentile: analysis.pricePercentile,
    typicalDropDays: analysis.drops.typicalInterval || undefined,
    nextDropEstimate,
    urgencyLevel,
    factors: [
      `Precio en percentil ${analysis.pricePercentile}`,
      `Volatilidad ${analysis.volatility}`,
      hasEventSoon ? 'Evento de ventas próximo' : 'Sin eventos próximos'
    ].filter(Boolean)
  };
}

/**
 * Main function: Get buy timing prediction
 */
async function getBuyTimingPrediction(query, productUrl, countryCode = 'MX', productCategory = '') {
  const cacheKey = generatePredictionCacheKey(query, productUrl, countryCode);
  
  // Check cache
  const cached = await getCachedPrediction(cacheKey);
  if (cached) {
    console.log(`[BuyTiming] Cache hit for: ${query}`);
    return { ...cached, cached: true };
  }
  
  // Fetch and analyze price history
  const rawHistory = await fetchPriceHistory(query, productUrl, countryCode);
  if (!rawHistory) {
    return { error: 'No se pudo obtener historial de precios', available: false };
  }
  
  const analysis = analyzePriceHistory(rawHistory);
  if (analysis.insufficient) {
    return { 
      error: 'Datos insuficientes para predicción', 
      available: false,
      reason: analysis.reason,
      dataPoints: rawHistory.length
    };
  }
  
  // Get LLM prediction
  const prediction = await callLLMForPrediction(analysis, productCategory, countryCode);
  
  // Build full response
  const result = {
    available: true,
    query,
    productUrl,
    prediction,
    currentPriceContext: {
      current: analysis.currentPrice,
      min30d: analysis.minPrice,
      avg30d: parseFloat(analysis.avgPrice.toFixed(2)),
      max30d: analysis.maxPrice
    },
    historicalPattern: {
      volatility: analysis.volatility,
      lastDrop: analysis.drops.lastDrop,
      daysSinceDrop: analysis.drops.daysSinceDrop,
      dropsInLast30d: analysis.drops.count,
      averageDiscountOnDrops: analysis.drops.averageDropPercent,
      typicalIntervalDays: analysis.drops.typicalInterval,
      trend: analysis.trend,
      dataPoints: analysis.dataPoints,
      daysOfHistory: analysis.daysOfHistory
    },
    product: analysis.product
  };
  
  // Cache result
  await cachePrediction(cacheKey, result);
  
  return result;
}

/**
 * Quick prediction for search results (used by searchController)
 */
async function getQuickPredictionForWinner(winner, query, countryCode) {
  if (!winner || !winner.urlOriginal) return null;
  
  const result = await getBuyTimingPrediction(
    query, 
    winner.urlOriginal, 
    countryCode, 
    winner.productCategory || ''
  );
  
  if (!result.available) return null;
  
  // Return simplified version for search response
  return {
    recommendation: result.prediction.recommendation,
    confidence: result.prediction.confidence,
    reasoning: result.prediction.reasoning,
    urgencyLevel: result.prediction.urgencyLevel,
    pricePercentile: result.prediction.pricePercentile,
    nextDropEstimate: result.prediction.nextDropEstimate,
    typicalIntervalDays: result.historicalPattern.typicalIntervalDays
  };
}

module.exports = {
  getBuyTimingPrediction,
  getQuickPredictionForWinner,
  generatePredictionCacheKey
};
