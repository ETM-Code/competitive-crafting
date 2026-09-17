# Testing and debugging

## Local setup

Use Node 26 for the bounded load script's native WebSocket Origin headers. Run `npm ci`, `npm run sync:data`, `npm run build`. Start `npm run dev:worker` and `npm run dev` in separate terminals. Playwright starts these automatically when absent. Install engines with `npx playwright install chromium firefox webkit`.

Normal builds and logic tests do not fetch Minecraft data. `sync:data` restores pinned assets, canonical creative tabs, classification, avatars, app icons, panorama and button audio; immutable downloads are cached under `build/cache`. Creative regeneration uses Java 25 (an isolated verified JDK is supplied on macOS ARM64; other platforms use `JAVA_HOME`). Sound regeneration uses FFmpeg for Safari-compatible PCM WAV samples (button click, item pickup and experience orb), cached by source hash and tool version. See [canonical creative sources](creative-inventory-sources.md) for reproducibility and exclusions.

## Test tiers

| Command                        | What it checks                                                  |
| ------------------------------ | --------------------------------------------------------------- |
| `npm run check`                | TypeScript, ESLint and fast shared-rule tests                   |
| `npm run test:worker`          | Deterministic room/state/storage adapters and recipe acceptance |
| `npm run test:runtime`         | Native Miniflare WebSockets, SQLite persistence and alarms      |
| `npm run test:e2e`             | Browser acceptance, UI, animation, installation and audio tests |
| `npm run test:visual`          | Viewport geometry, controls, art and error checks               |
| `npm run test:animations`      | Fixture/reduced-motion rendering                                |
| `npm run test:load -- --local` | Bounded loopback-only room/WebSocket concurrency smoke          |
| `npm run format:check`         | Readable consistent source/data formatting                      |
| `npm run build`                | Production typecheck and Vite bundle                            |

The matcher suite covers every supported recipe, fitting offsets, horizontal mirrors, randomized tag choices, missing/extra ingredients and overlapping shapeless tags. Named shovel/axe and padded mace/spyglass/creaking-heart/copper regressions preserve Minecraft flexibility. The worker corpus test currently checks 2,055 distinct offset/mirror layouts across all 827 shaped recipes and sends each through tracked-grid and explicit collection commands. Its independent oracle trims empty outer borders; the launch test's 2,031 layouts missed some valid offsets because its oracle retained the same padding as the importer.

Browser projects cover Chromium desktop, Chromium touch emulation, WebKit and Firefox. The iPhone 13 device profile has a 390×844 physical CSS screen but a 390×664 browser viewport with browser chrome; both the smaller browser viewport and larger standalone-like dimensions are tested. Emulation does not replace final hands-on iPhone/Android testing of browser toolbars, virtual keyboards, audio permissions or installation.

## Screenshots and fixtures

`npm run capture` updates actual CSS-viewport-sized screenshots under ignored `ui-progress/`, plus separately named full-page captures and timestamped archives. `latest.json` records dimensions and console/page errors. Do not substitute a scaled tall full-page image for a phone viewport screenshot.

`npm run capture:video` records short desktop and mobile progress clips with Playwright. Use `-- --browser=webkit --device=mobile --seconds=8` for a WebKit phone capture. Videos stay under ignored `ui-progress/`.

Open `/__lab` in development. Expand the lab toolbar to select lobby/countdown/playing/reveal/results fixtures, replay animations, pause, slow effects or inspect timeout/disconnection states. Fixtures are not gameplay authority tests and are excluded from the production bundle.

When running separate browser suites concurrently, always give each a distinct output directory and list reporter to avoid trace/video cleanup races:

```sh
npx playwright test tests/e2e/game.spec.ts --project=chromium --output=test-results/game --reporter=list
npx playwright test tests/e2e/visual.spec.ts --project=webkit --output=test-results/visual --reporter=list
```

Prefer sequential full suites on an eight-core development machine. Concurrent browser/rendering jobs can consume real round deadlines and stall browser drivers; do not weaken the server clock to hide that. Non-audio gameplay suites set the remembered sound preference off, isolating game acceptance from external Spotify availability. Avatar geometry/focus tests use reduced motion rather than simultaneously exercising the separately tested panorama. Dedicated audio tests separately cover automatic startup, all three native samples decoding once per interaction, mute/pause, shuffle and blocked-provider fallback. Interruption tests inject provider state to check one bounded resume after a recent effect, no repeated commands while buffering, no resume loop, and respect for visible provider pauses and reported completion; these deterministic cases do not reproduce a physical phone's audio-session interruption.

The celebration fixture is served directly by Vite from `tests/e2e/fixtures/celebration.html`, not synthesized by request interception. This preserves Chromium's loopback address-space classification for HMR; it adds no browser security bypass and is excluded from production assets. Host-skip tests cover phone, landscape and desktop placement plus guest/disconnected-host visibility. Server tests cover authorization, round-bound replay rejection, final results, host transfer and persistence/alarm races.

The shared browser fixture gives each simulated context its own RFC3849 client address for loopback-only HTTP `POST /api/*` requests. This avoids unrelated sequential tests exhausting one local 30-request/minute bucket. Native WebSocket traffic is not rewritten; production/external URLs and live verification scripts receive no synthetic headers. The limiter itself is unchanged and has a separate persisted-window/alarm regression.

## Production and offline checks

Vite development does not register the production service worker. Build first and test against Wrangler's asset server at `http://127.0.0.1:8787`. Inspect actual asset response headers: asset-first routing bypasses Worker middleware, so `public/_headers` supplies the static page CSP and security headers.

The Spotify SDK requires string evaluation. Only the dedicated same-origin `/spotify-player` wrapper has a scoped `unsafe-eval` CSP exception; the main app does not. The wrapper checks parent origin and message source and accepts fixed commands. This is a scoped provider policy, not a cross-origin security sandbox.

The jukebox chooses from 22 tracks verified in the approved playlist: 12 nostalgic classics, six standard discs and four upbeat remixes. Shuffle tests cover every track once per bag, no immediate cycle-boundary repeat, and manual selection. Browser tests cover initial random selection, Next, title changes and mute enforcement. Spotify exposes no documented continuous shuffled queue or reliable completion event here: use Next when a track ends. Full authenticated playback remains provider-dependent and was not tested.

The service worker caches only the honest offline page, not API responses or an offline game. Multiplayer and practice require a connection. Offline retry preserves an invitation path. No `skipWaiting` interrupts an active match.

## Local concurrency guardrails

The load command requires `--local`, rejects non-loopback origins, bounds rooms and players, expires after 20 seconds and closes/leaves connections. It is not a production load generator. Use ordinary isolated browser sessions for live deployment smoke tests.

`npm run test:live` runs a bounded two-player ordinary gameplay smoke against the requested deployment. Pass `-- http://127.0.0.1:8787` to test the production build locally. It creates one room, verifies an invite join on mobile, fills and explicitly collects one recipe, checks the shared score, verifies host-only intermission skipping and synchronized next-round countdown, then reloads the host. That departure now deliberately ends the two-player match with the alone message; rejoining preserves the score and finished state. It then closes both clients. It writes token-redacted diagnostics and screenshots to `ui-progress/`.

## Known external prerequisites

`npm run test:music -- https://competitive-crafting.eoghancollins.com` performs a bounded real-provider check sequentially in Chromium and WebKit: one practice room per engine, trusted gameplay interactions, advancing provider position before/after native placement and collection sounds, retained hidden iframe, explicit pause and mute. It saves screenshots and safe playback/effect observations, never socket URLs or media streams. The default command intentionally fails if automatic playback is not confirmed, even if a subsequent explicit provider tap succeeds; that result is not automatically an application defect. Add `--allow-manual` to test continuity after an explicit fallback without requiring automatic startup. This waives only the automatic-start gate and records `automaticPlayback` and `manualPlayback` separately; continuity, pause, mute and native-effect checks must still pass.

Cloudflare deployment needs a login for the account controlling the requested subdomain. Spotify full playback depends on provider availability, login and browser permission. Automated mock-control tests can verify pause/mute behavior but cannot establish an account's music entitlement.
