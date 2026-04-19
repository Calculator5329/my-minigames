/* Breakout — Five-World Tour.
   ----------------------------------------------------------------------------
   A 5-world × 3-level campaign culminating in a boss-brick mega-boss. Each
   world has a unique colour palette, paddle skin and brick mix; the final
   world ends with the Void Behemoth — a single mega brick that fires aimed
   shots at the paddle.

   Phase machine:
     intro → levelSplash → play → levelClear → (shop | next splash) → …
                                            ↳ on world 5 level 3 clear: boss
                                            ↳ on boss defeat: bossWin → victory

   Brick types (board layout codes):
     .  empty           n  normal              i  ice (2 HP)
     m  metal (only laser breaks it)           b  bomb (chain explodes)
     r  mirror (deflects + speeds up)          l  lock (needs key/perk)
     k  key             B  boss mega-brick (world 5 only)

   Power-up drops (~12% of broken bricks, no drops from mirror/metal):
     multi  — spawn 2 extra balls
     wide   — paddle +60% width for 12s
     laser  — hold Space to fire two upward beams (12s, one-shots non-metal)
     slow   — ball speed × 0.7 for 10s
     shield — one-shot ball-save line above the death zone

   Persistent perks (bought between worlds with global coins):
     steelPaddle   ($25) — start +20% wider
     insurance     ($40) — start each world with shield
     bombardier    ($35) — bomb chain expands to 5×5
     multiStart    ($50) — level start spawns +2 balls for 2s
     vaultLocksmith($30) — locks open after the very first brick break

   Save shape (Storage.mergeGameData('breakout', …)):
     { bestWorld, perks: {...}, defeatedBoss: bool }
*/
(function () {
  const NDP = window.NDP;
  const { BaseGame, Input, Sprites } = NDP.Engine;
  const Storage = NDP.Engine.Storage;

  // Sprites live in a sister file. Inject if not already present so the game
  // works even when the host page hasn't been updated to load it explicitly.
  if (!Sprites.has('brk.brick_normal') && typeof document !== 'undefined') {
    const tag = document.createElement('script');
    tag.src = 'games/breakout/sprites.js?v=2';
    tag.async = false;
    document.head.appendChild(tag);
  }

  // ---------- Geometry ----------
  const W = 960, H = 600;
  const PLAY_TOP = 56;
  const COLS = 13;
  const FIELD_PAD = 30;
  const BRICK_GAP = 4;
  const BRICK_W = (W - FIELD_PAD * 2 - BRICK_GAP * (COLS - 1)) / COLS;
  const BRICK_H = 28;
  const BRICK_TOP = 90;

  const PADDLE_BASE_W = 120;
  const PADDLE_H = 14;
  const PADDLE_Y = H - 50;
  const BALL_R = 8;
  const DEATH_Y = H + BALL_R * 2;
  const SHIELD_Y = PADDLE_Y + 32;

  const BALL_BASE_SPEED = 380;
  const BALL_MAX_SPEED  = 900;

  // ---------- Worlds ----------
  // Each level layout is COLS-wide; rows are read top-down. Laying out as
  // strings keeps them readable in source. The helper pads/truncates each row
  // to exactly COLS characters so a typo can't silently shift the grid.
  const lvl = (rows) => rows.map(s => {
    const padded = (s + '.............').slice(0, COLS);
    return padded.split('');
  });

  const WORLDS = [
    {
      name: 'PASTEL', paddle: 'brk.paddle_pastel',
      bg1: '#ffd6e8', bg2: '#7c5dba',
      brick: '#ff9ec7', textGlow: '#ff5e7e',
      banner: 'brk.banner_pastel',
      blurb: 'Soft hearts, soft bricks. Find the rhythm.',
      levels: [
        lvl([
          'nnnnnnnnnnnnn',
          'nnnnnnnnnnnnn',
          '.n.n.n.n.n.n.',
          '..n.n.n.n.n..'
        ]),
        lvl([
          '.nnnnnnnnnnn.',
          'nk.........kn',
          'nlllllllllln.',
          '.nnnnnnnnnn..',
          '..nn.....nn..'
        ]),
        lvl([
          'nnn.nnnnn.nnn',
          'n.nnn.b.nnn.n',
          'nnn.b.n.b.nnn',
          'n.nnn.b.nnn.n',
          'nnn.nnnnn.nnn'
        ])
      ]
    },
    {
      name: 'STEEL', paddle: 'brk.paddle_steel',
      bg1: '#3a4660', bg2: '#0f1626',
      brick: '#8a99b4', textGlow: '#cfd8e6',
      banner: 'brk.banner_steel',
      blurb: 'Reinforced rivets. Watch the indestructible plates.',
      levels: [
        lvl([
          'nnnnnnnnnnnnn',
          'mnnnnnnnnnnnm',
          'm.nnnnnnnnn.m',
          'm..nnnnnnn..m',
          'mmmmmmmmmmmmm'
        ]),
        lvl([
          'mnnnnnnnnnnnm',
          'niiiiiiiiiiin',
          'n.i.i.i.i.i.n',
          'niiiiiiiiiiin',
          'mnnnnnnnnnnnm'
        ]),
        lvl([
          'mnmnmnmnmnmnm',
          'nbnbnbnbnbnbn',
          'mnmnmnmnmnmnm',
          'nbnbnbnbnbnbn',
          'mnmnmnmnmnmnm'
        ])
      ]
    },
    {
      name: 'FROST', paddle: 'brk.paddle_frost',
      bg1: '#a4dffa', bg2: '#1a3a5a',
      brick: '#7cd9ff', textGlow: '#e7f5ff',
      banner: 'brk.banner_frost',
      blurb: 'Twice the hits, twice the patience.',
      levels: [
        lvl([
          'iiiiiiiiiiiii',
          'iiiiiiiiiiiii',
          'i.i.i.i.i.i.i',
          '.i.i.i.i.i.i.'
        ]),
        lvl([
          'iiiiikiiiiiii',
          'illlllllllli.',
          'iiiiiiiiiiiii',
          'i.iii.iii.iii',
          '.i.i.i.i.i.i.'
        ]),
        lvl([
          'iririririri.r',
          'i.r.i.r.i.r.i',
          'iririririri.r',
          'i.r.i.r.i.r.i',
          'iiiiiiiiiiiii'
        ])
      ]
    },
    {
      name: 'EMBER', paddle: 'brk.paddle_ember',
      bg1: '#ff8c3a', bg2: '#3a0a08',
      brick: '#ff5e3a', textGlow: '#ffd86b',
      banner: 'brk.banner_ember',
      blurb: 'The forge runs hot. Bombs everywhere.',
      levels: [
        lvl([
          'nnnnnbnnnnnnn',
          'nbnnnnnnnbnnn',
          'nnnnnnbnnnnnn',
          'nnbnnnnnnbnnn',
          'nnnnbnnnbnnnn'
        ]),
        lvl([
          'rnnnnbnnnnnnr',
          'rnnnnnnnnnnnr',
          'r.nnnnnnnnn.r',
          'r..nnnbnnn..r',
          'rrrr.....rrrr'
        ]),
        lvl([
          'mbnbnbnbnbnbm',
          'nnnnnnnnnnnnn',
          'mnmnmnmnmnmnm',
          'nnnnnnnnnnnnn',
          'mbnbnbnbnbnbm'
        ])
      ]
    },
    {
      name: 'VOID', paddle: 'brk.paddle_void',
      bg1: '#1a0a2a', bg2: '#040206',
      brick: '#7a3aff', textGlow: '#ff5eff',
      banner: 'brk.banner_void',
      blurb: 'Cosmic chaos. Then the Behemoth.',
      levels: [
        lvl([
          'rmrmrmrmrmrmr',
          'mbnbnbnbnbnbm',
          'rmnmnmnmnmnmr',
          'mbnbnbnbnbnbm',
          'rmrmrmrmrmrmr'
        ]),
        lvl([
          'iiiiikkkiiiii',
          'illllllllllli',
          'illllllllllli',
          'iiiiiiiiiiiii',
          'i.i.i.i.i.i.i'
        ]),
        lvl([
          'mrirnrnrnrirm',
          'rbnbnbnbnbnbr',
          'inininininini',
          'rbnbnbnbnbnbr',
          'mrirnrnrnrirm'
        ])
      ]
    }
  ];

  // ---------- Persistent perks ----------
  const PERKS = [
    { id: 'steelPaddle',    name: 'STEEL PADDLE', desc: 'Start every level +20% wider.',                cost: 25 },
    { id: 'insurance',      name: 'INSURANCE',    desc: 'Begin each world with a shield equipped.',     cost: 40 },
    { id: 'bombardier',     name: 'BOMBARDIER',   desc: 'Bomb bricks chain a 5×5 area instead of 3×3.', cost: 35 },
    { id: 'multiStart',     name: 'MULTI START',  desc: 'Each level starts with +2 bonus balls (2s).',  cost: 50 },
    { id: 'vaultLocksmith', name: 'VAULT KEY',    desc: 'Locks open after any brick break.',            cost: 30 }
  ];

  // ---------- Power-ups ----------
  const POWERUP_KINDS = ['multi', 'wide', 'laser', 'slow', 'shield'];
  const POWERUP_SPRITE = {
    multi:  'brk.pu_multi',
    wide:   'brk.pu_wide',
    laser:  'brk.pu_laser',
    slow:   'brk.pu_slow',
    shield: 'brk.pu_shield'
  };
  const POWERUP_COLOR = {
    multi:  '#4ade80',
    wide:   '#7cd9ff',
    laser:  '#ff5e7e',
    slow:   '#a78bfa',
    shield: '#5eead4'
  };

  // ---------- Save ----------
  function loadSave() {
    const def = {
      bestWorld: 0,
      perks: {
        steelPaddle: false, insurance: false, bombardier: false,
        multiStart: false, vaultLocksmith: false
      },
      defeatedBoss: false
    };
    const stored = Storage.getGameData('breakout') || {};
    return Object.assign(def, stored, {
      perks: Object.assign(def.perks, stored.perks || {})
    });
  }
  function saveData(d) { Storage.mergeGameData('breakout', d); }

  // =========================================================================
  class BreakoutGame extends BaseGame {
    init() {
      this.save = loadSave();

      this.phase = 'intro';
      this.worldIdx = 0;
      this.levelIdx = 0;
      this.lives = 3;
      this.combo = 0;
      this.lastBrickT = 0;

      this.paddleX = W / 2;
      this.balls = [];
      this.bricks = [];
      this.powerups = [];
      this.beams = [];
      this.bossShots = [];
      this.boss = null;
      this.bossShotCd = 0;
      this.locksOpen = false;

      // Active power-up timers (seconds remaining).
      this.fxWide  = 0;
      this.fxSlow  = 0;
      this.fxLaser = 0;
      this.fxShield = false;
      this._laserCd = 0;

      this.trail = [];
      this.lastTrailT = 0;

      this.shopRects = [];
      this.feedback = null;

      this.sfx = this.makeSfx({
        wall:    { freq: 320, type: 'square',   dur: 0.04, vol: 0.16 },
        paddle:  { freq: 480, type: 'square',   dur: 0.06, vol: 0.22 },
        brick:   { freq: 640, type: 'triangle', dur: 0.06, slide: 200, vol: 0.30 },
        ice:     { freq: 880, type: 'sine',     dur: 0.08, slide: 120, vol: 0.28 },
        metal:   { freq: 200, type: 'square',   dur: 0.05, vol: 0.20 },
        bomb:    { freq: 120, type: 'sawtooth', dur: 0.22, slide: -80, vol: 0.50 },
        mirror:  { freq: 720, type: 'sine',     dur: 0.12, slide: -120, vol: 0.30 },
        key:     { freq: 980, type: 'triangle', dur: 0.18, slide: 320, vol: 0.40 },
        die:     { freq: 200, type: 'sawtooth', dur: 0.4,  slide: -100, vol: 0.40 },
        clear:   { freq: 880, type: 'triangle', dur: 0.3,  slide: 600, vol: 0.50 },
        powerup: { freq: 720, type: 'triangle', dur: 0.18, slide: 220, vol: 0.40 },
        laser:   { freq: 1200,type: 'square',   dur: 0.05, vol: 0.20 },
        boss:    { freq: 80,  type: 'sawtooth', dur: 0.6,  slide: -40, vol: 0.55 },
        bossHit: { freq: 280, type: 'square',   dur: 0.10, vol: 0.40 },
        win:     { freq: 880, type: 'triangle', dur: 0.5,  slide: 500, vol: 0.55 },
        buy:     { freq: 1100,type: 'square',   dur: 0.10, vol: 0.40 }
      });

      Sprites.preload([
        'brk.brick_normal','brk.brick_ice','brk.brick_metal','brk.brick_bomb',
        'brk.brick_mirror','brk.brick_lock','brk.brick_key'
      ], BRICK_W, BRICK_H);
      Sprites.preload(WORLDS.map(w => w.paddle), PADDLE_BASE_W * 2, PADDLE_H * 2);

      this._refreshHud();
    }

    onEnd() {
      this.save.bestWorld = Math.max(this.save.bestWorld, this.worldIdx);
      saveData(this.save);
    }

    _refreshHud() {
      const w = WORLDS[this.worldIdx] || WORLDS[0];
      const wlabel = w ? w.name : '';
      const lvlNum = this.phase === 'boss' ? 'BOSS' : (this.levelIdx + 1);
      this.setHud(
        `<span>World <b>${this.worldIdx + 1}-${lvlNum}</b> ${wlabel}</span>` +
        `<span>Lives <b>${this.lives}</b></span>` +
        `<span>Balls <b>${this.balls.length}</b></span>` +
        `<span>Score <b>${this.score}</b></span>`
      );
    }

    // -------------------------------------------------------------- helpers
    _currentPaddleW() {
      let w = PADDLE_BASE_W;
      if (this.save.perks.steelPaddle) w *= 1.20;
      if (this.fxWide > 0) w *= 1.60;
      return w;
    }

    _spawnBall(x, y, vx, vy, opts) {
      const o = opts || {};
      this.balls.push({
        x, y, vx: vx || 0, vy: vy || 0,
        served: !!(vx || vy),
        serveTimer: o.serveTimer != null ? o.serveTimer : 0.4,
        ttl: o.ttl != null ? o.ttl : 0   // 0 = unlimited
      });
    }

    _serveBall(b) {
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI / 4;
      const sp = BALL_BASE_SPEED + this.worldIdx * 30;
      b.vx = Math.cos(ang) * sp;
      b.vy = Math.sin(ang) * sp;
      b.served = true;
    }

    _startLevel(worldIdx, levelIdx) {
      this.worldIdx = worldIdx;
      this.levelIdx = levelIdx;
      this.phase = 'play';
      this.combo = 0;
      this.lastBrickT = 0;
      this.bricks = [];
      this.powerups = [];
      this.beams = [];
      this.bossShots = [];
      this.boss = null;
      this.balls = [];
      this.locksOpen = false;
      // Effects reset between levels (perks are persistent though).
      this.fxWide = 0; this.fxSlow = 0; this.fxLaser = 0;
      this.fxShield = false;
      this._laserCd = 0;

      const layout = WORLDS[worldIdx].levels[levelIdx];
      const rows = layout.length;
      const totalH = rows * (BRICK_H + BRICK_GAP) - BRICK_GAP;
      const startY = BRICK_TOP + Math.max(0, (160 - totalH) / 2);

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < COLS; c++) {
          const ch = layout[r][c];
          if (!ch || ch === '.') continue;
          this._addBrick(r, c, startY, ch);
        }
      }

      // Shield from insurance perk applies at start of every world's level 1.
      if (this.save.perks.insurance && levelIdx === 0) this.fxShield = true;

      // Initial ball + perk bonus balls.
      this._spawnBall(this.paddleX, PADDLE_Y - 22, 0, 0, { serveTimer: 0.6 });
      if (this.save.perks.multiStart) {
        for (let k = 0; k < 2; k++) {
          const ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI / 2;
          const sp = BALL_BASE_SPEED;
          this._spawnBall(this.paddleX, PADDLE_Y - 22,
            Math.cos(ang) * sp, Math.sin(ang) * sp, { ttl: 2.0 });
        }
      }
    }

    _addBrick(row, col, startY, type) {
      const x = FIELD_PAD + col * (BRICK_W + BRICK_GAP);
      const y = startY + row * (BRICK_H + BRICK_GAP);
      const hp = type === 'i' ? 2 : 1;
      this.bricks.push({
        x, y, w: BRICK_W, h: BRICK_H,
        row, col, type, hp,
        alive: true, hitT: 0
      });
    }

    _startBoss() {
      this.phase = 'boss';
      this.combo = 0;
      this.bricks = [];
      this.powerups = [];
      this.beams = [];
      this.bossShots = [];
      this.balls = [];
      this.fxWide = 0; this.fxSlow = 0; this.fxLaser = 0;
      this.fxShield = !!this.save.perks.insurance;
      this._laserCd = 0;
      this.bossShotCd = 1.5;

      const bw = 320, bh = 100;
      this.boss = {
        x: W / 2 - bw / 2,
        y: 110,
        w: bw, h: bh,
        hp: 12, maxHp: 12,
        hitT: 0, glow: 0
      };
      this._spawnBall(this.paddleX, PADDLE_Y - 22, 0, 0, { serveTimer: 0.8 });
      this.sfx.play('boss');
      this.flash('#ff5eff', 0.35);
      this.shake(8, 0.5);
    }

    // ============================================================== UPDATE
    update(dt) {
      switch (this.phase) {
        case 'intro':       return this._updIntro();
        case 'levelSplash': return this._updSplash();
        case 'play':        return this._updPlay(dt);
        case 'levelClear':  return this._updClear();
        case 'shop':        return this._updShop();
        case 'boss':        return this._updBoss(dt);
        case 'bossWin':     return this._updBossWin();
        case 'victory':     return this._updVictory();
      }
    }

    _consumeClick() {
      if (Input.mouse.justPressed) { Input.mouse.justPressed = false; return true; }
      return false;
    }

    _updIntro() {
      this._refreshHud();
      if (this._consumeClick()) {
        this.worldIdx = 0; this.levelIdx = 0;
        this.phase = 'levelSplash';
      }
    }

    _updSplash() {
      this._refreshHud();
      if (this._consumeClick()) this._startLevel(this.worldIdx, this.levelIdx);
    }

    _updClear() {
      this._refreshHud();
      if (!this._consumeClick()) return;
      // Advance: next level, or end-of-world transition.
      if (this.levelIdx + 1 < WORLDS[this.worldIdx].levels.length) {
        this.levelIdx++;
        this.phase = 'levelSplash';
        return;
      }
      // End of a world. World 5 → boss; otherwise → shop.
      this.save.bestWorld = Math.max(this.save.bestWorld, this.worldIdx + 1);
      saveData(this.save);
      if (this.worldIdx === WORLDS.length - 1) {
        this._startBoss();
      } else {
        this.phase = 'shop';
      }
    }

    _updShop() {
      this._refreshHud();
      if (!this._consumeClick()) return;
      const mx = Input.mouse.x, my = Input.mouse.y;
      for (const r of this.shopRects) {
        if (mx < r.x || mx > r.x + r.w || my < r.y || my > r.y + r.h) continue;
        if (r.kind === 'continue') {
          this.worldIdx++;
          this.levelIdx = 0;
          this.phase = 'levelSplash';
          return;
        }
        if (r.kind === 'perk') {
          const p = r.perk;
          if (this.save.perks[p.id]) return;
          if (Storage.getCoins() < p.cost) return;
          if (!Storage.spendCoins(p.cost)) return;
          this.save.perks[p.id] = true;
          saveData(this.save);
          this.sfx.play('buy');
          this.particles.burst(r.x + r.w / 2, r.y + r.h / 2, 18,
            { color: '#ffd86b', speed: 220, life: 0.6 });
        }
        return;
      }
    }

    _updBossWin() {
      this._refreshHud();
      if (this._consumeClick()) {
        this.phase = 'victory';
        this.victoryTimer = 0;
        this.sfx.play('win');
        this.particles.burst(W / 2, H / 2, 110,
          { color: '#ff5eff', speed: 380, life: 1.0 });
      }
    }

    _updVictory() {
      this.victoryTimer = (this.victoryTimer || 0) + 1 / 60;
      if (this._consumeClick()) this.win();
    }

    // ----------------------------------------------------------------- play
    _updPlay(dt) {
      this._movePaddle(dt);

      // Advance effect timers
      if (this.fxWide  > 0) this.fxWide  = Math.max(0, this.fxWide  - dt);
      if (this.fxSlow  > 0) this.fxSlow  = Math.max(0, this.fxSlow  - dt);
      if (this.fxLaser > 0) this.fxLaser = Math.max(0, this.fxLaser - dt);
      if (this._laserCd > 0) this._laserCd = Math.max(0, this._laserCd - dt);

      // Pre-serve waiting balls follow paddle.
      for (const b of this.balls) {
        if (!b.served) {
          b.x = this.paddleX;
          b.y = PADDLE_Y - 22;
          b.serveTimer -= dt;
          if (b.serveTimer <= 0
              || Input.mouse.justPressed
              || Input.keys[' '] || Input.keys['Space']) {
            this._serveBall(b);
          }
        }
      }
      // Don't consume justPressed here — players might want to also use
      // a click to fire the laser; a single click acts as serve only when a
      // pre-serve ball exists, which is fine.

      // Laser firing
      if (this.fxLaser > 0 && (Input.keys[' '] || Input.keys['Space'])) {
        this._fireLaser();
      }

      // Move balls (substep so fast balls don't tunnel).
      for (let i = 0; i < this.balls.length; i++) {
        const b = this.balls[i];
        if (!b.served) continue;
        const speedMul = this.fxSlow > 0 ? 0.7 : 1;
        const sp = Math.hypot(b.vx, b.vy) * speedMul;
        const steps = Math.max(1, Math.ceil(sp * dt / 6));
        const sdt = dt / steps;
        for (let s = 0; s < steps; s++) {
          b.x += b.vx * sdt * speedMul;
          b.y += b.vy * sdt * speedMul;
          this._collide(b);
          if (!b._dead) continue;
          break;
        }
        if (b.ttl > 0) {
          b.ttl -= dt;
          if (b.ttl <= 0) b._dead = true;
        }
      }
      // Sweep dead balls
      for (let i = this.balls.length - 1; i >= 0; i--) {
        if (this.balls[i]._dead) this.balls.splice(i, 1);
      }
      // Out of balls → lose life
      if (this.balls.length === 0) {
        this._loseLife();
        if (this.state !== 'playing') return;
      }

      // Power-ups fall + paddle catch
      this._updatePowerups(dt);

      // Decay beam fade
      for (let i = this.beams.length - 1; i >= 0; i--) {
        this.beams[i].age += dt;
        if (this.beams[i].age >= this.beams[i].life) this.beams.splice(i, 1);
      }

      // Brick hit anim
      for (const br of this.bricks) if (br.hitT > 0) br.hitT -= dt * 4;

      // Combo decay
      this.lastBrickT += dt;
      if (this.lastBrickT > 1.5) this.combo = 0;

      // Trail
      this.lastTrailT += dt;
      if (this.lastTrailT > 0.018) {
        this.lastTrailT = 0;
        for (const b of this.balls) {
          if (b.served) this.trail.push({ x: b.x, y: b.y, age: 0, life: 0.32 });
        }
      }
      for (let i = this.trail.length - 1; i >= 0; i--) {
        this.trail[i].age += dt;
        if (this.trail[i].age >= this.trail[i].life) this.trail.splice(i, 1);
      }

      // Level cleared? (Suppressed during boss phase — clearing rules don't
      // apply when the only target is the mega-brick, which is handled by
      // _damageBoss → _defeatBoss instead.)
      if (this.phase === 'play' && !this.boss && this._levelCleared()) {
        this.phase = 'levelClear';
        this.combo = 0;
        const bonus = 200 + this.worldIdx * 80 + this.levelIdx * 40;
        this.addScore(bonus);
        this.sfx.play('clear');
        this.flash('#ffd86b', 0.3);
        this.shake(6, 0.35);
      }

      this._refreshHud();
    }

    _levelCleared() {
      // Level is cleared once every destructible brick is gone. Metal bricks
      // and unopened locks both block clearing — since locks become
      // destructible once locksOpen is true, an unopened lock stalls the
      // level only if no key exists in the current set (or the locksmith
      // perk is missing).
      for (const b of this.bricks) {
        if (!b.alive) continue;
        if (b.type === 'm') continue; // metal: ignore
        if (b.type === 'l' && !this.locksOpen) {
          // If there's still a key brick alive somewhere, we're not stuck.
          const keyAlive = this.bricks.some(x => x.alive && x.type === 'k');
          if (!keyAlive && !this.save.perks.vaultLocksmith) {
            // Locksmith perk would've opened locks already; without it AND
            // without a key, the lock is forever sealed → treat as cleared.
            continue;
          }
          return false;
        }
        return false;
      }
      return true;
    }

    _movePaddle(dt) {
      const pw = this._currentPaddleW();
      const mx = Input.mouse.x;
      if (mx > 0 && mx < W) {
        const diff = mx - this.paddleX;
        this.paddleX += clamp(diff, -900 * dt, 900 * dt);
      }
      if (Input.keys['a'] || Input.keys['A'] || Input.keys['ArrowLeft'])  this.paddleX -= 640 * dt;
      if (Input.keys['d'] || Input.keys['D'] || Input.keys['ArrowRight']) this.paddleX += 640 * dt;
      this.paddleX = clamp(this.paddleX, pw / 2, W - pw / 2);
    }

    // ----------------------------------------------------------- collisions
    _collide(b) {
      const pw = this._currentPaddleW();
      // Walls
      if (b.x < BALL_R) { b.x = BALL_R; b.vx = -b.vx; this.sfx.play('wall'); }
      else if (b.x > W - BALL_R) { b.x = W - BALL_R; b.vx = -b.vx; this.sfx.play('wall'); }
      if (b.y < BALL_R + PLAY_TOP) { b.y = BALL_R + PLAY_TOP; b.vy = -b.vy; this.sfx.play('wall'); }

      // Shield catch (above death zone). Treats SHIELD_Y as a safety net,
      // bouncing any descending ball that has passed the paddle line.
      if (this.fxShield && b.vy > 0 && b.y >= SHIELD_Y) {
        b.y = SHIELD_Y - BALL_R;
        b.vy = -Math.abs(b.vy);
        this.fxShield = false;
        this.sfx.play('powerup');
        this.particles.burst(b.x, SHIELD_Y, 18, { color: '#5eead4', speed: 220, life: 0.5 });
        this.flash('#5eead4', 0.12);
        return;
      }

      // Off the bottom
      if (b.y > DEATH_Y) { b._dead = true; return; }

      // Paddle
      if (b.vy > 0
          && b.y + BALL_R > PADDLE_Y
          && b.y - BALL_R < PADDLE_Y + PADDLE_H
          && b.x > this.paddleX - pw / 2 - BALL_R
          && b.x < this.paddleX + pw / 2 + BALL_R) {
        b.y = PADDLE_Y - BALL_R;
        const rel = (b.x - this.paddleX) / (pw / 2);
        const ang = -Math.PI / 2 + rel * (Math.PI / 3);
        const sp = Math.min(BALL_MAX_SPEED, Math.hypot(b.vx, b.vy) + 8);
        b.vx = Math.cos(ang) * sp;
        b.vy = Math.sin(ang) * sp;
        this.sfx.play('paddle', { freq: 480 + Math.abs(rel) * 200 });
        this.particles.burst(b.x, PADDLE_Y, 6,
          { color: '#7cd9ff', speed: 180, life: 0.3, size: 2 });
        this.combo = 0;
      }

      // Boss
      if (this.boss && this._collideBoss(b)) return;

      // Bricks
      for (const br of this.bricks) {
        if (!br.alive) continue;
        if (b.x + BALL_R <= br.x || b.x - BALL_R >= br.x + br.w
            || b.y + BALL_R <= br.y || b.y - BALL_R >= br.y + br.h) continue;
        const overL = (b.x + BALL_R) - br.x;
        const overR = (br.x + br.w) - (b.x - BALL_R);
        const overT = (b.y + BALL_R) - br.y;
        const overB = (br.y + br.h) - (b.y - BALL_R);
        const m = Math.min(overL, overR, overT, overB);
        const horiz = (m === overL || m === overR);
        this._hitBrick(b, br, horiz);
        break;
      }
    }

    _collideBoss(b) {
      const bo = this.boss;
      if (b.x + BALL_R <= bo.x || b.x - BALL_R >= bo.x + bo.w
          || b.y + BALL_R <= bo.y || b.y - BALL_R >= bo.y + bo.h) return false;
      const overL = (b.x + BALL_R) - bo.x;
      const overR = (bo.x + bo.w) - (b.x - BALL_R);
      const overT = (b.y + BALL_R) - bo.y;
      const overB = (bo.y + bo.h) - (b.y - BALL_R);
      const m = Math.min(overL, overR, overT, overB);
      if (m === overL || m === overR) b.vx = -b.vx; else b.vy = -b.vy;
      // Push out
      if (m === overL) b.x = bo.x - BALL_R;
      else if (m === overR) b.x = bo.x + bo.w + BALL_R;
      else if (m === overT) b.y = bo.y - BALL_R;
      else b.y = bo.y + bo.h + BALL_R;
      this._damageBoss(1, b.x, b.y);
      return true;
    }

    _hitBrick(ball, br, horiz) {
      const type = br.type;
      // Mirror: reflect both axes + speed up, no break.
      if (type === 'r') {
        ball.vx = -ball.vx;
        ball.vy = -ball.vy;
        const sp = Math.min(BALL_MAX_SPEED, Math.hypot(ball.vx, ball.vy) * 1.20);
        const ang = Math.atan2(ball.vy, ball.vx);
        ball.vx = Math.cos(ang) * sp;
        ball.vy = Math.sin(ang) * sp;
        br.hitT = 1;
        this.sfx.play('mirror');
        this.particles.burst(br.x + br.w / 2, br.y + br.h / 2, 10,
          { color: '#fff', speed: 220, life: 0.35 });
        return;
      }
      // Metal: bounce only.
      if (type === 'm') {
        if (horiz) ball.vx = -ball.vx; else ball.vy = -ball.vy;
        br.hitT = 1;
        this.sfx.play('metal');
        this.particles.burst(br.x + br.w / 2, br.y + br.h / 2, 4,
          { color: '#cfd8e6', speed: 120, life: 0.25, size: 2 });
        return;
      }
      // Lock: bounce only unless open.
      if (type === 'l' && !this.locksOpen) {
        if (horiz) ball.vx = -ball.vx; else ball.vy = -ball.vy;
        br.hitT = 1;
        this.sfx.play('metal', { freq: 260 });
        return;
      }
      // Ice: lose 1 HP, bounce, only break when 0.
      if (type === 'i' && br.hp > 1) {
        br.hp -= 1;
        if (horiz) ball.vx = -ball.vx; else ball.vy = -ball.vy;
        br.hitT = 1;
        this.sfx.play('ice');
        this.particles.burst(br.x + br.w / 2, br.y + br.h / 2, 6,
          { color: '#e7f5ff', speed: 160, life: 0.3, size: 2 });
        return;
      }
      // Anything else → break + bounce.
      if (horiz) ball.vx = -ball.vx; else ball.vy = -ball.vy;
      this._breakBrick(br, false);
    }

    _breakBrick(br, fromChain) {
      if (!br.alive) return;
      br.alive = false;
      br.hitT = 1;
      const cx = br.x + br.w / 2, cy = br.y + br.h / 2;
      const baseScore = { n: 10, i: 25, b: 30, l: 20, k: 40 }[br.type] || 10;
      this.combo++;
      this.lastBrickT = 0;
      const gain = baseScore + Math.max(0, this.combo - 1) * 5 + this.worldIdx * 4;
      this.addScore(gain);
      this.sfx.play('brick', { freq: 600 + this.combo * 8 });
      this.shake(2, 0.06);
      const w = WORLDS[this.worldIdx];
      this.particles.burst(cx, cy, fromChain ? 8 : 14,
        { color: w.brick, speed: 200, life: 0.4, size: 3 });

      // Locksmith: first brick break opens all locks.
      if (this.save.perks.vaultLocksmith && !this.locksOpen) {
        this.locksOpen = true;
        this._openLockFx();
      }

      if (br.type === 'k') {
        this.locksOpen = true;
        this.sfx.play('key');
        this.flash('#ffd86b', 0.18);
        this._openLockFx();
      }

      if (br.type === 'b') {
        this._chainBomb(br);
      }

      // Power-up drop (suppressed for chain explosions to avoid swarms).
      if (!fromChain && br.type !== 'r' && br.type !== 'm') {
        if (Math.random() < 0.12) this._dropPowerup(cx, cy);
      }
    }

    _openLockFx() {
      // Quick gold sparkle on every alive lock so the player notices.
      for (const b of this.bricks) {
        if (b.alive && b.type === 'l') {
          this.particles.burst(b.x + b.w / 2, b.y + b.h / 2, 6,
            { color: '#ffd86b', speed: 140, life: 0.4, size: 2 });
        }
      }
    }

    _chainBomb(centerBrick) {
      const radius = this.save.perks.bombardier ? 2 : 1;
      const queue = [centerBrick];
      const seen = new Set([centerBrick.row + ',' + centerBrick.col]);
      this.sfx.play('bomb');
      this.shake(8, 0.3);
      this.flash('#ff8c3a', 0.15);
      this.particles.burst(centerBrick.x + centerBrick.w / 2,
                           centerBrick.y + centerBrick.h / 2, 26,
        { color: '#ffd86b', speed: 320, life: 0.6, size: 3 });
      while (queue.length) {
        const b = queue.shift();
        for (let dr = -radius; dr <= radius; dr++) {
          for (let dc = -radius; dc <= radius; dc++) {
            if (dr === 0 && dc === 0) continue;
            const r = b.row + dr, c = b.col + dc;
            const key = r + ',' + c;
            if (seen.has(key)) continue;
            const target = this.bricks.find(x => x.alive && x.row === r && x.col === c);
            if (!target) continue;
            seen.add(key);
            // Bombs in radius break + chain. Mirror/metal/locked-locks resist.
            if (target.type === 'm' || target.type === 'r') continue;
            if (target.type === 'l' && !this.locksOpen) continue;
            if (target.type === 'b') queue.push(target);
            this._breakBrick(target, true);
          }
        }
      }
    }

    _dropPowerup(x, y) {
      const kind = POWERUP_KINDS[(Math.random() * POWERUP_KINDS.length) | 0];
      this.powerups.push({
        x, y, vx: 0, vy: 140 + Math.random() * 60,
        kind, age: 0
      });
    }

    _updatePowerups(dt) {
      const pw = this._currentPaddleW();
      for (let i = this.powerups.length - 1; i >= 0; i--) {
        const p = this.powerups[i];
        p.x += p.vx * dt; p.y += p.vy * dt; p.age += dt;
        // Catch on paddle
        if (p.y + 20 >= PADDLE_Y && p.y - 20 <= PADDLE_Y + PADDLE_H
            && p.x >= this.paddleX - pw / 2 - 14
            && p.x <= this.paddleX + pw / 2 + 14) {
          this._applyPowerup(p.kind, p.x);
          this.powerups.splice(i, 1);
          continue;
        }
        if (p.y > H + 30) this.powerups.splice(i, 1);
      }
    }

    _applyPowerup(kind, x) {
      this.sfx.play('powerup', { freq: 720 + Math.random() * 200 });
      this.flash(POWERUP_COLOR[kind], 0.18);
      this.particles.burst(x, PADDLE_Y, 18,
        { color: POWERUP_COLOR[kind], speed: 240, life: 0.5 });
      switch (kind) {
        case 'multi': {
          const seed = this.balls.find(b => b.served) || this.balls[0];
          if (!seed) break;
          for (let k = 0; k < 2; k++) {
            const sp = Math.hypot(seed.vx, seed.vy) || BALL_BASE_SPEED;
            const ang = Math.atan2(seed.vy, seed.vx) + (k === 0 ? 0.55 : -0.55);
            this._spawnBall(seed.x, seed.y,
              Math.cos(ang) * sp, Math.sin(ang) * sp);
          }
          break;
        }
        case 'wide':   this.fxWide  = 12; break;
        case 'laser':  this.fxLaser = 12; break;
        case 'slow':   this.fxSlow  = 10; break;
        case 'shield': this.fxShield = true; break;
      }
    }

    _fireLaser() {
      if (this._laserCd > 0) return;
      this._laserCd = 0.18;
      this.sfx.play('laser');
      const xs = [this.paddleX - 30, this.paddleX + 30];
      for (const lx of xs) {
        // Find topmost (smallest y... actually lowest y means "highest on
        // screen"; we want the brick whose bottom edge is highest below
        // PLAY_TOP and not above the paddle).
        let hit = null;
        for (const b of this.bricks) {
          if (!b.alive) continue;
          if (b.type === 'm') continue;
          if (lx < b.x || lx > b.x + b.w) continue;
          if (b.y + b.h > PADDLE_Y) continue;
          // Want the brick CLOSEST to the paddle (largest y).
          if (!hit || b.y > hit.y) hit = b;
        }
        const topY = hit ? hit.y + hit.h : PLAY_TOP;
        this.beams.push({ x: lx, y0: topY, y1: PADDLE_Y, life: 0.10, age: 0 });
        if (hit) {
          // Lock without open: laser still cannot smash — locks aren't
          // listed as breakable by laser. Skip if lock and not open.
          if (hit.type === 'l' && !this.locksOpen) continue;
          this._breakBrick(hit, false);
        }
        // Boss damage by laser
        if (this.boss
            && lx >= this.boss.x && lx <= this.boss.x + this.boss.w
            && this.boss.y + this.boss.h <= PADDLE_Y) {
          this._damageBoss(1, lx, this.boss.y + this.boss.h);
        }
      }
    }

    _loseLife() {
      this.lives--;
      this.sfx.play('die');
      this.shake(14, 0.4);
      this.flash('#ff3a3a', 0.22);
      this.combo = 0;
      if (this.lives <= 0) { this.gameOver(); return; }
      // Keep effects but spawn fresh ball.
      this._spawnBall(this.paddleX, PADDLE_Y - 22, 0, 0, { serveTimer: 0.6 });
    }

    // ------------------------------------------------------------ boss loop
    _updBoss(dt) {
      this._updPlay(dt);  // shares the play-phase mechanics
      if (this.state !== 'playing') return;
      if (this.phase !== 'boss') return; // _updPlay may have transitioned

      // Boss firing
      this.bossShotCd -= dt;
      if (this.bossShotCd <= 0 && this.boss && this.boss.hp > 0) {
        this.bossShotCd = 2.0;
        this._fireBossShot();
      }

      // Update boss shots
      for (let i = this.bossShots.length - 1; i >= 0; i--) {
        const s = this.bossShots[i];
        s.x += s.vx * dt; s.y += s.vy * dt;
        // Hit paddle
        const pw = this._currentPaddleW();
        if (s.y + 6 >= PADDLE_Y && s.y - 6 <= PADDLE_Y + PADDLE_H
            && s.x >= this.paddleX - pw / 2 - 4
            && s.x <= this.paddleX + pw / 2 + 4) {
          this.bossShots.splice(i, 1);
          this.shake(10, 0.35); this.flash('#ff5eff', 0.2);
          this.sfx.play('die', { freq: 260 });
          this._loseLife();
          if (this.state !== 'playing') return;
          continue;
        }
        if (s.y > H + 20 || s.x < -20 || s.x > W + 20) {
          this.bossShots.splice(i, 1);
        }
      }

      // Boss glow pulse
      this.boss.glow = (this.boss.glow + dt * 3) % (Math.PI * 2);
      if (this.boss.hitT > 0) this.boss.hitT -= dt * 4;

      // Win condition handled inside _damageBoss
      this._refreshHud();
    }

    _fireBossShot() {
      // Aimed at paddle position now.
      const cx = this.boss.x + this.boss.w / 2;
      const cy = this.boss.y + this.boss.h;
      const dx = this.paddleX - cx;
      const dy = PADDLE_Y - cy;
      const d  = Math.hypot(dx, dy) || 1;
      const speed = 320;
      this.bossShots.push({
        x: cx, y: cy,
        vx: (dx / d) * speed,
        vy: (dy / d) * speed
      });
      this.sfx.play('boss', { freq: 200, dur: 0.18 });
      this.particles.burst(cx, cy, 10,
        { color: '#ff5eff', speed: 180, life: 0.4 });
    }

    _damageBoss(n, x, y) {
      this.boss.hp -= n;
      this.boss.hitT = 1;
      this.addScore(50);
      this.shake(6, 0.18);
      this.flash('#ff5eff', 0.10);
      this.sfx.play('bossHit');
      this.particles.burst(x, y, 14,
        { color: '#ff5eff', speed: 240, life: 0.5 });
      if (this.boss.hp <= 0) {
        this._defeatBoss();
      }
    }

    _defeatBoss() {
      const cx = this.boss.x + this.boss.w / 2;
      const cy = this.boss.y + this.boss.h / 2;
      this.particles.burst(cx, cy, 80,
        { color: '#ff5eff', speed: 380, life: 0.9 });
      this.particles.burst(cx, cy, 60,
        { color: '#ffd86b', speed: 320, life: 0.8 });
      this.shake(20, 0.7);
      this.flash('#ff5eff', 0.4);
      this.sfx.play('clear');
      this.boss = null;
      this.bossShots = [];
      this.addScore(2000);
      this.save.defeatedBoss = true;
      this.save.bestWorld = WORLDS.length;
      saveData(this.save);
      this.phase = 'bossWin';
    }

    // ============================================================== RENDER
    render(ctx) {
      this._renderBg(ctx);
      switch (this.phase) {
        case 'intro':       return this._renderIntro(ctx);
        case 'levelSplash': return this._renderSplash(ctx);
        case 'play':        return this._renderPlay(ctx);
        case 'levelClear':  return this._renderClear(ctx);
        case 'shop':        return this._renderShop(ctx);
        case 'boss':        return this._renderBoss(ctx);
        case 'bossWin':     return this._renderBossWin(ctx);
        case 'victory':     return this._renderVictory(ctx);
      }
    }

    _renderBg(ctx) {
      const w = WORLDS[this.worldIdx] || WORLDS[0];
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, w.bg1); g.addColorStop(1, w.bg2);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // Top status strip — subtle band so HUD reads.
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, W, PLAY_TOP);
      ctx.fillStyle = w.textGlow;
      ctx.font = 'bold 14px ui-monospace, monospace';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(w.name + ' WORLD', 16, PLAY_TOP / 2);
      // Field border
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, PLAY_TOP + 0.5, W - 1, H - PLAY_TOP - 1);
    }

    _renderIntro(ctx) {
      const cx = W / 2;
      const w = WORLDS[0];
      ctx.fillStyle = w.textGlow;
      ctx.font = 'bold 42px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = w.textGlow; ctx.shadowBlur = 18;
      ctx.fillText('BREAKOUT TOUR', cx, 110);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff';
      ctx.font = '15px ui-monospace, monospace';
      ctx.fillText('5 worlds × 3 levels — bombs, mirrors, locks, lasers, then the Behemoth.', cx, 156);

      // Banner parade
      WORLDS.forEach((wo, i) => {
        Sprites.draw(ctx, wo.banner, 110 + i * 184, 240, 160, 64);
        ctx.fillStyle = wo.textGlow;
        ctx.font = 'bold 12px ui-monospace, monospace';
        ctx.fillText(wo.name, 110 + i * 184, 290);
      });

      ctx.fillStyle = '#fff';
      ctx.font = 'bold 18px ui-monospace, monospace';
      ctx.fillText('Click to begin in the PASTEL world', cx, 380);

      // Persistent stats
      ctx.fillStyle = '#cfe9ff'; ctx.font = '12px ui-monospace, monospace';
      const ownedPerks = PERKS.filter(p => this.save.perks[p.id]).map(p => p.name).join('  ·  ') || 'none';
      ctx.fillText(
        `Best world: ${this.save.bestWorld}/${WORLDS.length}` +
        (this.save.defeatedBoss ? '  ★ Behemoth slain' : '') +
        `   Perks: ${ownedPerks}`,
        cx, 440);

      // Controls
      ctx.fillStyle = '#cfe9ff';
      ctx.fillText('Mouse / A·D move   ·   Space serves & fires laser', cx, 470);
    }

    _renderSplash(ctx) {
      const cx = W / 2;
      const w = WORLDS[this.worldIdx];
      Sprites.draw(ctx, w.banner, cx, 160, 240, 96);
      ctx.fillStyle = w.textGlow;
      ctx.font = 'bold 32px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = w.textGlow; ctx.shadowBlur = 14;
      ctx.fillText(`WORLD ${this.worldIdx + 1} · ${w.name}`, cx, 250);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff'; ctx.font = '16px ui-monospace, monospace';
      ctx.fillText(`Level ${this.levelIdx + 1} of ${w.levels.length}`, cx, 290);
      ctx.fillStyle = w.textGlow; ctx.font = '14px ui-monospace, monospace';
      ctx.fillText(w.blurb, cx, 320);

      // Show the paddle skin so the new look is hyped
      Sprites.draw(ctx, w.paddle, cx, 380, 280, 26);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 18px ui-monospace, monospace';
      ctx.fillText('Click to begin', cx, 470);
    }

    _renderPlay(ctx) {
      this._renderBricks(ctx);
      this._renderPowerups(ctx);
      this._renderShield(ctx);
      this._renderTrail(ctx);
      this._renderBalls(ctx);
      this._renderPaddle(ctx);
      this._renderBeams(ctx);
      this._renderEffectsHud(ctx);

      if (this.combo >= 3) {
        ctx.fillStyle = '#ffd86b';
        ctx.font = 'bold 18px ui-monospace, monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('COMBO ×' + this.combo, W / 2, H - 90);
      }
      // Pre-serve hint
      const preServe = this.balls.some(b => !b.served);
      if (preServe) {
        ctx.fillStyle = '#fff'; ctx.font = 'bold 14px ui-monospace, monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('Click or Space to serve', W / 2, H / 2);
      }
    }

    _renderBricks(ctx) {
      const w = WORLDS[this.worldIdx];
      for (const b of this.bricks) {
        if (!b.alive) continue;
        const lift = Math.sin(b.hitT * Math.PI) * 2;
        // Pick base colour from world + brick type tint.
        let fill = w.brick;
        if (b.type === 'i') fill = '#cfeeff';
        else if (b.type === 'm') fill = '#5a6680';
        else if (b.type === 'b') fill = '#3a1408';
        else if (b.type === 'r') fill = '#222';
        else if (b.type === 'l') fill = this.locksOpen ? '#caa84a' : '#3a2014';
        else if (b.type === 'k') fill = '#1a1410';

        // Brick body
        ctx.fillStyle = fill;
        ctx.fillRect(b.x, b.y - lift, b.w, b.h);
        if (b.type === 'i' && b.hp > 1) {
          ctx.fillStyle = 'rgba(124,217,255,0.55)';
          ctx.fillRect(b.x, b.y - lift, b.w, b.h);
        }

        // Sprite overlay
        const key = ({
          n: 'brk.brick_normal', i: 'brk.brick_ice', m: 'brk.brick_metal',
          b: 'brk.brick_bomb',  r: 'brk.brick_mirror',
          l: this.locksOpen ? 'brk.brick_normal' : 'brk.brick_lock',
          k: 'brk.brick_key'
        })[b.type] || 'brk.brick_normal';
        Sprites.draw(ctx, key, b.x + b.w / 2, b.y + b.h / 2 - lift, b.w, b.h, {
          fallback: () => {
            // simple fallback while sprite loads
            ctx.fillStyle = 'rgba(255,255,255,0.18)';
            ctx.fillRect(b.x, b.y - lift, b.w, 4);
            ctx.fillStyle = 'rgba(0,0,0,0.25)';
            ctx.fillRect(b.x, b.y + b.h - 4 - lift, b.w, 4);
          }
        });
      }
    }

    _renderPowerups(ctx) {
      for (const p of this.powerups) {
        const wob = Math.sin(p.age * 6) * 2;
        Sprites.draw(ctx, POWERUP_SPRITE[p.kind], p.x + wob, p.y, 32, 32, {
          fallback: () => {
            ctx.fillStyle = POWERUP_COLOR[p.kind];
            ctx.fillRect(p.x - 14, p.y - 14, 28, 28);
          }
        });
      }
    }

    _renderShield(ctx) {
      if (!this.fxShield) return;
      ctx.save();
      ctx.strokeStyle = 'rgba(94,234,212,0.85)'; ctx.lineWidth = 3;
      ctx.shadowColor = '#5eead4'; ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.moveTo(8, SHIELD_Y); ctx.lineTo(W - 8, SHIELD_Y);
      ctx.stroke();
      ctx.restore();
    }

    _renderTrail(ctx) {
      for (const t of this.trail) {
        const a = 1 - t.age / t.life;
        ctx.fillStyle = `rgba(255,216,107,${a * 0.5})`;
        ctx.beginPath(); ctx.arc(t.x, t.y, BALL_R * a + 1, 0, Math.PI * 2); ctx.fill();
      }
    }

    _renderBalls(ctx) {
      for (const b of this.balls) {
        ctx.save();
        ctx.shadowColor = b.ttl > 0 ? '#a78bfa' : '#ffd86b';
        ctx.shadowBlur = 16;
        ctx.fillStyle = b.ttl > 0 ? '#c8a8ff' : '#ffd86b';
        ctx.beginPath(); ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }

    _renderPaddle(ctx) {
      const w = WORLDS[this.worldIdx] || WORLDS[0];
      const pw = this._currentPaddleW();
      const ph = PADDLE_H + 6;
      Sprites.draw(ctx, w.paddle, this.paddleX, PADDLE_Y + PADDLE_H / 2, pw, ph, {
        fallback: () => {
          ctx.fillStyle = '#e7ecf3';
          ctx.fillRect(this.paddleX - pw / 2, PADDLE_Y, pw, PADDLE_H);
        }
      });
    }

    _renderBeams(ctx) {
      for (const beam of this.beams) {
        const a = 1 - beam.age / beam.life;
        ctx.save();
        ctx.strokeStyle = `rgba(255,94,126,${a})`;
        ctx.shadowColor = '#ff5e7e'; ctx.shadowBlur = 16;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(beam.x, beam.y0); ctx.lineTo(beam.x, beam.y1);
        ctx.stroke();
        ctx.restore();
      }
    }

    _renderEffectsHud(ctx) {
      const items = [];
      if (this.fxWide  > 0) items.push({ k: 'WIDE',   t: this.fxWide,  c: '#7cd9ff' });
      if (this.fxLaser > 0) items.push({ k: 'LASER',  t: this.fxLaser, c: '#ff5e7e' });
      if (this.fxSlow  > 0) items.push({ k: 'SLOW',   t: this.fxSlow,  c: '#a78bfa' });
      if (this.fxShield)    items.push({ k: 'SHIELD', t: 0,            c: '#5eead4' });
      let x = 12; const y = H - 24;
      ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      for (const it of items) {
        const label = it.t ? `${it.k} ${it.t.toFixed(1)}s` : it.k;
        const wText = ctx.measureText(label).width + 16;
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x, y - 9, wText, 18);
        ctx.fillStyle = it.c; ctx.fillText(label, x + 8, y);
        x += wText + 6;
      }
    }

    _renderClear(ctx) {
      this._renderPlay(ctx);  // freeze the field underneath
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, PLAY_TOP, W, H - PLAY_TOP);
      const cx = W / 2;
      const w = WORLDS[this.worldIdx];
      ctx.fillStyle = w.textGlow;
      ctx.font = 'bold 36px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = w.textGlow; ctx.shadowBlur = 12;
      ctx.fillText(`LEVEL ${this.levelIdx + 1} CLEAR`, cx, 230);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff'; ctx.font = '16px ui-monospace, monospace';
      const next = (this.levelIdx + 1 < w.levels.length)
        ? `Next: Level ${this.levelIdx + 2}`
        : (this.worldIdx === WORLDS.length - 1 ? 'Next: BOSS' : 'Next: Perk Shop');
      ctx.fillText(next, cx, 280);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 18px ui-monospace, monospace';
      ctx.fillText('Click to continue', cx, 340);
    }

    _renderShop(ctx) {
      const cx = W / 2;
      ctx.fillStyle = '#ffd86b';
      ctx.font = 'bold 30px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = '#ffd86b'; ctx.shadowBlur = 14;
      ctx.fillText('PERK SHOP', cx, 90);
      ctx.shadowBlur = 0;

      const coins = Storage.getCoins();
      ctx.fillStyle = '#fff'; ctx.font = '15px ui-monospace, monospace';
      ctx.fillText(`Cleared World ${this.worldIdx + 1} of ${WORLDS.length}.   ● ${coins} coins`, cx, 124);

      this.shopRects = [];
      const cardW = 170, cardH = 200, gap = 12;
      const totalW = cardW * PERKS.length + gap * (PERKS.length - 1);
      const startX = cx - totalW / 2;
      const y = 180;
      PERKS.forEach((p, i) => {
        const x = startX + i * (cardW + gap);
        const owned = !!this.save.perks[p.id];
        const broke = !owned && coins < p.cost;
        const r = { x, y, w: cardW, h: cardH, kind: 'perk', perk: p };
        this.shopRects.push(r);

        ctx.fillStyle = owned ? '#1a2a14' : '#1a0d20';
        ctx.fillRect(x, y, cardW, cardH);
        ctx.strokeStyle = owned ? '#4ade80' : (broke ? '#5a3424' : '#ffd86b');
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, cardW, cardH);

        ctx.fillStyle = owned ? '#4ade80' : '#ffd86b';
        ctx.font = 'bold 14px ui-monospace, monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(p.name, x + cardW / 2, y + 12);

        ctx.fillStyle = '#fff'; ctx.font = '12px ui-monospace, monospace';
        wrapText(ctx, p.desc, x + cardW / 2, y + 50, cardW - 18, 14);

        ctx.fillStyle = owned ? '#7a6090' : (broke ? '#f87171' : '#ffd86b');
        ctx.font = 'bold 14px ui-monospace, monospace';
        ctx.fillText(owned ? 'OWNED' : ('● ' + p.cost), x + cardW / 2, y + cardH - 24);
      });

      // Continue button
      const cw = 280, ch = 50;
      const cxR = cx - cw / 2, cyR = 460;
      this.shopRects.push({ x: cxR, y: cyR, w: cw, h: ch, kind: 'continue' });
      ctx.fillStyle = '#1a4a2a'; ctx.fillRect(cxR, cyR, cw, ch);
      ctx.strokeStyle = '#4ade80'; ctx.lineWidth = 2;
      ctx.strokeRect(cxR, cyR, cw, ch);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 18px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const nextWorld = WORLDS[this.worldIdx + 1];
      ctx.fillText(`ENTER ${nextWorld ? nextWorld.name : '???'}`, cx, cyR + ch / 2);
    }

    _renderBoss(ctx) {
      this._renderShield(ctx);
      // Boss sprite + glow halo
      if (this.boss) {
        const lift = Math.sin(this.boss.hitT * Math.PI) * 4;
        Sprites.draw(ctx, 'brk.brick_boss',
          this.boss.x + this.boss.w / 2,
          this.boss.y + this.boss.h / 2 - lift,
          this.boss.w, this.boss.h, {
            fallback: () => {
              ctx.fillStyle = '#3a1a5a';
              ctx.fillRect(this.boss.x, this.boss.y, this.boss.w, this.boss.h);
            }
          });
        // HP bar
        const barX = this.boss.x, barY = this.boss.y + this.boss.h + 10;
        const barW = this.boss.w, barH = 8;
        ctx.fillStyle = '#000'; ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = '#ff5eff';
        ctx.fillRect(barX, barY, barW * (this.boss.hp / this.boss.maxHp), barH);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 11px ui-monospace, monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(`BEHEMOTH HP ${this.boss.hp}/${this.boss.maxHp}`, W / 2, barY + barH + 12);
      }
      // Boss shots
      for (const s of this.bossShots) {
        ctx.save();
        ctx.shadowColor = '#ff5eff'; ctx.shadowBlur = 12;
        ctx.fillStyle = '#ff5eff';
        ctx.beginPath(); ctx.arc(s.x, s.y, 6, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      // Existing play overlays
      this._renderTrail(ctx);
      this._renderBalls(ctx);
      this._renderPaddle(ctx);
      this._renderBeams(ctx);
      this._renderEffectsHud(ctx);
    }

    _renderBossWin(ctx) {
      this._renderBoss(ctx);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, PLAY_TOP, W, H - PLAY_TOP);
      ctx.fillStyle = '#ff5eff';
      ctx.font = 'bold 40px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = '#ff5eff'; ctx.shadowBlur = 18;
      ctx.fillText('BEHEMOTH SHATTERED', W / 2, 230);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff'; ctx.font = '16px ui-monospace, monospace';
      ctx.fillText('+2000 bonus', W / 2, 280);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 18px ui-monospace, monospace';
      ctx.fillText('Click for the closing screen', W / 2, 350);
    }

    _renderVictory(ctx) {
      const cx = W / 2;
      ctx.fillStyle = '#ffd86b'; ctx.font = 'bold 44px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = '#ffd86b'; ctx.shadowBlur = 18;
      ctx.fillText('TOUR COMPLETE', cx, 170);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff'; ctx.font = '18px ui-monospace, monospace';
      ctx.fillText('Five worlds, fifteen levels, one Behemoth.', cx, 230);
      ctx.fillText(`Final score: ${this.score}`, cx, 260);
      ctx.fillStyle = '#cfe9ff'; ctx.font = '13px ui-monospace, monospace';
      ctx.fillText(`Coins earned: ${this.coinsEarned(this.score)}`, cx, 300);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 18px ui-monospace, monospace';
      ctx.fillText('Click to finish run', cx, 380);
    }

    coinsEarned(score) { return Math.max(0, Math.floor(score / 120)); }
  }

  // ---------- helpers ----------
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
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

  NDP.attachGame('breakout', BreakoutGame);
})();
