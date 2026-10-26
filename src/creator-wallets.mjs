import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { parsePrivateKey } from '../web/wallet-import.mjs';
import { fail } from './validation.mjs';

// Keys are loaded only on the server. The public interface never returns them.
export function createCreatorWallets(env) {
  const entries = new Map();
  let error = null;
  const clear = () => { for (const row of entries.values()) row.secretKey?.fill(0); entries.clear(); };
  const names = Object.keys(env).filter(name => name.startsWith('CREATOR_PRIVATE_KEY_') && env[name]?.trim());
  names.sort((a, b) => Number(a.slice(20)) - Number(b.slice(20)));
  for (const name of names) {
    const match = /^CREATOR_PRIVATE_KEY_([1-9]\d?)$/.exec(name);
    if (!match || Number(match[1]) > 50) { error = 'Use CREATOR_PRIVATE_KEY_1 through CREATOR_PRIVATE_KEY_50.'; break; }
    const number = Number(match[1]);
    let address, secretKey = null;
    try { const key = parsePrivateKey(env[name]); address = key.publicKey.toBase58(); secretKey = key.secretKey; }
    catch {
      // Not a private key: accept a plain public address (creator is recorded, never signs).
      const text = env[name].trim();
      try { const raw = bs58.decode(text); if (raw.length !== 32) throw new Error('length'); address = bs58.encode(raw); }
      catch { error = `${name} must contain a Solana wallet address, a base58 private key or 64-byte keypair JSON.`; break; }
    }
    if (entries.has(address)) { secretKey?.fill(0); error = 'The same creator wallet is configured more than once. Keep one entry per wallet.'; break; }
    const label = env[`CREATOR_LABEL_${number}`]?.trim() || `Creator ${number}`;
    if (label.length > 40 || /[\u0000-\u001f]/.test(label)) { secretKey?.fill(0); error = `CREATOR_LABEL_${number} must be a label of at most 40 characters.`; break; }
    entries.set(address, { address, label, number, secretKey });
  }
  if (error) clear();
  const requireWallet = address => {
    if (error || entries.size === 0) fail(error || 'Add a creator private key as CREATOR_PRIVATE_KEY_1 in Railway, then redeploy.', 503);
    const row = entries.get(address);
    if (!row) fail('Select a creator wallet configured in Railway. Other creator addresses are not allowed.', 403);
    return row;
  };
  return {
    describe() {
      return {
        ready: !error && entries.size > 0,
        error: error || (entries.size ? null : 'Add CREATOR_PRIVATE_KEY_1 in Railway, then redeploy.'),
        wallets: [...entries.values()].map(({ address, label, number }) => ({ address, label, number })),
      };
    },
    requireWallet(address) { requireWallet(address); },
    signAuthorization(address, message) {
      const row = requireWallet(address);
      if (!row.secretKey) return null; // address-only creator: nothing to sign
      return Buffer.from(nacl.sign.detached(Buffer.from(message), row.secretKey)).toString('base64');
    },
    close: clear,
  };
}
