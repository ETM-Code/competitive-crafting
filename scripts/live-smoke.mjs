import { chromium, expect, devices } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const origin = process.argv[2] || 'https://competitive-crafting.eoghancollins.com';
const url = new URL(origin);
if (!['competitive-crafting.eoghancollins.com', '127.0.0.1', 'localhost'].includes(url.hostname)) {
  throw new Error(
    'Use the project deployment or a loopback URL for this bounded gameplay smoke test.',
  );
}
const catalogue = JSON.parse(await readFile(resolve(root, 'src/data/catalogue.json'), 'utf8'));
const output = resolve(root, 'ui-progress');
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const errors = [];
const contexts = [];
const redact = (message) => message.replace(/([?&]token=)[^\s&"']+/gi, '$1[redacted]');
try {
  const hostContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const guestContext = await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1 });
  contexts.push(hostContext, guestContext);
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  for (const page of [host, guest]) {
    page.setDefaultTimeout(15000);
    page.on('pageerror', (error) => errors.push(redact(error.message)));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(redact(message.text()));
    });
  }
  const response = await host.goto(url.origin);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-security-policy']).toContain("default-src 'self'");
  await host.getByTestId('player-name').fill('LaunchCheck');
  await host.getByTestId('create-room').click();
  await expect(host.getByTestId('lobby')).toBeVisible();
  const invitation = await host.getByTestId('room-link').inputValue();
  expect(new URL(invitation).origin).toBe(url.origin);
  await guest.goto(invitation);
  await guest.getByTestId('player-name').fill('MobileCheck');
  await guest.getByRole('button', { name: 'pig avatar', exact: true }).click();
  await guest.getByTestId('join-room-submit').click();
  await expect(guest.getByTestId('lobby')).toBeVisible();
  await guest.getByTestId('ready-button').click();
  await host.getByTestId('ready-button').click();
  await host.getByTestId('start-button').click();
  const targetName = host.getByTestId('target-name');
  await expect(targetName).toBeVisible();
  const name = await targetName.innerText();
  await expect(guest.getByTestId('target-name')).toHaveText(name);
  const target = catalogue.items.find((item) => item.name === name);
  const candidates = catalogue.recipes.filter((recipe) => recipe.output === target.id);
  const palette = await host
    .locator('[data-testid^="ingredient-"]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-item-id')));
  const recipe = candidates.find((candidate) => {
    const ingredients =
      candidate.kind === 'shaped'
        ? candidate.pattern.flat().filter(Boolean)
        : candidate.ingredients;
    return ingredients.every((choices) => choices.some((item) => palette.includes(item)));
  });
  if (!recipe) throw new Error('No supported recipe variant available in the supplied palette.');
  const grid = Array(9).fill(null);
  const choose = (choices) => choices.find((item) => palette.includes(item));
  if (recipe.kind === 'shaped') {
    recipe.pattern.forEach((row, y) =>
      row.forEach((choices, x) => {
        if (choices) grid[y * 3 + x] = choose(choices);
      }),
    );
  } else
    recipe.ingredients.forEach((choices, index) => {
      grid[index] = choose(choices);
    });
  for (const [index, item] of grid.entries()) {
    if (!item) continue;
    const ingredient = host.getByTestId(`ingredient-${item}`);
    if ((await ingredient.getAttribute('aria-pressed')) !== 'true') await ingredient.click();
    const slot = host.getByTestId(`grid-slot-${index}`);
    await slot.click();
    await expect(slot).toHaveAttribute('data-item-id', item);
  }
  await expect(host.getByTestId('collect-output')).toBeEnabled();
  await expect(host.locator('.game-sidebar .score')).toHaveText(['0', '0']);
  await host.screenshot({ path: resolve(output, 'live-desktop-ready.png'), scale: 'css' });
  await guest.screenshot({ path: resolve(output, 'live-mobile-playing.png'), scale: 'css' });
  await host.getByTestId('collect-output').click();
  await expect(host.getByTestId('recipe-reveal')).toBeVisible();
  await expect(guest.getByTestId('recipe-reveal')).toBeVisible();
  await expect(host.locator('.game-sidebar .score').first()).toHaveText('100');
  await host.reload();
  await expect(host.locator('.game-sidebar .score').first()).toHaveText('100');
  await host.screenshot({ path: resolve(output, 'live-desktop-result.png'), scale: 'css' });
  expect(errors).toEqual([]);
  console.log(
    `Live smoke passed (${url.protocol}): assets, two players, mobile invite join, valid grid without premature points, collection, broadcast and score resync.`,
  );
} finally {
  await Promise.all(contexts.map((context) => context.close()));
  await browser.close();
  await writeFile(resolve(output, 'live-smoke-errors.json'), JSON.stringify(errors, null, 2));
}
