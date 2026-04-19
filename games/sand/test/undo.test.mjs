import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const mod = require('../lib/model.js');
const Model = mod.Model;
const History = mod.History;

test('undo restores previous state', () => {
  const g = Model.create();
  const h = History.create(g);
  Model.addNode(g, { type: 'pad_in', x: 0, y: 0, label: 'A' });
  History.commit(h, g);
  const oneNodeJson = Model.toJSON(g);
  Model.addNode(g, { type: 'pad_out', x: 10, y: 0, label: 'B' });
  History.commit(h, g);
  const undone = History.undo(h);
  assert.ok(undone);
  assert.deepEqual(Model.toJSON(undone), oneNodeJson);
});

test('redo restores undone state', () => {
  const g = Model.create();
  const h = History.create(g);
  Model.addNode(g, { type: 'pad_in', x: 0, y: 0, label: 'A' });
  History.commit(h, g);
  Model.addNode(g, { type: 'pad_out', x: 10, y: 0, label: 'B' });
  History.commit(h, g);
  const twoNodeJson = Model.toJSON(g);
  History.undo(h);
  const redone = History.redo(h);
  assert.ok(redone);
  assert.deepEqual(Model.toJSON(redone), twoNodeJson);
});

test('commit clears redo stack', () => {
  const g = Model.create();
  const h = History.create(g);
  Model.addNode(g, { type: 'pad_in', x: 0, y: 0 });
  History.commit(h, g);
  Model.addNode(g, { type: 'pad_out', x: 0, y: 0 });
  History.commit(h, g);
  const undone = History.undo(h);
  assert.ok(undone);
  assert.equal(History.canRedo(h), true);
  // Branch: commit on top of the undone state.
  Model.addNode(undone, { type: 'pad_out', x: 99, y: 99, label: 'branch' });
  History.commit(h, undone);
  assert.equal(History.canRedo(h), false);
  assert.equal(History.redo(h), null);
});

test('cap enforced', () => {
  const g = Model.create();
  const h = History.create(g, { cap: 3 });
  for (let i = 0; i < 5; i++) {
    Model.addNode(g, { type: 'pad_in', x: i, y: 0 });
    History.commit(h, g);
  }
  let undos = 0;
  while (History.canUndo(h)) {
    const r = History.undo(h);
    assert.ok(r);
    undos++;
    if (undos > 10) break; // safety
  }
  assert.equal(undos, 3);
  assert.equal(History.canUndo(h), false);
});

test('canUndo/canRedo flags track correctly', () => {
  const g = Model.create();
  const h = History.create(g);
  assert.equal(History.canUndo(h), false);
  assert.equal(History.canRedo(h), false);
  assert.equal(History.undo(h), null);
  assert.equal(History.redo(h), null);
});
