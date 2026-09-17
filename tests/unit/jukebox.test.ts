import { describe, expect, it } from 'vitest';
import { createShuffleBag } from '../../src/lib/jukebox';
import playlist from '../../src/data/playlist.json';

describe('curated jukebox shuffle', () => {
  it('plays every selection once per bag, with no repeat at cycle boundaries', () => {
    const bag = createShuffleBag(playlist.tracks, () => 0.5);
    const first = playlist.tracks.map(() => bag.next().uri);
    const second = playlist.tracks.map(() => bag.next().uri);
    expect(new Set(first).size).toBe(playlist.tracks.length);
    expect(new Set(second).size).toBe(playlist.tracks.length);
    expect(second[0]).not.toBe(first.at(-1));
    expect([...first].sort()).toEqual(playlist.tracks.map((track) => track.uri).sort());
  });
  it('removes a manually chosen song from the unplayed bag', () => {
    const tracks = [{ uri: 'a' }, { uri: 'b' }, { uri: 'c' }];
    const bag = createShuffleBag(tracks, () => 0.99);
    expect(bag.next().uri).toBe('a');
    bag.select('b');
    expect(bag.next().uri).toBe('c');
    expect(bag.next().uri).not.toBe('c');
  });
  it('contains verified nostalgic classics and standard music discs', () => {
    for (const title of [
      'Sweden',
      'Minecraft',
      'Mice on Venus',
      'Haggstrom',
      'Pigstep - Stereo Mix',
      'otherside',
      'Creator',
      'Relic',
      'Precipice',
      'Tears',
    ]) {
      expect(playlist.tracks.some((track) => track.title === title)).toBe(true);
    }
    expect(playlist.tracks.filter((track) => track.mood === 'disc')).toHaveLength(6);
    expect(
      playlist.tracks.every((track) => /^spotify:track:[A-Za-z0-9]{22}$/.test(track.uri)),
    ).toBe(true);
  });
});
