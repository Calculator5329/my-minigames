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

  function prefetchTranscript(callId) {
    if (!callId) return;
    if (transcripts.has(callId) || transcriptFetches.has(callId)) return;
    const p = fetch(`assets/switchboard/voices/${callId}.txt`, { cache: 'force-cache' })
      .then(r => r.ok ? r.text() : null)
      .then(t => { transcripts.set(callId, t ? t.trim() : null); return t; })
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

  SB.Voices = {
    play, stop, stopAll, whisper, ring, pickupBlip,
    setEscalation, setListening,
    prefetchTranscript, getTranscript
  };
})();
