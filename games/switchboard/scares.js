/* Hotel Cascadia — jumpscare director.

   Owns a small state machine that picks creepy events on a cooldown,
   weighted by composure (more events when fragile) and night escalation
   (bigger events unlock later). Each event is a short-lived overlay or
   audio cue; some events also publish "override" fields the game's main
   renderers read (for header / caller-card / directory glitches).

   Three severity buckets:

   - minor (always available): brief whispers, dust silhouettes, single
     phantom blips, tiny header glitches. Ambient creep.
   - moderate (night >= 2, composure < 70%): power flickers, phantom
     ringing lamps that don't exist, caller-card "STOP LISTENING"
     glitches, clock jumps backward, hand at the canvas edge.
   - major (night >= 3, composure < 50%, hard cooldown): full-screen
     face flash + screech + sub-thump. Used very sparingly so it never
     becomes a meme.

   The director never penalises the player or interferes with input —
   every event is observational dread. */

(function () {
  const NDP = window.NDP;
  const SB = (NDP.switchboard = NDP.switchboard || {});
  const W = 960, H = 600;

  const HEADER_GLITCH_TEXTS = [
    'WELCOME HOME, OPERATOR',
    "YOU'VE BEEN HERE BEFORE",
    "DON'T LET HER KNOW YOU'RE TIRED",
    'HOTEL CASCADIA — FLOOR ZERO',           // sometimes the same; gaslight
    'HOTEL CASCADIA — FLOOR -3',
    'CHECK-IN ONLY',
    'DO NOT ANSWER LINE 0'
  ];

  const CARD_GLITCH_TEXTS = [
    'STOP LISTENING.',
    'WHO IS BEHIND YOU?',
    'HE IS ON YOUR LINE.',
    "DON'T TURN AROUND.",
    'YOU ARE NOT THE OPERATOR.',
    'THIS IS YOUR ROOM.',
    'YOU NEVER LEFT.'
  ];

  const DIRECTORY_GLITCH_NAMES = [
    'YOURSELF',
    'THE OPERATOR (PREVIOUS)',
    '▢▢▢▢▢▢▢▢',
    'OUTSIDE',
    'NOWHERE',
    'WAITING',
    'HER ROOM'
  ];

  function create() {
    return {
      cooldown: 6.0,           // seconds until next eligible event
      events: [],              // active overlays — { type, t, max, ... }
      headerOverride: null,
      headerOverrideUntil: 0,
      cardOverride: null,
      cardOverrideUntil: 0,
      dirOverride: null,       // { line, name }
      dirOverrideUntil: 0,
      majorCooldown: 60,       // seconds until a major event is allowed
      lastMajorAt: -Infinity,
      // Black-out flicker — drawn last, full-screen.
      flicker: 0,              // remaining seconds
      flickerMax: 0,
      // Phantom lamp position — pixel coords with a brief life.
      phantomLamp: null,       // { x, y, t, max }
      // Heartbeat cadence when composure is critical.
      heartbeatAcc: 0,
      // Time accumulator (used for cadence, deterministic)
      time: 0,
      // Architect-window rising-edge detection — plays the sweep cue
      // exactly once per opening. Reset on close.
      architectWasOpen: false,
      architectSweep: null,    // active handle so we can stop it on close
      // Long ambient bed — fades in around moderate scares, plays
      // horror_ambience or tomb_ambience for ~6s, then fades out.
      bedHandle: null,
      bedUntil: 0,
      // Last-played sample name + timestamp (per-sample cooldown so
      // we don't loop the same clip back-to-back).
      lastSampleAt: {}
    };
  }

  /* Throttle individual samples so the same one-shot doesn't fire
     twice within `minGapSec` of itself. Keeps phantom_radio etc. from
     becoming a loop when scares stack. */
  function gateSample(d, name, minGapSec) {
    const last = d.lastSampleAt[name] || -Infinity;
    if (now(d) - last < minGapSec) return false;
    d.lastSampleAt[name] = now(d);
    return true;
  }

  function now(d) { return d.time; }

  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

  /* Decide whether to fire an event this tick, and which severity.
     Composure-low → cooldown shrinks. Night-high → severity ceiling
     rises. Returns one of 'minor' | 'moderate' | 'major' | null. */
  function choose(d, composurePct, night) {
    if (d.cooldown > 0) return null;
    // Eligibility floors.
    const moderateOk = night >= 2 || composurePct < 0.7;
    const majorOk = night >= 3 && composurePct < 0.5
                    && (now(d) - d.lastMajorAt) > d.majorCooldown;
    // Probability weights — base + composure-fragility kicker.
    const fragility = 1 - composurePct;
    const r = Math.random();
    if (majorOk && r < 0.04 + fragility * 0.04) return 'major';
    if (moderateOk && r < 0.30 + fragility * 0.25) return 'moderate';
    return 'minor';
  }

  /* Spawn the event of the chosen severity. Sets up overlays, plays
     audio, schedules cooldown for the next eligible event. */
  function fire(d, severity, composurePct, night, gameCtx) {
    const V = SB.Voices;
    if (severity === 'major') {
      d.lastMajorAt = now(d);
      d.events.push({ type: 'screen_face', t: 0, max: 0.18 });
      d.flicker = 0.06; d.flickerMax = 0.06;
      try { V.sfxScreech(); V.sfxSubThump(0.95); V.sfxGlassBreak(); } catch (e) {}
      // Sampled layer — heavy drum + ambient bed underneath the
      // procedural screech for body. Bed plays for ~6s with fade.
      try {
        if (V.hasSample('horror_drum')) V.playSample('horror_drum', { gain: 0.55 });
      } catch (e) {}
      try {
        if (V.hasSample('horror_ambience') && !d.bedHandle) {
          d.bedHandle = V.playSample('horror_ambience', {
            gain: 0.22, fadeInMs: 250, durationSec: 6, filter: 'lowpass', filterFreq: 1800
          });
          d.bedUntil = now(d) + 6;
        }
      } catch (e) {}
      d.cooldown = 22 + Math.random() * 10;
      return;
    }
    if (severity === 'moderate') {
      const types = [
        'flicker', 'phantom_lamp', 'card_glitch', 'clock_jump',
        'hand_at_edge', 'directory_glitch', 'header_glitch_loud',
        'phantom_creature', 'phantom_radio_burst'
      ];
      const t = pick(types);
      if (t === 'flicker') {
        d.flicker = 0.08; d.flickerMax = 0.08;
        try { V.sfxSubThump(0.7); V.sfxClang(0.55); } catch (e) {}
        try {
          if (V.hasSample('horror_drum') && gateSample(d, 'horror_drum', 12)) {
            V.playSample('horror_drum', { gain: 0.35 });
          }
        } catch (e) {}
      } else if (t === 'phantom_lamp') {
        spawnPhantomLamp(d, gameCtx);
        try { V.sfxPhantomRing(); } catch (e) {}
      } else if (t === 'card_glitch') {
        d.cardOverride = pick(CARD_GLITCH_TEXTS);
        d.cardOverrideUntil = now(d) + 0.45;
        try {
          if (V.hasSample('creepy_radio') && gateSample(d, 'creepy_radio', 9)) {
            V.playSample('creepy_radio', { gain: 0.32, filter: 'highpass', filterFreq: 600 });
          } else {
            V.sfxPhantomWhisper(900);
          }
        } catch (e) {}
      } else if (t === 'clock_jump') {
        d.events.push({ type: 'clock_jump', t: 0, max: 1.4 });
        try { V.sfxClang(0.4); } catch (e) {}
      } else if (t === 'hand_at_edge') {
        const side = Math.random() < 0.5 ? 'left' : 'right';
        d.events.push({ type: 'hand_at_edge', t: 0, max: 0.55, side });
        try { V.sfxPhantomWhisper(700); } catch (e) {}
      } else if (t === 'directory_glitch') {
        const lines = (gameCtx.directory && Object.keys(gameCtx.directory)) || [];
        if (lines.length) {
          const which = pick(lines);
          d.dirOverride = { name: pick(DIRECTORY_GLITCH_NAMES), originalKey: which };
          d.dirOverrideUntil = now(d) + 0.7;
        }
      } else if (t === 'header_glitch_loud') {
        d.headerOverride = pick(HEADER_GLITCH_TEXTS);
        d.headerOverrideUntil = now(d) + 0.9;
        try { V.sfxClang(0.35); } catch (e) {}
      } else if (t === 'phantom_creature') {
        // Creature snarl from inside the office — no visual, just audio.
        // Pairs with a brief dust silhouette at ear-level for context.
        try {
          if (V.hasSample('creepy_creature') && gateSample(d, 'creepy_creature', 18)) {
            V.playSample('creepy_creature', { gain: 0.42, rate: 0.92 });
            d.events.push({ type: 'dust_silhouette', t: 0, max: 0.6,
                            x: 280 + Math.random() * 400, y: 220 + Math.random() * 80 });
          } else {
            V.sfxPhantomWhisper(900);
          }
        } catch (e) {}
      } else if (t === 'phantom_radio_burst') {
        // Brief radio chatter as if another switchboard is bleeding into
        // ours. Throttled by the per-sample gate.
        try {
          if (V.hasSample('creepy_radio') && gateSample(d, 'creepy_radio', 9)) {
            V.playSample('creepy_radio', {
              gain: 0.28, filter: 'bandpass', filterFreq: 1500, filterQ: 4
            });
            d.headerOverride = pick(HEADER_GLITCH_TEXTS);
            d.headerOverrideUntil = now(d) + 0.5;
          } else {
            V.sfxPhantomWhisper(800);
          }
        } catch (e) {}
      }
      d.cooldown = 8 + Math.random() * 6;
      return;
    }
    // minor
    const types = ['whisper', 'dust_silhouette', 'header_glitch_brief', 'cable_twitch'];
    const t = pick(types);
    if (t === 'whisper') {
      try { V.sfxPhantomWhisper(800 + Math.random() * 600); } catch (e) {}
    } else if (t === 'dust_silhouette') {
      d.events.push({ type: 'dust_silhouette', t: 0, max: 0.6,
                      x: 220 + Math.random() * 520, y: 140 + Math.random() * 140 });
    } else if (t === 'header_glitch_brief') {
      d.headerOverride = pick(HEADER_GLITCH_TEXTS);
      d.headerOverrideUntil = now(d) + 0.18;
    } else if (t === 'cable_twitch') {
      d.events.push({ type: 'cable_twitch', t: 0, max: 0.30 });
    }
    d.cooldown = 9 + Math.random() * 6;
  }

  function spawnPhantomLamp(d, gameCtx) {
    if (!gameCtx.board) return;
    const inSockets = gameCtx.board.sockets.filter(s => s.side === 'in');
    if (inSockets.length < 2) return;
    // Pick a position halfway between two adjacent incoming sockets so
    // the "extra lamp" sits where no real lamp lives.
    const i = Math.floor(Math.random() * (inSockets.length - 1));
    const a = inSockets[i], b = inSockets[i + 1];
    d.phantomLamp = { x: (a.x + b.x) / 2, y: a.y, t: 0, max: 1.6 };
  }

  /* Tick the director. composurePct ∈ [0,1]. gameCtx is read-only —
     the director never mutates game state, only its own overlays. */
  function tick(d, dt, composurePct, night, gameCtx) {
    const V = SB.Voices;
    d.time += dt;
    d.cooldown = Math.max(0, d.cooldown - dt);
    if (d.flicker > 0) d.flicker = Math.max(0, d.flicker - dt);
    if (d.phantomLamp) {
      d.phantomLamp.t += dt;
      if (d.phantomLamp.t >= d.phantomLamp.max) d.phantomLamp = null;
    }
    if (d.headerOverride && now(d) > d.headerOverrideUntil) d.headerOverride = null;
    if (d.cardOverride && now(d) > d.cardOverrideUntil) d.cardOverride = null;
    if (d.dirOverride && now(d) > d.dirOverrideUntil) d.dirOverride = null;
    // Ambient bed hard-stop once its window expires.
    if (d.bedHandle && now(d) > d.bedUntil) {
      try { d.bedHandle.stop(800); } catch (e) {}
      d.bedHandle = null;
    }
    // Architect window rising / falling edge — play the sampled
    // dread sweep on open, kill it on close.
    const open = !!gameCtx.architectWindowActive;
    if (open && !d.architectWasOpen) {
      try {
        if (V.hasSample('horror_sweep')) {
          d.architectSweep = V.playSample('horror_sweep', { gain: 0.38, fadeInMs: 80 });
        }
      } catch (e) {}
    } else if (!open && d.architectWasOpen) {
      if (d.architectSweep) {
        try { d.architectSweep.stop(400); } catch (e) {}
        d.architectSweep = null;
      }
    }
    d.architectWasOpen = open;
    // Heartbeat ambience when composure is below 30% — every ~5s.
    // Prefer the sampled slow_heartbeat when it's loaded.
    if (composurePct < 0.30) {
      d.heartbeatAcc += dt;
      if (d.heartbeatAcc > 4.5 + Math.random() * 1.5) {
        d.heartbeatAcc = 0;
        try {
          if (V.hasSample('slow_heartbeat')) {
            V.playSample('slow_heartbeat', {
              gain: 0.30, filter: 'lowpass', filterFreq: 220, durationSec: 2.6
            });
          } else {
            V.sfxHeartbeat();
          }
        } catch (e) {}
      }
    } else {
      d.heartbeatAcc = 0;
    }
    // Roll for an event.
    const sev = choose(d, composurePct, night);
    if (sev) fire(d, sev, composurePct, night, gameCtx);
    // Advance any active overlay timers.
    for (const e of d.events) e.t += dt;
    d.events = d.events.filter(e => e.t < e.max);
  }

  /* Render overlays on top of the board. Headers / cards / directory
     are NOT drawn here — those mutate via the override fields the main
     renderers check. We only draw the screen flicker, phantom lamp,
     hand-at-edge silhouette, dust silhouettes, and the big screen face. */
  function render(ctx, d) {
    // Phantom lamp (drawn behind the flicker so flicker hides it).
    if (d.phantomLamp) {
      const p = d.phantomLamp;
      const k = p.t / p.max;
      const a = Math.sin(k * Math.PI) * 0.85;          // fade in then out
      const pulse = 0.55 + 0.45 * Math.sin(p.t * 22);
      const grd = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, 28);
      grd.addColorStop(0, `rgba(255,180,80,${(0.7 * a * pulse).toFixed(2)})`);
      grd.addColorStop(1, 'rgba(255,180,80,0)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(p.x, p.y, 28, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(255,200,120,${a.toFixed(2)})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill();
    }
    for (const e of d.events) {
      const k = e.t / e.max;
      if (e.type === 'dust_silhouette') {
        // Faint humanoid head/shoulders silhouette materialising in the air.
        const a = Math.sin(k * Math.PI) * 0.32;
        ctx.save();
        ctx.fillStyle = `rgba(20,4,8,${a.toFixed(2)})`;
        ctx.beginPath();
        ctx.ellipse(e.x, e.y, 11, 14, 0, 0, Math.PI * 2);  // head
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(e.x, e.y + 24, 22, 12, 0, 0, Math.PI * 2);  // shoulders
        ctx.fill();
        ctx.restore();
      } else if (e.type === 'hand_at_edge') {
        // Five spindly fingers reaching in from the canvas edge.
        const a = Math.sin(k * Math.PI) * 0.65;
        ctx.save();
        ctx.fillStyle = `rgba(8,4,4,${a.toFixed(2)})`;
        ctx.strokeStyle = `rgba(8,4,4,${a.toFixed(2)})`;
        const baseX = e.side === 'left' ? 0 : W;
        const dir = e.side === 'left' ? 1 : -1;
        for (let i = 0; i < 5; i++) {
          const fy = H * 0.30 + i * 22;
          const reach = 18 + (k < 0.5 ? k * 60 : (1 - k) * 60);
          const fx = baseX + dir * reach;
          ctx.lineWidth = 6;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(baseX, fy);
          ctx.lineTo(fx, fy);
          ctx.stroke();
          // Fingertip pad
          ctx.beginPath();
          ctx.arc(fx, fy, 5, 0, Math.PI * 2); ctx.fill();
        }
        // Palm shadow at the edge
        ctx.fillStyle = `rgba(8,4,4,${(a * 0.8).toFixed(2)})`;
        ctx.fillRect(e.side === 'left' ? 0 : W - 22, H * 0.28, 22, 130);
        ctx.restore();
      } else if (e.type === 'cable_twitch') {
        // Brief jolt — small horizontal jitter overlay drawn as a thin
        // tear across the cable area. Mostly an audio-visual hint.
        const a = Math.sin(k * Math.PI) * 0.2;
        ctx.fillStyle = `rgba(180,40,30,${a.toFixed(2)})`;
        for (let i = 0; i < 12; i++) {
          ctx.fillRect(0, 460 + i * 6 + (Math.random() * 4 - 2), W, 1);
        }
      } else if (e.type === 'clock_jump') {
        // Visual overlay of "second hand swinging backward" — drawn as
        // a faint tick-arc near the clock face. The clock itself is
        // drawn elsewhere; we just add a glitch sparkle.
        const a = Math.sin(k * Math.PI) * 0.55;
        const cx = W / 2 - 64, cy = 52;
        ctx.strokeStyle = `rgba(255,200,60,${a.toFixed(2)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, 16, -Math.PI * 0.5, -Math.PI * 0.5 - k * Math.PI * 1.2, true);
        ctx.stroke();
      } else if (e.type === 'screen_face') {
        // Full-screen face silhouette — wide eyes, mouth, hair. Drawn
        // as crude high-contrast shapes for maximum jolt. Brief.
        const a = Math.sin(k * Math.PI) * 0.92;
        ctx.save();
        ctx.fillStyle = `rgba(0,0,0,${(a * 0.9).toFixed(2)})`;
        ctx.fillRect(0, 0, W, H);
        // Face shape — lighter rgba so it stands against the black.
        ctx.fillStyle = `rgba(220,200,180,${(a * 0.85).toFixed(2)})`;
        ctx.beginPath();
        ctx.ellipse(W / 2, H / 2 + 20, 200, 250, 0, 0, Math.PI * 2);
        ctx.fill();
        // Hair (dark cap on top of head)
        ctx.fillStyle = `rgba(0,0,0,${(a * 0.95).toFixed(2)})`;
        ctx.beginPath();
        ctx.ellipse(W / 2, H / 2 - 100, 220, 130, 0, Math.PI, 0);
        ctx.fill();
        // Eyes — black hollows with pupils that are also black,
        // surrounded by a thin pale ring so they read as eyes.
        for (const ex of [-65, 65]) {
          ctx.fillStyle = `rgba(245,235,215,${(a * 0.9).toFixed(2)})`;
          ctx.beginPath();
          ctx.ellipse(W / 2 + ex, H / 2 - 30, 36, 24, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = `rgba(0,0,0,${a.toFixed(2)})`;
          ctx.beginPath();
          ctx.arc(W / 2 + ex, H / 2 - 30, 12, 0, Math.PI * 2);
          ctx.fill();
        }
        // Mouth — a wide, slightly open dark slash.
        ctx.fillStyle = `rgba(0,0,0,${(a * 0.95).toFixed(2)})`;
        ctx.beginPath();
        ctx.ellipse(W / 2, H / 2 + 90, 70, 18, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
    // Power flicker — drawn LAST so it covers everything.
    if (d.flicker > 0) {
      const k = d.flicker / d.flickerMax;          // 1 → 0
      ctx.fillStyle = `rgba(0,0,0,${(0.85 + 0.15 * Math.random()).toFixed(2)})`;
      ctx.fillRect(0, 0, W, H);
      // Tiny scan-rip on the way back
      if (k < 0.4 && Math.random() < 0.6) {
        ctx.fillStyle = 'rgba(180,40,30,0.4)';
        const ry = (Math.random() * H) | 0;
        ctx.fillRect(0, ry, W, 2);
      }
    }
  }

  SB.Scares = { create, tick, render };
})();
