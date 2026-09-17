import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = {
  version: '26.3',
  event: 'ui.button.click',
  path: 'minecraft/sounds/random/click_stereo.ogg',
  hash: 'f0ca66561f832bf2f60b393837297c2692367cd5',
  size: 7188,
  assetIndex: 'd8492bc61d32a4874c77daa03c0cba9201e9b83b',
};
const cache = resolve(root, 'build/cache/sounds');
const output = resolve(root, 'public/assets/sounds');
await Promise.all([mkdir(cache, { recursive: true }), mkdir(output, { recursive: true })]);
const original = resolve(cache, `${source.hash}.ogg`);
let bytes;
try {
  bytes = await readFile(original);
} catch {
  const response = await fetch(
    `https://resources.download.minecraft.net/${source.hash.slice(0, 2)}/${source.hash}`,
    { signal: AbortSignal.timeout(30000) },
  );
  if (!response.ok) throw new Error(`Minecraft sound unavailable: ${response.status}`);
  bytes = Buffer.from(await response.arrayBuffer());
}
if (bytes.length !== source.size || createHash('sha1').update(bytes).digest('hex') !== source.hash)
  throw new Error('Minecraft button sound integrity mismatch');
await writeFile(original, bytes);
const toolVersion = execFileSync('ffmpeg', ['-version'], {
  encoding: 'utf8',
  timeout: 10000,
}).split('\n')[0];
const conversionKey = createHash('sha256')
  .update(`${source.hash}:${toolVersion}:pcm_s16le:44100:stereo`)
  .digest('hex');
const converted = resolve(cache, `${conversionKey}.wav`);
try {
  await readFile(converted);
} catch {
  execFileSync(
    'ffmpeg',
    [
      '-v',
      'error',
      '-nostdin',
      '-i',
      original,
      '-acodec',
      'pcm_s16le',
      '-ar',
      '44100',
      '-ac',
      '2',
      converted,
    ],
    { timeout: 30000 },
  );
}
await copyFile(converted, resolve(output, 'button-click.wav'));
await writeFile(
  resolve(output, 'source.json'),
  JSON.stringify({ ...source, toolVersion, conversionKey }, null, 2) + '\n',
);
console.log(`Verified Minecraft ${source.version} stereo button click; cached WAV conversion.`);
