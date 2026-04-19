/* Ricochet — one bullet, ricochets off walls/obstacles.
   Now: enemy variety, boss every 5 levels, pre-run perk shop, persistent unlocks.

   Currency model: per-game wallet ('Ricochets') under Storage.*GameWallet
   ('ricochet'). Pre-run shop spends Ricochets only. Wallet awarded at
   end-of-run from level milestones. NG+/persistent (campaign victory does
   not wipe). */
(function () {
  const NDP = window.NDP;
  const { BaseGame, Input, Storage } = NDP.Engine;

  const W = 960, H = 600;
  const GID = 'ricochet';

  const UPGRADES = [
    { id: 'bounce',   label: '+Bounces',      desc: '+4 max bounces per tier', cost: 80,  max: 3, color: '#4fc8ff' },
    { id: 'pierce',   label: 'Piercing Shot', desc: 'Bullet passes 1 enemy',   cost: 160, max: 1, color: '#ffd86b' },
    { id: 'aim',      label: 'Aim Assist',    desc: 'Predictive aim line',     cost: 60,  max: 1, color: '#a58abd' },
    { id: 'power',    label: 'Heavy Round',   desc: 'Breaks shields in 1 hit', cost: 140, max: 1, color: '#ff4fd8' }
  ];

  class RicochetGame extends BaseGame {
    init() {
      const d = Storage.getGameData('ricochet') || {};
      this.save = {
        bestLevel: d.bestLevel || 0,
        upgrades:  Object.assign({ bounce:0, pierce:0, aim:0, power:0 }, d.upgrades || {})
      };
      this.phase = 'shop';   // 'shop' | 'play' | 'victory'
      this.shopRects = [];

      this.level = 1;
      this.levelsCleared = 0;
      this.levelsClearedThisRun = 0;
      this.victoryAchieved = false;
      this.misses = 0;
      this.maxLevel = 25;
      this.setHud(this._hud());
      this.sfx = this.makeSfx({
        fire:    { freq: 420, type: 'square', dur: 0.1, slide: 320, vol: 0.4 },
        bounce:  { freq: 880, type: 'triangle', dur: 0.05, vol: 0.3 },
        kill:    { freq: 260, type: 'sawtooth', dur: 0.15, slide: -120, vol: 0.5 },
        shield:  { freq: 620, type: 'square', dur: 0.06, vol: 0.3, slide: -200 },
        lose:    { freq: 120, type: 'sawtooth', dur: 0.4, slide: -80, vol: 0.5 },
        win:     { freq: 660, type: 'triangle', dur: 0.2, slide: 240, vol: 0.5 },
        buy:     { freq: 1100,type: 'square',   dur: 0.1, vol: 0.4 },
        boss:    { freq: 120, type: 'sawtooth', dur: 0.4, slide: 80, vol: 0.45 }
      });
      this.nextLevel();
    }

    _writeSave() {
      Storage.setGameData('ricochet', {
        bestLevel: Math.max(this.save.bestLevel, this.levelsCleared),
        upgrades: this.save.upgrades
      });
      this.save.bestLevel = Math.max(this.save.bestLevel, this.levelsCleared);
    }

    _awardWallet() {
      const award = this.coinsEarned();
      if (award > 0) Storage.addGameWallet(GID, award);
    }

    nextLevel() {
      const L = this.level;
      this.player = { x: W / 2, y: H - 60 };
      this.enemies = [];
      this.obstacles = [];
      this.portals = [];
      this.popups = [];     // floating texts: combos, hits
      this.bullet = null;
      this.fired = false;
      this.levelResult = null;
      this.levelPause = 0;
      this.pierceLeft = this.save.upgrades.pierce;
      // Per-shot stats for the post-shot summary card.
      this.shotStats = { kills: 0, bounces: 0, bestCombo: 0, bonus: 0 };

      const isBoss = L % 5 === 0;
      if (isBoss) {
        // Single tanky enemy center-ish, with orbital obstacles
        const bossHp = 3 + Math.floor(L / 5);
        this.enemies.push({
          x: W / 2, y: H * 0.4, r: 34,
          hp: bossHp, maxHp: bossHp,
          vx: 40, vy: 20,
          alive: true, kind: 'boss', color: '#ff7744',
          phase2: false
        });
        this.sfx.play('boss');
        // orbital obstacles
        const obCount = 3;
        for (let i = 0; i < obCount; i++) {
          this.obstacles.push({
            x: W/2 - 40, y: H/2 + i * 60, w: 80, h: 18,
            orbit: true, orbitA: i * (Math.PI*2/obCount), orbitR: 180, cx: W/2, cy: H * 0.4
          });
        }
      } else {
        const enemyCount = Math.min(2 + Math.floor(L / 2), 8);
        const speedCap = Math.min(60, 8 * L);
        for (let i = 0; i < enemyCount; i++) {
          const r = Math.random();
          let kind = 'normal';
          if (L >= 3 && r < 0.28) kind = 'shielded';
          else if (L >= 5 && r < 0.45) kind = 'seeker';
          else if (L >= 7 && r < 0.55) kind = 'splitter';
          const e = {
            x: 80 + Math.random() * (W - 160),
            y: 70 + Math.random() * (H - 250),
            r: kind === 'shielded' ? 20 : 18,
            vx: (Math.random() - 0.5) * speedCap,
            vy: (Math.random() - 0.5) * speedCap,
            alive: true,
            kind,
            hp: kind === 'shielded' ? 2 : 1,
            color: kind === 'shielded' ? '#88e8ff' :
                   kind === 'seeker' ? '#ff4466' :
                   kind === 'splitter' ? '#ffa04f' : '#ff4fd8'
          };
          if (Math.hypot(e.x - this.player.x, e.y - this.player.y) < 160) e.y -= 100;
          this.enemies.push(e);
        }
        const obsCount = Math.min(Math.floor(L / 2), 5);
        for (let i = 0; i < obsCount; i++) {
          const w = 40 + Math.random() * 80;
          const h = 40 + Math.random() * 80;
          const rx = 80 + Math.random() * (W - 160 - w);
          const ry = 80 + Math.random() * (H - 280 - h);
          this.obstacles.push({ x: rx, y: ry, w, h });
        }
        // Portal pairs — appear from level 4 onward, second pair from level 8.
        // Bullet entering one portal exits the other along its current heading.
        const portalPairs = L >= 8 ? 2 : (L >= 4 ? 1 : 0);
        for (let i = 0; i < portalPairs; i++) {
          const a = this._placePortal();
          const b = this._placePortal();
          if (a && b) {
            a.pair = b; b.pair = a;
            this.portals.push(a, b);
          }
        }
      }

      this.bulletEnergy = 1.0;
      this.bulletBounces = 0;
      this.maxBounces = 14 + L + this.save.upgrades.bounce * 4;
    }

    // ---------- Helpers ----------

    _placePortal() {
      // Find a free spot not overlapping obstacles or the player.
      for (let attempt = 0; attempt < 24; attempt++) {
        const x = 90 + Math.random() * (W - 180);
        const y = 90 + Math.random() * (H - 240);
        let ok = true;
        for (const o of this.obstacles) {
          if (x + 24 > o.x && x - 24 < o.x + o.w && y + 24 > o.y && y - 24 < o.y + o.h) { ok = false; break; }
        }
        if (Math.hypot(x - this.player.x, y - this.player.y) < 80) ok = false;
        if (ok) return { kind: 'portal', x, y, r: 18, t: Math.random() * 6 };
      }
      return null;
    }

    _popup(text, x, y, color) {
      this.popups.push({ text, x, y, color: color || '#ffd86b', vy: -60, life: 1.0, age: 0 });
    }

    // Raytrace a single ray, recording bounces against walls & rect obstacles.
    // Returns array of points: [start, hit1, ..., hitN+1] where the last is
    // an approximate end past `maxLen` total distance.
    _raycastBounces(x, y, dx, dy, maxBounces, maxLen) {
      const points = [{ x, y }];
      let remain = maxLen;
      const minX = 30, minY = 30, maxX = W - 30, maxY = H - 30;
      // Static rects to test against (walls treated separately as bounds)
      const rects = this.obstacles.filter(o => !o.kind);  // skip portals
      for (let b = 0; b <= maxBounces && remain > 0.5; b++) {
        let bestT = remain, hitNx = 0, hitNy = 0;
        // Walls
        if (dx > 0) {
          const t = (maxX - x) / dx;
          if (t > 0.001 && t < bestT) { bestT = t; hitNx = -1; hitNy = 0; }
        } else if (dx < 0) {
          const t = (minX - x) / dx;
          if (t > 0.001 && t < bestT) { bestT = t; hitNx = 1;  hitNy = 0; }
        }
        if (dy > 0) {
          const t = (maxY - y) / dy;
          if (t > 0.001 && t < bestT) { bestT = t; hitNx = 0; hitNy = -1; }
        } else if (dy < 0) {
          const t = (minY - y) / dy;
          if (t > 0.001 && t < bestT) { bestT = t; hitNx = 0; hitNy = 1; }
        }
        // Rects (slab test; record nearest face normal)
        for (const o of rects) {
          // Compute per-axis enter / exit
          const inv1 = dx === 0 ? -Infinity : (o.x - x) / dx;
          const inv2 = dx === 0 ?  Infinity : (o.x + o.w - x) / dx;
          const inv3 = dy === 0 ? -Infinity : (o.y - y) / dy;
          const inv4 = dy === 0 ?  Infinity : (o.y + o.h - y) / dy;
          const tx1 = Math.min(inv1, inv2), tx2 = Math.max(inv1, inv2);
          const ty1 = Math.min(inv3, inv4), ty2 = Math.max(inv3, inv4);
          const tEnter = Math.max(tx1, ty1);
          const tExit  = Math.min(tx2, ty2);
          if (tExit < tEnter || tExit < 0.001) continue;
          if (tEnter > 0.001 && tEnter < bestT) {
            bestT = tEnter;
            // Determine which face (smaller-of-axis enter)
            if (tx1 > ty1) { hitNx = dx > 0 ? -1 : 1; hitNy = 0; }
            else           { hitNx = 0; hitNy = dy > 0 ? -1 : 1; }
          }
        }
        // Advance to the hit point
        x += dx * bestT; y += dy * bestT;
        remain -= bestT;
        points.push({ x, y });
        // Reflect velocity off the surface normal
        if (hitNx !== 0) dx = -dx;
        if (hitNy !== 0) dy = -dy;
        // If we hit nothing and consumed remaining length, we're done.
        if (hitNx === 0 && hitNy === 0) break;
      }
      return points;
    }

    update(dt) {
      if (this.phase === 'shop') { this._updateShop(dt); return; }
      if (this.phase === 'victory') return;

      // Floating combo popups
      for (const pp of this.popups) {
        pp.age += dt;
        pp.y += pp.vy * dt;
        pp.vy *= Math.pow(0.5, dt);  // ease out
      }
      this.popups = this.popups.filter(pp => pp.age < pp.life);
      // Portal idle anim
      for (const p of this.portals) p.t = (p.t || 0) + dt;

      // Enemies drift + orbital obstacle motion + seeker logic
      for (const o of this.obstacles) {
        if (o.orbit) {
          o.orbitA += dt * 0.6;
          o.x = o.cx - o.w/2 + Math.cos(o.orbitA) * o.orbitR;
          o.y = o.cy - o.h/2 + Math.sin(o.orbitA) * o.orbitR;
        }
      }
      for (const e of this.enemies) {
        if (!e.alive) continue;
        if (e.kind === 'seeker' && this.bullet && !this.levelResult) {
          const dx = this.bullet.x - e.x, dy = this.bullet.y - e.y;
          const d = Math.hypot(dx, dy) || 1;
          e.vx -= dx / d * 30 * dt; // flee bullet
          e.vy -= dy / d * 30 * dt;
        }
        e.x += e.vx * dt; e.y += e.vy * dt;
        if (e.x < 30 + e.r || e.x > W - 30 - e.r) e.vx = -e.vx;
        if (e.y < 30 + e.r || e.y > H - 30 - e.r) e.vy = -e.vy;
        for (const o of this.obstacles) {
          if (e.x + e.r > o.x && e.x - e.r < o.x + o.w && e.y + e.r > o.y && e.y - e.r < o.y + o.h) {
            e.vx = -e.vx; e.vy = -e.vy;
            if (e.x < o.x) e.x = o.x - e.r - 1; else if (e.x > o.x + o.w) e.x = o.x + o.w + e.r + 1;
            if (e.y < o.y) e.y = o.y - e.r - 1; else if (e.y > o.y + o.h) e.y = o.y + o.h + e.r + 1;
          }
        }
        // cap speed
        const v = Math.hypot(e.vx, e.vy);
        const cap = e.kind === 'boss' ? 80 : 160;
        if (v > cap) { e.vx = e.vx/v*cap; e.vy = e.vy/v*cap; }
      }

      if (!this.fired && Input.mouse.justPressed) {
        const dx = Input.mouse.x - this.player.x;
        const dy = Input.mouse.y - this.player.y;
        const L = Math.hypot(dx, dy) || 1;
        const speed = 720;
        this.bullet = {
          x: this.player.x, y: this.player.y,
          vx: dx / L * speed, vy: dy / L * speed,
          trail: [],
          portalCool: 0  // brief debounce after a portal teleport
        };
        this.fired = true;
        this.shotStats = { kills: 0, bounces: 0, bestCombo: 0, bonus: 0 };
        this.sfx.play('fire');
        this.shake(3, 0.12);
      }

      if (this.bullet && !this.levelResult) {
        const b = this.bullet;
        b.trail.push({ x: b.x, y: b.y });
        if (b.trail.length > 80) b.trail.shift();
        if (b.portalCool > 0) b.portalCool -= dt;
        const steps = 4;
        for (let s = 0; s < steps; s++) {
          const d = dt / steps;
          b.x += b.vx * d; b.y += b.vy * d;

          if (b.x < 30) { b.x = 30; b.vx = Math.abs(b.vx); this.bulletBounce(); }
          else if (b.x > W - 30) { b.x = W - 30; b.vx = -Math.abs(b.vx); this.bulletBounce(); }
          if (b.y < 30) { b.y = 30; b.vy = Math.abs(b.vy); this.bulletBounce(); }
          else if (b.y > H - 30) { b.y = H - 30; b.vy = -Math.abs(b.vy); this.bulletBounce(); }

          for (const o of this.obstacles) {
            if (b.x > o.x && b.x < o.x + o.w && b.y > o.y && b.y < o.y + o.h) {
              const left = b.x - o.x, right = o.x + o.w - b.x;
              const top = b.y - o.y, bot = o.y + o.h - b.y;
              const m = Math.min(left, right, top, bot);
              if (m === left) { b.x = o.x; b.vx = -Math.abs(b.vx); }
              else if (m === right) { b.x = o.x + o.w; b.vx = Math.abs(b.vx); }
              else if (m === top) { b.y = o.y; b.vy = -Math.abs(b.vy); }
              else { b.y = o.y + o.h; b.vy = Math.abs(b.vy); }
              this.bulletBounce();
            }
          }

          // Portals: teleport bullet to its pair (with brief debounce so it
          // doesn't immediately re-enter the destination portal).
          if (b.portalCool <= 0) {
            for (const p of this.portals) {
              if (Math.hypot(b.x - p.x, b.y - p.y) < p.r) {
                const exit = p.pair;
                // Place bullet on the far side of the destination portal,
                // displaced along travel direction.
                const sp = Math.hypot(b.vx, b.vy) || 1;
                b.x = exit.x + (b.vx / sp) * (exit.r + 4);
                b.y = exit.y + (b.vy / sp) * (exit.r + 4);
                b.portalCool = 0.18;
                this.sfx.play('bounce', { freq: 1320 });
                this.particles.burst(p.x, p.y, 14, { color: '#a58aff', speed: 220, life: 0.5, size: 2 });
                this.particles.burst(exit.x, exit.y, 14, { color: '#a58aff', speed: 220, life: 0.5, size: 2 });
                break;
              }
            }
          }

          for (const e of this.enemies) {
            if (!e.alive) continue;
            if (Math.hypot(b.x - e.x, b.y - e.y) < e.r + 3) {
              if (e.kind === 'shielded' && e.hp > 1 && !this.save.upgrades.power) {
                e.hp--;
                this.sfx.play('shield');
                const dx = b.x - e.x, dy = b.y - e.y;
                const dd = Math.hypot(dx, dy) || 1;
                b.vx = dx/dd * 720; b.vy = dy/dd * 720;
                this.particles.burst(b.x, b.y, 6, { color: e.color, speed: 180, life: 0.3, size: 2 });
                continue;
              }
              e.hp--;
              if (e.hp <= 0) {
                e.alive = false;
                this.addScore(100);
                this.shotStats.kills++;
                this._onShotKill(e);
                this.particles.burst(e.x, e.y, 18, { color: e.color, speed: 200, life: 0.7 });
                this.sfx.play('kill');
                this.shake(4, 0.14);
                this.flash(e.color, 0.05);
                if (e.kind === 'splitter') {
                  for (let k = 0; k < 2; k++) {
                    this.enemies.push({
                      x: e.x, y: e.y, r: 10,
                      vx: (Math.random()-0.5)*140, vy: (Math.random()-0.5)*140,
                      alive: true, kind: 'normal', hp: 1, color: '#ffd86b'
                    });
                  }
                }
              } else if (e.kind === 'boss' && !e.phase2 && e.hp <= e.maxHp / 2) {
                this._enterBossPhase2(e);
              }
              if (this.pierceLeft > 0) {
                this.pierceLeft--;
                continue;
              }
              if (e.kind !== 'shielded' || this.save.upgrades.power) {
                b.vx *= 0.6; b.vy *= 0.6;
              }
            }
          }
        }

        if (this.bulletBounces >= this.maxBounces || this.bulletEnergy <= 0) {
          this.endLevel(false);
        }

        if (this.enemies.every(e => !e.alive)) this.endLevel(true);
      }

      if (this.levelResult) {
        this.levelPause += dt;
        if (this.levelPause > 1.0) {
          if (this.levelResult === 'won') {
            this.levelsCleared++;
            this.levelsClearedThisRun++;
            this.level++;
            this._writeSave();
            if (this.level > this.maxLevel) {
              this.phase = 'victory';
              this.victoryAchieved = true;
              this._awardWallet();
              setTimeout(() => this.win(), 1200);
              return;
            }
            this.nextLevel();
          } else {
            this.misses++;
            this.nextLevel();
          }
        }
      }
      this.setHud(this._hud());
    }

    bulletBounce() {
      this.bulletBounces++;
      if (this.shotStats) this.shotStats.bounces++;
      this.bulletEnergy = 1 - (this.bulletBounces / this.maxBounces);
      this.sfx.play('bounce', { freq: 880 - this.bulletBounces * 60 });
      this.particles.burst(this.bullet.x, this.bullet.y, 4, { color: '#4fc8ff', speed: 100, life: 0.3, size: 2 });
    }

    _onShotKill(e) {
      // Combo bonuses scale with kill chain in a single shot.
      const k = this.shotStats.kills;
      this.shotStats.bestCombo = Math.max(this.shotStats.bestCombo, k);
      const tiers = { 2: { label: 'DOUBLE!', bonus: 50, color: '#7ae0ff' },
                      3: { label: 'TRIPLE!', bonus: 150, color: '#ffd86b' },
                      4: { label: 'QUAD!',   bonus: 300, color: '#ff4fd8' } };
      const t = tiers[k] || (k >= 5 ? { label: 'INSANE!', bonus: 500 + (k - 5) * 200, color: '#ff7744' } : null);
      if (t) {
        this.shotStats.bonus += t.bonus;
        this.addScore(t.bonus);
        this._popup(t.label + ' +' + t.bonus, e.x, e.y - 24, t.color);
        this.flash(t.color, 0.12);
        this.shake(6, 0.18);
      } else {
        this._popup('+100', e.x, e.y - 14, '#ffffffcc');
      }
    }

    _enterBossPhase2(e) {
      e.phase2 = true;
      this.flash('#ff7744', 0.25);
      this.shake(8, 0.3);
      this.sfx.play('boss', { freq: 80 });
      this._popup('PHASE 2', e.x, e.y - e.r - 24, '#ff7744');
      // Spawn two fast minions that orbit the boss and act as moving shields.
      for (let k = -1; k <= 1; k += 2) {
        this.enemies.push({
          x: e.x + k * 60, y: e.y, r: 12,
          vx: -k * 200, vy: k * 80,
          alive: true, hp: 1,
          kind: 'normal', color: '#ffaa66',
          guard: e
        });
      }
      // Speed up boss
      e.vx *= 1.6; e.vy *= 1.6;
    }

    endLevel(won) {
      if (this.levelResult) return;
      this.levelResult = won ? 'won' : 'lost';
      this.levelPause = 0;
      if (won) { this.sfx.play('win'); this.flash('#4ade80', 0.08); this.addScore(200); }
      else { this.sfx.play('lose'); this.flash('#f87171', 0.12); this.shake(8, 0.3); }
    }

    _hud() {
      if (this.phase === 'shop') return '<span>Pre-run shop</span>';
      const bossNote = (this.level % 5 === 0) ? ' <b style="color:#ff7744">BOSS</b>' : '';
      return `<span>Level <b>${this.level}/${this.maxLevel}</b>${bossNote}</span>` +
             `<span>Cleared <b>${this.levelsCleared}</b></span>` +
             `<span>Misses <b>${this.misses}</b></span>` +
             `<span>Score <b>${this.score}</b></span>`;
    }

    // -------- SHOP --------
    _updateShop(dt) {
      if (Input.mouse.justPressed) {
        for (const r of this.shopRects) {
          if (Input.mouse.x >= r.x && Input.mouse.x <= r.x + r.w &&
              Input.mouse.y >= r.y && Input.mouse.y <= r.y + r.h) {
            if (r.kind === 'launch') { this.phase = 'play'; return; }
            if (r.kind === 'buy') {
              const u = UPGRADES[r.i];
              const lvl = this.save.upgrades[u.id] || 0;
              if (lvl < u.max && Storage.spendGameWallet(GID, u.cost)) {
                this.save.upgrades[u.id] = lvl + 1;
                Storage.setGameData('ricochet', {
                  bestLevel: this.save.bestLevel,
                  upgrades: this.save.upgrades
                });
                this.sfx.play('buy');
                this.maxBounces = 14 + this.level + this.save.upgrades.bounce * 4;
              }
              return;
            }
          }
        }
      }
    }

    render(ctx) {
      if (this.phase === 'shop') { this._renderShop(ctx); return; }
      ctx.fillStyle = '#05060c'; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = '#0a1830';
      ctx.lineWidth = 1;
      for (let i = 30; i < W - 30; i += 30) { ctx.beginPath(); ctx.moveTo(i, 30); ctx.lineTo(i, H - 30); ctx.stroke(); }
      for (let j = 30; j < H - 30; j += 30) { ctx.beginPath(); ctx.moveTo(30, j); ctx.lineTo(W - 30, j); ctx.stroke(); }
      ctx.strokeStyle = '#3a5ea8'; ctx.lineWidth = 2;
      ctx.strokeRect(30, 30, W - 60, H - 60);

      for (const o of this.obstacles) {
        ctx.fillStyle = o.orbit ? '#3a2540' : '#1b2540';
        ctx.fillRect(o.x, o.y, o.w, o.h);
        ctx.strokeStyle = o.orbit ? '#ff7744' : '#3a5ea8'; ctx.lineWidth = 2;
        ctx.strokeRect(o.x, o.y, o.w, o.h);
      }

      // Portals: linked pairs, glow + slow rotation
      for (const p of this.portals) {
        const pulse = 0.6 + Math.sin((p.t || 0) * 4) * 0.4;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.t || 0) * 0.8);
        ctx.shadowColor = '#a58aff'; ctx.shadowBlur = 22 * pulse;
        ctx.strokeStyle = '#a58aff'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = '#ddd0ff'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(0, 0, p.r - 6, 0, Math.PI * 1.2); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, p.r - 6, Math.PI * 1.5, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }

      if (!this.fired) {
        const mx = Input.mouse.x, my = Input.mouse.y;
        const dx = mx - this.player.x, dy = my - this.player.y;
        const L = Math.hypot(dx, dy) || 1;
        const ax = dx / L, ay = dy / L;
        if (this.save.upgrades.aim) {
          // Real predictive aim: raytrace 3 bounces forward.
          const points = this._raycastBounces(
            this.player.x + ax * 18, this.player.y + ay * 18,
            ax, ay, 3, 1400
          );
          ctx.save();
          ctx.setLineDash([5, 5]);
          ctx.strokeStyle = '#a58aff'; ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(points[0].x, points[0].y);
          for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
          ctx.stroke();
          ctx.setLineDash([]);
          // Mark predicted bounce points
          ctx.fillStyle = '#a58aff';
          for (let i = 1; i < points.length - 1; i++) {
            ctx.beginPath(); ctx.arc(points[i].x, points[i].y, 3, 0, Math.PI * 2); ctx.fill();
          }
          ctx.restore();
        } else {
          ctx.save();
          ctx.setLineDash([6, 6]);
          ctx.strokeStyle = '#4fc8ff66'; ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(this.player.x + ax * 20, this.player.y + ay * 20);
          ctx.lineTo(this.player.x + ax * 300, this.player.y + ay * 300);
          ctx.stroke();
          ctx.restore();
        }
      }

      for (const e of this.enemies) {
        if (!e.alive) continue;
        ctx.save();
        ctx.shadowColor = e.color; ctx.shadowBlur = 14;
        ctx.fillStyle = e.color;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill();
        if (e.kind === 'shielded' && e.hp > 1) {
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 4, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 0.4, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        // boss hp bar + phase 2 fury ring
        if (e.kind === 'boss') {
          const pct = e.hp / e.maxHp;
          ctx.fillStyle = '#200';
          ctx.fillRect(e.x - 40, e.y - e.r - 16, 80, 5);
          ctx.fillStyle = e.phase2 ? '#ff4fd8' : '#ff7744';
          ctx.fillRect(e.x - 40, e.y - e.r - 16, 80 * pct, 5);
          if (e.phase2) {
            const pulse = 0.6 + Math.sin(this.time * 6) * 0.4;
            ctx.save();
            ctx.strokeStyle = '#ff4fd8'; ctx.lineWidth = 2;
            ctx.shadowColor = '#ff4fd8'; ctx.shadowBlur = 18 * pulse;
            ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 8, 0, Math.PI * 2); ctx.stroke();
            ctx.restore();
          }
        }
      }

      if (this.bullet) {
        const b = this.bullet;
        ctx.save();
        ctx.strokeStyle = '#4fc8ff';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#4fc8ff'; ctx.shadowBlur = 12;
        ctx.beginPath();
        b.trail.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(b.x, b.y, 5, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      ctx.save();
      ctx.fillStyle = '#ffd86b';
      ctx.shadowColor = '#ffd86b'; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(this.player.x, this.player.y, 12, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      ctx.fillStyle = '#1b2540';
      ctx.fillRect(30, H - 16, W - 60, 6);
      ctx.fillStyle = this.bulletEnergy > 0.3 ? '#4fc8ff' : '#f87171';
      ctx.fillRect(30, H - 16, (W - 60) * this.bulletEnergy, 6);

      // Floating combo popups (drawn above world, below result)
      for (const pp of this.popups) {
        const a = Math.max(0, 1 - pp.age / pp.life);
        ctx.save();
        ctx.globalAlpha = a;
        ctx.fillStyle = pp.color;
        ctx.font = 'bold 16px ui-monospace, monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.shadowColor = '#000'; ctx.shadowBlur = 4;
        ctx.fillText(pp.text, pp.x, pp.y);
        ctx.restore();
      }

      if (this.levelResult) {
        // Summary card — kills, bounces, combo, bonus
        const won = this.levelResult === 'won';
        const cardW = 360, cardH = 168;
        const cx = W / 2 - cardW / 2, cy = H / 2 - cardH / 2;
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#0a1828';
        ctx.fillRect(cx, cy, cardW, cardH);
        ctx.strokeStyle = won ? '#4ade80' : '#f87171'; ctx.lineWidth = 3;
        ctx.strokeRect(cx + 1, cy + 1, cardW - 2, cardH - 2);
        ctx.fillStyle = won ? '#4ade80' : '#f87171';
        ctx.font = 'bold 26px ui-monospace, monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(won ? 'LEVEL ' + this.level + ' CLEAR' : 'RETRY', W/2, cy + 14);
        ctx.fillStyle = '#cfe8ff';
        ctx.font = '13px ui-monospace, monospace';
        const s = this.shotStats;
        const lines = [
          'Kills    ' + s.kills,
          'Bounces  ' + s.bounces,
          'Best combo  x' + Math.max(1, s.bestCombo),
          'Combo bonus  +' + s.bonus
        ];
        for (let i = 0; i < lines.length; i++) {
          ctx.fillText(lines[i], W/2, cy + 56 + i * 22);
        }
      }
    }

    _renderShop(ctx) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#0a1428'); g.addColorStop(1, '#02040a');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

      ctx.fillStyle = '#4fc8ff';
      ctx.font = 'bold 40px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText('RICOCHET', W / 2, 50);
      ctx.fillStyle = '#a58abd';
      ctx.font = '14px ui-monospace, monospace';
      ctx.fillText('25 levels, boss every 5. best: ' + this.save.bestLevel, W / 2, 96);
      ctx.fillStyle = '#4fc8ff';
      ctx.font = 'bold 16px ui-monospace, monospace';
      ctx.fillText('Ricochets: \u25CF ' + Storage.getGameWallet(GID), W / 2, 124);

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
      ctx.strokeStyle = '#4fc8ff'; ctx.lineWidth = 2;
      ctx.strokeRect(cbx + 0.5, cby + 0.5, cbw, cbh);
      ctx.fillStyle = '#cfe8ff';
      ctx.font = 'bold 18px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('BEGIN \u25ba', W / 2, cby + cbh / 2);
      this.shopRects.push({ x: cbx, y: cby, w: cbw, h: cbh, kind: 'launch' });
    }

    coinsEarned() {
      const cleared = this.levelsClearedThisRun | 0;
      const winBonus = this.victoryAchieved ? 25 : 0;
      return cleared * 1 + winBonus;
    }
  }

  NDP.attachGame('ricochet', RicochetGame);
})();
