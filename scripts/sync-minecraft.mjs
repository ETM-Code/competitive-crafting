import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cache = resolve(root, 'build/cache');
await mkdir(cache, { recursive: true });
const hash = (value) => createHash('sha256').update(value).digest('hex');
async function get(url, binary = false) {
  const file = resolve(cache, hash(url));
  let bytes;
  try {
    bytes = await readFile(file);
  } catch {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const response = await fetch(url, {
          headers: { 'User-Agent': 'competitive-crafting/1.0' },
          signal: AbortSignal.timeout(45000),
        });
        if (!response.ok) throw new Error(`${response.status} ${url}`);
        bytes = Buffer.from(await response.arrayBuffer());
        await writeFile(file, bytes);
        break;
      } catch (error) {
        if (attempt === 3) throw error;
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      }
    }
  }
  return binary ? bytes : JSON.parse(bytes.toString());
}
async function pool(values, worker, concurrency = 12) {
  let cursor = 0;
  return Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (cursor < values.length) {
        const index = cursor++;
        await worker(values[index], index);
      }
    }),
  );
}
const api = 'https://api.github.com/repos';
const raw = 'https://raw.githubusercontent.com';
const version = '26.3';
const lockPath = resolve(root, 'scripts/sources.lock.json');
let lock;
try {
  lock = JSON.parse(await readFile(lockPath, 'utf8'));
} catch {
  const [data, assets, renders, font] = await Promise.all([
    get(`${api}/misode/mcmeta/commits/${version}-data-json`),
    get(`${api}/misode/mcmeta/commits/${version}-assets`),
    get(`${api}/Owen1212055/mc-assets/commits/main`),
    get(`${api}/IdreesInc/Monocraft/commits/main`),
  ]);
  lock = { version, data: data.sha, assets: assets.sha, renders: renders.sha, font: font.sha };
  await writeFile(lockPath, JSON.stringify(lock, null, 2) + '\n');
}
console.log('Pinned sources', lock);
const [tree, renderTree, fontTree] = await Promise.all([
  get(`${api}/misode/mcmeta/git/trees/${lock.data}?recursive=1`),
  get(`${api}/Owen1212055/mc-assets/git/trees/${lock.renders}?recursive=1`),
  get(`${api}/IdreesInc/Monocraft/git/trees/${lock.font}?recursive=1`),
]);
for (const t of [tree, renderTree, fontTree])
  if (t.truncated) throw new Error('Source tree truncated; use archive instead');
const files = tree.tree.filter(
  (x) =>
    x.type === 'blob' && /^data\/minecraft\/(recipe\/.*\.json|tags\/item\/.*\.json)$/.test(x.path),
);
const source = new Map();
await pool(
  files,
  async (file, i) => {
    source.set(file.path, await get(`${raw}/misode/mcmeta/${lock.data}/${file.path}`));
    if (i % 250 === 0) console.log(`Data ${i}/${files.length}`);
  },
  16,
);
const strip = (name) => name.replace(/^minecraft:/, '');
const tagCache = new Map();
function tag(name, seen = new Set()) {
  name = strip(name);
  if (tagCache.has(name)) return tagCache.get(name);
  if (seen.has(name)) throw new Error(`Cyclic tag: ${name}`);
  const next = new Set([...seen, name]);
  const data = source.get(`data/minecraft/tags/item/${name}.json`);
  if (!data) throw new Error(`Missing ingredient tag ${name}`);
  const values = [
    ...new Set(
      data.values.flatMap((v) => {
        const id = typeof v === 'string' ? v : v.id;
        return id.startsWith('#') ? tag(id.slice(1), next) : [strip(id)];
      }),
    ),
  ];
  tagCache.set(name, values);
  return values;
}
function ingredient(value) {
  if (Array.isArray(value)) return [...new Set(value.flatMap(ingredient))];
  if (typeof value === 'object') return value.tag ? tag(value.tag) : [strip(value.item)];
  return value.startsWith('#') ? tag(value.slice(1)) : [strip(value)];
}
const renderFiles = new Map(
  renderTree.tree
    .filter((f) => f.path.startsWith('item-assets/') && f.path.endsWith('.png'))
    .map((f) => [f.path.slice(12, -4).toLowerCase(), f.path]),
);
const language = await get(`${raw}/misode/mcmeta/${lock.assets}/assets/minecraft/lang/en_us.json`);
const itemIds = new Set(
  Object.keys(language)
    .filter((k) => k.startsWith('item.minecraft.'))
    .map((k) => k.slice(15))
    .filter((k) => !k.includes('.')),
);
for (const id of renderFiles.keys())
  if (language[`block.minecraft.${id}`] || language[`item.minecraft.${id}`]) itemIds.add(id);
const recipes = [];
const excluded = [];
// Network/cache completion order must not change recipe order or catalogue hashes.
for (const [path, recipe] of [...source].sort(([a], [b]) => a.localeCompare(b))) {
  if (!path.startsWith('data/minecraft/recipe/')) continue;
  if (!['minecraft:crafting_shaped', 'minecraft:crafting_shapeless'].includes(recipe.type))
    continue;
  if (!recipe.result?.id || recipe.result.components) {
    excluded.push({ path, reason: 'component-dependent output' });
    continue;
  }
  const output = strip(recipe.result.id);
  const normalized = {
    id: path.split('/').at(-1).slice(0, -5),
    output,
    count: recipe.result.count ?? 1,
    kind: recipe.type.endsWith('shapeless') ? 'shapeless' : 'shaped',
  };
  if (normalized.kind === 'shaped') {
    const rows = recipe.pattern.map((row) =>
      [...row].map((char) => (char === ' ' ? null : ingredient(recipe.key[char]))),
    );
    // Vanilla trims empty outer rows/columns before testing offsets and horizontal mirrors.
    const occupied = rows.flatMap((row, y) => row.flatMap((cell, x) => (cell ? [{ x, y }] : [])));
    if (!occupied.length) throw new Error(`Empty shaped recipe: ${path}`);
    const left = Math.min(...occupied.map((cell) => cell.x));
    const right = Math.max(...occupied.map((cell) => cell.x));
    const top = Math.min(...occupied.map((cell) => cell.y));
    const bottom = Math.max(...occupied.map((cell) => cell.y));
    normalized.pattern = rows.slice(top, bottom + 1).map((row) => row.slice(left, right + 1));
  } else normalized.ingredients = recipe.ingredients.map(ingredient);
  const ids = [
    output,
    ...(normalized.pattern?.flat().flatMap((x) => x ?? []) ?? normalized.ingredients.flat()),
  ];
  const missing = ids.filter((id) => !renderFiles.has(id));
  if (missing.length) {
    excluded.push({ path, reason: `Missing native renders: ${missing.join(',')}` });
    continue;
  }
  ids.forEach((id) => itemIds.add(id));
  recipes.push(normalized);
}
function category(id) {
  if (
    /sword|pickaxe|shovel|hoe$|axe$|helmet|chestplate|leggings|boots|bow$|arrow|shield|spear|elytra|fishing_rod/.test(
      id,
    )
  )
    return 'equipment';
  if (
    /redstone|piston|observer|dispenser|dropper|crafter|hopper|comparator|repeater|lever|button|pressure_plate|daylight|sculk|copper_bulb|target|rail/.test(
      id,
    )
  )
    return 'redstone';
  if (
    /ingot|nugget|dust|stick$|diamond$|emerald$|quartz$|amethyst_shard|coal$|charcoal|leather|paper|string|feather|flint|blaze|slime_ball|honeycomb|resin_clump/.test(
      id,
    )
  )
    return 'ingredients';
  if (
    /flower|sapling|leaves|seed|wheat|apple|carrot|potato|mushroom|bamboo$|cactus|vine|grass|fern|dirt|sand$|snow|kelp|moss|tulip|daisy|poppy|orchid|bush|coral/.test(
      id,
    )
  )
    return 'nature';
  if (
    /block|planks|log|wood|stone|brick|slab|stairs|fence|wall|glass|terracotta|concrete|wool|copper|door|chest|table|bookshelf|shelf/.test(
      id,
    )
  )
    return 'building';
  return 'other';
}
const items = [...itemIds]
  .filter((id) => id !== 'air' && renderFiles.has(id))
  .sort()
  .map((id) => ({
    id,
    name:
      language[`item.minecraft.${id}`] ??
      language[`block.minecraft.${id}`] ??
      id
        .split('_')
        .map((w) => w[0].toUpperCase() + w.slice(1))
        .join(' '),
    category: category(id),
    icon: `/assets/items/${id.toUpperCase()}.png`,
  }));
await mkdir(resolve(root, 'public/assets/items'), { recursive: true });
const invalidRenders = [];
await pool(
  items,
  async (item, i) => {
    const destination = resolve(root, `public${item.icon}`);
    try {
      await access(destination);
      return;
    } catch {
      /* first sync */
    }
    const bytes = await get(
      `${raw}/Owen1212055/mc-assets/${lock.renders}/${renderFiles.get(item.id)}`,
      true,
    );
    const width = bytes.readUInt32BE(16),
      height = bytes.readUInt32BE(20);
    if (width < 256 || height < 256) invalidRenders.push({ item: item.id, width, height });
    await writeFile(destination, bytes);
    if (i % 250 === 0) console.log(`Renders ${i}/${items.length}`);
  },
  16,
);
const fontFile = fontTree.tree.find((x) => x.path === 'dist/Monocraft-ttf/Monocraft.ttf');
if (!fontFile) throw new Error('No Monocraft font found');
await writeFile(
  resolve(root, 'public/assets/Monocraft.ttf'),
  await get(`${raw}/IdreesInc/Monocraft/${lock.font}/${fontFile.path}`, true),
);
const fontLicense = fontTree.tree.find((x) => /OFL|LICENSE/i.test(x.path) && x.type === 'blob');
if (fontLicense)
  await writeFile(
    resolve(root, 'public/assets/Monocraft-LICENSE.txt'),
    await get(`${raw}/IdreesInc/Monocraft/${lock.font}/${fontLicense.path}`, true),
  );
// Vanilla panorama keeps the background recognizably Minecraft rather than a stock forest photo.
await writeFile(
  resolve(root, 'public/assets/panorama.png'),
  await get(
    `${raw}/misode/mcmeta/${lock.assets}/assets/minecraft/textures/gui/title/background/panorama_0.png`,
    true,
  ),
);
await mkdir(resolve(root, 'src/data'), { recursive: true });
const catalogue = { version, items, recipes };
await writeFile(
  resolve(root, 'src/data/catalogue.json'),
  JSON.stringify(catalogue, null, 2) + '\n',
);
const audit = {
  version,
  sources: lock,
  items: items.length,
  recipes: recipes.length,
  outputs: new Set(recipes.map((r) => r.output)).size,
  catalogueSha256: hash(JSON.stringify(catalogue)),
  invalidRenders,
  excluded,
};
await writeFile(resolve(root, 'src/data/source-manifest.json'), JSON.stringify(audit, null, 2));
console.log('Complete', {
  items: items.length,
  recipes: recipes.length,
  excluded: excluded.length,
  invalidRenders,
});
