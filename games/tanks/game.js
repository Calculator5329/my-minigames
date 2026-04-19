/* Tanks — turn-based artillery vs AI with multi-weapon campaign. */
(function () {
  const NDP = window.NDP;
  const { BaseGame, Input, Storage } = NDP.Engine;

  const W = 960, H = 600;
  const GRAVITY = 260;

  const WEAPONS = [
    { id: 'standard', name: 'Shell',   gravMul: 1.0, radius: 70,  dmg: 50, color: '#ffd86b', windMul: 1.0, special: null,      cost: 0 },
    { id: 'rocket',   name: 'Rocket',  gravMul: 0.45,radius: 55,  dmg: 42, color: '#ff7744', windMul: 0.4, special: null,      cost: 60 },
    { id: 'mortar',   name: 'Mortar',  gravMul: 1.35,radius: 95,  dmg: 60, color: '#aa88ff', windMul: 1.2, special: null,      cost: 90 },
    { id: 'cluster',  name: 'Cluster', gravMul: 0.9, radius: 50,  dmg: 35, color: '#88e8ff', windMul: 0.9, special: 'cluster', cost: 140 },
    { id: 'nuke',     name: 'Nuke',    gravMul: 0.9, radius: 180, dmg: 95, color: '#ff4fd8', windMul: 0.8, special: 'oneshot', cost: 220 }
  ];

  class TanksGame extends BaseGame {
    init() {
      const save = Storage.getGameData('tanks') || {};
      this.save = {
        matchesWon: save.matchesWon || 0,
        weapons:    Array.isArray(save.weapons) ? save.weapons.slice() : ['standard']
      };

      this.map = 1;
      this.maxMap = 5;
      this.playerHP = 100;
      this.enemyHP = 100;
      this.turn = 'player';
      this.projectile = null;
      this.wind = 0;
      this.aim = null;
      this.message = null;
      this.enemyThink = 0;
      this.weaponIdx = 0;
      this.nukeUsed = false;
      // Per-game persistent wallet — coins carry between tanks runs.
      this.coinsHeld = Storage.getGameWallet('tanks');
      this.matchesWonThisRun = 0;
      this.victoryAchieved = false;
      this.phase = 'fight';  // 'fight' | 'intermission'
      this.shopRects = [];
      this.sfx = this.makeSfx({
        fire: { freq: 200, type: 'sawtooth', dur: 0.18, slide: -80, vol: 0.45 },
        boom: { freq: 90, type: 'noise', dur: 0.4, vol: 0.6, filter: 'lowpass' },
        hit:  { freq: 520, type: 'triangle', dur: 0.14, slide: 260, vol: 0.5 },
        miss: { freq: 180, type: 'noise', dur: 0.2, vol: 0.4, filter: 'lowpass' },
        win:  { freq: 660, type: 'triangle', dur: 0.28, slide: 660, vol: 0.5 },
        buy:  { freq: 1100,type: 'square',   dur: 0.10, vol: 0.4 }
      });
      this.loadMap();
      this.setHud(this._hud());
    }

    _writeSave() {
      Storage.setGameData('tanks', {
        matchesWon: this.save.matchesWon,
        weapons:    this.save.weapons
      });
    }

    _currentWeapon() {
      const owned = this.save.weapons;
      // find current selection that's owned
      let idx = this.weaponIdx;
      if (!owned.includes(WEAPONS[idx].id)) { idx = 0; this.weaponIdx = 0; }
      return WEAPONS[idx];
    }

    loadMap() {
      const segs = 48;
      this.terrain = [];
      const seed = this.map + Math.random();
      for (let i = 0; i <= segs; i++) {
        const x = (i / segs) * W;
        const base = H * 0.7;
        const y = base
          + Math.sin(i * 0.38 + seed) * 30
          + Math.sin(i * 0.17 + seed * 2) * 38
          + Math.cos(i * 0.09 + seed) * 22;
        this.terrain.push({ x, y });
      }
      this.terrainSegs = segs;
      this.playerX = 80;
      this.enemyX = W - 80;
      // Flatten around spawn points so tanks sit on level ground
      this._flattenAround(this.playerX, 40);
      this._flattenAround(this.enemyX, 40);
      this.playerY = this.terrainY(this.playerX);
      this.enemyY = this.terrainY(this.enemyX);
      // Ensure LOS: cap peak heights in the shooting corridor
      this._ensureLineOfSight();
      this.playerY = this.terrainY(this.playerX);
      this.enemyY = this.terrainY(this.enemyX);

      this.wind = (Math.random() - 0.5) * (20 + this.map * 6);
      this.turn = 'player';
      this.aim = null;
      this.projectile = null;
      this.nukeUsed = false;
    }

    _flattenAround(cx, half) {
      const y0 = this._rawTerrainY(cx);
      for (const p of this.terrain) {
        if (Math.abs(p.x - cx) <= half) p.y = y0;
      }
    }

    _rawTerrainY(x) {
      const t = this.terrain;
      if (x <= 0) return t[0].y;
      if (x >= W) return t[t.length - 1].y;
      const i = Math.floor(x / W * this.terrainSegs);
      const a = t[i], b = t[i+1] || t[i];
      const u = (x - a.x) / (b.x - a.x || 1);
      return a.y + (b.y - a.y) * u;
    }

    _ensureLineOfSight() {
      // Require at least one high-arc trajectory clears the corridor.
      // Simpler: cap any peak in the midzone to 60px below the lower tank.
      const yFloor = Math.min(this._rawTerrainY(this.playerX), this._rawTerrainY(this.enemyX));
      const ceiling = yFloor - 60; // peaks must sit AT LEAST this far below the tanks
      const inner = { x0: 140, x1: W - 140 };
      for (const p of this.terrain) {
        if (p.x < inner.x0 || p.x > inner.x1) continue;
        if (p.y < ceiling) p.y = ceiling + (Math.random() - 0.5) * 6;
      }
      // also cap absolute height
      for (const p of this.terrain) {
        if (p.y < H * 0.3) p.y = H * 0.3;
      }
    }

    terrainY(x) { return this._rawTerrainY(x); }

    update(dt) {
      if (this.phase === 'intermission') { this._updateIntermission(dt); return; }
      if (this.turn === 'player') this.updatePlayer(dt);
      else if (this.turn === 'enemy') this.updateEnemy(dt);
      else if (this.turn === 'projectile') this.updateProjectile(dt);
      else if (this.turn === 'pause') {
        this.pauseT -= dt;
        if (this.pauseT <= 0) {
          if (this.playerHP <= 0 || this.enemyHP <= 0) this.nextRound();
          else this.turn = this.nextTurn;
        }
      }
      this.setHud(this._hud());
    }

    updatePlayer(dt) {
      // weapon cycle
      const k = Input.keys;
      if (k['q'] || k['Q']) { this._cycleWeapon(-1); k['q'] = false; k['Q'] = false; }
      if (k['e'] || k['E']) { this._cycleWeapon(1);  k['e'] = false; k['E'] = false; }
      for (let i = 1; i <= 5; i++) {
        if (k[String(i)]) {
          if (this.save.weapons.includes(WEAPONS[i-1].id)) this.weaponIdx = i - 1;
          k[String(i)] = false;
        }
      }

      // Slingshot aiming: click anywhere on screen, then drag in the OPPOSITE
      // direction of where you want to shoot. The first click sets an anchor;
      // the pull vector (anchor → current mouse) is reversed to give the
      // firing direction. This means you can start your click on the right
      // side of the screen and drag left, even though the tank is on the left.
      const mx = Input.mouse.x, my = Input.mouse.y;
      if (Input.mouse.justPressed) {
        this._dragStart = { x: mx, y: my };
      }
      if (Input.mouse.down && this._dragStart) {
        const pullX = this._dragStart.x - mx;
        const pullY = this._dragStart.y - my;
        const L = Math.hypot(pullX, pullY);
        const power = Math.min(700, L * 3.0);
        const angle = (L > 4)
          ? Math.atan2(pullY, pullX)
          : (this.aim ? this.aim.angle : -Math.PI / 4);
        this.aim = {
          fromX: this.playerX, fromY: this.playerY - 14,
          power, angle,
          dragStart: this._dragStart,
          dragNow: { x: mx, y: my },
          ready: power >= 80
        };
      }
      if (Input.mouse.justReleased && this.aim) {
        if (this.aim.ready) {
          const w = this._currentWeapon();
          if (w.special === 'oneshot' && this.nukeUsed) {
            this.message = 'Nuke already used this match';
          } else {
            if (w.special === 'oneshot') this.nukeUsed = true;
            this.fire(this.playerX, this.playerY - 14, this.aim.angle, this.aim.power, 'player', w);
          }
        } else {
          this.message = 'Pull farther to fire';
        }
        this.aim = null;
        this._dragStart = null;
      }
    }

    _cycleWeapon(dir) {
      const owned = this.save.weapons;
      const order = WEAPONS.map((w, i) => ({ w, i })).filter(e => owned.includes(e.w.id));
      const pos = order.findIndex(e => e.i === this.weaponIdx);
      let np = (pos + dir + order.length) % order.length;
      if (pos < 0) np = 0;
      this.weaponIdx = order[np].i;
    }

    updateEnemy(dt) {
      this.enemyThink -= dt;
      if (this.enemyThink > 0) return;

      const weapon = WEAPONS[0];
      const aim = this._solveEnemyAim(weapon);

      // Skill ramps from 0.45 (map 1) up to a 0.92 cap so the enemy never
      // shoots flawlessly forever — players still get rare lucky misses.
      const skill = Math.min(0.92, 0.45 + (this.map - 1) * 0.13);
      const angleJitter = (1 - skill) * 0.16;
      const powerJitter = (1 - skill) * 70;
      const angle = aim.angle + (Math.random() - 0.5) * angleJitter;
      const power = Math.max(160, Math.min(720, aim.power + (Math.random() - 0.5) * powerJitter));

      this.fire(this.enemyX, this.enemyY - 14, angle, power, 'enemy', weapon);
    }

    _solveEnemyAim(weapon) {
      // Brute-force search over angle/power; pick the trajectory whose
      // closest approach to the player tank is smallest. Accounts for
      // current wind, gravity, and terrain.
      const x0 = this.enemyX;
      const y0 = this.enemyY - 14;
      const tx = this.playerX;
      const ty = this.playerY - 10;
      let best = { angle: Math.PI + 0.6, power: 420, miss: Infinity };
      for (let power = 200; power <= 700; power += 20) {
        for (let a = Math.PI + 0.05; a <= Math.PI * 1.5 - 0.05; a += 0.04) {
          const miss = this._simulateShot(x0, y0, a, power, weapon, tx, ty);
          if (miss < best.miss) best = { angle: a, power, miss };
        }
      }
      return best;
    }

    _simulateShot(x0, y0, angle, power, weapon, tx, ty) {
      let x = x0, y = y0;
      let vx = Math.cos(angle) * power;
      let vy = Math.sin(angle) * power;
      const step = 0.04;
      let bestDist = Infinity;
      let armed = false;
      for (let t = 0; t < 5; t += step) {
        vy += GRAVITY * weapon.gravMul * step;
        vx += this.wind * weapon.windMul * step;
        x += vx * step;
        y += vy * step;
        if (!armed && Math.hypot(x - x0, y - y0) > 30) armed = true;
        const d = Math.hypot(x - tx, y - ty);
        if (armed && d < bestDist) bestDist = d;
        if (x < -40 || x > W + 40 || y > H + 40) break;
        if (armed && y >= this.terrainY(x)) {
          const impactDist = Math.hypot(x - tx, y - ty);
          if (impactDist < bestDist) bestDist = impactDist;
          break;
        }
      }
      return bestDist;
    }

    fire(x, y, angle, power, shooter, weapon) {
      this.projectile = {
        x, y,
        vx: Math.cos(angle) * power,
        vy: Math.sin(angle) * power,
        shooter, weapon, clusterSpawned: false, life: 4.0
      };
      this.turn = 'projectile';
      this.sfx.play('fire');
      this.shake(3, 0.12);
    }

    updateProjectile(dt) {
      const p = this.projectile;
      const w = p.weapon;
      for (let i = 0; i < 4; i++) {
        const d = dt / 4;
        p.vy += GRAVITY * w.gravMul * d;
        p.vx += this.wind * w.windMul * d;
        p.x += p.vx * d;
        p.y += p.vy * d;
        p.life -= d;
        if (Math.random() < 0.3) {
          this.particles.emit({
            x: p.x, y: p.y,
            vx: (Math.random()-0.5)*20, vy: (Math.random()-0.5)*20,
            life: 0.3, size: 2, color: w.color + '88'
          });
        }
        // cluster split at apex
        if (w.special === 'cluster' && !p.clusterSpawned && p.vy > -20 && p.vy < 60) {
          p.clusterSpawned = true;
          for (let k = -1; k <= 1; k++) {
            this.particles.burst(p.x, p.y, 6, { color: w.color, speed: 120, life: 0.4, size: 2 });
            // actual child projectiles via deferred fire
            const childAng = Math.atan2(p.vy, p.vx) + k * 0.35;
            const childSp = Math.hypot(p.vx, p.vy) * 0.85;
            // launch immediately as additional projectiles queue
            this._queuedChildren = this._queuedChildren || [];
            this._queuedChildren.push({
              x: p.x, y: p.y,
              vx: Math.cos(childAng) * childSp,
              vy: Math.sin(childAng) * childSp,
              shooter: p.shooter, weapon: { ...w, special: null, radius: 40, dmg: 22 },
              clusterSpawned: true, life: 3
            });
          }
        }
        if (p.x < -40 || p.x > W + 40 || p.y > H + 40 || p.life <= 0) {
          this.endShot(null); return;
        }
        if (p.y >= this.terrainY(p.x)) {
          this.explode(p.x, p.y, p.shooter, null, w);
          return;
        }
        if (p.shooter === 'player' && Math.hypot(p.x - this.enemyX, p.y - (this.enemyY - 10)) < 20) {
          this.explode(p.x, p.y, p.shooter, 'enemy', w); return;
        }
        if (p.shooter === 'enemy' && Math.hypot(p.x - this.playerX, p.y - (this.playerY - 10)) < 20) {
          this.explode(p.x, p.y, p.shooter, 'player', w); return;
        }
      }
      // promote queued cluster children after main resolves -- handled in explode
    }

    explode(x, y, shooter, directHit, weapon) {
      this.sfx.play('boom');
      this.shake(10, 0.4);
      this.flash(weapon.color, 0.1);
      this.particles.burst(x, y, 36, { color: '#ff6e3a', speed: 280, life: 0.9 });
      this.particles.burst(x, y, 18, { color: weapon.color, speed: 150, life: 0.6 });
      const radius = weapon.radius;
      const baseDmg = weapon.dmg;
      const hit = (who, tx, ty) => {
        const d = Math.hypot(x - tx, y - ty);
        if (d <= radius) {
          const dmg = directHit === who ? baseDmg : Math.round(baseDmg * (1 - d / radius));
          if (who === 'player') this.playerHP = Math.max(0, this.playerHP - dmg);
          else this.enemyHP = Math.max(0, this.enemyHP - dmg);
          this.sfx.play('hit');
          this.message = `${who === 'player' ? 'You' : 'Enemy'} took ${dmg}`;
          return true;
        }
        return false;
      };
      const hitPlayer = hit('player', this.playerX, this.playerY - 10);
      const hitEnemy = hit('enemy', this.enemyX, this.enemyY - 10);
      if (!hitPlayer && !hitEnemy) {
        this.sfx.play('miss');
        this.message = `${shooter === 'player' ? 'Your shot' : 'Enemy shot'} missed`;
      }
      for (const p of this.terrain) {
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < radius) {
          p.y += (1 - d / radius) * (radius / 4);
          if (p.y > H - 6) p.y = H - 6;
        }
      }
      this.playerY = this.terrainY(this.playerX);
      this.enemyY = this.terrainY(this.enemyX);

      // promote queued cluster children: turn the next one into active projectile
      if (this._queuedChildren && this._queuedChildren.length) {
        const next = this._queuedChildren.shift();
        this.projectile = next;
        return; // stay in 'projectile' turn
      }

      this.endShot(shooter);
    }

    endShot(shooter) {
      this.projectile = null;
      this._queuedChildren = null;
      this.turn = 'pause';
      this.pauseT = 1.0;
      this.nextTurn = (shooter === 'player') ? 'enemy' : 'player';
      if (this.nextTurn === 'enemy') this.enemyThink = 1.0;
      this.addScore(shooter === 'player' ? 25 : 0);
    }

    nextRound() {
      if (this.enemyHP <= 0 && this.playerHP > 0) {
        this.addScore(500);
        this.sfx.play('win');
        this.flash('#4ade80', 0.2);
        this.save.matchesWon = Math.max(this.save.matchesWon, this.map);
        this._writeSave();
        // coins from this match
        const earned = 30 + this.map * 15 + Math.floor(this.playerHP * 0.5);
        this.coinsHeld += earned;
        this.matchesWonThisRun++;
        Storage.setGameWallet('tanks', this.coinsHeld);
        this.message = '+' + earned + ' coins';
        if (this.map >= this.maxMap) {
          this.victoryAchieved = true;
          this.win();
          return;
        }
        // intermission shop
        this.phase = 'intermission';
        return;
      } else {
        Storage.setGameWallet('tanks', this.coinsHeld);
        this.gameOver();
      }
    }

    _updateIntermission(dt) {
      if (Input.mouse.justPressed) {
        for (const r of this.shopRects) {
          if (Input.mouse.x >= r.x && Input.mouse.x <= r.x + r.w &&
              Input.mouse.y >= r.y && Input.mouse.y <= r.y + r.h) {
            if (r.kind === 'continue') {
              this.phase = 'fight';
              this.map++;
              this.playerHP = 100; this.enemyHP = 100;
              this.message = 'MATCH ' + this.map;
              this.loadMap();
              return;
            }
            if (r.kind === 'buy') {
              const w = WEAPONS[r.i];
              if (!this.save.weapons.includes(w.id) && Storage.spendGameWallet('tanks', w.cost)) {
                this.coinsHeld -= w.cost;
                this.save.weapons.push(w.id);
                this._writeSave();
                this.sfx.play('buy');
              }
              return;
            }
          }
        }
      }
    }

    _hud() {
      const w = this._currentWeapon();
      const wInfo = w.name + (w.special === 'oneshot' ? (this.nukeUsed ? ' (used)' : ' 1x') : '');
      return `<span>Match <b>${this.map}/${this.maxMap}</b></span>` +
             `<span>You <b>${this.playerHP}</b></span>` +
             `<span>Enemy <b>${this.enemyHP}</b></span>` +
             `<span>Wind <b>${this.wind > 0 ? '→' : '←'} ${Math.abs(this.wind).toFixed(0)}</b></span>` +
             `<span>Wpn <b style="color:${w.color}">${wInfo}</b></span>` +
             `<span>&#9679; <b>${this.coinsHeld}</b></span>`;
    }

    render(ctx) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#1a2030'); g.addColorStop(1, '#3a4c68');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

      ctx.fillStyle = '#2a3450';
      ctx.beginPath(); ctx.moveTo(0, H * 0.55);
      for (let x = 0; x <= W; x += 30) {
        ctx.lineTo(x, H * 0.55 - Math.sin(x * 0.01 + this.map) * 40);
      }
      ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();

      ctx.fillStyle = '#3a5a3e';
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (const p of this.terrain) ctx.lineTo(p.x, p.y);
      ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#7ac74f'; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < this.terrain.length; i++) {
        const p = this.terrain[i];
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();

      drawTank(ctx, this.playerX, this.playerY, '#ffbb55', this.aim && this.aim.angle || Math.PI + 0.6);
      drawTank(ctx, this.enemyX, this.enemyY, '#66e0ff', Math.PI - 0.6);

      drawHP(ctx, this.playerX, this.playerY - 30, this.playerHP, '#ffbb55');
      drawHP(ctx, this.enemyX, this.enemyY - 30, this.enemyHP, '#66e0ff');

      if (this.aim) {
        const w = this._currentWeapon();
        // Slingshot pull indicator: anchor + rubber band line back to mouse,
        // so it's visually obvious where the click started and which way to drag.
        if (this.aim.dragStart && this.aim.dragNow) {
          const a = this.aim.dragStart, b = this.aim.dragNow;
          ctx.strokeStyle = this.aim.ready ? '#ffd86b' : '#88909c';
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 4]);
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = '#ffd86b';
          ctx.beginPath(); ctx.arc(a.x, a.y, 5, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = this.aim.ready ? '#ffd86b' : '#88909c';
          ctx.beginPath(); ctx.arc(b.x, b.y, 4, 0, Math.PI * 2); ctx.fill();
        }
        ctx.strokeStyle = w.color + 'cc'; ctx.lineWidth = 2;
        ctx.setLineDash([4, 5]);
        let sx = this.aim.fromX, sy = this.aim.fromY;
        let vx = Math.cos(this.aim.angle) * this.aim.power;
        let vy = Math.sin(this.aim.angle) * this.aim.power;
        ctx.beginPath(); ctx.moveTo(sx, sy);
        for (let i = 0; i < 40; i++) {
          vy += GRAVITY * w.gravMul * 0.04;
          vx += this.wind * w.windMul * 0.04;
          sx += vx * 0.04; sy += vy * 0.04;
          ctx.lineTo(sx, sy);
          if (sy > this.terrainY(sx)) break;
        }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 13px ui-monospace, monospace';
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText(`Pwr ${this.aim.power.toFixed(0)}  Ang ${(this.aim.angle * 180 / Math.PI).toFixed(0)}°`, this.playerX + 20, this.playerY - 60);
      }

      if (this.projectile) {
        const p = this.projectile;
        ctx.save();
        ctx.shadowColor = p.weapon.color; ctx.shadowBlur = 14;
        ctx.fillStyle = p.weapon.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      // wind indicator arrow (top center)
      this._drawWindIndicator(ctx);

      // weapon bar (bottom)
      this._drawWeaponBar(ctx);

      ctx.fillStyle = '#fff';
      ctx.font = 'bold 18px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      const turnText = this.turn === 'player' ? 'YOUR TURN — CLICK & PULL BACK (slingshot), RELEASE TO FIRE  (Q/E weapons)' :
                       this.turn === 'enemy'  ? 'ENEMY TURN' :
                       this.turn === 'projectile' ? 'INCOMING...' : '';
      if (turnText && this.phase === 'fight') ctx.fillText(turnText, W / 2, 16);

      if (this.message) {
        ctx.fillStyle = '#ffd86b';
        ctx.font = 'bold 14px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(this.message, W / 2, 42);
      }

      if (this.phase === 'intermission') this._drawIntermission(ctx);
    }

    _drawWindIndicator(ctx) {
      const cx = W / 2, cy = 74;
      ctx.fillStyle = '#00000066';
      ctx.fillRect(cx - 70, cy - 14, 140, 28);
      ctx.fillStyle = '#e7ecf3';
      ctx.font = 'bold 12px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const dir = this.wind > 0 ? '→' : this.wind < 0 ? '←' : '·';
      ctx.fillText('WIND ' + dir + ' ' + Math.abs(this.wind).toFixed(0), cx, cy);
    }

    _drawWeaponBar(ctx) {
      const y = H - 28;
      let x = 14;
      for (let i = 0; i < WEAPONS.length; i++) {
        const w = WEAPONS[i];
        const owned = this.save.weapons.includes(w.id);
        const active = i === this.weaponIdx && owned;
        ctx.fillStyle = active ? '#332a18' : '#1a110a';
        ctx.fillRect(x, y, 120, 22);
        ctx.strokeStyle = owned ? w.color : '#554';
        ctx.lineWidth = active ? 2 : 1;
        ctx.strokeRect(x + 0.5, y + 0.5, 120, 22);
        ctx.fillStyle = owned ? w.color : '#776655';
        ctx.font = 'bold 11px ui-monospace, monospace';
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText((i + 1) + ' ' + w.name, x + 6, y + 11);
        if (!owned) {
          ctx.fillStyle = '#aa8844';
          ctx.textAlign = 'right';
          ctx.fillText('\u25CF' + w.cost, x + 114, y + 11);
        }
        x += 124;
      }
    }

    _drawIntermission(ctx) {
      ctx.fillStyle = 'rgba(0,0,0,0.82)';
      ctx.fillRect(0, 0, W, H);
      const bx = 80, by = 50, bw = W - 160, bh = H - 100;
      ctx.fillStyle = '#101820';
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = '#ffd86b'; ctx.lineWidth = 3;
      ctx.strokeRect(bx, by, bw, bh);

      ctx.fillStyle = '#ffd86b';
      ctx.font = 'bold 26px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText('MATCH ' + this.map + ' WON', W / 2, by + 18);
      ctx.fillStyle = '#caffd5';
      ctx.font = 'bold 14px ui-monospace, monospace';
      ctx.fillText('\u25CF ' + this.coinsHeld + ' coins available', W / 2, by + 52);
      ctx.fillStyle = '#a58abd';
      ctx.font = '12px ui-monospace, monospace';
      ctx.fillText('Unlock weapons — they persist for future runs', W / 2, by + 74);

      this.shopRects = [];
      const startX = bx + 30, startY = by + 110;
      const cellW = (bw - 60 - 20) / 2, cellH = 64;
      for (let i = 0; i < WEAPONS.length; i++) {
        const w = WEAPONS[i];
        const owned = this.save.weapons.includes(w.id);
        const col = i % 2, row = (i / 2) | 0;
        const rx = startX + col * (cellW + 20);
        const ry = startY + row * (cellH + 10);
        const canAfford = !owned && this.coinsHeld >= w.cost;
        ctx.fillStyle = owned ? '#0a1a10' : (canAfford ? '#1a140a' : '#140a1a');
        ctx.fillRect(rx, ry, cellW, cellH);
        ctx.strokeStyle = w.color; ctx.lineWidth = 1;
        ctx.strokeRect(rx + 0.5, ry + 0.5, cellW, cellH);
        ctx.fillStyle = w.color;
        ctx.font = 'bold 16px ui-monospace, monospace';
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText(w.name, rx + 12, ry + 10);
        ctx.fillStyle = '#a58abd';
        ctx.font = '11px ui-monospace, monospace';
        ctx.fillText('radius ' + w.radius + '  dmg ' + w.dmg + (w.special ? '  *' + w.special : ''),
          rx + 12, ry + 32);
        ctx.fillStyle = owned ? '#66ff88' : canAfford ? '#ffcc33' : '#776655';
        ctx.font = 'bold 14px ui-monospace, monospace';
        ctx.textAlign = 'right';
        ctx.fillText(owned ? 'OWNED' : '\u25CF ' + w.cost, rx + cellW - 12, ry + 44);
        if (!owned) this.shopRects.push({ x: rx, y: ry, w: cellW, h: cellH, kind: 'buy', i });
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
      ctx.fillText('NEXT MATCH \u2192', W / 2, cby + cbh / 2);
      this.shopRects.push({ x: cbx, y: cby, w: cbw, h: cbh, kind: 'continue' });
    }

    coinsEarned(/* score */) {
      // Theme-shop coins from match milestones, not from in-run kills.
      const matches = this.matchesWonThisRun | 0;
      const winBonus = this.victoryAchieved ? 20 : 0;
      return matches * 4 + winBonus;
    }
  }

  function drawTank(ctx, x, y, color, barrelAngle) {
    ctx.fillStyle = '#222';
    ctx.fillRect(x - 16, y - 4, 32, 4);
    ctx.beginPath(); ctx.arc(x - 13, y, 4, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(x - 4, y, 4, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 5, y, 4, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 13, y, 4, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = color;
    ctx.fillRect(x - 14, y - 12, 28, 8);
    ctx.beginPath(); ctx.arc(x, y - 14, 8, Math.PI, 0); ctx.fill();
    ctx.save();
    ctx.translate(x, y - 14);
    ctx.rotate(barrelAngle);
    ctx.fillStyle = '#111';
    ctx.fillRect(0, -2, 22, 4);
    ctx.restore();
  }

  function drawHP(ctx, x, y, hp, color) {
    ctx.fillStyle = '#00000080';
    ctx.fillRect(x - 20, y, 40, 5);
    ctx.fillStyle = color;
    ctx.fillRect(x - 20, y, 40 * (hp / 100), 5);
    ctx.strokeStyle = '#00000080';
    ctx.strokeRect(x - 20, y, 40, 5);
  }

  NDP.attachGame('tanks', TanksGame);
})();
