# Third-party notices

Competitive Crafting is an independent Minecraft fan game.

**NOT AN OFFICIAL MINECRAFT PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT.**

## Game data and artwork

Minecraft names, recipes, textures and item artwork belong to their respective rights holders, including Mojang and Microsoft. They are not covered by a permissive code license merely because an open-source project indexes them.

- Versioned canonical data and language files: https://github.com/misode/mcmeta
- Native 256×256 item renders: https://github.com/Owen1212055/mc-assets
- Source revisions and import exclusions: `scripts/sources.lock.json` and `src/data/source-manifest.json`.
- Usage guidelines: https://www.minecraft.net/en-us/usage-guidelines

Downloaded binary game assets live in ignored `public/assets/`. The repository includes the reproducible importer, not a claim to ownership of those assets. Review applicable usage terms before redistributing or commercializing a derivative deployment.

## Typography

Monocraft: https://github.com/IdreesInc/Monocraft, licensed under the SIL Open Font License 1.1. The importer saves the upstream license alongside the downloaded font.

## Libraries

Pannellum 2.5.7 (MIT) renders the moving native Minecraft cubemap on the home screen: https://github.com/mpetroff/pannellum. See [panorama reuse measurements](docs/panorama-reuse.md).

React, React DOM, Vite, TypeScript, Zod, qrcode, jsQR, Playwright, Vitest and Prettier retain their respective upstream licenses. Installed package distributions include full license notices. Cloudflare Workers tooling is used under its upstream license. No code was copied from the inspected React crafting demo or canvas inventory renderer.

## Music

Music is played through Spotify's official embedded player, with Spotify attribution and controls intact. Audio is not downloaded, cached, or rebroadcast by this application. Track selections come from the supplied Minecraft Creator-Safe playlist:

https://open.spotify.com/playlist/5T4KWhz9Q8r98skQBimtlH

Track availability and playback restrictions are controlled by Spotify. Minecraft's music guidance: https://www.minecraft.net/en-us/article/can-i-use-minecraft-music-
