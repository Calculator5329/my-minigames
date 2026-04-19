/* Orbital — end-of-run modal.
   Shown on R50 victory (with "Continue Freeplay" option) and on death
   (lives reach 0). Renders a full-canvas modal with:
     - Title (VICTORY / DEFEAT / FREEPLAY ENDED)
     - Per-run stat block (rounds cleared, score, kills, time, etc.)
     - Top-10 leaderboard (per-game persistent)
     - Action buttons (Continue Freeplay / Play Again / Quit to menu)

   Public API:
     EndScreen.show(game, kind)             // build + display the modal
     EndScreen.draw(ctx, game)              // called every frame from game.render
     EndScreen.handleClick(mx, my, game)    // returns true if click consumed
     EndScreen.handleHover(mx, my, game)    // for cursor feedback

   `kind` values:
     'victory'  — campaign just cleared R50; freeplay continuation offered
     'freeplay' — died during freeplay; no continuation offered
     'defeat'   — died during campaign

   The modal owns no game state itself — it stashes a snapshot in
   `game.endScreen` and reads from there. Game logic lives in game.js. */
(function () {
  const NDP = window.NDP;
  const O = NDP.Orbital;

  const COLORS = {
    overlay:   'rgba(2, 4, 14, 0.86)',
    panelBg1:  '#0e1430',
    panelBg2:  '#070a1c',
    border:    '#1d2a52',
    accent:    '#7ae0ff',
    accentWin: '#4ade80',
    accentLose:'#ff5566',
    accentFp:  '#ff9055',
    text:      '#dde6ff',
    dim:       '#7c87a6',
    hot:       '#ffd86b',
    btnBg:     '#152042',
    btnBgHi:   '#1f2e60',
    btnPrimary:'#1c3a5e',
    btnPrimaryHi:'#2a5285'
  };

  const EndScreen = {
    hits: [],

    show(game, kind) {
      const stats = game.stats || {};
      const durationSec = Math.max(0, Math.floor(game.time || 0));
      const score = game.score | 0;
      const round = game.round | 0;
      const mode = game.mode || 'campaign';
      const freeplayLevel = Math.max(0, round - (game.maxRound || 50));
      // Compose the entry for the persistent leaderboard.
      const entry = {
        score,
        round,
        mode,
        freeplayLevel,
        durationSec,
        kills: stats.kills | 0,
        bossKills: stats.bossKills | 0,
        leaks: stats.leaks | 0
      };
      let rank = null;
      if (O.Persist) {
        rank = O.Persist.recordLeaderboardEntry(entry);
        O.Persist.recordRunEnd(round);
        if (mode === 'freeplay') O.Persist.recordFreeplayLevel(freeplayLevel);
        O.Persist.recordLifetimeStats({
          runs: 1,
          kills: stats.kills | 0,
          bossKills: stats.bossKills | 0,
          leaks: stats.leaks | 0,
          totalSpent: stats.totalSpent | 0,
          bestScore: score,
          bestRound: round
        });
      }
      const board = (O.Persist ? O.Persist.getLeaderboard() : []) || [];
      game.endScreen = {
        kind,                  // 'victory' | 'defeat' | 'freeplay'
        score, round, mode, durationSec, freeplayLevel,
        stats: Object.assign({}, stats),
        leaderboard: board,
        myRank: rank,
        revealT: 0,
        bgPulse: 0
      };
    },

    dismiss(game) { game.endScreen = null; },

    // ---------------------------------------------------------------
    //  RENDER
    // ---------------------------------------------------------------
    draw(ctx, game) {
      const e = game.endScreen;
      if (!e) return;
      e.revealT = Math.min(1, (e.revealT || 0) + 1 / 30);
      e.bgPulse = (e.bgPulse + 0.02) % (Math.PI * 2);

      const W = game.W, H = game.H;
      this.hits = [];

      // Backdrop
      ctx.save();
      ctx.fillStyle = COLORS.overlay;
      ctx.globalAlpha = 0.7 + 0.3 * e.revealT;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();

      // Panel sized to fit comfortably inside playW (left of right rail),
      // but it's drawn on top so we use the FULL canvas. Center it.
      const pw = Math.min(640, W - 60);
      const ph = Math.min(540, H - 30);
      const px = Math.floor((W - pw) / 2);
      const py = Math.floor((H - ph) / 2) + Math.round((1 - e.revealT) * 30);

      // Panel bg
      const grad = ctx.createLinearGradient(0, py, 0, py + ph);
      grad.addColorStop(0, COLORS.panelBg1);
      grad.addColorStop(1, COLORS.panelBg2);
      ctx.fillStyle = grad;
      ctx.fillRect(px, py, pw, ph);
      ctx.strokeStyle = COLORS.border;
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);

      // Title bar with thin pulsing accent line
      const titleColor = e.kind === 'victory' ? COLORS.accentWin
                       : e.kind === 'freeplay' ? COLORS.accentFp
                       : COLORS.accentLose;
      ctx.fillStyle = titleColor;
      ctx.globalAlpha = 0.18 + Math.sin(e.bgPulse) * 0.05;
      ctx.fillRect(px, py, pw, 4);
      ctx.fillRect(px, py + ph - 4, pw, 4);
      ctx.globalAlpha = 1;

      // ---- Title ----
      const title = e.kind === 'victory' ? 'VICTORY'
                  : e.kind === 'freeplay' ? 'FREEPLAY ENDED'
                  : 'DEFEAT';
      const subtitle = e.kind === 'victory'
        ? 'Campaign cleared — system stabilized.'
        : e.kind === 'freeplay'
          ? 'You held until the system collapsed.'
          : 'The homeworld was overrun.';
      ctx.fillStyle = titleColor;
      ctx.font = 'bold 32px ui-sans-serif, system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(title, px + pw / 2, py + 18);
      ctx.fillStyle = COLORS.dim;
      ctx.font = '12px ui-sans-serif, system-ui';
      ctx.fillText(subtitle, px + pw / 2, py + 56);

      // ---- Stats grid (left half) ----
      const colTop = py + 92;
      const leftX = px + 24;
      const colW = (pw - 60) / 2;

      ctx.textAlign = 'left';
      ctx.fillStyle = COLORS.accent;
      ctx.font = 'bold 11px ui-sans-serif, system-ui';
      ctx.fillText('THIS RUN', leftX, colTop);

      const statRows = this._composeStats(e);
      let rowY = colTop + 22;
      for (const r of statRows) {
        ctx.fillStyle = COLORS.dim;
        ctx.font = '11px ui-sans-serif, system-ui';
        ctx.textAlign = 'left';
        ctx.fillText(r.label, leftX, rowY);
        ctx.fillStyle = r.color || COLORS.text;
        ctx.font = 'bold 13px ui-sans-serif, system-ui';
        ctx.textAlign = 'right';
        ctx.fillText(r.value, leftX + colW - 8, rowY - 1);
        rowY += 22;
      }

      // ---- Leaderboard (right half) ----
      const rightX = px + 30 + colW;
      ctx.textAlign = 'left';
      ctx.fillStyle = COLORS.accent;
      ctx.font = 'bold 11px ui-sans-serif, system-ui';
      ctx.fillText('TOP 10 SCORES', rightX, colTop);

      const board = e.leaderboard || [];
      ctx.font = '10px ui-mono, ui-sans-serif, monospace';
      ctx.fillStyle = COLORS.dim;
      ctx.fillText('#   SCORE     RND  MODE', rightX, colTop + 18);

      const entryH = 16;
      const maxEntries = Math.min(10, board.length);
      for (let i = 0; i < maxEntries; i++) {
        const ent = board[i];
        const y = colTop + 36 + i * entryH;
        const isMine = (e.myRank && (i + 1 === e.myRank));
        if (isMine) {
          ctx.fillStyle = 'rgba(122, 224, 255, 0.16)';
          ctx.fillRect(rightX - 4, y - 2, colW, entryH);
        }
        ctx.fillStyle = isMine ? COLORS.hot : COLORS.text;
        ctx.font = (isMine ? 'bold ' : '') + '11px ui-mono, ui-sans-serif, monospace';
        const rankStr = String(i + 1).padStart(2, ' ');
        const scoreStr = String(ent.score | 0).padStart(8, ' ');
        const rndStr = String(ent.round | 0).padStart(3, ' ');
        const modeStr = ent.mode === 'freeplay'
          ? ('FP+' + ((ent.freeplayLevel | 0) || 0))
          : 'CAMP';
        ctx.fillText(rankStr + '  ' + scoreStr + '   ' + rndStr + '  ' + modeStr, rightX, y);
      }

      // If your entry didn't make the cut, show a hint
      if (e.myRank == null) {
        const y = colTop + 36 + Math.min(10, board.length) * entryH + 6;
        ctx.fillStyle = COLORS.dim;
        ctx.font = '10px ui-sans-serif, system-ui';
        ctx.fillText('Your run: ' + (e.score | 0) + ' (didn\'t crack the top 10)',
          rightX, y);
      }

      // ---- Buttons (bottom) ----
      const btnY = py + ph - 56;
      const btnH = 36;
      const buttons = this._composeButtons(e);
      const totalGap = 12;
      const totalBtnW = pw - 48;
      const eachW = (totalBtnW - totalGap * (buttons.length - 1)) / buttons.length;
      let bx = px + 24;
      for (let i = 0; i < buttons.length; i++) {
        const b = buttons[i];
        const r = { x: bx, y: btnY, w: eachW, h: btnH, action: b.action };
        const hovered = game._mx != null && game._my != null
                      && game._mx >= r.x && game._mx <= r.x + r.w
                      && game._my >= r.y && game._my <= r.y + r.h;
        const primary = b.primary;
        ctx.fillStyle = primary
          ? (hovered ? COLORS.btnPrimaryHi : COLORS.btnPrimary)
          : (hovered ? COLORS.btnBgHi : COLORS.btnBg);
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.strokeStyle = primary ? COLORS.accent : COLORS.border;
        ctx.lineWidth = primary && hovered ? 2 : 1;
        ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
        ctx.fillStyle = primary ? '#fff' : COLORS.text;
        ctx.font = (primary ? 'bold ' : '') + '13px ui-sans-serif, system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(b.label, r.x + r.w / 2, r.y + r.h / 2 + 1);
        // Subtle subtitle text (e.g. shortcut hint)
        if (b.hint) {
          ctx.fillStyle = primary ? 'rgba(255,255,255,0.7)' : COLORS.dim;
          ctx.font = '10px ui-sans-serif, system-ui';
          ctx.fillText(b.hint, r.x + r.w / 2, r.y + r.h - 8);
        }
        this.hits.push(r);
        bx += eachW + totalGap;
      }
    },

    handleClick(mx, my, game) {
      const e = game.endScreen;
      if (!e) return false;
      // While the modal is up, swallow ALL clicks even if outside buttons
      // (so misclicks don't reach into the now-frozen play area).
      for (const r of this.hits) {
        if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) {
          if (typeof r.action === 'function') r.action();
          return true;
        }
      }
      return true;
    },

    handleHover() { /* hover state is read live from game._mx/_my during draw */ },

    // ---------------------------------------------------------------
    //  HELPERS
    // ---------------------------------------------------------------
    _composeStats(e) {
      const stats = e.stats || {};
      const m = e.durationSec;
      const dur = Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0');
      const rows = [
        { label: 'Score',           value: (e.score | 0).toLocaleString() },
        { label: 'Round reached',   value: e.mode === 'freeplay' && e.freeplayLevel
                                            ? (e.round + '  (FP+' + e.freeplayLevel + ')')
                                            : String(e.round | 0) },
        { label: 'Run duration',    value: dur },
        { label: 'Enemies killed',  value: String(stats.kills | 0) },
        { label: 'Bosses downed',   value: String(stats.bossKills | 0) },
        { label: 'Leaks suffered',  value: String(stats.leaks | 0) },
        { label: 'Lives lost',      value: String(stats.livesLost | 0) },
        { label: 'Cash earned',     value: '$' + ((stats.cashEarned | 0).toLocaleString()) },
        { label: 'Cash spent',      value: '$' + ((stats.totalSpent | 0).toLocaleString()) },
        { label: 'Best combo',      value: 'x' + (stats.bestCombo | 0) }
      ];
      // Highlight the score row in accent color
      rows[0].color = '#ffd86b';
      return rows;
    },

    _composeButtons(e) {
      // Action callbacks live on the Orbital namespace under _endActions.
      // game.js wires them up in init(); each is a closure over `this`.
      const acts = (window.NDP && window.NDP.Orbital && window.NDP.Orbital._endActions) || {};
      const buttons = [];
      if (e.kind === 'victory') {
        buttons.push({
          label: 'Continue in Freeplay',
          hint: 'unlimited rounds · scaling difficulty',
          primary: true,
          action: acts.continueFreeplay
        });
      }
      buttons.push({
        label: 'Play Again',
        hint: 'fresh campaign',
        primary: e.kind !== 'victory',
        action: acts.playAgain
      });
      buttons.push({
        label: 'Quit',
        hint: 'back to menu',
        primary: false,
        action: acts.quit
      });
      return buttons;
    }
  };

  O.UI = O.UI || {};
  O.UI.EndScreen = EndScreen;
})();
