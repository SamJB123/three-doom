# Three Doom

A playable Ultimate Doom single-player port in TypeScript, with Three.js rendering and the original WAD artwork and music. Play all four episodes on desktop or with touch controls on mobile.

## What's included

- All 36 maps, episode and difficulty selection, normal and secret routes, and boss progression.
- Doom's weapons, enemies, pickups, keys, doors, lifts, crushers and other level specials.
- Original-style menus, HUD, pickup messages, automap, palette effects and synthesized music.
- End-of-level statistics, animated episode maps, finales, melt transitions and the title/demo sequence.
- Six browser-local save slots that preserve the world, player, weapons and simulation state.

The project is in acceptance testing, with end-to-end playability reported in user playtesting. All four complete IWAD recordings match the supplied Linux Doom C reference for the captured simulation fields—8,738 tics in total. This is a scoped comparison, not a claim of universal DOS demo compatibility. Detailed campaign, physical-device and release evidence is tracked in [Release checks](docs/RELEASE-CHECKS.md).

## Run locally

Use Node 22.18+ and npm. Supply your own Ultimate Doom `doomu.wad`.

```sh
npm ci
npm run setup:wad -- /absolute/path/to/doomu.wad
npm run dev
```

Open the URL printed by Vite. The setup command validates the IWAD and copies it to `public/doomu.wad`. WADs are ignored by Git; production builds include local public assets.

Use npm and the committed `package-lock.json`. If an earlier pnpm install moved dependencies into `.ignored`, `npm ci` restores the supported installation. The old OPL dependency's native/Git dependency chain has been replaced with a browser-only synthesis subset.

## Desktop controls

| Action | Control |
|---|---|
| Move / strafe | W A S D or arrow keys |
| Look | Mouse |
| Fire | Left mouse button or Ctrl |
| Use a door or switch | E or F |
| Run | Shift |
| Change weapon | 1–7 |
| Pause / menu | Escape |
| Automap | Tab |

Click the game view to capture the pointer. Escape releases it and opens the menu. Desktop play uses keyboard shortcuts for the menu and automap; their on-screen buttons are shown on touch layouts.

On the automap, +/− zoom, F toggles follow, arrow keys pan with follow disabled, M places a mark and C clears marks. Use arrows/Enter or the mouse to navigate menus. Losing focus pauses single-player simulation and audio. Resuming may require another click if the browser declines pointer lock.

## Touch controls

Use the left side to move and the right side to look. Circular **sprint** and **fire** areas are positioned for your thumbs. Tap the play area to use a door or switch. Hold the aiming side to open the weapon wheel, drag to an owned weapon and release to select it.

The **Map** and **Menu** buttons remain available on touch layouts. Opening a menu cancels held actions. Controls adapt to portrait and landscape orientation.

## Menus, saves and campaign flow

New Game selects an episode and difficulty. Options include music/sound volume and HUD messages. Save Game and Load Game use six slots in this browser's local storage, tied to the IWAD hash. Clearing site data removes those saves.

Normal and secret exits carry inventory into the next map through the full intermission sequence. Episode endings show the original text and artwork, including the timed bunny panorama. Watch demos runs the original title/credit/four-demo cycle; a key or tap opens the menu and pauses playback.

Ordinary actor collision follows original Doom, including flying monsters blocking movement underneath them. Multiplayer and original DOS save-file compatibility are separate targets.

## Checks and development

```sh
npm run typecheck
npm test
npm run verify:wad
npm run verify:audio
npm run build

# Browser acceptance with installed Chrome:
PLAYWRIGHT_CHANNEL=chrome npm run test:e2e

# Complete recorded-input diagnostics:
npx playwright install chromium
npm run test:replay
npm run verify:world -- 4000
```

WAD and browser checks require your local IWAD. `verify:world` also requires a C compiler and the original source; set `DOOM_SOURCE` to its `linuxdoom-1.10` directory when using a different reference location. GitHub Actions runs the code checks. Generated screenshots, traces and reference manifests stay outside Git.

- [Roadmap](docs/ROADMAP.md): scoped implementation and completion gates.
- [Fidelity](docs/FIDELITY.md): reference contract and comparison limits.
- [Special-family coverage](docs/SPECIAL-COVERAGE.md): movement, obstruction and topology scenarios.
- [Release checks](docs/RELEASE-CHECKS.md): campaign, browser, device and performance evidence.
- [Progress log](docs/PROGRESS.md): changes and validation results.
