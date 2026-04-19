/* Orbital — round-end recap banner.
   game.js calls: O.UI.Recap.show(breakdown) when a wave completes.
   Then drawCanvas() calls O.UI.Recap.draw(ctx, game, playW). The banner
   fades in over ~0.4s, sits for ~1.6s, fades out. */
(function () {
  const NDP = window.NDP;
  const O = NDP.Orbital;

  const Recap = {
    state: null,    // { breakdown, t, life, color, header }

    show(breakdown, opts) {
      this.state = {
        breakdown,
        t: 0,
        life: (opts && opts.life) || 2.4,
        color: (opts && opts.color) || '#ffd86b',
        header: (opts && opts.header) || 'WAVE BONUS'
      };
    },

    tick(dt) {
      if (!this.state) return;
      this.state.t += dt;
      if (this.state.t > this.state.life) this.state = null;
    },

    draw(ctx, game, playW) {
      if (!this.state) return;
      const s = this.state;
      const a = s.t < 0.3 ? s.t / 0.3
              : s.t > s.life - 0.5 ? Math.max(0, (s.life - s.t) / 0.5)
              : 1;
      const W = 360, H = 110;
      const x = (playW - W) / 2;
      const y = 60;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(8,12,28,0.94)';
      ctx.fillRect(x, y, W, H);
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 0.5, y + 0.5, W - 1, H - 1);

      // Header
      ctx.fillStyle = s.color;
      ctx.font = 'bold 14px ui-sans-serif, system-ui';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(s.header, x + W / 2, y + 8);

      // Breakdown lines
      const b = s.breakdown;
      const lines = [
        ['Base',   '$' + b.base],
        ['Streak ×' + b.streakMul.toFixed(2), b.streakBonus > 0 ? '+$' + b.streakBonus : '–'],
        ['Combo bonus', b.comboBonus > 0 ? '+$' + b.comboBonus : '–']
      ];
      ctx.font = '12px ui-monospace, monospace';
      ctx.textBaseline = 'top';
      for (let i = 0; i < lines.length; i++) {
        const ly = y + 30 + i * 16;
        ctx.fillStyle = '#e8ecf8';
        ctx.textAlign = 'left';
        ctx.fillText(lines[i][0], x + 16, ly);
        ctx.fillStyle = lines[i][1].startsWith('+') ? '#4ade80' : '#7c87a6';
        ctx.textAlign = 'right';
        ctx.fillText(lines[i][1], x + W - 16, ly);
      }

      // Total — large
      ctx.fillStyle = s.color;
      ctx.font = 'bold 18px ui-monospace, monospace';
      ctx.textAlign = 'right';
      ctx.fillText('TOTAL +$' + b.total, x + W - 16, y + H - 26);

      ctx.restore();
    }
  };

  O.UI.Recap = Recap;
})();
