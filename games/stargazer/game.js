/* Stargazer — twin-stick shooter with pre-run shop, bombs, formations, bosses.

   Currency model: per-game wallet ('Lensgleam') under Storage.*GameWallet
   ('stargazer'). Pre-run shop spends Lensgleam only. Wallet is awarded at
   end-of-run from wave milestones (same formula as theme coinsEarned).
   NG+/persistent. */
(function () {
  const NDP = window.NDP;
  const { BaseGame, Input, Storage } = NDP.Engine;

  const W = 960, H = 600;
  const GID = 'stargazer';
  const PLAYER_SPEED = 280;
  const BULLET_SPEED = 640;
  const FIRE_COOLDOWN = 0.12;

  const UPGRADES = [
    { id: 'hp',     label: '+Max HP',      desc: '+1 heart per tier',            cost: 100, max: 3, color: '#ff4466' },
    { id: 'bomb',   label: 'Start Bombs',  desc: '+1 bomb at start',             cost: 120, max: 3, color: '#ff4fd8' },
    { id: 'oc',     label: 'Start Charge', desc: '2s overcharge on spawn',       cost: 140, max: 1, color: '#ff8c3a' },
    { id: 'dmg',    label: 'Twin Shot',    desc: 'Base fire is double-shot',     cost: 180, max: 1, color: '#7ae0ff' }
  ];

  class StargazerGame extends BaseGame {
    init() {
      const d = Storage.getGameData('stargazer') || {};
      this.save = {
        bestWave: d.bestWave || 0,
        upgrades: Object.assign({ hp:0, bomb:0, oc:0, dmg:0 }, d.upgrades || {})
      };
      this.phase = 'shop'; // 'shop' | 'play'
      this.shopRects = [];

      const maxHp = 3 + this.save.upgrades.hp;
      this.player = { x: W/2, y: H/2, vx: 0, vy: 0, r: 12, hp: maxHp, maxHp, iframes: 0, angle: 0, overcharge: this.save.upgrades.oc ? 2 : 0 };
      this.bombs = this.save.upgrades.bomb;
      this.bullets = [];
      this.enemies = [];
      this.pickups = [];
      this.boss = null;
      this.wave = 1;
      this.waveTimer = 0;
      this.waveEnemiesLeft = 0;
      this.wavesClearedThisRun = 0;
      this.victoryAchieved = false;
      this.stars = [];
      for (let i = 0; i < 120; i++) {
        this.stars.push({ x: Math.random()*W, y: Math.random()*H, z: 0.2 + Math.random()*1.5 });
      }
      this.fireTimer = 0;
      this.sfx = this.makeSfx({
        shot:    { freq: 700, type: 'square', dur: 0.04, slide: 500, vol: 0.18 },
        hit:     { freq: 520, type: 'triangle', dur: 0.06, slide: 240, vol: 0.3 },
        kill:    { freq: 180, type: 'sawtooth', dur: 0.15, slide: -80, vol: 0.4 },
        hurt:    { freq: 120, type: 'noise', dur: 0.25, vol: 0.6, filter: 'lowpass' },
        pickup:  { freq: 880, type: 'triangle', dur: 0.1, slide: 440, vol: 0.4 },
        wave:    { freq: 440, type: 'triangle', dur: 0.25, slide: 880, vol: 0.5 },
        buy:     { freq: 1100,type: 'square',   dur: 0.1, vol: 0.4 },
        bomb:    { freq: 90,  type: 'sawtooth', dur: 0.4, slide: 220, vol: 0.55 },
        boss:    { freq: 140, type: 'sawtooth', dur: 0.35, slide: 80, vol: 0.5 }
      });
      this.setHud(this._hud());
    }

    _writeSave() {
      Storage.setGameData('stargazer', {
        bestWave: Math.max(this.save.bestWave, this.wave),
        upgrades: this.save.upgrades
      });
    }

    _awardWallet() {
      const award = this.coinsEarned();
      if (award > 0) Storage.addGameWallet(GID, award);
    }

    startWave() {
      if (this.wave % 10 === 0) {
        this.boss = {
          x: W/2, y: 100, r: 48,
          hp: 80 + this.wave * 3, maxHp: 80 + this.wave * 3,
          vx: 120, t: 0, shootCd: 1.0, phase2: false
        };
        this.waveEnemiesLeft = 0;
        this.sfx.play('boss');
        this.flash('#ff4fd8', 0.3);
        return;
      }
      // formation: every 3rd wave is circle/line
      const formation = this.wave % 3 === 0 ? (Math.random() < 0.5 ? 'circle' : 'line') : 'random';
      const count = 4 + this.wave * 2;
      if (formation === 'circle') {
        const cx = W/2, cy = H/2;
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2;
          this.spawnEnemyAt(cx + Math.cos(a) * 320, cy + Math.sin(a) * 220);
        }
      } else if (formation === 'line') {
        for (let i = 0; i < count; i++) {
          this.spawnEnemyAt(60 + i * ((W-120) / (count-1)), -30);
        }
      } else {
        for (let i = 0; i < count; i++) this.spawnEnemy();
      }
      this.waveEnemiesLeft = count;
      this.sfx.play('wave');
      this.flash('#7ae0ff', 0.08);
    }

    spawnEnemy() {
      const side = Math.floor(Math.random() * 4);
      let x, y;
      if (side === 0) { x = -20; y = Math.random() * H; }
      else if (side === 1) { x = W + 20; y = Math.random() * H; }
      else if (side === 2) { y = -20; x = Math.random() * W; }
      else { y = H + 20; x = Math.random() * W; }
      this.spawnEnemyAt(x, y);
    }

    spawnEnemyAt(x, y) {
      const w = this.wave;
      const type = Math.random() < Math.min(0.3, w * 0.03) ? 'chaser' : 'drifter';
      const speed = 60 + w * 8 + (type === 'chaser' ? 40 : 0);
      this.enemies.push({ x, y, vx: 0, vy: 0, r: 14, hp: type === 'chaser' ? 2 : 1, type, speed, spawnAge: 0 });
    }

    update(dt) {
      if (this.phase === 'shop') { this._updateShop(dt); return; }

      for (const s of this.stars) {
        s.x -= 20 * s.z * dt;
        if (s.x < 0) { s.x = W; s.y = Math.random() * H; }
      }

      const p = this.player;
      p.iframes = Math.max(0, p.iframes - dt);

      const L = Input.keys['a'] || Input.keys['A'] || Input.keys['ArrowLeft'];
      const R = Input.keys['d'] || Input.keys['D'] || Input.keys['ArrowRight'];
      const U = Input.keys['w'] || Input.keys['W'] || Input.keys['ArrowUp'];
      const D = Input.keys['s'] || Input.keys['S'] || Input.keys['ArrowDown'];
      let ax = 0, ay = 0;
      if (L) ax -= 1; if (R) ax += 1;
      if (U) ay -= 1; if (D) ay += 1;
      const mag = Math.hypot(ax, ay) || 1;
      p.vx = (ax / mag) * PLAYER_SPEED;
      p.vy = (ay / mag) * PLAYER_SPEED;
      if (ax === 0 && ay === 0) { p.vx = 0; p.vy = 0; }
      p.x = Math.max(20, Math.min(W - 20, p.x + p.vx * dt));
      p.y = Math.max(20, Math.min(H - 20, p.y + p.vy * dt));

      p.angle = Math.atan2(Input.mouse.y - p.y, Input.mouse.x - p.x);

      // Bomb trigger (F or Space)
      if ((Input.keys['f'] || Input.keys['F'] || Input.keys[' ']) && this.bombs > 0) {
        this._detonateBomb();
        Input.keys['f'] = false; Input.keys['F'] = false; Input.keys[' '] = false;
      }

      this.fireTimer = Math.max(0, this.fireTimer - dt);
      if (Input.mouse.down && this.fireTimer <= 0) {
        const cd = p.overcharge > 0 ? FIRE_COOLDOWN * 0.4 : FIRE_COOLDOWN;
        this.fireTimer = cd;
        let spread;
        if (p.overcharge > 0) spread = [-0.15, 0, 0.15];
        else if (this.save.upgrades.dmg) spread = [-0.06, 0.06];
        else spread = [0];
        for (const s of spread) {
          const a = p.angle + s;
          this.bullets.push({
            x: p.x + Math.cos(a) * 14,
            y: p.y + Math.sin(a) * 14,
            vx: Math.cos(a) * BULLET_SPEED,
            vy: Math.sin(a) * BULLET_SPEED,
            life: 1.0
          });
        }
        this.sfx.play('shot');
      }

      if (p.overcharge > 0) p.overcharge = Math.max(0, p.overcharge - dt);

      for (const b of this.bullets) {
        b.x += b.vx * dt; b.y += b.vy * dt;
        b.life -= dt;
        if (b.x < -20 || b.x > W+20 || b.y < -20 || b.y > H+20) b.life = 0;
      }
      for (const b of this.bullets) {
        if (b.life <= 0) continue;
        if (this.boss) {
          const d = Math.hypot(b.x - this.boss.x, b.y - this.boss.y);
          if (d < this.boss.r) {
            this.boss.hp--;
            b.life = 0;
            this.sfx.play('hit');
            this.particles.burst(b.x, b.y, 3, { color: '#ffd86b', speed: 140, life: 0.25, size: 2 });
            if (!this.boss.phase2 && this.boss.hp <= this.boss.maxHp * 0.5) {
              this.boss.phase2 = true;
              this.flash('#ff4fd8', 0.3);
              this.sfx.play('boss');
              this.shake(12, 0.4);
            }
            if (this.boss.hp <= 0) this._killBoss();
            break;
          }
        }
        for (const e of this.enemies) {
          if (e.hp <= 0) continue;
          if (Math.hypot(b.x - e.x, b.y - e.y) < e.r + 3) {
            e.hp--; b.life = 0;
            this.sfx.play('hit');
            this.particles.burst(b.x, b.y, 4, { color: '#ffd86b', speed: 140, life: 0.25, size: 2 });
            if (e.hp <= 0) {
              this.addScore(50 + this.wave * 10);
              this.sfx.play('kill');
              this.particles.burst(e.x, e.y, 20, { color: e.type === 'chaser' ? '#ff4fd8' : '#ff8c3a', speed: 220, life: 0.7 });
              this.shake(3, 0.1);
              if (Math.random() < 0.12) {
                const kinds = ['overcharge', 'bomb', 'heal'];
                const kind = kinds[(Math.random() * kinds.length) | 0];
                this.pickups.push({ x: e.x, y: e.y, r: 10, age: 0, kind });
              }
              this.waveEnemiesLeft--;
            }
            break;
          }
        }
      }
      this.bullets = this.bullets.filter(b => b.life > 0);

      for (const e of this.enemies) {
        if (e.hp <= 0) continue;
        e.spawnAge += dt;
        const dx = p.x - e.x, dy = p.y - e.y;
        const L2 = Math.hypot(dx, dy) || 1;
        const s = e.type === 'chaser' ? e.speed : e.speed * 0.6;
        e.vx += (dx / L2) * s * dt * 2;
        e.vy += (dy / L2) * s * dt * 2;
        const v = Math.hypot(e.vx, e.vy);
        if (v > s) { e.vx = e.vx / v * s; e.vy = e.vy / v * s; }
        e.x += e.vx * dt; e.y += e.vy * dt;
        if (p.iframes <= 0 && Math.hypot(e.x - p.x, e.y - p.y) < e.r + p.r) {
          p.hp--;
          p.iframes = 1.2;
          this.sfx.play('hurt');
          this.shake(10, 0.35);
          this.flash('#ff4fd8', 0.2);
          this.particles.burst(p.x, p.y, 20, { color: '#ff4fd8', speed: 220, life: 0.6 });
          if (p.hp <= 0) { this._writeSave(); this._awardWallet(); this.gameOver(); return; }
        }
      }
      this.enemies = this.enemies.filter(e => e.hp > 0);

      // Boss update
      if (this.boss) {
        const b = this.boss;
        b.t += dt;
        b.x += b.vx * dt;
        if (b.x < 80) { b.x = 80; b.vx = -b.vx; }
        if (b.x > W - 80) { b.x = W - 80; b.vx = -b.vx; }
        b.y = 100 + Math.sin(b.t * 1.1) * 24;
        b.shootCd -= dt;
        if (b.shootCd <= 0) {
          const n = b.phase2 ? 12 : 7;
          const aimAng = Math.atan2(p.y - b.y, p.x - b.x);
          for (let i = 0; i < n; i++) {
            const a = aimAng + (i - (n - 1) / 2) * 0.2 + Math.sin(b.t) * 0.1;
            this.bullets.push({ x: b.x, y: b.y, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260, life: 4, hostile: true });
          }
          b.shootCd = b.phase2 ? 0.65 : 1.0;
        }
        // Boss body damage
        if (p.iframes <= 0 && Math.hypot(b.x - p.x, b.y - p.y) < b.r + p.r - 4) {
          p.hp--; p.iframes = 1.4;
          this.sfx.play('hurt');
          this.shake(10, 0.35);
          if (p.hp <= 0) { this._writeSave(); this._awardWallet(); this.gameOver(); return; }
        }
      }

      // Hostile bullets vs player
      for (let i = this.bullets.length - 1; i >= 0; i--) {
        const b = this.bullets[i];
        if (!b.hostile) continue;
        b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
        if (b.life <= 0 || b.x < -30 || b.x > W+30 || b.y < -30 || b.y > H+30) { this.bullets.splice(i,1); continue; }
        if (p.iframes <= 0 && Math.hypot(b.x - p.x, b.y - p.y) < p.r + 5) {
          p.hp--; p.iframes = 1.2;
          this.sfx.play('hurt');
          this.flash('#ff4fd8', 0.2);
          this.bullets.splice(i, 1);
          if (p.hp <= 0) { this._writeSave(); this._awardWallet(); this.gameOver(); return; }
        }
      }

      for (const pk of this.pickups) {
        pk.age += dt;
        if (Math.hypot(pk.x - p.x, pk.y - p.y) < pk.r + p.r) {
          pk.picked = true;
          if (pk.kind === 'overcharge') p.overcharge = Math.min(8, p.overcharge + 4);
          else if (pk.kind === 'bomb') this.bombs++;
          else if (pk.kind === 'heal') p.hp = Math.min(p.maxHp, p.hp + 1);
          this.addScore(30);
          this.sfx.play('pickup');
          this.particles.burst(pk.x, pk.y, 18, { color: '#7ae0ff', speed: 240, life: 0.6 });
        }
      }
      this.pickups = this.pickups.filter(pk => !pk.picked && pk.age < 12);

      if (!this.boss && this.waveEnemiesLeft <= 0 && this.enemies.length === 0) {
        this.wavesClearedThisRun++;
        this.wave++;
        this._writeSave();
        this.startWave();
      }

      this.setHud(this._hud());
    }

    _detonateBomb() {
      this.bombs--;
      this.sfx.play('bomb');
      this.flash('#ff4fd8', 0.35);
      this.shake(14, 0.4);
      this.particles.burst(this.player.x, this.player.y, 60, { color: '#ff4fd8', speed: 360, life: 0.8, size: 4 });
      // Clear all hostile bullets
      this.bullets = this.bullets.filter(b => !b.hostile);
      // Damage enemies on screen
      for (const e of this.enemies) {
        e.hp -= 3;
        if (e.hp <= 0) {
          this.addScore(40 + this.wave * 5);
          this.waveEnemiesLeft--;
          this.particles.burst(e.x, e.y, 12, { color: '#ff4fd8', speed: 200, life: 0.5 });
        }
      }
      if (this.boss) this.boss.hp -= 10;
    }

    _killBoss() {
      this.addScore(500 + this.wave * 20);
      this.particles.burst(this.boss.x, this.boss.y, 60, { color: '#fff', speed: 400, life: 1.0, size: 4 });
      this.shake(20, 0.6);
      this.flash('#fff', 0.4);
      this.sfx.play('kill', { freq: 100 });
      this.pickups.push({ x: this.boss.x - 30, y: this.boss.y, r: 10, age: 0, kind: 'bomb' });
      this.pickups.push({ x: this.boss.x + 30, y: this.boss.y, r: 10, age: 0, kind: 'overcharge' });
      this.pickups.push({ x: this.boss.x, y: this.boss.y + 30, r: 10, age: 0, kind: 'heal' });
      this.boss = null;
    }

    _updateShop(dt) {
      if (Input.mouse.justPressed) {
        for (const r of this.shopRects) {
          if (Input.mouse.x >= r.x && Input.mouse.x <= r.x + r.w &&
              Input.mouse.y >= r.y && Input.mouse.y <= r.y + r.h) {
            if (r.kind === 'launch') { this.phase = 'play'; this.startWave(); return; }
            if (r.kind === 'buy') {
              const u = UPGRADES[r.i];
              const lvl = this.save.upgrades[u.id] || 0;
              if (lvl < u.max && Storage.spendGameWallet(GID, u.cost)) {
                this.save.upgrades[u.id] = lvl + 1;
                Storage.setGameData('stargazer', {
                  bestWave: this.save.bestWave, upgrades: this.save.upgrades
                });
                this.sfx.play('buy');
                this.player.maxHp = 3 + this.save.upgrades.hp;
                this.player.hp = this.player.maxHp;
                this.bombs = this.save.upgrades.bomb;
                this.player.overcharge = this.save.upgrades.oc ? 2 : 0;
              }
              return;
            }
          }
        }
      }
    }

    _hud() {
      if (this.phase === 'shop') return '<span>Pre-run shop</span>';
      const oc = this.player.overcharge > 0 ? ` [OC ${this.player.overcharge.toFixed(1)}s]` : '';
      const bombs = this.bombs > 0 ? ` <b style="color:#ff4fd8">B${this.bombs}</b>` : '';
      return `<span>Wave <b>${this.wave}</b>${this.boss ? ' <b style="color:#ff4fd8">BOSS</b>' : ''}</span>` +
             `<span>HP <b>${'♡'.repeat(Math.max(0,this.player.hp))}</b>${bombs}</span>` +
             `<span>Score <b>${this.score}</b>${oc}</span>`;
    }

    render(ctx) {
      if (this.phase === 'shop') { this._renderShop(ctx); return; }
      ctx.fillStyle = '#040214'; ctx.fillRect(0, 0, W, H);
      for (const s of this.stars) {
        ctx.fillStyle = `rgba(255,255,255,${0.3 + s.z * 0.4})`;
        const sz = Math.max(1, s.z);
        ctx.fillRect(s.x, s.y, sz, sz);
      }

      for (const pk of this.pickups) {
        const pulse = Math.sin(pk.age * 6) * 0.4 + 0.6;
        const col = pk.kind === 'bomb' ? '#ff4fd8' : pk.kind === 'heal' ? '#66ff88' : '#7ae0ff';
        ctx.save();
        ctx.shadowColor = col; ctx.shadowBlur = 18;
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(pk.x, pk.y, pk.r * pulse, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.font = 'bold 10px ui-monospace, monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(pk.kind[0].toUpperCase(), pk.x, pk.y);
        ctx.restore();
      }

      for (const e of this.enemies) {
        const color = e.type === 'chaser' ? '#ff4fd8' : '#ff8c3a';
        ctx.save();
        ctx.shadowColor = color; ctx.shadowBlur = 14;
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 0.35, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      if (this.boss) {
        const b = this.boss;
        ctx.save();
        ctx.shadowColor = b.phase2 ? '#ff4fd8' : '#ff8c3a'; ctx.shadowBlur = 26;
        ctx.fillStyle = b.phase2 ? '#ff4fd8' : '#ff8c3a';
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.3, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        // hp bar
        const pct = b.hp / b.maxHp;
        ctx.fillStyle = '#400';
        ctx.fillRect(60, 20, W - 120, 10);
        ctx.fillStyle = b.phase2 ? '#ff4fd8' : '#f66';
        ctx.fillRect(60, 20, (W - 120) * pct, 10);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('SENTINEL', W/2, 28);
      }

      for (const b of this.bullets) {
        ctx.save();
        if (b.hostile) {
          ctx.shadowColor = '#ff4fd8'; ctx.shadowBlur = 10;
          ctx.fillStyle = '#ff4fd8';
          ctx.beginPath(); ctx.arc(b.x, b.y, 4, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.shadowColor = '#ffd86b'; ctx.shadowBlur = 10;
          ctx.fillStyle = '#ffd86b';
          ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      }

      const p = this.player;
      const alpha = p.iframes > 0 ? (Math.floor(p.iframes * 15) % 2 === 0 ? 0.4 : 1) : 1;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.shadowColor = p.overcharge > 0 ? '#ff4fd8' : '#7ae0ff';
      ctx.shadowBlur = p.overcharge > 0 ? 22 : 14;
      ctx.fillStyle = p.overcharge > 0 ? '#ff4fd8' : '#7ae0ff';
      ctx.beginPath();
      ctx.moveTo(14, 0); ctx.lineTo(-10, -9); ctx.lineTo(-5, 0); ctx.lineTo(-10, 9); ctx.closePath();
      ctx.fill();
      ctx.restore();

      const ax = Input.mouse.x, ay = Input.mouse.y;
      ctx.setLineDash([4, 6]);
      ctx.strokeStyle = '#7ae0ff33';
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(ax, ay); ctx.stroke();
      ctx.setLineDash([]);

      // bomb hint
      if (this.bombs > 0) {
        ctx.fillStyle = '#ff4fd8cc';
        ctx.font = 'bold 11px ui-monospace, monospace';
        ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
        ctx.fillText('F / SPACE: BOMB (' + this.bombs + ')', 14, H - 10);
      }
    }

    _renderShop(ctx) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#140428'); g.addColorStop(1, '#020008');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      for (const s of this.stars) {
        ctx.fillStyle = `rgba(255,255,255,${0.2 + s.z * 0.3})`;
        ctx.fillRect(s.x, s.y, Math.max(1, s.z), Math.max(1, s.z));
      }

      ctx.fillStyle = '#7ae0ff';
      ctx.font = 'bold 40px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText('STARGAZER', W / 2, 50);
      ctx.fillStyle = '#a58abd';
      ctx.font = '14px ui-monospace, monospace';
      ctx.fillText('survive the void. boss every 10 waves. best: wave ' + this.save.bestWave, W / 2, 96);
      ctx.fillStyle = '#7ae0ff';
      ctx.font = 'bold 16px ui-monospace, monospace';
      ctx.fillText('Lensgleam: \u25CF ' + Storage.getGameWallet(GID), W / 2, 124);

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
      ctx.fillStyle = '#0a2a4a';
      ctx.fillRect(cbx, cby, cbw, cbh);
      ctx.strokeStyle = '#7ae0ff'; ctx.lineWidth = 2;
      ctx.strokeRect(cbx + 0.5, cby + 0.5, cbw, cbh);
      ctx.fillStyle = '#cfe8ff';
      ctx.font = 'bold 18px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('DEPLOY \u2197', W / 2, cby + cbh / 2);
      this.shopRects.push({ x: cbx, y: cby, w: cbw, h: cbh, kind: 'launch' });
    }

    coinsEarned() {
      const cleared = this.wavesClearedThisRun | 0;
      const winBonus = this.victoryAchieved ? 20 : 0;
      return cleared * 2 + winBonus;
    }
  }

  NDP.attachGame('stargazer', StargazerGame);
})();
