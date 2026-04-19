// games/sand/test/levels.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Levels } = require('../lib/levels.js');

function makeValidLevel(overrides) {
  const base = {
    id: 'L1_not',
    layer: 'L1',
    order: 1,
    title: 'NOT',
    brief: 'Build a NOT gate.',
    allowedComponents: [],
    io: { inputs: ['A'], outputs: ['Y'] },
    truthTable: [
      { in: [0], out: [1] },
      { in: [1], out: [0] },
    ],
    starGoals: {
      gates: { '3star': 2, '2star': 4 },
      ticks: { '3star': 2, '2star': 6 },
    },
  };
  return Object.assign(base, overrides || {});
}

test('validateLevel: minimal valid level passes', () => {
  const r = Levels.validateLevel(makeValidLevel());
  assert.equal(r.ok, true, 'errors: ' + r.errors.join(';'));
  assert.deepEqual(r.errors, []);
});

test('validateLevel: missing id flagged', () => {
  const lvl = makeValidLevel();
  delete lvl.id;
  const r = Levels.validateLevel(lvl);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /id/.test(e)));
});

test('validateLevel: truth-table row length mismatch flagged', () => {
  const lvl = makeValidLevel({
    truthTable: [{ in: [0, 1], out: [0] }],
  });
  const r = Levels.validateLevel(lvl);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /truthTable\[0\]\.in/.test(e)));
});

test('validateLevel: unknown layer flagged (validator receives known-layer list)', () => {
  const lvl = makeValidLevel({ layer: 'LX' });
  const r = Levels.validateLevel(lvl, { knownLayers: ['L1'] });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /layer/.test(e) && /unknown/.test(e)));
});

test('validateLayers: shape check', () => {
  const good = Levels.validateLayers({
    version: 1,
    layers: [{ id: 'L1', title: 'Doping', order: 1 }],
  });
  assert.equal(good.ok, true);

  const bad = Levels.validateLayers({ version: 2, layers: 'nope' });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.length >= 2);
});

test('loadWith: reads layers.json + every file in levels/ directory, returns merged result', async () => {
  const layersDoc = {
    version: 1,
    layers: [{ id: 'L1', title: 'Doping', order: 1 }],
  };
  const levelA = makeValidLevel({ id: 'L1_a', order: 1 });
  const levelB = makeValidLevel({ id: 'L1_b', order: 2, title: 'B' });

  const files = {
    'games/sand/data/layers.json': JSON.stringify(layersDoc),
    'games/sand/data/levels/a.json': JSON.stringify(levelA),
    'games/sand/data/levels/b.json': JSON.stringify(levelB),
  };
  const readFile = async (p) => {
    if (!(p in files)) throw new Error('no such file: ' + p);
    return files[p];
  };
  const listDir = async (p) => {
    if (p === 'games/sand/data/levels') return ['a.json', 'b.json'];
    return [];
  };

  const result = await Levels.loadWith({ readFile, listDir, basePath: 'games/sand/data' });
  assert.equal(result.layers.length, 1);
  assert.equal(result.layers[0].id, 'L1');
  assert.equal(Object.keys(result.levels).length, 2);
  assert.ok(result.levels.L1_a);
  assert.ok(result.levels.L1_b);
  assert.equal(result.levels.L1_b.title, 'B');
});
