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
      /* Per-run milestone counters used for global-coin payout. */
      this.daysCompletedThisRun = 0;
      this.victoryAchieved = false;

      /* --- Diagnostics: heat-event log + day-intro --- */
      /* Ring buffer of {t, source, label, amount, after} so the player can
         see WHY they died on the meltdown recap. Source examples:
           'meteor', 'surge', 'risky_loan', 'flare', 'throttle'. */
      this.heatLog = [];
      this.peakHeatPct = 0;
      this.sustainedHigh = 0;       /* seconds spent above 70% with throttle>0.6 */
      this._lastSustainLog = 0;
      this.dayIntroT = 0;
      this.dayIntroLines = [];

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

      /* --- Starfield / atmosphere ---
         Three parallax bands so panning the eye across the sky gives a real
         sense of depth: tiny far stars, mid-bright stars, and a few large
         twinkling beacons. */
      this.starfield = [];
      for (let i = 0; i < 180; i++) {
        const band = Math.random();
        const layer = band < 0.55 ? 0 : (band < 0.9 ? 1 : 2);
        this.starfield.push({
          x: Math.random() * W,
          y: Math.random() * H * 0.55,
          tw: Math.random() * Math.PI * 2,
          tws: 0.4 + Math.random() * 1.6,
          s: layer === 0 ? 0.7 : (layer === 1 ? 1.1 : 1.7),
          layer,
          col: layer === 2 ? (Math.random() < 0.4 ? '#ffd6a8' : '#cfe9ff') : '#ffffff'
        });
      }
      /* Slow drifting comm satellites — never collide with reactor area. */
      this.satellites = [];
      for (let i = 0; i < 3; i++) {
        this.satellites.push({
          x: Math.random() * W,
          y: 30 + Math.random() * H * 0.35,
          vx: 6 + Math.random() * 10,
          phase: Math.random() * Math.PI * 2
        });
      }
      /* Distant comm towers on the horizon — pure decoration with blinking
         nav lights. Positioned in 'world' coords; rendered behind the dome. */
      this.commTowers = [
        { x: W * 0.06, h: 64, blink: 0 },
        { x: W * 0.16, h: 38, blink: 0.7 },
        { x: W * 0.93, h: 52, blink: 1.4 }
      ];
      this.cracks = [];

      /* --- Events runtime for the current day --- */
      this.events = Events().createRuntime(this);

      /* --- Comet showers schedule (boss-day scripted) --- */
      this._scheduleBossEvents();

      /* Seed the intro banner for day 1 so first-time players get a hint
         about the throttle / vent loop. */
      this.dayIntroLines = this._dayIntroFor(this.day);
      this.dayIntroT = this.dayIntroLines.length ? 6 : 0;

      this.setHud(this._hud());
      this.setScore(0);
    }

    /* Push an entry into the heat log used for the post-mortem. Trims to the
       last 30 entries so the recap stays readable. Called from events.js
       and from the throttle/vent paths in this file. */
    _logHeat(source, label, amount) {
      this.heatLog.push({
        t: this.dayTime | 0,
        source,
        label,
        amount: amount | 0,
        after: Math.round((this.heat / this.maxHeat) * 100)
      });
      if (this.heatLog.length > 30) this.heatLog.shift();
    }

    /* Produce a human-readable "what's new this day" line list. Rendered as a
       fading top-of-screen banner for the first ~6s of each day. Returns an
       empty array on days without notable changes. */
    _dayIntroFor(day) {
      if (this.isEndless) {
        return [
          'ENDLESS MODE',
          'Threats stack — survive as long as you can.'
        ];
      }
      switch (day) {
        case 1: return [
          'DAY 1 — Smelt helium-3, sell, repeat.',
          'Drag the THROTTLE up. Keep heat below 100%. Use VENT (Space) when red.'
        ];
        case 2: return [
          'DAY 2 — Investor visits begin.',
          'Pick offers carefully. RISKY LOAN gives cash but adds heat.'
        ];
        case 3: return [
          'DAY 3 — Reactor surges (random +50 heat spikes).',
          'Hold throttle lower. Keep coolant ready.'
        ];
        case 4: return [
          'DAY 4 — Lunar quakes can crack modules.',
          'Build SHIELDING to deflect impacts.'
        ];
        case 5: return [
          'DAY 5 — BOSS: Comet shower at 30s.',
          'Vent before, build LASER + SHIELDING to survive.'
        ];
        case 6: return [
          'DAY 6 — Aurora bursts boost income.',
          'Push throttle when it lights up cyan.'
        ];
        case 7: return [
          'DAY 7 — Meteors arrive in pairs.',
          'Laser intercepts and shielding earn their keep.'
        ];
        case 8: return [
          'DAY 8 — Solar flares last twice as long.',
          'Auto-stabilizer or rapid venting recommended.'
        ];
        case 9: return [
          'DAY 9 — Hardened systems: meltdown threshold tighter.',
          'Stay cool. Stockpile cash for evac bonus.'
        ];
        case 10: return [
          'DAY 10 — FINAL: Comet shower at 40s.',
          'Survive to win. End-of-day cash → 50% evac bonus.'
        ];
        default: return [];
      }
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
      this._logHeat('vent', 'Emergency vent', -35);
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
      /* Slow satellite drift — wraps off the right edge. */
      if (this.satellites) {
        for (const s of this.satellites) {
          s.x += s.vx * dt;
          s.phase += dt * 4;
          if (s.x > W + 30) {
            s.x = -30;
            s.y = 30 + Math.random() * H * 0.35;
          }
        }
      }
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
          /* Auto-pick the first SAFE card (skip danger:true cards like
             Risky Loan) so an idle player isn't silently melted. */
          const cards = this.events.investor.cards;
          const safeIdx = cards.findIndex(c => !c.danger);
          const pick = cards[safeIdx >= 0 ? safeIdx : 0];
          if (pick) pick.apply(this);
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

      /* Track peak heat % for the post-mortem. */
      const heatPct = this.heat / this.maxHeat;
      if (heatPct > this.peakHeatPct) this.peakHeatPct = heatPct;

      /* Sustained high-throttle is the most common silent killer. Log it as a
         single rolling entry (replaces the previous one) so the recap can show
         "Held throttle high for 6.0s" — with the actual time accumulated. */
      if (this.throttle > 0.6 && heatPct > 0.7) {
        this.sustainedHigh += dt;
        if (this.dayTime - this._lastSustainLog > 1.5) {
          this._lastSustainLog = this.dayTime;
          /* Replace the trailing entry if it was the same source, else push. */
          const last = this.heatLog[this.heatLog.length - 1];
          if (last && last.source === 'throttle') {
            last.label = 'High throttle ' + this.sustainedHigh.toFixed(1) + 's';
            last.t = this.dayTime | 0;
            last.after = Math.round(heatPct * 100);
          } else {
            this._logHeat('throttle', 'High throttle ' + this.sustainedHigh.toFixed(1) + 's', 0);
          }
        }
      } else if (heatPct < 0.5) {
        this.sustainedHigh = 0;
      }

      /* Day-intro banner fade. */
      if (this.dayIntroT > 0) this.dayIntroT -= dt;

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
      /* Compute a one-line cause-of-death from the last few heat events. */
      this.deathCause = this._diagnoseMeltdown();
      this.recap = Campaign().buildRecap(this, 'meltdown');
      this.mode = 'recap';
    }

    /* Look at the last 6s of the heat log and pick the dominant story. The
       resulting string is rendered as a red sub-headline on the meltdown
       recap so the player understands what actually killed them. */
    _diagnoseMeltdown() {
      const cutoff = (this.dayTime | 0) - 6;
      const recent = this.heatLog.filter(e => e.t >= cutoff && e.amount > 0);
      const cfg = Campaign().getDayConfig(this.day);
      const peak = Math.round(this.peakHeatPct * 100);
      if (recent.length === 0) {
        return 'Heat ran away from sustained high throttle (peak ' + peak + '%). ' +
               'Lower throttle sooner, or build a Coolant Loop.';
      }
      /* Sum impact by source label. */
      const totals = {};
      for (const e of recent) totals[e.label] = (totals[e.label] | 0) + e.amount;
      let bestLabel = null, bestAmt = -1;
      for (const k in totals) if (totals[k] > bestAmt) { bestAmt = totals[k]; bestLabel = k; }
      let tip = '';
      if (/Risky Loan/i.test(bestLabel))   tip = ' Skip Risky Loan when heat is already > 60%.';
      else if (/Reactor surge/i.test(bestLabel)) tip = ' After a surge, vent immediately.';
      else if (/Meteor/i.test(bestLabel))  tip = ' Build Shielding or Laser to survive impacts.';
      else if (/Solar flare/i.test(bestLabel)) tip = ' Ride the throttle DOWN during flares.';
      else if (/throttle/i.test(bestLabel)) tip = ' Lower throttle sooner; the slider only cools below 30%.';
      return bestLabel + ' added +' + bestAmt + ' heat in 6s ' +
             '(peak ' + peak + '% / cap ' + (cfg.meltdownHardCap | 0) + '%).' + tip;
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
      /* Day completed (any kind that doesn't bail before this point). */
      this.daysCompletedThisRun = (this.daysCompletedThisRun | 0) + 1;
      if (kind === 'campaign_complete') this.victoryAchieved = true;
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
      /* Reset diagnostics for the new day and surface the "what's new" tip. */
      this.heatLog = [];
      this.peakHeatPct = 0;
      this.sustainedHigh = 0;
      this._lastSustainLog = 0;
      this.deathCause = null;
      this.dayIntroLines = this._dayIntroFor(this.day);
      this.dayIntroT = this.dayIntroLines.length ? 6 : 0;
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

    coinsEarned() {
      const d = this.daysCompletedThisRun | 0;
      const win = this.victoryAchieved ? 25 : 0;
      return Math.max(0, d * 4 + win);
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
      this._drawCriticalBanner(ctx);
      this._drawDayIntro(ctx);
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
      /* Layered base — deep space blends into a faint magenta horizon. */
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#050816');
      sky.addColorStop(0.45, '#0a0e22');
      sky.addColorStop(0.78, '#150a26');
      sky.addColorStop(1, '#1a0a18');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

      /* Two soft nebulas — radial gradients painted with low alpha. They
         shift colour with the campaign day for a subtle visual progression. */
      const dayProgressN = this.isEndless ? 1 : Math.min(1, (this.day - 1) / Campaign().TOTAL_DAYS);
      const tintA = `rgba(${120 + dayProgressN * 120 | 0},${60 + dayProgressN * 40 | 0},200,0.10)`;
      const tintB = `rgba(80,${140 - dayProgressN * 60 | 0},${200 - dayProgressN * 80 | 0},0.10)`;
      let g = ctx.createRadialGradient(W * 0.20, H * 0.15, 10, W * 0.20, H * 0.15, 320);
      g.addColorStop(0, tintA); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H * 0.6);
      g = ctx.createRadialGradient(W * 0.78, H * 0.30, 10, W * 0.78, H * 0.30, 280);
      g.addColorStop(0, tintB); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H * 0.6);

      /* Stars — three depth bands. Far stars dim and tight, near stars bright,
         largest stars emit a tiny cross flare on twinkle peak. */
      for (const s of this.starfield) {
        const tw = Math.abs(Math.sin(s.tw));
        const baseA = s.layer === 0 ? 0.25 : (s.layer === 1 ? 0.55 : 0.85);
        const a = baseA + tw * (1 - baseA);
        if (s.layer === 2) {
          /* Cross flare on big stars when twinkle is bright. */
          if (tw > 0.85) {
            ctx.strokeStyle = `rgba(255,235,200,${(tw - 0.85) * 4})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(s.x - 4, s.y); ctx.lineTo(s.x + 4, s.y);
            ctx.moveTo(s.x, s.y - 4); ctx.lineTo(s.x, s.y + 4);
            ctx.stroke();
          }
          ctx.fillStyle = s.col;
        } else {
          ctx.fillStyle = `rgba(255,255,255,${a})`;
        }
        ctx.fillRect(s.x, s.y, s.s, s.s);
      }

      /* Drifting satellites — small triangle with a faint trail. */
      if (this.satellites) {
        for (const sat of this.satellites) {
          ctx.fillStyle = 'rgba(207,233,255,0.7)';
          ctx.beginPath();
          ctx.moveTo(sat.x, sat.y);
          ctx.lineTo(sat.x - 4, sat.y - 1);
          ctx.lineTo(sat.x - 4, sat.y + 1);
          ctx.closePath(); ctx.fill();
          /* Blinking light. */
          const blink = (Math.sin(sat.phase) + 1) * 0.5;
          ctx.fillStyle = `rgba(255,80,80,${blink})`;
          ctx.fillRect(sat.x - 1, sat.y - 1, 2, 2);
          /* Faint streak behind. */
          ctx.strokeStyle = 'rgba(207,233,255,0.18)';
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(sat.x - 5, sat.y);
          ctx.lineTo(sat.x - 22, sat.y);
          ctx.stroke();
        }
      }

      /* Earth-rise scales with day. Add cloud band + atmospheric halo. */
      const dayProgress = this.isEndless ? 1 : Math.min(1, (this.day - 1 + this.dayTime / DAY_LENGTH) / Campaign().TOTAL_DAYS);
      const ex = W * 0.85, earthY = H * 0.18 - dayProgress * 60, er = 44;
      /* Atmospheric halo */
      const halo = ctx.createRadialGradient(ex, earthY, er * 0.85, ex, earthY, er * 1.6);
      halo.addColorStop(0, 'rgba(120,180,255,0.35)');
      halo.addColorStop(1, 'rgba(120,180,255,0)');
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(ex, earthY, er * 1.6, 0, Math.PI * 2); ctx.fill();
      /* Body */
      ctx.save();
      ctx.shadowColor = '#4fa8ff'; ctx.shadowBlur = 24;
      const eb = ctx.createRadialGradient(ex - 14, earthY - 14, 4, ex, earthY, er);
      eb.addColorStop(0, '#3a78c6');
      eb.addColorStop(0.7, '#1f4a8a');
      eb.addColorStop(1, '#0c2347');
      ctx.fillStyle = eb;
      ctx.beginPath(); ctx.arc(ex, earthY, er, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      /* Continents */
      ctx.fillStyle = '#3da55a';
      ctx.beginPath(); ctx.arc(ex - 13, earthY - 5, 12, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(ex + 17, earthY + 12, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2a3d6a';
      ctx.beginPath(); ctx.arc(ex - 35, earthY + 8, 6, 0, Math.PI * 2); ctx.fill();
      /* Clouds — thin band */
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(ex - 6, earthY + 2, er * 0.85, 4, -0.18, 0, Math.PI * 2);
      ctx.stroke();
      /* Night-side shadow */
      ctx.fillStyle = 'rgba(0,0,0,0.42)';
      ctx.beginPath(); ctx.arc(ex + 12, earthY, er, 0, Math.PI * 2); ctx.fill();
    }

    _drawSurface(ctx) {
      /* Distant comm towers — drawn behind the jagged silhouette so their
         bases get hidden by terrain. Pure decoration; blinking nav lights
         tied to wallclock time so they're never in sync. */
      if (this.commTowers) {
        for (const t of this.commTowers) {
          const baseY = H * 0.74;
          ctx.strokeStyle = 'rgba(80,90,110,0.55)';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(t.x, baseY);
          ctx.lineTo(t.x, baseY - t.h);
          ctx.stroke();
          /* Guy wires */
          ctx.beginPath();
          ctx.moveTo(t.x - t.h * 0.25, baseY);
          ctx.lineTo(t.x, baseY - t.h * 0.6);
          ctx.lineTo(t.x + t.h * 0.25, baseY);
          ctx.stroke();
          /* Antenna ring */
          ctx.strokeStyle = 'rgba(110,140,180,0.65)';
          ctx.beginPath(); ctx.arc(t.x, baseY - t.h, 4, 0, Math.PI * 2); ctx.stroke();
          /* Blinking light */
          const blink = (Math.sin(this.time * 2 + t.blink) + 1) * 0.5;
          ctx.fillStyle = `rgba(255,80,80,${0.3 + blink * 0.7})`;
          ctx.beginPath(); ctx.arc(t.x, baseY - t.h - 4, 2, 0, Math.PI * 2); ctx.fill();
        }
      }

      /* Jagged horizon silhouette. */
      ctx.fillStyle = '#1a1828';
      ctx.beginPath();
      ctx.moveTo(0, H * 0.74);
      for (let x = 0; x <= W; x += 30) {
        const h = 18 + ((x * 17) % 40);
        ctx.lineTo(x, H * 0.74 - h);
      }
      ctx.lineTo(W, H * 0.78); ctx.lineTo(0, H * 0.78);
      ctx.closePath(); ctx.fill();

      /* Lunar surface gradient. */
      const surf = ctx.createLinearGradient(0, H * 0.78, 0, H);
      surf.addColorStop(0, '#1c1d2a'); surf.addColorStop(1, '#0a0a13');
      ctx.fillStyle = surf;
      ctx.fillRect(0, H * 0.78, W, H * 0.22);

      /* Reactor light cast — soft elliptical glow on the ground tinted by
         current heat colour. Stronger when throttle is high. */
      const heatPct = clamp(this.heat / this.maxHeat, 0, 1.3);
      const cast = this._heatColor(heatPct);
      const intensity = 0.25 + this.throttle * 0.45;
      const gx = this.reactor.x, gy = H * 0.84;
      const lg = ctx.createRadialGradient(gx, gy, 20, gx, gy, 320);
      lg.addColorStop(0, cast.rgba(0.30 * intensity));
      lg.addColorStop(0.5, cast.rgba(0.10 * intensity));
      lg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.ellipse(gx, gy, 320, 80, 0, 0, Math.PI * 2);
      ctx.fill();

      /* Craters with rim highlight. */
      const craters = [
        [0.08, 0.92, 36], [0.22, 0.97, 24], [0.78, 0.88, 30],
        [0.92, 0.95, 22], [0.6, 0.96, 18], [0.34, 0.96, 14], [0.5, 0.93, 11]
      ];
      for (const [cx, cy, r] of craters) {
        const x = cx * W, y = cy * H;
        /* Crater bowl */
        ctx.fillStyle = '#0a0a13';
        ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.4, 0, 0, Math.PI * 2); ctx.fill();
        /* Bright rim arc on the side closest to the reactor for fake lighting */
        const lit = x < gx ? -1 : 1;
        ctx.strokeStyle = cast.rgba(0.18 + intensity * 0.18);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.ellipse(x + lit * 1.2, y - 1, r, r * 0.4, 0, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
        /* Subtle outer scatter */
        ctx.strokeStyle = 'rgba(255,255,255,0.07)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.4, 0, 0, Math.PI * 2); ctx.stroke();
      }

      /* Surface speckle for grit. */
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      for (let i = 0; i < 40; i++) {
        const sx = (i * 91 + (this.day | 0) * 13) % W;
        const sy = H * 0.82 + ((i * 53) % (H * 0.16));
        ctx.fillRect(sx, sy, 1, 1);
      }

      for (const d of this.dust) {
        const a = 1 - d.age / d.life;
        ctx.fillStyle = `rgba(180,180,200,${a * 0.3})`;
        ctx.fillRect(d.x, d.y, 2, 2);
      }
    }

    _drawDome(ctx) {
      const baseCX = this.reactor.x, baseCY = H * 0.78, baseR = 360;
      /* Soft inner glow tinted slightly by reactor heat for atmosphere. */
      const heatPct = clamp(this.heat / this.maxHeat, 0, 1.2);
      const tintR = Math.round(124 + heatPct * 80);
      const tintG = Math.round(217 - heatPct * 100);
      const tintB = Math.round(255 - heatPct * 80);
      const grad = ctx.createRadialGradient(baseCX - 80, baseCY - 80, 20, baseCX, baseCY, baseR);
      grad.addColorStop(0, `rgba(${tintR},${tintG},${tintB},0.12)`);
      grad.addColorStop(0.7, `rgba(${tintR},${tintG},${tintB},0.04)`);
      grad.addColorStop(1, 'rgba(124,217,255,0.0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(baseCX, baseCY, baseR, Math.PI, 0); ctx.fill();

      /* Faint hex grid hinting at structural panels — stays subtle. */
      ctx.save();
      ctx.beginPath();
      ctx.arc(baseCX, baseCY, baseR - 2, Math.PI, 0);
      ctx.lineTo(baseCX + baseR - 2, baseCY);
      ctx.lineTo(baseCX - baseR + 2, baseCY);
      ctx.closePath();
      ctx.clip();
      ctx.strokeStyle = `rgba(${tintR},${tintG},${tintB},0.08)`;
      ctx.lineWidth = 1;
      const hexS = 36;
      for (let y = baseCY - baseR; y < baseCY; y += hexS * 0.86) {
        const offset = ((y / (hexS * 0.86)) | 0) % 2 === 0 ? 0 : hexS / 2;
        for (let x = baseCX - baseR + offset; x < baseCX + baseR; x += hexS) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + hexS / 2, y + hexS * 0.43);
          ctx.lineTo(x + hexS, y);
          ctx.stroke();
        }
      }
      ctx.restore();

      /* Outer rim. */
      ctx.strokeStyle = `rgba(${tintR},${tintG},${tintB},0.45)`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(baseCX, baseCY, baseR, Math.PI, 0); ctx.stroke();

      /* Specular highlight sweep on the upper-left of the dome. */
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(baseCX - 50, baseCY - 30, baseR - 30, Math.PI * 1.05, Math.PI * 1.4);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.beginPath();
      ctx.arc(baseCX - 30, baseCY - 50, baseR - 60, Math.PI * 1.10, Math.PI * 1.35);
      ctx.stroke();

      /* Dome base ring — visual seam where dome meets surface. */
      ctx.strokeStyle = `rgba(${tintR},${tintG},${tintB},0.35)`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(baseCX, baseCY, baseR, 14, 0, 0, Math.PI, false);
      ctx.stroke();
    }

    _drawPipes(ctx) {
      const heatPct = clamp(this.heat / this.maxHeat, 0, 1.3);
      const flowSpeed = 60 + heatPct * 120 + this.throttle * 80;
      const dashOffset = -((this.time * flowSpeed) % 24);

      Modules().CATALOG.forEach(m => {
        if (!(this.modules[m.id] || 0)) return;
        const p = this.modulePositions[m.id];
        if (!p) return;
        /* Outer pipe casing */
        ctx.strokeStyle = '#1a2230';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(this.reactor.x, this.reactor.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        /* Inner energy stream — animated dashed line in the module's own
           colour, so each pipe is recognisable. */
        ctx.strokeStyle = m.color;
        ctx.globalAlpha = 0.55 + 0.35 * Math.sin(this.time * 4 + p.x * 0.05);
        ctx.lineWidth = 2.5;
        ctx.setLineDash([6, 6]);
        ctx.lineDashOffset = dashOffset;
        ctx.beginPath();
        ctx.moveTo(this.reactor.x, this.reactor.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        /* Bright connector node where the pipe meets the reactor — glow
           pulses with throttle so high power literally lights up. */
        const glow = 0.4 + this.throttle * 0.6;
        ctx.fillStyle = m.color;
        ctx.globalAlpha = glow;
        ctx.beginPath();
        ctx.arc(this.reactor.x, this.reactor.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      });
    }

    _drawReactor(ctx) {
      const heatPct = clamp(this.heat / this.maxHeat, 0, 1.5);
      const coreColor = this._heatColor(heatPct);
      const pulse = 1 + Math.sin(this.time * 8 + this.heat * 0.05) * 0.05 * (0.4 + this.throttle);
      const r = this.reactor.r * pulse;
      const cx = this.reactor.x, cy = this.reactor.y;

      /* Plasma exhaust column — visible whenever the throttle is doing work.
         Triangular shape rising from the core; its tail intensity scales with
         throttle and heat. Drawn first so the core overlaps the base. */
      if (this.throttle > 0.05) {
        const colH = 90 + this.throttle * 80;
        const colW = 12 + this.throttle * 14;
        const grad = ctx.createLinearGradient(cx, cy - r, cx, cy - r - colH);
        grad.addColorStop(0, coreColor.rgba(0.55 + this.throttle * 0.3));
        grad.addColorStop(0.4, coreColor.rgba(0.25));
        grad.addColorStop(1, coreColor.rgba(0));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(cx - colW, cy - r);
        ctx.quadraticCurveTo(cx - colW * 0.4, cy - r - colH * 0.6, cx, cy - r - colH);
        ctx.quadraticCurveTo(cx + colW * 0.4, cy - r - colH * 0.6, cx + colW, cy - r);
        ctx.closePath();
        ctx.fill();
      }

      /* Outer rotating containment ring — segmented arcs, opposite-spin pair. */
      ctx.lineCap = 'round';
      const baseR = r + 32;
      for (let pass = 0; pass < 2; pass++) {
        const dir = pass === 0 ? 1 : -1;
        ctx.strokeStyle = coreColor.rgba(0.45 + heatPct * 0.4);
        ctx.lineWidth = 2;
        for (let i = 0; i < 4; i++) {
          const a0 = (i / 4) * Math.PI * 2 + this.time * 0.7 * dir;
          ctx.beginPath();
          ctx.arc(cx, cy, baseR + pass * 8, a0, a0 + Math.PI * 0.32);
          ctx.stroke();
        }
      }
      ctx.lineCap = 'butt';

      /* Core body */
      ctx.save();
      ctx.shadowColor = coreColor.css; ctx.shadowBlur = 36 + heatPct * 60;
      ctx.fillStyle = '#101828';
      ctx.beginPath(); ctx.arc(cx, cy, r + 18, 0, Math.PI * 2); ctx.fill();
      const coreGrad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 2, cx, cy, r);
      coreGrad.addColorStop(0, '#ffffff');
      coreGrad.addColorStop(0.35, coreColor.rgba(0.95));
      coreGrad.addColorStop(1, coreColor.rgba(0.65));
      ctx.fillStyle = coreGrad;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      /* Inner white-hot eye */
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.55 + heatPct * 0.4;
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.32 * pulse, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;

      /* Pulsating energy halo */
      ctx.strokeStyle = coreColor.rgba(0.7);
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, cy, r + 8 + Math.sin(this.time * 6) * 1.5, 0, Math.PI * 2); ctx.stroke();

      /* Static containment shroud */
      ctx.strokeStyle = '#3a4660'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, r + 22, 0, Math.PI * 2); ctx.stroke();

      /* Tick marks around the shroud */
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2 + this.time * 0.18;
        const x1 = cx + Math.cos(a) * (r + 22);
        const y1 = cy + Math.sin(a) * (r + 22);
        const x2 = cx + Math.cos(a) * (r + 28);
        const y2 = cy + Math.sin(a) * (r + 28);
        ctx.strokeStyle = coreColor.rgba(i % 4 === 0 ? 0.8 : 0.35);
        ctx.lineWidth = i % 4 === 0 ? 2 : 1;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      }

      /* Random electric arcs leaping off the core when over-heating. */
      if (heatPct > 0.85 && this.mode === 'playing' && Math.random() < 0.4) {
        ctx.strokeStyle = `rgba(255,255,255,${0.5 + Math.random() * 0.4})`;
        ctx.lineWidth = 1 + Math.random() * 1.5;
        const a = Math.random() * Math.PI * 2;
        const x0 = cx + Math.cos(a) * r;
        const y0 = cy + Math.sin(a) * r;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        let x = x0, y = y0;
        for (let s = 0; s < 4; s++) {
          x += Math.cos(a) * 8 + (Math.random() - 0.5) * 12;
          y += Math.sin(a) * 8 + (Math.random() - 0.5) * 12;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
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

        /* Soft owned-glow halo so populated pods read at a glance and the
           scene gets a colourful constellation of activity. */
        if (owned) {
          const halo = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, 30);
          halo.addColorStop(0, this._tint(m.color, 0.35));
          halo.addColorStop(1, this._tint(m.color, 0));
          ctx.fillStyle = halo;
          ctx.beginPath(); ctx.arc(p.x, p.y, 30, 0, Math.PI * 2); ctx.fill();
        }

        /* Pod chassis with bevelled edge. */
        const cx = p.x - 22, cy = p.y - 18, w = 44, h = 36;
        const podGrad = ctx.createLinearGradient(cx, cy, cx, cy + h);
        if (owned) {
          podGrad.addColorStop(0, '#22304a');
          podGrad.addColorStop(1, '#0e1622');
        } else {
          podGrad.addColorStop(0, 'rgba(40,46,60,0.55)');
          podGrad.addColorStop(1, 'rgba(20,24,36,0.45)');
        }
        ctx.fillStyle = podGrad;
        ctx.fillRect(cx, cy, w, h);
        /* Inner highlight strip (top edge) */
        if (owned) {
          ctx.fillStyle = 'rgba(255,255,255,0.07)';
          ctx.fillRect(cx, cy, w, 2);
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ctx.fillRect(cx, cy + h - 2, w, 2);
        }
        ctx.strokeStyle = owned ? m.color : 'rgba(120,130,150,0.3)';
        ctx.lineWidth = 2;
        ctx.strokeRect(cx + 1, cy + 1, w - 2, h - 2);

        /* Glyph + per-module animated overlay drawn on top. */
        Modules().drawGlyph(ctx, m.id, p.x, p.y - 2, m.color, owned);
        if (owned) this._drawModuleAnim(ctx, m, p);

        if (count > 0) {
          /* Count badge — pill in the top-right corner. */
          const tx = p.x + 14, ty = p.y - 14;
          ctx.fillStyle = m.color;
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(tx - 11, ty - 7, 24, 14, 3);
          else ctx.rect(tx - 11, ty - 7, 24, 14);
          ctx.fill();
          ctx.fillStyle = '#0a1020';
          ctx.font = 'bold 10px ui-monospace, monospace';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('×' + count, tx + 1, ty);
        }

        /* Status LED bottom-left — heartbeat. */
        if (owned) {
          const ind = 0.5 + 0.5 * Math.sin(this.time * 5 + p.x * 0.01);
          ctx.fillStyle = m.color;
          ctx.globalAlpha = 0.4 + ind * 0.6;
          ctx.fillRect(cx + 4, cy + h - 6, 5, 3);
          ctx.globalAlpha = 1;
        }
      });
    }

    /* Per-module living detail overlaid on the static glyph. Kept tiny so
       the sprite still reads as the same module — these are micro-motions:
       rotating fans, drilling bits, tracking turrets, pumping pistons. */
    _drawModuleAnim(ctx, m, p) {
      const t = this.time;
      ctx.save();
      ctx.translate(p.x, p.y - 2);
      switch (m.id) {
        case 'cool': {
          /* Fan blades spinning around the cool icon's centre. */
          ctx.rotate(t * 4);
          ctx.strokeStyle = m.color;
          ctx.globalAlpha = 0.6;
          ctx.lineWidth = 1.2;
          for (let i = 0; i < 3; i++) {
            ctx.rotate(Math.PI * 2 / 3);
            ctx.beginPath();
            ctx.moveTo(0, 0); ctx.quadraticCurveTo(3, -2, 6, -1);
            ctx.stroke();
          }
          break;
        }
        case 'rig': {
          /* Drill-bit shake */
          const sh = Math.sin(t * 30) * 0.6;
          ctx.translate(sh, 0);
          ctx.fillStyle = m.color;
          ctx.globalAlpha = 0.7;
          ctx.fillRect(5, -2, 4, 5);
          ctx.fillRect(7, 3, 1, 3);
          break;
        }
        case 'solar': {
          /* Panel tilt sweep */
          const tilt = Math.sin(t * 0.6) * 0.18;
          ctx.translate(0, 8);
          ctx.rotate(tilt);
          ctx.strokeStyle = m.color;
          ctx.globalAlpha = 0.55;
          ctx.lineWidth = 1;
          for (let i = -1; i <= 1; i++) {
            ctx.strokeRect(-7, i * 1.5 - 1, 14, 0.6);
          }
          break;
        }
        case 'laser': {
          /* Turret aim sway */
          const aim = Math.sin(t * 1.5) * 0.4;
          ctx.rotate(aim);
          ctx.strokeStyle = m.color;
          ctx.globalAlpha = 0.55;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(0, -5); ctx.lineTo(0, -14);
          ctx.stroke();
          break;
        }
        case 'pump': {
          /* Piston bobbing */
          const bob = (Math.sin(t * 4) + 1) * 1.5;
          ctx.fillStyle = m.color;
          ctx.globalAlpha = 0.6;
          ctx.fillRect(-2, -8 + bob, 4, 2);
          break;
        }
        case 'hab': {
          /* Window flicker */
          const fl = (Math.sin(t * 7) + Math.sin(t * 13)) * 0.5 + 0.5;
          ctx.fillStyle = m.color;
          ctx.globalAlpha = 0.4 + fl * 0.4;
          ctx.fillRect(-2, -2, 4, 4);
          break;
        }
        case 'pad': {
          /* Beacon strobe */
          const fl = (Math.sin(t * 3) + 1) * 0.5;
          ctx.fillStyle = '#ffd86b';
          ctx.globalAlpha = fl;
          ctx.fillRect(-1, -12, 2, 2);
          break;
        }
        case 'core': {
          /* Inner counter-rotating ring */
          ctx.rotate(-t * 1.2);
          ctx.strokeStyle = m.color;
          ctx.globalAlpha = 0.5;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.ellipse(0, 0, 7, 3, 0, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
        case 'shield': {
          /* Outer shield shimmer */
          const a = 0.25 + 0.35 * Math.abs(Math.sin(t * 2));
          ctx.strokeStyle = m.color;
          ctx.globalAlpha = a;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, -12); ctx.lineTo(10, -7); ctx.lineTo(10, 5);
          ctx.lineTo(0, 12); ctx.lineTo(-10, 5); ctx.lineTo(-10, -7);
          ctx.closePath();
          ctx.stroke();
          break;
        }
        case 'auto': {
          /* Inner ring rotation */
          ctx.rotate(t * 1.6);
          ctx.strokeStyle = m.color;
          ctx.globalAlpha = 0.55;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.arc(0, 0, 5, -Math.PI * 0.4, Math.PI * 0.4);
          ctx.stroke();
          break;
        }
        case 'box': {
          /* Latch indicator pulse */
          const fl = (Math.sin(t * 4) + 1) * 0.5;
          ctx.fillStyle = '#4ade80';
          ctx.globalAlpha = 0.4 + fl * 0.4;
          ctx.fillRect(-1, -1, 2, 2);
          break;
        }
      }
      ctx.restore();
    }

    /* Tint helper — converts a hex colour into an rgba string at the given
       alpha. Used by the module halo gradient. */
    _tint(hex, alpha) {
      const h = hex.replace('#', '');
      const r = parseInt(h.substr(0, 2), 16);
      const g = parseInt(h.substr(2, 2), 16);
      const b = parseInt(h.substr(4, 2), 16);
      return `rgba(${r},${g},${b},${alpha})`;
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
      /* Outer chrome bezel — gives the panel a tactile, instrument feel. */
      const bezelX = r.x - 12, bezelY = r.y - 32, bezelW = r.w + 24, bezelH = r.h + 64;
      const bezel = ctx.createLinearGradient(bezelX, bezelY, bezelX, bezelY + bezelH);
      bezel.addColorStop(0, '#0e1424');
      bezel.addColorStop(1, '#070b18');
      ctx.fillStyle = bezel;
      ctx.fillRect(bezelX, bezelY, bezelW, bezelH);
      ctx.strokeStyle = '#3a4660'; ctx.lineWidth = 2;
      ctx.strokeRect(bezelX + 0.5, bezelY + 0.5, bezelW - 1, bezelH - 1);
      /* Top-edge highlight strip */
      ctx.fillStyle = 'rgba(124,217,255,0.15)';
      ctx.fillRect(bezelX + 2, bezelY + 2, bezelW - 4, 1);

      ctx.fillStyle = '#cfe9ff';
      ctx.font = 'bold 12px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText('THROTTLE', r.x + r.w/2, r.y - 24);

      /* Recessed channel for the slider — drop-shadow inset */
      ctx.fillStyle = '#050810';
      ctx.fillRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4);

      /* Colour gradient. */
      const grad = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
      grad.addColorStop(0, '#ff3a3a');
      grad.addColorStop(0.3, '#ffae44');
      grad.addColorStop(0.6, '#4ade80');
      grad.addColorStop(1, '#7cd9ff');
      ctx.fillStyle = grad;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      /* Glassy vertical highlight on the slider's left edge. */
      const gl = ctx.createLinearGradient(r.x, 0, r.x + r.w, 0);
      gl.addColorStop(0, 'rgba(255,255,255,0.20)');
      gl.addColorStop(0.4, 'rgba(255,255,255,0.0)');
      gl.addColorStop(1, 'rgba(0,0,0,0.25)');
      ctx.fillStyle = gl;
      ctx.fillRect(r.x, r.y, r.w, r.h);

      ctx.strokeStyle = '#3a4660'; ctx.lineWidth = 1;
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);

      /* Highlight the helium-pump stable band when applicable. */
      if ((this.modules.pump || 0) > 0) {
        const yTop = r.y + (1 - 0.60) * r.h;
        const yBot = r.y + (1 - 0.20) * r.h;
        ctx.fillStyle = 'rgba(183,148,246,0.10)';
        ctx.fillRect(r.x, yTop, r.w, yBot - yTop);
        ctx.strokeStyle = 'rgba(183,148,246,0.7)';
        ctx.lineWidth = 1;
        ctx.strokeRect(r.x - 1, yTop, r.w + 2, yBot - yTop);
        /* Tiny He³ label on the band. */
        ctx.fillStyle = 'rgba(183,148,246,0.85)';
        ctx.font = 'bold 8px ui-monospace, monospace';
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText('He³', r.x - 11, (yTop + yBot) / 2);
      }

      /* Tick ridges on both sides for that mechanical-slider look. */
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      for (let i = 1; i < 10; i++) {
        const y = r.y + (r.h * i / 10);
        const long = i % 5 === 0;
        const len = long ? 0.35 : 0.22;
        ctx.beginPath(); ctx.moveTo(r.x, y); ctx.lineTo(r.x + r.w * len, y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(r.x + r.w * (1 - len), y); ctx.lineTo(r.x + r.w, y); ctx.stroke();
      }

      /* Knob — drop shadow underneath, then bevelled chassis, then a yellow
         indicator stripe across the centre. */
      const ky = r.y + (1 - this.throttle) * r.h;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(r.x - 8, ky - 7, r.w + 16, 18);
      const kg = ctx.createLinearGradient(0, ky - 8, 0, ky + 8);
      kg.addColorStop(0, '#2a3552');
      kg.addColorStop(0.5, '#1a2238');
      kg.addColorStop(1, '#0a1020');
      ctx.fillStyle = kg;
      ctx.fillRect(r.x - 8, ky - 8, r.w + 16, 16);
      ctx.strokeStyle = '#ffd86b'; ctx.lineWidth = 2;
      ctx.strokeRect(r.x - 8, ky - 8, r.w + 16, 16);
      /* Notch grips on the knob */
      ctx.fillStyle = 'rgba(255,216,107,0.55)';
      for (let g = -2; g <= 2; g++) {
        ctx.fillRect(r.x + 4 + (g + 2) * 7, ky - 5, 1, 10);
      }
      /* Centre indicator stripe */
      ctx.fillStyle = '#ffd86b';
      ctx.fillRect(r.x - 4, ky - 1, r.w + 8, 2);

      /* Readout */
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
      const live = ready && canAfford;
      /* Pulse only when the player should actually press the button —
         critical heat AND the button is ready. Drives attention without
         creating an annoying constant strobe. */
      const urgent = live && this.heat > this.maxHeat;
      const pulse = urgent ? 0.6 + 0.4 * Math.abs(Math.sin(this.time * 6)) : 1;

      /* Drop shadow / depth */
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(r.x + 2, r.y + 4, r.w, r.h);

      /* Body — gradient tinted by state. */
      const bg = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
      if (live) {
        bg.addColorStop(0, '#1c2a40');
        bg.addColorStop(1, '#0a1530');
      } else {
        bg.addColorStop(0, '#10141f');
        bg.addColorStop(1, '#080b14');
      }
      ctx.fillStyle = bg;
      ctx.fillRect(r.x, r.y, r.w, r.h);

      /* Glow when urgent */
      if (urgent) {
        ctx.save();
        ctx.shadowColor = '#ff5e7e';
        ctx.shadowBlur = 18 * pulse;
        ctx.strokeStyle = `rgba(255,94,126,${pulse})`;
        ctx.lineWidth = 2;
        ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
        ctx.restore();
      } else {
        ctx.strokeStyle = live ? '#7cd9ff' : '#3a4660';
        ctx.lineWidth = 2;
        ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
      }

      /* Hazard chevron strip across the top */
      ctx.fillStyle = live ? 'rgba(124,217,255,0.18)' : 'rgba(58,70,96,0.18)';
      ctx.fillRect(r.x + 2, r.y + 2, r.w - 4, 6);
      ctx.fillStyle = live ? 'rgba(124,217,255,0.6)' : 'rgba(80,90,110,0.5)';
      for (let i = 0; i < 7; i++) {
        const x = r.x + 4 + i * 12;
        ctx.beginPath();
        ctx.moveTo(x, r.y + 8);
        ctx.lineTo(x + 5, r.y + 4);
        ctx.lineTo(x + 8, r.y + 4);
        ctx.lineTo(x + 3, r.y + 8);
        ctx.closePath(); ctx.fill();
      }

      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = 'bold 13px ui-monospace, monospace';
      ctx.fillText('EMERGENCY', r.x + r.w/2, r.y + 24);
      ctx.fillText('VENT', r.x + r.w/2, r.y + 40);
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillStyle = live ? '#ffd86b' : '#667';
      if (ready) {
        ctx.fillText('Cost $' + fmt(cost), r.x + r.w/2, r.y + 58);
      } else {
        /* Cooldown progress bar replaces text label. */
        const f = clamp(1 - this.ventCooldown / 6, 0, 1);
        const barW = r.w - 16;
        ctx.fillStyle = '#0a1020';
        ctx.fillRect(r.x + 8, r.y + 56, barW, 4);
        ctx.fillStyle = '#7cd9ff';
        ctx.fillRect(r.x + 8, r.y + 56, barW * f, 4);
        ctx.fillStyle = '#8892a6';
        ctx.font = '9px ui-monospace, monospace';
        ctx.fillText(this.ventCooldown.toFixed(1) + 's', r.x + r.w/2, r.y + 64);
      }
    }

    _drawGauges(ctx) {
      const cx = this.heatGaugeC.x, cy = this.heatGaugeC.y, r = this.heatGaugeC.r;
      const startA = Math.PI * 0.85, endA = Math.PI * 0.15;
      const total = (Math.PI * 2) - (startA - endA);
      const SCALE_MAX = 1.2;
      const heatPct = this.heat / this.maxHeat;
      const visPct = clamp(heatPct, 0, SCALE_MAX) / SCALE_MAX;
      const heatCol = this._heatColor(clamp(heatPct, 0, 1.3));

      /* Behind-arc dial — draw colored zones (cool→warm→hot→meltdown) at low
         alpha so the player can read the gauge at a glance. */
      const segments = [
        { from: 0.00, to: 0.50, c: 'rgba(74,222,128,0.18)' },
        { from: 0.50, to: 0.78, c: 'rgba(255,174,68,0.18)' },
        { from: 0.78, to: 1.00 / SCALE_MAX, c: 'rgba(255,94,126,0.20)' },
        { from: 1.00 / SCALE_MAX, to: 1, c: 'rgba(255,58,58,0.25)' }
      ];
      ctx.lineWidth = 14;
      for (const s of segments) {
        ctx.strokeStyle = s.c;
        ctx.beginPath();
        ctx.arc(cx, cy, r, startA + total * s.from, startA + total * s.to, false);
        ctx.stroke();
      }

      /* Empty dial track on top of zones */
      ctx.strokeStyle = '#1a2230'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, cy, r + 8, startA, startA + total, false); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, r - 8, startA, startA + total, false); ctx.stroke();

      /* Pulsing critical halo when over max heat. */
      if (heatPct > 1) {
        const pulse = 0.5 + 0.5 * Math.abs(Math.sin(this.time * 8));
        ctx.save();
        ctx.shadowColor = '#ff3a3a'; ctx.shadowBlur = 30 * pulse;
        ctx.strokeStyle = `rgba(255,58,58,${0.35 * pulse})`;
        ctx.lineWidth = 14;
        ctx.beginPath(); ctx.arc(cx, cy, r, startA, startA + total * visPct, false); ctx.stroke();
        ctx.restore();
      }

      /* Active heat arc with a soft inner glow */
      ctx.save();
      ctx.shadowColor = heatCol.css;
      ctx.shadowBlur = 8 + heatPct * 18;
      ctx.strokeStyle = heatCol.css;
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.arc(cx, cy, r, startA, startA + total * visPct, false);
      ctx.stroke();
      ctx.restore();

      /* Bright pip at the leading edge of the arc — looks like a needle tip. */
      const tipA = startA + total * visPct;
      const tipX = cx + Math.cos(tipA) * r;
      const tipY = cy + Math.sin(tipA) * r;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(tipX, tipY, 3.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = heatCol.rgba(0.85);
      ctx.beginPath(); ctx.arc(tipX, tipY, 5.5, 0, Math.PI * 2); ctx.fill();
      /* Tick at 100% (max heat — alarm zone begins). */
      const hot = this._heatColor(1);
      ctx.strokeStyle = hot.css; ctx.lineWidth = 3;
      const tickFrac = 1 / SCALE_MAX;
      const ang = startA + total * tickFrac;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * (r - 14), cy + Math.sin(ang) * (r - 14));
      ctx.lineTo(cx + Math.cos(ang) * (r + 8), cy + Math.sin(ang) * (r + 8));
      ctx.stroke();
      ctx.fillStyle = hot.css;
      ctx.font = 'bold 9px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const lblA = ang;
      ctx.fillText('MAX',
        cx + Math.cos(lblA) * (r + 22),
        cy + Math.sin(lblA) * (r + 22));

      /* Tick at meltdown hard cap — the actual fail line. */
      const cfg = Campaign().getDayConfig(this.day);
      const meltFrac = Math.min(SCALE_MAX, cfg.meltdownHardCap / this.maxHeat) / SCALE_MAX;
      const mAng = startA + total * meltFrac;
      ctx.strokeStyle = '#ff3a3a'; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(mAng) * (r - 18), cy + Math.sin(mAng) * (r - 18));
      ctx.lineTo(cx + Math.cos(mAng) * (r + 12), cy + Math.sin(mAng) * (r + 12));
      ctx.stroke();
      ctx.fillStyle = '#ff5e7e';
      ctx.font = 'bold 9px ui-monospace, monospace';
      ctx.fillText('MELTDOWN',
        cx + Math.cos(mAng) * (r + 28),
        cy + Math.sin(mAng) * (r + 28));

      ctx.fillStyle = '#cfe9ff';
      ctx.font = 'bold 12px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('HEAT', cx, cy - 22);
      ctx.fillStyle = this._heatColor(heatPct).css;
      ctx.font = 'bold 26px ui-monospace, monospace';
      ctx.fillText(((this.heat / this.maxHeat) * 100 | 0) + '%', cx, cy + 4);
      ctx.fillStyle = '#8892a6';
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillText(this.heat.toFixed(0) + ' / ' + this.maxHeat +
        '  ·  cap ' + (cfg.meltdownHardCap | 0), cx, cy + 26);

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

    /* Big mid-screen warning whenever heat is in the kill zone. Tells the
       player exactly what to do (vent / cut throttle) so day-2 deaths stop
       feeling like ambushes. Only drawn during play. */
    _drawCriticalBanner(ctx) {
      if (this.mode !== 'playing') return;
      if (this.heat <= this.maxHeat) return;
      const cfg = Campaign().getDayConfig(this.day);
      const over = clamp((this.heat - this.maxHeat) / Math.max(1, cfg.meltdownHardCap - this.maxHeat), 0, 1);
      const pulse = 0.55 + 0.45 * Math.abs(Math.sin(this.time * 8));
      const y = 56;
      const w = 520, h = 64;
      const x = (W - w) / 2;
      ctx.fillStyle = `rgba(40,4,8,${0.55 + over * 0.25})`;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = `rgba(255,58,58,${pulse})`;
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
      ctx.fillStyle = `rgba(255,90,90,${pulse})`;
      ctx.font = 'bold 18px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('CRITICAL  ·  ' + ((this.heat / this.maxHeat) * 100 | 0) + '%   MELTDOWN AT ' + (cfg.meltdownHardCap | 0) + '%', x + w/2, y + 22);
      ctx.fillStyle = '#ffd86b';
      ctx.font = 'bold 13px ui-monospace, monospace';
      const action = this.ventCooldown > 0
        ? 'CUT THROTTLE — vent in ' + this.ventCooldown.toFixed(1) + 's'
        : 'PRESS SPACE TO VENT  ·  drop throttle below 30%';
      ctx.fillText(action, x + w/2, y + 46);
    }

    /* Per-day intro banner: surfaces what's new this day so the player isn't
       blindsided by mechanics that didn't exist yesterday. Auto-fades. */
    _drawDayIntro(ctx) {
      if (this.dayIntroT <= 0 || this.dayIntroLines.length === 0) return;
      if (this.mode !== 'playing') return;
      const a = Math.min(1, this.dayIntroT / 1.5);
      const w = 560, h = 60;
      const x = (W - w) / 2;
      const y = H - 110;
      ctx.fillStyle = `rgba(8,14,28,${0.82 * a})`;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = `rgba(124,217,255,${0.9 * a})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
      ctx.fillStyle = `rgba(124,217,255,${a})`;
      ctx.font = 'bold 13px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(this.dayIntroLines[0] || '', x + w/2, y + 18);
      ctx.fillStyle = `rgba(207,233,255,${a})`;
      ctx.font = '12px ui-monospace, monospace';
      ctx.fillText(this.dayIntroLines[1] || '', x + w/2, y + 40);
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
