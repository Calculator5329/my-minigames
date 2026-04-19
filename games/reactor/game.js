/* Reactor — orchestrator.
   The 60s arcade tycoon expanded into a 10-day campaign with persistent
   research. This file owns:
     - The main update + render loop
     - Throttle, vent, HUD, and module-card UI
     - Day flow (day-time, day-end recap transitions, meltdown handling)
     - Glue between Modules / Events / Research / Campaign

   Companion files in this folder:
     - manifest.js    metadata + preview thumbnail (unchanged)
     - modules.js     module catalog + glyphs
     - events.js      meteor / flare / leak / investor / aurora / surge / quake
     - research.js    persistent meta-progression (10 nodes)
     - campaign.js    day machine, recap UI, daily objectives
*/
(function () {
  const NDP = window.NDP;
  const { BaseGame, Input, Audio } = NDP.Engine;
  const Modules  = () => NDP.Reactor.Modules;
  const Events   = () => NDP.Reactor.Events;
  const Research = () => NDP.Reactor.Research;
  const Campaign = () => NDP.Reactor.Campaign;

  const W = 960, H = 600;
  const DAY_LENGTH = 60;

  class ReactorGame extends BaseGame {
    init() {
      /* --- Per-run derived defaults (research can mutate these) --- */
      this.baseMaxHeat       = 100;
      this.baseMaxCoolant    = 80;
      this.baseIncomeMult    = 1.0;
      this.passiveCoolingMult = 1.0;
      this.ventCooldownDur   = 3;
      this.startCoolant      = 60;
      this.opticsLifeMult    = 1.0;
      this.opticsBoost       = false;
      this.autoTraderEnabled = false;
      this.galacticEnabled   = false;
      this.autoTraderBonus   = 0;       /* income mult bonus */
      this.nextGalacticAt    = 50000;

      /* --- Run state --- */
      this.cash = 0;
      this.totalEarned = 0;
      this.throttle = 0.20;
      this.targetThrottle = 0.20;
      this.heat = 10;
      this.coolant = this.startCoolant;
      this.maxCoolant = this.baseMaxCoolant;
      this.coolantRegen = 1.0;
      this.maxHeat = this.baseMaxHeat;
      this.efficiency = 1.0;
      this.incomeMult = 1.0;
      this.shielding = 0;
      this.solarIncome = 0;
      this.laserChance = 0;
      this.pumpBonus = 0;
      this.pumpStableT = 0;
      this.pumpCapBonus = 0;
      this.modules = {};
      Modules().CATALOG.forEach(m => this.modules[m.id] = 0);

      /* --- UI/visual state --- */
      this.draggingThrottle = false;
      this.ventCooldown = 0;
      this.padTimer = 0;
      this.workers = [];
      this.floaters = [];
      this.rockets = [];
      this.smokeAcc = 0;
      this.dust = [];
      this.alarmAcc = 0;

      /* --- Campaign state --- */
      this.day = 1;
      this.dayTime = 0;
      this.isEndless = false;
      this.mode = 'playing';        /* 'playing' | 'investor' | 'recap' */
      this.recap = null;
      this.dayStats = Campaign().freshDayStats(this.day);

      /* --- Layout (positions, gauges, cards) --- */
      this.layout();

      /* --- SFX --- */
      this.sfx = this.makeSfx({
        click:    { freq: 600,  type: 'square',   dur: 0.04, slide: 80,  vol: 0.18 },
        buy:      { freq: 480,  type: 'triangle', dur: 0.12, slide: 320, vol: 0.32 },
        deny:     { freq: 180,  type: 'square',   dur: 0.08, slide: -80, vol: 0.25 },
        alarm:    { freq: 800,  type: 'square',   dur: 0.10, vol: 0.22 },
        critical: { freq: 1200, type: 'square',   dur: 0.06, slide: -400,vol: 0.30 },
        vent:     { freq: 220,  type: 'noise',    dur: 0.35, vol: 0.35, filter: 'highpass' },
        meteor:   { freq: 90,   type: 'noise',    dur: 0.28, vol: 0.45, filter: 'lowpass'  },
        impact:   { freq: 60,   type: 'square',   dur: 0.18, slide: -50, vol: 0.50 },
        launch:   { freq: 200,  type: 'sawtooth', dur: 0.40, slide: 800, vol: 0.35 },
        cash:     { freq: 880,  type: 'triangle', dur: 0.08, slide: 200, vol: 0.25 },
        meltdown: { freq: 80,   type: 'sawtooth', dur: 1.40, slide: -70, vol: 0.60 },
        flare:    { freq: 300,  type: 'sawtooth', dur: 0.50, slide: 200, vol: 0.30 },
        laser:    { freq: 1400, type: 'sawtooth', dur: 0.10, slide: -800,vol: 0.30 },
        dayDone:  { freq: 660,  type: 'triangle', dur: 0.30, slide: 660, vol: 0.40 }
      });
      Audio.startAmbient({ freq: 75, type: 'sawtooth', vol: 0.05 });

      /* --- Apply research first (mutates base values), then modules --- */
      Research().applyAll(this);
      this.coolant = this.startCoolant;
      this.maxCoolant = this.baseMaxCoolant;
      Modules().applyEffects(this);

      /* --- Starfield/atmosphere --- */
      this.starfield = [];
      for (let i = 0; i < 110; i++) {
        this.starfield.push({
          x: Math.random() * W,
          y: Math.random() * H * 0.55,
          tw: Math.random() * Math.PI * 2,
          tws: 0.6 + Math.random() * 1.6,
          s: Math.random() < 0.1 ? 1.6 : 0.9
        });
      }
      this.cracks = [];

      /* --- Events runtime for the current day --- */
      this.events = Events().createRuntime(this);

      /* --- Comet showers schedule (boss-day scripted) --- */
      this._scheduleBossEvents();

      this.setHud(this._hud());
      this.setScore(0);
    }

    /* Position pods around the reactor and lay out cards on the right. */
    layout() {
      this.throttleRect  = { x: 30, y: 100, w: 50, h: H - 220 };
      this.ventRect      = { x: 30, y: H - 110, w: 110, h: 70 };
      this.heatGaugeC    = { x: W * 0.45, y: H * 0.36, r: 90 };
      this.reactor       = { x: W * 0.45, y: H * 0.66, r: 56 };

      const r = this.reactor;
      this.modulePositions = {
        rig:    { x: r.x - 165, y: r.y - 50 },
        solar:  { x: r.x - 195, y: r.y + 35 },
        cool:   { x: r.x - 130, y: r.y + 80 },
        hab:    { x: r.x - 60,  y: r.y + 115 },
        shield: { x: r.x,       y: r.y + 130 },
        laser:  { x: r.x + 60,  y: r.y + 115 },
        core:   { x: r.x + 130, y: r.y + 80 },
        pump:   { x: r.x + 195, y: r.y + 35 },
        pad:    { x: r.x + 165, y: r.y - 50 },
        box:    { x: r.x - 80,  y: r.y - 110 },
        auto:   { x: r.x + 80,  y: r.y - 110 }
      };

      /* Cards: right-side panel — 11 cards must fit between y=90 and y=H-30. */
      this.cardRects = {};
      const px = W - 250, py = 90;
      const cardH = 40, cardGap = 2;
      Modules().CATALOG.forEach((m, i) => {
        this.cardRects[m.id] = {
          x: px, y: py + i * (cardH + cardGap),
          w: 230, h: cardH, mod: m
        };
      });
      this.cardsPanel = { x: W - 260, y: 60, w: 250, h: H - 80 };
    }

    _scheduleBossEvents() {
      this._bossDone = {};
    }

    /* ---------- Helpers ---------- */

    rate() {
      const overclock = (this.events && this.events.overclockT > 0) ? 2 : 1;
      const aurora    = (this.events && this.events.auroraActive > 0) ? 1.5 : 1;
      const surge     = (this.events && this.events.surgeActive > 0) ? 3 : 1;
      const auto      = 1 + this.autoTraderBonus;
      const pump      = 1 + this.pumpBonus;
      const reactor   = this.heat * this.efficiency * this.incomeMult * this.baseIncomeMult * 0.6;
      return (reactor * overclock * aurora * surge * auto * pump) + this.solarIncome;
    }

    costFor(mod) { return Modules().costFor(mod, this.modules[mod.id] || 0); }
    afford(mod)  { return this.cash >= this.costFor(mod); }

    tryBuy(mod) {
      const cost = this.costFor(mod);
      if (this.cash < cost) { this.sfx.play('deny'); return; }
      this.cash -= cost;
      this.modules[mod.id] = (this.modules[mod.id] || 0) + 1;
      Modules().applyEffects(this);
      this.sfx.play('buy', { freq: 440 + this.modules[mod.id] * 25 });
      this.shake(3, 0.12);
      this.flash(mod.color, 0.06);

      const card = this.cardRects[mod.id];
      const pod = this.modulePositions[mod.id];
      this.workers.push({
        x: card.x + 20, y: card.y + card.h / 2,
        tx: pod.x + (Math.random()-0.5)*16, ty: pod.y + (Math.random()-0.5)*16,
        color: mod.color, life: 6, walkT: 0
      });
      /* Habitats spawn a roaming astronaut on the surface too. */
      if (mod.id === 'hab') {
        this.workers.push({
          x: pod.x, y: pod.y + 30,
          tx: pod.x + (Math.random()-0.5) * 200, ty: pod.y + 30,
          color: '#cfe9ff', life: 30, walkT: 0, roaming: true
        });
      }
      this.emitFloat(card.x + 100, card.y + 30, '-$' + fmt(cost), '#ff8a8a');
      if (this.dayStats) this.dayStats.modulesBought = (this.dayStats.modulesBought | 0) + 1;
    }

    tryVent() {
      if (this.ventCooldown > 0) { this.sfx.play('deny'); return; }
      const cost = Math.max(50, Math.floor(this.cash * 0.25));
      if (this.cash < cost) { this.sfx.play('deny'); return; }
      this.cash -= cost;
      this.heat = Math.max(5, this.heat - 35);
      this.coolant = Math.max(0, this.coolant - 8);
      this.ventCooldown = this.ventCooldownDur;
      this.sfx.play('vent');
      this.shake(5, 0.2);
      for (let i = 0; i < 24; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 60 + Math.random() * 90;
        this.particles.emit({
          x: this.reactor.x + Math.cos(a) * 30,
          y: this.reactor.y + Math.sin(a) * 30,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30,
          life: 0.6 + Math.random() * 0.5, size: 6,
          color: '#cfe9ff', drag: 1.2
        });
      }
      this.emitFloat(this.reactor.x, this.reactor.y - 80, 'VENT', '#7cd9ff');
      if (this.dayStats) this.dayStats.vents = (this.dayStats.vents | 0) + 1;
    }

    fireRocket() {
      const pad = this.modulePositions.pad;
      const bonus = 30 + (this.modules.rig || 0) * 30 + (this.modules.pad || 0) * 60;
      this.cash += bonus;
      this.totalEarned += bonus;
      if (this.dayStats) this.dayStats.earnedThisDay = (this.dayStats.earnedThisDay || 0) + bonus;
      this.sfx.play('launch');
      this.sfx.play('cash');
      this.emitFloat(pad.x, pad.y - 40, '+$' + fmt(bonus), '#ffd86b');
      this.rockets.push({ x: pad.x, y: pad.y - 10, vy: -180, life: 2.5 });
      for (let i = 0; i < 18; i++) {
        const a = Math.PI * 0.5 + (Math.random() - 0.5) * 0.6;
        const sp = 120 + Math.random() * 180;
        this.particles.emit({
          x: pad.x, y: pad.y,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: 0.5 + Math.random() * 0.4,
          size: 4, color: '#ffae44', gravity: 100
        });
      }
    }

    emitFloat(x, y, text, color) {
      this.floaters.push({ x, y, vy: -50, life: 1.1, age: 0, text, color: color || '#fff' });
    }

    /* ---------- Update orchestration ---------- */

    update(dt) {
      /* Floaters/dust/workers always tick for visual continuity, regardless
         of mode — they're just decoration. */
      this._tickAmbient(dt);

      if (this.mode === 'recap')   { this._updateRecap(dt);    return; }
      if (this.mode === 'investor'){ this._updateInvestor(dt); return; }

      /* mode === 'playing' */
      this._updatePlaying(dt);
    }

    _tickAmbient(dt) {
      /* Floaters */
      for (let i = this.floaters.length - 1; i >= 0; i--) {
        const f = this.floaters[i];
        f.age += dt; f.y += f.vy * dt; f.vy += 30 * dt;
        if (f.age >= f.life) this.floaters.splice(i, 1);
      }
      /* Workers */
      for (let i = this.workers.length - 1; i >= 0; i--) {
        const w = this.workers[i];
        w.life -= dt; w.walkT += dt * 10;
        const dx = w.tx - w.x, dy = w.ty - w.y;
        const d = Math.hypot(dx, dy);
        if (d < 6) {
          if (w.roaming) {
            /* Pick a new wander target. */
            const pod = this.modulePositions.hab || this.reactor;
            w.tx = pod.x + (Math.random() - 0.5) * 240;
            w.ty = (H * 0.84) + (Math.random() - 0.5) * 8;
          } else if (w.life <= 0) {
            this.workers.splice(i, 1); continue;
          }
        } else {
          const sp = w.roaming ? 30 : 90;
          w.x += dx / d * sp * dt;
          w.y += dy / d * sp * dt;
        }
        if (w.life <= 0 && !w.roaming) this.workers.splice(i, 1);
      }
      /* Rockets */
      for (let i = this.rockets.length - 1; i >= 0; i--) {
        const r = this.rockets[i];
        r.y += r.vy * dt;
        r.vy -= 30 * dt;
        r.life -= dt;
        if (Math.random() < 0.9) {
          this.particles.emit({
            x: r.x + (Math.random()-0.5)*4, y: r.y + 14,
            vx: (Math.random()-0.5)*40, vy: 60 + Math.random()*60,
            life: 0.4, size: 3, color: '#ffae44'
          });
        }
        if (r.life <= 0 || r.y < -40) this.rockets.splice(i, 1);
      }
      /* Dust */
      this.smokeAcc += dt;
      if (this.smokeAcc > 0.2) {
        this.smokeAcc = 0;
        this.dust.push({
          x: Math.random() * W, y: H * 0.92 + Math.random() * 12,
          vx: (Math.random() - 0.5) * 20, vy: -2 - Math.random() * 8,
          life: 1.4, age: 0
        });
      }
      for (let i = this.dust.length - 1; i >= 0; i--) {
        const d = this.dust[i];
        d.age += dt; d.x += d.vx * dt; d.y += d.vy * dt;
        if (d.age >= d.life) this.dust.splice(i, 1);
      }
      /* Twinkle */
      for (const s of this.starfield) s.tw += s.tws * dt;
    }

    _updateRecap(dt) {
      /* Wait for clicks on buttons / research cards. */
      if (Input.mouse.justPressed) {
        const action = Campaign().handleRecapClick(this, Input.mouse.x, Input.mouse.y);
        if (action === 'next') {
          this._beginNextDay();
        } else if (action === 'restart') {
          /* Tell the engine we're done. The HTML overlay will offer "Play Again". */
          this.setScore(this.totalEarned | 0);
          if (this.recap.kind === 'campaign_complete') this.win();
          else this.gameOver();
          Audio.stopAmbient();
        } else if (action === 'endless') {
          this.isEndless = true;
          this._beginNextDay();
        }
      }
    }

    _updateInvestor(dt) {
      /* Smoothly clamp throttle toward 0 while paused — gives a little visual
         settle and prevents heat spikes from finger-on-mouse. */
      this.throttle += (0.15 - this.throttle) * Math.min(1, dt * 4);
      this.targetThrottle = this.throttle;

      Events().updateInvestor && Events().updateInvestor(this, dt);
      /* Manual update of investor card timer (Events.update is skipped while
         in investor mode to halt natural events). */
      if (this.events.investor) {
        this.events.investor.t += dt;
        if (this.events.investor.t >= this.events.investor.autoPickAt) {
          /* Auto-pick first card. */
          const first = this.events.investor.cards[0];
          if (first) first.apply(this);
          this.events.investor = null;
          this.sfx.play('buy', { freq: 600 });
        }
      }

      if (Input.mouse.justPressed) {
        Events().handleInvestorClick(this, Input.mouse.x, Input.mouse.y);
      }
      /* Number keys 1/2/3 */
      ['1','2','3'].forEach(k => {
        if (Input.keys[k] && !this._lastKey1to3) {
          Events().handleInvestorKey(this, k);
        }
      });
      this._lastKey1to3 = !!(Input.keys['1'] || Input.keys['2'] || Input.keys['3']);

      if (!this.events.investor) {
        /* Investor finished — back to playing. */
        this.mode = 'playing';
      }
    }

    _updatePlaying(dt) {
      /* Day timer. */
      this.dayTime += dt;

      /* Boss events scheduling (day 5 + day 10 comet showers). */
      this._maybeFireBossEvents();

      /* Throttle input from the slider drag area. */
      const mouse = Input.mouse;
      if (Input.mouse.justPressed) {
        const mx = mouse.x, my = mouse.y;
        if (ptInRect(mx, my, this.throttleRect)) {
          this.draggingThrottle = true;
        } else if (ptInRect(mx, my, this.ventRect)) {
          this.tryVent();
        } else {
          for (const id of Object.keys(this.cardRects)) {
            const r = this.cardRects[id];
            if (ptInRect(mx, my, r)) { this.tryBuy(r.mod); break; }
          }
        }
      }
      if (!Input.mouse.down) this.draggingThrottle = false;
      if (this.draggingThrottle) {
        const r = this.throttleRect;
        const t = 1 - clamp((mouse.y - r.y) / r.h, 0, 1);
        this.targetThrottle = t;
      }
      /* Keyboard nudge. */
      if (Input.keys['w'] || Input.keys['W'] || Input.keys['ArrowUp']) {
        this.targetThrottle = Math.min(1, this.targetThrottle + 0.6 * dt);
      }
      if (Input.keys['s'] || Input.keys['S'] || Input.keys['ArrowDown']) {
        this.targetThrottle = Math.max(0, this.targetThrottle - 0.6 * dt);
      }
      if (Input.keys[' '] || Input.keys['Space']) {
        if (this.ventCooldown <= 0) this.tryVent();
      }
      /* Auto-stabilizer pulls throttle down when over max heat. */
      if ((this.modules.auto || 0) > 0 && this.heat > this.maxHeat) {
        const pull = 0.4 * (this.modules.auto || 0) * dt;
        this.targetThrottle = Math.max(0, this.targetThrottle - pull);
      }
      /* Smooth slider movement. */
      this.throttle += (this.targetThrottle - this.throttle) * Math.min(1, dt * 8);

      /* Daily-objective trackers that depend on throttle. */
      if (this.dayStats) {
        if (this.throttle >= 0.30) this.dayStats.timeAbove30 += dt;
        if (this.heat / this.maxHeat > 0.90) this.dayStats.overheated = true;
      }

      /* Heat dynamics — same tuning as before. */
      const heatIn = this.throttle * 80 * dt;
      let cooling = (8 + this.coolantRegen * 4) * dt * this.passiveCoolingMult;
      if (this.coolant > 0) {
        const consume = Math.min(this.coolant, this.heat * 0.04 * dt);
        this.coolant -= consume;
        cooling += this.heat * 0.15 * dt;
      }
      this.heat += heatIn - cooling;
      if (this.heat < 0) this.heat = 0;

      /* Coolant regen (slowed by leak). */
      const regen = this.coolantRegen * (this.events.leakActive > 0 ? 0.4 : 1) * dt;
      this.coolant = Math.min(this.maxCoolant, this.coolant + regen);

      /* Auto-trader research bonus. */
      if (this.autoTraderEnabled) {
        if (this.throttle < 0.5) {
          this.autoTraderBonus = Math.min(0.30, this.autoTraderBonus + 0.01 * dt);
        } else {
          this.autoTraderBonus = Math.max(0, this.autoTraderBonus - 0.05 * dt);
        }
      }

      /* Helium pump bonus tick. */
      Modules().tickPump(this, dt);

      /* Income. */
      const earned = this.rate() * dt;
      this.cash += earned;
      this.totalEarned += earned;
      if (this.dayStats) this.dayStats.earnedThisDay = (this.dayStats.earnedThisDay || 0) + earned;

      /* Galactic investor — every $50K total earned. */
      if (this.galacticEnabled) {
        while (this.totalEarned >= this.nextGalacticAt) {
          this.cash += 1000; this.totalEarned += 1000;
          this.emitFloat(this.reactor.x, this.reactor.y - 90, 'GALACTIC +$1000', '#a855f7');
          this.sfx.play('cash', { freq: 1320 });
          this.nextGalacticAt += 50000;
        }
      }

      /* Overclock event timer (set by investor card). */
      if (this.events.overclockT > 0) this.events.overclockT -= dt;

      /* Money floater pulse. */
      if (Math.random() < dt * 2 && this.rate() > 0) {
        this.emitFloat(
          this.reactor.x + (Math.random() - 0.5) * 80,
          this.reactor.y - 50 + (Math.random() - 0.5) * 30,
          '+$' + fmt(this.rate() * 0.3, 1), '#ffd86b'
        );
      }

      /* Vent cooldown. */
      if (this.ventCooldown > 0) this.ventCooldown -= dt;

      /* Critical / meltdown rolling. */
      const cfg = Campaign().getDayConfig(this.day);
      if (this.heat > this.maxHeat) {
        const over = (this.heat - this.maxHeat) / 30;
        const chance = Math.min(0.9, 0.05 + over * 0.6) * dt;
        if (Math.random() < chance) {
          this._tryMeltdown();
          return;
        }
        this.alarmAcc += dt;
        if (this.alarmAcc > 0.25) {
          this.alarmAcc = 0;
          this.sfx.play('critical', { freq: 1200 + (this.heat - this.maxHeat) * 12 });
        }
      } else {
        if (this.heat > this.maxHeat * 0.85) {
          this.alarmAcc += dt;
          if (this.alarmAcc > 0.6) {
            this.alarmAcc = 0;
            this.sfx.play('alarm');
          }
        } else {
          this.alarmAcc = 0;
        }
      }
      if (this.heat > cfg.meltdownHardCap) {
        this._tryMeltdown();
        return;
      }

      /* Events runtime (meteors, flares, leaks, investor, etc.) */
      Events().update(this, dt);

      /* If an investor was just triggered, switch to investor mode. */
      if (this.events.investor) {
        this.mode = 'investor';
        return;
      }

      /* Launch pad. */
      if ((this.modules.pad || 0) > 0) {
        this.padTimer += dt;
        if (this.padTimer >= 8) {
          this.padTimer = 0;
          this.fireRocket();
        }
      } else {
        this.padTimer = 0;
      }

      /* Engine score reflects current $ banked. */
      this.setScore(Math.floor(this.totalEarned));

      /* End of day? */
      if (this.dayTime >= DAY_LENGTH) {
        this._endDay();
        return;
      }

      this.setHud(this._hud());
    }

    _maybeFireBossEvents() {
      if (this._bossDone[this.day]) return;
      const t = this.dayTime;
      if (this.day === 5 && t >= 30) {
        Events().startCometShower(this, 10, 8);
        this._bossDone[this.day] = true;
      } else if (this.day === 10 && t >= 40) {
        Events().startCometShower(this, 14, 10);
        this._bossDone[this.day] = true;
      }
      /* Endless: every 5 days past 10, fire a comet shower at t=35. */
      if (this.isEndless && this.day > 10 && (this.day % 5 === 0) && t >= 35) {
        Events().startCometShower(this, 10 + (this.day - 10), 9);
        this._bossDone[this.day] = true;
      }
    }

    _tryMeltdown() {
      /* Black box revive. */
      if (Modules().tryConsumeBox(this)) {
        this.heat = 50;
        this.flash('#ffffff', 0.5);
        this.shake(20, 0.6);
        this.emitFloat(this.reactor.x, this.reactor.y - 100, 'BLACK BOX SAVED YOU', '#cccccc');
        this.sfx.play('vent');
        this.sfx.play('cash', { freq: 1320 });
        for (let i = 0; i < 60; i++) {
          const a = Math.random() * Math.PI * 2;
          const sp = 100 + Math.random() * 200;
          this.particles.emit({
            x: this.reactor.x, y: this.reactor.y,
            vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
            life: 0.7, size: 3, color: '#cccccc', gravity: 100
          });
        }
        return;
      }
      /* True meltdown: end campaign. */
      this.sfx.play('meltdown');
      this.shake(28, 1.2);
      this.flash('#ffffff', 0.8);
      for (let i = 0; i < 80; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 200 + Math.random() * 400;
        this.particles.emit({
          x: this.reactor.x, y: this.reactor.y,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: 0.9 + Math.random() * 0.6,
          size: 5, color: i % 2 ? '#ffd86b' : '#ff5e7e',
          gravity: 100
        });
      }
      /* 10% ejection penalty. */
      this.totalEarned = Math.max(0, this.totalEarned * 0.9);
      this.recap = Campaign().buildRecap(this, 'meltdown');
      this.mode = 'recap';
    }

    _endDay() {
      this.sfx.play('dayDone');
      this.shake(4, 0.3);
      /* Final-day vs intermediate. */
      let kind;
      if (this.isEndless) {
        kind = 'day_complete';
      } else if (this.day >= Campaign().TOTAL_DAYS) {
        /* HQ extraction bonus */
        const bonus = Math.floor(this.cash * 0.5);
        this.cash += bonus;
        this.totalEarned += bonus;
        this.emitFloat(this.reactor.x, this.reactor.y - 90, 'EVAC BONUS +$' + fmt(bonus), '#4ade80');
        kind = 'campaign_complete';
      } else {
        kind = 'day_complete';
      }
      this.recap = Campaign().buildRecap(this, kind);
      this.mode = 'recap';
    }

    _beginNextDay() {
      this.day += 1;
      this.dayTime = 0;
      this.recap = null;
      this.mode = 'playing';
      this.dayStats = Campaign().freshDayStats(this.day);
      /* Soft reset day-state — keep modules+cash, restore systems for next shift. */
      this.heat = Math.min(this.heat, 30);
      this.coolant = this.maxCoolant;
      this.targetThrottle = 0.20;
      this.throttle = 0.20;
      this.ventCooldown = 0;
      this.alarmAcc = 0;
      this.events = Events().createRuntime(this);
      this._scheduleBossEvents();
      this.cracks = [];
      this.flash('#7cd9ff', 0.18);
    }

    /* ---------- HUD ---------- */

    _hud() {
      const dayLabel = this.isEndless
        ? ('ENDLESS DAY ' + this.day)
        : ('DAY ' + this.day + '/' + Campaign().TOTAL_DAYS);
      const t = Math.max(0, DAY_LENGTH - this.dayTime);
      const heatPct = Math.min(999, (this.heat / this.maxHeat) * 100) | 0;
      const rp = Research().getState().points;
      return (
        `<span>${dayLabel}</span>` +
        `<span>Time <b>${t.toFixed(1)}</b></span>` +
        `<span>Heat <b>${heatPct}%</b></span>` +
        `<span>$/s <b>${fmt(this.rate(), 1)}</b></span>` +
        `<span>Cash <b>$${fmt(Math.floor(this.cash))}</b></span>` +
        `<span>RP <b>${rp}</b></span>`
      );
    }

    coinsEarned(score) {
      return Math.max(0, Math.floor(score / 400));
    }

    /* ---------- Render ---------- */

    render(ctx) {
      this._drawSky(ctx);
      this._drawSurface(ctx);
      this._drawDome(ctx);
      this._drawPipes(ctx);
      this._drawReactor(ctx);
      this._drawModules(ctx);
      this._drawWorkers(ctx);
      this._drawRockets(ctx);
      Events().drawCracks(this, ctx);
      Events().drawMeteors(this, ctx);

      this._drawThrottle(ctx);
      this._drawVent(ctx);
      this._drawGauges(ctx);
      this._drawCards(ctx);
      this._drawTopBanner(ctx);
      this._drawFloaters(ctx);

      /* Event overlays */
      if (this.events && this.events.flareActive > 0) {
        const a = clamp(this.events.flareActive / this.events.flareDur, 0, 1) * 0.18;
        ctx.fillStyle = `rgba(255,174,68,${a})`;
        ctx.fillRect(0, 0, W, H);
      }
      if (this.events && this.events.auroraActive > 0) {
        const a = clamp(this.events.auroraActive / 5, 0, 1) * 0.18;
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, `rgba(124,217,255,${a * 1.4})`);
        grad.addColorStop(0.5, `rgba(74,222,128,${a})`);
        grad.addColorStop(1, `rgba(124,217,255,0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
      }
      if (this.events && this.events.surgeActive > 0) {
        const a = clamp(this.events.surgeActive / 4, 0, 1) * 0.20;
        ctx.fillStyle = `rgba(255,94,126,${a})`;
        ctx.fillRect(0, 0, W, H);
      }
      if (this.events && this.events.scriptedEvent && this.events.scriptedEvent.kind === 'comet_shower' && this.events.scriptedEvent.announce > 0) {
        const a = clamp(this.events.scriptedEvent.announce / 1, 0, 1);
        ctx.fillStyle = `rgba(255,90,30,${a * 0.18})`;
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = `rgba(255,200,100,${a})`;
        ctx.font = 'bold 36px ui-monospace, monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('COMET SHOWER!', W/2, H/2);
      }

      if (this.heat > this.maxHeat) {
        const over = clamp((this.heat - this.maxHeat) / 30, 0, 1);
        ctx.strokeStyle = `rgba(255,58,58,${0.3 + over * 0.5})`;
        ctx.lineWidth = 6 + over * 8;
        ctx.strokeRect(3, 3, W - 6, H - 6);
        ctx.fillStyle = `rgba(255,58,58,${0.06 + over * 0.08})`;
        ctx.fillRect(0, 0, W, H);
      }

      /* Modal overlays last */
      if (this.mode === 'investor') Events().drawInvestor(ctx, this);
      if (this.mode === 'recap')    Campaign().drawRecap(ctx, this);
    }

    /* ---------- Render helpers ---------- */

    _drawSky(ctx) {
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#070b1a'); sky.addColorStop(0.55, '#0a0e1f'); sky.addColorStop(1, '#100716');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
      for (const s of this.starfield) {
        const a = 0.3 + 0.7 * Math.abs(Math.sin(s.tw));
        ctx.fillStyle = `rgba(255,255,255,${a})`;
        ctx.fillRect(s.x, s.y, s.s, s.s);
      }
      /* Earth-rise scales with day (gradually higher as campaign progresses). */
      const dayProgress = this.isEndless ? 1 : Math.min(1, (this.day - 1 + this.dayTime / DAY_LENGTH) / Campaign().TOTAL_DAYS);
      const earthY = H * 0.18 - dayProgress * 60;
      ctx.save();
      ctx.shadowColor = '#4fa8ff'; ctx.shadowBlur = 30;
      ctx.fillStyle = '#1f4a8a';
      ctx.beginPath(); ctx.arc(W * 0.85, earthY, 44, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#3da55a';
      ctx.beginPath(); ctx.arc(W * 0.835, earthY - 5, 12, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(W * 0.87, earthY + 12, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2a3d6a';
      ctx.beginPath(); ctx.arc(W * 0.815, earthY + 8, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.arc(W * 0.85 + 12, earthY, 44, 0, Math.PI * 2); ctx.fill();
    }

    _drawSurface(ctx) {
      ctx.fillStyle = '#1a1828';
      ctx.beginPath();
      ctx.moveTo(0, H * 0.74);
      for (let x = 0; x <= W; x += 30) {
        const h = 18 + ((x * 17) % 40);
        ctx.lineTo(x, H * 0.74 - h);
      }
      ctx.lineTo(W, H * 0.78); ctx.lineTo(0, H * 0.78);
      ctx.closePath(); ctx.fill();

      const surf = ctx.createLinearGradient(0, H * 0.78, 0, H);
      surf.addColorStop(0, '#1c1d2a'); surf.addColorStop(1, '#0d0d18');
      ctx.fillStyle = surf;
      ctx.fillRect(0, H * 0.78, W, H * 0.22);
      ctx.fillStyle = '#0a0a13';
      [[0.08, 0.92, 36], [0.22, 0.97, 24], [0.78, 0.88, 30], [0.92, 0.95, 22], [0.6, 0.96, 18]].forEach(([cx, cy, r]) => {
        ctx.beginPath(); ctx.ellipse(cx * W, cy * H, r, r * 0.4, 0, 0, Math.PI * 2); ctx.fill();
      });
      ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
      [[0.08, 0.92, 36], [0.22, 0.97, 24], [0.78, 0.88, 30]].forEach(([cx, cy, r]) => {
        ctx.beginPath(); ctx.ellipse(cx * W, cy * H, r, r * 0.4, 0, 0, Math.PI * 2); ctx.stroke();
      });
      for (const d of this.dust) {
        const a = 1 - d.age / d.life;
        ctx.fillStyle = `rgba(180,180,200,${a * 0.3})`;
        ctx.fillRect(d.x, d.y, 2, 2);
      }
    }

    _drawDome(ctx) {
      const baseCX = this.reactor.x, baseCY = H * 0.78, baseR = 360;
      const grad = ctx.createRadialGradient(baseCX - 80, baseCY - 80, 20, baseCX, baseCY, baseR);
      grad.addColorStop(0, 'rgba(124,217,255,0.10)');
      grad.addColorStop(1, 'rgba(124,217,255,0.0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(baseCX, baseCY, baseR, Math.PI, 0); ctx.fill();
      ctx.strokeStyle = 'rgba(124,217,255,0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(baseCX, baseCY, baseR, Math.PI, 0); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(baseCX - 50, baseCY - 30, baseR - 30, Math.PI * 1.05, Math.PI * 1.4);
      ctx.stroke();
    }

    _drawPipes(ctx) {
      ctx.strokeStyle = '#26303d'; ctx.lineWidth = 6;
      Modules().CATALOG.forEach(m => {
        if (!(this.modules[m.id] || 0)) return;
        const p = this.modulePositions[m.id];
        if (!p) return;
        ctx.beginPath();
        ctx.moveTo(this.reactor.x, this.reactor.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      });
      ctx.strokeStyle = 'rgba(255,180,80,0.35)';
      ctx.lineWidth = 2;
      Modules().CATALOG.forEach(m => {
        if (!(this.modules[m.id] || 0)) return;
        const p = this.modulePositions[m.id];
        if (!p) return;
        ctx.beginPath();
        ctx.moveTo(this.reactor.x, this.reactor.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      });
    }

    _drawReactor(ctx) {
      const heatPct = clamp(this.heat / this.maxHeat, 0, 1.5);
      const coreColor = this._heatColor(heatPct);
      const pulse = 1 + Math.sin(this.time * 8 + this.heat * 0.05) * 0.05 * (0.4 + this.throttle);
      const r = this.reactor.r * pulse;
      ctx.save();
      ctx.shadowColor = coreColor.css; ctx.shadowBlur = 30 + heatPct * 50;
      ctx.fillStyle = '#101828';
      ctx.beginPath(); ctx.arc(this.reactor.x, this.reactor.y, r + 18, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = coreColor.css;
      ctx.beginPath(); ctx.arc(this.reactor.x, this.reactor.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.4 + heatPct * 0.5;
      ctx.beginPath(); ctx.arc(this.reactor.x, this.reactor.y, r * 0.45 * pulse, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = coreColor.rgba(0.7);
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(this.reactor.x, this.reactor.y, r + 8 + Math.sin(this.time * 6) * 1.5, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#3a4660'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(this.reactor.x, this.reactor.y, r + 22, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + this.time * 0.3;
        const x1 = this.reactor.x + Math.cos(a) * (r + 22);
        const y1 = this.reactor.y + Math.sin(a) * (r + 22);
        const x2 = this.reactor.x + Math.cos(a) * (r + 28);
        const y2 = this.reactor.y + Math.sin(a) * (r + 28);
        ctx.strokeStyle = coreColor.rgba(0.5);
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      }
      if (Math.random() < 0.6 * (0.3 + this.throttle) && this.mode === 'playing') {
        const a = Math.random() * Math.PI * 2;
        this.particles.emit({
          x: this.reactor.x + Math.cos(a) * r,
          y: this.reactor.y + Math.sin(a) * r,
          vx: Math.cos(a) * 30, vy: Math.sin(a) * 30 - 30,
          life: 0.7, size: 3,
          color: coreColor.css, gravity: -20
        });
      }
    }

    _drawModules(ctx) {
      Modules().CATALOG.forEach(m => {
        const p = this.modulePositions[m.id];
        if (!p) return;
        const count = this.modules[m.id] || 0;
        const owned = count > 0;
        ctx.fillStyle = owned ? '#1a2230' : 'rgba(40,46,60,0.4)';
        ctx.fillRect(p.x - 22, p.y - 18, 44, 36);
        ctx.strokeStyle = owned ? m.color : 'rgba(120,130,150,0.3)';
        ctx.lineWidth = 2;
        ctx.strokeRect(p.x - 22, p.y - 18, 44, 36);
        Modules().drawGlyph(ctx, m.id, p.x, p.y - 2, m.color, owned);
        if (count > 0) {
          ctx.fillStyle = m.color;
          ctx.font = 'bold 11px ui-monospace, monospace';
          ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
          ctx.fillText('×' + count, p.x + 20, p.y + 16);
        }
        if (owned) {
          const ind = 0.5 + 0.5 * Math.sin(this.time * 5 + p.x * 0.01);
          ctx.fillStyle = m.color;
          ctx.globalAlpha = 0.4 + ind * 0.6;
          ctx.fillRect(p.x - 18, p.y + 12, 6, 3);
          ctx.globalAlpha = 1;
        }
      });
    }

    _drawWorkers(ctx) {
      for (const w of this.workers) {
        const bob = Math.sin(w.walkT) * 2;
        ctx.fillStyle = '#00000060';
        ctx.beginPath(); ctx.ellipse(w.x, w.y + 8, 6, 2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#e7ecf3';
        ctx.fillRect(w.x - 4, w.y - 9 + bob, 8, 10);
        ctx.fillStyle = '#cfe9ff';
        ctx.beginPath(); ctx.arc(w.x, w.y - 12 + bob, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#0a1020';
        ctx.fillRect(w.x - 3, w.y - 14 + bob, 6, 3);
        ctx.fillStyle = w.color;
        ctx.fillRect(w.x - 4, w.y - 5 + bob, 8, 2);
      }
    }

    _drawRockets(ctx) {
      for (const rk of this.rockets) {
        ctx.fillStyle = '#e7ecf3';
        ctx.beginPath();
        ctx.moveTo(rk.x, rk.y - 12);
        ctx.lineTo(rk.x - 5, rk.y + 6);
        ctx.lineTo(rk.x + 5, rk.y + 6);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ff5e7e';
        ctx.fillRect(rk.x - 5, rk.y, 10, 3);
      }
    }

    _drawThrottle(ctx) {
      const r = this.throttleRect;
      ctx.fillStyle = '#0a1020';
      ctx.fillRect(r.x - 8, r.y - 30, r.w + 16, r.h + 60);
      ctx.strokeStyle = '#3a4660'; ctx.lineWidth = 2;
      ctx.strokeRect(r.x - 8, r.y - 30, r.w + 16, r.h + 60);
      ctx.fillStyle = '#cfe9ff';
      ctx.font = 'bold 12px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText('THROTTLE', r.x + r.w/2, r.y - 24);

      const grad = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
      grad.addColorStop(0, '#ff3a3a');
      grad.addColorStop(0.3, '#ffae44');
      grad.addColorStop(0.6, '#4ade80');
      grad.addColorStop(1, '#7cd9ff');
      ctx.fillStyle = grad;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = '#3a4660'; ctx.lineWidth = 1;
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);

      /* Highlight the helium-pump stable band when applicable. */
      if ((this.modules.pump || 0) > 0) {
        const yTop = r.y + (1 - 0.60) * r.h;
        const yBot = r.y + (1 - 0.20) * r.h;
        ctx.strokeStyle = 'rgba(183,148,246,0.7)';
        ctx.lineWidth = 1;
        ctx.strokeRect(r.x - 1, yTop, r.w + 2, yBot - yTop);
      }

      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      for (let i = 1; i < 10; i++) {
        const y = r.y + (r.h * i / 10);
        ctx.beginPath(); ctx.moveTo(r.x, y); ctx.lineTo(r.x + r.w * 0.25, y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(r.x + r.w * 0.75, y); ctx.lineTo(r.x + r.w, y); ctx.stroke();
      }

      const ky = r.y + (1 - this.throttle) * r.h;
      ctx.fillStyle = '#101828';
      ctx.fillRect(r.x - 6, ky - 8, r.w + 12, 16);
      ctx.strokeStyle = '#ffd86b'; ctx.lineWidth = 2;
      ctx.strokeRect(r.x - 6, ky - 8, r.w + 12, 16);
      ctx.fillStyle = '#ffd86b';
      ctx.fillRect(r.x - 2, ky - 1, r.w + 4, 2);

      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText((this.throttle * 100 | 0) + '%', r.x + r.w/2, r.y + r.h + 16);
    }

    _drawVent(ctx) {
      const r = this.ventRect;
      const ready = this.ventCooldown <= 0;
      const cost = Math.max(50, Math.floor(this.cash * 0.25));
      const canAfford = this.cash >= cost;
      ctx.fillStyle = ready && canAfford ? '#1c2a40' : '#0e1420';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = ready && canAfford ? '#7cd9ff' : '#3a4660';
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = 'bold 13px ui-monospace, monospace';
      ctx.fillText('EMERGENCY', r.x + r.w/2, r.y + 18);
      ctx.fillText('VENT', r.x + r.w/2, r.y + 34);
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillStyle = ready && canAfford ? '#ffd86b' : '#667';
      if (ready) {
        ctx.fillText('Cost $' + fmt(cost), r.x + r.w/2, r.y + 54);
      } else {
        ctx.fillText('Cooldown ' + this.ventCooldown.toFixed(1) + 's', r.x + r.w/2, r.y + 54);
      }
    }

    _drawGauges(ctx) {
      const cx = this.heatGaugeC.x, cy = this.heatGaugeC.y, r = this.heatGaugeC.r;
      const startA = Math.PI * 0.85, endA = Math.PI * 0.15;
      const total = (Math.PI * 2) - (startA - endA);
      ctx.strokeStyle = '#1a2230'; ctx.lineWidth = 14;
      ctx.beginPath(); ctx.arc(cx, cy, r, startA, startA + total, false); ctx.stroke();
      const SCALE_MAX = 1.2;
      const heatPct = this.heat / this.maxHeat;
      const visPct = clamp(heatPct, 0, SCALE_MAX) / SCALE_MAX;
      ctx.strokeStyle = this._heatColor(clamp(heatPct, 0, 1.3)).css;
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.arc(cx, cy, r, startA, startA + total * visPct, false);
      ctx.stroke();
      const hot = this._heatColor(1);
      ctx.strokeStyle = hot.css; ctx.lineWidth = 3;
      const tickFrac = 1 / SCALE_MAX;
      const ang = startA + total * tickFrac;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * (r - 14), cy + Math.sin(ang) * (r - 14));
      ctx.lineTo(cx + Math.cos(ang) * (r + 8), cy + Math.sin(ang) * (r + 8));
      ctx.stroke();
      ctx.fillStyle = '#cfe9ff';
      ctx.font = 'bold 12px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('HEAT', cx, cy - 22);
      ctx.fillStyle = this._heatColor(heatPct).css;
      ctx.font = 'bold 26px ui-monospace, monospace';
      ctx.fillText(((this.heat / this.maxHeat) * 100 | 0) + '%', cx, cy + 4);
      ctx.fillStyle = '#8892a6';
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillText(this.heat.toFixed(0) + ' / ' + this.maxHeat, cx, cy + 26);

      const barX = cx - 70, barY = cy + 56, barW = 140, barH = 10;
      ctx.fillStyle = '#0a1020';
      ctx.fillRect(barX, barY, barW, barH);
      const cFrac = this.coolant / this.maxCoolant;
      ctx.fillStyle = this.events.leakActive > 0 && Math.sin(this.time * 14) > 0 ? '#ff5e7e' : '#7cd9ff';
      ctx.fillRect(barX, barY, barW * cFrac, barH);
      ctx.strokeStyle = '#3a4660'; ctx.lineWidth = 1;
      ctx.strokeRect(barX + 0.5, barY + 0.5, barW - 1, barH - 1);
      ctx.fillStyle = '#cfe9ff';
      ctx.font = '10px ui-monospace, monospace';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText('COOLANT', barX, barY + barH + 10);
      ctx.textAlign = 'right';
      ctx.fillText(this.coolant.toFixed(0) + '/' + this.maxCoolant, barX + barW, barY + barH + 10);

      /* Helium pump bonus indicator */
      if ((this.modules.pump || 0) > 0) {
        const py = barY + barH + 24;
        const cap = this.pumpCapBonus;
        const frac = cap > 0 ? this.pumpBonus / cap : 0;
        ctx.fillStyle = '#0a1020';
        ctx.fillRect(barX, py, barW, 6);
        ctx.fillStyle = '#b794f6';
        ctx.fillRect(barX, py, barW * frac, 6);
        ctx.strokeStyle = '#3a4660';
        ctx.strokeRect(barX + 0.5, py + 0.5, barW - 1, 5);
        ctx.fillStyle = '#cfe9ff';
        ctx.font = '10px ui-monospace, monospace';
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText('HE PUMP', barX, py + 16);
        ctx.textAlign = 'right';
        ctx.fillText('+' + (this.pumpBonus * 100).toFixed(0) + '% / ' + (cap * 100).toFixed(0) + '%', barX + barW, py + 16);
      }
    }

    _drawCards(ctx) {
      const panel = this.cardsPanel;
      ctx.fillStyle = '#0a1020';
      ctx.fillRect(panel.x, panel.y, panel.w, panel.h);
      ctx.strokeStyle = '#3a4660'; ctx.lineWidth = 2;
      ctx.strokeRect(panel.x, panel.y, panel.w, panel.h);
      ctx.fillStyle = '#cfe9ff';
      ctx.font = 'bold 12px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText('MODULES', panel.x + panel.w/2, panel.y + 10);

      Modules().CATALOG.forEach(m => {
        const r = this.cardRects[m.id];
        const cost = this.costFor(m);
        const can = this.afford(m);
        const count = this.modules[m.id] || 0;
        ctx.fillStyle = can ? '#1a2230' : '#0e1420';
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.strokeStyle = can ? m.color : '#3a4660';
        ctx.lineWidth = 2;
        ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
        Modules().drawGlyph(ctx, m.id, r.x + 18, r.y + r.h/2, m.color, can);
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.font = 'bold 11px ui-monospace, monospace';
        ctx.fillText(m.name, r.x + 38, r.y + 4);
        ctx.font = '9px ui-monospace, monospace';
        ctx.fillStyle = '#8892a6';
        /* Truncate long descs */
        const desc = m.desc.length > 32 ? m.desc.slice(0, 30) + '…' : m.desc;
        ctx.fillText(desc, r.x + 38, r.y + 17);
        ctx.fillStyle = can ? '#ffd86b' : '#667';
        ctx.font = 'bold 10px ui-monospace, monospace';
        ctx.fillText('$' + fmt(cost), r.x + 38, r.y + 28);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px ui-monospace, monospace';
        ctx.fillText('×' + count, r.x + r.w - 6, r.y + 4);
      });
    }

    _drawTopBanner(ctx) {
      ctx.fillStyle = 'rgba(10,16,32,0.7)';
      ctx.fillRect(0, 0, W, 40);
      ctx.fillStyle = '#cfe9ff';
      ctx.font = 'bold 14px ui-monospace, monospace';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      const dayLabel = this.isEndless
        ? ('LUNAR HE-3 STATION  ·  ENDLESS DAY ' + this.day)
        : ('LUNAR HE-3 STATION  ·  Day ' + this.day + '/' + Campaign().TOTAL_DAYS);
      ctx.fillText(dayLabel, 16, 20);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ffd86b';
      ctx.fillText('$ ' + fmt(Math.floor(this.cash)), W - 280, 20);
      ctx.fillStyle = '#cfe9ff';
      ctx.fillText('+$' + fmt(this.rate(), 1) + '/s', W - 380, 20);
      /* Day progress bar at top */
      const pct = clamp(this.dayTime / DAY_LENGTH, 0, 1);
      ctx.fillStyle = '#1a2230';
      ctx.fillRect(0, 38, W, 2);
      ctx.fillStyle = '#7cd9ff';
      ctx.fillRect(0, 38, W * pct, 2);
    }

    _drawFloaters(ctx) {
      for (const f of this.floaters) {
        const a = 1 - f.age / f.life;
        ctx.globalAlpha = a;
        ctx.fillStyle = f.color;
        ctx.font = 'bold 14px ui-monospace, monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(f.text, f.x, f.y);
        ctx.globalAlpha = 1;
      }
    }

    _heatColor(t) {
      const stops = [
        { t: 0.0, c: [124, 217, 255] },
        { t: 0.4, c: [74, 222, 128] },
        { t: 0.7, c: [255, 174, 68] },
        { t: 1.0, c: [255, 58, 58] },
        { t: 1.3, c: [255, 255, 255] }
      ];
      for (let i = 0; i < stops.length - 1; i++) {
        const a = stops[i], b = stops[i + 1];
        if (t <= b.t) {
          const k = (t - a.t) / (b.t - a.t);
          const r = a.c[0] + (b.c[0] - a.c[0]) * k | 0;
          const g = a.c[1] + (b.c[1] - a.c[1]) * k | 0;
          const bv = a.c[2] + (b.c[2] - a.c[2]) * k | 0;
          return { css: `rgb(${r},${g},${bv})`, rgba: (a) => `rgba(${r},${g},${bv},${a})` };
        }
      }
      const last = stops[stops.length - 1].c;
      return {
        css: `rgb(${last[0]},${last[1]},${last[2]})`,
        rgba: (a) => `rgba(${last[0]},${last[1]},${last[2]},${a})`
      };
    }
  }

  /* Helpers */
  function ptInRect(x, y, r) { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function fmt(n, decimals) {
    if (n < 1000) return decimals ? n.toFixed(decimals) : Math.floor(n).toString();
    const units = ['', 'K', 'M', 'B', 'T'];
    let i = 0;
    while (n >= 1000 && i < units.length - 1) { n /= 1000; i++; }
    return n.toFixed(n < 10 ? 2 : n < 100 ? 1 : 0) + units[i];
  }

  NDP.attachGame('reactor', ReactorGame);
})();
