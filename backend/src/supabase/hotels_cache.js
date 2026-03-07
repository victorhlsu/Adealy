const { supabase } = require('./client');
const crypto = require('crypto');

const CACHE_TABLE = 'hotels_cache';
const CACHE_DURATION = 3600000 * 24; // 24 hours


// Create hash to use as unique key from hotel query parameters
function hashHotelQuery(location, checkin, checkout, adults, children, rooms, currency) {
    const key = `${location}-${checkin}-${checkout}-${adults}-${children}-${rooms}-${currency}`;
    return crypto.createHash('sha256').update(key).digest('hex');
}


// Get cached hotel results from Supabase
async function getCachedHotels(location, checkin, checkout, adults, children, rooms, currency) {
    try {
        const cacheKey = hashHotelQuery(location, checkin, checkout, adults, children, rooms, currency);

        const { data, error } = await supabase
            .from(CACHE_TABLE)
            .select('hotels_data, search_url, created_at')
            .eq('query_hash', cacheKey)
            .single();

        if (error || !data) {
            return null;
        }

        const cacheAge = Date.now() - new Date(data.created_at).getTime();
        if (cacheAge > CACHE_DURATION) {
            await supabase.from(CACHE_TABLE).delete().eq('query_hash', cacheKey);
            return null;
        }

        console.log(`[hotels_cache] Cache hit for ${location} on ${checkin}-${checkout}`);
        return {
            hotels: data.hotels_data,
            searchUrl: data.search_url,
        };
    } catch (err) {
        console.error('[hotels_cache] Error getting cached hotels:', err);
        return null;
    }
}


// Store hotel results in Supabase (or update if exists)
async function cacheHotels(location, checkin, checkout, adults, children, rooms, currency, hotelsData, searchUrl) {
    try {
        const cacheKey = hashHotelQuery(location, checkin, checkout, adults, children, rooms, currency);

        const { error } = await supabase
            .from(CACHE_TABLE)
            .upsert([
                {
                    query_hash: cacheKey,
                    location: location,
                    checkin_date: checkin,
                    checkout_date: checkout,
                    guests_adults: adults,
                    guests_children: children,
                    num_rooms: rooms,
                    currency: currency,
                    hotels_data: hotelsData,
                    search_url: searchUrl,
                    created_at: new Date().toISOString(),
                },
            ]);

        if (error) {
            console.error('[hotels_cache] Error caching hotels:', error);
        } else {
            console.log(`[hotels_cache] Cached ${location} on ${checkin}-${checkout}`);
        }
    } catch (err) {
        console.error('[hotels_cache] Unexpected error caching hotels:', err);
    }
}

module.exports = { getCachedHotels, cacheHotels };
