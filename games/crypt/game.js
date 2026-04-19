/* Crypt — top-down dungeon crawler with 4 enemy types, boss on floor 8,
   persistent pre-run shop (max HP, sword tier, armor, starting potions). */
(function () {
  const NDP = window.NDP;
  const { BaseGame, Input, Assets, Storage } = NDP.Engine;

  const W = 960, H = 600;
  const TILE = 32;
  const MAX_FLOOR = 8;

  const UPGRADES = [
    { id: 'hp',     label: '+Max HP',       desc: '+2 hearts per tier',        cost: 100, max: 3, color: '#ff4466' },
    { id: 'sword',  label: 'Sharper Blade', desc: '+1 damage, +10% range',     cost: 150, max: 3, color: '#e8e8d8' },
    { id: 'armor',  label: 'Leather Armor', desc: 'Longer i-frames on hit',    cost: 120, max: 2, color: '#8a6a3a' },
    { id: 'potion', label: 'Start Potion',  desc: '+1 healing potion in inv.', cost: 80,  max: 3, color: '#d0504e' }
  ];

  class CryptGame extends BaseGame {
    init() {
      const d = Storage.getGameData('crypt') || {};
      this.save = {
        bestFloor: d.bestFloor || 0,
        upgrades: Object.assign({ hp:0, sword:0, armor:0, potion:0 }, d.upgrades || {})
      };
      this.phase = 'shop';  // 'shop' | 'play' | 'victory'
      this.shopRects = [];

      this.floor = 1;
      this.maxHp = 5 + this.save.upgrades.hp * 2;
      this.hp = this.maxHp;
      this.potions = this.save.upgrades.potion; // inventory
      this.swordDmg = 1 + this.save.upgrades.sword;
      this.swordRange = 50 + this.save.upgrades.sword * 5;
      this.iframeMul = 1 + this.save.upgrades.armor * 0.35;

      this.sfx = this.makeSfx({
        swing:  { freq: 520, type: 'square', dur: 0.08, slide: -200, vol: 0.2 },
        hit:    { freq: 180, type: 'square', dur: 0.1, slide: -100, vol: 0.28 },
        kill:   { freq: 200, type: 'noise', dur: 0.15, vol: 0.3, filter: 'lowpass' },
        loot:   { freq: 880, type: 'triangle', dur: 0.12, slide: 880, vol: 0.3 },
        heal:   { freq: 440, type: 'triangle', dur: 0.3, slide: 880, vol: 0.3 },
        hurt:   { freq: 140, type: 'sawtooth', dur: 0.3, slide: -120, vol: 0.4 },
        descend:{ freq: 330, type: 'triangle', dur: 0.4, slide: -330, vol: 0.35 },
        boss:   { freq: 120, type: 'sawtooth', dur: 0.5, slide: 80, vol: 0.55 },
        buy:    { freq: 1100,type: 'square',   dur: 0.1, vol: 0.4 }
      });
      this.buildRoom();
      this.setHud(this.makeHud());
    }

    _writeSave() {
      Storage.setGameData('crypt', {
        bestFloor: Math.max(this.save.bestFloor, this.floor),
        upgrades: this.save.upgrades
      });
      this.save.bestFloor = Math.max(this.save.bestFloor, this.floor);
    }

    makeHud() {
      if (this.phase === 'shop') return '<span>Pre-run shop</span>';
      const hearts = '\u2665'.repeat(Math.max(0, this.hp)) + '\u2661'.repeat(Math.max(0, this.maxHp - this.hp));
      const pot = this.potions > 0 ? `<span>Potions <b style="color:#d0504e">${this.potions}</b> [Q]</span>` : '';
      return `<span>Floor <b>${this.floor}/${MAX_FLOOR}</b>${this.floor === MAX_FLOOR ? ' <b style="color:#ff4fd8">BOSS</b>' : ''}</span>` +
             `<span>HP <b style="color:#ff6666">${hearts}</b></span>` +
             pot +
             `<span>Score <b>${this.score}</b></span>`;
    }

    buildRoom() {
      const isBoss = this.floor === MAX_FLOOR;
      const big = isBoss || this.floor % 3 === 0;
      this.cols = big ? 28 : 22;
      this.rows = big ? 17 : 14;
      this.roomW = this.cols * TILE;
      this.roomH = this.rows * TILE;
      this.roomX = (W - this.roomW) / 2;
      this.roomY = (H - this.roomH) / 2;

      this.walls = [];
      for (let r = 0; r < this.rows; r++) {
        this.walls.push([]);
        for (let c = 0; c < this.cols; c++) {
          const edge = r === 0 || c === 0 || r === this.rows - 1 || c === this.cols - 1;
          this.walls[r].push(edge ? 1 : 0);
        }
      }
      // Reserve clear zones around hero spawn (left side) and stairs exit (right side)
      // so pillars never trap the player. Spawn is around col 3, row rows/2; stairs col cols-2.
      const spawnRow = (this.rows / 2) | 0;
      const isReserved = (pr, pc) =>
        (pc <= 4 && Math.abs(pr - spawnRow) <= 2) ||           // hero spawn corridor
        (pc >= this.cols - 4 && Math.abs(pr - spawnRow) <= 2); // stairs corridor

      const pillars = isBoss ? 4 : 2 + Math.floor(this.floor * 0.6);
      for (let i = 0; i < pillars; i++) {
        let pr, pc, tries = 0;
        do {
          pr = 3 + Math.floor(Math.random() * (this.rows - 6));
          pc = 3 + Math.floor(Math.random() * (this.cols - 6));
          tries++;
        } while (isReserved(pr, pc) && tries < 20);
        if (isReserved(pr, pc)) continue; // give up rather than block spawn
        this.walls[pr][pc] = 2;
      }

      this.hero = {
        x: this.roomX + TILE * 3,
        y: this.roomY + this.roomH / 2,
        r: 12, vx: 0, vy: 0,
        inv: 0,
        swing: 0,
        swingAngle: 0,
        swingCd: 0,
        facing: 1,
        attackHits: new Set()
      };
      // Safety: if the hero somehow spawned overlapping a non-floor tile, scan
      // outward for the nearest clear position so movement is never locked.
      if (this.hitsWall(this.hero.x, this.hero.y, this.hero.r)) {
        outer: for (let radius = 1; radius < Math.max(this.cols, this.rows); radius++) {
          for (let dr = -radius; dr <= radius; dr++) {
            for (let dc = -radius; dc <= radius; dc++) {
              const tx = this.roomX + (3 + dc) * TILE + TILE / 2;
              const ty = this.roomY + (spawnRow + dr) * TILE + TILE / 2;
              if (!this.hitsWall(tx, ty, this.hero.r)) {
                this.hero.x = tx;
                this.hero.y = ty;
                break outer;
              }
            }
          }
        }
      }

      this.enemies = [];
      if (isBoss) {
        this._spawnBoss();
      } else {
        const enemyCount = 2 + Math.floor(this.floor * 1.2) + (big ? 4 : 0);
        for (let i = 0; i < enemyCount; i++) this._spawnEnemyRandom();
      }

      this.chests = [];
      this.ground_potions = [];
      const chestCount = isBoss ? 0 : 1 + (big ? 2 : Math.floor(Math.random() * 2));
      for (let i = 0; i < chestCount; i++) {
        this.chests.push({
          x: this.roomX + 80 + Math.random() * (this.roomW - 160),
          y: this.roomY + 80 + Math.random() * (this.roomH - 160),
          opened: false
        });
      }
      if (Math.random() < 0.5 || this.hp < 3) {
        this.ground_potions.push({
          x: this.roomX + 80 + Math.random() * (this.roomW - 160),
          y: this.roomY + 80 + Math.random() * (this.roomH - 160),
          dead: false
        });
      }

      this.stairs = {
        x: this.roomX + this.roomW - TILE * 2,
        y: this.roomY + this.roomH / 2
      };

      this.torches = [
        { x: this.roomX + 40, y: this.roomY + 40 },
        { x: this.roomX + this.roomW - 40, y: this.roomY + 40 },
        { x: this.roomX + 40, y: this.roomY + this.roomH - 40 },
        { x: this.roomX + this.roomW - 40, y: this.roomY + this.roomH - 40 }
      ];

      this.transition = 0.8;
      if (isBoss) {
        this.sfx.play('boss');
        this.flash('#ff4fd8', 0.4);
      }
    }

    _spawnEnemyRandom() {
      const r = Math.random();
      let kind;
      if (this.floor >= 5 && r < 0.22) kind = 'ghost';
      else if (this.floor >= 3 && r < 0.45) kind = 'bat';
      else if (r < 0.7) kind = 'skeleton';
      else kind = 'slime';
      const ex = this.roomX + 80 + Math.random() * (this.roomW - 160);
      const ey = this.roomY + 80 + Math.random() * (this.roomH - 160);
      const def = {
        slime:    { r: 14, hp: 2 + Math.floor(this.floor/4), dmg: 2, speed: 50, points: 20 },
        skeleton: { r: 12, hp: 1 + Math.floor(this.floor/3), dmg: 1, speed: 75, points: 15 },
        bat:      { r: 10, hp: 1, dmg: 1, speed: 120, points: 22, flies: true },
        ghost:    { r: 12, hp: 2 + Math.floor(this.floor/3), dmg: 2, speed: 60, points: 35, phases: true }
      }[kind];
      this.enemies.push({
        x: ex, y: ey, r: def.r, hp: def.hp, maxHp: def.hp,
        kind, alive: true, t: Math.random() * 6,
        hitCd: 0, dmg: def.dmg, speed: def.speed, points: def.points,
        flies: !!def.flies, phases: !!def.phases
      });
    }

    _spawnBoss() {
      // Skeleton Lord — center of room, tanky, summons skeletons
      const bx = this.roomX + this.roomW / 2;
      const by = this.roomY + this.roomH / 2 - 40;
      this.enemies.push({
        x: bx, y: by, r: 22,
        hp: 30, maxHp: 30,
        kind: 'boss', alive: true, t: 0,
        hitCd: 0, dmg: 2, speed: 60, points: 500,
        summonCd: 4, phase2: false
      });
    }

    tileAt(wx, wy) {
      const c = Math.floor((wx - this.roomX) / TILE);
      const r = Math.floor((wy - this.roomY) / TILE);
      if (c < 0 || c >= this.cols || r < 0 || r >= this.rows) return 1;
      return this.walls[r][c];
    }

    update(dt) {
      if (this.phase === 'shop') { this._updateShop(dt); return; }
      if (this.phase === 'victory') return;
      if (this.transition > 0) this.transition = Math.max(0, this.transition - dt);

      const h = this.hero;
      let ax = 0, ay = 0;
      if (Input.keys['ArrowLeft'] || Input.keys['a'] || Input.keys['A']) ax -= 1;
      if (Input.keys['ArrowRight'] || Input.keys['d'] || Input.keys['D']) ax += 1;
      if (Input.keys['ArrowUp'] || Input.keys['w'] || Input.keys['W']) ay -= 1;
      if (Input.keys['ArrowDown'] || Input.keys['s'] || Input.keys['S']) ay += 1;
      const m = Math.hypot(ax, ay) || 1;
      const speed = 240;
      h.vx = (ax / m) * speed;
      h.vy = (ay / m) * speed;
      if (ax !== 0) h.facing = ax > 0 ? 1 : -1;

      h.x += h.vx * dt;
      if (this.hitsWall(h.x, h.y, h.r)) h.x -= h.vx * dt;
      h.y += h.vy * dt;
      if (this.hitsWall(h.x, h.y, h.r)) h.y -= h.vy * dt;

      // Potion quaff (Q)
      if ((Input.keys['q'] || Input.keys['Q']) && this.potions > 0 && this.hp < this.maxHp) {
        this.potions--;
        this.hp = Math.min(this.maxHp, this.hp + 3);
        this.sfx.play('heal');
        this.flash('#66ff99', 0.2);
        Input.keys['q'] = false; Input.keys['Q'] = false;
      }

      const mx = Input.mouse.x, my = Input.mouse.y;
      const aim = Math.atan2(my - h.y, mx - h.x);

      h.swingCd = Math.max(0, h.swingCd - dt);
      if ((Input.mouse.justPressed || Input.keys[' '] || Input.keys['Space']) && h.swingCd <= 0) {
        h.swing = 0.25;
        h.swingCd = 0.35;
        h.swingAngle = aim;
        h.attackHits.clear();
        this.sfx.play('swing');
        Assets.sfx('cp_swing', 0.2);
      }
      h.swing = Math.max(0, h.swing - dt);
      h.inv = Math.max(0, h.inv - dt);

      if (h.swing > 0) {
        for (const e of this.enemies) {
          if (!e.alive || h.attackHits.has(e)) continue;
          const dx = e.x - h.x, dy = e.y - h.y;
          const d = Math.hypot(dx, dy);
          if (d > this.swordRange) continue;
          const ang = Math.atan2(dy, dx);
          let diff = ang - h.swingAngle;
          while (diff > Math.PI) diff -= 2*Math.PI;
          while (diff < -Math.PI) diff += 2*Math.PI;
          if (Math.abs(diff) < Math.PI * 0.45) {
            e.hp -= this.swordDmg;
            h.attackHits.add(e);
            this.sfx.play('hit');
            Assets.sfx('cp_swing', 0.25);
            this.shake(4, 0.1);
            const kb = 160 / Math.max(1, d);
            e.x += dx * kb * dt * 10;
            e.y += dy * kb * dt * 10;
            const col = e.kind === 'slime' ? '#6cff9a' : e.kind === 'ghost' ? '#cfe8ff' : e.kind === 'bat' ? '#b066ff' : '#ffe0e0';
            for (let i = 0; i < 6; i++) {
              this.particles.emit({
                x: e.x, y: e.y,
                vx: (Math.random()-0.5)*160, vy: (Math.random()-0.5)*160,
                life: 0.4, size: 2 + Math.random() * 2,
                color: col
              });
            }
            if (e.hp <= 0) {
              e.alive = false;
              this.addScore(e.points);
              this.sfx.play('kill');
              Assets.sfx('cp_hurt', 0.3);
              for (let i = 0; i < 14; i++) {
                this.particles.emit({
                  x: e.x, y: e.y,
                  vx: (Math.random()-0.5)*260, vy: (Math.random()-0.5)*260,
                  life: 0.5, size: 2 + Math.random() * 3,
                  color: col
                });
              }
              // Boss death check
              if (e.kind === 'boss') {
                this.phase = 'victory';
                this._writeSave();
                this.flash('#fff', 0.6);
                this.shake(20, 0.8);
                setTimeout(() => this.win(), 1500);
              }
              // rare chest drop
              if (Math.random() < 0.2) {
                this.chests.push({ x: e.x, y: e.y, opened: false });
              }
            }
          }
        }
      }

      for (const e of this.enemies) {
        if (!e.alive) continue;
        e.t += dt;
        e.hitCd = Math.max(0, e.hitCd - dt);
        const dx = h.x - e.x, dy = h.y - e.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d > 24) {
          const nx = dx / d, ny = dy / d;
          const sp = e.speed;
          let tx = e.x + nx * sp * dt;
          let ty = e.y + ny * sp * dt;
          // flying + phasing: bats skip pillars, ghosts skip pillars too
          if (e.flies || e.phases) {
            const tile = this.tileAt(tx, ty);
            if (tile !== 1) { e.x = tx; e.y = ty; } // only blocked by walls (t=1), not pillars (t=2)
          } else {
            if (!this.hitsWall(tx, e.y, e.r)) e.x = tx;
            if (!this.hitsWall(e.x, ty, e.r)) e.y = ty;
          }
        }
        // Boss behavior
        if (e.kind === 'boss') {
          e.summonCd -= dt;
          if (!e.phase2 && e.hp <= e.maxHp * 0.5) {
            e.phase2 = true;
            e.speed = 90;
            this.flash('#ff4fd8', 0.35);
            this.shake(14, 0.4);
            this.sfx.play('boss');
          }
          if (e.summonCd <= 0) {
            e.summonCd = e.phase2 ? 3 : 5;
            // summon 2-3 skeletons
            const n = e.phase2 ? 3 : 2;
            for (let i = 0; i < n; i++) {
              this.enemies.push({
                x: e.x + (Math.random() - 0.5) * 60,
                y: e.y + (Math.random() - 0.5) * 60,
                r: 12, hp: 1, maxHp: 1,
                kind: 'skeleton', alive: true, t: 0,
                hitCd: 0.3, dmg: 1, speed: 80, points: 10
              });
            }
            this.sfx.play('boss', { freq: 260 });
          }
        }
        if (d < h.r + e.r - 4 && e.hitCd <= 0 && h.inv <= 0) {
          this.hp -= e.dmg;
          h.inv = 1.2 * this.iframeMul;
          e.hitCd = 0.6;
          this.sfx.play('hurt');
          Assets.sfx('cp_hurt', 0.4);
          this.shake(9, 0.25);
          this.flash('#f44', 0.15);
          if (this.hp <= 0) {
            this._writeSave();
            this.gameOver();
            return;
          }
        }
      }
      this.enemies = this.enemies.filter(e => e.alive);

      for (const ch of this.chests) {
        if (ch.opened) continue;
        const d = Math.hypot(h.x - ch.x, h.y - ch.y);
        if (d < h.r + 18) {
          ch.opened = true;
          const reward = 25 + Math.floor(Math.random() * 40) + this.floor * 5;
          this.addScore(reward);
          this.sfx.play('loot');
          Assets.sfx('cp_loot', 0.35);
          this.flash('#ffd86b', 0.15);
          for (let i = 0; i < 18; i++) {
            this.particles.emit({
              x: ch.x, y: ch.y,
              vx: (Math.random()-0.5)*220, vy: -100 - Math.random()*160,
              life: 0.7, size: 2 + Math.random() * 2,
              color: '#ffd86b', gravity: 500
            });
          }
          if (Math.random() < 0.35) this.potions++;
        }
      }
      for (const po of this.ground_potions) {
        if (po.dead) continue;
        const d = Math.hypot(h.x - po.x, h.y - po.y);
        if (d < h.r + 14) {
          po.dead = true;
          this.potions++;
          this.sfx.play('heal');
          Assets.sfx('cp_loot', 0.3);
          this.flash('#66ff99', 0.15);
        }
      }
      this.ground_potions = this.ground_potions.filter(p => !p.dead);

      if (this.enemies.length === 0 && this.floor < MAX_FLOOR) {
        const d = Math.hypot(h.x - this.stairs.x, h.y - this.stairs.y);
        if (d < 24) {
          this.floor++;
          this.addScore(50 + this.floor * 5);
          this._writeSave();
          this.sfx.play('descend');
          this.buildRoom();
        }
      }

      this.setHud(this.makeHud());
    }

    hitsWall(x, y, r) {
      const pts = [
        [x - r, y - r], [x + r, y - r],
        [x - r, y + r], [x + r, y + r]
      ];
      for (const [px, py] of pts) {
        const t = this.tileAt(px, py);
        if (t !== 0) return true;
      }
      return false;
    }

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
              if (lvl < u.max && Storage.getCoins() >= u.cost) {
                if (Storage.spendCoins(u.cost)) {
                  this.save.upgrades[u.id] = lvl + 1;
                  Storage.setGameData('crypt', { bestFloor: this.save.bestFloor, upgrades: this.save.upgrades });
                  this.sfx.play('buy');
                  // refresh stats
                  this.maxHp = 5 + this.save.upgrades.hp * 2;
                  this.hp = this.maxHp;
                  this.potions = this.save.upgrades.potion;
                  this.swordDmg = 1 + this.save.upgrades.sword;
                  this.swordRange = 50 + this.save.upgrades.sword * 5;
                  this.iframeMul = 1 + this.save.upgrades.armor * 0.35;
                }
              }
              return;
            }
          }
        }
      }
    }

    render(ctx) {
      if (this.phase === 'shop') { this._renderShop(ctx); return; }

      ctx.fillStyle = '#0a0612'; ctx.fillRect(0, 0, W, H);

      for (let r = 1; r < this.rows - 1; r++) {
        for (let c = 1; c < this.cols - 1; c++) {
          const tx = this.roomX + c * TILE;
          const ty = this.roomY + r * TILE;
          const alt = (r + c) & 1;
          ctx.fillStyle = alt ? '#2d1a33' : '#261429';
          ctx.fillRect(tx, ty, TILE, TILE);
          if (((c * 31 + r * 17) % 29) === 0) {
            ctx.fillStyle = 'rgba(0,0,0,0.25)';
            ctx.fillRect(tx + 4, ty + 10, 18, 2);
          }
        }
      }

      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          const t = this.walls[r][c];
          if (t === 0) continue;
          const tx = this.roomX + c * TILE;
          const ty = this.roomY + r * TILE;
          if (t === 1) {
            ctx.fillStyle = '#4a2a55';
            ctx.fillRect(tx, ty, TILE, TILE);
            ctx.strokeStyle = '#2e1a36'; ctx.lineWidth = 1;
            ctx.strokeRect(tx + 0.5, ty + 0.5, TILE - 1, TILE - 1);
            ctx.beginPath();
            ctx.moveTo(tx, ty + TILE/2); ctx.lineTo(tx + TILE, ty + TILE/2);
            ctx.stroke();
          } else {
            ctx.fillStyle = '#6a4278';
            ctx.fillRect(tx + 4, ty + 4, TILE - 8, TILE - 8);
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.fillRect(tx + TILE - 10, ty + 4, 6, TILE - 8);
          }
        }
      }

      for (const to of this.torches) {
        const flick = Math.sin(this.time * 14 + to.x) * 3;
        const rad = 120 + flick;
        const g = ctx.createRadialGradient(to.x, to.y, 5, to.x, to.y, rad);
        g.addColorStop(0, 'rgba(255,180,80,0.25)');
        g.addColorStop(1, 'rgba(255,180,80,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(to.x, to.y, rad, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffcc66';
        ctx.beginPath(); ctx.arc(to.x, to.y, 5 + flick * 0.1, 0, Math.PI * 2); ctx.fill();
      }

      for (const ch of this.chests) {
        if (!Assets.draw(ctx, 'cp_chest', ch.x, ch.y, 28, 28, { fallback: () => {
          ctx.fillStyle = '#8a4a2a';
          ctx.fillRect(ch.x - 12, ch.y - 8, 24, 16);
          ctx.fillStyle = ch.opened ? '#3a1a0a' : '#a06030';
          ctx.fillRect(ch.x - 12, ch.y - 12, 24, 8);
          ctx.fillStyle = '#ffcc33';
          ctx.fillRect(ch.x - 2, ch.y - 2, 4, 4);
          if (ch.opened) {
            ctx.fillStyle = '#ffd86b';
            ctx.fillRect(ch.x - 8, ch.y, 16, 2);
          }
        }})) {}
      }

      for (const po of this.ground_potions) {
        const bob = Math.sin(this.time * 3 + po.x) * 2;
        if (!Assets.draw(ctx, 'cp_potion', po.x, po.y + bob, 22, 22, { fallback: () => {
          ctx.fillStyle = '#d0504e';
          ctx.fillRect(po.x - 6, po.y - 6 + bob, 12, 12);
          ctx.fillStyle = '#eee';
          ctx.fillRect(po.x - 3, po.y - 10 + bob, 6, 4);
        }})) {}
      }

      if (this.enemies.length === 0 && this.floor < MAX_FLOOR) {
        const s = this.stairs;
        const pulse = 1 + Math.sin(this.time * 4) * 0.15;
        ctx.fillStyle = 'rgba(180,120,255,0.25)';
        ctx.beginPath(); ctx.arc(s.x, s.y, 30 * pulse, 0, Math.PI * 2); ctx.fill();
        if (!Assets.draw(ctx, 'cp_stairs', s.x, s.y, 34, 34, { fallback: () => {
          ctx.fillStyle = '#000';
          for (let i = 0; i < 4; i++) {
            ctx.fillRect(s.x - 12 + i * 2, s.y - 12 + i * 4, 24 - i * 4, 4);
          }
        }})) {}
      }

      for (const e of this.enemies) this.drawEnemy(ctx, e);
      this.drawHero(ctx);

      const vg = ctx.createRadialGradient(W/2, H/2, 150, W/2, H/2, 600);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

      if (this.transition > 0) {
        ctx.fillStyle = `rgba(0,0,0,${this.transition})`;
        ctx.fillRect(0, 0, W, H);
      }

      // Floor intro banner
      if (this.transition > 0.5) {
        ctx.fillStyle = this.floor === MAX_FLOOR ? '#ff4fd8' : '#ffd86b';
        ctx.font = 'bold 32px monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(this.floor === MAX_FLOOR ? 'THE CRYPT LORD' : 'FLOOR ' + this.floor, W/2, H/2);
      }

      if (this.enemies.length === 0 && this.floor < MAX_FLOOR) {
        ctx.fillStyle = 'rgba(255,230,140,0.85)';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('ROOM CLEAR — FIND THE STAIRS', W/2, this.roomY - 10);
      }

      if (this.phase === 'victory') {
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#ff4fd8';
        ctx.font = 'bold 44px monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('CRYPT CLEANSED', W/2, H/2);
      }
    }

    drawHero(ctx) {
      const h = this.hero;
      if (!(h.inv > 0 && Math.floor(h.inv * 14) % 2 === 0)) {
        if (!Assets.draw(ctx, 'cp_hero', h.x, h.y, 32, 32, { flipX: h.facing < 0, fallback: () => {
          ctx.fillStyle = '#66ccff'; ctx.fillRect(h.x - 8, h.y - 2, 16, 14);
          ctx.fillStyle = '#ffd29a'; ctx.fillRect(h.x - 7, h.y - 14, 14, 12);
          ctx.fillStyle = '#000';
          const e1 = h.facing > 0 ? -2 : -6;
          ctx.fillRect(h.x + e1, h.y - 10, 2, 2); ctx.fillRect(h.x + e1 + 4, h.y - 10, 2, 2);
          ctx.fillStyle = '#5a3a1a';
          ctx.fillRect(h.x - 7, h.y - 14, 14, 4);
          ctx.fillStyle = '#222';
          ctx.fillRect(h.x - 6, h.y + 10, 5, 3); ctx.fillRect(h.x + 1, h.y + 10, 5, 3);
        }})) {}
      }
      if (h.swing > 0) {
        const prog = 1 - (h.swing / 0.25);
        const a = h.swingAngle + (prog - 0.5) * 1.1;
        ctx.save();
        ctx.translate(h.x, h.y);
        ctx.rotate(a);
        const reach = 14 + this.swordRange * 0.3;
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(14, -3, reach, 6);
        ctx.fillStyle = '#a8a8a8';
        ctx.fillRect(14, -3, reach, 2);
        ctx.fillStyle = '#8a4a2a';
        ctx.fillRect(10, -4, 4, 8);
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.35 + this.save.upgrades.sword * 0.15) + ')';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, this.swordRange * 0.7, -0.6, 0.6);
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.fillStyle = '#cfcfcf';
        ctx.fillRect(h.x + (h.facing > 0 ? 6 : -10), h.y + 2, 4, 12);
      }
    }

    drawEnemy(ctx, e) {
      const bob = Math.sin(e.t * 4) * 2;
      if (e.kind === 'slime') {
        if (!Assets.draw(ctx, 'cp_slime', e.x, e.y + bob, 28, 28, { fallback: () => {
          ctx.fillStyle = '#6cff9a';
          ctx.beginPath();
          ctx.ellipse(e.x, e.y + bob + 2, 14, 10, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#000';
          ctx.fillRect(e.x - 5, e.y + bob - 2, 2, 2);
          ctx.fillRect(e.x + 3, e.y + bob - 2, 2, 2);
        }})) {}
      } else if (e.kind === 'skeleton') {
        if (!Assets.draw(ctx, 'cp_skeleton', e.x, e.y + bob * 0.4, 28, 34, { fallback: () => {
          ctx.fillStyle = '#e8e8d8';
          ctx.fillRect(e.x - 6, e.y - 14, 12, 10);
          ctx.fillRect(e.x - 7, e.y - 4, 14, 16);
          ctx.fillStyle = '#000';
          ctx.fillRect(e.x - 4, e.y - 10, 2, 3);
          ctx.fillRect(e.x + 2, e.y - 10, 2, 3);
          ctx.strokeStyle = '#555'; ctx.lineWidth = 1;
          ctx.beginPath();
          for (let i = 0; i < 3; i++) {
            const ry = e.y - 1 + i * 4;
            ctx.moveTo(e.x - 6, ry); ctx.lineTo(e.x + 6, ry);
          }
          ctx.stroke();
        }})) {}
      } else if (e.kind === 'bat') {
        const wing = Math.sin(e.t * 16) * 8;
        ctx.fillStyle = '#3a1440';
        ctx.beginPath(); ctx.arc(e.x, e.y + bob, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#5a2070';
        ctx.beginPath();
        ctx.moveTo(e.x - 8, e.y + bob);
        ctx.lineTo(e.x - 16, e.y + bob - wing);
        ctx.lineTo(e.x - 8, e.y + bob + 4);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(e.x + 8, e.y + bob);
        ctx.lineTo(e.x + 16, e.y + bob - wing);
        ctx.lineTo(e.x + 8, e.y + bob + 4);
        ctx.fill();
        ctx.fillStyle = '#ff4466';
        ctx.fillRect(e.x - 3, e.y + bob - 2, 2, 2);
        ctx.fillRect(e.x + 1, e.y + bob - 2, 2, 2);
      } else if (e.kind === 'ghost') {
        const float = Math.sin(e.t * 2) * 4;
        ctx.save();
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = '#cfe8ff';
        ctx.beginPath();
        ctx.ellipse(e.x, e.y + float, 12, 14, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.fillRect(e.x - 4, e.y + float - 4, 2, 3);
        ctx.fillRect(e.x + 2, e.y + float - 4, 2, 3);
        ctx.restore();
      } else if (e.kind === 'boss') {
        const pulse = 1 + Math.sin(e.t * 2) * 0.08;
        ctx.save();
        ctx.shadowColor = e.phase2 ? '#ff4fd8' : '#cfe8ff'; ctx.shadowBlur = 28;
        ctx.fillStyle = e.phase2 ? '#ff4fd8' : '#e8e8d8';
        ctx.beginPath();
        ctx.arc(e.x, e.y + bob, e.r * pulse, 0, Math.PI * 2);
        ctx.fill();
        // crown
        ctx.fillStyle = '#ffd86b';
        ctx.fillRect(e.x - 12, e.y + bob - e.r - 6, 24, 4);
        ctx.fillRect(e.x - 10, e.y + bob - e.r - 10, 4, 4);
        ctx.fillRect(e.x - 2, e.y + bob - e.r - 10, 4, 4);
        ctx.fillRect(e.x + 6, e.y + bob - e.r - 10, 4, 4);
        // eyes
        ctx.fillStyle = '#000';
        ctx.fillRect(e.x - 8, e.y + bob - 4, 4, 4);
        ctx.fillRect(e.x + 4, e.y + bob - 4, 4, 4);
        ctx.restore();
        // HP bar
        const pct = e.hp / e.maxHp;
        ctx.fillStyle = '#300';
        ctx.fillRect(e.x - 50, e.y - e.r - 22, 100, 6);
        ctx.fillStyle = e.phase2 ? '#ff4fd8' : '#ff6666';
        ctx.fillRect(e.x - 50, e.y - e.r - 22, 100 * pct, 6);
      }
      if (e.hp > 1 && e.kind !== 'boss') {
        for (let i = 0; i < e.hp; i++) {
          ctx.fillStyle = '#f66';
          ctx.fillRect(e.x - 8 + i * 4, e.y - 22, 3, 3);
        }
      }
    }

    _renderShop(ctx) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#2a1040'); g.addColorStop(1, '#08000a');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

      ctx.fillStyle = '#ffd86b';
      ctx.font = 'bold 40px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText('THE CRYPT', W / 2, 50);
      ctx.fillStyle = '#a58abd';
      ctx.font = '14px ui-monospace, monospace';
      ctx.fillText('8 floors. boss at floor 8. best: floor ' + this.save.bestFloor, W / 2, 96);
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
      ctx.strokeStyle = '#ff4fd8'; ctx.lineWidth = 2;
      ctx.strokeRect(cbx + 0.5, cby + 0.5, cbw, cbh);
      ctx.fillStyle = '#ffd4ee';
      ctx.font = 'bold 18px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('DESCEND \u2193', W / 2, cby + cbh / 2);
      this.shopRects.push({ x: cbx, y: cby, w: cbw, h: cbh, kind: 'launch' });
    }

    coinsEarned(score) { return Math.max(0, Math.floor(score / 75)); }
  }

  NDP.attachGame('crypt', CryptGame);
})();
