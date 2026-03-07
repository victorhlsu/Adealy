/**
 * POST /api/data/itinerary-plan
 * Generate a structured multi-day itinerary plan via Gemini.
 *
 * Request body:
 * {
 *   "destination": "Japan",
 *   "city": "Tokyo",
 *   "arrivalAirport": { "code": "HND", "name": "...", "latitude": 35.5494, "longitude": 139.7798 },
 *   "day1EarliestStartTime": "14:30",
 *   "hotel": { "name": "Hotel ...", "address": "...", "latitude": 35.68, "longitude": 139.76 },
 *   "items": [
 *     {
 *       "title": "Senso-ji",
 *       "city": "Tokyo",
 *       "latitude": 35.7148,
 *       "longitude": 139.7967,
 *       "day": 1,
 *       "startTime": "10:00",
 *       "endTime": "12:00",
 *       "opening_time": "09:00",
 *       "closing_time": "17:00",
 *       "booking_required": false,
 *       "famous_for": "..."
 *     }
 *   ]
 * }
 *
 * Response:
 * { "status":"ok", "plan": { "days": [...], "summary": "..." } }
 */

const { Router } = require('express');
const ai = require('../../ai/ai');

const router = Router();

function isFiniteNumber(n) {
	return typeof n === 'number' && Number.isFinite(n);
}

function pickPlace(value) {
	if (!value || typeof value !== 'object') return null;
	const lat = Number(value.latitude);
	const lng = Number(value.longitude);
	if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
	return {
		code: value.code ? String(value.code) : undefined,
		name: value.name ? String(value.name) : undefined,
		address: value.address ? String(value.address) : undefined,
		latitude: lat,
		longitude: lng,
	};
}

function pickTimeHHMM(value) {
	if (!value) return null;
	const s = String(value).trim();
	const m = s.match(/^(\d{1,2}):(\d{2})$/);
	if (!m) return null;
	const hh = Number(m[1]);
	const mm = Number(m[2]);
	if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
	if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
	return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

router.post('/', async (req, res) => {
	try {
		const { destination, city, arrivalAirport, hotel, items, day1EarliestStartTime } = req.body || {};
		if (!destination || !String(destination).trim()) {
			return res.status(400).json({ status: 'error', message: 'destination is required' });
		}

		const payload = {
			destination: String(destination),
			city: city ? String(city) : undefined,
			arrivalAirport: pickPlace(arrivalAirport),
			day1EarliestStartTime: pickTimeHHMM(day1EarliestStartTime) || undefined,
			hotel: pickPlace(hotel),
			items: Array.isArray(items)
				? items
					.filter((x) => x && typeof x === 'object')
					.map((x) => ({
						title: x.title ? String(x.title) : undefined,
						city: x.city ? String(x.city) : undefined,
						latitude: Number(x.latitude),
						longitude: Number(x.longitude),
						day: Math.max(1, Math.min(Number(x.day) || 1, 14)),
						startTime: x.startTime ? String(x.startTime) : undefined,
						endTime: x.endTime ? String(x.endTime) : undefined,
						opening_time: x.opening_time ? String(x.opening_time) : undefined,
						closing_time: x.closing_time ? String(x.closing_time) : undefined,
						booking_required: typeof x.booking_required === 'boolean' ? x.booking_required : undefined,
						famous_for: x.famous_for ? String(x.famous_for) : undefined,
					}))
					.filter((x) => x.title && isFiniteNumber(x.latitude) && isFiniteNumber(x.longitude))
				: [],
		};

		if (!payload.items.length) {
			return res
				.status(400)
				.json({ status: 'error', message: 'items must include at least one attraction with coordinates' });
		}

		const response = await ai.generate(JSON.stringify(payload), 'ITINERARY_PLAN_PROMPT');
		if (response === '404') {
			return res.status(500).json({ status: 'error', message: '[itinerary-plan] Failed to query Gemini' });
		}

		let cleaned = String(response).trim();
		if (cleaned.startsWith('```json')) cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
		else if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');

		let data;
		try {
			data = JSON.parse(cleaned);
		} catch (err) {
			console.error('[itinerary-plan] Failed to parse response:', cleaned);
			return res
				.status(500)
				.json({ status: 'error', message: '[itinerary-plan] Failed to parse plan JSON', raw_response: cleaned });
		}

		if (data?.error) {
			return res.status(400).json({ status: 'error', message: String(data.error) });
		}

		if (!data?.plan || !Array.isArray(data.plan.days)) {
			return res.status(500).json({ status: 'error', message: '[itinerary-plan] Invalid plan shape returned' });
		}

		return res.status(200).json({ status: 'ok', plan: data.plan });
	} catch (e) {
		console.error('[itinerary-plan] error:', e);
		return res.status(500).json({ status: 'error', message: '[itinerary-plan] Internal server error' });
	}
});

module.exports = { router };
