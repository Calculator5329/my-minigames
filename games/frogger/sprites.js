/* Frogger sprite atlas — top-down frog, vehicles, river fauna, hazards, hawk
   boss, and perk icons. SVG strings are vector source-of-truth; the engine
   rasterises them per requested size. Authored to read clearly at the small
   tile sizes the game uses (≤ 60px tall in most cases). */
(function () {
  const NDP = window.NDP;
  const Sprites = NDP.Engine.Sprites;

  const map = {
    // ---------- Frog ----------
    'frog.frog': `<svg viewBox="0 0 100 100">
      <ellipse cx="50" cy="56" rx="32" ry="30" fill="#4ade80" stroke="#0d3a14" stroke-width="3"/>
      <ellipse cx="22" cy="32" rx="9" ry="14" fill="#22c55e" stroke="#0d3a14" stroke-width="2"/>
      <ellipse cx="78" cy="32" rx="9" ry="14" fill="#22c55e" stroke="#0d3a14" stroke-width="2"/>
      <ellipse cx="18" cy="80" rx="11" ry="15" fill="#22c55e" stroke="#0d3a14" stroke-width="2"/>
      <ellipse cx="82" cy="80" rx="11" ry="15" fill="#22c55e" stroke="#0d3a14" stroke-width="2"/>
      <path d="M28 56 Q 50 42 72 56" fill="none" stroke="#16a34a" stroke-width="3" stroke-linecap="round"/>
      <path d="M30 68 Q 50 78 70 68" fill="none" stroke="#16a34a" stroke-width="3" stroke-linecap="round"/>
      <circle cx="38" cy="36" r="10" fill="#fff" stroke="#0d3a14" stroke-width="2"/>
      <circle cx="62" cy="36" r="10" fill="#fff" stroke="#0d3a14" stroke-width="2"/>
      <circle cx="38" cy="36" r="5" fill="#0a0a0a"/>
      <circle cx="62" cy="36" r="5" fill="#0a0a0a"/>
      <circle cx="40" cy="34" r="2" fill="#fff"/>
      <circle cx="64" cy="34" r="2" fill="#fff"/>
    </svg>`,

    // ---------- Cars (top-down, nose at right) ----------
    'frog.car_red': carSvg('#ff5e7e', '#7a1a2a'),
    'frog.car_yellow': carSvg('#ffd86b', '#7a4a14'),
    'frog.car_blue': carSvg('#7cd9ff', '#1a3a5a'),
    'frog.car_purple': carSvg('#a855f7', '#3a1a5a'),

    // ---------- Truck (Day 3+) ----------
    'frog.truck': `<svg viewBox="0 0 200 60">
      <rect x="6" y="8" width="124" height="44" fill="#7a4a25" stroke="#2a1208" stroke-width="2"/>
      <rect x="14" y="14" width="108" height="32" fill="#5a3018"/>
      <line x1="40" y1="14" x2="40" y2="46" stroke="#3a2014" stroke-width="2"/>
      <line x1="70" y1="14" x2="70" y2="46" stroke="#3a2014" stroke-width="2"/>
      <line x1="100" y1="14" x2="100" y2="46" stroke="#3a2014" stroke-width="2"/>
      <rect x="134" y="14" width="58" height="38" rx="6" fill="#c45a3a" stroke="#3a1a08" stroke-width="2"/>
      <rect x="172" y="20" width="18" height="22" rx="2" fill="#0a0a14"/>
      <rect x="138" y="22" width="6" height="4" fill="#ffd86b"/>
      <rect x="138" y="36" width="6" height="4" fill="#ffd86b"/>
      <circle cx="36" cy="6" r="5" fill="#1a1a1a"/>
      <circle cx="100" cy="6" r="5" fill="#1a1a1a"/>
      <circle cx="160" cy="6" r="5" fill="#1a1a1a"/>
      <circle cx="36" cy="54" r="5" fill="#1a1a1a"/>
      <circle cx="100" cy="54" r="5" fill="#1a1a1a"/>
      <circle cx="160" cy="54" r="5" fill="#1a1a1a"/>
    </svg>`,

    // ---------- Logs ----------
    'frog.log_short': logSvg(140),
    'frog.log_long': logSvg(220),

    // ---------- Turtle (already has dive cycle in renderer) ----------
    'frog.turtle': `<svg viewBox="0 0 90 40">
      <ellipse cx="10" cy="20" rx="8" ry="6" fill="#3a8a4a" stroke="#0d3a14" stroke-width="1.5"/>
      <circle cx="7" cy="18" r="1.4" fill="#000"/>
      <ellipse cx="45" cy="20" rx="32" ry="15" fill="#5fbd6e" stroke="#0d3a14" stroke-width="2"/>
      <ellipse cx="45" cy="20" rx="24" ry="9" fill="#3a8a4a"/>
      <path d="M30 14 L36 14 M52 14 L58 14 M30 26 L36 26 M52 26 L58 26" stroke="#0d3a14" stroke-width="1.5"/>
      <ellipse cx="38" cy="36" rx="4" ry="2" fill="#3a8a4a"/>
      <ellipse cx="52" cy="36" rx="4" ry="2" fill="#3a8a4a"/>
      <ellipse cx="80" cy="22" rx="4" ry="2" fill="#3a8a4a"/>
    </svg>`,

    // ---------- Snake (Day 2+) — slithering green ----------
    'frog.snake': `<svg viewBox="0 0 80 30">
      <path d="M76 15 Q 66 4 56 15 T 36 15 T 16 15 T 2 15"
            fill="none" stroke="#1a4a1a" stroke-width="10" stroke-linecap="round"/>
      <path d="M76 15 Q 66 4 56 15 T 36 15 T 16 15 T 2 15"
            fill="none" stroke="#3a8a4a" stroke-width="6" stroke-linecap="round"/>
      <path d="M76 15 Q 66 4 56 15 T 36 15 T 16 15 T 2 15"
            fill="none" stroke="#5fbd6e" stroke-width="2" stroke-dasharray="4 3"/>
      <ellipse cx="76" cy="15" rx="6" ry="5" fill="#3a8a4a" stroke="#0a2a0a" stroke-width="1.5"/>
      <circle cx="78" cy="13" r="1.4" fill="#ffd86b"/>
      <circle cx="78" cy="17" r="1.4" fill="#ffd86b"/>
      <path d="M82 15 L78 13 M82 15 L78 17" stroke="#ff3a3a" stroke-width="1.5" stroke-linecap="round"/>
    </svg>`,

    // ---------- Crocodile (Day 3+) ----------
    'frog.croc': `<svg viewBox="0 0 60 60">
      <ellipse cx="30" cy="44" rx="24" ry="14" fill="#3a5a24" stroke="#0d2a08" stroke-width="2"/>
      <path d="M10 18 L50 18 Q 56 12 50 6 L34 6 Q 30 4 26 6 L10 6 Q 4 12 10 18 Z"
            fill="#5a8a34" stroke="#0d2a08" stroke-width="2"/>
      <path d="M10 18 L14 22 L18 18 L22 22 L26 18 L30 22 L34 18 L38 22 L42 18 L46 22 L50 18"
            fill="#fff" stroke="#0d2a08" stroke-width="0.5"/>
      <ellipse cx="20" cy="8" rx="3" ry="2.5" fill="#ffd86b" stroke="#0d2a08" stroke-width="1"/>
      <ellipse cx="40" cy="8" rx="3" ry="2.5" fill="#ffd86b" stroke="#0d2a08" stroke-width="1"/>
      <circle cx="20" cy="8" r="1.2" fill="#000"/>
      <circle cx="40" cy="8" r="1.2" fill="#000"/>
      <path d="M14 36 L18 38 M28 38 L32 36 M42 38 L46 36" stroke="#1a3a14" stroke-width="1.5"/>
    </svg>`,

    // ---------- Lily pad ----------
    'frog.lily': `<svg viewBox="0 0 80 80">
      <path d="M40 8 L80 36 Q 78 70 40 76 Q 2 70 0 36 Z" fill="#1a4a2a" stroke="#0a2a14" stroke-width="2"/>
      <path d="M40 12 L74 38 Q 72 66 40 72 Q 8 66 6 38 Z" fill="#3a8a4a"/>
      <path d="M40 12 L40 40" stroke="#0a2a14" stroke-width="2"/>
      <ellipse cx="48" cy="32" rx="6" ry="4" fill="#5fbd6e"/>
      <ellipse cx="32" cy="44" rx="5" ry="3" fill="#5fbd6e"/>
      <circle cx="40" cy="38" r="5" fill="#ff9bd6"/>
      <circle cx="40" cy="38" r="2" fill="#ffd86b"/>
    </svg>`,

    // ---------- Lightning bolt (Day 4+) ----------
    'frog.lightning': `<svg viewBox="0 0 60 100">
      <path d="M36 4 L8 50 L24 52 L18 96 L52 40 L34 36 Z"
            fill="#ffd86b" stroke="#a85d10" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="M30 14 L16 48 L28 50" fill="none" stroke="#fff" stroke-width="1.8"/>
    </svg>`,

    // ---------- Highway Hawk boss ----------
    'frog.hawk': `<svg viewBox="0 0 200 120">
      <path d="M100 56 Q 60 18 8 30 Q 36 52 84 70 Z" fill="#3a2814" stroke="#0a0a04" stroke-width="2"/>
      <path d="M100 56 Q 140 18 192 30 Q 164 52 116 70 Z" fill="#3a2814" stroke="#0a0a04" stroke-width="2"/>
      <path d="M100 56 Q 70 24 22 22 Q 50 44 90 60 Z" fill="#5a3a1c"/>
      <path d="M100 56 Q 130 24 178 22 Q 150 44 110 60 Z" fill="#5a3a1c"/>
      <ellipse cx="100" cy="62" rx="20" ry="38" fill="#3a2814" stroke="#0a0a04" stroke-width="2"/>
      <ellipse cx="100" cy="62" rx="14" ry="32" fill="#5a3a1c"/>
      <circle cx="100" cy="34" r="16" fill="#5a3a1c" stroke="#0a0a04" stroke-width="2"/>
      <path d="M100 38 L92 56 L108 56 Z" fill="#0a0a04"/>
      <path d="M94 42 L100 54 L106 42 Z" fill="#ffd86b" stroke="#a85d10" stroke-width="1.5"/>
      <circle cx="93" cy="30" r="3.5" fill="#ff3a3a"/>
      <circle cx="107" cy="30" r="3.5" fill="#ff3a3a"/>
      <circle cx="93" cy="30" r="1.5" fill="#fff"/>
      <circle cx="107" cy="30" r="1.5" fill="#fff"/>
      <path d="M88 96 L84 116 L92 116 L92 100 Z" fill="#1a1208"/>
      <path d="M112 96 L108 100 L108 116 L116 116 Z" fill="#1a1208"/>
      <path d="M86 116 L80 116 M88 116 L88 120 M92 116 L92 120" stroke="#ffd86b" stroke-width="2"/>
      <path d="M114 116 L108 120 M112 116 L112 120" stroke="#ffd86b" stroke-width="2"/>
    </svg>`,

    // ---------- Perk icons ----------
    'frog.perk_hop': `<svg viewBox="0 0 60 60">
      <circle cx="30" cy="30" r="27" fill="#0d2a17" stroke="#4ade80" stroke-width="3"/>
      <path d="M14 46 Q 30 8 46 46" fill="none" stroke="#4ade80" stroke-width="3.5" stroke-linecap="round"/>
      <path d="M40 44 L50 36" stroke="#4ade80" stroke-width="3" stroke-linecap="round"/>
      <path d="M50 36 L42 32 M50 36 L46 44" stroke="#4ade80" stroke-width="3" stroke-linecap="round"/>
      <circle cx="14" cy="46" r="3" fill="#4ade80"/>
      <circle cx="46" cy="46" r="3" fill="#4ade80"/>
    </svg>`,
    'frog.perk_detector': `<svg viewBox="0 0 60 60">
      <circle cx="30" cy="30" r="27" fill="#2a1a0d" stroke="#ffd86b" stroke-width="3"/>
      <path d="M30 12 Q 26 12 26 18 L26 38 Q 26 42 30 42 Q 34 42 34 38 L34 18 Q 34 12 30 12 Z" fill="#ffd86b"/>
      <circle cx="30" cy="48" r="3.5" fill="#ffd86b"/>
    </svg>`,
    'frog.perk_spare': `<svg viewBox="0 0 60 60">
      <circle cx="30" cy="30" r="27" fill="#1a0d20" stroke="#ff9bd6" stroke-width="3"/>
      <path d="M30 50 L14 34 Q 8 26 14 20 Q 22 12 30 22 Q 38 12 46 20 Q 52 26 46 34 Z"
            fill="#ff5e7e" stroke="#7a1a4a" stroke-width="2"/>
      <text x="30" y="36" font-family="ui-monospace, monospace" font-size="14" font-weight="bold"
            fill="#fff" text-anchor="middle">+1</text>
    </svg>`,
    'frog.perk_speed': `<svg viewBox="0 0 60 60">
      <circle cx="30" cy="30" r="27" fill="#0d1a2a" stroke="#7cd9ff" stroke-width="3"/>
      <path d="M36 8 L14 34 L26 34 L22 52 L46 24 L32 24 Z" fill="#7cd9ff" stroke="#1a3a5a" stroke-width="2"/>
    </svg>`
  };

  // Helper SVG builders so colour variants stay tiny.
  function carSvg(body, edge) {
    return `<svg viewBox="0 0 100 60">
      <rect x="6" y="10" width="88" height="40" rx="8" fill="${body}" stroke="${edge}" stroke-width="2"/>
      <rect x="62" y="14" width="22" height="32" rx="3" fill="#0a0a14"/>
      <rect x="20" y="14" width="20" height="32" rx="3" fill="#1a1a2a"/>
      <line x1="50" y1="14" x2="50" y2="46" stroke="${edge}" stroke-width="1.5"/>
      <circle cx="22" cy="50" r="6" fill="#1a1a1a"/>
      <circle cx="78" cy="50" r="6" fill="#1a1a1a"/>
      <circle cx="22" cy="10" r="6" fill="#1a1a1a"/>
      <circle cx="78" cy="10" r="6" fill="#1a1a1a"/>
      <rect x="92" y="18" width="4" height="8" fill="#fff8d4"/>
      <rect x="92" y="34" width="4" height="8" fill="#fff8d4"/>
      <rect x="6" y="22" width="3" height="6" fill="#ff3a3a"/>
      <rect x="6" y="32" width="3" height="6" fill="#ff3a3a"/>
    </svg>`;
  }
  function logSvg(viewW) {
    return `<svg viewBox="0 0 ${viewW} 40">
      <rect x="4" y="6" width="${viewW - 8}" height="28" rx="14" fill="#7a4a25" stroke="#2a1208" stroke-width="2"/>
      <ellipse cx="6" cy="20" rx="6" ry="12" fill="#5a3018" stroke="#2a1208" stroke-width="1.5"/>
      <ellipse cx="${viewW - 6}" cy="20" rx="6" ry="12" fill="#a87a4a" stroke="#2a1208" stroke-width="1.5"/>
      <circle cx="${viewW - 6}" cy="20" r="3" fill="#5a3018"/>
      ${barkSplits(viewW)}
    </svg>`;
  }
  function barkSplits(viewW) {
    let s = '';
    for (let x = 30; x < viewW - 20; x += 36) {
      s += `<line x1="${x}" y1="10" x2="${x}" y2="30" stroke="#5a3018" stroke-width="1.2"/>`;
    }
    return s;
  }

  Sprites.registerMany(map);
  NDP._froggerSpritesRegistered = true;
})();
