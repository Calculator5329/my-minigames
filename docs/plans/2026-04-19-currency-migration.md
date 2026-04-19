# Per-game currency migration recipe

Reference implementation: `games/vaultbreaker/game.js`.
Engine helpers: `engine/storage.js` — `getGameWallet`, `addGameWallet`,
`spendGameWallet`, `setGameWallet`, `clearGameData`.

## The rule

Every game gets **one** persistent currency that is its own — call it the
"per-game wallet". It's stored under `Storage.*GameWallet(GAME_ID, ...)`,
namespaced by the game id, and **never** crosses with the global theme-shop
coins (`Storage.coins`).

Three hard rules:

1. **A game's shop / upgrade screen MUST spend the per-game wallet.** Never
   `Storage.spendCoins` / `Storage.getCoins` for in-game shopping. Those
   APIs are reserved for the global theme shop in `main.js` only.
2. **The global theme coins (`coinsEarned()`) MUST come from milestones,
   not from in-run currency pickups.** No more `floor(score / N)` if `score`
   is inflated by per-coin / per-pickup adds. Use level/wave/biome cleared,
   victory bonuses, etc.
3. **In-run currency that drives meta progression MUST persist between
   runs of that same game** via the wallet. If you collected 80 coins and
   died, the next run starts with 80.

## The five-step transform

For each game id `GID`:

### 1. Persist run-currency in the wallet

If the game has an in-run currency variable (often `coinsHeld`, `gold`,
`motes`, `tips`, `cash`):

```js
// init()
this.coinsHeld = Storage.getGameWallet('GID');

// every place it changes (pickup, shop spend, end-of-run):
Storage.setGameWallet('GID', this.coinsHeld);
// OR (cheaper, debounced): only at intermissions / end-of-run.
```

If the currency is purely run-internal (you don't want it to carry over,
e.g. a within-round economy like Orbital cash), then DON'T persist the
in-run var; instead award a derived amount to the wallet at end-of-run /
end-of-wave.

### 2. Shop spends the per-game wallet

Replace every:
```js
Storage.spendCoins(price);
Storage.getCoins() >= price;
Storage.addCoins(n);   // when used as a shop refund or shop-side add
```
…with:
```js
Storage.spendGameWallet('GID', price);
Storage.getGameWallet('GID') >= price;
Storage.addGameWallet('GID', n);
```

The shop UI must show the per-game wallet, not the global one.

### 3. Decouple `coinsEarned()` from in-run currency

Old (leaky):
```js
coinsEarned(score) { return Math.max(0, Math.floor(score / 60)); }
```

New (milestone-based, examples):
```js
// wave-based games
coinsEarned() {
  const wavesCleared = this.wavesClearedThisRun | 0;
  const winBonus = this.victoryAchieved ? 20 : 0;
  return wavesCleared * 3 + winBonus;
}

// biome / chapter games
coinsEarned() {
  const biome = this.biomesClearedThisRun | 0;
  return biome * 8 + (this.victoryAchieved ? 25 : 0);
}

// level-based
coinsEarned() {
  return (this.levelsClearedThisRun | 0) * 4 + (this.victoryAchieved ? 20 : 0);
}
```

Calibrate so a typical run earns **5–15** theme coins (themes cost 150-600).
A perfect run / victory should hit 25–50 theme coins.

### 4. Track milestone counters during the run

Add `this.wavesClearedThisRun = 0;` (or similar) in `init()`. Increment
at the right point in update logic. Set `this.victoryAchieved = true;`
when the win condition triggers, BEFORE calling `this.win()` so
`coinsEarned()` (called from `main.js`'s `showEndOverlay`) sees it.

### 5. Custom localStorage migration (only if applicable)

Games that wrote their own `localStorage` blobs (`bulwark_v1`,
`ndp.lth_v1`, `depths_hiscore`) must move into `Storage.getGameData` /
`setGameData` and `Storage.*GameWallet`. Keep a one-shot reader for the
old key so existing players don't lose their save:

```js
function migrateLegacy() {
  if (!Storage.getGameData('GID') || !Object.keys(Storage.getGameData('GID')).length) {
    try {
      const raw = localStorage.getItem('OLD_KEY');
      if (raw) {
        const old = JSON.parse(raw);
        Storage.setGameData('GID', { /* mapped fields */ });
        if (old.coins | 0) Storage.setGameWallet('GID', old.coins | 0);
        localStorage.removeItem('OLD_KEY');
      }
    } catch (e) {}
  }
}
```

## When to wipe (NG+ vs. clean-slate)

- **Default:** unlocks + wallet persist forever (most arcade games).
  Beating the campaign just leaves a trophy state (e.g. `defeatedBoss: true`).
- **Vaultbreaker model (clean-slate on victory):** explicit per-game choice
  declared in the game's docstring at top of file. Use `Storage.clearGameData(GID)`
  in `_persistOnEnd(true)`. Default to NG+/persistent for new games unless
  the design specifically calls for the wipe.

## Don't-touch list

These games have no per-game currency and no in-game shop spending
global coins; they don't need migration:

- `pong` — `coinsEarned() = 0`, perks are draft-only
- `deflect` — perks are draft-only, no shop
- `switchboard` — score-only narrative game
- `sand` — puzzle game; awards are direct `addCoins` per level clear,
  which is fine (no shop, no in-run currency)

## Ship checklist (per game)

- [ ] In-run currency var seeded from `Storage.getGameWallet(GID)` on `init()`.
- [ ] Every shop purchase spends from `Storage.spendGameWallet`.
- [ ] Every legacy `Storage.spendCoins`/`getCoins`/`addCoins` referring to
      the in-game economy replaced.
- [ ] HUD / shop UI shows the per-game wallet.
- [ ] Wallet writes happen at intermissions + end-of-run (cheap).
- [ ] `coinsEarned()` is milestone-based; no `score / N` formula tied to
      pickup-inflated score.
- [ ] Milestone counters (`*ClearedThisRun`, `victoryAchieved`) initialized
      in `init()` and updated at the right moment in `update()`.
- [ ] Game still parses (no syntax errors).
- [ ] Changelog entry under `docs/changelog.md`.
