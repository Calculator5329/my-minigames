/* Orbital — namespace bootstrap.
   Every other orbital file attaches to NDP.Orbital. Loaded BEFORE all the
   data/, lib/, ui/, and game.js scripts so they can rely on the slot
   existing. */
(function () {
  const NDP = (window.NDP = window.NDP || {});
  NDP.Orbital = NDP.Orbital || {
    Towers: null,        // data/towers.js
    Enemies: null,       // data/enemies.js
    Rounds: null,        // data/rounds.js
    Abilities: null,     // data/abilities.js
    Upgrades: null,      // lib/upgrades.js
    XP: null,            // lib/xp.js
    Targeting: null,     // lib/targeting.js
    Economy: null,       // lib/economy.js
    EnemyMods: null,     // lib/enemy-mods.js
    Overlay: null,       // lib/overlay.js
    Persist: null,       // lib/persist.js
    UI: {                // ui/*
      SidePanel: null,
      Recap: null
    }
  };
})();
