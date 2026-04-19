// games/sand/lib/ui-iopanel.js
// Task 18 + 19: I/O panel with pad toggles, LEDs, run controls, and
// animated truth-table test strip.
(function () {
  if (typeof window === 'undefined') return;
  window.NDP = window.NDP || {};
  window.NDP.Sand = window.NDP.Sand || {};
  window.NDP.Sand.UI = window.NDP.Sand.UI || {};

  function h(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  }

  function mount(opts) {
    const parent = opts.parent || document.body;
    const deps = opts.deps || {};
    // deps: setPadValue(label, v), simStep(), togglePlay(), isPlaying(),
    //       getLevelSpec(), runTest() -> result, saveAs(), onLevelPassed()

    const root = h('div', 'sand-ui sand-iopanel');

    // --- Inputs section
    const inTitle = h('div', 'sand-iopanel-section-title', 'Inputs');
    const inWrap = h('div');
    root.appendChild(inTitle);
    root.appendChild(inWrap);

    // --- Outputs section
    const outTitle = h('div', 'sand-iopanel-section-title', 'Outputs');
    const outWrap = h('div');
    root.appendChild(outTitle);
    root.appendChild(outWrap);

    // --- Test strip
    const testTitle = h('div', 'sand-iopanel-section-title', 'Test');
    const testStrip = h('div', 'sand-test-strip');
    root.appendChild(testTitle);
    root.appendChild(testStrip);

    // --- Buttons
    const btns = h('div');
    const bStep = h('button', 'sand-btn', 'Step');
    const bRun  = h('button', 'sand-btn', 'Run');
    const bTest = h('button', 'sand-btn', 'Test');
    const bSave = h('button', 'sand-btn', 'Save as…');
    btns.appendChild(bStep); btns.appendChild(bRun);
    btns.appendChild(bTest); btns.appendChild(bSave);
    root.appendChild(btns);

    bStep.addEventListener('click', () => { if (deps.simStep) deps.simStep(); });
    bRun.addEventListener('click',  () => { if (deps.togglePlay) deps.togglePlay(); });
    bSave.addEventListener('click', () => { if (deps.saveAs) deps.saveAs(); else showTip(bSave, 'Save stub (Task 28)'); });

    // Track current DOM rows for diffing.
    const inRows = {};  // label -> { row, led }
    const outRows = {}; // label -> { row, led }

    function ensureInputRow(label) {
      if (inRows[label]) return inRows[label];
      const row = h('div', 'sand-io-row clickable');
      const name = h('span', null, label);
      const led = h('div', 'sand-led');
      row.appendChild(name);
      row.appendChild(led);
      row.addEventListener('click', () => {
        const cur = row.dataset.val === '1' ? 1 : 0;
        const next = cur ? 0 : 1;
        row.dataset.val = String(next);
        if (deps.setPadValue) deps.setPadValue(label, next);
      });
      inWrap.appendChild(row);
      return (inRows[label] = { row, led });
    }

    function ensureOutputRow(label) {
      if (outRows[label]) return outRows[label];
      const row = h('div', 'sand-io-row');
      const name = h('span', null, label);
      const led = h('div', 'sand-led');
      row.appendChild(name);
      row.appendChild(led);
      outWrap.appendChild(row);
      return (outRows[label] = { row, led });
    }

    function pruneRows(map, container, keepSet) {
      for (const lbl of Object.keys(map)) {
        if (!keepSet.has(lbl)) {
          const r = map[lbl];
          if (r.row.parentNode) r.row.parentNode.removeChild(r.row);
          delete map[lbl];
        }
      }
    }

    // --- Test-run animation state
    let testTimers = [];
    function cancelTestAnim() {
      for (const t of testTimers) clearTimeout(t);
      testTimers = [];
    }
    function clearTestStrip() {
      while (testStrip.firstChild) testStrip.removeChild(testStrip.firstChild);
    }

    function showTip(anchor, msg) {
      const tip = h('div', 'sand-tooltip', msg);
      document.body.appendChild(tip);
      const r = anchor.getBoundingClientRect();
      tip.style.left = (r.left) + 'px';
      tip.style.top  = (r.top - 28) + 'px';
      setTimeout(() => { if (tip.parentNode) tip.parentNode.removeChild(tip); }, 1400);
    }

    bTest.addEventListener('click', () => {
      cancelTestAnim();
      clearTestStrip();
      const levelSpec = deps.getLevelSpec ? deps.getLevelSpec() : null;
      if (!levelSpec) {
        showTip(bTest, 'No level active');
        return;
      }
      const result = deps.runTest ? deps.runTest() : null;
      if (!result || !result.rows) {
        showTip(bTest, 'Test unavailable');
        return;
      }
      // Prepare LEDs (pending).
      const leds = [];
      for (let i = 0; i < result.rows.length; i++) {
        const led = h('div', 'sand-led pending');
        testStrip.appendChild(led);
        leds.push(led);
      }
      const sfx = deps.sfx || null;
      // Light each LED over time.
      for (let i = 0; i < result.rows.length; i++) {
        (function (idx) {
          const t = setTimeout(() => {
            leds[idx].classList.remove('pending');
            if (result.rows[idx].match) {
              leds[idx].classList.add('on');
              if (sfx && sfx.play) sfx.play('tickPass');
            } else {
              leds[idx].classList.add('miss');
              if (sfx && sfx.play) sfx.play('tickFail');
            }
            if (idx === result.rows.length - 1) {
              if (result.passed && deps.onLevelPassed) {
                deps.onLevelPassed(levelSpec.id || 'unknown', result);
              }
            }
          }, 120 * (idx + 1));
          testTimers.push(t);
        })(i);
      }
    });

    parent.appendChild(root);

    function update(state) {
      state = state || {};
      const graph = state.graph;
      const playing = !!state.playing;
      bRun.textContent = playing ? 'Pause' : 'Run';
      bRun.classList.toggle('active', playing);

      if (!graph) return;
      const inLabels = new Set();
      const outLabels = new Set();
      for (const id of Object.keys(graph.nodes)) {
        const n = graph.nodes[id];
        if (n.type === 'pad_in' && n.props && n.props.label) {
          inLabels.add(n.props.label);
          const r = ensureInputRow(n.props.label);
          const v = n.props.value === 1 ? 1 : 0;
          r.row.dataset.val = String(v);
          r.led.classList.toggle('on', v === 1);
        }
        if (n.type === 'pad_out' && n.props && n.props.label) {
          outLabels.add(n.props.label);
          const r = ensureOutputRow(n.props.label);
          let v = 0;
          if (state.signals && deps.readOutput) {
            v = deps.readOutput(n.props.label) | 0;
          }
          r.led.classList.toggle('on', v === 1);
        }
      }
      pruneRows(inRows, inWrap, inLabels);
      pruneRows(outRows, outWrap, outLabels);
    }

    return {
      el: root,
      update,
      destroy() {
        cancelTestAnim();
        if (root.parentNode) root.parentNode.removeChild(root);
      },
      setPosition(left, top) {
        root.style.left = left + 'px';
        root.style.top  = top + 'px';
      },
    };
  }

  window.NDP.Sand.UI.IOPanel = { mount };
})();
