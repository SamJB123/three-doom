# Special behavior coverage

**SPEC-01 / SPEC-02.** Read alongside [IWAD-SPECIALS.md](IWAD-SPECIALS.md). These are source-derived behavioral scenarios, not executed whole-map C comparisons or completed combat routes. A dispatch assertion alone does not establish movement, obstruction or timing.

| Family / source | Scenario evidence | Remaining scope |
|---|---|---|
| Tagged doors — `EV_DoDoor`, `T_VerticalDoor` | `special-lifecycle.test.ts`: 2, 86, 103, 61, 109, 112, 115, 3, 42, 75, 4, 29, 63, 90, 105, 114, 16, 76; speed, endpoints, 150/1050-tic waits, busy retrigger, consumption and removal | Normal doors reverse under obstruction; close-only doors retry and finish after clearance. Campaign combinations remain |
| Manual/keyed doors — `EV_VerticalDoor` | Physics/combat/specials tests: key colors/cards/skulls, active reversal, monster restrictions; sound test: 1, 31, 117, 118 choose original opening effect | Real keyed progression on every map |
| Lifts — `EV_DoPlat`, `T_PlatRaise` | Lifecycle: 10, 21, 62, 88, 120, 123; descent, 105-tic wait, return, removal and repeat activation; specials: perpetual stop/resume and competing floor | Repeated perpetual cycles, stasis direction/counter retention and obstructed lift returns now pass. Campaign routes remain |
| Floors — `EV_DoFloor`, `T_MoveFloor` | Lifecycle: 19, 45, 83, 102, 23, 38, 60, 82, 36, 70, 71, 98, 18, 5, 91, 101, 56, 65, 58, 59, 37; speed, destination, consumption, immediate/deferred texture change. Specials: shortest texture and donut destinations | Wider multi-neighbor/model selection and campaign routes |
| Crushers — `EV_DoCeiling`, `T_MoveCeiling` | Lifecycle: 25, 73, 77 reach eight-unit bottom, reverse, stop via 74 and resume without duplicate thinker. Physics: live damage, blood, dropped objects, corpse gibs; saves: active/stopped continuation | Both planes/directions preserve original endpoint rollback/completion under obstruction. Campaign combinations remain |
| Stairs — `EV_BuildStairs` | Lifecycle: 7, 8, 127; increasing steps, slow/fast speeds, texture boundary and sector release | Busy matching branches are counted before selecting the next free stair, matching EV_BuildStairs; actual map routes remain |
| Lights — `P_SpawnSpecials`, light thinkers | Four thinker functions match 140 executed C tics each; specials tests cover tagged changes/strobes and timing | Broader spawn/neighborhood combinations |
| Teleports — `EV_Teleport` | Player/monster restrictions, projectile exclusion, near/distant destination sounds, collision and reaction-time regressions | Complete map teleporter routes and listening checks |
| Exits, damage, secrets, scrolling | Player, intermission, browser and scrolling tests cover scoped behavior; 36-map lifecycle routing passes | Actual combat completion, secrets and all encounter combinations |

Active save scenarios additionally compare 160 uninterrupted versus restored tics for door, lift, crusher, stair and death scenes with combat, projectiles and powers. This does not close campaign verification.

The additional finite obstruction/topology scenarios are in `special-acceptance.test.ts`. These remain source-derived behavioral tests, not independent executed-C fixtures.
