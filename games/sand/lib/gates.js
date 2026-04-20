(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  if (typeof window !== 'undefined') {
    window.NDP = window.NDP || {};
    window.NDP.Sand = window.NDP.Sand || {};
    window.NDP.Sand.Gates = mod.Gates;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const EVAL = {
    NOT:  (a)    => a ? 0 : 1,
    AND:  (a, b) => (a && b) ? 1 : 0,
    OR:   (a, b) => (a || b) ? 1 : 0,
    NAND: (a, b) => (a && b) ? 0 : 1,
    NOR:  (a, b) => (a || b) ? 0 : 1,
    XOR:  (a, b) => (a ^ b) & 1,
    XNOR: (a, b) => (a ^ b) ? 0 : 1
  };
  const Gates = {
    loadPrimitives(json) { Gates.primitives = json.primitives; return Gates.primitives; },
    get(type) { return Gates.primitives && Gates.primitives[type]; },
    evalCombo(type, a, b) {
      const fn = EVAL[type];
      if (!fn) throw new Error('unknown combo gate: ' + type);
      return fn(a | 0, b | 0);
    },
    isCombo(type) { return !!EVAL[type]; }
  };
  return { Gates };
});
