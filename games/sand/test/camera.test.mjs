import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Camera = require('../lib/camera.js');

const VP = { w: 800, h: 600 };

function approx(a, b, eps = 1e-9) {
  assert.ok(Math.abs(a - b) < eps, `expected ${a} ≈ ${b}`);
}

test('worldToScreen and screenToWorld are inverses', () => {
  const cam = Camera.create({ x: 50, y: -20, zoom: 1.5 });
  const pts = [
    { x: 0, y: 0 },
    { x: 100, y: 200 },
    { x: -300, y: 75 },
    { x: 12.5, y: -42.25 },
  ];
  for (const p of pts) {
    const s = Camera.worldToScreen(cam, p, VP);
    const w = Camera.screenToWorld(cam, s, VP);
    approx(w.x, p.x, 1e-6);
    approx(w.y, p.y, 1e-6);
  }
  // And the other direction.
  const sPts = [{ x: 400, y: 300 }, { x: 0, y: 0 }, { x: 123, y: 456 }];
  for (const s of sPts) {
    const w = Camera.screenToWorld(cam, s, VP);
    const s2 = Camera.worldToScreen(cam, w, VP);
    approx(s2.x, s.x, 1e-6);
    approx(s2.y, s.y, 1e-6);
  }
});

test('pan shifts the camera position', () => {
  const cam = Camera.create({ x: 10, y: 20, zoom: 1 });
  Camera.pan(cam, 5, -3);
  assert.equal(cam.x, 15);
  assert.equal(cam.y, 17);
});

test('zoomBy at center scales around center', () => {
  const cam = Camera.create({ x: 100, y: 200, zoom: 1 });
  const center = { x: VP.w / 2, y: VP.h / 2 };
  Camera.zoomBy(cam, 2, center, VP);
  assert.equal(cam.zoom, 2);
  // Center of viewport stays at camera (x, y).
  approx(cam.x, 100);
  approx(cam.y, 200);
});

test('zoomBy at offset preserves that point', () => {
  const cam = Camera.create({ x: 0, y: 0, zoom: 1 });
  const origin = { x: 700, y: 100 };
  const worldBefore = Camera.screenToWorld(cam, origin, VP);
  Camera.zoomBy(cam, 1.7, origin, VP);
  const screenAfter = Camera.worldToScreen(cam, worldBefore, VP);
  approx(screenAfter.x, origin.x, 1e-6);
  approx(screenAfter.y, origin.y, 1e-6);
  approx(cam.zoom, 1.7);
});

test('zoom clamps to [0.25, 3]', () => {
  const cam = Camera.create({ x: 0, y: 0, zoom: 1 });
  const origin = { x: 400, y: 300 };
  Camera.zoomBy(cam, 100, origin, VP);
  assert.equal(cam.zoom, 3);
  Camera.zoomBy(cam, 0.0001, origin, VP);
  assert.equal(cam.zoom, 0.25);
  // Further shrink stays clamped.
  Camera.zoomBy(cam, 0.1, origin, VP);
  assert.equal(cam.zoom, 0.25);
});

test('clone produces an independent copy', () => {
  const cam = Camera.create({ x: 1, y: 2, zoom: 1.25 });
  const c2 = Camera.clone(cam);
  assert.deepEqual(c2, cam);
  assert.notEqual(c2, cam);
  Camera.pan(c2, 100, 100);
  assert.equal(cam.x, 1);
  assert.equal(cam.y, 2);
});

test('create applies defaults', () => {
  const cam = Camera.create();
  assert.equal(cam.x, 0);
  assert.equal(cam.y, 0);
  assert.equal(cam.zoom, 1);
});
