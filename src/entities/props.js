// @ts-check
import { BALANCE } from '../config/balance.js';
import { C } from '../config/palette.js';
import { TILE } from '../core/camera.js';
import { Pix } from '../render/pixel.js';
import { sprite } from '../render/sprites.js';
import { explode } from '../combat/explosions.js';
import { O } from '../world/tiles.js';
import { drawText } from '../render/font.js';
import { Time } from '../core/time.js';

/**
 * Props (SPEC §12.4): explosive barrels & gas cylinders (chain reactions, 0.2 s delay) and supply
 * crates (ammo +10, medkit, C4 +1, designator charge).
 */
function barrelSprite(kind) {
  return sprite('prop:' + kind, () => {
    const p = new Pix(10, 14);
    if (kind === 'gas') {
      for (let y = 2; y < 13; y++) for (let x = 3; x < 7; x++) p.set(x, y, x === 3 ? '#8AC0D8' : x === 6 ? '#2A5A78' : '#4A8AB0');
      p.rect(4, 0, 2, 2, '#5A6166'); p.set(4, 5, '#FFFFFF'); p.set(5, 5, '#FFFFFF');
    } else {
      for (let y = 3; y < 13; y++) for (let x = 1; x < 9; x++) {
        const c = x < 3 ? '#E8923A' : x < 6 ? '#C0621E' : '#7A3A10';
        p.set(x, y, (y === 5 || y === 10) ? '#5A2A10' : c);
      }
      for (let x = 1; x < 9; x++) p.set(x, 2, x < 5 ? '#FFD27A' : '#E8923A');
      p.set(4, 7, '#1A1A1A'); p.set(5, 7, '#1A1A1A'); p.set(4, 8, '#1A1A1A');
    }
    p.outline('#140C06');
    return { pix: p, ax: 5, ay: 13 };
  });
}
function crateSprite(type) {
  return sprite('pickup:' + type, () => {
    const p = new Pix(12, 11);
    for (let y = 2; y < 10; y++) for (let x = 1; x < 11; x++) p.set(x, y, y < 4 ? '#9A8A5E' : '#6E6040');
    p.rect(1, 1, 10, 1, '#B8A878');
    const col = type === 'ammo' ? '#FFB23A' : type === 'medkit' ? '#E8F0E0' : type === 'c4' ? '#A6F03C' : '#9FD8FF';
    if (type === 'medkit') { p.rect(5, 4, 2, 5, '#4A7FA8'); p.rect(3, 6, 6, 1, '#4A7FA8'); }
    else if (type === 'ammo') { for (const x of [3, 5, 7]) { p.rect(x, 4, 1, 4, col); p.set(x, 3, '#FFF1A8'); } }
    else { p.rect(3, 5, 6, 3, col); p.set(5, 4, '#FFFFFF'); }
    p.outline('#1A140C');
    return { pix: p, ax: 6, ay: 10 };
  });
}

export class PropSystem {
  constructor(game) {
    this.game = game;
    const w = this.world = game.world;
    w.props = [];
    const m = w.map;
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      if (m.overlay[m.idx(x, y)] === O.barrel) w.props.push({ kind: 'barrel', x: x + 0.5, y: y + 0.9, tx: x, ty: y, dead: false });
    }
    for (const b of w.data.props || []) {
      w.props.push({ kind: b.kind || 'barrel', x: b.x + 0.5, y: b.y + 0.9, tx: b.x, ty: b.y, dead: false });
      m.setOverlay(b.x, b.y, 'x');
    }
    for (const p of w.data.pickups || []) w.props.push({ kind: 'pickup', type: p.type, amount: p.amount ?? 1, x: p.x + 0.5, y: p.y + 0.8, tx: p.x, ty: p.y, dead: false });
    this.pending = []; // chain detonations {prop, t}
  }
  update(dt) {
    const w = this.world, op = w.operative;
    for (const c of this.pending) c.t -= dt;
    const due = this.pending.filter((c) => c.t <= 0);
    this.pending = this.pending.filter((c) => c.t > 0);
    for (const c of due) this.detonate(c.prop);
    for (const p of w.props) {
      if (p.dead || p.kind !== 'pickup') continue;
      if (op.tx === p.tx && op.ty === p.ty && !op.dead) this.collect(p);
    }
  }
  collect(p) {
    const op = this.world.operative, hud = this.game.hud;
    p.dead = true;
    switch (p.type) {
      case 'ammo': op.rifleReserve += p.amount || 10; hud.toast(`+${p.amount || 10} RIFLE ROUNDS`, C.uiText); break;
      case 'medkit': op.medkits += p.amount || 1; hud.toast('+1 MEDKIT (TAP HEALTH BAR)', C.uiText); break;
      case 'c4': op.c4 += p.amount || 1; hud.toast('+1 C4 CHARGE', C.uiText); break;
      case 'designator': op.designator += p.amount || 1; hud.toast('+1 STRIKE CHARGE', C.uiAmber); break;
      default: break;
    }
    this.world.events.emit('pickup', { type: p.type });
    this.game.audio?.play?.('pickup');
  }
  /** explode now (barrels, gas) */
  detonate(p) {
    if (p.dead) return;
    p.dead = true;
    const w = this.world;
    w.map.setOverlay(p.tx, p.ty, '.');
    this.game.renderer?.terrain.invalidateTile(p.tx, p.ty);
    const B = BALANCE.explosions.barrel;
    explode(this.game.combat, p.x, p.y - 0.3, B.radius, B.damage, { source: 'player' });
  }
  /** called by explosions: barrels in the blast go off 0.2 s later */
  chain(x, y, radius) {
    for (const p of this.world.props) {
      if (p.dead || (p.kind !== 'barrel' && p.kind !== 'gas')) continue;
      if (Math.hypot(p.x - x, p.y - y) <= radius && !this.pending.some((c) => c.prop === p)) this.pending.push({ prop: p, t: BALANCE.explosions.chainDelay });
    }
  }
  sortedLayer(push, r) {
    const w = this.world;
    for (const p of w.props) {
      if (p.dead) continue;
      if (!w.fog.isSeen(p.tx, p.ty)) continue;
      if (p.kind === 'pickup' && !w.fog.isVisible(p.tx, p.ty)) continue;
      push({ y: p.y, elev: 0, draw: (ctx) => this.drawOne(ctx, r.cam, p) }, p.ty);
    }
  }
  drawOne(ctx, cam, p, z = cam.zoom) {
    const s = p.kind === 'pickup' ? crateSprite(p.type) : barrelSprite(p.kind);
    const bob = p.kind === 'pickup' ? Math.round(Math.sin(Time.realTime * 3 + p.tx) * 1) : 0;
    const X = Math.round((p.x * TILE - cam.left) * z - s.ax * z), Y = Math.round((p.y * TILE - cam.top) * z - s.ay * z) + bob * z;
    ctx.drawImage(s.canvas, X, Y, s.w * z, s.h * z);
    if (p.kind === 'pickup' && (Math.floor(Time.realTime * 2) & 1)) { ctx.fillStyle = '#FFF1A8'; ctx.fillRect(X + s.w * z - 2 * z, Y, z, z); }
  }
  drawRow(b, scam, y) { for (const p of this.world.props) if (!p.dead && p.ty === y && this.world.fog.isVisible(p.tx, p.ty)) this.drawOne(b, scam, p, scam.zoom); }
  /** scope hit test at world px */
  resolve(ix, iy) {
    for (const p of this.world.props) {
      if (p.dead || p.kind === 'pickup') continue;
      const s = barrelSprite(p.kind);
      const lx = ix - (p.x * TILE - s.ax), ly = iy - (p.y * TILE - s.ay);
      if (lx >= 0 && ly >= 0 && lx < s.w && ly < s.h) return { prop: p, zone: { name: 'barrel', prio: 5 } };
    }
    return null;
  }
}
