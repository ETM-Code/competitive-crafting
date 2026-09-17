import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const lock = JSON.parse(await readFile(resolve(root, 'scripts/sources.lock.json'), 'utf8'));
const output = resolve(root, 'public/assets');
const cache = resolve(root, 'build/cache');
await mkdir(output, { recursive: true });
await mkdir(cache, { recursive: true });

async function syncFace(index) {
  const url = `https://raw.githubusercontent.com/misode/mcmeta/${lock.assets}/assets/minecraft/textures/gui/title/background/panorama_${index}.png`;
  const cacheFile = resolve(cache, `${createHash('sha256').update(url).digest('hex')}.png`);
  let bytes;
  try {
    bytes = await readFile(cacheFile);
  } catch {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
        if (!response.ok) throw new Error(`Panorama face ${index}: HTTP ${response.status}`);
        bytes = Buffer.from(await response.arrayBuffer());
        PNG.sync.read(bytes);
        await writeFile(cacheFile, bytes);
        break;
      } catch (error) {
        if (attempt === 2) throw error;
      }
    }
  }
  const image = PNG.sync.read(bytes);
  if (image.width !== image.height || image.width < 1024) {
    throw new Error(`Unexpected panorama face dimensions: ${index} ${image.width}×${image.height}`);
  }
  await writeFile(resolve(output, `panorama-${index}.png`), bytes);
  return {
    face: index,
    url,
    width: image.width,
    height: image.height,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

// Three concurrent requests at most; immutable URLs make repeat runs entirely local.
const faces = [];
for (let start = 0; start < 6; start += 3) {
  faces.push(...(await Promise.all([start, start + 1, start + 2].map(syncFace))));
}
await writeFile(
  resolve(output, 'panorama-sources.json'),
  `${JSON.stringify({ version: lock.version, assets: lock.assets, faces }, null, 2)}\n`,
);
console.log(
  `Synced ${faces.length} native Minecraft ${lock.version} cubemap faces: ${faces[0].width}×${faces[0].height}, ${faces.reduce((sum, face) => sum + face.bytes, 0).toLocaleString()} bytes`,
);
