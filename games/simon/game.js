/* Simon — classic watch-and-repeat memory duel.
   Four quadrants, one more step per round. Miss = over.
   Score = cleared rounds × 10 + per-round bonus for speed. */
(function () {
  const NDP = window.NDP;
  const { BaseGame, Input, Storage } = NDP.Engine;

  const W = 960, H = 600;
  const CX = W / 2, CY = H / 2 + 20;
  const R_OUTER = 240;
  const R_INNER = 70;

  // Pads: top-left, top-right, bottom-right, bottom-left.
  // Indexed 0..3 in that order.
  const PADS = [
    { a0: Math.PI,            a1: -Math.PI / 2, col: '#dc2626', lit: '#fca5a5', freq: 261.63 }, // C4  red
    { a0: -Math.PI / 2,       a1: 0,            col: '#16a34a', lit: '#86efac', freq: 329.63 }, // E4  green
    { a0: 0,                  a1:  Math.PI / 2, col: '#eab308', lit: '#fde68a', freq: 392.00 }, // G4  yellow
    { a0:  Math.PI / 2,       a1:  Math.PI,     col: '#2563eb', lit: '#93c5fd', freq: 523.25 }  // C5  blue
  ];

  class SimonGame extends BaseGame {
    init() {
      const d = Storage.getGameData('simon') || {};
      this.best = d.best || 0;

      // Phases: 'intro' | 'show' | 'input' | 'fail' | 'success'
      this.phase = 'intro';
      this.sequence = [];          // array of pad indices
      this.userIx = 0;             // next index user must press
      this.showIx = -1;            // current pad being shown (-1 = gap)
      this.showTimer = 0;
      this.flashPad = -1;
      this.flashTimer = 0;
      this.errorTimer = 0;
      this.successTimer = 0;
      this.roundStartTime = 0;

      this.sfx = this.makeSfx({
        click: { freq: 440, type: 'square',   dur: 0.08, vol: 0.2 },
        fail:  { freq: 120, type: 'sawtooth', dur: 0.6,  slide: -80, vol: 0.5 },
        win:   { freq: 880, type: 'triangle', dur: 0.25, slide: 440, vol: 0.4 }
      });

      this._refreshHud();
    }

    _refreshHud() {
      const r = this.phase === 'intro' ? 0 : Math.max(0, this.sequence.length - (this.phase === 'show' ? 0 : 1));
      const cleared = Math.max(0, this.sequence.length - 1);
      this.setHud(
        `<span>Round <b>${this.sequence.length || 0}</b></span>` +
        `<span>Cleared <b>${cleared}</b></span>` +
        `<span>Best <b>${this.best}</b></span>` +
        `<span>Score <b>${this.score}</b></span>`
      );
    }

    _padSpeed() {
      // Pad show-duration shrinks as sequence grows.
      const n = this.sequence.length;
      if (n < 5)   return { on: 0.55, gap: 0.18 };
      if (n < 10)  return { on: 0.42, gap: 0.14 };
      if (n < 16)  return { on: 0.32, gap: 0.10 };
      return       { on: 0.22, gap: 0.07 };
    }

    _padAt(x, y) {
      const dx = x - CX, dy = y - CY;
      const r = Math.hypot(dx, dy);
      if (r < R_INNER || r > R_OUTER) return -1;
      const ang = Math.atan2(dy, dx); // -PI..PI
      // Map to pad index using pad arcs.
      for (let i = 0; i < 4; i++) {
        const p = PADS[i];
        // Normalize: test if ang lies in [a0, a1] (where a1 > a0 except pad 0 wraps).
        if (i === 0) {
          // pad 0: ang in (-PI, -PI/2)
          if (ang >= -Math.PI && ang < -Math.PI / 2) return 0;
        } else if (ang >= p.a0 && ang < p.a1) return i;
      }
      return -1;
    }

    _startRound() {
      // Add one more step.
      this.sequence.push((Math.random() * 4) | 0);
      this.phase = 'show';
      this.showIx = -1;
      this.showTimer = 0.5; // small lead-in gap
      this._refreshHud();
    }

    _flash(i, dur) {
      this.flashPad = i;
      this.flashTimer = dur;
      const p = PADS[i];
      NDP.Engine.Audio.beep({ freq: p.freq, type: 'triangle', dur: 0.24, vol: 0.35 });
    }

    update(dt) {
      if (this.flashTimer > 0) this.flashTimer = Math.max(0, this.flashTimer - dt);
      else this.flashPad = -1;

      if (this.phase === 'intro') {
        if (Input.mouse.justPressed || Input.keys['Enter'] || Input.keys[' ']) {
          this.sequence = [];
          this._startRound();
        }
        return;
      }

      if (this.phase === 'show') {
        this.showTimer -= dt;
        if (this.showTimer > 0) return;
        const spd = this._padSpeed();
        if (this.showIx === -1) {
          this.showIx = 0;
          this._flash(this.sequence[0], spd.on);
          this.showTimer = spd.on + spd.gap;
        } else {
          this.showIx++;
          if (this.showIx >= this.sequence.length) {
            this.phase = 'input';
            this.userIx = 0;
            this.roundStartTime = this.time;
          } else {
            this._flash(this.sequence[this.showIx], spd.on);
            this.showTimer = spd.on + spd.gap;
          }
        }
        return;
      }

      if (this.phase === 'input') {
        // Mouse
        if (Input.mouse.justPressed) {
          const i = this._padAt(Input.mouse.x, Input.mouse.y);
          if (i >= 0) this._pressPad(i);
        }
        // Keyboard 1..4 (top-left, top-right, bottom-right, bottom-left)
        const keymap = ['1', '2', '3', '4'];
        for (let i = 0; i < 4; i++) {
          if (Input.keys[keymap[i]] && !this._keyLatch[i]) {
            this._keyLatch[i] = true;
            this._pressPad(i);
          }
          if (!Input.keys[keymap[i]]) this._keyLatch[i] = false;
        }
        return;
      }

      if (this.phase === 'fail') {
        this.errorTimer -= dt;
        if (this.errorTimer <= 0) {
          this._persistBest();
          this.gameOver();
        }
        return;
      }

      if (this.phase === 'success') {
        this.successTimer -= dt;
        if (this.successTimer <= 0) this._startRound();
      }
    }

    _keyLatch = [false, false, false, false];

    _pressPad(i) {
      const spd = this._padSpeed();
      this._flash(i, Math.max(0.15, spd.on * 0.6));
      if (this.sequence[this.userIx] !== i) {
        // Wrong
        this.sfx.play('fail');
        this.shake(10, 0.4);
        this.flash('#ff3344', 0.3);
        this.phase = 'fail';
        this.errorTimer = 0.9;
        this._refreshHud();
        return;
      }
      this.userIx++;
      if (this.userIx >= this.sequence.length) {
        // Round cleared
        const elapsed = this.time - this.roundStartTime;
        const speedBonus = Math.max(0, Math.floor(20 - elapsed * 2));
        this.addScore(10 + speedBonus);
        this.particles.burst(CX, CY, 28, { color: '#6cff9a', speed: 240, life: 0.6, size: 3 });
        this.sfx.play('win');
        this.flash('#6cff9a', 0.15);
        this.phase = 'success';
        this.successTimer = 0.6;
        this._refreshHud();
      }
    }

    _persistBest() {
      const cleared = Math.max(0, this.sequence.length - 1);
      if (cleared > this.best) {
        this.best = cleared;
        Storage.setGameData('simon', { best: this.best });
      }
    }

    onEnd(score) {
      this._persistBest();
      const purse = Math.floor((score | 0) / 20);
      if (purse > 0) Storage.addGameWallet('simon', purse);
    }

    // Global coin payout: 1 per round cleared, bonus every 5.
    coinsEarned() {
      const c = Math.max(0, this.sequence.length - 1);
      return c + Math.floor(c / 5) * 2;
    }

    render(ctx) {
      // Backdrop
      const g = ctx.createRadialGradient(CX, CY, 40, CX, CY, 600);
      g.addColorStop(0, '#141428'); g.addColorStop(1, '#05050a');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

      // Title block (small, top)
      ctx.fillStyle = '#6cff9a';
      ctx.font = 'bold 22px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.shadowColor = '#6cff9a'; ctx.shadowBlur = 12;
      ctx.fillText('SIMON', W / 2, 18);
      ctx.shadowBlur = 0;

      // Pads
      for (let i = 0; i < 4; i++) {
        const p = PADS[i];
        const isLit = this.flashPad === i;
        ctx.fillStyle = isLit ? p.lit : p.col;
        ctx.shadowColor = isLit ? p.lit : 'transparent';
        ctx.shadowBlur = isLit ? 36 : 0;
        ctx.beginPath();
        ctx.moveTo(CX, CY);
        ctx.arc(CX, CY, R_OUTER, p.a0, p.a1);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Separators
      ctx.strokeStyle = '#05050a'; ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(CX - R_OUTER, CY); ctx.lineTo(CX + R_OUTER, CY);
      ctx.moveTo(CX, CY - R_OUTER); ctx.lineTo(CX, CY + R_OUTER);
      ctx.stroke();

      // Inner hub
      ctx.fillStyle = '#0a0a12';
      ctx.beginPath(); ctx.arc(CX, CY, R_INNER, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = this.phase === 'input' ? '#6cff9a'
                      : this.phase === 'show'  ? '#ffd86b'
                      : this.phase === 'fail'  ? '#ff3a3a' : '#3a3a55';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(CX, CY, R_INNER - 2, 0, Math.PI * 2); ctx.stroke();

      // Center text
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 32px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (this.phase === 'intro') {
        ctx.fillStyle = '#6cff9a'; ctx.font = 'bold 18px ui-monospace, monospace';
        ctx.fillText('CLICK', CX, CY - 6);
        ctx.fillStyle = '#ffd86b'; ctx.font = '11px ui-monospace, monospace';
        ctx.fillText('TO START', CX, CY + 12);
      } else if (this.phase === 'show') {
        ctx.fillStyle = '#ffd86b';
        ctx.font = 'bold 14px ui-monospace, monospace';
        ctx.fillText('WATCH', CX, CY - 10);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 24px ui-monospace, monospace';
        ctx.fillText(this.sequence.length, CX, CY + 14);
      } else if (this.phase === 'input') {
        ctx.fillStyle = '#6cff9a';
        ctx.font = 'bold 14px ui-monospace, monospace';
        ctx.fillText('REPEAT', CX, CY - 10);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 24px ui-monospace, monospace';
        ctx.fillText(this.userIx + ' / ' + this.sequence.length, CX, CY + 14);
      } else if (this.phase === 'fail') {
        ctx.fillStyle = '#ff6677';
        ctx.font = 'bold 20px ui-monospace, monospace';
        ctx.fillText('X', CX, CY);
      } else if (this.phase === 'success') {
        ctx.fillStyle = '#6cff9a';
        ctx.font = 'bold 20px ui-monospace, monospace';
        ctx.fillText('OK', CX, CY);
      }

      // Intro hint text
      if (this.phase === 'intro') {
        ctx.fillStyle = '#cfd8ea';
        ctx.font = '13px ui-monospace, monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText('Repeat the growing pattern. Click pads or press 1 / 2 / 3 / 4.', W / 2, H - 76);
        ctx.fillText('Red · Green · Yellow · Blue (clockwise from top-left)', W / 2, H - 58);
        if (this.best > 0) {
          ctx.fillStyle = '#ffd86b';
          ctx.fillText('Longest chain: ' + this.best, W / 2, H - 36);
        }
      }
    }
  }

  NDP.attachGame('simon', SimonGame);
})();
