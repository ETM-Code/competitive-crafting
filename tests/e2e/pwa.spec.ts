import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const production = process.env.PWA_BASE_URL || 'http://127.0.0.1:8787';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('craft.sound', 'off'));
});

test('production service worker controls first visit and preserves offline invitation recovery', async ({
  page,
  context,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'Real service-worker offline lifecycle verified in Chromium.',
  );
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  const response = await page.goto(production);
  expect(response?.headers()['content-security-policy']).toContain("worker-src 'self'");
  expect(response?.headers()['x-content-type-options']).toBe('nosniff');
  await expect(page.getByTestId('home')).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  const health = await page.evaluate(
    async () => (await (await fetch('/api/health')).json()) as { ok: boolean },
  );
  expect(health.ok).toBe(true);
  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    return Promise.all(
      names.map(async (name) => ({
        name,
        paths: (await (await caches.open(name)).keys()).map(
          (request) => new URL(request.url).pathname,
        ),
      })),
    );
  });
  expect(cached).toEqual([{ name: 'crafting-shell-v2', paths: ['/offline'] }]);
  await context.setOffline(true);
  await page.goto(`${production}/join/ABC123`);
  await expect(page.getByRole('heading', { name: 'Waiting for a connection' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Try again' })).toHaveAttribute('href', '');
  expect(
    await page.evaluate(async () => {
      try {
        await fetch('/api/health');
        return true;
      } catch {
        return false;
      }
    }),
  ).toBe(false);
  await mkdir('ui-progress', { recursive: true });
  await page.screenshot({ path: 'ui-progress/pwa-offline-mobile.png', scale: 'css' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await context.setOffline(false);
  await page.getByRole('link', { name: 'Try again' }).click();
  await expect(page.getByTestId('room-code-input')).toHaveValue('ABC123');
  expect(page.url()).toBe(`${production}/join/ABC123`);
  expect(errors).toEqual([]);
});

test('install cancellation and failure retain manual guidance without promising installation', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const guide = page.getByTestId('install-guide');
  await guide.locator('summary').click();
  for (const outcome of ['dismissed', 'failure', 'accepted']) {
    await page.evaluate((result) => {
      const event = new Event('beforeinstallprompt', { cancelable: true });
      Object.assign(event, {
        prompt: () =>
          result === 'failure'
            ? Promise.reject(new Error('Browser rejected prompt'))
            : Promise.resolve(),
        userChoice: Promise.resolve({ outcome: result }),
      });
      window.dispatchEvent(event);
    }, outcome);
    await guide.getByRole('button', { name: 'Install Competitive Crafting', exact: true }).click();
    await expect(guide.getByRole('status')).toContainText(
      outcome === 'dismissed'
        ? 'install later'
        : outcome === 'failure'
          ? 'could not open installation'
          : 'Installation requested',
    );
    await expect(guide).toContainText('Safari');
    await expect(guide).toContainText('Android');
  }
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await expect(guide).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('iOS standalone mode hides redundant installation instructions', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }));
  await page.goto('/');
  await expect(page.getByTestId('home')).toBeVisible();
  await expect(page.getByTestId('install-guide')).toHaveCount(0);
});
