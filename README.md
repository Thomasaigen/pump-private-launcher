# Pump Private Launcher

A private, password-gated Pump.fun launch workspace for your own wallets. The app prepares a four-transaction Jito bundle: token creation and developer buy, followed by three buyer transactions. Any wallet you control can be used; app access is independent of wallet addresses.

## Railway setup

Open the `launcher` service → **Variables**. Set:

| Variable | Value / purpose |
| --- | --- |
| `APP_PASSWORD` | Your own unique password, 12–256 characters. Required for access. Never commit it. |
| `SOLANA_RPC_URL` | An HTTPS Solana mainnet RPC endpoint. |
| `BUNDLE_SIMULATION_RPC_URL` | An HTTPS RPC endpoint supporting Jito-Solana `simulateBundle`, such as QuickNode with the Lil' JIT add-on. A standard Solana endpoint alone is insufficient. |
| `ENABLE_LAUNCH` | Initially `false`. Set to `true` when ready to submit reviewed, successfully simulated bundles. |
| `JITO_BLOCK_ENGINE_URL` | Defaults to `https://amsterdam.mainnet.block-engine.jito.wtf/api/v1/bundles`. |
| `JITO_AUTH_UUID` | Optional Jito authentication credential, if your provider requires one. |
| `APP_ORIGIN` | Optional exact HTTPS origin. Railway's `RAILWAY_PUBLIC_DOMAIN` is used automatically; set this for a custom domain. |

Apply the variables and redeploy. If `APP_PASSWORD` is missing or too short, the login page remains available but **all app/API access stays locked**. There is no default password and no first-visitor setup flow. Changing the password and redeploying invalidates all sessions.

Keep one replica. Sessions, creator-authorization challenges and pending bundles are memory-only. A restart logs you out and removes pending bundle tracking. Export/copy transaction signatures before leaving the page; on-chain transactions are unaffected by a restart. Successful login lasts one hour.

## Using the app

1. Log in with `APP_PASSWORD`.
2. Enter the token name, symbol and a public HTTPS/IPFS metadata JSON URI. Host the metadata/image beforehand; this app does not upload metadata.
3. Select a developer wallet and three distinct buyer wallets. Connect Phantom/Solflare, or load standard Solana 64-byte keypair JSON files **locally in the browser**. No private key is sent to the server or saved to browser storage. Use dedicated launch wallets. Reload/lock to discard the tab's references to keys.
4. Leave “Developer wallet is also the creator” checked, or select a separate creator wallet. The selected creator must sign an authorization message bound to the token mint, launcher, metadata and settings. The app does not support assigning an unrelated wallet without its approval.
5. Fund every wallet in advance. Each pays its own buy, transaction fee and account rent. Buyer 3 also pays the Jito tip. This app does not transfer funding between wallets.
6. Prepare the bundle, then review the mint, creator, per-wallet cost limits, rent allowances and tip recipient.
7. Sign and simulate. When several roles use one wallet extension, switch the extension to each requested account and press **Sign & simulate bundle** again; signatures already collected are retained. If the blockhash expires, prepare a fresh bundle.
8. After all four transactions pass stateful bundle simulation, check the mainnet approval box and submit within 30 seconds. The server checks the blockhash and refuses modified/unsigned messages. A Jito bundle ID means receipt, **not** on-chain confirmation. Refresh status to verify every signature is confirmed/finalized and has no error.

No automatic submission or retry occurs. If a send times out, check the displayed transaction signatures before attempting anything else. Jito bundles can be affected by uncled blocks and rebroadcasting; all-or-nothing execution is not an unconditional guarantee across those scenarios. The tip is part of the final buy transaction, not a standalone transaction.

## Protocol scope

- Solana mainnet; standard SOL-paired Pump creation (`create_v2`) and Token-2022 base mint.
- Current official Pump SDK `4.3.1`; `buy_v3` trades keep account lists small enough for the four-transaction bundle. This is not a byte-for-byte recreation of the investigated wrapper transaction.
- No mayhem, cashback, holder rewards, creator transfers, fee-sharing reassignments, sell automation, migration automation or Axiom history manipulation.
- Creator authorization is an additional application requirement. It is verified on the server even though Pump's creation instruction does not itself require the creator to sign.
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

Automated tests cover password protection, fail-closed configuration, session expiry/logout, CSRF/origin checks, login throttling, creator signature/replay checks, exact integer amount parsing, transaction-message integrity, transaction signatures, four-transaction construction with the official SDK and simulation-result validation. The SDK construction test uses a captured **public mainnet Global account**; no private keys or user credentials are included.

No token has been launched and no funds have been spent to validate this release. A funded mainnet end-to-end bundle has not been executed. Provider-specific simulation compatibility and actual execution must pass the app's mandatory simulation before launch.

See [SECURITY.md](SECURITY.md) for authentication/dependency limitations.

## Sources

- [Pump public documentation](https://github.com/pump-fun/pump-public-docs)
- [Official Pump SDK](https://www.npmjs.com/package/@pump-fun/pump-sdk)
- [Jito bundle API and limitations](https://docs.jito.wtf/lowlatencytxnsend/)
- [QuickNode simulateBundle](https://www.quicknode.com/docs/solana/simulateBundle)
