import { test } from 'node:test';
import assert from 'node:assert/strict';
import mod from '../lib/levels.js';
const { Levels } = mod;

function goodLevel() {
  return {
    id: 'intro-wire', track: 'intro', order: 1,
    title: 'Wire', brief: 'connect', difficulty: 1,
    availableGates: [],
    io: { inputs: [{ label: 'A' }], outputs: [{ label: 'Y' }] },
    truthTable: [ { in: [0], out: [0] }, { in: [1], out: [1] } ],
    parGates: 0
  };
}

test('validateLevel accepts a well-formed level', () => {
  const r = Levels.validateLevel(goodLevel());
  assert.equal(r.ok, true, JSON.stringify(r.errors));
});

test('validateLevel rejects missing id', () => {
  const L = goodLevel(); delete L.id;
  const r = Levels.validateLevel(L);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => /id/.test(e)));
});

test('validateLevel rejects missing io.inputs', () => {
  const L = goodLevel(); delete L.io.inputs;
  const r = Levels.validateLevel(L);
  assert.equal(r.ok, false);
});

test('validateLevel rejects mismatched truthTable row length', () => {
  const L = goodLevel(); L.truthTable[0].in = [0, 0];
  const r = Levels.validateLevel(L);
  assert.equal(r.ok, false);
});

test('validateLevel rejects negative parGates', () => {
  const L = goodLevel(); L.parGates = -1;
  const r = Levels.validateLevel(L);
  assert.equal(r.ok, false);
});

test('validateLevel accepts level with unlocksComponent', () => {
  const L = goodLevel();
  L.unlocksComponent = { id: 'buffer', name: 'Buffer' };
  const r = Levels.validateLevel(L);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
});
