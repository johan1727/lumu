const express = require('express');
const router = express.Router();
const searchController = require('../controllers/searchController');
const { validateBody } = require('../middleware/validateRequest');
const authMiddleware = require('../middleware/authMiddleware');
const { requireAuth } = require('../middleware/authMiddleware');
const { searchProductSchema, bulkSearchSchema, visionSchema, memorySchema, feedbackSchema, priceAlertSchema, trackEventSchema } = require('../schemas/searchSchemas');
const imageProxy = require('../controllers/imageProxy');

const memoryController = require('../controllers/memoryController');
const feedbackController = require('../controllers/feedbackController');
const priceAlertController = require('../controllers/priceAlertController');
const dropshipController = require('../controllers/dropshipController');
const analyticsController = require('../controllers/analyticsController');
const priceHistoryController = require('../controllers/priceHistoryController');
const autocompleteController = require('../controllers/autocompleteController');
const supplierChecker = require('../services/supplierChecker');
const meliService = require('../services/meliService');

// --- Anti-burst rate limiter por IP (in-memory, serverless-safe) ---
// Bloquea IPs que envían más de BURST_MAX requests en BURST_WINDOW_MS a /api/buscar
const BURST_MAX = 20;           // max requests per window
const BURST_WINDOW_MS = 60000;  // 1 minute
const _burstLog = new Map();

function burstRateLimiter(req, res, next) {
    if (process.env.NODE_ENV !== 'production') return next();
    const ip = req.headers['x-vercel-forwarded-for']?.split(',')[0]?.trim()
        || req.headers['x-real-ip']
        || req.headers['x-forwarded-for']?.split(',').pop()?.trim()
        || req.ip || 'unknown';
    const now = Date.now();
    let entry = _burstLog.get(ip);
    if (!entry || now - entry.windowStart > BURST_WINDOW_MS) {
        entry = { windowStart: now, count: 0 };
        _burstLog.set(ip, entry);
    }
    entry.count++;
    if (entry.count > BURST_MAX) {
        const retryAfter = Math.ceil((entry.windowStart + BURST_WINDOW_MS - now) / 1000);
        console.warn(`[Burst Limiter] IP ${ip} blocked: ${entry.count} reqs in window`);
        return res.status(429).json({
            error: 'Demasiadas solicitudes. Por favor espera un momento.',
            retry_after: retryAfter
        });
    }
    // Periodic cleanup (1% chance per request)
    if (Math.random() < 0.01) {
        for (const [k, v] of _burstLog.entries()) {
            if (now - v.windowStart > BURST_WINDOW_MS * 2) _burstLog.delete(k);
        }
    }
    next();
}

function isAllowedFrontendRequest(req, options = {}) {
    const origin = req.headers.origin || '';
    const referer = req.headers.referer || '';
    const allowedOrigins = req.app?.locals?.allowedOrigins || [];
    const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
    const requestHost = (forwardedHost || req.hostname || '').trim().toLowerCase();
    const allowHostFallback = options.allowHostFallback === true;

    let originHost = '';
    try { originHost = new URL(origin).hostname; } catch { }
    let refererHost = '';
    try { refererHost = new URL(referer).hostname; } catch { }

    const allowedHosts = allowedOrigins
        .map(o => { try { return new URL(o).hostname; } catch { return ''; } })
        .filter(Boolean);

    if (process.env.NODE_ENV !== 'production') {
        return true;
    }

    if (allowedOrigins.length === 0 || allowedHosts.length === 0) {
        return false;
    }

    const explicitOriginAllowed = origin && allowedOrigins.includes(origin);
    const sameHostByOrigin = originHost && allowedHosts.includes(originHost);
    const sameHostByReferer = refererHost && allowedHosts.includes(refererHost);
    const sameHostByRequestHost = requestHost && allowedHosts.includes(requestHost);

    return explicitOriginAllowed || sameHostByOrigin || sameHostByReferer || (allowHostFallback && sameHostByRequestHost);
}

function requireFrontendRequest(req, res, next) {
    if (!isAllowedFrontendRequest(req)) {
        return res.status(403).json({ error: 'Acceso denegado' });
    }
    next();
}

// Image Proxy route to bypass CORS for product images
router.get('/img-proxy', imageProxy.proxyImage);

// POST /api/track — Conversion analytics (public, lightweight, validated)
router.post('/track', authMiddleware, validateBody(trackEventSchema), analyticsController.trackEvent);

// GET /api/price-history — Public price trends (cached)
router.get('/price-history', priceHistoryController.getPriceHistory);

router.get('/deals', async (req, res) => {
    try {
        const country = String(req.query.country || req.app?.locals?.detectedCountry || 'MX').trim().toUpperCase();
        const deals = await meliService.getFlashDeals(country, 8);
        res.set('Cache-Control', 'public, max-age=1800');
        res.json({
            ok: true,
            country,
            deals
        });
    } catch (error) {
        console.error('[Deals API] Error loading deals:', error.message);
        res.status(500).json({ ok: false, deals: [], error: 'No se pudieron cargar las ofertas.' });
    }
});

// POST /api/buscar — authMiddleware verifies JWT and sets req.userId
router.post('/buscar', burstRateLimiter, authMiddleware, validateBody(searchProductSchema), searchController.searchProduct);

// POST /api/vision (IA identifica producto de una imagen)
router.post('/vision', burstRateLimiter, validateBody(visionSchema), searchController.analyzeImage);

// GET /api/autocomplete (Fase 6: Auto-completar inteligente)
router.get('/autocomplete', burstRateLimiter, autocompleteController.getSuggestions);

// POST /api/bulk-search (B2B Plan Revendedor)
router.post('/bulk-search', burstRateLimiter, authMiddleware, requireAuth, validateBody(bulkSearchSchema), searchController.bulkSearch);

// POST /api/memory (requires auth to prevent RAG poisoning)
router.post('/memory', authMiddleware, requireAuth, validateBody(memorySchema), memoryController.saveMemory);

// POST /api/feedback (requires auth)
router.post('/feedback', burstRateLimiter, authMiddleware, requireAuth, validateBody(feedbackSchema), feedbackController.submitFeedback);

// Price Alerts (requires auth)
router.get('/price-alerts', authMiddleware, requireAuth, priceAlertController.listAlerts);
router.post('/price-alerts', authMiddleware, requireAuth, validateBody(priceAlertSchema), priceAlertController.createAlert);
router.delete('/price-alerts/:id', authMiddleware, requireAuth, priceAlertController.deleteAlert);

// Push notification subscription (requires auth)
router.post('/push-subscribe', authMiddleware, requireAuth, priceAlertController.savePushSubscription);

// Rewarded Ads: Claim bonus searches
router.post('/claim-reward', authMiddleware, requireAuth, requireFrontendRequest, searchController.claimReward);
router.post('/signup-bonus', authMiddleware, requireFrontendRequest, searchController.claimSignupBonus);

// GET /api/config
const regionConfigService = require('../services/regionConfigService');
router.get('/config', (req, res, next) => {
    if (!isAllowedFrontendRequest(req, { allowHostFallback: true })) {
        return res.status(403).json({ error: 'Acceso denegado' });
    }
    next();
}, (req, res) => {
    const detectedCountry = regionConfigService.resolveCountry(req);
    const regionConfig = regionConfigService.getRegionConfig(detectedCountry);
    // Only expose public-safe keys (never SERVICE_ROLE_KEY)
    res.json({
        supabaseUrl: process.env.SUPABASE_URL || '',
        supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
        stripePaymentLink: process.env.STRIPE_PAYMENT_LINK || '',
        stripeB2bPaymentLink: process.env.STRIPE_B2B_PAYMENT_LINK || '',
        stripeVipAnnualPaymentLink: process.env.STRIPE_VIP_ANNUAL_PAYMENT_LINK || '',
        stripeB2bAnnualPaymentLink: process.env.STRIPE_B2B_ANNUAL_PAYMENT_LINK || '',
        vapidPublicKey: process.env.VAPID_PUBLIC_KEY || '',
        rewardedAdTagUrl: process.env.REWARDED_AD_TAG_URL || '',
        detectedCountry: detectedCountry,
        currency: regionConfig.currency,
        locale: regionConfig.locale,
        currencySymbol: regionConfig.currencySymbol,
        regionLabel: regionConfig.regionLabel,
        supportedCountries: regionConfigService.getSupportedCountries()
    });
});

// GET /api/scraper-health — Ver si algún scraper está siendo bloqueado
const scraperMonitor = require('../services/scraperMonitor');
router.get('/scraper-health', (req, res) => {
    // Protección: requiere API key o mismo host en producción
    if (process.env.NODE_ENV === 'production') {
        const crypto = require('crypto');
        const authKey = req.headers['x-admin-key'] || req.query.key;
        const adminKey = process.env.ADMIN_API_KEY;
        if (!adminKey || !authKey) {
            return res.status(403).json({ error: 'Acceso denegado. Se requiere x-admin-key.' });
        }
        // SECURITY FIX: Hash both keys to prevent length leak via timing
        const authHash = crypto.createHmac('sha256', 'lumu-admin').update(String(authKey)).digest();
        const adminHash = crypto.createHmac('sha256', 'lumu-admin').update(String(adminKey)).digest();
        if (!crypto.timingSafeEqual(authHash, adminHash)) {
            return res.status(403).json({ error: 'Acceso denegado. Se requiere x-admin-key.' });
        }
    }
    // Si el cliente es un navegador (Accept: text/html), redirigir al dashboard UI
    const acceptsHtml = req.headers.accept && req.headers.accept.includes('text/html');
    if (acceptsHtml) {
        return res.redirect('/scraper-dashboard.html');
    }
    const report = scraperMonitor.getHealthReport();
    res.json({
        timestamp: new Date().toISOString(),
        scrapers: report,
        recommendation: Object.values(report).some(s => parseInt(s.blockRate) > 50)
            ? '🔴 ACCIÓN REQUERIDA: Uno o más scrapers están siendo bloqueados. Considera activar proxies o esperar 1 hora.'
            : '🟢 Todos los scrapers parecen funcionar correctamente.'
    });
});

// NUEVO: Fase 6 - Lumu Coins endpoint
router.get('/me/coins', authMiddleware, searchController.getCoins);

// ============================================================
// Admin Routes (private — requires ADMIN_API_KEY + allowed email)
// ============================================================
const ADMIN_EMAILS = ['jhonatanvillagomez38@gmail.com', 'gastrolbg@gmail.com'];

function requireAdmin(req, res, next) {
    const crypto = require('crypto');
    const authKey = req.headers['x-admin-key'] || req.query.key;
    const adminKey = process.env.ADMIN_API_KEY;
    if (!adminKey || !authKey) {
        return res.status(403).json({ error: 'Acceso denegado. Se requiere x-admin-key.' });
    }
    // SECURITY FIX: Hash both keys before comparison to prevent length leak
    const authHash = crypto.createHmac('sha256', 'lumu-admin').update(String(authKey)).digest();
    const adminHash = crypto.createHmac('sha256', 'lumu-admin').update(String(adminKey)).digest();
    if (!crypto.timingSafeEqual(authHash, adminHash)) {
        return res.status(403).json({ error: 'Acceso denegado. Se requiere x-admin-key.' });
    }
    next();
}

// Products
router.get('/admin/dropship/products', requireAdmin, dropshipController.listProducts);
router.post('/admin/dropship/products', requireAdmin, dropshipController.createProduct);
router.put('/admin/dropship/products/:id', requireAdmin, dropshipController.updateProduct);
router.delete('/admin/dropship/products/:id', requireAdmin, dropshipController.deleteProduct);

// Orders
router.get('/admin/dropship/orders', requireAdmin, dropshipController.listOrders);
router.post('/admin/dropship/orders', requireAdmin, dropshipController.createOrder);
router.put('/admin/dropship/orders/:id', requireAdmin, dropshipController.updateOrder);

// Dashboard Stats
router.get('/admin/dropship/stats', requireAdmin, dropshipController.getStats);

// Conversion Analytics (admin only)
router.get('/admin/analytics', requireAdmin, analyticsController.getAnalytics);
router.get('/admin/business-stats', requireAdmin, analyticsController.getBusinessStats);
router.get('/admin/llm-logs', requireAdmin, analyticsController.getLLMLogs);
router.get('/admin/scraper-health', requireAdmin, analyticsController.getScraperHealth);

// Supplier Auto-Check (admin only)
router.post('/admin/supplier-check', requireAdmin, async (req, res) => {
    try {
        const result = await supplierChecker.runFullCheck();
        res.json(result);
    } catch (err) {
        console.error('[SupplierCheck] Error:', err);
        res.status(500).json({ error: 'Error running supplier check' });
    }
});
router.post('/admin/supplier-check/:id', requireAdmin, async (req, res) => {
    try {
        const result = await supplierChecker.checkSingleProduct(req.params.id);
        res.json(result);
    } catch (err) {
        console.error('[SupplierCheck] Error:', err);
        res.status(500).json({ error: 'Error checking product' });
    }
});

module.exports = router;
