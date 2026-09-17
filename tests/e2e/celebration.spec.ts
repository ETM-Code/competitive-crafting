import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

async function fixture(page: Page, scene = 'reveal') {
  const source = await (await page.request.get('/src/components/Results.tsx')).text();
  const react = source.match(/from "([^"]*\/react\.js[^"]*)"/)?.[1];
  if (!react) throw new Error('Vite React module path was unavailable');
  await page.route('**/celebration-fixture', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<link rel="stylesheet" href="/src/styles/game.css"><link rel="stylesheet" href="/src/styles/mobile.css"><link rel="stylesheet" href="/src/styles/screens.css">
<style>html,body,#root{height:100%;margin:0}#root{padding:16px;box-sizing:border-box;background:#24382b}.fixture-root{height:100%;min-height:0}</style>
<script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script></head><body><div id="root" data-fixture-clock></div><script type="module">
import React from '${react}';import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';import {RoundSummary} from '/src/components/RoundSummary.tsx';import {Results} from '/src/components/Results.tsx';import {solutionFor} from '/src/shared/recipes.ts';import {DEFAULT_SETTINGS} from '/src/shared/rules.ts';import {playerRanks} from '/src/components/Scoreboard.tsx';
const names=['BirchBuilder','RedstoneRider','CreeperKeeper','CopperCrafter','DiamondDreamer','IronExplorer','LongPlayerNameTwenty','VillageKeeper','BlockBreaker','QuartzQuester','WoolWizard','StoneSeeker'];const avatars=['creeper','pig','ender_dragon','wither','zombie','iron_golem'];const before=names.map((name,i)=>({id:'p'+i,name,avatar:avatars[i%6],score:500-i*30,wins:1,winningTime:10000+i*100,connected:true,ready:true,spectator:false}));const players=before.map((p,i)=>({...p,score:p.score+(i===4?300:0)}));const ranksBefore=playerRanks(before),ranksAfter=playerRanks(players);const standings=players.map((p,i)=>({playerId:p.id,name:p.name,avatar:p.avatar,scoreBefore:before[i].score,scoreAfter:p.score,points:i===4?300:0,rankBefore:ranksBefore.get(p.id),rankAfter:ranksAfter.get(p.id),status:i===4?'crafted':i===2?'forfeited':'timeout'}));const initial={code:'ABC123',hostId:'p4',phase:'${scene}',settings:DEFAULT_SETTINGS,players,deadline:8000,serverNow:0,revision:1,practice:false,history:[{target:'crafter',winnerId:'p4',points:300,endReason:'crafted',standings}],round:{id:'r1',index:6,target:'crafter',tier:5,points:300,palette:[],startsAt:-30000,endsAt:0,finishers:[{playerId:'p4',points:300,elapsed:9200}],playerStates:{},endReason:'crafted',standings,solution:solutionFor('crafter')}};
function App(){const [room,setRoom]=React.useState(initial);const [now,setNow]=React.useState(0);window.setFixture=setRoom;window.setFixtureTime=setNow;return React.createElement('div',{className:'fixture-root'},room.phase==='reveal'?React.createElement(RoundSummary,{room,session:{code:'ABC123',playerId:'p4',token:'fixture'},now,onOpenMenu:()=>{}}):React.createElement(Results,{room,session:{code:'ABC123',playerId:'p4',token:'fixture'},connected:true,send:()=>true,onLeave:()=>{}}))};ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));window.initialFixture=initial;
</script></body></html>`,
    }),
  );
  await page.goto('/celebration-fixture');
  await expect(page.getByTestId(scene === 'reveal' ? 'round-summary' : 'results')).toBeVisible();
}

const control = (page: Page, expression: string) =>
  page.evaluate((code) => {
    // Test-only fixture control; the route body is supplied by Playwright, never shipped.
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

test('round standings can be reached and scrolled using the keyboard', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
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
  for (let i = 0; i < 8; i++) await page.keyboard.press('PageDown');
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
  page.on('pageerror', (error) => errors.push(error.message));
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
