const fetchWithTimeout = require('../utils/fetchWithTimeout');
const supabase = require('../config/supabase');
const { z } = require('zod');

const REGION_PROMPT_CONTEXT = {
    MX: {
        label: 'México',
        language: 'es',
        currency: 'MXN',
        storeHints: 'Amazon MX, Mercado Libre MX, Walmart MX, Liverpool, Coppel, Elektra'
    },
    US: {
        label: 'United States',
        language: 'en',
        currency: 'USD',
        storeHints: 'Amazon, Walmart, Best Buy, Target, Costco, eBay'
    },
    CL: {
        label: 'Chile',
        language: 'es',
        currency: 'CLP',
        storeHints: 'Falabella, Ripley, Paris, Lider, PC Factory, SoloTodo'
    },
    CO: {
        label: 'Colombia',
        language: 'es',
        currency: 'COP',
        storeHints: 'Falabella, Éxito, Mercado Libre CO, Alkosto, Ktronix'
    },
    AR: {
        label: 'Argentina',
        language: 'es',
        currency: 'ARS',
        storeHints: 'Mercado Libre AR, Frávega, Garbarino, Musimundo, Megatone'
    },
    PE: {
        label: 'Perú',
        language: 'es',
        currency: 'PEN',
        storeHints: 'Falabella PE, Ripley PE, Plaza Vea, Mercado Libre PE, Oechsle'
    }
};

// Zod schema to validate LLM output (SECURITY FIX #8)
const llmResponseSchema = z.object({
    action: z.enum(['ask', 'search', 'search_service']),
    intent_type: z.enum(['producto', 'servicio_local', 'mayoreo', 'mayoreo_perecedero', 'ocio', 'otro']).optional(),
    question: z.string().max(1000).nullable().optional(),
    sugerencias: z.array(z.string().max(300)).max(10).optional(),
    cupon: z.string().max(100).nullable().optional(),
    searchQuery: z.string().max(500).optional().default(''),
    alternativeQueries: z.array(z.string().max(500)).max(5).optional(),
    condition: z.enum(['new', 'used']).optional().default('new'),
    canonicalKey: z.string().max(160).optional(),
    priceVolatility: z.enum(['high', 'medium', 'low']).optional().default('medium'),
    productCategory: z.string().max(80).optional()
});

// SECURITY FIX #7: Sanitize user input to prevent prompt injection
function sanitizeUserInput(text) {
    if (typeof text !== 'string') return '';
    // Strip common injection patterns
    return text
        .replace(/```[\s\S]*?```/g, '')           // Remove code blocks
        .replace(/\{[^{}]*"role"\s*:/gi, '')       // Remove role injection attempts  
        .replace(/\bsystem\s*:/gi, 'system ')      // Defang "system:" prefix
        .replace(/\bignore\s+(previous|above|all)\s+(instructions?|prompts?|rules?)/gi, '[filtered]')
        .replace(/\b(forget|disregard|override)\s+(everything|instructions?|rules?|prompts?)/gi, '[filtered]')
        .replace(/\byou\s+are\s+now\b/gi, '[filtered]')
        .replace(/\bact\s+as\b/gi, '[filtered]')
        .replace(/\bnew\s+instructions?\s*:/gi, '[filtered]')
        .replace(/(site:\S+|http\S+)/gi, '[filtered url]') // Prevents force-domain injections
        .slice(0, 500);  // Hard limit
}

exports.analyzeMessage = async (userText, chatHistory = [], context = {}) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY no está configurado en .env");
    }

    const regionCode = String(context.countryCode || 'MX').toUpperCase();
    const regionContext = REGION_PROMPT_CONTEXT[regionCode] || REGION_PROMPT_CONTEXT.MX;

    // SECURITY: Sanitize user input before sending to LLM
    const sanitizedText = sanitizeUserInput(userText);

    // Limit chat history to prevent context window overrun and save tokens
    const recentHistory = chatHistory.slice(-6);

    // Formatear el historial para el prompt
    const historyText = recentHistory.length > 0
        ? recentHistory.map(msg => `${msg.role === 'user' ? 'Usuario' : 'Asistente'}: ${msg.content}`).join('\n')
        : 'Sin historial previo.';

    // --- RAG: Extraer memorias relevantes de Supabase ---
    let extraContext = '';
    if (supabase) {
        try {
            // ALWAYS use models that output 768 dimensions to match Supabase RPC `match_ai_memory`
            const candidateModels = [
                process.env.GEMINI_EMBEDDING_MODEL || 'text-embedding-004'
            ];

            let queryVector = null;

            for (const modelName of candidateModels) {
                const embedResponse = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:embedContent?key=${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: `models/${modelName}`,
                        content: { parts: [{ text: sanitizedText }] },
                        outputDimensionality: 768
                    })
                }, 10000);

                const embedData = await embedResponse.json().catch(() => ({}));
                if (embedResponse.ok && embedData?.embedding?.values) {
                    queryVector = embedData.embedding.values;
                    break;
                }
            }

            if (queryVector) {
                const { data: matches, error } = await supabase.rpc('match_ai_memory', {
                    query_embedding: queryVector,
                    match_threshold: 0.78,
                    match_count: 3
                });

                if (!error && matches && matches.length > 0) {
                    extraContext = "\n\n=== MEMORIA DE ÉXITO PREVIA (Usa esto para dar mejores resultados) ===\n";
                    matches.forEach(m => {
                        extraContext += `- Contexto Exitoso Pasado: ${m.content}\n`;
                    });
                }
            }
        } catch (err) {
            console.error("RAG no disponible temporalmente:", err);
        }

        try {
            const clickTerms = [...new Set(sanitizedText.toLowerCase().split(/\s+/).filter(token => token.length >= 4))].slice(0, 3);
            if (clickTerms.length > 0) {
                const { data: clickRows, error: clickError } = await supabase
                    .from('click_events')
                    .select('search_query, product_title, store, created_at')
                    .eq('event_type', 'click')
                    .not('search_query', 'is', null)
                    .order('created_at', { ascending: false })
                    .limit(200);

                if (!clickError && Array.isArray(clickRows) && clickRows.length > 0) {
                    const relevantClicks = clickRows
                        .filter(row => {
                            const source = `${row.search_query || ''} ${row.product_title || ''}`.toLowerCase();
                            return clickTerms.some(term => source.includes(term));
                        })
                        .slice(0, 5);

                    if (relevantClicks.length > 0) {
                        extraContext += "\n\n=== QUERIES EXITOSOS BASADOS EN CLICS REALES ===\n";
                        relevantClicks.forEach(row => {
                            extraContext += `- Query exitosa: ${row.search_query || ''} -> Producto: ${row.product_title || ''} @ ${row.store || 'tienda desconocida'}\n`;
                        });
                    }
                }
            }
        } catch (err) {
            console.error("Click-RAG no disponible temporalmente:", err);
        }
    }

    const today = new Date();
    const currentDateStr = today.toISOString().split('T')[0];

    const systemPrompt = `Eres Lumu, el Personal Shopper AI de ${regionContext.label}.
Región activa: ${regionContext.label} (${regionCode})
Idioma preferido de búsqueda: ${regionContext.language}
Moneda principal: ${regionContext.currency}
Tiendas de referencia: ${regionContext.storeHints}
FECHA ACTUAL: ${currentDateStr}
${extraContext}`;

    const userPrompt = `
    HISTORIAL DE RECIENTE:
    ${historyText}
    
    MENSAJE ACTUAL:
    "${sanitizedText}"

    TUS OBJETIVOS Y REGLAS CLAVE:
    1. ESTRATEGIA DE BÚSQUEDA LONG-TAIL INTELIGENTE: Expande búsquedas vagas (ej. "laptop i7" -> "laptop intel core i7 16gb ram ssd 512gb"). Incluye marca, modelo, capacidad, color o variante cuando sea obvio. Prioriza frases reales de catálogo y compra.
    2. ACCIÓN INMEDIATA: Usa "search" si menciona cualquier producto/servicio. Usa "search_service" para oficios locales, restaurantes, taquerías, comida, dentistas, médicos, talleres, veterinarias u otros negocios físicos cercanos. Usa "ask" SOLO si falta información crítica para encontrar algo útil.
    3. CONDICIÓN: "new" (nuevo) por defecto, salvo que diga usado/seminuevo.
    4. CLASIFICACIÓN intent_type: producto, servicio_local, mayoreo, mayoreo_perecedero, ocio, otro.
    5. ANTI-ACCESORIOS: Si busca algo principal caro (TV, celular, consola), añade "-funda -case -protector -cable".
    6. alternativeQueries: genera de 2 a 4 variaciones de altísima calidad, pensando en cómo lo listan ${regionContext.storeHints}. NO USES "site:".
    7. MEXICANISMOS: Traduce "refiri"->refrigerador, "cel"->celular, "compu"->computadora.
    8. CONVERSACIÓN Y SALUDOS: Si el usuario te saluda ("hola", "buenos días") sin pedir un producto, DEBES usar action="ask" y responder amablemente sugiriendo 3 categorías populares para buscar.
    9. TYPOS: Corrige errores ortográficos evidentes y palabras truncadas en el searchQuery ("iphome" -> "iphone", "perr" -> "perro").
    10. COMPARACIONES: Si el usuario compara 2 productos, usa action="search" con el PRIMER producto mencionado, pero en alternativeQueries incluye el otro como variante.
    11. FOLLOW-UP INTELIGENTE: Si el usuario pide algo demasiado ambiguo ("quiero una laptop", "busco audífonos"), primero intenta resolver con una búsqueda genérica útil y usa action="ask" solo si de verdad no puedes formar un query de compra razonable.
    12. RESULTADOS ÚTILES: Prefiere queries que ayuden a traer productos completos, no páginas genéricas, refacciones o accesorios sueltos.
    13. COBERTURA: Si detectas un producto comprable pero faltan detalles finos, NO bloquees la búsqueda. Genera un searchQuery amplio pero comercial y usa alternativeQueries para marca, variante, tamaño, color o edición.
    14. OFERTAS: En alternativeQueries incluye al menos una variante orientada a descuento/oferta/cupón cuando aplique naturalmente al producto.
    15. IDIOMA Y REGIÓN: Si la región activa es ${regionCode}, redacta el searchQuery y alternativeQueries en el idioma que más probablemente traiga resultados en esa región. Para US, normalmente usa inglés aunque el usuario escriba en español. Para LatAm, usa español salvo que el producto se liste normalmente en inglés.
    16. MARCAS Y QUERIES GENÉRICAS: Si el usuario escribe solo una marca o una categoría demasiado amplia ("Bitvae", "TV", "laptop everyday use"), expándela a un producto/categoría comercial razonable y añade variantes útiles en alternativeQueries.
    17. CONVERSACIONAL SIN PRODUCTO: Si el usuario pide "compárame precios", "dime cuál conviene más" o frases similares SIN decir claramente el producto, usa action="ask" y pide el producto concreto.
    18. MÚLTIPLES CATEGORÍAS: Si la consulta mezcla demasiadas categorías ("ropa calzado moda accesorios tenis playeras", "Tecnología celulares laptops audífonos gadgets"), DEBES elegir UNA SOLA categoría específica y comprable para searchQuery (ej: "audífonos bluetooth") y usar las demás como alternativeQueries. NUNCA copies toda la lista como searchQuery porque genera resultados basura. El searchQuery debe tener máximo 6-8 palabras enfocadas en UN producto.
    24. NO-COMPRABLES ONLINE: Si detectas vehículos (carros, motos), inmuebles (casas, departamentos en venta/renta), o servicios profesionales, usa intent_type="servicio_local" o "otro" en vez de "producto". Estos no se venden en tiendas online.
    19. DISPONIBILIDAD ACTUAL: Considera la FECHA ACTUAL. Si el producto parece muy nuevo, rumor, preventa o incierto, NO afirmes que no existe. Intenta buscarlo tal cual si es plausible a fecha de hoy. Si sospechas disponibilidad limitada, mantén ese producto en searchQuery y usa alternativeQueries con variantes cercanas o generación/modelo relacionado.
    20. SERVICIOS VS PRODUCTOS: Lugares para comer, restaurantes, taquerías y tiendas físicas deben priorizar intención de servicio/local, no shopping de e-commerce.
    21. canonicalKey: genera una key canónica corta y estable para cachear el producto, usando formato tipo "marca_modelo_variant" en minúsculas y sin caracteres especiales.
    22. priceVolatility: responde "high" para productos con precios muy cambiantes (ofertas flash, electrónica popular, gaming), "low" para categorías estables, y "medium" para lo demás.
    23. productCategory: resume la categoría principal del producto en una sola etiqueta corta como "smartphone", "laptop", "audio", "fashion", "home", "gaming", "appliance", "local_service".
  
    Devuelve ESTRICTAMENTE un JSON validado.
  `;

    const payload = {
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: userPrompt }] }],
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
                type: "OBJECT",
                properties: {
                    action: { type: "STRING", enum: ["ask", "search", "search_service"] },
                    intent_type: { type: "STRING", enum: ["producto", "servicio_local", "mayoreo", "mayoreo_perecedero", "ocio", "otro"] },
                    question: { type: "STRING" },
                    sugerencias: { type: "ARRAY", items: { type: "STRING" } },
                    cupon: { type: "STRING", description: "If you know universal or active promo codes for the brand/store, include them here (e.g., 'SAVE20')" },
                    searchQuery: { type: "STRING", description: "Format: Brand + Exact Model + Modifiers (products) OR Service Name + City (services)" },
                    alternativeQueries: { type: "ARRAY", items: { type: "STRING" }, description: "2 to 3 alternative highly specific queries to maximize shopping results coverage" },
                    condition: { type: "STRING", enum: ["new", "used"] },
                    canonicalKey: { type: "STRING" },
                    priceVolatility: { type: "STRING", enum: ["high", "medium", "low"] },
                    productCategory: { type: "STRING" }
                },
                required: ["action", "searchQuery"]
            }
        }
    };

    const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;
    let retries = 0;
    const maxRetries = 2;

    while (retries <= maxRetries) {
        try {
            const response = await fetchWithTimeout(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
                body: JSON.stringify(payload)
            }, 15000);

            if (response.status === 429 && retries < maxRetries) {
                retries++;
                const delay = retries * 1500 + Math.random() * 500;
                console.warn(`[LLM] Error 429 Rate Limit. Reintentando en ${Math.round(delay)}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }

            if (!response.ok) {
                const errorBody = await response.text().catch(() => '');
                throw new Error(`Fallo en la API de Gemini: HTTP ${response.status} - ${errorBody.slice(0, 200)}`);
            }

            const data = await response.json();

            // Defensive: check candidates exist and have content
            if (!data.candidates || data.candidates.length === 0 || !data.candidates[0].content) {
                console.warn('[LLM] Gemini returned empty/blocked candidates:', JSON.stringify(data).slice(0, 500));
                throw new Error('Gemini returned no candidates (possibly blocked by safety filter)');
            }

            const textResult = data.candidates[0].content.parts[0].text;
            if (!textResult) {
                throw new Error('Gemini returned empty text in candidates');
            }

            const parsed = JSON.parse(textResult);

            // Validar que searchQuery no esté vacío
            if (!parsed.searchQuery || parsed.searchQuery.trim().length === 0) {
                console.warn('[LLM] searchQuery vacío, usando fallback con query original');
                return {
                    action: 'search',
                    question: null,
                    searchQuery: sanitizedText || userText,
                    condition: 'new',
                    canonicalKey: '',
                    priceVolatility: 'medium',
                    productCategory: ''
                };
            }

            // SECURITY FIX #8: Validate LLM output with Zod
            const validated = llmResponseSchema.safeParse(parsed);
            if (!validated.success) {
                console.warn('[LLM] Response validation failed:', validated.error.issues.map(i => i.message).join(', '));
                // Fall back to a safe search action using the original query
                return {
                    action: 'search',
                    question: null,
                    searchQuery: sanitizedText || userText,
                    condition: 'new',
                    canonicalKey: '',
                    priceVolatility: 'medium',
                    productCategory: ''
                };
            }

            return validated.data;

        } catch (error) {
            if (retries >= maxRetries) {
                console.error('Error en LLM Assistant tras reintentos:', error.message);
                return {
                    action: "search",
                    question: null,
                    searchQuery: sanitizedText || userText,
                    condition: "new",
                    canonicalKey: '',
                    priceVolatility: 'medium',
                    productCategory: ''
                };
            }
            retries++;
            await new Promise(resolve => setTimeout(resolve, retries * 1000));
        }
    }
};
