# Competitive Crafting

An independent Minecraft recipe-racing game. Create a room, share a link/code/QR, and race friends to arrange the correct ingredients and collect the output.

**In development:** the UI and multiplayer implementation are being integrated and tested. The public deployment is not yet live.

## Current game design

- Ten-round Classic matches, 30-second base timer.
- Constrained ingredient palette or searchable creative inventory.
- Blitz uses a 15-second base timer. Creative inventory adds two seconds per required grid placement.
- Optional Overclock before your first crafting interaction: half the original time, 1.5× earned points.
- Classic first-finisher scoring and an all-finish option.
- Hundreds of classified recipe targets with family-balanced selection and a recent, full-grid finale.
- Native 256×256 item renders, responsive tap/place controls, and Spotify jukebox.

See [acceptance criteria](docs/acceptance.md) for the current requirements and verification status.

## Develop

```sh
npm ci
npm run sync:data
npm run sync:playlist
node scripts/classify-recipes.mjs
npm run build
npm run dev:worker
# In another terminal:
npm run dev
```

Open http://localhost:5173. Vite proxies `/api` and WebSocket requests to the local Cloudflare runtime on port 8787.

Game artwork/font downloads are deliberately not committed; `sync:data` restores pinned sources. Generated recipe metadata is committed so rules tests can run without network access. Source downloads are cached under ignored `build/cache/`.

## Verify and inspect

```sh
npm run format
npm run check
npm run test:worker
npm run test:e2e
node scripts/capture-progress.mjs
```

Current UI screenshots are in ignored `ui-progress/latest-*.png`; timestamped directories preserve earlier states. The screenshot script records browser console errors alongside them. Development-only animation fixtures live at `/__lab`.

## Deploy

The target is `competitive-crafting.eoghancollins.com`, served by Cloudflare Workers with one Durable Object per multiplayer room.

```sh
wrangler login
npm run deploy
```

Authenticate to the account that manages the domain; inspect existing routes before deploying. Never commit tokens, `.dev.vars`, or local credentials.

## Rights and attribution

NOT AN OFFICIAL MINECRAFT PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT.

See [third-party notices](THIRD_PARTY_NOTICES.md) and [reuse decisions](docs/reuse.md). Minecraft artwork and music retain their original ownership. Git authorship of this project does not imply ownership of third-party materials.
