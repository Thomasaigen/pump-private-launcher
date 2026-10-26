const allowedRoot = new Set(['mode', 'description', 'selectedWallet', 'wallets', 'tokens']);
const allowedWallet = new Set(['id', 'label', 'publicAddress']);
const allowedToken = new Set(['id', 'name', 'launchWallet', 'protocolCreator', 'deployerAddress', 'pumpDeployerAddress', 'migrationUser', 'migrated']);

function requireKeys(object, allowed, context) {
  if (!object || typeof object !== 'object' || Array.isArray(object)) throw new Error(context + ' must be an object.');
  for (const key of Object.keys(object)) {
    if (!allowed.has(key)) throw new Error('Unsupported field in ' + context + '. Use the example schema; private keys are not accepted.');
  }
}

function requireText(value, context) {
  if (typeof value !== 'string' || !value.trim() || value.length > 160) throw new Error(context + ' must be a nonempty string of at most 160 characters.');
}

export function validateSnapshot(input) {
  requireKeys(input, allowedRoot, 'snapshot');
  if (input.mode !== 'offline-simulation') throw new Error('mode must be offline-simulation.');
  if (!Array.isArray(input.wallets) || input.wallets.length < 1 || input.wallets.length > 50) throw new Error('Provide 1–50 simulated wallets.');
  if (!Array.isArray(input.tokens) || input.tokens.length > 1000) throw new Error('Provide at most 1000 token records.');

  const wallets = new Set();
  for (const wallet of input.wallets) {
    requireKeys(wallet, allowedWallet, 'wallet');
    requireText(wallet.id, 'Wallet id');
    requireText(wallet.label, 'Wallet label');
    if (wallets.has(wallet.id)) throw new Error('Duplicate wallet id.');
    wallets.add(wallet.id);
    if (wallet.publicAddress !== undefined && wallet.publicAddress !== '') {
      if (typeof wallet.publicAddress !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet.publicAddress)) {
        throw new Error('publicAddress must be a public Solana address in base58 form. Never enter a private key.');
      }
    }
  }
  const walletRef = (id, context) => {
    if (typeof id !== 'string' || !wallets.has(id)) throw new Error(context + ' must refer to a configured simulated wallet.');
  };
  walletRef(input.selectedWallet, 'selectedWallet');
  const tokens = new Set();
  for (const token of input.tokens) {
    requireKeys(token, allowedToken, 'token');
    requireText(token.id, 'Token id');
    requireText(token.name, 'Token name');
    if (tokens.has(token.id)) throw new Error('Duplicate token id. Use one record per token.');
    tokens.add(token.id);
    for (const field of ['launchWallet', 'protocolCreator', 'deployerAddress']) walletRef(token[field], field);
    if (token.pumpDeployerAddress !== undefined) walletRef(token.pumpDeployerAddress, 'pumpDeployerAddress');
    if (typeof token.migrated !== 'boolean') throw new Error('migrated must be true or false.');
    if (token.migrated) walletRef(token.migrationUser, 'migrationUser');
    else if (token.migrationUser !== undefined) throw new Error('An unmigrated token cannot have a migrationUser.');
  }
  return input;
}

/*
 * An illustrative join over supplied records, not Axiom's implementation.
 * No Solana SDK, RPC, transaction construction, signing, or network access.
 */
export function analyzeSnapshot(input) {
  validateSnapshot(input);
  const selected = input.selectedWallet;
  const launched = input.tokens.filter(t => t.launchWallet === selected);
  const migrations = input.tokens.filter(t => t.migrated && t.migrationUser === selected);
  const storedDeployerHistory = input.tokens.filter(t => t.deployerAddress === selected);
  const attributionOnly = storedDeployerHistory.filter(t => t.launchWallet !== selected);
  const counts = {
    launchedTokens: launched.length,
    launchedTokensMigrated: launched.filter(t => t.migrated).length,
    migrationsInitiated: migrations.length,
    storedDeployerTokens: storedDeployerHistory.length,
    storedDeployerMigrated: storedDeployerHistory.filter(t => t.migrated).length,
    attributedButNotLaunched: attributionOnly.length
  };
  return {
    mode: 'offline-simulation',
    model: 'Illustrative stored-deployer grouping; not verified Axiom backend logic.',
    selectedWallet: input.wallets.find(w => w.id === selected),
    counts,
    records: input.tokens.map(t => ({
      token: t.id,
      name: t.name,
      launchWallet: t.launchWallet,
      protocolCreator: t.protocolCreator,
      storedDeployer: t.deployerAddress,
      displayedDeveloper: t.pumpDeployerAddress ?? t.deployerAddress,
      migrationUser: t.migrationUser ?? null,
      migrated: t.migrated,
      selectedWalletLaunched: t.launchWallet === selected,
      includedByStoredDeployer: t.deployerAddress === selected
    }))
  };
}
