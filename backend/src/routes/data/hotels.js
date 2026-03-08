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
 * - "latitude"/"longitude" are best-effort: the backend geocodes missing coordinates via OpenStreetMap Nominatim (Gemini coords are opt-in).
 */

const { Router } = require('express');
const { spawn } = require('child_process');
const path = require('path');
const { getCachedHotels, cacheHotels } = require('../../supabase/hotels_cache');
const ai = require('../../ai/ai');

const sanitizeForGemini = (value) => String(value || '').replace(/[\r\n\t]+/g, ' ').trim();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const isValidLatLng = (lat, lng) => {
	if (typeof lat !== 'number' || typeof lng !== 'number') return false;
	if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
	return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
};

async function fetchJson(url, options = {}) {
	// Node 18+ has global fetch. Provide a minimal fallback for older runtimes.
	if (typeof fetch === 'function') {
		const resp = await fetch(url, options);
		return resp;
	}

	// eslint-disable-next-line global-require
	const https = require('https');
	return new Promise((resolve, reject) => {
		const req = https.request(url, { method: options.method || 'GET', headers: options.headers || {} }, (res) => {
			let body = '';
			res.on('data', (chunk) => { body += chunk.toString('utf8'); });
			res.on('end', () => {
				resolve({
					ok: res.statusCode >= 200 && res.statusCode < 300,
					status: res.statusCode,
					json: async () => JSON.parse(body),
					text: async () => body,
				});
			});
		});
		req.on('error', reject);
		req.end();
	});
}

async function geocodeWithNominatim(query) {
	try {
		const q = String(query || '').trim();
		if (!q) return null;
		const params = new URLSearchParams({
			format: 'jsonv2',
			limit: '1',
			q,
		});
		if (process.env.NOMINATIM_EMAIL) params.set('email', String(process.env.NOMINATIM_EMAIL));

		const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
		const resp = await fetchJson(url, {
			headers: {
				// Nominatim requires a valid identifying UA.
				'User-Agent': process.env.NOMINATIM_USER_AGENT || 'AdealyHackCanada/0.1',
				'Accept': 'application/json',
			},
		});
		if (!resp.ok) return null;
		const data = await resp.json();
		if (!Array.isArray(data) || data.length === 0) return null;
		const first = data[0];
		const lat = Number.parseFloat(first?.lat);
		const lng = Number.parseFloat(first?.lon);
		if (!isValidLatLng(lat, lng)) return null;
		return { latitude: lat, longitude: lng, address: first?.display_name };
	} catch (e) {
		return null;
	}
}

async function enrichHotelsWithNominatimCoordinates({ location, hotels }) {
	try {
		if (process.env.DISABLE_NOMINATIM === '1') return hotels;
		if (!Array.isArray(hotels) || hotels.length === 0) return hotels;

		const missing = hotels
			.map((h, idx) => ({ h, idx }))
			.filter(({ h }) => h && !isValidLatLng(h.latitude, h.longitude));
		if (missing.length === 0) return hotels;

		// Be polite to Nominatim. Keep requests low and sequential.
		const maxToGeocode = Math.min(missing.length, Number(process.env.NOMINATIM_MAX_GEOCODES || 20));
		for (let i = 0; i < maxToGeocode; i++) {
			const { h, idx } = missing[i];
			const name = sanitizeForGemini(h?.name);
			const address = sanitizeForGemini(h?.address);
			const q = address ? `${name}, ${address}` : `${name}, ${sanitizeForGemini(location)}`;

			// 1 req/sec guideline
			if (i > 0) await sleep(1100);

			const geo = await geocodeWithNominatim(q);
			if (!geo) continue;
			hotels[idx].latitude = geo.latitude;
			hotels[idx].longitude = geo.longitude;
			if ((!hotels[idx].address || !String(hotels[idx].address).trim()) && geo.address) {
				hotels[idx].address = geo.address;
			}
		}

		return hotels;
	} catch (err) {
		console.error('[hotels] Failed to enrich hotels with Nominatim coordinates:', err);
		return hotels;
	}
}

async function enrichHotelsWithGeminiCoordinates({ location, hotels }) {
	try {
		if (!Array.isArray(hotels) || hotels.length === 0) return hotels;
		// Coordinates should come from a real geocoder by default.
		// Allow Gemini coords only when explicitly enabled.
		if (process.env.ENABLE_GEMINI_COORDS !== '1') return hotels;
		if (!process.env.GEMINI_API_KEY) return hotels;
		if (process.env.DISABLE_GEMINI_COORDS === '1') return hotels;

		const needsCoords = hotels.some((h) => h && (typeof h.latitude !== 'number' || typeof h.longitude !== 'number'));
		// Clear invalid coordinate-shaped values so downstream enrichment can replace them.
		for (const h of hotels) {
			if (!h || typeof h !== 'object') continue;
			if (h.latitude != null || h.longitude != null) {
				if (!isValidLatLng(h.latitude, h.longitude)) {
					h.latitude = null;
					h.longitude = null;
				}
			}
		}

		const needsCoordsAfterClear = hotels.some((h) => h && !isValidLatLng(h.latitude, h.longitude));
		if (!needsCoordsAfterClear) return hotels;

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
			let hotels = cached.hotels;
			const missingCount = Array.isArray(hotels)
				? hotels.filter((h) => h && !isValidLatLng(h.latitude, h.longitude)).length
				: 0;
			const needsCoords = missingCount > 0;

			if (needsCoords) {
				hotels = await enrichHotelsWithNominatimCoordinates({ location, hotels });
				hotels = await enrichHotelsWithGeminiCoordinates({ location, hotels });
				// Refresh cache with enriched coordinates so future calls don't need geocoding.
				await cacheHotels(location, checkin, checkout, adults, children, rooms, currency, hotels, cached.searchUrl);
			}

			return res.json({
				request: { location, checkin, checkout, adults, children, rooms, currency },
				hotels,
				count: (hotels && hotels.length) || 0,
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
			// Fill missing/out-of-range coordinates via Nominatim (accurate geocoding)
			result.hotels = await enrichHotelsWithNominatimCoordinates({ location, hotels: result.hotels });

			// Optional: allow Gemini to fill any remaining gaps (opt-in)
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

		const pythonCandidates = process.env.PYTHON_BIN
			? [process.env.PYTHON_BIN]
			: (process.platform === 'win32' ? ['python', 'python3'] : ['python3', 'python']);

		let resolved = false;
		const trySpawn = (idx) => {
			const pythonCmd = pythonCandidates[idx];
			if (!pythonCmd) {
				resolved = true;
				return resolve({
					error: 'Failed to spawn worker: no python interpreter found (tried ' + pythonCandidates.join(', ') + ')',
					hotels: [],
					searchUrl: null,
				});
			}

			const python = spawn(pythonCmd, [workerPath]);

			let stdout = '';
			let stderr = '';

			python.stdout.on('data', (data) => {
				stdout += data.toString();
			});

			python.stderr.on('data', (data) => {
				stderr += data.toString();
			});

			python.on('close', (code) => {
				if (resolved) return;
				if (code !== 0) {
					console.error('[hotels-worker] Python error:', stderr);
					resolved = true;
					return resolve({
						error: `Python worker exited with code ${code}: ${stderr}`,
						hotels: [],
						searchUrl: null,
					});
				}

				try {
					const result = JSON.parse(stdout);
					resolved = true;
					return resolve(result);
				} catch (e) {
					console.error('[hotels-worker] JSON parse error:', e, 'stdout:', stdout);
					resolved = true;
					return resolve({
						error: 'Failed to parse worker output',
						hotels: [],
						searchUrl: null,
					});
				}
			});

			python.on('error', (err) => {
				// If interpreter not found, try the next candidate.
				if (err && err.code === 'ENOENT' && idx + 1 < pythonCandidates.length) {
					return trySpawn(idx + 1);
				}
				console.error('[hotels-worker] Spawn error:', err);
				if (resolved) return;
				resolved = true;
				return resolve({
					error: `Failed to spawn worker: ${err.message}`,
					hotels: [],
					searchUrl: null,
				});
			});

			// Enforce a hard timeout since Dockerized Playwright can hang forever
			const timer = setTimeout(() => {
				if (resolved) return;
				console.error('[hotels-worker] Node wrapper hard timeout reached (190s). Killing child process.');
				python.kill('SIGKILL');
				resolved = true;
				return resolve({
					error: 'Python worker timed out after 190s',
					hotels: [],
					searchUrl: null,
				});
			}, 190000);

			// Send query to worker as JSON
			python.stdin.write(JSON.stringify(query));
			python.stdin.end();
		};

		trySpawn(0);
	});
}

const router = Router();
router.post('/', searchHotels);

module.exports = { router };
