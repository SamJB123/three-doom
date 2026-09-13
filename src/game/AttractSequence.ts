/** Retail D_DoAdvanceDemo / D_PageTicker. Menus pause the caller's TicClock. */
export class AttractSequence {
  index = 0;
  remaining = 170;
  private static readonly stages = ['TITLEPIC', 'DEMO1', 'CREDIT', 'DEMO2', 'CREDIT', 'DEMO3', 'DEMO4'] as const;
  get name(): string { return AttractSequence.stages[this.index]; }
  get demo(): boolean { return this.name.startsWith('DEMO'); }
  reset(): void { this.index = 0; this.remaining = 170; }
  tick(): boolean { return !this.demo && --this.remaining < 0; }
  advance(): void {
    this.index = (this.index + 1) % AttractSequence.stages.length;
    this.remaining = this.index === 0 ? 170 : this.demo ? 0 : 200;
  }
}
