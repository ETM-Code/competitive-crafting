# Competitive Crafting

An independent Minecraft recipe-racing game. Create a room, share a link/code/QR, and race friends to arrange the correct ingredients and collect the output.

**Play:** [competitive-crafting.eoghancollins.com](https://competitive-crafting.eoghancollins.com)

The launch release is live on Cloudflare Workers. The gameplay overhaul below is being verified locally before deployment; see the [acceptance status](docs/acceptance.md) for release evidence. Full authenticated Spotify playback remains provider-dependent.

## Current game design

- Ten-round Classic matches, 30-second base timer.
- Constrained ingredient palette or searchable creative inventory.
- Blitz uses a 15-second base timer. Creative inventory adds two seconds per required grid placement.
- Irreversible round forfeit for unfamiliar recipes; once everyone is finished or forfeits, reveal and advance. No Overclock.
- Classic first-finisher scoring and an all-finish option.
- Hundreds of classified recipe targets with family-balanced selection, recent-history avoidance and a full-grid finale.
- Native 256×256 item renders, twelve player faces including a custom Herobrine homage, and a moving Minecraft title panorama.
- Desktop mouse-held grid painting, right-drag erasing, native item dragging and keyboard crafting.
- Immersive mobile table/inventory with native keyboard-aware search; canonical creative tabs and ordering.
- Animated per-round standings, score deltas, final podium and low-time edge warning.
- Expandable QR invitations; tab departures transfer ownership and end multiplayer matches that become solitary. Codes expire after 30 idle minutes or six hours total.
- Native Minecraft button sounds and a 22-track curated jukebox that attempts playback on normal user interaction, with a no-repeat Next shuffle and provider-controlled playback limits.

See [acceptance criteria](docs/acceptance.md) for the current requirements and verification status.

## Develop

```sh
npm ci
npm run sync:data
npm run sync:playlist
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
npm run test:runtime
npm run test:e2e
npm run test:load -- --local
node scripts/capture-progress.mjs
```

Current UI screenshots are in ignored `ui-progress/latest-*.png`; timestamped directories preserve earlier states. The screenshot script records browser console errors alongside them. Development-only animation fixtures live at `/__lab`. See [testing and debugging](docs/testing.md) for the browser matrix, production/offline verification, and bounded local multiplayer smoke test.

## Deploy

The target is `competitive-crafting.eoghancollins.com`, served by Cloudflare Workers with one Durable Object per multiplayer room.

```sh
wrangler login
npm run deploy
```

Authenticate to the account that manages the domain; inspect existing routes before deploying. Never commit tokens, `.dev.vars`, or local credentials. See [deployment and recovery](docs/deployment.md) for release gates, live checks and rollback boundaries.

## Rights and attribution

NOT AN OFFICIAL MINECRAFT PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT.

See [third-party notices](THIRD_PARTY_NOTICES.md) and [reuse decisions](docs/reuse.md). Minecraft artwork and music retain their original ownership. Git authorship of this project does not imply ownership of third-party materials.
