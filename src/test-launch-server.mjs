import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './server.mjs';
import { runDiagnostics } from './diagnostics.mjs';

export const createTestLaunchApp = (env = process.env, chain, storage) => createApp(env, chain, storage, { testLaunchOnly: true });
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = createTestLaunchApp();
  console.log(JSON.stringify({ event: 'creator-wallet-configuration', ...app.locals.creatorConfiguration() }));
  app.listen(Number(process.env.PORT || 3000), '0.0.0.0', () => console.log('Owned-wallet research launcher 2.1 listening. No automatic launches.'));
  runDiagnostics(process.env).then(report => { app.locals.readiness = report; console.log(JSON.stringify({ event: 'startup-diagnostics', ...report })); })
    .catch(() => console.log('Read-only startup diagnostics did not finish.'));
}
