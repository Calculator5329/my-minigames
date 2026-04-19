// games/sand/lib/primitives.js
// Dual-entry module: Node (CommonJS) and browser (window.NDP.Sand.Primitives).
// Registry of the seven base primitives for the sand minigame.
//
// Each primitive is shaped as:
//   {
//     pins: { in: [pinName, ...], out: [pinName, ...] },
//     defaultProps: {},
//     init(props) -> state | null,
//     eval(inputs, state, props) -> { outputs: {pin: 0|1|'Z'}, nextState }
//   }
//
// Signals are 3-valued: 0, 1, or the string 'Z' (high-impedance / floating).
// The sim may also produce 'X' (conflict) when resolving drivers; gates should
// treat 'X' like 'Z' for safety.

(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      Primitives: mod.Primitives,
      PrimitiveTypes: mod.PrimitiveTypes,
    };
  }
  if (typeof window !== 'undefined') {
    window.NDP = window.NDP || {};
    window.NDP.Sand = window.NDP.Sand || {};
    window.NDP.Sand.Primitives = mod.Primitives;
    window.NDP.Sand.PrimitiveTypes = mod.PrimitiveTypes;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  function bit(v) {
    return v === 1 ? 1 : 0;
  }

  // Normalize a 3-valued input. Anything that isn't 0 or 1 is treated as 'Z'.
  // 'X' (conflict) is coerced to 'Z' so downstream gates fail safe.
  function tri(v) {
    if (v === 0 || v === 1) return v;
    return 'Z';
  }

  const Primitives = {};

  Primitives.power = {
    pins: { in: [], out: ['out'] },
    defaultProps: {},
    init() { return null; },
    eval(_inputs, state /* null */, _props) {
      return { outputs: { out: 1 }, nextState: state };
    },
  };

  Primitives.ground = {
    pins: { in: [], out: ['out'] },
    defaultProps: {},
    init() { return null; },
    eval(_inputs, state, _props) {
      return { outputs: { out: 0 }, nextState: state };
    },
  };

  Primitives.switch = {
    pins: { in: ['gate', 'in'], out: ['out'] },
    defaultProps: {},
    init() { return null; },
    eval(inputs, state, _props) {
      const gate = tri(inputs && inputs.gate);
      const inSig = tri(inputs && inputs.in);
      // gate=1: pass input through (may be 0, 1, or Z).
      // gate=0 or gate=Z: switch is open; output floats (Z).
      const out = gate === 1 ? inSig : 'Z';
      return { outputs: { out }, nextState: state };
    },
  };

  Primitives.pullup = {
    pins: { in: ['a'], out: ['out'] },
    defaultProps: {},
    init() { return null; },
    eval(inputs, state, _props) {
      const a = tri(inputs && inputs.a);
      // Floating input pulled up to 1; otherwise pass through.
      const out = a === 'Z' ? 1 : a;
      return { outputs: { out }, nextState: state };
    },
  };

  Primitives.pad_in = {
    pins: { in: [], out: ['out'] },
    defaultProps: { label: '', value: 0 },
    init() { return null; },
    eval(_inputs, state, props) {
      const value = bit(props && props.value);
      return { outputs: { out: value }, nextState: state };
    },
  };

  Primitives.pad_out = {
    pins: { in: ['in'], out: [] },
    defaultProps: { label: '' },
    init() { return null; },
    eval(_inputs, _state, _props) {
      // Sink: the sim observes the driving wire separately.
      return { outputs: {}, nextState: null };
    },
  };

  // Clock formula (documented): after each eval we return
  //   out = (tick % period) < (period / 2) ? 0 : 1
  // then increment tick. With period=2 this yields 0,1,0,1,...
  // With period=4 this yields 0,0,1,1,0,0,1,1,...
  Primitives.clock = {
    pins: { in: [], out: ['out'] },
    defaultProps: { period: 2 },
    init(_props) { return { tick: 0 }; },
    eval(_inputs, state, props) {
      const period = (props && typeof props.period === 'number' && props.period > 0)
        ? props.period
        : 2;
      const tick = (state && typeof state.tick === 'number') ? state.tick : 0;
      const half = period / 2;
      const out = (tick % period) < half ? 0 : 1;
      return {
        outputs: { out },
        nextState: { tick: tick + 1 },
      };
    },
  };

  const PrimitiveTypes = ['power', 'ground', 'switch', 'pullup', 'pad_in', 'pad_out', 'clock'];

  return { Primitives, PrimitiveTypes };
});
