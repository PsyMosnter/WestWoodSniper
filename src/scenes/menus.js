// @ts-check
import { C } from '../config/palette.js';
import { drawText, measureText } from '../render/font.js';
import { TextButton, panel } from '../ui/widgets.js';
import { Time } from '../core/time.js';
import { makeCanvas } from '../render/pixel.js';

/** Shared helpers for simple button menus. */
export class MenuBase {
  constructor(app) { this.app = app; this.buttons = []; this.active = new Map(); }
  addButton(text, onPress, o = {}) { const b = new TextButton({ id: text, text, onPress, ...o }); this.buttons.push(b); return b; }
  onPointerDown(p) {
    for (const b of this.buttons) if (b.visible && b.enabled && b.hit(p.x, p.y)) { b.pressed = true; this.active.set(p.id, b); this.app.audio?.click?.(); return; }
    this.onBackgroundDown?.(p);
  }
  onPointerMove(p) { const b = this.active.get(p.id); if (b) b.pressed = b.hit(p.x, p.y); }
  onPointerUp(p) {
    const b = this.active.get(p.id);
    if (!b) return;
    this.active.delete(p.id);
    const fire = b.pressed; b.pressed = false;
    if (fire) b.onPress?.();
  }
  drawButtons(ctx) { for (const b of this.buttons) b.draw(ctx); }
}

/** Big pixel logo "WESTWOOD SNIPER" (original type, authored in code). */
let logoCache = null;
export function drawLogo(ctx, cx, y, scale = 3) {
  if (!logoCache || logoCache.scale !== scale) {
    const t1 = 'WESTWOOD', t2 = 'SNIPER';
    const w1 = measureText(t1, { bold: true, scale }), w2 = measureText(t2, { bold: true, scale: scale + 1 });
    const W = Math.max(w1, w2) + 8, H = 7 * scale + 7 * (scale + 1) + scale * 4 + 8;
    const c = makeCanvas(W, H);
    const x = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
    const y2 = 7 * scale + scale * 2 + 2;
    const layer = (dx, dy, col) => {
      drawText(x, t1, W / 2 + dx, 2 + dy, { bold: true, scale, color: col, align: 'center' });
      drawText(x, t2, W / 2 + dx, y2 + dy, { bold: true, scale: scale + 1, color: col, align: 'center' });
    };
    for (let k = 3; k >= 1; k--) layer(k, k, '#0D0F0E');
    layer(-1, 0, '#2A3018'); layer(1, 0, '#2A3018'); layer(0, -1, '#2A3018');
    layer(0, 0, '#A89968');
    // horizontal banding (khaki → olive), highlight row
    x.globalCompositeOperation = 'source-atop';
    for (let yy = 0; yy < H; yy++) {
      const rowInLetter = (yy - 2) % (scale) ;
      const k = yy / H;
      x.fillStyle = k < 0.18 ? '#D8CFA0' : k < 0.45 ? '#B8AA74' : k < 0.55 ? '#C4B687' : k < 0.8 ? '#8E8250' : '#6E6A3C';
      if (rowInLetter === 0 && yy % (scale * 2) === 2) x.fillStyle = '#E8E0B8';
      x.fillRect(0, yy, W, 1);
    }
    x.globalCompositeOperation = 'source-over';
    // redo outline/shadow under (so banding only hits letters)
    const c2 = makeCanvas(W, H);
    const x2 = /** @type {CanvasRenderingContext2D} */ (c2.getContext('2d'));
    const layer2 = (dx, dy, col) => {
      drawText(x2, t1, W / 2 + dx, 2 + dy, { bold: true, scale, color: col, align: 'center' });
      drawText(x2, t2, W / 2 + dx, y2 + dy, { bold: true, scale: scale + 1, color: col, align: 'center' });
    };
    for (let k = 4; k >= 1; k--) layer2(k, k, k > 2 ? '#07090A' : '#1B1F1C');
    layer2(-1, 0, '#1B1F1C'); layer2(1, 0, '#1B1F1C'); layer2(0, -1, '#1B1F1C'); layer2(0, 1, '#1B1F1C');
    x2.drawImage(c, 0, 0);
    // steel-blue underline accent
    logoCache = { canvas: c2, scale, w: W, h: H };
  }
  const L = logoCache;
  ctx.drawImage(L.canvas, Math.round(cx - L.w / 2), Math.round(y));
  return L;
}

/** In-game pause overlay (SPEC §17.3 #4). */
export class PauseScene extends MenuBase {
  enter(params) {
    this.game = params.game;
    this.prevScale = Time.scale;
    Time.scale = 0;
    this.showObj = false;
    this.addButton('RESUME', () => this.app.scenes.pop());
    this.addButton('RESTART', () => { this.app.scenes.go('game', { mission: this.game.missionId }); });
    this.addButton('QUICK SAVE', () => { this.app.scenes.pop(); this.game.quickSave(); });
    if (this.app.checkpoint?.mission === this.game.missionId) this.addButton('LOAD SAVE', () => { this.app.scenes.go('game', { mission: this.game.missionId, checkpoint: true }); });
    this.addButton('OBJECTIVES', () => { this.showObj = !this.showObj; });
    if (this.game.missionId !== 'test') this.addButton('BRIEFING', () => this.app.scenes.push('briefing', { mission: this.game.missionId, review: true }));
    this.addButton('SETTINGS', () => this.app.scenes.push('settings', {}));
    this.addButton('QUIT TO MAP', () => this.app.scenes.go(this.app.hasScene('campaign') ? 'campaign' : 'title', {}));
  }
  exit() { Time.scale = this.game?.scopeOpen ? 0.2 : 1; }
  resize(W, H) {
    const bw = 150, bh = Math.max(24, this.app.display.buttonSize);
    const gap = 3;
    // one column, or two when the list would not fit (short phone screens)
    const cols = this.buttons.length * (bh + gap) > H - 40 ? 2 : 1, rows = Math.ceil(this.buttons.length / cols);
    const total = rows * (bh + gap);
    const y0 = Math.max(22, Math.round(H / 2 - total / 2 + 8));
    this.buttons.forEach((b, i) => { const c = cols === 2 ? Math.floor(i / rows) : 0, r = cols === 2 ? i % rows : i; b.place(Math.round(W / 2 - (cols * bw + (cols - 1) * 6) / 2 + c * (bw + 6)), y0 + r * (bh + gap), bw, bh); });
  }
  onKeyDown(code) { if (code === 'Escape') { if (this.showObj) this.showObj = false; else this.app.scenes.pop(); } }
  onPointerDown(p) { if (this.showObj) { this.showObj = false; return; } super.onPointerDown(p); }
  render(ctx) {
    const { W, H } = this.app.display;
    ctx.fillStyle = 'rgba(7,9,10,0.72)';
    ctx.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 2) { ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(0, y, W, 1); }
    const b0 = this.buttons[0];
    drawText(ctx, 'PAUSED', W / 2, b0.y - 18, { align: 'center', color: C.uiAmber, bold: true, scale: 2, shadow: '#000' });
    this.drawButtons(ctx);
    if (this.showObj && this.game.objectives) {
      // modal over the menu; tap anywhere to close
      const list = this.game.objectives.list().filter((o) => !o.hidden);
      ctx.fillStyle = 'rgba(7,9,10,0.85)'; ctx.fillRect(0, 0, W, H);
      const pw = Math.min(300, W - 20), ph = list.length * 10 + 30;
      const px = Math.round(W / 2 - pw / 2), py = Math.round(H / 2 - ph / 2);
      panel(ctx, px, py, pw, ph);
      drawText(ctx, 'OBJECTIVES', W / 2, py + 5, { align: 'center', color: C.uiAmber });
      list.forEach((o, i) => drawText(ctx, (o.done ? '[X] ' : o.failed ? '[-] ' : '[ ] ') + (o.primary ? '' : '(OPTIONAL) ') + o.text.toUpperCase(), px + 8, py + 18 + i * 10, { font: '3x5', color: o.done ? C.uiTextD : o.primary ? C.uiText : C.uiAmber }));
      drawText(ctx, 'TAP TO CLOSE', W / 2, py + ph - 9, { align: 'center', font: '3x5', color: C.uiGrey });
    }
  }
}

/** Title screen (SPEC §17.3 #1). Background: slow pan over the West Wood tree line. */
export class TitleScene extends MenuBase {
  enter() {
    this.t = 0;
    this.bg = null;
    this.app.audio?.music?.('theme');
    this.addButton('START', () => this.app.playCut('intro', () => this.app.startCampaign()));
    this.cont = this.addButton('CONTINUE', () => this.app.continueCampaign());
    this.cont.enabled = this.app.save.unlocked > 1 || Object.keys(this.app.save.resume || {}).length > 0;
    this.addButton('SETTINGS', () => this.app.scenes.push('settings', {}));
    this.addButton('CREDITS', () => this.app.scenes.push('credits', {}));
    this.addButton('INTRO', () => this.app.playCut('intro', () => this.app.scenes.go('title', {})));
    this._makeBg();
  }
  async _makeBg() {
    try {
      const { World } = await import('../world/world.js');
      const { Camera } = await import('../core/camera.js');
      const { Renderer } = await import('../render/renderer.js');
      const data = (await import('../missions/m1.js')).default;
      const world = new World(data, { seed: 7 });
      world.fog.revealAll = true;
      world.operative.x = -50; world.operative.px = -50; world.operative.y = -50; world.operative.py = -50;
      const cam = new Camera();
      cam.setMap(data.size.w, data.size.h);
      const r = new Renderer(world, cam);
      r.xray = false;
      this.bg = { world, cam, r };
    } catch (e) { console.warn('title bg', e); }
  }
  resize(W, H) {
    // 2×2 grid so every button is ≥ 44 CSS px on phones
    const bw = 116, bh = Math.max(26, this.app.display.buttonSize), g = 4;
    const y0 = Math.round(Math.min(H * 0.58, H - 2 * bh - g - 18));
    const n = this.buttons.length;
    this.buttons.forEach((b, i) => b.place(i === n - 1 && n % 2 ? Math.round(W / 2 - bw / 2) : Math.round(W / 2 - bw - g / 2 + (i % 2) * (bw + g)), y0 + Math.floor(i / 2) * (bh + g), bw, bh));
  }
  frame(dt) { this.t += dt; }
  onKeyDown(code) { if (code === 'Enter' || code === 'Space') this.app.playCut('intro', () => this.app.startCampaign()); }
  render(ctx) {
    const { W, H } = this.app.display;
    ctx.fillStyle = '#07090A'; ctx.fillRect(0, 0, W, H);
    if (this.bg) {
      const { cam, r } = this.bg;
      cam.setView(W, H);
      // slow pan along the West Wood tree line (west bank), south → north
      const k = (Math.sin(this.t * 0.04 - Math.PI / 2) + 1) / 2;
      cam.x = (14 + k * 16) * 16; cam.y = (54 - k * 38) * 16;
      cam.follow = false; cam.clamp();
      r._groundUI = () => {};
      r.draw(ctx, 1);
      ctx.fillStyle = 'rgba(7,9,10,0.45)'; ctx.fillRect(0, 0, W, H);
      const grd = ctx.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, 'rgba(7,9,10,0.75)'); grd.addColorStop(0.45, 'rgba(7,9,10,0.1)'); grd.addColorStop(1, 'rgba(7,9,10,0.85)');
      ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
    }
    const scale = W >= 520 ? 4 : 3;
    const L = drawLogo(ctx, W / 2, Math.round(H * 0.1), scale);
    drawText(ctx, 'GLOBAL OPERATIVE DEFENCES · CALLSIGN WREN', W / 2, Math.round(H * 0.1) + L.h + 2, { align: 'center', font: '3x5', color: C.uiText, shadow: '#000' });
    this.drawButtons(ctx);
    drawText(ctx, 'THE WEST WOOD, VARNA RIVER FRONT', 4, H - 9, { font: '3x5', color: C.uiTextD });
    drawText(ctx, 'V1.0', W - 4, H - 9, { font: '3x5', color: C.uiTextD, align: 'right' });
  }
}

/** Credits (SPEC §2: no specific games/studios named in-game). */
export class CreditsScene extends MenuBase {
  enter() { this.addButton('BACK', () => this.app.scenes.pop()); }
  resize(W, H) { const bh = Math.max(26, this.app.display.buttonSize); this.buttons[0].place(Math.round(W / 2 - 55), H - bh - 8, 110, bh); }
  render(ctx) {
    const { W, H } = this.app.display;
    ctx.fillStyle = '#07090A'; ctx.fillRect(0, 0, W, H);
    const lines = [
      ['WESTWOOD SNIPER', C.uiAmber],
      ['', ''],
      ['DESIGN, CODE, PIXELS, SOUND & MUSIC', C.uiTextD],
      ['GENERATED IN CODE FOR THIS PROJECT', C.uiText],
      ['', ''],
      ['INSPIRED BY THE REAL-TIME STRATEGY GAMES OF THE 1990S.', C.uiText],
      ['', ''],
      ['"WESTWOOD" IS THE WEST WOOD — THE FOREST WEST OF THE FRONT', C.uiTextD],
      ['WHERE WREN\'S CAMPAIGN BEGINS.', C.uiTextD],
      ['', ''],
      ['NO NOT UNITS WERE HARMED IN RED. THEY BLEED GREEN, BLUE, YELLOW, PURPLE.', C.uiGrey],
    ];
    let y = 24;
    for (const [t, c] of lines) { if (t) drawText(ctx, t, W / 2, y, { align: 'center', color: c, font: t === 'WESTWOOD SNIPER' ? '5x7' : '3x5', scale: t === 'WESTWOOD SNIPER' ? 2 : 1 }); y += t === 'WESTWOOD SNIPER' ? 20 : 9; }
    this.drawButtons(ctx);
  }
}

/** Mission failed overlay (full debrief arrives with the missions framework). */
export class FailedScene extends MenuBase {
  enter(params) {
    this.game = params.game;
    this.t = 0;
    Time.scale = 0;
    this.addButton('RESTART', () => this.app.scenes.go('game', { mission: this.game.missionId }));
    this.addButton('QUIT', () => this.app.scenes.go(this.app.hasScene('campaign') ? 'campaign' : 'title', {}));
  }
  exit() { Time.scale = 1; }
  onPointerDown(p) { if (this.t < 1.1) return; super.onPointerDown(p); }
  resize(W, H) {
    const bw = 120, bh = Math.max(26, this.app.display.buttonSize), g = 6;
    this.buttons.forEach((b, i) => b.place(Math.round(W / 2 - bw - g / 2 + i * (bw + g)), Math.round(H * 0.62), bw, bh));
  }
  frame(dt) { this.t += dt; }
  render(ctx) {
    const { W, H } = this.app.display;
    const a = Math.min(1, this.t * 2);
    ctx.fillStyle = `rgba(7,9,10,${(0.8 * a).toFixed(2)})`; ctx.fillRect(0, 0, W, H);
    drawText(ctx, 'MISSION FAILED', W / 2, H * 0.3, { align: 'center', color: C.uiAlert, bold: true, scale: 2, shadow: '#000' });
    drawText(ctx, 'OVERWATCH: WREN IS DOWN.', W / 2, H * 0.3 + 24, { align: 'center', color: C.uiText });
    const s = this.game.world.stats;
    drawText(ctx, `TIME ${fmtTime(s.time)}   KILLS ${s.kills}   HEADSHOTS ${s.headshots}   DETECTED ${s.timesDetected}`, W / 2, H * 0.3 + 40, { align: 'center', font: '3x5', color: C.uiTextD });
    this.drawButtons(ctx);
  }
}
export function fmtTime(t) { const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${m}:${String(s).padStart(2, '0')}`; }
