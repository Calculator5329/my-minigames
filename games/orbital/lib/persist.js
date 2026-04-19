/* Orbital — persistent meta state (stardust, best round, settings).
   Phase 1 only banks values; Phase 4 will spend stardust on Star Charts. */
(function () {
  const NDP = window.NDP;
  const O = NDP.Orbital;
  const Storage = NDP.Engine && NDP.Engine.Storage;

  const DEFAULT = {
    stardust: 0,
    totalRunsCleared: 0,
    bestRound: 0,
    settings: { soundOn: true, fastForwardDefault: 1 }
  };

  function load() {
    if (!Storage) return Object.assign({}, DEFAULT);
    return Object.assign({}, DEFAULT, Storage.getGameData('orbital') || {});
  }

  function save(data) {
    if (!Storage) return;
    Storage.setGameData('orbital', data);
  }

  function addStardust(n) {
    const d = load();
    d.stardust = Math.max(0, (d.stardust || 0) + Math.floor(n));
    save(d);
    return d.stardust;
  }

  function recordRunEnd(roundReached) {
    const d = load();
    if (roundReached > (d.bestRound || 0)) d.bestRound = roundReached;
    if (roundReached >= 30) d.totalRunsCleared = (d.totalRunsCleared || 0) + 1;
    save(d);
  }

  O.Persist = { load, save, addStardust, recordRunEnd };
})();
