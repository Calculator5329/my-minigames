import { test } from 'node:test';
import assert from 'node:assert/strict';
import simMod from '../lib/sim.js';
import lrMod from '../lib/levelrun.js';
const { Sim } = simMod;
const { Levelrun } = lrMod;

function andCircuit() {
  return {
    nodes: [
      { id: 'a', type: 'INPUT',  props: { label: 'A' } },
      { id: 'b', type: 'INPUT',  props: { label: 'B' } },
      { id: 'g', type: 'AND' },
      { id: 'y', type: 'OUTPUT', props: { label: 'Y' } }
    ],
    wires: [
      { id: 'w1', from: { node: 'a', pin: 'y' }, to: { node: 'g', pin: 'a' } },
      { id: 'w2', from: { node: 'b', pin: 'y' }, to: { node: 'g', pin: 'b' } },
      { id: 'w3', from: { node: 'g', pin: 'y' }, to: { node: 'y', pin: 'a' } }
    ]
  };
}

function andLevel() {
  return {
    id: 'combo-and', track: 'intro', order: 3, title: 'AND', brief: '...',
    difficulty: 1, availableGates: ['AND'],
    io: { inputs: [{ label: 'A' }, { label: 'B' }], outputs: [{ label: 'Y' }] },
    truthTable: [
      { in: [0, 0], out: [0] },
      { in: [0, 1], out: [0] },
      { in: [1, 0], out: [0] },
      { in: [1, 1], out: [1] }
    ],
    parGates: 1
  };
}

test('levelrun: AND passes', () => {
  const r = Levelrun.run({ circuit: andCircuit(), level: andLevel(), Sim });
  assert.equal(r.pass, true);
  assert.equal(r.rowsPassed, 4);
});

test('levelrun: wrong circuit fails at first mismatched row', () => {
  // OR circuit vs AND level — row 1 (A=0,B=1) wants 0 but gets 1.
  const c = andCircuit();
  c.nodes.find(n => n.id === 'g').type = 'OR';
  const r = Levelrun.run({ circuit: c, level: andLevel(), Sim });
  assert.equal(r.pass, false);
  assert.equal(r.firstFail.row, 1);
});

test('levelrun: object-form row accepted', () => {
  const level = andLevel();
  level.truthTable = [
    { in: { A: 1, B: 1 }, out: { Y: 1 } },
    { in: { A: 0, B: 0 }, out: { Y: 0 } }
  ];
  const r = Levelrun.run({ circuit: andCircuit(), level, Sim });
  assert.equal(r.pass, true);
});
