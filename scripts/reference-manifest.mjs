import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, relative, join } from 'node:path';
const root = process.env.DOOM_SOURCE;
if (!root) throw new Error('Set DOOM_SOURCE to the reference DOOM repository.');
const hash = async path => createHash('sha256').update(await readFile(path)).digest('hex');
const files = {};
async function walk(dir) {
  for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (/\.[ch]$/.test(entry.name)) files[relative(root, path)] = await hash(path);
  }
}
await walk(join(root, 'linuxdoom-1.10'));
const wad = resolve(process.env.DOOM_WAD || 'public/doomu.wad');
await mkdir('artifacts', { recursive: true });
await writeFile('artifacts/reference-manifest.json', JSON.stringify({
  sourceRoot: resolve(root), files, wad: { path: wad, sha256: await hash(wad) },
  note: 'Provenance only; reference executable/version equivalence and differential oracle pending.'
}, null, 2) + '\n');
console.log(`Recorded ${Object.keys(files).length} source hashes and IWAD hash in artifacts/reference-manifest.json`);
