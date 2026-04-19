// scripts/sand-generate-levels.mjs
// Generates Layer-1 puzzle JSON files for the `sand` cartridge.
// For each level: build a reference graph, verify it passes the truth
// table via LevelRun.test, compute gate/tick stats, and emit JSON.
//
// Run: node scripts/sand-generate-levels.mjs
//
// Exits non-zero on any failed level or validation error.

import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { Model } = require('../games/sand/lib/model.js');
const { LevelRun } = require('../games/sand/lib/levelrun.js');
const { Levels } = require('../games/sand/lib/levels.js');
const { Analyze } = require('../games/sand/lib/analyze.js');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OUT_DIR = resolve(__dirname, '..', 'games', 'sand', 'data', 'levels');

// --- graph builder helpers -------------------------------------------------

function newGraph() { return Model.create(); }
function addPadIn(g, label)  { return Model.addNode(g, { type: 'pad_in',  props: { label, value: 0 } }); }
function addPadOut(g, label) { return Model.addNode(g, { type: 'pad_out', props: { label } }); }
function addN(g, type)       { return Model.addNode(g, { type }); }
function wire(g, a, ap, b, bp) {
  const w = Model.addWire(g, { from: { node: a.id, pin: ap }, to: { node: b.id, pin: bp } });
  if (!w) throw new Error(`wire failed ${a.id}.${ap} -> ${b.id}.${bp}`);
  return w;
}

// --- reusable sub-graph builders ------------------------------------------

// Build a NOT gate: returns { inGate, outNode, outPin }
// NOT via: ground -> switch.in, gate is input, switch.out -> pullup.a, pullup.out = ~gate
function buildNotInto(g, driverNode, driverPin) {
  const s = addN(g, 'switch');
  const gnd = addN(g, 'ground');
  const pu = addN(g, 'pullup');
  wire(g, gnd, 'out', s, 'in');
  wire(g, driverNode, driverPin, s, 'gate');
  wire(g, s, 'out', pu, 'a');
  return { node: pu, pin: 'out' };
}

// Build AND of two drivers (from nodes + pins). Returns output driver.
// series: power -> sA.in (gate=a); sA.out -> sB.in (gate=b); sB.out = A AND B
function buildAndInto(g, aNode, aPin, bNode, bPin) {
  const pwr = addN(g, 'power');
  const sA = addN(g, 'switch');
  const sB = addN(g, 'switch');
  wire(g, pwr, 'out', sA, 'in');
  wire(g, aNode, aPin, sA, 'gate');
  wire(g, sA, 'out', sB, 'in');
  wire(g, bNode, bPin, sB, 'gate');
  return { node: sB, pin: 'out' };
}

// --- level-spec truth tables ----------------------------------------------

const TT = {
  buffer: [
    { in: [0], out: [0] },
    { in: [1], out: [1] },
  ],
  not: [
    { in: [0], out: [1] },
    { in: [1], out: [0] },
  ],
  and2: [
    { in: [0, 0], out: [0] },
    { in: [0, 1], out: [0] },
    { in: [1, 0], out: [0] },
    { in: [1, 1], out: [1] },
  ],
  or2: [
    { in: [0, 0], out: [0] },
    { in: [0, 1], out: [1] },
    { in: [1, 0], out: [1] },
    { in: [1, 1], out: [1] },
  ],
  nand2: [
    { in: [0, 0], out: [1] },
    { in: [0, 1], out: [1] },
    { in: [1, 0], out: [1] },
    { in: [1, 1], out: [0] },
  ],
  nor2: [
    { in: [0, 0], out: [1] },
    { in: [0, 1], out: [0] },
    { in: [1, 0], out: [0] },
    { in: [1, 1], out: [0] },
  ],
  xor2: [
    { in: [0, 0], out: [0] },
    { in: [0, 1], out: [1] },
    { in: [1, 0], out: [1] },
    { in: [1, 1], out: [0] },
  ],
  xnor2: [
    { in: [0, 0], out: [1] },
    { in: [0, 1], out: [0] },
    { in: [1, 0], out: [0] },
    { in: [1, 1], out: [1] },
  ],
  // MUX2: inputs A,B,S; Y = S ? B : A
  mux2: (function () {
    const rows = [];
    for (let a = 0; a < 2; a++) {
      for (let b = 0; b < 2; b++) {
        for (let s = 0; s < 2; s++) {
          rows.push({ in: [a, b, s], out: [s ? b : a] });
        }
      }
    }
    return rows;
  })(),
  // Tri-state: D AND EN
  tristate: [
    { in: [0, 0], out: [0] },
    { in: [0, 1], out: [0] },
    { in: [1, 0], out: [0] },
    { in: [1, 1], out: [1] },
  ],
};

// --- reference-solution builders ------------------------------------------

function buildBuffer() {
  const g = newGraph();
  const A = addPadIn(g, 'A');
  const Y = addPadOut(g, 'Y');
  const pwr = addN(g, 'power');
  const s = addN(g, 'switch');
  wire(g, pwr, 'out', s, 'in');
  wire(g, A, 'out', s, 'gate');
  wire(g, s, 'out', Y, 'in');
  return g;
}

function buildNot() {
  const g = newGraph();
  const A = addPadIn(g, 'A');
  const Y = addPadOut(g, 'Y');
  const { node, pin } = buildNotInto(g, A, 'out');
  wire(g, node, pin, Y, 'in');
  return g;
}

function buildAnd() {
  const g = newGraph();
  const A = addPadIn(g, 'A');
  const B = addPadIn(g, 'B');
  const Y = addPadOut(g, 'Y');
  const { node, pin } = buildAndInto(g, A, 'out', B, 'out');
  wire(g, node, pin, Y, 'in');
  return g;
}

function buildOr() {
  const g = newGraph();
  const A = addPadIn(g, 'A');
  const B = addPadIn(g, 'B');
  const Y = addPadOut(g, 'Y');
  const pwr = addN(g, 'power');
  const sA = addN(g, 'switch');
  const sB = addN(g, 'switch');
  wire(g, pwr, 'out', sA, 'in');
  wire(g, pwr, 'out', sB, 'in');
  wire(g, A, 'out', sA, 'gate');
  wire(g, B, 'out', sB, 'gate');
  wire(g, sA, 'out', Y, 'in');
  wire(g, sB, 'out', Y, 'in');
  return g;
}

function buildNand() {
  // A AND B, then NOT on top.
  const g = newGraph();
  const A = addPadIn(g, 'A');
  const B = addPadIn(g, 'B');
  const Y = addPadOut(g, 'Y');
  // series to ground, with pullup
  const gnd = addN(g, 'ground');
  const sA = addN(g, 'switch');
  const sB = addN(g, 'switch');
  const pu = addN(g, 'pullup');
  wire(g, gnd, 'out', sA, 'in');
  wire(g, A, 'out', sA, 'gate');
  wire(g, sA, 'out', sB, 'in');
  wire(g, B, 'out', sB, 'gate');
  wire(g, sB, 'out', pu, 'a');
  wire(g, pu, 'out', Y, 'in');
  return g;
}

function buildNor() {
  const g = newGraph();
  const A = addPadIn(g, 'A');
  const B = addPadIn(g, 'B');
  const Y = addPadOut(g, 'Y');
  const gnd = addN(g, 'ground');
  const sA = addN(g, 'switch');
  const sB = addN(g, 'switch');
  const pu = addN(g, 'pullup');
  wire(g, gnd, 'out', sA, 'in');
  wire(g, A, 'out', sA, 'gate');
  wire(g, gnd, 'out', sB, 'in');
  wire(g, B, 'out', sB, 'gate');
  wire(g, sA, 'out', pu, 'a');
  wire(g, sB, 'out', pu, 'a');
  wire(g, pu, 'out', Y, 'in');
  return g;
}

function buildXor() {
  // Y = (A AND NOT B) OR (NOT A AND B), wire-OR of two AND outputs.
  const g = newGraph();
  const A = addPadIn(g, 'A');
  const B = addPadIn(g, 'B');
  const Y = addPadOut(g, 'Y');
  const notA = buildNotInto(g, A, 'out');
  const notB = buildNotInto(g, B, 'out');
  const t1 = buildAndInto(g, A, 'out', notB.node, notB.pin);       // A AND !B
  const t2 = buildAndInto(g, notA.node, notA.pin, B, 'out');       // !A AND B
  wire(g, t1.node, t1.pin, Y, 'in');
  wire(g, t2.node, t2.pin, Y, 'in');
  return g;
}

function buildXnor() {
  // Y = (A AND B) OR (NOT A AND NOT B)
  const g = newGraph();
  const A = addPadIn(g, 'A');
  const B = addPadIn(g, 'B');
  const Y = addPadOut(g, 'Y');
  const notA = buildNotInto(g, A, 'out');
  const notB = buildNotInto(g, B, 'out');
  const t1 = buildAndInto(g, A, 'out', B, 'out');
  const t2 = buildAndInto(g, notA.node, notA.pin, notB.node, notB.pin);
  wire(g, t1.node, t1.pin, Y, 'in');
  wire(g, t2.node, t2.pin, Y, 'in');
  return g;
}

function buildMux2() {
  // Y = (NOT S AND A) OR (S AND B)
  const g = newGraph();
  const A = addPadIn(g, 'A');
  const B = addPadIn(g, 'B');
  const S = addPadIn(g, 'S');
  const Y = addPadOut(g, 'Y');
  const notS = buildNotInto(g, S, 'out');
  const t1 = buildAndInto(g, notS.node, notS.pin, A, 'out');
  const t2 = buildAndInto(g, S, 'out', B, 'out');
  wire(g, t1.node, t1.pin, Y, 'in');
  wire(g, t2.node, t2.pin, Y, 'in');
  return g;
}

function buildTristate() {
  // Y = D AND EN
  const g = newGraph();
  const D = addPadIn(g, 'D');
  const EN = addPadIn(g, 'EN');
  const Y = addPadOut(g, 'Y');
  const t = buildAndInto(g, D, 'out', EN, 'out');
  wire(g, t.node, t.pin, Y, 'in');
  return g;
}

// --- level descriptor list -------------------------------------------------

const L1_ALLOWED_BASIC = ['pad_in', 'pad_out', 'power', 'ground', 'switch', 'pullup'];
const L1_ALLOWED_WITH_COMPOUNDS = [
  ...L1_ALLOWED_BASIC,
  'buffer', 'not', 'and', 'or', 'nand', 'nor',
];

const LEVELS = [
  {
    id: 'L1_01_buffer', order: 1, title: 'Buffer',
    brief: 'Pass A through to Y. A simple warm-up.',
    io: { inputs: ['A'], outputs: ['Y'] },
    truthTable: TT.buffer,
    allowedComponents: L1_ALLOWED_BASIC,
    unlocksComponent: { id: 'buffer', name: 'Buffer' },
    build: buildBuffer,
  },
  {
    id: 'L1_02_not', order: 2, title: 'NOT',
    brief: 'Invert A.',
    io: { inputs: ['A'], outputs: ['Y'] },
    truthTable: TT.not,
    allowedComponents: L1_ALLOWED_BASIC,
    unlocksComponent: { id: 'not', name: 'NOT' },
    build: buildNot,
  },
  {
    id: 'L1_03_and', order: 3, title: 'AND',
    brief: 'Output high only when both inputs are high.',
    io: { inputs: ['A', 'B'], outputs: ['Y'] },
    truthTable: TT.and2,
    allowedComponents: L1_ALLOWED_BASIC,
    unlocksComponent: { id: 'and', name: 'AND' },
    build: buildAnd,
  },
  {
    id: 'L1_04_or', order: 4, title: 'OR',
    brief: 'Output high when either input is high.',
    io: { inputs: ['A', 'B'], outputs: ['Y'] },
    truthTable: TT.or2,
    allowedComponents: L1_ALLOWED_BASIC,
    unlocksComponent: { id: 'or', name: 'OR' },
    build: buildOr,
  },
  {
    id: 'L1_05_nand', order: 5, title: 'NAND',
    brief: 'Output low only when both inputs are high.',
    io: { inputs: ['A', 'B'], outputs: ['Y'] },
    truthTable: TT.nand2,
    allowedComponents: L1_ALLOWED_BASIC,
    unlocksComponent: { id: 'nand', name: 'NAND' },
    build: buildNand,
  },
  {
    id: 'L1_06_nor', order: 6, title: 'NOR',
    brief: 'Output high only when both inputs are low.',
    io: { inputs: ['A', 'B'], outputs: ['Y'] },
    truthTable: TT.nor2,
    allowedComponents: L1_ALLOWED_BASIC,
    unlocksComponent: { id: 'nor', name: 'NOR' },
    build: buildNor,
  },
  {
    id: 'L1_07_xor', order: 7, title: 'XOR',
    brief: 'Output high when inputs differ.',
    io: { inputs: ['A', 'B'], outputs: ['Y'] },
    truthTable: TT.xor2,
    allowedComponents: L1_ALLOWED_WITH_COMPOUNDS,
    unlocksComponent: { id: 'xor', name: 'XOR' },
    build: buildXor,
  },
  {
    id: 'L1_08_xnor', order: 8, title: 'XNOR',
    brief: 'Output high when inputs match.',
    io: { inputs: ['A', 'B'], outputs: ['Y'] },
    truthTable: TT.xnor2,
    allowedComponents: L1_ALLOWED_WITH_COMPOUNDS,
    unlocksComponent: { id: 'xnor', name: 'XNOR' },
    build: buildXnor,
  },
  {
    id: 'L1_09_mux2', order: 9, title: '2:1 MUX',
    brief: 'Select between A and B using S.',
    io: { inputs: ['A', 'B', 'S'], outputs: ['Y'] },
    truthTable: TT.mux2,
    allowedComponents: L1_ALLOWED_WITH_COMPOUNDS,
    unlocksComponent: { id: 'mux2', name: '2:1 MUX' },
    build: buildMux2,
  },
  {
    id: 'L1_10_tristate', order: 10, title: 'Tri-state buffer',
    brief: 'When EN is high, pass D. When EN is low, Y is low (default).',
    io: { inputs: ['D', 'EN'], outputs: ['Y'] },
    truthTable: TT.tristate,
    allowedComponents: L1_ALLOWED_WITH_COMPOUNDS,
    unlocksComponent: { id: 'tristate', name: 'Tri-state' },
    build: buildTristate,
  },
];

// --- emit -----------------------------------------------------------------

mkdirSync(OUT_DIR, { recursive: true });

let failed = 0;
const summary = [];
const files = [];

for (const L of LEVELS) {
  const graph = L.build();
  const refJSON = Model.toJSON(graph);

  const levelSpecForTest = {
    io: L.io,
    truthTable: L.truthTable,
  };

  const result = LevelRun.test(graph, levelSpecForTest, { maxTicks: 64 });
  const gates = Analyze.gateCount(graph);
  const ticks = Analyze.tickDepth(graph);

  if (!result.passed) {
    failed++;
    console.log(`\u2717 ${L.id} FAILED (firstFailure=${result.firstFailure})`);
    for (const r of result.rows) {
      console.log('  ', JSON.stringify(r));
    }
    continue;
  }
  console.log(`\u2713 ${L.id} passed  gates=${gates} ticks=${ticks}`);

  const doc = {
    id: L.id,
    layer: 'L1',
    order: L.order,
    title: L.title,
    brief: L.brief,
    allowedComponents: L.allowedComponents,
    io: L.io,
    truthTable: L.truthTable,
    starGoals: {
      gates: { '3star': gates, '2star': gates + 2 },
      ticks: { '3star': ticks, '2star': ticks + 2 },
    },
    unlocksComponent: L.unlocksComponent,
    referenceSolution: refJSON,
  };

  const check = Levels.validateLevel(doc, { knownLayers: ['L1'] });
  if (!check.ok) {
    failed++;
    console.log(`\u2717 ${L.id} schema invalid:`, check.errors.join('; '));
    continue;
  }

  const fn = `${L.id}.json`;
  writeFileSync(resolve(OUT_DIR, fn), JSON.stringify(doc, null, 2) + '\n', 'utf8');
  files.push(fn);
  summary.push({ id: L.id, gates, ticks, stars3: 3 });
}

// index.json with files in order
const idxFiles = LEVELS
  .filter((L) => files.includes(`${L.id}.json`))
  .map((L) => `${L.id}.json`);
writeFileSync(
  resolve(OUT_DIR, 'index.json'),
  JSON.stringify({ files: idxFiles }, null, 2) + '\n',
  'utf8'
);

console.log('\nsummary:');
for (const s of summary) {
  console.log(`  ${s.id}: gates=${s.gates} ticks=${s.ticks}`);
}
console.log(`wrote ${files.length} level files + index.json to ${OUT_DIR}`);

if (failed > 0) {
  console.error(`FAILED: ${failed} levels did not pass`);
  process.exit(1);
}
