/* Starfall — Roguelite Sector Campaign.
   ----------------------------------------------------------------------------
   5 sectors × (3 waves + mid-boss) + Warlord final boss. Between sectors the
   player picks a branching path card (biome + modifier + reward tier). 10
   upgrades in the pre-run shop.

   Phases:
     shop         — pre-run upgrade screen
     sectorIntro  — 1.8s "SECTOR N — BIOME NAME" card
     wave         — normal enemy spawns
     midboss      — sector's mid-boss
     mapChoice    — pick 1 of 3 next-sector cards
     finalBoss    — the Warlord (end of sector 5)
     victory      — run summary → BaseGame.win()
*/
(function () {
  const NDP = window.NDP;
  const { BaseGame, Input, Assets, Storage } = NDP.Engine;

  const W = 960, H = 600;
  const GID = 'starfall';
  const WAVES_PER_SECTOR = 3;
  const TOTAL_SECTORS = 5;

  // ---------------------------------------------------------------------------
  // BIOMES — each sector picks one, each has distinct palette + parallax tint
  const BIOMES = {
    frontier: {
      name: 'FRONTIER',
      bg1: '#0a0420', bg2: '#05080f',
      nebula: 'rgba(255,60,200,0.16)', nebPos: [0.25, 0.2],
      starA: '#fff', starB: '#cce', starC: '#668',
      accent: '#6cf', accent2: '#f0c',
      debris: false, aurora: false, emberColor: null
    },
    debris: {
      name: 'DEBRIS BELT',
      bg1: '#1a0e08', bg2: '#060404',
      nebula: 'rgba(255,170,80,0.14)', nebPos: [0.75, 0.3],
      starA: '#ffd', starB: '#cc9', starC: '#553',
      accent: '#fb6', accent2: '#c84',
      debris: true, aurora: false, emberColor: null
    },
    ion: {
      name: 'ION STORM',
      bg1: '#041a18', bg2: '#020a0a',
      nebula: 'rgba(80,255,200,0.18)', nebPos: [0.5, 0.5],
      starA: '#cfe', starB: '#8eb', starC: '#363',
      accent: '#3fe', accent2: '#6fc',
      debris: false, aurora: true, emberColor: null
    },
    void: {
      name: 'DEEP VOID',
      bg1: '#0a0418', bg2: '#020008',
      nebula: 'rgba(120,60,255,0.18)', nebPos: [0.3, 0.7],
      starA: '#ccf', starB: '#77a', starC: '#224',
      accent: '#a6f', accent2: '#46c',
      debris: false, aurora: false, emberColor: null
    },
    core: {
      name: 'THE CORE',
      bg1: '#2a0808', bg2: '#0a0000',
      nebula: 'rgba(255,100,40,0.24)', nebPos: [0.5, 0.2],
      starA: '#fec', starB: '#f96', starC: '#622',
      accent: '#f84', accent2: '#fd3',
      debris: false, aurora: false, emberColor: '#f84'
    }
  };

  // Sector 1 is always Frontier; Sector 5 is always Core (final boss). 2-4 are
  // drawn from a shuffled pool so each run's middle feels different.
  function rollSectorBiomes() {
    const pool = ['debris', 'ion', 'void'];
    // Fisher-Yates
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return ['frontier', pool[0], pool[1], pool[2], 'core'];
  }

  // ---------------------------------------------------------------------------
  // ENEMIES — base stats; per-biome pool selects which ones can spawn
  const ENEMY_DEFS = {
    grunt:   { r: 20, hp: 2, points: 10, color: '#7f7', vy: 60 },
    zig:     { r: 18, hp: 1, points: 20, color: '#fc6', vy: 90 },
    shooter: { r: 22, hp: 3, points: 30, color: '#f88', vy: 40 },
    dasher:  { r: 14, hp: 1, points: 25, color: '#4ff', vy: 260 },
    tank:    { r: 26, hp: 5, points: 60, color: '#b6f', vy: 35 },
    swarm:   { r: 14, hp: 1, points: 15, color: '#fa6', vy: 110 }
  };

  // Biome → spawn weights (weights must sum arbitrarily)
  const BIOME_POOLS = {
    frontier: [['grunt', 6], ['zig', 4]],
    debris:   [['grunt', 4], ['tank', 3], ['zig', 2]],
    ion:      [['zig', 4], ['shooter', 3], ['dasher', 3]],
    void:     [['shooter', 4], ['dasher', 4], ['swarm', 3]],
    core:     [['tank', 4], ['shooter', 3], ['swarm', 4]]
  };

  function pickEnemyKind(biome) {
    const pool = BIOME_POOLS[biome] || BIOME_POOLS.frontier;
    const total = pool.reduce((a, p) => a + p[1], 0);
    let r = Math.random() * total;
    for (const [k, w] of pool) { if ((r -= w) < 0) return k; }
    return pool[0][0];
  }

  // ---------------------------------------------------------------------------
  // MODIFIERS — attached to sectors via map choice; affect spawns / rewards
  const MODIFIERS = {
    none:     { name: 'NORMAL',        desc: '',                              tag: '' },
    dense:    { name: 'DENSE',         desc: '+40% enemies, +40% reward',    tag: 'DENSE'   },
    bounty:   { name: 'BOUNTY',        desc: 'Enemies drop 2x Stardust',     tag: 'BOUNTY'  },
    elite:    { name: 'ELITE',         desc: '+50% HP, +50% reward',         tag: 'ELITE'   },
    storm:    { name: 'ASTEROID STORM', desc: 'Drifting debris hurts you',   tag: 'STORM'   },
    solarWind:{ name: 'SOLAR WIND',    desc: 'Constant sideways drift',      tag: 'WIND'    }
  };

  // ---------------------------------------------------------------------------
  // UPGRADES (pre-run Stardust shop; persistent)
  const UPGRADES = [
    { id: 'life',   label: '+EXTRA LIFE',   desc: '+1 starting life per tier',           cost: 120, max: 3, color: '#ff4466' },
    { id: 'bomb',   label: 'START BOMBS',   desc: '+1 screen-clear bomb',                cost: 150, max: 3, color: '#ff4fd8' },
    { id: 'tri',    label: 'START TRIPLE',  desc: '6s triple-shot on spawn',             cost: 140, max: 1, color: '#f0c' },
    { id: 'rap',    label: 'START RAPID',   desc: '6s rapid-fire on spawn',              cost: 160, max: 1, color: '#6cf' },
    { id: 'pierce', label: 'PIERCING',      desc: 'Bullets pierce 1 enemy',              cost: 220, max: 1, color: '#6f6' },
    { id: 'spread', label: '+1 SPREAD',     desc: 'Permanent extra bullet per shot',     cost: 260, max: 2, color: '#fd6' },
    { id: 'magnet', label: 'MAGNET',        desc: 'Pickups drift toward you',            cost: 130, max: 1, color: '#9cf' },
    { id: 'shield', label: 'SHIELD',        desc: 'Absorb 1 hit, regen 10s',             cost: 240, max: 1, color: '#7ae' },
    { id: 'nitro',  label: 'NITRO DASH',    desc: 'SHIFT to dash (i-frames, 2.5s cd)',   cost: 200, max: 1, color: '#ff8' },
    { id: 'score',  label: 'PAYDAY',        desc: '+25% Stardust earned',                cost: 180, max: 2, color: '#fb9' }
  ];

  // ---------------------------------------------------------------------------
  class StarfallGame extends BaseGame {
    init() {
      const d = Storage.getGameData(GID) || {};
      this.save = {
        bestSector: d.bestSector || 0,
        warlordDefeated: !!d.warlordDefeated,
        upgrades: Object.assign(
          { life: 0, bomb: 0, tri: 0, rap: 0, pierce: 0, spread: 0, magnet: 0, shield: 0, nitro: 0, score: 0 },
          d.upgrades || {}
        )
      };
      this.phase = 'shop';
      this.shopRects = [];
      this.mapRects = [];
      this.mapCards = null;     // set when entering mapChoice
      this.sectorBiomes = rollSectorBiomes();
      this.sector = 1;
      this.waveInSector = 0;
      this.biome = BIOMES.frontier;
      this.modifier = 'none';
      this.sectorIntroTimer = 0;
      this.victoryTimer = 0;
      this.hitStop = 0;

      const up = this.save.upgrades;
      const startLives = 3 + up.life;
      this.player = {
        x: W / 2, y: H - 80, r: 16,
        vx: 0, vy: 0,
        inv: 1.2,
        lives: startLives,
        shield: up.shield ? 1 : 0,
        shieldRegen: 0,
        dashCd: 0,
        dashT: 0
      };
      this.bombs = up.bomb;
      this.bullets = [];
      this.ebullets = [];
      this.enemies = [];
      this.particles2 = [];
      this.powerups = [];
      this.debris = [];         // biome-specific background debris
      this.stars = [];
      for (let i = 0; i < 160; i++) {
        this.stars.push({
          x: Math.random() * W, y: Math.random() * H,
          z: 0.2 + Math.random() * 2.0,
          s: Math.random() < 0.12 ? 2 : 1
        });
      }
      this.fireCd = 0;
      this.fireRate = 0.22;
      this.triple = up.tri ? 6 : 0;
      this.rapid = up.rap ? 6 : 0;
      this.waveTimer = 0;
      this.waveSpawnLeft = 0;
      this.waveSpawnCd = 0;
      this.boss = null;          // mid-boss or final boss
      this.flashCol = null;
      this.runSectors = 0;       // sectors cleared this run
      this.runKills = 0;
      this.runWallet = 0;        // stardust earned this run
      this.victoryAchieved = false;
      this.windX = 0;
      this.stormDebris = [];
      this.sfx = this.makeSfx({
        shoot:   { freq: 880, type: 'square', dur: 0.06, slide: -320, vol: 0.12 },
        boom:    { freq: 120, type: 'noise', dur: 0.18, vol: 0.35, filter: 'lowpass' },
        hit:     { freq: 440, type: 'square', dur: 0.08, slide: -200, vol: 0.25 },
        pick:    { freq: 660, type: 'triangle', dur: 0.15, slide: 660, vol: 0.3 },
        lose:    { freq: 220, type: 'sawtooth', dur: 0.4, slide: -180, vol: 0.45 },
        bossHit: { freq: 300, type: 'square', dur: 0.05, slide: -80, vol: 0.2 },
        bomb:    { freq: 90, type: 'sawtooth', dur: 0.4, slide: 220, vol: 0.55 },
        buy:     { freq: 1100, type: 'square', dur: 0.1, vol: 0.4 },
        dash:    { freq: 800, type: 'triangle', dur: 0.12, slide: 300, vol: 0.3 },
        sector:  { freq: 660, type: 'square', dur: 0.25, slide: 240, vol: 0.35 },
        victory: { freq: 880, type: 'triangle', dur: 0.8, slide: 440, vol: 0.5 }
      });
      this.setHud(this.makeHud());
    }

    onEnd() {
      Storage.setGameData(GID, {
        bestSector: Math.max(this.save.bestSector, this.runSectors),
        warlordDefeated: this.save.warlordDefeated,
        upgrades: this.save.upgrades
      });
    }

    coinsEarned() {
      // Global theme coins: 1 per sector cleared + 30 victory bonus
      return (this.runSectors | 0) * 2 + (this.victoryAchieved ? 30 : 0);
    }

    // -------------------------------------------------------------------------
    // HUD
    makeHud() {
      if (this.phase === 'shop')       return '<span>Pre-run shop</span>';
      if (this.phase === 'mapChoice')  return '<span>Choose your path</span>';
      const p = this.player;
      const hearts = '\u2665'.repeat(Math.max(0, p.lives));
      const pw = [];
      if (this.triple > 0) pw.push('<b style="color:#f0c">TRI</b>');
      if (this.rapid > 0)  pw.push('<b style="color:#6cf">RAP</b>');
      if (p.shield > 0)    pw.push('<b style="color:#7ae">SH</b>');
      if (this.bombs > 0)  pw.push(`<b style="color:#ff4fd8">B${this.bombs}</b>`);
      const tag = MODIFIERS[this.modifier]?.tag;
      const modChip = tag ? `<span style="color:#fc6">[${tag}]</span>` : '';
      return `<span>Sector <b>${this.sector}/${TOTAL_SECTORS}</b></span>` +
             `<span>Wave <b>${this.waveInSector}/${WAVES_PER_SECTOR}</b></span>` +
             `<span>Lives <b>${hearts}</b></span>` +
             (pw.length ? `<span>${pw.join(' ')}</span>` : '') +
             modChip +
             `<span>Score <b>${this.score}</b></span>`;
    }

    // -------------------------------------------------------------------------
    // SHOP
    _renderShop(ctx) {
      this._drawSpace(ctx, BIOMES.frontier);

      ctx.fillStyle = '#ffec7a';
      ctx.font = 'bold 42px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText('STARFALL', W / 2, 28);
      ctx.fillStyle = '#a58abd';
      ctx.font = '13px ui-monospace, monospace';
      const wl = this.save.warlordDefeated ? ' \u2605 WARLORD SLAIN' : '';
      ctx.fillText('5 sectors. 15 waves. 1 warlord. Best: S' + this.save.bestSector + wl, W / 2, 76);
      ctx.fillStyle = '#ffec7a';
      ctx.font = 'bold 15px ui-monospace, monospace';
      ctx.fillText('Stardust: \u25CF ' + Storage.getGameWallet(GID), W / 2, 100);

      this.shopRects = [];
      const cols = 2, rows = 5;
      const pad = 16;
      const gridW = W - 180;
      const gridH = H - 230;
      const cellW = (gridW - pad * (cols - 1)) / cols;
      const cellH = (gridH - pad * (rows - 1)) / rows;
      const startX = 90, startY = 130;
      for (let i = 0; i < UPGRADES.length; i++) {
        const u = UPGRADES[i];
        const lvl = this.save.upgrades[u.id] || 0;
        const maxed = lvl >= u.max;
        const canAfford = !maxed && Storage.getGameWallet(GID) >= u.cost;
        const col = i % cols, row = (i / cols) | 0;
        const rx = startX + col * (cellW + pad);
        const ry = startY + row * (cellH + pad);
        ctx.fillStyle = maxed ? '#0a1a10' : canAfford ? '#1a140a' : '#140a1a';
        ctx.fillRect(rx, ry, cellW, cellH);
        ctx.strokeStyle = u.color; ctx.lineWidth = 1;
        ctx.strokeRect(rx + 0.5, ry + 0.5, cellW, cellH);
        ctx.fillStyle = u.color;
        ctx.font = 'bold 14px ui-monospace, monospace';
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText(u.label + (u.max > 1 ? ' (' + lvl + '/' + u.max + ')' : ''), rx + 12, ry + 10);
        ctx.fillStyle = '#a58abd';
        ctx.font = '11px ui-monospace, monospace';
        ctx.fillText(u.desc, rx + 12, ry + 30);
        ctx.fillStyle = maxed ? '#66ff88' : canAfford ? '#ffcc33' : '#776655';
        ctx.font = 'bold 13px ui-monospace, monospace';
        ctx.textAlign = 'right';
        ctx.fillText(maxed ? 'OWNED' : '\u25CF ' + u.cost, rx + cellW - 12, ry + cellH - 18);
        if (!maxed) this.shopRects.push({ x: rx, y: ry, w: cellW, h: cellH, kind: 'buy', i });
      }

      const cbw = 320, cbh = 52;
      const cbx = W / 2 - cbw / 2, cby = H - 68;
      ctx.fillStyle = '#4a1a4a';
      ctx.fillRect(cbx, cby, cbw, cbh);
      ctx.strokeStyle = '#ffec7a'; ctx.lineWidth = 2;
      ctx.strokeRect(cbx + 0.5, cby + 0.5, cbw, cbh);
      ctx.fillStyle = '#ffec7a';
      ctx.font = 'bold 18px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('LAUNCH \u2191', W / 2, cby + cbh / 2);
      this.shopRects.push({ x: cbx, y: cby, w: cbw, h: cbh, kind: 'launch' });
    }

    _updateShop() {
      // Advance stars for ambient motion even in shop
      for (const s of this.stars) {
        s.y += (30 + s.z * 40) * 0.016;
        if (s.y > H) { s.y = -4; s.x = Math.random() * W; }
      }
      if (Input.mouse.justPressed) {
        for (const r of this.shopRects) {
          if (Input.mouse.x >= r.x && Input.mouse.x <= r.x + r.w &&
              Input.mouse.y >= r.y && Input.mouse.y <= r.y + r.h) {
            if (r.kind === 'launch') {
              this._beginRun();
              return;
            }
            if (r.kind === 'buy') {
              const u = UPGRADES[r.i];
              const lvl = this.save.upgrades[u.id] || 0;
              if (lvl < u.max && Storage.spendGameWallet(GID, u.cost)) {
                this.save.upgrades[u.id] = lvl + 1;
                Storage.setGameData(GID, {
                  bestSector: this.save.bestSector,
                  warlordDefeated: this.save.warlordDefeated,
                  upgrades: this.save.upgrades
                });
                this.sfx.play('buy');
                // Re-apply starting loadout
                const up = this.save.upgrades;
                this.player.lives = 3 + up.life;
                this.player.shield = up.shield ? 1 : 0;
                this.bombs = up.bomb;
                this.triple = up.tri ? 6 : 0;
                this.rapid = up.rap ? 6 : 0;
              }
              return;
            }
          }
        }
      }
    }

    _beginRun() {
      this.sector = 1;
      this.waveInSector = 0;
      this.biome = BIOMES[this.sectorBiomes[0]];
      this.modifier = 'none';
      this.phase = 'sectorIntro';
      this.sectorIntroTimer = 1.8;
      this.sfx.play('sector');
    }

    // -------------------------------------------------------------------------
    // SECTOR INTRO
    _renderSectorIntro(ctx) {
      this._drawSpace(ctx, this.biome);
      const a = Math.min(1, this.sectorIntroTimer / 1.8);
      const slideIn = 1 - Math.pow(a, 2);
      const y = H * 0.45 - slideIn * 40;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = this.biome.accent;
      ctx.font = 'bold 32px ui-monospace, monospace';
      if (this.sector === TOTAL_SECTORS) {
        ctx.fillText('\u2668  FINAL SECTOR  \u2668', W / 2, y - 30);
      } else {
        ctx.fillText('SECTOR ' + this.sector + ' / ' + TOTAL_SECTORS, W / 2, y - 30);
      }
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 48px ui-monospace, monospace';
      ctx.fillText(this.biome.name, W / 2, y + 18);
      if (this.modifier !== 'none') {
        ctx.fillStyle = '#fc6';
        ctx.font = 'bold 18px ui-monospace, monospace';
        const m = MODIFIERS[this.modifier];
        ctx.fillText('[' + m.name + ']  ' + m.desc, W / 2, y + 60);
      }
    }

    _updateSectorIntro(dt) {
      this.sectorIntroTimer -= dt;
      // Keep stars moving
      for (const s of this.stars) {
        s.y += (50 + s.z * 90) * dt;
        if (s.y > H) { s.y = -4; s.x = Math.random() * W; }
      }
      if (this.sectorIntroTimer <= 0) {
        this.waveInSector = 1;
        this.phase = 'wave';
        this._startWave();
        this.windX = (this.modifier === 'solarWind') ? (Math.random() < 0.5 ? -40 : 40) : 0;
      }
    }

    // -------------------------------------------------------------------------
    // WAVE / MID-BOSS SPAWN
    _startWave() {
      const base = 5 + this.sector * 2 + this.waveInSector * 1;
      const dense = this.modifier === 'dense' ? 1.4 : 1.0;
      this.waveSpawnLeft = Math.ceil(base * dense);
      this.waveSpawnCd = 0.4;
      this.waveTimer = 0;
    }

    _startMidBoss() {
      this.phase = 'midboss';
      const sectorScale = this.sector;
      const hp = 50 + sectorScale * 18;
      this.boss = {
        kind: 'mid',
        x: W / 2, y: 100, r: 56,
        hp, maxHp: hp,
        vx: 100 + sectorScale * 10, t: 0,
        shootCd: 1.0,
        phase2: false,
        biome: this.biome
      };
      this.sfx.play('bomb');
      this.flash(this.biome.accent2, 0.3);
      this.shake(10, 0.4);
    }

    _startFinalBoss() {
      this.phase = 'finalBoss';
      const hp = 260;
      this.boss = {
        kind: 'warlord',
        x: W / 2, y: 140, r: 80,
        hp, maxHp: hp,
        vx: 120, vy: 0, t: 0,
        shootCd: 0.9, patternCd: 4.0, pattern: 0,
        phase: 1, // 1→2 at 66%, 2→3 at 33%
        biome: this.biome
      };
      this.sfx.play('bomb');
      this.flash('#f84', 0.5);
      this.shake(18, 0.8);
    }

    _spawnEnemy() {
      const kind = pickEnemyKind(this._biomeId());
      const def = ENEMY_DEFS[kind];
      const eliteMul = this.modifier === 'elite' ? 1.5 : 1.0;
      const sectorHp = 1 + Math.floor(this.sector / 2);
      const x = 60 + Math.random() * (W - 120);
      const speedScale = 1 + (this.sector - 1) * 0.08;
      const e = {
        x, y: -30,
        baseX: x,
        vx: 0, vy: def.vy * speedScale,
        r: def.r,
        hp: Math.ceil((def.hp + (kind === 'tank' ? sectorHp : 0)) * eliteMul),
        kind, t: Math.random() * 6,
        shootCd: kind === 'shooter' ? 1.0 + Math.random() * 0.6 : 999,
        points: Math.round(def.points * (1 + (this.sector - 1) * 0.1)),
        color: def.color
      };
      if (kind === 'dasher') {
        // diagonal trajectory across the field
        const dir = Math.random() < 0.5 ? -1 : 1;
        e.vx = dir * 220;
        e.baseX = dir < 0 ? W + 30 : -30;
        e.x = e.baseX;
        e.y = 30 + Math.random() * 120;
      }
      if (kind === 'swarm') {
        // Spawn the whole formation at once
        for (let i = 0; i < 3; i++) {
          const ex = x + (i - 1) * 40;
          this.enemies.push({
            x: ex, y: -30 - i * 20, baseX: ex,
            vx: 0, vy: def.vy * speedScale,
            r: def.r, hp: Math.ceil(def.hp * eliteMul),
            kind, t: Math.random() * 6, shootCd: 999, points: def.points, color: def.color
          });
        }
        return;
      }
      this.enemies.push(e);
    }

    _biomeId() {
      return this.sectorBiomes[this.sector - 1];
    }

    // -------------------------------------------------------------------------
    // MAIN UPDATE
    update(dt) {
      if (this.hitStop > 0) {
        this.hitStop = Math.max(0, this.hitStop - dt);
        dt = dt * 0.15;
      }
      if (this.phase === 'shop')         return this._updateShop();
      if (this.phase === 'sectorIntro')  return this._updateSectorIntro(dt);
      if (this.phase === 'mapChoice')    return this._updateMapChoice(dt);
      if (this.phase === 'victory')      return this._updateVictory(dt);

      // Shared playfield update for wave / midboss / finalBoss
      this._updateStars(dt);
      this._updateDebris(dt);
      this._updatePlayer(dt);

      this._updateBullets(dt);
      this._updateEnemies(dt);
      this._updatePowerups(dt);
      this._updateParticles(dt);

      if (this.phase === 'wave') {
        // Spawn until count hits zero, then wait for enemies cleared
        if (this.waveSpawnLeft > 0) {
          this.waveSpawnCd -= dt;
          if (this.waveSpawnCd <= 0) {
            this._spawnEnemy();
            this.waveSpawnLeft--;
            this.waveSpawnCd = Math.max(0.25, 0.8 - this.sector * 0.05);
          }
        } else if (this.enemies.length === 0) {
          this.waveTimer += dt;
          if (this.waveTimer >= 0.6) this._advanceWave();
        }
      } else if (this.phase === 'midboss' || this.phase === 'finalBoss') {
        if (this.boss) this._updateBoss(dt);
      }

      this.setHud(this.makeHud());
    }

    _advanceWave() {
      this.waveInSector++;
      if (this.waveInSector > WAVES_PER_SECTOR) {
        // end of sector → mid-boss (sectors 1-4) or final boss (sector 5)
        if (this.sector === TOTAL_SECTORS) {
          this._startFinalBoss();
        } else {
          this._startMidBoss();
        }
      } else {
        this._startWave();
      }
    }

    _advanceSector() {
      // Called after mid-boss dies; open the map choice (or finish run if S4→S5)
      this.runSectors++;
      if (this.sector >= TOTAL_SECTORS - 1) {
        // Next is S5 — no branching, go straight to final sector intro
        this.sector++;
        this.waveInSector = 0;
        this.modifier = 'none';
        this.biome = BIOMES[this.sectorBiomes[this.sector - 1]];
        this.phase = 'sectorIntro';
        this.sectorIntroTimer = 2.2;
        this.sfx.play('sector');
        return;
      }
      this._openMapChoice();
    }

    // -------------------------------------------------------------------------
    // MAP CHOICE
    _openMapChoice() {
      this.phase = 'mapChoice';
      // Roll 3 cards for the NEXT sector. Each card reuses the same biome
      // (the pre-rolled one for that sector) but offers different modifiers.
      const nextBiomeId = this.sectorBiomes[this.sector];   // sector is 1-indexed, array 0-indexed
      const nextBiome = BIOMES[nextBiomeId];
      const pool = ['dense', 'bounty', 'elite', 'storm', 'solarWind'];
      // Shuffle
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      const mods = ['none', pool[0], pool[1]];  // always one plain + two rolled
      // Shuffle card order so "plain" isn't always first
      for (let i = mods.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [mods[i], mods[j]] = [mods[j], mods[i]];
      }
      this.mapCards = mods.map(m => ({ biomeId: nextBiomeId, biome: nextBiome, modifier: m }));
      this.mapRects = [];
    }

    _updateMapChoice(dt) {
      this._updateStars(dt);
      this._updateParticles(dt);
      if (Input.mouse.justPressed) {
        for (const r of this.mapRects) {
          if (Input.mouse.x >= r.x && Input.mouse.x <= r.x + r.w &&
              Input.mouse.y >= r.y && Input.mouse.y <= r.y + r.h) {
            const c = this.mapCards[r.i];
            this.sector++;
            this.waveInSector = 0;
            this.biome = c.biome;
            this.modifier = c.modifier;
            this.mapCards = null;
            this.phase = 'sectorIntro';
            this.sectorIntroTimer = 1.8;
            this.sfx.play('sector');
            return;
          }
        }
      }
    }

    _renderMapChoice(ctx) {
      this._drawSpace(ctx, this.biome);  // current biome as backdrop

      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillStyle = '#ffec7a';
      ctx.font = 'bold 34px ui-monospace, monospace';
      ctx.fillText('CHOOSE YOUR PATH', W / 2, 40);
      ctx.fillStyle = '#a58abd';
      ctx.font = '13px ui-monospace, monospace';
      ctx.fillText('Sector ' + (this.sector + 1) + ' of ' + TOTAL_SECTORS, W / 2, 86);

      this.mapRects = [];
      const cards = this.mapCards || [];
      const cw = 240, ch = 340;
      const gap = 28;
      const totalW = cards.length * cw + (cards.length - 1) * gap;
      const startX = W / 2 - totalW / 2;
      for (let i = 0; i < cards.length; i++) {
        const c = cards[i];
        const rx = startX + i * (cw + gap);
        const ry = H / 2 - ch / 2 + 20;
        // Body
        ctx.fillStyle = '#0a0818';
        ctx.fillRect(rx, ry, cw, ch);
        ctx.strokeStyle = c.biome.accent;
        ctx.lineWidth = 2;
        ctx.strokeRect(rx + 1, ry + 1, cw - 2, ch - 2);
        // Biome preview
        const prevY = ry + 40;
        const g = ctx.createLinearGradient(rx + 10, prevY, rx + 10, prevY + 120);
        g.addColorStop(0, c.biome.bg1); g.addColorStop(1, c.biome.bg2);
        ctx.fillStyle = g;
        ctx.fillRect(rx + 10, prevY, cw - 20, 120);
        // Preview stars
        for (let j = 0; j < 30; j++) {
          const sx = rx + 10 + ((j * 37) % (cw - 20));
          const sy = prevY + ((j * 53 + this.time * 20) % 120);
          ctx.fillStyle = j % 3 === 0 ? c.biome.starA : c.biome.starB;
          ctx.fillRect(sx, sy, 1, 1);
        }
        // Nebula
        const neb = ctx.createRadialGradient(rx + cw / 2, prevY + 60, 4, rx + cw / 2, prevY + 60, 80);
        neb.addColorStop(0, c.biome.nebula); neb.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = neb; ctx.fillRect(rx + 10, prevY, cw - 20, 120);
        // Biome name
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillStyle = c.biome.accent;
        ctx.font = 'bold 20px ui-monospace, monospace';
        ctx.fillText(c.biome.name, rx + cw / 2, prevY + 130);
        // Modifier
        const m = MODIFIERS[c.modifier];
        ctx.fillStyle = c.modifier === 'none' ? '#cde' : '#fc6';
        ctx.font = 'bold 16px ui-monospace, monospace';
        ctx.fillText('[' + m.name + ']', rx + cw / 2, prevY + 170);
        ctx.fillStyle = '#a58abd';
        ctx.font = '12px ui-monospace, monospace';
        wrapText(ctx, m.desc || '—', rx + cw / 2, prevY + 200, cw - 30, 16);
        // Hover hint
        const hover = Input.mouse.x >= rx && Input.mouse.x <= rx + cw &&
                      Input.mouse.y >= ry && Input.mouse.y <= ry + ch;
        if (hover) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 3;
          ctx.strokeRect(rx + 1, ry + 1, cw - 2, ch - 2);
        }
        this.mapRects.push({ x: rx, y: ry, w: cw, h: ch, i });
      }
    }

    // -------------------------------------------------------------------------
    // PLAYFIELD UPDATE PIECES
    _updateStars(dt) {
      for (const s of this.stars) {
        s.y += (50 + s.z * 90) * dt;
        s.x += this.windX * s.z * 0.3 * dt;
        if (s.y > H) { s.y = -4; s.x = Math.random() * W; }
        if (s.x < -4) s.x = W;
        if (s.x > W + 4) s.x = 0;
      }
    }

    _updateDebris(dt) {
      // Biome-specific background debris + STORM modifier damaging rocks
      if (this.biome.debris && this.debris.length < 6) {
        if (Math.random() < 0.01) {
          this.debris.push({
            x: Math.random() * W, y: -60,
            r: 12 + Math.random() * 20,
            vy: 30 + Math.random() * 20,
            rot: 0, rotSp: (Math.random() - 0.5) * 0.6
          });
        }
      }
      for (const d of this.debris) {
        d.y += d.vy * dt; d.rot += d.rotSp * dt;
        d.x += this.windX * 0.4 * dt;
      }
      this.debris = this.debris.filter(d => d.y < H + 60);

      if (this.modifier === 'storm') {
        // Damaging debris (stormDebris is separate from background debris)
        if (this.stormDebris.length < 4 && Math.random() < 0.015) {
          this.stormDebris.push({
            x: Math.random() * W, y: -30,
            r: 14, vx: (Math.random() - 0.5) * 60, vy: 80 + Math.random() * 60,
            rot: 0, rotSp: (Math.random() - 0.5) * 2
          });
        }
        for (const d of this.stormDebris) {
          d.x += d.vx * dt; d.y += d.vy * dt; d.rot += d.rotSp * dt;
          // Collide with player
          if (this.player.inv <= 0 && this.player.dashT <= 0) {
            const dd = Math.hypot(d.x - this.player.x, d.y - this.player.y);
            if (dd < d.r + this.player.r) this._hitPlayer();
          }
          // Player bullets break storm rocks
          for (const b of this.bullets) {
            const bd = Math.hypot(b.x - d.x, b.y - d.y);
            if (bd < d.r) { d.y = H + 100; b.life = 0; this.addScore(5); this._spark(d.x, d.y, 8, '#fc6'); break; }
          }
        }
        this.stormDebris = this.stormDebris.filter(d => d.y < H + 60);
      }
    }

    _updatePlayer(dt) {
      const p = this.player;
      const speed = 340;
      let ax = 0, ay = 0;
      if (Input.keys['ArrowLeft'] || Input.keys['a'] || Input.keys['A']) ax -= 1;
      if (Input.keys['ArrowRight'] || Input.keys['d'] || Input.keys['D']) ax += 1;
      if (Input.keys['ArrowUp'] || Input.keys['w'] || Input.keys['W']) ay -= 1;
      if (Input.keys['ArrowDown'] || Input.keys['s'] || Input.keys['S']) ay += 1;
      const m = Math.hypot(ax, ay) || 1;
      p.vx = (ax / m) * speed;
      p.vy = (ay / m) * speed;
      // Solar wind drift
      if (this.modifier === 'solarWind') {
        p.vx += this.windX * 0.5;
      }

      // Nitro dash
      p.dashCd = Math.max(0, p.dashCd - dt);
      p.dashT = Math.max(0, p.dashT - dt);
      if (this.save.upgrades.nitro && p.dashCd <= 0 &&
          (Input.keys['Shift'] || Input.keys['ShiftLeft'] || Input.keys['ShiftRight'])) {
        p.dashT = 0.2;
        p.dashCd = 2.5;
        p.inv = Math.max(p.inv, 0.3);
        const dir = ay !== 0 || ax !== 0 ? { x: ax / m, y: ay / m } : { x: 0, y: -1 };
        p.vx = dir.x * 900;
        p.vy = dir.y * 900;
        this.sfx.play('dash');
        for (let i = 0; i < 12; i++) this._spark(p.x, p.y, 2, '#ff8');
        Input.keys['Shift'] = Input.keys['ShiftLeft'] = Input.keys['ShiftRight'] = false;
      }

      p.x = Math.max(24, Math.min(W - 24, p.x + p.vx * dt));
      p.y = Math.max(24, Math.min(H - 24, p.y + p.vy * dt));

      // Bomb
      if ((Input.keys['f'] || Input.keys['F']) && this.bombs > 0) {
        this._detonateBomb();
        Input.keys['f'] = false; Input.keys['F'] = false;
      }

      // Fire
      this.fireCd = Math.max(0, this.fireCd - dt);
      const firing = Input.keys[' '] || Input.keys['Space'] || Input.mouse.down;
      if (firing && this.fireCd <= 0) this._firePlayer();

      // Power-up timers
      this.triple = Math.max(0, this.triple - dt);
      this.rapid = Math.max(0, this.rapid - dt);
      p.inv = Math.max(0, p.inv - dt);

      // Shield regen
      if (this.save.upgrades.shield && p.shield < 1) {
        p.shieldRegen += dt;
        if (p.shieldRegen >= 10) {
          p.shield = 1;
          p.shieldRegen = 0;
          this._spark(p.x, p.y, 16, '#7ae');
        }
      }
    }

    _firePlayer() {
      const p = this.player;
      const spread = this.save.upgrades.spread | 0;
      const offsets = [];
      // Base
      offsets.push({ dx: 0, dy: -22, vx: 0, vy: -820 });
      if (this.triple > 0) {
        offsets.push({ dx: -8, dy: -20, vx: -140, vy: -780 });
        offsets.push({ dx: 8, dy: -20, vx: 140, vy: -780 });
      }
      if (spread >= 1) {
        offsets.push({ dx: -14, dy: -18, vx: -260, vy: -700 });
        offsets.push({ dx: 14, dy: -18, vx: 260, vy: -700 });
      }
      if (spread >= 2) {
        offsets.push({ dx: -20, dy: -14, vx: -380, vy: -600 });
        offsets.push({ dx: 20, dy: -14, vx: 380, vy: -600 });
      }
      const pierce = this.save.upgrades.pierce ? 1 : 0;
      for (const o of offsets) {
        this.bullets.push({
          x: p.x + o.dx, y: p.y + o.dy,
          vx: o.vx, vy: o.vy,
          r: 4, life: 1.6, pierce
        });
      }
      this.sfx.play('shoot');
      Assets.sfx('sf_laser', 0.16);
      this.fireCd = this.rapid > 0 ? 0.09 : this.fireRate;
    }

    _updateBullets(dt) {
      for (const b of this.bullets) {
        b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      }
      this.bullets = this.bullets.filter(b =>
        b.life > 0 && b.y > -20 && b.y < H + 20 && b.x > -20 && b.x < W + 20);

      for (const b of this.ebullets) {
        b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      }
      this.ebullets = this.ebullets.filter(b =>
        b.life > 0 && b.y > -40 && b.y < H + 40 && b.x > -40 && b.x < W + 40);

      // Player bullets vs enemies / boss
      for (const bl of this.bullets) {
        if (this.boss) {
          const d = Math.hypot(bl.x - this.boss.x, bl.y - this.boss.y);
          if (d < this.boss.r) {
            this._hitBoss(bl.x, bl.y, 1);
            bl.life = 0;
            continue;
          }
        }
        for (const e of this.enemies) {
          if (e.hp <= 0) continue;
          const d = Math.hypot(bl.x - e.x, bl.y - e.y);
          if (d < e.r) {
            e.hp--;
            if (bl.pierce > 0) { bl.pierce--; }
            else bl.life = 0;
            if (e.hp <= 0) this._killEnemy(e);
            else this.sfx.play('hit');
            break;
          }
        }
      }

      // Enemy bullets / bodies vs player
      const p = this.player;
      if (p.inv <= 0 && p.dashT <= 0) {
        for (const eb of this.ebullets) {
          const d = Math.hypot(eb.x - p.x, eb.y - p.y);
          if (d < eb.r + p.r - 4) { this._hitPlayer(); eb.life = 0; break; }
        }
        for (const e of this.enemies) {
          const d = Math.hypot(e.x - p.x, e.y - p.y);
          if (d < e.r + p.r - 4) { this._hitPlayer(); e.hp = 0; this._killEnemy(e); break; }
        }
        if (this.boss) {
          const d = Math.hypot(this.boss.x - p.x, this.boss.y - p.y);
          if (d < this.boss.r + p.r - 6) this._hitPlayer();
        }
      }
    }

    _updateEnemies(dt) {
      const p = this.player;
      for (const e of this.enemies) {
        e.t += dt;
        if (e.kind === 'zig') {
          e.x = e.baseX + Math.sin(e.t * 2.2) * 120;
        } else if (e.kind === 'shooter') {
          e.vy = 50;
          e.shootCd -= dt;
          if (e.shootCd <= 0 && e.y > 40 && e.y < H - 200) {
            const ang = Math.atan2(p.y - e.y, p.x - e.x);
            this.ebullets.push({ x: e.x, y: e.y + e.r, vx: Math.cos(ang) * 280, vy: Math.sin(ang) * 280, r: 5, life: 3.5 });
            e.shootCd = 1.0 + Math.random() * 0.8;
          }
        } else if (e.kind === 'dasher') {
          // Horizontal dash across screen
        } else if (e.kind === 'tank') {
          // Slow straight descent; vy already set
        }
        e.y += e.vy * dt;
        e.x += e.vx * dt;
        e.x += this.windX * 0.25 * dt;
      }
      this.enemies = this.enemies.filter(e => {
        if (e.hp <= 0) return false;
        if (e.kind === 'dasher') return e.x > -50 && e.x < W + 50;
        return e.y < H + 60;
      });
    }

    _hitBoss(x, y, dmg) {
      if (!this.boss) return;
      this.boss.hp -= dmg;
      this.sfx.play('bossHit');
      this._spark(x, y, 4, '#fc6');
      if (this.boss.kind === 'warlord') {
        const f = this.boss.hp / this.boss.maxHp;
        if (this.boss.phase < 2 && f <= 0.66) {
          this.boss.phase = 2;
          this.flash('#f84', 0.4);
          this.shake(14, 0.5);
          this.sfx.play('boom');
        } else if (this.boss.phase < 3 && f <= 0.33) {
          this.boss.phase = 3;
          this.flash('#fd3', 0.5);
          this.shake(18, 0.7);
          this.sfx.play('boom');
        }
      } else if (!this.boss.phase2 && this.boss.hp <= this.boss.maxHp * 0.5) {
        this.boss.phase2 = true;
        this.flash(this.biome.accent2, 0.4);
        this.shake(12, 0.4);
        this.sfx.play('boom');
      }
      if (this.boss.hp <= 0) this._killBoss();
    }

    _updateBoss(dt) {
      const b = this.boss;
      b.t += dt;
      b.x += b.vx * dt;
      if (b.x < 80) { b.x = 80; b.vx = -b.vx; }
      if (b.x > W - 80) { b.x = W - 80; b.vx = -b.vx; }

      if (b.kind === 'mid') {
        b.y = 100 + Math.sin(b.t * 1.1) * 20;
        b.shootCd -= dt;
        if (b.shootCd <= 0) {
          const n = b.phase2 ? 13 : 7;
          for (let i = 0; i < n; i++) {
            const a = Math.PI / 2 + (i - (n - 1) / 2) * 0.22 + Math.sin(b.t) * 0.1;
            this.ebullets.push({
              x: b.x, y: b.y + 40,
              vx: Math.cos(a) * (b.phase2 ? 300 : 240),
              vy: Math.sin(a) * (b.phase2 ? 300 : 240),
              r: 5, life: 4
            });
          }
          if (b.phase2) {
            const ang = Math.atan2(this.player.y - b.y, this.player.x - b.x);
            this.ebullets.push({ x: b.x, y: b.y, vx: Math.cos(ang) * 360, vy: Math.sin(ang) * 360, r: 6, life: 3 });
          }
          b.shootCd = b.phase2 ? 0.65 : 1.0;
        }
      } else if (b.kind === 'warlord') {
        // Figure-8 motion with faster sweeps per phase
        b.y = 140 + Math.sin(b.t * 0.8) * 60;
        const phaseSpeed = b.phase === 1 ? 120 : b.phase === 2 ? 160 : 220;
        if (b.vx > 0) b.vx = phaseSpeed; else b.vx = -phaseSpeed;

        b.shootCd -= dt;
        b.patternCd -= dt;
        if (b.shootCd <= 0) {
          const p = this.player;
          // Phase 1: slow aimed + small spread
          // Phase 2: + radial
          // Phase 3: + sweeping wall
          const ang = Math.atan2(p.y - b.y, p.x - b.x);
          this.ebullets.push({ x: b.x, y: b.y, vx: Math.cos(ang) * 300, vy: Math.sin(ang) * 300, r: 6, life: 4 });
          for (let i = -1; i <= 1; i++) {
            this.ebullets.push({
              x: b.x, y: b.y + 30,
              vx: Math.cos(ang + i * 0.2) * 260, vy: Math.sin(ang + i * 0.2) * 260,
              r: 5, life: 4
            });
          }
          b.shootCd = b.phase === 3 ? 0.45 : b.phase === 2 ? 0.6 : 0.8;
        }
        if (b.patternCd <= 0 && b.phase >= 2) {
          // Radial burst
          const n = b.phase === 3 ? 20 : 14;
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2;
            this.ebullets.push({ x: b.x, y: b.y, vx: Math.cos(a) * 220, vy: Math.sin(a) * 220, r: 5, life: 4.5 });
          }
          b.patternCd = b.phase === 3 ? 2.2 : 3.2;
        }
      }
    }

    _killBoss() {
      const b = this.boss;
      this.addScore(b.kind === 'warlord' ? 800 : (200 + this.sector * 30));
      this.sfx.play('boom');
      Assets.sfx('sf_boom', 0.7);
      this.shake(b.kind === 'warlord' ? 22 : 14, b.kind === 'warlord' ? 0.8 : 0.5);
      this.flash('#fff', b.kind === 'warlord' ? 0.6 : 0.25);
      this.hitStop = b.kind === 'warlord' ? 0.3 : 0.12;
      for (let i = 0; i < (b.kind === 'warlord' ? 120 : 50); i++) {
        this._spark(
          b.x + (Math.random() - 0.5) * 100,
          b.y + (Math.random() - 0.5) * 80,
          2,
          ['#fc6', '#f66', '#fff', '#6cf', '#f84'][i % 5]
        );
      }
      this.powerups.push({ x: b.x - 30, y: b.y, t: 0, kind: 'tri' });
      this.powerups.push({ x: b.x + 30, y: b.y, t: 0, kind: 'rap' });
      const wasWarlord = b.kind === 'warlord';
      this.boss = null;
      if (wasWarlord) {
        this.runSectors++;
        this.victoryAchieved = true;
        this.save.warlordDefeated = true;
        this._awardRunWallet();
        this.phase = 'victory';
        this.victoryTimer = 0;
        this.sfx.play('victory');
        return;
      }
      // Mid-boss: advance sector
      this._advanceSector();
    }

    _hitPlayer() {
      const p = this.player;
      if (p.shield > 0) {
        p.shield = 0;
        p.shieldRegen = 0;
        p.inv = 1.2;
        this.sfx.play('hit');
        this.flash('#7ae', 0.25);
        this.shake(6, 0.2);
        this._spark(p.x, p.y, 18, '#7ae');
        return;
      }
      p.lives--;
      p.inv = 2.0;
      this.sfx.play('lose');
      Assets.sfx('sf_hit', 0.5);
      this.shake(12, 0.35);
      this.flash('#f44', 0.25);
      this._spark(p.x, p.y, 22, '#f66');
      if (p.lives <= 0) {
        this._awardRunWallet();
        Storage.setGameData(GID, {
          bestSector: Math.max(this.save.bestSector, this.runSectors),
          warlordDefeated: this.save.warlordDefeated,
          upgrades: this.save.upgrades
        });
        this.gameOver();
      }
    }

    _awardRunWallet() {
      // Base: 8 per sector cleared + 40 victory bonus, PAYDAY upgrade multiplier
      const base = this.runSectors * 8 + (this.victoryAchieved ? 40 : 0);
      const mult = 1 + (this.save.upgrades.score | 0) * 0.25;
      const bounty = this._countBountyWallet();
      const total = Math.floor(base * mult) + bounty;
      this.runWallet = total;
      if (total > 0) Storage.addGameWallet(GID, total);
    }

    _countBountyWallet() {
      // Accumulated during run from bounty-modifier kills
      return this._bountyAccum | 0;
    }

    _killEnemy(e) {
      this.addScore(e.points);
      this.runKills++;
      this.sfx.play('boom');
      Assets.sfx('sf_boom', 0.3);
      this.shake(3, 0.1);
      this._spark(e.x, e.y, 14, e.color);
      // Tank always drops a powerup; others get a random roll.
      const dropChance = e.kind === 'tank' ? 1.0 : 0.08;
      if (Math.random() < dropChance) {
        const kinds = ['tri', 'rap', 'life'];
        const weights = [0.45, 0.45, 0.1];
        let r = Math.random();
        let kind = 'tri';
        for (let i = 0; i < kinds.length; i++) {
          if ((r -= weights[i]) < 0) { kind = kinds[i]; break; }
        }
        this.powerups.push({ x: e.x, y: e.y, t: 0, kind });
      }
      // Bounty modifier: award in-run stardust from kills
      if (this.modifier === 'bounty') {
        this._bountyAccum = (this._bountyAccum | 0) + 2;
      }
    }

    _updatePowerups(dt) {
      const p = this.player;
      const magnet = this.save.upgrades.magnet ? 1 : 0;
      for (const pu of this.powerups) {
        pu.y += 120 * dt;
        pu.t += dt;
        if (magnet) {
          const dx = p.x - pu.x, dy = p.y - pu.y;
          const d = Math.hypot(dx, dy);
          if (d < 200) {
            pu.x += (dx / d) * 240 * dt;
            pu.y += (dy / d) * 240 * dt;
          }
        }
        const d = Math.hypot(pu.x - p.x, pu.y - p.y);
        if (d < 22 + p.r) {
          if (pu.kind === 'tri')      this.triple = 9;
          else if (pu.kind === 'rap') this.rapid = 8;
          else if (pu.kind === 'life' && p.lives < 6) p.lives++;
          pu.dead = true;
          this.addScore(5);
          this.sfx.play('pick');
          this.flash(pu.kind === 'tri' ? '#f0c' : pu.kind === 'rap' ? '#6cf' : '#6f8', 0.12);
        }
      }
      this.powerups = this.powerups.filter(pu => !pu.dead && pu.y < H + 20);
    }

    _updateParticles(dt) {
      for (const pt of this.particles2) {
        pt.x += pt.vx * dt; pt.y += pt.vy * dt;
        pt.vx *= 0.96; pt.vy *= 0.96;
        pt.life -= dt;
      }
      this.particles2 = this.particles2.filter(pt => pt.life > 0);
    }

    _spark(x, y, n, color) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = 80 + Math.random() * 200;
        this.particles2.push({
          x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
          life: 0.3 + Math.random() * 0.4,
          color, size: 2 + Math.random() * 2
        });
      }
    }

    _detonateBomb() {
      this.bombs--;
      this.sfx.play('bomb');
      this.flash('#ff4fd8', 0.4);
      this.shake(16, 0.45);
      this._spark(this.player.x, this.player.y, 60, '#ff4fd8');
      this.ebullets = [];
      for (const e of this.enemies) {
        e.hp -= 3;
        if (e.hp <= 0) this._killEnemy(e);
      }
      if (this.boss) this._hitBoss(this.boss.x, this.boss.y, 14);
    }

    // -------------------------------------------------------------------------
    // VICTORY
    _updateVictory(dt) {
      this.victoryTimer += dt;
      this._updateStars(dt);
      this._updateParticles(dt);
      // Sporadic fireworks
      if (Math.random() < 0.1) {
        this._spark(100 + Math.random() * (W - 200), 100 + Math.random() * 200, 18,
          ['#f84', '#fd3', '#6cf', '#f0c', '#fff'][Math.floor(Math.random() * 5)]);
      }
      if (this.victoryTimer > 1.5 && Input.mouse.justPressed) {
        this.win();
      }
    }

    _renderVictory(ctx) {
      this._drawSpace(ctx, BIOMES.core);
      for (const pt of this.particles2) {
        const a = Math.max(0, Math.min(1, pt.life * 2));
        ctx.globalAlpha = a;
        ctx.fillStyle = pt.color;
        ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
      }
      ctx.globalAlpha = 1;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffec7a';
      ctx.font = 'bold 56px ui-monospace, monospace';
      ctx.fillText('VICTORY', W / 2, 140);
      ctx.fillStyle = '#f84';
      ctx.font = 'bold 24px ui-monospace, monospace';
      ctx.fillText('The Warlord falls.', W / 2, 190);

      ctx.fillStyle = '#fff';
      ctx.font = '18px ui-monospace, monospace';
      ctx.fillText('Sectors cleared:  ' + TOTAL_SECTORS, W / 2, 280);
      ctx.fillText('Kills:  ' + this.runKills, W / 2, 310);
      ctx.fillText('Score:  ' + this.score, W / 2, 340);
      ctx.fillText('Stardust earned:  \u25CF ' + this.runWallet, W / 2, 370);

      if (this.victoryTimer > 1.5) {
        ctx.fillStyle = '#a58abd';
        ctx.font = '14px ui-monospace, monospace';
        const blink = Math.sin(this.victoryTimer * 4) > 0 ? 1 : 0.4;
        ctx.globalAlpha = blink;
        ctx.fillText('click to return to arcade', W / 2, H - 60);
        ctx.globalAlpha = 1;
      }
    }

    // -------------------------------------------------------------------------
    // RENDER
    render(ctx) {
      if (this.phase === 'shop')        return this._renderShop(ctx);
      if (this.phase === 'victory')     return this._renderVictory(ctx);
      if (this.phase === 'mapChoice')   return this._renderMapChoice(ctx);

      this._drawSpace(ctx, this.biome);

      // Background debris (biome flavour)
      if (this.biome.debris) {
        for (const d of this.debris) {
          ctx.save();
          ctx.translate(d.x, d.y); ctx.rotate(d.rot);
          ctx.fillStyle = '#3a2820';
          ctx.beginPath();
          for (let i = 0; i < 7; i++) {
            const a = (i / 7) * Math.PI * 2;
            const rr = d.r * (0.7 + Math.sin(a * 3) * 0.2);
            const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.closePath(); ctx.fill();
          ctx.restore();
        }
      }

      // Aurora for ion storm
      if (this.biome.aurora) {
        for (let i = 0; i < 3; i++) {
          const y = 60 + i * 120 + Math.sin(this.time * (0.4 + i * 0.2)) * 40;
          const g = ctx.createLinearGradient(0, y - 30, 0, y + 30);
          g.addColorStop(0, 'rgba(0,0,0,0)');
          g.addColorStop(0.5, 'rgba(80,255,200,0.15)');
          g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g;
          ctx.fillRect(0, y - 30, W, 60);
        }
        if (Math.random() < 0.02) this.flash('#3fe', 0.08);
      }

      // Core embers
      if (this.biome.emberColor) {
        if (Math.random() < 0.3) {
          const ex = Math.random() * W;
          this.particles2.push({
            x: ex, y: H + 10,
            vx: (Math.random() - 0.5) * 20, vy: -40 - Math.random() * 40,
            life: 1.5 + Math.random(),
            color: this.biome.emberColor, size: 2
          });
        }
      }

      // Damaging storm debris
      if (this.modifier === 'storm') {
        for (const d of this.stormDebris) {
          ctx.save();
          ctx.translate(d.x, d.y); ctx.rotate(d.rot);
          ctx.fillStyle = '#887766';
          ctx.strokeStyle = '#bb9977'; ctx.lineWidth = 2;
          ctx.beginPath();
          for (let i = 0; i < 7; i++) {
            const a = (i / 7) * Math.PI * 2;
            const rr = d.r * (0.8 + Math.sin(a * 3) * 0.2);
            const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.restore();
        }
      }

      // Powerups
      for (const pu of this.powerups) {
        const col = pu.kind === 'tri' ? '#f0c' : pu.kind === 'rap' ? '#6cf' : '#7f8';
        const pulse = 1 + Math.sin(pu.t * 10) * 0.2;
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(pu.x, pu.y, 12 * pulse, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(pu.kind === 'tri' ? '3' : pu.kind === 'rap' ? 'R' : '+', pu.x, pu.y + 1);
      }

      // Enemies
      for (const e of this.enemies) this._drawEnemy(ctx, e);

      // Boss
      if (this.boss) this._drawBoss(ctx, this.boss);

      // Player bullets
      for (const b of this.bullets) {
        if (!Assets.draw(ctx, 'sf_bullet', b.x, b.y, 8, 18, { fallback: () => {
          ctx.fillStyle = b.pierce > 0 ? '#6fb' : '#ffec7a';
          ctx.fillRect(b.x - 2, b.y - 8, 4, 14);
        }})) {}
      }

      // Enemy bullets
      for (const b of this.ebullets) {
        ctx.fillStyle = '#f66';
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ff9';
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.5, 0, Math.PI * 2); ctx.fill();
      }

      // Player
      this._drawPlayer(ctx);

      // Particles
      for (const pt of this.particles2) {
        const a = Math.max(0, Math.min(1, pt.life * 2));
        ctx.globalAlpha = a;
        ctx.fillStyle = pt.color;
        ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
      }
      ctx.globalAlpha = 1;

      // Boss HP bar
      if (this.boss) {
        const frac = this.boss.hp / this.boss.maxHp;
        ctx.fillStyle = '#300';
        ctx.fillRect(60, 20, W - 120, 12);
        ctx.fillStyle = this.boss.kind === 'warlord' ? '#f84' : '#f44';
        ctx.fillRect(60, 20, (W - 120) * frac, 12);
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
        ctx.strokeRect(60, 20, W - 120, 12);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center';
        const label = this.boss.kind === 'warlord'
          ? 'WARLORD  \u2022  PHASE ' + this.boss.phase
          : 'MID-BOSS  \u2022  SECTOR ' + this.sector;
        ctx.fillText(label, W / 2, 30);
      }

      // Sector-intro overlay (called in update but rendered here if phase still intro)
      if (this.phase === 'sectorIntro') this._renderSectorIntro(ctx);
    }

    _drawSpace(ctx, biome) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, biome.bg1); g.addColorStop(1, biome.bg2);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      const neb = ctx.createRadialGradient(
        W * biome.nebPos[0], H * biome.nebPos[1], 10,
        W * biome.nebPos[0], H * biome.nebPos[1], 420);
      neb.addColorStop(0, biome.nebula); neb.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = neb; ctx.fillRect(0, 0, W, H);
      // Stars — 3 depth layers (faked via z)
      for (const s of this.stars) {
        ctx.fillStyle = s.z > 1.3 ? biome.starA : (s.z > 0.8 ? biome.starB : biome.starC);
        ctx.fillRect(s.x, s.y, s.s, s.s);
      }
    }

    _drawPlayer(ctx) {
      const p = this.player;
      if (p.inv > 0 && p.dashT <= 0 && Math.floor(p.inv * 12) % 2 === 0) return;

      // Thruster
      ctx.fillStyle = Math.random() < 0.5 ? '#fc6' : '#f84';
      ctx.beginPath();
      ctx.moveTo(p.x - 6, p.y + 10);
      ctx.lineTo(p.x, p.y + 20 + Math.random() * 6);
      ctx.lineTo(p.x + 6, p.y + 10);
      ctx.closePath(); ctx.fill();

      if (!Assets.draw(ctx, 'sf_player', p.x, p.y, 44, 44, { fallback: () => {
        ctx.fillStyle = '#6cf';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - 18);
        ctx.lineTo(p.x - 14, p.y + 12);
        ctx.lineTo(p.x + 14, p.y + 12);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillRect(p.x - 3, p.y - 4, 6, 8);
        ctx.fillStyle = '#f0c';
        ctx.fillRect(p.x - 18, p.y + 6, 6, 6);
        ctx.fillRect(p.x + 12, p.y + 6, 6, 6);
      }})) {}

      // Shield bubble
      if (p.shield > 0) {
        ctx.strokeStyle = 'rgba(120,200,255,0.85)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y, 28 + Math.sin(this.time * 12) * 2, 0, Math.PI * 2); ctx.stroke();
      }

      // Dash afterimage
      if (p.dashT > 0) {
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = '#ff8';
        ctx.lineWidth = 2;
        ctx.strokeRect(p.x - 14, p.y - 18, 28, 36);
        ctx.globalAlpha = 1;
      }

      // Inv shimmer
      if (p.inv > 0 && p.dashT <= 0) {
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(p.x, p.y, 26, 0, Math.PI * 2); ctx.stroke();
      }
    }

    _drawEnemy(ctx, e) {
      if (e.kind === 'dasher') {
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(Math.atan2(e.vy, e.vx));
        ctx.fillStyle = e.color;
        ctx.beginPath();
        ctx.moveTo(14, 0); ctx.lineTo(-8, 8); ctx.lineTo(-8, -8);
        ctx.closePath(); ctx.fill();
        ctx.restore();
        return;
      }
      if (e.kind === 'tank') {
        ctx.fillStyle = e.color;
        ctx.fillRect(e.x - e.r, e.y - e.r * 0.8, e.r * 2, e.r * 1.6);
        ctx.fillStyle = '#311';
        ctx.fillRect(e.x - e.r * 0.6, e.y - e.r * 0.3, e.r * 1.2, e.r * 0.6);
        ctx.fillStyle = '#f33';
        ctx.fillRect(e.x - 3, e.y - 3, 6, 6);
        return;
      }
      if (e.kind === 'swarm') {
        ctx.fillStyle = e.color;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#522';
        ctx.fillRect(e.x - 4, e.y - 1, 8, 3);
        return;
      }
      // Fallback to image-based enemies for grunt/zig/shooter
      const key = e.kind === 'shooter' ? 'sf_enemy3' : e.kind === 'zig' ? 'sf_enemy2' : 'sf_enemy1';
      const size = e.r * 2.2;
      if (!Assets.draw(ctx, key, e.x, e.y, size, size, { fallback: () => {
        ctx.fillStyle = e.color;
        ctx.fillRect(e.x - e.r, e.y - e.r * 0.7, e.r * 2, e.r * 1.4);
        ctx.fillStyle = '#000';
        ctx.fillRect(e.x - e.r * 0.5, e.y - 2, e.r * 0.3, e.r * 0.3);
        ctx.fillRect(e.x + e.r * 0.2, e.y - 2, e.r * 0.3, e.r * 0.3);
      }})) {}
    }

    _drawBoss(ctx, b) {
      if (b.kind === 'warlord') {
        // Custom vector warlord — pulsing core + twin wings
        ctx.save();
        ctx.translate(b.x, b.y);
        const pulse = 1 + Math.sin(b.t * 6) * 0.08;
        // Body
        ctx.fillStyle = '#2a0808';
        ctx.strokeStyle = '#f84'; ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(0, 0, b.r * 1.1 * pulse, b.r * 0.7, 0, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        // Wings
        ctx.fillStyle = '#5a1a1a';
        ctx.strokeStyle = '#f84';
        ctx.beginPath();
        ctx.moveTo(-b.r * 1.1, 0); ctx.lineTo(-b.r * 1.8, -b.r * 0.4); ctx.lineTo(-b.r * 1.6, b.r * 0.3);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(b.r * 1.1, 0); ctx.lineTo(b.r * 1.8, -b.r * 0.4); ctx.lineTo(b.r * 1.6, b.r * 0.3);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        // Core
        const core = b.phase === 3 ? '#fd3' : b.phase === 2 ? '#f84' : '#f44';
        ctx.fillStyle = core;
        ctx.beginPath(); ctx.arc(0, 0, 12 * pulse, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        return;
      }
      // Mid-boss: use ship asset flipped with biome tint overlay
      const size = b.r * 2.4;
      if (!Assets.draw(ctx, 'sf_ship', b.x, b.y, size, size, { rot: Math.PI, fallback: () => {
        ctx.fillStyle = '#e44';
        ctx.beginPath(); ctx.ellipse(b.x, b.y, b.r, b.r * 0.7, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#400';
        ctx.fillRect(b.x - b.r * 0.6, b.y + 10, b.r * 1.2, 10);
        ctx.fillStyle = '#ff0';
        ctx.beginPath(); ctx.arc(b.x, b.y, 10, 0, Math.PI * 2); ctx.fill();
      }})) {}
      // Biome accent glow ring
      ctx.strokeStyle = this.biome.accent;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 6 + Math.sin(b.t * 3) * 2, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  // Multi-line text helper
  function wrapText(ctx, text, x, y, maxW, lineH) {
    const words = String(text).split(' ');
    let line = '';
    for (let n = 0; n < words.length; n++) {
      const test = line + words[n] + ' ';
      if (ctx.measureText(test).width > maxW && n > 0) {
        ctx.fillText(line, x, y);
        line = words[n] + ' ';
        y += lineH;
      } else {
        line = test;
      }
    }
    ctx.fillText(line, x, y);
  }

  NDP.attachGame('starfall', StarfallGame);
})();
