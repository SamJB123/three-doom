# Working on Three Doom

- Read `docs/ROADMAP.md`, `docs/FIDELITY.md`, and the latest `docs/PROGRESS.md` entry before choosing a slice.
- Use stable roadmap IDs and named original Doom functions when documenting behavior. Existing comments saying "ported" are not fidelity evidence.
- Use npm and `package-lock.json`. Do not create a second package-manager lockfile.
- Keep IWADs, generated screenshots/traces, and local reference manifests out of Git. `npm run setup:wad -- <path>` prepares the local asset.
- One clock schedules simulation: `TicClock`. Game logic must not advance from render frames or wall-clock timeouts. Menus must isolate input and pause all single-player simulation.
- Add behavioral regression tests for gameplay changes; browser checks for menu/input/lifecycle changes. Do not mark C parity verified without reference evidence.
- Run `npm run typecheck`, `npm test`, and `npm run build`; use `npm run verify:wad` for asset/map changes and `npm run test:e2e` for UI/input/lifecycle changes.
- Update the roadmap's scoped status and progress log with checks, limitations, and the next work item. Do not describe the game as complete until its completion gates pass.
