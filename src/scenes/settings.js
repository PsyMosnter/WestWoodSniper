// @ts-check
import { C } from '../config/palette.js';
import { drawText } from '../render/font.js';
import { MenuBase } from './menus.js';
import { panel } from '../ui/widgets.js';
import { writeSave } from '../save.js';
import { Art } from '../render/artStyle.js';

/** Settings (SPEC §17.3 #6). Tap a row to cycle its value. */
const ROWS = [
  { key: 'music', label: 'MUSIC VOLUME', values: [0, 0.2, 0.4, 0.6, 0.8, 1], fmt: (v) => Math.round(v * 100) + '%' },
  { key: 'sfx', label: 'SFX VOLUME', values: [0, 0.2, 0.4, 0.6, 0.8, 1], fmt: (v) => Math.round(v * 100) + '%' },
  { key: 'difficulty', label: 'DIFFICULTY', values: ['recruit', 'operative', 'ghost'], fmt: (v) => v.toUpperCase() },
  { key: 'assistedAim', label: 'ASSISTED AIM', values: [false, true], fmt: (v) => (v ? 'ON' : 'OFF') },
  { key: 'reducedMotion', label: 'REDUCED MOTION', values: [false, true], fmt: (v) => (v ? 'ON' : 'OFF') },
  { key: 'colourBlind', label: 'COLOUR-BLIND ICONS', values: [false, true], fmt: (v) => (v ? 'ON' : 'OFF') },
  { key: 'handedness', label: 'HANDEDNESS', values: ['right', 'left'], fmt: (v) => v.toUpperCase() },
  { key: 'scanlines', label: 'SCAN-LINES', values: [true, false], fmt: (v) => (v ? 'ON' : 'OFF') },
  { key: 'remoteC4', label: 'REMOTE C4 DETONATION', values: [false, true], fmt: (v) => (v ? 'ON' : 'OFF') },
  // the original sprites stay available: NEW draws redesigns where they exist, CLASSIC everywhere else
  { key: 'artStyle', label: 'ART STYLE', values: ['classic', 'new', 'newest'], fmt: (v) => (v === 'newest' ? 'NEWEST' : v === 'new' ? (Art.count() ? 'NEW' : 'NEW (NONE YET)') : 'CLASSIC') },
];

export class SettingsScene extends MenuBase {
  enter() {
    this.rows = ROWS.map((r) => {
      const b = this.addButton('', () => this.cycle(r));
      b.row = r;
      return b;
    });
    this.back = this.addButton('BACK', () => { this.app.applySettings(); this.app.scenes.pop(); });
    this.prevScaleHold = true;
  }
  cycle(r) {
    const s = this.app.settings;
    const i = r.values.findIndex((v) => v === s[r.key]);
    s[r.key] = r.values[(i + 1) % r.values.length];
    this.app.save.settings = s;
    writeSave(this.app.save);
    this.app.applySettings();
  }
  resize(W, H) {
    const B = this.app.display.buttonSize;
    const cols = 2, perCol = Math.ceil(this.rows.length / cols);
    const bh = Math.max(24, Math.min(B, Math.floor((H - 34 - B - 8) / perCol) - 3));
    const bw = Math.min(250, Math.floor((W - 24) / cols));
    const x0 = Math.round(W / 2 - (bw * cols + 6) / 2);
    this.rows.forEach((b, i) => b.place(x0 + Math.floor(i / perCol) * (bw + 6), 28 + (i % perCol) * (bh + 3), bw, bh));
    this.back.place(Math.round(W / 2 - 55), H - B - 6, 110, B);
  }
  onKeyDown(code) { if (code === 'Escape') { this.app.applySettings(); this.app.scenes.pop(); } }
  render(ctx) {
    const { W, H } = this.app.display;
    ctx.fillStyle = 'rgba(7,9,10,0.95)'; ctx.fillRect(0, 0, W, H);
    drawText(ctx, 'SETTINGS', W / 2, 8, { align: 'center', color: C.uiAmber, bold: true, scale: 2 });
    for (const b of this.rows) {
      const r = b.row;
      b.text = '';
      b.draw(ctx);
      drawText(ctx, r.label, b.x + 6, b.y + Math.floor((b.h - 5) / 2), { color: C.uiText, font: '3x5' });
      drawText(ctx, r.fmt(this.app.settings[r.key]), b.x + b.w - 6, b.y + Math.floor((b.h - 7) / 2), { color: C.uiAmber, align: 'right' });
    }
    this.back.draw(ctx);
  }
}
