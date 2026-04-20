(function () {
  const NDP = window.NDP;
  const O   = NDP.Sand;
  const BaseGame = NDP.Engine.BaseGame;
  const Storage  = NDP.Engine.Storage;

  class SandGame extends BaseGame {
    constructor(canvas, manifest) {
      super(canvas, manifest);
      this.sfx = this.makeSfx({
        place: { freq: 440, dur: 0.05, wave: 'triangle', vol: 0.15 },
        wire:  { freq: 660, dur: 0.04, wave: 'sine',     vol: 0.12 },
        pass:  { freq: 880, dur: 0.25, wave: 'square',   vol: 0.20 },
        fail:  { freq: 140, dur: 0.20, wave: 'sawtooth', vol: 0.25 }
      });
      this.selection = new Set();
      this.hoverId = null;
      this.camera = { x: 0, y: 0, zoom: 1.0 };
      this.brief = { visible: true };
      this.mode = 'build'; // 'build' | 'run' | 'test'
      this.testState = { rowsPassed: 0, rowsTotal: 0, failIndex: -1 };
      this.customComponents = []; // [{ id, name }]
      this.dragGhost = null;
      this.dragWire  = null;
      this.circuit = O.Model.Circuit();
      this.level = null;       // current level object
      this.graph = null;       // compiled Sim graph
      this.tracks = null;
      this.allLevels = [];
      this.stars = 0;
      this.tickCount = 0;
      this._clkState = 0;
      this._dataLoaded = false;
      this._assetsDir = 'games/sand/data';
    }

    async init() {
      // Bind progress to real storage.
      if (Storage) O.Progress.bindStorage(Storage);

      // Load gates + tracks + levels.
      const [gatesJson, tracksJson] = await Promise.all([
        fetch(this._assetsDir + '/gates.json?v=2').then(r => r.json()),
        fetch(this._assetsDir + '/tracks.json?v=2').then(r => r.json())
      ]);
      O.Gates.loadPrimitives(gatesJson);
      this.tracks = tracksJson;

      // Levels: in browser we can't listDir, so discover via a manifest embedded
      // in tracks.json (add `tracks[].levels: [filename,...]`) OR via a levels
      // index. For Phase 1 we will discover by convention: tracks.json may list
      // per-track ids; fetch each.
      const levelIndex = await fetch(this._assetsDir + '/levels/index.json?v=2')
        .then(r => r.json())
        .catch(() => ({ levels: [] }));
      const levelPromises = (levelIndex.levels || []).map(path =>
        fetch(this._assetsDir + '/levels/' + path + '?v=2').then(r => r.json())
      );
      this.allLevels = (await Promise.all(levelPromises)).sort((a, b) => {
        if (a.track !== b.track) return this._trackOrder(a.track) - this._trackOrder(b.track);
        return a.order - b.order;
      });

      this._dataLoaded = true;
      this._loadLevel(this.allLevels[0]);
      this._setupInput();

      // One-shot reset banner.
      if (O.Progress.consumeReset()) {
        this.brief.visible = true;
        this.brief.resetNotice = 'Sand has been rebuilt — old progress was reset. Welcome to v2.';
      }
    }

    _trackOrder(id) {
      if (!this.tracks) return 0;
      const t = this.tracks.tracks.find(x => x.id === id);
      return t ? t.order : 999;
    }

    _loadLevel(level) {
      if (!level) return;
      this.level = level;
      this.circuit = O.Model.Circuit();
      this.selection.clear();
      this.hoverId = null;
      this.brief.visible = true;
      this.mode = 'build';
      this.testState = { rowsPassed: 0, rowsTotal: (level.truthTable || []).length, failIndex: -1 };
      this.stars = O.Progress.starsFor(level.id);
      this.tickCount = 0;
      this._seedIO();
      this._rebuildGraph();
      this.setHud(this._breadcrumb());
    }

    _breadcrumb() {
      if (!this.level) return 'sand';
      return 'sand \u25b8 ' + this.level.track + ' \u25b8 ' + this.level.title;
    }

    _seedIO() {
      // Place labeled INPUT + OUTPUT nodes on the left and right edges of the workspace.
      const L = this.level;
      const inputs  = L.io.inputs, outputs = L.io.outputs;
      const wsX = 220, wsW = 500, wsY = 36, wsH = 564;
      const leftX  = wsX + 60;
      const rightX = wsX + wsW - 60;
      const spacing = Math.min(90, (wsH - 60) / Math.max(inputs.length, outputs.length, 1));
      inputs.forEach((p, i) => {
        O.Model.addNode(this.circuit, 'INPUT',
          Math.round(leftX / 20) * 20,
          Math.round((wsY + 60 + i * spacing) / 20) * 20,
          { label: p.label, value: 0 });
      });
      outputs.forEach((p, i) => {
        O.Model.addNode(this.circuit, 'OUTPUT',
          Math.round(rightX / 20) * 20,
          Math.round((wsY + 60 + i * spacing) / 20) * 20,
          { label: p.label });
      });
    }

    _rebuildGraph() {
      try { this.graph = O.Sim.build(this.circuit); }
      catch (e) { this.graph = null; this._lastError = String(e.message || e); }
    }

    _setupInput() {
      this.inputWorkspace = O.InputWorkspace.create({
        canvas: this.canvas,
        getState: () => ({ circuit: this.circuit, camera: this.camera, mode: this.mode }),
        onChange: (c) => { this.circuit = c; this._rebuildGraph(); },
        onPanZoom: (cam) => { this.camera = cam; },
        onSelect: (sel) => { this.selection = sel; },
        onDragGhost: (g) => { this.dragGhost = g; },
        onDragWire:  (w) => { this.dragWire = w; },
        onInputToggle: (nodeId) => {
          const n = this.circuit.nodes.find(x => x.id === nodeId);
          if (!n) return;
          n.props.value = n.props.value ? 0 : 1;
          this._rebuildGraph();
        }
      });
    }

    update(dt) {
      if (!this._dataLoaded) return;
      // Read live inputs from INPUT nodes and tick the sim every frame so
      // downstream visuals reflect truth. Sequential updates require a CLOCK.
      if (!this.graph) return;
      const inputs = {};
      for (const n of this.circuit.nodes) {
        if (n.type === 'INPUT') inputs[n.props.label] = n.props.value | 0;
      }
      inputs.__clk = this.mode === 'run' ? ((this.tickCount / 30) | 0) & 1 : 0;
      O.Sim.tick(this.graph, inputs);
      this.tickCount++;
    }

    render(ctx) {
      const g = ctx;
      // Clear whole canvas.
      g.fillStyle = '#0a0f1a';
      g.fillRect(0, 0, this.w, this.h);

      // Workspace region = 220..720 x 36..600
      const wsX = 220, wsY = 36, wsW = 500, wsH = 564;
      g.save();
      g.beginPath();
      g.rect(wsX, wsY, wsW, wsH);
      g.clip();

      // Render circuit. Shift camera so (0,0) world -> (wsX+wsW/2, wsY+wsH/2).
      // Simplest: pass a virtual camera to Render that includes the ws offset.
      if (O.Render && O.Render.draw) {
        const cam = {
          x: this.camera.x - wsX,
          y: this.camera.y - wsY,
          zoom: this.camera.zoom,
          _vw: wsW, _vh: wsH, _offsetX: wsX, _offsetY: wsY
        };
        // If the renderer doesn't honor _offsetX/Y, translate here.
        g.translate(wsX, wsY);
        O.Render.draw(g, {
          circuit: this.circuit,
          graph: this.graph,
          camera: { x: this.camera.x, y: this.camera.y, zoom: this.camera.zoom, _vw: wsW, _vh: wsH },
          canvasW: wsW, canvasH: wsH,
          hover: this.hoverId ? { kind: 'node', nodeId: this.hoverId } : null,
          selection: this.selection,
          dragGhost: this.dragGhost,
          dragWire:  this.dragWire
        });
      }
      g.restore();

      // UI overlays.
      O.UI.Topbar.draw(g, this);
      O.UI.Palette.draw(g, this);
      O.UI.IOPanel.draw(g, this);
      if (this.brief && this.brief.visible) O.UI.Brief.draw(g, this);

      // Error banner (sim cycle).
      if (this._lastError && !this.graph) {
        g.fillStyle = 'rgba(255, 85, 102, 0.3)';
        g.fillRect(wsX, wsY + wsH - 28, wsW, 20);
        g.fillStyle = '#fff';
        g.font = 'bold 11px ui-monospace, monospace';
        g.textAlign = 'center';
        g.fillText(this._lastError, wsX + wsW / 2, wsY + wsH - 14);
      }
    }

    handleClick(mx, my) {
      // Route in Z-order.
      if (this.brief && this.brief.visible) {
        if (O.UI.Brief.handleClick(mx, my, this)) return;
      }
      if (O.UI.Topbar.handleClick(mx, my, this))  return;
      if (O.UI.Palette.handleClick(mx, my, this)) return;
      if (O.UI.IOPanel.handleClick(mx, my, this)) return;
      // Otherwise canvas click — InputWorkspace handles pointer events directly.
    }

    // Action dispatchers (called by UI modules).
    doReset() { this._loadLevel(this.level); }
    doStep()  {
      if (!this.graph) return;
      const inputs = {};
      for (const n of this.circuit.nodes) if (n.type === 'INPUT') inputs[n.props.label] = n.props.value | 0;
      inputs.__clk = this._clkState; this._clkState = this._clkState ? 0 : 1;
      O.Sim.tick(this.graph, inputs);
    }
    doRun()   { this.mode = this.mode === 'run' ? 'build' : 'run'; }
    doTest()  {
      const res = O.Levelrun.run({ circuit: this.circuit, level: this.level, Sim: O.Sim });
      this.testState = {
        rowsPassed: res.rowsPassed | 0,
        rowsTotal: res.rowsTotal | 0,
        failIndex: res.pass ? -1 : (res.firstFail && res.firstFail.row) | 0
      };
      if (res.pass) {
        const gc = O.Analyze.gateCount(this.circuit);
        const stars = O.Analyze.starFor(gc, this.level.parGates);
        this.stars = O.Progress.recordSolve(this.level.id, stars);
        if (this.level.unlocksComponent) O.Progress.unlock(this.level.unlocksComponent.id);
        this.flash('#ffd86b', 0.4);
        this.sfx.play('pass');
      } else {
        this.flash('#ff5566', 0.3);
        this.sfx.play('fail');
      }
    }
    doSave()  { /* future: export JSON */ }
    doHelp()  { this.brief.visible = !this.brief.visible; }
    doBack()  {
      // Advance to next level OR return to arcade — simplest: cycle to next.
      const idx = this.allLevels.findIndex(l => l.id === this.level.id);
      if (idx >= 0 && idx + 1 < this.allLevels.length) this._loadLevel(this.allLevels[idx + 1]);
    }
    doToggleInput(label) {
      const n = this.circuit.nodes.find(x => x.type === 'INPUT' && x.props.label === label);
      if (!n) return;
      n.props.value = n.props.value ? 0 : 1;
      this._rebuildGraph();
    }

    onInput(ev) {
      if (ev.type === 'click') this.handleClick(ev.x, ev.y);
    }
  }

  NDP.attachGame('sand', SandGame);
})();
