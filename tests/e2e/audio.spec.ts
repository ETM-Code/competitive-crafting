import { test, expect } from '@playwright/test';
import playlist from '../../src/data/playlist.json' with { type: 'json' };

const spotifyAPI = '**/open.spotify.com/embed/iframe-api/v1';
const mockAPI = `(() => {
  window.__spotifyCalls = [];
  window.onSpotifyIframeApiReady({ createController(element, options, callback) {
    window.__spotifyCalls.push(['create', options.uri]);
    const listeners = {};
    window.__spotifyEmit = (name, data) => listeners[name]?.({data});
    const controller = {
      play() { window.__spotifyCalls.push(['play']); },
      pause() { window.__spotifyCalls.push(['pause']); },
      loadUri(uri) { window.__spotifyCalls.push(['load', uri]); },
      destroy() { window.__spotifyCalls.push(['destroy']); },
      addListener(name, fn) { listeners[name] = fn; if(name === 'ready') setTimeout(() => fn({data:{}}), 0); }
    };
    callback(controller);
  }});
})();`;

test('music loads only on request, obeys explicit play and sound-off pauses playback', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let requests = 0;
  await page.route(spotifyAPI, async (route) => {
    requests++;
    await route.fulfill({ contentType: 'text/javascript', body: mockAPI });
  });
  await page.goto('/');
  expect(requests).toBe(0);
  await page.getByTestId('jukebox-toggle').click();
  const panel = page.getByRole('region', { name: 'Spotify jukebox' });
  await expect(panel.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  expect(
    await page
      .frameLocator('.spotify-host')
      .locator('body')
      .evaluate(() =>
        (window as unknown as { __spotifyCalls: string[][] }).__spotifyCalls.filter(
          ([type]) => type === 'play',
        ),
      ),
  ).toHaveLength(0);
  await panel.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByTestId('sound-toggle').click();
  await expect(panel.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
  await expect(panel).toContainText('Sound is off');
  expect(await page.evaluate(() => localStorage.getItem('craft.sound'))).toBe('off');
  const before = await page
    .frameLocator('.spotify-host')
    .locator('body')
    .evaluate(
      () =>
        (window as unknown as { __spotifyCalls: string[][] }).__spotifyCalls.filter(
          ([type]) => type === 'pause',
        ).length,
    );
  expect(before).toBeGreaterThan(0);
  await page
    .frameLocator('.spotify-host')
    .locator('body')
    .evaluate(() =>
      (window as unknown as { __spotifyEmit: (name: string, data: unknown) => void }).__spotifyEmit(
        'playback_update',
        { isPaused: false },
      ),
    );
  expect(
    await page
      .frameLocator('.spotify-host')
      .locator('body')
      .evaluate(
        () =>
          (window as unknown as { __spotifyCalls: string[][] }).__spotifyCalls.filter(
            ([type]) => type === 'pause',
          ).length,
      ),
  ).toBe(before + 1);
  await panel.getByRole('combobox', { name: 'Spotify track' }).selectOption({ index: 1 });
  expect(
    await page
      .frameLocator('.spotify-host')
      .locator('body')
      .evaluate(() =>
        (window as unknown as { __spotifyCalls: string[][] }).__spotifyCalls.filter(
          ([type]) => type === 'play',
        ),
      ),
  ).toHaveLength(1);
  await page.getByTestId('sound-toggle').click();
  await expect(panel.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await panel.getByRole('button', { name: 'Play', exact: true }).click();
  expect(
    await page
      .frameLocator('.spotify-host')
      .locator('body')
      .evaluate(() =>
        (window as unknown as { __spotifyCalls: string[][] }).__spotifyCalls.filter(
          ([type]) => type === 'play',
        ),
      ),
  ).toHaveLength(2);
  expect(errors).toEqual([]);
});

test('curated shuffle starts on a verified track, never repeats a bag, and keeps manual selection', async ({
  page,
}) => {
  await page.route(spotifyAPI, (route) =>
    route.fulfill({ contentType: 'text/javascript', body: mockAPI }),
  );
  await page.goto('/');
  await page.getByTestId('jukebox-toggle').click();
  const panel = page.getByRole('region', { name: 'Spotify jukebox' });
  const selector = panel.getByRole('combobox', { name: 'Spotify track' });
  await expect(selector).toBeEnabled();
  const seen = [await selector.inputValue()];
  expect(playlist.tracks.some((track) => track.uri === seen[0])).toBe(true);
  const initial = await page
    .frameLocator('.spotify-host')
    .locator('body')
    .evaluate(() => (window as unknown as { __spotifyCalls: string[][] }).__spotifyCalls[0]);
  expect(initial).toEqual(['create', seen[0]]);
  for (let index = 1; index < playlist.tracks.length; index++) {
    await panel.getByRole('button', { name: 'Next', exact: true }).click();
    seen.push(await selector.inputValue());
  }
  expect(new Set(seen).size).toBe(playlist.tracks.length);
  await panel.getByRole('button', { name: 'Next', exact: true }).click();
  expect(await selector.inputValue()).not.toBe(seen.at(-1));
  const manual = playlist.tracks.find((track) => track.title === 'Pigstep - Stereo Mix')!;
  await selector.selectOption(manual.uri);
  await expect(page.getByTestId('jukebox-current')).toContainText(manual.title);
  await page.getByTestId('jukebox-toggle').click();
  await page.getByTestId('jukebox-toggle').click();
  await expect(selector).toHaveValue(manual.uri);
});

test('blocked Spotify gives a playable fallback and a working retry', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let attempts = 0;
  await page.route(spotifyAPI, async (route) => {
    if (attempts++ === 0) await route.abort('failed');
    else await route.fulfill({ contentType: 'text/javascript', body: mockAPI });
  });
  await page.goto('/');
  await page.getByTestId('jukebox-toggle').click();
  const panel = page.getByRole('region', { name: 'Spotify jukebox' });
  await expect(panel).toContainText('Spotify is unavailable');
  await expect(panel.getByRole('link', { name: 'Open Spotify' })).toHaveAttribute(
    'href',
    'https://open.spotify.com/playlist/5T4KWhz9Q8r98skQBimtlH',
  );
  await panel.getByRole('button', { name: 'Retry Spotify' }).click();
  await expect(panel.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await page.getByTestId('jukebox-toggle').click();
  await expect(page.getByTestId('create-room')).toBeEnabled();
  expect(errors).toEqual([]);
});

test('a silent Spotify API times out instead of leaving controls loading forever', async ({
  page,
}) => {
  await page.clock.install();
  await page.route(spotifyAPI, (route) =>
    route.fulfill({ contentType: 'text/javascript', body: '/* API unavailable */' }),
  );
  await page.goto('/');
  await page.getByTestId('jukebox-toggle').click();
  await expect(page.frameLocator('.spotify-host').locator('script[src*="iframe-api"]')).toHaveCount(
    1,
  );
  await page.clock.fastForward(11000);
  const panel = page.getByRole('region', { name: 'Spotify jukebox' });
  await expect(panel).toContainText('Spotify is unavailable');
  await expect(panel.getByRole('button', { name: 'Retry Spotify' })).toBeVisible();
});
