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
  expired,
  GRACE,
  IDLE_TTL,
  MAX_AGE,
  nextAlarm,
  snapshot,
} from '../../worker/game';
import { DEFAULT_SETTINGS, solutionFor } from './fixtures';
function lobby(count = 2, settings = DEFAULT_SETTINGS) {
  const game = createGame('ABC234', count === 1, settings, 1000);
  const members = Array.from({ length: count }, (_, i) =>
    addMember(game, 'Player ' + i, 'steve', 1000),
  );
  for (const m of members) {
    m.player.connected = true;
    m.disconnectedAt = null;
    m.connection = m.player.id;
    command(game, m, { type: 'ready', ready: true }, 1000);
  }
  return { game, members };
}
function playing(count = 2, settings = DEFAULT_SETTINGS) {
  const result = lobby(count, settings);
  command(result.game, result.members[0], { type: 'start' }, 1000);
  advance(result.game, 4000);
  return result;
}
const collect = (roundId: string) => ({
  type: 'collect' as const,
  roundId,
  grid: solutionFor('target0'),
});
describe('authoritative game', () => {
  it('enforces maximum age despite recent activity and reveals explicit hints', () => {
    const { game } = playing(1, { ...DEFAULT_SETTINGS, hints: true });
    expect(snapshot(game, 4000).round?.solution).toEqual(solutionFor('target0'));
    game.activeAt = game.createdAt + MAX_AGE - 1;
    expect(expired(game, game.createdAt + MAX_AGE)).toBe(true);
  });

  it('requires two ready live classic players and allows solo practice', () => {
    const { game, members } = lobby();
    members[1].player.ready = false;
    expect(() => command(game, members[0], { type: 'start' }, 1000)).toThrow('ready');
    members[1].player.ready = true;
    members[1].player.connected = false;
    expect(() => command(game, members[0], { type: 'start' }, 1000)).toThrow('ready');
    expect(playing(1).game.public.phase).toBe('playing');
  });
  it('does not expose credentials, future targets or a countdown target', () => {
    const { game, members } = lobby();
    command(game, members[0], { type: 'start' }, 1000);
    const state = snapshot(game, 1000);
    expect(state.round).toBeNull();
    expect(JSON.stringify(state)).not.toContain(members[0].token);
    expect(JSON.stringify(state)).not.toContain('target');
    advance(game, 4000);
    expect(snapshot(game, 4000).round?.solution).toBeUndefined();
    expect(JSON.stringify(snapshot(game, 4000))).not.toContain('target1');
  });
  it('awards one winner and rejects duplicate and stale claims', () => {
    const { game, members } = playing();
    const claim = collect(game.public.round!.id);
    command(game, members[0], { ...claim, type: 'grid' }, 4199);
    command(game, members[0], claim, 4200);
    expect(members[0].player).toMatchObject({ score: 100, wins: 1, winningTime: 200 });
    expect(() => command(game, members[1], claim, 4200)).toThrow();
    expect(() => command(game, members[0], claim, 4201)).toThrow();
    expect(game.public.history).toHaveLength(1);
    expect(snapshot(game, 4201).round?.solution).toBeDefined();
    advance(game, 9200);
    expect(game.public.round).toBeNull();
    advance(game, 12200);
    expect(() => command(game, members[1], claim, 12201)).toThrow();
  });
  it('scores all finishers, floors placement at 20%, and rejects repeat collect', () => {
    const { game, members } = playing(12, {
      ...DEFAULT_SETTINGS,
      scoring: 'all-finish',
      preset: 'all-finish',
    });
    const claim = collect(game.public.round!.id);
    for (const [i, m] of members.entries()) {
      command(game, m, { ...claim, type: 'grid' }, 4100 + i);
      command(game, m, claim, 4100 + i);
      expect(() => command(game, m, claim, 4100 + i)).toThrow();
    }
    expect(members.map((m) => m.player.score)).toEqual([
      100, 75, 50, 45, 40, 35, 30, 25, 20, 20, 20, 20,
    ]);
    expect(game.public.phase).toBe('reveal');
  });
  it('rejects outside-palette, unknown, malformed and incorrect crafts', () => {
    const { game, members } = playing();
    for (const grid of [
      ['wood'],
      ['stone', ...Array(8).fill(null)],
      ['__proto__', ...Array(8).fill(null)],
      Array(9).fill(null),
    ]) {
      expect(() =>
        command(game, members[0], { type: 'collect', roundId: game.public.round!.id, grid }, 4100),
      ).toThrow();
    }
    expect(members[0].player.score).toBe(0);
  });
  it('does not award at or after deadline and late alarms catch up once', () => {
    const { game, members } = playing();
    expect(() => command(game, members[0], collect(game.public.round!.id), 34000)).toThrow();
    advance(game, 1_000_000);
    expect(game.public.phase).toBe('finished');
    expect(game.public.history).toHaveLength(3);
    expect(game.public.history.every((h) => h.winnerId === null)).toBe(true);
    expect(advance(game, 1_000_000)).toBe(false);
  });
  it('enforces host commands and lobby-only settings, clearing readiness', () => {
    const { game, members } = lobby();
    expect(() =>
      command(game, members[1], { type: 'settings', settings: DEFAULT_SETTINGS }, 1000),
    ).toThrow('host');
    command(
      game,
      members[0],
      { type: 'settings', settings: { ...DEFAULT_SETTINGS, preset: 'blitz', seconds: 15 } },
      1000,
    );
    expect(members.every((m) => !m.player.ready)).toBe(true);
    for (const m of members) command(game, m, { type: 'ready', ready: true }, 1000);
    command(game, members[0], { type: 'start' }, 1000);
    expect(() =>
      command(game, members[0], { type: 'settings', settings: DEFAULT_SETTINGS }, 1001),
    ).toThrow('locked');
  });
  it('late joiners spectate and rematch resets players and history', () => {
    const { game, members } = playing();
    const late = addMember(game, 'Late', 'steve', 4000);
    late.player.connected = true;
    late.disconnectedAt = null;
    late.connection = late.player.id;
    expect(late.player.spectator).toBe(true);
    expect(() => command(game, late, collect(game.public.round!.id), 4100)).toThrow('Spectators');
    command(game, members[0], { ...collect(game.public.round!.id), type: 'grid' }, 4099);
    command(game, members[0], collect(game.public.round!.id), 4100);
    advance(game, 200_000);
    command(game, members[0], { type: 'rematch' }, 200_000);
    expect(game.public.phase).toBe('lobby');
    expect(game.public.history).toEqual([]);
    expect(
      game.members.every((m) => !m.player.spectator && m.player.score === 0 && !m.player.ready),
    ).toBe(true);
  });
  it('transfers host on disconnect and removes disconnected sessions after grace', () => {
    const { game, members } = lobby();
    disconnect(game, members[0], 2000);
    expect(game.public.hostId).toBe(members[1].player.id);
    expect(nextAlarm(game)).toBe(2000 + GRACE);
    advance(game, 2000 + GRACE);
    expect(game.members).toHaveLength(1);
    expect(expired(game, game.activeAt + IDLE_TTL)).toBe(true);
  });
  it('all-finish retains disconnected racers during grace then ends on removal', () => {
    const { game, members } = playing(2, {
      ...DEFAULT_SETTINGS,
      scoring: 'all-finish',
      seconds: 180,
    });
    command(game, members[0], { ...collect(game.public.round!.id), type: 'grid' }, 4099);
    command(game, members[0], collect(game.public.round!.id), 4100);
    disconnect(game, members[1], 4200);
    advance(game, 4200);
    expect(game.public.phase).toBe('playing');
    advance(game, 4200 + GRACE);
    expect(game.public.phase).toBe('reveal');
  });
});
