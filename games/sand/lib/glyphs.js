// games/sand/lib/glyphs.js
// Dual-entry: Node CommonJS + window.NDP.Sand.Glyphs.
// ANSI gate shapes live in render.js now. This module is retained as a
// compatibility shim so older callers get a harmless no-op.

(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = mod.Glyphs;
    module.exports.Glyphs = mod.Glyphs;
  }
  if (typeof window !== 'undefined') {
    window.NDP = window.NDP || {};
    window.NDP.Sand = window.NDP.Sand || {};
    window.NDP.Sand.Glyphs = mod.Glyphs;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const Glyphs = {
    draw() { return false; }
  };
  return { Glyphs };
});
