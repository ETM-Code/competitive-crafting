import type {
  ClientMessage,
  Grid,
  Player,
  RoomSnapshot,
  Round,
  RoundPlayer,
  RoundStanding,
  Settings,
  Target,
} from '../src/shared/types';
import { itemById } from '../src/shared/catalogue';
import { makePalette, matchRecipe, solutionFor } from '../src/shared/recipes';
import {
  COUNTDOWN_MS,
  DEFAULT_SETTINGS,
  pointsFor,
  rankPlayers,
  REVEAL_MS,
  secondsFor,
  selectTargets,
} from '../src/shared/rules';
export const IDLE_TTL = 30 * 60_000;
export const MAX_AGE = 6 * 60 * 60_000;
export const RECENT_FAMILY_LIMIT = 50;
export const JOIN_RESERVATION_MS = 30_000;
export const MAX_IDENTITIES = 128;
const SCHEMA_VERSION = 4;
const emptyGrid = (): Grid => Array<string | null>(9).fill(null);

export class GameError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export interface Member {
  player: Player;
  token: string;
  connection: string | null;
  disconnectedAt: number | null;
  reservedUntil: number | null;
}
export interface Game {
  schemaVersion: number;
  // Internal state includes private grids. Only snapshot() is safe to send.
  public: RoomSnapshot;
  members: Member[];
  targets: Target[];
  recentFamilies: string[];
  roundStartPlayers: Player[];
  nextIndex: number;
  createdAt: number;
  activeAt: number;
}
export function createGame(
  code: string,
  practice: boolean,
  settings: Settings | undefined,
  now: number,
): Game {
  return {
    schemaVersion: SCHEMA_VERSION,
    public: {
      code,
      hostId: '',
      phase: 'lobby',
      settings: structuredClone(settings ?? DEFAULT_SETTINGS),
      players: [],
      round: null,
      deadline: null,
      serverNow: now,
      revision: 0,
      practice,
      history: [],
    },
    members: [],
    targets: [],
    recentFamilies: [],
    roundStartPlayers: [],
    nextIndex: 0,
    createdAt: now,
    activeAt: now,
  };
}
function rememberFamilies(previous: string[], targets: Target[]): string[] {
  const recentFirst = [
    ...previous,
    ...targets.map((target) => target.family ?? target.item),
  ].reverse();
  return [...new Set(recentFirst)].slice(0, RECENT_FAMILY_LIMIT).reverse();
}
function resetMatch(g: Game) {
  Object.assign(g.public, {
    phase: 'lobby',
    round: null,
    deadline: null,
    history: [],
    endReason: null,
  });
  g.targets = [];
  g.nextIndex = 0;
  for (const member of g.members) {
    Object.assign(member.player, {
      ready: false,
      spectator: false,
      score: 0,
      wins: 0,
      winningTime: 0,
    });
  }
}
export function upgradeGame(g: Game): boolean {
  if (g.schemaVersion === SCHEMA_VERSION) return false;
  for (const member of g.members)
    member.reservedUntil ??=
      !member.player.connected && member.disconnectedAt !== null
        ? member.disconnectedAt + JOIN_RESERVATION_MS
        : null;
  if (
    g.public.phase === 'finished' &&
    !g.public.endReason &&
    g.targets.length > g.public.history.length
  )
    g.public.endReason = 'abandoned';
  // Schema three already has forfeits and shared clocks; only add admission state.
  if (g.schemaVersion === 3) {
    g.schemaVersion = SCHEMA_VERSION;
    return true;
  }
  g.recentFamilies ??= [];
  g.roundStartPlayers ??= g.members
    .filter((m) => !m.player.spectator)
    .map((m) => {
      const finisher = g.public.round?.finishers.find((f) => f.playerId === m.player.id);
      const first = g.public.round?.finishers[0]?.playerId === m.player.id;
      return {
        ...m.player,
        score: m.player.score - (finisher?.points ?? 0),
        wins: m.player.wins - (first ? 1 : 0),
        winningTime: m.player.winningTime - (first ? (finisher?.elapsed ?? 0) : 0),
      };
    });
  g.public.endReason ??= null;
  if (!['classic', 'blitz', 'all-finish'].includes(g.public.settings.preset)) {
    g.public.settings = structuredClone(DEFAULT_SETTINGS);
  }
  const round = g.public.round;
  if (round) {
    // Keep earned scores, targets and the original shared clock. Old accelerated
    // expiry must not prevent a participant using the remaining common time.
    const oldStates = round.playerStates ?? {};
    round.playerStates = Object.fromEntries(
      g.members
        .filter((m) => !m.player.spectator)
        .map((m) => {
          const old = oldStates[m.player.id];
          return [
            m.player.id,
            {
              forfeited: old?.forfeited ?? false,
              expired: g.public.phase === 'playing' ? false : (old?.expired ?? false),
              grid: old?.grid?.length === 9 ? [...old.grid] : emptyGrid(),
            },
          ];
        }),
    );
    round.endReason ??=
      g.public.phase === 'reveal' ? (round.finishers.length ? 'crafted' : 'timeout') : null;
    round.standings ??= standingRows(
      g,
      round,
      g.public.phase === 'reveal' || g.public.phase === 'finished',
    );
    if (g.public.phase === 'playing') g.public.deadline = round.endsAt;
  }
  // Earlier history did not retain per-player deltas: don't invent them.
  for (const entry of g.public.history) {
    entry.endReason ??= entry.winnerId ? 'crafted' : 'timeout';
    entry.standings ??= [];
  }
  if ((g.public.phase as string) === 'preview') {
    g.public.phase = 'playing';
    g.public.deadline = round?.endsAt ?? null;
  }
  g.schemaVersion = SCHEMA_VERSION;
  return true;
}
function occupiesSlot(member: Member, now: number): boolean {
  return member.player.connected || (member.reservedUntil ?? 0) > now;
}
export function requireCapacity(g: Game, now: number, returning?: Member) {
  const occupied = g.members.filter((member) => member !== returning && occupiesSlot(member, now));
  if (occupied.length >= (g.public.practice ? 1 : 12)) throw new GameError('Room is full', 409);
}
export function addMember(g: Game, name: string, avatar: string, now: number): Member {
  if (g.members.length >= MAX_IDENTITIES)
    throw new GameError('This room has reached its session limit. Create a new room.', 409);
  requireCapacity(g, now);
  const member: Member = {
    player: {
      id: crypto.randomUUID(),
      name,
      avatar,
      ready: false,
      connected: false,
      score: 0,
      wins: 0,
      winningTime: 0,
      spectator: g.public.phase !== 'lobby',
    },
    token: crypto.randomUUID() + crypto.randomUUID(),
    connection: null,
    disconnectedAt: now,
    reservedUntil: now + JOIN_RESERVATION_MS,
  };
  g.members.push(member);
  if (!g.public.hostId) g.public.hostId = member.player.id;
  g.activeAt = now;
  return member;
}
export function snapshot(g: Game, now: number, viewerId?: string): RoomSnapshot {
  const state = structuredClone(g.public);
  state.players = g.members
    .filter(
      (member) =>
        member.player.id === viewerId ||
        occupiesSlot(member, now) ||
        (state.phase !== 'lobby' && !member.player.spectator),
    )
    .map((member) => ({ ...member.player }));
  state.serverNow = now;
  if (state.round) {
    for (const [id, player] of Object.entries(state.round.playerStates)) {
      if (id !== viewerId) player.grid = emptyGrid();
    }
    delete state.round.solution;
    if (state.phase === 'reveal' || (state.phase === 'playing' && state.settings.hints)) {
      state.round.solution = solutionFor(state.round.target);
    }
  }
  return state;
}
export function expired(g: Game, now: number): boolean {
  return now >= Math.min(g.activeAt + IDLE_TTL, g.createdAt + MAX_AGE);
}
function finished(round: Round, id: string): boolean {
  return round.finishers.some((finisher) => finisher.playerId === id);
}
function nextEvent(g: Game): number {
  return g.public.deadline ?? Infinity;
}
function nextReservation(g: Game): number {
  return Math.min(
    ...g.members.map((member) =>
      member.player.connected ? Infinity : (member.reservedUntil ?? Infinity),
    ),
  );
}
export function nextAlarm(g: Game): number {
  return Math.min(g.activeAt + IDLE_TTL, g.createdAt + MAX_AGE, nextEvent(g), nextReservation(g));
}
function transferHost(g: Game) {
  const host = g.members.find((member) => member.player.id === g.public.hostId);
  if (host?.player.connected) return;
  g.public.hostId =
    g.members.find((member) => member.player.connected)?.player.id ??
    host?.player.id ??
    g.members[0]?.player.id ??
    '';
}
export function disconnect(g: Game, member: Member, now: number, settle = true) {
  const wasConnected = member.player.connected;
  member.connection = null;
  member.player.connected = false;
  member.player.ready = false;
  member.disconnectedAt = now;
  member.reservedUntil = null;
  transferHost(g);
  if (settle && wasConnected) settleDeparture(g, now);
}
export function removeMember(g: Game, member: Member) {
  const player = g.public.round?.playerStates[member.player.id];
  if (player) {
    player.expired = true;
    player.grid = emptyGrid();
  }
  g.members = g.members.filter((entry) => entry !== member);
  transferHost(g);
}
function ranks(players: Player[]): Map<string, number> {
  const sorted = rankPlayers(players);
  let rank = 0;
  return new Map(
    sorted.map((player, index) => {
      const previous = sorted[index - 1];
      if (
        !previous ||
        previous.score !== player.score ||
        previous.wins !== player.wins ||
        previous.winningTime !== player.winningTime
      )
        rank = index + 1;
      return [player.id, rank];
    }),
  );
}
function standingRows(g: Game, round: Round, completed = false): RoundStanding[] {
  const before = g.roundStartPlayers;
  const after = before.map((start) => {
    const current = g.members.find((m) => m.player.id === start.id)?.player;
    if (current) return current;
    // Explicit leave revokes the member, not points already earned this round.
    const finisher = round.finishers.find((f) => f.playerId === start.id);
    const first = round.finishers[0]?.playerId === start.id;
    return {
      ...start,
      score: start.score + (finisher?.points ?? 0),
      wins: start.wins + (first ? 1 : 0),
      winningTime: start.winningTime + (first ? (finisher?.elapsed ?? 0) : 0),
    };
  });
  const beforeRanks = ranks(before);
  const afterRanks = ranks(after);
  return before.map((start) => {
    const player = after.find((p) => p.id === start.id)!;
    return {
      playerId: start.id,
      name: start.name,
      avatar: start.avatar,
      scoreBefore: start.score,
      scoreAfter: completed ? player.score : start.score,
      points: completed ? player.score - start.score : 0,
      rankBefore: beforeRanks.get(start.id)!,
      rankAfter: completed ? afterRanks.get(start.id)! : beforeRanks.get(start.id)!,
      status: finished(round, start.id)
        ? 'crafted'
        : round.playerStates[start.id]?.forfeited
          ? 'forfeited'
          : 'timeout',
    };
  });
}
export function settleDeparture(g: Game, now: number): boolean {
  if (g.public.practice || ['lobby', 'finished'].includes(g.public.phase)) return false;
  const remaining = g.members.filter((m) => m.player.connected && !m.player.spectator);
  if (remaining.length > 1) return settleRound(g, now);
  if (g.public.round) g.public.round.standings = standingRows(g, g.public.round, true);
  g.public.phase = 'finished';
  g.public.deadline = null;
  g.public.endReason = remaining.length === 1 ? 'alone' : 'abandoned';
  return true;
}
function reveal(g: Game, at: number) {
  const round = g.public.round!;
  round.endReason = round.finishers.length
    ? 'crafted'
    : Object.entries(round.playerStates).every(
          ([id, player]) =>
            player.forfeited ||
            (!g.public.practice &&
              !g.members.some((member) => member.player.id === id && member.player.connected)),
        )
      ? 'forfeit'
      : 'timeout';
  round.standings = standingRows(g, round, true);
  g.public.history.push({
    target: round.target,
    winnerId: round.finishers[0]?.playerId ?? null,
    points: round.finishers[0]?.points ?? 0,
    endReason: round.endReason,
    standings: structuredClone(round.standings),
  });
  g.public.phase = 'reveal';
  g.public.deadline = at + REVEAL_MS;
}
function allDone(g: Game, round: Round): boolean {
  return Object.entries(round.playerStates).every(
    ([id, player]) =>
      player.forfeited ||
      player.expired ||
      finished(round, id) ||
      (!g.public.practice && !g.members.some((m) => m.player.id === id && m.player.connected)),
  );
}
function settleRound(g: Game, at: number): boolean {
  if (g.public.phase !== 'playing' || !g.public.round || !allDone(g, g.public.round)) return false;
  reveal(g, at);
  return true;
}
function beginRound(g: Game, at: number) {
  const target = g.targets[g.nextIndex];
  if (!target) throw new GameError('Round data unavailable', 503);
  const endsAt = at + secondsFor(g.public.settings, target.tier, target.item) * 1000;
  const playerStates: Record<string, RoundPlayer> = {};
  g.roundStartPlayers = g.members.filter((m) => !m.player.spectator).map((m) => ({ ...m.player }));
  // Disconnected identities can rejoin, but never keep a round open by themselves.
  // Late joiners and players who were absent when the match started spectate.
  for (const member of g.members.filter((member) => !member.player.spectator)) {
    playerStates[member.player.id] = {
      forfeited: false,
      expired: false,
      grid: emptyGrid(),
    };
  }
  g.public.round = {
    id: crypto.randomUUID(),
    index: g.nextIndex++,
    target: target.item,
    tier: target.tier,
    points: pointsFor(target.tier),
    palette: makePalette(target.item, g.public.settings.distractors),
    startsAt: at,
    endsAt,
    finishers: [],
    playerStates,
    endReason: null,
    standings: [],
  };
  g.public.round.standings = standingRows(g, g.public.round);
  g.public.phase = 'playing';
  g.public.deadline = endsAt;
}
function finishReveal(g: Game, at: number) {
  const state = g.public;
  state.round = null;
  if (g.nextIndex >= g.targets.length) {
    state.phase = 'finished';
    state.deadline = null;
  } else {
    state.phase = 'countdown';
    state.deadline = at + COUNTDOWN_MS;
  }
}
export function advance(g: Game, now: number): boolean {
  let changed = false;
  for (const member of g.members) {
    if (member.reservedUntil !== null && member.reservedUntil <= now) {
      member.reservedUntil = null;
      changed = true;
    }
  }
  // Process events in timestamp order. A late/replayed alarm must never extend
  // a deadline or intermission.
  for (;;) {
    const at = nextEvent(g);
    if (!Number.isFinite(at) || at > now) break;
    const state = g.public;
    if (state.phase === 'playing' && state.round) {
      for (const [id, player] of Object.entries(state.round.playerStates)) {
        if (!finished(state.round, id) && !player.forfeited && at >= state.round.endsAt)
          player.expired = true;
      }
      if (at >= state.round.endsAt || allDone(g, state.round)) reveal(g, at);
    } else if (state.deadline !== null && at >= state.deadline) {
      if (state.phase === 'countdown') beginRound(g, at);
      else if (state.phase === 'reveal') finishReveal(g, at);
      else state.deadline = null;
    }
    settleRound(g, at);
    changed = true;
  }
  // Explicit departures can finish a round before the next scheduled event.
  return settleRound(g, now) || changed;
}
function activeRound(
  g: Game,
  member: Member,
  roundId: string,
  now: number,
  allowForfeited = false,
) {
  const round = g.public.round;
  if (
    g.public.phase !== 'playing' ||
    !round ||
    round.id !== roundId ||
    now < round.startsAt ||
    now >= round.endsAt
  ) {
    throw new GameError('Round is not accepting crafts');
  }
  if (!g.members.includes(member) || !member.player.connected || !member.connection)
    throw new GameError('Player is not connected', 403);
  if (member.player.spectator || !Object.hasOwn(round.playerStates, member.player.id))
    throw new GameError('Spectators cannot craft', 403);
  if (finished(round, member.player.id)) throw new GameError('Already collected');
  const player = round.playerStates[member.player.id];
  if (player.forfeited && !allowForfeited) throw new GameError('You forfeited this round');
  if (player.expired || now >= round.endsAt) throw new GameError('Your round has expired');
  return { round, player };
}
function validateGrid(g: Game, round: Round, grid: Grid) {
  if (
    grid.length !== 9 ||
    grid.some(
      (id) =>
        id !== null &&
        (!Object.hasOwn(itemById, id) ||
          (g.public.settings.inventory === 'constrained' && !round.palette.includes(id))),
    )
  ) {
    throw new GameError('Invalid crafting ingredients');
  }
}
export function command(g: Game, member: Member, message: ClientMessage, now: number) {
  const state = g.public;
  const host = () => {
    if (member.player.id !== state.hostId) throw new GameError('Only the host can do that', 403);
  };
  switch (message.type) {
    case 'ready':
      if (state.phase !== 'lobby') throw new GameError('Ready is only available in the lobby');
      member.player.ready = message.ready;
      break;
    case 'settings':
      host();
      if (state.phase !== 'lobby') throw new GameError('Settings are locked during a match');
      state.settings = structuredClone(message.settings);
      for (const entry of g.members) entry.player.ready = false;
      break;
    case 'start': {
      host();
      if (state.phase !== 'lobby') throw new GameError('Match already started');
      const connected = g.members.filter((entry) => entry.player.connected);
      if (
        connected.length < (state.practice ? 1 : 2) ||
        connected.some((entry) => !entry.player.ready)
      )
        throw new GameError('Connected players must be ready');
      const targets = selectTargets(state.settings, Math.random, g.recentFamilies);
      if (
        targets.length !== state.settings.rounds ||
        new Set(targets.map((target) => target.item)).size !== targets.length
      )
        throw new GameError('Not enough unique targets available', 503);
      for (const target of targets) {
        if (!matchRecipe(solutionFor(target.item), target.item))
          throw new GameError('Recipe data unavailable', 503);
      }
      g.targets = targets;
      g.recentFamilies = rememberFamilies(g.recentFamilies, targets);
      g.nextIndex = 0;
      for (const entry of g.members) entry.player.spectator = !entry.player.connected;
      state.phase = 'countdown';
      state.round = null;
      state.deadline = now + COUNTDOWN_MS;
      break;
    }
    case 'skipReveal':
      host();
      if (!g.members.includes(member) || !member.player.connected || !member.connection)
        throw new GameError('Player is not connected', 403);
      if (
        state.phase !== 'reveal' ||
        state.round?.id !== message.roundId ||
        state.deadline === null ||
        now >= state.deadline
      )
        throw new GameError('This round reveal has ended');
      finishReveal(g, now);
      break;
    case 'forfeit': {
      const existing = state.round;
      if (
        existing?.id === message.roundId &&
        existing.playerStates[member.player.id]?.forfeited &&
        g.members.includes(member) &&
        member.player.connected &&
        member.connection
      )
        return;
      const { player } = activeRound(g, member, message.roundId, now, true);
      player.forfeited = true;
      player.grid = emptyGrid();
      settleRound(g, now);
      break;
    }
    case 'grid': {
      const { round, player } = activeRound(g, member, message.roundId, now);
      validateGrid(g, round, message.grid);
      player.grid = [...message.grid];
      break;
    }
    case 'collect': {
      const { round, player } = activeRound(g, member, message.roundId, now);
      validateGrid(g, round, message.grid);
      if (!message.grid.every((id, index) => id === player.grid[index]))
        throw new GameError('Craft does not match your tracked grid');
      if (!matchRecipe(player.grid, round.target))
        throw new GameError('Craft does not match the target');
      const place = round.finishers.length + 1;
      const fraction =
        state.settings.scoring === 'winner'
          ? 1
          : place === 1
            ? 1
            : place === 2
              ? 0.75
              : Math.max(0.2, 0.5 - 0.05 * (place - 3));
      const points = Math.round(round.points * fraction);
      const elapsed = now - round.startsAt;
      round.finishers.push({ playerId: member.player.id, points, elapsed });
      member.player.score += points;
      if (place === 1) {
        member.player.wins++;
        member.player.winningTime += elapsed;
      }
      if (state.settings.scoring === 'winner' || allDone(g, round)) reveal(g, now);
      break;
    }
    case 'rematch':
      host();
      if (state.phase !== 'finished') throw new GameError('Match has not finished');
      resetMatch(g);
      break;
    case 'leave':
      removeMember(g, member);
      settleDeparture(g, now);
      break;
    case 'ping':
      return;
  }
  g.activeAt = now;
}
