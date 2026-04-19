/* Orbital — slim orchestrator (Phase 1 + Phase 2).
   Catalog data lives in data/{towers,enemies,rounds,abilities}.js.
   Logic helpers in lib/{upgrades,xp,targeting,economy,enemy-mods,overlay,persist}.js.
   UI in ui/{side-panel,recap}.js. All attached to NDP.Orbital.

   The play area is narrowed (W - 240 px) so the BTD4-style right-rail
   side panel can show big stats, the tower buy list, and the upgrade
   tree without crowding the battlefield. */
(function () {
  const NDP = window.NDP;
  const { BaseGame, Input, Assets } = NDP.Engine;
  const O = NDP.Orbital;
  const W = 960, H = 600;
  const PANEL_W = 240;
  const PLAY_W  = W - PANEL_W;

  // ---- Path geometry (sampled in PLAY_W not W) --------------------
  const PATH_PTS_NORM = [
    [0.02, 0.50], [0.15, 0.20], [0.35, 0.18], [0.48, 0.32],
    [0.48, 0.68], [0.62, 0.82], [0.80, 0.78], [0.82, 0.42],
    [0.70, 0.28], [0.92, 0.22], [0.98, 0.50]
  ];
  const PATH_SAMPLES = (function () {
    const pts = PATH_PTS_NORM.map(p => [p[0] * PLAY_W, p[1] * H]);
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
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u,
             angle: Math.atan2(b.y - a.y, b.x - a.x) };
  }
  function distToPath(x, y) {
    let best = Infinity;
    for (let i = 0; i < PATH_SAMPLES.length; i += 3) {
      const p = PATH_SAMPLES[i];
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < best) best = d;
    }
    return best;
  }

  // ---- Symmetric tower set (radial effects, no rotation) ----------
  const SYMMETRIC = new Set(['gravity','sing','flare','support','tesla','quant','chrono','cryo']);

  // ---- Hotkey -> tower-key map (1..0 = first 10 in catalog order) -
  function hotkeyMap() {
    const keys = O.Towers.keys();
    const m = {};
    for (let i = 0; i < keys.length && i < 10; i++) {
      m[i === 9 ? '0' : String(i + 1)] = keys[i];
    }
    return m;
  }

  // =================================================================
  class OrbitalGame extends BaseGame {
    init() {
      this.W = W; this.H = H;
      this.playW = PLAY_W;
      this.maxRound = O.Rounds.count();
      this.round = 0;
      this.cash = 850;
      this.lives = 120;
      this.state2 = 'build';      // 'build' | 'wave'
      this.enemies = [];
      this.projectiles = [];
      this.towers = [];
      this.spawnQueue = [];
      this.waveTimer = 0;
      this.selectedTower = null;
      this.placeKey = null;
      this.hoverPlace = null;
      this.messages = [];
      this.floaters = [];
      this.gameSpeed = 1;
      this.speedHeld = false;
      this._spaceHeld = false;
      this._qHeld = false; this._eHeld = false;
      this._tHeld = false;
      this._mx = 0; this._my = 0;
      this._cashFlash = 0;
      this._lastCash = this.cash;
      this.runStardust = 0;
      this.insiderTradingT = 0;
      this.lastDamagedT = -999;
      // Tower unlocks: persistent best-round high-water mark + per-run boost
      // so anything cleared this run is immediately playable next round.
      this.bestRound = (O.Persist && O.Persist.getBestRound()) | 0;
      this.unlockToast = null;        // { name, t } floating banner
      // Streak tracking for round-bonus
      this.leakedThisRound = false;
      this.noLeakStreak = 0;
      this.longestCombo = 0;
      this._comboCount = 0;
      this._comboT = 0;
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
          x: Math.random() * PLAY_W, y: Math.random() * H,
          tw: Math.random() * Math.PI * 2,
          sz: Math.random() < 0.1 ? 2 : 1
        });
      }
      O.UI.SidePanel.layout(W, H);
      this._hotkeys = hotkeyMap();
      this.setHud(''); // Side panel handles all the prominent stats
    }

    // -------------------------------------------------------------
    //  INPUT
    // -------------------------------------------------------------
    onInput() {}

    isTowerUnlocked(key) {
      return O.Towers.isUnlocked(key, Math.max(this.round, this.bestRound));
    }

    handleClick(mx, my) {
      // Side panel claims the right rail (everything in panel.x..W).
      if (O.UI.SidePanel.handleClick(mx, my, this)) return;
      // Otherwise: in the play area
      // Place mode
      if (this.placeKey) {
        if (!this.isTowerUnlocked(this.placeKey)) {
          this.flashMessage('Tower locked', '#ff5566');
          this.placeKey = null;
          return;
        }
        if (this.canPlaceAt(mx, my)) {
          const def = O.Towers.get(this.placeKey).base;
          this.spendCash(def.cost);
          const tower = O.Upgrades.newPlacedTower(this.placeKey, mx, my, this.time);
          this.towers.push(tower);
          this.sfx.play('place');
          this.spark(mx, my, 18, def.color);
          this.placeKey = null;
        } else {
          this.flashMessage('Cannot place here', '#ff5566');
        }
        return;
      }
      // Select existing tower
      for (const t of this.towers) {
        if (Math.hypot(t.x - mx, t.y - my) < 22) {
          this.selectedTower = t;
          this.placeKey = null;
          return;
        }
      }
      this.selectedTower = null;
    }

    canPlaceAt(x, y) {
      if (x < 20 || x > PLAY_W - 20 || y < 20 || y > H - 20) return false;
      if (distToPath(x, y) < 28) return false;
      for (const t of this.towers) {
        if (Math.hypot(t.x - x, t.y - y) < 34) return false;
      }
      return true;
    }

    // Hooks the side panel calls back into:
    tryBuyTier(p, n) {
      const t = this.selectedTower;
      if (!t) return;
      const res = O.Upgrades.buy(t, p, n, this.cash);
      if (res.ok) {
        this.spendCash(res.cost);
        this.sfx.play('place');
        this.flashMessage('+ ' + res.label, '#7ae0ff');
        this.spark(t.x, t.y, 18, '#ffd86b');
      } else if (res.error === 'cash') {
        this.flashMessage('Not enough cash', '#ff5566');
      } else if (res.error === 'pathcap') {
        this.flashMessage('Path locked (cap rule)', '#ffd86b');
      }
    }

    sellSelected() {
      const t = this.selectedTower;
      if (!t) return;
      const refund = O.Upgrades.refundValue(t);
      this.cash += refund;
      this.flashMessage('+$' + refund, '#7ae0ff');
      this.towers = this.towers.filter(o => o !== t);
      this.selectedTower = null;
      this.sfx.play('pop');
    }

    fireAbility(id) {
      const t = this.selectedTower;
      if (!t) return;
      if (!t.abilityIds || (t.abilityIds.A !== id && t.abilityIds.B !== id)) return;
      const def = O.Abilities.get(id);
      if (!def) return;
      if ((t.abilityCDs[id] || 0) > 0) {
        this.flashMessage('On cooldown', '#7c87a6');
        return;
      }
      def.activate(this, t);
      t.abilityCDs[id] = def.cd;
    }

    // -------------------------------------------------------------
    //  WAVE / ROUND
    // -------------------------------------------------------------
    startWave() {
      if (this.state2 !== 'build') return;
      if (this.round >= this.maxRound) return;
      this.round++;
      this.state2 = 'wave';
      this.waveTimer = 0;
      this.leakedThisRound = false;
      this.longestCombo = 0;
      this._comboCount = 0;
      this._comboT = 0;
      // Build spawn queue
      const groups = O.Rounds.get(this.round);
      this.spawnQueue = [];
      let lastEndT = 0;
      for (const g of groups) {
        const start = lastEndT + (g.delay || 0);
        for (let i = 0; i < g.count; i++) {
          this.spawnQueue.push({ tier: g.tier, mods: g.mods || [], t: start + i * (g.gap || 0.5) });
        }
        lastEndT = start + (g.count - 1) * (g.gap || 0.5);
      }
      this.spawnQueue.sort((a, b) => a.t - b.t);
      // Quant interest at wave start
      const quants = this.towers.filter(t => t.key === 'quant');
      const interest = O.Economy.applyInterest(quants, this.cash);
      if (interest > 0) {
        this.cash += interest;
        this.flashMessage('+$' + interest + ' INTEREST', '#4ade80');
      }
      this.sfx.play('wave');
      const act = O.Rounds.actFor(this.round);
      this.flashMessage('ROUND ' + this.round, act ? act.color : '#ffd86b');
    }

    onRoundClear() {
      const breakdown = O.Economy.roundBonusBreakdown({
        round: this.round,
        leakedThisRound: this.leakedThisRound,
        noLeakStreak: this.noLeakStreak,
        longestCombo: this.longestCombo
      });
      this.cash += breakdown.total;
      this.addScore(100 + this.round * 25);
      this.roundsClearedThisRun++;
      if (!this.leakedThisRound) this.noLeakStreak++; else this.noLeakStreak = 0;
      O.UI.Recap.show(breakdown, {
        color: this.leakedThisRound ? '#ff9055' : '#4ade80',
        header: this.leakedThisRound ? 'WAVE BONUS' : 'PERFECT WAVE'
      });
      this._cashFlash = 1.0;
      // Persist round-clear high-water mark + emit unlock toast for any
      // tower whose unlock threshold matches this newly cleared round.
      const prevBest = this.bestRound | 0;
      if (this.round > prevBest) this.bestRound = this.round;
      if (O.Persist) O.Persist.recordRoundClear(this.round);
      const unlockedNames = [];
      for (const k of O.Towers.keys()) {
        const ur = O.Towers.unlockRound(k);
        if (ur > prevBest && ur <= this.bestRound) {
          unlockedNames.push(O.Towers.base(k).short || O.Towers.base(k).name);
        }
      }
      if (unlockedNames.length) {
        this.unlockToast = { text: unlockedNames.join(' · '), t: 4.0 };
        this.flashMessage('UNLOCKED: ' + unlockedNames.join(', '), '#4ade80');
        if (this.sfx) this.sfx.play('win');
      }
      // Stardust accrues from score earned this run; recompute total.
      const s = O.Economy.stardustFromScore(this.score);
      this.runStardust = s;
      if (this.round >= this.maxRound) {
        this.sfx.play('win');
        this.flash('#7ae0ff', 0.4);
        if (O.Persist) {
          O.Persist.recordRunEnd(this.round);
          O.Persist.addStardust(this.runStardust);
        }
        this.victoryAchieved = true;
        this.win();
      }
    }

    flashMessage(text, color) {
      this.messages.push({ text, t: 1.6, color: color || '#fff' });
      if (this.messages.length > 3) this.messages.shift();
    }

    spendCash(amt) {
      this.cash = Math.max(0, this.cash - amt);
    }

    spawnFloater(x, y, text, color) {
      this.floaters.push({ x, y, vy: -22, t: 0.9, text, color: color || '#ffd86b' });
      if (this.floaters.length > 30) this.floaters.shift();
    }

    toggleSpeed() {
      this.gameSpeed = this.gameSpeed === 1 ? 2 : 1;
      this.flashMessage('SPEED ' + this.gameSpeed + '×', '#ffd86b');
      this.sfx.play('place');
    }

    // -------------------------------------------------------------
    //  ENEMY SPAWN / DAMAGE
    // -------------------------------------------------------------
    spawnEnemy(tier, mods) {
      const spec = O.Enemies.get(tier);
      if (!spec) return null;
      const e = {
        tier, spec, mods: (mods || []).slice(),
        hp: spec.hp, maxHp: spec.hp,
        speed: spec.speed,
        size: spec.size,
        pathS: 0,
        x: PATH_SAMPLES[0].x, y: PATH_SAMPLES[0].y,
        angle: 0, rotSpin: (Math.random() - 0.5) * 2,
        slow: 0, chillT: 0, chillAmount: 0,
        burn: 0, burnDuration: 0,
        stunUntil: 0,
        brittleT: 0, brittleMul: 1,
        lastDamagedT: -999, spawnT: this.time,
        boss: !!spec.boss, _summonT: 0,
        _bountyMul: 1
      };
      O.EnemyMods.applyAll(e, e.mods);
      if (spec.boss) e.boss = true;
      this.enemies.push(e);
      return e;
    }

    damage(e, amount, source) {
      if (!e || e.dead) return 0;
      const mul = O.EnemyMods.damageMul(e, source);
      let final = amount * mul;
      // Brittle: cryo's brittle window multiplies subsequent damage
      if (e.brittleT > 0) final *= e.brittleMul || 1;
      // Sniper anti-armor doubling
      if (source === 'sniper-armor' && e.armored) final *= 2;
      e.hp -= final;
      e.lastDamagedT = this.time;
      return final;
    }

    // -------------------------------------------------------------
    //  PER-FRAME UPDATE
    // -------------------------------------------------------------
    update(dt) {
      const rdt = dt;
      const sdt = dt * this.gameSpeed;
      this.time += 0; // BaseGame already increments in its outer loop

      // mouse position (UI uses raw real-time)
      this._mx = Input.mouse.x; this._my = Input.mouse.y;
      O.UI.SidePanel.handleHover(this._mx, this._my, this);

      // Star twinkle
      for (const s of this.starField) s.tw += rdt * 2;

      // Real-time UI elements
      for (const m of this.messages) m.t -= rdt;
      this.messages = this.messages.filter(m => m.t > 0);
      for (const f of this.floaters) { f.t -= rdt; f.y += f.vy * rdt; }
      this.floaters = this.floaters.filter(f => f.t > 0);
      this._cashFlash = Math.max(0, this._cashFlash - rdt * 1.5);
      if (this.unlockToast) {
        this.unlockToast.t -= rdt;
        if (this.unlockToast.t <= 0) this.unlockToast = null;
      }
      O.UI.Recap.tick(rdt);

      // Insider Trading global timer (real-time)
      if (this.insiderTradingT > 0) this.insiderTradingT = Math.max(0, this.insiderTradingT - rdt);

      // Wave spawning
      if (this.state2 === 'wave') {
        this.waveTimer += sdt;
        while (this.spawnQueue.length && this.spawnQueue[0].t <= this.waveTimer) {
          const s = this.spawnQueue.shift();
          this.spawnEnemy(s.tier, s.mods);
        }
      }

      // Enemies
      for (const e of this.enemies) this.updateEnemy(e, sdt);
      // Towers
      for (const t of this.towers) this.updateTower(t, sdt);
      // Projectiles
      for (const p of this.projectiles) this.updateProjectile(p, sdt);
      this.projectiles = this.projectiles.filter(p => !p.dead);
      // Cull / bounty
      this.cullEnemies();
      // Wave end
      if (this.state2 === 'wave' && this.spawnQueue.length === 0 && this.enemies.length === 0) {
        this.state2 = 'build';
        this.onRoundClear();
        if (this.round < this.maxRound) this.flashMessage('Round clear', '#7ae0ff');
      }
      // Lives out
      if (this.lives <= 0 && this.state !== 'over') {
        this.lives = 0;
        if (O.Persist) {
          O.Persist.recordRunEnd(this.round);
          O.Persist.addStardust(this.runStardust);
        }
        this.sfx.play('lose');
        this.gameOver();
      }
      // Hover preview
      this.hoverPlace = null;
      if (this.placeKey && this._mx < this.playW) {
        this.hoverPlace = { x: this._mx, y: this._my, valid: this.canPlaceAt(this._mx, this._my) };
      }
      // Click input
      if (Input.mouse.justPressed) this.handleClick(this._mx, this._my);
      // Right click cancel
      if (Input.keys && (Input.keys['Escape'] || Input.keys['escape'])) {
        if (this.placeKey) this.placeKey = null;
        else this.selectedTower = null;
      }
      // Hotkeys: 1..9, 0 → tower buy
      if (Input.keys) {
        for (const k of Object.keys(this._hotkeys)) {
          const wasHeld = this['_hk' + k];
          if (Input.keys[k]) {
            if (!wasHeld) {
              this['_hk' + k] = true;
              const key = this._hotkeys[k];
              const def = O.Towers.get(key).base;
              if (!this.isTowerUnlocked(key)) {
                const ur = O.Towers.unlockRound(key);
                this.flashMessage('Locked — clear round ' + ur, '#ff5566');
              } else if (this.cash >= def.cost) {
                this.placeKey = key; this.selectedTower = null;
              } else this.flashMessage('Not enough cash', '#ff5566');
            }
          } else this['_hk' + k] = false;
        }
        // Space = start wave
        if (Input.keys[' ']) {
          if (!this._spaceHeld) {
            this._spaceHeld = true;
            if (this.state2 === 'build') this.startWave();
          }
        } else this._spaceHeld = false;
        // F = speed toggle
        if (Input.keys['f'] || Input.keys['F']) {
          if (!this.speedHeld) { this.speedHeld = true; this.toggleSpeed(); }
        } else this.speedHeld = false;
        // T = cycle target on selected tower
        if (Input.keys['t'] || Input.keys['T']) {
          if (!this._tHeld) {
            this._tHeld = true;
            if (this.selectedTower) {
              this.selectedTower.priority = O.Targeting.next(this.selectedTower.priority);
            }
          }
        } else this._tHeld = false;
        // Q / E = abilities A / B on selected tower
        if (Input.keys['q'] || Input.keys['Q']) {
          if (!this._qHeld) {
            this._qHeld = true;
            if (this.selectedTower && this.selectedTower.abilityIds.A) {
              this.fireAbility(this.selectedTower.abilityIds.A);
            }
          }
        } else this._qHeld = false;
        if (Input.keys['e'] || Input.keys['E']) {
          if (!this._eHeld) {
            this._eHeld = true;
            if (this.selectedTower && this.selectedTower.abilityIds.B) {
              this.fireAbility(this.selectedTower.abilityIds.B);
            }
          }
        } else this._eHeld = false;
      }
      // Track cash gain pulse
      if (this.cash > this._lastCash) this._cashFlash = 1.0;
      this._lastCash = this.cash;
      // Combo tracking decay
      if (this._comboT > 0) {
        this._comboT -= rdt;
        if (this._comboT <= 0) {
          if (this._comboCount > this.longestCombo) this.longestCombo = this._comboCount;
          this._comboCount = 0;
        }
      }
    }

    // -------------------------------------------------------------
    //  ENEMY MOVEMENT
    // -------------------------------------------------------------
    updateEnemy(e, dt) {
      // Stun / chill / chrono
      let dtScale = 1;
      if (this.time < e.stunUntil) dtScale = 0;
      // Chrono / Cryo chill apply additively-clamped slow
      let slowAmt = e.slow;
      if (e.chillT > 0) slowAmt = Math.max(slowAmt, e.chillAmount || 0);
      // Aura towers: chrono dilation, gravity, support
      for (const t of this.towers) {
        const s = t.stats;
        if (t.key === 'chrono') {
          const d2 = (t.x - e.x) ** 2 + (t.y - e.y) ** 2;
          if (d2 <= s.range * s.range) {
            slowAmt = Math.max(slowAmt, s.timeSlow || 0);
            // Entry stun (only fires once per pass)
            if ((s.entryStun || 0) > 0 && !e._chronoEntryT) {
              e._chronoEntryT = this.time;
              e.stunUntil = Math.max(e.stunUntil, this.time + s.entryStun);
            }
          } else if (e._chronoEntryT && (this.time - e._chronoEntryT) > 1) {
            e._chronoEntryT = 0; // can re-enter for re-stun
          }
          // Chronosphere ability: replaces the slow with much heavier multiplier
          if (t.abilityFx.chronosphere && d2 <= s.range * s.range) {
            slowAmt = Math.max(slowAmt, 0.85);
          }
        }
      }
      // Time stop ability on a gravity tower
      for (const t of this.towers) {
        if (t.key === 'gravity' && t.abilityFx.timeStop) {
          const d2 = (t.x - e.x) ** 2 + (t.y - e.y) ** 2;
          if (d2 <= t.stats.range * t.stats.range) slowAmt = Math.max(slowAmt, 0.95);
        }
      }
      slowAmt = Math.min(0.95, slowAmt);
      const moveDt = dt * dtScale * (1 - slowAmt);

      e.pathS += e.speed * moveDt;
      const p = pointAt(e.pathS);
      e.x = p.x; e.y = p.y; e.angle = p.angle;
      // Decays
      e.slow = Math.max(0, e.slow - dt * 0.6);
      if (e.chillT > 0) e.chillT = Math.max(0, e.chillT - dt);
      if (e.brittleT > 0) e.brittleT = Math.max(0, e.brittleT - dt);
      if (e.burn > 0 && e.burnDuration > 0) {
        e.hp -= e.burn * dt;
        e.burnDuration -= dt;
        if (e.burnDuration <= 0) e.burn = 0;
      }
      // Mod ticks (regen, etc.)
      O.EnemyMods.tickAll(e, dt, this);
      // Summoner spawning
      if (e.spec.summon) {
        e._summonT = (e._summonT || 0) + dt;
        if (e._summonT >= e.spec.summon.every) {
          e._summonT = 0;
          for (let i = 0; i < e.spec.summon.count; i++) {
            const child = this.spawnEnemy(e.spec.summon.type, []);
            if (child) {
              child.pathS = Math.max(0, e.pathS - 30 - i * 20);
            }
          }
        }
      }
      // Path complete -> leak
      if (p.done) {
        this.lives -= e.spec.dmg || 1;
        this.shake(6, 0.2); this.flash('#ff5566', 0.08);
        this.sfx.play('boom');
        e.dead = true;
        e.leaked = true;
        this.leakedThisRound = true;
      }
    }

    // -------------------------------------------------------------
    //  TOWER UPDATE
    // -------------------------------------------------------------
    buffsForTower(t) {
      // Sum support resonance + chrono buff. Apply XP scaling.
      const lvlMul = O.XP.statMul(t.level || 1);
      let fireMul = lvlMul.rate;
      let dmgMul  = lvlMul.dmg;
      let rangeMul = lvlMul.range;
      for (const s of this.towers) {
        if (s === t) continue;
        const d = Math.hypot(s.x - t.x, s.y - t.y);
        if (s.key === 'support') {
          const r = (s.stats.range || 0) * (1 + (s.stats.buffRange || 0));
          if (d <= r) {
            fireMul *= 1 + (s.stats.buffFire || 0);
            dmgMul  *= 1 + (s.stats.buffDmg  || 0);
            if (s.stats.buffRange) rangeMul *= 1 + s.stats.buffRange;
            if (s.abilityFx.overclock) { fireMul *= 2; }
          }
        }
        if (s.key === 'chrono') {
          if (d <= s.stats.range) {
            fireMul *= 1 + (s.stats.towerBuffFire || 0);
            dmgMul  *= 1 + (s.stats.towerBuffDmg  || 0);
            if (s.abilityFx.chronosphere) fireMul *= 3;
          }
        }
      }
      return { fireMul, dmgMul, rangeMul };
    }

    findTarget(t) {
      const visibleFilter = (e) => O.EnemyMods.isVisibleTo(e, t);
      return O.Targeting.pickTarget(t, this.enemies, { filter: visibleFilter });
    }

    updateTower(t, dt) {
      const st = t.stats;
      if (t.recoil) t.recoil = Math.max(0, t.recoil - dt * 5);
      if (t._xpFlash) t._xpFlash = Math.max(0, t._xpFlash - dt * 1.2);
      if (t._dividendPulse) t._dividendPulse = Math.max(0, t._dividendPulse - dt);
      if (t._pulseAnim) t._pulseAnim = Math.max(0, t._pulseAnim - dt);
      if (t._collapseAnim) t._collapseAnim = Math.max(0, t._collapseAnim - dt);
      if (t._arcAnim) t._arcAnim = Math.max(0, t._arcAnim - dt);
      // Ability cooldowns / per-frame ability ticks
      for (const id of Object.keys(t.abilityCDs || {})) {
        if (t.abilityCDs[id] > 0) t.abilityCDs[id] = Math.max(0, t.abilityCDs[id] - dt);
      }
      for (const slot of ['A','B']) {
        const id = t.abilityIds && t.abilityIds[slot];
        if (!id) continue;
        const def = O.Abilities.get(id);
        if (def && def.tick) def.tick(this, t, dt);
      }
      const buffs = this.buffsForTower(t);
      const target = this.findTarget(t);
      t.target = target;
      if (target && !SYMMETRIC.has(t.key)) {
        t.angle = Math.atan2(target.y - t.y, target.x - t.x);
      }

      switch (t.key) {
        case 'dart':
        case 'cannon':
        case 'missile':
        case 'sniper':
        case 'engineer':
        case 'cryo':
        case 'mortar':
        case 'crystal':
          this._updateGunTower(t, target, buffs, dt);
          if (t.key === 'engineer') this._updateMineDropper(t, dt);
          break;
        case 'tesla':
          this._updateTesla(t, target, buffs, dt);
          break;
        case 'beam':
          this._updateBeam(t, target, buffs, dt);
          break;
        case 'gravity':
          this._updateGravity(t, buffs, dt);
          break;
        case 'flare':
          this._updateFlare(t, buffs, dt);
          break;
        case 'sing':
          this._updateSing(t, dt);
          break;
        case 'support':
        case 'quant':
        case 'chrono':
          // Pure aura — no firing logic. Quant & support special handled
          // elsewhere (cull-time + wave-start).
          t._pulse = (t._pulse || 0) + dt;
          break;
      }
    }

    _updateGunTower(t, target, buffs, dt) {
      const st = t.stats;
      if (!target) { t.cd = Math.max(0, (t.cd || 0) - dt); return; }
      t.cd = (t.cd || 0) - dt;
      let rateMul = buffs.fireMul;
      // Rapid Strike ability multiplier
      const rsId = t.abilityIds && (t.abilityIds.A === 'rapidStrike' ? 'rapidStrike' :
                                    t.abilityIds.B === 'rapidStrike' ? 'rapidStrike' : null);
      if (rsId) {
        const fn = O.Abilities.get(rsId).multiplier;
        if (fn) rateMul *= fn(t);
      }
      // Heat Storm forces fast pulses (handled in flare branch — gun tower path skipped here)
      if (t.cd <= 0 && st.fireRate > 0) {
        const shots = Math.max(1, st.multiShot || 1);
        const spread = st.spread || 0;
        for (let i = 0; i < shots; i++) {
          const offset = shots === 1 ? 0 : (i - (shots - 1) / 2) * spread / Math.max(1, shots - 1);
          this.fireProjectile(t, target, buffs, offset);
        }
        t.cd = 1 / Math.max(0.05, st.fireRate * rateMul);
        t.recoil = 1.0;
        const sfx = (t.key === 'missile') ? 'boom' : 'laser';
        this.sfx.play(sfx);
        const fx = t.x + Math.cos(t.angle) * 16;
        const fy = t.y + Math.sin(t.angle) * 16;
        this.particles.burst(fx, fy, t.key === 'missile' ? 12 : 6, {
          color: t.key === 'missile' ? '#ff8040' : st.color,
          speed: 60, life: 0.2, size: 2
        });
      }
    }

    _updateMineDropper(t, dt) {
      const st = t.stats;
      if (!st.mineDrops) return;
      t._mineCd = (t._mineCd || 0) - dt;
      if (t._mineCd > 0) return;
      t._mineCd = st.mineCD || 6;
      // Find a path point near the tower's range, ahead of leading enemy
      const range = st.range || 110;
      // Pick a sample point on the path that is within range and ahead
      let bestSample = null;
      let bestS = -1;
      for (const e of this.enemies) {
        if (e.pathS > bestS) { bestS = e.pathS; }
      }
      const dropS = bestS + 20;
      const pp = pointAt(dropS);
      const d = Math.hypot(pp.x - t.x, pp.y - t.y);
      if (d > range) return; // wait until enemies are reachable
      const count = st.minePerDrop || 1;
      for (let i = 0; i < count; i++) {
        const offset = (i - (count - 1) / 2) * 18;
        const off = pointAt(dropS + offset);
        this.projectiles.push({
          kind: 'mine', x: off.x, y: off.y, vx: 0, vy: 0, speed: 0,
          dmg: st.mineDmg, splash: st.mineRadius, life: 30, hit: new Set(),
          fromTower: t, isMine: true, settle: 0
        });
      }
    }

    _updateTesla(t, target, buffs, dt) {
      const st = t.stats;
      // Capacitor charging
      if (st.capacitor) {
        t.capacitorStored = Math.min(st.capacitor.max,
          (t.capacitorStored || 0) + st.capacitor.rate * dt);
      }
      if (!target) { t.cd = Math.max(0, (t.cd || 0) - dt); return; }
      t.cd = (t.cd || 0) - dt;
      if (t.cd <= 0) {
        t.cd = 1 / Math.max(0.05, st.fireRate * buffs.fireMul);
        t._arcAnim = 0.35;
        t._arcTargets = [];
        let current = target;
        let count = 0;
        const hit = new Set();
        const maxChain = t.abilityFx.staticSurge ? this.enemies.length : (st.chainCount || 3);
        while (current && count < maxChain) {
          this.damage(current, (st.chainDmg || 8) * buffs.dmgMul, 'tesla');
          O.XP.grant(t, st.chainDmg);
          t._arcTargets.push({ x: current.x, y: current.y });
          hit.add(current);
          let nearest = null, nd = st.chainRadius || 70;
          for (const e of this.enemies) {
            if (hit.has(e)) continue;
            if (!O.EnemyMods.isVisibleTo(e, t)) continue;
            const d = Math.hypot(e.x - current.x, e.y - current.y);
            if (d < nd) { nd = d; nearest = e; }
          }
          current = nearest;
          count++;
        }
        this.sfx.play('laser');
      }
    }

    _updateBeam(t, target, buffs, dt) {
      const st = t.stats;
      t.beamTarget = target;
      if (!target) { t._focusT = 0; return; }
      let dps = (st.beamDps || 32);
      const ab = t.abilityIds && (t.abilityIds.A === 'spectrumBurst' ? 'spectrumBurst' :
                                  t.abilityIds.B === 'spectrumBurst' ? 'spectrumBurst' : null);
      if (ab) { const fn = O.Abilities.get(ab).multiplier; if (fn) dps *= fn(t); }
      if (st.focusBuildup) {
        t._focusT = (t._focusTarget === target) ? (t._focusT + dt) : 0;
        t._focusTarget = target;
        const mul = Math.min(3, 1 + t._focusT * 0.5);
        dps *= mul;
      }
      const dmg = dps * buffs.dmgMul * dt;
      this.damage(target, dmg, 'beam');
      O.XP.grant(t, dmg * 0.6);
      // Chains
      if (st.chain && st.chain > 0) {
        let last = target;
        const hit = new Set([target]);
        for (let c = 0; c < st.chain; c++) {
          let near = null, nd = 90;
          for (const e of this.enemies) {
            if (hit.has(e)) continue;
            const d = Math.hypot(e.x - last.x, e.y - last.y);
            if (d < nd) { nd = d; near = e; }
          }
          if (!near) break;
          this.damage(near, dmg * 0.6, 'beam');
          hit.add(near);
          last = near;
          t.beamChain = near;
        }
      } else {
        t.beamChain = null;
      }
      // Solar Lance ability: instakill non-bosses on direct hit
      if (t.abilityFx.solarLance && !target.boss) {
        this.damage(target, 9999, 'beam');
      }
    }

    _updateGravity(t, buffs, dt) {
      const st = t.stats;
      for (const e of this.enemies) {
        const d = Math.hypot(e.x - t.x, e.y - t.y);
        if (d > st.range) continue;
        e.slow = Math.max(e.slow, st.slow || 0.5);
        if (st.pullDps) {
          this.damage(e, st.pullDps * buffs.dmgMul * dt, 'gravity');
          O.XP.grant(t, st.pullDps * dt * 0.5);
        }
        if (st.stunPulse) {
          // pulse stuns
          t._stunCd = (t._stunCd || 0) - dt;
          if (t._stunCd <= 0) {
            t._stunCd = st.stunPulse.every;
            for (const e2 of this.enemies) {
              if (Math.hypot(e2.x - t.x, e2.y - t.y) > st.range) continue;
              if (e2.spec.stunResist && !st.stunPulse.evenUfo) continue;
              e2.stunUntil = Math.max(e2.stunUntil || 0, this.time + st.stunPulse.dur);
            }
          }
          break; // don't double-process stunCd
        }
      }
    }

    _updateFlare(t, buffs, dt) {
      const st = t.stats;
      // Lance mode (B path)
      if (st.lance) {
        const cone = st.lance.cone, dps = st.lance.dps;
        // Sweep angle slowly
        t._sweep = ((t._sweep || 0) + dt * 1.4) % (Math.PI * 2);
        const aim = t._sweep;
        for (const e of this.enemies) {
          const d = Math.hypot(e.x - t.x, e.y - t.y);
          if (d > st.range) continue;
          const ang = Math.atan2(e.y - t.y, e.x - t.x);
          let da = Math.abs(ang - aim);
          if (da > Math.PI) da = Math.PI * 2 - da;
          if (da <= cone / 2) {
            const amount = dps * buffs.dmgMul * dt;
            this.damage(e, amount, 'flare');
            if (st.burnDps) { e.burn = Math.max(e.burn, st.burnDps); e.burnDuration = 2; }
            O.XP.grant(t, amount * 0.4);
          }
        }
        t._lanceAim = aim;
        return;
      }
      t.pulseCd = (t.pulseCd || st.pulseCD) - dt;
      if (t.pulseCd <= 0) {
        t.pulseCd = (st.pulseCD || 3) / buffs.fireMul;
        t._pulseAnim = 0.6;
        this.shake(3, 0.1);
        this.sfx.play('boom');
        for (const e of this.enemies) {
          const d = Math.hypot(e.x - t.x, e.y - t.y);
          if (d <= st.range) {
            const dmg = (st.pulseDmg || 22) * buffs.dmgMul;
            this.damage(e, dmg, 'flare');
            O.XP.grant(t, dmg * 0.5);
            if (st.burnDps) {
              e.burn = Math.max(e.burn, st.burnDps);
              e.burnDuration = st.burnLong ? 4 : 2;
            }
            this.particles.burst(e.x, e.y, 4, { color: '#ffd86b', speed: 80, life: 0.3 });
          }
        }
      }
    }

    _updateSing(t, dt) {
      const st = t.stats;
      t.collapseCd = (t.collapseCd || st.collapseCD) - dt;
      if (t.collapseCd <= 0) {
        t.collapseCd = st.collapseCD;
        t._collapseAnim = 0.9;
        this.shake(10, 0.4); this.flash('#a070ff', 0.15);
        this.sfx.play('sing');
        for (const e of this.enemies) {
          const d = Math.hypot(e.x - t.x, e.y - t.y);
          if (d <= st.collapseRadius) {
            if (e.boss) {
              this.damage(e, st.bossDmg || 400, 'sing');
            } else {
              e.hp = 0;
            }
            this.particles.burst(e.x, e.y, 12, { color: '#a070ff', speed: 220, life: 0.7 });
          }
        }
      }
    }

    // -------------------------------------------------------------
    //  PROJECTILES
    // -------------------------------------------------------------
    fireProjectile(t, target, buffs, angOffset) {
      const st = t.stats;
      const baseAng = Math.atan2(target.y - t.y, target.x - t.x);
      const ang = baseAng + (angOffset || 0);
      const dmgMul = (buffs && buffs.dmgMul) || 1;
      let dmg = (st.dmg || 0) * dmgMul;
      // Precise Shot consumes one shot for x4 dmg
      if (t.abilityFx && t.abilityFx.preciseShot) {
        dmg *= 4;
        t.abilityFx.preciseShot = 0;
        this.spawnFloater(t.x, t.y - 22, 'PRECISE!', '#7ae0ff');
      }
      const speed = st.projSpeed || 520;
      const isHoming = st.proj === 'homing';
      const isFrost = (st.proj === 'frost' || st.proj === 'frost-shatter');
      const isRail = st.proj === 'rail';
      // Sniper: instant rail; immediately resolve damage on target.
      if (isRail) {
        const realDmg = dmg * (st.antiArmorDmg && target.armored ? st.antiArmorDmg : 1);
        const dealt = this.damage(target, realDmg, 'sniper');
        // Tag target
        if (st.tagging) {
          target._tagged = { mul: st.tagging.mul, until: this.time + st.tagging.dur };
        }
        // Spotter buff for Recon path
        if (st.spotterBuff && target.hp <= 0) {
          this.spawnFloater(target.x, target.y - 30, '+spot', '#7ae0ff');
        }
        O.XP.grant(t, dealt);
        // Visual rail line
        this.projectiles.push({
          kind: 'rail-fx', x: t.x, y: t.y, ex: target.x, ey: target.y,
          life: 0.18, dead: false, isFx: true
        });
        return;
      }
      this.projectiles.push({
        kind: t.key,
        x: t.x + Math.cos(ang) * 14,
        y: t.y + Math.sin(ang) * 14,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        speed: speed,
        dmg: dmg,
        splash: st.splash || 0,
        pierce: st.pierce || 1,
        homing: isHoming,
        target: isHoming ? target : null,
        homingTurn: st.homingTurn || 4,
        hit: new Set(),
        life: 3.5,
        fromTower: t,
        proj: st.proj,
        fragments: st.fragments || 0,
        fragDmg: st.fragDmg || 0,
        splashFreeze: st.splashFreeze || 0,
        brittleMul: st.brittleMul || 1,
        freezeAmount: st.freezeAmount || 0,
        freezeDuration: st.freezeDuration || 0,
        freezeStunChance: st.freezeStunChance || 0,
        antiArmor: !!st.antiArmor
      });
    }

    updateProjectile(p, dt) {
      if (p.isFx) {
        p.life -= dt;
        if (p.life <= 0) p.dead = true;
        return;
      }
      p.life -= dt;
      if (p.life <= 0) { p.dead = true; return; }
      // Mines: stationary, trigger when enemy enters
      if (p.isMine) {
        p.settle = Math.min(1, (p.settle || 0) + dt * 4);
        for (const e of this.enemies) {
          const d = Math.hypot(e.x - p.x, e.y - p.y);
          if (d < e.size * 0.4) {
            // detonate
            for (const e2 of this.enemies) {
              const d2 = Math.hypot(e2.x - p.x, e2.y - p.y);
              if (d2 <= p.splash) {
                this.damage(e2, p.dmg * (1 - d2 / p.splash * 0.5), 'cannon');
              }
            }
            this.particles.burst(p.x, p.y, 24, { color: '#ffd86b', speed: 220, life: 0.5 });
            this.shake(5, 0.2);
            this.sfx.play('boom');
            p.dead = true;
            return;
          }
        }
        return;
      }
      // Homing
      if (p.homing) {
        if (p.target && (p.target.dead || p.target.hp <= 0)) p.target = null;
        if (!p.target) {
          let best = null, bd = 1e9;
          for (const e of this.enemies) {
            const d = Math.hypot(e.x - p.x, e.y - p.y);
            if (d < bd) { bd = d; best = e; }
          }
          p.target = best;
        }
        if (p.target) {
          const desired = Math.atan2(p.target.y - p.y, p.target.x - p.x);
          const cur = Math.atan2(p.vy, p.vx);
          let da = desired - cur;
          while (da > Math.PI) da -= Math.PI * 2;
          while (da < -Math.PI) da += Math.PI * 2;
          const turnRate = (p.homingTurn || 4) * dt;
          const ang = cur + Math.max(-turnRate, Math.min(turnRate, da));
          p.vx = Math.cos(ang) * p.speed;
          p.vy = Math.sin(ang) * p.speed;
        }
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.x < -20 || p.x > PLAY_W + 20 || p.y < -20 || p.y > H + 20) {
        p.dead = true; return;
      }
      // Hit checks
      for (const e of this.enemies) {
        if (p.hit.has(e)) continue;
        if (!O.EnemyMods.isVisibleTo(e, p.fromTower)) continue;
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d < e.size * 0.5) {
          this._projHit(p, e);
          if (p.hit.size >= p.pierce) { p.dead = true; return; }
        }
      }
    }

    _projHit(p, e) {
      let source = p.kind;
      if (p.proj === 'frost') source = 'cryo';
      if (p.proj === 'frost-shatter') source = 'cryo-shatter';
      if (p.antiArmor && e.armored) source = 'sniper-armor';
      const dealt = this.damage(e, p.dmg, source);
      p.hit.add(e);
      if (p.fromTower) O.XP.grant(p.fromTower, dealt);
      this.particles.burst(p.x, p.y, 3, { color: '#fff', speed: 60, life: 0.2 });
      // Frost effects
      if (p.freezeAmount) {
        e.chillT = Math.max(e.chillT, p.freezeDuration || 1.5);
        e.chillAmount = Math.max(e.chillAmount, p.freezeAmount);
        if (p.brittleMul && p.brittleMul > 1) {
          e.brittleT = Math.max(e.brittleT, 1.5);
          e.brittleMul = Math.max(e.brittleMul, p.brittleMul);
        }
        if (p.freezeStunChance && Math.random() < p.freezeStunChance) {
          e.stunUntil = Math.max(e.stunUntil, this.time + 1);
        }
      }
      // Splash
      if (p.splash > 0) {
        for (const e2 of this.enemies) {
          if (e2 === e) continue;
          const d2 = Math.hypot(e2.x - p.x, e2.y - p.y);
          if (d2 < p.splash) {
            const splashDmg = p.dmg * (1 - d2 / p.splash);
            this.damage(e2, splashDmg, source);
            if (p.splashFreeze) {
              e2.chillT = Math.max(e2.chillT, 1.5);
              e2.chillAmount = Math.max(e2.chillAmount, p.splashFreeze);
            }
          }
        }
        this.particles.burst(p.x, p.y, 16, { color: source === 'cryo-shatter' ? '#a8e8ff' : '#ffb347', speed: 180, life: 0.5 });
        this.shake(4, 0.15);
      }
      // Fragments (cluster shrapnel)
      if (p.fragments && p.fragments > 0) {
        for (let i = 0; i < p.fragments; i++) {
          const a = (i / p.fragments) * Math.PI * 2;
          this.projectiles.push({
            kind: 'cannon', x: p.x, y: p.y,
            vx: Math.cos(a) * 320, vy: Math.sin(a) * 320, speed: 320,
            dmg: p.fragDmg, splash: 18, pierce: 1, hit: new Set(), life: 0.5,
            fromTower: p.fromTower, proj: 'plasma'
          });
        }
      }
    }

    // -------------------------------------------------------------
    //  CULL / BOUNTY
    // -------------------------------------------------------------
    cullEnemies() {
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (e.hp <= 0) {
          e.dead = true;
          if (e.leaked) continue;
          // Bounty calc: base * mod-mul * (1 + quant aura) * (1 + insider) * (1 + worldHedge)
          let totalMul = O.EnemyMods.bountyMul(e);
          // Quant aura (in-range)
          const aura = O.Economy.applyBountyAura(e, this.towers);
          totalMul *= 1 + aura.mult;
          // Quant world bounty (every quant w/ worldBountyMult)
          let worldMul = 0;
          for (const t of this.towers) {
            if (t.key === 'quant' && t.stats.worldBountyMult) worldMul += t.stats.worldBountyMult;
          }
          totalMul *= 1 + worldMul;
          // Insider Trading global window
          if (this.insiderTradingT > 0) totalMul *= 3;
          const baseBounty = e.spec.bounty;
          const bounty = Math.round(baseBounty * totalMul);
          this.cash += bounty;
          if (bounty > baseBounty) this._cashFlash = 1.0;
          this.addScore(bounty * 5);
          if (totalMul > 1) {
            this.spawnFloater(e.x, e.y - e.size * 0.5,
              '+$' + (bounty - baseBounty), '#ffd86b');
          }
          // Combo
          this._comboCount++;
          this._comboT = 0.8;
          if (this._comboCount > this.longestCombo) this.longestCombo = this._comboCount;
          this.particles.burst(e.x, e.y, 14, { color: e.spec.color, speed: 160, life: 0.5 });
          this.sfx.play('pop');
          // Big-asteroid split (drone children)
          if (e.spec.onDie === 'splitDrones2') {
            for (let k = 0; k < 2; k++) {
              const child = this.spawnEnemy('drone', []);
              if (child) {
                child.pathS = Math.max(0, e.pathS - k * 18);
                child.x = e.x; child.y = e.y;
              }
            }
          }
          if (e.boss) {
            this.shake(14, 0.6); this.flash('#ffd86b', 0.2);
            this.addScore(2500);
          }
        }
      }
      this.enemies = this.enemies.filter(e => !e.dead);
    }

    // ---- Special ability hooks called by data/abilities.js ----
    _abilityCarpetShell(t) {
      // Lobs a heavy splash shell at a leading-enemy area on the path
      let leadS = -1;
      for (const e of this.enemies) if (e.pathS > leadS) leadS = e.pathS;
      const drop = pointAt(Math.max(0, leadS + (Math.random() - 0.3) * 60));
      // Spawn an explosion AoE directly
      const dmg = (t.stats.dmg || 30) * 1.5;
      for (const e of this.enemies) {
        const d = Math.hypot(e.x - drop.x, e.y - drop.y);
        if (d < 80) this.damage(e, dmg * (1 - d / 80), 'cannon');
      }
      this.particles.burst(drop.x, drop.y, 30, { color: '#ff5530', speed: 240, life: 0.6 });
      this.shake(6, 0.3);
    }
    _abilityScatter(t, count, spread) {
      const target = this.findTarget(t);
      if (!target) return;
      for (let i = 0; i < count; i++) {
        const offset = (i - (count - 1) / 2) * spread / count;
        this.fireProjectile(t, target, this.buffsForTower(t), offset);
      }
    }
    _abilitySalvo(t, count) {
      const target = this.findTarget(t);
      if (!target) return;
      for (let i = 0; i < count; i++) {
        const offset = (i - (count - 1) / 2) * 0.4 / count;
        this.fireProjectile(t, target, this.buffsForTower(t), offset);
      }
    }
    _abilityICBM(t, x, y) {
      // global mega-warhead
      for (const e of this.enemies) {
        const d = Math.hypot(e.x - x, e.y - y);
        if (d < 200) this.damage(e, 800 * (1 - d / 200), 'missile');
      }
      this.particles.burst(x, y, 60, { color: '#ff6060', speed: 320, life: 0.8 });
      this.shake(12, 0.5); this.flash('#ff6060', 0.3);
    }
    _abilityLobBomb(t, x, y) {
      const shocks = (t.stats.mortarShocks || 1);
      const dmg = (t.stats.mortarDmg || 200);
      const r = (t.stats.mortarRadius || 100);
      for (let s = 0; s < shocks; s++) {
        setTimeout(() => {
          for (const e of this.enemies) {
            const d = Math.hypot(e.x - x, e.y - y);
            if (d < r) this.damage(e, dmg * (1 - d / r), 'sing');
          }
          this.particles.burst(x, y, 30, { color: '#a070ff', speed: 240, life: 0.6 });
          this.shake(8, 0.3); this.flash('#a070ff', 0.15);
        }, s * 220);
      }
    }
    _abilityDeployMines(t, count) {
      let baseS = -1;
      for (const e of this.enemies) if (e.pathS > baseS) baseS = e.pathS;
      for (let i = 0; i < count; i++) {
        const off = pointAt(Math.max(0, baseS + i * 30 - count * 5));
        this.projectiles.push({
          kind: 'mine', x: off.x, y: off.y, vx: 0, vy: 0, speed: 0,
          dmg: t.stats.mineDmg || 60, splash: t.stats.mineRadius || 80,
          life: 30, hit: new Set(), fromTower: t, isMine: true, settle: 0
        });
      }
    }
    _abilityDeployDrone(t) {
      // Spawn a friendly "drone" that auto-targets and does damage for 15s.
      const drone = {
        isDrone: true, x: t.x, y: t.y,
        vx: 0, vy: 0, life: 15, dmg: 8, fireRate: 4, _cd: 0,
        fromTower: t, dead: false
      };
      this.projectiles.push(drone);
    }

    // -------------------------------------------------------------
    //  RENDER
    // -------------------------------------------------------------
    render(ctx) {
      // Background
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#0a0522'); g.addColorStop(1, '#05071a');
      ctx.fillStyle = g; ctx.fillRect(0, 0, PLAY_W, H);
      for (const s of this.starField) {
        const b = 0.35 + (Math.sin(s.tw) + 1) * 0.3;
        ctx.fillStyle = 'rgba(255,255,255,' + b + ')';
        ctx.fillRect(s.x, s.y, s.sz, s.sz);
      }
      const rg = ctx.createRadialGradient(PLAY_W * 0.3, H * 0.3, 20, PLAY_W * 0.3, H * 0.3, PLAY_W * 0.6);
      rg.addColorStop(0, 'rgba(122,224,255,0.10)');
      rg.addColorStop(1, 'rgba(122,224,255,0)');
      ctx.fillStyle = rg; ctx.fillRect(0, 0, PLAY_W, H);
      const rg2 = ctx.createRadialGradient(PLAY_W * 0.8, H * 0.7, 20, PLAY_W * 0.8, H * 0.7, PLAY_W * 0.5);
      rg2.addColorStop(0, 'rgba(255,80,200,0.10)');
      rg2.addColorStop(1, 'rgba(255,80,200,0)');
      ctx.fillStyle = rg2; ctx.fillRect(0, 0, PLAY_W, H);

      // Path
      ctx.save();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(122,224,255,0.28)';
      ctx.lineWidth = 22;
      this._drawPath(ctx);
      ctx.strokeStyle = '#1b2b4a'; ctx.lineWidth = 16;
      this._drawPath(ctx);
      ctx.strokeStyle = '#223456'; ctx.lineWidth = 12;
      this._drawPath(ctx);
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = 'rgba(122,224,255,0.6)';
      ctx.lineWidth = 1.5;
      this._drawPath(ctx);
      ctx.setLineDash([]);
      ctx.restore();

      // Hyperspace tear
      const start = PATH_SAMPLES[0];
      const tearA = this.time * 3;
      ctx.save();
      ctx.translate(start.x, start.y);
      for (let r = 4; r < 24; r += 4) {
        ctx.strokeStyle = 'rgba(255,80,216,' + (0.6 - r * 0.02) + ')';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, r + Math.sin(tearA + r * 0.5) * 2, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();

      // Homeworld
      const end = PATH_SAMPLES[PATH_SAMPLES.length - 1];
      ctx.save();
      const hg = ctx.createRadialGradient(end.x, end.y, 4, end.x, end.y, 28);
      hg.addColorStop(0, '#ffc089'); hg.addColorStop(1, '#a54020');
      ctx.fillStyle = hg;
      ctx.beginPath(); ctx.arc(end.x, end.y, 26, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ff9055'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(end.x, end.y, 32 + Math.sin(this.time * 2) * 3, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();

      // Range indicators
      if (this.selectedTower) this._drawRange(ctx, this.selectedTower.x, this.selectedTower.y, this.selectedTower.stats.range, '#7ae0ff');
      if (this.placeKey && this.hoverPlace) {
        const def = O.Towers.get(this.placeKey).base;
        this._drawRange(ctx, this.hoverPlace.x, this.hoverPlace.y, def.range,
                        this.hoverPlace.valid ? '#7ae0ff' : '#ff5566');
      }

      // Towers
      for (const t of this.towers) this._drawTower(ctx, t);
      // Enemies
      for (const e of this.enemies) this._drawEnemy(ctx, e);
      // Projectiles
      for (const p of this.projectiles) this._drawProjectile(ctx, p);

      // Special FX layers
      this._drawTeslaArcs(ctx);
      this._drawSupportPulses(ctx);
      this._drawBeams(ctx);
      this._drawFlareLances(ctx);

      // Ghost placement
      if (this.placeKey && this.hoverPlace) {
        ctx.globalAlpha = this.hoverPlace.valid ? 0.7 : 0.4;
        const def = O.Towers.get(this.placeKey).base;
        Assets.draw(ctx, def.sprite, this.hoverPlace.x, this.hoverPlace.y, 48, 48);
        ctx.globalAlpha = 1;
      }

      // SIDE PANEL — single biggest piece of the new UI
      O.UI.SidePanel.draw(ctx, this);

      // Floaters + recap + messages
      this._drawFloaters(ctx);
      O.UI.Recap.draw(ctx, this, PLAY_W);
      this._drawMessages(ctx);

      // Insider trading marquee
      if (this.insiderTradingT > 0) {
        ctx.save();
        ctx.fillStyle = 'rgba(255,216,107,0.85)';
        ctx.font = 'bold 13px ui-monospace, monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText('INSIDER TRADING +200% bounty   ' + this.insiderTradingT.toFixed(1) + 's',
                     PLAY_W / 2, 28);
        ctx.restore();
      }
      // Tower unlock banner — pops up for ~4 seconds after a round clears
      // a new tower. Big and centered so the player can't miss it.
      if (this.unlockToast) {
        const t = this.unlockToast;
        const fade = Math.min(1, t.t / 0.5);
        const rise = Math.min(1, (4 - t.t) / 0.4);
        ctx.save();
        ctx.globalAlpha = fade;
        const cy = 110 + (1 - rise) * -20;
        ctx.fillStyle = 'rgba(8,12,28,0.92)';
        const w = 360, h = 56;
        const x = (PLAY_W - w) / 2;
        ctx.fillRect(x, cy - h / 2, w, h);
        ctx.strokeStyle = '#4ade80';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 0.5, cy - h / 2 + 0.5, w - 1, h - 1);
        ctx.fillStyle = '#4ade80';
        ctx.font = 'bold 11px ui-sans-serif, system-ui';
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText('★ NEW TOWER UNLOCKED ★', PLAY_W / 2, cy - h / 2 + 6);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 18px ui-monospace, monospace';
        ctx.textBaseline = 'bottom';
        ctx.fillText(t.text, PLAY_W / 2, cy + h / 2 - 8);
        ctx.restore();
      }
    }

    _drawPath(ctx) {
      ctx.beginPath();
      ctx.moveTo(PATH_SAMPLES[0].x, PATH_SAMPLES[0].y);
      for (let i = 1; i < PATH_SAMPLES.length; i++) {
        ctx.lineTo(PATH_SAMPLES[i].x, PATH_SAMPLES[i].y);
      }
      ctx.stroke();
    }
    _drawRange(ctx, x, y, r, color) {
      ctx.save();
      ctx.strokeStyle = color; ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]); ctx.globalAlpha = 0.7;
      const drawR = Math.min(r, 9999); // global-range towers cap
      ctx.beginPath(); ctx.arc(x, y, drawR, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.06;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(x, y, drawR, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    _drawTower(ctx, t) {
      const def = t.stats;
      const symmetric = SYMMETRIC.has(t.key);
      const rot = symmetric ? 0 : t.angle + Math.PI / 2;
      const recoil = t.recoil || 0;
      const kick = recoil * 5;
      const dx = symmetric ? 0 : -Math.cos(t.angle) * kick;
      const dy = symmetric ? 0 : -Math.sin(t.angle) * kick;
      Assets.draw(ctx, def.sprite, t.x + dx, t.y + dy, 48, 48, {
        rot,
        fallback: () => {
          ctx.fillStyle = def.color || '#888';
          ctx.fillRect(t.x - 14, t.y - 14, 28, 28);
        }
      });
      // Buffed glow
      const buffs = this.buffsForTower(t);
      if (buffs.fireMul > 1.05 || buffs.dmgMul > 1.05) {
        ctx.save();
        ctx.strokeStyle = '#4ade80';
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.5 + Math.sin(this.time * 4) * 0.2;
        ctx.beginPath(); ctx.arc(t.x, t.y, 26, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      // Per-tower extra FX
      if (t.key === 'flare' && t._pulseAnim) {
        ctx.save();
        ctx.globalAlpha = t._pulseAnim;
        ctx.strokeStyle = '#ffd86b'; ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(t.x, t.y, def.range * (1 - t._pulseAnim / 0.6), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      if (t.key === 'sing') {
        ctx.save();
        const spin = this.time * 1.4;
        for (let i = 0; i < 3; i++) {
          ctx.strokeStyle = 'rgba(160,112,255,' + (0.3 + i * 0.1) + ')';
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
        ctx.strokeStyle = '#ffd86b'; ctx.lineWidth = 2;
        ctx.globalAlpha = t._dividendPulse;
        ctx.beginPath(); ctx.arc(t.x, t.y, 24 + (1 - t._dividendPulse) * 30, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      if (t.key === 'gravity') {
        ctx.save();
        ctx.strokeStyle = 'rgba(184,144,255,0.4)';
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
      // Cryo halo
      if (t.key === 'cryo') {
        ctx.save();
        ctx.strokeStyle = 'rgba(168,232,255,0.45)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(t.x, t.y, 16 + Math.sin(this.time * 2) * 1.5, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      // Chrono rotating dial
      if (t.key === 'chrono') {
        ctx.save();
        ctx.strokeStyle = 'rgba(200,168,255,0.5)';
        ctx.lineWidth = 1;
        const spin = this.time * 0.8;
        ctx.beginPath();
        ctx.moveTo(t.x, t.y);
        ctx.lineTo(t.x + Math.cos(spin) * 18, t.y + Math.sin(spin) * 18);
        ctx.stroke();
        ctx.restore();
      }

      // Tier overlay (the headline visual evolution)
      O.Overlay.drawTierOverlay(ctx, t, this.time, { angle: t.angle });
      // Selection halo
      if (this.selectedTower === t) {
        ctx.save();
        ctx.strokeStyle = '#7ae0ff';
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(t.x, t.y, 30, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
    }

    _drawEnemy(ctx, e) {
      const spec = e.spec;
      const scale = e.size;
      // Swift streaks
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
      Assets.draw(ctx, spec.sprite, e.x, e.y, scale, scale, {
        rot: spec.boss || spec.sprite === 'orb_elite' ? 0 : this.time * (e.rotSpin || 1),
        fallback: () => {
          ctx.fillStyle = spec.color;
          ctx.beginPath(); ctx.arc(e.x, e.y, scale * 0.5, 0, Math.PI * 2); ctx.fill();
        }
      });
      // Mod overlays
      O.EnemyMods.drawAll(ctx, e, this.time);
      // HP bar
      if (e.hp < e.maxHp && e.hp > 0) {
        const w = e.size * 1.1, barY = e.y - e.size * 0.6;
        ctx.fillStyle = '#00000099';
        ctx.fillRect(e.x - w / 2, barY, w, 4);
        ctx.fillStyle = e.boss ? '#ff5566' : (e.hp / e.maxHp > 0.4 ? '#4ade80' : '#ffd86b');
        ctx.fillRect(e.x - w / 2, barY, w * (e.hp / e.maxHp), 4);
      }
      // Burn / chill / brittle indicators
      if (e.burn > 0) {
        ctx.fillStyle = 'rgba(255,140,60,' + (0.4 + Math.random() * 0.3) + ')';
        ctx.beginPath(); ctx.arc(e.x, e.y - e.size * 0.4, 2 + Math.random() * 2, 0, Math.PI * 2); ctx.fill();
      }
      if (e.chillT > 0) {
        ctx.save();
        ctx.globalAlpha = 0.45 * (e.chillAmount || 0.5);
        ctx.strokeStyle = '#a8e8ff'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.size * 0.55, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#a8e8ff';
        ctx.fillRect(e.x - 2, e.y - e.size * 0.55 - 4, 4, 4);
        ctx.restore();
      }
      if (e.brittleT > 0) {
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillRect(e.x - 1, e.y + e.size * 0.5, 2, 2);
        ctx.restore();
      }
      if (this.time < e.stunUntil) {
        ctx.save();
        ctx.fillStyle = '#ffd86b';
        for (let k = 0; k < 4; k++) {
          const a = this.time * 6 + k * Math.PI / 2;
          ctx.beginPath();
          ctx.arc(e.x + Math.cos(a) * (e.size * 0.6), e.y + Math.sin(a) * (e.size * 0.6) - e.size * 0.4, 1.6, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      // Slow tint (gravity)
      if (e.slow > 0.1) {
        ctx.save();
        ctx.globalAlpha = e.slow * 0.3;
        ctx.fillStyle = '#b890ff';
        ctx.beginPath(); ctx.arc(e.x, e.y, e.size * 0.55, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }

    _drawProjectile(ctx, p) {
      if (p.isFx && p.kind === 'rail-fx') {
        ctx.save();
        ctx.strokeStyle = '#7ae0ff';
        ctx.lineWidth = 2.5;
        ctx.globalAlpha = p.life / 0.18;
        ctx.shadowColor = '#7ae0ff'; ctx.shadowBlur = 14;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.ex, p.ey); ctx.stroke();
        ctx.restore();
        return;
      }
      if (p.isMine) {
        ctx.save();
        const sc = 0.4 + (p.settle || 0) * 0.6;
        ctx.fillStyle = '#a87a40';
        ctx.beginPath(); ctx.arc(p.x, p.y, 7 * sc, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#ffd86b'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(p.x, p.y, 7 * sc, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#ff5530';
        const blink = Math.sin(this.time * 8) > 0 ? 1 : 0;
        ctx.globalAlpha = blink;
        ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        return;
      }
      if (p.isDrone) {
        // Update drone (used in projectile loop only for drawing position)
        ctx.save();
        ctx.fillStyle = '#7ae0ff';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - 8); ctx.lineTo(p.x + 6, p.y + 6);
        ctx.lineTo(p.x, p.y + 3); ctx.lineTo(p.x - 6, p.y + 6);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#0a0e18'; ctx.stroke();
        ctx.restore();
        return;
      }
      const ang = Math.atan2(p.vy, p.vx);
      let key = p.kind === 'cannon' ? 'orb_plasma' :
                p.kind === 'cryo'   ? 'orb_bolt' :
                                       'orb_bolt';
      const w = p.kind === 'cannon' ? 34 : 24;
      const h = p.kind === 'cannon' ? 20 : 12;
      Assets.draw(ctx, key, p.x, p.y, w, h, {
        rot: ang,
        fallback: () => {
          ctx.save();
          let color = '#ffec7a';
          if (p.kind === 'cannon')   color = '#ffb347';
          if (p.kind === 'missile')  color = '#ff8040';
          if (p.kind === 'cryo')     color = '#a8e8ff';
          if (p.kind === 'engineer') color = '#ffd86b';
          ctx.shadowColor = color; ctx.shadowBlur = 10;
          ctx.fillStyle = color;
          ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
      });
    }

    _drawTeslaArcs(ctx) {
      for (const t of this.towers) {
        if (t.key !== 'tesla' || !t._arcAnim || !t._arcTargets || !t._arcTargets.length) continue;
        ctx.save();
        ctx.strokeStyle = '#7aaaff';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = '#7aaaff'; ctx.shadowBlur = 16;
        ctx.globalAlpha = t._arcAnim / 0.35;
        const pts = [{ x: t.x, y: t.y - 24 }].concat(t._arcTargets);
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i], b = pts[i + 1];
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          for (let s = 1; s < 5; s++) {
            const u = s / 5;
            const mx = a.x + (b.x - a.x) * u + (Math.random() - 0.5) * 14;
            const my = a.y + (b.y - a.y) * u + (Math.random() - 0.5) * 14;
            ctx.lineTo(mx, my);
          }
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
        ctx.fillStyle = '#fff';
        for (const p of t._arcTargets) {
          ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      }
    }

    _drawSupportPulses(ctx) {
      for (const t of this.towers) {
        if (t.key !== 'support') continue;
        ctx.save();
        const phase = ((t._pulse || 0) * 0.6) % 1;
        ctx.strokeStyle = '#4ade80';
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = (1 - phase) * 0.6;
        ctx.beginPath(); ctx.arc(t.x, t.y, 14 + phase * (t.stats.range - 14), 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
    }

    _drawBeams(ctx) {
      for (const t of this.towers) {
        if (t.key !== 'beam' || !t.beamTarget) continue;
        ctx.save();
        const widePulse = 3 + Math.sin(this.time * 30) * 1;
        ctx.strokeStyle = '#ff4fd8';
        ctx.lineWidth = widePulse;
        ctx.shadowColor = '#ff4fd8'; ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.moveTo(t.x, t.y); ctx.lineTo(t.beamTarget.x, t.beamTarget.y);
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

    _drawFlareLances(ctx) {
      for (const t of this.towers) {
        if (t.key !== 'flare' || !t.stats.lance) continue;
        const cone = t.stats.lance.cone;
        const aim  = t._lanceAim || 0;
        ctx.save();
        ctx.fillStyle = 'rgba(255,216,107,0.18)';
        ctx.beginPath();
        ctx.moveTo(t.x, t.y);
        ctx.arc(t.x, t.y, t.stats.range, aim - cone / 2, aim + cone / 2);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#ffd86b';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(t.x, t.y);
        ctx.lineTo(t.x + Math.cos(aim) * t.stats.range, t.y + Math.sin(aim) * t.stats.range);
        ctx.stroke();
        ctx.restore();
      }
    }

    _drawFloaters(ctx) {
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

    _drawMessages(ctx) {
      ctx.save();
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      for (let i = 0; i < this.messages.length; i++) {
        const m = this.messages[i];
        const alpha = Math.min(1, m.t / 0.5);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = m.color;
        ctx.font = 'bold 22px ui-monospace, monospace';
        ctx.fillText(m.text, PLAY_W / 2, 80 + i * 28);
      }
      ctx.restore();
    }

    coinsEarned(/* score */) {
      // Theme-shop coins from rounds cleared this run, not from bounty/score
      // (in-run bounty already feeds the orbital wallet via O.Persist.addStardust).
      return (this.roundsClearedThisRun | 0) + (this.victoryAchieved ? 25 : 0);
    }
  }

  NDP.attachGame('orbital', OrbitalGame);
})();
