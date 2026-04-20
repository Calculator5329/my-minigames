import { test } from 'node:test';
import assert from 'node:assert/strict';
import m from '../lib/model.js';
import a from '../lib/analyze.js';
const { Model } = m;
const { Analyze } = a;

test('model: add/remove nodes and wires', () => {
  const c = Model.Circuit();
  const n1 = Model.addNode(c, 'INPUT', 0, 0, { label: 'A' });
  const n2 = Model.addNode(c, 'OUTPUT', 100, 0, { label: 'Y' });
  assert.equal(c.nodes.length, 2);
  Model.addWire(c, { node: n1, pin: 'y' }, { node: n2, pin: 'a' });
  assert.equal(c.wires.length, 1);
  Model.removeNode(c, n1);
  assert.equal(c.nodes.length, 1);
  assert.equal(c.wires.length, 0, 'dangling wire removed');
});

test('model: clone produces independent copy', () => {
  const c = Model.Circuit();
  Model.addNode(c, 'AND', 10, 20);
  const copy = Model.clone(c);
  Model.addNode(copy, 'OR', 30, 40);
  assert.equal(c.nodes.length, 1);
  assert.equal(copy.nodes.length, 2);
});

test('analyze: gate count excludes IO and consts', () => {
  const c = Model.Circuit();
  Model.addNode(c, 'INPUT', 0, 0, { label: 'A' });
  Model.addNode(c, 'AND', 50, 0);
  Model.addNode(c, 'OUTPUT', 100, 0, { label: 'Y' });
  Model.addNode(c, 'CONST0', 50, 50);
  assert.equal(Analyze.gateCount(c), 1);
});

test('analyze: star thresholds', () => {
  assert.equal(Analyze.starFor(2, 2), 3);
  assert.equal(Analyze.starFor(3, 2), 2);
  assert.equal(Analyze.starFor(4, 2), 1);
  assert.equal(Analyze.starFor(1, 2), 3);
});
