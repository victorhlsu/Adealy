/**
 * POST /api/data/visa-single
 * Get visa requirements for a specified country via Henley Passport Index.
 *
 * Request body:
 * {
 *   "country": "France"   // full country name, case-insensitive
 * }
 *
 * Success response (proxied from upstream): Henley API JSON payload
 * Error responses: { "error": string }
 */

const isoCodes = require('../../assets/iso.json');
const { Router } = require('express');
const { getCachedVisa, cacheVisa } = require('../../supabase/visa_cache');
const visaAPI = "https://api.henleypassportindex.com/api/v3/visa-single/";

const visaSingle = async (req, res) => {
    try {
        const { country } = req.body;

        if (!country) {
            return res.status(400).json({ error: 'Country is required' });
        }

        const trimmed = String(country).trim();

        // case-insensitive lookup (comment claims case-insensitive)
        const isoLookup = Object.entries(isoCodes).reduce((acc, [name, code]) => {
            acc[String(name).toLowerCase()] = code;
            return acc;
        }, {});

        const iso = isoCodes[trimmed] || isoLookup[trimmed.toLowerCase()];
        if (!iso) {
            return res.status(400).json({ error: 'Unknown country' });
        }

        // 1-hour cache in Supabase
        const cached = await getCachedVisa(iso);
        if (cached) {
            return res.json({ ...cached, cached: true });
        }

        const upstream = await fetch(visaAPI + iso);
        if (!upstream.ok) {
            return res.status(upstream.status).json({ error: 'Upstream error', status: upstream.status });
        }

        const contentType = upstream.headers.get('content-type') || '';
        const text = await upstream.text();
        const data = contentType.includes('application/json')
            ? JSON.parse(text)
            : (() => {
                // Sometimes upstream returns HTML (rate limit / block). Avoid crashing.
                throw new Error('Upstream did not return JSON');
            })();

        // Cache best-effort (don’t fail the request if caching fails)
        await cacheVisa(iso, trimmed, data);
        return res.json(data);
    } catch (err) {
        console.error('Error in visa-single route:', err);
        res.status(500).json({ error: 'Failed to fetch visa information' });
    }
};

const router = Router();
router.post('/', visaSingle);

module.exports = { router, visaSingle };
