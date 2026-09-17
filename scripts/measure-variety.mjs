import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build, version } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const inputs = [
  'scripts/measure-variety.mjs',
  'src/shared/rules.ts',
  'src/shared/recipes.ts',
  'src/shared/catalogue.ts',
  'src/data/catalogue.json',
  'src/data/targets.json',
];
const hash = createHash('sha256').update(version);
for (const path of inputs) hash.update(await readFile(resolve(root, path)));
const directory = resolve(root, 'build/cache/variety', hash.digest('hex'));
const resultPath = resolve(directory, 'result.json');
let result;
try {
  result = JSON.parse(await readFile(resultPath, 'utf8'));
} catch {
  await mkdir(directory, { recursive: true });
  const modulePath = resolve(directory, 'rules.mjs');
  await build({
    entryPoints: [resolve(root, 'src/shared/rules.ts')],
    outfile: modulePath,
    bundle: true,
    platform: 'node',
    format: 'esm',
  });
  const { selectTargets, DEFAULT_SETTINGS } = await import(pathToFileURL(modulePath).href);
  const targets = JSON.parse(await readFile(resolve(root, 'src/data/targets.json'), 'utf8'));
  result = { seeds: 100, matchesPerSeed: 30, recentFamilyLimit: 50, tiers: {} };
  for (let tier = 1; tier <= 5; tier++) {
    const pool = targets.filter((target) => target.tier === tier);
    result.tiers[tier] = {
      outputs: pool.length,
      families: new Set(pool.map((target) => target.family)).size,
      draws: 0,
      adjacentTargetRepeats: 0,
      precedingFiveMatchRepeats: 0,
    };
  }
  for (let seed = 1; seed <= result.seeds; seed++) {
    let state = seed;
    const random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
    let recent = [];
    const prior = [];
    for (let match = 0; match < result.matchesPerSeed; match++) {
      const chosen = selectTargets(DEFAULT_SETTINGS, random, recent);
      const last = new Set(prior.at(-1)?.map((target) => target.item));
      const lastFive = new Set(
        prior
          .slice(-5)
          .flat()
          .map((target) => target.item),
      );
      for (const target of chosen) {
        const stats = result.tiers[target.tier];
        stats.draws++;
        stats.adjacentTargetRepeats += Number(last.has(target.item));
        stats.precedingFiveMatchRepeats += Number(lastFive.has(target.item));
      }
      prior.push(chosen);
      recent = [
        ...new Set([...recent, ...chosen.map((target) => target.family ?? target.item)].reverse()),
      ]
        .slice(0, result.recentFamilyLimit)
        .reverse();
    }
  }
  await writeFile(resultPath, JSON.stringify(result, null, 2) + '\n');
}
await writeFile(
  resolve(root, 'build/recipe-variety-audit.json'),
  JSON.stringify(result, null, 2) + '\n',
);
console.log(JSON.stringify(result, null, 2));
