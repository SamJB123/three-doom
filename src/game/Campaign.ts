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
