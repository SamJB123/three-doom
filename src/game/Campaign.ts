// Ultimate Doom routing from g_game.c G_DoCompleted; music from s_sound.c.
export function nextMap(episode: number, map: number, secret: boolean): number | null {
  if (map === 8) return null;
  if (secret) return 9;
  if (map === 9) return [0,4,6,7,3][episode];
  return map + 1;
}
export function mapMusic(episode: number, map: number): string {
  const episode4=['E3M4','E3M2','E3M3','E1M5','E2M7','E2M4','E2M6','E2M5','E1M9'];
  return 'D_' + (episode === 4 ? episode4[map-1] : `E${episode}M${map}`);
}
export function skyTexture(episode: number): string { return `SKY${Math.min(episode,3)}`; }
export const EPISODES = ['Knee-Deep in the Dead','The Shores of Hell','Inferno','Thy Flesh Consumed'];
export const SKILLS = ["I'm too young to die.",'Hey, not too rough.','Hurt me plenty.','Ultra-Violence.','Nightmare!'];

// d_englsh.h HUSTR_E1M1..HUSTR_E4M9, shown by HU_Drawer on the automap.
const MAP_TITLES = [
  "E1M1: Hangar",
  "E1M2: Nuclear Plant",
  "E1M3: Toxin Refinery",
  "E1M4: Command Control",
  "E1M5: Phobos Lab",
  "E1M6: Central Processing",
  "E1M7: Computer Station",
  "E1M8: Phobos Anomaly",
  "E1M9: Military Base",
  "E2M1: Deimos Anomaly",
  "E2M2: Containment Area",
  "E2M3: Refinery",
  "E2M4: Deimos Lab",
  "E2M5: Command Center",
  "E2M6: Halls of the Damned",
  "E2M7: Spawning Vats",
  "E2M8: Tower of Babel",
  "E2M9: Fortress of Mystery",
  "E3M1: Hell Keep",
  "E3M2: Slough of Despair",
  "E3M3: Pandemonium",
  "E3M4: House of Pain",
  "E3M5: Unholy Cathedral",
  "E3M6: Mt. Erebus",
  "E3M7: Limbo",
  "E3M8: Dis",
  "E3M9: Warrens",
  "E4M1: Hell Beneath",
  "E4M2: Perfect Hatred",
  "E4M3: Sever The Wicked",
  "E4M4: Unruly Evil",
  "E4M5: They Will Repent",
  "E4M6: Against Thee Wickedly",
  "E4M7: And Hell Followed",
  "E4M8: Unto The Cruel",
  "E4M9: Fear"
];
export function mapTitle(episode:number,map:number):string {return MAP_TITLES[(episode-1)*9+map-1]??"";}
