/* Orbital — persistent meta state (stardust, best round, settings).
   Phase 1 only banks values; Phase 4 will spend stardust on Star Charts.
   Stardust is stored via the per-game wallet (Storage.*GameWallet('orbital')). */
(function () {
  const NDP = window.NDP;
  const O = NDP.Orbital;
  const Storage = NDP.Engine && NDP.Engine.Storage;

  const DEFAULT = {
    totalRunsCleared: 0,
    bestRound: 0,
    settings: { soundOn: true, fastForwardDefault: 1 }
  };

  // One-shot lift: any legacy `stardust` field stored in the orbital data blob
  // gets transferred into the per-game wallet on first read.
  let _migrated = false;
  function migrateLegacy() {
    if (_migrated || !Storage) return;
    _migrated = true;
    const raw = Storage.getGameData('orbital') || {};
    if ((raw.stardust | 0) > 0) {
      Storage.addGameWallet('orbital', raw.stardust | 0);
      const cleaned = Object.assign({}, raw);
      delete cleaned.stardust;
      Storage.setGameData('orbital', cleaned);
    }
  }

  function load() {
    if (!Storage) return Object.assign({ stardust: 0 }, DEFAULT);
    migrateLegacy();
    const raw = Storage.getGameData('orbital') || {};
    const merged = Object.assign({}, DEFAULT, raw);
    merged.stardust = Storage.getGameWallet('orbital') | 0;
    return merged;
  }

  function save(data) {
    if (!Storage) return;
    const copy = Object.assign({}, data);
    delete copy.stardust;
    Storage.setGameData('orbital', copy);
  }

  function addStardust(n) {
    if (!Storage) return 0;
    migrateLegacy();
    const amt = Math.max(0, Math.floor(n));
    if (amt > 0) Storage.addGameWallet('orbital', amt);
    return Storage.getGameWallet('orbital') | 0;
  }

  function getStardust() {
    if (!Storage) return 0;
    migrateLegacy();
    return Storage.getGameWallet('orbital') | 0;
  }

  function recordRunEnd(roundReached) {
    const d = load();
    if (roundReached > (d.bestRound || 0)) d.bestRound = roundReached;
    if (roundReached >= 30) d.totalRunsCleared = (d.totalRunsCleared || 0) + 1;
    save(d);
  }

  // Bumps the persistent best-round high-water mark. Called every time a
  // round is cleared so tower unlocks stick across runs immediately.
  function recordRoundClear(round) {
    const d = load();
    if ((round | 0) > (d.bestRound | 0)) {
      d.bestRound = round | 0;
      save(d);
      return true;
    }
    return false;
  }

  function getBestRound() {
    if (!Storage) return 0;
    return (load().bestRound | 0) || 0;
  }

  O.Persist = { load, save, addStardust, getStardust, recordRunEnd, recordRoundClear, getBestRound };
})();
