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
3. **Tic traces (initial scoped comparison):** same map, skill, player start, ticcmd stream and RNG indices; compare each tic's position, momentum, angle, health, armor, ammo, actor state/tics/target and sector heights. Stop at the first divergence. Normalize entity IDs by spawn order. Fix arithmetic and thinker order before claiming demo fidelity.
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

Current priority is finishing known implementation gaps, followed by a final campaign, comparison and release verification pass. Focused regression checks accompany each implementation fix; broad coverage-only work waits until that queue is closed. Use focused source comparisons to resolve concrete behavior; increasingly long demo comparisons must not displace those completion gates. A passing build or source inventory is not fidelity evidence.


## Current reference evidence

`scripts/reference-fixed.mjs` compiles and executes the supplied `m_fixed.c` and writes 21 input/output vectors with source/compiler provenance to `tests/fixtures/fixed-reference.json`. These verify arithmetic only. Regenerate with `node scripts/reference-fixed.mjs`; no commercial assets are embedded in the fixture.

`tests/combat.test.ts` now checks `P_Move` distances for all ten Ultimate Doom monster types in all eight directions. Monster speed is an integer multiplied by a fixed direction vector; projectile speed is already fixed-point. Ordinary solid actors intentionally retain original `PIT_CheckThing` infinite-height collision, including an elevated lost soul blocking the player. These scenarios are derived from the supplied C source, not executed full-engine C differential traces.

Automap discovery now uses front-to-back BSP angular spans, not the software renderer's vertical column clipping or wall-drawing flags. Sliding and angle calculations still use floating-point projections. These are recorded approximations, not demo-compatibility claims.

Save verification now includes forty continued synthetic tics after JSON serialization/restoration, covering actor links, RNG, lighting and a moving floor. This establishes local round-trip behavior for that fixture, not C save-format compatibility or all possible thinker combinations.

`tests/fixtures/audio-reference.json` pins four one-second PCM hashes generated with the supplied WAD and upstream opl3 0.4.3 before browser-subset extraction. `npm run verify:audio` confirms non-silent extraction equivalence. It is not a recording or emulation comparison against original Doom hardware.

Intermission tests use named single-player WI stages and source-derived timing. Browser checks exercise an actual exit linedef, music selection, frozen world state, paused presentation and next-level loading. Finale checks compare canvases to original WAD patches at source-derived text/panorama/END6 thresholds. These do not replace executed C presentation traces or complete gameplay routes. Original melt transitions now have executed C column traces and browser pause/composition checks; title demo cycling is covered separately below.

`scripts/reference-missile.mjs` executes the original P_SpawnPlayerMissile function with scripted aim results, a captured spawn and constant trig-table stubs. Its four cases in `tests/fixtures/missile-reference.json` verify probe order/fallback, launch height and vertical momentum. The TypeScript test reverses the initial half-tic Z move because the oracle stubs P_CheckMissileSpawn. This fixture intentionally makes no claim about trig tables, ray traversal or horizontal momentum fidelity.

`scripts/reference-angle.mjs` executes original `R_PointToAngle`/`SlopeDiv` against original `tables.c` for 20 fixtures. Generated source fine-angle tables now drive movement thrust, view/weapon bob and principal combat vectors. Browser angle input, sliding and trace intersection calculations still use floating-point boundaries. This is scoped arithmetic evidence, not whole-engine/demo parity.

`scripts/reference-damage.mjs` executes original `P_DamageMobj` for eleven player health/armor/cheat/exit-sector cases. Null inflictor/source and stubbed actions deliberately exclude knockback, kill side effects and infighting. Tests compare arithmetic/state outcomes; gameplay death actions have separate source-derived regressions.

`scripts/reference-melt.mjs` executes original melt initialization/column transformation/ticking with scripted cosmetic RNG, checking every column position through completion. Browser checks establish connected canvas composition and paused world state. Software-renderer pixel identity, CSS palette overlays and title demo sequencing remain outside that evidence.

`scripts/reference-sound.mjs` executes original `S_AdjustSoundParams` with original angle tables/routines for ten distance/pan cases. Audio tests also cover live actor positions during nearby/distant teleports, channel replacement/priority, sector sound cadence and cleanup. Browser checks cover pause and level teardown. These do not establish original mixer/resampling or listening parity.

## Deliberate scrolling-loop presentation adjustment

For the requested continuous armor-pedestal effect, matching special-48 faces in an unbranched closed loop now share cumulative perimeter UVs. The perimeter fits an integer number of texture repeats so the closing seam also joins; this slightly adjusts horizontal texture scale. Source `P_UpdateSpecials` offsets and simulation/save state remain unchanged. This differs from `R_StoreWallRange`'s per-sidedef mapping: E1M1 lines 348–355 all start with offset 8, rather than cumulative offsets. Treat this as the user's requested presentation adjustment, not newly established original renderer parity. Open/branched chains and differently authored offsets retain their per-face mapping.

## Sky visibility

`R_DrawPlanes` paints sky into visible plane spans; skipping sky ceiling geometry is not equivalent because it exposes unrelated map geometry. The Three.js renderer now uses directional sky materials on depth-writing sky ceilings and on curtains above one-sided outdoor boundaries, plus a camera-centered full-view background. The background and sky surfaces share projection so their edges do not introduce parallax. Four horizontal repeats, full-bright color and row 100 at the horizon follow the supplied source. Free-look pole coverage clamps edge rows instead of reproducing the original software renderer's vertical wrapping; perspective projection is not a pixel-parity claim. Synthetic browser pixels verify coverage and foreground/background occlusion. Broader IWAD screenshot comparisons remain open.

`scripts/reference-lights.mjs` executes the original four light thinker functions for 140 tics each against the original RNG table. Tests compare every brightness/counter/direction/RNG result. Spawn setup, neighboring sector discovery and whole-map special dispatch are outside this fixture.

Development replay now compares 70 actual WAD DEMO1 command tics across two port runs with different frame batching and a menu pause. Original command decoding is C-checked separately. These are repeatable port world traces, not yet C-versus-port world traces. The comparison caught and closed render-frame weapon-bob state mutation.


## Headless original world comparison

`npm run reference:world -- DEMO1 70` builds the supplied C engine and executes original `P_Ticker` against original WAD commands. `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e -- --grep 'original IWAD demo'` writes the corresponding local port trace; `npm run compare:world` fails on captured player/actor differences or length mismatch. Use matching limits up to 350 (`DOOM_TRACE_TICS=350` for the browser test and `DEMO1 350` for the C runner). Artifacts, including source copies, binaries, traces and provenance, stay under ignored `artifacts/`.

The host replaces graphics, audio-device and network I/O. It does not run `G_Ticker`'s demo/title lifecycle. Only version-109 single-player commands without special buttons or command-line rule flags are accepted. Host portability adaptations are explicit: pointer-sized arrays/default values, fixed-size on-disk texture metadata, pointer alignment, obsolete-header shims and the missing sprite-name NULL sentinel. Original source is untouched. Clang AddressSanitizer checks the generated executable; provenance records original/compiled source hashes, IWAD, host/generator hashes, compiler and flags. `-fwrapv` specifies signed integer wrap; this is a hosted Linux-source oracle, not a DOS executable equivalence claim.

The initial 350-tic DEMO1 comparison matches all captured fields through tic 108. At tic 109 player sliding first diverges; later differences are downstream and have not yet been independently diagnosed. Fields checked are actor type/order, fixed positions/momenta, binary angle, health, state/tics and flags, plus player weapon slot/coordinates and gameplay RNG. Inventory, targets, sectors, sound and rendering are not yet compared against C. Separate port-versus-port traces include more state and pass with changed frame batching and pause. Neither result establishes complete demo or campaign parity.


The next movement slice extends the captured DEMO1 agreement through tic 209. `P_HitSlideLine` now matches 32 executed C cases (horizontal/vertical/angled walls, both sides, varied momentum); the fixture scripts the side test and does not claim complete traversal parity. `P_SlideMove` uses fixed intercept fractions and source approach/remainder projection, retry count and stairstep momentum behavior. Candidate collection still scans lines with a floating segment-bounds test, so exact `P_PathTraverse` blockmap ordering remains open. `P_XYMovement` now preserves C division-versus-shift rounding for negative odd components, and actors retain collision-derived floor bounds over step edges. The new first world mismatch is missing hit-effect actors/RNG at tic 210.


The 350-tic DEMO1 comparison now passes for every captured player/actor field, including actor counts/order, health, flags, state/tics, position/momentum, weapon coordinates/slot and gameplay RNG. Connecting `PTR_ShootTraverse` to `P_SpawnPuff`/`P_SpawnBlood` restored missing actors and RNG draws before damage; setting `MF_JUSTHIT` on successful player pain rolls closed the remaining flag differences. This is ten seconds of one supplied demo under the hosted-source contract. Original C target links, inventory, sectors, longer demos, special-rule modes and campaign completion are still outside the passing gate.


The comparison now also checks actor target links (normalized by thinker order), armor/type, pending weapon, damage/bonus counters, player lifecycle, ammo/capacities, owned weapons, keys, powers, sector heights/lights/specials and sidedef offsets. DEMO1's first 350 tics pass these additional fields after connecting the player `P_DamageMobj` wake/target tail. Capturing more fields exposed the missing target link; the previous narrower pass remains correctly scoped.

Browser replay accepts `DOOM_TRACE_DEMOS=DEMO1,DEMO2,DEMO3,DEMO4` and `DOOM_TRACE_TICS` up to 4000, bounded by the actual command stream. Polling transfers only the tic; full traces transfer as JSON once per run, and complete-trace SHA-256 checks compare altered frame batching and pause. The C comparison selects the matching port artifact using reference provenance. All four 350-tic port-repeatability checks pass. Original C comparisons in the other episodes currently fail: DEMO2 first actor difference at 103, DEMO3 first player difference at 168, DEMO4 sight/RNG difference at 1. These are open fidelity work, not passing episode gates.

Current cross-episode result supersedes the preceding first-divergence limits: DEMO1–3 pass all captured fields through 350 tics; DEMO4 passes through 157 and first differs in enemy wake/RNG at 158. Fixed slide traversal, dynamic collision links, original player-search timing and weapon/shotgun timing resolved earlier failures. Run `npm run verify:world -- 350` after refreshing browser captures; per-demo provenance and comparisons remain under ignored `artifacts/world-comparisons`. This is not full blockmap/hitscan or complete-demo parity.

Preserving the supplied C `P_DivlineSide` horizontal X/Y quirk extends DEMO4 agreement through 216 tics. Tic 217 first exposes hitscan actor collection outside traversed cells. Synthetic occlusion fixtures avoid that boundary and a dedicated regression records it explicitly.

All four 350-tic original-world comparisons now pass after replacing global hitscan actor collection with fixed visited-cell traversal and linked-actor ordering. Impact coordinates use the nudged trace. This supersedes the preceding DEMO4 first-divergence boundary. The passing scope remains the captured field set and 350 commands per demo; complete recordings, all internal counters, title playback and release gates remain open.

## Longer recordings and lifecycle boundaries

The 4000-command diagnostic request reaches actual recording ends for DEMO1 (1710) and DEMO4 (818); both port-versus-port repetitions pass with pause and different frame schedules. Original C first differs at DEMO1 tic 463 (RNG) and DEMO4 tic 368 (RNG). DEMO2 retains 1769 commands before divergent gameplay reaches rebirth; its first C difference is player angle at 600, in `A_Punch`. DEMO3 retains 3194 commands before rebirth; its first C difference is health at 417. Neither partial recording is a complete-demo pass. The large DEMO3 repeat run was interrupted after retaining its first trace; no repeatability claim is made for that long sample.

Developer replay now pauses and retains its trace on rebirth/level-exit boundaries instead of losing it during a level rebuild. The browser harness writes partial traces before rejecting an early boundary. `DOOM_TRACE_SPEED=1–16` optionally scales test clock input; simulation still uses `TicClock`, and a second complete run changes frame batching and pauses. Per-demo C comparison directories now retain the paired port trace as well as C trace, provenance and report, so later captures do not erase the input behind a failure report.

Mobile touch-handler/menu assertions pass in installed Chrome and Playwright WebKit 26.6 using portable synthetic events. Those assertions do not establish trusted hardware delivery, thumb comfort, mobile Safari/Android performance or sound quality. See RELEASE-CHECKS.md for reproducible commands and outstanding campaign/device gates.

Restoring `A_Punch` spread, hit feedback and target-facing advances DEMO2 agreement through 1335 tics; the explicit 700-tic gate passes. The next captured mismatch at 1336 is ordinary corpse XY movement. Browser control synchronization preserves vertical look while applying the weapon turn.

Ordinary actor movement subdivision and corpse ledge friction advance DEMO2 agreement through 2270 tics. The complete 2347-command recording is now port-repeatable; the remaining first C difference is player angle at 2271. The earlier rebirth truncation is resolved for this demo.

Checking damaging-floor contact against the centre sector floor extends DEMO3 agreement through tic 921. Tic 922 first differs in player angle during teleport recovery. The 1000-tic browser replay remains repeatable; this is not a passing 1000-tic C gate.

Preserving actor angle and weapon/Use aim during teleport reaction time advances DEMO3 agreement through 993 tics. Tic 994 exposes an extra Baron facing action; the 1500-tic port replay passes repeatability but not C parity.

Removing the extra final Baron facing action extends complete DEMO3 agreement through 2035 tics; blood height first differs at 2036. Shadow-facing and missile aim RNG have separate behavioral regressions. Full replay assertions pass, but a long-run worker cleanup stall remains unresolved and required stopping the completed worker. Compressed transport preserves the raw comparison input; it is not a cleanup fix.

## Connected presentation updates

The retail `D_DoAdvanceDemo` title/credit/four-demo sequence is now production-accessible through Watch demos, with the initially visible menu retained. It runs on TicClock and pauses for menus. All four recordings play through in the browser; their combat is not claimed identical to original C.

`ST_updateFaceWidget` priorities, attacker-facing, sustained-fire delay and reset are covered by behavioral tests and connected HUD checks. `ST_doPaletteStuff` selects the original PLAYPAL transforms. Captured 256-color swatches under damage, bonus and suit transforms match the supplied palettes within one RGB byte in Chrome and WebKit; interpolation for Three.js antialiasing is a presentation adaptation.

Indexed world/sprite textures now preserve source palette indices, with COLORMAP lookup in shaders. `P_PlayerThink` invulnerability/infrared priority and expiry blink select rows 32 and 1, including full-bright actors and the weapon overlay. `A_Light0/1/2` drive shared muzzle-light uniforms and are saved/restored. Color lookup uses sRGB conversion explicitly; original palette colors are not treated as linear intensities. Browser synthetic planes compare all 256 colors for ordinary/flash/power/blink/full-bright cases on the default renderer and forced WebGL path. This verifies palette/colormap lookup, not original screen-column distance attenuation: sector-to-light lookup and flash brightness still use the port's existing approximate sector-light scale. Source distance falloff, horizontal/vertical wall shading and complete screenshot comparison remain open.


## Distance lighting implementation

`R_InitLightTables` / `R_ExecuteSetViewSize` now supply the renderer's discrete distance-colormap rules: sixteen sector-light bands, wall/sprite scale indices capped at 47, and plane distance indices capped at 127. Axis-aligned walls receive the original -1/+1 light-band bias before clamping; opposing faces agree. Weapon overlays use `R_DrawPlayerSprites`'s maximum scale index. Muzzle light changes the source light band; fixed power colormaps and full-bright frames retain precedence.

Shader depth is converted from Three.js units back to map units. Projection is normalized to the original full 320-wide view rather than making lighting change with browser pixel resolution. Three.js perspective/free look, float fragment depth and antialiasing remain rendering adaptations; this does not establish software-renderer pixel identity. Focused browser checks sample walls and flats at 32/128/512 units under ordinary, flash and power effects on default and forced-WebGL backends. Broad reference scene comparisons remain deferred to final acceptance. This supersedes the earlier constant-sector-light approximation.
