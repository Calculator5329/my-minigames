/* Cascade — 2048 with combo chains.
   ---------------------------------------------------------------------------
   Core is standard 2048 (4x4, slide to merge equal tiles).
   Twist:
     COMBO (per swipe)  — number of merges in a single swipe. Score for that
                          swipe is (sum of merged values) * 2^(combo-1).
     CHAIN (across swipes) — consecutive swipes that produced ≥1 merge. Each
                          extra chained swipe adds a persistent ×0.5 multiplier
                          to the next swipe's score. A no-merge swipe drops
                          the chain back to 0.
   Reach 2048 for a VICTORY bonus (run continues; keep piling up chain).
   Best tile + best score persisted per-game. */
(function () {
  const NDP = window.NDP;
  const { BaseGame, Input, Storage } = NDP.Engine;

  const W = 960, H = 600;
  const SIZE = 4;
  const BOARD_PX = 480;
  const PAD = 10;
  const CELL = (BOARD_PX - PAD * (SIZE + 1)) / SIZE;
  const OX = (W - BOARD_PX) / 2;
  const OY = 84;

  const COLORS = {
    0:    '#2b221a',
    2:    '#efe3d2',
    4:    '#ebd6a9',
    8:    '#f5b06a',
    16:   '#ff8b4a',
    32:   '#f5706a',
    64:   '#f54a6a',
    128:  '#f5cf66',
    256:  '#f7d77a',
    512:  '#f7e08a',
    1024: '#f9e89b',
    2048: '#6cff9a',
    4096: '#7af0ff',
    8192: '#c3a6ff'
  };

  function tileColor(v) { return COLORS[v] || '#c3a6ff'; }
  function tileText(v)  { return v <= 4 ? '#3a2f23' : '#1b1510'; }

  class CascadeGame extends BaseGame {
    init() {
      const d = Storage.getGameData('cascade') || {};
      this.best = d.best || 0;
      this.bestTile = d.bestTile || 0;
      this.chainBest = d.chainBest || 0;

      this.grid = this._emptyGrid();
      this.chain = 0;
      this.combo = 0;
      this.lastGained = 0;
      this.victoryShown = false;
      this.over = false;
      this.tiles = [];   // per-cell render state for animation { v, born, merged, just }
      this._initTiles();

      this._addRandom();
      this._addRandom();

      this.sfx = this.makeSfx({
        slide: { freq: 240, type: 'triangle', dur: 0.08, vol: 0.18 },
        merge: { freq: 420, type: 'triangle', dur: 0.1,  slide: 220, vol: 0.32 },
        chain: { freq: 660, type: 'triangle', dur: 0.18, slide: 320, vol: 0.38 },
        win:   { freq: 880, type: 'triangle', dur: 0.5,  slide: 440, vol: 0.5 },
        fail:  { freq: 130, type: 'sawtooth', dur: 0.6,  slide: -60, vol: 0.5 }
      });

      this._keyLatch = Object.create(null);
      this._refreshHud();
    }

    _emptyGrid() {
      const g = [];
      for (let r = 0; r < SIZE; r++) { const row = []; for (let c = 0; c < SIZE; c++) row.push(0); g.push(row); }
      return g;
    }

    _initTiles() {
      this.tiles = [];
      for (let r = 0; r < SIZE; r++) { const row = []; for (let c = 0; c < SIZE; c++) row.push({ born: 0, merged: 0, just: false }); this.tiles.push(row); }
    }

    _refreshHud() {
      this.setHud(
        `<span>Score <b>${this.score}</b></span>` +
        `<span>Chain <b>x${this.chain}</b></span>` +
        `<span>Best tile <b>${this.bestTile}</b></span>` +
        `<span>Best <b>${this.best}</b></span>`
      );
    }

    _addRandom() {
      const empty = [];
      for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (this.grid[r][c] === 0) empty.push([r, c]);
      if (!empty.length) return false;
      const [r, c] = empty[(Math.random() * empty.length) | 0];
      this.grid[r][c] = Math.random() < 0.9 ? 2 : 4;
      this.tiles[r][c].born = 0.001;
      return true;
    }

    _hasMoves() {
      for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
        if (this.grid[r][c] === 0) return true;
        if (c + 1 < SIZE && this.grid[r][c] === this.grid[r][c + 1]) return true;
        if (r + 1 < SIZE && this.grid[r][c] === this.grid[r + 1][c]) return true;
      }
      return false;
    }

    // Slide entire grid. dir: 'left'|'right'|'up'|'down'.
    // Returns { moved, merges, mergedValue }
    _slide(dir) {
      let moved = false, merges = 0, mergedValue = 0;
      // Mark no tile as merged this swipe yet.
      for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) this.tiles[r][c].just = false;

      const readLine = (i) => {
        // Extract the 4 cells in the order they should slide toward the "front".
        const line = [];
        for (let k = 0; k < SIZE; k++) {
          if (dir === 'left')  line.push({ v: this.grid[i][k],         r: i, c: k });
          if (dir === 'right') line.push({ v: this.grid[i][SIZE-1-k],  r: i, c: SIZE-1-k });
          if (dir === 'up')    line.push({ v: this.grid[k][i],         r: k, c: i });
          if (dir === 'down')  line.push({ v: this.grid[SIZE-1-k][i],  r: SIZE-1-k, c: i });
        }
        return line;
      };
      const writeLine = (i, newVals, mergedAt) => {
        // newVals is length 4 (with zeros padding), in "front-first" order.
        const targets = [];
        for (let k = 0; k < SIZE; k++) {
          if (dir === 'left')  targets.push([i, k]);
          if (dir === 'right') targets.push([i, SIZE-1-k]);
          if (dir === 'up')    targets.push([k, i]);
          if (dir === 'down')  targets.push([SIZE-1-k, i]);
        }
        for (let k = 0; k < SIZE; k++) {
          const [r, c] = targets[k];
          if (this.grid[r][c] !== newVals[k]) moved = true;
          this.grid[r][c] = newVals[k];
          if (mergedAt[k]) {
            this.tiles[r][c].merged = 0.001;
            this.tiles[r][c].just = true;
          }
        }
      };

      for (let i = 0; i < SIZE; i++) {
        const line = readLine(i);
        const vals = line.map(x => x.v).filter(v => v !== 0);
        const out = [];
        const mergedAt = [];
        let j = 0;
        while (j < vals.length) {
          if (j + 1 < vals.length && vals[j] === vals[j + 1]) {
            const nv = vals[j] * 2;
            out.push(nv); mergedAt.push(true);
            merges++; mergedValue += nv;
            if (nv > this.bestTile) this.bestTile = nv;
            j += 2;
          } else {
            out.push(vals[j]); mergedAt.push(false);
            j += 1;
          }
        }
        while (out.length < SIZE) { out.push(0); mergedAt.push(false); }
        writeLine(i, out, mergedAt);
      }
      return { moved, merges, mergedValue };
    }

    _doSwipe(dir) {
      if (this.over) return;
      const { moved, merges, mergedValue } = this._slide(dir);
      if (!moved) {
        this.sfx.play('fail', { vol: 0.12, dur: 0.05 });
        return;
      }
      this.sfx.play('slide');
      if (merges > 0) {
        this.combo = merges;
        const comboMult = Math.pow(2, merges - 1);       // 1, 2, 4, 8...
        const chainMult = 1 + this.chain * 0.5;           // 1, 1.5, 2.0...
        const gained = Math.floor(mergedValue * comboMult * chainMult);
        this.addScore(gained);
        this.lastGained = gained;
        this.chain++;
        if (this.chain > this.chainBest) this.chainBest = this.chain;
        this.sfx.play(merges >= 2 ? 'chain' : 'merge');
        if (merges >= 2) {
          this.shake(4 + merges * 2, 0.2);
          this.flash('#f5cf66', 0.12);
          this.particles.burst(W / 2, OY + BOARD_PX / 2, 14 + merges * 6,
            { color: '#f5cf66', speed: 240, life: 0.55, size: 3 });
        }
        // 2048 victory (once)
        if (!this.victoryShown && this.bestTile >= 2048) {
          this.victoryShown = true;
          this.addScore(2048);
          this.flash('#6cff9a', 0.4);
          this.shake(14, 0.5);
          this.sfx.play('win');
          this.particles.burst(W / 2, H / 2, 80, { color: '#6cff9a', speed: 360, life: 1.2, size: 4 });
        }
      } else {
        // Empty swipe — chain drops.
        this.combo = 0;
        this.lastGained = 0;
        this.chain = 0;
      }
      this._addRandom();
      if (!this._hasMoves()) this._endRun();
      this._refreshHud();
      this._persist();
    }

    _endRun() {
      this.over = true;
      this.sfx.play('fail');
      this.flash('#ff3344', 0.3);
      this.shake(12, 0.5);
      this._persist();
      // Let the player see the final board briefly before closing out.
      this._overTimer = 1.2;
    }

    _persist() {
      if (this.score > this.best) this.best = this.score;
      Storage.setGameData('cascade', {
        best: this.best,
        bestTile: this.bestTile,
        chainBest: this.chainBest
      });
    }

    _restart() {
      this.grid = this._emptyGrid();
      this._initTiles();
      this._addRandom(); this._addRandom();
      this.score = 0; this.chain = 0; this.combo = 0; this.lastGained = 0;
      this.victoryShown = false; this.over = false; this._overTimer = 0;
      this._refreshHud();
    }

    update(dt) {
      // Key edge-detect
      const press = (k) => {
        if (Input.keys[k] && !this._keyLatch[k]) { this._keyLatch[k] = true; return true; }
        if (!Input.keys[k]) this._keyLatch[k] = false;
        return false;
      };

      if (this.over) {
        this._overTimer = Math.max(0, (this._overTimer || 0) - dt);
        if (this._overTimer <= 0) {
          if (Input.mouse.justPressed || press('Enter') || press(' ')) {
            this._persist();
            this.gameOver();
          }
        }
        if (press('r') || press('R')) this._restart();
        return;
      }

      if (press('ArrowLeft')  || press('a') || press('A')) this._doSwipe('left');
      if (press('ArrowRight') || press('d') || press('D')) this._doSwipe('right');
      if (press('ArrowUp')    || press('w') || press('W')) this._doSwipe('up');
      if (press('ArrowDown')  || press('s') || press('S')) this._doSwipe('down');
      if (press('r') || press('R')) this._restart();

      // Advance tile animation clocks.
      for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
        const t = this.tiles[r][c];
        if (t.born > 0) t.born = Math.min(1, t.born + dt * 6);
        if (t.merged > 0) t.merged = Math.min(1, t.merged + dt * 5);
      }
    }

    onEnd(score) {
      this._persist();
      const purse = Math.max(0, Math.floor((score | 0) / 500));
      if (purse > 0) Storage.addGameWallet('cascade', purse);
    }

    coinsEarned() {
      // Flat conversion: 1 per 500 score, plus bonus per 2048 reached.
      let c = Math.max(0, Math.floor(this.score / 500));
      if (this.bestTile >= 2048) c += 10;
      if (this.bestTile >= 4096) c += 20;
      return c;
    }

    render(ctx) {
      // Backdrop
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#24180e'); g.addColorStop(1, '#0b0604');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

      // Top bars — CHAIN left, COMBO right, score centered.
      ctx.textBaseline = 'top';
      ctx.font = 'bold 14px ui-monospace, monospace';
      ctx.textAlign = 'left';
      const chainCol = this.chain >= 4 ? '#6cff9a' : this.chain >= 2 ? '#f5cf66' : '#cfd8ea';
      ctx.fillStyle = chainCol;
      ctx.fillText('CHAIN  x' + this.chain + (this.chain > 0 ? '   (' + (1 + this.chain * 0.5).toFixed(1) + 'x scoring)' : ''), 32, 22);

      ctx.textAlign = 'right';
      const comboCol = this.combo >= 3 ? '#6cff9a' : this.combo >= 2 ? '#f5cf66' : '#cfd8ea';
      ctx.fillStyle = comboCol;
      ctx.fillText((this.combo > 1 ? 'COMBO  x' + Math.pow(2, this.combo - 1) : 'COMBO  —') + '  ', W - 32, 22);

      // Score banner
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd86b';
      ctx.font = 'bold 16px ui-monospace, monospace';
      ctx.fillText('CASCADE', W / 2, 18);
      ctx.font = 'bold 28px ui-monospace, monospace';
      ctx.fillStyle = '#fff';
      ctx.fillText(this.score.toString(), W / 2, 42);
      if (this.lastGained > 0) {
        ctx.font = 'bold 14px ui-monospace, monospace';
        ctx.fillStyle = '#6cff9a';
        ctx.fillText('+' + this.lastGained, W / 2, 70);
      }

      // Board background
      ctx.fillStyle = '#3a2f23';
      this._roundRect(ctx, OX, OY, BOARD_PX, BOARD_PX, 8);
      ctx.fill();

      // Empty cells
      for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
        const x = OX + PAD + c * (CELL + PAD);
        const y = OY + PAD + r * (CELL + PAD);
        ctx.fillStyle = '#2b221a';
        this._roundRect(ctx, x, y, CELL, CELL, 6);
        ctx.fill();
      }

      // Tiles
      for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
        const v = this.grid[r][c];
        if (!v) continue;
        const x = OX + PAD + c * (CELL + PAD);
        const y = OY + PAD + r * (CELL + PAD);
        const t = this.tiles[r][c];
        // Entry pop
        let scale = 1;
        if (t.born > 0 && t.born < 1) scale = 0.6 + 0.4 * t.born;
        if (t.merged > 0 && t.merged < 1) scale = 1 + 0.15 * (1 - Math.abs(0.5 - t.merged) * 2);
        const cx = x + CELL / 2, cy = y + CELL / 2;
        const sw = CELL * scale, sh = CELL * scale;

        ctx.fillStyle = tileColor(v);
        if (v >= 128) { ctx.shadowColor = tileColor(v); ctx.shadowBlur = 12; }
        this._roundRect(ctx, cx - sw / 2, cy - sh / 2, sw, sh, 6);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.fillStyle = tileText(v);
        const fs = v < 100 ? 34 : v < 1000 ? 28 : v < 10000 ? 22 : 18;
        ctx.font = `bold ${fs}px ui-monospace, monospace`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(v.toString(), cx, cy);
      }

      // Hint strip
      ctx.fillStyle = '#7a6a52';
      ctx.font = '12px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText('Arrows / WASD to slide · two merges in one swipe = COMBO x2 · keep merging for CHAIN', W / 2, OY + BOARD_PX + 14);
      ctx.fillText('R to restart', W / 2, OY + BOARD_PX + 32);

      if (this.over) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#ff8b4a'; ctx.font = 'bold 42px ui-monospace, monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('NO MOVES', W / 2, H / 2 - 30);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 18px ui-monospace, monospace';
        ctx.fillText('Best tile: ' + this.bestTile + '   ·   Score: ' + this.score, W / 2, H / 2 + 10);
        if ((this._overTimer || 0) <= 0) {
          ctx.fillStyle = '#6cff9a'; ctx.font = 'bold 16px ui-monospace, monospace';
          ctx.fillText('Click to end run   ·   R to retry', W / 2, H / 2 + 42);
        }
      }
    }

    _roundRect(ctx, x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y,     x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x,     y + h, r);
      ctx.arcTo(x,     y + h, x,     y,     r);
      ctx.arcTo(x,     y,     x + w, y,     r);
      ctx.closePath();
    }
  }

  NDP.attachGame('cascade', CascadeGame);
})();
