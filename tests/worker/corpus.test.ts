import { describe, expect, it } from 'vitest';
import { addMember, advance, command, createGame, snapshot } from '../../worker/game';
import { PRESETS, secondsFor } from '../../src/shared/rules';
import { solutionFor } from '../../src/shared/recipes';
import { clientMessageSchema, settingsSchema } from '../../src/shared/protocol';
import { recipes } from '../../src/shared/catalogue';
import type { Grid, Recipe } from '../../src/shared/types';

function transformedGrids(recipe: Recipe): Grid[] {
  // Independent oracle: discard empty borders without calling runtime normalization.
  const pattern = recipe.pattern!.map((row) => [...row]);
  while (pattern.length && pattern[0].every((cell) => cell === null)) pattern.shift();
  while (pattern.length && pattern.at(-1)!.every((cell) => cell === null)) pattern.pop();
  while (pattern.length && pattern.every((row) => row[0] === null))
    pattern.forEach((row) => row.shift());
  while (pattern.length && pattern.every((row) => row.at(-1) === null))
    pattern.forEach((row) => row.pop());
  const grids = new Map<string, Grid>();
  for (let y = 0; y <= 3 - pattern.length; y++) {
    for (let x = 0; x <= 3 - pattern[0].length; x++) {
      for (const mirror of [false, true]) {
        const grid: Grid = Array(9).fill(null);
        pattern.forEach((row, dy) => {
          const cells = mirror ? [...row].reverse() : row;
          cells.forEach((ingredient, dx) => {
            grid[(y + dy) * 3 + x + dx] = ingredient?.[0] ?? null;
          });
        });
        grids.set(JSON.stringify(grid), grid);
      }
    }
  }
  return [...grids.values()];
}
const shaped = recipes.filter((recipe) => recipe.kind === 'shaped');
const transforms = shaped.flatMap((recipe) =>
  transformedGrids(recipe).map((grid) => ({ recipe, grid })),
);

describe('server integration with generated catalogue and shared APIs', () => {
  it(`accepts all ${transforms.length} distinct offset/mirror grids across ${shaped.length} shaped recipes`, () => {
    const game = createGame('ABC234', true, PRESETS.classic, 1000);
    const player = addMember(game, 'ShapeCheck', 'creeper', 1000);
    player.player.connected = true;
    player.connection = 'test';
    player.disconnectedAt = null;
    for (const { recipe, grid } of transforms) {
      const before = player.player.score;
      game.public.phase = 'playing';
      game.public.deadline = 31000;
      game.public.round = {
        id: recipe.id,
        index: 0,
        target: recipe.output,
        tier: 1,
        points: 100,
        palette: [...new Set(grid.filter((id): id is string => id !== null))],
        startsAt: 1000,
        endsAt: 31000,
        finishers: [],
        endReason: null,
        standings: [],
        playerStates: {
          [player.player.id]: {
            forfeited: false,
            expired: false,
            grid: Array(9).fill(null),
          },
        },
      };
      command(game, player, { type: 'grid', roundId: recipe.id, grid }, 1100);
      expect(player.player.score).toBe(before);
      command(game, player, { type: 'collect', roundId: recipe.id, grid }, 1200);
      expect(player.player.score, `${recipe.id}: ${JSON.stringify(grid)}`).toBe(before + 100);
      expect(game.public.phase).toBe('reveal');
    }
  });
  for (const preset of ['classic', 'blitz', 'all-finish'] as const) {
    it(`completes a full ${preset} practice match and rematch using real recipes`, () => {
      let now = 1000;
      const game = createGame('ABC234', true, PRESETS[preset], now);
      expect(settingsSchema.safeParse(game.public.settings).success).toBe(true);
      const player = addMember(game, 'Practice', 'steve', now);
      player.player.connected = true;
      player.connection = 'test';
      player.disconnectedAt = null;
      command(game, player, { type: 'ready', ready: true }, now);
      command(game, player, { type: 'start' }, now);
      const selected: string[] = [];
      while (game.public.phase !== 'finished') {
        now = game.public.deadline!;
        advance(game, now);
        if (game.public.phase !== 'playing') continue;
        const round = snapshot(game, now).round!;
        selected.push(round.target);
        expect(round.endsAt - round.startsAt).toBe(
          secondsFor(game.public.settings, round.tier, round.target) * 1000,
        );
        const grid = solutionFor(round.target);
        expect(grid.filter((id) => id !== null).every((id) => round.palette.includes(id!))).toBe(
          true,
        );
        const claim = { type: 'collect' as const, roundId: round.id, grid };
        expect(clientMessageSchema.safeParse(claim).success).toBe(true);
        command(game, player, { ...claim, type: 'grid' }, now + 100);
        command(game, player, claim, now + 200);
        expect(game.public.phase).toBe('reveal');
      }
      expect(selected).toHaveLength(PRESETS[preset].rounds);
      expect(new Set(selected).size).toBe(selected.length);
      expect(player.player.wins).toBe(selected.length);
      expect(player.player.score).toBeGreaterThan(0);
      command(game, player, { type: 'rematch' }, now + 100);
      expect(game.public.phase).toBe('lobby');
      expect(player.player.score).toBe(0);
    });
  }
});
