import { Intermission } from './Intermission';
import { WadGraphics } from './WadGraphics';
import { Finale } from './Finale';
import type { WAD, Palette } from '../wad';
import { getLump, parsePatch } from '../wad';
import { EPISODES, SKILLS } from '../game/Campaign';
import type { Skill } from '../game/GameRules';
import { GameSession } from '../game/GameSession';
import './menu.css';

interface Actions {
  beginWipe?:()=>void;
  transitionBusy?:()=>boolean;
  messages: (enabled:boolean)=>void;
  changed: () => void;
  save: (slot: number) => void;
  load: (slot: number) => void;
  slotLabel: (slot: number) => string;
  newGame: (episode: number, skill: Skill) => void;
  next: () => void;
  volume: (music: number, sound: number) => void;
  end: () => void;
}

export interface CompletionStats {
  episode: number; map: number; next: number | null; kills: number; totalKills: number;
  items: number; totalItems: number; secrets: number; totalSecrets: number; time: number; didSecret?: boolean;
}

export class GameMenu {
  private wadGraphics: WadGraphics;
  get screen():HTMLCanvasElement|null {
    if(!this.session.started)return this.wadGraphics.patch('TITLEPIC')?.canvas??null;
    return this.session.phase==='finale'?this.finale?.canvas??null:this.session.phase==='intermission'?this.intermission?.canvas??null:null;
  }
  private finale: Finale | null = null;
  get presentationMusic(): string {return this.session.phase==='finale' ? this.finale?.music ?? 'D_VICTOR' : 'D_INTER';}
  private intermission: Intermission | null = null;
  private advanceButton: HTMLButtonElement | null = null;
  tickPresentation(): boolean {
    if(this.session.phase==='finale'){if(this.finale?.willTransition)this.actions.beginWipe?.();this.finale?.tick();return false;}
    const done=this.intermission?.tick() ?? false;
    if(this.advanceButton && this.intermission){const label=this.intermission.state.label;if(this.advanceButton.getAttribute('aria-label')!==label){this.advanceButton.replaceChildren(this.wadGraphics.label(label));this.advanceButton.setAttribute('aria-label',label);}}
    return done;
  }
  inspectPresentation() {const state=this.intermission?.state;return state ? {phase:state.phase,stage:state.stage,tic:state.tic,counts:[...state.counts]} : null;}
  finishPresentation(): void {this.actions.next();}
  private episode=1;
  private error: string | null = null;
  private stats: CompletionStats | null=null;
  private messagesEnabled=true;
  private musicVolume=70;
  private soundVolume=100;
  refresh(): void { this.changed(); }
  complete(stats: CompletionStats): void {
    this.stats=stats;
    this.finale=stats.next===null ? new Finale(stats.episode,this.wadGraphics) : null;
    this.intermission=stats.next===null ? null : new Intermission({...stats,next:stats.next},this.wadGraphics);
    this.session.phase=stats.next===null ? 'finale' : 'intermission';
    this.session.menu=this.session.phase;
    this.changed();
  }
  private overlay = document.createElement( 'div' );
  private panel = document.createElement( 'section' );
  private menuButton = document.createElement( 'button' );
  private graphics = new Map<string, string>();

  constructor( private session: GameSession, wad: WAD, palette: Palette, private actions: Actions ) {
    this.wadGraphics=new WadGraphics(wad,palette);
    for ( const name of [ 'TITLEPIC', 'M_DOOM', 'M_NGAME', 'M_SAVEG', 'M_LOADG', 'M_ENDGAM', 'M_RDTHIS', 'M_OPTION', ...[1,2,3,4].map(i=>`M_EPI${i}`), 'M_JKILL','M_ROUGH','M_HURT','M_ULTRA','M_NMARE' ] ) {
      const lump = getLump( wad, name );
      if ( ! lump ) continue;
      const patch = parsePatch( wad, lump.offset );
      const canvas = document.createElement( 'canvas' );
      canvas.width = patch.width; canvas.height = patch.height;
      const ctx = canvas.getContext( '2d' )!;
      const pixels = ctx.createImageData( patch.width, patch.height );
      for ( let i = 0; i < patch.pixels.length; i ++ ) {
        const color = patch.pixels[ i ];
        if ( color < 0 ) continue;
        pixels.data.set( [ palette[ color * 3 ], palette[ color * 3 + 1 ], palette[ color * 3 + 2 ], 255 ], i * 4 );
      }
      ctx.putImageData( pixels, 0, 0 );
      this.graphics.set( name, canvas.toDataURL() );
    }
    this.overlay.id = 'doom-menu';
    this.overlay.setAttribute( 'role', 'dialog' );
    this.overlay.setAttribute( 'aria-modal', 'true' );
    this.overlay.setAttribute( 'aria-label', 'Doom menu' );
    this.overlay.append( this.panel );
    this.menuButton.id = 'menu-button';
    this.menuButton.append(this.wadGraphics.label('Menu'));
    this.menuButton.setAttribute( 'aria-label', 'Open menu' );
    this.menuButton.onclick = () => this.open();
    document.body.append( this.menuButton, this.overlay );
    document.addEventListener( 'keydown', e => this.keyDown( e ), true );
    this.render();
  }

  open(): void { this.session.open(); this.changed(); }
  start(): void { this.session.start(); this.changed(); }

  private changed(): void {
    this.render();
    this.actions.changed();
  }

  private button( label: string, action: () => void, graphic?: string ): HTMLButtonElement {
    const button = document.createElement( 'button' );
    button.type = 'button';
    button.setAttribute( 'aria-label', label );
    const src = graphic && this.graphics.get( graphic );
    const menuLabel=this.wadGraphics.menuLabel(label);
    if(menuLabel)button.append(menuLabel);
    else if ( src ) {
      const img = document.createElement( 'img' ); img.src = src; img.alt = label;
      button.append( img );
    } else button.append(this.wadGraphics.label(label));
    button.onclick = ()=>{if(this.session.presenting && this.actions.transitionBusy?.())return;action();};
    this.panel.append( button );
    return button;
  }

  private render(): void {
    const { session } = this;
    this.overlay.hidden = session.running;
    this.menuButton.hidden = !(session.running || session.presenting);
    this.overlay.classList.toggle( 'title-screen', ! session.started );
    this.overlay.classList.toggle('presentation-screen',session.presenting);
    this.overlay.style.backgroundImage = ! session.started && this.graphics.has( 'TITLEPIC' )
      ? `linear-gradient(#0005, #000b), url("${ this.graphics.get( 'TITLEPIC' ) }")` : '';
    this.panel.replaceChildren();
    this.advanceButton=null;
    this.panel.classList.toggle('presentation-panel',session.presenting);
    if ( session.running ) return;
    const heading = document.createElement( 'h1' );
    const logo = this.graphics.get( 'M_DOOM' );
    if ( logo ) { const img = document.createElement( 'img' ); img.src = logo; img.alt = 'DOOM'; heading.append( img ); }
    else heading.textContent = 'DOOM';
    if(session.menu!=='finale' && session.menu!=='intermission')this.panel.append( heading );

    if ( session.menu === 'episodes' ) {
      EPISODES.forEach((name,i)=>this.button(name,()=>{this.episode=i+1; session.menu='skills'; this.changed();},`M_EPI${i+1}`));
      this.button('Back',()=>{session.back();this.changed();});
    } else if (session.menu === 'skills') {
      SKILLS.forEach((name,i)=>this.button(name,()=>{
        if (i===4) {session.menu='nightmare';this.changed();}
        else {this.actions.newGame(this.episode,(i+1) as Skill);this.start();}
      },['M_JKILL','M_ROUGH','M_HURT','M_ULTRA','M_NMARE'][i]));
      this.button('Back',()=>{session.back();this.changed();});
    } else if (session.menu === 'nightmare') {
      const warning=document.createElement('p');warning.textContent='Nightmare! Monsters are faster and respawn. Are you sure?';this.panel.append(warning);
      this.button('Cancel',()=>{session.back();this.changed();});
      this.button('Confirm',()=>{this.actions.newGame(this.episode,5);this.start();});
    } else if (session.menu === 'save' || session.menu === 'load') {
      const saving=session.menu==='save';
      for(let slot=0;slot<6;slot++)this.button(`${saving?'Save':'Load'} slot ${slot+1}: ${this.actions.slotLabel(slot)}`,()=>{
        try {
          if(saving)this.actions.save(slot);else this.actions.load(slot);
          this.error=null;session.menu='main';this.changed();
        } catch(error) {this.error=(error as Error).message;this.changed();}
      });
      if(this.error){const text=document.createElement('p');text.setAttribute('role','alert');text.textContent=this.error;this.panel.append(text);}
      this.button('Back',()=>{this.error=null;session.back();this.changed();});
    } else if (session.menu === 'options') {
      this.button(`Messages: ${this.messagesEnabled?'ON':'OFF'}`,()=>{this.messagesEnabled=!this.messagesEnabled;this.actions.messages(this.messagesEnabled);this.changed();});
      this.button(`Music volume: ${this.musicVolume}%`,()=>{this.musicVolume=(this.musicVolume+10)%110;this.actions.volume(this.musicVolume/100,this.soundVolume/100);this.changed();});
      this.button(`Sound volume: ${this.soundVolume}%`,()=>{this.soundVolume=(this.soundVolume+10)%110;this.actions.volume(this.musicVolume/100,this.soundVolume/100);this.changed();});
      this.button('Back',()=>{session.back();this.changed();});
    } else if ((session.menu === 'intermission' || session.menu === 'finale') && this.stats) {
      const stats=this.stats;
      const title=document.createElement('h2');title.className='screen-reader-only';title.textContent=stats.next===null ? `${EPISODES[stats.episode-1]} completed` : `E${stats.episode}M${stats.map} finished`;
      this.panel.append(title);
      if(this.finale){
        this.panel.append(this.finale.canvas);
        this.button('Show ending art',()=>{this.actions.beginWipe?.();this.finale?.showArt();});
      } else if(this.intermission) {
        this.panel.append(this.intermission.canvas);
        this.intermission.canvas.onclick=()=>this.intermission?.state.advance();
      }
      if(this.finale)this.button('Return to title',()=>this.actions.next());
      else if(this.intermission)this.advanceButton=this.button(this.intermission.state.label,()=>this.intermission?.state.advance());
    } else if ( session.menu === 'help' ) {
      const help = document.createElement( 'p' );
      help.className = 'menu-help';
      help.textContent = 'Move: WASD / arrows · Look: mouse · Fire: click / Ctrl · Use: E / F · Run: Shift · Weapons: 1–7 · Menu: Escape · Automap: Tab. Touch: drag left to move (start in the left circle to sprint), right to look (start in the right circle to fire); door button to use.';
      this.panel.append( help );
      this.button( 'Back', () => { session.back(); this.changed(); } );
    } else if ( session.menu === 'restart' || session.menu === 'end' ) {
      const prompt = document.createElement( 'p' );
      prompt.textContent = session.menu === 'restart' ? 'Start a new game? Current progress will be lost.' : 'End this game and return to the title?';
      this.panel.append( prompt );
      this.button( 'Cancel', () => { session.back(); this.changed(); } );
      this.button( 'Confirm', () => { if(session.menu === 'restart') {session.menu='episodes';this.changed();} else this.actions.end(); } );
    } else {
      if ( session.started ) this.button( 'Resume game', () => { session.resume(); this.changed(); } );
      this.button( 'New game', () => {
        if ( session.started ) { session.menu = 'restart'; this.changed(); }
        else {session.menu='episodes';this.changed();}
      }, 'M_NGAME' );
      if(session.started && session.phase==='level')this.button('Save game',()=>{this.error=null;session.menu='save';this.changed();},'M_SAVEG');
      this.button('Load game',()=>{this.error=null;session.menu='load';this.changed();},'M_LOADG');
      this.button('Options',()=>{session.menu='options';this.changed();},'M_OPTION');
      this.button( 'Read this', () => { session.menu = 'help'; this.changed(); }, 'M_RDTHIS' );
      if ( session.started ) this.button( 'End game', () => { session.menu = 'end'; this.changed(); }, 'M_ENDGAM' );
      const hint = document.createElement( 'p' );
      hint.className = 'menu-hint';
      hint.textContent = session.started ? 'Game paused · ↑ ↓ Enter · Escape to resume' : '↑ ↓ Enter or tap to choose';
      this.panel.append( hint );
    }
    const buttons=this.panel.querySelectorAll('button');
    buttons[session.menu==='skills' ? 2 : 0]?.focus();
  }

  private keyDown( e: KeyboardEvent ): void {
    if ( e.code === 'Escape' ) {
      e.preventDefault(); e.stopImmediatePropagation();
      if ( e.repeat ) return;
      if ( this.session.running ) this.open();
      else { this.session.back(); this.changed(); }
      return;
    }
    if(this.actions.transitionBusy?.() && (this.session.running||this.session.presenting)){e.preventDefault();e.stopImmediatePropagation();return;}
    if ( this.session.running ) return;
    if(this.session.presenting && ['ControlLeft','ControlRight','KeyE','KeyF'].includes(e.code)){
      e.preventDefault();e.stopImmediatePropagation();if(!e.repeat)this.intermission?.state.advance();return;
    }
    // All keyboard input belongs to the menu while it is open.
    e.stopImmediatePropagation();
    const buttons = Array.from( this.panel.querySelectorAll( 'button' ) );
    const current = buttons.indexOf( document.activeElement as HTMLButtonElement );
    if ( [ 'ArrowDown', 'ArrowUp', 'Tab', 'Home', 'End' ].includes( e.code ) ) {
      e.preventDefault();
      const dir = e.code === 'ArrowUp' || ( e.code === 'Tab' && e.shiftKey ) ? -1 : 1;
      const next = e.code === 'Home' ? 0 : e.code === 'End' ? buttons.length - 1 : ( current + dir + buttons.length ) % buttons.length;
      buttons[ next ]?.focus();
    } else if ( e.code === 'Enter' || e.code === 'Space' ) {
      e.preventDefault();
      if ( ! e.repeat ) buttons[ current ]?.click();
    } else if ( e.code === 'Backspace' ) {
      e.preventDefault(); this.session.back(); this.changed();
    }
  }
}
