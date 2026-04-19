import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Model = require('../lib/model.js');

test('graph round-trip', () => {
  const g = Model.create();
  const a = Model.addNode(g, { type: 'pad_in', x: 0, y: 0, label: 'A' });
  const b = Model.addNode(g, { type: 'pad_out', x: 100, y: 0, label: 'Y' });
  Model.addWire(g, { from: { node: a.id, pin: 'out' }, to: { node: b.id, pin: 'in' } });
  const json = Model.toJSON(g);
  const g2 = Model.fromJSON(JSON.parse(JSON.stringify(json)));
  assert.deepEqual(Model.toJSON(g2), json);
});

test('ids are monotonic', () => {
  const g = Model.create();
  const a = Model.addNode(g, { type: 'pad_in', x: 0, y: 0 });
  const b = Model.addNode(g, { type: 'pad_out', x: 0, y: 0 });
  const c = Model.addNode(g, { type: 'pad_in', x: 0, y: 0 });
  assert.equal(a.id, 'n1');
  assert.equal(b.id, 'n2');
  assert.equal(c.id, 'n3');
  // removing does not reuse ids
  Model.removeNode(g, b.id);
  const d = Model.addNode(g, { type: 'pad_in', x: 0, y: 0 });
  assert.equal(d.id, 'n4');
});

test('duplicate wire rejected', () => {
  const g = Model.create();
  const a = Model.addNode(g, { type: 'pad_in', x: 0, y: 0 });
  const b = Model.addNode(g, { type: 'pad_out', x: 0, y: 0 });
  const w1 = Model.addWire(g, { from: { node: a.id, pin: 'out' }, to: { node: b.id, pin: 'in' } });
  assert.ok(w1 && w1.id);
  const w2 = Model.addWire(g, { from: { node: a.id, pin: 'out' }, to: { node: b.id, pin: 'in' } });
  assert.equal(w2, null);
});

test('removeNode removes attached wires', () => {
  const g = Model.create();
  const a = Model.addNode(g, { type: 'pad_in', x: 0, y: 0 });
  const b = Model.addNode(g, { type: 'pad_out', x: 0, y: 0 });
  const c = Model.addNode(g, { type: 'pad_out', x: 0, y: 0 });
  Model.addWire(g, { from: { node: a.id, pin: 'out' }, to: { node: b.id, pin: 'in' } });
  Model.addWire(g, { from: { node: a.id, pin: 'out' }, to: { node: c.id, pin: 'in' } });
  const json0 = Model.toJSON(g);
  assert.equal(json0.wires.length, 2);
  const ok = Model.removeNode(g, a.id);
  assert.equal(ok, true);
  const json1 = Model.toJSON(g);
  assert.equal(json1.wires.length, 0);
  assert.equal(json1.nodes.length, 2);
});

test('wire rejected for unknown pin', () => {
  const g = Model.create();
  const a = Model.addNode(g, { type: 'pad_in', x: 0, y: 0 });
  const b = Model.addNode(g, { type: 'pad_out', x: 0, y: 0 });
  // pad_in has only 'out'; 'in' is not valid on pad_in
  const bad1 = Model.addWire(g, { from: { node: a.id, pin: 'nope' }, to: { node: b.id, pin: 'in' } });
  assert.equal(bad1, null);
  const bad2 = Model.addWire(g, { from: { node: a.id, pin: 'out' }, to: { node: b.id, pin: 'nope' } });
  assert.equal(bad2, null);
  // missing node
  const bad3 = Model.addWire(g, { from: { node: 'n999', pin: 'out' }, to: { node: b.id, pin: 'in' } });
  assert.equal(bad3, null);
});
