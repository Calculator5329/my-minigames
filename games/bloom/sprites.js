/* Bloom — inline SVG sprite atlas.
   Registered with the engine on load; consumed by game.js via Sprites.draw. */
(function () {
  const NDP = window.NDP;
  const Sprites = NDP.Engine && NDP.Engine.Sprites;
  if (!Sprites) { console.warn('[bloom/sprites] Sprites engine missing'); return; }

  // Coral plume — used as biome flora and as boss-petal cores.
  const coral = `
<svg viewBox="0 0 64 64">
  <defs>
    <radialGradient id="cg" cx="50%" cy="60%" r="60%">
      <stop offset="0%" stop-color="#ffd1ec"/>
      <stop offset="55%" stop-color="#ff7fbf"/>
      <stop offset="100%" stop-color="#9c1a5d"/>
    </radialGradient>
  </defs>
  <g fill="url(#cg)" stroke="#3a0a23" stroke-width="1">
    <path d="M32 60 C 18 50 12 38 16 24 C 22 14 30 12 32 22 C 34 12 42 14 48 24 C 52 38 46 50 32 60 Z"/>
    <ellipse cx="32" cy="46" rx="3" ry="6" fill="#fff8" stroke="none"/>
  </g>
  <g fill="#ffe1f2" opacity="0.75">
    <circle cx="22" cy="30" r="2"/>
    <circle cx="42" cy="32" r="2"/>
    <circle cx="32" cy="38" r="1.6"/>
  </g>
</svg>`;

  // Kelp blade — long flowing leaf for forest biome.
  const kelp = `
<svg viewBox="0 0 32 128">
  <defs>
    <linearGradient id="kg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#4ade80"/>
      <stop offset="100%" stop-color="#0c3a22"/>
    </linearGradient>
  </defs>
  <path d="M16 4 C 8 30 24 50 14 78 C 6 100 22 116 16 124 L 16 128 L 18 124 C 26 110 10 92 18 70 C 26 48 10 28 18 4 Z"
        fill="url(#kg)" stroke="#062614" stroke-width="1"/>
  <path d="M16 18 C 12 30 20 44 14 60" stroke="#bff7d8" stroke-width="0.6" fill="none" opacity="0.6"/>
</svg>`;

  // Sentinel jelly — biome-gate boss helper, soft glowing umbrella with tendrils.
  const jelly = `
<svg viewBox="0 0 96 96">
  <defs>
    <radialGradient id="jg" cx="50%" cy="40%" r="55%">
      <stop offset="0%"  stop-color="#fff5fb" stop-opacity="0.95"/>
      <stop offset="60%" stop-color="#ff6ad4" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="#7a1c63" stop-opacity="0.9"/>
    </radialGradient>
  </defs>
  <ellipse cx="48" cy="40" rx="36" ry="28" fill="url(#jg)" stroke="#3b0826" stroke-width="1.2"/>
  <ellipse cx="48" cy="40" rx="22" ry="16" fill="#ffe6f4" opacity="0.55"/>
  <g stroke="#ff8fd6" stroke-width="2" fill="none" opacity="0.85">
    <path d="M22 56 Q 18 76 26 92"/>
    <path d="M34 60 Q 30 80 38 94"/>
    <path d="M48 62 Q 46 84 50 96"/>
    <path d="M62 60 Q 66 80 58 94"/>
    <path d="M74 56 Q 78 78 70 92"/>
  </g>
  <g fill="#fff" opacity="0.9">
    <circle cx="40" cy="36" r="2"/>
    <circle cx="56" cy="36" r="2"/>
  </g>
</svg>`;

  // Helio boss — radiant star with outer corona.
  const helio = `
<svg viewBox="0 0 160 160">
  <defs>
    <radialGradient id="hg" cx="50%" cy="50%" r="50%">
      <stop offset="0%"  stop-color="#fff7d8"/>
      <stop offset="40%" stop-color="#ffd86b"/>
      <stop offset="80%" stop-color="#ff7a3a"/>
      <stop offset="100%" stop-color="#621f0a"/>
    </radialGradient>
    <radialGradient id="hgc" cx="50%" cy="50%" r="50%">
      <stop offset="0%"  stop-color="#ffe9a5" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="#ffe9a5" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="80" cy="80" r="78" fill="url(#hgc)"/>
  <g transform="translate(80 80)" fill="#ffd86b" opacity="0.85">
    ${Array.from({length:12}).map((_,i)=>{const a=i*Math.PI/6;const x=Math.cos(a)*72,y=Math.sin(a)*72;return `<polygon points="0,-6 ${x},${y} 0,6"/>`;}).join('')}
  </g>
  <circle cx="80" cy="80" r="42" fill="url(#hg)" stroke="#5a1a06" stroke-width="2"/>
  <circle cx="68" cy="68" r="6" fill="#fff" opacity="0.7"/>
</svg>`;

  // Maw boss — spiked maw with teeth.
  const maw = `
<svg viewBox="0 0 160 160">
  <defs>
    <radialGradient id="mg" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#3a0a14"/>
      <stop offset="60%" stop-color="#7a0a2c"/>
      <stop offset="100%" stop-color="#22030a"/>
    </radialGradient>
  </defs>
  <g transform="translate(80 80)">
    <g fill="#a01030" stroke="#180206" stroke-width="2">
      ${Array.from({length:16}).map((_,i)=>{const a=i*Math.PI/8;const x=Math.cos(a)*70,y=Math.sin(a)*70,x2=Math.cos(a)*52,y2=Math.sin(a)*52;
        const ax=Math.cos(a+0.18)*52, ay=Math.sin(a+0.18)*52;
        return `<polygon points="${x2},${y2} ${x},${y} ${ax},${ay}"/>`;}).join('')}
    </g>
    <circle r="50" fill="url(#mg)" stroke="#180206" stroke-width="2"/>
    <g fill="#fff5d8">
      ${Array.from({length:12}).map((_,i)=>{const a=i*Math.PI/6;const x=Math.cos(a)*40,y=Math.sin(a)*40;
        const x2=Math.cos(a)*30, y2=Math.sin(a)*30;
        const ax=Math.cos(a+0.13)*40, ay=Math.sin(a+0.13)*40;
        return `<polygon points="${x2},${y2} ${x},${y} ${ax},${ay}"/>`;}).join('')}
    </g>
    <circle r="14" fill="#000"/>
    <circle cx="-4" cy="-4" r="3" fill="#ff4f7a"/>
  </g>
</svg>`;

  // Spike — ambient hazard.
  const spike = `
<svg viewBox="0 0 32 32">
  <defs>
    <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#dcecff"/>
      <stop offset="100%" stop-color="#3a5ea8"/>
    </linearGradient>
  </defs>
  <g transform="translate(16 16)" fill="url(#sg)" stroke="#0c1a3a" stroke-width="0.6">
    ${Array.from({length:8}).map((_,i)=>{const a=i*Math.PI/4;const x=Math.cos(a)*14,y=Math.sin(a)*14;
      const ax=Math.cos(a+0.4)*4, ay=Math.sin(a+0.4)*4;
      const bx=Math.cos(a-0.4)*4, by=Math.sin(a-0.4)*4;
      return `<polygon points="${ax},${ay} ${x},${y} ${bx},${by}"/>`;}).join('')}
    <circle r="4" fill="#0c1a3a"/>
  </g>
</svg>`;

  // Plankton mote — pickup token.
  const mote = `
<svg viewBox="0 0 24 24">
  <defs>
    <radialGradient id="mtg" cx="50%" cy="40%" r="50%">
      <stop offset="0%" stop-color="#fff"/>
      <stop offset="60%" stop-color="#7ae0ff"/>
      <stop offset="100%" stop-color="#0a3a5a"/>
    </radialGradient>
  </defs>
  <circle cx="12" cy="12" r="10" fill="url(#mtg)" stroke="#06243a" stroke-width="0.8"/>
  <circle cx="9" cy="9" r="2.4" fill="#fff" opacity="0.85"/>
</svg>`;

  // Powerup chips
  const chip_bloom = `
<svg viewBox="0 0 32 32">
  <circle cx="16" cy="16" r="14" fill="#220028" stroke="#ff4fd8" stroke-width="2"/>
  <g transform="translate(16 16)" fill="#ff4fd8">
    ${Array.from({length:6}).map((_,i)=>{const a=i*Math.PI/3;const x=Math.cos(a)*10,y=Math.sin(a)*10;return `<circle cx="${x}" cy="${y}" r="3"/>`;}).join('')}
    <circle r="3" fill="#fff"/>
  </g>
</svg>`;
  const chip_magnet = `
<svg viewBox="0 0 32 32">
  <circle cx="16" cy="16" r="14" fill="#001a28" stroke="#7ae0ff" stroke-width="2"/>
  <path d="M9 22 V14 a7 7 0 0 1 14 0 V22 H19 V14 a3 3 0 0 0 -6 0 V22 Z" fill="#7ae0ff"/>
  <rect x="9" y="22" width="4" height="3" fill="#fff"/>
  <rect x="19" y="22" width="4" height="3" fill="#fff"/>
</svg>`;
  const chip_spike = `
<svg viewBox="0 0 32 32">
  <circle cx="16" cy="16" r="14" fill="#10130a" stroke="#fbbf24" stroke-width="2"/>
  <g transform="translate(16 16)" fill="#fbbf24" stroke="#10130a" stroke-width="0.5">
    ${Array.from({length:8}).map((_,i)=>{const a=i*Math.PI/4;const x=Math.cos(a)*9,y=Math.sin(a)*9;
      const ax=Math.cos(a+0.4)*3, ay=Math.sin(a+0.4)*3;
      const bx=Math.cos(a-0.4)*3, by=Math.sin(a-0.4)*3;
      return `<polygon points="${ax},${ay} ${x},${y} ${bx},${by}"/>`;}).join('')}
  </g>
</svg>`;

  Sprites.registerMany({
    'bloom.coral': coral,
    'bloom.kelp': kelp,
    'bloom.jelly': jelly,
    'bloom.helio': helio,
    'bloom.maw': maw,
    'bloom.spike': spike,
    'bloom.mote': mote,
    'bloom.chip_bloom': chip_bloom,
    'bloom.chip_magnet': chip_magnet,
    'bloom.chip_spike': chip_spike
  });
})();
