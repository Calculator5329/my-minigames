# Vaultbreaker — Design

Coinbox-Hero-inspired boss fight. A tiny goblin batters a giant sentient vault; the vault mutates and fights back.

## Hook
- Coins are **ammo AND currency**: collect them, then either spend on upgrades OR load into your gun as bullets.
- The vault visibly mutates every ~15s, adding arms, turrets, armor plates.
- Destroying an armor plate bursts a geyser of coins; pick target priorities.
- You can shoot the vault's upcoming-upgrade icon to deny it that upgrade.

## File layout
```
games/vaultbreaker/
  manifest.js   # registration + theme + previewDraw + asset list
  game.js      # VaultbreakerGame extends BaseGame
```

## Entities (flat arrays)
- `player`   bottom-screen arena; WASD/arrows move; mouse aims; LMB fires.
- `vault`    top-of-screen boss. HP, plate grid (6 plates), mutation list, upgrade-queue icon.
- `bullets[]` player + vault projectiles (flag `hostile`).
- `coins[]`  gravity + bounce; magnetize to player when close.
- `pickups[]` weapon drops from destroyed plates (uzi, shotgun, etc.).

## Weapons (unlockable via coin spend or plate drops)
1. Pistol (default, infinite)
2. Uzi (spray, costs 1 coin/shot)
3. Coin-Shotgun (pellets = 5 coins/shot, wide)
4. Magnet Gun (drags coins through vault body)
5. Tax Auditor (laser beam, drains vault upgrade menu)

## Vault mutations (stackable)
- Grow cannon arm (fires homing blob)
- Deploy turret (stationary minigun)
- Shield plate respawn (+1 plate)
- Coin-eater mouth (consumes uncollected coins after 4s)
- Stomp slam (screen-wide shockwave every 10s)

## Game states
- `title` → description, start button (engine provides).
- `playing` → loop.
- `won` → vault HP 0 (bonus score = remaining player HP x 100).
- `over` → player HP 0.

## Controls
- **Move**: WASD / arrows
- **Aim**: mouse
- **Shoot**: LMB (hold for auto-weapons)
- **Swap weapon**: 1-5
- **Upgrade shop**: E (pauses, spend coins)

## Art
Reuse existing assets:
- `assets/platformer/coin.png` — coin drops
- `assets/dungeon/hero.png` — player sprite
- `assets/fx/particle.png` / `flare.png` — effects
Vault rendered procedurally: dark iron rectangle, glowing eye-slits, bolt studs, plate grid, tentacle arms drawn as segmented rectangles. Matches engine-wide procedural style.

## Audio
Reuse: `audio/hit.mp3` (plate hit), `audio/coin.mp3` (pickup), `audio/explosion.mp3` (plate break). Plus engine `audio.beep()` for player shots.

## Scoring
- +10 per plate damage
- +5 per coin collected
- +500 on victory
- +remaining HP × 100 bonus

## Win/loss
- Vault has ~500 HP; plates absorb 50 ea before breaking; plates respawn.
- Player has 100 HP.
- Vault difficulty ramps: every 15s it picks a mutation.
