// @ts-check
/** Regenerate all mission data modules: node tools/mapgen/build.js [m1 m2 …] */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toModule } from './lib.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = join(root, 'src/missions/data');
mkdirSync(outDir, { recursive: true });
const all = ['test', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7'];
const want = process.argv.slice(2).length ? process.argv.slice(2) : all;
for (const id of want) {
  let mod;
  try { mod = await import(`./${id}.js`); } catch (e) { if (e.code === 'ERR_MODULE_NOT_FOUND') continue; throw e; }
  const t0 = Date.now();
  const data = mod.build();
  writeFileSync(join(outDir, `${id}.js`), toModule(data, `${data.name} (${data.size.w}×${data.size.h})`));
  console.log(`${id}: ${data.name} ${data.size.w}x${data.size.h} — ${Date.now() - t0} ms`);
}
