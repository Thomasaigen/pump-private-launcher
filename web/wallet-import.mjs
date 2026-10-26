import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

// Shared key parser: browser trading wallets and server-only creator configuration.
// This module performs no network or storage operations.
export function parsePrivateKey(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 2000) {
    throw new Error('Paste a base58 Solana private key or a 64-byte keypair JSON array.');
  }
  let bytes, jsonBytes;
  try {
    const text = value.trim();
    if (text.startsWith('[')) {
      jsonBytes = JSON.parse(text);
      if (!Array.isArray(jsonBytes) || jsonBytes.length !== 64 || jsonBytes.some(n => !Number.isInteger(n) || n < 0 || n > 255)) throw new Error('Invalid array');
      bytes = Uint8Array.from(jsonBytes);
    } else {
      bytes = bs58.decode(text);
    }
    if (bytes.length !== 64) throw new Error('Invalid length');
    // web3.js retains its input array: give the keypair a separate copy before
    // clearing temporary decoded bytes. Public/private consistency is validated.
    return Keypair.fromSecretKey(bytes.slice());
  } catch {
    // Do not echo the input or a parser error which might contain secret text.
    throw new Error('Invalid Solana private key. Use a base58 private key or a JSON array of 64 bytes, not a wallet address or seed phrase.');
  } finally {
    bytes?.fill(0);
    if (Array.isArray(jsonBytes)) jsonBytes.fill(0);
  }
}
