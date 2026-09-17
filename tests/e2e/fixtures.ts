import { randomBytes } from 'node:crypto';
import { test as base, type BrowserContext } from '@playwright/test';

export { expect, type Page, type Locator, type Browser } from '@playwright/test';

export async function isolateLocalApi(context: BrowserContext) {
  // Separate simulated HTTP clients while preserving the real 30/min limiter and sockets.
  const hex = Array.from(randomBytes(12), (byte) => byte.toString(16).padStart(2, '0')).join('');
  const client = `2001:db8:${hex.match(/.{4}/g)!.join(':')}`;
  await context.route(
    (url) =>
      ['http:', 'https:'].includes(url.protocol) &&
      ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) &&
      url.pathname.startsWith('/api/'),
    async (route) => {
      if (route.request().method() !== 'POST') {
        await route.fallback();
        return;
      }
      await route.fallback({
        headers: { ...route.request().headers(), 'CF-Connecting-IP': client },
      });
    },
  );
}

export const test = base.extend({
  context: async ({ context }, use) => {
    await isolateLocalApi(context);
    await use(context);
  },
});
