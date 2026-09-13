// Browser session boundary. Source anchors: m_menu.c M_Responder and
// p_tick.c P_Ticker's single-player menu pause. Not yet g_game.c's full lifecycle.
export type MenuPage = 'main' | 'help' | 'restart' | 'end' | 'episodes' | 'skills' | 'nightmare' | 'options' | 'intermission' | 'finale' | 'save' | 'load';

export class GameSession {
  started = false;
  phase: 'level' | 'intermission' | 'finale' = 'level';
  menu: MenuPage | null = 'main';

  get attracting(): boolean { return !this.started && this.menu === null; }

  get running(): boolean { return this.started && this.phase === 'level' && this.menu === null; }

  get presenting(): boolean {return this.started && this.phase!=='level' && this.menu===this.phase;}

  start(): void { this.started = true; this.phase = 'level'; this.menu = null; }
  open(): void { this.menu = 'main'; }
  resume(): void { if ( this.started ) this.menu = this.phase === 'level' ? null : this.phase; }
  back(): void {
    if (this.menu === 'skills') this.menu = 'episodes';
    else if (this.menu === 'nightmare') this.menu = 'skills';
    else if ( this.menu !== 'main' ) this.menu = 'main';
    else this.resume();
  }
}
