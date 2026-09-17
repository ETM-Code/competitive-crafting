import { targets } from './catalogue';
import { solutionFor, shuffle } from './recipes';
import type { Player, Preset, Settings, Target } from './types';

export const REVEAL_MS = 8000;
export const COUNTDOWN_MS = 3000;

export const DEFAULT_SETTINGS: Settings = {
  preset: 'classic',
  inventory: 'constrained',
  rounds: 10,
  seconds: 30,
  difficulty: 'progressive',
  distractors: 10,
  scoring: 'winner',
  hints: false,
};

export const PRESETS: Record<Preset, Settings> = {
  classic: { ...DEFAULT_SETTINGS },
  blitz: { ...DEFAULT_SETTINGS, preset: 'blitz', seconds: 15, distractors: 6 },
  'all-finish': { ...DEFAULT_SETTINGS, preset: 'all-finish', scoring: 'all-finish' },
};

export function pointsFor(tier: number): number {
  return 50 + Math.max(1, Math.min(5, tier)) * 50;
}

export function secondsFor(settings: Settings, _tier: number, output?: string): number {
  const placements = output ? solutionFor(output).filter(Boolean).length : 0;
  const searchAllowance = settings.inventory === 'creative' ? placements * 2 : 0;
  return Math.min(240, settings.seconds + searchAllowance);
}

export function selectTargets(
  settings: Settings,
  random: () => number = Math.random,
  excludedFamilies: string[] = [],
): Target[] {
  const selected: Target[] = [];
  const selectedFamilies = new Set<string>();
  // Stored oldest-first across rematches. Keep recency when a small tier exhausts.
  const lastSeen = new Map(excludedFamilies.map((family, index) => [family, index]));
  for (let i = 0; i < settings.rounds; i++) {
    const progress = i / Math.max(1, settings.rounds - 1);
    const tier =
      settings.difficulty === 'easy'
        ? 1 + (i % 2)
        : settings.difficulty === 'expert'
          ? i === settings.rounds - 1
            ? 5
            : 3 + (i % 2)
          : i === settings.rounds - 1
            ? 5
            : 1 + Math.floor(progress * 4);
    const unused = targets.filter(
      (target) => !selected.some((entry) => entry.item === target.item),
    );
    let pool = unused.filter((target) => target.tier === tier);
    if (!pool.length) pool = unused.filter((target) => Math.abs(target.tier - tier) <= 1);
    const different = pool.filter((target) => !selectedFamilies.has(target.family ?? target.item));
    if (different.length) pool = different;
    const oldest = Math.min(
      ...pool.map((target) => lastSeen.get(target.family ?? target.item) ?? -1),
    );
    pool = pool.filter((target) => (lastSeen.get(target.family ?? target.item) ?? -1) === oldest);
    const families = new Map<string, Target[]>();
    for (const target of pool) {
      const key = target.family ?? target.item;
      const group = families.get(key) ?? [];
      group.push(target);
      families.set(key, group);
    }
    const family = shuffle([...families.values()], random)[0];
    if (!family?.length) throw new Error('Not enough unique targets for match');
    const choice = shuffle(family, random)[0];
    selected.push(choice);
    const key = choice.family ?? choice.item;
    selectedFamilies.add(key);
    lastSeen.set(key, excludedFamilies.length + i);
  }
  return selected;
}

export function rankPlayers(players: Player[]): Player[] {
  return [...players].sort(
    (a, b) =>
      b.score - a.score ||
      b.wins - a.wins ||
      a.winningTime - b.winningTime ||
      a.name.localeCompare(b.name),
  );
}
