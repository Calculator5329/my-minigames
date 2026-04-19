// games/sand/lib/ui-palette.js
// Task 17: left-edge primitive palette with drag-to-workspace and hotkeys.
(function () {
  if (typeof window === 'undefined') return;
  window.NDP = window.NDP || {};
  window.NDP.Sand = window.NDP.Sand || {};
  window.NDP.Sand.UI = window.NDP.Sand.UI || {};

  const CHIPS = [
    { type: 'pad_in',  label: 'Pad In',  key: '1' },
    { type: 'pad_out', label: 'Pad Out', key: '2' },
    { type: 'power',   label: 'Power',   key: '3' },
    { type: 'ground',  label: 'Ground',  key: '4' },
    { type: 'switch',  label: 'Switch',  key: '5' },
    { type: 'pullup',  label: 'Pullup',  key: '6' },
    { type: 'clock',   label: 'Clock',   key: '7' },
  ];

  function iconFor(type) {
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 20 20');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', '#ffcc33');
    svg.setAttribute('stroke-width', '1.5');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    const mk = (tag, attrs) => {
      const el = document.createElementNS(svgNS, tag);
      for (const k in attrs) el.setAttribute(k, attrs[k]);
      return el;
    };
    switch (type) {
      case 'pad_in':
        svg.appendChild(mk('circle', { cx: 6, cy: 10, r: 3 }));
        svg.appendChild(mk('line', { x1: 9, y1: 10, x2: 17, y2: 10 }));
        break;
      case 'pad_out':
        svg.appendChild(mk('line', { x1: 3, y1: 10, x2: 11, y2: 10 }));
        svg.appendChild(mk('circle', { cx: 14, cy: 10, r: 3 }));
        break;
      case 'power':
        svg.appendChild(mk('line', { x1: 10, y1: 3, x2: 10, y2: 17 }));
        svg.appendChild(mk('line', { x1: 6, y1: 7, x2: 14, y2: 7 }));
        break;
      case 'ground':
        svg.appendChild(mk('line', { x1: 10, y1: 3, x2: 10, y2: 10 }));
        svg.appendChild(mk('line', { x1: 5, y1: 10, x2: 15, y2: 10 }));
        svg.appendChild(mk('line', { x1: 7, y1: 13, x2: 13, y2: 13 }));
        svg.appendChild(mk('line', { x1: 9, y1: 16, x2: 11, y2: 16 }));
        break;
      case 'switch':
        svg.appendChild(mk('line', { x1: 3, y1: 12, x2: 8, y2: 12 }));
        svg.appendChild(mk('line', { x1: 8, y1: 12, x2: 14, y2: 5 }));
        svg.appendChild(mk('line', { x1: 14, y1: 12, x2: 17, y2: 12 }));
        break;
      case 'pullup':
        svg.appendChild(mk('line', { x1: 10, y1: 3, x2: 10, y2: 7 }));
        svg.appendChild(mk('rect', { x: 7, y: 7, width: 6, height: 8 }));
        svg.appendChild(mk('line', { x1: 10, y1: 15, x2: 10, y2: 17 }));
        break;
      case 'clock':
        svg.appendChild(mk('path', { d: 'M3 14 L6 14 L6 8 L10 8 L10 14 L14 14 L14 8 L17 8' }));
        break;
    }
    return svg;
  }

  function mount(opts) {
    const parent = opts.parent || document.body;
    const deps = opts.deps || {};
    // deps.addNode(type, worldPt) / deps.getCursorWorld() / deps.getCanvasRect()

    const root = document.createElement('div');
    root.className = 'sand-ui sand-palette';
    root.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'sand-palette-title';
    title.textContent = 'Primitives';
    root.appendChild(title);

    let ghost = null;
    let draggingType = null;

    function makeChip(c) {
      const el = document.createElement('div');
      el.className = 'sand-chip';
      el.appendChild(iconFor(c.type));
      const lbl = document.createElement('span');
      lbl.className = 'sand-chip-label';
      lbl.textContent = c.label;
      el.appendChild(lbl);
      const key = document.createElement('span');
      key.className = 'sand-chip-key';
      key.textContent = c.key;
      el.appendChild(key);
      el.dataset.type = c.type;

      el.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        draggingType = c.type;
        ghost = document.createElement('div');
        ghost.className = 'sand-ghost';
        ghost.textContent = c.label;
        document.body.appendChild(ghost);
        ghost.style.left = e.clientX + 'px';
        ghost.style.top  = e.clientY + 'px';
      });
      return el;
    }

    for (const c of CHIPS) root.appendChild(makeChip(c));

    function onMouseMove(e) {
      if (ghost) {
        ghost.style.left = e.clientX + 'px';
        ghost.style.top  = e.clientY + 'px';
      }
    }

    function onMouseUp(e) {
      if (!draggingType) return;
      const type = draggingType;
      draggingType = null;
      if (ghost) { ghost.remove(); ghost = null; }
      // If released over canvas, add a node at world pt.
      const rect = deps.getCanvasRect ? deps.getCanvasRect() : null;
      if (!rect) return;
      if (e.clientX >= rect.left && e.clientX <= rect.right &&
          e.clientY >= rect.top  && e.clientY <= rect.bottom) {
        const wp = deps.screenToWorld ? deps.screenToWorld(e.clientX, e.clientY) : { x: 0, y: 0 };
        if (typeof deps.addNode === 'function') deps.addNode(type, wp);
      }
    }

    function onKeyDown(e) {
      // Ignore if typing in an input.
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const idx = CHIPS.findIndex(c => c.key === e.key);
      if (idx < 0) return;
      const wp = deps.getCursorWorld ? deps.getCursorWorld() : { x: 0, y: 0 };
      if (typeof deps.addNode === 'function') deps.addNode(CHIPS[idx].type, wp);
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('keydown', onKeyDown);

    parent.appendChild(root);

    // Track compiled component chips added via update({ types }).
    const compiledChips = {}; // id -> HTMLElement

    function makeCompiledChip(id) {
      const el = document.createElement('div');
      el.className = 'sand-chip sand-chip--compiled';
      el.dataset.type = id;
      const lbl = document.createElement('span');
      lbl.className = 'sand-chip-label';
      lbl.textContent = id;
      el.appendChild(lbl);
      return el;
    }

    return {
      el: root,
      update(state) {
        state = state || {};
        const types = state.types || [];
        for (const id of types) {
          if (!compiledChips[id]) {
            const chip = makeCompiledChip(id);
            compiledChips[id] = chip;
            root.appendChild(chip);
          }
        }
        if (state.newlyUnlocked && compiledChips[state.newlyUnlocked]) {
          const chip = compiledChips[state.newlyUnlocked];
          chip.classList.add('sand-chip--new');
          setTimeout(() => { chip.classList.remove('sand-chip--new'); }, 1500);
        }
      },
      destroy() {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        window.removeEventListener('keydown', onKeyDown);
        if (ghost) { ghost.remove(); ghost = null; }
        if (root.parentNode) root.parentNode.removeChild(root);
      },
      setPosition(left, top) {
        root.style.left = left + 'px';
        root.style.top  = top + 'px';
      },
    };
  }

  window.NDP.Sand.UI.Palette = { mount };
})();
