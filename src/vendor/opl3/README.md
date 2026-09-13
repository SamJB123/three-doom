# Browser OPL/MUS subset

Derived from installed opl3@0.4.3 and wad-genmidi@0.1.0, both declared MIT in their package metadata. Original author: IDDQD (Copyright (c) 2016 IDDQD@doom.js). The OPL emulator credits Robson Cozendey's Yamaha YMF262 emulator. Original repository identifiers: github.com/doomjs/opl3 and github.com/doomjs/wad-genmidi. Exact pre-conversion source hashes are in upstream.json.

Changes: convert CommonJS to ESM; replace shallow extend calls with Object.assign; supply the small inheritance helper; read GENMIDI strings without patching DataView.prototype; require the game's supplied GENMIDI rather than bundling default instrument data; declare MUS OPLshutup's loop variable for strict mode. The chip synthesis and MUS playback algorithms are retained. Native encoders, CLI tools and their dependency chains are excluded.

npm run verify:audio renders reference tracks from the local IWAD and compares PCM hashes against the original installed implementation. This establishes adaptation equivalence, not equivalence to a particular original Doom sound card or driver. ScriptProcessor playback/resampling remains a separate modernization task.
