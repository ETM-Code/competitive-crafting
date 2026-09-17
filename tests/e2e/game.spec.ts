import { test, expect, isolateLocalApi, type Page, type Browser } from './fixtures';
import jsQR from 'jsqr';
import { mkdir } from 'node:fs/promises';
import { solutionFor } from '../../src/shared/recipes';
import { itemById } from '../../src/shared/catalogue';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('craft.sound', 'off'));
});

function observe(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) =>
    errors.push(error.message.replace(/([?&]token=)[^&\s'"]+/g, '$1[redacted]')),
  );
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text().replace(/([?&]token=)[^&\s'"]+/g, '$1[redacted]'));
    }
  });
  return errors;
}
async function create(page: Page, practice = false) {
  await page.goto('/');
  await page.getByTestId('player-name').fill('CreeperHost');
  await page.getByTestId(practice ? 'practice-button' : 'create-room').click();
  await expect(page.getByTestId('lobby')).toBeVisible();
}
async function lobbyTab(page: Page, tab: 'rules' | 'party') {
  const button = page.getByTestId(`lobby-${tab}-tab`);
  if (await button.isVisible()) await button.click();
}
async function expectScore(page: Page, points: string, present = true) {
  const menu = page.getByTestId('game-menu-toggle');
  await expect(
    page.locator('[data-testid="game"], [data-testid="round-summary"], [data-testid="results"]'),
  ).toBeVisible();
  if (await page.getByTestId('round-summary').isVisible()) {
    const totals = page.locator('.standing-points strong');
    if (present) await expect(totals.first()).toHaveAttribute('aria-label', `${points} total XP`);
    else await expect(totals.first()).not.toHaveAttribute('aria-label', `${points} total XP`);
    return;
  }
  if (await page.getByTestId('results').isVisible()) {
    const result = page.locator('.final-standing-list');
    if (present) await expect(result).toContainText(points);
    else await expect(result).not.toContainText(points);
    return;
  }
  await menu.click();
  const scoreboard = page.getByRole('dialog', { name: 'Game menu' }).getByTestId('scoreboard');
  if (present) await expect(scoreboard).toContainText(points);
  else await expect(scoreboard).not.toContainText(points);
  await page.getByRole('button', { name: 'Back to crafting' }).click();
}
async function readyStart(page: Page) {
  await page.getByTestId('ready-button').click();
  await page.getByTestId('start-button').click();
  await expect(page.getByTestId('target-name')).toBeVisible();
}
async function fillTarget(page: Page, touch = false) {
  const label = await page.getByTestId('target-name').innerText();
  const target = Object.values(itemById).find((item) => item.name === label);
  expect(target, label).toBeDefined();
  const grid = solutionFor(target!.id);
  for (const [index, item] of grid.entries()) {
    if (!item) continue;
    const ingredient = page.getByTestId(`ingredient-${item}`);
    if (!(await ingredient.isVisible())) {
      await page.getByTestId('inventory-search').fill(itemById[item].name);
    }
    if ((await ingredient.getAttribute('aria-pressed')) !== 'true') {
      if (touch) await ingredient.tap();
      else await ingredient.click();
      await expect(ingredient).toHaveAttribute('aria-pressed', 'true');
    }
    const done = page.getByTestId('inventory-search-done');
    if (await done.isVisible()) await done.click();
    const slot = page.getByTestId(`grid-slot-${index}`);
    if (touch) await slot.tap();
    else await slot.click();
    await expect(slot).toHaveAttribute('data-item-id', item);
  }
  await expect(page.getByTestId('collect-output')).toBeEnabled();
}
async function joinSecond(browser: Browser, url: string) {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:5173' });
  await isolateLocalApi(context);
  const page = await context.newPage();
  await page.addInitScript(() => localStorage.setItem('craft.sound', 'off'));
  const errors = observe(page);
  await page.goto(url);
  await page.getByTestId('player-name').fill('PigGuest');
  await page.getByTestId('join-room-submit').click();
  await expect(page.getByTestId('lobby')).toBeVisible();
  return { context, page, errors };
}

test('host invite link and QR join, default rules, explicit collection and departures', async ({
  page,
  browser,
}, info) => {
  const errors = observe(page);
  await create(page);
  await lobbyTab(page, 'rules');
  await expect(page.getByTestId('setting-rounds')).toHaveValue('10');
  await expect(page.getByTestId('setting-seconds')).toHaveValue('30');
  await expect(page.getByTestId('preset-memory')).toHaveCount(0);
  await lobbyTab(page, 'party');
  const url = await page.getByTestId('room-link').inputValue();
  await page.getByTestId('copy-link').click();
  await expect(page.getByTestId('copy-status')).toContainText('copied');
  const qrImage = page.getByTestId('room-qr');
  await expect(qrImage).toBeVisible();
  const pixels = await qrImage.evaluate((element: HTMLImageElement) => {
    const canvas = document.createElement('canvas');
    canvas.width = element.naturalWidth;
    canvas.height = element.naturalHeight;
    const context = canvas.getContext('2d')!;
    context.drawImage(element, 0, 0);
    return {
      data: Array.from(context.getImageData(0, 0, canvas.width, canvas.height).data),
      width: canvas.width,
      height: canvas.height,
    };
  });
  expect(jsQR(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height)?.data).toBe(url);
  const guest = await joinSecond(browser, url);
  await guest.page.getByTestId('ready-button').click();
  await readyStart(page);
  await expect(guest.page.getByTestId('target-name')).toHaveText(
    await page.getByTestId('target-name').innerText(),
  );
  await expect(page.getByTestId('overclock-button')).toHaveCount(0);
  await fillTarget(page, info.project.name === 'mobile');
  await expectScore(page, '100', false);
  await mkdir('ui-progress', { recursive: true });
  await page.screenshot({
    path: `ui-progress/${info.project.name}-multiplayer-ready.png`,
    scale: 'css',
  });
  await page.getByTestId('collect-output').click();
  await expect(page.getByTestId('recipe-reveal')).toBeVisible();
  await expect(guest.page.getByTestId('recipe-reveal')).toBeVisible();
  await expectScore(page, '100');
  await page.reload();
  await expect(page.getByTestId('results')).toContainText(
    'All alone? Try getting some friends, loser.',
  );
  await expectScore(page, '100');
  await expect(guest.page.getByTestId('results')).toBeVisible();
  expect(errors).toEqual([]);
  expect(guest.errors).toEqual([]);
  await guest.context.close();
});

test('creative search preserves practice grid on refresh and accepts output', async ({
  page,
}, info) => {
  const errors = observe(page);
  const sockets: string[] = [];
  page.on('websocket', (socket) => {
    if (new URL(socket.url()).pathname.startsWith('/api/rooms/')) sockets.push('connected');
  });
  await create(page, true);
  await lobbyTab(page, 'rules');
  await page.getByTestId('setting-inventory').selectOption('creative');
  await readyStart(page);
  await page.getByTestId('inventory-search').fill('oak');
  await expect(page.getByTestId('overclock-offer')).toHaveCount(0);
  await fillTarget(page, info.project.name === 'mobile');
  const beforeReload = sockets.length;
  await page.reload();
  await expect(page.getByTestId('collect-output')).toBeEnabled();
  expect(sockets).toHaveLength(beforeReload + 1);
  await expect(page.getByTestId('overclock-offer')).toHaveCount(0);
  await page.getByTestId('collect-output').click();
  await expect(page.getByTestId('recipe-reveal')).toBeVisible();
  expect(errors).toEqual([]);
});

test('a replaced tab stops reconnecting until explicitly retried', async ({
  page,
  context,
}, info) => {
  test.skip(info.project.name !== 'chromium', 'Session lifecycle is independent of input engine.');
  const sockets: string[] = [];
  page.on('websocket', (socket) => {
    if (new URL(socket.url()).pathname.startsWith('/api/rooms/')) sockets.push('connected');
  });
  await create(page, true);
  const session = await page.evaluate(() => sessionStorage.getItem('competitive-crafting.session'));
  const replacement = await context.newPage();
  await replacement.addInitScript((stored) => {
    sessionStorage.setItem('competitive-crafting.session', stored!);
  }, session);
  await replacement.goto(page.url());
  await expect(replacement.getByTestId('lobby')).toBeVisible();
  // The old client previously reclaimed its session every second, causing both tabs to
  // evict each other indefinitely. One successor must stay connected without churn.
  await page.waitForTimeout(2500);
  expect(sockets).toHaveLength(1);
  await expect(page.getByTestId('error-message')).toContainText('another tab');
  await expect(page.getByTestId('ready-button')).toBeDisabled();
  await expect(replacement.getByTestId('ready-button')).toBeEnabled();
  await page.getByRole('button', { name: 'Retry now' }).click();
  await expect(page.getByTestId('ready-button')).toBeEnabled();
  await expect(replacement.getByTestId('error-message')).toContainText('another tab');
  await page.waitForTimeout(1500);
  expect(sockets).toHaveLength(2);
  await replacement.close();
});

test('keyboard placement, Delete removal, ingredient drag and output drag collection', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'chromium', 'Desktop input paths are covered once.');
  const errors = observe(page);
  await create(page, true);
  await page.getByTestId('setting-seconds').fill('90');
  await readyStart(page);
  const label = await page.getByTestId('target-name').innerText();
  const target = Object.values(itemById).find((item) => item.name === label)!;
  const grid = solutionFor(target.id);
  const index = grid.findIndex(Boolean);
  const item = grid[index]!;
  const ingredient = page.getByTestId(`ingredient-${item}`);
  const slot = page.getByTestId(`grid-slot-${index}`);
  await ingredient.focus();
  await page.keyboard.press('Enter');
  await expect(ingredient).toHaveAttribute('aria-pressed', 'true');
  await slot.focus();
  await page.keyboard.press('Space');
  await expect(slot).toHaveAttribute('data-item-id', item);
  await page.keyboard.press('Delete');
  await expect(slot).not.toHaveAttribute('data-item-id');
  for (const [position, id] of grid.entries()) {
    if (!id) continue;
    await page.getByTestId(`ingredient-${id}`).dragTo(page.getByTestId(`grid-slot-${position}`));
    await expect(page.getByTestId(`grid-slot-${position}`)).toHaveAttribute('data-item-id', id);
  }
  await expect(page.getByTestId('collect-output')).toBeEnabled();
  await expect(page.locator('.app')).toHaveAttribute('data-phase', 'playing');
  await page.getByTestId('craft-output').dragTo(page.getByTestId('collection-zone'));
  await expect(page.getByTestId('recipe-reveal')).toBeVisible();
  await expectScore(page, '100');
  expect(errors).toEqual([]);
});

test('pagehide closes practice transport and BFCache return resumes the same round', async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== 'chromium',
    'Page lifecycle is covered once alongside cross-engine input.',
  );
  const errors = observe(page);
  await create(page, true);
  await readyStart(page);
  const target = await page.getByTestId('target-name').innerText();
  const ingredient = page.locator('[data-testid^="ingredient-"]').first();
  const item = await ingredient.getAttribute('data-item-id');
  await ingredient.click();
  await page.getByTestId('grid-slot-0').click();
  await expect(page.getByTestId('grid-slot-0')).toHaveAttribute('data-item-id', item!);
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })),
  );
  await expect(page.getByTestId('grid-slot-0')).toBeDisabled();
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })),
  );
  await expect(page.getByTestId('grid-slot-0')).toBeEnabled();
  await expect(page.getByTestId('grid-slot-0')).toHaveAttribute('data-item-id', item!);
  await expect(page.getByTestId('target-name')).toHaveText(target);
  expect(errors).toEqual([]);
});

async function forfeitRound(page: Page) {
  await page.getByTestId('game-menu-toggle').click();
  await page.getByTestId('forfeit-round').click();
  await page.getByTestId('confirm-forfeit').click();
}

test('individual forfeit is irreversible and all forfeits skip the round', async ({
  page,
  browser,
}, info) => {
  test.skip(info.project.name !== 'chromium', 'Server forfeit protocol tested once in browser.');
  const errors = observe(page);
  await create(page);
  const guest = await joinSecond(browser, await page.getByTestId('room-link').inputValue());
  await guest.page.getByTestId('ready-button').click();
  await readyStart(page);
  await forfeitRound(page);
  await expect(page.getByTestId('collect-output')).toBeDisabled();
  await expect(page.locator('.app')).toHaveAttribute('data-phase', 'playing');
  await expect(guest.page.getByTestId('crafting-grid')).toBeVisible();
  await forfeitRound(guest.page);
  await expect(page.getByTestId('round-summary')).toContainText('Tools down. Next craft!');
  await expect(guest.page.getByTestId('round-summary')).toBeVisible();
  await expect(page.locator('.standing-points strong')).toHaveText(['0', '0']);
  expect(errors).toEqual([]);
  expect(guest.errors).toEqual([]);
  await guest.context.close();
});

test('closing the host tab transfers ownership and rejoining preserves the ended match', async ({
  page,
  browser,
}, info) => {
  test.skip(info.project.name !== 'chromium', 'Transport departure lifecycle tested once.');
  await create(page);
  const url = await page.getByTestId('room-link').inputValue();
  const session = await page.evaluate(() => sessionStorage.getItem('competitive-crafting.session'));
  const guest = await joinSecond(browser, url);
  await guest.page.getByTestId('ready-button').click();
  await readyStart(page);
  const hostContext = page.context();
  await page.close();
  await expect(guest.page.getByTestId('results')).toContainText(
    'All alone? Try getting some friends, loser.',
  );
  await expect(guest.page.getByTestId('rematch-button')).toBeVisible();
  const reopened = await hostContext.newPage();
  await reopened.addInitScript(
    (stored) => sessionStorage.setItem('competitive-crafting.session', stored!),
    session,
  );
  await reopened.goto(url);
  await expect(reopened.getByTestId('results')).toBeVisible();
  await expect(reopened.getByTestId('rematch-button')).toHaveCount(0);
  expect(guest.errors).toEqual([]);
  await guest.context.close();
});

test('complete short custom match and return for rematch', async ({ page }, info) => {
  test.skip(
    info.project.name !== 'chromium',
    'Full match lifecycle is shared; input coverage runs on all engines.',
  );
  await create(page, true);
  await page.getByTestId('setting-rounds').fill('3');
  await readyStart(page);
  for (let round = 0; round < 3; round++) {
    await expect(page.getByTestId('collect-output')).toBeVisible();
    await fillTarget(page);
    await page.getByTestId('collect-output').click();
    await expect(page.getByTestId('recipe-reveal')).toBeVisible();
    if (round < 2)
      await expect(page.getByTestId('recipe-reveal')).toHaveCount(0, { timeout: 15000 });
  }
  await expect(page.getByTestId('results')).toBeVisible({ timeout: 15000 });
  for (const viewport of [
    { width: 390, height: 664 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.getByTestId('sound-toggle')).toBeVisible();
    await expect(page.getByTestId('jukebox-toggle')).toBeVisible();
    await expect(page.getByTestId('rematch-button')).toBeInViewport();
    await expect(page.getByTestId('results-leave')).toBeInViewport();
    expect(
      await page.locator('.match-detail-scroll').evaluate((element) => element.clientHeight),
    ).toBeGreaterThanOrEqual(48);
    expect(await page.evaluate(() => ({ x: scrollX, y: scrollY }))).toEqual({ x: 0, y: 0 });
    await page.screenshot({
      path: `ui-progress/actual-results-${viewport.width}x${viewport.height}.png`,
      scale: 'css',
    });
  }
  await page.getByTestId('rematch-button').click();
  await expect(page.getByTestId('lobby')).toBeVisible();
});
