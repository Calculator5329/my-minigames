# Sand Cartridge — Ship Status (2026-04-19)

## Summary

The `sand` cartridge is ready to ship. All 10 Layer-1 campaign levels validate
and their bundled `referenceSolution` graphs pass the truth-table runner at
`maxTicks=128`. All 75 Node unit tests (sim/model/compile/progress/levelrun/
analyze/camera/primitives/levels/undo/smoke) are green. Polish features
(hex lattice, signal-flow particles, oscilloscope, pass-celebration flash)
are wired in `render.js`, coins are awarded on solve via
`NDP.Engine.Storage.addCoins`, and progress persists through
`Storage.getGameData('sand')`.

## Ship Checklist

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | Cartridge appears in arcade selector with animated preview | PASS | `games/sand/manifest.js` (200 lines, non-trivial `previewDraw` at L9); `index.html:123` loads manifest |
| 2 | Layer 1 campaign playable (10 levels) | PASS | `games/sand/data/levels/index.json` lists 10 files; `node scripts/sand-selftest.mjs` → 10/10 pass |
| 3 | Progress persists across reload | PASS | `games/sand/game.js:96` uses `Progress.init({ storage: NDP.Engine.Storage })` |
| 4 | Sandbox mode available | PASS | `games/sand/game.js:21` seeds `sandbox-or` demo graph via `seedDemoGraph()` |
| 5 | Signal-flow particles, oscilloscope, pass celebration, hex grid render | PASS | `games/sand/lib/render.js` contains `lattice`(2), `particle`(12), `oscilloscope`(2), `flash`(11) |
| 6 | Coins award on solve | PASS | `games/sand/game.js:254` and `:315` call `NDP.Engine.Storage.addCoins(...)` |
| 7 | `node --test` passes every sim/model/compile/progress test | PASS | `node --test games/sand/test/*.test.mjs` → `# pass 75 # fail 0` |
| 8 | `node scripts/sand-selftest.mjs` passes every level | PASS | Script exits 0; prints `10/10 levels passed` |

## Deferred / Known Gaps for v1.1

- No Layer-2 (clocked/flip-flop) content yet — cartridge is Layer-1 only.
- Star scoring is wired (`LevelRun.score`) but no in-game UI surfaces per-level
  star counts beyond the topbar at solve time; a campaign grid view could
  aggregate totals.
- `referenceSolution` graphs were emitted by the auto-generator with
  `x=0, y=0` for every node (layout is cosmetic; runtime is unaffected).
- Self-test only checks reference solutions; it does not fuzz alternate graphs.

## How to Run the Tests

```
node --test games/sand/test/*.test.mjs
node scripts/sand-selftest.mjs
```

Both commands must exit 0.

## How to Play

Open `index.html` in a browser and click the **Sand** card in the arcade
selector. The campaign starts at `L1_01 Buffer`; sandbox mode is reachable
from the selector.
