// @ts-check
/**
 * "Mini" infantry study (art pass 3, round 2): original sprites at the scale and read of a 1995-era RTS rifleman —
 * a ~11 px figure, 1 px limbs, a 3 px torso, WREN's Classic head (olive helmet, bright blue visor band, face),
 * a stick of a rifle, a dark edge on the shadow side (reads on sand and grass alike), and a flat cast shadow. Drawn from our own rig (pose → pixels); no reference art is
 * sampled, traced or decoded. Frame format matches the requested asset layout: 64×48, foot anchor (32, 36).
 */

const W = 64, H = 48, AX = 32, AY = 36;

// WREN (GOD): dark khaki vest, olive trousers, the Classic olive helmet with its blue visor — our palette
// (SPEC §2 faction colours), darker than the ground so he reads on sand and grass
export const COL = {
  shirt: ['#A89454', '#76642F', '#453A1A'],
  trousers: ['#5E6A2E', '#3F4920', '#252B12'],
  boot: '#16130D',
  helmet: ['#9AAE48', '#63742E', '#38441A'],
  visor: ['#8ADCFF', '#2F80C4'],
  skin: ['#F0B07A', '#B0743E'],
  gun: '#101214', gunTip: '#7A8692', gunStock: '#5A4428',
  edge: '#15140C',
  shadow: 'rgba(24,20,12,0.42)',
};

const rad = (d) => (d * Math.PI) / 180;
/** 2-bone limb in the x-z plane: returns the middle joint (knee/elbow); bend > 0 pushes it forward */
function joint(a, t, l1, l2, bend) {
  const dx = t.x - a.x, dz = t.z - a.z, d = Math.max(0.01, Math.min(l1 + l2 - 0.01, Math.hypot(dx, dz)));
  const base = Math.atan2(dz, dx), c = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const ang = base + bend * Math.acos(Math.max(-1, Math.min(1, c)));
  return { x: a.x + Math.cos(ang) * l1, y: (a.y + t.y) / 2, z: a.z + Math.sin(ang) * l1 };
}

/**
 * Run pose at phase ph ∈ [0,1): a long, low stride — the leading foot reaches well forward, the trailing leg
 * kicks up behind, the body leans in and bobs one pixel, the rifle is carried at the hip pointing ahead.
 */
function runPose(ph) {
  const a = ph * Math.PI * 2;
  const stride = 2.3, kick = 2.1;
  // each foot: reaches far ahead, pushes back under the body, then the knee drives up and forward (swing) —
  // seen from the front the knees lift towards the camera and the feet step out to the sides
  // stance (sin q > 0): planted, sliding from the front to the back as the body passes over it;
  // swing (sin q < 0): lifted, the heel kicking up behind then the knee driving forward to the next step
  const foot = (off, side) => {
    const q = a + off, sw = Math.sin(q), swing = Math.max(0, -sw);
    const fwd = Math.cos(q) * stride - 0.6 * swing * Math.max(0, -Math.cos(q));
    return { x: fwd, y: side * (1.4 + Math.max(0, sw) * 0.5), z: swing * kick };
  };
  const bob = Math.abs(Math.cos(a)) * 0.7;                      // highest at mid-stance
  const sway = Math.sin(a) * 0.4;                               // the hips roll from side to side
  const hip = { x: 0.2, y: sway, z: 3.7 + bob };
  const lean = 1.6;                                              // leaning into the run
  const J = {};
  J.hipL = { ...hip, y: sway - 1.3 }; J.hipR = { ...hip, y: sway + 1.3 };
  J.footL = foot(0, -1); J.footR = foot(Math.PI, 1);
  J.kneeL = joint(J.hipL, J.footL, 2.1, 2.2, 1); J.kneeR = joint(J.hipR, J.footR, 2.1, 2.2, 1);
  J.chest = { x: hip.x + lean, y: sway * 0.5, z: hip.z + 2.4 };
  J.shL = { x: J.chest.x, y: J.chest.y - 1, z: J.chest.z + 0.2 }; J.shR = { x: J.chest.x, y: J.chest.y + 1, z: J.chest.z + 0.2 };
  J.head = { x: J.chest.x + 1.1, y: J.chest.y, z: J.chest.z + 1.5 };
  // the rifle pumps with the stride: carried low and ahead, rocking up and down, swinging fore and aft
  const pump = Math.sin(a), rock = Math.cos(a * 2) * 0.35;
  J.handR = { x: J.chest.x + 0.4 + pump * 0.5, y: J.chest.y + 0.7, z: J.chest.z - 1.5 + rock };
  J.handL = { x: J.chest.x + 2.2 + pump * 0.5, y: J.chest.y - 0.2, z: J.chest.z - 1.1 - rock + pump * 0.4 };
  J.elbR = joint(J.shR, J.handR, 1.5, 1.5, -1); J.elbL = joint(J.shL, J.handL, 1.5, 1.6, -1);
  J.gun0 = { x: J.handR.x - 1.5, y: J.handR.y * 0.4, z: J.handR.z - 0.3 - pump * 0.3 };
  J.gun1 = { x: J.handL.x + 2.3, y: J.handL.y * 0.4, z: J.handL.z + 0.4 + pump * 0.4 };
  return J;
}

/**
 * Render one frame: `facing` 0..7 (N, NE, E, SE, S, SW, W, NW), `frame` 0..5.
 * @returns {{px: (string|null)[], shadow: Uint8Array, w: number, h: number, ax: number, ay: number}}
 */
export function wrenRun(facing, frame) {
  const J = runPose(frame / 6);
  const th = rad(facing * 45 - 90), fx = Math.cos(th), fy = Math.sin(th);
  const rx = -fy, ry = fx;
  const P = (p) => { const X = p.x * fx + p.y * rx, Y = p.x * fy + p.y * ry; return { sx: AX + X, sy: AY + Y * 0.5 - p.z, depth: Y, z: p.z, X, Y }; };
  const px = new Array(W * H).fill(null), zb = new Float32Array(W * H).fill(-1e9);
  const put = (x, y, c, depth) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = y * W + x; if (zb[i] > depth + 0.05) return;
    px[i] = c; zb[i] = depth;
  };
  const line = (a, b, c, depth) => {
    const A = P(a), B = P(b), n = Math.max(1, Math.ceil(Math.hypot(B.sx - A.sx, B.sy - A.sy) * 2));
    for (let i = 0; i <= n; i++) put(A.sx + (B.sx - A.sx) * i / n, A.sy + (B.sy - A.sy) * i / n, c, depth ?? (A.depth + B.depth) / 2);
  };
  // which leg/arm is nearer the camera (larger ground y) — near limbs mid tone, far limbs dark
  const nearL = P(J.hipL).depth > P(J.hipR).depth;
  const legs = [['L', nearL], ['R', !nearL]].sort((a, b) => (a[1] ? 1 : 0) - (b[1] ? 1 : 0));
  for (const [s, near] of legs) {
    const T = COL.trousers[near ? 1 : 2];
    line(J['hip' + s], J['knee' + s], T); line(J['knee' + s], J['foot' + s], T);
    const f = P(J['foot' + s]); put(f.sx, f.sy, COL.boot, f.depth + 0.1);
    put(f.sx + Math.round(fx), f.sy, COL.boot, f.depth + 0.1);                  // the toe points the way he runs
  }
  // torso: 3 px wide seen from the front/back, 2 side-on; light on the left, dark on the right
  const wide = Math.abs(fy) > 0.5 ? 3 : Math.abs(fy) > 0.2 ? 3 : 2;
  const hipC = { x: (J.hipL.x + J.hipR.x) / 2, y: 0, z: J.hipL.z };
  const A = P(hipC), B = P(J.chest), n = Math.max(1, Math.ceil(Math.hypot(B.sx - A.sx, B.sy - A.sy) * 2));
  for (let i = 0; i <= n; i++) {
    const x = A.sx + (B.sx - A.sx) * i / n, y = A.sy + (B.sy - A.sy) * i / n;
    for (let o = 0; o < wide; o++) put(x - Math.floor(wide / 2) + o, y, COL.shirt[o === 0 ? 0 : o === wide - 1 ? 2 : 1], (A.depth + B.depth) / 2);
  }
  // belt line and a dark hip row: separates shirt from trousers like the old sprites did
  for (let o = 0; o < wide; o++) put(A.sx - Math.floor(wide / 2) + o, A.sy, COL.shirt[2], A.depth + 0.01);
  // arms (1 px, shirt colour), far arm first
  const farArm = P(J.shL).depth < P(J.shR).depth ? 'L' : 'R';
  for (const s of farArm === 'L' ? ['L', 'R'] : ['R', 'L']) {
    const c = COL.shirt[s === farArm ? 2 : 1];
    line(J['sh' + s], J['elb' + s], c); line(J['elb' + s], J['hand' + s], c);
  }
  // rifle: dark stock-to-muzzle stick with a steel tip, in front of the far arm
  line(J.gun0, J.gun1, COL.gun, P(J.handL).depth + 0.3);
  const tip = P(J.gun1); put(tip.sx, tip.sy, COL.gunTip, tip.depth + 0.4);
  const stock = P(J.gun0); put(stock.sx, stock.sy, COL.gunStock, stock.depth + 0.4);
  for (const s of ['L', 'R']) { const h = P(J['hand' + s]); put(h.sx, h.sy, COL.skin[1], h.depth + 0.5); }
  // head: WREN's Classic helmet — a 2-px dome over a 3-px olive shell — with the bright blue visor band and
  // the face below it on the side he faces; from behind, helmet and the back of the neck
  const hd = P(J.head), hx = Math.round(hd.sx), hy = Math.round(hd.sy), dz = hd.depth + 0.6;
  const side = fx > 0.3 ? 1 : fx < -0.3 ? -1 : 0, toward = fy > -0.3;
  const Hc = COL.helmet;
  put(hx, hy - 3, Hc[0], dz); put(hx + 1, hy - 3, Hc[1], dz);
  put(hx - 1, hy - 2, Hc[0], dz); put(hx, hy - 2, Hc[1], dz); put(hx + 1, hy - 2, Hc[2], dz);
  if (toward) {
    // visor band across the front (shifted to the facing side seen side-on), face under it
    const v0 = side > 0 ? hx : side < 0 ? hx - 1 : hx - 1;
    put(v0, hy - 1, COL.visor[0], dz); put(v0 + 1, hy - 1, COL.visor[side < 0 ? 0 : 1], dz);
    if (side === 0) put(hx + 1, hy - 1, COL.visor[1], dz); else put(side > 0 ? hx - 1 : hx + 1, hy - 1, Hc[2], dz);
    put(hx + (side > 0 ? 1 : 0), hy, COL.skin[0], dz); put(hx + (side > 0 ? 0 : side < 0 ? -1 : 1), hy, COL.skin[1], dz);
  } else {
    put(hx - 1, hy - 1, Hc[1], dz); put(hx, hy - 1, Hc[2], dz); put(hx + 1, hy - 1, Hc[2], dz);
    put(hx, hy, COL.skin[1], dz);
  }
  // a dark edge on the shadow side (right and below) of every figure pixel: the figure reads on any ground
  const fig = px.slice();
  for (let i = 0; i < W * H; i++) {
    if (!fig[i]) continue;
    const x = i % W, y = Math.floor(i / W);
    // (only against open ground: a one-pixel gap between the legs stays open)
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const j = (y + dy) * W + x + dx, k = (y + 2 * dy) * W + x + 2 * dx;
      if (x + 2 * dx < W && y + 2 * dy < H && !fig[j] && !fig[k]) px[j] = COL.edge;
    }
  }
  // flat cast shadow: every figure pixel dropped to the ground along the light (height → down-right)
  const shadow = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    if (!px[i]) continue;
    const x = i % W, y = Math.floor(i / W), h = AY - y;                    // height above the feet line
    const sx = Math.round(x + h * 0.75), sy = Math.round(AY + h * 0.18);
    for (const dx of [0, 1]) if (sx + dx < W && sy < H) shadow[sy * W + sx + dx] = 1;
  }
  return { px, shadow, w: W, h: H, ax: AX, ay: AY };
}
