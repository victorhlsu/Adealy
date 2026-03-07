/**
 * POST /api/data/airports
 * Query airports from the bundled airports.csv dataset.
 *
 * Request body (all optional):
 * {
 *   "countryName": "United States",
 *   "countryCode": "US",
 *   "city": "Toronto",
 *   "latitude": 43.6532,
 *   "longitude": -79.3832,
 *   "radiusKm": 300,
 *   "limit": 200
 * }
 *
 * Response:
 * {
 *   "status": "ok",
 *   "count": number,
 *   "airports": [
 *     {
 *       "code": "YYZ",
 *       "name": "Toronto Pearson International Airport",
 *       "latitude": 43.6777,
 *       "longitude": -79.6248,
 *       "city": "Toronto",
 *       "countryCode": "CA",
 *       "type": "large_airport",
 *       "distanceKm": 18.2
 *     }
 *   ]
 * }
 */

const fs = require('fs');
const path = require('path');
const { Router } = require('express');

const ISO_PATH = path.join(__dirname, '../../assets/iso.json');
const AIRPORTS_PATH = path.join(__dirname, '../../assets/airports.csv');

const normalize = (v) =>
	String(v ?? '')
		.toLowerCase()
		.trim()
		.replace(/\s+/g, ' ');

// Minimal CSV line parser that handles quoted fields.
function parseCsvLine(line) {
	const out = [];
	let cur = '';
	let inQuotes = false;
	for (let i = 0; i < line.length; i++) {
		const ch = line[i];
		if (ch === '"') {
			// Escaped quote
			if (inQuotes && line[i + 1] === '"') {
				cur += '"';
				i++;
				continue;
			}
			inQuotes = !inQuotes;
			continue;
		}
		if (ch === ',' && !inQuotes) {
			out.push(cur);
			cur = '';
			continue;
		}
		cur += ch;
	}
	out.push(cur);
	return out;
}

let ISO_BY_NAME = null;
let AIRPORTS = null;

function loadIsoByName() {
	if (ISO_BY_NAME) return ISO_BY_NAME;
	try {
		const raw = fs.readFileSync(ISO_PATH, 'utf8');
		const json = JSON.parse(raw);
		ISO_BY_NAME = Object.fromEntries(
			Object.entries(json).map(([k, v]) => [normalize(k), String(v || '').toUpperCase()])
		);
	} catch (e) {
		ISO_BY_NAME = {};
	}
	return ISO_BY_NAME;
}

function loadAirports() {
	if (AIRPORTS) return AIRPORTS;

	const text = fs.readFileSync(AIRPORTS_PATH, 'utf8');
	const lines = text.split(/\r?\n/).filter(Boolean);
	if (!lines.length) {
		AIRPORTS = [];
		return AIRPORTS;
	}

	const header = parseCsvLine(lines[0]).map((h) => normalize(h));
	const idx = (name) => header.indexOf(normalize(name));

	const iType = idx('type');
	const iName = idx('name');
	const iLat = idx('latitude_deg');
	const iLng = idx('longitude_deg');
	const iCountry = idx('iso_country');
	const iCity = idx('municipality');
	const iIata = idx('iata_code');
	// const iSvc = idx('scheduled_service'); // Removed scheduled_service fallback

	const items = [];
	for (let li = 1; li < lines.length; li++) {
		const row = parseCsvLine(lines[li]);
		const code = String(row[iIata] || '').trim().toUpperCase();
		if (!code || code.length !== 3) continue;

		const latitude = Number(row[iLat]);
		const longitude = Number(row[iLng]);
		if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;

		const type = String(row[iType] || '').trim();
		const name = String(row[iName] || '').trim();
		const countryCode = String(row[iCountry] || '').trim().toUpperCase();
		const city = String(row[iCity] || '').trim();
		// const scheduledService = String(row[iSvc] || '').trim().toLowerCase(); // Commented out scheduled_service

		items.push({
			code,
			name,
			latitude,
			longitude,
			city,
			countryCode,
			type,
			// scheduledService, // Removed scheduled_service from items
		});
	}

	AIRPORTS = items;
	return AIRPORTS;
}

function typeRank(type) {
	if (type === 'large_airport') return 0;
	if (type === 'medium_airport') return 1;
	if (type === 'small_airport') return 2;
	if (type === 'heliport') return 3;
	if (type === 'seaplane_base') return 4;
	return 9;
}

function toRad(deg) {
	return (deg * Math.PI) / 180;
}

function haversineKm(aLat, aLng, bLat, bLng) {
	const R = 6371;
	const dLat = toRad(bLat - aLat);
	const dLng = toRad(bLng - aLng);
	const s1 = Math.sin(dLat / 2);
	const s2 = Math.sin(dLng / 2);
	const q = s1 * s1 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * s2 * s2;
	return 2 * R * Math.asin(Math.min(1, Math.sqrt(q)));
}

const handler = (req, res) => {
	try {
		const { countryName, countryCode, city, latitude, longitude, radiusKm, limit } = req.body || {};
		const isoByName = loadIsoByName();
		const airports = loadAirports();

		const normCity = city ? normalize(city) : '';
		let iso = String(countryCode || '').trim().toUpperCase();
		if (!iso && countryName) {
			iso = isoByName[normalize(countryName)] || '';
		}

		let filtered = airports;
		if (iso) {
			filtered = filtered.filter((a) => a.countryCode === iso);
		}
		if (normCity) {
			filtered = filtered.filter((a) => normalize(a.city) === normCity);
		}

		const latNum = typeof latitude === 'number' ? latitude : Number(latitude);
		const lngNum = typeof longitude === 'number' ? longitude : Number(longitude);
		const hasCenter = Number.isFinite(latNum) && Number.isFinite(lngNum);
		const rKm = Math.max(1, Math.min(Number(radiusKm) || 0, 2000));

		// Default: avoid overwhelming dropdowns.
		const max = Math.max(1, Math.min(Number(limit) || 200, 1000));

		let withMeta = filtered
			// Only show major airports to reduce clutter.
			.filter((a) => a.type === 'large_airport')
			.map((a) => {
				let distanceKm = null;
				if (hasCenter && rKm) {
					distanceKm = haversineKm(latNum, lngNum, a.latitude, a.longitude);
				}
				return { ...a, distanceKm };
			});

		if (hasCenter && rKm) {
			withMeta = withMeta.filter((a) => typeof a.distanceKm === 'number' && a.distanceKm <= rKm);
		}

		withMeta = withMeta
			.sort((a, b) => {
				// Prefer closer airports when using radius search.
				if (hasCenter && rKm) {
					const da = typeof a.distanceKm === 'number' ? a.distanceKm : Number.POSITIVE_INFINITY;
					const db = typeof b.distanceKm === 'number' ? b.distanceKm : Number.POSITIVE_INFINITY;
					if (da !== db) return da - db;
				}
				const tr = typeRank(a.type) - typeRank(b.type);
				if (tr) return tr;
				return a.name.localeCompare(b.name);
			})
			.slice(0, max)
			.map((a) => ({
				code: a.code,
				name: a.name,
				latitude: a.latitude,
				longitude: a.longitude,
				city: a.city,
				countryCode: a.countryCode,
				type: a.type,
				distanceKm: typeof a.distanceKm === 'number' ? Math.round(a.distanceKm * 10) / 10 : undefined,
			}));

		return res.status(200).json({ status: 'ok', count: withMeta.length, airports: withMeta });
	} catch (e) {
		console.error('[airports] error:', e);
		return res.status(500).json({ status: 'error', message: 'Failed to query airports' });
	}
};

const router = Router();
router.post('/', handler);

module.exports = { router, handler };
