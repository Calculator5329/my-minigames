/* Voice player. Prefers baked MP3s; falls back to SpeechSynthesis.
   Both paths honor engine mute. Owns nothing — callers own the "call"
   and just ask this module to start/stop a line. */
(function () {
  const NDP = window.NDP;
  const SB = (NDP.switchboard = NDP.switchboard || {});

  const active = new Map();   // callId -> { audio?, utter?, kind }

  function isMuted() {
    return NDP.Engine.Audio && NDP.Engine.Audio.isMuted && NDP.Engine.Audio.isMuted();
  }

  /* Try the baked MP3 in assets/switchboard/voices/<id>.mp3. If missing or
     errors, fall through to SpeechSynthesis with the voice profile's pitch
     and rate. Returns a handle with stop(). */
  function play(callId, line) {
    stop(callId);
    if (isMuted()) return { stop(){} };

    const profile = SB.VOICES[line.voice] || SB.VOICES.you;
    const src = `assets/switchboard/voices/${callId}.mp3`;

    // Probe quickly — create Audio element, attempt to play, fall back on error.
    let audio = new Audio(src);
    audio.volume = 0.9;
    let fellBack = false;

    const doSS = () => {
      if (!window.speechSynthesis) return;
      try {
        const u = new SpeechSynthesisUtterance(line.text);
        u.pitch = profile.ssPitch;
        u.rate = profile.ssRate;
        u.volume = 0.85;
        // Prefer a "plain" default voice — we actually want the robotic read.
        const voices = window.speechSynthesis.getVoices();
        if (voices.length) {
          // Pick a stable default — first English voice available.
          const en = voices.find(v => /en[-_]/i.test(v.lang)) || voices[0];
          u.voice = en;
        }
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
        active.set(callId, { utter: u, kind: 'ss' });
      } catch (e) { /* no SS — silent */ }
    };

    audio.onerror = () => { if (!fellBack) { fellBack = true; doSS(); } };
    audio.play().then(() => {
      active.set(callId, { audio, kind: 'mp3' });
    }).catch(() => {
      if (!fellBack) { fellBack = true; doSS(); }
    });

    return {
      stop() { stop(callId); }
    };
  }

  function stop(callId) {
    const h = active.get(callId);
    if (!h) return;
    try {
      if (h.kind === 'mp3' && h.audio) { h.audio.pause(); h.audio.currentTime = 0; }
      if (h.kind === 'ss' && window.speechSynthesis) window.speechSynthesis.cancel();
    } catch (e) { /* ignore */ }
    active.delete(callId);
  }

  function stopAll() {
    for (const id of Array.from(active.keys())) stop(id);
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }

  /* "Whispered" variants for dead-line child lines — pitch up + narrower vol */
  function whisper(callId, line) {
    stop(callId);
    if (isMuted()) return { stop(){} };
    if (!window.speechSynthesis) return { stop(){} };
    try {
      const u = new SpeechSynthesisUtterance(line.text);
      u.pitch = 1.8;
      u.rate = 0.6;
      u.volume = 0.5;
      window.speechSynthesis.speak(u);
      active.set(callId, { utter: u, kind: 'ss' });
    } catch (e) {}
    return { stop(){ stop(callId); } };
  }

  SB.Voices = { play, stop, stopAll, whisper };
})();
