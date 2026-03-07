/**
 * GET /api/status
 * Backend health check with uptime and host info.
 *
 * Response:
 * {
 *   "status": "ok",
 *   "uptime": 123.45,              // seconds
 *   "timestamp": "2024-01-01T00:00:00.000Z",
 *   "hostname": "your-hostname"
 * }
 */

const os = require('os');
const { Router } = require('express');

const status = (req, res) => {

	res.json({
		status: 'ok',
		uptime: process.uptime(),
		timestamp: new Date().toISOString(),
		hostname: os.hostname(),
	});
};

const router = Router();
router.get('/', status);

module.exports = { router, status };
