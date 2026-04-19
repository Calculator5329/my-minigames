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
    bestFreeplayLevel: 0,
    leaderboard: [],   // [{ score, round, mode, durationSec, kills, ts }]
    lifetimeStats: {   // aggregated across every run, ever
      runs: 0, kills: 0, bossKills: 0, leaks: 0, totalSpent: 0,
      bestScore: 0, bestRound: 0
    },
    settings: { soundOn: true, fastForwardDefault: 1 }
  };

  const LEADERBOARD_MAX = 10;

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

  // One-shot tutorial flags (only show certain hints once per save).
  function hasSeenHint(id) {
    const d = load();
    return !!(d.hintsSeen && d.hintsSeen[id]);
  }
  function markHintSeen(id) {
    const d = load();
    d.hintsSeen = Object.assign({}, d.hintsSeen || {});
    d.hintsSeen[id] = true;
    save(d);
  }

  // ---- Leaderboard ----
  // Inserts the entry, keeps the top LEADERBOARD_MAX by score, returns the
  // 1-based rank of the new entry (or null if it didn't make the cut).
  function recordLeaderboardEntry(entry) {
    const d = load();
    const e = Object.assign({ ts: Date.now() }, entry);
    const list = (d.leaderboard || []).slice();
    list.push(e);
    list.sort((a, b) => (b.score | 0) - (a.score | 0));
    const trimmed = list.slice(0, LEADERBOARD_MAX);
    d.leaderboard = trimmed;
    save(d);
    const rank = trimmed.indexOf(e);
    return rank >= 0 ? rank + 1 : null;
  }
  function getLeaderboard() {
    return (load().leaderboard || []).slice();
  }

  // ---- Lifetime stats (aggregated across all runs) ----
  function recordLifetimeStats(patch) {
    const d = load();
    const cur = Object.assign({}, DEFAULT.lifetimeStats, d.lifetimeStats || {});
    for (const k of Object.keys(patch || {})) {
      if (k === 'bestScore' || k === 'bestRound' || k === 'bestFreeplayLevel') {
        cur[k] = Math.max(cur[k] | 0, patch[k] | 0);
      } else {
        cur[k] = (cur[k] | 0) + (patch[k] | 0);
      }
    }
    d.lifetimeStats = cur;
    save(d);
    return cur;
  }
  function getLifetimeStats() {
    const d = load();
    return Object.assign({}, DEFAULT.lifetimeStats, d.lifetimeStats || {});
  }

  // ---- Freeplay best ----
  function recordFreeplayLevel(level) {
    const d = load();
    if ((level | 0) > (d.bestFreeplayLevel | 0)) {
      d.bestFreeplayLevel = level | 0;
      save(d);
    }
  }
  function getBestFreeplayLevel() {
    return (load().bestFreeplayLevel | 0) || 0;
  }

  O.Persist = {
    load, save, addStardust, getStardust, recordRunEnd, recordRoundClear,
    getBestRound, hasSeenHint, markHintSeen,
    recordLeaderboardEntry, getLeaderboard,
    recordLifetimeStats, getLifetimeStats,
    recordFreeplayLevel, getBestFreeplayLevel
  };
})();
