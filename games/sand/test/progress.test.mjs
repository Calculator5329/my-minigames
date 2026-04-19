// games/sand/test/progress.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Progress } = require('../lib/progress.js');

function makeStubStorage() {
  const store = {};
  return {
    getGameData(id) {
      return store[id] ? JSON.parse(JSON.stringify(store[id])) : {};
    },
    setGameData(id, obj) {
      store[id] = JSON.parse(JSON.stringify(obj || {}));
    },
    mergeGameData(id, patch) {
      const prev = store[id] || {};
      store[id] = Object.assign({}, prev, patch || {});
      return JSON.parse(JSON.stringify(store[id]));
    },
    _dump() { return JSON.parse(JSON.stringify(store)); },
  };
}

test('isSolved is false initially', () => {
  const storage = makeStubStorage();
  const p = Progress.init({ storage });
  assert.equal(Progress.isSolved(p, 'L1_not'), false);
  assert.equal(Progress.getStars(p, 'L1_not'), 0);
});

test('recordSolve stores stars and is readable by isSolved/getStars', () => {
  const storage = makeStubStorage();
  const p = Progress.init({ storage });
  Progress.recordSolve(p, 'L1_not', { stars: 2, gates: 4, ticks: 6 });
  assert.equal(Progress.isSolved(p, 'L1_not'), true);
  assert.equal(Progress.getStars(p, 'L1_not'), 2);
});

test('best stars kept when re-solving with lower stars', () => {
  const storage = makeStubStorage();
  const p = Progress.init({ storage });
  Progress.recordSolve(p, 'L1_not', { stars: 3, gates: 2, ticks: 2 });
  Progress.recordSolve(p, 'L1_not', { stars: 1, gates: 10, ticks: 12 });
  assert.equal(Progress.getStars(p, 'L1_not'), 3);
});

test('recordSolve with unlocksComponent adds to unlockedComponents', () => {
  const storage = makeStubStorage();
  const p = Progress.init({ storage });
  const comp = { id: 'NOT', name: 'NOT gate' };
  Progress.recordSolve(p, 'L1_not', { stars: 3, gates: 2, ticks: 2 }, { unlocksComponent: comp });
  const list = Progress.unlockedComponents(p);
  assert.equal(list.length, 1);
  assert.equal(list[0].id, 'NOT');
  // Re-record doesn't duplicate.
  Progress.recordSolve(p, 'L1_not', { stars: 3, gates: 2, ticks: 2 }, { unlocksComponent: comp });
  assert.equal(Progress.unlockedComponents(p).length, 1);
});

test('savedCircuits add/list round-trip', () => {
  const storage = makeStubStorage();
  const p = Progress.init({ storage });
  assert.deepEqual(Progress.savedCircuits(p), []);
  Progress.addSavedCircuit(p, { id: 'c1', name: 'my NOT', graph: { nodes: {}, wires: {} } });
  Progress.addSavedCircuit(p, { id: 'c2', name: 'my AND', graph: { nodes: {}, wires: {} } });
  const list = Progress.savedCircuits(p);
  assert.equal(list.length, 2);
  assert.equal(list[0].id, 'c1');
  assert.equal(list[1].name, 'my AND');
});

test('updateSettings merges', () => {
  const storage = makeStubStorage();
  const p = Progress.init({ storage });
  Progress.updateSettings(p, { grid: true });
  Progress.updateSettings(p, { snap: 8 });
  const s = Progress.settings(p);
  assert.equal(s.grid, true);
  assert.equal(s.snap, 8);
});
