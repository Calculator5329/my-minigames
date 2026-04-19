/* Metronome — 4-lane rhythm game.
   Notes scroll from top; tap the lane key (D/F/J/K) when the note reaches the
   target line. Accuracy scores: Perfect / Good / Miss. Three misses in a row
   ends the song. Tempo (notes/sec) climbs over time. */
(function () {
  const NDP = window.NDP;
  const { BaseGame, Input } = NDP.Engine;

  const W = 960, H = 600;
  const LANES = 4;
  const LANE_W = 120;
  const LANE_X0 = (W - LANE_W * LANES) / 2;
  const TARGET_Y = H - 90;
  const NOTE_H = 14;

  const KEY_TO_LANE = { 'd':0, 'D':0, 'f':1, 'F':1, 'j':2, 'J':2, 'k':3, 'K':3 };
  const LANE_KEYS = ['D', 'F', 'J', 'K'];
  const LANE_COLORS = ['#ff4fd8', '#6cf', '#6cff9a', '#ffd86b'];

  class MetronomeGame extends BaseGame {
    init() {
      this.notes = [];
      this.particles2 = [];
      this.missesInRow = 0;
      this.combo = 0;
      this.bestCombo = 0;
      this.spawnTimer = 0.8;
      this.spawnInterval = 0.8;      // eases down to 0.28
      this.noteSpeed = 320;          // px/sec; eases up
      this.hitFlash = [0, 0, 0, 0];
      this.lastJudge = null;         // { text, t, lane, color }
      this.keyDown = [false, false, false, false];
      this._keyJustPressed = [false, false, false, false];
      this._bound = false;
      this.sfx = this.makeSfx({
        perfect:{ freq: 880, type: 'triangle', dur: 0.06, slide: 440, vol: 0.3 },
        good:   { freq: 660, type: 'square',   dur: 0.05, vol: 0.22 },
        miss:   { freq: 140, type: 'sawtooth', dur: 0.2,  slide: -80, vol: 0.4 },
        tick:   { freq: 1200, type: 'square',  dur: 0.02, vol: 0.15 }
      });
      this.setHud(this.makeHud());
    }

    makeHud() {
      return `<span>Combo <b>${this.combo}</b></span>` +
             `<span>Best <b>${this.bestCombo}</b></span>` +
             `<span>Score <b>${this.score}</b></span>`;
    }

    update(dt) {
      if (!this._bound) {
        Input.on('keydown', (e) => {
          const lane = KEY_TO_LANE[e.key];
          if (lane == null || this.keyDown[lane]) return;
          this.keyDown[lane] = true;
          this._keyJustPressed[lane] = true;
        });
        Input.on('keyup', (e) => {
          const lane = KEY_TO_LANE[e.key];
          if (lane == null) return;
          this.keyDown[lane] = false;
        });
        this._bound = true;
      }

      // Difficulty ramp
      const ramp = Math.min(1, this.time / 75);
      this.spawnInterval = 0.8 - ramp * 0.52;
      this.noteSpeed = 320 + ramp * 260;

      // Spawn notes
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        const lane = Math.floor(Math.random() * LANES);
        // Occasionally a double-tap (two notes close in time in different lanes)
        if (Math.random() < 0.25 + ramp * 0.25) {
          const l2 = (lane + 1 + Math.floor(Math.random() * (LANES - 1))) % LANES;
          this.notes.push({ lane: l2, y: -NOTE_H - 40 });
        }
        this.notes.push({ lane, y: -NOTE_H });
        this.spawnTimer = this.spawnInterval * (0.85 + Math.random() * 0.3);
      }

      // Fall
      for (const n of this.notes) n.y += this.noteSpeed * dt;

      // Judgement on key press
      for (let lane = 0; lane < LANES; lane++) {
        if (!this._keyJustPressed[lane]) continue;
        this._keyJustPressed[lane] = false;
        this.hitFlash[lane] = 0.25;
        // Find closest note in this lane within the judgement window
        let best = -1, bestDy = 9999;
        for (let i = 0; i < this.notes.length; i++) {
          const n = this.notes[i];
          if (n.lane !== lane) continue;
          const dy = Math.abs(n.y - TARGET_Y);
          if (dy < bestDy) { bestDy = dy; best = i; }
        }
        if (best >= 0 && bestDy < 60) {
          this.judge(best, bestDy);
        } else {
          // Tapped air — soft tick, break combo less harshly than a true miss
          this.sfx.play('tick');
        }
      }

      // Notes past the target without hit = miss
      for (let i = this.notes.length - 1; i >= 0; i--) {
        if (this.notes[i].y > TARGET_Y + 40) {
          this.onMiss(this.notes[i].lane);
          this.notes.splice(i, 1);
        }
      }

      // Custom particles
      for (const p of this.particles2) {
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vy += 500 * dt;
        p.life -= dt;
      }
      this.particles2 = this.particles2.filter(p => p.life > 0);

      for (let i = 0; i < LANES; i++) this.hitFlash[i] = Math.max(0, this.hitFlash[i] - dt * 3);

      if (this.lastJudge) this.lastJudge.t += dt;

      this.setHud(this.makeHud());
    }

    judge(noteIdx, dy) {
      const n = this.notes[noteIdx];
      this.notes.splice(noteIdx, 1);
      const lane = n.lane;
      const x = LANE_X0 + lane * LANE_W + LANE_W / 2;
      let text, points, color;
      if (dy < 14) {
        text = 'PERFECT'; points = 100; color = '#ffec7a';
        this.sfx.play('perfect');
      } else if (dy < 32) {
        text = 'GOOD';    points = 50;  color = '#6cff9a';
        this.sfx.play('good');
      } else {
        text = 'OK';      points = 20;  color = '#6cf';
        this.sfx.play('good', { freq: 440 });
      }
      this.combo++;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
      this.missesInRow = 0;
      const comboMul = 1 + Math.min(4, Math.floor(this.combo / 10)) * 0.25;
      this.addScore(Math.floor(points * comboMul));
      this.lastJudge = { text, t: 0, lane, color };
      // Sparks
      for (let i = 0; i < 10; i++) {
        this.particles2.push({
          x, y: TARGET_Y,
          vx: (Math.random() - 0.5) * 360,
          vy: -120 - Math.random() * 200,
          life: 0.5 + Math.random() * 0.3,
          color, size: 2 + Math.random() * 2
        });
      }
      this.flash(color, 0.06);
    }

    onMiss(lane) {
      this.sfx.play('miss');
      this.combo = 0;
      this.missesInRow++;
      this.lastJudge = { text: 'MISS', t: 0, lane, color: '#d84a48' };
      this.shake(6, 0.15);
      this.flash('#d84a48', 0.1);
      if (this.missesInRow >= 3) this.gameOver();
    }

    render(ctx) {
      ctx.fillStyle = '#0a0820'; ctx.fillRect(0, 0, W, H);

      // Lane gutters
      for (let i = 0; i < LANES; i++) {
        const lx = LANE_X0 + i * LANE_W;
        ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)';
        ctx.fillRect(lx, 0, LANE_W, H);
        // Lane side borders
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(lx, 0, 1, H);
        ctx.fillRect(lx + LANE_W - 1, 0, 1, H);
        // Flash
        if (this.hitFlash[i] > 0) {
          ctx.fillStyle = `rgba(${i===0?255:100},${i===1?200:255},${i===2?150:200},${this.hitFlash[i] * 0.4})`;
          ctx.fillRect(lx, 0, LANE_W, H);
        }
      }

      // Target line
      ctx.fillStyle = '#2a3344';
      ctx.fillRect(LANE_X0, TARGET_Y - 1, LANE_W * LANES, 3);
      ctx.fillStyle = '#fff';
      ctx.fillRect(LANE_X0, TARGET_Y, LANE_W * LANES, 1);

      // Lane key hints under target
      for (let i = 0; i < LANES; i++) {
        const lx = LANE_X0 + i * LANE_W + LANE_W / 2;
        const glow = this.keyDown[i] ? 1 : 0.45;
        ctx.fillStyle = LANE_COLORS[i];
        ctx.globalAlpha = glow;
        ctx.font = 'bold 28px ui-monospace, monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(LANE_KEYS[i], lx, TARGET_Y + 40);
        ctx.globalAlpha = 1;
      }

      // Notes
      for (const n of this.notes) {
        const lx = LANE_X0 + n.lane * LANE_W;
        ctx.fillStyle = LANE_COLORS[n.lane];
        ctx.fillRect(lx + 10, n.y - NOTE_H / 2, LANE_W - 20, NOTE_H);
        // Top highlight
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillRect(lx + 10, n.y - NOTE_H / 2, LANE_W - 20, 3);
      }

      // Custom particles
      for (const p of this.particles2) {
        const a = Math.max(0, Math.min(1, p.life * 2));
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      ctx.globalAlpha = 1;

      // Judgement callout
      if (this.lastJudge && this.lastJudge.t < 0.6) {
        const a = 1 - this.lastJudge.t / 0.6;
        const lx = LANE_X0 + this.lastJudge.lane * LANE_W + LANE_W / 2;
        ctx.globalAlpha = a;
        ctx.fillStyle = this.lastJudge.color;
        ctx.font = 'bold 22px ui-monospace, monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(this.lastJudge.text, lx, TARGET_Y - 50 - this.lastJudge.t * 40);
        ctx.globalAlpha = 1;
      }

      // Big combo
      if (this.combo > 5) {
        ctx.fillStyle = `rgba(255,236,122,${Math.min(1, this.combo / 30)})`;
        ctx.font = 'bold 60px ui-monospace, monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(this.combo + 'x', W / 2, 80);
      }

      // Miss-in-row warning
      if (this.missesInRow >= 2) {
        ctx.fillStyle = '#d84a48';
        ctx.font = 'bold 14px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('One more miss ends it.', W / 2, H - 12);
      }
    }

    coinsEarned(score) { return Math.max(0, Math.floor(score / 140)); }
  }

  NDP.attachGame('metronome', MetronomeGame);
})();
