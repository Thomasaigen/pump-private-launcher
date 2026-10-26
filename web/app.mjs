import { Keypair, PublicKey, VersionedTransaction } from '@solana/web3.js';
import nacl from 'tweetnacl';
import { Buffer } from 'buffer';
import { parsePrivateKey } from './wallet-import.mjs';
import { compareAxiomRecord } from './axiom-comparison.mjs';
import { lamports } from '../src/validation.mjs';

const $ = selector => document.querySelector(selector);
const wallets = new Map();
let session, prepared, mintKey, signed, signingTransactions, simulatedAt = 0, busy = false;
const errorBox = $('#error');
const el = (tag, text, className) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (className) n.className = className; return n; };
async function api(url, body) {
  const response = await fetch(url, { method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'launcher', ...(session ? { 'x-csrf-token': session.csrf } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json();
  if (response.status === 401) { clearWallets(); location.replace('/login'); throw new Error('Session expired.'); }
  if (!response.ok) { const e = new Error(data.error || 'Request failed.'); e.data = data; throw e; }
  return data;
}
const sol = value => { const n = BigInt(value); return `${n / 1_000_000_000n}.${(n % 1_000_000_000n).toString().padStart(9, '0')}`.replace(/\.?0+$/, ''); };
let preparedRoles = ['dev'];
function invalidate() { prepared = null; mintKey = null; signed = null; signingTransactions = null; simulatedAt = 0; $('#review').hidden = true; $('#confirm').checked = false; $('#submit').disabled = true; $('#evidence').hidden = true; $('#axiom-result').textContent = ''; }
function clearWallets() { wallets.clear(); invalidate(); document.querySelectorAll('.wallet-address').forEach(n => n.textContent = 'No wallet selected'); document.querySelectorAll('input[type=file], .private-key-input').forEach(n => n.value = ''); $('#creator-select').value = ''; $('#creator-address').textContent = 'No creator selected'; }
async function task(fn) {
  if (busy) return; busy = true; errorBox.textContent = '';
  const controls = [...document.querySelectorAll('button, input, select')].map(n => [n, n.disabled]); controls.forEach(([n]) => n.disabled = true);
  try { await fn(); } catch (e) {
    errorBox.textContent = e.message;
    if (e.data?.signatures) { $('#details').hidden = false; $('#details').textContent = JSON.stringify(e.data, null, 2); }
  } finally { busy = false; controls.forEach(([n, disabled]) => n.disabled = disabled); updateCreatorControls(); updateSubmit(); }
}
function updateCreatorControls() { $('#creator-select').disabled = busy || !session?.creators?.ready; $('#prepare').disabled = busy || !session?.creators?.ready; }
function updateSubmit() { $('#submit').disabled = busy || !prepared || !signed || !session?.launchEnabled || !$('#confirm').checked || Date.now() - simulatedAt > 30000 || Boolean(prepared.submissionAttempted); }
function walletRow(role, title, amount, optional) {
  const row = el('div', null, 'wallet-row'); const head = el('div', null, 'wallet-head'); head.append(el('b', title));
  if (amount) { const label = el('label', 'Buy · SOL'); const input = el('input'); input.name = `${role}-amount`; input.value = amount; input.inputMode = 'decimal'; input.required = true; input.className = 'buy-input'; label.append(input); head.append(label); }
  if (optional) {
    const toggle = el('label', null, 'wallet-toggle'); const box = el('input'); box.type = 'checkbox'; box.checked = true; box.className = 'wallet-enabled'; box.dataset.role = role;
    box.addEventListener('change', () => { row.classList.toggle('off', !box.checked); row.querySelectorAll('input:not(.wallet-enabled), button').forEach(n => { n.disabled = !box.checked; }); invalidate(); });
    toggle.append(box, document.createTextNode(' Use')); head.prepend(toggle);
  }
  const addressNode = el('code', 'No wallet selected', 'wallet-address');
  const useLocalKey = keypair => {
    wallets.set(role, { address: keypair.publicKey.toBase58(), keypair });
    addressNode.textContent = keypair.publicKey.toBase58(); invalidate();
  };
  const importArea = el('div', null, 'private-key-area');
  const keyLabel = el('label', `${title} private key`); keyLabel.htmlFor = `${role}-private-key`;
  const keyControls = el('div', null, 'private-key-controls');
  const keyInput = el('input'); keyInput.type = 'password'; keyInput.id = `${role}-private-key`; keyInput.className = 'private-key-input';
  keyInput.placeholder = 'Paste private key'; keyInput.autocomplete = 'off'; keyInput.spellcheck = false; keyInput.maxLength = 2000;
  keyInput.setAttribute('autocapitalize', 'none');
  // No name attribute: private keys are excluded from the launch form's FormData.
  const importButton = el('button', 'Use wallet', 'quiet'); importButton.type = 'button';
  importButton.addEventListener('click', () => task(async () => {
    try { useLocalKey(parsePrivateKey(keyInput.value)); }
    finally { keyInput.value = ''; }
  }));
  keyInput.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); importButton.click(); } });
  keyControls.append(keyInput, importButton); importArea.append(keyLabel, keyControls);
  const buttons = el('div', null, 'wallet-buttons');
  for (const [name, getProvider] of [['Phantom', () => window.phantom?.solana || window.solana], ['Solflare', () => window.solflare]]) {
    const button = el('button', name, 'quiet'); button.type = 'button';
    button.addEventListener('click', () => task(async () => {
      const provider = getProvider(); if (!provider) throw new Error(`${name} is not available in this browser.`);
      await provider.connect(); if (!provider.publicKey) throw new Error('Wallet connection was not approved.');
      const address = provider.publicKey.toString(); wallets.set(role, { address, provider }); addressNode.textContent = address; invalidate();
    })); buttons.append(button);
  }
  const fileLabel = el('label', 'Load keypair JSON', 'file-label'); const file = el('input'); file.type = 'file'; file.accept = '.json,application/json';
  file.addEventListener('change', () => task(async () => {
    const selected = file.files?.[0]; if (!selected) return;
    if (selected.size > 2000) throw new Error('Select a Solana 64-byte keypair JSON file.');
    try { useLocalKey(parsePrivateKey(await selected.text())); }
    finally { file.value = ''; }
  })); fileLabel.append(file); buttons.append(fileLabel); row.append(head, addressNode, importArea, buttons); return row;
}
for (const [role, title] of [['dev', 'Developer / launch wallet'], ['buyer1', 'Buyer 1'], ['buyer2', 'Buyer 2'], ['buyer3', 'Buyer 3']]) $('#wallet-rows').append(walletRow(role, title, '0.01', role !== 'dev'));
$('#creator-select').addEventListener('change', () => { $('#creator-address').textContent = $('#creator-select').value || 'No creator selected'; invalidate(); });
$('#launch-form').addEventListener('input', invalidate);
$('#clear-wallets').addEventListener('click', clearWallets);
$('#logout').addEventListener('click', () => task(async () => { clearWallets(); await api('/auth/logout', {}); location.replace('/login'); }));
function requireWallet(role) { const w = wallets.get(role); if (!w) throw new Error(`Select the ${role} wallet.`); return w; }
$('#launch-form').addEventListener('submit', event => { event.preventDefault(); const data = new FormData(event.currentTarget); task(async () => {
  invalidate();
  const dev = requireWallet('dev'), creator = session.creators.wallets.find(w => w.address === data.get('creator'));
  if (!session.creators.ready || !creator) throw new Error('Select a creator wallet configured in Railway.');
  mintKey = Keypair.generate();
  const activeBuyers = [1, 2, 3].filter(i => document.querySelector(`.wallet-enabled[data-role=buyer${i}]`).checked);
  if (!activeBuyers.length) throw new Error('Keep at least one buyer wallet switched on. The Jito tip is paid by the last buyer.');
  const name = '[TEST] ' + String(data.get('name') || '').trim();
  const symbol = String(data.get('symbol') || '').trim();
  const expectedBuys = [data.get('dev-amount'), ...activeBuyers.map(i => data.get(`buyer${i}-amount`))].map((amount, i) => BigInt(lamports(amount, i === 0 ? 'Developer amount' : 'Buyer amount', i === 0 ? 0n : 1n)));
  if (expectedBuys.reduce((a, b) => a + b, 0n) > 250_000_000n) throw new Error('Use at most 0.25 SOL total initial buys for this research launch.');
  for (const i of activeBuyers) requireWallet(`buyer${i}`);
  const image = data.get('image'); let uri;
  if (!image || !image.size) throw new Error('Upload a token image from your computer.');
  {
    if (image.size > 5 * 1024 * 1024) throw new Error('Image must be 5 MB or smaller.');
    const query = new URLSearchParams({ name, symbol, description: data.get('description') || '', launcher: dev.address, creator: creator.address });
    const response = await fetch(`/api/upload-metadata?${query}`, { method: 'POST', headers: { 'content-type': image.type, 'x-requested-with': 'launcher', 'x-csrf-token': session.csrf }, body: image });
    const result = await response.json().catch(() => ({}));
    if (response.status === 401) { clearWallets(); location.replace('/login'); throw new Error('Session expired.'); }
    if (!response.ok) throw new Error(result.error || 'Image upload failed.');
    uri = result.uri;
  }
  const spec = { name, symbol, uri, dev: dev.address, creator: creator.address, mint: mintKey.publicKey.toBase58(), devAmount: data.get('dev-amount'), buyers: activeBuyers.map(i => ({ address: requireWallet(`buyer${i}`).address, amount: data.get(`buyer${i}-amount`) })), tip: data.get('tip'), slippageBps: Math.round(Number(data.get('slippage')) * 100), priorityMicroLamports: Number(data.get('priority')) };
  const authorization = await api('/api/authorize', spec);
  prepared = await api('/api/prepare', { id: authorization.id }); preparedRoles = ['dev', ...activeBuyers.map(i => `buyer${i}`)]; renderReview();
}); });
function renderReview() {
  const content = $('#review-content'); content.replaceChildren();
  const meta = el('div', null, 'review-meta');
  for (const [label, value] of [['Mint', prepared.mint], ['Launch signer', prepared.launcher], ['Creator fee wallet', prepared.creator], ['Tip recipient', prepared.tipAccount]]) meta.append(el('span', label), el('code', value));
  const wrap = el('div', null, 'table-wrap'), table = el('table'), head = el('tr');
  for (const label of ['Transaction', 'Maximum buy · SOL', 'Tip · SOL', 'Network fee · SOL', 'Rent allowance · SOL']) head.append(el('th', label)); table.append(head);
  for (const row of prepared.summary) { const tr = el('tr'); for (const value of [row.label, sol(row.maxBuyLamports), sol(row.tipLamports), sol(row.networkFeeLamports), sol(row.rentAllowanceLamports)]) tr.append(el('td', value)); table.append(tr); }
  wrap.append(table); content.append(meta, wrap, el('p', 'Maximum buy includes slippage. Rent is a conservative allowance; complete bundle simulation validates actual execution. Wallets must be funded before preparing.', 'help'));
  $('#review').hidden = false; $('#result').textContent = 'Prepared. No transactions submitted.'; $('#details').hidden = true; $('#status').hidden = true; $('#confirm').checked = false;
  $('#review').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
async function signBundle() {
  if (!signingTransactions) {
    signingTransactions = prepared.transactions.map(wire => VersionedTransaction.deserialize(Buffer.from(wire, 'base64')));
    signingTransactions[0].sign([mintKey]);
  }
  const transactions = signingTransactions;
  for (let i = 0; i < transactions.length; i++) {
    const w = requireWallet(preparedRoles[i]);
    if (nacl.sign.detached.verify(transactions[i].message.serialize(), transactions[i].signatures[0], new PublicKey(w.address).toBytes())) continue;
    if (w.keypair) transactions[i].sign([w.keypair]);
    else {
      if (w.provider.publicKey?.toString() !== w.address) throw new Error(`Switch your wallet extension to ${w.address}, then sign again. Using separate local keypair files avoids switching accounts.`);
      const before = Buffer.from(transactions[i].message.serialize());
      const result = await w.provider.signTransaction(transactions[i]);
      if (!Buffer.from(result.message.serialize()).equals(before)) throw new Error('Wallet returned a modified transaction.');
      transactions[i] = result;
    }
  }
  return transactions.map(tx => Buffer.from(tx.serialize()).toString('base64'));
}
$('#sign-simulate').addEventListener('click', () => task(async () => {
  if (!prepared) throw new Error('Prepare the bundle first.');
  if (!session.simulationConfigured) throw new Error('Set BUNDLE_SIMULATION_RPC_URL in Railway before signing.');
  signed = await signBundle(); const result = await api('/api/simulate', { id: prepared.id, transactions: signed }); simulatedAt = Date.now();
  $('#result').textContent = `All ${prepared.transactions.length} signed transactions passed simulation. Nothing has launched yet, and Axiom cannot index this simulation. Review and submit within 30 seconds to perform the real launch.`;
  $('#details').hidden = false; $('#details').textContent = JSON.stringify(result, null, 2);
}));
$('#confirm').addEventListener('change', updateSubmit); setInterval(updateSubmit, 1000);
$('#submit').addEventListener('click', () => task(async () => {
  if (!$('#confirm').checked || !prepared || Date.now() - simulatedAt > 30000) throw new Error('Simulate and confirm the bundle first.');
  prepared.submissionAttempted = true;
  const result = await api('/api/submit', { id: prepared.id, confirmMint: prepared.mint }); prepared.bundleId = result.bundleId;
  prepared.signatures = result.signatures;
  $('#result').textContent = `Received by Jito: ${result.bundleId}. On-chain confirmation is pending.`;
  $('#details').hidden = false; $('#details').textContent = JSON.stringify(result, null, 2); $('#status').hidden = false;
  showEvidence();
}));
$('#status').addEventListener('click', () => task(async () => {
  const result = await api(`/api/status/${prepared.id}`); $('#details').hidden = false; $('#details').textContent = JSON.stringify(result, null, 2);
  prepared.confirmed = result.confirmed;
  $('#result').textContent = result.confirmed ? `All ${prepared.transactions.length} transactions are confirmed on chain. You can now check whether Axiom has indexed the mint.` : 'Not yet confirmed. Inspect the returned bundle and transaction statuses.';
  showEvidence();
}));
task(async () => {
  session = await api('/api/session');
  const creatorSelect = $('#creator-select');
  for (const wallet of session.creators.wallets) { const option = el('option', `${wallet.label} · ${wallet.address.slice(0, 6)}…${wallet.address.slice(-6)}`); option.value = wallet.address; creatorSelect.append(option); }
  $('#creator-configuration').textContent = session.creators.ready ? `${session.creators.wallets.length} configured creator wallet${session.creators.wallets.length === 1 ? '' : 's'} available. Select one and verify its full address below.` : session.creators.error;
  $('#readiness').textContent = !session.creators.ready ? 'Creator setup needed' : session.launchEnabled ? 'Mainnet submission enabled' : 'Preparation mode';
  const missing = []; if (!session.rpcConfigured) missing.push('SOLANA_RPC_URL'); if (!session.simulationConfigured) missing.push('BUNDLE_SIMULATION_RPC_URL'); if (!session.uploadsConfigured) missing.push('PINATA_JWT');
  if (!session.creators.ready) missing.push('CREATOR_PRIVATE_KEY_1');
  $('#notice').textContent = missing.length ? `Railway setup needed: ${missing.join(', ')}. Submission also requires ENABLE_LAUNCH=true and successful bundle simulation.` : session.launchEnabled ? 'Mainnet transactions use real SOL. Submission requires your explicit review and approval.' : 'Submission is disabled. You can prepare and simulate; enable it with ENABLE_LAUNCH=true in Railway when ready.';
});
function showEvidence() {
  $('#evidence').hidden = false;
  $('#evidence-state').textContent = prepared.confirmed ? 'RPC confirms the signed transactions. Axiom indexing is checked separately.' : 'Submitted to Jito; on-chain confirmation is still pending. Refresh status before interpreting Axiom.';
  $('#evidence-mint').textContent = prepared.mint;
  const links = $('#evidence-links'); links.replaceChildren();
  for (const [text, href] of [['Token on Solscan', 'https://solscan.io/token/' + prepared.mint], ...prepared.signatures.map((s, i) => ['Transaction ' + (i + 1), 'https://solscan.io/tx/' + s]), ['Open Axiom and search the mint', 'https://axiom.trade']]) {
    const a = el('a', text); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; links.append(a, document.createTextNode(' '));
  }
}
$('#compare-axiom').addEventListener('click', () => {
  try {
    if (!prepared?.confirmed) throw new Error('Refresh status until the launch is confirmed before comparing Axiom.');
    const raw = $('#axiom-json').value;
    if (raw.length > 50000) throw new Error('Paste a single pair-info response, up to 50 KB.');
    const result = compareAxiomRecord(JSON.parse(raw), prepared);
    $('#axiom-result').textContent = JSON.stringify(result, null, 2);
  } catch (error) { $('#axiom-result').textContent = error instanceof SyntaxError ? 'Paste valid JSON from Axiom’s pair-info response.' : error.message; }
});
window.addEventListener('pagehide', clearWallets);

{
  const input = $('#image'), zone = $('#dropzone'), preview = $('#image-preview'), text = $('#dropzone-text');
  const show = () => {
    const file = input.files[0];
    if (!file) { preview.hidden = true; preview.removeAttribute('src'); text.innerHTML = ''; text.append(el('b', 'Upload token image'), el('small', 'Drop a file here or click to choose one from your computer. PNG, JPEG, GIF or WebP, up to 5 MB.')); return; }
    const reader = new FileReader();
    reader.onload = () => { preview.src = reader.result; preview.hidden = false; };
    reader.readAsDataURL(file);
    text.innerHTML = ''; text.append(el('b', file.name), el('small', `${(file.size / 1024).toFixed(0)} KB · click or drop to replace`));
    invalidate();
  };
  input.addEventListener('change', show);
  for (const type of ['dragenter', 'dragover']) zone.addEventListener(type, e => { e.preventDefault(); zone.classList.add('over'); });
  for (const type of ['dragleave', 'drop']) zone.addEventListener(type, e => { e.preventDefault(); zone.classList.remove('over'); });
  zone.addEventListener('drop', e => { if (e.dataTransfer?.files?.length) { input.files = e.dataTransfer.files; show(); } });
}
