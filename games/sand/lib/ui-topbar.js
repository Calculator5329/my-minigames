// games/sand/lib/ui-topbar.js
// Top breadcrumb + tick + stars + campaign controls (Next, Reset, Sandbox).
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

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  function mount(opts) {
    const parent = opts.parent || document.body;
    const deps = opts.deps || {};
    // deps: nextLevel(), resetLevel(), toggleSandbox(), pickLevel(id)

    const root = h('div', 'sand-ui sand-topbar');

    const left = h('div', 'sand-topbar-left');
    const crumb = h('div', 'sand-breadcrumb');
    crumb.innerHTML = '<span class="sand-crumb-accent">sand</span> <span class="sand-crumb-arrow">▸</span> <span class="sand-crumb-tail">…</span>';
    left.appendChild(crumb);

    const picker = document.createElement('select');
    picker.className = 'sand-level-picker';
    picker.title = 'Jump to level';
    picker.addEventListener('change', () => {
      if (deps.pickLevel) deps.pickLevel(picker.value);
    });
    left.appendChild(picker);
    root.appendChild(left);

    const meta = h('div', 'sand-topbar-meta');
    const tickEl = h('span', 'sand-tick', 'tick 0');
    const starsEl = h('span', 'sand-stars', '☆☆☆');

    const bReset = h('button', 'sand-topbar-btn', 'Reset');
    bReset.title = 'Clear the workspace and re-seed input/output pads for this level';
    bReset.addEventListener('click', () => { if (deps.resetLevel) deps.resetLevel(); });

    const bNext = h('button', 'sand-topbar-btn primary', 'Next ▸');
    bNext.title = 'Advance to next unsolved level';
    bNext.addEventListener('click', () => { if (deps.nextLevel) deps.nextLevel(); });

    const bSandbox = h('button', 'sand-topbar-btn', 'Sandbox');
    bSandbox.title = 'Toggle free-build sandbox';
    bSandbox.addEventListener('click', () => { if (deps.toggleSandbox) deps.toggleSandbox(); });

    meta.appendChild(tickEl);
    meta.appendChild(starsEl);
    meta.appendChild(bReset);
    meta.appendChild(bNext);
    meta.appendChild(bSandbox);
    root.appendChild(meta);

    parent.appendChild(root);

    let lastPickerKey = '';

    return {
      el: root,
      update(state) {
        state = state || {};
        if (typeof state.tick === 'number') tickEl.textContent = 'tick ' + (state.tick | 0);
        if (state.breadcrumb) {
          crumb.innerHTML = '<span class="sand-crumb-accent">sand</span> <span class="sand-crumb-arrow">▸</span> <span class="sand-crumb-tail">' + escapeHtml(state.breadcrumb) + '</span>';
        }
        if (state.stars) starsEl.textContent = state.stars;

        // Refresh the picker only when the level set changes.
        if (Array.isArray(state.levels)) {
          const key = state.levels.map(l => l.id + ':' + (state.solved && state.solved[l.id] ? state.solved[l.id] : 0)).join('|') + '#' + (state.currentId || '');
          if (key !== lastPickerKey) {
            lastPickerKey = key;
            while (picker.firstChild) picker.removeChild(picker.firstChild);
            for (const lv of state.levels) {
              const opt = document.createElement('option');
              opt.value = lv.id;
              const stars = (state.solved && state.solved[lv.id]) | 0;
              const starGlyph = stars > 0 ? ' ' + '★'.repeat(stars) : '';
              opt.textContent = (lv.order != null ? (lv.order + '. ') : '') + (lv.title || lv.id) + starGlyph;
              picker.appendChild(opt);
            }
            if (state.currentId) picker.value = state.currentId;
          } else if (state.currentId && picker.value !== state.currentId) {
            picker.value = state.currentId;
          }
        }

        if (typeof state.sandbox === 'boolean') {
          bSandbox.classList.toggle('active', state.sandbox);
          bSandbox.textContent = state.sandbox ? '◂ Campaign' : 'Sandbox';
        }
      },
      destroy() {
        if (root.parentNode) root.parentNode.removeChild(root);
      },
      setBounds(left, top, width) {
        root.style.left = left + 'px';
        root.style.top  = top + 'px';
        root.style.width = width + 'px';
      },
    };
  }

  window.NDP.Sand.UI.TopBar = { mount };
})();
