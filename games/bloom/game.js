/* Bloom — biome campaign.
   You are a swarm of particles. Drift through five biomes (Tidepool → Void),
   absorb smaller swarms, dodge larger ones, slay biome bosses, and shop
   permanent upgrades between runs.

   State machine: a single internal `phase` (intro|play|biomeUp|boss|shop|dead).
   The base game stays in `state='playing'` for the whole campaign so the
   engine's overlay only fires on actual death/win.
*/
(function () {
  const NDP = window.NDP;
  const { BaseGame, Input, Sprites, Audio } = NDP.Engine;
  const Storage = NDP.Engine.Storage;

  const W = 960, H = 600;

  // ---------- Biomes ----------
  const BIOMES = [
    { id:'tidepool', name:'TIDEPOOL',     scoreToAdvance: 220,
      bg1:'#06243a', bg2:'#020a14', accent:'#7ae0ff',
      fauna:[{key:'bloom.coral', count:6, ymin: H-110, ymax: H-30, scale: [44,44]}],
      hazards: { spikeRate: 0, sentinelEvery: 999 },
      colors: ['#7ae0ff','#4fc8ff','#a7f0ff'] },
    { id:'coralgarden', name:'CORAL GARDEN', scoreToAdvance: 600,
      bg1:'#2a0a3a', bg2:'#0c0214', accent:'#ff4fd8',
      fauna:[{key:'bloom.coral', count:9, ymin: H-110, ymax: H-30, scale: [54,54]}],
      hazards: { spikeRate: 0.4, sentinelEvery: 18 },
      colors: ['#ff4fd8','#fbbf24','#a78bfa'] },
    { id:'kelpforest', name:'KELP FOREST', scoreToAdvance: 1100,
      bg1:'#0a2814', bg2:'#020a04', accent:'#4ade80',
      fauna:[{key:'bloom.kelp', count:7, ymin: H-180, ymax: H-30, scale: [28,128]}],
      hazards: { spikeRate: 0.8, sentinelEvery: 14 },
      colors: ['#4ade80','#a3e635','#86efac'], boss: 'helio' },
    { id:'trench', name:'THE TRENCH', scoreToAdvance: 1900,
      bg1:'#100614', bg2:'#000004', accent:'#a78bfa',
      fauna:[{key:'bloom.jelly', count:4, ymin: 60, ymax: H-180, scale: [56,56]}],
      hazards: { spikeRate: 1.4, sentinelEvery: 10 },
      colors: ['#a78bfa','#f472b6','#7ae0ff'] },
    { id:'void', name:'THE VOID', scoreToAdvance: Infinity,
      bg1:'#080020', bg2:'#000000', accent:'#fff',
      fauna:[],
      hazards: { spikeRate: 2.0, sentinelEvery: 9 },
      colors: ['#fff','#f472b6','#fbbf24'], boss: 'maw' }
  ];

  // ---------- Default save ----------
  function loadSave() {
    const def = {
      bestScore: 0,
      bestBiome: 0,
      startMass: 40,    // base
      startMassTier: 0, // 0..3 -> +0,+10,+20,+40
      dashTier: 0,      // 0..3 -> 0%, 10%, 20%, 35% off
      magnetTier: 0,    // 0..3 -> 0,40,80,140 baseline radius
      spikeArmorTier: 0,// 0..2 -> 0%, 10%, 25% chance to ignore hit
      bossesBeaten: {}
    };
    return Object.assign(def, Storage.getGameData('bloom') || {});
  }
  function saveData(d) { Storage.setGameData('bloom', d); }

  const SHOP_ITEMS = [
    { id:'startMass', name:'+10 Starting Mass', cost:[60,150,260], tiers:3, key:'startMassTier' },
    { id:'dash',      name:'-10% Dash Cooldown', cost:[80,160,260], tiers:3, key:'dashTier' },
    { id:'magnet',    name:'+Magnet Radius',   cost:[80,180,300], tiers:3, key:'magnetTier' },
    { id:'spike',     name:'Spike Armor',      cost:[140,260], tiers:2, key:'spikeArmorTier' }
  ];

  class BloomGame extends BaseGame {
    init() {
      this.save = loadSave();

      this.phase = 'intro';
      this.biomeIx = 0;
      this.biomeTime = 0;
      this.biomeKills = 0;
      this.spawnTimer = 1.5;
      this.hazardTimer = 4;
      this.sentinelTimer = (BIOMES[0].hazards.sentinelEvery || 9999);
      this.swarms = [];
      this.spikes = [];
      this.motes = [];
      this.powerups = [];
      this.dropTimer = 6;

      this.runCoins = 0;     // earned this run, spendable post-run
      this.bossActive = null;

      // Player buffs from powerups
      this.bloomBuff = 0;     // seconds remaining of +radius
      this.spikeBuff = 0;     // seconds reflect
      this.magnetBuff = 0;    // seconds extra magnet

      // Build player swarm
      this.player = this.makeSwarm(W/2, H/2, this.save.startMass + this.save.startMassTier * 10, '#ff4fd8', true);
      this.swarms.push(this.player);

      // Decoration sprites for current biome
      this.decor = this.buildDecor(BIOMES[0]);

      // Sound
      this.sfx = this.makeSfx({
        absorb:{ freq: 660, type: 'triangle', dur: 0.1, slide: 340, vol: 0.32 },
        hit:   { freq: 220, type: 'sawtooth', dur: 0.08, slide: -80, vol: 0.3 },
        dash:  { freq: 440, type: 'square', dur: 0.08, slide: 240, vol: 0.28 },
        boss:  { freq: 88, type: 'sawtooth', dur: 0.6, vol: 0.5, filter: 'lowpass' },
        biome: { freq: 220, type: 'triangle', dur: 0.4, slide: 880, vol: 0.4 },
        die:   { freq: 90,  type: 'noise', dur: 0.6, vol: 0.5, filter: 'lowpass' },
        pick:  { freq: 880, type: 'triangle', dur: 0.15, slide: 660, vol: 0.36 },
        coin:  { freq: 1100,type: 'triangle', dur: 0.06, slide: 320, vol: 0.22 }
      });

      this.dashCooldownBase = 0.6 * (1 - this.save.dashTier * 0.10);
      this.dashCooldown = 0;

      this.setHud(this._hud());
    }

    onEnd() {
      // Persist best and banked coins (added through engine via score). We
      // also bank biome reached and bosses beaten.
      this.save.bestScore = Math.max(this.save.bestScore, this.score);
      this.save.bestBiome = Math.max(this.save.bestBiome, this.biomeIx);
      saveData(this.save);
    }

    // ----- Spawn / construction -----
    makeSwarm(x, y, count, color, isPlayer) {
      const s = {
        x, y, vx: 0, vy: 0, color,
        isPlayer: !!isPlayer,
        type: isPlayer ? 'player' : 'drifter',
        particles: [],
        targetX: x, targetY: y,
        wanderT: Math.random() * 10,
        hpMod: 1
      };
      for (let i = 0; i < count; i++) {
        s.particles.push({
          ox: (Math.random() - 0.5) * 30,
          oy: (Math.random() - 0.5) * 30,
          vx: (Math.random() - 0.5) * 40,
          vy: (Math.random() - 0.5) * 40
        });
      }
      return s;
    }

    spawnDrifter() {
      const biome = BIOMES[this.biomeIx];
      const side = Math.floor(Math.random() * 4);
      let x, y;
      if (side === 0) { x = -20; y = Math.random() * H; }
      else if (side === 1) { x = W + 20; y = Math.random() * H; }
      else if (side === 2) { x = Math.random() * W; y = -20; }
      else { x = Math.random() * W; y = H + 20; }
      const myCount = this.player.particles.length;
      // Ramp eases in for first 8 s of a biome so the player has room to grow.
      const ease = Math.min(1, this.biomeTime / 8);
      const ramp = 0.4 + ease * 0.8 + this.biomeIx * 0.2;
      const count = Math.max(6, Math.floor(myCount * (0.2 + Math.random() * 1.1) * ramp));
      const color = biome.colors[Math.floor(Math.random() * biome.colors.length)];
      const s = this.makeSwarm(x, y, Math.min(220, count), color, false);
      this.swarms.push(s);
    }

    spawnSentinel() {
      // A large, slow, valuable swarm worth ~1.6× player.
      const x = Math.random() * (W - 200) + 100;
      const y = Math.random() * (H - 200) + 100;
      const count = Math.min(280, Math.floor(this.player.particles.length * 1.6));
      const s = this.makeSwarm(x, y, count, '#ff8fd6', false);
      s.type = 'sentinel';
      s.hpMod = 1.4;
      this.swarms.push(s);
      this.flash('#ff8fd6', 0.06);
    }

    spawnSpike() {
      this.spikes.push({
        x: Math.random() * W, y: -30,
        vx: (Math.random() - 0.5) * 40,
        vy: 60 + Math.random() * 80,
        r: 16, age: 0, life: 14
      });
    }

    spawnMote(x, y) {
      this.motes.push({ x, y, vx: 0, vy: 0, age: 0, life: 14, r: 8, value: 1 });
    }

    spawnPowerup(x, y) {
      const types = ['bloom','magnet','spike'];
      const t = types[Math.floor(Math.random() * types.length)];
      this.powerups.push({ x, y, vx: 0, vy: 0, type: t, age: 0, life: 16, r: 14 });
    }

    buildDecor(biome) {
      const d = [];
      biome.fauna.forEach(f => {
        for (let i = 0; i < f.count; i++) {
          d.push({
            key: f.key,
            x: 60 + Math.random() * (W - 120),
            y: f.ymin + Math.random() * (f.ymax - f.ymin),
            w: f.scale[0] * (0.8 + Math.random() * 0.5),
            h: f.scale[1] * (0.8 + Math.random() * 0.5),
            sway: Math.random() * Math.PI * 2
          });
        }
      });
      return d;
    }

    radius(s) {
      const r = Math.sqrt(s.particles.length) * 3.2 + 8;
      if (s.isPlayer && this.bloomBuff > 0) return r * 1.5;
      return r;
    }

    // ----- Per-frame -----
    update(dt) {
      if (this.phase === 'intro') {
        if (Input.mouse.justPressed) {
          this.phase = 'play';
          // Eat the click so the intro transition doesn't immediately dash.
          Input.mouse.justPressed = false;
        }
        return;
      }
      if (this.phase === 'shop' || this.phase === 'dead') {
        this.handleMenuClick();
        return;
      }
      if (this.phase === 'biomeUp') {
        this.intermissionT = (this.intermissionT || 0) + dt;
        if (this.intermissionT > 2.4 || Input.mouse.justPressed) {
          this.intermissionT = 0;
          this.phase = 'play';
        }
        return;
      }

      const biome = BIOMES[this.biomeIx];
      this.biomeTime += dt;

      // Buffs decay
      this.bloomBuff = Math.max(0, this.bloomBuff - dt);
      this.spikeBuff = Math.max(0, this.spikeBuff - dt);
      this.magnetBuff = Math.max(0, this.magnetBuff - dt);
      this.dashCooldown = Math.max(0, this.dashCooldown - dt);

      // Player follow mouse
      this.player.targetX = Input.mouse.x;
      this.player.targetY = Input.mouse.y;

      // Dash
      if (Input.mouse.justPressed && this.dashCooldown <= 0 && this.player.particles.length > 12) {
        const dx = this.player.targetX - this.player.x;
        const dy = this.player.targetY - this.player.y;
        const L = Math.hypot(dx, dy) || 1;
        this.player.vx += dx / L * 520;
        this.player.vy += dy / L * 520;
        for (let i = 0; i < 8 && this.player.particles.length > 12; i++) {
          this.player.particles.pop();
          this.particles.emit({
            x: this.player.x + (Math.random()-0.5)*20,
            y: this.player.y + (Math.random()-0.5)*20,
            vx: -dx/L*300, vy: -dy/L*300, life: 0.5, size: 2, color: this.player.color
          });
        }
        this.dashCooldown = this.dashCooldownBase;
        this.sfx.play('dash');
      }

      // Spawn drifters — gentle ramp so the first 6 seconds aren't a wall of bigger swarms.
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && this.swarms.length < 18 && !this.bossActive) {
        this.spawnDrifter();
        const ramp = Math.min(1, this.biomeTime / 6); // 0..1 over first 6s
        this.spawnTimer = Math.max(1.0, (3.6 - ramp * 1.4) - this.biomeIx * 0.15 - this.biomeTime * 0.008);
      }

      // Hazards
      if (biome.hazards.spikeRate > 0 && !this.bossActive) {
        this.hazardTimer -= dt * biome.hazards.spikeRate;
        if (this.hazardTimer <= 0) {
          this.spawnSpike();
          this.hazardTimer = 4 + Math.random() * 3;
        }
      }

      // Sentinels
      if (biome.hazards.sentinelEvery < 999 && !this.bossActive) {
        this.sentinelTimer -= dt;
        if (this.sentinelTimer <= 0) {
          this.spawnSentinel();
          this.sentinelTimer = biome.hazards.sentinelEvery;
        }
      }

      // Powerup drop occasionally
      this.dropTimer -= dt;
      if (this.dropTimer <= 0) {
        this.spawnPowerup(80 + Math.random() * (W - 160), 80 + Math.random() * (H - 160));
        this.dropTimer = 9 + Math.random() * 6;
      }

      // Move swarms
      this.updateSwarms(dt);

      // Spikes
      for (const sp of this.spikes) {
        sp.age += dt;
        sp.x += sp.vx * dt;
        sp.y += sp.vy * dt;
        if (Math.hypot(sp.x - this.player.x, sp.y - this.player.y) < this.radius(this.player) + sp.r) {
          if (this.spikeBuff > 0 || (Math.random() < this.save.spikeArmorTier * 0.125)) {
            sp.age = sp.life; // pass through
            this.particles.burst(sp.x, sp.y, 10, { color: '#fbbf24', speed: 200, life: 0.4 });
          } else {
            this.takeHit(8 + this.biomeIx * 2);
            sp.age = sp.life;
            this.shake(8, 0.25);
            this.flash('#f87171', 0.12);
          }
        }
      }
      this.spikes = this.spikes.filter(sp => sp.age < sp.life && sp.y < H + 60);

      // Motes pulled by magnet
      const magR = (60 + this.save.magnetTier * 40) + (this.magnetBuff > 0 ? 220 : 0);
      for (const m of this.motes) {
        m.age += dt;
        const dx = this.player.x - m.x, dy = this.player.y - m.y;
        const d = Math.hypot(dx, dy);
        if (d < magR) {
          m.vx += dx / d * 240 * dt;
          m.vy += dy / d * 240 * dt;
        }
        m.x += m.vx * dt; m.y += m.vy * dt;
        m.vx *= 0.92; m.vy *= 0.92;
        if (d < this.radius(this.player) + m.r) {
          this.runCoins += m.value;
          this.addScore(8);
          this.sfx.play('coin', { freq: 1000 + this.runCoins * 8 });
          this.particles.burst(m.x, m.y, 6, { color: '#7ae0ff', speed: 180, life: 0.4 });
          m.age = m.life;
        }
      }
      this.motes = this.motes.filter(m => m.age < m.life);

      // Powerups
      for (const p of this.powerups) {
        p.age += dt;
        p.y += Math.sin(p.age * 2) * 6 * dt;
        if (Math.hypot(p.x - this.player.x, p.y - this.player.y) < this.radius(this.player) + p.r) {
          this.applyPowerup(p.type, p.x, p.y);
          p.age = p.life;
        }
      }
      this.powerups = this.powerups.filter(p => p.age < p.life);

      // Boss spawn at biome start (ones that have boss key)
      if (!this.bossActive && biome.boss && this.biomeKills >= 3 && !this.save.bossesBeaten[biome.boss + this.biomeIx]) {
        this.spawnBoss(biome.boss);
      }

      // Biome advance
      if (this.score >= biome.scoreToAdvance && !this.bossActive) {
        if (this.biomeIx < BIOMES.length - 1) {
          this.advanceBiome();
        }
      }

      this.setHud(this._hud());
    }

    updateSwarms(dt) {
      for (const s of this.swarms) {
        if (s.isPlayer) {
          const dx = s.targetX - s.x, dy = s.targetY - s.y;
          s.vx += dx * 3 * dt;
          s.vy += dy * 3 * dt;
          s.vx *= (1 - 3 * dt);
          s.vy *= (1 - 3 * dt);
        } else if (s.type === 'boss') {
          this.updateBoss(s, dt);
        } else if (s.type === 'sentinel') {
          // Drifts slowly toward player
          const dx = this.player.x - s.x, dy = this.player.y - s.y;
          const L = Math.hypot(dx, dy) || 1;
          s.vx += (dx / L) * 30 * dt;
          s.vy += (dy / L) * 30 * dt;
          s.vx *= 0.97; s.vy *= 0.97;
        } else {
          // wander/chase
          s.wanderT += dt;
          const targetDx = Math.cos(s.wanderT * 0.7) * 200;
          const targetDy = Math.sin(s.wanderT * 0.5) * 200;
          if (s.particles.length > this.player.particles.length) {
            s.vx += (this.player.x - s.x) * 0.4 * dt;
            s.vy += (this.player.y - s.y) * 0.4 * dt;
          } else {
            s.vx += targetDx * 0.2 * dt;
            s.vy += targetDy * 0.2 * dt;
          }
          s.vx *= (1 - 1.2 * dt);
          s.vy *= (1 - 1.2 * dt);
        }
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        const r = this.radius(s);
        if (s.x < r) { s.x = r; s.vx = Math.abs(s.vx); }
        if (s.x > W - r) { s.x = W - r; s.vx = -Math.abs(s.vx); }
        if (s.y < r) { s.y = r; s.vy = Math.abs(s.vy); }
        if (s.y > H - r) { s.y = H - r; s.vy = -Math.abs(s.vy); }
        for (const p of s.particles) {
          p.vx += (Math.random() - 0.5) * 120 * dt;
          p.vy += (Math.random() - 0.5) * 120 * dt;
          p.vx -= p.ox * 3 * dt;
          p.vy -= p.oy * 3 * dt;
          p.vx *= 0.9; p.vy *= 0.9;
          p.ox += p.vx * dt;
          p.oy += p.vy * dt;
        }
      }

      // Collisions
      for (let i = this.swarms.length - 1; i >= 0; i--) {
        const o = this.swarms[i];
        if (o === this.player) continue;
        const dx = this.player.x - o.x, dy = this.player.y - o.y;
        const d = Math.hypot(dx, dy);
        const pr = this.radius(this.player), or = this.radius(o);
        if (d < pr + or - 4) {
          if (this.player.particles.length > o.particles.length * (o.hpMod || 1) * 1.05) {
            const gained = Math.min(o.particles.length, o.type === 'sentinel' ? 8 : 4);
            for (let k = 0; k < gained; k++) {
              this.player.particles.push({
                ox: o.x - this.player.x + (Math.random()-0.5)*20,
                oy: o.y - this.player.y + (Math.random()-0.5)*20,
                vx: 0, vy: 0
              });
              o.particles.pop();
              if (o.particles.length === 0) break;
            }
            this.addScore(o.type === 'sentinel' ? 14 : (o.type === 'boss' ? 22 : 5) * gained);
            this.biomeKills += 0.05 * gained;
            if (Math.random() < 0.3) this.sfx.play('absorb', { freq: 600 + this.player.particles.length });
            // Drop motes occasionally
            if (Math.random() < 0.18) this.spawnMote(o.x + (Math.random()-0.5)*20, o.y + (Math.random()-0.5)*20);
            if (o.particles.length === 0) {
              this.swarms.splice(i, 1);
              this.flash(o.color, 0.05);
              this.particles.burst(o.x, o.y, o.type === 'boss' ? 60 : 16, { color: o.color, speed: o.type === 'boss' ? 320 : 180, life: o.type === 'boss' ? 1.0 : 0.5 });
              if (o.type === 'boss') this.onBossKilled(o);
              this.spawnMote(o.x, o.y);
              if (o.type === 'sentinel') {
                for (let k = 0; k < 5; k++) this.spawnMote(o.x + (Math.random()-0.5)*40, o.y + (Math.random()-0.5)*40);
              }
            }
          } else if (o.particles.length > this.player.particles.length * 1.05) {
            // bitten back
            const lost = Math.min(this.player.particles.length, 3);
            for (let k = 0; k < lost; k++) {
              if (this.player.particles.length > 1) this.player.particles.pop();
              o.particles.push({ ox: 0, oy: 0, vx: 0, vy: 0 });
            }
            if (this.spikeBuff > 0) {
              // reflect: damage them too
              for (let k = 0; k < 6 && o.particles.length > 0; k++) {
                o.particles.pop();
                this.particles.emit({ x: o.x, y: o.y, vx: (Math.random()-0.5)*200, vy: (Math.random()-0.5)*200, life:0.4, color:'#fbbf24', size: 2 });
              }
            }
            this.sfx.play('hit');
            this.shake(4, 0.12);
            if (this.player.particles.length <= 1) { this.die(); return; }
          }
        }
      }
    }

    spawnBoss(kind) {
      this.bossActive = kind;
      let s;
      if (kind === 'helio') {
        s = this.makeSwarm(W/2, 180, 360, '#ffd86b', false);
        s.type = 'boss';
        s.kind = 'helio';
        s.hp = 360;
        s.maxHp = 360;
        s.ringT = 0;
        s.ringInterval = 5.0;
      } else {
        s = this.makeSwarm(W/2, H/2, 480, '#ff4f7a', false);
        s.type = 'boss';
        s.kind = 'maw';
        s.hp = 480;
        s.maxHp = 480;
        s.split = false;
        s.children = [];
        s.spikeT = 0;
      }
      s.spriteKey = (kind === 'helio') ? 'bloom.helio' : 'bloom.maw';
      s.spriteSize = 180;
      s.boss = true;
      this.swarms.push(s);
      this.sfx.play('boss');
      this.flash('#fff', 0.18);
      this.shake(12, 0.5);
    }

    updateBoss(s, dt) {
      // Hp tracks particles count; particles lost = damage taken.
      s.hp = s.particles.length;
      if (s.kind === 'helio') {
        s.x = W/2 + Math.sin(this.biomeTime * 0.6) * 220;
        s.y = 180 + Math.cos(this.biomeTime * 0.4) * 80;
        s.ringT -= dt;
        if (s.ringT <= 0) {
          s.ringT = Math.max(2, s.ringInterval - this.biomeTime * 0.05);
          // Emit spike ring
          const n = 14;
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2;
            this.spikes.push({
              x: s.x, y: s.y,
              vx: Math.cos(a) * 140, vy: Math.sin(a) * 140,
              r: 12, age: 0, life: 6
            });
          }
        }
      } else if (s.kind === 'maw') {
        // Pursue, when below 50% HP, split into 2 maws
        const dx = this.player.x - s.x, dy = this.player.y - s.y;
        const L = Math.hypot(dx, dy) || 1;
        const speed = s.split ? 60 : 40;
        s.vx += (dx/L) * speed * dt;
        s.vy += (dy/L) * speed * dt;
        s.vx *= 0.96; s.vy *= 0.96;
        s.spikeT -= dt;
        if (s.spikeT <= 0) {
          s.spikeT = 3.5;
          for (let i = 0; i < 4; i++) {
            const a = Math.atan2(this.player.y - s.y, this.player.x - s.x) + (Math.random()-0.5)*0.6;
            this.spikes.push({ x: s.x, y: s.y, vx: Math.cos(a)*200, vy: Math.sin(a)*200, r:14, age:0, life: 6 });
          }
        }
        if (!s.split && s.hp < s.maxHp * 0.5) {
          s.split = true;
          // create a child maw
          const child = this.makeSwarm(s.x + 60, s.y - 40, Math.floor(s.hp * 0.4), '#ff7fbf', false);
          child.type = 'boss'; child.kind = 'maw'; child.boss = true;
          child.spriteKey = 'bloom.maw'; child.spriteSize = 110;
          child.maxHp = child.particles.length; child.hp = child.maxHp;
          child.spikeT = 2;
          child.split = true; // don't split again
          this.swarms.push(child);
          this.flash('#ff4f7a', 0.18);
          this.shake(14, 0.4);
        }
      }
    }

    onBossKilled(s) {
      this.save.bossesBeaten[s.kind + this.biomeIx] = true;
      this.bossActive = null;
      this.runCoins += 30;
      this.addScore(400);
      this.flash('#fff', 0.4);
      this.shake(20, 0.6);
      // Drop loot rain
      for (let i = 0; i < 18; i++) this.spawnMote(s.x + (Math.random()-0.5)*120, s.y + (Math.random()-0.5)*60);
      // Auto-advance after a beat
      this.intermissionT = 0;
      this.phase = 'biomeUp';
      if (this.biomeIx < BIOMES.length - 1) this.advanceBiome();
    }

    advanceBiome() {
      this.biomeIx++;
      const b = BIOMES[this.biomeIx];
      this.biomeTime = 0;
      this.biomeKills = 0;
      this.spikes = [];
      this.swarms = this.swarms.filter(s => s.isPlayer || s.type === 'boss');
      this.decor = this.buildDecor(b);
      this.sentinelTimer = b.hazards.sentinelEvery || 9999;
      this.hazardTimer = 4;
      this.intermissionT = 0;
      this.phase = 'biomeUp';
      this.sfx.play('biome');
      this.flash(b.accent, 0.3);
    }

    applyPowerup(t, x, y) {
      this.sfx.play('pick');
      this.flash('#ffd86b', 0.06);
      this.particles.burst(x, y, 16, { color: '#ffd86b', speed: 220, life: 0.6 });
      if (t === 'bloom') this.bloomBuff = 6;
      else if (t === 'magnet') this.magnetBuff = 8;
      else if (t === 'spike') this.spikeBuff = 6;
    }

    takeHit(dmg) {
      // Lose `dmg` particles as damage.
      for (let k = 0; k < dmg && this.player.particles.length > 1; k++) this.player.particles.pop();
      this.sfx.play('hit');
      if (this.player.particles.length <= 1) this.die();
    }

    die() {
      this.sfx.play('die');
      this.shake(14, 0.6);
      this.flash('#f87171', 0.3);
      this.particles.burst(this.player.x, this.player.y, 80, { color: this.player.color, speed: 320, life: 1.0 });
      // Grant coins for the run
      this.save.bestScore = Math.max(this.save.bestScore, this.score);
      this.save.bestBiome = Math.max(this.save.bestBiome, this.biomeIx);
      saveData(this.save);
      this.phase = 'shop';
    }

    // ----- Menus -----
    handleMenuClick() {
      if (!Input.mouse.justPressed) return;
      const mx = Input.mouse.x, my = Input.mouse.y;
      // Shop card layout: 4 items in a row at y=300, w=200 h=120, gap 30, centered.
      const totalW = SHOP_ITEMS.length * 200 + (SHOP_ITEMS.length - 1) * 30;
      const x0 = (W - totalW) / 2;
      for (let i = 0; i < SHOP_ITEMS.length; i++) {
        const x = x0 + i * 230, y = 300;
        if (mx >= x && mx <= x + 200 && my >= y && my <= y + 140) {
          this.tryBuy(SHOP_ITEMS[i]);
          return;
        }
      }
      // Continue button
      const cx = W/2 - 90, cy = 480;
      if (mx >= cx && mx <= cx + 180 && my >= cy && my <= cy + 50) {
        // commit run coins as score-derived coins above the engine's payout
        Storage.addCoins(this.runCoins);
        this.runCoins = 0;
        this.gameOver();
      }
    }

    tryBuy(item) {
      const tier = this.save[item.key] || 0;
      if (tier >= item.tiers) return;
      const cost = item.cost[tier];
      if (this.runCoins < cost) {
        this.flash('#f87171', 0.1);
        return;
      }
      this.runCoins -= cost;
      this.save[item.key] = tier + 1;
      saveData(this.save);
      this.sfx.play('coin');
      this.flash('#4ade80', 0.1);
    }

    _hud() {
      const b = BIOMES[this.biomeIx];
      const buffs = [];
      if (this.bloomBuff > 0) buffs.push('<b style="color:#ff4fd8">BLOOM</b>');
      if (this.magnetBuff > 0) buffs.push('<b style="color:#7ae0ff">MAGNET</b>');
      if (this.spikeBuff > 0) buffs.push('<b style="color:#fbbf24">ARMOR</b>');
      const buffStr = buffs.length ? `<span>${buffs.join(' ')}</span>` : '';
      const goal = b.scoreToAdvance === Infinity ? '∞' : b.scoreToAdvance;
      return `<span>${b.name}</span><span>Mass <b>${this.player.particles.length}</b></span>` +
             `<span>Goal <b>${this.score}/${goal}</b></span>` +
             `<span>Motes <b>${this.runCoins}</b></span>${buffStr}`;
    }

    // ----- Render -----
    render(ctx) {
      const b = BIOMES[this.biomeIx];
      const g = ctx.createRadialGradient(W/2, H/2, 20, W/2, H/2, Math.max(W, H)/1.0);
      g.addColorStop(0, b.bg1); g.addColorStop(1, b.bg2);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

      // Star/dust drift
      ctx.fillStyle = '#ffffff10';
      for (let i = 0; i < 100; i++) {
        const x = (i * 97 + (this.time * 10 % 200)) % W;
        const y = (i * 47) % H;
        ctx.fillRect(x, y, 1, 1);
      }

      // Decor sprites (kelp/coral/jelly etc.)
      for (const d of this.decor) {
        const sway = Math.sin(this.time * 1.2 + d.sway) * 6;
        Sprites.draw(ctx, d.key, d.x + sway, d.y, d.w, d.h);
      }

      // Magnet ring (visualize when buffed)
      if (this.magnetBuff > 0 || this.save.magnetTier > 0) {
        const r = (60 + this.save.magnetTier * 40) + (this.magnetBuff > 0 ? 220 : 0);
        ctx.strokeStyle = `rgba(122, 224, 255, ${this.magnetBuff > 0 ? 0.25 : 0.07})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 8]);
        ctx.beginPath(); ctx.arc(this.player.x, this.player.y, r, 0, Math.PI*2); ctx.stroke();
        ctx.setLineDash([]);
      }

      // Spikes
      for (const sp of this.spikes) {
        Sprites.draw(ctx, 'bloom.spike', sp.x, sp.y, sp.r * 2.6, sp.r * 2.6, { rot: sp.age * 3 });
      }

      // Motes
      for (const m of this.motes) {
        Sprites.draw(ctx, 'bloom.mote', m.x, m.y, 18, 18);
      }

      // Powerups
      for (const p of this.powerups) {
        const sk = 'bloom.chip_' + p.type;
        Sprites.draw(ctx, sk, p.x, p.y + Math.sin(this.time*4 + p.x) * 4, 36, 36, { rot: this.time * 0.6 });
      }

      // Swarms (enemies under, player on top)
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const s of this.swarms) {
        if (s.isPlayer) continue;
        if (s.boss) {
          // boss sprite + swarm halo
          ctx.globalCompositeOperation = 'source-over';
          Sprites.draw(ctx, s.spriteKey, s.x, s.y, s.spriteSize, s.spriteSize, { rot: this.time * 0.4 });
          ctx.globalCompositeOperation = 'lighter';
        }
        this.drawSwarm(ctx, s);
      }
      this.drawSwarm(ctx, this.player);
      ctx.restore();

      // Boss HP bar
      const boss = this.swarms.find(s => s.boss);
      if (boss) {
        const w = 480, x = (W - w)/2, y = 32;
        ctx.fillStyle = '#0008'; ctx.fillRect(x, y, w, 14);
        ctx.fillStyle = boss.kind === 'helio' ? '#ffd86b' : '#ff4f7a';
        ctx.fillRect(x, y, w * Math.max(0, boss.hp / boss.maxHp), 14);
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4; ctx.strokeRect(x, y, w, 14);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 12px ui-monospace, monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(boss.kind === 'helio' ? 'HELIO — STAR WARDEN' : 'THE MAW', W/2, y + 7);
      }

      // Dash cooldown ring
      if (this.dashCooldown > 0) {
        ctx.strokeStyle = '#ffffff44';
        ctx.lineWidth = 3;
        const r = this.radius(this.player) + 14;
        ctx.beginPath();
        ctx.arc(this.player.x, this.player.y, r, -Math.PI/2, -Math.PI/2 + (1 - this.dashCooldown/this.dashCooldownBase) * Math.PI * 2);
        ctx.stroke();
      }

      // Phase overlays
      if (this.phase === 'intro') this.drawIntroOverlay(ctx);
      if (this.phase === 'biomeUp') this.drawBiomeBanner(ctx, b);
      if (this.phase === 'shop' || this.phase === 'dead') this.drawShop(ctx);
    }

    drawSwarm(ctx, s) {
      ctx.fillStyle = s.color + 'bb';
      const pr = 3;
      for (const p of s.particles) {
        ctx.beginPath();
        ctx.arc(s.x + p.ox, s.y + p.oy, pr, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = s.color + '22';
      ctx.beginPath(); ctx.arc(s.x, s.y, this.radius(s) * 0.6, 0, Math.PI * 2); ctx.fill();
    }

    drawIntroOverlay(ctx) {
      ctx.fillStyle = '#000a';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#ff4fd8';
      ctx.font = 'bold 48px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('BLOOM', W/2, H/2 - 80);
      ctx.fillStyle = '#fff';
      ctx.font = '18px ui-monospace, monospace';
      ctx.fillText('5 biomes  ·  2 bosses  ·  drift, devour, dominate', W/2, H/2 - 30);
      ctx.fillText('Mouse to steer  ·  Click to dash  ·  Collect motes for upgrades', W/2, H/2 + 4);
      const best = this.save.bestScore | 0;
      const bb = BIOMES[this.save.bestBiome]?.name || '—';
      ctx.fillStyle = '#7ae0ff';
      ctx.fillText(`Best: ${best}    ·    Furthest biome: ${bb}`, W/2, H/2 + 40);
      ctx.fillStyle = '#ffd86b';
      ctx.font = 'bold 22px ui-monospace, monospace';
      const blink = Math.floor(this.time * 2) % 2 === 0;
      if (blink) ctx.fillText('CLICK TO BEGIN', W/2, H/2 + 90);
    }

    drawBiomeBanner(ctx, b) {
      ctx.fillStyle = b.bg2 + 'cc';
      ctx.fillRect(0, H/2 - 70, W, 140);
      ctx.fillStyle = b.accent;
      ctx.font = 'bold 56px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = b.accent; ctx.shadowBlur = 24;
      ctx.fillText('BIOME ' + (this.biomeIx + 1) + ': ' + b.name, W/2, H/2);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff';
      ctx.font = '16px ui-monospace, monospace';
      ctx.fillText('Goal: ' + (b.scoreToAdvance === Infinity ? 'survive endlessly' : 'reach ' + b.scoreToAdvance + ' pts'), W/2, H/2 + 36);
    }

    drawShop(ctx) {
      ctx.fillStyle = '#000d'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#ff4fd8';
      ctx.font = 'bold 36px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('REEF SHOP', W/2, 90);
      ctx.fillStyle = '#fff';
      ctx.font = '18px ui-monospace, monospace';
      ctx.fillText(`Score ${this.score}  ·  Best biome: ${BIOMES[this.biomeIx].name}`, W/2, 130);
      ctx.fillStyle = '#7ae0ff';
      ctx.fillText(`Motes earned: ${this.runCoins}`, W/2, 160);
      ctx.fillStyle = '#fbbf24';
      ctx.fillText('Spend motes for permanent upgrades:', W/2, 200);

      const totalW = SHOP_ITEMS.length * 200 + (SHOP_ITEMS.length - 1) * 30;
      const x0 = (W - totalW) / 2;
      for (let i = 0; i < SHOP_ITEMS.length; i++) {
        const it = SHOP_ITEMS[i];
        const x = x0 + i * 230, y = 300;
        const tier = this.save[it.key] || 0;
        const maxed = tier >= it.tiers;
        const cost = maxed ? '—' : it.cost[tier];
        ctx.fillStyle = maxed ? '#0a3a14' : (this.runCoins >= it.cost[tier] ? '#1a0028' : '#1a0014');
        ctx.fillRect(x, y, 200, 140);
        ctx.strokeStyle = maxed ? '#4ade80' : '#ff4fd8';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, 200, 140);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(it.name, x + 100, y + 30);
        ctx.font = '12px ui-monospace, monospace';
        ctx.fillStyle = '#7ae0ff';
        ctx.fillText('Tier ' + tier + '/' + it.tiers, x + 100, y + 56);
        // Pip
        for (let p = 0; p < it.tiers; p++) {
          ctx.fillStyle = p < tier ? '#4ade80' : '#3a1a4a';
          ctx.fillRect(x + 50 + p * 24, y + 70, 18, 8);
        }
        ctx.fillStyle = maxed ? '#4ade80' : '#ffd86b';
        ctx.font = 'bold 18px ui-monospace, monospace';
        ctx.fillText(maxed ? 'MAX' : (cost + ' motes'), x + 100, y + 110);
      }

      // Continue button
      const cx = W/2 - 90, cy = 480;
      ctx.fillStyle = '#4ade80';
      ctx.fillRect(cx, cy, 180, 50);
      ctx.fillStyle = '#000';
      ctx.font = 'bold 18px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('FINISH RUN', cx + 90, cy + 25);
    }

    coinsEarned(score) {
      // Engine still adds coin payout from score; but we already banked motes
      // when the player left the shop. Keep a small base from score so the
      // global coin currency still ticks.
      return Math.max(0, Math.floor(score / 80));
    }
  }

  NDP.attachGame('bloom', BloomGame);
})();
