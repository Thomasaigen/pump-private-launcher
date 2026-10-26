import { analyzeSnapshot } from '../src/research-model.mjs';
import { snapshots } from '../src/research-fixtures.mjs';

const byId = id => document.getElementById(id);
const scenario = byId('scenario'), selected = byId('selected-wallet');
let walletLabels = structuredClone(snapshots.earlier.wallets);
let csrf = '';
function label(id) { return walletLabels.find(w => w.id === id)?.label ?? id; }
function renderWalletSelect() {
  const current = selected.value || 'wallet_a';
  selected.replaceChildren();
  for (const wallet of walletLabels) {
    const option = document.createElement('option'); option.value = wallet.id; option.textContent = wallet.label; selected.append(option);
  }
  selected.value = current;
}
function renderWalletForm() {
  const target = byId('wallet-fields'); target.replaceChildren();
  for (const wallet of walletLabels) {
    const row = document.createElement('div'); row.className = 'wallet-field';
    for (const [field, title] of [['label', 'Wallet label'], ['publicAddress', 'Public address · optional']]) {
      const wrapper = document.createElement('label'); wrapper.textContent = title;
      const input = document.createElement('input'); input.name = wallet.id + '_' + field;
      input.type = 'text'; input.autocomplete = 'off'; input.spellcheck = false;
      input.maxLength = field === 'label' ? 40 : 44; input.required = field === 'label';
      input.value = wallet[field] || ''; input.placeholder = field === 'label' ? wallet.id : 'Public address only';
      wrapper.append(input); row.append(wrapper);
    }
    target.append(row);
  }
}
function addCell(row, text, secondary) {
  const td = document.createElement('td'); const primary = document.createElement('strong');
  primary.textContent = text; td.append(primary);
  if (secondary) { const small = document.createElement('small'); small.textContent = secondary; td.append(small); }
  row.append(td); return td;
}
function render() {
  const input = structuredClone(snapshots[scenario.value]); input.wallets = walletLabels; input.selectedWallet = selected.value;
  const report = analyzeSnapshot(input), c = report.counts;
  byId('actual-launches').textContent = c.launchedTokens;
  byId('actual-migrated').textContent = c.launchedTokensMigrated + ' of these launches migrated';
  byId('migrations').textContent = c.migrationsInitiated;
  byId('attributed').textContent = c.storedDeployerMigrated + '/' + c.storedDeployerTokens;
  byId('attributed-note').textContent = 'Migrated / total in this illustrative grouping';
  byId('finding').textContent = c.attributedButNotLaunched
    ? c.attributedButNotLaunched + ' tokens appear in this wallet’s stored-deployer grouping without being its original launches.'
    : 'This wallet’s stored-deployer grouping contains no tokens launched by another sample wallet.';
  byId('record-count').textContent = report.records.length + ' simulated token records';
  const body = byId('records'); body.replaceChildren();
  for (const record of report.records) {
    const tr = document.createElement('tr');
    addCell(tr, record.name, record.migrated ? 'Migrated sample' : 'Unmigrated sample');
    for (const id of [record.launchWallet, record.migrationUser, record.storedDeployer, record.displayedDeveloper]) {
      const wallet = walletLabels.find(w => w.id === id);
      addCell(tr, id ? label(id) : 'None', wallet?.publicAddress ? wallet.publicAddress.slice(0, 5) + '…' + wallet.publicAddress.slice(-5) : null);
    }
    const cell = document.createElement('td'), badge = document.createElement('span');
    badge.className = 'role' + (!record.includedByStoredDeployer ? ' outside' : '');
    badge.textContent = record.selectedWalletLaunched ? 'Original launch' : record.includedByStoredDeployer ? 'Migration attribution' : 'Outside grouping';
    cell.append(badge); tr.append(cell); body.append(tr);
  }
}
byId('wallet-form').addEventListener('submit', event => {
  event.preventDefault(); byId('error').textContent = ''; byId('wallet-status').textContent = '';
  try {
    const form = new FormData(event.currentTarget);
    const updated = walletLabels.map(w => ({ ...w, label: String(form.get(w.id + '_label') || '').trim(), publicAddress: String(form.get(w.id + '_publicAddress') || '').trim() }));
    const probe = structuredClone(snapshots[scenario.value]); probe.wallets = updated; probe.selectedWallet = selected.value;
    analyzeSnapshot(probe); walletLabels = updated; renderWalletSelect(); render();
    byId('wallet-status').textContent = 'Labels applied in this tab. No wallet history was loaded.';
  } catch (error) { byId('error').textContent = error.message; }
});
byId('reset-labels').addEventListener('click', () => {
  walletLabels = structuredClone(snapshots.earlier.wallets); renderWalletSelect(); renderWalletForm(); render();
  byId('error').textContent = ''; byId('wallet-status').textContent = 'Sample labels restored.';
});
scenario.addEventListener('change', render);
selected.addEventListener('change', render);
byId('logout').addEventListener('click', async () => {
  try {
    const response = await fetch('/auth/logout', { method: 'POST', headers: { 'x-requested-with': 'launcher', 'x-csrf-token': csrf } });
    if (!response.ok && response.status !== 401) throw new Error('Could not lock the workspace. Reload and try again.');
    location.replace('/login');
  } catch (error) { byId('error').textContent = error.message; }
});
async function start() {
  try {
    const response = await fetch('/api/session');
    if (response.status === 401) return location.replace('/login');
    if (!response.ok) throw new Error('Could not load this session. Reload and sign in again.');
    const session = await response.json(); csrf = session.csrf;
    renderWalletSelect(); renderWalletForm(); render();
  } catch (error) { byId('error').textContent = error.message; }
}
start();
