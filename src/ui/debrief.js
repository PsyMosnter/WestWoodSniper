// @ts-check
import { C } from '../config/palette.js';
import { drawText } from '../render/font.js';
import { MenuBase, fmtTime } from '../scenes/menus.js';
import { panel } from './widgets.js';
import { Time } from '../core/time.js';
import { writeSave } from '../save.js';

const MEDAL_TEXT = {
  Surgeon: 'ALL RIFLE KILLS WERE HEADSHOTS',
  Phantom: 'NEVER DETECTED',
  'Pacifist-ish': 'ONLY TARGETS & THOSE WHO SAW YOU',
  Demolitions: 'ALL SECONDARY OBJECTIVES',
};
export const MISSION_ORDER = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7'];

/** Debrief (SPEC §17.3 #5): result, stars, medals, stats, Continue. Saves progress. */
export class DebriefScene extends MenuBase {
  enter(p) {
    if (p.won) { this.app.audio?.sting?.('win'); this.app.audio?.music?.('theme'); } else this.app.audio?.music?.(null);
    this.p = p;
    this.t = 0;
    const save = this.app.save;
    if (p.won && !p.debugRun) {
      const prev = save.missions[p.mission] || { stars: 0, medals: [], bestTime: null };
      save.missions[p.mission] = {
        stars: Math.max(prev.stars || 0, p.stars),
        medals: [...new Set([...(prev.medals || []), ...p.medals])],
        bestTime: prev.bestTime ? Math.min(prev.bestTime, p.stats.time) : p.stats.time,
      };
      const idx = MISSION_ORDER.indexOf(p.mission);
      save.unlocked = Math.max(save.unlocked || 1, Math.min(MISSION_ORDER.length, idx + 2));
      writeSave(save);
    }
    const next = MISSION_ORDER[MISSION_ORDER.indexOf(p.mission) + 1];
    if (p.won) {
      // a finished mission needs no mid-mission save any more
      this.app.checkpoint = null;
      if (this.app.save.resume?.[p.mission]) { delete this.app.save.resume[p.mission]; this.app.persist?.(); }
    }
    // a failed run can pick up from the mission's last save (objective autosave or QUICK SAVE)
    const cp = !p.won && this.app.checkpoint?.mission === p.mission;
    this.cont = this.addButton(p.won ? 'CONTINUE' : 'RETRY', () => {
      if (!p.won) this.app.scenes.go('game', { mission: p.mission });
      else if (this.app.hasScene('campaign')) this.app.scenes.go('campaign', { focus: next });
      else if (next && this.app.missionExists?.(next)) this.app.scenes.go('briefing', { mission: next });
      else this.app.scenes.go('title', {});
    }, { color: C.uiAmber });
    this.quit = this.addButton(p.won ? 'REPLAY' : 'QUIT', () => p.won ? this.app.scenes.go('briefing', { mission: p.mission }) : this.app.scenes.go(this.app.hasScene('campaign') ? 'campaign' : 'title', {}));
    this.cp = cp ? this.addButton('LOAD SAVE', () => this.app.scenes.go('game', { mission: p.mission, checkpoint: true }), { color: C.uiAmber }) : null;
    if (this.cp) this.cont.text = 'RESTART';
  }
  resize(W, H) {
    const B = Math.max(26, this.app.display.buttonSize);
    // centred (the scope's FIRE button lives bottom-right — a late tap must not hit RETRY)
    const row = [this.quit, this.cont, this.cp].filter(Boolean), bw = row.length > 2 ? 100 : 120, g = 8;
    const total = row.reduce((s, b) => s + (b === this.quit ? 100 : bw), 0) + g * (row.length - 1);
    let x = Math.round(W / 2 - total / 2);
    for (const b of row) { const w = b === this.quit ? 100 : bw; b.place(x, H - 10 - B, w, B); x += w + g; }
  }
  onPointerDown(p) { if (this.t < 1.1) return; super.onPointerDown(p); }
  frame(dt) { this.t += dt; }
  onKeyDown(code) { if (code === 'Enter' || code === 'Space') (this.cp || this.cont).onPress(); }
  render(ctx) {
    const { W, H } = this.app.display, p = this.p, s = p.stats;
    ctx.fillStyle = '#0B0E0C'; ctx.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 2) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, y, W, 1); }
    drawText(ctx, p.won ? 'MISSION ACCOMPLISHED' : 'MISSION FAILED', W / 2, 10, { align: 'center', color: p.won ? C.uiText : C.uiAlert, bold: true, scale: 2, shadow: '#000' });
    drawText(ctx, `"${p.name.toUpperCase()}"`, W / 2, 30, { align: 'center', color: C.uiAmber });
    // stars
    const k = Math.min(3, Math.floor(this.t / 0.35));
    const earned = [p.won, p.won && s.alarms === 0, p.won && s.time <= p.par];
    const why = ['COMPLETE', 'NO BASE ALARM', `UNDER PAR ${fmtTime(p.par)}`];
    for (let i = 0; i < 3; i++) {
      const lit = earned[i] && i < k + 1 && this.t > 0.2 + i * 0.3;
      drawText(ctx, lit ? '★' : '☆', W / 2 - 72 + i * 72, 44, { align: 'center', color: lit ? C.uiAmber : '#3A4A3C', scale: 2 });
      drawText(ctx, why[i], W / 2 - 72 + i * 72, 62, { align: 'center', font: '3x5', color: earned[i] ? C.uiTextD : '#3A4A3C' });
    }
    // stats
    const lx = 16, ly = 80;
    panel(ctx, lx - 6, ly - 6, Math.min(230, W / 2 - 10), 104, { alpha: 0.9 });
    const acc = s.rifleShots ? Math.round((s.rifleHits / s.rifleShots) * 100) + '%' : '—';
    const rows = [['TIME', fmtTime(s.time)], ['KILLS', s.kills], ['HEADSHOTS', s.headshots], ['TIMES DETECTED', s.timesDetected], ['ALARMS RAISED', s.alarms], ['SHOTS FIRED', s.rifleShots + s.pistolShots], ['RIFLE ACCURACY', acc]];
    rows.forEach(([a, b], i) => { drawText(ctx, a, lx, ly + i * 13, { color: C.uiTextD }); drawText(ctx, String(b), lx + Math.min(210, W / 2 - 30), ly + i * 13, { color: C.uiText, align: 'right' }); });
    // medals
    const mx = W / 2 + 10, my = 80;
    drawText(ctx, 'MEDALS', mx, my - 4, { color: C.uiAmber });
    const all = ['Surgeon', 'Phantom', 'Pacifist-ish', 'Demolitions'];
    all.forEach((m, i) => {
      const got = p.medals.includes(m);
      const y = my + 8 + i * 20;
      ctx.fillStyle = got ? C.uiAmber : '#26302A';
      ctx.fillRect(mx, y, 12, 12); ctx.fillStyle = got ? '#FFF1A8' : '#1B1F1C'; ctx.fillRect(mx + 3, y + 3, 6, 6);
      drawText(ctx, m.toUpperCase(), mx + 18, y, { color: got ? C.uiText : '#3E4A40' });
      drawText(ctx, MEDAL_TEXT[m], mx + 18, y + 8, { font: '3x5', color: got ? C.uiTextD : '#2E3A30' });
    });
    if (!p.won && p.reason) drawText(ctx, p.reason.toUpperCase(), W / 2, this.cont.y - 10, { color: C.uiAlert, font: '3x5', align: 'center' });
    if (p.debugRun) drawText(ctx, 'DEBUG RUN — PROGRESS NOT SAVED', W - 8, 8, { font: '3x5', color: C.uiGrey, align: 'right' });
    for (const b of this.buttons) b.enabled = this.t >= 1.1;
    this.drawButtons(ctx);
  }
}
