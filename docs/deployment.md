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

## Recovery

Inspect deployment history and choose an explicitly known-good version:

```sh
npx wrangler deployments list
npx wrangler rollback <known-good-version-id>
```

Rollback is an operational change and requires deliberate approval. It reverts compatible Worker code/assets, not room database contents or previously applied Durable Object migrations. Read Wrangler's compatibility checks rather than bypassing them. The first deployment has no previous known-good version to restore. For a data-model change, plan backward compatibility before deployment; do not assume rollback undoes stored state.
