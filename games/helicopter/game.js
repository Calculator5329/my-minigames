/* Helicopter — 4-biome run.
   ---------------------------------------------------------------------------
   The shallow 60s cave is replaced with a sequenced campaign:

     Cavern  → boss: Laser Gates       (fly through 4 timed beams)
     Reactor → boss: Charging Dragon   (dodge 3 horizontal charges)
     Reef    → boss: Turret Gauntlet   (survive 8s of cross-fire)
     Orbit   → boss: Satellite Array   (survive 10s of rotating beams)

   The whole run is one BaseGame "playing" state; transitions are driven by an
   internal `this.phase`:

     intro → flight → boss → bossClear → (shop → flight → ...) → victory

   Power-ups in flight: fuel pod (stamina refill), shield bubble (1 free hit),
   turbo (8s ×1.5 scroll). Persistent perks bought from the between-biome shop:
   Bigger Fuel Tank, Slower Stall, Reinforced Rotor, Auto-Pilot.

   Save shape (Storage.getGameData('helicopter')):
     {
       bestBiome:      0..4,
       perks:          { fuelTank, slowerStall, reinforcedRotor, autoPilot },
       defeatedArray:  bool   // true once orbital array is felled
     }
*/
(function () {
  const NDP = window.NDP;
  const { BaseGame, Input, Sprites } = NDP.Engine;
  const Storage = NDP.Engine.Storage;

  // ---- One-shot loader for sister sprites file ---------------------------
  // The script tag for games/helicopter/sprites.js is not in index.html, so
  // we lazy-inject it on first instance. Sprites engine has fallbacks while
  // the SVG decode is in flight, so first frames degrade gracefully.
  if (!Sprites.has('heli.heli_basic') && typeof document !== 'undefined') {
    const s = document.createElement('script');
    s.src = 'games/helicopter/sprites.js';
    s.async = false;
    document.head.appendChild(s);
  }

  const W = 960, H = 600;
  const HELI_X = 220;

  const SAMPLE_DX = 16;
  const NUM_SAMPLES = Math.ceil(W / SAMPLE_DX) + 6;

  // ---- Biomes ------------------------------------------------------------
  const BIOMES = [
    {
      id: 'cavern',  name: 'CAVERN',
      bg1: '#06080f', bg2: '#1a0f26',
      wall: '#1c1228', edge: '#a87fc9', accent: '#ff5e7e',
      decor: 'heli.dec_stalagmite',
      flightDur: 22,
      boss: { id:'lasergate', name:'LASER GATES', sprite:'heli.boss_lasergate', kind:'lasergates', dur: 12 }
    },
    {
      id: 'reactor', name: 'REACTOR',
      bg1: '#180806', bg2: '#3a1408',
      wall: '#2a0e08', edge: '#ff8c3a', accent: '#ffd86b',
      decor: 'heli.dec_pipe',
      flightDur: 22,
      boss: { id:'dragon', name:'CHARGING DRAGON', sprite:'heli.boss_dragon', kind:'dragon', dur: 14 }
    },
    {
      id: 'reef',    name: 'REEF',
      bg1: '#04181c', bg2: '#0a3a4a',
      wall: '#0a2832', edge: '#7cd9ff', accent: '#ff7fbf',
      decor: 'heli.dec_coral',
      flightDur: 22,
      boss: { id:'turret', name:'TURRET GAUNTLET', sprite:'heli.boss_turret', kind:'turret', dur: 8 }
    },
    {
      id: 'orbit',   name: 'ORBIT',
      bg1: '#02030a', bg2: '#0a1430',
      wall: '#0a0e1a', edge: '#cfe9ff', accent: '#ffd86b',
      decor: 'heli.dec_satellite',
      flightDur: 22,
      boss: { id:'array', name:'SATELLITE ARRAY', sprite:'heli.boss_array', kind:'array', dur: 10 }
    }
  ];

  // ---- Persistent perks --------------------------------------------------
  const PERKS = [
    { id:'fuelTank',        name:'BIGGER FUEL TANK', desc:'+50% stamina max',          cost: 25 },
    { id:'slowerStall',     name:'SLOWER STALL',     desc:'Stamina drain -30%',        cost: 30 },
    { id:'reinforcedRotor', name:'REINFORCED ROTOR', desc:'Start with 1 free shield',  cost: 45 },
    { id:'autoPilot',       name:'AUTO-PILOT',       desc:'Drift toward cave center',  cost: 50 }
  ];

  // ---- Save helpers ------------------------------------------------------
  function loadSave() {
    const def = {
      bestBiome: 0,
      perks: { fuelTank:0, slowerStall:0, reinforcedRotor:0, autoPilot:0 },
      defeatedArray: false
    };
    const cur = Storage.getGameData('helicopter') || {};
    return Object.assign({}, def, cur, { perks: Object.assign({}, def.perks, cur.perks || {}) });
  }
  function saveMeta(patch) {
    return Storage.mergeGameData('helicopter', patch);
  }

  // =========================================================================
  class HelicopterGame extends BaseGame {
    init() {
      this.save = loadSave();

      this.phase = 'intro';                  // intro | flight | boss | bossClear | shop | victory
      this.biomeIx = 0;
      this._phaseTimer = 0;
      // Milestone counters for global theme-shop coins (see coinsEarned()).
      // The in-run coinBonus from coin pickups feeds the per-game wallet via
      // onEnd(), not the global pool.
      this.biomesClearedThisRun = 0;
      this.victoryAchieved = false;

      // Heli + physics
      this.heli = { y: H / 2, vy: 0, rotor: 0, tilt: 0 };
      this.thrusting = false;

      // Stamina meter — drains while thrusting, regens otherwise. If empty,
      // a `stalled` timer counts down 1s during which lift is locked out.
      this.maxStamina = 100 * (this.save.perks.fuelTank ? 1.5 : 1);
      this.stamina = this.maxStamina;
      this.stallDrain = 25 * (this.save.perks.slowerStall ? 0.7 : 1);
      this.stallRegen = 15;
      this.stalled = 0;

      // Pickup state
      this.shieldCharges = this.save.perks.reinforcedRotor ? 1 : 0;
      this.turboTimer = 0;

      // Cave samples + scroll bookkeeping
      this.scrollSpeed = 220;
      this.distance = 0;
      this.runScore = 0;
      this.coinBonus = 0;
      this.samples = [];
      this.worldX = 0;
      const baseTop = 60, baseBot = H - 60;
      for (let i = 0; i < NUM_SAMPLES; i++) {
        this.samples.push({ wx: i * SAMPLE_DX, top: baseTop, bot: baseBot });
      }
      this.caveSeed = 0;
      this.decor = [];           // { wx, y, side, scale, rot }
      this.decorTimer = 0;
      this.pillars = [];
      this.pillarTimer = 4;
      this.pickups = [];
      this.pickupTimer = 3;
      this.coinsField = [];

      // Boss state — populated when entering boss phase
      this.boss = null;

      // Shop state
      this.shopRects = [];
      this.shopMsg = '';

      // Effects bookkeeping
      this.exhaustT = 0;
      this.lastRotorSfx = 0;

      // Saved bests
      this.deaths = 0;
      this.bestDist = 0;

      this.sfx = this.makeSfx({
        rotor:  { freq: 60,  type: 'noise',    dur: 0.05, vol: 0.06, filter: 'lowpass' },
        bump:   { freq: 220, type: 'sawtooth', dur: 0.10, vol: 0.25 },
        crash:  { freq: 90,  type: 'sawtooth', dur: 0.70, slide: -80, vol: 0.55 },
        coin:   { freq: 880, type: 'triangle', dur: 0.10, slide: 200, vol: 0.30 },
        pickup: { freq: 700, type: 'square',   dur: 0.12, slide: 320, vol: 0.35 },
        shield: { freq: 520, type: 'triangle', dur: 0.20, slide: 220, vol: 0.45 },
        turbo:  { freq: 380, type: 'sawtooth', dur: 0.18, slide: 480, vol: 0.40 },
        warn:   { freq: 200, type: 'square',   dur: 0.08, vol: 0.30 },
        bossOn: { freq: 110, type: 'sawtooth', dur: 0.50, slide: 80,  vol: 0.55 },
        bossHit:{ freq: 320, type: 'sawtooth', dur: 0.25, slide: -160,vol: 0.50 },
        win:    { freq: 880, type: 'triangle', dur: 0.50, slide: 220, vol: 0.55 },
        buy:    { freq: 1100,type: 'square',   dur: 0.10, vol: 0.40 }
      });

      // Pre-load the splash sprites the player sees first.
      Sprites.preload(['heli.heli_basic', 'heli.heli_rotor'], 80, 40);

      this._refreshHud();
    }

    onEnd(score) {
      this.save.bestBiome = Math.max(this.save.bestBiome | 0, this.biomeIx);
      saveMeta({
        bestBiome: this.save.bestBiome,
        perks: this.save.perks,
        defeatedArray: !!this.save.defeatedArray
      });
      // Per-game wallet is fed at the old score-derived rate, just routed
      // here instead of into the global theme-shop pool. Coin pickups still
      // matter for buying perks, they just don't double-dip into theme coins.
      const purse = Math.max(0, Math.floor((score | 0) / 220));
      if (purse > 0) Storage.addGameWallet('helicopter', purse);
    }

    // Global theme-shop coins: 6 per biome cleared this run + 20 victory bonus.
    coinsEarned(/*score*/) {
      return (this.biomesClearedThisRun | 0) * 6 + (this.victoryAchieved ? 20 : 0);
    }

    // ---------------- per-frame dispatch ----------------
    update(dt) {
      if (this.phase === 'intro')     return this._updateIntro(dt);
      if (this.phase === 'flight')    return this._updateFlight(dt);
      if (this.phase === 'boss')      return this._updateBoss(dt);
      if (this.phase === 'bossClear') return this._updateBossClear(dt);
      if (this.phase === 'shop')      return this._updateShop(dt);
      if (this.phase === 'victory')   return this._updateVictory(dt);
    }

    _refreshHud() {
      const b = BIOMES[this.biomeIx];
      const name = b ? b.name : '—';
      const pct = Math.round((this.stamina / this.maxStamina) * 100);
      const distM = Math.floor(this.distance / 4);
      const middle = (this.phase === 'boss' && this.boss)
        ? `<span>Boss <b>${this.boss.name}</b></span>`
        : `<span>Distance <b>${distM}m</b></span>`;
      this.setHud(
        `<span>Biome <b>${name}</b></span>` +
        `<span>Stamina <b>${pct}%</b></span>` +
        middle +
        `<span>Score <b>${this.score}</b></span>`
      );
    }

    // ====================================================================
    // INTRO
    // ====================================================================
    _updateIntro() {
      this._refreshHud();
      if (Input.mouse.justPressed) {
        Input.mouse.justPressed = false;
        this._beginBiome();
      }
    }

    _beginBiome() {
      this.phase = 'flight';
      this._phaseTimer = 0;
      this.pillarTimer = 4;
      this.pickupTimer = 3;
      this.decorTimer = 0;
      this.boss = null;
      this.sfx.play('bossOn', { vol: 0.3, slide: 220 });
      this._refreshHud();
    }

    // ====================================================================
    // FLIGHT
    // ====================================================================
    _updateFlight(dt) {
      this._phaseTimer += dt;
      const biome = BIOMES[this.biomeIx];

      // Scroll speed ramps gently inside a biome and turbo multiplies it.
      const baseSpeed = 220 + Math.min(140, this._phaseTimer * 5);
      const turboMul = this.turboTimer > 0 ? 1.5 : 1;
      this.scrollSpeed = baseSpeed * turboMul;
      if (this.turboTimer > 0) this.turboTimer = Math.max(0, this.turboTimer - dt);

      const ds = this.scrollSpeed * dt;
      this.worldX += ds;
      this.distance += ds;

      // Reshape cave + recycle samples
      const tunnelTightness = Math.min(0.55, this._phaseTimer / biome.flightDur * 0.55);
      while (this.samples.length && this.samples[0].wx < this.worldX - SAMPLE_DX) {
        const last = this.samples[this.samples.length - 1];
        this.caveSeed += 0.18;
        const cx = noise(this.caveSeed) * 2 - 1;
        const cy = noise(this.caveSeed * 1.7 + 100) * 2 - 1;
        const midShift = cx * 90;
        const widthFactor = 1 - tunnelTightness * (0.4 + noise(this.caveSeed * 0.8) * 0.6);
        const halfWidth = (H * 0.4) * widthFactor;
        const cyShift = cy * 30;
        const newSample = {
          wx: last.wx + SAMPLE_DX,
          top: clamp(H * 0.5 - halfWidth + midShift + cyShift, 30, H * 0.45),
          bot: clamp(H * 0.5 + halfWidth + midShift + cyShift, H * 0.55, H - 30)
        };
        this.samples.shift();
        this.samples.push(newSample);
      }

      // Decor scatter: anchored to walls, recycles when offscreen.
      this.decorTimer -= dt;
      if (this.decorTimer <= 0) {
        this.decorTimer = 0.45 + Math.random() * 0.6;
        const samp = this.interpAt(W + 60);
        if (samp) {
          const top = Math.random() < 0.5;
          const y = top ? samp.top + 10 + Math.random() * 12
                        : samp.bot - 10 - Math.random() * 12;
          this.decor.push({
            wx: this.worldX + W + 60, y, side: top ? -1 : 1,
            scale: 50 + Math.random() * 30, rot: (Math.random() - 0.5) * 0.4
          });
        }
      }
      for (let i = this.decor.length - 1; i >= 0; i--) {
        if (this.decor[i].wx < this.worldX - 100) this.decor.splice(i, 1);
      }

      // Pillars (skipped during boss phase; here always)
      this.pillarTimer -= dt;
      if (this.pillarTimer <= 0 && this._phaseTimer > 3) {
        this._spawnPillar();
        this.pillarTimer = 1.8 + Math.random() * 1.4;
      }
      for (let i = this.pillars.length - 1; i >= 0; i--) {
        if (this.pillars[i].wx < this.worldX - 80) this.pillars.splice(i, 1);
      }

      // Power-ups
      this.pickupTimer -= dt;
      if (this.pickupTimer <= 0) {
        this._spawnPickup();
        this.pickupTimer = 4.5 + Math.random() * 3.5;
      }

      // Coin sprinkle
      if (Math.random() < dt * 0.5 && this._phaseTimer > 1) this._spawnCoin();

      // ---- Heli physics + stamina ------------------------------------
      this._stepHeli(dt);
      this._stepCollisions();
      if (this.state !== 'playing') return;
      this._stepPickups(dt);
      this._stepCoins(dt);

      // Score = distance progress + coin bonuses + biome stage bonus
      this.setScore(Math.floor(this.distance / 4) + this.coinBonus + this.runScore);

      // Biome ends → enter boss
      if (this._phaseTimer >= biome.flightDur) {
        this._enterBoss();
      }

      this._refreshHud();
    }

    _stepHeli(dt) {
      const k = Input.keys;
      const wantThrust = !!(k[' '] || k['Space'] || Input.mouse.down);
      this.thrusting = wantThrust && this.stamina > 0 && this.stalled <= 0;

      // Stamina bookkeeping
      if (this.thrusting) {
        this.stamina = Math.max(0, this.stamina - this.stallDrain * dt);
        if (this.stamina <= 0) {
          this.stalled = 1.0;
          this.thrusting = false;
          this.sfx.play('warn');
        }
      } else {
        this.stamina = Math.min(this.maxStamina, this.stamina + this.stallRegen * dt);
      }
      if (this.stalled > 0) this.stalled = Math.max(0, this.stalled - dt);

      const gravity = 1100;
      const lift = -1500;
      this.heli.vy += (this.thrusting ? lift : gravity) * dt;

      // Auto-pilot perk: gentle pull toward cave middle when not thrusting.
      if (!this.thrusting && this.save.perks.autoPilot) {
        const samp = this.interpAt(HELI_X);
        if (samp) {
          const mid = (samp.top + samp.bot) * 0.5;
          this.heli.vy += (mid - this.heli.y) * 0.9 * dt;
        }
      }

      this.heli.vy = clamp(this.heli.vy, -520, 700);
      this.heli.y += this.heli.vy * dt;
      this.heli.tilt = clamp(this.heli.vy / 600, -0.4, 0.5);
      this.heli.rotor += dt * 28;

      // Rotor SFX
      this.lastRotorSfx += dt;
      if (this.lastRotorSfx > 0.08) {
        this.lastRotorSfx = 0;
        this.sfx.play('rotor');
      }

      // Exhaust trail
      this.exhaustT += dt;
      if (this.exhaustT > 0.025) {
        this.exhaustT = 0;
        this.particles.emit({
          x: HELI_X - 22, y: this.heli.y + 4,
          vx: -this.scrollSpeed * 0.6 + (Math.random() - 0.5) * 30,
          vy: 30 + Math.random() * 30,
          life: 0.4, size: 2.5,
          color: this.thrusting ? '#ffae44' : '#999'
        });
      }
    }

    _stepCollisions() {
      // Cave walls
      const samp = this.interpAt(HELI_X);
      if (samp) {
        const headY = this.heli.y - 10;
        const footY = this.heli.y + 10;
        if (headY < samp.top + 4 || footY > samp.bot - 4) {
          if (!this._consumeShield()) return this._crash();
          // Bounce away from the wall to avoid instant re-hit.
          this.heli.y = clamp(this.heli.y, samp.top + 18, samp.bot - 18);
          this.heli.vy = headY < samp.top + 4 ? 200 : -200;
        }
      }
      // Pillars
      for (const p of this.pillars) {
        const sx = p.wx - this.worldX;
        if (sx < HELI_X + 22 && sx + p.w > HELI_X - 22) {
          if (p.fromTop) {
            if (this.heli.y - 10 < p.len) {
              if (!this._consumeShield()) return this._crash();
              this.heli.y = p.len + 18; this.heli.vy = 80;
            }
          } else {
            if (this.heli.y + 10 > H - p.len) {
              if (!this._consumeShield()) return this._crash();
              this.heli.y = H - p.len - 18; this.heli.vy = -80;
            }
          }
        }
      }
    }

    _stepPickups(dt) {
      for (let i = this.pickups.length - 1; i >= 0; i--) {
        const p = this.pickups[i];
        const sx = p.wx - this.worldX;
        if (sx < -30) { this.pickups.splice(i, 1); continue; }
        p.bob += dt;
        if (Math.hypot(sx - HELI_X, p.y - this.heli.y) < 26) {
          this.pickups.splice(i, 1);
          this._applyPickup(p.kind, sx, p.y);
        }
      }
    }

    _stepCoins(dt) {
      for (let i = this.coinsField.length - 1; i >= 0; i--) {
        const c = this.coinsField[i];
        const sx = c.wx - this.worldX;
        if (sx < -20) { this.coinsField.splice(i, 1); continue; }
        c.spin += dt * 6;
        if (Math.hypot(sx - HELI_X, c.y - this.heli.y) < 18) {
          this.coinsField.splice(i, 1);
          this.coinBonus += 50;
          this.sfx.play('coin');
          this.particles.burst(sx, c.y, 12, { color:'#ffd86b', speed:200, life:0.4, size:3 });
        }
      }
    }

    _spawnPillar() {
      const fromTop = Math.random() < 0.5;
      const wx = this.worldX + W + 40;
      const samp = this.interpAt(W + 40) || { top: 60, bot: H - 60 };
      const open = samp.bot - samp.top;
      const maxLen = Math.max(40, open * 0.55);
      const len = 60 + Math.random() * maxLen;
      this.pillars.push({
        wx, w: 22 + Math.random() * 12,
        fromTop, len: Math.min(len, fromTop ? samp.bot - 60 : H - samp.top - 60)
      });
    }

    _spawnCoin() {
      const sampX = W + 60;
      const samp = this.interpAt(sampX) || { top: 80, bot: H - 80 };
      const margin = 30;
      const y = samp.top + margin + Math.random() * Math.max(40, samp.bot - samp.top - margin * 2);
      this.coinsField.push({ wx: this.worldX + sampX, y, spin: 0 });
    }

    _spawnPickup() {
      const kinds = ['fuel', 'shield', 'turbo'];
      const kind = kinds[Math.floor(Math.random() * kinds.length)];
      const sampX = W + 60;
      const samp = this.interpAt(sampX) || { top: 80, bot: H - 80 };
      const y = samp.top + 50 + Math.random() * Math.max(60, samp.bot - samp.top - 100);
      this.pickups.push({ wx: this.worldX + sampX, y, kind, bob: Math.random() * Math.PI * 2 });
    }

    _applyPickup(kind, sx, y) {
      this.particles.burst(sx, y, 18, { color:'#fff', speed:200, life:0.5, size:3 });
      if (kind === 'fuel') {
        this.stamina = this.maxStamina;
        this.stalled = 0;
        this.sfx.play('pickup');
      } else if (kind === 'shield') {
        this.shieldCharges = Math.min(2, this.shieldCharges + 1);
        this.sfx.play('shield');
      } else if (kind === 'turbo') {
        this.turboTimer = 8;
        this.sfx.play('turbo');
        this.flash('#ffd86b', 0.12);
      }
    }

    _consumeShield() {
      if (this.shieldCharges <= 0) return false;
      this.shieldCharges--;
      this.sfx.play('shield');
      this.flash('#7cd9ff', 0.25);
      this.shake(8, 0.25);
      this.particles.burst(HELI_X, this.heli.y, 26, { color:'#7cd9ff', speed:240, life:0.5, size:3 });
      return true;
    }

    _crash() {
      this.sfx.play('crash');
      this.shake(20, 0.5);
      this.flash('#ff3a3a', 0.3);
      this.particles.burst(HELI_X, this.heli.y, 50, {
        color: '#ffae44', speed: 320, life: 0.8, size: 3
      });
      this.particles.burst(HELI_X, this.heli.y, 30, {
        color: '#ff5e7e', speed: 220, life: 0.9, size: 4
      });
      this.gameOver();
    }

    // ====================================================================
    // BOSS
    // ====================================================================
    _enterBoss() {
      const biome = BIOMES[this.biomeIx];
      const def = biome.boss;
      this.boss = {
        kind: def.kind, name: def.name, sprite: def.sprite,
        timer: 0, dur: def.dur,
        cleared: false, hits: 0, maxHits: 0
      };
      // Per-boss state hook
      if (def.kind === 'lasergates') {
        this.boss.gates = [];
        this.boss.gatesPassed = 0;
        this.boss.gatesNeeded = 4;
        this.boss.spawnEvery = 2.4;
        this.boss.nextSpawn = 0.8;
      } else if (def.kind === 'dragon') {
        this.boss.charges = 0;
        this.boss.chargesNeeded = 3;
        this.boss.dragonState = 'idle';     // idle | telegraph | charging | recover
        this.boss.dragonTimer = 1.2;
        this.boss.dragonY = H * 0.5;
        this.boss.dragonX = W + 80;
        this.boss.dangerBand = 60;
      } else if (def.kind === 'turret') {
        this.boss.bullets = [];
        this.boss.fireTimer = 0;
        this.boss.fireEvery = 0.55;
        this.boss.turretYs = [40, H - 40];
      } else if (def.kind === 'array') {
        this.boss.beams = [
          { angle: 0,           speed: 0.9, len: 320 },
          { angle: Math.PI/2,   speed: -1.1, len: 280 },
          { angle: Math.PI,     speed: 0.7, len: 320 }
        ];
        this.boss.satX = W * 0.72;
        this.boss.satY = H * 0.5;
      }
      this.phase = 'boss';
      this._phaseTimer = 0;
      this.sfx.play('bossOn');
      this.flash('#ff5e7e', 0.18);
      this.shake(8, 0.4);
      this._refreshHud();
    }

    _updateBoss(dt) {
      this._phaseTimer += dt;
      this.boss.timer += dt;

      // Keep the cave scrolling (less intrusive — pillars suspended).
      this.scrollSpeed = 200;
      const ds = this.scrollSpeed * dt;
      this.worldX += ds;
      while (this.samples.length && this.samples[0].wx < this.worldX - SAMPLE_DX) {
        const last = this.samples[this.samples.length - 1];
        this.caveSeed += 0.10;
        const cx = noise(this.caveSeed) * 2 - 1;
        const midShift = cx * 60;
        const halfWidth = H * 0.36;
        const newSample = {
          wx: last.wx + SAMPLE_DX,
          top: clamp(H * 0.5 - halfWidth + midShift, 40, H * 0.45),
          bot: clamp(H * 0.5 + halfWidth + midShift, H * 0.55, H - 40)
        };
        this.samples.shift();
        this.samples.push(newSample);
      }

      // Heli physics + cave wall collisions still apply
      this._stepHeli(dt);

      const samp = this.interpAt(HELI_X);
      if (samp) {
        if (this.heli.y - 10 < samp.top + 4 || this.heli.y + 10 > samp.bot - 4) {
          if (!this._consumeShield()) return this._crash();
          this.heli.y = clamp(this.heli.y, samp.top + 18, samp.bot - 18);
          this.heli.vy = 0;
        }
      }
      if (this.state !== 'playing') return;

      // Per-boss behaviour
      if (this.boss.kind === 'lasergates') this._updateLasergates(dt);
      else if (this.boss.kind === 'dragon')  this._updateDragon(dt);
      else if (this.boss.kind === 'turret')  this._updateTurret(dt);
      else if (this.boss.kind === 'array')   this._updateArray(dt);

      this.setScore(Math.floor(this.distance / 4) + this.coinBonus + this.runScore);
      this._refreshHud();
    }

    _updateLasergates(dt) {
      const b = this.boss;
      // Spawn new gates on a rhythm
      b.nextSpawn -= dt;
      if (b.nextSpawn <= 0 && b.gates.length + b.gatesPassed < b.gatesNeeded) {
        b.nextSpawn = b.spawnEvery;
        const samp = this.interpAt(W + 80) || { top: 80, bot: H - 80 };
        const open = samp.bot - samp.top;
        const gapHeight = clamp(140, 110, open * 0.55);
        const gapY = samp.top + 30 + Math.random() * Math.max(40, open - gapHeight - 60);
        b.gates.push({
          wx: this.worldX + W + 60,
          gapY, gapH: gapHeight,
          phase: Math.random() * Math.PI * 2,
          period: 1.1, on: true,
          consumed: false
        });
      }
      // Update gates
      for (let i = b.gates.length - 1; i >= 0; i--) {
        const g = b.gates[i];
        // Beam pulses on/off
        const t = (this.boss.timer + g.phase) % g.period;
        g.on = t < g.period * 0.6;
        const sx = g.wx - this.worldX;
        // Collision: if heli overlaps the gate column AND beam is on AND
        // heli is outside the gap
        if (sx < HELI_X + 16 && sx + 18 > HELI_X - 16 && g.on) {
          const heliTop = this.heli.y - 10, heliBot = this.heli.y + 10;
          if (heliTop < g.gapY || heliBot > g.gapY + g.gapH) {
            if (!this._consumeShield()) return this._crash();
            this.heli.vy = 0;
          }
        }
        // Once past the heli, count it
        if (!g.consumed && sx < HELI_X - 20) {
          g.consumed = true;
          b.gatesPassed++;
          this.runScore += 200;
          this.sfx.play('bossHit');
          this.particles.burst(HELI_X + 60, this.heli.y, 16, { color:'#ffd86b', speed:200, life:0.5 });
        }
        if (sx < -40) b.gates.splice(i, 1);
      }
      if (b.gatesPassed >= b.gatesNeeded) this._defeatBoss();
    }

    _updateDragon(dt) {
      const b = this.boss;
      b.dragonTimer -= dt;
      if (b.dragonState === 'idle') {
        if (b.dragonTimer <= 0) {
          b.dragonState = 'telegraph';
          b.dragonTimer = 1.0;
          b.dragonY = clamp(this.heli.y + (Math.random() - 0.5) * 80, 90, H - 90);
          this.sfx.play('warn');
        }
      } else if (b.dragonState === 'telegraph') {
        if (b.dragonTimer <= 0) {
          b.dragonState = 'charging';
          b.dragonTimer = 0.9;
          b.dragonX = W + 100;
          this.sfx.play('bossOn', { vol: 0.4 });
        }
      } else if (b.dragonState === 'charging') {
        b.dragonX -= 1300 * dt;
        // Hit detection: heli within band + dragon overlapping its x
        if (b.dragonX < HELI_X + 80 && b.dragonX > HELI_X - 100) {
          if (Math.abs(this.heli.y - b.dragonY) < b.dangerBand) {
            if (!this._consumeShield()) return this._crash();
            this.heli.vy = -300;
          }
        }
        if (b.dragonX < -120) {
          b.dragonState = 'recover';
          b.dragonTimer = 0.7;
          b.charges++;
          this.runScore += 300;
          this.sfx.play('bossHit');
          this.particles.burst(HELI_X - 60, this.heli.y, 22, { color:'#ff8c3a', speed:240, life:0.6 });
        }
      } else if (b.dragonState === 'recover') {
        if (b.dragonTimer <= 0) {
          if (b.charges >= b.chargesNeeded) return this._defeatBoss();
          b.dragonState = 'idle';
          b.dragonTimer = 1.1;
        }
      }
    }

    _updateTurret(dt) {
      const b = this.boss;
      b.fireTimer -= dt;
      if (b.fireTimer <= 0) {
        b.fireTimer = b.fireEvery;
        // Fire from each turret toward the heli's current y, slow speed
        for (const ty of b.turretYs) {
          const dx = HELI_X - (W * 0.7);
          const dy = this.heli.y - ty;
          const m = Math.hypot(dx, dy) || 1;
          const speed = 240;
          b.bullets.push({
            x: W * 0.7, y: ty,
            vx: (dx / m) * speed, vy: (dy / m) * speed,
            life: 4
          });
        }
        this.sfx.play('warn');
      }
      for (let i = b.bullets.length - 1; i >= 0; i--) {
        const bu = b.bullets[i];
        bu.x += bu.vx * dt; bu.y += bu.vy * dt; bu.life -= dt;
        if (bu.x < -20 || bu.x > W + 20 || bu.y < -20 || bu.y > H + 20 || bu.life <= 0) {
          b.bullets.splice(i, 1); continue;
        }
        if (Math.hypot(bu.x - HELI_X, bu.y - this.heli.y) < 16) {
          b.bullets.splice(i, 1);
          if (!this._consumeShield()) return this._crash();
          this.heli.vy = 0;
        }
      }
      if (b.timer >= b.dur) this._defeatBoss();
    }

    _updateArray(dt) {
      const b = this.boss;
      for (const beam of b.beams) {
        beam.angle += beam.speed * dt;
        // Beam: line from (satX, satY) along angle, length len.
        // Hit detection: project heli onto beam axis, check if perpendicular distance is small
        const dx = HELI_X - b.satX;
        const dy = this.heli.y - b.satY;
        const ca = Math.cos(beam.angle), sa = Math.sin(beam.angle);
        const along = dx * ca + dy * sa;
        const perp = Math.abs(-dx * sa + dy * ca);
        if (along > 20 && along < beam.len && perp < 14) {
          if (!this._consumeShield()) return this._crash();
          this.heli.vy = (perp < 0 ? 1 : -1) * 200 + (Math.random() - 0.5) * 200;
        }
      }
      if (b.timer >= b.dur) this._defeatBoss();
    }

    _defeatBoss() {
      const biome = BIOMES[this.biomeIx];
      this.runScore += 800 + this.biomeIx * 400;
      this.shake(14, 0.5);
      this.flash(biome.accent, 0.3);
      this.particles.burst(W * 0.7, H * 0.5, 80, {
        color: biome.accent, speed: 360, life: 1.0, size: 3
      });
      this.sfx.play('win');
      this.phase = 'bossClear';
      this._phaseTimer = 0;
      // Persist progression milestone immediately so a quit-after still saves.
      this.save.bestBiome = Math.max(this.save.bestBiome, this.biomeIx + 1);
      saveMeta({ bestBiome: this.save.bestBiome });
      this.biomesClearedThisRun++;
    }

    _updateBossClear(dt) {
      this._phaseTimer += dt;
      // brief celebration freeze
      if (this._phaseTimer > 1.4 || Input.mouse.justPressed) {
        Input.mouse.justPressed = false;
        const isLast = this.biomeIx >= BIOMES.length - 1;
        if (isLast) {
          this.save.defeatedArray = true;
          saveMeta({ defeatedArray: true });
          this.phase = 'victory';
          this._phaseTimer = 0;
        } else {
          this.shopMsg = '';
          this.phase = 'shop';
        }
      }
      this._refreshHud();
    }

    // ====================================================================
    // SHOP
    // ====================================================================
    _updateShop(dt) {
      this._refreshHud();
      if (!Input.mouse.justPressed) return;
      Input.mouse.justPressed = false;
      const mx = Input.mouse.x, my = Input.mouse.y;
      for (const r of this.shopRects) {
        if (mx < r.x || mx > r.x + r.w || my < r.y || my > r.y + r.h) continue;
        if (r.kind === 'continue') {
          this.biomeIx++;
          if (this.biomeIx >= BIOMES.length) {
            this.phase = 'victory'; this._phaseTimer = 0;
          } else {
            this._beginBiome();
          }
          return;
        }
        if (r.kind === 'perk') {
          const p = r.perk;
          if (this.save.perks[p.id]) { this.shopMsg = p.name + ' already owned.'; return; }
          if (Storage.getGameWallet('helicopter') < p.cost) { this.shopMsg = 'Not enough coins for ' + p.name + '.'; return; }
          if (!Storage.spendGameWallet('helicopter', p.cost)) { this.shopMsg = 'Purchase failed.'; return; }
          this.save.perks[p.id] = 1;
          saveMeta({ perks: this.save.perks });
          this._applyPerksLive(p.id);
          this.shopMsg = 'Bought ' + p.name + '.';
          this.sfx.play('buy');
          this.particles.burst(r.x + r.w/2, r.y + r.h/2, 16, { color:'#ffd86b', speed:200, life:0.6 });
          return;
        }
      }
    }

    _applyPerksLive(perkId) {
      // Perks bought mid-run apply immediately so the next biome benefits.
      if (perkId === 'fuelTank') {
        const ratio = this.stamina / this.maxStamina;
        this.maxStamina = 100 * 1.5;
        this.stamina = this.maxStamina * ratio;
      }
      if (perkId === 'slowerStall') {
        this.stallDrain = 25 * 0.7;
      }
      if (perkId === 'reinforcedRotor') {
        this.shieldCharges = Math.max(this.shieldCharges, 1);
      }
      // Auto-pilot is read on the fly from save.perks.
    }

    // ====================================================================
    // VICTORY
    // ====================================================================
    _updateVictory(dt) {
      this._phaseTimer += dt;
      this._refreshHud();
      if (this._phaseTimer > 1.0 && Input.mouse.justPressed) {
        Input.mouse.justPressed = false;
        this.victoryAchieved = true;
        this.win();
      }
    }

    // ---------------- helpers ----------------
    indexAtScreenX(sx) {
      const wx = this.worldX + sx;
      return Math.floor((wx - this.samples[0].wx) / SAMPLE_DX);
    }
    interpAt(sx) {
      const wx = this.worldX + sx;
      const i = Math.floor((wx - this.samples[0].wx) / SAMPLE_DX);
      if (i < 0 || i >= this.samples.length - 1) return null;
      const a = this.samples[i], b = this.samples[i + 1];
      const t = (wx - a.wx) / SAMPLE_DX;
      return {
        top: a.top + (b.top - a.top) * t,
        bot: a.bot + (b.bot - a.bot) * t
      };
    }

    // =====================================================================
    // RENDER
    // =====================================================================
    render(ctx) {
      this._drawBackdrop(ctx);
      this._drawDecor(ctx);
      this._drawCave(ctx);
      this._drawPillars(ctx);
      this._drawPickups(ctx);
      this._drawCoins(ctx);

      if (this.phase === 'boss') this._drawBossHazards(ctx);

      this._drawHeli(ctx);
      this._drawOverlay(ctx);

      if (this.phase === 'intro')      this._renderIntro(ctx);
      if (this.phase === 'bossClear')  this._renderBossClear(ctx);
      if (this.phase === 'shop')       this._renderShop(ctx);
      if (this.phase === 'victory')    this._renderVictory(ctx);
    }

    _drawBackdrop(ctx) {
      const biome = BIOMES[this.biomeIx];
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, biome.bg1);
      g.addColorStop(1, biome.bg2);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      // Stars / sparks parallax
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      for (let i = 0; i < 60; i++) {
        const sx = (i * 73 - this.worldX * 0.1) % W;
        const x = sx < 0 ? sx + W : sx;
        const y = (i * 137) % H;
        ctx.fillRect(x, y, 1, 1);
      }
    }

    _drawDecor(ctx) {
      const biome = BIOMES[this.biomeIx];
      for (const d of this.decor) {
        const x = d.wx - this.worldX;
        if (x < -100 || x > W + 100) continue;
        const drawn = Sprites.draw(ctx, biome.decor, x, d.y, d.scale, d.scale, {
          rot: d.rot * d.side,
          flipX: d.side > 0,
          alpha: 0.85
        });
        if (!drawn) {
          ctx.fillStyle = biome.edge;
          ctx.globalAlpha = 0.5;
          ctx.fillRect(x - d.scale/4, d.y - d.scale/4, d.scale/2, d.scale/2);
          ctx.globalAlpha = 1;
        }
      }
    }

    _drawCave(ctx) {
      const biome = BIOMES[this.biomeIx];
      ctx.fillStyle = biome.wall;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      for (let i = 0; i < this.samples.length; i++) {
        const s = this.samples[i];
        const x = s.wx - this.worldX;
        ctx.lineTo(x, s.top);
      }
      ctx.lineTo(W, 0);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let i = 0; i < this.samples.length; i++) {
        const s = this.samples[i];
        const x = s.wx - this.worldX;
        ctx.lineTo(x, s.bot);
      }
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();

      // Glow edges
      ctx.save();
      ctx.shadowColor = biome.edge; ctx.shadowBlur = 10;
      ctx.strokeStyle = biome.edge;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < this.samples.length; i++) {
        const s = this.samples[i];
        const x = s.wx - this.worldX;
        if (i === 0) ctx.moveTo(x, s.top); else ctx.lineTo(x, s.top);
      }
      ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i < this.samples.length; i++) {
        const s = this.samples[i];
        const x = s.wx - this.worldX;
        if (i === 0) ctx.moveTo(x, s.bot); else ctx.lineTo(x, s.bot);
      }
      ctx.stroke();
      ctx.restore();
    }

    _drawPillars(ctx) {
      const biome = BIOMES[this.biomeIx];
      for (const p of this.pillars) {
        const x = p.wx - this.worldX;
        ctx.fillStyle = biome.wall;
        if (p.fromTop) ctx.fillRect(x, 0, p.w, p.len);
        else ctx.fillRect(x, H - p.len, p.w, p.len);
        ctx.save();
        ctx.shadowColor = biome.accent; ctx.shadowBlur = 8;
        ctx.fillStyle = biome.accent;
        if (p.fromTop) ctx.fillRect(x, p.len - 4, p.w, 4);
        else ctx.fillRect(x, H - p.len, p.w, 4);
        ctx.restore();
      }
    }

    _drawPickups(ctx) {
      for (const p of this.pickups) {
        const x = p.wx - this.worldX;
        if (x < -40 || x > W + 40) continue;
        const yo = Math.sin(p.bob * 3) * 4;
        const key = p.kind === 'fuel' ? 'heli.fuel'
                  : p.kind === 'shield' ? 'heli.shield_orb'
                  : 'heli.turbo';
        Sprites.draw(ctx, key, x, p.y + yo, 44, 44, {
          fallback: () => {
            ctx.fillStyle = p.kind === 'fuel' ? '#9aff7a'
                          : p.kind === 'shield' ? '#7cd9ff'
                          : '#ffd86b';
            ctx.beginPath(); ctx.arc(x, p.y + yo, 18, 0, Math.PI*2); ctx.fill();
          }
        });
      }
    }

    _drawCoins(ctx) {
      for (const c of this.coinsField) {
        const x = c.wx - this.worldX;
        if (x < -20 || x > W + 20) continue;
        ctx.save();
        ctx.shadowColor = '#ffd86b'; ctx.shadowBlur = 12;
        ctx.fillStyle = '#ffd86b';
        const wide = Math.abs(Math.cos(c.spin)) * 10 + 2;
        ctx.fillRect(x - wide / 2, c.y - 10, wide, 20);
        ctx.restore();
        ctx.fillStyle = '#5a3018';
        ctx.font = 'bold 12px ui-monospace, monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        if (wide > 6) ctx.fillText('$', x, c.y);
      }
    }

    _drawHeli(ctx) {
      // Keep heli visible during shop/intro/victory too as a visual anchor
      const sprite = this.save.perks.reinforcedRotor ? 'heli.heli_armored' : 'heli.heli_basic';
      // Body
      Sprites.draw(ctx, sprite, HELI_X, this.heli.y, 80, 40, {
        rot: this.heli.tilt,
        fallback: () => {
          ctx.save();
          ctx.translate(HELI_X, this.heli.y);
          ctx.rotate(this.heli.tilt);
          ctx.fillStyle = '#ffd86b';
          ctx.fillRect(-18, -8, 30, 16);
          ctx.fillRect(-26, -3, 10, 6);
          ctx.restore();
        }
      });
      // Rotor band (tiny vertical offset, scales with rotor pulse)
      const blur = Math.abs(Math.sin(this.heli.rotor));
      const rotorW = 64 + blur * 8;
      Sprites.draw(ctx, 'heli.heli_rotor',
        HELI_X + Math.sin(this.heli.tilt) * 4,
        this.heli.y - 18 + Math.cos(this.heli.tilt) * 4,
        rotorW, 10,
        { rot: this.heli.tilt, alpha: 0.85 }
      );

      // Shield bubble
      if (this.shieldCharges > 0) {
        ctx.save();
        ctx.strokeStyle = 'rgba(124,217,255,' + (0.5 + 0.4 * Math.sin(this.time * 8)) + ')';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#7cd9ff'; ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(HELI_X, this.heli.y, 30, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Turbo trail
      if (this.turboTimer > 0) {
        ctx.save();
        ctx.fillStyle = 'rgba(255,216,107,0.5)';
        for (let i = 1; i <= 6; i++) {
          ctx.globalAlpha = 0.5 - i * 0.07;
          ctx.fillRect(HELI_X - 30 - i * 8, this.heli.y - 4, 6, 8);
        }
        ctx.restore();
      }

      // Stalled indicator
      if (this.stalled > 0) {
        ctx.fillStyle = '#ff5e7e';
        ctx.font = 'bold 12px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('STALL', HELI_X, this.heli.y - 32);
      }
    }

    _drawBossHazards(ctx) {
      const b = this.boss;
      if (b.kind === 'lasergates') this._drawLasergates(ctx);
      else if (b.kind === 'dragon') this._drawDragon(ctx);
      else if (b.kind === 'turret') this._drawTurret(ctx);
      else if (b.kind === 'array')  this._drawArray(ctx);
    }

    _drawLasergates(ctx) {
      const b = this.boss;
      for (const g of b.gates) {
        const x = g.wx - this.worldX;
        // Thin frame above + below the gap
        ctx.fillStyle = '#3a1010';
        ctx.fillRect(x - 9, 0, 18, g.gapY);
        ctx.fillRect(x - 9, g.gapY + g.gapH, 18, H - g.gapY - g.gapH);
        // Beam
        if (g.on) {
          ctx.save();
          ctx.shadowColor = '#ff5e7e'; ctx.shadowBlur = 18;
          const grad = ctx.createLinearGradient(x, 0, x, H);
          grad.addColorStop(0, '#ff5e7e');
          grad.addColorStop(0.5, '#ffd86b');
          grad.addColorStop(1, '#ff5e7e');
          ctx.fillStyle = grad;
          ctx.fillRect(x - 4, 0, 8, g.gapY);
          ctx.fillRect(x - 4, g.gapY + g.gapH, 8, H - g.gapY - g.gapH);
          ctx.restore();
        } else {
          ctx.fillStyle = 'rgba(255,94,126,0.25)';
          ctx.fillRect(x - 1, 0, 2, g.gapY);
          ctx.fillRect(x - 1, g.gapY + g.gapH, 2, H - g.gapY - g.gapH);
        }
        // Gap arrows
        ctx.fillStyle = '#ffd86b';
        ctx.font = 'bold 12px ui-monospace, monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('▶', x + 18, g.gapY + g.gapH / 2);
      }
      // Boss banner
      this._drawBossBanner(ctx, b.gatesPassed + ' / ' + b.gatesNeeded + ' GATES');
    }

    _drawDragon(ctx) {
      const b = this.boss;
      // Telegraph: red band at the danger Y
      if (b.dragonState === 'telegraph') {
        ctx.save();
        ctx.fillStyle = 'rgba(255,94,126,' + (0.25 + 0.25 * Math.sin(this.time * 14)) + ')';
        ctx.fillRect(0, b.dragonY - b.dangerBand, W, b.dangerBand * 2);
        ctx.restore();
        // Dragon pre-render at right side
        Sprites.draw(ctx, b.sprite, W - 80, b.dragonY, 200, 120, { fallback: () => {
          ctx.fillStyle = '#a82a08'; ctx.fillRect(W - 180, b.dragonY - 60, 200, 120);
        }});
      } else if (b.dragonState === 'charging') {
        Sprites.draw(ctx, b.sprite, b.dragonX, b.dragonY, 240, 140, { fallback: () => {
          ctx.fillStyle = '#a82a08';
          ctx.fillRect(b.dragonX - 120, b.dragonY - 70, 240, 140);
        }});
        // Trail
        ctx.fillStyle = 'rgba(255,140,58,0.4)';
        for (let i = 1; i < 8; i++) {
          ctx.globalAlpha = 0.4 - i * 0.045;
          ctx.fillRect(b.dragonX + i * 24, b.dragonY - 30, 18, 60);
        }
        ctx.globalAlpha = 1;
      } else {
        // idle/recover: dragon lurks at right side
        Sprites.draw(ctx, b.sprite, W - 70, H * 0.5, 180, 110, { alpha: 0.5, fallback: () => {
          ctx.fillStyle = '#3a0a04'; ctx.fillRect(W - 160, H * 0.5 - 55, 180, 110);
        }});
      }
      this._drawBossBanner(ctx, 'DODGES ' + b.charges + ' / ' + b.chargesNeeded);
    }

    _drawTurret(ctx) {
      const b = this.boss;
      // Top + bottom turret platforms
      Sprites.draw(ctx, b.sprite, W * 0.7, H * 0.5, 200, 180, {
        alpha: 0.85,
        fallback: () => {
          ctx.fillStyle = '#3d4658'; ctx.fillRect(W*0.7 - 100, 0, 200, 60);
          ctx.fillRect(W*0.7 - 100, H - 60, 200, 60);
        }
      });
      // Bullets
      for (const bu of b.bullets) {
        ctx.save();
        ctx.shadowColor = '#ff5e7e'; ctx.shadowBlur = 10;
        ctx.fillStyle = '#ffd86b';
        ctx.beginPath();
        ctx.arc(bu.x, bu.y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      this._drawBossBanner(ctx, 'SURVIVE ' + Math.max(0, (b.dur - b.timer)).toFixed(1) + 's');
    }

    _drawArray(ctx) {
      const b = this.boss;
      // Beams
      for (const beam of b.beams) {
        ctx.save();
        ctx.translate(b.satX, b.satY);
        ctx.rotate(beam.angle);
        const grad = ctx.createLinearGradient(0, 0, beam.len, 0);
        grad.addColorStop(0, 'rgba(255,94,126,0.95)');
        grad.addColorStop(1, 'rgba(255,94,126,0)');
        ctx.fillStyle = grad;
        ctx.shadowColor = '#ff5e7e'; ctx.shadowBlur = 14;
        ctx.fillRect(0, -8, beam.len, 16);
        ctx.restore();
      }
      // Satellite hub sprite
      Sprites.draw(ctx, b.sprite, b.satX, b.satY, 180, 180, {
        fallback: () => {
          ctx.fillStyle = '#1a2030';
          ctx.beginPath(); ctx.arc(b.satX, b.satY, 60, 0, Math.PI * 2); ctx.fill();
        }
      });
      this._drawBossBanner(ctx, 'SURVIVE ' + Math.max(0, (b.dur - b.timer)).toFixed(1) + 's');
    }

    _drawBossBanner(ctx, text) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(W/2 - 140, 12, 280, 28);
      ctx.fillStyle = '#ffd86b';
      ctx.font = 'bold 14px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = '#ff5e7e'; ctx.shadowBlur = 8;
      ctx.fillText(this.boss.name + '  ·  ' + text, W/2, 26);
      ctx.restore();
    }

    _drawOverlay(ctx) {
      // Stamina bar (top left strip)
      const x = 16, y = 12, w = 200, h = 10;
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(x, y, w, h);
      const pct = this.stamina / this.maxStamina;
      const barColor = this.stalled > 0 ? '#ff5e7e' : (pct < 0.25 ? '#ff8c3a' : '#9aff7a');
      ctx.fillStyle = barColor;
      ctx.fillRect(x, y, w * pct, h);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = '#fff';
      ctx.font = '10px ui-monospace, monospace';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('STAMINA', x, y + h + 2);

      // Shield + turbo indicators
      let ix = x + w + 14;
      if (this.shieldCharges > 0) {
        ctx.fillStyle = '#7cd9ff';
        ctx.beginPath(); ctx.arc(ix, y + 5, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillText('SHLD x' + this.shieldCharges, ix + 12, y - 1);
        ix += 80;
      }
      if (this.turboTimer > 0) {
        ctx.fillStyle = '#ffd86b';
        ctx.beginPath(); ctx.arc(ix, y + 5, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillText('TURBO ' + this.turboTimer.toFixed(1), ix + 12, y - 1);
      }
    }

    // ---------------- intro / clear / shop / victory overlays ----------------
    _renderIntro(ctx) {
      this._dimCurtain(ctx, 0.55);
      const biome = BIOMES[this.biomeIx];
      ctx.fillStyle = biome.accent;
      ctx.font = 'bold 40px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = biome.accent; ctx.shadowBlur = 14;
      ctx.fillText('BIOME ' + (this.biomeIx + 1) + ' · ' + biome.name, W/2, 200);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff'; ctx.font = '16px ui-monospace, monospace';
      ctx.fillText('Hold mouse / Space to lift.   Stamina drains while thrusting.', W/2, 250);
      ctx.fillText('Survive each biome, then defeat its boss.', W/2, 274);

      ctx.fillStyle = biome.edge; ctx.font = '13px ui-monospace, monospace';
      ctx.fillText('Boss: ' + biome.boss.name, W/2, 314);

      const ownedList = PERKS.filter(p => this.save.perks[p.id]).map(p => p.name);
      ctx.fillStyle = '#cfe9ff';
      ctx.font = '12px ui-monospace, monospace';
      ctx.fillText(ownedList.length ? ('Active perks: ' + ownedList.join(' · ')) : 'No perks yet — earn coins to unlock.',
                   W/2, 350);
      ctx.fillText('Best biome cleared so far: ' + this.save.bestBiome, W/2, 372);

      ctx.fillStyle = '#fff'; ctx.font = 'bold 18px ui-monospace, monospace';
      ctx.fillText('Click to launch', W/2, 470);
    }

    _renderBossClear(ctx) {
      this._dimCurtain(ctx, 0.5);
      const biome = BIOMES[this.biomeIx];
      ctx.fillStyle = biome.accent;
      ctx.font = 'bold 44px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = biome.accent; ctx.shadowBlur = 18;
      ctx.fillText('BIOME CLEARED', W/2, 240);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff'; ctx.font = '16px ui-monospace, monospace';
      ctx.fillText('Defeated ' + biome.boss.name, W/2, 290);
      const isLast = this.biomeIx >= BIOMES.length - 1;
      ctx.fillStyle = '#cfe9ff';
      ctx.fillText(isLast ? 'Click to claim victory.' : 'Click to enter the hangar shop.',
                   W/2, 340);
    }

    _renderShop(ctx) {
      this._dimCurtain(ctx, 0.6);
      ctx.fillStyle = '#ffd86b';
      ctx.font = 'bold 30px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = '#ffd86b'; ctx.shadowBlur = 12;
      ctx.fillText('HANGAR · spend coins on perks', W/2, 90);
      ctx.shadowBlur = 0;

      const coins = Storage.getGameWallet('helicopter');
      ctx.fillStyle = '#ffd86b'; ctx.font = '16px ui-monospace, monospace';
      ctx.fillText('Hangar fund: ● ' + coins, W/2, 128);

      this.shopRects = [];
      const cardW = 180, cardH = 200, gap = 18;
      const totalW = cardW * PERKS.length + gap * (PERKS.length - 1);
      const startX = (W - totalW) / 2;
      const y = 180;
      PERKS.forEach((p, i) => {
        const x = startX + i * (cardW + gap);
        const owned = !!this.save.perks[p.id];
        const broke = !owned && coins < p.cost;
        const rect = { x, y, w: cardW, h: cardH, kind: 'perk', perk: p };
        this.shopRects.push(rect);
        ctx.fillStyle = owned ? '#1a2818' : '#0e1426';
        ctx.fillRect(x, y, cardW, cardH);
        ctx.strokeStyle = owned ? '#4ade80' : (broke ? '#5a3424' : '#ffd86b');
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, cardW, cardH);
        ctx.fillStyle = owned ? '#4ade80' : '#ffd86b';
        ctx.font = 'bold 16px ui-monospace, monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(p.name, x + cardW/2, y + 16);
        ctx.fillStyle = '#fff'; ctx.font = '13px ui-monospace, monospace';
        wrapText(ctx, p.desc, x + cardW/2, y + 60, cardW - 20, 16);
        ctx.fillStyle = owned ? '#4ade80' : (broke ? '#ff5e7e' : '#ffd86b');
        ctx.font = 'bold 16px ui-monospace, monospace';
        ctx.fillText(owned ? 'OWNED' : ('● ' + p.cost), x + cardW/2, y + cardH - 32);
      });

      // Continue button
      const cw = 280, ch = 50;
      const cx = (W - cw) / 2, cy = 430;
      this.shopRects.push({ x: cx, y: cy, w: cw, h: ch, kind: 'continue' });
      ctx.fillStyle = '#1a4a2a'; ctx.fillRect(cx, cy, cw, ch);
      ctx.strokeStyle = '#4ade80'; ctx.lineWidth = 2;
      ctx.strokeRect(cx, cy, cw, ch);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 18px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('LAUNCH NEXT BIOME →', W/2, cy + ch/2);

      if (this.shopMsg) {
        ctx.fillStyle = '#cfe9ff'; ctx.font = '13px ui-monospace, monospace';
        ctx.fillText(this.shopMsg, W/2, 410);
      }
    }

    _renderVictory(ctx) {
      this._dimCurtain(ctx, 0.7);
      ctx.fillStyle = '#ffd86b';
      ctx.font = 'bold 56px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = '#ffd86b'; ctx.shadowBlur = 24;
      ctx.fillText('ORBIT CLEAR', W/2, 200);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#cfe9ff'; ctx.font = '18px ui-monospace, monospace';
      ctx.fillText('All four biomes felled. The satellite array is silent.', W/2, 270);
      ctx.fillStyle = '#fff'; ctx.font = '14px ui-monospace, monospace';
      ctx.fillText('Final score: ' + this.score, W/2, 320);
      if (this._phaseTimer > 1.0) {
        ctx.fillStyle = '#ffd86b'; ctx.font = 'bold 16px ui-monospace, monospace';
        ctx.fillText('Click to finish', W/2, 410);
      }
    }

    _dimCurtain(ctx, alpha) {
      ctx.fillStyle = 'rgba(0,0,0,' + alpha + ')';
      ctx.fillRect(0, 0, W, H);
    }
  }

  // ---------------- helpers ----------------
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  // Cheap deterministic 1D smooth noise via hashed sin
  function noise(x) {
    const s = Math.sin(x * 12.9898) * 43758.5453;
    const f = s - Math.floor(s);
    return 0.5 + Math.sin(x * 1.7) * 0.25 + (f - 0.5) * 0.4;
  }

  function wrapText(ctx, text, cx, y, maxW, lineH) {
    const words = text.split(' ');
    let line = '';
    let yy = y;
    for (const w of words) {
      const test = line ? (line + ' ' + w) : w;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, cx, yy);
        line = w; yy += lineH;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, cx, yy);
  }

  NDP.attachGame('helicopter', HelicopterGame);
})();
