import { test, expect } from './fixtures';
import playlist from '../../src/data/playlist.json' with { type: 'json' };

const spotifyAPI = '**/open.spotify.com/embed/iframe-api/v1';
const mockAPI = `(() => {
  window.__spotifyCalls = [];
  window.onSpotifyIframeApiReady({ createController(element, options, callback) {
    window.__spotifyCalls.push(['create', options.uri]);
    const media = document.createElement('iframe'); media.loading = 'lazy'; media.title = 'Mock Spotify'; element.append(media);
    const listeners = {};
    window.__spotifyEmit = (name, data) => listeners[name]?.({data});
    const controller = {
      play() { window.__spotifyCalls.push(['play']); listeners.playback_update?.({data:{isPaused:false,isBuffering:false}}); },
      pause() { window.__spotifyCalls.push(['pause']); },
      resume() { window.__spotifyCalls.push(['resume']); listeners.playback_update?.({data:{isPaused:false,isBuffering:false}}); },
      loadUri(uri) { window.__spotifyCalls.push(['load', uri]); },
      destroy() { window.__spotifyCalls.push(['destroy']); },
      addListener(name, fn) { listeners[name] = fn; if(name === 'ready') setTimeout(() => fn({data:{}}), 0); }
    };
    callback(controller);
  }});
})();`;

test('music preloads silently, starts with normal game gesture, and sound-off pauses playback', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route(spotifyAPI, (route) =>
    route.fulfill({ contentType: 'text/javascript', body: mockAPI }),
  );
  await page.goto('/');
  const host = page.frameLocator('.spotify-host').locator('body');
  await expect
    .poll(() =>
      host.evaluate(
        () => (window as unknown as { __spotifyCalls?: string[][] }).__spotifyCalls?.length || 0,
      ),
    )
    .toBeGreaterThan(0);
  expect(
    await host.evaluate(() =>
      (window as unknown as { __spotifyCalls: string[][] }).__spotifyCalls.filter(
        ([type]) => type === 'play',
      ),
    ),
  ).toHaveLength(0);
  await expect(page.frameLocator('.spotify-host').locator('iframe')).toHaveAttribute(
    'loading',
    'eager',
  );
  await page.getByTestId('player-name').fill('AutoMusic');
  await page.getByTestId('create-room').click();
  await expect
    .poll(() =>
      host.evaluate(
        () =>
          (window as unknown as { __spotifyCalls: string[][] }).__spotifyCalls.filter(
            ([type]) => type === 'play',
          ).length,
      ),
    )
    .toBeGreaterThan(0);
  await page.getByTestId('jukebox-toggle').click();
  const panel = page.getByRole('region', { name: 'Spotify jukebox' });
  await expect(panel.getByRole('button', { name: 'Play', exact: true })).toHaveCount(0);
  await expect(panel).toContainText('Playing');
  await page.getByTestId('sound-toggle').click();
  await expect(panel).toContainText('Sound is off');
  expect(await page.evaluate(() => localStorage.getItem('craft.sound'))).toBe('off');
  // The sound preference renders before its postMessage reaches the provider frame.
  await expect
    .poll(() =>
      host.evaluate(
        () =>
          (window as unknown as { __spotifyCalls: string[][] }).__spotifyCalls.filter(
            ([type]) => type === 'pause',
          ).length,
      ),
    )
    .toBeGreaterThan(0);
  const pauses = await host.evaluate(
    () =>
      (window as unknown as { __spotifyCalls: string[][] }).__spotifyCalls.filter(
        ([type]) => type === 'pause',
      ).length,
  );
  expect(pauses).toBeGreaterThan(0);
  await host.evaluate(() =>
    (window as unknown as { __spotifyEmit: (name: string, data: unknown) => void }).__spotifyEmit(
      'playback_update',
      { isPaused: false },
    ),
  );
  await expect
    .poll(() =>
      host.evaluate(
        () =>
          (window as unknown as { __spotifyCalls: string[][] }).__spotifyCalls.filter(
            ([type]) => type === 'pause',
          ).length,
      ),
    )
    .toBe(pauses + 1);
  const plays = await host.evaluate(
    () =>
      (window as unknown as { __spotifyCalls: string[][] }).__spotifyCalls.filter(
        ([type]) => type === 'play',
      ).length,
  );
  await panel.getByRole('combobox', { name: 'Spotify track' }).selectOption({ index: 1 });
  expect(
    await host.evaluate(
      () =>
        (window as unknown as { __spotifyCalls: string[][] }).__spotifyCalls.filter(
          ([type]) => type === 'play',
        ).length,
    ),
  ).toBe(plays);
  await page.getByTestId('sound-toggle').click();
  await expect
    .poll(() =>
      host.evaluate(
        () =>
          (window as unknown as { __spotifyCalls: string[][] }).__spotifyCalls.filter(
            ([type]) => type === 'play',
          ).length,
      ),
    )
    .toBeGreaterThan(plays);
  await expect(panel).toContainText('Playing');
  await panel.getByRole('button', { name: 'Pause', exact: true }).click();
  const stoppedAt = await host.evaluate(
    () =>
      (window as unknown as { __spotifyCalls: string[][] }).__spotifyCalls.filter(
        ([type]) => type === 'play',
      ).length,
  );
  await page.getByTestId('jukebox-toggle').click();
  await page.getByTestId('leave-room').click();
  expect(
    await host.evaluate(
      () =>
        (window as unknown as { __spotifyCalls: string[][] }).__spotifyCalls.filter(
          ([type]) => type === 'play',
        ).length,
    ),
  ).toBe(stoppedAt);
  await page.getByRole('button', { name: 'Keep crafting' }).click();
  expect(errors).toEqual([]);
});

test('mobile play hides controls without replacing or pausing the music player', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 664 });
  await page.route(spotifyAPI, (route) =>
    route.fulfill({ contentType: 'text/javascript', body: mockAPI }),
  );
  await page.goto('/');
  const host = page.frameLocator('.spotify-host').locator('body');
  await expect
    .poll(() =>
      host.evaluate(
        () => (window as unknown as { __spotifyCalls?: string[][] }).__spotifyCalls?.length ?? 0,
      ),
    )
    .toBeGreaterThan(0);
  await host.evaluate(() => {
    (window as unknown as { retainedPlayer: boolean }).retainedPlayer = true;
  });
  await page.getByTestId('player-name').fill('MobileMusic');
  await page.getByTestId('practice-button').click();
  await expect(page.getByTestId('lobby')).toBeVisible();
  await page.getByTestId('ready-button').click();
  await page.getByTestId('start-button').click();
  await expect(page.getByTestId('crafting-grid')).toBeVisible();
  await expect(page.locator('.site-header')).toBeHidden();
  await expect(page.getByTestId('jukebox-toggle')).toBeHidden();
  await expect
    .poll(() =>
      host.evaluate(
        () =>
          (window as unknown as { __spotifyCalls: string[][] }).__spotifyCalls.filter(
            ([type]) => type === 'play',
          ).length,
      ),
    )
    .toBeGreaterThan(0);
  expect(
    await host.evaluate(() => (window as unknown as { retainedPlayer: boolean }).retainedPlayer),
  ).toBe(true);
  await page.getByTestId('game-menu-toggle').click();
  await page.getByTestId('jukebox-toggle').click();
  await expect(page.getByRole('region', { name: 'Spotify jukebox' })).toContainText('Playing');
  const pauses = await host.evaluate(
    () =>
      (window as unknown as { __spotifyCalls: string[][] }).__spotifyCalls.filter(
        ([type]) => type === 'pause',
      ).length,
  );
  await page.getByTestId('sound-toggle').click();
  await expect
    .poll(() =>
      host.evaluate(
        () =>
          (window as unknown as { __spotifyCalls: string[][] }).__spotifyCalls.filter(
            ([type]) => type === 'pause',
          ).length,
      ),
    )
    .toBeGreaterThan(pauses);
  expect(
    await host.evaluate(() => (window as unknown as { retainedPlayer: boolean }).retainedPlayer),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test('sound effects recover hidden music interruptions without overriding provider pause or completion', async ({
  page,
}) => {
  await page.clock.install();
  await page.route(spotifyAPI, (route) =>
    route.fulfill({ contentType: 'text/javascript', body: mockAPI }),
  );
  await page.goto('/');
  await page.getByTestId('jukebox-toggle').click();
  const panel = page.getByRole('region', { name: 'Spotify jukebox', includeHidden: true });
  const host = page.frameLocator('.spotify-host').locator('body');
  const calls = (type: string) =>
    host.evaluate(
      (_element, wanted) =>
        (window as unknown as { __spotifyCalls: string[][] }).__spotifyCalls.filter(
          ([name]) => name === wanted,
        ).length,
      type,
    );
  const pause = (position = 5000, duration = 30000) =>
    host.evaluate(
      (_element, { position, duration }) =>
        (
          window as unknown as { __spotifyEmit: (name: string, data: unknown) => void }
        ).__spotifyEmit('playback_update', {
          isPaused: true,
          isBuffering: false,
          position,
          duration,
        }),
      { position, duration },
    );
  await expect(panel).toContainText('Playing');
  await page.getByTestId('jukebox-toggle').click();
  await pause();
  await expect.poll(() => calls('resume')).toBe(1);
  await expect(panel).toContainText('Playing');
  // A second pause from the same effect cannot create a resume loop.
  await pause();
  await expect(panel).toContainText('Music paused or interrupted');
  expect(await calls('resume')).toBe(1);
  await page.getByTestId('jukebox-toggle').click();
  await expect(panel).toContainText('Playing');
  await pause();
  await expect(panel).toContainText('Music paused or interrupted');
  expect(await calls('resume')).toBe(1);
  // An explicit resume then a completed preview stays stopped, even near a click sound.
  await panel.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(panel).toContainText('Playing');
  await page.getByTestId('jukebox-toggle').click();
  await pause(30000, 30000);
  await expect(panel).toContainText('track or preview finished');
  expect(await calls('resume')).toBe(1);
});

test('buffering does not resend play and rejected interruption recovery stays bounded', async ({
  page,
}) => {
  await page.clock.install();
  await page.route(spotifyAPI, (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: mockAPI.replace(
        "resume() { window.__spotifyCalls.push(['resume']); listeners.playback_update?.({data:{isPaused:false,isBuffering:false}}); }",
        "resume() { window.__spotifyCalls.push(['resume']); }",
      ),
    }),
  );
  await page.goto('/');
  await page.getByTestId('jukebox-toggle').click();
  const panel = page.getByRole('region', { name: 'Spotify jukebox', includeHidden: true });
  const host = page.frameLocator('.spotify-host').locator('body');
  await expect(panel).toContainText('Playing');
  await host.evaluate(() =>
    (window as unknown as { __spotifyEmit: (name: string, data: unknown) => void }).__spotifyEmit(
      'playback_update',
      { isPaused: false, isBuffering: true },
    ),
  );
  await expect(panel).toContainText('buffering');
  const plays = await host.evaluate(
    () =>
      (window as unknown as { __spotifyCalls: string[][] }).__spotifyCalls.filter(
        ([name]) => name === 'play',
      ).length,
  );
  await page.getByTestId('jukebox-toggle').click();
  expect(
    await host.evaluate(
      () =>
        (window as unknown as { __spotifyCalls: string[][] }).__spotifyCalls.filter(
          ([name]) => name === 'play',
        ).length,
    ),
  ).toBe(plays);
  await host.evaluate(() =>
    (window as unknown as { __spotifyEmit: (name: string, data: unknown) => void }).__spotifyEmit(
      'playback_update',
      { isPaused: false, isBuffering: false },
    ),
  );
  await expect(panel).toContainText('Playing');
  await host.evaluate(() =>
    (window as unknown as { __spotifyEmit: (name: string, data: unknown) => void }).__spotifyEmit(
      'playback_update',
      { isPaused: true, isBuffering: false, position: 5000, duration: 30000 },
    ),
  );
  await expect
    .poll(() =>
      host.evaluate(
        () =>
          (window as unknown as { __spotifyCalls: string[][] }).__spotifyCalls.filter(
            ([name]) => name === 'resume',
          ).length,
      ),
    )
    .toBe(1);
  await page.clock.fastForward(5000);
  await expect(panel).toContainText('Browser blocked music?');
  await page.getByTestId('player-name').click();
  await page.clock.fastForward(5000);
  expect(
    await host.evaluate(
      () =>
        (window as unknown as { __spotifyCalls: string[][] }).__spotifyCalls.filter(
          ([name]) => name === 'resume',
        ).length,
    ),
  ).toBe(1);
});

test('a pause or completed preview after buffering stays stopped on ordinary game actions', async ({
  page,
}) => {
  await page.route(spotifyAPI, (route) =>
    route.fulfill({ contentType: 'text/javascript', body: mockAPI }),
  );
  await page.goto('/');
  await page.getByTestId('jukebox-toggle').click();
  const panel = page.getByRole('region', { name: 'Spotify jukebox', includeHidden: true });
  const host = page.frameLocator('.spotify-host').locator('body');
  const emit = (data: unknown) =>
    host.evaluate((_element, value) => {
      (window as unknown as { __spotifyEmit: (name: string, data: unknown) => void }).__spotifyEmit(
        'playback_update',
        value,
      );
    }, data);
  const starts = () =>
    host.evaluate(
      () =>
        (window as unknown as { __spotifyCalls: string[][] }).__spotifyCalls.filter(
          ([name]) => name === 'play' || name === 'resume',
        ).length,
    );
  await expect(panel).toContainText('Playing');
  for (const position of [5000, 30000]) {
    await emit({ isPaused: false, isBuffering: true });
    await expect(panel).toContainText('buffering');
    await emit({ isPaused: true, isBuffering: false, position, duration: 30000 });
    await expect(panel).toContainText(
      position === 30000 ? 'track or preview finished' : 'Music paused or interrupted',
    );
    const before = await starts();
    await page.getByTestId('jukebox-toggle').click();
    await page.getByTestId('player-name').click();
    await expect.poll(starts).toBe(before);
    await page.getByTestId('jukebox-toggle').click();
    await expect(panel).toContainText('Playing');
  }
});

test('all native Minecraft samples decode and each interaction emits one sound', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/offline.html');
  await page.evaluate(async () => {
    // The isolated development page avoids unrelated game effects in the sample count.
    const source = '/src/lib/audio.ts';
    const audio = (await import(source)) as {
      prepareSounds(): void;
      playSound(kind: string, enabled: boolean): void;
    };
    const state = window as unknown as { nativeClicks: number[] };
    state.nativeClicks = [];
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (
      ...args: Parameters<AudioBufferSourceNode['start']>
    ) {
      state.nativeClicks.push(this.buffer?.duration ?? 0);
      return start.apply(this, args);
    };
    audio.prepareSounds();
    for (const kind of ['click', 'place', 'collect']) {
      const button = document.createElement('button');
      button.textContent = `Test native ${kind}`;
      button.onclick = () => audio.playSound(kind, true);
      document.body.appendChild(button);
    }
  });
  await page.waitForTimeout(300);
  for (const [index, kind] of ['click', 'place', 'collect'].entries()) {
    await page.getByRole('button', { name: `Test native ${kind}` }).click();
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as { nativeClicks: number[] }).nativeClicks.length),
      )
      .toBe(index + 1);
  }
  const durations = await page.evaluate(
    () => (window as unknown as { nativeClicks: number[] }).nativeClicks,
  );
  expect(durations.every((duration) => duration > 0.05)).toBe(true);
  expect(new Set(durations).size).toBe(3);
  expect(errors).toEqual([]);
});

test('remembered sound-off prevents music preload and automatic playback', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('craft.sound', 'off'));
  let requests = 0;
  await page.route(spotifyAPI, async (route) => {
    requests++;
    await route.fulfill({ contentType: 'text/javascript', body: mockAPI });
  });
  await page.goto('/');
  await page.getByTestId('player-name').fill('MutedMusic');
  await page.getByTestId('create-room').click();
  await expect(page.getByTestId('sound-toggle')).toHaveAttribute('aria-pressed', 'false');
  expect(requests).toBe(0);
  await expect(page.locator('.spotify-host')).toHaveCount(0);
});

test('blocked automatic playback reports fallback instead of claiming music plays', async ({
  page,
}) => {
  await page.clock.install();
  await page.route(spotifyAPI, (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: mockAPI.replace(
        'listeners.playback_update?.({data:{isPaused:false,isBuffering:false}});',
        '',
      ),
    }),
  );
  await page.goto('/');
  await page.getByTestId('jukebox-toggle').click();
  const panel = page.getByRole('region', { name: 'Spotify jukebox' });
  await expect(panel.getByRole('button', { name: 'Next', exact: true })).toBeEnabled();
  await page.clock.fastForward(5000);
  await expect(panel).toContainText('Browser blocked music?');
  await expect(panel).not.toContainText('Playing ·');
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
  await expect(panel.getByRole('button', { name: 'Next', exact: true })).toBeEnabled();
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
