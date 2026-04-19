/* Diner Rush — Five-Day Shift.
   ----------------------------------------------------------------------------
   A 5-day campaign. Each day is a timed shift; each shift introduces new
   ingredients, a tighter customer cadence, and a "VIP" customer that pays
   extra but eats the most patience. The final day ends with the food critic —
   a boss customer with a big tip but a brutal recipe and short patience.

   Run flow:
     intro → day-splash → shift → day-end (tally) → upgrade-shop → next day → …
     ↳ on day 5, the shift includes the food critic and a victory splash.

   Persistence:
     bestDay        — furthest day reached
     stations { grill, prep, fridge, marketing }
       grill       — adds patty bonus tip
       prep        — extra plate slot height (more ingredients per burger)
       fridge      — slows patience drain
       marketing   — more customers but better tips
     totalTips      — lifetime tips (not spent)

   Stations are bought between days from the kitchen-shop using the global
   coin pool. They survive across runs.
*/
(function () {
  const NDP = window.NDP;
  const { BaseGame, Input, Sprites } = NDP.Engine;
  const Storage = NDP.Engine.Storage;

  const W = 960, H = 600;

  // ---------- Ingredient catalog ----------
  // Sprite + height + tier (which day unlocks it).
  const INGREDIENTS = [
    { id:'bun_b',   name:'Bun',     sprite:'diner.bun_b',   color:'#d4a36a', height: 14, tier: 1 },
    { id:'patty',   name:'Patty',   sprite:'diner.patty',   color:'#6b3a1e', height: 10, tier: 1 },
    { id:'lettuce', name:'Lettuce', sprite:'diner.lettuce', color:'#7ac74f', height: 8,  tier: 1 },
    { id:'tomato',  name:'Tomato',  sprite:'diner.tomato',  color:'#c4402d', height: 7,  tier: 1 },
    { id:'cheese',  name:'Cheese',  sprite:'diner.cheese',  color:'#ffd86b', height: 6,  tier: 1 },
    { id:'pickle',  name:'Pickle',  sprite:'diner.pickle',  color:'#5a8c3a', height: 5,  tier: 2 },
    { id:'sauce',   name:'Sauce',   sprite:'diner.sauce',   color:'#c91a1a', height: 4,  tier: 2 },
    { id:'bacon',   name:'Bacon',   sprite:'diner.bacon',   color:'#c45a3a', height: 8,  tier: 3 },
    { id:'mushroom',name:'Mushroom',sprite:'diner.mushroom',color:'#8a6a4a', height: 8,  tier: 4 },
    { id:'bun_t',   name:'Top Bun', sprite:'diner.bun_t',   color:'#d4a36a', height: 14, tier: 1 }
  ];
  const ING_BY_ID = Object.fromEntries(INGREDIENTS.map(i => [i.id, i]));

  // ---------- Days ----------
  // Each day: length (s), spawn cadence base, recipe difficulty cap (size).
  const DAYS = [
    { n:1, name:'OPENING DAY',     length: 60, spawnBase: 3.6, maxSize: 3, vips: 1, critic: false, intro: 'Just buns, patties, and basic toppings. Get a feel for the rush.' },
    { n:2, name:'PICKLE & SAUCE',  length: 70, spawnBase: 3.2, maxSize: 4, vips: 2, critic: false, intro: 'Pickles and sauce unlock. Customers get pickier.' },
    { n:3, name:'BACON DAY',       length: 75, spawnBase: 2.8, maxSize: 5, vips: 2, critic: false, intro: 'Bacon arrives. So does a hungrier dinner crowd.' },
    { n:4, name:'GOURMET NIGHT',   length: 80, spawnBase: 2.4, maxSize: 6, vips: 3, critic: false, intro: 'Mushrooms unlock. Recipes get long — keep the order in sight.' },
    { n:5, name:'THE CRITIC',      length: 85, spawnBase: 2.2, maxSize: 7, vips: 3, critic: true,  intro: 'A famous food critic shows up. Nail his order or burn the diner.' }
  ];

  const STATIONS = [
    { id:'grill',     name:'BETTER GRILL',  desc:'+25% tip on burgers with patty', cost: 100 },
    { id:'prep',      name:'PREP STATION',  desc:'Recipes can be 1 ingredient longer', cost: 140 },
    { id:'fridge',    name:'FRESH FRIDGE',  desc:'Customer patience -25% drain',   cost: 120 },
    { id:'marketing', name:'MARKETING',     desc:'+1 customer per spawn wave + 10% tip', cost: 180 }
  ];

  function loadSave() {
    const def = {
      bestDay: 0,
      stations: { grill:false, prep:false, fridge:false, marketing:false },
      totalTips: 0
    };
    return Object.assign(def, Storage.getGameData('diner') || {});
  }
  function saveData(d) { Storage.setGameData('diner', d); }

  // =========================================================================
  class DinerGame extends BaseGame {
    init() {
      this.save = loadSave();
      // phase: intro | daySplash | shift | dayEnd | shop | victory | dead
      this.phase = 'intro';
      this.dayIx = 0;
      this.dayTimeRem = 0;
      this.dayTips = 0;
      this.dayCustomersServed = 0;
      this.dayCustomersLost = 0;

      this.plate = [];
      this.customers = [];
      this.spawnTimer = 0;
      this.nextCustomerId = 1;
      this.queueX = 540;

      this.feedback = null;
      this.shopRects = [];

      // Milestone counters for theme-coin payout, and per-game wallet
      // (tips deposited at day-end → spent in kitchen shop).
      this.daysCompletedThisRun = 0;
      this.victoryAchieved = false;

      // Build slot grid up-front; visible slots filtered by day's tier.
      const slotW = 90, slotH = 70;
      const startX = 40, startY = 360;
      this.slots = INGREDIENTS.map((ing, i) => ({
        ing,
        x: startX + (i % 5) * (slotW + 12),
        y: startY + Math.floor(i / 5) * (slotH + 12),
        w: slotW, h: slotH
      }));
      this.trashRect = { x: 580, y: 360, w: 90, h: 70 };
      this.plateRect = { x: 220, y: 180, w: 220, h: 160 };

      this.sfx = this.makeSfx({
        add:    { freq: 540, type: 'triangle', dur: 0.06, slide: 120, vol: 0.3 },
        serve:  { freq: 660, type: 'triangle', dur: 0.18, slide: 330, vol: 0.5 },
        fail:   { freq: 180, type: 'square',   dur: 0.2,  slide: -80, vol: 0.4 },
        trash:  { freq: 240, type: 'sawtooth', dur: 0.1,  slide: -120, vol: 0.3 },
        spawn:  { freq: 440, type: 'triangle', dur: 0.08, vol: 0.25 },
        critic: { freq: 220, type: 'sawtooth', dur: 0.5,  slide: -60, vol: 0.55 },
        win:    { freq: 880, type: 'triangle', dur: 0.4,  slide: 220, vol: 0.55 },
        buy:    { freq: 1100,type: 'square',   dur: 0.1,  vol: 0.4 }
      });
      Sprites.preload(INGREDIENTS.map(i => i.sprite), 120, 60);
      this._refreshHud();
    }

    onEnd() {
      this.save.bestDay = Math.max(this.save.bestDay, this.dayIx);
      this.save.totalTips += this.dayTips;
      saveData(this.save);
    }

    _refreshHud() {
      const day = DAYS[this.dayIx];
      const dayLabel = day ? `Day ${day.n}` : '—';
      this.setHud(
        `<span>${dayLabel}</span>` +
        `<span>Phase <b>${this.phase}</b></span>` +
        `<span>Time <b>${this.dayTimeRem.toFixed(1)}s</b></span>` +
        `<span>Queue <b>${this.customers.length}</b></span>` +
        `<span>Tips <b>$${this.score}</b></span>`
      );
    }

    _availableIngredients(day) {
      // Ingredients whose tier ≤ day index, but always include bun_b/bun_t.
      return INGREDIENTS.filter(i =>
        i.tier <= day.n || i.id === 'bun_b' || i.id === 'bun_t');
    }

    _maxRecipeSize(day) {
      return day.maxSize + (this.save.stations.prep ? 1 : 0);
    }

    // ---------- phase machine ----------
    update(dt) {
      switch (this.phase) {
        case 'intro':     return this._updateIntro();
        case 'daySplash': return this._updateDaySplash();
        case 'shift':     return this._updateShift(dt);
        case 'dayEnd':    return this._updateDayEnd();
        case 'shop':      return this._updateShop();
        case 'victory':   return this._updateVictory();
      }
    }

    _updateIntro() {
      this._refreshHud();
      if (Input.mouse.justPressed) {
        Input.mouse.justPressed = false;
        this.phase = 'daySplash';
      }
    }

    _updateDaySplash() {
      this._refreshHud();
      if (Input.mouse.justPressed) {
        Input.mouse.justPressed = false;
        this._beginShift();
      }
    }

    _beginShift() {
      const day = DAYS[this.dayIx];
      this.phase = 'shift';
      this.dayTimeRem = day.length;
      this.dayTips = 0;
      this.dayCustomersServed = 0;
      this.dayCustomersLost = 0;
      this.customers = [];
      this.plate = [];
      this.spawnTimer = 0;
      this.criticSpawned = false;
      this._spawnCustomer();
      this._spawnCustomer();
    }

    _updateShift(dt) {
      const day = DAYS[this.dayIx];
      this.dayTimeRem -= dt;

      // Spawn cadence
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        const waveSize = 1 + (this.save.stations.marketing ? 1 : 0);
        for (let i = 0; i < waveSize; i++) this._spawnCustomer();
        const tighten = Math.min(1.4, day.n * 0.22);
        this.spawnTimer = Math.max(1.6, day.spawnBase - tighten + Math.random() * 1.2);
      }

      // Critic spawns at 30s remaining on day 5
      if (day.critic && !this.criticSpawned && this.dayTimeRem < day.length - 25) {
        this._spawnCritic();
        this.criticSpawned = true;
      }

      // Patience drain
      const drainMul = this.save.stations.fridge ? 0.75 : 1;
      for (const c of this.customers) {
        c.patience -= dt * drainMul;
        c.bob += dt;
      }
      // Walkouts
      for (let i = this.customers.length - 1; i >= 0; i--) {
        if (this.customers[i].patience <= 0) {
          const c = this.customers[i];
          this.customers.splice(i, 1);
          this.dayCustomersLost++;
          this.addScore(-c.walkoutPenalty);
          this.sfx.play('fail');
          this.shake(8, 0.3);
          this.flash('#f87171', 0.15);
          this._showFeedback('Walked out! -' + c.walkoutPenalty,
                             this._customerPos(i).x, 280, '#f87171');
          if (c.kind === 'critic') {
            // Critic walkout = catastrophic
            this.flash('#000', 0.6);
            this.shake(20, 0.8);
            this.gameOver();
            return;
          }
        }
      }

      // Click handling
      if (Input.mouse.justPressed) {
        Input.mouse.justPressed = false;
        const mx = Input.mouse.x, my = Input.mouse.y;
        if (this._handleSlotClick(mx, my, day)) {/* done */}
        else if (ptInRect(mx, my, this.trashRect)) {
          this.plate = []; this.sfx.play('trash');
        } else {
          for (let i = 0; i < this.customers.length; i++) {
            const c = this.customers[i];
            const p = this._customerPos(i);
            const headR = c.kind === 'critic' ? 50 : 36;
            if (Math.hypot(mx - p.x, my - (p.y - 18)) < headR) {
              this._tryServe(i);
              break;
            }
          }
        }
      }

      this._refreshHud();
      if (this.feedback) {
        this.feedback.age += dt;
        this.feedback.y -= 30 * dt;
        if (this.feedback.age > this.feedback.life) this.feedback = null;
      }

      if (this.dayTimeRem <= 0) {
        this.phase = 'dayEnd';
      }
    }

    _handleSlotClick(mx, my, day) {
      const allowed = this._availableIngredients(day);
      const allowedIds = new Set(allowed.map(i => i.id));
      const cap = this._maxRecipeSize(day);
      for (const s of this.slots) {
        if (!allowedIds.has(s.ing.id)) continue;
        if (ptInRect(mx, my, s)) {
          if (this.plate.length >= cap) {
            this._showFeedback('Too tall!', this.plateRect.x + 100, this.plateRect.y, '#f87171');
            return true;
          }
          this.plate.push(s.ing.id);
          this.sfx.play('add', { freq: 500 + this.plate.length * 40 });
          this.particles.burst(this.plateRect.x + this.plateRect.w/2, this.plateRect.y + 40, 6, {
            color: s.ing.color, speed: 120, life: 0.4, size: 3
          });
          return true;
        }
      }
      return false;
    }

    _spawnCustomer() {
      if (this.customers.length >= 5) return;
      const day = DAYS[this.dayIx];
      const allowed = this._availableIngredients(day);
      const middleAllowed = allowed.filter(i => i.id !== 'bun_b' && i.id !== 'bun_t');
      const minSize = 1, maxSize = Math.max(2, this._maxRecipeSize(day) - 2);
      const middleCount = minSize + Math.floor(Math.random() * (maxSize - minSize + 1));
      const order = ['bun_b'];
      for (let i = 0; i < middleCount; i++) {
        order.push(middleAllowed[Math.floor(Math.random() * middleAllowed.length)].id);
      }
      order.push('bun_t');

      const isVip = Math.random() < (day.vips / 10);
      const patience = (isVip ? 16 : 22) - Math.min(8, day.n * 1.2);
      const skin = ['#ffb15e','#f5d0a0','#ffd0a8','#c89060','#a86a40'][Math.floor(Math.random()*5)];
      const kindRoll = Math.random();
      const kind = isVip ? 'busy' : (kindRoll < 0.2 ? 'kid' : 'normal');
      const sprite = kind === 'busy' ? 'diner.cust_busy'
                   : kind === 'kid'  ? 'diner.cust_kid'
                   : 'diner.cust_normal';

      this.customers.push({
        id: this.nextCustomerId++,
        order,
        patience, maxPatience: patience,
        kind, sprite, skin,
        bob: Math.random() * Math.PI * 2,
        walkoutPenalty: isVip ? 40 : 20,
        tipMul: isVip ? 1.6 : 1.0
      });
      this.sfx.play('spawn');
    }

    _spawnCritic() {
      const day = DAYS[this.dayIx];
      // Critic order: full custom 7-stack featuring everything tier ≤ 4
      const middlePool = INGREDIENTS.filter(i => i.tier <= 4 && i.id !== 'bun_b' && i.id !== 'bun_t');
      const middleCount = 5;
      const order = ['bun_b'];
      for (let i = 0; i < middleCount; i++) {
        order.push(middlePool[Math.floor(Math.random() * middlePool.length)].id);
      }
      order.push('bun_t');
      this.customers.push({
        id: this.nextCustomerId++,
        order,
        patience: 24, maxPatience: 24,
        kind: 'critic', sprite: 'diner.cust_critic', skin:'#e8d8b0',
        bob: 0,
        walkoutPenalty: 200,
        tipMul: 4.0
      });
      this.sfx.play('critic');
      this.flash('#f5d061', 0.3);
      this.shake(8, 0.4);
    }

    _customerPos(i) {
      const c = this.customers[i];
      const yOff = c && c.kind === 'critic' ? -10 : 0;
      return { x: this.queueX + i * 88, y: 250 + yOff };
    }

    _tryServe(ix) {
      const c = this.customers[ix];
      const order = c.order;
      const plate = this.plate;
      const match = plate.length === order.length && order.every((x, i) => x === plate[i]);
      if (match) {
        const patienceFrac = c.patience / c.maxPatience;
        let tip = Math.round(50 + patienceFrac * 150);
        // Station bonuses
        if (this.save.stations.grill && plate.includes('patty')) tip = Math.round(tip * 1.25);
        if (this.save.stations.marketing) tip = Math.round(tip * 1.10);
        tip = Math.round(tip * c.tipMul);

        this.addScore(tip);
        this.dayTips += tip;
        this.dayCustomersServed++;
        this.sfx.play('serve', { freq: 660 + patienceFrac * 200 });
        this.flash(c.kind === 'critic' ? '#f5d061' : '#4ade80', 0.12);
        if (c.kind === 'critic') this.shake(6, 0.4);
        this.particles.burst(this._customerPos(ix).x, this._customerPos(ix).y - 20,
          c.kind === 'critic' ? 60 : 22, { color: '#ffd86b', speed: 240, life: 0.7 });
        this._showFeedback('+$' + tip + (c.kind === 'critic' ? ' CRITIC!' : c.kind === 'busy' ? ' VIP' : ''),
                           this._customerPos(ix).x, 200,
                           c.kind === 'critic' ? '#f5d061' : '#ffd86b');
        this.plate = [];
        this.customers.splice(ix, 1);
      } else {
        this.addScore(-10);
        this.sfx.play('fail');
        this.shake(4, 0.15);
        this._showFeedback('Wrong order!', this._customerPos(ix).x, 220, '#f87171');
      }
    }

    _showFeedback(text, x, y, color) {
      this.feedback = { text, x, y, color, age: 0, life: 1.4 };
    }

    _updateDayEnd() {
      this._refreshHud();
      if (Input.mouse.justPressed) {
        Input.mouse.justPressed = false;
        // Persist day score
        this.save.bestDay = Math.max(this.save.bestDay, this.dayIx + 1);
        this.save.totalTips += this.dayTips;
        saveData(this.save);
        // Bank today's tips into the per-game wallet (spendable at shop).
        Storage.addGameWallet('diner', this.dayTips | 0);
        this.daysCompletedThisRun++;
        // Last day → victory
        if (this.dayIx + 1 >= DAYS.length) {
          this.victoryAchieved = true;
          this.phase = 'victory';
          this.victoryTimer = 0;
          this.sfx.play('win');
          this.particles.burst(W/2, H/2, 90, { color:'#f5d061', speed:340, life:1.0 });
          return;
        }
        this.phase = 'shop';
      }
    }

    _updateShop() {
      this._refreshHud();
      if (!Input.mouse.justPressed) return;
      Input.mouse.justPressed = false;
      const mx = Input.mouse.x, my = Input.mouse.y;
      for (const r of this.shopRects) {
        if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) {
          if (r.kind === 'continue') {
            this.dayIx++;
            this.phase = 'daySplash';
            return;
          }
          if (r.kind === 'station') {
            const st = r.station;
            const owned = this.save.stations[st.id];
            if (owned) return;
            if (!Storage.spendGameWallet('diner', st.cost)) return;
            this.save.stations[st.id] = true;
            saveData(this.save);
            this.sfx.play('buy');
            this.particles.burst(r.x + r.w/2, r.y + r.h/2, 14, { color:'#f5d061', speed:160, life:0.6 });
          }
          return;
        }
      }
    }

    _updateVictory() {
      this.victoryTimer = (this.victoryTimer || 0) + 1/60;
      if (Input.mouse.justPressed) { Input.mouse.justPressed = false; this.win(); }
    }

    // =====================================================================
    // RENDER
    render(ctx) {
      this._renderBackdrop(ctx);
      switch (this.phase) {
        case 'intro':     return this._renderIntro(ctx);
        case 'daySplash': return this._renderDaySplash(ctx);
        case 'shift':     return this._renderShift(ctx);
        case 'dayEnd':    return this._renderDayEnd(ctx);
        case 'shop':      return this._renderShop(ctx);
        case 'victory':   return this._renderVictory(ctx);
      }
    }

    _renderBackdrop(ctx) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#3a1a22'); g.addColorStop(1, '#120608');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#5a3424'; ctx.fillRect(0, 320, W, 30);
      ctx.fillStyle = '#3a2014'; ctx.fillRect(0, 350, W, 6);
    }

    _renderIntro(ctx) {
      const cx = W/2;
      ctx.fillStyle = '#ffb15e'; ctx.font = 'bold 38px ui-monospace, monospace';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.shadowColor='#ffb15e'; ctx.shadowBlur = 14;
      ctx.fillText('DINER RUSH', cx, 130);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff'; ctx.font = '16px ui-monospace, monospace';
      ctx.fillText('5-day campaign · serve customers · buy stations · beat the critic', cx, 180);
      // Small ingredient parade
      const items = ['bun_b','patty','cheese','lettuce','tomato','bun_t'];
      let y = 290;
      items.forEach((id, i) => {
        Sprites.draw(ctx, ING_BY_ID[id].sprite, cx, y - i * 14, 240, 30);
      });
      ctx.fillStyle = '#fff'; ctx.font = 'bold 18px ui-monospace, monospace';
      ctx.fillText('Click to start Day 1', cx, 470);
      // Persistent stats
      ctx.fillStyle = '#7a6090'; ctx.font = '12px ui-monospace, monospace';
      ctx.fillText(`Best day: ${this.save.bestDay}/5  ·  Lifetime tips: $${this.save.totalTips}`, cx, 510);
    }

    _renderDaySplash(ctx) {
      const day = DAYS[this.dayIx];
      const cx = W/2;
      ctx.fillStyle = '#f5d061'; ctx.font = 'bold 32px ui-monospace, monospace';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.shadowColor = '#f5d061'; ctx.shadowBlur = 12;
      ctx.fillText(`DAY ${day.n} · ${day.name}`, cx, 130);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff'; ctx.font = '15px ui-monospace, monospace';
      ctx.fillText(day.intro, cx, 180);
      ctx.fillStyle = '#7a6090';
      ctx.fillText(`Length: ${day.length}s · Recipe size up to ${this._maxRecipeSize(day)}`, cx, 210);
      // Show new ingredients this day
      const newOnes = INGREDIENTS.filter(i => i.tier === day.n);
      if (newOnes.length > 0) {
        ctx.fillStyle = '#4ade80'; ctx.font = 'bold 16px ui-monospace, monospace';
        ctx.fillText('NEW UNLOCK:', cx, 260);
        const startX = cx - (newOnes.length - 1) * 80;
        newOnes.forEach((ing, i) => {
          Sprites.draw(ctx, ing.sprite, startX + i * 160, 320, 140, 36);
          ctx.fillStyle = '#fff'; ctx.font = '12px ui-monospace, monospace';
          ctx.fillText(ing.name, startX + i * 160, 360);
        });
      }
      if (day.critic) {
        ctx.fillStyle = '#f87171'; ctx.font = 'bold 16px ui-monospace, monospace';
        ctx.fillText('⚠ THE FOOD CRITIC ARRIVES MID-SHIFT ⚠', cx, 410);
      }
      ctx.fillStyle = '#fff'; ctx.font = 'bold 18px ui-monospace, monospace';
      ctx.fillText('Click to start the shift', cx, 480);
    }

    _renderShift(ctx) {
      const day = DAYS[this.dayIx];
      const allowedIds = new Set(this._availableIngredients(day).map(i => i.id));

      // Title bar
      ctx.fillStyle = '#ffb15e'; ctx.font = 'bold 22px ui-monospace, monospace';
      ctx.textAlign='left'; ctx.textBaseline='top';
      ctx.fillText(`KITCHEN — DAY ${day.n}`, 40, 16);

      // Time bar
      const tFrac = Math.max(0, this.dayTimeRem / day.length);
      ctx.fillStyle = '#000'; ctx.fillRect(40, 50, 360, 8);
      ctx.fillStyle = tFrac > 0.3 ? '#4ade80' : '#f87171';
      ctx.fillRect(40, 50, 360 * tFrac, 8);

      // Plate
      this._drawPlate(ctx);

      // Ingredient slots
      for (const s of this.slots) {
        const usable = allowedIds.has(s.ing.id);
        ctx.fillStyle = usable ? '#2a1620' : '#1a0e10';
        ctx.fillRect(s.x, s.y, s.w, s.h);
        ctx.strokeStyle = usable ? s.ing.color : '#3a2030'; ctx.lineWidth = 2;
        ctx.strokeRect(s.x + 1, s.y + 1, s.w - 2, s.h - 2);
        ctx.save();
        ctx.globalAlpha = usable ? 1 : 0.25;
        Sprites.draw(ctx, s.ing.sprite, s.x + s.w/2, s.y + s.h/2 - 4, 78, 22);
        ctx.restore();
        ctx.fillStyle = usable ? '#fff' : '#5a3a4a';
        ctx.font = 'bold 11px ui-monospace, monospace';
        ctx.textAlign='center'; ctx.textBaseline='bottom';
        ctx.fillText(s.ing.name, s.x + s.w/2, s.y + s.h - 6);
      }

      // Trash
      const tr = this.trashRect;
      ctx.fillStyle = '#2a1620'; ctx.fillRect(tr.x, tr.y, tr.w, tr.h);
      ctx.strokeStyle = '#f87171'; ctx.lineWidth = 2;
      ctx.strokeRect(tr.x + 1, tr.y + 1, tr.w - 2, tr.h - 2);
      Sprites.draw(ctx, 'diner.trash', tr.x + tr.w/2, tr.y + tr.h/2 - 4, 38, 50);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.textAlign='center'; ctx.textBaseline='bottom';
      ctx.fillText('TRASH', tr.x + tr.w/2, tr.y + tr.h - 6);

      // Customers
      for (let i = 0; i < this.customers.length; i++) {
        this._drawCustomer(ctx, this.customers[i], i);
      }

      // Feedback
      if (this.feedback) {
        const a = 1 - this.feedback.age / this.feedback.life;
        ctx.globalAlpha = a;
        ctx.fillStyle = this.feedback.color;
        ctx.font = 'bold 22px ui-monospace, monospace';
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText(this.feedback.text, this.feedback.x, this.feedback.y);
        ctx.globalAlpha = 1;
      }
    }

    _drawPlate(ctx) {
      const r = this.plateRect;
      const cx = r.x + r.w / 2, cy = r.y + r.h - 22;
      ctx.fillStyle = '#2a1620';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = '#ffb15e'; ctx.lineWidth = 2;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = '#ffb15e'; ctx.font = 'bold 13px ui-monospace, monospace';
      ctx.textAlign='left'; ctx.textBaseline='top';
      ctx.fillText('PLATE  ' + this.plate.length + '/' + this._maxRecipeSize(DAYS[this.dayIx]),
                   r.x + 10, r.y + 8);
      // Plate dish
      ctx.fillStyle = '#eaeef3';
      ctx.beginPath(); ctx.ellipse(cx, cy + 6, 80, 10, 0, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx, cy, 80, 14, 0, 0, Math.PI*2); ctx.fill();
      // Stack
      let stackY = cy - 4;
      for (const id of this.plate) {
        const ing = ING_BY_ID[id];
        const drawH = Math.max(14, ing.height + 8);
        stackY -= ing.height;
        Sprites.draw(ctx, ing.sprite, cx, stackY + ing.height / 2, 130, drawH);
      }
    }

    _drawCustomer(ctx, c, ix) {
      const p = this._customerPos(ix);
      const wob = Math.sin(c.bob * 2) * 2;
      const w = c.kind === 'critic' ? 100 : 80;
      const h = c.kind === 'critic' ? 120 : 100;
      Sprites.draw(ctx, c.sprite, p.x, p.y + wob, w, h);

      // Order bubble
      const ox = p.x, oy = p.y - 60;
      const orderH = c.order.length * 8 + 16;
      ctx.fillStyle = '#fff'; ctx.strokeStyle = c.kind === 'critic' ? '#f5d061' : '#000';
      ctx.lineWidth = c.kind === 'critic' ? 2 : 1;
      roundRect(ctx, ox - 36, oy - orderH, 72, orderH, 6);
      ctx.fill(); ctx.stroke();
      // Stack inside bubble
      let sy = oy - 8;
      for (const id of c.order) {
        const ing = ING_BY_ID[id];
        sy -= ing.height * 0.35;
        Sprites.draw(ctx, ing.sprite, ox, sy + ing.height * 0.18, 60, 12);
      }

      // Patience bar
      const frac = c.patience / c.maxPatience;
      ctx.fillStyle = '#00000080';
      ctx.fillRect(p.x - 24, p.y + 38, 48, 4);
      ctx.fillStyle = frac > 0.5 ? '#4ade80' : frac > 0.25 ? '#ffd86b' : '#f87171';
      ctx.fillRect(p.x - 24, p.y + 38, 48 * Math.max(0, frac), 4);

      if (c.kind === 'busy') {
        ctx.fillStyle = '#f5d061'; ctx.font = 'bold 9px ui-monospace, monospace';
        ctx.textAlign='center'; ctx.textBaseline='top';
        ctx.fillText('VIP', p.x, p.y + 44);
      } else if (c.kind === 'critic') {
        ctx.fillStyle = '#f5d061'; ctx.font = 'bold 11px ui-monospace, monospace';
        ctx.textAlign='center'; ctx.textBaseline='top';
        ctx.shadowColor = '#f5d061'; ctx.shadowBlur = 8;
        ctx.fillText('★ CRITIC ★', p.x, p.y + 46);
        ctx.shadowBlur = 0;
      }
    }

    _renderDayEnd(ctx) {
      const day = DAYS[this.dayIx];
      const cx = W/2;
      ctx.fillStyle = '#f5d061'; ctx.font = 'bold 36px ui-monospace, monospace';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.shadowColor = '#f5d061'; ctx.shadowBlur = 12;
      ctx.fillText(`DAY ${day.n} CLOSED`, cx, 140);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff'; ctx.font = '18px ui-monospace, monospace';
      ctx.fillText(`Tips earned: $${this.dayTips}`,            cx, 210);
      ctx.fillText(`Customers served: ${this.dayCustomersServed}`, cx, 240);
      ctx.fillStyle = this.dayCustomersLost > 0 ? '#f87171' : '#7a6090';
      ctx.fillText(`Walkouts: ${this.dayCustomersLost}`,       cx, 270);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 18px ui-monospace, monospace';
      ctx.fillText('Click to visit the kitchen shop', cx, 360);
    }

    _renderShop(ctx) {
      const cx = W/2;
      ctx.fillStyle = '#f5d061'; ctx.font = 'bold 30px ui-monospace, monospace';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.shadowColor = '#f5d061'; ctx.shadowBlur = 12;
      ctx.fillText('KITCHEN SHOP', cx, 80);
      ctx.shadowBlur = 0;

      const coins = Storage.getGameWallet('diner');
      ctx.fillStyle = '#ffd86b'; ctx.font = '16px ui-monospace, monospace';
      ctx.fillText('● $' + coins + ' tips banked', cx, 116);

      this.shopRects = [];
      const cardW = 200, cardH = 220, gap = 18;
      const totalW = cardW * STATIONS.length + gap * (STATIONS.length - 1);
      const startX = cx - totalW / 2;
      const y = 160;
      STATIONS.forEach((st, i) => {
        const x = startX + i * (cardW + gap);
        const owned = !!this.save.stations[st.id];
        const broke = !owned && coins < st.cost;
        const rect = { x, y, w: cardW, h: cardH, kind:'station', station: st };
        this.shopRects.push(rect);

        ctx.fillStyle = owned ? '#1a2a14' : '#1a0d20';
        ctx.fillRect(x, y, cardW, cardH);
        ctx.strokeStyle = owned ? '#4ade80' : (broke ? '#5a3424' : '#f5d061');
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, cardW, cardH);

        ctx.fillStyle = owned ? '#4ade80' : '#f5d061';
        ctx.font = 'bold 16px ui-monospace, monospace';
        ctx.textAlign='center'; ctx.textBaseline='top';
        ctx.fillText(st.name, x + cardW/2, y + 14);

        // Show a kitchen sprite
        const spriteKey = i % 2 === 0 ? 'diner.station_grill' : 'diner.station_prep';
        Sprites.draw(ctx, spriteKey, x + cardW/2, y + 90, 120, 90);

        ctx.fillStyle = '#fff'; ctx.font = '12px ui-monospace, monospace';
        wrapText(ctx, st.desc, x + cardW/2, y + 150, cardW - 16, 14);

        ctx.fillStyle = owned ? '#7a6090' : (broke ? '#f87171' : '#ffd86b');
        ctx.font = 'bold 14px ui-monospace, monospace';
        ctx.fillText(owned ? 'INSTALLED' : ('● ' + st.cost), x + cardW/2, y + cardH - 28);
      });

      // Continue
      const cw = 280, ch = 50;
      const cxR = cx - cw/2, cyR = 460;
      const r = { x: cxR, y: cyR, w: cw, h: ch, kind: 'continue' };
      this.shopRects.push(r);
      ctx.fillStyle = '#1a4a2a'; ctx.fillRect(cxR, cyR, cw, ch);
      ctx.strokeStyle = '#4ade80'; ctx.lineWidth = 2;
      ctx.strokeRect(cxR, cyR, cw, ch);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 18px ui-monospace, monospace';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('OPEN TOMORROW', cx, cyR + ch/2);
    }

    _renderVictory(ctx) {
      const cx = W/2;
      ctx.fillStyle = '#f5d061'; ctx.font = 'bold 44px ui-monospace, monospace';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.shadowColor = '#f5d061'; ctx.shadowBlur = 16;
      ctx.fillText('THE CRITIC IS PLEASED', cx, 160);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff'; ctx.font = '18px ui-monospace, monospace';
      ctx.fillText('You survived 5 days and the legendary food critic.', cx, 220);
      ctx.fillText('Final tips: $' + this.score, cx, 250);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 18px ui-monospace, monospace';
      ctx.fillText('Click to finish run', cx, 380);
    }

    coinsEarned(/* score */) {
      // Theme-shop coins from days completed, not from raw tip score.
      const days = this.daysCompletedThisRun | 0;
      const winBonus = this.victoryAchieved ? 25 : 0;
      return days * 5 + winBonus;
    }
  }

  function ptInRect(x, y, r) { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
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

  NDP.attachGame('diner', DinerGame);
})();
