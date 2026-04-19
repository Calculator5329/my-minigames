/* Sigil sprite atlas — runic glyphs, boss portraits, spellbook UI bits.
   Each SVG is authored at a generous 200x200 viewBox so it rasterises crisply
   at any size we ask for. Colours lean violet/gold to match the existing
   parchment-dark theme. Glyphs share visual DNA (line caps, glow halo) so the
   spellbook feels like a coherent grimoire rather than clip-art. */
(function () {
  const NDP = window.NDP;
  const Sprites = NDP.Engine.Sprites;

  const halo = `<defs>
    <radialGradient id="halo" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#d6a8ff" stop-opacity="0.35"/>
      <stop offset="60%" stop-color="#7a3ad3" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="3" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>`;

  function glyph(strokes) {
    return `<svg viewBox="0 0 200 200">${halo}
      <circle cx="100" cy="100" r="92" fill="url(#halo)"/>
      <g fill="none" stroke="#f5d061" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow)">
        ${strokes}
      </g>
    </svg>`;
  }

  Sprites.registerMany({
    // ---------- Glyph icons ----------
    'sigil.deltar':      glyph(`<polygon points="100,18 175,160 25,160" />`),
    'sigil.zuul':        glyph(`<path d="M30 50 L170 50 L30 150 L170 150" />`),
    'sigil.skorn':       glyph(`<path d="M50 25 L120 95 L80 105 L150 175" />`),
    'sigil.quadrix':     glyph(`<rect x="30" y="30" width="140" height="140" />`),
    'sigil.pentagrim':   glyph(`<polygon points="100,20 132,180 18,80 182,80 68,180" />`),
    'sigil.vortek':      glyph(`<path d="M100 100 m-2 0 a 60 60 0 1 0 65 -55" stroke-dasharray="0" />
                                 <path d="M100 100 a 30 30 0 1 1 30 30" />`),
    'sigil.infenor':     glyph(`<path d="M40 100 C 40 60, 90 60, 100 100 C 110 140, 160 140, 160 100 C 160 60, 110 60, 100 100 C 90 140, 40 140, 40 100 Z" />`),
    'sigil.aether':      glyph(`<circle cx="100" cy="100" r="60" />
                                 <path d="M100 40 L100 160 M40 100 L160 100" />`),
    'sigil.nyx':         glyph(`<path d="M30 100 a 70 70 0 1 0 140 0" />
                                 <path d="M100 30 L100 100 L160 130" />`),

    // ---------- Boss portraits ----------
    'sigil.boss_warlock': `<svg viewBox="0 0 240 240">${halo}
      <circle cx="120" cy="120" r="110" fill="url(#halo)"/>
      <g filter="url(#glow)">
        <path d="M120 30 L160 70 L150 200 L90 200 L80 70 Z" fill="#3a1f5a" stroke="#d6a8ff" stroke-width="3"/>
        <path d="M120 30 L120 0 M105 12 L135 12" stroke="#f5d061" stroke-width="4" stroke-linecap="round"/>
        <ellipse cx="120" cy="115" rx="40" ry="50" fill="#1a0d2e"/>
        <circle cx="105" cy="110" r="6" fill="#f5d061"/>
        <circle cx="135" cy="110" r="6" fill="#f5d061"/>
        <path d="M100 140 Q 120 155 140 140" fill="none" stroke="#d6a8ff" stroke-width="3" stroke-linecap="round"/>
      </g>
    </svg>`,

    'sigil.boss_lich': `<svg viewBox="0 0 240 240">${halo}
      <circle cx="120" cy="120" r="110" fill="url(#halo)"/>
      <g filter="url(#glow)">
        <path d="M70 80 Q 120 30 170 80 L160 200 L80 200 Z" fill="#0f1a2c" stroke="#7ae0ff" stroke-width="3"/>
        <ellipse cx="120" cy="115" rx="46" ry="55" fill="#1c2a40"/>
        <ellipse cx="105" cy="115" rx="9" ry="10" fill="#000"/>
        <ellipse cx="135" cy="115" rx="9" ry="10" fill="#000"/>
        <circle cx="105" cy="115" r="3" fill="#7ae0ff"/>
        <circle cx="135" cy="115" r="3" fill="#7ae0ff"/>
        <path d="M95 150 L105 160 L115 150 L125 160 L135 150 L145 160" fill="none" stroke="#fff" stroke-width="3"/>
      </g>
    </svg>`,

    'sigil.boss_dragon': `<svg viewBox="0 0 240 240">${halo}
      <circle cx="120" cy="120" r="110" fill="url(#halo)"/>
      <g filter="url(#glow)">
        <path d="M30 130 Q 60 70 120 80 Q 180 70 210 130 Q 180 200 120 195 Q 60 200 30 130 Z" fill="#5a1e1e" stroke="#ff8c3a" stroke-width="3"/>
        <path d="M120 80 L130 40 L160 60 L140 90 Z" fill="#7a2a2a" stroke="#ff8c3a" stroke-width="2"/>
        <path d="M120 80 L110 40 L80 60 L100 90 Z" fill="#7a2a2a" stroke="#ff8c3a" stroke-width="2"/>
        <ellipse cx="95" cy="125" rx="14" ry="10" fill="#fff"/>
        <ellipse cx="145" cy="125" rx="14" ry="10" fill="#fff"/>
        <ellipse cx="95" cy="125" rx="6" ry="9" fill="#000"/>
        <ellipse cx="145" cy="125" rx="6" ry="9" fill="#000"/>
        <path d="M75 165 L95 158 L115 168 L135 158 L155 168 L175 160" fill="none" stroke="#f5d061" stroke-width="4" stroke-linecap="round"/>
        <path d="M120 175 Q 100 195 80 220 M120 175 Q 140 195 160 220" fill="none" stroke="#ff4400" stroke-width="3"/>
      </g>
    </svg>`,

    // ---------- Spellbook UI ----------
    'sigil.book_spine': `<svg viewBox="0 0 80 200">
      <rect x="0" y="0" width="80" height="200" fill="#1a0d2e" stroke="#d6a8ff" stroke-width="2"/>
      <rect x="6" y="20" width="68" height="160" fill="none" stroke="#f5d061" stroke-width="1.5"/>
      <circle cx="40" cy="100" r="20" fill="none" stroke="#d6a8ff" stroke-width="2"/>
      <circle cx="40" cy="100" r="6" fill="#f5d061"/>
    </svg>`,

    'sigil.crystal': `<svg viewBox="0 0 60 80">${halo}
      <polygon points="30,5 50,30 40,75 20,75 10,30" fill="#a8b8ff" stroke="#fff" stroke-width="2" filter="url(#glow)"/>
      <polygon points="30,5 30,75 10,30" fill="#7a8ad8" opacity="0.6"/>
    </svg>`,

    'sigil.scroll': `<svg viewBox="0 0 80 60">
      <rect x="6" y="14" width="68" height="32" fill="#e8d8b0" stroke="#7a4a14" stroke-width="2"/>
      <rect x="0" y="10" width="12" height="40" rx="6" fill="#7a4a14"/>
      <rect x="68" y="10" width="12" height="40" rx="6" fill="#7a4a14"/>
      <line x1="20" y1="22" x2="60" y2="22" stroke="#7a4a14" stroke-width="1.5"/>
      <line x1="20" y1="30" x2="60" y2="30" stroke="#7a4a14" stroke-width="1.5"/>
      <line x1="20" y1="38" x2="50" y2="38" stroke="#7a4a14" stroke-width="1.5"/>
    </svg>`
  });
})();
