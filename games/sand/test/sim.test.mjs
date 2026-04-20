import { test } from 'node:test';
import assert from 'node:assert/strict';
import sim from '../lib/sim.js';
const { Sim } = sim;

function mkCircuit(nodes, wires) { return { nodes, wires }; }

test('sim: buffer (INPUT -> OUTPUT)', () => {
  const c = mkCircuit(
    [
      { id: 'i', type: 'INPUT',  props: { label: 'A' } },
      { id: 'o', type: 'OUTPUT', props: { label: 'Y' } }
    ],
    [ { from: { node: 'i', pin: 'y' }, to: { node: 'o', pin: 'a' } } ]
  );
  const g = Sim.build(c);
  assert.deepEqual(Sim.tick(g, { A: 0 }), { Y: 0 });
  assert.deepEqual(Sim.tick(g, { A: 1 }), { Y: 1 });
});

test('sim: NOT', () => {
  const c = mkCircuit(
    [
      { id: 'i', type: 'INPUT', props: { label: 'A' } },
      { id: 'n', type: 'NOT' },
      { id: 'o', type: 'OUTPUT', props: { label: 'Y' } }
    ],
    [
      { from: { node: 'i', pin: 'y' }, to: { node: 'n', pin: 'a' } },
      { from: { node: 'n', pin: 'y' }, to: { node: 'o', pin: 'a' } }
    ]
  );
  const g = Sim.build(c);
  assert.deepEqual(Sim.tick(g, { A: 0 }), { Y: 1 });
  assert.deepEqual(Sim.tick(g, { A: 1 }), { Y: 0 });
});

test('sim: AND truth table', () => {
  const c = mkCircuit(
    [
      { id: 'a', type: 'INPUT', props: { label: 'A' } },
      { id: 'b', type: 'INPUT', props: { label: 'B' } },
      { id: 'g', type: 'AND' },
      { id: 'y', type: 'OUTPUT', props: { label: 'Y' } }
    ],
    [
      { from: { node: 'a', pin: 'y' }, to: { node: 'g', pin: 'a' } },
      { from: { node: 'b', pin: 'y' }, to: { node: 'g', pin: 'b' } },
      { from: { node: 'g', pin: 'y' }, to: { node: 'y', pin: 'a' } }
    ]
  );
  const g = Sim.build(c);
  for (const [a,b,y] of [[0,0,0],[0,1,0],[1,0,0],[1,1,1]]) {
    assert.deepEqual(Sim.tick(g, { A: a, B: b }), { Y: y }, `A=${a} B=${b}`);
  }
});

test('sim: combinational cycle throws', () => {
  const c = mkCircuit(
    [
      { id: 'n1', type: 'AND' },
      { id: 'n2', type: 'AND' }
    ],
    [
      { from: { node: 'n1', pin: 'y' }, to: { node: 'n2', pin: 'a' } },
      { from: { node: 'n2', pin: 'y' }, to: { node: 'n1', pin: 'a' } }
    ]
  );
  assert.throws(() => Sim.build(c), /combinational cycle/);
});

test('sim: DFF captures D on rising edge of CLK', () => {
  const c = mkCircuit(
    [
      { id: 'd',   type: 'INPUT', props: { label: 'D' } },
      { id: 'clk', type: 'CLOCK' },
      { id: 'ff',  type: 'DFF' },
      { id: 'o',   type: 'OUTPUT', props: { label: 'Q' } }
    ],
    [
      { from: { node: 'd',   pin: 'y' }, to: { node: 'ff', pin: 'd'   } },
      { from: { node: 'clk', pin: 'y' }, to: { node: 'ff', pin: 'clk' } },
      { from: { node: 'ff',  pin: 'q' }, to: { node: 'o',  pin: 'a'   } }
    ]
  );
  const g = Sim.build(c);
  Sim.tick(g, { D: 1, __clk: 0 });
  let out = Sim.tick(g, { D: 1, __clk: 0 });
  assert.equal(out.Q, 0, 'no rising edge yet');
  out = Sim.tick(g, { D: 1, __clk: 1 });
  assert.equal(out.Q, 1);
  out = Sim.tick(g, { D: 0, __clk: 1 });
  assert.equal(out.Q, 1);
  Sim.tick(g, { D: 0, __clk: 0 });
  out = Sim.tick(g, { D: 0, __clk: 1 });
  assert.equal(out.Q, 0);
});
