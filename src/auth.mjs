import { randomBytes, createHash, scryptSync, timingSafeEqual } from 'node:crypto';

export function createAuth({ password = '', production = false, now = Date.now } = {}) {
  const ready = password.length >= 12 && password.length <= 256;
  const salt = randomBytes(32);
  const digest = ready ? scryptSync(password, salt, 32) : null;
  const sessions = new Map();
  const attempts = new Map();
  const hash = value => createHash('sha256').update(value).digest('hex');
  const sweep = () => {
    for (const [key, value] of sessions) if (value.expires <= now()) sessions.delete(key);
    for (const [key, value] of attempts) if (value.until <= now()) attempts.delete(key);
  };
  const timer = setInterval(sweep, 60_000); timer.unref();
  const cookieName = production ? '__Host-launcher' : 'launcher';
  const cookie = (token, age = 3600) => `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${production ? '; Secure' : ''}`;
  const tokenFrom = req => {
    const part = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(`${cookieName}=`));
    return part?.slice(cookieName.length + 1) || '';
  };
  return {
    ready, cookie,
    login(value, ip) {
      sweep();
      if (!ready) return { status: 503, error: 'Set APP_PASSWORD to a unique password of 12–256 characters in Railway, then redeploy.' };
      // Global and per-client budgets prevent forwarded-header rotation from defeating limits.
      for (const key of ['global', `ip:${ip}`]) {
        const a = attempts.get(key);
        if (a && a.count >= (key === 'global' ? 60 : 10)) return { status: 429, error: 'Too many login attempts. Try again in 15 minutes.' };
      }
      for (const key of ['global', `ip:${ip}`]) {
        const a = attempts.get(key) || { count: 0, until: now() + 900_000 }; a.count++; attempts.set(key, a);
      }
      if (typeof value !== 'string' || value.length > 256 || !timingSafeEqual(scryptSync(value, salt, 32), digest)) return { status: 401, error: 'Incorrect password.' };
      if (sessions.size >= 100) sessions.delete(sessions.keys().next().value);
      const token = randomBytes(32).toString('base64url');
      const session = { id: hash(token), csrf: randomBytes(32).toString('base64url'), expires: now() + 3_600_000 };
      sessions.set(session.id, session); attempts.delete(`ip:${ip}`);
      return { status: 200, token, session };
    },
    session(req) {
      const token = tokenFrom(req);
      if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
      const session = sessions.get(hash(token));
      return session && session.expires > now() ? session : null;
    },
    logout(req) { sessions.delete(hash(tokenFrom(req))); },
    close() { clearInterval(timer); sessions.clear(); },
  };
}
