/**
 * POST /api/data/hotels
 * Search for hotels on Booking.com
 * 
 * Request body:
 * {
 *   "location": "San Francisco, CA",  // city/region name
 *   "checkin": "2025-06-15",          // check-in date (YYYY-MM-DD)
 *   "checkout": "2025-06-22",         // check-out date (YYYY-MM-DD)
 *   "adults": 2,                       // number of adults
 *   "children": 0,                     // number of children (optional)
 *   "rooms": 1,                        // number of rooms (optional)
 *   "currency": "USD"                  // optional currency code
 * }
 * 
 * Response: {
 *   "hotels": [
 *     {
 *       "name": "Hotel Name",
 *       "address": "123 Main St, San Francisco, CA",
 *       "latitude": 37.7749,
 *       "longitude": -122.4194,
 *       "pricePerNight": "$120",
 *       "priceTotal": "$840",
 *       "currency": "USD",
 *       "rating": 8.5,
 *       "ratingCount": 2345,
 *       "roomType": "Double Room",
 *       "beds": "1 king bed",
 *       "bookingUrl": "https://www.booking.com/hotel/...",
 *       "image": "https://...",
 *       "cancellationPolicy": "Free cancellation",
 *       "amenities": ["Wi-Fi", "Pool", "Restaurant"],
 *       "distanceFromCenter": "0.5 km"
 *     },
 *     ...
 *   ],
 *   "request": { location, checkin, checkout, adults, children, rooms, currency },
 *   "count": 15,
 *   "cached": boolean,
 *   "searchUrl": "https://www.booking.com/searchresults.html?..."
 * }
 *
 * Notes:
 * - "address" may be missing depending on the upstream scraper.
 * - "latitude"/"longitude" are best-effort: if GEMINI_API_KEY is configured, the backend attempts to enrich missing coordinates.
 */

const { Router } = require('express');
const { spawn } = require('child_process');
const path = require('path');
const { getCachedHotels, cacheHotels } = require('../../supabase/hotels_cache');
const ai = require('../../ai/ai');

const sanitizeForGemini = (value) => String(value || '').replace(/[\r\n\t]+/g, ' ').trim();

async function enrichHotelsWithGeminiCoordinates({ location, hotels }) {
	try {
		if (!Array.isArray(hotels) || hotels.length === 0) return hotels;
		if (!process.env.GEMINI_API_KEY) return hotels;

		const needsCoords = hotels.some((h) => h && (h.latitude == null || h.longitude == null));
		if (!needsCoords) return hotels;

		const payload = hotels.map((h, index) => ({
			index,
			name: sanitizeForGemini(h?.name),
			address: sanitizeForGemini(h?.address),
			url: sanitizeForGemini(h?.bookingUrl),
		}));

		const prompt = JSON.stringify({
			location: sanitizeForGemini(location),
			hotels: payload,
		});

		const response = await ai.generate(prompt, 'HOTEL_COORDINATES_PROMPT');
		if (response === '404') return hotels;

		let cleaned = String(response).trim();
		if (cleaned.startsWith('```json')) cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
		else if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');

		let data;
		try {
			data = JSON.parse(cleaned);
		} catch (e) {
			console.error('[hotels] Gemini coordinates JSON parse error:', e);
			return hotels;
		}

		if (!data || data.error || !Array.isArray(data.results)) return hotels;

		for (const r of data.results) {
			const idx = r?.index;
			if (typeof idx !== 'number' || idx < 0 || idx >= hotels.length) continue;

			const lat = r?.latitude;
			const lng = r?.longitude;
			if (typeof lat === 'number' && typeof lng === 'number') {
				hotels[idx].latitude = lat;
				hotels[idx].longitude = lng;
			}

			if ((!hotels[idx].address || !String(hotels[idx].address).trim()) && typeof r?.address === 'string') {
				hotels[idx].address = r.address;
			}
		}

		return hotels;
	} catch (err) {
		console.error('[hotels] Failed to enrich hotels with Gemini coordinates:', err);
		return hotels;
	}
}

const searchHotels = async (req, res) => {
	try {
		const { location, checkin, checkout, adults = 1, children = 0, rooms = 1, currency = 'USD' } = req.body;

		// Validate required fields
		if (!location || !checkin || !checkout) {
			return res.status(400).json({
				error: 'Missing required fields: location, checkin, checkout',
			});
		}

		// Validate date format
		if (!/^\d{4}-\d{2}-\d{2}$/.test(checkin)) {
			return res.status(400).json({
				error: 'checkin must be in YYYY-MM-DD format',
			});
		}
		if (!/^\d{4}-\d{2}-\d{2}$/.test(checkout)) {
			return res.status(400).json({
				error: 'checkout must be in YYYY-MM-DD format',
			});
		}

		// Check cache first
		const cached = await getCachedHotels(location, checkin, checkout, adults, children, rooms, currency);
		if (cached) {
			return res.json({
				request: { location, checkin, checkout, adults, children, rooms, currency },
				hotels: cached.hotels,
				count: cached.hotels.length,
				cached: true,
				searchUrl: cached.searchUrl,
			});
		}

		// Spawn Python worker to search hotels
		const result = await spawnPythonWorker({ location, checkin, checkout, adults, children, rooms, currency });

		if (result.error) {
			console.error('[hotels] Python worker error:', result.error);
			return res.status(500).json({
				error: result.error,
				hotels: [],
				count: 0,
				cached: false,
				searchUrl: result.searchUrl || null,
			});
		}

		if (result.hotels && result.hotels.length > 0) {
			// Enrich lat/lng (+ address if missing) via Gemini in one batch
			result.hotels = await enrichHotelsWithGeminiCoordinates({ location, hotels: result.hotels });

			// Remove ratingCount if any scraper provided it
			result.hotels = result.hotels.map((h) => {
				if (!h || typeof h !== 'object') return h;
				// eslint-disable-next-line no-unused-vars
				const { ratingCount, ...rest } = h;
				return rest;
			});

			// Cache the result for future requests
			await cacheHotels(location, checkin, checkout, adults, children, rooms, currency, result.hotels, result.searchUrl);
		}

		return res.json({
			request: { location, checkin, checkout, adults, children, rooms, currency },
			hotels: result.hotels || [],
			count: (result.hotels && result.hotels.length) || 0,
			cached: false,
			searchUrl: result.searchUrl || null,
		});
	} catch (err) {
		console.error('Error in hotel search:', err);
		return res.status(500).json({
			error: 'Failed to search hotels',
			details: err.message,
			hotels: [],
			count: 0,
			cached: false,
		});
	}
};

/**
 * Spawn Python worker to execute hotel search (Google Hotels)
 */
function spawnPythonWorker(query) {
	return new Promise((resolve) => {
		const workerPath = path.join(__dirname, '../../hotels_worker_google.py');
		const python = spawn('python', [workerPath]);

		let stdout = '';
		let stderr = '';

		python.stdout.on('data', (data) => {
			stdout += data.toString();
		});

		python.stderr.on('data', (data) => {
			stderr += data.toString();
		});

		python.on('close', (code) => {
			if (code !== 0) {
				console.error('[hotels-worker] Python error:', stderr);
				return resolve({
					error: `Python worker exited with code ${code}: ${stderr}`,
					hotels: [],
					searchUrl: null,
				});
			}

			try {
				const result = JSON.parse(stdout);
				return resolve(result);
			} catch (e) {
				console.error('[hotels-worker] JSON parse error:', e, 'stdout:', stdout);
				return resolve({
					error: 'Failed to parse worker output',
					hotels: [],
					searchUrl: null,
				});
			}
		});

		python.on('error', (err) => {
			console.error('[hotels-worker] Spawn error:', err);
			return resolve({
				error: `Failed to spawn worker: ${err.message}`,
				hotels: [],
				searchUrl: null,
			});
		});

		// Send query to worker as JSON
		python.stdin.write(JSON.stringify(query));
		python.stdin.end();
	});
}

const router = Router();
router.post('/', searchHotels);

module.exports = { router };
