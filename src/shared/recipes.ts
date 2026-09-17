import { itemById, recipes, recipesByOutput } from './catalogue';
import type { Grid, Recipe } from './types';

export function matches(grid: Grid, recipe: Recipe): boolean {
  if (grid.length !== 9 || grid.some((id) => id !== null && !itemById[id])) return false;
  if (recipe.kind === 'shapeless') {
    const occupied = grid.filter((id): id is string => id !== null);
    const ingredients = recipe.ingredients ?? [];
    if (occupied.length !== ingredients.length) return false;
    // Match the most restricted ingredient first; greedy matching fails for overlapping tags.
    const choices = ingredients
      .map((set) => occupied.map((id, i) => (set.includes(id) ? i : -1)).filter((i) => i >= 0))
      .sort((a, b) => a.length - b.length);
    function assign(index: number, used: number): boolean {
      if (index === choices.length) return true;
      return choices[index].some(
        (slot) => !(used & (1 << slot)) && assign(index + 1, used | (1 << slot)),
      );
    }
    return assign(0, 0);
  }
  const pattern = recipe.pattern ?? [];
  const height = pattern.length;
  const width = Math.max(0, ...pattern.map((row) => row.length));
  if (!width || !height || width > 3 || height > 3) return false;
  for (let y = 0; y <= 3 - height; y++) {
    for (let x = 0; x <= 3 - width; x++) {
      for (const mirrored of [false, true]) {
        let valid = true;
        for (let row = 0; row < 3 && valid; row++) {
          for (let col = 0; col < 3; col++) {
            const px = mirrored ? width - 1 - (col - x) : col - x;
            const inside = row >= y && row < y + height && col >= x && col < x + width;
            const ingredient = inside ? pattern[row - y][px] : null;
            const actual = grid[row * 3 + col];
            if (ingredient ? actual === null || !ingredient.includes(actual) : actual !== null) {
              valid = false;
              break;
            }
          }
        }
        if (valid) return true;
      }
    }
  }
  return false;
}

export function matchRecipe(grid: Grid, output?: string): Recipe | null {
  if (grid.length !== 9 || grid.every((id) => id === null)) return null;
  return (
    (output ? (recipesByOutput[output] ?? []) : recipes).find((recipe) => matches(grid, recipe)) ??
    null
  );
}

function preferred(set: string[]): string {
  return (
    ['oak_planks', 'oak_slab', 'oak_log', 'cobblestone', 'coal', 'white_wool'].find((id) =>
      set.includes(id),
    ) ?? set[0]
  );
}
export function recipeGrid(recipe: Recipe, choose = preferred): Grid {
  const grid: Grid = Array(9).fill(null);
  if (recipe.kind === 'shaped')
    recipe.pattern?.forEach((row, y) =>
      row.forEach((set, x) => {
        if (set) grid[y * 3 + x] = choose(set);
      }),
    );
  else
    recipe.ingredients?.forEach((set, index) => {
      grid[index] = choose(set);
    });
  return grid;
}
export function solutionFor(output: string): Grid {
  const candidates = recipesByOutput[output] ?? [];
  const recipe = candidates.find((r) => r.kind === 'shaped') ?? candidates[0];
  if (!recipe) throw new Error(`No supported recipe for ${output}`);
  return recipeGrid(recipe);
}
export function shuffle<T>(values: T[], random: () => number = Math.random): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
const distractorIds = [
  'iron_ingot',
  'copper_ingot',
  'gold_ingot',
  'iron_nugget',
  'gold_nugget',
  'redstone',
  'stick',
  'oak_planks',
  'oak_slab',
  'cobblestone',
  'stone',
  'smooth_stone',
  'quartz',
  'diamond',
  'amethyst_shard',
  'coal',
  'charcoal',
  'glass',
  'glass_pane',
  'leather',
  'string',
  'paper',
  'feather',
  'flint',
  'blaze_rod',
  'slime_ball',
  'honeycomb',
  'chest',
  'furnace',
  'crafting_table',
  'dropper',
  'dispenser',
  'repeater',
  'comparator',
  'redstone_torch',
  'book',
  'white_wool',
];
export function makePalette(
  output: string,
  distractors: number,
  random: () => number = Math.random,
): string[] {
  const required = [...new Set(solutionFor(output).filter((id): id is string => id !== null))];
  const categories = new Set(required.map((id) => itemById[id]?.category));
  const possible = distractorIds.filter(
    (id) => itemById[id] && !required.includes(id) && id !== output,
  );
  const plausible = shuffle(
    possible.filter((id) => categories.has(itemById[id].category)),
    random,
  );
  const others = shuffle(
    possible.filter((id) => !categories.has(itemById[id].category)),
    random,
  );
  return shuffle(
    [...required, ...[...plausible, ...others].slice(0, Math.max(0, distractors))],
    random,
  );
}
