/**
 * POST /api/data/geocode
 * Geocode a free-text query via OpenStreetMap Nominatim Search.
 *
 * Request body:
 * { "query": "Eiffel Tower, Paris" }
 *
 * Response:
 * { "status": "ok", "query": "...", "latitude": 48.858..., "longitude": 2.294..., "address": "..." }
 */

const { Router } = require('express');

const router = Router();

const isValidLatLng = (lat, lng) => {
	if (typeof lat !== 'number' || typeof lng !== 'number') return false;
	if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
	return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
};

async function fetchJson(url, options = {}) {
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

router.post('/', async (req, res) => {
	try {
		if (process.env.DISABLE_NOMINATIM === '1') {
			return res.status(503).json({ status: 'error', message: 'Nominatim is disabled' });
		}

		const { query } = req.body || {};
		const q = String(query || '').trim();
		if (!q) {
			return res.status(400).json({ status: 'error', message: 'query is required' });
		}

		const params = new URLSearchParams({
			format: 'jsonv2',
			limit: '1',
			q,
		});
		if (process.env.NOMINATIM_EMAIL) params.set('email', String(process.env.NOMINATIM_EMAIL));

		const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
		const resp = await fetchJson(url, {
			headers: {
				'User-Agent': process.env.NOMINATIM_USER_AGENT || 'AdealyHackCanada/0.1',
				'Accept': 'application/json',
			},
		});

		if (!resp.ok) {
			const txt = await resp.text().catch(() => '');
			return res.status(502).json({ status: 'error', message: 'Geocoding failed', details: txt || `HTTP ${resp.status}` });
		}

		const data = await resp.json();
		if (!Array.isArray(data) || data.length === 0) {
			return res.status(404).json({ status: 'error', message: 'No results' });
		}

		const first = data[0];
		const latitude = Number.parseFloat(first?.lat);
		const longitude = Number.parseFloat(first?.lon);
		if (!isValidLatLng(latitude, longitude)) {
			return res.status(502).json({ status: 'error', message: 'Invalid geocoding result' });
		}

		return res.json({
			status: 'ok',
			query: q,
			latitude,
			longitude,
			address: first?.display_name || null,
		});
	} catch (e) {
		console.error('[geocode] error:', e);
		return res.status(500).json({ status: 'error', message: 'Internal server error' });
	}
});

module.exports = { router };
