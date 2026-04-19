// games/sand/test/primitives.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Primitives, PrimitiveTypes } = require('../lib/primitives.js');

test('power outputs 1', () => {
  const p = Primitives.power;
  const r = p.eval({}, p.init({}), {});
  assert.equal(r.outputs.out, 1);
});

test('ground outputs 0', () => {
  const p = Primitives.ground;
  const r = p.eval({}, p.init({}), {});
  assert.equal(r.outputs.out, 0);
});

test('switch: gate=1 passes in', () => {
  const p = Primitives.switch;
  assert.equal(p.eval({ gate: 1, in: 1 }, null, {}).outputs.out, 1);
  assert.equal(p.eval({ gate: 1, in: 0 }, null, {}).outputs.out, 0);
});

test('switch: gate=0 floats (Z)', () => {
  const p = Primitives.switch;
  assert.equal(p.eval({ gate: 0, in: 1 }, null, {}).outputs.out, 'Z');
  assert.equal(p.eval({ gate: 0, in: 0 }, null, {}).outputs.out, 'Z');
  // disconnected gate/in (undefined) treated as Z; switch open -> Z
  assert.equal(p.eval({}, null, {}).outputs.out, 'Z');
});

test('switch: gate=Z passes Z', () => {
  const p = Primitives.switch;
  // When the gate is itself floating, the switch is considered open.
  assert.equal(p.eval({ gate: 'Z', in: 1 }, null, {}).outputs.out, 'Z');
  assert.equal(p.eval({ gate: 'Z', in: 0 }, null, {}).outputs.out, 'Z');
  // When gate=1 but in=Z, the Z propagates through.
  assert.equal(p.eval({ gate: 1, in: 'Z' }, null, {}).outputs.out, 'Z');
});

test('pullup: Z -> 1, 0/1 pass through', () => {
  const p = Primitives.pullup;
  assert.equal(p.eval({ a: 'Z' }, null, {}).outputs.out, 1);
  assert.equal(p.eval({ a: 0 }, null, {}).outputs.out, 0);
  assert.equal(p.eval({ a: 1 }, null, {}).outputs.out, 1);
  // disconnected a (undefined) treated as Z -> 1
  assert.equal(p.eval({}, null, {}).outputs.out, 1);
});

test('pad_in returns its prop value', () => {
  const p = Primitives.pad_in;
  assert.equal(p.eval({}, null, { label: 'A', value: 1 }).outputs.out, 1);
  assert.equal(p.eval({}, null, { label: 'A', value: 0 }).outputs.out, 0);
  // default value 0 when unset
  assert.equal(p.eval({}, null, { label: 'A' }).outputs.out, 0);
});

test('pad_out sink accepts input', () => {
  const p = Primitives.pad_out;
  const r = p.eval({ in: 1 }, null, { label: 'Y' });
  assert.deepEqual(r.outputs, {});
  assert.equal(r.nextState, null);
  // also callable with no input
  const r2 = p.eval({}, null, { label: 'Y' });
  assert.deepEqual(r2.outputs, {});
});

test('clock alternates with period 2', () => {
  const p = Primitives.clock;
  let state = p.init({ period: 2 });
  const seq = [];
  for (let i = 0; i < 4; i++) {
    const r = p.eval({}, state, { period: 2 });
    seq.push(r.outputs.out);
    state = r.nextState;
  }
  // formula: out = (tick % period) < (period/2) ? 0 : 1, then tick++
  // tick 0 -> 0, tick 1 -> 1, tick 2 -> 0, tick 3 -> 1
  assert.deepEqual(seq, [0, 1, 0, 1]);
});

test('clock alternates with period 4', () => {
  const p = Primitives.clock;
  let state = p.init({ period: 4 });
  const seq = [];
  for (let i = 0; i < 8; i++) {
    const r = p.eval({}, state, { period: 4 });
    seq.push(r.outputs.out);
    state = r.nextState;
  }
  // out=0 for 2 ticks, out=1 for 2 ticks, repeating
  assert.deepEqual(seq, [0, 0, 1, 1, 0, 0, 1, 1]);
});

test('every PrimitiveTypes entry has pins + eval', () => {
  assert.ok(Array.isArray(PrimitiveTypes));
  assert.ok(PrimitiveTypes.length >= 6);
  for (const t of PrimitiveTypes) {
    const p = Primitives[t];
    assert.ok(p, `missing primitive: ${t}`);
    assert.ok(p.pins && Array.isArray(p.pins.in) && Array.isArray(p.pins.out), `${t}.pins malformed`);
    assert.equal(typeof p.eval, 'function', `${t}.eval not a function`);
    assert.equal(typeof p.init, 'function', `${t}.init not a function`);
  }
  for (const t of ['power', 'ground', 'switch', 'pullup', 'pad_in', 'pad_out', 'clock']) {
    assert.ok(PrimitiveTypes.includes(t), `PrimitiveTypes missing ${t}`);
  }
});
