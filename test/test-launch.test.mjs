import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { once } from 'node:events';
import { Keypair, PublicKey, VersionedTransaction } from '@solana/web3.js';
import { PUMP_SDK, PUMP_PROGRAM_ID } from '@pump-fun/pump-sdk';
import bs58 from 'bs58';
import { createTestLaunchApp } from '../src/test-launch-server.mjs';
import { buildTransactions } from '../src/chain.mjs';
import { validateTestSpec } from '../src/test-launch-policy.mjs';
import { compareAxiomRecord } from '../web/axiom-comparison.mjs';

const keys = Array.from({ length: 7 }, () => Keypair.generate());
const spec = () => ({ name: '[TEST] Attribution', symbol: 'TST', uri: 'https://example.org/test.json', mint: keys[0].publicKey.toBase58(), dev: keys[1].publicKey.toBase58(), creator: keys[2].publicKey.toBase58(), devAmount: '0', buyers: [3, 4, 5].map(i => ({ address: keys[i].publicKey.toBase58(), amount: '0.01' })), tip: '0.001', slippageBps: 100, priorityMicroLamports: 10000 });
const fixture = JSON.parse(fs.readFileSync(new URL('./global-fixture.json', import.meta.url)));
const global = PUMP_SDK.decodeGlobal({ data: Buffer.from(fixture.base64, 'base64'), executable: false, lamports: 0, owner: PUMP_PROGRAM_ID });
async function serve(t, options = {}) {
  const calls = { prepare: 0, simulate: 0, submit: 0, uploads: [] };
  const chain = {
    enabled: options.enabled ?? true, configured: true, simulationConfigured: true,
    async prepare(s) { calls.prepare++; return buildTransactions(s, { global, feeConfig: null, blockhash: PublicKey.default.toBase58(), lastValidBlockHeight: 100, tipAccount: keys[6].publicKey.toBase58() }); },
    async simulate(transactions) { calls.simulate++; if (options.simulationFails) { const e = new Error('Simulation failed.'); e.status = 400; throw e; } return { succeeded: true, count: transactions.length }; },
    async submit(transactions) { calls.submit++; assert.equal(transactions.length, 4); return 'mock-bundle-only'; },
    async status() { return { confirmed: true }; }
  };
  const storage = { configured: true, async uploadToken(value) { calls.uploads.push(value); return { uri: 'https://example.org/test.json' }; } };
  const app = createTestLaunchApp({ APP_PASSWORD: 'test-password', CREATOR_PRIVATE_KEY_1: options.creatorValue ?? bs58.encode(keys[2].secretKey) }, chain, storage);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { app.locals.close(); await new Promise(resolve => server.close(resolve)); });
  const base = 'http://127.0.0.1:' + server.address().port;
  const headers = { origin: base, 'x-requested-with': 'launcher', 'content-type': 'application/json' };
  const post = (path, body, overrides = {}) => fetch(base + path, { method: 'POST', headers: { ...headers, ...overrides }, body: JSON.stringify(body) });
  const login = await post('/auth/login', { password: 'test-password' });
  headers.cookie = login.headers.get('set-cookie').split(';')[0];
  const session = await (await fetch(base + '/api/session', { headers })).json(); headers['x-csrf-token'] = session.csrf;
  async function upload(s = spec()) {
    const query = new URLSearchParams({ name: s.name, symbol: s.symbol, creator: s.creator, launcher: s.dev });
    return fetch(base + '/api/upload-metadata?' + query, { method: 'POST', headers: { ...headers, 'content-type': 'image/png' }, body: Buffer.from([1, 2, 3]) });
  }
  async function prepare() {
    assert.equal((await upload()).status, 200);
    const authorization = await post('/api/authorize', spec()); assert.equal(authorization.status, 200);
    const challenge = await authorization.json();
    const prepared = await post('/api/prepare', { id: challenge.id }); assert.equal(prepared.status, 200);
    return { ...await prepared.json(), challenge };
  }
  return { app, base, headers, post, session, upload, prepare, calls };
}
function sign(prepared) {
  return prepared.transactions.map((wire, i) => {
    const tx = VersionedTransaction.deserialize(Buffer.from(wire, 'base64'));
    tx.sign(i === 0 ? [keys[0], keys[1]] : [keys[i + 2]]);
    return Buffer.from(tx.serialize()).toString('base64');
  });
}

test('Live test mode serves both pages, with a distinct health mode and password protection', async t => {
  const s = await serve(t);
  assert.deepEqual(await (await fetch(s.base + '/healthz')).json(), { status: 'ok', mode: 'owned-wallet-test-launch', version: '2.1.0' });
  for (const path of ['/', '/research', '/app.js', '/research.js']) {
    assert.equal((await fetch(s.base + path, { redirect: 'manual' })).status, 302);
    assert.equal((await fetch(s.base + path, { headers: s.headers })).status, 200);
  }
  assert.equal(s.session.testLaunchOnly, true);
  assert.equal(s.calls.submit, 0);
});
test('Public-address-only or foreign creators cannot pass the ownership gate', async t => {
  const unproven = await serve(t, { creatorValue: keys[2].publicKey.toBase58() });
  assert.equal(unproven.session.creators.ready, false);
  assert.equal((await unproven.upload()).status, 503);
  assert.equal((await unproven.post('/api/authorize', spec())).status, 503);
  assert.equal(unproven.calls.prepare, 0);
  const valid = await serve(t);
  assert.equal((await valid.upload({ ...spec(), creator: keys[6].publicKey.toBase58() })).status, 403);
  assert.equal(valid.calls.uploads.length, 0);
});
test('Research metadata binds the visible test label and both wallet identities to authorization', async t => {
  const s = await serve(t);
  assert.equal((await s.post('/api/authorize', spec())).status, 403);
  assert.equal((await s.upload()).status, 200);
  assert.match(s.calls.uploads[0].description, /Research test token/);
  assert.ok(s.calls.uploads[0].description.includes(spec().dev));
  assert.ok(s.calls.uploads[0].description.includes(spec().creator));
  for (const changed of [{ name: 'Unmarked token' }, { uri: 'https://other.example/' }, { dev: keys[6].publicKey.toBase58() }, { name: '[TEST] Different' }]) {
    assert.notEqual((await s.post('/api/authorize', { ...spec(), ...changed })).status, 200);
  }
  const prepared = await s.prepare();
  assert.equal(prepared.launcher, spec().dev); assert.equal(prepared.creator, spec().creator);
  assert.equal((await s.post('/api/prepare', { id: prepared.challenge.id })).status, 403);
  assert.equal(s.calls.submit, 0);
});
test('Only the exact signed, simulated and explicitly confirmed bundle can be submitted once', async t => {
  const s = await serve(t); const prepared = await s.prepare();
  assert.equal((await s.post('/api/submit', { id: prepared.id, confirmMint: prepared.mint })).status, 409);
  assert.equal((await s.post('/api/simulate', { id: prepared.id, transactions: prepared.transactions })).status, 400);
  assert.equal(s.calls.simulate, 0);
  const transactions = sign(prepared);
  assert.equal((await s.post('/api/simulate', { id: prepared.id, transactions })).status, 200);
  assert.equal(s.calls.submit, 0);
  assert.equal((await s.post('/api/submit', { id: prepared.id, confirmMint: keys[6].publicKey.toBase58() })).status, 400);
  const submitted = await s.post('/api/submit', { id: prepared.id, confirmMint: prepared.mint });
  assert.equal(submitted.status, 200); const receipt = await submitted.json();
  assert.equal(receipt.signatures.length, 4); assert.equal(receipt.bundleId, 'mock-bundle-only');
  assert.equal((await s.post('/api/submit', { id: prepared.id, confirmMint: prepared.mint })).status, 200);
  assert.equal(s.calls.submit, 1);
});
test('A failed simulation or disabled launch setting prevents submission', async t => {
  for (const options of [{ simulationFails: true }, { enabled: false }]) {
    const s = await serve(t, options), prepared = await s.prepare();
    const simulated = await s.post('/api/simulate', { id: prepared.id, transactions: sign(prepared) });
    assert.equal(simulated.status, options.simulationFails ? 400 : 200);
    assert.equal((await s.post('/api/submit', { id: prepared.id, confirmMint: prepared.mint })).status, options.simulationFails ? 409 : 403);
    assert.equal(s.calls.submit, 0);
  }
});
test('Research budgets are enforced server-side and zero developer buy remains supported', () => {
  assert.equal(validateTestSpec(spec()).devAmount, '0');
  for (const change of [{ name: 'Not a test' }, { name: '[TEST] ' }, { devAmount: '0.25' }, { tip: '0.006' }, { priorityMicroLamports: 100001 }]) assert.throws(() => validateTestSpec({ ...spec(), ...change }));
});
test('Axiom comparison requires this mint and distinguishes missing fields from mismatches', () => {
  const launch = { mint: spec().mint, launcher: spec().dev, creator: spec().creator };
  const result = compareAxiomRecord({ tokenAddress: launch.mint, deployerAddress: launch.launcher, protocolDetails: { creator: launch.creator } }, launch);
  assert.equal(result.deployerAddress.comparison, 'matches'); assert.equal(result.protocolCreator.comparison, 'matches'); assert.equal(result.originalPumpDeployer.comparison, 'unavailable');
  assert.equal(compareAxiomRecord({ tokenAddress: launch.mint, deployerAddress: launch.creator }, launch).deployerAddress.comparison, 'differs');
  assert.throws(() => compareAxiomRecord({ tokenAddress: keys[6].publicKey.toBase58() }, launch), /does not match/);
});
