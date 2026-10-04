import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { AppError, analyze, validateInput } from './analysis.mjs';

const assets = { '/how-it-works': ['how-it-works.html', 'text/html'], '/handoff.mjs': ['handoff.mjs', 'text/javascript'], '/analysis.mjs': ['../analysis.mjs', 'text/javascript'], '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'], '/logo.svg': ['logo.svg', 'image/svg+xml'] };
function safeEqual(a, b) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function createApp(config = {}) {
  const key = config.key ?? process.env.OPENAI_API_KEY ?? '';
  const model = config.model ?? process.env.OPENAI_MODEL ?? 'gpt-4.1-mini';
  const access = config.access ?? process.env.APP_ACCESS_TOKEN ?? '';
  const review = config.review ?? process.env.REVIEW_URL ?? '';
  const cap = Number(config.cap ?? process.env.MAX_DAILY_CALLS ?? 30);
  if (!Number.isSafeInteger(cap) || cap < 1 || cap > 1000) throw new Error('MAX_DAILY_CALLS must be an integer between 1 and 1000.');
  if (review && !/^https:\/\//.test(review)) throw new Error('REVIEW_URL must be an HTTPS address.');
  const call = config.analyzeFn ?? analyze;
  let day = '', calls = 0, busy = false;
  const recent = new Map();
  // ponytail: limits are per process and reset on restart; use shared durable limits before a public multi-instance launch.
  return http.createServer(async (req, res) => {
    const headers = {
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
    };
    const send = (status, body, type = 'application/json') => {
      if (!res.writableEnded) { res.writeHead(status, { ...headers, 'Content-Type': `${type}; charset=utf-8` }); res.end(type === 'application/json' ? JSON.stringify(body) : body); }
    };
    let acquired = false;
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (req.method === 'GET' && assets[path]) {
        const [file, type] = assets[path];
        return send(200, await readFile(new URL(`./public/${file}`, import.meta.url)), type);
      }
      if (req.method === 'GET' && path === '/api/config') return send(200, { ready: Boolean(key), access_required: Boolean(access), review_url: review, model: key ? model : null });
      if (path !== '/api/analyze') return send(404, { error: 'Not found.' });
      if (req.method !== 'POST') return send(405, { error: 'Use POST for an AI check.' });
      // Only same-origin browser requests may spend the owner's API allowance.
      if (req.headers.origin) {
        let origin;
        try { origin = new URL(req.headers.origin); } catch { throw new AppError(403, 'This request origin is not allowed.'); }
        if (!['http:', 'https:'].includes(origin.protocol) || origin.host !== req.headers.host) throw new AppError(403, 'This request origin is not allowed.');
      }
      if (access && !safeEqual(req.headers['x-access-token'] ?? '', access)) throw new AppError(401, 'Enter the beta access code supplied by the app owner.');
      if (!key) throw new AppError(503, 'Live AI is not connected yet. The app owner must configure the server-side API key.');
      if (!(req.headers['content-type'] ?? '').startsWith('application/json')) throw new AppError(415, 'Send the scope as JSON text.');
      if (Number(req.headers['content-length'] ?? 0) > 140000) throw new AppError(413, 'This excerpt is too large. Use the relevant scope clauses only.');
      let bytes = 0, chunks = [];
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 140000) throw new AppError(413, 'This excerpt is too large.');
        chunks.push(chunk);
      }
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new AppError(400, 'The submitted text could not be read.'); }
      const input = validateInput(body);
      const today = new Date().toISOString().slice(0, 10);
      if (day !== today) { day = today; calls = 0; }
      if (calls >= cap) throw new AppError(429, 'Today’s AI check allowance has been reached. Please return tomorrow.');
      if (busy) throw new AppError(429, 'Another check is running. Please try again shortly.');
      const now = Date.now(), ip = req.socket.remoteAddress;
      for (const [address, at] of recent) if (now - at > 60000) recent.delete(address);
      if (recent.has(ip)) throw new AppError(429, 'Please wait a minute between live AI checks.');
      recent.set(ip, now); calls++; busy = true; acquired = true;
      const result = await call(input, { key, model });
      send(200, result);
    } catch (error) {
      // Do not log user text, provider responses, keys, or access codes.
      send(error instanceof AppError ? error.status : 500, { error: error instanceof AppError ? error.message : 'The check could not be completed. Please try again.' });
    } finally { if (acquired) busy = false; }
  });
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const host = process.env.HOST ?? '127.0.0.1';
  if (!['127.0.0.1', 'localhost', '::1'].includes(host) && !process.env.APP_ACCESS_TOKEN) throw new Error('Set APP_ACCESS_TOKEN before exposing the server to other devices.');
  const port = Number(process.env.PORT ?? 4173);
  const server = createApp();
  server.requestTimeout = 60000;
  server.headersTimeout = 15000;
  server.listen(port, host, () => console.log(`ScopeLedger Lens: http://${host}:${port}`));
}
