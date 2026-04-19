/* Breakout sprite atlas — brick variants, paddle skins, power-up chips,
   world banners and the boss mega-brick. All authored as inline SVG so
   they rasterise crisply at the size requested by the game.

   Brick sprites (100x36) are designed to OVERLAY a flat world-tinted rect:
   the game first fills the brick rect with the world's brick colour, then
   draws the sprite on top. The sprite contributes the highlight bar, the
   bottom shadow, the outline and the type-specific glyph (rivets, frost,
   skull, padlock, etc.). This means one set of brick sprites supports five
   distinct worlds without 35 separate vector files. */
(function () {
  const NDP = window.NDP;
  const Sprites = NDP.Engine.Sprites;

  // Reusable brick chrome — translucent highlight + shadow + outline.
  const chrome = `
    <rect x="2" y="2" width="96" height="32" rx="4" fill="none"
          stroke="rgba(8,4,12,0.55)" stroke-width="2"/>
    <rect x="3" y="3" width="94" height="9" rx="3" fill="rgba(255,255,255,0.32)"/>
    <rect x="3" y="26" width="94" height="7" rx="2" fill="rgba(0,0,0,0.30)"/>`;

  Sprites.registerMany({
    /* ---------- Brick variants (100x36) ---------- */
    'brk.brick_normal': `<svg viewBox="0 0 100 36">${chrome}
      <line x1="20" y1="18" x2="80" y2="18" stroke="rgba(255,255,255,0.18)" stroke-width="1"/>
    </svg>`,

    'brk.brick_ice': `<svg viewBox="0 0 100 36">${chrome}
      <path d="M16 16 L24 22 L20 28 M40 14 L48 22 L44 30 M64 12 L72 20 L66 28 M80 18 L88 24 L82 30"
            stroke="rgba(220,240,255,0.85)" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      <circle cx="30" cy="10" r="1.6" fill="rgba(255,255,255,0.85)"/>
      <circle cx="58" cy="22" r="1.4" fill="rgba(255,255,255,0.7)"/>
      <circle cx="76" cy="14" r="1.6" fill="rgba(255,255,255,0.85)"/>
      <rect x="2" y="2" width="96" height="32" rx="4" fill="rgba(180,220,255,0.18)"/>
    </svg>`,

    'brk.brick_metal': `<svg viewBox="0 0 100 36">${chrome}
      <rect x="2" y="2" width="96" height="32" rx="4" fill="rgba(20,24,32,0.18)"/>
      <circle cx="10" cy="9"  r="2.4" fill="#cfd8e6" stroke="#2a3040" stroke-width="1"/>
      <circle cx="90" cy="9"  r="2.4" fill="#cfd8e6" stroke="#2a3040" stroke-width="1"/>
      <circle cx="10" cy="27" r="2.4" fill="#cfd8e6" stroke="#2a3040" stroke-width="1"/>
      <circle cx="90" cy="27" r="2.4" fill="#cfd8e6" stroke="#2a3040" stroke-width="1"/>
      <line x1="22" y1="18" x2="78" y2="18" stroke="rgba(8,8,12,0.45)" stroke-width="1.5"/>
      <text x="50" y="23" font-family="ui-monospace, monospace" font-size="11" font-weight="bold"
            fill="rgba(220,228,240,0.55)" text-anchor="middle">M</text>
    </svg>`,

    'brk.brick_bomb': `<svg viewBox="0 0 100 36">${chrome}
      <circle cx="50" cy="20" r="11" fill="#1a0a0a" stroke="#ffd86b" stroke-width="2"/>
      <path d="M50 9 L50 4 M55 6 L60 2" stroke="#ffd86b" stroke-width="2" stroke-linecap="round"/>
      <circle cx="60" cy="2"  r="1.8" fill="#ffd86b"/>
      <circle cx="46" cy="18" r="1.8" fill="#fff8d4"/>
      <path d="M44 24 Q 50 28 56 24" fill="none" stroke="#fff8d4" stroke-width="1.5" stroke-linecap="round"/>
      <circle cx="46" cy="24" r="0.9" fill="#1a0a0a"/>
      <circle cx="54" cy="24" r="0.9" fill="#1a0a0a"/>
    </svg>`,

    'brk.brick_mirror': `<svg viewBox="0 0 100 36">${chrome}
      <path d="M20 8 L8 18 L20 28" fill="none" stroke="rgba(255,255,255,0.92)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M30 8 L18 18 L30 28" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M80 8 L92 18 L80 28" fill="none" stroke="rgba(255,255,255,0.92)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M70 8 L82 18 L70 28" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      <line x1="50" y1="8" x2="50" y2="28" stroke="rgba(255,255,255,0.5)" stroke-width="1.5" stroke-dasharray="3 2"/>
    </svg>`,

    'brk.brick_lock': `<svg viewBox="0 0 100 36">${chrome}
      <path d="M44 16 Q 44 10 50 10 Q 56 10 56 16 L56 18 L44 18 Z" fill="none"
            stroke="#ffd86b" stroke-width="2"/>
      <rect x="40" y="17" width="20" height="14" rx="2" fill="#3a2014" stroke="#ffd86b" stroke-width="2"/>
      <circle cx="50" cy="23" r="2" fill="#ffd86b"/>
      <rect x="49" y="23" width="2" height="5" fill="#ffd86b"/>
      <text x="20" y="24" font-family="ui-monospace, monospace" font-size="10" font-weight="bold"
            fill="rgba(255,216,107,0.7)" text-anchor="middle">⚿</text>
      <text x="80" y="24" font-family="ui-monospace, monospace" font-size="10" font-weight="bold"
            fill="rgba(255,216,107,0.7)" text-anchor="middle">⚿</text>
    </svg>`,

    'brk.brick_key': `<svg viewBox="0 0 100 36">${chrome}
      <circle cx="36" cy="18" r="7"  fill="none" stroke="#ffd86b" stroke-width="2.4"/>
      <circle cx="36" cy="18" r="2.5" fill="#ffd86b"/>
      <rect x="42" y="16" width="32" height="4" fill="#ffd86b"/>
      <rect x="58" y="20" width="4"  height="6" fill="#ffd86b"/>
      <rect x="68" y="20" width="4"  height="4" fill="#ffd86b"/>
      <text x="50" y="33" font-family="ui-monospace, monospace" font-size="6" font-weight="bold"
            fill="rgba(255,255,255,0.7)" text-anchor="middle">KEY</text>
    </svg>`,

    /* ---------- Boss mega-brick (320x120) ---------- */
    'brk.brick_boss': `<svg viewBox="0 0 320 120">
      <defs>
        <radialGradient id="bossglow" cx="0.5" cy="0.5" r="0.6">
          <stop offset="0"   stop-color="#ff5eff" stop-opacity="0.75"/>
          <stop offset="0.6" stop-color="#7a3aff" stop-opacity="0.55"/>
          <stop offset="1"   stop-color="#1a0a2a" stop-opacity="0.0"/>
        </radialGradient>
        <linearGradient id="bossplate" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#3a1a5a"/>
          <stop offset="1" stop-color="#0a0414"/>
        </linearGradient>
      </defs>
      <ellipse cx="160" cy="60" rx="160" ry="60" fill="url(#bossglow)"/>
      <rect x="10" y="14" width="300" height="92" rx="14"
            fill="url(#bossplate)" stroke="#ff5eff" stroke-width="3"/>
      <rect x="14" y="18" width="292" height="22" rx="10" fill="rgba(255,94,255,0.22)"/>
      <rect x="14" y="92" width="292" height="12" rx="6"  fill="rgba(0,0,0,0.45)"/>
      <circle cx="40"  cy="60" r="6" fill="#ff5eff" stroke="#fff" stroke-width="1.5"/>
      <circle cx="280" cy="60" r="6" fill="#ff5eff" stroke="#fff" stroke-width="1.5"/>
      <path d="M120 50 Q 160 30 200 50 Q 240 70 200 90 Q 160 110 120 90 Q 80 70 120 50 Z"
            fill="#1a0a2a" stroke="#ff5eff" stroke-width="2.5"/>
      <circle cx="140" cy="62" r="6"  fill="#ff5eff"/>
      <circle cx="180" cy="62" r="6"  fill="#ff5eff"/>
      <circle cx="140" cy="62" r="2.5" fill="#1a0a2a"/>
      <circle cx="180" cy="62" r="2.5" fill="#1a0a2a"/>
      <path d="M138 78 L148 84 L158 78 L168 84 L178 78 L188 84"
            stroke="#ff5eff" stroke-width="2" fill="none"/>
      <text x="220" y="72" font-family="ui-monospace, monospace" font-size="22"
            font-weight="bold" fill="#ffd86b" text-anchor="middle">★</text>
      <text x="100" y="72" font-family="ui-monospace, monospace" font-size="22"
            font-weight="bold" fill="#ffd86b" text-anchor="middle">★</text>
    </svg>`,

    /* ---------- Power-up chips (60x60) ---------- */
    'brk.pu_multi': `<svg viewBox="0 0 60 60">
      <rect x="3" y="3" width="54" height="54" rx="10" fill="#1a3a2a" stroke="#4ade80" stroke-width="2"/>
      <circle cx="22" cy="32" r="9" fill="#ffd86b" stroke="#7a4a14" stroke-width="1.5"/>
      <circle cx="38" cy="22" r="9" fill="#7cd9ff" stroke="#1a3a5a" stroke-width="1.5"/>
      <circle cx="40" cy="40" r="9" fill="#ff5e7e" stroke="#5a0a14" stroke-width="1.5"/>
      <text x="30" y="56" font-family="ui-monospace, monospace" font-size="8"
            font-weight="bold" fill="#4ade80" text-anchor="middle">×3</text>
    </svg>`,

    'brk.pu_wide': `<svg viewBox="0 0 60 60">
      <rect x="3" y="3" width="54" height="54" rx="10" fill="#1a2a4a" stroke="#7cd9ff" stroke-width="2"/>
      <rect x="10" y="26" width="40" height="10" rx="3" fill="#cfe9ff" stroke="#1a3a5a" stroke-width="1.5"/>
      <path d="M8 31 L2 31 M2 31 L6 27 M2 31 L6 35"   stroke="#7cd9ff" stroke-width="2" fill="none" stroke-linecap="round"/>
      <path d="M52 31 L58 31 M58 31 L54 27 M58 31 L54 35" stroke="#7cd9ff" stroke-width="2" fill="none" stroke-linecap="round"/>
      <text x="30" y="56" font-family="ui-monospace, monospace" font-size="8"
            font-weight="bold" fill="#7cd9ff" text-anchor="middle">WIDE</text>
    </svg>`,

    'brk.pu_laser': `<svg viewBox="0 0 60 60">
      <rect x="3" y="3" width="54" height="54" rx="10" fill="#3a0a14" stroke="#ff5e7e" stroke-width="2"/>
      <path d="M30 8 L22 30 L30 30 L26 50 L40 24 L32 24 Z"
            fill="#ffd86b" stroke="#ff5e7e" stroke-width="1.5"/>
      <text x="30" y="58" font-family="ui-monospace, monospace" font-size="8"
            font-weight="bold" fill="#ff5e7e" text-anchor="middle">LASER</text>
    </svg>`,

    'brk.pu_slow': `<svg viewBox="0 0 60 60">
      <rect x="3" y="3" width="54" height="54" rx="10" fill="#2a1a3a" stroke="#a78bfa" stroke-width="2"/>
      <circle cx="30" cy="28" r="13" fill="#1a0a2a" stroke="#a78bfa" stroke-width="2"/>
      <line x1="30" y1="28" x2="30" y2="20" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
      <line x1="30" y1="28" x2="36" y2="32" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
      <circle cx="30" cy="28" r="1.5" fill="#fff"/>
      <text x="30" y="56" font-family="ui-monospace, monospace" font-size="8"
            font-weight="bold" fill="#a78bfa" text-anchor="middle">SLOW</text>
    </svg>`,

    'brk.pu_shield': `<svg viewBox="0 0 60 60">
      <rect x="3" y="3" width="54" height="54" rx="10" fill="#1a3a3a" stroke="#5eead4" stroke-width="2"/>
      <path d="M30 8 L46 14 L46 30 Q 46 42 30 50 Q 14 42 14 30 L14 14 Z"
            fill="#0a2a2a" stroke="#5eead4" stroke-width="2"/>
      <path d="M22 28 L28 34 L40 22" fill="none" stroke="#5eead4" stroke-width="2.5" stroke-linecap="round"/>
      <text x="30" y="56" font-family="ui-monospace, monospace" font-size="7"
            font-weight="bold" fill="#5eead4" text-anchor="middle">SHIELD</text>
    </svg>`,

    /* ---------- Paddle skins (240x28) ---------- */
    'brk.paddle_pastel': `<svg viewBox="0 0 240 28">
      <defs>
        <linearGradient id="pPastel" x1="0" x2="1">
          <stop offset="0" stop-color="#ffb6e1"/><stop offset="0.5" stop-color="#c8a8ff"/><stop offset="1" stop-color="#7cd9ff"/>
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="236" height="24" rx="12" fill="url(#pPastel)" stroke="#3a1a4a" stroke-width="2"/>
      <rect x="6" y="4" width="228" height="6" rx="3" fill="rgba(255,255,255,0.55)"/>
      <circle cx="30"  cy="14" r="2" fill="rgba(255,255,255,0.7)"/>
      <circle cx="120" cy="14" r="2" fill="rgba(255,255,255,0.7)"/>
      <circle cx="210" cy="14" r="2" fill="rgba(255,255,255,0.7)"/>
    </svg>`,

    'brk.paddle_steel': `<svg viewBox="0 0 240 28">
      <defs>
        <linearGradient id="pSteel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#cfd8e6"/><stop offset="0.5" stop-color="#7a8aa0"/><stop offset="1" stop-color="#3a4660"/>
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="236" height="24" rx="6" fill="url(#pSteel)" stroke="#0a0e16" stroke-width="2"/>
      <rect x="6" y="4" width="228" height="5" rx="2" fill="rgba(255,255,255,0.45)"/>
      <circle cx="14"  cy="14" r="2.5" fill="#cfd8e6" stroke="#0a0e16" stroke-width="1"/>
      <circle cx="226" cy="14" r="2.5" fill="#cfd8e6" stroke="#0a0e16" stroke-width="1"/>
      <line x1="30" y1="14" x2="210" y2="14" stroke="rgba(8,12,22,0.5)" stroke-width="1"/>
    </svg>`,

    'brk.paddle_frost': `<svg viewBox="0 0 240 28">
      <defs>
        <linearGradient id="pFrost" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#e7f5ff"/><stop offset="1" stop-color="#5fb8e0"/>
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="236" height="24" rx="10" fill="url(#pFrost)" stroke="#1a3a5a" stroke-width="2"/>
      <path d="M40 8 L48 14 L40 20 M120 8 L128 14 L120 20 M200 8 L208 14 L200 20"
            stroke="#fff" stroke-width="1.5" fill="none"/>
      <circle cx="20"  cy="14" r="1.6" fill="#fff"/>
      <circle cx="80"  cy="14" r="1.6" fill="#fff"/>
      <circle cx="160" cy="14" r="1.6" fill="#fff"/>
      <circle cx="220" cy="14" r="1.6" fill="#fff"/>
    </svg>`,

    'brk.paddle_ember': `<svg viewBox="0 0 240 28">
      <defs>
        <linearGradient id="pEmber" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#ffd86b"/><stop offset="0.6" stop-color="#ff8c3a"/><stop offset="1" stop-color="#7a1a08"/>
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="236" height="24" rx="8" fill="url(#pEmber)" stroke="#3a0a04" stroke-width="2"/>
      <path d="M14 22 Q 18 12 22 22 Q 26 12 30 22" fill="#fff8d4" opacity="0.7"/>
      <path d="M210 22 Q 214 12 218 22 Q 222 12 226 22" fill="#fff8d4" opacity="0.7"/>
      <rect x="6" y="4" width="228" height="4" rx="2" fill="rgba(255,255,255,0.4)"/>
    </svg>`,

    'brk.paddle_void': `<svg viewBox="0 0 240 28">
      <defs>
        <linearGradient id="pVoid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#3a1a5a"/><stop offset="1" stop-color="#040206"/>
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="236" height="24" rx="8" fill="url(#pVoid)" stroke="#ff5eff" stroke-width="2"/>
      <text x="40"  y="20" font-family="ui-monospace, monospace" font-size="14" fill="#ff5eff">★</text>
      <text x="120" y="20" font-family="ui-monospace, monospace" font-size="14" fill="#ff5eff">★</text>
      <text x="200" y="20" font-family="ui-monospace, monospace" font-size="14" fill="#ff5eff">★</text>
      <rect x="6" y="4" width="228" height="3" rx="1.5" fill="rgba(255,94,255,0.45)"/>
    </svg>`,

    /* ---------- World banners (200x80) ---------- */
    'brk.banner_pastel': `<svg viewBox="0 0 200 80">
      <rect x="4" y="4" width="192" height="72" rx="14" fill="#ffd6e8" stroke="#7c5dba" stroke-width="3"/>
      <path d="M100 22 C 86 8 64 22 100 60 C 136 22 114 8 100 22 Z" fill="#ff5e7e" stroke="#7a1a3a" stroke-width="2"/>
    </svg>`,

    'brk.banner_steel': `<svg viewBox="0 0 200 80">
      <rect x="4" y="4" width="192" height="72" rx="14" fill="#3a4660" stroke="#cfd8e6" stroke-width="3"/>
      <circle cx="100" cy="40" r="22" fill="#7a8aa0" stroke="#cfd8e6" stroke-width="2"/>
      <circle cx="100" cy="40" r="6"  fill="#0a0e16" stroke="#cfd8e6" stroke-width="2"/>
      <g stroke="#cfd8e6" stroke-width="3" stroke-linecap="round">
        <line x1="100" y1="14" x2="100" y2="22"/><line x1="100" y1="58" x2="100" y2="66"/>
        <line x1="74"  y1="40" x2="82"  y2="40"/><line x1="118" y1="40" x2="126" y2="40"/>
        <line x1="82"  y1="22" x2="88"  y2="28"/><line x1="112" y1="52" x2="118" y2="58"/>
        <line x1="118" y1="22" x2="112" y2="28"/><line x1="88"  y1="52" x2="82"  y2="58"/>
      </g>
    </svg>`,

    'brk.banner_frost': `<svg viewBox="0 0 200 80">
      <rect x="4" y="4" width="192" height="72" rx="14" fill="#a4dffa" stroke="#1a3a5a" stroke-width="3"/>
      <g stroke="#fff" stroke-width="3" stroke-linecap="round" fill="none">
        <line x1="100" y1="14" x2="100" y2="66"/>
        <line x1="78"  y1="26" x2="122" y2="54"/>
        <line x1="78"  y1="54" x2="122" y2="26"/>
        <path d="M94 18 L100 24 L106 18 M94 62 L100 56 L106 62"/>
        <path d="M82 30 L88 34 L84 40 M118 50 L112 46 L116 40"/>
      </g>
    </svg>`,

    'brk.banner_ember': `<svg viewBox="0 0 200 80">
      <rect x="4" y="4" width="192" height="72" rx="14" fill="#ff5e3a" stroke="#3a0a08" stroke-width="3"/>
      <path d="M100 14 Q 78 28 86 46 Q 88 60 100 66 Q 112 60 114 46 Q 122 28 100 14 Z"
            fill="#ffd86b" stroke="#7a1a08" stroke-width="2"/>
      <path d="M100 30 Q 90 42 96 54 Q 100 60 104 54 Q 110 42 100 30 Z" fill="#fff8d4"/>
    </svg>`,

    'brk.banner_void': `<svg viewBox="0 0 200 80">
      <rect x="4" y="4" width="192" height="72" rx="14" fill="#1a0a2a" stroke="#ff5eff" stroke-width="3"/>
      <g fill="#ff5eff">
        <text x="100" y="52" font-family="ui-monospace, monospace" font-size="38" font-weight="bold" text-anchor="middle">★</text>
      </g>
      <circle cx="40"  cy="22" r="2" fill="#fff"/>
      <circle cx="160" cy="22" r="2" fill="#fff"/>
      <circle cx="56"  cy="60" r="1.5" fill="#fff"/>
      <circle cx="144" cy="60" r="1.5" fill="#fff"/>
      <circle cx="100" cy="14" r="1.5" fill="#fff"/>
    </svg>`
  });
})();
