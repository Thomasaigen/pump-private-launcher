# Pump Private Launcher

A private, password-gated Pump.fun launch workspace for your own wallets. The app prepares a four-transaction Jito bundle: token creation and developer buy, followed by three buyer transactions. Developer and buyer wallets sign locally in your browser. Creator wallets must be configured with their private keys in Railway; app access is password-protected.

## Railway setup

Open the `launcher` service → **Variables**. Set:

| Variable | Value / purpose |
| --- | --- |
| `APP_PASSWORD` | Your own unique password, 5–256 characters. Required for access. Never commit it. |
| `CREATOR_PRIVATE_KEY_1` | Server-only private key for your first creator wallet: base58 or a 64-byte Solana keypair JSON array. A plain public wallet address is also accepted; the creator is then recorded without a server-side signature check. |
| `CREATOR_LABEL_1` | Optional display label, up to 40 characters. Repeat the matching private-key and label variables with suffixes `_2` through `_50` for more creator wallets. |
| `SOLANA_RPC_URL` | An HTTPS Solana mainnet RPC endpoint. |
| `PINATA_JWT` | Required to launch. Pinata JWT used to upload the token image and metadata to IPFS from the page.. `IPFS_GATEWAY_URL` overrides the default `https://ipfs.io/ipfs/`. |
| `BUNDLE_SIMULATION_RPC_URL` | An HTTPS RPC endpoint supporting Jito-Solana `simulateBundle`, such as QuickNode with the Lil' JIT add-on. A standard Solana endpoint alone is insufficient. |
| `ENABLE_LAUNCH` | Initially `false`. Set to `true` when ready to submit reviewed, successfully simulated bundles. |
| `JITO_BLOCK_ENGINE_URL` | Defaults to `https://amsterdam.mainnet.block-engine.jito.wtf/api/v1/bundles`. |
| `JITO_AUTH_UUID` | Optional Jito authentication credential, if your provider requires one. |
| `APP_ORIGIN` | Optional exact HTTPS origin. Railway's `RAILWAY_PUBLIC_DOMAIN` is used automatically; set this for a custom domain. |

Add creator private keys directly in Railway Variables, preferably as sealed variables. Do not put them in GitHub, this README, a chat message, or browser launch forms. Creator private keys are held by the Railway process and never returned to the browser. Protect your Railway account and use dedicated creator wallets.

Only addresses derived from these valid keypairs can be selected as creator. An invalid key or duplicate wallet disables the entire creator list until corrected. Missing creator configuration keeps login available but blocks preparation. Changing variables and redeploying reloads the list and clears pending sessions/bundles.

Apply the variables and redeploy. If `APP_PASSWORD` is missing or too short, the login page remains available but **all app/API access stays locked**. There is no default password and no first-visitor setup flow. Changing the password and redeploying invalidates all sessions.

Keep one replica. Sessions, creator-authorization challenges and pending bundles are memory-only. A restart logs you out and removes pending bundle tracking. Export/copy transaction signatures before leaving the page; on-chain transactions are unaffected by a restart. Successful login lasts one hour.

Each startup runs read-only diagnostics for the configured mainnet RPC, Pump Global account, Jito tip accounts and `simulateBundle` availability. It logs only a sanitized status report, never passwords or provider URLs. The simulation probe uses an ephemeral unfunded payer and no transfer instructions; an expected insufficient-funds result verifies the method responds, **not** that a real launch will succeed. The report is also available at `/api/readiness` after login. No probe is submitted on chain.

## Using the app

1. Log in with `APP_PASSWORD`.
2. Enter the token name, symbol and a public HTTPS/IPFS metadata JSON URI. Host the metadata/image beforehand; this app does not upload metadata.
3. Select a developer wallet and one to three distinct buyer wallets (untick “Use” on a buyer to leave it out; the Jito tip is then paid by the last wallet in the bundle). Paste a base58 private key (or a JSON array of 64 bytes) into that wallet’s masked field and press **Use wallet**. You can also connect Phantom/Solflare or load a standard Solana 64-byte keypair JSON file. Parsing and signing happen **locally in the browser**; the field clears after import. Public addresses and seed phrases are not accepted as private keys. No developer or buyer private key is sent to the server or saved to browser storage. Use dedicated launch wallets. Reload/lock to discard the tab's references to keys.
4. Under **Creator wallet**, select a configured wallet from the dropdown and verify the full address shown below it. To use the developer as creator, configure that same wallet in Railway and select it. The server derives creator addresses from the configured private keys and signs a session-bound, single-use authorization for the exact mint, launcher, metadata and settings. The creator key is not used to sign the on-chain creation transaction. If the creator and developer are the same wallet, that wallet still signs in its developer role. There is no arbitrary creator-address field or client-signature bypass.
5. Fund every wallet in advance. Each pays its own buy, transaction fee and account rent. Buyer 3 also pays the Jito tip. This app does not transfer funding between wallets.
6. Prepare the bundle, then review the mint, creator, per-wallet cost limits, rent allowances and tip recipient.
7. Sign and simulate. When several roles use one wallet extension, switch the extension to each requested account and press **Sign & simulate bundle** again; signatures already collected are retained. If the blockhash expires, prepare a fresh bundle.
8. After all four transactions pass stateful bundle simulation, check the mainnet approval box and submit within 30 seconds. The server checks the blockhash and refuses modified/unsigned messages. A Jito bundle ID means receipt, **not** on-chain confirmation. Refresh status to verify every signature is confirmed/finalized and has no error.

No automatic submission or retry occurs. If a send times out, check the displayed transaction signatures before attempting anything else. Jito bundles can be affected by uncled blocks and rebroadcasting; all-or-nothing execution is not an unconditional guarantee across those scenarios. The tip is part of the final buy transaction, not a standalone transaction.

## Protocol scope

- Solana mainnet; standard SOL-paired Pump creation (`create_v2`) and Token-2022 base mint.
- Current official Pump SDK `4.3.1`; `buy_v3` trades keep account lists small enough for the four-transaction bundle. This is not a byte-for-byte recreation of the investigated wrapper transaction.
- No mayhem, cashback, holder rewards, creator transfers, fee-sharing reassignments, sell automation, migration automation or Axiom history manipulation.
- Creator authorization is an additional application requirement. A validated, server-configured creator key signs a detached authorization message; the server verifies it before preparing a bundle. Only configured creator wallets are allowed, even if a client supplies a signature for some other wallet. Pump does not itself require the separate creator to sign the creation transaction.
- Creator fees follow Pump's current schedule. Selecting another authorized creator can direct those fees to that creator; it does not transfer control of their wallet.
- Each buy is exact-token-output with a maximum SOL cost. Sequential curve state is advanced between quotes; the full signed bundle is simulated before submission.
- Total initial buy inputs are limited to 50 SOL; graduation during the initial bundle is deliberately rejected. Tip is limited to 0.1 SOL; slippage to 10%.
- A new mint is generated locally. No vanity-address grinding is included.

## Local development

Requires Node 22+ (Docker uses Node 24).

```sh
npm ci --ignore-scripts
npm test
npm run build
# Set environment variables in your shell; do not commit secrets.
npm start
```

For local HTTP only, omit `NODE_ENV=production`. Production uses `Secure`, `HttpOnly`, `SameSite=Strict` cookies. There are no CDN scripts, analytics or public generic RPC endpoints. Protect the GitHub repository and Railway account as carefully as the app password; anyone able to change the frontend can change code used for browser signing.

## Validation status

Automated tests cover password protection, fail-closed configuration, session expiry/logout, CSRF/origin checks, login throttling, creator key derivation, fail-closed creator configuration, server allowlist enforcement, secret non-disclosure, session/replay checks, exact integer amount parsing, transaction-message integrity, transaction signatures, four-transaction construction with the official SDK and simulation-result validation. The SDK construction test uses a captured **public mainnet Global account**; no private keys or user credentials are included.

No token has been launched and no funds have been spent to validate this release. A funded mainnet end-to-end bundle has not been executed. Provider-specific simulation compatibility and actual execution must pass the app's mandatory simulation before launch.

See [SECURITY.md](SECURITY.md) for authentication/dependency limitations.

## Sources

- [Pump public documentation](https://github.com/pump-fun/pump-public-docs)
- [Official Pump SDK](https://www.npmjs.com/package/@pump-fun/pump-sdk)
- [Jito bundle API and limitations](https://docs.jito.wtf/lowlatencytxnsend/)
- [QuickNode simulateBundle](https://www.quicknode.com/docs/solana/simulateBundle)
