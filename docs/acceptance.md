# Release acceptance checklist

## Gameplay overhaul — 2026-09-17

These requirements supersede the launch release's Overclock and reconnect-grace design. The overhaul is deployed as `5a54440d-c0f1-4277-adf5-f75e2adf1d8e` on the existing custom domain; live verification is tracked below.

### Rules and room lifecycle

- [x] Default ten rounds, Classic 30 seconds, Blitz 15 seconds. Only creative inventory adds two seconds per occupied recipe slot. No Memory mode.
- [x] Remove Overclock, engagement lock and multiplier entirely. Migrate persisted room state without erasing earned scores.
- [x] Keep server-tracked grids and explicit output collection; filling a valid grid alone never scores.
- [x] Accept all vanilla offsets and horizontal mirrors, including seven source recipes with empty outer padding. Preserve internal gaps; do not accept arbitrary rotations. The independent worker corpus accepts 2,055 layouts across 827 shaped recipes.
- [x] Broaden meaningful tier families and rotate recent recipes: tier 1 has 67 families, tier 4 has 28, and finales have 17. The seeded 30,000-round audit has no target repeats from the preceding five matches; history remains bounded and room-local.
- [x] Irreversible per-round forfeit earns no points; all resolved players advance the round, spectators excluded.
- [x] A closed tab/current transport departure counts as leaving, host transfers, and returning players may rejoin a valid room with their retained identity.
- [x] An active multiplayer match reduced to one connected player ends without awarding a win and displays the requested “All alone? Try getting some friends, loser.” message. Zero survivors also ends without a winner. Practice is exempt. Finished matches do not resurrect on rejoin.
- [x] Disconnected identities release party capacity but remain resumable; 30-second join reservations prevent overbooking, and retained identities are bounded at 128 per room.
- [x] Room codes expire after 30 minutes of inactivity or six hours total; reconnects cannot revive expired rooms and pings do not extend life.

### Interface and feedback

- [x] Desktop held-mouse painting and right-drag erasing, including release/cancellation/deduplication; preserve native ingredient/output drag and keyboard controls.
- [x] Mobile active play has only compact target/timer/menu, crafting board and inventory. Outer brand/header/footer/jukebox are hidden without stopping music. Results restore sound controls.
- [x] Native search input remains visible and usable with selection/caret/paste/IME while the visual viewport follows keyboard position. Query/tab/scroll survive keyboard transitions. No document scrolling.
- [x] Canonical Minecraft creative tab membership and item order, from pinned vanilla runtime rather than regex guesses; unsupported component-only variants explicitly excluded. Cached native generation reproduces ten tabs and 1,617 plain items with all supported recipe inputs/outputs covered.
- [x] Twelve compact, selectable player faces, including Blaze, Villager, Skeleton and a clearly labelled Herobrine homage. All twelve decode/select, server entry preserves the choice, and five dialog viewport screenshots were inspected.
- [x] Tapping QR opens an enlarged, independently decodable dialog with correct focus, dismissal and viewport sizing.
- [x] Local native Minecraft button sound, cached decoding and mute respected; no duplicate placement/collection sounds.
- [x] Music attempts startup from ordinary trusted interaction, confirms actual playback rather than a play request, remains mounted when hidden, and offers honest fallback when the provider/browser blocks it. Explicit Pause and remembered mute are respected. All 32 dedicated browser audio checks pass across the four projects.
- [x] Nonblocking low-time red vignette, numeric timer and reduced-motion support.
- [x] Eight-second round summary reveals recipe plus authoritative score deltas/rank movement and all standings. Final podium handles ties/solo/alone/abandoned accurately.

### Verification gates

- [x] Format, TypeScript, ESLint and 46 shared/unit tests pass; production build succeeds.
- [x] Worker and native runtime suites: 61 deterministic tests and four native runtime tests pass, including schema-4 migration, padded recipe corpus, simultaneous collect/forfeit, tab departure, host transfer, capacity reservations and expiry.
- [x] Full Chromium/Firefox/WebKit/mobile browser matrix: **119 passed, 21 intentional skips, zero failures** in 6.5 minutes. Eighteen skips avoid repeating specialized Chromium lifecycle cases, two skip unsupported service-worker lifecycle checks, and one excludes mouse-only painting from touch emulation.
- [x] Final screenshot/recording refresh and inspection: home/lobby/QR/playing/search keyboard/round leaderboard/podium, phone/tablet/landscape/short desktop. Chromium desktop/mobile and WebKit mobile recordings are in ignored `ui-progress/`; capture reported zero console errors and no document overflow.
- [x] Commit and push to `development` with configured Git identity only; no generated assets, credentials or recordings tracked.
- [x] Deploy to the existing custom domain and repeat ordinary-DNS live multiplayer/PWA checks; both pass. The real-provider check passes Chromium but does not confirm WebKit automatic playback, as detailed below.

## Verification boundaries

The overhaul's full 140-case matrix passes all 119 applicable cases across four browser projects. Earlier failures exposed and corrected Safari menu restoration, avatar keyboard navigation and round-standings keyboard access. The audio test now waits for asynchronous provider messages, and keyboard-scrolling checks wait for native movement rather than coalescing rapid key presses. Avatar geometry tests use reduced motion to isolate them from the separately tested animated panorama. Local simulated HTTP clients have independent rate-limit buckets; production limits are unchanged. These results supersede the launch release's smaller suite.

The local production-build and deployed HTTPS multiplayer smokes passed with ordinary clients and no test headers. Deployed PWA first-visit control and offline invitation recovery pass. The first immediate post-deploy multiplayer run timed out at lobby readiness; the diagnostic rerun passed without application changes, and that first failure's underlying cause was not established.

Real Spotify automatic playback was provider-confirmed in Chromium both locally and on deployed HTTPS, including hidden-player retention and mute. WebKit did not confirm playback within 20 seconds on either origin; its fallback appeared with no console/page errors. The live real-provider command therefore exits nonzero: **WebKit automatic playback remains unverified**, and Safari users may need to open the jukebox and tap the provider player. This result is not recorded as a playback pass. Full authenticated music playback was not tested.

Unexpected network loss can only be handled when the server observes transport failure; mobile operating systems may suspend or kill a tab without delivering `pagehide`. Provider preview/authentication/autoplay restrictions remain outside the game's control. Browser emulation and WebKit tests do not establish behavior on every physical phone or keyboard.
