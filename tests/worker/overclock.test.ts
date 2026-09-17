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
  RECENT_FAMILY_LIMIT,
  snapshot,
  upgradeGame,
} from '../../worker/game';
import type { ClientMessage, Grid, Settings } from '../../src/shared/types';
import { DEFAULT_SETTINGS, solutionFor } from './fixtures';

const blank = (): Grid => Array<string | null>(9).fill(null);
function playing(count = 2, settings: Settings = DEFAULT_SETTINGS) {
  const game = createGame('ABC234', count === 1, settings, 1000);
  const members = Array.from({ length: count }, (_, i) =>
    addMember(game, 'Player' + i, 'steve', 1000),
  );
  for (const member of members) {
    member.connection = member.player.id;
    member.disconnectedAt = null;
    member.player.connected = true;
    command(game, member, { type: 'ready', ready: true }, 1000);
  }
  command(game, members[0], { type: 'start' }, 1000);
  advance(game, 4000);
  const round = game.public.round!;
  const send = (index: number, type: 'engage' | 'overclock', now = 4100) =>
    command(game, members[index], { type, roundId: round.id }, now);
  const grid = (index: number, value = solutionFor(round.target), now = 4200) =>
    command(game, members[index], { type: 'grid', roundId: round.id, grid: value }, now);
  const collect = (index: number, value = solutionFor(round.target), now = 4300) =>
    command(game, members[index], { type: 'collect', roundId: round.id, grid: value }, now);
  return {
    game,
    members,
    round,
    send,
    grid,
    collect,
    player: (index: number) => round.playerStates[members[index].player.id],
  };
}

describe('Overclock authority', () => {
  it('starts with isolated empty grids and the full personal deadline', () => {
    const h = playing();
    expect(h.player(0)).toEqual({
      engaged: false,
      overclocked: false,
      deadline: 34000,
      expired: false,
      grid: blank(),
    });
    expect(h.player(0).grid).not.toBe(h.player(1).grid);
    h.grid(0);
    expect(h.player(1).grid).toEqual(blank());
    expect(h.members[0].player.score).toBe(0);
    expect(h.round.finishers).toEqual([]);
  });
  it.each(['engage', 'grid'] as const)(
    'locks after the first %s, even a clear of an empty grid',
    (type) => {
      const h = playing();
      if (type === 'engage') h.send(0, type);
      else h.grid(0, blank());
      expect(h.player(0).engaged).toBe(true);
      expect(() => h.send(0, 'overclock', 4300)).toThrow('locked');
      expect(h.player(0).overclocked).toBe(false);
      expect(h.player(0).deadline).toBe(h.round.endsAt);
    },
  );
  it('anchors the half-time deadline to round start and commits an irreversible toggle', () => {
    const h = playing();
    h.send(0, 'overclock', 18000);
    expect(h.player(0).deadline).toBe(19000);
    expect(h.player(0).overclocked).toBe(true);
    expect(nextAlarm(h.game)).toBe(19000);
    expect(() => h.send(0, 'overclock', 18001)).toThrow('locked');
    h.grid(0, blank(), 18002);
    expect(h.player(0)).toMatchObject({ overclocked: true, engaged: true, deadline: 19000 });
  });
  it.each([19000, 19001, 33999])('rejects activation at/after the half-time cutoff (%i)', (now) => {
    const h = playing();
    expect(() => h.send(0, 'overclock', now)).toThrow('Too late');
    expect(h.player(0)).toMatchObject({ overclocked: false, deadline: 34000, expired: false });
  });
  it('expires only the accelerated participant and leaves the other full clock intact', () => {
    const h = playing();
    h.send(0, 'overclock');
    expect(advance(h.game, 18999)).toBe(false);
    expect(advance(h.game, 19000)).toBe(true);
    expect(h.player(0).expired).toBe(true);
    expect(h.player(1)).toMatchObject({ expired: false, deadline: 34000 });
    expect(h.game.public.phase).toBe('playing');
    expect(h.game.public.deadline).toBe(34000);
    expect(nextAlarm(h.game)).toBe(34000);
    for (const action of [
      () => h.send(0, 'engage', 19000),
      () => h.grid(0, blank(), 19000),
      () => h.collect(0, blank(), 19000),
    ])
      expect(action).toThrow('expired');
    expect(h.members[0].player.score).toBe(0);
    h.grid(1, solutionFor(h.round.target), 20000);
    h.collect(1, solutionFor(h.round.target), 21000);
    expect(h.members[1].player.score).toBe(100);
  });
  it('guards personal deadlines even before an alarm callback runs', () => {
    const h = playing();
    h.send(0, 'overclock');
    h.grid(0);
    expect(() => h.collect(0, solutionFor(h.round.target), 19000)).toThrow('expired');
    expect(h.round.finishers).toEqual([]);
  });
  it('reveals at the last personal expiry and catches up delayed alarms without drift', () => {
    const h = playing();
    h.send(0, 'overclock');
    h.send(1, 'overclock');
    advance(h.game, 19000);
    expect(h.game.public.phase).toBe('reveal');
    expect(h.game.public.deadline).toBe(24000);
    expect(h.game.public.history).toEqual([{ target: h.round.target, winnerId: null, points: 0 }]);
    expect(advance(h.game, 19000)).toBe(false);
    advance(h.game, 26000);
    expect(h.game.public.phase).toBe('countdown');
    expect(h.game.public.deadline).toBe(27000);
    advance(h.game, 27000);
    expect(h.game.public.round!.playerStates[h.members[0].player.id]).toMatchObject({
      engaged: false,
      overclocked: false,
      expired: false,
      deadline: 57000,
      grid: blank(),
    });
    expect(h.members[0].player.spectator).toBe(false);
  });
  it('ends a solo round early when its only player expires', () => {
    const h = playing(1);
    h.send(0, 'overclock');
    advance(h.game, 19000);
    expect(h.game.public.phase).toBe('reveal');
    expect(h.game.public.history[0].points).toBe(0);
    expect(nextAlarm(h.game)).toBe(24000);
  });
  it('awards exactly 1.5 times points only on explicit collection and records the bonus in history', () => {
    const h = playing();
    h.send(0, 'overclock');
    h.grid(0);
    expect(h.members[0].player.score).toBe(0);
    h.collect(0);
    expect(h.members[0].player).toMatchObject({ score: 150, wins: 1, winningTime: 300 });
    expect(h.game.public.history[0].points).toBe(150);
    expect(h.round.finishers[0].points).toBe(150);
    expect(() => h.collect(0)).toThrow();
  });
  it('uses placement then bonus with one rounding operation in all-finish', () => {
    const h = playing(3, { ...DEFAULT_SETTINGS, scoring: 'all-finish', preset: 'all-finish' });
    h.round.points = 150;
    h.send(1, 'overclock');
    h.send(2, 'overclock');
    h.grid(0);
    h.collect(0);
    h.grid(1);
    h.collect(1);
    expect(h.members.map((member) => member.player.score)).toEqual([150, 169, 0]);
    expect(h.game.public.phase).toBe('playing');
    advance(h.game, 19000);
    expect(h.game.public.phase).toBe('reveal');
    expect(h.player(1).expired).toBe(false); // Finished players never expire later.
    expect(h.player(2).expired).toBe(true);
    expect(h.game.public.history[0].points).toBe(150);
  });
  it('rejects arbitrary untracked, cleared, wrong and stale-round grids', () => {
    const h = playing();
    expect(() => h.collect(0)).toThrow('tracked grid');
    h.grid(0);
    h.grid(0, blank());
    expect(() => h.collect(0)).toThrow('tracked grid');
    expect(() => h.collect(0, blank())).toThrow('target');
    for (const type of ['engage', 'grid', 'overclock', 'collect'] as const) {
      const message = {
        type,
        roundId: 'old-round',
        ...(['grid', 'collect'].includes(type) ? { grid: solutionFor(h.round.target) } : {}),
      } as ClientMessage;
      expect(() => command(h.game, h.members[0], message, 4400)).toThrow('not accepting');
    }
    h.grid(0);
    h.collect(0);
    expect(h.members[0].player.score).toBe(100);
  });
  it('validates tracked ingredients against catalogue and constrained inventory', () => {
    const h = playing();
    for (const grid of [
      ['stone', ...blank().slice(1)],
      ['__proto__', ...blank().slice(1)],
      ['unknown', ...blank().slice(1)],
      ['wood'],
    ])
      expect(() => h.grid(0, grid)).toThrow('ingredients');
    expect(h.player(0).grid).toEqual(blank());
    const creative = playing(1, { ...DEFAULT_SETTINGS, inventory: 'creative' });
    creative.grid(0, ['stone', ...blank().slice(1)]);
    expect(creative.player(0).grid[0]).toBe('stone');
    expect(creative.round.endsAt).toBe(36000);
  });
  it('denies spectators, disconnected players and completed players', () => {
    const h = playing(2, { ...DEFAULT_SETTINGS, scoring: 'all-finish' });
    const spectator = addMember(h.game, 'Late', 'alex', 4100);
    spectator.player.connected = true;
    spectator.connection = 'late';
    expect(() =>
      command(h.game, spectator, { type: 'overclock', roundId: h.round.id }, 4100),
    ).toThrow('Spectators');
    expect(h.round.playerStates[spectator.player.id]).toBeUndefined();
    disconnect(h.game, h.members[1], 4100);
    expect(() => h.send(1, 'overclock')).toThrow('not connected');
    h.grid(0);
    h.collect(0);
    expect(() => h.send(0, 'overclock', 4400)).toThrow('Already collected');
  });
  it('never shares private grids with another player or spectator, including after reveal', () => {
    const h = playing();
    const original = solutionFor(h.round.target);
    h.grid(0, original);
    original[0] = null;
    expect(h.player(0).grid[0]).toBe('wood'); // Input array cannot mutate stored state.
    const own = snapshot(h.game, 4200, h.members[0].player.id);
    const peer = snapshot(h.game, 4200, h.members[1].player.id);
    const anonymous = snapshot(h.game, 4200);
    expect(own.round!.playerStates[h.members[0].player.id].grid).toEqual(
      solutionFor(h.round.target),
    );
    expect(peer.round!.playerStates[h.members[0].player.id].grid).toEqual(blank());
    expect(anonymous.round!.playerStates[h.members[0].player.id].grid).toEqual(blank());
    own.round!.playerStates[h.members[0].player.id].grid[0] = null;
    expect(h.player(0).grid[0]).toBe('wood');
    h.collect(0);
    const reveal = snapshot(h.game, 4300, h.members[1].player.id);
    expect(reveal.round!.solution).toBeDefined();
    expect(reveal.round!.playerStates[h.members[0].player.id].grid).toEqual(blank());
  });
  it('resets round state on rematch but remembers a bounded recent family list', () => {
    const h = playing(1);
    h.send(0, 'overclock');
    h.grid(0);
    h.collect(0);
    let now = 100000;
    const firstFamilies = [...h.game.recentFamilies];
    for (let match = 0; match < 25; match++) {
      advance(h.game, now);
      expect(h.game.public.phase).toBe('finished');
      command(h.game, h.members[0], { type: 'rematch' }, now);
      expect(h.game.public.round).toBeNull();
      expect(h.members[0].player.score).toBe(0);
      command(h.game, h.members[0], { type: 'ready', ready: true }, now);
      command(h.game, h.members[0], { type: 'start' }, now);
      if (match === 0)
        expect(h.game.targets.every((target) => !firstFamilies.includes(target.family!))).toBe(
          true,
        );
      expect(h.game.recentFamilies.length).toBeLessThanOrEqual(RECENT_FAMILY_LIMIT);
      now += 200000;
    }
    expect(h.game.recentFamilies).toHaveLength(RECENT_FAMILY_LIMIT);
  });
  it('safely upgrades pre-Overclock persisted matches to the lobby', () => {
    const h = playing();
    h.game.schemaVersion = 1;
    Object.assign(h.game.public, {
      phase: 'preview',
      settings: { ...DEFAULT_SETTINGS, preset: 'memory' },
    });
    expect(upgradeGame(h.game)).toBe(true);
    expect(h.game.public.phase).toBe('lobby');
    expect(h.game.public.settings.preset).toBe('classic');
    expect(h.game.public.round).toBeNull();
    expect(h.game.members.every((member) => !member.player.ready)).toBe(true);
    expect(upgradeGame(h.game)).toBe(false);
  });
});
