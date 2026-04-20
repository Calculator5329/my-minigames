/* Orbital — hand-authored SVG sprite set.
   Each sprite is a self-contained <svg> string. At load time we wrap each in a
   data URL so the existing Assets pipeline (img/draw) works unmodified.
   IDs inside each SVG (gradients, filters) are local to that SVG document, so
   reusing short names like "body", "glow", "rim" across sprites is safe. */
(function () {
  const NDP = (window.NDP = window.NDP || {});

  // Helper: pack an SVG string into a data URL. encodeURIComponent avoids
  // base64 overhead and keeps sprite strings human-readable on dev inspection.
  function dataUrl(svg) {
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  // --- Shared palette (kept consistent across sprites) ---
  // Used in code below so colors stay coordinated.
  const P = {
    steel_hi: '#8a99c0', steel_mid: '#404860', steel_lo: '#0a0e18',
    rivet: '#ffd86b', cyan: '#7ae0ff', magenta: '#ff4fd8',
    orange: '#ffb25a', ember: '#ff8040', hot: '#ff4020',
    rock_hi: '#ffc890', rock_mid: '#a86a44', rock_lo: '#3a1808',
    void_hi: '#c8a8ff', void_core: '#8040ff', void_deep: '#1a0a2e'
  };

  const S = {};   // key -> SVG string

  // ==================================================================
  //  TOWERS
  // ==================================================================

  // --- DART STATION — sleek cyan interceptor turret ---
  S.turret_dart = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <defs>
      <radialGradient id="d" cx="40%" cy="25%"><stop offset="0%" stop-color="#d8faff"/><stop offset="45%" stop-color="#4fc8ff"/><stop offset="100%" stop-color="#0a3060"/></radialGradient>
      <linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#5a6890"/><stop offset="100%" stop-color="#060a1a"/></linearGradient>
      <linearGradient id="rail" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#202838"/><stop offset="50%" stop-color="#a8c0e0"/><stop offset="100%" stop-color="#10141e"/></linearGradient>
      <radialGradient id="g" cx="50%" cy="50%"><stop offset="0%" stop-color="#fff"/><stop offset="40%" stop-color="#7ae0ff"/><stop offset="100%" stop-color="#7ae0ff00"/></radialGradient>
    </defs>
    <ellipse cx="32" cy="58" rx="22" ry="4" fill="#000" opacity="0.55"/>
    <ellipse cx="32" cy="56" rx="20" ry="3" fill="#7ae0ff" opacity="0.3"/>
    <polygon points="14,52 22,42 42,42 50,52 42,60 22,60" fill="url(#b)" stroke="${P.cyan}" stroke-width="1.2" stroke-linejoin="round"/>
    <circle cx="18" cy="52" r="1.1" fill="${P.rivet}"/><circle cx="46" cy="52" r="1.1" fill="${P.rivet}"/>
    <circle cx="32" cy="52" r="2" fill="${P.cyan}"/><circle cx="32" cy="52" r="3.5" fill="url(#g)" opacity="0.6"/>
    <path d="M 16,46 Q 16,24 32,22 Q 48,24 48,46 Z" fill="url(#d)" stroke="#05101e" stroke-width="1.2"/>
    <path d="M 20,42 Q 20,28 32,24 Q 26,28 22,36 Q 20,40 20,42 Z" fill="#eafaff" opacity="0.5"/>
    <path d="M 20,40 L 44,40" stroke="#05101e" stroke-width="0.5" opacity="0.5"/>
    <circle cx="32" cy="34" r="3.5" fill="#05101e" stroke="${P.cyan}" stroke-width="0.6"/>
    <circle cx="32" cy="34" r="1.5" fill="${P.cyan}"/>
    <rect x="29" y="8" width="6" height="22" rx="1" fill="url(#rail)" stroke="#05101e" stroke-width="0.5"/>
    <rect x="28" y="14" width="8" height="1.2" fill="#10141e"/><rect x="28" y="18" width="8" height="1.2" fill="#10141e"/>
    <rect x="28" y="22" width="8" height="1.2" fill="#10141e"/>
    <path d="M 32,14 L 34,16 L 32,18 L 34,20 L 32,22 L 34,24 L 32,26" fill="none" stroke="${P.cyan}" stroke-width="0.6" opacity="0.8"/>
    <rect x="30.5" y="9" width="1" height="20" fill="#e8f4ff" opacity="0.5"/>
    <circle cx="32" cy="8" r="4" fill="url(#g)"/><circle cx="32" cy="8" r="1.5" fill="#fff"/>
    <line x1="24" y1="22" x2="20" y2="18" stroke="#8899bb" stroke-width="0.6"/>
    <line x1="40" y1="22" x2="44" y2="18" stroke="#8899bb" stroke-width="0.6"/>
    <circle cx="20" cy="18" r="1.2" fill="${P.cyan}"/><circle cx="44" cy="18" r="1.2" fill="${P.cyan}"/>
  </svg>`;

  // --- PLASMA CANNON — twin-barrel heavy (the demo piece, polished) ---
  S.turret_cannon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <defs>
      <radialGradient id="dome" cx="35%" cy="25%"><stop offset="0%" stop-color="#ffe4a8"/><stop offset="30%" stop-color="#ffb25a"/><stop offset="65%" stop-color="#c85020"/><stop offset="100%" stop-color="#4a0e04"/></radialGradient>
      <linearGradient id="base" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#5a6890"/><stop offset="100%" stop-color="#060a1a"/></linearGradient>
      <linearGradient id="brl" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#1a2030"/><stop offset="50%" stop-color="#8a99c0"/><stop offset="100%" stop-color="#0a0e18"/></linearGradient>
      <radialGradient id="mzl" cx="50%" cy="50%"><stop offset="0%" stop-color="#fff"/><stop offset="40%" stop-color="#ffa04a"/><stop offset="100%" stop-color="#ff2a0000"/></radialGradient>
    </defs>
    <ellipse cx="32" cy="58" rx="23" ry="4" fill="#000" opacity="0.55"/>
    <ellipse cx="32" cy="56" rx="20" ry="3" fill="${P.ember}" opacity="0.3"/>
    <polygon points="12,52 20,42 44,42 52,52 44,60 20,60" fill="url(#base)" stroke="${P.orange}" stroke-width="1.2" stroke-linejoin="round"/>
    <line x1="20" y1="42" x2="20" y2="60" stroke="#0a1020" stroke-width="0.5"/>
    <line x1="44" y1="42" x2="44" y2="60" stroke="#0a1020" stroke-width="0.5"/>
    <circle cx="16" cy="52" r="1.2" fill="${P.rivet}"/><circle cx="48" cy="52" r="1.2" fill="${P.rivet}"/>
    <circle cx="32" cy="52" r="2" fill="${P.cyan}"/>
    <path d="M 14,46 Q 14,24 32,22 Q 50,24 50,46 Z" fill="url(#dome)" stroke="#200604" stroke-width="1.3"/>
    <path d="M 18,42 Q 18,28 30,24 Q 24,28 22,34 Q 20,40 18,42 Z" fill="#ffe8c2" opacity="0.45"/>
    <path d="M 22,44 Q 24,30 28,26" fill="none" stroke="#fff3d0" stroke-width="1" opacity="0.6"/>
    <path d="M 32,22 L 32,44" stroke="#2a0804" stroke-width="0.5" opacity="0.5"/>
    <rect x="19" y="36" width="4" height="7" rx="1" fill="#0a0200" stroke="#ff6030" stroke-width="0.6"/>
    <rect x="41" y="36" width="4" height="7" rx="1" fill="#0a0200" stroke="#ff6030" stroke-width="0.6"/>
    <rect x="20" y="38" width="2" height="1.2" fill="#ffa04a"/><rect x="42" y="38" width="2" height="1.2" fill="#ffa04a"/>
    <rect x="20" y="41" width="2" height="1.2" fill="#ffa04a"/><rect x="42" y="41" width="2" height="1.2" fill="#ffa04a"/>
    <rect x="25" y="32" width="14" height="7" rx="1.5" fill="#1a1028" stroke="#7a8aa8" stroke-width="0.5"/>
    <circle cx="28" cy="35.5" r="1.1" fill="${P.cyan}"/>
    <circle cx="32" cy="35.5" r="1.1" fill="${P.cyan}"/>
    <circle cx="36" cy="35.5" r="1.1" fill="${P.cyan}"/>
    <circle cx="32" cy="28" r="3.5" fill="#0a0410" stroke="#ff8040" stroke-width="0.6"/>
    <circle cx="32" cy="28" r="1.2" fill="#ff4020"/>
    <rect x="23" y="8" width="6" height="20" rx="1.2" fill="url(#brl)" stroke="#0a0e18" stroke-width="0.5"/>
    <rect x="35" y="8" width="6" height="20" rx="1.2" fill="url(#brl)" stroke="#0a0e18" stroke-width="0.5"/>
    <rect x="22" y="13" width="8" height="1" fill="#1a2030"/><rect x="22" y="16" width="8" height="1" fill="#1a2030"/>
    <rect x="22" y="19" width="8" height="1" fill="#1a2030"/><rect x="22" y="22" width="8" height="1" fill="#1a2030"/>
    <rect x="34" y="13" width="8" height="1" fill="#1a2030"/><rect x="34" y="16" width="8" height="1" fill="#1a2030"/>
    <rect x="34" y="19" width="8" height="1" fill="#1a2030"/><rect x="34" y="22" width="8" height="1" fill="#1a2030"/>
    <path d="M 23,14 L 29,15 L 23,16 L 29,17 L 23,18 L 29,19 L 23,20 L 29,21" fill="none" stroke="${P.cyan}" stroke-width="0.5" opacity="0.7"/>
    <path d="M 35,14 L 41,15 L 35,16 L 41,17 L 35,18 L 41,19 L 35,20 L 41,21" fill="none" stroke="${P.cyan}" stroke-width="0.5" opacity="0.7"/>
    <rect x="24.5" y="9" width="0.8" height="18" fill="#c8d8f0" opacity="0.6"/>
    <rect x="36.5" y="9" width="0.8" height="18" fill="#c8d8f0" opacity="0.6"/>
    <circle cx="26" cy="8" r="4" fill="url(#mzl)"/><circle cx="38" cy="8" r="4" fill="url(#mzl)"/>
    <circle cx="26" cy="8" r="1.4" fill="#fff8d4"/><circle cx="38" cy="8" r="1.4" fill="#fff8d4"/>
    <line x1="32" y1="22" x2="32" y2="14" stroke="#8899bb" stroke-width="0.7"/>
    <circle cx="32" cy="13" r="1.4" fill="${P.magenta}"/>
  </svg>`;

  // --- BEAM ARRAY — crystal-prism laser emitter, magenta ---
  S.turret_beam = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <defs>
      <radialGradient id="prism" cx="50%" cy="30%"><stop offset="0%" stop-color="#ffeaff"/><stop offset="45%" stop-color="#ff4fd8"/><stop offset="100%" stop-color="#420030"/></radialGradient>
      <linearGradient id="base" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#5a4470"/><stop offset="100%" stop-color="#0e051a"/></linearGradient>
      <radialGradient id="energy" cx="50%" cy="50%"><stop offset="0%" stop-color="#fff"/><stop offset="40%" stop-color="#ff4fd8"/><stop offset="100%" stop-color="#ff4fd800"/></radialGradient>
      <linearGradient id="crystal" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ffcbf0"/><stop offset="50%" stop-color="#c848b4"/><stop offset="100%" stop-color="#2a0424"/></linearGradient>
    </defs>
    <ellipse cx="32" cy="58" rx="22" ry="4" fill="#000" opacity="0.55"/>
    <ellipse cx="32" cy="56" rx="19" ry="3" fill="${P.magenta}" opacity="0.4"/>
    <polygon points="14,52 22,42 42,42 50,52 42,60 22,60" fill="url(#base)" stroke="${P.magenta}" stroke-width="1.2" stroke-linejoin="round"/>
    <circle cx="18" cy="52" r="1.1" fill="${P.rivet}"/><circle cx="46" cy="52" r="1.1" fill="${P.rivet}"/>
    <circle cx="32" cy="52" r="2" fill="${P.magenta}"/>
    <path d="M 14,44 Q 18,28 32,26 Q 46,28 50,44 Z" fill="url(#base)" stroke="${P.magenta}" stroke-width="1"/>
    <path d="M 20,42 Q 22,32 32,28" fill="none" stroke="#c090d0" stroke-width="0.6" opacity="0.6"/>
    <rect x="24" y="32" width="16" height="6" rx="1" fill="#20103a" stroke="${P.magenta}" stroke-width="0.5"/>
    <circle cx="27" cy="35" r="1.2" fill="${P.magenta}"/><circle cx="32" cy="35" r="1.2" fill="#fff"/>
    <circle cx="37" cy="35" r="1.2" fill="${P.magenta}"/>
    <polygon points="32,4 38,14 36,26 32,30 28,26 26,14" fill="url(#crystal)" stroke="#2a0424" stroke-width="1" stroke-linejoin="round"/>
    <polygon points="32,4 38,14 32,18 26,14" fill="#ffcbf0" opacity="0.5"/>
    <line x1="32" y1="4" x2="32" y2="30" stroke="#ffe4f8" stroke-width="0.8" opacity="0.7"/>
    <line x1="28" y1="8" x2="28" y2="24" stroke="#ffaadd" stroke-width="0.4" opacity="0.5"/>
    <line x1="36" y1="8" x2="36" y2="24" stroke="#ffaadd" stroke-width="0.4" opacity="0.5"/>
    <circle cx="32" cy="4" r="4" fill="url(#energy)"/><circle cx="32" cy="4" r="1.3" fill="#fff"/>
    <circle cx="32" cy="22" r="2.5" fill="#fff8ff" opacity="0.8"/>
    <circle cx="22" cy="24" r="1.5" fill="${P.magenta}"/><circle cx="42" cy="24" r="1.5" fill="${P.magenta}"/>
    <path d="M 22,24 Q 27,18 32,14" fill="none" stroke="${P.magenta}" stroke-width="0.8" opacity="0.5"/>
    <path d="M 42,24 Q 37,18 32,14" fill="none" stroke="${P.magenta}" stroke-width="0.8" opacity="0.5"/>
  </svg>`;

  // --- GRAVITY WELL — central orb with orbiting rings, purple ---
  S.turret_gravity = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <defs>
      <radialGradient id="core" cx="50%" cy="50%"><stop offset="0%" stop-color="#fff"/><stop offset="25%" stop-color="#c8a8ff"/><stop offset="60%" stop-color="#6030c0"/><stop offset="100%" stop-color="#0a0422"/></radialGradient>
      <linearGradient id="pillar" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#5a4870"/><stop offset="100%" stop-color="#0a0520"/></linearGradient>
      <radialGradient id="aura" cx="50%" cy="50%"><stop offset="0%" stop-color="#a070ff88"/><stop offset="100%" stop-color="#6030c000"/></radialGradient>
    </defs>
    <ellipse cx="32" cy="58" rx="24" ry="5" fill="#000" opacity="0.6"/>
    <circle cx="32" cy="32" r="28" fill="url(#aura)" opacity="0.5"/>
    <ellipse cx="12" cy="54" rx="6" ry="3" fill="${P.steel_lo}"/>
    <ellipse cx="52" cy="54" rx="6" ry="3" fill="${P.steel_lo}"/>
    <rect x="8" y="36" width="8" height="18" rx="1.5" fill="url(#pillar)" stroke="#8070a0" stroke-width="0.6"/>
    <rect x="48" y="36" width="8" height="18" rx="1.5" fill="url(#pillar)" stroke="#8070a0" stroke-width="0.6"/>
    <rect x="9" y="40" width="6" height="1" fill="${P.void_core}"/><rect x="9" y="45" width="6" height="1" fill="${P.void_core}"/>
    <rect x="49" y="40" width="6" height="1" fill="${P.void_core}"/><rect x="49" y="45" width="6" height="1" fill="${P.void_core}"/>
    <circle cx="12" cy="38" r="1.4" fill="${P.magenta}"/><circle cx="52" cy="38" r="1.4" fill="${P.magenta}"/>
    <rect x="10" y="34" width="4" height="2" fill="#8070a0"/><rect x="50" y="34" width="4" height="2" fill="#8070a0"/>
    <ellipse cx="32" cy="32" rx="26" ry="8" fill="none" stroke="${P.void_core}" stroke-width="1" opacity="0.7" transform="rotate(-15 32 32)"/>
    <ellipse cx="32" cy="32" rx="22" ry="6" fill="none" stroke="${P.magenta}" stroke-width="0.8" opacity="0.6" transform="rotate(15 32 32)"/>
    <ellipse cx="32" cy="32" rx="18" ry="4" fill="none" stroke="${P.cyan}" stroke-width="0.6" opacity="0.5" transform="rotate(-8 32 32)"/>
    <circle cx="32" cy="32" r="10" fill="url(#core)" stroke="#1a0822" stroke-width="0.8"/>
    <circle cx="29" cy="29" r="3" fill="#e8d4ff" opacity="0.7"/>
    <circle cx="32" cy="32" r="2" fill="#fff"/>
    <circle cx="58" cy="32" r="1.2" fill="${P.cyan}"/>
    <circle cx="6" cy="32" r="1.2" fill="${P.magenta}"/>
    <circle cx="32" cy="6" r="1" fill="${P.void_core}"/>
    <line x1="16" y1="34" x2="22" y2="34" stroke="${P.void_core}" stroke-width="0.6" opacity="0.7"/>
    <line x1="42" y1="34" x2="48" y2="34" stroke="${P.void_core}" stroke-width="0.6" opacity="0.7"/>
  </svg>`;

  // --- SOLAR FLARE — radial sunburst turret ---
  S.turret_flare = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <defs>
      <radialGradient id="sun" cx="50%" cy="50%"><stop offset="0%" stop-color="#ffffe0"/><stop offset="30%" stop-color="#ffd86b"/><stop offset="65%" stop-color="#ff6e3a"/><stop offset="100%" stop-color="#4a1004"/></radialGradient>
      <linearGradient id="housing" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#6a4020"/><stop offset="100%" stop-color="#0a0402"/></linearGradient>
      <radialGradient id="flr" cx="50%" cy="50%"><stop offset="0%" stop-color="#ffe0a0"/><stop offset="60%" stop-color="#ff8040"/><stop offset="100%" stop-color="#ff400000"/></radialGradient>
    </defs>
    <ellipse cx="32" cy="58" rx="24" ry="5" fill="#000" opacity="0.55"/>
    <ellipse cx="32" cy="56" rx="22" ry="4" fill="${P.ember}" opacity="0.5"/>
    <polygon points="10,52 20,40 44,40 54,52 44,60 20,60" fill="url(#housing)" stroke="${P.orange}" stroke-width="1.2" stroke-linejoin="round"/>
    <circle cx="14" cy="52" r="1.2" fill="${P.rivet}"/><circle cx="50" cy="52" r="1.2" fill="${P.rivet}"/>
    <circle cx="32" cy="52" r="2" fill="${P.cyan}"/>
    <rect x="16" y="44" width="32" height="4" rx="1" fill="#1a0802" stroke="${P.orange}" stroke-width="0.4"/>
    <rect x="18" y="45" width="2" height="2" fill="#ffd86b"/><rect x="22" y="45" width="2" height="2" fill="#ffd86b"/>
    <rect x="26" y="45" width="2" height="2" fill="#ffd86b"/><rect x="30" y="45" width="2" height="2" fill="#ffd86b"/>
    <rect x="34" y="45" width="2" height="2" fill="#ffd86b"/><rect x="38" y="45" width="2" height="2" fill="#ffd86b"/>
    <rect x="42" y="45" width="2" height="2" fill="#ffd86b"/>
    <circle cx="32" cy="42" r="20" fill="url(#flr)" opacity="0.5"/>
    <g stroke="${P.ember}" stroke-width="1.5" stroke-linecap="round">
      <line x1="32" y1="8" x2="32" y2="16"/>
      <line x1="16" y1="18" x2="22" y2="22"/>
      <line x1="48" y1="18" x2="42" y2="22"/>
      <line x1="14" y1="32" x2="20" y2="32"/>
      <line x1="50" y1="32" x2="44" y2="32"/>
      <line x1="18" y1="42" x2="22" y2="38"/>
      <line x1="46" y1="42" x2="42" y2="38"/>
    </g>
    <g stroke="${P.rivet}" stroke-width="1" stroke-linecap="round" opacity="0.8">
      <line x1="26" y1="10" x2="28" y2="16"/>
      <line x1="38" y1="10" x2="36" y2="16"/>
      <line x1="14" y1="24" x2="20" y2="26"/>
      <line x1="50" y1="24" x2="44" y2="26"/>
    </g>
    <circle cx="32" cy="30" r="12" fill="url(#sun)" stroke="#2a0804" stroke-width="1"/>
    <circle cx="28" cy="26" r="4" fill="#ffffe0" opacity="0.7"/>
    <circle cx="32" cy="30" r="6" fill="url(#sun)"/>
    <circle cx="32" cy="30" r="2" fill="#fff"/>
    <path d="M 24,24 Q 30,18 40,22" fill="none" stroke="#fff8a0" stroke-width="0.8" opacity="0.7"/>
    <ellipse cx="20" cy="38" rx="3" ry="1.5" fill="${P.hot}" opacity="0.8"/>
    <ellipse cx="44" cy="38" rx="3" ry="1.5" fill="${P.hot}" opacity="0.8"/>
  </svg>`;

  // --- SINGULARITY — black hole with accretion disc ---
  S.turret_sing = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <defs>
      <radialGradient id="void" cx="50%" cy="50%"><stop offset="0%" stop-color="#000"/><stop offset="60%" stop-color="#000"/><stop offset="85%" stop-color="#4a1080"/><stop offset="100%" stop-color="#a040ff00"/></radialGradient>
      <linearGradient id="disc" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#4a1080"/><stop offset="25%" stop-color="#ff4fd8"/><stop offset="50%" stop-color="#fff"/><stop offset="75%" stop-color="#ff4fd8"/><stop offset="100%" stop-color="#4a1080"/></linearGradient>
      <linearGradient id="mnt" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#40305a"/><stop offset="100%" stop-color="#0a0414"/></linearGradient>
      <radialGradient id="aura" cx="50%" cy="50%"><stop offset="0%" stop-color="#a040ff66"/><stop offset="100%" stop-color="#a040ff00"/></radialGradient>
    </defs>
    <ellipse cx="32" cy="58" rx="26" ry="6" fill="#000" opacity="0.7"/>
    <circle cx="32" cy="32" r="30" fill="url(#aura)" opacity="0.6"/>
    <polygon points="10,50 22,42 42,42 54,50 42,60 22,60" fill="url(#mnt)" stroke="${P.void_core}" stroke-width="1.2" stroke-linejoin="round"/>
    <circle cx="14" cy="50" r="1.2" fill="${P.magenta}"/><circle cx="50" cy="50" r="1.2" fill="${P.magenta}"/>
    <circle cx="32" cy="50" r="2" fill="${P.magenta}"/>
    <rect x="16" y="46" width="32" height="3" rx="1" fill="#0a0414" stroke="${P.magenta}" stroke-width="0.4"/>
    <circle cx="22" cy="47.5" r="0.8" fill="${P.magenta}"/><circle cx="28" cy="47.5" r="0.8" fill="${P.cyan}"/>
    <circle cx="32" cy="47.5" r="0.8" fill="#fff"/>
    <circle cx="36" cy="47.5" r="0.8" fill="${P.cyan}"/><circle cx="42" cy="47.5" r="0.8" fill="${P.magenta}"/>
    <ellipse cx="32" cy="30" rx="22" ry="5" fill="none" stroke="url(#disc)" stroke-width="2" transform="rotate(-10 32 30)"/>
    <ellipse cx="32" cy="30" rx="18" ry="4" fill="none" stroke="${P.magenta}" stroke-width="1.4" transform="rotate(-10 32 30)" opacity="0.7"/>
    <ellipse cx="32" cy="30" rx="14" ry="3" fill="none" stroke="#fff" stroke-width="0.6" transform="rotate(-10 32 30)" opacity="0.5"/>
    <circle cx="32" cy="30" r="11" fill="url(#void)"/>
    <circle cx="32" cy="30" r="7" fill="#000"/>
    <circle cx="32" cy="30" r="9.5" fill="none" stroke="${P.void_core}" stroke-width="1" opacity="0.8"/>
    <ellipse cx="32" cy="30" rx="22" ry="5" fill="none" stroke="url(#disc)" stroke-width="1" transform="rotate(-10 32 30)" opacity="0.5"/>
    <g opacity="0.7">
      <circle cx="14" cy="26" r="0.5" fill="#fff"/>
      <circle cx="52" cy="26" r="0.5" fill="#fff"/>
      <circle cx="12" cy="34" r="0.5" fill="#fff"/>
      <circle cx="54" cy="34" r="0.5" fill="#fff"/>
    </g>
    <path d="M 10,30 Q 14,22 16,20" fill="none" stroke="${P.magenta}" stroke-width="0.5" opacity="0.6"/>
    <path d="M 54,30 Q 50,22 48,20" fill="none" stroke="${P.magenta}" stroke-width="0.5" opacity="0.6"/>
  </svg>`;

  // --- TESLA COIL — electric arc tower, blue-purple ---
  S.turret_tesla = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <defs>
      <radialGradient id="orb" cx="50%" cy="50%"><stop offset="0%" stop-color="#ffffff"/><stop offset="30%" stop-color="#a8c8ff"/><stop offset="70%" stop-color="#3060ff"/><stop offset="100%" stop-color="#0a1440"/></radialGradient>
      <linearGradient id="base" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#404c70"/><stop offset="100%" stop-color="#080c1a"/></linearGradient>
      <linearGradient id="coil" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#a8a8c0"/><stop offset="50%" stop-color="#505870"/><stop offset="100%" stop-color="#1a1e30"/></linearGradient>
      <radialGradient id="arc" cx="50%" cy="50%"><stop offset="0%" stop-color="#fff"/><stop offset="40%" stop-color="#7aaaff"/><stop offset="100%" stop-color="#3060ff00"/></radialGradient>
    </defs>
    <ellipse cx="32" cy="58" rx="22" ry="4" fill="#000" opacity="0.55"/>
    <ellipse cx="32" cy="56" rx="20" ry="3" fill="#3060ff" opacity="0.35"/>
    <polygon points="12,52 22,42 42,42 52,52 42,60 22,60" fill="url(#base)" stroke="#3060ff" stroke-width="1.2" stroke-linejoin="round"/>
    <circle cx="16" cy="52" r="1.2" fill="${P.rivet}"/><circle cx="48" cy="52" r="1.2" fill="${P.rivet}"/>
    <circle cx="32" cy="52" r="2" fill="#7aaaff"/>
    <rect x="22" y="36" width="20" height="8" rx="1.5" fill="#101828" stroke="#3060ff" stroke-width="0.5"/>
    <circle cx="26" cy="40" r="1.2" fill="#7aaaff"/>
    <circle cx="32" cy="40" r="1.2" fill="#fff"/>
    <circle cx="38" cy="40" r="1.2" fill="#7aaaff"/>
    <rect x="26" y="14" width="12" height="22" rx="1.5" fill="url(#coil)" stroke="#0a0e1a" stroke-width="0.6"/>
    <g stroke="#a8a8c0" stroke-width="0.6" fill="none" opacity="0.85">
      <path d="M 26,16 L 38,17 L 26,18 L 38,19 L 26,20 L 38,21 L 26,22 L 38,23 L 26,24 L 38,25 L 26,26 L 38,27 L 26,28 L 38,29 L 26,30 L 38,31 L 26,32 L 38,33 L 26,34"/>
    </g>
    <g stroke="#7aaaff" stroke-width="0.5" fill="none" opacity="0.7">
      <path d="M 28,18 L 36,19 M 28,22 L 36,23 M 28,26 L 36,27 M 28,30 L 36,31"/>
    </g>
    <rect x="27" y="14" width="1.2" height="22" fill="#c8d8f0" opacity="0.5"/>
    <rect x="28" y="12" width="8" height="3" rx="0.8" fill="#202838" stroke="#7aaaff" stroke-width="0.5"/>
    <rect x="30" y="8" width="4" height="6" fill="#505870"/>
    <circle cx="32" cy="8" r="5" fill="url(#arc)"/>
    <circle cx="32" cy="8" r="3" fill="url(#orb)" stroke="#3060ff" stroke-width="0.5"/>
    <circle cx="32" cy="8" r="1.2" fill="#fff"/>
    <path d="M 32,3 L 30,0 M 32,3 L 34,0 M 32,3 L 32,-1" stroke="#7aaaff" stroke-width="0.5" opacity="0.7"/>
    <line x1="22" y1="34" x2="18" y2="30" stroke="#8899bb" stroke-width="0.6"/>
    <line x1="42" y1="34" x2="46" y2="30" stroke="#8899bb" stroke-width="0.6"/>
    <circle cx="18" cy="30" r="1.4" fill="#7aaaff"/><circle cx="46" cy="30" r="1.4" fill="#7aaaff"/>
  </svg>`;

  // --- MISSILE SILO — military launcher, red/grey ---
  S.turret_missile = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <defs>
      <linearGradient id="base" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#5a6060"/><stop offset="100%" stop-color="#0a0c0c"/></linearGradient>
      <linearGradient id="tube" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#1a1c1c"/><stop offset="50%" stop-color="#a0a4a4"/><stop offset="100%" stop-color="#0a0c0c"/></linearGradient>
      <linearGradient id="miss" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ff8080"/><stop offset="50%" stop-color="#c02020"/><stop offset="100%" stop-color="#400404"/></linearGradient>
      <radialGradient id="warn" cx="50%" cy="50%"><stop offset="0%" stop-color="#ffffc0"/><stop offset="50%" stop-color="#ff8040"/><stop offset="100%" stop-color="#ff200000"/></radialGradient>
    </defs>
    <ellipse cx="32" cy="58" rx="24" ry="4" fill="#000" opacity="0.6"/>
    <polygon points="8,52 18,40 46,40 56,52 46,60 18,60" fill="url(#base)" stroke="${P.orange}" stroke-width="1.2" stroke-linejoin="round"/>
    <polygon points="8,52 18,40 46,40 56,52" fill="none" stroke="#fff" stroke-width="0.5" opacity="0.25"/>
    <circle cx="12" cy="52" r="1.3" fill="${P.rivet}"/><circle cx="52" cy="52" r="1.3" fill="${P.rivet}"/>
    <circle cx="18" cy="42" r="1.1" fill="${P.rivet}"/><circle cx="46" cy="42" r="1.1" fill="${P.rivet}"/>
    <rect x="20" y="44" width="24" height="4" rx="0.5" fill="#303030" stroke="#000" stroke-width="0.4"/>
    <rect x="22" y="45" width="2" height="2" fill="#ff4040"/>
    <rect x="38" y="45" width="2" height="2" fill="#40ff40"/>
    <!-- Red-yellow hazard stripes -->
    <g opacity="0.75">
      <rect x="12" y="50" width="3" height="2" fill="#ffd86b"/>
      <rect x="15" y="50" width="3" height="2" fill="#2a0004"/>
      <rect x="18" y="50" width="3" height="2" fill="#ffd86b"/>
      <rect x="43" y="50" width="3" height="2" fill="#2a0004"/>
      <rect x="46" y="50" width="3" height="2" fill="#ffd86b"/>
      <rect x="49" y="50" width="3" height="2" fill="#2a0004"/>
    </g>
    <!-- Launcher frame -->
    <rect x="18" y="24" width="28" height="18" rx="1" fill="url(#base)" stroke="#0a0c0c" stroke-width="0.8"/>
    <rect x="20" y="26" width="24" height="1" fill="#404040"/>
    <!-- Missile tubes (4) -->
    <g>
      <rect x="20" y="28" width="6" height="12" rx="1" fill="#0a0c0c" stroke="#606060" stroke-width="0.5"/>
      <rect x="27" y="28" width="6" height="12" rx="1" fill="#0a0c0c" stroke="#606060" stroke-width="0.5"/>
      <rect x="34" y="28" width="6" height="12" rx="1" fill="#0a0c0c" stroke="#606060" stroke-width="0.5"/>
      <!-- One missile loaded, tip visible -->
      <rect x="21" y="14" width="4" height="14" rx="1" fill="url(#miss)" stroke="#400404" stroke-width="0.5"/>
      <polygon points="21,14 25,14 23,9" fill="#ff8080" stroke="#400404" stroke-width="0.5"/>
      <rect x="22" y="27" width="2" height="1" fill="#ffd86b"/>
      <rect x="28" y="28" width="4" height="12" rx="0.5" fill="url(#miss)" stroke="#400404" stroke-width="0.3"/>
      <rect x="35" y="28" width="4" height="12" rx="0.5" fill="url(#miss)" stroke="#400404" stroke-width="0.3"/>
    </g>
    <!-- Radar dish -->
    <rect x="41" y="22" width="2" height="6" fill="#404040"/>
    <path d="M 38,22 L 46,22 L 48,18 L 42,16 L 36,18 Z" fill="#505858" stroke="#0a0c0c" stroke-width="0.5"/>
    <path d="M 40,20 L 45,19 L 44,17" fill="none" stroke="#7ae0ff" stroke-width="0.4"/>
    <circle cx="42" cy="19" r="0.8" fill="${P.cyan}"/>
    <!-- Warning light -->
    <circle cx="14" cy="36" r="2" fill="url(#warn)"/>
    <circle cx="14" cy="36" r="1" fill="#ff4020"/>
    <!-- Blast crater around base -->
    <ellipse cx="32" cy="54" rx="16" ry="2" fill="#2a1004" opacity="0.5"/>
  </svg>`;

  // --- SUPPORT BEACON — buff tower, green/gold ---
  S.turret_support = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <defs>
      <radialGradient id="orb" cx="40%" cy="30%"><stop offset="0%" stop-color="#e8fff0"/><stop offset="35%" stop-color="#4ade80"/><stop offset="75%" stop-color="#10803a"/><stop offset="100%" stop-color="#041c10"/></radialGradient>
      <linearGradient id="base" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#5a6050"/><stop offset="100%" stop-color="#0c100a"/></linearGradient>
      <linearGradient id="pillar" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#b8d898"/><stop offset="50%" stop-color="#4ade80"/><stop offset="100%" stop-color="#183c20"/></linearGradient>
      <radialGradient id="aura" cx="50%" cy="50%"><stop offset="0%" stop-color="#4ade8066"/><stop offset="100%" stop-color="#4ade8000"/></radialGradient>
    </defs>
    <ellipse cx="32" cy="58" rx="24" ry="4" fill="#000" opacity="0.55"/>
    <circle cx="32" cy="32" r="28" fill="url(#aura)" opacity="0.6"/>
    <polygon points="10,52 22,42 42,42 54,52 42,60 22,60" fill="url(#base)" stroke="#4ade80" stroke-width="1.2" stroke-linejoin="round"/>
    <circle cx="14" cy="52" r="1.2" fill="${P.rivet}"/><circle cx="50" cy="52" r="1.2" fill="${P.rivet}"/>
    <circle cx="32" cy="52" r="2" fill="#4ade80"/>
    <!-- Support rings (radiating) -->
    <circle cx="32" cy="32" r="26" fill="none" stroke="#4ade80" stroke-width="0.5" opacity="0.4"/>
    <circle cx="32" cy="32" r="22" fill="none" stroke="#4ade80" stroke-width="0.7" opacity="0.55"/>
    <circle cx="32" cy="32" r="18" fill="none" stroke="#ffd86b" stroke-width="0.6" opacity="0.4"/>
    <!-- Three buff stations around the beacon -->
    <g>
      <rect x="12" y="28" width="6" height="10" rx="1" fill="url(#pillar)" stroke="#041c10" stroke-width="0.5"/>
      <rect x="46" y="28" width="6" height="10" rx="1" fill="url(#pillar)" stroke="#041c10" stroke-width="0.5"/>
      <rect x="29" y="14" width="6" height="8" rx="1" fill="url(#pillar)" stroke="#041c10" stroke-width="0.5"/>
      <circle cx="15" cy="30" r="0.8" fill="#fff"/><circle cx="49" cy="30" r="0.8" fill="#fff"/>
      <circle cx="32" cy="16" r="0.8" fill="#fff"/>
    </g>
    <!-- Support beams connecting stations -->
    <path d="M 18,33 L 26,30 M 38,30 L 46,33 M 32,22 L 32,27" stroke="#ffd86b" stroke-width="0.6" opacity="0.6" stroke-linecap="round"/>
    <!-- Central beacon post -->
    <rect x="29" y="20" width="6" height="22" rx="1" fill="url(#pillar)" stroke="#041c10" stroke-width="0.6"/>
    <rect x="28" y="24" width="8" height="1.2" fill="#ffd86b"/>
    <rect x="28" y="30" width="8" height="1.2" fill="#ffd86b"/>
    <rect x="28" y="36" width="8" height="1.2" fill="#ffd86b"/>
    <!-- Beacon orb -->
    <circle cx="32" cy="22" r="6" fill="url(#orb)" stroke="#041c10" stroke-width="0.8"/>
    <circle cx="29" cy="20" r="2" fill="#e8fff0" opacity="0.8"/>
    <circle cx="32" cy="22" r="1.5" fill="#fff"/>
    <!-- Plus/medical cross on orb -->
    <g fill="#ffd86b" opacity="0.8">
      <rect x="31" y="19" width="2" height="6" rx="0.3"/>
      <rect x="29" y="21" width="6" height="2" rx="0.3"/>
    </g>
    <!-- Antenna spikes -->
    <line x1="32" y1="14" x2="32" y2="8" stroke="#8899bb" stroke-width="0.6"/>
    <circle cx="32" cy="7" r="1.2" fill="#ffd86b"/>
    <line x1="26" y1="16" x2="22" y2="12" stroke="#8899bb" stroke-width="0.4"/>
    <line x1="38" y1="16" x2="42" y2="12" stroke="#8899bb" stroke-width="0.4"/>
  </svg>`;

  // --- QUANT ADVISOR — AI investment tower, green/gold ---
  S.turret_quant = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <defs>
      <linearGradient id="case" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#6a5a30"/><stop offset="50%" stop-color="#3a3018"/><stop offset="100%" stop-color="#0c0a04"/></linearGradient>
      <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fff4a8"/><stop offset="50%" stop-color="#ffc040"/><stop offset="100%" stop-color="#6a3a00"/></linearGradient>
      <radialGradient id="coin" cx="40%" cy="35%"><stop offset="0%" stop-color="#ffffc0"/><stop offset="55%" stop-color="#ffc040"/><stop offset="100%" stop-color="#6a3a00"/></radialGradient>
      <radialGradient id="holo" cx="50%" cy="50%"><stop offset="0%" stop-color="#a8ffd8"/><stop offset="70%" stop-color="#4ade80"/><stop offset="100%" stop-color="#10804000"/></radialGradient>
      <linearGradient id="chart" x1="0" y1="1" x2="1" y2="0"><stop offset="0%" stop-color="#4ade80"/><stop offset="100%" stop-color="#ffd86b"/></linearGradient>
    </defs>
    <ellipse cx="32" cy="58" rx="24" ry="4" fill="#000" opacity="0.6"/>
    <ellipse cx="32" cy="56" rx="20" ry="3" fill="#4ade80" opacity="0.35"/>
    <!-- Floor plate -->
    <polygon points="10,52 22,42 42,42 54,52 42,60 22,60" fill="url(#case)" stroke="${P.rivet}" stroke-width="1.2" stroke-linejoin="round"/>
    <circle cx="14" cy="52" r="1.2" fill="${P.rivet}"/><circle cx="50" cy="52" r="1.2" fill="${P.rivet}"/>
    <circle cx="32" cy="52" r="2" fill="#4ade80"/>

    <!-- Briefcase body (investment vault) -->
    <rect x="16" y="34" width="32" height="16" rx="1.2" fill="url(#case)" stroke="#0a0804" stroke-width="1"/>
    <rect x="16" y="34" width="32" height="2" fill="#8a7040"/>
    <rect x="26" y="30" width="12" height="5" rx="1" fill="url(#case)" stroke="#0a0804" stroke-width="0.8"/>
    <rect x="28" y="32" width="8" height="1.5" fill="#1a1008"/>
    <!-- Gold lock/crest -->
    <circle cx="32" cy="41" r="3" fill="url(#gold)" stroke="#2a1404" stroke-width="0.6"/>
    <text x="32" y="43.5" font-family="monospace" font-weight="bold" font-size="5" text-anchor="middle" fill="#2a1404">$</text>
    <!-- Briefcase seam -->
    <rect x="17" y="41" width="30" height="0.8" fill="#1a1008"/>
    <!-- Coin stacks peeking out sides -->
    <g>
      <ellipse cx="14" cy="45" rx="3" ry="1.2" fill="url(#coin)" stroke="#4a2804" stroke-width="0.4"/>
      <ellipse cx="14" cy="43.5" rx="3" ry="1.2" fill="url(#coin)" stroke="#4a2804" stroke-width="0.4"/>
      <ellipse cx="14" cy="42" rx="3" ry="1.2" fill="url(#coin)" stroke="#4a2804" stroke-width="0.4"/>
      <ellipse cx="50" cy="45" rx="3" ry="1.2" fill="url(#coin)" stroke="#4a2804" stroke-width="0.4"/>
      <ellipse cx="50" cy="43.5" rx="3" ry="1.2" fill="url(#coin)" stroke="#4a2804" stroke-width="0.4"/>
    </g>

    <!-- Holographic AI chart above briefcase -->
    <rect x="14" y="6" width="36" height="22" rx="1" fill="#021810" stroke="#4ade80" stroke-width="0.8" opacity="0.95"/>
    <rect x="14" y="6" width="36" height="22" rx="1" fill="url(#holo)" opacity="0.15"/>
    <!-- Chart grid -->
    <g stroke="#083820" stroke-width="0.3" opacity="0.7">
      <line x1="17" y1="10" x2="47" y2="10"/>
      <line x1="17" y1="15" x2="47" y2="15"/>
      <line x1="17" y1="20" x2="47" y2="20"/>
      <line x1="17" y1="25" x2="47" y2="25"/>
      <line x1="22" y1="8" x2="22" y2="27"/>
      <line x1="28" y1="8" x2="28" y2="27"/>
      <line x1="34" y1="8" x2="34" y2="27"/>
      <line x1="40" y1="8" x2="40" y2="27"/>
    </g>
    <!-- Trending upward candlesticks -->
    <g>
      <line x1="19" y1="22" x2="19" y2="26" stroke="#4ade80" stroke-width="0.4"/>
      <rect x="18" y="23" width="2" height="2.5" fill="#4ade80"/>
      <line x1="23" y1="19" x2="23" y2="24" stroke="#4ade80" stroke-width="0.4"/>
      <rect x="22" y="20" width="2" height="3" fill="#4ade80"/>
      <line x1="27" y1="18" x2="27" y2="22" stroke="#4ade80" stroke-width="0.4"/>
      <rect x="26" y="19" width="2" height="2.5" fill="#4ade80"/>
      <line x1="31" y1="15" x2="31" y2="19" stroke="#ffd86b" stroke-width="0.4"/>
      <rect x="30" y="16" width="2" height="2.5" fill="#ffd86b"/>
      <line x1="35" y1="12" x2="35" y2="17" stroke="#ffd86b" stroke-width="0.4"/>
      <rect x="34" y="13" width="2" height="3" fill="#ffd86b"/>
      <line x1="39" y1="9" x2="39" y2="14" stroke="#ffd86b" stroke-width="0.4"/>
      <rect x="38" y="10" width="2" height="3.5" fill="#ffd86b"/>
      <line x1="43" y1="8" x2="43" y2="12" stroke="#ffd86b" stroke-width="0.4"/>
      <rect x="42" y="9" width="2" height="2.5" fill="#ffd86b"/>
    </g>
    <!-- Trend line connecting candle tops -->
    <polyline points="19,23 23,20 27,19 31,16 35,13 39,10 43,9" fill="none" stroke="url(#chart)" stroke-width="0.8"/>
    <!-- Up-arrow -->
    <path d="M 45,10 L 47,8 L 45,12 L 46,10 L 43,11 Z" fill="#ffd86b"/>
    <!-- "AI" label top-left -->
    <text x="17" y="12" font-family="monospace" font-weight="bold" font-size="4" fill="#4ade80" opacity="0.8">AI</text>
    <!-- Corner brackets (frame) -->
    <g stroke="#4ade80" stroke-width="0.5" fill="none">
      <path d="M 14,9 L 14,6 L 17,6"/>
      <path d="M 47,6 L 50,6 L 50,9"/>
      <path d="M 14,25 L 14,28 L 17,28"/>
      <path d="M 47,28 L 50,28 L 50,25"/>
    </g>

    <!-- Rising coin particles (static impression of income flow) -->
    <g>
      <circle cx="10" cy="38" r="1.6" fill="url(#coin)" stroke="#4a2804" stroke-width="0.3"/>
      <circle cx="10" cy="38" r="0.6" fill="#fff8c0"/>
      <circle cx="54" cy="36" r="1.4" fill="url(#coin)" stroke="#4a2804" stroke-width="0.3"/>
      <circle cx="54" cy="36" r="0.5" fill="#fff8c0"/>
      <circle cx="8" cy="30" r="1.2" fill="url(#coin)" opacity="0.7"/>
      <circle cx="56" cy="28" r="1.1" fill="url(#coin)" opacity="0.7"/>
    </g>

    <!-- AI sensor eye on top -->
    <rect x="30" y="2" width="4" height="4" rx="0.5" fill="#0a3020" stroke="#4ade80" stroke-width="0.5"/>
    <circle cx="32" cy="4" r="1.2" fill="#4ade80"/>
    <circle cx="32" cy="4" r="0.5" fill="#fff"/>
  </svg>`;

  // ==================================================================
  //  ENEMIES
  // ==================================================================

  // Meteor shared gradient colors baked into each sprite.

  S.meteor_tiny = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
    <defs>
      <radialGradient id="r" cx="35%" cy="30%"><stop offset="0%" stop-color="#e0a078"/><stop offset="55%" stop-color="#8a4a28"/><stop offset="100%" stop-color="#2a0e02"/></radialGradient>
      <radialGradient id="e" cx="50%" cy="50%"><stop offset="0%" stop-color="#ffc870"/><stop offset="100%" stop-color="#ff400000"/></radialGradient>
    </defs>
    <circle cx="16" cy="16" r="14" fill="url(#e)" opacity="0.4"/>
    <polygon points="16,4 22,6 24,12 22,20 16,24 8,20 6,12 10,6" fill="url(#r)" stroke="#1a0802" stroke-width="0.8"/>
    <polyline points="8,20 16,24 22,20" fill="none" stroke="#2a0e02" stroke-width="0.3" opacity="0.6"/>
    <polyline points="10,6 16,4 22,6" fill="none" stroke="#ffc890" stroke-width="0.6" opacity="0.6"/>
    <circle cx="12" cy="12" r="2" fill="#3a1808" stroke="#1a0802" stroke-width="0.4"/>
    <circle cx="19" cy="17" r="1.6" fill="#3a1808"/>
    <circle cx="14" cy="18" r="0.8" fill="#2a0e02"/>
    <path d="M 14,12 L 17,16" stroke="#ff8040" stroke-width="0.6" stroke-linecap="round"/>
    <circle cx="17" cy="16" r="1" fill="#ff8040" opacity="0.8"/>
  </svg>`;

  S.meteor_small = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
    <defs>
      <radialGradient id="r" cx="30%" cy="25%"><stop offset="0%" stop-color="#e0a078"/><stop offset="45%" stop-color="#a86a44"/><stop offset="100%" stop-color="#2a0e02"/></radialGradient>
      <radialGradient id="c" cx="40%" cy="30%"><stop offset="0%" stop-color="#2a0a02"/><stop offset="100%" stop-color="#7a3e20"/></radialGradient>
      <radialGradient id="e" cx="50%" cy="50%"><stop offset="0%" stop-color="#ffc870"/><stop offset="100%" stop-color="#ff400000"/></radialGradient>
      <linearGradient id="k" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#fff4a0"/><stop offset="100%" stop-color="#ff2a00"/></linearGradient>
    </defs>
    <circle cx="24" cy="24" r="24" fill="url(#e)" opacity="0.45"/>
    <polygon points="24,4 32,7 38,13 40,21 36,32 28,38 18,38 10,32 6,21 9,13 15,7" fill="url(#r)" stroke="#1a0802" stroke-width="1"/>
    <polyline points="15,7 24,4 32,7 38,13" fill="none" stroke="#ffc890" stroke-width="0.8" opacity="0.7"/>
    <ellipse cx="16" cy="18" rx="4" ry="3" fill="url(#c)" stroke="#1a0802" stroke-width="0.5"/>
    <ellipse cx="16" cy="19" rx="2.5" ry="1.5" fill="#0a0400" opacity="0.7"/>
    <ellipse cx="30" cy="24" rx="3" ry="2.5" fill="url(#c)"/>
    <circle cx="22" cy="30" r="2" fill="url(#c)"/>
    <circle cx="34" cy="14" r="1.2" fill="url(#c)"/>
    <path d="M 20,14 L 24,20 L 30,26" fill="none" stroke="url(#k)" stroke-width="1" stroke-linecap="round"/>
    <circle cx="24" cy="20" r="1.8" fill="#ff8040" opacity="0.85"/>
    <ellipse cx="18" cy="10" rx="3" ry="1.5" fill="#ffe4c0" opacity="0.5" transform="rotate(-20 18 10)"/>
  </svg>`;

  S.meteor_med = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <defs>
      <radialGradient id="r" cx="30%" cy="25%"><stop offset="0%" stop-color="#ffc890"/><stop offset="40%" stop-color="#a86a44"/><stop offset="100%" stop-color="#1a0a02"/></radialGradient>
      <radialGradient id="c" cx="40%" cy="30%"><stop offset="0%" stop-color="#2a0a02"/><stop offset="100%" stop-color="#7a3e20"/></radialGradient>
      <radialGradient id="e" cx="50%" cy="50%"><stop offset="0%" stop-color="#ffc870"/><stop offset="100%" stop-color="#ff400000"/></radialGradient>
      <linearGradient id="k" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#fff4a0"/><stop offset="100%" stop-color="#ff2a00"/></linearGradient>
    </defs>
    <circle cx="32" cy="32" r="32" fill="url(#e)" opacity="0.4"/>
    <polygon points="32,4 42,7 50,13 55,22 56,34 50,45 42,52 30,55 18,52 10,45 5,34 6,22 11,13 19,7" fill="url(#r)" stroke="#1a0a02" stroke-width="1.2"/>
    <polyline points="19,7 32,4 42,7 50,13 55,22" fill="none" stroke="#ffd8a0" stroke-width="1" opacity="0.7"/>
    <polyline points="5,34 10,45" fill="none" stroke="#1a0a02" stroke-width="0.6" opacity="0.5"/>
    <ellipse cx="20" cy="22" rx="5" ry="4" fill="url(#c)" stroke="#1a0a02" stroke-width="0.5"/>
    <ellipse cx="20" cy="23" rx="3.5" ry="2" fill="#0a0400" opacity="0.7"/>
    <ellipse cx="40" cy="30" rx="4.5" ry="3.5" fill="url(#c)" stroke="#1a0a02" stroke-width="0.4"/>
    <circle cx="40" cy="30" r="2" fill="#0a0400" opacity="0.6"/>
    <ellipse cx="28" cy="42" rx="3" ry="2.2" fill="url(#c)"/>
    <circle cx="14" cy="38" r="2" fill="url(#c)"/>
    <circle cx="48" cy="42" r="1.5" fill="url(#c)"/>
    <circle cx="46" cy="16" r="1.6" fill="url(#c)"/>
    <path d="M 18,30 L 26,34 L 34,40 L 40,48" fill="none" stroke="url(#k)" stroke-width="1.3" stroke-linecap="round"/>
    <path d="M 26,34 L 20,40" fill="none" stroke="url(#k)" stroke-width="0.8"/>
    <circle cx="26" cy="34" r="2.5" fill="#ff8040" opacity="0.85"/>
    <circle cx="34" cy="40" r="1.8" fill="#ff8040" opacity="0.8"/>
    <ellipse cx="22" cy="12" rx="5" ry="2" fill="#ffe4c0" opacity="0.45" transform="rotate(-20 22 12)"/>
    <circle cx="10" cy="26" r="1" fill="#3a1808"/>
    <circle cx="52" cy="38" r="0.8" fill="#3a1808"/>
  </svg>`;

  S.meteor_big = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
    <defs>
      <radialGradient id="r" cx="30%" cy="25%"><stop offset="0%" stop-color="#ffc890"/><stop offset="40%" stop-color="#a86a44"/><stop offset="100%" stop-color="#1a0a02"/></radialGradient>
      <radialGradient id="c" cx="40%" cy="30%"><stop offset="0%" stop-color="#2a0a02"/><stop offset="100%" stop-color="#7a3e20"/></radialGradient>
      <radialGradient id="e" cx="50%" cy="50%"><stop offset="0%" stop-color="#ffc870"/><stop offset="100%" stop-color="#ff400000"/></radialGradient>
      <linearGradient id="k" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#fff4a0"/><stop offset="100%" stop-color="#ff2a00"/></linearGradient>
    </defs>
    <circle cx="48" cy="48" r="48" fill="url(#e)" opacity="0.4"/>
    <polygon points="48,4 62,8 74,16 82,28 85,42 82,58 74,72 60,82 44,85 28,82 14,72 6,58 3,42 6,28 14,16 30,8" fill="url(#r)" stroke="#1a0a02" stroke-width="1.4"/>
    <polyline points="30,8 48,4 62,8 74,16 82,28" fill="none" stroke="#ffd8a0" stroke-width="1.2" opacity="0.7"/>
    <polyline points="3,42 6,58 14,72" fill="none" stroke="#1a0a02" stroke-width="0.8" opacity="0.5"/>
    <ellipse cx="26" cy="30" rx="8" ry="6" fill="url(#c)" stroke="#1a0a02" stroke-width="0.7"/>
    <ellipse cx="26" cy="31" rx="6" ry="3.5" fill="#0a0400" opacity="0.7"/>
    <path d="M 22,26 Q 26,23 30,26" fill="none" stroke="#ffc890" stroke-width="0.8" opacity="0.6"/>
    <ellipse cx="62" cy="42" rx="10" ry="7" fill="url(#c)" stroke="#1a0a02" stroke-width="0.7"/>
    <ellipse cx="62" cy="44" rx="7" ry="4" fill="#0a0400" opacity="0.7"/>
    <circle cx="62" cy="44" r="2" fill="#1a0802"/>
    <ellipse cx="40" cy="64" rx="6" ry="4" fill="url(#c)" stroke="#1a0a02" stroke-width="0.5"/>
    <circle cx="40" cy="64" r="2.5" fill="#0a0400" opacity="0.6"/>
    <circle cx="20" cy="58" r="3.5" fill="url(#c)"/>
    <circle cx="72" cy="66" r="2.8" fill="url(#c)"/>
    <circle cx="68" cy="22" r="2" fill="url(#c)"/>
    <path d="M 28,44 L 38,50 L 46,58 L 52,66 L 58,72" fill="none" stroke="url(#k)" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M 38,50 L 30,56" fill="none" stroke="url(#k)" stroke-width="1.2" stroke-linecap="round"/>
    <path d="M 46,58 L 54,52" fill="none" stroke="url(#k)" stroke-width="1" stroke-linecap="round"/>
    <circle cx="38" cy="50" r="3" fill="#ff8040" opacity="0.85"/>
    <circle cx="52" cy="66" r="2.5" fill="#ff8040" opacity="0.85"/>
    <circle cx="30" cy="56" r="1.5" fill="#ff8040" opacity="0.75"/>
    <ellipse cx="32" cy="16" rx="8" ry="3" fill="#ffe4c0" opacity="0.45" transform="rotate(-20 32 16)"/>
    <circle cx="10" cy="38" r="1.2" fill="#3a1808"/>
    <circle cx="78" cy="52" r="1" fill="#3a1808"/>
    <circle cx="48" cy="80" r="1.4" fill="#3a1808"/>
    <path d="M 62,80 L 66,76" stroke="#1a0a02" stroke-width="0.7"/>
    <path d="M 14,52 L 18,48" stroke="#1a0a02" stroke-width="0.5"/>
  </svg>`;

  // --- UFO (fast scout) ---
  S.ufo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 56">
    <defs>
      <radialGradient id="dm" cx="40%" cy="30%"><stop offset="0%" stop-color="#d4faff"/><stop offset="50%" stop-color="#4fc8ff"/><stop offset="100%" stop-color="#0a4066"/></radialGradient>
      <linearGradient id="hull" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#a0b8d8"/><stop offset="50%" stop-color="#404860"/><stop offset="100%" stop-color="#0a1020"/></linearGradient>
      <radialGradient id="bm" cx="50%" cy="0%"><stop offset="0%" stop-color="#7ae0ffaa"/><stop offset="100%" stop-color="#7ae0ff00"/></radialGradient>
    </defs>
    <path d="M 20,36 L 44,36 L 54,56 L 10,56 Z" fill="url(#bm)" opacity="0.7"/>
    <ellipse cx="32" cy="48" rx="22" ry="3" fill="#000" opacity="0.35"/>
    <ellipse cx="32" cy="36" rx="28" ry="6" fill="url(#hull)" stroke="#0a1020" stroke-width="1"/>
    <ellipse cx="32" cy="38" rx="22" ry="3" fill="#0a1020" opacity="0.4"/>
    <ellipse cx="24" cy="33" rx="14" ry="1.8" fill="#d8e4f8" opacity="0.5"/>
    <circle cx="12" cy="37" r="1.2" fill="${P.magenta}"/>
    <circle cx="22" cy="39" r="1.2" fill="${P.cyan}"/>
    <circle cx="32" cy="40" r="1.2" fill="${P.magenta}"/>
    <circle cx="42" cy="39" r="1.2" fill="${P.cyan}"/>
    <circle cx="52" cy="37" r="1.2" fill="${P.magenta}"/>
    <ellipse cx="32" cy="26" rx="14" ry="11" fill="url(#dm)" stroke="${P.cyan}" stroke-width="1"/>
    <path d="M 24,22 Q 28,16 36,16 Q 30,18 28,22 Q 26,24 24,24 Z" fill="#fff" opacity="0.65"/>
    <ellipse cx="32" cy="26" rx="14" ry="11" fill="none" stroke="${P.cyan}" stroke-width="0.4" opacity="0.4"/>
    <line x1="32" y1="15" x2="32" y2="37" stroke="${P.cyan}" stroke-width="0.4" opacity="0.4"/>
    <circle cx="32" cy="26" r="3" fill="#1a0a2a" opacity="0.75"/>
    <circle cx="30.5" cy="25" r="0.8" fill="${P.magenta}"/>
    <circle cx="33.5" cy="25" r="0.8" fill="${P.magenta}"/>
    <line x1="32" y1="15" x2="32" y2="8" stroke="#8899bb" stroke-width="0.7"/>
    <circle cx="32" cy="7" r="1.4" fill="${P.magenta}"/>
    <circle cx="32" cy="37" r="2.5" fill="#0a1428" stroke="${P.cyan}" stroke-width="0.5"/>
    <circle cx="32" cy="37" r="1.2" fill="${P.cyan}"/>
  </svg>`;

  // --- ELITE (armored metallic rock) ---
  S.elite = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">
    <defs>
      <radialGradient id="arm" cx="30%" cy="25%"><stop offset="0%" stop-color="#f0f4ff"/><stop offset="45%" stop-color="#7886a8"/><stop offset="100%" stop-color="#0a0e1a"/></radialGradient>
      <radialGradient id="ax" cx="50%" cy="50%"><stop offset="0%" stop-color="#ffd86b88"/><stop offset="100%" stop-color="#ffd86b00"/></radialGradient>
      <linearGradient id="pl" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#a8b8d8"/><stop offset="100%" stop-color="#2a3048"/></linearGradient>
      <radialGradient id="eye" cx="50%" cy="50%"><stop offset="0%" stop-color="#fff"/><stop offset="50%" stop-color="#ffd86b"/><stop offset="100%" stop-color="#ff8040"/></radialGradient>
    </defs>
    <circle cx="40" cy="40" r="38" fill="url(#ax)" opacity="0.5"/>
    <polygon points="40,6 52,10 62,18 68,28 70,40 66,52 56,64 42,70 28,68 16,60 8,48 6,34 12,22 22,12" fill="url(#arm)" stroke="#05080f" stroke-width="1.4"/>
    <polygon points="40,6 52,10 46,18 40,22 34,20 28,14" fill="url(#pl)" stroke="#05080f" stroke-width="0.7"/>
    <polygon points="62,18 68,28 60,32 54,26 56,18" fill="url(#pl)" stroke="#05080f" stroke-width="0.7"/>
    <polygon points="70,40 66,52 58,50 56,42 62,36" fill="url(#pl)" stroke="#05080f" stroke-width="0.7"/>
    <polygon points="42,70 28,68 30,58 40,54 44,62" fill="url(#pl)" stroke="#05080f" stroke-width="0.7"/>
    <polygon points="6,34 12,22 22,26 20,36 10,38" fill="url(#pl)" stroke="#05080f" stroke-width="0.7"/>
    <polyline points="22,12 40,6 52,10 62,18" fill="none" stroke="#e8eeff" stroke-width="1" opacity="0.7"/>
    <circle cx="20" cy="16" r="1.3" fill="${P.rivet}"/><circle cx="60" cy="14" r="1.3" fill="${P.rivet}"/>
    <circle cx="68" cy="32" r="1.3" fill="${P.rivet}"/><circle cx="66" cy="52" r="1.3" fill="${P.rivet}"/>
    <circle cx="24" cy="64" r="1.3" fill="${P.rivet}"/><circle cx="10" cy="44" r="1.3" fill="${P.rivet}"/>
    <circle cx="40" cy="38" r="7" fill="#0a0410" stroke="${P.rivet}" stroke-width="1"/>
    <circle cx="40" cy="38" r="4" fill="url(#eye)"/>
    <circle cx="40" cy="38" r="1.6" fill="#fff"/>
    <line x1="28" y1="30" x2="34" y2="32" stroke="${P.rivet}" stroke-width="0.5"/>
    <line x1="52" y1="30" x2="46" y2="32" stroke="${P.rivet}" stroke-width="0.5"/>
    <line x1="30" y1="50" x2="36" y2="48" stroke="${P.rivet}" stroke-width="0.5"/>
    <line x1="50" y1="50" x2="44" y2="48" stroke="${P.rivet}" stroke-width="0.5"/>
    <path d="M 20,28 L 26,24" stroke="#0a0e1a" stroke-width="0.7"/>
    <path d="M 60,30 L 56,26" stroke="#0a0e1a" stroke-width="0.7"/>
    <path d="M 62,56 L 58,52" stroke="#0a0e1a" stroke-width="0.7"/>
  </svg>`;

  // --- BOSS (massive dreadnought core) ---
  S.boss = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
    <defs>
      <radialGradient id="body" cx="50%" cy="45%"><stop offset="0%" stop-color="#ff7a8c"/><stop offset="40%" stop-color="#c01832"/><stop offset="100%" stop-color="#2a0208"/></radialGradient>
      <radialGradient id="cr" cx="50%" cy="50%"><stop offset="0%" stop-color="#fff"/><stop offset="30%" stop-color="#ffd86b"/><stop offset="70%" stop-color="#ff4020"/><stop offset="100%" stop-color="#4a0004"/></radialGradient>
      <linearGradient id="wing" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#6a2030"/><stop offset="100%" stop-color="#1a0208"/></linearGradient>
      <radialGradient id="aura" cx="50%" cy="50%"><stop offset="0%" stop-color="#ff405088"/><stop offset="100%" stop-color="#ff405000"/></radialGradient>
    </defs>
    <circle cx="64" cy="64" r="62" fill="url(#aura)" opacity="0.5"/>
    <g transform="translate(64,64)">
      <g>
        <ellipse cx="-36" cy="0" rx="14" ry="30" fill="url(#wing)" stroke="#0a0004" stroke-width="1" transform="rotate(-15)"/>
        <ellipse cx="36" cy="0" rx="14" ry="30" fill="url(#wing)" stroke="#0a0004" stroke-width="1" transform="rotate(15)"/>
      </g>
      <path d="M -50,-20 L -36,-18 L -30,-8" fill="none" stroke="${P.rivet}" stroke-width="0.8" opacity="0.6"/>
      <path d="M 50,-20 L 36,-18 L 30,-8" fill="none" stroke="${P.rivet}" stroke-width="0.8" opacity="0.6"/>
      <circle cx="0" cy="0" r="48" fill="url(#body)" stroke="#2a0208" stroke-width="1.5"/>
      <circle cx="0" cy="0" r="48" fill="none" stroke="${P.hot}" stroke-width="0.6" opacity="0.4"/>
      <circle cx="0" cy="0" r="40" fill="none" stroke="#2a0208" stroke-width="0.8" opacity="0.7"/>
      <g stroke="#2a0208" stroke-width="1" fill="none" opacity="0.8">
        <line x1="0" y1="-48" x2="0" y2="-10"/>
        <line x1="0" y1="48" x2="0" y2="10"/>
        <line x1="-48" y1="0" x2="-10" y2="0"/>
        <line x1="48" y1="0" x2="10" y2="0"/>
        <line x1="-34" y1="-34" x2="-7" y2="-7"/>
        <line x1="34" y1="-34" x2="7" y2="-7"/>
        <line x1="-34" y1="34" x2="-7" y2="7"/>
        <line x1="34" y1="34" x2="7" y2="7"/>
      </g>
      <g fill="${P.rivet}">
        <circle cx="-38" cy="0" r="1.5"/><circle cx="38" cy="0" r="1.5"/>
        <circle cx="0" cy="-38" r="1.5"/><circle cx="0" cy="38" r="1.5"/>
        <circle cx="-27" cy="-27" r="1.3"/><circle cx="27" cy="-27" r="1.3"/>
        <circle cx="-27" cy="27" r="1.3"/><circle cx="27" cy="27" r="1.3"/>
      </g>
      <g fill="${P.hot}">
        <rect x="-44" y="-8" width="4" height="16" rx="1"/>
        <rect x="40" y="-8" width="4" height="16" rx="1"/>
        <rect x="-8" y="-44" width="16" height="4" rx="1"/>
        <rect x="-8" y="40" width="16" height="4" rx="1"/>
      </g>
      <circle cx="0" cy="0" r="14" fill="#0a0004" stroke="${P.hot}" stroke-width="1"/>
      <circle cx="0" cy="0" r="10" fill="url(#cr)"/>
      <circle cx="0" cy="0" r="5" fill="#fff"/>
      <circle cx="0" cy="0" r="2" fill="#ffffd0"/>
      <circle cx="-22" cy="-22" r="3" fill="#fff" opacity="0.5"/>
    </g>
  </svg>`;

  // ==================================================================
  //  PROJECTILES / FX
  // ==================================================================

  S.bolt = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 16">
    <defs>
      <radialGradient id="c" cx="70%" cy="50%"><stop offset="0%" stop-color="#fff"/><stop offset="35%" stop-color="#fff4c0"/><stop offset="70%" stop-color="#ff8040"/><stop offset="100%" stop-color="#ff200000"/></radialGradient>
      <linearGradient id="t" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#ff602000"/><stop offset="100%" stop-color="#ffa060cc"/></linearGradient>
    </defs>
    <path d="M 0,8 L 18,5 L 20,8 L 18,11 Z" fill="url(#t)"/>
    <circle cx="22" cy="8" r="7" fill="url(#c)" opacity="0.7"/>
    <circle cx="22" cy="8" r="3.5" fill="#fff4c0"/>
    <circle cx="22" cy="8" r="1.2" fill="#fff"/>
    <line x1="14" y1="8" x2="30" y2="8" stroke="#fff" stroke-width="0.4" opacity="0.7"/>
  </svg>`;

  S.plasma = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 24">
    <defs>
      <radialGradient id="c" cx="70%" cy="50%"><stop offset="0%" stop-color="#fff"/><stop offset="30%" stop-color="#ffd86b"/><stop offset="65%" stop-color="#ff4020"/><stop offset="100%" stop-color="#ff200000"/></radialGradient>
      <linearGradient id="t" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#ff200000"/><stop offset="100%" stop-color="#ffa060dd"/></linearGradient>
      <radialGradient id="h" cx="50%" cy="50%"><stop offset="0%" stop-color="#ff804088"/><stop offset="100%" stop-color="#ff402000"/></radialGradient>
    </defs>
    <path d="M 0,12 L 22,7 L 26,12 L 22,17 Z" fill="url(#t)" opacity="0.8"/>
    <circle cx="28" cy="12" r="10" fill="url(#h)"/>
    <circle cx="28" cy="12" r="6" fill="url(#c)"/>
    <circle cx="28" cy="12" r="2.5" fill="#fff"/>
    <line x1="18" y1="12" x2="38" y2="12" stroke="#fff" stroke-width="0.5" opacity="0.65"/>
    <line x1="28" y1="4" x2="28" y2="20" stroke="#fff" stroke-width="0.3" opacity="0.5"/>
  </svg>`;

  // ==================================================================
  //  PHASE 2 — NEW TOWERS
  // ==================================================================

  // --- SNIPER PLATFORM — long single-shot rail, slate gray with glowing scope ---
  S.turret_sniper = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <defs>
      <radialGradient id="d" cx="50%" cy="40%"><stop offset="0%" stop-color="#d8e0f0"/><stop offset="50%" stop-color="#5a6680"/><stop offset="100%" stop-color="#0a0e18"/></radialGradient>
      <linearGradient id="bar" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#a0a8c0"/><stop offset="100%" stop-color="#1a1e2a"/></linearGradient>
      <radialGradient id="scope" cx="50%" cy="50%"><stop offset="0%" stop-color="#fff"/><stop offset="40%" stop-color="#7ae0ff"/><stop offset="100%" stop-color="#7ae0ff00"/></radialGradient>
    </defs>
    <ellipse cx="32" cy="58" rx="22" ry="4" fill="#000" opacity="0.55"/>
    <rect x="6" y="28" width="48" height="8" rx="3" fill="url(#bar)" stroke="#0a0e18" stroke-width="1"/>
    <circle cx="32" cy="32" r="14" fill="url(#d)" stroke="#0a0e18" stroke-width="1.4"/>
    <rect x="28" y="14" width="8" height="20" rx="1.5" fill="#202838" stroke="#0a0e18" stroke-width="1"/>
    <circle cx="32" cy="18" r="3" fill="url(#scope)"/>
    <circle cx="32" cy="18" r="1" fill="#fff"/>
    <line x1="6" y1="32" x2="58" y2="32" stroke="#7ae0ff" stroke-width="0.6" opacity="0.7"/>
    <circle cx="32" cy="40" r="3" fill="#9aa6c0" stroke="#0a0e18" stroke-width="1"/>
  </svg>`;

  // --- ENGINEER STATION — boxy chassis with mine drop & sentry barrels ---
  S.turret_engineer = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <defs>
      <linearGradient id="hull" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#d8a060"/><stop offset="100%" stop-color="#3a2208"/></linearGradient>
      <linearGradient id="plate" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#a87a40"/><stop offset="100%" stop-color="#1a0e04"/></linearGradient>
    </defs>
    <ellipse cx="32" cy="58" rx="22" ry="4" fill="#000" opacity="0.55"/>
    <rect x="10" y="22" width="44" height="22" rx="3" fill="url(#hull)" stroke="#0a0e18" stroke-width="1.4"/>
    <rect x="14" y="26" width="36" height="6" fill="url(#plate)" opacity="0.8"/>
    <circle cx="20" cy="40" r="3" fill="#ffd86b" stroke="#0a0e18" stroke-width="0.8"/>
    <circle cx="32" cy="40" r="3" fill="#ffd86b" stroke="#0a0e18" stroke-width="0.8"/>
    <circle cx="44" cy="40" r="3" fill="#ffd86b" stroke="#0a0e18" stroke-width="0.8"/>
    <rect x="22" y="14" width="6" height="14" rx="1" fill="#5a4020" stroke="#0a0e18" stroke-width="1"/>
    <rect x="36" y="14" width="6" height="14" rx="1" fill="#5a4020" stroke="#0a0e18" stroke-width="1"/>
    <circle cx="25" cy="14" r="1.5" fill="#ff5530"/>
    <circle cx="39" cy="14" r="1.5" fill="#ff5530"/>
    <line x1="14" y1="48" x2="50" y2="48" stroke="#ffd86b" stroke-width="1.2" opacity="0.7"/>
  </svg>`;

  // --- CRYO STATION — frosted dome with crystal spires ---
  S.turret_cryo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <defs>
      <radialGradient id="dome" cx="50%" cy="35%"><stop offset="0%" stop-color="#ffffff"/><stop offset="50%" stop-color="#a8e8ff"/><stop offset="100%" stop-color="#1a4060"/></radialGradient>
      <linearGradient id="cryst" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#e8faff"/><stop offset="100%" stop-color="#5aa0c8"/></linearGradient>
    </defs>
    <ellipse cx="32" cy="58" rx="22" ry="4" fill="#000" opacity="0.55"/>
    <ellipse cx="32" cy="56" rx="20" ry="3" fill="#a8e8ff" opacity="0.3"/>
    <circle cx="32" cy="36" r="18" fill="url(#dome)" stroke="#0a2030" stroke-width="1.4"/>
    <polygon points="32,8 28,28 36,28" fill="url(#cryst)" stroke="#0a2030" stroke-width="1"/>
    <polygon points="20,18 16,32 24,32" fill="url(#cryst)" stroke="#0a2030" stroke-width="1" opacity="0.85"/>
    <polygon points="44,18 40,32 48,32" fill="url(#cryst)" stroke="#0a2030" stroke-width="1" opacity="0.85"/>
    <circle cx="32" cy="36" r="4" fill="#ffffff" opacity="0.9"/>
    <circle cx="28" cy="32" r="1.5" fill="#fff"/>
    <line x1="14" y1="40" x2="50" y2="40" stroke="#a8e8ff" stroke-width="0.6" opacity="0.65"/>
  </svg>`;

  // --- CHRONO FIELD — orbital rings with central jewel core ---
  S.turret_chrono = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <defs>
      <radialGradient id="core" cx="50%" cy="50%"><stop offset="0%" stop-color="#fff"/><stop offset="40%" stop-color="#c8a8ff"/><stop offset="100%" stop-color="#3a1a60"/></radialGradient>
      <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#c8a8ff"/><stop offset="100%" stop-color="#5a3aa0"/></linearGradient>
    </defs>
    <ellipse cx="32" cy="58" rx="22" ry="4" fill="#000" opacity="0.55"/>
    <ellipse cx="32" cy="32" rx="26" ry="9" fill="none" stroke="url(#ring)" stroke-width="2.2" opacity="0.85"/>
    <ellipse cx="32" cy="32" rx="9" ry="26" fill="none" stroke="url(#ring)" stroke-width="2.2" opacity="0.7"/>
    <ellipse cx="32" cy="32" rx="22" ry="22" fill="none" stroke="#c8a8ff" stroke-width="1" stroke-dasharray="3 4" opacity="0.65"/>
    <circle cx="32" cy="32" r="9" fill="url(#core)" stroke="#0a0a18" stroke-width="1.2"/>
    <polygon points="32,24 36,32 32,40 28,32" fill="#fff" opacity="0.85"/>
    <circle cx="32" cy="32" r="2" fill="#fff"/>
    <circle cx="58" cy="32" r="2.5" fill="#c8a8ff"/>
    <circle cx="6"  cy="32" r="2.5" fill="#c8a8ff"/>
    <circle cx="32" cy="58" r="2.5" fill="#c8a8ff"/>
    <circle cx="32" cy="6"  r="2.5" fill="#c8a8ff"/>
  </svg>`;

  // --- MORTAR BATTERY — squat artillery with skyward tube + sandbag base ---
  S.turret_mortar = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <defs>
      <linearGradient id="hull" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#c8945a"/><stop offset="100%" stop-color="#3a2010"/></linearGradient>
      <linearGradient id="tube" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#c8c8d8"/><stop offset="50%" stop-color="#5a6678"/><stop offset="100%" stop-color="#1a1e2a"/></linearGradient>
      <radialGradient id="muzzle" cx="50%" cy="50%"><stop offset="0%" stop-color="#fff"/><stop offset="40%" stop-color="#ff8a40"/><stop offset="100%" stop-color="#ff204000"/></radialGradient>
      <linearGradient id="sand" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#d8a878"/><stop offset="100%" stop-color="#5a3814"/></linearGradient>
    </defs>
    <ellipse cx="32" cy="58" rx="24" ry="4" fill="#000" opacity="0.55"/>
    <ellipse cx="14" cy="50" rx="9" ry="6" fill="url(#sand)" stroke="#1a0a04" stroke-width="0.8"/>
    <ellipse cx="50" cy="50" rx="9" ry="6" fill="url(#sand)" stroke="#1a0a04" stroke-width="0.8"/>
    <ellipse cx="22" cy="55" rx="7" ry="4" fill="url(#sand)" stroke="#1a0a04" stroke-width="0.8"/>
    <ellipse cx="42" cy="55" rx="7" ry="4" fill="url(#sand)" stroke="#1a0a04" stroke-width="0.8"/>
    <line x1="9" y1="50" x2="55" y2="50" stroke="#3a2010" stroke-width="0.6" opacity="0.6"/>
    <polygon points="14,46 22,38 42,38 50,46 42,52 22,52" fill="url(#hull)" stroke="#1a0a04" stroke-width="1.2" stroke-linejoin="round"/>
    <circle cx="18" cy="46" r="1.2" fill="#ffd86b"/>
    <circle cx="46" cy="46" r="1.2" fill="#ffd86b"/>
    <circle cx="32" cy="48" r="2.5" fill="#ff8040" stroke="#1a0a04" stroke-width="0.8"/>
    <ellipse cx="32" cy="36" rx="11" ry="6" fill="#2a1a0a" stroke="#1a0a04" stroke-width="1"/>
    <rect x="26" y="6" width="12" height="32" rx="3" fill="url(#tube)" stroke="#0a0e18" stroke-width="1.2"/>
    <rect x="26" y="14" width="12" height="1.5" fill="#10141e"/>
    <rect x="26" y="22" width="12" height="1.5" fill="#10141e"/>
    <rect x="26" y="30" width="12" height="1.5" fill="#10141e"/>
    <ellipse cx="32" cy="6" rx="6" ry="2.5" fill="url(#muzzle)"/>
    <ellipse cx="32" cy="6" rx="3" ry="1" fill="#fff" opacity="0.85"/>
    <rect x="30.2" y="10" width="1.5" height="22" fill="#dde4f0" opacity="0.5"/>
  </svg>`;

  // --- CRYSTAL PRISM — magenta crystal cluster with refractive faces ---
  S.turret_crystal = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <defs>
      <linearGradient id="cf1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ffd0e8"/><stop offset="50%" stop-color="#ff80c8"/><stop offset="100%" stop-color="#5a1858"/></linearGradient>
      <linearGradient id="cf2" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#ffe8f4"/><stop offset="100%" stop-color="#a040a0"/></linearGradient>
      <linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#5a3a78"/><stop offset="100%" stop-color="#1a0a2e"/></linearGradient>
      <radialGradient id="core" cx="50%" cy="50%"><stop offset="0%" stop-color="#fff"/><stop offset="35%" stop-color="#ff4fd8"/><stop offset="100%" stop-color="#5a1858"/></radialGradient>
    </defs>
    <ellipse cx="32" cy="58" rx="22" ry="4" fill="#000" opacity="0.55"/>
    <polygon points="14,52 22,42 42,42 50,52 42,60 22,60" fill="url(#b)" stroke="#ff80c8" stroke-width="1.2" stroke-linejoin="round"/>
    <circle cx="18" cy="52" r="1.1" fill="#ffd86b"/><circle cx="46" cy="52" r="1.1" fill="#ffd86b"/>
    <circle cx="32" cy="52" r="2" fill="#ff4fd8"/>
    <polygon points="32,4 24,16 24,38 32,46 40,38 40,16" fill="url(#cf1)" stroke="#1a0a2e" stroke-width="1.3" stroke-linejoin="round"/>
    <polygon points="32,4 32,46 40,38 40,16" fill="url(#cf2)" opacity="0.7"/>
    <polygon points="24,16 32,12 40,16 32,20" fill="#ffe8f4" opacity="0.85"/>
    <line x1="32" y1="12" x2="32" y2="44" stroke="#ffe8f4" stroke-width="0.6" opacity="0.7"/>
    <polygon points="14,28 8,32 14,36 16,32" fill="url(#cf1)" stroke="#1a0a2e" stroke-width="1"/>
    <polygon points="50,28 56,32 50,36 48,32" fill="url(#cf1)" stroke="#1a0a2e" stroke-width="1"/>
    <circle cx="32" cy="28" r="5" fill="url(#core)"/>
    <circle cx="32" cy="28" r="1.6" fill="#fff"/>
    <line x1="14" y1="46" x2="50" y2="46" stroke="#ff80c8" stroke-width="0.6" opacity="0.6"/>
  </svg>`;

  // ==================================================================
  //  PHASE 2 — NEW ENEMIES
  // ==================================================================

  // --- SWARMER — tiny fast triangular bug, blue glow ---
  S.enemy_swarmer = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
    <defs>
      <radialGradient id="g" cx="50%" cy="50%"><stop offset="0%" stop-color="#d8faff"/><stop offset="60%" stop-color="#4fa6ff"/><stop offset="100%" stop-color="#0a3060"/></radialGradient>
    </defs>
    <ellipse cx="16" cy="28" rx="9" ry="2" fill="#000" opacity="0.5"/>
    <polygon points="16,4 28,24 16,20 4,24" fill="url(#g)" stroke="#0a1830" stroke-width="1"/>
    <circle cx="16" cy="14" r="3" fill="#fff" opacity="0.9"/>
    <circle cx="16" cy="14" r="1" fill="#7ae0ff"/>
    <line x1="10" y1="22" x2="6" y2="28" stroke="#7ae0ff" stroke-width="1.4" stroke-linecap="round"/>
    <line x1="22" y1="22" x2="26" y2="28" stroke="#7ae0ff" stroke-width="1.4" stroke-linecap="round"/>
  </svg>`;

  // --- SUMMONER — bulbous carrier with glowing belly + spawn pods ---
  S.enemy_summoner = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <defs>
      <radialGradient id="body" cx="50%" cy="40%"><stop offset="0%" stop-color="#ffd0a0"/><stop offset="50%" stop-color="#a85a30"/><stop offset="100%" stop-color="#3a1808"/></radialGradient>
      <radialGradient id="belly" cx="50%" cy="60%"><stop offset="0%" stop-color="#fff"/><stop offset="50%" stop-color="#ff9055"/><stop offset="100%" stop-color="#5a2008"/></radialGradient>
    </defs>
    <ellipse cx="32" cy="58" rx="22" ry="4" fill="#000" opacity="0.55"/>
    <ellipse cx="32" cy="34" rx="22" ry="20" fill="url(#body)" stroke="#1a0a04" stroke-width="1.4"/>
    <ellipse cx="32" cy="40" rx="14" ry="11" fill="url(#belly)" opacity="0.95"/>
    <circle cx="22" cy="22" r="4" fill="#ffd0a0" stroke="#1a0a04" stroke-width="1"/>
    <circle cx="22" cy="22" r="1.5" fill="#0a0408"/>
    <circle cx="42" cy="22" r="4" fill="#ffd0a0" stroke="#1a0a04" stroke-width="1"/>
    <circle cx="42" cy="22" r="1.5" fill="#0a0408"/>
    <circle cx="14" cy="48" r="4" fill="#5a2008" stroke="#1a0a04" stroke-width="1"/>
    <circle cx="50" cy="48" r="4" fill="#5a2008" stroke="#1a0a04" stroke-width="1"/>
    <circle cx="32" cy="52" r="3" fill="#ff9055" opacity="0.9"/>
    <line x1="14" y1="48" x2="10" y2="56" stroke="#5a2008" stroke-width="2" stroke-linecap="round"/>
    <line x1="50" y1="48" x2="54" y2="56" stroke="#5a2008" stroke-width="2" stroke-linecap="round"/>
  </svg>`;

  S.turret_dart_a = S.turret_dart
    .replace(/#7ae0ff/g, '#ff9055')
    .replace(/#4fc8ff/g, '#ff9055')
    .replace(/#d8faff/g, '#ffd8b8');
  S.turret_dart_b = S.turret_dart
    .replace(/#7ae0ff/g, '#c8a8ff')
    .replace(/#4fc8ff/g, '#a070ff')
    .replace(/#d8faff/g, '#e8d8ff');

  // ==================================================================
  //  Registry
  // ==================================================================

  NDP.OrbitalSprites = {};
  Object.keys(S).forEach(k => {
    NDP.OrbitalSprites[k] = dataUrl(S[k]);
  });
})();
