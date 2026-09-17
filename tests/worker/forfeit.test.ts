vi.mock('../../src/shared/catalogue', () => import('./fixtures'));
vi.mock('../../src/shared/recipes', () => import('./fixtures'));
vi.mock('../../src/shared/rules', () => import('./fixtures'));
import { describe, expect, it, vi } from 'vitest';
import {
  addMember,
  advance,
  command,
  createGame,
  disconnect,
  nextAlarm,
  snapshot,
  upgradeGame,
} from '../../worker/game';
import type { Grid, Settings } from '../../src/shared/types';
import { COUNTDOWN_MS, DEFAULT_SETTINGS, REVEAL_MS, solutionFor } from './fixtures';
import { clientMessageSchema } from '../../src/shared/protocol';
const blank = (): Grid => Array(9).fill(null);
function playing(count = 2, settings: Settings = DEFAULT_SETTINGS) {
  const game = createGame('ABC234', count === 1, settings, 1000);
  const members = Array.from({ length: count }, (_, i) =>
    addMember(game, 'Player' + i, 'creeper', 1000),
  );
  for (const m of members) {
    m.connection = m.player.id;
    m.disconnectedAt = null;
    m.player.connected = true;
    command(game, m, { type: 'ready', ready: true }, 1000);
  }
  command(game, members[0], { type: 'start' }, 1000);
  advance(game, 4000);
  const round = game.public.round!;
  const forfeit = (i: number, now = 4100) =>
    command(game, members[i], { type: 'forfeit', roundId: round.id }, now);
  const grid = (i: number, value = solutionFor(round.target), now = 4200) =>
    command(game, members[i], { type: 'grid', roundId: round.id, grid: value }, now);
  const collect = (i: number, now = 4300) =>
    command(
      game,
      members[i],
      { type: 'collect', roundId: round.id, grid: solutionFor(round.target) },
      now,
    );
  return {
    game,
    members,
    round,
    forfeit,
    grid,
    collect,
    player: (i: number) => round.playerStates[members[i].player.id],
  };
}
describe('host-controlled round intermissions', () => {
  it('accepts only a bounded round-scoped skip command', () => {
    expect(clientMessageSchema.safeParse({ type: 'skipReveal', roundId: 'round-1' }).success).toBe(
      true,
    );
    expect(clientMessageSchema.safeParse({ type: 'skipReveal' }).success).toBe(false);
    expect(clientMessageSchema.safeParse({ type: 'skipReveal', roundId: '' }).success).toBe(false);
    expect(
      clientMessageSchema.safeParse({ type: 'skipReveal', roundId: 'x'.repeat(81) }).success,
    ).toBe(false);
  });
  it('lets the connected host shorten only the reveal, preserving awards and the next countdown', () => {
    const h = playing();
    h.grid(0);
    h.collect(0);
    const history = structuredClone(h.game.public.history);
    command(h.game, h.members[0], { type: 'skipReveal', roundId: h.round.id }, 4400);
    expect(h.game.public.phase).toBe('countdown');
    expect(h.game.public.round).toBeNull();
    expect(h.game.public.deadline).toBe(4400 + COUNTDOWN_MS);
    expect(nextAlarm(h.game)).toBe(4400 + COUNTDOWN_MS);
    expect(h.game.public.history).toEqual(history);
    expect(h.members.map((member) => member.player.score)).toEqual([100, 0]);
    advance(h.game, 4400 + COUNTDOWN_MS);
    expect(h.game.public.round?.index).toBe(1);
    expect(h.game.public.round?.startsAt).toBe(4400 + COUNTDOWN_MS);
  });
  it('rejects guests, disconnected or removed hosts, wrong phases and stale round IDs', () => {
    const h = playing();
    const skip = (member = h.members[0], roundId = h.round.id) =>
      command(h.game, member, { type: 'skipReveal', roundId }, 4400);
    expect(skip).toThrow('reveal has ended');
    h.forfeit(0);
    h.forfeit(1);
    const unchanged = structuredClone(h.game.public);
    expect(() => skip(h.members[1])).toThrow('Only the host');
    expect(() => skip(h.members[0], 'stale')).toThrow('reveal has ended');
    h.members[0].player.connected = false;
    expect(skip).toThrow('not connected');
    h.members[0].player.connected = true;
    h.members[0].connection = null;
    expect(skip).toThrow('not connected');
    h.members[0].connection = h.members[0].player.id;
    expect(() => skip({ ...h.members[0] })).toThrow('not connected');
    expect(h.game.public).toEqual(unchanged);
  });
  it('a replay cannot bypass another countdown or a later reveal', () => {
    const h = playing(1);
    h.forfeit(0);
    const skip = () =>
      command(h.game, h.members[0], { type: 'skipReveal', roundId: h.round.id }, 4400);
    skip();
    expect(skip).toThrow('reveal has ended');
    expect(h.game.public.deadline).toBe(4400 + COUNTDOWN_MS);
    advance(h.game, 4400 + COUNTDOWN_MS);
    const next = h.game.public.round!;
    command(h.game, h.members[0], { type: 'forfeit', roundId: next.id }, 7500);
    expect(skip).toThrow('reveal has ended');
    expect(h.game.public.phase).toBe('reveal');
    expect(h.game.public.round?.id).toBe(next.id);
    expect(h.game.public.history).toHaveLength(2);
  });
  it('skips the final reveal to results and otherwise advances automatically after five seconds', () => {
    const h = playing(1, { ...DEFAULT_SETTINGS, rounds: 3 });
    expect(REVEAL_MS).toBe(5000);
    for (let index = 0; index < 3; index++) {
      const round = h.game.public.round!;
      const now = round.startsAt + 100;
      command(h.game, h.members[0], { type: 'forfeit', roundId: round.id }, now);
      if (index < 2) {
        advance(h.game, now + REVEAL_MS - 1);
        expect(h.game.public.phase).toBe('reveal');
        advance(h.game, now + REVEAL_MS + COUNTDOWN_MS);
      } else {
        command(h.game, h.members[0], { type: 'skipReveal', roundId: round.id }, now + 1);
      }
    }
    expect(h.game.public.phase).toBe('finished');
    expect(h.game.public.deadline).toBeNull();
    expect(h.game.public.history).toHaveLength(3);
    expect(h.members[0].player.score).toBe(0);
  });
  it('honors host transfer and does not extend a reveal at its deadline', () => {
    const h = playing(3);
    h.grid(0);
    h.collect(0);
    disconnect(h.game, h.members[0], 4350);
    expect(h.game.public.hostId).toBe(h.members[1].player.id);
    expect(() =>
      command(h.game, h.members[0], { type: 'skipReveal', roundId: h.round.id }, 4400),
    ).toThrow('Only the host');
    const deadline = h.game.public.deadline!;
    expect(() =>
      command(h.game, h.members[1], { type: 'skipReveal', roundId: h.round.id }, deadline),
    ).toThrow('reveal has ended');
    command(h.game, h.members[1], { type: 'skipReveal', roundId: h.round.id }, 4400);
    expect(h.game.public.phase).toBe('countdown');
    expect(h.game.public.history[0].points).toBe(100);
  });
});

describe('forfeit authority and round standings', () => {
  it('tracks one common clock, isolated grids and no legacy flags', () => {
    const h = playing();
    expect(h.player(0)).toEqual({ forfeited: false, expired: false, grid: blank() });
    expect(h.player(0).grid).not.toBe(h.player(1).grid);
    expect(nextAlarm(h.game)).toBe(34000);
    h.grid(0);
    expect(h.members[0].player.score).toBe(0);
  });
  it('forfeits irreversibly at zero points while peers retain their clock', () => {
    const h = playing();
    h.grid(0);
    h.forfeit(0, 4250);
    expect(h.player(0)).toEqual({ forfeited: true, expired: false, grid: blank() });
    expect(h.game.public.phase).toBe('playing');
    expect(h.round.endsAt).toBe(34000);
    expect(() => h.grid(0)).toThrow('forfeited');
    expect(() => h.collect(0)).toThrow('forfeited');
    h.forfeit(0, 4260);
    h.grid(1);
    h.collect(1);
    expect(h.members.map((m) => m.player.score)).toEqual([0, 100]);
    expect(h.round.endReason).toBe('crafted');
    expect(h.round.standings.map((s) => s.status)).toEqual(['forfeited', 'crafted']);
  });
  it('all forfeits reveal once immediately, then keep the shared five-second interval', () => {
    const h = playing();
    h.forfeit(0);
    h.forfeit(1, 4200);
    h.forfeit(1, 4300);
    expect(h.game.public.phase).toBe('reveal');
    expect(h.round.endReason).toBe('forfeit');
    expect(h.game.public.history).toHaveLength(1);
    expect(h.game.public.deadline).toBe(4200 + REVEAL_MS);
    expect(
      h.round.standings.every((s) => s.points === 0 && s.rankBefore === 1 && s.rankAfter === 1),
    ).toBe(true);
    advance(h.game, 4200 + REVEAL_MS);
    expect(h.game.public.phase).toBe('countdown');
    advance(h.game, 4200 + REVEAL_MS + 3000);
    expect(Object.values(h.game.public.round!.playerStates).every((s) => !s.forfeited)).toBe(true);
    expect(() => h.forfeit(0, 20000)).toThrow('not accepting');
  });
  it('a solo forfeit skips the crafting time without awarding a win', () => {
    const h = playing(1);
    h.forfeit(0);
    expect(h.game.public.phase).toBe('reveal');
    expect(h.members[0].player.wins).toBe(0);
  });
  it('all-finish resolves a mix of crafts and forfeits and freezes score/rank deltas', () => {
    const h = playing(3, { ...DEFAULT_SETTINGS, scoring: 'all-finish' });
    h.grid(1);
    h.collect(1);
    h.forfeit(0, 4400);
    expect(h.game.public.phase).toBe('playing');
    h.grid(2, solutionFor(h.round.target), 4500);
    h.collect(2, 4600);
    expect(h.members.map((m) => m.player.score)).toEqual([0, 100, 75]);
    expect(h.game.public.phase).toBe('reveal');
    expect(h.round.standings.map((s) => [s.points, s.rankBefore, s.rankAfter])).toEqual([
      [0, 1, 3],
      [100, 1, 1],
      [75, 1, 2],
    ]);
    const history = structuredClone(h.game.public.history);
    h.members[1].player.name = 'Changed';
    h.members[1].player.score = 999;
    expect(h.game.public.history).toEqual(history);
  });
  it('spectators cannot forfeit and never block all-forfeit completion', () => {
    const h = playing();
    const watcher = addMember(h.game, 'Watcher', 'pig', 4100);
    watcher.player.connected = true;
    watcher.connection = 'watch';
    expect(() => command(h.game, watcher, { type: 'forfeit', roundId: h.round.id }, 4100)).toThrow(
      'Spectators',
    );
    h.forfeit(0);
    h.forfeit(1);
    expect(h.round.standings).toHaveLength(2);
  });
  it('labels all connected participants forfeiting as forfeit after a peer leaves', () => {
    const h = playing(3);
    disconnect(h.game, h.members[2], 4100);
    h.forfeit(0);
    h.forfeit(1);
    expect(h.game.public.phase).toBe('reveal');
    expect(h.round.endReason).toBe('forfeit');
    expect(h.round.standings.every((standing) => standing.points === 0)).toBe(true);
  });
  it('timeout respects exact deadline, never gives points and rejects late forfeit', () => {
    const h = playing();
    expect(() => h.forfeit(0, 34000)).toThrow('not accepting');
    advance(h.game, 34000);
    expect(h.round.endReason).toBe('timeout');
    expect(h.round.standings.every((s) => s.points === 0 && s.status === 'timeout')).toBe(true);
    expect(nextAlarm(h.game)).toBe(34000 + REVEAL_MS);
  });
  it('private grids remain private across snapshots including reveal', () => {
    const h = playing();
    h.grid(0);
    expect(
      snapshot(h.game, 4200, h.members[0].player.id).round!.playerStates[h.members[0].player.id]
        .grid,
    ).toEqual(solutionFor(h.round.target));
    expect(
      snapshot(h.game, 4200, h.members[1].player.id).round!.playerStates[h.members[0].player.id]
        .grid,
    ).toEqual(blank());
    h.collect(0);
    expect(
      snapshot(h.game, 4300, h.members[1].player.id).round!.playerStates[h.members[0].player.id]
        .grid,
    ).toEqual(blank());
  });
  it('rejects untracked and invalid crafts before awarding', () => {
    const h = playing();
    expect(() => h.collect(0)).toThrow('tracked');
    expect(() => h.grid(0, ['stone', ...blank().slice(1)])).toThrow('ingredients');
    h.grid(0);
    h.grid(0, blank());
    expect(() => h.collect(0)).toThrow('tracked');
    h.grid(0);
    h.collect(0);
    expect(() => h.collect(0)).toThrow();
  });
  it('migrates active legacy clocks without resetting scores, rounds or grids', () => {
    const h = playing(3, { ...DEFAULT_SETTINGS, scoring: 'all-finish' });
    h.grid(0);
    h.collect(0);
    h.members[0].player.score = 150;
    h.round.finishers[0].points = 150;
    h.game.schemaVersion = 2;
    Object.assign(h.player(1), {
      engaged: true,
      overclocked: true,
      deadline: 19000,
      expired: true,
    });
    delete (h.game as Partial<typeof h.game>).roundStartPlayers;
    delete (h.round as Partial<typeof h.round>).standings;
    expect(upgradeGame(h.game)).toBe(true);
    expect(h.game.public.phase).toBe('playing');
    expect(h.game.public.deadline).toBe(34000);
    expect(h.members[0].player.score).toBe(150);
    expect(h.player(1)).toEqual({ forfeited: false, expired: false, grid: blank() });
    expect(h.game.public.round!.playerStates[h.members[1].player.id]).toEqual({
      forfeited: false,
      expired: false,
      grid: blank(),
    });
    expect(h.round.standings[0]).toMatchObject({ scoreBefore: 0, scoreAfter: 0, points: 0 });
    h.grid(1, solutionFor(h.round.target), 20000);
    h.collect(1, 20100);
    expect(h.members[1].player.score).toBe(75);
    h.forfeit(2, 20200);
    expect(h.round.standings.map((s) => [s.scoreBefore, s.scoreAfter, s.points])).toEqual([
      [0, 150, 150],
      [0, 75, 75],
      [0, 0, 0],
    ]);
    expect(upgradeGame(h.game)).toBe(false);
  });
  it('ends a multiplayer match immediately when one eligible participant remains', () => {
    const h = playing();
    disconnect(h.game, h.members[1], 4200);
    expect(h.game.public.phase).toBe('finished');
    expect(h.game.public.endReason).toBe('alone');
    expect(h.game.members).toHaveLength(2);
    expect(h.members.every((m) => m.player.score === 0)).toBe(true);
    h.members[1].player.connected = true;
    h.members[1].connection = 'back';
    advance(h.game, 5000);
    expect(h.game.public.phase).toBe('finished');
  });
  it('keeps an explicit leaver’s earned score in immutable round standings', () => {
    const h = playing(3, { ...DEFAULT_SETTINGS, scoring: 'all-finish' });
    h.grid(0);
    h.collect(0);
    command(h.game, h.members[0], { type: 'leave' }, 4400);
    h.forfeit(1, 4500);
    h.forfeit(2, 4600);
    expect(h.round.standings[0]).toMatchObject({
      scoreBefore: 0,
      scoreAfter: 100,
      points: 100,
      rankAfter: 1,
      status: 'crafted',
    });
    expect(h.game.public.history[0].standings).toEqual(h.round.standings);
  });
  it('reveals immediately if the last unresolved player leaves two resolved companions', () => {
    const h = playing(3, { ...DEFAULT_SETTINGS, scoring: 'all-finish' });
    h.forfeit(0);
    h.forfeit(1);
    disconnect(h.game, h.members[2], 4500);
    expect(h.game.public.phase).toBe('reveal');
    expect(h.game.public.deadline).toBe(4500 + REVEAL_MS);
    expect(h.game.public.history).toHaveLength(1);
    expect(h.members.every((m) => m.player.score === 0)).toBe(true);
  });
  it('a never-connected pending join is not an observed departure', () => {
    const h = playing();
    const pending = addMember(h.game, 'Pending', 'pig', 4100);
    disconnect(h.game, pending, 4200);
    expect(h.game.public.phase).toBe('playing');
    expect(h.game.public.endReason).not.toBe('alone');
  });
  it('does not count connected spectators as companions or terminate practice', () => {
    const h = playing();
    const watcher = addMember(h.game, 'Watcher', 'pig', 4100);
    watcher.player.connected = true;
    watcher.connection = 'watch';
    disconnect(h.game, h.members[1], 4200);
    expect(h.game.public.endReason).toBe('alone');
    const solo = playing(1);
    disconnect(solo.game, solo.members[0], 4200);
    expect(solo.game.public.phase).toBe('playing');
  });
});
