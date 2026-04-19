/* Leap — side-scrolling pixel platformer.
   Procedurally generated levels. Goal: reach the flag at the right edge.
   Collect coins (+10) and gems (+50). Stomping enemies: +30. Touching an
   enemy from side: lose a life. 3 lives. Levels scale: longer, more enemies,
   more gaps. */
(function () {
  const NDP = window.NDP;
  const { BaseGame, Input, Assets, Storage } = NDP.Engine;

  const W = 960, H = 600;
  const TILE = 40;
  const GROUND_Y = H - TILE * 2;

  const UPGRADES = [
    { id: 'dj',     label: 'Double Jump',    desc: 'Jump once more in air',     cost: 160, max: 1, color: '#4fc8ff' },
    { id: 'dash',   label: 'Air Dash',       desc: 'SHIFT: burst horizontally', cost: 140, max: 1, color: '#ff4fd8' },
    { id: 'life',   label: '+Extra Life',    desc: '+1 starting life per tier', cost: 100, max: 2, color: '#ff4466' },
    { id: 'magnet', label: 'Coin Magnet',    desc: 'Bigger pickup radius',      cost: 90,  max: 2, color: '#ffd86b' }
  ];

  class LeapGame extends BaseGame {
    init() {
      const d = Storage.getGameData('leap') || {};
      this.save = {
        bestLevel: d.bestLevel || 0,
        upgrades:  Object.assign({ dj:0, dash:0, life:0, magnet:0 }, d.upgrades || {})
      };
      this.phase = 'shop';
      this.shopRects = [];
      this.level = 1;
      this.lives = 3 + this.save.upgrades.life;
      this.buildLevel();
      this.sfx = this.makeSfx({
        jump:  { freq: 440, type: 'square', dur: 0.08, slide: 440, vol: 0.25 },
        coin:  { freq: 880, type: 'triangle', dur: 0.1, slide: 660, vol: 0.3 },
        gem:   { freq: 660, type: 'triangle', dur: 0.18, slide: 880, vol: 0.32 },
        stomp: { freq: 220, type: 'square', dur: 0.12, slide: -200, vol: 0.3 },
        hurt:  { freq: 160, type: 'sawtooth', dur: 0.3, slide: -160, vol: 0.4 },
        land:  { freq: 180, type: 'noise', dur: 0.06, vol: 0.15, filter: 'lowpass' },
        goal:  { freq: 440, type: 'triangle', dur: 0.5, slide: 880, vol: 0.4 },
        dash:  { freq: 700, type: 'square',   dur: 0.1, vol: 0.3, slide: -300 },
        buy:   { freq: 1100,type: 'square',   dur: 0.1, vol: 0.4 },
        bossHit:{ freq: 200,type: 'sawtooth', dur: 0.15, vol: 0.4 }
      });
      this.clouds = [];
      for (let i = 0; i < 6; i++) {
        this.clouds.push({ x: Math.random() * this.levelW, y: 40 + Math.random() * 150, s: 0.5 + Math.random() * 0.8 });
      }
      this.setHud(this.makeHud());
    }

    makeHud() {
      const hearts = '\u2665'.repeat(Math.max(0, this.lives));
      return `<span>Level <b>${this.level}</b></span><span>Lives <b>${hearts}</b></span><span>Score <b>${this.score}</b></span>`;
    }

    buildLevel() {
      // Procedural: generate tile grid, gaps, platforms, enemies, pickups.
      const cols = 40 + this.level * 8;
      const rows = Math.floor(H / TILE);
      this.cols = cols; this.rows = rows;
      this.levelW = cols * TILE;
      const grid = [];
      for (let r = 0; r < rows; r++) {
        const row = [];
        for (let c = 0; c < cols; c++) row.push(0);
        grid.push(row);
      }
      const groundRow = rows - 2;
      // Fill ground
      for (let c = 0; c < cols; c++) {
        grid[groundRow][c] = 1;
        grid[groundRow + 1][c] = 1;
      }
      // Punch gaps (not near start or finish)
      const gapCount = 2 + Math.floor(this.level * 1.3);
      for (let i = 0; i < gapCount; i++) {
        const gc = 5 + Math.floor(Math.random() * (cols - 10));
        const gw = 1 + Math.floor(Math.random() * Math.min(3, 1 + this.level));
        for (let c = gc; c < gc + gw && c < cols - 3; c++) {
          grid[groundRow][c] = 0;
          grid[groundRow + 1][c] = 0;
        }
      }
      // Floating platforms
      const platCount = 3 + this.level * 2;
      for (let i = 0; i < platCount; i++) {
        const pc = 4 + Math.floor(Math.random() * (cols - 8));
        const pr = groundRow - 2 - Math.floor(Math.random() * 3);
        const pw = 2 + Math.floor(Math.random() * 3);
        for (let c = pc; c < pc + pw && c < cols; c++) {
          if (pr > 0 && pr < groundRow) grid[pr][c] = 2;  // floating (no tile below)
        }
      }
      this.grid = grid;
      this.groundRow = groundRow;

      // Entities
      this.coins = [];
      this.gems = [];
      this.enemies = [];
      // Pickups floating above platforms / ground
      for (let c = 3; c < cols - 3; c++) {
        // Above ground (not above gaps) — chance per column
        if (grid[groundRow][c] && Math.random() < 0.18) {
          this.coins.push({ x: c * TILE + TILE/2, y: (groundRow - 1) * TILE + TILE/2, t: Math.random() * 6, dead: false });
        }
        // Above floating platforms
        for (let r = 1; r < groundRow; r++) {
          if (grid[r][c] === 2 && grid[r - 1][c] === 0 && Math.random() < 0.6) {
            if (Math.random() < 0.25) {
              this.gems.push({ x: c * TILE + TILE/2, y: (r - 1) * TILE + TILE/2, t: Math.random() * 6, dead: false });
            } else {
              this.coins.push({ x: c * TILE + TILE/2, y: (r - 1) * TILE + TILE/2, t: Math.random() * 6, dead: false });
            }
          }
        }
      }
      // Enemies (on ground)
      const enemyCount = 2 + this.level * 2;
      for (let i = 0; i < enemyCount; i++) {
        const ec = 8 + Math.floor(Math.random() * (cols - 12));
        if (grid[groundRow][ec]) {
          this.enemies.push({
            x: ec * TILE + TILE/2, y: groundRow * TILE - 14,
            vx: (Math.random() < 0.5 ? -1 : 1) * 60,
            w: 28, h: 28, alive: true, anim: Math.random() * 6
          });
        }
      }
      // Boss every 5 levels: tanky bouncing enemy near the flag
      this.bossLevel = this.level % 5 === 0;
      if (this.bossLevel) {
        const bc = cols - 6;
        this.enemies.push({
          x: bc * TILE, y: groundRow * TILE - 20,
          vx: 70, vy: 0,
          w: 44, h: 44,
          alive: true, anim: 0, boss: true,
          hp: 3, maxHp: 3
        });
      }

      // Player
      this.p = {
        x: 80, y: groundRow * TILE - 40, vx: 0, vy: 0,
        w: 28, h: 40, onGround: false, facing: 1, jumpBuf: 0, coyote: 0,
        inv: 0,
        djUsed: false, dashReady: !!this.save.upgrades.dash, dashCool: 0
      };
      // Goal flag — at the end, on top of ground
      this.goal = { x: (cols - 2) * TILE + TILE/2, y: groundRow * TILE - 28 };
      this.camX = 0;
      this.completed = false;
      this.completedTimer = 0;
    }

    isSolidAt(wx, wy) {
      const c = Math.floor(wx / TILE);
      const r = Math.floor(wy / TILE);
      if (c < 0 || c >= this.cols || r < 0 || r >= this.rows) return false;
      return this.grid[r][c] !== 0;
    }

    update(dt) {
      if (this.phase === 'shop') { this._updateShop(dt); return; }
      // Completion transition
      if (this.completed) {
        this.completedTimer += dt;
        if (this.completedTimer > 1.6) {
          this.level++;
          this.buildLevel();
          this.setHud(this.makeHud());
        }
        return;
      }

      const p = this.p;
      // Input
      let ax = 0;
      if (Input.keys['ArrowLeft'] || Input.keys['a'] || Input.keys['A']) ax -= 1;
      if (Input.keys['ArrowRight'] || Input.keys['d'] || Input.keys['D']) ax += 1;
      const jumpPressed = Input.keys[' '] || Input.keys['Space'] || Input.keys['w'] || Input.keys['W'] || Input.keys['ArrowUp'];

      // Horizontal movement
      const accel = p.onGround ? 1800 : 900;
      const maxSpeed = 260;
      p.vx += ax * accel * dt;
      if (ax === 0) p.vx *= Math.pow(p.onGround ? 0.001 : 0.2, dt);
      p.vx = Math.max(-maxSpeed, Math.min(maxSpeed, p.vx));
      if (ax !== 0) p.facing = ax > 0 ? 1 : -1;

      // Jump buffering + coyote time
      p.jumpBuf -= dt; p.coyote -= dt;
      if (jumpPressed && !this._jumpLatch) { p.jumpBuf = 0.12; this._jumpLatch = true; }
      if (!jumpPressed) this._jumpLatch = false;
      if (p.jumpBuf > 0 && p.coyote > 0) {
        p.vy = -520;
        p.jumpBuf = 0; p.coyote = 0; p.onGround = false;
        p.djUsed = false;
        this.sfx.play('jump');
        Assets.sfx('lp_jump', 0.25);
      }
      // Double jump: mid-air, once, requires upgrade
      else if (p.jumpBuf > 0 && !p.onGround && this.save.upgrades.dj && !p.djUsed && p.coyote <= 0) {
        p.vy = -440;
        p.jumpBuf = 0;
        p.djUsed = true;
        this.sfx.play('jump', { freq: 640 });
        this.particles.burst(p.x, p.y, 10, { color: '#4fc8ff', speed: 160, life: 0.4, size: 2 });
      }
      // Air dash (SHIFT)
      p.dashCool = Math.max(0, p.dashCool - dt);
      if (Input.keys['Shift'] && p.dashReady && p.dashCool <= 0 && !p.onGround) {
        p.dashReady = false;
        p.dashCool = 0.25;
        p.vx = p.facing * 640;
        p.vy = Math.min(p.vy, -50);
        this.sfx.play('dash');
        this.particles.burst(p.x, p.y, 14, { color: '#ff4fd8', speed: 220, life: 0.35, size: 3 });
        p.inv = Math.max(p.inv, 0.2);
      }
      if (p.onGround) p.dashReady = !!this.save.upgrades.dash;
      // Variable jump: cut if released early
      if (!jumpPressed && p.vy < -200) p.vy = -200;

      // Gravity
      p.vy += 1700 * dt;
      if (p.vy > 900) p.vy = 900;

      // Horizontal collide
      p.x += p.vx * dt;
      if (p.vx > 0) {
        if (this.isSolidAt(p.x + p.w/2, p.y - 4) || this.isSolidAt(p.x + p.w/2, p.y - p.h + 4)) {
          const c = Math.floor((p.x + p.w/2) / TILE);
          p.x = c * TILE - p.w/2 - 0.1;
          p.vx = 0;
        }
      } else if (p.vx < 0) {
        if (this.isSolidAt(p.x - p.w/2, p.y - 4) || this.isSolidAt(p.x - p.w/2, p.y - p.h + 4)) {
          const c = Math.floor((p.x - p.w/2) / TILE);
          p.x = (c + 1) * TILE + p.w/2 + 0.1;
          p.vx = 0;
        }
      }

      // Vertical collide
      p.y += p.vy * dt;
      const wasOnGround = p.onGround;
      p.onGround = false;
      if (p.vy > 0) {
        // Check feet
        if (this.isSolidAt(p.x - p.w/2 + 4, p.y) || this.isSolidAt(p.x + p.w/2 - 4, p.y)) {
          const r = Math.floor(p.y / TILE);
          p.y = r * TILE - 0.1;
          p.vy = 0;
          p.onGround = true;
          p.coyote = 0.08;
          if (!wasOnGround) this.sfx.play('land');
        }
      } else if (p.vy < 0) {
        // Head
        const top = p.y - p.h;
        if (this.isSolidAt(p.x - p.w/2 + 4, top) || this.isSolidAt(p.x + p.w/2 - 4, top)) {
          const r = Math.floor(top / TILE);
          p.y = (r + 1) * TILE + p.h + 0.1;
          p.vy = 0;
        }
      }
      if (p.onGround) p.coyote = 0.08;
      else if (wasOnGround && p.vy > 0) p.coyote = 0.08;

      // Fall out of world
      if (p.y > H + 100) { this.hurtPlayer(true); return; }

      // Keep within horizontal bounds
      if (p.x < p.w/2) p.x = p.w/2;
      if (p.x > this.levelW - p.w/2) p.x = this.levelW - p.w/2;

      // Invincibility
      p.inv = Math.max(0, p.inv - dt);

      // Enemies
      for (const e of this.enemies) {
        if (!e.alive) continue;
        e.anim += dt * 6;
        e.x += e.vx * dt;
        // Check ground ahead, turn around at edges or walls
        const feetY = e.y + e.h/2 + 4;
        const aheadX = e.x + e.vx * 0.15;
        if (!this.isSolidAt(aheadX, feetY) || this.isSolidAt(e.x + (e.vx > 0 ? e.w/2 + 2 : -e.w/2 - 2), e.y)) {
          e.vx = -e.vx;
        }
        // Collide with player
        if (p.inv <= 0 && Math.abs(p.x - e.x) < (p.w + e.w)/2 - 4) {
          if (Math.abs((p.y - p.h/2) - e.y) < (p.h + e.h)/2 - 4) {
            if (p.vy > 120 && (p.y - p.h) < e.y - e.h/4) {
              // Stomp
              if (e.boss) {
                e.hp--;
                p.vy = -440;
                this.sfx.play('bossHit');
                this.shake(6, 0.2);
                this.flash('#fff', 0.1);
                this.particles.burst(e.x, e.y, 14, { color: '#ff4fd8', speed: 160, life: 0.4, size: 3 });
                if (e.hp <= 0) {
                  e.alive = false;
                  this.addScore(200);
                  this.sfx.play('stomp');
                  this.shake(10, 0.3);
                }
                continue;
              }
              e.alive = false;
              p.vy = -360;
              this.addScore(30);
              this.sfx.play('stomp');
              Assets.sfx('lp_hit', 0.3);
              this.shake(4, 0.1);
            } else {
              this.hurtPlayer(false);
              return;
            }
          }
        }
      }
      this.enemies = this.enemies.filter(e => e.alive);

      // Coins & gems
      const magnetR = 22 + this.save.upgrades.magnet * 24;
      const magnetRV = 28 + this.save.upgrades.magnet * 24;
      for (const c of this.coins) {
        if (c.dead) continue;
        c.t += dt;
        if (this.save.upgrades.magnet) {
          const dx = p.x - c.x, dy = (p.y - p.h/2) - c.y;
          if (Math.abs(dx) < magnetR * 2 && Math.abs(dy) < magnetRV * 2) {
            c.x += Math.sign(dx) * 180 * dt;
            c.y += Math.sign(dy) * 180 * dt;
          }
        }
        if (Math.abs(p.x - c.x) < magnetR && Math.abs((p.y - p.h/2) - c.y) < magnetRV) {
          c.dead = true; this.addScore(10);
          this.sfx.play('coin');
          Assets.sfx('lp_coinAu', 0.25);
        }
      }
      this.coins = this.coins.filter(c => !c.dead);
      for (const g of this.gems) {
        if (g.dead) continue;
        g.t += dt;
        if (Math.abs(p.x - g.x) < 22 && Math.abs((p.y - p.h/2) - g.y) < 28) {
          g.dead = true; this.addScore(50);
          this.sfx.play('gem');
          Assets.sfx('lp_coinAu', 0.35);
          this.flash('#fff', 0.08);
        }
      }
      this.gems = this.gems.filter(g => !g.dead);

      // Goal (boss level requires boss dead first)
      const bossBlocking = this.bossLevel && this.enemies.some(e => e.boss && e.alive);
      if (!bossBlocking && Math.abs(p.x - this.goal.x) < 30 && Math.abs((p.y - p.h/2) - this.goal.y) < 50) {
        this.completed = true;
        this.completedTimer = 0;
        this.addScore(100 + this.level * 20);
        this.sfx.play('goal');
        this.flash('#fff', 0.2);
        this.save.bestLevel = Math.max(this.save.bestLevel, this.level);
        Storage.setGameData('leap', { bestLevel: this.save.bestLevel, upgrades: this.save.upgrades });
      }

      // Camera follows (smooth)
      const camTarget = Math.max(0, Math.min(this.levelW - W, p.x - W/2));
      this.camX += (camTarget - this.camX) * Math.min(1, dt * 6);

      this.setHud(this.makeHud());
    }

    hurtPlayer(fell) {
      if (this.p.inv > 0) return;
      this.lives--;
      this.p.inv = 2.0;
      this.sfx.play('hurt');
      Assets.sfx('lp_hit', 0.5);
      this.shake(10, 0.3);
      this.flash('#f44', 0.2);
      if (fell || this.lives <= 0) {
        if (this.lives <= 0) {
          this.gameOver();
          return;
        }
        // Respawn at start of level
        this.p.x = 80;
        this.p.y = this.groundRow * TILE - 40;
        this.p.vx = 0; this.p.vy = 0;
        this.camX = 0;
      } else {
        this.p.vy = -360;
        this.p.vx = -this.p.facing * 200;
      }
    }

    render(ctx) {
      if (this.phase === 'shop') { this._renderShop(ctx); return; }
      // Sky
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#6ec6ff'); sky.addColorStop(1, '#c5e9ff');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

      // Parallax clouds
      for (const cl of this.clouds) {
        const sx = cl.x - this.camX * 0.3 * cl.s;
        const x = ((sx % (this.levelW + 200)) + this.levelW + 200) % (this.levelW + 200) - 100;
        this.drawCloud(ctx, x, cl.y, cl.s);
      }

      // Distant hills
      ctx.fillStyle = '#4a8d57';
      for (let i = 0; i < 8; i++) {
        const hx = i * 180 - (this.camX * 0.5) % 180;
        ctx.beginPath();
        ctx.arc(hx, H - 100, 120, Math.PI, 2 * Math.PI);
        ctx.fill();
      }

      // World origin — translate for camera
      ctx.save();
      ctx.translate(-Math.floor(this.camX), 0);

      // Tiles
      const cStart = Math.max(0, Math.floor(this.camX / TILE) - 1);
      const cEnd = Math.min(this.cols, cStart + Math.ceil(W / TILE) + 2);
      for (let c = cStart; c < cEnd; c++) {
        for (let r = 0; r < this.rows; r++) {
          if (this.grid[r][c] === 0) continue;
          const tx = c * TILE, ty = r * TILE;
          if (!Assets.draw(ctx, 'lp_ground', tx + TILE/2, ty + TILE/2, TILE, TILE, { fallback: () => {
            // Stylized tile
            ctx.fillStyle = '#7a3e1a'; ctx.fillRect(tx, ty, TILE, TILE);
            // Grass top edge if tile above is empty
            if (r > 0 && this.grid[r-1][c] === 0) {
              ctx.fillStyle = '#5aa04a';
              ctx.fillRect(tx, ty, TILE, 8);
              ctx.fillStyle = '#6cc058';
              for (let gx = tx; gx < tx + TILE; gx += 4) ctx.fillRect(gx, ty - 2, 2, 2);
            }
            // Inner shadow
            ctx.fillStyle = 'rgba(0,0,0,0.12)';
            ctx.fillRect(tx + TILE - 3, ty, 3, TILE);
            ctx.fillRect(tx, ty + TILE - 3, TILE, 3);
          }})) {}
        }
      }

      // Coins
      for (const co of this.coins) {
        const bob = Math.sin(co.t * 3) * 3;
        if (!Assets.draw(ctx, 'lp_coin', co.x, co.y + bob, 22, 22, { fallback: () => {
          ctx.fillStyle = '#ffd86b';
          ctx.beginPath(); ctx.arc(co.x, co.y + bob, 9, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#a66b00';
          ctx.fillRect(co.x - 1, co.y + bob - 5, 2, 10);
          ctx.strokeStyle = '#fff4a0'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(co.x, co.y + bob, 9, -Math.PI*0.7, -Math.PI*0.2); ctx.stroke();
        }})) {}
      }

      // Gems
      for (const g of this.gems) {
        const bob = Math.sin(g.t * 4) * 4;
        if (!Assets.draw(ctx, 'lp_gem', g.x, g.y + bob, 24, 24, { fallback: () => {
          ctx.fillStyle = '#66e0ff';
          ctx.beginPath();
          ctx.moveTo(g.x, g.y + bob - 10);
          ctx.lineTo(g.x + 8, g.y + bob);
          ctx.lineTo(g.x, g.y + bob + 10);
          ctx.lineTo(g.x - 8, g.y + bob);
          ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#bff2ff';
          ctx.beginPath();
          ctx.moveTo(g.x - 3, g.y + bob - 5);
          ctx.lineTo(g.x + 2, g.y + bob - 3);
          ctx.lineTo(g.x, g.y + bob + 2);
          ctx.closePath(); ctx.fill();
        }})) {}
      }

      // Enemies
      for (const e of this.enemies) {
        const bob = Math.sin(e.anim) * 2;
        if (!Assets.draw(ctx, 'lp_enemy', e.x, e.y + bob, 32, 32, { flipX: e.vx > 0, fallback: () => {
          ctx.fillStyle = '#ff6666';
          ctx.fillRect(e.x - 14, e.y - 10 + bob, 28, 20);
          ctx.fillStyle = '#fff';
          ctx.fillRect(e.x - 8, e.y - 4 + bob, 5, 5); ctx.fillRect(e.x + 3, e.y - 4 + bob, 5, 5);
          ctx.fillStyle = '#000';
          ctx.fillRect(e.x - 6, e.y - 3 + bob, 2, 2); ctx.fillRect(e.x + 5, e.y - 3 + bob, 2, 2);
          // Legs
          ctx.fillStyle = '#a03a3a';
          ctx.fillRect(e.x - 12, e.y + 8 + bob, 5, 6); ctx.fillRect(e.x + 7, e.y + 8 + bob, 5, 6);
        }})) {}
      }

      // Goal flag
      if (!Assets.draw(ctx, 'lp_flag', this.goal.x, this.goal.y, 40, 56, { fallback: () => {
        ctx.fillStyle = '#654321';
        ctx.fillRect(this.goal.x - 2, this.goal.y - 28, 3, 56);
        ctx.fillStyle = this.completed ? '#66ff66' : '#ffcc33';
        const wave = Math.sin(this.time * 5) * 3;
        ctx.beginPath();
        ctx.moveTo(this.goal.x + 1, this.goal.y - 28);
        ctx.lineTo(this.goal.x + 24 + wave, this.goal.y - 20);
        ctx.lineTo(this.goal.x + 1, this.goal.y - 12);
        ctx.closePath(); ctx.fill();
      }})) {}

      // Player
      this.drawPlayer(ctx);

      ctx.restore();

      // Completion banner
      if (this.completed) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, H/2 - 40, W, 80);
        ctx.fillStyle = '#ffd86b';
        ctx.font = 'bold 40px monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('LEVEL ' + this.level + ' CLEAR!', W/2, H/2);
      }
    }

    drawCloud(ctx, x, y, s) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(x, y, 18 * s, 0, Math.PI * 2);
      ctx.arc(x + 20 * s, y - 6 * s, 16 * s, 0, Math.PI * 2);
      ctx.arc(x + 40 * s, y, 18 * s, 0, Math.PI * 2);
      ctx.fill();
    }

    drawPlayer(ctx) {
      const p = this.p;
      if (p.inv > 0 && Math.floor(p.inv * 12) % 2 === 0) return;
      const squish = p.onGround ? (Math.abs(p.vx) > 40 ? Math.sin(this.time * 18) * 0.08 : 0) : (p.vy < 0 ? 0.15 : -0.1);
      const w = p.w * (1 - squish);
      const h = p.h * (1 + squish);
      const cx = p.x, cy = p.y - p.h/2;
      if (!Assets.draw(ctx, 'lp_hero', cx, cy, w, h, { flipX: p.facing < 0, fallback: () => {
        // Body
        ctx.fillStyle = '#ff6b6b';
        ctx.fillRect(cx - w/2, cy - h/2 + 10, w, h - 10);
        // Head
        ctx.fillStyle = '#ffd29a';
        ctx.fillRect(cx - w/2 + 2, cy - h/2, w - 4, 14);
        // Eyes
        ctx.fillStyle = '#000';
        const ex = p.facing > 0 ? 2 : -6;
        ctx.fillRect(cx + ex, cy - h/2 + 5, 2, 2);
        ctx.fillRect(cx + ex + 5, cy - h/2 + 5, 2, 2);
        // Hair/cap
        ctx.fillStyle = '#3d2a9a';
        ctx.fillRect(cx - w/2 + 2, cy - h/2, w - 4, 5);
        // Feet
        ctx.fillStyle = '#222';
        ctx.fillRect(cx - w/2 + 2, cy + h/2 - 4, w/2 - 3, 4);
        ctx.fillRect(cx + 1, cy + h/2 - 4, w/2 - 3, 4);
      }})) {}
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
              if (lvl < u.max && Storage.getCoins() >= u.cost) {
                if (Storage.spendCoins(u.cost)) {
                  this.save.upgrades[u.id] = lvl + 1;
                  Storage.setGameData('leap', { bestLevel: this.save.bestLevel, upgrades: this.save.upgrades });
                  this.sfx.play('buy');
                  this.lives = 3 + this.save.upgrades.life;
                  if (this.p) this.p.dashReady = !!this.save.upgrades.dash;
                }
              }
              return;
            }
          }
        }
      }
    }

    _renderShop(ctx) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#3a5ea8'); g.addColorStop(1, '#0a1828');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

      ctx.fillStyle = '#ffd86b';
      ctx.font = 'bold 40px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText('LEAP', W / 2, 50);
      ctx.fillStyle = '#cfe8ff';
      ctx.font = '14px ui-monospace, monospace';
      ctx.fillText('boss every 5 levels. best: level ' + this.save.bestLevel, W / 2, 96);
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
        ctx.fillStyle = '#cfd8ea';
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
      ctx.fillText('RUN \u25ba', W / 2, cby + cbh / 2);
      this.shopRects.push({ x: cbx, y: cby, w: cbw, h: cbh, kind: 'launch' });
    }

    coinsEarned(score) { return Math.max(0, Math.floor(score / 50)); }
  }

  NDP.attachGame('leap', LeapGame);
})();
