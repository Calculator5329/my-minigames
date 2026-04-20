# Changelog

A running log of what shipped in each session.

## 2026-04-19

### Orbital Ramp-Up — paragons, juice, 2 new towers
Phase-1 expansion shipped earlier; this session layers a T5 climax and
polish on top.

- **Paragons** for 6 core towers (dart, cannon, beam, gravity, missile,
  sniper). Unlock gated by T4 on one path + T2 on the other, in-run
  Level 3, and a lifetime-XP threshold on that tower key (persisted
  across runs). Buying replaces the tower in place with fixed paragon
  stats and a signature mega-ability. Each paragon has custom cost
  ($22k-$35k). Purchase plays a 1.2s cinematic (screen flash, radial
  shock particles, sliding banner, sim frozen during).
- **Commander** — one-per-run hero. Auto-levels 1→8 (every 3 rounds
  placed). Tactician path (rally aura, +dmg debuff, Stand Fast
  ability) and Gunner path (heavy rounds, anti-armor, Barrage ability).
  Tray tile greys with "PLACED" after deployment.
- **Saboteur** — doesn't shoot; plants proximity mines on the path
  within its range. Minefield (more mines, faster, Saturation ability)
  or Demolitions (heavier mines, Nuke Mine + manual Detonate ability).
  Engineer synergy: when within each other's range, saboteur plants
  mines 2× faster and the engineer's sentry fires 2× faster, with a
  dotted line visualizing the link.
- **Graphics juice**: paragon unlock cinematic, per-path sprite
  variant system (dart A orange / dart B purple POCs; system falls
  back gracefully for towers without authored variants), pulsing
  lead-enemy path glow, tower idle breathing.
- Lifetime-XP persistence per tower key (`O.Persist.addLifetimeXp` /
  `getLifetimeXp`), powering the paragon unlock gate across runs.
- 14 new abilities (6 paragon + 2 commander + 2 saboteur + support
  registrations): BoltStorm, OrbitalDrop, Sunburn, TotalCollapse,
  MIRV, Erase, StandFast, Barrage, Saturation, Detonate.
- Tower count 16 → 18.
- Cache-bust bumped to `?v=4` across all orbital script includes.
- Design doc `docs/plans/2026-04-19-orbital-rampup-design.md`;
  implementation plan `docs/plans/2026-04-19-orbital-rampup.md`.


### Switchboard → Hotel Cascadia — story locked, manifest renamed
Switchboard ('418 Linden') is being rewritten ground-up into a new
setting: an impossibly tall hotel that resets its guests, with a single
night-shift operator on Floor Zero. The operator-board mechanic
survives; everything else (story, cast, dialogue, mechanics, endings,
audio, walkthrough) is replaced. Story prose locked in
`docs/plans/2026-04-19-cascadia.md` (do not rewrite without sign-off).

This commit lands only the doc + selector-card rename:
- New plan `docs/plans/2026-04-19-cascadia.md` with the canonical
  four-paragraph story, eight-voice cast bible, ten new mechanics
  (M1–M10 — board grows nightly, 3:14 AM architect window, dead-socket
  bellhop, ARCHIVED stamp, ledger inter-night card, painted window,
  wallpaper sag, composure-tied operator-reset risk, the Replacement on
  Night 4, the SUPPLY-closet door on Night 5), three rewritten endings
  (CHECK OUT — default loop ending in 2026 then back to the desk;
  UNDERSTUDY; DEMOLITION), and a staged file-by-file change list.
- `games/switchboard/manifest.js` — title `'418 Linden'` →
  `'Hotel Cascadia'`; blurb/description/preview brass plate rewritten
  to setting; accent shift toward sodium-lobby gold + bellhop red.
  Game `id` stays `switchboard` so saves and asset paths don't break.
- `docs/plans/2026-04-19-switchboard-redesign.md` archived with a
  pointer to the Cascadia plan. Pacing tuning, leaky scramble, voice
  bleed, persistent [L] reminder, and the inter-night Operator's Log
  card carry forward.
- `docs/current_task.md` repointed to the Cascadia plan, locked
  decisions enumerated, implementation order recorded.

Engine wiring, content rewrite, and audio re-bake follow in subsequent
commits per § Implementation order in the plan.

### Leap & Ricochet — deep-dive expansion + polish pass
Picked the two thinnest games in the catalog with the most upside and
brought both up to a more complete feel. Both had an obviously broken or
half-baked feature surfaced by reading the code — fixed those first, then
added content and polish. All changes scoped inside the two
`games/<id>/game.js` files; no engine, shell, or cross-feature edits.

**Leap** (`games/leap/game.js`)
- **Fixed silent victory bug.** `victoryAchieved` was wired into
  `coinsEarned()` and the wallet payout but was *never set anywhere* —
  the run was endless and the win bonus never paid. Introduced
  `MAX_LEVEL = 12`, `this.maxLevel`, and a real victory branch in the
  completion transition that flips `victoryAchieved`, persists
  `bestLevel`, calls `_awardWallet()`, and `this.win()`.
- **Two new enemy kinds.** `flyer` patrols sinusoidally above the ground
  (worth +50 stomp), `spiker` cannot be safely stomped without the new
  **Spike Helm** perk (130c), star-power, or active i-frames. Spawn
  rates ramp from level 3 (spikers) and level 4 (flyers).
- **In-level power-ups.** Cherry (heal +1 life, +75) at every level mid;
  Star (6s invuln + pass-through kills, +150) appears from level 4 atop
  a randomly chosen floating platform. Star aura particles trail the
  player while active.
- **Real boss fight.** Three-state `_updateBoss(b, p, dt)` patrols the
  right-side arena, telegraphs a wind-up (white flicker + dotted target
  arc on the canvas), then leaps toward the player. Stomping during the
  leap interrupts the attack and removes one HP pip. HP scales with
  level. Bosses now appear on levels 3, 7, 11; the final boss is on 11
  so the campaign reads `arena → boss → maxLevel 12 victory`.
- **End-of-level summary banner.** Replaces the one-line `LEVEL N
  CLEAR!` text with a stat card (coins / gems / kills / time) and a
  click-to-continue cue once the banner has been visible for 0.6s.
  No-hit run grants a +50 bonus.
- HUD now shows `Level n/max`, a `BOSS` tag on boss levels, and the
  remaining star-power timer.

**Ricochet** (`games/ricochet/game.js`)
- **Honest predictive aim.** The Aim Assist perk's description is
  "Predictive aim line" but it previously just drew a longer straight
  line. Replaced with a real `_raycastBounces(x, y, dx, dy, maxBounces,
  maxLen)` helper that performs slab-test ray-vs-AABB intersection
  against every static obstacle plus the four arena walls, recording up
  to 3 reflected segments. The renderer draws the dashed prediction +
  small dots at predicted bounce points when the perk is owned.
- **Multi-kill combo system.** Per-shot `shotStats` track kills,
  bounces, best combo, and combo bonus. `_onShotKill(e)` awards
  +50/+150/+300 for DOUBLE/TRIPLE/QUAD plus an INSANE tier
  (+500 + 200 per extra kill), pops floating combo text at the kill
  point, flashes the screen in the tier color, and shakes. Single kills
  get a small `+100` popup.
- **Portals.** New non-rectangular obstacle: linked pairs of
  teleporters. Bullet entering one exits the other along its current
  heading with a 0.18s debounce so it doesn't immediately re-enter.
  Generated by `_placePortal()` (24-attempt rejection sampling vs
  obstacles + the player). One pair from level 4, two from level 8.
- **Boss phase 2.** When boss HP drops below 50%, `_enterBossPhase2`
  spawns two fast-orbiting minion shields (which must also be killed
  for level clear), accelerates the boss 1.6×, flashes the screen, and
  adds a pulsing fury ring around the boss. HP bar recolors from
  orange to magenta to signal the new phase.
- **Post-shot summary card.** Replaces the LEVEL CLEAR / RETRY ribbon
  with a card listing kills, bounces, best combo, and combo bonus —
  surfaces the work the player just did.
- HUD now reads `Level n/maxLevel` and tags BOSS levels.

### Orbital — end-of-run stats, leaderboard, freeplay mode

User feedback: "I just beat the orbital game we should also have some stats
and a score leaderboard and an option to continue in freeplay mode and
that's infinite and scaling difficulty quite quickly."

- **End-of-run modal (`games/orbital/ui/end-screen.js`, new).** Replaces
  the silent jump to the shell's generic overlay with a full canvas
  modal. Three flavours: VICTORY (R50 cleared, freeplay continuation
  offered), DEFEAT (campaign run died), FREEPLAY ENDED (died during
  freeplay). Renders a per-run stat block (score, round reached, run
  duration, kills, bosses downed, leaks, lives lost, cash earned, cash
  spent, best combo) and a top-10 persistent leaderboard with the player's
  rank highlighted. Buttons: Continue Freeplay (victory only) / Play Again
  / Quit.
- **Stat tracking (`games/orbital/game.js`).** New `this.stats` aggregate
  is populated during play: kills + boss kills in `cullEnemies`, leak +
  lives-lost in `updateEnemy`'s path-complete branch, totalSpent in
  `spendCash`, cashEarned in the bounty path, and bestCombo whenever the
  combo timer expires. The values feed both the modal and lifetime
  aggregates in `Persist.recordLifetimeStats`.
- **Leaderboard storage (`games/orbital/lib/persist.js`).** Added
  `recordLeaderboardEntry` / `getLeaderboard` (top 10 by score with mode,
  round, freeplayLevel, duration, kills, ts), `recordLifetimeStats` /
  `getLifetimeStats`, and `recordFreeplayLevel` / `getBestFreeplayLevel`.
  Persists alongside the existing per-game data blob via
  `NDP.Engine.Storage`.
- **Freeplay mode (`games/orbital/game.js`).** Cleared R50 → modal offers
  "Continue in Freeplay". Continuing keeps the player's cash, towers, and
  upgrades intact, tops their lives back up to at least 80, sets
  `mode='freeplay'`, and lets `startWave` keep incrementing the round
  counter past `maxRound`. Every freeplay wave (`freeplayLevel = round
  - 50`) applies multiplicative scaling at spawn time:
    - HP × 1.20^level (×2.5 at FP+5, ×6.2 at FP+10, ×38 at FP+20)
    - bounty × 1.10^level (×1.6 / ×2.6 / ×6.7 — slower than HP so the
      treadmill stays meaningful)
  `data/rounds.js`'s existing endless-tail formula already grows the wave
  count past R50 (×0.25 per round past the last), so freeplay R55 spawns
  3 titans at ×2.5 HP, R60 spawns ~4 titans at ×6.2 HP, R70 spawns ~6
  titans at ~38× HP — "scaling difficulty quite quickly" as requested.
- **Freeplay HUD (`games/orbital/ui/side-panel.js`).** Round indicator
  now shows `FP+N` instead of `round/max` once the player is past the
  campaign, and the act label is replaced with an orange `FREEPLAY ·
  scaling` badge so the mode is unmissable.
- **Modal swallows input.** While the modal is up, `update()` returns
  early after handling clicks, so the world freezes and the right rail
  can't fight the modal for the cursor. Quit routes through `this.win()`
  / `this.gameOver()` so the shell's existing end-overlay (coin payout,
  global high-score) still fires correctly.

### Orbital + engine — invisible perf pass (no gameplay change)

Pure perf — every change is mathematically/observably identical to the
old behaviour. Targeted at deep-freeplay scenarios where enemy/projectile
counts get large; campaign play is unaffected (just slightly cheaper).

- **Particle cap (`engine/draw.js`).** `ParticleSystem.emit` now drops
  silently above 600 active particles. Mass-death moments (titan splits
  in late freeplay) used to spawn 1000+ particles in a single frame —
  now capped, no more GC spike.
- **Particle update is now swap-and-pop instead of `splice`.** O(1)
  removal per dead particle vs O(n) shift. Matters once the list is in
  the hundreds.
- **Squared-distance hot paths (`games/orbital/game.js`).** Replaced
  `Math.hypot(...)` with `dx*dx + dy*dy` compared against `r*r` in every
  pure radius/min-dist check that doesn't need the actual distance for
  falloff math: projectile-vs-enemy hit check (the single hottest line
  in the loop), homing target acquisition, mine trigger, gravity tower
  range + stun-pulse range, flare lance + pulse range, singularity
  collapse range, tesla chain nearest, beam chain nearest. Splash
  falloff and ability AoE damage curves still use the real distance —
  those rely on `d / r` ratios.
- **In-place compact for `projectiles` and `enemies` arrays.** Replaced
  `this.projectiles = this.projectiles.filter(p => !p.dead)` (and same
  for enemies) with swap-and-pop in place. Kills the largest per-frame
  allocation in the update loop. Behaviour identical — the original
  filter ran after the iterating loop completed, so order changes
  during compact don't matter.

### Reactor — graphics polish pass (sky, reactor, modules, instruments)

User feedback: "further enhance graphics while checking playwright screenshots
and playing through". Pure visual upgrade — gameplay numbers untouched, all
new behaviour is decorative or status-driven rendering.

- **Layered starfield + nebula sky (`games/reactor/game.js`).** Replaced the
  single 110-star noise field with a 180-star three-band parallax (tiny far,
  mid bright, large twinkling beacons that emit a tiny cross-flare on
  twinkle peak). Added two soft radial nebulas whose tint shifts toward
  purple as the campaign day progresses. Three slow comm satellites drift
  across the sky with a faint trail and a red blinking nav light. Earth-rise
  now has an atmospheric halo, a subtle cloud band, a radial body gradient,
  and a softer night-side terminator.
- **Lunar surface lighting.** `_drawSurface` now paints distant comm towers
  with guy-wires and blinking strobes behind the dome silhouette, casts a
  soft elliptical reactor-light glow on the ground (tinted by current heat
  and intensified by throttle), and adds rim-lit crater arcs on the side
  facing the reactor for fake directional lighting.
- **Hexagonal dome.** The previously flat half-dome got a faint hex-panel
  pattern (clipped to the dome interior), an inner specular sweep, a base
  seam ellipse, and a tint that shifts subtly toward red as heat rises.
- **Animated power conduits.** `_drawPipes` now draws a dark casing plus an
  inner dashed energy stream in each module's own colour. The dash phase
  scrolls toward the module at a speed that scales with throttle and heat,
  and bright connector nodes pulse at the reactor end. Each pipe is now
  visually distinct.
- **Reactor core.** Added a vertical plasma exhaust column rising from the
  core (intensity tracks throttle), an outer counter-rotating segmented
  containment ring, a radial-gradient core body with a brighter white-hot
  inner eye, alternating long/short tick marks around the shroud, and
  random electric arcs that leap off the surface above 85% heat.
- **Per-module micro-animation (`_drawModuleAnim`).** Each owned pod gets a
  small living detail layered on top of the static glyph: spinning fan
  blades on Coolant, drill-bit shake on Mining Rig, panel-tilt sweep on
  Solar, aim-sway on Containment Laser, piston bob on Helium Pump, window
  flicker on Worker Habitat, beacon strobe on Launch Pad, counter-rotating
  inner ring on Reactor Core+, shimmering shield outline on Shielding,
  rotating arc on Auto-Stabilizer, and a green latch-LED pulse on Black
  Box. Pods now sit on a bevelled gradient chassis with a soft coloured
  halo, and the count badge is a coloured pill instead of plain text.
- **Throttle slider.** New chrome bezel with a top-edge highlight, a
  recessed slider channel, a glassy left-edge highlight on the colour
  ramp, alternating long/short tick ridges, a He³ stable-band label, and
  a 3D knob with notch grips and a drop shadow.
- **Emergency Vent button.** Hazard-chevron strip across the top, a
  state-tinted body gradient, and a pulsing red glow plus border whenever
  the button is ready *and* heat is over max — the player's eye is dragged
  to the action they need to take. Cooldown is now shown as a thin
  progress bar instead of a text label.
- **Heat gauge.** Background dial now paints colour-coded zones
  (cool/warm/hot/meltdown) at low alpha, the active arc renders with a
  shadow-blur glow, a bright white needle-tip pip rides the leading edge,
  and the whole arc gets a pulsing critical halo whenever heat > max.
  Inner and outer trim rings frame the dial.
- **Cache busting.** Bumped all reactor script `?v=` query params from `v6`
  to `v8` (`index.html`) so the upgraded files load on existing tabs.

Verified end-to-end via Playwright: idle/cool, mid-heat with all modules
owned, critical-heat banner + over-max gauge halo + pulsing vent, and a
day-5 walkthrough — all rendered cleanly with no layout regressions.

### 418 Linden — caller-voiced audio, transcript sync, Night 1 tutorial

User feedback: "shouldn't I be hearing the audio of the call not my response?"
and earlier "I don't completely understand, im still on night one at 200s."

- **Audio role flip — root cause + fix.** `gpt-audio-mini` was treating each
  scripted line as a request *to* the operator and improvising the operator's
  reply ("Four-one-eight Linden, connecting now. Please hold."). The displayed
  caller-card text was always the *caller's* line, so they no longer matched.
  Rewrote the bake prompt in `scripts/generate-voices.js` to use a structured
  audiobook framing: system message establishes the model as an audiobook
  performer voicing the **caller** (never the operator), and the user message
  carries the take in `<character>...</character>` and `<script>...</script>`
  tags. Verified verbatim output with `scripts/_probe-transcript.js` on three
  representative lines (elderly woman, breathy whisper, etc).
- **Transcript capture + display.** `scripts/generate-voices.js` now also
  reads `delta.audio.transcript` from the SSE stream and writes the actual
  spoken transcript to `assets/switchboard/voices/<callId>.txt` next to the
  wav. `games/switchboard/voices.js` lazy-prefetches that file on `play()` /
  `whisper()` / `prefetchTranscript(callId)` (called from the `ring` hook in
  `game.js` so it lands before the player even leans in). `games/switchboard/board.js`
  `drawCallerCard` now prefers `SB.Voices.getTranscript(callId)` over the
  original `call.text`, so the on-screen caption is always in lock-step with
  what the player actually hears even if a future model still drifts a word.
- **Re-bake helper (`scripts/rebake.cmd`, new).** A one-shot batch wrapper
  that runs the full 108-line bake with `--force --whisper`, tees output to
  `scripts/bake.log`, and tolerates terminal timeouts so you can kick it off
  in any window and tail the log. The previously-baked wavs are still valid
  for the (now-wrong) operator-reply audio; running this script overwrites
  them with the verbatim caller audio and produces the matching `.txt` files.
- **Night 1 onboarding.** The previous intro was just "Route the calls.
  Don't keep them waiting." which left a first-time player staring at a
  switchboard with no idea what each piece does. Rewrote the Night 1 intro
  in `content.js` to lay out the loop in plain English (lamp → click,
  hold L → listen, drag cable → connect to the matching directory line)
  and bumped its display duration to 9s on Night 1 only. Added a 4-step
  coach-mark tutorial in `game.js` (`_drawTutorial` / `_drawCoachArrow`)
  that lights up only on Night 1 and only until the player completes their
  first successful route: STEP 1 prompts "click the glowing lamp" with a
  pulsing arrow at the first ringing socket; STEP 2 prompts "hold [L]"
  with an arrow at the caller card; STEP 3 reads the focused call's
  request, looks the destination up in the directory, and tells the player
  literally "drag a cable from incoming N to outgoing M" with an arrow at
  the matching outgoing socket. Step machine is monotone (`tutorialStep`
  field on the game class) and self-dismisses on the `correct` route hook.
- **Cache busters.** Bumped `content.js?v=3`, `voices.js?v=4`,
  `board.js?v=4`, `game.js?v=4` in `index.html`.
- Files touched: `scripts/generate-voices.js`, `scripts/_probe-transcript.js`,
  `scripts/rebake.cmd` (new), `games/switchboard/voices.js`,
  `games/switchboard/board.js`, `games/switchboard/game.js`,
  `games/switchboard/content.js`, `index.html`, `docs/changelog.md`.

### 418 Linden — deeper script, much creepier voice pipeline

User feedback: "418 linden could be improved, made more in depth, and more
creepy voices for the calls (focusing on that last one)."

- **Script — wider, deeper, more uncanny.** `games/switchboard/content.js`
  rewritten end-to-end. Calls per night raised: 13 → 16 (N1), 12 → 16 (N2),
  12 → 16 (N3), 10 → 14 (N4). Night durations slightly extended (300/330/360/360
  → 330/360/390/390s). Two new caller voices: `operator2` (a "sister
  exchange" who realises something is wrong with you) and `stranger` (a
  pay-phone caller "from a phone that doesn't exist"). Walkthrough rooms
  now have 5 lines per figure (was 3) and the endings each gained a
  capping line. Doctor renamed onscreen to `Dr. Whalen` to match the
  Receptionist's mentions and tighten the through-line.
- **Per-character voice direction.** Every voice profile in `SB.VOICES`
  now carries `direction`, `ttsHint`, `voice` (OpenAI voice id),
  `filter: {lo,hi}` (telephone bandpass), `reverb`, `hiss`, `rate`, and
  `whisperPitch`. The TTS generator and the runtime audio chain both
  read these so a character's "feel" is owned in one place.
- **Runtime audio overhaul (`games/switchboard/voices.js`).** Replaced the
  raw `<audio>` + plain SpeechSynthesis playback with a Web Audio chain:
  per-call source → high/lowpass telephone bandpass → tube waveshaper →
  parallel dry + convolver-reverb wet mix → master, with a per-call
  ambient bed of pink-noise hiss, periodic breath bursts, and tape
  crackles layered around the voice. The chain reads escalation 0..1
  set by `setEscalation()` in `game.js`, so each successive night
  narrows the bandpass, lifts the hiss, and wets the reverb. Whispers
  now play through the same chain with extra wet/quiet/pitch-shifted
  parameters. Added `pickupBlip()` and `ring()` SFX (procedural
  oscillators) and wired them into the answer / call-incoming hooks.
- **Board atmosphere.** `board.js` now lerps the wood gradient toward a
  sicker palette as escalation rises, draws periodic "ghost lamps" that
  flicker on dead lines, sways the cables on later nights, and overlays
  scanlines + occasional red static flashes. Header text flickers more
  often with each night.
- **Walkthrough atmosphere.** `walkthrough.js` rooms gained per-room
  candle flicker, a warm radial pool of light around each figure, dust
  motes, room-name plates, and animated figures that *turn to watch you*
  when you stand close (eye glints fade in). Ghost-line dialogue stays
  on screen longer and fades by age.
- **Tighter night tuning (`nights.js`).** TTL per call shrinks 24 → 18s
  across the four switchboard nights; miss + wrong-route penalties
  scale up; standing on the board with two or more lines ringing now
  bleeds composure (gentle ringing-drain). Mis-routing the *critical*
  Night 4 self-call costs double composure and locks the deny ending.
  `commitRoute` sets `ttlMax` so the per-call timer bar in `board.js`
  renders correctly. Listen-tracking is now per-voice (`flags.listenedTo`)
  for richer hidden-ending logic later.
- **TTS generator rebuilt (`scripts/generate-voices.js`).** Adds a new
  `openrouter` provider (default) targeting `openai/gpt-audio-mini` via
  OpenRouter's audio-output streaming endpoint, with the per-character
  `direction` notes injected into the system prompt for actual creepy
  performances rather than flat reads. New flags: `--night N`,
  `--voice <key>`, `--whisper`, `--model <id>`. Files are written as
  `.wav` (OpenRouter) or `.mp3` (OpenAI direct / ElevenLabs); runtime
  picks whichever is present. Skips already-generated files unless
  `--force`. Fail-fast on first auth error with a clear BYOK help
  message so we don't burn quota on a config issue.
- **`[L] lean in` actually does something now.** Old behaviour: holding L
  only flipped a hidden flag for the "never listened to Halberd" ending
  and rendered a "listening…" label; the call audio always played at full
  volume so the key felt useless. New behaviour: every per-call Web Audio
  chain has a `voiceGain` node sitting between the source and the
  bandpass/reverb stack; that node sits at `0.08` by default and ramps
  up to `1.0` (12 ms ramp) only while L is held. The hiss / breath /
  crackle bed is wired straight to master, so the *call* is always
  audibly happening — you just can't make out the *words* unless you
  commit to leaning in. Whispers are exempt (they're already designed
  as low-volume ambient creeps and bypass the gate). The caller card in
  `board.js` mirrors this: when not leaning in, the spoken quote
  renders as scrambled `····` characters in a dim brown, and the hint
  pulses `[L]  hold to lean in`; on press it switches to the real text
  in cream and the hint goes solid `[L]  LISTENING`. The routing
  destination (`wants: 418 Linden`) and the directory panel are
  unchanged, so the routing puzzle is still solvable without listening
  — listening is now a deliberate trade between speed and dread. Manifest
  controls hint updated to "Hold [L] to lean in (you can't make out the
  words otherwise)". Cache-busters bumped to `?v=3` for `voices.js`,
  `board.js`, `manifest.js`, `game.js`.
- **Voices baked.** After the user removed their OpenAI BYOK from
  OpenRouter (the "Always use this key" config that was hijacking
  `openai/*` requests), the streaming audio endpoint had to switch from
  `wav` to `pcm16` (the only format `gpt-audio*` allows when
  `stream: true`). `scripts/generate-voices.js` now requests
  `audio.format: 'pcm16'` and wraps the raw 24kHz mono PCM in a minimal
  RIFF/WAVE header before writing — so the resulting `.wav` files play
  in any browser `<audio>` element and feed cleanly into the runtime
  Web Audio chain via `createMediaElementSource`. Full bake completed:
  108 lines (all 4 switchboard nights + 3 dead-line whispers + Night 5
  walkthrough rooms + 15 ending narration lines), ~38.6MB total written
  to `assets/switchboard/voices/`.
- Files touched: `games/switchboard/content.js`, `voices.js`, `board.js`,
  `walkthrough.js`, `nights.js`, `game.js`, `scripts/generate-voices.js`,
  `index.html` (cache-bust).

### Skybound — longer runs, in-run progression, deeper upgrade tree
User feedback: "Skybound is a great concept but no progression its over in
like 20 seconds." A baseline run flamed out in ~20s with almost no wallet
income, so the meta-shop felt unreachable and individual runs felt flat.

- **Run length, baseline:** Lowered gravity 720 → 620, max-fall 720 → 580,
  thrust 1500 → 1420 (rebalanced to slower fall), fuel burn 0.28/s → 0.22/s,
  starting fuel pool 1.0 → 1.25. Camera death offset 60 → 80px so a tight
  bounce-recovery isn't instant death. Camera creep base 20 → 14, scaling
  0.03 → 0.025, cap 70 → 58. Default run now sustains ~60–90s instead of
  ~20s, with room to be cut short by hazards rather than fuel-exhaustion.
- **Mid-run progression:** Each biome boundary crossed permanently grants
  a fuel refill, +1 shield, and +6% thrust for the rest of that run. A
  banner flashes mid-screen ("STORM REACHED  +FUEL +SHIELD +THRUST") so
  the spike is felt, not invisible. Stacks across all four biomes.
- **Wallet income that actually rewards play:** End-of-run Updrafts now
  = `floor(altitude/50) + biomesCleared*8 + (victory ? 30 : 0)`. A 600m
  run earns ~20 (was ~5–10), a 2500m victory earns ~112 (was 40). First
  cheap upgrade (Tank, 90) is reachable in the first run; full tree is
  realistic over a session instead of dozens of identical 20s runs.
- **Deeper upgrade tree (4 → 6 upgrades, more tiers):**
  - Tank max 3 → 5 (cost 120 → 90)
  - Boost max 3 → 5 (cost 160 → 120)
  - Shield max 1 → 3, each tier +1 starting shield (cost 180 → 140)
  - Pulse Jumps max 1 → 3, each tier +1 SHIFT charge per run, edge-
    triggered so multiple charges fire from separate presses (cost 220
    → 170). HUD shows remaining `DJn` count.
  - **NEW** Glider Wings (2 tiers, 200): −10% gravity per tier *while
    falling*, full gravity while climbing — converts dead time into
    recovery time without trivialising ascent.
  - **NEW** Head Start (3 tiers, 110): begin run at +200m altitude per
    tier. Skips early grind once you've seen the first biome enough.
  - Shop grid reflowed to 3×2 (cellH 76 → 68, gap 16 → 12) to fit six
    cards above the LAUNCH button without overlap.
- **HUD additions:** Remaining pulse-jump charges, current in-run thrust
  stack ("+18% T") so the cumulative biome bonus is legible.
- **Bug-class fix:** Buying Head Start (or any upgrade) in the shop and
  then launching now correctly re-seeds player position, fuel, charges,
  starting biome, and clouds — previously `init()` ran once at game-start
  and shop-time purchases of altitude/charge/glide effects could be
  stale until the next gameOver/restart cycle.
- File: `games/skybound/game.js` (top-of-file header comment updated to
  document the new mid-run buff loop).

### Site quality pass — Phase 1: repo hygiene
Plan: `docs/plans/2026-04-19-selector-loader-pwa.md`. Phase 1 of 4
(hygiene → loader → selector → PWA).

- Moved 36 stray dev screenshots (~8.6 MB) from the repo root into
  `docs/screenshots/`. Verified zero references from `index.html`,
  `main.js`, `styles.css`, or any `manifest.assets` array — these were
  pure dev artifacts that bloated every clone with no runtime use.
- Consolidated the per-game gitignore stanzas
  (`reactor-*.png`, `bloom-*.png`, `diner-*.png`, `frog-*.png`,
  `frogger-*.png`, `sigil-*.png`) into a single `/*.png` rule that
  catches future strays at root without affecting tracked PNGs under
  `games/<id>/` or `assets/`. Added `firebase-debug*.log` ignore.
- Updated `firebase.json` ignore from `*.png` to `/*.png` (root-only,
  matches new gitignore semantics). `docs/**` already excludes the
  new screenshot dir from deploy.
- Two PNGs that *were* tracked (`lth-boost-test.png`, `lth-flight.png`)
  show as renames into `docs/screenshots/` in the next commit. Net
  history change is one rename + one ignore rule.

### Orbital — balance pass

Audit pass after the playtest fixes. Identified several outliers in the
$/dps curve, two towers that felt weak at unlock relative to their tier,
and a round bonus formula that hadn't kept pace with late-game upgrade
costs. Adjustments:

- **Cannon ($450)** — bumped from `dmg 6 / rate 0.9 / splash 40` to
  `dmg 8 / rate 1.0 / splash 50`. Was the worst $/dps tower at R1 once
  Dart was a thing; now it's a real splash alternative right out of the
  gate. Tier 1–3 patches in path A bumped to keep upgrades meaningful
  (12/17/26 dmg with widened splash).
- **Flare ($1200 → $1000)** — reduced cost and bumped base `pulseDmg
  22 → 28`. The Solar Flare is the cleanest answer to camo + lead waves
  (its radial pulse hits everything regardless of camo, and `flare` is
  in the lead-bypass list), so making it affordable closer to its R12
  unlock matters. Tier 1 `pulseDmg` bumped to 38 to preserve upgrade
  feel.
- **Cryo base dmg 1 → 2** — base hit was so soft it felt like the
  projectile did nothing. Still primarily a slow tower; this just makes
  the impact register.
- **Engineer base buff** — `dmg 4 → 6`, `rate 1.5 → 1.8`, `range 110 → 120`,
  `mineDmg 25 → 35`, `mineCD 6 → 5`, `mineRadius 50 → 55`. Was the
  weakest tower at unlock for its $950 cost (~$95/dps base); now its
  sentry actually contributes and mines come down often enough to
  matter. T1 sentry tier bumped to dmg 10 / rate 2.8.
- **Crystal Prism base buff** — `dmg 16 → 22`, `rate 1.4 → 1.6`,
  `range 175 → 180`. At $1300 R32 unlock it was strictly worse than
  Mortar at base. T1 patch bumped to 32 dmg, T2 to 46 dmg / 2.0 rate
  so the upgrade ladder still feels tasty.
- **Singularity $3000 → $2400** — at R40 unlock the player typically
  has $3-5k available; the old price made it a one-shot "you can have
  this OR keep upgrading the rest of your defense" decision. New price
  lets it fit alongside another mid-tier purchase.
- **Mortar bypasses lead** — `lib/enemy-mods.js`. Mortar fires HE shells,
  not energy, so it now joins cannon/missile/flare/sing in the lead
  bypass list (it was getting stuck at 0.15× damage on lead targets,
  which made no thematic sense). Description updated.
- **Round bonus scaling** — `lib/economy.js`. Was `60 + round*4` (R10 =
  $100, R50 = $260) — too small relative to upgrade costs. Now
  `80 + round*6` (R10 = $140, R30 = $260, R50 = $380), and combo bonus
  bumped from `$2` to `$3` per kill above the 5-combo threshold. Still
  rewards no-leak streak on top via the existing ×2 cap.

### Orbital — readable bounty floaters, weighted leak damage, scrollable catalog

Three quality-of-life fixes after the polish pass:

1. **No more `+$0` floaters** — `games/orbital/game.js`. The bounty bonus
   floater now suppresses itself when the rounded delta is below $1. Tiny
   multipliers on cheap enemies were producing a misleading "+$0" pop after
   every kill; now the floater only appears when the player actually gained
   at least one bonus dollar.
2. **Leak damage scales with enemy difficulty** — `games/orbital/data/enemies.js`
   + `games/orbital/game.js`. Each tier now leaks lives roughly proportional
   to how hard it is to kill (swarmer/ast `1`, drone `2`, bigast `5`,
   summoner `6`, ufo `12`, boss `35`, titan `80`). Starting lives bumped
   from 120 → 150 to keep the campaign survivable at the new scale, and a
   red `-N ♥` floater now spawns at the leak point so the player can see
   exactly how much each leak cost. Big leaks also produce proportionally
   bigger screen shake + flash.
3. **Catalog actually scrollable when it doesn't fit** — `games/orbital/ui/side-panel.js`.
   Lowered the `tileH` floor from 40 → 34 and added a real visible
   scrollbar (clickable up/down arrows + chunky thumb) on a reserved 14px
   right-hand lane that only appears when the catalog overflows. Tiles
   automatically narrow to make room for the scrollbar lane, so nothing
   collides with the chrome. Mouse-wheel scroll over the panel still works
   as before; the new arrows are clickable for trackpad / touch users who
   don't have a wheel.

### Orbital — adaptive shop tiles, target leading, camo discoverability, slower unlock pacing
Three follow-up fixes after playtesting the Phase 2.5 polish:

1. **Catalog tiles no longer clip** — `games/orbital/ui/side-panel.js`. `tileH`
   is now adaptive (computed from the actual grid height, clamped 40–56) and
   the tile draw routine scales sprite size + font sizes from `tileH`, so all
   16 towers fit in the 600px canvas without scrolling. The scroll thumb
   stays as a fallback if the catalog ever grows past what 40px tiles can fit.

2. **Towers actually lead targets** — `games/orbital/game.js`. Bullets were
   aimed at the enemy's CURRENT position with no lead, so anything fast (or
   anything moving on a curve) was getting missed. Now `updateEnemy` caches
   `e._vEff = e.speed * dtScale * (1 - slowAmt)` (true instantaneous speed
   accounting for slow / chrono / chill / stun) and `fireProjectile` runs a
   3-pass iterative path-aware lead: estimate distance to current aim point,
   compute time-of-flight at projectile speed, advance the target's `pathS`
   by `vEff * tof`, and resample the path with `pointAt(...)`. This is more
   accurate than straight-line lead because enemies follow curves; a
   straight-line lead would fly off-tangent on every bend. Homing and rail
   (Sniper) projectiles skip leading (they self-correct / are instant). The
   visual barrel angle still tracks the enemy's current position so towers
   don't look like they're aiming at empty space.

3. **Camo enemies are now discoverable + always counterable** — playtesting
   surfaced that camo (first appearance R11) was effectively undocumented:
   only ONE upgrade in the entire game (Support path B T1) could see camo,
   tooltips never mentioned it, and there was no on-screen prompt the first
   time a camo enemy appeared. Fixed across four files:

   - `games/orbital/data/towers.js`: spread camo detection so the player has
     options. Beam path A T1 ("Wider Aperture", $300), Tesla path A T1
     ("More Chains", $450), and Sniper path A T1 ("Spotter", $450) all now
     patch in `seesCamo: true`. Their glyph swapped to `eye` and descriptions
     mention camo. The tower base `desc` strings on Beam, Tesla, Sniper, and
     Support now end with "Path A/B reveals camo" so it's discoverable from
     the buy tooltip too.
   - Tower unlock pacing slowed to spread across the 50-round campaign:
     Dart/Cannon R1, **Beam R3** (camo), Gravity R5, **Tesla R7** (camo),
     Cryo R9, Flare R12, **Sniper R14** (camo), Mortar R17, **Support R20**
     (camo), Missile R23, Quant R26, Engineer R29, Crystal R32, Chrono R36,
     Singularity R40. Critically, two camo-capable towers (Beam, Tesla) are
     guaranteed unlocked BEFORE the first camo wave at R11.
   - `O.Towers.hasCamoDetection(key)` helper added — true if any tier in
     either path of the tower grants `seesCamo`.
   - `games/orbital/ui/side-panel.js`: small cyan eye-glyph badge in the
     top-left corner of every tile whose tower can see camo (dimmed when
     locked). Tooltip body now appends "👁 Reveals CAMO via upgrade." (or
     "natively") when applicable. Tooltip box bumped 230×104 to fit.
   - `games/orbital/lib/persist.js`: `hasSeenHint(id)` / `markHintSeen(id)`
     for one-shot tutorial flags persisted into the orbital data blob.
   - `games/orbital/game.js`: `_camoIntroShown` initialized from
     `Persist.hasSeenHint('camo')`. The first time a camo enemy spawns in
     a run (and the player hasn't seen the hint before), `_showCamoIntro()`
     fires: snapshots the camo-capable towers, marks the hint seen, plays a
     warning SFX, and pops a cyan banner ("👁 CAMO ENEMIES INCOMING 👁")
     listing the tower options. The banner uses the same fade/rise pattern
     as the unlock toast and lives 8 seconds.

### Orbital — two-column shop, BTD4-style tower unlocks, two new towers, beefier upgrade overlays
User feedback: "Lets continue improving orbital, maybe the towers menu should
have two columns so it doesnt go off screen, and there should be more towers
that are disabled until I unlock them just like in the original BTD4 and I
don't know what to buy to see the hidden ones and we need more towers and we
need more detail and cool graphics for all the upgrades."

Six things shipped:

1. **Two-column tower shop** — `games/orbital/ui/side-panel.js`
   `_drawTowerList` now renders the catalog as a 2-column grid of compact
   tiles (`tileW`/`tileH`/`gap` with scroll clamp + a right-edge scroll
   indicator). Each tile gets a left-edge color band keyed to the tower's
   path A accent for fast visual scan. Replaced `_drawTowerRow` with
   `_drawTowerTile`, updated hit-testing accordingly. Tooltip box bumped
   220×86 to fit the new locked-tower copy.

2. **Round-gated unlock system** — `games/orbital/data/towers.js`
   Every tower got an `unlock: { round: N }` property. Schedule is set
   so the player meets a new toy roughly every 2–4 rounds:
   Dart/Cannon R1, Gravity R2, Beam R4, Tesla R5, Cryo R6, Flare R7,
   Sniper R8, Support R10, **Mortar R11**, Missile R12, Quant R14,
   Engineer R16, **Crystal R17**, Chrono R19, Singularity R22.
   Public API now exports `unlockRound(k)` and `isUnlocked(k, bestRound)`.

3. **Persistent best-round + locked-tower UX** — `games/orbital/lib/persist.js`
   + `games/orbital/game.js`. Added `recordRoundClear(round)` /
   `getBestRound()` and wired them into `init()` and `onRoundClear()`.
   In `side-panel.js`, locked towers render with a dimmed sprite, a lock
   glyph, and `R<unlockRound>` text; tooltip says "Locked: clear round X
   to unlock." Both the buy-click and the hotkey selection paths in
   `game.js` short-circuit on `isTowerUnlocked(key) === false` and
   surface a flash message so the player knows why nothing happened.

4. **Unlock toast** — `games/orbital/game.js`. After `onRoundClear` we diff
   the new bestRound against `prevBest` and, if any towers crossed their
   unlock threshold, set `this.unlockToast = { names, t: 4 }`. The toast
   is decremented in `update(dt)` and rendered as a banner at the top of
   the play area in `render(ctx)`, plus a `flashMessage` for redundancy.

5. **Two new towers — Mortar (R11) and Crystal (R17)**
   - `games/orbital/data/towers.js`: full base stats + 2 upgrade paths each.
     Both reuse the existing gun-tower update path (no new mechanics
     required, keeps the surface area small).
   - `games/orbital/sprites.js`: added `S.turret_mortar` and
     `S.turret_crystal` SVGs.
   - `games/orbital/manifest.js`: registered `orb_turret_mortar` and
     `orb_turret_crystal` so the loader picks them up.
   - `games/orbital/game.js`: `_updateTower()` switch now branches both
     keys to `_updateGunTower`.

6. **Beefier upgrade overlays** — `games/orbital/lib/overlay.js`
   `drawPathOverlay` now reads as a clear progression instead of "small
   dot → bigger dot":
   - **T1**: glowing accent dot (with `shadowBlur`) at the top of the
     chassis, off-set left for path A, right for path B.
   - **T2**: thin ring around the chassis + a small badge plate on the
     side carrying tier-pip count (1 pip at T2, 2 at T3, 3 at T4) so a
     glance tells you the build at a distance.
   - **T3**: path A draws three nested chevron spikes along the firing
     axis with glow; path B draws a 4-point cardinal star. Both add a
     thicker pulsing outer ring and an orbiting plate (with a faint
     trailing dot) circling the chassis.
   - **T4**: handed off to `drawTier4Aura`, which now layers a pulsing
     glow disc, an 8-spoke rotating blade ring, a counter-rotating
     dashed outer ring, three orbiting energy beads, and the crowning
     glyph (path A: lance with energy line down the shaft; path B:
     faceted floating gem with crown points and sparkle cross).
   This keeps the per-tower SVG count flat (still ~one sprite per
   tower) while making the four upgrade tiers visually distinct.

### Reactor — meltdown transparency pass
User feedback: "Reactor is great but I keep dying on day 2 and I don't have
any good info as to why." Day 2 silently introduces investor visits and the
"Risky Loan" card auto-picks after 6s, dumping +30 heat with no explanation.
The recap previously just said `MELTDOWN · Day N` with stats — never WHY.

Fixed by surfacing the information at every layer:

- `games/reactor/game.js`: added a per-day heat event log (ring buffer of
  `{t, source, label, amount, after%}`), `peakHeatPct`, and `deathCause`
  state. Every heat-changing path now logs (vent path here, others in
  `events.js`). Sustained-high-throttle is logged as a single rolling entry
  so the post-mortem can show "High throttle 6.2s → 121%". `_diagnoseMeltdown()`
  scans the last 6s of the log, picks the dominant heat source, and
  produces an actionable one-liner with a tip per source. Reset on
  `_beginNextDay`.
- `games/reactor/game.js` — `_drawGauges`: heat dial now shows a labelled
  red `MAX` tick at 100% AND a red `MELTDOWN` tick at the actual hard cap
  for the current day, plus `cap N` printed under the digit so the player
  always knows where the fail line sits.
- `games/reactor/game.js` — `_drawCriticalBanner`: full-width pulsing red
  banner whenever `heat > maxHeat` showing live `% / cap %` plus the
  actionable text "PRESS SPACE TO VENT · drop throttle below 30%" (or
  the vent cooldown countdown if it's not ready).
- `games/reactor/game.js` — `_drawDayIntro` + `_dayIntroFor(day)`: 6-second
  fading banner at the start of every day listing the headline mechanic
  introduced that day (e.g. "DAY 2 — Investor visits begin. RISKY LOAN
  gives cash but adds heat.") so day-to-day surprises are at least
  named once.
- `games/reactor/events.js`: `impactMeteor`, `triggerSurge`, and the
  `risky_loan` investor card now call `game._logHeat(...)` with the
  source/label/amount. Risky Loan is also flagged `danger: true` so the
  investor overlay paints it with a thick red border + "DANGER · ADDS
  HEAT" ribbon. Both auto-pick paths (in `events.js#updateInvestor` and
  `game.js#_updateInvestor`) now skip danger cards and pick the first
  safe one — idle players are no longer silently killed by the auto-pick.
- `games/reactor/campaign.js`: `buildRecap` now passes through `cause`,
  `heatLog` (last 6 entries), and `peakHeatPct`. `drawRecap` adds a
  red **CAUSE OF DEATH** banner above stats on meltdowns (sized to fit
  the left column so it doesn't collide with the research panel) and
  a **LAST HEAT EVENTS** mini-list showing `t=Ns Source +N heat → N%`
  so the player can see exactly what stacked into the meltdown.
- `index.html`: bumped reactor script `?v=` from 4 → 6 to bust the
  browser cache.

Verified end-to-end with a Playwright session: forced a Risky Loan
meltdown and saw the recap render
`Risky Loan added +30 heat in 6s (peak 200% / cap 132%). Skip Risky Loan
when heat is already > 60%.`; forced a sustained-throttle meltdown and
got `Heat ran away from sustained high throttle (peak 132%). Lower
throttle sooner, or build a Coolant Loop.` In-play, the CRITICAL banner,
labelled MAX/MELTDOWN ticks, and DANGER ribbon all render correctly.



### Barrage — anti-spam pass: per-wave ammo + fire cooldown
Spam-clicking trivialized barrage: clicks created bursts instantly with no
ammo and no cooldown, so a player could carpet the screen and clear any wave
without aiming. Tightened it to classic Missile Command economy.

- `games/barrage/game.js`: added `FIRE_CD = 0.32s` base fire cooldown and a
  per-wave ammo budget (`_waveAmmo(n) = 10 + n*2 + ammoUpg*6`), refilled on
  `_startWave()`. Click handler now branches into three cases — empty (red
  flash + dry-fire blip), throttled (soft tick, no burst), or armed (consume
  one ammo, set `fireCd`, spawn burst). Crosshair shifts color (yellow / grey
  while reloading / red when empty), shows a sweeping cooldown ring, and
  prints `NO AMMO` when out. HUD adds `Ammo n/max` with low-ammo coloring.
- New shop perks: **Extra Magazines** (+6 ammo/wave, stacks 3, 50c) and
  **Faster Trigger** (-40% fire cooldown, 1×, 60c). Existing perks unchanged.

### Per-game wallet migration — COMPLETE (all 24 games)
Capstone entry. Followed up the Vaultbreaker pilot with a full sweep:
every game with an in-game economy now has its own isolated, persistent
wallet. The shared `Storage.coins` pool is reserved exclusively for the
global theme shop in `main.js`. Five parallel migration batches covered
every game; per-batch detail is in the entries below.

Coverage:

| Status | Games |
|---|---|
| Migrated to per-game wallet | bloom, barrage, tanks, diner, sigil, bulwark, depths, learntoheist, orbital, reactor, franchise, crypt, snake, helicopter, frogger, breakout, asteroids, starfall, stargazer, leap, ricochet, gullet, skybound (+ vaultbreaker, the pilot) |
| Don't-touch (no in-game shop / score-only) | pong, deflect, switchboard, sand |

Cross-cutting wins:
- Zero `Storage.spendCoins` / `Storage.getCoins` calls remain anywhere
  under `games/*` for in-game purposes (verified by grep).
- Every game's `coinsEarned()` is now milestone-based (waves / biomes /
  floors / chapters / matches / days / cities cleared this run + a
  victory bonus). No more pickup-inflated score leaking into the global
  theme pool.
- Three games (`bulwark`, `depths`, `learntoheist`) migrated off custom
  `localStorage` keys onto `Storage.setGameData` + `Storage.*GameWallet`,
  with one-shot legacy readers so existing players keep their progress.
- Wallet APIs (`getGameWallet`, `addGameWallet`, `spendGameWallet`,
  `setGameWallet`, `clearGameData`) are smoke-tested for isolation:
  per-game wallets don't bleed into each other or into global coins.
- All 28 game files (+ engine) parse cleanly.

Recipe + checklist lives in `docs/plans/2026-04-19-currency-migration.md`
for any future game.

### Per-game wallet migration — bulwark, depths, learntoheist (legacy-localStorage batch)
Followed `docs/plans/2026-04-19-currency-migration.md` (esp. step 5) to lift
the last three games whose persistence still lived in raw `localStorage` keys
into the shared `NDP.Engine.Storage` per-game wallet pattern. Each game now
runs the legacy reader exactly once: it only fires when
`Storage.getGameData(GID)` is empty, copies forward both the meta blob and
any in-game currency, then `localStorage.removeItem(OLD_KEY)`. `coinsEarned()`
is milestone-based in all three (no more `floor(score/N)` or `floor(gold/100)`
formulas leaking the wallet into the global theme pool), and `victoryAchieved`
is set BEFORE the engine handoff so the win-bonus actually pays out. All three
default to NG+/persistent — wallets, unlocks, and goal/tier progress are
untouched on victory.

- `games/learntoheist/content.js`: rewrote `LTH.loadSave` / `LTH.writeSave` /
  `LTH.resetSave` / `LTH.buyNextTier`. Wallet is now
  `Storage.*GameWallet('learntoheist')`; everything else (tiers, goalsDone,
  bests, totalLaunches, stageIdx, bossBeaten) lives in
  `Storage.setGameData('learntoheist', {...})`. Workshop purchases route
  through `Storage.spendGameWallet` and mirror the new balance back into
  `save.coins` for HUD code. New `LTH._migrateLegacy()` lifts the old
  `'ndp.lth_v1'` blob forward then removes it.
- `games/learntoheist/game.js`: `init()` adds `victoryAchieved`,
  `goalsCompletedThisRun`, `_endTriggered`. `_endRun()` increments the goal
  counter as goals clear and flags `victoryAchieved` on `bossPunched`, but
  defers the engine handoff to `_updateReport()` so the in-game report
  screen still shows. On dismiss, the report calls `this.win()` (or
  `gameOver()`) FIRST so `coinsEarned()` can still read the run's
  milestones, then `_reset()` wipes per-run state. `coinsEarned()` is
  `goalsCompletedThisRun * 5 + (victory ? 25 : 0)` (was the BaseGame
  default `floor(score/25)`, which always returned 0 since LTH never
  scored).
- `games/bulwark/game.js`: rewrote `loadMeta` / `saveMeta` and added
  `migrateLegacy`. `meta.ash` is now mirrored to
  `Storage.*GameWallet('bulwark')`; `meta.unlocks` and `meta.lastRun` go
  into `Storage.setGameData('bulwark', {...})`. The legacy `'bulwark_v1'`
  blob is read once then removed. `init()` adds `victoryAchieved`,
  `battlesCleared`, `actsCleared`, `_endTriggered` (also reset on New
  Run / Resume). `finishBattle(false)` now calls `gameOver()` after
  saving; `returnToMapOrNextAct()` recognizes the act-3 boss clear,
  bumps `actsCleared`, sets `victoryAchieved = true`, calls `win()`,
  and clears `lastRun`. `coinsEarned()` is
  `battlesCleared * 1 + actsCleared * 5 + (victory ? 25 : 0)` (was
  `floor(score/400)`, where `score` was inflated by in-run gold + ash).
- `games/depths/game.js`: doesn't extend BaseGame, so plumbed Storage
  manually via new `_storage()` / `_migrateLegacy()` / `_bankGold()` /
  `_drawGold()` helpers. `_loadScore` / `_saveScore` now persist the
  hi-score via `Storage.mergeGameData('depths', { hiscore })`; the
  legacy `'depths_hiscore'` key is migrated once then removed.
  `player.gold` now persists between runs through
  `Storage.*GameWallet('depths')`: `_drawGold()` seeds `_newRun()` from
  the wallet (NG+), and `_bankGold()` fires on every `_descend()`,
  every `_die()`, and on victory so a crash mid-run still preserves
  most of the player's coffers. `_newRun()` resets `victoryAchieved`,
  `floorsClearedThisRun`, `_endTriggered`, and `state = 'playing'`.
  `_descend()` increments the floor counter; victory and `_die()` set
  `this.state = 'won'` / `'over'` (depths never reported these to
  main.js before, so the engine end overlay literally never showed).
  `coinsEarned()` is now `floorsClearedThisRun * 4 + (victory ? 25 : 0)`
  (was `(floor-1)*2 + level + floor(gold/100)` on death, or
  `60 + level*5 + floor(gold/50)` on victory — both leaked wallet gold
  into the global pool).

All four files syntax-clean (`new Function(fs.readFileSync(...))` round-trip).

### Feedback inbox (Firestore)
Players can now send free-text feedback per game from the in-arcade topbar.

- **`engine/firebase-config.js`** — public Web SDK config for the
  `notdop-minigames` Firebase web app under project `ethan-488900` (apiKey,
  projectId, etc. are NOT secrets; they identify the project to the browser).
- **`engine/feedback.js`** — `NDP.Engine.Feedback.submit(gameId, gameTitle, text)`.
  Lazy-loads the Firebase Web Compat SDK from gstatic on first use (so the
  initial page load and every game's update loop are unaffected when nobody
  clicks the button), writes one doc to the `feedback` collection with
  `{gameId, gameTitle, text, createdAt: serverTimestamp, userAgent, siteUrl}`,
  enforces a 5s per-tab throttle and 1..2000 char length client-side. Real
  enforcement is in the rules (see below).
- **UI** — new `💬 Feedback` button in `index.html`'s arcade topbar opens a
  themed modal (textarea + char counter + send button + status line). Modal is
  styled in `styles.css` (`.modal-backdrop`, `.modal-card`, etc.) and wired in
  `main.js` (`openFeedback`, `sendFeedback`, Esc/click-outside to close,
  Ctrl/Cmd+Enter to send). The modal pulls the active game's `manifest.id` and
  `manifest.title` so each submission knows which game it's about.
- **`firestore.rules`** — committed to the repo for documentation, NOT
  auto-deployed. Allows `create` only on `feedback/{id}` with strict shape
  validation (exact field set, type checks, length caps, server-assigned
  timestamp). Reads/updates/deletes denied — owner reads via Console. The
  default database is shared with other apps in `ethan-488900`, so these need
  to be MERGED into the existing published rules manually rather than
  blanket-deployed.
- **Web app + DB setup** — created Firebase web app `notdop-minigames` (App ID
  `1:108003293186:web:3ec0dab1f9f93408164f1b`) via the CLI. Default Firestore
  DB already existed (native mode, `nam5`).

### Public hosting + GitHub repo
The project is now version-controlled and live on the public web.

- **GitHub:** pushed to https://github.com/Calculator5329/my-minigames (initial
  commit, `main` branch). Added `.gitignore` covering `node_modules/`,
  `.firebase/`, dev/IDE folders (`.claude/`, `.playwright-mcp/`, `.vscode/`),
  and the per-game debug screenshots that were sitting in the repo root
  (`reactor-*.png`, `bloom-*.png`, `diner-*.png`, `frog*-*.png`, `sigil-*.png`).
- **Firebase Hosting:** deployed to a new dedicated site `notdop-minigames`
  (live at https://notdop-minigames.web.app) under existing project
  `ethan-488900`. The site is its own slot in that project's multi-site setup,
  so the other apps living there (`stackbrawl`, `deep-rift`, `history-explorer`,
  `space-trader`, `tax-explorer-app`, `ethan-488900`) are untouched.
- **`firebase.json`** — `public: "."` (no build step; the project really is just
  static `index.html` + `main.js` + `styles.css` + `games/**`), with `ignore`
  rules that strip docs, scripts, root-level PNG screenshots, `*.md`, and any
  package manifests from the deployed bundle. Caching headers tuned per asset
  class: `index.html` is `no-cache`, JS/CSS get a 1-hour `must-revalidate`
  (these change every session), and images/audio get a 1-day cache.
- **`.firebaserc`** — default project alias `ethan-488900`.

### Per-game wallet migration — starfall, stargazer, leap, ricochet, gullet, skybound (arcade batch)
Followed `docs/plans/2026-04-19-currency-migration.md` for the six remaining
arcade-style games whose pre-run upgrade shops were still spending the global
theme coin pool. All six now use `Storage.*GameWallet(GID, …)` end-to-end:
the in-game shop reads + spends the per-game wallet, the shop UI shows the
wallet balance under the game's flavour name, and `coinsEarned()` is now
milestone-based (driven by an in-run counter + a `victoryAchieved` flag set
in `init()`) instead of a `floor(score/N)` divisor that leaked pickup spam
into the global pool. Each `gameOver()` / pre-`win()` path now routes through
a small `_awardWallet()` helper that calls `Storage.addGameWallet(GID, award)`
exactly once. All six default to NG+/persistent — wallets and meta-progression
in `setGameData` are untouched on victory.

- `games/starfall/game.js` — wallet `'starfall'` (Stardust). `wavesClearedThisRun`
  ticks on `this.wave++`; shop UI shows `Stardust: ●N` and uses
  `spendGameWallet`. `coinsEarned()` is now
  `wavesClearedThisRun * 2 + (victory ? 20 : 0)` (was `floor(score/80)`).
- `games/stargazer/game.js` — wallet `'stargazer'` (Lensgleam). Same
  wave-cleared accounting; `_awardWallet()` is wired into all three
  end-of-run sites. `coinsEarned()` is
  `wavesClearedThisRun * 2 + (victory ? 20 : 0)` (was `floor(score/200)`).
- `games/leap/game.js` — wallet `'leap'` (Sprigs). `levelsClearedThisRun++`
  fires when `this.completed = true`; wallet awarded on lives-out
  `gameOver()`. `coinsEarned()` is
  `levelsClearedThisRun * 3 + (victory ? 20 : 0)` (was `floor(score/50)`,
  which double-counted gem pickups).
- `games/ricochet/game.js` — wallet `'ricochet'` (Ricochets). Per-level wins
  bump `levelsClearedThisRun`; campaign clear (`level > maxLevel`) sets
  `victoryAchieved` and awards before the win-fanfare timeout. New
  `coinsEarned()` is `levelsClearedThisRun + (victory ? 25 : 0)` (replaces
  the old `floor(levelsCleared/2) - floor(misses/4)` global formula; shop
  no longer spends from the global pool).
- `games/gullet/game.js` — wallet `'gullet'` (Gore). `biomesClearedThisRun`
  ticks each time `this.biomeIdx` advances on a score threshold. The third
  biome is `scoreTo: Infinity`, so `victoryAchieved` legitimately stays
  false — the formula handles it. `coinsEarned()` is
  `biomesClearedThisRun * 6 + (victory ? 20 : 0)` (was `floor(score/60)`).
- `games/skybound/game.js` — wallet `'skybound'` (Updrafts).
  `biomesClearedThisRun` increments on `currentBiome` advancement; reaching
  2500m sets `victoryAchieved` and counts the final biome as cleared too.
  Shop UI/spend swapped to wallet. `coinsEarned()` is
  `biomesClearedThisRun * 5 + (victory ? 20 : 0)` (was `floor(score/25)`,
  which inflated heavily off pickups).

All six syntax-clean. No legacy migrator needed (none of these games stored
currency in a `setGameData` blob — they were all pulling straight from the
global `Storage.coins`, which now stays reserved for the main theme shop).

### Per-game wallet migration — crypt, snake, helicopter, frogger, breakout, asteroids
Sixth pass through `docs/plans/2026-04-19-currency-migration.md` cleaning
up the remaining arcade/campaign games whose between-stage shops still
spent global theme coins. Pattern is identical across all six: the old
`score / N` `coinsEarned()` formula moved into `onEnd()` and now funds
the per-game wallet (`Storage.*GameWallet(GID)`); the new `coinsEarned()`
is milestone-based (units cleared this run + victory bonus); shop UI
shows the per-game balance instead of `Storage.getCoins()`. Existing
meta-progression (`bestX`, `perks`, `defeated*` flags) stays in
`Storage.setGameData`. NG+/persistent — no `clearGameData` on victory.

- `games/crypt/game.js`: wallet `'crypt'`. `init()` adds
  `floorsClearedThisRun` + `victoryAchieved`. Counter increments at the
  stairs descent and on boss kill; `victoryAchieved` set just before
  the deferred `this.win()`. Shop check + spend (`_updateShop`) and
  `_renderShop` header swapped to `getGameWallet/spendGameWallet`. New
  `onEnd` deposits `floor(score / 75)` into the crypt wallet so loot
  chests/kills still translate to upgrade money. New `coinsEarned()`:
  `floorsClearedThisRun * 2 + (victory ? 20 : 0)` (was `score / 75`).
- `games/snake/game.js`: wallet `'snake'`. `init()` adds
  `biomesClearedThisRun` + `victoryAchieved`. Counter increments inside
  `_defeatWorm` after the boss falls; `victoryAchieved` set in
  `_updateVictory` before `this.win()`. Commissary
  (`_updateShop`/`_renderShop`) swapped to `getGameWallet`/
  `spendGameWallet`, header reads "Snake purse: ●N". `onEnd` keeps
  funding the wallet at `floor(score / 35)` so apple score still buys
  perks. New `coinsEarned()`: `biomesClearedThisRun * 6 + (victory ? 20 : 0)`.
- `games/helicopter/game.js`: wallet `'helicopter'`. `init()` adds
  `biomesClearedThisRun` + `victoryAchieved`. `_defeatBoss` increments
  the counter; `_updateVictory` flips `victoryAchieved` before
  `this.win()`. Hangar shop (`_updateShop`/`_renderShop`) spends
  `getGameWallet('helicopter')` / `spendGameWallet`. `onEnd` deposits
  `floor(score / 220)` into the wallet (the in-run `coinBonus`/`distance`
  economy still funds upgrades). New `coinsEarned()`:
  `biomesClearedThisRun * 6 + (victory ? 20 : 0)`.
- `games/frogger/game.js`: wallet `'frogger'`. `init()` adds
  `daysCompletedThisRun` + `victoryAchieved`. `_updatePlay` increments
  the counter when `dayPadsFilled >= day.target`; the hawk-victory path
  in `_updateBossLogic` increments and sets `victoryAchieved` together.
  Marsh shop (`_updateShop`/`_renderShop`) swapped to
  `getGameWallet`/`spendGameWallet`, header reads "Marsh purse: ●N".
  `onEnd` deposits `floor(score / 50)` into the wallet. New
  `coinsEarned()`: `daysCompletedThisRun * 4 + (victory ? 20 : 0)`.
- `games/breakout/game.js`: wallet `'breakout'`. `init()` adds
  `worldsClearedThisRun` + `victoryAchieved`. `_updClear` increments
  the counter on each world transition (including the world-5 → boss
  jump, so a full clear yields 5 increments + 20 victory bonus).
  `_updVictory` sets `victoryAchieved` before `this.win()`. Perk shop
  (`_updShop`/`_renderShop`) reads/spends the wallet, header label
  "Brick fund: ●N". `onEnd` deposits `floor(score / 120)` into the
  wallet. New `coinsEarned()`:
  `worldsClearedThisRun * 5 + (victory ? 20 : 0)`.
- `games/asteroids/game.js`: wallet `'asteroids'`. The two existing
  per-wave / per-boss `Storage.addCoins` payouts (5 + 2*wave for normal
  clears, 30/60 for the bosses) flipped to
  `Storage.addGameWallet('asteroids', ...)`. Upgrade Bay
  (`_updateShop`/`_renderShop`) spends `spendGameWallet`. HUD now reads
  "Bay ●N" via `getGameWallet`. `init()` adds `wavesClearedThisRun` +
  `victoryAchieved`; counter increments on both normal wave clear and
  boss defeat (so kills of Swarm Lord / Hive Queen close out waves 5/10).
  Hive defeat sets `victoryAchieved = true`. New `coinsEarned()`:
  `wavesClearedThisRun * 1 + (victory ? 20 : 0)` (was hard-coded `0`),
  so global theme coins finally trickle out of asteroid runs without
  double-dipping the in-game economy.

### Per-game wallet migration — orbital, reactor, franchise (econ-sim trio)
Followed `docs/plans/2026-04-19-currency-migration.md` for the three
remaining economic-simulation games. These were trickier than the
arcade-style batch because each one generates currency from gameplay
loops (rounds, days, autobuyers) rather than pickups, so the wallet had
to be wired without disrupting the in-run economy. `cash` stays
run-volatile in all three; only meta-currency moved to the wallet.

- `games/orbital/game.js` + `games/orbital/lib/persist.js`: in-round
  `cash` (used to buy/upgrade towers) is unchanged. Stardust — the
  meta-currency the side-panel HUD already renders for Phase 4 — now
  lives in `Storage.*GameWallet('orbital')`. `lib/persist.js` got a
  one-shot legacy reader that lifts any pre-existing `data.stardust`
  field into the wallet on first load and strips it from the data blob.
  Round-clear deposits +1 stardust; victory deposits +25 (in addition to
  global theme coins). Engine destructure picked up `Storage`. New
  `coinsEarned()`: `roundsClearedThisRun + (victory ? 25 : 0)` (was
  `floor(score / 40)`, which leaked bounty * 5 into global coins).
  `runStardust` is seeded from the wallet in `init()` so the HUD shows
  the persistent total even before the first round.
- `games/reactor/research.js` + `games/reactor/game.js`: `cash` /
  `totalEarned` stay in-run. RP (research points) moved out of
  `mergeGameData('reactor', { research: { points } })` and into
  `Storage.*GameWallet('reactor')`. One-shot legacy reader in
  `migrateLegacy()` lifts the old `research.points` value into the
  wallet on first access and writes the data blob back without that
  field. `award()` calls `addGameWallet`; `buy()` calls
  `spendGameWallet`; `getState().points` reads the wallet so all
  existing UI (recap "+N RP" line, RP-available header, day-end HUD)
  works unchanged. `_endDay()` increments `daysCompletedThisRun` and
  sets `victoryAchieved` on `campaign_complete`. New `coinsEarned()`:
  `daysCompletedThisRun * 4 + (victory ? 25 : 0)` (was
  `floor(score / 400)` where score = totalEarned, dollars-leaking).
  `bought` / `bestDay` / `campaignsBeaten` / `endlessUnlocked` still
  live in `gameData` via `setGameData`.
- `games/franchise/game.js`: `cash` and net-worth state stay in-run.
  Stardollars moved out of `this.save.stardollars` and into
  `Storage.*GameWallet('franchise')`. One-shot legacy reader in
  `init()` checks `this.save.stardollars > 0` after the data-blob load,
  pours it into the wallet, zeroes the blob field, and writes back.
  `endCampaign()` deposits `F.stardollarsFor(peakNetWorth)` into the
  wallet instead of the save blob. Meta-shop spend (`_updateShop`)
  now goes through `spendGameWallet`. `_renderShop` reads the wallet
  via a new `_stardollars()` accessor for both the header and per-card
  affordability checks. `endCity('win')` increments
  `citiesClearedThisRun`; `endCampaign(true)` increments
  `campaignsWonThisRun` and sets `victoryAchieved`. New
  `coinsEarned()`: `citiesClearedThisRun * 5 + campaignsWonThisRun * 25`
  (was `floor(score / 5000)` against peak net worth — indirectly leaked
  the autobuyer economy into the global pool).

All three games default to NG+/persistent (no wipe-on-victory). Save
compatibility preserved via legacy migrators on reactor + franchise;
orbital persist.js also lifts any pre-existing data-blob stardust into
the wallet. All five edited files pass
`node -e "new Function(require('fs').readFileSync('<path>','utf8'))"`.

### Per-game wallet migration — bloom, barrage, tanks, diner, sigil
Followed `docs/plans/2026-04-19-currency-migration.md`. Five more games
moved off the global theme-coin pool and onto namespaced per-game
wallets (`Storage.*GameWallet(GAME_ID, ...)`). All five now earn theme
coins from milestone counters, not pickup-inflated `score / N` formulas.

- `games/bloom/game.js`: `runCoins` now seeded from
  `getGameWallet('bloom')` and persisted on every mote pickup, boss
  kill, biome advance, death, and shop transaction. Removed
  `Storage.addCoins(this.runCoins)` from the post-run shop's continue
  button (was leaking motes into the global pool). Shop spends via
  `spendGameWallet`. Killing The Maw in the Void biome now sets
  `victoryAchieved = true` and calls `this.win()` (previously the run
  just sat in 'biomeUp' with no terminator). New `coinsEarned()`:
  `biomesClearedThisRun * 8 + (victory ? 25 : 0)`.
- `games/barrage/game.js`: `coinsHeld` seeded from
  `getGameWallet('barrage')`; persisted at every wave end and on city
  loss. Shop's `_buy` spends via `spendGameWallet`. Tracks
  `wavesClearedThisRun`, sets `victoryAchieved` before the win timeout.
  New `coinsEarned()`: `waves * 3 + (victory ? 20 : 0)`.
- `games/tanks/game.js`: `coinsHeld` seeded from
  `getGameWallet('tanks')`; persisted on match win and game over. Shop
  weapon purchases spend via `spendGameWallet`. Tracks
  `matchesWonThisRun`, sets `victoryAchieved` before final `win()`.
  New `coinsEarned()`: `matches * 4 + (victory ? 20 : 0)`.
- `games/diner/game.js`: removed broken `NDP.Engine.Storage.coins` /
  `Storage.save()` direct-mutation calls (no such API). The kitchen
  shop now reads `getGameWallet('diner')` and spends via
  `spendGameWallet`. Each day's `dayTips` is banked into the wallet at
  day-end so the player has tips to spend in the next sanctum visit.
  Tracks `daysCompletedThisRun`; the critic-day clear sets
  `victoryAchieved` before the victory splash. New `coinsEarned()`:
  `days * 5 + (victory ? 25 : 0)`.
- `games/sigil/game.js`: removed broken `NDP.Engine.Storage.coins` /
  `Storage.save()` calls. Sanctum reads `getGameWallet('sigil')` and
  spends via `spendGameWallet`. `_defeatBoss` deposits
  `60 + ch.n * 40` essence into the wallet so chapter clears feed the
  perk shop directly. Tracks `chaptersClearedThisRun`; clearing the
  Dragon (last chapter) sets `victoryAchieved` before `this.win()`.
  New `coinsEarned()`: `chapters * 8 + (victory ? 25 : 0)`.

All five files pass `node -e "new Function(...)"` syntax checks. Meta
state (best wave / best biome / unlocked weapons / unlocked glyphs /
stations / perks / best chapter / best day) preserved; only currency
plumbing changed. Default-to-NG+ (no wipe-on-victory) for all five —
matches plan guidance for non-vaultbreaker games.



### Franchise Frenzy — multi-city campaign expansion
User feedback: "Franchise frenzy only has one 60s level lets immprove it."
Followed the pattern that landed for Reactor earlier today — turn the
single 60-second shift into a 5-city campaign with persistent
meta-progression, in-run depth, and new content. See full design in
`docs/plans/2026-04-19-franchise-expansion.md`.

- `games/franchise/data.js` (NEW): catalog file. 10 business tiers
  (3 new — Casino at city 3, Movie Studio at city 4, Spaceport at
  city 5), 5 cities (Smalltown → Skyport, exponential targets
  $5K → $40M), 5 random events (Rush Hour, Viral Moment, Tax Audit,
  Investor Knock, Power Outage), 5 meta upgrades (Seed Capital,
  Click Force, Industry Boost, Tycoon Time, Headhunter), synergy
  curve (×1.25 / ×2 / ×4 at 10/25/50 owned), manager + Stardollar
  formulas. Pure data — no canvas, no engine refs. Published as
  `window.NDP.Franchise`.
- `games/franchise/game.js`: full rewrite. State machine now has four
  phases — `shop` → `play` → `transition` → `debrief`. Pre-campaign
  shop UI shows progress strip, Stardollar count, all 5 meta upgrade
  cards with current/next effect labels, and a BEGIN CAMPAIGN button.
  Play loop owns the per-city run: cash and businesses persist across
  cities; per-city net-worth target with checkmark indicator; tier
  reveal gated by both cash threshold *and* `unlockCity`; manager
  hire flow (button → click target tier card to assign; auto-buyer
  on a 0.6 s cadence); event scheduler that fires N events per city
  with banner + countdown bar + colored vignette overlay; floating
  green envelope for the Investor event with 5 s click window;
  city-5 boss panel ("Hostile Takeover") that replaces the flagship
  for 15 s and forces the player to choose between earning cash or
  hammering the OUTBID button. Debrief screen shows campaign
  summary, awards Stardollars, offers SPEND STARDOLLARS (back to
  shop) or FINISH RUN (kicks the global end overlay so coins are
  awarded). Per-city background tint via `CITIES[i].bg`. Shop card
  layout grew from 2×4 to 2×5 to fit all 10 tiers; locked tiers
  show "unlocks <CityName>" instead of a generic "??? LOCKED ???".
  Coin formula recalibrated (`floor(score / 5000)`) since net worth
  now ranges into the millions.
- `games/franchise/manifest.js`: blurb + description + controls
  rewritten for the campaign. Manifest preview unchanged.
- `index.html`: load `games/franchise/data.js` between manifest and
  game.js; cache-bust all three with `?v=2`.
- Tested in browser: shop renders → BEGIN CAMPAIGN → city 1 plays →
  flagship clicks earn cash → buying lemonade ticks $/s → end of
  city → debrief on miss / transition on win → city 2 unlocks
  manager button, casino still gated to Boomburg → cash + tiers
  carry over across cities.

### Learn to Heist — Vehicle was rendered upside-down
Follow-up: user reported the rocket "looks inverted." Root cause in
`_drawVehicle()` was a stale rotation convention. `player.angle` is
already stored in *canvas* convention (negative = up — same convention
the velocity arrow, lift maths, and ballistic preview all use), so
`ctx.rotate(angle)` is the correct call to align the body with the
flight direction. The old code did `ctx.rotate(-angle)`, which mirrored
the entire body across the horizontal axis: the velocity arrow pointed
up-right but the body pointed down-right and the booster flame came out
the wrong side of the rocket.

- `games/learntoheist/game.js` `_drawVehicle()`: `ctx.rotate(-angle)` →
  `ctx.rotate(angle)` with a comment explaining the convention so this
  doesn't get re-flipped by future edits.
- `index.html`: bumped learntoheist scripts to `?v=3`.

Verified in-browser: rocket nose now points along the flight vector,
booster flame streams out the rear of the rocket instead of the top.

### Learn to Heist — Booster fix (was useless at base tier)
User reported "the booster doesn't work at all". Root cause: tier 0
"Firecracker" thrust was **480 m/s²** while gravity is **520 m/s²**, so
even pointing the rocket straight up and holding SPACE the player still
*fell* (~31 m lost over 1 second of full burn, verified in-engine).
Combined with a fast 0.22/s fuel burn that drained the 1.2-unit tank in
~5 seconds, the booster was a net negative on flight time at the
starting tier. Fixed across data + simulation + visuals.

- `games/learntoheist/content.js` `UPGRADES.booster.tiers`:
  - **Thrust ladder rebalanced** so even tier 0 comfortably overcomes
    gravity. Was `480/620/780/980/1240/1520`, now
    `900/1120/1380/1700/2050/2500`. Tier 0 now climbs at ~+380 m/s²
    pointed straight up (was -40, i.e. fell).
  - **Fuel tanks bumped** so the booster lasts long enough to feel
    powerful: `1.2/2.0/3.2/4.6/6.2/9.0` → `1.6/2.4/3.4/4.8/6.4/9.0`.
  - Description updated: "Even tier 0 beats gravity."
- `games/learntoheist/game.js` `_updateFlight()` booster block:
  - **Engagement kick.** First frame of a press now adds an
    instantaneous `thrust × 0.04` impulse along the nose plus a small
    screen-shake, so the rocket *fires* instead of ramps. `_wasBoosting`
    flag tracks press edges.
  - **Fuel burn slowed** `0.22/s → 0.16/s`. Combined with the bigger
    starter tank, base tier now boosts for ~10 seconds before going dry
    (was ~5).
  - **Boost loop SFX throttled** to one beep per ~90 ms via a
    `_boostSfxT` countdown. The old `(boosterT % 0.05) < dt` test
    fired basically every frame at 60 fps and sounded like a buzzsaw.
  - **Thicker trail** — 3 particles per frame across orange/red/yellow
    with a thrust-direction component baked in, so the plume streams
    *out the back* of the nose rather than just trailing the body.
- `games/learntoheist/game.js` `_drawVehicle()` booster flame:
  - 4-layer flame (outer red plume → orange → yellow core → white-hot
    tip) instead of the old 2-layer triangle, with a slower flicker
    period (`Date.now() * 0.025` was `0.06`) so the flame is actually
    legible at 60 fps. Plume length scales with booster tier.
- `index.html`: `?v=2` cache-buster on the four `learntoheist/*.js`
  script tags so the browser picks up the rebalance.
- `main.js`: exposed `NDP._activeGame` (read-only) for in-browser
  verification of game state during dev/testing.

Verification: reloaded the game with a fresh save, set the player to
y=300 / vy=0 / angle=−π/2 (straight up), held SPACE for 1 second.
Result: vy 0 → +441 m/s, altitude 300 → 532 (gained **+232 m**).
Pre-fix the same test produced -60 m/s, -31 m altitude.

### Tanks — Slingshot aiming (anchor anywhere, pull back to fire)
Previous fix had switched to "drag toward target" so the firing direction
matched the drag, but the player tank lives at x=80 and reaching max power
still required dragging hundreds of pixels right *from the tank* — which
combined with the tank's left-edge spawn meant cramped, awkward aiming and
could push the cursor off-canvas in scaled viewports. The user wanted the
opposite: be able to **start the click on the right side of the screen**
and pull *left* to launch a powerful shot to the right.

- `games/tanks/game.js` `updatePlayer()`: rewritten to true Angry Birds-
  style slingshot.
  - On `mousedown`, store an **anchor** at the click position (anywhere on
    canvas — independent of the tank's location).
  - While dragging, compute pull = `anchor − currentMouse`. Power scales
    with pull length (`L * 3.0`, capped at 700). Firing angle = direction
    of the pull vector (i.e. opposite of the drag direction).
  - On release: if pull was below a small dead zone (power < 80), cancel
    silently with a "Pull farther to fire" hint instead of misfiring.
  - State cleared on release so each turn starts fresh.
- `games/tanks/game.js` `render()`: draws the slingshot rubber-band — a
  dashed line from anchor to current mouse, anchor dot stays gold, drag dot
  goes gold once you've pulled past the dead zone. The trajectory preview
  from the tank still shows the predicted arc using `aim.angle`.
- Updated turn hint: `CLICK & PULL BACK (slingshot), RELEASE TO FIRE`.
- `games/tanks/manifest.js`: description and controls updated to describe
  slingshot aiming and weapon hotkeys.
- `index.html`: bumped tanks scripts to `?v=3` to bust browser cache.

### Currency model — per-game persistent wallets, victory wipes Vaultbreaker
Established a hard separation between **per-game** currency (stays inside one
game, persists across runs of that game, used for that game's meta-shop) and
the **global** theme-shop coins (earned by *playing* games but not coupled to
in-game economies). Vaultbreaker is the first game converted to the new
pattern; same shape can be applied to Reactor / Diner / Orbital later.

- `engine/storage.js`:
  - Added `getGameWallet(id)`, `addGameWallet(id, n)`, `spendGameWallet(id, n)`,
    `setGameWallet(id, n)` — per-game persistent currency, namespaced by game
    id, stored alongside but separate from `data` blob and global `coins`.
  - Added `clearGameData(id)` — wipes a game's `data` and `wallet` while
    preserving `hi`/`plays` so selector cards still show high score after a
    "completion reset".

- `games/vaultbreaker/game.js`:
  - **Coins persist between runs.** `coinsHeld` is now part of the
    vaultbreaker save blob; `_loadSave`/`_writeSave` round-trip it.
    `init()` seeds `coinsHeld` from save instead of zero, so dying at
    Vault 4 with 80 coins banked means your *next* run starts with 80.
    Save is checkpointed when entering each intermission so a refresh
    mid-shop doesn't lose pickups.
  - **Victory = clean slate.** `_persistOnEnd(true)` now calls
    `Storage.clearGameData('vaultbreaker')` and resets the in-memory save
    mirror to defaults. Beating the campaign wipes weapons, tiers, max
    HP, magnet tier, and the persistent coin wallet — the next heist
    starts from the pistol. The reset *is* the trophy.
  - **Global theme coins decoupled.** `coinsEarned()` no longer derives
    from in-run `score` (which was inflated by per-coin pickups, leaking
    in-game economy into the shared wallet). New formula: `4 ×
    levelsClearedThisRun + 20 if victoryAchieved`. Worst case full
    clear ≈ 44 theme coins (vs old ~280), much more honest against
    150-600 cost themes.
  - Intro card on Vault 1 surfaces "Bank: ● N coins from last run" so
    players see their persistent wallet.
  - Victory card explicitly tells the player the vault wipes itself
    behind them so the next-run reset isn't a surprise.

### Crypt — Fixed "stuck on floor 2" spawn-trap bug
User reported being unable to move on floor 2. Root cause: `buildRoom()` placed
pillars at random tile positions in rows `[3, rows-4]` × cols `[3, cols-4]`,
which overlaps the hero spawn cell (col ~3, row ~rows/2). When a pillar landed
on the hero's spawn tile, every move was rolled back by `hitsWall()` because
the hero was already inside a non-floor tile, locking the player in place. The
bug existed on every floor; floor 2 just crossed the pillar-count threshold
(3 pillars vs floor 1's 2) where it became frequent enough to notice.

- `games/crypt/game.js`:
  - Pillar placement now skips a reserved zone around the hero spawn corridor
    (cols ≤ 4, ±2 rows of mid) and the stairs corridor (cols ≥ cols-4,
    ±2 rows of mid). Tries up to 20 random positions before giving up on a
    pillar rather than ever blocking spawn or exit.
  - Safety net: after building the room, if the hero's hitbox still overlaps
    a non-floor tile, scan outward in concentric rings from the spawn cell
    for the nearest clear tile and warp the hero there. Guarantees movement
    is never locked, regardless of future map-gen changes.

### Orbital — Expansion Phases 1 + 2 shipped (BTD4-style depth pass)
Executed phases 1 + 2 of the expansion plan (`docs/plans/2026-04-19-orbital-expansion.md`).
Orbital's single 1.7K-line `game.js` was split into a thin orchestrator plus
14 module files under `data/`, `lib/`, `ui/`, all attached to a new
`NDP.Orbital` namespace. The play area was narrowed to `W − 240` so a
persistent BTD4-style right-rail panel can hold the prominent stats strip,
tower shop, and a full upgrade tree on the selected tower — replacing the
old transient popup + bottom tray. All 10 existing towers gained dual 4-tier
upgrade paths with a path-cap rule (only one path past T2), 4 new towers
shipped (Sniper, Engineer, Cryo, Chrono), 6 new enemy modifiers (camo, lead,
fortified, swift, armored, regen), 28 active abilities reachable via the
upgrade tree (`Q`/`E` hotkeys for path A/B), tower XP with three levels,
targeting priorities (First/Last/Strong/Close), a 50-round campaign across
five named acts, an end-of-round recap with no-leak streak + combo bonuses,
and a Stardust meta currency persisted across runs. Quant interest +
bounty-aura economy from the previous session is now wired through the new
`lib/economy.js`. Tier upgrades are reflected on the tower sprite at runtime
via programmatic overlays drawn by `lib/overlay.js` (per-path accents, dots,
rings, spikes, crowns, auras, plus XP pips), so the canvas mirrors the
upgrade state without per-tier sprite art. Smoke-tested in the browser:
modules attach cleanly, Round 1 plays out, side panel shows live stats,
Dart placement + Tier-1 Path A buy correctly bumps RPS 3.2 → 4.6, deducts
$200, updates the refund value, and adds the orange path-A marker on the
tower sprite. Two small bugs fixed during the smoke test: `Rounds.actFor(0)`
fell through to the last act ("Act V — Final Stand" in the pre-first-wave
display); clamped the lookup to `max(1, round)` and the panel now shows
"1/50 · Act I — First Contact" while idle.

- **New file layout (all IIFEs publishing onto `NDP.Orbital`):**
  - `games/orbital/lib/namespace.js` — bootstraps `NDP.Orbital` with null
    placeholders so module load order is forgiving.
  - `games/orbital/lib/upgrades.js` — dual-path purchase rules, path-cap
    enforcement, `rebuildStats(tower)` from base + bought-tier patches,
    refund value, `newPlacedTower(key, x, y, t)`.
  - `games/orbital/lib/xp.js` — `THRESHOLDS = [10, 30, 75]`, `levelOf`,
    `statMul(level)` for level 1/2/3 passive bonuses, `grant(tower, n)`.
  - `games/orbital/lib/targeting.js` — First/Last/Strong/Close priority
    functions + cycle helper for the TGT button and `T` hotkey.
  - `games/orbital/lib/economy.js` — `roundBonusBreakdown(game)` (base +
    no-leak streak + combo kicker), `applyInterest(game)` (Quant tower
    interest on cash reserves at wave start, with diminishing returns when
    multiple Quants are placed), `applyBountyAura(...)`, `stardustFromScore`.
  - `games/orbital/lib/persist.js` — load/save run records and Stardust via
    `Storage.getGameData('orbital')`.
  - `games/orbital/lib/enemy-mods.js` — registry + `applyAll`/`tickAll`/
    `drawAll`/`damageMul`/`bountyMul`/`isVisibleTo` for camo, lead,
    fortified, swift, armored, regen.
  - `games/orbital/lib/overlay.js` — `drawTierOverlay(ctx, tower)` adds
    per-path accents (orange Path A, blue Path B; dots → rings → spikes →
    crowns/auras as tier climbs) plus XP chevron pips. Also draws the small
    `GLYPHS` (rate / dmg / range / pierce / splash / burn / etc.) used in
    the upgrade-tree icons.
  - `games/orbital/data/towers.js` — catalog for all 14 towers; each has
    `base` stats + `paths.A`/`paths.B` with 4 tiers; each tier carries a
    `cost`, `label`, `desc`, stat `patch`, glyph id, and optional `ability`.
  - `games/orbital/data/abilities.js` — 28 active abilities with `cd`,
    `glyph`, `color`, `activate`, optional `tick` and `multiplier`.
  - `games/orbital/data/enemies.js` — `swarmer`, `ast`, `drone`, `bigast`,
    `summoner`, `ufo`, `boss`, `titan`. Re-uses existing `orb_meteor_*` and
    `orb_elite` sprites where possible; adds `orb_enemy_swarmer` +
    `orb_enemy_summoner`.
  - `games/orbital/data/rounds.js` — 50 rounds across 5 acts with metadata
    for the recap banner: I First Contact, II Hidden Threats, III Heavy
    Assault, IV Escalation, V Final Stand. Hand-tuned R1-R30, formulaic
    R31-R50, with mid-bosses at R30/R45 and a mega-boss at R50.
  - `games/orbital/ui/side-panel.js` — 240px-wide right rail. Sections:
    big stats strip (CASH huge / LIVES + STARDUST / ROUND + act subtitle),
    wave controls (START WAVE button + 1×/2× toggle), tower buy list with
    hotkey hints, on selection a full per-tower view (stats line, two path
    rows of 4 tier glyph buttons each with state coloring + path-cap lock,
    tooltip on hover, TGT button, SELL refund). Click hit-testing routes to
    `game.tryBuyTier`, `game.sellSelected`, `game.fireAbility`, etc.
  - `games/orbital/ui/recap.js` — round-end banner showing base + streak +
    combo bonus and total cash gained; "PERFECT WAVE" banner when no leaks.
- **`games/orbital/sprites.js`** — added 4 tower SVGs (sniper, engineer,
  cryo, chrono) and 2 enemy SVGs (swarmer, summoner). `manifest.js` got the
  matching `orb_turret_*` / `orb_enemy_*` registrations.
- **`games/orbital/game.js`** — rewritten as a slim orchestrator that
  consumes `NDP.Orbital`. Real-time `dt` is split into `rdt` (UI/input) and
  `sdt` (simulation, scaled by `gameSpeed`) so the 2× toggle from the prior
  session interoperates cleanly with the new round/recap timing. Tower
  update is generic (recoil, XP, ability cooldowns/ticks) and dispatches
  to per-archetype `_update*` methods that read from the patched stats
  block (`st.multiShot`, `st.capacitor`, `st.focusBuildup`, `st.stunPulse`,
  `st.lance`, `st.bossDmg`, `st.mortar`, etc.). Damage application goes
  through `EnemyMods.damageMul` so lead/armored/fortified gating happens
  in one place. Combo + no-leak streak are counted live and consumed by
  the recap. Enemy splits, summoner spawns, and all FX (tesla arcs,
  support pulses, beams, flare lances, mine blooms, projectile homing,
  freeze, brittle, fragmentation, splash) are reimplemented over the new
  data shape.
- **`index.html`** — wired all 14 new scripts in dependency order with
  `?v=3` cache buster on every `games/orbital/*.js`.

### Orbital — Expansion plan drafted
Sized up a full BTD5/BTD6-tier expansion for Orbital with the focus on tower
depth (the user's stated headline: "vastly improved and more depth added,
especially around towers and upgrades"). Plan structured into four
independently-shippable phases.

- `docs/plans/2026-04-19-orbital-expansion.md` (new) — full design doc:
  pillars, file/namespace split (`game.js` → `data/`, `lib/`, `ui/`
  subfolders + `NDP.Orbital` namespace), two-path upgrade data shape,
  path-cap rule (only one path past T2), 80 upgrade nodes catalogued
  across the 10 existing towers, ~20 active abilities with hotkeys
  (`Q`/`E` proposed for path A/B), tower XP/level system with chevron
  pips, targeting priorities (First/Last/Strong/Close), round-end recap
  with no-leak streak multiplier, Stardust meta currency, Phase 2 content
  (4 new towers + 5 new enemy mods + 50 rounds), Phase 3 maps + difficulty
  (3 new map geometries + Hard/Apocalypse), Phase 4 heroes + meta
  (3 heroes, Star Charts tree, endless, daily, sandbox), acceptance
  criteria for Phase 1, risk register, effort estimate (~12-18 days for
  full vision).
- `docs/roadmap.md`: linked the plan under cross-cutting goals.

### Reactor — 10-day campaign, research tree, 5 new modules, 4 new events
The original 60-second tycoon (user feedback: "I just beat the game on day 60")
is now a 10-day campaign (each day is one 60-second shift) with persistent
meta-progression. Cash + modules carry between days, difficulty escalates per
day, and Research Points unlock permanent run-start buffs.

- **New file split.** Reactor is now five files instead of one. Each is an IIFE
  that publishes onto `NDP.Reactor`:
  - `games/reactor/modules.js` — module catalog (11 modules), cost growth,
    derived-stat recompute, glyph drawing.
  - `games/reactor/events.js` — meteor / flare / leak / investor / aurora /
    surge / quake catalog, in-flight meteor list, laser interception, comet
    shower (boss event), investor card overlay.
  - `games/reactor/research.js` — 10-node research tree, persistent state via
    `Storage.mergeGameData('reactor', { research })`, research panel UI.
  - `games/reactor/campaign.js` — day state machine, recap UI, daily-objective
    pool (8 objectives, 3 random per day), per-day difficulty knobs.
  - `games/reactor/game.js` — shrunk to orchestrator (1100 lines): main loop,
    throttle/vent/HUD/cards UI, day flow, glue between the four sub-modules.
- **5 new modules.** Solar Array (heat-free $/s), Containment Laser (chance to
  vaporize incoming meteors per level), Helium Pump (rewards 20-60% throttle
  stability with growing income mult, capped +50% per pump), Worker Habitat
  (+1 worker, +5% income mult per habitat — also spawns a roaming astronaut),
  Black Box Backup (one-time meltdown revive, consumed on use).
- **4 new events.** Investor Visit (modal overlay, pick 1 of 8 cards: cash
  burst, free modules, risky loan, overclock, etc. — auto-picks first card
  after 6s; gameplay paused while open). Aurora (+50% income & cooling for 5s).
  Reactor Surge (+50 heat instant, +200% income for 4s — risk/reward). Lunar
  Quake (random module damaged unless shielded). Day 5 + Day 10 fire scripted
  Comet Showers (10/14 meteors over 8/10s).
- **Persistent research tree.** 10 nodes, 1-3 RP each, total ~18 RP to fully
  unlock. Earn +1 RP per day survived plus +1 RP per daily objective passed
  (~13 RP per perfect 10-day run). Nodes affect run-start state: Subsidies
  (+$200 start), Reinforced Dome (+20 max heat), Quick Vent (3s → 2s cooldown),
  Better Optics (longer meteor warning life), Helium Bonus (×1.10 base mult),
  Insulation (+30% passive cooling), Veteran Crew (free Mining Rig at start),
  Stockpile (+20 max coolant, start 80), Auto-Trader (+1%/s mult while
  throttle <50%, cap +30%), Galactic Investor (+$1K every $50K total earned).
- **Per-day difficulty curve.** Meteor cadence shrinks 14-18s (day 1) → 3-9s
  (day 10). Flare and leak cadences scale similarly. Max heat ceiling drops
  from 100 (day 1) to 84 (day 10). Days 7+ can spawn meteor bursts.
- **3 random daily objectives.** Pool of 8 (earn $X, survive Y meteors, don't
  vent, buy 2+ modules, never exceed 90% heat, end day with $Y banked, own 4+
  distinct module types, hold throttle ≥30% for 30s total). Tracked live via
  `dayStats` and shown checked/unchecked on the recap.
- **Recap screen.** Drawn inside the canvas (not the engine's HTML overlay) so
  the campaign can continue uninterrupted between days. Shows day stats,
  objective results, RP earned breakdown ("N day + M obj"), and the full
  research panel for spend-on-the-spot upgrades. Buttons: NEXT DAY (continue),
  NEW CAMPAIGN (hand off to engine for "Play Again"), ENDLESS MODE (after
  campaign complete).
- **Endless mode.** Unlocks after first campaign clear. Continues past day 10
  with rising difficulty; comet shower every 5 days.
- **Internal mode state.** Engine `state` stays `'playing'` for the whole
  campaign. The new `mode` field ('playing' | 'investor' | 'recap') gates
  which update path runs. `gameOver()`/`win()` only fire when the player
  chooses NEW CAMPAIGN from a meltdown/campaign-complete recap.
- **HUD.** Now shows `DAY N/10  ·  Time  ·  Heat%  ·  $/s  ·  Cash  ·  RP`,
  with a thin sky-blue progress bar across the top of the canvas tracking
  day completion.
- **Module pod layout.** Reorganized to 11 positions in a fan around the
  reactor (was 6).
- **Right-side cards.** Compressed card height 50→40 px to fit all 11
  modules in the same panel without scrolling.
- **Earth-rise.** Earth in the sky slowly rises across the campaign, marking
  visible day progression.
- **Save schema.** Reactor's data lives under
  `Storage.getGameData('reactor').research` so older saves are forward-safe.
- `index.html`: 6 reactor script tags with `?v=4` cache buster.
- `docs/plans/2026-04-19-reactor-expansion.md`: design doc describing all of
  the above before implementation.

### Orbital — Quant rework + 2× speed toggle
Quant Advisor was a money fountain: dropped a tower anywhere and it printed
$10/sec (26/sec upgraded) plus a flat $40/$120 dividend at every wave start.
Independent of placement, kills, or play. Effectively a "win the economy"
button. Reworked into a placement- and play-coupled tool, and added the
fast-forward QoL pass that BTD-style games need.

- `games/orbital/game.js` TOWERS.quant: removed `incomePerSec` and
  `roundBonus`. New fields: `range: 130/170`, `bountyMult: 0.35/0.85`,
  `interestRate: 0.04/0.08`, `interestCap: 40/120`. Quant now has an aura.
- Bounty aura: any enemy popped inside a Quant's range pays
  `floor(bounty × (1 + mult))`. The bonus floats up as `+$N` so the player
  sees where the value is coming from. Multiple Quants stack with diminishing
  returns — the strongest applies fully, each extra contributes 50%.
- Wave-start interest replaces the flat dividend: `floor(cash × rate)` capped
  at `interestCap` per Quant. Same diminishing-stack rule. Encourages saving
  without snowballing or making cash spent on towers feel "wasted".
- Quant added to symmetric (non-rotating) tower list since it's pure aura.
- Stat-popup lines updated: `+35% BOUNTY in range 130` /
  `4% INTEREST/wave (max $40)`.
- `gameSpeed` field with a 1× ↔ 2× toggle. Only the world-sim dt is scaled
  (enemies, projectiles, towers, slow/burn/regen, wave spawn timing). Real
  time still drives input, message/floater fade, and shake/flash so the UI
  doesn't feel choppy.
- New `drawSpeedBtn` next to START WAVE; F-key edge-triggered toggle with the
  same latch pattern as SPACE. HUD shows `Speed 2×` in gold while active.
- Floater system (`spawnFloater` + `drawFloaters`) for transient on-canvas
  callouts; currently used for the bounty bonus, easy to extend to crit/burn
  feedback later.
- `games/orbital/manifest.js`: controls hint mentions the F fast-forward.
- `index.html`: `?v=2` cache buster on `games/orbital/game.js`.

### Tanks — Real enemy AI (was effectively firing off-screen)
The old `updateEnemy()` computed `Math.PI + Math.atan2(dy - 80, dx)` with
`dx ≈ -800`. That collapses to roughly `0 rad` — meaning the enemy was
firing **right and slightly down** off the canvas, every turn. Power was
also a hand-tuned `200 + dist*0.7` constant that ignored wind, gravity,
terrain, and the actual shell's `gravMul`/`windMul`.

- `games/tanks/game.js`: replaced `updateEnemy` with a brute-force aim
  solver (`_solveEnemyAim` + `_simulateShot`) that samples angles in
  `(π, 3π/2)` × power `200..700`, runs the real projectile physics
  (gravity, wind, terrain), and picks the trajectory with the smallest
  closest-approach distance to the player tank.
- The simulator includes a "muzzle armed" grace so launches that graze the
  enemy's own terrain don't disqualify themselves.
- Difficulty curve: `skill = min(0.92, 0.45 + (map-1) * 0.13)`. Map 1
  jitters ±~9° and ±35 power (very beatable); map 5 caps at ±~0.7° and
  ±~3 power (hits almost every turn but never literally always).

### Tanks — Fix unaimable shots (drag-toward-target)
Aim was slingshot-style: the angle was computed as `tank - mouse`, so the shot
fired *opposite* to the drag. The player tank sits at x=80, and meaningful
power requires ~250+ px of drag, so reaching the enemy on the right meant
dragging the mouse far off the left edge of the canvas — literally
unhittable for many setups.

- `games/tanks/game.js` `updatePlayer()`: angle now uses `mouse - tank` so the
  drag direction matches the firing direction. Power still scales with drag
  distance (intuitive "pull a slingshot in the direction you want to shoot").
- Updated turn hint: `DRAG TOWARD TARGET, FURTHER = MORE POWER`.
- The aim trajectory preview already uses `aim.angle` so it auto-corrects.

### Barrage — Difficulty rebalance (was way too easy)
The 10-wave campaign was a cakewalk: huge default blast radius, slow missiles,
weak ramp, and exotics arriving so late they barely showed up.

- `games/barrage/game.js` `_burstRadius()`: base `70 → 56`, per-upgrade `+25 →
  +20` (still meaningful, but you can't carpet-clear with one click).
- `_startWave()`: missile count `6 + n*2 → 8 + n*3` (w1 11, w5 23, w10 38),
  initial spawn delay `1.0s → 0.7s`.
- Spawn cadence `max(0.32, 1.2 - n*0.06) → max(0.22, 1.0 - n*0.075)` and
  jitter window narrowed (`0.55 + r*0.65`). Late waves now feel like an actual
  barrage.
- Missile speed `60 + n*6 → 70 + n*10` (w10 ~170 vs old ~120).
- Splitter introduced at wave 3 (was 4); now spawns **3** children with
  steeper spread and faster descent. Armored introduced at wave 5 (was 7),
  HP `2 → 3`.
- New **fast** missile (white, small, ×1.55 speed) appears from wave 5; new
  **mirv** missile (red, double-ringed, HP 2) appears from wave 9 and splits
  into 3 splitters at high altitude — a full MIRV ladder.
- Burst arming time `0.18s → 0.26s` so well-timed clicks matter more.
- Coin economy compensates: per-wave payout `25 + n*10 + cities*6` (was
  `20 + n*8 + cities*5`); MIRV drops 6 coins, fast drops 2, others unchanged.
- Trail/head colours and HP rings added for the two new types.

### Sand — Boots into campaign + onboarding overhaul
The Sand cartridge previously dropped the player into a freeform sandbox with a
seeded NOT-gate demo and a one-line brief — there was no signposting that ten
hand-authored L1 levels (`L1_01_buffer` through `L1_10_tristate`) even existed,
and no in-game guidance for someone who has never wired a transistor circuit.

- `games/sand/game.js`: on `init()` now asynchronously loads
  `Levels.load({ basePath: 'games/sand/data' })`, sorts the L1 layer by
  `order`, and auto-selects the first **unsolved** level (or `L1_01_buffer` if
  none are solved). The workspace seeds an empty graph with the level's input
  pads pre-placed on the left and output pads on the right at sensible y
  spacing, so the player only has to wire the middle. Added `_loadLevel(id)`,
  `_resetCurrent()`, `_nextLevel()`, `_toggleSandbox()`, and `_refreshUI()`
  helpers.
- `games/sand/lib/ui-brief.js`: rewrote the brief panel into a level-aware
  card. Header now reads `LEVEL N — Title  ★★☆`. Body shows the level's
  brief with a `solved!` chip when previously cleared. A detail block renders
  the truth-table (with green/grey 0/1 cells), the 3-star targets
  (`≤ N gates`, `≤ N ticks`), and the allowed-parts pill list. A new
  **Tutorial** section (only on `L1_01_buffer` and `L1_02_not`) walks
  first-timers through the exact chips and wires they need to place. The
  tutorial has a one-click `×` to dismiss permanently, persisted via
  `Storage.mergeGameData('sand', { settings: { tutorialDismissed: true } })`.
  A new `? Controls` button pops a full keyboard/mouse cheat sheet
  (drag-chip, hotkeys 1–7, click-pin-to-pin wiring, click-row to toggle,
  Step/Run/Test, pan/zoom, box-select+Delete) that closes on any input.
- `games/sand/lib/ui-topbar.js`: rebuilt the top bar with a level dropdown
  (shows star counts: `1. Buffer ★★★`), `Reset`, primary `Next ▸`, and a
  `Sandbox`/`◂ Campaign` toggle. Breadcrumb now reads `sand ▸ Layer 1 ▸ XOR`
  in campaign mode and `sand ▸ Sandbox` in free build.
- `games/sand/sand.css`: added styles for the level picker, topbar buttons
  (with primary/active states), the truth-table grid, allowed-parts pills,
  3-star target line, tutorial list, persistent dismiss `×`, and a centred
  `sand-cheat` overlay.
- Sandbox is one click away — toggling it preserves the previous demo NOT
  graph behaviour, so anyone already comfortable with the cartridge keeps
  their freeform workspace.

All 75 existing sand `node --test` tests still pass.

### Learn to Heist — Flight model rewrite (Learn to Fly feel)
The old direct-thrust model (rocket steered by `cos(angle) * thrust`, glider
adding flat upward lift, passive nose-snap toward velocity) felt mushy and
unlearnable. Replaced with proper arcade aerodynamics in
`games/learntoheist/game.js`:
- **Pitch is pure player authority** — no auto-recovery, A/D rotates the body
  at a bounded rate and that's where it stays.
- **Lift = perpendicular to velocity, scaled by `density · speed² · sin(AoA)`**
  with a stall above ~34° (lift collapses, drag spikes). Glider tier
  multiplies the lift coefficient massively; the body still gives a sliver
  of lift on its own.
- **Drag is small at zero AoA, brutal when broadside**, and both lift & drag
  scale with **air density that falls off to ~0 by 2500 m**.
- **Booster is pure thrust along the nose direction** (steering = pitch).
- **Skip-on-shallow-impact ground collision** so you can skim the grass like
  a stone (`SKIP!` floater) instead of instantly pancaking.
- **Removed HP entirely** — the only way the run ends is hitting the ground
  (or coming to a dead stop on it). Hazards now only brake your speed and
  give your nose an angular kick (`OOF!` / `HIT` floaters); bullets shove and
  slow you. HP bar removed from the HUD; fuel bar widened to fill the slot.
- **HUD additions**: yellow velocity-vector arrow on the player so you can
  read your AoA, pulsing red `STALL` ring when AoA exceeds the stall edge,
  dotted ballistic preview during the aim phase.
- **Slowed launch meters** (aim 1.55 rad/s, power period 2.5 s) and rebalanced
  initial launch power (`0.55 + p·0.75` of ramp tier) so a clean tap is
  rewarded but a sloppy one still gives a real flight.
- Manifest controls string updated to mention pitch + glider toggle.

### Arcade Six Depth Pass — Snake / Pong / Breakout / Asteroids / Helicopter / Frogger
Six remaining shallow games rebuilt to the same depth bar set by the
Shallow-Six pass. Each gets a sister `sprites.js` (inline-SVG atlas), an
internal `phase` machine driving the campaign, persistent perks bought from
global coins, and at least one boss. All wired through `index.html` with `?v=2`
cache-busters. Design doc: `docs/plans/2026-04-19-arcade-six-design.md`.

- **Snake — Serpent Campaign** (`games/snake/`)
  - 4 biomes (Grass / Desert / Cave / Digital), 8 apples per biome, then a
    **Worm Boss** duel — brush the worm's body to spawn golden apples; eat 3
    to defeat it.
  - Power-ups (Slow-mo, Ghost, Magnet) drop in-run.
  - Persistent perks (Lateral start length, Slow Start, Iron Apple, Magnet+).
  - Custom SVG snake head, body, apples, golden apple, cacti, glitch tiles,
    worm boss segments, perk icons.
- **Pong — Gauntlet** (`games/pong/`)
  - 5-opponent ladder: Rookie, Cadet, Veteran, Master, Champion (the Champion
    fields stacked twin paddles, best-of-5).
  - Each match first-to-5 (3 vs Champion); pick a perk between matches.
  - Perks: Wider paddle, Curve return, Twin ball, Lazy CPU, Top/Bottom bumpers.
  - Custom SVG opponent portraits, paddle skins, ball glow, perk chips, trophy.
- **Breakout — World Tour** (`games/breakout/`)
  - 5 worlds (Pastel / Steel / Frost / Ember / Void) × 3 levels each, plus
    the **Behemoth** boss-brick at the end of Void.
  - New brick types: ice (2 HP), metal (need power-up), bomb (3×3 chain),
    mirror (deflect+speed), lock + key.
  - Drop power-ups: multi-ball, wide paddle, laser, slow ball, shield save.
  - Persistent perks: Steel Paddle, Insurance, Bombardier, Multi Start,
    Vault Locksmith.
  - Custom SVG bricks, paddle skins per world, power-up chips, world banners.
- **Asteroids — Hive War** (`games/asteroids/`)
  - 10-wave campaign + bosses on wave 5 (Swarm Lord) and wave 10 (Hive Queen
    with rotating weak-point and split phase).
  - Ship upgrades (Rapid Fire, Twin Guns, Shield, Missile) bought between
    waves; previously-unlocked upgrades cost ½ next run.
  - Custom SVG ship variants, hunter drones, bosses, missiles, alien bullets,
    upgrade icons.
- **Helicopter — Long Run** (`games/helicopter/`)
  - 4 biomes (Cavern → Reactor → Reef → Orbit), each ending in a boss
    (Laser Gates, Charging Dragon, Turret Gauntlet, Satellite Array).
  - Stamina meter, in-flight pickups (fuel pod, shield orb, turbo).
  - Persistent perks: Bigger Fuel Tank, Slower Stall, Reinforced Rotor,
    Auto-Pilot.
  - Custom SVG heli variants + biome decor + boss sprites.
- **Frogger — Five Days** (`games/frogger/`)
  - 5-day campaign; each day adds a hazard (snake on median → trucks + pad
    crocs → sinking lily pads + lightning storms → **Highway Hawk** boss
    that telegraphs and swoops down columns).
  - Persistent perks: Long Hop, Trap Detector, Spare Frog, Quick Hop.
  - Custom SVG frog, cars/trucks, logs, turtle, snake, croc, lily, hawk.

Verification: every game smoke-tested in-browser — initialises in `phase=intro`,
renders nontrivial canvas, transitions to gameplay phase under simulated
input, no JS console errors beyond the pre-existing audio 404s.

### Frogger + Helicopter (2 new minigames)
- **Frogger** (`games/frogger/`) — 16-col grid, 4 road lanes (alternating directions, scaling speeds), median, 3 log lanes + 1 turtle lane (turtles surface/dive on a sine cycle so timing matters), 5 home pads at top. Frog hops one cell per keypress (W/A/S/D or arrows). Riding a log/turtle moves the frog with the lane; drift off-screen = death. Filling all 5 pads grants a 500-pt clear bonus and resets the board so you can keep racking up crossings. Death penalty -25 pts. Coins ≈ score / 60.
- **Helicopter** (`games/helicopter/`) — Side-scrolling cave dive, classic Helicopter Game. Hold mouse / Space to thrust up, gravity pulls down. Cave is a procedurally walked top/bottom wall pair; tunnel narrows over time. Periodic stalactite/stalagmite pillars from random sides. Floating $-coins along the way for bonus score. Distance-based scoring + coin bonuses. Coins ≈ score / 80.
- Both ship with synthesized SFX, particle bursts, screen shake, and animated selector previews.
- Wired into `index.html` after `asteroids`.
- Design doc: `docs/plans/2026-04-19-frogger-helicopter.md`.
- Bugfix during dev: helicopter score went negative on Play Again because `_lastDistScore` carried over between rounds. Replaced complex delta-tracking with explicit `coinBonus` accumulator.

### Shallow-Six Depth Pass + SVG Sprite Engine
Six previously-shallow games rebuilt around progression, bosses, perks, and
custom inline-SVG art.

- **`engine/sprites.js` (new)** — vector sprite atlas. Games register inline SVG
  strings under namespaced keys (`bloom.helio`, `deflect.knight`, etc); the
  engine rasterises to offscreen canvases per requested size and caches the
  result. `Sprites.draw(ctx, key, x, y, w, h, opts)` is the only API games need.
  Crisp at any size, zero file fetches, supports `rot/flipX/alpha/anchor` and a
  fallback for the first frame while decode is in flight.
- **Bloom — Abyss campaign** (`games/bloom/`)
  - 5 themed biomes (shallows → kelp → twilight → trench → maw) with distinct
    palettes, fauna and hazards.
  - Boss every biome (Helio jellyfish + Maw devourer); biome-up splash → shop
    → next biome.
  - Power-ups (magnet, shield, dash refresh, mass nova) and persistent perks
    bought from a between-biome shop.
  - Custom SVG sprites: `coral`, `kelp`, `jelly`, `helio`, `maw`, spikes, motes,
    powerup chips.
- **Deflect — Champion's Trial** (`games/deflect/`)
  - 12-wave campaign with three boss waves (Warden, Twin Sisters, The Sun).
  - Five projectile types: arrow, firebolt (curving), splitter, frost, armored.
  - Between-wave perk picker (Wider Arc, Quick Blade, Iron Heart, Mirror Edge,
    Blood Moon, Time Walk) drawn from a deck.
  - Custom SVG sprites: knight, projectile types, three boss portraits, perk
    icons.
- **Stargazer — twin-stick with shop** (`games/stargazer/`)
  - Pre-run upgrade shop (HP, Start Bombs, Start Charge, Twin Shot).
  - Wave-based formations, bombs, overcharge mode, recurring bosses.
- **Ricochet — campaign + perks** (`games/ricochet/`)
  - 25 levels, boss every 5, pre-run perk shop (+Bounces, Piercing Shot, Aim
    Assist, Heavy Round) and shielded enemy variants.
- **Sigil — Grimoire of the Three Seals** (`games/sigil/`)
  - Three chapters (Initiate / Adept / Archmage), each "trials → boss duel".
  - Three boss duels: Warlock (void weakness), Lich (fire), Dragon (ice).
  - Spellbook unlocks across runs; mana / combo / element-weakness damage
    system; sanctum perk shop between chapters (Deep Well, Ley Line, Focused
    Eye, Elder Sage).
  - Custom SVG sprites for nine glyphs and three boss portraits.
- **Diner Rush — 5-Day Shift** (`games/diner/`)
  - 5-day campaign; each day unlocks new ingredients (pickles, sauce, bacon,
    mushrooms) and tightens cadence.
  - Persistent kitchen stations (Better Grill, Prep Station, Fresh Fridge,
    Marketing) bought between days.
  - Day-5 food critic boss customer (7-stack order, 4× tip, run-ending walkout
    penalty).
  - Custom SVG sprites for every ingredient, three customer types, the critic,
    grill / prep stations, trash bin.
- Manifests for Sigil and Diner updated with new blurbs/descriptions.
- All script tags for changed files are versioned (`?v=2`) to bypass browser
  caching against the python `http.server`.
- Design doc: `docs/plans/2026-04-19-shallow-six-design.md`.

### Retro Classics Pack (4 new minigames)
- Added `games/snake/`, `games/pong/`, `games/breakout/`, `games/asteroids/` — quick-and-easy arcade canon.
- **Snake** — 40×25 neon grid, growing tail, accelerating apples. Wall + self collision = game over. Coins ≈ score / 30.
- **Pong** — vs CPU with rally-scaling difficulty (CPU prediction with shrinking slop), scanlines, big background score numbers, ball trail. Score = playerGoals×100 - cpuGoals×60 + rallies×5. Coins ≈ score / 60.
- **Breakout** — 12×5 brick wall, 3 lives, multi-level (clear wall = bonus + new wave), paddle-position-based ball reflection, combo meter. Coins ≈ score / 80.
- **Asteroids** — vector ship with rotation/thrust/wrap-around, large→medium→small split mechanic, periodic edge spawns, 1.5s spawn invuln, brief invincibility ring. Coins ≈ score / 100.
- All four use synthesized SFX, particle bursts, screen shake, and themed selector previews.
- Wired into `index.html` after `reactor`.
- Design doc: `docs/plans/2026-04-19-retro-classics.md`.

### Reactor — Lunar He-3 Tycoon (new minigame)
- Added `games/reactor/` (manifest + game) inspired by Not Doppler / Ninja Kiwi management games.
- Side-view lunar base cutaway: starfield, rising Earth, dome, central glowing reactor, modular pods.
- Core loop: throttle the reactor to earn $/s; manage heat to avoid meltdown.
- 6 module types (Mining Rig, Coolant Loop, Shielding, Reactor Core+, Launch Pad, Auto-Stabilizer) with exponential cost scaling.
- Pressure events: meteor showers (with crosshair telegraph), solar flares (throttle drift), coolant leaks.
- Emergency vent ability (Space) — drops heat, costs cash, on cooldown.
- Web-Audio SFX palette (alarm, vent steam, meltdown, launch, flare) + low ambient reactor hum.
- Animated card preview with pulsing core, drifting modules, meteor streaks, Earth.
- Score = total $ earned. Coins ≈ score / 400.
- Wired into `index.html` after `sand`.
- Design doc: `docs/plans/2026-04-19-reactor-design.md`.

## Pre-2026-04-19
- 20 launch + post-launch minigames implemented (gullet, franchise, ricochet, skybound, deflect, bloom, sigil, barrage, diner, stargazer, tanks, bulwark, starfall, leap, crypt, depths, vaultbreaker, orbital, learntoheist, sand).
- Engine in `engine/` (BaseGame, Input, Audio, Draw + particles, Storage, Assets, Sprites).
- Selector grid with live animated card previews; cosmetic theme shop powered by coin currency.
