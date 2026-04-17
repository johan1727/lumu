const { z } = require('zod');

// Coerce string / null → number | undefined for lat/lng coming from DOM .value
const coerceOptionalNumber = (min, max) =>
    z.preprocess(
        (val) => (val === null || val === undefined || val === '') ? undefined : Number(val),
        z.number().min(min).max(max).optional()
    );

const baseSearchSchema = z.object({
    query: z.string().trim().min(1, 'query es requerido').max(200, 'query supera el máximo de 200 caracteres'),
    radius: z.union([z.string(), z.number()]).optional(),
    lat: coerceOptionalNumber(-90, 90),
    lng: coerceOptionalNumber(-180, 180)
    // userId is now extracted from Authorization header (JWT) via authMiddleware
});

const chatMessageSchema = z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().max(2000)
});

const searchProductSchema = baseSearchSchema.extend({
    chatHistory: z.array(chatMessageSchema).max(10).optional(),
    skipLLM: z.boolean().optional(),
    deepResearch: z.boolean().optional(),
    preferredStoreKey: z.string().trim().min(1).max(80).optional(),
    preferredStoreKeys: z.array(z.string().trim().min(1).max(80)).max(8).optional(),
    preferredStoreMode: z.enum(['prefer', 'exclusive', 'compare']).optional().default('prefer'),
    safeStoresOnly: z.boolean().optional().default(false),
    includeKnownMarketplaces: z.boolean().optional().default(true),
    includeHighRiskMarketplaces: z.boolean().optional().default(false),
    conditionMode: z.enum(['all', 'new', 'used']).optional().default('all'),
    country: z.string().max(5).optional()
});

const bulkSearchSchema = z.object({
    queries: z.array(
        z.string().trim().min(1, 'Cada query debe tener contenido').max(200, 'Cada query debe tener máximo 200 caracteres')
    ).min(1, 'queries no puede estar vacío').max(10, 'Máximo 10 queries por request'),
    radius: z.union([z.string(), z.number()]).optional(),
    lat: coerceOptionalNumber(-90, 90),
    lng: coerceOptionalNumber(-180, 180)
    // userId is now extracted from Authorization header (JWT) via authMiddleware
});

const visionSchema = z.object({
    image: z.string().min(20, 'image debe contener datos base64 válidos').max(10485760, 'image supera el límite de 10MB')
});

const memorySchema = z.object({
    query: z.string().trim().min(1, 'query es requerido').max(500),
    responseText: z.string().trim().min(1, 'responseText es requerido').max(5000)
});

const feedbackSchema = z.object({
    message: z.string().trim().min(1, 'message es requerido').max(2000),
    // SECURITY FIX #9: user_id removed from body schema — now taken from JWT via req.userId
    user_email: z.string().email('user_email debe ser email válido').nullable().optional()
});

const priceAlertSchema = z.object({
    product_name: z.string().trim().min(2, 'Nombre de producto inválido.').max(200),
    target_price: z.coerce.number().positive('Precio meta debe ser mayor a 0.'),
    product_url: z.string().url('URL de producto inválida.').max(2000).nullable().optional(),
    store_name: z.string().trim().max(100).nullable().optional()
});

const trackEventSchema = z.object({
    event_type: z.enum(['click', 'ad_view', 'ad_skip', 'search', 'favorite', 'favorite_remove', 'alert_create', 'compare', 'history_open', 'feedback_positive', 'feedback_negative', 'zero_results', 'bounce', 'auth_modal_open', 'auth_modal_dismiss', 'signup_complete', 'signup_bonus', 'page_view', 'pricing_view', 'checkout_click', 'purchase'], {
        errorMap: () => ({ message: 'event_type inválido para tracking' })
    }),
    product_title: z.string().max(500).optional().default(''),
    store: z.string().max(200).optional().default(''),
    url: z.string().max(2000).optional().default(''),
    search_query: z.string().max(500).optional().default(''),
    device: z.string().max(50).optional().default('unknown'),
    canonical_key: z.string().max(160).optional(),
    product_category: z.string().max(120).optional(),
    position: z.number().int().min(0).max(500).optional(),
    result_source: z.string().max(80).optional(),
    store_tier: z.number().int().min(1).max(3).optional(),
    best_buy_score: z.number().min(0).max(1).optional(),
    session_id: z.string().max(120).optional(),
    search_id: z.string().max(120).optional(),
    engagement_ms: z.number().int().min(0).max(86400000).optional(),
    action_context: z.string().max(80).optional(),
    price: z.number().min(0).max(999999999).optional(),
    feedback_label: z.string().max(120).optional(),
    brand: z.string().max(120).optional()
});

module.exports = {
    searchProductSchema,
    bulkSearchSchema,
    visionSchema,
    memorySchema,
    feedbackSchema,
    priceAlertSchema,
    trackEventSchema
};
