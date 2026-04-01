const fetchWithTimeout = require('../utils/fetchWithTimeout');

/**
 * Deep Research Enhancer - Premium features only for Deep Research mode
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp';

/**
 * Generate product variants for Deep Research
 * Expands search to include color/storage/model variations
 */
function generateProductVariants(query, productCategory) {
    const normalized = String(query || '').toLowerCase();
    const variants = [];

    // Color variants for common products
    const colorMap = {
        'negro': ['black', 'negro', 'space gray', 'midnight'],
        'blanco': ['white', 'blanco', 'starlight', 'silver'],
        'azul': ['blue', 'azul', 'pacific blue', 'sierra blue'],
        'rojo': ['red', 'rojo', 'product red'],
        'rosa': ['pink', 'rosa', 'rose gold'],
        'verde': ['green', 'verde', 'alpine green'],
        'morado': ['purple', 'morado', 'deep purple']
    };

    // Storage variants for tech products
    const storageMap = {
        '64gb': ['64gb', '128gb'],
        '128gb': ['128gb', '256gb', '64gb'],
        '256gb': ['256gb', '512gb', '128gb'],
        '512gb': ['512gb', '1tb', '256gb'],
        '1tb': ['1tb', '2tb', '512gb']
    };

    // Model variants for common products
    if (/iphone/i.test(normalized)) {
        if (/pro max/i.test(normalized)) {
            variants.push(query.replace(/pro max/i, 'Pro'));
        } else if (/pro/i.test(normalized)) {
            variants.push(query.replace(/pro/i, 'Pro Max'));
            variants.push(query.replace(/pro/i, ''));
        }
    }

    if (/nintendo switch/i.test(normalized)) {
        if (/oled/i.test(normalized)) {
            variants.push(query.replace(/oled/i, '').trim());
        } else {
            variants.push(`${query} OLED`);
        }
    }

    if (/airpods/i.test(normalized)) {
        if (/pro/i.test(normalized)) {
            variants.push(query.replace(/pro/i, '').trim());
        } else {
            variants.push(`${query} Pro`);
        }
    }

    // Add color variants if no color specified
    const hasColor = Object.keys(colorMap).some(color => normalized.includes(color));
    if (!hasColor && ['smartphone', 'laptop', 'audio', 'gaming'].includes(productCategory)) {
        variants.push(`${query} negro`);
        variants.push(`${query} blanco`);
    }

    // Add storage variants if tech product
    const hasStorage = /\d+gb|\d+tb/i.test(normalized);
    if (!hasStorage && ['smartphone', 'laptop'].includes(productCategory)) {
        variants.push(`${query} 128gb`);
        variants.push(`${query} 256gb`);
    }

    return [...new Set(variants)].slice(0, 4);
}

/**
 * Generate AI-powered comparative analysis for top results
 * Only runs in Deep Research mode
 */
async function generateComparativeAnalysis(topResults, query, countryCode, currency, options = {}) {
    if (!GEMINI_API_KEY || !topResults || topResults.length < 2) {
        return null;
    }

    try {
        const maxProducts = Number(options.maxProducts) > 0 ? Number(options.maxProducts) : 5;
        const requestTimeout = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 8000;
        const productsForAnalysis = topResults.slice(0, maxProducts).map((p, idx) => ({
            rank: idx + 1,
            title: p.titulo || p.title || 'Sin título',
            price: p.precio || p.price,
            store: p.tienda || p.source || 'Tienda desconocida',
            priceConfidence: p.priceConfidence || 0.5,
            isLocalStore: p.isLocalStore || false,
            shippingText: p.shippingText || '',
            coupon: p.cupon || null
        }));

        const prompt = `Eres un asistente de compras experto. Analiza estos ${productsForAnalysis.length} productos y genera un veredicto breve y directo sobre cuál es la mejor opción de compra.

Búsqueda: "${query}"
País: ${countryCode}
Moneda: ${currency}

Productos:
${productsForAnalysis.map(p => `${p.rank}. ${p.title}
   Precio: ${p.price ? `${p.price} ${currency}` : 'No disponible'}
   Tienda: ${p.store}
   ${p.coupon ? `Cupón: ${p.coupon}` : ''}
   ${p.shippingText ? `Envío: ${p.shippingText}` : ''}
   ${p.isLocalStore ? 'Tienda física local' : 'Compra online'}`).join('\n\n')}

Genera un análisis en formato JSON con esta estructura:
{
  "bestOption": número del 1-${productsForAnalysis.length} (el mejor producto),
  "reasoning": "explicación breve de por qué es la mejor opción (máx 200 caracteres)",
  "priceComparison": "comparación de precios entre las opciones (máx 150 caracteres)",
  "recommendation": "recomendación final para el usuario (máx 180 caracteres)"
}

Criterios:
- Prioriza mejor precio/calidad
- Considera confiabilidad de la tienda
- Menciona si hay cupones disponibles
- Si es tienda local, menciona la ventaja de tenerlo hoy mismo
- Sé conciso y directo`;

        const response = await fetchWithTimeout('https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent?key=' + GEMINI_API_KEY, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.3,
                    maxOutputTokens: 400,
                    responseMimeType: 'application/json'
                }
            }),
            timeout: requestTimeout
        });

        if (!response.ok) {
            console.warn('[Deep Research] Comparative analysis failed:', response.status);
            return null;
        }

        const data = await response.json();
        if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
            return null;
        }

        const analysis = JSON.parse(data.candidates[0].content.parts[0].text);
        
        // Validate analysis structure
        if (!analysis.bestOption || !analysis.reasoning || !analysis.recommendation) {
            return null;
        }

        return {
            bestOptionRank: Number(analysis.bestOption),
            reasoning: String(analysis.reasoning).slice(0, 200),
            priceComparison: String(analysis.priceComparison || '').slice(0, 150),
            recommendation: String(analysis.recommendation).slice(0, 180),
            analyzedCount: productsForAnalysis.length
        };

    } catch (error) {
        console.error('[Deep Research] Error generating comparative analysis:', error.message);
        return null;
    }
}

/**
 * Enhance search results with Deep Research features
 */
async function enhanceResults(results, searchContext) {
    const { query, deepSearchEnabled, countryCode, currency, productCategory } = searchContext;

    if (!results || results.length === 0) {
        return { results, enhancements: null };
    }

    console.log(deepSearchEnabled
        ? '[Deep Research] Enhancing results with AI analysis...'
        : '[Search Enhancer] Generating lightweight AI analysis...');

    const enhancements = {};

    // Generate comparative analysis
    const analysis = await generateComparativeAnalysis(results, query, countryCode, currency, {
        maxProducts: deepSearchEnabled ? 5 : 3,
        timeoutMs: deepSearchEnabled ? 8000 : 6000
    });
    if (analysis) {
        enhancements.comparativeAnalysis = analysis;
        console.log(`${deepSearchEnabled ? '[Deep Research]' : '[Search Enhancer]'} AI recommends option #${analysis.bestOptionRank}: ${analysis.reasoning}`);
    }

    // Generate product variants for future searches
    const variants = deepSearchEnabled ? generateProductVariants(query, productCategory) : [];
    if (variants.length > 0) {
        enhancements.suggestedVariants = variants;
        console.log(`[Deep Research] Generated ${variants.length} product variants`);
    }

    return { results, enhancements };
}

module.exports = {
    generateProductVariants,
    generateComparativeAnalysis,
    enhanceResults
};
