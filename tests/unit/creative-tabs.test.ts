import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import catalogue from '../../src/data/catalogue.json';
import creative from '../../src/data/creative-tabs.json';
import audit from '../../src/data/creative-source-manifest.json';

const byTab = Object.fromEntries(creative.tabs.map((tab) => [tab.id, tab]));

describe('pinned vanilla creative inventory', () => {
  it('retains native tab order and ordinary stack counts', () => {
    expect(creative.version).toBe('26.3');
    expect(creative.tabs.map((tab) => [tab.id, tab.items.length])).toEqual([
      ['building_blocks', 475],
      ['colored_blocks', 278],
      ['natural_blocks', 254],
      ['functional_blocks', 236],
      ['redstone_blocks', 70],
      ['tools_and_utilities', 149],
      ['combat', 78],
      ['food_and_drinks', 43],
      ['ingredients', 151],
      ['spawn_eggs', 89],
    ]);
    expect(creative.search).toHaveLength(1617);
    expect(new Set(creative.search).size).toBe(creative.search.length);
  });

  it('preserves native family/color order rather than alphabetic sorting', () => {
    expect(byTab.building_blocks.items.slice(0, 6)).toEqual([
      'oak_log',
      'oak_wood',
      'stripped_oak_log',
      'stripped_oak_wood',
      'oak_planks',
      'oak_stairs',
    ]);
    expect(byTab.colored_blocks.items.slice(0, 6)).toEqual([
      'white_wool',
      'light_gray_wool',
      'gray_wool',
      'black_wool',
      'brown_wool',
      'red_wool',
    ]);
    expect(byTab.tools_and_utilities.items.slice(0, 6)).toEqual([
      'wooden_shovel',
      'wooden_pickaxe',
      'wooden_axe',
      'wooden_hoe',
      'stone_shovel',
      'stone_pickaxe',
    ]);
    expect(creative.search.slice(0, 6)).toEqual(byTab.building_blocks.items.slice(0, 6));
  });

  it('supports overlapping membership without duplicate slots inside each tab', () => {
    expect(byTab.building_blocks.items).toContain('oak_planks');
    expect(byTab.functional_blocks.items).toContain('redstone_torch');
    expect(byTab.redstone_blocks.items).toContain('redstone_torch');
    expect(audit.overlappingItems).toBe(200);
    for (const tab of creative.tabs) expect(new Set(tab.items).size).toBe(tab.items.length);
  });

  it('has a rendered catalogue item for every native slot and icon', () => {
    const ids = new Set(catalogue.items.map((item) => item.id));
    const search = new Set(creative.search);
    for (const id of creative.search) expect(ids.has(id), id).toBe(true);
    for (const tab of creative.tabs) {
      expect(ids.has(tab.icon), tab.icon).toBe(true);
      for (const id of tab.items) expect(search.has(id), `${tab.id}: ${id}`).toBe(true);
    }
    expect(audit.missingNativeRenders).toEqual([]);
  });

  it('includes every supported recipe input and output in native search', () => {
    const search = new Set(creative.search);
    for (const recipe of catalogue.recipes) {
      const ingredients =
        recipe.pattern?.flat().flatMap((cell) => cell ?? []) ?? recipe.ingredients!.flat();
      for (const id of [recipe.output, ...ingredients])
        expect(search.has(id), `${recipe.id}: ${id}`).toBe(true);
    }
    expect(audit.missingRecipeItems).toEqual([]);
  });

  it('audits component variants without pretending they are plain items', () => {
    expect(audit.nativeSearchStacks).toBe(2000);
    expect(audit.excludedComponentStacks).toBe(383);
    expect(Object.values(audit.excludedComponentVariants).reduce((a, b) => a + b, 0)).toBe(383);
    expect(audit.excludedComponentVariants.enchanted_book).toBe(128);
    expect(creative.search).not.toContain('enchanted_book');
    expect(creative.search).not.toContain('potion');
    expect(creative.search).not.toContain('command_block');
    expect(audit.operatorPermissions).toBe(false);
    expect(audit.excludedTabs).toEqual(['hotbar', 'op_blocks', 'inventory']);
  });

  it('matches the metadata hash recorded by the pinned native exporter', () => {
    const hash = createHash('sha256').update(JSON.stringify(creative)).digest('hex');
    expect(hash).toBe(audit.creativeTabsSha256);
    expect(audit.sources.client.sha1).toBe('e877b6a07acd633fb3bb475002175cec036e7b87');
    expect(audit.sources.version).toBe(creative.version);
  });
});

describe('generated shaped recipe bounds', () => {
  it('contains no empty outer rows or columns but retains internal holes', () => {
    for (const recipe of catalogue.recipes) {
      if (!recipe.pattern) continue;
      const rows = recipe.pattern;
      expect(rows[0].some(Boolean), recipe.id).toBe(true);
      expect(rows.at(-1)!.some(Boolean), recipe.id).toBe(true);
      expect(
        rows.some((row) => row[0]),
        recipe.id,
      ).toBe(true);
      expect(
        rows.some((row) => row.at(-1)),
        recipe.id,
      ).toBe(true);
    }
    expect(catalogue.recipes.find((recipe) => recipe.id === 'chest')!.pattern![1][1]).toBeNull();
    expect(
      catalogue.recipes
        .find((recipe) => recipe.id === 'spyglass')!
        .pattern!.map((row) => row.length),
    ).toEqual([1, 1, 1]);
    expect(
      catalogue.recipes.find((recipe) => recipe.id === 'mace')!.pattern!.map((row) => row.length),
    ).toEqual([1, 1]);
  });
});
