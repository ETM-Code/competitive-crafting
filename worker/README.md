# Multiplayer server integration

`index.ts` exports the default Worker and named `GameRoom`. The `ROOMS` Durable Object namespace uses the SQLite migration in Wrangler configuration. The same class backs short-lived hashed-IP rate-limit objects. Static assets use the `ASSETS` binding.

## Authority and persistence

All room entry points share a mutation queue. Scores and next alarms commit transactionally before state broadcasts. State, targets, credentials, personal deadlines, engagement, Overclock and private grids survive hibernation. Socket attachments identify the current connection without containing credentials. Alarms catch up using persisted deadlines rather than extending expired rounds. Replaced connections cannot submit or disconnect their successors. Missing transports after a restart become disconnected members with a fresh grace period.

Snapshots redact other players' grids, credentials and future targets. A valid grid must be tracked by the server before explicit collection; merely filling it never scores. Overclock halves the original round duration and multiplies earned points by 1.5. Activation is irreversible, is rejected after engagement or the half-time cutoff, and never restarts the clock. Personal expiry does not end a peer's remaining time. All-finish points apply placement, then the multiplier, with one rounding operation.

## Operational behavior

- Defaults: ten rounds, 30-second base timer; Blitz uses 15 seconds. Creative inventory adds two seconds per occupied solution cell. Constrained inventory uses the base timer unchanged.
- Twelve multiplayer members or one practice member; late joins spectate until rematch.
- Host transfers immediately to a connected member on disconnect/leave. Reconnection preserves identity, scores and in-round state during a 60-second grace period; expired disconnected members are removed.
- Three-second countdown, then crafting, then five-second reveal/intermission. There is no Memory mode or preview phase. Countdown snapshots contain no target.
- Rooms expire after 30 minutes without meaningful activity or six hours total. Ping traffic does not extend room lifetime.
- HTTP create/join/upgrade: 30 requests per IP per minute. Socket messages: 60 per connection per ten seconds. Bodies/messages: 8 KiB. The newest authenticated connection replaces the previous tab.
- Browser origins must match the request origin. Local reverse proxies must preserve the browser-facing Host/Origin. No CORS wildcard is enabled.
- Close codes: `4001` replaced/removed session, `4004` expired room, `1008` rate limit, `1009` oversized/binary message, `1000` normal departure. The client does not automatically retry these terminal closes; explicit retry may reclaim a replaced session. Transient transport failures retain exponential reconnect.
- Settings messages contain complete validated settings; preset controls use shared `PRESETS` before sending custom settings.

## Security and deployment checks

Wrangler sets `observability.redact_query_string: true`. Application code never logs tokens; review external access-log sinks for equivalent redaction because WebSocket credentials occur in the upgrade URL. See [Cloudflare Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/).

The Worker applies response security headers and allows same-origin manifest, service-worker and font resources. Asset-first routing can bypass the Worker, so verify the built static responses carry the intended security headers too. Run production/PWA checks against Wrangler's asset server rather than Vite alone.

## Verification

```sh
npm run test:worker
npm run test:runtime
npx tsc --noEmit -p tests/worker/tsconfig.json
npx eslint worker tests/worker
npx prettier --check worker tests/worker
```

The deterministic suite covers delayed storage races, failed-commit rollback, hibernation reconstruction, restart repair, reconnect expiry, session replacement, malformed input, rate limits, room cleanup and full matches against the generated catalogue.

The native Miniflare suite requires localhost listener permission and the direct Miniflare/esbuild dev dependencies. It exercises real WebSocket upgrades, SQLite Durable Object storage, alarm-driven countdown and personal expiry, competing collections, all-finish Overclock scoring, private-grid resync, routing and security headers. Only catalogue/recipe/rule data is replaced with deterministic fixtures; protocol validation and runtime behavior remain real.

On 2026-09-17, all 55 deterministic tests and all four native runtime tests passed locally. The shaped-recipe server corpus accepts all 2,031 distinct valid offset/mirror grids across 827 shaped recipes, with no score before explicit collection. Browser acceptance in `tests/e2e/game.spec.ts` uses real recipes and the local Worker, not fixture data.
