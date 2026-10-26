# Security notes

## Password gate

`APP_PASSWORD` is server-only and never embedded in the frontend. Password verification uses scrypt and a constant-time digest comparison. Random, opaque one-hour sessions are kept in memory. Production cookies are Secure/HttpOnly/SameSite=Strict with a `__Host-` prefix. State-changing routes require same-origin requests, a custom header and (after login) a session-bound CSRF token. Login is limited per client and globally. Only the login assets and health endpoint are public. A public Railway domain does not make the workspace publicly accessible without its password.

Use a unique, strong password. A shared password identifies possession of that password, not a specific person. Do not share it if the workspace is only for you. One replica is required for the in-memory session/rate-limit store. Restarts reset rate-limit counters and revoke sessions.

## Wallet authorization and submission

Creator proof is a detached Ed25519 signature on a nonce with an expiry, origin, selected creator, new mint and hash of the launch settings. It is session-bound and single-use. A launch cannot be prepared without it. Transaction submission accepts only the exact transaction messages prepared in that session, with all required signatures valid. Full bundle simulation is required, followed by an explicit confirmation of the exact mint. Unknown send outcomes are never automatically retried.

Private keys are processed only in the browser. They are not sent in requests, persisted in localStorage or included in logs. JavaScript cannot guarantee physical memory erasure; closing the tab discards app references. Prefer hardware/extension signing or dedicated low-balance launch wallets. The app does not implement encrypted long-term key storage.

## Dependencies

Dependencies are pinned in package-lock.json. Installation uses `--ignore-scripts`; the SDK's legacy bigint-buffer dependency therefore uses its pure-JavaScript fallback rather than compiling its vulnerable native binding. Do not enable native bindings without reassessing that dependency.

The official Pump/Solana dependency graph still contains npm advisories, including legacy bigint-buffer, Anchor's TOML parser and Jayson JSON-stream/UUID dependencies. The app does not accept TOML, run a Jayson server, or expose those parsing interfaces. This reduces exposure but is not a claim that the dependency tree is vulnerability-free. The directly used bn.js dependency is pinned to a patched version. Avoid npm audit's suggested protocol-breaking downgrades; upgrade and retest against maintained SDK releases instead. Keep launch disabled until provider configuration and bundle simulation are verified.

No platform can hide a submitted mainnet launch or its wallet relationships from public blockchain analysis. This workspace does not alter or guarantee any third-party creator-history display.
