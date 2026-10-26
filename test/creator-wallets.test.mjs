import test from 'node:test';
import assert from 'node:assert/strict';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { createCreatorWallets } from '../src/creator-wallets.mjs';
import { verifyAuthorization } from '../src/validation.mjs';

test('creator addresses are derived from consistent private keys, with no secret export', () => {
  const first = Keypair.generate(), second = Keypair.generate();
  const wallets = createCreatorWallets({ CREATOR_PRIVATE_KEY_2: JSON.stringify([...second.secretKey]), CREATOR_PRIVATE_KEY_1: bs58.encode(first.secretKey), CREATOR_LABEL_1: 'Treasury' });
  assert.deepEqual(wallets.describe(), { ready: true, error: null, wallets: [{ address: first.publicKey.toBase58(), label: 'Treasury', number: 1 }, { address: second.publicKey.toBase58(), label: 'Creator 2', number: 2 }] });
  const message = 'test-only launch authorization';
  const signature = wallets.signAuthorization(first.publicKey.toBase58(), message);
  assert.equal(verifyAuthorization(message, signature, first.publicKey.toBase58()), true);
  assert.equal(verifyAuthorization(message + 'changed', signature, first.publicKey.toBase58()), false);
  assert.equal(verifyAuthorization(message, signature, second.publicKey.toBase58()), false);
  assert.throws(() => wallets.signAuthorization(Keypair.generate().publicKey.toBase58(), message), /not allowed/);
  wallets.close(); assert.equal(wallets.describe().ready, false);
  assert.throws(() => wallets.signAuthorization(first.publicKey.toBase58(), message));
});
test('any invalid, duplicated or inconsistent key disables the entire creator list', () => {
  const first = Keypair.generate(), second = Keypair.generate();
  const corrupted = second.secretKey; corrupted[63] ^= 1;
  const badValues = ['secret-sentinel-DO-NOT-ECHO', first.publicKey.toBase58(), bs58.encode(corrupted), bs58.encode(first.secretKey)];
  for (const bad of badValues) {
    const wallets = createCreatorWallets({ CREATOR_PRIVATE_KEY_1: bs58.encode(first.secretKey), CREATOR_PRIVATE_KEY_2: bad });
    const state = wallets.describe(); assert.equal(state.ready, false); assert.deepEqual(state.wallets, []);
    assert.ok(!JSON.stringify(state).includes(bad));
    assert.throws(() => wallets.signAuthorization(first.publicKey.toBase58(), 'test-only'), error => error.status === 503);
    wallets.close();
  }
});
test('empty placeholders are ignored, invalid numbering and labels fail closed', () => {
  const key = bs58.encode(Keypair.generate().secretKey);
  assert.equal(createCreatorWallets({ CREATOR_PRIVATE_KEY_1: '' }).describe().ready, false);
  for (const name of ['CREATOR_PRIVATE_KEY_0', 'CREATOR_PRIVATE_KEY_51', 'CREATOR_PRIVATE_KEY_01', 'CREATOR_PRIVATE_KEY_X']) assert.equal(createCreatorWallets({ [name]: key }).describe().ready, false);
  assert.equal(createCreatorWallets({ CREATOR_PRIVATE_KEY_1: key, CREATOR_LABEL_1: 'x'.repeat(41) }).describe().ready, false);
});
test('a plain public address is accepted as an address-only creator', () => {
  const key = Keypair.generate(), address = key.publicKey.toBase58();
  const wallets = createCreatorWallets({ CREATOR_PRIVATE_KEY_1: address, CREATOR_LABEL_1: 'Pump' });
  const state = wallets.describe();
  assert.equal(state.ready, true); assert.deepEqual(state.wallets, [{ address, label: 'Pump', number: 1 }]);
  assert.equal(wallets.signAuthorization(address, 'x'), null);
  wallets.close();
});
