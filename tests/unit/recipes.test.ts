import { describe, expect, it } from 'vitest';
import { items, recipes, recipesByOutput, targets } from '../../src/shared/catalogue';
import {
  makePalette,
  matches,
  matchRecipe,
  recipeGrid,
  solutionFor,
} from '../../src/shared/recipes';
import {
  DEFAULT_SETTINGS,
  PRESETS,
  pointsFor,
  secondsFor,
  selectTargets,
} from '../../src/shared/rules';
import { clientMessageSchema } from '../../src/shared/protocol';
import type { Grid, Recipe } from '../../src/shared/types';

function rng(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

describe('canonical recipe corpus', () => {
  it('contains the full versioned creative catalogue and recent recipes', () => {
    expect(items.length).toBeGreaterThan(1500);
    expect(recipes.length).toBeGreaterThan(1000);
    expect(recipesByOutput.copper_chest).toBeDefined();
  });

  it('matches every recipe, all shaped offsets/mirrors and randomized tag combinations', () => {
    const random = rng(103);
    for (const recipe of recipes) {
      const grid = recipeGrid(recipe, (set) => set[Math.floor(random() * set.length)]);
      expect(matches(grid, recipe), recipe.id).toBe(true);
      if (recipe.kind === 'shaped') {
        const height = recipe.pattern!.length;
        const width = recipe.pattern![0].length;
        for (let y = 0; y <= 3 - height; y++) {
          for (let x = 0; x <= 3 - width; x++) {
            for (const mirrored of [false, true]) {
              const shifted: Grid = Array(9).fill(null);
              for (let row = 0; row < height; row++) {
                for (let col = 0; col < width; col++) {
                  shifted[(y + row) * 3 + x + col] =
                    grid[row * 3 + (mirrored ? width - 1 - col : col)];
                }
              }
              expect(matches(shifted, recipe), `${recipe.id} at ${x},${y} mirror=${mirrored}`).toBe(
                true,
              );
            }
          }
        }
      } else {
        expect(matches([...grid].reverse(), recipe), recipe.id).toBe(true);
      }
      const removed = [...grid];
      removed[removed.findIndex((item) => item !== null)] = null;
      expect(matches(removed, recipe), `${recipe.id} missing cell`).toBe(false);
      const wrong = [...grid];
      wrong[wrong.findIndex((item) => item !== null)] = 'not_a_real_item';
      expect(matches(wrong, recipe)).toBe(false);
    }
  });

  it('accepts mixed planks but not extra ingredients or rotated shaped recipes', () => {
    const chest = solutionFor('chest');
    chest[0] = 'birch_planks';
    chest[1] = 'spruce_planks';
    expect(matchRecipe(chest, 'chest')?.output).toBe('chest');
    chest[4] = 'oak_planks';
    expect(matchRecipe(chest, 'chest')).toBeNull();
    const torch: Grid = ['coal', 'stick', null, null, null, null, null, null, null];
    expect(matchRecipe(torch, 'torch')).toBeNull();
  });

  it('accepts shovels in every column and both axe directions at either offset', () => {
    for (const material of ['wooden', 'stone', 'iron', 'golden', 'diamond']) {
      const shovel = solutionFor(`${material}_shovel`);
      for (let column = 0; column < 3; column++) {
        const grid: Grid = Array(9).fill(null);
        for (let row = 0; row < 3; row++) grid[row * 3 + column] = shovel[row * 3];
        expect(matchRecipe(grid, `${material}_shovel`)?.output).toBe(`${material}_shovel`);
      }
      const axe = solutionFor(`${material}_axe`);
      for (const mirrored of [false, true]) {
        for (let column = 0; column < 2; column++) {
          const grid: Grid = Array(9).fill(null);
          for (let row = 0; row < 3; row++) {
            for (let x = 0; x < 2; x++)
              grid[row * 3 + column + x] = axe[row * 3 + (mirrored ? 1 - x : x)];
          }
          expect(matchRecipe(grid, `${material}_axe`)?.output).toBe(`${material}_axe`);
        }
      }
    }
  });

  it('resolves overlapping shapeless tags rather than greedily consuming ingredients', () => {
    const recipe: Recipe = {
      id: 'overlap-fixture',
      output: 'stick',
      count: 1,
      kind: 'shapeless',
      ingredients: [['oak_planks', 'birch_planks'], ['oak_planks']],
    };
    expect(
      matches(['oak_planks', 'birch_planks', null, null, null, null, null, null, null], recipe),
    ).toBe(true);
    expect(
      matches(['birch_planks', 'birch_planks', null, null, null, null, null, null, null], recipe),
    ).toBe(false);
  });

  it('always supplies a valid constrained solution and unique palette', () => {
    for (const target of targets) {
      const solution = solutionFor(target.item);
      expect(matchRecipe(solution, target.item)).not.toBeNull();
      for (let seed = 0; seed < 30; seed++) {
        const palette = makePalette(target.item, 10, rng(seed));
        expect(solution.filter(Boolean).every((id) => palette.includes(id!))).toBe(true);
        expect(new Set(palette).size).toBe(palette.length);
        expect(palette).not.toContain(target.item);
      }
    }
  });

  it('uses five increasing difficulty tiers with the calibrated common recipes', () => {
    expect(selectTargets(DEFAULT_SETTINGS, rng(7)).map((t) => t.tier)).toEqual([
      1, 1, 1, 2, 2, 3, 3, 4, 4, 5,
    ]);
    expect(DEFAULT_SETTINGS.rounds).toBe(10);
    expect(DEFAULT_SETTINGS.seconds).toBe(30);
    expect(PRESETS).not.toHaveProperty('memory');
    expect(secondsFor(DEFAULT_SETTINGS, 5, 'crafter')).toBe(30);
    expect(secondsFor(PRESETS.blitz, 5, 'crafter')).toBe(15);
    expect(secondsFor({ ...DEFAULT_SETTINGS, inventory: 'creative' }, 5, 'crafter')).toBe(48);
    expect(secondsFor({ ...PRESETS.blitz, inventory: 'creative' }, 1, 'torch')).toBe(19);
    expect([1, 2, 3, 4, 5].map(pointsFor)).toEqual([100, 150, 200, 250, 300]);
    for (const id of [
      'crafting_table',
      'torch',
      'stick',
      'chest',
      'furnace',
      'bucket',
      'iron_pickaxe',
    ]) {
      expect(targets.find((t) => t.item === id)?.tier).toBe(1);
    }
    for (const target of targets.filter((t) => t.tier === 5)) {
      expect(solutionFor(target.item).filter(Boolean).length).toBeGreaterThanOrEqual(8);
    }
  });

  it('has unique targets even for ten-round easy or expert custom games', () => {
    for (const difficulty of ['easy', 'expert', 'progressive'] as const) {
      const match = selectTargets({ ...DEFAULT_SETTINGS, difficulty, rounds: 10 }, rng(100));
      expect(new Set(match.map((t) => t.item)).size).toBe(10);
      expect(new Set(match.map((t) => t.family ?? t.item)).size).toBe(10);
    }
  });

  it('bounds the network submission format and rejects forged extra fields', () => {
    const valid = { type: 'collect', roundId: 'round-1', grid: solutionFor('chest') };
    expect(clientMessageSchema.safeParse(valid).success).toBe(true);
    expect(clientMessageSchema.safeParse({ ...valid, points: 9999 }).success).toBe(false);
    expect(clientMessageSchema.safeParse({ ...valid, grid: Array(10).fill('stone') }).success).toBe(
      false,
    );
  });
});
