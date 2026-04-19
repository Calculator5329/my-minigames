NDP.registerManifest({
  id: 'leap',
  title: 'Leap',
  blurb: 'Pixel platformer — coins, enemies, goal flag.',
  description: 'Run, jump, and collect. Stomp bugs, grab gems, reach the flag. Each level is procedural — die and you restart from level 1.',
  controls: 'Move: A/D or ARROWS  ·  Jump: SPACE / W / UP  ·  Pause: ESC',
  theme: { bg: '#6ec6ff', accent: '#ffd86b', accent2: '#ff7a7a' },

  /* Note: hero / ground / coin in phaserjs/examples are sprite SHEETS (strips),
     which render badly when drawn whole. We intentionally skip those keys so
     the procedural fallback art is used for them. Single-frame sprites (gem,
     enemy, flag) look great so we do load them. */
  assets: [
    { key: 'lp_gem',    src: 'assets/platformer/gem.png',    type: 'image' },
    { key: 'lp_enemy',  src: 'assets/platformer/enemy.png',  type: 'image' },
    { key: 'lp_flag',   src: 'assets/platformer/flag.png',   type: 'image' },
    { key: 'lp_jump',   src: 'assets/audio/jump.mp3',        type: 'audio', volume: 0.3 },
    { key: 'lp_hit',    src: 'assets/audio/hit.mp3',         type: 'audio', volume: 0.3 }
  ],

  previewDraw(ctx, t, w, h) {
    // Sky gradient
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#6ec6ff'); sky.addColorStop(1, '#b9e4ff');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
    // Clouds
    for (let i = 0; i < 3; i++) {
      const cx = ((t * 15 + i * 140) % (w + 80)) - 40;
      const cy = 30 + i * 15;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 2);
      ctx.arc(cx + 14, cy - 4, 12, 0, Math.PI * 2);
      ctx.arc(cx + 28, cy, 14, 0, Math.PI * 2);
      ctx.fill();
    }
    // Ground blocks
    const gy = h - 50;
    for (let x = 0; x < w; x += 24) {
      ctx.fillStyle = '#7a3e1a'; ctx.fillRect(x, gy, 24, 50);
      ctx.fillStyle = '#5aa04a'; ctx.fillRect(x, gy, 24, 8);
    }
    // Floating platform
    ctx.fillStyle = '#7a3e1a'; ctx.fillRect(w * 0.55, h * 0.55, 80, 14);
    ctx.fillStyle = '#5aa04a'; ctx.fillRect(w * 0.55, h * 0.55, 80, 4);
    // Hero jumping
    const jy = Math.max(0, Math.sin(t * 3.5)) * 30;
    const hx = w * 0.25, hy = gy - 24 - jy;
    ctx.fillStyle = '#ff6b6b'; ctx.fillRect(hx - 8, hy, 16, 16);
    ctx.fillStyle = '#ffd29a'; ctx.fillRect(hx - 6, hy - 10, 12, 10);
    ctx.fillStyle = '#000'; ctx.fillRect(hx - 3, hy - 7, 2, 2); ctx.fillRect(hx + 1, hy - 7, 2, 2);
    // Coin
    const coinX = w * 0.7, coinY = h * 0.55 - 20 + Math.sin(t * 4) * 3;
    ctx.fillStyle = '#ffd86b'; ctx.beginPath(); ctx.arc(coinX, coinY, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#a66b00'; ctx.fillRect(coinX - 1, coinY - 4, 2, 8);
  }
});
