/* Deflect — Champion's Trial.
   12-wave campaign with three boss waves (4, 8, 12), then endless tier.
   Projectile types: arrow, firebolt (curving), splitter, frost, armored.
   Between waves: pick 1 of 3 perk cards (drawn from a perk deck).
   Persistent: best wave reached, perks unlocked into the meta deck.
*/
(function () {
  const NDP = window.NDP;
  const { BaseGame, Input, Sprites } = NDP.Engine;
  const Storage = NDP.Engine.Storage;

  const W = 960, H = 600;
  const CX = W / 2, CY = H / 2;
  const PARRY_R_BASE = 60;
  const HIT_R = 28;

  // ---------- Wave script ----------
  // Each wave: total projectile budget, spawn interval, mix table.
  const MIX_DEFAULTS = { arrow: 1 };
  const WAVES = [
    { n:1,  budget:10, interval:1.0, mix:{ arrow: 1 } },
    { n:2,  budget:14, interval:0.85, mix:{ arrow: 0.85, firebolt: 0.15 } },
    { n:3,  budget:18, interval:0.75, mix:{ arrow: 0.7, firebolt: 0.3 } },
    { n:4,  boss:'warden' },
    { n:5,  budget:20, interval:0.7,  mix:{ arrow: 0.5, firebolt: 0.3, splitter: 0.2 } },
    { n:6,  budget:24, interval:0.6,  mix:{ arrow: 0.4, firebolt: 0.3, splitter: 0.2, frost: 0.1 } },
    { n:7,  budget:28, interval:0.55, mix:{ arrow: 0.3, firebolt: 0.3, splitter: 0.2, frost: 0.1, armored: 0.1 } },
    { n:8,  boss:'twin' },
    { n:9,  budget:30, interval:0.5,  mix:{ arrow: 0.25, firebolt: 0.25, splitter: 0.2, frost: 0.15, armored: 0.15 } },
    { n:10, budget:34, interval:0.45, mix:{ arrow: 0.2, firebolt: 0.25, splitter: 0.25, frost: 0.15, armored: 0.15 } },
    { n:11, budget:38, interval:0.42, mix:{ arrow: 0.2, firebolt: 0.2, splitter: 0.25, frost: 0.2, armored: 0.15 } },
    { n:12, boss:'sun' }
  ];

  const PERKS = [
    { id:'arc',     name:'WIDER ARC',    desc:'Blade arc +30°', sprite:'deflect.perk_arc' },
    { id:'speed',   name:'QUICK BLADE',  desc:'Swing recovery -25%', sprite:'deflect.perk_speed' },
    { id:'heart',   name:'IRON HEART',   desc:'+1 HP up to 5', sprite:'deflect.perk_heart' },
    { id:'reflect', name:'MIRROR EDGE',  desc:'Parries deal damage in radius', sprite:'deflect.perk_reflect' },
    { id:'combo',   name:'BLOOD MOON',   desc:'Combo damage scales x2', sprite:'deflect.perk_combo' },
    { id:'slow',    name:'TIME WALK',    desc:'Perfect parries slow time briefly', sprite:'deflect.perk_slow' }
  ];

  const BOSSES = {
    warden: { name:'THE WARDEN',    sprite:'deflect.warden', maxHp: 14, attack:'cone'    },
    twin:   { name:'TWIN SISTERS',  sprite:'deflect.twin',   maxHp: 18, attack:'twin'    },
    sun:    { name:'THE SUN',       sprite:'deflect.sun',    maxHp: 24, attack:'pulse'   }
  };

  function loadSave() {
    const def = {
      bestWave: 0,
      metaPerks: [],   // perk ids that auto-apply on next run
      bossesBeaten: {}
    };
    return Object.assign(def, Storage.getGameData('deflect') || {});
  }
  function saveData(d) { Storage.setGameData('deflect', d); }

  class DeflectGame extends BaseGame {
    init() {
      this.save = loadSave();

      this.phase = 'intro';
      this.waveIx = 0;          // 0-based index into WAVES
      this.waveProgress = 0;
      this.waveSpawned = 0;
      this.waveSpawnTimer = 1.0;
      this.endlessOn = false;

      this.maxHp = 3;
      this.hp = 3;
      this.combo = 0;
      this.bestCombo = 0;
      this.comboTimer = 0;
      this.projs = [];
      this.runPerks = [];
      this.timeScale = 1;
      this.timeScaleT = 0;

      this.bladeAngle = 0;
      this.bladeSwing = 0;
      this.bladeArc = Math.PI * 0.6;
      this.swingCdBase = 0.18;
      this.boss = null;

      // Apply meta perks unlocked previously.
      for (const id of this.save.metaPerks) this.applyPerk(id, /*free*/true);

      this.perkChoices = null;

      this.sfx = this.makeSfx({
        parry:  { freq: 1200, type: 'square', dur: 0.08, slide: 600, vol: 0.5 },
        hit:    { freq: 110, type: 'sawtooth', dur: 0.22, slide: -40, vol: 0.5 },
        miss:   { freq: 220, type: 'square', dur: 0.06, slide: -80, vol: 0.25 },
        spawn:  { freq: 500, type: 'triangle', dur: 0.05, vol: 0.15 },
        wave:   { freq: 320, type: 'triangle', dur: 0.4, slide: 880, vol: 0.4 },
        boss:   { freq: 80,  type: 'sawtooth', dur: 0.6, vol: 0.5, filter: 'lowpass' },
        bossHit:{ freq: 700, type: 'square', dur: 0.05, slide: -200, vol: 0.32 }
      });
      this.setHud(this._hud());
    }

    onEnd() {
      this.save.bestWave = Math.max(this.save.bestWave, this.waveIx + 1);
      saveData(this.save);
    }

    // ---------- Per frame ----------
    update(dt) {
      if (this.phase === 'intro') {
        if (Input.mouse.justPressed) this.startWave(0);
        return;
      }
      if (this.phase === 'perkPick') {
        this.handlePerkClick();
        return;
      }

      // Time scale (slow on perfect parry perk)
      if (this.timeScaleT > 0) {
        this.timeScaleT -= dt;
        if (this.timeScaleT <= 0) this.timeScale = 1;
      }
      const sdt = dt * this.timeScale;

      // Blade aim
      const aim = Math.atan2(Input.mouse.y - CY, Input.mouse.x - CX);
      this.bladeAngle = aim;

      if (this.phase === 'play' || this.phase === 'boss') {
        this.tickWave(sdt);
        this.tickProjectiles(sdt);
      }

      this.bladeSwing = Math.max(0, this.bladeSwing - sdt);
      if (this.comboTimer > 0) {
        this.comboTimer -= sdt;
        if (this.comboTimer <= 0) this.combo = 0;
      }

      this.setHud(this._hud());
    }

    startWave(ix) {
      this.waveIx = ix;
      const wave = WAVES[ix] || this.endlessWave(ix);
      this.endlessOn = ix >= WAVES.length;

      this.waveSpawned = 0;
      this.waveProgress = 0;
      this.waveSpawnTimer = 1.0;
      this.boss = null;
      this.projs = [];

      if (wave.boss) {
        this.spawnBoss(wave.boss);
        this.phase = 'boss';
        this.sfx.play('boss');
        this.flash('#ff5566', 0.2);
        this.shake(14, 0.5);
      } else {
        this.phase = 'play';
        this.sfx.play('wave');
        this.flash('#ffbb33', 0.1);
      }
    }

    endlessWave(ix) {
      const over = ix - WAVES.length;
      return {
        n: ix + 1,
        budget: 36 + over * 4,
        interval: Math.max(0.25, 0.4 - over * 0.02),
        mix: { arrow: 0.15, firebolt: 0.2, splitter: 0.25, frost: 0.2, armored: 0.2 }
      };
    }

    tickWave(dt) {
      const wave = WAVES[this.waveIx] || this.endlessWave(this.waveIx);
      if (this.phase === 'boss') {
        // boss waves end when boss hp <= 0 (handled in tickProjectiles)
        return;
      }
      this.waveSpawnTimer -= dt;
      if (this.waveSpawnTimer <= 0 && this.waveSpawned < wave.budget) {
        this.spawnFromMix(wave.mix);
        this.waveSpawned++;
        this.waveSpawnTimer = wave.interval * (0.7 + Math.random() * 0.6);
      }
      if (this.waveSpawned >= wave.budget && this.projs.length === 0) {
        this.endWave();
      }
    }

    spawnFromMix(mix) {
      // weighted pick
      const items = Object.entries(mix);
      const total = items.reduce((a, [, v]) => a + v, 0);
      let r = Math.random() * total;
      let kind = 'arrow';
      for (const [k, v] of items) { r -= v; if (r <= 0) { kind = k; break; } }
      this.spawnProj(kind);
    }

    spawnProj(kind, originX, originY, headingOverride) {
      const a = Math.random() * Math.PI * 2;
      const dist = 480;
      const baseSpeed = 180 + Math.min(260, this.waveIx * 14);
      const x = (originX != null) ? originX : CX + Math.cos(a) * dist;
      const y = (originY != null) ? originY : CY + Math.sin(a) * dist;
      const heading = (headingOverride != null) ? headingOverride : Math.atan2(CY - y, CX - x);
      const variants = {
        arrow:    { speed: baseSpeed,         color:'#ffbb33', sprite:'deflect.arrow',    size:[40,12], hp:1, behaviour:'straight'  },
        firebolt: { speed: baseSpeed * 0.85,  color:'#ff7a3a', sprite:'deflect.firebolt', size:[40,22], hp:1, behaviour:'curve'     },
        splitter: { speed: baseSpeed * 0.95,  color:'#d6a8ff', sprite:'deflect.splitter', size:[28,28], hp:1, behaviour:'splits'    },
        frost:    { speed: baseSpeed * 1.0,   color:'#7ae0ff', sprite:'deflect.frost',    size:[28,28], hp:1, behaviour:'frost'     },
        armored:  { speed: baseSpeed * 0.7,   color:'#cfd8e3', sprite:'deflect.armored',  size:[30,30], hp:2, behaviour:'straight'  }
      };
      const v = variants[kind] || variants.arrow;
      const p = {
        kind, x, y, age: 0, alive: true, hp: v.hp,
        color: v.color, sprite: v.sprite, sw: v.size[0], sh: v.size[1],
        angle: heading, speed: v.speed,
        vx: Math.cos(heading) * v.speed,
        vy: Math.sin(heading) * v.speed,
        behaviour: v.behaviour
      };
      this.projs.push(p);
      this.sfx.play('spawn');
    }

    spawnBoss(kind) {
      const b = BOSSES[kind];
      this.boss = {
        kind, name: b.name, sprite: b.sprite,
        hp: b.maxHp + Math.floor(this.waveIx * 0.5),
        maxHp: b.maxHp + Math.floor(this.waveIx * 0.5),
        x: CX, y: 110, t: 0,
        attack: b.attack, attackT: 2,
        sub: 0
      };
    }

    tickProjectiles(dt) {
      for (const p of this.projs) {
        if (!p.alive) continue;
        p.age += dt;
        // behaviours
        if (p.behaviour === 'curve') {
          // Bend toward player past 0.5s
          if (p.age > 0.4) {
            const ta = Math.atan2(CY - p.y, CX - p.x);
            const da = angleDiff(ta, p.angle);
            p.angle += Math.sign(da) * Math.min(Math.abs(da), 1.2 * dt);
            p.vx = Math.cos(p.angle) * p.speed;
            p.vy = Math.sin(p.angle) * p.speed;
          }
        }
        p.x += p.vx * dt; p.y += p.vy * dt;
        const d = Math.hypot(p.x - CX, p.y - CY);
        if (d < HIT_R + 8) this.takeHit(p);
      }
      this.projs = this.projs.filter(p => p.alive && Math.hypot(p.x - CX, p.y - CY) < 700);

      // Click → swing parry
      if (Input.mouse.justPressed && this.bladeSwing <= 0) {
        this.swing();
      }

      // Boss
      if (this.boss) {
        this.tickBoss(dt);
        if (this.boss.hp <= 0) this.killBoss();
      }
    }

    swing() {
      this.bladeSwing = this.swingCdBase * (this.runPerks.includes('speed') ? 0.75 : 1);
      let parried = 0;
      let perfect = false;
      const aim = this.bladeAngle;
      const arcHalf = this.bladeArc / 2;
      const parryR = PARRY_R_BASE;
      // Parry projectiles
      for (const p of this.projs) {
        if (!p.alive) continue;
        const dx = p.x - CX, dy = p.y - CY;
        const d = Math.hypot(dx, dy);
        if (d < parryR + 8) {
          const pa = Math.atan2(dy, dx);
          const da = Math.abs(angleDiff(pa, aim));
          if (da < arcHalf + 0.1) {
            // Frost: parry partial — only counts at perfect range (40-50)
            if (p.kind === 'frost' && (d < 30 || d > 55)) {
              this.bladeSwing *= 1.5;
              continue;
            }
            p.hp--;
            if (p.hp <= 0) {
              p.alive = false;
              parried++;
              if (d < 45) perfect = true;
              this.particles.burst(p.x, p.y, 12, { color: '#ffffff', speed: 220, life: 0.4 });
              this.particles.burst(p.x, p.y, 6, { color: p.color, speed: 300, life: 0.6 });
              if (p.kind === 'splitter') {
                // Spawn 3 child shards heading outward away from center
                for (let k = -1; k <= 1; k++) {
                  const a = Math.atan2(p.y - CY, p.x - CX) + k * 0.5;
                  const x2 = p.x, y2 = p.y;
                  const child = {
                    kind: 'splitterChild', x: x2, y: y2, age: 0, alive: true, hp: 1,
                    color:'#d6a8ff', sprite:'deflect.splitter', sw:18, sh:18,
                    angle: a, speed: 220,
                    vx: Math.cos(a) * 220, vy: Math.sin(a) * 220,
                    behaviour: 'straight'
                  };
                  this.projs.push(child);
                }
              }
              if (this.runPerks.includes('reflect')) {
                // damage radius
                for (const q of this.projs) {
                  if (q === p || !q.alive) continue;
                  if (Math.hypot(q.x - p.x, q.y - p.y) < 80) { q.hp--; if (q.hp <= 0) { q.alive = false; parried++; } }
                }
              }
            } else {
              // armored — flicker
              this.particles.burst(p.x, p.y, 6, { color: '#ffffff', speed: 140, life: 0.3 });
              this.sfx.play('miss', { freq: 600 });
            }
          }
        }
      }
      // Boss parry
      if (this.boss && this.boss.attack === 'twin') {
        // Twin sisters fire fast paired arcs we count as projectiles already.
      }
      if (parried > 0) {
        this.combo += parried;
        this.bestCombo = Math.max(this.bestCombo, this.combo);
        this.comboTimer = 2.5;
        const mult = 1 + Math.floor(this.combo / 5) * (this.runPerks.includes('combo') ? 2 : 1);
        const base = perfect ? 80 : 50;
        this.addScore(base * parried * mult);
        if (perfect && this.runPerks.includes('slow')) {
          this.timeScale = 0.5;
          this.timeScaleT = 0.6;
        }
        if (this.boss) {
          this.boss.hp -= parried * (perfect ? 2 : 1);
          this.sfx.play('bossHit');
        }
        this.sfx.play('parry', { freq: 900 + parried * 200 });
        this.shake(3 + parried * 2, 0.2);
        this.flash(perfect ? '#fff' : '#ffbb33', perfect ? 0.12 : 0.08);
      } else {
        this.sfx.play('miss');
        this.combo = 0;
      }
    }

    takeHit(p) {
      p.alive = false;
      this.hp--;
      this.combo = 0;
      this.shake(14, 0.4);
      this.flash('#f87171', 0.2);
      this.particles.burst(p.x, p.y, 18, { color: '#f87171', speed: 240, life: 0.7 });
      this.sfx.play('hit');
      if (this.hp <= 0) {
        this.gameOver();
      }
    }

    tickBoss(dt) {
      const b = this.boss;
      b.t += dt;
      // Boss hovers in arcs
      b.x = CX + Math.sin(b.t * 0.5) * 240;
      b.y = 110 + Math.cos(b.t * 0.3) * 30;
      b.attackT -= dt;
      if (b.attackT <= 0) {
        const w = WAVES[this.waveIx] || this.endlessWave(this.waveIx);
        if (b.attack === 'cone') {
          // Warden: cone of 5 firebolts
          const baseA = Math.atan2(CY - b.y, CX - b.x);
          for (let i = -2; i <= 2; i++) {
            const a = baseA + i * 0.18;
            this.spawnProj('firebolt', b.x, b.y, a);
          }
          b.attackT = 2.4;
        } else if (b.attack === 'twin') {
          // Twin: alt fire pairs of arrows from screen edges
          for (let i = 0; i < 2; i++) {
            const side = (b.sub + i) % 2;
            const x = side ? -20 : W + 20;
            const y = 200 + Math.random() * 200;
            this.spawnProj('arrow', x, y, Math.atan2(CY - y, CX - x));
          }
          b.sub++;
          b.attackT = 0.7;
        } else if (b.attack === 'pulse') {
          // The Sun: radial wave of 12 firebolts
          for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2;
            this.spawnProj('firebolt', b.x, b.y, a);
          }
          b.attackT = 3.4;
        }
      }
    }

    killBoss() {
      const kind = this.boss.kind;
      this.save.bossesBeaten[kind] = true;
      const reward = PERKS.find(p => p.id === ({warden:'arc', twin:'reflect', sun:'combo'}[kind]));
      if (reward && !this.save.metaPerks.includes(reward.id)) {
        this.save.metaPerks.push(reward.id);
      }
      saveData(this.save);
      this.particles.burst(this.boss.x, this.boss.y, 100, { color: '#ffd86b', speed: 360, life: 1.2 });
      this.shake(20, 0.7);
      this.flash('#fff', 0.3);
      this.boss = null;
      this.endWave();
    }

    endWave() {
      // Save best
      this.save.bestWave = Math.max(this.save.bestWave, this.waveIx + 1);
      saveData(this.save);

      if (this.waveIx + 1 >= WAVES.length + 999) {
        this.win();
        return;
      }
      // Offer perks if next wave isn't endless or every wave shows them
      this.openPerkPick();
    }

    openPerkPick() {
      const pool = PERKS.filter(p => true); // all perks always available
      // Pick 3 distinct
      const choices = [];
      const used = new Set();
      while (choices.length < 3 && used.size < pool.length) {
        const i = Math.floor(Math.random() * pool.length);
        if (used.has(i)) continue;
        used.add(i);
        choices.push(pool[i]);
      }
      this.perkChoices = choices;
      this.phase = 'perkPick';
    }

    handlePerkClick() {
      if (!Input.mouse.justPressed) return;
      const mx = Input.mouse.x, my = Input.mouse.y;
      for (let i = 0; i < this.perkChoices.length; i++) {
        const x = (W - 3 * 220 - 2 * 30) / 2 + i * 250;
        const y = 220;
        if (mx >= x && mx <= x + 220 && my >= y && my <= y + 200) {
          this.applyPerk(this.perkChoices[i].id);
          this.perkChoices = null;
          this.startWave(this.waveIx + 1);
          return;
        }
      }
      // Skip button — no perk, gain 100 score
      const sx = W/2 - 80, sy = 460;
      if (mx >= sx && mx <= sx + 160 && my >= sy && my <= sy + 40) {
        this.addScore(100);
        this.perkChoices = null;
        this.startWave(this.waveIx + 1);
      }
    }

    applyPerk(id, free) {
      if (!this.runPerks.includes(id)) this.runPerks.push(id);
      if (id === 'arc')   this.bladeArc += Math.PI / 6;
      if (id === 'speed') this.swingCdBase = Math.max(0.06, this.swingCdBase * 0.75);
      if (id === 'heart') { this.maxHp = Math.min(5, this.maxHp + 1); this.hp = Math.min(this.maxHp, this.hp + 1); }
      // reflect/combo/slow are read at swing-time
    }

    _hud() {
      const hearts = '\u2764'.repeat(Math.max(0, this.hp)) + '\u2661'.repeat(Math.max(0, this.maxHp - this.hp));
      const wname = this.boss ? this.boss.name : `WAVE ${this.waveIx + 1}/${WAVES.length}`;
      return `<span>${wname}</span>` +
             `<span>HP <b style="color:#f87171">${hearts}</b></span>` +
             `<span>Combo <b>x${this.combo}</b></span>` +
             `<span>Score <b>${this.score}</b></span>`;
    }

    // ---------- Render ----------
    render(ctx) {
      ctx.fillStyle = '#07090f'; ctx.fillRect(0, 0, W, H);
      // Stage rings
      ctx.strokeStyle = '#1a1d2a'; ctx.lineWidth = 1;
      for (let r = 60; r < 500; r += 50) {
        ctx.beginPath(); ctx.arc(CX, CY, r, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.strokeStyle = '#ffbb3344'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(CX, CY, PARRY_R_BASE, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#f8717144'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(CX, CY, HIT_R, 0, Math.PI * 2); ctx.stroke();

      // Boss (background)
      if (this.boss) {
        Sprites.draw(ctx, this.boss.sprite, this.boss.x, this.boss.y, 200, 200, { rot: Math.sin(this.boss.t * 0.4) * 0.1 });
      }

      // Projectiles
      for (const p of this.projs) {
        if (!p.alive) continue;
        // trail
        ctx.strokeStyle = p.color + '88';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04);
        ctx.stroke();
        // sprite
        Sprites.draw(ctx, p.sprite, p.x, p.y, p.sw, p.sh, { rot: p.angle });
        if (p.hp > 1) {
          // armored marker
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 10px ui-monospace, monospace';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(p.hp, p.x, p.y);
        }
      }

      // Blade (swinging arc)
      const swingT = Math.max(0, this.bladeSwing / this.swingCdBase);
      const arcHalf = this.bladeArc / 2;
      if (this.bladeSwing > 0) {
        ctx.save();
        ctx.shadowColor = '#ffbb33'; ctx.shadowBlur = 22;
        ctx.fillStyle = `rgba(255, 187, 51, ${0.4 * swingT})`;
        ctx.beginPath();
        ctx.moveTo(CX, CY);
        ctx.arc(CX, CY, PARRY_R_BASE + 14, this.bladeAngle - arcHalf, this.bladeAngle + arcHalf);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      // Blade line
      ctx.save();
      ctx.strokeStyle = '#ff5566';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#ff5566'; ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(CX, CY);
      ctx.lineTo(CX + Math.cos(this.bladeAngle) * (PARRY_R_BASE + 22),
                 CY + Math.sin(this.bladeAngle) * (PARRY_R_BASE + 22));
      ctx.stroke();
      ctx.restore();

      // Knight sprite
      Sprites.draw(ctx, 'deflect.knight', CX, CY, 60, 60, { rot: this.bladeAngle - Math.PI/2 });

      // HP hearts top-left
      for (let i = 0; i < this.maxHp; i++) {
        ctx.fillStyle = i < this.hp ? '#f87171' : '#333';
        const hx = 30 + i * 28, hy = 30;
        ctx.beginPath();
        ctx.moveTo(hx, hy + 8);
        ctx.bezierCurveTo(hx - 14, hy - 6, hx - 14, hy - 16, hx, hy - 4);
        ctx.bezierCurveTo(hx + 14, hy - 16, hx + 14, hy - 6, hx, hy + 8);
        ctx.fill();
      }

      // Boss HP
      if (this.boss) {
        const bw = 480, bx = (W - bw)/2, by = 60;
        ctx.fillStyle = '#0008'; ctx.fillRect(bx, by, bw, 14);
        ctx.fillStyle = '#ff5566';
        ctx.fillRect(bx, by, bw * Math.max(0, this.boss.hp / this.boss.maxHp), 14);
        ctx.strokeStyle = '#fff'; ctx.strokeRect(bx, by, bw, 14);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 12px ui-monospace, monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(this.boss.name, W/2, by + 7);
      }

      // Wave progress bar (non-boss waves)
      if (this.phase === 'play') {
        const wave = WAVES[this.waveIx] || this.endlessWave(this.waveIx);
        const remain = wave.budget - this.waveSpawned + this.projs.filter(p => p.alive).length;
        const total = wave.budget;
        const x = 180, y = H - 24, w = W - 360;
        ctx.fillStyle = '#0006'; ctx.fillRect(x, y, w, 8);
        ctx.fillStyle = '#ffbb33';
        ctx.fillRect(x, y, w * (1 - remain / total), 8);
      }

      // Run perks
      for (let i = 0; i < this.runPerks.length; i++) {
        const id = this.runPerks[i];
        const sp = ({arc:'deflect.perk_arc',speed:'deflect.perk_speed',heart:'deflect.perk_heart',reflect:'deflect.perk_reflect',combo:'deflect.perk_combo',slow:'deflect.perk_slow'})[id];
        Sprites.draw(ctx, sp, W - 36 - i * 40, 40, 32, 32);
      }

      if (this.phase === 'intro') this.drawIntro(ctx);
      if (this.phase === 'perkPick') this.drawPerkPick(ctx);
    }

    drawIntro(ctx) {
      ctx.fillStyle = '#000a'; ctx.fillRect(0, 0, W, H);
      Sprites.draw(ctx, 'deflect.knight', W/2, 200, 160, 160);
      ctx.fillStyle = '#ff5566';
      ctx.font = 'bold 48px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText("CHAMPION'S TRIAL", W/2, 340);
      ctx.fillStyle = '#fff';
      ctx.font = '16px ui-monospace, monospace';
      ctx.fillText('12 waves · 3 bosses · pick perks between waves', W/2, 376);
      ctx.fillText('Aim with mouse · Click to swing · Time the parry', W/2, 400);
      ctx.fillStyle = '#7ae0ff';
      ctx.fillText(`Best wave reached: ${this.save.bestWave}/${WAVES.length}`, W/2, 432);
      if (this.save.metaPerks.length) {
        ctx.fillText('Meta perks: ' + this.save.metaPerks.join(', '), W/2, 456);
      }
      ctx.fillStyle = '#ffd86b';
      ctx.font = 'bold 20px ui-monospace, monospace';
      if (Math.floor(this.time * 2) % 2 === 0) ctx.fillText('CLICK TO BEGIN', W/2, 510);
    }

    drawPerkPick(ctx) {
      ctx.fillStyle = '#000c'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#ffbb33';
      ctx.font = 'bold 32px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('CHOOSE A PERK', W/2, 130);
      ctx.fillStyle = '#fff';
      ctx.font = '14px ui-monospace, monospace';
      ctx.fillText(`After Wave ${this.waveIx + 1}/${WAVES.length}`, W/2, 168);

      const total = this.perkChoices.length * 220 + (this.perkChoices.length - 1) * 30;
      const x0 = (W - total) / 2;
      for (let i = 0; i < this.perkChoices.length; i++) {
        const x = x0 + i * 250, y = 220;
        const p = this.perkChoices[i];
        const owned = this.runPerks.includes(p.id);
        ctx.fillStyle = owned ? '#0a3a14' : '#100416';
        ctx.fillRect(x, y, 220, 200);
        ctx.strokeStyle = owned ? '#4ade80' : '#ffbb33';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, 220, 200);
        Sprites.draw(ctx, p.sprite, x + 110, y + 70, 80, 80);
        ctx.fillStyle = '#ffbb33';
        ctx.font = 'bold 16px ui-monospace, monospace';
        ctx.fillText(p.name, x + 110, y + 130);
        ctx.fillStyle = '#fff';
        ctx.font = '12px ui-monospace, monospace';
        wrapText(ctx, p.desc, x + 110, y + 156, 200, 14);
        if (owned) {
          ctx.fillStyle = '#4ade80';
          ctx.font = 'bold 12px ui-monospace, monospace';
          ctx.fillText('OWNED — STACKS', x + 110, y + 188);
        }
      }
      // skip
      const sx = W/2 - 80, sy = 460;
      ctx.fillStyle = '#1a1d2a';
      ctx.fillRect(sx, sy, 160, 40);
      ctx.strokeStyle = '#7ae0ff';
      ctx.strokeRect(sx, sy, 160, 40);
      ctx.fillStyle = '#7ae0ff';
      ctx.font = 'bold 14px ui-monospace, monospace';
      ctx.fillText('SKIP (+100 PTS)', W/2, sy + 20);
    }

    coinsEarned(score) { return Math.max(0, Math.floor(score / 60)); }
  }

  function angleDiff(a, b) {
    let d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }
  function wrapText(ctx, s, x, y, maxW, lineH) {
    const words = s.split(' ');
    let line = '';
    let yy = y;
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW) {
        ctx.fillText(line, x, yy);
        line = w; yy += lineH;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, yy);
  }

  NDP.attachGame('deflect', DeflectGame);
})();
