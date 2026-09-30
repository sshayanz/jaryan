import { createServer } from 'node:http';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || '0.0.0.0';
const trustProxy = process.env.JARYAN_TRUST_PROXY === 'true';
const dbPath = resolve(process.env.JARYAN_DB_PATH || join(root, '..', '.jaryan-private', 'jaryan.sqlite'));
const relativeDbPath = relative(root, dbPath);
if (!relativeDbPath.startsWith(`..${sep}`) && relativeDbPath !== '..' && !isAbsolute(relativeDbPath)) {
  throw new Error('JARYAN_DB_PATH must point outside the public app directory');
}
const adminPassword = String(process.env.JARYAN_ADMIN_PASSWORD || '');
const cookieSecure = process.env.JARYAN_COOKIE_SECURE !== 'false';
const allowedOrigins = new Set(
  String(process.env.JARYAN_ALLOWED_ORIGINS || process.env.JARYAN_ALLOWED_ORIGIN || '')
    .split(',').map(origin => origin.trim()).filter(Boolean)
);
const schema = await readFile(join(here, 'schema.sql'), 'utf8');
await mkdir(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(schema);

const columns = table => new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(column => column.name));
if (!columns('feedback').has('member_id')) {
  db.exec('ALTER TABLE feedback ADD COLUMN member_id TEXT REFERENCES members(id) ON DELETE SET NULL');
}
db.exec('CREATE INDEX IF NOT EXISTS idx_feedback_member ON feedback(member_id, created_at)');

const rates = new Map();
const adminFailures = new Map();
const adminSessions = new Map();
const now = () => new Date().toISOString();
const text = (value, max) => String(value ?? '').trim().slice(0, max);
const normalizeMobile = value => text(value, 32)
  .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
  .replace(/[^+\d]/g, '');
const usernameKey = value => text(value, 60).normalize('NFKC').toLocaleLowerCase('fa-IR');
const remoteAddress = request => request.socket.remoteAddress || '';
const clientIp = request => {
  if (!trustProxy) return text(remoteAddress(request), 128);
  return text(request.headers['cf-connecting-ip'] || request.headers['x-real-ip'] || request.headers['x-forwarded-for'] || remoteAddress(request), 128).split(',')[0].trim();
};
const country = request => trustProxy
  ? text(request.headers['cf-ipcountry'] || request.headers['x-vercel-ip-country'] || '', 8).toUpperCase()
  : '';
const userAgent = request => text(request.headers['user-agent'], 512);
const escapePath = value => String(value || '').replace(/[?#].*$/, '');
const jalaliFormatter = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC' });
const jalaliParts = date => Object.fromEntries(jalaliFormatter.formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));

const send = (response, status, body, headers = {}) => {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    ...headers
  });
  response.end(JSON.stringify(body));
};
const sameOrigin = request => {
  const forwarded = trustProxy ? text(request.headers['x-forwarded-proto'], 12).split(',')[0] : '';
  const protocol = forwarded === 'https' || request.socket.encrypted ? 'https' : 'http';
  return `${protocol}://${request.headers.host || 'localhost'}`;
};
const originAllowed = request => {
  const origin = String(request.headers.origin || '');
  return !origin || origin === sameOrigin(request) || allowedOrigins.has(origin);
};
const corsHeaders = request => {
  const origin = String(request.headers.origin || '');
  return origin && origin !== sameOrigin(request) && allowedOrigins.has(origin)
    ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true', Vary: 'Origin' }
    : {};
};
const body = request => new Promise((resolveBody, reject) => {
  const chunks = [];
  let size = 0;
  let tooLarge = false;
  request.on('data', chunk => {
    size += chunk.length;
    if (size > 100_000) { tooLarge = true; return; }
    chunks.push(chunk);
  });
  request.on('end', () => {
    if (tooLarge) return reject(Object.assign(new Error('Payload too large'), { status: 413 }));
    try { resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
    catch { reject(Object.assign(new Error('Invalid JSON'), { status: 400 })); }
  });
  request.on('error', reject);
});
const rateLimit = (request, max = 60, windowMs = 60_000) => {
  const key = clientIp(request);
  const current = rates.get(key) || { count: 0, at: Date.now() };
  if (Date.now() - current.at > windowMs) { current.count = 0; current.at = Date.now(); }
  current.count += 1;
  rates.set(key, current);
  if (rates.size > 4000) for (const [ip, entry] of rates) if (Date.now() - entry.at > windowMs) rates.delete(ip);
  return current.count <= max;
};
const validBirthDate = value => {
  if (!value) return true;
  const match = text(value, 16).match(/^((?:13|14)\d{2})\/([0-1]\d)\/([0-3]\d)$/);
  if (!match) return false;
  const [, year, month, day] = match;
  const monthNumber = Number(month);
  const dayNumber = Number(day);
  if (monthNumber < 1 || monthNumber > 12 || dayNumber < 1 || dayNumber > (monthNumber <= 6 ? 31 : monthNumber <= 11 ? 30 : 30)) return false;
  const start = Date.UTC(Number(year) + 621, 1, 20);
  for (let offset = 0; offset < 430; offset += 1) {
    const parts = jalaliParts(new Date(start + offset * 86400000));
    if (parts.year === year && parts.month === month && parts.day === day) return true;
  }
  return false;
};
const deviceDetails = input => {
  const value = input && typeof input === 'object' ? input : {};
  return {
    platform: text(value.platform, 120),
    language: text(value.language, 32),
    languages: Array.isArray(value.languages) ? value.languages.slice(0, 12).map(item => text(item, 32)) : [],
    timezone: text(value.timezone, 80),
    screenWidth: Number.isFinite(Number(value.screenWidth)) ? Number(value.screenWidth) : null,
    screenHeight: Number.isFinite(Number(value.screenHeight)) ? Number(value.screenHeight) : null,
    deviceMemory: Number.isFinite(Number(value.deviceMemory)) ? Number(value.deviceMemory) : null,
    touchPoints: Number.isFinite(Number(value.touchPoints)) ? Number(value.touchPoints) : null,
    referrer: text(value.referrer, 512)
  };
};
const cookieValue = (request, name) => String(request.headers.cookie || '').split(';')
  .map(item => item.trim()).find(item => item.startsWith(`${name}=`))?.slice(name.length + 1) || '';
const adminSession = request => {
  const token = cookieValue(request, 'jaryan_admin_session');
  const expires = adminSessions.get(token);
  if (!token || !expires || expires <= Date.now()) {
    if (token) adminSessions.delete(token);
    return false;
  }
  return true;
};
const cookieOptions = request => `Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${cookieSecure ? '; Secure' : ''}`;
const clearCookie = request => `Path=/; HttpOnly; SameSite=Strict; Max-Age=0${cookieSecure ? '; Secure' : ''}`;
const passwordMatches = value => {
  if (!adminPassword || adminPassword.length < 16) return false;
  const candidate = createHash('sha256').update(String(value || '')).digest();
  const expected = createHash('sha256').update(adminPassword).digest();
  return timingSafeEqual(candidate, expected);
};
const adminData = () => {
  const members = db.prepare(`SELECT id, username, display_name AS displayName, email, mobile,
    birth_date AS birthDate, consent_at AS consentAt, created_at AS createdAt,
    updated_at AS updatedAt, last_seen_at AS lastSeenAt FROM members ORDER BY created_at DESC LIMIT 500`).all();
  const devices = db.prepare(`SELECT member_id AS memberId, device_key AS deviceKey,
    first_seen_at AS firstSeenAt, last_seen_at AS lastSeenAt, ip_address AS ip,
    country_code AS country, user_agent AS userAgent, details_json AS details
    FROM member_devices ORDER BY last_seen_at DESC LIMIT 1000`).all();
  const feedback = db.prepare(`SELECT f.id, f.member_id AS memberId, f.display_name AS name,
    f.category, f.message, f.page, f.ip_address AS ip, f.country_code AS country,
    f.user_agent AS userAgent, f.created_at AS createdAt, f.status,
    m.username AS username FROM feedback f LEFT JOIN members m ON m.id = f.member_id
    ORDER BY f.created_at DESC LIMIT 500`).all();
  const views = db.prepare('SELECT poem_id AS poemId, views, updated_at AS updatedAt FROM poem_views ORDER BY views DESC, updated_at DESC LIMIT 20').all();
  const devicesByMember = new Map();
  for (const item of devices) {
    const list = devicesByMember.get(item.memberId) || [];
    try { item.details = JSON.parse(item.details || '{}'); } catch { item.details = {}; }
    if (list.length < 10) list.push(item);
    devicesByMember.set(item.memberId, list);
  }
  return {
    summary: { members: members.length, active7Days: members.filter(item => Date.now() - new Date(item.lastSeenAt).getTime() < 7 * 86400000).length, feedback: feedback.length },
    members: members.map(member => ({ ...member, devices: devicesByMember.get(member.id) || [] })),
    feedback,
    views
  };
};

const syncMember = (request, payload) => {
  const localId = text(payload.localId, 80);
  const username = text(payload.username, 60);
  const key = usernameKey(username);
  const displayName = text(payload.displayName || username, 80);
  const email = text(payload.email, 160);
  const phone = normalizeMobile(payload.mobile);
  const birthDate = text(payload.birthDate, 16);
  const consentAt = text(payload.consentAt, 40);
  if (!/^[\w-]{16,80}$/.test(localId) || !key || Array.from(username).length < 3 || !displayName) {
    throw Object.assign(new Error('Member details are incomplete'), { status: 400 });
  }
  if (key === 'admin') throw Object.assign(new Error('Username is reserved'), { status: 409 });
  if (!consentAt || !Number.isFinite(Date.parse(consentAt))) throw Object.assign(new Error('Consent is required'), { status: 400 });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Object.assign(new Error('Invalid email'), { status: 400 });
  if (phone && phone.replace(/\D/g, '').length < 7) throw Object.assign(new Error('Invalid mobile number'), { status: 400 });
  if (!validBirthDate(birthDate)) throw Object.assign(new Error('Use a valid Jalali date (YYYY/MM/DD)'), { status: 400 });
  const timestamp = now();
  const existing = db.prepare('SELECT id FROM members WHERE local_id = ?').get(localId);
  const usernameOwner = db.prepare('SELECT id, local_id FROM members WHERE username_key = ?').get(key);
  if (usernameOwner && usernameOwner.local_id !== localId) throw Object.assign(new Error('Username is already registered'), { status: 409 });
  const id = existing?.id || randomUUID();
  if (existing) {
    db.prepare(`UPDATE members SET username = ?, username_key = ?, display_name = ?, email = ?, mobile = ?, birth_date = ?, consent_at = ?, updated_at = ?, last_seen_at = ? WHERE id = ?`)
      .run(username, key, displayName, email, phone, birthDate, consentAt, timestamp, timestamp, id);
  } else {
    db.prepare(`INSERT INTO members (id, local_id, username, username_key, display_name, email, mobile, birth_date, consent_at, created_at, updated_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, localId, username, key, displayName, email, phone, birthDate, consentAt, timestamp, timestamp, timestamp);
  }
  const ip = clientIp(request);
  const region = country(request);
  const agent = userAgent(request);
  db.prepare(`INSERT OR IGNORE INTO member_consents (id, member_id, consent_at, ip_address, country_code, user_agent, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(randomUUID(), id, consentAt, ip, region, agent, timestamp);
  const details = deviceDetails(payload.device);
  const deviceKey = text(payload.deviceId, 80) || randomUUID();
  db.prepare(`INSERT INTO member_devices (id, member_id, device_key, first_seen_at, last_seen_at, ip_address, country_code, user_agent, details_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(member_id, device_key) DO UPDATE SET last_seen_at = excluded.last_seen_at, ip_address = excluded.ip_address,
      country_code = excluded.country_code, user_agent = excluded.user_agent, details_json = excluded.details_json`)
    .run(randomUUID(), id, deviceKey, timestamp, timestamp, ip, region, agent, JSON.stringify(details));
  return { id, username, lastSeenAt: timestamp };
};

const saveFeedback = (request, payload) => {
  const message = text(payload.message, 3000);
  const category = ['general', 'bug', 'suggestion'].includes(payload.category) ? payload.category : 'general';
  if (!message) throw Object.assign(new Error('Message is required'), { status: 400 });
  const memberId = text(payload.memberId, 80);
  const member = memberId ? db.prepare('SELECT id, username, display_name, mobile FROM members WHERE id = ?').get(memberId) : null;
  const timestamp = now();
  db.prepare(`INSERT INTO feedback (id, user_id, member_id, display_name, mobile, category, message, page, device_json, ip_address, country_code, user_agent, created_at)
    VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(randomUUID(), member?.id || null, member?.display_name || null, member?.mobile || null, category, message,
      text(payload.page, 200), member ? JSON.stringify(deviceDetails(payload.device)) : null,
      member ? clientIp(request) : null, member ? country(request) : null, member ? userAgent(request) : null, timestamp);
  return { accepted: true, member: member?.username || null };
};

const saveShares = payload => {
  const poemId = text(payload.poemId, 220);
  const wholePoem = payload.wholePoem === true;
  const indexes = Array.isArray(payload.coupletIndexes) ? [...new Set(payload.coupletIndexes)] : [];
  if (!/^[\w-]+\/[\w-]+\/[\w-]+$/.test(poemId)) throw Object.assign(new Error('Invalid poem id'), { status: 400 });
  if (wholePoem ? indexes.length > 0 : !indexes.length || indexes.length > 100 || indexes.some(index => !Number.isInteger(index) || index < 0 || index > 50_000)) {
    throw Object.assign(new Error('Invalid share selection'), { status: 400 });
  }
  const timestamp = now();
  const insert = db.prepare(`INSERT INTO content_shares (share_key, poem_id, couplet_index, shares, updated_at)
    VALUES (?, ?, ?, 1, ?) ON CONFLICT(share_key) DO UPDATE SET shares = shares + 1, updated_at = excluded.updated_at`);
  db.exec('BEGIN');
  try {
    if (wholePoem) insert.run(`poem:${poemId}`, poemId, null, timestamp);
    else for (const index of indexes) insert.run(`couplet:${poemId}:${index}`, poemId, index, timestamp);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return { recorded: true };
};

const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.bin': 'application/octet-stream', '.webmanifest': 'application/manifest+json'
};
const serve = async (request, response, pathname) => {
  const requested = pathname === '/' ? '/index.html' : pathname;
  const file = resolve(root, `.${normalize(escapePath(requested))}`);
  const privateDataDir = resolve(here, 'data');
  if (!file.startsWith(`${root}${sep}`) || file.startsWith(`${privateDataDir}${sep}`)) {
    return send(response, 403, { error: 'Forbidden' });
  }
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error('Not a file');
    response.writeHead(200, {
      'Content-Type': mime[extname(file)] || 'application/octet-stream',
      'Cache-Control': extname(file) === '.html' ? 'no-cache' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin'
    });
    createReadStream(file).pipe(response);
  } catch {
    send(response, 404, { error: 'Not found' });
  }
};

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`).pathname;
  if (!pathname.startsWith('/api/')) return serve(request, response, pathname);
  const headers = corsHeaders(request);
  if (!originAllowed(request)) return send(response, 403, { error: 'Origin not allowed' });
  if (request.method === 'OPTIONS') {
    response.writeHead(204, { ...headers, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600' });
    return response.end();
  }
  if (!rateLimit(request)) return send(response, 429, { error: 'Too many requests' }, headers);
  try {
    if (request.method === 'GET' && pathname === '/api/v1/health') return send(response, 200, { ok: true, version: '1' }, headers);
    if (request.method === 'GET' && pathname === '/api/v1/flow') {
      const popular = db.prepare('SELECT poem_id AS poemId, views FROM poem_views ORDER BY views DESC, updated_at DESC LIMIT 20').all();
      const popularPoets = db.prepare(`SELECT substr(poem_id, 1, instr(poem_id, '/') - 1) AS poetId, SUM(views) AS views
        FROM poem_views GROUP BY poetId ORDER BY views DESC, poetId LIMIT 20`).all();
      const sharedPoets = db.prepare(`SELECT substr(poem_id, 1, instr(poem_id, '/') - 1) AS poetId, SUM(shares) AS shares
        FROM content_shares GROUP BY poetId ORDER BY shares DESC, poetId LIMIT 20`).all();
      const sharedPoems = db.prepare(`SELECT poem_id AS poemId, shares FROM content_shares
        WHERE couplet_index IS NULL ORDER BY shares DESC, updated_at DESC LIMIT 20`).all();
      const sharedCouplets = db.prepare(`SELECT poem_id AS poemId, couplet_index AS coupletIndex, shares FROM content_shares
        WHERE couplet_index IS NOT NULL ORDER BY shares DESC, updated_at DESC LIMIT 20`).all();
      return send(response, 200, { popular, popularPoets, sharedPoets, sharedPoems, sharedCouplets }, headers);
    }
    if (request.method === 'GET' && pathname === '/api/v1/admin/session') return send(response, 200, { authenticated: adminSession(request) }, headers);
    if (request.method === 'POST' && pathname === '/api/v1/admin/login') {
      const address = clientIp(request);
      for (const [token, expires] of adminSessions) if (expires <= Date.now()) adminSessions.delete(token);
      const failed = adminFailures.get(address) || { count: 0, at: Date.now() };
      if (Date.now() - failed.at < 15 * 60_000 && failed.count >= 5) return send(response, 429, { error: 'Too many login attempts' }, headers);
      const payload = await body(request);
      if (!passwordMatches(payload.password)) {
        failed.count += 1; failed.at = Date.now(); adminFailures.set(address, failed);
        return send(response, 401, { error: adminPassword ? 'Invalid admin credentials' : 'Admin password is not configured' }, headers);
      }
      adminFailures.delete(address);
      const token = randomBytes(32).toString('base64url');
      adminSessions.set(token, Date.now() + 8 * 60 * 60_000);
      return send(response, 200, { authenticated: true }, { ...headers, 'Set-Cookie': `jaryan_admin_session=${token}; ${cookieOptions(request)}` });
    }
    if (request.method === 'POST' && pathname === '/api/v1/admin/logout') {
      adminSessions.delete(cookieValue(request, 'jaryan_admin_session'));
      return send(response, 200, { authenticated: false }, { ...headers, 'Set-Cookie': `jaryan_admin_session=; ${clearCookie(request)}` });
    }
    if (pathname.startsWith('/api/v1/admin/') && !adminSession(request)) return send(response, 401, { error: 'Admin sign-in required' }, headers);
    if (request.method === 'GET' && pathname === '/api/v1/admin/data') return send(response, 200, adminData(), headers);
    if (request.method === 'POST' && pathname === '/api/v1/admin/member/update') {
      const payload = await body(request);
      const id = text(payload.memberId, 80);
      const displayName = text(payload.displayName, 80);
      const email = text(payload.email, 160);
      const phone = normalizeMobile(payload.mobile);
      const birthDate = text(payload.birthDate, 16);
      if (!id || !displayName) return send(response, 400, { error: 'Member and display name are required' }, headers);
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return send(response, 400, { error: 'Invalid email' }, headers);
      if (phone && phone.replace(/\D/g, '').length < 7) return send(response, 400, { error: 'Invalid mobile number' }, headers);
      if (!validBirthDate(birthDate)) return send(response, 400, { error: 'Use a valid Jalali date (YYYY/MM/DD)' }, headers);
      const result = db.prepare('UPDATE members SET display_name = ?, email = ?, mobile = ?, birth_date = ?, updated_at = ? WHERE id = ?')
        .run(displayName, email, phone, birthDate, now(), id);
      if (!result.changes) return send(response, 404, { error: 'Member not found' }, headers);
      return send(response, 200, { updated: true }, headers);
    }
    if (request.method !== 'POST') return send(response, 405, { error: 'Method not allowed' }, headers);
    const payload = await body(request);
    if (pathname === '/api/v1/members/sync') return send(response, 200, { member: syncMember(request, payload) }, headers);
    if (pathname === '/api/v1/feedback') return send(response, 201, saveFeedback(request, payload), headers);
    if (pathname === '/api/v1/shares') return send(response, 202, saveShares(payload), headers);
    if (pathname === '/api/v1/views') {
      const poemId = text(payload.poemId, 220);
      if (!/^[\w-]+\/[\w-]+\/[\w-]+$/.test(poemId)) return send(response, 400, { error: 'Invalid poem id' }, headers);
      db.prepare(`INSERT INTO poem_views (poem_id, views, updated_at) VALUES (?, 1, ?)
        ON CONFLICT(poem_id) DO UPDATE SET views = views + 1, updated_at = excluded.updated_at`).run(poemId, now());
      return send(response, 202, { recorded: true }, headers);
    }
    return send(response, 404, { error: 'Not found' }, headers);
  } catch (error) {
    return send(response, error.status || 400, { error: error.message || 'Request failed' }, headers);
  }
});

server.listen(port, host, () => console.log(`Jaryan server listening on http://${host}:${port}`));
const close = () => { db.close(); server.close(() => process.exit(0)); };
process.on('SIGINT', close);
process.on('SIGTERM', close);
