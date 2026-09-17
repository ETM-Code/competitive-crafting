import type {
  ClientMessage,
  Grid,
  Player,
  RoomSnapshot,
  Round,
  RoundPlayer,
  Settings,
  Target,
} from '../src/shared/types';
import { itemById } from '../src/shared/catalogue';
import { makePalette, matchRecipe, solutionFor } from '../src/shared/recipes';
import { DEFAULT_SETTINGS, pointsFor, secondsFor, selectTargets } from '../src/shared/rules';

export const GRACE = 60_000;
export const IDLE_TTL = 30 * 60_000;
export const MAX_AGE = 6 * 60 * 60_000;
export const RECENT_FAMILY_LIMIT = 50;
const SCHEMA_VERSION = 2;
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
}
export interface Game {
  schemaVersion: number;
  // Internal state includes private grids. Only snapshot() is safe to send.
  public: RoomSnapshot;
  members: Member[];
  targets: Target[];
  recentFamilies: string[];
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
  Object.assign(g.public, { phase: 'lobby', round: null, deadline: null, history: [] });
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
  // Old rounds have no tracked grids and may still be in the removed preview
  // phase. Return them to the lobby rather than accepting unverifiable crafts.
  g.recentFamilies = rememberFamilies(g.recentFamilies ?? [], g.targets);
  if (!['classic', 'blitz', 'all-finish'].includes(g.public.settings.preset)) {
    g.public.settings = structuredClone(DEFAULT_SETTINGS);
  }
  resetMatch(g);
  g.schemaVersion = SCHEMA_VERSION;
  return true;
}
export function addMember(g: Game, name: string, avatar: string, now: number): Member {
  if (g.members.length >= (g.public.practice ? 1 : 12)) throw new GameError('Room is full', 409);
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
  };
  g.members.push(member);
  if (!g.public.hostId) g.public.hostId = member.player.id;
  g.activeAt = now;
  return member;
}
export function snapshot(g: Game, now: number, viewerId?: string): RoomSnapshot {
  const state = structuredClone(g.public);
  state.players = g.members.map((member) => ({ ...member.player }));
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
function personalDeadlines(g: Game): number[] {
  const round = g.public.round;
  if (g.public.phase !== 'playing' || !round) return [];
  return Object.entries(round.playerStates)
    .filter(([id, player]) => !player.expired && !finished(round, id))
    .map(([, player]) => player.deadline);
}
function nextEvent(g: Game): number {
  return Math.min(
    g.public.deadline ?? Infinity,
    ...personalDeadlines(g),
    ...g.members
      .filter((member) => member.disconnectedAt !== null)
      .map((member) => member.disconnectedAt! + GRACE),
  );
}
export function nextAlarm(g: Game): number {
  return Math.min(g.activeAt + IDLE_TTL, g.createdAt + MAX_AGE, nextEvent(g));
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
export function disconnect(g: Game, member: Member, now: number) {
  member.connection = null;
  member.player.connected = false;
  member.player.ready = false;
  member.disconnectedAt = now;
  transferHost(g);
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
function reveal(g: Game, at: number) {
  const round = g.public.round!;
  g.public.history.push({
    target: round.target,
    winnerId: round.finishers[0]?.playerId ?? null,
    points: round.finishers[0]?.points ?? 0,
  });
  g.public.phase = 'reveal';
  g.public.deadline = at + 5000;
}
function allDone(round: Round): boolean {
  return Object.entries(round.playerStates).every(
    ([id, player]) => player.expired || finished(round, id),
  );
}
function settleRound(g: Game, at: number): boolean {
  if (g.public.phase !== 'playing' || !g.public.round || !allDone(g.public.round)) return false;
  reveal(g, at);
  return true;
}
function beginRound(g: Game, at: number) {
  const target = g.targets[g.nextIndex];
  if (!target) throw new GameError('Round data unavailable', 503);
  const endsAt = at + secondsFor(g.public.settings, target.tier, target.item) * 1000;
  const playerStates: Record<string, RoundPlayer> = {};
  // Disconnected match participants retain their place during reconnect grace.
  // Late joiners and players who were absent when the match started spectate.
  for (const member of g.members.filter((member) => !member.player.spectator)) {
    playerStates[member.player.id] = {
      engaged: false,
      overclocked: false,
      deadline: endsAt,
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
  };
  g.public.phase = 'playing';
  g.public.deadline = endsAt;
}
export function advance(g: Game, now: number): boolean {
  let changed = false;
  // Process events in timestamp order, including personal expiry and reconnect
  // grace. A late/replayed alarm must never extend a deadline or intermission.
  for (;;) {
    const at = nextEvent(g);
    if (!Number.isFinite(at) || at > now) break;
    for (const member of [...g.members]) {
      if (member.disconnectedAt !== null && at >= member.disconnectedAt + GRACE)
        removeMember(g, member);
    }
    const state = g.public;
    if (state.phase === 'playing' && state.round) {
      for (const [id, player] of Object.entries(state.round.playerStates)) {
        if (!finished(state.round, id) && at >= player.deadline) player.expired = true;
      }
      if (at >= state.round.endsAt || allDone(state.round)) reveal(g, at);
    } else if (state.deadline !== null && at >= state.deadline) {
      if (state.phase === 'countdown') beginRound(g, at);
      else if (state.phase === 'reveal') {
        state.round = null;
        if (g.nextIndex >= g.targets.length) {
          state.phase = 'finished';
          state.deadline = null;
        } else {
          state.phase = 'countdown';
          state.deadline = at + 3000;
        }
      } else state.deadline = null;
    }
    settleRound(g, at);
    changed = true;
  }
  // Explicit departures can finish a round before the next scheduled event.
  return settleRound(g, now) || changed;
}
function activeRound(g: Game, member: Member, roundId: string, now: number) {
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
  if (player.expired || now >= player.deadline) throw new GameError('Your round has expired');
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
      state.deadline = now + 3000;
      break;
    }
    case 'engage': {
      const { player } = activeRound(g, member, message.roundId, now);
      player.engaged = true;
      break;
    }
    case 'overclock': {
      const { round, player } = activeRound(g, member, message.roundId, now);
      if (player.engaged || player.overclocked) throw new GameError('Overclock is locked');
      const deadline = round.startsAt + Math.floor((round.endsAt - round.startsAt) / 2);
      if (now >= deadline) throw new GameError('Too late to activate Overclock');
      player.overclocked = true;
      player.deadline = deadline;
      break;
    }
    case 'grid': {
      const { round, player } = activeRound(g, member, message.roundId, now);
      validateGrid(g, round, message.grid);
      player.engaged = true;
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
      const points = Math.round(round.points * fraction * (player.overclocked ? 1.5 : 1));
      const elapsed = now - round.startsAt;
      round.finishers.push({ playerId: member.player.id, points, elapsed });
      member.player.score += points;
      if (place === 1) {
        member.player.wins++;
        member.player.winningTime += elapsed;
      }
      if (state.settings.scoring === 'winner' || allDone(round)) reveal(g, now);
      break;
    }
    case 'rematch':
      host();
      if (state.phase !== 'finished') throw new GameError('Match has not finished');
      resetMatch(g);
      break;
    case 'leave':
      removeMember(g, member);
      break;
    case 'ping':
      return;
  }
  g.activeAt = now;
}
