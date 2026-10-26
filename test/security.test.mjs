import test from 'node:test';
import assert from 'node:assert/strict';
import { Keypair, PublicKey, TransactionMessage, VersionedTransaction, SystemProgram } from '@solana/web3.js';
import nacl from 'tweetnacl';
import { createApp } from '../src/server.mjs';
import { createAuth } from '../src/auth.mjs';
import { validateSpec, verifySignedTransactions, lamports } from '../src/validation.mjs';

const password = 'test-only-long-password';
const keys = Array.from({ length: 6 }, () => Keypair.generate());
const spec = () => ({ name: 'Test', symbol: 'TST', uri: 'https://example.org/token.json', mint: keys[0].publicKey.toBase58(), dev: keys[1].publicKey.toBase58(), creator: keys[2].publicKey.toBase58(), devAmount: '0.01', buyers: [3, 4, 5].map(i => ({ address: keys[i].publicKey.toBase58(), amount: '0.01' })), tip: '0.001', slippageBps: 100, priorityMicroLamports: 10000 });
const fakeChain = { enabled: false, configured: true, simulationConfigured: true, async prepare(s) { return { transactions: [], summary: [], mint: s.mint }; } };
async function serve(t, env = {}, chain = fakeChain) {
  const app = createApp({ APP_PASSWORD: password, ...env }, chain);
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { app.locals.close(); await new Promise(resolve => server.close(resolve)); });
  const post = (route, body, headers = {}) => fetch(base + route, { method: 'POST', headers: { origin: base, 'x-requested-with': 'launcher', 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const login = async () => { const r = await post('/auth/login', { password }); assert.equal(r.status, 200); const cookie = r.headers.get('set-cookie').split(';')[0]; const s = await (await fetch(base + '/api/session', { headers: { cookie } })).json(); return { cookie, 'x-csrf-token': s.csrf }; };
  return { base, post, login };
}
test('missing password fails closed for API and app assets; health remains available', async t => {
  const { base, post } = await serve(t, { APP_PASSWORD: '' });
  assert.equal((await post('/auth/login', { password: '' })).status, 503);
  for (const p of ['/api/session', '/api/authorize', '/api/prepare', '/api/submit']) assert.equal((await fetch(base + p)).status, 503);
  assert.equal((await fetch(base + '/app.js', { redirect: 'manual' })).status, 302);
  assert.equal((await fetch(base + '/healthz')).status, 200);
});
test('password login protects pages and API, logout revokes the session', async t => {
  const { base, post, login } = await serve(t);
  assert.equal((await fetch(base + '/api/session')).status, 401);
  assert.equal((await post('/auth/login', { password: 'wrong' })).status, 401);
  const headers = await login();
  assert.equal((await fetch(base + '/', { headers })).status, 200);
  assert.equal((await post('/auth/logout', {}, headers)).status, 200);
  assert.equal((await fetch(base + '/api/session', { headers })).status, 401);
});
test('cross-origin requests and missing CSRF tokens are rejected', async t => {
  const { post, login } = await serve(t); const headers = await login();
  assert.equal((await post('/api/authorize', spec(), { ...headers, origin: 'https://evil.example' })).status, 403);
  assert.equal((await post('/api/authorize', spec(), { cookie: headers.cookie })).status, 403);
  assert.equal((await post('/auth/login', { password }, { origin: 'https://evil.example' })).status, 403);
});
test('creator proof is bound to selected wallet, session and a single use', async t => {
  let prepares = 0;
  const { post, login } = await serve(t, {}, { ...fakeChain, async prepare(s) { prepares++; return fakeChain.prepare(s); } });
  const headers = await login();
  const challenge = await (await post('/api/authorize', spec(), headers)).json();
  const sign = key => Buffer.from(nacl.sign.detached(Buffer.from(challenge.message), key.secretKey)).toString('base64');
  assert.equal((await post('/api/prepare', { id: challenge.id, signature: sign(keys[1]) }, headers)).status, 403);
  const otherSession = await login();
  assert.equal((await post('/api/prepare', { id: challenge.id, signature: sign(keys[2]) }, otherSession)).status, 403);
  assert.equal((await post('/api/prepare', { id: challenge.id, signature: sign(keys[2]) }, headers)).status, 200);
  assert.equal((await post('/api/prepare', { id: challenge.id, signature: sign(keys[2]) }, headers)).status, 403);
  assert.equal(prepares, 1);
});
test('session cookies use secure attributes and expire; fresh process/password invalidates cookies', () => {
  let now = 1000; const auth = createAuth({ password, production: true, now: () => now });
  const result = auth.login(password, 'test'); const cookie = auth.cookie(result.token);
  assert.match(cookie, /^__Host-launcher=/); assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Strict/); assert.match(cookie, /Secure/);
  assert.ok(auth.session({ headers: { cookie } })); now += 3600001; assert.equal(auth.session({ headers: { cookie } }), null);
  const next = createAuth({ password: 'new-password-long-enough', production: true }); assert.equal(next.session({ headers: { cookie } }), null); auth.close(); next.close();
});
test('login rate limit is enforced', () => {
  const auth = createAuth({ password });
  for (let i = 0; i < 10; i++) assert.equal(auth.login('wrong', 'same').status, 401);
  assert.equal(auth.login(password, 'same').status, 429); auth.close();
});
test('passwords of 5–256 characters are accepted, including the requested seven-character setup', () => {
  for (const length of [0, 4, 5, 7, 256, 257]) {
    const password = 'x'.repeat(length), auth = createAuth({ password });
    const accepted = length >= 5 && length <= 256;
    assert.equal(auth.ready, accepted);
    assert.equal(auth.login(password, 'test').status, accepted ? 200 : 503);
    auth.close();
  }
});
test('SOL parsing is exact and rejects exponent, negative, overflow and extra decimals', () => {
  assert.equal(lamports('0.000000001'), '1'); assert.equal(lamports('1.123456789'), '1123456789');
  for (const value of ['-1', '1e2', '0.0000000001', '51', 'NaN', 'Infinity']) assert.throws(() => lamports(value));
  assert.throws(() => validateSpec({ ...spec(), buyers: [] }));
  assert.throws(() => validateSpec({ ...spec(), creator: PublicKey.default.toBase58() }));
});
test('altered, unsigned and partially signed messages are rejected before relay', () => {
  const payer = keys[1], recipient = keys[3].publicKey;
  const make = amount => new VersionedTransaction(new TransactionMessage({ payerKey: payer.publicKey, recentBlockhash: PublicKey.default.toBase58(), instructions: [SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: recipient, lamports: amount })] }).compileToV0Message());
  const encode = tx => Buffer.from(tx.serialize()).toString('base64');
  const tx = make(1000), unsigned = encode(tx);
  assert.throws(() => verifySignedTransactions([unsigned], [unsigned]), /signature/);
  tx.sign([payer]); assert.equal(verifySignedTransactions([unsigned], [encode(tx)]).length, 1);
  const changed = make(1000000); changed.sign([payer]); assert.throws(() => verifySignedTransactions([unsigned], [encode(changed)]), /contents changed/);
});
