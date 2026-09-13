# Fidelity and verification

## Reference contract

Use the supplied `DOOM/linuxdoom-1.10` source as the initial behavioral specification and the supplied Ultimate Doom IWAD as integration input. Do not assume the Linux source is byte-for-byte equivalent to a particular DOS executable. Its source includes episode four, but rules and demo-version compatibility still need an explicit audit.

Generate an untracked provenance artifact:

```sh
DOOM_SOURCE=/absolute/path/to/DOOM DOOM_WAD=/absolute/path/to/doomu.wad npm run reference:manifest
```

This records SHA-256 hashes of the IWAD and C/header sources. Commit small fixtures and their provenance when a reference is selected; do not commit the IWAD. The manifest itself is a local verification artifact, not evidence that a C oracle has been executed.

## Layers of evidence

1. **Behavioral regression tests:** synthetic maps and explicit expected outcomes derived from named source functions. No GPU or real WAD required. Keep these small and deterministic.
2. **C differential fixtures (arithmetic established; gameplay pending):** isolated C wrappers or an instrumented reference runtime consume the same inputs and emit expected values. Include arithmetic edge cases, collision, sector movement, damage and state transitions. Record function, reference hash, inputs and outputs.
3. **Tic traces (pending):** same map, skill, player start, ticcmd stream and RNG indices; compare each tic's position, momentum, angle, health, armor, ammo, actor state/tics/target and sector heights. Stop at the first divergence. Normalize entity IDs by spawn order. Fix arithmetic and thinker order before claiming demo fidelity.
4. **WAD smoke:** parse every map and required asset; useful coverage but not a playthrough or geometry proof.
5. **Browser acceptance:** title/new game/pause/resume/restart, no menu input leakage, keyboard/touch, loading failures. Assertions may read `?inspect` snapshots in development. Production builds omit the inspector.
6. **Presentation/playthrough:** reference screenshots, listening checks, complete map routes and boss/secret exits. Three.js permits a different rasterizer; specify acceptable visual differences explicitly. Browser smoke cannot establish audible fidelity or campaign completeness.

## Simulation boundaries

`TicClock` is the sole wall-time accumulator. `playerTickSystem` performs one simulation step; weapons, enemy counters, pickups and HUD updates run in that same outer tic. Menus/focus loss discard accumulated wall time and reset held controls. Rendering continues while paused.

This removes frame batching differences from the prior two-clock loop. It does **not** yet establish original C ordering: thinker insertion order and lazy removal now have regression coverage; player/weapon phase ordering has source-derived checks but still needs executed C traces, some presentation RNG/state may need separating, and input remains browser-sampled rather than recorded ticcmds.

## Definition of done per work item

- Name the original functions and expected behavior.
- Add scenarios for the concrete failure and neighboring edge cases.
- Implement and connect the behavior through the actual game path.
- Run typecheck, relevant tests, and build; browser checks when UI/input/lifecycle changes.
- Record evidence and remaining limitations in `PROGRESS.md`; update only the scoped roadmap status.

The next engineering priority is behavioral correctness. A larger table of ported functions or passing build is not a substitute for reference comparison.


## Current reference evidence

`scripts/reference-fixed.mjs` compiles and executes the supplied `m_fixed.c` and writes 21 input/output vectors with source/compiler provenance to `tests/fixtures/fixed-reference.json`. These verify arithmetic only. Regenerate with `node scripts/reference-fixed.mjs`; no commercial assets are embedded in the fixture.

`tests/combat.test.ts` now checks `P_Move` distances for all ten Ultimate Doom monster types in all eight directions. Monster speed is an integer multiplied by a fixed direction vector; projectile speed is already fixed-point. Ordinary solid actors intentionally retain original `PIT_CheckThing` infinite-height collision, including an elevated lost soul blocking the player. These scenarios are derived from the supplied C source, not executed full-engine C differential traces.

Automap discovery currently uses horizontal visibility rays, not the software renderer's wall-drawing flags. Sliding and angle calculations still use floating-point projections. These are recorded approximations, not demo-compatibility claims.

Save verification now includes forty continued synthetic tics after JSON serialization/restoration, covering actor links, RNG, lighting and a moving floor. This establishes local round-trip behavior for that fixture, not C save-format compatibility or all possible thinker combinations.

`tests/fixtures/audio-reference.json` pins four one-second PCM hashes generated with the supplied WAD and upstream opl3 0.4.3 before browser-subset extraction. `npm run verify:audio` confirms non-silent extraction equivalence. It is not a recording or emulation comparison against original Doom hardware.

Intermission tests use named single-player WI stages and source-derived timing. Browser checks exercise an actual exit linedef, music selection, frozen world state, paused presentation and next-level loading. Finale checks compare canvases to original WAD patches at source-derived text/panorama/END6 thresholds. These do not replace executed C presentation traces or complete gameplay routes. Original screen wipes and title demo cycling remain required UI-02 work.

`scripts/reference-missile.mjs` executes the original P_SpawnPlayerMissile function with scripted aim results, a captured spawn and constant trig-table stubs. Its four cases in `tests/fixtures/missile-reference.json` verify probe order/fallback, launch height and vertical momentum. The TypeScript test reverses the initial half-tic Z move because the oracle stubs P_CheckMissileSpawn. This fixture intentionally makes no claim about trig tables, ray traversal or horizontal momentum fidelity.

`scripts/reference-angle.mjs` executes original `R_PointToAngle`/`SlopeDiv` against original `tables.c` for 20 fixtures. Generated source fine-angle tables now drive movement thrust, view/weapon bob and principal combat vectors. Browser angle input, sliding and trace intersection calculations still use floating-point boundaries. This is scoped arithmetic evidence, not whole-engine/demo parity.
