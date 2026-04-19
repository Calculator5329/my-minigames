/* Skybound — climb through altitude biomes. Hazards vary by zone.
   Permanent upgrades purchased pre-run via the global coin pool. */
(function () {
  const NDP = window.NDP;
  const { BaseGame, Input, Storage } = NDP.Engine;

  const W = 960, H = 600;
  const GRAV = 720;
  const BASE_THRUST = 1500;
  const MAX_FALL = 720;
  const CAMERA_DEATH_OFFSET = 60;

  const BIOMES = [
    { from: 0,    to: 600,  name: 'MEADOW',       topCol: '#ffcfa0', botCol: '#7fbddd', hazards: ['bird'] },
    { from: 600,  to: 1200, name: 'STORM',        topCol: '#6a6e8c', botCol: '#3a3c5e', hazards: ['bird','bolt'] },
    { from: 1200, to: 1800, name: 'STRATOSPHERE', topCol: '#2a3360', botCol: '#12224a', hazards: ['jet'] },
    { from: 1800, to: 2500, name: 'VOID',         topCol: '#08082a', botCol: '#050518', hazards: ['debris','debris'] }
  ];

  const UPGRADES = [
    { id: 'tank',   label: 'Larger Fuel Tank', desc: '+20% burn time per tier', cost: 120, max: 3, color: '#ffd86b' },
    { id: 'boost',  label: 'Tuned Thrusters',  desc: '+8% thrust per tier',     cost: 160, max: 3, color: '#4fc8ff' },
    { id: 'shield', label: 'Start Shield',     desc: 'Begin with 1 shield',     cost: 180, max: 1, color: '#88e8ff' },
    { id: 'dj',     label: 'Pulse Jump',       desc: 'SHIFT: one free boost',   cost: 220, max: 1, color: '#ff4fd8' }
  ];

  class SkyboundGame extends BaseGame {
    init() {
      const d = Storage.getGameData('skybound') || {};
      this.save = {
        bestAltitude: d.bestAltitude || 0,
        upgrades:     Object.assign({ tank:0, boost:0, shield:0, dj:0 }, d.upgrades || {})
      };

      this.phase = 'shop';  // 'shop' | 'flight' | 'victory'
      this.shopRects = [];
      this.launchedT = 0;

      this.player = { x: W / 2, y: 0, vx: 0, vy: 0, r: 14 };
      this.fuelMax = 1.0 + this.save.upgrades.tank * 0.2;
      this.fuel = this.fuelMax;
      this.shields = this.save.upgrades.shield;
      this.djReady = !!this.save.upgrades.dj;
      this.slowmoT = 0;
      this.cameraY = -H * 0.4;
      this.cameraCreep = 0;
      this.worldObjects = [];
      this.nextSpawnY = -40;
      this.highestY = 0;

      this.sfx = this.makeSfx({
        thrust: { freq: 140, type: 'sawtooth', dur: 0.04, vol: 0.18 },
        pickup: { freq: 880, type: 'triangle', dur: 0.1, slide: 440, vol: 0.4 },
        boost:  { freq: 440, type: 'square', dur: 0.14, slide: 720, vol: 0.5 },
        hit:    { freq: 120, type: 'noise', dur: 0.18, vol: 0.5, filter: 'lowpass' },
        cloud:  { freq: 500, type: 'triangle', dur: 0.08, slide: 300, vol: 0.3 },
        buy:    { freq: 1100,type: 'square',   dur: 0.1,  vol: 0.4 },
        biome:  { freq: 660, type: 'triangle', dur: 0.3,  slide: 220, vol: 0.5 }
      });
      this.trailTimer = 0;
      this.currentBiome = 0;

      for (let i = 0; i < 4; i++) {
        this.worldObjects.push({ type: 'cloud', x: 120 + i * 180, y: 80 + (i%2)*40, r: 30 });
      }
      this.setHud(this._hud());
    }

    _writeSave(won) {
      const best = Math.max(this.save.bestAltitude, Math.floor(Math.abs(this.highestY)));
      Storage.setGameData('skybound', {
        bestAltitude: best,
        upgrades: this.save.upgrades
      });
      this.save.bestAltitude = best;
    }

    worldToScreen(wy) { return wy - this.cameraY; }
    _biomeFor(alt) {
      for (let i = BIOMES.length - 1; i >= 0; i--) if (alt >= BIOMES[i].from) return i;
      return 0;
    }

    update(dt) {
      if (this.phase === 'shop') { this._updateShop(dt); return; }
      if (this.phase === 'victory') { this.setHud(this._hud()); return; }

      if (this.slowmoT > 0) { this.slowmoT -= dt; dt *= 0.45; }

      const p = this.player;
      const left  = Input.keys['a'] || Input.keys['A'] || Input.keys['ArrowLeft'];
      const right = Input.keys['d'] || Input.keys['D'] || Input.keys['ArrowRight'];
      const thrust = Input.keys[' '] || Input.keys['Space'] || Input.keys['w'] || Input.keys['W'] || Input.keys['ArrowUp'];
      const shift = Input.keys['Shift'];

      if (left)  p.vx -= 1400 * dt;
      if (right) p.vx += 1400 * dt;
      p.vx *= Math.pow(0.01, dt);
      p.vx = Math.max(-520, Math.min(520, p.vx));

      const thrustStrength = BASE_THRUST * (1 + this.save.upgrades.boost * 0.08);
      if (thrust && this.fuel > 0) {
        p.vy -= thrustStrength * dt;
        this.fuel = Math.max(0, this.fuel - dt * 0.28);
        this.trailTimer += dt;
        if (this.trailTimer > 0.03) {
          this.trailTimer = 0;
          this.particles.emit({
            x: p.x + (Math.random()-0.5)*6,
            y: p.y + 20,
            vx: (Math.random()-0.5)*40, vy: 180 + Math.random()*80,
            life: 0.4, size: 4,
            color: Math.random()<0.5 ? '#ff9966' : '#ffd86b'
          });
          if (Math.random() < 0.2) this.sfx.play('thrust');
        }
      }
      // Pulse jump (DJ)
      if (shift && this.djReady) {
        this.djReady = false;
        p.vy = -900;
        this.sfx.play('boost');
        this.particles.burst(p.x, p.y, 22, { color: '#ff4fd8', speed: 260, life: 0.5 });
      }

      p.vy += GRAV * dt;
      p.vy = Math.min(MAX_FALL, p.vy);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.x < -20) p.x = W + 20;
      if (p.x > W + 20) p.x = -20;
      if (p.y < this.highestY) this.highestY = p.y;

      const altitude = Math.abs(this.highestY);
      const bIdx = this._biomeFor(altitude);
      if (bIdx !== this.currentBiome) {
        this.currentBiome = bIdx;
        this.sfx.play('biome');
        this.flash(BIOMES[bIdx].topCol, 0.2);
      }

      const creepRate = 20 + Math.min(70, altitude * 0.03);
      this.cameraCreep += creepRate * dt;
      this.cameraY = this.cameraY - this.cameraCreep;
      this.cameraCreep = 0;
      if (p.y - H * 0.55 < this.cameraY) this.cameraY = p.y - H * 0.55;

      const spawnCeiling = this.cameraY - 120;
      while (this.nextSpawnY > spawnCeiling) {
        this.nextSpawnY -= 46 + Math.random() * 36;
        this.spawnAt(this.nextSpawnY);
      }

      for (const o of this.worldObjects) {
        if (o.type === 'bird' || o.type === 'jet') {
          o.x += o.vx * dt;
          if (o.x < -40) o.vx = Math.abs(o.vx);
          if (o.x > W + 40) o.vx = -Math.abs(o.vx);
          o.anim = (o.anim || 0) + dt * 8;
        } else if (o.type === 'bolt') {
          o.t = (o.t || 0) + dt;
        }
      }

      for (const o of this.worldObjects) {
        if (o.collected) continue;
        const dx = p.x - o.x, dy = p.y - o.y;
        const d = Math.hypot(dx, dy);
        if (d >= p.r + o.r) continue;

        if (o.type === 'cloud') {
          if (p.vy > 0) {
            p.vy = -560;
            this.fuel = Math.min(this.fuelMax, this.fuel + 0.06);
            this.sfx.play('cloud');
            this.particles.burst(o.x, o.y, 8, { color: '#ffffff', speed: 100, life: 0.4 });
            this.shake(2, 0.1);
            o.wobble = 0.5;
          }
        } else if (o.type === 'fuel') {
          o.collected = true;
          this.fuel = Math.min(this.fuelMax, this.fuel + 0.45);
          this.addScore(25);
          this.sfx.play('pickup');
          this.particles.burst(o.x, o.y, 14, { color: '#ffd86b', speed: 180, life: 0.5 });
        } else if (o.type === 'shieldPu') {
          o.collected = true;
          this.shields++;
          this.addScore(40);
          this.sfx.play('pickup', { freq: 1100 });
          this.particles.burst(o.x, o.y, 14, { color: '#88e8ff', speed: 180, life: 0.5 });
        } else if (o.type === 'slowmo') {
          o.collected = true;
          this.slowmoT = 3.0;
          this.addScore(50);
          this.sfx.play('pickup', { freq: 660 });
          this.particles.burst(o.x, o.y, 18, { color: '#ff4fd8', speed: 200, life: 0.6 });
        } else if (o.type === 'boost') {
          o.collected = true;
          p.vy = -1000;
          this.fuel = Math.min(this.fuelMax, this.fuel + 0.15);
          this.addScore(80);
          this.sfx.play('boost');
          this.particles.burst(o.x, o.y, 22, { color: '#4fc8ff', speed: 240, life: 0.7 });
          this.shake(5, 0.2);
        } else if (o.type === 'bird' || o.type === 'debris' || o.type === 'jet' || o.type === 'bolt') {
          if (this.shields > 0) {
            this.shields--;
            o.collected = true;
            this.flash('#88e8ff', 0.2);
            this.sfx.play('hit', { freq: 500 });
            this.particles.burst(p.x, p.y, 18, { color: '#88e8ff', speed: 260, life: 0.5 });
          } else {
            this.die(); return;
          }
        }
      }

      for (const o of this.worldObjects) if (o.wobble) o.wobble = Math.max(0, o.wobble - dt);
      this.worldObjects = this.worldObjects.filter(o => !o.collected && o.y < this.cameraY + H + 200);

      this.setScore(Math.max(this.score, Math.floor(altitude / 10)));

      // Victory: reach 2500m
      if (altitude >= 2500) {
        this.phase = 'victory';
        this._writeSave(true);
        this.flash('#ff4fd8', 0.5);
        this.sfx.play('boost', { freq: 1000 });
        setTimeout(() => this.win(), 1500);
        return;
      }

      if (p.y > this.cameraY + H + CAMERA_DEATH_OFFSET) {
        this.die(); return;
      }

      this.setHud(this._hud());
    }

    spawnAt(wy) {
      const x = 40 + Math.random() * (W - 80);
      const altitude = Math.abs(wy);
      const bIdx = this._biomeFor(altitude);
      const biome = BIOMES[bIdx];
      const r = Math.random();

      // pickups first
      if (r < 0.45) {
        this.worldObjects.push({ type: 'cloud', x, y: wy, r: 28 });
      } else if (r < 0.6) {
        this.worldObjects.push({ type: 'fuel', x, y: wy, r: 14 });
      } else if (r < 0.66 && altitude > 300) {
        this.worldObjects.push({ type: 'shieldPu', x, y: wy, r: 14 });
      } else if (r < 0.71 && altitude > 500) {
        this.worldObjects.push({ type: 'slowmo', x, y: wy, r: 14 });
      } else if (r < 0.78 && altitude > 200) {
        this.worldObjects.push({ type: 'boost', x, y: wy, r: 15 });
      } else {
        // hazard by biome
        const hz = biome.hazards[(Math.random() * biome.hazards.length) | 0];
        const speed = 80 + bIdx * 30 + Math.random() * 60;
        if (hz === 'bird') {
          this.worldObjects.push({ type: 'bird', x, y: wy, r: 13,
            vx: (Math.random()<0.5?-1:1)*speed, anim: 0 });
        } else if (hz === 'bolt') {
          this.worldObjects.push({ type: 'bolt', x, y: wy, r: 16, t: 0 });
        } else if (hz === 'jet') {
          this.worldObjects.push({ type: 'jet', x, y: wy, r: 16,
            vx: (Math.random()<0.5?-1:1)*(speed + 60), anim: 0 });
        } else if (hz === 'debris') {
          this.worldObjects.push({ type: 'debris', x, y: wy, r: 14 });
        }
      }
    }

    die() {
      this.sfx.play('hit');
      this.shake(12, 0.5);
      this.flash('#f87171', 0.22);
      this.particles.burst(this.player.x, this.player.y, 30, { color: '#f87171', speed: 280, life: 0.8 });
      this._writeSave(false);
      this.gameOver();
    }

    // -------- SHOP --------
    _updateShop(dt) {
      if (Input.mouse.justPressed) {
        for (const r of this.shopRects) {
          if (Input.mouse.x >= r.x && Input.mouse.x <= r.x + r.w &&
              Input.mouse.y >= r.y && Input.mouse.y <= r.y + r.h) {
            if (r.kind === 'launch') {
              this.phase = 'flight';
              return;
            }
            if (r.kind === 'buy') {
              const u = UPGRADES[r.i];
              const lvl = this.save.upgrades[u.id] || 0;
              if (lvl < u.max && Storage.getCoins() >= u.cost) {
                if (Storage.spendCoins(u.cost)) {
                  this.save.upgrades[u.id] = lvl + 1;
                  Storage.setGameData('skybound', {
                    bestAltitude: this.save.bestAltitude,
                    upgrades: this.save.upgrades
                  });
                  this.sfx.play('buy');
                  // reapply live stats
                  this.fuelMax = 1.0 + this.save.upgrades.tank * 0.2;
                  this.fuel = this.fuelMax;
                  this.shields = this.save.upgrades.shield;
                  this.djReady = !!this.save.upgrades.dj;
                }
              }
              return;
            }
          }
        }
      }
    }

    _hud() {
      if (this.phase === 'shop') return '<span>Pre-flight shop</span>';
      const b = BIOMES[this.currentBiome].name;
      const sh = this.shields > 0 ? ' <b style="color:#88e8ff">S' + this.shields + '</b>' : '';
      const dj = this.djReady ? ' <b style="color:#ff4fd8">DJ</b>' : '';
      return `<span>Height <b>${this.score}m</b></span>` +
             `<span>Zone <b>${b}</b></span>` +
             `<span>Fuel <b>${Math.round(this.fuel / this.fuelMax * 100)}%</b></span>` +
             (sh ? '<span>' + sh + '</span>' : '') +
             (dj ? '<span>' + dj + '</span>' : '');
    }

    render(ctx) {
      if (this.phase === 'shop') { this._renderShop(ctx); return; }

      // biome-blended sky
      const altitude = Math.abs(this.highestY);
      const bIdx = this._biomeFor(altitude);
      const b = BIOMES[bIdx];
      const nextB = BIOMES[Math.min(bIdx + 1, BIOMES.length - 1)];
      const into = (altitude - b.from) / Math.max(1, b.to - b.from);
      const topA = lerpColor(b.topCol, nextB.topCol, Math.min(1, into));
      const botA = lerpColor(b.botCol, nextB.botCol, Math.min(1, into));
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, topA); g.addColorStop(1, botA);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

      if (bIdx >= 1) {
        ctx.fillStyle = `rgba(255,255,255,${Math.min(1, (bIdx * 0.3))})`;
        for (let i = 0; i < 80; i++) {
          const sx = (i * 97 + (-this.cameraY * 0.1 % 197)) % W;
          const sy = (i * 53 + (-this.cameraY * 0.07 % 131)) % H;
          ctx.fillRect(sx, sy, 2, 2);
        }
      }

      for (const o of this.worldObjects) {
        const sy = this.worldToScreen(o.y);
        if (sy < -60 || sy > H + 60) continue;
        if (o.type === 'cloud') {
          const sw = 1 + (o.wobble || 0) * 0.15;
          ctx.fillStyle = 'rgba(255,255,255,0.92)';
          ctx.beginPath();
          ctx.ellipse(o.x, sy, 30 * sw, 14, 0, 0, Math.PI * 2);
          ctx.ellipse(o.x + 18, sy - 6, 16, 10, 0, 0, Math.PI * 2);
          ctx.ellipse(o.x - 18, sy - 4, 16, 10, 0, 0, Math.PI * 2);
          ctx.fill();
        } else if (o.type === 'fuel') {
          ctx.save();
          ctx.shadowColor = '#ffd86b'; ctx.shadowBlur = 16;
          ctx.fillStyle = '#ffd86b';
          ctx.fillRect(o.x - 9, sy - 12, 18, 24);
          ctx.fillStyle = '#7a5f14';
          ctx.fillRect(o.x - 3, sy - 14, 6, 3);
          ctx.fillStyle = '#000';
          ctx.font = 'bold 11px ui-monospace, monospace';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('F', o.x, sy);
          ctx.restore();
        } else if (o.type === 'shieldPu') {
          ctx.save();
          ctx.shadowColor = '#88e8ff'; ctx.shadowBlur = 14;
          ctx.fillStyle = '#88e8ff';
          ctx.beginPath(); ctx.arc(o.x, sy, 12, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#052030';
          ctx.font = 'bold 12px ui-monospace, monospace';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('S', o.x, sy);
          ctx.restore();
        } else if (o.type === 'slowmo') {
          ctx.save();
          ctx.shadowColor = '#ff4fd8'; ctx.shadowBlur = 16;
          ctx.fillStyle = '#ff4fd8';
          ctx.beginPath(); ctx.arc(o.x, sy, 12, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#20082a';
          ctx.font = 'bold 10px ui-monospace, monospace';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('~', o.x, sy);
          ctx.restore();
        } else if (o.type === 'boost') {
          ctx.save();
          ctx.shadowColor = '#4fc8ff'; ctx.shadowBlur = 20;
          ctx.fillStyle = '#4fc8ff';
          ctx.beginPath();
          ctx.moveTo(o.x, sy - 16);
          ctx.lineTo(o.x + 13, sy);
          ctx.lineTo(o.x, sy + 16);
          ctx.lineTo(o.x - 13, sy);
          ctx.closePath(); ctx.fill();
          ctx.restore();
        } else if (o.type === 'bird') {
          const wing = Math.sin(o.anim || 0) * 8;
          ctx.fillStyle = '#222';
          ctx.fillRect(o.x - 7, sy - 4, 14, 8);
          ctx.beginPath();
          ctx.moveTo(o.x - 7, sy);
          ctx.lineTo(o.x - 20, sy - wing);
          ctx.lineTo(o.x - 7, sy + 4);
          ctx.closePath(); ctx.fill();
          ctx.beginPath();
          ctx.moveTo(o.x + 7, sy);
          ctx.lineTo(o.x + 20, sy - wing);
          ctx.lineTo(o.x + 7, sy + 4);
          ctx.closePath(); ctx.fill();
        } else if (o.type === 'jet') {
          const thr = Math.sin((o.anim || 0) * 3) * 6;
          const dir = o.vx > 0 ? 1 : -1;
          ctx.fillStyle = '#cfd6e4';
          ctx.fillRect(o.x - 16, sy - 5, 32, 10);
          ctx.fillStyle = '#4a4e60';
          ctx.fillRect(o.x - 18 * dir, sy - 2, 8 * dir, 4);
          ctx.fillStyle = '#ff8844';
          ctx.fillRect(o.x + 12 * dir, sy - 2, (6 + thr) * dir, 4);
        } else if (o.type === 'bolt') {
          const pulse = 0.5 + 0.5 * Math.sin((o.t || 0) * 12);
          ctx.save();
          ctx.shadowColor = '#fff5a8'; ctx.shadowBlur = 24 * pulse;
          ctx.strokeStyle = '#fff5a8'; ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(o.x - 6, sy - 16);
          ctx.lineTo(o.x + 4, sy - 4);
          ctx.lineTo(o.x - 4, sy + 4);
          ctx.lineTo(o.x + 6, sy + 16);
          ctx.stroke();
          ctx.restore();
        } else if (o.type === 'debris') {
          ctx.fillStyle = '#8a6a3a';
          ctx.fillRect(o.x - 11, sy - 11, 22, 22);
          ctx.fillStyle = '#5a3a1a';
          ctx.fillRect(o.x - 8, sy - 8, 4, 4);
          ctx.fillRect(o.x + 3, sy + 3, 4, 4);
        }
      }

      const p = this.player;
      const py = this.worldToScreen(p.y);
      // shield aura
      if (this.shields > 0) {
        ctx.strokeStyle = '#88e8ff'; ctx.lineWidth = 2;
        ctx.globalAlpha = 0.6 + Math.sin(this.time * 6) * 0.25;
        ctx.beginPath(); ctx.arc(p.x, py, 22, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = '#fff';
      ctx.fillRect(p.x - 9, py - 10, 18, 26);
      ctx.fillStyle = '#ff4d6d';
      ctx.beginPath();
      ctx.moveTo(p.x - 9, py - 10);
      ctx.lineTo(p.x, py - 24);
      ctx.lineTo(p.x + 9, py - 10);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#4fc8ff';
      ctx.beginPath(); ctx.arc(p.x, py - 2, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#1e4a66'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(p.x, py - 2, 4.5, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#ff4d6d';
      ctx.beginPath();
      ctx.moveTo(p.x - 9, py + 8);
      ctx.lineTo(p.x - 15, py + 20);
      ctx.lineTo(p.x - 9, py + 16);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(p.x + 9, py + 8);
      ctx.lineTo(p.x + 15, py + 20);
      ctx.lineTo(p.x + 9, py + 16);
      ctx.closePath(); ctx.fill();

      const fb = { x: 20, y: H - 28, w: W - 40, h: 10 };
      ctx.fillStyle = '#00000080'; ctx.fillRect(fb.x, fb.y, fb.w, fb.h);
      ctx.fillStyle = this.fuel / this.fuelMax > 0.2 ? '#ffd86b' : '#f87171';
      ctx.fillRect(fb.x, fb.y, fb.w * (this.fuel / this.fuelMax), fb.h);
      ctx.strokeStyle = '#ffffff40'; ctx.strokeRect(fb.x, fb.y, fb.w, fb.h);

      // altitude ladder (right edge) showing biome markers
      this._drawAltitudeLadder(ctx, altitude);

      ctx.fillStyle = 'rgba(248,113,113,0.12)';
      ctx.fillRect(0, H - 60, W, 60);

      if (altitude < 200) {
        ctx.fillStyle = '#ffffffbb';
        ctx.font = 'bold 18px ui-monospace, monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('HOLD SPACE  \u00b7  A / D to steer  \u00b7  Reach 2500m', W / 2, H / 2 + 60);
      }

      ctx.fillStyle = '#fff';
      ctx.font = 'bold 22px ui-monospace, monospace';
      ctx.textAlign = 'right'; ctx.textBaseline = 'top';
      ctx.fillText(this.score + ' m', W - 20, 14);
      ctx.font = 'bold 12px ui-monospace, monospace';
      ctx.fillStyle = '#ffffffaa';
      ctx.fillText(BIOMES[bIdx].name, W - 20, 40);

      if (this.phase === 'victory') {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#ff4fd8';
        ctx.font = 'bold 46px ui-monospace, monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('THE VOID OPENS', W / 2, H / 2);
      }
    }

    _drawAltitudeLadder(ctx, altitude) {
      const x = W - 14;
      const top = 80, bot = H - 60;
      ctx.fillStyle = '#00000060';
      ctx.fillRect(x - 3, top, 6, bot - top);
      const range = 2500;
      const pct = Math.min(1, altitude / range);
      ctx.fillStyle = '#ffd86b';
      ctx.fillRect(x - 3, bot - (bot - top) * pct, 6, 4);
      for (const b of BIOMES) {
        const p = Math.min(1, b.from / range);
        ctx.fillStyle = '#ffffff40';
        ctx.fillRect(x - 6, bot - (bot - top) * p, 12, 1);
      }
    }

    _renderShop(ctx) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#120820'); g.addColorStop(1, '#040008');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

      ctx.fillStyle = '#ffd86b';
      ctx.font = 'bold 40px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText('PRE-FLIGHT', W / 2, 50);
      ctx.fillStyle = '#a58abd';
      ctx.font = '14px ui-monospace, monospace';
      ctx.fillText('reach 2500m through 4 biomes. best: ' + this.save.bestAltitude + 'm', W / 2, 96);
      ctx.fillStyle = '#ffd86b';
      ctx.font = 'bold 16px ui-monospace, monospace';
      ctx.fillText('\u25CF ' + Storage.getCoins() + ' coins (from all games)', W / 2, 124);

      this.shopRects = [];
      const startX = 120, startY = 170;
      const cellW = (W - 240 - 20) / 2, cellH = 76;
      for (let i = 0; i < UPGRADES.length; i++) {
        const u = UPGRADES[i];
        const lvl = this.save.upgrades[u.id] || 0;
        const maxed = lvl >= u.max;
        const canAfford = !maxed && Storage.getCoins() >= u.cost;
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
      ctx.fillStyle = '#2a5a20';
      ctx.fillRect(cbx, cby, cbw, cbh);
      ctx.strokeStyle = '#66ff88'; ctx.lineWidth = 2;
      ctx.strokeRect(cbx + 0.5, cby + 0.5, cbw, cbh);
      ctx.fillStyle = '#caffd5';
      ctx.font = 'bold 18px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('LAUNCH \u2191', W / 2, cby + cbh / 2);
      this.shopRects.push({ x: cbx, y: cby, w: cbw, h: cbh, kind: 'launch' });
    }

    coinsEarned(score) { return Math.max(0, Math.floor(score / 25)); }
  }

  function lerpColor(a, b, t) {
    if (a.startsWith('rgb')) return a;
    const pa = a.replace('#',''), pb = b.replace('#','');
    const ar = parseInt(pa.slice(0,2),16), ag = parseInt(pa.slice(2,4),16), ab = parseInt(pa.slice(4,6),16);
    const br = parseInt(pb.slice(0,2),16), bg = parseInt(pb.slice(2,4),16), bb = parseInt(pb.slice(4,6),16);
    const r = (ar + (br-ar)*t) | 0;
    const g = (ag + (bg-ag)*t) | 0;
    const bC = (ab + (bb-ab)*t) | 0;
    return `rgb(${r},${g},${bC})`;
  }

  NDP.attachGame('skybound', SkyboundGame);
})();
