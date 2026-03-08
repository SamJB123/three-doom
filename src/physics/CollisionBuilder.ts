import {
  createWorld, createWorldSettings, registerAll, updateWorld,
  rigidBody, triangleMesh, capsule,
  MotionType, addBroadphaseLayer, addObjectLayer, enableCollision,
  kcc, filter
} from 'crashcat';
import type { Vertex, Linedef, Sidedef, Sector } from '../wad';
import { buildSectorPolygons, triangulate } from '../wad/SectorBuilder';

const SCALE = 1.0 / 32.0;

export interface PhysicsWorld {
  world: ReturnType<typeof createWorld>;
  character: ReturnType<typeof kcc.create>;
  queryFilter: ReturnType<typeof filter.create>;
  updateSettings: ReturnType<typeof kcc.createDefaultUpdateSettings>;
}

export function createPhysicsWorld(
  vertexes: Vertex[],
  linedefs: Linedef[],
  sidedefs: Sidedef[],
  sectors: Sector[]
): PhysicsWorld {

  registerAll();

  const settings = createWorldSettings();
  settings.gravity = [ 0, - 9.81, 0 ];

  const bpStatic = addBroadphaseLayer( settings );
  const bpDynamic = addBroadphaseLayer( settings );
  const layerWorld = addObjectLayer( settings, bpStatic );
  const layerPlayer = addObjectLayer( settings, bpDynamic );

  enableCollision( settings, layerPlayer, layerWorld );

  const world = createWorld( settings );

  // Build collision trimesh from map geometry
  const positions: number[] = [];
  const indices: number[] = [];
  let vertIdx = 0;

  function addQuad(
    x1: number, y1: number, z1: number,
    x2: number, y2: number, z2: number,
    x3: number, y3: number, z3: number,
    x4: number, y4: number, z4: number
  ): void {

    positions.push( x1, y1, z1, x2, y2, z2, x3, y3, z3, x4, y4, z4 );
    indices.push( vertIdx, vertIdx + 1, vertIdx + 2, vertIdx, vertIdx + 2, vertIdx + 3 );
    vertIdx += 4;

  }

  // Walls
  for ( const ld of linedefs ) {

    if ( ld.right < 0 ) continue;

    const v1 = vertexes[ ld.v1 ];
    const v2 = vertexes[ ld.v2 ];
    const side = sidedefs[ ld.right ];
    const sector = sectors[ side.sector ];

    const x1 = v1.x * SCALE, z1 = - v1.y * SCALE;
    const x2 = v2.x * SCALE, z2 = - v2.y * SCALE;

    if ( ld.left < 0 ) {

      // One-sided: solid wall
      const floor = sector.floorHeight * SCALE;
      const ceil = sector.ceilingHeight * SCALE;
      addQuad( x1, floor, z1, x2, floor, z2, x2, ceil, z2, x1, ceil, z1 );

    } else {

      const leftSide = sidedefs[ ld.left ];
      const backSector = sectors[ leftSide.sector ];

      // Upper wall
      if ( sector.ceilingHeight > backSector.ceilingHeight ) {

        const top = sector.ceilingHeight * SCALE;
        const bot = backSector.ceilingHeight * SCALE;
        addQuad( x1, bot, z1, x2, bot, z2, x2, top, z2, x1, top, z1 );

      }

      // Lower wall (steps/ledges)
      if ( backSector.floorHeight > sector.floorHeight ) {

        const top = backSector.floorHeight * SCALE;
        const bot = sector.floorHeight * SCALE;
        addQuad( x1, bot, z1, x2, bot, z2, x2, top, z2, x1, top, z1 );

      }

    }

  }

  // Floors and ceilings
  for ( let si = 0; si < sectors.length; si ++ ) {

    const sector = sectors[ si ];
    const loops = buildSectorPolygons( si, linedefs, sidedefs, vertexes );

    for ( const loop of loops ) {

      const flat2D: number[] = [];

      for ( const vi of loop ) {

        flat2D.push( vertexes[ vi ].x, vertexes[ vi ].y );

      }

      const tris = triangulate( flat2D );
      if ( tris.length === 0 ) continue;

      const floorY = sector.floorHeight * SCALE;
      const ceilY = sector.ceilingHeight * SCALE;

      // Floor
      const floorBase = vertIdx;

      for ( const vi of loop ) {

        const v = vertexes[ vi ];
        positions.push( v.x * SCALE, floorY, - v.y * SCALE );
        vertIdx ++;

      }

      for ( let t = 0; t < tris.length; t += 3 ) {

        indices.push( floorBase + tris[ t ], floorBase + tris[ t + 1 ], floorBase + tris[ t + 2 ] );

      }

      // Ceiling (reversed winding)
      const ceilBase = vertIdx;

      for ( const vi of loop ) {

        const v = vertexes[ vi ];
        positions.push( v.x * SCALE, ceilY, - v.y * SCALE );
        vertIdx ++;

      }

      for ( let t = 0; t < tris.length; t += 3 ) {

        indices.push( ceilBase + tris[ t ], ceilBase + tris[ t + 2 ], ceilBase + tris[ t + 1 ] );

      }

    }

  }

  // Create static collision body
  const shape = triangleMesh.create( {
    positions,
    indices
  } );

  rigidBody.create( world, {
    shape,
    objectLayer: layerWorld,
    motionType: MotionType.STATIC,
    position: [ 0, 0, 0 ]
  } );

  // Player character controller (capsule)
  // Doom player is 56 units tall, 32 units wide
  const playerHeight = 56 * SCALE;
  const playerRadius = 16 * SCALE;
  const halfCylinder = ( playerHeight - playerRadius * 2 ) / 2;

  const characterShape = capsule.create( {
    halfHeightOfCylinder: Math.max( 0.01, halfCylinder ),
    radius: playerRadius
  } );

  const character = kcc.create(
    {
      shape: characterShape,
      mass: 70,
      maxStrength: 100,
      maxSlopeAngle: Math.PI / 4,
      characterPadding: 0.02,
      penetrationRecoverySpeed: 1.0,
      predictiveContactDistance: 0.1,
      up: [ 0, 1, 0 ]
    },
    [ 0, 2, 0 ],
    [ 0, 0, 0, 1 ]
  );

  const queryFilter = filter.create( settings.layers );
  const updateSettings = kcc.createDefaultUpdateSettings();
  updateSettings.walkStairsStepUp = [ 0, 24 * SCALE, 0 ]; // Doom step height = 24 units
  updateSettings.stickToFloorStepDown = [ 0, - 8 * SCALE, 0 ];

  return { world, character, queryFilter, updateSettings };

}

export function updatePhysics( physics: PhysicsWorld, dt: number ): void {

  const gravity: [ number, number, number ] = [ 0, - 9.81, 0 ];
  kcc.update( physics.world, physics.character, dt, gravity, physics.updateSettings, undefined, physics.queryFilter );
  updateWorld( physics.world, undefined, dt );

}

export function setCharacterPosition( physics: PhysicsWorld, x: number, y: number, z: number ): void {

  physics.character.position = [ x, y, z ];

}

export function getCharacterPosition( physics: PhysicsWorld ): [ number, number, number ] {

  const p = physics.character.position;
  return [ p[ 0 ], p[ 1 ], p[ 2 ] ];

}

export function setCharacterVelocity( physics: PhysicsWorld, vx: number, vy: number, vz: number ): void {

  physics.character.linearVelocity = [ vx, vy, vz ];

}

export function isOnGround( physics: PhysicsWorld ): boolean {

  const state = physics.character.ground.state;
  return state === kcc.GroundState.ON_GROUND ||
         state === kcc.GroundState.ON_STEEP_GROUND;

}
