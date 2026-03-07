/**
 * GET /api/gemini/status
 * Lightweight health check for Gemini availability (uses ai.ping()).
 *
 * Response 200:
 * { "status": "ok", "message": "Gemini is active and ready" }
 * Response 500:
 * { "status": "error", "message": "Gemini is not responding" }
 */

const { Router } = require('express');
const ai = require('../../ai/ai')

const gemini = async (req, res) => {
    const isActive = await ai.ping();
    if (isActive) {
        return res.status(200).json({ status: 'ok', message: 'Gemini is active and ready' });
    } else {
        return res.status(500).json({ status: 'error', message: 'Gemini is not responding' });
    }
};

const router = Router();
router.get('/', gemini);

module.exports = { router, gemini };