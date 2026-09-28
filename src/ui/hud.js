// @ts-check
import { missionLevel } from '../strike/recon.js';
import { C } from '../config/palette.js';
import { drawText, measureText, wrapText } from '../render/font.js';
import { icon } from '../render/spriteData/icons.js';
import { Button, panel } from './widgets.js';
import { Minimap } from './minimap.js';
import { Time } from '../core/time.js';
import { BALANCE } from '../config/balance.js';

/**
 * In-game HUD (SPEC §17.2): objectives (collapsible), minimap + centre, OVERWATCH ticker,
 * health/awareness/ammo/stance, contextual action buttons (≥ 44 CSS px, handedness-mirrored).
 */
export class Hud {
  /** @param {any} game GameScene */
  constructor(game) {
    this.game = game;
    this.world = game.world;
    this.minimap = new Minimap(game.world);
    this.W = 480; this.H = 270;
    this.objOpen = false;
    this.objPeek = 6;
    this.ticker = { queue: [], cur: null, t: 0 };
    this.toasts = [];
    this.buttons = {};
    const b = (o) => (this.buttons[o.id] = new Button(o));
    b({ id: 'cover', icon: 'cover', label: 'COVER', onPress: () => game.cmd('cover') });
    b({ id: 'hunker', icon: 'hunker', label: 'HUNKER', toggle: true, onPress: () => game.cmd('hunker') });
    b({ id: 'runGun', icon: 'runGun', label: 'R&GUN', toggle: true, onPress: () => game.cmd('runGun') });
    b({ id: 'c4', icon: 'c4', label: 'C4', onPress: () => game.cmd('c4') });
    b({ id: 'designator', icon: 'designator', label: 'STRIKE', onPress: () => game.cmd('designator') });
    b({ id: 'recon', icon: 'recon', label: 'RECON', onPress: () => game.cmd('recon') });
    b({ id: 'medkit', icon: 'medkit', label: 'MEDKIT', onPress: () => game.cmd('medkit') });
    b({ id: 'centre', icon: 'centre', label: '', onPress: () => game.cmd('centre') });
    b({ id: 'pause', icon: 'pause', label: '', onPress: () => game.cmd('pause') });
    b({ id: 'save', icon: 'save', label: '', onPress: () => game.cmd('quicksave') });
    b({ id: 'zoom', icon: 'zoom', label: '', onPress: () => game.cmd('zoom') });
    b({ id: 'convoy', icon: 'convoy', label: 'ADVANCE', onPress: () => game.cmd('convoy') });
    b({ id: 'follow', icon: 'follow', label: 'FOLLOW', onPress: () => game.cmd('followAll') });
    b({ id: 'smoke', icon: 'smoke', label: 'SMOKE', onPress: () => game.cmd('smoke') });
    b({ id: 'detonate', icon: 'detonate', label: 'BOOM', onPress: () => game.cmd('detonate') });
    b({ id: 'plant', icon: 'c4', label: 'PLANT', color: C.uiAmber, onPress: () => game.cmd('plantConfirm') });
    b({ id: 'takedown', icon: 'knife', label: 'TAKEDOWN', short: 'T-DOWN', color: C.uiAmber, onPress: () => game.cmd('takedown') });
    this.healthRect = { x: 0, y: 0, w: 0, h: 0 };
    this.objRect = { x: 0, y: 0, w: 0, h: 0 };
    this.active = new Map(); // pointer id → button
    this.dim = 0;
  }
  layout(W, H, B, lefty = false, safe = { l: 0, r: 0, t: 0, b: 0 }) {
    this.W = W; this.H = H; this.B = B; this.safe = safe;
    const m = 4, g = 3;
    // inset everything by the safe area: work in a virtual rect [L, R] × [T, Bm]
    const L = safe.l, Rr = safe.r, Tt = safe.t, Bb = safe.b;
    this.L = L + m; this.R = W - Rr - m; this.T = Tt + m; this.Bot = H - Bb - m;
    W = W - Rr; H = H - Bb;
    const bs = this.buttons;
    const mmW = 96, mmH = 72;
    this.minimap.layout(W - m - mmW - 2, Tt + m + 2, mmW, mmH);
    // actions: a 3×3 grid under the minimap, the most used down the right-hand column (under the thumb):
    //   SMOKE  COVER  HUNKER / MEDKIT  C4  TAKEDOWN / STRIKE (mission 5+)  RECON (mission 2+)  R&GUN
    // plus a row under it, filled from the right, for ADVANCE / FOLLOW once a mission has them
    const rowY = Tt + m + mmH + 8;
    const extras = this._extras();
    const rows = 3 + (extras.length ? 1 : 0);
    const sb = Math.min(B, 36), sy = H - m - sb;              // system row, bottom right
    const avail = sy - g - rowY;
    const gs = Math.max(24, Math.min(B, Math.floor((mmW + 2 - 2 * g) / 3), Math.floor((avail - (rows - 1) * g) / rows)));
    const gx = (c) => W - m - (3 - c) * gs - (2 - c) * g;
    const gy = (r) => rowY + r * (gs + g);
    bs.smoke.place(gx(0), gy(0), gs, gs); bs.cover.place(gx(1), gy(0), gs, gs); bs.hunker.place(gx(2), gy(0), gs, gs);
    bs.medkit.place(gx(0), gy(1), gs, gs); bs.c4.place(gx(1), gy(1), gs, gs); bs.detonate.place(gx(1), gy(1), gs, gs); bs.takedown.place(gx(2), gy(1), gs, gs);
    bs.designator.place(gx(0), gy(2), gs, gs); bs.recon.place(gx(1), gy(2), gs, gs); bs.runGun.place(gx(2), gy(2), gs, gs);
    extras.forEach((id, i) => bs[id].place(gx(2 - i), gy(3), gs, gs));
    bs.plant.place(L + m + 150, H - m - B, 2 * B, B);
    // system row along the bottom edge, flush right: ZOOM SAVE PAUSE CENTRE
    const sx = (i) => W - m - (4 - i) * sb - (3 - i) * g;
    bs.zoom.place(sx(0), sy, sb, sb); bs.save.place(sx(1), sy, sb, sb);
    bs.pause.place(sx(2), sy, sb, sb); bs.centre.place(sx(3), sy, sb, sb);
    const extraRows = extras.join();
    this._layoutKey = extraRows;
    this.lefty = lefty;
  }
  toast(text, color = C.uiAmber, dur = 1.6) {
    this.toasts = this.toasts.filter((t) => t.text !== text);
    this.toasts.push({ text, color, t: dur, dur });
    if (this.toasts.length > 3) this.toasts.shift();
  }
  /** @param {boolean} [prio] jump the queue  @param {boolean} [replace] drop every queued line first */
  say(text, prio = false, replace = false) {
    const q = this.ticker.queue;
    if (replace) { q.length = 0; this.ticker.cur = null; }
    if (q.includes(text) || this.ticker.cur?.text === text) return;
    if (prio) q.unshift(text); else q.push(text);
    if (q.length > 4) q.splice(1, q.length - 4);
    this.game.audio?.squelch?.();
  }
  /** returns true if the HUD consumed the pointer */
  down(p) {
    for (const b of Object.values(this.buttons)) {
      if (b.visible && b.hit(p.x, p.y)) {
        b.pressed = true; this.active.set(p.id, b);
        if (b.enabled) { b.flashT = 0.15; b.onPress?.(); this.game.audio?.click?.(); }
        else this.game.explainButton?.(b.id);
        return true;
      }
    }
    if (this.minimap.hit(p.x, p.y)) { this.active.set(p.id, 'minimap'); this._mini(p); return true; }
    const hr = this.healthRect;
    if (p.x >= hr.x && p.y >= hr.y && p.x < hr.x + hr.w && p.y < hr.y + hr.h) { this.game.cmd('medkit'); return true; }
    const or = this.objRect;
    if (p.x >= or.x - 4 && p.y >= or.y - 4 && p.x < or.x + or.w + 4 && p.y < or.y + Math.max(or.h, 30)) { this.objOpen = !(this.objOpen || this.objPeek > 0); this.objPeek = 0; return true; }
    return false;
  }
  move(p) {
    const a = this.active.get(p.id);
    if (a === 'minimap') { this._mini(p); return true; }
    if (a) { a.pressed = a.hit(p.x, p.y); return true; }
    return false;
  }
  up(p) {
    const a = this.active.get(p.id);
    if (!a) return false;
    this.active.delete(p.id);
    if (a !== 'minimap') { a.pressed = false; a.onRelease?.(); }
    return true;
  }
  _mini(p) {
    const t = this.minimap.toTile(p.x, p.y);
    this.game.cam.centreOn(t.x, t.y);
    this.game.cam.follow = false;
  }
  update(dt) {
    const tk = this.ticker;
    if (!tk.cur && tk.queue.length) { tk.cur = { text: tk.queue.shift(), t: 0 }; }
    if (tk.cur) {
      tk.cur.t += dt;
      const typeDur = tk.cur.text.length / 45;
      const hold = tk.queue.length ? 1.2 : 2.4;
      if (tk.cur.t > Math.min(3.2, typeDur + hold) + (tk.queue.length ? 0 : 0.8)) tk.cur = null;
    }
    if (this.objPeek > 0) this.objPeek -= dt;
    for (const t of this.toasts) t.t -= dt;
    this.toasts = this.toasts.filter((t) => t.t > 0);
  }
  /** mission buttons under the grid, right to left: STRIKE, ADVANCE, FOLLOW */
  _extras() {
    const op = this.world.operative, g = this.game;
    void op;
    return [!!g.convoy && 'convoy', (g.escortCount?.() || 0) >= 2 && 'follow'].filter(Boolean);
  }
  syncButtons() {
    const op = this.world.operative, bs = this.buttons, g = this.game;
    if (this._extras().join() !== this._layoutKey) this.layout(this.W, this.H, this.B, this.lefty, this.safe);
    bs.hunker.active = op.stance === 'hunker' || (!!op.trans && op.trans.to === 'hunker');
    bs.hunker.enabled = bs.hunker.active || !op.inWater?.();   // too deep to go flat in shallow water
    bs.runGun.active = op.runGun;
    // the grid is fixed: C4 / SMOKE / TAKEDOWN stay in place, greyed out when not usable
    bs.c4.visible = !g.remoteArmed; bs.c4.enabled = op.c4 > 0; bs.c4.badge = op.c4 > 0 ? '×' + op.c4 : ''; bs.c4.active = g.mode === 'c4';
    bs.detonate.visible = !!g.remoteArmed;
    // the last row fills in as the campaign goes on; used up, a button stays, greyed out
    const lvl = missionLevel(g.missionId);
    bs.designator.visible = lvl >= 5 || op.designator > 0; bs.designator.enabled = op.designator > 0; bs.designator.badge = op.designator > 0 ? '×' + op.designator : ''; bs.designator.active = g.mode === 'designator';
    bs.recon.visible = lvl >= 2 || op.recon > 0; bs.recon.enabled = op.recon > 0; bs.recon.badge = op.recon > 0 ? '×' + op.recon : ''; bs.recon.active = g.mode === 'recon';
    bs.medkit.visible = true; bs.medkit.enabled = op.medkits > 0; bs.medkit.badge = op.medkits > 0 ? '×' + op.medkits : '';
    bs.smoke.visible = true; bs.smoke.enabled = op.smoke > 0; bs.smoke.badge = op.smoke > 0 ? '×' + op.smoke : '';
    bs.convoy.visible = !!g.convoy; if (g.convoy) { bs.convoy.label = g.convoy.advancing ? 'HOLD' : 'ADVANCE'; bs.convoy.active = g.convoy.advancing; }
    bs.follow.visible = (g.escortCount?.() || 0) >= 2; bs.follow.label = g.escortsHolding?.() ? 'FOLLOW' : 'HOLD';
    bs.cover.active = op.stance === 'cover';
    bs.plant.visible = !!g.c4?.pending;
    bs.takedown.visible = true; bs.takedown.enabled = !g.scopeOpen && !!g.takedown?.target();
    bs.c4.active = g.mode === 'c4';
    const hunkerBusy = !!op.trans && (op.trans.to === 'hunker' || op.trans.from === 'hunker');
    bs.hunker.progress = hunkerBusy && op.trans ? op.trans.t / op.trans.dur : -1;
  }
  draw(ctx) {
    this.syncButtons();
    const W = this.W, H = this.H, w = this.world, op = w.operative;
    const alpha = 1 - this.dim * 0.6;
    ctx.globalAlpha = 1;
    // --- objectives (top-left)
    this._objectives(ctx);
    // --- minimap
    this.minimap.draw(ctx, this.game.cam, this.game.minimapExtras?.() || []);
    // base alert level (worst group) — SPEC §8.4
    const lvl = this.game.enemies?.alerts.maxLevel() || 'calm';
    if (lvl !== 'calm') {
      const mm = this.minimap;
      const txt = lvl === 'alarm' ? 'ALARM' : 'CAUTION';
      const blink = lvl === 'alarm' && (Math.floor(Time.realTime * 3) & 1);
      const tw = measureText(txt, { font: '3x5' }) + 6;
      ctx.fillStyle = '#0D0F0E'; ctx.fillRect(mm.x, mm.y + mm.h - 8, tw, 8);
      drawText(ctx, txt, mm.x + 3, mm.y + mm.h - 7, { font: '3x5', color: lvl === 'alarm' ? (blink ? '#FFFFFF' : C.uiAlert) : C.uiAmber });
      if (lvl === 'alarm') {
        // hazard-striped bars top & bottom, pulsing — distinct from the low-HP red edge
        const a = 0.45 + 0.35 * Math.sin(Time.realTime * 6);
        const off = Math.floor(Time.realTime * 12) % 8;
        ctx.globalAlpha = a;
        for (const y0 of [0, H - 4]) {
          for (let x = -8 + off; x < W; x += 8) { ctx.fillStyle = C.uiAlert; ctx.fillRect(x, y0, 4, 4); ctx.fillStyle = '#FFB23A'; ctx.fillRect(x + 4, y0, 4, 4); }
        }
        ctx.globalAlpha = 1;
      }
    }
    for (const b of Object.values(this.buttons)) b.draw(ctx);
    this._countdown(ctx);
    // --- status (bottom-left or right if lefty)
    const sw = 148, sh = 42;
    const sx = this.L, sy = this.Bot - sh;
    panel(ctx, sx, sy, sw, sh, { alpha: 0.85 });
    // health bar
    const hx = sx + 4, hy = sy + 4;
    const hIcon = icon('heart', op.hp < BALANCE.operative.lowHp && (Math.floor(Time.realTime * 4) & 1) ? C.uiAlert : '#E8F0E0', '#888', '#fff');
    ctx.drawImage(hIcon, hx, hy);
    const segs = 10, segW = 8;
    const filled = Math.ceil((op.hp / op.maxHp) * segs);
    for (let i = 0; i < segs; i++) {
      const col = i < filled ? (op.hp < BALANCE.operative.lowHp ? C.uiAlert : op.hp < 60 ? C.uiAmber : C.uiText) : '#26302A';
      ctx.fillStyle = col;
      ctx.fillRect(hx + 10 + i * (segW + 1), hy, segW, 7);
      if (i < filled) { ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(hx + 10 + i * (segW + 1), hy, segW, 1); }
    }
    this.healthRect = { x: sx, y: sy, w: sw, h: 13 };
    if (op.medkits > 0) drawText(ctx, '+' + op.medkits, hx + 10 + segs * (segW + 1) + 2, hy + 1, { font: '3x5', color: C.uiAmber });
    // awareness eye
    const aw = this.game.awareness || { state: 'hidden', fill: 0 };
    const eyeName = aw.state === 'detected' ? 'eyeOpen' : aw.state === 'suspicious' ? 'eyeHalf' : 'eyeClosed';
    const eyeCol = aw.state === 'detected' ? ((Math.floor(Time.realTime * 6) & 1) ? C.uiAlert : '#FFFFFF') : aw.state === 'suspicious' ? C.uiAmber : C.uiText;
    const ey = sy + 14;
    ctx.drawImage(icon(eyeName, eyeCol, '#333', aw.state === 'detected' ? C.uiAlert : C.uiAmber), hx - 1, ey + 1);
    const cb = this.game.settings?.colourBlind;
    const label = aw.state === 'detected' ? 'DETECTED' : aw.state === 'suspicious' ? 'SUSPICIOUS' : 'HIDDEN';
    drawText(ctx, (cb ? (aw.state === 'detected' ? '! ' : aw.state === 'suspicious' ? '? ' : '- ') : '') + label, hx + 12, ey + 2, { font: '3x5', color: eyeCol });
    if (aw.state === 'suspicious') { ctx.fillStyle = '#26302A'; ctx.fillRect(hx + 12, ey + 9, 36, 2); ctx.fillStyle = C.uiAmber; ctx.fillRect(hx + 12, ey + 9, Math.round(36 * Math.min(1, aw.fill)), 2); }
    // ammo + stance
    const reloading = this.game.reloadT > 0;
    const ammoTxt = reloading ? 'RELOADING' : `RIFLE ${op.rifleMag}/${BALANCE.weapons.rifle.mag} | ${op.rifleReserve}`;
    drawText(ctx, ammoTxt, sx + sw - 4, ey + 2, { font: '3x5', color: reloading ? C.uiAmber : C.uiText, align: 'right' });
    const st = op.trans ? op.trans.to : op.stance;
    const stance = st.toUpperCase() + (op.runGun ? ' +PISTOL' : '');
    // noise meter: how far WREN's sound carries right now (anyone inside comes to look)
    const nz = this.game.noise?.reading();
    if (nz) {
      const ny = sy + 31;
      ctx.drawImage(icon('sound', nz.segs ? nz.col : C.uiTextD, '#333', nz.segs ? nz.col : '#26302A'), hx - 1, ny);
      for (let i = 0; i < 5; i++) {
        const bh = 2 + i;
        ctx.fillStyle = i < nz.segs ? (i >= 3 ? C.uiAlert : i >= 2 ? C.uiAmber : C.uiText) : '#26302A';
        ctx.fillRect(hx + 12 + i * 5, ny + 7 - bh, 4, bh);
      }
      drawText(ctx, nz.word, hx + 40, ny + 1, { font: '3x5', color: nz.col });
      if (nz.lv >= 0.5) drawText(ctx, `NOISE CARRIES ${+nz.lv.toFixed(1)} TILES`, sx + sw - 4, ey + 9, { font: '3x5', color: C.uiTextD, align: 'right' });
    }
    // stance, bottom line, next to the noise meter
    const stW = measureText('STANCE ' + stance, { font: '3x5' });
    drawText(ctx, (stW <= sw - 70 ? 'STANCE ' : '') + stance, sx + sw - 4, sy + 32, { font: '3x5', color: C.uiTextD, align: 'right' });
    // --- ticker (hidden while scoped — it would bleed over the scope)
    if (!this.game.scopeOpen) this._ticker(ctx, sx, sy - 13);
    // --- toasts
    let ty = Math.round(H * 0.3);
    for (const t of this.toasts) {
      const a = Math.min(1, t.t * 3, (t.dur - t.t) * 8 + 0.2);
      ctx.globalAlpha = a;
      const tw = measureText(t.text) + 12;
      panel(ctx, Math.round(W / 2 - tw / 2), ty - 3, tw, 13, { rivets: false, alpha: 0.85 });
      drawText(ctx, t.text, W / 2, ty, { color: t.color, align: 'center' });
      ctx.globalAlpha = 1;
      ty += 16;
    }
    // low HP warning pulse
    if (op.hp > 0 && op.hp < BALANCE.operative.lowHp) {
      const a = 0.15 + 0.15 * Math.sin(Time.realTime * 6);
      ctx.fillStyle = `rgba(255,90,58,${a.toFixed(3)})`;
      ctx.fillRect(0, 0, W, 2); ctx.fillRect(0, H - 2, W, 2); ctx.fillRect(0, 0, 2, H); ctx.fillRect(W - 2, 0, 2, H);
    }
    ctx.globalAlpha = 1;
  }
  /** Mission clock (M6 shift change) under the minimap buttons; red and blinking for the last 10 s. */
  _countdown(ctx) {
    const cd = this.game.countdown, now = this.world.time;
    if (!cd || now >= cd.until) return;
    const left = cd.until - now;
    const txt = `${cd.label} ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
    const mm = this.minimap, pb = this.buttons.pause;
    const tw = measureText(txt, { font: '3x5' }) + 10, th = 11;
    const x = mm.x + mm.w - tw, y = pb.y + pb.h + 4;
    const urgent = left < 10;
    panel(ctx, x, y, tw, th, { alpha: 0.9, rivets: false, fill: urgent ? '#2A0E0A' : '#141A15' });
    drawText(ctx, txt, x + tw / 2, y + 3, { font: '3x5', color: urgent && (Math.floor(Time.realTime * 4) & 1) ? '#FFFFFF' : urgent ? C.uiAlert : C.uiAmber, align: 'center' });
  }
  /** Briefly expand the objectives panel (mission start, objective changes). */
  peekObjectives(sec = 4) { this.objPeek = sec; }
  _objectives(ctx) {
    const objs = (this.game.objectives?.list?.() || []).filter((o) => !o.hidden);
    const open = this.objOpen || this.objPeek > 0;
    const x = this.L, y = this.T;
    const maxAllowed = Math.min(210, this.minimap.x - 10 - x);
    const rows = [];
    for (const o of objs) {
      if (!open && (o.done || !o.primary)) continue;
      const box = o.done ? '[X]' : o.failed ? '[-]' : '[ ]';
      const col = o.done ? C.uiTextD : o.failed ? C.uiAlert : o.primary ? C.uiText : C.uiAmber;
      const extra = o.count && !o.done ? ` (${o.count})` : o.type === 'SURVIVE' && !o.done && o.elapsed ? ` (${Math.max(0, Math.ceil(o.seconds - o.elapsed))}S)` : '';
      const lines = wrapText(o.text.toUpperCase() + extra, maxAllowed - 22, { font: '3x5' });
      rows.push({ box, col, lines, prog: o.progress, primary: o.primary, observing: o.observing });
      if (!open) break;
    }
    const head = open ? 'OBJECTIVES ▾' : 'OBJECTIVES ▸';
    let contentW = measureText(head, { font: '3x5' }) + 8;
    for (const r of rows) for (const ln of r.lines) contentW = Math.max(contentW, measureText(ln, { font: '3x5' }) + 22);
    const w = Math.min(maxAllowed, contentW + 4);
    let h = 12 + rows.reduce((s2, r) => s2 + r.lines.length * 7 + (r.prog > 0 && r.prog < 1 ? 3 : 0) + 2, 0);
    if (!rows.length) h = 12;
    panel(ctx, x, y, w, h, { alpha: 0.72 });
    this.objRect = { x, y, w, h: Math.max(h, 18) };
    drawText(ctx, head, x + 4, y + 3, { font: '3x5', color: C.uiAmber });
    let yy = y + 11;
    for (const r of rows) {
      const blink = r.observing && (Math.floor(Time.realTime * 4) & 1);
      drawText(ctx, r.box, x + 4, yy, { font: '3x5', color: blink ? C.uiAmber : r.col });
      for (const ln of r.lines) { drawText(ctx, ln, x + 18, yy, { font: '3x5', color: r.col }); yy += 7; }
      if (r.prog > 0 && r.prog < 1) {
        ctx.fillStyle = '#26302A'; ctx.fillRect(x + 18, yy - 1, 40, 2);
        ctx.fillStyle = C.uiAmber; ctx.fillRect(x + 18, yy - 1, Math.round(40 * r.prog), 2);
        yy += 3;
      }
      yy += 2;
    }
  }
  _ticker(ctx, x, y) {
    const cur = this.ticker.cur;
    if (!cur) return;
    const n = Math.min(cur.text.length, Math.floor(cur.t * 45));
    const txt = cur.text.slice(0, n);
    const prefix = (this.game.data?.radioName || 'OVERWATCH') + ': ';
    // never run under the action-button cluster or off-screen (works for both handedness)
    const cluster = this.B * 3 + 12;
    const avail = this.lefty ? (this.R - (this.L + cluster)) : (this.R - cluster - x);
    const maxW = Math.max(120, Math.min(avail, 300));
    if (this.lefty) x = this.R - maxW;
    const lines = wrapText(prefix + txt, maxW - 8, { font: '5x7' });
    const h = lines.length * 9 + 4;
    const yy = y - h + 11;
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = '#0D0F0E';
    ctx.fillRect(x, yy - 2, maxW, h);
    ctx.globalAlpha = 1;
    ctx.fillStyle = C.uiTextD; ctx.fillRect(x, yy - 2, 2, h);
    let ly = yy;
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      if (i === 0 && ln.startsWith(prefix)) {
        drawText(ctx, prefix, x + 5, ly, { color: C.uiAmber });
        drawText(ctx, ln.slice(prefix.length), x + 5 + measureText(prefix), ly, { color: C.uiText });
      } else drawText(ctx, ln, x + 5, ly, { color: C.uiText });
      ly += 9;
    }
    if (n < cur.text.length && (Math.floor(Time.realTime * 8) & 1)) { ctx.fillStyle = C.uiText; ctx.fillRect(x + 5 + measureText(lines[lines.length - 1]) + 2, ly - 9, 4, 7); }
  }
}
