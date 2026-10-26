import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createResearchApp } from '../src/research-server.mjs';

async function open(t, overrides = {}) {
  const env = { APP_PASSWORD: 'local-research-test', ...overrides };
  for (const name of ['CREATOR_PRIVATE_KEY_1', 'SOLANA_RPC_URL', 'BUNDLE_SIMULATION_RPC_URL', 'PINATA_JWT', 'JITO_BLOCK_ENGINE_URL']) {
    Object.defineProperty(env, name, { get() { throw new Error('Research mode must not read ' + name); } });
  }
  const app = createResearchApp(env);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { app.locals.close(); await new Promise(resolve => server.close(resolve)); });
  const base = 'http://127.0.0.1:' + server.address().port;
  const headers = { origin: base, 'x-requested-with': 'launcher', 'content-type': 'application/json' };
  async function login(password = env.APP_PASSWORD) {
    const response = await fetch(base + '/auth/login', { method: 'POST', headers, body: JSON.stringify({ password }) });
    const cookie = response.headers.get('set-cookie')?.split(';')[0] ?? '';
    return { response, cookie };
  }
  return { app, base, headers, login };
}

test('Research health is public, while pages, bundle and session stay password-gated', async t => {
  const { base } = await open(t);
  const health = await (await fetch(base + '/healthz')).json();
  assert.deepEqual(health, { status: 'ok', mode: 'offline-research', version: '2.0.0' });
  for (const route of ['/', '/research.js']) {
    const response = await fetch(base + route, { redirect: 'manual' });
    assert.equal(response.status, 302); assert.equal(response.headers.get('location'), '/login');
  }
  assert.equal((await fetch(base + '/api/session')).status, 401);
});

test('Five-character passwords work; short or absent passwords fail closed', async t => {
  const ready = await open(t, { APP_PASSWORD: 'abcde' });
  assert.equal((await ready.login()).response.status, 200);
  const locked = await open(t, { APP_PASSWORD: 'abcd' });
  assert.equal((await locked.login()).response.status, 503);
  assert.equal((await fetch(locked.base + '/api/session')).status, 503);
});

test('Valid login serves only research UI and session capabilities', async t => {
  const { base, login } = await open(t, { ENABLE_LAUNCH: 'true' });
  const { response, cookie } = await login();
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie'), /HttpOnly/);
  const sessionResponse = await fetch(base + '/api/session', { headers: { cookie } });
  const session = await sessionResponse.json();
  assert.equal(session.mode, 'offline-research'); assert.equal(session.launchEnabled, false);
  assert.deepEqual(Object.keys(session).sort(), ['csrf','expires','launchEnabled','mode','version']);
  const page = await (await fetch(base + '/', { headers: { cookie } })).text();
  assert.match(page, /Simulated data/); assert.match(page, /research.js/);
  assert.doesNotMatch(page, /private.key|Submit on mainnet|Prepare bundle/i);
  const bundle = await fetch(base + '/research.js', { headers: { cookie } });
  assert.equal(bundle.status, 200);
  assert.doesNotMatch(await bundle.text(), /sendTransaction|signTransaction|@pump-fun|jito\.wtf/);
});

test('Legacy live endpoints remain unavailable even with ENABLE_LAUNCH=true', async t => {
  const { base, headers, login } = await open(t, { ENABLE_LAUNCH: 'true' });
  const { cookie } = await login();
  const { csrf } = await (await fetch(base + '/api/session', { headers: { cookie } })).json();
  for (const route of ['authorize', 'prepare', 'simulate', 'submit', 'upload-metadata']) {
    const response = await fetch(base + '/api/' + route, { method: 'POST', headers: { ...headers, cookie, 'x-csrf-token': csrf }, body: '{}' });
    assert.equal(response.status, 410);
  }
});

test('Origin and CSRF checks protect logout; logout invalidates the session', async t => {
  const { base, headers, login } = await open(t);
  const { cookie } = await login();
  const { csrf } = await (await fetch(base + '/api/session', { headers: { cookie } })).json();
  assert.equal((await fetch(base + '/auth/logout', { method: 'POST', headers: { ...headers, cookie } })).status, 403);
  assert.equal((await fetch(base + '/auth/logout', { method: 'POST', headers: { ...headers, cookie, origin: 'https://other.invalid', 'x-csrf-token': csrf } })).status, 403);
  assert.equal((await fetch(base + '/auth/logout', { method: 'POST', headers: { ...headers, cookie, 'x-csrf-token': csrf } })).status, 200);
  assert.equal((await fetch(base + '/api/session', { headers: { cookie } })).status, 401);
});

test('Production session cookies remain secure and security headers are present', async t => {
  const { base, login } = await open(t, { NODE_ENV: 'production' });
  const { response } = await login();
  assert.match(response.headers.get('set-cookie'), /__Host-launcher=/);
  assert.match(response.headers.get('set-cookie'), /; Secure/);
  const page = await fetch(base + '/login');
  assert.match(page.headers.get('content-security-policy'), /connect-src 'self'/);
  assert.equal(page.headers.get('cache-control'), 'no-store');
  assert.equal(page.headers.get('x-frame-options'), 'DENY');
});
