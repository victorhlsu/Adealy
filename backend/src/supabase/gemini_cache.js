const { supabase } = require('./client');
const crypto = require('crypto'); // for hashing 

const CACHE_TABLE = 'gemini_cache';
const CACHE_DURATION = 3600000*24; // 24 hours


// create hash to use as unique key (case-insensitive)
function hashPrompt(prompt) {
    const normalized = (prompt || '').toLowerCase();
    return crypto.createHash('sha256').update(normalized).digest('hex');
}



// get the cached response from supabase
async function getCachedResponse(prompt) {
    try {
        const promptHash = hashPrompt(prompt);
        
        const { data, error } = await supabase
            .from(CACHE_TABLE)
            .select('response, created_at')
            .eq('prompt_hash', promptHash)
            .single();

        if (error || !data) {
            return null;
        }

    
        const cacheAge = Date.now() - new Date(data.created_at).getTime();
        if (cacheAge > CACHE_DURATION) {
            await supabase.from(CACHE_TABLE).delete().eq('prompt_hash', promptHash);
            return null;
        }

        console.log('[gemini_cache] Cache hit for prompt');
        return data.response;
    } catch (err) {
        console.error('[gemini_cache] Error getting cached response:', err);
        return null;
    }
}


// store the response in supabase
async function cacheResponse(prompt, response) {
    try {
        const promptHash = hashPrompt(prompt);
        const normalizedPrompt = (prompt || '').toLowerCase();

        const { error } = await supabase
            .from(CACHE_TABLE)
            .upsert({
                prompt_hash: promptHash,
                prompt: normalizedPrompt,
                response: response,
                created_at: new Date().toISOString()
            }, {
                onConflict: 'prompt_hash'
            });

        if (error) {
            console.error('[gemini_cache] Error caching response:', error);
        } else {
            console.log('[gemini_cache] Cached response for prompt');
        }
    } catch (err) {
        console.error('[gemini_cache] Error caching response:', err);
    }
}

module.exports = { getCachedResponse, cacheResponse };
