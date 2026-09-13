# Hosted original Doom world oracle

See `docs/FIDELITY.md` for commands, ABI adaptations and evidence scope.
`world.c` supplies headless platform I/O and a bounded single-player command driver.
The original game, world thinkers, state tables, map loading and RNG compile from
local reference sources. No IWAD or reference source is committed here.

`reference-world.mjs` defaults to the session's supplied source path. Set
`DOOM_SOURCE` to the directory containing `p_tick.c` and `DOOM_WAD` to the local IWAD
to override it. A C compiler supporting AddressSanitizer is required.

The comparison deliberately fails when a longer trace reaches a known divergence.
Do not update expected values from the port or truncate a failing trace and describe
the longer run as passing. Use the first differing tic to choose the next regression.
