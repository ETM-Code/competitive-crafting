import type { Grid, Item, Recipe, Settings, Target } from '../../src/shared/types';
export const VERSION = 'test';
export const itemById: Record<string, Item> = Object.fromEntries(
  ['wood', 'stone', ...Array.from({ length: 120 }, (_, i) => 'target' + i)].map((id) => [
    id,
    { id, name: id, category: 'building', icon: '' },
  ]),
);
export const DEFAULT_SETTINGS: Settings = {
  preset: 'classic',
  inventory: 'constrained',
  rounds: 3,
  seconds: 30,
  difficulty: 'progressive',
  distractors: 2,
  scoring: 'winner',
  hints: false,
};
export function pointsFor(tier: number) {
  return 50 + tier * 50;
}
export function secondsFor(settings: Settings, _tier: number, output?: string) {
  return (
    settings.seconds +
    (settings.inventory === 'creative' && output
      ? solutionFor(output).filter(Boolean).length * 2
      : 0)
  );
}
export function selectTargets(
  settings: Settings,
  _random?: () => number,
  excludedFamilies: string[] = [],
): Target[] {
  return Array.from({ length: 120 }, (_, i) => ({
    item: 'target' + i,
    tier: (i % 5) + 1,
    family: 'family' + i,
    introduced: '',
    note: '',
  }))
    .filter((target) => !excludedFamilies.includes(target.family))
    .slice(0, settings.rounds);
}
export function solutionFor(output: string): Grid {
  void output;
  return ['wood', null, null, null, null, null, null, null, null];
}
export function makePalette(output: string, distractors: number) {
  void output;
  void distractors;
  return ['wood'];
}
export function matchRecipe(grid: Grid, output?: string): Recipe | null {
  return grid.length === 9 && grid[0] === 'wood' && grid.slice(1).every((x) => x === null)
    ? { id: 'recipe', output: output ?? 'target0', count: 1, kind: 'shapeless' }
    : null;
}
