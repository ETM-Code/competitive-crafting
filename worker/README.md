# Multiplayer server integration

`index.ts` exports the default Worker and named `GameRoom`. The `ROOMS` Durable Object namespace uses the SQLite migration in Wrangler configuration. The same class backs short-lived hashed-IP rate-limit objects. Static assets use the `ASSETS` binding.

## Authority and persistence

All room entry points share a mutation queue. Scores and next alarms commit transactionally before state broadcasts. Targets, credentials, the common round deadline, forfeits, standings and private grids survive hibernation. Socket attachments identify the current connection without containing credentials. Alarms catch up using persisted deadlines rather than extending expired rounds. Replaced connections cannot submit or disconnect their successors. Restart repair reconciles missing transports before counting survivors.

Snapshots redact other players' grids, credentials and future targets. A valid grid must be tracked by the server before explicit collection; merely filling it never scores. Forfeit is irreversible for the current round, clears its private grid, awards zero points and rejects subsequent grid/collection commands. Repeating a current-round forfeit is idempotent. Once all multiplayer participants have collected, forfeited, expired or disconnected, the crafting phase ends immediately; spectators never block completion. Practice disconnects preserve the current round and grid until its ordinary deadline. Winner scoring ends on the first successful collection; all-finish scoring uses the existing placement fractions without multipliers.

Round standings retain each participant's name/avatar, before/after scores, points, before/after ranks and outcome. Equal score/wins/winning-time totals share a rank. The completed round and its history entry retain independent immutable snapshots, including points earned by someone who explicitly leaves. Round reasons are `crafted`, `forfeit` or `timeout`; room-level `endReason: 'alone' | 'abandoned'` is separate and never invents points or a win.

### Stored-room migration

Schema 4 adds bounded admission reservations without replaying the earlier gameplay migration on schema-3 rooms. Existing forfeits, expiry and scores remain untouched; incomplete finished matches without survivors are marked abandoned. The earlier migration preserves earned scores (including earlier accelerated awards), selected targets, current round, private grids and the original `round.endsAt`. It removes legacy engagement/acceleration fields and resets active accelerated expiry to the common clock; forfeit defaults to false. Migration does not restart the match or recompute old awards. Current-round before-state is reconstructed from recorded finishers when necessary. Earlier history without enough information receives empty standings rather than fabricated past ranks. Old `engage`/`overclock` commands produce a normal validation error, not a protocol disconnect.

## Operational behavior

- Defaults: ten rounds, 30-second base timer; Blitz uses 15 seconds. Creative inventory adds two seconds per occupied solution cell. Constrained inventory uses the base timer unchanged.
- Twelve occupied multiplayer slots or one practice slot; late joins spectate until rematch. Successful HTTP entries reserve a slot for 30 seconds until socket attachment. Disconnected identities free capacity but remain resumable; returning identities must also pass the capacity check, while replacement sockets do not consume a second slot. At most 128 identities are retained per room to bound storage. Expired reservations disappear from lobby snapshots; departed current-match participants remain in standings.
- Host transfers immediately on an observed current-transport disconnect/leave. An active multiplayer match with one connected eligible participant ends with `endReason: 'alone'`; zero survivors end it as `abandoned`, without a victory podium on rejoin. Lobby and practice are exempt. Replaced old sockets and pending HTTP joins that never attached do not count as departures.
- Tab closure and unexpected transport failure have the same departure semantics. Detection is immediate when the server observes close/error, but network loss or suspended browsers can delay transport detection. There is no extra server-side reconnect grace period.
- Disconnected identity/token tombstones persist until room expiry, so reopening can rejoin the same identity and scores. Returning never resurrects a finished match. Explicit `leave` revokes membership/token instead. The browser uses pagehide WebSocket close; no beacon endpoint is required.
- Three-second countdown, then crafting, then eight-second reveal/intermission. There is no Memory mode or preview phase. Countdown snapshots contain no target.
- Rooms expire after 30 minutes without meaningful activity or six hours total, checked on fetch, socket events and alarms. Ping traffic does not extend room lifetime. An expired join/reconnect cannot resurrect the room.
- HTTP create/join/upgrade: 30 requests per IP per minute. Socket messages: 60 per connection per ten seconds. Bodies/messages: 8 KiB. The newest authenticated connection replaces the previous tab.
- Browser origins must match the request origin. Local reverse proxies must preserve the browser-facing Host/Origin. No CORS wildcard is enabled.
- Close codes: `4001` replaced/removed session, `4004` expired room, `1008` rate limit, `1009` oversized/binary message, `1000` normal departure. The client does not automatically retry these terminal closes; explicit retry may reclaim a replaced session. Transient transport failures retain exponential reconnect, but cannot undo a match already ended by departure.
- Settings messages contain complete validated settings; preset controls use shared `PRESETS` before sending custom settings.

## Recipe normalization

Shaped matching ignores empty outer pattern borders while preserving internal blank cells. It accepts every fitting translation and horizontal mirror, never arbitrary rotations or transposes. A cached defensive normalization supports older padded catalogue data as well as the trimmed generated source. The independent server oracle trims bounds separately and checks all 2,055 distinct valid offset/mirror grids across 827 shaped recipes, including the previously omitted mace, spyglass, creaking-heart and waxed-chiseled-copper placements.

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

The deterministic suite covers delayed storage races, failed-commit rollback, forfeit/collection ordering, frozen standings, hibernation reconstruction, restart repair, same-identity reconnect without resurrection, session replacement, malformed/legacy input, rate limits, room cleanup and full matches against the generated catalogue.

The native Miniflare suite requires localhost listener permission and the direct Miniflare/esbuild dev dependencies. It exercises real WebSocket upgrades, SQLite Durable Object storage, alarm-driven countdown, competing collections, all-finish placement scoring, private-grid/forfeit resync, immediate departure termination, routing and security headers. Only catalogue/recipe/rule data is replaced with deterministic fixtures; protocol validation and runtime behavior remain real. Browser acceptance in `tests/e2e/game.spec.ts` uses real recipes and the local Worker, not fixture data.
