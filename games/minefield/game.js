/* Minefield — classic minesweeper.
   Three difficulties chosen at intro (keys 1/2/3). Left-click reveals, shift
   or right-click flags. First click never hits a mine. Score = par-time bonus
   if the board is cleared. */
(function () {
  const NDP = window.NDP;
  const { BaseGame, Input, Storage } = NDP.Engine;

  const W = 960, H = 600;

  const DIFFS = [
    { id: 'easy',   name: 'EASY',   cols: 10, rows: 8,  mines: 10, par: 60,  reward: 30 },
    { id: 'med',    name: 'NORMAL', cols: 14, rows: 10, mines: 24, par: 120, reward: 70 },
    { id: 'hard',   name: 'HARD',   cols: 18, rows: 12, mines: 48, par: 240, reward: 150 }
  ];

  const NUM_COLORS = ['', '#7ae0ff', '#6cff9a', '#ffd86b', '#ff8b4a', '#ff6b6b', '#c084fc', '#fb7185', '#e2e8f0'];

  class MinefieldGame extends BaseGame {
    init() {
      const d = Storage.getGameData('minefield') || {};
      this.bests = Object.assign({ easy: 0, med: 0, hard: 0 }, d.bests || {});

      this.phase = 'intro';       // 'intro' | 'play' | 'won' | 'lost'
      this.diffIx = 1;
      this.diff = DIFFS[this.diffIx];
      this.board = [];
      this.firstClick = true;
      this.revealed = 0;
      this.flags = 0;
      this.elapsed = 0;
      this.deadMine = null;
      this._overTimer = 0;
      this._mouseLatch = false;

      this.sfx = this.makeSfx({
        reveal: { freq: 560, type: 'square',   dur: 0.04, vol: 0.15 },
        cascade:{ freq: 340, type: 'triangle', dur: 0.1,  slide: 440, vol: 0.2 },
        flag:   { freq: 720, type: 'square',   dur: 0.06, vol: 0.2 },
        boom:   { freq: 120, type: 'sawtooth', dur: 0.6,  slide: -80, vol: 0.55 },
        win:    { freq: 880, type: 'triangle', dur: 0.45, slide: 220, vol: 0.5 }
      });

      this._refreshHud();
    }

    _refreshHud() {
      const minesLeft = Math.max(0, this.diff.mines - this.flags);
      this.setHud(
        `<span>Mode <b>${this.diff.name}</b></span>` +
        `<span>Mines <b>${minesLeft}</b></span>` +
        `<span>Time <b>${this.elapsed.toFixed(0)}s</b></span>` +
        `<span>Score <b>${this.score}</b></span>`
      );
    }

    // ------------------------------------------------------------ layout
    _geometry() {
      const d = this.diff;
      const maxBoardW = W - 40;
      const maxBoardH = H - 140;
      const cell = Math.min(48, Math.floor(maxBoardW / d.cols), Math.floor(maxBoardH / d.rows));
      const bw = cell * d.cols;
      const bh = cell * d.rows;
      const ox = Math.floor((W - bw) / 2);
      const oy = 90;
      return { cell, bw, bh, ox, oy };
    }

    _newBoard() {
      const d = this.diff;
      this.board = [];
      for (let r = 0; r < d.rows; r++) {
        const row = [];
        for (let c = 0; c < d.cols; c++) row.push({ mine: false, n: 0, revealed: false, flagged: false });
        this.board.push(row);
      }
      this.firstClick = true;
      this.revealed = 0;
      this.flags = 0;
      this.elapsed = 0;
      this.deadMine = null;
    }

    _placeMines(safeR, safeC) {
      const d = this.diff;
      const avoid = new Set();
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        avoid.add((safeR + dr) + ',' + (safeC + dc));
      }
      let placed = 0;
      while (placed < d.mines) {
        const r = (Math.random() * d.rows) | 0;
        const c = (Math.random() * d.cols) | 0;
        if (avoid.has(r + ',' + c)) continue;
        if (this.board[r][c].mine) continue;
        this.board[r][c].mine = true;
        placed++;
      }
      // Compute neighbor counts.
      for (let r = 0; r < d.rows; r++) for (let c = 0; c < d.cols; c++) {
        if (this.board[r][c].mine) continue;
        let n = 0;
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const nr = r + dr, nc = c + dc;
          if (nr < 0 || nc < 0 || nr >= d.rows || nc >= d.cols) continue;
          if (this.board[nr][nc].mine) n++;
        }
        this.board[r][c].n = n;
      }
    }

    _reveal(r, c) {
      const d = this.diff;
      if (r < 0 || c < 0 || r >= d.rows || c >= d.cols) return;
      const cell = this.board[r][c];
      if (cell.revealed || cell.flagged) return;
      cell.revealed = true;
      this.revealed++;
      if (cell.mine) {
        this.deadMine = { r, c };
        this._lose();
        return;
      }
      if (cell.n === 0) {
        // Cascade-reveal neighbors.
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          this._reveal(r + dr, c + dc);
        }
      }
    }

    _toggleFlag(r, c) {
      const d = this.diff;
      if (r < 0 || c < 0 || r >= d.rows || c >= d.cols) return;
      const cell = this.board[r][c];
      if (cell.revealed) return;
      cell.flagged = !cell.flagged;
      this.flags += cell.flagged ? 1 : -1;
      this.sfx.play('flag');
    }

    _win() {
      this.phase = 'won';
      this._overTimer = 1.2;
      this.sfx.play('win');
      this.flash('#6cff9a', 0.3);
      const { bw, bh, ox, oy } = this._geometry();
      this.particles.burst(ox + bw / 2, oy + bh / 2, 60, { color: '#6cff9a', speed: 320, life: 1.0, size: 4 });
      // Score: reward + par bonus
      const d = this.diff;
      this.addScore(d.reward);
      const parBonus = Math.max(0, Math.floor((d.par - this.elapsed) * 2));
      this.addScore(parBonus);
      if (this.elapsed < (this.bests[d.id] || Infinity) || !this.bests[d.id]) {
        this.bests[d.id] = Math.floor(this.elapsed);
      }
      Storage.setGameData('minefield', { bests: this.bests });
    }

    _lose() {
      this.phase = 'lost';
      this._overTimer = 1.4;
      this.sfx.play('boom');
      this.shake(14, 0.5);
      this.flash('#ff3344', 0.4);
      // Reveal all mines.
      for (const row of this.board) for (const c of row) if (c.mine) c.revealed = true;
      const { ox, oy, cell } = this._geometry();
      if (this.deadMine) {
        const dx = ox + this.deadMine.c * cell + cell / 2;
        const dy = oy + this.deadMine.r * cell + cell / 2;
        this.particles.burst(dx, dy, 48, { color: '#ff6b6b', speed: 360, life: 0.9, size: 4 });
      }
    }

    _cellAt(mx, my) {
      const { cell, bw, bh, ox, oy } = this._geometry();
      if (mx < ox || my < oy || mx >= ox + bw || my >= oy + bh) return null;
      const c = Math.floor((mx - ox) / cell);
      const r = Math.floor((my - oy) / cell);
      return { r, c };
    }

    // ------------------------------------------------------------ loop
    update(dt) {
      if (this.phase === 'intro') {
        if (Input.keys['1']) this.diffIx = 0;
        if (Input.keys['2']) this.diffIx = 1;
        if (Input.keys['3']) this.diffIx = 2;
        this.diff = DIFFS[this.diffIx];
        if (Input.mouse.justPressed) {
          const pick = this._introDiffAt(Input.mouse.x, Input.mouse.y);
          if (pick !== -1) this.diffIx = pick;
          this.diff = DIFFS[this.diffIx];
          this._newBoard();
          this.phase = 'play';
          this._refreshHud();
        }
        if (Input.keys['Enter'] || Input.keys[' ']) {
          this._newBoard();
          this.phase = 'play';
          this._refreshHud();
        }
        return;
      }

      if (this.phase === 'play') {
        this.elapsed += dt;

        if (Input.mouse.justPressed) {
          const cell = this._cellAt(Input.mouse.x, Input.mouse.y);
          if (cell) {
            const flag = !!Input.keys['Shift'];
            if (flag) {
              this._toggleFlag(cell.r, cell.c);
            } else {
              if (this.firstClick) {
                this._placeMines(cell.r, cell.c);
                this.firstClick = false;
              }
              this.sfx.play('reveal');
              this._reveal(cell.r, cell.c);
              if (this.phase === 'play') {
                const d = this.diff;
                const total = d.rows * d.cols;
                if (this.revealed >= total - d.mines) this._win();
              }
            }
          }
        }
        this._refreshHud();
        return;
      }

      // won / lost
      this._overTimer = Math.max(0, this._overTimer - dt);
      if (this._overTimer <= 0) {
        if (Input.mouse.justPressed || Input.keys['Enter'] || Input.keys[' ']) {
          if (this.phase === 'won') this.win();
          else this.gameOver();
        }
        if (Input.keys['r'] || Input.keys['R']) {
          this.phase = 'intro';
          this._refreshHud();
        }
      }
    }

    _introDiffAt(mx, my) {
      // Three difficulty cards centered on screen.
      const cardW = 220, cardH = 130, gap = 20;
      const totalW = cardW * 3 + gap * 2;
      const startX = (W - totalW) / 2;
      const y = 260;
      for (let i = 0; i < 3; i++) {
        const x = startX + i * (cardW + gap);
        if (mx >= x && my >= y && mx <= x + cardW && my <= y + cardH) return i;
      }
      return -1;
    }

    onEnd(score) {
      const purse = Math.max(0, Math.floor((score | 0) / 30));
      if (purse > 0) Storage.addGameWallet('minefield', purse);
    }

    coinsEarned() {
      // Global coins: win only, scaled by difficulty.
      if (this.phase !== 'won') return 0;
      return [3, 8, 18][this.diffIx];
    }

    // ------------------------------------------------------------ render
    render(ctx) {
      ctx.fillStyle = '#0b111c'; ctx.fillRect(0, 0, W, H);

      if (this.phase === 'intro') { this._renderIntro(ctx); return; }

      const { cell, bw, bh, ox, oy } = this._geometry();

      // Title / stats header
      ctx.fillStyle = '#7ae0ff';
      ctx.font = 'bold 16px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText('MINEFIELD — ' + this.diff.name, W / 2, 20);
      ctx.fillStyle = '#cfd8ea'; ctx.font = '12px ui-monospace, monospace';
      ctx.fillText('Par: ' + this.diff.par + 's   ·   Shift-click to flag', W / 2, 44);

      // Board bg
      ctx.fillStyle = '#1a2438'; ctx.fillRect(ox - 4, oy - 4, bw + 8, bh + 8);
      ctx.strokeStyle = '#2e3c5a'; ctx.lineWidth = 1;
      ctx.strokeRect(ox - 4.5, oy - 4.5, bw + 9, bh + 9);

      // Cells
      for (let r = 0; r < this.diff.rows; r++) {
        for (let c = 0; c < this.diff.cols; c++) {
          const b = this.board[r][c];
          const x = ox + c * cell, y = oy + r * cell;
          if (b.revealed) {
            ctx.fillStyle = b.mine
              ? (this.deadMine && this.deadMine.r === r && this.deadMine.c === c ? '#ff3344' : '#7a1e28')
              : '#1a2438';
            ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
            if (b.mine) {
              ctx.fillStyle = '#000';
              ctx.beginPath(); ctx.arc(x + cell / 2, y + cell / 2, cell * 0.28, 0, Math.PI * 2); ctx.fill();
              ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.moveTo(x + cell/2, y + 4);           ctx.lineTo(x + cell/2, y + cell - 4);
              ctx.moveTo(x + 4, y + cell/2);           ctx.lineTo(x + cell - 4, y + cell/2);
              ctx.stroke();
            } else if (b.n > 0) {
              ctx.fillStyle = NUM_COLORS[b.n] || '#fff';
              const fs = Math.max(12, Math.floor(cell * 0.55));
              ctx.font = `bold ${fs}px ui-monospace, monospace`;
              ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
              ctx.fillText(b.n, x + cell / 2, y + cell / 2 + 1);
            }
          } else {
            // Unrevealed
            const g = ctx.createLinearGradient(x, y, x, y + cell);
            g.addColorStop(0, '#3b4a66'); g.addColorStop(1, '#2a364e');
            ctx.fillStyle = g;
            ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
            // Bevel
            ctx.fillStyle = 'rgba(255,255,255,0.08)';
            ctx.fillRect(x + 1, y + 1, cell - 2, 2);
            ctx.fillStyle = 'rgba(0,0,0,0.2)';
            ctx.fillRect(x + 1, y + cell - 3, cell - 2, 2);
            if (b.flagged) {
              ctx.fillStyle = '#ffcc33';
              const fx = x + cell * 0.3, fy = y + cell * 0.25;
              ctx.beginPath();
              ctx.moveTo(fx, fy); ctx.lineTo(fx + cell * 0.4, fy + cell * 0.15);
              ctx.lineTo(fx, fy + cell * 0.3); ctx.closePath(); ctx.fill();
              ctx.fillStyle = '#222';
              ctx.fillRect(fx - 1, fy, 2, cell * 0.55);
            }
          }
        }
      }

      // End-states
      if (this.phase === 'won' || this.phase === 'lost') {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = this.phase === 'won' ? '#6cff9a' : '#ff6b6b';
        ctx.font = 'bold 48px ui-monospace, monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(this.phase === 'won' ? 'CLEARED' : 'BOOM', W / 2, H / 2 - 30);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 16px ui-monospace, monospace';
        ctx.fillText('Time: ' + this.elapsed.toFixed(1) + 's   ·   Score: ' + this.score, W / 2, H / 2 + 6);
        if (this._overTimer <= 0) {
          ctx.fillStyle = '#ffd86b'; ctx.font = '14px ui-monospace, monospace';
          ctx.fillText(this.phase === 'won' ? 'Click to claim · R for new board' : 'Click to end · R for new board', W / 2, H / 2 + 36);
        }
      }
    }

    _renderIntro(ctx) {
      ctx.fillStyle = '#7ae0ff';
      ctx.shadowColor = '#7ae0ff'; ctx.shadowBlur = 14;
      ctx.font = 'bold 44px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('MINEFIELD', W / 2, 130);
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#cfd8ea'; ctx.font = '14px ui-monospace, monospace';
      ctx.fillText('Pick a board. First click is always safe. Shift-click to flag.', W / 2, 180);

      const cardW = 220, cardH = 130, gap = 20;
      const totalW = cardW * 3 + gap * 2;
      const startX = (W - totalW) / 2;
      const y = 260;
      for (let i = 0; i < 3; i++) {
        const d = DIFFS[i];
        const x = startX + i * (cardW + gap);
        const sel = i === this.diffIx;
        ctx.fillStyle = sel ? '#1a2f42' : '#101a2c';
        ctx.fillRect(x, y, cardW, cardH);
        ctx.strokeStyle = sel ? '#7ae0ff' : '#2e3c5a';
        ctx.lineWidth = sel ? 3 : 1;
        ctx.strokeRect(x + 0.5, y + 0.5, cardW, cardH);

        ctx.fillStyle = sel ? '#7ae0ff' : '#cfd8ea';
        ctx.font = 'bold 20px ui-monospace, monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(d.name, x + cardW / 2, y + 16);
        ctx.fillStyle = '#cfd8ea'; ctx.font = '13px ui-monospace, monospace';
        ctx.fillText(d.cols + ' × ' + d.rows + '   ·   ' + d.mines + ' mines', x + cardW / 2, y + 50);
        ctx.fillStyle = '#ffcc33';
        ctx.fillText('par ' + d.par + 's   ·   reward ' + d.reward, x + cardW / 2, y + 74);
        const bestS = this.bests[d.id];
        ctx.fillStyle = bestS ? '#6cff9a' : '#475569';
        ctx.font = 'bold 13px ui-monospace, monospace';
        ctx.fillText(bestS ? 'best: ' + bestS + 's' : 'no record', x + cardW / 2, y + cardH - 24);
      }

      ctx.fillStyle = '#fff'; ctx.font = 'bold 18px ui-monospace, monospace';
      ctx.fillText('Click a card to begin  (or press 1 · 2 · 3)', W / 2, y + cardH + 60);
    }
  }

  NDP.attachGame('minefield', MinefieldGame);
})();
