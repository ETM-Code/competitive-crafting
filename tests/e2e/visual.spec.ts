import { test, expect, type Page, type Locator } from './fixtures';
import { mkdir } from 'node:fs/promises';

// Audio/provider behavior has its own suite; keep layout/input checks deterministic.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('craft.sound', 'off'));
});

async function withinViewport(page: Page, locator: Locator) {
  await expect(locator).toBeVisible();
  const box = (await locator.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.y).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
}

async function fixedScreen(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 1000));
  await page.mouse.move(2, 2);
  await page.mouse.wheel(0, 500);
  expect(await page.evaluate(() => ({ x: scrollX, y: scrollY }))).toEqual({ x: 0, y: 0 });
}

async function practice(page: Page, creative = false) {
  await page.goto('/');
  await page.getByTestId('player-name').fill('ViewportCheck');
  await page.getByTestId('practice-button').click();
  await expect(page.getByTestId('lobby')).toBeVisible();
  const rules = page.getByTestId('lobby-rules-tab');
  if (await rules.isVisible()) await rules.click();
  if (creative) {
    await page.getByTestId('setting-inventory').selectOption('creative');
    await expect(page.getByTestId('setting-inventory')).toHaveValue('creative');
  }
  await page.getByTestId('setting-seconds').fill('90');
  await expect(page.getByTestId('setting-seconds')).toHaveValue('90');
  await page.getByTestId('ready-button').click();
  await page.getByTestId('start-button').click();
  await expect(page.getByTestId('crafting-grid')).toBeVisible();
}

test('home and lab fit their viewport without broken visible artwork', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await mkdir('ui-progress', { recursive: true });
  for (const route of ['/', '/__lab']) {
    await page.goto(route);
    await page.evaluate(() => document.fonts.ready);
    if (route === '/') {
      for (const id of [
        'player-name',
        'create-room',
        'practice-button',
        'join-room',
        'jukebox-toggle',
        'sound-toggle',
      ])
        await withinViewport(page, page.getByTestId(id));
      await withinViewport(page, page.getByTestId('install-guide').locator('summary'));
      await withinViewport(page, page.locator('.how-to > summary'));
      await withinViewport(page, page.getByTestId('avatar-picker-trigger'));
    } else {
      for (const id of ['target-name', 'round-timer', 'crafting-grid', 'collect-output'])
        await withinViewport(page, page.getByTestId(id));
      const slot = (await page.getByTestId('grid-slot-0').boundingBox())!;
      expect(slot.width).toBeGreaterThanOrEqual(48);
      expect(slot.height).toBeGreaterThanOrEqual(48);
      await withinViewport(page, page.locator('.ingredient-scroll'));
      await page.locator('.ingredient-scroll').evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      await withinViewport(page, page.getByTestId('inventory').locator('button').last());
    }
    await fixedScreen(page);
    const broken = await page.locator('img').evaluateAll((elements) =>
      elements
        .filter((element) => {
          const image = element as HTMLImageElement,
            bounds = image.getBoundingClientRect();
          return (
            bounds.width > 0 &&
            bounds.height > 0 &&
            bounds.top < innerHeight &&
            bounds.bottom > 0 &&
            image.complete &&
            image.naturalWidth === 0
          );
        })
        .map((element) => (element as HTMLImageElement).src),
    );
    expect(broken).toEqual([]);
    await page.screenshot({
      path: `ui-progress/${info.project.name}-${route === '/' ? 'home' : 'game'}-tested.png`,
      scale: 'css',
    });
  }
  expect(errors).toEqual([]);
});

test('immersive mobile crafting prioritizes target, table and inventory at real sizes', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 664 });
  await practice(page, true);
  for (const size of [
    { width: 360, height: 740 },
    { width: 390, height: 664 },
    { width: 390, height: 844 },
    { width: 412, height: 915 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(size);
    await expect
      .poll(async () => Math.round((await page.locator('.app').boundingBox())!.height))
      .toBe(size.height);
    await expect(page.locator('.site-header')).toBeHidden();
    await expect(page.locator('.site-footer')).toBeHidden();
    await expect(page.locator('.craft-target-points')).toBeHidden();
    for (const id of [
      'target-name',
      'round-timer',
      'crafting-grid',
      'collect-output',
      'inventory-search',
      'game-menu-toggle',
    ])
      await withinViewport(page, page.getByTestId(id));
    const inventory = page.locator('.ingredient-scroll');
    await withinViewport(page, inventory);
    expect((await inventory.boundingBox())!.height).toBeGreaterThanOrEqual(
      size.width > 650 ? 100 : 180,
    );
    await inventory.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await withinViewport(page, page.getByTestId('inventory').locator('button').last());
    await inventory.evaluate((el) => {
      el.scrollTop = 0;
    });
    await fixedScreen(page);
    await page.screenshot({
      path: `ui-progress/${info.project.name}-immersive-${size.width}x${size.height}.png`,
      scale: 'css',
    });
  }
  // Safari leaves focus on the previous control when a button is pointer-clicked.
  await page.getByTestId('inventory-search').focus();
  await page.getByTestId('game-menu-toggle').click();
  const menu = page.getByRole('dialog', { name: 'Game menu' });
  await withinViewport(page, menu);
  await expect(page.getByRole('button', { name: 'Back to crafting' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(page.getByTestId('game-menu-toggle')).toBeFocused();
  expect(errors).toEqual([]);
});

test('short desktop workbench controls stay inside the panel', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 650 });
  await practice(page);
  for (const size of [
    { width: 1280, height: 650 },
    { width: 1280, height: 720 },
    { width: 1366, height: 768 },
  ]) {
    await page.setViewportSize(size);
    await expect
      .poll(async () => Math.round((await page.locator('.app').boundingBox())!.height))
      .toBe(size.height);
    const panel = (await page.locator('.crafting-panel').boundingBox())!;
    for (const control of [
      page.getByTestId('crafting-grid'),
      page.getByTestId('collect-output'),
      page.getByTestId('clear-grid'),
      page.getByTestId('erase-tool'),
      page.getByTestId('collection-zone'),
      page.locator('.ingredient-scroll'),
    ]) {
      await withinViewport(page, control);
      const bounds = (await control.boundingBox())!;
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(panel.y + panel.height - 6);
    }
    await fixedScreen(page);
  }
});

test('home menus remain exclusive and install metadata is present', async ({ page, request }) => {
  await page.goto('/');
  const help = page.locator('.how-to'),
    install = page.getByTestId('install-guide');
  await help.locator('summary').click();
  await install.locator('summary').click();
  await expect(help).not.toHaveAttribute('open', '');
  await expect(install).toContainText('Safari');
  await page.getByTestId('jukebox-toggle').click();
  await expect(install).not.toHaveAttribute('open', '');
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons).toHaveLength(2);
});

test('reduced motion and keyboard-height resize keep native search usable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 664 });
  await page.goto('/__lab');
  const input = page.getByTestId('inventory-search');
  await input.focus();
  expect(
    await input.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
  ).toBeGreaterThanOrEqual(16);
  await page.setViewportSize({ width: 390, height: 400 });
  await page.evaluate(() => {
    document.documentElement.dataset.keyboardOpen = 'true';
  });
  await withinViewport(page, input);
  await withinViewport(page, page.getByTestId('inventory-search-done'));
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});
