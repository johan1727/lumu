const supabase = require('../config/supabase');
const profileCache = require('../utils/profileCache');
const regionConfigService = require('../services/regionConfigService');

const MAX_ALERTS_FREE = 3;
const MAX_ALERTS_VIP = 50;

/**
 * GET /api/price-alerts — List user's active alerts
 */
exports.listAlerts = async (req, res) => {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'Inicia sesión para usar alertas de precio.' });
    if (!supabase) return res.status(503).json({ error: 'Base de datos no disponible.' });

    try {
        const { data, error } = await supabase
            .from('price_alerts')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json({ alerts: data || [] });
    } catch (err) {
        console.error('[PriceAlerts] Error listing:', err.message);
        res.status(500).json({ error: 'Error al obtener alertas.' });
    }
};

/**
 * POST /api/price-alerts — Create a new price alert
 * Body: { product_name, target_price, product_url?, store_name? }
 */
exports.createAlert = async (req, res) => {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'Inicia sesión para crear alertas de precio.' });
    if (!supabase) return res.status(503).json({ error: 'Base de datos no disponible.' });

    const { product_name, target_price, product_url, store_name, target_currency, country_code } = req.body;

    if (!product_name || typeof product_name !== 'string' || product_name.trim().length < 2) {
        return res.status(400).json({ error: 'Nombre de producto inválido.' });
    }
    if (!target_price || isNaN(target_price) || target_price <= 0) {
        return res.status(400).json({ error: 'Precio meta debe ser mayor a 0.' });
    }
    const normalizedCountry = String(country_code || '').trim().toUpperCase();
    const normalizedCurrency = String(target_currency || '').trim().toUpperCase();
    if (!regionConfigService.getSupportedCountries().includes(normalizedCountry)
        || !/^[A-Z]{3}$/.test(normalizedCurrency)) {
        return res.status(400).json({ error: 'País o moneda de la alerta no válidos.' });
    }
    if (!product_url || !/^https:\/\//i.test(String(product_url))) {
        return res.status(400).json({ error: 'La alerta necesita el enlace exacto del producto.' });
    }

    try {
        // Check plan limits
        const profile = await profileCache.getProfile(supabase, userId, 'plan, is_premium, vip_temp_unlocked_at');
        const VIP_TEMP_DURATION_MS = 60 * 60 * 1000; // 1 hour
        const hasTempVIP = profile?.vip_temp_unlocked_at &&
            (Date.now() - new Date(profile.vip_temp_unlocked_at).getTime()) < VIP_TEMP_DURATION_MS;
        const isVIP = profile?.is_premium || profile?.plan === 'personal_vip' || profile?.plan === 'b2b' || hasTempVIP;
        const maxAlerts = isVIP ? MAX_ALERTS_VIP : MAX_ALERTS_FREE;

        const { count, error: countErr } = await supabase
            .from('price_alerts')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('triggered', false);

        if (!countErr && count >= maxAlerts) {
            return res.status(402).json({
                error: `Límite de ${maxAlerts} alertas activas alcanzado. ${!isVIP ? 'Hazte VIP para hasta 50 alertas.' : ''}`,
                paywall: !isVIP
            });
        }

        const { data, error } = await supabase
            .from('price_alerts')
            .insert({
                user_id: userId,
                product_name: product_name.trim().slice(0, 200),
                target_price: parseFloat(target_price),
                country_code: normalizedCountry,
                target_currency: normalizedCurrency,
                product_url: String(product_url).slice(0, 2000),
                store_name: store_name ? String(store_name).slice(0, 100) : null
            })
            .select()
            .single();

        if (error) throw error;
        res.json({ alert: data, message: '¡Alerta creada! Te avisaremos cuando baje el precio.' });
    } catch (err) {
        console.error('[PriceAlerts] Error creating:', err.message);
        res.status(500).json({ error: 'Error al crear la alerta.' });
    }
};

/**
 * DELETE /api/price-alerts/:id — Delete a price alert
 */
exports.deleteAlert = async (req, res) => {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'Inicia sesión para eliminar alertas.' });
    if (!supabase) return res.status(503).json({ error: 'Base de datos no disponible.' });

    const alertId = req.params.id;
    if (!alertId) return res.status(400).json({ error: 'ID de alerta requerido.' });

    try {
        const { error } = await supabase
            .from('price_alerts')
            .delete()
            .eq('id', alertId)
            .eq('user_id', userId);

        if (error) throw error;
        res.json({ message: 'Alerta eliminada.' });
    } catch (err) {
        console.error('[PriceAlerts] Error deleting:', err.message);
        res.status(500).json({ error: 'Error al eliminar la alerta.' });
    }
};

/**
 * POST /api/push-subscribe — Save push subscription
 * Body: { subscription: { endpoint, keys: { p256dh, auth } } }
 */
exports.savePushSubscription = async (req, res) => {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'Inicia sesión para activar notificaciones.' });
    if (!supabase) return res.status(503).json({ error: 'Base de datos no disponible.' });

    const { subscription } = req.body;
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
        return res.status(400).json({ error: 'Suscripción push inválida.' });
    }

    try {
        const { error } = await supabase
            .from('push_subscriptions')
            .upsert({
                user_id: userId,
                endpoint: subscription.endpoint,
                p256dh: subscription.keys.p256dh,
                auth_key: subscription.keys.auth
            }, { onConflict: 'user_id,endpoint' });

        if (error) throw error;
        res.json({ message: 'Notificaciones push activadas.' });
    } catch (err) {
        console.error('[PushSub] Error saving:', err.message);
        res.status(500).json({ error: 'Error al guardar suscripción push.' });
    }
};
