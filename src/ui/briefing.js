// @ts-check
import { C } from '../config/palette.js';
import { drawText, wrapText, measureText } from '../render/font.js';
import { MenuBase } from '../scenes/menus.js';
import { panel } from './widgets.js';
import { Time } from '../core/time.js';
import { makeCanvas } from '../render/pixel.js';
import { GameMap } from '../world/map.js';
import { O, T } from '../world/tiles.js';

/**
 * Briefing (SPEC §17.3 #3): OVERWATCH typewriter text, an overhead preview of the mission area
 * (fog-covered, objective markers), loadout, Deploy.
 */
export class BriefingScene extends MenuBase {
  enter(params) {
    this.missionId = params.mission;
    this.t = 0;
    this.data = null;
    this.deploy = this.addButton('DEPLOY', () => this.app.scenes.go('game', { mission: this.missionId }), { color: C.uiAmber });
    this.back = this.addButton('BACK', () => this.app.scenes.go(this.app.hasScene('campaign') ? 'campaign' : 'title', {}));
    this.skip = false;
    this._load();
  }
  async _load() {
    const mod = await import(`../missions/${this.missionId}.js`);
    this.data = mod.default;
    this.preview = buildPreview(this.data);
  }
  resize(W, H) {
    const B = Math.max(26, this.app.display.buttonSize);
    this.deploy.place(W - 8 - 110, H - 8 - B, 110, B);
    this.back.place(W - 8 - 110 - 6 - 80, H - 8 - B, 80, B);
  }
  frame(dt) { this.t += dt; }
  onBackgroundDown() { this.t += 100; } // tap to finish the typewriter
  onKeyDown(code) { if (code === 'Enter' || code === 'Space') this.app.scenes.go('game', { mission: this.missionId }); if (code === 'Escape') this.back.onPress(); }
  render(ctx) {
    const { W, H } = this.app.display;
    ctx.fillStyle = '#0B0E0C'; ctx.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 2) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, y, W, 1); }
    const d = this.data;
    if (!d) { drawText(ctx, 'DECRYPTING…', W / 2, H / 2, { align: 'center' }); return; }
    const idx = +this.missionId.slice(1);
    drawText(ctx, `MISSION ${idx} — "${d.name.toUpperCase()}"`, 10, 8, { color: C.uiAmber, bold: true, scale: 1 });
    drawText(ctx, (d.kind || '').toUpperCase().replace('·', '-'), 10, 19, { font: '3x5', color: C.uiTextD });
    // preview map
    const pw = Math.min(Math.floor(W * 0.42), 220), ph = Math.floor(pw * this.preview.height / this.preview.width);
    const px = W - pw - 10, py = 10;
    panel(ctx, px - 3, py - 3, pw + 6, Math.min(ph, H - 70) + 6, { rivets: true, fill: '#07090A' });
    ctx.drawImage(this.preview, px, py, pw, Math.min(ph, H - 70));
    const sx = pw / d.size.w, sy = Math.min(ph, H - 70) / d.size.h;
    const blink = Math.floor(Time.realTime * 3) & 1;
    const labels = objectiveLabels(d);
    for (const o of d.objectives || []) {
      const L = labels.get(o.id);
      if (!L) continue;
      ctx.strokeStyle = o.primary ? C.uiAmber : '#C8A060';
      const x = Math.round(px + L.x * sx), y = Math.round(py + L.y * sy);
      if (L.w) { if (blink || !o.primary) ctx.strokeRect(x + 0.5, y + 0.5, Math.max(3, Math.round(L.w * sx)), Math.max(3, Math.round(L.h * sy))); }
      else if (blink || !o.primary) ctx.strokeRect(x - 2.5, y - 2.5, 6, 6);
      const lx = L.w ? x + Math.max(3, Math.round(L.w * sx)) + 2 : x + 5, ly = y - 3;
      ctx.fillStyle = 'rgba(7,9,10,0.85)'; ctx.fillRect(lx - 1, ly - 1, measureText(L.tag, { font: '3x5' }) + 2, 7);
      drawText(ctx, L.tag, lx, ly, { font: '3x5', color: o.primary ? C.uiAmber : '#C8A060' });
    }
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(Math.round(px + d.player.x * sx) - 1, Math.round(py + d.player.y * sy) - 1, 3, 3);
    drawText(ctx, 'START', Math.round(px + d.player.x * sx) + 3, Math.round(py + d.player.y * sy) - 2, { font: '3x5', color: '#FFFFFF', shadow: '#000' });
    // typewriter briefing
    const textW = px - 24;
    const full = 'OVERWATCH: ' + d.briefing.text;
    const n = Math.min(full.length, Math.floor(this.t * 40));
    const lines = wrapText(full.slice(0, n), textW, {});
    let y = 32;
    lines.forEach((ln, i) => { drawText(ctx, ln, 10, y, { color: i === 0 && ln.startsWith('OVERWATCH') ? C.uiText : C.uiText }); y += 10; });
    if (n < full.length && (Math.floor(Time.realTime * 8) & 1)) { ctx.fillStyle = C.uiText; ctx.fillRect(10 + measureText(lines[lines.length - 1] || '') + 2, y - 10, 4, 7); }
    // objectives list
    y += 6;
    drawText(ctx, 'OBJECTIVES', 10, y, { font: '3x5', color: C.uiAmber }); y += 8;
    for (const o of d.objectives) {
      if (o.hidden) continue;
      const tag = labels.get(o.id)?.tag;
      for (const ln of wrapText((tag ? `[${tag}] ` : '') + (o.primary ? '• ' : '(OPT) ') + o.text.toUpperCase(), textW, { font: '3x5' })) { drawText(ctx, ln, 12, y, { font: '3x5', color: o.primary ? C.uiText : C.uiTextD }); y += 7; }
    }
    if (d.intel) {
      y += 6;
      drawText(ctx, 'INTEL', 10, y, { font: '3x5', color: C.uiAmber }); y += 8;
      for (const ln of wrapText(d.intel.toUpperCase(), textW, { font: '3x5' })) { drawText(ctx, ln, 12, y, { font: '3x5', color: C.uiTextD }); y += 7; }
    }
    // loadout
    const lo = d.player.loadout;
    const items = [`RIFLE ${lo.rifle}`, `C4 ×${lo.c4 || 0}`, `MEDKIT ×${lo.medkit || 0}`];
    if (lo.designator) items.push(`STRIKE ×${lo.designator}`);
    if (lo.smoke) items.push(`SMOKE ×${lo.smoke}`);
    drawText(ctx, 'LOADOUT  ' + items.join('   '), 10, H - 20, { font: '3x5', color: C.uiAmber });
    this.drawButtons(ctx);
  }
}

/** Map positions + letter tags (A, B, C…, LZ) for the visible objectives that have a place on the map. */
export function objectiveLabels(d) {
  const out = new Map();
  let n = 0;
  for (const o of d.objectives || []) {
    if (o.hidden) continue;
    let pos = null;
    if (o.area && d.areas?.[o.area]) { const a = d.areas[o.area]; pos = { x: a.x, y: a.y, w: a.w, h: a.h }; }
    else if (o.entities?.length) { const s = (d.structures || []).find((q) => q.id === o.entities[0]); if (s) pos = { x: s.x + 0.5, y: s.y + 0.5 }; }
    else if (o.unit) { const u = (d.units || []).find((q) => q.id === o.unit); if (u) pos = { x: u.x + 0.5, y: u.y + 0.5 }; }
    if (!pos) continue;
    pos.tag = o.type === 'EXTRACT' ? 'LZ' : String.fromCharCode(65 + n++);
    out.set(o.id, pos);
  }
  return out;
}

/** Fog-covered overhead preview: terrain silhouette darkened, roads & water visible. */
export function buildPreview(data) {
  const m = new GameMap(data);
  const c = makeCanvas(m.w, m.h);
  const ctx = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  const img = ctx.createImageData(m.w, m.h);
  for (let i = 0; i < m.w * m.h; i++) {
    const t = m.terrain[i], o = m.overlay[i];
    let col = [36, 52, 30];
    if (t === T.deep || t === T.shallow) col = [22, 48, 66];
    else if (t === T.road) col = [70, 62, 44];
    else if (o === O.forest || o === O.pine) col = [20, 34, 18];
    else if (t === T.sand || t === T.dirt) col = [66, 56, 36];
    else if (t === T.snow || t === T.ice) col = [96, 104, 110];
    else if (t === T.lava) col = [120, 50, 14];
    const f = 1 + m.elev[i] * 0.22;
    if (m.cliff[i]) col = [70, 66, 60];
    // dithered "fog" look
    const x = i % m.w, y = (i / m.w) | 0;
    const dim = ((x + y) & 1) ? 0.72 : 0.62;
    img.data[i * 4] = col[0] * f * dim; img.data[i * 4 + 1] = col[1] * f * dim; img.data[i * 4 + 2] = col[2] * f * dim; img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
