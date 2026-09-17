import { shuffle } from '../shared/recipes';

export interface JukeboxTrack {
  title: string;
  artist: string;
  uri: string;
  mood: string;
}

export function createShuffleBag<T extends { uri: string }>(
  tracks: readonly T[],
  random = Math.random,
) {
  if (!tracks.length) throw new Error('The jukebox needs at least one track.');
  let remaining: T[] = [];
  let previous: string | undefined;
  return {
    next(): T {
      if (!remaining.length) {
        remaining = shuffle([...tracks], random);
        if (remaining.length > 1 && remaining[0].uri === previous) {
          [remaining[0], remaining[1]] = [remaining[1], remaining[0]];
        }
      }
      const track = remaining.shift()!;
      previous = track.uri;
      return track;
    },
    select(uri: string) {
      if (!tracks.some((track) => track.uri === uri)) return;
      remaining = remaining.filter((track) => track.uri !== uri);
      previous = uri;
    },
  };
}
