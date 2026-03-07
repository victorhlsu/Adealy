const STORAGE_KEY = 'adealy_api_tester_base_url';

const byId = (id) => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element: ${id}`);
  return el;
};

const state = {
  baseUrlEl: byId('baseUrl'),
  methodEl: byId('method'),
  pathEl: byId('path'),
  headersEl: byId('headers'),
  bodyEl: byId('body'),
  includeBodyOnGetEl: byId('includeBodyOnGet'),
  timeoutMsEl: byId('timeoutMs'),
  outputEl: byId('output'),
  responseMetaEl: byId('responseMeta'),
  healthPillEl: byId('healthPill'),
};

function normalizeBaseUrl(raw) {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return 'http://localhost:3001/api';
  return trimmed.replace(/\/+$/, '');
}

function normalizePath(raw) {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return '/status';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function setHealthPill(status, text) {
  state.healthPillEl.textContent = text;
  state.healthPillEl.classList.remove('pill--ok', 'pill--bad');
  if (status === 'ok') state.healthPillEl.classList.add('pill--ok');
  if (status === 'bad') state.healthPillEl.classList.add('pill--bad');
}

function safeJsonParse(text, fallback = null) {
  if (!text || !text.trim()) return fallback;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function pretty(value) {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function setOutput(metaLine, content) {
  state.responseMetaEl.textContent = metaLine;
  state.outputEl.textContent = content;
}

function getTimeoutMs() {
  const raw = (state.timeoutMsEl.value ?? '').trim();
  if (!raw) return 90000;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 90000;
  return n;
}

async function sendRequest({ method, path, headersJson, bodyJson }) {
  const baseUrl = normalizeBaseUrl(state.baseUrlEl.value);
  const normalizedPath = normalizePath(path);
  const url = `${baseUrl}${normalizedPath}`;

  localStorage.setItem(STORAGE_KEY, baseUrl);

  const headersFromText = safeJsonParse(headersJson, {});
  if (headersFromText === null) {
    throw new Error('Headers must be valid JSON (or empty).');
  }

  const wantsBody =
    method !== 'GET' &&
    method !== 'DELETE' ?
      true :
      Boolean(state.includeBodyOnGetEl.checked);

  let body = undefined;
  let headers = { ...headersFromText };

  if (wantsBody) {
    if ((bodyJson ?? '').trim().length) {
      const parsed = safeJsonParse(bodyJson, null);
      if (parsed === null) throw new Error('Body must be valid JSON (or empty).');
      body = JSON.stringify(parsed);
      if (!Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) {
        headers['Content-Type'] = 'application/json';
      }
    }
  }

  const controller = new AbortController();
  const timeoutMs = getTimeoutMs();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  const startedAt = performance.now();
  try {
    const res = await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal,
    });

    const contentType = res.headers.get('content-type') || '';
    const text = await res.text();

    const elapsedMs = Math.round(performance.now() - startedAt);
    const meta = `${method} ${normalizedPath} → ${res.status} ${res.statusText} • ${elapsedMs}ms • ${contentType || 'unknown content-type'}`;

    const asJson = safeJsonParse(text, null);
    if (asJson !== null) {
      setOutput(meta, pretty(asJson));
    } else {
      setOutput(meta, text || '(empty response)');
    }

    return { ok: res.ok, status: res.status };
  } catch (err) {
    const elapsedMs = Math.round(performance.now() - startedAt);
    const meta = `${method} ${normalizedPath} → FAILED • ${elapsedMs}ms`;

    const msg = err?.name === 'AbortError'
      ? `Request timed out after ${timeoutMs}ms`
      : (err?.message || String(err));

    setOutput(meta, msg);
    return { ok: false, status: 0 };
  } finally {
    clearTimeout(t);
  }
}

function applyPreset({ method, path, headers, body }) {
  state.methodEl.value = method;
  state.pathEl.value = path;
  state.headersEl.value = headers ?? '';
  state.bodyEl.value = body ?? '';
}

async function pingStatus() {
  const result = await sendRequest({
    method: 'GET',
    path: '/status',
    headersJson: '',
    bodyJson: '',
  });
  setHealthPill(result.ok ? 'ok' : 'bad', result.ok ? 'Backend OK' : 'Backend unreachable');
}

function clearResponse() {
  setHealthPill('neutral', 'Not checked');
  setOutput('No request yet.', '');
}

function init() {
  const saved = localStorage.getItem(STORAGE_KEY);
  state.baseUrlEl.value = normalizeBaseUrl(saved);

  state.pathEl.value = '/status';
  state.timeoutMsEl.value = '90000';
  state.headersEl.value = '';
  state.bodyEl.value = '';

  byId('btnSend').addEventListener('click', async () => {
    await sendRequest({
      method: state.methodEl.value,
      path: state.pathEl.value,
      headersJson: state.headersEl.value,
      bodyJson: state.bodyEl.value,
    });
  });

  byId('btnPing').addEventListener('click', pingStatus);
  byId('btnClear').addEventListener('click', clearResponse);

  byId('presetStatus').addEventListener('click', () => {
    applyPreset({ method: 'GET', path: '/status' });
  });

  byId('presetGemini').addEventListener('click', () => {
    applyPreset({ method: 'GET', path: '/gemini/status' });
  });

  byId('presetVisaSingle').addEventListener('click', () => {
    applyPreset({
      method: 'POST',
      path: '/visa-single',
      headers: '{"Content-Type":"application/json"}',
      body: '{"country":"France"}',
    });
  });

  byId('presetFlights').addEventListener('click', () => {
    applyPreset({
      method: 'POST',
      path: '/data/flights',
      headers: '{"Content-Type":"application/json"}',
      body: '{"from":"LAX","to":"JFK","date":"2026-06-15","returnDate":"2026-06-22","adults":1,"children":0,"seat":"economy"}',
    });
  });

  byId('presetHotels').addEventListener('click', () => {
    applyPreset({
      method: 'POST',
      path: '/data/hotels',
      headers: '{"Content-Type":"application/json"}',
      body: '{"location":"San Francisco, CA","checkin":"2026-06-15","checkout":"2026-06-22","adults":2,"children":0,"rooms":1,"currency":"USD"}',
    });
  });

  // Enter-to-send for quick iteration (Ctrl/Cmd+Enter in textareas).
  window.addEventListener('keydown', async (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      await sendRequest({
        method: state.methodEl.value,
        path: state.pathEl.value,
        headersJson: state.headersEl.value,
        bodyJson: state.bodyEl.value,
      });
    }
  });
}

init();
