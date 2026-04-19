/* Helicopter — inline SVG sprite atlas.
   Registered with the engine on load; consumed by game.js via Sprites.draw.

   Convention:
     - Heli body sprites use an 80x40 viewBox so the rotor band sits naturally
       above on its own 80x10 strip.
     - Biome decor + pickups + bosses follow the sizes called out in the design
       brief so requested rasterisation never up-samples beyond the source. */
(function () {
  const NDP = window.NDP;
  const Sprites = NDP.Engine && NDP.Engine.Sprites;
  if (!Sprites) { console.warn('[helicopter/sprites] Sprites engine missing'); return; }

  const heliBasic = `
<svg viewBox="0 0 80 40">
  <defs>
    <linearGradient id="hbBody" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffe79b"/>
      <stop offset="100%" stop-color="#c98926"/>
    </linearGradient>
  </defs>
  <rect x="6" y="34" width="58" height="2" fill="#cfe9ff"/>
  <rect x="12" y="32" width="2" height="3" fill="#cfe9ff"/>
  <rect x="56" y="32" width="2" height="3" fill="#cfe9ff"/>
  <path d="M14 14 L60 14 L72 22 L60 30 L14 30 Z"
        fill="url(#hbBody)" stroke="#5a3a08" stroke-width="1.5"/>
  <rect x="2" y="20" width="14" height="6" fill="url(#hbBody)" stroke="#5a3a08" stroke-width="1"/>
  <rect x="0" y="14" width="6" height="10" fill="#c98926" stroke="#5a3a08" stroke-width="1"/>
  <path d="M58 17 L70 22 L58 27 Z" fill="#7cd9ff" stroke="#1d4d70" stroke-width="1"/>
  <circle cx="62" cy="22" r="1.4" fill="#0e1426"/>
  <rect x="38" y="11" width="4" height="4" fill="#5a3a08"/>
</svg>`;

  const heliArmored = `
<svg viewBox="0 0 80 40">
  <defs>
    <linearGradient id="haBody" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#9aa5b8"/>
      <stop offset="100%" stop-color="#3d4658"/>
    </linearGradient>
  </defs>
  <rect x="6" y="34" width="58" height="2" fill="#cfe9ff"/>
  <rect x="12" y="32" width="2" height="3" fill="#cfe9ff"/>
  <rect x="56" y="32" width="2" height="3" fill="#cfe9ff"/>
  <path d="M14 12 L60 12 L72 22 L60 32 L14 32 Z"
        fill="url(#haBody)" stroke="#0c0f17" stroke-width="2"/>
  <rect x="2" y="19" width="16" height="8" fill="url(#haBody)" stroke="#0c0f17" stroke-width="1.4"/>
  <rect x="0" y="13" width="6" height="12" fill="#3d4658" stroke="#0c0f17" stroke-width="1"/>
  <path d="M58 16 L70 22 L58 28 Z" fill="#7cd9ff" stroke="#0c0f17" stroke-width="1"/>
  <circle cx="62" cy="22" r="1.4" fill="#0e1426"/>
  <rect x="22" y="9" width="6" height="3" fill="#222" stroke="#000" stroke-width="0.6"/>
  <rect x="46" y="9" width="6" height="3" fill="#222" stroke="#000" stroke-width="0.6"/>
  <line x1="22" y1="32" x2="22" y2="38" stroke="#0c0f17" stroke-width="1"/>
  <line x1="52" y1="32" x2="52" y2="38" stroke="#0c0f17" stroke-width="1"/>
</svg>`;

  const heliRotor = `
<svg viewBox="0 0 80 10">
  <rect x="2" y="4" width="76" height="2" fill="#cfe9ff" opacity="0.95"/>
  <rect x="0" y="3" width="80" height="1" fill="#cfe9ff" opacity="0.45"/>
  <rect x="0" y="6" width="80" height="1" fill="#cfe9ff" opacity="0.45"/>
  <circle cx="40" cy="5" r="2.4" fill="#5a3a08" stroke="#0c0f17" stroke-width="0.8"/>
</svg>`;

  // ---------- Biome decor (80x80) ----------
  const decStalagmite = `
<svg viewBox="0 0 80 80">
  <defs>
    <linearGradient id="stG" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#5a3f6a"/>
      <stop offset="100%" stop-color="#1c1228"/>
    </linearGradient>
  </defs>
  <path d="M10 78 L24 36 L34 60 L40 18 L48 56 L58 30 L70 78 Z"
        fill="url(#stG)" stroke="#0c0414" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="M28 60 L34 64 L32 70" stroke="#a87fc9" stroke-width="1" fill="none" opacity="0.6"/>
  <path d="M44 50 L50 56 L48 64" stroke="#a87fc9" stroke-width="1" fill="none" opacity="0.6"/>
</svg>`;

  const decPipe = `
<svg viewBox="0 0 80 80">
  <defs>
    <linearGradient id="pG" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#3a2418"/>
      <stop offset="50%" stop-color="#a8662a"/>
      <stop offset="100%" stop-color="#3a2418"/>
    </linearGradient>
  </defs>
  <rect x="6" y="22" width="68" height="20" fill="url(#pG)" stroke="#1a0e08" stroke-width="2"/>
  <rect x="6" y="22" width="68" height="3" fill="#ffd86b" opacity="0.6"/>
  <rect x="14" y="14" width="10" height="10" fill="#a8662a" stroke="#1a0e08" stroke-width="1.4"/>
  <rect x="56" y="14" width="10" height="10" fill="#a8662a" stroke="#1a0e08" stroke-width="1.4"/>
  <circle cx="20" cy="32" r="3" fill="#1a0e08"/>
  <circle cx="40" cy="32" r="3" fill="#1a0e08"/>
  <circle cx="60" cy="32" r="3" fill="#1a0e08"/>
  <rect x="0" y="46" width="80" height="32" fill="#2a1408" opacity="0.7"/>
  <path d="M0 50 L80 50" stroke="#ff8c3a" stroke-width="1.2" opacity="0.6"/>
</svg>`;

  const decCoral = `
<svg viewBox="0 0 80 80">
  <defs>
    <radialGradient id="cG" cx="50%" cy="60%" r="60%">
      <stop offset="0%" stop-color="#ffd1ec"/>
      <stop offset="60%" stop-color="#ff7fbf"/>
      <stop offset="100%" stop-color="#7a1e54"/>
    </radialGradient>
  </defs>
  <path d="M40 78 C 22 60 16 40 28 22 C 36 14 44 18 40 30 C 38 18 50 14 56 24 C 62 38 58 60 40 78 Z"
        fill="url(#cG)" stroke="#3a0a23" stroke-width="1.6"/>
  <circle cx="32" cy="40" r="2.5" fill="#fff8f0" opacity="0.8"/>
  <circle cx="48" cy="46" r="2" fill="#fff8f0" opacity="0.7"/>
  <circle cx="40" cy="56" r="2" fill="#fff8f0" opacity="0.7"/>
  <path d="M40 78 L40 70" stroke="#3a0a23" stroke-width="1.4" opacity="0.4"/>
</svg>`;

  const decSatellite = `
<svg viewBox="0 0 80 80">
  <defs>
    <linearGradient id="satG" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#7cd9ff"/>
      <stop offset="100%" stop-color="#274565"/>
    </linearGradient>
  </defs>
  <rect x="2" y="34" width="22" height="12" fill="url(#satG)" stroke="#0a1a2a" stroke-width="1.4"/>
  <rect x="56" y="34" width="22" height="12" fill="url(#satG)" stroke="#0a1a2a" stroke-width="1.4"/>
  <line x1="4" y1="34" x2="4" y2="46" stroke="#0a1a2a" stroke-width="1"/>
  <line x1="14" y1="34" x2="14" y2="46" stroke="#0a1a2a" stroke-width="1"/>
  <line x1="64" y1="34" x2="64" y2="46" stroke="#0a1a2a" stroke-width="1"/>
  <line x1="74" y1="34" x2="74" y2="46" stroke="#0a1a2a" stroke-width="1"/>
  <rect x="30" y="30" width="20" height="20" fill="#9aa5b8" stroke="#0a1a2a" stroke-width="1.6"/>
  <circle cx="40" cy="40" r="5" fill="#ffd86b" stroke="#3a2a08" stroke-width="1"/>
  <rect x="36" y="22" width="8" height="8" fill="#9aa5b8" stroke="#0a1a2a" stroke-width="1"/>
  <line x1="40" y1="14" x2="40" y2="22" stroke="#0a1a2a" stroke-width="1.4"/>
</svg>`;

  // ---------- Pickups (60x60) ----------
  const fuel = `
<svg viewBox="0 0 60 60">
  <defs>
    <linearGradient id="fuG" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#9aff7a"/>
      <stop offset="100%" stop-color="#1a6a30"/>
    </linearGradient>
  </defs>
  <circle cx="30" cy="30" r="26" fill="#0a200a" stroke="#9aff7a" stroke-width="2"/>
  <rect x="18" y="14" width="24" height="32" rx="4" fill="url(#fuG)" stroke="#072008" stroke-width="2"/>
  <rect x="22" y="20" width="16" height="6" fill="#caffb8" opacity="0.85"/>
  <text x="30" y="42" font-family="ui-monospace, monospace" font-size="14" font-weight="bold"
        fill="#072008" text-anchor="middle">F</text>
  <circle cx="46" cy="14" r="6" fill="#9aff7a" opacity="0.9"/>
  <line x1="46" y1="10" x2="46" y2="18" stroke="#072008" stroke-width="1.6"/>
  <line x1="42" y1="14" x2="50" y2="14" stroke="#072008" stroke-width="1.6"/>
</svg>`;

  const shieldOrb = `
<svg viewBox="0 0 60 60">
  <defs>
    <radialGradient id="sG" cx="50%" cy="40%" r="60%">
      <stop offset="0%" stop-color="#cffaff"/>
      <stop offset="60%" stop-color="#7cd9ff"/>
      <stop offset="100%" stop-color="#1a4a70"/>
    </radialGradient>
  </defs>
  <circle cx="30" cy="30" r="26" fill="url(#sG)" stroke="#0a2a40" stroke-width="2"/>
  <path d="M30 12 L46 18 L46 32 C 46 42 38 48 30 50 C 22 48 14 42 14 32 L14 18 Z"
        fill="none" stroke="#fff" stroke-width="2.4" opacity="0.9"/>
  <circle cx="30" cy="30" r="5" fill="#fff" opacity="0.8"/>
  <ellipse cx="22" cy="22" rx="6" ry="3" fill="#fff" opacity="0.4"/>
</svg>`;

  const turbo = `
<svg viewBox="0 0 60 60">
  <defs>
    <linearGradient id="tG" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ffd86b"/>
      <stop offset="100%" stop-color="#ff5e3a"/>
    </linearGradient>
  </defs>
  <circle cx="30" cy="30" r="26" fill="#2a0a08" stroke="#ffd86b" stroke-width="2"/>
  <path d="M34 8 L18 34 L28 34 L24 52 L44 24 L34 24 Z"
        fill="url(#tG)" stroke="#1a0408" stroke-width="2" stroke-linejoin="round"/>
  <path d="M10 40 L18 36 M10 32 L16 30 M12 24 L20 22"
        stroke="#ffd86b" stroke-width="1.4" opacity="0.7"/>
</svg>`;

  // ---------- Bosses (200x200) ----------
  const bossLasergate = `
<svg viewBox="0 0 200 200">
  <defs>
    <linearGradient id="lgG" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#3a1010"/>
      <stop offset="100%" stop-color="#7a1c1c"/>
    </linearGradient>
    <linearGradient id="beam" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ff5e7e"/>
      <stop offset="50%" stop-color="#ffd86b"/>
      <stop offset="100%" stop-color="#ff5e7e"/>
    </linearGradient>
  </defs>
  <rect x="14" y="0" width="172" height="22" fill="url(#lgG)" stroke="#1a0408" stroke-width="2"/>
  <rect x="14" y="178" width="172" height="22" fill="url(#lgG)" stroke="#1a0408" stroke-width="2"/>
  <rect x="36" y="22" width="14" height="156" fill="url(#beam)" opacity="0.85"/>
  <rect x="80" y="22" width="14" height="156" fill="url(#beam)" opacity="0.85"/>
  <rect x="124" y="22" width="14" height="156" fill="url(#beam)" opacity="0.85"/>
  <rect x="168" y="22" width="14" height="156" fill="url(#beam)" opacity="0.85"/>
  <circle cx="43" cy="11" r="4" fill="#ffd86b"/>
  <circle cx="87" cy="11" r="4" fill="#ffd86b"/>
  <circle cx="131" cy="11" r="4" fill="#ffd86b"/>
  <circle cx="175" cy="11" r="4" fill="#ffd86b"/>
  <circle cx="43" cy="189" r="4" fill="#ffd86b"/>
  <circle cx="87" cy="189" r="4" fill="#ffd86b"/>
  <circle cx="131" cy="189" r="4" fill="#ffd86b"/>
  <circle cx="175" cy="189" r="4" fill="#ffd86b"/>
</svg>`;

  const bossDragon = `
<svg viewBox="0 0 200 200">
  <defs>
    <radialGradient id="drG" cx="50%" cy="50%" r="60%">
      <stop offset="0%" stop-color="#ffd86b"/>
      <stop offset="60%" stop-color="#a82a08"/>
      <stop offset="100%" stop-color="#3a0a04"/>
    </radialGradient>
  </defs>
  <path d="M10 110 Q 30 80 60 90 Q 80 70 110 95 Q 140 85 170 110 Q 180 130 170 150 Q 140 145 110 130 Q 80 150 60 130 Q 30 140 10 130 Z"
        fill="url(#drG)" stroke="#1a0404" stroke-width="2.4"/>
  <path d="M150 90 L185 60 L195 100 L175 105 Z"
        fill="#a82a08" stroke="#1a0404" stroke-width="2"/>
  <path d="M170 90 L188 78 L186 92 Z" fill="#ffd86b" stroke="#1a0404" stroke-width="1.4"/>
  <circle cx="178" cy="80" r="4" fill="#fff"/>
  <circle cx="178" cy="80" r="2" fill="#000"/>
  <path d="M195 100 L210 110 L198 108 Z" fill="#ff8c3a" stroke="#1a0404" stroke-width="1.4"/>
  <path d="M50 120 L30 140 L38 145 Z" fill="#a82a08" stroke="#1a0404" stroke-width="1.4"/>
  <path d="M90 110 L88 90 M120 105 L122 85"
        stroke="#ffd86b" stroke-width="2" stroke-linecap="round"/>
  <circle cx="60" cy="115" r="3" fill="#ffd86b" opacity="0.8"/>
  <circle cx="100" cy="115" r="3" fill="#ffd86b" opacity="0.8"/>
  <circle cx="140" cy="120" r="3" fill="#ffd86b" opacity="0.8"/>
</svg>`;

  const bossTurret = `
<svg viewBox="0 0 200 200">
  <defs>
    <linearGradient id="tuG" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#9aa5b8"/>
      <stop offset="100%" stop-color="#3d4658"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="200" height="40" fill="#1a2030"/>
  <rect x="0" y="160" width="200" height="40" fill="#1a2030"/>
  <rect x="40" y="20" width="40" height="20" fill="url(#tuG)" stroke="#0a0e18" stroke-width="2"/>
  <rect x="120" y="20" width="40" height="20" fill="url(#tuG)" stroke="#0a0e18" stroke-width="2"/>
  <rect x="55" y="40" width="10" height="22" fill="#3d4658" stroke="#0a0e18" stroke-width="1.6"/>
  <rect x="135" y="40" width="10" height="22" fill="#3d4658" stroke="#0a0e18" stroke-width="1.6"/>
  <rect x="40" y="160" width="40" height="20" fill="url(#tuG)" stroke="#0a0e18" stroke-width="2"/>
  <rect x="120" y="160" width="40" height="20" fill="url(#tuG)" stroke="#0a0e18" stroke-width="2"/>
  <rect x="55" y="138" width="10" height="22" fill="#3d4658" stroke="#0a0e18" stroke-width="1.6"/>
  <rect x="135" y="138" width="10" height="22" fill="#3d4658" stroke="#0a0e18" stroke-width="1.6"/>
  <circle cx="60" cy="64" r="3" fill="#ff5e7e"/>
  <circle cx="140" cy="64" r="3" fill="#ff5e7e"/>
  <circle cx="60" cy="136" r="3" fill="#ff5e7e"/>
  <circle cx="140" cy="136" r="3" fill="#ff5e7e"/>
  <circle cx="100" cy="100" r="14" fill="#9aa5b8" stroke="#0a0e18" stroke-width="2"/>
  <text x="100" y="106" font-family="ui-monospace, monospace" font-size="14" font-weight="bold"
        fill="#0a0e18" text-anchor="middle">!</text>
</svg>`;

  const bossArray = `
<svg viewBox="0 0 200 200">
  <defs>
    <radialGradient id="arG" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffd86b"/>
      <stop offset="60%" stop-color="#7cd9ff"/>
      <stop offset="100%" stop-color="#0a1a2e"/>
    </radialGradient>
    <linearGradient id="panel" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#7cd9ff"/>
      <stop offset="100%" stop-color="#1a3a5a"/>
    </linearGradient>
  </defs>
  <circle cx="100" cy="100" r="92" fill="url(#arG)" opacity="0.25"/>
  <rect x="22" y="92" width="40" height="16" fill="url(#panel)" stroke="#0a1a2e" stroke-width="2"/>
  <rect x="138" y="92" width="40" height="16" fill="url(#panel)" stroke="#0a1a2e" stroke-width="2"/>
  <rect x="92" y="22" width="16" height="40" fill="url(#panel)" stroke="#0a1a2e" stroke-width="2"/>
  <rect x="92" y="138" width="16" height="40" fill="url(#panel)" stroke="#0a1a2e" stroke-width="2"/>
  <line x1="40" y1="100" x2="60" y2="100" stroke="#fff" stroke-width="1" opacity="0.6"/>
  <line x1="140" y1="100" x2="160" y2="100" stroke="#fff" stroke-width="1" opacity="0.6"/>
  <line x1="100" y1="40" x2="100" y2="60" stroke="#fff" stroke-width="1" opacity="0.6"/>
  <line x1="100" y1="140" x2="100" y2="160" stroke="#fff" stroke-width="1" opacity="0.6"/>
  <circle cx="100" cy="100" r="22" fill="#1a2030" stroke="#7cd9ff" stroke-width="2"/>
  <circle cx="100" cy="100" r="10" fill="#ffd86b" stroke="#3a2a08" stroke-width="1.6"/>
  <circle cx="100" cy="100" r="3" fill="#fff"/>
  <line x1="100" y1="100" x2="100" y2="32" stroke="#ff5e7e" stroke-width="1.2" opacity="0.5"/>
  <line x1="100" y1="100" x2="168" y2="100" stroke="#ff5e7e" stroke-width="1.2" opacity="0.5"/>
</svg>`;

  Sprites.registerMany({
    'heli.heli_basic':    heliBasic,
    'heli.heli_armored':  heliArmored,
    'heli.heli_rotor':    heliRotor,
    'heli.dec_stalagmite':decStalagmite,
    'heli.dec_pipe':      decPipe,
    'heli.dec_coral':     decCoral,
    'heli.dec_satellite': decSatellite,
    'heli.fuel':          fuel,
    'heli.shield_orb':    shieldOrb,
    'heli.turbo':         turbo,
    'heli.boss_lasergate':bossLasergate,
    'heli.boss_dragon':   bossDragon,
    'heli.boss_turret':   bossTurret,
    'heli.boss_array':    bossArray
  });
})();
