/* Tiny Web-Audio synth. No asset files.
   Games call NDP.Engine.Audio.beep({ freq, type, dur, vol, slide, noise }). */
(function () {
  const NDP = (window.NDP = window.NDP || {});
  NDP.Engine = NDP.Engine || {};

  let ctx = null;
  let master = null;
  let ambientNode = null;

  function ensure() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = NDP.Engine.Storage.isMuted() ? 0 : 0.4;
    master.connect(ctx.destination);
  }

  // Unlock on first user gesture (browser policy).
  function unlock() {
    ensure();
    if (ctx && ctx.state === 'suspended') ctx.resume();
    window.removeEventListener('click', unlock);
    window.removeEventListener('keydown', unlock);
  }
  window.addEventListener('click', unlock);
  window.addEventListener('keydown', unlock);

  function beep(opts) {
    ensure();
    if (!ctx) return;
    opts = opts || {};
    const now = ctx.currentTime;
    const type = opts.type || 'square';
    const freq = opts.freq || 440;
    const dur = opts.dur || 0.12;
    const vol = opts.vol == null ? 0.5 : opts.vol;
    const slide = opts.slide || 0;
    const atk = opts.atk || 0.005;
    const rel = opts.rel || Math.max(0.02, dur * 0.6);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(vol, now + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, now + atk + dur + rel);

    let src;
    if (type === 'noise') {
      const buf = noiseBuffer();
      src = ctx.createBufferSource();
      src.buffer = buf;
      if (opts.filter) {
        const f = ctx.createBiquadFilter();
        f.type = opts.filter;
        f.frequency.value = freq;
        src.connect(f); f.connect(g);
      } else {
        src.connect(g);
      }
    } else {
      src = ctx.createOscillator();
      src.type = type;
      src.frequency.setValueAtTime(freq, now);
      if (slide) src.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), now + dur + rel);
      src.connect(g);
    }

    g.connect(master);
    src.start(now);
    src.stop(now + atk + dur + rel + 0.05);
  }

  let _noiseBuf = null;
  function noiseBuffer() {
    if (_noiseBuf) return _noiseBuf;
    ensure();
    const len = ctx.sampleRate * 0.5;
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    _noiseBuf = b;
    return b;
  }

  function chord(freqs, opts) {
    (freqs || []).forEach((f, i) => {
      setTimeout(() => beep(Object.assign({}, opts, { freq: f })), i * 18);
    });
  }

  function startAmbient(opts) {
    stopAmbient();
    ensure();
    if (!ctx) return;
    opts = opts || {};
    const freq = opts.freq || 80;
    const type = opts.type || 'sine';
    const vol = opts.vol || 0.08;

    const o1 = ctx.createOscillator();
    o1.type = type; o1.frequency.value = freq;
    const o2 = ctx.createOscillator();
    o2.type = type; o2.frequency.value = freq * 1.503; // fifth-ish
    const g = ctx.createGain(); g.gain.value = 0;
    o1.connect(g); o2.connect(g); g.connect(master);
    o1.start(); o2.start();
    g.gain.linearRampToValueAtTime(vol, ctx.currentTime + 1.2);

    // slow lfo on freq
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.08;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 1.4;
    lfo.connect(lfoGain); lfoGain.connect(o1.frequency);
    lfo.start();

    ambientNode = { o1, o2, lfo, g };
  }

  function stopAmbient() {
    if (!ambientNode || !ctx) return;
    const { o1, o2, lfo, g } = ambientNode;
    try {
      g.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
      setTimeout(() => { try { o1.stop(); o2.stop(); lfo.stop(); } catch(e){} }, 350);
    } catch (e) {}
    ambientNode = null;
  }

  function setMuted(m) {
    NDP.Engine.Storage.setMuted(m);
    if (master) master.gain.value = m ? 0 : 0.4;
  }
  function toggleMuted() {
    const now = !NDP.Engine.Storage.isMuted();
    setMuted(now);
    return now;
  }

  NDP.Engine.Audio = { beep, chord, startAmbient, stopAmbient, setMuted, toggleMuted,
    isMuted: () => NDP.Engine.Storage.isMuted() };
})();
