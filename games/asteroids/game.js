/* Asteroids — Hive Campaign.
   ----------------------------------------------------------------------------
   A 10-wave campaign with bosses on waves 5 (Swarm Lord) and 10 (Hive Queen).
   Between waves the player drops into an Upgrade Bay that spends Notdop coins
   on rapid fire, twin guns, regenerating shield, or a homing missile.

   Phase machine (lives inside BaseGame's "playing" state):
     intro    — splash; click to launch wave 1
     wave     — rocks falling, shoot to clear
     between  — 1.4s "WAVE CLEARED" beat before the shop opens
     shop     — buy upgrades, click LAUNCH to start the next wave
     boss     — wave 5 / 10 boss fight
     bossWin  — 1.4s "BOSS DOWN" beat → shop, or victory after the hive
     victory  — final win splash → click → BaseGame.win()

   Persistent meta (Storage):
     bestWave            — furthest wave reached
     perksUnlocked.{...} — once an upgrade is bought it is half-price next run
     defeatedHive        — true once the queen has fallen at least once
*/
(function () {
  const NDP = window.NDP;
  const { BaseGame, Input, Sprites } = NDP.Engine;
  const Storage = NDP.Engine.Storage;

  // The sprite atlas lives in a sibling sprites.js. Inject it lazily so we
  // don't depend on index.html order; by the time the player clicks "Play"
  // the script has long since loaded.
  if (Sprites && !Sprites.has('aster.ship_basic')) {
    const s = document.createElement('script');
    s.src = 'games/asteroids/sprites.js?v=4';
    document.head.appendChild(s);
  }

  const W = 960, H = 600;
  const CX = W / 2, CY = H / 2;
  const TOTAL_WAVES = 10;
  const SHIELD_REGEN = 8;
  const MISSILE_CD = 6;

  const SIZES = {
    large:  { r: 40, value: 20, splitTo: 'medium', count: 2 },
    medium: { r: 22, value: 50, splitTo: 'small',  count: 2 },
    small:  { r: 12, value: 100, splitTo: null,    count: 0 }
  };

  const UPGRADES = [
    { id:'rapidfire', name:'RAPID FIRE', desc:'Fire rate doubled',                cost: 25, sprite:'aster.upgrade_rapidfire' },
    { id:'twin',      name:'TWIN GUNS',  desc:'Two parallel bullets per shot',    cost: 35, sprite:'aster.upgrade_twin' },
    { id:'shield',    name:'SHIELD',     desc:'Absorb one hit, regenerates 8s',   cost: 30, sprite:'aster.upgrade_shield' },
    { id:'missile',   name:'MISSILE',    desc:'Homing missile · X · 6s cooldown', cost: 40, sprite:'aster.upgrade_missile' },
    { id:'overclock', name:'OVERCLOCK',  desc:'+35% bullet speed & range',        cost: 30, sprite:'aster.upgrade_overclock' },
    { id:'salvage',   name:'SALVAGE',    desc:'+1 coin per rock destroyed',       cost: 35, sprite:'aster.upgrade_salvage' },
    { id:'drone',     name:'DRONE',      desc:'Orbit drone auto-fires (slow)',    cost: 50, sprite:'aster.upgrade_drone' },
    { id:'emp',       name:'EMP BLAST',  desc:'C clears bullets & mini-nukes 1/run', cost: 40, sprite:'aster.upgrade_emp' }
  ];

  // ---------------------------------------------------------------------------
  // BIOMES — applied to each sector; palette swaps backdrop + star tint
  const BIOMES = {
    frontier: { name:'FRONTIER',     bg1:'#0a1228', bg2:'#000',      star:'#cfe', accent:'#7cd9ff', accent2:'#6cf' },
    debris:   { name:'DEBRIS BELT',  bg1:'#1a0e06', bg2:'#060302',   star:'#ffc', accent:'#fb6',    accent2:'#c84' },
    ion:      { name:'ION STORM',    bg1:'#061a18', bg2:'#010808',   star:'#cfe', accent:'#3fe',    accent2:'#6fc' },
    voidBiome:{ name:'DEEP VOID',    bg1:'#0a0418', bg2:'#020004',   star:'#ccf', accent:'#a6f',    accent2:'#46c' },
    core:     { name:'THE CORE',     bg1:'#2a0808', bg2:'#0a0000',   star:'#fec', accent:'#f84',    accent2:'#fd3' }
  };

  // Wave → sector map. 5 sectors total; last ends with Hive Queen.
  // Sector 1: waves 1-2, S2: 3-4, S3: wave 5 (Swarm Lord), S4: 6-7, S5: 8-10.
  function sectorForWave(w) {
    if (w <= 2) return 1;
    if (w <= 4) return 2;
    if (w === 5) return 3;
    if (w <= 7) return 4;
    return 5;
  }
  // "End" wave per sector — the last wave of the sector; after clearing it, we
  // open the map choice for the next sector (unless we're in sector 5).
  function isSectorEnd(w) {
    return w === 2 || w === 4 || w === 5 || w === 7;
  }

  const MODIFIERS = {
    none:     { name:'NORMAL',   desc:'',                           tag:'' },
    dense:    { name:'DENSE',    desc:'+1 extra rock, +40% coins',  tag:'DENSE' },
    bounty:   { name:'BOUNTY',   desc:'2x bay credits this sector', tag:'BOUNTY' },
    elite:    { name:'ELITE',    desc:'+20% rock speed, +50% coins',tag:'ELITE' },
    turbulent:{ name:'TURBULENT', desc:'Rocks drift faster',         tag:'TURBO' }
  };

  function rollSectorBiomes() {
    const middle = ['debris', 'ion', 'voidBiome'];
    for (let i = middle.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [middle[i], middle[j]] = [middle[j], middle[i]];
    }
    return {
      1: 'frontier',
      2: middle[0],
      3: middle[1],
      4: middle[2],
      5: 'core'
    };
  }

  function loadSave() {
    const def = {
      bestWave: 0,
      perksUnlocked: {
        rapidfire:false, twin:false, shield:false, missile:false,
        overclock:false, salvage:false, drone:false, emp:false
      },
      defeatedHive: false
    };
    const saved = Storage.getGameData('asteroids') || {};
    return Object.assign({}, def, saved, {
      perksUnlocked: Object.assign({}, def.perksUnlocked, saved.perksUnlocked || {})
    });
  }
  function saveData(d) { Storage.setGameData('asteroids', d); }

  // ===========================================================================
  class AsteroidsGame extends BaseGame {
    init() {
      this.save = loadSave();

      this.phase = 'intro';
      this.waveN = 1;
      // Milestone counters drive the global theme-shop coins from coinsEarned().
      // Per-wave payouts now flow into the per-game asteroids wallet (used by
      // the Upgrade Bay), not the global pool.
      this.wavesClearedThisRun = 0;
      this.victoryAchieved = false;

      this.upgrades = {
        rapidfire:false, twin:false, shield:false, missile:false,
        overclock:false, salvage:false, drone:false, emp:false
      };
      this.shieldHp = 0;
      this.shieldRegenTimer = 0;
      this.missileCD = 0;
      this.empUsed = false;
      this.playerDrone = null;       // { ang, r, shotCD } when upgrade owned
      this.sectorBiomes = rollSectorBiomes();
      this.sector = 1;
      this.biome = BIOMES[this.sectorBiomes[1]];
      this.modifier = 'none';
      this.sectorIntroT = 0;
      this.mapRects = [];
      this.mapCards = null;

      this.shootCD = 0;
      this.bullets = [];
      this.missiles = [];
      this.rocks = [];
      this.drones = [];
      this.alienBullets = [];
      this.boss = null;
      this.bossAnnounceT = 0;

      this.shopRects = [];
      this.lastReward = 0;
      this.betweenTimer = 0;
      this.bossWinTimer = 0;
      this.victoryTimer = 0;

      this.ship = {
        x: CX, y: CY, vx: 0, vy: 0, ang: -Math.PI / 2,
        thrusting: false, invuln: 1.5
      };

      this.stars = [];
      for (let i = 0; i < 120; i++) {
        this.stars.push({
          x: Math.random() * W, y: Math.random() * H,
          tw: Math.random() * Math.PI * 2,
          tws: 0.4 + Math.random() * 1.2
        });
      }

      this.thrustSfxAcc = 0;
      this.sfx = this.makeSfx({
        shoot:   { freq: 880, type: 'square',   dur: 0.05, slide: -200, vol: 0.18 },
        thrust:  { freq: 80,  type: 'noise',    dur: 0.08, vol: 0.12, filter: 'lowpass' },
        boom_l:  { freq: 90,  type: 'noise',    dur: 0.40, vol: 0.5,  filter: 'lowpass' },
        boom_m:  { freq: 200, type: 'noise',    dur: 0.28, vol: 0.4,  filter: 'lowpass' },
        boom_s:  { freq: 400, type: 'noise',    dur: 0.18, vol: 0.3,  filter: 'highpass' },
        die:     { freq: 110, type: 'sawtooth', dur: 0.70, slide: -80, vol: 0.55 },
        boss:    { freq: 70,  type: 'sawtooth', dur: 0.50, slide: -30, vol: 0.5 },
        missile: { freq: 220, type: 'sawtooth', dur: 0.18, slide: 200, vol: 0.4 },
        explode: { freq: 60,  type: 'noise',    dur: 0.50, vol: 0.6,  filter: 'lowpass' },
        bossHit: { freq: 320, type: 'sawtooth', dur: 0.20, slide: -160, vol: 0.5 },
        win:     { freq: 880, type: 'triangle', dur: 0.50, slide: 220, vol: 0.55 },
        buy:     { freq: 1100,type: 'square',   dur: 0.10, vol: 0.4 },
        shield:  { freq: 600, type: 'sine',     dur: 0.30, vol: 0.35 },
        ping:    { freq: 1200,type: 'square',   dur: 0.04, vol: 0.2 }
      });

      // Eager rasterise the sprites we'll need — survives the lazy script load
      // because preload() retries once sources arrive.
      Sprites.preload(['aster.ship_basic','aster.ship_basic_flame',
                       'aster.ship_upgraded','aster.ship_upgraded_flame'], 60, 60);
      Sprites.preload(['aster.drone_hunter'], 50, 50);
      Sprites.preload(['aster.boss_swarm_lord'], 220, 220);
      Sprites.preload(['aster.boss_hive_queen'], 200, 200);
      Sprites.preload(['aster.missile'], 36, 12);
      Sprites.preload(['aster.alien_bullet'], 18, 18);
      Sprites.preload(['aster.upgrade_rapidfire','aster.upgrade_twin',
                       'aster.upgrade_shield','aster.upgrade_missile',
                       'aster.upgrade_overclock','aster.upgrade_salvage',
                       'aster.upgrade_drone','aster.upgrade_emp'], 64, 64);

      this._refreshHud();
    }

    onEnd() {
      const reached = this.phase === 'victory' ? TOTAL_WAVES : Math.max(1, this.waveN - 1);
      this.save.bestWave = Math.max(this.save.bestWave, reached);
      saveData(this.save);
    }

    // Global theme-shop coins: 1 per wave actually cleared this run + 20
    // victory bonus. The fat per-wave payouts go to the asteroids wallet
    // instead so they fund the in-game Upgrade Bay, not the theme shop.
    coinsEarned() {
      return (this.wavesClearedThisRun | 0) * 1 + (this.victoryAchieved ? 20 : 0);
    }

    // ----------------------------------------------------------------------
    _refreshHud() {
      let mid;
      if (this.phase === 'boss' && this.boss) {
        const total = this.boss.minis
          ? this.boss.minis.reduce((a,b) => a + b.hp, 0)
          : this.boss.hp;
        mid = `<span>Boss HP <b>${total}</b></span>`;
      } else {
        mid = `<span>Rocks <b>${this.rocks.length}</b></span>`;
      }
      const biomeTag = this.biome ? ` <span style="color:${this.biome.accent}">[${this.biome.name}]</span>` : '';
      const modTag = (this.modifier && this.modifier !== 'none') ? ` <span style="color:#fc6">[${MODIFIERS[this.modifier].tag}]</span>` : '';
      this.setHud(
        `<span>S<b>${this._currentSector ? this._currentSector() : 1}</b>·W<b>${this.waveN}/${TOTAL_WAVES}</b></span>` +
        mid +
        `<span>Score <b>${this.score}</b></span>` +
        `<span>Bay ● <b>${Storage.getGameWallet('asteroids')}</b></span>` +
        biomeTag + modTag
      );
    }

    // ======================================================================
    // UPDATE — phase dispatch
    update(dt) {
      if (this._hitStop > 0) {
        this._hitStop = Math.max(0, this._hitStop - dt);
        dt = dt * 0.15;
      }
      for (const s of this.stars) s.tw += s.tws * dt;
      if (this.phase === 'intro')      return this._updateIntro(dt);
      if (this.phase === 'wave')       return this._updateWave(dt);
      if (this.phase === 'boss')       return this._updateBoss(dt);
      if (this.phase === 'between')    return this._updateBetween(dt);
      if (this.phase === 'bossWin')    return this._updateBossWin(dt);
      if (this.phase === 'shop')       return this._updateShop(dt);
      if (this.phase === 'mapChoice')  return this._updateMapChoice(dt);
      if (this.phase === 'sectorIntro')return this._updateSectorIntro(dt);
      if (this.phase === 'victory')    return this._updateVictory(dt);
    }

    _currentSector() { return sectorForWave(this.waveN); }

    // After clearing a sector-end wave (or boss), route to map choice unless
    // we're entering sector 5 (final, no branching) or already in sector 5.
    _maybeOpenMapChoice() {
      const nextWave = this.waveN + 1;
      if (nextWave > TOTAL_WAVES) return false;
      const curSec = sectorForWave(this.waveN);
      const nextSec = sectorForWave(nextWave);
      if (nextSec === curSec) return false;
      if (nextSec === 5) {
        // Final sector — no branching. Just switch biome and show an intro.
        this._enterSector(5, 'none');
        return true;
      }
      this._openMapChoice(nextSec);
      return true;
    }

    _openMapChoice(nextSec) {
      this.phase = 'mapChoice';
      const biomeId = this.sectorBiomes[nextSec];
      const biome = BIOMES[biomeId];
      const pool = ['dense', 'bounty', 'elite', 'turbulent'];
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      const mods = ['none', pool[0], pool[1]];
      for (let i = mods.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [mods[i], mods[j]] = [mods[j], mods[i]];
      }
      this.mapCards = mods.map(m => ({ biome, biomeId, modifier: m, nextSec }));
      this.mapRects = [];
    }

    _updateMapChoice() {
      this._refreshHud();
      if (!Input.mouse.justPressed) return;
      Input.mouse.justPressed = false;
      const mx = Input.mouse.x, my = Input.mouse.y;
      for (const r of this.mapRects) {
        if (mx < r.x || mx > r.x + r.w || my < r.y || my > r.y + r.h) continue;
        const c = this.mapCards[r.i];
        this._enterSector(c.nextSec, c.modifier);
        return;
      }
    }

    _enterSector(sec, modifier) {
      this.sector = sec;
      this.biome = BIOMES[this.sectorBiomes[sec]];
      this.modifier = modifier;
      this.mapCards = null;
      this.phase = 'sectorIntro';
      this.sectorIntroT = 1.8;
    }

    _updateSectorIntro(dt) {
      this.sectorIntroT -= dt;
      // Let stars animate
      for (const s of this.stars) s.tw += s.tws * dt;
      if (this.sectorIntroT <= 0) this._startWave(this.waveN + 1);
    }

    // ----- intro splash -----
    _updateIntro() {
      this._refreshHud();
      if (Input.mouse.justPressed) {
        Input.mouse.justPressed = false;
        this._startWave(1);
      }
    }

    // ----- wave bootstrap -----
    _startWave(n) {
      this.waveN = n;
      this.rocks = [];
      this.bullets = [];
      this.missiles = [];
      this.drones = [];
      this.alienBullets = [];
      this.boss = null;

      this.ship.x = CX; this.ship.y = CY;
      this.ship.vx = 0; this.ship.vy = 0;
      this.ship.invuln = 1.5;
      this.shootCD = 0;
      this.missileCD = 0;
      this.shieldHp = this.upgrades.shield ? 1 : 0;
      this.shieldRegenTimer = 0;

      if (n === 5)  { this._startBoss('swarm'); return; }
      if (n === 10) { this._startBoss('hive');  return; }

      this.phase = 'wave';
      this.bossAnnounceT = 0;
      // Ensure sector/biome match the new wave (covers the first-wave intro path)
      const sec = sectorForWave(n);
      if (sec !== this.sector) {
        this.sector = sec;
        this.biome = BIOMES[this.sectorBiomes[sec]];
      }
      let count = n + 2;
      let speedMul = Math.pow(1.05, n);
      if (this.modifier === 'dense') count += 1;
      if (this.modifier === 'elite') speedMul *= 1.2;
      if (this.modifier === 'turbulent') speedMul *= 1.35;
      // Reset per-sector drone if owned
      if (this.upgrades.drone) {
        this.playerDrone = this.playerDrone || { ang: 0, r: 46, shotCD: 1.0 };
      }
      for (let i = 0; i < count; i++) {
        let x, y, tries = 0;
        do { x = Math.random() * W; y = Math.random() * H; tries++; }
        while (Math.hypot(x - CX, y - CY) < 200 && tries < 30);
        this._spawnRock(x, y, 'large', null, null, speedMul);
      }
    }

    _startBoss(kind) {
      this.phase = 'boss';
      this.bossAnnounceT = 2.4;
      if (kind === 'swarm') {
        this.boss = {
          kind:'swarm', x: CX, y: 140, vx: 0, vy: 0,
          maxHp: 8, hp: 8,
          dashCD: 1.6, dashRemaining: 0, dashDir: { x: 0, y: 1 },
          spawnCD: 1.4,
          hitFlash: 0,
          r: 56
        };
      } else {
        this.boss = {
          kind:'hive', x: CX, y: 200, vx: 60, vy: 0,
          baseY: 200, phase: 0,
          maxHp: 14, hp: 14,
          shotCD: 1.5,
          weakAng: 0, weakRot: 1.6, weakDist: 90, weakR: 14,
          split: false, minis: null,
          hitFlash: 0,
          r: 100
        };
      }
      this.sfx.play('boss');
      this.flash('#ff5e7e', 0.25);
      this.shake(12, 0.4);
    }

    // ----- per-frame ship -----
    _updateShip(dt) {
      const ship = this.ship;
      if (Input.keys['a'] || Input.keys['A'] || Input.keys['ArrowLeft'])  ship.ang -= 3.4 * dt;
      if (Input.keys['d'] || Input.keys['D'] || Input.keys['ArrowRight']) ship.ang += 3.4 * dt;

      ship.thrusting = !!(Input.keys['w'] || Input.keys['W'] || Input.keys['ArrowUp']);
      if (ship.thrusting) {
        const acc = 320 * dt;
        ship.vx += Math.cos(ship.ang) * acc;
        ship.vy += Math.sin(ship.ang) * acc;
        this.thrustSfxAcc += dt;
        if (this.thrustSfxAcc > 0.06) { this.thrustSfxAcc = 0; this.sfx.play('thrust'); }
        const exX = ship.x - Math.cos(ship.ang) * 14;
        const exY = ship.y - Math.sin(ship.ang) * 14;
        this.particles.emit({
          x: exX, y: exY,
          vx: -Math.cos(ship.ang) * 200 + (Math.random() - 0.5) * 40,
          vy: -Math.sin(ship.ang) * 200 + (Math.random() - 0.5) * 40,
          life: 0.35, size: 2.5, color: '#ffae44'
        });
      }

      ship.vx *= Math.pow(0.985, dt * 60);
      ship.vy *= Math.pow(0.985, dt * 60);
      const sp = Math.hypot(ship.vx, ship.vy);
      const MAX = 380;
      if (sp > MAX) { ship.vx *= MAX / sp; ship.vy *= MAX / sp; }
      ship.x += ship.vx * dt; ship.y += ship.vy * dt;
      ship.x = wrap(ship.x, W); ship.y = wrap(ship.y, H);
      ship.invuln = Math.max(0, ship.invuln - dt);

      // Shield slowly recharges after 8s without taking damage. We track the
      // timer outside takeDamage so partial recharges don't carry over.
      if (this.upgrades.shield && this.shieldHp < 1) {
        this.shieldRegenTimer += dt;
        if (this.shieldRegenTimer >= SHIELD_REGEN) {
          this.shieldHp = 1;
          this.shieldRegenTimer = 0;
          this.sfx.play('shield');
          this.particles.burst(ship.x, ship.y, 16, { color:'#7ae0ff', speed: 160, life: 0.5 });
        }
      }

      this.shootCD = Math.max(0, this.shootCD - dt);
      if ((Input.keys[' '] || Input.keys['Space']) && this.shootCD <= 0) this._fire();

      this.missileCD = Math.max(0, this.missileCD - dt);
      if (this.upgrades.missile && (Input.keys['x'] || Input.keys['X']) && this.missileCD <= 0) {
        this._fireMissile();
      }
      if (this.upgrades.emp && !this.empUsed && (Input.keys['c'] || Input.keys['C'])) {
        this._fireEmp();
        Input.keys['c'] = false; Input.keys['C'] = false;
      }
      this._updatePlayerDrone(dt);
    }

    _fireEmp() {
      this.empUsed = true;
      this.flash('#7ae0ff', 0.5);
      this.shake(22, 0.6);
      this.sfx.play('explode');
      this.particles.burst(this.ship.x, this.ship.y, 80, { color:'#7ae0ff', speed: 420, life: 0.9, size: 3 });
      this.alienBullets = [];
      // 2 dmg to all rocks/drones/boss
      for (let i = this.rocks.length - 1; i >= 0; i--) {
        const r = this.rocks[i];
        if (Math.hypot(this.ship.x - r.x, this.ship.y - r.y) < 280) this._destroyRock(i);
      }
      for (let i = this.drones.length - 1; i >= 0; i--) this._killDrone(i);
      if (this.boss) {
        const list = this.boss.split && this.boss.minis ? this.boss.minis : [this.boss];
        for (const e of list) this._hitBoss(e, 3, e.x, e.y);
      }
    }

    _updatePlayerDrone(dt) {
      const d = this.playerDrone;
      if (!d || !this.upgrades.drone) return;
      d.ang += 2.4 * dt;
      d.shotCD -= dt;
      const dx = this.ship.x + Math.cos(d.ang) * d.r;
      const dy = this.ship.y + Math.sin(d.ang) * d.r;
      d.x = dx; d.y = dy;
      if (d.shotCD <= 0) {
        const t = this._nearestEnemy(dx, dy);
        if (t) {
          const ang = Math.atan2(t.y - dy, t.x - dx);
          this.bullets.push({
            x: dx, y: dy,
            vx: Math.cos(ang) * 520, vy: Math.sin(ang) * 520,
            life: 0.7
          });
          d.shotCD = 0.75;
          this.particles.emit({ x: dx, y: dy, vx: 0, vy: 0, life: 0.15, size: 3, color: '#7ae0ff' });
        } else {
          d.shotCD = 0.3;
        }
      }
    }

    _fire() {
      const ship = this.ship;
      const sp = this.upgrades.overclock ? 810 : 600;
      const baseCD = 0.18;
      this.shootCD = this.upgrades.rapidfire ? baseCD * 0.5 : baseCD;
      const offsets = this.upgrades.twin ? [-7, 7] : [0];
      for (const off of offsets) {
        const ox = Math.cos(ship.ang + Math.PI / 2) * off;
        const oy = Math.sin(ship.ang + Math.PI / 2) * off;
        this.bullets.push({
          x: ship.x + Math.cos(ship.ang) * 14 + ox,
          y: ship.y + Math.sin(ship.ang) * 14 + oy,
          vx: Math.cos(ship.ang) * sp + ship.vx,
          vy: Math.sin(ship.ang) * sp + ship.vy,
          life: this.upgrades.overclock ? 1.2 : 0.9
        });
      }
      this.sfx.play('shoot');
      this.particles.emit({
        x: ship.x + Math.cos(ship.ang) * 16,
        y: ship.y + Math.sin(ship.ang) * 16,
        vx: 0, vy: 0, life: 0.12, size: 4, color: '#ffd86b'
      });
    }

    _fireMissile() {
      const ship = this.ship;
      const sp = 320;
      this.missiles.push({
        x: ship.x + Math.cos(ship.ang) * 14,
        y: ship.y + Math.sin(ship.ang) * 14,
        vx: Math.cos(ship.ang) * sp,
        vy: Math.sin(ship.ang) * sp,
        ang: ship.ang,
        life: 3.0
      });
      this.missileCD = MISSILE_CD;
      this.sfx.play('missile');
      this.particles.emit({
        x: ship.x, y: ship.y,
        vx: 0, vy: 0, life: 0.2, size: 4, color: '#ff8c3a'
      });
    }

    // ----- rocks -----
    _spawnRock(x, y, sizeKey, vx, vy, speedMul) {
      const def = SIZES[sizeKey];
      const ang = Math.random() * Math.PI * 2;
      const baseSp = sizeKey === 'small' ? 90 + Math.random() * 80
                  : sizeKey === 'medium' ? 60 + Math.random() * 60
                                          : 30 + Math.random() * 40;
      const sm = speedMul || 1;
      const sp = baseSp * sm;
      const sides = sizeKey === 'large' ? 11 : sizeKey === 'medium' ? 9 : 7;
      const verts = [];
      for (let i = 0; i < sides; i++) {
        const a = (i / sides) * Math.PI * 2;
        const r = def.r * (0.78 + Math.random() * 0.35);
        verts.push({ a, r });
      }
      this.rocks.push({
        x, y,
        vx: vx != null ? vx : Math.cos(ang) * sp,
        vy: vy != null ? vy : Math.sin(ang) * sp,
        rot: 0, rotSp: (Math.random() - 0.5) * 1.2,
        sizeKey, def, verts, speedMul: sm
      });
    }

    _updateRocks(dt) {
      const ship = this.ship;
      for (let i = this.rocks.length - 1; i >= 0; i--) {
        const r = this.rocks[i];
        r.x += r.vx * dt; r.y += r.vy * dt;
        r.x = wrap(r.x, W); r.y = wrap(r.y, H);
        r.rot += r.rotSp * dt;
        if (ship.invuln <= 0 && Math.hypot(ship.x - r.x, ship.y - r.y) < r.def.r + 8) {
          this._takeDamage();
          if (this.state !== 'playing') return;
        }
      }
    }

    _destroyRock(idx) {
      const r = this.rocks[idx];
      this.addScore(r.def.value);
      if (this.upgrades.salvage) {
        Storage.addGameWallet('asteroids', 1);
      }
      this.shake(r.sizeKey === 'large' ? 8 : r.sizeKey === 'medium' ? 5 : 3, 0.2);
      const palette = r.sizeKey === 'large' ? '#7cd9ff'
                    : r.sizeKey === 'medium' ? '#cfe9ff' : '#ffd86b';
      this.particles.burst(r.x, r.y, r.sizeKey === 'large' ? 26 : 14, {
        color: palette, speed: 220, life: 0.6, size: 3
      });
      this.sfx.play('boom_' + (r.sizeKey === 'large' ? 'l' : r.sizeKey === 'medium' ? 'm' : 's'));
      this.rocks.splice(idx, 1);
      if (r.def.splitTo) {
        for (let i = 0; i < r.def.count; i++) {
          const ang = Math.random() * Math.PI * 2;
          const sp = (80 + Math.random() * 80) * r.speedMul;
          this._spawnRock(r.x, r.y, r.def.splitTo, Math.cos(ang) * sp, Math.sin(ang) * sp, r.speedMul);
        }
      }
    }

    // ----- bullets -----
    _updateBullets(dt) {
      for (let i = this.bullets.length - 1; i >= 0; i--) {
        const b = this.bullets[i];
        b.x += b.vx * dt; b.y += b.vy * dt;
        b.life -= dt;
        b.x = wrap(b.x, W); b.y = wrap(b.y, H);
        if (b.life <= 0) { this.bullets.splice(i, 1); continue; }
        if (this._bulletHits(b, i)) continue;
      }
    }

    _bulletHits(b, bIdx) {
      for (let j = this.rocks.length - 1; j >= 0; j--) {
        const r = this.rocks[j];
        if (Math.hypot(b.x - r.x, b.y - r.y) < r.def.r) {
          this._destroyRock(j);
          this.bullets.splice(bIdx, 1);
          return true;
        }
      }
      for (let j = this.drones.length - 1; j >= 0; j--) {
        const d = this.drones[j];
        if (Math.hypot(b.x - d.x, b.y - d.y) < 18) {
          this._killDrone(j);
          this.bullets.splice(bIdx, 1);
          return true;
        }
      }
      if (this.boss) {
        if (this.boss.kind === 'swarm') {
          if (Math.hypot(b.x - this.boss.x, b.y - this.boss.y) < this.boss.r) {
            this._hitBoss(this.boss, 1, b.x, b.y);
            this.bullets.splice(bIdx, 1);
            return true;
          }
        } else if (this.boss.kind === 'hive') {
          const list = this.boss.split && this.boss.minis ? this.boss.minis : [this.boss];
          for (const q of list) {
            if (this._tryHitHive(q, b)) {
              this.bullets.splice(bIdx, 1);
              return true;
            }
          }
        }
      }
      return false;
    }

    // The Hive Queen has a rotating glowing weak point. Bullets hitting the
    // weak point deal damage; bullets hitting the body simply spark and die.
    _tryHitHive(q, b) {
      const wx = q.x + Math.cos(q.weakAng) * q.weakDist;
      const wy = q.y + Math.sin(q.weakAng) * q.weakDist;
      if (Math.hypot(b.x - wx, b.y - wy) < q.weakR) {
        this._hitBoss(q, 1, wx, wy);
        return true;
      }
      if (Math.hypot(b.x - q.x, b.y - q.y) < q.r) {
        this.particles.burst(b.x, b.y, 6, { color:'#7ae0ff', speed: 180, life: 0.3 });
        this.sfx.play('ping');
        return true;
      }
      return false;
    }

    _hitBoss(b, dmg, x, y) {
      b.hp = Math.max(0, b.hp - dmg);
      b.hitFlash = 0.25;
      this.shake(6, 0.2);
      this.particles.burst(x, y, 14, { color:'#ff8c3a', speed: 220, life: 0.5 });
      this.sfx.play('bossHit');
    }

    // ----- drones -----
    _updateDrones(dt) {
      const ship = this.ship;
      for (let i = this.drones.length - 1; i >= 0; i--) {
        const d = this.drones[i];
        const dx = ship.x - d.x, dy = ship.y - d.y;
        const dist = Math.hypot(dx, dy) || 1;
        d.vx += (dx / dist) * 80 * dt;
        d.vy += (dy / dist) * 80 * dt;
        d.vx *= Math.pow(0.94, dt * 60);
        d.vy *= Math.pow(0.94, dt * 60);
        const ds = Math.hypot(d.vx, d.vy);
        const MAX = 140;
        if (ds > MAX) { d.vx *= MAX / ds; d.vy *= MAX / ds; }
        d.x += d.vx * dt; d.y += d.vy * dt;
        d.x = wrap(d.x, W); d.y = wrap(d.y, H);

        d.shotCD -= dt;
        if (d.shotCD <= 0) {
          d.shotCD = 1.6 + Math.random() * 1.0;
          const ang = Math.atan2(dy, dx);
          this.alienBullets.push({
            x: d.x, y: d.y,
            vx: Math.cos(ang) * 220, vy: Math.sin(ang) * 220,
            life: 2.5
          });
          this.sfx.play('ping');
        }

        if (ship.invuln <= 0 && Math.hypot(d.x - ship.x, d.y - ship.y) < 22) {
          this._killDrone(i);
          this._takeDamage();
          if (this.state !== 'playing') return;
        }
      }
    }

    _killDrone(idx) {
      const d = this.drones[idx];
      this.particles.burst(d.x, d.y, 16, { color:'#ff5e7e', speed: 220, life: 0.5 });
      this.sfx.play('boom_s');
      this.addScore(40);
      this.drones.splice(idx, 1);
    }

    // ----- alien bullets -----
    _updateAlienBullets(dt) {
      const ship = this.ship;
      for (let i = this.alienBullets.length - 1; i >= 0; i--) {
        const b = this.alienBullets[i];
        b.x += b.vx * dt; b.y += b.vy * dt;
        b.life -= dt;
        if (b.life <= 0 || b.x < -10 || b.x > W + 10 || b.y < -10 || b.y > H + 10) {
          this.alienBullets.splice(i, 1);
          continue;
        }
        if (ship.invuln <= 0 && Math.hypot(b.x - ship.x, b.y - ship.y) < 12) {
          this.alienBullets.splice(i, 1);
          this._takeDamage();
          if (this.state !== 'playing') return;
        }
      }
    }

    // ----- missiles -----
    _updateMissiles(dt) {
      for (let i = this.missiles.length - 1; i >= 0; i--) {
        const m = this.missiles[i];
        const target = this._nearestEnemy(m.x, m.y);
        if (target) {
          const desired = Math.atan2(target.y - m.y, target.x - m.x);
          let diff = desired - m.ang;
          while (diff >  Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          const turn = 5 * dt;
          if      (diff >  turn) m.ang += turn;
          else if (diff < -turn) m.ang -= turn;
          else                   m.ang  = desired;
        }
        const sp = 360;
        m.vx = Math.cos(m.ang) * sp;
        m.vy = Math.sin(m.ang) * sp;
        m.x += m.vx * dt; m.y += m.vy * dt;
        m.x = wrap(m.x, W); m.y = wrap(m.y, H);
        m.life -= dt;

        this.particles.emit({
          x: m.x - Math.cos(m.ang) * 12,
          y: m.y - Math.sin(m.ang) * 12,
          vx: 0, vy: 0, life: 0.4, size: 3, color: '#ff8c3a'
        });

        if (m.life <= 0) { this._explodeMissile(m, false); this.missiles.splice(i, 1); continue; }

        let hit = false;
        for (const r of this.rocks) {
          if (Math.hypot(m.x - r.x, m.y - r.y) < r.def.r + 6) { hit = true; break; }
        }
        if (!hit) for (const d of this.drones) {
          if (Math.hypot(m.x - d.x, m.y - d.y) < 22) { hit = true; break; }
        }
        if (!hit && this.boss) {
          const list = this.boss.split && this.boss.minis ? this.boss.minis : [this.boss];
          for (const e of list) {
            if (Math.hypot(m.x - e.x, m.y - e.y) < (e.r || 60)) { hit = true; break; }
          }
        }
        if (hit) {
          this._explodeMissile(m, true);
          this.missiles.splice(i, 1);
        }
      }
    }

    _explodeMissile(m, withDamage) {
      const RAD = 70;
      this.particles.burst(m.x, m.y, 36, { color:'#ff8c3a', speed: 320, life: 0.7, size: 3 });
      this.shake(10, 0.3);
      this.flash('#ff8c3a', 0.10);
      this.sfx.play('explode');
      if (!withDamage) return;

      for (let j = this.rocks.length - 1; j >= 0; j--) {
        const r = this.rocks[j];
        if (Math.hypot(m.x - r.x, m.y - r.y) < RAD + r.def.r) this._destroyRock(j);
      }
      for (let j = this.drones.length - 1; j >= 0; j--) {
        const d = this.drones[j];
        if (Math.hypot(m.x - d.x, m.y - d.y) < RAD) this._killDrone(j);
      }
      if (this.boss) {
        const list = this.boss.split && this.boss.minis ? this.boss.minis : [this.boss];
        for (const e of list) {
          if (Math.hypot(m.x - e.x, m.y - e.y) < RAD + 30) this._hitBoss(e, 2, m.x, m.y);
        }
      }
    }

    _nearestEnemy(x, y) {
      let best = null, bd = Infinity;
      for (const r of this.rocks) {
        const d = Math.hypot(r.x - x, r.y - y);
        if (d < bd) { bd = d; best = r; }
      }
      for (const dr of this.drones) {
        const d = Math.hypot(dr.x - x, dr.y - y);
        if (d < bd) { bd = d; best = dr; }
      }
      if (this.boss) {
        const list = this.boss.split && this.boss.minis ? this.boss.minis : [this.boss];
        for (const e of list) {
          const d = Math.hypot(e.x - x, e.y - y);
          if (d < bd) { bd = d; best = e; }
        }
      }
      return best;
    }

    // ----- boss logic -----
    _updateBossLogic(dt) {
      const b = this.boss;
      if (!b) return;
      if (b.hitFlash > 0) b.hitFlash = Math.max(0, b.hitFlash - dt);
      if (this.bossAnnounceT > 0) this.bossAnnounceT -= dt;

      if (b.kind === 'swarm') {
        // Drift toward the player; periodically dash. Dash is short and
        // committed so the player can outmanoeuvre it with a quick boost.
        b.dashCD -= dt;
        if (b.dashRemaining > 0) {
          b.dashRemaining -= dt;
          b.x += b.dashDir.x * 320 * dt;
          b.y += b.dashDir.y * 320 * dt;
        } else {
          const dx = this.ship.x - b.x, dy = this.ship.y - b.y;
          const dist = Math.hypot(dx, dy) || 1;
          b.vx += (dx / dist) * 30 * dt;
          b.vy += (dy / dist) * 30 * dt;
          b.vx *= Math.pow(0.92, dt * 60);
          b.vy *= Math.pow(0.92, dt * 60);
          b.x += b.vx * dt; b.y += b.vy * dt;
          if (b.dashCD <= 0) {
            b.dashCD = 2.4 + Math.random() * 1.4;
            b.dashRemaining = 0.55;
            const dx2 = this.ship.x - b.x, dy2 = this.ship.y - b.y;
            const dist2 = Math.hypot(dx2, dy2) || 1;
            b.dashDir = { x: dx2 / dist2, y: dy2 / dist2 };
            this.sfx.play('boss');
          }
        }
        b.x = Math.max(60, Math.min(W - 60, b.x));
        b.y = Math.max(60, Math.min(H - 60, b.y));

        if (this.ship.invuln <= 0 && Math.hypot(b.x - this.ship.x, b.y - this.ship.y) < b.r) {
          this._takeDamage();
          if (this.state !== 'playing') return;
        }

        b.spawnCD -= dt;
        if (b.spawnCD <= 0 && this.drones.length < 4) {
          b.spawnCD = 1.6;
          const ang = Math.random() * Math.PI * 2;
          this.drones.push({
            x: b.x + Math.cos(ang) * 40,
            y: b.y + Math.sin(ang) * 40,
            vx: 0, vy: 0,
            shotCD: 1.5 + Math.random() * 1.0
          });
          this.particles.burst(b.x, b.y, 10, { color:'#ff5e7e', speed: 160, life: 0.4 });
        }
      } else if (b.kind === 'hive') {
        const tickQueen = (q) => {
          q.weakAng += q.weakRot * dt;
          q.x += q.vx * dt;
          if (q.x < 130 || q.x > W - 130) q.vx *= -1;
          q.y = q.baseY + Math.sin(this.time * 0.8 + q.phase) * 40;
          q.shotCD -= dt;
          if (q.shotCD <= 0) {
            q.shotCD = 1.5;
            const ang = Math.atan2(this.ship.y - q.y, this.ship.x - q.x);
            this.alienBullets.push({
              x: q.x, y: q.y,
              vx: Math.cos(ang) * 240, vy: Math.sin(ang) * 240,
              life: 3.0
            });
            this.sfx.play('ping');
          }
          if (this.ship.invuln <= 0 && Math.hypot(q.x - this.ship.x, q.y - this.ship.y) < q.r) {
            this._takeDamage();
          }
          if (q.hitFlash > 0) q.hitFlash = Math.max(0, q.hitFlash - dt);
        };

        if (b.split && b.minis) {
          for (let i = b.minis.length - 1; i >= 0; i--) {
            const q = b.minis[i];
            if (q.hp <= 0) {
              this.particles.burst(q.x, q.y, 50, { color:'#ff5e7e', speed: 360, life: 0.9, size: 3 });
              this.shake(16, 0.5);
              this.sfx.play('explode');
              b.minis.splice(i, 1);
              continue;
            }
            // Phase 3 enrage — when either mini drops below 30% HP, its weak
            // point spins 2x and it fires an aimed-3-shot burst periodically.
            if (!q.enraged && q.hp <= q.maxHp * 0.3) {
              q.enraged = true;
              q.weakRot *= 2.2;
              q.shotCD = 0.6;
              this.flash('#ff3a3a', 0.4);
              this.shake(14, 0.5);
              this.sfx.play('boss');
            }
            if (q.enraged) {
              // Override default shot cadence with burst
              q.burstCD = (q.burstCD || 0) - dt;
              if (q.burstCD <= 0) {
                q.burstCD = 2.4;
                const baseAng = Math.atan2(this.ship.y - q.y, this.ship.x - q.x);
                for (let k = -1; k <= 1; k++) {
                  this.alienBullets.push({
                    x: q.x, y: q.y,
                    vx: Math.cos(baseAng + k * 0.25) * 300,
                    vy: Math.sin(baseAng + k * 0.25) * 300,
                    life: 3
                  });
                }
                this.sfx.play('ping');
              }
            }
            tickQueen(q);
            if (this.state !== 'playing') return;
          }
        } else {
          tickQueen(b);
          if (this.state !== 'playing') return;
          if (b.hp <= b.maxHp / 2) this._splitHive();
        }
      }

      if (b.kind === 'swarm' && b.hp <= 0) this._defeatBoss();
      if (b.kind === 'hive'  && b.split && b.minis && b.minis.length === 0) this._defeatBoss();
    }

    _splitHive() {
      const b = this.boss;
      b.split = true;
      const each = Math.max(3, Math.ceil(b.hp / 2) + 1);
      b.minis = [
        { x: b.x - 120, y: b.y, vx: -70, vy: 0, baseY: b.y, phase: 0,
          hp: each, maxHp: each, shotCD: 1.0,
          weakAng: 0, weakRot:  2.0, weakDist: 60, weakR: 12, r: 70, hitFlash: 0 },
        { x: b.x + 120, y: b.y, vx:  70, vy: 0, baseY: b.y, phase: Math.PI,
          hp: each, maxHp: each, shotCD: 1.0,
          weakAng: Math.PI, weakRot: -2.0, weakDist: 60, weakR: 12, r: 70, hitFlash: 0 }
      ];
      this.shake(20, 0.6);
      this.flash('#ff5e7e', 0.3);
      this.particles.burst(b.x, b.y, 60, { color:'#ff5e7e', speed: 360, life: 0.8 });
      this.sfx.play('explode');
    }

    _defeatBoss() {
      const reward = this.boss.kind === 'swarm' ? 30 : 60;
      Storage.addGameWallet('asteroids', reward);
      this.lastReward = reward;
      this.addScore(this.boss.kind === 'swarm' ? 500 : 1000);
      if (this.boss.kind === 'hive') this.save.defeatedHive = true;
      this.save.bestWave = Math.max(this.save.bestWave, this.waveN);
      saveData(this.save);
      // A boss kill closes its wave (5 or 10) — count it for the milestone
      // payout. The hive queen also flips victory before BaseGame.win() runs.
      this.wavesClearedThisRun++;
      if (this.boss.kind === 'hive') this.victoryAchieved = true;

      this.flash('#ffd86b', this.boss.kind === 'hive' ? 0.7 : 0.4);
      this.shake(this.boss.kind === 'hive' ? 32 : 24, this.boss.kind === 'hive' ? 0.9 : 0.6);
      this._hitStop = this.boss.kind === 'hive' ? 0.35 : 0.15;
      this.particles.burst(CX, CY, this.boss.kind === 'hive' ? 140 : 80,
                           { color:'#ffd86b', speed: 360, life: 1.0 });
      this.sfx.play('win');

      this.boss = null;
      this.drones = [];
      this.alienBullets = [];
      this.phase = 'bossWin';
      this.bossWinTimer = 1.5;
    }

    _takeDamage() {
      if (this.shieldHp > 0) {
        this.shieldHp -= 1;
        this.shieldRegenTimer = 0;
        this.ship.invuln = 1.0;
        this.flash('#7ae0ff', 0.2);
        this.shake(6, 0.2);
        this.particles.burst(this.ship.x, this.ship.y, 24, { color:'#7ae0ff', speed: 240, life: 0.5 });
        this.sfx.play('shield');
        return;
      }
      this.sfx.play('die');
      this.shake(24, 0.6);
      this.flash('#ff3a3a', 0.3);
      this.particles.burst(this.ship.x, this.ship.y, 50, { color:'#ff5e7e', speed: 320, life: 0.8 });
      this.gameOver();
    }

    // ----- per-phase update wrappers -----
    _updateWave(dt) {
      this._updateShip(dt);          if (this.state !== 'playing') return;
      this._updateBullets(dt);
      this._updateMissiles(dt);
      this._updateRocks(dt);         if (this.state !== 'playing') return;

      if (this.rocks.length === 0) {
        let rewardMul = 1.0;
        if (this.modifier === 'dense')  rewardMul = 1.4;
        if (this.modifier === 'elite')  rewardMul = 1.5;
        if (this.modifier === 'bounty') rewardMul = 2.0;
        const reward = Math.round((5 + 2 * this.waveN) * rewardMul);
        Storage.addGameWallet('asteroids', reward);
        this.lastReward = reward;
        this.addScore(50 + 50 * this.waveN);
        this.save.bestWave = Math.max(this.save.bestWave, this.waveN);
        saveData(this.save);
        this.wavesClearedThisRun++;
        this.phase = 'between';
        this.betweenTimer = 1.4;
        this.flash('#4ade80', 0.2);
        this.sfx.play('win');
      }
      this._refreshHud();
    }

    _updateBoss(dt) {
      this._updateShip(dt);          if (this.state !== 'playing') return;
      this._updateBullets(dt);
      this._updateMissiles(dt);
      this._updateRocks(dt);         if (this.state !== 'playing') return;
      this._updateDrones(dt);        if (this.state !== 'playing') return;
      this._updateAlienBullets(dt);  if (this.state !== 'playing') return;
      this._updateBossLogic(dt);
      this._refreshHud();
    }

    _updateBetween(dt) {
      this.betweenTimer -= dt;
      if (this.betweenTimer <= 0) {
        // If this wave ended a sector, open map choice (which flows into
        // sectorIntro → startWave). Otherwise drop into the upgrade shop.
        if (isSectorEnd(this.waveN) && this._maybeOpenMapChoice()) return;
        this.phase = 'shop';
      }
      this._refreshHud();
    }

    _updateBossWin(dt) {
      this.bossWinTimer -= dt;
      if (this.bossWinTimer <= 0) {
        if (this.waveN >= TOTAL_WAVES) {
          this.phase = 'victory';
          this.victoryTimer = 0;
        } else {
          // Boss at wave 5 = end of sector 3 → map choice.
          if (isSectorEnd(this.waveN) && this._maybeOpenMapChoice()) return;
          this.phase = 'shop';
        }
      }
      this._refreshHud();
    }

    _updateVictory(dt) {
      this.victoryTimer = (this.victoryTimer || 0) + dt;
      if (this.victoryTimer > 1.5 && Input.mouse.justPressed) {
        Input.mouse.justPressed = false;
        this.win();
      }
    }

    // ----- shop -----
    _updateShop() {
      this._refreshHud();
      if (!Input.mouse.justPressed) return;
      Input.mouse.justPressed = false;
      const mx = Input.mouse.x, my = Input.mouse.y;
      for (const r of this.shopRects) {
        if (mx < r.x || mx > r.x + r.w || my < r.y || my > r.y + r.h) continue;
        if (r.kind === 'continue') { this._startWave(this.waveN + 1); return; }
        if (r.kind === 'upgrade') {
          const u = r.upgrade;
          if (this.upgrades[u.id]) return;
          const cost = this._costFor(u);
          if (!Storage.spendGameWallet('asteroids', cost)) return;
          this.upgrades[u.id] = true;
          this.save.perksUnlocked[u.id] = true;
          saveData(this.save);
          if (u.id === 'shield') this.shieldHp = 1;
          this.sfx.play('buy');
          this.particles.burst(r.x + r.w / 2, r.y + r.h / 2, 18,
                               { color:'#ffd86b', speed: 200, life: 0.6 });
        }
        return;
      }
    }

    _costFor(u) {
      return this.save.perksUnlocked[u.id] ? Math.max(1, Math.round(u.cost / 2)) : u.cost;
    }

    // ======================================================================
    // RENDER — phase dispatch
    render(ctx) {
      this._drawBackdrop(ctx);
      this._drawStars(ctx);
      if (this.phase === 'intro')       return this._renderIntro(ctx);
      if (this.phase === 'shop')        return this._renderShop(ctx);
      if (this.phase === 'victory')     return this._renderVictory(ctx);
      if (this.phase === 'mapChoice')   return this._renderMapChoice(ctx);
      if (this.phase === 'sectorIntro') return this._renderSectorIntro(ctx);

      this._drawWorld(ctx);
      if (this.phase === 'between') this._renderBetweenOverlay(ctx);
      if (this.phase === 'bossWin') this._renderBossWinOverlay(ctx);
      if (this.phase === 'boss' && this.bossAnnounceT > 0) this._renderBossAnnounce(ctx);
    }

    _drawBackdrop(ctx) {
      const biome = this.biome || BIOMES.frontier;
      const g = ctx.createRadialGradient(CX, CY, 100, CX, CY, 720);
      g.addColorStop(0, biome.bg1); g.addColorStop(1, biome.bg2);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }

    _drawStars(ctx) {
      const biome = this.biome || BIOMES.frontier;
      const sc = biome.star;
      // Parse rgb-ish once: use hex → simple channel tint
      for (const s of this.stars) {
        const a = 0.3 + 0.6 * Math.abs(Math.sin(s.tw));
        ctx.fillStyle = `rgba(${hex2rgb(sc)}, ${a})`;
        ctx.fillRect(s.x, s.y, 1, 1);
      }
    }

    _renderMapChoice(ctx) {
      ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#ffd86b';
      ctx.font = 'bold 34px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.shadowColor = '#ffd86b'; ctx.shadowBlur = 16;
      ctx.fillText('CHOOSE YOUR PATH', CX, 60);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#cfe9ff'; ctx.font = '14px ui-monospace, monospace';
      ctx.fillText('Sector ' + (this.mapCards[0].nextSec) + ' of 5', CX, 106);

      this.mapRects = [];
      const cards = this.mapCards;
      const cw = 220, ch = 310, gap = 30;
      const totalW = cards.length * cw + (cards.length - 1) * gap;
      const startX = CX - totalW / 2;
      const y = 150;
      for (let i = 0; i < cards.length; i++) {
        const c = cards[i];
        const rx = startX + i * (cw + gap);
        ctx.fillStyle = '#0a0818';
        ctx.fillRect(rx, y, cw, ch);
        ctx.strokeStyle = c.biome.accent;
        ctx.lineWidth = 2;
        ctx.strokeRect(rx + 1, y + 1, cw - 2, ch - 2);
        // Biome preview window
        const prevH = 110;
        const pg = ctx.createLinearGradient(rx + 10, y + 40, rx + 10, y + 40 + prevH);
        pg.addColorStop(0, c.biome.bg1); pg.addColorStop(1, c.biome.bg2);
        ctx.fillStyle = pg;
        ctx.fillRect(rx + 10, y + 40, cw - 20, prevH);
        // Stars
        for (let j = 0; j < 30; j++) {
          const sx = rx + 10 + ((j * 41) % (cw - 20));
          const sy = y + 40 + ((j * 67 + this.time * 20) % prevH);
          ctx.fillStyle = `rgba(${hex2rgb(c.biome.star)}, ${j % 3 === 0 ? 0.9 : 0.5})`;
          ctx.fillRect(sx, sy, 1, 1);
        }
        // Biome name
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillStyle = c.biome.accent;
        ctx.font = 'bold 19px ui-monospace, monospace';
        ctx.fillText(c.biome.name, rx + cw / 2, y + 160);
        // Modifier
        const m = MODIFIERS[c.modifier];
        ctx.fillStyle = c.modifier === 'none' ? '#cde' : '#fc6';
        ctx.font = 'bold 14px ui-monospace, monospace';
        ctx.fillText('[' + m.name + ']', rx + cw / 2, y + 196);
        ctx.fillStyle = '#a58abd';
        ctx.font = '12px ui-monospace, monospace';
        wrapText(ctx, m.desc || '—', rx + cw / 2, y + 220, cw - 20, 15);
        // Hover highlight
        const hover = Input.mouse.x >= rx && Input.mouse.x <= rx + cw &&
                      Input.mouse.y >= y && Input.mouse.y <= y + ch;
        if (hover) {
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
          ctx.strokeRect(rx + 1, y + 1, cw - 2, ch - 2);
        }
        this.mapRects.push({ x: rx, y, w: cw, h: ch, i });
      }
    }

    _renderSectorIntro(ctx) {
      const a = Math.min(1, this.sectorIntroT / 1.8);
      const slide = 1 - Math.pow(a, 2);
      const y = CY - slide * 40;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = this.biome.accent;
      ctx.font = 'bold 30px ui-monospace, monospace';
      ctx.shadowColor = this.biome.accent; ctx.shadowBlur = 18;
      const label = this.sector === 5 ? '\u2668  FINAL SECTOR  \u2668' : 'SECTOR ' + this.sector + ' / 5';
      ctx.fillText(label, CX, y - 40);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 48px ui-monospace, monospace';
      ctx.fillText(this.biome.name, CX, y + 10);
      ctx.shadowBlur = 0;
      if (this.modifier !== 'none') {
        ctx.fillStyle = '#fc6';
        ctx.font = 'bold 18px ui-monospace, monospace';
        const m = MODIFIERS[this.modifier];
        ctx.fillText('[' + m.name + ']  ' + m.desc, CX, y + 60);
      }
    }

    _drawWorld(ctx) {
      this._drawRocks(ctx);
      this._drawBoss(ctx);
      this._drawDrones(ctx);
      this._drawAlienBullets(ctx);
      this._drawBullets(ctx);
      this._drawMissiles(ctx);
      this._drawShip(ctx);
      this._drawShield(ctx);
      this._drawPlayerDrone(ctx);
      this._drawHudExtras(ctx);
    }

    _drawPlayerDrone(ctx) {
      const d = this.playerDrone;
      if (!d || !this.upgrades.drone) return;
      ctx.save();
      ctx.translate(d.x || this.ship.x, d.y || this.ship.y);
      ctx.rotate(d.ang);
      ctx.fillStyle = '#7ae0ff';
      ctx.strokeStyle = '#cfeffd'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(7, 0); ctx.lineTo(-5, 5); ctx.lineTo(-2, 0); ctx.lineTo(-5, -5);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
      // orbit ring
      ctx.strokeStyle = 'rgba(122,224,255,0.18)';
      ctx.beginPath(); ctx.arc(this.ship.x, this.ship.y, d.r, 0, Math.PI * 2); ctx.stroke();
    }

    _drawRocks(ctx) {
      for (const r of this.rocks) {
        ctx.save();
        ctx.translate(r.x, r.y);
        ctx.rotate(r.rot);
        ctx.shadowColor = '#7cd9ff'; ctx.shadowBlur = 8;
        ctx.strokeStyle = '#e7ecf3';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < r.verts.length; i++) {
          const v = r.verts[i];
          const px = Math.cos(v.a) * v.r;
          const py = Math.sin(v.a) * v.r;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }
    }

    _drawDrones(ctx) {
      for (const d of this.drones) {
        const rot = Math.atan2(d.vy, d.vx);
        Sprites.draw(ctx, 'aster.drone_hunter', d.x, d.y, 50, 50, {
          rot,
          fallback: () => {
            ctx.save();
            ctx.fillStyle = '#ff5e7e';
            ctx.beginPath(); ctx.arc(d.x, d.y, 16, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
          }
        });
      }
    }

    _drawBoss(ctx) {
      const b = this.boss; if (!b) return;
      if (b.kind === 'swarm') {
        const flash = b.hitFlash > 0;
        Sprites.draw(ctx, 'aster.boss_swarm_lord', b.x, b.y, 220, 220, {
          alpha: flash ? 0.6 : 1,
          fallback: () => {
            ctx.fillStyle = '#7a3ad3';
            ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
          }
        });
        if (flash) {
          ctx.fillStyle = 'rgba(255,80,80,0.45)';
          ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 6, 0, Math.PI * 2); ctx.fill();
        }
        this._drawBossHpBar(ctx, b, 130, 90);
      } else {
        const list = b.split && b.minis ? b.minis : [b];
        const size = b.split ? 160 : 220;
        for (const q of list) this._drawHive(ctx, q, size);
      }
    }

    _drawHive(ctx, q, size) {
      const flash = q.hitFlash > 0;
      Sprites.draw(ctx, 'aster.boss_hive_queen', q.x, q.y, size, size, {
        alpha: flash ? 0.6 : 1,
        fallback: () => {
          ctx.fillStyle = '#5a2a8a';
          ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2); ctx.fill();
        }
      });
      if (flash) {
        ctx.fillStyle = 'rgba(255,80,80,0.45)';
        ctx.beginPath(); ctx.arc(q.x, q.y, q.r + 6, 0, Math.PI * 2); ctx.fill();
      }
      // Weak point — rotating glowing pip
      const wx = q.x + Math.cos(q.weakAng) * q.weakDist;
      const wy = q.y + Math.sin(q.weakAng) * q.weakDist;
      ctx.save();
      ctx.shadowColor = '#ffd86b'; ctx.shadowBlur = 18;
      ctx.fillStyle = '#ffd86b';
      ctx.beginPath(); ctx.arc(wx, wy, q.weakR, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
      // hint arc showing the weak point's orbit
      ctx.save();
      ctx.strokeStyle = 'rgba(255,216,107,0.18)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(q.x, q.y, q.weakDist, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      this._drawBossHpBar(ctx, q, q.r * 1.6, q.r + 24);
    }

    _drawBossHpBar(ctx, b, w, dy) {
      const x = b.x - w / 2, y = b.y - dy;
      ctx.fillStyle = '#000';
      ctx.fillRect(x, y, w, 6);
      ctx.fillStyle = '#ff5e7e';
      ctx.fillRect(x, y, w * (b.hp / b.maxHp), 6);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
      ctx.strokeRect(x, y, w, 6);
    }

    _drawBullets(ctx) {
      for (const b of this.bullets) {
        ctx.save();
        ctx.shadowColor = '#ffd86b'; ctx.shadowBlur = 12;
        ctx.fillStyle = '#ffd86b';
        ctx.beginPath(); ctx.arc(b.x, b.y, 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }

    _drawAlienBullets(ctx) {
      for (const b of this.alienBullets) {
        Sprites.draw(ctx, 'aster.alien_bullet', b.x, b.y, 18, 18, {
          rot: Math.atan2(b.vy, b.vx),
          fallback: () => {
            ctx.fillStyle = '#ff5e7e';
            ctx.beginPath(); ctx.arc(b.x, b.y, 5, 0, Math.PI * 2); ctx.fill();
          }
        });
      }
    }

    _drawMissiles(ctx) {
      for (const m of this.missiles) {
        Sprites.draw(ctx, 'aster.missile', m.x, m.y, 36, 12, {
          rot: m.ang,
          fallback: () => {
            ctx.save();
            ctx.translate(m.x, m.y); ctx.rotate(m.ang);
            ctx.fillStyle = '#cfe9ff';
            ctx.fillRect(-12, -3, 24, 6);
            ctx.fillStyle = '#ff8c3a';
            ctx.fillRect(-18, -2, 6, 4);
            ctx.restore();
          }
        });
      }
    }

    _drawShip(ctx) {
      const ship = this.ship;
      const blink = ship.invuln > 0 && (((ship.invuln * 12) | 0) % 2 === 0);
      if (blink) return;
      const upgraded = this.upgrades.rapidfire || this.upgrades.twin
                    || this.upgrades.shield   || this.upgrades.missile;
      const base = upgraded ? 'aster.ship_upgraded' : 'aster.ship_basic';
      const key = base + (ship.thrusting ? '_flame' : '');
      Sprites.draw(ctx, key, ship.x, ship.y, 60, 60, {
        rot: ship.ang,
        fallback: () => {
          ctx.save();
          ctx.translate(ship.x, ship.y); ctx.rotate(ship.ang);
          ctx.shadowColor = '#7cd9ff'; ctx.shadowBlur = 10;
          ctx.strokeStyle = '#e7ecf3'; ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(14, 0); ctx.lineTo(-10, 9);
          ctx.lineTo(-6, 0); ctx.lineTo(-10, -9);
          ctx.closePath(); ctx.stroke();
          ctx.restore();
        }
      });
    }

    _drawShield(ctx) {
      if (this.shieldHp <= 0) return;
      const ship = this.ship;
      ctx.save();
      ctx.strokeStyle = `rgba(122,224,255,${0.5 + 0.3 * Math.sin(this.time * 4)})`;
      ctx.lineWidth = 2;
      ctx.shadowColor = '#7ae0ff'; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(ship.x, ship.y, 30, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    _drawHudExtras(ctx) {
      // bottom-left status: shield + missile readiness
      ctx.font = '11px ui-monospace, monospace';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      let y = H - 24;
      if (this.upgrades.shield) {
        ctx.fillStyle = this.shieldHp > 0 ? '#7ae0ff' : '#3a4a60';
        const txt = this.shieldHp > 0
          ? 'SHIELD READY'
          : 'SHIELD ' + Math.max(0, SHIELD_REGEN - this.shieldRegenTimer).toFixed(1) + 's';
        ctx.fillText(txt, 16, y);
        y -= 16;
      }
      if (this.upgrades.missile) {
        ctx.fillStyle = this.missileCD <= 0 ? '#ff8c3a' : '#5a4030';
        const txt = this.missileCD <= 0
          ? 'MISSILE [X] READY'
          : 'MISSILE [X] ' + this.missileCD.toFixed(1) + 's';
        ctx.fillText(txt, 16, y);
      }
      // owned-upgrade chips top-right of canvas
      const owned = UPGRADES.filter(u => this.upgrades[u.id]);
      let xR = W - 24;
      for (let i = owned.length - 1; i >= 0; i--) {
        Sprites.draw(ctx, owned[i].sprite, xR, 28, 28, 28);
        xR -= 34;
      }
    }

    // ----- splash / overlay renders -----
    _renderIntro(ctx) {
      ctx.fillStyle = '#7cd9ff';
      ctx.font = 'bold 42px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = '#7cd9ff'; ctx.shadowBlur = 18;
      ctx.fillText('ASTEROIDS · CAMPAIGN', CX, 130);
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#cfe9ff'; ctx.font = '15px ui-monospace, monospace';
      ctx.fillText('10 waves · Swarm Lord at 5 · Hive Queen at 10', CX, 178);
      ctx.fillText(`Best wave so far: ${this.save.bestWave}/${TOTAL_WAVES}`
        + (this.save.defeatedHive ? '   ·   HIVE QUEEN DEFEATED' : ''), CX, 204);

      // Ship preview, rotated to point upward like in-game start orientation.
      Sprites.draw(ctx, this._anyUnlocked() ? 'aster.ship_upgraded' : 'aster.ship_basic',
                   CX, 320, 110, 110, { rot: -Math.PI / 2 });

      ctx.fillStyle = '#7a90b0'; ctx.font = '13px ui-monospace, monospace';
      ctx.fillText('A D rotate · W thrust · SPACE fire · X missile (when owned)', CX, 420);

      ctx.fillStyle = '#fff'; ctx.font = 'bold 18px ui-monospace, monospace';
      ctx.fillText('Click to launch', CX, 478);

      const unlocked = UPGRADES.filter(u => this.save.perksUnlocked[u.id]);
      if (unlocked.length) {
        ctx.fillStyle = '#ffd86b'; ctx.font = '12px ui-monospace, monospace';
        ctx.fillText('Half-price next purchase: ' + unlocked.map(u => u.name).join(' · '),
                     CX, 510);
      }
    }

    _anyUnlocked() {
      return UPGRADES.some(u => this.save.perksUnlocked[u.id]);
    }

    _renderBetweenOverlay(ctx) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#4ade80';
      ctx.font = 'bold 36px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = '#4ade80'; ctx.shadowBlur = 14;
      ctx.fillText(`WAVE ${this.waveN} CLEARED`, CX, CY - 20);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffd86b'; ctx.font = '18px ui-monospace, monospace';
      ctx.fillText(`+${this.lastReward} coins`, CX, CY + 20);
    }

    _renderBossWinOverlay(ctx) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#ffd86b';
      ctx.font = 'bold 44px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = '#ffd86b'; ctx.shadowBlur = 18;
      ctx.fillText('BOSS DOWN', CX, CY - 20);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff'; ctx.font = '18px ui-monospace, monospace';
      ctx.fillText(`+${this.lastReward} coins`, CX, CY + 24);
    }

    _renderBossAnnounce(ctx) {
      const a = Math.min(1, this.bossAnnounceT / 1.5);
      ctx.globalAlpha = a;
      ctx.fillStyle = '#ff5e7e';
      ctx.font = 'bold 56px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = '#ff5e7e'; ctx.shadowBlur = 22;
      const label = this.boss && this.boss.kind === 'swarm' ? 'SWARM LORD' : 'HIVE QUEEN';
      ctx.fillText(label, CX, 80);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff'; ctx.font = '14px ui-monospace, monospace';
      ctx.fillText(this.boss && this.boss.kind === 'swarm'
        ? 'Defeat the lord · drones spawn · dash incoming'
        : 'Hit the rotating golden weak point · she splits at half HP',
        CX, 116);
      ctx.globalAlpha = 1;
    }

    _renderShop(ctx) {
      ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#7cd9ff';
      ctx.font = 'bold 32px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = '#7cd9ff'; ctx.shadowBlur = 14;
      ctx.fillText('UPGRADE BAY', CX, 80);
      ctx.shadowBlur = 0;

      const next = Math.min(TOTAL_WAVES, this.waveN + 1);
      ctx.fillStyle = '#cfe9ff'; ctx.font = '14px ui-monospace, monospace';
      ctx.fillText(`Wave ${this.waveN}/${TOTAL_WAVES} cleared · prepping for Wave ${next}`,
                   CX, 110);
      ctx.fillStyle = '#ffd86b'; ctx.font = '16px ui-monospace, monospace';
      ctx.fillText('Bay credits: ● ' + Storage.getGameWallet('asteroids'), CX, 138);

      this.shopRects = [];
      const cardW = 180, cardH = 220, gap = 18;
      const totalW = cardW * UPGRADES.length + gap * (UPGRADES.length - 1);
      const startX = CX - totalW / 2;
      const y = 175;
      UPGRADES.forEach((u, i) => {
        const x = startX + i * (cardW + gap);
        const owned = this.upgrades[u.id];
        const cost = this._costFor(u);
        const broke = !owned && Storage.getGameWallet('asteroids') < cost;
        const halfPrice = !owned && this.save.perksUnlocked[u.id];

        this.shopRects.push({ x, y, w: cardW, h: cardH, kind:'upgrade', upgrade: u });

        ctx.fillStyle = owned ? '#0f2a30' : '#0a1428';
        ctx.fillRect(x, y, cardW, cardH);
        ctx.strokeStyle = owned ? '#4ade80' : (broke ? '#5a3424' : '#7cd9ff');
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, cardW, cardH);

        ctx.fillStyle = '#7cd9ff';
        ctx.font = 'bold 15px ui-monospace, monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(u.name, x + cardW / 2, y + 14);

        Sprites.draw(ctx, u.sprite, x + cardW / 2, y + 80, 64, 64, {
          fallback: () => {
            ctx.fillStyle = '#163a52';
            ctx.fillRect(x + cardW / 2 - 32, y + 48, 64, 64);
          }
        });

        ctx.fillStyle = '#cfe9ff';
        ctx.font = '11px ui-monospace, monospace';
        wrapText(ctx, u.desc, x + cardW / 2, y + 130, cardW - 16, 14);

        ctx.fillStyle = owned ? '#4ade80' : (broke ? '#f87171' : '#ffd86b');
        ctx.font = 'bold 14px ui-monospace, monospace';
        const label = owned ? 'EQUIPPED' : ('● ' + cost + (halfPrice ? '  (½)' : ''));
        ctx.fillText(label, x + cardW / 2, y + cardH - 28);
      });

      const cw = 300, chh = 50;
      const bx = CX - cw / 2, by = 460;
      this.shopRects.push({ x: bx, y: by, w: cw, h: chh, kind:'continue' });
      const isBossNext = next === 5 || next === 10;
      ctx.fillStyle = isBossNext ? '#3a0e1c' : '#0a3a1a';
      ctx.fillRect(bx, by, cw, chh);
      ctx.strokeStyle = isBossNext ? '#ff5e7e' : '#4ade80';
      ctx.lineWidth = 2;
      ctx.strokeRect(bx, by, cw, chh);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 16px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(isBossNext ? `LAUNCH WAVE ${next} · BOSS` : `LAUNCH WAVE ${next}`,
                   CX, by + chh / 2);
    }

    _renderVictory(ctx) {
      ctx.fillStyle = '#ffd86b';
      ctx.font = 'bold 54px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = '#ffd86b'; ctx.shadowBlur = 22;
      ctx.fillText('HIVE DESTROYED', CX, 160);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#cfe9ff'; ctx.font = '16px ui-monospace, monospace';
      ctx.fillText('All 5 sectors cleared \u00b7 the swarm is silenced.', CX, 210);

      // Run summary box
      const bw = 440, bh = 170;
      const bx = CX - bw / 2, by = 250;
      ctx.fillStyle = 'rgba(10,20,40,0.7)';
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = '#7cd9ff'; ctx.lineWidth = 1;
      ctx.strokeRect(bx + 0.5, by + 0.5, bw, bh);
      ctx.fillStyle = '#fff';
      ctx.font = '16px ui-monospace, monospace';
      ctx.textAlign = 'left';
      const sx = bx + 30;
      ctx.fillText('Score:',   sx, by + 38);
      ctx.fillText('Waves:',   sx, by + 68);
      ctx.fillText('Bay:',     sx, by + 98);
      ctx.fillText('Upgrades:',sx, by + 128);
      ctx.textAlign = 'right';
      const ex = bx + bw - 30;
      ctx.fillStyle = '#ffd86b';
      ctx.fillText(String(this.score),                     ex, by + 38);
      ctx.fillText(this.wavesClearedThisRun + '/' + TOTAL_WAVES, ex, by + 68);
      ctx.fillText('\u25CF ' + Storage.getGameWallet('asteroids'), ex, by + 98);
      const ownedCount = UPGRADES.filter(u => this.upgrades[u.id]).length;
      ctx.fillText(ownedCount + ' / ' + UPGRADES.length,   ex, by + 128);

      if (this.victoryTimer > 1.5) {
        ctx.fillStyle = '#7cd9ff'; ctx.font = '14px ui-monospace, monospace';
        ctx.textAlign = 'center';
        const blink = Math.sin(this.victoryTimer * 4) > 0 ? 1 : 0.4;
        ctx.globalAlpha = blink;
        ctx.fillText('click to return to arcade', CX, by + bh + 40);
        ctx.globalAlpha = 1;
      }
    }
  }

  // -----------------------------------------------------------------------
  function wrap(v, max) {
    if (v < 0) return v + max;
    if (v >= max) return v - max;
    return v;
  }

  function hex2rgb(hex) {
    const h = hex.replace('#', '');
    if (h.length === 3) {
      const r = parseInt(h[0] + h[0], 16);
      const g = parseInt(h[1] + h[1], 16);
      const b = parseInt(h[2] + h[2], 16);
      return r + ',' + g + ',' + b;
    }
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return r + ',' + g + ',' + b;
  }

  function wrapText(ctx, text, cx, y, maxW, lineH) {
    const words = text.split(' ');
    let line = '', yy = y;
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

  NDP.attachGame('asteroids', AsteroidsGame);
})();
