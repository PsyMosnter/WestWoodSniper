// @ts-check
import { C } from '../config/palette.js';
import { drawText, measureText, wrapText } from '../render/font.js';
import { MenuBase, fmtTime } from '../scenes/menus.js';
import { panel } from './widgets.js';
import { Time } from '../core/time.js';
import { makeCanvas } from '../render/pixel.js';
import { fbm, hash2 } from '../core/rng.js';
import { MISSION_ORDER } from './debrief.js';

/** Mission nodes on the original campaign map (normalised 0..1 coordinates). */
const NODES = [
  { id: 'm1', name: 'First Light', kind: 'Reconnaissance', x: 0.16, y: 0.46, biome: '#5E7E36' },
  { id: 'm2', name: 'Blackout', kind: 'Sabotage', x: 0.27, y: 0.72, biome: '#B8946A' },
  { id: 'm3', name: 'Needle', kind: 'Assassination', x: 0.39, y: 0.2, biome: '#D2DFE6' },
  { id: 'm4', name: 'Lifeline', kind: 'Escort', x: 0.49, y: 0.76, biome: '#C2A56A' },
  { id: 'm5', name: 'Sunhammer', kind: 'Sabotage · strike', x: 0.64, y: 0.66, biome: '#2F5A2A' },
  { id: 'm6', name: 'Ghost Walk', kind: 'Rescue', x: 0.7, y: 0.34, biome: '#46503A' },
  { id: 'm7', name: 'Hive Heart', kind: 'Final assault', x: 0.86, y: 0.5, biome: '#4A3A36' },
];

/** Campaign map (SPEC §17.3 #2): 7 nodes, dotted route, locked greyed, stars & medals. */
export class CampaignScene extends MenuBase {
  enter(p = {}) {
    this.app.audio?.music?.('theme');
    this.t = 0;
    const save = this.app.save;
    const focusIdx = p.focus ? MISSION_ORDER.indexOf(p.focus) : -1;
    this.sel = focusIdx >= 0 && focusIdx < (save.unlocked || 1) ? focusIdx : Math.min((save.unlocked || 1) - 1, NODES.length - 1);
    this.brief = this.addButton('BRIEFING', () => this.go(), { color: C.uiAmber });
    this.back = this.addButton('MENU', () => this.app.scenes.go('title', {}));
    this.boot = this.addButton('BOOT CAMP', () => this.app.scenes.go('briefing', { mission: 'bc' }));
    // a new campaign asks once: Lt. Vale's 3-minute Boot Camp, or straight to Mission 1
    this.ask = !save.bootCamp && !save.missions?.m1 && this.app.missionExists('bc');
    this.askBoot = this.addButton('BOOT CAMP (3 MIN)', () => { this.ask = false; this.app.scenes.go('briefing', { mission: 'bc' }); }, { color: C.uiAmber });
    this.askSkip = this.addButton('SKIP TO MISSION 1', () => { this.ask = false; save.bootCamp = 'skipped'; this.app.persist?.(); });
    this.bg = null;
  }
  go() {
    const n = NODES[this.sel];
    if (this.sel >= (this.app.save.unlocked || 1)) return;
    if (!this.app.missionExists(n.id)) { this.toast = { text: 'CLASSIFIED — NOT YET AVAILABLE', t: 1.5 }; return; }
    this.app.scenes.go('briefing', { mission: n.id });
  }
  resize(W, H) {
    const B = Math.max(26, this.app.display.buttonSize);
    this.brief.place(W - 10 - 120, H - 10 - B, 120, B);
    this.back.place(10, H - 10 - B, 80, B);
    this.boot.place(10 + 80 + 6, H - 10 - B, 90, B);
    this.askBoot.place(Math.round(W / 2) - 150, Math.round(H / 2) + 12, 140, B);
    this.askSkip.place(Math.round(W / 2) + 10, Math.round(H / 2) + 12, 140, B);
    this.mapRect = { x: 8, y: 22, w: W - 16, h: H - 22 - B - 20 };
    this.bg = null;
  }
  frame(dt) { this.t += dt; if (this.toast) { this.toast.t -= dt; if (this.toast.t <= 0) this.toast = null; } }
  nodePos(n) { const r = this.mapRect; return { x: Math.round(r.x + n.x * r.w), y: Math.round(r.y + n.y * r.h) }; }
  onBackgroundDown(p) {
    if (this.ask) return;
    let best = -1, bd = 26;
    NODES.forEach((n, i) => { const q = this.nodePos(n); const d = Math.hypot(p.x - q.x, p.y - q.y); if (d < bd) { bd = d; best = i; } });
    if (best >= 0) {
      if (best === this.sel && best < (this.app.save.unlocked || 1)) this.go();
      else this.sel = best;
      this.app.audio?.click?.();
    }
  }
  onKeyDown(code) {
    if (this.ask) { if (code === 'Enter' || code === 'Space') this.askBoot.onPress(); if (code === 'Escape') this.askSkip.onPress(); return; }
    if (code === 'ArrowRight' || code === 'KeyD') this.sel = Math.min(NODES.length - 1, this.sel + 1);
    if (code === 'ArrowLeft' || code === 'KeyA') this.sel = Math.max(0, this.sel - 1);
    if (code === 'Enter' || code === 'Space') this.go();
    if (code === 'Escape') this.back.onPress();
  }
  buildBg(w, h) {
    const c = makeCanvas(w, h);
    const x = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
    const img = x.createImageData(w, h);
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
      const u = xx / w, v = yy / h;
      // an original landmass: noise island biased to the map centre, west coast & a southern gulf
      let n = fbm(u * 5, v * 4, 3, 4) + 0.35 - Math.hypot((u - 0.5) * 1.1, (v - 0.5) * 1.3) * 0.9;
      n -= Math.max(0, 0.12 - Math.hypot(u - 0.56, v - 0.95)) * 3;
      const i = (yy * w + xx) * 4;
      let col;
      if (n < 0.32) col = ((xx + yy) & 3) === 0 ? [18, 38, 48] : [14, 30, 40];
      else if (n < 0.34) col = [70, 110, 120];
      else {
        const e = fbm(u * 9, v * 9, 8, 3);
        col = e > 0.62 ? [98, 92, 80] : e > 0.5 ? [72, 84, 58] : [56, 70, 44];
        if (u < 0.3 && v > 0.3 && v < 0.62) col = [44, 68, 38];               // the West Wood
        if (u > 0.78 && v > 0.36 && v < 0.64) col = [70, 50, 44];             // volcanic east
      }
      if (xx % 24 === 0 || yy % 24 === 0) col = col.map((q) => q + 16);       // map grid
      img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    return c;
  }
  render(ctx) {
    const { W, H } = this.app.display;
    const save = this.app.save;
    const unlocked = save.unlocked || 1;
    ctx.fillStyle = '#0B0E0C'; ctx.fillRect(0, 0, W, H);
    const r = this.mapRect;
    if (!this.bg) this.bg = this.buildBg(r.w, r.h);
    panel(ctx, r.x - 3, r.y - 3, r.w + 6, r.h + 6, { rivets: true, fill: '#07090A' });
    ctx.drawImage(this.bg, r.x, r.y);
    drawText(ctx, 'THEATRE OF OPERATIONS — GOD / NOT FRONT', 10, 8, { color: C.uiAmber });
    // the front line (dashed amber) slowly advancing east with progress
    const fx = r.x + r.w * (0.22 + 0.1 * (unlocked - 1));
    ctx.fillStyle = 'rgba(255,178,58,0.55)';
    for (let y = r.y; y < r.y + r.h; y += 6) ctx.fillRect(Math.round(fx + Math.sin(y * 0.05) * 6), y, 2, 3);
    // dotted route between nodes
    for (let i = 0; i < NODES.length - 1; i++) {
      const a = this.nodePos(NODES[i]), b = this.nodePos(NODES[i + 1]);
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      ctx.fillStyle = i + 1 < unlocked ? C.uiText : '#3A4A3C';
      for (let s = 8; s < d - 8; s += 5) ctx.fillRect(Math.round(a.x + ((b.x - a.x) * s) / d), Math.round(a.y + ((b.y - a.y) * s) / d), 2, 2);
    }
    // nodes
    NODES.forEach((n, i) => {
      const p = this.nodePos(n);
      const open = i < unlocked, sel = i === this.sel, rec = save.missions[n.id];
      const R = sel ? 9 : 7;
      ctx.fillStyle = '#07090A'; ctx.fillRect(p.x - R - 1, p.y - R - 1, 2 * R + 2, 2 * R + 2);
      ctx.fillStyle = open ? n.biome : '#26302A'; ctx.fillRect(p.x - R, p.y - R, 2 * R, 2 * R);
      ctx.strokeStyle = sel ? C.uiAmber : open ? C.uiText : '#3A4A3C'; ctx.lineWidth = 1;
      ctx.strokeRect(p.x - R + 0.5, p.y - R + 0.5, 2 * R - 1, 2 * R - 1);
      drawText(ctx, String(i + 1), p.x, p.y - 3, { align: 'center', color: open ? '#FFFFFF' : C.uiGrey, shadow: '#000' });
      if (sel && open && (Math.floor(Time.realTime * 3) & 1)) { ctx.strokeStyle = C.uiAmber; ctx.strokeRect(p.x - R - 3.5, p.y - R - 3.5, 2 * R + 7, 2 * R + 7); }
      if (rec) drawText(ctx, '★'.repeat(rec.stars) + '☆'.repeat(3 - rec.stars), p.x, p.y + R + 3, { align: 'center', font: '3x5', color: C.uiAmber, shadow: '#000' });
      else if (!open) drawText(ctx, 'LOCKED', p.x, p.y + R + 3, { align: 'center', font: '3x5', color: C.uiGrey, shadow: '#000' });
    });
    // info panel for the selected node
    const n = NODES[this.sel], rec = save.missions[n.id], open = this.sel < unlocked;
    const pw = 150, ph = 58;
    const q = this.nodePos(n);
    let px = q.x + 16, py = q.y - ph / 2;
    if (px + pw > r.x + r.w) px = q.x - pw - 16;
    py = Math.max(r.y + 2, Math.min(r.y + r.h - ph - 2, py));
    panel(ctx, px, py, pw, ph, { alpha: 0.94 });
    drawText(ctx, `${this.sel + 1}. ${n.name.toUpperCase()}`, px + 5, py + 5, { color: open ? C.uiAmber : C.uiGrey });
    drawText(ctx, n.kind.toUpperCase().replace('·', '-'), px + 5, py + 15, { font: '3x5', color: C.uiTextD });
    if (rec) {
      drawText(ctx, `BEST ${fmtTime(rec.bestTime || 0)}  ${'★'.repeat(rec.stars)}`, px + 5, py + 24, { font: '3x5', color: C.uiText });
      drawText(ctx, (rec.medals || []).map((m) => m.toUpperCase()).join(' · ').replace(/·/g, '-') || 'NO MEDALS', px + 5, py + 32, { font: '3x5', color: C.uiAmber });
    } else drawText(ctx, open ? 'NOT YET ATTEMPTED' : 'COMPLETE THE PREVIOUS MISSION', px + 5, py + 26, { font: '3x5', color: open ? C.uiText : C.uiGrey });
    if (open) drawText(ctx, 'TAP AGAIN OR BRIEFING ▸', px + 5, py + ph - 10, { font: '3x5', color: C.uiTextD });
    this.brief.enabled = open;
    for (const b of [this.brief, this.back, this.boot]) b.visible = !this.ask;
    for (const b of [this.askBoot, this.askSkip]) b.visible = this.ask;
    if (this.ask) {
      ctx.fillStyle = 'rgba(7,9,10,0.72)'; ctx.fillRect(0, 0, W, H);
      const pw = 320, ph = 96, px = Math.round(W / 2 - pw / 2), py = Math.round(H / 2 - 62);
      panel(ctx, px, py, pw, ph + 44, { rivets: true, alpha: 0.97 });
      drawText(ctx, 'LT. VALE: FIRST TIME OUT, WREN?', px + 10, py + 8, { color: C.uiAmber });
      const lines = wrapText('Three minutes on my training range: walk, run, hide in tall grass, hunker and crawl, a silent takedown, a driver shot and C4 on a vehicle and a building. You can run it again any time from BOOT CAMP on the map.', pw - 20, { font: '5x7' });
      lines.forEach((ln, i) => drawText(ctx, ln, px + 10, py + 22 + i * 9, { color: C.uiText }));
    }
    this.drawButtons(ctx);
    if (this.toast) drawText(ctx, this.toast.text, W / 2, H / 2, { align: 'center', color: C.uiAmber, shadow: '#000' });
  }
}
