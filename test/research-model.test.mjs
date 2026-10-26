import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSnapshot } from '../src/research-model.mjs';

import { snapshots } from '../src/research-fixtures.mjs';
const read = name => structuredClone(snapshots[name.startsWith('earlier') ? 'earlier' : 'later']);

test('Earlier fixture separates one real launch from the illustrative 3/4 grouping', () => {
  assert.deepEqual(analyzeSnapshot(read('earlier-snapshot.json')).counts, {
    launchedTokens: 1, launchedTokensMigrated: 0, migrationsInitiated: 3,
    storedDeployerTokens: 4, storedDeployerMigrated: 3, attributedButNotLaunched: 3
  });
});
test('Later fixture adds two launches without changing the three old migrations', () => {
  assert.deepEqual(analyzeSnapshot(read('later-snapshot.json')).counts, {
    launchedTokens: 3, launchedTokensMigrated: 0, migrationsInitiated: 3,
    storedDeployerTokens: 6, storedDeployerMigrated: 3, attributedButNotLaunched: 3
  });
});
test('Changing a creator argument does not change the known launch wallet', () => {
  const fixture = read('earlier-snapshot.json');
  const before = analyzeSnapshot(fixture);
  fixture.tokens[3].protocolCreator = 'wallet_d';
  const after = analyzeSnapshot(fixture);
  assert.deepEqual(after.counts, before.counts);
  assert.equal(after.records[3].launchWallet, 'wallet_a');
  assert.equal(after.records[3].displayedDeveloper, 'wallet_a');
});
test('Original Pump deployer takes priority for displayed developer in the illustrative record', () => {
  const r = analyzeSnapshot(read('earlier-snapshot.json')).records[0];
  assert.equal(r.storedDeployer, 'wallet_a');
  assert.equal(r.displayedDeveloper, 'wallet_b');
  assert.equal(r.selectedWalletLaunched, false);
  assert.equal(r.includedByStoredDeployer, true);
});
test('Self-migration is not misclassified as somebody else’s launch', () => {
  const fixture = read('earlier-snapshot.json');
  fixture.tokens = [fixture.tokens[3]];
  fixture.tokens[0].migrated = true;
  fixture.tokens[0].migrationUser = 'wallet_a';
  const r = analyzeSnapshot(fixture);
  assert.equal(r.counts.launchedTokensMigrated, 1);
  assert.equal(r.counts.attributedButNotLaunched, 0);
  assert.equal(r.counts.storedDeployerTokens, 1);
});
test('Duplicate tokens cannot inflate the counts', () => {
  const fixture = read('earlier-snapshot.json');
  fixture.tokens.push({ ...fixture.tokens[0] });
  assert.throws(() => analyzeSnapshot(fixture), /Duplicate token/);
});
test('Unknown wallets and private-key fields are rejected', () => {
  const fixture = read('earlier-snapshot.json');
  fixture.tokens[0].launchWallet = 'unknown';
  assert.throws(() => analyzeSnapshot(fixture), /configured simulated wallet/);
  const keys = read('earlier-snapshot.json');
  keys.wallets[0].privateKey = 'not-a-real-key';
  assert.throws(() => analyzeSnapshot(keys), /private keys are not accepted/);
});
test('Empty history is supported and analysis leaves its input unchanged', () => {
  const fixture = read('earlier-snapshot.json');
  fixture.tokens = [];
  const copy = structuredClone(fixture);
  const r = analyzeSnapshot(fixture);
  assert.equal(r.counts.storedDeployerTokens, 0);
  assert.deepEqual(fixture, copy);
});
