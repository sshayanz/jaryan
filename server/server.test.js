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
import { setTimeout as delay } from 'node:timers/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const password = 'release-test-admin-password-42';

const unusedPort = async () => {
  const probe = createServer();
  await new Promise((resolveListen, reject) => probe.once('error', reject).listen(0, '127.0.0.1', resolveListen));
  const port = probe.address().port;
  await new Promise(resolveClose => probe.close(resolveClose));
  return port;
};

test('server protects member records and stores only aggregate views', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'jaryan-065-'));
  const port = await unusedPort();
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [join(root, 'server', 'server.js')], {
    cwd: root,
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), JARYAN_DB_PATH: join(dataDir, 'private.sqlite'), JARYAN_ADMIN_PASSWORD: password, JARYAN_COOKIE_SECURE: 'false' },
    stdio: ['ignore', 'ignore', 'pipe']
  });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });
  t.after(async () => {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      await Promise.race([once(child, 'exit'), delay(1500)]);
    }
    await rm(dataDir, { recursive: true, force: true });
  });

  let ready = false;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${base}/api/v1/health`);
      if (response.ok) { ready = true; break; }
    } catch {}
    await delay(50);
  }
  assert.equal(ready, true, stderr);

  const get = (path, headers = {}) => fetch(`${base}${path}`, { headers });
  const post = (path, payload, headers = {}) => fetch(`${base}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(payload)
  });

  assert.equal((await get('/api/v1/admin/data')).status, 401);
  assert.equal((await post('/api/v1/members/sync', { username: 'visitor' })).status, 400);
  assert.equal((await get('/server/data/jaryan.sqlite')).status, 403);

  const localId = randomUUID();
  const registration = await post('/api/v1/members/sync', {
    localId, username: 'reader065', displayName: 'Reader', email: 'reader@example.com', mobile: '+15551234567',
    birthDate: '1404/12/29', consentAt: new Date().toISOString(), deviceId: randomUUID(),
    device: { platform: 'Test OS', language: 'fa', timezone: 'Asia/Tehran', screenWidth: 390, screenHeight: 844 }
  });
  assert.equal(registration.status, 200);
  const memberId = (await registration.json()).member.id;

  assert.equal((await post('/api/v1/views', { poemId: 'hafez/ghazal/101' })).status, 202);
  assert.equal((await post('/api/v1/views', { poemId: 'hafez/ghazal/101' })).status, 202);
  assert.equal((await post('/api/v1/views', { poemId: '../bad' })).status, 400);
  assert.equal((await post('/api/v1/shares', { poemId: 'hafez/ghazal/101', wholePoem: true })).status, 202);
  assert.equal((await post('/api/v1/shares', { poemId: 'hafez/ghazal/101', coupletIndexes: [0, 2] })).status, 202);
  assert.equal((await post('/api/v1/shares', { poemId: 'hafez/ghazal/101', coupletIndexes: [0] })).status, 202);
  assert.equal((await post('/api/v1/shares', { poemId: 'hafez/ghazal/101', coupletIndexes: [-1] })).status, 400);
  const flow = await get('/api/v1/flow');
  assert.equal(flow.status, 200);
  const flowData = await flow.json();
  assert.equal(flowData.popular[0].views, 2);
  assert.equal(flowData.popularPoets[0].poetId, 'hafez');
  assert.equal(flowData.sharedPoets[0].poetId, 'hafez');
  assert.equal(flowData.sharedPoets[0].shares, 4);
  assert.equal(flowData.sharedPoems[0].shares, 1);
  assert.equal(flowData.sharedCouplets.find(item => item.coupletIndex === 0).shares, 2);
  assert.equal((await post('/api/v1/feedback', { message: 'Guest note', category: 'bug', page: '#flow', name: 'Ignored', mobile: '1234567' })).status, 201);
  assert.equal((await post('/api/v1/views', { poemId: 'hafez/ghazal/101' }, { Origin: 'https://attacker.invalid' })).status, 403);

  assert.equal((await post('/api/v1/admin/login', { password: 'wrong' })).status, 401);
  const login = await post('/api/v1/admin/login', { password });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const privateData = await get('/api/v1/admin/data', { cookie });
  assert.equal(privateData.status, 200);
  const data = await privateData.json();
  assert.equal(data.summary.members, 1);
  assert.equal(data.members[0].id, memberId);
  assert.equal(data.members[0].devices[0].details.platform, 'Test OS');
  assert.equal(data.views[0].views, 2);
  assert.equal(data.feedback[0].memberId, null);
  assert.equal(data.feedback[0].ip, null);
  assert.equal(data.feedback[0].username, null);
  assert.equal(JSON.stringify(data).includes('passwordHash'), false);

  const linkedFeedback = await post('/api/v1/feedback', { memberId, message: 'Member note', category: 'suggestion', page: '#archive' });
  assert.equal(linkedFeedback.status, 201);
  const update = await post('/api/v1/admin/member/update', { memberId, displayName: 'Reader Two', email: 'reader@example.com', mobile: '+15551234567', birthDate: '1404/12/31' }, { cookie });
  assert.equal(update.status, 400);
  assert.equal((await post('/api/v1/admin/logout', {}, { cookie })).status, 200);
  assert.equal((await get('/api/v1/admin/data', { cookie })).status, 401);
});
