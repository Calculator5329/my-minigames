/* Main orchestrator: selector, arcade, shop.
   Builds cards with live animated previews. Owns the game loop when a game is
   mounted. */
(function () {
  const NDP = window.NDP;
  const { Input, Audio, Storage, Draw, TAU } = NDP.Engine;

  // ----- Theme system (cosmetic) -----
  const THEMES = [
    {
      id: 'default',  name: 'Arcade Gold',  cost: 0,
      vars: { '--bg':'#0e1116','--bg2':'#151a22','--fg':'#e7ecf3','--fg-dim':'#8892a6','--accent':'#ffcc33','--accent2':'#ff5e7e' }
    },
    {
      id: 'synth', name: 'Synthwave', cost: 150,
      vars: { '--bg':'#120822','--bg2':'#1a0f33','--fg':'#fde7ff','--fg-dim':'#a58abd','--accent':'#ff4fd8','--accent2':'#4fc8ff' }
    },
    {
      id: 'terminal', name: 'Terminal', cost: 250,
      vars: { '--bg':'#030806','--bg2':'#08130e','--fg':'#caffd5','--fg-dim':'#6a8b72','--accent':'#3dff8e','--accent2':'#9dff3d' }
    },
    {
      id: 'sunset', name: 'Sunset Arcade', cost: 400,
      vars: { '--bg':'#1a0e1c','--bg2':'#24142a','--fg':'#fff3e0','--fg-dim':'#b48a94','--accent':'#ff9255','--accent2':'#ff4d6d' }
    },
    {
      id: 'ice', name: 'Glacier', cost: 600,
      vars: { '--bg':'#08131c','--bg2':'#0f1d2b','--fg':'#e7f6ff','--fg-dim':'#7a97ad','--accent':'#7cd9ff','--accent2':'#c8eaff' }
    },
    {
      id: 'wafer', name: 'Wafer', cost: 0,
      vars: { '--bg':'#0c1218','--bg2':'#121a22','--fg':'#d7e6f2','--fg-dim':'#7891a3','--accent':'#ffcc33','--accent2':'#7cd9ff' }
    }
  ];

  function applyTheme(id) {
    const t = THEMES.find(x => x.id === id) || THEMES[0];
    const root = document.documentElement;
    Object.entries(t.vars).forEach(([k,v]) => root.style.setProperty(k, v));
  }

  applyTheme(Storage.getActiveTheme());

  // ----- Elements -----
  const selectorView = document.getElementById('selector');
  const arcadeView = document.getElementById('arcade');
  const shopView = document.getElementById('shop');
  const grid = document.getElementById('grid');
  const canvas = document.getElementById('stage-canvas');
  const ctx = canvas.getContext('2d');
  const gameTitle = document.getElementById('game-title');
  const hudEl = document.getElementById('hud');
  const overlay = document.getElementById('overlay');
  const coinDisplay = document.getElementById('coin-display');
  const shopCoins = document.getElementById('shop-coins');
  const shopBody = document.getElementById('shop-body');
  const muteBtn = document.getElementById('mute-btn');

  function refreshCoins() {
    const c = Storage.getCoins();
    coinDisplay.textContent = '\u25CF ' + c;
    shopCoins.textContent = '\u25CF ' + c;
  }
  refreshCoins();

  function refreshMuteBtn() {
    muteBtn.textContent = Audio.isMuted() ? '\uD83D\uDD07' : '\uD83D\uDD0A';
  }
  refreshMuteBtn();
  muteBtn.onclick = () => { Audio.toggleMuted(); refreshMuteBtn(); };

  // ----- Build selector cards with animated previews -----
  const cardCanvases = [];   // [{ canvas, ctx, manifest, time }]

  function buildGrid() {
    grid.innerHTML = '';
    cardCanvases.length = 0;
    /* Sort by most-played (desc), ties broken by most-recently-played, then
       by original registration order. Games never played sit at the bottom in
       their registration order so the grid isn't reshuffled on first visit. */
    const sorted = NDP.games.slice().sort((a, b) => {
      const sa = Storage.getGameStats(a.id);
      const sb = Storage.getGameStats(b.id);
      if (sb.plays !== sa.plays) return (sb.plays | 0) - (sa.plays | 0);
      if (sb.lastPlayed !== sa.lastPlayed) return (sb.lastPlayed | 0) - (sa.lastPlayed | 0);
      return NDP.games.indexOf(a) - NDP.games.indexOf(b);
    });
    sorted.forEach(manifest => {
      const card = document.createElement('div');
      card.className = 'card';
      card.style.setProperty('--card-accent', manifest.theme?.accent || '#ffcc33');

      const c = document.createElement('canvas');
      c.width = 320; c.height = 240;
      card.appendChild(c);

      const ov = document.createElement('div');
      ov.className = 'card-overlay';
      const title = document.createElement('div');
      title.className = 'card-title';
      title.textContent = manifest.title;
      const blurb = document.createElement('div');
      blurb.className = 'card-blurb';
      blurb.textContent = manifest.blurb;
      ov.appendChild(title); ov.appendChild(blurb);
      card.appendChild(ov);

      const stats = Storage.getGameStats(manifest.id);
      if (stats.hi > 0) {
        const hi = document.createElement('div');
        hi.className = 'card-hi';
        hi.textContent = 'HI ' + stats.hi;
        card.appendChild(hi);
      }

      card.onclick = () => enterArcade(manifest);
      grid.appendChild(card);
      cardCanvases.push({ canvas: c, ctx: c.getContext('2d'), manifest, time: Math.random() * 10 });
    });
  }

  function tickPreviews(dt) {
    for (const cc of cardCanvases) {
      cc.time += dt;
      try {
        cc.manifest.previewDraw(cc.ctx, cc.time, cc.canvas.width, cc.canvas.height);
      } catch (e) {
        cc.ctx.fillStyle = '#200'; cc.ctx.fillRect(0,0,cc.canvas.width,cc.canvas.height);
      }
    }
  }

  // ----- Arcade loop -----
  let activeGame = null;
  let lastT = 0;
  let rafId = null;

  function enterArcade(manifest) {
    selectorView.classList.add('hidden');
    shopView.classList.add('hidden');
    arcadeView.classList.remove('hidden');
    gameTitle.textContent = manifest.title.toUpperCase();

    // Per-game canvas theme (via data- attrs if desired; game sets bg itself)
    canvas.style.background = manifest.theme?.bg || '#000';

    Input.attach(canvas);

    const Klass = manifest.gameClass;
    activeGame = new Klass(canvas, manifest);
    showTitleOverlay(manifest, activeGame);
    lastT = performance.now();
  }

  function exitToSelector() {
    stopLoop();
    Input.detach();
    Audio.stopAmbient();
    activeGame = null;
    overlay.classList.add('hidden');
    arcadeView.classList.add('hidden');
    shopView.classList.add('hidden');
    selectorView.classList.remove('hidden');
    buildGrid();  // refresh HI scores
    refreshCoins();
    startPreviewLoop();
  }

  function startGame() {
    if (!activeGame) return;
    overlay.classList.add('hidden');
    activeGame.begin();
    startLoop();
  }

  function startLoop() {
    if (rafId) cancelAnimationFrame(rafId);
    lastT = performance.now();
    const tick = (t) => {
      const dt = Math.min(0.05, (t - lastT) / 1000);
      lastT = t;
      if (activeGame) {
        activeGame._step(dt);
        Draw.clear(ctx, activeGame.manifest.theme?.bg || '#000');
        activeGame._draw();
        hudEl.innerHTML = activeGame.getHud() || '';
        if (activeGame.state === 'over' || activeGame.state === 'won') {
          showEndOverlay(activeGame);
          stopLoop();
          return;
        }
        if (activeGame.state === 'paused') {
          showPauseOverlay(activeGame);
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  }

  function stopLoop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  // ----- Overlays -----
  function showTitleOverlay(manifest, game) {
    overlay.classList.remove('hidden');
    overlay.innerHTML = `
      <h2>${escapeHtml(manifest.title.toUpperCase())}</h2>
      <p>${escapeHtml(manifest.description || manifest.blurb)}</p>
      <p class="score-line">${escapeHtml(manifest.controls || '')}</p>
      <div class="btns">
        <button class="primary" id="ov-play">Play &raquo;</button>
        <button id="ov-back">Back</button>
      </div>
    `;
    document.getElementById('ov-play').onclick = startGame;
    document.getElementById('ov-back').onclick = exitToSelector;
  }

  function showPauseOverlay(game) {
    if (!overlay.classList.contains('hidden')) return;
    overlay.classList.remove('hidden');
    overlay.innerHTML = `
      <h2>PAUSED</h2>
      <div class="btns">
        <button class="primary" id="ov-resume">Resume</button>
        <button id="ov-back">Quit</button>
      </div>
    `;
    document.getElementById('ov-resume').onclick = () => {
      overlay.classList.add('hidden');
      game.resume();
      startLoop();
    };
    document.getElementById('ov-back').onclick = exitToSelector;
  }

  function showEndOverlay(game) {
    const won = game.state === 'won';
    const score = game.score | 0;
    const coins = game.coinsEarned(score);
    Storage.recordRun(game.id, score);
    Storage.addCoins(coins);
    refreshCoins();

    overlay.classList.remove('hidden');
    const stats = Storage.getGameStats(game.id);
    overlay.innerHTML = `
      <h2>${won ? 'VICTORY' : 'GAME OVER'}</h2>
      <div class="score-line">Score: <b>${score}</b> &middot; Best: <b>${stats.hi}</b></div>
      <div class="score-line coin-earned">+ ${coins} coins</div>
      <div class="btns">
        <button class="primary" id="ov-retry">Play Again</button>
        <button id="ov-back">Back to Selector</button>
      </div>
    `;
    document.getElementById('ov-retry').onclick = () => {
      overlay.classList.add('hidden');
      activeGame.begin();
      startLoop();
    };
    document.getElementById('ov-back').onclick = exitToSelector;
  }

  function escapeHtml(s) {
    return (s || '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  // ----- Global keys -----
  window.addEventListener('keydown', (e) => {
    if (!activeGame) return;
    if (e.key === 'Escape') {
      if (activeGame.state === 'playing') {
        activeGame.pause();
      } else if (activeGame.state === 'paused') {
        overlay.classList.add('hidden');
        activeGame.resume();
        startLoop();
      }
    }
    if (e.key === 'm' || e.key === 'M') {
      Audio.toggleMuted();
      refreshMuteBtn();
    }
  });

  document.getElementById('back-btn').onclick = exitToSelector;

  // ----- Feedback modal -----
  const feedbackBtn      = document.getElementById('feedback-btn');
  const feedbackModal    = document.getElementById('feedback-modal');
  const feedbackClose    = document.getElementById('feedback-close');
  const feedbackText     = document.getElementById('feedback-text');
  const feedbackSend     = document.getElementById('feedback-send');
  const feedbackCounter  = document.getElementById('feedback-counter');
  const feedbackStatus   = document.getElementById('feedback-status');
  const feedbackSub      = document.getElementById('feedback-sub');
  const FEEDBACK_MAX = (NDP.Engine.Feedback && NDP.Engine.Feedback.MAX_LEN) || 2000;

  function setFeedbackStatus(msg, kind) {
    feedbackStatus.textContent = msg || '';
    feedbackStatus.className = 'modal-status' + (kind ? ' ' + kind : '');
  }

  function openFeedback() {
    if (!activeGame) return;
    const m = activeGame.manifest;
    feedbackSub.textContent = `Tell me what you think about ${m.title}.`;
    feedbackText.value = '';
    feedbackCounter.textContent = '0 / ' + FEEDBACK_MAX;
    setFeedbackStatus('');
    feedbackSend.disabled = false;
    feedbackModal.classList.remove('hidden');
    setTimeout(() => feedbackText.focus(), 0);
    NDP.Engine.Feedback && NDP.Engine.Feedback.preload && NDP.Engine.Feedback.preload();
  }

  function closeFeedback() {
    feedbackModal.classList.add('hidden');
  }

  async function sendFeedback() {
    if (!activeGame) return;
    const m = activeGame.manifest;
    const text = feedbackText.value;
    if (!text.trim()) {
      setFeedbackStatus('Write something first.', 'bad');
      return;
    }
    feedbackSend.disabled = true;
    setFeedbackStatus('Sending\u2026');
    try {
      await NDP.Engine.Feedback.submit(m.id, m.title, text);
      setFeedbackStatus('Thanks! Sent.', 'good');
      feedbackText.value = '';
      feedbackCounter.textContent = '0 / ' + FEEDBACK_MAX;
      setTimeout(closeFeedback, 1200);
    } catch (err) {
      console.error('[feedback]', err);
      const msg = (err && err.message) ? err.message : 'Could not send feedback.';
      setFeedbackStatus(msg, 'bad');
      feedbackSend.disabled = false;
    }
  }

  feedbackBtn.onclick   = openFeedback;
  feedbackClose.onclick = closeFeedback;
  feedbackSend.onclick  = sendFeedback;
  feedbackModal.addEventListener('click', (e) => {
    if (e.target === feedbackModal) closeFeedback();
  });
  feedbackText.addEventListener('input', () => {
    feedbackCounter.textContent = feedbackText.value.length + ' / ' + FEEDBACK_MAX;
  });
  feedbackText.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      sendFeedback();
    }
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !feedbackModal.classList.contains('hidden')) {
      e.stopPropagation();
      closeFeedback();
    }
  }, true);

  // ----- Shop -----
  document.getElementById('shop-btn').onclick = openShop;
  document.getElementById('shop-back-btn').onclick = exitToSelector;

  function openShop() {
    stopPreviewLoop();
    selectorView.classList.add('hidden');
    arcadeView.classList.add('hidden');
    shopView.classList.remove('hidden');
    renderShop();
  }

  function renderShop() {
    refreshCoins();
    shopBody.innerHTML = '';
    THEMES.forEach(t => {
      const unlocked = Storage.isThemeUnlocked(t.id);
      const active = Storage.getActiveTheme() === t.id;
      const card = document.createElement('div');
      card.className = 'theme-card';

      const swatch = document.createElement('div');
      swatch.className = 'theme-swatch';
      ['--bg','--bg2','--accent','--accent2','--fg'].forEach(k => {
        const s = document.createElement('span');
        s.style.background = t.vars[k];
        swatch.appendChild(s);
      });
      const name = document.createElement('div');
      name.className = 'theme-name';
      name.textContent = t.name;
      const cost = document.createElement('div');
      cost.className = 'theme-cost';
      cost.textContent = unlocked ? (active ? 'Active' : 'Owned') : ('\u25CF ' + t.cost);

      const btn = document.createElement('button');
      if (active) {
        btn.textContent = 'Active';
        btn.disabled = true;
        btn.classList.add('active');
      } else if (unlocked) {
        btn.textContent = 'Equip';
        btn.onclick = () => { Storage.setActiveTheme(t.id); applyTheme(t.id); renderShop(); };
      } else {
        btn.textContent = 'Unlock (' + t.cost + ')';
        btn.disabled = Storage.getCoins() < t.cost;
        btn.onclick = () => {
          if (Storage.spendCoins(t.cost)) {
            Storage.unlockTheme(t.id);
            Storage.setActiveTheme(t.id);
            applyTheme(t.id);
            renderShop();
          }
        };
      }

      card.appendChild(swatch);
      card.appendChild(name);
      card.appendChild(cost);
      card.appendChild(btn);
      shopBody.appendChild(card);
    });
  }

  // ----- Preview loop -----
  let pRaf = null, pLast = 0;
  function startPreviewLoop() {
    stopPreviewLoop();
    pLast = performance.now();
    const tick = (t) => {
      const dt = Math.min(0.05, (t - pLast) / 1000);
      pLast = t;
      tickPreviews(dt);
      pRaf = requestAnimationFrame(tick);
    };
    pRaf = requestAnimationFrame(tick);
  }
  function stopPreviewLoop() {
    if (pRaf) cancelAnimationFrame(pRaf);
    pRaf = null;
  }

  // ----- Boot -----
  window.addEventListener('DOMContentLoaded', () => {
    // Kick off asset preloading for any manifest that declares `assets`.
    // Games still fall back to procedural art if files are missing, so we
    // don't block on this — the grid boots immediately.
    const Assets = NDP.Engine.Assets;
    if (Assets) {
      const all = [];
      NDP.games.forEach(m => {
        if (Array.isArray(m.assets)) all.push(...m.assets);
      });
      if (all.length) Assets.preload(all);
    }
    buildGrid();
    startPreviewLoop();
  });

  // expose for debugging
  NDP._exit = exitToSelector;
  NDP._enter = enterArcade;
  Object.defineProperty(NDP, '_activeGame', { get: () => activeGame });
})();
