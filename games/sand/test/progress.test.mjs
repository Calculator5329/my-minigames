import { test } from 'node:test';
import assert from 'node:assert/strict';
import mod from '../lib/progress.js';
const { Progress } = mod;

function mkStore(initial) {
  let data = initial === undefined ? null : initial;
  return {
    getGameData: () => data,
    setGameData: (_id, d) => { data = d; },
    peek: () => data
  };
}

test('progress: wipes when version missing or old', () => {
  const s = mkStore({ version: 1, stars: { foo: 3 } });
  Progress.bindStorage(s);
  const d = Progress.loadSave();
  assert.equal(d.version, 2);
  assert.deepEqual(d.stars, {});
  assert.equal(d.announceReset, true);
});

test('progress: recordSolve takes max', () => {
  const s = mkStore();
  Progress.bindStorage(s);
  Progress.loadSave();
  Progress.recordSolve('a', 2);
  Progress.recordSolve('a', 1);
  assert.equal(Progress.starsFor('a'), 2);
  Progress.recordSolve('a', 3);
  assert.equal(Progress.starsFor('a'), 3);
});

test('progress: unlock + isUnlocked round-trip', () => {
  const s = mkStore();
  Progress.bindStorage(s);
  Progress.loadSave();
  assert.equal(Progress.isUnlocked('half_adder'), false);
  Progress.unlock('half_adder');
  assert.equal(Progress.isUnlocked('half_adder'), true);
});

test('progress: consumeReset fires exactly once', () => {
  const s = mkStore({ version: 1 });
  Progress.bindStorage(s);
  Progress.loadSave();
  assert.equal(Progress.consumeReset(), true);
  assert.equal(Progress.consumeReset(), false);
});

test('progress: totalStars sums correctly', () => {
  const s = mkStore();
  Progress.bindStorage(s);
  Progress.loadSave();
  Progress.recordSolve('a', 3);
  Progress.recordSolve('b', 2);
  Progress.recordSolve('c', 1);
  assert.equal(Progress.totalStars(), 6);
});
