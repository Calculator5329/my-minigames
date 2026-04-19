/* Starfall — vertical scrolling shmup.
   Wave-based. Every 10th wave is a boss. Collect green orbs for rapid-fire,
   pink orbs for triple-shot. 3 lives. */
(function () {
  const NDP = window.NDP;
  const { BaseGame, Input, Assets, Storage } = NDP.Engine;

  const W = 960, H = 600;

  const UPGRADES = [
    { id: 'life',  label: '+Extra Life',   desc: '+1 starting life per tier',  cost: 120, max: 2, color: '#ff4466' },
    { id: 'bomb',  label: 'Start Bombs',   desc: '+1 screen-clear bomb',       cost: 150, max: 3, color: '#ff4fd8' },
    { id: 'tri',   label: 'Start Triple',  desc: '5s triple-shot on spawn',    cost: 140, max: 1, color: '#f0c' },
    { id: 'rap',   label: 'Start Rapid',   desc: '5s rapid-fire on spawn',     cost: 160, max: 1, color: '#6cf' }
  ];

  class StarfallGame extends BaseGame {
    init() {
      const d = Storage.getGameData('starfall') || {};
      this.save = {
        bestWave: d.bestWave || 0,
        upgrades: Object.assign({ life:0, bomb:0, tri:0, rap:0 }, d.upgrades || {})
      };
      this.phase = 'shop';
      this.shopRects = [];
      const startLives = 3 + this.save.upgrades.life;
      this.player = { x: W / 2, y: H - 80, r: 18, vx: 0, vy: 0, inv: 1.2, lives: startLives };
      this.bombs = this.save.upgrades.bomb;
      this.bullets = [];         // player bullets
      this.ebullets = [];        // enemy bullets
      this.enemies = [];
      this.particles2 = [];
      this.powerups = [];
      this.stars = [];
      for (let i = 0; i < 120; i++) {
        this.stars.push({
          x: Math.random() * W, y: Math.random() * H,
          z: 0.2 + Math.random() * 1.8,
          s: Math.random() < 0.15 ? 2 : 1
        });
      }
      this.fireCd = 0;
      this.fireRate = 0.22;
      this.triple = this.save.upgrades.tri ? 5 : 0;
      this.rapid = this.save.upgrades.rap ? 5 : 0;
      this.wave = 1;
      this.waveTimer = 1.0;     // time until next wave starts
      this.waveSpawnLeft = 0;   // enemies left to spawn this wave
      this.waveSpawnCd = 0;
      this.boss = null;
      this.flashCol = null;
      this.sfx = this.makeSfx({
        shoot: { freq: 880, type: 'square', dur: 0.06, slide: -320, vol: 0.12 },
        boom:  { freq: 120, type: 'noise', dur: 0.18, vol: 0.35, filter: 'lowpass' },
        hit:   { freq: 440, type: 'square', dur: 0.08, slide: -200, vol: 0.25 },
        pick:  { freq: 660, type: 'triangle', dur: 0.15, slide: 660, vol: 0.3 },
        lose:  { freq: 220, type: 'sawtooth', dur: 0.4, slide: -180, vol: 0.45 },
        bossHit:{ freq: 300, type: 'square', dur: 0.05, slide: -80, vol: 0.2 },
        bomb:   { freq: 90,  type: 'sawtooth', dur: 0.4, slide: 220, vol: 0.55 },
        buy:    { freq: 1100,type: 'square',   dur: 0.1, vol: 0.4 }
      });
      this.setHud(this.makeHud());
    }

    makeHud() {
      if (this.phase === 'shop') return '<span>Pre-run shop</span>';
      const hearts = '\u2665'.repeat(Math.max(0, this.player.lives));
      const pw = [];
      if (this.triple > 0) pw.push('<b style="color:#f0c">TRI</b>');
      if (this.rapid > 0)  pw.push('<b style="color:#6cf">RAP</b>');
      if (this.bombs > 0)  pw.push(`<b style="color:#ff4fd8">B${this.bombs}</b>`);
      return `<span>Wave <b>${this.wave}</b></span><span>Lives <b>${hearts}</b></span>` +
             (pw.length ? `<span>${pw.join(' ')}</span>` : '') +
             `<span>Score <b>${this.score}</b></span>`;
    }

    _renderShop(ctx) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#140428'); g.addColorStop(1, '#020008');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      for (const s of this.stars) {
        ctx.fillStyle = s.z > 1.3 ? '#fff8' : (s.z > 0.8 ? '#cce8' : '#6688');
        ctx.fillRect(s.x, s.y, s.s, s.s);
      }

      ctx.fillStyle = '#ffec7a';
      ctx.font = 'bold 40px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText('STARFALL', W / 2, 50);
      ctx.fillStyle = '#a58abd';
      ctx.font = '14px ui-monospace, monospace';
      ctx.fillText('boss every 10 waves, phase-2 at 50%. best: wave ' + this.save.bestWave, W / 2, 96);
      ctx.fillStyle = '#ffcc33';
      ctx.font = 'bold 16px ui-monospace, monospace';
      ctx.fillText('\u25CF ' + Storage.getCoins() + ' coins', W / 2, 124);

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
      ctx.fillStyle = '#4a1a4a';
      ctx.fillRect(cbx, cby, cbw, cbh);
      ctx.strokeStyle = '#ffec7a'; ctx.lineWidth = 2;
      ctx.strokeRect(cbx + 0.5, cby + 0.5, cbw, cbh);
      ctx.fillStyle = '#ffec7a';
      ctx.font = 'bold 18px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('ENGAGE \u2191', W / 2, cby + cbh / 2);
      this.shopRects.push({ x: cbx, y: cby, w: cbw, h: cbh, kind: 'launch' });
    }

    spawnWave() {
      const w = this.wave;
      const isBoss = w % 10 === 0;
      if (isBoss) {
        this.boss = {
          x: W / 2, y: 90, r: 64,
          hp: 60 + w * 2, maxHp: 60 + w * 2,
          vx: 80 + w * 4, t: 0,
          shootCd: 1.0,
          kind: 'boss'
        };
        this.waveSpawnLeft = 0;
      } else {
        this.waveSpawnLeft = 6 + w * 2;
        this.waveSpawnCd = 0;
      }
    }

    spawnEnemy() {
      const w = this.wave;
      const r = Math.random();
      let kind;
      if (r < 0.55) kind = 'grunt';
      else if (r < 0.85) kind = 'zig';
      else kind = 'shooter';
      const baseSpeed = 60 + w * 4;
      const x = 60 + Math.random() * (W - 120);
      const e = {
        x, y: -30,
        baseX: x,
        vx: 0, vy: baseSpeed,
        r: kind === 'shooter' ? 22 : kind === 'zig' ? 18 : 20,
        hp: kind === 'shooter' ? 3 : kind === 'zig' ? 1 : 2,
        kind, t: Math.random() * 6,
        shootCd: kind === 'shooter' ? 1.2 + Math.random() : 999,
        points: kind === 'shooter' ? 30 : kind === 'zig' ? 20 : 10
      };
      this.enemies.push(e);
    }

    fireBullet(x, y, vx, vy) {
      this.bullets.push({ x, y, vx, vy, r: 4, life: 1.6 });
    }

    firePlayer() {
      const p = this.player;
      if (this.triple > 0) {
        this.fireBullet(p.x, p.y - 20, -120, -800);
        this.fireBullet(p.x, p.y - 22, 0, -850);
        this.fireBullet(p.x, p.y - 20, 120, -800);
      } else {
        this.fireBullet(p.x, p.y - 22, 0, -820);
      }
      this.sfx.play('shoot');
      Assets.sfx('sf_laser', 0.18);
      this.fireCd = this.rapid > 0 ? 0.09 : this.fireRate;
    }

    update(dt) {
      if (this.phase === 'shop') { this._updateShop(dt); return; }
      // Stars parallax
      for (const s of this.stars) {
        s.y += (50 + s.z * 90) * dt;
        if (s.y > H) { s.y = -4; s.x = Math.random() * W; }
      }

      // Player input
      const p = this.player;
      const speed = 330;
      let ax = 0, ay = 0;
      if (Input.keys['ArrowLeft'] || Input.keys['a'] || Input.keys['A']) ax -= 1;
      if (Input.keys['ArrowRight'] || Input.keys['d'] || Input.keys['D']) ax += 1;
      if (Input.keys['ArrowUp'] || Input.keys['w'] || Input.keys['W']) ay -= 1;
      if (Input.keys['ArrowDown'] || Input.keys['s'] || Input.keys['S']) ay += 1;
      const m = Math.hypot(ax, ay) || 1;
      p.vx = (ax / m) * speed;
      p.vy = (ay / m) * speed;
      p.x = Math.max(24, Math.min(W - 24, p.x + p.vx * dt));
      p.y = Math.max(24, Math.min(H - 24, p.y + p.vy * dt));

      // Bomb (F)
      if ((Input.keys['f'] || Input.keys['F']) && this.bombs > 0) {
        this._detonateBomb();
        Input.keys['f'] = false; Input.keys['F'] = false;
      }

      // Fire
      this.fireCd = Math.max(0, this.fireCd - dt);
      const firing = Input.keys[' '] || Input.keys['Space'] || Input.mouse.down;
      if (firing && this.fireCd <= 0) this.firePlayer();

      // Power-up timers
      this.triple = Math.max(0, this.triple - dt);
      this.rapid = Math.max(0, this.rapid - dt);
      p.inv = Math.max(0, p.inv - dt);

      // Bullets
      for (const b of this.bullets) {
        b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      }
      this.bullets = this.bullets.filter(b => b.life > 0 && b.y > -20 && b.y < H + 20 && b.x > -20 && b.x < W + 20);

      for (const b of this.ebullets) {
        b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      }
      this.ebullets = this.ebullets.filter(b => b.life > 0 && b.y < H + 30 && b.y > -30 && b.x > -20 && b.x < W + 20);

      // Enemies
      for (const e of this.enemies) {
        e.t += dt;
        if (e.kind === 'zig') e.x = e.baseX + Math.sin(e.t * 2.2) * 120;
        else if (e.kind === 'shooter') {
          e.vy = 40;
          e.shootCd -= dt;
          if (e.shootCd <= 0 && e.y > 40 && e.y < H - 200) {
            const ang = Math.atan2(p.y - e.y, p.x - e.x);
            this.ebullets.push({ x: e.x, y: e.y + e.r, vx: Math.cos(ang) * 260, vy: Math.sin(ang) * 260, r: 5, life: 3.5 });
            e.shootCd = 1.0 + Math.random() * 0.8;
          }
        }
        e.y += e.vy * dt;
      }
      this.enemies = this.enemies.filter(e => e.y < H + 60 && e.hp > 0);

      // Wave spawn
      if (this.boss) {
        const b = this.boss;
        b.t += dt;
        b.x += b.vx * dt;
        if (b.x < 80) { b.x = 80; b.vx = -b.vx; }
        if (b.x > W - 80) { b.x = W - 80; b.vx = -b.vx; }
        b.y = 90 + Math.sin(b.t * 1.1) * 20;
        b.shootCd -= dt;
        if (b.shootCd <= 0) {
          // Radial burst — wider in phase 2
          const n = b.phase2 ? 13 : 7;
          for (let i = 0; i < n; i++) {
            const a = Math.PI / 2 + (i - (n - 1) / 2) * 0.22 + Math.sin(b.t) * 0.1;
            this.ebullets.push({ x: b.x, y: b.y + 40, vx: Math.cos(a) * (b.phase2 ? 300 : 240), vy: Math.sin(a) * (b.phase2 ? 300 : 240), r: 5, life: 4 });
          }
          if (b.phase2) {
            // aimed shots
            const ang = Math.atan2(this.player.y - b.y, this.player.x - b.x);
            this.ebullets.push({ x: b.x, y: b.y, vx: Math.cos(ang) * 360, vy: Math.sin(ang) * 360, r: 6, life: 3 });
          }
          b.shootCd = b.phase2 ? 0.7 : 1.1;
        }
      } else {
        this.waveTimer -= dt;
        if (this.waveSpawnLeft > 0) {
          this.waveSpawnCd -= dt;
          if (this.waveSpawnCd <= 0) {
            this.spawnEnemy();
            this.waveSpawnLeft--;
            this.waveSpawnCd = Math.max(0.3, 0.8 - this.wave * 0.02);
          }
        } else if (this.enemies.length === 0 && this.waveTimer <= 0) {
          this.wave++;
          this.spawnWave();
          this.waveTimer = 2.0;
        }
      }

      // Player bullets vs enemies / boss
      for (const bl of this.bullets) {
        if (this.boss) {
          const d = Math.hypot(bl.x - this.boss.x, bl.y - this.boss.y);
          if (d < this.boss.r) {
            this.boss.hp -= 1;
            bl.life = 0;
            this.sfx.play('bossHit');
            this.sparks2(bl.x, bl.y, 4, '#fc6');
            if (!this.boss.phase2 && this.boss.hp <= this.boss.maxHp * 0.5) {
              this.boss.phase2 = true;
              this.flash('#ff4fd8', 0.4);
              this.shake(14, 0.5);
              this.sfx.play('boom', { freq: 200 });
            }
            if (this.boss.hp <= 0) {
              this.bossKill();
            }
            continue;
          }
        }
        for (const e of this.enemies) {
          if (e.hp <= 0) continue;
          const d = Math.hypot(bl.x - e.x, bl.y - e.y);
          if (d < e.r) {
            e.hp--;
            bl.life = 0;
            if (e.hp <= 0) this.killEnemy(e);
            else this.sfx.play('hit');
            break;
          }
        }
      }

      // Enemy bullets vs player
      if (p.inv <= 0) {
        for (const eb of this.ebullets) {
          const d = Math.hypot(eb.x - p.x, eb.y - p.y);
          if (d < eb.r + p.r - 4) { this.hitPlayer(); eb.life = 0; break; }
        }
        // Enemy bodies vs player
        for (const e of this.enemies) {
          const d = Math.hypot(e.x - p.x, e.y - p.y);
          if (d < e.r + p.r - 4) { this.hitPlayer(); e.hp = 0; this.killEnemy(e); break; }
        }
        if (this.boss) {
          const d = Math.hypot(this.boss.x - p.x, this.boss.y - p.y);
          if (d < this.boss.r + p.r - 6) this.hitPlayer();
        }
      }

      // Powerups
      for (const pu of this.powerups) {
        pu.y += 120 * dt;
        pu.t += dt;
        const d = Math.hypot(pu.x - p.x, pu.y - p.y);
        if (d < 22 + p.r) {
          if (pu.kind === 'tri') this.triple = 8;
          else this.rapid = 7;
          pu.dead = true;
          this.addScore(5);
          this.sfx.play('pick');
          Assets.sfx('sf_hit', 0.3);
          this.flash('#6cf', 0.1);
        }
      }
      this.powerups = this.powerups.filter(pu => !pu.dead && pu.y < H + 20);

      // Own particle layer (images need their own loop since BaseGame's
      // ParticleSystem draws circles/rects only).
      for (const pt of this.particles2) {
        pt.x += pt.vx * dt; pt.y += pt.vy * dt;
        pt.vx *= 0.96; pt.vy *= 0.96;
        pt.life -= dt;
      }
      this.particles2 = this.particles2.filter(pt => pt.life > 0);

      this.setHud(this.makeHud());
    }

    killEnemy(e) {
      this.addScore(e.points);
      this.sfx.play('boom');
      Assets.sfx('sf_boom', 0.35);
      this.shake(4, 0.12);
      this.sparks2(e.x, e.y, 18, e.kind === 'shooter' ? '#f88' : '#7f7');
      // Drop chance
      if (Math.random() < 0.08) {
        this.powerups.push({ x: e.x, y: e.y, t: 0, kind: Math.random() < 0.5 ? 'tri' : 'rap' });
      }
    }

    bossKill() {
      this.addScore(200 + this.wave * 10);
      this.sfx.play('boom');
      Assets.sfx('sf_boom', 0.7);
      this.shake(14, 0.5);
      this.flash('#fff', 0.2);
      for (let i = 0; i < 50; i++) {
        this.sparks2(this.boss.x + (Math.random()-0.5)*80, this.boss.y + (Math.random()-0.5)*60, 2, ['#fc6','#f66','#fff','#6cf'][i%4]);
      }
      // Guarantee both powerups
      this.powerups.push({ x: this.boss.x - 30, y: this.boss.y, t: 0, kind: 'tri' });
      this.powerups.push({ x: this.boss.x + 30, y: this.boss.y, t: 0, kind: 'rap' });
      this.boss = null;
      this.waveTimer = 3.0;
    }

    hitPlayer() {
      const p = this.player;
      p.lives--;
      p.inv = 2.0;
      this.sfx.play('lose');
      Assets.sfx('sf_hit', 0.5);
      this.shake(12, 0.35);
      this.flash('#f44', 0.2);
      this.sparks2(p.x, p.y, 22, '#f66');
      if (p.lives <= 0) {
        Storage.setGameData('starfall', { bestWave: Math.max(this.save.bestWave, this.wave), upgrades: this.save.upgrades });
        this.gameOver();
      }
    }

    _detonateBomb() {
      this.bombs--;
      this.sfx.play('bomb');
      this.flash('#ff4fd8', 0.4);
      this.shake(16, 0.45);
      this.sparks2(this.player.x, this.player.y, 60, '#ff4fd8');
      this.ebullets = [];
      for (const e of this.enemies) {
        e.hp -= 3;
        if (e.hp <= 0) this.killEnemy(e);
      }
      if (this.boss) this.boss.hp -= 12;
    }

    _updateShop(dt) {
      if (Input.mouse.justPressed) {
        for (const r of this.shopRects) {
          if (Input.mouse.x >= r.x && Input.mouse.x <= r.x + r.w &&
              Input.mouse.y >= r.y && Input.mouse.y <= r.y + r.h) {
            if (r.kind === 'launch') {
              this.phase = 'play';
              this.spawnWave();
              return;
            }
            if (r.kind === 'buy') {
              const u = UPGRADES[r.i];
              const lvl = this.save.upgrades[u.id] || 0;
              if (lvl < u.max && Storage.getCoins() >= u.cost) {
                if (Storage.spendCoins(u.cost)) {
                  this.save.upgrades[u.id] = lvl + 1;
                  Storage.setGameData('starfall', { bestWave: this.save.bestWave, upgrades: this.save.upgrades });
                  this.sfx.play('buy');
                  this.player.lives = 3 + this.save.upgrades.life;
                  this.bombs = this.save.upgrades.bomb;
                  this.triple = this.save.upgrades.tri ? 5 : 0;
                  this.rapid = this.save.upgrades.rap ? 5 : 0;
                }
              }
              return;
            }
          }
        }
      }
    }

    sparks2(x, y, n, color) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = 80 + Math.random() * 200;
        this.particles2.push({
          x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
          life: 0.3 + Math.random() * 0.4,
          color, size: 2 + Math.random() * 2
        });
      }
    }

    render(ctx) {
      if (this.phase === 'shop') { this._renderShop(ctx); return; }
      // Background — space gradient
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, '#0a0420');
      grad.addColorStop(1, '#05080f');
      ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);

      // Nebula
      const neb = ctx.createRadialGradient(W * 0.25, H * 0.2, 10, W * 0.25, H * 0.2, 400);
      neb.addColorStop(0, 'rgba(255,60,200,0.16)');
      neb.addColorStop(1, 'rgba(255,60,200,0)');
      ctx.fillStyle = neb; ctx.fillRect(0, 0, W, H);

      // Stars
      for (const s of this.stars) {
        ctx.fillStyle = s.z > 1.3 ? '#fff' : (s.z > 0.8 ? '#cce' : '#668');
        ctx.fillRect(s.x, s.y, s.s, s.s);
      }

      // Powerups
      for (const pu of this.powerups) {
        const col = pu.kind === 'tri' ? '#f0c' : '#6cf';
        const pulse = 1 + Math.sin(pu.t * 10) * 0.2;
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(pu.x, pu.y, 12 * pulse, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(pu.kind === 'tri' ? '3' : 'R', pu.x, pu.y + 1);
      }

      // Enemies
      for (const e of this.enemies) this.drawEnemy(ctx, e);

      // Boss
      if (this.boss) this.drawBoss(ctx, this.boss);

      // Bullets (player)
      for (const b of this.bullets) {
        if (!Assets.draw(ctx, 'sf_bullet', b.x, b.y, 8, 18, { fallback: () => {
          ctx.fillStyle = '#ffec7a';
          ctx.fillRect(b.x - 2, b.y - 8, 4, 14);
        }})) {}
      }

      // Enemy bullets
      for (const b of this.ebullets) {
        ctx.fillStyle = '#f66';
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ff9';
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.5, 0, Math.PI * 2); ctx.fill();
      }

      // Player
      this.drawPlayer(ctx);

      // Custom particles
      for (const pt of this.particles2) {
        const a = Math.max(0, Math.min(1, pt.life * 2));
        ctx.globalAlpha = a;
        ctx.fillStyle = pt.color;
        ctx.fillRect(pt.x - pt.size/2, pt.y - pt.size/2, pt.size, pt.size);
      }
      ctx.globalAlpha = 1;

      // Boss HP bar
      if (this.boss) {
        const frac = this.boss.hp / this.boss.maxHp;
        ctx.fillStyle = '#300';
        ctx.fillRect(60, 20, W - 120, 12);
        ctx.fillStyle = '#f44';
        ctx.fillRect(60, 20, (W - 120) * frac, 12);
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
        ctx.strokeRect(60, 20, W - 120, 12);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center';
        ctx.fillText('BOSS', W / 2, 30);
      }
    }

    drawPlayer(ctx) {
      const p = this.player;
      if (p.inv > 0 && Math.floor(p.inv * 12) % 2 === 0) return;
      // Thruster flicker
      ctx.fillStyle = Math.random() < 0.5 ? '#fc6' : '#f84';
      ctx.beginPath();
      ctx.moveTo(p.x - 6, p.y + 10);
      ctx.lineTo(p.x, p.y + 20 + Math.random() * 6);
      ctx.lineTo(p.x + 6, p.y + 10);
      ctx.closePath(); ctx.fill();

      if (!Assets.draw(ctx, 'sf_player', p.x, p.y, 44, 44, { fallback: () => {
        ctx.fillStyle = '#6cf';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - 18);
        ctx.lineTo(p.x - 14, p.y + 12);
        ctx.lineTo(p.x + 14, p.y + 12);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillRect(p.x - 3, p.y - 4, 6, 8);
        ctx.fillStyle = '#f0c';
        ctx.fillRect(p.x - 18, p.y + 6, 6, 6);
        ctx.fillRect(p.x + 12, p.y + 6, 6, 6);
      }})) {}

      // Shield bubble during invincibility
      if (p.inv > 0) {
        ctx.strokeStyle = 'rgba(120,200,255,0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y, 26 + Math.sin(this.time * 18) * 2, 0, Math.PI * 2); ctx.stroke();
      }
    }

    drawEnemy(ctx, e) {
      const key = e.kind === 'shooter' ? 'sf_enemy3' : e.kind === 'zig' ? 'sf_enemy2' : 'sf_enemy1';
      const size = e.r * 2.2;
      if (!Assets.draw(ctx, key, e.x, e.y, size, size, { fallback: () => {
        ctx.fillStyle = e.kind === 'shooter' ? '#f88' : e.kind === 'zig' ? '#fc6' : '#7f7';
        ctx.fillRect(e.x - e.r, e.y - e.r * 0.7, e.r * 2, e.r * 1.4);
        ctx.fillStyle = '#000';
        ctx.fillRect(e.x - e.r * 0.5, e.y - 2, e.r * 0.3, e.r * 0.3);
        ctx.fillRect(e.x + e.r * 0.2, e.y - 2, e.r * 0.3, e.r * 0.3);
      }})) {}
    }

    drawBoss(ctx, b) {
      const size = b.r * 2.4;
      if (!Assets.draw(ctx, 'sf_ship', b.x, b.y, size, size, { rot: Math.PI, fallback: () => {
        ctx.fillStyle = '#e44';
        ctx.beginPath(); ctx.ellipse(b.x, b.y, b.r, b.r * 0.7, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#400';
        ctx.fillRect(b.x - b.r * 0.6, b.y + 10, b.r * 1.2, 10);
        ctx.fillStyle = '#ff0';
        ctx.beginPath(); ctx.arc(b.x, b.y, 10, 0, Math.PI * 2); ctx.fill();
      }})) {}
    }

    coinsEarned(score) { return Math.max(0, Math.floor(score / 80)); }
  }

  NDP.attachGame('starfall', StarfallGame);
})();
