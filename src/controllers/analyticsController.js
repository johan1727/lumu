const supabase = require('../config/supabase');
const scraperMonitor = require('../services/scraperMonitor');
const regionConfigService = require('../services/regionConfigService');

function clampNumber(value, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    return Math.max(min, Math.min(max, parsed));
}

function startOfDay(date = new Date()) {
    const value = new Date(date);
    value.setHours(0, 0, 0, 0);
    return value;
}

function isoDay(date = new Date()) {
    return startOfDay(date).toISOString().split('T')[0];
}

function normalizeText(value, maxLen = 200) {
    const normalized = String(value || '').trim();
    return normalized ? normalized.slice(0, maxLen) : null;
}

function shouldStrengthenIntentMemory(eventType) {
    return ['click', 'favorite', 'alert_create', 'compare', 'history_open', 'feedback_positive'].includes(String(eventType || '').toLowerCase());
}

function buildIntentMemoryWeights(eventType, engagementMs = 0) {
    const normalizedEvent = String(eventType || '').toLowerCase();
    const engagementBoost = engagementMs >= 20000 ? 0.45 : engagementMs >= 8000 ? 0.2 : 0;
    if (normalizedEvent === 'favorite') return { clickDelta: 1, successDelta: 1.6 + engagementBoost };
    if (normalizedEvent === 'alert_create') return { clickDelta: 1, successDelta: 2 + engagementBoost };
    if (normalizedEvent === 'compare') return { clickDelta: 1, successDelta: 1.25 + engagementBoost };
    if (normalizedEvent === 'history_open') return { clickDelta: 1, successDelta: 1.05 + engagementBoost };
    if (normalizedEvent === 'feedback_positive') return { clickDelta: 1, successDelta: 1.8 + engagementBoost };
    return { clickDelta: 1, successDelta: 1 + engagementBoost };
}

/**
 * POST /api/track — Log a conversion event (click, ad_view, etc.)
 * Lightweight, fire-and-forget from frontend.
 */
async function trackEvent(req, res) {
    try {
        const {
            event_type,
            product_title,
            store,
            url,
            search_query,
            device,
            canonical_key,
            product_category,
            position,
            result_source,
            store_tier,
            best_buy_score,
            session_id,
            search_id,
            engagement_ms,
            action_context,
            price,
            feedback_label,
            brand
        } = req.body;

        if (!event_type) {
            return res.status(400).json({ error: 'event_type requerido' });
        }

        // Determine affiliate network from URL
        let is_affiliate = false;
        let affiliate_network = 'none';
        if (url) {
            const urlLower = url.toLowerCase();
            if (urlLower.includes('amazon') && urlLower.includes('tag=')) {
                is_affiliate = true;
                affiliate_network = 'amazon';
            } else if ((urlLower.includes('mercadolibre') || urlLower.includes('mercadoli')) && urlLower.includes('re_id=')) {
                is_affiliate = true;
                affiliate_network = 'mercadolibre';
            } else if (urlLower.includes('aliexpress') && urlLower.includes('aff_short_key=')) {
                is_affiliate = true;
                affiliate_network = 'aliexpress';
            } else if (urlLower.includes('go.skimresources') || urlLower.includes('redirect.viglink')) {
                is_affiliate = true;
                affiliate_network = 'skimlinks';
            }
        }

        const event = {
            user_id: req.userId || null,
            event_type,
            product_title: (product_title || '').slice(0, 500),
            store: (store || '').slice(0, 200),
            url: (url || '').slice(0, 2000),
            search_query: (search_query || '').slice(0, 500),
            is_affiliate,
            affiliate_network,
            device: device || 'unknown',
            referrer: (req.headers.referer || '').slice(0, 500),
            country_code: regionConfigService.resolveCountry(req),
            canonical_key: (canonical_key || '').slice(0, 160) || null,
            product_category: (product_category || '').slice(0, 120) || null,
            position: clampNumber(position, { min: 0, max: 500 }),
            result_source: normalizeText(result_source, 80),
            store_tier: clampNumber(store_tier, { min: 1, max: 3 }),
            best_buy_score: clampNumber(best_buy_score, { min: 0, max: 1 }),
            session_id: normalizeText(session_id, 120),
            search_id: normalizeText(search_id, 120),
            engagement_ms: clampNumber(engagement_ms, { min: 0, max: 86400000 }),
            action_context: normalizeText(action_context, 80),
            price: clampNumber(price, { min: 0, max: 999999999 }),
            feedback_label: normalizeText(feedback_label, 120),
            brand: normalizeText(brand, 120)
        };

        if (supabase) {
            // Fire and forget — don't block response
            supabase.from('click_events').insert(event).then(({ error }) => {
                if (error) console.error('[Analytics] Insert error:', error.message);
            });

            // Auto-improve: upsert query_intent_memory on strong interaction signals
            if (shouldStrengthenIntentMemory(event_type) && search_query && store) {
                const normalizedQuery = (search_query || '').toLowerCase().trim();
                const storeKey = (store || '').toLowerCase().trim();
                const catKey = (product_category || '').toLowerCase().trim();
                const cKey = (canonical_key || '').slice(0, 160) || null;
                const cc = event.country_code || 'MX';
                const weights = buildIntentMemoryWeights(event_type, Number(event.engagement_ms || 0));

                if (normalizedQuery && storeKey) {
                    supabase.rpc('upsert_query_intent_memory', {
                        p_normalized_query: normalizedQuery,
                        p_canonical_key: cKey,
                        p_country_code: cc,
                        p_product_category: product_category || null,
                        p_product_category_key: catKey,
                        p_store_name: store,
                        p_store_name_key: storeKey
                    }).then(({ error: rpcErr }) => {
                        if (rpcErr) {
                            // Fallback: direct upsert if RPC doesn't exist yet
                            supabase.from('query_intent_memory').upsert({
                                normalized_query: normalizedQuery,
                                canonical_key: cKey,
                                country_code: cc,
                                product_category: product_category || null,
                                product_category_key: catKey,
                                store_name: store,
                                store_name_key: storeKey,
                                clicked_count: weights.clickDelta,
                                success_score: weights.successDelta,
                                last_clicked_at: new Date().toISOString()
                            }, {
                                onConflict: 'normalized_query,country_code,product_category_key,store_name_key'
                            }).then(({ error: upsertErr }) => {
                                if (upsertErr) console.error('[IntentMemory] Upsert error:', upsertErr.message);
                            });
                        }
                    });
                }
            }
        }

        res.json({ ok: true });
    } catch (err) {
        console.error('[Analytics] trackEvent error:', err);
        res.json({ ok: true }); // Never fail the user's click flow
    }
}

/**
 * GET /api/admin/analytics — Conversion dashboard stats (admin only)
 */
async function getAnalytics(req, res) {
    try {
        if (!supabase) return res.status(503).json({ error: 'Base de datos no disponible' });

        const { period, group_by } = req.query;
        let dateFilter = null;
        const now = new Date();

        if (period === 'today') {
            dateFilter = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        } else if (period === 'week') {
            dateFilter = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        } else if (period === 'month') {
            dateFilter = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
        }

        // Fetch all events for period
        let query = supabase.from('click_events').select('*').order('created_at', { ascending: false });
        if (dateFilter) query = query.gte('created_at', dateFilter);
        query = query.limit(5000); // Cap for performance

        const { data: events, error } = await query;
        if (error) throw error;
        const all = events || [];

        const uniqueBySession = (eventType) => new Set(
            all
                .filter(e => e.event_type === eventType && e.session_id)
                .map(e => e.session_id)
        ).size;

        const safeRate = (numerator, denominator) => denominator > 0
            ? ((numerator / denominator) * 100).toFixed(1)
            : '0.0';

        // --- Totals ---
        const totalPageViews = all.filter(e => e.event_type === 'page_view').length;
        const totalClicks = all.filter(e => e.event_type === 'click').length;
        const totalSearches = all.filter(e => e.event_type === 'search').length;
        const totalPricingViews = all.filter(e => e.event_type === 'pricing_view').length;
        const totalCheckoutClicks = all.filter(e => e.event_type === 'checkout_click').length;
        const totalPurchases = all.filter(e => e.event_type === 'purchase').length;
        const totalAdViews = all.filter(e => e.event_type === 'ad_view').length;
        const totalFavorites = all.filter(e => e.event_type === 'favorite').length;
        const totalAlerts = all.filter(e => e.event_type === 'alert_create').length;
        const totalZeroResults = all.filter(e => e.event_type === 'zero_results').length;
        const totalBounces = all.filter(e => e.event_type === 'bounce').length;
        const totalAuthModalOpens = all.filter(e => e.event_type === 'auth_modal_open').length;
        const totalAuthModalDismisses = all.filter(e => e.event_type === 'auth_modal_dismiss').length;
        const totalSignupComplete = all.filter(e => e.event_type === 'signup_complete').length;
        const totalSignupBonus = all.filter(e => e.event_type === 'signup_bonus').length;
        const uniqueVisitors = uniqueBySession('page_view');
        const uniqueSearchUsers = uniqueBySession('search');
        const uniquePricingVisitors = uniqueBySession('pricing_view');
        const uniqueCheckoutUsers = uniqueBySession('checkout_click');
        const uniquePurchasers = new Set(
            all
                .filter(e => e.event_type === 'purchase')
                .map(e => e.user_id || e.session_id)
                .filter(Boolean)
        ).size;

        // --- Conversion Rate (searches → clicks) ---
        const conversionRate = totalSearches > 0 ? ((totalClicks / totalSearches) * 100).toFixed(1) : '0.0';
        const bounceRate = totalSearches > 0 ? ((totalBounces / totalSearches) * 100).toFixed(1) : '0.0';
        const signupConversionRate = totalAuthModalOpens > 0 ? ((totalSignupComplete / totalAuthModalOpens) * 100).toFixed(1) : '0.0';
        const visitorToSearchRate = safeRate(uniqueSearchUsers, uniqueVisitors);
        const searchToPricingRate = safeRate(uniquePricingVisitors, uniqueSearchUsers);
        const pricingToCheckoutRate = safeRate(uniqueCheckoutUsers, uniquePricingVisitors);
        const checkoutToPurchaseRate = safeRate(uniquePurchasers, uniqueCheckoutUsers);

        // --- Affiliate clicks ---
        const affiliateClicks = all.filter(e => e.event_type === 'click' && e.is_affiliate);
        const totalAffiliateClicks = affiliateClicks.length;

        // --- By Network ---
        const byNetwork = {};
        affiliateClicks.forEach(e => {
            const net = e.affiliate_network || 'none';
            byNetwork[net] = (byNetwork[net] || 0) + 1;
        });

        // --- By Store ---
        const byStore = {};
        all.filter(e => e.event_type === 'click').forEach(e => {
            const store = e.store || 'Desconocida';
            byStore[store] = (byStore[store] || 0) + 1;
        });
        const topStores = Object.entries(byStore)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([store, clicks]) => ({ store, clicks }));

        // --- By Device ---
        const byDevice = { mobile: 0, desktop: 0, tablet: 0, unknown: 0 };
        all.filter(e => e.event_type === 'click').forEach(e => {
            const d = e.device || 'unknown';
            byDevice[d] = (byDevice[d] || 0) + 1;
        });

        // --- Top Products clicked ---
        const byProduct = {};
        all.filter(e => e.event_type === 'click' && e.product_title).forEach(e => {
            const key = e.product_title;
            if (!byProduct[key]) byProduct[key] = { title: key, clicks: 0, store: e.store };
            byProduct[key].clicks++;
        });
        const topProducts = Object.values(byProduct)
            .sort((a, b) => b.clicks - a.clicks)
            .slice(0, 10);

        // --- Top Searches ---
        const bySearch = {};
        all.filter(e => e.event_type === 'search' && e.search_query).forEach(e => {
            const q = e.search_query.toLowerCase().trim();
            bySearch[q] = (bySearch[q] || 0) + 1;
        });
        const topSearches = Object.entries(bySearch)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 15)
            .map(([query, count]) => ({ query, count }));

        // --- Hourly distribution (last 24h) ---
        const hourly = Array(24).fill(0);
        const twentyFourHAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        all.filter(e => e.event_type === 'click' && new Date(e.created_at) >= twentyFourHAgo).forEach(e => {
            const h = new Date(e.created_at).getHours();
            hourly[h]++;
        });

        // --- Ad funnel ---
        const adViews = all.filter(e => e.event_type === 'ad_view').length;
        const adSkips = all.filter(e => e.event_type === 'ad_skip').length;
        const adCompletionRate = adViews > 0 ? (((adViews - adSkips) / adViews) * 100).toFixed(1) : '0.0';

        // --- Daily trend (last 7 days) ---
        const dailyTrend = [];
        for (let i = 6; i >= 0; i--) {
            const day = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
            const dayStr = day.toISOString().split('T')[0];
            const dayClicks = all.filter(e => e.event_type === 'click' && e.created_at.startsWith(dayStr)).length;
            const daySearches = all.filter(e => e.event_type === 'search' && e.created_at.startsWith(dayStr)).length;
            dailyTrend.push({ date: dayStr, clicks: dayClicks, searches: daySearches });
        }

        res.json({
            summary: {
                totalPageViews,
                uniqueVisitors,
                totalClicks,
                totalSearches,
                totalPricingViews,
                uniquePricingVisitors,
                totalCheckoutClicks,
                uniqueCheckoutUsers,
                totalPurchases,
                uniquePurchasers,
                conversionRate,
                bounceRate,
                visitorToSearchRate,
                searchToPricingRate,
                pricingToCheckoutRate,
                checkoutToPurchaseRate,
                totalBounces,
                totalZeroResults,
                totalAuthModalOpens,
                totalAuthModalDismisses,
                totalSignupComplete,
                totalSignupBonus,
                signupConversionRate,
                totalAffiliateClicks,
                totalAdViews,
                totalFavorites,
                totalAlerts,
                adCompletionRate
            },
            byNetwork,
            byDevice,
            topStores,
            topProducts,
            topSearches,
            hourlyDistribution: hourly,
            dailyTrend
        });
    } catch (err) {
        console.error('[Analytics] getAnalytics error:', err);
        res.status(500).json({ error: 'Error al obtener analytics' });
    }
}

async function getLLMLogs(req, res) {
    try {
        if (!supabase) return res.status(503).json({ error: 'Base de datos no disponible' });
        const limit = Math.min(200, Math.max(1, parseInt(req.query.limit || '50', 10) || 50));
        const country = String(req.query.country || '').trim().toUpperCase();

        let query = supabase
            .from('llm_analysis_log')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit);

        if (country) {
            query = query.eq('country_code', country);
        }

        const { data, error } = await query;
        if (error) throw error;

        res.json({
            count: Array.isArray(data) ? data.length : 0,
            items: data || []
        });
    } catch (err) {
        console.error('[Analytics] getLLMLogs error:', err);
        res.status(500).json({ error: 'Error al obtener logs del LLM' });
    }
}

async function getScraperHealth(req, res) {
    try {
        const report = scraperMonitor.getHealthReport();
        const items = Object.entries(report).map(([name, stats]) => {
            const success = Number(stats.success || 0);
            const fail = Number(stats.fail || 0);
            const total = success + fail;
            const blockRateValue = parseInt(String(stats.blockRate || '0').replace('%', ''), 10) || 0;
            return {
                name,
                success,
                fail,
                total,
                blockRate: stats.blockRate,
                blockRateValue,
                status: stats.status,
                lastBlock: stats.lastBlock
            };
        }).sort((a, b) => b.blockRateValue - a.blockRateValue || b.fail - a.fail);

        const summary = {
            totalScrapers: items.length,
            critical: items.filter(item => item.blockRateValue > 50).length,
            warning: items.filter(item => item.blockRateValue > 20 && item.blockRateValue <= 50).length,
            healthy: items.filter(item => item.blockRateValue <= 20).length,
            totalSuccess: items.reduce((acc, item) => acc + item.success, 0),
            totalFail: items.reduce((acc, item) => acc + item.fail, 0)
        };

        res.json({ summary, items });
    } catch (err) {
        console.error('[Analytics] getScraperHealth error:', err);
        res.status(500).json({ error: 'Error al obtener salud de scrapers' });
    }
}

async function getBusinessStats(req, res) {
    try {
        if (!supabase) return res.status(503).json({ error: 'Base de datos no disponible' });

        const now = new Date();
        const todayStart = startOfDay(now);
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        const [
            searchesTodayResult,
            searches30dResult,
            profilesResult,
            subscriptionsResult,
            purchases30dResult,
            affiliateClicks30dResult,
            searchesForRetentionResult,
            clickEvents7dResult
        ] = await Promise.all([
            supabase.from('searches').select('*', { count: 'exact', head: true }).gte('created_at', todayStart.toISOString()),
            supabase.from('searches').select('*', { count: 'exact', head: true }).gte('created_at', thirtyDaysAgo.toISOString()),
            supabase.from('profiles').select('id, created_at, plan, is_premium').gte('created_at', thirtyDaysAgo.toISOString()),
            supabase.from('subscriptions').select('user_id, plan, status, amount_paid, currency, created_at').order('created_at', { ascending: false }).limit(5000),
            supabase.from('click_events').select('price, created_at, action_context, brand').eq('event_type', 'purchase').gte('created_at', thirtyDaysAgo.toISOString()).limit(5000),
            supabase.from('click_events').select('id, created_at').eq('event_type', 'click').eq('is_affiliate', true).gte('created_at', thirtyDaysAgo.toISOString()).limit(5000),
            supabase.from('searches').select('user_id, created_at').gte('created_at', thirtyDaysAgo.toISOString()).limit(10000),
            supabase.from('click_events').select('event_type, created_at').gte('created_at', sevenDaysAgo.toISOString()).limit(10000)
        ]);

        if (searchesTodayResult.error) throw searchesTodayResult.error;
        if (searches30dResult.error) throw searches30dResult.error;
        if (profilesResult.error) throw profilesResult.error;
        if (subscriptionsResult.error) throw subscriptionsResult.error;
        if (purchases30dResult.error) throw purchases30dResult.error;
        if (affiliateClicks30dResult.error) throw affiliateClicks30dResult.error;
        if (searchesForRetentionResult.error) throw searchesForRetentionResult.error;
        if (clickEvents7dResult.error) throw clickEvents7dResult.error;

        const profiles = profilesResult.data || [];
        const subscriptions = subscriptionsResult.data || [];
        const purchases30d = purchases30dResult.data || [];
        const affiliateClicks30d = affiliateClicks30dResult.data || [];
        const searchesForRetention = searchesForRetentionResult.data || [];
        const clickEvents7d = clickEvents7dResult.data || [];

        const activePaidSubscriptions = subscriptions.filter(item => ['active', 'trialing', 'paid', 'complete'].includes(String(item.status || '').toLowerCase()));
        const vipActive = activePaidSubscriptions.filter(item => ['personal_vip', 'personal_vip_annual', 'vip'].includes(String(item.plan || '').toLowerCase())).length;
        const b2bActive = activePaidSubscriptions.filter(item => ['b2b', 'b2b_annual'].includes(String(item.plan || '').toLowerCase())).length;

        const registrationsToday = profiles.filter(item => item.created_at && item.created_at >= todayStart.toISOString()).length;
        const registrations30d = profiles.length;
        const totalRevenue30d = purchases30d.reduce((acc, item) => acc + Number(item.price || 0), 0);
        const affiliateClicksCount30d = affiliateClicks30d.length;
        const searchesToday = searchesTodayResult.count || 0;
        const searches30d = searches30dResult.count || 0;
        const vipConversionRate30d = registrations30d > 0 ? Number(((vipActive / registrations30d) * 100).toFixed(2)) : 0;
        const b2bConversionRate30d = registrations30d > 0 ? Number(((b2bActive / registrations30d) * 100).toFixed(2)) : 0;
        const avgRevenuePerPurchase30d = purchases30d.length > 0 ? Number((totalRevenue30d / purchases30d.length).toFixed(2)) : 0;

        const retentionBuckets = new Map();
        searchesForRetention.forEach(item => {
            const userId = item.user_id;
            if (!userId) return;
            const createdAt = item.created_at ? new Date(item.created_at).getTime() : 0;
            if (!createdAt) return;
            const current = retentionBuckets.get(userId) || { first: createdAt, last: createdAt, count: 0 };
            current.first = Math.min(current.first, createdAt);
            current.last = Math.max(current.last, createdAt);
            current.count += 1;
            retentionBuckets.set(userId, current);
        });

        const retainedUsers30d = Array.from(retentionBuckets.values()).filter(item => item.count >= 2 && (item.last - item.first) >= (7 * 24 * 60 * 60 * 1000)).length;
        const searchedUsers30d = retentionBuckets.size;
        const retentionRate30d = searchedUsers30d > 0 ? Number(((retainedUsers30d / searchedUsers30d) * 100).toFixed(2)) : 0;

        const dailyMap = new Map();
        for (let i = 6; i >= 0; i--) {
            const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
            dailyMap.set(isoDay(date), { date: isoDay(date), searches: 0, pageViews: 0, purchases: 0 });
        }

        clickEvents7d.forEach(item => {
            if (!item.created_at) return;
            const key = String(item.created_at).split('T')[0];
            const current = dailyMap.get(key);
            if (!current) return;
            if (item.event_type === 'search') current.searches += 1;
            if (item.event_type === 'page_view') current.pageViews += 1;
            if (item.event_type === 'purchase') current.purchases += 1;
        });

        const estimatedCostPerSearchUsd = 0;
        const estimatedSearchCost30dUsd = Number((searches30d * estimatedCostPerSearchUsd).toFixed(2));

        res.json({
            summary: {
                searchesToday,
                searches30d,
                registrationsToday,
                registrations30d,
                vipActive,
                b2bActive,
                vipConversionRate30d,
                b2bConversionRate30d,
                affiliateClicks30d: affiliateClicksCount30d,
                purchaseCount30d: purchases30d.length,
                revenue30d: Number(totalRevenue30d.toFixed(2)),
                avgRevenuePerPurchase30d,
                retentionRate30d,
                estimatedCostPerSearchUsd,
                estimatedSearchCost30dUsd
            },
            dailyTrend7d: Array.from(dailyMap.values()),
            notes: {
                estimatedCostPerSearchUsd: 'Configura una fuente persistente basada en logs [Search Cost] para reemplazar este valor.',
                retention: 'Retención 30d calculada como usuarios con al menos 2 búsquedas separadas por 7+ días dentro de la ventana.'
            }
        });
    } catch (err) {
        console.error('[Analytics] getBusinessStats error:', err);
        res.status(500).json({ error: 'Error al obtener business stats' });
    }
}

module.exports = { trackEvent, getAnalytics, getLLMLogs, getScraperHealth, getBusinessStats };
