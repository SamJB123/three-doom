# Single-player release evidence

This checklist supplements [ROADMAP.md](ROADMAP.md). A checked automated route is not a combat playthrough, and an emulated mobile viewport is not a physical-device check. Keep raw recordings, screenshots, traces and hardware profiles under ignored `artifacts/`; record reproducible commands and scoped results here or in [PROGRESS.md](PROGRESS.md).

## Simulation and content

| Roadmap IDs | Required evidence | Current limit |
|---|---|---|
| REF-01 / LOOP-02 | Complete same-input hosted-C recordings with pinned provenance; explain first differences | All four 350-command prefixes pass; full recordings under investigation; DEMO1 first C difference at tic 463 |
| PHYS-01 / ACTOR-01 / ACTOR-02 / COMBAT-01 / PLAYER-01 | Boundary scenarios and C comparisons for remaining collision, AI, aiming, weapon and player behavior | Regression coverage does not yet establish every action or rule |
| SPEC-01 / SPEC-02 | Scenario coverage against every family in IWAD-SPECIALS.md, including retrigger, obstruction, key and actor restrictions | Inventory exists; scenario coverage incomplete |
| SAVE-01 / MENU-02 | Save/restore during doors, lifts, crushing, projectiles, infighting, powers, death and secret progression; compare continued traces | Synthetic continued traces and browser persistence pass; broader campaign saves pending |
| UI-01 / UI-02 / UI-03 | HUD face/palette/automap, messages, all intermissions/finales, original title/credit/demo sequence | Connected presentation checks pass; title/credit/four-demo cycle browser check passes; broader HUD/visual comparison pending |
| RENDER-01 / AUDIO-01 | Reference views/listening at representative indoor, outdoor, sky, masked-wall, moving-sector and combat scenes | Scoped rendering/audio regressions pass; full comparison pending |

## Campaign playthroughs — FLOW-02 / BOSS-01

Automated lifecycle routing currently covers all 36 maps. **Every actual combat playthrough below remains pending.** Record map, skill, build/WAD hashes, normal or secret exit, deaths/restarts, save/load exercised, and any missing blockers/items/messages. Include all secret entrances and returns, E1M8/E2M8/E3M8/E4M6/E4M8 boss rules, and every episode finale.

| Episode | Maps requiring combat completion |
|---|---|
| Knee-Deep in the Dead | E1M1, E1M2, E1M3, E1M4, E1M5, E1M6, E1M7, E1M8, E1M9 |
| The Shores of Hell | E2M1, E2M2, E2M3, E2M4, E2M5, E2M6, E2M7, E2M8, E2M9 |
| Inferno | E3M1, E3M2, E3M3, E3M4, E3M5, E3M6, E3M7, E3M8, E3M9 |
| Thy Flesh Consumed | E4M1, E4M2, E4M3, E4M4, E4M5, E4M6, E4M7, E4M8, E4M9 |

## Browser and device checks — MENU-01 / LOOP-01 / RENDER-01 / AUDIO-01

| Environment | Required coverage | Evidence |
|---|---|---|
| Installed desktop Chrome, macOS | Start/help/options, pointer lock, pause/blur, lifecycle, saves, rendering, audio resume | Full 22-check suite passed at a36d4fd; subsequent traversal changes have four replay checks |
| Chrome mobile viewport | Circular sprint/fire, tap Use, hold/drag/cancel weapon wheel, portrait/landscape layout, menu isolation | Existing mobile browser regressions pass; not physical Android evidence |
| WebKit mobile viewport | Same mobile controls, rendering fallback, audio activation, storage and lifecycle | Three mobile checks pass in Playwright WebKit 26.6; synthetic touch events, not hardware delivery |
| Physical iPhone/iPad Safari | Thumb reach, simultaneous touches, orientation/safe areas, audio interruptions, background/foreground, storage | Pending physical devices |
| Physical Android Chrome | Same touch/lifecycle checks plus browser navigation gestures | Pending physical devices |

For performance results record hardware, OS/browser, renderer backend, viewport/device-pixel ratio, map/scene, warm-up, sample duration, frame-time percentiles, memory trend, simulation backlog and audio dropouts. Exercise repeated map loads and a sustained combat session. Define supported-device budgets before calling this gate passed; a quick headless screenshot is insufficient.

## Completion claim

Do not describe the single-player port as complete while any required row remains unresolved. Multiplayer (NET-01), DOS executable equivalence and original-format save compatibility are separate targets and must not be implied by passing this checklist.

## Reproduce browser checks

```sh
PLAYWRIGHT_CHANNEL=chrome npm run test:e2e
npx playwright install webkit
PLAYWRIGHT_BROWSER=webkit npm run test:e2e -- --grep 'mobile|touch menu'
```

`PLAYWRIGHT_REUSE_SERVER=1` is an opt-in for an already-running local server at port 3010; ordinary checks create and shut down their own server. WebKit uses a separate failure-artifact directory. Mobile tests dispatch portable synthetic touch events to the actual handlers and also use browser tap actions for menus.

For complete diagnostic recordings:

```sh
PLAYWRIGHT_CHANNEL=chrome DOOM_TRACE_DEMOS=DEMO1,DEMO2,DEMO3,DEMO4 DOOM_TRACE_TICS=4000 DOOM_TRACE_SPEED=8 npm run test:e2e -- --grep 'original IWAD demo'
npm run verify:world -- 4000
```

The speed option scales only the test clock input; simulation still advances in discrete tics. The second run uses a different frame schedule and includes pause. Developer playback retains a partial trace and reports failure if divergent gameplay reaches rebirth or a level exit before the recording ends. Such a failure must not be counted as a completed recording. Refresh captures after code changes before running the C gate.

Long DEMO3 captures currently expose a test-worker shutdown stall after successful assertions. Shorter runs exit normally. Compression reduces protocol payload but has not fixed cleanup; resolve this before treating long replay commands as clean release gates.
