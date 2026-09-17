import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cache = resolve(root, 'build/cache/spotify-playlist.html');
await mkdir(dirname(cache), { recursive: true });
let html;
try {
  html = await readFile(cache, 'utf8');
} catch {
  const response = await fetch('https://open.spotify.com/embed/playlist/5T4KWhz9Q8r98skQBimtlH', {
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Playlist unavailable: ${response.status}`);
  html = await response.text();
  await writeFile(cache, html);
}
const match = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
if (!match) throw new Error('Spotify embed metadata changed; no tracks written');
const entity = JSON.parse(match[1]).props.pageProps.state.data.entity;
const selections = {
  nostalgic: [
    'Sweden',
    'Minecraft',
    'Mice on Venus',
    'Aria Math',
    'Subwoofer Lullaby',
    'Wet Hands',
    'Dry Hands',
    'Haggstrom',
    'Living Mice',
    'Moog City 2',
    'Beginning 2',
    'Taswell',
  ],
  disc: ['Pigstep - Stereo Mix', 'otherside', 'Creator', 'Relic', 'Precipice', 'Tears'],
  hype: [
    'otherside (Turbo Remix)',
    "Arch-Illager's Pigstep",
    'Comforting Memories (Synthion Remix)',
    'Precipice (Hyper Potions Remix)',
  ],
};
const tracks = Object.entries(selections).flatMap(([mood, titles]) =>
  titles.map((title) => {
    const track = entity.trackList.find((t) => t.title === title);
    if (!track) throw new Error(`Requested track no longer in approved playlist: ${title}`);
    return {
      title,
      artist: track.subtitle.replaceAll(' ', ' '),
      uri: track.uri,
      mood,
    };
  }),
);
await mkdir(resolve(root, 'src/data'), { recursive: true });
await writeFile(
  resolve(root, 'src/data/playlist.json'),
  JSON.stringify({ playlistUri: entity.uri, name: entity.name, tracks }, null, 2),
);
console.log(
  `Verified ${tracks.length} selections from ${entity.trackList.length} playlist tracks. No audio downloaded.`,
);
