import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const address = new URL(process.argv[2] || 'http://127.0.0.1:8787');
if (!['http:', 'https:'].includes(address.protocol) || address.username || address.password) {
  throw new Error('Supply an HTTP(S) application URL without credentials.');
}
const child = spawn(
  process.execPath,
  [
    require.resolve('@playwright/test/cli'),
    'test',
    'tests/e2e/pwa.spec.ts',
    '--project=chromium',
    '--grep=production service worker',
    '--output=test-results/pwa-production',
    '--reporter=list',
  ],
  {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, PWA_BASE_URL: address.origin },
  },
);
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
