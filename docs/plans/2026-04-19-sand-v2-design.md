# Sand v2 — Gate-Level Logic Builder — Design

Date: 2026-04-19
Status: approved

## Goal

Replace the current transistor-level Sand minigame with a gate-level
logic builder. Primitive gates (AND/OR/NOT/NAND/NOR/XOR/XNOR) are
drag-and-drop; the curriculum climbs from basic combinational logic
through arithmetic, muxing, encoding, comparison, sequential memory,
and finishes with a 4-bit ALU. Layout is rebuilt as a two-column
workspace so the canvas actually gets the screen.

## Decisions locked

| | |
|---|---|
| Sim engine | **Rewrite** — drop transistor `compile.js`/`sim.js`; new topo-sorted gate evaluator with sequential-state support |
| Organization | **Tracks** — 8 named tracks (Intro → ALU) gated by prior-track completion |
| Custom gates | **Yes** — solving a level adds its component to the palette for later levels |
| Star system | **Gates only** — 3★ ≤ par, 2★ ≤ par+1, 1★ any solution |
| Interaction | **Drag from palette** onto canvas; drag from output port to input port to wire |
| Old saves | **Wipe** with a one-time "Sand has been rebuilt" notice |
| Scope | One big rewrite; similar effort to orbital ramp-up (~3000 lines) |

## Curriculum (28 levels across 8 tracks)

### Track 1 — Intro (3)
1. **Wire It Up** — connect IN → OUT, no gates
2. **The Inverter** — IN → NOT → OUT
3. **And Logic** — (A, B) → AND → Y

### Track 2 — Combinational Basics (3)
1. **OR Logic** — (A, B) → OR → Y
2. **NAND** — (A, B) → NAND → Y
3. **NOR** — (A, B) → NOR → Y

*(XOR and XNOR unlock as buildable components in Arithmetic.)*

### Track 3 — Arithmetic (4)
1. **Half Adder** — (A, B) → (S, Cout). Unlocks `half_adder`.
2. **XOR Puzzle** — build XOR from AND/OR/NOT. Unlocks `xor`.
3. **Full Adder** — (A, B, Cin) → (S, Cout). Unlocks `full_adder`.
4. **4-Bit Adder** — (A[4], B[4]) → (S[4], Cout). Uses `full_adder`.

### Track 4 — Multiplexing (3)
1. **2:1 Mux** — (A, B, Sel) → Y. Unlocks `mux2`.
2. **4:1 Mux** — 4-input variant. Unlocks `mux4`.
3. **1:4 Demux** — inverse of Mux4. Unlocks `demux4`.

### Track 5 — Encoding (3)
1. **2-to-4 Decoder** — 2-bit sel → one-hot 4 outputs. Unlocks `dec24`.
2. **4-to-2 Encoder** — one-hot in → 2-bit sel.
3. **Priority Encoder** — 4-input, highest-index-wins.

### Track 6 — Comparison (3)
1. **Equality** — 2-bit A == B?
2. **Greater-Than** — 2-bit A > B?
3. **2-Bit Comparator** — (A, B) → (eq, lt, gt). Unlocks `cmp2`.

### Track 7 — Sequential (5)
1. **SR Latch** — (S, R) → Q using two NORs.
2. **D Latch** — (D, EN) → Q. Unlocks `dlatch`.
3. **D Flip-Flop** — (D, CLK) → Q. Unlocks `dff`.
4. **4-Bit Register** — 4 DFFs sharing CLK + write-enable.
5. **4-Bit Counter** — DFF feedback, CLK-driven, resets on R.

### Track 8 — ALU (4)
1. **2-Bit ALU** — (A[2], B[2], Op[2]) → (Y[2]). Op selects AND/OR/ADD/SUB.
2. **7-Segment Decoder** — 4-bit in → 7 segment outputs.
3. **4-Bit ALU** (finale) — (A[4], B[4], Op[2]) → (Y[4], Cout, Zero).

## Sim engine

### Evaluator

Gate-level; no bidirectional pins. Each tick:

1. For combinational gates, topologically sort by dependency and evaluate.
2. For sequential elements (latches, flip-flops), read inputs FIRST, compute next-state, apply AFTER combinational settle.
3. Detect cycles — sequential feedback is legal (through a latch/flip-flop); purely combinational cycles are flagged as an error.

Pseudocode:

```js
function tick(graph) {
  const order = topoSortCombinational(graph);  // ignores seq-element edges
  for (const gate of order) evalCombinational(gate);
  for (const seq of graph.sequential)  capturePreState(seq);
  for (const seq of graph.sequential)  commitNextState(seq);
  if (graph.hasComboCycle) throw new Error('combinational loop');
}
```

The engine lives in `games/sand/lib/sim.js`. It exports:

```js
Sim = {
  build(circuit) -> compiledGraph,
  tick(graph, inputsMap) -> outputsMap,
  reset(graph)
};
```

### Gate catalog (primitives)

```json
{
  "NOT":    { "inputs": 1, "outputs": 1, "fn": "!a" },
  "AND":    { "inputs": 2, "outputs": 1, "fn": "a & b" },
  "OR":     { "inputs": 2, "outputs": 1, "fn": "a | b" },
  "NAND":   { "inputs": 2, "outputs": 1, "fn": "~(a & b)" },
  "NOR":    { "inputs": 2, "outputs": 1, "fn": "~(a | b)" },
  "XOR":    { "inputs": 2, "outputs": 1, "fn": "a ^ b" },
  "XNOR":   { "inputs": 2, "outputs": 1, "fn": "~(a ^ b)" },
  "INPUT":  { "io": "in"  },
  "OUTPUT": { "io": "out" },
  "CLOCK":  { "io": "clk" },
  "CONST0": { "outputs": 1, "value": 0 },
  "CONST1": { "outputs": 1, "value": 1 }
}
```

Unlockable custom gates (from solved levels) look the same from the
sim's perspective — they carry an `impl: { nodes, wires }` which the
sim flattens at build time.

## Layout

Two-column workspace, CSS grid:

```
┌──────────────────── TOPBAR (40px) ───────────────────┐
│ sand ▸ arithmetic ▸ Half Adder    tick 3 ★★☆   Reset · Step · Run · Test · Save │
├─────────┬─────────────────────────────────────┬──────┤
│ PALETTE │                                     │ I/O  │
│  220px  │          CANVAS  (flex)             │ 240px│
│         │                                     │      │
│ Gates   │  ┌──────┐   ┌──────┐   ┌──────┐      │ INPUT│
│ NOT     │  │ A in │ → │ AND  │ → │ Y out│      │ A ⚫ │
│ AND     │  └──────┘   └──────┘   └──────┘      │ B ⚫ │
│ OR      │                                     │      │
│ NAND    │                                     │ OUT  │
│ NOR     │                                     │ Y ⚫ │
│ XOR     │                                     │      │
│ XNOR    │                                     │ TEST │
│         │                                     │ ○○○  │
│ Unlocks │                                     │      │
│ Half… 🔒│                                     │ Step │
│ Full… 🔒│                                     │ Run  │
│         │                                     │ Test │
└─────────┴─────────────────────────────────────┴──────┘
```

- Topbar: breadcrumb → next/prev arrows → level title → tick count +
  star state → action buttons. Sandbox entry is a button at the right.
- Palette: primitives at top, unlocked components below a divider.
  Each tile is a draggable handle.
- Canvas: dotted grid background; camera pans with right-drag or
  middle-drag; zoom wheel. Gates render with standard ANSI shapes
  (D-shape for AND, curved back for OR, bubble on outputs for NOT
  family).
- I/O panel: list of labeled input pads (click to toggle in build;
  auto-driven in Run/Test), output pads with indicator dots, current
  test row progress, control buttons (Step, Run, Test, Save As…).
- Brief card: on first entry to a level, a centered dismissible card
  with the brief text. "?" button in the topbar re-opens it.

## Star rules (F2)

- **1★** — truth table passes.
- **2★** — solved in ≤ (parGates + 1) gates.
- **3★** — solved in ≤ parGates gates.

`parGates` authored per level; counts all placed gates plus any
unlocked components placed (one custom gate counts as one regardless
of internal complexity — incentivizes using higher-level blocks).

## Data shape

### `games/sand/data/tracks.json`

```json
{
  "version": 1,
  "tracks": [
    { "id": "intro",       "title": "Intro",         "order": 1 },
    { "id": "combo",       "title": "Combinational", "order": 2 },
    { "id": "arithmetic",  "title": "Arithmetic",    "order": 3, "requires": "combo" },
    { "id": "mux",         "title": "Multiplexing",  "order": 4, "requires": "arithmetic" },
    { "id": "encoding",    "title": "Encoding",      "order": 5, "requires": "mux" },
    { "id": "comparison",  "title": "Comparison",    "order": 6, "requires": "encoding" },
    { "id": "sequential",  "title": "Sequential",    "order": 7, "requires": "comparison" },
    { "id": "alu",         "title": "ALU",           "order": 8, "requires": "sequential" }
  ]
}
```

### `games/sand/data/levels/<track>/<id>.json`

```json
{
  "id": "arithmetic-halfadder",
  "track": "arithmetic",
  "order": 1,
  "title": "Half Adder",
  "brief": "Compute sum (S) and carry (Cout) of A + B.",
  "hints": [
    "S is 1 when exactly one of A or B is 1 — that's XOR (or build it: (A OR B) AND NOT (A AND B)).",
    "Cout is the AND of A and B."
  ],
  "difficulty": 2,
  "prerequisites": ["combo-nor"],
  "availableGates": ["AND", "OR", "NOT", "NAND", "NOR"],
  "io": {
    "inputs":  [{ "label": "A" }, { "label": "B" }],
    "outputs": [{ "label": "S" }, { "label": "Cout" }]
  },
  "truthTable": [
    { "in": [0, 0], "out": [0, 0] },
    { "in": [0, 1], "out": [1, 0] },
    { "in": [1, 0], "out": [1, 0] },
    { "in": [1, 1], "out": [0, 1] }
  ],
  "parGates": 5,
  "unlocksComponent": { "id": "half_adder", "name": "Half Adder" }
}
```

`referenceSolution` may optionally be included for developer-side
verification; omitted in shipped files once `parGates` is tuned.

## File plan

### Delete
- `games/sand/lib/compile.js`
- `games/sand/lib/sim.js` (current transistor version)
- `games/sand/data/levels/L1_*.json` (all 10)
- `games/sand/test/sim.test.mjs` (current — will rewrite)
- `games/sand/test/compile.test.mjs` (current — will rewrite)

### Rewrite
- `games/sand/lib/sim.js` — gate-level evaluator
- `games/sand/lib/gates.js` (new; replaces `primitives.js`)
- `games/sand/lib/levels.js` — adjust validator to new schema
- `games/sand/lib/model.js` — node/wire data structures, trim transistor fields
- `games/sand/lib/render.js` — draw ANSI gate shapes, wires, ports
- `games/sand/lib/input-workspace.js` — drag-from-palette + port-drag
- `games/sand/lib/ui-palette.js` — two-column left rail, primitives + unlocks
- `games/sand/lib/ui-iopanel.js` — right rail
- `games/sand/lib/ui-topbar.js` — breadcrumb/controls
- `games/sand/lib/progress.js` — star thresholds, wipe-on-version-bump
- `games/sand/lib/levelrun.js` — truth-table driver
- `games/sand/lib/analyze.js` — cycle detection + gate counting
- `games/sand/lib/glyphs.js` — gate-shape glyphs
- `games/sand/lib/primitives.js` — DELETE (replaced by gates.js)
- `games/sand/game.js` — orchestrator, state machine
- `games/sand/sand.css` — CSS grid two-column layout

### Keep (light touch)
- `games/sand/lib/camera.js` — pan/zoom intact

### Data (28 new levels)
- `games/sand/data/tracks.json`
- `games/sand/data/gates.json` (primitive catalog)
- `games/sand/data/levels/intro/*.json` (3)
- `games/sand/data/levels/combo/*.json` (3)
- `games/sand/data/levels/arithmetic/*.json` (4)
- `games/sand/data/levels/mux/*.json` (3)
- `games/sand/data/levels/encoding/*.json` (3)
- `games/sand/data/levels/comparison/*.json` (3)
- `games/sand/data/levels/sequential/*.json` (5)
- `games/sand/data/levels/alu/*.json` (3)
- `games/sand/data/levels/index.json` (regenerated)

### Tests (rewrite)
- `games/sand/test/sim.test.mjs` — gate-level evaluator
- `games/sand/test/levels.test.mjs` — schema validation
- `games/sand/test/levelrun.test.mjs` — truth-table runner
- `games/sand/test/progress.test.mjs` — star thresholds
- Others: adjust or delete as obsolete (analyze, primitives, etc.)

## Progress wipe

On first load of the new version, check `Storage.getGameData('sand').version`. If `< 2`, wipe the `sand` game-data blob and show a one-time banner on the selector: "Sand has been rebuilt — old progress reset. The new curriculum starts at Intro → Wire It Up." Dismiss with a button click; never shown again.

Implementation: `lib/progress.js` sets `version: 2` on every save going forward, and a one-liner wipe function runs on module init.

## Acceptance criteria

- [ ] Selector card shows Sand with new theme/blurb; first level is
      "Wire It Up" (no gates needed)
- [ ] Drag a NOT from the palette onto the canvas places the gate
- [ ] Drag from an output port to an input port creates a wire;
      illegal wires (output→output, wrong types) get visual reject
- [ ] Clicking an input pad toggles it in build mode
- [ ] Run mode auto-drives inputs from the truth table; Test button
      reports pass/fail per row
- [ ] Unlocked components appear in the palette and can be dragged
      into later levels; they flatten correctly at sim build
- [ ] Sequential levels (SR Latch → D Flip-Flop → Counter) work under
      a CLOCK primitive; state carries across ticks
- [ ] Stars award correctly based on gate count vs parGates
- [ ] All 28 level JSONs validate; solutions exist that achieve 3★
- [ ] Old saves are wiped once on upgrade; notice shown exactly once
- [ ] No console errors across a full playthrough
- [ ] Sand tests pass under `node --test games/sand/test/*.test.mjs`

## Risks

- **Sequential sim** — D latches/flip-flops can exhibit glitches or
  oscillation if wired carelessly. Mitigation: seq elements use a
  capture-then-commit pattern so they can't race within a tick.
- **Drag-from-palette on canvas** — needs careful pointer-event
  handling. Mitigation: reference circuit-builder's React Flow
  behavior conceptually; implement the minimal subset in canvas.
- **Level authoring at scale** — 28 levels is a lot; some need
  careful `parGates` tuning. Mitigation: dev mode exposes a "compute
  par from reference solution" helper; levels ship with generous
  initial par that can tighten post-playtest.
- **Custom-gate flattening** — recursive inlining could blow the
  graph size. Mitigation: cap recursion depth, reject infinite
  nesting (a component can't contain itself).
- **CSS grid layout on small screens** — the two-column layout is
  tight below ~900px. Mitigation: minimum viewport enforced; below
  that, a "please use a larger screen" card (existing pattern in this
  codebase).
