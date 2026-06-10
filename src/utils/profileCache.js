// In-memory TTL cache for profile lookups.
// A single search request can trigger 2-3 Supabase profile queries for the same userId;
// this collapses them into one DB call per user per minute.
const PROFILE_CACHE_TTL_MS = 60_000; // 1 minute

const _cache = new Map(); // userId → { profile, expiresAt }

async function getProfile(supabase, userId, selectFields = 'plan, is_premium, vip_temp_unlocked_at') {
    const now = Date.now();
    const cached = _cache.get(userId);
    if (cached && cached.expiresAt > now) return cached.profile;

    const { data: profile } = await supabase
        .from('profiles')
        .select(selectFields)
        .eq('id', userId)
        .single();

    _cache.set(userId, { profile: profile || null, expiresAt: now + PROFILE_CACHE_TTL_MS });
    return profile || null;
}

function invalidate(userId) {
    _cache.delete(userId);
}

module.exports = { getProfile, invalidate };
