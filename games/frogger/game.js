/* Frogger — Five-Day Highway.
   ----------------------------------------------------------------------------
   A 5-day campaign. Each day stacks a new hazard onto the classic road + river
   layout. Day 5 culminates in the Highway Hawk boss — a swooping shadow that
   telegraphs a column then dives straight down across the road. Survive three
   swoops while planting the trophy frog on the centre pad.

   Run flow:
     intro → daySplash → play → dayClear → shop → daySplash → … → boss →
     bossClear → victory.

   Persistence (Storage.getGameData('frogger')):
     bestDay         — furthest day reached
     perks {hop,detector,spare,speed} — bought once, persist forever
     defeatedHawk    — true after first victory
     totalCrossings  — lifetime pads filled

   Perks are bought between days from the global coin pool.
*/
(function () {
  const NDP = window.NDP;
  const { BaseGame, Input, Sprites } = NDP.Engine;
  const Storage = NDP.Engine.Storage;

  // ---- Layout ---------------------------------------------------------------
  const W = 960, H = 600;
  const COLS = 16;
  const CELL = W / COLS;       // 60
  const ROWS = 12;
  const ROW_H = H / ROWS;      // 50

  const HOME_ROW   = 0;
  const RIVER_ROWS = [1, 2, 3, 4];
  const MEDIAN_ROW = 5;
  const ROAD_ROWS  = [6, 7, 8, 9];
  const START_ROW  = 10;
  const BOTTOM_ROW = 11;

  const HOME_SLOTS = 5;        // visual pad slots; per-day target ≤ HOME_SLOTS

  // ---- Day definitions ------------------------------------------------------
  const DAYS = [
    { n:1, name:'CROSSING DAY',   target: 3, hazards: { snake:false, truck:false, croc:false, lily:false, lightning:false }, intro:'Welcome to Riverside. Hop the road and the river. Fill three pads.' },
    { n:2, name:'GRASSLAND',      target: 3, hazards: { snake:true,  truck:false, croc:false, lily:false, lightning:false }, intro:'A snake patrols the median strip. Time your hop across.' },
    { n:3, name:'TRUCKING HOUR',  target: 4, hazards: { snake:true,  truck:true,  croc:true,  lily:false, lightning:false }, intro:'Long trucks rumble in. Crocs snap at random pads — watch for the warning.' },
    { n:4, name:'STORM RISING',   target: 4, hazards: { snake:true,  truck:true,  croc:true,  lily:true,  lightning:true  }, intro:'Lily pads sink under your weight. Lightning forks down random columns.' },
    { n:5, name:'HIGHWAY HAWK',   target: 5, hazards: { snake:true,  truck:true,  croc:true,  lily:true,  lightning:true  }, intro:'Fill all five pads. Then the sky opens — beware the Hawk.' }
  ];

  // ---- Persistent perks -----------------------------------------------------
  const PERKS = [
    { id:'hop',      name:'LONG HOP',      cost:30, sprite:'frog.perk_hop',
      desc:'SHIFT + UP skips two lanes. Once per crossing.' },
    { id:'detector', name:'TRAP DETECTOR', cost:25, sprite:'frog.perk_detector',
      desc:'Warning marker over imminent crocs, lightning, hawk swoops.' },
    { id:'spare',    name:'SPARE FROG',    cost:45, sprite:'frog.perk_spare',
      desc:'Begin every day with one extra life.' },
    { id:'speed',    name:'QUICK HOP',     cost:20, sprite:'frog.perk_speed',
      desc:'Hop animation finishes in half the time.' }
  ];

  function loadSave() {
    const def = {
      bestDay: 0,
      perks: { hop:false, detector:false, spare:false, speed:false },
      defeatedHawk: false,
      totalCrossings: 0
    };
    const saved = Storage.getGameData('frogger') || {};
    const merged = Object.assign({}, def, saved);
    merged.perks = Object.assign({}, def.perks, saved.perks || {});
    return merged;
  }
  function saveData(d) { Storage.setGameData('frogger', d); }

  function ptInRect(x, y, r) { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // ===========================================================================
  class FroggerGame extends BaseGame {
    init() {
      this.save = loadSave();
      // phase: intro | daySplash | play | dayClear | shop | boss | bossClear | victory
      this.phase = 'intro';
      this.dayIx = 0;
      this.lives = 0;
      this.dayPadsFilled = 0;
      // Milestone counters for global theme-shop coins (see coinsEarned()).
      // Pickup-driven score still funds the per-game frog wallet via onEnd().
      this.daysCompletedThisRun = 0;
      this.victoryAchieved = false;
      this.shopRects = [];
      this.feedback = null;

      this.frog = this._makeFrog();
      this.cars = [];
      this.logs = [];
      this.turtles = [];
      this.snakes = [];
      this.lilies = [];        // sinking-lily rides (flagged in logs[])
      this.crocs = [];         // pad-snapping crocs
      this.lightnings = [];    // active warnings + bolts
      this.fly = null;         // collectible bonus
      this.flySpawnT = 0;
      this.lightningT = 0;
      this.crocT = 0;
      this.hawk = null;
      this.bossSwoopCount = 0;
      this.bossTrophyFilled = false;
      this.deepestRow = START_ROW;
      this.attachedTo = null;
      this.standingLily = null;
      this.standingT = 0;
      this.longHopArmed = false;
      this.victoryTimer = 0;

      this.homes = Array.from({ length: HOME_SLOTS }, () => ({
        filled: false, t: 0, blocked: false
      }));

      this.sfx = this.makeSfx({
        hop:      { freq: 360, type: 'square',   dur: 0.05, slide: 220, vol: 0.18 },
        bigHop:   { freq: 320, type: 'triangle', dur: 0.18, slide: 360, vol: 0.32 },
        die:      { freq: 220, type: 'sawtooth', dur: 0.45, slide: -150, vol: 0.45 },
        home:     { freq: 660, type: 'triangle', dur: 0.25, slide: 400, vol: 0.4 },
        win:      { freq: 880, type: 'triangle', dur: 0.4,  slide: 600, vol: 0.55 },
        warn:     { freq: 540, type: 'square',   dur: 0.08, vol: 0.22 },
        thunder:  { freq: 110, type: 'sawtooth', dur: 0.32, slide: -60, vol: 0.5 },
        snap:     { freq: 280, type: 'square',   dur: 0.1,  slide: -120, vol: 0.4 },
        fly:      { freq: 990, type: 'triangle', dur: 0.12, slide: 300, vol: 0.35 },
        sink:     { freq: 240, type: 'sine',     dur: 0.4,  slide: -120, vol: 0.3 },
        hawkCry:  { freq: 720, type: 'sawtooth', dur: 0.35, slide: -260, vol: 0.55 },
        buy:      { freq:1100, type: 'square',   dur: 0.1,  vol: 0.4 }
      });

      Sprites.preload([
        'frog.frog', 'frog.car_red', 'frog.car_yellow', 'frog.car_blue',
        'frog.car_purple', 'frog.truck', 'frog.log_short', 'frog.log_long',
        'frog.turtle', 'frog.snake', 'frog.croc', 'frog.lily',
        'frog.lightning', 'frog.hawk'
      ], 100, 60);

      this._refreshHud();
    }

    _makeFrog() {
      const col = 7;
      return {
        col, row: START_ROW, hopT: 0,
        fromX: this.cellX(col), fromY: this.cellY(START_ROW),
        toX: this.cellX(col), toY: this.cellY(START_ROW),
        x: this.cellX(col), y: this.cellY(START_ROW),
        facing: 'up'
      };
    }

    onEnd(score) {
      this.save.bestDay = Math.max(this.save.bestDay, this.dayIx + 1);
      saveData(this.save);
      // Old earn rate (score / 50) now feeds the per-game frog wallet.
      // Pickup-driven score lives there; theme-shop coins come from milestones.
      const purse = Math.max(0, Math.floor((score | 0) / 50));
      if (purse > 0) Storage.addGameWallet('frogger', purse);
    }

    // Global theme-shop coins: 4 per day completed this run + 20 victory bonus.
    coinsEarned(/*score*/) {
      return (this.daysCompletedThisRun | 0) * 4 + (this.victoryAchieved ? 20 : 0);
    }

    cellX(col) { return col * CELL + CELL / 2; }
    cellY(row) { return row * ROW_H + ROW_H / 2; }
    hopDuration() { return this.save.perks.speed ? 0.07 : 0.14; }

    _refreshHud() {
      const day = DAYS[this.dayIx];
      const dayLabel = `<b>${day ? day.n : '–'}/5</b>`;
      let mid;
      if (this.phase === 'boss') {
        mid = `<span>Hawk <b>${Math.min(3, this.bossSwoopCount)}/3</b></span>`;
      } else {
        const target = day ? day.target : '–';
        mid = `<span>Pads <b>${this.dayPadsFilled}/${target}</b></span>`;
      }
      this.setHud(
        `<span>Day ${dayLabel}</span>` +
        mid +
        `<span>Lives <b>${this.lives}</b></span>` +
        `<span>Score <b>${this.score}</b></span>`
      );
    }

    // =========================================================================
    // PHASE MACHINE
    update(dt) {
      switch (this.phase) {
        case 'intro':     return this._updateIntro();
        case 'daySplash': return this._updateDaySplash();
        case 'play':      return this._updatePlay(dt);
        case 'dayClear':  return this._updateDayClear();
        case 'shop':      return this._updateShop();
        case 'boss':      return this._updateBoss(dt);
        case 'bossClear': return this._updateBossClear();
        case 'victory':   return this._updateVictory(dt);
      }
    }

    render(ctx) {
      this._renderBackdrop(ctx);
      switch (this.phase) {
        case 'intro':     return this._renderIntro(ctx);
        case 'daySplash': return this._renderDaySplash(ctx);
        case 'play':      return this._renderPlay(ctx);
        case 'dayClear':  return this._renderDayClear(ctx);
        case 'shop':      return this._renderShop(ctx);
        case 'boss':      return this._renderBoss(ctx);
        case 'bossClear': return this._renderBossClear(ctx);
        case 'victory':   return this._renderVictory(ctx);
      }
    }

    // ---- intro ---------------------------------------------------------------
    _updateIntro() {
      this._refreshHud();
      if (Input.mouse.justPressed) {
        Input.mouse.justPressed = false;
        this.dayIx = 0;
        this.phase = 'daySplash';
      }
    }

    // ---- daySplash -----------------------------------------------------------
    _updateDaySplash() {
      this._refreshHud();
      if (Input.mouse.justPressed) {
        Input.mouse.justPressed = false;
        this._startDay(this.dayIx);
      }
    }

    // ---- play ----------------------------------------------------------------
    _startDay(ix) {
      const day = DAYS[ix];
      this.phase = 'play';
      this.dayPadsFilled = 0;
      this.lives = 3 + (this.save.perks.spare ? 1 : 0);
      this.cars = []; this.logs = []; this.turtles = [];
      this.snakes = []; this.lilies = []; this.crocs = [];
      this.lightnings = []; this.fly = null;
      this.flySpawnT = 4 + Math.random() * 4;
      this.lightningT = 5 + Math.random() * 4;
      this.crocT = 4 + Math.random() * 3;
      this.hawk = null;
      this.bossSwoopCount = 0;
      this.bossTrophyFilled = false;
      this.homes.forEach(h => { h.filled = false; h.t = 0; h.blocked = false; });
      this.longHopArmed = !!this.save.perks.hop;
      this._spawnTraffic(day);
      this._spawnRiver(day);
      if (day.hazards.snake) this._spawnSnake();
      this._resetFrog();
    }

    _spawnTraffic(day) {
      const carColors = ['frog.car_red', 'frog.car_yellow', 'frog.car_blue', 'frog.car_purple'];
      ROAD_ROWS.forEach((row, i) => {
        const dir = i % 2 === 0 ? -1 : 1;
        const baseSpeed = 110 + i * 30 + day.n * 8;
        const speed = baseSpeed * dir;
        const useTruck = day.hazards.truck && (i === 1 || i === 2);
        if (useTruck && i === 2) {
          // dedicated truck lane
          const gap = 360;
          const count = Math.ceil((W + 200) / gap);
          for (let k = 0; k < count; k++) {
            this.cars.push({
              row, kind: 'truck',
              x: k * gap + 100,
              w: 130, h: 36,
              speed, sprite: 'frog.truck'
            });
          }
        } else {
          const gap = 200 + i * 30 + (day.n > 2 ? -10 : 0);
          const count = Math.ceil((W + 200) / gap);
          for (let k = 0; k < count; k++) {
            this.cars.push({
              row, kind: 'car',
              x: k * gap + (i * 60),
              w: 56, h: 32,
              speed, sprite: carColors[i % carColors.length]
            });
          }
        }
      });
    }

    _spawnRiver(day) {
      RIVER_ROWS.forEach((row, i) => {
        const dir = i % 2 === 0 ? 1 : -1;
        const speed = (62 + i * 18 + day.n * 4) * dir;
        const isTurtleLane = (i === 1);
        if (isTurtleLane) {
          const gap = 220;
          const count = Math.ceil((W + 200) / gap);
          for (let k = 0; k < count; k++) {
            this.turtles.push({
              row, x: k * gap + 80,
              w: 96, h: 30, speed,
              divePhase: Math.random() * Math.PI * 2
            });
          }
        } else {
          const isLong = (i === 0 || i === 3);
          const w = isLong ? 200 : 140;
          const sprite = isLong ? 'frog.log_long' : 'frog.log_short';
          const gap = w + 130;
          const count = Math.ceil((W + 200) / gap);
          for (let k = 0; k < count; k++) {
            // On lily-pad lanes (Day 4+), occasional logs are lilies that sink.
            const lilyEligible = day.hazards.lily && i === 0;
            const isLily = lilyEligible && (k % 2 === 0);
            this.logs.push({
              row, x: k * gap, w, h: 30, speed,
              sprite: isLily ? 'frog.lily' : sprite,
              isLily, sinkT: 0
            });
          }
        }
      });
    }

    _spawnSnake() {
      const speed = 70;
      this.snakes.push({
        row: MEDIAN_ROW, x: 0, w: 110, h: 30,
        speed: speed * (Math.random() < 0.5 ? 1 : -1),
        bob: 0
      });
    }

    _spawnFly() {
      const open = this.homes.map((h, i) => i).filter(i => !this.homes[i].filled && !this.homes[i].blocked);
      if (!open.length) return;
      const ix = open[Math.floor(Math.random() * open.length)];
      const slotW = W / HOME_SLOTS;
      this.fly = {
        ix, x: (ix + 0.5) * slotW, y: this.cellY(HOME_ROW),
        life: 4, maxLife: 4, bob: 0
      };
    }

    _scheduleCroc() {
      const day = DAYS[this.dayIx];
      if (!day || !day.hazards.croc) return;
      const open = this.homes.map((h, i) => i).filter(i => !this.homes[i].filled);
      if (!open.length) return;
      const ix = open[Math.floor(Math.random() * open.length)];
      this.crocs.push({ ix, warn: 1.4, bite: 0, lifetime: 2.2 });
      this.sfx.play('warn');
    }

    _scheduleLightning() {
      const day = DAYS[this.dayIx];
      if (!day || !day.hazards.lightning) return;
      const col = Math.floor(Math.random() * COLS);
      // Telegraph 1.0s, then strike 0.35s.
      this.lightnings.push({ col, warn: 1.0, strike: 0 });
      this.sfx.play('warn');
    }

    _updatePlay(dt) {
      const day = DAYS[this.dayIx];

      // Move traffic --------------------------------------------------------
      this._scrollEntities(this.cars, dt, 130);
      this._scrollEntities(this.logs, dt, 220);
      this._scrollEntities(this.turtles, dt, 220);
      for (const t of this.turtles) t.divePhase += dt * 1.4;
      this._scrollEntities(this.snakes, dt, 220);
      for (const s of this.snakes) s.bob += dt * 4;

      // Lily sink — applies to whichever log the frog is currently riding.
      for (const l of this.logs) {
        if (!l.isLily) continue;
        if (this.standingLily === l) {
          l.sinkT += dt;
          if (l.sinkT > 4 && this.attachedTo === l) {
            this.attachedTo = null;
            this.standingLily = null;
            this.sfx.play('sink');
            return this._die('sink');
          }
        } else if (l.sinkT > 0) {
          // recover when not stood on
          l.sinkT = Math.max(0, l.sinkT - dt * 0.5);
        }
      }

      // Croc + lightning scheduling ---------------------------------------
      this.crocT -= dt;
      if (this.crocT <= 0) {
        this._scheduleCroc();
        this.crocT = 4.5 + Math.random() * 2.5;
      }
      this.lightningT -= dt;
      if (this.lightningT <= 0) {
        this._scheduleLightning();
        this.lightningT = 5 + Math.random() * 4;
      }
      // Update active crocs
      for (let i = this.crocs.length - 1; i >= 0; i--) {
        const c = this.crocs[i];
        if (c.warn > 0) {
          c.warn -= dt;
          if (c.warn <= 0) { c.bite = c.lifetime; this.sfx.play('snap'); this.homes[c.ix].blocked = true; }
        } else {
          c.bite -= dt;
          if (c.bite <= 0) { this.homes[c.ix].blocked = false; this.crocs.splice(i, 1); }
        }
      }
      // Update lightning
      for (let i = this.lightnings.length - 1; i >= 0; i--) {
        const lt = this.lightnings[i];
        if (lt.warn > 0) {
          lt.warn -= dt;
          if (lt.warn <= 0) {
            lt.strike = 0.35;
            this.sfx.play('thunder');
            this.shake(8, 0.25);
            this.flash('#ffd86b', 0.12);
          }
        } else {
          lt.strike -= dt;
          if (lt.strike <= 0) this.lightnings.splice(i, 1);
        }
      }

      // Fly bonus -----------------------------------------------------------
      this.flySpawnT -= dt;
      if (this.flySpawnT <= 0 && !this.fly) {
        this._spawnFly();
        this.flySpawnT = 8 + Math.random() * 4;
      }
      if (this.fly) {
        this.fly.bob += dt * 5;
        this.fly.life -= dt;
        if (this.fly.life <= 0 || this.homes[this.fly.ix].filled || this.homes[this.fly.ix].blocked) {
          this.fly = null;
        }
      }

      // Frog input ----------------------------------------------------------
      this._readFrogInput();

      // Animate frog hop ----------------------------------------------------
      if (this.frog.hopT > 0) {
        this.frog.hopT -= dt / this.hopDuration();
        if (this.frog.hopT <= 0) {
          this.frog.hopT = 0;
          this.frog.x = this.frog.toX;
          this.frog.y = this.frog.toY;
          this._onLand();
        } else {
          const k = 1 - this.frog.hopT;
          this.frog.x = lerp(this.frog.fromX, this.frog.toX, k);
          this.frog.y = lerp(this.frog.fromY, this.frog.toY, k);
        }
      } else {
        if (this.attachedTo) {
          this.frog.x += this.attachedTo.speed * dt;
          this.frog.col = Math.round((this.frog.x - CELL / 2) / CELL);
          if (this.frog.x < -CELL / 2 || this.frog.x > W + CELL / 2) {
            return this._die('drift');
          }
        }
        this._checkHazards();
      }

      // Animate home pads
      for (const h of this.homes) if (h.filled) h.t += dt;

      this._tickFeedback(dt);
      this._refreshHud();

      // Day clear?
      if (this.dayPadsFilled >= day.target) {
        this.daysCompletedThisRun++;
        if (this.dayIx === DAYS.length - 1) {
          // Day 5 → boss
          this._enterBoss();
        } else {
          this.phase = 'dayClear';
        }
      }
    }

    _scrollEntities(arr, dt, wrap) {
      for (const e of arr) {
        e.x += e.speed * dt;
        if (e.speed > 0 && e.x > W + wrap) e.x -= W + wrap * 2;
        if (e.speed < 0 && e.x < -wrap)    e.x += W + wrap * 2;
      }
    }

    _readFrogInput() {
      if (this.frog.hopT > 0) return;
      const k = Input.keys;
      let dCol = 0, dRow = 0;
      const shift = k['Shift'] || k['ShiftLeft'] || k['ShiftRight'];

      if (k['ArrowUp']    || k['w'] || k['W']) dRow = -1;
      else if (k['ArrowDown']  || k['s'] || k['S']) dRow = 1;
      else if (k['ArrowLeft']  || k['a'] || k['A']) dCol = -1;
      else if (k['ArrowRight'] || k['d'] || k['D']) dCol = 1;

      if (!dCol && !dRow) return;

      // Drain so a single press = single hop.
      if (dRow === -1) { delete k['ArrowUp']; delete k['w']; delete k['W']; }
      if (dRow ===  1) { delete k['ArrowDown']; delete k['s']; delete k['S']; }
      if (dCol === -1) { delete k['ArrowLeft']; delete k['a']; delete k['A']; }
      if (dCol ===  1) { delete k['ArrowRight']; delete k['d']; delete k['D']; }

      // Long Hop perk: SHIFT + UP consumes the single charge for a 2-row hop.
      let hopRows = 1;
      if (dRow === -1 && shift && this.longHopArmed) {
        hopRows = 2;
        this.longHopArmed = false;
        this.sfx.play('bigHop');
      }

      const nCol = clamp(this.frog.col + dCol, 0, COLS - 1);
      const nRow = clamp(this.frog.row + dRow * hopRows, HOME_ROW, BOTTOM_ROW);
      if (nCol === this.frog.col && nRow === this.frog.row) return;
      this._startHop(nCol, nRow, dRow, dCol);
    }

    _startHop(nCol, nRow, dRow, dCol) {
      this.frog.fromX = this.frog.x;
      this.frog.fromY = this.frog.y;
      this.frog.toX = this.cellX(nCol);
      this.frog.toY = this.cellY(nRow);
      this.frog.col = nCol;
      this.frog.row = nRow;
      this.frog.hopT = 1;
      this.frog.facing = dRow === -1 ? 'up' : dRow === 1 ? 'down' : dCol < 0 ? 'left' : 'right';
      this.attachedTo = null;
      this.standingLily = null;
      this.sfx.play('hop', { freq: 320 + Math.random() * 80 });
      if (nRow < this.deepestRow) {
        this.deepestRow = nRow;
        this.addScore(10);
      }
    }

    _onLand() {
      if (this.frog.row === HOME_ROW) {
        this._checkHomeLanding();
        return;
      }
      this._checkHazards();
    }

    _checkHomeLanding() {
      const slotW = W / HOME_SLOTS;
      const idx = Math.floor(this.frog.x / slotW);
      const home = this.homes[idx];
      if (!home || home.filled) return this._die('miss');
      if (home.blocked) {
        this.flash('#ff3a3a', 0.25);
        return this._die('croc');
      }
      const padCx = (idx + 0.5) * slotW;
      if (Math.abs(this.frog.x - padCx) > slotW * 0.45) return this._die('miss');

      // In the boss phase the centre pad is the trophy.
      home.filled = true; home.t = 0;
      this.dayPadsFilled++;
      this.save.totalCrossings++;
      saveData(this.save);
      this.addScore(150);
      this.sfx.play('home');
      this.shake(4, 0.2);
      this.flash('#4ade80', 0.18);
      this.particles.burst(padCx, this.cellY(HOME_ROW), 26, {
        color: '#ffd86b', speed: 220, life: 0.6, size: 3
      });

      // Fly bonus collected on landing
      if (this.fly && this.fly.ix === idx) {
        this.addScore(25);
        this._showFeedback('+25 FLY!', this.fly.x, this.fly.y - 12, '#ffd86b');
        this.particles.burst(this.fly.x, this.fly.y, 12, {
          color: '#ffd86b', speed: 240, life: 0.5
        });
        this.fly = null;
        this.sfx.play('fly');
      }

      this.longHopArmed = !!this.save.perks.hop;
      this._resetFrog();
    }

    _checkHazards() {
      const r = this.frog.row;

      // Lightning kill if frog stuck in striking column
      for (const lt of this.lightnings) {
        if (lt.strike > 0) {
          const cx = lt.col * CELL + CELL / 2;
          if (Math.abs(this.frog.x - cx) < CELL * 0.55 && r < START_ROW) {
            return this._die('lightning');
          }
        }
      }

      if (r === MEDIAN_ROW) {
        for (const s of this.snakes) {
          if (Math.abs(this.frog.x - s.x) < s.w * 0.45) return this._die('snake');
        }
      } else if (ROAD_ROWS.includes(r)) {
        for (const c of this.cars) {
          if (c.row !== r) continue;
          if (this.frog.x > c.x - c.w / 2 && this.frog.x < c.x + c.w / 2) {
            return this._die('car');
          }
        }
      } else if (RIVER_ROWS.includes(r)) {
        let ride = null, lily = null;
        for (const l of this.logs) {
          if (l.row !== r) continue;
          if (this.frog.x > l.x - l.w / 2 && this.frog.x < l.x + l.w / 2) {
            ride = l;
            if (l.isLily) lily = l;
            break;
          }
        }
        if (!ride) {
          for (const t of this.turtles) {
            if (t.row !== r) continue;
            if (this.frog.x > t.x - t.w / 2 && this.frog.x < t.x + t.w / 2) {
              const phase = (Math.sin(t.divePhase) + 1) * 0.5;
              if (phase > 0.25) ride = t;
              break;
            }
          }
        }
        if (!ride) return this._die('drown');
        this.attachedTo = ride;
        this.standingLily = lily;
      } else {
        this.attachedTo = null;
        this.standingLily = null;
      }
    }

    _die(reason) {
      this.lives--;
      this.sfx.play('die');
      this.shake(14, 0.4);
      this.flash('#ff3a3a', 0.2);
      const colors = {
        drown:'#7cd9ff', drift:'#7cd9ff', sink:'#7cd9ff',
        car:'#ff5e7e', truck:'#ff5e7e', snake:'#5fbd6e',
        croc:'#ffd86b', lightning:'#ffd86b', miss:'#a855f7',
        hawk:'#3a2814'
      };
      this.particles.burst(this.frog.x, this.frog.y, 28, {
        color: colors[reason] || '#ff3a3a', speed: 240, life: 0.6, size: 3
      });
      this.score = Math.max(0, this.score - 15);
      this._showFeedback('-1 LIFE', this.frog.x, this.frog.y - 20, '#f87171');
      if (this.lives <= 0) {
        return this.gameOver();
      }
      this._resetFrog();
    }

    _resetFrog() {
      this.frog = this._makeFrog();
      this.deepestRow = START_ROW;
      this.attachedTo = null;
      this.standingLily = null;
    }

    _showFeedback(text, x, y, color) {
      this.feedback = { text, x, y, color, age: 0, life: 1.2 };
    }

    _tickFeedback(dt) {
      if (!this.feedback) return;
      this.feedback.age += dt;
      this.feedback.y -= 30 * dt;
      if (this.feedback.age > this.feedback.life) this.feedback = null;
    }

    // ---- dayClear ------------------------------------------------------------
    _updateDayClear() {
      this._refreshHud();
      if (Input.mouse.justPressed) {
        Input.mouse.justPressed = false;
        this.save.bestDay = Math.max(this.save.bestDay, this.dayIx + 1);
        saveData(this.save);
        this.phase = 'shop';
      }
    }

    // ---- shop ----------------------------------------------------------------
    _updateShop() {
      this._refreshHud();
      if (!Input.mouse.justPressed) return;
      Input.mouse.justPressed = false;
      const mx = Input.mouse.x, my = Input.mouse.y;
      for (const r of this.shopRects) {
        if (!ptInRect(mx, my, r)) continue;
        if (r.kind === 'continue') {
          this.dayIx++;
          this.phase = 'daySplash';
          return;
        }
        if (r.kind === 'perk') {
          const p = r.perk;
          if (this.save.perks[p.id]) return;
          if (Storage.getGameWallet('frogger') < p.cost) return;
          if (!Storage.spendGameWallet('frogger', p.cost)) return;
          this.save.perks[p.id] = true;
          saveData(this.save);
          this.sfx.play('buy');
          this.particles.burst(r.x + r.w / 2, r.y + r.h / 2, 16, {
            color: '#ffd86b', speed: 180, life: 0.6
          });
        }
        return;
      }
    }

    // ---- boss ----------------------------------------------------------------
    _enterBoss() {
      this.phase = 'boss';
      this.bossSwoopCount = 0;
      this.bossTrophyFilled = false;
      // Wipe pads, reserve trophy at centre.
      this.homes.forEach((h, i) => {
        h.filled = false; h.t = 0; h.blocked = (i !== Math.floor(HOME_SLOTS / 2));
      });
      this.cars = []; this.logs = []; this.turtles = [];
      this.snakes = []; this.lilies = []; this.crocs = []; this.lightnings = [];
      this.fly = null;
      const day = DAYS[DAYS.length - 1];
      this._spawnTraffic(day);
      this._spawnRiver(day);
      this._spawnSnake();
      this.hawk = { state: 'idle', col: 0, t: 0, swoopY: -120 };
      this.bossT = 1.5;        // first telegraph delay
      this.sfx.play('hawkCry');
      this.flash('#1a1208', 0.35);
      this.shake(10, 0.5);
      this._resetFrog();
    }

    _updateBoss(dt) {
      // Standard hazards still update.
      this._scrollEntities(this.cars, dt, 130);
      this._scrollEntities(this.logs, dt, 220);
      this._scrollEntities(this.turtles, dt, 220);
      for (const t of this.turtles) t.divePhase += dt * 1.4;
      this._scrollEntities(this.snakes, dt, 220);
      for (const s of this.snakes) s.bob += dt * 4;

      // Hawk state machine -------------------------------------------------
      const hawk = this.hawk;
      if (hawk.state === 'idle') {
        this.bossT -= dt;
        if (this.bossT <= 0) {
          // Pick a column biased toward the frog.
          const targetCol = Math.random() < 0.6 ? this.frog.col
                           : Math.floor(Math.random() * COLS);
          hawk.col = clamp(targetCol + (Math.random() < 0.5 ? -1 : 1), 0, COLS - 1);
          hawk.state = 'telegraph';
          hawk.t = 1.0;
          hawk.swoopY = -120;
          this.sfx.play('warn');
        }
      } else if (hawk.state === 'telegraph') {
        hawk.t -= dt;
        if (hawk.t <= 0) {
          hawk.state = 'swoop';
          hawk.t = 0;
          this.sfx.play('hawkCry');
        }
      } else if (hawk.state === 'swoop') {
        hawk.t += dt;
        const dur = 0.55;
        const k = clamp(hawk.t / dur, 0, 1);
        // Down then back up.
        const ease = k < 0.5 ? (k * 2) : (2 - k * 2);
        hawk.swoopY = -120 + ease * (H + 120);
        // Hit detection.
        const cx = hawk.col * CELL + CELL / 2;
        if (k > 0.15 && k < 0.85 && Math.abs(this.frog.x - cx) < CELL * 0.55 &&
            Math.abs(this.frog.y - hawk.swoopY) < 60) {
          this.shake(18, 0.5);
          return this._die('hawk');
        }
        if (hawk.t >= dur) {
          hawk.state = 'idle';
          hawk.swoopY = -120;
          this.bossSwoopCount++;
          this.bossT = 2.4 + Math.random() * 1.2;
        }
      }

      // Frog input + animation
      this._readFrogInput();
      if (this.frog.hopT > 0) {
        this.frog.hopT -= dt / this.hopDuration();
        if (this.frog.hopT <= 0) {
          this.frog.hopT = 0;
          this.frog.x = this.frog.toX;
          this.frog.y = this.frog.toY;
          this._onBossLand();
        } else {
          const k = 1 - this.frog.hopT;
          this.frog.x = lerp(this.frog.fromX, this.frog.toX, k);
          this.frog.y = lerp(this.frog.fromY, this.frog.toY, k);
        }
      } else {
        if (this.attachedTo) {
          this.frog.x += this.attachedTo.speed * dt;
          this.frog.col = Math.round((this.frog.x - CELL / 2) / CELL);
          if (this.frog.x < -CELL / 2 || this.frog.x > W + CELL / 2) {
            return this._die('drift');
          }
        }
        this._checkHazards();
      }

      this._tickFeedback(dt);
      this._refreshHud();

      // Win when both swoops survived and trophy collected.
      if (this.bossTrophyFilled && this.bossSwoopCount >= 3) {
        this.save.defeatedHawk = true;
        this.save.bestDay = DAYS.length;
        saveData(this.save);
        // The hawk falling closes Day 5 — count it as a completed day for
        // milestone payouts, then mark the run as victorious.
        this.daysCompletedThisRun++;
        this.victoryAchieved = true;
        this.phase = 'bossClear';
      }
    }

    _onBossLand() {
      if (this.frog.row !== HOME_ROW) {
        this._checkHazards();
        return;
      }
      const slotW = W / HOME_SLOTS;
      const idx = Math.floor(this.frog.x / slotW);
      const trophy = Math.floor(HOME_SLOTS / 2);
      if (idx !== trophy) return this._die('miss');
      const padCx = (idx + 0.5) * slotW;
      if (Math.abs(this.frog.x - padCx) > slotW * 0.45) return this._die('miss');
      this.bossTrophyFilled = true;
      this.homes[idx].filled = true; this.homes[idx].t = 0;
      this.addScore(500);
      this.sfx.play('home');
      this.flash('#ffd86b', 0.4);
      this.shake(10, 0.5);
      this.particles.burst(padCx, this.cellY(HOME_ROW), 80, {
        color: '#ffd86b', speed: 320, life: 1.0
      });
      this._showFeedback('TROPHY!', padCx, this.cellY(HOME_ROW) - 18, '#ffd86b');
      this._resetFrog();
    }

    // ---- bossClear / victory -------------------------------------------------
    _updateBossClear() {
      this._refreshHud();
      if (Input.mouse.justPressed) {
        Input.mouse.justPressed = false;
        this.phase = 'victory';
        this.victoryTimer = 0;
        this.particles.burst(W / 2, H / 2, 100, { color: '#ffd86b', speed: 360, life: 1.0 });
        this.sfx.play('win');
      }
    }
    _updateVictory(dt) {
      this.victoryTimer += dt;
      if (Input.mouse.justPressed) {
        Input.mouse.justPressed = false;
        this.win();
      }
    }

    // =========================================================================
    // RENDER
    _renderBackdrop(ctx) {
      ctx.fillStyle = '#0d1f12';
      ctx.fillRect(0, 0, W, H);
    }

    _renderIntro(ctx) {
      const cx = W / 2;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#4ade80'; ctx.font = 'bold 40px ui-monospace, monospace';
      ctx.shadowColor = '#4ade80'; ctx.shadowBlur = 14;
      ctx.fillText('FROGGER · FIVE DAYS', cx, 110);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff'; ctx.font = '16px ui-monospace, monospace';
      ctx.fillText('Hop the road and the river. New hazards every day.', cx, 162);
      ctx.fillText('Day 5 unleashes the Highway Hawk.', cx, 188);

      // Frog parade
      Sprites.draw(ctx, 'frog.frog', cx - 220, 280, 90, 90);
      Sprites.draw(ctx, 'frog.snake', cx - 90, 280, 130, 50);
      Sprites.draw(ctx, 'frog.croc', cx + 60, 280, 80, 80);
      Sprites.draw(ctx, 'frog.hawk', cx + 220, 290, 200, 120);

      ctx.fillStyle = '#7a6090'; ctx.font = '13px ui-monospace, monospace';
      const owned = Object.values(this.save.perks).filter(Boolean).length;
      ctx.fillText(
        `Best day ${this.save.bestDay}/5  ·  Crossings ${this.save.totalCrossings}  ·  Perks ${owned}/${PERKS.length}` +
        (this.save.defeatedHawk ? '  ·  HAWK SLAIN' : ''),
        cx, 460);

      ctx.fillStyle = '#fff'; ctx.font = 'bold 18px ui-monospace, monospace';
      ctx.fillText('Click to start Day 1', cx, 510);

      ctx.fillStyle = '#7a8090'; ctx.font = '12px ui-monospace, monospace';
      ctx.fillText('Arrows / WASD to hop  ·  SHIFT + UP for Long Hop (perk)', cx, 540);
    }

    _renderDaySplash(ctx) {
      const day = DAYS[this.dayIx];
      const cx = W / 2;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffd86b'; ctx.font = 'bold 34px ui-monospace, monospace';
      ctx.shadowColor = '#ffd86b'; ctx.shadowBlur = 14;
      ctx.fillText(`DAY ${day.n} · ${day.name}`, cx, 130);
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#fff'; ctx.font = '15px ui-monospace, monospace';
      ctx.fillText(day.intro, cx, 180);
      ctx.fillStyle = '#7a6090';
      ctx.fillText(`Target: fill ${day.target} pads · Lives ${3 + (this.save.perks.spare ? 1 : 0)}`, cx, 210);

      const newHazards = this._newHazardsThisDay(day);
      if (newHazards.length) {
        ctx.fillStyle = '#4ade80'; ctx.font = 'bold 16px ui-monospace, monospace';
        ctx.fillText('NEW HAZARDS:', cx, 270);
        const startX = cx - (newHazards.length - 1) * 90;
        newHazards.forEach((hz, i) => {
          Sprites.draw(ctx, hz.sprite, startX + i * 180, 320, hz.w, hz.h);
          ctx.fillStyle = '#fff'; ctx.font = '13px ui-monospace, monospace';
          ctx.fillText(hz.name, startX + i * 180, 380);
        });
      }
      if (day.n === DAYS.length) {
        ctx.fillStyle = '#f87171'; ctx.font = 'bold 16px ui-monospace, monospace';
        ctx.fillText('⚠ HIGHWAY HAWK ARRIVES AFTER PADS ARE FILLED ⚠', cx, 430);
      }
      ctx.fillStyle = '#fff'; ctx.font = 'bold 18px ui-monospace, monospace';
      ctx.fillText('Click to begin', cx, 500);
    }

    _newHazardsThisDay(day) {
      const prev = this.dayIx > 0 ? DAYS[this.dayIx - 1].hazards : { snake:false,truck:false,croc:false,lily:false,lightning:false };
      const out = [];
      if (day.hazards.snake && !prev.snake)        out.push({ name:'SNAKE',     sprite:'frog.snake',     w:140, h:50 });
      if (day.hazards.truck && !prev.truck)        out.push({ name:'TRUCK',     sprite:'frog.truck',     w:170, h:50 });
      if (day.hazards.croc && !prev.croc)          out.push({ name:'CROC',      sprite:'frog.croc',      w:80,  h:80 });
      if (day.hazards.lily && !prev.lily)          out.push({ name:'LILY SINK', sprite:'frog.lily',      w:80,  h:80 });
      if (day.hazards.lightning && !prev.lightning) out.push({ name:'LIGHTNING',sprite:'frog.lightning', w:50,  h:90 });
      return out;
    }

    _renderPlay(ctx) {
      this._renderField(ctx, false);
      // Detector overlays
      if (this.save.perks.detector) this._renderDetectorWarnings(ctx);
      this._renderFrog(ctx);
      this._renderFeedback(ctx);
      this._renderHotbar(ctx);
    }

    _renderField(ctx, bossMode) {
      const slotW = W / HOME_SLOTS;

      // Goal strip
      ctx.fillStyle = '#173f24';
      ctx.fillRect(0, this.cellY(HOME_ROW) - ROW_H / 2, W, ROW_H);
      // Home pads
      for (let i = 0; i < HOME_SLOTS; i++) {
        const cx = (i + 0.5) * slotW;
        const cy = this.cellY(HOME_ROW);
        const home = this.homes[i];
        ctx.fillStyle = home.filled ? '#0d2a17' : (home.blocked ? '#3a1414' : '#082010');
        ctx.fillRect(cx - slotW * 0.4, cy - ROW_H * 0.4, slotW * 0.8, ROW_H * 0.8);
        if (bossMode && i === Math.floor(HOME_SLOTS / 2) && !home.filled) {
          ctx.save();
          ctx.shadowColor = '#ffd86b'; ctx.shadowBlur = 14 + Math.sin(this.time * 5) * 4;
          ctx.fillStyle = '#ffd86b';
          ctx.font = 'bold 14px ui-monospace, monospace';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('TROPHY', cx, cy);
          ctx.restore();
        }
        if (home.filled) {
          ctx.save();
          ctx.shadowColor = i === Math.floor(HOME_SLOTS / 2) && bossMode ? '#ffd86b' : '#4ade80';
          ctx.shadowBlur = 12 + Math.sin(home.t * 4) * 4;
          Sprites.draw(ctx, 'frog.frog', cx, cy, 36, 36);
          ctx.restore();
        }
      }
      // Crocs at pads (warning + bite)
      for (const c of this.crocs) {
        const cx = (c.ix + 0.5) * slotW;
        const cy = this.cellY(HOME_ROW);
        if (c.warn > 0) {
          // pulsing red warning frame
          const pulse = (Math.sin(this.time * 18) + 1) * 0.5;
          ctx.strokeStyle = `rgba(255, 80, 80, ${0.5 + pulse * 0.5})`;
          ctx.lineWidth = 3;
          ctx.strokeRect(cx - slotW * 0.4, cy - ROW_H * 0.4, slotW * 0.8, ROW_H * 0.8);
          ctx.fillStyle = '#ff5e7e'; ctx.font = 'bold 22px ui-monospace, monospace';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('!', cx, cy - ROW_H * 0.55);
        } else {
          Sprites.draw(ctx, 'frog.croc', cx, cy + 4, 56, 56);
          ctx.strokeStyle = '#ffd86b'; ctx.lineWidth = 2;
          ctx.strokeRect(cx - slotW * 0.4, cy - ROW_H * 0.4, slotW * 0.8, ROW_H * 0.8);
        }
      }
      // Fly bonus
      if (this.fly) {
        const bob = Math.sin(this.fly.bob) * 2;
        const a = clamp(this.fly.life / 1.5, 0.4, 1);
        ctx.globalAlpha = a;
        ctx.fillStyle = '#ffd86b';
        ctx.beginPath(); ctx.arc(this.fly.x, this.fly.y - 14 + bob, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(124,217,255,0.7)';
        ctx.beginPath(); ctx.ellipse(this.fly.x - 6, this.fly.y - 16 + bob, 4, 2, -0.4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(this.fly.x + 6, this.fly.y - 16 + bob, 4, 2, 0.4, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }

      // River
      const riverY = this.cellY(RIVER_ROWS[0]) - ROW_H / 2;
      ctx.fillStyle = '#0e3b6b';
      ctx.fillRect(0, riverY, W, ROW_H * RIVER_ROWS.length);
      ctx.fillStyle = 'rgba(124,217,255,0.06)';
      for (let i = 0; i < 30; i++) {
        const sx = (i * 73 + (this.time * 60) % 73) % W;
        const sy = riverY + (i * 19) % (ROW_H * RIVER_ROWS.length);
        ctx.fillRect(sx, sy, 12, 2);
      }
      // Median
      ctx.fillStyle = '#1e2a17';
      ctx.fillRect(0, this.cellY(MEDIAN_ROW) - ROW_H / 2, W, ROW_H);
      // Road
      const roadY = this.cellY(ROAD_ROWS[0]) - ROW_H / 2;
      ctx.fillStyle = '#15171c';
      ctx.fillRect(0, roadY, W, ROW_H * ROAD_ROWS.length);
      ctx.strokeStyle = '#ffd86b';
      ctx.setLineDash([20, 18]); ctx.lineWidth = 2;
      for (let i = 1; i < ROAD_ROWS.length; i++) {
        const y = roadY + i * ROW_H;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
      ctx.setLineDash([]);
      // Start strip
      ctx.fillStyle = '#1e2a17';
      ctx.fillRect(0, this.cellY(START_ROW) - ROW_H / 2, W, ROW_H * 2);

      // Logs / lilies
      for (const l of this.logs) {
        const y = this.cellY(l.row);
        if (l.isLily) {
          const sinkFrac = clamp(l.sinkT / 4, 0, 1);
          ctx.globalAlpha = 1 - sinkFrac * 0.5;
          Sprites.draw(ctx, 'frog.lily', l.x, y + sinkFrac * 6, l.w, l.h + 8);
          ctx.globalAlpha = 1;
          if (this.standingLily === l && sinkFrac > 0.05) {
            ctx.fillStyle = `rgba(124,217,255, ${0.4 * sinkFrac})`;
            ctx.fillRect(l.x - l.w / 2, y - l.h / 2, l.w, l.h);
          }
        } else {
          Sprites.draw(ctx, l.sprite, l.x, y, l.w, l.h + 8);
        }
      }
      // Turtles (driven by dive cycle)
      for (const t of this.turtles) {
        const phase = (Math.sin(t.divePhase) + 1) * 0.5;
        const surfaced = phase > 0.25;
        const a = surfaced ? 0.7 + phase * 0.3 : phase * 1.6;
        Sprites.draw(ctx, 'frog.turtle', t.x, this.cellY(t.row), t.w, t.h + 12, { alpha: a });
      }

      // Cars / trucks
      for (const c of this.cars) {
        const y = this.cellY(c.row);
        const flipX = c.speed < 0;
        Sprites.draw(ctx, c.sprite, c.x, y, c.w, c.h + 6, { flipX });
      }
      // Snakes
      for (const s of this.snakes) {
        const y = this.cellY(s.row) + Math.sin(s.bob) * 2;
        Sprites.draw(ctx, 'frog.snake', s.x, y, s.w, s.h + 8, { flipX: s.speed < 0 });
      }

      // Lightning warnings + bolts
      for (const lt of this.lightnings) {
        const cx = lt.col * CELL + CELL / 2;
        const yTop = this.cellY(HOME_ROW) - ROW_H / 2;
        const yBot = this.cellY(START_ROW) - ROW_H / 2;
        if (lt.warn > 0) {
          const flash = 0.3 + (Math.sin(this.time * 22) + 1) * 0.2;
          ctx.fillStyle = `rgba(255, 216, 107, ${flash})`;
          ctx.fillRect(cx - CELL * 0.5, yTop, CELL, yBot - yTop);
          ctx.fillStyle = '#ffd86b';
          ctx.font = 'bold 22px ui-monospace, monospace';
          ctx.textAlign = 'center'; ctx.textBaseline = 'top';
          ctx.fillText('!', cx, 4);
        } else if (lt.strike > 0) {
          const a = lt.strike / 0.35;
          ctx.fillStyle = `rgba(255, 255, 255, ${a * 0.6})`;
          ctx.fillRect(cx - CELL * 0.5, yTop, CELL, yBot - yTop);
          Sprites.draw(ctx, 'frog.lightning', cx, (yTop + yBot) / 2, 60, yBot - yTop);
        }
      }
    }

    _renderDetectorWarnings(ctx) {
      // Show small chevrons above lanes that contain immediate danger.
      const danger = new Set();
      for (const lt of this.lightnings) if (lt.warn > 0 || lt.strike > 0) danger.add('col:' + lt.col);
      for (const c of this.crocs) if (c.warn > 0) danger.add('pad:' + c.ix);
      if (this.hawk && (this.hawk.state === 'telegraph' || this.hawk.state === 'swoop')) {
        danger.add('col:' + this.hawk.col);
      }
      ctx.fillStyle = '#ffd86b';
      ctx.font = 'bold 12px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      for (const tag of danger) {
        const [kind, val] = tag.split(':');
        const ix = +val;
        const x = kind === 'col' ? (ix * CELL + CELL / 2) : ((ix + 0.5) * (W / HOME_SLOTS));
        ctx.fillText('▼', x, 2);
      }
    }

    _renderFrog(ctx) {
      const hopLift = Math.sin((1 - this.frog.hopT) * Math.PI) * 12;
      const rot = this.frog.facing === 'down' ? Math.PI
                : this.frog.facing === 'left' ? -Math.PI / 2
                : this.frog.facing === 'right' ? Math.PI / 2
                : 0;
      ctx.save();
      ctx.shadowColor = '#4ade80'; ctx.shadowBlur = 12;
      Sprites.draw(ctx, 'frog.frog', this.frog.x, this.frog.y - hopLift, 42, 42, { rot });
      ctx.restore();
      // shadow on ground
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(this.frog.x, this.frog.y + 16, 14 - hopLift * 0.3, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    _renderFeedback(ctx) {
      if (!this.feedback) return;
      const a = 1 - this.feedback.age / this.feedback.life;
      ctx.globalAlpha = a;
      ctx.fillStyle = this.feedback.color;
      ctx.font = 'bold 18px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(this.feedback.text, this.feedback.x, this.feedback.y);
      ctx.globalAlpha = 1;
    }

    _renderHotbar(ctx) {
      // Long Hop indicator near frog
      if (this.save.perks.hop && this.longHopArmed) {
        ctx.fillStyle = '#4ade80'; ctx.font = 'bold 11px ui-monospace, monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText('LONG HOP ⇧', this.frog.x, this.frog.y - 24);
      }
    }

    _renderDayClear(ctx) {
      this._renderField(ctx, false);
      ctx.fillStyle = 'rgba(8,12,8,0.78)';
      ctx.fillRect(0, 0, W, H);
      const cx = W / 2;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#4ade80'; ctx.font = 'bold 36px ui-monospace, monospace';
      ctx.shadowColor = '#4ade80'; ctx.shadowBlur = 12;
      ctx.fillText(`DAY ${DAYS[this.dayIx].n} CLEARED`, cx, 200);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff'; ctx.font = '18px ui-monospace, monospace';
      ctx.fillText(`Score so far: ${this.score}`, cx, 260);
      ctx.fillText(`Lives remaining: ${this.lives}`, cx, 290);
      ctx.fillStyle = '#ffd86b'; ctx.font = 'bold 18px ui-monospace, monospace';
      ctx.fillText('Click to visit the marsh shop', cx, 380);
    }

    _renderShop(ctx) {
      const cx = W / 2;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffd86b'; ctx.font = 'bold 30px ui-monospace, monospace';
      ctx.shadowColor = '#ffd86b'; ctx.shadowBlur = 12;
      ctx.fillText('MARSH SHOP', cx, 70);
      ctx.shadowBlur = 0;

      const coins = Storage.getGameWallet('frogger');
      ctx.fillStyle = '#ffd86b'; ctx.font = '16px ui-monospace, monospace';
      ctx.fillText('Marsh purse: ● ' + coins, cx, 105);

      this.shopRects = [];
      const cardW = 200, cardH = 240, gap = 20;
      const totalW = cardW * PERKS.length + gap * (PERKS.length - 1);
      const startX = cx - totalW / 2;
      const y = 140;
      PERKS.forEach((p, i) => {
        const x = startX + i * (cardW + gap);
        const owned = !!this.save.perks[p.id];
        const broke = !owned && coins < p.cost;
        const rect = { x, y, w: cardW, h: cardH, kind: 'perk', perk: p };
        this.shopRects.push(rect);

        ctx.fillStyle = owned ? '#0d2a17' : '#1a0d20';
        ctx.fillRect(x, y, cardW, cardH);
        ctx.strokeStyle = owned ? '#4ade80' : (broke ? '#5a3a4a' : '#ffd86b');
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, cardW, cardH);

        Sprites.draw(ctx, p.sprite, x + cardW / 2, y + 70, 90, 90);

        ctx.fillStyle = owned ? '#4ade80' : '#ffd86b';
        ctx.font = 'bold 16px ui-monospace, monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(p.name, x + cardW / 2, y + 130);

        ctx.fillStyle = '#fff'; ctx.font = '12px ui-monospace, monospace';
        wrapText(ctx, p.desc, x + cardW / 2, y + 162, cardW - 16, 14);

        ctx.fillStyle = owned ? '#7a6090' : (broke ? '#f87171' : '#ffd86b');
        ctx.font = 'bold 14px ui-monospace, monospace';
        ctx.fillText(owned ? 'OWNED' : ('● ' + p.cost), x + cardW / 2, y + cardH - 26);
      });

      const cw = 280, ch = 50;
      const cxR = cx - cw / 2, cyR = 420;
      const r = { x: cxR, y: cyR, w: cw, h: ch, kind: 'continue' };
      this.shopRects.push(r);
      ctx.fillStyle = '#0d2a17'; ctx.fillRect(cxR, cyR, cw, ch);
      ctx.strokeStyle = '#4ade80'; ctx.lineWidth = 2;
      ctx.strokeRect(cxR, cyR, cw, ch);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 18px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(this.dayIx + 1 === DAYS.length - 1 ? 'BEGIN DAY 5' : `BEGIN DAY ${this.dayIx + 2}`, cx, cyR + ch / 2);
    }

    _renderBoss(ctx) {
      this._renderField(ctx, true);
      // Hawk
      const hawk = this.hawk;
      if (hawk) {
        const cx = hawk.col * CELL + CELL / 2;
        if (hawk.state === 'telegraph') {
          // Dim the column.
          const yTop = this.cellY(HOME_ROW) - ROW_H / 2;
          const yBot = this.cellY(START_ROW) + ROW_H / 2;
          ctx.fillStyle = `rgba(0, 0, 0, ${0.55})`;
          ctx.fillRect(cx - CELL * 0.55, yTop, CELL * 1.1, yBot - yTop);
          ctx.strokeStyle = '#ff3a3a';
          ctx.lineWidth = 2;
          ctx.strokeRect(cx - CELL * 0.55, yTop, CELL * 1.1, yBot - yTop);
          // Shadow growing larger as it closes in
          const shadowAlpha = 1 - hawk.t;
          ctx.fillStyle = `rgba(0,0,0,${shadowAlpha * 0.6})`;
          ctx.beginPath();
          ctx.ellipse(cx, this.cellY(START_ROW) - 10, 60 - hawk.t * 30, 14 - hawk.t * 5, 0, 0, Math.PI * 2);
          ctx.fill();
        } else if (hawk.state === 'swoop') {
          Sprites.draw(ctx, 'frog.hawk', cx, hawk.swoopY, 200, 120);
          // streak
          ctx.strokeStyle = 'rgba(255,216,107,0.6)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(cx, hawk.swoopY - 60);
          ctx.lineTo(cx, hawk.swoopY + 60);
          ctx.stroke();
        }
      }
      if (this.save.perks.detector) this._renderDetectorWarnings(ctx);
      this._renderFrog(ctx);
      this._renderFeedback(ctx);
      // Boss banner
      ctx.fillStyle = '#1a1208cc';
      ctx.fillRect(W / 2 - 200, 6, 400, 30);
      ctx.fillStyle = '#ffd86b';
      ctx.font = 'bold 16px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(
        `HIGHWAY HAWK · Swoops ${Math.min(3, this.bossSwoopCount)}/3 · ${this.bossTrophyFilled ? 'TROPHY SET' : 'CLAIM TROPHY'}`,
        W / 2, 22);
    }

    _renderBossClear(ctx) {
      this._renderField(ctx, true);
      ctx.fillStyle = 'rgba(8,12,8,0.78)';
      ctx.fillRect(0, 0, W, H);
      const cx = W / 2;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffd86b'; ctx.font = 'bold 40px ui-monospace, monospace';
      ctx.shadowColor = '#ffd86b'; ctx.shadowBlur = 14;
      ctx.fillText('HAWK GROUNDED', cx, 200);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff'; ctx.font = '18px ui-monospace, monospace';
      ctx.fillText('You out-hopped the apex predator.', cx, 260);
      ctx.fillText('Trophy planted on the centre pad.', cx, 290);
      ctx.fillStyle = '#ffd86b'; ctx.font = 'bold 18px ui-monospace, monospace';
      ctx.fillText('Click to celebrate', cx, 380);
    }

    _renderVictory(ctx) {
      const cx = W / 2;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffd86b'; ctx.font = 'bold 44px ui-monospace, monospace';
      ctx.shadowColor = '#ffd86b'; ctx.shadowBlur = 18;
      ctx.fillText('FROGGER · VICTORY', cx, 160);
      ctx.shadowBlur = 0;

      // Decorative trophy frog
      Sprites.draw(ctx, 'frog.frog', cx, 280, 140 + Math.sin(this.victoryTimer * 4) * 10,
                                              140 + Math.sin(this.victoryTimer * 4) * 10);

      ctx.fillStyle = '#fff'; ctx.font = '18px ui-monospace, monospace';
      ctx.fillText('You survived five days and silenced the Highway Hawk.', cx, 400);
      ctx.fillText('Final score: ' + this.score, cx, 430);
      ctx.fillStyle = '#ffd86b'; ctx.font = 'bold 18px ui-monospace, monospace';
      ctx.fillText('Click to finish run', cx, 500);
    }
  }

  function wrapText(ctx, text, cx, y, maxW, lineH) {
    const words = text.split(' ');
    let line = ''; let yy = y;
    for (const w of words) {
      const test = line ? (line + ' ' + w) : w;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, cx, yy); line = w; yy += lineH;
      } else line = test;
    }
    if (line) ctx.fillText(line, cx, yy);
  }

  NDP.attachGame('frogger', FroggerGame);
})();
