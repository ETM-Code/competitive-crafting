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
const measurements = [];
const viewports = [
  ['desktop', { viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 }],
  [
    'mobile',
    {
      ...devices['iPhone 13'],
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1,
      defaultBrowserType: undefined,
    },
  ],
  [
    'android',
    {
      ...devices['Pixel 7'],
      viewport: { width: 412, height: 915 },
      deviceScaleFactor: 1,
      defaultBrowserType: undefined,
    },
  ],
];
for (const [name, options] of viewports) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(`${name}: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${name}: ${message.text()}`);
  });
  for (const [screen, path] of [
    ['home', '/'],
    ['lab', '/__lab'],
  ]) {
    await page.goto(`http://127.0.0.1:5173${path}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    // Capture a representative settled frame, not the first invisible frame of an entry animation.
    await page.waitForTimeout(700);
    const dimensions = await page.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      documentHeight: document.documentElement.scrollHeight,
    }));
    measurements.push({ device: name, screen, ...dimensions });
    const filename = `${name}-${screen}.png`;
    await page.screenshot({ path: resolve(archive, filename), fullPage: false, scale: 'css' });
    await copyFile(resolve(archive, filename), resolve(output, `latest-${filename}`));
    const full = `${name}-${screen}-full.png`;
    await page.screenshot({ path: resolve(archive, full), fullPage: true, scale: 'css' });
    await copyFile(resolve(archive, full), resolve(output, `latest-${full}`));
    if (screen === 'home') {
      await page.locator('.site-footer').scrollIntoViewIfNeeded();
      const footer = `${name}-footer.png`;
      await page.screenshot({ path: resolve(archive, footer), scale: 'css' });
      await copyFile(resolve(archive, footer), resolve(output, `latest-${footer}`));
    }
  }
  await context.close();
}
await browser.close();
await writeFile(resolve(archive, 'console-errors.json'), JSON.stringify(errors, null, 2));
await writeFile(
  resolve(output, 'latest.json'),
  JSON.stringify({ captured: stamp, archive, measurements, errors }, null, 2),
);
console.log(`Updated viewport-sized screenshots: ${output}; console errors: ${errors.length}`);
console.log(JSON.stringify(measurements, null, 2));
if (errors.length) console.log(errors.join('\n'));
