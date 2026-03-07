const { supabase } = require('./client');

const CACHE_TABLE = 'visa_single_cache';
const CACHE_DURATION = 3600000; // 1 hour

async function getCachedVisa(passportIso) {
    try {
        if (!passportIso) return null;

        const { data, error } = await supabase
            .from(CACHE_TABLE)
            .select('response, created_at')
            .eq('passport_iso', passportIso)
            .single();

        if (error || !data) {
            return null;
        }

        const cacheAge = Date.now() - new Date(data.created_at).getTime();
        if (cacheAge > CACHE_DURATION) {
            await supabase.from(CACHE_TABLE).delete().eq('passport_iso', passportIso);
            return null;
        }

        console.log(`[visa_cache] Cache hit for ${passportIso}`);
        return data.response;
    } catch (err) {
        console.error('[visa_cache] Error getting cached visa:', err);
        return null;
    }
}

async function cacheVisa(passportIso, passportCountry, response) {
    try {
        if (!passportIso) return;

        const { error } = await supabase
            .from(CACHE_TABLE)
            .upsert([
                {
                    passport_iso: passportIso,
                    passport_country: passportCountry,
                    response,
                    created_at: new Date().toISOString(),
                },
            ]);

        if (error) {
            console.error('[visa_cache] Error caching visa:', error);
        } else {
            console.log(`[visa_cache] Cached visa for ${passportIso}`);
        }
    } catch (err) {
        console.error('[visa_cache] Unexpected error caching visa:', err);
    }
}

module.exports = { getCachedVisa, cacheVisa };
