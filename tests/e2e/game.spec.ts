import { test, expect, type Page, type Browser } from '@playwright/test';
import jsQR from 'jsqr';
import { mkdir } from 'node:fs/promises';
import { solutionFor } from '../../src/shared/recipes';
import { itemById } from '../../src/shared/catalogue';

function observe(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
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
  // A reload first renders the reconnect screen; wait before choosing the layout.
  await expect(page.locator('.connection-status.connected')).toBeVisible();
  const compact = await menu.isVisible();
  if (compact) await menu.click();
  const scoreboard = compact
    ? page.getByRole('dialog', { name: 'Game menu' }).getByTestId('scoreboard')
    : page.getByTestId('scoreboard').first();
  await expect(scoreboard).toBeVisible();
  if (present) await expect(scoreboard).toContainText(points);
  else await expect(scoreboard).not.toContainText(points);
  if (compact) await page.getByRole('button', { name: 'Back to crafting' }).click();
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
    const slot = page.getByTestId(`grid-slot-${index}`);
    if (touch) await slot.tap();
    else await slot.click();
    await expect(slot).toHaveAttribute('data-item-id', item);
  }
  await expect(page.getByTestId('collect-output')).toBeEnabled();
}
async function joinSecond(browser: Browser, url: string) {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:5173' });
  const page = await context.newPage();
  const errors = observe(page);
  await page.goto(url);
  await page.getByTestId('player-name').fill('PigGuest');
  await page.getByTestId('join-room-submit').click();
  await expect(page.getByTestId('lobby')).toBeVisible();
  return { context, page, errors };
}

test('host invite link and QR join, default rules, Overclock, explicit collection and reconnect', async ({
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
  await page.getByTestId('overclock-button').click();
  await expect(page.getByTestId('overclock-active')).toBeVisible();
  await expect(page.getByTestId('round-points')).toContainText('150');
  await fillTarget(page, info.project.name === 'mobile');
  await expectScore(page, '150', false);
  await mkdir('ui-progress', { recursive: true });
  await page.screenshot({
    path: `ui-progress/${info.project.name}-multiplayer-ready.png`,
    scale: 'css',
  });
  await page.getByTestId('collect-output').click();
  await expect(page.getByTestId('recipe-reveal')).toBeVisible();
  await expect(guest.page.getByTestId('recipe-reveal')).toBeVisible();
  await expectScore(page, '150');
  await page.reload();
  await expectScore(page, '150');
  expect(errors).toEqual([]);
  expect(guest.errors).toEqual([]);
  await guest.context.close();
});

test('creative search locks Overclock, preserves grid on refresh and accepts output', async ({
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
  await expect(page.getByTestId('scoreboard').first()).toContainText('100');
  expect(errors).toEqual([]);
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
  await page.getByTestId('rematch-button').click();
  await expect(page.getByTestId('lobby')).toBeVisible();
});
