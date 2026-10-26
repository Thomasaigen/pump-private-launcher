import { Keypair, PublicKey, TransactionMessage, VersionedTransaction, ComputeBudgetProgram } from '@solana/web3.js';
import { PUMP_SDK, GLOBAL_PDA, PUMP_PROGRAM_ID } from '@pump-fun/pump-sdk';
import { passwordConfigured } from './auth.mjs';
import { rpc } from './chain.mjs';

// Solana Labs' mainnet-beta genesis hash. Never infer the network from a hostname.
export const MAINNET_GENESIS = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
const validUrl = value => { try { return new URL(value).protocol === 'https:'; } catch { return false; } };

// This probe has an ephemeral, unfunded payer and no transfer instructions.
// It is only passed to simulateBundle, never to a transaction submission method.
export function simulationProbe(blockhash) {
  const payer = Keypair.generate();
  const tx = new VersionedTransaction(new TransactionMessage({ payerKey: payer.publicKey, recentBlockhash: blockhash, instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 1000 })] }).compileToV0Message());
  tx.sign([payer]);
  return Buffer.from(tx.serialize()).toString('base64');
}

export async function runDiagnostics(env, call = rpc) {
  const checks = [];
  const add = (name, status, detail) => { const row = { name, status, detail }; checks.push(row); return row; };
  const request = async (name, fn) => {
    try { return await fn(); }
    catch (error) {
      // Only export numeric status codes from our sanitized RPC errors. Provider
      // text, URLs, keys and raw responses must never appear in diagnostics.
      const code = error?.status === 502 ? String(error.message).match(/(?:HTTP |code )(-?\d+)\b/)?.[1] : null;
      add(name, 'fail', code ? `Provider request failed (code ${code}).` : 'Provider request failed; check the endpoint and account access.');
      return null;
    }
  };
  add('Password', passwordConfigured(env.APP_PASSWORD) ? 'pass' : 'fail', passwordConfigured(env.APP_PASSWORD) ? 'Password configuration accepted.' : 'APP_PASSWORD must contain 5–256 characters.');
  add('Submission', 'info', env.ENABLE_LAUNCH === 'true' ? 'Enabled; a signed and successfully simulated launch is still required.' : 'Disabled in Railway.');

  await Promise.all([
    request('Solana / Pump / simulation', async () => {
      if (!validUrl(env.SOLANA_RPC_URL)) return add('Solana RPC', 'fail', 'Set SOLANA_RPC_URL to an HTTPS mainnet endpoint.');
      const genesis = await call(env.SOLANA_RPC_URL, 'getGenesisHash', []);
      if (genesis !== MAINNET_GENESIS) return add('Solana RPC', 'fail', 'The configured RPC is not Solana mainnet.');
      add('Solana RPC', 'pass', 'Mainnet connection verified.');
      await request('Pump program', async () => {
        const result = await call(env.SOLANA_RPC_URL, 'getAccountInfo', [GLOBAL_PDA.toBase58(), { encoding: 'base64', commitment: 'confirmed' }]);
        const account = result?.value;
        if (!account || account.owner !== PUMP_PROGRAM_ID.toBase58() || !Array.isArray(account.data)) return add('Pump program', 'fail', 'Pump Global account could not be verified.');
        const global = PUMP_SDK.decodeGlobal({ ...account, owner: new PublicKey(account.owner), data: Buffer.from(account.data[0], 'base64') });
        add('Pump program', global.createV2Enabled ? 'pass' : 'fail', global.createV2Enabled ? 'Current Pump Global account decoded; creation is enabled.' : 'Pump creation is currently disabled.');
      });
      await request('Bundle simulation', async () => {
        if (!validUrl(env.BUNDLE_SIMULATION_RPC_URL)) return add('Bundle simulation', 'fail', 'Set BUNDLE_SIMULATION_RPC_URL to an HTTPS endpoint supporting simulateBundle.');
        const recent = await call(env.SOLANA_RPC_URL, 'getLatestBlockhash', [{ commitment: 'confirmed' }]);
        const wire = simulationProbe(recent.value.blockhash);
        const result = await call(env.BUNDLE_SIMULATION_RPC_URL, 'simulateBundle', [{ encodedTransactions: [wire] }, { skipSigVerify: false, replaceRecentBlockhash: false, preExecutionAccountsConfigs: [null], postExecutionAccountsConfigs: [null] }]);
        const value = result?.value;
        const recognized = value && Array.isArray(value.transactionResults) && (value.summary === 'succeeded' || (value.summary && typeof value.summary === 'object' && 'failed' in value.summary));
        add('Bundle simulation', recognized ? 'pass' : 'fail', recognized ? 'simulateBundle responded to an unfunded probe. A funded four-transaction launch has not been tested.' : 'Provider returned an unsupported simulateBundle response.');
      });
    }),
    request('Jito', async () => {
      const url = env.JITO_BLOCK_ENGINE_URL || 'https://amsterdam.mainnet.block-engine.jito.wtf/api/v1/bundles';
      if (!validUrl(url)) return add('Jito', 'fail', 'Set JITO_BLOCK_ENGINE_URL to an HTTPS endpoint.');
      const tips = await call(url, 'getTipAccounts', [], env.JITO_AUTH_UUID ? { 'x-jito-auth': env.JITO_AUTH_UUID } : {});
      const valid = Array.isArray(tips) && tips.length > 0 && tips.every(tip => { try { return !new PublicKey(tip).equals(PublicKey.default); } catch { return false; } });
      add('Jito', valid ? 'pass' : 'fail', valid ? 'Block engine responded with valid tip accounts.' : 'Block engine did not return valid tip accounts.');
    }),
  ]);
  return { checkedAt: new Date().toISOString(), checks, fundedLaunchTested: false };
}
