# Release acceptance checklist

## Current rules — supersede initial five-round design

- [x] No Memory preset, preview phase, or related help/UI remains.
- [x] New rooms default to ten rounds and a 30-second base timer.
- [x] Blitz defaults to a 15-second base timer.
- [x] Only creative/unconstrained inventory adds time: two seconds per occupied slot in the supplied target recipe. Constrained time is not difficulty-scaled.
- [x] Overclock is offered before the first gameplay interaction. It halves the original duration from the round start and multiplies earned points by 1.5.
- [x] The choice is irreversible, deadline and eligibility are server-authoritative, reconnects preserve it, and expiry means zero points for that round without ending other players' time.
- [x] Search/category/item/grid gameplay interactions lock out Overclock. Sound/help controls do not count as crafting interactions.
- [x] No waiting exploit: activating later never grants half of a fresh clock.
- [x] A full valid grid alone awards nothing; output collection is explicit.
- [x] Large classified recipe pool, family-balanced selection, no near-identical recipes in one match where alternatives exist; recent full-grid finale.
- [x] Crafting table, torch, stick, chest, furnace, bucket and iron pickaxe are tier 1; ladder and bow are tier 2.
- [x] Valid recipe offsets, horizontal mirrors, mixed ingredient tags and shapeless arrangements are supported. Server corpus accepts all 2,031 distinct transforms across 827 shaped recipes.

## Presentation and delivery

- [x] Native 256×256 transparent Minecraft inventory artwork; no low-resolution demo assets.
- [x] Recognizable mob faces, including pig snout and front-facing dragon.
- [x] Rotating native cubemap panorama; reduced-motion fallback and hidden-tab pause.
- [x] Host can copy an invite link and code; QR independently decodes to the correct join URL.
- [x] Desktop drag/click, mobile tap/place and keyboard collection have passed real-browser tests.
- [x] Spotify official player loads under production CSP; unavailable/retry states and sound-off pause are tested. Full authenticated playback remains provider-dependent and was not tested.
- [x] Main document scrolling disabled. Essential controls and menu entry points fit tested phone/tablet/desktop/landscape viewports; designated panels scroll internally.
- [x] Compact Overclock and mobile/tablet menu; desktop does not show compact-only controls.
- [x] Creative inventory excludes distractor controls; custom settings do not falsely highlight an unchanged preset; home overlays are mutually exclusive.
- [x] Add-to-home-screen guidance, install-event handling, production service-worker offline fallback and invite-preserving retry verified.
- [x] Refreshed screenshots/recordings in ignored `ui-progress/`, with dated history and latest files.
- [x] Public GitHub repository and incremental milestones using configured Git identity without AI attribution.
- [x] Core gameplay matrix after reconnect fixes: 11 passed, nine intentional duplicate-engine skips. Visual regression reruns passed after focus and inventory-scroller corrections.
- [x] Short-desktop controls remain inside panel padding at 1280×650, 1280×720 and 1366×768 in Chromium/WebKit. Jukebox has 22 verified favourites, random initial selection, visible title and a no-repeat Next shuffle; 12 browser and three shuffle unit tests pass.
- [x] Final full formatting/typecheck/build and implementation milestone commit (`d909cf8`, pushed to `development`).
- [x] Cloudflare custom-domain deployment verified, including normal-DNS HTTPS multiplayer and offline recovery without resolver overrides.

## Verification boundaries

As of 2026-09-17, the final integrated run passes formatting, TypeScript, ESLint, shared/shuffle tests (12), Worker tests (55), native runtime tests (4), production build and the full Playwright suite: **65 passed, 11 intentionally skipped**, with no failures. Nine skips avoid duplicating specialized Chromium gameplay cases across engines, and two skip the service-worker lifecycle on engines where that check is not supported here. Chromium desktop/mobile, WebKit and Firefox all pass their supported cases. Earlier focus-restoration and development WebSocket cleanup failures were corrected and pass in this final run. The bounded local concurrency smoke also passed. Screenshots and verification commands are recorded in [testing documentation](testing.md).

The requested custom domain is deployed. Real HTTPS two-player smoke passes: invitation/mobile join, valid grid with zero premature points, explicit collection, broadcast and score persistence after reload. Live service-worker offline invitation recovery and official Spotify track switching pass. Public Cloudflare and Google DNS resolve the hostname; initial live checks used their verified A answer with normal certificate validation because the development machine retained a negative DNS cache. No system resolver or certificate settings were changed. The default resolver subsequently recovered, and the live two-player smoke plus deployed PWA offline recovery both passed again through normal DNS without overrides.

Visual inspection of the live reveal screenshot caught clipped target copy at short desktop height after the full suite passed. A reveal-only sizing correction and child-text containment regression now pass the entire **28-case visual matrix** across Chromium desktop/mobile, WebKit and Firefox, plus formatting/typecheck/lint/shared tests and the production build. Browser emulation and WebKit checks are not equivalent to hands-on testing of every real iOS/Android device, browser toolbar or installation flow.
