const { supabase } = require('./client');
const crypto = require('crypto'); // for hashing

const CACHE_TABLE = 'flights_cache';
const CACHE_DURATION = 3600000 * 24; // 24 hours


// create hash to use as unique key from flight query parameters
function hashFlightQuery(from, to, date, returnDate, adults, children, seat) {
    const key = `${from}-${to}-${date}-${returnDate || 'none'}-${adults}-${children}-${seat}`;
    return crypto.createHash('sha256').update(key).digest('hex');
}


// get the cached flight results from supabase
async function getCachedFlights(from, to, date, returnDate, adults, children, seat) {
    try {
        const cacheKey = hashFlightQuery(from, to, date, returnDate, adults, children, seat);

        const { data, error } = await supabase
            .from(CACHE_TABLE)
            .select('flights_data, current_price, created_at')
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

        console.log(`[flights_cache] Cache hit for ${from} → ${to} on ${date}`);
        return {
            flights: data.flights_data,
            currentPrice: data.current_price,
        };
    } catch (err) {
        console.error('[flights_cache] Error getting cached flights:', err);
        return null;
    }
}


// store the flight results in supabase (or update if exists)
async function cacheFlights(from, to, date, returnDate, adults, children, seat, flightsData, currentPrice) {
    try {
        const cacheKey = hashFlightQuery(from, to, date, returnDate, adults, children, seat);

        const { error } = await supabase
            .from(CACHE_TABLE)
            .upsert([
                {
                    query_hash: cacheKey,
                    from_airport: from,
                    to_airport: to,
                    departure_date: date,
                    return_date: returnDate,
                    passengers_adults: adults,
                    passengers_children: children,
                    seat_class: seat,
                    flights_data: flightsData,
                    current_price: currentPrice,
                    created_at: new Date().toISOString(),
                },
            ]);

        if (error) {
            console.error('[flights_cache] Error caching flights:', error);
        } else {
            console.log(`[flights_cache] Cached ${from} → ${to} on ${date}`);
        }
    } catch (err) {
        console.error('[flights_cache] Unexpected error caching flights:', err);
    }
}

module.exports = { getCachedFlights, cacheFlights };
