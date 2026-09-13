// Doom thinker system — a list of active "thinkers" that run every tic.
// Each thinker is a function that returns false when it should be removed.

export interface ThinkerRecord { kind: string; data: unknown }
export type ThinkerFn = (() => boolean) & { archive?: () => ThinkerRecord }; // return true to keep alive, false to remove

const thinkers: { fn: ThinkerFn; removed: boolean }[] = [];
export function resetThinkers(): void { thinkers.length = 0; dirtySectors.clear(); busySectors.clear(); }

export const busySectors = new Set<number>();

// Set of dirty sector indices — sectors whose geometry needs visual update
export const dirtySectors = new Set<number>();

export function addThinker( fn: ThinkerFn ): void {

  thinkers.push( { fn, removed: false } );

}

export function removeThinker( fn: ThinkerFn ): void {

  const entry = thinkers.find(entry => entry.fn === fn && !entry.removed);
  if (entry) entry.removed = true;

}

export function runThinkers(): void {

  // P_RunThinkers: insertion order, lazy removal, including thinkers appended
  // by an action during this tic. Tombstones prevent removal from skipping peers.
  for (let i = 0; i < thinkers.length; i++) {
    const entry = thinkers[i];
    if (entry.removed) { thinkers.splice(i--, 1); continue; }
    if (!entry.fn()) entry.removed = true;
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

// Fail loudly if a newly introduced thinker has not implemented save support.
export function archiveThinkers(): ThinkerRecord[] {
  return thinkers.filter(t=>!t.removed).flatMap(({fn})=>{
    if (!fn.archive) throw new Error('Cannot save an unregistered thinker');
    const record=fn.archive();
    return record.data === undefined ? [] : [structuredClone(record)];
  });
}
export function archivedThinker(fn: ThinkerFn, kind: string, data: () => unknown): ThinkerFn {
  fn.archive = () => ({kind, data: data()});
  return fn;
}
