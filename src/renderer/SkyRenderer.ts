import {
  Mesh, Group, CylinderGeometry, CircleGeometry, MeshBasicMaterial,
  DataTexture, RGBAFormat, NearestFilter, RepeatWrapping, ClampToEdgeWrapping,
  BackSide, Color
} from 'three/webgpu';
import type { TextureData } from '../wad/types';

// Original Doom sky facts (from r_sky.c, r_plane.c, r_draw.c):
//
// - Sky texture is 256 columns wide, 128 pixels tall.
// - ANGLETOSKYSHIFT = 22: viewangle >> 22 yields 1024 column values,
//   so the 256-wide texture repeats 4 times around 360°.
// - skytexturemid = 100 * FRACUNIT: texel row 100 (of 0–127) sits at
//   the screen's vertical center (the horizon).
//   That means 100 rows of sky above the horizon, 28 below.
// - dc_colormap = colormaps[0]: sky is always drawn full-bright.
// - Vertical wrap: (frac >> FRACBITS) & 127.

const SKY_RADIUS = 400;

// Doom maps 1024 angle units to 360°; texture is 256 wide → repeats 4×.
const SKY_REPEAT_X = 4;

export interface SkyInfo {
  mesh: Group;
  topColor: Color;
}

export function createSky( skyTexData: TextureData ): SkyInfo {

  const group = new Group();

  // ---- Compute vertical sizing from Doom's constants ----
  //
  // In Doom at 320×200, centery = 100, dc_iscale = FRACUNIT (1:1 mapping),
  // so each screen pixel = one texel row.  The sky texture is 128 px tall
  // with row 100 at the horizon.  That means 100 texel rows above the
  // horizon and 28 below.
  //
  // To replicate this on a cylinder we need the angular extent each texel
  // subtends.  At 320×200 with a 90° horizontal FOV the vertical FOV is
  // about 73.7°, spanning 200 pixels → ~0.369°/px.  So:
  //   above horizon: 100 px × 0.369° ≈ 36.9°
  //   below horizon: 28 px × 0.369° ≈ 10.3°
  //   total vertical arc ≈ 47.2°
  //
  // On a cylinder of radius R, an arc of θ radians has height R·tan(θ)
  // (for the angle from the eye to the cylinder wall).

  const aboveDeg = 100 * ( 73.74 / 200 ); // ≈ 36.87°
  const belowDeg = 28 * ( 73.74 / 200 );  // ≈ 10.32°
  const aboveRad = aboveDeg * Math.PI / 180;
  const belowRad = belowDeg * Math.PI / 180;

  const heightAbove = SKY_RADIUS * Math.tan( aboveRad );
  const heightBelow = SKY_RADIUS * Math.tan( belowRad );
  const totalHeight = heightAbove + heightBelow;

  // ---- Build cylinder ----
  const cylGeom = new CylinderGeometry(
    SKY_RADIUS, SKY_RADIUS, totalHeight,
    64, 1, true
  );

  // Doom's texture data is stored top-row-first, but DataTexture (with
  // default flipY=false) treats row 0 as the bottom.  Flip the rows so
  // the sky's top row ends up at the top of the cylinder.
  const { width, height, rgba } = skyTexData;
  const flipped = new Uint8Array( width * height * 4 );

  for ( let row = 0; row < height; row ++ ) {

    const srcOff = row * width * 4;
    const dstOff = ( height - 1 - row ) * width * 4;
    flipped.set( rgba.subarray( srcOff, srcOff + width * 4 ), dstOff );

  }

  const tex = new DataTexture( flipped, width, height, RGBAFormat );
  tex.magFilter = NearestFilter;
  tex.minFilter = NearestFilter;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = ClampToEdgeWrapping; // don't tile vertically
  tex.repeat.set( SKY_REPEAT_X, 1 );
  tex.needsUpdate = true;

  const cylMat = new MeshBasicMaterial( {
    map: tex,
    side: BackSide,
    depthWrite: false,
    fog: false
  } );

  const cylMesh = new Mesh( cylGeom, cylMat );

  // Position the cylinder so the horizon sits where Doom's row 100 is.
  // The cylinder's local origin is its center.  We want "heightBelow"
  // worth of cylinder below the origin and "heightAbove" above.
  // CylinderGeometry is centered at y=0, so shift it up by the
  // difference between the two halves.
  cylMesh.position.y = ( heightAbove - heightBelow ) / 2;
  group.add( cylMesh );

  // ---- Top-row color for cap and clear color ----
  // Use the first row of the original (un-flipped) data — that's the
  // top of the sky.
  let r = 0, g = 0, b = 0;

  for ( let x = 0; x < width; x ++ ) {

    r += rgba[ x * 4 ];
    g += rgba[ x * 4 + 1 ];
    b += rgba[ x * 4 + 2 ];

  }

  const topColor = new Color(
    r / ( width * 255 ),
    g / ( width * 255 ),
    b / ( width * 255 )
  );

  // ---- Top cap ----
  const capGeom = new CircleGeometry( SKY_RADIUS, 64 );
  const capMat = new MeshBasicMaterial( {
    color: topColor,
    side: BackSide,
    depthWrite: false,
    fog: false
  } );

  const capMesh = new Mesh( capGeom, capMat );
  capMesh.rotation.x = Math.PI / 2;
  capMesh.position.y = cylMesh.position.y + totalHeight / 2;
  group.add( capMesh );

  group.renderOrder = - 1;
  return { mesh: group, topColor };

}
