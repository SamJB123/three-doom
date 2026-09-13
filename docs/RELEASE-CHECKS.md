# Single-player release evidence

This checklist supplements [ROADMAP.md](ROADMAP.md). A checked automated route is not a combat playthrough, and an emulated mobile viewport is not a physical-device check. Keep raw recordings, screenshots, traces and hardware profiles under ignored `artifacts/`; record reproducible commands and scoped results here or in [PROGRESS.md](PROGRESS.md).

## Simulation and content

| Roadmap IDs | Required evidence | Current limit |
|---|---|---|
| REF-01 / LOOP-02 | Complete same-input hosted-C recordings with pinned provenance; explain first differences | All four complete recordings pass: 1710 / 2347 / 3863 / 818 commands, with paired C/port traces and provenance. Uncaptured state and unexercised routes remain outside this gate |
| PHYS-01 / ACTOR-01 / ACTOR-02 / COMBAT-01 / PLAYER-01 | Boundary scenarios and C comparisons for remaining collision, AI, aiming, weapon and player behavior | Regression coverage does not yet establish every action or rule |
| SPEC-01 / SPEC-02 | Scenario coverage against every family in IWAD-SPECIALS.md, including retrigger, obstruction, key and actor restrictions | Door/lift/floor/crusher/stair lifecycle matrix passes; see SPECIAL-COVERAGE.md for remaining obstruction, topology and campaign scope |
| SAVE-01 / MENU-02 | Save/restore during doors, lifts, crushing, projectiles, infighting, powers, death and secret progression; compare continued traces | Five active door/lift/crusher/stair/death scenarios match 160 continued tics each with combat, projectiles and powers. Actual menu saves at DEMO1/1000, DEMO2/1200, DEMO3/3050 and DEMO4/600 also match 160 continued tics each after loading; secret-progression campaign saves remain outside this sample |
| UI-01 / UI-02 / UI-03 | HUD face/palette/automap, messages, all intermissions/finales, original title/credit/demo sequence | Connected presentation checks pass; title/credit/four-demo cycle browser check passes; HUD faces and authored palette/power lookup checked; BSP automap discovery/layout/marks checked; broader visual comparison pending |
| RENDER-01 / AUDIO-01 | Reference views/listening at representative indoor, outdoor, sky, masked-wall, moving-sector and combat scenes | Four original-renderer world views inspected; shader, sky/occlusion, movement sound and teleport regressions pass, as do four upstream PCM fixtures. Broader scene/listening coverage remains open |

## Campaign playthroughs — FLOW-02 / BOSS-01

Automated lifecycle routing covers all 36 maps. On 2026-09-13, the user reported that manual playtesting appears fully playable from start to end. That is end-to-end playability feedback; individual maps, skills, exit routes and devices have not been recorded. The table tracks outstanding formal coverage evidence, not known unplayable maps. Record map, skill, build/WAD hashes, normal or secret exit, deaths/restarts, save/load exercised, and any blockers/items/messages. Include all secret entrances and returns, E1M8/E2M8/E3M8/E4M6/E4M8 boss rules, and every episode finale.

| Episode | Maps requiring recorded combat acceptance evidence |
|---|---|
| Knee-Deep in the Dead | E1M1, E1M2, E1M3, E1M4, E1M5, E1M6, E1M7, E1M8, E1M9 |
| The Shores of Hell | E2M1, E2M2, E2M3, E2M4, E2M5, E2M6, E2M7, E2M8, E2M9 |
| Inferno | E3M1, E3M2, E3M3, E3M4, E3M5, E3M6, E3M7, E3M8, E3M9 |
| Thy Flesh Consumed | E4M1, E4M2, E4M3, E4M4, E4M5, E4M6, E4M7, E4M8, E4M9 |

## Browser and device checks — MENU-01 / LOOP-01 / RENDER-01 / AUDIO-01

| Environment | Required coverage | Evidence |
|---|---|---|
| Installed desktop Chrome, macOS | Start/help/options, pointer lock, pause/blur, lifecycle, saves, rendering, audio resume | Full 32-check suite passes (4.6 minutes, clean exit), including all 36 lifecycle routes, finales, saves, both renderer shader checks, mobile controls and paused-demo heading preservation. Final post-resource-cleanup seven-check run passes in 2.7 minutes with clean exit: all 36 lifecycle routes, persistent and four recorded-encounter saves, both renderer lighting checks, touch layout/menu and desktop shortcuts/hidden buttons |
| Chrome mobile viewport | Circular sprint/fire, tap Use, hold/drag/cancel weapon wheel, portrait/landscape layout, menu isolation | Existing mobile browser regressions pass; not physical Android evidence |
| WebKit mobile viewport | Same mobile controls, rendering fallback, audio activation, storage and lifecycle | Nine focused checks pass (45.3 seconds, clean exit): touch menus/layout/use/weapon selection, saves, audio lifecycle, default plus forced-WebGL lighting/colormaps, attract wipes and paused-demo heading. Synthetic touch events, not hardware delivery |
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
npx playwright install chromium
npm run test:replay
npm run verify:world -- 4000
```

The speed option scales only the test clock input; simulation still advances in discrete tics. The second run uses a different frame schedule and includes pause. Developer playback retains a partial trace and reports failure if divergent gameplay reaches rebirth or a level exit before the recording ends. Such a failure must not be counted as a completed recording. Refresh captures after code changes before running the C gate.

Long replay diagnostics now use `npm run test:replay -- DEMO3` (omit demo names for all four), which explicitly selects Playwright's bundled Chromium rather than inheriting PLAYWRIGHT_CHANNEL. The complete DEMO3 run exits cleanly on that browser. Installed macOS Chrome 152 leaves an orphaned Crashpad helper holding the worker's stderr pipe after browser exit; testing flags did not prevent it. This remains an installed-Chrome diagnostic limitation, not a game playback failure. Ordinary installed-Chrome browser checks remain separate. No blanket process-killing workaround is built into the runner.


## Desktop performance baseline

Run `node scripts/acceptance-performance.mjs` with no other browser workload. The bounded diagnostic uses bundled Chromium's WebGL fallback at 960×720, DPR 1, 13 same-map loads (three warm loads) and 120 seconds of real-time attract/combat playback after a ten-second warm-up. Before execution, the diagnostic budgets are p95 frame interval ≤33.4 ms, p99 ≤50.1 ms, maximum gameplay simulation backlog ≤8/35 second (raw melt/page clock backlog is reported separately), retained JS heap growth ≤8 MiB and retained DOM-node growth ≤50 after warm loads. This is a desktop fallback baseline, not a minimum-supported mobile-device specification or GPU-memory/audio-dropout measurement. Raw hardware/browser/GPU/sample evidence is written to ignored `artifacts/performance-acceptance.json`. For a normal visible desktop GPU run with the same budgets, use `DOOM_PERF_HEADED=1 DOOM_PERF_WEBGL=0 node scripts/acceptance-performance.mjs` (`DOOM_PERF_CHANNEL=chrome` selects installed Chrome, subject to its documented teardown limitation); preserve results separately when comparing backends.

Measured on 2026-09-13: visible bundled Chromium 153.0.8010.12, native Apple M5 Max/Metal on macOS 26.5.2, 48 GiB RAM, default renderer. The 120-second run sampled 14,246 frames: p50 8.3 ms, p95 9.6 ms, p99 10.2 ms; gameplay backlog 0.0261 s; retained JS heap growth 712,368 bytes across nine additional loads, with zero retained DOM-node growth. These measured budgets pass. Raw presentation-clock backlog was 0.3432 s, reported separately from actual gameplay tics. Repeated-load material/atlas retention was fixed during this pass.

The earlier software-WebGL run failed frame/backlog and retained-memory budgets; its artifacts remain preserved. Visible full Chromium, like installed Chrome, left Crashpad helpers holding the runner's stderr after browser closure. Native measurements completed, but teardown needed cleanup of the helpers proven to own this runner's socket; this is **not** an unattended clean-exit result. Bundled headless Chromium still closes cleanly for replay diagnostics. Physical-device, GPU-memory and audible dropout checks remain outside this baseline.

## Reference scene captures

With `npm run dev -- --port 3010` running, `node scripts/capture-reference-views.mjs` captures matching C and installed-Chrome views at DEMO1/70, DEMO2/350, DEMO3/900 and DEMO4/368. The four pairs were inspected for room/material layout, moving-door openings, sprite placement and combat presentation after the paused-heading fix. Room layout and placement agree within the documented wider Three.js projection; no pixel-identical rendering claim is made. The supplied C selects SKY1 for retail episode maps because `G_DoLoadLevel` mixes game-mode and mission enum values; the DEMO3 sky difference is a reference-source quirk, documented in FIDELITY.md, and is not evidence against the intended episode sky. Base-palette C frames exclude unticked HUD/palette timing, and this sample does not cover every outdoor/sky/scrolling/teleport/listening scene.

Bundled headless Chromium's default WebGPU device loses its instance on this Mac, producing black world frames and three failed graphics/reload checks. Installed Chrome passes the corresponding checks; WebKit's indexed-renderer checks pass too. Use bundled Chromium for deterministic diagnostics with WebGL, and installed Chrome/WebKit for graphics acceptance. This browser-backend limitation remains recorded rather than hidden by error filtering.
