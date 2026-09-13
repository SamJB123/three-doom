# Completion roadmap

Target: complete Ultimate Doom single-player play through all four episodes, with source-faithful simulation and Three.js presentation. Exact executable/demo compatibility remains a separate verification target until the reference is pinned. Multiplayer is tracked separately, not silently included in a single-player completion claim.

Status vocabulary: **missing**, **partial** (implemented but incomplete or not connected), **connected** (reachable through the game), **verified** (named acceptance checks pass). Verification is always scoped; never infer whole-system fidelity from one test.

## Milestones

1. **Foundation and menus:** reproducible setup, source inventory, automated checks, title/menu/pause, one simulation clock.
2. **Reliable E1M1:** shared collision, sector occupants, correct attacks/spawns/triggers; repeatable start-to-exit playthrough.
3. **Episode one:** episode/skill setup, E1M1–E1M9 lifecycle, keys, secret routes, boss progression, intermission, finale, saves.
4. **Ultimate Doom:** all four episodes, all specials and monsters used by the IWAD, presentation completeness, compatibility fixtures.
5. **Release gates:** supported browser/device coverage, performance budgets, complete regression evidence, no outstanding completion blockers.

## Source-to-port coverage

| ID | Area / reference functions or files | Current state | Acceptance gate |
|---|---|---|---|
| BUILD-01 | Installation / project tooling | verified locally | npm clean install, typecheck, unit tests, build, WAD parser smoke |
| BUILD-02 | Browser-only OPL dependency / package hygiene | verified npm install and upstream PCM subset | Browser subset replaces native/Git chain; clean npm install and four MUS/GENMIDI PCM fixtures pass |
| REF-01 | `doomdef.h`, `g_game.c`, reference provenance | partial | Pin C revision/tree hashes, IWAD hash, target game/version; resolve differences from Ultimate Doom executable |
| MENU-01 | `m_menu.c`: `M_Responder`, `M_Drawer`; `d_main.c` title | verified browser foundation; circular touch actions, tap-use and weapon wheel checked | WAD-backed title; start, pause, resume, help, restart/end confirmations; desktop/touch; no input leakage |
| MENU-02 | `M_Episode`, `M_ChooseSkill`, options, save/load menus | partial: episode/skill, volume and six save/load slots connected | Real episode/skill selection with gameplay effects; working options and save/load flows |
| LOOP-01 | `p_tick.c P_Ticker`, `g_game.c G_Ticker` | verified scheduler | One 35 Hz clock; no tics in menus; frame-rate invariant tick count; no pause catch-up |
| LOOP-02 | `P_RunThinkers`, `P_PlayerThink`, ticcmd ordering | partial: all four demos pass 350-tic C actor/target, inventory and sector comparisons; longer traces expose documented failures | Match C action ordering, RNG consumption, input quantization and deterministic state traces |
| FLOW-02 | `G_InitNew`, `G_DoLoadLevel`, `G_DoCompleted`, `G_WorldDone` | connected; 36-map routing browser check passes | In-process teardown/load; preserve inventory across normal exits; reset state on new game; secret map routing |
| MAP-01 | `w_wad.c`, `p_setup.c`, `r_data.c` | partial: bounded records/patches, map references/BSP cycles and last-patch overrides checked; all 36 maps pass | All 36 maps parse (smoke exists); validate malformed input, duplicate lumps, patch overrides, spawn counts |
| PHYS-01 | `p_map.c P_CheckPosition`, `P_TryMove`, `P_SlideMove` | partial: fixed blockmap slide traversal, signed splits, step support and dynamic thing order checked | Solid actors, blocking flags, steps/dropoffs, diagonal sliding; player/monster/projectile consistency |
| PHYS-02 | `P_ChangeSector`, `P_ThingHeightClip`, `T_MovePlane` | partial | Lifts carry stationary occupants; doors reopen when blocked; crushers damage and handle corpses |
| SPEC-01 | `P_CrossSpecialLine`, `P_UseSpecialLine`, `EV_VerticalDoor` | partial: projectile exclusions, monster manual-door restrictions and switch retrigger scenarios checked | Actual side-crossing only; use intersections sorted along ray; keys enforced; repeat/use direction semantics |
| SPEC-02 | `p_floor.c`, `p_plats.c`, `p_ceilng.c`, `p_doors.c`, `p_lights.c`, `p_telept.c` | partial: door/lift/floor/crusher/stair lifecycle scenarios checked; four light thinkers C-checked | Table of every IWAD-used special and a scenario per special family; telefrags and teleport effects |
| ACTOR-01 | `p_mobj.c P_SpawnMapThing`, `info.c`, `p_enemy.c` | partial: complete source metadata, map actors and Nightmare respawn checked | Skill/multiplayer filtering, spawn angle/ambush, timing, AI, pain/death/infighting/drop behavior |
| ACTOR-02 | `P_NoiseAlert`, `A_Look`, `P_CheckSight` | partial: REJECT connected; original player-search slots and hearing checked | Weapon noise reaches valid sectors, respects sound-block flags; ambush/sight behavior matches C |
| COMBAT-01 | `p_pspr.c`, `p_map.c` aiming/line attacks | partial: hit effects/RNG, weapon timing, chainsaw contact, ammo fallback and per-shot bullet slope checked | Correct melee range, autoaim, first-shot accuracy, spread, projectile wall impacts and BFG behavior |
| PLAYER-01 | `p_inter.c`, `p_user.c`, `p_pspr.c` | partial: pickup, damage C fixtures, corpse and Use-rebirth checks pass | Damage/armor/powers, pickups, cheats, death/rebirth, skill modifiers and weapon selection match C |
| BOSS-01 | `p_enemy.c A_BossDeath`, episode/map rules | connected; last-boss/living-player exit checks pass | E1M8/E2M8/E3M8/E4M6/E4M8 progression and surviving-boss checks |
| UI-01 | `st_stuff.c`, `hu_stuff.c`, `am_map.c` | partial: attacker-directed faces/timers checked; PLAYPAL colors checked in Chrome/WebKit; power colormaps, BSP automap discovery and circular marks checked | HUD state/timing and messages; automap; palette/power effects |
| UI-03 | `hu_stuff.c HU_Ticker/HU_Drawer`, `p_inter.c P_TouchSpecialThing`, `d_englsh.h GOT*` | connected; pickup families and original locked-door key feedback, timing, pause and options checks pass | Original health/armor/ammo/weapon/key/powerup messages, WAD HUD glyphs, timeout in simulation tics, message toggle; only successful pickups notify, including dropped items |
| UI-02 | `wi_stuff.c`, `f_finale.c`, `d_main.c` demo sequence | connected: stats, animated maps/music and episode finales; melt connected; retail title/credit/four-demo cycle browser-checked | Stats/par/intermission maps, episode finales, title/credit/demo cycle |
| SAVE-01 | `p_saveg.c`, `G_DoSaveGame`, `G_DoLoadGame` | connected; five active combat/special save scenarios continue for 160 matching tics each; browser persistence verified | Versioned snapshots preserve player, thinkers, world, RNG; round-trip identical continued traces |
| RENDER-01 | `r_*` rendering rules | partial: holes, masked walls, pegging, scrolling and texture animation have scoped checks; continuous scrolling loops are a presentation adjustment; sky coverage/occlusion checked | Holes/disconnected sector geometry, pegging, masked walls, skies, sprite rotation/lighting and palette comparisons |
| AUDIO-01 | `s_sound.c`, MUS/GENMIDI | partial: attenuation C fixtures, channels, movement effects and teleport regression checked | Correct per-map music, volume controls, attenuation, lifecycle, browser resume, audio smoke |
| FIXED-01 | `m_fixed.c`, `tables.c`, `m_random.c` | partial: arithmetic/angle C fixtures and source tables checked | Signed arithmetic, overflow/division and angle tables; separate gameplay/cosmetic RNG; C differential vectors |
| NET-01 | `d_net.c`, `i_net.c`, ticcmd networking | missing | Separate multiplayer milestone after deterministic single-player simulation |

Special-family evidence and remaining scope are tracked in [SPECIAL-COVERAGE.md](SPECIAL-COVERAGE.md).

Release evidence and the explicit campaign/device matrix are tracked in [RELEASE-CHECKS.md](RELEASE-CHECKS.md).

## Known confirmed baseline defects

The initial review reproduced: solid actor overlap; ignored two-sided `ML_BLOCKING`; cross trigger before centre crossing; stationary player left behind by rising floor; ignored multiplayer spawn flag and angle; signed fixed multiply/divide differences. Code inspection also found unlocked keyed doors, long-range melee, missing autoaim/noise integration, missing boss actions, and E1M1-only reload flow.

These remain open unless a progress entry and acceptance test explicitly close them. Tests marked TODO are not passing fidelity evidence.

## Next slices — presentation and release coverage first

1. UI-01 / RENDER-01: broader lighting/sprite comparisons. Automap BSP discovery, HUD layout and saved circular marks have scoped checks. Title/credits/four-demo playback, HUD faces and authored PLAYPAL effects are now connected and checked.
2. UI-01 / RENDER-01: broaden reference-view comparisons after indexed power colormaps and muzzle lighting; source distance-light falloff remains an approximation.
3. SPEC-01 / SPEC-02: complete scenario coverage for IWAD-used special families. Known chainsaw, ammo fallback and monster manual-door omissions have behavioral regressions and are checkpointed.
4. SAVE-01 / MAP-01: complex gameplay save/restore and malformed-input cases.
5. FLOW-02 / BOSS-01 / AUDIO-01: campaign combat progression, secret routes, boss gates, all endings and representative audiovisual checks.
6. Release browser/device/performance gates in RELEASE-CHECKS.md, including long-worker shutdown. Physical-device checks require actual hardware evidence.

Longer C discrepancies remain tracked (DEMO1 RNG at 463, DEMO2 angle at 2271, DEMO3 blood height at 2036, DEMO4 enemy wake at 368). They do not take priority over the above missing coverage unless a concrete gameplay blocker requires them. The bullet side-probe fix is implemented with a behavioral regression; refreshed C evidence remains pending. Exact full-demo equivalence is not substituted for playable campaign/release coverage.
