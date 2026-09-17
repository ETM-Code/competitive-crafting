import { test, expect, type Page } from './fixtures';
import { mkdir } from 'node:fs/promises';

async function fixture(page: Page, scene = 'reveal') {
  // A real Vite document retains loopback address-space classification for HMR.
  // This test-only HTML is not a production build entry or a public asset.
  await page.goto(`/tests/e2e/fixtures/celebration.html?scene=${encodeURIComponent(scene)}`);
  await expect(page.getByTestId(scene === 'reveal' ? 'round-summary' : 'results')).toBeVisible();
}

const redactTokens = (text: string) => text.replace(/([?&]token=)[^&\s'"]+/g, '$1[redacted]');

const control = (page: Page, expression: string) =>
  page.evaluate((code) => {
    // Test-only fixture control; the HTML lives outside production build entries.
    new Function(code)();
  }, expression);

test('round ranks and totals follow authoritative time, freeze and settle without replay', async ({
  page,
}) => {
  await fixture(page);
  const row = page.getByTestId('round-standing-p4');
  await expect(page.getByTestId('round-total-p4')).toHaveText('380');
  await expect(row.getByLabel('Rank 5', { exact: true })).toBeVisible();
  const position = await row.evaluate((element) => getComputedStyle(element).transform);
  await page.waitForTimeout(300);
  expect(await row.evaluate((element) => getComputedStyle(element).transform)).toBe(position);
  await control(page, 'window.setFixtureTime(3500)');
  await expect(page.getByTestId('round-total-p4')).toHaveText('680');
  await expect(row.getByLabel('Rank 1', { exact: true })).toBeVisible();
  await expect(row.getByLabel('Up 4 places')).toBeVisible();
  await expect(page.getByTestId('round-standing-p2')).toContainText('Gave up');
  await control(
    page,
    'window.setFixture({...window.initialFixture,round:{...window.initialFixture.round,id:"reconnected-round"}})',
  );
  await expect(page.getByTestId('round-total-p4')).toHaveText('680');
  await expect(
    page.getByTestId('round-standing-p4').getByLabel('Rank 1', { exact: true }),
  ).toBeVisible();
  await control(page, 'window.setFixtureTime(0)');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.getByTestId('round-total-p4')).toHaveText('680');
  expect(
    await page.evaluate(
      () =>
        document.getAnimations().filter((animation) => animation.playState === 'running').length,
    ),
  ).toBe(0);
});

test('intermission skip belongs to the connected host and stays reachable on small screens', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(redactTokens(error.message)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(redactTokens(message.text()));
  });
  await mkdir('ui-progress', { recursive: true });
  await fixture(page);
  const skip = page.getByTestId('skip-reveal');
  await expect(skip).toHaveText('Next round →');
  for (const viewport of [
    { width: 390, height: 664 },
    { width: 360, height: 640 },
    { width: 844, height: 390 },
    { width: 1280, height: 650 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(skip).toBeInViewport({ ratio: 1 });
    const bounds = (await skip.boundingBox())!;
    expect(bounds.height).toBeGreaterThanOrEqual(48);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height - 16);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      viewport.width,
    );
    await page.screenshot({
      path: `ui-progress/${info.project.name}-skip-${viewport.width}x${viewport.height}.png`,
      scale: 'css',
    });
  }
  await control(page, 'window.setConnected(false)');
  await expect(skip).toHaveCount(0);
  await control(page, 'window.setConnected(true)');
  await expect(skip).toBeVisible();
  await control(page, 'window.setFixture({...window.initialFixture,hostId:"p0"})');
  await expect(skip).toHaveCount(0);
  await control(
    page,
    'window.setFixture({...window.initialFixture,round:{...window.initialFixture.round,index:9}})',
  );
  await expect(skip).toHaveText('Show results →');
  await skip.click();
  await expect(skip).toBeDisabled();
  expect(await page.evaluate(() => (window as unknown as { skipCalls: number }).skipCalls)).toBe(1);
  expect(errors).toEqual([]);
});

test('round standings can be reached and scrolled using the keyboard', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(redactTokens(error.message)));
  await page.setViewportSize({ width: 390, height: 664 });
  await fixture(page);
  await control(page, 'window.setFixtureTime(4000)');
  const standings = page.getByLabel('Round standings', { exact: true });
  await page.getByTestId('game-menu-toggle').focus();
  await page.keyboard.press('Tab');
  await expect(standings).toBeFocused();
  expect(await standings.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe(
    'solid',
  );
  // Wait for each native scroll; WebKit coalesces rapid PageDown presses during animation.
  for (let i = 0; i < 8; i++) {
    const before = await standings.evaluate((element) => element.scrollTop);
    const atEnd = await standings.evaluate(
      (element) => element.scrollTop + element.clientHeight >= element.scrollHeight - 1,
    );
    if (atEnd) break;
    await page.keyboard.press('PageDown');
    await expect
      .poll(() => standings.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(before);
  }
  await expect(page.getByTestId('round-standing-p11')).toBeInViewport();
  expect(errors).toEqual([]);
});

test('podium preserves shared places, solo results and the no-winner alone ending', async ({
  page,
}) => {
  await fixture(page, 'finished');
  await expect(page.getByRole('list', { name: 'Final podium' }).locator('li')).toHaveCount(3);
  await expect(page.getByTestId('result-total-p4')).toHaveText('680 XP');
  await control(
    page,
    'window.setFixture({...window.initialFixture,phase:"finished",players:window.initialFixture.players.map(p=>({...p,score:100,wins:1,winningTime:1000}))})',
  );
  await expect(page.getByRole('heading', { name: 'A shared victory!' })).toBeVisible();
  await expect(page.locator('.podium-block > span')).toHaveText(['1', '1', '1']);
  await expect(page.locator('.final-standing-list .standing-rank')).toHaveText(Array(12).fill('1'));
  await control(
    page,
    'window.setFixture({...window.initialFixture,phase:"finished",practice:true,players:[window.initialFixture.players[4]]})',
  );
  await expect(page.locator('.solo-podium li')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Practice well crafted.' })).toBeVisible();
  await control(page, 'window.setFixture({...window.initialFixture,phase:"finished",players:[]})');
  await expect(page.getByRole('heading', { name: 'Match complete.' })).toBeVisible();
  await expect(page.locator('.podium-place')).toHaveCount(0);
  await control(
    page,
    'window.setFixture({...window.initialFixture,phase:"finished",endReason:"alone"})',
  );
  await expect(
    page.getByRole('heading', { name: 'All alone? Try getting some friends, loser.' }),
  ).toBeVisible();
  await expect(page.locator('.craft-podium')).toHaveCount(0);
  await expect(page.getByTestId('rematch-button')).toHaveText('Back to lobby →');
  await control(
    page,
    'window.setFixture({...window.initialFixture,phase:"finished",endReason:"abandoned"})',
  );
  await expect(page.getByRole('heading', { name: 'The party wandered off.' })).toBeVisible();
  await expect(page.locator('.craft-podium')).toHaveCount(0);
  await expect(page.getByTestId('results')).toContainText('ended without a winner');
  await page.getByTestId('results-history-tab').click();
  await expect(page.locator('.final-history-list')).toContainText('DiamondDreamer crafted first');
});

test('round celebration and final podium keep actions visible with twelve players', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(redactTokens(error.message)));
  await mkdir('ui-progress', { recursive: true });
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 360, height: 640 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await fixture(page);
    await control(page, 'window.setFixtureTime(4000)');
    for (const scene of ['reveal', 'finished']) {
      if (scene === 'finished')
        await control(page, 'window.setFixture({...window.initialFixture,phase:"finished"})');
      const footer = page.locator(scene === 'reveal' ? '.round-summary-footer' : '.match-actions');
      const box = await footer.boundingBox();
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        viewport.width,
      );
      const scroll = page.locator(
        scene === 'reveal' ? '.round-ranking-scroll' : '.match-detail-scroll',
      );
      expect(await scroll.evaluate((element) => element.clientHeight)).toBeGreaterThanOrEqual(58);
      await scroll.evaluate((element) => element.scrollTo(0, element.scrollHeight));
      await expect(
        page.getByTestId(scene === 'reveal' ? 'round-standing-p11' : 'final-standing-p11'),
      ).toBeInViewport();
      await scroll.evaluate((element) => element.scrollTo(0, 0));
      await page.screenshot({
        path: `ui-progress/celebration-${info.project.name}-${viewport.width}-${scene}.png`,
        scale: 'css',
      });
    }
  }
  expect(errors).toEqual([]);
});
