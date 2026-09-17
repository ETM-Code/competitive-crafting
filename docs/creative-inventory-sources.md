# Canonical creative inventory sources

The creative inventory uses Minecraft Java **26.3** tab membership and order, not the catalogue's legacy regex categories or an alphabetic list. It is a supported subset of vanilla: item-ID-only stacks, with component-specific variants explicitly excluded.

## Reuse decision and measured coverage

| Candidate                                                                          | Decision                                                      | Measurement / reason                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `misode/mcmeta` 26.3 registries, commit `2240df2376509bfaf12becbb36e156e29f8ecb4d` | Reuse for recipe/assets sources; reject for creative ordering | `creative_mode_tab/data.json` contains only 14 alphabetically sorted tab identifiers, no membership/order. The 26.3 summary tree also has no creative contents report.                                                                                                                                                |
| PrismarineJS `minecraft-data`                                                      | Reject for this export                                        | Latest inspected Java dataset was 26.1, with no exact 26.3 creative-tab membership/order.                                                                                                                                                                                                                             |
| `jawa` 2.2.0 (MIT)                                                                 | Borrow for initial inspection only                            | Read unobfuscated Java 25 classfiles to locate native tab builders and dynamic generators. No bespoke classfile parser or runtime dependency was added.                                                                                                                                                               |
| Official vanilla 26.3 client runtime                                               | Adopt as exact generation oracle                              | Native registry/tag/component initialization and `CreativeModeTabs.tryRebuildTabContents` export all dynamic sections. Ten visible category tabs, 2,000 search stacks, 1,617 supported plain item IDs, 383 component variants excluded, zero missing supported renders, zero missing supported recipe inputs/outputs. |
| Native HTML `<dialog>`                                                             | Adopt for expanded room QR                                    | Browser-provided modal top layer, inert background, focus containment, Escape dismissal, explicit close, and focus restoration; no custom modal/focus-trap library.                                                                                                                                                   |

The client archive is proprietary upstream material, not a vendored open-source dependency. The game JAR, launcher libraries, JDK, compiled classes and raw export stay under ignored `build/`. The repository ships only our small public-API caller, source locks, normalized ordered metadata and coverage audit. No decompiled game implementation is copied into the project.

## Exact export

Run:

```sh
node scripts/sync-minecraft.mjs
node scripts/sync-creative-tabs.mjs
```

The normal application build consumes committed JSON and does not run Java or download Minecraft. To regenerate on other platforms, set `JAVA_HOME` to a Java 25 **JDK**. On macOS ARM64, the script can download a SHA256-verified, isolated Temurin 25 JDK under `build/creative-jdk`; it never installs Java globally. The JDK URL/checksum/version is locked alongside the official client and version metadata.

`scripts/java/CreativeDump.java`:

1. Bootstraps built-in registries.
2. Opens the vanilla server-data pack from the client archive.
3. Loads built-in tags and dynamic world registries, including their tags.
4. Binds default data components against the complete lookup.
5. Builds native tab contents with `FeatureFlags.VANILLA_SET` and **no operator permissions**.
6. Emits native tab order, display order, native search order, row/column, icons, labels, and whether each stack has a component patch.

`scripts/lib/creative-tabs.mjs` preserves native category order and keeps the exact subsequence of unmodified stacks. It does not flatten categories to a single membership: **200 items belong to multiple tabs**. Search comes from vanilla's own Search Items tab, not a deduplicated alphabetic catalogue. This also respects vanilla's distinction between category-visible and search-only component variants.

`scripts/sync-creative-tabs.mjs` verifies SHA1 for official version metadata, client and every launcher dependency; download concurrency is capped at six. Immutable downloads are URL-hash cached. The expensive native oracle is cached by source lock, exporter content hash and exact Java version. A cache hit still runs the cheap normalizer and validates catalogue coverage. Subprocesses have timeouts and run with `build/creative` as their working directory so Minecraft logs cannot leak into the source tree.

Outputs:

- `src/data/creative-tabs.json`: `{ version, tabs: [{ id, label, icon, items }], search }`. Icons and items are unnamespaced catalogue item IDs.
- `src/data/creative-source-manifest.json`: counts, exclusions, overlap, source lock and reproducibility hashes.

## Supported native tab counts

| Native tab        | Native display stacks | Supported plain items |
| ----------------- | --------------------: | --------------------: |
| Building Blocks   |                   475 |                   475 |
| Colored Blocks    |                   278 |                   278 |
| Natural Blocks    |                   254 |                   254 |
| Functional Blocks |                   284 |                   236 |
| Redstone Blocks   |                    70 |                    70 |
| Tools & Utilities |                   158 |                   149 |
| Combat            |                   126 |                    78 |
| Food & Drinks     |                   195 |                    43 |
| Ingredients       |                   194 |                   151 |
| Spawn Eggs        |                    89 |                    89 |

Saved Hotbars and Survival Inventory are player-state views, not useful crafting-game categories. Operator Utilities is hidden because the exporter has no operator permission. All three are excluded. The search tab is represented by the `search` list rather than duplicating it as a category.

The 383 search-stack exclusions are: 47 preset paintings, 1 banner variant, 2 firework rocket variants, 7 goat horn variants, 46 tipped arrows, 10 suspicious stews, 4 ominous bottles, 46 potions, 46 splash potions, 46 lingering potions and 128 enchanted books. These require component-aware state/artwork, which this crafting game does not model. Plain defaults such as an ordinary painting, default horn or default rocket remain when vanilla actually supplies them. Variants are **not** mislabeled as plain slots or silently flattened. All 1,185 supported crafting recipes retain every ingredient alternative and output in the 1,617-item search list.

## Recipe normalization

The importer trims all-empty outer rows and columns from shaped recipes, while preserving internal holes. This changes exactly seven existing shapes: `creaking_heart`, `mace`, `spyglass`, and the four `waxed_*chiseled_copper` states. It enables vanilla-compatible placement offsets for those patterns. Source paths are sorted before normalization so concurrent download completion cannot reorder recipes or change audit hashes between runs.

## Validation

- `tests/unit/creative-tabs.test.ts`: native tab order/counts; exact family and color ordering; overlap; render/icon integrity; all recipe ingredient/output coverage; excluded component totals; native-export metadata hash; all shaped recipe outer bounds and preserved chest hole.
- Exporter was run successfully against the pinned runtime, then rerun successfully from its hash-keyed oracle cache with identical normalized metadata.
- `tests/e2e/room-qr.spec.ts`: native QR dialog decode, keyboard focus containment/restoration, Escape/button/backdrop dismissal, square QR containment and padded viewport bounds across desktop, small phone, phone, landscape and keyboard-sized viewports. Screenshots live in ignored `ui-progress/qr/`.

## Sources

- [Pinned official version metadata](https://piston-meta.mojang.com/v1/packages/96c00d95a31328714d3811cfade2804bb050e455/26.3.json)
- [Official client archive](https://piston-data.mojang.com/v1/objects/e877b6a07acd633fb3bb475002175cec036e7b87/client.jar)
- [mcmeta creative registry identifiers](https://raw.githubusercontent.com/misode/mcmeta/2240df2376509bfaf12becbb36e156e29f8ecb4d/creative_mode_tab/data.json)
- [PrismarineJS minecraft-data](https://github.com/PrismarineJS/minecraft-data)
- [Jawa](https://github.com/TkTech/Jawa)
- [Temurin 25.0.4.1+1](https://github.com/adoptium/temurin25-binaries/releases/tag/jdk-25.0.4.1%2B1)
