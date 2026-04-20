/* Asteroids — inline SVG sprite atlas.
   Vector ship variants (basic / upgraded × idle / thrusting), alien drones, two
   bosses, missile, alien bullet, and the four upgrade-chip icons used by the
   between-wave shop. All sprites are authored centered in their viewBox so the
   engine's anchor=0.5 default produces correct positioning. */
(function () {
  const NDP = window.NDP;
  const Sprites = NDP.Engine && NDP.Engine.Sprites;
  if (!Sprites) { console.warn('[asteroids/sprites] Sprites engine missing'); return; }

  // Shared defs — soft cyan glow + alien red-pink halo.
  const defs = `<defs>
    <radialGradient id="aHalo" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#7cd9ff" stop-opacity="0.45"/>
      <stop offset="60%" stop-color="#1d4a6a" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="aHaloRed" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ff6e9c" stop-opacity="0.55"/>
      <stop offset="55%" stop-color="#7a1640" stop-opacity="0.20"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="aDome" cx="50%" cy="35%" r="55%">
      <stop offset="0%" stop-color="#cdf6ff" stop-opacity="0.95"/>
      <stop offset="60%" stop-color="#5cb6da" stop-opacity="0.6"/>
      <stop offset="100%" stop-color="#1a3a52" stop-opacity="0.5"/>
    </radialGradient>
    <linearGradient id="aHull" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#cfe9ff"/>
      <stop offset="100%" stop-color="#5a7a9a"/>
    </linearGradient>
    <linearGradient id="aHullUp" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffe7a8"/>
      <stop offset="100%" stop-color="#a06840"/>
    </linearGradient>
    <filter id="aGlow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="2" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>`;

  // Ship body shared markup. Nose at +x, tail at -x; viewBox centered on 40,40.
  function ship(hullFill, accent, withFlame, upgradeBits) {
    const flame = withFlame ? `
      <g filter="url(#aGlow)">
        <polygon points="22,40 -2,32 6,40 -2,48" fill="#ffae44" opacity="0.95"/>
        <polygon points="22,40 6,36 12,40 6,44" fill="#fff5cc"/>
      </g>` : '';
    const extras = upgradeBits || '';
    return `<svg viewBox="0 0 80 80">${defs}
      <circle cx="40" cy="40" r="36" fill="url(#aHalo)"/>
      ${flame}
      <g filter="url(#aGlow)">
        <polygon points="74,40 24,26 32,40 24,54" fill="${hullFill}" stroke="${accent}" stroke-width="2" stroke-linejoin="round"/>
        <polygon points="62,40 36,33 40,40 36,47" fill="${accent}" opacity="0.55"/>
        <circle cx="50" cy="40" r="3.5" fill="#fff"/>
        <circle cx="50" cy="40" r="1.5" fill="${accent}"/>
        ${extras}
      </g>
    </svg>`;
  }

  const upgradedBits = `
    <polygon points="34,22 38,28 30,28" fill="#ffd86b"/>
    <polygon points="34,58 38,52 30,52" fill="#ffd86b"/>
    <line x1="62" y1="40" x2="70" y2="40" stroke="#ffd86b" stroke-width="2"/>
    <circle cx="70" cy="40" r="2" fill="#ffd86b"/>`;

  Sprites.registerMany({
    // ---------------- Ship variants ----------------
    'aster.ship_basic':         ship('url(#aHull)',   '#7cd9ff', false, ''),
    'aster.ship_basic_flame':   ship('url(#aHull)',   '#7cd9ff', true,  ''),
    'aster.ship_upgraded':      ship('url(#aHullUp)', '#ffd86b', false, upgradedBits),
    'aster.ship_upgraded_flame':ship('url(#aHullUp)', '#ffd86b', true,  upgradedBits),

    // ---------------- Alien drone (small hunter) ----------------
    'aster.drone_hunter': `<svg viewBox="0 0 80 80">${defs}
      <circle cx="40" cy="40" r="34" fill="url(#aHaloRed)"/>
      <g filter="url(#aGlow)">
        <polygon points="40,12 60,40 40,68 20,40" fill="#3a0a23" stroke="#ff5e7e" stroke-width="2"/>
        <polygon points="40,22 50,40 40,58 30,40" fill="#7a1640"/>
        <circle cx="40" cy="40" r="6" fill="#ff5e7e"/>
        <circle cx="40" cy="40" r="2.5" fill="#fff"/>
        <line x1="20" y1="40" x2="8"  y2="40" stroke="#ff5e7e" stroke-width="2"/>
        <line x1="60" y1="40" x2="72" y2="40" stroke="#ff5e7e" stroke-width="2"/>
        <circle cx="8"  cy="40" r="2" fill="#ff5e7e"/>
        <circle cx="72" cy="40" r="2" fill="#ff5e7e"/>
      </g>
    </svg>`,

    // ---------------- Boss: Swarm Lord (200x200) ----------------
    'aster.boss_swarm_lord': `<svg viewBox="0 0 200 200">${defs}
      <circle cx="100" cy="100" r="96" fill="url(#aHaloRed)"/>
      <g filter="url(#aGlow)">
        <!-- outer ring of pylons -->
        <circle cx="100" cy="100" r="78" fill="none" stroke="#ff5e7e" stroke-width="1.5" stroke-dasharray="4 6"/>
        <!-- main angular hull -->
        <polygon points="100,18 162,72 150,150 100,182 50,150 38,72"
                 fill="#2a081a" stroke="#ff5e7e" stroke-width="3" stroke-linejoin="round"/>
        <polygon points="100,40 140,78 132,138 100,160 68,138 60,78"
                 fill="#5a1438" stroke="#ff8fb0" stroke-width="2"/>
        <!-- central eye -->
        <ellipse cx="100" cy="104" rx="32" ry="22" fill="#0a0408"/>
        <ellipse cx="100" cy="104" rx="22" ry="14" fill="#ff5e7e"/>
        <ellipse cx="100" cy="104" rx="10" ry="6"  fill="#fff"/>
        <!-- mandibles -->
        <path d="M50 150 L30 174 L60 162 Z"  fill="#7a1640" stroke="#ff5e7e" stroke-width="2"/>
        <path d="M150 150 L170 174 L140 162 Z" fill="#7a1640" stroke="#ff5e7e" stroke-width="2"/>
        <!-- antennae -->
        <line x1="80"  y1="22" x2="68"  y2="0" stroke="#ff5e7e" stroke-width="2"/>
        <line x1="120" y1="22" x2="132" y2="0" stroke="#ff5e7e" stroke-width="2"/>
        <circle cx="68"  cy="0" r="3" fill="#ffd86b"/>
        <circle cx="132" cy="0" r="3" fill="#ffd86b"/>
        <!-- crown spikes -->
        <polygon points="100,18 96,2 104,2" fill="#ffd86b"/>
      </g>
    </svg>`,

    // ---------------- Boss: Hive Queen (240x240) ----------------
    'aster.boss_hive_queen': `<svg viewBox="0 0 240 240">${defs}
      <circle cx="120" cy="120" r="112" fill="url(#aHaloRed)"/>
      <g filter="url(#aGlow)">
        <!-- saucer body -->
        <ellipse cx="120" cy="148" rx="108" ry="32" fill="#1a0826" stroke="#ff8fb0" stroke-width="3"/>
        <ellipse cx="120" cy="146" rx="92"  ry="22" fill="#3a0e44"/>
        <!-- side cannons -->
        <rect x="6"   y="138" width="32" height="20" rx="6" fill="#5a1640" stroke="#ff5e7e" stroke-width="2"/>
        <rect x="202" y="138" width="32" height="20" rx="6" fill="#5a1640" stroke="#ff5e7e" stroke-width="2"/>
        <circle cx="14"  cy="148" r="4" fill="#ffd86b"/>
        <circle cx="226" cy="148" r="4" fill="#ffd86b"/>
        <!-- under-glow lights -->
        <circle cx="60"  cy="170" r="5" fill="#ffd86b"/>
        <circle cx="90"  cy="178" r="5" fill="#7cd9ff"/>
        <circle cx="120" cy="180" r="5" fill="#ff5e7e"/>
        <circle cx="150" cy="178" r="5" fill="#7cd9ff"/>
        <circle cx="180" cy="170" r="5" fill="#ffd86b"/>
        <!-- translucent dome with queen silhouette -->
        <ellipse cx="120" cy="98" rx="72" ry="62" fill="url(#aDome)" opacity="0.85"/>
        <ellipse cx="120" cy="98" rx="72" ry="62" fill="none" stroke="#cdf6ff" stroke-width="2"/>
        <g opacity="0.85">
          <ellipse cx="120" cy="110" rx="36" ry="42" fill="#1a0a2e"/>
          <ellipse cx="120" cy="86"  rx="22" ry="22" fill="#2a103e"/>
          <ellipse cx="110" cy="84"  rx="4"  ry="6"  fill="#ff5e7e"/>
          <ellipse cx="130" cy="84"  rx="4"  ry="6"  fill="#ff5e7e"/>
          <path d="M104 100 Q 120 112 136 100" fill="none" stroke="#ff8fb0" stroke-width="2"/>
        </g>
        <!-- crown spikes through dome -->
        <polygon points="100,40 96,16 104,28" fill="#ffd86b"/>
        <polygon points="120,30 116,4  124,18" fill="#ffd86b"/>
        <polygon points="140,40 136,16 144,28" fill="#ffd86b"/>
      </g>
    </svg>`,

    // ---------------- Missile (60x20) ----------------
    'aster.missile': `<svg viewBox="0 0 60 20">${defs}
      <g filter="url(#aGlow)">
        <polygon points="58,10 42,4 8,4 2,10 8,16 42,16" fill="#cfe9ff" stroke="#7cd9ff" stroke-width="1.5"/>
        <polygon points="58,10 50,5 50,15" fill="#ff8c3a"/>
        <rect x="14" y="6" width="20" height="8" fill="#7a3030"/>
        <polygon points="8,4 0,0 4,8" fill="#5a7a9a"/>
        <polygon points="8,16 0,20 4,12" fill="#5a7a9a"/>
        <polygon points="2,10 -8,6 -8,14" fill="#ffae44" opacity="0.95"/>
        <polygon points="-2,10 -10,8 -10,12" fill="#fff5cc"/>
      </g>
    </svg>`,

    // ---------------- Alien bullet (30x30) ----------------
    'aster.alien_bullet': `<svg viewBox="0 0 30 30">${defs}
      <circle cx="15" cy="15" r="14" fill="url(#aHaloRed)"/>
      <g filter="url(#aGlow)">
        <ellipse cx="15" cy="15" rx="9" ry="4" fill="#ff5e7e"/>
        <ellipse cx="15" cy="15" rx="4" ry="2" fill="#fff"/>
      </g>
    </svg>`,

    // ---------------- Upgrade chips (80x80 each) ----------------
    'aster.upgrade_rapidfire': `<svg viewBox="0 0 80 80">${defs}
      <rect x="4" y="4" width="72" height="72" rx="12" fill="#0a1428" stroke="#7cd9ff" stroke-width="2"/>
      <g filter="url(#aGlow)">
        <polygon points="46,10 22,44 36,44 30,70 56,32 42,32 50,10" fill="#ffd86b" stroke="#fff" stroke-width="2"/>
      </g>
      <g fill="#ffd86b">
        <circle cx="14" cy="14" r="2"/>
        <circle cx="66" cy="66" r="2"/>
      </g>
    </svg>`,

    'aster.upgrade_twin': `<svg viewBox="0 0 80 80">${defs}
      <rect x="4" y="4" width="72" height="72" rx="12" fill="#0a1428" stroke="#7cd9ff" stroke-width="2"/>
      <g filter="url(#aGlow)">
        <polygon points="68,28 18,16 28,28 18,40" fill="#7cd9ff" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>
        <polygon points="68,52 18,40 28,52 18,64" fill="#7cd9ff" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>
        <circle cx="68" cy="28" r="3" fill="#ffd86b"/>
        <circle cx="68" cy="52" r="3" fill="#ffd86b"/>
      </g>
    </svg>`,

    'aster.upgrade_shield': `<svg viewBox="0 0 80 80">${defs}
      <rect x="4" y="4" width="72" height="72" rx="12" fill="#0a1428" stroke="#7cd9ff" stroke-width="2"/>
      <g filter="url(#aGlow)">
        <polygon points="40,8 68,22 64,46 40,72 16,46 12,22"
                 fill="#103a4a" stroke="#7ae0ff" stroke-width="3" stroke-linejoin="round"/>
        <polygon points="40,18 60,28 58,44 40,62 22,44 20,28" fill="#1d5a72" stroke="#cdf6ff" stroke-width="1.5"/>
        <path d="M30 40 L38 48 L52 30" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      </g>
    </svg>`,

    'aster.upgrade_missile': `<svg viewBox="0 0 80 80">${defs}
      <rect x="4" y="4" width="72" height="72" rx="12" fill="#0a1428" stroke="#7cd9ff" stroke-width="2"/>
      <g filter="url(#aGlow)" transform="rotate(-30 40 40)">
        <polygon points="68,40 50,32 18,32 12,40 18,48 50,48" fill="#cfe9ff" stroke="#7cd9ff" stroke-width="1.5"/>
        <polygon points="68,40 58,34 58,46" fill="#ff8c3a"/>
        <rect x="24" y="35" width="20" height="10" fill="#7a3030"/>
        <polygon points="18,32 8,28 12,40" fill="#5a7a9a"/>
        <polygon points="18,48 8,52 12,40" fill="#5a7a9a"/>
        <polygon points="12,40 0,36 0,44" fill="#ffae44" opacity="0.95"/>
      </g>
    </svg>`,

    'aster.upgrade_overclock': `<svg viewBox="0 0 80 80">${defs}
      <rect x="4" y="4" width="72" height="72" rx="12" fill="#0a1428" stroke="#7cd9ff" stroke-width="2"/>
      <g filter="url(#aGlow)">
        <circle cx="40" cy="40" r="22" fill="none" stroke="#ffd86b" stroke-width="3"/>
        <line x1="40" y1="40" x2="40" y2="22" stroke="#ff8c3a" stroke-width="3" stroke-linecap="round"/>
        <line x1="40" y1="40" x2="56" y2="40" stroke="#ff8c3a" stroke-width="3" stroke-linecap="round"/>
        <circle cx="40" cy="40" r="3" fill="#fff"/>
        <path d="M16 16 L26 20 M64 16 L54 20" stroke="#ffd86b" stroke-width="2" stroke-linecap="round"/>
      </g>
    </svg>`,

    'aster.upgrade_salvage': `<svg viewBox="0 0 80 80">${defs}
      <rect x="4" y="4" width="72" height="72" rx="12" fill="#0a1428" stroke="#7cd9ff" stroke-width="2"/>
      <g filter="url(#aGlow)">
        <circle cx="40" cy="40" r="18" fill="#ffd86b" stroke="#fff" stroke-width="2"/>
        <text x="40" y="48" text-anchor="middle" font-family="monospace" font-size="22" font-weight="bold" fill="#0a1428">$</text>
        <circle cx="22" cy="22" r="3" fill="#cfe9ff"/>
        <circle cx="58" cy="22" r="3" fill="#cfe9ff"/>
        <circle cx="22" cy="58" r="3" fill="#cfe9ff"/>
        <circle cx="58" cy="58" r="3" fill="#cfe9ff"/>
      </g>
    </svg>`,

    'aster.upgrade_drone': `<svg viewBox="0 0 80 80">${defs}
      <rect x="4" y="4" width="72" height="72" rx="12" fill="#0a1428" stroke="#7cd9ff" stroke-width="2"/>
      <g filter="url(#aGlow)">
        <circle cx="40" cy="40" r="24" fill="none" stroke="#7ae0ff" stroke-width="1.5" stroke-dasharray="4 3"/>
        <polygon points="40,32 44,44 40,40 36,44" fill="#7ae0ff" stroke="#fff" stroke-width="1.5"/>
        <circle cx="40" cy="40" r="4" fill="#ffd86b"/>
        <polygon points="62,18 66,22 62,26 58,22" fill="#7ae0ff"/>
      </g>
    </svg>`,

    'aster.upgrade_emp': `<svg viewBox="0 0 80 80">${defs}
      <rect x="4" y="4" width="72" height="72" rx="12" fill="#0a1428" stroke="#7cd9ff" stroke-width="2"/>
      <g filter="url(#aGlow)">
        <circle cx="40" cy="40" r="8" fill="#7ae0ff" stroke="#fff" stroke-width="2"/>
        <circle cx="40" cy="40" r="18" fill="none" stroke="#7ae0ff" stroke-width="2" stroke-dasharray="3 4"/>
        <circle cx="40" cy="40" r="28" fill="none" stroke="#7ae0ff" stroke-width="1.5" opacity="0.6"/>
        <path d="M40 10 L40 22 M40 58 L40 70 M10 40 L22 40 M58 40 L70 40" stroke="#ffd86b" stroke-width="2" stroke-linecap="round"/>
      </g>
    </svg>`
  });
})();
