import { chromium, webkit, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Usage: node scripts/verify-music.mjs [origin] [--allow-manual]
// Manual provider taps never count as automaticPlayback. Default exit status requires auto;
// --allow-manual waives only that gate, never continuity, native effects, pause or mute.
const args = process.argv.slice(2);
const allowManual = args.includes('--allow-manual');
if (args.some((arg) => arg.startsWith('--') && arg !== '--allow-manual'))
  throw new Error('Supported option: --allow-manual');
const origin = new URL(args.find((arg) => !arg.startsWith('--')) || 'http://127.0.0.1:8787');
if (!['127.0.0.1', 'localhost', 'competitive-crafting.eoghancollins.com'].includes(origin.hostname))
  throw new Error('Use the project deployment or a loopback URL.');
const catalogue = JSON.parse(
  await readFile(new URL('../src/data/catalogue.json', import.meta.url)),
);
const output = resolve('ui-progress');
await mkdir(output, { recursive: true });
const redact = (text) => String(text).replace(/(?:https?|wss?):\/\/[^\s'"<>]+/gi, '[URL redacted]');
const snapshot = (page) => page.evaluate(() => window.__musicCheck);
async function progress(page, since, previous = null, timeout = 10000) {
  await page.waitForFunction(
    ({ since, previous }) => {
      const updates = window.__musicCheck.playback.slice(since);
      const valid = (e) =>
        e && !e.isPaused && !e.isBuffering && e.position !== null && e.duration > 0;
      const first = updates.find(valid),
        last = updates.at(-1);
      return (
        valid(first) &&
        valid(last) &&
        last.duration === first.duration &&
        last.position >= first.position + 500 &&
        (!previous ||
          (last.duration === previous.duration && last.position >= previous.position + 500))
      );
    },
    { since, previous },
    { timeout },
  );
  return (await snapshot(page)).playback.at(-1);
}
async function controls(page, open) {
  const toggle = page.getByTestId('jukebox-toggle');
  if (open && !(await toggle.isVisible())) await page.getByTestId('game-menu-toggle').click();
  if (((await toggle.getAttribute('aria-expanded')) === 'true') !== open) await toggle.click();
  const back = page.getByRole('button', { name: 'Back to crafting', exact: true });
  if (!open && (await back.isVisible())) await back.click();
}
async function explicitPlayback(page) {
  const since = (await snapshot(page)).playback.length;
  await controls(page, true);
  // Opening our controls can already resume playback; do not click a stale provider Play
  // button while Spotify replaces it with its own preview/upsell controls.
  const resumed = await progress(page, since, null, 2500).catch(() => null);
  if (resumed) {
    await controls(page, false);
    return { interaction: 'explicit-jukebox-controls', evidence: resumed };
  }
  const play = page
    .frameLocator('.spotify-host')
    .frameLocator('iframe')
    .getByRole('button', { name: /^Play$|^Play preview$/i })
    .first();
  let interaction = 'explicit-jukebox-controls';
  if (
    await play.waitFor({ state: 'visible', timeout: 2000 }).then(
      () => true,
      () => false,
    )
  ) {
    await play.click();
    interaction = 'provider-play-button';
  }
  const evidence = await progress(page, since);
  await controls(page, false);
  return { interaction, evidence };
}
async function paused(page, since) {
  await page.waitForFunction(
    (index) => {
      const e = window.__musicCheck.playback.slice(index).at(-1);
      return e?.isPaused && !e.isBuffering && e.position !== null;
    },
    since,
    { timeout: 10000 },
  );
  const stopped = await snapshot(page);
  await controls(page, false); // Ordinary click effects must not undo the explicit stop.
  await page.waitForTimeout(1500);
  const updates = (await snapshot(page)).playback.slice(stopped.playback.length);
  expect(
    updates.every(
      (e) =>
        e.isPaused && (e.position === null || e.position <= stopped.playback.at(-1).position + 250),
    ),
  ).toBe(true);
}
const results = [];
for (const [name, engine] of [
  ['chromium', chromium],
  ['webkit', webkit],
]) {
  const browser = await engine.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 664 } });
  page.setDefaultTimeout(15000);
  const result = { browser: name, automaticPlayback: false, manualPlayback: null, errors: [] };
  results.push(result);
  page.on('pageerror', (error) => result.errors.push(redact(error.message)));
  page.on('console', (message) => {
    if (message.type() === 'error') result.errors.push(redact(message.text()));
  });
  await page.addInitScript(() => {
    if (window !== window.top) return;
    const state = (window.__musicCheck = { playback: [], effects: [] });
    window.addEventListener('message', (event) => {
      if (
        event.origin !== location.origin ||
        event.source !== document.querySelector('.spotify-host')?.contentWindow ||
        event.data?.channel !== 'crafting-spotify' ||
        event.data.type !== 'playback' ||
        typeof event.data.isPaused !== 'boolean'
      )
        return;
      const { position, duration, isPaused, isBuffering } = event.data;
      state.playback.push({
        at: performance.now(),
        isPaused,
        isBuffering: isBuffering === true,
        position: Number.isFinite(position) ? position : null,
        duration: Number.isFinite(duration) ? duration : null,
      });
    });
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      const value = start.apply(this, args);
      state.effects.push({ at: performance.now(), duration: this.buffer?.duration ?? 0 });
      return value;
    };
  });
  try {
    await page.goto(origin.origin);
    await page.getByTestId('player-name').fill('MusicCheck');
    await page.getByTestId('practice-button').click();
    await expect(page.getByTestId('lobby')).toBeVisible();
    await page.getByTestId('lobby-rules-tab').click();
    await page.getByTestId('setting-seconds').fill('180');
    await expect(page.getByTestId('setting-seconds')).toHaveValue('180');
    await page.getByTestId('lobby-party-tab').click();
    await page.getByTestId('ready-button').click();
    await page.getByTestId('start-button').click();
    await expect(page.getByTestId('crafting-grid')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('jukebox-toggle')).toBeHidden();
    const frame = await page.locator('.spotify-host').elementHandle();
    try {
      await progress(page, (await snapshot(page)).playback.length, null, 20000);
      result.automaticPlayback = true;
    } catch (error) {
      result.automaticFailure = redact(error.message);
      result.manualPlayback = await explicitPlayback(page);
    }
    result.beforeEffects = await progress(page, (await snapshot(page)).playback.length);
    const label = await page.getByTestId('target-name').innerText();
    const target = catalogue.items.find((item) => item.name === label);
    if (!target) throw new Error('Displayed target absent from local catalogue.');
    const palette = await page
      .locator('[data-testid^="ingredient-"]')
      .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-item-id')));
    // Reuse live-smoke.mjs's catalogue/palette construction; all moves use normal UI.
    const recipe = catalogue.recipes.find(
      (r) =>
        r.output === target.id &&
        (r.kind === 'shaped' ? r.pattern.flat().filter(Boolean) : r.ingredients).every((choices) =>
          choices.some((item) => palette.includes(item)),
        ),
    );
    if (!recipe) throw new Error('No local recipe variant matches the displayed palette.');
    const grid = Array(9).fill(null),
      choose = (choices) => choices.find((id) => palette.includes(id));
    if (recipe.kind === 'shaped')
      recipe.pattern.forEach((row, y) =>
        row.forEach((set, x) => {
          if (set) grid[y * 3 + x] = choose(set);
        }),
      );
    else recipe.ingredients.forEach((set, i) => (grid[i] = choose(set)));
    result.nativeEffects = {};
    for (const [index, item] of grid.entries()) {
      if (!item) continue;
      const ingredient = page.getByTestId(`ingredient-${item}`);
      for (const [kind, control] of [
        ['select', ingredient],
        ['place', page.getByTestId(`grid-slot-${index}`)],
      ]) {
        if (kind === 'select' && (await ingredient.getAttribute('aria-pressed')) === 'true')
          continue;
        const before = await snapshot(page);
        await control.click();
        await expect
          .poll(async () => (await snapshot(page)).effects.length)
          .toBeGreaterThan(before.effects.length);
        result.nativeEffects[kind] = (await snapshot(page)).effects.slice(before.effects.length);
      }
      await expect(page.getByTestId(`grid-slot-${index}`)).toHaveAttribute('data-item-id', item);
    }
    result.afterPlacement = await progress(
      page,
      (await snapshot(page)).playback.length,
      result.beforeEffects,
    );
    await expect(page.getByTestId('collect-output')).toBeEnabled();
    const beforeCollect = await snapshot(page);
    await page.getByTestId('collect-output').click();
    await expect(page.getByTestId('recipe-reveal')).toBeVisible();
    await expect(page.locator('.round-standing.is-you .standing-points small')).toHaveText(
      /^\+[1-9]\d*$/,
    );
    result.nativeEffects.collect = (await snapshot(page)).effects.slice(
      beforeCollect.effects.length,
    );
    for (const kind of ['select', 'place', 'collect'])
      expect(result.nativeEffects[kind]?.some((e) => e.duration > 0)).toBe(true);
    result.afterCollection = await progress(
      page,
      beforeCollect.playback.length,
      result.afterPlacement,
    );
    await page.screenshot({ path: resolve(output, `${name}-verified-music.png`), scale: 'css' });
    await expect(page.getByTestId('crafting-grid')).toBeVisible({ timeout: 15000 });
    await controls(page, true);
    await progress(page, (await snapshot(page)).playback.length);
    const panel = page.getByRole('region', { name: 'Spotify jukebox', includeHidden: true });
    const pauseIndex = (await snapshot(page)).playback.length;
    await panel.getByRole('button', { name: 'Pause', exact: true }).click();
    await paused(page, pauseIndex);
    await expect(panel).toContainText('Music paused');
    result.explicitPause = true;
    result.explicitResume = await explicitPlayback(page);
    await controls(page, true);
    const muteIndex = (await snapshot(page)).playback.length;
    await page.getByTestId('sound-toggle').click();
    await expect(panel).toContainText('Sound is off');
    const silentCount = (await snapshot(page)).effects.length;
    await paused(page, muteIndex);
    expect((await snapshot(page)).effects.length).toBe(silentCount);
    result.muted = true;
    result.retainedFrame = await frame.evaluate(
      (e) => e === document.querySelector('.spotify-host'),
    );
    expect(result.retainedFrame).toBe(true);
    expect(result.errors).toEqual([]);
    result.passed = result.automaticPlayback || allowManual;
    if (!result.passed) process.exitCode = 1;
    console.log(
      `${name}: automatic=${result.automaticPlayback}; manual=${result.manualPlayback?.interaction ?? 'not-needed'}; effects/continuity/pause/mute passed; overall=${result.passed}.`,
    );
  } catch (error) {
    result.passed = false;
    result.failure = redact(error.message);
    process.exitCode = 1;
    await page.screenshot({
      path: resolve(output, `${name}-music-check-failed.png`),
      scale: 'css',
    });
    console.error(`${name}: music verification did not pass: ${result.failure}`);
  } finally {
    result.observation = await snapshot(page).catch(() => null);
    await browser.close();
  }
}
await writeFile(
  resolve(output, 'verified-music.json'),
  JSON.stringify({ allowManual, results }, null, 2),
);
