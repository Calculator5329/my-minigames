/* Gullet — sandworm eruption hunt with energy, critter variety, biome stages,
   and persistent pre-run upgrades.

   Currency model: per-game wallet ('Gore') under Storage.*GameWallet
   ('gullet'). Pre-run shop spends Gore only. Wallet awarded at end-of-run
   from biome milestones (third biome is endless, so victoryAchieved never
   triggers — by design). NG+/persistent. */
(function () {
  const NDP = window.NDP;
  const { BaseGame, Input, Storage } = NDP.Engine;

  const W = 960, H = 600;
  const SURFACE = H * 0.58;
  const GID = 'gullet';

  const BIOMES = [
    { name: 'REEF',   scoreTo:  400, sky: ['#ffb874','#ff7a50'], dirt: '#5a3921', critters: ['farmer','cow','bird'] },
    { name: 'TRENCH', scoreTo: 1200, sky: ['#c2683e','#3a1a44'], dirt: '#3a2840', critters: ['farmer','cow','bird','fast','spiked'] },
    { name: 'ABYSS',  scoreTo: Infinity, sky: ['#1a0a2a','#05000a'], dirt: '#201228', critters: ['fast','spiked','fat','glowbug','cow'] }
  ];

  const UPGRADES = [
    { id: 'energy', label: 'Larger Gullet', desc: '+25 max energy per tier', cost: 80,  max: 3, color: '#ffcc33' },
    { id: 'cone',   label: 'Wider Maw',     desc: '+20% eat hitbox',         cost: 110, max: 2, color: '#ff7744' },
    { id: 'chain',  label: 'Gluttony',      desc: '+0.5 combo multiplier',   cost: 140, max: 2, color: '#ff4fd8' },
    { id: 'armor',  label: 'Hide',          desc: '+1 max HP',               cost: 100, max: 3, color: '#88e8ff' }
  ];

  class GulletGame extends BaseGame {
    init() {
      const d = Storage.getGameData('gullet') || {};
      this.save = {
        bestScore: d.bestScore || 0,
        upgrades: Object.assign({ energy:0, cone:0, chain:0, armor:0 }, d.upgrades || {})
      };
      this.phase = 'shop';  // 'shop' | 'play' | 'done'
      this.shopRects = [];

      this.surface = SURFACE;
      this.critters = [];
      this.spawnTimer = 0;
      this.spawnInterval = 1.4;

      this.maxEnergy = 100 + this.save.upgrades.energy * 25;
      this.energy = this.maxEnergy;
      this.maxHp = 3 + this.save.upgrades.armor;
      this.hp = this.maxHp;
      this.iframe = 0;
      this.coneMul = 1 + this.save.upgrades.cone * 0.2;
      this.chainBonus = this.save.upgrades.chain * 0.5;

      this.biomeIdx = 0;
      this.biomesClearedThisRun = 0;
      this.victoryAchieved = false;
      this.worm = {
        x: W / 2, yBase: SURFACE + 40,
        y: SURFACE + 40, vy: 0,
        erupting: false,
        cooldown: 0,
        size: 34,
        growth: 0,
        chain: []
      };
      for (let i = 0; i < 10; i++) this.worm.chain.push({ x: W/2, y: SURFACE + 40 + i*8 });
      this.sfx = this.makeSfx({
        bite:   { freq: 160, type: 'square', dur: 0.1, slide: -120, vol: 0.5 },
        erupt:  { freq: 80, type: 'sawtooth', dur: 0.22, slide: 320, vol: 0.45 },
        miss:   { freq: 80, type: 'noise', dur: 0.08, vol: 0.3, filter: 'lowpass' },
        hurt:   { freq: 120, type: 'sawtooth', dur: 0.18, vol: 0.5, slide: -60 },
        tick:   { freq: 880, type: 'square', dur: 0.03, vol: 0.2 },
        biome:  { freq: 500, type: 'triangle', dur: 0.3, slide: 220, vol: 0.4 },
        glow:   { freq: 1320,type: 'sine',    dur: 0.2, slide: -200, vol: 0.4 },
        buy:    { freq: 1100,type: 'square',  dur: 0.1, vol: 0.4 }
      });
      this.combo = 0;
      this.comboTimer = 0;
      this.setHud('<span>Ready</span>');
    }

    _writeSave() {
      Storage.setGameData('gullet', {
        bestScore: Math.max(this.save.bestScore, this.score),
        upgrades: this.save.upgrades
      });
    }

    _awardWallet() {
      const award = this.coinsEarned();
      if (award > 0) Storage.addGameWallet(GID, award);
    }

    spawnCritter() {
      const biome = BIOMES[this.biomeIdx];
      const kind = biome.critters[(Math.random() * biome.critters.length) | 0];
      const dir = Math.random() < 0.5 ? 1 : -1;
      const speedMul = 1 + Math.min(1.2, this.time / 40);
      const defs = {
        farmer:  { w: 12, h: 24, speed: 40,  pts: 10, eng: 15, dmg: 0, hover: 0 },
        cow:     { w: 30, h: 18, speed: 60,  pts: 20, eng: 20, dmg: 0, hover: 0 },
        bird:    { w: 18, h: 10, speed: 90,  pts: 30, eng: 15, dmg: 0, hover: -60 - Math.random()*40 },
        fast:    { w: 14, h: 14, speed: 140, pts: 40, eng: 10, dmg: 0, hover: -20 - Math.random()*40, evade: true },
        spiked:  { w: 16, h: 16, speed: 55,  pts: 15, eng: 0,  dmg: 1, hover: 0, spiky: true },
        fat:     { w: 44, h: 28, speed: 32,  pts: 55, eng: 35, dmg: 0, hover: 0 },
        glowbug: { w: 14, h: 14, speed: 70,  pts: 25, eng: 55, dmg: 0, hover: -80 - Math.random()*40, glow: true, rare: true }
      };
      const def = defs[kind];
      const c = {
        kind, dir,
        x: dir > 0 ? -20 : W + 20,
        y: SURFACE,
        speed: def.speed * speedMul,
        w: def.w, h: def.h,
        hover: def.hover,
        points: def.pts,
        energy: def.eng,
        damage: def.dmg,
        evade: !!def.evade,
        spiky: !!def.spiky,
        glow: !!def.glow,
        alive: true,
        anim: Math.random() * 6
      };
      this.critters.push(c);
    }

    update(dt) {
      if (this.phase === 'shop') { this._updateShop(dt); return; }
      if (this.phase === 'done') return;

      // biome progression by score
      while (this.biomeIdx < BIOMES.length - 1 && this.score >= BIOMES[this.biomeIdx].scoreTo) {
        this.biomesClearedThisRun++;
        this.biomeIdx++;
        this.sfx.play('biome');
        this.flash(BIOMES[this.biomeIdx].sky[0], 0.3);
      }

      const biome = BIOMES[this.biomeIdx];
      const ramp = 1 + Math.min(1.3, this.time / 40);
      this.spawnInterval = Math.max(0.3, 1.2 - ramp * 0.4);

      const mx = Input.mouse.x;
      this.worm.x += (mx - this.worm.x) * Math.min(1, dt * 6);
      this.worm.x = Math.max(30, Math.min(W - 30, this.worm.x));

      // Energy regen
      this.energy = Math.min(this.maxEnergy, this.energy + dt * 8);

      this.worm.cooldown = Math.max(0, this.worm.cooldown - dt);
      const wantErupt = (Input.mouse.justPressed || Input.keys[' '] || Input.keys['Space']);
      if (wantErupt && this.worm.cooldown <= 0 && !this.worm.erupting && this.energy >= 25) {
        this.energy -= 25;
        this.worm.erupting = true;
        this.worm.vy = -540;
        this.worm.cooldown = 0.4;
        this.sfx.play('erupt');
        for (let i = 0; i < 14; i++) {
          this.particles.emit({
            x: this.worm.x + (Math.random()-0.5)*30,
            y: SURFACE, size: 3 + Math.random()*2,
            vx: (Math.random()-0.5)*220, vy: -80 - Math.random()*120,
            gravity: 900, life: 0.7, color: Math.random()<0.5 ? biome.dirt : '#2a1a10',
            shape: 'rect'
          });
        }
        this.shake(6, 0.18);
      } else if (wantErupt && this.energy < 25) {
        this.sfx.play('miss');
      }

      if (this.iframe > 0) this.iframe -= dt;

      if (this.worm.erupting) {
        this.worm.y += this.worm.vy * dt;
        this.worm.vy += 1400 * dt;
        if (this.worm.y >= this.worm.yBase && this.worm.vy > 0) {
          this.worm.y = this.worm.yBase;
          this.worm.vy = 0;
          this.worm.erupting = false;
        }
      }

      const chainSpacing = 10;
      let prev = { x: this.worm.x, y: this.worm.y };
      for (const seg of this.worm.chain) {
        const dx = prev.x - seg.x, dy = prev.y - seg.y;
        const dist = Math.hypot(dx, dy);
        if (dist > chainSpacing) {
          const m = (dist - chainSpacing) / dist;
          seg.x += dx * m;
          seg.y += dy * m;
        }
        prev = seg;
      }

      for (const c of this.critters) {
        c.x += c.dir * c.speed * dt;
        c.anim += dt * 8;
        if (c.kind === 'bird' || c.kind === 'fast' || c.kind === 'glowbug') {
          c.y = SURFACE + c.hover + Math.sin(c.anim * 0.6) * (c.evade ? 18 : 6);
          if (c.evade) {
            // horizontal sidestep when worm close
            const dx = this.worm.x - c.x;
            if (Math.abs(dx) < 90) c.x -= Math.sign(dx) * 60 * dt;
          }
        } else {
          c.y = SURFACE - c.h + Math.sin(c.anim) * 1;
        }
      }

      const head = { x: this.worm.x, y: this.worm.y, r: (this.worm.size * 0.8 + this.worm.growth * 0.3) * this.coneMul };
      for (const c of this.critters) {
        if (!c.alive) continue;
        const cy = c.y + (c.kind === 'farmer' || c.kind === 'cow' || c.kind === 'fat' || c.kind === 'spiked' ? -c.h/2 : 0);
        const dx = Math.abs(head.x - c.x), dy = Math.abs(head.y - cy);
        if (dx < head.r + c.w/2 && dy < head.r + c.h/2) {
          if (c.spiky) this.hurt(c);
          else this.eat(c);
        }
      }

      this.critters = this.critters.filter(c => c.alive && c.x > -40 && c.x < W + 40);

      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnCritter();
        this.spawnTimer = this.spawnInterval * (0.6 + Math.random() * 0.8);
      }

      if (this.comboTimer > 0) {
        this.comboTimer -= dt;
        if (this.comboTimer <= 0) this.combo = 0;
      }

      if (this.hp <= 0) {
        this.phase = 'done';
        this._writeSave();
        this._awardWallet();
        this.gameOver();
        return;
      }

      this.setHud(
        `<span>Zone <b>${biome.name}</b></span>` +
        `<span>HP <b style="color:#ff9d9d">${this.hp}/${this.maxHp}</b></span>` +
        `<span>Energy <b style="color:#ffcc33">${this.energy|0}/${this.maxEnergy}</b></span>` +
        `<span>Combo <b>x${(this.combo || 1) + this.chainBonus * this.combo}</b></span>` +
        `<span>Score <b>${this.score}</b></span>`
      );
    }

    eat(c) {
      c.alive = false;
      this.combo = Math.min(9, this.combo + 1);
      this.comboTimer = 1.6;
      const mul = Math.max(1, this.combo) + this.chainBonus * Math.max(0, this.combo - 1);
      const pts = Math.round(c.points * mul);
      this.addScore(pts);
      this.energy = Math.min(this.maxEnergy, this.energy + (c.energy || 0));
      this.worm.growth = Math.min(30, this.worm.growth + 1.5);
      this.sfx.play(c.glow ? 'glow' : 'bite', { freq: 160 + this.combo * 30 });
      this.shake(c.kind === 'fat' ? 9 : 5, 0.15);
      this.flash('#ff6655', 0.05);
      const gore = c.glow ? ['#ffe088','#88e8ff','#fff'] : ['#b22','#9a2d2d','#e04','#fca'];
      for (let i = 0; i < (c.kind === 'fat' ? 28 : 16); i++) {
        this.particles.emit({
          x: c.x, y: c.y - (c.h||10)/2,
          vx: (Math.random()-0.5)*340, vy: -60 - Math.random()*200,
          gravity: 700, life: 0.8, size: 2 + Math.random()*3,
          color: gore[(Math.random() * gore.length) | 0]
        });
      }
    }

    hurt(c) {
      c.alive = false;
      if (this.iframe > 0) return;
      this.hp -= c.damage;
      this.iframe = 0.9;
      this.combo = 0;
      this.sfx.play('hurt');
      this.shake(12, 0.35);
      this.flash('#ff3344', 0.25);
      for (let i = 0; i < 18; i++) {
        this.particles.emit({
          x: c.x, y: c.y - (c.h||10)/2,
          vx: (Math.random()-0.5)*300, vy: -80 - Math.random()*180,
          gravity: 700, life: 0.7, size: 2 + Math.random()*3,
          color: '#ff4466'
        });
      }
    }

    // -------- SHOP --------
    _updateShop(dt) {
      if (Input.mouse.justPressed) {
        for (const r of this.shopRects) {
          if (Input.mouse.x >= r.x && Input.mouse.x <= r.x + r.w &&
              Input.mouse.y >= r.y && Input.mouse.y <= r.y + r.h) {
            if (r.kind === 'launch') {
              this.phase = 'play';
              return;
            }
            if (r.kind === 'buy') {
              const u = UPGRADES[r.i];
              const lvl = this.save.upgrades[u.id] || 0;
              if (lvl < u.max && Storage.spendGameWallet(GID, u.cost)) {
                this.save.upgrades[u.id] = lvl + 1;
                Storage.setGameData('gullet', {
                  bestScore: this.save.bestScore,
                  upgrades: this.save.upgrades
                });
                this.sfx.play('buy');
                this.maxEnergy = 100 + this.save.upgrades.energy * 25;
                this.energy = this.maxEnergy;
                this.maxHp = 3 + this.save.upgrades.armor;
                this.hp = this.maxHp;
                this.coneMul = 1 + this.save.upgrades.cone * 0.2;
                this.chainBonus = this.save.upgrades.chain * 0.5;
              }
              return;
            }
          }
        }
      }
    }

    render(ctx) {
      if (this.phase === 'shop') { this._renderShop(ctx); return; }
      const biome = BIOMES[this.biomeIdx];

      const g = ctx.createLinearGradient(0, 0, 0, SURFACE);
      g.addColorStop(0, biome.sky[0]); g.addColorStop(1, biome.sky[1]);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, SURFACE);

      if (this.biomeIdx === 0) {
        ctx.fillStyle = '#ffdd66';
        ctx.beginPath(); ctx.arc(W * 0.82, 90, 40, 0, Math.PI * 2); ctx.fill();
      } else if (this.biomeIdx === 1) {
        // storm clouds
        ctx.fillStyle = '#221230';
        for (let i = 0; i < 5; i++) {
          const cx = (i * 220 + (this.time * 20) % 220) % W;
          ctx.beginPath(); ctx.ellipse(cx, 80 + (i%2)*30, 60, 16, 0, 0, Math.PI * 2); ctx.fill();
        }
      } else {
        // stars
        ctx.fillStyle = '#ffffffaa';
        for (let i = 0; i < 60; i++) {
          const sx = (i * 97) % W;
          const sy = (i * 53) % SURFACE;
          ctx.fillRect(sx, sy, 2, 2);
        }
      }

      // mountains tinted per biome
      ctx.fillStyle = biome.sky[1];
      for (let i = 0; i < 4; i++) {
        const mx = i * 260 + 120;
        ctx.beginPath();
        ctx.moveTo(mx - 80, SURFACE);
        ctx.lineTo(mx, SURFACE - 80);
        ctx.lineTo(mx + 80, SURFACE);
        ctx.closePath(); ctx.fill();
      }

      ctx.fillStyle = biome.dirt; ctx.fillRect(0, SURFACE, W, H - SURFACE);
      ctx.fillStyle = '#00000044';
      for (let i = 0; i < 12; i++) ctx.fillRect(0, SURFACE + 10 + i * 12, W, 2);
      ctx.fillStyle = '#2a1a0e'; ctx.fillRect(0, SURFACE - 2, W, 3);

      for (const c of this.critters) this.drawCritter(ctx, c);

      const headR = this.worm.size + this.worm.growth * 0.4;
      ctx.fillStyle = this.biomeIdx === 2 ? '#3a0d5a' : '#7b1c1c';
      for (let i = this.worm.chain.length - 1; i >= 0; i--) {
        const s = this.worm.chain[i];
        const sz = headR * 0.5 + i * 0.3;
        ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(4, sz * 0.6), 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = this.biomeIdx === 2 ? '#5a1a88' : '#9a2d2d';
      const blink = this.iframe > 0 && Math.sin(this.time * 30) < 0 ? 0.3 : 1;
      ctx.globalAlpha = blink;
      ctx.beginPath();
      ctx.ellipse(this.worm.x, this.worm.y, headR, headR * 1.05, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;

      if (this.worm.erupting || this.worm.y < SURFACE) {
        ctx.fillStyle = '#2a0000';
        ctx.beginPath(); ctx.ellipse(this.worm.x, this.worm.y, headR * 0.65, headR * 0.4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#f6ecd4';
        for (let i = -3; i <= 3; i++) {
          const tx = this.worm.x + i * (headR * 0.22);
          ctx.beginPath();
          ctx.moveTo(tx - 4, this.worm.y - 6);
          ctx.lineTo(tx, this.worm.y + 10);
          ctx.lineTo(tx + 4, this.worm.y - 6);
          ctx.closePath(); ctx.fill();
        }
      }
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(this.worm.x + headR * 0.45, this.worm.y - headR * 0.4, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(this.worm.x + headR * 0.5, this.worm.y - headR * 0.4, 2.5, 0, Math.PI * 2); ctx.fill();

      // energy bar bottom left
      const barW = 240, barH = 10;
      ctx.fillStyle = '#00000080'; ctx.fillRect(20, H - 28, barW, barH);
      ctx.fillStyle = this.energy >= 25 ? '#ffcc33' : '#f87171';
      ctx.fillRect(20, H - 28, barW * (this.energy / this.maxEnergy), barH);
      ctx.strokeStyle = '#ffffff40'; ctx.strokeRect(20, H - 28, barW, barH);
      ctx.fillStyle = '#ffffffaa';
      ctx.font = 'bold 10px ui-monospace, monospace';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText('ENERGY (25 per erupt)', 24, H - 42);

      // HP hearts bottom right
      for (let i = 0; i < this.maxHp; i++) {
        const hx = W - 28 - i * 22, hy = H - 24;
        ctx.fillStyle = i < this.hp ? '#ff4466' : '#2a1018';
        ctx.beginPath();
        ctx.arc(hx - 4, hy, 6, 0, Math.PI * 2);
        ctx.arc(hx + 4, hy, 6, 0, Math.PI * 2);
        ctx.moveTo(hx - 9, hy + 1);
        ctx.lineTo(hx, hy + 12);
        ctx.lineTo(hx + 9, hy + 1);
        ctx.closePath(); ctx.fill();
      }
    }

    drawCritter(ctx, c) {
      if (c.kind === 'farmer') {
        ctx.fillStyle = '#c28050'; ctx.fillRect(c.x - 4, c.y - 14, 8, 10);
        ctx.fillStyle = '#3355aa'; ctx.fillRect(c.x - 5, c.y - 4, 10, 12);
        ctx.fillStyle = '#553'; ctx.fillRect(c.x - 4, c.y + 8, 4, 4); ctx.fillRect(c.x, c.y + 8, 4, 4);
        ctx.fillStyle = '#7a4'; ctx.fillRect(c.x - 7, c.y - 18, 14, 4);
      } else if (c.kind === 'cow') {
        ctx.fillStyle = '#eee'; ctx.fillRect(c.x - 14, c.y - 16, 28, 12);
        ctx.fillStyle = '#222'; ctx.fillRect(c.x - 8, c.y - 14, 4, 4); ctx.fillRect(c.x + 3, c.y - 10, 5, 5);
        ctx.fillStyle = '#eee'; ctx.fillRect(c.x + (c.dir > 0 ? 10 : -18), c.y - 20, 8, 8);
        ctx.fillStyle = '#222'; ctx.fillRect(c.x - 12, c.y - 4, 3, 6); ctx.fillRect(c.x + 9, c.y - 4, 3, 6);
      } else if (c.kind === 'bird') {
        const wing = Math.sin(c.anim) * 6;
        ctx.fillStyle = '#222';
        ctx.fillRect(c.x - 6, c.y - 4, 12, 6);
        ctx.beginPath(); ctx.moveTo(c.x - 6, c.y - 2); ctx.lineTo(c.x - 12, c.y - 2 - wing); ctx.lineTo(c.x - 6, c.y + 2); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(c.x + 6, c.y - 2); ctx.lineTo(c.x + 12, c.y - 2 - wing); ctx.lineTo(c.x + 6, c.y + 2); ctx.closePath(); ctx.fill();
      } else if (c.kind === 'fast') {
        ctx.fillStyle = '#ffd86b';
        ctx.beginPath(); ctx.arc(c.x, c.y, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#222';
        ctx.beginPath(); ctx.arc(c.x + 3, c.y - 1, 2, 0, Math.PI * 2); ctx.fill();
        // dash streaks
        ctx.strokeStyle = '#ffd86b88';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(c.x - c.dir * 12, c.y - 4);
        ctx.lineTo(c.x - c.dir * 22, c.y - 4);
        ctx.stroke();
      } else if (c.kind === 'spiked') {
        ctx.fillStyle = '#ff4466';
        ctx.beginPath(); ctx.arc(c.x, c.y - 8, 10, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#aa2233';
        for (let a = 0; a < 8; a++) {
          const ang = (a / 8) * Math.PI * 2;
          const sx = c.x + Math.cos(ang) * 10, sy = c.y - 8 + Math.sin(ang) * 10;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx + Math.cos(ang) * 6, sy + Math.sin(ang) * 6);
          ctx.lineTo(sx + Math.cos(ang + 0.3) * 3, sy + Math.sin(ang + 0.3) * 3);
          ctx.closePath(); ctx.fill();
        }
      } else if (c.kind === 'fat') {
        ctx.fillStyle = '#88aacc';
        ctx.beginPath(); ctx.ellipse(c.x, c.y - 14, 22, 14, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#aaddee';
        ctx.beginPath(); ctx.ellipse(c.x - 4, c.y - 18, 10, 6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#222';
        ctx.beginPath(); ctx.arc(c.x + (c.dir > 0 ? 14 : -14), c.y - 16, 2, 0, Math.PI * 2); ctx.fill();
      } else if (c.kind === 'glowbug') {
        const pulse = 0.5 + 0.5 * Math.sin(c.anim);
        ctx.save();
        ctx.shadowColor = '#88e8ff'; ctx.shadowBlur = 24 * pulse;
        ctx.fillStyle = '#ffe088';
        ctx.beginPath(); ctx.arc(c.x, c.y, 7, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(c.x, c.y, 3, 0, Math.PI * 2); ctx.fill();
      }
    }

    _renderShop(ctx) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#2a0e12'); g.addColorStop(1, '#050004');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

      ctx.fillStyle = '#ff7744';
      ctx.font = 'bold 40px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText('THE GULLET', W / 2, 50);
      ctx.fillStyle = '#a58abd';
      ctx.font = '14px ui-monospace, monospace';
      ctx.fillText('reach the ABYSS. best: ' + this.save.bestScore + ' pts', W / 2, 96);
      ctx.fillStyle = '#ff7744';
      ctx.font = 'bold 16px ui-monospace, monospace';
      ctx.fillText('Gore: \u25CF ' + Storage.getGameWallet(GID), W / 2, 124);

      this.shopRects = [];
      const startX = 120, startY = 170;
      const cellW = (W - 240 - 20) / 2, cellH = 76;
      for (let i = 0; i < UPGRADES.length; i++) {
        const u = UPGRADES[i];
        const lvl = this.save.upgrades[u.id] || 0;
        const maxed = lvl >= u.max;
        const canAfford = !maxed && Storage.getGameWallet(GID) >= u.cost;
        const col = i % 2, row = (i / 2) | 0;
        const rx = startX + col * (cellW + 20);
        const ry = startY + row * (cellH + 16);
        ctx.fillStyle = maxed ? '#0a1a10' : canAfford ? '#1a140a' : '#140a1a';
        ctx.fillRect(rx, ry, cellW, cellH);
        ctx.strokeStyle = u.color; ctx.lineWidth = 1;
        ctx.strokeRect(rx + 0.5, ry + 0.5, cellW, cellH);
        ctx.fillStyle = u.color;
        ctx.font = 'bold 16px ui-monospace, monospace';
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText(u.label + (u.max > 1 ? ' (' + lvl + '/' + u.max + ')' : ''), rx + 14, ry + 12);
        ctx.fillStyle = '#a58abd';
        ctx.font = '12px ui-monospace, monospace';
        ctx.fillText(u.desc, rx + 14, ry + 36);
        ctx.fillStyle = maxed ? '#66ff88' : canAfford ? '#ffcc33' : '#776655';
        ctx.font = 'bold 14px ui-monospace, monospace';
        ctx.textAlign = 'right';
        ctx.fillText(maxed ? 'OWNED' : '\u25CF ' + u.cost, rx + cellW - 14, ry + 52);
        if (!maxed) this.shopRects.push({ x: rx, y: ry, w: cellW, h: cellH, kind: 'buy', i });
      }

      const cbw = 300, cbh = 52;
      const cbx = W / 2 - cbw / 2, cby = H - 110;
      ctx.fillStyle = '#5a2a14';
      ctx.fillRect(cbx, cby, cbw, cbh);
      ctx.strokeStyle = '#ff7744'; ctx.lineWidth = 2;
      ctx.strokeRect(cbx + 0.5, cby + 0.5, cbw, cbh);
      ctx.fillStyle = '#ffd4bb';
      ctx.font = 'bold 18px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('EMERGE \u2193', W / 2, cby + cbh / 2);
      this.shopRects.push({ x: cbx, y: cby, w: cbw, h: cbh, kind: 'launch' });
    }

    coinsEarned() {
      const cleared = this.biomesClearedThisRun | 0;
      const winBonus = this.victoryAchieved ? 20 : 0;
      return cleared * 6 + winBonus;
    }
  }

  NDP.attachGame('gullet', GulletGame);
})();
