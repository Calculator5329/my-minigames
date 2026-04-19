/* Franchise Frenzy — multi-city tycoon campaign.
   Five 60-second cities, persistent cash + autos between cities, random
   events, manager auto-buyers, synergy bonuses, boss bid (city 5),
   pre-run Stardollar shop. See docs/plans/2026-04-19-franchise-expansion.md. */
(function () {
  const NDP = window.NDP;
  const { BaseGame, Input, Storage } = NDP.Engine;
  const F = NDP.Franchise;

  const W = 960, H = 600;
  const fmt = F.fmt;

  class FranchiseGame extends BaseGame {
    init() {
      this.W = W; this.H = H;
      this.save = Object.assign(F.defaultSave(), Storage.getGameData('franchise') || {});
      this.save.meta = Object.assign({ seed: 0, click: 0, rate: 0, time: 0, mgrs: 0 }, this.save.meta || {});
      /* One-shot legacy reader: prior versions stored stardollars inside the
         data blob (this.save.stardollars). Lift any leftover balance into the
         per-game wallet and zero out the blob field so future writes don't
         clobber the wallet. */
      if ((this.save.stardollars | 0) > 0) {
        Storage.addGameWallet('franchise', this.save.stardollars | 0);
        this.save.stardollars = 0;
        this._writeSave();
      }

      this.phase = 'shop';   // 'shop' | 'play' | 'transition' | 'debrief'
      this.shopRects = [];
      this.cityIdx = 0;
      this.timeLeft = 0;
      this.peakNetWorth = 0;
      this.citiesCleared = 0;
      this.campaignWon = false;
      /* Per-run milestone counters used for global-coin payout. */
      this.citiesClearedThisRun = 0;
      this.campaignsWonThisRun = 0;
      this.victoryAchieved = false;

      this.cash = 0;
      this.clickPower = 1;
      this.clickUpgradeCost = 25;
      this.autos = {};
      F.TIERS.forEach(t => (this.autos[t.id] = 0));
      this.unlockedTier = 0;

      // event/run state
      this.activeEvent = null;
      this.eventCdr = 0;        // seconds until next event
      this.eventsThisCity = 0;
      this.viralClicks = 0;
      this.envelope = null;

      // managers (per-run)
      this.managers = [];       // [{ tierId, paid: bool, cd: 0 }]
      this.freeMgrSlots = 0;    // assigned at campaign start from meta

      // boss (city 5)
      this.boss = null;         // { aiBid, myBid, t, dur, resolved, won }

      // visual run state
      this.floaters = [];
      this.workers = [];
      this.bgClouds = [];
      for (let i = 0; i < 6; i++) {
        this.bgClouds.push({ x: Math.random() * W, y: 20 + Math.random() * 140, sp: 4 + Math.random() * 8, r: 30 + Math.random() * 30 });
      }
      this.bgBirds = [];
      for (let i = 0; i < 3; i++) {
        this.bgBirds.push({ x: Math.random() * W, y: 40 + Math.random() * 120, sp: 22 + Math.random() * 12, ph: Math.random() * 6 });
      }
      this.flagshipPulse = 0;
      this.coinBurstT = 0;
      this.tickAcc = 0;
      this.transitionT = 0;
      this.debriefStardollars = 0;

      this.sfx = this.makeSfx({
        click:    { freq: 600,  type: 'square',   dur: 0.05, slide: 80,   vol: 0.22 },
        bigclick: { freq: 880,  type: 'triangle', dur: 0.1,  slide: 440,  vol: 0.4 },
        buy:      { freq: 440,  type: 'triangle', dur: 0.12, slide: 220,  vol: 0.4 },
        deny:     { freq: 180,  type: 'square',   dur: 0.08, slide: -60,  vol: 0.28 },
        tier:     { freq: 880,  type: 'triangle', dur: 0.18, slide: 440,  vol: 0.5 },
        event:    { freq: 520,  type: 'triangle', dur: 0.25, slide: 880,  vol: 0.45 },
        descend:  { freq: 330,  type: 'sawtooth', dur: 0.5,  slide: 660,  vol: 0.45 },
        win:      { freq: 660,  type: 'triangle', dur: 0.5,  slide: 1320, vol: 0.55 },
        lose:     { freq: 220,  type: 'sawtooth', dur: 0.6,  slide: -180, vol: 0.5 },
        boss:     { freq: 140,  type: 'sawtooth', dur: 0.4,  slide: 60,   vol: 0.55 },
        envelope: { freq: 1200, type: 'square',   dur: 0.12, slide: 1500, vol: 0.4 }
      });

      this.layoutShops();
      this.setHud(this._hud());
    }

    /* ----------------------------------------------------------------- */
    /*  Layout                                                            */
    /* ----------------------------------------------------------------- */
    layoutShops() {
      this.shopCardRects = {};
      const gridX = W * 0.38, gridY = 60, gridW = W - gridX - 24, gridH = H - 80;
      const cols = 2, rows = 5;
      const bw = gridW / cols - 12, bh = gridH / rows - 12;
      F.TIERS.forEach((tier, i) => {
        const cx = i % cols, cy = (i / cols) | 0;
        this.shopCardRects[tier.id] = {
          x: gridX + cx * (bw + 12),
          y: gridY + cy * (bh + 12),
          w: bw, h: bh, tier, idx: i
        };
      });
      this.flagship = { x: W * 0.19, y: H * 0.43, r: 90 };
      this.upgradeRect = { x: 30, y: H - 116, w: W * 0.32 - 30, h: 50 };
      this.managerRect = { x: 30, y: H - 60, w: W * 0.32 - 30, h: 50 };
    }

    /* ----------------------------------------------------------------- */
    /*  Campaign lifecycle                                                */
    /* ----------------------------------------------------------------- */
    beginCampaign() {
      const seed = F.metaEffect(this.save, 'seed') || 0;
      const clickMul = F.metaEffect(this.save, 'click') || 1;
      const freeMgrs = F.metaEffect(this.save, 'mgrs') || 0;

      this.cash = 5 + seed;
      this.clickPower = 1 * (clickMul || 1);
      this.clickUpgradeCost = 25;
      F.TIERS.forEach(t => (this.autos[t.id] = 0));
      this.unlockedTier = 0;
      this.peakNetWorth = 0;
      this.citiesCleared = 0;
      this.campaignWon = false;
      this.managers = [];
      this.freeMgrSlots = freeMgrs;
      this.activeEvent = null;
      this.envelope = null;
      this.viralClicks = 0;
      this.boss = null;

      this.cityIdx = 0;
      this.startCity(0);
      this.phase = 'play';
      this.sfx.play('descend');
    }

    startCity(idx) {
      const city = F.cityByIndex(idx);
      const timeBoost = F.metaEffect(this.save, 'time') || 0;
      this.cityIdx = idx;
      this.timeLeft = 60 + timeBoost;
      this.eventsThisCity = 0;
      this.eventCdr = city.eventEvery > 0 ? city.eventEvery * (0.6 + Math.random() * 0.5) : 0;
      this.activeEvent = null;
      this.envelope = null;
      this.boss = null;
      this.targetMet = false;
      this.flash(city.accent || '#ffd86b', 0.18);
      this._revealEligibleTiers(true);
    }

    endCity(reason) {
      if (reason === 'win') {
        this.citiesCleared = Math.max(this.citiesCleared, this.cityIdx + 1);
        this.citiesClearedThisRun = (this.citiesClearedThisRun | 0) + 1;
        this.sfx.play('win');
        this.flash('#ffd86b', 0.3);
        if (this.cityIdx + 1 >= F.CITIES.length) {
          this.campaignWon = true;
          this.endCampaign(true);
        } else {
          this.transitionT = 1.8;
          this.transitionTo = this.cityIdx + 1;
          this.phase = 'transition';
        }
      } else {
        this.sfx.play('lose');
        this.flash('#ef4444', 0.4);
        this.endCampaign(false);
      }
    }

    endCampaign(won) {
      const earned = F.stardollarsFor(this.peakNetWorth);
      this.debriefStardollars = earned;
      if (earned > 0) Storage.addGameWallet('franchise', earned);
      this.save.bestNetWorth = Math.max(this.save.bestNetWorth || 0, this.peakNetWorth);
      this.save.citiesCleared = Math.max(this.save.citiesCleared || 0, this.citiesCleared);
      this.save.totalEarned = (this.save.totalEarned || 0) + this.peakNetWorth;
      if (won) {
        this.save.campaignsWon = (this.save.campaignsWon || 0) + 1;
        this.campaignsWonThisRun = (this.campaignsWonThisRun | 0) + 1;
        this.victoryAchieved = true;
      }
      this._writeSave();
      this.phase = 'debrief';
      this.setScore(Math.floor(this.peakNetWorth));
    }

    /* Wallet-aware accessor used in shop UI/spend paths. */
    _stardollars() { return Storage.getGameWallet('franchise') | 0; }

    _writeSave() {
      Storage.setGameData('franchise', this.save);
    }

    /* ----------------------------------------------------------------- */
    /*  Rate, synergies, net worth                                        */
    /* ----------------------------------------------------------------- */
    rawRatePerTier(tier) {
      const c = this.autos[tier.id] || 0;
      if (c <= 0) return 0;
      return c * tier.baseRate * F.synergyFor(c);
    }

    rate() {
      let r = 0;
      F.TIERS.forEach(t => (r += this.rawRatePerTier(t)));
      const metaMul = F.metaEffect(this.save, 'rate') || 1;
      r *= metaMul;
      if (this.activeEvent && this.activeEvent.mods && this.activeEvent.mods.rateMul) {
        r *= this.activeEvent.mods.rateMul;
      }
      return r;
    }

    investedValue() {
      let v = 0;
      F.TIERS.forEach(t => (v += (this.autos[t.id] || 0) * t.cost));
      return v;
    }

    netWorth() { return this.cash + this.investedValue(); }

    buyCostFor(tier) {
      const count = this.autos[tier.id] || 0;
      return Math.ceil(tier.cost * Math.pow(1.25, count));
    }

    tryBuy(tier) {
      if (tier.unlockCity > this.cityIdx + 1) { this.sfx.play('deny'); return false; }
      const cost = this.buyCostFor(tier);
      if (this.cash < cost) { this.sfx.play('deny'); return false; }
      this.cash -= cost;
      this.autos[tier.id] = (this.autos[tier.id] || 0) + 1;
      this.sfx.play('buy', { freq: 440 + Math.min(20, this.autos[tier.id]) * 18 });
      this.shake(2.5, 0.1);
      const newCount = this.autos[tier.id];
      const next = F.nextSynergyAt(newCount - 1);
      if (next && newCount === next) {
        this.flash('#ffd86b', 0.18);
        this.sfx.play('tier', { freq: 660 + newCount });
        const r = this.shopCardRects[tier.id];
        if (r) this.emitFloater(r.x + r.w/2, r.y + r.h/2, 'SYNERGY!', '#ffd86b');
      }
      this._revealEligibleTiers();
      return true;
    }

    tryUpgradeClick() {
      if (this.cash < this.clickUpgradeCost) { this.sfx.play('deny'); return; }
      this.cash -= this.clickUpgradeCost;
      this.clickPower *= 2;
      this.clickUpgradeCost = Math.ceil(this.clickUpgradeCost * 2.8);
      this.sfx.play('buy', { freq: 660 });
      this.shake(3, 0.12);
    }

    /* ----------------------------------------------------------------- */
    /*  Managers                                                          */
    /* ----------------------------------------------------------------- */
    paidMgrs() { return this.managers.filter(m => m.paid).length; }

    canHireFree() {
      if (this.cityIdx + 1 < 2) return false; // intro at city 2
      const used = this.managers.length;
      return used < this.freeMgrSlots && this.managers.length < F.MAX_MANAGERS;
    }

    canBuyManager() {
      if (this.cityIdx + 1 < 2) return false;
      if (this.managers.length >= F.MAX_MANAGERS) return false;
      return this.cash >= F.managerCost(this.paidMgrs());
    }

    hireManager(tierId, opts) {
      const free = !!(opts && opts.free);
      if (this.managers.length >= F.MAX_MANAGERS) { this.sfx.play('deny'); return false; }
      if (this.managers.some(m => m.tierId === tierId)) { this.sfx.play('deny'); return false; }
      if (!free) {
        const cost = F.managerCost(this.paidMgrs());
        if (this.cash < cost) { this.sfx.play('deny'); return false; }
        this.cash -= cost;
      }
      this.managers.push({ tierId, paid: !free, cd: 0 });
      this.sfx.play('tier', { freq: 800 });
      this.shake(3, 0.15);
      const r = this.shopCardRects[tierId];
      if (r) this.emitFloater(r.x + r.w/2, r.y + 14, 'MANAGER HIRED', '#a855f7');
      return true;
    }

    _tickManagers(dt) {
      for (const m of this.managers) {
        m.cd -= dt;
        if (m.cd > 0) continue;
        const tier = F.TIERS.find(t => t.id === m.tierId);
        if (!tier) continue;
        const cost = this.buyCostFor(tier);
        if (this.cash >= cost) {
          this.cash -= cost;
          this.autos[tier.id] = (this.autos[tier.id] || 0) + 1;
          const newCount = this.autos[tier.id];
          const next = F.nextSynergyAt(newCount - 1);
          if (next && newCount === next) {
            this.flash('#a855f7', 0.12);
            const r = this.shopCardRects[tier.id];
            if (r) this.emitFloater(r.x + r.w/2, r.y + r.h/2, 'SYNERGY!', '#ffd86b');
          }
          this._revealEligibleTiers();
        }
        m.cd = F.MANAGER_BUY_INTERVAL;
      }
    }

    /* ----------------------------------------------------------------- */
    /*  Events                                                            */
    /* ----------------------------------------------------------------- */
    _tickEvents(dt) {
      const city = F.cityByIndex(this.cityIdx);
      if (!city.eventCount || this.timeLeft <= 4) return;
      if (this.activeEvent) {
        this.activeEvent.t -= dt;
        if (this.activeEvent.id === 'viral') {
          // Viral banner stays until clicks consumed OR time elapses
          if (this.activeEvent.t <= 0 && this.viralClicks <= 0) this.activeEvent = null;
        } else if (this.activeEvent.t <= 0) {
          this.activeEvent = null;
        }
        return;
      }
      if (this.eventsThisCity >= city.eventCount) return;
      this.eventCdr -= dt;
      if (this.eventCdr <= 0) this._fireEvent();
    }

    _fireEvent() {
      const ev = F.pickEvent();
      const city = F.cityByIndex(this.cityIdx);
      const state = this._eventState();
      const rec = ev.apply(state);
      if (rec) this.activeEvent = rec;
      this.eventsThisCity++;
      this.eventCdr = (city.eventEvery || 12) * (0.7 + Math.random() * 0.6);
      this.sfx.play('event', { freq: 440 + Math.random() * 600 });
      this.flash(ev.color, 0.12);
      this.emitFloater(W / 2, 60, ev.label, ev.color);
    }

    _eventState() {
      // proxy passed to event.apply. Mutating .cash works directly; rest as helpers.
      const game = this;
      return {
        get cash() { return game.cash; },
        set cash(v) { game.cash = v; },
        get viralClicks() { return game.viralClicks; },
        set viralClicks(v) { game.viralClicks = v; },
        get envelope() { return game.envelope; },
        set envelope(v) { game.envelope = v; },
        W, H,
        computeRate: () => game.rate()
      };
    }

    /* ----------------------------------------------------------------- */
    /*  Boss (city 5 hostile takeover)                                    */
    /* ----------------------------------------------------------------- */
    _maybeStartBoss() {
      const city = F.cityByIndex(this.cityIdx);
      if (!city.boss || this.boss) return;
      if (this.timeLeft <= 30 && this.timeLeft > 14) {
        const cash = Math.max(1000, this.cash);
        this.boss = {
          aiBid: cash * 0.5,
          myBid: cash * 0.5,
          t: 15, dur: 15,
          resolved: false, won: false,
          aiTickCdr: 1.5,
          aiBidStep: cash * 0.06
        };
        this.sfx.play('boss');
        this.flash('#ef4444', 0.35);
        this.shake(8, 0.4);
      }
    }

    _tickBoss(dt) {
      const b = this.boss;
      if (!b || b.resolved) return;
      b.t -= dt;
      b.aiTickCdr -= dt;
      if (b.aiTickCdr <= 0) {
        b.aiTickCdr = 1.5;
        b.aiBid += b.aiBidStep;
        b.aiBidStep *= 1.05;
      }
      if (b.t <= 0) {
        b.resolved = true;
        if (b.myBid >= b.aiBid) {
          b.won = true;
          this.flash('#22c55e', 0.3);
          this.sfx.play('win');
          this.emitFloater(W / 2, H * 0.45, 'TAKEOVER REPELLED', '#22c55e');
        } else {
          b.won = false;
          const taken = this.cash * 0.25;
          this.cash = Math.max(0, this.cash - taken);
          this.flash('#ef4444', 0.4);
          this.shake(10, 0.45);
          this.sfx.play('lose');
          this.emitFloater(W / 2, H * 0.45, '−25% CASH', '#ef4444');
        }
        // dismiss boss panel after 2s
        setTimeout(() => { this.boss = null; }, 2000);
      }
    }

    bossOutbid() {
      const b = this.boss;
      if (!b || b.resolved) return;
      const inc = Math.max(50, this.cash * 0.1);
      b.myBid += inc;
      this.sfx.play('bigclick');
      this.shake(2, 0.08);
      this.emitFloater(W / 2, H * 0.55, '+$' + fmt(inc), '#ffd86b');
    }

    /* ----------------------------------------------------------------- */
    /*  Reveal logic                                                      */
    /* ----------------------------------------------------------------- */
    _revealEligibleTiers(force) {
      // Reveal up to highest tier with (unlockCity <= cityIdx+1) AND (cash >= 0.5*cost OR already-owned)
      let unlocked = this.unlockedTier;
      for (let i = unlocked; i < F.TIERS.length; i++) {
        const t = F.TIERS[i];
        if (t.unlockCity > this.cityIdx + 1) break;
        if ((this.autos[t.id] || 0) > 0 || this.cash >= t.cost * 0.5 || force) {
          unlocked = i + 1;
        } else break;
      }
      if (unlocked > this.unlockedTier) {
        if (!force) {
          const newTier = F.TIERS[this.unlockedTier];
          if (newTier) {
            this.sfx.play('tier');
            this.flash(newTier.color || '#ffd86b', 0.1);
          }
        }
        this.unlockedTier = unlocked;
      }
    }

    /* ----------------------------------------------------------------- */
    /*  Visual helpers                                                    */
    /* ----------------------------------------------------------------- */
    emitFloater(x, y, text, color) {
      this.floaters.push({ x, y, vy: -80, life: 1.0, age: 0, text, color: color || '#ffd86b' });
    }

    /* ----------------------------------------------------------------- */
    /*  Update                                                            */
    /* ----------------------------------------------------------------- */
    update(dt) {
      if (this.phase === 'shop') { this._updateShop(dt); this.setHud(this._hud()); return; }
      if (this.phase === 'debrief') { this._updateDebrief(dt); this.setHud(this._hud()); return; }
      if (this.phase === 'transition') { this._updateTransition(dt); this.setHud(this._hud()); return; }
      this._updatePlay(dt);
    }

    _updateShop(dt) {
      this._tickBackground(dt);
      if (Input.mouse.justPressed) {
        for (const r of this.shopRects) {
          if (Input.mouse.x >= r.x && Input.mouse.x <= r.x + r.w &&
              Input.mouse.y >= r.y && Input.mouse.y <= r.y + r.h) {
            if (r.kind === 'launch') { this.beginCampaign(); return; }
            if (r.kind === 'meta') {
              const u = F.META[r.i];
              const lvl = this.save.meta[u.id] || 0;
              if (lvl >= u.tiers.length) return;
              const cost = u.costs[lvl];
              if (Storage.spendGameWallet('franchise', cost | 0)) {
                this.save.meta[u.id] = lvl + 1;
                this._writeSave();
                this.sfx.play('buy', { freq: 660 + lvl * 40 });
                this.flash(u.color, 0.12);
              } else {
                this.sfx.play('deny');
              }
              return;
            }
          }
        }
      }
    }

    _updateTransition(dt) {
      this._tickBackground(dt);
      // Auto income still ticks during the transition so the player feels
      // the carry-over.
      this.cash += this.rate() * dt * 0.2;
      this.transitionT -= dt;
      if (this.transitionT <= 0) {
        this.startCity(this.transitionTo);
        this.phase = 'play';
      }
    }

    _updateDebrief(dt) {
      this._tickBackground(dt);
      if (Input.mouse.justPressed) {
        for (const r of this.shopRects) {
          if (Input.mouse.x >= r.x && Input.mouse.x <= r.x + r.w &&
              Input.mouse.y >= r.y && Input.mouse.y <= r.y + r.h) {
            if (r.kind === 'shop') {
              this.phase = 'shop';
              return;
            }
            if (r.kind === 'finish') {
              // Awards global coins via main.js end overlay.
              this.win();
              return;
            }
          }
        }
      }
    }

    _updatePlay(dt) {
      this._tickBackground(dt);
      this.timeLeft -= dt;

      // Auto income
      this.tickAcc += dt;
      if (this.tickAcc >= 0.1) {
        const inc = this.rate() * this.tickAcc;
        if (inc > 0) {
          this.cash += inc;
          if (Math.random() < 0.4) {
            const owned = F.TIERS.filter(t => (this.autos[t.id] || 0) > 0);
            if (owned.length) {
              const t = owned[(Math.random() * owned.length) | 0];
              const r = this.shopCardRects[t.id];
              if (r) this.emitFloater(r.x + r.w/2, r.y + 12, '+$' + fmt(this.rawRatePerTier(t) * 0.1), t.color);
            }
          }
        }
        this.tickAcc = 0;
      }

      // Net worth tracking + target
      const nw = this.netWorth();
      if (nw > this.peakNetWorth) this.peakNetWorth = nw;
      const city = F.cityByIndex(this.cityIdx);
      if (!this.targetMet && nw >= city.target) {
        this.targetMet = true;
        this.flash(city.accent || '#ffd86b', 0.25);
        this.emitFloater(W / 2, 100, 'TARGET HIT — keep stacking!', city.accent || '#ffd86b');
        this.sfx.play('tier', { freq: 1200 });
      }

      this.flagshipPulse = Math.max(0, this.flagshipPulse - dt * 2);

      // Click handling — ignore clicks consumed by HUD buttons / boss panel
      if (Input.mouse.justPressed) this._handleClick(Input.mouse.x, Input.mouse.y);

      // Floater physics
      for (let i = this.floaters.length - 1; i >= 0; i--) {
        const f = this.floaters[i];
        f.age += dt;
        f.y += f.vy * dt;
        f.vy += 20 * dt;
        if (f.age >= f.life) this.floaters.splice(i, 1);
      }

      // Reveal next tier as cash approaches
      this._revealEligibleTiers();

      // Workers visualization
      const ownedTiers = F.TIERS.filter(t => (this.autos[t.id] || 0) > 0);
      if (ownedTiers.length && Math.random() < dt * (1.5 + ownedTiers.length * 0.4)) {
        const t = ownedTiers[(Math.random() * ownedTiers.length) | 0];
        const r = this.shopCardRects[t.id];
        if (r) {
          this.workers.push({
            x: r.x + r.w * 0.3 + Math.random() * r.w * 0.4,
            y: r.y + r.h - 8,
            tx: this.flagship.x + (Math.random() - 0.5) * 60,
            ty: this.flagship.y + this.flagship.r - 8,
            walkT: Math.random() * 6, color: t.color, carry: true, life: 4
          });
        }
      }
      for (let i = this.workers.length - 1; i >= 0; i--) {
        const wk = this.workers[i];
        wk.life -= dt; wk.walkT += dt * 10;
        const dx = wk.tx - wk.x, dy = wk.ty - wk.y;
        const d = Math.hypot(dx, dy);
        if (d < 12 || wk.life <= 0) {
          if (wk.carry) {
            this.emitFloater(wk.tx, wk.ty - 20, '+$', wk.color);
            this.coinBurstT = 0.6;
          }
          this.workers.splice(i, 1);
          continue;
        }
        const sp = 80;
        wk.x += dx / d * sp * dt; wk.y += dy / d * sp * dt;
      }
      if (this.coinBurstT > 0) this.coinBurstT -= dt;

      // Envelope life
      if (this.envelope) {
        this.envelope.life -= dt;
        if (this.envelope.life <= 0) this.envelope = null;
      }

      this._tickManagers(dt);
      this._tickEvents(dt);
      this._maybeStartBoss();
      this._tickBoss(dt);

      // Time over → resolve city
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        const won = this.netWorth() >= F.cityByIndex(this.cityIdx).target;
        this.endCity(won ? 'win' : 'lose');
      }

      this.setHud(this._hud());
    }

    _handleClick(mx, my) {
      // Boss panel takes priority during boss
      if (this.boss && !this.boss.resolved) {
        if (this._inBossButton(mx, my)) { this.bossOutbid(); return; }
      }
      // Envelope
      if (this.envelope) {
        const dx = mx - this.envelope.x, dy = my - this.envelope.y;
        if (Math.hypot(dx, dy) <= this.envelope.r) {
          this.cash += this.envelope.value;
          this.emitFloater(this.envelope.x, this.envelope.y - 16, '+$' + fmt(this.envelope.value), '#22c55e');
          this.sfx.play('envelope');
          this.flash('#22c55e', 0.18);
          this.envelope = null;
          return;
        }
      }
      // Flagship (skipped during boss)
      const dx = mx - this.flagship.x, dy = my - this.flagship.y;
      if (Math.hypot(dx, dy) <= this.flagship.r && !(this.boss && !this.boss.resolved)) {
        let pow = this.clickPower;
        if (this.viralClicks > 0) {
          pow *= 10;
          this.viralClicks--;
        }
        this.cash += pow;
        this.flagshipPulse = 1;
        const color = this.viralClicks > 0 || pow > this.clickPower ? '#f472b6' : '#ffd86b';
        this.emitFloater(mx, my, '+$' + fmt(pow), color);
        this.sfx.play(pow > this.clickPower ? 'bigclick' : 'click', { freq: 600 + Math.random() * 80 });
        return;
      }
      // Upgrade / manager buttons
      if (ptInRect(mx, my, this.upgradeRect)) { this.tryUpgradeClick(); return; }
      if (ptInRect(mx, my, this.managerRect)) {
        // Buy/queue a manager: we don't pick the tier yet — the next tier card
        // they click will receive the manager. Mark hire-pending state.
        if (this.canHireFree()) {
          this._mgrPending = { free: true };
          this.sfx.play('event', { freq: 800 });
          return;
        }
        if (this.canBuyManager()) {
          this._mgrPending = { free: false };
          this.sfx.play('event', { freq: 700 });
          return;
        }
        this.sfx.play('deny');
        return;
      }
      // Shop cards
      for (const id of Object.keys(this.shopCardRects)) {
        const r = this.shopCardRects[id];
        if (r.idx >= this.unlockedTier) continue;
        if (ptInRect(mx, my, r)) {
          if (this._mgrPending) {
            const opts = this._mgrPending;
            this._mgrPending = null;
            this.hireManager(r.tier.id, opts);
          } else {
            this.tryBuy(r.tier);
          }
          return;
        }
      }
    }

    _hud() {
      if (this.phase === 'shop')      return '<span>Pre-campaign shop</span>';
      if (this.phase === 'debrief')   return '<span>Debrief</span>';
      if (this.phase === 'transition')return '<span>Travelling…</span>';
      const city = F.cityByIndex(this.cityIdx);
      const target = '$' + fmt(city.target);
      const nw = '$' + fmt(this.netWorth());
      const t = Math.max(0, this.timeLeft).toFixed(1);
      const evBadge = this.activeEvent
        ? `<span style="color:${this.activeEvent.color}"><b>${this.activeEvent.label}</b></span>`
        : '';
      return `<span>City <b>${this.cityIdx + 1}/5</b> ${city.name}</span>` +
             `<span>Time <b>${t}</b></span>` +
             `<span>$/s <b>${fmt(this.rate(), 1)}</b></span>` +
             `<span>Net <b>${nw}</b> / ${target}${this.targetMet ? ' <b style="color:#22c55e">✓</b>' : ''}</span>` +
             evBadge;
    }

    /* ----------------------------------------------------------------- */
    /*  Shared background / parallax                                      */
    /* ----------------------------------------------------------------- */
    _tickBackground(dt) {
      for (const c of this.bgClouds) {
        c.x += c.sp * dt;
        if (c.x - c.r > W) c.x = -c.r;
      }
      for (const b of this.bgBirds) {
        b.x += b.sp * dt; b.ph += dt * 8;
        if (b.x > W + 20) b.x = -20;
      }
    }

    /* ----------------------------------------------------------------- */
    /*  Render dispatch                                                   */
    /* ----------------------------------------------------------------- */
    render(ctx) {
      this._renderSky(ctx);
      if (this.phase === 'shop')       return this._renderShop(ctx);
      if (this.phase === 'debrief')    return this._renderDebrief(ctx);
      this._renderPlay(ctx);
      if (this.phase === 'transition') this._renderTransitionOverlay(ctx);
    }

    _renderSky(ctx) {
      const city = F.cityByIndex(this.phase === 'play' || this.phase === 'transition' ? this.cityIdx : 0);
      const bg = (city && city.bg) || ['#1a2840', '#0c1d14'];
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, bg[0]); g.addColorStop(0.55, '#4a3a42'); g.addColorStop(1, bg[1]);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

      // sun
      ctx.save(); ctx.shadowColor = '#ffd86b'; ctx.shadowBlur = 32;
      ctx.fillStyle = '#ffd86b';
      ctx.beginPath(); ctx.arc(W * 0.14, 80, 30, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      // clouds
      for (const c of this.bgClouds) {
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, c.r, c.r * 0.4, 0, 0, Math.PI * 2);
        ctx.ellipse(c.x + c.r * 0.5, c.y - c.r * 0.2, c.r * 0.6, c.r * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // skyline (per-city tint)
      const skylineMid = (city && city.accent) || '#ffd86b';
      ctx.fillStyle = '#1b2238';
      for (let i = 0; i < 24; i++) {
        const bx = (i * 42) - 10;
        const bh = 40 + ((i * 37) % 60);
        ctx.fillRect(bx, H * 0.42 - bh, 36, bh + 20);
      }
      ctx.fillStyle = '#242c48';
      for (let i = 0; i < 14; i++) {
        const bx = i * 74 - 20;
        const bh = 70 + ((i * 53) % 80);
        ctx.fillRect(bx, H * 0.5 - bh, 60, bh + 30);
        ctx.fillStyle = skylineMid + '44';
        for (let wy = H * 0.5 - bh + 8; wy < H * 0.5; wy += 10) {
          for (let wx = bx + 6; wx < bx + 54; wx += 10) {
            if (((wx + wy + i) | 0) % 3 === 0) ctx.fillRect(wx, wy, 4, 5);
          }
        }
        ctx.fillStyle = '#242c48';
      }
      ctx.fillStyle = '#1d2a22';
      ctx.fillRect(0, H * 0.58, W, H * 0.12);
      ctx.fillStyle = '#142018';
      for (let i = 0; i < 16; i++) {
        const bx = i * 62;
        ctx.fillRect(bx, H * 0.58 + 6, 56, 18);
        ctx.fillStyle = ['#ff9f43', '#60a5fa', '#ffd86b', '#f472b6'][i % 4] + '88';
        ctx.fillRect(bx + 2, H * 0.58 + 2, 52, 6);
        ctx.fillStyle = '#142018';
      }
      // birds
      for (const b of this.bgBirds) {
        const wing = Math.sin(b.ph) * 4;
        ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(b.x - 6, b.y); ctx.lineTo(b.x, b.y - wing); ctx.lineTo(b.x + 6, b.y);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(12,29,20,0.55)';
      ctx.fillRect(0, H * 0.66, W, H * 0.34);
    }

    /* ----------------------------------------------------------------- */
    /*  Render: SHOP                                                       */
    /* ----------------------------------------------------------------- */
    _renderShop(ctx) {
      // dim sky a touch for shop readability
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, W, H);

      ctx.fillStyle = '#ffd86b';
      ctx.font = 'bold 38px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText('FRANCHISE FRENZY', W / 2, 36);
      ctx.fillStyle = '#cbd5d0';
      ctx.font = '14px ui-monospace, monospace';
      ctx.fillText('5 cities · 60s each · cash & businesses persist', W / 2, 84);

      // progress strip
      const cleared = this.save.citiesCleared || 0;
      const sx = W / 2 - 220, sy = 116;
      F.CITIES.forEach((c, i) => {
        const cx = sx + i * 96;
        const done = i < cleared;
        ctx.fillStyle = done ? c.accent : '#1d2533';
        ctx.fillRect(cx, sy, 88, 30);
        ctx.strokeStyle = done ? c.accent : '#3a4458'; ctx.lineWidth = 2;
        ctx.strokeRect(cx + 0.5, sy + 0.5, 88, 30);
        ctx.fillStyle = done ? '#0a1408' : c.accent;
        ctx.font = 'bold 12px ui-monospace, monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(c.name, cx + 44, sy + 15);
      });
      ctx.fillStyle = '#cbd5d0';
      ctx.font = '12px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText('Best campaign: ' + (cleared > 0 ? cleared + '/5 cities cleared' : 'no runs yet'), W / 2, 152);

      // Stardollars header (sourced from per-game wallet)
      ctx.fillStyle = '#ffd86b';
      ctx.font = 'bold 18px ui-monospace, monospace';
      ctx.fillText('★ ' + fmt(this._stardollars()) + ' STARDOLLARS', W / 2, 180);

      // Meta upgrade cards (5 cards across two rows: 3 + 2)
      this.shopRects = [];
      const rows = [F.META.slice(0, 3), F.META.slice(3)];
      const cardW = 270, cardH = 110, gap = 14;
      let yCursor = 220;
      rows.forEach((row, ri) => {
        const totalW = row.length * cardW + (row.length - 1) * gap;
        const startX = (W - totalW) / 2;
        row.forEach((u, ci) => {
          const x = startX + ci * (cardW + gap);
          const y = yCursor;
          const lvl = this.save.meta[u.id] || 0;
          const maxed = lvl >= u.tiers.length;
          const cost = maxed ? 0 : u.costs[lvl];
          const can = !maxed && this._stardollars() >= cost;
          ctx.fillStyle = maxed ? '#0e2a1a' : can ? '#1a1a14' : '#1a1014';
          ctx.fillRect(x, y, cardW, cardH);
          ctx.strokeStyle = u.color; ctx.lineWidth = 2;
          ctx.strokeRect(x + 1, y + 1, cardW - 2, cardH - 2);

          ctx.fillStyle = u.color;
          ctx.font = 'bold 16px ui-monospace, monospace';
          ctx.textAlign = 'left'; ctx.textBaseline = 'top';
          ctx.fillText(u.label, x + 14, y + 12);

          // Level pips
          for (let j = 0; j < u.tiers.length; j++) {
            ctx.fillStyle = j < lvl ? u.color : '#33384a';
            ctx.fillRect(x + cardW - 14 - (u.tiers.length - j) * 14, y + 16, 10, 10);
          }

          ctx.fillStyle = '#cbd5d0';
          ctx.font = '12px ui-monospace, monospace';
          ctx.fillText(u.desc, x + 14, y + 38);

          // current/next effect summary
          ctx.fillStyle = '#aaf7b8';
          ctx.font = '12px ui-monospace, monospace';
          const cur = lvl > 0 ? this._formatMetaEffect(u.id, u.tiers[lvl - 1]) : 'inactive';
          const nxt = !maxed ? this._formatMetaEffect(u.id, u.tiers[lvl]) : 'maxed';
          ctx.fillText('Now: ' + cur + '   Next: ' + nxt, x + 14, y + 60);

          ctx.font = 'bold 14px ui-monospace, monospace';
          ctx.fillStyle = maxed ? '#22c55e' : can ? '#ffd86b' : '#776655';
          ctx.textAlign = 'right';
          ctx.fillText(maxed ? 'MAXED' : '★ ' + cost, x + cardW - 14, y + cardH - 22);

          if (!maxed) this.shopRects.push({ kind: 'meta', i: F.META.indexOf(u), x, y, w: cardW, h: cardH });
        });
        yCursor += cardH + gap;
      });

      // BEGIN button
      const bw = 320, bh = 60;
      const bx = W / 2 - bw / 2, by = H - 80;
      ctx.fillStyle = '#1d4030';
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = '#ffd86b'; ctx.lineWidth = 3;
      ctx.strokeRect(bx + 1, by + 1, bw - 2, bh - 2);
      ctx.fillStyle = '#ffd86b';
      ctx.font = 'bold 22px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('▶ BEGIN CAMPAIGN', W / 2, by + bh / 2);
      this.shopRects.push({ kind: 'launch', x: bx, y: by, w: bw, h: bh });
    }

    _formatMetaEffect(id, val) {
      switch (id) {
        case 'seed':  return '+$' + fmt(val);
        case 'click': return '×' + val + ' click';
        case 'rate':  return '×' + val.toFixed(2) + ' rate';
        case 'time':  return '+' + val + 's per city';
        case 'mgrs':  return val + ' free manager' + (val === 1 ? '' : 's');
      }
      return String(val);
    }

    /* ----------------------------------------------------------------- */
    /*  Render: PLAY                                                      */
    /* ----------------------------------------------------------------- */
    _renderPlay(ctx) {
      // Time-pressure tint when <= 10s left
      if (this.timeLeft <= 10 && this.phase === 'play') {
        const a = (1 - this.timeLeft / 10) * 0.25;
        ctx.fillStyle = `rgba(255,80,80,${Math.max(0, a)})`;
        ctx.fillRect(0, 0, W, H);
      }
      // Active-event vignette
      if (this.activeEvent) {
        const grad = ctx.createRadialGradient(W/2, H/2, 200, W/2, H/2, 600);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, this.activeEvent.color + '55');
        ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
      }

      this._renderFlagship(ctx);
      this._renderUpgradeButton(ctx);
      this._renderManagerButton(ctx);
      this._renderShopCards(ctx);
      this._renderWorkers(ctx);
      this._renderEnvelope(ctx);
      this._renderEventBanner(ctx);
      this._renderBoss(ctx);
      this._renderFloaters(ctx);
      this._renderTimerRing(ctx);
    }

    _renderFlagship(ctx) {
      const fl = this.flagship;
      const pulse = 1 + this.flagshipPulse * 0.14;
      ctx.save();
      ctx.shadowColor = '#ffd86b'; ctx.shadowBlur = 30;
      ctx.fillStyle = '#2a3a2a';
      ctx.beginPath(); ctx.arc(fl.x, fl.y, fl.r * pulse + 14, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      const fx = fl.x, fy = fl.y;
      ctx.save();
      ctx.translate(fx, fy);
      ctx.scale(pulse, pulse);
      ctx.fillStyle = '#e9d5a8';
      ctx.fillRect(-fl.r*0.85, -fl.r*0.2, fl.r*1.7, fl.r*1.1);
      ctx.fillStyle = '#8a3b2a';
      ctx.beginPath();
      ctx.moveTo(-fl.r*0.95, -fl.r*0.2);
      ctx.lineTo(0, -fl.r*0.8);
      ctx.lineTo(fl.r*0.95, -fl.r*0.2);
      ctx.closePath(); ctx.fill();
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = i % 2 === 0 ? '#ffd86b' : '#ff9f43';
        const x = -fl.r*0.85 + i * (fl.r*1.7/5);
        ctx.beginPath();
        ctx.moveTo(x, -fl.r*0.2);
        ctx.lineTo(x + fl.r*1.7/5, -fl.r*0.2);
        ctx.lineTo(x + fl.r*1.7/5 - fl.r*0.05, -fl.r*0.05);
        ctx.lineTo(x + fl.r*0.05, -fl.r*0.05);
        ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = '#4a2b1a';
      ctx.fillRect(-fl.r*0.22, fl.r*0.25, fl.r*0.44, fl.r*0.65);
      ctx.fillStyle = '#6fb3d9';
      ctx.fillRect(-fl.r*0.7, fl.r*0.05, fl.r*0.32, fl.r*0.28);
      ctx.fillRect(fl.r*0.38, fl.r*0.05, fl.r*0.32, fl.r*0.28);
      ctx.strokeStyle = '#4a2b1a'; ctx.lineWidth = 2;
      ctx.strokeRect(-fl.r*0.7, fl.r*0.05, fl.r*0.32, fl.r*0.28);
      ctx.strokeRect(fl.r*0.38, fl.r*0.05, fl.r*0.32, fl.r*0.28);
      ctx.fillStyle = '#0a1408';
      ctx.fillRect(-fl.r*0.5, -fl.r*0.15, fl.r, fl.r*0.15);
      ctx.fillStyle = '#ffd86b';
      ctx.font = 'bold '+Math.round(fl.r*0.18)+'px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('FLAGSHIP', 0, -fl.r*0.075);
      const coinBob = Math.sin(this.time * 3) * 4;
      ctx.save();
      ctx.shadowColor = '#ffd86b'; ctx.shadowBlur = 18;
      ctx.fillStyle = '#ffd86b';
      ctx.beginPath(); ctx.arc(0, -fl.r*0.95 + coinBob, fl.r*0.22, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#b8860b';
      ctx.beginPath(); ctx.arc(0, -fl.r*0.95 + coinBob, fl.r*0.18, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#ffd86b';
      ctx.font = 'bold '+Math.round(fl.r*0.22)+'px ui-monospace, monospace';
      ctx.fillText('$', 0, -fl.r*0.92 + coinBob);
      ctx.restore();
      ctx.restore();

      // Viral indicator
      if (this.viralClicks > 0) {
        ctx.fillStyle = '#f472b6';
        ctx.font = 'bold 18px ui-monospace, monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('VIRAL ×' + this.viralClicks, fx, fy - fl.r - 28);
      }

      ctx.fillStyle = this.boss && !this.boss.resolved ? '#7a7a7a' : '#ffd86b';
      ctx.font = 'bold 14px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(this.boss && !this.boss.resolved ? '— DEFEND THE BUSINESS —' : 'CLICK TO EARN', fx, fy + fl.r + 18);
      ctx.fillStyle = '#cbd5d0';
      ctx.font = 'bold 13px ui-monospace, monospace';
      ctx.fillText('Per click: $' + fmt(this.clickPower * (this.viralClicks > 0 ? 10 : 1)), fx, fy + fl.r + 36);

      // coin burst
      if (this.coinBurstT > 0) {
        const a = this.coinBurstT / 0.6;
        for (let i = 0; i < 10; i++) {
          const ang = (i / 10) * Math.PI * 2;
          const rr = (1 - a) * 60;
          ctx.fillStyle = '#ffd86b';
          ctx.globalAlpha = a;
          ctx.beginPath();
          ctx.arc(fl.x + Math.cos(ang) * rr, fl.y - fl.r * 0.8 + Math.sin(ang) * rr * 0.5, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
    }

    _renderUpgradeButton(ctx) {
      const ur = this.upgradeRect;
      const can = this.cash >= this.clickUpgradeCost;
      ctx.fillStyle = can ? '#2a4a33' : '#1a2a1f';
      ctx.fillRect(ur.x, ur.y, ur.w, ur.h);
      ctx.strokeStyle = can ? '#ffd86b' : '#334b3a'; ctx.lineWidth = 2;
      ctx.strokeRect(ur.x + 1, ur.y + 1, ur.w - 2, ur.h - 2);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.font = 'bold 15px ui-monospace, monospace';
      ctx.fillText('Upgrade Click ×2', ur.x + 12, ur.y + 18);
      ctx.font = '12px ui-monospace, monospace';
      ctx.fillStyle = can ? '#ffd86b' : '#667';
      ctx.fillText('Cost: $' + fmt(this.clickUpgradeCost), ur.x + 12, ur.y + 36);
    }

    _renderManagerButton(ctx) {
      const ur = this.managerRect;
      const inCity2plus = this.cityIdx + 1 >= 2;
      const free = this.canHireFree();
      const buy = this.canBuyManager();
      const can = free || buy;
      const pending = !!this._mgrPending;
      ctx.fillStyle = pending ? '#3a2a4a' : (can ? '#2a2a4a' : '#1a1a2a');
      ctx.fillRect(ur.x, ur.y, ur.w, ur.h);
      ctx.strokeStyle = pending ? '#a855f7' : (can ? '#a855f7' : '#3a3a4a'); ctx.lineWidth = 2;
      ctx.strokeRect(ur.x + 1, ur.y + 1, ur.w - 2, ur.h - 2);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.font = 'bold 15px ui-monospace, monospace';
      const label = !inCity2plus ? 'Managers (city 2+)' :
                    pending ? 'CLICK A TIER →' :
                    free ? 'Hire Free Manager (' + (this.freeMgrSlots - this.managers.length) + ')' :
                    'Hire Manager';
      ctx.fillText(label, ur.x + 12, ur.y + 18);
      ctx.font = '12px ui-monospace, monospace';
      const cost = F.managerCost(this.paidMgrs());
      ctx.fillStyle = pending ? '#cfaaff' : (free ? '#a855f7' : (buy ? '#ffd86b' : '#667'));
      const costText = !inCity2plus ? 'Unlocks at Midtown'
                     : free ? 'Auto-buys this tier'
                     : 'Cost: $' + fmt(cost) + ' · ' + this.managers.length + '/' + F.MAX_MANAGERS + ' hired';
      ctx.fillText(costText, ur.x + 12, ur.y + 36);
    }

    _renderShopCards(ctx) {
      F.TIERS.forEach((tier, i) => {
        const r = this.shopCardRects[tier.id];
        const lockedByCity = tier.unlockCity > this.cityIdx + 1;
        const hidden = i >= this.unlockedTier;
        if (hidden || lockedByCity) {
          ctx.fillStyle = '#0f1a14';
          ctx.fillRect(r.x, r.y, r.w, r.h);
          ctx.strokeStyle = '#223';
          ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
          ctx.fillStyle = '#334b3a';
          ctx.font = 'bold 13px ui-monospace, monospace';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(lockedByCity ? 'unlocks ' + F.cityByIndex(tier.unlockCity - 1).name : '??? LOCKED ???', r.x + r.w/2, r.y + r.h/2);
          return;
        }
        const count = this.autos[tier.id] || 0;
        const cost = this.buyCostFor(tier);
        const can = this.cash >= cost;
        const hasMgr = this.managers.some(m => m.tierId === tier.id);
        ctx.fillStyle = can ? shade(tier.color, -0.3) : '#1a2a1f';
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.strokeStyle = hasMgr ? '#a855f7' : (can ? tier.color : '#334');
        ctx.lineWidth = hasMgr ? 3 : 2;
        ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);

        ctx.fillStyle = shade(tier.color, -0.55);
        ctx.fillRect(r.x + 8, r.y + 8, 44, 44);
        ctx.strokeStyle = tier.color; ctx.lineWidth = 1;
        ctx.strokeRect(r.x + 8.5, r.y + 8.5, 43, 43);
        drawTierIcon(ctx, tier.id, r.x + 30, r.y + 30, 18, tier.color);

        ctx.fillStyle = '#fff';
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.font = 'bold 13px ui-monospace, monospace';
        ctx.fillText(tier.name, r.x + 60, r.y + 10);
        ctx.font = '11px ui-monospace, monospace';
        ctx.fillStyle = '#aaf7b8';
        const eaRate = tier.baseRate * F.synergyFor(count);
        ctx.fillText('+$' + fmt(eaRate, eaRate < 10 ? 1 : 0) + '/s ea.', r.x + 60, r.y + 26);
        ctx.fillStyle = can ? '#ffd86b' : '#667';
        ctx.fillText('$ ' + fmt(cost), r.x + 60, r.y + 40);

        // Synergy indicator
        const next = F.nextSynergyAt(count);
        if (next) {
          ctx.fillStyle = '#ffd86b';
          ctx.font = '10px ui-monospace, monospace';
          ctx.fillText('SYN: ' + count + '/' + next + ' (×' + F.synergyFor(next) + ')', r.x + 60, r.y + 54);
        } else if (count >= 50) {
          ctx.fillStyle = '#ffd86b';
          ctx.font = 'bold 10px ui-monospace, monospace';
          ctx.fillText('SYN ×4 MAX', r.x + 60, r.y + 54);
        }

        ctx.textAlign = 'right';
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 16px ui-monospace, monospace';
        ctx.fillText('×' + count, r.x + r.w - 8, r.y + 8);
        if (hasMgr) {
          ctx.fillStyle = '#a855f7';
          ctx.font = 'bold 10px ui-monospace, monospace';
          ctx.fillText('MGR', r.x + r.w - 8, r.y + 28);
        }
      });
    }

    _renderWorkers(ctx) {
      for (const wk of this.workers) {
        const bob = Math.sin(wk.walkT) * 2;
        ctx.fillStyle = '#00000055';
        ctx.beginPath(); ctx.ellipse(wk.x, wk.y + 8, 6, 2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = wk.color;
        ctx.fillRect(wk.x - 4, wk.y - 10 + bob, 8, 10);
        ctx.fillStyle = '#ffd9a8';
        ctx.fillRect(wk.x - 3, wk.y - 16 + bob, 6, 6);
        if (wk.carry) {
          ctx.save();
          ctx.shadowColor = '#ffd86b'; ctx.shadowBlur = 8;
          ctx.fillStyle = '#ffd86b';
          ctx.beginPath(); ctx.arc(wk.x, wk.y - 22 + bob, 3, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
      }
    }

    _renderEnvelope(ctx) {
      const e = this.envelope;
      if (!e) return;
      const flick = 0.5 + 0.5 * Math.sin(this.time * 12);
      ctx.save();
      ctx.shadowColor = '#22c55e'; ctx.shadowBlur = 14 + flick * 10;
      ctx.fillStyle = '#fff';
      ctx.fillRect(e.x - e.r, e.y - e.r * 0.7, e.r * 2, e.r * 1.4);
      ctx.strokeStyle = '#22c55e'; ctx.lineWidth = 2;
      ctx.strokeRect(e.x - e.r + 0.5, e.y - e.r * 0.7 + 0.5, e.r * 2 - 1, e.r * 1.4 - 1);
      ctx.beginPath();
      ctx.moveTo(e.x - e.r, e.y - e.r * 0.7);
      ctx.lineTo(e.x, e.y);
      ctx.lineTo(e.x + e.r, e.y - e.r * 0.7);
      ctx.stroke();
      ctx.fillStyle = '#22c55e';
      ctx.font = 'bold 16px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('$', e.x, e.y + 6);
      ctx.restore();
      // life bar
      const pct = Math.max(0, e.life / 5);
      ctx.fillStyle = '#22c55e88';
      ctx.fillRect(e.x - e.r, e.y + e.r * 0.9, e.r * 2 * pct, 3);
    }

    _renderEventBanner(ctx) {
      if (!this.activeEvent) return;
      const ae = this.activeEvent;
      const pct = Math.max(0, ae.t / ae.dur);
      const w = 360, h = 40, x = (W - w) / 2, y = 6;
      ctx.fillStyle = '#0a1408';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = ae.color; ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
      ctx.fillStyle = ae.color;
      ctx.fillRect(x, y + h - 4, w * pct, 4);
      ctx.fillStyle = ae.color;
      ctx.font = 'bold 14px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const badge = ae.badge ? '  (' + ae.badge() + ')' : '';
      ctx.fillText(ae.label + badge, x + w / 2, y + h / 2 - 2);
    }

    _renderTimerRing(ctx) {
      const cx = W * 0.19, cy = 80, r = 30;
      const total = 60 + (F.metaEffect(this.save, 'time') || 0);
      const pct = Math.max(0, this.timeLeft / total);
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#1a1a2a';
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = this.timeLeft <= 10 ? '#ef4444' : '#ffd86b';
      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 18px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(Math.ceil(this.timeLeft).toString(), cx, cy);
    }

    _renderBoss(ctx) {
      const b = this.boss;
      if (!b) return;
      const px = W * 0.19, py = H * 0.43, pw = 280, ph = 220;
      const x = px - pw / 2, y = py - ph / 2;
      ctx.fillStyle = 'rgba(10,5,8,0.92)';
      ctx.fillRect(x, y, pw, ph);
      ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 3;
      ctx.strokeRect(x + 1.5, y + 1.5, pw - 3, ph - 3);

      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 20px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText('HOSTILE TAKEOVER', px, y + 12);
      ctx.fillStyle = '#fde7ff';
      ctx.font = '12px ui-monospace, monospace';
      ctx.fillText('Outbid the AI before time runs out!', px, y + 38);

      ctx.fillStyle = '#cbd5d0';
      ctx.font = 'bold 14px ui-monospace, monospace';
      ctx.textAlign = 'left';
      ctx.fillText('Their bid:', x + 18, y + 70);
      ctx.fillText('Your bid:', x + 18, y + 96);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ef4444';
      ctx.fillText('$' + fmt(b.aiBid), x + pw - 18, y + 70);
      ctx.fillStyle = b.myBid >= b.aiBid ? '#22c55e' : '#ffd86b';
      ctx.fillText('$' + fmt(b.myBid), x + pw - 18, y + 96);

      // OUTBID button
      const bx = x + 30, by = y + 130, bw = pw - 60, bh = 56;
      const flash = 0.5 + 0.5 * Math.sin(this.time * 8);
      ctx.fillStyle = b.resolved ? '#3a3a3a' : '#7a1a1a';
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = b.resolved ? '#555' : `rgba(255,${100 + flash * 80},${100 + flash * 80},1)`;
      ctx.lineWidth = 3;
      ctx.strokeRect(bx + 1.5, by + 1.5, bw - 3, bh - 3);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 22px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(b.resolved ? (b.won ? 'REPELLED' : 'OUTBID!') : 'OUTBID  +10%', px, by + bh / 2);

      // timer pip row
      const tw = pw - 40, th = 6, tx = x + 20, ty = y + ph - 20;
      ctx.fillStyle = '#1a1a2a'; ctx.fillRect(tx, ty, tw, th);
      ctx.fillStyle = '#ef4444'; ctx.fillRect(tx, ty, tw * (b.t / b.dur), th);

      // remember button rect for click test
      this._bossBtnRect = { x: bx, y: by, w: bw, h: bh };
    }

    _inBossButton(mx, my) {
      const r = this._bossBtnRect;
      return r && mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h;
    }

    _renderFloaters(ctx) {
      for (const f of this.floaters) {
        const a = 1 - f.age / f.life;
        ctx.globalAlpha = a;
        ctx.fillStyle = f.color;
        ctx.font = 'bold 16px ui-monospace, monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(f.text, f.x, f.y);
        ctx.globalAlpha = 1;
      }
    }

    /* ----------------------------------------------------------------- */
    /*  Render: TRANSITION                                                 */
    /* ----------------------------------------------------------------- */
    _renderTransitionOverlay(ctx) {
      ctx.fillStyle = 'rgba(0,0,0,0.78)';
      ctx.fillRect(0, 0, W, H);
      const next = F.cityByIndex(this.transitionTo);
      const prev = F.cityByIndex(this.cityIdx);
      ctx.fillStyle = '#22c55e';
      ctx.font = 'bold 32px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(prev.name.toUpperCase() + ' CLEARED', W / 2, H / 2 - 80);
      ctx.fillStyle = '#cbd5d0';
      ctx.font = '15px ui-monospace, monospace';
      ctx.fillText('Net worth carried over: $' + fmt(this.netWorth()), W / 2, H / 2 - 36);
      ctx.fillStyle = '#cbd5d0';
      ctx.fillText('Auto-businesses retained · ' + this.managers.length + ' managers loyal', W / 2, H / 2 - 14);
      ctx.fillStyle = next.accent || '#ffd86b';
      ctx.font = 'bold 24px ui-monospace, monospace';
      ctx.fillText('NEXT: ' + next.name.toUpperCase(), W / 2, H / 2 + 30);
      ctx.fillStyle = '#cbd5d0';
      ctx.font = '15px ui-monospace, monospace';
      ctx.fillText('Target: $' + fmt(next.target), W / 2, H / 2 + 60);
      // unlock notice
      const newTier = F.TIERS.find(t => t.unlockCity === this.transitionTo + 1);
      if (newTier) {
        ctx.fillStyle = newTier.color;
        ctx.font = 'bold 16px ui-monospace, monospace';
        ctx.fillText('NEW TIER UNLOCKED — ' + newTier.name, W / 2, H / 2 + 96);
      }
    }

    /* ----------------------------------------------------------------- */
    /*  Render: DEBRIEF                                                    */
    /* ----------------------------------------------------------------- */
    _renderDebrief(ctx) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = this.campaignWon ? '#22c55e' : '#ffd86b';
      ctx.font = 'bold 38px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(this.campaignWon ? 'EMPIRE COMPLETE' : 'CAMPAIGN OVER', W / 2, 110);

      ctx.fillStyle = '#cbd5d0';
      ctx.font = '15px ui-monospace, monospace';
      ctx.fillText('Cities cleared: ' + this.citiesCleared + ' / ' + F.CITIES.length, W / 2, 160);
      ctx.fillText('Peak net worth: $' + fmt(this.peakNetWorth), W / 2, 184);

      ctx.fillStyle = '#ffd86b';
      ctx.font = 'bold 24px ui-monospace, monospace';
      ctx.fillText('+ ' + fmt(this.debriefStardollars) + ' ★ STARDOLLARS', W / 2, 230);
      ctx.fillStyle = '#cbd5d0';
      ctx.font = '13px ui-monospace, monospace';
      ctx.fillText('Spend in the campaign shop on permanent upgrades', W / 2, 256);

      // Per-city result chips
      F.CITIES.forEach((c, i) => {
        const cx = W / 2 - 220 + i * 96;
        const cy = 300;
        const cleared = i < this.citiesCleared;
        ctx.fillStyle = cleared ? c.accent : '#1d2533';
        ctx.fillRect(cx, cy, 88, 36);
        ctx.strokeStyle = cleared ? c.accent : '#3a4458'; ctx.lineWidth = 2;
        ctx.strokeRect(cx + 0.5, cy + 0.5, 88, 36);
        ctx.fillStyle = cleared ? '#0a1408' : '#3a4458';
        ctx.font = 'bold 13px ui-monospace, monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(c.name, cx + 44, cy + 14);
        ctx.font = '10px ui-monospace, monospace';
        ctx.fillText(cleared ? '✓ cleared' : 'fell short', cx + 44, cy + 26);
      });

      // Buttons
      this.shopRects = [];
      const bw = 220, bh = 56, gap = 24;
      const totalW = bw * 2 + gap;
      const sx = W / 2 - totalW / 2, sy = H - 140;
      // Back to shop
      ctx.fillStyle = '#1d4030';
      ctx.fillRect(sx, sy, bw, bh);
      ctx.strokeStyle = '#ffd86b'; ctx.lineWidth = 2;
      ctx.strokeRect(sx + 1, sy + 1, bw - 2, bh - 2);
      ctx.fillStyle = '#ffd86b';
      ctx.font = 'bold 16px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('★ SPEND STARDOLLARS', sx + bw / 2, sy + bh / 2);
      this.shopRects.push({ kind: 'shop', x: sx, y: sy, w: bw, h: bh });
      // Finish (returns coins via main.js end overlay)
      const sx2 = sx + bw + gap;
      ctx.fillStyle = '#3a2a14';
      ctx.fillRect(sx2, sy, bw, bh);
      ctx.strokeStyle = '#ff9f43'; ctx.lineWidth = 2;
      ctx.strokeRect(sx2 + 1, sy + 1, bw - 2, bh - 2);
      ctx.fillStyle = '#ff9f43';
      ctx.fillText('FINISH RUN', sx2 + bw / 2, sy + bh / 2);
      this.shopRects.push({ kind: 'finish', x: sx2, y: sy, w: bw, h: bh });
    }

    /* ----------------------------------------------------------------- */
    /*  Engine hooks                                                       */
    /* ----------------------------------------------------------------- */
    coinsEarned() {
      // Milestone-based: cities cleared this run + bonus per campaign won.
      // Decoupled from in-run net worth so the global theme-shop coin payout
      // can't be inflated by the autobuy economy loop.
      const c = this.citiesClearedThisRun | 0;
      const w = this.campaignsWonThisRun | 0;
      return Math.max(0, c * 5 + w * 25);
    }
  }

  /* ----------------------- Tier icon drawing ------------------------- */
  function drawTierIcon(ctx, id, cx, cy, s, color) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#0a1408';
    switch (id) {
      case 'lemonade': {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(-s*0.5, -s*0.5); ctx.lineTo(s*0.5, -s*0.5);
        ctx.lineTo(s*0.55, s*0.6); ctx.lineTo(-s*0.55, s*0.6); ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(s*0.65, 0, s*0.28, -Math.PI/2, Math.PI/2); ctx.stroke();
        ctx.fillStyle = '#fff2a8';
        ctx.beginPath(); ctx.arc(0, -s*0.05, s*0.28, 0, Math.PI*2); ctx.fill(); ctx.stroke();
        break;
      }
      case 'coffee': {
        ctx.fillStyle = color;
        ctx.fillRect(-s*0.5, -s*0.3, s, s*0.9);
        ctx.strokeRect(-s*0.5, -s*0.3, s, s*0.9);
        ctx.beginPath(); ctx.arc(s*0.6, s*0.15, s*0.22, -Math.PI/2, Math.PI/2); ctx.stroke();
        ctx.fillStyle = '#3a1d08';
        ctx.fillRect(-s*0.4, -s*0.2, s*0.8, s*0.15);
        ctx.strokeStyle = '#ffffff99'; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-s*0.2, -s*0.5); ctx.quadraticCurveTo(-s*0.1, -s*0.7, -s*0.2, -s*0.9);
        ctx.moveTo(s*0.2, -s*0.5); ctx.quadraticCurveTo(s*0.3, -s*0.7, s*0.2, -s*0.9);
        ctx.stroke();
        break;
      }
      case 'carwash': {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(-s*0.7, s*0.2); ctx.lineTo(-s*0.5, -s*0.2);
        ctx.lineTo(s*0.4, -s*0.2); ctx.lineTo(s*0.65, s*0.2);
        ctx.lineTo(-s*0.7, s*0.2); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#0a1408';
        ctx.beginPath(); ctx.arc(-s*0.4, s*0.3, s*0.18, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(s*0.35, s*0.3, s*0.18, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#ffffffcc';
        ctx.beginPath(); ctx.arc(-s*0.6, -s*0.4, s*0.1, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(s*0.6, -s*0.45, s*0.12, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(0, -s*0.55, s*0.08, 0, Math.PI*2); ctx.fill();
        break;
      }
      case 'gym': {
        ctx.fillStyle = color;
        ctx.fillRect(-s*0.7, -s*0.25, s*0.25, s*0.5);
        ctx.fillRect(s*0.45, -s*0.25, s*0.25, s*0.5);
        ctx.strokeRect(-s*0.7, -s*0.25, s*0.25, s*0.5);
        ctx.strokeRect(s*0.45, -s*0.25, s*0.25, s*0.5);
        ctx.fillRect(-s*0.45, -s*0.1, s*0.9, s*0.2);
        ctx.strokeRect(-s*0.45, -s*0.1, s*0.9, s*0.2);
        break;
      }
      case 'oil': {
        ctx.fillStyle = color;
        ctx.fillRect(-s*0.6, s*0.3, s*1.2, s*0.3);
        ctx.strokeRect(-s*0.6, s*0.3, s*1.2, s*0.3);
        ctx.beginPath();
        ctx.moveTo(-s*0.45, s*0.3); ctx.lineTo(0, -s*0.6); ctx.lineTo(s*0.45, s*0.3);
        ctx.closePath(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-s*0.25, 0); ctx.lineTo(s*0.25, 0); ctx.stroke();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(0, s*0.75, s*0.1, 0, Math.PI*2); ctx.fill();
        break;
      }
      case 'tech': {
        ctx.fillStyle = color;
        ctx.fillRect(-s*0.5, -s*0.5, s, s);
        ctx.strokeRect(-s*0.5, -s*0.5, s, s);
        ctx.strokeStyle = '#fff';
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath(); ctx.moveTo(i*s*0.35, -s*0.5); ctx.lineTo(i*s*0.35, -s*0.65); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(i*s*0.35, s*0.5); ctx.lineTo(i*s*0.35, s*0.65); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(-s*0.5, i*s*0.35); ctx.lineTo(-s*0.65, i*s*0.35); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(s*0.5, i*s*0.35); ctx.lineTo(s*0.65, i*s*0.35); ctx.stroke();
        }
        ctx.fillStyle = '#0a1408';
        ctx.fillRect(-s*0.2, -s*0.2, s*0.4, s*0.4);
        break;
      }
      case 'bank': {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(-s*0.7, -s*0.2); ctx.lineTo(0, -s*0.6); ctx.lineTo(s*0.7, -s*0.2);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillRect(-s*0.7, s*0.4, s*1.4, s*0.2);
        ctx.strokeRect(-s*0.7, s*0.4, s*1.4, s*0.2);
        ctx.fillRect(-s*0.55, -s*0.2, s*0.15, s*0.6);
        ctx.fillRect(-s*0.08, -s*0.2, s*0.15, s*0.6);
        ctx.fillRect(s*0.4, -s*0.2, s*0.15, s*0.6);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold '+Math.round(s*0.7)+'px ui-monospace, monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('$', 0, s*0.08);
        break;
      }
      case 'casino': {
        // dice + chip
        ctx.fillStyle = color;
        ctx.fillRect(-s*0.6, -s*0.35, s*0.7, s*0.7);
        ctx.strokeRect(-s*0.6, -s*0.35, s*0.7, s*0.7);
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(-s*0.4, -s*0.15, s*0.07, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(-s*0.1, s*0.15, s*0.07, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(-s*0.25, 0, s*0.07, 0, Math.PI*2); ctx.fill();
        // chip
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(s*0.35, s*0.2, s*0.3, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(s*0.35, s*0.2, s*0.18, 0, Math.PI*2); ctx.fill();
        break;
      }
      case 'movies': {
        // film reel + star
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(-s*0.15, 0, s*0.55, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#0a1408';
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(-s*0.15 + Math.cos(a) * s*0.32, Math.sin(a) * s*0.32, s*0.1, 0, Math.PI*2);
          ctx.fill();
        }
        ctx.fillStyle = '#fff';
        // star
        const sx = s*0.55, sy = -s*0.4, sr = s*0.18;
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const r = i % 2 === 0 ? sr : sr * 0.5;
          const a = -Math.PI/2 + i * Math.PI / 5;
          const x = sx + Math.cos(a) * r, y = sy + Math.sin(a) * r;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath(); ctx.fill();
        break;
      }
      case 'spaceport': {
        // rocket
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(0, -s*0.6);
        ctx.lineTo(s*0.25, -s*0.1);
        ctx.lineTo(s*0.25, s*0.35);
        ctx.lineTo(-s*0.25, s*0.35);
        ctx.lineTo(-s*0.25, -s*0.1);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(0, -s*0.1, s*0.1, 0, Math.PI*2); ctx.fill();
        // fins
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(-s*0.25, s*0.1); ctx.lineTo(-s*0.5, s*0.45); ctx.lineTo(-s*0.25, s*0.45);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(s*0.25, s*0.1); ctx.lineTo(s*0.5, s*0.45); ctx.lineTo(s*0.25, s*0.45);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        // flame
        ctx.fillStyle = '#ffd86b';
        ctx.beginPath();
        ctx.moveTo(-s*0.15, s*0.4);
        ctx.lineTo(0, s*0.7);
        ctx.lineTo(s*0.15, s*0.4);
        ctx.closePath(); ctx.fill();
        break;
      }
    }
    ctx.restore();
  }

  function ptInRect(x, y, r) { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }
  function shade(hex, pct) {
    const h = hex.replace('#','');
    let r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16);
    r = Math.max(0, Math.min(255, r + r * pct));
    g = Math.max(0, Math.min(255, g + g * pct));
    b = Math.max(0, Math.min(255, b + b * pct));
    return `rgb(${r|0},${g|0},${b|0})`;
  }

  NDP.attachGame('franchise', FranchiseGame);
})();
