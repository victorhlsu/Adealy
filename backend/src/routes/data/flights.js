/**
 * POST /api/data/flights
 * Search for flights between two cities
 * 
 * Request body:
 * {
 *   "from": "LAX",           // departure airport code
 *   "to": "JFK",             // arrival airport code
 *   "date": "2025-06-15",    // departure date (YYYY-MM-DD) required
 *   "returnDate": "2025-06-22", // return date (YYYY-MM-DD) required
 *   "adults": 1,             // number of adult passengers
 *   "children": 0,           // number of children (optional)
 *   "seat": "economy"        // economy | premium-economy | business | first
 * }
 * 
 * Response: {
 *   "direct_flights": [ ... ],
 *   "connecting_flights": [ ... ],
 *   "currentPrice": "typical",
 *   "count": 15,
 *   "cached": boolean,
 *   "booking_url": string | null // search-level booking link
 * }
 */

const { Router } = require('express');
const { spawn } = require('child_process');
const path = require('path');
const { getCachedFlights, cacheFlights } = require('../../supabase/flights_cache');

const searchFlights = async (req, res) => {
	try {
		const { from, to, date, returnDate, adults = 1, children = 0, seat = 'economy' } = req.body;

		// Validate required fields
		if (!from || !to || !date || !returnDate) {
			return res.status(400).json({
				error: 'Missing required fields: from, to, date, returnDate',
			});
		}

		// Validate date format
		if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
			return res.status(400).json({
				error: 'Date must be in YYYY-MM-DD format',
			});
		}
		if (!/^\d{4}-\d{2}-\d{2}$/.test(returnDate)) {
			return res.status(400).json({
				error: 'returnDate must be in YYYY-MM-DD format',
			});
		}

		// Check cache first
		const cached = await getCachedFlights(from, to, date, returnDate, adults, children, seat);
		if (cached) {
			const cachedFlights = cached.flights;
			const directFromCache = Array.isArray(cachedFlights) ? cachedFlights : cachedFlights?.direct_flights || [];
			const connectingFromCache = Array.isArray(cachedFlights) ? [] : cachedFlights?.connecting_flights || [];
			return res.json({
				request: { from, to, date, returnDate: returnDate || null, adults, children, seat },
				direct_flights: directFromCache,
				connecting_flights: connectingFromCache,
				currentPrice: cached.currentPrice,
				count: directFromCache.length + connectingFromCache.length,
				booking_url: Array.isArray(cachedFlights) ? null : cachedFlights?.booking_url || null,
				source: 'cache',
				cached: true,
			});
		}

		// Spawn Python worker to search flights
		const result = await spawnPythonWorker({ from, to, date, returnDate, adults, children, seat });

		if (result.error) {
			console.error('[flights] Python worker error:', result.error);
			return res.status(500).json({
				error: result.error,
				direct_flights: [],
				connecting_flights: [],
				currentPrice: 'unknown',
				count: 0,
				booking_url: result.booking_url || null,
				source: result.source || 'error',
				cached: false,
			});
		}

		// Cache the result for future requests
		const hasFlights = (result.direct_flights && result.direct_flights.length > 0) || (result.connecting_flights && result.connecting_flights.length > 0);
		if (hasFlights) {
			await cacheFlights(from, to, date, returnDate, adults, children, seat, {
				direct_flights: result.direct_flights || [],
				connecting_flights: result.connecting_flights || [],
				booking_url: result.booking_url || null,
			}, result.currentPrice);
		}

		const directFlights = result.direct_flights || [];
		const connectingFlights = result.connecting_flights || [];
		return res.json({
			request: { from, to, date, returnDate: returnDate || null, adults, children, seat },
			direct_flights: directFlights,
			connecting_flights: connectingFlights,
			currentPrice: result.currentPrice,
			count: directFlights.length + connectingFlights.length,
			booking_url: result.booking_url || null,
			source: result.source || 'real',
			cached: false,
		});
	} catch (err) {
		console.error('Error in flight search:', err);
		return res.status(500).json({
			error: 'Failed to search flights',
			details: err.message,
			direct_flights: [],
			connecting_flights: [],
			currentPrice: 'unknown',
			count: 0,
			booking_url: null,
			source: 'error',
			cached: false,
		});
	}
};

/**
 * Spawn Python worker to execute flight search
 */
function spawnPythonWorker(query) {
	return new Promise((resolve) => {
		const workerPath = path.join(__dirname, '../../flights_worker.py');
		const python = spawn('python3', [workerPath]);

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
				console.error('[flights-worker] Python error:', stderr);
				return resolve({
					error: `Python worker exited with code ${code}: ${stderr}`,
					direct_flights: [],
					connecting_flights: [],
					currentPrice: 'unknown',
					count: 0,
					booking_url: null,
				});
			}

			try {
				const result = JSON.parse(stdout);
				return resolve(result);
			} catch (e) {
				console.error('[flights-worker] JSON parse error:', e, 'stdout:', stdout);
				return resolve({
					error: 'Failed to parse worker output',
					direct_flights: [],
					connecting_flights: [],
					currentPrice: 'unknown',
					count: 0,
					booking_url: null,
				});
			}
		});

		python.on('error', (err) => {
			console.error('[flights-worker] Spawn error:', err);
			return resolve({
				error: `Failed to spawn worker: ${err.message}`,
				direct_flights: [],
				connecting_flights: [],
				currentPrice: 'unknown',
				count: 0,
				booking_url: null,
			});
		});

		// Send query to worker as JSON
		python.stdin.write(JSON.stringify(query));
		python.stdin.end();
	});
}

const router = Router();
router.post('/', searchFlights);

module.exports = { router };
