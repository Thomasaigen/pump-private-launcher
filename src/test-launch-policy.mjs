import { validateSpec, fail } from './validation.mjs';

export const TEST_PREFIX = '[TEST] ';
export function requireTestName(name) {
  if (typeof name !== 'string' || !name.startsWith(TEST_PREFIX) || !name.slice(TEST_PREFIX.length).trim()) fail('Research token names must start with [TEST] followed by a name.');
}
export function validateTestSpec(input) {
  const spec = validateSpec(input);
  requireTestName(spec.name);
  const buys = [spec.devAmount, ...spec.buyers.map(b => b.amount)].reduce((sum, amount) => sum + BigInt(amount), 0n);
  if (buys > 250_000_000n) fail('Research initial buys are limited to 0.25 SOL total, before slippage, fees, rent and tip.');
  if (BigInt(spec.tip) > 5_000_000n) fail('Research Jito tips are limited to 0.005 SOL.');
  if (spec.priorityMicroLamports > 100_000) fail('Research priority fees are limited to 100000 micro-lamports per CU.');
  return spec;
}
