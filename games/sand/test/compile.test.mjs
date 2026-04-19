// games/sand/test/compile.test.mjs
// Task 9: Component compiler — graph -> black-box component.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Model } = require('../lib/model.js');
const { Sim } = require('../lib/sim.js');
const { Compile } = require('../lib/compile.js');

// -- helpers ---------------------------------------------------------------

function newGraph() { return Model.create(); }
function addPadIn(g, label) {
  return Model.addNode(g, { type: 'pad_in', props: { label, value: 0 } });
}
function addPadOut(g, label) {
  return Model.addNode(g, { type: 'pad_out', props: { label } });
}
function addN(g, type, props) {
  return Model.addNode(g, { type, props: props || {} });
}
function wire(g, a, aPin, b, bPin) {
  const w = Model.addWire(g, {
    from: { node: a.id, pin: aPin },
    to:   { node: b.id, pin: bPin },
  });
  if (!w) throw new Error(`failed wire ${a.id}.${aPin} -> ${b.id}.${bPin}`);
  return w;
}

// Build a NOT graph: A (pad_in) -> switch.gate; gnd -> switch.in;
// switch.out -> pullup.a; pullup.out -> Y (pad_out).
function buildNotGraph() {
  const g = newGraph();
  const A  = addPadIn(g, 'A');
  const Y  = addPadOut(g, 'Y');
  const gnd = addN(g, 'ground');
  const sw  = addN(g, 'switch');
  const pu  = addN(g, 'pullup');
  wire(g, gnd, 'out', sw, 'in');
  wire(g, A,   'out', sw, 'gate');
  wire(g, sw,  'out', pu, 'a');
  wire(g, pu,  'out', Y,  'in');
  return g;
}

// Build a NAND graph: A,B gates on two switches in series to ground,
// pullup on the output.
function buildNandGraph() {
  const g = newGraph();
  const A  = addPadIn(g, 'A');
  const B  = addPadIn(g, 'B');
  const Y  = addPadOut(g, 'Y');
  const gnd = addN(g, 'ground');
  const sA  = addN(g, 'switch');
  const sB  = addN(g, 'switch');
  const pu  = addN(g, 'pullup');
  wire(g, gnd, 'out', sA, 'in');
  wire(g, sA,  'out', sB, 'in');
  wire(g, sB,  'out', pu, 'a');
  wire(g, pu,  'out', Y,  'in');
  wire(g, A,   'out', sA, 'gate');
  wire(g, B,   'out', sB, 'gate');
  return g;
}

// -- 1. Compile NOT, use it in a bigger graph ------------------------------

test('compile NOT and use it in another graph', () => {
  const notGraph = buildNotGraph();
  const registry = Compile.createRegistry();
  const def = Compile.compile(notGraph, { id: 'not', name: 'NOT' });
  Compile.register(registry, def);

  assert.deepEqual(def.inputPins, ['A']);
  assert.deepEqual(def.outputPins, ['Y']);

  // Outer graph: X -> not.A, not.Y -> Z.
  const outer = newGraph();
  const X = addPadIn(outer, 'X');
  const Z = addPadOut(outer, 'Z');
  const notInst = addN(outer, 'not');
  wire(outer, X,       'out', notInst, 'A');
  wire(outer, notInst, 'Y',   Z,       'in');

  const runner = Sim.create(outer, { componentRegistry: registry });
  for (const [x, z] of [[0, 1], [1, 0]]) {
    runner.reset();
    runner.setInput('X', x);
    const r = runner.run({ maxTicks: 32 });
    assert.ok(r.settled, `not settled for X=${x}`);
    assert.equal(runner.readOutput('Z'), z, `X=${x} expected Z=${z}`);
  }
});

// -- 2. Compile NAND, build AND from two NANDs -----------------------------

test('compile NAND, then build AND from two NAND instances', () => {
  const nandGraph = buildNandGraph();
  const registry = Compile.createRegistry();
  const def = Compile.compile(nandGraph, { id: 'nand', name: 'NAND' });
  Compile.register(registry, def);

  assert.deepEqual(def.inputPins, ['A', 'B']);
  assert.deepEqual(def.outputPins, ['Y']);

  // AND = NAND(A,B) -> NAND2(x,x) = NOT(NAND(A,B)).
  const outer = newGraph();
  const A = addPadIn(outer, 'A');
  const B = addPadIn(outer, 'B');
  const Y = addPadOut(outer, 'Y');
  const n1 = addN(outer, 'nand');
  const n2 = addN(outer, 'nand');
  wire(outer, A,  'out', n1, 'A');
  wire(outer, B,  'out', n1, 'B');
  wire(outer, n1, 'Y',   n2, 'A');
  wire(outer, n1, 'Y',   n2, 'B');
  wire(outer, n2, 'Y',   Y,  'in');

  const runner = Sim.create(outer, { componentRegistry: registry });
  for (const [a, b, y] of [[0,0,0],[0,1,0],[1,0,0],[1,1,1]]) {
    runner.reset();
    runner.setInput('A', a);
    runner.setInput('B', b);
    const r = runner.run({ maxTicks: 64 });
    assert.ok(r.settled, `not settled for A=${a} B=${b}`);
    assert.equal(runner.readOutput('Y'), y, `A=${a} B=${b} expected Y=${y} got ${runner.readOutput('Y')}`);
  }
});

// -- 3. Input/output pin labels derived alphabetically ---------------------

test('inputPins and outputPins are derived from pad labels alphabetically', () => {
  const g = newGraph();
  addPadIn(g, 'B');
  addPadIn(g, 'A');
  addPadIn(g, 'C');
  addPadOut(g, 'Z');
  addPadOut(g, 'Q');
  const def = Compile.compile(g, { id: 'multi' });
  assert.deepEqual(def.inputPins, ['A', 'B', 'C']);
  assert.deepEqual(def.outputPins, ['Q', 'Z']);
});

// -- 4. tickDepth recorded -------------------------------------------------

test('tickDepth recorded on compiled definition', () => {
  const g = buildNotGraph();
  const def = Compile.compile(g, { id: 'not' });
  assert.equal(typeof def.tickDepth, 'number');
  // NOT graph: pad_in -> switch -> pullup -> pad_out = 2 intermediate gates.
  assert.equal(def.tickDepth, 2);
});

// -- 5. Registry get/unknown -----------------------------------------------

test('registry get returns registered def and null for unknown', () => {
  const registry = Compile.createRegistry();
  const def = Compile.compile(buildNotGraph(), { id: 'not' });
  Compile.register(registry, def);
  assert.strictEqual(Compile.get(registry, 'not'), def);
  assert.strictEqual(Compile.get(registry, 'nope'), null);
});

// -- 6. peekInside: returns deep-cloned internal graph --------------------

test('peekInside returns a deep-cloned internal graph', () => {
  const registry = Compile.createRegistry();
  const def = Compile.compile(buildNotGraph(), { id: 'not' });
  Compile.register(registry, def);

  const peek1 = Compile.peekInside(registry, 'not');
  assert.ok(peek1, 'expected peekInside to return a graph');
  assert.ok(peek1.nodes, 'expected .nodes on peeked graph');
  assert.ok(peek1.wires, 'expected .wires on peeked graph');

  // Mutate the returned object.
  peek1.nodes = [];
  peek1.wires = [];
  peek1.__tampered = true;

  // A subsequent peek should not reflect the mutation.
  const peek2 = Compile.peekInside(registry, 'not');
  assert.ok(peek2.nodes && Object.keys(peek2.nodes).length > 0 || (Array.isArray(peek2.nodes) && peek2.nodes.length > 0), 'peek2 should still have nodes');
  assert.ok(!peek2.__tampered, 'peek2 should not carry __tampered from peek1');

  // Unknown id returns null.
  assert.strictEqual(Compile.peekInside(registry, 'nope'), null);
});
