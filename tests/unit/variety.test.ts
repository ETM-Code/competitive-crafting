import { describe, expect, it } from 'vitest';
import { recipesByOutput, targets } from '../../src/shared/catalogue';
import { matchRecipe, solutionFor } from '../../src/shared/recipes';
import { DEFAULT_SETTINGS, selectTargets } from '../../src/shared/rules';
import type { Target } from '../../src/shared/types';

function rng(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function remember(previous: string[], chosen: Target[]) {
  return [
    ...new Set([...previous, ...chosen.map((target) => target.family ?? target.item)].reverse()),
  ]
    .slice(0, 50)
    .reverse();
}

describe('recipe variety', () => {
  it('offers distinct families in the formerly narrow starter, specialist and finale tiers', () => {
    for (const [tier, minimum] of [
      [1, 60],
      [2, 130],
      [3, 80],
      [4, 25],
      [5, 15],
    ]) {
      const pool = targets.filter((target) => target.tier === tier);
      expect(
        new Set(pool.map((target) => target.family)).size,
        `tier ${tier}`,
      ).toBeGreaterThanOrEqual(minimum);
    }
    expect(new Set(targets.map((target) => target.item)).size).toBe(targets.length);
    for (const item of [
      'crafting_table',
      'torch',
      'stick',
      'chest',
      'furnace',
      'bucket',
      'iron_pickaxe',
    ])
      expect(targets.find((target) => target.item === item)?.tier, item).toBe(1);
    for (const item of ['ladder', 'bow'])
      expect(targets.find((target) => target.item === item)?.tier, item).toBe(2);
  });

  it('keeps finales authentic full-grid challenges rather than color variants or basic recipes', () => {
    const pool = targets.filter((target) => target.tier === 5);
    for (const item of [
      'copper_chest',
      'copper_lantern',
      'crafter',
      'dried_ghast',
      'golden_dandelion',
    ])
      expect(
        pool.some((target) => target.item === item),
        item,
      ).toBe(true);
    expect(new Set(pool.map((target) => target.family)).size).toBe(pool.length);
    for (const target of pool) {
      expect(target.finaleEligible, target.item).toBe(true);
      expect(matchRecipe(solutionFor(target.item), target.item), target.item).not.toBeNull();
      for (const recipe of recipesByOutput[target.item]) {
        const occupied =
          recipe.pattern?.flat().filter((cell) => cell !== null) ?? recipe.ingredients!;
        expect(occupied.length, recipe.id).toBeGreaterThanOrEqual(8);
        expect(
          new Set(occupied.map((choices) => [...choices].sort().join('|'))).size,
          recipe.id,
        ).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('chooses the least recently played family instead of forgetting an exhausted tier', () => {
    const finalists = targets.filter((target) => target.tier === 5);
    const recent = [...new Set(targets.map((target) => target.family ?? target.item))];
    const chosen = selectTargets(DEFAULT_SETTINGS, () => 0, recent);
    expect(chosen.at(-1)?.family).toBe(finalists[0].family);
  });

  it('avoids repeated families within matches even when every family has recent history', () => {
    const recent = [...new Set(targets.map((target) => target.family ?? target.item))];
    for (const difficulty of ['easy', 'expert', 'progressive'] as const) {
      for (const rounds of [3, 5, 10]) {
        for (let seed = 1; seed <= 10; seed++) {
          const chosen = selectTargets(
            { ...DEFAULT_SETTINGS, difficulty, rounds },
            rng(seed),
            recent,
          );
          expect(chosen).toHaveLength(rounds);
          expect(new Set(chosen.map((target) => target.item)).size).toBe(rounds);
          expect(new Set(chosen.map((target) => target.family)).size).toBe(rounds);
        }
      }
    }
  });

  it('rotates rematches without repeating a target from the preceding five matches', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const random = rng(seed);
      let recent: string[] = [];
      const prior: Target[][] = [];
      for (let match = 0; match < 30; match++) {
        const chosen = selectTargets(DEFAULT_SETTINGS, random, recent);
        const priorItems = new Set(
          prior
            .slice(-5)
            .flat()
            .map((target) => target.item),
        );
        expect(
          chosen.filter((target) => priorItems.has(target.item)),
          `seed ${seed}, match ${match}`,
        ).toEqual([]);
        recent = remember(recent, chosen);
        prior.push(chosen);
      }
    }
  });
});
