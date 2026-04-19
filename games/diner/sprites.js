/* Diner sprite atlas — ingredients, customers, kitchen UI, food-critic boss.
   Authored at 100x100 / 120x120 viewBoxes to rasterise crisply at the small
   sizes this game uses (slot tiles, plate stack, customer order bubbles). */
(function () {
  const NDP = window.NDP;
  const Sprites = NDP.Engine.Sprites;

  const sheen = `<defs>
    <linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.45"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
  </defs>`;

  Sprites.registerMany({
    // ---------- Ingredients ----------
    'diner.bun_b': `<svg viewBox="0 0 120 60">${sheen}
      <path d="M5 50 Q 5 12 60 12 Q 115 12 115 50 Z" fill="#d4a36a" stroke="#7a4a14" stroke-width="2"/>
      <path d="M5 50 L115 50 L115 56 L5 56 Z" fill="#a47c4a" stroke="#7a4a14" stroke-width="2"/>
    </svg>`,
    'diner.bun_t': `<svg viewBox="0 0 120 60">${sheen}
      <path d="M5 50 Q 5 6 60 6 Q 115 6 115 50 Z" fill="#d4a36a" stroke="#7a4a14" stroke-width="2"/>
      <path d="M5 50 Q 5 6 60 6 Q 115 6 115 50 Z" fill="url(#sheen)"/>
      <ellipse cx="40" cy="22" rx="3" ry="2" fill="#fff8d4"/>
      <ellipse cx="60" cy="16" rx="3" ry="2" fill="#fff8d4"/>
      <ellipse cx="80" cy="22" rx="3" ry="2" fill="#fff8d4"/>
      <ellipse cx="50" cy="32" rx="3" ry="2" fill="#fff8d4"/>
      <ellipse cx="70" cy="32" rx="3" ry="2" fill="#fff8d4"/>
    </svg>`,
    'diner.patty': `<svg viewBox="0 0 120 28">
      <rect x="3" y="5" width="114" height="20" rx="6" fill="#6b3a1e" stroke="#2a1208" stroke-width="2"/>
      <ellipse cx="35" cy="11" rx="6" ry="2" fill="#3a1f0c"/>
      <ellipse cx="78" cy="14" rx="5" ry="2" fill="#3a1f0c"/>
    </svg>`,
    'diner.cheese': `<svg viewBox="0 0 120 18">
      <path d="M3 3 L117 3 L113 15 L7 15 Z" fill="#ffd86b" stroke="#a8800a" stroke-width="1.5"/>
      <line x1="20" y1="9" x2="100" y2="9" stroke="#fff3a8" stroke-width="1"/>
    </svg>`,
    'diner.lettuce': `<svg viewBox="0 0 120 22">
      <path d="M3 16 Q 14 6 24 16 Q 36 6 48 16 Q 60 6 72 16 Q 84 6 96 16 Q 108 6 117 16 L117 20 L3 20 Z"
        fill="#7ac74f" stroke="#3a6a1a" stroke-width="1.5"/>
    </svg>`,
    'diner.tomato': `<svg viewBox="0 0 120 18">
      <ellipse cx="60" cy="9" rx="56" ry="7" fill="#c4402d" stroke="#7a1a0a" stroke-width="1.5"/>
      <ellipse cx="40" cy="9" rx="6" ry="3" fill="#fff" opacity="0.4"/>
      <ellipse cx="78" cy="9" rx="5" ry="3" fill="#fff" opacity="0.3"/>
    </svg>`,
    'diner.bacon': `<svg viewBox="0 0 120 22">
      <path d="M5 8 Q 30 2 55 10 Q 80 18 115 8 L115 18 Q 80 26 55 18 Q 30 12 5 18 Z"
        fill="#c45a3a" stroke="#5a1f0e" stroke-width="1.5"/>
      <path d="M15 11 Q 40 5 65 13" fill="none" stroke="#f8d7c4" stroke-width="2"/>
      <path d="M70 13 Q 90 19 110 13" fill="none" stroke="#f8d7c4" stroke-width="2"/>
    </svg>`,
    'diner.pickle': `<svg viewBox="0 0 120 14">
      <ellipse cx="60" cy="7" rx="56" ry="5" fill="#5a8c3a" stroke="#2a4a1a" stroke-width="1.2"/>
      <circle cx="30" cy="7" r="1.2" fill="#3a6a1a"/>
      <circle cx="50" cy="7" r="1.2" fill="#3a6a1a"/>
      <circle cx="70" cy="7" r="1.2" fill="#3a6a1a"/>
      <circle cx="90" cy="7" r="1.2" fill="#3a6a1a"/>
    </svg>`,
    'diner.sauce': `<svg viewBox="0 0 120 14">
      <path d="M5 6 Q 25 12 45 5 Q 65 12 85 5 Q 100 12 115 6 L115 11 Q 100 17 85 10 Q 65 17 45 10 Q 25 17 5 11 Z"
        fill="#c91a1a" stroke="#5a0a0a" stroke-width="1.2"/>
    </svg>`,
    'diner.mushroom': `<svg viewBox="0 0 120 22">
      <path d="M5 14 Q 5 4 30 4 Q 60 4 90 4 Q 115 4 115 14 Z" fill="#8a6a4a" stroke="#3a2014" stroke-width="1.5"/>
      <ellipse cx="35" cy="9" rx="3" ry="1.5" fill="#fff" opacity="0.3"/>
      <ellipse cx="80" cy="9" rx="3" ry="1.5" fill="#fff" opacity="0.3"/>
      <rect x="5" y="14" width="110" height="5" fill="#5a3a24"/>
    </svg>`,
    'diner.trash': `<svg viewBox="0 0 60 70">
      <path d="M10 18 L50 18 L46 65 L14 65 Z" fill="#3a1620" stroke="#f87171" stroke-width="2"/>
      <rect x="6" y="12" width="48" height="6" rx="2" fill="#f87171"/>
      <line x1="22" y1="28" x2="22" y2="55" stroke="#f87171" stroke-width="2"/>
      <line x1="30" y1="28" x2="30" y2="55" stroke="#f87171" stroke-width="2"/>
      <line x1="38" y1="28" x2="38" y2="55" stroke="#f87171" stroke-width="2"/>
    </svg>`,

    // ---------- Customers ----------
    'diner.cust_normal': `<svg viewBox="0 0 80 100">
      <ellipse cx="40" cy="25" rx="20" ry="22" fill="#ffb15e" stroke="#7a4a14" stroke-width="2"/>
      <rect x="20" y="42" width="40" height="50" rx="6" fill="#4ec0ff" stroke="#1a3a5a" stroke-width="2"/>
      <circle cx="33" cy="22" r="2.5" fill="#000"/>
      <circle cx="47" cy="22" r="2.5" fill="#000"/>
      <path d="M32 32 Q 40 36 48 32" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round"/>
    </svg>`,
    'diner.cust_busy': `<svg viewBox="0 0 80 100">
      <ellipse cx="40" cy="25" rx="20" ry="22" fill="#f5d0a0" stroke="#7a4a14" stroke-width="2"/>
      <rect x="20" y="42" width="40" height="50" rx="6" fill="#3a3a3a" stroke="#0a0a0a" stroke-width="2"/>
      <rect x="32" y="46" width="16" height="12" fill="#fff"/>
      <circle cx="33" cy="22" r="2.5" fill="#000"/>
      <circle cx="47" cy="22" r="2.5" fill="#000"/>
      <path d="M30 33 L50 33" stroke="#000" stroke-width="2" stroke-linecap="round"/>
    </svg>`,
    'diner.cust_kid': `<svg viewBox="0 0 80 100">
      <ellipse cx="40" cy="28" rx="18" ry="20" fill="#ffd0a8" stroke="#7a4a14" stroke-width="2"/>
      <rect x="22" y="44" width="36" height="46" rx="6" fill="#ff9bd6" stroke="#7a1a4a" stroke-width="2"/>
      <circle cx="33" cy="26" r="3" fill="#000"/>
      <circle cx="47" cy="26" r="3" fill="#000"/>
      <path d="M30 36 Q 40 44 50 36" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round"/>
      <path d="M22 12 Q 40 0 58 12" fill="#7a3a14" stroke="#3a1a08" stroke-width="2"/>
    </svg>`,
    'diner.cust_critic': `<svg viewBox="0 0 100 120">
      <ellipse cx="50" cy="32" rx="28" ry="30" fill="#e8d8b0" stroke="#3a2a14" stroke-width="2"/>
      <rect x="20" y="56" width="60" height="60" rx="8" fill="#1a1024" stroke="#f5d061" stroke-width="2"/>
      <path d="M22 18 Q 50 0 78 18" fill="#3a2014" stroke="#1a0a04" stroke-width="2"/>
      <rect x="32" y="22" width="36" height="14" rx="3" fill="#1a1024"/>
      <circle cx="42" cy="29" r="4" fill="#f5d061"/>
      <circle cx="58" cy="29" r="4" fill="#f5d061"/>
      <line x1="36" y1="29" x2="22" y2="26" stroke="#1a1024" stroke-width="2"/>
      <line x1="64" y1="29" x2="78" y2="26" stroke="#1a1024" stroke-width="2"/>
      <path d="M40 44 Q 50 50 60 44" fill="none" stroke="#3a2014" stroke-width="2" stroke-linecap="round"/>
      <rect x="42" y="68" width="16" height="22" fill="#f5d061"/>
      <text x="50" y="84" font-family="serif" font-size="11" font-weight="bold" fill="#1a1024" text-anchor="middle">★</text>
    </svg>`,

    // ---------- Stations ----------
    'diner.station_grill': `<svg viewBox="0 0 100 80">
      <rect x="6" y="20" width="88" height="50" rx="6" fill="#2a2a2a" stroke="#7a7a7a" stroke-width="2"/>
      <line x1="14" y1="34" x2="86" y2="34" stroke="#ff8c3a" stroke-width="2"/>
      <line x1="14" y1="44" x2="86" y2="44" stroke="#ff8c3a" stroke-width="2"/>
      <line x1="14" y1="54" x2="86" y2="54" stroke="#ff8c3a" stroke-width="2"/>
      <ellipse cx="50" cy="14" rx="20" ry="6" fill="#ff8c3a" opacity="0.5"/>
      <ellipse cx="50" cy="8" rx="14" ry="4" fill="#ffd86b" opacity="0.4"/>
    </svg>`,
    'diner.station_prep': `<svg viewBox="0 0 100 80">
      <rect x="6" y="14" width="88" height="56" rx="6" fill="#d4a36a" stroke="#7a4a14" stroke-width="2"/>
      <rect x="14" y="22" width="72" height="40" fill="#e8d4ae"/>
      <line x1="50" y1="22" x2="50" y2="62" stroke="#a47c4a" stroke-width="2"/>
      <path d="M68 30 L86 12 L92 18 L74 36 Z" fill="#cccccc" stroke="#666" stroke-width="2"/>
    </svg>`
  });
})();
