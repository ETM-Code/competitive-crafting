import { test, expect } from './fixtures';
import { mkdir } from 'node:fs/promises';

test('animation fixtures freeze, replay and remain visible with reduced motion', async ({
  page,
}, info) => {
  await mkdir('ui-progress', { recursive: true });
  await page.goto('/__lab');
  await expect(page.getByTestId('crafting-grid')).toBeVisible();
  await page.locator('.lab-toolbar > summary').click();
  await page.getByRole('combobox', { name: 'Fixture' }).selectOption('reveal');
  await expect(page.getByTestId('recipe-reveal')).toBeVisible();
  await page.screenshot({ path: `ui-progress/${info.project.name}-reveal.png`, scale: 'css' });
  await page.getByRole('combobox', { name: 'Fixture' }).selectOption('playing');
  await expect(page.getByTestId('crafting-grid')).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const animated = await page.evaluate(
    () => document.getAnimations().filter((animation) => animation.playState === 'running').length,
  );
  expect(animated).toBe(0);
  await page.getByRole('combobox', { name: 'Fixture' }).selectOption('finished');
  await expect(page.getByTestId('results')).toBeVisible();
  await page.screenshot({ path: `ui-progress/${info.project.name}-results.png`, scale: 'css' });
});
