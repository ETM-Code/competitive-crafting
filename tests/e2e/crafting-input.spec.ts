import { test, expect, type Page } from './fixtures';

// Audio/provider behavior has its own suite; keep layout/input checks deterministic.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('craft.sound', 'off'));
});

async function startPractice(page: Page, creative = false) {
  await page.goto('/');
  await page.getByTestId('player-name').fill('PaintCheck');
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

async function center(page: Page, index: number) {
  const bounds = (await page.getByTestId(`grid-slot-${index}`).boundingBox())!;
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}

test('mouse sweep paints initial and crossed slots once, right sweep erases, and cancellation stops painting', async ({
  page,
}, info) => {
  test.skip(info.project.name === 'mobile', 'Mouse gesture is desktop-only.');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await startPractice(page);
  const messages: { type: string; grid?: (string | null)[] }[] = [];
  // A reconnect is not necessary: the page captures its existing socket send.
  await page.evaluate(() => {
    const original = WebSocket.prototype.send;
    (window as unknown as { sentGridMessages: unknown[] }).sentGridMessages = [];
    WebSocket.prototype.send = function (data) {
      if (typeof data === 'string')
        (window as unknown as { sentGridMessages: unknown[] }).sentGridMessages.push(
          JSON.parse(data),
        );
      Reflect.apply(original, this, [data]);
    };
  });
  const ingredient = page.getByTestId('inventory').locator('button').first();
  const id = (await ingredient.getAttribute('data-item-id'))!;
  await ingredient.click();
  const a = await center(page, 0),
    b = await center(page, 2);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 1 });
  await page.mouse.move(a.x, a.y, { steps: 1 });
  await page.mouse.up();
  for (const index of [0, 1, 2])
    await expect(page.getByTestId(`grid-slot-${index}`)).toHaveAttribute('data-item-id', id);
  messages.push(
    ...(await page.evaluate(
      () => (window as unknown as { sentGridMessages: { type: string }[] }).sentGridMessages,
    )),
  );
  expect(messages.filter((message) => message.type === 'grid')).toHaveLength(3);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(b.x, b.y, { steps: 1 });
  await page.mouse.up({ button: 'right' });
  for (const index of [0, 1, 2])
    await expect(page.getByTestId(`grid-slot-${index}`)).not.toHaveAttribute('data-item-id');
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.mouse.move(b.x, b.y);
  await page.mouse.up();
  await expect(page.getByTestId('grid-slot-0')).toHaveAttribute('data-item-id', id);
  await expect(page.getByTestId('grid-slot-2')).not.toHaveAttribute('data-item-id');
  await ingredient.dragTo(page.getByTestId('grid-slot-4'));
  await expect(page.getByTestId('grid-slot-4')).toHaveAttribute('data-item-id', id);
  await page.getByTestId('grid-slot-4').focus();
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('grid-slot-4')).not.toHaveAttribute('data-item-id');
  await expect(page.getByTestId('overclock-offer')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('mobile inventory search preserves native selection and state through keyboard mode', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.setViewportSize({ width: 390, height: 664 });
  await startPractice(page, true);
  const search = page.getByTestId('inventory-search');
  const before = await page.locator('.ingredient-scroll').boundingBox();
  expect(before!.height).toBeGreaterThan(180);
  await search.fill('stone');
  const originalInput = await search.elementHandle();
  await page.evaluate(() => {
    const viewport = visualViewport!;
    Object.defineProperty(viewport, 'height', { configurable: true, value: 390 });
    Object.defineProperty(viewport, 'offsetTop', { configurable: true, value: 24 });
    viewport.dispatchEvent(new Event('resize'));
    viewport.dispatchEvent(new Event('scroll'));
  });
  await expect(page.locator('.crafting-stage')).toHaveClass(/is-searching/);
  await expect(page.getByTestId('inventory-search-done')).toBeVisible();
  await expect(search).toBeFocused();
  // Arrow navigation is portable; Home means document start on macOS.
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowLeft');
  await page.keyboard.down('Shift');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.up('Shift');
  const selection = await search.evaluate((el: HTMLInputElement) => ({
    start: el.selectionStart,
    end: el.selectionEnd,
  }));
  expect(selection.end! - selection.start!).toBe(1);
  expect(await search.evaluate((el) => getComputedStyle(el).userSelect)).toBe('text');
  await search.dispatchEvent('compositionstart', { data: '' });
  await search.dispatchEvent('compositionupdate', { data: '石' });
  await search.dispatchEvent('keydown', { key: 'Enter', isComposing: true });
  await expect(search).toBeFocused();
  await search.dispatchEvent('compositionend', { data: '石' });
  await search.fill('stone');
  await search.selectText();
  await page.keyboard.insertText('stone');
  await expect(search).toHaveValue('stone');
  expect(
    await originalInput!.evaluate((el) => el === document.querySelector('#inventory-search')),
  ).toBe(true);
  const bounds = (await search.boundingBox())!;
  expect(bounds.y).toBeGreaterThanOrEqual(24);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(414);
  expect(await page.evaluate(() => ({ x: scrollX, y: scrollY }))).toEqual({ x: 0, y: 0 });
  await page.screenshot({ path: 'ui-progress/native-search-keyboard.png', scale: 'css' });
  await page.getByTestId('inventory').locator('button').first().click();
  await expect(search).toHaveValue('stone');
  await expect(page.getByTestId('inventory-search-done')).toBeVisible();
  await page.getByTestId('inventory-search-done').click();
  await page.evaluate(() => {
    Reflect.deleteProperty(visualViewport!, 'height');
    Reflect.deleteProperty(visualViewport!, 'offsetTop');
    visualViewport!.dispatchEvent(new Event('resize'));
  });
  await expect(search).toHaveValue('stone');
  await expect(page.getByTestId('crafting-grid')).toBeVisible();
  await expect(page.locator('.crafting-stage')).not.toHaveClass(/is-searching/);
  expect(errors).toEqual([]);
});
