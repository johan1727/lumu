const crypto = require('crypto');
const supabase = require('../config/supabase');
const telegramController = require('./telegramController');

const MAX_ALERTS_PER_RUN = 200;
const PRICE_WINDOW_HOURS = 48;

// GET /api/cron/check-alerts — Daily Vercel Cron.
// Compares active price_alerts against recent price_history and notifies
// via Telegram when the target price is reached.
exports.checkAlerts = async (req, res) => {
    // Vercel Cron sends "Authorization: Bearer <CRON_SECRET>" when the env var exists
    const cronSecret = process.env.CRON_SECRET;
    if (process.env.NODE_ENV === 'production') {
        const authHeader = String(req.headers.authorization || '');
        if (!cronSecret || !timingSafeMatch(authHeader, `Bearer ${cronSecret}`)) {
            return res.status(403).json({ error: 'Forbidden' });
        }
    }
    if (!supabase) return res.status(503).json({ error: 'Base de datos no disponible.' });

    const summary = { checked: 0, triggered: 0, notified: 0, errors: 0 };

    try {
        const { data: alerts, error: alertsErr } = await supabase
            .from('price_alerts')
            .select('id, user_id, product_name, target_price, store_name')
            .eq('triggered', false)
            .limit(MAX_ALERTS_PER_RUN);

        if (alertsErr) throw alertsErr;
        if (!alerts || alerts.length === 0) {
            return res.json({ ok: true, ...summary, message: 'Sin alertas activas.' });
        }

        // Batch-fetch telegram chat ids for all alert owners
        const userIds = [...new Set(alerts.map(a => a.user_id))];
        const { data: profiles } = await supabase
            .from('profiles')
            .select('id, telegram_chat_id')
            .in('id', userIds);
        const chatByUser = new Map((profiles || []).map(p => [p.id, p.telegram_chat_id]));

        const windowStart = new Date(Date.now() - PRICE_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
        const nowIso = new Date().toISOString();

        for (const alert of alerts) {
            summary.checked++;
            try {
                // Cheapest fresh price whose title matches the alerted product
                const { data: matches, error: matchErr } = await supabase
                    .from('price_history')
                    .select('product_title, price, store_name, normalized_url, currency')
                    .ilike('product_title', `%${alert.product_name.replace(/[%_]/g, '')}%`)
                    .gte('created_at', windowStart)
                    .gt('price', 0)
                    .order('price', { ascending: true })
                    .limit(1);

                if (matchErr || !matches || matches.length === 0) {
                    await supabase.from('price_alerts')
                        .update({ last_checked_at: nowIso })
                        .eq('id', alert.id);
                    continue;
                }

                const best = matches[0];
                const hit = Number(best.price) <= Number(alert.target_price);

                // Mark triggered BEFORE notifying so a crash/retry can't double-send
                const { error: updErr } = await supabase.from('price_alerts')
                    .update({
                        last_checked_at: nowIso,
                        last_price: best.price,
                        ...(hit ? { triggered: true } : {})
                    })
                    .eq('id', alert.id);

                if (hit && !updErr) {
                    summary.triggered++;
                    const chatId = chatByUser.get(alert.user_id);
                    if (chatId) {
                        const sent = await telegramController.sendPriceAlert(chatId, {
                            product_name: best.product_title || alert.product_name,
                            target_price: alert.target_price,
                            current_price: best.price,
                            store_name: best.store_name,
                            product_url: best.normalized_url,
                            currency_code: best.currency || 'MXN'
                        });
                        if (sent) summary.notified++;
                    }
                }
            } catch (err) {
                summary.errors++;
                console.error(`[AlertCheck] Error on alert ${alert.id}:`, err.message);
            }
        }

        console.log('[AlertCheck] Run complete:', JSON.stringify(summary));
        res.json({ ok: true, ...summary });
    } catch (err) {
        console.error('[AlertCheck] Fatal:', err.message);
        res.status(500).json({ ok: false, error: 'Error al revisar alertas.', ...summary });
    }
};

function timingSafeMatch(a, b) {
    const ha = crypto.createHmac('sha256', 'lumu-cron').update(String(a)).digest();
    const hb = crypto.createHmac('sha256', 'lumu-cron').update(String(b)).digest();
    return crypto.timingSafeEqual(ha, hb);
}
