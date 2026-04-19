// games/sand/test/levelrun.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Model } = require('../lib/model.js');
const { LevelRun } = require('../lib/levelrun.js');

// -- helpers --------------------------------------------------------------

function newGraph() {
  return Model.create();
}
function addPadIn(g, label) {
  return Model.addNode(g, { type: 'pad_in', props: { label, value: 0 } });
}
function addPadOut(g, label) {
  return Model.addNode(g, { type: 'pad_out', props: { label } });
}
function addNode(g, type) {
  return Model.addNode(g, { type });
}
function wire(g, fromNode, fromPin, toNode, toPin) {
  const w = Model.addWire(g, {
    from: { node: fromNode.id, pin: fromPin },
    to:   { node: toNode.id,   pin: toPin   },
  });
  if (!w) throw new Error(`failed wire ${fromNode.id}.${fromPin} -> ${toNode.id}.${toPin}`);
  return w;
}

// OR: two switches in parallel between power and pad_out (wire-OR).
function buildOR() {
  const g = newGraph();
  const A = addPadIn(g, 'A');
  const B = addPadIn(g, 'B');
  const Y = addPadOut(g, 'Y');
  const pwr = addNode(g, 'power');
  const sA = addNode(g, 'switch');
  const sB = addNode(g, 'switch');
  wire(g, pwr, 'out', sA, 'in');
  wire(g, pwr, 'out', sB, 'in');
  wire(g, sA,  'out', Y,  'in');
  wire(g, sB,  'out', Y,  'in');
  wire(g, A,   'out', sA, 'gate');
  wire(g, B,   'out', sB, 'gate');
  return g;
}

// Straight-through buffer: A -> Y (B unused).
function buildBuffer() {
  const g = newGraph();
  const A = addPadIn(g, 'A');
  const B = addPadIn(g, 'B'); // unused but declared so levelSpec inputs resolve
  const Y = addPadOut(g, 'Y');
  const pwr = addNode(g, 'power');
  const sA  = addNode(g, 'switch');
  wire(g, pwr, 'out', sA, 'in');
  wire(g, A,   'out', sA, 'gate');
  wire(g, sA,  'out', Y,  'in');
  // keep B referenced so graph is valid; no wire from B.
  void B;
  return g;
}

// Conflict graph: power + ground both drive pad_out.in.
function buildConflict() {
  const g = newGraph();
  const Y = addPadOut(g, 'Y');
  const pwr = addNode(g, 'power');
  const gnd = addNode(g, 'ground');
  wire(g, pwr, 'out', Y, 'in');
  wire(g, gnd, 'out', Y, 'in');
  return g;
}

// -- Task 11: LevelRun.test ----------------------------------------------

test('OR truth table passes', () => {
  const g = buildOR();
  const spec = {
    io: { inputs: ['A', 'B'], outputs: ['Y'] },
    truthTable: [
      { in: [0, 0], out: [0] },
      { in: [0, 1], out: [1] },
      { in: [1, 0], out: [1] },
      { in: [1, 1], out: [1] },
    ],
  };
  const result = LevelRun.test(g, spec);
  assert.equal(result.passed, true);
  assert.equal(result.firstFailure, -1);
  assert.equal(result.rows.length, 4);
  for (const row of result.rows) {
    assert.equal(row.match, true);
  }
});

test('broken graph fails with firstFailure set', () => {
  const g = buildBuffer();
  const spec = {
    io: { inputs: ['A', 'B'], outputs: ['Y'] },
    truthTable: [
      { in: [0, 0], out: [0] }, // buffer=0, expect 0 -> match
      { in: [0, 1], out: [0] }, // buffer=0, expect 0 -> match
      { in: [1, 0], out: [0] }, // buffer=1, expect 0 -> MISMATCH
      { in: [1, 1], out: [1] }, // buffer=1, expect 1 -> match
    ],
  };
  const result = LevelRun.test(g, spec);
  assert.equal(result.passed, false);
  assert.equal(result.firstFailure, 2);
});

test('rows include settled flag and ticks', () => {
  const g = buildOR();
  const spec = {
    io: { inputs: ['A', 'B'], outputs: ['Y'] },
    truthTable: [{ in: [0, 0], out: [0] }],
  };
  const result = LevelRun.test(g, spec);
  assert.equal(typeof result.rows[0].settled, 'boolean');
  assert.equal(typeof result.rows[0].ticks, 'number');
});

test('conflicts surfaced when present', () => {
  const g = buildConflict();
  const spec = {
    io: { inputs: [], outputs: ['Y'] },
    truthTable: [{ in: [], out: [0] }],
  };
  const result = LevelRun.test(g, spec);
  assert.ok(result.conflicts.length > 0, 'expected conflicts to be surfaced');
});

// -- Task 12: LevelRun.score ---------------------------------------------

const threeFive = {
  starGoals: {
    gates: { '3star': 3, '2star': 5 },
    ticks: { '3star': 3, '2star': 5 },
  },
};

test('failing run gets 0 stars regardless of gates/ticks', () => {
  const failing = { passed: false, rows: [], firstFailure: 0, settled: true, conflicts: [] };
  const s = LevelRun.score(failing, { gates: 0, ticks: 0 }, threeFive);
  assert.equal(s.stars, 0);
});

test('3-star solution with goals met on both axes', () => {
  const passing = { passed: true, rows: [], firstFailure: -1, settled: true, conflicts: [] };
  const s = LevelRun.score(passing, { gates: 2, ticks: 2 }, threeFive);
  assert.equal(s.stars, 3);
  assert.equal(s.gatesStar, 3);
  assert.equal(s.ticksStar, 3);
});

test('2-star solution — gates meet 3-star goal but ticks only 2-star goal', () => {
  const passing = { passed: true, rows: [], firstFailure: -1, settled: true, conflicts: [] };
  const s = LevelRun.score(passing, { gates: 2, ticks: 4 }, threeFive);
  assert.equal(s.stars, 2);
  assert.equal(s.gatesStar, 3);
  assert.equal(s.ticksStar, 2);
});

test('1-star solution — exceeds both 2-star thresholds', () => {
  const passing = { passed: true, rows: [], firstFailure: -1, settled: true, conflicts: [] };
  const s = LevelRun.score(passing, { gates: 10, ticks: 10 }, threeFive);
  assert.equal(s.stars, 1);
  assert.equal(s.gatesStar, 1);
  assert.equal(s.ticksStar, 1);
});
