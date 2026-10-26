import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Keypair, PublicKey, VersionedTransaction } from '@solana/web3.js';
import { PUMP_SDK, PUMP_PROGRAM_ID } from '@pump-fun/pump-sdk';
import { buildTransactions, simulationSucceeded } from '../src/chain.mjs';
import { validateSpec, verifySignedTransactions } from '../src/validation.mjs';

test('four-wallet bundle builds with current official SDK; signers, creator bytes and size are correct', async () => {
  const keys = Array.from({ length: 6 }, () => Keypair.generate());
  const fixture = JSON.parse(fs.readFileSync(new URL('./global-fixture.json', import.meta.url)));
  const global = PUMP_SDK.decodeGlobal({ data: Buffer.from(fixture.base64, 'base64'), executable: false, lamports: 0, owner: PUMP_PROGRAM_ID });
  const spec = validateSpec({ name: 'Authorized launch', symbol: 'AUTH', uri: 'https://ipfs.io/ipfs/QmRu5YpS3YTVFu6ArXVbeeRcAHjnKS4Ry9opcRGmTT5REt', mint: keys[0].publicKey.toBase58(), dev: keys[1].publicKey.toBase58(), creator: keys[2].publicKey.toBase58(), devAmount: '0.01', buyers: [3, 4, 5].map(i => ({ address: keys[i].publicKey.toBase58(), amount: '0.01' })), tip: '0.001' });
  const result = await buildTransactions(spec, { global, feeConfig: null, blockhash: PublicKey.default.toBase58(), lastValidBlockHeight: 100, tipAccount: Keypair.generate().publicKey.toBase58() });
  assert.equal(result.transactions.length, 4);
  const txs = result.transactions.map(t => VersionedTransaction.deserialize(Buffer.from(t, 'base64')));
  assert.equal(txs[0].message.header.numRequiredSignatures, 2);
  const create = txs[0].message.compiledInstructions.find(ix => txs[0].message.staticAccountKeys[ix.programIdIndex].equals(PUMP_PROGRAM_ID) && Buffer.from(ix.data.slice(0, 8)).toString('hex') === 'd6904cec5f8b31b4');
  assert.ok(create); let offset = 8; const bytes = Buffer.from(create.data);
  for (let i = 0; i < 3; i++) offset += 4 + bytes.readUInt32LE(offset);
  assert.equal(new PublicKey(bytes.subarray(offset, offset + 32)).toBase58(), spec.creator);
  assert.equal(txs[0].message.staticAccountKeys[0].toBase58(), spec.dev);
  txs[0].sign([keys[0], keys[1]]);
  for (let i = 1; i < 4; i++) { assert.equal(txs[i].message.header.numRequiredSignatures, 1); txs[i].sign([keys[i + 2]]); }
  verifySignedTransactions(result.transactions, txs.map(tx => Buffer.from(tx.serialize()).toString('base64')));
  for (const row of result.summary) { assert.ok(row.bytes <= 1232); assert.ok(BigInt(row.expectedBuyLamports) <= 10000000n); }
  assert.ok(BigInt(result.summary[1].tokensRaw) < BigInt(result.summary[0].tokensRaw));
  assert.equal(result.summary[3].tipLamports, '1000000');
});
test('only complete successful bundle simulation unlocks submission', () => {
  const good = { value: { summary: 'succeeded', transactionResults: Array.from({ length: 4 }, () => ({ err: null })) } };
  assert.equal(simulationSucceeded(good, 4), true);
  assert.equal(simulationSucceeded(good, 3), false);
  good.value.transactionResults[2].err = { InstructionError: [1, 'failed'] };
  assert.equal(simulationSucceeded(good, 4), false);
  assert.equal(simulationSucceeded({ value: { err: null } }, 4), false);
});
test('with fewer buyers the tip is paid in the last transaction', async () => {
  const keys = Array.from({ length: 6 }, () => Keypair.generate());
  const fixture = JSON.parse(fs.readFileSync(new URL('./global-fixture.json', import.meta.url)));
  const global = PUMP_SDK.decodeGlobal({ data: Buffer.from(fixture.base64, 'base64'), executable: false, lamports: 0, owner: PUMP_PROGRAM_ID });
  for (const count of [1, 2]) {
    const spec = validateSpec({ name: 'Authorized launch', symbol: 'AUTH', uri: 'https://ipfs.io/ipfs/QmRu5YpS3YTVFu6ArXVbeeRcAHjnKS4Ry9opcRGmTT5REt', mint: keys[0].publicKey.toBase58(), dev: keys[1].publicKey.toBase58(), creator: keys[2].publicKey.toBase58(), devAmount: '0.01', buyers: [3, 4, 5].slice(0, count).map(i => ({ address: keys[i].publicKey.toBase58(), amount: '0.01' })), tip: '0.001' });
    const result = await buildTransactions(spec, { global, feeConfig: null, blockhash: PublicKey.default.toBase58(), lastValidBlockHeight: 100, tipAccount: Keypair.generate().publicKey.toBase58() });
    assert.equal(result.transactions.length, count + 1);
    assert.deepEqual(result.summary.map(r => r.tipLamports !== '0'), result.summary.map((_, i) => i === count));
  }
});
