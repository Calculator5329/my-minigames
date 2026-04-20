import { test } from 'node:test';
import assert from 'node:assert/strict';
import mod from '../lib/gates.js';
const { Gates } = mod;

test('gates eval NOT', () => {
  assert.equal(Gates.evalCombo('NOT', 0), 1);
  assert.equal(Gates.evalCombo('NOT', 1), 0);
});

test('gates eval AND/OR/NAND/NOR/XOR/XNOR truth rows', () => {
  for (const [a,b] of [[0,0],[0,1],[1,0],[1,1]]) {
    assert.equal(Gates.evalCombo('AND',  a,b), ((a & b) ? 1 : 0));
    assert.equal(Gates.evalCombo('OR',   a,b), ((a | b) ? 1 : 0));
    assert.equal(Gates.evalCombo('NAND', a,b), ((a & b) ? 0 : 1));
    assert.equal(Gates.evalCombo('NOR',  a,b), ((a | b) ? 0 : 1));
    assert.equal(Gates.evalCombo('XOR',  a,b), ((a ^ b) & 1));
    assert.equal(Gates.evalCombo('XNOR', a,b), ((a ^ b) ? 0 : 1));
  }
});

test('isCombo excludes IO/const types', () => {
  assert.equal(Gates.isCombo('INPUT'), false);
  assert.equal(Gates.isCombo('CONST0'), false);
  assert.equal(Gates.isCombo('NOT'), true);
});
