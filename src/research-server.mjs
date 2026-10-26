import express from 'express';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createAuth } from './auth.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = '2.0.0';
export function createResearchApp(env = process.env) {
  const app = express();
  app.disable('x-powered-by'); app.set('trust proxy', 1);
  const auth = createAuth({ password: env.APP_PASSWORD, production: env.NODE_ENV === 'production' });
  const origin = req => env.APP_ORIGIN || (env.RAILWAY_PUBLIC_DOMAIN ? 'https://' + env.RAILWAY_PUBLIC_DOMAIN : req.protocol + '://' + req.get('host'));
  app.use((req, res, next) => {
    res.set({
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
    });
    if (env.NODE_ENV === 'production') res.set('Strict-Transport-Security', 'max-age=31536000');
    if (!['GET', 'HEAD'].includes(req.method) && (req.get('origin') !== origin(req) || req.get('x-requested-with') !== 'launcher')) return res.status(403).json({ error: 'Request origin rejected.' });
    next();
  });
  app.use(express.json({ limit: '2kb', strict: true }));
  app.get('/healthz', (_req, res) => res.json({ status: 'ok', mode: 'offline-research', version }));
  app.get('/login', (_req, res) => res.sendFile(path.join(root, 'web/research-login.html')));
  app.get('/style.css', (_req, res) => res.sendFile(path.join(root, 'web/research.css')));
  app.get('/research.css', (_req, res) => res.sendFile(path.join(root, 'web/research.css')));
  app.get('/login.js', (_req, res) => res.sendFile(path.join(root, 'web/login.js')));
  app.post('/auth/login', (req, res) => {
    const result = auth.login(req.body?.password, req.ip);
    if (result.status !== 200) return res.status(result.status).json({ error: result.error });
    auth.logout(req);
    res.set('Set-Cookie', auth.cookie(result.token)).json({ ok: true });
  });
  app.use((req, res, next) => {
    const api = req.path.startsWith('/api/') || req.path.startsWith('/auth/');
    if (!auth.ready) return api ? res.status(503).json({ error: 'APP_PASSWORD is not configured. Access is locked.' }) : res.redirect('/login');
    const session = auth.session(req);
    if (!session) return api ? res.status(401).json({ error: 'Please log in.' }) : res.redirect('/login');
    req.session = session;
    if (!['GET', 'HEAD'].includes(req.method) && req.get('x-csrf-token') !== session.csrf) return res.status(403).json({ error: 'Session verification failed. Log in again.' });
    next();
  });
  app.get('/', (_req, res) => res.sendFile(path.join(root, 'web/research.html')));
  app.get('/research.js', (_req, res) => res.sendFile(path.join(root, 'dist/research.js')));
  app.get('/api/session', (req, res) => res.json({ csrf: req.session.csrf, expires: req.session.expires, mode: 'offline-research', version, launchEnabled: false }));
  app.get('/api/readiness', (_req, res) => res.json({ ready: true, mode: 'offline-research', network: 'none', version }));
  app.post('/auth/logout', (req, res) => { auth.logout(req); res.set('Set-Cookie', auth.cookie('', 0)).json({ ok: true }); });
  for (const route of ['authorize', 'prepare', 'simulate', 'submit', 'upload-metadata']) {
    app.post('/api/' + route, (_req, res) => res.status(410).json({ error: 'This version is an offline research demo. Transaction and upload endpoints are unavailable.' }));
  }
  app.use((_req, res) => res.status(404).json({ error: 'Not found.' }));
  app.use((error, _req, res, _next) => res.status(error.status === 413 ? 413 : 400).json({ error: error.status === 413 ? 'Request is too large.' : 'Invalid request.' }));
  app.locals.close = () => auth.close();
  return app;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = createResearchApp();
  app.listen(Number(process.env.PORT || 3000), '0.0.0.0', () => console.log('Attribution Research 2.0 listening; offline simulation only.'));
}
