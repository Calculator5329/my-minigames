/* Sigil — Grimoire of the Three Seals.
   ----------------------------------------------------------------------------
   A spell-tracing game built around three boss duels (Warlock, Lich, Dragon).
   Each chapter is "trial → trial → boss". A trial is a flurry of timed runes;
   a boss duel reframes those same runes as elemental attacks against an HP bar.

   Player resources during a duel:
     - HP                — three pips, refilled between chapters
     - Mana              — regenerates passively, spent to cast (perfect parries
                           refund mana so combos remain spammy if you're hot)
     - Combo             — consecutive successful casts. Damage scales x1..x3.

   Spellbook unlock order (driven by chapter):
     ch1: deltar, zuul, skorn
     ch2: + quadrix, pentagrim
     ch3: + vortek, infenor, aether, nyx

   Each glyph has an element (fire/ice/arc/void/holy) and a base damage. Boss
   weakness lines up with one element so the player has a reason to learn the
   harder glyphs by chapter 3.

   Persistent meta (Storage):
     bestChapter            — furthest cleared
     unlockedGlyphs[]       — survives runs (so re-runs feel like progress)
     perks { mana, regen, focus, sage }
     coinsSpent             — for the sage perk gating
*/
(function () {
  const NDP = window.NDP;
  const { BaseGame, Input, Audio, Sprites } = NDP.Engine;
  const Storage = NDP.Engine.Storage;

  const W = 960, H = 600;
  const CX = W / 2, CY = H / 2;

  // ---------- Glyph library (vector polylines + element + sprite key) ----------
  const SAMPLES = 48;
  const GLYPHS = [
    {
      id: 'deltar',  name: 'DELTAR',  element: 'fire',  dmg: 2, sprite: 'sigil.deltar',
      points: densify([[0,-1],[0.87,0.5],[-0.87,0.5],[0,-1]], 64)
    },
    {
      id: 'zuul',    name: 'ZUUL',    element: 'arc',   dmg: 2, sprite: 'sigil.zuul',
      points: densify([[-1,-0.7],[1,-0.7],[-1,0.7],[1,0.7]], 96)
    },
    {
      id: 'skorn',   name: 'SKORN',   element: 'void',  dmg: 2, sprite: 'sigil.skorn',
      points: densify([[-0.6,-1],[0.25,-0.25],[-0.25,0.25],[0.6,1]], 96)
    },
    {
      id: 'quadrix', name: 'QUADRIX', element: 'ice',   dmg: 3, sprite: 'sigil.quadrix',
      points: densify([[-0.9,-0.9],[0.9,-0.9],[0.9,0.9],[-0.9,0.9],[-0.9,-0.9]], 128)
    },
    {
      id: 'pentagrim', name: 'PENTAGRIM', element: 'holy', dmg: 3, sprite: 'sigil.pentagrim',
      points: (() => {
        const pts = [];
        for (let i = 0; i < 5; i++) {
          const a = -Math.PI/2 + i * (Math.PI * 4 / 5);
          pts.push([Math.cos(a), Math.sin(a)]);
        }
        pts.push(pts[0]);
        return densify(pts, 160);
      })()
    },
    {
      id: 'vortek',  name: 'VORTEK',  element: 'arc',   dmg: 4, sprite: 'sigil.vortek',
      points: (() => {
        const pts = [];
        for (let i = 0; i < 220; i++) {
          const t = i / 220;
          const a = t * Math.PI * 4;
          pts.push([Math.cos(a) * t * 0.95, Math.sin(a) * t * 0.95]);
        }
        return pts;
      })()
    },
    {
      id: 'infenor', name: 'INFENOR', element: 'fire',  dmg: 4, sprite: 'sigil.infenor',
      points: (() => {
        const pts = [];
        for (let i = 0; i < 220; i++) {
          const t = (i / 220) * Math.PI * 2;
          const denom = 1 + Math.sin(t) * Math.sin(t);
          pts.push([Math.cos(t) / denom, Math.cos(t) * Math.sin(t) / denom]);
        }
        return pts;
      })()
    },
    {
      id: 'aether',  name: 'AETHER',  element: 'holy',  dmg: 5, sprite: 'sigil.aether',
      points: (() => {
        const pts = [];
        for (let i = 0; i < 200; i++) {
          const t = i / 200;
          const a = t * Math.PI * 2;
          pts.push([Math.cos(a) * (0.7 + Math.sin(a*3) * 0.2),
                    Math.sin(a) * (0.7 + Math.sin(a*3) * 0.2)]);
        }
        return pts;
      })()
    },
    {
      id: 'nyx',     name: 'NYX',     element: 'void',  dmg: 5, sprite: 'sigil.nyx',
      points: (() => {
        const pts = [];
        for (let i = 0; i <= 80; i++) {
          const t = i / 80;
          const a = -Math.PI/2 + t * Math.PI * 1.5;
          pts.push([Math.cos(a), Math.sin(a)]);
        }
        return pts;
      })()
    }
  ];
  GLYPHS.forEach(g => { g.resampled = resample(g.points, SAMPLES); });
  const GLYPH_BY_ID = Object.fromEntries(GLYPHS.map(g => [g.id, g]));

  const ELEMENT_COLOR = {
    fire: '#ff8c3a', ice: '#7ae0ff', arc: '#d6a8ff',
    void: '#9b59ff', holy: '#f5d061'
  };

  // ---------- Chapter / boss script ----------
  const CHAPTERS = [
    {
      n: 1, title: 'CHAPTER I — INITIATE',
      glyphs: ['deltar', 'zuul', 'skorn'],
      trials: 6,
      boss: { id:'warlock', name:'THE WARLOCK', sprite:'sigil.boss_warlock',
              maxHp: 30, weakness:'void', telegraph: 2.6, attackDmg: 1 }
    },
    {
      n: 2, title: 'CHAPTER II — ADEPT',
      glyphs: ['deltar','zuul','skorn','quadrix','pentagrim'],
      trials: 7,
      boss: { id:'lich', name:'THE LICH', sprite:'sigil.boss_lich',
              maxHp: 50, weakness:'fire', telegraph: 2.2, attackDmg: 1 }
    },
    {
      n: 3, title: 'CHAPTER III — ARCHMAGE',
      glyphs: ['deltar','zuul','skorn','quadrix','pentagrim','vortek','infenor','aether','nyx'],
      trials: 9,
      boss: { id:'dragon', name:'THE DRAGON', sprite:'sigil.boss_dragon',
              maxHp: 80, weakness:'ice', telegraph: 1.9, attackDmg: 2 }
    }
  ];

  const PERKS = [
    { id:'mana',   name:'DEEP WELL',     desc:'Max mana 5 → 7',         cost: 80,  max: 1 },
    { id:'regen',  name:'LEY LINE',      desc:'Mana regen +50%',         cost: 120, max: 1 },
    { id:'focus',  name:'FOCUSED EYE',   desc:'Trial timers +0.5s',      cost: 60,  max: 1 },
    { id:'sage',   name:'ELDER SAGE',    desc:'Combo cap x3 → x5',       cost: 200, max: 1 }
  ];

  // ---------- Storage helpers ----------
  function loadSave() {
    const def = {
      bestChapter: 0,
      unlockedGlyphs: ['deltar','zuul','skorn'],
      perks: { mana:0, regen:0, focus:0, sage:0 }
    };
    return Object.assign(def, Storage.getGameData('sigil') || {});
  }
  function saveData(d) { Storage.setGameData('sigil', d); }

  // ===========================================================================
  class SigilGame extends BaseGame {
    init() {
      this.save = loadSave();

      // Phase machine inside the BaseGame's "playing" state.
      //   intro    → chapter splash (click to start)
      //   trial    → flurry of runes for HP / score
      //   between  → 1.2s breath between trials
      //   boss     → boss duel
      //   victory  → chapter cleared splash
      //   shop     → between-chapter perk shop
      //   dead     → final game over (handled by BaseGame.gameOver)
      this.phase = 'intro';
      this.chapterIx = 0;

      this.maxHp = 3;
      this.hp = this.maxHp;
      this.maxMana = 5 + (this.save.perks.mana ? 2 : 0);
      this.mana = this.maxMana;
      this.manaRegen = 1.0 * (this.save.perks.regen ? 1.5 : 1);

      this.combo = 0;
      this.comboCap = this.save.perks.sage ? 5 : 3;
      this.bestStreak = 0;

      this.trialIx = 0;
      this.timeRem = 0;
      this.timeLimit = 4.0 + (this.save.perks.focus ? 0.5 : 0);
      this.currentGlyph = null;
      this.drawing = false;
      this.stroke = [];
      this.lastResult = null;
      this.resultTimer = 0;
      this.betweenTimer = 0;

      this.boss = null;
      this.bossAttackTimer = 0;
      this.bossFloaters = [];   // damage numbers
      this.shopRects = [];

      this.sfx = this.makeSfx({
        start:  { freq: 240, type: 'triangle', dur: 0.12, slide: 120, vol: 0.3 },
        good:   { freq: 520, type: 'triangle', dur: 0.2, slide: 400, vol: 0.45 },
        great:  { freq: 800, type: 'triangle', dur: 0.25, slide: 600, vol: 0.5 },
        bad:    { freq: 160, type: 'sawtooth', dur: 0.3, slide: -100, vol: 0.45 },
        cast:   { freq: 660, type: 'square', dur: 0.08, slide: 220, vol: 0.35 },
        bossHit:{ freq: 320, type: 'sawtooth', dur: 0.25, slide: -160, vol: 0.5 },
        bossAtk:{ freq: 110, type: 'sawtooth', dur: 0.4, slide: -40, vol: 0.55 },
        win:    { freq: 880, type: 'triangle', dur: 0.5, slide: 220, vol: 0.55 },
        buy:    { freq: 1100, type: 'square', dur: 0.1, vol: 0.4 }
      });
      Audio.startAmbient({ freq: 65, type: 'sine', vol: 0.05 });

      this._refreshHud();
      // Pre-rasterise the splash sprites so the first transition isn't blank.
      Sprites.preload(['sigil.boss_warlock','sigil.boss_lich','sigil.boss_dragon'], 240, 240);
    }

    onEnd() { Audio.stopAmbient(); this._persistMeta(); }

    _persistMeta() {
      this.save.bestChapter = Math.max(this.save.bestChapter, this.chapterIx);
      saveData(this.save);
    }

    // -------------- per-frame --------------
    update(dt) {
      // Mana regen runs everywhere except dead/intro/shop
      if (this.phase === 'trial' || this.phase === 'boss' || this.phase === 'between') {
        this.mana = Math.min(this.maxMana, this.mana + this.manaRegen * dt);
      }

      if (this.phase === 'intro')   return this._updateIntro(dt);
      if (this.phase === 'trial')   return this._updateTrial(dt);
      if (this.phase === 'between') return this._updateBetween(dt);
      if (this.phase === 'boss')    return this._updateBoss(dt);
      if (this.phase === 'victory') return this._updateVictory(dt);
      if (this.phase === 'shop')    return this._updateShop(dt);
    }

    _refreshHud() {
      const ch = CHAPTERS[this.chapterIx];
      const chName = ch ? `Ch ${ch.n}` : '—';
      const phaseLabel = {
        intro:'Begin', trial:'Trial', between:'…', boss:'Duel',
        victory:'Cleared', shop:'Sanctum', dead:'Defeated'
      }[this.phase] || this.phase;
      this.setHud(
        `<span>${chName} · <b>${phaseLabel}</b></span>` +
        `<span>HP <b>${'\u2764'.repeat(this.hp)}</b></span>` +
        `<span>Mana <b>${this.mana.toFixed(1)}/${this.maxMana}</b></span>` +
        `<span>Combo <b>x${this.combo}</b></span>` +
        `<span>Score <b>${this.score}</b></span>`
      );
    }

    // -------------- intro splash --------------
    _updateIntro() {
      this._refreshHud();
      if (Input.mouse.justPressed) {
        Input.mouse.justPressed = false;
        this._beginChapter();
      }
    }

    _beginChapter() {
      const ch = CHAPTERS[this.chapterIx];
      if (!ch) { this.win(); return; }
      this.trialIx = 0;
      this.phase = 'trial';
      this._nextTrial();
      this.sfx.play('start');
    }

    _nextTrial() {
      const ch = CHAPTERS[this.chapterIx];
      // Glyph pool grows with chapter and survives across runs via meta.
      const pool = ch.glyphs.filter(id => this.save.unlockedGlyphs.includes(id) || ch.glyphs.includes(id));
      const id = pool[Math.floor(Math.random() * pool.length)];
      this.currentGlyph = GLYPH_BY_ID[id];
      // Difficulty: time gets tighter with each trial inside the chapter.
      const difficultyShrink = Math.min(1.5, this.trialIx * 0.12 + this.chapterIx * 0.18);
      this.timeRem = Math.max(2.0, this.timeLimit - difficultyShrink);
      this.stroke = [];
      this.drawing = false;
      this.lastResult = null;
      this.resultTimer = 0;
    }

    // -------------- trial flurry --------------
    _updateTrial(dt) {
      if (this.resultTimer > 0) {
        this.resultTimer -= dt;
        if (this.resultTimer <= 0) this._afterTrialCast();
        this._refreshHud();
        return;
      }
      this.timeRem -= dt;
      if (this.timeRem <= 0 && !this.drawing) { this._failCast('TIMEOUT'); this._refreshHud(); return; }
      this._handleStroke();
      this._refreshHud();
    }

    _afterTrialCast() {
      this.trialIx++;
      const ch = CHAPTERS[this.chapterIx];
      if (this.trialIx >= ch.trials) { this._enterBoss(); }
      else { this.phase = 'between'; this.betweenTimer = 0.7; }
    }

    _updateBetween(dt) {
      this.betweenTimer -= dt;
      if (this.betweenTimer <= 0) {
        this.phase = 'trial';
        this._nextTrial();
        this.sfx.play('start');
      }
      this._refreshHud();
    }

    // -------------- boss duel --------------
    _enterBoss() {
      const ch = CHAPTERS[this.chapterIx];
      this.boss = Object.assign({}, ch.boss, { hp: ch.boss.maxHp, telegraphRem: ch.boss.telegraph,
                                                charging: false, hitFlash: 0 });
      this.phase = 'boss';
      this.bossFloaters = [];
      // First glyph for the duel
      this._pickBossGlyph();
      this.sfx.play('start');
    }

    _pickBossGlyph() {
      const ch = CHAPTERS[this.chapterIx];
      // Pool = chapter glyphs that the player has unlocked
      const pool = ch.glyphs.filter(id => this.save.unlockedGlyphs.includes(id));
      const usable = pool.length ? pool : ch.glyphs;
      this.currentGlyph = GLYPH_BY_ID[usable[Math.floor(Math.random() * usable.length)]];
      this.timeRem = Math.max(2.5, this.timeLimit - this.chapterIx * 0.3);
      this.stroke = [];
      this.drawing = false;
      this.lastResult = null;
      this.resultTimer = 0;
    }

    _updateBoss(dt) {
      const b = this.boss;
      if (b.hitFlash > 0) b.hitFlash = Math.max(0, b.hitFlash - dt);
      // Floating damage numbers
      for (let i = this.bossFloaters.length - 1; i >= 0; i--) {
        const f = this.bossFloaters[i];
        f.age += dt; f.y -= 30 * dt;
        if (f.age > f.life) this.bossFloaters.splice(i, 1);
      }
      // Boss attack timer always advances even when the player is mid-cast.
      b.telegraphRem -= dt;
      if (b.telegraphRem <= 0) {
        this._bossAttacks();
        b.telegraphRem = b.telegraph;
      }
      // Cast handling
      if (this.resultTimer > 0) {
        this.resultTimer -= dt;
        if (this.resultTimer <= 0) {
          if (this.boss.hp <= 0) this._defeatBoss();
          else this._pickBossGlyph();
        }
        this._refreshHud();
        return;
      }
      this.timeRem -= dt;
      if (this.timeRem <= 0 && !this.drawing) { this._failCast('TIMEOUT'); this._refreshHud(); return; }
      this._handleStroke();
      this._refreshHud();
    }

    _bossAttacks() {
      this.hp = Math.max(0, this.hp - this.boss.attackDmg);
      this.combo = 0;
      this.flash('#f87171', 0.18);
      this.shake(10, 0.4);
      this.sfx.play('bossAtk');
      this.particles.burst(CX, CY + 20, 28, { color:'#f87171', speed:280, life:0.7 });
      if (this.hp <= 0) {
        this.gameOver();
      }
    }

    _defeatBoss() {
      // Award score, advance chapter, unlock next glyphs, then victory splash.
      const ch = CHAPTERS[this.chapterIx];
      this.addScore(500 + ch.n * 250);
      ch.glyphs.forEach(id => {
        if (!this.save.unlockedGlyphs.includes(id)) this.save.unlockedGlyphs.push(id);
      });
      this.save.bestChapter = Math.max(this.save.bestChapter, ch.n);
      saveData(this.save);
      this.phase = 'victory';
      this.victoryTimer = 0;
      this.particles.burst(CX, CY, 80, { color:'#f5d061', speed:340, life:1.0 });
      this.flash('#f5d061', 0.3);
      this.sfx.play('win');
    }

    _updateVictory(dt) {
      this.victoryTimer = (this.victoryTimer || 0) + dt;
      if (Input.mouse.justPressed) {
        Input.mouse.justPressed = false;
        this.chapterIx++;
        if (this.chapterIx >= CHAPTERS.length) { this.win(); return; }
        // Refill HP between chapters and visit the sanctum shop.
        this.hp = this.maxHp;
        this.mana = this.maxMana;
        this.phase = 'shop';
      }
    }

    // -------------- shop between chapters --------------
    _updateShop(dt) {
      this._refreshHud();
      if (!Input.mouse.justPressed) return;
      Input.mouse.justPressed = false;
      const mx = Input.mouse.x, my = Input.mouse.y;

      for (const r of this.shopRects) {
        if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) {
          if (r.kind === 'continue') { this.phase = 'intro'; return; }
          if (r.kind === 'perk') {
            const p = r.perk;
            const owned = this.save.perks[p.id] || 0;
            if (owned >= p.max) return;
            const coins = NDP.Engine.Storage.coins || 0;
            if (coins < p.cost) return;
            // Spend
            NDP.Engine.Storage.coins = coins - p.cost;
            NDP.Engine.Storage.save();
            this.save.perks[p.id] = owned + 1;
            saveData(this.save);
            this._applyPerks();
            this.sfx.play('buy');
            this.particles.burst(r.x + r.w/2, r.y + r.h/2, 14, { color:'#f5d061', speed:160, life:0.6 });
          }
          return;
        }
      }
    }

    _applyPerks() {
      this.maxMana = 5 + (this.save.perks.mana ? 2 : 0);
      this.mana = this.maxMana;
      this.manaRegen = 1.0 * (this.save.perks.regen ? 1.5 : 1);
      this.timeLimit = 4.0 + (this.save.perks.focus ? 0.5 : 0);
      this.comboCap = this.save.perks.sage ? 5 : 3;
    }

    // -------------- input → stroke --------------
    _handleStroke() {
      const m = Input.mouse;
      if (m.justPressed) {
        if (this.mana < 1) {
          // not enough mana — flicker the bar; eat the press.
          this.flash('#7ae0ff', 0.08);
          Input.mouse.justPressed = false;
          return;
        }
        this.drawing = true;
        this.stroke = [{ x: m.x, y: m.y }];
      }
      if (this.drawing) {
        const last = this.stroke[this.stroke.length - 1];
        if (!last || Math.hypot(m.x - last.x, m.y - last.y) > 3) {
          this.stroke.push({ x: m.x, y: m.y });
        }
        if (!m.down) this._finishStroke();
      }
    }

    _finishStroke() {
      this.drawing = false;
      if (this.stroke.length < 8) { this._failCast('SMUDGED'); return; }
      const pts = this.stroke.map(p => [p.x, p.y]);
      const norm = normalizeStroke(pts);
      const samp = resample(norm, SAMPLES);
      const target = this.currentGlyph.resampled;
      const err = Math.min(avgPathDist(samp, target),
                           avgPathDist(samp, [...target].reverse()));
      const acc = Math.max(0, 1 - err / 0.55);

      let grade, mult;
      if (acc > 0.85) { grade = 'PERFECT'; mult = 1.5; }
      else if (acc > 0.65) { grade = 'GOOD';    mult = 1.0; }
      else if (acc > 0.45) { grade = 'OKAY';    mult = 0.6; }
      else                 { grade = 'FAIL';    mult = 0;   }

      if (mult <= 0) { this._failCast(grade); return; }

      // Spend mana — perfect refunds half.
      this.mana = Math.max(0, this.mana - 1);
      if (grade === 'PERFECT') this.mana = Math.min(this.maxMana, this.mana + 0.5);

      this.combo = Math.min(this.comboCap, this.combo + 1);
      this.bestStreak = Math.max(this.bestStreak, this.combo);

      const baseDmg = this.currentGlyph.dmg;
      const weakness = this.boss && this.boss.weakness === this.currentGlyph.element ? 1.5 : 1;
      const comboBonus = 1 + (this.combo - 1) * 0.25;
      const dmg = Math.round(baseDmg * mult * weakness * comboBonus);

      const pts2 = Math.round(120 * mult * (1 + (this.combo - 1) * 0.1));
      this.addScore(pts2);

      this.lastResult = { grade, acc, dmg, pts: pts2, weakness: weakness > 1, color: ELEMENT_COLOR[this.currentGlyph.element] };
      this.resultTimer = 0.9;
      this.sfx.play(grade === 'PERFECT' ? 'great' : 'cast');
      this.particles.burst(CX, CY, 22, { color: ELEMENT_COLOR[this.currentGlyph.element], speed: 220, life: 0.7 });
      this.flash(ELEMENT_COLOR[this.currentGlyph.element], 0.08);
      this.shake(3, 0.18);

      if (this.boss) {
        this.boss.hp = Math.max(0, this.boss.hp - dmg);
        this.boss.hitFlash = 0.25;
        this.bossFloaters.push({
          x: CX + (Math.random()-0.5) * 100, y: 200,
          text: '-' + dmg + (weakness > 1 ? '!' : ''), color: ELEMENT_COLOR[this.currentGlyph.element],
          age: 0, life: 1.0
        });
        this.sfx.play('bossHit');
      }
    }

    _failCast(reason) {
      this.hp = Math.max(0, this.hp - 1);
      this.combo = 0;
      this.lastResult = { grade: reason || 'FAIL', acc: 0, dmg: 0, pts: 0, color: '#f87171' };
      this.resultTimer = 0.9;
      this.flash('#f87171', 0.15);
      this.shake(8, 0.35);
      this.sfx.play('bad');
      if (this.hp <= 0) this.gameOver();
    }

    // ===========================================================================
    // RENDER
    render(ctx) {
      this._drawBackdrop(ctx);
      if (this.phase === 'intro')   return this._renderIntro(ctx);
      if (this.phase === 'trial' || this.phase === 'between') return this._renderTrial(ctx);
      if (this.phase === 'boss')    return this._renderBoss(ctx);
      if (this.phase === 'victory') return this._renderVictory(ctx);
      if (this.phase === 'shop')    return this._renderShop(ctx);
    }

    _drawBackdrop(ctx) {
      const g = ctx.createRadialGradient(CX, CY, 60, CX, CY, 620);
      g.addColorStop(0, '#1a0f26'); g.addColorStop(1, '#05020a');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // Frame
      ctx.strokeStyle = '#4a2b7a'; ctx.lineWidth = 3;
      ctx.strokeRect(30, 30, W - 60, H - 60);
      ctx.strokeStyle = '#2e1a4e';
      ctx.strokeRect(42, 42, W - 84, H - 84);
    }

    _renderIntro(ctx) {
      const ch = CHAPTERS[this.chapterIx];
      ctx.fillStyle = '#f5d061'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.shadowColor = '#f5d061'; ctx.shadowBlur = 14;
      ctx.font = 'bold 36px ui-monospace, monospace';
      ctx.fillText(ch.title, CX, 130);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#d6a8ff'; ctx.font = '15px ui-monospace, monospace';
      ctx.fillText(`${ch.trials} trials, then duel: ${ch.boss.name}`, CX, 168);
      ctx.fillText(`Boss weakness: ${ch.boss.weakness.toUpperCase()}`, CX, 188);

      // Show the glyphs available this chapter
      const startX = CX - (ch.glyphs.length - 1) * 54;
      ch.glyphs.forEach((id, i) => {
        const g = GLYPH_BY_ID[id];
        const x = startX + i * 108, y = 290;
        Sprites.draw(ctx, g.sprite, x, y, 92, 92, { fallback: () => {
          ctx.strokeStyle = ELEMENT_COLOR[g.element]; ctx.lineWidth = 2;
          ctx.strokeRect(x-40, y-40, 80, 80);
        }});
        ctx.fillStyle = '#fff'; ctx.font = '11px ui-monospace, monospace';
        ctx.textAlign='center'; ctx.textBaseline='top';
        ctx.fillText(g.name, x, y + 50);
        ctx.fillStyle = ELEMENT_COLOR[g.element];
        ctx.fillText(g.element.toUpperCase(), x, y + 64);
      });

      ctx.fillStyle = '#fff'; ctx.font = 'bold 18px ui-monospace, monospace';
      ctx.fillText('Click to begin', CX, 480);
      ctx.fillStyle = '#7a6090'; ctx.font = '12px ui-monospace, monospace';
      ctx.fillText('Hold left mouse · trace the rune · release to cast', CX, 508);
      ctx.fillText('Mana drains per cast · perfect casts refund · combo scales damage', CX, 528);
    }

    _renderTrial(ctx) {
      this._renderGlyphArena(ctx, 220, false);
      this._renderTrialHud(ctx);
      this._renderResult(ctx);
    }

    _renderTrialHud(ctx) {
      // Trial progress dots + mana ring + glyph name
      const ch = CHAPTERS[this.chapterIx];
      ctx.fillStyle = '#f5d061'; ctx.font = 'bold 18px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(this.currentGlyph.name + '  · ' + this.currentGlyph.element.toUpperCase(),
                   CX, 60);
      // Trial pip dots
      const total = ch.trials;
      const dotW = Math.min(20, 240 / total);
      const startX = CX - (total - 1) * (dotW / 2);
      for (let i = 0; i < total; i++) {
        const filled = i < this.trialIx;
        const cur = i === this.trialIx;
        const x = startX + i * dotW;
        ctx.fillStyle = filled ? '#4ade80' : (cur ? '#f5d061' : '#3a2350');
        ctx.beginPath(); ctx.arc(x, 92, 5, 0, Math.PI*2); ctx.fill();
      }
      this._renderManaBar(ctx, 60, 78, 200, 8);
    }

    _renderManaBar(ctx, x, y, w, h) {
      ctx.fillStyle = '#1a0d2e';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#7ae0ff';
      ctx.fillRect(x, y, w * (this.mana / this.maxMana), h);
      ctx.strokeStyle = '#7ae0ff'; ctx.lineWidth = 1;
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = '#fff'; ctx.font = '11px ui-monospace, monospace';
      ctx.textAlign='left'; ctx.textBaseline='bottom';
      ctx.fillText('MANA ' + this.mana.toFixed(1) + '/' + this.maxMana, x, y - 2);
    }

    _renderGlyphArena(ctx, ringR, withTimerRing) {
      const S = 200;
      // Faded target glyph behind the arena
      ctx.save();
      ctx.translate(CX, CY);
      const isFail = this.resultTimer > 0 && this.lastResult && !this.lastResult.dmg && !this.lastResult.pts;
      ctx.shadowColor = ELEMENT_COLOR[this.currentGlyph.element];
      ctx.shadowBlur = 18;
      ctx.strokeStyle = isFail ? '#f87171' : ELEMENT_COLOR[this.currentGlyph.element] + '99';
      ctx.lineWidth = 3;
      ctx.beginPath();
      this.currentGlyph.points.forEach((p, i) => {
        const x = p[0] * S, y = p[1] * S;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.restore();

      // Player stroke
      if (this.stroke.length > 1) {
        ctx.save();
        ctx.shadowColor = '#f59e0b'; ctx.shadowBlur = 14;
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 4; ctx.lineCap='round'; ctx.lineJoin='round';
        ctx.beginPath();
        this.stroke.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
        ctx.stroke();
        ctx.restore();
      }

      // Timer ring
      ctx.save();
      const timerColor = this.timeRem < 1.5 ? '#f87171' : '#f59e0b';
      ctx.strokeStyle = timerColor; ctx.lineWidth = 5;
      ctx.shadowColor = timerColor; ctx.shadowBlur = 10;
      ctx.beginPath();
      const limitForRing = this.boss ? Math.max(2.5, this.timeLimit - this.chapterIx * 0.3)
                                     : Math.max(2.0, this.timeLimit - (this.trialIx * 0.12 + this.chapterIx * 0.18));
      ctx.arc(CX, CY, ringR, -Math.PI/2, -Math.PI/2 + (this.timeRem / limitForRing) * Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    _renderResult(ctx) {
      if (!this.lastResult || this.resultTimer <= 0) return;
      const r = this.lastResult;
      const t = this.resultTimer;
      const alpha = Math.min(1, t * 2);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = r.color || (r.dmg > 0 ? '#4ade80' : '#f87171');
      ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 20;
      ctx.font = 'bold 56px ui-monospace, monospace';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(r.grade, CX, CY + 220);
      ctx.shadowBlur = 0;
      if (r.pts > 0) {
        ctx.fillStyle = '#fff'; ctx.font = 'bold 16px ui-monospace, monospace';
        let line = `+${r.pts} pts`;
        if (r.dmg) line += `   ${r.dmg} dmg`;
        if (r.weakness) line += `   WEAKNESS!`;
        ctx.fillText(line, CX, CY + 256);
      }
      ctx.globalAlpha = 1;
    }

    _renderBoss(ctx) {
      const b = this.boss;
      // Boss portrait — large, top center.
      const flashTint = b.hitFlash > 0 ? Math.min(1, b.hitFlash * 4) : 0;
      ctx.save();
      Sprites.draw(ctx, b.sprite, CX, 170, 220, 220, {
        alpha: 0.95,
        fallback: () => {
          ctx.fillStyle = '#3a1f5a';
          ctx.fillRect(CX-110, 60, 220, 220);
        }
      });
      if (flashTint) {
        ctx.fillStyle = `rgba(255,80,80,${flashTint * 0.4})`;
        ctx.fillRect(CX-110, 60, 220, 220);
      }
      ctx.restore();

      // Name
      ctx.fillStyle = '#f5d061'; ctx.font = 'bold 22px ui-monospace, monospace';
      ctx.textAlign='center'; ctx.textBaseline='top';
      ctx.shadowColor = '#f5d061'; ctx.shadowBlur = 10;
      ctx.fillText(b.name, CX, 60);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#d6a8ff'; ctx.font = '12px ui-monospace, monospace';
      ctx.fillText('weak to ' + b.weakness.toUpperCase(), CX, 88);

      // HP bar
      const barW = 360, barX = CX - barW/2, barY = 300;
      ctx.fillStyle = '#000'; ctx.fillRect(barX, barY, barW, 16);
      const hpFrac = b.hp / b.maxHp;
      const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
      grad.addColorStop(0, '#ff4466'); grad.addColorStop(1, '#ff8c3a');
      ctx.fillStyle = grad; ctx.fillRect(barX, barY, barW * hpFrac, 16);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
      ctx.strokeRect(barX, barY, barW, 16);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(b.hp + ' / ' + b.maxHp, CX, barY + 8);

      // Boss attack telegraph
      const tFrac = b.telegraphRem / b.telegraph;
      ctx.fillStyle = tFrac < 0.25 ? '#f87171' : '#a58abd';
      ctx.fillRect(barX, barY + 22, barW * (1 - tFrac), 4);
      ctx.fillStyle = '#fff'; ctx.font = '10px ui-monospace, monospace';
      ctx.textBaseline='top';
      ctx.fillText('Incoming attack: ' + b.telegraphRem.toFixed(1) + 's',
                   CX, barY + 30);

      // Cast arena (smaller during duels so portrait gets the spotlight)
      this._renderGlyphArena(ctx, 130, false);

      // Mana + glyph name
      ctx.fillStyle = '#f5d061'; ctx.font = 'bold 16px ui-monospace, monospace';
      ctx.textAlign='left'; ctx.textBaseline='top';
      ctx.fillText('Cast: ' + this.currentGlyph.name + ' (' + this.currentGlyph.element.toUpperCase() + ')',
                   60, 540);
      this._renderManaBar(ctx, 60, 568, 240, 8);

      // Floating damage
      for (const f of this.bossFloaters) {
        ctx.globalAlpha = Math.max(0, 1 - f.age / f.life);
        ctx.fillStyle = f.color;
        ctx.font = 'bold 22px ui-monospace, monospace';
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText(f.text, f.x, f.y);
        ctx.globalAlpha = 1;
      }

      this._renderResult(ctx);
    }

    _renderVictory(ctx) {
      const ch = CHAPTERS[this.chapterIx];
      ctx.fillStyle = '#f5d061';
      ctx.font = 'bold 44px ui-monospace, monospace';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.shadowColor = '#f5d061'; ctx.shadowBlur = 16;
      ctx.fillText('CHAPTER CLEARED', CX, 160);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#d6a8ff'; ctx.font = '16px ui-monospace, monospace';
      ctx.fillText('Defeated ' + ch.boss.name, CX, 210);
      // Show unlocked glyphs from this chapter
      ctx.fillStyle = '#fff';
      ctx.fillText('Glyphs added to your grimoire:', CX, 260);
      const newOnes = ch.glyphs;
      const startX = CX - (newOnes.length - 1) * 56;
      newOnes.forEach((id, i) => {
        const g = GLYPH_BY_ID[id];
        Sprites.draw(ctx, g.sprite, startX + i * 112, 330, 84, 84);
      });

      ctx.fillStyle = '#fff'; ctx.font = 'bold 18px ui-monospace, monospace';
      ctx.fillText('Click to continue to the Sanctum', CX, 510);
    }

    _renderShop(ctx) {
      ctx.fillStyle = '#f5d061'; ctx.font = 'bold 32px ui-monospace, monospace';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.shadowColor = '#f5d061'; ctx.shadowBlur = 12;
      ctx.fillText('SANCTUM · spend coins on perks', CX, 110);
      ctx.shadowBlur = 0;

      const coins = NDP.Engine.Storage.coins || 0;
      ctx.fillStyle = '#ffd86b'; ctx.font = '16px ui-monospace, monospace';
      ctx.fillText('● ' + coins + ' coins', CX, 150);

      this.shopRects = [];
      const cardW = 180, cardH = 220, gap = 24;
      const totalW = cardW * PERKS.length + gap * (PERKS.length - 1);
      const startX = CX - totalW / 2;
      const y = 200;
      PERKS.forEach((p, i) => {
        const x = startX + i * (cardW + gap);
        const owned = this.save.perks[p.id] || 0;
        const sold = owned >= p.max;
        const broke = !sold && coins < p.cost;
        const rect = { x, y, w: cardW, h: cardH, kind: 'perk', perk: p };
        this.shopRects.push(rect);
        // Card
        ctx.fillStyle = sold ? '#1c1428' : '#1a0d2e';
        ctx.fillRect(x, y, cardW, cardH);
        ctx.strokeStyle = sold ? '#3a2350' : (broke ? '#5a3424' : '#f5d061');
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, cardW, cardH);
        // Title
        ctx.fillStyle = '#f5d061'; ctx.font = 'bold 16px ui-monospace, monospace';
        ctx.textAlign='center'; ctx.textBaseline='top';
        ctx.fillText(p.name, x + cardW/2, y + 14);
        // Crystal sprite
        Sprites.draw(ctx, 'sigil.crystal', x + cardW/2, y + 80, 50, 70);
        // Desc
        ctx.fillStyle = '#fff'; ctx.font = '12px ui-monospace, monospace';
        ctx.textBaseline='top';
        wrapText(ctx, p.desc, x + cardW/2, y + 130, cardW - 16, 14);
        // Price
        ctx.fillStyle = sold ? '#7a6090' : (broke ? '#f87171' : '#ffd86b');
        ctx.font = 'bold 14px ui-monospace, monospace';
        ctx.fillText(sold ? 'OWNED' : ('● ' + p.cost), x + cardW/2, y + cardH - 28);
      });

      // Continue
      const cw = 260, ch = 50;
      const cx = CX - cw/2, cy = 460;
      const r = { x: cx, y: cy, w: cw, h: ch, kind: 'continue' };
      this.shopRects.push(r);
      ctx.fillStyle = '#1a4a2a'; ctx.fillRect(cx, cy, cw, ch);
      ctx.strokeStyle = '#4ade80'; ctx.lineWidth = 2;
      ctx.strokeRect(cx, cy, cw, ch);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 18px ui-monospace, monospace';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('CONTINUE TO NEXT CHAPTER', CX, cy + ch/2);
    }

    coinsEarned(score) { return Math.max(0, Math.floor(score / 80)); }
  }

  // ===========================================================================
  // Helpers
  function densify(polyline, n) {
    const pts = [];
    let totalLen = 0;
    const segs = [];
    for (let i = 1; i < polyline.length; i++) {
      const a = polyline[i-1], b = polyline[i];
      const d = Math.hypot(b[0]-a[0], b[1]-a[1]);
      segs.push({ a, b, d }); totalLen += d;
    }
    if (totalLen === 0) return polyline.slice();
    pts.push(polyline[0]);
    for (const s of segs) {
      const steps = Math.max(1, Math.round((s.d / totalLen) * n));
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        pts.push([s.a[0] + (s.b[0]-s.a[0])*t, s.a[1] + (s.b[1]-s.a[1])*t]);
      }
    }
    return pts;
  }

  function resample(points, n) {
    let totalLen = 0;
    const dists = [];
    for (let i = 1; i < points.length; i++) {
      const a = points[i-1], b = points[i];
      const d = Math.hypot(b[0]-a[0], b[1]-a[1]);
      dists.push(d); totalLen += d;
    }
    if (totalLen === 0 || points.length < 2) {
      return new Array(n).fill([points[0]?.[0] || 0, points[0]?.[1] || 0]);
    }
    const step = totalLen / (n - 1);
    const out = [[points[0][0], points[0][1]]];
    let target = step;
    let accum = 0;
    let i = 1;
    while (i < points.length && out.length < n) {
      const a = points[i-1], b = points[i];
      const d = dists[i-1];
      if (accum + d >= target) {
        const t = (target - accum) / d;
        out.push([a[0] + (b[0]-a[0])*t, a[1] + (b[1]-a[1])*t]);
        target += step;
      } else {
        accum += d;
        i++;
      }
    }
    while (out.length < n) out.push([points[points.length-1][0], points[points.length-1][1]]);
    return out;
  }

  function normalizeStroke(pts) {
    let cx = 0, cy = 0;
    pts.forEach(p => { cx += p[0]; cy += p[1]; });
    cx /= pts.length; cy /= pts.length;
    let max = 0;
    pts.forEach(p => { const d = Math.hypot(p[0]-cx, p[1]-cy); if (d > max) max = d; });
    if (max === 0) max = 1;
    return pts.map(p => [(p[0]-cx)/max, (p[1]-cy)/max]);
  }

  function avgPathDist(a, b) {
    const n = Math.min(a.length, b.length);
    let s = 0;
    for (let i = 0; i < n; i++) s += Math.hypot(a[i][0] - b[i][0], a[i][1] - b[i][1]);
    return s / n;
  }

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

  NDP.attachGame('sigil', SigilGame);
})();
