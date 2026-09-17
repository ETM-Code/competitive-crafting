import { chromium, webkit } from '@playwright/test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'ui-progress');
const argumentsList = process.argv.slice(2);
if (argumentsList.includes('--help')) {
  console.log(
    'Usage: node scripts/record-progress.mjs [--browser=chromium|webkit] [--device=desktop|mobile|both] [--seconds=4..20]\nRecords the local Vite app at http://127.0.0.1:5173 only. Both is the default; seconds is home-panorama duration (default 8).',
  );
  process.exit(0);
}
const options = Object.fromEntries(
  argumentsList.map((argument) => argument.replace(/^--/, '').split('=')),
);
const browserName = options.browser || 'chromium';
const device = options.device || 'both';
const seconds = Number(options.seconds || 8);
if (
  !['chromium', 'webkit'].includes(browserName) ||
  !['desktop', 'mobile', 'both'].includes(device) ||
  !Number.isFinite(seconds) ||
  seconds < 4 ||
  seconds > 20 ||
  Object.keys(options).some((key) => !['browser', 'device', 'seconds'].includes(key))
) {
  throw new Error('Unsupported option. Run with --help for the bounded recording options.');
}
await mkdir(output, { recursive: true });
const browser = await { chromium, webkit }[browserName].launch();
const reports = [];
try {
  for (const [name, viewport] of [
    ['desktop', { width: 1440, height: 1000 }],
    ['mobile', { width: 390, height: 844 }],
  ]) {
    if (device !== 'both' && device !== name) continue;
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: 1,
      isMobile: name === 'mobile',
      hasTouch: name === 'mobile',
      recordVideo: { dir: resolve(output, 'recordings'), size: viewport },
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.goto('http://127.0.0.1:5173/');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForSelector('.panorama-viewer.is-ready', { timeout: 30000 });
    await page.waitForTimeout(seconds * 1000);
    await page.goto('http://127.0.0.1:5173/__lab');
    await page.getByTestId('crafting-grid').waitFor();
    await page.waitForTimeout(1500);
    const toolbar = page.locator('.lab-toolbar');
    await toolbar.locator(':scope > summary').click();
    await page.getByRole('button', { name: 'Play timeline', exact: true }).click();
    await page.getByRole('combobox', { name: 'Fixture' }).selectOption('reveal');
    await toolbar.locator(':scope > summary').click();
    await page.waitForTimeout(2200);
    await toolbar.locator(':scope > summary').click();
    await page.getByRole('combobox', { name: 'Fixture' }).selectOption('finished');
    await toolbar.locator(':scope > summary').click();
    await page.waitForTimeout(2200);
    const video = page.video();
    await context.close();
    const path = resolve(output, `latest-${name}.webm`);
    await rm(path, { force: true });
    await video.saveAs(path);
    await video.delete();
    reports.push({ device: name, browser: browserName, viewport, path, errors });
    console.log(`Recorded ${name} ${viewport.width}×${viewport.height}: ${path}`);
  }
} finally {
  await browser.close();
}
await writeFile(resolve(output, 'recordings.json'), `${JSON.stringify(reports, null, 2)}\n`);
if (reports.some((report) => report.errors.length)) {
  throw new Error(`Browser errors during recording; see ui-progress/recordings.json.`);
}
