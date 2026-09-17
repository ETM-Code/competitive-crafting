# Release acceptance checklist

## Current rules — supersede initial five-round design

- [ ] No Memory preset, preview phase, or related help/UI remains.
- [ ] New rooms default to ten rounds and a 30-second base timer.
- [ ] Blitz defaults to a 15-second base timer.
- [ ] Only creative/unconstrained inventory adds time: two seconds per occupied slot in the supplied target recipe. Constrained time is not difficulty-scaled.
- [ ] Overclock is offered before the first gameplay interaction. It halves the original duration from the round start and multiplies earned points by 1.5.
- [ ] The choice is irreversible, deadline and eligibility are server-authoritative, reconnects preserve it, and expiry means zero points for that round without ending other players' time.
- [ ] Search/category/item/grid gameplay interactions lock out Overclock. Sound/help controls do not count as crafting interactions.
- [ ] No waiting exploit: activating later never grants half of a fresh clock.
- [ ] A full valid grid alone awards nothing; output collection is explicit.
- [ ] Large classified recipe pool, family-balanced selection, no near-identical recipes in one match where alternatives exist; recent full-grid finale.
- [ ] Crafting table, torch, stick, chest, furnace, bucket and iron pickaxe are tier 1; ladder and bow are tier 2.

## Presentation and delivery

- [ ] Native 256×256 transparent Minecraft inventory artwork; no low-resolution demo assets.
- [ ] Host can copy an invite link and code; QR decodes to the correct join URL.
- [ ] Desktop drag/click, mobile tap/place, keyboard access all work.
- [ ] Spotify official player, honest availability states, sound-off pauses music and mutes effects.
- [ ] Prettier source formatting and generated data formatting.
- [ ] Refreshed screenshots/recordings in ignored `ui-progress/`, with dated history and latest files.
- [ ] Frequent Git milestones; public GitHub repository with configured user as sole Git author/committer and no AI attribution.
- [ ] Local real-runtime multiplayer, desktop/mobile Playwright, reduced motion, errors and asset checks pass.
- [ ] Cloudflare custom-domain deployment verified, or specific authentication/domain blocker reported honestly.
