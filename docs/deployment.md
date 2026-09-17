# Deployment and recovery

## Target

- Worker: `competitive-crafting`.
- Custom domain: `competitive-crafting.eoghancollins.com`.
- Room authority: SQLite-backed `GameRoom` Durable Objects, migration `v1`.
- Static files: the production `dist/` directory, built from the pinned source assets.

A fresh checkout needs `npm ci` and `npm run sync:data` before building; artwork is intentionally not committed. The checked-in playlist metadata is sufficient for an ordinary build. `npm run sync:playlist` explicitly refreshes the curated selections against the approved source.

## Before deploying

Authenticate with Wrangler to the account controlling the domain. Inspect existing Worker routes, custom domains and DNS before using a new hostname. Do not force an existing unrelated record to be replaced. Never commit credentials, local runtime state or `.dev.vars`.

The 2026-09-17 read-only preflight verified an active zone, no existing `competitive-crafting` Worker, no matching Worker custom domain, no zone Worker routes and public NXDOMAIN for the target. DNS-record API inspection returned 403; no extra scope was requested. This historical preflight is not a substitute for checking current resources on a future deployment.

Run the release gates from the repository root:

```sh
npm run format:check
npm run check
npm run test:worker
npm run test:runtime
npm run build
npm run test:e2e
```

Run browser suites sequentially on constrained development machines; parallel rendering can consume real round deadlines. Do not weaken gameplay timers to hide test-machine contention.

## Deploy and verify

```sh
npm run deploy
npm run test:live
npm run test:pwa -- https://competitive-crafting.eoghancollins.com
npm run test:music -- https://competitive-crafting.eoghancollins.com
npx wrangler deployments list
```

Deployment uses the custom-domain route in `wrangler.jsonc`; no force flag is needed. Verify the HTTPS hostname after deployment, not merely the upload result. The live smoke creates one ordinary two-player room and verifies invitation, mobile joining, explicit collection and persisted scores; it is not a load test. Screenshots and redacted diagnostics remain under ignored `ui-progress/`.

Check both API and static-asset headers. Static assets are asset-first and receive policy through `public/_headers`. The main application must not allow `unsafe-eval`; that provider requirement is scoped to `/spotify-player`. Check a real Spotify embed separately from the mocked control tests. Login, preview length and full playback remain Spotify-controlled.

Do not log WebSocket URLs: they contain resume tokens. Worker observability redacts query strings, and browser smoke diagnostics redact the token field. Any additional log sink needs equivalent handling.

## Release verification — 2026-09-17

Initial deployed version: `3b62a47e-01e1-46a3-8312-cd3147ec06a7`. Cloudflare confirmed the enabled custom domain, assigned certificate and 100% production traffic to that version. The reveal-only layout correction is deployed as `374ddeb3-08c1-4249-af32-5da5f3460cc6`, after the 28-case visual matrix passed. Both ordinary deployments succeeded without force or changes to unrelated routes.

Live HTTPS gameplay, mobile invitation joining, explicit collection, score persistence after reload, offline invitation recovery and official Spotify track switching passed. Initial DNS propagation left the development machine's resolver returning NXDOMAIN even after independent Cloudflare and Google public resolvers returned the new A records. Those first browser checks used the independently verified public answer through a per-process resolver mapping, preserving the real hostname, origin, WebSockets and normal TLS certificate validation; no system resolver settings were changed. This distinguishes deployed application verification from completion of all DNS caches' propagation. A direct query to the default recursive resolver confirmed an upstream negative answer with an older SOA serial and approximately six minutes of TTL remaining at diagnosis; clearing browser/OS caches alone would not remove that upstream answer. Public resolvers returned the new records with DNSSEC checking enabled and no validation failure.

The default recursive resolver subsequently returned the correct A records, system lookup succeeded and ordinary HTTPS returned 200. Both `npm run test:live` and the deployed PWA test then passed **without any DNS override**, including two-player scoring/reload and offline invitation recovery. This closes the observed resolver blocker; the originally estimated six-minute expiry did not by itself predict when that resolver recovered.

## Gameplay overhaul release — 2026-09-17

Deployed version: `5a54440d-c0f1-4277-adf5-f75e2adf1d8e`, from the verified gameplay overhaul on `development`. The normal deployment updated the existing Worker/custom-domain route without force or unrelated DNS changes. Application code and assets are the same as the production build used for acceptance.

Pre-deployment gates passed: formatting, TypeScript, ESLint, 46 unit/shared tests, 61 Worker tests, four native runtime tests, 119 browser tests with 21 intentional skips, production build and bounded local concurrency smoke. The independent matcher oracle covers 2,055 valid translated/mirrored layouts, and the cached recipe-variety audit covers 30,000 rounds. Desktop/mobile screenshots and Chromium/WebKit recordings were refreshed and inspected; generated media remains untracked.

Ordinary-DNS live HTTPS multiplayer passed: desktop host/mobile invitation join, tracked recipe grid without premature points, explicit collection, shared score, tab-departure ending and preserved score on rejoin. The first immediate post-deploy smoke timed out waiting on lobby readiness; a second run with token-free state diagnostics passed without application changes. The initial failure had no console errors, and its underlying cause was not established. Live PWA first-visit control and offline invitation recovery also passed. Main and provider-wrapper CSP headers were checked on the deployed origin; the main app still excludes `unsafe-eval`.

Provider playback outcomes and remaining physical-device boundaries are recorded in [acceptance](acceptance.md); no full authenticated Spotify entitlement is claimed.

## Intermission and audio release — 2026-09-17

Deployed version: `c7320a11-da86-4ffc-b198-019198895f8d`, source milestone `6ebfc8d` on `development`. Normal deployment updated only the existing Worker/custom-domain route; no force or DNS changes. Five-second reveals, round-bound host skip, three native effect samples and bounded Spotify interruption handling are live.

Release gates passed: TypeScript/ESLint/Prettier, 50 unit/shared tests, 68 Worker tests, four native runtime tests, production build and the full 160-case browser matrix (136 passed, 24 intentional skips). Phone/landscape/desktop screenshots were inspected. The local production multiplayer smoke and deployed ordinary-DNS multiplayer smoke both passed with host-only skip and synchronized countdown; live PWA recovery passed. Curl verified deployed CSP separation and exact native WAV hashes; Python's HTTP client returned 403 initially, without any policy change being made.

The live real-provider command with `--allow-manual` passed both engines: Chromium automatic startup and WebKit explicit-jukebox startup, progressing playback through native placement/collection, retained hidden iframe, explicit Pause and mute, zero console/page errors. WebKit automatic startup remains unverified and would fail the default stricter command. Full authenticated music playback and the originally reported physical-device interruption remain unverified. Detailed evidence and incomplete local probe boundaries are in [acceptance](acceptance.md#intermission-and-audio-follow-up--2026-09-17).

## Recovery

Inspect deployment history and choose an explicitly known-good version:

```sh
npx wrangler deployments list
npx wrangler rollback <known-good-version-id>
```

Rollback is an operational change and requires deliberate approval. It reverts compatible Worker code/assets, not room database contents or previously applied Durable Object migrations. Read Wrangler's compatibility checks rather than bypassing them. The first deployment has no previous known-good version to restore. For a data-model change, plan backward compatibility before deployment; do not assume rollback undoes stored state.
