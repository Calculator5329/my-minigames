/* Night manager. Given a night config from content.js, runs the call queue:
   scheduling ringing lines, timing TTLs, committing routes, and tracking
   composure + metadata flags (e.g. "never listened to Halberd").
   The game class drives this via tick(dt) / answer(line) / listen(line) etc.

   Tuning:
   - Night 1 is forgiving (longer TTL, less penalty).
   - Each subsequent night cuts TTL and raises penalties.
   - Standing on the board tab idle while calls ring slowly bleeds composure
     so even silence costs you. Listening doesn't penalize — it's just
     attention spent.
   - Wrong-routing a "critical" call (Night 4 self-call) is a hard error and
     also locks the night ending into "deny". */
(function () {
  const NDP = window.NDP;
  const SB = (NDP.switchboard = NDP.switchboard || {});

  const COMPOSURE_MAX = 100;

  function nightTuning(night) {
    const id = (night && night.id) || 1;
    return {
      ttl:           Math.max(12, 24 - (id - 1) * 2),    // 24, 22, 20, 18
      missPenalty:   8 + (id - 1) * 3,                   //  8, 11, 14, 17
      wrongPenalty:  16 + (id - 1) * 4,                  // 16, 20, 24, 28
      ringingDrain:  0.15 + (id - 1) * 0.10              // composure/sec while >=2 ringing
    };
  }

  function startNight(night) {
    const queue = night.calls.map((c, i) => ({
      ...c,
      idx: i,
      line: c.onDeadLine ? -1 : ((i % 10) + 1),
      state: 'pending',     // pending | ringing | answered | done | missed | wrong
      spawnedAt: null,
      ttl: null,
      ttlMax: null,
      answeredAt: null,
      listenedSec: 0
    }));
    const directory = SB.DIRECTORIES[night.directory] || SB.DIRECTORIES.n1;
    const tuning = nightTuning(night);
    return {
      night,
      tuning,
      t: 0,
      queue,
      ringing: new Map(),    // line -> call
      active: new Map(),     // line -> call (answered, being listened or not)
      focused: null,         // the call whose card is shown
      directory,
      composure: COMPOSURE_MAX,
      composureMax: COMPOSURE_MAX,
      done: false,
      outcome: null,         // 'survived' | 'broken'
      flags: {
        you_call_seen: false,
        final_self_call: null,
        halberd_listened: false,
        halberd_calls_total: 0,
        listenedTo: {}                // voiceKey -> seconds listened
      },
      lastWhisper: null
    };
  }

  function tick(st, dt, gameHooks) {
    if (st.done) return;
    st.t += dt;
    const tuning = st.tuning;

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
      c.ttl = tuning.ttl;
      c.ttlMax = tuning.ttl;
      st.ringing.set(c.line, c);
      if (c.voice === 'halberd') st.flags.halberd_calls_total++;
      if (c.flag) st.flags[c.flag] = true;
      gameHooks.ring(c);
    }

    // TTL on ringing calls
    for (const c of Array.from(st.ringing.values())) {
      c.ttl -= dt;
      if (c.ttl <= 0) {
        c.state = 'missed';
        st.ringing.delete(c.line);
        st.composure = Math.max(0, st.composure - tuning.missPenalty);
        gameHooks.missed(c);
      }
    }

    // Pressure drain — when more than one line is ringing simultaneously,
    // every second of indecision shaves the composure meter.
    if (st.ringing.size >= 2) {
      st.composure = Math.max(0, st.composure - tuning.ringingDrain * dt * (st.ringing.size - 1));
    }

    if (st.composure <= 0) {
      st.done = true; st.outcome = 'broken';
    }
    if (st.t >= (st.night.durationSec || 300) && st.ringing.size === 0 && st.active.size === 0) {
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
     - If mismatched → composure hit, still closes the call.
     - If connected with no call (idle) → free. */
  function commitRoute(st, inLine, outLine, gameHooks) {
    const c = st.active.get(inLine) || st.ringing.get(inLine);
    if (!c) return { ok: true, idle: true };
    const expected = c.request ? st.directory[c.request] : null;
    const ok = expected === outLine;
    c.state = ok ? 'done' : 'wrong';
    if (c.critical && c.voice === 'you') {
      st.flags.final_self_call = ok;
    }
    st.active.delete(inLine);
    st.ringing.delete(inLine);
    if (st.focused === c) st.focused = null;
    if (!ok) {
      // Critical mis-routes hurt twice as much.
      const pen = c.critical ? st.tuning.wrongPenalty * 2 : st.tuning.wrongPenalty;
      st.composure = Math.max(0, st.composure - pen);
      gameHooks.wrong(c);
    } else {
      gameHooks.correct(c);
    }
    return { ok, idle: false };
  }

  function denyCall(st, line, gameHooks) {
    const c = st.active.get(line);
    if (!c) return false;
    c.state = 'done';
    if (c.critical && c.voice === 'you') st.flags.final_self_call = false;
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
    if (call.voice === 'halberd') st.flags.halberd_listened = true;
  }

  SB.Nights = { startNight, tick, answer, commitRoute, denyCall, listenTick, COMPOSURE_MAX, nightTuning };
})();
