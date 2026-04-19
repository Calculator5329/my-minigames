/* Orbital — path-based tower defense homage to BTD4/5.
   Meteoric swarms march along a snaking trajectory toward the homeworld.
   Place towers, pop meteors, survive 15 rounds. Round 15 = boss. */
(function () {
  const NDP = window.NDP;
  const { BaseGame, Input, Assets } = NDP.Engine;
  const W = 960, H = 600;

  // --- Path geometry ---
  const PATH_PTS_NORM = [
    [0.02, 0.50], [0.15, 0.20], [0.35, 0.18], [0.48, 0.32],
    [0.48, 0.68], [0.62, 0.82], [0.80, 0.78], [0.82, 0.42],
    [0.70, 0.28], [0.92, 0.22], [0.98, 0.50]
  ];
  // Precompute dense sample points with arc length.
  const PATH_SAMPLES = (function build() {
    const pts = PATH_PTS_NORM.map(p => [p[0] * W, p[1] * H]);
    const samples = [];
    const perSeg = 40;
    let acc = 0;
    samples.push({ x: pts[0][0], y: pts[0][1], s: 0 });
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      for (let j = 1; j <= perSeg; j++) {
        const u = j / perSeg;
        const x = a[0] + (b[0] - a[0]) * u;
        const y = a[1] + (b[1] - a[1]) * u;
        const prev = samples[samples.length - 1];
        acc += Math.hypot(x - prev.x, y - prev.y);
        samples.push({ x, y, s: acc });
      }
    }
    return samples;
  })();
  const PATH_LEN = PATH_SAMPLES[PATH_SAMPLES.length - 1].s;

  function pointAt(s) {
    // binary search for first sample with cumulative length >= s
    if (s <= 0) return { x: PATH_SAMPLES[0].x, y: PATH_SAMPLES[0].y, angle: 0 };
    if (s >= PATH_LEN) {
      const p = PATH_SAMPLES[PATH_SAMPLES.length - 1];
      return { x: p.x, y: p.y, angle: 0, done: true };
    }
    let lo = 0, hi = PATH_SAMPLES.length - 1;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (PATH_SAMPLES[m].s < s) lo = m + 1; else hi = m;
    }
    const a = PATH_SAMPLES[Math.max(0, lo - 1)];
    const b = PATH_SAMPLES[lo];
    const u = (s - a.s) / ((b.s - a.s) || 1);
    const x = a.x + (b.x - a.x) * u;
    const y = a.y + (b.y - a.y) * u;
    return { x, y, angle: Math.atan2(b.y - a.y, b.x - a.x) };
  }

  function distToPath(x, y) {
    // Rough: min distance to any sample. Good enough for placement checks.
    let best = Infinity;
    for (let i = 0; i < PATH_SAMPLES.length; i += 3) {
      const p = PATH_SAMPLES[i];
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < best) best = d;
    }
    return best;
  }

  // --- Enemy tiers (BTD-style color/size ladder) ---
  const TIERS = {
    tiny:   { hp:  3, speed: 70,  bounty: 1,  leak: 1,  size: 28, color: '#a67555', shadow: '#5a3a22', splitsTo: null,    sprite: 'orb_meteor_tiny' },
    small:  { hp:  9, speed: 60,  bounty: 2,  leak: 2,  size: 36, color: '#b88064', shadow: '#6b4025', splitsTo: 'tiny',  sprite: 'orb_meteor_small' },
    med:    { hp: 18, speed: 52,  bounty: 4,  leak: 4,  size: 48, color: '#c89070', shadow: '#7a4a28', splitsTo: 'small', sprite: 'orb_meteor_med' },
    big:    { hp: 40, speed: 44,  bounty: 8,  leak: 8,  size: 62, color: '#d8a07a', shadow: '#885530', splitsTo: 'med',   sprite: 'orb_meteor_big' },
    ufo:    { hp: 60, speed: 95,  bounty: 10, leak: 6,  size: 44, color: '#8ee5ff', shadow: '#2a6a8c', splitsTo: null,    sprite: 'orb_ufo', resistsGravity: true },
    elite:  { hp:120, speed: 40,  bounty: 25, leak:12,  size: 66, color: '#c8c8d8', shadow: '#444a66', splitsTo: 'big',   sprite: 'orb_elite', elite: true },
    boss:   { hp:2000,speed: 28,  bounty:500, leak:80,  size: 110,color: '#ff5566', shadow: '#4a0820', splitsTo: null,    sprite: 'orb_boss', boss: true }
  };

  // --- Tower definitions ---
  const TOWERS = {
    dart: {
      name: 'Dart Station', cost: 180, color: '#7ae0ff', sprite: 'orb_turret_dart',
      range: 140, fireRate: 3.2, dmg: 2, projSpeed: 520, proj: 'bolt',
      upg: { cost: 240, dmg: 3, fireRate: 7.0, pierce: 3, label: 'Rapid + Piercing' }
    },
    cannon: {
      name: 'Plasma Cannon', cost: 450, color: '#ffb347', sprite: 'orb_turret_cannon',
      range: 155, fireRate: 0.9, dmg: 6, projSpeed: 380, proj: 'plasma', splash: 40,
      upg: { cost: 550, dmg: 12, splash: 62, fireRate: 1.1, label: 'Heavy Ordnance' }
    },
    beam: {
      name: 'Beam Array', cost: 700, color: '#ff4fd8', sprite: 'orb_turret_beam',
      range: 185, fireRate: 0, dmg: 0, proj: 'beam', beamDps: 32,
      upg: { cost: 800, beamDps: 72, chain: 2, label: 'Fractal Beam' }
    },
    gravity: {
      name: 'Gravity Well', cost: 600, color: '#b890ff', sprite: 'orb_turret_gravity',
      range: 145, fireRate: 0, dmg: 0, proj: 'aura', slow: 0.50,
      upg: { cost: 700, slow: 0.75, pullDps: 4, label: 'Event Horizon' }
    },
    flare: {
      name: 'Solar Flare', cost: 1200, color: '#ffd86b', sprite: 'orb_turret_flare',
      range: 155, fireRate: 0, dmg: 0, proj: 'pulse', pulseCD: 3.0, pulseDmg: 22,
      upg: { cost: 1400, pulseCD: 1.8, pulseDmg: 48, burnDps: 10, label: 'Coronal Mass Ejection' }
    },
    sing: {
      name: 'Singularity', cost: 3000, color: '#a070ff', sprite: 'orb_turret_sing',
      range: 100, fireRate: 0, dmg: 0, proj: 'collapse', collapseCD: 10.0, collapseRadius: 90,
      upg: { cost: 3500, collapseCD: 7.0, collapseRadius: 135, label: 'Horizon Collapse' }
    },
    tesla: {
      name: 'Tesla Coil', cost: 850, color: '#7aaaff', sprite: 'orb_turret_tesla',
      range: 150, fireRate: 1.5, dmg: 0, proj: 'arc', chainCount: 3, chainDmg: 8, chainRadius: 70,
      upg: { cost: 950, chainCount: 5, chainDmg: 16, chainRadius: 95, fireRate: 2.0, label: 'Superconductor' }
    },
    missile: {
      name: 'Missile Silo', cost: 1500, color: '#ff6060', sprite: 'orb_turret_missile',
      range: 240, fireRate: 0.4, dmg: 50, projSpeed: 220, proj: 'homing', splash: 80,
      upg: { cost: 1800, dmg: 110, splash: 120, fireRate: 0.6, label: 'Cluster Warheads' }
    },
    support: {
      name: 'Support Beacon', cost: 900, color: '#4ade80', sprite: 'orb_turret_support',
      range: 130, fireRate: 0, dmg: 0, proj: 'aura', buffFire: 0.25, buffDmg: 0.15,
      upg: { cost: 1100, buffFire: 0.55, buffDmg: 0.35, buffRange: 0.20, label: 'Resonance Field' }
    },
    quant: {
      // Tier 1: 35% bounty aura inside range; 4% per-wave interest on cash, capped at $40.
      // Tier 2: 85% bounty aura, larger range; 8% interest capped at $120.
      // Stacks diminish (each extra Quant in range adds 50% of its aura). No idle income.
      name: 'Quant Advisor', cost: 800, color: '#ffd86b', sprite: 'orb_turret_quant',
      range: 130, fireRate: 0, dmg: 0, proj: 'aura',
      bountyMult: 0.35, interestRate: 0.04, interestCap: 40,
      upg: { cost: 1100, range: 170, bountyMult: 0.85, interestRate: 0.08, interestCap: 120, label: 'Aggressive Portfolio' }
    }
  };

  // --- Round definitions: array of {name, bounty, groups:[{tier,count,spacing,delay}]}
  // Enemy modifiers — each spawn in a group may carry one.
  //  armored: halves non-beam damage, shows steel tint
  //  swift:   +60% speed, shows motion streaks
  //  regen:   +50% max hp, heals 4 hp/s out of damage
  const ROUNDS = [
    // Act I: tutorial (R1-10)
    { groups: [{ tier: 'tiny', count: 10, spacing: 0.8, delay: 0 }] },
    { groups: [{ tier: 'tiny', count: 18, spacing: 0.5, delay: 0 }] },
    { groups: [{ tier: 'small', count: 8, spacing: 1.0, delay: 0 }] },
    { groups: [{ tier: 'tiny', count: 18, spacing: 0.4, delay: 0 }, { tier: 'small', count: 6, spacing: 1.2, delay: 9 }] },
    { groups: [{ tier: 'small', count: 14, spacing: 0.7, delay: 0 }, { tier: 'tiny', count: 10, spacing: 0.3, delay: 12, mods: ['swift'] }] },
    { groups: [{ tier: 'med', count: 6, spacing: 1.3, delay: 0 }, { tier: 'tiny', count: 24, spacing: 0.25, delay: 6 }] },
    { groups: [{ tier: 'ufo', count: 4, spacing: 1.6, delay: 0 }, { tier: 'small', count: 12, spacing: 0.7, delay: 2 }] },
    { groups: [{ tier: 'med', count: 10, spacing: 1.0, delay: 0 }, { tier: 'small', count: 8, spacing: 0.5, delay: 8, mods: ['swift'] }] },
    { groups: [{ tier: 'big', count: 3, spacing: 2.2, delay: 0 }, { tier: 'ufo', count: 6, spacing: 1.2, delay: 4 }] },
    { groups: [{ tier: 'elite', count: 1, spacing: 0, delay: 0 }, { tier: 'small', count: 20, spacing: 0.35, delay: 4 }, { tier: 'med', count: 4, spacing: 1.5, delay: 12 }] },
    // Act II: introduce modifiers (R11-20)
    { groups: [{ tier: 'med', count: 10, spacing: 1.0, delay: 0, mods: ['armored'] }] },
    { groups: [{ tier: 'big', count: 6, spacing: 1.6, delay: 0 }, { tier: 'ufo', count: 8, spacing: 0.9, delay: 4, mods: ['swift'] }] },
    { groups: [{ tier: 'med', count: 12, spacing: 0.9, delay: 0, mods: ['regen'] }, { tier: 'small', count: 30, spacing: 0.25, delay: 8 }] },
    { groups: [{ tier: 'big', count: 8, spacing: 1.4, delay: 0, mods: ['armored'] }, { tier: 'elite', count: 2, spacing: 3.0, delay: 6 }] },
    { groups: [{ tier: 'ufo', count: 16, spacing: 0.55, delay: 0 }, { tier: 'med', count: 8, spacing: 1.0, delay: 6, mods: ['swift'] }] },
    { groups: [{ tier: 'big', count: 10, spacing: 1.3, delay: 0 }, { tier: 'med', count: 20, spacing: 0.4, delay: 8, mods: ['regen'] }] },
    { groups: [{ tier: 'elite', count: 3, spacing: 2.5, delay: 0 }, { tier: 'big', count: 6, spacing: 1.4, delay: 6, mods: ['armored'] }] },
    { groups: [{ tier: 'ufo', count: 20, spacing: 0.45, delay: 0, mods: ['swift'] }, { tier: 'med', count: 16, spacing: 0.5, delay: 8 }] },
    { groups: [{ tier: 'big', count: 10, spacing: 1.2, delay: 0, mods: ['regen'] }, { tier: 'elite', count: 4, spacing: 2.2, delay: 6 }] },
    { groups: [{ tier: 'elite', count: 2, spacing: 1.5, delay: 0 }, { tier: 'big', count: 14, spacing: 1.0, delay: 4, mods: ['armored'] }, { tier: 'ufo', count: 12, spacing: 0.6, delay: 12, mods: ['swift'] }] },
    // Act III: hellscape (R21-30)
    { groups: [{ tier: 'elite', count: 6, spacing: 1.8, delay: 0, mods: ['armored'] }] },
    { groups: [{ tier: 'big', count: 20, spacing: 0.9, delay: 0, mods: ['swift'] }] },
    { groups: [{ tier: 'elite', count: 4, spacing: 2.0, delay: 0, mods: ['regen'] }, { tier: 'big', count: 12, spacing: 1.0, delay: 6, mods: ['armored'] }] },
    { groups: [{ tier: 'ufo', count: 30, spacing: 0.35, delay: 0, mods: ['swift'] }] },
    { groups: [{ tier: 'elite', count: 5, spacing: 1.8, delay: 0, mods: ['armored'] }, { tier: 'big', count: 18, spacing: 0.8, delay: 6 }] },
    { groups: [{ tier: 'boss', count: 1, spacing: 0, delay: 0 }, { tier: 'elite', count: 3, spacing: 2.5, delay: 14 }] },
    { groups: [{ tier: 'elite', count: 8, spacing: 1.5, delay: 0, mods: ['regen', 'armored'] }, { tier: 'med', count: 40, spacing: 0.3, delay: 4, mods: ['swift'] }] },
    { groups: [{ tier: 'big', count: 30, spacing: 0.7, delay: 0, mods: ['armored'] }, { tier: 'elite', count: 6, spacing: 2.0, delay: 10 }] },
    { groups: [{ tier: 'elite', count: 10, spacing: 1.4, delay: 0, mods: ['armored', 'swift'] }, { tier: 'ufo', count: 30, spacing: 0.3, delay: 8 }] },
    { groups: [{ tier: 'boss', count: 1, spacing: 0, delay: 0 }, { tier: 'boss', count: 1, spacing: 0, delay: 12 }, { tier: 'elite', count: 10, spacing: 1.8, delay: 6, mods: ['regen', 'armored'] }, { tier: 'big', count: 50, spacing: 0.4, delay: 20, mods: ['swift'] }] }
  ];

  class OrbitalGame extends BaseGame {
    init() {
      this.round = 0;          // 0 = pre-game (not yet started)
      this.maxRound = ROUNDS.length;
      this.cash = 850;
      this.lives = 120;
      this.state2 = 'build';   // 'build' | 'wave' | 'between'
      this.enemies = [];
      this.projectiles = [];
      this.towers = [];
      this.spawnQueue = [];    // {tier, t}
      this.waveTimer = 0;
      this.selected = null;    // placed tower selected
      this.buyingKey = null;   // key of tower being placed
      this.hoverPlace = null;  // {x,y,valid}
      this.messages = [];      // {text, t, color}
      this.floaters = [];      // small +$N callouts at enemy death sites
      this.gameSpeed = 1;      // 1 | 2 — multiplies world-sim dt
      this.speedHeld = false;  // edge-trigger latch for the F key
      this.sfx = this.makeSfx({
        pop:   { freq: 440, type: 'triangle', dur: 0.06, vol: 0.25 },
        boom:  { freq: 120, type: 'noise',    dur: 0.25, vol: 0.45, filter: 'lowpass' },
        laser: { freq: 800, type: 'sawtooth', dur: 0.08, slide: -300, vol: 0.18 },
        place: { freq: 520, type: 'triangle', dur: 0.12, slide: 200,  vol: 0.3 },
        wave:  { freq: 220, type: 'square',   dur: 0.2,  slide: 440,  vol: 0.35 },
        lose:  { freq: 180, type: 'sawtooth', dur: 0.4,  slide: -200, vol: 0.4 },
        win:   { freq: 660, type: 'triangle', dur: 0.35, slide: 440,  vol: 0.5 },
        sing:  { freq: 80,  type: 'noise',    dur: 0.6,  vol: 0.55, filter: 'lowpass' }
      });
      this.starField = [];
      for (let i = 0; i < 80; i++) {
        this.starField.push({
          x: Math.random() * W, y: Math.random() * H,
          tw: Math.random() * Math.PI * 2,
          sz: Math.random() < 0.1 ? 2 : 1
        });
      }
      this.updateHud();
    }

    updateHud() {
      const waveLbl = this.state2 === 'wave'
        ? `<b style="color:#ff9055">WAVE</b>`
        : `<b style="color:#7ae0ff">BUILD</b>`;
      const speedLbl = this.gameSpeed > 1
        ? `<span>Speed <b style="color:#ffd86b">${this.gameSpeed}×</b></span>`
        : '';
      this.setHud(
        `<span>Round <b>${Math.max(1, this.round)}/${this.maxRound}</b></span>` +
        `<span>Cash <b>$${this.cash}</b></span>` +
        `<span>Lives <b>${this.lives}</b></span>` +
        `<span>${waveLbl}</span>` +
        speedLbl +
        `<span>Score <b>${this.score}</b></span>`
      );
    }

    // --- Input handling ---
    onInput() {}

    handleClick(mx, my) {
      // 1) Tray clicks (bottom strip)
      const tray = this.trayHitTest(mx, my);
      if (tray) {
        if (this.cash >= TOWERS[tray].cost) {
          this.buyingKey = tray;
          this.selected = null;
        } else {
          this.flashMessage('Not enough cash', '#ff5566');
        }
        return;
      }
      // 2) Speed toggle button (always available)
      if (this.isOverSpeedBtn(mx, my)) {
        this.toggleSpeed();
        return;
      }
      // 3) Start wave button
      if (this.state2 === 'build' && this.isOverStartBtn(mx, my)) {
        this.startWave();
        return;
      }
      // 3) Upgrade/Sell popup buttons
      if (this.selected) {
        const hit = this.popupHitTest(this.selected, mx, my);
        if (hit === 'upgrade') {
          const def = TOWERS[this.selected.key];
          if (!this.selected.upgraded && this.cash >= def.upg.cost) {
            this.cash -= def.upg.cost;
            this.selected.upgraded = true;
            Object.assign(this.selected.stats, def.upg);
            this.sfx.play('place');
            return;
          } else if (this.selected.upgraded) {
            this.flashMessage('Max tier', '#ffd86b');
          } else {
            this.flashMessage('Not enough cash', '#ff5566');
          }
          return;
        }
        if (hit === 'sell') {
          const def = TOWERS[this.selected.key];
          const refund = Math.floor((def.cost + (this.selected.upgraded ? def.upg.cost : 0)) * 0.7);
          this.cash += refund;
          this.towers = this.towers.filter(t => t !== this.selected);
          this.flashMessage(`+$${refund}`, '#7ae0ff');
          this.selected = null;
          this.sfx.play('pop');
          return;
        }
      }
      // 4) Place a tower being bought
      if (this.buyingKey) {
        if (this.canPlaceAt(mx, my)) {
          const def = TOWERS[this.buyingKey];
          this.cash -= def.cost;
          const tower = {
            key: this.buyingKey,
            x: mx, y: my,
            stats: Object.assign({}, def),
            cd: 0,
            angle: 0,
            target: null,
            beamTarget: null,
            upgraded: false,
            collapseCd: def.collapseCD || 0,
            pulseCd: def.pulseCD || 0,
            placedAt: this.time
          };
          this.towers.push(tower);
          this.sfx.play('place');
          this.buyingKey = null;
          this.spark(mx, my, 18, def.color);
        } else {
          this.flashMessage('Cannot place here', '#ff5566');
        }
        return;
      }
      // 5) Select existing tower
      for (const t of this.towers) {
        if (Math.hypot(t.x - mx, t.y - my) < 18) {
          this.selected = t;
          return;
        }
      }
      this.selected = null;
    }

    trayHitTest(mx, my) {
      if (mx < W - 80 || mx > W - 6) return null;
      const keys = Object.keys(TOWERS);
      for (let i = 0; i < keys.length; i++) {
        const y = 8 + i * 42;
        if (my >= y && my < y + 40) return keys[i];
      }
      return null;
    }

    isOverStartBtn(mx, my) {
      return mx >= 12 && mx <= 140 && my >= H - 48 && my <= H - 12;
    }

    isOverSpeedBtn(mx, my) {
      // Sits to the right of the start button, same row
      return mx >= 148 && mx <= 196 && my >= H - 48 && my <= H - 12;
    }

    toggleSpeed() {
      this.gameSpeed = this.gameSpeed === 1 ? 2 : 1;
      this.flashMessage(`SPEED ${this.gameSpeed}×`, '#ffd86b');
      this.sfx.play('place');
    }

    spawnFloater(x, y, text, color) {
      this.floaters.push({ x, y, vy: -22, t: 0.9, text, color: color || '#ffd86b' });
      if (this.floaters.length > 30) this.floaters.shift();
    }

    popupHitTest(t, mx, my) {
      const r = this._popupRect;
      if (!r) return null;
      if (mx >= r.ubx && mx <= r.ubx + r.bw) {
        if (my >= r.uby && my <= r.uby + r.bh) return 'upgrade';
        if (my >= r.sby && my <= r.sby + r.bh) return 'sell';
      }
      return null;
    }

    canPlaceAt(x, y) {
      if (x < 20 || x > W - 88 || y < 20 || y > H - 60) return false;
      if (distToPath(x, y) < 28) return false;
      for (const t of this.towers) {
        if (Math.hypot(t.x - x, t.y - y) < 34) return false;
      }
      return true;
    }

    startWave() {
      if (this.state2 !== 'build') return;
      if (this.round >= this.maxRound) return;
      this.round++;
      this.state2 = 'wave';
      this.waveTimer = 0;
      const def = ROUNDS[this.round - 1];
      this.spawnQueue = [];
      for (const g of def.groups) {
        for (let i = 0; i < g.count; i++) {
          this.spawnQueue.push({ tier: g.tier, t: g.delay + i * g.spacing, mods: g.mods || [] });
        }
      }
      this.spawnQueue.sort((a, b) => a.t - b.t);
      this.cash += 40 + this.round * 5; // small round bonus
      // Quant Advisor: interest on current cash, capped per tower.
      // Stacking diminishes — each extra quant contributes 50% of its rate/cap.
      const quants = this.towers.filter(t => t.key === 'quant');
      if (quants.length > 0) {
        let totalRate = 0, totalCap = 0;
        quants.sort((a, b) => (b.stats.interestRate || 0) - (a.stats.interestRate || 0));
        for (let i = 0; i < quants.length; i++) {
          const q = quants[i];
          const w = i === 0 ? 1 : 0.5;
          totalRate += (q.stats.interestRate || 0) * w;
          totalCap  += (q.stats.interestCap  || 0) * w;
          q._dividendPulse = 1.0;
        }
        const interest = Math.min(totalCap, Math.floor(this.cash * totalRate));
        if (interest > 0) {
          this.cash += interest;
          this.flashMessage(`+$${interest} INTEREST`, '#4ade80');
        }
      }
      this.sfx.play('wave');
      this.flashMessage(`ROUND ${this.round}`, '#ffd86b');
    }

    flashMessage(text, color) {
      this.messages.push({ text, t: 1.6, color: color || '#fff' });
      if (this.messages.length > 3) this.messages.shift();
    }

    // --- Spawning ---
    spawnEnemy(tier, mods) {
      const spec = TIERS[tier];
      mods = mods || [];
      let hp = spec.hp;
      let speed = spec.speed;
      if (mods.includes('armored')) hp = Math.round(hp * 1.2);
      if (mods.includes('regen'))   hp = Math.round(hp * 1.5);
      if (mods.includes('swift'))   speed = Math.round(speed * 1.6);
      const e = {
        tier,
        hp, maxHp: hp,
        pathS: 0,
        speed,
        size: spec.size,
        spec,
        mods,
        armored: mods.includes('armored'),
        regen: mods.includes('regen'),
        swift: mods.includes('swift'),
        lastDamagedT: -999,
        slow: 0,
        burn: 0,
        x: PATH_SAMPLES[0].x,
        y: PATH_SAMPLES[0].y,
        angle: 0,
        rotSpin: (Math.random() - 0.5) * 2,
        spawnT: this.time
      };
      this.enemies.push(e);
    }

    damage(e, amount, source) {
      // Beam pierces armor. All other sources hit at 50% vs armored.
      if (e.armored && source !== 'beam' && source !== 'sing') amount *= 0.5;
      e.hp -= amount;
      e.lastDamagedT = this.time;
    }

    // --- Per-frame update ---
    update(dt) {
      // Real-time UI dt (messages, floaters, twinkle, input). Sim dt is
      // multiplied by gameSpeed so the world fast-forwards on demand.
      const rdt = dt;
      const sdt = dt * this.gameSpeed;

      // Star twinkle
      for (const s of this.starField) s.tw += rdt * 2;

      // Messages + floaters use real-time so they read at the same pace
      for (const m of this.messages) m.t -= rdt;
      this.messages = this.messages.filter(m => m.t > 0);
      for (const f of this.floaters) {
        f.t -= rdt;
        f.y += f.vy * rdt;
      }
      this.floaters = this.floaters.filter(f => f.t > 0);

      // Wave spawning
      if (this.state2 === 'wave') {
        this.waveTimer += sdt;
        while (this.spawnQueue.length && this.spawnQueue[0].t <= this.waveTimer) {
          const s = this.spawnQueue.shift();
          this.spawnEnemy(s.tier, s.mods);
        }
      }

      // Enemies move along path
      for (const e of this.enemies) {
        const slow = Math.min(0.9, e.slow);
        e.pathS += e.speed * (1 - slow) * sdt;
        const p = pointAt(e.pathS);
        e.x = p.x; e.y = p.y; e.angle = p.angle;
        e.slow = Math.max(0, e.slow - sdt * 0.6); // decay slow
        if (e.burn > 0) {
          e.hp -= e.burn * sdt;
          e.burn = Math.max(0, e.burn - sdt * 0.2);
        }
        // Regen: heals 4 hp/s if not damaged for 1.5s
        if (e.regen && this.time - e.lastDamagedT > 1.5 && e.hp < e.maxHp) {
          e.hp = Math.min(e.maxHp, e.hp + 4 * sdt);
        }
        if (p.done) {
          this.lives -= e.spec.leak;
          this.shake(6, 0.2); this.flash('#ff5566', 0.08);
          this.sfx.play('boom');
          e.dead = true;
        }
      }

      // Towers
      for (const t of this.towers) this.updateTower(t, sdt);

      // Projectiles
      for (const p of this.projectiles) this.updateProjectile(p, sdt);
      this.projectiles = this.projectiles.filter(p => !p.dead);

      // Cull dead enemies, handle splits/bounties
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (e.hp <= 0) {
          e.dead = true;
          // Quant bounty aura: stack diminishes (each extra Quant in range
          // adds 50% of its bountyMult) so multiple Quants don't snowball.
          let mult = 0;
          let primaryQuant = null;
          for (const t of this.towers) {
            if (t.key !== 'quant') continue;
            const d = Math.hypot(t.x - e.x, t.y - e.y);
            if (d <= t.stats.range) {
              const m = t.stats.bountyMult || 0;
              if (!primaryQuant || m > primaryQuant.stats.bountyMult) {
                if (primaryQuant) mult += (primaryQuant.stats.bountyMult || 0) * 0.5;
                primaryQuant = t;
              } else {
                mult += m * 0.5;
              }
            }
          }
          if (primaryQuant) mult += primaryQuant.stats.bountyMult || 0;
          const bounty = Math.round(e.spec.bounty * (1 + mult));
          this.cash += bounty;
          this.addScore(bounty * 5);
          if (mult > 0 && bounty > e.spec.bounty) {
            this.spawnFloater(e.x, e.y - e.size * 0.5, '+$' + (bounty - e.spec.bounty), '#ffd86b');
          }
          this.particles.burst(e.x, e.y, 14, { color: e.spec.color, speed: 160, life: 0.5 });
          this.sfx.play('pop');
          if (e.spec.splitsTo) {
            for (let k = 0; k < 2; k++) {
              const sp = TIERS[e.spec.splitsTo];
              const ne = {
                tier: e.spec.splitsTo, hp: sp.hp, maxHp: sp.hp,
                pathS: e.pathS - k * 18, speed: sp.speed, size: sp.size,
                spec: sp, slow: e.slow * 0.5, burn: 0,
                x: e.x, y: e.y, angle: e.angle, rotSpin: (Math.random() - 0.5) * 2,
                spawnT: this.time
              };
              this.enemies.push(ne);
            }
          }
          if (e.spec.boss) {
            this.shake(14, 0.6); this.flash('#ffd86b', 0.2);
            this.addScore(2500);
          }
        }
      }
      this.enemies = this.enemies.filter(e => !e.dead);

      // End of wave check
      if (this.state2 === 'wave' && this.spawnQueue.length === 0 && this.enemies.length === 0) {
        this.state2 = 'build';
        this.addScore(100 + this.round * 25);
        if (this.round >= this.maxRound) {
          this.sfx.play('win');
          this.flash('#7ae0ff', 0.4);
          this.win();
        } else {
          this.flashMessage('Round clear', '#7ae0ff');
        }
      }

      // Lives out
      if (this.lives <= 0 && this.state !== 'over') {
        this.lives = 0;
        this.sfx.play('lose');
        this.gameOver();
      }

      // Hover preview for placement
      this.hoverPlace = null;
      if (this.buyingKey) {
        const mx = Input.mouse.x, my = Input.mouse.y;
        this.hoverPlace = { x: mx, y: my, valid: this.canPlaceAt(mx, my) };
      }

      // Click handling (respect per-frame edge)
      if (Input.mouse.justPressed) {
        this.handleClick(Input.mouse.x, Input.mouse.y);
      }
      // Right click / ESC cancels buy
      if (Input.keys && Input.keys[' ']) {
        // Space edge-trigger via justPressedKey not guaranteed — use a latch.
        if (!this._spaceHeld) {
          this._spaceHeld = true;
          if (this.state2 === 'build') this.startWave();
        }
      } else {
        this._spaceHeld = false;
      }
      // F toggles 1× / 2× game speed
      if (Input.keys && (Input.keys['f'] || Input.keys['F'])) {
        if (!this.speedHeld) {
          this.speedHeld = true;
          this.toggleSpeed();
        }
      } else {
        this.speedHeld = false;
      }

      this.updateHud();
    }

    buffsForTower(t) {
      // Aggregate fire-rate and damage multipliers from all support towers in range.
      let fireMul = 1, dmgMul = 1;
      for (const s of this.towers) {
        if (s === t || s.key !== 'support') continue;
        const d = Math.hypot(s.x - t.x, s.y - t.y);
        if (d <= s.stats.range) {
          fireMul += s.stats.buffFire || 0;
          dmgMul += s.stats.buffDmg || 0;
        }
      }
      return { fireMul, dmgMul };
    }

    updateTower(t, dt) {
      const st = t.stats;
      // Recoil decay
      if (t.recoil) t.recoil = Math.max(0, t.recoil - dt * 5);
      // Find target (first enemy in range furthest along path, BTD "first" priority)
      let best = null; let bestS = -1;
      for (const e of this.enemies) {
        const d = Math.hypot(e.x - t.x, e.y - t.y);
        if (d <= st.range && e.pathS > bestS) { best = e; bestS = e.pathS; }
      }
      t.target = best;
      if (best) t.angle = Math.atan2(best.y - t.y, best.x - t.x);
      const buffs = this.buffsForTower(t);

      // Per-type behavior
      switch (t.key) {
        case 'dart':
        case 'cannon':
        case 'missile': {
          if (!best) { t.cd -= dt; break; }
          t.cd -= dt;
          if (t.cd <= 0) {
            this.fireProjectile(t, best, buffs);
            t.cd = 1 / (st.fireRate * buffs.fireMul);
            t.recoil = 1.0;
            this.sfx.play(t.key === 'missile' ? 'boom' : 'laser');
            // Muzzle flash particles
            const fx = t.x + Math.cos(t.angle) * 16;
            const fy = t.y + Math.sin(t.angle) * 16;
            this.particles.burst(fx, fy, t.key === 'missile' ? 12 : 6, {
              color: t.key === 'missile' ? '#ff8040' : st.color,
              speed: 60, life: 0.2, size: 2
            });
          }
          break;
        }
        case 'tesla': {
          if (!best) { t.cd -= dt; break; }
          t.cd -= dt;
          if (t.cd <= 0) {
            t.cd = 1 / (st.fireRate * buffs.fireMul);
            t._arcAnim = 0.35;
            t._arcTargets = [];
            // Chain from tower → first target → nearest → nearest...
            let current = best;
            let count = 0;
            const hit = new Set();
            while (current && count < st.chainCount) {
              this.damage(current, st.chainDmg * buffs.dmgMul, 'tesla');
              t._arcTargets.push({ x: current.x, y: current.y });
              hit.add(current);
              // find nearest enemy within chainRadius not yet hit
              let nearest = null, nd = st.chainRadius;
              for (const e of this.enemies) {
                if (hit.has(e)) continue;
                const d = Math.hypot(e.x - current.x, e.y - current.y);
                if (d < nd) { nd = d; nearest = e; }
              }
              current = nearest;
              count++;
            }
            this.sfx.play('laser');
          }
          if (t._arcAnim) t._arcAnim = Math.max(0, t._arcAnim - dt);
          break;
        }
        case 'support': {
          // Passive: just pulse visually, buffs applied via buffsForTower
          t._pulse = (t._pulse || 0) + dt;
          break;
        }
        case 'quant': {
          // No constant income. Bounty aura is applied on-kill in the cull
          // loop; interest pays out at wave start in startWave(). Just animate.
          t._pulse = (t._pulse || 0) + dt;
          if (t._dividendPulse) t._dividendPulse = Math.max(0, t._dividendPulse - dt);
          break;
        }
        case 'beam': {
          t.beamTarget = best;
          if (best) {
            this.damage(best, st.beamDps * buffs.dmgMul * dt, 'beam');
            if (st.chain) {
              // find next nearest after primary
              let near = null, nd = 1e9;
              for (const e of this.enemies) {
                if (e === best) continue;
                const d = Math.hypot(e.x - best.x, e.y - best.y);
                if (d < 80 && d < nd) { nd = d; near = e; }
              }
              if (near) { this.damage(near, st.beamDps * 0.6 * buffs.dmgMul * dt, 'beam'); t.beamChain = near; }
              else t.beamChain = null;
            }
          }
          break;
        }
        case 'gravity': {
          // Slow enemies in range continuously
          for (const e of this.enemies) {
            if (e.spec.resistsGravity) continue;
            const d = Math.hypot(e.x - t.x, e.y - t.y);
            if (d <= st.range) {
              e.slow = Math.max(e.slow, st.slow);
              if (st.pullDps) this.damage(e, st.pullDps * buffs.dmgMul * dt, 'gravity');
            }
          }
          break;
        }
        case 'flare': {
          t.pulseCd -= dt;
          if (t.pulseCd <= 0) {
            t.pulseCd = st.pulseCD / buffs.fireMul;
            t._pulseAnim = 0.6;
            this.shake(3, 0.1);
            this.sfx.play('boom');
            for (const e of this.enemies) {
              const d = Math.hypot(e.x - t.x, e.y - t.y);
              if (d <= st.range) {
                this.damage(e, st.pulseDmg * buffs.dmgMul, 'flare');
                if (st.burnDps) e.burn = Math.max(e.burn, st.burnDps);
                this.particles.burst(e.x, e.y, 4, { color: '#ffd86b', speed: 80, life: 0.3 });
              }
            }
          }
          if (t._pulseAnim) t._pulseAnim = Math.max(0, t._pulseAnim - dt);
          break;
        }
        case 'sing': {
          t.collapseCd -= dt;
          if (t.collapseCd <= 0) {
            t.collapseCd = st.collapseCD;
            t._collapseAnim = 0.9;
            this.shake(10, 0.4); this.flash('#a070ff', 0.15);
            this.sfx.play('sing');
            for (const e of this.enemies) {
              const d = Math.hypot(e.x - t.x, e.y - t.y);
              if (d <= st.collapseRadius) {
                if (e.spec.boss) {
                  e.hp -= 400;  // bosses only take heavy damage, not instakill
                } else if (e.spec.elite) {
                  e.hp -= e.maxHp * 0.9;
                } else {
                  e.hp = 0;
                }
                this.particles.burst(e.x, e.y, 12, { color: '#a070ff', speed: 220, life: 0.7 });
              }
            }
          }
          if (t._collapseAnim) t._collapseAnim = Math.max(0, t._collapseAnim - dt);
          break;
        }
      }
    }

    fireProjectile(t, target, buffs) {
      const st = t.stats;
      const ang = Math.atan2(target.y - t.y, target.x - t.x);
      const dmgMul = (buffs && buffs.dmgMul) || 1;
      this.projectiles.push({
        kind: t.key,
        x: t.x + Math.cos(ang) * 14,
        y: t.y + Math.sin(ang) * 14,
        vx: Math.cos(ang) * st.projSpeed,
        vy: Math.sin(ang) * st.projSpeed,
        speed: st.projSpeed,
        dmg: st.dmg * dmgMul,
        splash: st.splash || 0,
        pierce: st.pierce || 1,
        homing: st.proj === 'homing',
        target: st.proj === 'homing' ? target : null,
        hit: new Set(),
        life: 3.5
      });
    }

    updateProjectile(p, dt) {
      p.life -= dt;
      if (p.life <= 0) { p.dead = true; return; }
      // Homing: adjust velocity toward target (drop target if dead)
      if (p.homing) {
        if (p.target && (p.target.dead || p.target.hp <= 0)) p.target = null;
        if (!p.target) {
          let best = null, bd = 999;
          for (const e of this.enemies) {
            const d = Math.hypot(e.x - p.x, e.y - p.y);
            if (d < bd) { bd = d; best = e; }
          }
          p.target = best;
        }
        if (p.target) {
          const tx = p.target.x, ty = p.target.y;
          const desiredAng = Math.atan2(ty - p.y, tx - p.x);
          const curAng = Math.atan2(p.vy, p.vx);
          let da = desiredAng - curAng;
          while (da > Math.PI) da -= Math.PI * 2;
          while (da < -Math.PI) da += Math.PI * 2;
          const turnRate = 4.0 * dt; // rad/sec
          const ang = curAng + Math.max(-turnRate, Math.min(turnRate, da));
          p.vx = Math.cos(ang) * p.speed;
          p.vy = Math.sin(ang) * p.speed;
        }
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.x < -20 || p.x > W + 20 || p.y < -20 || p.y > H + 20) { p.dead = true; return; }

      for (const e of this.enemies) {
        if (p.hit.has(e)) continue;
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d < e.size * 0.5) {
          this.damage(e, p.dmg, p.kind);
          p.hit.add(e);
          this.particles.burst(p.x, p.y, 3, { color: '#fff', speed: 60, life: 0.2 });
          if (p.splash > 0) {
            for (const e2 of this.enemies) {
              if (e2 === e) continue;
              const d2 = Math.hypot(e2.x - p.x, e2.y - p.y);
              if (d2 < p.splash) this.damage(e2, p.dmg * (1 - d2 / p.splash), p.kind);
            }
            this.particles.burst(p.x, p.y, 16, { color: '#ffb347', speed: 180, life: 0.5 });
            this.shake(4, 0.15);
          }
          if (p.hit.size >= p.pierce) { p.dead = true; return; }
        }
      }
    }

    // --- Render ---
    render(ctx) {
      // Deep space
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#0a0522'); g.addColorStop(1, '#05071a');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

      // Stars
      for (const s of this.starField) {
        const b = 0.35 + (Math.sin(s.tw) + 1) * 0.3;
        ctx.fillStyle = `rgba(255,255,255,${b})`;
        ctx.fillRect(s.x, s.y, s.sz, s.sz);
      }

      // Nebula wash
      const rg = ctx.createRadialGradient(W * 0.3, H * 0.3, 20, W * 0.3, H * 0.3, W * 0.6);
      rg.addColorStop(0, 'rgba(122,224,255,0.10)');
      rg.addColorStop(1, 'rgba(122,224,255,0)');
      ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
      const rg2 = ctx.createRadialGradient(W * 0.8, H * 0.7, 20, W * 0.8, H * 0.7, W * 0.5);
      rg2.addColorStop(0, 'rgba(255,80,200,0.10)');
      rg2.addColorStop(1, 'rgba(255,80,200,0)');
      ctx.fillStyle = rg2; ctx.fillRect(0, 0, W, H);

      // Path: outer glow + inner track
      ctx.save();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(122,224,255,0.28)';
      ctx.lineWidth = 22;
      this.drawPath(ctx);
      ctx.strokeStyle = '#1b2b4a';
      ctx.lineWidth = 16;
      this.drawPath(ctx);
      ctx.strokeStyle = '#223456';
      ctx.lineWidth = 12;
      this.drawPath(ctx);
      // dashed trajectory line
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = 'rgba(122,224,255,0.6)';
      ctx.lineWidth = 1.5;
      this.drawPath(ctx);
      ctx.setLineDash([]);
      ctx.restore();

      // Hyperspace tear (start)
      const start = PATH_SAMPLES[0];
      const tearA = this.time * 3;
      ctx.save();
      ctx.translate(start.x, start.y);
      for (let r = 4; r < 24; r += 4) {
        ctx.strokeStyle = `rgba(255,80,216,${0.6 - r * 0.02})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, r + Math.sin(tearA + r * 0.5) * 2, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();

      // Homeworld (end)
      const end = PATH_SAMPLES[PATH_SAMPLES.length - 1];
      ctx.save();
      const hg = ctx.createRadialGradient(end.x, end.y, 4, end.x, end.y, 28);
      hg.addColorStop(0, '#ffc089'); hg.addColorStop(1, '#a54020');
      ctx.fillStyle = hg;
      ctx.beginPath(); ctx.arc(end.x, end.y, 26, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ff9055';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(end.x, end.y, 32 + Math.sin(this.time * 2) * 3, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();

      // Tower range indicator (for selected/buying)
      if (this.selected) this.drawRange(ctx, this.selected.x, this.selected.y, this.selected.stats.range, '#7ae0ff');
      if (this.buyingKey && this.hoverPlace) {
        const def = TOWERS[this.buyingKey];
        this.drawRange(ctx, this.hoverPlace.x, this.hoverPlace.y, def.range, this.hoverPlace.valid ? '#7ae0ff' : '#ff5566');
      }

      // Towers
      for (const t of this.towers) this.drawTower(ctx, t);

      // Enemies
      for (const e of this.enemies) this.drawEnemy(ctx, e);

      // Projectiles
      for (const p of this.projectiles) this.drawProjectile(ctx, p);

      // Tesla arc chains (drawn on top of enemies so they pop)
      for (const t of this.towers) {
        if (t.key === 'tesla' && t._arcAnim && t._arcTargets && t._arcTargets.length) {
          ctx.save();
          ctx.strokeStyle = '#7aaaff';
          ctx.lineWidth = 2.5;
          ctx.shadowColor = '#7aaaff'; ctx.shadowBlur = 16;
          ctx.globalAlpha = t._arcAnim / 0.35;
          // Jagged polyline from tower orb through each target
          const pts = [{ x: t.x, y: t.y - 24 }].concat(t._arcTargets);
          for (let i = 0; i < pts.length - 1; i++) {
            const a = pts[i], b = pts[i + 1];
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            // 4 mid-jitter segments for lightning feel
            const steps = 5;
            for (let s = 1; s < steps; s++) {
              const u = s / steps;
              const mx = a.x + (b.x - a.x) * u + (Math.random() - 0.5) * 14;
              const my = a.y + (b.y - a.y) * u + (Math.random() - 0.5) * 14;
              ctx.lineTo(mx, my);
            }
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
          // Flash at each target
          ctx.fillStyle = '#fff';
          for (const p of t._arcTargets) {
            ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill();
          }
          ctx.restore();
        }
      }
      // Support pulses (expanding ring)
      for (const t of this.towers) {
        if (t.key === 'support') {
          ctx.save();
          const phase = ((t._pulse || 0) * 0.6) % 1;
          ctx.strokeStyle = '#4ade80';
          ctx.lineWidth = 1.5;
          ctx.globalAlpha = (1 - phase) * 0.6;
          ctx.beginPath(); ctx.arc(t.x, t.y, 14 + phase * (t.stats.range - 14), 0, Math.PI * 2); ctx.stroke();
          ctx.restore();
        }
      }
      // Beam towers draw their beam on top of enemies
      for (const t of this.towers) {
        if (t.key === 'beam' && t.beamTarget) {
          ctx.save();
          ctx.strokeStyle = '#ff4fd8';
          ctx.lineWidth = 3 + Math.sin(this.time * 30) * 1;
          ctx.shadowColor = '#ff4fd8'; ctx.shadowBlur = 14;
          ctx.beginPath();
          ctx.moveTo(t.x, t.y);
          ctx.lineTo(t.beamTarget.x, t.beamTarget.y);
          ctx.stroke();
          if (t.beamChain) {
            ctx.beginPath();
            ctx.moveTo(t.beamTarget.x, t.beamTarget.y);
            ctx.lineTo(t.beamChain.x, t.beamChain.y);
            ctx.stroke();
          }
          ctx.restore();
        }
      }

      // Ghost placement
      if (this.buyingKey && this.hoverPlace) {
        const def = TOWERS[this.buyingKey];
        ctx.globalAlpha = this.hoverPlace.valid ? 0.7 : 0.4;
        this.drawTowerGhost(ctx, this.hoverPlace.x, this.hoverPlace.y, def, this.hoverPlace.valid);
        ctx.globalAlpha = 1;
      }

      // Tray
      this.drawTray(ctx);

      // Start wave button
      if (this.state2 === 'build') this.drawStartBtn(ctx);
      // Speed toggle button (always shown)
      this.drawSpeedBtn(ctx);

      // Tower popup
      if (this.selected) this.drawPopup(ctx, this.selected);

      // Floaters (above enemies, below messages)
      this.drawFloaters(ctx);

      // Messages
      this.drawMessages(ctx);
    }

    drawPath(ctx) {
      ctx.beginPath();
      ctx.moveTo(PATH_SAMPLES[0].x, PATH_SAMPLES[0].y);
      for (let i = 1; i < PATH_SAMPLES.length; i++) {
        ctx.lineTo(PATH_SAMPLES[i].x, PATH_SAMPLES[i].y);
      }
      ctx.stroke();
    }

    drawRange(ctx, x, y, r, color) {
      ctx.save();
      ctx.strokeStyle = color; ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.globalAlpha = 0.7;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.06;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    drawTower(ctx, t) {
      const def = t.stats;
      // Tier dot if upgraded (top-right of sprite)
      if (t.upgraded) {
        ctx.save();
        ctx.fillStyle = '#ffd86b';
        ctx.strokeStyle = '#2a2004';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(t.x + 18, t.y - 18, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.restore();
      }

      // Sprite or procedural body rotated toward target (with recoil kickback)
      const key = def.sprite;
      // Symmetric towers (radial effects) don't rotate toward target.
      const symmetric = (t.key === 'gravity' || t.key === 'sing' || t.key === 'flare' || t.key === 'support' || t.key === 'tesla' || t.key === 'quant');
      const rot = symmetric ? 0 : t.angle + Math.PI / 2;
      // Recoil: kick sprite backward along firing axis briefly after shot
      const recoil = t.recoil || 0;
      const kick = recoil * 5;
      const dx = symmetric ? 0 : -Math.cos(t.angle) * kick;
      const dy = symmetric ? 0 : -Math.sin(t.angle) * kick;
      Assets.draw(ctx, key, t.x + dx, t.y + dy, 48, 48, {
        rot,
        fallback: () => this.drawTowerProcedural(ctx, t)
      });
      // Currently-buffed glow (small green ring)
      if (t.key !== 'support') {
        const buffs = this.buffsForTower(t);
        if (buffs.fireMul > 1 || buffs.dmgMul > 1) {
          ctx.save();
          ctx.strokeStyle = '#4ade80';
          ctx.lineWidth = 1.5;
          ctx.globalAlpha = 0.5 + Math.sin(this.time * 4) * 0.2;
          ctx.beginPath(); ctx.arc(t.x, t.y, 26, 0, Math.PI * 2); ctx.stroke();
          ctx.restore();
        }
      }

      // Per-tower FX
      if (t.key === 'flare' && t._pulseAnim) {
        ctx.save();
        ctx.globalAlpha = t._pulseAnim;
        ctx.strokeStyle = '#ffd86b';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(t.x, t.y, def.range * (1 - t._pulseAnim / 0.6), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      if (t.key === 'sing') {
        // Constant accretion ring
        ctx.save();
        const spin = this.time * 1.4;
        for (let i = 0; i < 3; i++) {
          ctx.strokeStyle = `rgba(160,112,255,${0.3 + i * 0.1})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(t.x, t.y, 22 + i * 4 + Math.sin(spin + i) * 1.5, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (t._collapseAnim) {
          ctx.globalAlpha = t._collapseAnim / 0.9;
          ctx.fillStyle = '#a070ff';
          ctx.beginPath(); ctx.arc(t.x, t.y, def.collapseRadius * (1 - t._collapseAnim / 0.9), 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      }
      if (t.key === 'quant' && t._dividendPulse) {
        ctx.save();
        ctx.strokeStyle = '#ffd86b';
        ctx.lineWidth = 2;
        ctx.globalAlpha = t._dividendPulse;
        ctx.beginPath(); ctx.arc(t.x, t.y, 24 + (1 - t._dividendPulse) * 30, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      if (t.key === 'gravity') {
        ctx.save();
        ctx.strokeStyle = `rgba(184,144,255,0.4)`;
        ctx.lineWidth = 1;
        const spin = this.time * 2;
        for (let i = 0; i < 6; i++) {
          const a = spin + i * Math.PI / 3;
          ctx.beginPath();
          ctx.moveTo(t.x + Math.cos(a) * 18, t.y + Math.sin(a) * 18);
          ctx.lineTo(t.x + Math.cos(a) * 26, t.y + Math.sin(a) * 26);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    drawTowerProcedural(ctx, t) {
      const def = t.stats;
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.rotate(t.angle);
      ctx.fillStyle = def.color;
      ctx.fillRect(-4, -3, 14, 6);
      ctx.fillStyle = '#fff';
      ctx.fillRect(10, -2, 4, 4);
      ctx.restore();
    }

    drawTowerGhost(ctx, x, y, def, valid) {
      ctx.save();
      // Validity ring (tinted)
      ctx.strokeStyle = valid ? def.color : '#ff5566';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.globalAlpha = 0.8;
      ctx.beginPath(); ctx.arc(x, y, 26, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      Assets.draw(ctx, def.sprite, x, y, 48, 48, {
        alpha: valid ? 0.75 : 0.4,
        fallback: () => {
          ctx.fillStyle = def.color;
          ctx.fillRect(x - 6, y - 3, 12, 6);
        }
      });
      ctx.restore();
    }

    drawEnemy(ctx, e) {
      const spec = e.spec;
      const scale = e.size;
      // Swift motion streaks (drawn behind the body)
      if (e.swift) {
        ctx.save();
        ctx.strokeStyle = '#7ae0ff';
        ctx.lineWidth = 1.2;
        ctx.globalAlpha = 0.5;
        const bx = e.x - Math.cos(e.angle) * e.size * 0.7;
        const by = e.y - Math.sin(e.angle) * e.size * 0.7;
        ctx.beginPath(); ctx.moveTo(bx, by - e.size * 0.2);
        ctx.lineTo(e.x - Math.cos(e.angle) * e.size * 0.3, e.y - Math.sin(e.angle) * e.size * 0.3);
        ctx.stroke();
        ctx.beginPath(); ctx.moveTo(bx, by + e.size * 0.2);
        ctx.lineTo(e.x - Math.cos(e.angle) * e.size * 0.3, e.y - Math.sin(e.angle) * e.size * 0.3);
        ctx.stroke();
        ctx.restore();
      }
      if (spec.sprite) {
        Assets.draw(ctx, spec.sprite, e.x, e.y, scale, scale, {
          rot: spec.boss || spec.sprite === 'orb_ufo' ? 0 : this.time * e.rotSpin,
          fallback: () => this.drawMeteorProcedural(ctx, e)
        });
      } else {
        this.drawMeteorProcedural(ctx, e);
      }
      // Armored sheen (metallic tint ring)
      if (e.armored) {
        ctx.save();
        ctx.strokeStyle = '#c8d8f0';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.5 + Math.sin(this.time * 3) * 0.2;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.size * 0.5 + 2, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = '#c8d8f0';
        ctx.beginPath(); ctx.arc(e.x, e.y, e.size * 0.5, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      // Regen pulse
      if (e.regen && this.time - e.lastDamagedT > 1.5 && e.hp < e.maxHp) {
        ctx.save();
        ctx.fillStyle = '#4ade80';
        ctx.globalAlpha = 0.35 + Math.sin(this.time * 6) * 0.2;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.size * 0.5 + 3, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#4ade80';
        for (let i = 0; i < 3; i++) {
          const a = this.time * 2 + i * (Math.PI * 2 / 3);
          ctx.beginPath();
          ctx.arc(e.x + Math.cos(a) * e.size * 0.4, e.y + Math.sin(a) * e.size * 0.4, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      if (spec.boss && !Assets.hasImg(spec.sprite)) this.drawBossDetails(ctx, e);
      if (spec.elite) {
        ctx.save();
        ctx.strokeStyle = '#ffd86b';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.size * 0.6, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      // HP bar
      if (e.hp < e.maxHp && e.hp > 0) {
        const w = e.size * 1.1, barY = e.y - e.size * 0.6;
        ctx.fillStyle = '#00000099';
        ctx.fillRect(e.x - w / 2, barY, w, 4);
        ctx.fillStyle = spec.boss ? '#ff5566' : (e.hp / e.maxHp > 0.4 ? '#4ade80' : '#ffd86b');
        ctx.fillRect(e.x - w / 2, barY, w * (e.hp / e.maxHp), 4);
      }
      // Burn indicator
      if (e.burn > 0) {
        ctx.fillStyle = `rgba(255,140,60,${0.4 + Math.random() * 0.3})`;
        ctx.beginPath(); ctx.arc(e.x, e.y - e.size * 0.4, 2 + Math.random() * 2, 0, Math.PI * 2); ctx.fill();
      }
      // Slow tint
      if (e.slow > 0.1) {
        ctx.save();
        ctx.globalAlpha = e.slow * 0.3;
        ctx.fillStyle = '#b890ff';
        ctx.beginPath(); ctx.arc(e.x, e.y, e.size * 0.55, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }

    drawMeteorProcedural(ctx, e) {
      const spec = e.spec;
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(this.time * e.rotSpin);
      ctx.fillStyle = spec.color;
      ctx.beginPath(); ctx.arc(0, 0, e.size * 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = spec.shadow;
      ctx.beginPath(); ctx.arc(-2, 2, e.size * 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = spec.color;
      ctx.beginPath(); ctx.arc(-1, -1, e.size * 0.45, 0, Math.PI * 2); ctx.fill();
      // craters
      ctx.fillStyle = spec.shadow;
      ctx.beginPath(); ctx.arc(-e.size * 0.15, -e.size * 0.1, e.size * 0.08, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(e.size * 0.18, e.size * 0.1, e.size * 0.1, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    drawBossDetails(ctx, e) {
      ctx.save();
      ctx.translate(e.x, e.y);
      // fallback procedural boss ring since boss.png 404'd
      ctx.strokeStyle = '#ff5566'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, e.size * 0.55, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#4a0820';
      ctx.beginPath(); ctx.arc(0, 0, e.size * 0.55, 0, Math.PI * 2); ctx.fill();
      const spin = this.time * 0.6;
      ctx.strokeStyle = '#ff9055'; ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const a = spin + i * Math.PI / 3;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * e.size * 0.3, Math.sin(a) * e.size * 0.3);
        ctx.lineTo(Math.cos(a) * e.size * 0.55, Math.sin(a) * e.size * 0.55);
        ctx.stroke();
      }
      ctx.fillStyle = '#ffd86b';
      ctx.beginPath(); ctx.arc(0, 0, e.size * 0.18, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    drawProjectile(ctx, p) {
      const ang = Math.atan2(p.vy, p.vx);
      const key = p.kind === 'cannon' ? 'orb_plasma' : 'orb_bolt';
      const w = p.kind === 'cannon' ? 34 : 24;
      const h = p.kind === 'cannon' ? 20 : 12;
      Assets.draw(ctx, key, p.x, p.y, w, h, {
        rot: ang,
        fallback: () => {
          ctx.save();
          ctx.shadowColor = p.kind === 'cannon' ? '#ffb347' : '#ffec7a';
          ctx.shadowBlur = 10;
          ctx.fillStyle = p.kind === 'cannon' ? '#ffd86b' : '#ffec7a';
          ctx.beginPath(); ctx.arc(p.x, p.y, p.kind === 'cannon' ? 5 : 3, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
      });
    }

    drawTray(ctx) {
      ctx.save();
      // panel — narrower + tighter
      ctx.fillStyle = 'rgba(10, 14, 28, 0.85)';
      ctx.fillRect(W - 80, 4, 76, H - 8);
      ctx.strokeStyle = '#1b2540'; ctx.lineWidth = 1;
      ctx.strokeRect(W - 80, 4, 76, H - 8);

      const keys = Object.keys(TOWERS);
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        const def = TOWERS[k];
        const x = W - 76, y = 8 + i * 42;
        const selected = this.buyingKey === k;
        const afford = this.cash >= def.cost;
        ctx.fillStyle = selected ? '#2b3a5c' : (afford ? '#141c30' : '#0e1424');
        ctx.fillRect(x, y, 68, 40);
        ctx.strokeStyle = selected ? def.color : '#2a3550';
        ctx.lineWidth = selected ? 2 : 1;
        ctx.strokeRect(x, y, 68, 40);
        // icon
        const cx = x + 14, cy = y + 20;
        ctx.fillStyle = '#050a18';
        ctx.beginPath(); ctx.arc(cx, cy, 11, 0, Math.PI * 2); ctx.fill();
        Assets.draw(ctx, def.sprite, cx, cy, 24, 24, {
          alpha: afford ? 1 : 0.4,
          fallback: () => { ctx.fillStyle = def.color; ctx.fillRect(cx - 4, cy - 3, 10, 6); }
        });
        ctx.strokeStyle = selected ? def.color : (afford ? '#2a3550' : '#1a2030');
        ctx.lineWidth = selected ? 2 : 1;
        ctx.beginPath(); ctx.arc(cx, cy, 11, 0, Math.PI * 2); ctx.stroke();
        // name
        ctx.fillStyle = afford ? '#e7ecf3' : '#5a6680';
        ctx.font = 'bold 8px ui-monospace, monospace';
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText(def.name.split(' ')[0], x + 28, y + 7);
        // cost
        ctx.fillStyle = afford ? '#ffd86b' : '#6a5530';
        ctx.font = 'bold 9px ui-monospace, monospace';
        ctx.fillText('$' + def.cost, x + 28, y + 19);
        // hotkey
        ctx.fillStyle = '#5a6680';
        ctx.font = '7px ui-monospace, monospace';
        ctx.fillText('#' + ((i + 1) === 10 ? '0' : i + 1), x + 56, y + 30);
      }
      ctx.restore();
    }

    drawStartBtn(ctx) {
      ctx.save();
      const x = 12, y = H - 48, w = 128, h = 36;
      const glow = (Math.sin(this.time * 4) + 1) / 2;
      ctx.fillStyle = `rgba(122,224,255,${0.2 + glow * 0.2})`;
      ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
      ctx.fillStyle = '#0e2240';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#7ae0ff'; ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = '#7ae0ff';
      ctx.font = 'bold 14px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('START WAVE ▶', x + w / 2, y + h / 2);
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillStyle = '#5a7a9a';
      ctx.fillText('[SPACE]', x + w / 2, y + h + 10);
      ctx.restore();
    }

    drawSpeedBtn(ctx) {
      ctx.save();
      const x = 148, y = H - 48, w = 48, h = 36;
      const active = this.gameSpeed > 1;
      const accent = active ? '#ffd86b' : '#7ae0ff';
      ctx.fillStyle = active ? '#3a2a08' : '#0e2240';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = accent; ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = accent;
      ctx.font = 'bold 14px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(this.gameSpeed + '×', x + w / 2, y + h / 2 - 1);
      // Twin chevrons hint when 2×
      if (active) {
        ctx.strokeStyle = '#ffd86b';
        ctx.lineWidth = 1.5;
        const cx = x + w - 9, cy = y + 9;
        ctx.beginPath();
        ctx.moveTo(cx - 4, cy - 3); ctx.lineTo(cx, cy); ctx.lineTo(cx - 4, cy + 3);
        ctx.moveTo(cx - 1, cy - 3); ctx.lineTo(cx + 3, cy); ctx.lineTo(cx - 1, cy + 3);
        ctx.stroke();
      }
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillStyle = '#5a7a9a';
      ctx.fillText('[F]', x + w / 2, y + h + 10);
      ctx.restore();
    }

    drawFloaters(ctx) {
      ctx.save();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = 'bold 12px ui-monospace, monospace';
      for (const f of this.floaters) {
        const a = Math.max(0, Math.min(1, f.t / 0.5));
        ctx.globalAlpha = a;
        ctx.fillStyle = '#000';
        ctx.fillText(f.text, f.x + 1, f.y + 1);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, f.x, f.y);
      }
      ctx.restore();
    }

    drawPopup(ctx, t) {
      const def = TOWERS[t.key];
      // Panel position: above tower when there's room, otherwise below
      const pw = 176, ph = 140;
      let px = t.x + 28;
      let py = t.y - ph - 10;
      if (py < 6) py = t.y + 28;
      if (px + pw > W - 94) px = t.x - pw - 28;
      if (px < 6) px = 6;
      ctx.save();
      // Panel background
      ctx.fillStyle = 'rgba(10, 14, 28, 0.94)';
      ctx.fillRect(px, py, pw, ph);
      ctx.strokeStyle = def.color; ctx.lineWidth = 1.5;
      ctx.strokeRect(px, py, pw, ph);
      // Title bar
      ctx.fillStyle = def.color;
      ctx.fillRect(px, py, pw, 20);
      ctx.fillStyle = '#05081a';
      ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(def.name.toUpperCase() + (t.upgraded ? ' ★' : ''), px + 8, py + 10);
      ctx.textAlign = 'right';
      ctx.fillText(t.upgraded ? 'TIER 2' : 'TIER 1', px + pw - 8, py + 10);

      // Current stats block
      const statY = py + 26;
      ctx.fillStyle = '#8892a6';
      ctx.font = '9px ui-monospace, monospace';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('CURRENT', px + 8, statY);
      const buffs = this.buffsForTower(t);
      const statLines = this.statLinesFor(t, def, buffs);
      ctx.fillStyle = '#e7ecf3';
      ctx.font = 'bold 10px ui-monospace, monospace';
      for (let i = 0; i < statLines.length; i++) {
        ctx.fillText(statLines[i], px + 8, statY + 12 + i * 11);
      }

      // Upgrade button
      const bx = px + 8, by = py + ph - 50, bw = pw - 16, bh = 22;
      const canUpg = !t.upgraded && this.cash >= def.upg.cost;
      ctx.fillStyle = t.upgraded ? '#1a1a22' : (canUpg ? '#0e3020' : '#2a0e14');
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = t.upgraded ? '#333' : (canUpg ? '#4ade80' : '#ff5566');
      ctx.lineWidth = 1;
      ctx.strokeRect(bx, by, bw, bh);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = 'bold 10px ui-monospace, monospace';
      ctx.fillStyle = t.upgraded ? '#667' : '#e7ecf3';
      if (t.upgraded) {
        ctx.fillText('MAX TIER — ' + def.upg.label, bx + bw / 2, by + bh / 2);
      } else {
        ctx.fillText(`↑ ${def.upg.label}`, bx + bw / 2, by + bh / 2 - 4);
        ctx.font = '9px ui-monospace, monospace';
        ctx.fillStyle = canUpg ? '#ffd86b' : '#6a5530';
        ctx.fillText('$' + def.upg.cost, bx + bw / 2, by + bh / 2 + 6);
      }

      // Sell button
      const sy = by + bh + 4;
      ctx.fillStyle = '#2a0e18';
      ctx.fillRect(bx, sy, bw, bh);
      ctx.strokeStyle = '#ff9055';
      ctx.strokeRect(bx, sy, bw, bh);
      ctx.fillStyle = '#ff9055';
      const refund = Math.floor((def.cost + (t.upgraded ? def.upg.cost : 0)) * 0.7);
      ctx.font = 'bold 10px ui-monospace, monospace';
      ctx.fillText(`✕ SELL   +$${refund}`, bx + bw / 2, sy + bh / 2);

      ctx.restore();
      // Save hit region for click handling
      this._popupRect = { px, py, pw, ph, ubx: bx, uby: by, sby: sy, bw, bh };
    }

    statLinesFor(t, def, buffs) {
      const s = t.stats;
      const lines = [];
      const dmgMulStr = buffs.dmgMul > 1 ? ` ×${buffs.dmgMul.toFixed(2)}` : '';
      const fireMulStr = buffs.fireMul > 1 ? ` ×${buffs.fireMul.toFixed(2)}` : '';
      switch (t.key) {
        case 'dart':
          lines.push(`DMG ${s.dmg}${dmgMulStr} · RATE ${s.fireRate.toFixed(1)}/s${fireMulStr}`);
          lines.push(`RANGE ${s.range} · PIERCE ${s.pierce || 1}`);
          break;
        case 'cannon':
          lines.push(`DMG ${s.dmg}${dmgMulStr} · SPLASH ${s.splash}`);
          lines.push(`RATE ${s.fireRate.toFixed(1)}/s${fireMulStr} · RANGE ${s.range}`);
          break;
        case 'beam':
          lines.push(`BEAM ${s.beamDps}${dmgMulStr} dps · pierces armor`);
          lines.push(`RANGE ${s.range}${s.chain ? ' · chains +1' : ''}`);
          break;
        case 'gravity':
          lines.push(`SLOW ${(s.slow * 100) | 0}% · RANGE ${s.range}`);
          lines.push(s.pullDps ? `PULL ${s.pullDps} dps` : 'ignores UFO gravity');
          break;
        case 'flare':
          lines.push(`PULSE ${s.pulseDmg} every ${s.pulseCD.toFixed(1)}s`);
          lines.push(`RANGE ${s.range}${s.burnDps ? ` · BURN ${s.burnDps} dps` : ''}`);
          break;
        case 'sing':
          lines.push(`COLLAPSE r${s.collapseRadius} every ${s.collapseCD.toFixed(1)}s`);
          lines.push('instakills non-boss · pierces armor');
          break;
        case 'tesla':
          lines.push(`ARC ${s.chainDmg}${dmgMulStr} × ${s.chainCount} targets`);
          lines.push(`RATE ${s.fireRate.toFixed(1)}/s${fireMulStr} · RANGE ${s.range}`);
          break;
        case 'missile':
          lines.push(`DMG ${s.dmg}${dmgMulStr} · SPLASH ${s.splash}`);
          lines.push(`RATE ${s.fireRate.toFixed(2)}/s${fireMulStr} · HOMING`);
          break;
        case 'support':
          lines.push(`+${((s.buffFire || 0) * 100) | 0}% RATE  +${((s.buffDmg || 0) * 100) | 0}% DMG`);
          lines.push(`RANGE ${s.range} · passive aura`);
          break;
        case 'quant':
          lines.push(`+${Math.round((s.bountyMult || 0) * 100)}% BOUNTY in range ${s.range}`);
          lines.push(`${Math.round((s.interestRate || 0) * 100)}% INTEREST/wave (max $${s.interestCap})`);
          break;
      }
      return lines;
    }

    drawMessages(ctx) {
      ctx.save();
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      for (let i = 0; i < this.messages.length; i++) {
        const m = this.messages[i];
        const alpha = Math.min(1, m.t / 0.5);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = m.color;
        ctx.font = 'bold 22px ui-monospace, monospace';
        ctx.fillText(m.text, W / 2, 80 + i * 28);
      }
      ctx.restore();
    }

    coinsEarned(score) { return Math.max(0, Math.floor(score / 40)); }
  }

  NDP.attachGame('orbital', OrbitalGame);
})();
