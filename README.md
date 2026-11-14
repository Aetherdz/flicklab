# FlickLab

Browser aim trainer built around measured runs: fixed-timestep simulation,
seeded randomness, and an input log that can be replayed. Six modes share one
engine, every page is static HTML with the game loaded only when you press play.

**Phase 2 (current):** all six modes, per-mode scoring and results, a live
settings panel (themes, target appearance, crosshair editor, input, audio,
motion), share codes, personal bests and a progress chart, plus six static
mode pages generated from one content file.

Phases 3-5 add Arabic/RTL, share cards, leaderboards and monetization.

## Stack

| Layer | Choice |
| --- | --- |
| Build | Vite 8, TypeScript 5.9 (strict), multi-page build |
| Rendering | Canvas 2D, hand-written loop, no engine |
| UI shell | Preact 11, loaded lazily after the play intent |
| Audio | Web Audio, buffers synthesised at first gesture (no assets) |
| Tests | Vitest (engine) + Playwright (browser) |
| Hosting (phase 5) | Cloudflare Pages + Pages Functions, D1, KV, Turnstile |

TypeScript is pinned to 5.9 instead of 7.x (the Go port) to keep the toolchain
on the version every plugin is tested against.

## Commands

```bash
pnpm install
pnpm dev            # http://localhost:5173 (host exposed for tunnels)
pnpm build          # typecheck + production build into dist/
pnpm preview        # serve dist/
pnpm test           # unit tests (Vitest)
pnpm test:e2e       # browser tests (Playwright, needs: npx playwright install --only-shell chromium)
pnpm pages          # regenerate en/<mode>/index.html from content/modes.json
pnpm fonts          # re-download the self-hosted font subsets
```

## Layout

```
src/engine/     loop, input, rng, audio, canvas surface, game session,
                palette + appearance, shared target drawing, hit effects
src/modes/      one file per mode + registry with mode metadata
src/ui/         Preact shell, controller that binds sim to the browser,
                settings panel, progress chart
src/settings/   settings schema, sanitising, crosshair SVG, share codes
src/stats/      localStorage run store, personal bests
src/i18n/       (phase 3) en/ar string catalogues
content/        modes.json — copy, metadata and FAQ for every mode page
scripts/        gen-pages.mjs — builds en/<mode>/index.html from the content
tests/unit/     engine and scoring tests
tests/e2e/      per-mode, settings and mobile browser tests
en/, ar/        static route pages (MPA entries)
```

## How the engine works

The simulation is a pure function of `(seed, config, ordered input log)`.

- `Loop` advances simulation in fixed quanta of `1000/240` ms and renders once
  per frame with an interpolation factor. Frame pacing cannot change what
  happens inside a run.
- `Game` owns the run clock as a step counter. Taps arrive through a queue and
  are applied at the next step, with timestamps relative to run start, so
  replaying a log reproduces the same result exactly.
- `Rng` is xoshiro128\*\* with a four-word state. Every random decision in a
  mode (spawn cell, angle, speed) draws from one stream in a fixed order.
- Modes implement `ModeRuntime`: `begin`, `update`, `tap`, `draw`, `result`.
  They receive a mutable `World` (CSS pixel size) and re-derive pixel positions
  from normalised coordinates, so a resize never changes the stored run.
- Nothing in `update` or `draw` allocates: targets and particles come from
  fixed-size pools.

Reaction time uses `event.timeStamp` from the input event, not a render frame.
Input coordinates are canvas-local CSS pixels; the canvas backing store is
scaled by `devicePixelRatio` (capped at 2 on touch devices).

Appearance is a mutable record owned by the controller and read by the mode on
every frame, so a theme or target change applies to the preview immediately
without rebuilding the run. Hit feedback is a fixed-size spark and ring pool and
is skipped entirely when reduced motion is on.

## Modes

| Mode | Input | Score |
| --- | --- | --- |
| Gridshot | three live targets on nine cells | hits x difficulty x 10 |
| Flick | one target, guaranteed jump after a hit | hits x difficulty x 10 |
| Tracking | cursor position sampled at 240 Hz | on-target % x difficulty x 10 |
| Precision | shrinking target, miss restores size | hits x difficulty x 10 |
| Reaction | five trials, seeded delay | round(100000 / avg ms) x difficulty |
| CPS | clicks inside a fixed pad | clicks per second x 100 x difficulty |

Difficulty values are 1 / 1.5 / 2 for Easy / Normal / Hard. Every mode reads the
same `Appearance` (theme, target colour, shape, scale) and the same `Rng`
stream, so two runs with the same seed and configuration are identical.

## Settings

Settings live in one object persisted at `flicklab.settings.v1`:

- theme (Ink, Graphite, Dusk) and a colourblind-safe target palette
- target colour, shape (disc, ring, square) and scale
- crosshair shape, size, thickness, gap, colour, opacity and dark outline,
  rendered as an inline SVG cursor and mirrored in the panel preview
- sensitivity, optional pointer lock, volume, mute, reduced motion
- `FL1.` share codes: the whole settings object, base64url encoded, decoded
  through the same sanitiser as stored data, so a hand-edited code cannot put an
  out-of-range value into a run.

The panel mutates the live appearance, so the field behind it updates as you
change a value.

## Adding a mode

1. Create `src/modes/<id>.ts` exporting a class that implements `ModeRuntime`.
   Keep state in preallocated fields; draw only inside `draw`.
2. Register it in `src/modes/registry.ts` and add its id to `ModeId` in
   `src/engine/types.ts`.
3. Add the route: `en/<id>/index.html` (and `ar/<id>/` in phase 3), plus the
   entry in `vite.config.ts` and the sitemap generator.
4. Add `tests/unit/<id>.test.ts` covering spawn rules, scoring and a determinism
   replay, and `tests/e2e/<id>.spec.ts` covering start → hit → miss → finish.
5. Add the strings to `src/i18n/en.json` and `src/i18n/ar.json` (phase 3); no
   literal copy inside components.

A mode is expected to land in roughly 100-150 lines.

## Testing notes

- 37 unit tests cover the loop, RNG, scoring, determinism, appearance scaling
  and every mode's rules; 22 Playwright tests cover each mode page, the settings
  panel, share codes and touch input.
- `tests/e2e` drives the game through `window.__fl`, exposed only when the URL
  has `?test=1` and the bundle is a dev build. It can start a run with a fixed
  seed and advance simulation time directly, so tests never depend on animation
  frame timing.
- Frame pacing was sampled in headless Chromium (no GPU) over 240 frames:
  p50 16.7 ms, p99 16.8 ms, zero frames over 24 ms. A real-GPU pass happens in
  phase 5 alongside Lighthouse.

## Credits

Design and architecture were informed by open-source aim trainers, without
reusing code: `guitheengineer/betteraim` (MIT) and `Nokorpo/LibreAim`
(GPL-3.0 - design ideas only, no code copied).

Fonts: Saira Condensed, Inter Tight, IBM Plex Sans Arabic (SIL Open Font
License), self-hosted as woff2 subsets.
