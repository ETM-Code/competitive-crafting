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
npx wrangler deployments list
```

Deployment uses the custom-domain route in `wrangler.jsonc`; no force flag is needed. Verify the HTTPS hostname after deployment, not merely the upload result. The live smoke creates one ordinary two-player room and verifies invitation, mobile joining, explicit collection and persisted scores; it is not a load test. Screenshots and redacted diagnostics remain under ignored `ui-progress/`.

Check both API and static-asset headers. Static assets are asset-first and receive policy through `public/_headers`. The main application must not allow `unsafe-eval`; that provider requirement is scoped to `/spotify-player`. Check a real Spotify embed separately from the mocked control tests. Login, preview length and full playback remain Spotify-controlled.

Do not log WebSocket URLs: they contain resume tokens. Worker observability redacts query strings, and browser smoke diagnostics redact the token field. Any additional log sink needs equivalent handling.

## Recovery

Inspect deployment history and choose an explicitly known-good version:

```sh
npx wrangler deployments list
npx wrangler rollback <known-good-version-id>
```

Rollback is an operational change and requires deliberate approval. It reverts compatible Worker code/assets, not room database contents or previously applied Durable Object migrations. Read Wrangler's compatibility checks rather than bypassing them. The first deployment has no previous known-good version to restore. For a data-model change, plan backward compatibility before deployment; do not assume rollback undoes stored state.
