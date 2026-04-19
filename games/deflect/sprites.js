/* Deflect — inline SVG sprite atlas. */
(function () {
  const NDP = window.NDP;
  const Sprites = NDP.Engine && NDP.Engine.Sprites;
  if (!Sprites) return;

  // Knight (player) — top-down, holding sword + shield. Pivot is center.
  const knight = `
<svg viewBox="0 0 96 96">
  <defs>
    <radialGradient id="kg" cx="50%" cy="40%" r="50%">
      <stop offset="0%" stop-color="#fffbe6"/>
      <stop offset="60%" stop-color="#cfd8e3"/>
      <stop offset="100%" stop-color="#3a4254"/>
    </radialGradient>
    <linearGradient id="kc" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ff7b8c"/>
      <stop offset="100%" stop-color="#a0203a"/>
    </linearGradient>
  </defs>
  <!-- cape -->
  <path d="M48 18 C 28 30 24 60 36 84 L 48 78 L 60 84 C 72 60 68 30 48 18 Z" fill="url(#kc)" stroke="#3a0410" stroke-width="1.5"/>
  <!-- armor body (octagon) -->
  <polygon points="48,22 64,30 70,46 64,62 48,70 32,62 26,46 32,30"
           fill="url(#kg)" stroke="#1c2230" stroke-width="2"/>
  <!-- chest plate emblem -->
  <polygon points="48,32 56,42 48,56 40,42" fill="#ffd86b" stroke="#3a2206" stroke-width="1"/>
  <circle cx="48" cy="44" r="3" fill="#3a2206"/>
  <!-- helmet -->
  <ellipse cx="48" cy="24" rx="14" ry="10" fill="#cfd8e3" stroke="#1c2230" stroke-width="2"/>
  <rect x="44" y="22" width="8" height="6" fill="#0c0e16"/>
  <line x1="48" y1="14" x2="48" y2="22" stroke="#1c2230" stroke-width="2"/>
  <polygon points="44,8 52,8 50,14 46,14" fill="#ff5566" stroke="#3a0410"/>
</svg>`;

  // Arrow projectile — wood + steel head + fletching.
  const arrow = `
<svg viewBox="0 0 64 16">
  <line x1="6" y1="8" x2="48" y2="8" stroke="#a06a36" stroke-width="3" stroke-linecap="round"/>
  <polygon points="48,4 60,8 48,12" fill="#cfd8e3" stroke="#1c2230" stroke-width="1"/>
  <polygon points="6,8 0,3 4,8 0,13" fill="#ffbb33" stroke="#3a2206" stroke-width="0.8"/>
</svg>`;

  // Firebolt — comet with flame trail.
  const firebolt = `
<svg viewBox="0 0 64 32">
  <defs>
    <radialGradient id="fb" cx="80%" cy="50%" r="60%">
      <stop offset="0%" stop-color="#fff4c0"/>
      <stop offset="40%" stop-color="#ff7a3a"/>
      <stop offset="100%" stop-color="#3a0a06"/>
    </radialGradient>
  </defs>
  <path d="M0 16 Q 16 6 32 14 L 56 16 L 32 18 Q 16 26 0 16 Z" fill="url(#fb)" opacity="0.85"/>
  <circle cx="50" cy="16" r="9" fill="url(#fb)"/>
  <circle cx="52" cy="14" r="3" fill="#fff7d8"/>
</svg>`;

  // Splitter shard — angular crystal that pulses.
  const splitter = `
<svg viewBox="0 0 32 32">
  <defs>
    <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#d6a8ff"/>
      <stop offset="100%" stop-color="#3a1264"/>
    </linearGradient>
  </defs>
  <polygon points="16,2 30,16 16,30 2,16" fill="url(#sg)" stroke="#1a0830" stroke-width="2"/>
  <polygon points="16,8 22,16 16,24 10,16" fill="#fff" opacity="0.55"/>
</svg>`;

  // Frost shard — pale blue snowflake-ish hexagon.
  const frost = `
<svg viewBox="0 0 32 32">
  <defs>
    <radialGradient id="frg" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#fff"/>
      <stop offset="60%" stop-color="#7ae0ff"/>
      <stop offset="100%" stop-color="#0c2840"/>
    </radialGradient>
  </defs>
  <polygon points="16,2 28,9 28,23 16,30 4,23 4,9" fill="url(#frg)" stroke="#0a1a2c" stroke-width="1.5"/>
  <g stroke="#fff" stroke-width="1.2" opacity="0.8">
    <line x1="16" y1="6" x2="16" y2="26"/>
    <line x1="6" y1="11" x2="26" y2="21"/>
    <line x1="6" y1="21" x2="26" y2="11"/>
  </g>
</svg>`;

  // Armored — heavy diamond with iron rivets.
  const armored = `
<svg viewBox="0 0 32 32">
  <defs>
    <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#cfd8e3"/>
      <stop offset="100%" stop-color="#3a4254"/>
    </linearGradient>
  </defs>
  <polygon points="16,2 30,16 16,30 2,16" fill="url(#ag)" stroke="#0a0e16" stroke-width="2"/>
  <polygon points="16,8 24,16 16,24 8,16" fill="none" stroke="#0a0e16" stroke-width="1"/>
  <circle cx="16" cy="6" r="1.4" fill="#0a0e16"/>
  <circle cx="16" cy="26" r="1.4" fill="#0a0e16"/>
  <circle cx="6" cy="16" r="1.4" fill="#0a0e16"/>
  <circle cx="26" cy="16" r="1.4" fill="#0a0e16"/>
</svg>`;

  // Boss — Warden helm
  const warden = `
<svg viewBox="0 0 160 160">
  <defs>
    <linearGradient id="wg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fae6a6"/>
      <stop offset="100%" stop-color="#a06a08"/>
    </linearGradient>
  </defs>
  <g transform="translate(80 80)">
    <!-- horns -->
    <path d="M-50 -10 Q -76 -64 -36 -52" fill="#1a0a04" stroke="#000" stroke-width="2"/>
    <path d="M50 -10 Q 76 -64 36 -52" fill="#1a0a04" stroke="#000" stroke-width="2"/>
    <!-- helm -->
    <polygon points="-44,-30 44,-30 56,12 36,46 -36,46 -56,12" fill="url(#wg)" stroke="#3a2206" stroke-width="3"/>
    <!-- visor -->
    <rect x="-30" y="-6" width="60" height="14" fill="#0a0e16"/>
    <line x1="-30" y1="0" x2="30" y2="0" stroke="#ff5566" stroke-width="2"/>
    <!-- mouth slits -->
    ${Array.from({length:5}).map((_,i)=>`<rect x="${-22+i*10}" y="22" width="4" height="14" fill="#0a0e16"/>`).join('')}
    <!-- crest -->
    <polygon points="-12,-30 0,-50 12,-30" fill="#ff5566" stroke="#3a0410" stroke-width="1.5"/>
  </g>
</svg>`;

  // Boss — Twin sister mask (used twice flipped)
  const twin = `
<svg viewBox="0 0 160 160">
  <defs>
    <radialGradient id="tg" cx="50%" cy="40%" r="60%">
      <stop offset="0%" stop-color="#ffd1ec"/>
      <stop offset="100%" stop-color="#5a0a3a"/>
    </radialGradient>
  </defs>
  <g transform="translate(80 80)">
    <ellipse rx="60" ry="64" fill="url(#tg)" stroke="#1a0010" stroke-width="3"/>
    <!-- single tear-drop eye -->
    <path d="M-22 -12 L 16 -12 L 8 18 L -22 0 Z" fill="#0a0010" stroke="#fff" stroke-width="1"/>
    <circle cx="-4" cy="-2" r="6" fill="#7ae0ff"/>
    <!-- mouth stitched line -->
    <path d="M-26 36 Q 0 50 30 30" stroke="#0a0010" stroke-width="3" fill="none"/>
    ${Array.from({length:6}).map((_,i)=>`<line x1="${-22+i*10}" y1="${38-Math.abs((i-2.5))*1.2}" x2="${-22+i*10}" y2="${48-Math.abs((i-2.5))*1.2}" stroke="#0a0010" stroke-width="2"/>`).join('')}
  </g>
</svg>`;

  // Boss — The Sun
  const sun = `
<svg viewBox="0 0 200 200">
  <defs>
    <radialGradient id="sg2" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#fff8d4"/>
      <stop offset="40%" stop-color="#ffd86b"/>
      <stop offset="80%" stop-color="#ff7a3a"/>
      <stop offset="100%" stop-color="#3a0a06"/>
    </radialGradient>
  </defs>
  <g transform="translate(100 100)">
    ${Array.from({length:24}).map((_,i)=>{const a=i*Math.PI/12;const x=Math.cos(a)*92,y=Math.sin(a)*92;
      const ax=Math.cos(a+0.08)*60, ay=Math.sin(a+0.08)*60;
      const bx=Math.cos(a-0.08)*60, by=Math.sin(a-0.08)*60;
      return `<polygon points="${ax},${ay} ${x},${y} ${bx},${by}" fill="#ffd86b" opacity="0.8"/>`;}).join('')}
    <circle r="60" fill="url(#sg2)" stroke="#3a0a06" stroke-width="3"/>
    <!-- angry eyes -->
    <polygon points="-26,-10 -8,-4 -26,4" fill="#3a0a06"/>
    <polygon points="26,-10 8,-4 26,4" fill="#3a0a06"/>
    <path d="M-22 24 Q 0 14 22 24" stroke="#3a0a06" stroke-width="3" fill="none"/>
  </g>
</svg>`;

  // Perk card sigils
  const perk_arc = `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="28" fill="#1a0a14" stroke="#ffbb33" stroke-width="2"/><path d="M14 32 a18 18 0 0 1 36 0" stroke="#ffbb33" fill="none" stroke-width="6" stroke-linecap="round"/></svg>`;
  const perk_speed = `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="28" fill="#001a14" stroke="#7ae0ff" stroke-width="2"/><polygon points="20,46 36,18 32,32 44,32 26,52 32,36" fill="#7ae0ff"/></svg>`;
  const perk_heart = `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="28" fill="#1a0008" stroke="#ff5566" stroke-width="2"/><path d="M32 48 C 12 36 12 14 32 22 C 52 14 52 36 32 48 Z" fill="#ff5566"/></svg>`;
  const perk_reflect = `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="28" fill="#100614" stroke="#d6a8ff" stroke-width="2"/><polygon points="32,12 50,32 32,52 14,32" fill="#d6a8ff"/><polygon points="32,20 42,32 32,44 22,32" fill="#100614"/></svg>`;
  const perk_combo = `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="28" fill="#0e0a14" stroke="#fbbf24" stroke-width="2"/><text x="32" y="40" text-anchor="middle" fill="#fbbf24" font-family="ui-monospace, monospace" font-weight="bold" font-size="22">×2</text></svg>`;
  const perk_slow = `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="28" fill="#020e14" stroke="#bff7ff" stroke-width="2"/><circle cx="32" cy="32" r="14" fill="none" stroke="#bff7ff" stroke-width="2"/><line x1="32" y1="32" x2="32" y2="22" stroke="#bff7ff" stroke-width="3" stroke-linecap="round"/><line x1="32" y1="32" x2="42" y2="32" stroke="#bff7ff" stroke-width="3" stroke-linecap="round"/></svg>`;

  Sprites.registerMany({
    'deflect.knight': knight,
    'deflect.arrow': arrow,
    'deflect.firebolt': firebolt,
    'deflect.splitter': splitter,
    'deflect.frost': frost,
    'deflect.armored': armored,
    'deflect.warden': warden,
    'deflect.twin': twin,
    'deflect.sun': sun,
    'deflect.perk_arc': perk_arc,
    'deflect.perk_speed': perk_speed,
    'deflect.perk_heart': perk_heart,
    'deflect.perk_reflect': perk_reflect,
    'deflect.perk_combo': perk_combo,
    'deflect.perk_slow': perk_slow
  });
})();
