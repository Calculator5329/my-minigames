/* Paperweight — cozy desk reactive sim.
   A window gusts periodically. Papers on your desk drift toward the window.
   Click to place a weight on any paper. Weights deplete. Each "gust" event
   gets stronger. Round ends when all papers fly off OR all weights are used
   (you get the score of papers still on the desk).

   Two paper states:
     - resting (on desk, may drift slightly)
     - airborne (past wind threshold) — rising, rotating, gone when off-screen
   A weighted paper is locked and can't fly off. */
(function () {
  const NDP = window.NDP;
  const { BaseGame, Input } = NDP.Engine;

  const W = 960, H = 600;
  const WEIGHT_TYPES = [
    { id: 'rock',   r: 16, color: '#58585e', label: 'rock',  count: 3 },
    { id: 'mug',    r: 18, color: '#e8c48a', label: 'mug',   count: 3 },
    { id: 'apple',  r: 12, color: '#d84a48', label: 'apple', count: 1 },
    { id: 'book',   r: 22, color: '#4a5a7a', label: 'book',  count: 2 }
  ];

  class PaperweightGame extends BaseGame {
    init() {
      this.roundTime = 90;
      this.papers = [];
      // Spawn 14 papers at varied positions on the desk
      for (let i = 0; i < 14; i++) {
        this.papers.push({
          x: 120 + Math.random() * (W - 240),
          y: 100 + Math.random() * (H - 200),
          rot: (Math.random() - 0.5) * 0.3,
          vx: 0, vy: 0, vr: 0,
          weighted: false, weight: null,
          airborne: false,
          label: String.fromCharCode(65 + (i % 26))
        });
      }
      this.weights = WEIGHT_TYPES.map(t => ({ ...t, left: t.count, placed: [] }));
      this.selectedWeight = 0;
      this.gustTimer = 4;
      this.currentWind = 0;
      this.targetWind = 0;
      this.windX = 0;
      this.savedPapers = 0;
      this.lostPapers = 0;
      this._bound = false;
      this.sfx = this.makeSfx({
        place:  { freq: 300, type: 'square', dur: 0.08, slide: -80, vol: 0.3 },
        gust:   { freq: 220, type: 'noise', dur: 0.4,  vol: 0.35, filter: 'lowpass' },
        save:   { freq: 660, type: 'triangle', dur: 0.08, slide: 220, vol: 0.25 },
        lose:   { freq: 180, type: 'sawtooth', dur: 0.15, slide: -80, vol: 0.2 }
      });
      this.setHud(this.makeHud());
    }

    makeHud() {
      const timeLeft = Math.max(0, this.roundTime - this.time);
      const stock = this.weights.map(w => `${w.label} <b>${w.left}</b>`).join(' &middot; ');
      return `<span>Time <b>${timeLeft.toFixed(1)}</b></span>` +
             `<span>Desk <b>${this.papersOnDesk()}</b></span>` +
             `<span>${stock}</span>` +
             `<span>Saved <b>${this.savedPapers}</b></span>`;
    }

    papersOnDesk() {
      return this.papers.filter(p => !p.airborne).length;
    }

    update(dt) {
      if (!this._bound) {
        Input.on('mousedown', (e) => this._onClick());
        Input.on('keydown', (e) => {
          const k = e.key;
          if (k >= '1' && k <= '4') this.selectedWeight = Math.min(this.weights.length - 1, Number(k) - 1);
        });
        this._bound = true;
      }

      if (this.time >= this.roundTime) {
        this.addScore(this.papersOnDesk() * 10);
        this.win();
        return;
      }

      // Gust cycles — sine-ish with a random target that ramps up over time.
      this.gustTimer -= dt;
      if (this.gustTimer <= 0) {
        const strength = 0.3 + Math.min(1, this.time / 60) * 0.9;
        this.targetWind = strength;
        this.gustTimer = 3.5 + Math.random() * 2.5;
        this.sfx.play('gust', { vol: 0.2 + strength * 0.25 });
      }
      // Ease wind toward target, then decay back to 0 after peak
      this.currentWind += (this.targetWind - this.currentWind) * Math.min(1, dt * 2.4);
      if (this.currentWind > 0.05 && this.targetWind > 0) {
        // Once ramped up, target back to 0 after a moment so gust ends
        if (Math.abs(this.currentWind - this.targetWind) < 0.1) this.targetWind = 0;
      }
      // Wind direction drifts — mostly toward bottom-left (window at top-right)
      this.windX = -220 * this.currentWind + Math.sin(this.time * 0.7) * 30;
      const windY = 40 * this.currentWind;     // slight downward push

      // Paper physics
      for (const p of this.papers) {
        if (p.weighted) {
          // Locked — weight drifts slightly with wind, maybe jitters.
          p.rot += (Math.random() - 0.5) * 0.002;
          continue;
        }
        if (!p.airborne) {
          // Resting on desk. Strong wind pushes paper and can knock it airborne.
          const w = this.currentWind;
          p.x += this.windX * 0.05 * w * dt;
          p.y += windY * 0.04 * w * dt;
          p.rot += (Math.random() - 0.5) * 0.02 * w;
          // Airborne threshold: high wind + random
          if (w > 0.55 && Math.random() < w * 0.06 * dt * 60) {
            p.airborne = true;
            p.vx = this.windX * 0.55 + (Math.random() - 0.5) * 40;
            p.vy = -80 - Math.random() * 60;
            p.vr = (Math.random() - 0.5) * 3;
          }
        } else {
          // Airborne
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vx += this.windX * 0.6 * dt;
          p.vy += (windY - 60) * dt;    // papers are light — buoyant-ish drift up
          p.rot += p.vr * dt;
          p.vr *= 0.98;
          if (p.x < -40 || p.y < -60 || p.x > W + 40) {
            this.lostPapers++;
            this.sfx.play('lose');
            // Remove from array
            p._dead = true;
          }
        }
      }
      this.papers = this.papers.filter(p => !p._dead);

      this.setHud(this.makeHud());
    }

    _onClick() {
      const mx = Input.mouse.x, my = Input.mouse.y;
      const sel = this.weights[this.selectedWeight];
      if (!sel || sel.left <= 0) {
        // Try next available
        const next = this.weights.findIndex(w => w.left > 0);
        if (next < 0) return;
        this.selectedWeight = next;
        return;
      }
      // Find a paper under cursor (any paper)
      let target = null, bestD = 999;
      for (const p of this.papers) {
        if (p.weighted) continue;
        const d = Math.hypot(p.x - mx, p.y - my);
        if (d < 36 && d < bestD) { bestD = d; target = p; }
      }
      if (!target) return;
      target.weighted = true;
      target.weight = sel;
      if (target.airborne) {
        // Snap it back down to a resting position below cursor
        target.airborne = false;
        target.vx = target.vy = target.vr = 0;
        this.sfx.play('save');
        this.savedPapers++;
        this.flash('#6cff9a', 0.08);
      } else {
        this.sfx.play('place');
      }
      sel.left--;
    }

    render(ctx) {
      // Desk
      ctx.fillStyle = '#5a3f23'; ctx.fillRect(0, 0, W, H);
      // Grain
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      for (let y = 0; y < H; y += 6) ctx.fillRect(0, y, W, 1);

      // Window light beam from top-right
      ctx.save();
      ctx.fillStyle = 'rgba(255,240,200,0.10)';
      ctx.beginPath();
      ctx.moveTo(W * 0.55, 0); ctx.lineTo(W, 0);
      ctx.lineTo(W * 0.7, H); ctx.lineTo(W * 0.3, H);
      ctx.closePath(); ctx.fill();
      ctx.restore();

      // Draw open window silhouette at top-right
      ctx.fillStyle = '#1a2838';
      ctx.fillRect(W - 140, 10, 120, 60);
      ctx.fillStyle = '#6cc0ff';
      ctx.fillRect(W - 134, 16, 108, 48);
      ctx.strokeStyle = '#0e1a26'; ctx.lineWidth = 2;
      ctx.strokeRect(W - 140, 10, 120, 60);
      // Billowing curtain
      const curtain = 30 + this.currentWind * 60;
      ctx.fillStyle = '#d0c49a';
      ctx.beginPath();
      ctx.moveTo(W - 140, 10);
      ctx.quadraticCurveTo(W - 70 - curtain, 60, W - 70, 140);
      ctx.lineTo(W - 30, 140);
      ctx.quadraticCurveTo(W - 50, 60, W - 20, 10);
      ctx.closePath(); ctx.fill();

      // Wind ribbons across the desk when gusting
      if (this.currentWind > 0.2) {
        ctx.strokeStyle = `rgba(220,220,255,${this.currentWind * 0.25})`;
        ctx.lineWidth = 1;
        for (let i = 0; i < 10; i++) {
          const ry = 80 + i * 50 + Math.sin(this.time * 4 + i) * 8;
          ctx.beginPath();
          ctx.moveTo(W - 50, ry);
          ctx.quadraticCurveTo(W / 2, ry - 20, 0, ry + this.currentWind * 30);
          ctx.stroke();
        }
      }

      // Papers (resting first, then airborne on top)
      const sorted = this.papers.slice().sort((a, b) => (a.airborne ? 1 : 0) - (b.airborne ? 1 : 0));
      for (const p of sorted) this.drawPaper(ctx, p);

      // Weight inventory at bottom
      this.drawInventory(ctx);

      // Cursor preview
      const sel = this.weights[this.selectedWeight];
      if (sel && sel.left > 0) {
        ctx.globalAlpha = 0.7;
        this.drawWeight(ctx, Input.mouse.x, Input.mouse.y, sel);
        ctx.globalAlpha = 1;
      }
    }

    drawPaper(ctx, p) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.airborne ? '#fff3d4' : '#f4e6c4';
      ctx.fillRect(-26, -34, 52, 68);
      ctx.strokeStyle = '#b89a6a'; ctx.lineWidth = 1;
      for (let ly = -26; ly < 30; ly += 6) {
        ctx.beginPath(); ctx.moveTo(-22, ly); ctx.lineTo(22, ly); ctx.stroke();
      }
      // Letter label
      ctx.fillStyle = '#8a6a4a';
      ctx.font = 'bold 18px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(p.label, 0, -24);
      // Weight on top
      if (p.weighted && p.weight) {
        this.drawWeight(ctx, 0, 0, p.weight);
      }
      ctx.restore();
    }

    drawWeight(ctx, x, y, w) {
      if (w.id === 'rock') {
        ctx.fillStyle = w.color;
        ctx.beginPath(); ctx.arc(x, y, w.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath(); ctx.arc(x + 3, y + 3, w.r * 0.4, 0, Math.PI * 2); ctx.fill();
      } else if (w.id === 'mug') {
        ctx.fillStyle = w.color;
        ctx.fillRect(x - w.r, y - w.r, w.r * 2, w.r * 2);
        ctx.fillStyle = '#5a3f23';
        ctx.fillRect(x - w.r + 4, y - w.r + 4, w.r * 2 - 8, w.r * 2 - 8);
        ctx.strokeStyle = w.color; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(x + w.r + 2, y, w.r * 0.5, -Math.PI / 2, Math.PI / 2); ctx.stroke();
      } else if (w.id === 'apple') {
        ctx.fillStyle = w.color;
        ctx.beginPath(); ctx.arc(x, y, w.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#5a3a1a';
        ctx.fillRect(x - 1, y - w.r - 4, 2, 4);
        ctx.fillStyle = '#4a8d3a';
        ctx.fillRect(x + 1, y - w.r - 3, 6, 3);
      } else if (w.id === 'book') {
        ctx.fillStyle = w.color;
        ctx.fillRect(x - w.r, y - w.r * 0.7, w.r * 2, w.r * 1.4);
        ctx.fillStyle = '#e8d7a0';
        ctx.fillRect(x - w.r + 3, y - w.r * 0.7 + 3, w.r * 2 - 6, w.r * 1.4 - 6);
        ctx.strokeStyle = w.color; ctx.lineWidth = 1;
        for (let ly = y - w.r * 0.5; ly < y + w.r * 0.5; ly += 4) {
          ctx.beginPath(); ctx.moveTo(x - w.r + 6, ly); ctx.lineTo(x + w.r - 6, ly); ctx.stroke();
        }
      }
    }

    drawInventory(ctx) {
      const y = H - 60;
      const slotW = 90;
      const totalW = slotW * this.weights.length;
      const x0 = (W - totalW) / 2;
      // Backdrop
      ctx.fillStyle = 'rgba(20,12,6,0.75)';
      ctx.fillRect(x0 - 12, y - 10, totalW + 24, 56);
      ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 2;
      ctx.strokeRect(x0 - 12 + 0.5, y - 10 + 0.5, totalW + 24, 56);

      for (let i = 0; i < this.weights.length; i++) {
        const w = this.weights[i];
        const sx = x0 + i * slotW + slotW / 2;
        const sel = i === this.selectedWeight;
        if (sel) {
          ctx.fillStyle = 'rgba(255,236,122,0.20)';
          ctx.fillRect(sx - slotW / 2 + 6, y - 6, slotW - 12, 48);
        }
        ctx.globalAlpha = w.left > 0 ? 1 : 0.3;
        this.drawWeight(ctx, sx, y + 14, w);
        ctx.fillStyle = '#e8d7a0';
        ctx.font = '11px ui-monospace, monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(`${i + 1}: ${w.label} ×${w.left}`, sx, y + 32);
        ctx.globalAlpha = 1;
      }
    }

    coinsEarned(score) { return Math.max(0, Math.floor(score / 30)); }
  }

  NDP.attachGame('paperweight', PaperweightGame);
})();
