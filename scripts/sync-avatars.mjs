import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const lock = JSON.parse(await readFile(resolve(root, 'scripts/sources.lock.json'), 'utf8'));
const output = resolve(root, 'public/assets/avatars');
const cache = resolve(root, 'build/cache/avatar-sources', lock.assets);
await mkdir(output, { recursive: true });
await mkdir(cache, { recursive: true });
const definitions = [
  ['creeper', 'creeper/creeper.png', [8, 8, 8, 8]],
  ['pig', 'pig/pig_temperate.png', [8, 8, 8, 8]],
  ['zombie', 'zombie/zombie.png', [8, 8, 8, 8]],
  ['wither', 'wither/wither.png', [8, 8, 8, 8]],
  ['iron_golem', 'iron_golem/iron_golem.png', [8, 8, 8, 10]],
  ['ender_dragon', 'enderdragon/dragon.png', [128, 46, 16, 16]],
  ['blaze', 'blaze/blaze.png', [8, 8, 8, 8]],
  ['villager', 'villager/villager.png', [8, 8, 8, 10]],
  ['skeleton', 'skeleton/skeleton.png', [8, 8, 8, 8]],
  ['herobrine', 'player/wide/steve.png', [8, 8, 8, 8]],
  ['enderman', 'enderman/enderman.png', [8, 8, 8, 8]],
  ['spider', 'spider/spider.png', [40, 12, 8, 8]],
];
async function loadTexture(id, path) {
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
  return PNG.sync.read(bytes);
}
await Promise.all(
  definitions.map(async ([id, path, [left, top, width, height]]) => {
    const source = await loadTexture(id, path);
    const eyes = ['enderman', 'spider'].includes(id)
      ? await loadTexture(`${id}_eyes`, `${id}/${id}_eyes.png`)
      : null;
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
        if (['villager', 'iron_golem'].includes(id) && x >= 48 && x < 80 && y >= 80) {
          // The projecting 2×4 nose has its own front UV; fit it into the square portrait.
          sx = 26 + Math.floor((x - 48) / 16);
          sy = 2 + Math.floor((y - 80) / 12);
        }
        const si = (sy * source.width + sx) * 4;
        const di = (y * 128 + x) * 4;
        source.data.copy(image.data, di, si, si + 4);
        if (eyes) {
          // These mobs' visible eye colors live in a separate emissive texture layer.
          const alpha = eyes.data[si + 3] / 255;
          for (let channel = 0; channel < 3; channel++)
            image.data[di + channel] = Math.round(
              eyes.data[si + channel] * alpha + image.data[di + channel] * (1 - alpha),
            );
        }
        if (
          id === 'herobrine' &&
          y >= 64 &&
          y < 80 &&
          ((x >= 16 && x < 48) || (x >= 80 && x < 112))
        ) {
          // Herobrine is a fan homage, not a vanilla mob: Steve with fully white eyes.
          image.data.fill(255, di, di + 4);
        }
      }
    }
    await writeFile(resolve(output, `${id}.png`), PNG.sync.write(image));
    console.log(
      `Created ${id} face from ${id === 'herobrine' ? 'Steve texture with fan-made white eyes' : 'canonical texture'}`,
    );
  }),
);
