export type ItemId = string;
export type Grid = (ItemId | null)[];
export type Category = 'building' | 'ingredients' | 'equipment' | 'redstone' | 'nature' | 'other';
export interface Item {
  id: ItemId;
  name: string;
  category: Category;
  icon: string;
}
export interface Recipe {
  id: string;
  output: ItemId;
  count: number;
  kind: 'shaped' | 'shapeless';
  pattern?: (ItemId[] | null)[][];
  ingredients?: ItemId[][];
}
export interface Target {
  item: ItemId;
  tier: number;
  introduced: string;
  note: string;
  family?: string;
  finaleEligible?: boolean;
}
export type Preset = 'classic' | 'blitz' | 'all-finish';
export interface Settings {
  preset: Preset;
  inventory: 'constrained' | 'creative';
  rounds: number;
  seconds: number;
  difficulty: 'progressive' | 'easy' | 'expert';
  distractors: number;
  scoring: 'winner' | 'all-finish';
  hints: boolean;
}
export interface Player {
  id: string;
  name: string;
  avatar: string;
  ready: boolean;
  connected: boolean;
  score: number;
  wins: number;
  winningTime: number;
  spectator: boolean;
}
export type Phase = 'lobby' | 'countdown' | 'playing' | 'reveal' | 'finished';
export interface RoundPlayer {
  forfeited: boolean;
  expired: boolean;
  grid: Grid;
}
export type RoundEndReason = 'crafted' | 'timeout' | 'forfeit';
export interface RoundStanding {
  playerId: string;
  name: string;
  avatar: string;
  scoreBefore: number;
  scoreAfter: number;
  points: number;
  rankBefore: number;
  rankAfter: number;
  status: 'crafted' | 'forfeited' | 'timeout' | 'spectator';
}
export interface RoundHistory {
  target: ItemId;
  winnerId: string | null;
  points: number;
  endReason: RoundEndReason;
  standings: RoundStanding[];
}
export interface Round {
  id: string;
  index: number;
  target: ItemId;
  tier: number;
  points: number;
  palette: ItemId[];
  startsAt: number;
  endsAt: number;
  finishers: { playerId: string; points: number; elapsed: number }[];
  playerStates: Record<string, RoundPlayer>;
  endReason: RoundEndReason | null;
  standings: RoundStanding[];
  solution?: Grid;
}
export interface RoomSnapshot {
  code: string;
  hostId: string;
  phase: Phase;
  settings: Settings;
  players: Player[];
  round: Round | null;
  deadline: number | null;
  serverNow: number;
  revision: number;
  practice: boolean;
  history: RoundHistory[];
  endReason?: 'alone' | 'abandoned' | null;
}
export interface Session {
  code: string;
  playerId: string;
  token: string;
}
export type ClientMessage =
  | { type: 'ready'; ready: boolean }
  | { type: 'settings'; settings: Settings }
  | { type: 'start' }
  | { type: 'grid'; roundId: string; grid: Grid }
  | { type: 'forfeit'; roundId: string }
  | { type: 'skipReveal'; roundId: string }
  | { type: 'collect'; roundId: string; grid: Grid }
  | { type: 'rematch' }
  | { type: 'ping'; sentAt: number }
  | { type: 'leave' };
export type ServerMessage =
  | { type: 'state'; state: RoomSnapshot }
  | { type: 'error'; message: string }
  | { type: 'pong'; sentAt: number; serverNow: number };
export interface Catalogue {
  version: string;
  items: Item[];
  recipes: Recipe[];
}
