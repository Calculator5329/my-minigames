(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  if (typeof window !== 'undefined') {
    window.NDP = window.NDP || {};
    window.NDP.Sand = window.NDP.Sand || {};
    window.NDP.Sand.Progress = mod.Progress;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const ID = 'sand';
  const VERSION = 2;
  let storage = null;
  let memory = null;

  function adapter() {
    if (storage) return storage;
    if (!memory) memory = { _data: null };
    return {
      getGameData: () => memory._data,
      setGameData: (id, d) => { memory._data = d; }
    };
  }

  function defaults() {
    return { version: VERSION, stars: {}, unlocked: {}, announceReset: false };
  }

  function bindStorage(s) { storage = s; }

  function loadSave() {
    const a = adapter();
    const raw = a.getGameData(ID);
    if (!raw || raw.version !== VERSION) {
      const fresh = defaults();
      fresh.announceReset = true;
      a.setGameData(ID, fresh);
      return fresh;
    }
    return raw;
  }

  function save(d) { adapter().setGameData(ID, d); }

  function recordSolve(levelId, stars) {
    const d = loadSave();
    const prev = d.stars[levelId] | 0;
    const next = Math.max(prev, stars | 0);
    d.stars[levelId] = next;
    save(d);
    return next;
  }

  function unlock(componentId) {
    const d = loadSave();
    d.unlocked[componentId] = true;
    save(d);
  }

  function isUnlocked(componentId) {
    const d = loadSave();
    return !!d.unlocked[componentId];
  }

  function consumeReset() {
    const d = loadSave();
    if (!d.announceReset) return false;
    d.announceReset = false;
    save(d);
    return true;
  }

  function starsFor(levelId) { return loadSave().stars[levelId] | 0; }

  function totalStars() {
    const d = loadSave();
    let t = 0;
    for (const k of Object.keys(d.stars)) t += d.stars[k] | 0;
    return t;
  }

  return {
    Progress: {
      bindStorage, loadSave, save, recordSolve, unlock, isUnlocked,
      consumeReset, starsFor, totalStars
    }
  };
});
