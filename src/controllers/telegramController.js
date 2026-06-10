const crypto = require('crypto');
const supabase = require('../config/supabase');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const BOT_USERNAME = 'LumuAlertasBot';
const TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes

async function sendMessage(chatId, text) {
    if (!BOT_TOKEN) {
        console.warn('[Telegram] TELEGRAM_BOT_TOKEN not set');
        return false;
    }
    try {
        const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true })
        });
        const data = await res.json();
        if (!data.ok) console.warn('[Telegram] sendMessage failed:', data.description);
        return data.ok;
    } catch (err) {
        console.error('[Telegram] sendMessage error:', err.message);
        return false;
    }
}

// POST /api/telegram/webhook — Called by Telegram servers
exports.handleWebhook = async (req, res) => {
    // Verify the request comes from Telegram via shared secret
    if (WEBHOOK_SECRET) {
        const incoming = req.headers['x-telegram-bot-api-secret-token'];
        if (!incoming || incoming !== WEBHOOK_SECRET) {
            return res.status(403).json({ error: 'Forbidden' });
        }
    }

    // Always ACK immediately — Telegram retries if we don't respond within 5s
    res.json({ ok: true });

    const update = req.body;
    if (!update?.message) return;

    const { chat, from, text: rawText } = update.message;
    const chatId = chat?.id;
    const firstName = from?.first_name || 'Usuario';
    const text = (rawText || '').trim();

    if (!chatId) return;

    if (text.startsWith('/start')) {
        const token = text.split(' ')[1]?.trim();

        if (!token) {
            await sendMessage(chatId,
                `👋 ¡Hola ${firstName}! Soy el bot de alertas de <b>Lumu</b>.\n\n` +
                `Para conectar tu cuenta, abre <a href="https://www.lumu.dev">lumu.dev</a>, ` +
                `ve a la sección de alertas y haz clic en "Conectar Telegram".`
            );
            return;
        }

        if (!supabase) {
            await sendMessage(chatId, '❌ Error interno. Intenta de nuevo en unos minutos.');
            return;
        }

        const { data: linkToken, error: tokenErr } = await supabase
            .from('telegram_link_tokens')
            .select('user_id, expires_at')
            .eq('token', token)
            .single();

        if (tokenErr || !linkToken) {
            await sendMessage(chatId,
                '❌ El enlace no es válido o ya fue usado.\n\n' +
                'Genera uno nuevo en <a href="https://www.lumu.dev">lumu.dev</a> → Alertas → Conectar Telegram.'
            );
            return;
        }

        if (new Date(linkToken.expires_at) < new Date()) {
            await supabase.from('telegram_link_tokens').delete().eq('token', token);
            await sendMessage(chatId,
                '⏰ El enlace expiró (válido por 10 minutos).\n\n' +
                'Genera uno nuevo en <a href="https://www.lumu.dev">lumu.dev</a> → Alertas → Conectar Telegram.'
            );
            return;
        }

        const { error: updateErr } = await supabase
            .from('profiles')
            .update({ telegram_chat_id: String(chatId) })
            .eq('id', linkToken.user_id);

        await supabase.from('telegram_link_tokens').delete().eq('token', token);

        if (updateErr) {
            console.error('[Telegram] Failed to save chat_id:', updateErr.message);
            await sendMessage(chatId, '❌ Error al vincular tu cuenta. Escríbenos a soporte.lumu@gmail.com.');
            return;
        }

        await sendMessage(chatId,
            `✅ <b>¡Listo, ${firstName}!</b> Tu cuenta Lumu está conectada.\n\n` +
            `📦 Crea alertas de precio en <a href="https://www.lumu.dev">lumu.dev</a> ` +
            `y te aviso aquí cuando el precio baje a tu meta.\n\n` +
            `Para desconectar en cualquier momento escribe /stop`
        );
        return;
    }

    if (text === '/stop') {
        if (!supabase) {
            await sendMessage(chatId, '❌ Error interno. Intenta de nuevo.');
            return;
        }
        const { error } = await supabase
            .from('profiles')
            .update({ telegram_chat_id: null })
            .eq('telegram_chat_id', String(chatId));

        if (error) {
            await sendMessage(chatId, '❌ Error al desconectar. Escríbenos a soporte.lumu@gmail.com.');
        } else {
            await sendMessage(chatId,
                '✅ Cuenta desconectada. Ya no recibirás alertas de Lumu.\n\n' +
                'Para volver a conectar, ve a <a href="https://www.lumu.dev">lumu.dev</a> → Alertas → Conectar Telegram.'
            );
        }
        return;
    }

    await sendMessage(chatId,
        `Hola ${firstName}! 👋\n\n` +
        `Soy el bot de notificaciones de Lumu — solo envío alertas cuando un precio baja.\n\n` +
        `Gestiona tus alertas en <a href="https://www.lumu.dev">lumu.dev</a>.`
    );
};

// POST /api/telegram/connect — Generate magic deep link token (requires auth)
exports.generateLinkToken = async (req, res) => {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'Inicia sesión para conectar Telegram.' });
    if (!supabase) return res.status(503).json({ error: 'Base de datos no disponible.' });

    try {
        // One token per user at a time
        await supabase.from('telegram_link_tokens').delete().eq('user_id', userId);

        const token = crypto.randomBytes(16).toString('hex');
        const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

        const { error } = await supabase
            .from('telegram_link_tokens')
            .insert({ user_id: userId, token, expires_at: expiresAt });

        if (error) throw error;

        res.json({
            ok: true,
            url: `https://t.me/${BOT_USERNAME}?start=${token}`,
            expires_in_seconds: TOKEN_TTL_MS / 1000
        });
    } catch (err) {
        console.error('[Telegram] generateLinkToken error:', err.message);
        res.status(500).json({ error: 'Error al generar enlace.' });
    }
};

// GET /api/telegram/status — Check if user has Telegram connected (requires auth)
exports.getStatus = async (req, res) => {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'No autenticado.' });
    if (!supabase) return res.status(503).json({ error: 'Base de datos no disponible.' });

    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('telegram_chat_id')
            .eq('id', userId)
            .single();

        if (error) throw error;
        res.json({ ok: true, connected: !!data?.telegram_chat_id });
    } catch (err) {
        console.error('[Telegram] getStatus error:', err.message);
        res.status(500).json({ error: 'Error al verificar estado.' });
    }
};

// DELETE /api/telegram/disconnect — Remove telegram_chat_id (requires auth)
exports.disconnect = async (req, res) => {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'No autenticado.' });
    if (!supabase) return res.status(503).json({ error: 'Base de datos no disponible.' });

    try {
        const { error } = await supabase
            .from('profiles')
            .update({ telegram_chat_id: null })
            .eq('id', userId);

        if (error) throw error;
        res.json({ ok: true, message: 'Telegram desconectado.' });
    } catch (err) {
        console.error('[Telegram] disconnect error:', err.message);
        res.status(500).json({ error: 'Error al desconectar.' });
    }
};

// Exported utility: send a price alert to a user via Telegram chat_id
exports.sendPriceAlert = async (chatId, { product_name, target_price, current_price, store_name, product_url, currency_symbol = '$', currency_code = 'MXN' }) => {
    const savings = (target_price - current_price).toLocaleString('es-MX', { maximumFractionDigits: 0 });
    const savingsPct = Math.round(((target_price - current_price) / target_price) * 100);

    let text =
        `🔔 <b>¡Alerta de precio Lumu!</b>\n\n` +
        `📦 <b>${product_name}</b>\n` +
        `💰 Precio actual: <b>${currency_symbol}${Number(current_price).toLocaleString('es-MX')} ${currency_code}</b>\n` +
        `🎯 Tu meta: ${currency_symbol}${Number(target_price).toLocaleString('es-MX')} ${currency_code}\n`;

    if (current_price < target_price) {
        text += `✅ ¡Ahorras <b>${currency_symbol}${savings} (${savingsPct}%)</b>!\n`;
    }

    if (store_name) text += `🏪 En: ${store_name}\n`;
    if (product_url && product_url !== '#') text += `\n<a href="${product_url}">👉 Ver oferta</a>`;

    return sendMessage(chatId, text);
};
