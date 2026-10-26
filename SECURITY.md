# Security notes

## Password gate

`APP_PASSWORD` is server-only and never embedded in the frontend. Password verification uses scrypt and a constant-time digest comparison. Random, opaque one-hour sessions are kept in memory. Production cookies are Secure/HttpOnly/SameSite=Strict with a `__Host-` prefix. State-changing routes require same-origin requests, a custom header and (after login) a session-bound CSRF token. Login is limited per client and globally. Only the login assets and health endpoint are public. A public Railway domain does not make the workspace publicly accessible without its password.

Use a unique, strong password. A shared password identifies possession of that password, not a specific person. Do not share it if the workspace is only for you. One replica is required for the in-memory session/rate-limit store. Restarts reset rate-limit counters and revoke sessions.

## Wallet authorization and submission

Creator wallets are loaded from `CREATOR_PRIVATE_KEY_1` through `_50` at process startup. Each keypair is validated for public/private consistency and its public address is derived from the secret key. Public addresses alone, mismatched keypairs and duplicate wallets are rejected. Any malformed configured key disables all creator selection. Both the UI and the server restrict creators to this list; only the server is authoritative.

Creator proof is a detached Ed25519 signature on a nonce with an expiry, origin, selected creator, new mint and hash of the launch settings. It is session-bound and single-use. The server signs and verifies that exact message with the configured creator key; no raw-message or transaction-signing API is exposed. Client-supplied creator signatures cannot add an unconfigured address. A launch cannot be prepared without this proof. The creator key never signs or submits a blockchain transaction in its creator role. Transaction submission accepts only the exact transaction messages prepared in that session, with all required signatures valid. Full bundle simulation is required, followed by an explicit confirmation of the exact mint. Unknown send outcomes are never automatically retried.

Developer and buyer private keys are processed only in the browser. They are not sent in requests, persisted in localStorage or included in logs. Creator private keys are intentionally stored as Railway environment secrets and loaded into server memory. Only their derived public addresses and optional labels are returned to authenticated sessions. Do not share Railway access, add secrets to GitHub, enable environment/request-body dumps, or put secrets in display labels. Anyone who can change the server code or inspect its process can access configured creator keys; use dedicated wallets and sealed Railway variables where available. The app does not provide its own encrypted key vault.

JavaScript cannot guarantee physical memory erasure. Closing the browser discards local trading-key references; it does not delete creator keys stored in Railway. Remove the corresponding Railway variables and redeploy to revoke a configured creator wallet. A restart discards pending authorizations and sessions.

## Dependencies

Dependencies are pinned in package-lock.json. Installation uses `--ignore-scripts`; the SDK's legacy bigint-buffer dependency therefore uses its pure-JavaScript fallback rather than compiling its vulnerable native binding. Do not enable native bindings without reassessing that dependency.

The official Pump/Solana dependency graph still contains npm advisories, including legacy bigint-buffer, Anchor's TOML parser and Jayson JSON-stream/UUID dependencies. The app does not accept TOML, run a Jayson server, or expose those parsing interfaces. This reduces exposure but is not a claim that the dependency tree is vulnerability-free. The directly used bn.js dependency is pinned to a patched version. Avoid npm audit's suggested protocol-breaking downgrades; upgrade and retest against maintained SDK releases instead. Keep launch disabled until provider configuration and bundle simulation are verified.

No platform can hide a submitted mainnet launch or its wallet relationships from public blockchain analysis. This workspace does not alter or guarantee any third-party creator-history display.
