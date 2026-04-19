(function () {
  const NDP = window.NDP;
  const { Input, Draw, Storage, TAU, Assets } = NDP.Engine;

  const W = 960, H = 600;
  const FLOOR_Y = H - 40;

  // ----------------------------------------------------------------
  // WEAPONS — base stats; tiers 0..3 add damage/rate/pierce bonuses
  // ----------------------------------------------------------------
  const WEAPONS = [
    { id: 'pistol',   name: 'Pistol',       cost: 0,   rate: 0.28, spread: 0.02, dmg: 14, speed: 680, auto: false, coinCost: 0,  color: '#ffee99' },
    { id: 'uzi',      name: 'Uzi',          cost: 40,  rate: 0.07, spread: 0.12, dmg: 8,  speed: 720, auto: true,  coinCost: 1,  color: '#ffd86b' },
    { id: 'shotgun',  name: 'CoinShotgun',  cost: 80,  rate: 0.55, spread: 0.38, dmg: 10, speed: 640, auto: false, coinCost: 5,  color: '#ffb347', pellets: 7 },
    { id: 'magnet',   name: 'Magnet Gun',   cost: 120, rate: 0.22, spread: 0.0,  dmg: 6,  speed: 560, auto: true,  coinCost: 0,  color: '#88e8ff', magnet: true },
    { id: 'auditor',  name: 'Tax Auditor',  cost: 220, rate: 0.9,  spread: 0.0,  dmg: 42, speed: 1400,auto: false, coinCost: 8,  color: '#ff4fd8', pierce: true }
  ];
  const TIER_COSTS = [0, 25, 55, 110];            // cost to buy tier N (tier 0 = default)
  const TIER_DMG_MULT = [1.0, 1.25, 1.55, 2.0];
  const TIER_RATE_MULT = [1.0, 0.88, 0.78, 0.65];

  const MUTATIONS = [
    { id: 'cannon',  name: 'Cannon Arm',  icon: 'C' },
    { id: 'turret',  name: 'Turret',      icon: 'T' },
    { id: 'armor',   name: 'Armor+',      icon: 'A' },
    { id: 'eater',   name: 'Coin-Eater',  icon: 'E' },
    { id: 'stomp',   name: 'Stomp Slam',  icon: 'S' }
  ];

  // ----------------------------------------------------------------
  // VAULT CAMPAIGN — 7 levels, scaling HP/plates/mutation pace
  // ----------------------------------------------------------------
  const VAULTS = [
    { n: 1, title: 'THE TIN SAFE',   hp: 400,  plateHp: 35, mutPace: 16, color: '#8a6e50' },
    { n: 2, title: 'THE FOUNDRY',    hp: 650,  plateHp: 55, mutPace: 14, color: '#b88850' },
    { n: 3, title: 'THE COUNTING',   hp: 900,  plateHp: 70, mutPace: 12, color: '#c29560' },
    { n: 4, title: 'GILDED CELL',    hp: 1200, plateHp: 85, mutPace: 11, color: '#d9a856' },
    { n: 5, title: 'STEEL CATHEDRAL',hp: 1600, plateHp: 105,mutPace: 10, color: '#89c2e3' },
    { n: 6, title: 'THE OBSIDIAN',   hp: 2100, plateHp: 125,mutPace: 9,  color: '#6b5b8c' },
    { n: 7, title: 'CORE OF AVARICE',hp: 2800, plateHp: 150,mutPace: 8,  color: '#ff4fd8', boss: true }
  ];

  function tierOf(save, id) { return (save.weaponTiers && save.weaponTiers[id]) || 0; }
  function weaponStats(save, w) {
    const t = tierOf(save, w.id);
    return Object.assign({}, w, {
      dmg: w.dmg * TIER_DMG_MULT[t],
      rate: w.rate * TIER_RATE_MULT[t],
      tier: t
    });
  }

  // ----------------------------------------------------------------
  class VaultbreakerGame extends NDP.Engine.BaseGame {
    constructor(canvas, manifest) {
      super(canvas, manifest);
      this.sfx = this.makeSfx({
        shoot:  { freq: 720, dur: 0.05, type: 'square',   vol: 0.05, slide: -240 },
        hit:    { freq: 300, dur: 0.07, type: 'sawtooth', vol: 0.08, slide: -120 },
        plate:  { freq: 180, dur: 0.14, type: 'triangle', vol: 0.12, slide: -90  },
        coin:   { freq: 920, dur: 0.06, type: 'sine',     vol: 0.09 },
        hurt:   { freq: 160, dur: 0.18, type: 'square',   vol: 0.1,  slide: -80 },
        buy:    { freq: 1100,dur: 0.10, type: 'square',   vol: 0.08 },
        mutate: { freq: 90,  dur: 0.30, type: 'sawtooth', vol: 0.12, slide: -50 },
        win:    { freq: 440, dur: 0.35, type: 'square',   vol: 0.12 },
        lvlup:  { freq: 660, dur: 0.25, type: 'square',   vol: 0.10, slide: 180 }
      });
    }

    _loadSave() {
      const d = Storage.getGameData('vaultbreaker') || {};
      return {
        bestLevel:       d.bestLevel || 0,
        unlockedWeapons: Array.isArray(d.unlockedWeapons) ? d.unlockedWeapons.slice() : ['pistol'],
        weaponTiers:     Object.assign({}, d.weaponTiers || {}),
        maxHpBought:     d.maxHpBought || 0,
        magnetTier:      d.magnetTier || 0,
        // Per-game persistent wallet. Carries between runs of vaultbreaker
        // only; never crosses with the global theme-shop coins.
        coinsHeld:       d.coinsHeld || 0
      };
    }
    _writeSave() {
      Storage.setGameData('vaultbreaker', {
        bestLevel: this.save.bestLevel,
        unlockedWeapons: this.save.unlockedWeapons,
        weaponTiers: this.save.weaponTiers,
        maxHpBought: this.save.maxHpBought,
        magnetTier: this.save.magnetTier,
        coinsHeld: this.coinsHeld | 0
      });
    }

    init() {
      this.save = this._loadSave();

      this.level = 1;
      this.phase = 'intro';   // 'intro' | 'fight' | 'intermission' | 'victory'
      this.phaseT = 0;

      const baseHp = 100 + this.save.maxHpBought * 25;
      this.player = {
        x: W / 2, y: FLOOR_Y - 20, w: 20, h: 30,
        hp: baseHp, maxHp: baseHp,
        vx: 0, speed: 260,
        aimA: -Math.PI / 2,
        iframe: 0,
        cooldown: 0,
        weaponIdx: 0,
        owned: new Set(this.save.unlockedWeapons),
        walkT: 0
      };
      // ensure weaponIdx is owned
      this._clampWeaponIdx();

      // Coins persist between runs in our own wallet. The first time you
      // play this is 0; after a death it's whatever you had banked.
      this.coinsHeld = this.save.coinsHeld | 0;
      this.campaignCoins = 0; // earned during this run only (for HUD/end stats)
      this.levelsClearedThisRun = 0;
      this.victoryAchieved = false;

      this._startLevel(1);
    }

    _clampWeaponIdx() {
      for (let i = 0; i < WEAPONS.length; i++) {
        if (this.player.owned.has(WEAPONS[i].id)) { this.player.weaponIdx = i; return; }
      }
      this.player.weaponIdx = 0;
    }

    _startLevel(n) {
      this.level = n;
      this.phase = 'intro';
      this.phaseT = 2.4;

      this.vault = this._makeVault(n);
      this.bullets = [];
      this.coins = [];
      this.pickups = [];
      this.enemies = [];
      this.shockwaves = [];

      this.mutateT = VAULTS[n - 1].mutPace + 6;
      this.queuedMutation = this._pickMutation();
      this.queueIconHp = 30 + n * 6;
      this.stompT = 0;
      this.bossPhase2 = false;

      this.player.x = W / 2;
      this.player.iframe = 0;
      // heal 30% between levels
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + Math.floor(this.player.maxHp * 0.3));

      this._updateHud();
    }

    _makeVault(level) {
      const cfg = VAULTS[level - 1];
      const vw = 420, vh = 170;
      const x = (W - vw) / 2, y = 50;
      const plates = [];
      const cols = 3, rows = 2;
      const pw = vw / cols - 12, ph = vh / rows - 12;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          plates.push({
            x: x + 6 + c * (pw + 12) + pw / 2,
            y: y + 6 + r * (ph + 12) + ph / 2,
            w: pw, h: ph,
            hp: cfg.plateHp, maxHp: cfg.plateHp, alive: true, respawn: 0,
            flash: 0
          });
        }
      }
      return {
        x, y, w: vw, h: vh,
        hp: cfg.hp, maxHp: cfg.hp,
        plates,
        arms: [],
        eater: false, eaterT: 0,
        shakeOffset: 0,
        fireT: 1.5,
        shakeT: 0,
        bodyColor: cfg.color,
        isBoss: !!cfg.boss,
        level: level
      };
    }

    _pickMutation() {
      return MUTATIONS[(Math.random() * MUTATIONS.length) | 0];
    }

    _updateHud() {
      const w = this._currentWeapon();
      const hp = Math.max(0, this.player.hp | 0);
      const vhp = Math.max(0, this.vault.hp | 0);
      this.setHud(
        `<b style="color:#ffcc33">V${this.level}/7</b> &middot; ` +
        `<b style="color:#ff9d9d">HP ${hp}</b> &middot; ` +
        `<b style="color:#ffcc33">&#9679; ${this.coinsHeld}</b> &middot; ` +
        `${w.name}${w.tier ? ' T'+w.tier : ''}${w.coinCost ? ' ('+w.coinCost+'/shot)' : ''} &middot; ` +
        `<span style="color:#ff7755">VAULT ${vhp}</span>`
      );
    }

    _currentWeapon() {
      return weaponStats(this.save, WEAPONS[this.player.weaponIdx]);
    }

    onInput(ev) {}

    // ----------------------------------------------------------------
    // UPDATE — dispatch by phase
    // ----------------------------------------------------------------
    update(dt) {
      if (this.phase === 'intro') { this._updateIntro(dt); return; }
      if (this.phase === 'intermission') { this._updateIntermission(dt); return; }
      if (this.phase === 'victory') { return; }

      // === FIGHT ===
      this._updatePlayer(dt);
      this._updateBullets(dt);
      this._updateCoins(dt);
      this._updatePickups(dt);
      this._updateVault(dt);
      this._updateEnemies(dt);
      this._updateShock(dt);

      // weapon swap 1-5
      for (let i = 1; i <= 5; i++) {
        if (Input.keys[String(i)]) {
          const w = WEAPONS[i - 1];
          if (this.player.owned.has(w.id)) this.player.weaponIdx = i - 1;
          Input.keys[String(i)] = false;
        }
      }

      // lose
      if (this.player.hp <= 0) {
        this.sfx.play('hurt'); this.flash('#ff3344', 0.4);
        this._persistOnEnd(false);
        this.gameOver();
        return;
      }
      // vault down → advance or win
      if (this.vault.hp <= 0) {
        this.addScore(500 + this.player.hp * 5 + this.level * 200);
        this.sfx.play('win'); this.flash('#ffcc33', 0.5);
        this.shake(20, 0.8);
        this.levelsClearedThisRun++;
        if (this.level >= 7) {
          this.phase = 'victory';
          this.victoryAchieved = true;
          this._persistOnEnd(true);
          setTimeout(() => this.win(), 1200);
        } else {
          this.phase = 'intermission';
          this.phaseT = 0;
          this._buildShop();
          // Checkpoint coins so a refresh mid-shop doesn't lose them.
          this._writeSave();
          this.sfx.play('lvlup');
        }
        return;
      }

      // boss phase-2 trigger
      if (this.vault.isBoss && !this.bossPhase2 && this.vault.hp <= this.vault.maxHp * 0.5) {
        this.bossPhase2 = true;
        this.flash('#ff4fd8', 0.5);
        this.sfx.play('mutate');
        this.shake(16, 0.6);
        // instantly apply 2 mutations
        this._applyMutation({ id: 'cannon' });
        this._applyMutation({ id: 'cannon' });
        this._applyMutation({ id: 'stomp' });
      }

      this._updateHud();
    }

    _persistOnEnd(won) {
      if (won) {
        // Completion reward = clean-slate. Wipe weapons, tiers, max-HP,
        // magnet AND the persistent coin wallet so the next run starts
        // fresh from the pistol. This is intentional: beating the
        // campaign is the achievement; the reset is the trophy.
        Storage.clearGameData('vaultbreaker');
        // Reset our in-memory mirror so anything still drawing this frame
        // (HUD, victory card) shows post-wipe values.
        this.save = {
          bestLevel: 0,
          unlockedWeapons: ['pistol'],
          weaponTiers: {},
          maxHpBought: 0,
          magnetTier: 0,
          coinsHeld: 0
        };
        this.coinsHeld = 0;
      } else {
        this.save.bestLevel = Math.max(this.save.bestLevel, this.level - 1);
        // Persist coinsHeld + weapons/tiers/etc.
        this._writeSave();
      }
    }

    // ----------------------------------------------------------------
    // INTRO PHASE
    // ----------------------------------------------------------------
    _updateIntro(dt) {
      this.phaseT -= dt;
      if (this.phaseT <= 0 || Input.mouse.justPressed || Input.keys[' ']) {
        this.phase = 'fight';
        Input.keys[' '] = false;
      }
    }

    // ----------------------------------------------------------------
    // INTERMISSION / SHOP
    // ----------------------------------------------------------------
    _buildShop() {
      // Build list of offers (weapon unlocks + tier upgrades + utility)
      const offers = [];
      for (const w of WEAPONS) {
        if (!this.player.owned.has(w.id)) {
          offers.push({ type: 'unlock', weapon: w, cost: w.cost,
            label: 'Unlock ' + w.name, desc: w.coinCost ? (w.coinCost + ' coin/shot') : 'free to fire', color: w.color });
        } else {
          const t = tierOf(this.save, w.id);
          if (t < 3) {
            offers.push({ type: 'tier', weapon: w, cost: TIER_COSTS[t + 1],
              label: w.name + ' -> T' + (t + 1),
              desc: '+' + Math.round((TIER_DMG_MULT[t+1]/TIER_DMG_MULT[t]-1)*100) + '% dmg, faster fire',
              color: w.color });
          }
        }
      }
      offers.push({ type: 'maxhp', cost: 40, label: '+25 Max HP', desc: 'and full heal', color: '#66ff88' });
      offers.push({ type: 'heal',  cost: 15, label: 'Field Heal', desc: 'restore 60 HP', color: '#88ffbb' });
      offers.push({ type: 'magnet', cost: 35, label: 'Coin Magnet+', desc: 'bigger pickup radius', color: '#88e8ff' });

      this.shop = {
        offers,
        rects: [], // filled during draw
        hoverIdx: -1
      };
    }

    _updateIntermission(dt) {
      this.phaseT += dt;
      // handle click
      if (Input.mouse.justPressed) {
        const s = this.shop;
        for (let i = 0; i < s.rects.length; i++) {
          const r = s.rects[i];
          if (Input.mouse.x >= r.x && Input.mouse.x <= r.x + r.w &&
              Input.mouse.y >= r.y && Input.mouse.y <= r.y + r.h) {
            if (r.kind === 'continue') {
              this._startLevel(this.level + 1);
              return;
            }
            if (r.kind === 'offer') {
              this._buyOffer(s.offers[r.i]);
              this._buildShop();
              return;
            }
          }
        }
      }
      // hover
      const s = this.shop;
      s.hoverIdx = -1;
      for (let i = 0; i < s.rects.length; i++) {
        const r = s.rects[i];
        if (r.kind === 'offer' && Input.mouse.x >= r.x && Input.mouse.x <= r.x + r.w &&
            Input.mouse.y >= r.y && Input.mouse.y <= r.y + r.h) {
          s.hoverIdx = i;
        }
      }
    }

    _buyOffer(o) {
      if (this.coinsHeld < o.cost) { this.sfx.play('hurt', { freq: 120 }); return; }
      this.coinsHeld -= o.cost;
      this.sfx.play('buy');
      if (o.type === 'unlock') {
        this.player.owned.add(o.weapon.id);
        if (!this.save.unlockedWeapons.includes(o.weapon.id)) this.save.unlockedWeapons.push(o.weapon.id);
        const idx = WEAPONS.findIndex(w => w.id === o.weapon.id);
        if (idx >= 0) this.player.weaponIdx = idx;
      } else if (o.type === 'tier') {
        this.save.weaponTiers[o.weapon.id] = tierOf(this.save, o.weapon.id) + 1;
      } else if (o.type === 'maxhp') {
        this.save.maxHpBought++;
        this.player.maxHp += 25;
        this.player.hp = this.player.maxHp;
      } else if (o.type === 'heal') {
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + 60);
      } else if (o.type === 'magnet') {
        this.save.magnetTier++;
      }
      this._writeSave();
    }

    // ----------------------------------------------------------------
    // FIGHT — player/bullets/vault (mostly preserved)
    // ----------------------------------------------------------------
    _updatePlayer(dt) {
      const p = this.player;
      const k = Input.keys;
      let mx = 0;
      if (k['a'] || k['A'] || k['ArrowLeft']) mx -= 1;
      if (k['d'] || k['D'] || k['ArrowRight']) mx += 1;
      p.vx = mx * p.speed;
      p.x += p.vx * dt;
      p.x = Math.max(20, Math.min(W - 20, p.x));
      if (mx !== 0) p.walkT += dt * 10; else p.walkT *= 0.9;

      const ax = Input.mouse.x - p.x;
      const ay = Input.mouse.y - p.y;
      p.aimA = Math.atan2(ay, ax);

      if (p.iframe > 0) p.iframe -= dt;
      if (p.cooldown > 0) p.cooldown -= dt;

      const w = this._currentWeapon();
      const wantFire = w.auto ? Input.mouse.down : Input.mouse.justPressed;
      if (wantFire && p.cooldown <= 0) {
        if (w.coinCost > 0 && this.coinsHeld < w.coinCost) {
          p.cooldown = 0.15;
        } else {
          this.coinsHeld -= w.coinCost;
          this._fireWeapon(w);
          p.cooldown = w.rate;
        }
      }
    }

    _fireWeapon(w) {
      const p = this.player;
      const gx = p.x + Math.cos(p.aimA) * 18;
      const gy = p.y - 6 + Math.sin(p.aimA) * 18;
      const pellets = w.pellets || 1;
      for (let i = 0; i < pellets; i++) {
        const jitter = (Math.random() - 0.5) * 2 * w.spread + (pellets > 1 ? (i / (pellets - 1) - 0.5) * w.spread * 2 : 0);
        const a = p.aimA + jitter;
        this.bullets.push({
          x: gx, y: gy,
          vx: Math.cos(a) * w.speed,
          vy: Math.sin(a) * w.speed,
          life: 1.4,
          dmg: w.dmg,
          color: w.color,
          size: w.id === 'auditor' ? 5 : 3,
          pierce: !!w.pierce,
          magnet: !!w.magnet,
          hostile: false
        });
      }
      this.sfx.play('shoot', { freq: 500 + Math.random() * 400 });
      this.particles.burst(gx, gy, 4, {
        color: w.color, speed: 180, life: 0.2, size: 2, shape: 'circle'
      });
      this.shake(1.2, 0.05);
    }

    _updateBullets(dt) {
      const v = this.vault;
      for (let i = this.bullets.length - 1; i >= 0; i--) {
        const b = this.bullets[i];
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.life -= dt;
        if (b.life <= 0 || b.x < -20 || b.x > W + 20 || b.y < -20 || b.y > H + 20) {
          this.bullets.splice(i, 1); continue;
        }

        if (b.hostile) {
          const dx = b.x - this.player.x, dy = b.y - this.player.y;
          if (Math.abs(dx) < 12 && Math.abs(dy) < 16 && this.player.iframe <= 0) {
            this.player.hp -= b.dmg;
            this.player.iframe = 0.4;
            this.sfx.play('hurt');
            this.flash('#ff4444', 0.12);
            this.shake(4, 0.15);
            this.bullets.splice(i, 1);
          }
          continue;
        }

        if (b.magnet) {
          for (const c of this.coins) {
            const dx = b.x - c.x, dy = b.y - c.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < 90 * 90) {
              const d = Math.sqrt(d2) || 1;
              c.vx += (dx / d) * 400 * dt;
              c.vy += (dy / d) * 400 * dt;
            }
          }
        }

        let consumed = false;
        for (const pl of v.plates) {
          if (!pl.alive) continue;
          if (Math.abs(b.x - pl.x) < pl.w / 2 && Math.abs(b.y - pl.y) < pl.h / 2) {
            pl.hp -= b.dmg;
            pl.flash = 0.12;
            v.shakeT = 0.15;
            this.sfx.play('plate');
            this.particles.burst(b.x, b.y, 6, { color: '#ffcc99', speed: 140, life: 0.3, size: 2 });
            this.addScore(10);
            if (pl.hp <= 0) this._breakPlate(pl);
            if (!b.pierce) { this.bullets.splice(i, 1); consumed = true; }
            break;
          }
        }
        if (consumed) continue;

        if (b.x > v.x && b.x < v.x + v.w && b.y > v.y && b.y < v.y + v.h) {
          const exposed = !v.plates.some(pl => pl.alive &&
            Math.abs(b.x - pl.x) < pl.w / 2 && Math.abs(b.y - pl.y) < pl.h / 2);
          if (exposed) {
            v.hp -= b.dmg * 1.5;
            this.sfx.play('hit');
            this.shake(3, 0.1);
            this.particles.burst(b.x, b.y, 10, { color: '#ff6644', speed: 200, life: 0.4 });
            for (let n = 0; n < 2; n++) this._spawnCoin(b.x, b.y);
            this.addScore(20);
            if (!b.pierce) this.bullets.splice(i, 1);
            continue;
          }
        }

        const iconX = v.x + v.w + 28, iconY = v.y + 16;
        if (this.queuedMutation && b.x > iconX - 18 && b.x < iconX + 18 && b.y > iconY - 18 && b.y < iconY + 18) {
          this.queueIconHp -= b.dmg;
          this.particles.burst(b.x, b.y, 4, { color: '#ff4fd8', speed: 160, life: 0.3, size: 2 });
          if (this.queueIconHp <= 0) {
            this.queuedMutation = null;
            this.queueIconHp = 30 + this.level * 6;
            this.mutateT = VAULTS[this.level - 1].mutPace + 4;
            this.addScore(80);
            this.sfx.play('buy');
            this.flash('#4fc8ff', 0.2);
          }
          if (!b.pierce) this.bullets.splice(i, 1);
          continue;
        }

        for (let j = this.enemies.length - 1; j >= 0; j--) {
          const e = this.enemies[j];
          if (Math.abs(b.x - e.x) < 14 && Math.abs(b.y - e.y) < 14) {
            e.hp -= b.dmg;
            this.particles.burst(b.x, b.y, 4, { color: '#ff8844', speed: 160, life: 0.3, size: 2 });
            if (e.hp <= 0) {
              this.enemies.splice(j, 1);
              this.addScore(30);
              this.particles.burst(e.x, e.y, 16, { color: '#ff8844', speed: 260, life: 0.5, size: 3 });
              this.sfx.play('plate');
              for (let n = 0; n < 3; n++) this._spawnCoin(e.x, e.y);
            }
            if (!b.pierce) this.bullets.splice(i, 1);
            break;
          }
        }
      }
    }

    _breakPlate(pl) {
      pl.alive = false;
      pl.respawn = 8 + Math.random() * 4;
      this.sfx.play('hit', { freq: 180 });
      Assets.sfx('vb_boom', 0.3);
      this.flash('#ffcc33', 0.12);
      this.shake(8, 0.3);
      this.particles.burst(pl.x, pl.y, 28, {
        color: '#ffcc33', speed: 360, life: 0.6, size: 3
      });
      for (let i = 0; i < 14; i++) this._spawnCoin(pl.x, pl.y, 420);
      this.addScore(120);
    }

    _spawnCoin(x, y, speed) {
      speed = speed || 260;
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      this.coins.push({
        x, y,
        vx: Math.cos(a) * speed * (0.4 + Math.random() * 0.7),
        vy: Math.sin(a) * speed * (0.6 + Math.random() * 0.6),
        r: 6,
        bounce: 0,
        life: 12
      });
    }

    _updateCoins(dt) {
      const p = this.player;
      const magnetR = 80 + this.save.magnetTier * 25;
      for (let i = this.coins.length - 1; i >= 0; i--) {
        const c = this.coins[i];
        c.vy += 680 * dt;
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        c.life -= dt;

        if (c.y > FLOOR_Y - 6) {
          c.y = FLOOR_Y - 6;
          c.vy *= -0.45;
          c.vx *= 0.7;
          c.bounce++;
          if (c.bounce > 3) c.vy = 0;
        }
        if (c.x < 8) { c.x = 8; c.vx *= -0.6; }
        if (c.x > W - 8) { c.x = W - 8; c.vx *= -0.6; }

        const dx = p.x - c.x, dy = (p.y - 6) - c.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < magnetR * magnetR) {
          const d = Math.sqrt(d2) || 1;
          c.vx += (dx / d) * 800 * dt;
          c.vy += (dy / d) * 800 * dt;
        }
        if (d2 < 20 * 20) {
          this.coinsHeld++;
          this.campaignCoins++;
          this.addScore(5);
          this.sfx.play('coin', { freq: 900 + Math.random() * 300 });
          this.particles.burst(c.x, c.y, 4, { color: '#ffee99', speed: 120, life: 0.25, size: 2 });
          this.coins.splice(i, 1);
          continue;
        }
        if (c.life <= 0) { this.coins.splice(i, 1); continue; }

        if (this.vault.eater && c.y < this.vault.y + this.vault.h + 40) {
          const mx = this.vault.x + this.vault.w / 2;
          if (Math.abs(c.x - mx) < 80 && c.y < this.vault.y + this.vault.h + 30) {
            this.particles.burst(c.x, c.y, 3, { color: '#663322', speed: 80, life: 0.3, size: 2 });
            this.coins.splice(i, 1);
          }
        }
      }
    }

    _updatePickups(dt) {
      const p = this.player;
      for (let i = this.pickups.length - 1; i >= 0; i--) {
        const pk = this.pickups[i];
        pk.vy += 600 * dt;
        pk.x += pk.vx * dt;
        pk.y += pk.vy * dt;
        pk.life -= dt;
        if (pk.y > FLOOR_Y - 10) { pk.y = FLOOR_Y - 10; pk.vy *= -0.3; pk.vx *= 0.6; }
        const dx = p.x - pk.x, dy = p.y - pk.y;
        if (dx * dx + dy * dy < 22 * 22) {
          this.player.owned.add(pk.w.id);
          if (!this.save.unlockedWeapons.includes(pk.w.id)) this.save.unlockedWeapons.push(pk.w.id);
          this.player.weaponIdx = WEAPONS.findIndex(w => w.id === pk.w.id);
          this.sfx.play('buy');
          this.flash('#88e8ff', 0.2);
          this.addScore(60);
          this.particles.burst(pk.x, pk.y, 18, { color: pk.w.color, speed: 220, life: 0.5, size: 3 });
          this.pickups.splice(i, 1);
          continue;
        }
        if (pk.life <= 0) this.pickups.splice(i, 1);
      }
    }

    _updateVault(dt) {
      const v = this.vault;
      v.fireT -= dt;
      if (v.shakeT > 0) v.shakeT -= dt;

      for (const pl of v.plates) {
        if (!pl.alive) {
          pl.respawn -= dt;
          if (pl.respawn <= 0) {
            pl.alive = true; pl.hp = pl.maxHp;
            this.particles.burst(pl.x, pl.y, 10, { color: '#ffcc99', speed: 120, life: 0.4, size: 2 });
          }
        } else if (pl.flash > 0) pl.flash -= dt;
      }

      if (v.fireT <= 0) {
        const p2 = this.bossPhase2 ? 0.55 : 1.0;
        v.fireT = (1.6 - Math.min(0.8, this.time / 90)) * p2 - this.level * 0.05;
        this._vaultAttack();
      }

      this.mutateT -= dt;
      if (this.mutateT <= 0) {
        if (this.queuedMutation) this._applyMutation(this.queuedMutation);
        this.queuedMutation = this._pickMutation();
        this.queueIconHp = 30 + this.level * 6;
        this.mutateT = VAULTS[this.level - 1].mutPace + Math.random() * 4;
      }

      if (v.eater) {
        v.eaterT += dt;
        if (v.eaterT > 6) { v.eater = false; v.eaterT = 0; }
      }

      if (v.stomp) {
        this.stompT -= dt;
        if (this.stompT <= 0) {
          this.stompT = 9 + Math.random() * 3;
          this.shockwaves.push({ x: W / 2, y: FLOOR_Y, r: 0, maxR: 600, dmg: 18 });
          this.sfx.play('mutate');
          this.shake(14, 0.5);
        }
      }
    }

    _vaultAttack() {
      const v = this.vault;
      const mx = v.x + v.w / 2 + (Math.random() - 0.5) * v.w * 0.6;
      const my = v.y + v.h;
      const target = this.player;
      const dx = target.x - mx, dy = target.y - my;
      const d = Math.hypot(dx, dy) || 1;
      const sp = 280 + Math.random() * 80 + this.level * 10;
      this.bullets.push({
        x: mx, y: my,
        vx: dx / d * sp,
        vy: dy / d * sp,
        life: 3, dmg: 12 + this.level, color: '#ff4422', size: 6, hostile: true
      });
      this.sfx.play('hit', { freq: 140 });
      this.particles.burst(mx, my, 6, { color: '#ff4422', speed: 160, life: 0.3, size: 3 });

      for (const arm of v.arms) {
        const ax = arm.x, ay = arm.y;
        const ddx = target.x - ax, ddy = target.y - ay;
        const dd = Math.hypot(ddx, ddy) || 1;
        this.bullets.push({
          x: ax, y: ay,
          vx: ddx / dd * 340, vy: ddy / dd * 340,
          life: 3, dmg: 10, color: '#ff7755', size: 5, hostile: true
        });
      }
    }

    _applyMutation(m) {
      this.sfx.play('mutate');
      this.flash('#ff4fd8', 0.25);
      const v = this.vault;
      if (m.id === 'cannon') {
        const side = v.arms.length % 2 === 0 ? -1 : 1;
        v.arms.push({ x: v.x + (side < 0 ? 0 : v.w), y: v.y + v.h * 0.6, side });
      } else if (m.id === 'turret') {
        this.enemies.push({
          x: 100 + Math.random() * (W - 200),
          y: 180 + Math.random() * 160,
          hp: 40 + this.level * 6, maxHp: 40 + this.level * 6, fireT: 1.2
        });
      } else if (m.id === 'armor') {
        for (const pl of v.plates) { pl.maxHp += 15; pl.hp = pl.maxHp; pl.alive = true; pl.respawn = 0; }
      } else if (m.id === 'eater') {
        v.eater = true; v.eaterT = 0;
      } else if (m.id === 'stomp') {
        v.stomp = true; this.stompT = 5;
      }
    }

    _updateEnemies(dt) {
      const p = this.player;
      for (const e of this.enemies) {
        e.fireT -= dt;
        if (e.fireT <= 0) {
          e.fireT = 1.4 + Math.random() * 0.8;
          const dx = p.x - e.x, dy = p.y - e.y;
          const d = Math.hypot(dx, dy) || 1;
          this.bullets.push({
            x: e.x, y: e.y, vx: dx / d * 320, vy: dy / d * 320,
            life: 2.6, dmg: 8, color: '#ff8844', size: 4, hostile: true
          });
          this.sfx.play('shoot', { freq: 420 });
        }
      }
    }

    _updateShock(dt) {
      const p = this.player;
      for (let i = this.shockwaves.length - 1; i >= 0; i--) {
        const s = this.shockwaves[i];
        s.r += 520 * dt;
        const dx = p.x - s.x, dy = p.y - s.y;
        const d = Math.hypot(dx, dy);
        if (Math.abs(d - s.r) < 24 && p.iframe <= 0) {
          p.hp -= s.dmg;
          p.iframe = 0.6;
          this.sfx.play('hurt');
          this.shake(8, 0.3);
          this.flash('#ff4444', 0.15);
        }
        if (s.r > s.maxR) this.shockwaves.splice(i, 1);
      }
    }

    // ----------------------------------------------------------------
    // RENDER
    // ----------------------------------------------------------------
    render(ctx) {
      this._drawBackground(ctx);
      this._drawVault(ctx);
      this._drawEnemies(ctx);
      this._drawCoins(ctx);
      this._drawPickups(ctx);
      this._drawBullets(ctx);
      this._drawShock(ctx);
      this._drawPlayer(ctx);
      this._drawUi(ctx);
      if (this.phase === 'intro') this._drawIntro(ctx);
      if (this.phase === 'intermission') this._drawIntermission(ctx);
      if (this.phase === 'victory') this._drawVictory(ctx);
    }

    _drawBackground(ctx) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#2a1d16'); g.addColorStop(1, '#0d0604');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#1a0f08';
      for (let y = 40; y < FLOOR_Y; y += 26) {
        const off = (y / 26) % 2 ? 0 : 26;
        for (let x = -26 + off; x < W; x += 52) {
          ctx.fillRect(x, y, 48, 22);
        }
      }
      ctx.fillStyle = '#2a1a10';
      ctx.fillRect(0, FLOOR_Y, W, H - FLOOR_Y);
      ctx.fillStyle = '#3a2518';
      ctx.fillRect(0, FLOOR_Y, W, 4);
    }

    _drawVault(ctx) {
      const v = this.vault;
      const sx = v.shakeT > 0 ? (Math.random() - 0.5) * 8 : 0;
      const sy = v.shakeT > 0 ? (Math.random() - 0.5) * 4 : 0;
      ctx.save();
      ctx.translate(sx, sy);

      // body
      Draw.rect(ctx, v.x, v.y, v.w, v.h, '#3a3028');
      Draw.rect(ctx, v.x, v.y, v.w, 14, '#554438');
      Draw.rect(ctx, v.x, v.y + v.h - 14, v.w, 14, '#251c14');
      ctx.fillStyle = '#8a6e50';
      for (let i = 0; i < 10; i++) {
        ctx.fillRect(v.x + 8 + i * (v.w - 16) / 9, v.y + 4, 4, 4);
        ctx.fillRect(v.x + 8 + i * (v.w - 16) / 9, v.y + v.h - 8, 4, 4);
      }
      // level accent stripe
      ctx.fillStyle = v.bodyColor;
      ctx.fillRect(v.x, v.y + 14, v.w, 3);
      ctx.fillRect(v.x, v.y + v.h - 17, v.w, 3);

      // eyes (boss = glowing pink)
      const blink = (Math.sin(this.time * 3) > 0.85) ? 0 : 1;
      ctx.fillStyle = v.isBoss ? '#ff4fd8' : '#ff4422';
      ctx.fillRect(v.x + v.w * 0.22, v.y + v.h * 0.3, v.w * 0.14, 10 * blink);
      ctx.fillRect(v.x + v.w * 0.64, v.y + v.h * 0.3, v.w * 0.14, 10 * blink);
      // mouth
      ctx.fillStyle = '#1a0500';
      ctx.fillRect(v.x + v.w * 0.3, v.y + v.h - 22, v.w * 0.4, 10);
      if (v.eater) {
        ctx.fillStyle = '#ff3300';
        ctx.fillRect(v.x + v.w * 0.3, v.y + v.h - 22, v.w * 0.4, 4);
      }

      // plates
      for (const pl of v.plates) {
        if (!pl.alive) {
          ctx.fillStyle = '#150b05';
          ctx.fillRect(pl.x - pl.w / 2, pl.y - pl.h / 2, pl.w, pl.h);
          const t = 1 - pl.respawn / 8;
          ctx.fillStyle = 'rgba(255,200,80,' + (0.15 + 0.1 * Math.sin(this.time * 6)) + ')';
          ctx.fillRect(pl.x - pl.w / 2, pl.y - pl.h / 2, pl.w * t, pl.h);
          continue;
        }
        const flash = pl.flash > 0 ? 1 : 0;
        ctx.fillStyle = flash ? '#ffeecc' : '#6e5a44';
        ctx.fillRect(pl.x - pl.w / 2, pl.y - pl.h / 2, pl.w, pl.h);
        ctx.fillStyle = flash ? '#fff' : '#8d7658';
        ctx.fillRect(pl.x - pl.w / 2, pl.y - pl.h / 2, pl.w, 4);
        ctx.fillStyle = '#3c2e20';
        ctx.fillRect(pl.x - pl.w / 2, pl.y + pl.h / 2 - 4, pl.w, 4);
        ctx.fillStyle = '#2a1f14';
        ctx.fillRect(pl.x - pl.w / 2 + 4, pl.y - pl.h / 2 + 4, 3, 3);
        ctx.fillRect(pl.x + pl.w / 2 - 7, pl.y - pl.h / 2 + 4, 3, 3);
        ctx.fillRect(pl.x - pl.w / 2 + 4, pl.y + pl.h / 2 - 7, 3, 3);
        ctx.fillRect(pl.x + pl.w / 2 - 7, pl.y + pl.h / 2 - 7, 3, 3);
        const pct = pl.hp / pl.maxHp;
        ctx.fillStyle = '#200';
        ctx.fillRect(pl.x - pl.w / 2 + 6, pl.y + pl.h / 2 - 3, pl.w - 12, 2);
        ctx.fillStyle = pct > 0.5 ? '#66ff88' : pct > 0.2 ? '#ffcc33' : '#ff4444';
        ctx.fillRect(pl.x - pl.w / 2 + 6, pl.y + pl.h / 2 - 3, (pl.w - 12) * pct, 2);
      }

      for (const arm of v.arms) {
        ctx.save();
        ctx.translate(arm.x, arm.y);
        const sway = Math.sin(this.time * 1.8 + arm.x) * 0.2;
        ctx.rotate(sway * arm.side);
        const segs = 4, segW = 16, segH = 12;
        for (let i = 0; i < segs; i++) {
          ctx.fillStyle = i % 2 ? '#4a3a2a' : '#5a4836';
          ctx.fillRect(arm.side * i * (segW - 2), -segH / 2, segW * arm.side, segH);
        }
        ctx.fillStyle = '#1a0f08';
        ctx.fillRect(arm.side * (segs - 1) * (segW - 2), -6, 14 * arm.side, 12);
        ctx.restore();
      }
      ctx.restore();

      const barW = v.w, barX = v.x;
      Draw.rect(ctx, barX, v.y - 14, barW, 6, '#220');
      const pct = Math.max(0, v.hp / v.maxHp);
      Draw.rect(ctx, barX, v.y - 14, barW * pct, 6, pct > 0.4 ? '#ff7755' : '#ff3344');
      // phase-2 mark
      if (v.isBoss) {
        ctx.fillStyle = '#ff4fd8';
        ctx.fillRect(barX + barW * 0.5 - 1, v.y - 18, 2, 14);
      }

      if (this.queuedMutation) {
        const ix = v.x + v.w + 28, iy = v.y + 16;
        ctx.fillStyle = '#120820';
        ctx.fillRect(ix - 18, iy - 18, 36, 36);
        ctx.strokeStyle = '#ff4fd8'; ctx.lineWidth = 2;
        ctx.strokeRect(ix - 18, iy - 18, 36, 36);
        Draw.text(ctx, this.queuedMutation.icon, ix, iy + 7, {
          size: 22, color: '#ff4fd8', align: 'center', weight: '800'
        });
        const pc = this.queueIconHp / (30 + this.level * 6);
        ctx.fillStyle = '#200';
        ctx.fillRect(ix - 18, iy + 20, 36, 3);
        ctx.fillStyle = '#ff4fd8';
        ctx.fillRect(ix - 18, iy + 20, 36 * pc, 3);
        Draw.text(ctx, 'incoming', ix, iy - 24, { size: 10, color: '#a58abd', align: 'center' });
        Draw.text(ctx, this.queuedMutation.name, ix, iy + 40, { size: 10, color: '#ff4fd8', align: 'center' });
        const secs = Math.max(0, this.mutateT | 0);
        Draw.text(ctx, secs + 's', ix, iy + 54, { size: 10, color: '#a58abd', align: 'center' });
      }
    }

    _drawEnemies(ctx) {
      for (const e of this.enemies) {
        ctx.fillStyle = '#2a1a10';
        ctx.beginPath(); ctx.arc(e.x, e.y, 14, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ff8844';
        ctx.beginPath(); ctx.arc(e.x, e.y, 10, 0, TAU); ctx.fill();
        const p = this.player;
        const a = Math.atan2(p.y - e.y, p.x - e.x);
        ctx.save();
        ctx.translate(e.x, e.y); ctx.rotate(a);
        ctx.fillStyle = '#1a0f08';
        ctx.fillRect(6, -3, 14, 6);
        ctx.restore();
        const pct = e.hp / e.maxHp;
        ctx.fillStyle = '#200';
        ctx.fillRect(e.x - 14, e.y + 18, 28, 3);
        ctx.fillStyle = '#ff8844';
        ctx.fillRect(e.x - 14, e.y + 18, 28 * pct, 3);
      }
    }

    _drawCoins(ctx) {
      for (const c of this.coins) {
        const spin = Math.abs(Math.sin(this.time * 8 + c.x));
        const sw = c.r * 2 * (0.4 + spin * 0.6);
        ctx.fillStyle = '#7a5a15';
        ctx.fillRect(c.x - sw / 2, c.y - c.r + 1, sw, c.r * 2);
        ctx.fillStyle = '#ffcc33';
        ctx.fillRect(c.x - sw / 2, c.y - c.r, sw, c.r * 2);
        ctx.fillStyle = '#fff4a8';
        ctx.fillRect(c.x - sw / 2, c.y - c.r, sw, 2);
      }
    }

    _drawPickups(ctx) {
      for (const pk of this.pickups) {
        const bob = Math.sin(this.time * 4) * 2;
        ctx.fillStyle = pk.w.color;
        ctx.globalAlpha = 0.35;
        ctx.beginPath(); ctx.arc(pk.x, pk.y + bob, 18, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#1a0f08';
        ctx.fillRect(pk.x - 12, pk.y + bob - 6, 24, 12);
        ctx.fillStyle = pk.w.color;
        ctx.fillRect(pk.x - 10, pk.y + bob - 4, 20, 3);
        Draw.text(ctx, pk.w.name, pk.x, pk.y + bob - 14, { size: 10, color: pk.w.color, align: 'center' });
      }
    }

    _drawBullets(ctx) {
      for (const b of this.bullets) {
        if (b.hostile) {
          ctx.fillStyle = b.color;
          ctx.beginPath(); ctx.arc(b.x, b.y, b.size, 0, TAU); ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.arc(b.x, b.y, b.size * 0.4, 0, TAU); ctx.fill();
        } else {
          const ang = Math.atan2(b.vy, b.vx);
          ctx.save();
          ctx.translate(b.x, b.y); ctx.rotate(ang);
          ctx.fillStyle = b.color;
          ctx.fillRect(-6, -b.size / 2, 12, b.size);
          ctx.fillStyle = '#fff';
          ctx.fillRect(2, -b.size / 2 + 1, 4, b.size - 2);
          ctx.restore();
        }
      }
    }

    _drawShock(ctx) {
      for (const s of this.shockwaves) {
        ctx.strokeStyle = '#ffcc33';
        ctx.lineWidth = 6;
        ctx.globalAlpha = Math.max(0, 1 - s.r / s.maxR);
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, Math.PI, TAU); ctx.stroke();
        ctx.lineWidth = 2; ctx.strokeStyle = '#fff';
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, Math.PI, TAU); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    _drawPlayer(ctx) {
      const p = this.player;
      const blink = p.iframe > 0 && Math.sin(this.time * 30) < 0;
      if (blink) return;
      const kick = Math.sin(p.walkT) * 3;
      ctx.fillStyle = '#2a1a10';
      ctx.fillRect(p.x - 7, p.y + 8 + kick, 5, 8);
      ctx.fillRect(p.x + 2, p.y + 8 - kick, 5, 8);
      ctx.fillStyle = '#4a7a30';
      ctx.fillRect(p.x - 9, p.y - 4, 18, 14);
      ctx.fillStyle = '#6aa048';
      ctx.fillRect(p.x - 8, p.y - 16, 16, 12);
      ctx.fillStyle = '#000';
      const look = Math.cos(p.aimA) > 0 ? 1 : -1;
      ctx.fillRect(p.x - 2 + look * 2, p.y - 11, 3, 3);
      ctx.save();
      ctx.translate(p.x, p.y - 4);
      ctx.rotate(p.aimA);
      ctx.fillStyle = '#222';
      ctx.fillRect(4, -3, 18, 6);
      const w = WEAPONS[this.player.weaponIdx];
      ctx.fillStyle = w.color;
      ctx.fillRect(18, -2, 4, 4);
      ctx.restore();

      const pct = p.hp / p.maxHp;
      ctx.fillStyle = '#200';
      ctx.fillRect(p.x - 18, p.y - 24, 36, 4);
      ctx.fillStyle = pct > 0.5 ? '#66ff88' : pct > 0.25 ? '#ffcc33' : '#ff4444';
      ctx.fillRect(p.x - 18, p.y - 24, 36 * pct, 4);
    }

    _drawUi(ctx) {
      const y = H - 28;
      let x = 14;
      for (let i = 0; i < WEAPONS.length; i++) {
        const w = WEAPONS[i];
        const owned = this.player.owned.has(w.id);
        const active = i === this.player.weaponIdx;
        ctx.fillStyle = active ? '#443322' : '#1a110a';
        ctx.fillRect(x, y, 130, 22);
        ctx.strokeStyle = owned ? w.color : '#554';
        ctx.lineWidth = active ? 2 : 1;
        ctx.strokeRect(x + 0.5, y + 0.5, 130, 22);
        const t = tierOf(this.save, w.id);
        const label = (i + 1) + ' ' + w.name + (owned && t ? ' T' + t : '');
        Draw.text(ctx, label, x + 6, y + 15, {
          size: 11, color: owned ? w.color : '#776655', weight: '700'
        });
        if (!owned) {
          Draw.text(ctx, '\u25CF' + w.cost, x + 124, y + 15, { size: 10, color: '#aa8844', align: 'right' });
        } else if (w.coinCost > 0) {
          Draw.text(ctx, '-' + w.coinCost, x + 124, y + 15, { size: 10, color: '#ffcc33', align: 'right' });
        }
        x += 138;
      }
    }

    // -------- INTRO CARD --------
    _drawIntro(ctx) {
      ctx.fillStyle = 'rgba(0,0,0,0.78)';
      ctx.fillRect(0, 0, W, H);
      const cfg = VAULTS[this.level - 1];
      const cx = W / 2, cy = H / 2;
      ctx.strokeStyle = cfg.color; ctx.lineWidth = 4;
      ctx.strokeRect(cx - 300, cy - 90, 600, 180);
      ctx.fillStyle = '#120820';
      ctx.fillRect(cx - 296, cy - 86, 592, 172);
      Draw.text(ctx, 'VAULT ' + cfg.n + ' / 7', cx, cy - 34, {
        size: 24, color: cfg.color, align: 'center', weight: '800'
      });
      Draw.text(ctx, cfg.title, cx, cy + 6, {
        size: 38, color: '#ffcc33', align: 'center', weight: '800'
      });
      Draw.text(ctx, cfg.boss ? 'FINAL • BOSS VAULT' : 'HP ' + cfg.hp + '  •  Plates ' + cfg.plateHp,
        cx, cy + 40, { size: 14, color: '#a58abd', align: 'center' });
      // Show the persistent vault wallet so players know their previous
      // run's banked coins carried over.
      if (this.level === 1 && this.coinsHeld > 0) {
        Draw.text(ctx, 'Bank: \u25CF ' + this.coinsHeld + ' coins from last run',
          cx, cy + 58, { size: 12, color: '#ffcc33', align: 'center', weight: '700' });
      }
      Draw.text(ctx, 'Click or SPACE to start', cx, cy + 76, {
        size: 12, color: '#a58abd', align: 'center'
      });
    }

    // -------- INTERMISSION / SHOP --------
    _drawIntermission(ctx) {
      ctx.fillStyle = 'rgba(0,0,0,0.82)';
      ctx.fillRect(0, 0, W, H);

      const bx = 60, by = 40, bw = W - 120, bh = H - 80;
      ctx.fillStyle = '#120820';
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = '#ffcc33'; ctx.lineWidth = 3;
      ctx.strokeRect(bx, by, bw, bh);

      Draw.text(ctx, 'VAULT ' + this.level + ' CLEARED', W / 2, by + 38, {
        size: 26, color: '#ffcc33', align: 'center', weight: '800'
      });
      Draw.text(ctx, 'NEXT: ' + VAULTS[this.level].title, W / 2, by + 64, {
        size: 14, color: VAULTS[this.level].color, align: 'center', weight: '700'
      });
      Draw.text(ctx, '\u25CF ' + this.coinsHeld + ' coins', W / 2, by + 88, {
        size: 16, color: '#ffcc33', align: 'center'
      });

      // offers grid
      const s = this.shop;
      s.rects = [];
      const cols = 2;
      const cellW = (bw - 60) / cols;
      const cellH = 62;
      const startX = bx + 30;
      const startY = by + 110;
      for (let i = 0; i < s.offers.length; i++) {
        const o = s.offers[i];
        const col = i % cols, row = (i / cols) | 0;
        const rx = startX + col * (cellW + 0);
        const ry = startY + row * (cellH + 8);
        const rw = cellW - 8, rh = cellH;
        const canAfford = this.coinsHeld >= o.cost;
        const hover = s.hoverIdx === i;
        ctx.fillStyle = hover && canAfford ? '#332a18' : '#1a0f20';
        ctx.fillRect(rx, ry, rw, rh);
        ctx.strokeStyle = o.color; ctx.lineWidth = hover ? 2 : 1;
        ctx.strokeRect(rx + 0.5, ry + 0.5, rw, rh);
        Draw.text(ctx, o.label, rx + 12, ry + 22, { size: 14, color: o.color, weight: '700' });
        Draw.text(ctx, o.desc, rx + 12, ry + 42, { size: 11, color: '#a58abd' });
        Draw.text(ctx, '\u25CF ' + o.cost, rx + rw - 12, ry + 34, {
          size: 14, color: canAfford ? '#ffcc33' : '#776655', align: 'right', weight: '700'
        });
        s.rects.push({ x: rx, y: ry, w: rw, h: rh, kind: 'offer', i });
      }

      // continue button
      const cbw = 260, cbh = 42;
      const cbx = W / 2 - cbw / 2;
      const cby = by + bh - cbh - 20;
      ctx.fillStyle = '#2a5a20';
      ctx.fillRect(cbx, cby, cbw, cbh);
      ctx.strokeStyle = '#66ff88'; ctx.lineWidth = 2;
      ctx.strokeRect(cbx + 0.5, cby + 0.5, cbw, cbh);
      Draw.text(ctx, 'CONTINUE TO VAULT ' + (this.level + 1) + ' \u2192', W / 2, cby + 27, {
        size: 16, color: '#caffd5', align: 'center', weight: '800'
      });
      s.rects.push({ x: cbx, y: cby, w: cbw, h: cbh, kind: 'continue' });
    }

    _drawVictory(ctx) {
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(0, 0, W, H);
      Draw.text(ctx, 'THE HOARD IS YOURS', W / 2, H / 2 - 24, {
        size: 44, color: '#ffcc33', align: 'center', weight: '800'
      });
      Draw.text(ctx, '\u25CF ' + this.campaignCoins + ' coins collected this run', W / 2, H / 2 + 16, {
        size: 16, color: '#ffee99', align: 'center'
      });
      Draw.text(ctx, 'The vault wipes itself behind you \u2014 next heist begins from scratch.',
        W / 2, H / 2 + 44, {
        size: 13, color: '#a58abd', align: 'center'
      });
    }

    coinsEarned(/* score */) {
      // Theme-shop coins are earned by *making campaign progress*, not by
      // picking up vault coins (that's a separate per-game wallet now).
      // 4 per cleared vault, +20 victory bonus.
      const cleared = this.levelsClearedThisRun | 0;
      const winBonus = this.victoryAchieved ? 20 : 0;
      return cleared * 4 + winBonus;
    }
  }

  NDP.attachGame('vaultbreaker', VaultbreakerGame);
})();
