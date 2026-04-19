/* Pong sprite atlas — opponent portraits, paddle skins, ball glow, perk icons.
   Authored at generous viewBoxes (200x200 portraits, 30x150 paddles, 80x80
   icons) so they rasterise crisply at any draw size. Common visual DNA: gold
   accents on CRT-cyan field to match the existing Pong palette. Each opponent
   gets a distinct silhouette (rookie smile, cadet visor, veteran moustache,
   master third-eye, champion crown) so they read at a glance even when shown
   as small badges in the match HUD. */
(function () {
  const NDP = window.NDP;
  const Sprites = NDP.Engine.Sprites;

  const defs = `<defs>
    <radialGradient id="halo" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffd86b" stop-opacity="0.35"/>
      <stop offset="60%" stop-color="#7ae0ff" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="2" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>`;

  // Common portrait scaffold — 200x200, head + shoulders. Subclass it per
  // opponent by passing in skin tone, hair/headwear markup, shirt colour,
  // eyes markup, mouth markup, and any extra accessory markup.
  function portrait(skin, hair, shirt, eyes, mouth, extras) {
    return `<svg viewBox="0 0 200 200">${defs}
      <circle cx="100" cy="100" r="92" fill="url(#halo)"/>
      <g filter="url(#glow)">
        <path d="M30 200 Q 30 150 70 138 L 130 138 Q 170 150 170 200 Z" fill="${shirt}"/>
        <rect x="86" y="120" width="28" height="24" fill="${skin}"/>
        <ellipse cx="100" cy="92" rx="44" ry="52" fill="${skin}"/>
        ${hair}
        ${eyes}
        ${mouth}
        ${extras || ''}
      </g>
    </svg>`;
  }

  Sprites.registerMany({
    // ---------- Opponent portraits ----------
    'pong.opp_rookie': portrait(
      '#f3c89a',
      `<path d="M58 78 Q 100 30 142 78 L 138 56 Q 100 22 62 56 Z" fill="#e6a04a"/>
       <path d="M52 96 Q 50 70 64 64" fill="none" stroke="#e6a04a" stroke-width="6" stroke-linecap="round"/>`,
      '#3f7a48',
      `<circle cx="84" cy="92" r="5" fill="#1a1a1a"/>
       <circle cx="116" cy="92" r="5" fill="#1a1a1a"/>
       <circle cx="86" cy="90" r="2" fill="#fff"/>
       <circle cx="118" cy="90" r="2" fill="#fff"/>`,
      `<path d="M84 116 Q 100 126 116 116" fill="none" stroke="#9a3030" stroke-width="3" stroke-linecap="round"/>`,
      `<circle cx="76" cy="104" r="1.6" fill="#c87a5a"/>
       <circle cx="124" cy="104" r="1.6" fill="#c87a5a"/>
       <text x="100" y="178" fill="#ffd86b" font-family="monospace" font-size="11" text-anchor="middle" font-weight="bold">R</text>`
    ),

    'pong.opp_cadet': portrait(
      '#dfa58a',
      `<rect x="56" y="48" width="88" height="22" fill="#1c2e5a"/>
       <path d="M56 70 L144 70 L138 86 Q 100 78 62 86 Z" fill="#2a4080"/>
       <rect x="92" y="36" width="16" height="14" fill="#ffd86b"/>`,
      '#2e4f96',
      `<path d="M76 88 L92 94 L92 98 L76 98 Z" fill="#1a1a1a"/>
       <path d="M124 88 L108 94 L108 98 L124 98 Z" fill="#1a1a1a"/>
       <path d="M76 94 L124 94" stroke="#0a0a14" stroke-width="2"/>`,
      `<path d="M84 116 L116 116" stroke="#3a1a1a" stroke-width="3" stroke-linecap="round"/>`,
      `<path d="M70 178 L100 162 L130 178" fill="none" stroke="#ffd86b" stroke-width="3"/>`
    ),

    'pong.opp_veteran': portrait(
      '#caa890',
      `<path d="M56 70 Q 100 50 144 70 L 144 80 Q 100 68 56 80 Z" fill="#888"/>
       <path d="M56 78 Q 56 100 64 116 L 70 100 Z" fill="#888"/>
       <path d="M144 78 Q 144 100 136 116 L 130 100 Z" fill="#888"/>`,
      '#5a4a3a',
      `<path d="M76 90 L92 90 L92 96 L76 96 Z" fill="#1a1a1a"/>
       <path d="M108 90 L124 90 L124 96 L108 96 Z" fill="#1a1a1a"/>
       <path d="M70 96 L78 92 M70 100 L78 96" stroke="#7a5a4a" stroke-width="1.4"/>
       <path d="M130 96 L122 92 M130 100 L122 96" stroke="#7a5a4a" stroke-width="1.4"/>`,
      `<path d="M82 118 L118 118" stroke="#5a3024" stroke-width="3" stroke-linecap="round"/>
       <path d="M76 110 Q 100 118 124 110 L 116 114 Q 100 110 84 114 Z" fill="#888"/>`,
      `<rect x="62" y="146" width="76" height="6" fill="#caa890"/>`
    ),

    'pong.opp_master': portrait(
      '#e0b890',
      `<ellipse cx="100" cy="44" rx="14" ry="20" fill="#1a1a1a"/>
       <rect x="92" y="44" width="16" height="14" fill="#1a1a1a"/>
       <path d="M58 70 Q 100 56 142 70 L 144 80 Q 100 64 56 80 Z" fill="#1a1a1a"/>`,
      '#7a3030',
      `<path d="M76 92 Q 84 96 92 92" fill="none" stroke="#1a1a1a" stroke-width="2.5" stroke-linecap="round"/>
       <path d="M108 92 Q 116 96 124 92" fill="none" stroke="#1a1a1a" stroke-width="2.5" stroke-linecap="round"/>`,
      `<path d="M88 116 L112 116" stroke="#5a2424" stroke-width="2" stroke-linecap="round"/>`,
      `<circle cx="100" cy="74" r="3" fill="#ffd86b"/>
       <path d="M64 156 L 100 144 L 136 156" fill="none" stroke="#ffd86b" stroke-width="2"/>`
    ),

    'pong.opp_champion': portrait(
      '#b48060',
      `<path d="M62 60 L70 28 L84 50 L100 22 L116 50 L130 28 L138 60 Z" fill="#ffd86b" stroke="#b8870a" stroke-width="2"/>
       <circle cx="84" cy="44" r="3" fill="#ff4466"/>
       <circle cx="100" cy="38" r="3" fill="#7ae0ff"/>
       <circle cx="116" cy="44" r="3" fill="#4ade80"/>
       <path d="M58 80 Q 100 72 142 80 L 144 88 Q 100 78 56 88 Z" fill="#1a1a1a"/>`,
      '#240a30',
      `<ellipse cx="84" cy="94" rx="6" ry="6" fill="#ff4466"/>
       <ellipse cx="116" cy="94" rx="6" ry="6" fill="#ff4466"/>
       <circle cx="84" cy="94" r="2" fill="#ffd86b"/>
       <circle cx="116" cy="94" r="2" fill="#ffd86b"/>`,
      `<path d="M82 120 Q 100 112 118 120" fill="none" stroke="#3a0a0a" stroke-width="3" stroke-linecap="round"/>`,
      `<path d="M50 200 L65 152 L100 162 L135 152 L150 200 Z" fill="#7a1a44" stroke="#ffd86b" stroke-width="2"/>`
    ),

    // ---------- Paddle skins (30x150 — tall narrow rounded rect + accents) ----------
    'pong.paddle_player':
      `<svg viewBox="0 0 30 150">
         <rect x="2" y="2" width="26" height="146" rx="10" ry="10" fill="#e7ecf3" stroke="#fff" stroke-width="2"/>
         <rect x="6" y="14" width="18" height="6" rx="3" fill="#ffd86b"/>
         <rect x="6" y="130" width="18" height="6" rx="3" fill="#ffd86b"/>
         <line x1="15" y1="32" x2="15" y2="118" stroke="#a0a8b4" stroke-width="2" stroke-dasharray="4 4"/>
       </svg>`,

    'pong.paddle_rookie':
      `<svg viewBox="0 0 30 150">
         <rect x="2" y="2" width="26" height="146" rx="10" ry="10" fill="#3f7a48" stroke="#7ae07a" stroke-width="2"/>
         <rect x="6" y="14" width="18" height="6" rx="3" fill="#7ae07a"/>
         <rect x="6" y="130" width="18" height="6" rx="3" fill="#7ae07a"/>
         <circle cx="15" cy="75" r="6" fill="#7ae07a"/>
       </svg>`,

    'pong.paddle_cadet':
      `<svg viewBox="0 0 30 150">
         <rect x="2" y="2" width="26" height="146" rx="10" ry="10" fill="#2e4f96" stroke="#7ae0ff" stroke-width="2"/>
         <path d="M15 18 L8 30 L22 30 Z" fill="#ffd86b"/>
         <path d="M15 132 L8 120 L22 120 Z" fill="#ffd86b"/>
         <line x1="6" y1="50" x2="24" y2="50" stroke="#ffd86b" stroke-width="2"/>
         <line x1="6" y1="100" x2="24" y2="100" stroke="#ffd86b" stroke-width="2"/>
       </svg>`,

    'pong.paddle_veteran':
      `<svg viewBox="0 0 30 150">
         <rect x="2" y="2" width="26" height="146" rx="10" ry="10" fill="#5a4a3a" stroke="#caa890" stroke-width="2"/>
         <line x1="6" y1="40" x2="24" y2="40" stroke="#caa890" stroke-width="2"/>
         <line x1="6" y1="75" x2="24" y2="75" stroke="#caa890" stroke-width="2"/>
         <line x1="6" y1="110" x2="24" y2="110" stroke="#caa890" stroke-width="2"/>
       </svg>`,

    'pong.paddle_master':
      `<svg viewBox="0 0 30 150">
         <rect x="2" y="2" width="26" height="146" rx="10" ry="10" fill="#7a3030" stroke="#ffd86b" stroke-width="2"/>
         <circle cx="15" cy="40" r="4" fill="#ffd86b"/>
         <circle cx="15" cy="75" r="4" fill="#ffd86b"/>
         <circle cx="15" cy="110" r="4" fill="#ffd86b"/>
       </svg>`,

    'pong.paddle_champion':
      `<svg viewBox="0 0 30 150">${defs}
         <rect x="2" y="2" width="26" height="146" rx="10" ry="10" fill="#240a30" stroke="#ff4466" stroke-width="2" filter="url(#glow)"/>
         <path d="M15 18 L20 28 L26 24 L22 36 L26 48 L18 44 L15 56 L12 44 L4 48 L8 36 L4 24 L10 28 Z" fill="#ffd86b" opacity="0.85"/>
         <line x1="15" y1="64" x2="15" y2="136" stroke="#ff4466" stroke-width="2"/>
       </svg>`,

    // ---------- Ball glow (40x40 — orb + halo) ----------
    'pong.ball_glow':
      `<svg viewBox="0 0 40 40">${defs}
         <circle cx="20" cy="20" r="18" fill="url(#halo)"/>
         <circle cx="20" cy="20" r="8" fill="#ffd86b" filter="url(#glow)"/>
         <circle cx="17" cy="17" r="3" fill="#fff" opacity="0.85"/>
       </svg>`,

    // ---------- Perk icons (80x80) ----------
    'pong.perk_wide':
      `<svg viewBox="0 0 80 80">
         <rect x="8" y="14" width="64" height="14" rx="6" fill="#7ae0ff" stroke="#fff" stroke-width="2"/>
         <rect x="20" y="40" width="40" height="14" rx="6" fill="#5a8a9a"/>
         <path d="M4 64 L 16 56 L 16 72 Z" fill="#ffd86b"/>
         <path d="M76 64 L 64 56 L 64 72 Z" fill="#ffd86b"/>
         <line x1="14" y1="64" x2="66" y2="64" stroke="#ffd86b" stroke-width="2"/>
       </svg>`,

    'pong.perk_curve':
      `<svg viewBox="0 0 80 80">
         <rect x="8" y="20" width="10" height="40" rx="3" fill="#e7ecf3"/>
         <path d="M22 60 Q 40 60 50 40 Q 60 20 70 22" fill="none" stroke="#ffd86b" stroke-width="3" stroke-linecap="round" stroke-dasharray="4 4"/>
         <circle cx="70" cy="22" r="6" fill="#ffd86b"/>
         <path d="M64 18 L 70 12 L 76 18" fill="none" stroke="#ffd86b" stroke-width="2"/>
       </svg>`,

    'pong.perk_twin':
      `<svg viewBox="0 0 80 80">
         <circle cx="28" cy="38" r="12" fill="#ffd86b"/>
         <circle cx="52" cy="38" r="12" fill="#7ae0ff"/>
         <path d="M40 28 L 40 48" stroke="#fff" stroke-width="2" stroke-dasharray="3 3"/>
         <text x="40" y="74" fill="#fff" font-family="monospace" font-size="14" text-anchor="middle" font-weight="bold">x2</text>
       </svg>`,

    'pong.perk_lazy':
      `<svg viewBox="0 0 80 80">
         <circle cx="40" cy="38" r="22" fill="none" stroke="#7ae0ff" stroke-width="3"/>
         <path d="M40 20 L 40 38 L 54 46" stroke="#7ae0ff" stroke-width="3" fill="none" stroke-linecap="round"/>
         <text x="40" y="74" fill="#fff" font-family="monospace" font-size="11" text-anchor="middle" font-weight="bold">SLOW</text>
       </svg>`,

    'pong.perk_bumper':
      `<svg viewBox="0 0 80 80">
         <rect x="20" y="6" width="40" height="10" rx="4" fill="#ff4466"/>
         <rect x="20" y="64" width="40" height="10" rx="4" fill="#ff4466"/>
         <rect x="36" y="30" width="8" height="20" rx="2" fill="#e7ecf3"/>
         <circle cx="40" cy="40" r="4" fill="#ffd86b"/>
         <circle cx="40" cy="40" r="9" fill="none" stroke="#ffd86b" stroke-width="1" stroke-dasharray="2 2"/>
       </svg>`,

    // ---------- Trophy + VS splash backdrop ----------
    'pong.trophy':
      `<svg viewBox="0 0 80 80">${defs}
         <ellipse cx="40" cy="74" rx="22" ry="4" fill="#5a4a3a"/>
         <rect x="32" y="58" width="16" height="16" fill="#ffd86b" stroke="#b8870a" stroke-width="2"/>
         <rect x="22" y="50" width="36" height="10" fill="#ffd86b" stroke="#b8870a" stroke-width="2"/>
         <path d="M22 14 L58 14 L54 44 Q 40 52 26 44 Z" fill="#ffd86b" stroke="#b8870a" stroke-width="2" filter="url(#glow)"/>
         <path d="M22 18 L8 18 Q 4 30 16 38 L 24 32" fill="none" stroke="#b8870a" stroke-width="3"/>
         <path d="M58 18 L72 18 Q 76 30 64 38 L 56 32" fill="none" stroke="#b8870a" stroke-width="3"/>
         <text x="40" y="36" fill="#5a4a3a" font-family="monospace" font-size="14" text-anchor="middle" font-weight="bold">P</text>
       </svg>`,

    'pong.vs_splash':
      `<svg viewBox="0 0 400 200">${defs}
         <rect width="400" height="200" fill="#000"/>
         <path d="M0 0 L 200 200 L 220 200 L 20 0 Z" fill="#7ae0ff" opacity="0.18"/>
         <path d="M400 0 L 200 200 L 180 200 L 380 0 Z" fill="#ff4466" opacity="0.18"/>
         <line x1="0" y1="100" x2="400" y2="100" stroke="#ffd86b" stroke-width="1" stroke-dasharray="4 6" opacity="0.4"/>
         <text x="200" y="120" fill="#ffd86b" font-family="monospace" font-size="80" text-anchor="middle" font-weight="bold" filter="url(#glow)">VS</text>
       </svg>`
  });
})();
