import { expect, test } from './fixtures';
import { mkdir } from 'node:fs/promises';
import { AVATARS, AVATAR_NAMES } from '../../src/components/Scoreboard';

// Avatar geometry/focus is independent of the separately tested animated panorama.
test.use({ reducedMotion: 'reduce' });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('craft.sound', 'off'));
});

test('all twelve avatars load, select and reach the authoritative lobby', async ({ page }) => {
  const errors: string[] = [];
  const redact = (value: string) => value.replace(/([?&]token=)[^&\s'"]+/g, '$1[redacted]');
  page.on('pageerror', (error) => errors.push(redact(error.message)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(redact(message.text()));
  });
  await page.goto('/');
  const trigger = page.getByTestId('avatar-picker-trigger');
  const dialog = page.getByTestId('avatar-picker-dialog');
  for (const avatar of AVATARS) {
    await trigger.click();
    await expect(dialog).toBeVisible();
    const option = dialog.getByRole('button', {
      name: `${avatar.replaceAll('_', ' ')} avatar`,
      exact: true,
    });
    await option.scrollIntoViewIfNeeded();
    const loaded = await option.locator('img').evaluate(async (image: HTMLImageElement) => {
      await image.decode();
      return [image.naturalWidth, image.naturalHeight];
    });
    expect(loaded).toEqual([128, 128]);
    await option.click();
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await expect(trigger).toContainText(AVATAR_NAMES[avatar]);
    await expect(trigger.locator('img')).toHaveAttribute('src', `/assets/avatars/${avatar}.png`);
  }
  await trigger.click();
  await dialog.getByRole('button', { name: 'herobrine avatar', exact: true }).click();
  await page.getByTestId('player-name').fill('WhiteEyes');
  await page.getByTestId('create-room').click();
  const player = page
    .getByTestId('scoreboard')
    .getByRole('listitem')
    .filter({ hasText: 'WhiteEyes' });
  await expect(player.locator('img')).toHaveAttribute('src', '/assets/avatars/herobrine.png');
  await expect(player.locator('img')).toBeVisible();
  expect(errors).toEqual([]);
});

test('avatar dialog contains focus and keeps full choices usable on small screens', async ({
  page,
}, info) => {
  const errors: string[] = [];
  const redact = (value: string) => value.replace(/([?&]token=)[^&\s'"]+/g, '$1[redacted]');
  page.on('pageerror', (error) => errors.push(redact(error.message)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(redact(message.text()));
  });
  await mkdir('ui-progress/avatars', { recursive: true });
  await page.goto('/');
  const trigger = page.getByTestId('avatar-picker-trigger');
  const dialog = page.getByTestId('avatar-picker-dialog');
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 390, height: 664 },
    { width: 360, height: 640 },
    { width: 844, height: 390 },
    { width: 390, height: 420 },
  ]) {
    await page.setViewportSize(viewport);
    await trigger.click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'creeper avatar', exact: true })).toBeFocused();
    const choices = dialog.locator('.avatar-choice-option');
    await expect(choices).toHaveCount(12);
    const dimensions = await choices.evaluateAll((elements) =>
      elements.map((element) => {
        const bounds = element.getBoundingClientRect();
        return {
          width: bounds.width,
          height: bounds.height,
          clipped: element.scrollWidth > element.clientWidth,
        };
      }),
    );
    expect(dimensions.every((box) => box.width >= 48 && box.height >= 48 && !box.clipped)).toBe(
      true,
    );
    const bounds = (await dialog.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(15);
    expect(bounds.y).toBeGreaterThanOrEqual(15);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width - 15);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height - 15);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      viewport.width,
    );
    await page.screenshot({
      path: `ui-progress/avatars/${info.project.name}-${viewport.width}x${viewport.height}.png`,
      scale: 'css',
    });
    await choices.last().scrollIntoViewIfNeeded();
    await expect(choices.last()).toBeInViewport();
    await choices.first().focus();
    await page.keyboard.press('Shift+Tab');
    await expect(dialog.getByTestId('close-avatar-picker')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(choices.last()).toBeFocused();
    for (let index = 0; index < 15; index++) {
      await page.keyboard.press('Tab');
      expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(
        true,
      );
    }
    await dialog.getByTestId('close-avatar-picker').click();
    await expect(trigger).toBeFocused();
  }
  await trigger.click();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.mouse.click(2, 2);
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  expect(errors).toEqual([]);
});
