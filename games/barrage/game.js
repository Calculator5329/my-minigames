/* Barrage — 10-wave campaign, missile variety, between-wave upgrade shop. */
(function () {
  const NDP = window.NDP;
  const { BaseGame, Input, Storage } = NDP.Engine;

  const W = 960, H = 600;
  const GROUND_Y = H - 90;

  const UPGRADES = [
    { id: 'radius',  label: 'Bigger Bursts',   desc: '+25 blast radius (stacks)', cost: 40, max: 3, color: '#ffd86b' },
    { id: 'freeze',  label: 'Freeze Burst',    desc: 'Slows missiles in radius',  cost: 70, max: 1, color: '#88e8ff' },
    { id: 'chain',   label: 'Chain Burst',     desc: 'Kills spawn a mini-burst',  cost: 90, max: 1, color: '#ff4fd8' },
    { id: 'repair',  label: 'Repair City',     desc: 'Rebuild one fallen city',   cost: 55, max: 6, color: '#4fc8ff' },
    { id: 'extra',   label: '+1 Starting City',desc: 'Campaign starts with more', cost: 80, max: 2, color: '#66ff88' }
  ];

  class BarrageGame extends BaseGame {
    init() {
      const d = Storage.getGameData('barrage') || {};
      this.save = {
        highestWave: d.highestWave || 0,
        upgrades:    Object.assign({}, d.upgrades || {})  // per-run perks keyed by id → level
      };
      // upgrades are per-run (bought this campaign). Only highestWave persists.
      this.upg = {};

      this.wave = 1;
      this.maxWave = 10;
      this.missiles = [];
      this.bursts = [];
      this.cities = [];
      const cityCount = 6;
      for (let i = 0; i < cityCount; i++) {
        this.cities.push({ x: 80 + i * 160, y: GROUND_Y, alive: true, rubble: 0 });
      }
      this.coinsHeld = 0;
      this.phase = 'intro';  // 'intro' | 'wave' | 'intermission' | 'victory'
      this.phaseT = 2.0;
      this.spawnTimer = 0;
      this.combo = 0;
      this.comboTimer = 0;
      this.missilesToSpawn = 0;
      this.missilesSpawned = 0;
      this.shopRects = [];
      this.sfx = this.makeSfx({
        fire:  { freq: 300, type: 'square', dur: 0.06, vol: 0.3 },
        burst: { freq: 120, type: 'noise', dur: 0.22, vol: 0.45, filter: 'lowpass' },
        kill:  { freq: 520, type: 'triangle', dur: 0.1, slide: 260, vol: 0.45 },
        hit:   { freq: 80, type: 'noise', dur: 0.35, vol: 0.55, filter: 'lowpass' },
        wave:  { freq: 660, type: 'triangle', dur: 0.24, slide: 330, vol: 0.5 },
        buy:   { freq: 1100, type: 'square', dur: 0.1, vol: 0.4 },
        split: { freq: 420, type: 'square', dur: 0.1, vol: 0.35, slide: -100 }
      });

      this._startWave(1);
      this.setHud(this._hud());
    }

    _writeSave(won) {
      const best = Math.max(this.save.highestWave, won ? this.maxWave : this.wave - 1);
      Storage.setGameData('barrage', { highestWave: best });
      this.save.highestWave = best;
    }

    _upgLevel(id) { return (this.upg[id] || 0); }
    _burstRadius() { return 56 + this._upgLevel('radius') * 20; }

    _startWave(n) {
      this.wave = n;
      this.phase = 'intro';
      this.phaseT = 1.4;
      // Steeper ramp: w1=11, w5=23, w10=38
      this.missilesToSpawn = 8 + n * 3;
      this.missilesSpawned = 0;
      this.spawnTimer = 0.7;
    }

    update(dt) {
      if (this.phase === 'intro') {
        this.phaseT -= dt;
        if (this.phaseT <= 0) this.phase = 'wave';
        this.setHud(this._hud());
        return;
      }
      if (this.phase === 'intermission') { this._updateIntermission(dt); return; }
      if (this.phase === 'victory') { this.setHud(this._hud()); return; }

      // === WAVE ===
      this.spawnTimer -= dt;
      // Tighter cadence: w1≈0.92s, w5≈0.62s, w10≈0.25s floor
      const spawnRate = Math.max(0.22, 1.0 - this.wave * 0.075);
      if (this.spawnTimer <= 0 && this.missilesSpawned < this.missilesToSpawn) {
        this.spawnTimer = spawnRate * (0.55 + Math.random() * 0.65);
        this._spawnMissile();
      }

      for (const m of this.missiles) {
        if (m.dead) continue;
        const speedMul = m.frozenT > 0 ? 0.35 : 1;
        if (m.frozenT > 0) m.frozenT -= dt;
        m.x += m.vx * dt * speedMul;
        m.y += m.vy * dt * speedMul;
        m.trail.push({ x: m.x, y: m.y, life: 1 });
        if (m.trail.length > 30) m.trail.shift();
        for (const t of m.trail) t.life -= dt * 1.2;

        // splitter splits into 3 at mid altitude
        if (m.type === 'splitter' && !m.split && m.y > GROUND_Y * 0.45) {
          m.split = true;
          this.sfx.play('split');
          for (let k = -1; k <= 1; k++) {
            this.missiles.push({
              x: m.x, y: m.y, vx: m.vx + k * 65, vy: m.vy * 1.05,
              trail: [], dead: false, type: 'normal', hp: 1
            });
          }
          m.dead = true;
          continue;
        }
        // MIRV splits twice — once high, into 3 splitters
        if (m.type === 'mirv' && !m.split && m.y > GROUND_Y * 0.32) {
          m.split = true;
          this.sfx.play('split');
          for (let k = -1; k <= 1; k++) {
            this.missiles.push({
              x: m.x, y: m.y, vx: m.vx + k * 80, vy: m.vy * 0.95,
              trail: [], dead: false, type: 'splitter', hp: 1, split: false
            });
          }
          m.dead = true;
          continue;
        }

        if (m.y >= GROUND_Y) {
          m.dead = true;
          this.shake(12, 0.35);
          this.sfx.play('hit');
          this.particles.burst(m.x, GROUND_Y, 30, { color: '#ff6e3a', speed: 260, life: 0.9 });
          let hit = null, bd = Infinity;
          for (const c of this.cities) {
            if (!c.alive) continue;
            const d = Math.abs(c.x - m.x);
            if (d < 60 && d < bd) { bd = d; hit = c; }
          }
          if (hit) {
            hit.alive = false; hit.rubble = 1;
            this.flash('#ff6e3a', 0.2);
          }
        }
      }
      this.missiles = this.missiles.filter(m => !m.dead || m.y < GROUND_Y + 40);

      for (const b of this.bursts) {
        b.age += dt;
        b.r = b.maxR * Math.min(1, b.age / b.lifeUp);
        if (b.age >= b.lifeUp && !b.checked) {
          b.checked = true;
          for (const m of this.missiles) {
            if (m.dead) continue;
            const d = Math.hypot(m.x - b.x, m.y - b.y);
            if (d <= b.maxR) {
              if (b.freeze) {
                m.frozenT = 3.0;
                continue;
              }
              m.hp = (m.hp || 1) - 1;
              if (m.hp > 0) continue;
              m.dead = true;
              this.combo++;
              this.comboTimer = 2.0;
              this.addScore(100 + this.combo * 25);
              this.sfx.play('kill', { freq: 520 + this.combo * 30 });
              this.particles.burst(m.x, m.y, 18, { color: '#ffd86b', speed: 240, life: 0.6 });
              // chain burst spawn
              if (this._upgLevel('chain') && !b.chainSource) {
                this.bursts.push({
                  x: m.x, y: m.y, r: 0, maxR: this._burstRadius() * 0.55,
                  age: 0, lifeUp: 0.14, life: 0.45, checked: false, chainSource: true
                });
              }
              // coin drops
              this.coinsHeld += m.type === 'mirv' ? 6
                              : m.type === 'armored' ? 4
                              : m.type === 'splitter' ? 2
                              : m.type === 'fast' ? 2
                              : 1;
            }
          }
        }
      }
      this.bursts = this.bursts.filter(b => b.age < b.life);

      if (this.comboTimer > 0) {
        this.comboTimer -= dt;
        if (this.comboTimer <= 0) this.combo = 0;
      }

      // Click → flak burst
      if (Input.mouse.justPressed && Input.mouse.y < GROUND_Y - 10) {
        const freezeReady = this._upgLevel('freeze') && (Input.keys['Shift'] || Input.keys[' ']);
        this.bursts.push({
          x: Input.mouse.x, y: Input.mouse.y,
          r: 0, maxR: this._burstRadius(), age: 0,
          lifeUp: 0.26, life: 0.6, checked: false,
          freeze: !!freezeReady
        });
        this.sfx.play('fire');
        this.sfx.play('burst');
        this.shake(3, 0.1);
      }

      // Wave done? all spawned and no live missiles
      const alive = this.missiles.filter(m => !m.dead).length;
      if (this.missilesSpawned >= this.missilesToSpawn && alive === 0) {
        // coins bonus per surviving city
        const cities = this.cities.filter(c => c.alive).length;
        const wavePay = 25 + this.wave * 10 + cities * 6;
        this.coinsHeld += wavePay;
        this.addScore(500 + this.wave * 50);
        this.sfx.play('wave');
        this.flash('#4fc8ff', 0.15);
        if (this.wave >= this.maxWave) {
          this.phase = 'victory';
          this._writeSave(true);
          setTimeout(() => this.win(), 1200);
          return;
        }
        this.phase = 'intermission';
      }

      if (this.cities.every(c => !c.alive)) {
        this._writeSave(false);
        this.gameOver();
        return;
      }

      this.setHud(this._hud());
    }

    _spawnMissile() {
      const x = 40 + Math.random() * (W - 80);
      const tx = 40 + Math.random() * (W - 80);
      // Steeper speed scaling: w1≈80, w5≈120, w10≈170
      let speed = 70 + this.wave * 10 + Math.random() * 28;
      // pick type by wave
      let type = 'normal';
      const r = Math.random();
      if (this.wave >= 9) {
        // mid-late: heavy mix incl. MIRVs
        type = r < 0.18 ? 'mirv'
             : r < 0.45 ? 'armored'
             : r < 0.72 ? 'splitter'
             : r < 0.90 ? 'fast'
             : 'normal';
      } else if (this.wave >= 6) {
        type = r < 0.30 ? 'armored'
             : r < 0.58 ? 'splitter'
             : r < 0.78 ? 'fast'
             : 'normal';
      } else if (this.wave >= 5) {
        type = r < 0.25 ? 'armored'
             : r < 0.55 ? 'splitter'
             : r < 0.75 ? 'fast'
             : 'normal';
      } else if (this.wave >= 3) {
        type = r < 0.40 ? 'splitter' : 'normal';
      }
      if (type === 'fast') speed *= 1.55;
      const vx = (tx - x) / (GROUND_Y / speed);
      this.missiles.push({
        x, y: -20, vx, vy: speed,
        trail: [], dead: false,
        type,
        hp: type === 'armored' ? 3 : type === 'mirv' ? 2 : 1,
        frozenT: 0,
        split: false
      });
      this.missilesSpawned++;
    }

    _updateIntermission(dt) {
      if (Input.mouse.justPressed) {
        for (const r of this.shopRects) {
          if (Input.mouse.x >= r.x && Input.mouse.x <= r.x + r.w &&
              Input.mouse.y >= r.y && Input.mouse.y <= r.y + r.h) {
            if (r.kind === 'continue') {
              this._startWave(this.wave + 1);
              return;
            }
            if (r.kind === 'buy') {
              this._buy(UPGRADES[r.i]);
              return;
            }
          }
        }
      }
    }

    _buy(u) {
      const lvl = this._upgLevel(u.id);
      if (lvl >= u.max) return;
      if (this.coinsHeld < u.cost) return;
      this.coinsHeld -= u.cost;
      this.upg[u.id] = lvl + 1;
      this.sfx.play('buy');
      if (u.id === 'repair') {
        const dead = this.cities.find(c => !c.alive);
        if (dead) dead.alive = true;
      }
      if (u.id === 'extra') {
        this.cities.push({ x: 40 + this.cities.length * 140, y: GROUND_Y, alive: true, rubble: 0 });
      }
    }

    _hud() {
      const cities = this.cities.filter(c => c.alive).length;
      return `<span>Wave <b>${this.wave}/${this.maxWave}</b></span>` +
             `<span>Cities <b>${cities}/${this.cities.length}</b></span>` +
             `<span>Combo <b>x${this.combo}</b></span>` +
             `<span>&#9679; <b>${this.coinsHeld}</b></span>`;
    }

    render(ctx) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#160a26'); g.addColorStop(1, '#2a1418');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

      ctx.fillStyle = '#ffffff60';
      for (let i = 0; i < 60; i++) {
        const sx = (i * 97) % W;
        const sy = (i * 53) % (GROUND_Y - 40);
        ctx.fillRect(sx, sy, 2, 2);
      }

      ctx.fillStyle = '#1a0810';
      ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
      ctx.strokeStyle = '#ff6e3a55'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, GROUND_Y); ctx.lineTo(W, GROUND_Y); ctx.stroke();

      for (const c of this.cities) {
        if (c.alive) {
          ctx.fillStyle = '#4fc8ff';
          ctx.fillRect(c.x - 34, c.y - 36, 68, 36);
          ctx.fillRect(c.x - 24, c.y - 48, 16, 12);
          ctx.fillRect(c.x + 8, c.y - 44, 16, 8);
          ctx.fillStyle = '#ffd86b';
          for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++)
            ctx.fillRect(c.x - 28 + i*20, c.y - 30 + j*14, 6, 8);
        } else {
          ctx.fillStyle = '#4a2a2a';
          ctx.fillRect(c.x - 30, c.y - 10, 60, 10);
          ctx.beginPath();
          ctx.moveTo(c.x - 30, c.y);
          ctx.lineTo(c.x - 20, c.y - 14);
          ctx.lineTo(c.x - 4, c.y - 6);
          ctx.lineTo(c.x + 14, c.y - 18);
          ctx.lineTo(c.x + 30, c.y - 4);
          ctx.lineTo(c.x + 30, c.y);
          ctx.closePath(); ctx.fill();
        }
      }

      for (const m of this.missiles) {
        if (m.trail.length >= 2) {
          const trailColor = m.type === 'armored' ? '#aa88ff'
                           : m.type === 'splitter' ? '#ff4fd8'
                           : m.type === 'fast' ? '#ffffff'
                           : m.type === 'mirv' ? '#ff3355'
                           : '#ff6e3a';
          ctx.strokeStyle = trailColor;
          ctx.lineWidth = m.type === 'mirv' ? 3 : 2;
          ctx.beginPath();
          ctx.moveTo(m.trail[0].x, m.trail[0].y);
          for (const t of m.trail) ctx.lineTo(t.x, t.y);
          ctx.stroke();
        }
        if (!m.dead) {
          const headColor = m.type === 'armored' ? '#aa88ff'
                          : m.type === 'splitter' ? '#ff4fd8'
                          : m.type === 'fast' ? '#ffffff'
                          : m.type === 'mirv' ? '#ff3355'
                          : '#ffd86b';
          ctx.save();
          ctx.shadowColor = headColor; ctx.shadowBlur = 12;
          ctx.fillStyle = headColor;
          ctx.beginPath();
          const r = m.type === 'mirv' ? 7 : m.type === 'armored' ? 6 : m.type === 'fast' ? 3 : 4;
          ctx.arc(m.x, m.y, r, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
          if (m.type === 'armored') {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(m.x, m.y, r + 2, 0, Math.PI * 2); ctx.stroke();
          }
          if (m.type === 'mirv') {
            ctx.strokeStyle = '#ff3355';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(m.x, m.y, r + 3, 0, Math.PI * 2); ctx.stroke();
            ctx.beginPath(); ctx.arc(m.x, m.y, r + 6, 0, Math.PI * 2); ctx.stroke();
          }
          if (m.frozenT > 0) {
            ctx.fillStyle = '#88e8ff80';
            ctx.beginPath(); ctx.arc(m.x, m.y, r + 4, 0, Math.PI * 2); ctx.fill();
          }
        }
      }

      for (const b of this.bursts) {
        const expand = Math.min(1, b.age / b.lifeUp);
        const fade = 1 - (b.age - b.lifeUp) / (b.life - b.lifeUp);
        const alpha = b.age < b.lifeUp ? 0.7 : Math.max(0, fade * 0.7);
        const baseColor = b.freeze ? '136,232,255' : '255,216,107';
        ctx.strokeStyle = `rgba(${baseColor},${alpha})`;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.maxR * expand, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = `rgba(${baseColor},${alpha * 0.3})`;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.maxR * expand, 0, Math.PI * 2); ctx.fill();
      }

      const mx = Input.mouse.x, my = Input.mouse.y;
      if (my < GROUND_Y - 10 && this.phase === 'wave') {
        ctx.strokeStyle = '#ffd86b'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(mx - 10, my); ctx.lineTo(mx + 10, my);
        ctx.moveTo(mx, my - 10); ctx.lineTo(mx, my + 10);
        ctx.stroke();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = '#ffd86b60';
        ctx.beginPath(); ctx.arc(mx, my, this._burstRadius(), 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      }

      // Wave progress bar
      const frac = this.missilesSpawned > 0
        ? 1 - this.missiles.filter(m => !m.dead).length / Math.max(1, this.missilesToSpawn)
        : 0;
      ctx.fillStyle = '#00000060';
      ctx.fillRect(30, 20, W - 60, 6);
      ctx.fillStyle = '#4fc8ff';
      ctx.fillRect(30, 20, (W - 60) * Math.max(0, Math.min(1, this.missilesSpawned / this.missilesToSpawn)), 6);

      // upgrade icons (active perks)
      this._drawPerkBar(ctx);

      if (this.phase === 'intro') this._drawIntro(ctx);
      if (this.phase === 'intermission') this._drawIntermission(ctx);
      if (this.phase === 'victory') this._drawVictory(ctx);
    }

    _drawPerkBar(ctx) {
      let x = 40, y = 36;
      for (const u of UPGRADES) {
        const lvl = this._upgLevel(u.id);
        if (lvl <= 0) continue;
        ctx.fillStyle = u.color;
        ctx.fillRect(x, y, 10, 10);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px ui-monospace, monospace';
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(u.label + ' x' + lvl, x + 14, y + 5);
        x += 180;
      }
    }

    _drawIntro(ctx) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#ffd86b';
      ctx.font = 'bold 56px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('WAVE ' + this.wave, W / 2, H / 2 - 20);
      ctx.fillStyle = '#a58abd';
      ctx.font = '14px ui-monospace, monospace';
      ctx.fillText(this.missilesToSpawn + ' inbound', W / 2, H / 2 + 24);
    }

    _drawIntermission(ctx) {
      ctx.fillStyle = 'rgba(0,0,0,0.82)';
      ctx.fillRect(0, 0, W, H);
      const bx = 60, by = 40, bw = W - 120, bh = H - 80;
      ctx.fillStyle = '#120820';
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = '#ffd86b'; ctx.lineWidth = 3;
      ctx.strokeRect(bx, by, bw, bh);

      ctx.fillStyle = '#ffd86b';
      ctx.font = 'bold 26px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText('WAVE ' + this.wave + ' CLEARED', W / 2, by + 18);

      ctx.fillStyle = '#caffd5';
      ctx.font = 'bold 16px ui-monospace, monospace';
      ctx.fillText('\u25CF ' + this.coinsHeld + ' coins', W / 2, by + 56);

      this.shopRects = [];
      const startX = bx + 30, startY = by + 100;
      const cellW = (bw - 60 - 20) / 2, cellH = 62;
      for (let i = 0; i < UPGRADES.length; i++) {
        const u = UPGRADES[i];
        const lvl = this._upgLevel(u.id);
        const maxed = lvl >= u.max;
        const col = i % 2, row = (i / 2) | 0;
        const rx = startX + col * (cellW + 20);
        const ry = startY + row * (cellH + 10);
        const canAfford = !maxed && this.coinsHeld >= u.cost;
        ctx.fillStyle = maxed ? '#0a1a10' : canAfford ? '#1a140a' : '#140a1a';
        ctx.fillRect(rx, ry, cellW, cellH);
        ctx.strokeStyle = u.color; ctx.lineWidth = 1;
        ctx.strokeRect(rx + 0.5, ry + 0.5, cellW, cellH);
        ctx.fillStyle = u.color;
        ctx.font = 'bold 14px ui-monospace, monospace';
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText(u.label + (u.max > 1 ? ' (' + lvl + '/' + u.max + ')' : ''), rx + 12, ry + 10);
        ctx.fillStyle = '#a58abd';
        ctx.font = '11px ui-monospace, monospace';
        ctx.fillText(u.desc, rx + 12, ry + 30);
        ctx.fillStyle = maxed ? '#66ff88' : canAfford ? '#ffcc33' : '#776655';
        ctx.font = 'bold 13px ui-monospace, monospace';
        ctx.textAlign = 'right';
        ctx.fillText(maxed ? 'MAX' : '\u25CF ' + u.cost, rx + cellW - 12, ry + 40);
        if (!maxed) this.shopRects.push({ x: rx, y: ry, w: cellW, h: cellH, kind: 'buy', i });
      }

      const cbw = 280, cbh = 44;
      const cbx = W / 2 - cbw / 2, cby = by + bh - cbh - 20;
      ctx.fillStyle = '#2a5a20';
      ctx.fillRect(cbx, cby, cbw, cbh);
      ctx.strokeStyle = '#66ff88'; ctx.lineWidth = 2;
      ctx.strokeRect(cbx + 0.5, cby + 0.5, cbw, cbh);
      ctx.fillStyle = '#caffd5';
      ctx.font = 'bold 16px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('WAVE ' + (this.wave + 1) + ' \u2192', W / 2, cby + cbh / 2);
      this.shopRects.push({ x: cbx, y: cby, w: cbw, h: cbh, kind: 'continue' });
    }

    _drawVictory(ctx) {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#ffd86b';
      ctx.font = 'bold 48px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('SKIES SECURED', W / 2, H / 2);
    }

    coinsEarned(score) { return Math.max(0, Math.floor(score / 300)); }
  }

  NDP.attachGame('barrage', BarrageGame);
})();
