/**
 * POST /api/data/attractions
 * Returns famous attractions within the specified city (excludes food/nightlife).
 *
 * Request body:
 * {
 *   "city": "Paris"   // required
 * }
 *
 * Success response:
 * {
 *   "status": "ok",
 *   "city": "Paris",
 *   "attractions": [
 *     {
 *       "name": "Eiffel Tower",
 *       "type": "landmark",
 *       "description": "~20 words on why it is famous",
 *       "latitude": 48.8584,
 *       "longitude": 2.2945,
 *       "opening_time": "09:30",
 *       "closing_time": "23:45",
 *       "cost_amount": 29.4,
 *       "cost_currency": "EUR",
 *       "cost_note": "adult ticket",
 *       "booking_required": true,
 *       "famous_for": "iron lattice tower and views"
 *     }
 *   ]
 * }
 *
 * Error responses:
 * { "status": "error", "message": "City name is required" }
 * { "status": "error", "message": "Invalid city name detected" }
 * { "status": "error", "message": "Failed to parse attractions data", "raw_response": "..." }
 */

const { Router } = require('express');
const ai = require('../../ai/ai');

const router = Router();

const ALLOWED_TYPES = [
	'landmark',
	'museum',
	'park',
	'garden',
	'viewpoint',
	'neighborhood',
	'market',
	'shopping',
	'cultural',
	'historical',
	'religious',
	'entertainment',
	'monument',
	'plaza',
	'beach',
];

const suspiciousPatterns = /ignore|system|role|prompt|instruction|execute|eval|script|<script|javascript:/i;
const foodPatterns = /(restaurant|cafe|bar|bistro|pub|bakery|coffee|food|eatery|diner|brasserie|nightlife)/i;

function titleCase(str) {
	if (!str) return str;
	return str
		.split(/\s+/)
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(' ');
}

router.post('/', async (req, res) => {
	const { city } = req.body || {};

	if (!city || !String(city).trim()) {
		return res.status(400).json({ status: 'error', message: 'City name is required' });
	}

	try {
		const response = await ai.generate(city, 'ATTRACTIONS_PROMPT');

		if (response === '404') {
			return res.status(500).json({ status: 'error', message: '[attractions] Failed to query Gemini for attractions' });
		}

		let cleaned = response.trim();
		if (cleaned.startsWith('```json')) cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
		else if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');

		let data;
		try {
			data = JSON.parse(cleaned);
		} catch (err) {
			console.error('[attractions] Failed to parse response:', cleaned);
			return res.status(500).json({ status: 'error', message: '[attractions] Failed to parse attractions data', raw_response: cleaned });
		}

		if (data.error) {
			return res.status(400).json({ status: 'error', message: data.error });
		}

		const attractions = Array.isArray(data.attractions) ? data.attractions : [];

		const normalized = attractions
			.filter((a) => a && typeof a === 'object')
			.map((a) => ({
				name: a.name,
				type: a.type && String(a.type).toLowerCase(),
				description: a.description,
				latitude: Number(a.latitude),
				longitude: Number(a.longitude),
				opening_time: a.opening_time,
				closing_time: a.closing_time,
				cost_amount: a.cost_amount !== undefined ? Number(a.cost_amount) : undefined,
				cost_currency: a.cost_currency,
				cost_note: a.cost_note,
				booking_required: Boolean(a.booking_required),
				booking_website: a.booking_website || null,
				famous_for: titleCase(a.famous_for || ''),
			}))
			.filter((a) => a.name && a.type && ALLOWED_TYPES.includes(a.type))
			.filter((a) => !foodPatterns.test(a.type) && !foodPatterns.test(a.name || ''));

		return res.json({ status: 'ok', city, attractions: normalized });
	} catch (err) {
		console.error('[attractions] Error:', err);
		return res.status(500).json({ status: 'error', message: '[attractions] Internal server error' });
	}
});

module.exports = { router };
