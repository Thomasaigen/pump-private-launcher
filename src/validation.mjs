import { PublicKey, VersionedTransaction } from '@solana/web3.js';
import nacl from 'tweetnacl';

export function fail(message, status = 400) { const error = new Error(message); error.status = status; throw error; }
export function address(value) {
  try { const key = new PublicKey(value); if (key.equals(PublicKey.default) || !PublicKey.isOnCurve(key.toBytes())) fail('A signing wallet address is required.'); return key.toBase58(); }
  catch { fail('Invalid signing wallet address.'); }
}
export function lamports(value, label = 'Amount', min = 1n, max = 50_000_000_000n) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,5})(\.\d{1,9})?$/.test(value)) fail(`${label} must be a SOL amount with at most nine decimal places.`);
  const [whole, fraction = ''] = value.split('.');
  const amount = BigInt(whole) * 1_000_000_000n + BigInt(fraction.padEnd(9, '0'));
  if (amount < min || amount > max) fail(`${label} is outside the allowed range.`);
  return amount.toString();
}
export function validateSpec(input) {
  if (!input || typeof input !== 'object') fail('Launch settings are required.');
  const text = (v, max, label) => {
    if (typeof v !== 'string' || !v.trim() || Buffer.byteLength(v.trim()) > max || /[\u0000-\u001f]/.test(v)) fail(`Invalid ${label}.`);
    return v.trim();
  };
  const name = text(input.name, 32, 'name'); const symbol = text(input.symbol, 10, 'symbol'); const uri = text(input.uri, 200, 'metadata URI');
  let url; try { url = new URL(uri); } catch { fail('Invalid metadata URI.'); }
  if (!['https:', 'ipfs:'].includes(url.protocol)) fail('Metadata URI must use HTTPS or IPFS.');
  if (!Array.isArray(input.buyers) || input.buyers.length < 1 || input.buyers.length > 3) fail('Use between one and three buyer wallets.');
  const dev = address(input.dev), creator = address(input.creator), mint = address(input.mint);
  const buyers = input.buyers.map(b => ({ address: address(b.address), amount: lamports(b.amount, 'Buyer amount') }));
  if (new Set([dev, ...buyers.map(b => b.address), mint]).size !== 2 + buyers.length) fail('Use distinct developer, buyer and mint addresses.');
  const slippageBps = Number(input.slippageBps ?? 100);
  if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > 1000) fail('Slippage must be between 0 and 10%.');
  const priorityMicroLamports = Number(input.priorityMicroLamports ?? 10000);
  if (!Number.isSafeInteger(priorityMicroLamports) || priorityMicroLamports < 0 || priorityMicroLamports > 1_000_000) fail('Invalid priority fee.');
  const devAmount = lamports(input.devAmount, 'Developer amount');
  const tip = lamports(input.tip, 'Jito tip', 1000n, 100_000_000n);
  if ([devAmount, ...buyers.map(b => b.amount)].reduce((sum, v) => sum + BigInt(v), 0n) > 50_000_000_000n) fail('Total initial buys must not exceed 50 SOL.');
  return { name, symbol, uri, dev, creator, mint, devAmount, buyers, slippageBps, priorityMicroLamports, tip };
}
export function verifyAuthorization(message, signature, creator) {
  try { return nacl.sign.detached.verify(Buffer.from(message), Buffer.from(signature, 'base64'), new PublicKey(creator).toBytes()); } catch { return false; }
}
export function verifySignedTransactions(unsigned, signed) {
  if (!Array.isArray(signed) || signed.length !== unsigned.length) fail('The complete prepared bundle must be signed.');
  return signed.map((wire, i) => {
    if (typeof wire !== 'string' || wire.length > 1700) fail('Invalid transaction.');
    let tx; try { tx = VersionedTransaction.deserialize(Buffer.from(wire, 'base64')); } catch { fail('Invalid transaction encoding.'); }
    const expected = VersionedTransaction.deserialize(Buffer.from(unsigned[i], 'base64'));
    if (!Buffer.from(tx.message.serialize()).equals(Buffer.from(expected.message.serialize()))) fail('Transaction contents changed. Prepare the bundle again.');
    const message = tx.message.serialize();
    for (let n = 0; n < tx.message.header.numRequiredSignatures; n++) {
      if (!nacl.sign.detached.verify(message, tx.signatures[n], tx.message.staticAccountKeys[n].toBytes())) fail('Missing or invalid wallet signature.');
    }
    return tx;
  });
}
