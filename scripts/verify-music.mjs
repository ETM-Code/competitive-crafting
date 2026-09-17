import { chromium, webkit, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const origin = new URL(process.argv[2] || 'http://127.0.0.1:8787');
if (
  !['127.0.0.1', 'localhost', 'competitive-crafting.eoghancollins.com'].includes(origin.hostname)
) {
  throw new Error('Use the project deployment or a loopback URL.');
}
const output = resolve('ui-progress');
await mkdir(output, { recursive: true });
const results = [];
for (const [name, engine] of [
  ['chromium', chromium],
  ['webkit', webkit],
]) {
  const browser = await engine.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 664 } });
  page.setDefaultTimeout(15000);
  const errors = [];
  const redact = (text) => text.replace(/([?&]token=)[^&\s'"]+/g, '$1[redacted]');
  page.on('pageerror', (error) => errors.push(redact(error.message)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(redact(message.text()));
  });
  try {
    await page.goto(origin.origin);
    await page.getByTestId('player-name').fill('MusicCheck');
    await page.getByTestId('practice-button').click();
    await expect(page.getByTestId('lobby')).toBeVisible();
    const frame = await page.locator('.spotify-host').elementHandle();
    await page.getByTestId('ready-button').click();
    await page.getByTestId('start-button').click();
    await expect(page.getByTestId('crafting-grid')).toBeVisible();
    await expect(page.getByTestId('jukebox-toggle')).toBeHidden();
    const status = page.getByRole('region', { name: 'Spotify jukebox', includeHidden: true });
    // Only provider playback_update confirms this label; a play() call is not sufficient.
    await expect(status).toContainText('Playing', { timeout: 20000 });
    expect(
      await frame.evaluate((element) => element === document.querySelector('.spotify-host')),
    ).toBe(true);
    await page.getByTestId('game-menu-toggle').click();
    await page.getByTestId('jukebox-toggle').click();
    await page.screenshot({ path: resolve(output, `${name}-verified-music.png`), scale: 'css' });
    await page.getByTestId('sound-toggle').click();
    await expect(status).toContainText('Sound is off');
    expect(errors).toEqual([]);
    results.push({
      browser: name,
      playback: 'provider-confirmed',
      retainedFrame: true,
      muted: true,
      errors,
    });
    console.log(
      `${name}: official player confirmed automatic playback; hidden frame retained; mute verified.`,
    );
  } catch (error) {
    results.push({
      browser: name,
      playback: 'not-confirmed',
      failure: redact(error.message),
      errors,
    });
    await page.screenshot({
      path: resolve(output, `${name}-music-check-failed.png`),
      scale: 'css',
    });
    console.error(`${name}: music verification did not pass: ${redact(error.message)}`);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}
await writeFile(resolve(output, 'verified-music.json'), JSON.stringify(results, null, 2));
