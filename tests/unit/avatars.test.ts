import { describe, expect, it } from 'vitest';
import { AVATARS, AVATAR_NAMES } from '../../src/components/Scoreboard';
import { createSchema, joinSchema } from '../../src/shared/protocol';

describe('player avatar choices', () => {
  it('offers twelve distinct named faces, including the requested mobs and Herobrine', () => {
    expect(AVATARS).toHaveLength(12);
    expect(new Set(AVATARS).size).toBe(12);
    expect(AVATARS).toEqual(
      expect.arrayContaining(['blaze', 'villager', 'iron_golem', 'skeleton', 'herobrine']),
    );
    expect(Object.keys(AVATAR_NAMES)).toEqual(AVATARS);
    expect(Object.values(AVATAR_NAMES).every((name) => name.length > 0)).toBe(true);
  });

  it.each(AVATARS)('accepts %s through room creation and joining', (avatar) => {
    const identity = { name: 'CraftPlayer', avatar };
    expect(joinSchema.parse(identity).avatar).toBe(avatar);
    expect(createSchema.parse({ ...identity, practice: true }).avatar).toBe(avatar);
  });

  it('retains legacy safe avatar identifiers without allowing asset-path injection', () => {
    expect(joinSchema.safeParse({ name: 'Legacy', avatar: 'steve' }).success).toBe(true);
    expect(joinSchema.safeParse({ name: 'Legacy', avatar: 'alex' }).success).toBe(true);
    expect(joinSchema.safeParse({ name: 'BadPath', avatar: '../steve' }).success).toBe(false);
  });
});
