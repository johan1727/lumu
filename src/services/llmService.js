const fetchWithTimeout = require('../utils/fetchWithTimeout');
const supabase = require('../config/supabase');
const { z } = require('zod');

// Zod schema to validate LLM output (SECURITY FIX #8)
const llmResponseSchema = z.object({
    action: z.enum(['ask', 'search', 'search_service']),
    intent_type: z.enum(['producto', 'servicio_local', 'mayoreo', 'mayoreo_perecedero', 'ocio', 'otro']).optional(),
    question: z.string().max(1000).nullable().optional(),
    sugerencias: z.array(z.string().max(300)).max(10).optional(),
    cupon: z.string().max(100).nullable().optional(),
    searchQuery: z.string().max(500).optional().default(''),
    alternativeQueries: z.array(z.string().max(500)).max(5).optional(),
    condition: z.enum(['new', 'used']).optional().default('new')
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

exports.analyzeMessage = async (userText, chatHistory = []) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY no está configurado en .env");
    }

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
    }

    const today = new Date();
    const currentDateStr = today.toISOString().split('T')[0];

    const systemPrompt = `Eres Lumu, el Personal Shopper AI #1 de México.
Precios en MXN. NUNCA en USD.
FECHA ACTUAL: ${currentDateStr}
${extraContext}`;

    const userPrompt = `
    HISTORIAL DE RECIENTE:
    ${historyText}
    
    MENSAJE ACTUAL:
    "${sanitizedText}"

    TUS OBJETIVOS Y REGLAS CLAVE:
    1. ESTRATEGIA DE BÚSQUEDA LONG-TAIL INTELIGENTE: Expande búsquedas vagas (ej. "laptop i7" -> "laptop intel core i7 16gb ram ssd 512gb"). Incluye marca, modelo, capacidad, color o variante cuando sea obvio. Prioriza frases reales de catálogo y compra.
    2. ACCIÓN INMEDIATA: Usa "search" si menciona cualquier producto/servicio. "search_service" para oficios locales (plomero, etc). "ask" SOLO si falta información crítica para encontrar algo útil.
    3. CONDICIÓN: "new" (nuevo) por defecto, salvo que diga usado/seminuevo.
    4. CLASIFICACIÓN intent_type: producto, servicio_local, mayoreo, mayoreo_perecedero, ocio, otro.
    5. ANTI-ACCESORIOS: Si busca algo principal caro (TV, celular, consola), añade "-funda -case -protector -cable".
    6. alternativeQueries: genera de 2 a 4 variaciones de altísima calidad, pensando en cómo lo listan Amazon, Mercado Libre o catálogos mexicanos. NO USES "site:".
    7. MEXICANISMOS: Traduce "refiri"->refrigerador, "cel"->celular, "compu"->computadora.
    8. CONVERSACIÓN Y SALUDOS: Si el usuario te saluda ("hola", "buenos días") sin pedir un producto, DEBES usar action="ask" y responder amablemente sugiriendo 3 categorías populares para buscar.
    9. TYPOS: Corrige errores ortográficos evidentes en el searchQuery ("iphome" -> "iphone").
    10. COMPARACIONES: Si el usuario compara 2 productos, usa action="search" con el PRIMER producto mencionado, pero en alternativeQueries incluye el otro como variante.
    11. FOLLOW-UP INTELIGENTE: Si el usuario pide algo demasiado ambiguo ("quiero una laptop", "busco audífonos"), primero intenta resolver con una búsqueda genérica útil y usa action="ask" solo si de verdad no puedes formar un query de compra razonable.
    12. RESULTADOS ÚTILES: Prefiere queries que ayuden a traer productos completos, no páginas genéricas, refacciones o accesorios sueltos.
    13. COBERTURA: Si detectas un producto comprable pero faltan detalles finos, NO bloquees la búsqueda. Genera un searchQuery amplio pero comercial y usa alternativeQueries para marca, variante, tamaño, color o edición.
    14. OFERTAS: En alternativeQueries incluye al menos una variante orientada a descuento/oferta/cupón cuando aplique naturalmente al producto.
  
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
                    condition: { type: "STRING", enum: ["new", "used"] }
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
                    condition: 'new'
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
                    condition: 'new'
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
                    condition: "new"
                };
            }
            retries++;
            await new Promise(resolve => setTimeout(resolve, retries * 1000));
        }
    }
};
