# Three Doom

A TypeScript gameplay port using Three.js for rendering and the original Doom WAD assets. All four episodes are selectable, with campaign transitions, menus and saves. **Not yet a complete or demo-compatible Doom port**.

## Run locally

Use Node 22.18+ and npm. `package-lock.json` is the canonical lockfile.

```sh
npm ci --ignore-scripts
npm run setup:wad -- /absolute/path/to/doomu.wad
npm run dev
```

Open the URL printed by Vite. WAD files are local inputs, ignored by Git. `setup:wad` validates the IWAD header and copies the supplied file to `public/doomu.wad`. Vite includes public assets in builds.

The title menu offers episode/difficulty selection, Load Game, options and Read This. Escape or the on-screen Menu button opens the menu during play. Menus pause the simulation, audio, and held controls. Arrow keys, Tab, Enter, mouse, and touch navigate menus. Losing focus also pauses. Resume may require clicking the game canvas if a browser declines pointer lock.

New Game during play asks for confirmation. Restart rebuilds the current level in-process. End Game returns to the title. Six browser-local save slots preserve the current world; saves are tied to the IWAD hash.

## If `pnpm dev` / `pnpm install` fails

The previous `opl3` dependency pulled in Git-based native audio dependencies (including `ogg`) that pnpm 11 rejected. This has been replaced with an attributed browser-only synthesis subset; the Git/native dependency chain is gone. This checkout uses npm; do not mix package managers in the same `node_modules`.

If pnpm has moved packages into `.ignored`, restore them with:

```sh
npm ci --ignore-scripts
npm run dev
```

The manifest declares npm explicitly. No change to your global pnpm policy is needed. The supported and tested installation path is npm.

## Verify

```sh
npm run typecheck
npm test
npm run verify:wad
npm run verify:audio
npm run build
npx playwright install chromium
npm run test:e2e
```

GitHub Actions runs the code checks on pushes and pull requests. WAD and browser checks run locally with your supplied assets.

`verify:wad` uses `DOOM_WAD` or `public/doomu.wad`. Browser tests require that local WAD. For an installed browser, set `PLAYWRIGHT_CHANNEL=chrome`. Browser checks use a development-only read-only snapshot enabled by `?inspect`; it is not a gameplay API.

## Work systematically

- [Roadmap and source coverage](docs/ROADMAP.md): milestones, stable work IDs, and acceptance gates.
- [Fidelity strategy](docs/FIDELITY.md): reference selection, deterministic comparison, and test boundaries.
- [Special-family coverage](docs/SPECIAL-COVERAGE.md): tested movement cycles and remaining scenario scope.
- [Release checks](docs/RELEASE-CHECKS.md): campaign, browser, device and performance gates.
- [Progress log](docs/PROGRESS.md): changes, verification evidence, and next work.

Before starting a slice, choose its work IDs and source functions. Add regression scenarios for behavior being changed. Update coverage and the progress log after validation. A system is not verified merely because an implementation exists.


Current campaign controls: New Game selects any of the four episodes and a difficulty. Normal/secret exits load the next map in-process and carry inventory; completion screens animate statistics, episode maps and music before loading the next level. Options controls music and sound volume. Tab (or Map) opens the automap; +/− zoom, F toggles follow, arrows pan with follow off, M marks and C clears marks. Episode endings include original text/art and the timed bunny panorama. Melt wipes accompany level transitions. Watch demos starts the original title/credit/four-demo cycle; any key or tap opens the menu and pauses playback.

On mobile, use the circular sprint/fire areas with your thumbs. A short tap in the play area uses a door or switch. Hold the aiming side to open the owned-weapon wheel, drag to a weapon and release to select it. Opening a menu cancels held controls.

Compatibility note: ordinary actor collision follows original Doom, so a flying monster can block walking underneath it. The port is not yet complete; see [the progress log](docs/PROGRESS.md) for verified behavior and known gaps.
