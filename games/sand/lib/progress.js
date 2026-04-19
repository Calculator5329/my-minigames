// games/sand/lib/progress.js
// Dual-entry module: Node (CommonJS) and browser (window.NDP.Sand.Progress).
//
// Task 22: progression + save data.
//
// All state is persisted through `storage.mergeGameData('sand', patch)` /
// `storage.getGameData('sand')`. The returned `progress` handle is an opaque
// object with a reference to storage plus a lazily-read cache.
//
// Schema version = 1:
//   {
//     version: 1,
//     levels: { [levelId]: { stars, gates, ticks, solved: true } },
//     unlockedComponents: [{ id, name, icon? }, ...],
//     savedCircuits: [ { id, name, graph, createdAt }, ... ],
//     settings: { ...arbitrary... }
//   }

(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Progress: mod.Progress };
    module.exports.Progress = mod.Progress;
  }
  if (typeof window !== 'undefined') {
    window.NDP = window.NDP || {};
    window.NDP.Sand = window.NDP.Sand || {};
    window.NDP.Sand.Progress = mod.Progress;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const GAME_ID = 'sand';
  const SCHEMA_VERSION = 1;

  function ensureShape(data) {
    const d = data || {};
    return {
      version: SCHEMA_VERSION,
      levels: d.levels && typeof d.levels === 'object' ? d.levels : {},
      unlockedComponents: Array.isArray(d.unlockedComponents) ? d.unlockedComponents : [],
      savedCircuits: Array.isArray(d.savedCircuits) ? d.savedCircuits : [],
      settings: d.settings && typeof d.settings === 'object' ? d.settings : {},
      _meta: d._meta && typeof d._meta === 'object' ? d._meta : {},
    };
  }

  function read(progress) {
    const raw = progress.storage.getGameData(GAME_ID);
    return ensureShape(raw);
  }

  function write(progress, data) {
    progress.storage.mergeGameData(GAME_ID, data);
  }

  function init(opts) {
    opts = opts || {};
    const storage = opts.storage;
    if (!storage) throw new Error('Progress.init: storage required');
    const existing = storage.getGameData(GAME_ID) || {};
    const shaped = ensureShape(existing);
    storage.mergeGameData(GAME_ID, shaped);
    return { storage };
  }

  function isSolved(progress, levelId) {
    const d = read(progress);
    const e = d.levels[levelId];
    return !!(e && e.solved);
  }

  function getStars(progress, levelId) {
    const d = read(progress);
    const e = d.levels[levelId];
    if (!e || !e.solved) return 0;
    return e.stars | 0;
  }

  function recordSolve(progress, levelId, result, meta) {
    const d = read(progress);
    const prev = d.levels[levelId] || null;
    const newStars = (result && result.stars) | 0;
    const newGates = (result && result.gates) | 0;
    const newTicks = (result && result.ticks) | 0;

    let entry;
    if (prev && prev.solved && (prev.stars | 0) >= newStars) {
      // Keep the best stars; but still allow gates/ticks to record the best (lowest)
      entry = {
        solved: true,
        stars: prev.stars | 0,
        gates: Math.min(prev.gates | 0, newGates),
        ticks: Math.min(prev.ticks | 0, newTicks),
      };
    } else {
      entry = {
        solved: true,
        stars: newStars,
        gates: newGates,
        ticks: newTicks,
      };
    }

    const levels = Object.assign({}, d.levels, { [levelId]: entry });
    const patch = { levels };

    if (meta && meta.unlocksComponent) {
      const comp = meta.unlocksComponent;
      const list = d.unlockedComponents.slice();
      if (!list.some((c) => c.id === comp.id)) list.push(comp);
      patch.unlockedComponents = list;
    }

    write(progress, patch);
  }

  function unlockedComponents(progress) {
    return read(progress).unlockedComponents.slice();
  }

  function addUnlockedComponent(progress, componentDef) {
    if (!componentDef || !componentDef.id) return;
    const d = read(progress);
    if (d.unlockedComponents.some((c) => c.id === componentDef.id)) return;
    const list = d.unlockedComponents.slice();
    list.push(componentDef);
    write(progress, { unlockedComponents: list });
  }

  function savedCircuits(progress) {
    return read(progress).savedCircuits.slice();
  }

  function addSavedCircuit(progress, circuit) {
    if (!circuit) return;
    const d = read(progress);
    const list = d.savedCircuits.slice();
    list.push(circuit);
    write(progress, { savedCircuits: list });
  }

  function getMeta(progress, key) {
    const d = read(progress);
    if (key == null) return Object.assign({}, d._meta);
    return d._meta[key];
  }

  function setMeta(progress, key, value) {
    const d = read(progress);
    const merged = Object.assign({}, d._meta, { [key]: value });
    write(progress, { _meta: merged });
    return merged;
  }

  function settings(progress) {
    return Object.assign({}, read(progress).settings);
  }

  function updateSettings(progress, patch) {
    const d = read(progress);
    const merged = Object.assign({}, d.settings, patch || {});
    write(progress, { settings: merged });
    return merged;
  }

  const Progress = {
    init,
    isSolved,
    getStars,
    recordSolve,
    unlockedComponents,
    addUnlockedComponent,
    savedCircuits,
    addSavedCircuit,
    settings,
    updateSettings,
    getMeta,
    setMeta,
  };
  return { Progress };
});
