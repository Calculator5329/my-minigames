/* Orbital — BTD4-style right rail.
   The panel takes the right 240px of the canvas. It has two modes:
     'build'    -> showing the tower-buy list
     'selected' -> showing selected tower's stats + path tree

   Public API (called by game.js):
     panel.layout(W, H)
     panel.draw(ctx, game)
     panel.handleClick(mx, my, game)  -> bool (true = consumed)
     panel.handleHover(mx, my, game)  -> void
     panel.handleWheel(dy, game)      -> bool
     panel.x         -> left edge (= canvas W - panel.w)
     panel.w         -> 240
     panel.playW     -> game's playable width (= canvas W - panel.w)

   Layout regions:
     [0..stripH]    : big stats strip (CASH / LIVES + STARDUST / ROUND)
     [..top of mode]: WAVE controls (start, speed, autostart)
     [..]           : either tower-buy grid OR selected upgrade tree
     [bottom]       : sell / abilities (when in selected mode)

   Hit-test rectangles are stored in `this.hits` and recomputed every draw
   so input is always in sync with the rendered layout. */
(function () {
  const NDP = window.NDP;
  const O = NDP.Orbital;
  const Assets = (NDP.Engine && NDP.Engine.Assets);

  const PANEL_W   = 240;
  const STRIP_H   = 96;
  const WAVE_H    = 78;
  const FOOTER_H  = 100;
  const COLORS = {
    bgTop:      '#0e1430',
    bgBot:      '#070a1c',
    border:     '#27315a',
    cash:       '#ffd86b',
    cashShadow: '#664410',
    life:       '#ff5566',
    lifeShadow: '#5a0820',
    stardust:   '#c8a8ff',
    text:       '#e8ecf8',
    textDim:    '#7c87a6',
    panelHi:    '#1c2750',
    panelHi2:   '#2a3870',
    btnGreen:   '#4ade80',
    btnGreenHi: '#16c060',
    btnYellow:  '#ffd86b',
    btnRed:     '#ff5566',
    locked:     '#3a4060'
  };

  function fmtCash(n) {
    n = Math.floor(n);
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'm';
    if (n >= 10000)   return (n / 1000).toFixed(1) + 'k';
    return String(n);
  }

  // ----- main panel object -----
  const Panel = {
    w: PANEL_W,
    x: 0,
    h: 0,
    playW: 0,
    hits: [],          // { rect, kind, ...payload }
    hover: null,       // { kind, ... } from last hover
    scroll: 0,         // for tower list / tree if it overflows

    layout(W, H) {
      this.x = W - PANEL_W;
      this.h = H;
      this.playW = W - PANEL_W;
    },

    draw(ctx, game) {
      this.hits.length = 0;
      this._drawBg(ctx);
      this._drawStatsStrip(ctx, game);
      this._drawWaveCtrls(ctx, game);
      const sel = game.selectedTower;
      const yStart = STRIP_H + WAVE_H;
      if (sel) {
        this._drawSelectedTower(ctx, game, sel, yStart);
      } else {
        this._drawTowerList(ctx, game, yStart);
      }
      this._drawHover(ctx, game);
    },

    _drawBg(ctx) {
      const g = ctx.createLinearGradient(this.x, 0, this.x, this.h);
      g.addColorStop(0, COLORS.bgTop);
      g.addColorStop(1, COLORS.bgBot);
      ctx.fillStyle = g;
      ctx.fillRect(this.x, 0, this.w, this.h);
      // separator vertical line
      ctx.strokeStyle = COLORS.border;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(this.x + 0.5, 0);
      ctx.lineTo(this.x + 0.5, this.h);
      ctx.stroke();
      // subtle starfield decoration
      for (let i = 0; i < 24; i++) {
        const sx = this.x + ((i * 23.7) % (this.w - 12)) + 6;
        const sy = ((i * 41.3) % (this.h - 12)) + 6;
        ctx.fillStyle = `rgba(255,255,255,${0.08 + (i % 3) * 0.04})`;
        ctx.fillRect(sx, sy, 1, 1);
      }
    },

    _drawStatsStrip(ctx, game) {
      const x = this.x + 8;
      const w = this.w - 16;

      // CASH (largest)
      ctx.save();
      ctx.fillStyle = '#0a0e1a';
      ctx.fillRect(x, 8, w, 38);
      ctx.strokeStyle = COLORS.cash;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 0.5, 8.5, w - 1, 37);
      ctx.shadowColor = COLORS.cashShadow;
      ctx.shadowBlur = 6;
      ctx.fillStyle = COLORS.cash;
      ctx.font = 'bold 26px ui-monospace, "SF Mono", Menlo, monospace';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'right';
      ctx.fillText('$' + fmtCash(game.cash), x + w - 10, 28);
      ctx.shadowBlur = 0;
      ctx.fillStyle = COLORS.textDim;
      ctx.font = 'bold 11px ui-sans-serif, system-ui';
      ctx.textAlign = 'left';
      ctx.fillText('CASH', x + 8, 28);
      // bonus pulse on gain (game sets cashFlash)
      if (game._cashFlash > 0) {
        ctx.globalAlpha = game._cashFlash;
        ctx.strokeStyle = COLORS.cash;
        ctx.lineWidth = 2;
        ctx.strokeRect(x - 1, 7, w + 2, 40);
      }
      ctx.restore();

      // LIVES + STARDUST row
      const y2 = 50;
      const halfW = (w - 6) / 2;
      // Lives
      ctx.fillStyle = '#0a0e1a';
      ctx.fillRect(x, y2, halfW, 38);
      ctx.strokeStyle = COLORS.life;
      ctx.lineWidth = 1.2;
      ctx.strokeRect(x + 0.5, y2 + 0.5, halfW - 1, 37);
      ctx.fillStyle = COLORS.life;
      ctx.font = 'bold 18px ui-monospace, monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(Math.max(0, game.lives)), x + halfW - 8, y2 + 19);
      ctx.fillStyle = COLORS.textDim;
      ctx.font = 'bold 10px ui-sans-serif, system-ui';
      ctx.textAlign = 'left';
      ctx.fillText('LIVES', x + 6, y2 + 19);

      // Stardust
      const x3 = x + halfW + 6;
      ctx.fillStyle = '#0a0e1a';
      ctx.fillRect(x3, y2, halfW, 38);
      ctx.strokeStyle = COLORS.stardust;
      ctx.lineWidth = 1.2;
      ctx.strokeRect(x3 + 0.5, y2 + 0.5, halfW - 1, 37);
      ctx.fillStyle = COLORS.stardust;
      ctx.font = 'bold 18px ui-monospace, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(String(Math.floor(game.runStardust || 0)), x3 + halfW - 8, y2 + 19);
      ctx.fillStyle = COLORS.textDim;
      ctx.font = 'bold 10px ui-sans-serif, system-ui';
      ctx.textAlign = 'left';
      ctx.fillText('★', x3 + 6, y2 + 19);
    },

    _drawWaveCtrls(ctx, game) {
      const x = this.x + 8;
      const w = this.w - 16;
      const top = STRIP_H;

      // Round label + act
      ctx.fillStyle = COLORS.text;
      ctx.font = 'bold 13px ui-sans-serif, system-ui';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('ROUND', x + 4, top + 4);
      ctx.font = 'bold 16px ui-monospace, monospace';
      ctx.fillStyle = COLORS.cash;
      ctx.textAlign = 'right';
      const shownRound = Math.max(1, game.round);
      // Freeplay: show "FP+N" instead of "round/max" so the player knows
      // they're past the campaign and how deep they are.
      if (game.mode === 'freeplay') {
        ctx.fillText(`FP+${game.freeplayLevel | 0}`, x + w - 4, top + 2);
      } else {
        ctx.fillText(`${shownRound}/${game.maxRound}`, x + w - 4, top + 2);
      }
      // Act label (or freeplay banner once past campaign)
      const act = O.Rounds && O.Rounds.actFor(shownRound);
      if (game.mode === 'freeplay') {
        ctx.font = 'bold 10px ui-sans-serif, system-ui';
        ctx.fillStyle = '#ff9055';
        ctx.textAlign = 'left';
        ctx.fillText('FREEPLAY · scaling', x + 4, top + 22);
      } else if (act) {
        ctx.font = '10px ui-sans-serif, system-ui';
        ctx.fillStyle = act.color;
        ctx.textAlign = 'left';
        ctx.fillText(act.name, x + 4, top + 22);
      }

      // Start wave button (or "wave in progress" status)
      const btnY = top + 38;
      const btnH = 32;
      if (game.state2 === 'build') {
        const r = { x: x, y: btnY, w: w - 50, h: btnH };
        const isHover = this._inRect(game._mx, game._my, r);
        ctx.fillStyle = isHover ? COLORS.btnGreenHi : COLORS.btnGreen;
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.strokeStyle = '#06200a';
        ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
        ctx.fillStyle = '#06200a';
        ctx.font = 'bold 13px ui-sans-serif, system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('▶ START WAVE', r.x + r.w / 2, r.y + r.h / 2);
        this.hits.push({ rect: r, kind: 'startWave' });
      } else {
        const r = { x: x, y: btnY, w: w - 50, h: btnH };
        ctx.fillStyle = '#1a2440';
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.strokeStyle = COLORS.border;
        ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
        ctx.fillStyle = COLORS.textDim;
        ctx.font = 'bold 12px ui-sans-serif, system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('WAVE IN PROGRESS', r.x + r.w / 2, r.y + r.h / 2);
      }
      // Speed button (always visible)
      const sx = x + w - 44;
      const sR = { x: sx, y: btnY, w: 44, h: btnH };
      const sHover = this._inRect(game._mx, game._my, sR);
      ctx.fillStyle = game.gameSpeed > 1
        ? (sHover ? '#ffe89a' : COLORS.btnYellow)
        : (sHover ? '#293760' : '#1a2440');
      ctx.fillRect(sR.x, sR.y, sR.w, sR.h);
      ctx.strokeStyle = COLORS.border;
      ctx.strokeRect(sR.x + 0.5, sR.y + 0.5, sR.w - 1, sR.h - 1);
      ctx.fillStyle = game.gameSpeed > 1 ? '#3a2a08' : COLORS.text;
      ctx.font = 'bold 14px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(game.gameSpeed + '×', sR.x + sR.w / 2, sR.y + sR.h / 2);
      this.hits.push({ rect: sR, kind: 'speedToggle' });
    },

    // ---- BUILD MODE: tower buy list ----
    // Two-column compact grid. Each tile has icon on top + name/cost below.
    // Locked towers stay visible but show a lock + "R<n>" requirement so the
    // player can see what's coming, BTD4-style.
    _drawTowerList(ctx, game, yStart) {
      const xLeft = this.x + 8;
      const w = this.w - 16;
      const keys = O.Towers.keys();
      // Slim header
      ctx.fillStyle = COLORS.text;
      ctx.font = 'bold 11px ui-sans-serif, system-ui';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('BUILD', xLeft + 4, yStart + 4);
      ctx.fillStyle = COLORS.textDim;
      ctx.font = '10px ui-sans-serif, system-ui';
      ctx.textAlign = 'right';
      ctx.fillText('hotkeys 1-9, 0', xLeft + w - 4, yStart + 4);

      const cols = 2;
      const gap = 3;
      const totalRows = Math.ceil(keys.length / cols);
      const gridTop = yStart + 22;
      const gridBottom = this.h - 4;
      const visibleH = gridBottom - gridTop;
      // Adaptive tile height: shrink toward the floor (34) so the whole
      // catalog fits without scrolling whenever possible. Cap at 56 so
      // tiles don't get absurdly tall on very large screens.
      const fitH = Math.floor((visibleH - gap * (totalRows - 1)) / totalRows);
      const tileH = Math.max(34, Math.min(56, fitH));
      const rowH = tileH + gap;
      const totalH = totalRows * rowH - gap;
      const overflows = totalH > visibleH;
      // Reserve a thin scrollbar lane on the right ONLY when the catalog
      // actually overflows, so non-scrolling layouts stay clean.
      const lane = overflows ? 14 : 0;
      const w2 = w - lane;
      const tileW = (w2 - gap * (cols - 1)) / cols;
      const maxScroll = Math.max(0, totalH - visibleH);
      if (this.scroll > maxScroll) this.scroll = maxScroll;
      if (this.scroll < 0) this.scroll = 0;

      // Clip to grid region so partially-visible tiles look clean
      ctx.save();
      ctx.beginPath();
      ctx.rect(xLeft, gridTop, w2, visibleH);
      ctx.clip();

      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const def = O.Towers.get(key).base;
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = xLeft + col * (tileW + gap);
        const y = gridTop + row * rowH - this.scroll;
        if (y > this.h || y + tileH < gridTop) continue;
        const r = { x, y, w: tileW, h: tileH };
        this._drawTowerTile(ctx, game, key, def, r, i + 1);
        this.hits.push({ rect: r, kind: 'buyTower', key: key });
      }
      ctx.restore();

      // Visible scrollbar with clickable up/down arrows + chunky thumb.
      // Only drawn when the catalog actually overflows.
      if (overflows) {
        const sbX = xLeft + w - lane + 2;
        const sbW = lane - 4;
        const arrH = 12;
        const trackY = gridTop + arrH + 2;
        const trackH = visibleH - arrH * 2 - 4;
        // Up arrow
        const upR  = { x: sbX, y: gridTop, w: sbW, h: arrH };
        const dnR  = { x: sbX, y: gridTop + visibleH - arrH, w: sbW, h: arrH };
        const upHover = this.scroll > 0 && this._inRect(game._mx, game._my, upR);
        const dnHover = this.scroll < maxScroll && this._inRect(game._mx, game._my, dnR);
        const drawArrow = (rect, dir, active, hover) => {
          ctx.fillStyle = hover ? COLORS.panelHi2 : (active ? '#1a2440' : '#0a0e1a');
          ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
          ctx.strokeStyle = active ? COLORS.border : '#1a2440';
          ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
          ctx.fillStyle = active ? COLORS.text : COLORS.locked;
          ctx.beginPath();
          const cxA = rect.x + rect.w / 2, cyA = rect.y + rect.h / 2;
          if (dir === 'up') {
            ctx.moveTo(cxA, cyA - 3);
            ctx.lineTo(cxA + 4, cyA + 2);
            ctx.lineTo(cxA - 4, cyA + 2);
          } else {
            ctx.moveTo(cxA, cyA + 3);
            ctx.lineTo(cxA + 4, cyA - 2);
            ctx.lineTo(cxA - 4, cyA - 2);
          }
          ctx.closePath();
          ctx.fill();
        };
        drawArrow(upR, 'up',   this.scroll > 0,         upHover);
        drawArrow(dnR, 'down', this.scroll < maxScroll, dnHover);
        this.hits.push({ rect: upR, kind: 'scrollUp' });
        this.hits.push({ rect: dnR, kind: 'scrollDown' });
        // Thumb track
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(sbX, trackY, sbW, trackH);
        const thumbH = Math.max(28, trackH * (visibleH / totalH));
        const thumbY = trackY + (trackH - thumbH) * (this.scroll / maxScroll);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillRect(sbX, thumbY, sbW, thumbH);
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.strokeRect(sbX + 0.5, thumbY + 0.5, sbW - 1, thumbH - 1);
      }
    },

    _drawTowerTile(ctx, game, key, def, r, hotkey) {
      const isHover = this._inRect(game._mx, game._my, r);
      const isPicked = game.placeKey === key;
      const unlocked = game.isTowerUnlocked
        ? game.isTowerUnlocked(key)
        : O.Towers.isUnlocked(key, Math.max(game.round || 0, game.bestRound || 0));
      const canAfford = unlocked && game.cash >= def.cost;
      const unlockR = O.Towers.unlockRound(key);

      // Background — locked is darker / lower contrast
      let bg = '#0e1430';
      if (!unlocked) bg = '#08091a';
      else if (isPicked) bg = COLORS.panelHi2;
      else if (isHover) bg = COLORS.panelHi;
      ctx.fillStyle = bg;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = isPicked ? def.color
                       : !unlocked ? COLORS.locked
                       : (canAfford ? '#3a4880' : COLORS.border);
      ctx.lineWidth = isPicked ? 1.8 : 1;
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);

      // Color band on the left edge — quick path-color glance
      ctx.fillStyle = unlocked ? def.color : COLORS.locked;
      ctx.globalAlpha = unlocked ? 0.85 : 0.4;
      ctx.fillRect(r.x, r.y, 3, r.h);
      ctx.globalAlpha = 1;

      // Layout scales with tile height so 40px tiles still read cleanly.
      const tall = r.h >= 50;
      const iconSize = tall ? 30 : 22;
      const nameFontPx = tall ? 11 : 10;
      const costFontPx = tall ? 12 : 11;
      const nameY = tall ? r.h - 16 : r.h - 13;
      const costY = tall ? r.h - 3  : r.h - 2;

      // Sprite icon (top half, centered)
      const iconCX = r.x + r.w / 2;
      const iconCY = r.y + (tall ? 18 : 14);
      ctx.save();
      if (!unlocked) ctx.globalAlpha = 0.35;
      if (Assets) {
        Assets.draw(ctx, def.sprite, iconCX, iconCY, iconSize, iconSize, {
          fallback: () => {
            ctx.fillStyle = def.color;
            ctx.fillRect(iconCX - iconSize / 2, iconCY - iconSize / 2, iconSize, iconSize);
          }
        });
      }
      ctx.restore();

      // Hotkey badge — top-right corner
      ctx.fillStyle = COLORS.textDim;
      ctx.font = 'bold 9px ui-monospace, monospace';
      ctx.textAlign = 'right'; ctx.textBaseline = 'top';
      ctx.fillText(hotkey === 10 ? '0' : String(hotkey), r.x + r.w - 4, r.y + 3);

      // Camo-detection badge — top-left corner. Tells the player at a glance
      // which towers can deal with hidden enemies.
      if (O.Towers.hasCamoDetection && O.Towers.hasCamoDetection(key)) {
        const ex = r.x + 4, ey = r.y + 4, ew = 11, eh = 7;
        ctx.save();
        if (!unlocked) ctx.globalAlpha = 0.5;
        ctx.fillStyle = '#7ae0ff';
        ctx.strokeStyle = '#0a0e18';
        ctx.lineWidth = 0.8;
        // Eye outline
        ctx.beginPath();
        ctx.moveTo(ex, ey + eh / 2);
        ctx.quadraticCurveTo(ex + ew / 2, ey - eh / 2, ex + ew, ey + eh / 2);
        ctx.quadraticCurveTo(ex + ew / 2, ey + eh * 1.2, ex, ey + eh / 2);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        // Pupil
        ctx.fillStyle = '#0a0e18';
        ctx.beginPath();
        ctx.arc(ex + ew / 2, ey + eh / 2, 1.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Name (bottom-center)
      ctx.fillStyle = unlocked ? (canAfford ? COLORS.text : COLORS.textDim) : COLORS.textDim;
      ctx.font = 'bold ' + nameFontPx + 'px ui-sans-serif, system-ui';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(def.short || def.name, r.x + r.w / 2, r.y + nameY);

      // Cost or unlock requirement
      if (unlocked) {
        ctx.fillStyle = canAfford ? COLORS.cash : COLORS.life;
        ctx.font = 'bold ' + costFontPx + 'px ui-monospace, monospace';
        ctx.fillText('$' + def.cost, r.x + r.w / 2, r.y + costY);
      } else {
        ctx.fillStyle = COLORS.locked;
        ctx.font = 'bold ' + (costFontPx - 1) + 'px ui-monospace, monospace';
        ctx.fillText('R' + unlockR, r.x + r.w / 2, r.y + costY);
      }

      // Lock overlay
      if (!unlocked) {
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
        // Padlock glyph
        ctx.strokeStyle = COLORS.locked;
        ctx.fillStyle = COLORS.locked;
        ctx.lineWidth = tall ? 1.6 : 1.3;
        const lx = iconCX, ly = iconCY;
        const lockR = tall ? 5 : 4;
        const lockBodyW = tall ? 14 : 11;
        const lockBodyH = tall ? 10 : 8;
        ctx.beginPath();
        ctx.arc(lx, ly - 3, lockR, Math.PI, 0, false);
        ctx.stroke();
        ctx.fillRect(lx - lockBodyW / 2, ly - 3, lockBodyW, lockBodyH);
        ctx.fillStyle = '#08091a';
        ctx.fillRect(lx - 0.8, ly + 1, 1.6, tall ? 4 : 3);
        ctx.restore();
      }
    },

    // ---- SELECTED MODE: tower stats + upgrade tree ----
    _drawSelectedTower(ctx, game, t, yStart) {
      const x = this.x + 8;
      const w = this.w - 16;
      const def = t.stats;
      const spec = O.Towers.get(t.key);
      let y = yStart + 4;

      // Header row: back button + tower name + level
      const backR = { x: x, y: y, w: 22, h: 22 };
      const isBackHover = this._inRect(game._mx, game._my, backR);
      ctx.fillStyle = isBackHover ? COLORS.panelHi2 : COLORS.panelHi;
      ctx.fillRect(backR.x, backR.y, backR.w, backR.h);
      ctx.strokeStyle = COLORS.border; ctx.strokeRect(backR.x + 0.5, backR.y + 0.5, backR.w - 1, backR.h - 1);
      ctx.fillStyle = COLORS.text;
      ctx.font = 'bold 14px ui-sans-serif, system-ui';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('◀', backR.x + backR.w / 2, backR.y + backR.h / 2);
      this.hits.push({ rect: backR, kind: 'deselect' });

      ctx.fillStyle = COLORS.text;
      ctx.font = 'bold 13px ui-sans-serif, system-ui';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(spec.base.short || spec.base.name, x + 28, y + 4);

      const lvl = t.level || 1;
      ctx.fillStyle = COLORS.cash;
      ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.textAlign = 'right';
      ctx.fillText('Lv ' + lvl, x + w - 4, y + 6);
      y += 28;

      // XP bar
      const xpNext = O.XP.nextThreshold(lvl);
      const xpPrev = (lvl > 1) ? O.XP.THRESHOLDS[lvl - 1] : 0;
      const xpFill = lvl >= O.XP.THRESHOLDS.length
        ? 1
        : Math.max(0, Math.min(1, (t.xp - xpPrev) / Math.max(1, xpNext - xpPrev)));
      ctx.fillStyle = '#0a0e1a';
      ctx.fillRect(x, y, w, 6);
      ctx.fillStyle = COLORS.cash;
      ctx.fillRect(x, y, Math.round(w * xpFill), 6);
      ctx.strokeStyle = COLORS.border;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 5);
      y += 12;

      // Stat lines (2 columns, terse)
      ctx.font = '11px ui-monospace, monospace';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      const stats = this._statLines(t);
      const colW = w / 2;
      for (let i = 0; i < stats.length; i++) {
        const cx = i % 2 === 0 ? x : x + colW;
        const cy = y + Math.floor(i / 2) * 14;
        ctx.fillStyle = COLORS.textDim;
        ctx.fillText(stats[i].label, cx, cy);
        ctx.fillStyle = COLORS.text;
        ctx.font = 'bold 11px ui-monospace, monospace';
        ctx.fillText(stats[i].value, cx + 36, cy);
        ctx.font = '11px ui-monospace, monospace';
      }
      y += Math.ceil(stats.length / 2) * 14 + 6;

      // Path A + B trees
      y = this._drawPathTree(ctx, game, t, spec, 'A', x, y, w);
      y += 6;
      y = this._drawPathTree(ctx, game, t, spec, 'B', x, y, w);
      y = this._drawParagonTile(ctx, game, t, spec, x, y, w);

      // Footer area: target / abilities / sell
      this._drawFooter(ctx, game, t, x, w);
    },

    _statLines(t) {
      const s = t.stats;
      const lines = [];
      const fmt = (n, d) => (typeof n === 'number') ? n.toFixed(d || 0) : '–';
      if (s.range && s.range < 5000) lines.push({ label: 'RNG', value: fmt(s.range) });
      if (s.range >= 5000)            lines.push({ label: 'RNG', value: 'GLOB' });
      if (s.dmg)                      lines.push({ label: 'DMG', value: fmt(s.dmg) });
      if (s.fireRate > 0)             lines.push({ label: 'RPS', value: fmt(s.fireRate, 1) });
      if (s.beamDps)                  lines.push({ label: 'DPS', value: fmt(s.beamDps) });
      if (s.splash)                   lines.push({ label: 'AOE', value: fmt(s.splash) });
      if (s.pierce && s.pierce > 1)   lines.push({ label: 'PRC', value: fmt(s.pierce) });
      if (s.chain)                    lines.push({ label: 'CHN', value: fmt(s.chain) });
      if (s.slow)                     lines.push({ label: 'SLW', value: Math.round(s.slow * 100) + '%' });
      if (s.bountyMult)               lines.push({ label: '$$', value: '+' + Math.round(s.bountyMult * 100) + '%' });
      if (s.interestRate)             lines.push({ label: 'INT', value: Math.round(s.interestRate * 100) + '%' });
      if (s.freezeAmount)             lines.push({ label: 'FRZ', value: Math.round(s.freezeAmount * 100) + '%' });
      if (s.brittleMul && s.brittleMul > 1) lines.push({ label: 'BRT', value: 'x' + s.brittleMul.toFixed(1) });
      if (s.timeSlow)                 lines.push({ label: 'SLW', value: Math.round(s.timeSlow * 100) + '%' });
      if (s.towerBuffFire)            lines.push({ label: 'BUF', value: '+' + Math.round(s.towerBuffFire * 100) + '%' });
      if (s.collapseRadius)           lines.push({ label: 'BLK', value: fmt(s.collapseRadius) });
      if (s.pulseDmg)                 lines.push({ label: 'PUL', value: fmt(s.pulseDmg) });
      if (s.burnDps)                  lines.push({ label: 'BRN', value: fmt(s.burnDps) });
      return lines.slice(0, 8);
    },

    _drawPathTree(ctx, game, t, spec, p, x, y, w) {
      const path = spec.paths[p];
      const cur = (t.pathTiers && t.pathTiers[p]) || 0;
      const allowedMax = O.Upgrades.allowedTiers(t, p);
      const tileW = (w - 6) / 4;
      const tileH = 38;
      // Header
      ctx.fillStyle = path.accent;
      ctx.font = 'bold 11px ui-sans-serif, system-ui';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('PATH ' + p + ' — ' + path.name, x, y);
      ctx.font = '9px ui-monospace, monospace';
      ctx.textAlign = 'right';
      ctx.fillStyle = COLORS.textDim;
      ctx.fillText(cur + '/4', x + w, y);
      y += 14;

      // 4 tier tiles in a row
      for (let n = 1; n <= 4; n++) {
        const td = path.tiers[n - 1];
        const tx = x + (n - 1) * (tileW + 2);
        const ty = y;
        const r = { x: tx, y: ty, w: tileW, h: tileH };
        const owned = n <= cur;
        const isNext = n === cur + 1;
        const allowed = n <= allowedMax;
        const canBuy = isNext && allowed && game.cash >= td.cost;
        const isHover = this._inRect(game._mx, game._my, r);

        // Background per state
        let fill;
        if (owned)        fill = path.accent;
        else if (canBuy)  fill = isHover ? COLORS.panelHi2 : COLORS.panelHi;
        else              fill = isHover && allowed ? '#181d35' : '#0a0e1a';
        ctx.fillStyle = fill;
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.strokeStyle = owned ? path.accent : (allowed ? COLORS.border : COLORS.locked);
        ctx.lineWidth = owned ? 2 : 1;
        ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);

        // Glyph icon (top half)
        const gx = r.x + r.w / 2;
        const gy = r.y + 11;
        const glyphColor = owned ? '#0a0e1a' : (allowed ? path.accent : COLORS.locked);
        if (O.Overlay && O.Overlay.drawGlyph) {
          O.Overlay.drawGlyph(ctx, td.glyph || 'crit', gx, gy, 14, glyphColor);
        }

        // Cost (bottom)
        ctx.fillStyle = owned ? '#0a0e1a' : (canBuy ? COLORS.cash : COLORS.textDim);
        ctx.font = 'bold 10px ui-monospace, monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText(owned ? '✓' : ('$' + fmtCash(td.cost)), gx, r.y + r.h - 3);

        // Tier number bar at very top
        ctx.fillStyle = owned ? '#0a0e1a' : (allowed ? path.accent : COLORS.locked);
        ctx.fillRect(r.x, r.y, r.w, 3);

        // Lock overlay if path-capped
        if (!allowed && !owned) {
          ctx.fillStyle = 'rgba(0,0,0,0.55)';
          ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
          ctx.fillStyle = COLORS.locked;
          ctx.font = 'bold 18px ui-sans-serif, system-ui';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('🔒', gx, r.y + r.h / 2);
        }
        this.hits.push({ rect: r, kind: 'buyTier', path: p, tier: n });
      }
      y += tileH + 4;
      return y;
    },

    _drawParagonTile(ctx, game, t, spec, x, y, w) {
      if (!spec.paragon || t.paragon) return y;
      const p = spec.paragon;
      const reason = O.Upgrades.paragonLockReason(t, game.cash);
      const ready = reason === null;
      const life = (O.Persist && O.Persist.getLifetimeXp)
        ? O.Persist.getLifetimeXp(t.key) : 0;
      const h = 36;
      const r = { x, y, w, h };
      const hover = this._inRect(game._mx, game._my, r);
      ctx.fillStyle = ready
        ? (hover ? '#3a3000' : '#25200a')
        : '#0a0e1a';
      ctx.fillRect(x, y, w, h);
      const pulse = ready ? (0.5 + 0.5 * Math.sin(game.time * 6)) : 0;
      ctx.strokeStyle = ready
        ? 'rgba(255,216,107,' + (0.6 + 0.4 * pulse).toFixed(3) + ')'
        : COLORS.locked;
      ctx.lineWidth = ready ? 2 : 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      ctx.fillStyle = ready ? COLORS.cash : COLORS.textDim;
      ctx.font = 'bold 12px ui-sans-serif, system-ui';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText('\u2605 ' + p.name, x + 8, y + 12);
      ctx.font = 'bold 10px ui-monospace, monospace';
      ctx.textAlign = 'right';
      ctx.fillStyle = ready ? COLORS.cash : COLORS.textDim;
      ctx.fillText('$' + fmtCash(p.cost), x + w - 8, y + 12);
      ctx.textAlign = 'left';
      ctx.font = '9px ui-monospace, monospace';
      ctx.fillStyle = COLORS.textDim;
      let sub = '';
      if (reason === 'paths')            sub = 'need T4 + T2';
      else if (reason === 'level')       sub = 'need Lv 3';
      else if (reason === 'lifetimeXp')  sub = 'lifetime ' + life + '/' + p.unlockLifetimeXp;
      else if (reason === 'cash')        sub = 'insufficient cash';
      else                                sub = 'READY \u2014 click to ignite';
      ctx.fillText(sub, x + 8, y + 26);
      this.hits.push({ rect: r, kind: 'buyParagon' });
      return y + h + 6;
    },

    _drawFooter(ctx, game, t, x, w) {
      const fy = this.h - FOOTER_H;
      // Targeting button
      const targetR = { x: x, y: fy, w: w / 2 - 3, h: 22 };
      const tHover = this._inRect(game._mx, game._my, targetR);
      ctx.fillStyle = tHover ? COLORS.panelHi2 : COLORS.panelHi;
      ctx.fillRect(targetR.x, targetR.y, targetR.w, targetR.h);
      ctx.strokeStyle = COLORS.border;
      ctx.strokeRect(targetR.x + 0.5, targetR.y + 0.5, targetR.w - 1, targetR.h - 1);
      ctx.fillStyle = COLORS.text;
      ctx.font = 'bold 11px ui-sans-serif, system-ui';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('TGT: ' + (O.Targeting.LABELS[t.priority] || 'First'),
                   targetR.x + targetR.w / 2, targetR.y + targetR.h / 2);
      this.hits.push({ rect: targetR, kind: 'cycleTarget' });

      // Sell button
      const sellR = { x: x + w / 2 + 3, y: fy, w: w / 2 - 3, h: 22 };
      const sHover = this._inRect(game._mx, game._my, sellR);
      ctx.fillStyle = sHover ? '#5a0820' : '#3a0814';
      ctx.fillRect(sellR.x, sellR.y, sellR.w, sellR.h);
      ctx.strokeStyle = COLORS.life;
      ctx.strokeRect(sellR.x + 0.5, sellR.y + 0.5, sellR.w - 1, sellR.h - 1);
      ctx.fillStyle = COLORS.text;
      ctx.font = 'bold 11px ui-sans-serif, system-ui';
      ctx.fillText('SELL +$' + O.Upgrades.refundValue(t),
                   sellR.x + sellR.w / 2, sellR.y + sellR.h / 2);
      this.hits.push({ rect: sellR, kind: 'sell' });

      // Active abilities row
      const aY = fy + 30;
      const abilities = ['A', 'B'].map(p => {
        const id = t.abilityIds && t.abilityIds[p];
        return id ? { id, p, def: O.Abilities.get(id) } : null;
      }).filter(Boolean);
      if (abilities.length > 0) {
        ctx.fillStyle = COLORS.textDim;
        ctx.font = 'bold 9px ui-sans-serif, system-ui';
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText('ABILITIES', x, aY);
        for (let i = 0; i < abilities.length; i++) {
          const ab = abilities[i];
          const cd = (t.abilityCDs && t.abilityCDs[ab.id]) || 0;
          const ready = cd <= 0;
          const aR = { x: x + i * (w / 2 + 2),
                       y: aY + 14, w: w / 2 - 2, h: 30 };
          const isHover = this._inRect(game._mx, game._my, aR);
          ctx.fillStyle = ready
            ? (isHover ? '#2a3870' : '#1c2750')
            : '#0a0e1a';
          ctx.fillRect(aR.x, aR.y, aR.w, aR.h);
          ctx.strokeStyle = ab.def && ready ? ab.def.color : COLORS.border;
          ctx.strokeRect(aR.x + 0.5, aR.y + 0.5, aR.w - 1, aR.h - 1);
          // glyph
          if (ab.def) {
            O.Overlay.drawGlyph(ctx, ab.def.glyph || 'star',
              aR.x + 14, aR.y + aR.h / 2, 11, ready ? ab.def.color : COLORS.locked);
          }
          // label / cd
          ctx.fillStyle = ready ? COLORS.text : COLORS.textDim;
          ctx.font = 'bold 10px ui-sans-serif, system-ui';
          ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          if (ready) {
            ctx.fillText(ab.def ? ab.def.label.slice(0, 12) : ab.id, aR.x + 28, aR.y + aR.h / 2 - 5);
            ctx.fillStyle = COLORS.textDim;
            ctx.font = 'bold 9px ui-monospace, monospace';
            ctx.fillText('press ' + (i === 0 ? 'Q' : 'E'), aR.x + 28, aR.y + aR.h / 2 + 7);
          } else {
            ctx.fillText(cd.toFixed(1) + 's', aR.x + 28, aR.y + aR.h / 2);
          }
          this.hits.push({ rect: aR, kind: 'fireAbility', abilityId: ab.id });
        }
      }
    },

    // ---- HOVER + INTERACTION ----
    _drawHover(ctx, game) {
      // Tooltip for hovered upgrade tile
      const h = this._hitAt(game._mx, game._my);
      if (!h) return;
      if (h.kind === 'buyTier' && game.selectedTower) {
        const t = game.selectedTower;
        const spec = O.Towers.get(t.key);
        const td = spec.paths[h.path].tiers[h.tier - 1];
        this._tooltip(ctx, game._mx, game._my, td.label, td.desc, '$' + fmtCash(td.cost));
      } else if (h.kind === 'buyTower') {
        const def = O.Towers.get(h.key).base;
        const unlocked = game.isTowerUnlocked
          ? game.isTowerUnlocked(h.key)
          : O.Towers.isUnlocked(h.key, Math.max(game.round || 0, game.bestRound || 0));
        const camoCap = O.Towers.hasCamoDetection && O.Towers.hasCamoDetection(h.key);
        // Compose description: base desc + (optional) "Reveals camo" line.
        let desc = def.desc || '';
        if (camoCap) {
          const native = def.seesCamo;
          desc += '  —  ' + (native ? '👁 Reveals CAMO natively.'
                                    : '👁 Reveals CAMO via upgrade.');
        }
        if (!unlocked) {
          const ur = O.Towers.unlockRound(h.key);
          this._tooltip(ctx, game._mx, game._my,
            '🔒 ' + def.name,
            desc + '  —  Locked: clear round ' + ur + ' to unlock.',
            'UNLOCKS R' + ur);
        } else {
          this._tooltip(ctx, game._mx, game._my, def.name, desc, '$' + fmtCash(def.cost));
        }
      } else if (h.kind === 'fireAbility') {
        const def = O.Abilities.get(h.abilityId);
        if (def) this._tooltip(ctx, game._mx, game._my, def.label, def.desc, 'CD ' + def.cd + 's');
      }
    },

    _tooltip(ctx, mx, my, title, desc, footer) {
      const W = 230;
      const H = 104;
      let x = mx - W - 12;
      let y = my - H / 2;
      if (x < 4) x = 4;
      if (y < 4) y = 4;
      if (y + H > this.h - 4) y = this.h - 4 - H;
      ctx.fillStyle = 'rgba(8,12,28,0.96)';
      ctx.fillRect(x, y, W, H);
      ctx.strokeStyle = COLORS.border;
      ctx.strokeRect(x + 0.5, y + 0.5, W - 1, H - 1);
      ctx.fillStyle = COLORS.text;
      ctx.font = 'bold 12px ui-sans-serif, system-ui';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(title, x + 8, y + 6);
      ctx.fillStyle = COLORS.textDim;
      ctx.font = '11px ui-sans-serif, system-ui';
      const words = (desc || '').split(' ');
      let line = ''; let yy = y + 24;
      for (const w of words) {
        const test = line ? line + ' ' + w : w;
        if (ctx.measureText(test).width > W - 16) {
          ctx.fillText(line, x + 8, yy);
          line = w; yy += 13;
          if (yy > y + H - 18) break;
        } else line = test;
      }
      if (line) ctx.fillText(line, x + 8, yy);
      ctx.fillStyle = COLORS.cash;
      ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
      ctx.fillText(footer, x + W - 8, y + H - 6);
    },

    handleHover(mx, my, game) {
      this.hover = this._hitAt(mx, my);
    },

    handleClick(mx, my, game) {
      const h = this._hitAt(mx, my);
      if (!h) {
        // Inside panel but no hit: still consume the click (don't place towers
        // through the panel).
        return mx >= this.x;
      }
      switch (h.kind) {
        case 'startWave':
          if (game.state2 === 'build') game.startWave();
          return true;
        case 'speedToggle':
          game.toggleSpeed();
          return true;
        case 'buyTower': {
          const unlocked = game.isTowerUnlocked
            ? game.isTowerUnlocked(h.key)
            : O.Towers.isUnlocked(h.key, Math.max(game.round || 0, game.bestRound || 0));
          if (!unlocked) {
            const ur = O.Towers.unlockRound(h.key);
            game.flashMessage('Locked — clear round ' + ur, '#ff5566');
            game.sfx.play('lose');
          } else if (game.cash >= O.Towers.get(h.key).base.cost) {
            game.placeKey = h.key;
            game.selectedTower = null;
            game.sfx.play('place');
          } else {
            game.flashMessage('Not enough cash', '#ff5566');
          }
          return true;
        }
        case 'deselect':
          game.selectedTower = null;
          return true;
        case 'buyTier':
          game.tryBuyTier(h.path, h.tier);
          return true;
        case 'buyParagon':
          game.tryBuyParagon(game.selectedTower);
          return true;
        case 'cycleTarget':
          if (game.selectedTower) {
            game.selectedTower.priority = O.Targeting.next(game.selectedTower.priority);
            game.sfx.play('place');
          }
          return true;
        case 'sell':
          game.sellSelected();
          return true;
        case 'fireAbility':
          game.fireAbility(h.abilityId);
          return true;
        case 'scrollUp':
          this.scroll = Math.max(0, this.scroll - 60);
          return true;
        case 'scrollDown':
          this.scroll = this.scroll + 60;
          return true;
      }
      return mx >= this.x;
    },

    handleWheel(dy, game) {
      if (game._mx < this.x) return false;
      this.scroll = Math.max(0, this.scroll + dy * 0.5);
      return true;
    },

    _inRect(mx, my, r) {
      return r && mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h;
    },
    _hitAt(mx, my) {
      // Search top-down (last drawn wins)
      for (let i = this.hits.length - 1; i >= 0; i--) {
        if (this._inRect(mx, my, this.hits[i].rect)) return this.hits[i];
      }
      return null;
    }
  };

  O.UI.SidePanel = Panel;
})();
