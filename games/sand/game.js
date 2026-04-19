/* Sand — from sand to CPU.
   Boots into campaign mode: loads L1 level set, picks the first unsolved level,
   pre-places its input/output pads, and walks the player through the tutorial.
   Sandbox is one click away on the top bar. */
(function () {
  const NDP = window.NDP;
  const { BaseGame } = NDP.Engine;
  const Sand = NDP.Sand || {};
  const { Model, History, Camera, Render, Workspace, Sim } = Sand;
  const Analyze = Sand.Analyze;
  const Compile = Sand.Compile;
  const Levels = Sand.Levels;
  const LevelRun = Sand.LevelRun;
  const Progress = Sand.Progress;

  const W = 960, H = 600;
  const CSS_HREF = 'games/sand/sand.css?v=2';
  const CSS_ID = 'sand-ui-css';

  // Fallback truth-table when no campaign level has loaded yet (or sandbox).
  const PLACEHOLDER_LEVEL = {
    id: 'sandbox-or',
    title: 'Free build',
    brief: 'Sandbox — build any circuit. Test scores against an OR table.',
    io: { inputs: ['A', 'B'], outputs: ['Y'] },
    truthTable: [
      { in: [0, 0], out: [0] },
      { in: [0, 1], out: [1] },
      { in: [1, 0], out: [1] },
      { in: [1, 1], out: [1] },
    ],
    starGoals: { gates: { '2star': 4, '3star': 2 }, ticks: { '2star': 8, '3star': 4 } },
    allowedComponents: ['pad_in', 'pad_out', 'power', 'ground', 'switch', 'pullup', 'clock'],
  };

  function ensureCss() {
    if (document.getElementById(CSS_ID)) return;
    const link = document.createElement('link');
    link.id = CSS_ID;
    link.rel = 'stylesheet';
    link.href = CSS_HREF;
    document.head.appendChild(link);
  }
  function removeCss() {
    const link = document.getElementById(CSS_ID);
    if (link && link.parentNode) link.parentNode.removeChild(link);
  }

  // Sandbox demo graph: small NOT-gate seed for tinkering.
  function seedDemoGraph() {
    const g = Model.create();
    const padIn   = Model.addNode(g, { type: 'pad_in',  x: -220, y: 0,   props: { label: 'A', value: 0 } });
    const gnd     = Model.addNode(g, { type: 'ground',  x: -220, y: 80,  props: {} });
    const sw      = Model.addNode(g, { type: 'switch',  x: -60,  y: 40,  props: {} });
    const pu      = Model.addNode(g, { type: 'pullup',  x: 100,  y: 40,  props: {} });
    const padOut  = Model.addNode(g, { type: 'pad_out', x: 240,  y: 40,  props: { label: 'Y' } });
    Model.addWire(g, { from: { node: padIn.id, pin: 'out' }, to: { node: sw.id, pin: 'gate' } });
    Model.addWire(g, { from: { node: gnd.id,   pin: 'out' }, to: { node: sw.id, pin: 'in'   } });
    Model.addWire(g, { from: { node: sw.id,    pin: 'out' }, to: { node: pu.id, pin: 'a'    } });
    Model.addWire(g, { from: { node: pu.id,    pin: 'out' }, to: { node: padOut.id, pin: 'in' } });
    return g;
  }

  // Empty graph with the level's IO pads pre-placed in a friendly layout.
  function seedFromLevel(level) {
    const g = Model.create();
    if (!level || !level.io) return g;
    const inputs = level.io.inputs || [];
    const outputs = level.io.outputs || [];
    const yStep = 80;
    const inX = -340;
    const outX = 340;
    const inStart = -((inputs.length - 1) * yStep) / 2;
    for (let i = 0; i < inputs.length; i++) {
      Model.addNode(g, {
        type: 'pad_in',
        x: inX,
        y: inStart + i * yStep,
        props: { label: inputs[i], value: 0 },
      });
    }
    const outStart = -((outputs.length - 1) * yStep) / 2;
    for (let i = 0; i < outputs.length; i++) {
      Model.addNode(g, {
        type: 'pad_out',
        x: outX,
        y: outStart + i * yStep,
        props: { label: outputs[i] },
      });
    }
    return g;
  }

  // Next unique label for pad_in / pad_out in a graph (used by hotkey-add).
  function nextLabel(graph, type, prefix) {
    const used = new Set();
    for (const id of Object.keys(graph.nodes)) {
      const n = graph.nodes[id];
      if (n.type === type && n.props && n.props.label) used.add(n.props.label);
    }
    const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (let suffix = 0; suffix < 10; suffix++) {
      for (let i = 0; i < alpha.length; i++) {
        const lbl = (prefix || '') + alpha[i] + (suffix ? suffix : '');
        if (!used.has(lbl)) return lbl;
      }
    }
    return 'X';
  }

  class SandGame extends BaseGame {
    init() {
      ensureCss();
      this.setHud('<span>Sand — campaign loading…</span>');

      this.mode = 'campaign'; // 'campaign' | 'sandbox'
      this.levelSet = null;   // sorted array of L1 level objects
      this.levelById = {};    // id -> level
      this.levelSpec = null;  // current level (or PLACEHOLDER_LEVEL in sandbox)
      this.l1LevelIds = [];

      // Workspace state
      this.ws = {
        graph: Model.create(),
        camera: Camera.create({ x: 0, y: 30, zoom: 1 }),
        selection: { nodes: {}, wires: {} },
        pendingWire: null,
        boxSelect: null,
        signals: {},
      };
      this.ws.history = History.create(this.ws.graph);

      this.componentRegistry = {};
      this.progress = (Progress && NDP.Engine && NDP.Engine.Storage)
        ? Progress.init({ storage: NDP.Engine.Storage })
        : null;

      // Re-hydrate saved custom circuits into the registry.
      if (this.progress && Compile && Model) {
        try {
          const saved = Progress.savedCircuits(this.progress) || [];
          for (const sc of saved) {
            if (!sc || !sc.id || !sc.graph) continue;
            try {
              const g = Model.fromJSON(sc.graph);
              const def = Compile.compile(g, { id: sc.id, name: sc.name || sc.id });
              if (def && def.id) this.componentRegistry[def.id] = def;
            } catch (e) { console.warn('[sand] rehydrate skipped:', sc.id, e); }
          }
        } catch (e) { console.warn('[sand] rehydrate failed:', e); }
      }

      this.sim = Sim ? Sim.create(this.ws.graph) : null;
      this._rebuildSim();
      this.playing = false;
      this._playAccum = 0;
      this.tick = 0;
      this.scopeHistory = [];
      this._flash = { active: false, t: 0, duration: 1.5 };
      this._sparks = [];
      this._lastDt = 0;
      this._lastStatus = null;

      this.sfx = this.makeSfx({
        tickPass: { freq: 880, dur: 0.06, type: 'triangle', vol: 0.25 },
        tickFail: { freq: 180, dur: 0.1,  type: 'sawtooth', vol: 0.3  },
        place:    { freq: 520, dur: 0.05, type: 'square',   vol: 0.18 },
      });

      const self = this;
      this._cursorWorld = { x: 0, y: 0 };

      this._workspace = Workspace.create({
        canvas: this.canvas,
        getState: () => self.ws,
        setGraph: (g) => { self.ws.graph = g; self._rebuildSim(); },
        deps: { Camera, Model, History, Render },
      });

      this._onCanvasMove = (e) => {
        const r = self.canvas.getBoundingClientRect();
        const sx = self.canvas.width / r.width;
        const sy = self.canvas.height / r.height;
        const sp = { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy };
        self._cursorWorld = Camera.screenToWorld(self.ws.camera, sp, { w: self.canvas.width, h: self.canvas.height });
      };
      this.canvas.addEventListener('mousemove', this._onCanvasMove);

      const mountEl = this.canvas.parentNode || document.body;
      if (getComputedStyle(mountEl).position === 'static') {
        mountEl.style.position = 'relative';
      }
      this._mountEl = mountEl;

      const Palette = NDP.Sand.UI && NDP.Sand.UI.Palette;
      const IOPanel = NDP.Sand.UI && NDP.Sand.UI.IOPanel;
      const TopBar  = NDP.Sand.UI && NDP.Sand.UI.TopBar;
      const Brief   = NDP.Sand.UI && NDP.Sand.UI.Brief;

      const addNode = (type, wp) => {
        const spec = { type, x: wp.x | 0, y: wp.y | 0, props: {} };
        if (type === 'pad_in')  spec.props = { label: nextLabel(self.ws.graph, 'pad_in'),  value: 0 };
        if (type === 'pad_out') spec.props = { label: nextLabel(self.ws.graph, 'pad_out') };
        Model.addNode(self.ws.graph, spec);
        History.commit(self.ws.history, self.ws.graph);
        self._rebuildSim();
        if (self.sfx) self.sfx.play('place');
      };

      const setPadValue = (label, value) => {
        for (const id of Object.keys(self.ws.graph.nodes)) {
          const n = self.ws.graph.nodes[id];
          if (n.type === 'pad_in' && n.props && n.props.label === label) {
            n.props.value = value ? 1 : 0;
          }
        }
        if (self.sim) {
          self.sim.setInput(label, value ? 1 : 0);
          self.sim.run({ maxTicks: 32 });
        }
      };

      const pushScope = () => {
        let v = 0;
        for (const id of Object.keys(self.ws.graph.nodes)) {
          const n = self.ws.graph.nodes[id];
          if (n.type === 'clock' && self.sim) {
            v = self.sim.getSignal(id, 'out') === 1 ? 1 : 0;
            break;
          }
        }
        self.scopeHistory.push([self.tick, v]);
        if (self.scopeHistory.length > 256) self.scopeHistory.splice(0, self.scopeHistory.length - 256);
      };
      const simStep = () => { if (self.sim) self.sim.step(); self.tick += 1; pushScope(); };
      self._pushScope = pushScope;
      const togglePlay = () => { self.playing = !self.playing; };
      const isPlaying = () => self.playing;
      const readOutput = (label) => (self.sim ? self.sim.readOutput(label) : 0);
      const getLevelSpec = () => self.levelSpec || PLACEHOLDER_LEVEL;
      const runTest = () => {
        const LR = NDP.Sand.LevelRun;
        if (!LR) return null;
        return LR.test(self.ws.graph, getLevelSpec(), { maxTicks: 64 });
      };
      const onLevelPassed = (id, result) => {
        const levelSpec = getLevelSpec();
        const graph = self.ws.graph;
        let stars = 0;
        let gates = 0;
        let ticks = 0;
        if (Analyze && LevelRun) {
          gates = Analyze.gateCount(graph);
          const td = Analyze.tickDepth(graph);
          ticks = (td === Infinity) ? 9999 : (td | 0);
          const s = LevelRun.score(result, { gates, ticks }, levelSpec);
          stars = (s && s.stars) | 0;
        }

        const firstTime = self.progress ? !Progress.isSolved(self.progress, id) : true;
        if (self.progress) {
          Progress.recordSolve(self.progress, id, { stars, gates, ticks }, {
            unlocksComponent: levelSpec && levelSpec.unlocksComponent,
          });
        }
        if (firstTime && NDP.Engine && NDP.Engine.Storage) {
          const table = { 1: 10, 2: 20, 3: 35 };
          const coins = table[stars] | 0;
          if (coins > 0) NDP.Engine.Storage.addCoins(coins);
        }

        self._lastStatus = 'cleared';
        self._flash = { active: true, t: 0, duration: 1.5 };
        for (const nid of Object.keys(self.ws.graph.nodes)) {
          const n = self.ws.graph.nodes[nid];
          if (n.type !== 'pad_out') continue;
          for (let i = 0; i < 60; i++) {
            const ang = Math.random() * Math.PI * 2;
            const sp = 120 + Math.random() * 220;
            self._sparks.push({
              x: n.x, y: n.y,
              vx: Math.cos(ang) * sp,
              vy: Math.sin(ang) * sp,
              life: 0.6 + Math.random() * 0.5,
              age: 0,
              hue: 40 + Math.random() * 30,
            });
          }
        }

        if (levelSpec && levelSpec.unlocksComponent && Compile) {
          try {
            const def = Compile.compile(graph, {
              id: levelSpec.unlocksComponent.id,
              name: levelSpec.unlocksComponent.name,
              icon: levelSpec.unlocksComponent.icon,
            });
            if (def && def.id) {
              self.componentRegistry[def.id] = def;
              if (self.ui && self.ui.palette && self.ui.palette.update) {
                const types = Object.keys(self.componentRegistry);
                setTimeout(() => {
                  if (self.ui && self.ui.palette && self.ui.palette.update) {
                    self.ui.palette.update({ types, newlyUnlocked: def.id });
                  }
                }, 400);
              }
            }
          } catch (e) {
            console.warn('[sand] compile on pass failed:', e);
          }
        }

        // Layer-1 capstone bonus.
        try {
          if (self.progress && Progress && self.l1LevelIds && self.l1LevelIds.length) {
            let allSolved = true;
            for (const lid of self.l1LevelIds) {
              if (!Progress.isSolved(self.progress, lid)) { allSolved = false; break; }
            }
            if (allSolved) {
              const already = Progress.getMeta ? !!Progress.getMeta(self.progress, 'layer1Complete') : false;
              if (!already) {
                if (Progress.setMeta) Progress.setMeta(self.progress, 'layer1Complete', true);
                try {
                  if (NDP.Engine && NDP.Engine.Storage && NDP.Engine.Storage.addCoins) {
                    NDP.Engine.Storage.addCoins(100);
                  }
                } catch (e) { console.warn('[sand] bonus coin failed:', e); }
                try {
                  if (NDP.Engine && NDP.Engine.Storage && NDP.Engine.Storage.unlockTheme) {
                    NDP.Engine.Storage.unlockTheme('wafer');
                  }
                } catch (e) { console.warn('[sand] unlockTheme failed:', e); }
              }
            }
          }
        } catch (e) { console.warn('[sand] capstone check failed:', e); }

        self._refreshUI();
        console.log('[sand] level passed:', id, { stars, gates, ticks, firstTime });
      };
      const BASE_TYPES = ['pad_in', 'pad_out', 'power', 'ground', 'switch', 'pullup', 'clock'];
      const sanitizeId = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'component';
      const idTaken = (id) => {
        const Prim = NDP.Sand.Primitives || {};
        return !!Prim[id] || !!self.componentRegistry[id];
      };
      const uniqueId = (base) => {
        let id = base;
        let n = 2;
        while (idTaken(id)) { id = base + '_' + n; n++; }
        return id;
      };
      const hasType = (type) => {
        const g = self.ws.graph;
        for (const id of Object.keys(g.nodes)) {
          if (g.nodes[id].type === type) return true;
        }
        return false;
      };
      const saveAs = () => {
        if (!Compile || !Model) return;
        if (!hasType('pad_in') || !hasType('pad_out')) {
          try { window.alert('Need at least one input pad and one output pad.'); } catch (e) {}
          return;
        }
        let name;
        try { name = window.prompt('Name this component:'); } catch (e) { name = null; }
        if (name == null) return;
        name = String(name).trim();
        if (!name) return;
        const baseId = sanitizeId(name);
        const id = uniqueId(baseId);
        let def;
        try {
          def = Compile.compile(self.ws.graph, { id, name });
        } catch (e) {
          console.warn('[sand] saveAs compile failed:', e);
          return;
        }
        if (!def || !def.id) return;
        self.componentRegistry[def.id] = def;
        if (self.progress && Progress && Progress.addSavedCircuit) {
          try {
            Progress.addSavedCircuit(self.progress, {
              id: def.id,
              name: def.name,
              graph: Model.toJSON(self.ws.graph),
              createdAt: Date.now(),
            });
          } catch (e) { console.warn('[sand] addSavedCircuit failed:', e); }
        }
        if (self.ui && self.ui.palette && self.ui.palette.update) {
          const types = BASE_TYPES.concat(Object.keys(self.componentRegistry));
          self.ui.palette.update({ types, newlyUnlocked: def.id });
        }
      };

      this.ui = {};
      if (Palette) {
        this.ui.palette = Palette.mount({
          parent: mountEl,
          deps: {
            addNode,
            getCursorWorld: () => self._cursorWorld,
            getCanvasRect: () => self.canvas.getBoundingClientRect(),
            screenToWorld: (cx, cy) => {
              const r = self.canvas.getBoundingClientRect();
              const sx = self.canvas.width / r.width;
              const sy = self.canvas.height / r.height;
              const sp = { x: (cx - r.left) * sx, y: (cy - r.top) * sy };
              return Camera.screenToWorld(self.ws.camera, sp, { w: self.canvas.width, h: self.canvas.height });
            },
          },
        });
      }
      if (IOPanel) {
        this.ui.iopanel = IOPanel.mount({
          parent: mountEl,
          deps: { setPadValue, simStep, togglePlay, isPlaying, readOutput,
                  getLevelSpec, runTest, onLevelPassed, saveAs, sfx: this.sfx },
        });
      }
      if (this.ui.palette && this.ui.palette.update) {
        const compiledIds = Object.keys(this.componentRegistry);
        if (compiledIds.length) {
          this.ui.palette.update({ types: BASE_TYPES.concat(compiledIds) });
        }
      }

      if (TopBar) {
        this.ui.topbar = TopBar.mount({
          parent: mountEl,
          deps: {
            nextLevel: () => self._nextLevel(),
            resetLevel: () => self._resetCurrent(),
            toggleSandbox: () => self._toggleSandbox(),
            pickLevel: (id) => self._loadLevel(id),
          },
        });
      }
      if (Brief) this.ui.brief = Brief.mount({ parent: mountEl });

      this._layout();
      this._onResize = () => self._layout();
      window.addEventListener('resize', this._onResize);

      // Kick off the level set load. This populates this.levelSet and selects
      // the first unsolved level. Until it resolves, the UI shows "loading…".
      this._loadCampaign();
    }

    _loadCampaign() {
      const self = this;
      if (!Levels || !Levels.load) {
        // Fall back to sandbox seed if the levels module isn't available.
        this._enterSandbox(true);
        return;
      }
      Levels.load({ basePath: 'games/sand/data' }).then((bundle) => {
        const levelMap = (bundle && bundle.levels) || {};
        const list = Object.keys(levelMap).map((k) => levelMap[k])
          .filter((l) => l && l.layer === 'L1')
          .sort((a, b) => (a.order | 0) - (b.order | 0));
        self.levelSet = list;
        self.levelById = {};
        self.l1LevelIds = [];
        for (const l of list) {
          self.levelById[l.id] = l;
          self.l1LevelIds.push(l.id);
        }
        const startId = self._firstUnsolvedId() || (list[0] && list[0].id);
        if (startId) {
          self._loadLevel(startId);
        } else {
          self._enterSandbox(true);
        }
      }).catch((err) => {
        console.warn('[sand] level load failed:', err);
        self._enterSandbox(true);
      });
    }

    _firstUnsolvedId() {
      if (!this.levelSet || !this.progress) return null;
      for (const l of this.levelSet) {
        if (!Progress.isSolved(this.progress, l.id)) return l.id;
      }
      return null;
    }

    _loadLevel(id) {
      const lvl = this.levelById[id];
      if (!lvl) return;
      this.mode = 'campaign';
      this.levelSpec = lvl;
      this.ws.graph = seedFromLevel(lvl);
      this.ws.history = History.create(this.ws.graph);
      this.ws.selection = { nodes: {}, wires: {} };
      this.ws.pendingWire = null;
      this.ws.boxSelect = null;
      this.tick = 0;
      this.playing = false;
      this._lastStatus = null;
      this._sparks.length = 0;
      this._rebuildSim();
      this.setHud('<span>Sand — <b>' + (lvl.title || lvl.id) + '</b> · ' + (lvl.brief || '') + '</span>');
      this._refreshUI();
    }

    _resetCurrent() {
      if (this.mode === 'sandbox') {
        this.ws.graph = seedDemoGraph();
      } else if (this.levelSpec) {
        this.ws.graph = seedFromLevel(this.levelSpec);
      } else {
        this.ws.graph = Model.create();
      }
      this.ws.history = History.create(this.ws.graph);
      this.ws.selection = { nodes: {}, wires: {} };
      this.ws.pendingWire = null;
      this.ws.boxSelect = null;
      this.tick = 0;
      this.playing = false;
      this._lastStatus = null;
      this._sparks.length = 0;
      this._rebuildSim();
      this._refreshUI();
    }

    _nextLevel() {
      if (!this.levelSet || !this.levelSet.length) return;
      // Prefer the first unsolved level; if none, advance ordinally from current.
      const unsolved = this._firstUnsolvedId();
      if (unsolved && unsolved !== (this.levelSpec && this.levelSpec.id)) {
        this._loadLevel(unsolved);
        return;
      }
      const cur = this.levelSpec && this.levelSpec.id;
      const i = this.levelSet.findIndex((l) => l.id === cur);
      const next = this.levelSet[(i + 1) % this.levelSet.length];
      if (next) this._loadLevel(next.id);
    }

    _toggleSandbox() {
      if (this.mode === 'sandbox') {
        const startId = this._firstUnsolvedId() || (this.levelSet && this.levelSet[0] && this.levelSet[0].id);
        if (startId) this._loadLevel(startId);
        else this._refreshUI();
      } else {
        this._enterSandbox(false);
      }
    }

    _enterSandbox(seed) {
      this.mode = 'sandbox';
      this.levelSpec = PLACEHOLDER_LEVEL;
      if (seed) this.ws.graph = seedDemoGraph();
      this.ws.history = History.create(this.ws.graph);
      this.ws.selection = { nodes: {}, wires: {} };
      this.ws.pendingWire = null;
      this.ws.boxSelect = null;
      this.tick = 0;
      this.playing = false;
      this._lastStatus = null;
      this._sparks.length = 0;
      this._rebuildSim();
      this.setHud('<span>Sand — sandbox · drag chips, wire pins, click Test</span>');
      this._refreshUI();
    }

    _refreshUI() {
      const lvl = this.levelSpec;
      const stars = (this.progress && lvl && this.mode === 'campaign')
        ? Progress.getStars(this.progress, lvl.id)
        : 0;
      if (this.ui && this.ui.brief && this.ui.brief.update) {
        this.ui.brief.update({
          level: this.mode === 'campaign' ? lvl : null,
          mode: this.mode,
          stars,
          status: this._lastStatus,
        });
      }
      if (this.ui && this.ui.topbar && this.ui.topbar.update) {
        const breadcrumb = this.mode === 'sandbox'
          ? 'Sandbox'
          : ('Layer 1 ▸ ' + (lvl && lvl.title ? lvl.title : '…'));
        const solved = {};
        if (this.progress && this.levelSet) {
          for (const l of this.levelSet) solved[l.id] = Progress.getStars(this.progress, l.id);
        }
        this.ui.topbar.update({
          tick: this.tick,
          stars: '★'.repeat(stars) + '☆'.repeat(Math.max(0, 3 - stars)),
          breadcrumb,
          levels: this.levelSet || [],
          solved,
          currentId: lvl && lvl.id,
          sandbox: this.mode === 'sandbox',
        });
      }
    }

    _rebuildSim() {
      if (!Sim) return;
      this.sim = Sim.create(this.ws.graph);
      for (const id of Object.keys(this.ws.graph.nodes)) {
        const n = this.ws.graph.nodes[id];
        if (n.type === 'pad_in' && n.props && n.props.label) {
          this.sim.setInput(n.props.label, n.props.value === 1 ? 1 : 0);
        }
      }
      this.sim.run({ maxTicks: 32 });
    }

    _layout() {
      const c = this.canvas;
      const left = c.offsetLeft;
      const top  = c.offsetTop;
      const w = c.clientWidth || c.width;
      const h = c.clientHeight || c.height;
      if (this.ui.topbar && this.ui.topbar.setBounds) this.ui.topbar.setBounds(left, top, w);
      if (this.ui.palette && this.ui.palette.setPosition) this.ui.palette.setPosition(left + 8, top + 56);
      if (this.ui.iopanel && this.ui.iopanel.setPosition) this.ui.iopanel.setPosition(left + w - 208, top + 56);
      if (this.ui.brief && this.ui.brief.setPosition) this.ui.brief.setPosition(left + 180, (window.innerHeight - (top + h)) + 8);
    }

    update(dt) {
      this._lastDt = dt;
      if (this.playing && this.sim) {
        this._playAccum += dt;
        while (this._playAccum >= 0.1) {
          this._playAccum -= 0.1;
          this.sim.step();
          this.tick += 1;
          if (this._pushScope) this._pushScope();
        }
      }
      if (this._sparks.length) {
        const alive = [];
        for (const s of this._sparks) {
          s.age += dt;
          if (s.age >= s.life) continue;
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          s.vx *= 0.94;
          s.vy *= 0.94;
          alive.push(s);
        }
        this._sparks = alive;
      }
      const signals = {};
      if (this.sim) {
        for (const id of Object.keys(this.ws.graph.nodes)) {
          const n = this.ws.graph.nodes[id];
          const entry = {};
          const proto = NDP.Sand.Primitives && NDP.Sand.Primitives[n.type];
          if (proto) {
            for (const pin of proto.pins.out) entry[pin] = this.sim.getSignal(id, pin);
            for (const pin of proto.pins.in)  entry[pin] = this.sim.getSignal(id, pin);
          }
          signals[id] = entry;
        }
      }
      this.ws.signals = signals;
      if (this.ui && this.ui.iopanel) {
        this.ui.iopanel.update({ graph: this.ws.graph, signals, playing: this.playing, tick: this.tick });
      }
      if (this.ui && this.ui.topbar) {
        this.ui.topbar.update({ tick: this.tick });
      }
    }

    render(ctx) {
      Render.draw(ctx, {
        graph: this.ws.graph,
        camera: this.ws.camera,
        viewport: { w: W, h: H },
        signals: this.ws.signals,
        selection: this.ws.selection,
        pendingWire: this.ws.pendingWire,
        boxSelect: this.ws.boxSelect,
        dt: this._lastDt || 0,
        scope: this.scopeHistory,
        flash: this._flash,
      });
      if (this._sparks.length) {
        const cam = this.ws.camera;
        const vp = { w: W, h: H };
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const s of this._sparks) {
          const sx = (s.x - cam.x) * cam.zoom + vp.w / 2;
          const sy = (s.y - cam.y) * cam.zoom + vp.h / 2;
          const a = Math.max(0, 1 - s.age / s.life);
          ctx.fillStyle = 'hsla(' + s.hue + ',100%,65%,' + (a * 0.8).toFixed(3) + ')';
          ctx.beginPath();
          ctx.arc(sx, sy, 3 + 4 * a, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    onEnd() {
      if (this._workspace) { this._workspace.destroy(); this._workspace = null; }
      if (this._onCanvasMove) this.canvas.removeEventListener('mousemove', this._onCanvasMove);
      if (this._onResize) window.removeEventListener('resize', this._onResize);
      if (this.ui) {
        for (const k of Object.keys(this.ui)) {
          const u = this.ui[k];
          if (u && u.destroy) u.destroy();
        }
        this.ui = null;
      }
      removeCss();
    }
  }

  NDP.attachGame('sand', SandGame);
})();
