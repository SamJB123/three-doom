// Doom thinker system — a list of active "thinkers" that run every tic.
// Each thinker is a function that returns false when it should be removed.

export type ThinkerFn = () => boolean; // return true to keep alive, false to remove

const thinkers: ThinkerFn[] = [];

// Set of dirty sector indices — sectors whose geometry needs visual update
export const dirtySectors = new Set<number>();

export function addThinker( fn: ThinkerFn ): void {

  thinkers.push( fn );

}

export function removeThinker( fn: ThinkerFn ): void {

  const idx = thinkers.indexOf( fn );
  if ( idx >= 0 ) thinkers.splice( idx, 1 );

}

export function runThinkers(): void {

  // Run in reverse so removals during iteration are safe
  for ( let i = thinkers.length - 1; i >= 0; i -- ) {

    if ( ! thinkers[ i ]() ) {

      thinkers.splice( i, 1 );

    }

  }

}

export function markSectorDirty( sectorIdx: number ): void {

  dirtySectors.add( sectorIdx );

}

export function clearDirtySectors(): void {

  dirtySectors.clear();

}

export function hasDirtySectors(): boolean {

  return dirtySectors.size > 0;

}
