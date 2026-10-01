import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { setTimeout as delay } from 'node:timers/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const adminPassword = 'release-test-admin-password-42';
const shayanPassword = 'release-test-shayan-password-42';

const unusedPort = async () => {
  const probe = createServer();
  await new Promise((resolveListen, reject) => probe.once('error', reject).listen(0, '127.0.0.1', resolveListen));
  const port = probe.address().port;
  await new Promise(resolveClose => probe.close(resolveClose));
  return port;
};

const stopServer = async child => {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([once(child, 'exit'), delay(2000)]);
};

const startServer = async dataDir => {
  const port = await unusedPort();
  const child = spawn(process.execPath, [join(root, 'server', 'server.js')], {
    cwd: root,
    env: {
      ...process.env,
      HOST: '127.0.0.1', PORT: String(port),
      JARYAN_DB_PATH: join(dataDir, 'private.sqlite'),
      JARYAN_ADMIN_PASSWORD: adminPassword,
      JARYAN_SHAYAN_PASSWORD: shayanPassword,
      JARYAN_COOKIE_SECURE: 'false'
    },
    stdio: ['ignore', 'ignore', 'pipe']
  });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });
  const base = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(`${base}/api/v1/health`);
      if (response.ok) { ready = true; break; }
    } catch {}
    if (child.exitCode !== null) break;
    await delay(50);
  }
  assert.equal(ready, true, stderr);
  return { child, base, stderr: () => stderr };
};

test('server persists registered accounts, activity and sessions in SQLite', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'jaryan-070-'));
  let server = await startServer(dataDir);
  t.after(async () => {
    await stopServer(server.child);
    await rm(dataDir, { recursive: true, force: true });
  });

  const get = (path, headers = {}) => fetch(`${server.base}${path}`, { headers });
  const post = (path, payload = {}, headers = {}) => fetch(`${server.base}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(payload)
  });

  assert.equal((await get('/api/v1/admin/data')).status, 401);
  assert.equal((await post('/api/v1/members/sync', { username: 'legacy' })).status, 404);
  assert.equal((await get('/server/data/jaryan.sqlite')).status, 403);

  const shayanLogin = await post('/api/v1/auth/login', { username: 'shayan', password: shayanPassword });
  assert.equal(shayanLogin.status, 200, server.stderr());
  assert.equal((await shayanLogin.json()).account.role, 'user');

  const usernameCheck = await get('/api/v1/auth/username-availability?username=reader070');
  assert.equal((await usernameCheck.json()).available, true);
  const reservedCheck = await get('/api/v1/auth/username-availability?username=admin');
  assert.equal((await reservedCheck.json()).available, false);

  const consentAt = new Date().toISOString();
  const registration = await post('/api/v1/auth/register', {
    username: 'reader070', password: 'reader-test-password-42', displayName: 'Reader',
    email: 'reader@example.com', mobile: '+15551234567', birthDate: '', consent: true, consentAt,
    deviceId: randomUUID(), device: { platform: 'Test OS', language: 'fa', timezone: 'Asia/Tehran', screenWidth: 390, screenHeight: 844 }
  });
  assert.equal(registration.status, 201, await registration.clone().text());
  const registered = await registration.json();
  const memberId = registered.account.id;
  const userCookie = registration.headers.get('set-cookie').split(';')[0];
  assert.equal(registered.account.username, 'reader070');
  assert.equal(registered.account.role, 'user');
  assert.equal((await post('/api/v1/auth/register', {
    username: 'reader070', password: 'another-test-password', displayName: 'Duplicate', mobile: '+15551234567',
    consent: true, consentAt
  })).status, 409);

  const session = await get('/api/v1/auth/session', { cookie: userCookie });
  assert.equal((await session.json()).authenticated, true);
  assert.equal((await post('/api/v1/auth/favorites', { type: 'poem', id: 'hafez/ghazal/101', active: true }, { cookie: userCookie })).status, 200);
  assert.equal((await post('/api/v1/auth/favorites', { type: 'couplet', id: 'hafez/ghazal/101/0', active: true }, { cookie: userCookie })).status, 200);
  assert.equal((await post('/api/v1/auth/favorites', { type: 'poet', id: 'hafez', active: true }, { cookie: userCookie })).status, 200);
  assert.equal((await post('/api/v1/auth/favorites', { type: 'book', id: 'hafez/ghazal', active: true }, { cookie: userCookie })).status, 200);
  assert.equal((await post('/api/v1/auth/favorites', { type: 'poem', id: '../bad', active: true }, { cookie: userCookie })).status, 400);

  assert.equal((await post('/api/v1/views', { poemId: 'hafez/ghazal/101' }, { cookie: userCookie })).status, 202);
  assert.equal((await post('/api/v1/views', { poemId: 'hafez/ghazal/101' }, { cookie: userCookie })).status, 202);
  assert.equal((await post('/api/v1/views', { poemId: '../bad' })).status, 400);
  assert.equal((await post('/api/v1/shares', { poemId: 'hafez/ghazal/101', wholePoem: true }, { cookie: userCookie })).status, 202);
  assert.equal((await post('/api/v1/shares', { poemId: 'hafez/ghazal/101', coupletIndexes: [0, 2] }, { cookie: userCookie })).status, 202);
  assert.equal((await post('/api/v1/shares', { poemId: 'hafez/ghazal/101', coupletIndexes: [-1] })).status, 400);

  const accountData = await (await get('/api/v1/auth/data', { cookie: userCookie })).json();
  assert.deepEqual(accountData.favorites.poem, ['hafez/ghazal/101']);
  assert.deepEqual(accountData.favorites.couplet, ['hafez/ghazal/101/0']);
  assert.equal(accountData.history[0].id, 'hafez/ghazal/101');

  const flowResponse = await get('/api/v1/flow');
  assert.equal(flowResponse.status, 200);
  const flow = await flowResponse.json();
  assert.equal(flow.popular[0].views, 2);
  assert.equal(flow.popularFavorites[0].poemId, 'hafez/ghazal/101');
  assert.equal(flow.popularFavorites[0].favorites, 1);
  assert.equal(flow.popularPoets[0].poetId, 'hafez');
  assert.equal(flow.sharedPoems[0].shares, 1);
  assert.equal(flow.sharedCouplets.find(item => item.coupletIndex === 0).shares, 1);
  assert.equal((await post('/api/v1/views', { poemId: 'hafez/ghazal/101' }, { Origin: 'https://attacker.invalid' })).status, 403);

  const adminFailure = await post('/api/v1/admin/login', { username: 'admin', password: 'wrong-password' });
  assert.equal(adminFailure.status, 401);
  const adminLogin = await post('/api/v1/admin/login', { username: 'admin', password: adminPassword });
  assert.equal(adminLogin.status, 200, server.stderr());
  const adminCookie = adminLogin.headers.get('set-cookie').split(';')[0];
  const adminResponse = await get('/api/v1/admin/data', { cookie: adminCookie });
  assert.equal(adminResponse.status, 200);
  const admin = await adminResponse.json();
  const member = admin.members.find(item => item.id === memberId);
  assert.ok(member);
  assert.equal(member.favoritesCount, 4);
  assert.equal(member.viewsCount, 2);
  assert.equal(member.sharesCount, 3);
  assert.equal(member.devices[0].details.platform, 'Test OS');
  assert.equal(JSON.stringify(admin).includes('password_hash'), false);
  assert.equal(JSON.stringify(admin).includes('passwordHash'), false);

  const updatedProfile = await post('/api/v1/auth/profile', {
    displayName: 'Reader Two', email: 'reader2@example.com', mobile: '+15551234567', birthDate: ''
  }, { cookie: userCookie });
  assert.equal(updatedProfile.status, 200);
  assert.equal((await updatedProfile.json()).account.displayName, 'Reader Two');
  const changedCredentials = await post('/api/v1/auth/credentials', {
    currentPassword: 'reader-test-password-42', username: 'reader0702', password: 'reader-new-password-42'
  }, { cookie: userCookie });
  assert.equal(changedCredentials.status, 200);
  assert.equal((await changedCredentials.json()).account.username, 'reader0702');

  assert.equal((await post('/api/v1/auth/history/clear', {}, { cookie: userCookie })).status, 200);
  assert.deepEqual((await (await get('/api/v1/auth/data', { cookie: userCookie })).json()).history, []);
  assert.equal((await post('/api/v1/feedback', { message: 'Member note', category: 'suggestion', page: '#archive' }, { cookie: userCookie })).status, 201);
  assert.equal((await post('/api/v1/admin/logout', {}, { cookie: adminCookie })).status, 200);
  assert.equal((await get('/api/v1/admin/data', { cookie: adminCookie })).status, 401);
  assert.equal((await post('/api/v1/auth/logout', {}, { cookie: userCookie })).status, 200);
  const loggedOutSession = await get('/api/v1/auth/session', { cookie: userCookie });
  assert.equal((await loggedOutSession.json()).authenticated, false);

  await stopServer(server.child);
  server = await startServer(dataDir);
  const restoredLogin = await post('/api/v1/auth/login', { username: 'reader0702', password: 'reader-new-password-42' });
  assert.equal(restoredLogin.status, 200, server.stderr());
  const restoredCookie = restoredLogin.headers.get('set-cookie').split(';')[0];
  const restored = await (await get('/api/v1/auth/data', { cookie: restoredCookie })).json();
  assert.equal(restored.account.displayName, 'Reader Two');
  assert.deepEqual(restored.favorites.poem, ['hafez/ghazal/101']);
  assert.deepEqual(restored.history, []);
});

test('server migrates legacy member tables without dropping records', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'jaryan-070-migrate-'));
  const databasePath = join(dataDir, 'private.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE members (
      id TEXT PRIMARY KEY, local_id TEXT NOT NULL UNIQUE, username TEXT NOT NULL,
      username_key TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, email TEXT NOT NULL DEFAULT '',
      mobile TEXT NOT NULL DEFAULT '', birth_date TEXT NOT NULL DEFAULT '', consent_at TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_seen_at TEXT NOT NULL
    );
    INSERT INTO members VALUES ('legacy-id', 'legacy-local', 'legacy-reader', 'legacy-reader', 'Legacy Reader', '', '', '', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
    CREATE TABLE feedback (
      id TEXT PRIMARY KEY, user_id TEXT, display_name TEXT, mobile TEXT,
      category TEXT NOT NULL DEFAULT 'general', message TEXT NOT NULL, page TEXT,
      device_json TEXT, ip_address TEXT, country_code TEXT, user_agent TEXT,
      created_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new'
    );
  `);
  legacy.close();

  let server = await startServer(dataDir);
  t.after(async () => {
    await stopServer(server.child);
    await rm(dataDir, { recursive: true, force: true });
  });
  const login = await fetch(`${server.base}/api/v1/admin/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: adminPassword })
  });
  assert.equal(login.status, 200, server.stderr());
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const dataResponse = await fetch(`${server.base}/api/v1/admin/data`, { headers: { cookie } });
  assert.equal(dataResponse.status, 200);
  const data = await dataResponse.json();
  assert.equal(data.members.find(member => member.id === 'legacy-id')?.displayName, 'Legacy Reader');
  assert.equal(data.members.some(member => member.username === 'shayan'), true);
});
