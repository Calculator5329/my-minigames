// games/sand/test/analyze.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Model } = require('../lib/model.js');
const { Analyze } = require('../lib/analyze.js');

// -- helpers ---------------------------------------------------------------

function newGraph() {
  return Model.create();
}
function addPadIn(g, label) {
  return Model.addNode(g, { type: 'pad_in', props: { label, value: 0 } });
}
function addPadOut(g, label) {
  return Model.addNode(g, { type: 'pad_out', props: { label } });
}
function addN(g, type) {
  return Model.addNode(g, { type });
}
function wire(g, a, aPin, b, bPin) {
  const w = Model.addWire(g, {
    from: { node: a.id, pin: aPin },
    to:   { node: b.id, pin: bPin },
  });
  if (!w) throw new Error(`failed wire ${a.id}.${aPin} -> ${b.id}.${bPin}`);
  return w;
}

// Helper: build a single NOT gate using switch + pullup + ground.
// pad_in.A -> switch.gate; ground -> switch.in; switch.out -> pullup.a; pullup.out -> pad_out.Y
// On the pad_in -> pad_out path: switch + pullup = 2 gates. Ground is off-path.
function buildNot(g) {
  const A = addPadIn(g, 'A');
  const Y = addPadOut(g, 'Y');
  const gnd = addN(g, 'ground');
  const sw  = addN(g, 'switch');
  const pu  = addN(g, 'pullup');
  wire(g, A,   'out',  sw,  'gate');
  wire(g, gnd, 'out',  sw,  'in');
  wire(g, sw,  'out',  pu,  'a');
  wire(g, pu,  'out',  Y,   'in');
  return { A, Y, sw, pu, gnd };
}

// --- tests ----------------------------------------------------------------

test('tickDepth: direct pad_in -> pad_out = 0', () => {
  const g = newGraph();
  const A = addPadIn(g, 'A');
  const Y = addPadOut(g, 'Y');
  wire(g, A, 'out', Y, 'in');
  assert.equal(Analyze.tickDepth(g), 0);
});

test('tickDepth: NOT gate = 2 (switch + pullup); ground off-path does not count', () => {
  const g = newGraph();
  buildNot(g);
  assert.equal(Analyze.tickDepth(g), 2);
});

test('tickDepth: AND gate = 2', () => {
  // Two switches in series driving a pullup isn't actually needed for AND;
  // the plan says "sA -> sB -> pad_out" so we take that literally.
  // pad_in_A -> sA.gate; power -> sA.in; sA.out -> sB.gate
  // pad_in_B -> sB.in (another drive into sB); sB.out -> pad_out
  // Longest path in gates from any pad_in to pad_out:
  //   pad_in_A -> sA -> sB -> pad_out   => 2 gates
  //   pad_in_B -> sB -> pad_out         => 1 gate
  const g = newGraph();
  const A = addPadIn(g, 'A');
  const B = addPadIn(g, 'B');
  const Y = addPadOut(g, 'Y');
  const pwr = addN(g, 'power');
  const sA = addN(g, 'switch');
  const sB = addN(g, 'switch');
  wire(g, A,   'out',  sA, 'gate');
  wire(g, pwr, 'out',  sA, 'in');
  wire(g, sA,  'out',  sB, 'gate');
  wire(g, B,   'out',  sB, 'in');
  wire(g, sB,  'out',  Y,  'in');
  assert.equal(Analyze.tickDepth(g), 2);
});

test('tickDepth: XOR composition = 6', () => {
  // XOR built from two NOTs and two ANDs, then an OR (which is two pullups/switches).
  // We build the classic "A AND NOT B" OR "NOT A AND B".
  //
  // For this test we build it as two NOT-chains feeding two AND-chains, then
  // merge through one more stage. Concretely:
  //   path: A -> sA1(gate) -> pu1 -> sC1(gate) -> sC2(gate) -> pu2 -> pad_out
  // i.e. 5 gates on the "A" side. We add a parallel B side of equal or shorter
  // length. The longest pad_in -> pad_out path we construct below has 6
  // intermediate nodes.
  //
  // Structure (A branch only shown; B branch is symmetric and shorter):
  //   A -> n1.gate                 (switch)
  //   gnd -> n1.in
  //   n1.out -> n2.a               (pullup, NOT A)
  //   n2.out -> n3.gate            (switch -- AND with B)
  //   B -> n3.in
  //   n3.out -> n4.a               (pullup, recover to 1)
  //   n4.out -> n5.gate            (switch -- merge)
  //   power -> n5.in
  //   n5.out -> n6.a               (pullup)
  //   n6.out -> Y
  // Longest path A -> n1 -> n2 -> n3 -> n4 -> n5 -> n6 -> Y = 6 gates.
  const g = newGraph();
  const A = addPadIn(g, 'A');
  const B = addPadIn(g, 'B');
  const Y = addPadOut(g, 'Y');
  const gnd = addN(g, 'ground');
  const pwr = addN(g, 'power');
  const n1 = addN(g, 'switch');
  const n2 = addN(g, 'pullup');
  const n3 = addN(g, 'switch');
  const n4 = addN(g, 'pullup');
  const n5 = addN(g, 'switch');
  const n6 = addN(g, 'pullup');
  wire(g, A,   'out',  n1, 'gate');
  wire(g, gnd, 'out',  n1, 'in');
  wire(g, n1,  'out',  n2, 'a');
  wire(g, n2,  'out',  n3, 'gate');
  wire(g, B,   'out',  n3, 'in');
  wire(g, n3,  'out',  n4, 'a');
  wire(g, n4,  'out',  n5, 'gate');
  wire(g, pwr, 'out',  n5, 'in');
  wire(g, n5,  'out',  n6, 'a');
  wire(g, n6,  'out',  Y,  'in');
  assert.equal(Analyze.tickDepth(g), 6);
});

test('tickDepth: cycle returns Infinity', () => {
  // A -> sw.gate; pullup.out -> sw.in; sw.out -> pullup.a (feedback loop).
  // The pad_out is reachable from pad_in (through sw -> pullup -> pad_out) but
  // the cycle sw <-> pullup is reachable from pad_in, so depth is Infinity.
  const g = newGraph();
  const A = addPadIn(g, 'A');
  const Y = addPadOut(g, 'Y');
  const sw = addN(g, 'switch');
  const pu = addN(g, 'pullup');
  wire(g, A,  'out',  sw, 'gate');
  wire(g, pu, 'out',  sw, 'in');
  wire(g, sw, 'out',  pu, 'a');
  wire(g, pu, 'out',  Y,  'in');
  assert.equal(Analyze.tickDepth(g), Infinity);
});

test('tickDepth: 0 when no pad_out reachable', () => {
  const g = newGraph();
  const A = addPadIn(g, 'A');
  const Y = addPadOut(g, 'Y'); // disconnected pad_out
  const sw = addN(g, 'switch');
  const pu = addN(g, 'pullup');
  wire(g, A,  'out', sw, 'gate');
  wire(g, sw, 'out', pu, 'a');
  // no wire into Y
  assert.equal(Analyze.tickDepth(g), 0);
  // reference Y so lint doesn't complain
  assert.ok(Y);
});

test('gateCount excludes pads, power, ground, clock', () => {
  const g = newGraph();
  addPadIn(g, 'A');
  addPadOut(g, 'Y');
  addN(g, 'power');
  addN(g, 'ground');       // ground explicitly excluded too
  addN(g, 'clock');
  addN(g, 'switch');
  addN(g, 'switch');
  addN(g, 'switch');
  // Spec: 3 switches + pad_in + pad_out + power => gateCount = 3.
  // We also added ground and clock; both excluded, so still 3.
  assert.equal(Analyze.gateCount(g), 3);
});

test('reachable.fromInputs includes all downstream nodes of pad_in', () => {
  const g = newGraph();
  const { A, Y, sw, pu, gnd } = buildNot(g);
  const r = Analyze.reachable(g);
  assert.ok(r.fromInputs.has(sw.id));
  assert.ok(r.fromInputs.has(pu.id));
  assert.ok(r.fromInputs.has(Y.id));
  // A itself is the source; implementation includes it.
  assert.ok(r.fromInputs.has(A.id));
  // ground is NOT downstream of any pad_in.
  assert.ok(!r.fromInputs.has(gnd.id));
  // toOutputs: nodes that can reach a pad_out.
  assert.ok(r.toOutputs.has(sw.id));
  assert.ok(r.toOutputs.has(pu.id));
  assert.ok(r.toOutputs.has(gnd.id)); // ground -> sw -> pu -> Y
});
