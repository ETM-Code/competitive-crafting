import { test, expect, type Page, type Locator } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

async function withinViewport(page: Page, locator: Locator) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box, (await locator.getAttribute('data-testid')) ?? 'control bounds').not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(-1);
  expect(box!.y).toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
}

async function mainScreenIsFixed(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 1000));
  await page.mouse.move(4, 4);
  await page.mouse.wheel(0, 500);
  expect(await page.evaluate(() => ({ x: scrollX, y: scrollY }))).toEqual({ x: 0, y: 0 });
  expect(
    await page.locator('html').evaluate((element) => getComputedStyle(element).overflowY),
  ).toBe('hidden');
}

test('home and lab remain visible at real viewport sizes, without overflow or missing art', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await mkdir('ui-progress', { recursive: true });
  for (const route of ['/', '/__lab']) {
    await page.goto(route);
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator(route === '/' ? '.title-menu' : '.crafting-window')).toBeVisible();
    await page.waitForTimeout(400);
    const dimensions = await page.evaluate(() => ({
      viewport: innerWidth,
      width: document.documentElement.scrollWidth,
    }));
    expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport + 1);
    await mainScreenIsFixed(page);
    if (route === '/') {
      await withinViewport(page, page.getByTestId('player-name'));
      await withinViewport(page, page.getByTestId('create-room'));
      await withinViewport(page, page.getByTestId('practice-button'));
      await withinViewport(page, page.getByTestId('join-room'));
      await withinViewport(page, page.getByTestId('install-guide').locator('summary'));
      await withinViewport(page, page.locator('.how-to > summary'));
      await withinViewport(page, page.getByTestId('jukebox-toggle'));
      await withinViewport(page, page.getByTestId('sound-toggle'));
      for (const avatar of await page.locator('.avatar-picker button').all())
        await withinViewport(page, avatar);
    }
    const broken = await page.locator('img').evaluateAll((elements) => {
      const images = elements as HTMLImageElement[];
      return images.filter((img) => !img.complete || img.naturalWidth === 0).map((img) => img.src);
    });
    expect(broken).toEqual([]);
    if (route === '/__lab') {
      const grid = page.getByTestId('crafting-grid');
      await expect(grid).toBeVisible();
      expect(
        await page.locator('.crafting-window').evaluate((el) => getComputedStyle(el).opacity),
      ).toBe('1');
      const slot = await page.getByTestId('grid-slot-0').boundingBox();
      expect(slot?.width).toBeGreaterThanOrEqual(48);
      expect(slot?.height).toBeGreaterThanOrEqual(48);
      for (const id of ['target-name', 'round-timer', 'crafting-grid', 'collect-output']) {
        await withinViewport(page, page.getByTestId(id));
      }
      const inventory = page.locator('.inventory-content');
      await withinViewport(page, inventory);
      await inventory.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      await withinViewport(page, page.getByTestId('inventory').locator('button').last());
      await inventory.evaluate((element) => {
        element.scrollTop = 0;
      });
    }
    await page.screenshot({
      path: `ui-progress/${info.project.name}-${route === '/' ? 'home' : 'game'}-tested.png`,
      scale: 'css',
    });
  }
  expect(errors).toEqual([]);
});

test('mobile browser resizing, keyboard focus, landscape and reduced motion retain controls', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByTestId('player-name').focus();
  await expect
    .poll(async () =>
      page.getByTestId('player-name').evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
    )
    .toBeGreaterThanOrEqual(16);
  await page.setViewportSize({ width: 390, height: 480 });
  await page.getByTestId('player-name').fill('KeyboardCheck');
  await expect(page.getByTestId('create-room')).toBeVisible();
  await page.setViewportSize({ width: 844, height: 390 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/__lab');
  await expect(page.getByTestId('crafting-grid')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('live mobile play keeps essentials fixed and moves secondary controls into a menu', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByTestId('player-name').fill('ViewportCheck');
  await page.getByTestId('practice-button').click();
  await expect(page.getByTestId('lobby')).toBeVisible();
  await withinViewport(page, page.getByTestId('ready-button'));
  await withinViewport(page, page.getByTestId('start-button'));
  await page.getByTestId('ready-button').click();
  await page.getByTestId('start-button').click();
  await expect(page.getByTestId('target-name')).toBeVisible();
  for (const size of [
    { width: 360, height: 740 },
    { width: 390, height: 844 },
    { width: 412, height: 915 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(size);
    for (const id of [
      'target-name',
      'round-timer',
      'crafting-grid',
      'collect-output',
      'inventory',
    ]) {
      await withinViewport(page, page.getByTestId(id));
    }
    await mainScreenIsFixed(page);
    await page.screenshot({
      path: `ui-progress/${info.project.name}-live-${size.width}x${size.height}.png`,
      scale: 'css',
    });
  }
  await page.getByTestId('game-menu-toggle').click();
  const menu = page.getByRole('dialog', { name: 'Game menu' });
  await withinViewport(page, menu);
  await expect(page.getByRole('button', { name: 'Back to crafting' })).toBeFocused();
  await expect(page.locator('#main-content')).toHaveAttribute('inert', '');
  await expect(menu.getByTestId('scoreboard')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(page.getByTestId('game-menu-toggle')).toBeFocused();
  await expect(page.locator('#main-content')).not.toHaveAttribute('inert', '');
  expect(errors).toEqual([]);
});

test('short desktop window contains the full workbench and inventory panel', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await page.getByTestId('player-name').fill('ShortDesktop');
  await page.getByTestId('practice-button').click();
  await page.getByTestId('ready-button').click();
  await page.getByTestId('start-button').click();
  await expect(page.getByTestId('target-name')).toBeVisible();
  const panel = await page.locator('.crafting-window').boundingBox();
  for (const control of [
    page.getByTestId('crafting-grid'),
    page.getByTestId('collect-output'),
    page.getByTestId('erase-tool'),
    page.getByTestId('collection-zone'),
    page.locator('.inventory-content'),
  ]) {
    await withinViewport(page, control);
    const bounds = (await control.boundingBox())!;
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(panel!.y + panel!.height - 6);
  }
  await expect(page.getByTestId('game-menu-toggle')).toBeHidden();
  await expect(page.locator('.game-sidebar')).toBeVisible();
  await mainScreenIsFixed(page);
});

test('menus are exclusive and touch-only controls stay off desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  const help = page.locator('.how-to');
  const install = page.getByTestId('install-guide');
  await help.locator('summary').click();
  await expect(help).toHaveAttribute('open', '');
  await install.locator('summary').click();
  await expect(install).toHaveAttribute('open', '');
  await expect(help).not.toHaveAttribute('open', '');
  await page.getByTestId('jukebox-toggle').click();
  await expect(install).not.toHaveAttribute('open', '');
  await expect(page.getByTestId('jukebox-toggle')).toHaveAttribute('aria-expanded', 'true');
  await help.locator('summary').click();
  await expect(page.getByTestId('jukebox-toggle')).toHaveAttribute('aria-expanded', 'false');
  await help.locator('summary').click();
  await page.goto('/__lab');
  await expect(page.locator('.inventory-filter-toggle')).toBeHidden();
  await expect(page.locator('.game-menu-toggle')).toBeHidden();
  await page.locator('.lab-toolbar > summary').click();
  await page.getByRole('combobox', { name: 'Fixture' }).selectOption('lobby');
  await expect(page.getByTestId('lobby-rules-tab')).toBeHidden();
  await page.getByRole('combobox', { name: 'Fixture' }).selectOption('finished');
  await expect(page.getByTestId('results-history-tab')).toBeHidden();
});

test('home-screen metadata and installation guide are present', async ({ page, request }) => {
  await page.goto('/');
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons).toHaveLength(2);
  await page.getByTestId('install-guide').locator('summary').click();
  await expect(page.getByTestId('install-guide')).toContainText('Safari');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    'href',
    '/assets/app-icon-192.png',
  );
});
