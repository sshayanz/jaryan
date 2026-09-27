import { createServer } from 'node:http';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || '0.0.0.0';
const dbPath = resolve(process.env.JARYAN_DB_PATH || join(here, 'data', 'jaryan.sqlite'));
const allowedOrigin = process.env.JARYAN_ALLOWED_ORIGIN || '';
const schema = await readFile(join(here, 'schema.sql'), 'utf8');
await mkdir(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(schema);

const limits = new Map();
const now = () => new Date().toISOString();
const text = (value, max) => String(value ?? '').trim().slice(0, max);
const mobile = value => text(value, 32).replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))).replace(/[^+\d]/g, '');
const clientIp = request => text(String(request.headers['cf-connecting-ip'] || request.headers['x-real-ip'] || request.headers['x-forwarded-for'] || request.socket.remoteAddress || '').split(',')[0], 128);
const country = request => text(request.headers['cf-ipcountry'] || request.headers['x-vercel-ip-country'] || '', 8).toUpperCase();
const userAgent = request => text(request.headers['user-agent'], 512);

const send = (response, status, body, headers = {}) => {
  const payload = JSON.stringify(body);
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  response.end(payload);
};
const corsHeaders = request => {
  const origin = allowedOrigin || request.headers.origin;
  return origin ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true', Vary: 'Origin' } : {};
};
const body = request => new Promise((resolveBody, reject) => {
  let raw = '';
  request.on('data', chunk => {
    raw += chunk;
    if (raw.length > 100_000) reject(new Error('Payload too large'));
  });
  request.on('end', () => {
    try { resolveBody(JSON.parse(raw || '{}')); } catch { reject(new Error('Invalid JSON')); }
  });
  request.on('error', reject);
});
const rateLimit = request => {
  const key = clientIp(request);
  const current = limits.get(key) || { count: 0, at: Date.now() };
  if (Date.now() - current.at > 60_000) { current.count = 0; current.at = Date.now(); }
  current.count += 1;
  limits.set(key, current);
  return current.count <= 60;
};
const device = value => {
  const input = value && typeof value === 'object' ? value : {};
  return {
    userAgent: text(input.userAgent, 512), platform: text(input.platform, 120), language: text(input.language, 32),
    languages: Array.isArray(input.languages) ? input.languages.slice(0, 12).map(item => text(item, 32)) : [],
    timezone: text(input.timezone, 80), screenWidth: Number.isFinite(Number(input.screenWidth)) ? Number(input.screenWidth) : null,
    screenHeight: Number.isFinite(Number(input.screenHeight)) ? Number(input.screenHeight) : null,
    deviceMemory: Number.isFinite(Number(input.deviceMemory)) ? Number(input.deviceMemory) : null,
    touchPoints: Number.isFinite(Number(input.touchPoints)) ? Number(input.touchPoints) : null,
    referrer: text(input.referrer, 512)
  };
};

const upsertUser = (request, payload) => {
  const name = text(payload.name, 80);
  const phone = mobile(payload.mobile);
  const consentAt = text(payload.consentAt, 40) || now();
  if (!name || phone.length < 7) throw new Error('Name and a valid mobile number are required');
  const timestamp = now();
  const ip = clientIp(request);
  const region = country(request);
  const agent = userAgent(request);
  const existing = db.prepare('SELECT id FROM users WHERE mobile = ?').get(phone);
  const id = existing?.id || randomUUID();
  if (existing) db.prepare('UPDATE users SET display_name = ?, consent_at = ?, updated_at = ?, last_seen_at = ? WHERE id = ?').run(name, consentAt, timestamp, timestamp, id);
  else db.prepare('INSERT INTO users (id, display_name, mobile, consent_at, created_at, updated_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, name, phone, consentAt, timestamp, timestamp, timestamp);
  db.prepare('INSERT INTO consent_events (id, user_id, consent_at, ip_address, country_code, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(randomUUID(), id, consentAt, ip, region, agent, timestamp);
  const details = device(payload.device);
  db.prepare('INSERT INTO user_devices (id, user_id, first_seen_at, last_seen_at, ip_address, country_code, user_agent, platform, language, languages_json, timezone, screen_width, screen_height, device_memory, touch_points, referrer) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(randomUUID(), id, timestamp, timestamp, ip, region, details.userAgent || agent, details.platform, details.language, JSON.stringify(details.languages), details.timezone, details.screenWidth, details.screenHeight, details.deviceMemory, details.touchPoints, details.referrer);
  return { id, name, mobile: phone };
};

const saveFeedback = (request, payload) => {
  const message = text(payload.message, 3000);
  const category = ['general', 'bug', 'suggestion'].includes(payload.category) ? payload.category : 'general';
  if (!message) throw new Error('Message is required');
  const phone = mobile(payload.mobile);
  const user = phone ? db.prepare('SELECT id FROM users WHERE mobile = ?').get(phone) : null;
  const details = device(payload.device);
  db.prepare('INSERT INTO feedback (id, user_id, display_name, mobile, category, message, page, device_json, ip_address, country_code, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(randomUUID(), user?.id || null, text(payload.name, 80), phone, category, message, text(payload.page, 200), JSON.stringify(details), clientIp(request), country(request), userAgent(request), now());
  return { accepted: true };
};

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.bin': 'application/octet-stream', '.webmanifest': 'application/manifest+json' };
const serve = async (request, response, pathname) => {
  const requested = pathname === '/' ? '/index.html' : pathname;
  const file = resolve(root, `.${normalize(requested)}`);
  if (!file.startsWith(root)) return send(response, 403, { error: 'Forbidden' }, corsHeaders(request));
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error('Not a file');
    response.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control': extname(file) === '.html' ? 'no-cache' : 'public, max-age=3600' });
    createReadStream(file).pipe(response);
  } catch {
    send(response, 404, { error: 'Not found' }, corsHeaders(request));
  }
};

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`).pathname;
  if (pathname.startsWith('/api/')) {
    const headers = corsHeaders(request);
    if (request.method === 'OPTIONS') { response.writeHead(204, { ...headers, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }); return response.end(); }
    if (!rateLimit(request)) return send(response, 429, { error: 'Too many requests' }, headers);
    try {
      if (request.method === 'GET' && pathname === '/api/v1/health') return send(response, 200, { ok: true, version: '1' }, headers);
      if (request.method !== 'POST') return send(response, 405, { error: 'Method not allowed' }, headers);
      const payload = await body(request);
      if (pathname === '/api/v1/users/upsert') return send(response, 200, { user: upsertUser(request, payload) }, headers);
      if (pathname === '/api/v1/feedback') return send(response, 201, saveFeedback(request, payload), headers);
      return send(response, 404, { error: 'Not found' }, headers);
    } catch (error) {
      return send(response, 400, { error: error.message || 'Request failed' }, headers);
    }
  }
  return serve(request, response, pathname);
});

server.listen(port, host, () => console.log(`Jaryan server listening on http://${host}:${port}`));
const close = () => { db.close(); server.close(() => process.exit(0)); };
process.on('SIGINT', close);
process.on('SIGTERM', close);
