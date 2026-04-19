/* Persistence layer: scores, coins, unlocks. */
(function () {
  const NDP = (window.NDP = window.NDP || {});
  NDP.Engine = NDP.Engine || {};

  const KEY = 'notdop_v1';
  let data = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return {
      coins: 0,
      muted: false,
      activeTheme: 'default',
      unlockedThemes: ['default'],
      games: {} // keyed by game id → { hi, plays, lastPlayed }
    };
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
  }

  const Storage = {
    getCoins() { return data.coins | 0; },
    addCoins(n) { data.coins = Math.max(0, (data.coins | 0) + (n | 0)); save(); return data.coins; },
    spendCoins(n) {
      if (data.coins < n) return false;
      data.coins -= n; save(); return true;
    },

    isMuted() { return !!data.muted; },
    setMuted(m) { data.muted = !!m; save(); },

    getActiveTheme() { return data.activeTheme || 'default'; },
    setActiveTheme(id) { data.activeTheme = id; save(); },
    getUnlockedThemes() { return data.unlockedThemes.slice(); },
    isThemeUnlocked(id) { return data.unlockedThemes.includes(id); },
    unlockTheme(id) {
      if (!data.unlockedThemes.includes(id)) data.unlockedThemes.push(id);
      save();
    },

    getGameStats(id) {
      return data.games[id] || { hi: 0, plays: 0, lastPlayed: 0 };
    },
    recordRun(id, score) {
      const s = data.games[id] || { hi: 0, plays: 0, lastPlayed: 0 };
      s.hi = Math.max(s.hi, score | 0);
      s.plays = (s.plays | 0) + 1;
      s.lastPlayed = Date.now();
      data.games[id] = s;
      save();
    },

    getGameData(id) {
      const s = data.games[id] || { hi: 0, plays: 0, lastPlayed: 0 };
      return s.data ? JSON.parse(JSON.stringify(s.data)) : {};
    },
    setGameData(id, obj) {
      const s = data.games[id] || { hi: 0, plays: 0, lastPlayed: 0 };
      s.data = obj || {};
      data.games[id] = s;
      save();
    },
    mergeGameData(id, patch) {
      const s = data.games[id] || { hi: 0, plays: 0, lastPlayed: 0 };
      s.data = Object.assign({}, s.data || {}, patch || {});
      data.games[id] = s;
      save();
      return JSON.parse(JSON.stringify(s.data));
    },
    // Wipe a game's persistent payload (data + wallet). Hi/plays survive so
    // selector cards still show the high score after a "completion reset".
    clearGameData(id) {
      const s = data.games[id];
      if (!s) return;
      delete s.data;
      delete s.wallet;
      save();
    },

    // Per-game persistent currency. Each game has its own wallet; never
    // crosses with the global theme-shop coins. Game-id namespaced.
    getGameWallet(id) {
      const s = data.games[id];
      return (s && s.wallet | 0) || 0;
    },
    addGameWallet(id, n) {
      const s = data.games[id] || { hi: 0, plays: 0, lastPlayed: 0 };
      s.wallet = Math.max(0, (s.wallet | 0) + (n | 0));
      data.games[id] = s;
      save();
      return s.wallet;
    },
    spendGameWallet(id, n) {
      const s = data.games[id] || { hi: 0, plays: 0, lastPlayed: 0 };
      if ((s.wallet | 0) < (n | 0)) return false;
      s.wallet -= (n | 0);
      data.games[id] = s;
      save();
      return true;
    },
    setGameWallet(id, n) {
      const s = data.games[id] || { hi: 0, plays: 0, lastPlayed: 0 };
      s.wallet = Math.max(0, n | 0);
      data.games[id] = s;
      save();
    },

    dump() { return JSON.parse(JSON.stringify(data)); },
    reset() { data = { coins: 0, muted: false, activeTheme: 'default', unlockedThemes: ['default'], games: {} }; save(); }
  };

  NDP.Engine.Storage = Storage;
})();
