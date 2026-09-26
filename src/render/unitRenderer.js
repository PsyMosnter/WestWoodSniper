// @ts-check
import { TILE } from '../core/camera.js';
import { Time } from '../core/time.js';
import { unitSprite, whiteOf, tintOf } from './sprites.js';
import { vehicleSprite } from './spriteData/vehicles.js';
import { drawText } from './font.js';
import { BALANCE } from '../config/balance.js';
import { C } from '../config/palette.js';
import { visionOf } from '../ai/perception.js';
import { T } from '../world/tiles.js';

/**
 * Draws NOT units (y-sorted), vision cones (LOS-clipped), awareness icons, tags and the LKP ghost.
 */
export function installUnitRendering(game) {
  const R = game.renderer, w = game.world;

  R.layers.sorted.push((push, r, alpha) => {
    const fog = w.fog;
    for (const u of w.units) {
      if (u.kind === 'structure' || u.kind === 'emplacement' || u.kind === 'turret' || u.hidden) continue;
      const vis = fog.isVisible(u.tx, u.ty);
      if (vis) u.seenByPlayerT = w.time;
      if (!vis && !(u.dead && fog.isSeen(u.tx, u.ty))) continue;
      const x = u.px + (u.x - u.px) * alpha, y = u.py + (u.y - u.py) * alpha;
      push({ y, elev: 0, draw: (ctx) => drawUnit(ctx, r, u, x, y) }, Math.floor(y));
    }
  });

  R.layers.ground.push((ctx, r) => {
    // vision cones of visible enemies near WREN (drawn on the ground, under sprites)
    const op = w.operative;
    const list = [];
    for (const u of w.units) {
      if (u.dead || u.hidden || u.kind === 'structure' || !w.fog.isVisible(u.tx, u.ty)) continue;
      const d = Math.hypot(u.x - op.x, u.y - op.y);
      if (d > 16 || u.blindT > 0) continue;
      list.push({ u, d });
    }
    // only the few cones that could actually reach WREN get the dithered fill (an Alarm would
    // otherwise paint the whole screen); the rest show their dotted rims
    list.sort((a, b) => a.d - b.d);
    let fills = 0;
    for (const { u, d } of list) {
      const reach = (u.cone?.pts?.[0]?.full ?? 7) + 1.5;
      const fill = d <= reach && fills < 4;
      if (fill) fills++;
      drawCone(ctx, r, u, w, fill);
    }
  });

  R.layers.overFog.push((ctx, r) => {
    // LKP ghost (above trees and fog so it's never hidden)
    if (w.lkp && Math.hypot(w.lkp.x - w.operative.x, w.lkp.y - w.operative.y) > 1.2) {
      const s = unitSprite('operative', 'idle', 4, 0);
      const z = r.cam.zoom;
      ctx.globalAlpha = 0.35 + 0.15 * Math.sin(Time.realTime * 4);
      ctx.drawImage(tintOf(s.canvas, '#B8C0B8'), Math.round(r.sx(w.lkp.x) - s.ax * z), Math.round(r.sy(w.lkp.y) - s.ay * z), s.w * z, s.h * z);
      ctx.globalAlpha = 1;
      drawText(ctx, 'LKP', Math.round(r.sx(w.lkp.x)), Math.round(r.sy(w.lkp.y)) + 2, { font: '3x5', color: '#B8C0B8', align: 'center', shadow: '#000' });
    }
    const drawnIcons = [];
    for (const u of w.units) {
      if (u.dead || u.kind === 'structure' || !w.fog.isVisible(u.tx, u.ty)) continue;
      // don't stack two icons on the same spot (units standing on each other)
      if (drawnIcons.some((d) => Math.abs(d.x - u.x) < 0.5 && Math.abs(d.y - u.y) < 0.5 && d.s === u.state)) continue;
      drawnIcons.push({ x: u.x, y: u.y, s: u.state });
      drawIcons(ctx, r, u, game);
    }
  });
}

function drawUnit(ctx, r, u, x, y) {
  const z = r.cam.zoom;
  if (u.kind === 'vehicle') {
    const vs = vehicleSprite(u.type, u.dir, u.dead ? 'wreck' : 'ok');
    const X = Math.round(r.sx(x) - vs.ax * z), Y = Math.round(r.sy(y) - vs.ay * z);
    ctx.globalAlpha = 0.3; ctx.drawImage(tintOf(vs.canvas, '#000000'), X + 2 * z, Y + 2 * z, vs.w * z, vs.h * z); ctx.globalAlpha = 1;
    ctx.drawImage(u.flashT > 0 ? whiteOf(vs.canvas) : vs.canvas, X, Y, vs.w * z, vs.h * z);
    if (u.dead && (Math.floor(Time.realTime * 5 + u.x) % 4 === 0)) { ctx.fillStyle = '#4A4440'; ctx.fillRect(X + vs.w * z / 2, Y - 2 * z, 2 * z, 2 * z); }
    return;
  }
  const { pose, frame } = u.pose();
  const s = unitSprite(u.type, pose, u.dir, frame);
  const X = Math.round(r.sx(x) - s.ax * z), Y = Math.round(r.sy(y) - s.ay * z);
  if (!u.dead) { ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(Math.round(r.sx(x)) - 3 * z, Math.round(r.sy(y)), 7 * z, z); ctx.fillRect(Math.round(r.sx(x)) - 2 * z, Math.round(r.sy(y)) + z, 5 * z, z); }
  const flash = u.flashT > 0;
  ctx.drawImage(flash ? whiteOf(s.canvas) : s.canvas, X, Y, s.w * z, s.h * z);
  if (!u.dead) {
    const m = u.world.map;
    if (m.terrain[m.idx(u.tx, u.ty)] === T.tallgrass) {
      ctx.fillStyle = 'rgba(141,170,72,0.7)';
      for (let i = -4; i <= 4; i += 2) ctx.fillRect(Math.round(r.sx(x)) + i * z, Math.round(r.sy(y)) - 3 * z, z, 3 * z);
    }
  }
}

/** Ray length along angle a before LOS blocks (tile rules of SPEC §7.3). */
function rayLen(map, ox, oy, a, maxR, eO) {
  const dx = Math.cos(a), dy = Math.sin(a);
  let soft = 0, lastT = -1;
  for (let t = 0.25; t <= maxR; t += 0.25) {
    const tx = Math.floor(ox + dx * t), ty = Math.floor(oy + dy * t);
    if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return t;
    const i = ty * map.w + tx;
    if (i === lastT) continue;
    lastT = i;
    const e = map.elev[i];
    if (e > eO) return t;
    if (e + map.blockH[i] > eO) { if (map.soft[i]) { if (++soft >= 2) return t + 0.3; } else return t + 0.3; }
  }
  return maxR;
}

const CONE_STYLE = {
  unaware: { dot: 'rgba(255,246,200,0.9)', fill: 'rgba(255,246,200,0.28)' },
  wary: { dot: 'rgba(255,178,58,1)', fill: 'rgba(255,178,58,0.38)' },
  combat: { dot: 'rgba(255,90,58,1)', fill: 'rgba(255,90,58,0.4)' },
};
const patterns = new Map();
/** Ordered-dither pattern: overlapping cones share the same screen-aligned pixels, so they never stack into mud. */
function conePattern(ctx, col) {
  let p = patterns.get(col);
  if (p) return p;
  const c = document.createElement('canvas');
  c.width = 4; c.height = 4;
  const x = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  x.fillStyle = col;
  x.fillRect(0, 0, 1, 1); x.fillRect(2, 2, 1, 1);
  x.globalAlpha = 0.5; x.fillRect(2, 0, 1, 1); x.fillRect(0, 2, 1, 1);
  p = ctx.createPattern(c, 'repeat');
  patterns.set(col, p);
  return p;
}

function drawCone(ctx, r, u, w, fill = true) {
  const now = w.time;
  if (!u.cone || now - u.cone.t > 0.1 || Math.abs(u.cone.a - u.angle) > 0.05) {
    const vis = visionOf(u, w);
    const n = 18;
    const pts = [];
    const eO = w.map.elevAt(u.tx, u.ty);
    for (let i = 0; i <= n; i++) {
      const a = u.angle - vis.cone / 2 + (vis.cone * i) / n;
      pts.push({ a, d: rayLen(w.map, u.x, u.y, a, vis.radius, eO), full: vis.radius });
    }
    u.cone = { t: now, a: u.angle, pts, per: vis.peripheral, x: u.x, y: u.y };
  }
  const c = u.cone;
  const z = r.cam.zoom;
  const cx = Math.round(r.sx(u.x)), cy = Math.round(r.sy(u.y));
  const st = u.state === 'combat' ? CONE_STYLE.combat : u.state === 'unaware' || u.state === 'returning' ? CONE_STYLE.unaware : CONE_STYLE.wary;
  // dithered fill only for cones that matter right now (WREN nearby, or the unit is alert) — rims for the rest
  if (fill) {
    ctx.fillStyle = conePattern(ctx, st.fill);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    for (const p of c.pts) ctx.lineTo(cx + Math.cos(p.a) * p.d * TILE * z, cy + Math.sin(p.a) * p.d * TILE * z);
    ctx.closePath();
    ctx.fill();
  }
  // crisp dotted rim with a dark shadow pixel so it reads on light ground (tall grass, sand, snow)
  const rim = (fn) => { ctx.fillStyle = 'rgba(7,9,10,0.55)'; fn(1); ctx.fillStyle = st.dot; fn(0); };
  rim((o) => {
  const step = 3; // px between rim dots
  for (const p of [c.pts[0], c.pts[c.pts.length - 1]]) {
    const len = p.d * TILE * z;
    for (let t = 8; t < len; t += step) ctx.fillRect(Math.round(cx + Math.cos(p.a) * t) + o, Math.round(cy + Math.sin(p.a) * t) + o, z, z);
  }
  for (let i = 0; i < c.pts.length - 1; i++) {
    const p = c.pts[i], q = c.pts[i + 1];
    const x0 = cx + Math.cos(p.a) * p.d * TILE * z, y0 = cy + Math.sin(p.a) * p.d * TILE * z;
    const x1 = cx + Math.cos(q.a) * q.d * TILE * z, y1 = cy + Math.sin(q.a) * q.d * TILE * z;
    const seg = Math.hypot(x1 - x0, y1 - y0);
    const k = Math.max(1, Math.round(seg / step));
    for (let j = 0; j < k; j++) ctx.fillRect(Math.round(x0 + (x1 - x0) * j / k) + o, Math.round(y0 + (y1 - y0) * j / k) + o, z, z);
  }
  });
}

function drawIcons(ctx, r, u, game) {
  const z = r.cam.zoom;
  const lift = u.type === 'guardTower' ? 38 : u.kind === 'vehicle' ? 18 : 20;
  const x = Math.round(r.sx(u.px + (u.x - u.px) * Time.alpha)), y = Math.round(r.sy(u.py + (u.y - u.py) * Time.alpha)) - lift * z;
  const cb = game.settings.colourBlind;
  if (u.state === 'combat') {
    const blink = Math.floor(Time.realTime * 6) & 1;
    ctx.fillStyle = '#07090A'; ctx.fillRect(x - 3 * z, y - 2 * z, 6 * z, 10 * z);
    ctx.fillStyle = blink ? C.uiAlert : '#FFFFFF';
    ctx.fillRect(x - z, y - z, 2 * z, 5 * z); ctx.fillRect(x - z, y + 5 * z, 2 * z, 2 * z);
  } else if (u.det > 0.05 || u.state === 'suspicious' || u.state === 'investigating' || u.state === 'alerted') {
    // "?" with the fill of the detection meter
    const k = Math.min(1, u.det);
    ctx.fillStyle = '#07090A'; ctx.fillRect(x - 4 * z, y - 2 * z, 8 * z, 11 * z);
    drawText(ctx, '?', x, y - z, { color: u.state === 'alerted' ? C.uiAlert : C.uiAmber, align: 'center', scale: z });
    ctx.fillStyle = '#26302A'; ctx.fillRect(x - 3 * z, y + 7 * z, 6 * z, z);
    ctx.fillStyle = k > 0.7 ? C.uiAlert : C.uiAmber; ctx.fillRect(x - 3 * z, y + 7 * z, Math.max(z, Math.round(6 * k) * z), z);
  }
  if (u.tag && u.tag.text === 'RADIO') {
    // officer calling the alarm: dark plate, antenna glyph, 3 s countdown bar (the cue to shoot him NOW)
    const k = Math.min(1, u.radioT / BALANCE.ai.officerRadioTime);
    const bx = x - 17, by = y - 14 * z;
    const blink = Math.floor(Time.realTime * 8) & 1;
    ctx.fillStyle = '#07090A'; ctx.fillRect(bx, by, 34, 12);
    ctx.fillStyle = blink ? C.uiAlert : '#FFFFFF'; ctx.fillRect(bx, by, 34, 1); ctx.fillRect(bx, by + 11, 34, 1); ctx.fillRect(bx, by, 1, 12); ctx.fillRect(bx + 33, by, 1, 12);
    // antenna glyph
    ctx.fillStyle = C.uiAmber; ctx.fillRect(bx + 3, by + 3, 1, 6); ctx.fillRect(bx + 2, by + 3, 3, 1); ctx.fillRect(bx + 1, by + 2, 1, 1); ctx.fillRect(bx + 5, by + 2, 1, 1);
    drawText(ctx, 'RADIO', bx + 8, by + 2, { font: '3x5', color: '#FFFFFF' });
    ctx.fillStyle = '#3A1A14'; ctx.fillRect(bx + 8, by + 8, 23, 2);
    ctx.fillStyle = C.uiAlert; ctx.fillRect(bx + 8, by + 8, Math.round(23 * k), 2);
  } else if (u.tag && u.tag.text !== '!' && u.tag.text !== '?') {
    const tw = u.tag.text.length * 4 + 4;
    ctx.fillStyle = 'rgba(7,9,10,0.85)'; ctx.fillRect(x - tw / 2, y - 10 * z - 1, tw, 7);
    drawText(ctx, u.tag.text, x, y - 10 * z, { font: '3x5', color: C.uiAmber, align: 'center' });
  }
  if (u.important && u.state !== 'combat') {
    ctx.fillStyle = C.uiAmber;
    const yy = y - (u.det > 0.05 ? 12 : 2) * z;
    ctx.fillRect(x - 2 * z, yy, 5 * z, z); ctx.fillRect(x - z, yy + z, 3 * z, z); ctx.fillRect(x, yy + 2 * z, z, z);
  }
}
