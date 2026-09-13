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
