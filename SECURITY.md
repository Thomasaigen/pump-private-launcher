# Security · Research version 2

This service is a password-protected offline attribution demonstration.

- APP_PASSWORD must contain 5–256 characters. Missing or invalid configuration locks access.
- Passwords are hashed with scrypt and compared with timingSafeEqual. Session tokens use cryptographic randomness and are stored as hashes in memory.
- Production cookies are Secure, HttpOnly, SameSite=Strict and use the __Host- prefix.
- Origin checks and a session-bound CSRF token protect authenticated mutations.
- Login attempts are rate-limited globally and per client.
- Pages use a restrictive same-origin CSP and no analytics or external scripts.
- Wallet names and optional public-address labels remain only in the current tab. The server does not receive those fields.
- This server does not import the earlier chain, creator-wallet or storage modules. It never reads private-key, Solana RPC, Jito or upload credentials.
- Retired transaction and upload endpoints return 410 after authentication. ENABLE_LAUNCH does not restore them.
- The earlier source files are retained for provenance but are not the current application entrypoint.
- Preserve the private GitHub repository and Railway access controls. The application password does not secure the hosting or source-control accounts.
- One-hour sessions and rate-limit state are memory-only; deployments clear them. Keep one replica.
- Simulation output is not evidence of live ownership, current Pump program execution, or Axiom's current backend indexing.

This version is not a wallet, token launch service, or live blockchain test.
