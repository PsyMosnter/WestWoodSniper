// @ts-check
/**
 * Copy the playable game into dist/ for static hosting (Cloudflare Workers assets, see wrangler.jsonc).
 * No bundling — the game runs as plain ES modules — so this is just an allow-list copy: node_modules,
 * tests, tools and docs never end up on the site. Usage: node tools/build-site.js
 */
import { cpSync, rmSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist');
const SITE = ['index.html', 'icon.svg', 'manifest.webmanifest', 'src'];

rmSync(out, { recursive: true, force: true });
mkdirSync(out);
for (const f of SITE) cpSync(join(root, f), join(out, f), { recursive: true });
console.log(`dist/ ← ${SITE.join(', ')}`);
