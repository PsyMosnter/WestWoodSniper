// @ts-check
/** Placeholder audio facade — full procedural SFX arrive in Milestone 10. */
export class Audio {
  constructor() { this.ctx = null; this.sfxVol = 0.8; this.musicVol = 0.6; }
  unlock() {}
  setVolumes(sfx, music) { this.sfxVol = sfx; this.musicVol = music; }
  play() {}
  click() {} tick() {} squelch() {}
}
