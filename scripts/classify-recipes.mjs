import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const catalogue = JSON.parse(await readFile(resolve(root, 'src/data/catalogue.json'), 'utf8'));
const cache = resolve(root, 'build/cache');
await mkdir(cache, { recursive: true });
const releases = ['1.16', '1.17', '1.19', '1.20', '1.21', '1.21.9', '26.1', '26.2', '26.3'];
const history = await Promise.all(
  releases.map(async (version) => {
    const url = `https://raw.githubusercontent.com/misode/mcmeta/${version}-assets/assets/minecraft/lang/en_us.json`;
    const key = createHash('sha256').update(url).digest('hex');
    let text;
    try {
      text = await readFile(resolve(cache, key), 'utf8');
    } catch {
      const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) return { version, names: null };
      text = await response.text();
      await writeFile(resolve(cache, key), text);
    }
    return { version, names: JSON.parse(text) };
  }),
);
const colors =
  '(?:white|orange|magenta|light_blue|yellow|lime|pink|gray|light_gray|cyan|purple|blue|brown|green|red|black)';
const woods =
  '(?:oak|spruce|birch|jungle|acacia|dark_oak|mangrove|cherry|bamboo|crimson|warped|pale_oak|poplar)';
const familyOf = (id) =>
  id
    .replace(new RegExp(`^${colors}_`), 'colored_')
    .replace(new RegExp(`^(?:stripped_)?${woods}_`), 'wood_')
    .replace(
      /^(?:wooden|stone|iron|golden|diamond|netherite|copper)_(sword|pickaxe|axe|hoe|shovel|spear|helmet|chestplate|leggings|boots)$/,
      'material_$1',
    )
    .replace(/^waxed_/, '')
    .replace(/^(?:exposed_|weathered_|oxidized_)/, '')
    .replace(/^.*_(slab|stairs|wall)$/, 'building_$1');
const common = new Set([
  'crafting_table',
  'torch',
  'stick',
  'chest',
  'furnace',
  'bucket',
  'iron_pickaxe',
  'bread',
  'oak_planks',
  'oak_slab',
  'oak_stairs',
  'oak_door',
  'oak_button',
  'oak_pressure_plate',
  'oak_fence',
  'oak_trapdoor',
  'oak_boat',
  'white_bed',
  'iron_sword',
  'diamond_sword',
  'diamond_pickaxe',
  'stone_pickaxe',
  'wooden_pickaxe',
  'stone_sword',
  'iron_axe',
  'stone_axe',
  'diamond_axe',
  'wooden_axe',
  'golden_apple',
  'iron_block',
  'gold_block',
  'diamond_block',
  'coal_block',
  'iron_ingot',
  'gold_ingot',
  'iron_nugget',
  'gold_nugget',
  'sugar',
  'paper',
  'book',
  'bowl',
  'sandstone',
  'cobblestone_slab',
  'cobblestone_stairs',
  'arrow',
  'bone_meal',
  'bricks',
  'coal',
  'compass',
  'diamond',
  'emerald',
  'emerald_block',
  'flint_and_steel',
  'glass_bottle',
  'glass_pane',
  'glowstone',
  'hay_block',
  'iron_bars',
  'iron_door',
  'iron_trapdoor',
  'lapis_block',
  'lapis_lazuli',
  'lever',
  'minecart',
  'mushroom_stew',
  'redstone',
  'redstone_block',
  'redstone_torch',
  'slime_ball',
  'slime_block',
  'snow_block',
  'stone_bricks',
  'stone_button',
  'stone_pressure_plate',
]);
// Full-grid specialists remain a finale challenge without repeating five recent additions.
const finaleSpecialists = new Set([
  'activator_rail',
  'beacon',
  'blast_furnace',
  'cake',
  'conduit',
  'daylight_detector',
  'detector_rail',
  'end_crystal',
  'lodestone',
  'recovery_compass',
  'respawn_anchor',
  'sea_lantern',
]);
const specialists = new Set([
  'armor_stand',
  'brush',
  'creaking_heart',
  'end_rod',
  'fermented_spider_eye',
  'fire_charge',
  'grindstone',
  'lectern',
  'mace',
  'name_tag',
  'rabbit_stew',
  'shulker_box',
  'soul_campfire',
  'spectral_arrow',
  'spyglass',
  'target',
  'tinted_glass',
  'tripwire_hook',
  'wolf_armor',
  'writable_book',
]);
const explicit = {
  ladder: 2,
  bow: 2,
  bookshelf: 2,
  fishing_rod: 2,
  shield: 2,
  shears: 1,
  piston: 3,
  observer: 3,
  hopper: 3,
  comparator: 3,
  daylight_detector: 3,
  chiseled_bookshelf: 4,
  calibrated_sculk_sensor: 4,
  copper_bulb: 4,
  oak_shelf: 4,
  lightning_rod: 2,
  crafter: 5,
  copper_chest: 5,
  copper_lantern: 5,
};
const simpleMaterials =
  /^(?:oak_planks|cobblestone|stone|stick|coal|charcoal|iron_ingot|gold_ingot|copper_ingot|diamond|glass|paper|string|white_wool|leather|sand|dirt|wheat)$/;
const rareMaterials =
  /nether_star|echo_shard|breeze_rod|heavy_core|netherite|ghast_tear|heart_of_the_sea|shulker_shell|nautilus_shell|sculk|amethyst|blaze|prismarine|quartz|dragon_breath/;
const intermediate =
  /piston|dropper|dispenser|crafting_table|furnace|chest|repeater|comparator|torch|sensor|book|bucket|hopper/;
const byOutput = Map.groupBy(catalogue.recipes, (recipe) => recipe.output);
const targets = [];
const audit = [];
for (const [item, variants] of byOutput) {
  const firstSeen = history.find(
    (release) =>
      release.names?.[`item.minecraft.${item}`] || release.names?.[`block.minecraft.${item}`],
  );
  const firstIndex = firstSeen ? releases.indexOf(firstSeen.version) : releases.length - 1;
  const introduced = firstSeen ? `${firstIndex === 0 ? '≤' : 'by '}${firstSeen.version}` : '26.3';
  const metrics = variants.map((recipe) => {
    const sets = recipe.pattern ? recipe.pattern.flat().filter(Boolean) : recipe.ingredients;
    const unique = [...new Set(sets.map((set) => [...set].sort().join('|')))];
    const occupied = sets.length;
    const rarity = sets.reduce(
      (sum, set) => sum + (set.every((id) => rareMaterials.test(id)) ? 1 : 0),
      0,
    );
    const components = unique.filter((set) =>
      set.split('|').every((id) => intermediate.test(id)),
    ).length;
    const width = recipe.pattern?.[0]?.length ?? 0;
    const height = recipe.pattern?.length ?? 0;
    const holes = recipe.kind === 'shaped' ? width * height - occupied : 0;
    const asymmetric =
      recipe.pattern &&
      recipe.pattern.some((row) => JSON.stringify(row) !== JSON.stringify([...row].reverse()));
    const simple = sets.every((set) => set.some((id) => simpleMaterials.test(id)));
    const complexity =
      unique.length * 1.6 +
      occupied * 0.25 +
      rarity * 0.35 +
      components * 0.8 +
      holes * 0.25 +
      (asymmetric ? 1 : 0) +
      (recipe.kind === 'shapeless' ? -0.75 : 0);
    return {
      recipe: recipe.id,
      occupied,
      unique: unique.length,
      rarity,
      components,
      holes,
      asymmetric: !!asymmetric,
      simple,
      complexity,
    };
  });
  const easiest = metrics.reduce((a, b) => (a.complexity < b.complexity ? a : b));
  const family = familyOf(item);
  // Familiar shape families stay easy even if their source material is rare.
  let tier = easiest.complexity < 4 ? 2 : easiest.complexity < 7.5 ? 3 : 4;
  if (
    /material_(sword|pickaxe|axe|shovel|hoe)|colored_bed|wood_(planks|button|pressure_plate)/.test(
      family,
    )
  )
    tier = 1;
  if (
    /material_(helmet|chestplate|leggings|boots)|wood_(door|fence|trapdoor|boat|sign)/.test(family)
  )
    tier = 2;
  if (easiest.occupied <= 2 && easiest.unique <= 1) tier = 1;
  if (firstIndex >= 5 && !family.startsWith('material_')) tier = Math.min(4, tier + 1);
  // Review pass: low ingredient count is not evidence that players know an obscure recipe.
  if (
    tier === 1 &&
    !common.has(item) &&
    !/material_(sword|pickaxe|axe|shovel|hoe)|colored_bed|wood_(planks|button|pressure_plate)/.test(
      family,
    )
  )
    tier = 2;
  // Familiar stair/armor shapes do not become expert recipes just by changing material.
  if (family.startsWith('building_')) tier = Math.min(tier, firstIndex >= 5 ? 3 : 2);
  if (family === 'wood_hanging_sign') tier = 3;
  if (family === 'wood_shelf' || family === 'copper_bulb' || specialists.has(item)) tier = 4;
  if (common.has(item)) tier = 1;
  if (explicit[item]) tier = explicit[item];
  const finaleEligible =
    (firstIndex >= 4 || finaleSpecialists.has(item)) &&
    !family.endsWith('hanging_sign') &&
    metrics.every((m) => m.occupied >= 8 && m.unique >= 2);
  if (finaleEligible) tier = 5;
  // Waxing/dye conversions and item-to-itself alternates are not interesting race targets.
  const selfInput = variants.some((r) =>
    (r.pattern?.flat().filter(Boolean) ?? r.ingredients).some((set) => set.includes(item)),
  );
  const excluded = item.startsWith('waxed_') || selfInput;
  const note =
    tier === 1
      ? 'An everyday recipe. Make it count.'
      : tier === 2
        ? 'A familiar shape, a little more thought.'
        : tier === 3
          ? 'Less common. Every ingredient has its place.'
          : tier === 4
            ? 'A specialist recipe. Trust your memory.'
            : 'A full-grid specialist recipe for the final showdown.';
  if (!excluded) targets.push({ item, tier, introduced, note, family, finaleEligible });
  audit.push({
    item,
    family,
    tier,
    introduced,
    finaleEligible,
    excluded,
    easiest,
    variants: metrics,
  });
}
targets.sort((a, b) => a.tier - b.tier || a.item.localeCompare(b.item));
await writeFile(resolve(root, 'src/data/targets.json'), JSON.stringify(targets, null, 2) + '\n');
await writeFile(
  resolve(root, 'build/classification-audit.json'),
  JSON.stringify(
    { historyAvailable: history.filter((x) => x.names).map((x) => x.version), targets: audit },
    null,
    2,
  ),
);
const summary = Object.fromEntries(
  [1, 2, 3, 4, 5].map((tier) => {
    const pool = targets.filter((t) => t.tier === tier);
    return [tier, { outputs: pool.length, families: new Set(pool.map((t) => t.family)).size }];
  }),
);
console.log(
  JSON.stringify(
    {
      total: targets.length,
      families: new Set(targets.map((t) => t.family)).size,
      tiers: summary,
      finale: targets.filter((t) => t.tier === 5).map((t) => t.item),
    },
    null,
    2,
  ),
);
