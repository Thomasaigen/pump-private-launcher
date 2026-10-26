import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Keypair, PublicKey, VersionedTransaction, ComputeBudgetProgram } from '@solana/web3.js';
import { PUMP_PROGRAM_ID } from '@pump-fun/pump-sdk';
import nacl from 'tweetnacl';
import { runDiagnostics, MAINNET_GENESIS } from '../src/diagnostics.mjs';
import { createChain } from '../src/chain.mjs';

const env = { APP_PASSWORD: 'seven77', SOLANA_RPC_URL: 'https://rpc.example/?api-key=secret-test-key', BUNDLE_SIMULATION_RPC_URL: 'https://simulation.example/secret-test-key', ENABLE_LAUNCH: 'false' };
const fixture = JSON.parse(fs.readFileSync(new URL('./global-fixture.json', import.meta.url)));
function provider(calls) {
  return async (_url, method, params) => {
    calls.push(method);
    if (method === 'getGenesisHash') return MAINNET_GENESIS;
    if (method === 'getTipAccounts') return [Keypair.generate().publicKey.toBase58()];
    if (method === 'getAccountInfo') return { value: { owner: PUMP_PROGRAM_ID.toBase58(), data: [fixture.base64, 'base64'], lamports: 1, executable: false } };
    if (method === 'getLatestBlockhash') return { value: { blockhash: PublicKey.default.toBase58() } };
    if (method === 'simulateBundle') {
      const tx = VersionedTransaction.deserialize(Buffer.from(params[0].encodedTransactions[0], 'base64'));
      assert.equal(tx.message.compiledInstructions.length, 1);
      assert.ok(tx.message.staticAccountKeys[tx.message.compiledInstructions[0].programIdIndex].equals(ComputeBudgetProgram.programId));
      assert.ok(nacl.sign.detached.verify(tx.message.serialize(), tx.signatures[0], tx.message.staticAccountKeys[0].toBytes()));
      assert.equal(params[1].skipSigVerify, false);
      return { value: { summary: { failed: { error: 'AccountNotFound' } }, transactionResults: [{ err: 'AccountNotFound' }] } };
    }
    throw new Error(`Unexpected method ${method}`);
  };
}
test('startup diagnostics use only reads and an unfunded signed simulation, never a send', async () => {
  const calls = [], report = await runDiagnostics(env, provider(calls));
  assert.equal(report.fundedLaunchTested, false);
  assert.equal(report.checks.filter(c => c.status === 'pass').length, 5);
  assert.equal(report.checks.filter(c => c.status === 'fail').length, 0);
  assert.ok(calls.includes('simulateBundle'));
  assert.ok(calls.every(m => ['getGenesisHash', 'getTipAccounts', 'getAccountInfo', 'getLatestBlockhash', 'simulateBundle'].includes(m)));
  assert.ok(!JSON.stringify(report).includes('secret-test-key'));
});
test('wrong network prevents simulation and no secret provider error is logged', async () => {
  const calls = [], normal = provider(calls);
  const report = await runDiagnostics(env, async (url, method, params) => {
    if (method === 'getGenesisHash') return 'devnet';
    if (method === 'getTipAccounts') throw new Error(`Failed ${env.SOLANA_RPC_URL}`);
    return normal(url, method, params);
  });
  assert.ok(report.checks.some(c => c.name === 'Solana RPC' && c.status === 'fail'));
  assert.ok(!calls.includes('simulateBundle'));
  assert.ok(!JSON.stringify(report).includes('secret-test-key'));
});
test('unsupported simulation method and malformed endpoint cannot pass diagnostics or leak URLs', async () => {
  const calls = [], normal = provider(calls);
  const report = await runDiagnostics(env, async (url, method, params) => {
    if (method === 'simulateBundle') throw Object.assign(new Error('simulateBundle was rejected by the provider (code -32601).'), { status: 502 });
    return normal(url, method, params);
  });
  assert.ok(report.checks.some(c => c.name === 'Bundle simulation' && c.status === 'fail' && c.detail.includes('-32601')));
  assert.throws(() => createChain({ SOLANA_RPC_URL: 'malformed-secret-test-key' }), error => !String(error).includes('secret-test-key'));
});
