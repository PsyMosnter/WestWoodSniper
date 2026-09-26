// @ts-check
/** Master palette (SPEC §4.6). Earthy, slightly desaturated. */
export const C = {
  // temperate grass
  grass0: '#3C5424', grass1: '#4E6B2F', grass2: '#5E7E36', grass3: '#6F9140', grass4: '#86A64E',
  // dirt / road
  dirt0: '#5F4D30', dirt1: '#7A6440', dirt2: '#8F7750', dirt3: '#A48C62',
  // sand / arid
  sand0: '#A88B52', sand1: '#C2A56A', sand2: '#D8BF86', mesa0: '#8A4E34', mesa1: '#A8633F', mesa2: '#C47E52',
  // rock / cliff
  rock0: '#34302D', rock1: '#4F4A46', rock2: '#6B6560', rock3: '#8A847D', rock4: '#A7A098',
  // water
  water0: '#16384D', water1: '#1F4E6B', water2: '#2B6A8C', water3: '#5FA3C4', foam: '#A9D6E6',
  // snow / ice
  snow0: '#8FA4B0', snow1: '#BFD0D9', snow2: '#E6EEF2', ice0: '#8CB4C8', ice1: '#B6D6E4',
  // jungle
  jungle0: '#1A3417', jungle1: '#23461F', jungle2: '#2F5A2A', jungle3: '#3E7A36',
  // swamp
  swamp0: '#2C3322', swamp1: '#3D4630', swamp2: '#4F5A3A',
  // volcanic
  ash0: '#1E1A1B', ash1: '#2A2426', ash2: '#4A3A36', ash3: '#5E4E48', lava0: '#C23F12', lava1: '#FF7A1A', lava2: '#FFC24A',
  // concrete
  conc0: '#4C4F4B', conc1: '#62665F', conc2: '#7A7E76', conc3: '#949890',
  // GOD
  godKhaki: '#A89968', godKhakiD: '#7C7049', godKhakiL: '#C4B687', godOlive: '#5C6B3A', godOliveD: '#414C28', godOliveL: '#76884B',
  godSteel: '#4A7FA8', godSteelL: '#6FA2C8', godVisor: '#9FD8FF', skin: '#C99C74',
  // NOT
  notChar: '#2A2D30', notCharD: '#1A1C1E', notCharL: '#43484C', notLime: '#A6F03C', notLimeD: '#6BA81F', notViolet: '#7A3FC0', notVioletL: '#A36BE6', notEye: '#E4FF6A',
  // UI
  uiPanel: '#1B1F1C', uiPanelL: '#262C27', uiBevelL: '#4B5A4E', uiBevelD: '#0D0F0E', uiText: '#7CFF7A', uiTextD: '#3E8A3D', uiAmber: '#FFB23A', uiAlert: '#FF5A3A', uiWhite: '#E8F0E0', uiGrey: '#8A948A',
  // misc
  black: '#07090A', outline: '#141612', shadow: 'rgba(10,12,8,0.35)', wood0: '#4A3520', wood1: '#6B4D2E', wood2: '#8C6A42',
  metal0: '#3A3F42', metal1: '#5A6166', metal2: '#7E878C', metal3: '#A5AEB2',
  fire0: '#FF7A1A', fire1: '#FFC24A', fire2: '#FFF1A8',
};

/** Blood colours (SPEC §2): picked per unit at spawn. NEVER red. */
export const BLOOD = [
  { name: 'slime',   main: '#5BD13A', shade: '#2E7A1C', hi: '#B8F27A' },
  { name: 'coolant', main: '#3AA7E0', shade: '#1D5C8A', hi: '#9EE3FF' },
  { name: 'bile',    main: '#E8D43A', shade: '#8E7F12', hi: '#FFF6A0' },
  { name: 'ichor',   main: '#9B4AD9', shade: '#56227E', hi: '#D7A6FF' },
];

/** Every colour that may appear in a gore effect — checked by tests/gorePalette.test.js */
export function gorePalette() {
  const out = [];
  for (const b of BLOOD) out.push(b.main, b.shade, b.hi);
  return out;
}

/**
 * Sprite palettes: single-char keys → colours. '.' is transparent.
 * Used by palette-indexed sprite grids (src/render/spriteData/*).
 */
export const PALETTES = {
  GOD: {
    k: C.outline, o: C.godOlive, O: C.godOliveL, p: C.godOliveD, K: '#BCAC76', q: C.godKhakiD, Q: '#D8CA98',
    b: '#5A94C4', B: C.godSteelL, v: C.godVisor, s: C.skin, g: C.rock0, G: C.metal1, d: '#3B3326', w: C.uiWhite,
    f: C.fire1, F: C.fire2,
  },
  NOT: {
    k: C.notCharD, c: C.notChar, C: C.notCharL, l: C.notLime, L: C.notLimeD, v: C.notViolet, V: C.notVioletL, e: C.notEye,
    g: C.rock0, G: C.metal1, m: C.metal2, o: '#C9892E', O: '#E8B04A', r: '#5B6E2A', w: C.uiWhite, f: C.fire1, F: C.fire2,
  },
};

/** Parse '#rrggbb' → [r,g,b] */
export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** [r,g,b] → hue in degrees 0..360 */
export function rgbToHue([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return 0;
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

export function shadeHex(hex, f) {
  const [r, g, b] = hexToRgb(hex);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}
