import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const lock = JSON.parse(await readFile(resolve(root, 'scripts/sources.lock.json'), 'utf8'));
const output = resolve(root, 'public/assets/avatars');
const cache = resolve(root, 'build/avatar-sources');
await mkdir(output, { recursive: true });
await mkdir(cache, { recursive: true });
const definitions = [
  ['creeper', 'creeper/creeper.png', [8, 8, 8, 8]],
  ['pig', 'pig/pig_temperate.png', [8, 8, 8, 8]],
  ['zombie', 'zombie/zombie.png', [8, 8, 8, 8]],
  ['wither', 'wither/wither.png', [8, 8, 8, 8]],
  ['iron_golem', 'iron_golem/iron_golem.png', [8, 8, 8, 10]],
  ['ender_dragon', 'enderdragon/dragon.png', [128, 46, 16, 16]],
];
for (const [id, path, [left, top, width, height]] of definitions) {
  const url = `https://raw.githubusercontent.com/misode/mcmeta/${lock.assets}/assets/minecraft/textures/entity/${path}`;
  const cacheFile = resolve(cache, `${id}.png`);
  let bytes;
  try {
    bytes = await readFile(cacheFile);
  } catch {
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Avatar unavailable: ${id} ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    await writeFile(cacheFile, bytes);
  }
  const source = PNG.sync.read(bytes);
  const image = new PNG({ width: 128, height: 128 });
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 128; x++) {
      let sx = left + Math.floor((x * width) / 128);
      let sy = top + Math.floor((y * height) / 128);
      if (id === 'pig' && x >= 32 && x < 96 && y >= 64 && y < 112) {
        // Snout front is a separate 4×3 UV patch on the current pig model.
        sx = 17 + Math.floor((x - 32) / 16);
        sy = 16 + Math.floor((y - 64) / 16);
      }
      if (id === 'ender_dragon' && x >= 16 && x < 112 && y >= 72 && y < 112) {
        // Composite the projecting snout over the head face instead of showing mouth interior.
        sx = 192 + Math.floor((x - 16) / 8);
        sy = 60 + Math.floor((y - 72) / 8);
      }
      const si = (sy * source.width + sx) * 4;
      const di = (y * 128 + x) * 4;
      source.data.copy(image.data, di, si, si + 4);
    }
  }
  await writeFile(resolve(output, `${id}.png`), PNG.sync.write(image));
  console.log(`Created ${id} face from canonical texture`);
}
