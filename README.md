# Private Attribution Research · Version 2

The existing password-protected website now opens an interactive **offline research model**. No download or local setup is needed to use the deployed page.

## Use the website

1. Open the existing Railway URL and enter the same workspace password.
2. Select the four-token or six-token sample.
3. Compare original launches, migrations initiated, and the illustrative stored-deployer grouping.
4. Optionally expand the wallet-label section and enter names and **public addresses** for wallets you control.

All token records are simulated. Public addresses are labels held only in the current tab. They are not sent to the server, persisted, connected to a wallet extension, or used to retrieve actual history. Reloading clears them.

The earlier fixture illustrates one original launch and three migrations by the selected wallet, producing a 3/4 stored-deployer grouping. The later fixture adds two original launches, producing 3/6. The original launch identities remain separate in both views.

## Scope

This is an illustrative data model, not Axiom's backend source or a current Pump program test. It cannot demonstrate that a new live migration would receive the same attribution. No on-chain migration, token launch, transaction signing, metadata upload, RPC request, or Jito submission is available in this version.

The default server is now **src/research-server.mjs** and the browser bundle is **dist/research.js**. Earlier launcher source files remain in the repository, but this server does not import them, load wallet keys, start chain diagnostics, or expose their transaction endpoints. A stale browser tab receives HTTP 410 from retired transaction routes. ENABLE_LAUNCH cannot enable them in the research server.

## Railway

The existing GitHub main branch remains the deployment source, using the existing service and domain.

| Variable | Purpose |
| --- | --- |
| APP_PASSWORD | Existing workspace password, 5–256 characters. Required. |
| PORT | Listening port, normally provided by Railway. Defaults to 3000. |
| NODE_ENV | Set to production for Secure cookies and HSTS. |
| APP_ORIGIN | Optional exact custom-domain origin. Otherwise Railway's public domain is used. |

Existing chain, Jito, upload and private-key variables are unused by this version. No new variable is required. Secrets should never be committed.

Sessions remain in memory for one hour. A deployment or restart logs users out. Keep one replica.

## Development and validation

Node 22 or newer; Docker uses Node 24.

    npm ci --ignore-scripts
    npm test
    npm start

Set APP_PASSWORD in your shell before starting. For local HTTP development, omit NODE_ENV=production.

`npm test` builds the browser bundle before running the suite. For a deployment-only build, use `npm run build`.

Research tests cover both expected sample counts, preservation of original launch identity, duplicate rejection, self-migration, unknown-wallet rejection, password gating, five-character passwords, origin/CSRF protections, logout, and disabled live endpoints even when ENABLE_LAUNCH=true. Existing legacy unit tests remain available in the same test suite.

The research browser bundle contains no Solana SDK, signing or transaction code. Wallet labels are handled as text, not HTML.
