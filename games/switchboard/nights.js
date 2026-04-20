/* Night manager. Given a night config from content.js, runs the call queue:
   scheduling ringing lines, timing TTLs, committing routes, and tracking
   composure + metadata flags (e.g. architect_rest_count, replacement_route).
   The game class drives this via tick(dt) / answer(line) / listen(line) etc.

   Hotel Cascadia tuning (per docs/plans/2026-04-19-cascadia.md § Pacing):
   - Night 1 is forgiving (TTL 14, low penalties).
   - Each subsequent night cuts TTL and raises penalties.
   - Standing on the board idle while calls ring slowly bleeds composure.

   Special call types:
   - architect:    The 3:14 AM single-lit-lamp event. Routing to 'Floor 3'
                   is "let him rest" for that night. Anything else (wrong
                   route, missed, denied) is a corridor-length penalty for
                   Night 5. NOT counted as composure-wrong on correct route.
   - bellhopDead:  Ringing line with no caller name and no voice. The
                   intended play is to recognise it and let it ring out;
                   that costs no composure. Picking it up and routing
                   anywhere counts as wrong. Denying or ringout = success.
   - replacement (with critical: true): N4 only. The route binds the
                   player's ending. */
(function () {
  const NDP = window.NDP;
  const SB = (NDP.switchboard = NDP.switchboard || {});

  const COMPOSURE_MAX = 100;

  function nightTuning(night) {
    const id = (night && night.id) || 1;
    /* Hotel Cascadia tuning v2 — frantic but recoverable.
       - TTLs tightened from the v1 numbers so even N1 has time pressure.
       - ringingDrain only kicks in with 2+ ringing simultaneously (see tick),
         so a single ringing lamp never burns the meter — the player can take
         a beat to read the directory.
       - composureRegen on every correct route + small regen on architect
         rest. Keeps the meter from death-spiralling on tough nights.
       - drainCap clamps the drain multiplier so 5+ overlapping lamps don't
         vaporise composure in 4 seconds. */
    const TUNINGS = {
      1: { ttl: 9.5, missPenalty:  8, wrongPenalty: 14, ringingDrain: 0.45, composureRegen: 4, drainCap: 2.0 },
      2: { ttl: 7.5, missPenalty: 12, wrongPenalty: 20, ringingDrain: 0.65, composureRegen: 3, drainCap: 2.5 },
      3: { ttl: 6.0, missPenalty: 16, wrongPenalty: 26, ringingDrain: 0.85, composureRegen: 3, drainCap: 2.8 },
      4: { ttl: 5.0, missPenalty: 20, wrongPenalty: 32, ringingDrain: 1.05, composureRegen: 2, drainCap: 3.0 }
    };
    return TUNINGS[id] || TUNINGS[1];
  }

  function startNight(night) {
    const lineCount = night.lineCount || 6;
    /* COLD OPEN: pull the first two non-architect, non-dead calls forward
       to t=0 and t=1.5s so the board is alive the moment the player arrives.
       Architect calls are never moved — the 3:14 window is sacred. */
    let coldOpenSlots = [0, 1.5];
    const queue = night.calls.map((c, i) => {
      const at = (!c.onDeadLine && !c.architect && coldOpenSlots.length > 0)
        ? coldOpenSlots.shift()
        : c.at;
      return {
        ...c,
        at,
        idx: i,
        // Architect always shows on the highest-numbered line so it's
        // visually distinct (rightmost lit lamp during the dim window).
        // Dead lines whisper without occupying a board line (line: -1).
        line: c.onDeadLine
          ? -1
          : c.architect
            ? lineCount
            : ((i % lineCount) + 1),
        state: 'pending',     // pending | ringing | answered | done | missed | wrong
        spawnedAt: null,
        ttl: null,
        ttlMax: null,
        answeredAt: null,
        listenedSec: 0
      };
    });
    const directory = SB.DIRECTORIES[night.directory] || SB.DIRECTORIES.n1;
    const tuning = nightTuning(night);
    const archivedEntry = SB.ARCHIVED_BY_NIGHT && SB.ARCHIVED_BY_NIGHT[night.id];
    return {
      night,
      tuning,
      lineCount,
      t: 0,
      queue,
      ringing: new Map(),    // line -> call
      active: new Map(),     // line -> call (answered, being listened or not)
      focused: null,
      directory,
      composure: COMPOSURE_MAX,
      composureMax: COMPOSURE_MAX,
      done: false,
      outcome: null,         // 'survived' | 'broken'
      flags: {
        replacement_call_seen: false,
        replacement_route: null,        // 'floor_zero' | 'line_3' | 'denied'
        architect_rest_count: 0,        // total across all nights
        architect_misses_total: 0,      // drives corridor length on N5
        listenedTo: {}
      },
      // ARCHIVED stamp lifecycle: triggers once mid-night, lingers 4s, fades.
      archivedEntry,
      archivedShownAt: null,
      // Architect window flag — true while architect call is ringing/active.
      architectWindowActive: false,
      // Sticky stamp once shown, for the directory render (low-prio dread).
      archivedSticky: false,
      lastWhisper: null
    };
  }

  function tick(st, dt, gameHooks) {
    if (st.done) return;
    st.t += dt;
    const tuning = st.tuning;

    // ARCHIVED stamp — show ~30% through the night. Lingers 4s.
    if (st.archivedEntry && st.archivedShownAt == null
        && st.t > (st.night.durationSec * 0.30)) {
      st.archivedShownAt = st.t;
      st.archivedSticky = true;
      if (gameHooks.archivedShown) gameHooks.archivedShown(st.archivedEntry);
    }

    // Spawn scheduled calls
    for (const c of st.queue) {
      if (c.state !== 'pending') continue;
      if (st.t < c.at) continue;
      if (c.onDeadLine) {
        gameHooks.whisper(c);
        c.state = 'done';
        continue;
      }
      // Avoid collisions: if this line is busy, slide the call up by 1s
      if (st.ringing.has(c.line) || st.active.has(c.line)) { c.at = st.t + 1; continue; }
      c.state = 'ringing';
      c.spawnedAt = st.t;
      // Architect gets a generous TTL — the 3:14 window is by design 30s.
      c.ttl = c.architect ? 30 : tuning.ttl;
      c.ttlMax = c.ttl;
      st.ringing.set(c.line, c);
      if (c.flag) st.flags[c.flag] = true;
      if (c.architect) st.architectWindowActive = true;
      gameHooks.ring(c);
    }

    // TTL on ringing calls
    for (const c of Array.from(st.ringing.values())) {
      c.ttl -= dt;
      if (c.ttl <= 0) {
        c.state = 'missed';
        st.ringing.delete(c.line);
        if (c.architect) {
          st.architectWindowActive = false;
          st.flags.architect_misses_total++;
        }
        if (c.bellhopDead) {
          // Successfully ignored a dead-bellhop line — no penalty.
          gameHooks.bellhopIgnored && gameHooks.bellhopIgnored(c);
        } else if (c.architect) {
          // Architect missed — small composure tax + corridor penalty.
          st.composure = Math.max(0, st.composure - Math.floor(tuning.missPenalty / 2));
          gameHooks.missed(c);
        } else {
          st.composure = Math.max(0, st.composure - tuning.missPenalty);
          gameHooks.missed(c);
        }
        if (c.critical && c.voice === 'replacement') {
          st.flags.replacement_route = 'denied';
        }
      }
    }

    // Pressure drain — only with 2+ lamps lit, scaled by overlap, capped so
    // 5 lamps don't vaporise composure in 4 seconds. A single ringing lamp
    // never drains — that's the breathing room to read the directory.
    if (st.ringing.size >= 2) {
      const overlap = Math.min(st.ringing.size - 1, tuning.drainCap || 3);
      st.composure = Math.max(0, st.composure - tuning.ringingDrain * dt * overlap);
    }

    if (st.composure <= 0) {
      st.done = true; st.outcome = 'broken';
    }
    if (st.t >= (st.night.durationSec || 200) && st.ringing.size === 0 && st.active.size === 0) {
      st.done = true;
      if (!st.outcome) st.outcome = 'survived';
    }
  }

  function answer(st, line, gameHooks) {
    const c = st.ringing.get(line);
    if (!c) return false;
    st.ringing.delete(line);
    c.state = 'answered';
    c.answeredAt = st.t;
    st.active.set(line, c);
    st.focused = c;
    gameHooks.answered(c);
    return true;
  }

  /* Try to commit a route from an incoming line to an outgoing line.
     - If the outgoing matches the call's requested directory entry → success.
     - Architect: only 'Floor 3' is success; correct routes do NOT cost
       composure when wrong (the corridor penalty is the cost).
     - Bellhop dead: routing anywhere = wrong (the line is supposed to be
       ignored, not answered).
     - Replacement (critical N4): route binds replacement_route flag.
     - Mismatched normal call → composure hit, still closes the call. */
  function commitRoute(st, inLine, outLine, gameHooks) {
    const c = st.active.get(inLine) || st.ringing.get(inLine);
    if (!c) return { ok: true, idle: true };
    const expected = c.request ? st.directory[c.request] : null;
    const ok = expected === outLine;

    // Special handling per call type
    if (c.architect) {
      if (ok) {
        c.state = 'done';
        st.flags.architect_rest_count++;
      } else {
        c.state = 'wrong';
        st.flags.architect_misses_total++;
      }
      st.architectWindowActive = false;
    } else if (c.bellhopDead) {
      // Even "matching" the bellhopDead request is wrong — the lesson
      // is don't pick this up.
      c.state = 'wrong';
    } else if (c.critical && c.voice === 'replacement') {
      // Replacement (N4) — bind ending regardless of strict correctness.
      // outLine 1 = Front Desk = the operator's own line = CHECK_OUT loop.
      // outLine 3 = Floor 3 = handed off to architect = DEMOLITION-eligible.
      // anything else = misroute = treated as denied (UNDERSTUDY bind).
      if (outLine === 1) {
        st.flags.replacement_route = 'floor_zero';
        c.state = 'done';
      } else if (outLine === 3) {
        st.flags.replacement_route = 'line_3';
        c.state = 'done';
      } else {
        st.flags.replacement_route = 'denied';
        c.state = 'wrong';
      }
    } else {
      c.state = ok ? 'done' : 'wrong';
    }

    st.active.delete(inLine);
    st.ringing.delete(inLine);
    if (st.focused === c) st.focused = null;

    if (c.state === 'wrong') {
      // Architect mis-routes hurt composure too, plus the corridor penalty
      // already applied above. Bellhop misroutes hurt double — the player
      // is being trained to recognise dead lines.
      let pen = st.tuning.wrongPenalty;
      if (c.architect) pen = Math.floor(pen * 0.5);
      else if (c.bellhopDead) pen = pen * 2;
      else if (c.critical) pen = pen * 2;
      st.composure = Math.max(0, st.composure - pen);
      gameHooks.wrong(c);
    } else {
      // Composure regen on every correct route. Architect rest gives a
      // bigger gift since it's the rarer payoff. Caps at composureMax.
      const regen = c.architect
        ? (st.tuning.composureRegen || 3) * 2
        : (st.tuning.composureRegen || 3);
      st.composure = Math.min(st.composureMax, st.composure + regen);
      gameHooks.correct(c, regen);
    }
    return { ok: c.state === 'done', idle: false };
  }

  function denyCall(st, line, gameHooks) {
    const c = st.active.get(line);
    if (!c) return false;
    c.state = 'done';
    if (c.architect) {
      st.architectWindowActive = false;
      st.flags.architect_misses_total++;
    }
    if (c.critical && c.voice === 'replacement') st.flags.replacement_route = 'denied';
    st.active.delete(line);
    if (st.focused === c) st.focused = null;
    gameHooks.denied(c);
    return true;
  }

  function listenTick(st, call, dt) {
    if (!call) return;
    call.listenedSec += dt;
    if (!st.flags.listenedTo[call.voice]) st.flags.listenedTo[call.voice] = 0;
    st.flags.listenedTo[call.voice] += dt;
  }

  SB.Nights = { startNight, tick, answer, commitRoute, denyCall, listenTick, COMPOSURE_MAX, nightTuning };
})();
