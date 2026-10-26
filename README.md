# Private Research Test Launcher · 2.1

The default website now prepares a **real Pump.fun mainnet test launch** using a launch wallet and one to three buyer wallets. It requires a complete signed bundle simulation, a cost review, and an explicit submit action. The offline attribution model remains at **/research**.

This tests attribution of a new token. It does not recreate the earlier 3/4 migration-history discrepancy, migrate existing tokens, or change Axiom's records. Simulation alone does not create a token or make it appear on Axiom.

## Use the website

1. Open the existing Railway URL and enter your existing password.
2. Enter a test name, symbol and image. The app adds **[TEST]** to the public token name and identifies the launcher and creator fee wallet in its metadata.
3. Import or connect the launch wallet and your buyer wallets. Turn off unused buyers. Private keys entered on the website stay in the tab; they are not included in API request bodies or storage.
4. Select a creator wallet configured with a valid private key in Railway. A different creator fee wallet is supported only when its key authorizes the exact launch settings. Public-address-only creator entries are rejected.
5. Prepare the bundle and inspect the mint, launcher, creator, buy limits, network fees, rent allowances and Jito tip.
6. Click **Sign & simulate bundle**. This does not broadcast a launch.
7. To perform the real test, review the confirmation and click **Launch test on mainnet** within 30 seconds of a successful simulation. This spends real SOL. Refresh status to check on-chain confirmation.
8. Search the confirmed mint in Axiom. The page provides Solscan links and an optional local comparison of a pasted Axiom pair-info JSON response. That JSON is user-supplied evidence, not an authenticated API response fetched by this app.

The creator authorizes a bounded message, rather than supplying the launch transaction signature. The launcher, mint and selected buyers sign the actual transactions. Key control is checked cryptographically; this does not establish legal ownership or that every key belongs to the same human.

## Research limits

- Initial buys: at most **0.25 SOL total**, before slippage, network fees, rent and tip.
- Jito tip: at most **0.005 SOL**.
- Priority price: at most **100,000 micro-lamports per CU**.
- Developer buy may be zero; at least one buyer is required.
- Names must begin with **[TEST]**. Metadata must be generated in the authenticated session for the exact token name, symbol, launcher and creator.
- No migration or creator-transfer endpoint is included.

Submission is locked unless the complete bundle passes signature verification and simulation. A Jito receipt is not on-chain confirmation. A successful launch does not guarantee Axiom indexing or any particular displayed history.

## Railway variables

Existing service, domain and password are reused. No new variable names are required.

| Variable | Purpose |
| --- | --- |
| APP_PASSWORD | Workspace password, 5–256 characters. |
| SOLANA_RPC_URL | HTTPS Solana mainnet RPC. Network is verified before preparation. |
| BUNDLE_SIMULATION_RPC_URL | HTTPS provider that supports the complete simulateBundle API. A standard RPC URL may not support this method. |
| JITO_BLOCK_ENGINE_URL | HTTPS Jito bundle endpoint; Amsterdam is the default. |
| JITO_AUTH_UUID | Optional Jito authentication. |
| PINATA_JWT | Image and metadata upload credential. |
| CREATOR_PRIVATE_KEY_1 | Your valid base58 private key or 64-byte keypair JSON; never just a public address. Numbered entries 1–50 are supported. |
| CREATOR_LABEL_1 | Optional label for that creator. |
| ENABLE_LAUNCH | Must be exactly true to permit user-reviewed submission. Otherwise preparation and simulation only. |
| NODE_ENV | production enables Secure cookies and HSTS. |
| PORT | Normally supplied by Railway, defaults to 3000. |
| APP_ORIGIN | Optional exact custom-domain origin. |

Do not commit credentials. Keep one Railway replica because sessions, pending bundles and metadata bindings are in memory. Restarting invalidates them.

## Validation and development

Node 22 or newer; Docker uses Node 24.

    npm ci --ignore-scripts
    npm test
    npm start

`npm test` builds both browser bundles first. The suite uses generated test keys, an SDK Global fixture and mocked providers for submission tests. It does not spend SOL, upload metadata or claim a funded live launch was tested. Startup diagnostics read mainnet and simulate an unfunded probe; the full funded bundle must pass simulation in the website.

Default entrypoint: **src/test-launch-server.mjs**. The earlier offline-only entrypoint remains available as **src/research-server.mjs**. Both interfaces are password-protected.

## Protocol references

- [Solana simulation](https://solana.com/docs/rpc/http/simulatetransaction): simulation does not broadcast.
- [Jito bundles](https://docs.jito.wtf/lowlatencytxnsend/): bundle submission receipts and confirmation are separate.
- [Pump public documentation](https://github.com/pump-fun/pump-public-docs): official protocol documentation; actual transaction success is still checked by simulation.
