/* Night manager. Given a night config from content.js, runs the call queue:
   scheduling ringing lines, timing TTLs, committing routes, and tracking
   composure + metadata flags (e.g. "never listened to Halberd").
   The game class drives this via tick(dt) / answer(line) / listen(line) etc. */
(function () {
  const NDP = window.NDP;
  const SB = (NDP.switchboard = NDP.switchboard || {});

  const TTL_PER_CALL = 22;          // seconds caller waits before hanging up
  const COMPOSURE_MAX = 100;
  const WRONG_PENALTY = 18;
  const MISS_PENALTY = 10;
  const LISTEN_DECAY = 3;           // per second of listening — no penalty,
                                    // just shows player is spending attention

  function startNight(night) {
    /* Each call becomes a scheduled event. We assign line numbers for
       regular calls; dead-line whispers are handled separately.
       Line-pick rules: caller's requested directory entry → outgoing line.
       Incoming line rotates 1..10 to look like real traffic. */
    const queue = night.calls.map((c, i) => ({
      ...c,
      idx: i,
      line: c.onDeadLine ? -1 : ((i % 10) + 1),
      state: 'pending',     // pending | ringing | answered | done | missed | wrong
      spawnedAt: null,
      ttl: null,
      answeredAt: null,
      listenedSec: 0
    }));
    const directory = SB.DIRECTORIES[night.directory] || SB.DIRECTORIES.n1;
    return {
      night,
      t: 0,
      queue,
      ringing: new Map(),    // line -> call
      active: new Map(),     // line -> call (answered, being listened or not)
      focused: null,         // the call whose card is shown
      directory,
      composure: COMPOSURE_MAX,
      composureMax: COMPOSURE_MAX,
      done: false,
      outcome: null,         // 'survived' | 'broken' | 'self_routed' | 'self_denied'
      flags: {
        you_call_seen: false,
        final_self_call: null,        // true if routed, false if denied
        halberd_listened: false,       // flipped true the moment we listen to a Halberd call
        halberd_calls_total: 0
      },
      lastWhisper: null
    };
  }

  function tick(st, dt, gameHooks) {
    if (st.done) return;
    st.t += dt;

    // Spawn scheduled calls
    for (const c of st.queue) {
      if (c.state !== 'pending') continue;
      if (st.t < c.at) continue;
      if (c.onDeadLine) {
        // Dead-line whisper — not a routable call. Fire once, set a flag.
        gameHooks.whisper(c);
        c.state = 'done';
        continue;
      }
      // Avoid collisions: if this line is busy, slide the call up by 1s
      if (st.ringing.has(c.line) || st.active.has(c.line)) { c.at = st.t + 1; continue; }
      c.state = 'ringing';
      c.spawnedAt = st.t;
      c.ttl = TTL_PER_CALL;
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
        st.composure = Math.max(0, st.composure - MISS_PENALTY);
        gameHooks.missed(c);
      }
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
     - If connected with no call (idle) → free.
  */
  function commitRoute(st, inLine, outLine, gameHooks) {
    const c = st.active.get(inLine) || st.ringing.get(inLine);
    if (!c) return { ok: true, idle: true };
    const expected = c.request ? st.directory[c.request] : null;
    const ok = expected === outLine;
    c.state = ok ? 'done' : 'wrong';
    // For the critical Night 4 self-call, flag the choice.
    if (c.critical && c.voice === 'you') {
      st.flags.final_self_call = ok;
    }
    st.active.delete(inLine);
    st.ringing.delete(inLine);
    if (st.focused === c) st.focused = null;
    if (!ok) {
      st.composure = Math.max(0, st.composure - WRONG_PENALTY);
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
    if (call.voice === 'halberd') st.flags.halberd_listened = true;
  }

  SB.Nights = { startNight, tick, answer, commitRoute, denyCall, listenTick, TTL_PER_CALL, COMPOSURE_MAX };
})();
