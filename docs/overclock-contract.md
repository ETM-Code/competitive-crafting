# Rules update — authoritative contract

This supersedes memory/preview and old timer defaults in implementation-contract.md. User explicitly repeated these requirements. Read updated src/shared/types.ts, rules.ts and protocol.ts.

- Memory removed, Phase no preview. Preset classic/blitz/all-finish only.
- Defaults 10 rounds, classic base30 seconds, blitz base15 seconds. secondsFor(settings,tier,output) now accepts output so creative ONLY adds 2seconds per occupied grid cell, constrained unchanged.
- Wide generated pool (930 targets currently, review pending) includes family metadata. selectTargets(settings,random,excludedFamilies?) samples families before variants and prefers not repeating families. Final tier5 only on LAST round in progressive default. Rematches should pass recent match families to avoid immediate repeats, bound remembered list.

## Overclock

- Shared Round.playerStates: Record<playerId, {engaged:boolean,overclocked:boolean,deadline:number,expired:boolean,grid:Grid}>.
- At round start create states for active participants; deadline initial round.endsAt, grid empty.
- New messages engage{roundId}, grid{roundId,grid}, overclock{roundId}. Existing collect stays {roundId,grid} but server must ensure matches its privately persisted grid; cannot collect with arbitrary untracked grid.
- Client sends engage on FIRST gameplay interaction (inventory search/category/item select, grid action; not audio/help). Send grid on every placement/clear/removal before collect; websocket ordering ensures authoritative state tracks it. Optimistic UI avoids latency blocking; do not reset optimistic grid on own intermediate echoes. Overclock button locally disappears immediately after gameplay interaction.
- overclock valid only phase playing, active connected member, unengaged and not already overclocked/finished/expired. New deadline = startsAt + floor((endsAt-startsAt)/2), not now+duration/2. Reject if now>=new deadline. Commit irreversible choice; state visible to others as overclocked badge.
- Grid on wire snapshots must NOT expose other players' solutions. Tailor snapshots per player: own grid populated, other grids nine nulls. Persist actual private grids only. Keep public state sizes bounded.
- Expire each participant independently on DO alarms and message wake checks. Overclock expiry means zero points and spectator/wait state for remainder of round. Other players keep full time. If all eligible participants finish/expire, reveal early. Earliest personal deadline is next alarm; no immortal playing round when everyone is expired.
- Earned points = round(base difficulty)points * placement factor (all-finish if used) *1.5 if overclocked, rounded integer once. Winner order remains server accepted collect order. History winner points reflect bonus.
- Reconnect preserves engagement, grid, overclock and deadline. Rematch/new round resets them. No client timestamp trust.
- Classic advertised UI: redstone Overclock lever, exact before/after seconds and points, short inline text 'Half the time. 1.5× the points. Locks when you start crafting.' One deliberate click, no extra dialog while clock runs. Active redstone indicator and compact badge. Disable unavailable activation near cutoff. Respect reduced motion.

## Tests required

- First interaction locks out, late activation/cutoff, duplicate toggle, reconnect/persistence, each personal deadline, other player unaffected, 1.5 points, no pre-output award, stale grid/round, grid privacy, all-finish bonus, default counts/timers and creative scaling. Remove old memory tests.
- Host link/copy code/QR must remain functional. UI screenshot refresh requested in ignored ui-progress/.
- Format all owned source with Prettier. No commits by agents; owner commits with configured identity, no attribution.
