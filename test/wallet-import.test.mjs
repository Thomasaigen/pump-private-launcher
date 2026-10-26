import test from 'node:test';
import assert from 'node:assert/strict';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { parsePrivateKey } from '../web/wallet-import.mjs';

test('base58 and JSON imports preserve the address and can sign after temporary bytes are cleared', () => {
  const original = Keypair.generate();
  const message = new TextEncoder().encode('test-only creator authorization');
  for (const value of [bs58.encode(original.secretKey), JSON.stringify([...original.secretKey]), `  ${bs58.encode(original.secretKey)}\n`]) {
    const imported = parsePrivateKey(value);
    assert.equal(imported.publicKey.toBase58(), original.publicKey.toBase58());
    const signature = nacl.sign.detached(message, imported.secretKey);
    assert.ok(nacl.sign.detached.verify(message, signature, original.publicKey.toBytes()));
  }
});
test('wallet addresses, seeds, malformed arrays and mismatched keypairs are rejected without echoing secrets', () => {
  const key = Keypair.generate(), corrupted = key.secretKey; corrupted[63] ^= 1;
  for (const value of ['', 'secret words must not be echoed', key.publicKey.toBase58(), bs58.encode(key.secretKey.slice(0, 32)), bs58.encode(corrupted), '[1,2,3]', JSON.stringify([...key.secretKey].map((n, i) => i === 0 ? 256 : n)), '[secret-test-input]', 'x'.repeat(2001)]) {
    assert.throws(() => parsePrivateKey(value), error => {
      assert.ok(!error.message.includes('secret-test-input'));
      assert.ok(!error.message.includes('secret words'));
      assert.ok(!error.message.includes(bs58.encode(corrupted)));
      return true;
    });
  }
});
