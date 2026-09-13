import { readFile, mkdir, copyFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve } from 'node:path';
const source = process.argv[2] || process.env.DOOM_WAD;
if (!source) throw new Error('Usage: npm run setup:wad -- /absolute/path/to/doomu.wad');
const data = await readFile(source);
if (data.length < 12 || data.toString('ascii', 0, 4) !== 'IWAD') throw new Error('Expected a Doom IWAD.');
await mkdir('public', { recursive: true });
const target = resolve('public/doomu.wad');
try {
  const existing = await readFile(target);
  if (!existing.equals(data)) throw new Error('public/doomu.wad already contains a different WAD; move it aside first.');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  await copyFile(source, target, constants.COPYFILE_EXCL);
}
console.log(`Local IWAD ready: ${target} (${data.length} bytes)`);
