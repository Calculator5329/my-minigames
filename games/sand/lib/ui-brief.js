// games/sand/lib/ui-brief.js
// Rich, level-aware brief pane with tutorial steps and truth-table preview.
// State is driven by `update({ level, mode, status })`.
(function () {
  if (typeof window === 'undefined') return;
  window.NDP = window.NDP || {};
  window.NDP.Sand = window.NDP.Sand || {};
  window.NDP.Sand.UI = window.NDP.Sand.UI || {};

  const SANDBOX_BRIEF = 'Free build. Drop primitives, wire pins, toggle inputs on the right. Click Test to score against the placeholder OR table.';

  // Per-level guided tutorial overlays. Keyed by level id; only L1_01 has a
  // full walkthrough — later levels use the standard brief.
  const TUTORIALS = {
    L1_01_buffer: [
      'Goal: when input <b>A</b> is on, output <b>Y</b> is on. When A is off, Y is off.',
      'Drag <b>Power</b> from the left palette onto the canvas. Power feeds 1 into anything wired to its <b>out</b> pin.',
      'Drag a <b>Switch</b> next to it. Wire <b>Power.out → Switch.in</b> by clicking one pin then the other.',
      'Wire <b>A.out → Switch.gate</b>. The gate decides whether the switch passes power.',
      'Wire <b>Switch.out → Y.in</b>. Toggle A on the right to confirm Y follows it, then click <b>Test</b>.',
    ],
    L1_02_not: [
      'Goal: when A is on, Y is off — and vice versa. This is an <b>inverter</b>.',
      'Use <b>Pullup</b> (defaults Y high) plus a <b>Switch</b> wired to <b>Ground</b>: when A opens the switch, the pullup pulls Y to 1; when A closes it, Y is yanked to 0.',
    ],
  };

  function h(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  }

  function buildTruthTable(level) {
    if (!level || !level.truthTable || !level.io) return null;
    const wrap = h('div', 'sand-brief-tt');
    const head = h('div', 'sand-brief-tt-row sand-brief-tt-head');
    for (const lbl of level.io.inputs) head.appendChild(h('span', 'sand-brief-tt-cell in', lbl));
    head.appendChild(h('span', 'sand-brief-tt-sep', '→'));
    for (const lbl of level.io.outputs) head.appendChild(h('span', 'sand-brief-tt-cell out', lbl));
    wrap.appendChild(head);
    for (const row of level.truthTable) {
      const r = h('div', 'sand-brief-tt-row');
      for (const v of row.in) r.appendChild(h('span', 'sand-brief-tt-cell ' + (v ? 'on' : 'off'), v ? '1' : '0'));
      r.appendChild(h('span', 'sand-brief-tt-sep', '→'));
      for (const v of row.out) r.appendChild(h('span', 'sand-brief-tt-cell ' + (v ? 'on' : 'off'), v ? '1' : '0'));
      wrap.appendChild(r);
    }
    return wrap;
  }

  function buildStarGoals(level) {
    if (!level || !level.starGoals) return null;
    const sg = level.starGoals;
    const wrap = h('div', 'sand-brief-stars');
    const tip = h('div', 'sand-brief-stars-tip', '★★★ targets:');
    wrap.appendChild(tip);
    const line = h('div', 'sand-brief-stars-line');
    if (sg.gates && sg.gates['3star'] != null) {
      line.appendChild(h('span', null, '≤ ' + sg.gates['3star'] + ' gates'));
    }
    if (sg.ticks && sg.ticks['3star'] != null) {
      line.appendChild(h('span', null, '≤ ' + sg.ticks['3star'] + ' ticks'));
    }
    wrap.appendChild(line);
    return wrap;
  }

  function buildAllowed(level) {
    if (!level || !Array.isArray(level.allowedComponents) || !level.allowedComponents.length) return null;
    const wrap = h('div', 'sand-brief-allowed');
    wrap.appendChild(h('span', 'sand-brief-mini-label', 'parts'));
    for (const id of level.allowedComponents) {
      wrap.appendChild(h('span', 'sand-brief-tag', id));
    }
    return wrap;
  }

  function mount(opts) {
    const parent = opts.parent || document.body;
    const Storage = (window.NDP && window.NDP.Engine && window.NDP.Engine.Storage) || null;

    const saved = Storage ? (Storage.getGameData('sand') || {}) : {};
    const savedSettings = (saved && saved.settings) || {};
    let collapsed = !!savedSettings.briefCollapsed;
    let tutorialDismissed = !!savedSettings.tutorialDismissed;

    const root = h('div', 'sand-ui sand-brief' + (collapsed ? ' collapsed' : ''));

    const title = h('div', 'sand-brief-title');
    title.innerHTML = '<span class="sand-brief-eyebrow">Brief</span> <span class="sand-brief-name">—</span>';
    root.appendChild(title);

    const body = h('div', 'sand-brief-body');
    body.textContent = opts.text || SANDBOX_BRIEF;
    root.appendChild(body);

    const detail = h('div', 'sand-brief-detail');
    root.appendChild(detail);

    const tutorial = h('div', 'sand-brief-tutorial');
    root.appendChild(tutorial);

    // Footer: one-tap "How do I play?" reopener + dismiss-permanently toggle.
    const footer = h('div', 'sand-brief-footer');
    const helpBtn = h('button', 'sand-brief-help', '? Controls');
    footer.appendChild(helpBtn);
    root.appendChild(footer);

    helpBtn.addEventListener('click', () => {
      showControlsCheat(root);
    });

    const toggle = h('button', 'sand-brief-toggle', collapsed ? '+' : '–');
    toggle.title = collapsed ? 'Expand' : 'Collapse';
    toggle.addEventListener('click', () => {
      collapsed = !collapsed;
      root.classList.toggle('collapsed', collapsed);
      toggle.textContent = collapsed ? '+' : '–';
      toggle.title = collapsed ? 'Expand' : 'Collapse';
      if (Storage) {
        const cur = Storage.getGameData('sand') || {};
        const settings = Object.assign({}, cur.settings || {}, { briefCollapsed: collapsed });
        Storage.mergeGameData('sand', { settings });
      }
    });
    root.appendChild(toggle);

    parent.appendChild(root);

    function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }

    function showControlsCheat(rootEl) {
      // Flash a transient cheat-sheet the user can click anywhere to dismiss.
      const sheet = h('div', 'sand-cheat');
      sheet.innerHTML =
        '<div class="sand-cheat-title">SAND — controls</div>' +
        '<div class="sand-cheat-cols">' +
          '<div><b>Drag chip</b> from left palette → drop on canvas</div>' +
          '<div><b>Hotkeys 1–7</b> place a part at the cursor</div>' +
          '<div><b>Click pin → click pin</b> to draw a wire</div>' +
          '<div><b>Click an input row</b> on the right to toggle 0/1</div>' +
          '<div><b>Step</b> advances 1 tick · <b>Run</b> auto-ticks</div>' +
          '<div><b>Test</b> validates against the truth table</div>' +
          '<div><b>Drag canvas</b> to pan · scroll to zoom</div>' +
          '<div><b>Box-select</b> drag · <b>Delete</b> to remove</div>' +
        '</div>' +
        '<div class="sand-cheat-foot">click anywhere to dismiss</div>';
      document.body.appendChild(sheet);
      const dismiss = () => {
        if (sheet.parentNode) sheet.parentNode.removeChild(sheet);
        document.removeEventListener('mousedown', dismiss, true);
        document.removeEventListener('keydown', dismiss, true);
      };
      // Use capture so the click that opened it doesn't immediately close it.
      setTimeout(() => {
        document.addEventListener('mousedown', dismiss, true);
        document.addEventListener('keydown', dismiss, true);
      }, 50);
    }

    function update(state) {
      state = state || {};
      const level = state.level || null;
      const mode = state.mode || 'campaign';   // 'campaign' | 'sandbox'
      const stars = state.stars || 0;          // 0..3, persisted best
      const status = state.status || null;     // 'cleared' | 'best' | null

      // Title line
      const eyebrow = mode === 'sandbox' ? 'Sandbox' : (level ? ('Level ' + (level.order != null ? level.order : '')) : 'Brief');
      const name = level ? (level.title || level.id) : (mode === 'sandbox' ? 'Free build' : 'Loading…');
      const starText = stars > 0 ? '  ' + ('★'.repeat(stars)) + ('☆'.repeat(Math.max(0, 3 - stars))) : '';
      title.innerHTML = '<span class="sand-brief-eyebrow">' + eyebrow + '</span> <span class="sand-brief-name">' + (name || '') + '</span><span class="sand-brief-stars">' + starText + '</span>';

      // Body line
      if (mode === 'sandbox') {
        body.innerHTML = SANDBOX_BRIEF;
      } else if (level) {
        body.innerHTML = (level.brief || '') + (status === 'cleared' ? ' <span class="sand-cleared">solved!</span>' : '');
      } else {
        body.textContent = 'Loading first level…';
      }

      // Detail (truth table + star goals + allowed parts)
      clear(detail);
      if (level) {
        const tt = buildTruthTable(level);
        if (tt) detail.appendChild(tt);
        const goals = buildStarGoals(level);
        if (goals) detail.appendChild(goals);
        const allowed = buildAllowed(level);
        if (allowed) detail.appendChild(allowed);
      }

      // Tutorial steps for guided levels
      clear(tutorial);
      const steps = level && TUTORIALS[level.id];
      if (steps && !tutorialDismissed) {
        const head = h('div', 'sand-brief-tut-head', 'Tutorial');
        const dis = h('button', 'sand-brief-tut-dismiss', '×');
        dis.title = 'Hide tutorial';
        dis.addEventListener('click', () => {
          tutorialDismissed = true;
          if (Storage) {
            const cur = Storage.getGameData('sand') || {};
            const settings = Object.assign({}, cur.settings || {}, { tutorialDismissed: true });
            Storage.mergeGameData('sand', { settings });
          }
          clear(tutorial);
        });
        head.appendChild(dis);
        tutorial.appendChild(head);
        const ol = h('ol', 'sand-brief-tut-list');
        for (const s of steps) {
          const li = document.createElement('li');
          li.innerHTML = s;
          ol.appendChild(li);
        }
        tutorial.appendChild(ol);
      }
    }

    return {
      el: root,
      update,
      setText(t) { body.textContent = t; },
      destroy() {
        if (root.parentNode) root.parentNode.removeChild(root);
      },
      setPosition(left, bottom) {
        root.style.left = left + 'px';
        root.style.bottom = bottom + 'px';
      },
    };
  }

  window.NDP.Sand.UI.Brief = { mount };
})();
