/**
 * GET /api/data/status
 * Lists all available endpoints under /api/data/
 */

const { Router } = require('express');
const fs = require('fs');
const path = require('path');

const statusHandler = (req, res) => {
	try {
		const dataDir = __dirname;
		const endpoints = discoverEndpoints(dataDir);

		return res.json({
			status: 'ok',
			basePath: '/api/data',
			endpoints,
			timestamp: new Date().toISOString(),
		});
	} catch (err) {
		console.error('Error listing endpoints:', err);
		return res.status(500).json({
			error: 'Failed to list endpoints',
			details: err.message,
		});
	}
};

/**
 * Scan the data directory and discover all route files
 * Returns array of endpoint metadata
 */
function discoverEndpoints(dataDir) {
	const endpoints = [];

	const files = fs.readdirSync(dataDir, { withFileTypes: true });
	files.sort((a, b) => a.name.localeCompare(b.name));

	const descriptions = {
		'flights.js': {
			method: 'POST',
			path: '/data/flights',
			description: 'Search for flights between two cities with optional Supabase caching',
			example: { from: 'LAX', to: 'JFK', date: '2025-06-15', adults: 1, seat: 'economy' },
		},
		'status.js': {
			method: 'GET',
			path: '/data/status',
			description: 'List all available endpoints under /api/data/',
			example: null,
		},
		'visa-single.js': {
			method: 'POST',
			path: '/data/visa-single',
			description: 'Get visa information for a country',
			example: { country: 'France' },
		},
	};

	for (const entry of files) {
		if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.js')) continue;
		if (entry.name === 'status.js') continue; // Skip self to avoid duplicate in listing

		const meta = descriptions[entry.name] || {
			method: 'GET',
			path: `/data/${entry.name.replace(/\.js$/, '')}`,
			description: 'Endpoint',
			example: null,
		};

		endpoints.push(meta);
	}

	// Add self reference at the end
	endpoints.push(descriptions['status.js']);

	return endpoints;
}

const router = Router();
router.get('/', statusHandler);

module.exports = { router };
