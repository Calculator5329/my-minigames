/* Snake sprite atlas — campaign-grade vector art for the four-biome run.

   Authored at 100×100 viewBoxes so each sprite rasterises crisply at the
   24×24 grid cell as well as the 64–96 px shop / HUD sizes. All glyphs share
   a soft glow filter so the sprites read as part of the same family no matter
   which biome they're laid into.

   Naming convention:
     snake.head / snake.body                 — player serpent
     snake.apple / snake.appleGold           — pickups (regular vs boss)
     snake.cactus / snake.glitch             — biome hazards (Desert, Digital)
     snake.decor.{grass|sand|crystal|pixel}  — biome flavour tiles
     snake.worm.head / snake.worm.body       — Worm Boss
     snake.power.{slowmo|ghost|magnet}       — power-up pickups
     snake.perk.{lateral|slowStart|ironApple|magnetPlus}  — shop icons
*/
(function () {
  const NDP = window.NDP;
  const Sprites = NDP.Engine.Sprites;

  const defs = `<defs>
    <filter id="snk-glow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="2.2" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <radialGradient id="snk-shine" cx="35%" cy="30%" r="60%">
      <stop offset="0%" stop-color="#fff" stop-opacity="0.7"/>
      <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
  </defs>`;

  Sprites.registerMany({
    /* Snake head — drawn facing RIGHT. Use opts.rot to face other directions:
         right=0, down=PI/2, left=PI, up=-PI/2.
       Kept symmetric on the vertical axis so rotation looks correct. */
    'snake.head': `<svg viewBox="0 0 100 100">${defs}
      <g filter="url(#snk-glow)">
        <rect x="8" y="14" width="80" height="72" rx="22" fill="#22c55e" stroke="#052e16" stroke-width="4"/>
        <rect x="12" y="18" width="72" height="22" rx="14" fill="#86efac"/>
        <circle cx="64" cy="34" r="10" fill="#fff"/>
        <circle cx="64" cy="66" r="10" fill="#fff"/>
        <circle cx="66" cy="34" r="6" fill="#052e16"/>
        <circle cx="66" cy="66" r="6" fill="#052e16"/>
        <circle cx="68" cy="32" r="2" fill="#fff"/>
        <circle cx="68" cy="64" r="2" fill="#fff"/>
        <path d="M88 50 L100 44 L92 50 L100 56 Z" fill="#dc2626" stroke="#7f1d1d" stroke-width="1.5" stroke-linejoin="round"/>
        <ellipse cx="40" cy="32" rx="20" ry="10" fill="url(#snk-shine)"/>
      </g>
    </svg>`,

    /* Snake body segment — same family, no eyes/tongue, slightly darker. */
    'snake.body': `<svg viewBox="0 0 100 100">${defs}
      <g filter="url(#snk-glow)">
        <rect x="6" y="6" width="88" height="88" rx="20" fill="#16a34a" stroke="#052e16" stroke-width="4"/>
        <rect x="14" y="14" width="38" height="38" rx="10" fill="#4ade80" opacity="0.55"/>
        <circle cx="50" cy="50" r="14" fill="#15803d"/>
      </g>
    </svg>`,

    /* Classic apple. */
    'snake.apple': `<svg viewBox="0 0 100 100">${defs}
      <g filter="url(#snk-glow)">
        <ellipse cx="50" cy="60" rx="36" ry="34" fill="#ef4444" stroke="#7f1d1d" stroke-width="3"/>
        <path d="M52 22 Q 64 14 74 18 Q 70 30 56 28 Z" fill="#16a34a" stroke="#052e16" stroke-width="2"/>
        <path d="M50 30 L54 18 L62 12" stroke="#7c2d12" stroke-width="4" fill="none" stroke-linecap="round"/>
        <ellipse cx="38" cy="48" rx="12" ry="8" fill="#fca5a5" opacity="0.85"/>
      </g>
    </svg>`,

    /* Boss / golden apple — same silhouette, gold + halo. */
    'snake.appleGold': `<svg viewBox="0 0 100 100">${defs}
      <g filter="url(#snk-glow)">
        <circle cx="50" cy="56" r="44" fill="#fde68a" opacity="0.35"/>
        <ellipse cx="50" cy="60" rx="36" ry="34" fill="#fbbf24" stroke="#92400e" stroke-width="3"/>
        <path d="M52 22 Q 70 12 80 20 Q 74 32 58 28 Z" fill="#d97706" stroke="#451a03" stroke-width="2"/>
        <path d="M50 30 L54 16 L64 12" stroke="#451a03" stroke-width="4" fill="none" stroke-linecap="round"/>
        <ellipse cx="38" cy="48" rx="12" ry="8" fill="#fef3c7" opacity="0.9"/>
        <path d="M14 26 L20 32 M86 30 L80 36 M16 78 L22 74 M84 78 L78 74"
          stroke="#fde68a" stroke-width="3" stroke-linecap="round"/>
      </g>
    </svg>`,

    /* Cactus tile (Desert biome wall). Three pads, ribbed body, white spines. */
    'snake.cactus': `<svg viewBox="0 0 100 100">${defs}
      <g filter="url(#snk-glow)">
        <rect x="40" y="14" width="20" height="76" rx="9" fill="#15803d" stroke="#052e16" stroke-width="3"/>
        <rect x="18" y="40" width="16" height="34" rx="7" fill="#15803d" stroke="#052e16" stroke-width="3"/>
        <rect x="66" y="32" width="16" height="34" rx="7" fill="#15803d" stroke="#052e16" stroke-width="3"/>
        <line x1="44" y1="20" x2="44" y2="86" stroke="#0c4a2a" stroke-width="2"/>
        <line x1="50" y1="20" x2="50" y2="86" stroke="#0c4a2a" stroke-width="2"/>
        <line x1="56" y1="20" x2="56" y2="86" stroke="#0c4a2a" stroke-width="2"/>
        <g stroke="#fef3c7" stroke-width="1.6" stroke-linecap="round">
          <line x1="40" y1="26" x2="34" y2="24"/><line x1="60" y1="26" x2="66" y2="24"/>
          <line x1="40" y1="50" x2="34" y2="48"/><line x1="60" y1="50" x2="66" y2="48"/>
          <line x1="40" y1="74" x2="34" y2="72"/><line x1="60" y1="74" x2="66" y2="72"/>
          <line x1="22" y1="56" x2="16" y2="54"/><line x1="30" y1="56" x2="36" y2="54"/>
          <line x1="70" y1="48" x2="64" y2="46"/><line x1="78" y1="48" x2="84" y2="46"/>
        </g>
        <ellipse cx="50" cy="14" rx="8" ry="3" fill="#fb7185" stroke="#9f1239" stroke-width="1.5"/>
      </g>
    </svg>`,

    /* Glitched grid tile — VHS scanlines + dashed border. */
    'snake.glitch': `<svg viewBox="0 0 100 100">
      <rect x="2" y="2" width="96" height="96" fill="#1e1b4b"/>
      <rect x="2" y="14" width="96" height="6" fill="#22d3ee" opacity="0.85"/>
      <rect x="2" y="36" width="70" height="4" fill="#ec4899" opacity="0.85"/>
      <rect x="20" y="56" width="60" height="6" fill="#facc15" opacity="0.7"/>
      <rect x="2" y="78" width="96" height="4" fill="#22d3ee" opacity="0.85"/>
      <rect x="36" y="22" width="6" height="60" fill="#a78bfa" opacity="0.55"/>
      <rect x="58" y="22" width="6" height="60" fill="#22d3ee" opacity="0.45"/>
      <rect x="2" y="2" width="96" height="96" fill="none" stroke="#7ae0ff" stroke-width="3" stroke-dasharray="6,4"/>
    </svg>`,

    /* Biome decor (background flavour). */
    'snake.decor.grass': `<svg viewBox="0 0 100 100">
      <path d="M40 96 Q 42 64 50 50 Q 56 64 56 96" stroke="#16a34a" stroke-width="4" fill="none" stroke-linecap="round"/>
      <path d="M28 96 Q 30 76 36 64" stroke="#15803d" stroke-width="4" fill="none" stroke-linecap="round"/>
      <path d="M70 96 Q 72 76 64 60" stroke="#15803d" stroke-width="4" fill="none" stroke-linecap="round"/>
      <path d="M50 50 L52 42 L58 38" stroke="#86efac" stroke-width="3" fill="none" stroke-linecap="round"/>
    </svg>`,

    'snake.decor.sand': `<svg viewBox="0 0 100 100">
      <circle cx="28" cy="70" r="5" fill="#fbbf24" opacity="0.65"/>
      <circle cx="56" cy="58" r="3.5" fill="#f59e0b" opacity="0.75"/>
      <circle cx="72" cy="78" r="6" fill="#fbbf24" opacity="0.55"/>
      <circle cx="44" cy="40" r="3.5" fill="#f59e0b" opacity="0.65"/>
      <circle cx="20" cy="40" r="2.5" fill="#fde68a" opacity="0.6"/>
      <path d="M16 90 Q 50 80 84 90" stroke="#fbbf24" stroke-width="2.5" fill="none" opacity="0.5"/>
    </svg>`,

    'snake.decor.crystal': `<svg viewBox="0 0 100 100">${defs}
      <g filter="url(#snk-glow)">
        <polygon points="50,16 66,52 56,84 44,84 34,52" fill="#a78bfa" stroke="#fff" stroke-width="2" opacity="0.85"/>
        <polygon points="50,16 50,84 34,52" fill="#7c3aed" opacity="0.6"/>
        <polygon points="50,16 66,52 50,52" fill="#c4b5fd" opacity="0.7"/>
      </g>
    </svg>`,

    'snake.decor.pixel': `<svg viewBox="0 0 100 100">
      <rect x="28" y="28" width="14" height="14" fill="#7ae0ff"/>
      <rect x="58" y="28" width="14" height="14" fill="#22d3ee"/>
      <rect x="28" y="58" width="14" height="14" fill="#06b6d4"/>
      <rect x="58" y="58" width="14" height="14" fill="#7ae0ff"/>
      <rect x="44" y="44" width="12" height="12" fill="#a78bfa" opacity="0.75"/>
    </svg>`,

    /* Worm Boss head — purple chrome rival to the player snake.
       Faces RIGHT, rotated like the player head sprite. */
    'snake.worm.head': `<svg viewBox="0 0 100 100">${defs}
      <g filter="url(#snk-glow)">
        <rect x="6" y="12" width="86" height="76" rx="24" fill="#7c3aed" stroke="#1e0a3a" stroke-width="4"/>
        <rect x="12" y="18" width="76" height="22" rx="14" fill="#c4b5fd"/>
        <circle cx="62" cy="34" r="11" fill="#fff"/>
        <circle cx="62" cy="66" r="11" fill="#fff"/>
        <circle cx="64" cy="34" r="6" fill="#dc2626"/>
        <circle cx="64" cy="66" r="6" fill="#dc2626"/>
        <path d="M92 50 L100 44 L94 50 L100 56 Z" fill="#facc15" stroke="#92400e" stroke-width="1.5"/>
        <path d="M14 28 L24 36 L16 50 L24 64 L14 72" stroke="#facc15" stroke-width="3" fill="none" stroke-linecap="round"/>
      </g>
    </svg>`,

    'snake.worm.body': `<svg viewBox="0 0 100 100">${defs}
      <g filter="url(#snk-glow)">
        <rect x="6" y="6" width="88" height="88" rx="20" fill="#6d28d9" stroke="#1e0a3a" stroke-width="4"/>
        <circle cx="50" cy="50" r="22" fill="#a855f7"/>
        <circle cx="50" cy="50" r="9" fill="#fbbf24" stroke="#92400e" stroke-width="1.5"/>
      </g>
    </svg>`,

    /* Power-ups. */
    'snake.power.slowmo': `<svg viewBox="0 0 100 100">${defs}
      <g filter="url(#snk-glow)">
        <circle cx="50" cy="50" r="40" fill="#0f172a" stroke="#7ae0ff" stroke-width="4"/>
        <circle cx="50" cy="50" r="40" fill="none" stroke="#fff" stroke-width="1.5" opacity="0.4"/>
        <path d="M50 22 L50 50 L70 62" stroke="#7ae0ff" stroke-width="6" fill="none" stroke-linecap="round"/>
        <circle cx="50" cy="50" r="5" fill="#7ae0ff"/>
        <g stroke="#7ae0ff" stroke-width="2.5" stroke-linecap="round">
          <line x1="50" y1="14" x2="50" y2="20"/>
          <line x1="50" y1="80" x2="50" y2="86"/>
          <line x1="14" y1="50" x2="20" y2="50"/>
          <line x1="80" y1="50" x2="86" y2="50"/>
        </g>
      </g>
    </svg>`,

    'snake.power.ghost': `<svg viewBox="0 0 100 100">${defs}
      <g filter="url(#snk-glow)">
        <path d="M18 68 Q 18 24 50 24 Q 82 24 82 68 L82 90 L72 80 L60 90 L50 80 L40 90 L28 80 L18 90 Z"
          fill="#e0f2fe" stroke="#7ae0ff" stroke-width="3" opacity="0.95"/>
        <ellipse cx="40" cy="52" rx="7" ry="9" fill="#0c4a6e"/>
        <ellipse cx="60" cy="52" rx="7" ry="9" fill="#0c4a6e"/>
        <circle cx="42" cy="50" r="2" fill="#fff"/>
        <circle cx="62" cy="50" r="2" fill="#fff"/>
      </g>
    </svg>`,

    'snake.power.magnet': `<svg viewBox="0 0 100 100">${defs}
      <g filter="url(#snk-glow)">
        <path d="M18 22 L40 22 L40 60 a 10 10 0 0 0 20 0 L60 22 L82 22 L82 62 a 32 32 0 0 1 -64 0 Z"
          fill="#dc2626" stroke="#1e0a0a" stroke-width="3.5"/>
        <rect x="18" y="22" width="22" height="14" fill="#fff" stroke="#1e0a0a" stroke-width="2"/>
        <rect x="60" y="22" width="22" height="14" fill="#fff" stroke="#1e0a0a" stroke-width="2"/>
        <g stroke="#facc15" stroke-width="2.5" stroke-linecap="round">
          <line x1="50" y1="84" x2="50" y2="94"/>
          <line x1="44" y1="90" x2="56" y2="90"/>
        </g>
      </g>
    </svg>`,

    /* Perk shop icons. */
    'snake.perk.lateral': `<svg viewBox="0 0 100 100">${defs}
      <g filter="url(#snk-glow)">
        <rect x="10" y="40" width="80" height="22" rx="10" fill="#22c55e" stroke="#052e16" stroke-width="3"/>
        <rect x="14" y="44" width="20" height="14" rx="6" fill="#86efac"/>
        <g stroke="#facc15" stroke-width="4" stroke-linecap="round" fill="none">
          <line x1="14" y1="51" x2="2" y2="51"/>
          <line x1="86" y1="51" x2="98" y2="51"/>
          <polyline points="2,51 12,44"/><polyline points="2,51 12,58"/>
          <polyline points="98,51 88,44"/><polyline points="98,51 88,58"/>
        </g>
      </g>
    </svg>`,

    'snake.perk.slowStart': `<svg viewBox="0 0 100 100">${defs}
      <g filter="url(#snk-glow)">
        <circle cx="50" cy="46" r="32" fill="#0f172a" stroke="#7ae0ff" stroke-width="3"/>
        <path d="M50 22 L50 46 L68 58" stroke="#7ae0ff" stroke-width="5" fill="none" stroke-linecap="round"/>
        <circle cx="50" cy="46" r="3.5" fill="#7ae0ff"/>
        <text x="50" y="92" text-anchor="middle" fill="#7ae0ff" font-size="16" font-family="monospace" font-weight="bold">5s</text>
      </g>
    </svg>`,

    'snake.perk.ironApple': `<svg viewBox="0 0 100 100">${defs}
      <g filter="url(#snk-glow)">
        <ellipse cx="50" cy="58" rx="34" ry="32" fill="#64748b" stroke="#0f172a" stroke-width="3"/>
        <path d="M52 22 Q 64 14 74 18 Q 70 30 56 28 Z" fill="#475569" stroke="#0f172a" stroke-width="2"/>
        <path d="M50 30 L54 18 L62 12" stroke="#0f172a" stroke-width="4" fill="none" stroke-linecap="round"/>
        <g stroke="#94a3b8" stroke-width="2" opacity="0.9">
          <line x1="30" y1="60" x2="40" y2="50"/>
          <line x1="50" y1="62" x2="60" y2="52"/>
          <line x1="60" y1="72" x2="70" y2="62"/>
          <line x1="40" y1="74" x2="46" y2="68"/>
        </g>
        <ellipse cx="38" cy="48" rx="10" ry="6" fill="#cbd5e1" opacity="0.65"/>
      </g>
    </svg>`,

    'snake.perk.magnetPlus': `<svg viewBox="0 0 100 100">${defs}
      <g filter="url(#snk-glow)">
        <path d="M14 24 L36 24 L36 58 a 10 10 0 0 0 20 0 L56 24 L78 24 L78 60 a 32 32 0 0 1 -64 0 Z"
          fill="#dc2626" stroke="#1e0a0a" stroke-width="3"/>
        <rect x="14" y="24" width="22" height="14" fill="#fff" stroke="#1e0a0a" stroke-width="2"/>
        <rect x="56" y="24" width="22" height="14" fill="#fff" stroke="#1e0a0a" stroke-width="2"/>
        <g stroke="#facc15" stroke-width="3" stroke-linecap="round" fill="none">
          <line x1="78" y1="78" x2="92" y2="78"/>
          <line x1="85" y1="71" x2="85" y2="85"/>
        </g>
      </g>
    </svg>`
  });
})();
