import { chromium, devices } from '@playwright/test';
import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'ui-progress');
const stamp = new Date().toISOString().replaceAll(':', '-');
const archive = resolve(output, stamp);
await mkdir(archive, { recursive: true });
const browser = await chromium.launch();
const errors = [];
for (const [name, options] of [
  ['desktop', { viewport: { width: 1440, height: 1000 } }],
  ['mobile', { ...devices['iPhone 13'], defaultBrowserType: undefined }],
]) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(`${name}: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`${name}: ${message.text()}`); });
  for (const [screen, path] of [['home', '/'], ['lab', '/__lab']]) {
    await page.goto(`http://127.0.0.1:5173${path}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const filename = `${name}-${screen}.png`;
    await page.screenshot({ path: resolve(archive, filename), fullPage: true });
    await copyFile(resolve(archive, filename), resolve(output, `latest-${filename}`));
  }
  await context.close();
}
await browser.close();
await writeFile(resolve(archive, 'console-errors.json'), JSON.stringify(errors, null, 2));
await writeFile(resolve(output, 'latest.json'), JSON.stringify({ captured: stamp, archive, errors }, null, 2));
console.log(`Updated screenshots: ${output}; console errors: ${errors.length}`);
if (errors.length) console.log(errors.join('\n'));
