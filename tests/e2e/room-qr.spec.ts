import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import jsQR from 'jsqr';

test('room QR expands, decodes, stays in view and restores focus', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error')
      errors.push(message.text().replace(/([?&]token=)[^&\s'"]+/g, '$1[redacted]'));
  });
  await page.addInitScript(() => localStorage.setItem('craft.sound', 'off'));
  await page.goto('/');
  await page.getByTestId('player-name').fill('QrHost');
  await page.getByTestId('create-room').click();
  const trigger = page.getByTestId('expand-room-qr');
  await expect(trigger).toBeVisible();
  const url = await page.getByTestId('room-link').inputValue();
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: /Join room/ });
  const close = page.getByTestId('close-room-qr');
  await expect(dialog).toBeVisible();
  await expect(close).toBeFocused();
  const image = page.getByTestId('expanded-room-qr');
  const pixels = await image.evaluate((element) => {
    const image = element as HTMLImageElement;
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    return {
      width: canvas.width,
      height: canvas.height,
      data: Array.from(context.getImageData(0, 0, canvas.width, canvas.height).data),
    };
  });
  expect(jsQR(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height)?.data).toBe(url);
  await mkdir('ui-progress/qr', { recursive: true });
  for (const viewport of [
    { name: 'desktop', width: 1440, height: 1000 },
    { name: 'small', width: 360, height: 740 },
    { name: 'phone', width: 390, height: 844 },
    { name: 'landscape', width: 844, height: 390 },
    { name: 'keyboard', width: 390, height: 480 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(15);
    expect(box!.y).toBeGreaterThanOrEqual(15);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width - 15);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height - 15);
    const square = await image.boundingBox();
    expect(Math.abs(square!.width - square!.height)).toBeLessThan(1);
    const button = await close.boundingBox();
    expect(button!.y + button!.height).toBeLessThanOrEqual(viewport.height - 16);
    await page.screenshot({ path: `ui-progress/qr/${info.project.name}-${viewport.name}.png` });
  }
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await close.click();
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.mouse.click(3, 3);
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  expect(errors).toEqual([]);
});
