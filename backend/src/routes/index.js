const fs = require('fs');
const path = require('path');
const { Router } = require('express');

const router = Router();

const HTTP_METHODS = new Set(['get', 'post']);

const isExpressRouter = (value) => {
	return (
		typeof value === 'function' &&
		typeof value.use === 'function' &&
		Array.isArray(value.stack)
	);
};

const toPosixPath = (p) => p.replace(/\\/g, '/');

const mountFromFilePath = (fullPath, { stripMethodSuffix = false } = {}) => {
	const rel = toPosixPath(path.relative(__dirname, fullPath));
	let withoutExt = rel.replace(/\.js$/i, '');
	if (stripMethodSuffix) {
		withoutExt = withoutExt.replace(/\.(get|post)$/i, '');
	}
	const withoutIndex = withoutExt.replace(/\/index$/i, '');
	return '/' + withoutIndex.replace(/^\//, '');
};

const mountFromDirectory = (fullPath) => {
	const relDir = toPosixPath(path.relative(__dirname, path.dirname(fullPath)));
	if (!relDir) return '/';
	return '/' + relDir.replace(/^\//, '');
};

const methodFromFilename = (fullPath) => {
	const base = path.basename(fullPath).toLowerCase();
	if (!base.endsWith('.js')) return null;

	const stem = base.slice(0, -3); // remove .js
	if (HTTP_METHODS.has(stem)) return stem;

	const m = stem.match(/\.(get|post)$/i);
	return m ? m[1].toLowerCase() : null;
};

const shouldIgnoreFile = (fullPath) => {
	const base = path.basename(fullPath).toLowerCase();
	// Only ignore this loader file (root index.js). Nested index.js should be mounted.
	return fullPath === __filename || base === '.ds_store';
};

const collectRouteFiles = (dir) => {
	const entries = fs.readdirSync(dir, { withFileTypes: true });
	entries.sort((a, b) => a.name.localeCompare(b.name));

	const files = [];
	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...collectRouteFiles(fullPath));
			continue;
		}

		if (!entry.isFile()) continue;
		if (!entry.name.toLowerCase().endsWith('.js')) continue;
		if (shouldIgnoreFile(fullPath)) continue;

		files.push(fullPath);
	}

	return files;
};

const loadAndMount = () => {
	const files = collectRouteFiles(__dirname);

	for (const file of files) {
		const fileMethod = methodFromFilename(file);
		const mountPath = fileMethod
			? (path.basename(file, '.js').toLowerCase() === fileMethod
				? mountFromDirectory(file)
				: mountFromFilePath(file, { stripMethodSuffix: true }))
			: mountFromFilePath(file);

		// eslint-disable-next-line global-require, import/no-dynamic-require
		const mod = require(file);
		const maybeRouter = isExpressRouter(mod) ? mod : mod?.router;

		if (isExpressRouter(maybeRouter)) {
			router.use(mountPath, maybeRouter);
			continue;
		}

		const handler = typeof mod === 'function' ? mod : mod?.handler;
		if (typeof handler !== 'function') continue;

		const methodsRaw = mod?.method ?? fileMethod ?? 'get';
		const methods = Array.isArray(methodsRaw) ? methodsRaw : [methodsRaw];
		const routePath = typeof mod?.path === 'string' ? mod.path : '/';
		const middlewares = Array.isArray(mod?.middlewares) ? mod.middlewares : [];

		const child = Router();
		for (const m of methods) {
			const method = String(m || '').toLowerCase();
			if (!HTTP_METHODS.has(method)) continue;
			child[method](routePath, ...middlewares, handler);
		}

		router.use(mountPath, child);
	}
};

loadAndMount();

// Redirect bare /api to /api/status for convenience.
router.get('/', (req, res) => res.redirect('/api/status'));

module.exports = router;
