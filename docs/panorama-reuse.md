# Moving title panorama

## Decision

**Adopt Pannellum 2.5.7 (MIT)** for its tested cubemap projection, WebGL renderer, resize handling and lifecycle API. The pinned package's browser runtime is 56,407 bytes (17,973 gzip); its CSS is 9,677 bytes (2,603 gzip). The npm package is larger because it also contains source and examples; those do not ship. Vite loads the renderer as a separate dynamic chunk only on the home screen, and not when reduced motion is requested.

**Reject a CSS panning photograph**: it cannot rotate through a complete world or preserve cubemap perspective. **Reject a custom WebGL renderer**: projection / resize / context handling are not this game's core product, and the existing MIT implementation fits at approximately 20 KB compressed. No Three.js scene or fabricated Minecraft landscape is needed.

Sources:

- [Pannellum source and MIT licence](https://github.com/mpetroff/pannellum)
- [Configuration reference](https://pannellum.org/documentation/reference/)
- [Viewer lifecycle API](https://pannellum.org/documentation/api/)
- [Canonical pinned Minecraft assets](https://github.com/misode/mcmeta/tree/79962f2b091fb6213b425b277a8725d737f3def8/assets/minecraft/textures/gui/title/background)

## Authentic source, not a reconstruction

`scripts/sync-panorama.mjs` downloads all six **actual Minecraft 26.3 title panorama faces** (`panorama_0.png` through `panorama_5.png`) from the same pinned canonical asset snapshot as the rest of the game. Each native face is 1024×1024; all six total **4,109,896 bytes**. No upscaling, repainting or third-party generated landscape is involved. Minecraft artwork remains subject to Mojang / Microsoft rights; the game is unofficial.

The immutable source URL is SHA-256 hashed for the local `build/cache` key. Downloads are limited to three concurrent requests, three attempts and a 30-second timeout; repeated successful runs are local. PNG decoding and square/minimum dimensions are checked. Generated `public/assets/panorama-sources.json` records source URLs, dimensions, byte counts and content SHA-256s. Assets are ignored by Git and served from this application's own origin, with no runtime hotlink or CDN dependency.

## Motion and fallback

- Pannellum face order is front, right, back, left, up, down; the canonical numbered faces match it.
- Slow continuous yaw: **0.8 degrees per second**, starting over the valley rather than directly into a tree.
- No drag, touch, keyboard, wheel, orientation-sensor, zoom, fullscreen or focus interactions. The decorative root is inert and hidden from accessibility APIs; it cannot intercept menu input.
- Reduced-motion users receive the existing native still and no viewer import. A live preference change destroys or recreates the renderer.
- Hidden documents stop rotation and movement; returning resumes it. Entering a room destroys the home renderer and leaves the still underneath, so there is no competing GPU animation during play.
- Loading, WebGL or asset failure leaves the native still visible rather than a blank page or viewer error panel.
- A ResizeObserver and visual-viewport resize handler cover mobile browser toolbar and orientation changes. The background includes a 2px overscan to avoid an edge seam. No heavy whole-screen backdrop blur is used.

## Verification

Playwright loaded the actual home page in Chromium at 1440×1000 and WebKit at 390×844. Both produced a visible renderer, changing screenshot pixels over time, no page/console errors, and zero canvases after requesting reduced motion. Measured yaw changed 1.54° over two seconds and remained exactly constant while document visibility was hidden. Starting with reduced motion made zero renderer-JavaScript or cubemap-face requests. Joining a real room removed the canvas; leaving restored exactly one. The rendered home screenshots were inspected alongside a six-face source contact sheet, cubemap edge/pole views, and frames decoded from the recorded WebM files. Results live in ignored `ui-progress/panorama-*.json` / `.png` outputs, not production assets.

Generate shareable local progress recordings with the existing Playwright video recorder:

```sh
node scripts/record-progress.mjs
node scripts/record-progress.mjs --browser=webkit --device=mobile --seconds=8
```

The command only connects to `http://127.0.0.1:5173`, records bounded home rotation followed by running reveal/results lab fixtures, and replaces `ui-progress/latest-desktop.webm` and `ui-progress/latest-mobile.webm`. `--seconds` accepts 4–20; `--device` accepts desktop, mobile or both. `ui-progress/recordings.json` records browser, viewport and any console/page errors. The game/lab dev server must already be running.
