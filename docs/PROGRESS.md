# Progress log

## 2026-09-13 — baseline review

Starting commit: `7a4631f`. Substantial E1M1 prototype; no real menu or campaign lifecycle. Typecheck/build pass with npm. All 36 supplied maps parse. Confirmed gameplay defects and source mapping are recorded in `ROADMAP.md`.

## 2026-09-13 — foundation slice (MENU-01, LOOP-01, BUILD-01)

Implemented a WAD-backed title/menu and single-player session boundary; start, help, pause/resume, new-game/end confirmations; keyboard/mouse/touch menu access. Menus clear held inputs, suspend audio, and stop simulation. Pointer-lock loss, blur and hidden tabs open the menu.

Replaced independent movement/weapon accumulators with one 35 Hz scheduler. View-height recovery, pickups, sprite animation and HUD now advance with simulation tics; ordinary slow frames retain backlog. Removed the previous 30 FPS delta clamp. Added repeatable setup, unit/browser test structure, WAD smoke and reference manifest tools. npm is canonical; removed stale pnpm lockfile.

Validation completed locally:

- Clean `npm ci --ignore-scripts` from the updated lockfile: pass.
- `npm run typecheck`: pass.
- `npm test`: 5 tests pass, including 350 tics over 10 seconds at 20/30/60/144 FPS and pause/backlog scenarios.
- `npm run verify:wad`: 36 maps and spatial references, menu patches, 107 flats, 287 textures, 764 sprites pass.
- `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`: 4 tests pass (desktop keyboard/menu isolation, restart/end lifecycle, mobile viewport with held touch-fire, missing WAD). Audio context suspension is asserted; audible output is not assessed.
- Desktop, title, and mobile menu screenshots captured under `artifacts/`; desktop/mobile layouts visually inspected.
- Reference manifest generated: SHA-256 for 124 C/header files and the supplied IWAD. No C differential oracle executed yet.
- Production build passes (existing large-bundle warning remains); development inspector omitted from output. Git diff whitespace check passes.

Added a GitHub Actions code-check workflow (clean install, typecheck, unit tests, build). Hosted CI has not run yet; WAD/browser checks remain local because the IWAD is not committed.

The stronger touch test exposed a pre-existing inverted fire zone: code fired in the upper right despite instructions saying lower right. Corrected to the bottom 40%, then verified that opening the menu clears the held gesture. Exit/death delays now count simulation tics; pause/resume also discards elapsed time before the next rendered frame.

During work, a `pnpm dev` invocation moved npm-installed dependencies aside and failed on `opl3`'s Git-based `ogg` dependency. Restored with npm, declared the package manager explicitly, and documented recovery. A browser-only music dependency remains follow-up work. Local dev server started at http://127.0.0.1:3000/.

Limits: menu layout is browser-adapted, not a pixel-exact M_Drawer port. New Game starts E1M1; episode/skill/options/save/load remain pending. Restart/end still use a full page reload to isolate module-global state. Restart requires Resume after reload for browser input/audio activation. Original tic ordering and full deterministic replay remain unverified. Prior physics/combat defects remain open.

Next: PHYS-01 / SPEC-01 regression scenarios and corrections, then moving-sector occupancy and combat/spawn fidelity.

## 2026-09-13 — gameplay corrections and campaign lifecycle

Connected shared actor/line collision, true side-crossing triggers, sorted use intersections, all six manual keyed-door variants and active-door reversal (PHYS-01, SPEC-01). Added moving-sector occupancy, floor carrying and ceiling rollback (PHYS-02). Corrected skill/multiplayer filtering, spawn angles/ambush/tics, melee range, first-shot accuracy, vertical hitscan autoaim, weapon noise and sound propagation. Added baby-skill damage/ammo effects and initial Nightmare speed/respawn behavior. Nightmare respawn timing/effects still need reference refinement.

Added reusable level teardown/loading, episode/skill selection, volume controls, inventory carry between levels, normal/secret routes for all four episodes, real kill/item/secret/time counters, completion screens and boss actions (FLOW-02, MENU-02, BOSS-01, UI-02). No page reload is needed. Per-map music and episode skies now follow campaign selection. Level teardown disposes sky, scene and sprite resources. Save/load and original finale/intermission presentation remain incomplete; completion screens currently show counters rather than original text/art/animations.

Executed an isolated original-C arithmetic oracle: 21 vectors from the supplied m_fixed.c, with source/compiler provenance in the committed fixture. Corrected signed fixed multiplication and division. Thinkers now execute in insertion order with lazy removal and same-tic appended actions. Lights use P_Random with separate flash/fire/strobe/glow timing; corrected glow reversal and nearest-floor platform destination. RNG resets on new game, not every level transition. Full player/weapon/thinker ordering and deterministic replay remain open.

Corrected teleport destination subsector lookup, floor/ceiling/angle/momentum, 18-tic movement delay, player telefrags and source/destination fog. Connected the previously missing A_BFGSpray action and MT_EXTRABFG definition: forty shooter-origin traces with fifteen damage rolls per hit. Added WAD header/directory/lump bounds validation and last-definition-wins lookup.

Added an initial automap (Tab or Map button), zoom, follow/pan, markers, map pickup support, hidden-line handling and source-based wall colors. Simulation continues while the map is open; the menu still pauses it. Discovery uses horizontal rays, not the original renderer's mapped flags. Touch zoom/pan, original HUD layering and pixel fidelity remain follow-up work.

### Runtime report: apparently stationary enemies and elevated skull collision

The user's runtime report identified a major pre-existing unit mismatch in P_Move: monster info.speed is an integer, but was passed to FixedMul as though already fixed-point. This divided movement by 65,536. Changed to ordinary multiplication by the fixed direction vectors, matching p_enemy.c. Added tests for all ten Ultimate Doom monster types in all eight directions. Also restored float height adjustment at blocked steps and target-relative P_ZMovement behavior.

The elevated lost soul blocking passage is original PIT_CheckThing behavior: ordinary solid actors have infinite-height collision. Retained this intentionally and added a regression test. A vertical-overlap gameplay option would be a separate compatibility choice.

The initial browser movement test incorrectly expected shots at E1M1's start to alert its medium-skill monsters. Inspecting the supplied THINGS lump showed all six have the ambush flag. The final scenario places a controlled non-ambush monster in the real start room, fires through normal controls, and verifies visible displacement through the live thinker loop. It does not claim a natural E1M1 playthrough.

Validation: 28 unit tests pass; typecheck and production build pass. WAD smoke still passes all 36 maps and required assets. Browser coverage now includes all 36 map transitions (programmatically requested exits, not combat playthroughs), menu/input/pause/mobile/error flows, live monster movement, and automap behavior. Final full-browser rerun recorded below.

Remaining completion gates: start-to-exit gameplay traces, all IWAD-used specials and actor actions, full world/thinker/RNG saves, original intermission/finales/title sequence, geometry holes and presentation fidelity, browser-only audio packaging, cross-browser/device/performance validation. No full-port or demo-fidelity claim is made.

Final validation for this slice: all 6 Chrome browser tests passed (12.8 seconds), including the 36-map routing loop and live-monster/automap scenario. Automap screenshot inspected. Production build retains the existing bundle-size warning; performance has not been certified.

## 2026-09-13 — saves, specials, intermission/finales and browser audio

**UI-02 — explicit full end-of-level requirement.** Connected original-WAD statistics, level-name patches, animated episode maps, completed/secret-map splats, flashing next-map pointer, par/time counters, count sounds and D_INTER music. `IntermissionState` follows the single-player `WI_updateStats`, `WI_updateShowNextLoc` and `WI_updateNoState` stages, including separate acceleration presses, the four-second map display and ten-tic departure. Episode four uses INTERPIC without a geographic map/par display, following the reference. The shared 35 Hz scheduler advances presentation while the completed world remains frozen; the menu pauses presentation and audio together.

Added `F_Ticker`/`F_TextWrite`/`F_BunnyScroll`-based episode endings: original text and flats, CREDIT/VICTORY2/ENDPIC, D_VICTOR, and the timed PFUB panorama/END0–END6 with D_BUNNY. Browser controls permit skipping to art or returning to title. These are connected source-derived implementations, not a completed visual-fidelity claim. Original melt wipes, title/credit/demo cycling and full reference screenshot/playthrough comparisons remain open.

**SAVE-01 / MENU-02.** Six versioned browser-local save slots archive player/inventory, actors and links, ordered thinkers, doors/floors/platforms/ceilings/stairs/lights, RNG, sector/side/line changes, buttons, weapons, static pickups, automap and view. WAD hashes and schema checks reject incompatible saves. Continued synthetic traces match for forty tics after a JSON round trip; browser persistence survives reload and restores inspected world state. Saves use this port's format, not original .dsg files. Remaining edge cases include references to removed actors, death-delay state, broader malformed-state validation and complete-campaign save scenarios.

**SPEC-02 / RENDER-01.** Added reproducible [IWAD special inventory](IWAD-SPECIALS.md): 90 line and 13 sector specials. Connected donut floors, lower/raise texture transfers, raise-to-texture heights, platform stop/reactivation, shared moving-sector ownership, locked fast switches, shoot-triggered actions, tagged lighting, monster-only teleports and scrolling walls. Fixed stopped crusher duplication and one-shot silent-crusher handling. Seven family-level regression scenarios pass; these do not verify every inventory entry. Sector triangulation now groups holes, nested islands and disconnected outlines, excluding self-referencing internal lines. Synthetic area/containment checks pass; broader map render comparison remains pending.

**BUILD-02 / AUDIO-01.** Replaced the legacy opl3 package with its attributed browser synthesis/MUS/GENMIDI subset under `src/vendor/opl3`. Removed unused native/Git dependencies from the npm lockfile. Four seeded one-second PCM fixtures (E1M1, intermission, victory and bunny tracks) were captured from upstream before removal; the extracted code produces identical non-silent output. This verifies extraction equivalence, not historical sound-card fidelity. Bounded long-rest audio generation to the allocated sample buffer. ScriptProcessor/resampling modernization remains open.

Validation:

- Clean offline `npm ci --ignore-scripts --no-audit --no-fund`: 70 packages installed successfully. npm remains the supported package manager; pnpm was not retested.
- Typecheck, 40 unit tests, four-track audio comparison, 36-map WAD smoke and production build pass.
- Full existing Chrome suite: 8 tests pass (36.4 seconds), including save persistence, actual E1M1 exit-linedef dispatch into stats/map/music, paused presentation and next-level music. A ninth test added afterward passes separately (3.9 seconds): all four finale text/art transitions, panorama completion and END6 at the source-derived tic thresholds.
- Intermission statistics and episode-map screenshots visually inspected. Browser finale comparisons check the rendered canvas against the supplied WAD artwork; they do not execute the original C renderer.
- Whitespace check passes. Build retains its large-bundle warning; performance/cross-browser gates remain open.

Next: close E1M1 gameplay fidelity and playthrough gaps. Source inspection identifies missing monster item drops and death-flag handling; missile interactions and original player/weapon/thinker ordering also require corrections and differential scenarios. Continue special-family coverage, wipe transitions, full save edge cases and campaign/reference playthroughs. The complete-port gate remains open.

## 2026-09-13 — reported visual defects and monster drops

**RENDER-01 / MENU-01.** Fixed masked two-sided walls: corrected winding, culled the opposite face and enabled alpha rejection for transparent texels. Each sidedef keeps its own horizontal orientation; the two opposing surfaces no longer fight for the same visible pixels. Masked textures draw once vertically and clip against the opening. Corrected upper-wall pegging per `R_StoreWallRange`, so ordinary door textures follow the moving ceiling instead of being cropped against a stationary anchor. Also corrected the lower-unpegged lower-wall anchor and masked-middle pegging/row offsets.

Custom menu controls use WAD glyphs, centered at consistent sizes. After the user's follow-up, Resume Game now assembles original large menu-art letters rather than scaling the small HUD font. Resume/Load/Save reuse the exact capital-G Game word from M_NGAME. Other original menu artwork is retained. Letter crop coordinates target the supplied Ultimate Doom patches; arbitrary replacement menu artwork is not guaranteed to match. Pause-menu screenshots inspected after the final typography change.

**ACTOR-01 / PLAYER-01.** Implemented `P_KillMobj` drops: zombiemen drop clips, shotgun guys drop shotguns, chaingunners drop chainguns. Dropped actors carry MF_DROPPED and enter normal actor archives. Touching drops respects vertical reach and full-ammo refusal; clips supply half the normal clip, dropped weapons one ammo clip. Dead players cannot collect items. Existing map pickups retain their static representation to preserve existing save compatibility; general map-item actor migration remains pending.

Death now clears FLOAT/SKULLFLY/SHOOTABLE, clears NOGRAVITY except for lost souls, sets CORPSE/DROPOFF and leaves monster solidity until A_Fall. Removed the extra death-sound call because death-state actions own that sound. Three regression tests cover all three drop families, ammo/refusal/reach, archive inclusion, falling cacodemon corpses and the lost-soul gravity exception.

Validation: 45 unit tests pass; typecheck, production build and all-36-map WAD smoke pass. Ten Chrome tests pass for the visual-fix slice, including actual rendered pixel checks from both sides of a synthetic masked wall and menu/input/save/campaign checks. Final post-gameplay browser result recorded below. Masked-wall pixel testing uses Three's WebGL backend; full cross-backend/WAD screenshot comparison remains open. Build retains its bundle-size warning.

Next: missile collision/species rules, remaining actor actions and original tic ordering; complete campaign playthrough evidence, wipe transitions and source differential coverage remain open.

Final validation: post-gameplay Chrome suite passed all 10 tests (39.4 seconds). The subsequent map-pickup archive-compatibility adjustment passed typecheck, all 45 unit tests and production build; existing map pickup rendering remains on its established static path. Final whitespace check passes.

## 2026-09-13 — toolbar spacing and mobile action-zone regression

**MENU-01 / UI-01.** Map and Menu now share a safe-area-aware flex row with a real gap, instead of independent fixed right offsets that overlapped after the WAD lettering change. Toolbar lettering uses a compact size while retaining 44-pixel minimum button height. Moved the mobile Use control to the upper left so it does not compete with the toolbar in portrait layouts.

**Mobile controls.** Replaced misleading circular action hints with overlays covering the actual upper-left sprint and lower-right fire regions. Both overlays use the same 40% zone constant as hit detection. Touch coordinates are measured against the fixed controls container rather than document height, avoiding viewport-height disagreement. Sprint/fire remain latched from the initial touch until release/cancel; help text now describes this. Other controls intentionally intercept touches over their own buttons.

**UI-03.** Explicitly added the requested original pickup messages to the roadmap: health/armor bonuses, ammo, weapons, keys and powers, including dropped items; original GOT* strings and HUD glyphs, simulation-tic duration, display toggle and successful-pickup-only notification. This item is tracked, not implemented in this slice.

Added browser coverage for non-overlapping buttons, matching overlay bounds, action activation inside the hints, no activation immediately outside, and touch release/cancellation in portrait and landscape. Validation results follow.

Validation: 45 unit tests, typecheck and production build pass. Stable full Chrome run: all 11 tests pass (41.4 seconds). Portrait/landscape screenshots inspected; moved the fire label higher inside its region to clear the landscape status bar, then repeated the mobile test successfully. An earlier browser run was deliberately interrupted after a help-text edit triggered a development reload; it is not counted as passing evidence. Pickup-message implementation remains open under UI-03. Build retains the existing bundle-size warning.

## 2026-09-13 — original pickup messages (UI-03)

Connected all supported pickup families, including dropped items, to the original d_englsh.h GOT* strings. The generated string table records its source SHA-256. Messages use WAD STCFN glyphs, a 140-tic timeout, latest-message replacement, Enter refresh and an Options toggle. Timeout advances only with gameplay tics and freezes in menus. Map transitions/restarts clear the message. A screen-reader status mirrors the displayed text; mobile placement avoids the touch toolbar.

Corrected capped pickups discovered during source comparison: health bonuses, armor bonuses and soul spheres are still collected and reported at 200%; full-health medikits/stimpacks remain uncollected. The supplied C checks medikit urgency after applying healing, making GOTMEDINEED unreachable for ordinary living players; this port retains the ordinary medikit message rather than silently changing that source behavior.

Scope: pickup messages are connected; network chat and forced-priority cheat/menu messages are separate HUD work. Options currently lasts for the running page session. Timing tests model HU_Ticker, but are not executed C differential traces. Message layout is adapted around browser controls.

UI-03 validation: all supported pickup strings exercised through successful synthetic pickups; capped bonus/soul and refused medikit scenarios pass. Browser checks cover real actor pickup into the HUD, visible WAD canvas, a pause longer than four seconds, expiry, Enter recall and Options suppression. All 12 browser tests passed (56.7 seconds), and the pickup screenshot was inspected.

## 2026-09-13 — projectile/charging-skull contacts (COMBAT-01)

Factored the original `PIT_CheckThing` projectile/skull branches into the movement path, checked at the candidate position before committing it and at `P_CheckMissileSpawn`'s initial half-tic step. Missiles ignore their shooter, explode without direct damage on the shooter's non-player species (including the baron/knight equivalence), stop on solid unshootable actors and retain vertical overlap checks. Charging skulls use the source's infinite-height actor contact, damage attribution to the skull itself and state reset. Fixed the substep wrapper restoring a charging skull's old momentum after a wall had stopped it.

Four regression scenarios cover same/different species, solid nonshootable objects, vertical separation, initial spawn impact, charging-skull contact and wall stop/reset. Scope remains partial: actor enumeration uses the port's actor list, not original blockmap ordering; substeps remain an approximation. Full missile autoaim, sky-wall impact behavior, collision/simulation ordering and executed C gameplay traces remain open. This does not close COMBAT-01 or the full-port gate.

Final validation for the combined slice: 52 unit tests, typecheck and production build pass; all 12 Chrome browser tests pass (56.6 seconds). Whitespace check passes. The existing bundle-size warning remains. Next priority is projectile aiming/sky behavior, then original tic ordering and reproducible campaign gameplay traces; wipes/title demos and other roadmap gates remain unfinished.

## 2026-09-13 — committed checkpoint and missile aiming/sky behavior

Committed accumulated progress as `35905a9` (`Checkpoint Doom campaign, menus, saves and fidelity corrections`). IWADs and generated artifacts were excluded; the working tree was clean immediately afterward. Staged whitespace checking found trailing spaces in the newly tracked vendor subset; removed those before committing, then rechecked PCM equivalence successfully.

**COMBAT-01.** Connected `P_SpawnPlayerMissile` autoaim: probe center, +5.625 degrees, then -5.625 degrees over 1024 units; select the first target's angle/slope, or retain the original heading with zero slope. Rocket/plasma/BFG vertical launch momentum uses FixedMul(speed,slope). Added `P_XYMovement`'s sky-wall exception by retaining the ceiling-limiting linedef from `PIT_CheckLine`; a blocked missile is removed when that linedef's original back-sector ceiling is sky. Ordinary impacts still explode. This follows the supplied Linux source's sky hack, including its limitations; it is not a generalized sky-plane rewrite.

**REF-01.** Added `scripts/reference-missile.mjs`, which compiles and executes the original `P_SpawnPlayerMissile` body with controlled aim/spawn/trig stubs. Four committed reference cases verify aim-probe order, fallback heading, spawn height and vertical momentum. Function SHA-256 and the stubbed scope are recorded in the fixture. These are executed C comparisons; they do not certify sight tracing, original trig tables, blockmap ordering or whole-engine parity.

Regression tests also exercise real port sight tracing against elevated/lower targets, both side probes, no-target fallback, blocked sightlines, and sky versus ordinary upper walls. Validation results follow.

Validation: 55 unit tests, all 12 Chrome browser tests (57.1 seconds), typecheck, four-track audio reference comparison and production build pass. Whitespace check passes. Follow-on missile changes remain separate from checkpoint `35905a9`. Existing bundle warning and broader completion gates remain open; next work is original tic ordering and deterministic gameplay traces, alongside remaining actor/special/presentation coverage.

## 2026-09-13 — player thinker ordering and complete source actor metadata

Committed the previous aiming/sky slice as `fa2bbb8`.

**LOOP-02.** Player input/view/sector/use/weapon phases now precede P_RunThinkers; physical player movement and its actor-state ticking run in the player's own THINGS insertion slot. Newly fired projectile thinkers can run in the same tic. Power counters expire after weapons and before actor thinkers, matching the source phase order. Pickups run inside the player actor phase rather than after every actor. Older saves without a player-thinker record receive one on loading. A sequencing regression verifies weapon/power ordering, one player movement, actor insertion order and same-tic appended work. Full collision-side-effect ordering and recorded ticcmd/C world traces remain open.

**ACTOR-01 / MAP-01.** Replaced hand-transcribed actor metadata with generated original info.c tables: 967 states and 137 types, with SHA-256 provenance and a reproducible generator. All Ultimate Doom map objects now resolve to source actor definitions. Pillars/trees/torches and blocking hanging bodies participate in collision; nonblocking hanging bodies retain their distinct flags. Dead-body sprites use the original terminal frames. Pickups and decorative animations are real actor thinkers. The state audit removed nine hand-transcription differences. Doom II definitions are included as data, not a Doom II gameplay-completion claim.

**SAVE-01.** New saves use schema version 2; version 1 remains loadable. A migration rebuilds only the surviving old static sprite indices as actors, preserving collected-item absence and source RNG indices. Legacy animation phase is retained where source loops correspond; original legacy gameplay was already approximate. Normal version-2 saves preserve actor/thinker order directly.

Validation so far: 59 unit tests, typecheck, production build and 36-map WAD smoke pass. The WAD smoke now also checks every map-object type and each used spawn-animation sprite chain. State-table audit reports zero mismatches. Targeted tests cover decorative solidity/ceiling positions, complete state references and legacy survivor migration. Browser results follow.

All 12 Chrome browser checks passed (57.3 seconds), including version-2 save/load and campaign routing with the expanded actor set.

**ACTOR-01.** Nightmare corpse respawn now follows `P_MobjThinker`/`P_NightmareRespawn`: 420-tic minimum, global level-time mask, original random gate, occupied-position refusal, two teleport fogs, source spawn flags/angle and 18-tic reaction delay. Lost souls do not respawn. `P_SpawnMobj` now consumes the source lastlook random draw; the player draw occurs in its THINGS slot. Two behavioral regressions cover these conditions. Full-engine RNG ordering remains unverified.

**PLAYER-01.** `P_GiveAmmo` now requests the source weapon preferences only when replenishing empty ammo. Berserk heals to 100 without reducing surplus health and requests fists. Single-player duplicate keys disappear without repeating the message; first acquisition resets bonuscount before the shared pickup increment, following `P_GiveCard`/`P_TouchSpecialThing`. Two regressions cover weapon preferences, deliberate weapon selection, berserk health and key/message behavior. Pickup collision-side effects still occur after the player's move rather than inside `PIT_CheckThing`.

Validation of the combined actor/ordering/pickup slice: 63 unit tests, typecheck, build, 36-map WAD smoke and zero-mismatch state audit pass. All 12 installed-Chrome browser checks pass (57.3 seconds). The freshly downloaded headless Chromium run hit a WebGPU `Instance dropped in popErrorScope` error during reload; an overlapping attempted rerun also invalidated its trace output. Installed Chrome remains the established passing browser; this does not close cross-browser validation.

## 2026-09-13 — binary-angle tables and scrolling-wall stability

Committed actor/ordering/pickup progress as `e66cb99`.

**FIXED-01 / COMBAT-01.** Generated original `tables.c` sine and slope-angle tables with source hash and reproducible generator. Movement thrust, player/weapon bob, projectile/skull momentum, aiming/shot/use rays, damage thrust and teleport fog offsets now sample source fine angles. `R_PointToAngle` octant and `SlopeDiv` behavior replaces selected gameplay atan2 calculations. A new C oracle executes the original functions against their original tables for 20 axis/octant/small-denominator cases. Every fine-angle index round-trips through the current radians boundary. Browser input angles and remaining floating-point collision geometry still prevent a full deterministic/demo-parity claim. Fixed integer division in the view-bob phase (`FINEANGLES/20` is 409 in C).

**RENDER-01.** Investigated the reported E1M1 armor-pedestal sides: lines 348–355 are eight type-48 scrollers, all beginning at sidedef x-offset 8, using TEKWALL1. `P_UpdateSpecials` advances each by one pixel per tic. The WAD starts the texture afresh on each face; a seamless world-space wrap would change the supplied map's mapping. Replaced accumulated Float32 UV increments with absolute wrapped sidedef coordinates to prevent endpoint drift and make rebuild/load behavior stable. Tests cover 5,000 updates, wrapped/negative offsets and geometry rebuilds. A real E1M1 browser test checks all eight rendered phases, pause, rebuild and resume, with an ignored screenshot artifact. Visual equivalence to a reference executable remains unverified; this is scoped synchronization evidence, not proof that every perceived seam matches the original rasterizer.

Follow-up to the user's continuity report: inspected all sixteen front/back SEGS on lines 348–355; every stored seg offset is zero. `R_StoreWallRange` adds sidedef textureoffset and seg offset, so a 32-unit face maps columns 8–40 at tic zero and its neighbor restarts at column 8. The original data does not define a cumulative wrap around the pedestal. The user's desired continuous appearance therefore remains distinct from source fidelity; the precision correction must not be described as resolving that perceived discontinuity.

**RENDER-01.** Added all original `P_InitPicAnims` wall/flat ranges, resolved in WAD directory order. `P_UpdateSpecials` translations now retain absolute directory-index phase and the eight-tic cadence, including the completed-tic/render boundary and materials created during sector rebuilds. Previously wall animations were absent and every flat sequence was forced to frame zero. Two tests verify initial identity, indexed phase, timing, mid-level material creation and restored tic counts. Validation: 68 unit tests, typecheck, build, WAD smoke and all 13 installed-Chrome browser tests pass (58.3 seconds); the pedestal screenshot was inspected after correcting the test camera's floor height. Existing bundle warning and headless-WebGPU reload concern remain open.

## 2026-09-13 — splash damage, player death and rebirth

**COMBAT-01 / PLAYER-01.** Removed the duplicate player-only radius damage path: the player now receives one `PIT_RadiusAttack` hit through the same sight test as other actors. Cyberdemons and spider masterminds retain source splash immunity. `P_DamageMobj` player rules now include the 1000-point god/invulnerability threshold, E1M8 special-11 lethal-damage clamp before armor, zero-damage pain checks and nonnegative HUD health. The actor retains negative overkill health. Eleven executed C cases compare health, actor health, armor/type, damagecount and lethal outcomes; inflictor/source are null and kill/pain actions are stubbed, so this does not certify thrust, infighting or whole-engine damage ordering.

**PLAYER-01 / FLOW-02.** Player death now applies source corpse flags/quarter height, canonical source state metadata, randomized initial death-state tics and immediate `P_DropWeapon`. Automap closes. Removed the three-second automatic restart: `P_DeathThink` waits for Use, then reloads the level in process with fresh player inventory and active controls. Fixed stale render-tic use after in-frame level changes. Attacker-facing death view and complete input/ticcmd fidelity remain open.

Corrected the shared synthetic map fixture's `segCount` typo to the actual `numSegs` field. Previously `P_CheckSight` did not walk those fixture segs; the new explosion/wall scenario exposed it. All existing tests still pass with the corrected fixture. Validation: 72 unit tests, typecheck, build and all 14 installed-Chrome browser tests pass (about one minute), including remaining dead beyond three seconds, menu pause while dead, Use rebirth and movement after rebirth.

## 2026-09-13 — original melt transitions

Committed damage/death/rebirth progress as `c1743e4`.

**UI-02.** Added `wipe_initMelt`/`wipe_doMelt` paired-column animation, including the original 320 cosmetic RNG draws and delayed completion tick. Transitions capture the game/weapon/HUD canvases and reveal intermission, the next level, new games/rebirth or finale art. The shared TicClock advances the melt while holding gameplay and presentation counters still; opening a menu pauses the wipe and reveals the menu, and held gameplay input does not leak through. Canvas composition adapts the source's 320×200 wipe to the browser viewport; it is not software-renderer pixel identity and does not capture every CSS tint or browser menu decoration.

The C melt oracle executes the original initialization, column transform and melt functions with scripted RNG, comparing every active-column position through completion. Three unit tests cover that trace, RNG separation and acceleration. Browser checks verify nonempty world capture, stationary world/presentation tics, menu pause/resume and completed transitions. All 36 campaign routes now wait through their real wipes. Validation: 75 unit tests, typecheck, build and all 15 installed-Chrome browser checks pass (2.9 minutes); the exit-melt screenshot was inspected. Title/credit/demo cycling remains open UI-02 work. New monster-attack regressions prepared after this validation currently reproduce the next slice's defects and are not included in this checkpoint.

## 2026-09-13 — monster aiming and Nightmare chase rules

Committed the melt slice as `31eba5d`.

**ACTOR-01 / COMBAT-01.** `A_PosAttack`, `A_SPosAttack` and `A_CPosAttack` now aim vertically before applying horizontal spread and use `P_LineAttack`'s actor-center-plus-eight firing height, including the taller spider mastermind. `A_Chase` turns one 45-degree octant at a time; finding a replacement player target returns for that action. Nightmare skips post-attack walking and can choose a missile attack while its movement countdown is nonzero; normal skills require exactly zero. `A_Look`/`A_Scream` now consume source gameplay RNG for voice variants and play cyberdemon/spider alert/death sounds at full volume.

Three regressions failed before the changes and pass afterward: elevated hitscan targets for four actor types, octant turn/post-attack Nightmare RNG, and skill/countdown missile gates. A fourth checks voice RNG without an audio device. Validation: 79 unit tests, typecheck and build pass; targeted E1M1 actor/automap browser check passes (4.4 seconds). These remain source-derived scenarios, not full C actor traces. Next priorities include remaining audio/lifecycle behavior, source special-family scenarios and deterministic replay; title demos and full campaign combat evidence remain open.

## 2026-09-13 — sound channels, movement effects and intermittent teleport audio

**AUDIO-01 / SPEC-02.** Generated the complete `sounds.c` effect inventory, including `sgcock` and linked aliases. `S_StartSound`/`S_UpdateSounds` now use Doom horizontal distance and stereo separation, eight priority-controlled channels, persistent actor/sector origins, source pitch variation and explicit cleanup. Effects cannot resume a suspended audio context. Floors/stairs now emit movement/stop effects; moving sectors use the shared level tic for the source eight-tic cadence. Level loading stops previous effects.

The user's intermittent teleport report reproduced a listener snapshot defect: a distant destination was rejected using the pre-teleport position, then the departure effect was culled after the listener update. The sound manager now retains the authoritative player actor and reads its position when starting effects, matching `S_StartSoundAtVolume`'s access to `players[consoleplayer].mo`. `EV_Teleport` and Nightmare respawn associate sounds with their fog actors. The real teleport-path regression covers nearby and distant destinations, fails before the fix, and passes afterward.

Executed C `S_AdjustSoundParams` fixtures cover ten distance/separation cases with original angle routines/tables. Validation: 85 unit tests, typecheck, build, 36-map WAD smoke and four-track PCM comparison pass. All 16 installed-Chrome browser tests passed for the audio slice; the focused audio pause/teardown test was rerun after the teleport fix and passes. No claim of original hardware mixer/resampler or audible recording parity; listening and browser/device coverage remain open. Next work: source special dispatch/family scenarios and deterministic gameplay traces, followed by remaining title/demo and campaign gates.

## 2026-09-13 — projectile trigger exclusions and switch retrigger behavior

Committed audio and the user's intermittent teleport fix as `2de5bdc`.

**SPEC-01 / SPEC-02.** `P_CrossSpecialLine` now excludes the six projectile types named in the supplied source before dispatching monster-permitted specials. `EV_Teleport` independently rejects `MF_MISSILE`. Regression coverage exercises all six projectile types against seven monster-permitted walk triggers and confirms monsters can still open doors. The pre-fix rocket consumed special 4.

`P_ChangeSwitchTexture` now clears one-shot specials even without matching artwork, searches original switch-list order before wall texture position, and changes repeat-button artwork before `P_StartButton` duplicate-timer suppression. Repeated gun hits retain the first 35-tic timer. Switch activation uses the source's sound selection, including the supplied source's special-11 check after one-shot clearing. Tests reproduced missing one-shot clearing and suppressed repeat texture flips before the changes. These are source-derived behavioral tests, not executed C switch/dispatch parity. Source button-list capacity and sound-origin quirks remain unaudited.

Validation: 88 unit tests, typecheck, build and three installed-Chrome checks (exit intermission, exit melt/menu pause, audio teardown) pass. Next: broader IWAD-used special-family scenarios and deterministic gameplay traces; campaign combat, title demos and release gates remain open.

## 2026-09-13 — continuous armor-pedestal scrolling surface

**RENDER-01.** The repeated user report identified the gap in the previous regression: equal tic phases do not prove spatial continuity. Added general closed-loop mapping for special-48 faces sharing sector adjacency, texture and initial offsets. UV origins now accumulate along oriented edges, and horizontal scale fits a whole number of repeats around the loop, including the last-to-first seam. Simulation sidedef offsets remain authoritative and unchanged; rebuilds retain the same mapping. Open/branched chains and individually offset faces retain their original mapping.

This is an explicitly documented presentation adjustment to satisfy the requested continuous effect. It is not source-renderer parity: supplied E1M1 per-face offsets reset the texture, as previously recorded. The earlier Float32 phase fix addressed numerical drift only. No WAD data is rewritten.

Validation: 90 unit tests, typecheck, build and 36-map WAD smoke pass. The installed-Chrome E1M1 pedestal check now asserts every adjoining UV endpoint modulo texture repeats, including closure, and checks pause/rebuild/resume. Rendered screenshot inspected. Synthetic tests cover late/wrapped tics, matching loop closure and exclusion of open, branching, differently offset or non-scrolling faces. Remaining roadmap priorities are unchanged: source-special scenarios, deterministic gameplay traces, title demos and campaign/release gates.

## 2026-09-13 — full-view sky and outdoor visibility masking

**RENDER-01.** Replaced the finite open sky cylinder/top disk with a camera-centered sphere using direction-based sampling. The sky fills steep upward and downward views; horizon row 100, four horizontal repeats and full-bright texture color remain. Free-look pole rows clamp, an explicitly documented presentation adaptation rather than original vertical-wrap parity.

The old builder omitted `F_SKY1` ceilings, exposing distant level geometry. Following `R_DrawPlanes`' sky coverage role, outdoor ceilings now draw the same directional sky while writing depth. Sky curtains above one-sided outdoor boundaries hide unrelated map geometry beyond those boundaries. Both sky surfaces and background share projection. Materials/textures are disposed during level teardown.

A rendered-pixel browser regression checks all pixels at five pitches from -89 to +89 degrees, distant red geometry hidden behind sky ceilings/boundaries, and foreground red geometry still visible. Masked-wall transparency remains checked. Initial synthetic rendering failed because the test loaded a second raw Three.js build alongside Vite's application TSL instance; tests now resolve Three through Vite consistently, and shader errors are asserted absent. E1M1 rendered screenshot inspected. The specific outdoor location reported by the user is not yet supplied; the reproduced sky visibility defect is fixed, while unrelated missing textures/geometry remain subject to location-specific verification.

Validation: 90 unit tests, typecheck, build and 36-map WAD smoke pass; all 17 installed-Chrome browser checks pass (3.0 minutes), including all 36 map routes and the new sky coverage/occlusion regression. Remaining roadmap work includes broader screenshot comparisons, special-family scenarios, deterministic gameplay traces and campaign/release gates.

## 2026-09-13 — circular thumb action areas

**MENU-01 / UI-01.** Replaced rectangular sprint/fire regions with separate 80–120px circles near the lower left/right edges. Actual hit testing measures the rendered circle, including its radius; starting a drag inside keeps sprint/fire active while moving/aiming until release. Responsive layout respects edge safe areas. Hints remain visible after use, and help text describes the circles.

Validation: 90 existing unit tests, typecheck and build pass. Chrome mobile browser checks cover portrait/landscape dimensions, circular center versus bounding-box corner hit tests, release/cancel and toolbar separation; touch menu pause also passes. Portrait screenshot inspected. This checks emulated touch behavior; physical-device comfort remains a release check. Next: missing source light/floor/platform trigger variants, then deterministic gameplay comparisons. New special regressions prepared after mobile validation reproduce those next-slice gaps and are excluded from this checkpoint.

## 2026-09-13 — missing special variants and executed lighting traces

**SPEC-01 / SPEC-02.** Connected previously missing cross specials 12, 17, 79–81, 84 and 92–96, plus use specials 55, 66–68, 131–132 and 138–140. These cover brightest/dark/full lights, triggered slow strobes, repeat floor/texture changes, repeat platforms, crushing/turbo/512-unit floors and light buttons. `EV_StartLightStrobing` checks sector occupancy, clears sector specials and uses source RNG/timing. `PTR_UseTraverse` now emits `noway` on blocked ordinary walls/openings.

Three regression groups reproduced missing dispatch and now pass, covering actual mover creation, repeat/one-shot behavior, button artwork, strobe cadence and busy-sector rejection. `scripts/reference-lights.mjs` executes original `T_FireFlicker`, `T_LightFlash`, `T_StrobeFlash` and `T_Glow` with original RNG table; 140 tics per case compare brightness, counters, direction and RNG index. This verifies thinker execution under controlled initial state, not complete map dispatch or geometry parity.

Validation: 94 unit tests, typecheck and build pass; installed-Chrome actor/automap and exit/intermission tests pass. Next: mobile tap-to-use/weapon-wheel steering, then deterministic input and remaining gameplay/reference gates. Full roadmap completion remains open.

## 2026-09-13 — tap-to-use and held weapon wheel

**MENU-01 / UI-01 / PLAYER-01.** A short stationary gameplay tap outside the sprint/fire circles now queues Use. Dragging, cancellation, action-circle touches and weapon-wheel gestures do not produce Use. Holding the aiming side for 450ms opens a wheel of owned weapons; drag to highlight and release to equip, or release in the center/cancel/open the menu to dismiss. Aim stays fixed while the wheel thumb selects. Wheel choices fit within the viewport and eight Ultimate Doom weapon labels do not overlap. Discrete Use/weapon requests remain queued until a simulation tic consumes them, avoiding lost taps on render frames without a tic.

`P_PlayerThink` permits selecting an owned empty weapon; removed the old ammo restriction on manual selection. Explicit touch slots select chainsaw/super-shotgun without relying on number-key toggling. A gameplay regression reproduces the empty-weapon defect and verifies completed weapon changes. Holding only schedules gesture presentation; simulation and weapon changes still run through TicClock.

Validation: 95 unit tests, typecheck and build pass. Four Chrome browser checks cover touch pause, save persistence, circular action zones and the new tap/wheel path. The latter opens an actual E1M1 door with a tap, switches to fist, excludes unowned weapons, checks aim/fire isolation, cancels on drag/touchcancel/menu and checks all eight labels for overlap. It passed again after the final wheel layout adjustment. Screenshot inspected. Physical-device comfort and broader roadmap completion remain open; next engineering work is deterministic reference input/traces and remaining gameplay behavior.

## 2026-09-13 — original demo input and repeatable gameplay traces

**REF-01 / LOOP-02 / UI-02.** Added strict version-109 single-player demo decoding and signed command-to-input conversion. Five executed `G_ReadDemoTiccmd` C cases verify signed movement, signed short turns, button bytes and end-marker handling. Unsupported multiplayer/command-line rules and pause/save command bytes fail explicitly. This is input-format evidence, not original-engine playback parity.

Development inspector `__doomReplay(name, limit)` now feeds WAD demo commands through the actual TicClock/player/weapon/actor loop and records bounded per-tic gameplay traces (up to 350 tics). Menus freeze playback; ordinary input is disabled. Two runs of the first 70 DEMO1 tics compare player, actor, sector, sidedef, gameplay RNG and weapon state, including a pause and a deliberately different render-frame/tic batching schedule.

The first comparison exposed render-frame mutation of weapon bob coordinates. Moved bob calculation into `A_WeaponReady` during weapon ticks, including muzzle-flash coordinate propagation. The complete recorded traces now match. Original C world traces and title/credit/demo cycling remain open; this developer replay path does not mark UI-02 complete.

Validation: 98 unit tests, typecheck and build pass. Save/load, mobile tap/wheel and demo browser checks pass; the demo comparison passes again with altered frame batching. Next: build a headless original-source world oracle to identify the first actual gameplay divergence, then resolve remaining fidelity and campaign gates.

## 2026-09-13 — executed original C world traces and first gameplay corrections

**REF-01 / LOOP-02 / ACTOR-01 / ACTOR-02 / PLAYER-01.** Built a headless hosted original-source engine against the supplied IWAD. The driver executes `P_Ticker`; graphics/audio-device/network I/O are stubbed. Explicit host ABI adaptations affect generated copies only, with original/compiled hashes, compiler flags, IWAD and host provenance retained locally. AddressSanitizer passes the bounded 350-tic run. This is not a DOS executable or `G_Ticker` presentation oracle.

The comparison exposed and corrected `P_InterceptVector2` products being truncated to 32 bits before their fixed-point shift, `P_SpawnMobj` incorrectly initializing movedir to DI_NODIR instead of zero/DI_EAST, missing `P_MovePlayer` walking-state transitions and `P_XYMovement` command-aware stopping, and nonzero initial weapon sprite X. Regressions cover the raised-floor sight opening (fails with the old arithmetic), first chase rotation, walking phase timing, teleport reaction delay and command-aware stopping.

Captured player/actor state now matches original C through DEMO1 tic 108. A 350-tic port replay remains repeatable across changed frame batching and pause, but C comparison first fails at tic 109 in player wall sliding. Later divergence is not treated as independent evidence until the first failure is fixed. The comparison gate checks all captured actor fields/counts as well as player fields and trace length. Next: replace `P_SlideMove`'s floating-point approximation with original fixed intercept/projection behavior, then extend the trace again. Broader roadmap and release gates remain open.

Validation: 101 unit tests, typecheck and production build pass. All 19 installed-Chrome browser checks pass (3.3 minutes), including all 36 campaign routes, mobile input and replay. The default 70-tic C comparison passes; the separately exercised 350-tic comparison deliberately fails at the documented first divergence. Local WAD/source/generated artifacts and unrelated favicon edits are excluded from this checkpoint.

## 2026-09-13 — source sliding projection, split rounding and step support

**PHYS-01 / PHYS-02 / LOOP-02.** Replaced floating wall projection with `P_HitSlideLine`'s approximate distance and fine-angle fixed products. Thirty-two executed C fixtures cover wall slopes, sides and momentum directions. Sliding now uses fixed intercept/approach/remainder arithmetic and original two-attempt/stairstep momentum behavior. Full source blockmap candidate ordering and exact segment tests remain open; this is not whole-collision parity.

The extended trace exposed a one-unit negative-odd movement split error at tic 170: C divides the first half toward zero then shifts the remainder. A failing regression now passes with that ordering and the source positive-component split condition. At tic 186 an enemy straddling a step lost its collision floor because a per-tick centre-sector refresh replaced the bounds maintained by `P_TryMove`/`P_ThingHeightClip`. Removed those redundant refreshes; the step-support regression now passes.

All captured original C/player/actor fields agree through DEMO1 tic 209. Tic 210 has three original hit-effect actors absent from the port and a gameplay-RNG mismatch; inspection confirms `P_LineAttack` currently omits puff/blood spawning. That is the next slice. The original C 350-tic comparison still correctly fails; later differences remain downstream.

Validation: 104 unit tests, typecheck and build pass. Installed-Chrome monster movement, mobile tap/weapon wheel and 350-tic replay checks pass, including pause and changed frame batching. Extended traces have a dedicated timeout after the initial 45-second smoke limit proved too short. The preceding full 19-check browser suite passed at the first world-oracle checkpoint.

## 2026-09-13 — hit effects and passing 350-tic original world comparison

**COMBAT-01 / PLAYER-01 / LOOP-02.** Connected `PTR_ShootTraverse` wall/thing impacts to source-style `P_SpawnPuff` and `P_SpawnBlood`: original nearer-impact offsets, vertical jitter, four RNG draws including spawn/lifetime, upward momentum, damage-dependent blood states and punch puff state. Sky-wall impacts suppress puffs. Effects spawn before damage, including zero-damage traces. Gameplay tests cover wall/target/no-blood/sky paths and state/lifetime/RNG boundaries.

Missing effects explained the three absent actors and twelve missing RNG draws at DEMO1 tic 210. With those restored, all captured player fields and gameplay RNG match through tic 350. The remaining 141 actor differences were solely player `MF_JUSTHIT`; `playerPainCheck` now sets it on a successful roll. A regression also covers random value 255, which correctly skips pain.

The complete 350-tic original C comparison now passes with zero captured player or actor differences. Scope remains the documented hosted-source field set, not whole-engine/DOS parity: target links, inventory, sectors and longer/cross-map command streams need C comparisons. Next: expand that trace coverage and continue remaining actor/player behavior, title demos, save/special scenarios and release gates. The full-port milestone remains open.

Validation: 107 unit tests, typecheck and build pass. Installed-Chrome monster movement, death/Use-rebirth and 350-tic repeatability/pause checks pass (59.7 seconds). The separately executed original C comparison passes all 350 tics. No commercial assets or local trace artifacts are committed.

## 2026-09-13 — broader trace fields and all-episode demo sampling

**REF-01 / LOOP-02 / PLAYER-01.** Extended C comparison to actor targets, inventory/powers/counters, sector geometry/light/special state and sidedef offsets. Corrected the trace adapter's no-change weapon enum to original `wp_nochange` (10). All added world/inventory fields matched the existing DEMO1 run; the new target field exposed the player damage path returning before `P_DamageMobj`'s wake/target update.

Player and monster damage now share that tail, preserving immunity, lethal-hit and target-threshold exclusions. Player state synchronization also handles random value 255 skipping pain before the wake transition. Regression scenarios cover those boundaries. Expanded DEMO1 matches all captured fields through 350 tics.

All four episode demos now have 350-tic port-repeatability/pause checks. Trace polling/transfer was made cheaper and longer streams up to 4000 commands are supported. C comparisons deliberately remain failing for DEMO2 (projectile position, tic 103), DEMO3 (player fixed thrust, tic 168) and DEMO4 (sight/RNG, tic 1). Next: source projectile subdivision, exact command thrust and the missing REJECT connection, then extend the recordings.

Validation: 109 unit tests, typecheck and build pass; four installed-Chrome demo checks pass (1.2 minutes). DEMO1's expanded C gate passes; the three newly exposed episode mismatches are recorded, not waived. Full campaign and presentation/release gates remain open.

## 2026-09-13 — cross-episode movement, AI and weapon corrections

**LOOP-02 / PHYS-01 / ACTOR-02 / COMBAT-01 / SAVE-01.** Original-world comparisons now pass every captured field for the first 350 tics of DEMO1, DEMO2 and DEMO3. DEMO4 agrees through 157; its first remaining divergence is an enemy waking at tic 158, with downstream RNG differences. These remain short hosted-C samples, not complete demo or campaign parity.

Fixed command thrust rounding, original `P_XYMovement` projectile subdivision, `P_PathTraverse` fixed blockmap sliding, the missing REJECT connection, and `P_LookForPlayers`' four-slot scan timing. `P_SetThingPosition` ordering now determines collision candidates and persists through save/load; this corrected a projectile hitting the player instead of a monster. Weapon timing now consumes the current tic's attack command, preserves action-replaced zero-tic psprite states, synchronizes player attack states and retains source refire cadence. `P_BulletSlope` is sampled once per shot at the original 1024-unit aim range; seven shotgun pellets no longer retarget vertically after killing their first target. Super-shotgun vertical spread also consumes its original RNG pair.

Added `npm run verify:world -- 350` to compare existing browser captures against fresh C runs for all four demos, retaining separate ignored provenance/reports. It deliberately fails while any demo differs. Full hitscan blockmap ordering, three-angle bullet autoaim, longer recordings and presentation/campaign/device gates remain open. Next: investigate DEMO4's first sight/wake difference, then extend recordings.

Validation: 119 unit tests, typecheck and production build pass. All four 350-tic browser replay checks pass, including pause and changed frame batching. The preceding save/load and mobile checks passed with the new collision-link persistence; all 36 WAD maps pass smoke verification. The C gate passes DEMO1–3 and correctly fails DEMO4 at tic 158.

## 2026-09-13 — original sight boundary behavior

**ACTOR-02 / LOOP-02.** `P_DivlineSide` in the supplied original C tests `x == node->y` in its horizontal branch. Preserving that quirk fixes DEMO4's premature enemy wake at tic 158 and extends agreement through tic 216. A direct boundary regression distinguishes it from the geometrically conventional Y test. Raised-floor and explosion-occlusion fixtures now sit one unit off that boundary so they continue to isolate their intended behavior.

The next divergence, tic 217, is a shotgun pellet hitting an actor whose centre lies outside the traversed blockmap cells. The current hitscan path scans all actors; replacing it with source cell ordering is the next work item. This is a source-compatibility finding, not evidence of full sight or demo parity. Typecheck, 120 unit tests and build pass; all 22 installed-Chrome browser checks pass (4.2 minutes), including all four replay comparisons, campaign routing, saves and mobile controls. All 36 maps pass WAD smoke verification.

## 2026-09-13 — all four 350-tic C comparisons pass

**COMBAT-01 / PHYS-01 / LOOP-02.** Hitscan and autoaim now use the shared fixed `P_PathTraverse` walk, collecting each cell's lines followed by actors in `P_BlockThingsIterator` link order. Stable fraction ordering retains cell/list order for ties. Impact coordinates also use the source boundary-nudged ray. Removed the duplicate floating traversal and global actor scan. A regression verifies that an actor whose radius overlaps the ray but whose centre occupies an unvisited cell is skipped, while an actor in a visited cell is eligible.

This resolves DEMO4's shotgun divergence at tic 217. All four original-world comparisons now pass all captured fields through 350 tics. This is 1400 compared tics across four maps, not complete recordings or campaign parity. The next gate is longer/full recordings; three-angle bullet autoaim, blockmap dummy-header semantics and uncaptured state remain explicit follow-ups.

Validation: typecheck, 121 unit tests and build pass; four refreshed 350-tic browser repeatability/pause checks pass (1.2 minutes), and `npm run verify:world -- 350` passes for all four demos. The immediately preceding full 22-check browser suite passed; this traversal-only change was checked with the four gameplay replays.

## 2026-09-13 — longer-trace failure evidence and WebKit mobile checks

**REF-01 / LOOP-02 / COMBAT-01 / MENU-01.** Executed longer original C comparisons across every episode. DEMO1's complete 1710-command recording and DEMO4's complete 818-command recording are port-repeatable across pause/frame schedules, but first differ from C at tics 463 and 368 respectively (RNG). DEMO2 first differs at tic 600 in fist targeting and eventually reaches rebirth at 1769; DEMO3 first differs in damage at 417 and reaches rebirth at 3194. These partial traces are retained and are not reported as complete recordings. The large DEMO3 second run was interrupted after the first trace was retained; long-sample repeatability remains unverified.

Fixed the diagnostic lifecycle: rebirth/exit pauses replay and preserves its trace; starting a fresh replay clears that stop. The browser harness writes evidence before rejecting an early boundary, and optional accelerated clock input shortens long diagnostic runs. C reports retain both original and port trace inputs. Added a dedicated retained-trace/restart browser regression; normal death/Use-rebirth still passes.

WebKit initially failed because the test harness constructed `Touch` objects, which that engine rejects. Replaced that harness-only construction with portable synthetic touch events. The same three checks now pass in Chrome and WebKit: menu pause/input clearing, circular action areas and top-right layout, and tap Use/hold-drag-cancel weapon selection. Added `PLAYWRIGHT_BROWSER=webkit` and optional local server reuse to the test configuration. Physical-device coverage is still pending, explicitly listed with all 36 combat playthroughs in RELEASE-CHECKS.md.

Typecheck, 121 unit tests and production build pass. Chrome and WebKit each pass the three mobile checks; the two replay/normal-rebirth lifecycle checks pass. Longer C gates correctly remain failing at the boundaries above. All four refreshed 350-tic repeatability/pause checks and the retained-trace/restart check pass (five checks, 1.3 minutes). Next: source melee behavior and the other first longer-trace differences, then further presentation, special/save scenarios and campaign/device gates.

## 2026-09-13 — original fist spread and target-facing

**COMBAT-01 / PLAYER-01.** `A_Punch` now consumes the original two spread draws, aims along that spread ray, plays its hit sound only after a hit, and turns toward the struck actor using the source angle function. `P_LineAttack` returns its hit target so weapon actions can apply that behavior. Browser look controls preserve the resulting turn without resetting pitch; source-driven recorded commands use the updated actor angle next tic.

DEMO2 now passes the explicit 700-tic C gate. Its extended trace agrees through tic 1335, then first differs in a dead imp's XY position at 1336. Inspection finds ordinary actor knockback still skips `P_XYMovement` subdivision, unlike the already-corrected projectile branch; that is next. The full recording still reaches rebirth and is not a full-demo pass.

Validation: typecheck, 122 unit tests and build pass. The 700-tic DEMO2 repeatability/pause check, mobile tap/wheel check and dedicated weapon-turn/preserved-pitch browser check pass. Regressions cover punch RNG, matching aim/fire rays, hit-facing and unchanged facing after a miss. Broader completion gates remain open.

## 2026-09-13 — ordinary knockback subdivision and corpse ledges

**PHYS-01 / COMBAT-01 / LOOP-02.** Ordinary actors now share `P_XYMovement`'s clamped, signed subdivision with missiles, applying friction once after all steps. A blocked second half preserves the first half's movement. Corpse momentum is retained when collision support straddles a ledge above the centre sector's floor. Tests cover positive/negative split asymmetry at a wall, once-per-tic friction and corpse ledge sliding.

DEMO2 now completes all 2347 commands and its two port recordings agree across frame schedules and pause. Original C agrees through 2270 tics; the next first mismatch is player angle at 2271. The earlier knocked-back corpse divergence at 1336 is resolved. Typecheck, 124 unit tests and build pass; full DEMO2 browser repeatability passes. Next: centre-sector floor contact for DEMO3 environmental damage, then remaining first trace failures.

## 2026-09-13 — damaging-floor centre contact

**PLAYER-01 / PHYS-01 / LOOP-02.** `P_PlayerInSpecialSector` now compares player Z with the centre sector's actual floor, matching C. Collision support can remain on an adjoining higher step, and must not trigger damage from the lower hazardous floor before landing. A regression checks that boundary, landing, and the 32-tic damage cadence.

DEMO3 now agrees through tic 921; the next difference at 922 is turning during teleport recovery. Typecheck, 125 unit tests and build pass. Its 1000-tic port replay and the complete DEMO4 replay pass repeatability/pause checks. C comparisons still correctly fail at the documented DEMO3 angle and DEMO4 sight/RNG differences. Next: freeze source player turning and weapon/use aim during teleport reaction time.

## 2026-09-13 — teleport reaction-time turning and aim

**PLAYER-01 / COMBAT-01 / LOOP-02.** `P_PlayerThink` now holds actor angle as well as thrust while teleport reaction time counts down. Weapon and Use aim follow the actor's angle rather than unaccepted input turns. A regression fires during recovery, checks frozen thrust/angle and verifies turning resumes afterward.

DEMO3 agreement extends through tic 993. Its next first mismatch at 994 is the Baron's final attack angle. Inspection additionally found `A_FaceTarget`'s partial-invisibility spread has twice the source angular scale, and `P_SpawnMissile` lacks its separate shadow-target randomization; these are independent source gaps, not yet a diagnosis of tic 994. Typecheck, 126 unit tests and build pass; the 1500-tic browser repeatability/pause check and mobile look-pitch integration check pass. Those two invisibility paths are the next slice.

## 2026-09-13 — Baron attack facing and partial-invisibility aim

**ACTOR-01 / COMBAT-01 / LOOP-02.** Removed an extra `A_FaceTarget` call from `A_BruisAttack`; original Baron/knight states face before the final launch action. That extra turn caused the DEMO3 tic-994 mismatch. Independently corrected `A_FaceTarget` shadow spread from twice the source scale to shift 21, and added `P_SpawnMissile`'s separate shift-20 shadow aim draws after spawning. Regressions cover facing preservation, independent missile aim and exact RNG counts with/without shadow targets.

The complete 3863-command DEMO3 recording is port-repeatable; C now agrees through 2035 tics and first differs in blood height at 2036. The missing `P_BulletSlope` side probes are next. Typecheck, 129 unit tests and build pass. Long browser assertions pass, but the worker stalled after reporting success and required termination during cleanup; this is an unresolved runner/performance gate, not a clean shutdown pass. Shorter runs exit normally.

Long captures now compress JSON before browser-protocol transfer and disable duplicate Playwright protocol tracing above 350 commands; raw gameplay JSON remains the comparison input. Compression preserved the paired trace hash, but did not resolve the long-run shutdown stall. Keep that limitation explicit while continuing source comparisons.

## 2026-09-13 — connect retail title, credits and recorded demos

**UI-02 / MENU-01 / LOOP-01.** `D_DoAdvanceDemo` / `D_PageTicker` now drive TITLEPIC, DEMO1, CREDIT, DEMO2, CREDIT, DEMO3, DEMO4 and wrap to TITLEPIC. Page timers use the original 170/200 decrement-below-zero behavior; recorded commands advance via the existing TicClock and real world simulation. Title music uses D_INTRO, demos select map music, and credits retain preceding music. Production playback does not accumulate diagnostic world traces. A recording boundary advances the cycle rather than restarting a playable game.

The initial menu remains visible as requested. “Watch demos” dismisses it; keyboard input or a tap opens the menu and pauses playback/audio. Demos are not user games: save/end/resume-game actions are excluded. Starting or loading a game leaves playback. This is a connected presentation sequence, not a claim that all recorded combat matches C or that source transition rendering is pixel-identical.

Validation: 132 unit tests and build pass; typecheck passes. Four existing Chrome menu/mobile checks pass. The new full-cycle browser test passes through all four complete recordings, checks paused title/demo state, absence of trace accumulation, and starting a normal game afterward (23.1 seconds, clean process exit). Its initial music assertion needed polling for asynchronous AudioContext resume; the updated check passes. The previous long diagnostic worker remained stalled after successful assertions and was terminated; that separate cleanup issue remains open.

The previously prepared P_BulletSlope centre/positive/negative autoaim probes are retained with their behavioral test; their refreshed C comparison remains pending and is not claimed passed. Roadmap priorities now put missing HUD/presentation, gameplay/special/save coverage and campaign/release gates ahead of progressively longer source traces. Next: HUD face reactions and source timing.

## 2026-09-13 — HUD face direction, priorities and timing

**UI-01 / PLAYER-01 / SAVE-01.** Extracted `ST_updateFaceWidget` into a tic-driven HUD model. Damage faces use the actual last attacker, independently of the actor's AI target; environmental/self damage faces forward. Restored the two-second sustained-fire delay, original face priority/countdown behavior, god-cheat face, cosmetic RNG and level/load reset. The supplied source's health-difference sign for the rare ouch face is retained. Attacker links are serialized as actor indices, validated, and restored; older saves without the field default to no attacker.

Validation: typecheck, 135 unit tests and build pass. Source-derived face tests cover directions, damage persistence, sustained fire/release, grin duration, god/death precedence and reset. The 40-tic save continuation scenario now includes the separate attacker link. Three Chrome checks pass: rendered god/dead faces/reset and menu pause, real save/reload, and death/Use-rebirth (15.9 seconds, clean exit). Full HUD/palette/automap parity remains open. Next: replace approximate damage/pickup/suit overlays with the supplied PLAYPAL transforms.

## 2026-09-13 — authored damage, pickup and suit palettes

**UI-01 / RENDER-01.** Replaced approximate translucent color overlays with `ST_doPaletteStuff`'s original palette selection and the supplied fourteen PLAYPAL palettes. The WAD's per-channel byte mappings are applied to the world, weapon, status bar and messages through sRGB component-transfer filters. This corrects missing weapon/HUD tint and the old palette-strength approximation. Original palette colors retain their authored mappings; intermediate antialiased colors interpolate. Nonseparable replacement palettes are explicitly rejected rather than silently misrendered; the supported supplied Ultimate Doom IWAD is separable. Invulnerability/infrared colormaps and weapon extra lighting remain separate open work.

Validation: 137 unit tests, typecheck, build and all-36-map WAD smoke pass. Browser screenshots of all 256 original colors under damage, pickup and suit palettes match the corresponding WAD values within one RGB byte in both installed Chrome and Playwright WebKit. Chrome HUD/mobile checks and WebKit mobile-layout checks also pass; both browser runs exit cleanly. Physical-device performance remains unverified. Next: known chainsaw and empty-ammo weapon behavior, followed by remaining presentation/special/save coverage.

## 2026-09-13 — chainsaw contact, empty-ammo fallback and monster door rules

**COMBAT-01 / PLAYER-01 / ACTOR-01 / SPEC-01.** `A_Saw` now uses the original damage/spread draw order, MELEERANGE+1 fixed-unit reach, matching aim/fire ray, distinct hit/miss sound, target-facing adjustment and MF_JUSTATTACKED. `P_PlayerThink` consumes that flag on the following tic to apply the source forward pull while preserving attack/use buttons. `P_CheckAmmo` now includes rocket/BFG fallbacks and retail restrictions/thresholds; plasma flash chooses the original random low bit. `P_Move` / `P_UseSpecialLine` now reject secret doors and distinguish accepted monster use from successful unlocking; locked monster attempts are silent.

Validation: typecheck, 141 unit tests and build pass. Regressions cover melee reach, aim/spread/hit/miss, next-tic pull/input propagation, fallback priorities, locked/manual/secret monster doors. Three Chrome gameplay/mobile checks passed before the input-propagation correction; the two affected mobile tap/weapon-turn checks passed afterward (10.3 seconds). The new pull test initially caught Koota input snapshots requiring an explicit world.set; it passes after that correction. Long C recording equivalence remains unclaimed. Next: invulnerability/infrared colormaps and weapon lighting, then special/save and campaign coverage.

## 2026-09-13 — indexed power colormaps and weapon lighting

**UI-01 / RENDER-01 / COMBAT-01 / SAVE-01.** Sprite parsing now retains palette indices. World and actor materials perform COLORMAP/palette lookup in node shaders, with shared controls for `P_PlayerThink` invulnerability/infrared priority and expiry blink. `A_Light0/1/2` now drive muzzle lighting and persist through saves (legacy saves default to zero). Actor full-bright flags and the weapon overlay use the same fixed-colormap rules. Weapon frame caching is bounded; effect changes do not rebuild world textures. Explicit sRGB atlas encoding corrects treating authored RGB bytes as linear colors.

Validation: typecheck, 143 unit tests, build and all-36-map WAD smoke pass. Full Chrome suite: 25 checks pass (3.9 minutes), including all 36 lifecycle routes, every finale, saves, input/mobile, masks/skies, full attract cycle and shader/palette comparisons. WebKit's five existing mobile/palette checks pass; the new shader check also passes on native/default and forced WebGL paths after capture synchronization. WebKit initially returned stale canvas copies when several WebGPU renders/copies occurred in a single JavaScript task; the test now waits for a render frame and GPU submission completion before reading pixels. Fourteen 256-color comparisons (ordinary/flash/power/blink/full-bright) match WAD values within one byte.

This establishes connected colormap effects, not original distance-light falloff or full visual parity. Base sector brightness remains the existing approximation, with flash level applied on that scale. Source distance attenuation, directional wall shading, automap discovery, broader scene comparisons and physical-device performance remain open. Next: crusher contact effects and death-camera behavior, then wider special/save scenarios.

## 2026-09-13 — crusher contact effects and death view

**PHYS-02 / PLAYER-01 / RENDER-01.** `PIT_ChangeSector` now switches crushed corpses to S_GIBS, keeps zero-sized nonsolid remains, removes dropped objects, and sprays source-style MT_BLOOD on four-tic crushing damage events. Player corpse state synchronization preserves externally applied gib state. `P_DeathThink` turns toward the actual killer in five-degree binary-angle steps, holds damage tint until facing them, and clamps the sinking view above the floor/below the ceiling.

Validation: typecheck, 145 unit tests and build pass. Regressions cover crushing cadence/blood, non-crushing obstruction, corpse/dropped-item outcomes, killer-facing/damage decay and view limits. Three Chrome save/death/mobile-look checks pass (15 seconds), plus a connected killer-facing/pause check (4.7 seconds). The full 25-check Chrome suite passed at the preceding lighting checkpoint. Next: continued save traces across active special families, projectiles and power expiry; campaign and device release gates remain open.

## 2026-09-13 — active save scenarios and bounded WAD setup

**SAVE-01 / MAP-01.** Added five continued-save scenarios spanning active doors, lifts, crushers, stairs and player death, each with real thinker/weapon ticks, projectiles, actor/attacker links, keys/secret state and expiring powers. After JSON restoration, every captured world/player/weapon field matches the uninterrupted run for 160 tics per scenario. This expands synthetic coverage; campaign saves and all possible thinker combinations are not thereby verified.

Map record parsers now reject incomplete records instead of reading into the next lump. BLOCKMAP checks bound dimensions, offsets and terminators to the lump; shared lists are decoded once. Patches bound column offsets/posts and texture/PNAMES definitions check sizes and references before allocation. Level setup validates geometry links, subsector ranges, BSP children/cycles, blockmap line references and REJECT length. Invalid setup reports a readable error instead of hanging traversal. Texture patch lookup now follows W_CheckNumForName's last-lump override even when the replacement is outside patch namespace markers. The existing BLOCKMAP dummy-header compatibility difference is unchanged.

Validation: typecheck, 154 unit tests and production build pass. The supplied IWAD passes all 36 maps and 107 flats/287 textures/764 sprites under the stricter loader. Browser title/start/pause, real save/reload and malformed-BSP error checks pass (8.8 seconds). Reference inputs/artifacts remain untracked. Next: remaining special-family scenario coverage and automap presentation/discovery; actual combat playthrough/device/performance gates remain open.


## 2026-09-13 — automap discovery, HUD layout and marks

**UI-01 / RENDER-01 / SAVE-01.** Replaced sparse discovery rays with front-to-back BSP angular spans, retaining solid-wall occlusion and finding narrow visible segments between the old rays. This follows the horizontal visibility portion of `R_Subsector` / `R_AddLine`; original vertical software-renderer clipping remains outside this approximation. The automap now leaves the status bar visible, uses authored palette colors and AMMNUM/HUD glyphs, displays all 36 original map titles, and positions help below the mobile action buttons. `AM_addMark` uses ten circular numbered slots; saves retain the next slot with a legacy default. PLAYPAL effects also cover the map.

Validation: typecheck, 157 unit tests, build and all-36-map WAD validation pass. Chrome automap, save, mobile-layout and short replay checks pass; after the final mark/layout changes, the three affected automap/save/mobile checks pass with a clean exit. Browser assertions cover HUD space, glyph rendering, circular overwrite and saved next-slot state. Physical-device and original pixel comparisons remain open. Next: remaining special-family scenarios and campaign/release checks.
