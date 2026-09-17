import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { DEFAULT_SETTINGS } from '../../src/shared/rules';
import type { RoomSnapshot } from '../../src/shared/types';

// Feed an authoritative-shaped snapshot into the real App shell, not an isolated podium.
test('finished mobile match keeps podium, standings, actions and sound controls reachable', async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error')
      errors.push(message.text().replace(/([?&]token=)[^&\s'"]+/g, '$1[redacted]'));
  });
  await page.addInitScript(() => {
    localStorage.setItem('craft.sound', 'off');
    sessionStorage.setItem(
      'competitive-crafting.session',
      JSON.stringify({ code: 'ABC123', playerId: 'p0', token: 'fixture-only' }),
    );
  });
  const state: RoomSnapshot = {
    code: 'ABC123',
    hostId: 'p0',
    phase: 'finished',
    settings: DEFAULT_SETTINGS,
    players: Array.from({ length: 12 }, (_, index) => ({
      id: `p${index}`,
      name: index === 0 ? 'DiamondDreamer' : `Crafter${index}`,
      avatar: 'creeper',
      ready: false,
      connected: true,
      spectator: false,
      score: 1200 - index * 50,
      wins: 1,
      winningTime: 1000 + index,
    })),
    round: null,
    deadline: null,
    serverNow: Date.now(),
    revision: 1,
    practice: false,
    history: [],
  };
  await page.routeWebSocket('**/api/rooms/ABC123/ws?*', (socket) => {
    socket.send(JSON.stringify({ type: 'state', state }));
  });
  await mkdir('ui-progress', { recursive: true });
  for (const viewport of [
    { width: 390, height: 664 },
    { width: 360, height: 640 },
    { width: 844, height: 390 },
    { width: 1280, height: 650 },
    { width: 1366, height: 768 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/join/ABC123');
    await expect(page.getByTestId('results')).toBeVisible();
    for (const id of ['rematch-button', 'results-leave', 'sound-toggle', 'jukebox-toggle']) {
      const control = page.getByTestId(id);
      await expect(control).toBeInViewport();
      const box = (await control.boundingBox())!;
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    }
    const standings = page.locator('.match-detail-scroll');
    expect(await standings.evaluate((element) => element.clientHeight)).toBeGreaterThanOrEqual(48);
    await standings.evaluate((element) => element.scrollTo(0, element.scrollHeight));
    await expect(page.getByTestId('final-standing-p11')).toBeInViewport();
    await standings.evaluate((element) => element.scrollTo(0, 0));
    await page.evaluate(() => window.scrollTo(100, 1000));
    expect(await page.evaluate(() => ({ x: scrollX, y: scrollY }))).toEqual({ x: 0, y: 0 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);
    await page.screenshot({
      path: `ui-progress/${info.project.name}-app-results-${viewport.width}x${viewport.height}.png`,
      scale: 'css',
    });
  }
  expect(errors).toEqual([]);
});
