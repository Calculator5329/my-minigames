import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mod from '../lib/levels.js';
const { Levels } = mod;

const HERE = path.dirname(fileURLToPath(import.meta.url));
// HERE ends like games/sand/test — base path is games/sand/data
const BASE = path.resolve(HERE, '..', 'data');

test('all sand v2 levels parse and validate', async () => {
  const { levels } = await Levels.loadWith({
    basePath: BASE,
    readFile: async (p) => (await fs.readFile(p, 'utf8')),
    listDir:  async (p) => {
      try { return await fs.readdir(p); } catch (_e) { return []; }
    }
  });
  assert.ok(levels.length >= 6, 'expected at least 6 levels, got ' + levels.length);
  for (const L of levels) {
    assert.ok(L.id.length > 0);
    assert.ok(Array.isArray(L.truthTable) && L.truthTable.length > 0);
  }
});

test('intro-wire level is valid', async () => {
  const raw = await fs.readFile(path.resolve(BASE, 'levels', 'intro', '01-wire.json'), 'utf8');
  const obj = JSON.parse(raw);
  const r = Levels.validateLevel(obj);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
});
