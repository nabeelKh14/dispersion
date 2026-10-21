# DISPERSION

A cinematic, scroll-driven WebGL experience for a fictional AI trading engine.

**Concept.** A market is undifferentiated light — one beam containing every
signal at once. `DISPERSION` is the engine that refracts it: the same
discipline as dispersion in optics (splitting white light into a spectrum)
and in quant finance (the spread between assets, which is where the actual
alpha lives). Seven named wavelengths map to seven statistical families of
behaviour.

The site is a **fictional product**. Every performance figure shown is
illustrative and is labelled as such on the page and in the footer.

## Stack

| Layer | Choice |
|---|---|
| 3D | three.js r186 — `MeshPhysicalMaterial` with real transmission, chromatic dispersion and iridescence |
| Environment | Procedural PMREM studio, built from emissive cards + a negative-fill flag |
| Post | `EffectComposer` → UnrealBloom → a hand-written grade pass (chromatic aberration, lift/gain, vignette, film grain) |
| Scroll | Lenis for smoothing; scene state is derived from real scroll position in the render loop, so programmatic scrolls and anchor jumps stay in sync |
| Type | Archivo (display), Space Grotesk (text), JetBrains Mono (data) — self-hosted via `@fontsource-variable` |
| Audio | Web Audio API generative score — drone, noise bed, tension bus driven by scroll velocity. No audio files. |
| Build | Vite 7 + TypeScript 5.9 (strict) |

## Architecture

**One object, seven scenes.** The prism is the protagonist. A keyframe table
in `src/scene/world.ts` drives camera, prism transform, beam geometry, light
and grade from a single normalised scroll progress value.

**The copy overlay.** Scene copy lives in a fixed overlay (`.overlay`), not
inside the scrolling sticky blocks. A copy pinned in a sticky block
physically leaves the viewport before the next one arrives, which leaves a
dead frame in the journey. Fixed slots that cross-dissolve in place cannot
have that problem — and the fade curves are complementary, so the visible
copy sum is always exactly 1.

**The glass.** A hyperglass prism needs *something* behind it: a large
luminous wall makes the interior wash to white. The environment therefore
carries a black negative-fill flag on the camera's transmission path, which
keeps the core dark while the edges catch the key light — the hyperglass
signature.

## Scripts

```bash
npm run dev        # dev server on :5180
npm run build      # typecheck + production build
npm run preview    # serve dist on :4173
```

Verification scripts (require the preview server running):

```bash
node scripts/verify.mjs    # walk the journey, capture frames, assert DOM
node scripts/audit.mjs     # per-scene opacity audit: gaps, overlap, cropping
node scripts/envelope.mjs  # scroll envelope + mobile overflow checks
node scripts/capture.mjs   # capture the live experience to frames for the reel
```

The reel in `public/video/dispersion-reel.mp4` is produced by capturing the
running site and encoding with ffmpeg — so it always matches what a visitor
sees.

## Deploy

```bash
vercel --prod
```

## Credits

Design and build by Nabeel Khan (PrismAI). The visual language — dark-room
editorial, one hero object, hairline rules, uppercase display type at weight
500 — is informed by the published work of Lusion (oryzo.ai).
