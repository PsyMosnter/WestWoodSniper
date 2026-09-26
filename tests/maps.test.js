// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { validate } from '../tools/validate-maps.js';

for (const id of ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7']) {
  const file = new URL(`../src/missions/data/${id}.js`, import.meta.url);
  test(`map ${id} validates (SPEC §19.4)`, { skip: !existsSync(file) && 'not built yet' }, async () => {
    const data = (await import(file.href)).default;
    const r = validate(data);
    assert.deepEqual(r.errors, [], r.errors.join('\n'));
    const routeWarn = r.warnings.filter((w) => w.includes('only one route'));
    assert.deepEqual(routeWarn, [], 'every primary objective has two routes');
  });
}
