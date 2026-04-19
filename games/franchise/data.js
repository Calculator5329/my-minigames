/* Franchise Frenzy — campaign data (tiers, cities, events, meta upgrades).
   Published as window.NDP.Franchise so game.js can read without
   re-importing.  Pure data + tiny pure functions only — no canvas, no
   DOM, no engine references. */
(function () {
  const NDP = (window.NDP = window.NDP || {});
  const F = (NDP.Franchise = NDP.Franchise || {});

  /* ---- Business tiers (10) -------------------------------------------- */
  /* baseRate is $/s/owned at zero synergy.
     unlockCity = the city the tier first appears in (1-indexed).
     City 1 reveals tiers 1–7 progressively as cash crosses 50% of cost
     (existing behavior). City 3 unlocks Casino, City 4 unlocks Movie
     Studio, City 5 unlocks Spaceport. */
  F.TIERS = [
    { id: 'lemonade',  name: 'Lemonade Stand', cost: 10,         baseRate: 1,       color: '#ffd86b', unlockCity: 1 },
    { id: 'coffee',    name: 'Coffee Shop',    cost: 60,         baseRate: 4,       color: '#c97b3f', unlockCity: 1 },
    { id: 'carwash',   name: 'Car Wash',       cost: 300,        baseRate: 18,      color: '#60a5fa', unlockCity: 1 },
    { id: 'gym',       name: 'Fitness Club',   cost: 1200,       baseRate: 60,      color: '#f472b6', unlockCity: 1 },
    { id: 'oil',       name: 'Oil Rig',        cost: 6000,       baseRate: 260,     color: '#94a3b8', unlockCity: 1 },
    { id: 'tech',      name: 'Tech Startup',   cost: 25000,      baseRate: 900,     color: '#a855f7', unlockCity: 1 },
    { id: 'bank',      name: 'Megabank',       cost: 120000,     baseRate: 4000,    color: '#22c55e', unlockCity: 1 },
    { id: 'casino',    name: 'Casino Resort',  cost: 600000,     baseRate: 18000,   color: '#ef4444', unlockCity: 3 },
    { id: 'movies',    name: 'Movie Studio',   cost: 3000000,    baseRate: 80000,   color: '#fb7185', unlockCity: 4 },
    { id: 'spaceport', name: 'Spaceport',      cost: 18000000,   baseRate: 360000,  color: '#38bdf8', unlockCity: 5 }
  ];

  /* ---- Cities --------------------------------------------------------- */
  F.CITIES = [
    { id: 'smalltown', name: 'Smalltown',  target: 5_000,        eventCount: 0, eventEvery: 0,  bg: ['#1a2840', '#0c1d14'], accent: '#ffd86b' },
    { id: 'midtown',   name: 'Midtown',    target: 50_000,       eventCount: 1, eventEvery: 14, bg: ['#1d2a48', '#0c1224'], accent: '#60a5fa' },
    { id: 'boomburg',  name: 'Boomburg',   target: 400_000,      eventCount: 2, eventEvery: 12, bg: ['#3a1f4a', '#10071a'], accent: '#a855f7' },
    { id: 'megapolis', name: 'Megapolis',  target: 4_000_000,    eventCount: 3, eventEvery: 10, bg: ['#3a1010', '#100404'], accent: '#ef4444' },
    { id: 'skyport',   name: 'Skyport',    target: 40_000_000,   eventCount: 3, eventEvery: 10, bg: ['#103040', '#020a14'], accent: '#38bdf8', boss: true }
  ];

  F.cityByIndex = (i) => F.CITIES[Math.max(0, Math.min(F.CITIES.length - 1, i))];

  /* ---- Events --------------------------------------------------------- */
  /* Each event has: id, label, color, weight (selection bias), and an
     `apply(state)` function. The `apply` returns an active-event record
     (or null for instant-fire events) so the main loop can render
     banners + countdowns without knowing event internals. */
  F.EVENTS = [
    {
      id: 'rush',
      label: 'RUSH HOUR',
      color: '#ffd86b',
      weight: 3,
      apply(state) {
        return { id: 'rush', label: 'RUSH HOUR — ×2 income', color: '#ffd86b', t: 8, dur: 8, mods: { rateMul: 2 } };
      }
    },
    {
      id: 'viral',
      label: 'VIRAL MOMENT',
      color: '#f472b6',
      weight: 2,
      apply(state) {
        // Banks 5 super-clicks. Resolved by main loop on each flagship click.
        state.viralClicks = (state.viralClicks || 0) + 5;
        return { id: 'viral', label: 'VIRAL MOMENT — next 5 clicks ×10', color: '#f472b6', t: 12, dur: 12, badge: () => 'x' + (state.viralClicks || 0) };
      }
    },
    {
      id: 'tax',
      label: 'TAX AUDIT',
      color: '#ef4444',
      weight: 2,
      apply(state) {
        const taken = state.cash * 0.15;
        state.cash = Math.max(0, state.cash - taken);
        state._taxTaken = taken;  // for floater
        return { id: 'tax', label: 'TAX AUDIT — −15% cash', color: '#ef4444', t: 3, dur: 3, mods: {} };
      }
    },
    {
      id: 'investor',
      label: 'INVESTOR KNOCK',
      color: '#22c55e',
      weight: 2,
      apply(state) {
        // Spawn a clickable envelope worth 20× current rate. Returns
        // an "envelope" record — the game owns clicking, expiry, payout.
        const value = Math.max(50, state.computeRate() * 20);
        state.envelope = {
          x: 200 + Math.random() * (state.W * 0.7 - 200),
          y: 110 + Math.random() * 200,
          r: 28, value, life: 5
        };
        return { id: 'investor', label: 'INVESTOR — click envelope!', color: '#22c55e', t: 5, dur: 5, mods: {} };
      }
    },
    {
      id: 'outage',
      label: 'POWER OUTAGE',
      color: '#94a3b8',
      weight: 2,
      apply(state) {
        return { id: 'outage', label: 'POWER OUTAGE — ×0.5 income', color: '#94a3b8', t: 6, dur: 6, mods: { rateMul: 0.5 } };
      }
    }
  ];

  F.pickEvent = function (rng) {
    const total = F.EVENTS.reduce((s, e) => s + e.weight, 0);
    let r = (rng || Math.random)() * total;
    for (const e of F.EVENTS) { r -= e.weight; if (r <= 0) return e; }
    return F.EVENTS[0];
  };

  /* ---- Meta upgrades (persistent shop) -------------------------------- */
  /* Each upgrade has 4 levels with rising Stardollar cost. */
  F.META = [
    { id: 'seed',  label: 'Seed Capital',  desc: 'Start each campaign with extra cash.',                      tiers: [50, 200, 1000, 10000],   costs: [5, 25, 100, 400],  color: '#ffd86b' },
    { id: 'click', label: 'Click Force',   desc: 'Flagship click power ×2 per level.',                        tiers: [2, 4, 8, 16],            costs: [10, 40, 150, 600], color: '#fb923c' },
    { id: 'rate',  label: 'Industry Boost',desc: 'Permanent multiplier to all auto-business income.',         tiers: [1.10, 1.25, 1.50, 2.00], costs: [15, 60, 250, 1000],color: '#22c55e' },
    { id: 'time',  label: 'Tycoon Time',   desc: 'Add seconds to every city shift.',                          tiers: [5, 10, 15, 20],          costs: [20, 80, 300, 1200],color: '#60a5fa' },
    { id: 'mgrs',  label: 'Headhunter',    desc: 'Begin each campaign with free managers.',                   tiers: [1, 2, 3, 4],             costs: [30, 120, 500, 2000],color: '#a855f7' }
  ];

  F.metaEffect = function (saved, id) {
    const u = F.META.find(m => m.id === id);
    if (!u) return null;
    const lvl = Math.max(0, Math.min(u.tiers.length, (saved && saved.meta && saved.meta[id]) || 0));
    return lvl === 0 ? (id === 'rate' ? 1 : 0) : u.tiers[lvl - 1];
  };

  /* ---- Synergy --------------------------------------------------------- */
  /* Returns the multiplier to apply to a tier's per-unit rate based on count. */
  F.synergyFor = function (count) {
    if (count >= 50) return 4;
    if (count >= 25) return 2;
    if (count >= 10) return 1.25;
    return 1;
  };
  F.nextSynergyAt = function (count) {
    if (count < 10) return 10;
    if (count < 25) return 25;
    if (count < 50) return 50;
    return null;
  };

  /* ---- Managers -------------------------------------------------------- */
  /* Managers are a per-run pool. Hire one to a tier; they auto-buy that
     tier whenever cash >= cost. Each subsequent paid manager doubles. */
  F.MANAGER_BASE_COST = 500;
  F.MANAGER_BUY_INTERVAL = 0.6;  // seconds between auto-purchases
  F.MAX_MANAGERS = 5;
  F.managerCost = function (paidCount) {
    return F.MANAGER_BASE_COST * Math.pow(2, paidCount);
  };

  /* ---- Stardollar reward ---------------------------------------------- */
  F.stardollarsFor = function (peakNetWorth) {
    return Math.floor(peakNetWorth / 25_000);
  };

  /* ---- Default save shape -------------------------------------------- */
  F.defaultSave = function () {
    return {
      bestNetWorth: 0,
      citiesCleared: 0,
      stardollars: 0,
      campaignsWon: 0,
      totalEarned: 0,
      meta: { seed: 0, click: 0, rate: 0, time: 0, mgrs: 0 }
    };
  };

  /* ---- Tiny shared formatters (kept here so manifest preview can also use them later) */
  F.fmt = function (n, decimals) {
    if (!isFinite(n)) return '0';
    if (n < 1000) return decimals ? n.toFixed(decimals) : Math.floor(n).toString();
    const units = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi'];
    let i = 0;
    while (n >= 1000 && i < units.length - 1) { n /= 1000; i++; }
    return n.toFixed(n < 10 ? 2 : n < 100 ? 1 : 0) + units[i];
  };
})();
