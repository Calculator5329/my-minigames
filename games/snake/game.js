/* Snake — The Serpent Campaign.
   ----------------------------------------------------------------------------
   Four biomes, each capped by a Worm Boss duel, with in-run power-ups and
   between-run persistent perks bought from the global coin pool.

   Biomes (in order):
     0  GRASS    — vanilla rules.
     1  DESERT   — cacti are scattered on the field; touching one is death.
     2  CAVE     — light radius shrinks around the head as you progress.
     3  DIGITAL  — random tiles glitch (stepping on one costs a length); walls
                   wrap to the opposite side instead of killing.

   Per-biome target: eat 8 apples → fight the WORM BOSS.

   Worm Boss rules:
     - Worm chases the player head.
     - Player head touches WORM BODY  → lose 1 length, spawn a golden apple,
                                        brief invuln so you don't lose more
                                        than once per pass.
     - Player eats GOLDEN APPLE       → 1/3 hit on the worm.
     - Player head touches WORM HEAD  → instant death.
     - 3 golden apples eaten          → biome cleared.

   In-run power-ups (10% to spawn after each apple):
     ⏱  slow-mo (8s)  — tick interval ×1.5
     👻 ghost   (8s)  — pass through self
     🧲 magnet  (8s)  — apples drift one cell toward head when ≤8 cells away

   Persistent perks (Storage coins, bought between biomes):
     LATERAL    $30  — start +2 length
     SLOW START $20  — first 5s of each biome are slower
     IRON APPLE $40  — once per biome an apple doesn't grow you
     MAGNET+    $50  — first 5s of each biome have free magnet

   Save shape (mergeGameData('snake', …)):
     { bestBiome:int, perks:{ lateral:0|1, slowStart:0|1, ironApple:0|1, magnetPlus:0|1 } }
*/
(function () {
  const NDP = window.NDP;
  const { BaseGame, Input, Audio, Sprites } = NDP.Engine;
  const Storage = NDP.Engine.Storage;

  // -------------------------------------------------------------- constants
  const W = 960, H = 600;
  const CELL = 24;
  const COLS = 38;
  const ROWS = 22;
  const FIELD_W = COLS * CELL;
  const FIELD_H = ROWS * CELL;
  const OFFX = (W - FIELD_W) / 2;
  const OFFY = 50;

  const APPLES_PER_BIOME = 8;
  const GOLDEN_TO_KILL   = 3;
  const POWERUP_CHANCE   = 0.10;
  const POWERUP_TYPES    = ['slowmo', 'ghost', 'magnet'];
  const EFFECT_DURATION  = 8.0;
  const BASE_TICK        = 1 / 9;     // 9 cells/sec base speed
  const TICK_FLOOR       = 0.055;
  const SPEED_PER_APPLE  = 0.985;     // tickInterval *= this each apple

  const BIOMES = [
    {
      id: 0, name: 'Grass',
      bg: ['#0e2818', '#06180c'],
      grid: 'rgba(74,222,128,0.10)',
      border: '#4ade80', accent: '#86efac',
      decor: 'snake.decor.grass', decorN: 22,
      cacti: 0, light: false, glitch: false, wrap: false
    },
    {
      id: 1, name: 'Desert',
      bg: ['#3a2614', '#5a3a18'],
      grid: 'rgba(251,191,36,0.10)',
      border: '#fbbf24', accent: '#fde68a',
      decor: 'snake.decor.sand', decorN: 28,
      cacti: 14, light: false, glitch: false, wrap: false
    },
    {
      id: 2, name: 'Cave',
      bg: ['#1a1424', '#08040c'],
      grid: 'rgba(168,138,255,0.06)',
      border: '#a78bfa', accent: '#c4b5fd',
      decor: 'snake.decor.crystal', decorN: 16,
      cacti: 0, light: true, glitch: false, wrap: false
    },
    {
      id: 3, name: 'Digital',
      bg: ['#0a1430', '#040818'],
      grid: 'rgba(122,224,255,0.10)',
      border: '#7ae0ff', accent: '#bae6fd',
      decor: 'snake.decor.pixel', decorN: 20,
      cacti: 0, light: false, glitch: true, wrap: true
    }
  ];

  const PERKS = [
    { id:'lateral',    name:'LATERAL',    desc:'Start each biome +2 length',  cost: 30, sprite:'snake.perk.lateral' },
    { id:'slowStart',  name:'SLOW START', desc:'First 5s of each biome ×1.6', cost: 20, sprite:'snake.perk.slowStart' },
    { id:'ironApple',  name:'IRON APPLE', desc:'One apple per biome doesn\'t grow', cost: 40, sprite:'snake.perk.ironApple' },
    { id:'magnetPlus', name:'MAGNET+',    desc:'First 5s of each biome auto-magnet', cost: 50, sprite:'snake.perk.magnetPlus' }
  ];

  // -------------------------------------------------------------- save
  function loadSave() {
    const def = { bestBiome: 0, perks: { lateral:0, slowStart:0, ironApple:0, magnetPlus:0 } };
    const cur = Storage.getGameData('snake') || {};
    return Object.assign({}, def, cur, { perks: Object.assign({}, def.perks, cur.perks || {}) });
  }
  function persist(save) {
    Storage.mergeGameData('snake', { bestBiome: save.bestBiome, perks: save.perks });
  }

  // ===========================================================================
  class SnakeGame extends BaseGame {
    init() {
      this.save = loadSave();

      // Phase machine inside BaseGame's "playing" state.
      //   intro    → splash (click to start)
      //   play     → biome gameplay
      //   boss     → worm-boss duel
      //   between  → "biome cleared" splash (auto-advances or click)
      //   shop     → perk shop between biomes
      //   victory  → full campaign cleared (calls win() on click)
      this.phase = 'intro';
      this.biomeIx = 0;
      // Milestone counters for the global theme-shop economy. coinsEarned()
      // pays out for biomes actually cleared in this run plus a victory
      // bonus, never from apple-inflated score.
      this.biomesClearedThisRun = 0;
      this.victoryAchieved = false;

      this.snake = [];
      this.dir = { x: 1, y: 0 };
      this.queuedDir = { x: 1, y: 0 };
      this.tickInterval = BASE_TICK;
      this.tickAcc = 0;

      this.apples = [];          // { x, y, t }
      this.goldenApples = [];    // { x, y, t }
      this.powerups = [];        // { x, y, type, t }
      this.cacti = [];           // { x, y }
      this.glitches = [];        // { x, y }
      this.decor = [];           // { x, y, key } — purely visual
      this.eaten = 0;

      this.effects = { slowmo: 0, ghost: 0, magnet: 0 };
      this.biomeTime = 0;
      this.ironAvailable = false;

      // Worm boss state (created in _startBoss)
      this.worm = null;
      this.wormHits = 0;
      this.wormInvuln = 0;
      this.wormTickAcc = 0;
      this.wormTickInterval = BASE_TICK * 1.4;
      this.glitchTimer = 0;

      this.shopRects = [];
      this.betweenTimer = 0;
      this.victoryTimer = 0;
      this.headPulse = 0;

      this.sfx = this.makeSfx({
        eat:        { freq: 660, type: 'square',   dur: 0.06, slide: 220, vol: 0.32 },
        eatGold:    { freq: 880, type: 'triangle', dur: 0.18, slide: 380, vol: 0.45 },
        die:        { freq: 220, type: 'sawtooth', dur: 0.45, slide: -150, vol: 0.55 },
        turn:       { freq: 440, type: 'square',   dur: 0.03, vol: 0.10 },
        powerUp:    { freq: 720, type: 'triangle', dur: 0.25, slide: 540, vol: 0.4 },
        bossHit:    { freq: 320, type: 'sawtooth', dur: 0.22, slide: -160, vol: 0.5 },
        bossHurt:   { freq: 180, type: 'sawtooth', dur: 0.3,  slide: -80,  vol: 0.5 },
        clear:      { freq: 880, type: 'triangle', dur: 0.5,  slide: 220, vol: 0.55 },
        buy:        { freq: 1100, type: 'square',  dur: 0.1,  vol: 0.4 },
        glitch:     { freq: 280, type: 'square',   dur: 0.12, slide: -200, vol: 0.35 }
      });

      Sprites.preload([
        'snake.head','snake.body','snake.apple','snake.appleGold',
        'snake.cactus','snake.glitch','snake.worm.head','snake.worm.body',
        'snake.power.slowmo','snake.power.ghost','snake.power.magnet'
      ], CELL, CELL);
      Sprites.preload(['snake.perk.lateral','snake.perk.slowStart',
                       'snake.perk.ironApple','snake.perk.magnetPlus'], 88, 88);

      this._refreshHud();
    }

    onEnd(score) {
      this._persistBest();
      // Pre-migration earn rate (score / 35) now funds the per-game snake
      // wallet instead of the global theme-shop pool. Apple-driven score is
      // shop currency, milestones drive global coins (see coinsEarned).
      const purse = Math.max(0, Math.floor((score | 0) / 35));
      if (purse > 0) Storage.addGameWallet('snake', purse);
    }

    _persistBest() {
      this.save.bestBiome = Math.max(this.save.bestBiome, this.biomeIx);
      persist(this.save);
    }

    // --------------------------------------------------------------- helpers
    _occupied() {
      const occ = new Set();
      for (const s of this.snake) occ.add(s.x + ',' + s.y);
      for (const a of this.apples) occ.add(a.x + ',' + a.y);
      for (const a of this.goldenApples) occ.add(a.x + ',' + a.y);
      for (const p of this.powerups) occ.add(p.x + ',' + p.y);
      for (const c of this.cacti) occ.add(c.x + ',' + c.y);
      if (this.worm) for (const w of this.worm.segs) occ.add(w.x + ',' + w.y);
      return occ;
    }

    _freeCell(margin) {
      const occ = this._occupied();
      const m = margin || 0;
      for (let tries = 0; tries < 400; tries++) {
        const x = m + ((Math.random() * (COLS - m * 2)) | 0);
        const y = m + ((Math.random() * (ROWS - m * 2)) | 0);
        if (!occ.has(x + ',' + y)) return { x, y };
      }
      return null;
    }

    _spawnApple() {
      const c = this._freeCell();
      if (c) this.apples.push({ x: c.x, y: c.y, t: 0 });
    }
    _spawnGoldenApple() {
      const c = this._freeCell();
      if (c) this.goldenApples.push({ x: c.x, y: c.y, t: 0 });
    }
    _maybeSpawnPowerup() {
      if (Math.random() > POWERUP_CHANCE) return;
      const c = this._freeCell();
      if (!c) return;
      const type = POWERUP_TYPES[(Math.random() * POWERUP_TYPES.length) | 0];
      this.powerups.push({ x: c.x, y: c.y, type, t: 0 });
    }

    _scatterDecor(b) {
      this.decor = [];
      for (let i = 0; i < b.decorN; i++) {
        const x = (Math.random() * COLS) | 0;
        const y = (Math.random() * ROWS) | 0;
        this.decor.push({ x, y });
      }
    }

    _scatterCacti(b) {
      this.cacti = [];
      const occ = this._occupied();
      // Keep the spawn lane (y=mid, x=4..15) clear so the player can move.
      const lane = (x, y) => y === ((ROWS / 2) | 0) && x >= 2 && x <= 14;
      for (let i = 0; i < b.cacti; i++) {
        for (let t = 0; t < 60; t++) {
          const x = 1 + ((Math.random() * (COLS - 2)) | 0);
          const y = 1 + ((Math.random() * (ROWS - 2)) | 0);
          if (!occ.has(x + ',' + y) && !lane(x, y)) {
            this.cacti.push({ x, y });
            occ.add(x + ',' + y);
            break;
          }
        }
      }
    }

    // --------------------------------------------------------------- lifecycle
    _startBiome(n) {
      const b = BIOMES[n];
      this.biomeIx = n;

      // Reset entities
      this.apples = [];
      this.goldenApples = [];
      this.powerups = [];
      this.cacti = [];
      this.glitches = [];
      this.decor = [];

      // Reset snake — middle of the field, facing right.
      const startLen = 3 + (this.save.perks.lateral ? 2 : 0);
      const sy = (ROWS / 2) | 0;
      const sx = 6;
      this.snake = [];
      for (let i = 0; i < startLen; i++) this.snake.push({ x: sx - i, y: sy });
      this.dir = { x: 1, y: 0 };
      this.queuedDir = { x: 1, y: 0 };

      this.tickInterval = BASE_TICK;
      this.tickAcc = 0;
      this.eaten = 0;
      this.biomeTime = 0;
      this.headPulse = 0;
      this.glitchTimer = 0;

      this.effects.slowmo = 0;
      this.effects.ghost = 0;
      this.effects.magnet = this.save.perks.magnetPlus ? 5.0 : 0;
      this.ironAvailable = !!this.save.perks.ironApple;

      this.worm = null;
      this.wormHits = 0;
      this.wormInvuln = 0;

      this._scatterDecor(b);
      this._scatterCacti(b);
      this._spawnApple();

      this.phase = 'play';
      this._refreshHud();
    }

    _startBoss() {
      // Spawn the worm at the far corner from the player head.
      const head = this.snake[0];
      const fx = head.x < COLS / 2 ? COLS - 4 : 3;
      const fy = head.y < ROWS / 2 ? ROWS - 3 : 2;
      const segs = [];
      const len = 6;
      for (let i = 0; i < len; i++) segs.push({ x: fx + i, y: fy });
      this.worm = {
        segs,
        dir: { x: -1, y: 0 },
        maxHits: GOLDEN_TO_KILL,
        hitFlash: 0
      };
      this.wormHits = 0;
      this.wormInvuln = 1.0;
      this.wormTickAcc = 0;
      this.wormTickInterval = Math.max(BASE_TICK * 1.2, this.tickInterval * 1.35);
      this.goldenApples = [];
      this.phase = 'boss';
      this.flash('#fbbf24', 0.25);
      this.shake(8, 0.4);
      this.sfx.play('clear');
      this._refreshHud();
    }

    // --------------------------------------------------------------- input
    _readDirInput() {
      if (Input.keys['ArrowUp']    || Input.keys['w'] || Input.keys['W']) this._setDir(0, -1);
      if (Input.keys['ArrowDown']  || Input.keys['s'] || Input.keys['S']) this._setDir(0,  1);
      if (Input.keys['ArrowLeft']  || Input.keys['a'] || Input.keys['A']) this._setDir(-1, 0);
      if (Input.keys['ArrowRight'] || Input.keys['d'] || Input.keys['D']) this._setDir( 1, 0);
    }
    _setDir(dx, dy) {
      // Disallow 180° reversal vs current dir.
      if (this.dir.x === -dx && this.dir.y === -dy) return;
      if (this.queuedDir.x === dx && this.queuedDir.y === dy) return;
      this.queuedDir = { x: dx, y: dy };
      this.sfx.play('turn');
    }

    // --------------------------------------------------------------- update root
    update(dt) {
      if (this.phase === 'intro')   return this._updateIntro();
      if (this.phase === 'play')    return this._updatePlay(dt);
      if (this.phase === 'boss')    return this._updateBoss(dt);
      if (this.phase === 'between') return this._updateBetween(dt);
      if (this.phase === 'shop')    return this._updateShop(dt);
      if (this.phase === 'victory') return this._updateVictory(dt);
    }

    _refreshHud() {
      const b = BIOMES[this.biomeIx] || BIOMES[0];
      const len = this.snake.length;
      let mid;
      if (this.phase === 'boss') {
        mid = `<span>Boss <b>${this.wormHits}/${GOLDEN_TO_KILL}</b></span>`;
      } else {
        mid = `<span>Apples <b>${this.eaten}/${APPLES_PER_BIOME}</b></span>`;
      }
      this.setHud(
        `<span>Biome <b>${b.name}</b></span>` +
        mid +
        `<span>Length <b>${len}</b></span>` +
        `<span>Score <b>${this.score}</b></span>`
      );
    }

    // --------------------------------------------------------------- intro
    _updateIntro() {
      if (Input.mouse.justPressed) {
        Input.mouse.justPressed = false;
        this._startBiome(0);
      }
    }

    // --------------------------------------------------------------- play
    _updatePlay(dt) {
      this._readDirInput();
      this.biomeTime += dt;
      this.headPulse = Math.max(0, this.headPulse - dt * 3);
      for (const a of this.apples) a.t += dt;
      for (const p of this.powerups) p.t += dt;

      // Effect timers
      for (const k in this.effects) {
        if (this.effects[k] > 0) this.effects[k] = Math.max(0, this.effects[k] - dt);
      }

      // Tick
      const eff = this._effectiveTickInterval();
      this.tickAcc += dt;
      while (this.tickAcc >= eff) {
        this.tickAcc -= eff;
        this._stepPlay();
        if (this.state !== 'playing') return;
        if (this.phase !== 'play') break;
      }

      this._refreshHud();
    }

    _effectiveTickInterval() {
      let t = this.tickInterval;
      if (this.effects.slowmo > 0) t *= 1.5;
      if (this.save.perks.slowStart && this.biomeTime < 5) t *= 1.6;
      return t;
    }

    _stepPlay() {
      this.dir = this.queuedDir;
      const head = this.snake[0];
      let nx = head.x + this.dir.x;
      let ny = head.y + this.dir.y;
      const b = BIOMES[this.biomeIx];

      // Wall handling
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) {
        if (b.wrap) {
          nx = (nx + COLS) % COLS;
          ny = (ny + ROWS) % ROWS;
        } else {
          return this._die('wall');
        }
      }

      // Cactus
      for (const c of this.cacti) {
        if (c.x === nx && c.y === ny) return this._die('cactus');
      }

      // Self collision (skip tail, which moves out of the way) — unless ghost.
      if (this.effects.ghost <= 0) {
        for (let i = 0; i < this.snake.length - 1; i++) {
          if (this.snake[i].x === nx && this.snake[i].y === ny) return this._die('self');
        }
      }

      const newHead = { x: nx, y: ny };
      this.snake.unshift(newHead);
      this.headPulse = 1;

      // Glitch tile (Digital biome)
      let glitchHit = false;
      if (b.glitch) {
        for (let i = this.glitches.length - 1; i >= 0; i--) {
          const g = this.glitches[i];
          if (g.x === nx && g.y === ny) {
            this.glitches.splice(i, 1);
            glitchHit = true;
            break;
          }
        }
      }

      // Apple eaten?
      let ate = false;
      for (let i = this.apples.length - 1; i >= 0; i--) {
        const a = this.apples[i];
        if (a.x === nx && a.y === ny) {
          this.apples.splice(i, 1);
          ate = true;
          this.eaten++;
          this.addScore(10 + this.biomeIx * 5);
          this.sfx.play('eat', { freq: 660 + this.eaten * 18 });
          this.shake(2, 0.1);
          this.tickInterval = Math.max(TICK_FLOOR, this.tickInterval * SPEED_PER_APPLE);
          this._burstAt(nx, ny, 18, b.accent);
          if (this.eaten >= APPLES_PER_BIOME) {
            // Snake clears the field — go to boss.
            this.snake.pop = this.snake.pop; // no-op clarity
            this._startBoss();
            return;
          }
          this._spawnApple();
          this._maybeSpawnPowerup();
          break;
        }
      }

      // Powerup eaten?
      for (let i = this.powerups.length - 1; i >= 0; i--) {
        const p = this.powerups[i];
        if (p.x === nx && p.y === ny) {
          this.powerups.splice(i, 1);
          this._activatePowerup(p.type, nx, ny);
          break;
        }
      }

      // Apply growth / iron-apple / glitch length-cost
      if (ate) {
        if (this.ironAvailable) {
          this.ironAvailable = false;
          this.snake.pop();
          this.flash('#94a3b8', 0.15);
        }
      } else {
        this.snake.pop();
      }

      if (glitchHit) {
        this.flash('#ec4899', 0.15);
        this.shake(4, 0.18);
        this.sfx.play('glitch');
        this._burstAt(nx, ny, 18, '#ec4899');
        if (this.snake.length <= 1) return this._die('glitch');
        this.snake.pop();
      }

      // Magnet drift — pull apples one cell closer to head per tick.
      if (this.effects.magnet > 0) this._magnetTick();
    }

    _magnetTick() {
      const head = this.snake[0];
      const occ = this._occupied();
      const tryMove = (item) => {
        const dx = head.x - item.x, dy = head.y - item.y;
        if (Math.abs(dx) + Math.abs(dy) > 8) return;
        const sx = Math.sign(dx), sy = Math.sign(dy);
        // Prefer the dominant axis so the path looks natural.
        const tryX = { x: item.x + sx, y: item.y };
        const tryY = { x: item.x, y: item.y + sy };
        const order = Math.abs(dx) >= Math.abs(dy) ? [tryX, tryY] : [tryY, tryX];
        for (const t of order) {
          if (t.x < 0 || t.x >= COLS || t.y < 0 || t.y >= ROWS) continue;
          if (sx === 0 && t.x !== item.x) continue;
          if (sy === 0 && t.y !== item.y) continue;
          if (occ.has(t.x + ',' + t.y)) continue;
          occ.delete(item.x + ',' + item.y);
          item.x = t.x; item.y = t.y;
          occ.add(item.x + ',' + item.y);
          return;
        }
      };
      for (const a of this.apples) tryMove(a);
      for (const a of this.goldenApples) tryMove(a);
    }

    _activatePowerup(type, gx, gy) {
      this.effects[type] = EFFECT_DURATION;
      this.sfx.play('powerUp');
      this.flash(type === 'slowmo' ? '#7ae0ff' :
                 type === 'ghost'  ? '#e0f2fe' : '#dc2626', 0.18);
      this._burstAt(gx, gy, 26,
        type === 'slowmo' ? '#7ae0ff' :
        type === 'ghost'  ? '#e0f2fe' : '#dc2626');
      this.addScore(15);
    }

    _burstAt(gx, gy, n, color) {
      const cx = OFFX + gx * CELL + CELL / 2;
      const cy = OFFY + gy * CELL + CELL / 2;
      this.particles.burst(cx, cy, n, { color, speed: 220, life: 0.55, size: 3 });
    }

    // --------------------------------------------------------------- boss
    _updateBoss(dt) {
      this._readDirInput();
      this.biomeTime += dt;
      this.headPulse = Math.max(0, this.headPulse - dt * 3);
      this.wormInvuln = Math.max(0, this.wormInvuln - dt);
      if (this.worm.hitFlash > 0) this.worm.hitFlash = Math.max(0, this.worm.hitFlash - dt);
      for (const a of this.apples) a.t += dt;
      for (const a of this.goldenApples) a.t += dt;
      for (const p of this.powerups) p.t += dt;

      for (const k in this.effects) {
        if (this.effects[k] > 0) this.effects[k] = Math.max(0, this.effects[k] - dt);
      }

      // Glitch shimmer in Digital biome continues during the duel.
      const b = BIOMES[this.biomeIx];
      if (b.glitch) this._tickGlitch(dt);

      // Player tick
      const eff = this._effectiveTickInterval();
      this.tickAcc += dt;
      while (this.tickAcc >= eff) {
        this.tickAcc -= eff;
        this._stepBossPlayer();
        if (this.state !== 'playing') return;
        if (this.phase !== 'boss') break;
      }

      // Worm tick
      if (this.phase === 'boss') {
        this.wormTickAcc += dt;
        while (this.wormTickAcc >= this.wormTickInterval) {
          this.wormTickAcc -= this.wormTickInterval;
          this._stepWorm();
          if (this.state !== 'playing') return;
          if (this.phase !== 'boss') break;
        }
      }

      this._refreshHud();
    }

    _stepBossPlayer() {
      this.dir = this.queuedDir;
      const head = this.snake[0];
      let nx = head.x + this.dir.x;
      let ny = head.y + this.dir.y;
      const b = BIOMES[this.biomeIx];

      // Walls
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) {
        if (b.wrap) {
          nx = (nx + COLS) % COLS;
          ny = (ny + ROWS) % ROWS;
        } else {
          return this._die('wall');
        }
      }
      // Cactus / self
      for (const c of this.cacti) {
        if (c.x === nx && c.y === ny) return this._die('cactus');
      }
      if (this.effects.ghost <= 0) {
        for (let i = 0; i < this.snake.length - 1; i++) {
          if (this.snake[i].x === nx && this.snake[i].y === ny) return this._die('self');
        }
      }

      // Worm collisions — head vs head = death, head vs body = damage exchange.
      const wormHead = this.worm.segs[0];
      if (wormHead.x === nx && wormHead.y === ny) return this._die('worm');
      let touchedBody = false;
      if (this.wormInvuln <= 0) {
        for (let i = 1; i < this.worm.segs.length; i++) {
          const s = this.worm.segs[i];
          if (s.x === nx && s.y === ny) { touchedBody = true; break; }
        }
      }

      this.snake.unshift({ x: nx, y: ny });
      this.headPulse = 1;

      // Glitch tile
      if (b.glitch) {
        for (let i = this.glitches.length - 1; i >= 0; i--) {
          const g = this.glitches[i];
          if (g.x === nx && g.y === ny) {
            this.glitches.splice(i, 1);
            this.flash('#ec4899', 0.15);
            this.sfx.play('glitch');
            this._burstAt(nx, ny, 14, '#ec4899');
            this.snake.pop();
            if (this.snake.length <= 1) return this._die('glitch');
            break;
          }
        }
      }

      // Golden apple eaten?
      let ateGold = false;
      for (let i = this.goldenApples.length - 1; i >= 0; i--) {
        const a = this.goldenApples[i];
        if (a.x === nx && a.y === ny) {
          this.goldenApples.splice(i, 1);
          ateGold = true;
          this.wormHits++;
          this.addScore(60);
          this.sfx.play('bossHurt');
          this.flash('#fbbf24', 0.18);
          this.shake(8, 0.3);
          this._burstAt(nx, ny, 36, '#fbbf24');
          this.worm.hitFlash = 0.45;
          if (this.wormHits >= GOLDEN_TO_KILL) {
            this.snake.pop = this.snake.pop;
            this._defeatWorm();
            return;
          }
          break;
        }
      }

      // Worm body brush — lose a segment, spawn a golden apple.
      if (touchedBody) {
        this.wormInvuln = 1.0;
        this.flash('#a855f7', 0.15);
        this.sfx.play('bossHit');
        this.shake(5, 0.2);
        this.snake.pop();                 // pay for the brush
        if (this.snake.length <= 1) return this._die('worm');
        this._spawnGoldenApple();
        // Tail moved due to the .pop above, that already counts as "no growth"
        // — so do NOT pop again below.
        return;
      }

      // Default tail trim (no growth from regular advance)
      if (!ateGold) this.snake.pop();

      if (this.effects.magnet > 0) this._magnetTick();
    }

    _stepWorm() {
      const w = this.worm;
      const head = this.snake[0];
      const wHead = w.segs[0];
      // Try directions: dominant axis toward player, then the alternative.
      const dx = head.x - wHead.x, dy = head.y - wHead.y;
      const candidates = [];
      const horiz = { x: Math.sign(dx) || 1, y: 0 };
      const vert  = { x: 0, y: Math.sign(dy) || 1 };
      if (Math.abs(dx) >= Math.abs(dy)) { candidates.push(horiz, vert); }
      else                              { candidates.push(vert, horiz); }
      // Sometimes pick the alt to feel less mechanical.
      if (Math.random() < 0.18) candidates.reverse();
      candidates.push({ x: -horiz.x, y: 0 });
      candidates.push({ x: 0, y: -vert.y });

      const wormSet = new Set(w.segs.slice(0, -1).map(s => s.x + ',' + s.y));
      const cactSet = new Set(this.cacti.map(c => c.x + ',' + c.y));
      const b = BIOMES[this.biomeIx];

      let chosen = null;
      for (const d of candidates) {
        // Don't reverse onto own neck.
        if (d.x === -w.dir.x && d.y === -w.dir.y && (w.dir.x !== 0 || w.dir.y !== 0)) continue;
        let nx = wHead.x + d.x, ny = wHead.y + d.y;
        if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) {
          if (b.wrap) { nx = (nx + COLS) % COLS; ny = (ny + ROWS) % ROWS; }
          else continue;
        }
        if (wormSet.has(nx + ',' + ny)) continue;
        if (cactSet.has(nx + ',' + ny)) continue;
        chosen = { d, nx, ny };
        break;
      }
      if (!chosen) {
        // Stuck — wiggle in place by skipping movement this tick.
        return;
      }
      w.dir = chosen.d;
      w.segs.unshift({ x: chosen.nx, y: chosen.ny });
      w.segs.pop();

      // Check head-on collision after worm moved.
      if (chosen.nx === head.x && chosen.ny === head.y) return this._die('worm');
    }

    _tickGlitch(dt) {
      this.glitchTimer -= dt;
      if (this.glitchTimer > 0) return;
      this.glitchTimer = 1.4 + Math.random() * 1.0;
      // Refresh the glitch tile set — keep 4-7 active at once.
      const target = 5 + ((Math.random() * 3) | 0);
      this.glitches = [];
      const occ = this._occupied();
      for (let i = 0; i < target; i++) {
        for (let t = 0; t < 30; t++) {
          const x = (Math.random() * COLS) | 0;
          const y = (Math.random() * ROWS) | 0;
          if (occ.has(x + ',' + y)) continue;
          this.glitches.push({ x, y });
          occ.add(x + ',' + y);
          break;
        }
      }
    }

    _defeatWorm() {
      this.addScore(300 + this.biomeIx * 200);
      this.flash('#fbbf24', 0.4);
      this.shake(14, 0.55);
      const head = this.worm.segs[0];
      this._burstAt(head.x, head.y, 60, '#fbbf24');
      this.particles.burst(W / 2, H / 2, 80, { color: '#fbbf24', speed: 360, life: 1.1, size: 4 });
      this.sfx.play('clear');
      this.worm = null;
      this.goldenApples = [];

      this.save.bestBiome = Math.max(this.save.bestBiome, this.biomeIx + 1);
      persist(this.save);
      this.biomesClearedThisRun++;

      this.phase = 'between';
      this.betweenTimer = 0;
      this._refreshHud();
    }

    // --------------------------------------------------------------- between (post-boss splash)
    _updateBetween(dt) {
      this.betweenTimer += dt;
      const ready = this.betweenTimer > 0.5;
      if (ready && Input.mouse.justPressed) {
        Input.mouse.justPressed = false;
        if (this.biomeIx + 1 >= BIOMES.length) {
          this.phase = 'victory';
          this.victoryTimer = 0;
          this.addScore(1000);
        } else {
          this.phase = 'shop';
        }
      }
    }

    // --------------------------------------------------------------- shop
    _updateShop() {
      this._refreshHud();
      if (!Input.mouse.justPressed) return;
      Input.mouse.justPressed = false;
      const mx = Input.mouse.x, my = Input.mouse.y;
      for (const r of this.shopRects) {
        if (mx < r.x || mx > r.x + r.w || my < r.y || my > r.y + r.h) continue;
        if (r.kind === 'continue') {
          this._startBiome(this.biomeIx + 1);
          return;
        }
        if (r.kind === 'perk') {
          const p = r.perk;
          if (this.save.perks[p.id]) return;          // already owned
          if (Storage.getGameWallet('snake') < p.cost) return;    // broke
          if (!Storage.spendGameWallet('snake', p.cost)) return;
          this.save.perks[p.id] = 1;
          persist(this.save);
          this.sfx.play('buy');
          this.particles.burst(r.x + r.w / 2, r.y + r.h / 2, 22,
            { color: '#fbbf24', speed: 180, life: 0.6, size: 3 });
        }
        return;
      }
    }

    // --------------------------------------------------------------- victory
    _updateVictory(dt) {
      this.victoryTimer += dt;
      if (this.victoryTimer > 0.7 && Input.mouse.justPressed) {
        Input.mouse.justPressed = false;
        this.victoryAchieved = true;
        this.win();
      }
    }

    // --------------------------------------------------------------- death
    _die(reason) {
      const head = this.snake[0] || { x: COLS/2, y: ROWS/2 };
      this.sfx.play('die');
      this.shake(16, 0.55);
      this.flash('#ff3a3a', 0.32);
      this._burstAt(head.x, head.y, 48, '#ff5e7e');
      this._persistBest();
      this.gameOver();
    }

    // Global theme-shop coins: 6 per biome cleared this run + 20 victory bonus.
    // Apples no longer leak into the global pool through score.
    coinsEarned(/*score*/) {
      return (this.biomesClearedThisRun | 0) * 6 + (this.victoryAchieved ? 20 : 0);
    }

    // ===========================================================================
    // RENDER
    render(ctx) {
      this._drawBackdrop(ctx);
      if (this.phase === 'intro')   return this._renderIntro(ctx);
      if (this.phase === 'shop')    { this._renderField(ctx); return this._renderShop(ctx); }
      if (this.phase === 'victory') return this._renderVictory(ctx);
      this._renderField(ctx);
      if (this.phase === 'between') this._renderBetween(ctx);
    }

    _drawBackdrop(ctx) {
      const b = BIOMES[Math.min(this.biomeIx, BIOMES.length - 1)] || BIOMES[0];
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, b.bg[0]); g.addColorStop(1, b.bg[1]);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }

    _renderField(ctx) {
      const b = BIOMES[Math.min(this.biomeIx, BIOMES.length - 1)] || BIOMES[0];
      // Field background
      ctx.fillStyle = 'rgba(0,0,0,0.30)';
      ctx.fillRect(OFFX, OFFY, FIELD_W, FIELD_H);

      // Decor (behind grid)
      for (const d of this.decor) {
        const cx = OFFX + d.x * CELL + CELL / 2;
        const cy = OFFY + d.y * CELL + CELL / 2;
        Sprites.draw(ctx, b.decor, cx, cy, CELL, CELL, { alpha: 0.35 });
      }

      // Grid
      ctx.strokeStyle = b.grid; ctx.lineWidth = 1;
      for (let x = 0; x <= COLS; x++) {
        ctx.beginPath();
        ctx.moveTo(OFFX + x * CELL, OFFY);
        ctx.lineTo(OFFX + x * CELL, OFFY + FIELD_H);
        ctx.stroke();
      }
      for (let y = 0; y <= ROWS; y++) {
        ctx.beginPath();
        ctx.moveTo(OFFX, OFFY + y * CELL);
        ctx.lineTo(OFFX + FIELD_W, OFFY + y * CELL);
        ctx.stroke();
      }

      // Border
      ctx.strokeStyle = b.border; ctx.lineWidth = 2;
      ctx.strokeRect(OFFX - 1, OFFY - 1, FIELD_W + 2, FIELD_H + 2);
      if (b.wrap) {
        // Stylise the wrap-around border with dashed lines.
        ctx.save();
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = b.border;
        ctx.strokeRect(OFFX - 4, OFFY - 4, FIELD_W + 8, FIELD_H + 8);
        ctx.restore();
      }

      // Glitch tiles
      for (const g of this.glitches) {
        const cx = OFFX + g.x * CELL + CELL / 2;
        const cy = OFFY + g.y * CELL + CELL / 2;
        const wob = Math.sin(this.time * 9 + g.x + g.y) * 0.25;
        Sprites.draw(ctx, 'snake.glitch', cx, cy, CELL + 2, CELL + 2, { rot: wob });
      }

      // Cacti
      for (const c of this.cacti) {
        const cx = OFFX + c.x * CELL + CELL / 2;
        const cy = OFFY + c.y * CELL + CELL / 2;
        Sprites.draw(ctx, 'snake.cactus', cx, cy, CELL + 2, CELL + 2, {
          fallback: () => { ctx.fillStyle = '#15803d'; ctx.fillRect(cx-CELL/2, cy-CELL/2, CELL, CELL); }
        });
      }

      // Powerups (pulse)
      for (const p of this.powerups) {
        const cx = OFFX + p.x * CELL + CELL / 2;
        const cy = OFFY + p.y * CELL + CELL / 2;
        const pulse = 1 + 0.15 * Math.sin(p.t * 6);
        Sprites.draw(ctx, 'snake.power.' + p.type, cx, cy, (CELL + 4) * pulse, (CELL + 4) * pulse);
      }

      // Apples
      for (const a of this.apples) {
        const cx = OFFX + a.x * CELL + CELL / 2;
        const cy = OFFY + a.y * CELL + CELL / 2;
        const pulse = 1 + 0.12 * Math.sin(a.t * 5);
        Sprites.draw(ctx, 'snake.apple', cx, cy, (CELL + 2) * pulse, (CELL + 2) * pulse, {
          fallback: () => { ctx.fillStyle='#ef4444'; ctx.beginPath(); ctx.arc(cx,cy,CELL/2-3,0,Math.PI*2); ctx.fill(); }
        });
      }
      // Golden apples
      for (const a of this.goldenApples) {
        const cx = OFFX + a.x * CELL + CELL / 2;
        const cy = OFFY + a.y * CELL + CELL / 2;
        const pulse = 1 + 0.18 * Math.sin(a.t * 7);
        Sprites.draw(ctx, 'snake.appleGold', cx, cy, (CELL + 6) * pulse, (CELL + 6) * pulse);
      }

      // Worm
      if (this.worm) {
        const tint = this.worm.hitFlash;
        for (let i = this.worm.segs.length - 1; i >= 0; i--) {
          const s = this.worm.segs[i];
          const cx = OFFX + s.x * CELL + CELL / 2;
          const cy = OFFY + s.y * CELL + CELL / 2;
          if (i === 0) {
            const rot = Math.atan2(this.worm.dir.y, this.worm.dir.x);
            Sprites.draw(ctx, 'snake.worm.head', cx, cy, CELL + 4, CELL + 4, { rot });
          } else {
            Sprites.draw(ctx, 'snake.worm.body', cx, cy, CELL, CELL,
              { alpha: 1 - (i / (this.worm.segs.length + 6)) * 0.4 });
          }
        }
        if (tint > 0) {
          ctx.save();
          ctx.globalAlpha = Math.min(1, tint * 1.6);
          for (const s of this.worm.segs) {
            ctx.fillStyle = '#fbbf24';
            ctx.fillRect(OFFX + s.x * CELL + 2, OFFY + s.y * CELL + 2, CELL - 4, CELL - 4);
          }
          ctx.restore();
        }
      }

      // Player snake
      this._renderSnake(ctx);

      // Cave light overlay (cuts through everything)
      if (BIOMES[this.biomeIx] && BIOMES[this.biomeIx].light && this.snake.length) {
        this._renderCaveLight(ctx);
      }

      // Effect glyphs on the HUD edge of the field
      this._renderEffectsBar(ctx);
    }

    _renderSnake(ctx) {
      for (let i = this.snake.length - 1; i >= 0; i--) {
        const s = this.snake[i];
        const cx = OFFX + s.x * CELL + CELL / 2;
        const cy = OFFY + s.y * CELL + CELL / 2;
        if (i === 0) {
          const rot = Math.atan2(this.dir.y, this.dir.x);
          const grow = 1 + this.headPulse * 0.12;
          Sprites.draw(ctx, 'snake.head', cx, cy, (CELL + 4) * grow, (CELL + 4) * grow, {
            rot,
            alpha: this.effects.ghost > 0 ? 0.6 : 1,
            fallback: () => { ctx.fillStyle = '#86efac'; ctx.fillRect(cx-CELL/2, cy-CELL/2, CELL, CELL); }
          });
        } else {
          const a = this.effects.ghost > 0 ? 0.45
                  : 1 - (i / (this.snake.length + 6)) * 0.45;
          Sprites.draw(ctx, 'snake.body', cx, cy, CELL, CELL, { alpha: a });
        }
      }
    }

    _renderCaveLight(ctx) {
      const head = this.snake[0];
      const cx = OFFX + head.x * CELL + CELL / 2;
      const cy = OFFY + head.y * CELL + CELL / 2;
      // Light radius shrinks with biome progression (eaten count) but never below 80px.
      const base = 220;
      const shrink = (this.eaten / APPLES_PER_BIOME) * 110;
      const r = Math.max(80, base - shrink);
      ctx.save();
      const grad = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(2,2,8,0.92)');
      ctx.fillStyle = grad;
      ctx.fillRect(OFFX, OFFY, FIELD_W, FIELD_H);
      // Subtle ring around light edge so the player can see where the dark begins.
      ctx.strokeStyle = 'rgba(167,139,250,0.25)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    _renderEffectsBar(ctx) {
      const order = [
        { k:'slowmo', sprite:'snake.power.slowmo', label:'SLOW' },
        { k:'ghost',  sprite:'snake.power.ghost',  label:'GHOST' },
        { k:'magnet', sprite:'snake.power.magnet', label:'MAG' }
      ];
      let active = 0;
      for (const e of order) if (this.effects[e.k] > 0) active++;
      if (!active) return;
      const xStart = OFFX + 6;
      const y = OFFY + FIELD_H + 8;
      let i = 0;
      ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.textAlign='left'; ctx.textBaseline='middle';
      for (const e of order) {
        if (this.effects[e.k] <= 0) continue;
        const x = xStart + i * 96;
        Sprites.draw(ctx, e.sprite, x + 14, y + 14, 26, 26);
        ctx.fillStyle = '#fff';
        ctx.fillText(e.label + ' ' + this.effects[e.k].toFixed(1) + 's', x + 32, y + 14);
        i++;
      }
    }

    // ----------------------------------------------------------- intro / shop / victory render
    _renderIntro(ctx) {
      const cx = W / 2;
      ctx.fillStyle = '#86efac';
      ctx.shadowColor = '#4ade80'; ctx.shadowBlur = 18;
      ctx.font = 'bold 44px ui-monospace, monospace';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('THE SERPENT CAMPAIGN', cx, 130);
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#fde68a'; ctx.font = '15px ui-monospace, monospace';
      ctx.fillText('Four biomes · Four boss worms · One snake to clear them all', cx, 170);

      // Biome strip
      const startX = cx - (BIOMES.length - 1) * 100;
      BIOMES.forEach((b, i) => {
        const x = startX + i * 200, y = 252;
        ctx.fillStyle = i <= this.save.bestBiome ? '#fff' : '#475569';
        ctx.font = 'bold 14px ui-monospace, monospace';
        ctx.fillText(b.name.toUpperCase(), x, y - 64);
        // Mini biome card
        const card = ctx.createLinearGradient(x - 70, y, x + 70, y + 80);
        card.addColorStop(0, b.bg[0]); card.addColorStop(1, b.bg[1]);
        ctx.fillStyle = card; ctx.fillRect(x - 70, y - 50, 140, 100);
        ctx.strokeStyle = b.border; ctx.lineWidth = 2;
        ctx.strokeRect(x - 70, y - 50, 140, 100);
        Sprites.draw(ctx, b.decor, x - 36, y, 36, 36, { alpha: 0.85 });
        Sprites.draw(ctx, 'snake.apple', x + 4, y, 32, 32);
        Sprites.draw(ctx, 'snake.appleGold', x + 40, y - 12, 28, 28);
      });

      // Sample snake mid-screen
      Sprites.draw(ctx, 'snake.body', cx - 40, 410, 28, 28);
      Sprites.draw(ctx, 'snake.body', cx - 12, 410, 28, 28);
      Sprites.draw(ctx, 'snake.head', cx + 16, 410, 32, 32);
      Sprites.draw(ctx, 'snake.appleGold', cx + 60, 410, 30, 30);

      ctx.fillStyle = '#fff'; ctx.font = 'bold 18px ui-monospace, monospace';
      ctx.fillText('CLICK TO BEGIN', cx, 480);
      ctx.fillStyle = '#86efac'; ctx.font = '12px ui-monospace, monospace';
      ctx.fillText('Arrows / WASD to steer · 8 apples per biome · then face the WORM', cx, 506);
      ctx.fillText('Brush the worm body to spawn a golden apple — eat 3 to defeat it', cx, 524);

      if (this.save.bestBiome > 0) {
        ctx.fillStyle = '#fde68a';
        ctx.fillText('Furthest cleared: ' + BIOMES[Math.min(this.save.bestBiome - 1, BIOMES.length - 1)].name +
                     ' biome', cx, 550);
      }
    }

    _renderBetween(ctx) {
      const cx = W / 2, cy = H / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#fbbf24';
      ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 16;
      ctx.font = 'bold 48px ui-monospace, monospace';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('BIOME CLEARED', cx, cy - 40);
      ctx.shadowBlur = 0;
      const b = BIOMES[this.biomeIx];
      ctx.fillStyle = '#fde68a'; ctx.font = '16px ui-monospace, monospace';
      ctx.fillText(b.name + ' worm defeated · +' + (300 + this.biomeIx * 200) + ' bonus', cx, cy + 4);
      if (this.betweenTimer > 0.5) {
        ctx.fillStyle = '#fff'; ctx.font = 'bold 18px ui-monospace, monospace';
        ctx.fillText('Click to continue', cx, cy + 50);
      }
    }

    _renderShop(ctx) {
      ctx.fillStyle = 'rgba(0,0,0,0.78)';
      ctx.fillRect(0, 0, W, H);
      const cx = W / 2;
      ctx.fillStyle = '#86efac';
      ctx.shadowColor = '#4ade80'; ctx.shadowBlur = 14;
      ctx.font = 'bold 32px ui-monospace, monospace';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('THE COMMISSARY', cx, 78);
      ctx.shadowBlur = 0;

      const next = BIOMES[this.biomeIx + 1];
      ctx.fillStyle = '#fde68a'; ctx.font = '14px ui-monospace, monospace';
      ctx.fillText('Next biome: ' + next.name.toUpperCase(), cx, 108);
      const coins = Storage.getGameWallet('snake');
      ctx.fillStyle = '#fbbf24'; ctx.font = 'bold 16px ui-monospace, monospace';
      ctx.fillText('Snake purse: ● ' + coins, cx, 134);

      this.shopRects = [];
      const cardW = 188, cardH = 226, gap = 18;
      const totalW = cardW * PERKS.length + gap * (PERKS.length - 1);
      const startX = cx - totalW / 2;
      const y = 174;
      PERKS.forEach((p, i) => {
        const x = startX + i * (cardW + gap);
        const owned = !!this.save.perks[p.id];
        const broke = !owned && coins < p.cost;
        const rect = { x, y, w: cardW, h: cardH, kind: 'perk', perk: p };
        this.shopRects.push(rect);

        ctx.fillStyle = owned ? '#1c2c1e' : '#0f1f12';
        ctx.fillRect(x, y, cardW, cardH);
        ctx.strokeStyle = owned ? '#4ade80' : (broke ? '#7f1d1d' : '#86efac');
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, cardW, cardH);

        ctx.fillStyle = '#86efac'; ctx.font = 'bold 16px ui-monospace, monospace';
        ctx.textAlign='center'; ctx.textBaseline='top';
        ctx.fillText(p.name, x + cardW / 2, y + 12);

        Sprites.draw(ctx, p.sprite, x + cardW / 2, y + 90, 88, 88);

        ctx.fillStyle = '#fff'; ctx.font = '12px ui-monospace, monospace';
        wrapText(ctx, p.desc, x + cardW / 2, y + 152, cardW - 16, 14);

        ctx.fillStyle = owned ? '#4ade80' : (broke ? '#f87171' : '#fbbf24');
        ctx.font = 'bold 14px ui-monospace, monospace';
        ctx.fillText(owned ? 'OWNED' : ('● ' + p.cost), x + cardW / 2, y + cardH - 26);
      });

      // Continue button
      const cw = 280, ch = 54;
      const bx = cx - cw / 2, by = 444;
      this.shopRects.push({ x: bx, y: by, w: cw, h: ch, kind: 'continue' });
      ctx.fillStyle = '#0f3a1c'; ctx.fillRect(bx, by, cw, ch);
      ctx.strokeStyle = '#4ade80'; ctx.lineWidth = 2;
      ctx.strokeRect(bx, by, cw, ch);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 18px ui-monospace, monospace';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('ENTER ' + next.name.toUpperCase(), cx, by + ch / 2);
    }

    _renderVictory(ctx) {
      const cx = W / 2, cy = H / 2;
      const g = ctx.createRadialGradient(cx, cy, 60, cx, cy, 600);
      g.addColorStop(0, '#3a2a06'); g.addColorStop(1, '#02060a');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

      // Trophy serpent: biome glyphs around a giant golden apple.
      Sprites.draw(ctx, 'snake.appleGold', cx, cy - 30, 200, 200);
      const r = 170;
      BIOMES.forEach((b, i) => {
        const a = -Math.PI / 2 + i * (Math.PI * 2 / BIOMES.length);
        const x = cx + Math.cos(a) * r;
        const y = (cy - 30) + Math.sin(a) * r;
        Sprites.draw(ctx, b.decor, x, y, 56, 56);
        ctx.fillStyle = b.border; ctx.font = 'bold 12px ui-monospace, monospace';
        ctx.textAlign='center'; ctx.textBaseline='top';
        ctx.fillText(b.name.toUpperCase(), x, y + 32);
      });

      ctx.fillStyle = '#fbbf24';
      ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 20;
      ctx.font = 'bold 52px ui-monospace, monospace';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('CAMPAIGN CLEARED', cx, 100);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fde68a'; ctx.font = '16px ui-monospace, monospace';
      ctx.fillText('All four worms vanquished · +1000 trophy bonus', cx, 134);

      if (this.victoryTimer > 0.7) {
        ctx.fillStyle = '#fff'; ctx.font = 'bold 18px ui-monospace, monospace';
        ctx.fillText('Click to claim coins', cx, H - 70);
      }
    }
  }

  // -------------------------------------------------------------- text helper
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

  NDP.attachGame('snake', SnakeGame);
})();
