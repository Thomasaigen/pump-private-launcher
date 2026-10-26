# Security · Research Test Launcher 2.1

- The default entrypoint can submit real mainnet transactions only after explicit user confirmation, a complete signed simulation and ENABLE_LAUNCH=true.
- Creator public addresses alone are rejected. A valid configured key must authorize the exact settings in a session-bound, single-use message. The signature is not exported as a general-purpose signing service.
- Launcher and buyer keys entered in the browser remain in memory. Private-key inputs have no form names and are cleared after import. Signing is local; the backend receives only public settings and signed transactions. JavaScript cannot guarantee secure memory erasure.
- The server checks every transaction signature and the exact prepared message before simulation and submission. Client edits cannot replace recipients, amounts, mint, creator or instructions.
- Research metadata is bound to the session, token details and wallet identities. The visible token name must begin with [TEST]. Research spend limits are enforced server-side.
- Simulation failure, expired simulation, invalid confirmation, disabled launch or an invalid network blocks submission. Unknown submission outcomes are not automatically retried.
- APP_PASSWORD accepts 5–256 characters and fails closed. scrypt and timing-safe comparisons protect password verification. Sessions and rate limits are in memory.
- Cookies are HttpOnly and SameSite=Strict. Production adds Secure and the __Host- prefix. Origin and CSRF checks protect authenticated mutations.
- Responses use restrictive CSP, no-store, no-referrer and frame protections. No analytics or external browser scripts are used.
- Secrets, provider URLs, request bodies and cookies must not be logged. Startup diagnostics export sanitized results only.
- Axiom JSON comparison happens locally and treats pasted data as unverified evidence. Dynamic content is rendered as text.
- /research remains an illustrative offline model, separate from the real launch interface. Neither page can verify Axiom's private backend logic.
- No migration, creator-transfer or history-editing operation is exposed.
- Use one replica. Restarts clear sessions, metadata bindings and pending bundles.

Automated provider tests use mocks and generated keys. Passing them is not evidence that a funded launch has landed or that Axiom has indexed it.
