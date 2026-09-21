// Enable only after the scoped RPC migration and permissions have been verified.
const atomicBonusesEnabled = () => process.env.LUMU_ATOMIC_BONUSES_ENABLED === 'true';
// Server-only: caller identity comes from validated auth middleware, never req.body.
async function claimBonus(supabase, userId, kind, code = null, {enabled = atomicBonusesEnabled()} = {}) {
    if (!enabled) return {status:503,body:{error:'Los bonos están pausados temporalmente.',code:'BONUSES_PAUSED'}};
    if (!supabase) throw new Error('Bonus database unavailable');
    const { data, error } = await supabase.rpc('lumu_claim_bonus', {
        p_user_id: userId, p_kind: kind, p_code: code
    });
    if (error || !data || !Number.isInteger(data.status)) throw new Error('Atomic bonus RPC unavailable');
    const { status, ...body } = data;
    return { status, body };
}
// Paused referral rewards must not block fulfillment of an already-paid purchase.
// The subscription record remains available for a reviewed reward reconciliation.
async function claimVipReferralIfEnabled(supabase,userId,{enabled=atomicBonusesEnabled()}={}) {
    if (!enabled) return {skipped:true,reason:'BONUSES_PAUSED'};
    const result=await claimBonus(supabase,userId,'referral_vip',null,{enabled:true});
    if(result.status!==200)throw new Error('Referral bonus could not be applied');
    return result;
}
module.exports = { claimBonus, claimVipReferralIfEnabled, atomicBonusesEnabled };
