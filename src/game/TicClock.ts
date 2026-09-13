// The sole wall-clock -> simulation boundary. Menus discard elapsed time;
// ordinary slow frames retain their backlog instead of slowing the game.
export class TicClock {
  private accumulator = 0;
  advance( delta: number, running: boolean, tick: () => void ): number {
    if ( ! running ) { this.accumulator = 0; return 0; }
    if ( ! Number.isFinite( delta ) || delta < 0 ) return 0;
    this.accumulator += delta;
    const count = Math.min( 8, Math.floor( ( this.accumulator + 1e-10 ) * 35 ) );
    this.accumulator = Math.max( 0, this.accumulator - count / 35 );
    for ( let i = 0; i < count; i ++ ) tick();
    return count;
  }
}
