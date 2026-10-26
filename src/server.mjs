import express from 'express';
import { randomBytes, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import bs58 from 'bs58';
import { createAuth } from './auth.mjs';
import { address, validateSpec, verifyAuthorization, verifySignedTransactions, fail } from './validation.mjs';
import { createChain } from './chain.mjs';
import { runDiagnostics } from './diagnostics.mjs';
import { createCreatorWallets } from './creator-wallets.mjs';
import { createStorage, IMAGE_TYPES, MAX_IMAGE_BYTES } from './storage.mjs';
import { validateTestSpec, requireTestName } from './test-launch-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function createApp(env = process.env, injectedChain, injectedStorage, { testLaunchOnly = false } = {}) {
  const app = express(); app.disable('x-powered-by'); app.set('trust proxy', 1);
  const auth = createAuth({ password: env.APP_PASSWORD, production: env.NODE_ENV === 'production' });
  const chain = injectedChain || createChain(env);
  const creators = createCreatorWallets(env);
  const storage = injectedStorage || createStorage(env);
  const challenges = new Map(), bundles = new Map(), uploads = new Map();
  const now = Date.now;
  const cleanup = setInterval(() => { for (const map of [challenges, bundles, uploads]) for (const [id, row] of map) if (row.expires < now()) map.delete(id); }, 60000); cleanup.unref();
  const origin = req => env.APP_ORIGIN || (env.RAILWAY_PUBLIC_DOMAIN ? `https://${env.RAILWAY_PUBLIC_DOMAIN}` : `${req.protocol}://${req.get('host')}`);
  app.use((req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()', 'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'" });
    if (env.NODE_ENV === 'production') res.set('Strict-Transport-Security', 'max-age=31536000');
    if (!['GET', 'HEAD'].includes(req.method) && (req.get('origin') !== origin(req) || req.get('x-requested-with') !== 'launcher')) return res.status(403).json({ error: 'Request origin rejected.' });
    next();
  });
  app.use(express.json({ limit: '20kb', strict: true }));
  app.get('/healthz', (_req, res) => res.json({ status: 'ok', ...(testLaunchOnly ? { mode: 'owned-wallet-test-launch', version: '2.1.0' } : {}) }));
  app.get('/login', (_req, res) => res.sendFile(path.join(root, 'web/login.html')));
  app.get('/style.css', (_req, res) => res.sendFile(path.join(root, 'web/style.css')));
  app.get('/login.js', (_req, res) => res.sendFile(path.join(root, 'web/login.js')));
  app.post('/auth/login', (req, res) => {
    const result = auth.login(req.body?.password, req.ip);
    if (result.status !== 200) return res.status(result.status).json({ error: result.error });
    auth.logout(req);
    res.set('Set-Cookie', auth.cookie(result.token)); res.json({ ok: true });
  });
  app.use((req, res, next) => {
    if (!auth.ready) {
      if (req.path.startsWith('/api/') || req.path.startsWith('/auth/')) return res.status(503).json({ error: 'APP_PASSWORD is not configured. Access is locked.' });
      return res.redirect('/login');
    }
    const session = auth.session(req);
    if (!session) {
      if (req.path.startsWith('/api/') || req.path.startsWith('/auth/')) return res.status(401).json({ error: 'Please log in.' });
      return res.redirect('/login');
    }
    req.session = session;
    if (!['GET', 'HEAD'].includes(req.method) && req.get('x-csrf-token') !== session.csrf) return res.status(403).json({ error: 'Session verification failed. Log in again.' });
    next();
  });
  app.post('/auth/logout', (req, res) => { auth.logout(req); res.set('Set-Cookie', auth.cookie('', 0)); res.json({ ok: true }); });
  app.get('/api/session', (req, res) => res.json({ csrf: req.session.csrf, expires: req.session.expires, launchEnabled: chain.enabled, rpcConfigured: chain.configured, simulationConfigured: chain.simulationConfigured, creators: creators.describe(), uploadsConfigured: storage.configured, testLaunchOnly }));
  app.get('/api/readiness', (_req, res) => res.json({ ...(app.locals.readiness || { pending: true }), creators: creators.describe() }));
  app.get('/', (_req, res) => res.sendFile(path.join(root, 'web/index.html')));
  app.get('/app.js', (_req, res) => res.sendFile(path.join(root, 'dist/app.js')));
  app.get('/research', (_req, res) => res.sendFile(path.join(root, 'web/research.html')));
  app.get('/research.js', (_req, res) => res.sendFile(path.join(root, 'dist/research.js')));
  app.get('/research.css', (_req, res) => res.sendFile(path.join(root, 'web/research.css')));
  app.post('/api/upload-metadata', express.raw({ type: IMAGE_TYPES, limit: MAX_IMAGE_BYTES }), async (req, res) => {
    const text = (v, max, label, optional) => {
      const value = typeof v === 'string' ? v.trim() : '';
      if ((!value && !optional) || Buffer.byteLength(value) > max || /[\u0000-\u001f]/.test(value)) fail(`Invalid ${label}.`);
      return value;
    };
    const name = text(req.query.name, 32, 'name'), symbol = text(req.query.symbol, 10, 'symbol'), description = text(req.query.description, 500, 'description', true);
    let roles, finalDescription = description;
    if (testLaunchOnly) {
      requireTestName(name);
      roles = { dev: address(req.query.launcher), creator: address(req.query.creator) };
      creators.requireWallet(roles.creator);
      if (uploads.size >= 200) fail('Too many recent uploads. Wait for old uploads to expire.', 429);
      finalDescription = `Research test token for observing launch attribution. Launcher: ${roles.dev}. Creator fee wallet: ${roles.creator}. ${description}`;
    }
    const result = await storage.uploadToken({ image: Buffer.isBuffer(req.body) ? req.body : null, contentType: req.get('content-type')?.split(';')[0], name, symbol, description: finalDescription });
    if (testLaunchOnly) uploads.set(req.session.id + ':' + result.uri, { ...roles, name, symbol, expires: now() + 3600000 });
    res.json(result);
  });
  app.post('/api/authorize', (req, res) => {
    const spec = testLaunchOnly ? validateTestSpec(req.body) : validateSpec(req.body);
    creators.requireWallet(spec.creator);
    if (testLaunchOnly) {
      const uploaded = uploads.get(req.session.id + ':' + spec.uri);
      if (!uploaded || uploaded.expires < now() || ['dev', 'creator', 'name', 'symbol'].some(key => uploaded[key] !== spec[key])) fail('Upload research metadata for these exact wallets and token details in this session first.', 403);
    }
    if (challenges.size >= 200) fail('Too many pending authorizations. Wait for them to expire.', 429);
    const id = randomBytes(24).toString('hex'), expires = now() + 600000;
    const message = `Pump Private Launcher — creator authorization\nOrigin: ${origin(req)}\nThis is a message signature, not a transaction.\nI authorize this app to record my wallet as creator of the following token.\nMint: ${spec.mint}\nCreator: ${spec.creator}\nLauncher: ${spec.dev}\nName: ${spec.name}\nSymbol: ${spec.symbol}\nMetadata: ${spec.uri}\nSettings SHA-256: ${createHash('sha256').update(JSON.stringify(spec)).digest('hex')}\nExpires: ${new Date(expires).toISOString()}\nNonce: ${id}`;
    challenges.set(id, { session: req.session.id, spec, message, expires, used: false });
    res.json({ id, message, expires, spec });
  });
  app.post('/api/prepare', async (req, res) => {
    const challenge = challenges.get(req.body?.id);
    if (!challenge || challenge.session !== req.session.id || challenge.expires < now() || challenge.used) fail('Authorization expired or already used. Start again.', 403);
    // Only a key configured on the server can authorize a creator. Never accept a
    // client-supplied approval or expose a general-purpose signing endpoint.
    const signature = creators.signAuthorization(challenge.spec.creator, challenge.message);
    if (!verifyAuthorization(challenge.message, signature, challenge.spec.creator)) fail('Creator authorization failed.', 403);
    challenge.used = true;
    if (bundles.size >= 100) fail('Too many prepared bundles. Wait for them to expire.', 429);
    const prepared = { ...await chain.prepare(challenge.spec), launcher: challenge.spec.dev, creator: challenge.spec.creator };
    const id = randomBytes(24).toString('hex');
    bundles.set(id, { ...prepared, session: req.session.id, expires: now() + 600000, state: 'prepared', signed: null });
    res.json({ id, ...prepared });
  });
  const ownBundle = req => {
    const b = bundles.get(req.body?.id || req.params.id);
    if (!b || b.session !== req.session.id || b.expires < now()) fail('Bundle not found or expired.', 404);
    return b;
  };
  app.post('/api/simulate', async (req, res) => {
    const b = ownBundle(req);
    if (!['prepared', 'simulated'].includes(b.state)) fail('This bundle has already been submitted or is busy.', 409);
    verifySignedTransactions(b.transactions, req.body.transactions);
    b.state = 'simulating';
    try {
      const simulation = await chain.simulate(req.body.transactions);
      b.signed = [...req.body.transactions]; b.state = 'simulated'; b.simulatedAt = now();
      res.json(simulation);
    } catch (e) { b.state = 'prepared'; b.signed = null; throw e; }
  });
  app.post('/api/submit', async (req, res) => {
    const b = ownBundle(req);
    if (b.state === 'submitted') return res.json({ bundleId: b.bundleId, signatures: b.signatures, mint: b.mint });
    if (b.state !== 'simulated' || now() - b.simulatedAt > 30000) fail('A successful simulation within the last 30 seconds is required.', 409);
    if (req.body.confirmMint !== b.mint) fail('Confirm the exact mint address before launching.');
    if (!chain.enabled) fail('Launch is disabled in Railway.', 403);
    const txs = verifySignedTransactions(b.transactions, b.signed);
    b.signatures = txs.map(tx => bs58.encode(tx.signatures[0]));
    b.state = 'sending';
    try {
      b.bundleId = await chain.submit(b.signed, b.lastValidBlockHeight); b.state = 'submitted'; b.expires = now() + 3600000;
      res.json({ bundleId: b.bundleId, signatures: b.signatures, mint: b.mint });
    } catch (e) {
      b.state = 'submission-unknown';
      // Never automatically retry a send whose response might have been lost.
      res.status(502).json({ error: 'Submission was not confirmed. Do not retry blindly; inspect these signatures on Solscan first.', signatures: b.signatures, state: b.state });
    }
  });
  app.get('/api/status/:id', async (req, res) => { const b = ownBundle(req); if (!b.bundleId) fail('No Jito bundle ID is available. Check the transaction signatures.'); res.json(await chain.status(b.bundleId, b.signatures)); });
  app.use((_req, res) => res.status(404).json({ error: 'Not found.' }));
  app.use((error, _req, res, _next) => {
    // Never log request bodies, cookies, credentials or provider URLs.
    const status = error.status || 500;
    res.status(status).json({ error: error.status ? error.message : 'Operation failed. Check provider configuration, balances and current protocol support, then prepare again.' });
  });
  app.locals.creatorConfiguration = () => { const { ready, error, wallets } = creators.describe(); return { ready, error, count: wallets.length }; };
  app.locals.close = () => { clearInterval(cleanup); auth.close(); creators.close(); challenges.clear(); bundles.clear(); uploads.clear(); };
  return app;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = createApp();
  console.log(JSON.stringify({ event: 'creator-wallet-configuration', ...app.locals.creatorConfiguration() }));
  app.listen(Number(process.env.PORT || 3000), '0.0.0.0', () => console.log('Private launcher listening.'));
  runDiagnostics(process.env).then(report => {
    app.locals.readiness = report;
    console.log(JSON.stringify({ event: 'startup-diagnostics', ...report }));
  }).catch(() => console.log('Startup diagnostics could not finish. No transactions were submitted.'));
}
