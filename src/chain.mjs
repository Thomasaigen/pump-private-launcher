import { Connection, PublicKey, TransactionMessage, VersionedTransaction, ComputeBudgetProgram, SystemProgram } from '@solana/web3.js';
import { NATIVE_MINT, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { PUMP_SDK, OnlinePumpSdk, newBondingCurve, getBuyTokenAmountFromSolAmount, getBuySolAmountFromTokenAmount } from '@pump-fun/pump-sdk';
import BN from 'bn.js';
import { randomInt } from 'node:crypto';
import { fail } from './validation.mjs';

export async function rpc(url, method, params, headers = {}) {
  let response;
  try { response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(20_000) }); }
  catch { fail(`${method} could not reach the configured provider.`, 502); }
  if (!response.ok) fail(`${method} provider returned HTTP ${response.status}.`, 502);
  const result = await response.json();
  if (result.error) fail(`${method} was rejected by the provider (code ${result.error.code ?? 'unknown'}). Check provider support and configuration.`, 502);
  if (result.result === undefined) fail(`${method} returned no result.`, 502);
  return result.result;
}

export async function buildTransactions(spec, { global, feeConfig, blockhash, lastValidBlockHeight, tipAccount }) {
  if (!global.createV2Enabled) fail('Pump creation is currently disabled.', 503);
  const creator = new PublicKey(spec.creator), mint = new PublicKey(spec.mint), dev = new PublicKey(spec.dev);
  const curve = newBondingCurve(global, NATIVE_MINT); curve.creator = creator; curve.isMayhemMode = false;
  const wallets = [{ address: spec.dev, amount: spec.devAmount }, ...spec.buyers];
  const transactions = [], summary = [];
  for (let i = 0; i < wallets.length; i++) {
    const wallet = wallets[i], user = new PublicKey(wallet.address), budget = new BN(wallet.amount);
    // A zero developer amount creates the token without a developer buy.
    const buys = !(i === 0 && budget.isZero());
    const quoteArgs = { global, feeConfig, mintSupply: global.tokenTotalSupply, bondingCurve: curve, quoteMint: NATIVE_MINT };
    let amount = new BN(0), expectedCost = new BN(0), maxCost = new BN(0);
    if (buys) {
      amount = getBuyTokenAmountFromSolAmount({ ...quoteArgs, amount: budget });
      if (amount.isZero() || amount.gte(curve.realTokenReserves)) fail('Initial buys must leave the bonding curve incomplete. Reduce amounts.');
      expectedCost = getBuySolAmountFromTokenAmount({ ...quoteArgs, amount });
      maxCost = expectedCost.muln(10000 + spec.slippageBps).addn(9999).divn(10000);
    }
    const instructions = [ComputeBudgetProgram.setComputeUnitLimit({ units: i === 0 ? 500000 : 250000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: spec.priorityMicroLamports })];
    if (i === 0) instructions.push(await PUMP_SDK.createV2Instruction({ mint, name: spec.name, symbol: spec.symbol, uri: spec.uri, creator, user: dev, mayhemMode: false, cashback: false, holderReward: false, quoteMint: NATIVE_MINT, quoteTokenProgram: TOKEN_PROGRAM_ID }));
    if (buys) instructions.push(...await PUMP_SDK.buyV3Instructions({ bondingCurve: curve, associatedUserAccountInfo: null, mint, user, amount, quoteAmount: maxCost, slippage: 0, tokenProgram: TOKEN_2022_PROGRAM_ID, quoteTokenProgram: TOKEN_PROGRAM_ID, buybackFeeRecipient: global.buybackFeeRecipients[0], partialFill: false }));
    // Embed the tip in the final buy so it cannot land as a stand-alone tip transaction.
    if (i === wallets.length - 1) instructions.push(SystemProgram.transfer({ fromPubkey: user, toPubkey: new PublicKey(tipAccount), lamports: BigInt(spec.tip) }));
    const tx = new VersionedTransaction(new TransactionMessage({ payerKey: user, recentBlockhash: blockhash, instructions }).compileToV0Message());
    let wire; try { wire = tx.serialize(); } catch { fail('Transaction exceeds the Solana size limit. Shorten the metadata URI.'); }
    if (wire.length > 1232) fail('Transaction exceeds 1,232 bytes. Shorten the metadata URI.');
    transactions.push(Buffer.from(wire).toString('base64'));
    summary.push({ label: i === 0 ? (buys ? 'Launch + developer buy' : 'Launch, no developer buy') : `Buyer ${i}`, wallet: wallet.address, tokensRaw: amount.toString(), expectedBuyLamports: expectedCost.toString(), maxBuyLamports: maxCost.toString(), tipLamports: i === wallets.length - 1 ? spec.tip : '0', bytes: wire.length });
    // Exact-token buys advance reserves by their fee-exclusive curve cost.
    if (buys) {
    const netCost = amount.mul(curve.virtualQuoteReserves).div(curve.virtualTokenReserves.sub(amount)).addn(1);
    curve.virtualTokenReserves = curve.virtualTokenReserves.sub(amount);
    curve.realTokenReserves = curve.realTokenReserves.sub(amount);
    curve.virtualQuoteReserves = curve.virtualQuoteReserves.add(netCost);
    curve.realQuoteReserves = curve.realQuoteReserves.add(netCost);
    }
  }
  return { transactions, summary, blockhash, lastValidBlockHeight, mint: spec.mint, creator: spec.creator, tipAccount };
}

export function simulationSucceeded(result, count) {
  const value = result?.value;
  return value?.summary === 'succeeded' && Array.isArray(value.transactionResults) && value.transactionResults.length === count && value.transactionResults.every(t => t && t.err === null);
}

export function createChain(env) {
  const rpcUrl = env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const jitoUrl = env.JITO_BLOCK_ENGINE_URL || 'https://amsterdam.mainnet.block-engine.jito.wtf/api/v1/bundles';
  const simulationUrl = env.BUNDLE_SIMULATION_RPC_URL;
  for (const value of [rpcUrl, jitoUrl, simulationUrl].filter(Boolean)) {
    let valid = false; try { valid = new URL(value).protocol === 'https:'; } catch { /* Never expose an endpoint in a URL parser error. */ }
    if (!valid) throw new Error('RPC endpoints must be valid HTTPS URLs.');
  }
  const connection = new Connection(rpcUrl, 'confirmed'); const sdk = new OnlinePumpSdk(connection);
  const jito = (method, params) => rpc(jitoUrl, method, params, env.JITO_AUTH_UUID ? { 'x-jito-auth': env.JITO_AUTH_UUID } : {});
  return {
    configured: Boolean(env.SOLANA_RPC_URL), simulationConfigured: Boolean(simulationUrl), enabled: env.ENABLE_LAUNCH === 'true',
    async prepare(spec) {
      const [global, feeConfig, recent, tips, existing] = await Promise.all([sdk.fetchGlobal(), sdk.fetchFeeConfig(), connection.getLatestBlockhash('confirmed'), jito('getTipAccounts', []), connection.getAccountInfo(new PublicKey(spec.mint))]);
      if (existing) fail('Mint already exists. Generate a new mint.');
      if (!Array.isArray(tips) || tips.length === 0) fail('Jito returned no tip accounts.', 502);
      const bundle = await buildTransactions(spec, { global, feeConfig, ...recent, tipAccount: tips[randomInt(tips.length)] });
      const balances = await Promise.all(bundle.summary.map(row => connection.getBalance(new PublicKey(row.wallet))));
      for (let i = 0; i < bundle.summary.length; i++) {
        const row = bundle.summary[i]; row.balanceLamports = String(balances[i]);
        const message = VersionedTransaction.deserialize(Buffer.from(bundle.transactions[i], 'base64')).message;
        const fee = (await connection.getFeeForMessage(message)).value;
        if (fee === null) fail('Blockhash expired during preparation. Prepare again.');
        row.networkFeeLamports = String(fee);
        // This is a conservative rent allowance, not an exact rent quote. Simulation is mandatory.
        row.rentAllowanceLamports = i === 0 ? '20000000' : '5000000';
        const needed = BigInt(row.maxBuyLamports) + BigInt(row.tipLamports) + BigInt(fee) + BigInt(row.rentAllowanceLamports);
        row.fundingRequiredLamports = needed.toString();
        if (BigInt(balances[i]) < needed) fail(`${row.label} wallet needs at least ${Number(needed) / 1e9} SOL including the rent allowance.`);
      }
      return bundle;
    },
    async simulate(transactions) {
      if (!simulationUrl) fail('Set BUNDLE_SIMULATION_RPC_URL to an endpoint supporting simulateBundle. Launch stays locked until the complete bundle passes simulation.', 503);
      const result = await rpc(simulationUrl, 'simulateBundle', [{ encodedTransactions: transactions }, { skipSigVerify: false, replaceRecentBlockhash: false, preExecutionAccountsConfigs: transactions.map(() => null), postExecutionAccountsConfigs: transactions.map(() => null) }]);
      if (!simulationSucceeded(result, transactions.length)) fail('Full bundle simulation did not succeed. Check balances, blockhash expiry and provider compatibility. No transactions were submitted.');
      return { succeeded: true, unitsConsumed: result.value.transactionResults.map(t => t.unitsConsumed), slot: result.context?.slot ?? null };
    },
    async submit(transactions, lastValidBlockHeight) {
      if (env.ENABLE_LAUNCH !== 'true') fail('Launch is disabled. Set ENABLE_LAUNCH=true in Railway when ready.', 403);
      if (await connection.getBlockHeight('confirmed') > lastValidBlockHeight) fail('Blockhash expired. Prepare and sign again.');
      return jito('sendBundle', [transactions, { encoding: 'base64' }]);
    },
    async status(id, signatures) {
      const [inflight, bundle, chain] = await Promise.all([jito('getInflightBundleStatuses', [[id]]), jito('getBundleStatuses', [[id]]), connection.getSignatureStatuses(signatures, { searchTransactionHistory: true })]);
      return { inflight, bundle, transactions: chain.value, confirmed: chain.value.length === signatures.length && chain.value.every(s => s && s.err === null && ['confirmed', 'finalized'].includes(s.confirmationStatus)) };
    },
  };
}
