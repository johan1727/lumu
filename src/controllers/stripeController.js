const supabase = require('../config/supabase');

const stripe = process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null;

// Live price IDs verificados contra la cuenta Stripe "Consiguemelo AILumu" (2026-06-12).
// Los hardcodeados anteriores (..E8s9f9Vj9D..) eran de OTRA cuenta y no existían aquí:
// si faltaba la env var, el checkout fallaba con "No such price". Las env vars
// STRIPE_*_PRICE_ID siguen teniendo prioridad si están definidas.
//   personal_vip         $39 MXN/mes    → "Consíguemelo VIP"
//   personal_vip_annual  $399 MXN/año   → "Consíguemelo VIP ANUAL"
//   b2b                  $199 MXN/mes   → "Consíguemelo Mayorista VIP"
//   b2b_annual           $1,999 MXN/año → "Consíguemelo Mayorista VIP ANUAL"
const PLAN_PRICE_ID_MAP = {
    b2b_annual: process.env.STRIPE_B2B_ANNUAL_PRICE_ID || 'price_1TEGeh1H4K5iuzsCVDKHlDXc',
    b2b: process.env.STRIPE_B2B_PRICE_ID || 'price_1T6PsM1H4K5iuzsCyYtywDPG',
    personal_vip_annual: process.env.STRIPE_VIP_ANNUAL_PRICE_ID || 'price_1TEGf71H4K5iuzsCFMZMnkmR',
    personal_vip: process.env.STRIPE_VIP_PRICE_ID || 'price_1T6HHr1H4K5iuzsCFhQKxf7R'
};

// Mapa inverso (priceId → plan) derivado del directo para que el webhook y el
// checkout nunca se desincronicen aunque se sobreescriban las env vars.
const STRIPE_PRICE_PLAN_MAP = Object.fromEntries(
    Object.entries(PLAN_PRICE_ID_MAP).map(([plan, priceId]) => [priceId, plan])
);

// FIX #1: Helper que lanza si Supabase devuelve error en operaciones críticas
function assertNoSupabaseError(error, context) {
    if (error) {
        throw new Error(`[Stripe/${context}] Supabase error: ${error.message} (code: ${error.code})`);
    }
}

async function resolvePlanFromSession(session) {
    const metadataPlan = String(session?.metadata?.plan || '').trim();
    if (metadataPlan) return metadataPlan;
    if (!stripe || !session?.id) return 'personal_vip';
    try {
        const items = await stripe.checkout.sessions.listLineItems(session.id, { limit: 10 });
        const activePriceId = items?.data?.[0]?.price?.id || '';
        return STRIPE_PRICE_PLAN_MAP[activePriceId] || 'personal_vip';
    } catch (error) {
        console.error('[Stripe] Error resolviendo plan desde line items:', error.message);
        return 'personal_vip';
    }
}

async function resolveUserIdFromSession(session) {
    const directUserId = String(session?.client_reference_id || '').trim();
    if (directUserId) return directUserId;
    const candidateEmail = String(session?.customer_email || session?.customer_details?.email || '').trim().toLowerCase();
    if (!candidateEmail || !supabase) return null;
    const { data: userByEmail } = await supabase
        .from('profiles')
        .select('id')
        .ilike('email', candidateEmail)
        .maybeSingle();
    return userByEmail?.id || null;
}

function normalizeRequestedPlan(plan = '') {
    const normalized = String(plan || '').trim().toLowerCase();
    if (normalized === 'vip') return 'personal_vip';
    if (normalized === 'vip_annual') return 'personal_vip_annual';
    return PLAN_PRICE_ID_MAP[normalized] ? normalized : null;
}

async function trackPurchaseEvent({ userId = null, session, plan }) {
    if (!supabase || !session) return;
    const purchaseEvent = {
        user_id: userId,
        event_type: 'purchase',
        product_title: '',
        store: 'stripe',
        url: '',
        search_query: '',
        is_affiliate: false,
        affiliate_network: 'none',
        device: 'server',
        referrer: 'stripe_webhook',
        country_code: null,
        canonical_key: null,
        product_category: 'subscription',
        position: null,
        result_source: 'stripe_webhook',
        store_tier: null,
        best_buy_score: null,
        session_id: session.client_reference_id || session.id || null,
        search_id: null,
        engagement_ms: null,
        action_context: plan,
        price: typeof session.amount_total === 'number' ? session.amount_total / 100 : null,
        feedback_label: session.currency || null,
        brand: plan
    };
    const { error } = await supabase.from('click_events').insert(purchaseEvent);
    if (error) {
        console.error('[Stripe] Error registrando purchase analytics:', error.message);
    }
}

// FIX #3: Verifica si el usuario tiene otra suscripción activa antes de revocar VIP
async function hasOtherActiveSubscription(userId, excludeStripeSubId) {
    if (!supabase || !userId) return false;
    const { data, error } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('user_id', userId)
        .eq('status', 'active')
        .neq('stripe_subscription_id', excludeStripeSubId)
        .limit(1);
    if (error) {
        console.warn('[Stripe] No se pudo verificar suscripciones activas adicionales:', error.message);
        return false;
    }
    return (data?.length || 0) > 0;
}

exports.createCheckoutSession = async (req, res) => {
    if (!stripe) {
        return res.status(500).json({ error: 'Stripe no está configurado.' });
    }
    if (!req.userId) {
        return res.status(401).json({ error: 'Inicia sesión para suscribirte.' });
    }

    const plan = normalizeRequestedPlan(req.body?.plan);
    const priceId = plan ? PLAN_PRICE_ID_MAP[plan] : null;
    if (!plan || !priceId) {
        return res.status(400).json({ error: 'Plan inválido.' });
    }

    try {
        const origin = process.env.PUBLIC_APP_URL
            || process.env.NEXT_PUBLIC_APP_URL
            || `${req.protocol}://${req.get('host')}`;
        const userEmail = req.userEmail || req.body?.email || undefined;

        const session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            line_items: [{ price: priceId, quantity: 1 }],
            client_reference_id: req.userId,
            customer_email: userEmail,
            success_url: `${origin}/?checkout=success&plan=${encodeURIComponent(plan)}`,
            cancel_url: `${origin}/?checkout=cancelled`,
            metadata: {
                user_id: req.userId,
                plan
            },
            subscription_data: {
                metadata: {
                    user_id: req.userId,
                    plan
                }
            }
        });

        return res.json({ url: session.url, id: session.id });
    } catch (error) {
        console.error('[Stripe] Error creando checkout session:', error.message);
        return res.status(500).json({ error: 'No se pudo iniciar el checkout.' });
    }
};

exports.handleWebhook = async (req, res) => {
    if (!stripe) {
        console.error('STRIPE_SECRET_KEY not configured');
        return res.status(500).json({ error: 'Stripe not configured' });
    }
    if (!supabase) {
        console.error('Database not available');
        return res.status(503).json({ error: 'Database unavailable' });
    }
    const sig = req.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    try {
        if (!sig || !endpointSecret) {
            throw new Error('Falta stripe-signature o STRIPE_WEBHOOK_SECRET en producción.');
        }
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
        // FIX #2: Idempotencia — skip solo si processed_at ya existe (procesado completo)
        const { data: existing } = await supabase
            .from('webhook_events')
            .select('event_id, processed_at')
            .eq('event_id', event.id)
            .maybeSingle();

        if (existing?.processed_at) {
            console.log(`[Stripe] Evento ya procesado (idempotent skip): ${event.id}`);
            return res.status(200).send('Already processed');
        }

        // Claim el evento (INSERT); si ya existe sin processed_at, continuar (retry válido)
        if (!existing) {
            const { error: insertErr } = await supabase
                .from('webhook_events')
                .insert({ event_id: event.id, event_type: event.type, payload: { object_id: event.data?.object?.id } });

            if (insertErr) {
                if (insertErr.code === '23505') {
                    console.log(`[Stripe] Evento reclamado por otro worker: ${event.id}`);
                    return res.status(200).send('Already processed');
                }
                console.error('[Stripe] Error registrando evento:', insertErr.message);
            }
        }

        // Handle the event
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object;
                const userId = String(session.client_reference_id || '').trim();
                const resolvedPlan = await resolvePlanFromSession(session);

                if (!userId) {
                    console.error('⚠️ Checkout completado sin client_reference_id. Email del cliente:', session.customer_email || session.customer_details?.email || 'desconocido');
                    console.error('⚠️ Session ID:', session.id, '| Customer:', session.customer);
                    let resolvedUserId = await resolveUserIdFromSession(session);
                    if (resolvedUserId) {
                        console.log(`✅ Encontrado usuario por email fallback: ${resolvedUserId}`);
                    }
                    if (!resolvedUserId) {
                        console.error('❌ No se pudo vincular el pago a ningún usuario. Se requiere intervención manual.');
                        const { error: pendingErr } = await supabase
                            .from('subscriptions')
                            .insert([{
                                user_id: null,
                                stripe_customer_id: session.customer,
                                stripe_subscription_id: session.subscription,
                                stripe_payment_intent_id: session.payment_intent,
                                status: 'pending_user_link',
                                amount_paid: session.amount_total,
                                currency: session.currency,
                                plan: resolvedPlan
                            }]);
                        assertNoSupabaseError(pendingErr, 'checkout/pending_user_link insert');
                        break;
                    }
                    const { error: profileErrFb } = await supabase
                        .from('profiles')
                        .update({ is_premium: true, plan: resolvedPlan })
                        .eq('id', resolvedUserId);
                    assertNoSupabaseError(profileErrFb, 'checkout/profile update (email fallback)');
                    const { error: subErrFb } = await supabase
                        .from('subscriptions')
                        .insert([{
                            user_id: resolvedUserId,
                            stripe_customer_id: session.customer,
                            stripe_subscription_id: session.subscription,
                            stripe_payment_intent_id: session.payment_intent,
                            status: 'active',
                            amount_paid: session.amount_total,
                            currency: session.currency,
                            plan: resolvedPlan
                        }]);
                    assertNoSupabaseError(subErrFb, 'checkout/subscription insert (email fallback)');
                    await trackPurchaseEvent({ userId: resolvedUserId, session, plan: resolvedPlan });
                    console.log('✅ Perfil y suscripción actualizados vía email fallback.');
                    break;
                }

                if (userId) {
                    console.log(`✅ Pago exitoso para el usuario: ${userId}. Actualizando perfil a ${resolvedPlan}...`);

                    const { error: profileErr } = await supabase
                        .from('profiles')
                        .update({ is_premium: true, plan: resolvedPlan })
                        .eq('id', userId);
                    assertNoSupabaseError(profileErr, 'checkout/profile update');

                    const { error: subErr } = await supabase
                        .from('subscriptions')
                        .insert([{
                            user_id: userId,
                            stripe_customer_id: session.customer,
                            stripe_subscription_id: session.subscription,
                            stripe_payment_intent_id: session.payment_intent,
                            status: 'active',
                            amount_paid: session.amount_total,
                            currency: session.currency,
                            plan: resolvedPlan
                        }]);
                    assertNoSupabaseError(subErr, 'checkout/subscription insert');

                    await trackPurchaseEvent({ userId, session, plan: resolvedPlan });
                    console.log('✅ Perfil y suscripción actualizados exitosamente.');

                    // Referral VIP reward: si este usuario fue referido, dar 1 mes bonus al referidor
                    try {
                        const { data: newSubProfile } = await supabase
                            .from('profiles')
                            .select('referred_by, referral_vip_rewarded')
                            .eq('id', userId)
                            .maybeSingle();
                        const referrerId = newSubProfile?.referred_by;
                        const alreadyRewarded = newSubProfile?.referral_vip_rewarded;
                        if (referrerId && !alreadyRewarded) {
                            const VIP_BONUS_MONTH = 40; // Equivale a 1 mes del plan VIP
                            // Marcar primero para evitar duplicados si el webhook se reintenta
                            const { error: rewardErr } = await supabase.from('profiles').update({ referral_vip_rewarded: true }).eq('id', userId);
                            if (!rewardErr) {
                                const bonusEntries = Array.from({ length: VIP_BONUS_MONTH }, () => ({
                                    ip: `bonus:user:${referrerId}`,
                                    created_at: new Date().toISOString()
                                }));
                                await supabase.from('rate_limits').insert(bonusEntries);
                                console.log(`[Referral] 🎁 Referidor ${referrerId} recibió +${VIP_BONUS_MONTH} búsquedas por conversión VIP de ${userId}`);
                            }
                        }
                    } catch (refErr) {
                        console.warn('[Referral] Error otorgando bonus VIP al referidor:', refErr.message);
                    }
                }
                break;
            }

            case 'customer.subscription.deleted': {
                const subscription = event.data.object;
                console.log(`❌ Suscripción cancelada: ${subscription.id}`);

                const { data, error: cancelErr } = await supabase
                    .from('subscriptions')
                    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
                    .eq('stripe_subscription_id', subscription.id)
                    .select('user_id')
                    .maybeSingle();
                assertNoSupabaseError(cancelErr, 'subscription.deleted/cancel update');

                // FIX #3: Solo revocar VIP si no hay otra suscripción activa
                if (data && data.user_id) {
                    const stillActive = await hasOtherActiveSubscription(data.user_id, subscription.id);
                    if (stillActive) {
                        console.log(`ℹ️ Usuario ${data.user_id} tiene otra suscripción activa — no se revoca VIP.`);
                    } else {
                        const { error: revokeErr } = await supabase
                            .from('profiles')
                            .update({ is_premium: false, plan: 'free' })
                            .eq('id', data.user_id);
                        assertNoSupabaseError(revokeErr, 'subscription.deleted/profile revoke');
                        console.log(`📉 Acceso premium revocado para el usuario ${data.user_id}`);
                    }
                }
                break;
            }

            case 'invoice.payment_failed': {
                const invoice = event.data.object;
                console.warn(`⚠️ Pago de factura fallido para la suscripción: ${invoice.subscription}`);

                const { data, error: pastDueErr } = await supabase
                    .from('subscriptions')
                    .update({ status: 'past_due', updated_at: new Date().toISOString() })
                    .eq('stripe_subscription_id', invoice.subscription)
                    .select('user_id')
                    .maybeSingle();
                assertNoSupabaseError(pastDueErr, 'invoice.payment_failed/past_due update');

                if (data && data.user_id) {
                    const stillActive = await hasOtherActiveSubscription(data.user_id, invoice.subscription);
                    if (!stillActive) {
                        const { error: pauseErr } = await supabase
                            .from('profiles')
                            .update({ is_premium: false, plan: 'free' })
                            .eq('id', data.user_id);
                        assertNoSupabaseError(pauseErr, 'invoice.payment_failed/profile pause');
                        console.log(`📉 Acceso premium pausado por falta de pago para el usuario ${data.user_id}`);
                    } else {
                        console.log(`ℹ️ Usuario ${data.user_id} tiene otra suscripción activa — no se pausa VIP.`);
                    }
                }
                break;
            }

            case 'invoice.payment_succeeded': {
                const invoice = event.data.object;
                if (!invoice.subscription) break;
                console.log(`✅ Pago de factura exitoso para suscripción: ${invoice.subscription}`);

                const { data: subData, error: subFetchErr } = await supabase
                    .from('subscriptions')
                    .update({ status: 'active', updated_at: new Date().toISOString() })
                    .eq('stripe_subscription_id', invoice.subscription)
                    .select('user_id, plan')
                    .maybeSingle();

                if (subFetchErr) {
                    console.warn('[Stripe] invoice.payment_succeeded: no se encontró suscripción local:', subFetchErr.message);
                    break;
                }

                if (subData?.user_id) {
                    const { error: reactivateErr } = await supabase
                        .from('profiles')
                        .update({ is_premium: true, plan: subData.plan || 'personal_vip' })
                        .eq('id', subData.user_id);
                    assertNoSupabaseError(reactivateErr, 'invoice.payment_succeeded/profile reactivate');
                    console.log(`✅ Perfil reactivado (renovación) para usuario ${subData.user_id} → plan: ${subData.plan}`);
                }
                break;
            }

            case 'customer.subscription.updated': {
                const sub = event.data.object;
                const newPriceId = sub.items?.data?.[0]?.price?.id || '';
                const newPlan = STRIPE_PRICE_PLAN_MAP[newPriceId] || null;
                const newStatus = sub.status; // active, past_due, canceled, etc.
                console.log(`🔄 Suscripción actualizada: ${sub.id} | status: ${newStatus} | priceId: ${newPriceId} | plan: ${newPlan || '(sin cambio)'}`);

                const { data: updSub, error: updSubErr } = await supabase
                    .from('subscriptions')
                    .update({
                        status: newStatus === 'active' ? 'active' : newStatus,
                        ...(newPlan ? { plan: newPlan } : {}),
                        updated_at: new Date().toISOString()
                    })
                    .eq('stripe_subscription_id', sub.id)
                    .select('user_id, plan')
                    .maybeSingle();

                if (updSubErr) {
                    console.warn('[Stripe] customer.subscription.updated: suscripción no encontrada localmente:', updSubErr.message);
                    break;
                }

                if (updSub?.user_id) {
                    const effectivePlan = newPlan || updSub.plan || 'personal_vip';
                    const isPremiumNow = newStatus === 'active';
                    const { error: profileUpdErr } = await supabase
                        .from('profiles')
                        .update({ is_premium: isPremiumNow, plan: isPremiumNow ? effectivePlan : 'free' })
                        .eq('id', updSub.user_id);
                    assertNoSupabaseError(profileUpdErr, 'subscription.updated/profile update');
                    console.log(`✅ Perfil actualizado tras cambio de plan: usuario ${updSub.user_id} → plan: ${effectivePlan}, is_premium: ${isPremiumNow}`);
                }
                break;
            }

            case 'charge.refunded': {
                const charge = event.data.object;
                console.log(`💸 Cargo reembolsado: ${charge.id}`);
                if (charge.payment_intent) {
                    const { data, error: refundErr } = await supabase
                        .from('subscriptions')
                        .update({ status: 'refunded', updated_at: new Date().toISOString() })
                        .eq('stripe_payment_intent_id', charge.payment_intent)
                        .select('user_id, stripe_subscription_id')
                        .maybeSingle();
                    assertNoSupabaseError(refundErr, 'charge.refunded/refund update');

                    if (data && data.user_id) {
                        const stillActive = await hasOtherActiveSubscription(data.user_id, data.stripe_subscription_id || '');
                        if (!stillActive) {
                            const { error: revokeRefundErr } = await supabase
                                .from('profiles')
                                .update({ is_premium: false, plan: 'free' })
                                .eq('id', data.user_id);
                            assertNoSupabaseError(revokeRefundErr, 'charge.refunded/profile revoke');
                            console.log(`📉 Acceso premium revocado (reembolso) para el usuario ${data.user_id}`);
                        } else {
                            console.log(`ℹ️ Usuario ${data.user_id} tiene otra suscripción activa — no se revoca VIP por reembolso.`);
                        }
                    }
                }
                break;
            }

            default:
                console.log(`Unhandled event type ${event.type}`);
        }

        // FIX #2: Marcar evento como completamente procesado DESPUÉS de terminar
        await supabase
            .from('webhook_events')
            .update({ processed_at: new Date().toISOString() })
            .eq('event_id', event.id);

    } catch (err) {
        console.error(`Error procesando webhook Stripe (${event.type}):`, err.message);
        return res.status(500).send('Internal Server Error processing Webhook');
    }

    res.send();
};
