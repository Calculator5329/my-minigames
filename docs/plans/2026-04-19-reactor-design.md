# Reactor — Lunar Helium-3 Tycoon

**Date:** 2026-04-19
**Type:** New 60-second arcade minigame for the NotDop collection.
**Inspiration:** Not Doppler reactor/management games + Ninja Kiwi tycoon hooks.

## Pitch
You operate a He-3 mining colony on the Moon. A glowing reactor at the heart of a side-view base cutaway powers everything. Run hotter = more watts = more dollars per second. Run too hot = meltdown, white flash, crater. Survive 60 seconds and cash out. Pure "risk dial" tension.

## Core fantasy
Side-view cutaway: lunar surface with craters, dome above showing stars and a slowly rising Earth, base modules branching from the central reactor below ground. Workers (tiny astronauts) animate between modules. The reactor visibly throbs — color shifts from cool cyan → green → amber → red → white as heat climbs.

## Core loop (the risk dial)
- Reactor has **heat** (0–120). Output (watts) = heat × efficiency.
- Player controls a **throttle slider** (0–100%). Higher throttle pushes heat up.
- **Coolant** is consumed continuously based on heat; when coolant runs out, heat spikes uncontrollably.
- Income: $/sec = watts × (1 + module multipliers).
- **Safe band**: heat ≤ 80 = stable. 80–100 = warning (UI shakes, alarm beeps). 100–120 = critical (chance per second to fail). 120+ = instant meltdown.
- Player buys modules with $ to grow income capacity, raise heat ceiling, or stabilize.

## Modules (purchase with $ during run)
Right-side panel of buyable cards, similar to Franchise Frenzy:

| Module          | Cost (base) | Effect                                                    |
|-----------------|-------------|-----------------------------------------------------------|
| Mining Rig      | $50         | +25% income mult per rig                                  |
| Coolant Loop    | $120        | +20 max heat ceiling per loop, +1 coolant/s regen          |
| Shielding       | $250        | -50% meteor damage per layer (caps at 90%)                |
| Reactor Core+   | $500        | +30% efficiency (watts per heat)                          |
| Launch Pad      | $1000       | Ships ore every 8 seconds for a $ burst (×2 with rigs)    |
| Auto-Stabilizer | $2000       | Passive: gently nudges throttle toward safe when critical |

Each module purchase scales cost ×1.6.

## Pressure events (random over the 60 seconds)
- **Meteor shower** (every 12–18s): 1–3 meteors streak from upper-right and impact a random module. Damage = lose 1 stack of that module unless shielded. If reactor hit, +25 instant heat.
- **Solar flare** (every 20s): UI scrambles for 4s, throttle drifts upward.
- **Coolant leak** (random, after 25s): coolant regen halves for 8s, indicator blinks.
- **Ore shipment bonus** (every 15s if launch pad owned): big $ burst with rocket animation.

## Controls
- **Mouse**: drag throttle slider on left panel; click buy buttons on right panel.
- **W/S** or **↑/↓**: nudge throttle.
- **Space**: emergency vent — drops heat by 30 instantly, costs $50 (or 25% of cash, min $50). Cooldown 3s. Uses coolant.

## Scoring
- Score = total $ earned over the run (cash + cash spent on modules).
- If meltdown: score still counts up to that point + small "ejection" penalty (-10%).
- Win = survive 60s; bonus = +20% of cash on hand.

## Coins formula
~1 coin per $400 earned. Comparable to franchise.

## Visual language
- **Background:** starfield, slow-rising Earth disc in upper-right (visual timer).
- **Surface:** craters, distant mountains.
- **Dome:** thin glass arc with subtle reflections.
- **Reactor:** central glowing core. Pulses tied to heat. Particles emit faster as heat rises.
- **Modules:** small connected rectangular pods with animated indicators (mining drills bobbing, coolant pipes shimmering, etc.).
- **Workers:** tiny astronauts walking between active modules and reactor (similar to franchise workers).
- **Throttle:** vertical slider with red/green safe-zone gradient on the left side.
- **Heat gauge:** large arc-meter near the reactor, color shifting cyan→green→amber→red.

## Audio (Web Audio synth)
- **Ambient:** low reactor hum (drone). Pitch tracks heat. Already supported via `Audio.startAmbient`.
- **buy:** triangle pop, ascending.
- **alarm:** square pulse @ 800Hz when heat > 100, repeating.
- **vent:** noise burst (steam release).
- **meteor_hit:** noise burst + low thud.
- **launch:** ascending square slide.
- **meltdown:** descending sawtooth + heavy noise.

## End-of-run animations
- **Win:** rocket launches from launch pad with cash bursting out, "EVAC SUCCESS" text.
- **Loss:** white flash, screen shake, dome cracks, slow fade to crater.

## File layout
```
games/reactor/
  manifest.js
  game.js
```

## Implementation order
1. Skeleton class with throttle + heat + coolant + cash loop. Render reactor + gauges.
2. Module purchase system + UI panel.
3. Pressure events (meteor, flare, leak).
4. Workers, particles, polish, sound.
5. End screens.
6. Manifest preview animation.
7. Wire into `index.html`.

## Risk / non-goals
- Not building a deep simulator — heat math is single scalar, not multi-cell like a real reactor would need.
- No save state mid-run; this is pure 60s arcade.
- Target performance: 60 fps on the existing canvas at 960×600.
