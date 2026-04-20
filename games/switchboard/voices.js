/* Voice player for 418 Linden.
   Two paths:
     1) Baked file: assets/switchboard/voices/<id>.{wav,mp3} routed through a
        per-voice Web Audio chain:  source -> rate/detune -> bandpass (phone)
                                    -> waveshaper (light tube distortion)
                                    -> dry mix
                                                  \-> convolver (room) -> wet mix
                                    + parallel hiss generator + breath layer
     2) SpeechSynthesis fallback: same params (pitch, rate) and we still play
        the ambient hiss/breath bed underneath so the line sounds occupied.

   Whispers (dead-line child lines, etc.) get a heavier reverb + lower gain.

   Per-night escalation: callers ask for an "escalation" 0..1 that biases the
   filter, hiss, and reverb wetter as the nights go on. */
(function () {
  const NDP = window.NDP;
  const SB = (NDP.switchboard = NDP.switchboard || {});

  const FILE_EXTS = ['wav', 'mp3'];
  let escalation = 0;        // 0..1, set by game.js per-night
  function setEscalation(x) { escalation = Math.max(0, Math.min(1, x)); }

  /* Per-call baked transcript cache. The bake script writes the actual spoken
     transcript to assets/switchboard/voices/<callId>.txt next to the wav.
     The board reads getTranscript(callId) when rendering the caller card and
     prefers it over the original script so the visible caption always lines
     up with what the listener actually hears. We never block on it: if the
     fetch hasn't resolved yet (or the file doesn't exist) the original line
     is used. */
  const transcripts = new Map();   // callId -> string | null
  const transcriptFetches = new Map(); // callId -> Promise

  /* Reject transcripts that obviously contain the model's compliance reply
     ("Understood. I'll deliver…", "Sure, here is…") instead of (or before)
     the actual line. The audio is still played — only the visible caption
     falls back to call.text. */
  const FRAMING_PREFIX = /^(?:["'\s]*)(understood|sure|of course|here(?:'| i)s|i'?ll|i will|okay|ok|got it|alright|certainly|absolutely|right(?:[,.]| then)|let me|happy to|noted|copy that|as requested)\b/i;
  const FRAMING_MID    = /\b(?:deliver|perform|recite|read|voice|speak|say)\b[^.\n]{0,40}\b(?:line|script|dialogue|character|in[- ]character)\b/i;
  function looksFramed(t) {
    if (!t) return false;
    return FRAMING_PREFIX.test(t) || FRAMING_MID.test(t);
  }

  function prefetchTranscript(callId) {
    if (!callId) return;
    if (transcripts.has(callId) || transcriptFetches.has(callId)) return;
    const p = fetch(`assets/switchboard/voices/${callId}.txt`, { cache: 'force-cache' })
      .then(r => r.ok ? r.text() : null)
      .then(t => {
        const trimmed = t ? t.trim() : null;
        transcripts.set(callId, trimmed && !looksFramed(trimmed) ? trimmed : null);
        return t;
      })
      .catch(() => { transcripts.set(callId, null); return null; });
    transcriptFetches.set(callId, p);
  }
  function getTranscript(callId) {
    if (!callId) return null;
    return transcripts.get(callId) || null;
  }

  const active = new Map();   // callId -> handle
  let ctx = null;             // shared AudioContext
  let masterGain = null;
  let convolver = null;       // shared room IR
  let analyser = null;
  let inited = false;

  /* "Leaning in" — when the player holds L, all currently-playing voice
     chains ramp their voice gain up; otherwise the voice drops to a muffled
     bed level so the player has to commit to listening. */
  let listening = false;
  const VOICE_GAIN_LEAN  = 1.0;    // voice when leaning in
  const VOICE_GAIN_MUTED = 0.08;   // voice when not leaning in
  const liveChains = new Set();    // gated voice gain nodes currently playing

  function isMuted() {
    return NDP.Engine.Audio && NDP.Engine.Audio.isMuted && NDP.Engine.Audio.isMuted();
  }

  function ensureCtx() {
    if (inited) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      masterGain = ctx.createGain();
      masterGain.gain.value = 1.0;
      masterGain.connect(ctx.destination);
      convolver = ctx.createConvolver();
      convolver.buffer = makeImpulseResponse(ctx, 1.4, 2.6);
      inited = true;
      return ctx;
    } catch (e) { return null; }
  }

  /* Build a synthetic, slightly metallic room impulse — dense exponential
     decay with a touch of tape modulation. Two seconds total. */
  function makeImpulseResponse(ctx, durSec, decayPower) {
    const length = ctx.sampleRate * durSec;
    const ir = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        const t = i / length;
        const env = Math.pow(1 - t, decayPower);
        // Gentle modulated noise floor
        const mod = 1 + 0.05 * Math.sin(i * 0.0007);
        data[i] = (Math.random() * 2 - 1) * env * mod;
      }
    }
    return ir;
  }

  /* A long-running noise source band-limited to "phone hiss". Returns nodes
     to start/stop and a gain to fade in/out. */
  function makeHissBed(ctx, gainValue) {
    const bufSize = 2 * ctx.sampleRate;
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < bufSize; i++) {
      // Pinkish noise via simple IIR
      const white = Math.random() * 2 - 1;
      last = 0.97 * last + 0.03 * white;
      data[i] = last * 1.4;
    }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.value = 1400; bp.Q.value = 0.5;
    const g = ctx.createGain(); g.gain.value = gainValue;
    src.connect(bp); bp.connect(g);
    return { src, gain: g };
  }

  /* Random "tape crackle" — short bursts of clicks while the call is live.
     Timer-driven, so it pauses cleanly when the call stops. */
  function makeCrackle(ctx, intensity) {
    const g = ctx.createGain(); g.gain.value = 0.0;
    let stopped = false;
    function pop() {
      if (stopped) return;
      const dur = 0.012 + Math.random() * 0.04;
      const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) {
        const env = Math.pow(1 - i / d.length, 4);
        d[i] = (Math.random() * 2 - 1) * env;
      }
      const s = ctx.createBufferSource(); s.buffer = buf;
      const cg = ctx.createGain(); cg.gain.value = 0.6 * intensity;
      s.connect(cg); cg.connect(g);
      s.start();
      const next = 0.25 + Math.random() * (1.4 - intensity);
      setTimeout(pop, next * 1000);
    }
    setTimeout(pop, 200);
    return { gain: g, stop() { stopped = true; } };
  }

  /* Periodic faint "breath" sample — a low-pass-filtered noise burst with a
     slow envelope. Intensity 0..1 controls volume + frequency. */
  function makeBreathBed(ctx, intensity) {
    const g = ctx.createGain(); g.gain.value = 0.0;
    let stopped = false;
    function breath() {
      if (stopped) return;
      const dur = 1.6 + Math.random() * 1.4;
      const len = ctx.sampleRate * dur;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const env = Math.sin(Math.PI * t) * Math.sin(Math.PI * t);
        const n = (Math.random() * 2 - 1);
        d[i] = n * env * 0.6;
      }
      const s = ctx.createBufferSource(); s.buffer = buf;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
      lp.frequency.value = 360; lp.Q.value = 0.4;
      const bg = ctx.createGain(); bg.gain.value = 0.18 * intensity;
      s.connect(lp); lp.connect(bg); bg.connect(g);
      s.start();
      const next = 5 + Math.random() * 6 - intensity * 2;
      setTimeout(breath, Math.max(2, next) * 1000);
    }
    setTimeout(breath, 500 + Math.random() * 2000);
    return { gain: g, stop() { stopped = true; } };
  }

  /* Soft tube distortion curve — gives the voice a microphone-warmth bite. */
  function makeTubeCurve(amount) {
    const n = 1024;
    const c = new Float32Array(n);
    const k = amount * 50 + 1;
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      c[i] = ((Math.PI + k) * x) / (Math.PI + k * Math.abs(x));
    }
    return c;
  }

  /* Build a per-call phone chain. Returns { input, dispose } so the caller
     can route an audio source into `input` and tear everything down on stop. */
  function makePhoneChain(profile, opts) {
    const c = ensureCtx(); if (!c) return null;

    const input = c.createGain();          // user wires source -> input
    /* `voiceGain` sits between the source and the rest of the voice chain.
       For normal calls: holding L ramps it to ~1.0, releasing drops it to
       ~0.08. The hiss / breath / crackle bed is wired straight to master so
       the *call* is always present, but the *words* only come through when
       leaning in. Whispers (opts.whisper) bypass the gate — they're already
       low-volume ambient creeps and should be heard whether you lean in or
       not. */
    const voiceGain = c.createGain();
    const gated = !opts.whisper;
    voiceGain.gain.value = gated ? (listening ? VOICE_GAIN_LEAN : VOICE_GAIN_MUTED) : 1.0;
    const bp1 = c.createBiquadFilter(); bp1.type = 'highpass';
    const bp2 = c.createBiquadFilter(); bp2.type = 'lowpass';
    const lo = (profile.filter && profile.filter.lo) || 320;
    const hi = (profile.filter && profile.filter.hi) || 2800;
    // Make the line dirtier as nights progress
    bp1.frequency.value = lo + escalation * 60;
    bp2.frequency.value = Math.max(900, hi - escalation * 600);
    bp1.Q.value = 0.7; bp2.Q.value = 0.7;

    const tube = c.createWaveShaper(); tube.curve = makeTubeCurve(0.15 + escalation * 0.25);

    const dry = c.createGain(); dry.gain.value = 1.0 - (profile.reverb || 0) * 0.6;
    const wet = c.createGain();
    const wetMix = (profile.reverb || 0) + escalation * 0.2 + (opts.whisper ? 0.3 : 0);
    wet.gain.value = Math.min(0.85, wetMix);

    input.connect(voiceGain);
    voiceGain.connect(bp1); bp1.connect(bp2); bp2.connect(tube);
    tube.connect(dry); dry.connect(masterGain);
    tube.connect(convolver); convolver.connect(wet); wet.connect(masterGain);
    if (gated) liveChains.add(voiceGain);

    // Per-call ambient bed (hiss + breath + crackle), routed dry to master
    const hissAmt = (profile.hiss || 0.08) + escalation * 0.12 + (opts.whisper ? 0.10 : 0);
    const hiss = makeHissBed(c, hissAmt);
    hiss.src.start(); hiss.gain.connect(masterGain);
    const breathInt = (opts.whisper ? 0.9 : 0.35) + escalation * 0.4;
    const breath = makeBreathBed(c, breathInt);
    breath.gain.connect(masterGain);
    const crackle = makeCrackle(c, 0.4 + escalation * 0.6);
    crackle.gain.gain.value = 0.7;
    crackle.gain.connect(masterGain);

    return {
      input,
      dispose() {
        try { hiss.src.stop(); } catch (e) {}
        crackle.stop();
        breath.stop();
        try { input.disconnect(); voiceGain.disconnect(); bp1.disconnect(); bp2.disconnect(); tube.disconnect(); dry.disconnect(); wet.disconnect(); } catch (e) {}
        try { hiss.gain.disconnect(); breath.gain.disconnect(); crackle.gain.disconnect(); } catch (e) {}
        liveChains.delete(voiceGain);
      }
    };
  }

  /* Smooth-ramp every active voice gain when the player presses / releases L.
     Also pause/resume SpeechSynthesis so the SS fallback respects listening
     too (SS doesn't support live volume changes, so pause is the closest we
     can get). */
  function setListening(on) {
    on = !!on;
    if (on === listening) return;
    listening = on;
    const c = ctx;
    if (c) {
      const t = c.currentTime;
      const target = on ? VOICE_GAIN_LEAN : VOICE_GAIN_MUTED;
      for (const g of liveChains) {
        try {
          g.gain.cancelScheduledValues(t);
          g.gain.setValueAtTime(g.gain.value, t);
          g.gain.linearRampToValueAtTime(target, t + 0.12);
        } catch (e) { g.gain.value = target; }
      }
    }
  }

  /* Try a baked file; return a Promise of an HTMLAudioElement that began
     playing successfully — or reject. */
  function tryBakedFile(callId) {
    return new Promise((resolve, reject) => {
      let extIdx = 0;
      const tryNext = () => {
        if (extIdx >= FILE_EXTS.length) return reject(new Error('no baked'));
        const ext = FILE_EXTS[extIdx++];
        const a = new Audio(`assets/switchboard/voices/${callId}.${ext}`);
        a.crossOrigin = 'anonymous';
        a.preload = 'auto';
        let resolved = false;
        a.addEventListener('canplay', () => {
          if (resolved) return; resolved = true;
          resolve(a);
        }, { once: true });
        a.addEventListener('error', () => { if (!resolved) tryNext(); }, { once: true });
        // Some browsers fire neither event until play() is called
        a.load();
        setTimeout(() => { if (!resolved) tryNext(); }, 800);
      };
      tryNext();
    });
  }

  /* Public — start a voice line. callId controls dedup + cache.
     line = { voice, text } */
  function play(callId, line) {
    stop(callId);
    prefetchTranscript(callId);
    if (isMuted()) return { stop(){} };
    const profile = (SB.VOICES && SB.VOICES[line.voice]) || (SB.VOICES && SB.VOICES.you) || null;
    if (!profile) return { stop(){} };

    const c = ensureCtx();
    let chain = c ? makePhoneChain(profile, { whisper: false }) : null;

    let stopped = false;
    let bakedAudio = null;
    let bakedSource = null;
    let ssUtter = null;

    const handle = {
      stop() {
        if (stopped) return; stopped = true;
        try { if (bakedAudio) { bakedAudio.pause(); bakedAudio.currentTime = 0; } } catch (e) {}
        try { if (bakedSource) bakedSource.disconnect(); } catch (e) {}
        try { if (ssUtter && window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) {}
        if (chain) chain.dispose();
      }
    };
    active.set(callId, handle);

    tryBakedFile(callId).then((audio) => {
      if (stopped) return;
      bakedAudio = audio;
      audio.volume = 0.95;
      audio.playbackRate = profile.rate || 1.0;
      try { audio.preservesPitch = false; audio.mozPreservesPitch = false; audio.webkitPreservesPitch = false; } catch (e) {}
      if (c && chain) {
        try {
          bakedSource = c.createMediaElementSource(audio);
          bakedSource.connect(chain.input);
        } catch (e) {
          // If MediaElementSource fails (CORS / already-attached), play raw
          audio.connect && audio.connect(chain.input);
        }
      }
      // Tear the chain down once the file plays through naturally so dead
      // voiceGains don't accumulate in the listen-gate registry.
      audio.addEventListener('ended', () => stop(callId), { once: true });
      audio.play().catch(() => fallbackSS(false));
    }).catch(() => fallbackSS(false));

    function fallbackSS() {
      // SpeechSynthesis is fallback-only (the bake covers every line). The
      // L gate doesn't apply here — SS has a single global queue and
      // pause/resume would punish whispers that play during the same call,
      // so we just speak the line at normal volume.
      if (stopped || !window.speechSynthesis) return;
      try {
        const u = new SpeechSynthesisUtterance(line.text);
        u.pitch = profile.ssPitch != null ? profile.ssPitch : 1.0;
        u.rate  = profile.ssRate  != null ? profile.ssRate  : 1.0;
        u.volume = 0.9;
        const voices = window.speechSynthesis.getVoices();
        if (voices.length) {
          const en = voices.find(v => /en[-_]/i.test(v.lang)) || voices[0];
          u.voice = en;
        }
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
        ssUtter = u;
        u.addEventListener('end', () => stop(callId), { once: true });
      } catch (e) {}
    }

    return handle;
  }

  function stop(callId) {
    const h = active.get(callId);
    if (!h) return;
    try { h.stop(); } catch (e) {}
    active.delete(callId);
  }

  function stopAll() {
    for (const id of Array.from(active.keys())) stop(id);
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }

  /* Whispered variant for dead-line child lines and similar. Heavier wet,
     pitched up, much quieter. Tries baked file too — uses
     whisper_<callId> so the generator can voice it specially if desired. */
  function whisper(callId, line) {
    stop(callId);
    prefetchTranscript(callId);
    if (isMuted()) return { stop(){} };
    const profile = (SB.VOICES && SB.VOICES[line.voice]) || (SB.VOICES && SB.VOICES.you) || null;
    if (!profile) return { stop(){} };

    const c = ensureCtx();
    const chain = c ? makePhoneChain(profile, { whisper: true }) : null;

    let stopped = false;
    let bakedAudio = null;
    let bakedSource = null;
    let ssUtter = null;

    const handle = {
      stop() {
        if (stopped) return; stopped = true;
        try { if (bakedAudio) { bakedAudio.pause(); bakedAudio.currentTime = 0; } } catch (e) {}
        try { if (bakedSource) bakedSource.disconnect(); } catch (e) {}
        try { if (ssUtter && window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) {}
        if (chain) chain.dispose();
      }
    };
    active.set(callId, handle);

    tryBakedFile(callId).then((audio) => {
      if (stopped) return;
      bakedAudio = audio;
      audio.volume = 0.55;
      audio.playbackRate = (profile.rate || 1.0) * 0.92;
      try { audio.preservesPitch = false; audio.mozPreservesPitch = false; audio.webkitPreservesPitch = false; } catch (e) {}
      if (c && chain) {
        try {
          bakedSource = c.createMediaElementSource(audio);
          bakedSource.connect(chain.input);
        } catch (e) {}
      }
      audio.addEventListener('ended', () => stop(callId), { once: true });
      audio.play().catch(() => fallbackSS());
    }).catch(() => fallbackSS());

    function fallbackSS() {
      if (stopped || !window.speechSynthesis) return;
      try {
        const u = new SpeechSynthesisUtterance(line.text);
        u.pitch = profile.whisperPitch != null ? profile.whisperPitch : 1.6;
        u.rate = (profile.ssRate || 1.0) * 0.7;
        u.volume = 0.45;
        window.speechSynthesis.speak(u);
        ssUtter = u;
        u.addEventListener('end', () => stop(callId), { once: true });
      } catch (e) {}
    }

    return handle;
  }

  /* Quick voice "blip" used by the answered call SFX (a soft pickup tone). */
  function pickupBlip() {
    const c = ensureCtx(); if (!c) return;
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = 320;
    const g = c.createGain(); g.gain.value = 0.0001;
    o.connect(g); g.connect(masterGain);
    const t = c.currentTime;
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.start(t); o.stop(t + 0.2);
  }

  /* The "ring" sample played when an incoming line lights up. Two beeps. */
  function ring() {
    const c = ensureCtx(); if (!c) return;
    const t0 = c.currentTime;
    for (let i = 0; i < 2; i++) {
      const o = c.createOscillator(); o.type = 'sine';
      o.frequency.value = 440 + (i ? 0 : 0);
      const o2 = c.createOscillator(); o2.type = 'sine';
      o2.frequency.value = 480;
      const g = c.createGain(); g.gain.value = 0.0001;
      o.connect(g); o2.connect(g); g.connect(masterGain);
      const s = t0 + i * 0.7;
      g.gain.exponentialRampToValueAtTime(0.06, s + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.5);
      o.start(s); o2.start(s); o.stop(s + 0.55); o2.stop(s + 0.55);
    }
  }

  /* Architect inhale — synth-only. A long, slow, low-passed noise envelope
     that crescendoes and stays at the apex (no exhale on tape). Used by
     game.js when the 3:14 architect window opens, layered under whatever
     baked architect line plays. */
  function inhale(durationMs) {
    const c = ensureCtx(); if (!c) return;
    const dur = Math.max(0.5, (durationMs || 4000) / 1000);
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      // Asymmetric envelope — long crescendo, no decay (no exhale)
      const env = Math.pow(t, 0.6);
      d[i] = (Math.random() * 2 - 1) * env * 0.85;
    }
    const src = c.createBufferSource(); src.buffer = buf;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.value = 480; lp.Q.value = 0.7;
    const hp = c.createBiquadFilter(); hp.type = 'highpass';
    hp.frequency.value = 120;
    const g = c.createGain(); g.gain.value = 0.22;
    src.connect(hp); hp.connect(lp); lp.connect(g); g.connect(masterGain);
    src.start();
    setTimeout(() => { try { src.stop(); src.disconnect(); g.disconnect(); lp.disconnect(); hp.disconnect(); } catch (e) {} },
               (dur + 0.2) * 1000);
  }

  /* Voice bleed — a one-shot quiet whisper of the first few words of a
     non-focused call, played through the same whisper chain. Used by
     game.js _tickBoard during architect-window or while leaning into a
     focused call to make the other lit lamps creep at the edges. */
  function bleed(callId, line) {
    if (!line || !line.text) return;
    if (isMuted()) return;
    const profile = (SB.VOICES && SB.VOICES[line.voice]) || (SB.VOICES && SB.VOICES.houseman) || null;
    if (!profile) return;
    const c = ensureCtx(); if (!c) return;
    // First 1-3 words of the line — whisper them once, very quietly.
    const words = String(line.text).split(/\s+/).filter(Boolean);
    const take = Math.min(3, Math.max(1, Math.floor(words.length * 0.18)));
    const snippet = words.slice(0, take).join(' ');
    const chain = makePhoneChain(profile, { whisper: true });
    if (!chain) return;
    try {
      const u = new SpeechSynthesisUtterance(snippet);
      u.pitch = profile.whisperPitch != null ? profile.whisperPitch : 1.4;
      u.rate = (profile.ssRate || 1.0) * 0.85;
      u.volume = 0.18;
      // SS doesn't route through our chain on most browsers, but the
      // hiss/breath bed under the chain still plays so the bleed feels
      // like it's coming from a real line. Tear the chain down after
      // a short window so we don't accumulate.
      window.speechSynthesis && window.speechSynthesis.speak(u);
      setTimeout(() => { try { chain.dispose(); } catch (e) {} }, 1800);
    } catch (e) {
      try { chain.dispose(); } catch (e2) {}
    }
  }

  /* ---------------------------------------------------------------- *
   * Jumpscare SFX. Procedural so they ship with zero asset weight and
   * can be re-tuned in code. All routed through masterGain so the
   * mute toggle and ducking work.
   * ---------------------------------------------------------------- */

  /* Sub-bass thump — chest-felt impact. Sine sweep from 80Hz down to
     ~30Hz over ~180ms with sharp attack. No click — body only. */
  function sfxSubThump(intensity) {
    const c = ensureCtx(); if (!c || isMuted()) return;
    const v = Math.max(0.05, Math.min(1, intensity == null ? 0.6 : intensity));
    const t0 = c.currentTime;
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(80, t0);
    o.frequency.exponentialRampToValueAtTime(30, t0 + 0.18);
    const g = c.createGain(); g.gain.value = 0.0001;
    g.gain.exponentialRampToValueAtTime(0.55 * v, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.32);
    o.connect(g); g.connect(masterGain);
    o.start(t0); o.stop(t0 + 0.4);
  }

  /* Metallic clang — tight, bright hit. Short noise burst through a
     high-Q bandpass at ~1800Hz with quick decay. */
  function sfxClang(intensity) {
    const c = ensureCtx(); if (!c || isMuted()) return;
    const v = Math.max(0.05, Math.min(1, intensity == null ? 0.5 : intensity));
    const len = Math.floor(c.sampleRate * 0.25);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3);
    }
    const src = c.createBufferSource(); src.buffer = buf;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.value = 1800; bp.Q.value = 18;
    const g = c.createGain(); g.gain.value = 0.4 * v;
    src.connect(bp); bp.connect(g); g.connect(masterGain);
    src.start();
    setTimeout(() => { try { src.disconnect(); bp.disconnect(); g.disconnect(); } catch (e) {} }, 400);
  }

  /* Glass-shatter — bright noise burst with a descending high-pass
     plus a few delayed micro-clinks at higher pitches. */
  function sfxGlassBreak() {
    const c = ensureCtx(); if (!c || isMuted()) return;
    const t0 = c.currentTime;
    // Initial burst
    const len = Math.floor(c.sampleRate * 0.4);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 1.6);
    }
    const src = c.createBufferSource(); src.buffer = buf;
    const hp = c.createBiquadFilter(); hp.type = 'highpass';
    hp.frequency.setValueAtTime(2400, t0);
    hp.frequency.exponentialRampToValueAtTime(800, t0 + 0.4);
    const g = c.createGain(); g.gain.value = 0.32;
    src.connect(hp); hp.connect(g); g.connect(masterGain);
    src.start();
    setTimeout(() => { try { src.disconnect(); hp.disconnect(); g.disconnect(); } catch (e) {} }, 550);
    // Two micro-clinks
    [120, 260].forEach((delay, i) => {
      setTimeout(() => {
        const o = c.createOscillator(); o.type = 'triangle';
        o.frequency.value = 3400 + i * 1200;
        const cg = c.createGain(); cg.gain.value = 0.0001;
        const tt = c.currentTime;
        cg.gain.exponentialRampToValueAtTime(0.18, tt + 0.005);
        cg.gain.exponentialRampToValueAtTime(0.0001, tt + 0.12);
        o.connect(cg); cg.connect(masterGain);
        o.start(tt); o.stop(tt + 0.14);
      }, delay);
    });
  }

  /* Phantom whisper — non-verbal "sssh-h-h-h-h" with slow tremolo.
     Pink-ish noise through a tight bandpass that wanders in pitch. */
  function sfxPhantomWhisper(durationMs) {
    const c = ensureCtx(); if (!c || isMuted()) return;
    const dur = Math.max(0.4, (durationMs || 1500) / 1000);
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    let prev = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const env = Math.sin(t * Math.PI) * (0.6 + 0.4 * Math.sin(t * 18));
      const n = (Math.random() * 2 - 1);
      prev = prev * 0.97 + n * 0.03;          // soft pinkening
      d[i] = (n * 0.6 + prev * 6) * env * 0.5;
    }
    const src = c.createBufferSource(); src.buffer = buf;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.value = 1800; bp.Q.value = 7;
    const lfo = c.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.7;
    const lfoGain = c.createGain(); lfoGain.gain.value = 700;
    lfo.connect(lfoGain); lfoGain.connect(bp.frequency);
    const g = c.createGain(); g.gain.value = 0.35;
    src.connect(bp); bp.connect(g); g.connect(masterGain);
    src.start(); lfo.start();
    setTimeout(() => {
      try {
        src.stop(); lfo.stop();
        src.disconnect(); bp.disconnect(); g.disconnect();
        lfo.disconnect(); lfoGain.disconnect();
      } catch (e) {}
    }, (dur + 0.15) * 1000);
  }

  /* Phantom ring — distorted, detuned ring tone with rising flutter
     and a sudden cut. Sounds like a phone that shouldn't be calling. */
  function sfxPhantomRing() {
    const c = ensureCtx(); if (!c || isMuted()) return;
    const t0 = c.currentTime;
    const o1 = c.createOscillator(); o1.type = 'sine'; o1.frequency.value = 440;
    const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = 437;
    const lfo = c.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 6;
    const lfoG = c.createGain(); lfoG.gain.value = 12;
    lfo.connect(lfoG);
    lfoG.connect(o1.frequency);
    lfoG.connect(o2.frequency);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(800, t0);
    lp.frequency.exponentialRampToValueAtTime(2400, t0 + 0.7);
    const g = c.createGain(); g.gain.value = 0.0001;
    g.gain.exponentialRampToValueAtTime(0.16, t0 + 0.05);
    g.gain.linearRampToValueAtTime(0.16, t0 + 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.78);   // sudden cut
    o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(masterGain);
    o1.start(t0); o2.start(t0); lfo.start(t0);
    o1.stop(t0 + 0.85); o2.stop(t0 + 0.85); lfo.stop(t0 + 0.85);
  }

  /* Distant heartbeat — two short sub-thumps (lub-dub) with a tiny
     gap. Used as a mood underlay when composure is critical. */
  function sfxHeartbeat() {
    sfxSubThump(0.4);
    setTimeout(() => sfxSubThump(0.3), 240);
  }

  /* Screech — the BIG jumpscare. Descending high-frequency sweep mixed
     with bright noise. Pairs with the screen-face overlay. */
  function sfxScreech() {
    const c = ensureCtx(); if (!c || isMuted()) return;
    const t0 = c.currentTime;
    const o = c.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(2800, t0);
    o.frequency.exponentialRampToValueAtTime(380, t0 + 0.55);
    const og = c.createGain(); og.gain.value = 0.0001;
    og.gain.exponentialRampToValueAtTime(0.22, t0 + 0.02);
    og.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6);
    o.connect(og); og.connect(masterGain);
    o.start(t0); o.stop(t0 + 0.65);
    // Layer of bright noise
    const len = Math.floor(c.sampleRate * 0.6);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 1.4);
    }
    const src = c.createBufferSource(); src.buffer = buf;
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1600;
    const ng = c.createGain(); ng.gain.value = 0.18;
    src.connect(hp); hp.connect(ng); ng.connect(masterGain);
    src.start();
    setTimeout(() => { try { src.disconnect(); hp.disconnect(); ng.disconnect(); } catch (e) {} }, 800);
  }

  SB.Voices = {
    play, stop, stopAll, whisper, ring, pickupBlip,
    setEscalation, setListening,
    prefetchTranscript, getTranscript,
    inhale, bleed,
    sfxSubThump, sfxClang, sfxGlassBreak, sfxPhantomWhisper,
    sfxPhantomRing, sfxHeartbeat, sfxScreech
  };
})();
