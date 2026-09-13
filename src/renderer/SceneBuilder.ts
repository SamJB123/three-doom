import { Group, BufferGeometry, Float32BufferAttribute, Mesh } from 'three/webgpu';
import type { Vertex, Linedef, Sidedef, Sector, Thing, TextureData, Palette } from '../wad/types';
import { buildSectorPolygons, triangulateSector } from '../wad/SectorBuilder';
import { TextureManager } from './TextureManager';

const SCALE = 1.0 / 32.0;

interface WallBatch {
  texName: string;
  lightLevel: number;
  masked: boolean;
  positions: number[];
  uvs: number[];
  scrolls: {start:number;side:Sidedef;offset:number;width:number}[];
}

export class SceneManager {

  private texMgr: TextureManager;
  private scrollingSides=new Set<Sidedef>();
  private sectorGroups: Map<number, Group> = new Map();
  private sectorLinedefs: Map<number, number[]> = new Map(); // sector → linedef indices
  readonly root = new Group();

  constructor(
    private vertexes: Vertex[],
    private linedefs: Linedef[],
    private sidedefs: Sidedef[],
    private sectors: Sector[],
    wallTextures: Record<string, TextureData>,
    private flats: Record<string, TextureData>,
    colormap: Uint8Array[],
    palette: Palette
  ) {

    for(const line of linedefs)if(line.special===48)this.scrollingSides.add(sidedefs[line.right]);
    this.texMgr = new TextureManager( wallTextures, flats, colormap, palette );

    // Pre-compute which linedefs touch each sector
    for ( let i = 0; i < linedefs.length; i ++ ) {

      const ld = linedefs[ i ];

      if ( ld.right >= 0 ) {

        const si = sidedefs[ ld.right ].sector;
        let list = this.sectorLinedefs.get( si );
        if ( ! list ) { list = []; this.sectorLinedefs.set( si, list ); }
        list.push( i );

      }

      if ( ld.left >= 0 ) {

        const si = sidedefs[ ld.left ].sector;
        let list = this.sectorLinedefs.get( si );
        if ( ! list ) { list = []; this.sectorLinedefs.set( si, list ); }
        list.push( i );

      }

    }

    // Build all sectors
    for ( let si = 0; si < sectors.length; si ++ ) {

      this.buildSector( si );

    }

  }

  dispose(): void {
    this.root.traverse(child => { if (child instanceof Mesh) child.geometry.dispose(); });
    this.root.clear(); this.sectorGroups.clear(); this.texMgr.dispose();
  }

  updateAnimatedTextures( levelTic: number ): void {

    this.texMgr.updateAnimatedTextures( levelTic );
    this.root.traverse(object=>{
      if(!(object instanceof Mesh))return;
      const records=object.geometry.userData.scrolls as WallBatch['scrolls'] | undefined;
      if(!records?.length)return;
      const uv=object.geometry.getAttribute('uv');
      for(const record of records){
        const delta=(record.side.xoff-record.offset)/record.width;
        if(!delta)continue;
        for(let i=record.start;i<record.start+6;i++)uv.setX(i,uv.getX(i)+delta);
        record.offset=record.side.xoff;uv.needsUpdate=true;
      }
    });

  }

  // Rebuild specific sectors + their neighbors (for linedefs that span two sectors)
  rebuildDirtySectors( dirtyIndices: Set<number> ): void {

    // Expand dirty set to include neighbor sectors that share linedefs
    const expanded = new Set<number>();

    for ( const si of dirtyIndices ) {

      expanded.add( si );

      const ldList = this.sectorLinedefs.get( si );
      if ( ! ldList ) continue;

      for ( const ldIdx of ldList ) {

        const ld = this.linedefs[ ldIdx ];
        if ( ld.left < 0 ) continue; // one-sided, no neighbor

        const frontSi = this.sidedefs[ ld.right ].sector;
        const backSi = this.sidedefs[ ld.left ].sector;

        if ( frontSi === si ) expanded.add( backSi );
        else expanded.add( frontSi );

      }

    }

    for ( const si of expanded ) {

      // Remove old group
      const old = this.sectorGroups.get( si );

      if ( old ) {

        this.root.remove( old );
        old.traverse( ( child ) => {

          if ( child instanceof Mesh ) child.geometry.dispose();

        } );

      }

      this.buildSector( si );

    }

  }

  private buildSector( si: number ): void {

    const group = new Group();
    this.sectorGroups.set( si, group );
    this.root.add( group );

    const sector = this.sectors[ si ];
    const wallBatches: Record<string, WallBatch> = {};

    // Build walls for all linedefs where this sector is the FRONT side
    const ldList = this.sectorLinedefs.get( si );

    if ( ldList ) {

      for ( const ldIdx of ldList ) {

        const ld = this.linedefs[ ldIdx ];

        // Only build walls where this sector is the front (right) side,
        // to avoid duplicate geometry
        if ( ld.right < 0 || this.sidedefs[ ld.right ].sector !== si ) continue;

        this.buildLinedefWalls( ld, wallBatches );

      }

    }

    // Flush wall batches to meshes
    for ( const key in wallBatches ) {

      const batch = wallBatches[ key ];
      if ( batch.positions.length === 0 ) continue;

      const geom = new BufferGeometry();
      geom.setAttribute( 'position', new Float32BufferAttribute( batch.positions, 3 ) );
      geom.setAttribute( 'uv', new Float32BufferAttribute( batch.uvs, 2 ) );
      geom.userData.scrolls=batch.scrolls;
      geom.computeVertexNormals();

      const mat = this.texMgr.getWallMaterial( batch.texName, batch.lightLevel, batch.masked );
      if ( mat ) group.add( new Mesh( geom, mat ) );

    }

    // Build floor + ceiling
    this.buildSectorFlats( si, group );

  }

  private buildLinedefWalls( ld: Linedef, batches: Record<string, WallBatch> ): void {

    const v1 = this.vertexes[ ld.v1 ];
    const v2 = this.vertexes[ ld.v2 ];
    const x1 = v1.x * SCALE, z1 = - v1.y * SCALE;
    const x2 = v2.x * SCALE, z2 = - v2.y * SCALE;

    const lowerUnpegged = ( ld.flags & 0x10 ) !== 0;
    const upperUnpegged = ( ld.flags & 0x08 ) !== 0;

    if ( ld.right >= 0 ) {

      const side = this.sidedefs[ ld.right ];
      const sector = this.sectors[ side.sector ];

      if ( ld.left < 0 ) {

        // One-sided: middle wall
        const floor = sector.floorHeight * SCALE;
        const ceil = sector.ceilingHeight * SCALE;
        const texData = this.texMgr.wallTextures[ side.middle ];
        const pegged = lowerUnpegged ? 'lower' : 'upper';
        this.addWallQuad( batches, side.middle, sector.lightLevel, x1, z1, x2, z2, floor, ceil, side, texData, pegged );

      } else {

        const backSector = this.sectors[ this.sidedefs[ ld.left ].sector ];

        // Upper wall (right side) — skip if both sectors are sky (r_segs.c)
        if ( sector.ceilingHeight > backSector.ceilingHeight && side.upper !== '-'
          && ! ( sector.ceilingTex === 'F_SKY1' && backSector.ceilingTex === 'F_SKY1' ) ) {

          const top = sector.ceilingHeight * SCALE;
          const bot = backSector.ceilingHeight * SCALE;
          const texData = this.texMgr.wallTextures[ side.upper ];
          const pegged = upperUnpegged ? 'upper' : 'lower';
          this.addWallQuad( batches, side.upper, sector.lightLevel, x1, z1, x2, z2, bot, top, side, texData, pegged );

        }

        // Lower wall (right side)
        if ( backSector.floorHeight > sector.floorHeight && side.lower !== '-' ) {

          const top = backSector.floorHeight * SCALE;
          const bot = sector.floorHeight * SCALE;
          const texData = this.texMgr.wallTextures[ side.lower ];
          const pegged = lowerUnpegged ? sector.ceilingHeight * SCALE : 'upper';
          this.addWallQuad( batches, side.lower, sector.lightLevel, x1, z1, x2, z2, bot, top, side, texData, pegged );

        }

        // Middle wall (right side, two-sided)
        if ( side.middle && side.middle !== '-' ) {

          const top = Math.min( sector.ceilingHeight, backSector.ceilingHeight ) * SCALE;
          const bot = Math.max( sector.floorHeight, backSector.floorHeight ) * SCALE;
          const texData = this.texMgr.wallTextures[ side.middle ];
          this.addWallQuad( batches, side.middle, sector.lightLevel, x1, z1, x2, z2, bot, top, side, texData, lowerUnpegged ? 'lower' : 'upper', true );

        }

      }

    }

    // Back side walls
    if ( ld.left >= 0 && ld.right >= 0 ) {

      const side = this.sidedefs[ ld.left ];
      const sector = this.sectors[ side.sector ];
      const frontSector = this.sectors[ this.sidedefs[ ld.right ].sector ];
      const bx1 = x2, bz1 = z2, bx2 = x1, bz2 = z1;

      // Skip upper wall if both sectors are sky
      if ( sector.ceilingHeight > frontSector.ceilingHeight && side.upper !== '-'
        && ! ( sector.ceilingTex === 'F_SKY1' && frontSector.ceilingTex === 'F_SKY1' ) ) {

        const top = sector.ceilingHeight * SCALE;
        const bot = frontSector.ceilingHeight * SCALE;
        const texData = this.texMgr.wallTextures[ side.upper ];
        const pegged = upperUnpegged ? 'upper' : 'lower';
        this.addWallQuad( batches, side.upper, sector.lightLevel, bx1, bz1, bx2, bz2, bot, top, side, texData, pegged );

      }

      if ( frontSector.floorHeight > sector.floorHeight && side.lower !== '-' ) {

        const top = frontSector.floorHeight * SCALE;
        const bot = sector.floorHeight * SCALE;
        const texData = this.texMgr.wallTextures[ side.lower ];
        const pegged = lowerUnpegged ? sector.ceilingHeight * SCALE : 'upper';
        this.addWallQuad( batches, side.lower, sector.lightLevel, bx1, bz1, bx2, bz2, bot, top, side, texData, pegged );

      }

      if ( side.middle && side.middle !== '-' ) {

        const top = Math.min( sector.ceilingHeight, frontSector.ceilingHeight ) * SCALE;
        const bot = Math.max( sector.floorHeight, frontSector.floorHeight ) * SCALE;
        const texData = this.texMgr.wallTextures[ side.middle ];
        this.addWallQuad( batches, side.middle, sector.lightLevel, bx1, bz1, bx2, bz2, bot, top, side, texData, lowerUnpegged ? 'lower' : 'upper', true );

      }

    }

  }

  private buildSectorFlats( si: number, group: Group ): void {

    const sector = this.sectors[ si ];
    const loops = buildSectorPolygons( si, this.linedefs, this.sidedefs, this.vertexes );

    for ( const {vertices:loop, triangles:tris} of triangulateSector(loops,this.vertexes) ) {

      if ( tris.length === 0 ) continue;

      const floorY = sector.floorHeight * SCALE;
      const ceilY = sector.ceilingHeight * SCALE;

      // Floor
      {

        const positions: number[] = [];
        const uvs: number[] = [];

        for ( let t = 0; t < tris.length; t += 3 ) {

          const va = this.vertexes[ loop[ tris[ t ] ] ];
          const vb = this.vertexes[ loop[ tris[ t + 1 ] ] ];
          const vc = this.vertexes[ loop[ tris[ t + 2 ] ] ];

          positions.push(
            va.x * SCALE, floorY, - va.y * SCALE,
            vb.x * SCALE, floorY, - vb.y * SCALE,
            vc.x * SCALE, floorY, - vc.y * SCALE
          );

          uvs.push(
            va.x / 64, va.y / 64,
            vb.x / 64, vb.y / 64,
            vc.x / 64, vc.y / 64
          );

        }

        if ( positions.length > 0 ) {

          const geom = new BufferGeometry();
          geom.setAttribute( 'position', new Float32BufferAttribute( positions, 3 ) );
          geom.setAttribute( 'uv', new Float32BufferAttribute( uvs, 2 ) );
          geom.computeVertexNormals();

          const mat = this.texMgr.getFlatMaterial( sector.floorTex, sector.lightLevel );
          if ( mat ) group.add( new Mesh( geom, mat ) );

        }

      }

      // Ceiling (skip sky)
      if ( sector.ceilingTex !== 'F_SKY1' ) {

        const positions: number[] = [];
        const uvs: number[] = [];

        for ( let t = 0; t < tris.length; t += 3 ) {

          const va = this.vertexes[ loop[ tris[ t ] ] ];
          const vb = this.vertexes[ loop[ tris[ t + 1 ] ] ];
          const vc = this.vertexes[ loop[ tris[ t + 2 ] ] ];

          positions.push(
            va.x * SCALE, ceilY, - va.y * SCALE,
            vc.x * SCALE, ceilY, - vc.y * SCALE,
            vb.x * SCALE, ceilY, - vb.y * SCALE
          );

          uvs.push(
            va.x / 64, va.y / 64,
            vc.x / 64, vc.y / 64,
            vb.x / 64, vb.y / 64
          );

        }

        if ( positions.length > 0 ) {

          const geom = new BufferGeometry();
          geom.setAttribute( 'position', new Float32BufferAttribute( positions, 3 ) );
          geom.setAttribute( 'uv', new Float32BufferAttribute( uvs, 2 ) );
          geom.computeVertexNormals();

          const mat = this.texMgr.getFlatMaterial( sector.ceilingTex, sector.lightLevel );
          if ( mat ) group.add( new Mesh( geom, mat ) );

        }

      }

    }

  }

  private addWallQuad(
    batches: Record<string, WallBatch>,
    texName: string, lightLevel: number,
    x1: number, z1: number, x2: number, z2: number,
    bottom: number, top: number,
    sidedef: Sidedef, texData: TextureData | undefined,
    pegged: string | number, masked = false
  ): void {

    if ( top <= bottom ) return;

    const key = texName + '_' + lightLevel + '_' + masked;

    if ( ! batches[ key ] ) {

      batches[ key ] = { texName, lightLevel, masked, positions: [], uvs: [], scrolls: [] };

    }

    const batch = batches[ key ];

    const wallWidth = Math.sqrt( ( x2 - x1 ) ** 2 + ( z2 - z1 ) ** 2 );

    let tw = 64, th = 64;
    if ( texData ) { tw = texData.width; th = texData.height; }

    const uOff = ( sidedef.xoff * SCALE ) / ( tw * SCALE );

    const u0 = uOff;
    const u1 = uOff + wallWidth / ( tw * SCALE );

    // R_StoreWallRange / R_RenderMaskedSegRange: absolute world height of
    // texture row zero, including the sidedef row offset.
    const textureTop = (typeof pegged === 'number' ? pegged : pegged === 'lower'
      ? bottom + th * SCALE : top) + sidedef.yoff * SCALE;
    if (masked) {
      // Masked middle textures draw once vertically, clipped to the opening.
      top = Math.min(top, textureTop);
      bottom = Math.max(bottom, textureTop - th * SCALE);
      if (top <= bottom) return;
    }
    const v0 = (textureTop - top) / (th * SCALE);
    const v1 = (textureTop - bottom) / (th * SCALE);

    batch.positions.push(
      x1, top, z1, x2, bottom, z2, x2, top, z2,
      x1, top, z1, x1, bottom, z1, x2, bottom, z2
    );

    if(this.scrollingSides.has(sidedef))batch.scrolls.push({start:batch.uvs.length/2,side:sidedef,offset:sidedef.xoff,width:tw});
    batch.uvs.push(
      u0, v0, u1, v1, u1, v0,
      u0, v0, u0, v1, u1, v1
    );

  }

}

// Keep the old function signature as a convenience wrapper
export function buildScene(
  vertexes: Vertex[],
  linedefs: Linedef[],
  sidedefs: Sidedef[],
  sectors: Sector[],
  things: Thing[],
  wallTextures: Record<string, TextureData>,
  flats: Record<string, TextureData>,
  colormap: Uint8Array[],
  palette: Palette
): { group: Group; things: Thing[]; manager: SceneManager } {

  const manager = new SceneManager(
    vertexes, linedefs, sidedefs, sectors,
    wallTextures, flats, colormap, palette
  );

  return { group: manager.root, things, manager };

}
