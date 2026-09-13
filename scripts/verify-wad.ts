import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import {MOBJ_TYPES,MOBJ_STATES,DOOMEDNUM_TO_TYPE,MF_NOSECTOR} from '../src/game/MobjData';
import * as w from '../src/wad/index.ts';
const bytes = readFileSync(process.env.DOOM_WAD || 'public/doomu.wad');
const wad = w.parseWAD(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const usedTypes=new Set<string>();
const maps = wad.lumps.filter(l => /^E[1-4]M[1-9]$/.test(l.name));
assert.equal(maps.length, 36, 'Expected all 36 Ultimate Doom maps');
for (const { name } of maps) {
  const lumps = w.getMapLumps(wad, name);
  const vertices = w.parseVertexes(wad, lumps.VERTEXES);
  const lines = w.parseLinedefs(wad, lumps.LINEDEFS);
  const sides = w.parseSidedefs(wad, lumps.SIDEDEFS);
  const sectors = w.parseSectors(wad, lumps.SECTORS);
  const things = w.parseThings(wad, lumps.THINGS);
  const segs = w.parseSegs(wad, lumps.SEGS);
  const subsectors = w.parseSubsectors(wad, lumps.SSECTORS);
  const nodes = w.parseNodes(wad, lumps.NODES);
  const blockmap = w.parseBlockmap(wad, lumps.BLOCKMAP);
  for(const thing of things){
    if([1,2,3,4,11].includes(thing.type))continue;
    const type=DOOMEDNUM_TO_TYPE[thing.type];assert(type,`${name}: unknown actor ${thing.type}`);usedTypes.add(type);
  }
  assert(things.some(t => t.type === 1), `${name}: player start`);
  for (const l of lines) {
    assert(vertices[l.v1] && vertices[l.v2], `${name}: linedef vertices`);
    assert(sides[l.right] && (l.left < 0 || sides[l.left]), `${name}: sidedef references`);
  }
  for (const s of sides) assert(sectors[s.sector], `${name}: sector reference`);
  for (const s of segs) assert(lines[s.linedef], `${name}: seg linedef`);
  for (const s of subsectors) assert(segs[s.firstSeg], `${name}: subsector first seg`);
  assert(nodes.length > 0 && blockmap.lists.length > 0, `${name}: spatial data`);
}
const palette = w.parsePalette(wad);
for (const name of ['TITLEPIC', 'M_DOOM', 'M_NGAME', 'M_RDTHIS']) {
  const lump = w.getLump(wad, name);
  assert(lump, `Required menu asset ${name}`);
  const patch = w.parsePatch(wad, lump.offset);
  assert(patch.width > 0 && patch.height > 0);
}
const flats = w.parseFlats(wad, palette);
const textures = w.parseTextures(wad, palette);
const sprites = w.parseSprites(wad, palette);
for(const type of usedTypes){
  const info=MOBJ_TYPES[type];if(info.flags&MF_NOSECTOR)continue;
  const visited=new Set<string>();let name=info.spawnState;
  while(name!=='S_NULL' && !visited.has(name)){
    visited.add(name);const state=MOBJ_STATES[name];assert(state,`${type}: missing state ${name}`);
    const prefix=state.sprite+String.fromCharCode(65+state.frame);
    assert(Object.keys(sprites).some(key=>key.startsWith(prefix)),`${type}: missing sprite ${prefix}`);
    name=state.next;
  }
}
console.log(`PASS: ${maps.length} maps, spatial references and menu patches; ${Object.keys(flats).length} flats, ${Object.keys(textures).length} textures, ${Object.keys(sprites).length} sprites.`);
