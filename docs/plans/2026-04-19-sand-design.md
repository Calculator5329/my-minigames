# Sand — Design Doc

**Date:** 2026-04-19
**Cartridge id:** `sand`
**Tagline:** *From sand to CPU.*
**One-liner:** A node-graph circuit sandbox that starts at the switch/transistor level and climbs, layer by layer, to a programmable computer. Each solved puzzle becomes a reusable black-box component in the next layer.

---

## 1. Scope & staging

Sand ships in **layers**. Each layer is a self-contained campaign plus a sandbox. Later layers reuse components earned in earlier ones. Only Layer 1 is committed as initial scope; the schema is designed so Layers 2–6 slot in without refactor.

| Layer | Name           | Primitives available                     | Outcome                       |
|------:|----------------|------------------------------------------|-------------------------------|
| 1     | **Doping**     | Wire, Switch (transistor), Pad, Power, Clock | Build NOT/AND/OR/NAND/NOR/XOR |
| 2     | **Arithmetic** | L1 + earned gates                         | Half-adder, full-adder, 4-bit adder, comparator, mux/demux |
| 3     | **Memory**     | L2 + clock-edge logic                     | SR latch, D flip-flop, register, 16-byte RAM |
| 4     | **Arch**       | L3 components                             | ALU, program counter, decoder |
| 5     | **CPU**        | L4 components                             | 4-bit CPU (toy ISA, ~8 opcodes) |
| 6     | **Software**   | Final CPU as a device                     | Write assembly; run it; beat program-golf puzzles |

**Only Layer 1 is in v1 scope.** Everything below must support the rest without breakage.

---

## 2. Cartridge format

Lives at `games/sand/` alongside the others:

```
games/sand/
  manifest.js          // registerManifest — id, title, blurb, previewDraw
  game.js              // BaseGame subclass, mounts the circuit editor
  data/
    components.json    // stock primitives (switch, pad, wire, clock, power)
    layers.json        // layer metadata (id, name, unlock rule)
    levels/
      L1_01_not.json   // one file per puzzle
      L1_02_and.json
      ...
  README.md
```

**Persistent state** uses the existing `Storage.getGameData('sand')` / `setGameData` / `mergeGameData` API. Shape:

```jsonc
{
  "version": 1,
  "currentLayer": "L1",
  "solvedLevels": { "L1_01_not": { "ticks": 6, "gates": 2, "stars": 3 } },
  "unlockedComponents": ["not", "and", "or"],          // from auto-compile on solve
  "savedCircuits": [                                   // player-named custom blackboxes
    { "id": "my_xor", "name": "My XOR", "graph": {...}, "io": {...} }
  ],
  "sandbox": { "L1": { "graph": {...} } },
  "settings": { "gridSnap": true, "wireStyle": "orthogonal" }
}
```

Static level data ships as JSON under `data/levels/` and is fetched lazily on mount.

---

## 3. Simulation model

**Node graph, tick-based, event-driven.**

- **Graph** = nodes + edges. Nodes are components (primitives or compiled black boxes). Edges are wires between named pins.
- **Tick** = one discrete simulation step. Every 2-input gate evaluates in 1 tick. A compiled black box reports its *internal* tick depth so puzzle scoring can count true gate-level propagation.
- **Clock** is a primitive that toggles every N ticks. The clock drives layers 3+ but exists from layer 1 (ignored by most early puzzles).
- **Evaluation** = dirty-flagged BFS from changed inputs. When a pin changes, enqueue downstream nodes; process until stable or tick budget elapsed. Oscillators are allowed — sim continues to run, UI shows the oscillation.

**Primitive set (Layer 1):**
| Primitive | Pins                    | Behavior                                           |
|-----------|-------------------------|----------------------------------------------------|
| `power`   | out                     | Always high (1).                                   |
| `ground`  | out                     | Always low (0).                                    |
| `switch`  | gate, in, out           | If `gate` is high, `out = in`; else `out` = floating (treated as 0 with pull-down). This is the n-type transistor abstraction — enough to build NAND and everything else. |
| `pad_in`  | out                     | Test harness input.                                |
| `pad_out` | in                      | Test harness output.                               |
| `clock`   | out, period (prop)      | Square wave, configurable period.                  |
| `wire`    | (edge, not a node)      | Zero delay; joins with auto-bus when crossed.      |

From `switch + power + ground` the player can construct NOT, then NAND, then everything else. This is the spiritual equivalent of NandGame's opening but one rung lower — you see *why* a NAND is a NAND.

**Compiled components:** once a level is solved, the solution graph is frozen into a black-box node with:
- Declared inputs/outputs (from the level spec).
- Internal graph (stored for visualization on double-click → "peek inside").
- Declared tick-depth = longest path through internal gates.

Player-saved circuits go through the same compiler.

---

## 4. Puzzle format

Each level file:

```jsonc
{
  "id": "L1_03_and",
  "layer": "L1",
  "order": 3,
  "title": "AND",
  "brief": "Output high only when both inputs are high.",
  "allowedComponents": ["switch", "power", "ground", "pad_in", "pad_out", "wire", "not"],
  "io": { "inputs": ["A", "B"], "outputs": ["Y"] },
  "truthTable": [
    { "in": [0,0], "out": [0] },
    { "in": [0,1], "out": [0] },
    { "in": [1,0], "out": [0] },
    { "in": [1,1], "out": [1] }
  ],
  "starGoals": {
    "gates": { "3star": 2, "2star": 4 },
    "ticks": { "3star": 2, "2star": 4 }
  },
  "unlocksComponent": { "id": "and", "name": "AND", "icon": "and.svg" }
}
```

**Test runner** walks every row of the truth table, drives the inputs, steps the sim until stable or tick budget exhausted, and compares outputs. Pass = all rows match. Stars are awarded on gate count and tick depth.

**Sandbox** mode is a separate workspace per layer, with all currently unlocked components available. Graphs save automatically to `sandbox[layer].graph`.

---

## 5. UI / Layout (HTML overlays on canvas)

The canvas is the **workspace** (circuit editor). DOM overlays sit on top for palette, toolbar, IO panel, level brief:

```
┌───────────────────────────────────────────────────────────────┐
│  [≡]  sand ▸ Layer 1 ▸ L1_03 AND             ticks: 12  ☆☆☆  │   ← top bar
├──────────┬────────────────────────────────────────┬───────────┤
│ PALETTE  │                                        │   I/O     │
│  ┌─────┐ │                                        │  A ●──▶   │
│  │ sw  │ │         (canvas workspace)             │  B ●──▶   │
│  │ not │ │          grid + nodes + wires          │  Y  ◀──●  │
│  │ and │ │                                        │           │
│  │ ... │ │                                        │  ▶ TEST   │
│  └─────┘ │                                        │  ⟳ STEP   │
├──────────┴────────────────────────────────────────┴───────────┤
│  BRIEF: Output high only when both inputs are high.           │   ← collapsible
└───────────────────────────────────────────────────────────────┘
```

- **Palette** (left): draggable component chips, grouped by primitive / earned / saved.
- **I/O panel** (right): pad drivers, test/step/run controls, truth-table progress.
- **Top bar**: breadcrumb, stats, menu.
- **Brief**: level description, collapsible.

Overlays are absolute-positioned divs; the canvas underneath owns all interaction inside the workspace rect.

---

## 6. Graphics — the cool part

**Aesthetic goal:** a luminous silicon-wafer look. Think *TRON meets a real oscilloscope*. Every rule below is achievable in the existing canvas pipeline.

### Workspace background
- Deep near-black base (`--bg`).
- **Silicon-lattice grid**: hex dots on a triangular grid, faint, parallax-drifting with the camera.
- **Wafer veins**: a few low-alpha sweeping curves in the accent color, drifting slowly.
- **Scanline sweep**: a subtle vertical line sweeps across once every ~8 s, brightening gates it passes.

### Wires
- **Signal flow as particles**: when a wire carries `1`, emit small bright quanta that travel along its path at a speed tied to tick rate. The *color* of the quantum matches the signal's logical source (so you can trace which input drove what). Wires at `0` are dim blue-grey.
- **Bloom**: active wires use additive compositing with a glow halo.
- **Orthogonal routing** with rounded corners; option for diagonal.
- **Junctions** auto-dot; crossings show a hop-arc when no junction.

### Gates / nodes
- Rendered as beveled plates with an **inset etched glyph** (IEEE-style gate shape for derived gates, schematic symbols for primitives).
- Active output pin pulses with a soft corona.
- Black-box components get a **holographic shimmer** — a subtle animated gradient across their face — to distinguish them from primitives.
- Selected node: concentric ring pulse, accent color.
- Errors (short-circuit, disconnected required pin): low-frequency red warning throb.

### Clock & timing
- A small **oscilloscope strip** appears along the bottom edge of the workspace when a clock is present, drawing the last 64 ticks as a waveform. Multiple traces overlay in different accent colors, like a real logic analyzer.

### Test feedback
- On truth-table test, each row evaluated lights a column of LEDs along the top-right; green for match, red for miss, with a **sonar ping** on each row.
- On full pass: the wafer background pulses gold, a shower of sparks spawns from `pad_out`, and the next component "etches" into the palette with a shader-like mask reveal.

### "Peek inside" zoom
- Double-clicking a compiled black box plays a smooth zoom animation into its internal graph, so the player can always see how their own tower was built. Escape zooms back out. This is the signature move of the game.

All effects are opt-outable via a `--fx` quality setting (low/med/high) to keep perf solid on laptops.

---

## 7. Controls

| Action                   | Input                            |
|--------------------------|----------------------------------|
| Pan                      | Middle-drag, or Space + drag     |
| Zoom                     | Wheel                            |
| Place component          | Drag from palette, or `Q/W/E/R` hotkeys |
| Wire                     | Click output pin → click input pin |
| Delete                   | Select + Del/Backspace           |
| Box select               | Left-drag empty space            |
| Tick once                | `.`                              |
| Run / pause              | Space                            |
| Test truth table         | `T` or the TEST button           |
| Peek inside black box    | Double-click, or `Enter`         |
| Save as component        | `Ctrl+S` from a working design   |
| Undo / redo              | `Ctrl+Z` / `Ctrl+Shift+Z`        |

---

## 8. Arcade integration

- Solving a level awards coins via `Storage.addCoins`. Coins scale with stars (e.g. 10/20/35).
- First-time completion of each **layer finale** (the compile-the-layer capstone puzzle) unlocks a cosmetic arcade theme (e.g. "Wafer" theme on L2 finale).
- The cartridge `previewDraw` shows a tiny animated adder with particles flowing along its wires — instantly communicates the concept on the selector screen.

---

## 9. Module layout inside `game.js`

To keep the file tractable, split by concern as internal IIFE modules (same file is fine; multi-file is fine too):

- **`model/`** — graph data structures, immutable ops for undo/redo.
- **`sim/`** — tick scheduler, primitive evaluators, tick-depth analyzer.
- **`compile/`** — black-box compilation, component registry.
- **`test/`** — truth-table runner, star scorer.
- **`view/`** — canvas renderer, particle system, effects.
- **`ui/`** — DOM overlay controllers (palette, IO panel, top bar, brief).
- **`levels/`** — level loader, progression gate.

---

## 10. Error handling

- **Invalid graphs** (unconnected required pins, short power↔ground) detected at test-time; surfaced as a red throb on offending node + toast in the I/O panel.
- **Oscillators** allowed and visually honored; test runner fails that row with a clear "did not settle" message.
- **Schema drift** in saved game data: version field gates migrations; unknown future versions load read-only with a banner.
- **JSON load failures** for levels: fall back to an error card in the level list rather than crashing the cartridge.

---

## 11. Testing plan

- **Pure-function sim tests** (run under Node): for a known graph and input sequence, assert tick-by-tick outputs. Table-driven.
- **Level self-tests**: each level JSON ships with a reference solution graph. CI (or a local script) loads every level and confirms its reference solves it, preventing unsolvable shipments.
- **Schema tests**: validate every level and every saved-game migration against a JSON schema.
- **UI smoke**: a hand-driven checklist per layer (place, wire, delete, undo, test, save-as, peek).

---

## 12. Out of scope for v1 (Layer 1 only)

- Layers 2–6 (designed-for but not built).
- Multi-bit buses as a first-class concept (wires stay 1-bit; buses emerge as bundles in later layers).
- Import/export of circuits as files (localStorage only).
- Multiplayer / sharing.
- Analog behavior beyond the switch abstraction.

---

## 13. Open risks

1. **Perf of the particle-flow effect** at scale. Mitigation: quality tiers, pool particles, draw wires to an offscreen buffer between topology changes.
2. **Discoverability of the switch primitive.** If players don't grok that `switch + power/ground` → NOT, Layer 1 stalls at puzzle 1. Mitigation: puzzle 1 is scaffolded with a guided tutorial overlay, and a hint system reveals the NOT construction after two failed attempts.
3. **Save-data bloat** from storing every saved circuit's full graph. Mitigation: compress saved graphs with a simple run-length encoding of node/edge arrays; cap at N saved circuits with UI to prune.

---

## 14. Shippable v1 definition-of-done

- Cartridge registered, appears in the arcade selector with a live preview.
- Layer 1 campaign: 8–12 puzzles from NOT → XOR.
- Sandbox mode for Layer 1.
- Full visual spec from §6 at medium quality (low/high tiers can come post-ship).
- Save/load works; coin payout works; theme hook works.
- Self-test script passes for all shipped levels.
