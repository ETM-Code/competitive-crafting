# Recipe variety

Measured and reviewed on 2026-09-17 after playtesting reported repeated recipes.

## Diagnosis and changes

The catalogue already contained 930 race targets, but their distribution was uneven. The last round always drew from only five post-1.21 recipes. Tier 4 had 29 outputs but just 16 distinct families; 13 outputs were the same shelf shape in different woods. Adding cosmetic variants would not solve that problem.

The existing selector already samples families before material variants and retains the last 50 families across rematches in a room. However, once every family in a tier was in that history, it discarded recency and sampled the whole tier again. The five-recipe finale could therefore repeat immediately.

- **Adopt the existing canonical corpus and selector.** No new matching engine, sampling dependency or unofficial recipes. Keep family-balanced selection, exact target uniqueness, round progression and scoring.
- **Broaden the narrow tiers by reviewing actual shapes and ingredients.** Familiar recipes such as arrow, compass, lever, minecart, glass bottle and redstone torch join tier 1. Specialist recipes such as rabbit stew, grindstone, lectern, wolf armor, tinted glass, end rod and brush join tier 4. Requested basic tier-1 overrides remain; ladder and bow remain tier 2.
- **Broaden finales beyond release age, not beyond the difficulty requirement.** Add 12 distinct full-grid specialists, including cake, conduit, beacon, blast furnace, end crystal and recovery compass. All five recent finales remain. Every supported alternate for a finale requires at least eight occupied cells and two ingredient groups. Dye/material variants are not counted as new finale challenges.
- **Preserve ordered recency when a pool exhausts.** Use an unplayed family when available; otherwise choose the oldest played family. First prefer families not already used in the current match. State still persists server-side through rematches, without a schema change.
- **Correct classification metrics.** Shapeless recipes have zero shape holes, not negative holes. Newly trimmed source patterns no longer gain difficulty from empty outer columns. Keep all copper-bulb material variants together in tier 4 and hanging-sign wood variants together in tier 3.

## Pool coverage

Counts are output IDs / distinct families. The total remains **930 outputs in 319 families**: this is an honest redistribution of already supported recipes, not an inflated claim of newly implemented recipes.

| Tier |    Before |     After |
| ---- | --------: | --------: |
| 1    |  109 / 37 |  139 / 67 |
| 2    | 471 / 170 | 442 / 141 |
| 3    | 316 / 113 |  289 / 86 |
| 4    |   29 / 16 |   43 / 28 |
| 5    |     5 / 5 |   17 / 17 |

Tiers 2 and 3 supply some of the newly calibrated starter and specialist choices; they retain the largest pools.

## Repeat measurement

The deterministic audit runs 100 seeded rooms, 30 consecutive ten-round Classic matches each, with the production 50-family history policy: **30,000 selected rounds, including 3,000 finales**.

- Before: **280 finales repeated the preceding match's target**, and **1,209 finales repeated a target from the preceding five matches**.
- After: **zero adjacent-match repeats and zero preceding-five-match target repeats in any tier** in this corpus run.
- This is measured coverage, not a promise of never repeating. History is bounded and room-local; creating a new room starts a fresh random selection. Cosmetic families can also span difficulty tiers. Difficulty remains a reviewed estimate, not measured player success data.

## Reproduce

```sh
node scripts/classify-recipes.mjs
node scripts/measure-variety.mjs
npx vitest run tests/unit/variety.test.ts tests/unit/recipes.test.ts
```

The classifier uses cached versioned language snapshots and writes its detailed ingredient/shape audit to ignored `build/classification-audit.json`. The selection audit writes `build/recipe-variety-audit.json` and caches results under `build/cache/variety/`, keyed by the script, selector, matcher, catalogue, target data and esbuild version. An unchanged second run reads the cache.

The five focused variety tests cover minimum family breadth, preserved requested tiers, authentic full-grid finales, ordered fallback after pool exhaustion, family uniqueness for easy/expert/progressive 3/5/10-round matches, and 300 seeded rematches. Together with the recipe corpus suite, **15 tests pass**. Full application/browser release gates remain the coordinator's integration checks.
