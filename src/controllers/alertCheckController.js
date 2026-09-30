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
            .select('id, user_id, product_name, target_price, product_url, store_name')
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
                // Prefer the exact normalized product URL; title-only matches can
                // confuse variants or unrelated products with similar names.
                let matchQuery = supabase
                    .from('price_history')
                    .select('product_title, price, store_name, normalized_url, currency')
                    .gte('created_at', windowStart)
                    .gt('price', 0);
                if (alert.product_url) {
                    const normalizedUrl = normalizeProductUrl(alert.product_url);
                    if (!normalizedUrl) {
                        await supabase.from('price_alerts')
                            .update({ last_checked_at: nowIso })
                            .eq('id', alert.id);
                        continue;
                    }
                    matchQuery = matchQuery.eq('normalized_url', normalizedUrl);
                } else {
                    matchQuery = matchQuery.ilike('product_title', `%${alert.product_name.replace(/[%_]/g, '')}%`);
                }
                if (alert.store_name) matchQuery = matchQuery.eq('store_name', alert.store_name);
                const { data: matches, error: matchErr } = await matchQuery
                    .order('price', { ascending: true })
                    .limit(1);

                if (matchErr) throw matchErr;
                if (!matches || matches.length === 0) {
                    await supabase.from('price_alerts')
                        .update({ last_checked_at: nowIso })
                        .eq('id', alert.id);
                    continue;
                }

                const best = matches[0];
                const currencyCode = String(best.currency || '').trim().toUpperCase();
                // Never compare an unlabelled amount or silently assume MXN.
                const hit = /^[A-Z]{3}$/.test(currencyCode) && Number(best.price) <= Number(alert.target_price);

                // Claim the alert atomically. A second cron run that read the same
                // row will get no returned row and must not send another message.
                const { data: claimed, error: updErr } = await supabase.from('price_alerts')
                    .update({
                        last_checked_at: nowIso,
                        last_price: best.price,
                        ...(hit ? { triggered: true } : {})
                    })
                    .eq('id', alert.id)
                    .eq('triggered', false)
                    .select('id');

                if (updErr) throw updErr;

                if (hit && claimed && claimed.length > 0) {
                    summary.triggered++;
                    const chatId = chatByUser.get(alert.user_id);
                    if (chatId) {
                        let sent = false;
                        try {
                            sent = await telegramController.sendPriceAlert(chatId, {
                                product_name: best.product_title || alert.product_name,
                                target_price: alert.target_price,
                                current_price: best.price,
                                store_name: best.store_name,
                                product_url: best.normalized_url,
                                currency_code: currencyCode
                            });
                        } catch (sendErr) {
                            console.error(`[AlertCheck] Telegram send failed for alert ${alert.id}:`, sendErr.message);
                        }

                        if (sent) {
                            summary.notified++;
                        } else {
                            // Keep the alert eligible for the next cron run when
                            // Telegram rejects the message or is temporarily down.
                            const { error: releaseErr } = await supabase.from('price_alerts')
                                .update({ triggered: false })
                                .eq('id', alert.id)
                                .eq('triggered', true);
                            if (releaseErr) throw releaseErr;
                            summary.errors++;
                        }
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

function normalizeProductUrl(value) {
    try {
        const parsed = new URL(String(value));
        return `${parsed.origin}${parsed.pathname}`.toLowerCase();
    } catch {
        return '';
    }
}
