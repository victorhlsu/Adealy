/**
 * GET /api/gemini
 * Backward-compatible Gemini endpoint (same as /api/gemini/status).
 *
 * Response 200:
 * { "status": "ok", "message": "Gemini is active and ready" }
 */

const { Router } = require('express');
const { gemini } = require('./status');

const router = Router();

// Keeps backward-compatible path: GET /api/gemini
router.get('/', gemini);

module.exports = { router };
