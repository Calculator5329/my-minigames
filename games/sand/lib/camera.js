// games/sand/lib/camera.js
// Dual-entry module: works in Node (CommonJS) and in the browser (window.NDP.Sand.Camera).
// 2D camera with pan + zoom. The camera's (x, y) is the world position at the
// center of the viewport. zoom is multiplicative:
//   screen = (world - cam) * zoom + viewport/2

(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = mod.Camera;
    module.exports.Camera = mod.Camera;
  }
  if (typeof window !== 'undefined') {
    window.NDP = window.NDP || {};
    window.NDP.Sand = window.NDP.Sand || {};
    window.NDP.Sand.Camera = mod.Camera;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const ZOOM_MIN = 0.25;
  const ZOOM_MAX = 3;

  function clampZoom(z) {
    if (!(z > 0) || !isFinite(z)) return ZOOM_MIN;
    if (z < ZOOM_MIN) return ZOOM_MIN;
    if (z > ZOOM_MAX) return ZOOM_MAX;
    return z;
  }

  function create(opts) {
    const o = opts || {};
    return {
      x: typeof o.x === 'number' ? o.x : 0,
      y: typeof o.y === 'number' ? o.y : 0,
      zoom: clampZoom(typeof o.zoom === 'number' ? o.zoom : 1),
    };
  }

  function pan(cam, dx, dy) {
    cam.x += dx;
    cam.y += dy;
  }

  function worldToScreen(cam, p, viewport) {
    return {
      x: (p.x - cam.x) * cam.zoom + viewport.w / 2,
      y: (p.y - cam.y) * cam.zoom + viewport.h / 2,
    };
  }

  function screenToWorld(cam, p, viewport) {
    return {
      x: (p.x - viewport.w / 2) / cam.zoom + cam.x,
      y: (p.y - viewport.h / 2) / cam.zoom + cam.y,
    };
  }

  function zoomBy(cam, factor, originScreen, viewport) {
    // Solve for cam1 such that the world point under originScreen is invariant.
    //   screen = (world - cam) * z + vp/2
    //   world  = (screen - vp/2) / z + cam
    // Let k = originScreen - vp/2. Keeping world fixed across z0 -> z1:
    //   cam1 = cam0 + k * (1/z0 - 1/z1)
    // If viewport is omitted, treat originScreen as already centered (k = origin).
    const z0 = cam.zoom;
    const z1 = clampZoom(z0 * factor);
    let kx, ky;
    if (viewport && typeof viewport.w === 'number') {
      kx = originScreen.x - viewport.w / 2;
      ky = originScreen.y - viewport.h / 2;
    } else {
      kx = originScreen.x;
      ky = originScreen.y;
    }
    // world point under origin (invariant)
    const wx = cam.x + kx / z0;
    const wy = cam.y + ky / z0;
    cam.zoom = z1;
    cam.x = wx - kx / z1;
    cam.y = wy - ky / z1;
  }

  function clone(cam) {
    return { x: cam.x, y: cam.y, zoom: cam.zoom };
  }

  const Camera = {
    create,
    pan,
    zoomBy,
    screenToWorld,
    worldToScreen,
    clone,
  };

  return { Camera };
});
