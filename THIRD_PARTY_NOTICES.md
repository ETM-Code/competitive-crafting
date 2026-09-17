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

The twelve player portraits reuse pinned Minecraft entity textures through `scripts/sync-avatars.mjs`, including separate front-facing snout/nose patches and the spider/Enderman emissive eye layers. Herobrine is a fan-made homage using the vanilla Steve face with white eyes, not an official Minecraft mob or a canonical Herobrine asset.

## Interface sound

`scripts/sync-sounds.mjs` retrieves three native Minecraft 26.3 samples from Mojang's content-addressed asset service. It verifies each source's size and SHA-1 against the pinned entries below (asset-index SHA-1 `d8492bc61d32a4874c77daa03c0cba9201e9b83b`). Source paths are relative to `minecraft/sounds/`.

| Application use / output           | Minecraft event / source                          | Source SHA-1                               |
| ---------------------------------- | ------------------------------------------------- | ------------------------------------------ |
| Button click / `button-click.wav`  | `ui.button.click` / `random/click_stereo.ogg`     | `f0ca66561f832bf2f60b393837297c2692367cd5` |
| Grid placement / `item-pickup.wav` | `entity.item.pickup` / `random/pop.ogg`           | `d6ae1c04d0a7376a33d1df12e1b8057cfbab6bc2` |
| Collection / `experience-orb.wav`  | `entity.experience_orb.pickup` / `random/orb.ogg` | `8a04a60d5c28fc60df472a877ca57f37eabc78d7` |

FFmpeg converts each sample to stereo 44.1 kHz PCM WAV for browser compatibility. Conversion caches are keyed by source hash, FFmpeg version and conversion settings; source/conversion metadata remains under ignored asset/build directories. `src/lib/audio.ts` reuses decoded samples, with no oscillator or synthesized fallback. These samples retain their original Minecraft audio rights: source provenance and integrity verification do not grant a redistribution licence. No Spotify audio is downloaded.

## Typography

Monocraft: https://github.com/IdreesInc/Monocraft, licensed under the SIL Open Font License 1.1. The importer saves the upstream license alongside the downloaded font.

## Libraries

Pannellum 2.5.7 (MIT) renders the moving native Minecraft cubemap on the home screen: https://github.com/mpetroff/pannellum. See [panorama reuse measurements](docs/panorama-reuse.md).

React, React DOM, Vite, TypeScript, Zod, qrcode, jsQR, Playwright, Vitest and Prettier retain their respective upstream licenses. Installed package distributions include full license notices. Cloudflare Workers tooling is used under its upstream license. No code was copied from the inspected React crafting demo or canvas inventory renderer.

## Music

Music is played through Spotify's official embedded player, with Spotify attribution and controls intact. Music audio is not downloaded, cached, or rebroadcast by this application. Track selections come from the supplied playlist:

https://open.spotify.com/playlist/5T4KWhz9Q8r98skQBimtlH

Track availability and playback restrictions are controlled by Spotify. Playlist inclusion is not treated as permission to extract or rehost a recording.

[Minecraft's music guidance](https://www.minecraft.net/en-us/article/can-i-use-minecraft-music-) permits approved Minecraft-owned tracks in any non-commercial Minecraft content and commercial content meeting the [Usage Guidelines](https://www.minecraft.net/en-us/usage-guidelines); its examples are not limited to videos. It separately says licensed music needs rightsholder permission that Mojang cannot grant. This is not a blanket licence for the complete C418/Lena Raine catalogue. [C418's Minecraft Volume Alpha](https://c418.bandcamp.com/album/minecraft-volume-alpha) is marked all rights reserved; an album purchase alone does not establish app redistribution rights.

Authentic music remains on Spotify for this delivery. Any future app-hosted soundtrack needs a suitable licence and authorized audio source for each recording. See [music delivery decisions](docs/reuse.md#music-delivery); no replacement soundtrack has been imported.
