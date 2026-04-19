NDP.registerManifest({
  id: 'vaultbreaker',
  title: 'Vaultbreaker',
  blurb: 'Punch the vault. Get rich. Get shot at.',
  description: 'A sentient vault hoards every coin in the world. Destroy its armor plates, collect the coins it bleeds, spend them on absurd upgrades — while it mutates cannons, turrets and stomp-waves at you. Coins are both currency AND ammo; greed is a tactical choice.',
  controls: 'Move: WASD / ARROWS  ·  Aim: MOUSE  ·  Shoot: CLICK  ·  Swap Weapon: 1-5  ·  Shop: E',
  theme: { bg: '#1b1410', accent: '#ffcc33', accent2: '#ff7755' },

  assets: [
    { key: 'vb_coin',     src: 'assets/platformer/coin.png', type: 'image' },
    { key: 'vb_hero',     src: 'assets/dungeon/hero.png',    type: 'image' },
    { key: 'vb_particle', src: 'assets/fx/particle.png',     type: 'image' },
    { key: 'vb_flare',    src: 'assets/fx/flare.png',        type: 'image' },
    { key: 'vb_hit',      src: 'assets/audio/hit.mp3',       type: 'audio', volume: 0.3 },
    { key: 'vb_coin_sfx', src: 'assets/audio/coin.mp3',      type: 'audio', volume: 0.25 },
    { key: 'vb_boom',     src: 'assets/audio/explosion.mp3', type: 'audio', volume: 0.35 }
  ],

  previewDraw(ctx, t, w, h) {
    // Dark vault-room background
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#2a1d16'); g.addColorStop(1, '#110a06');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

    // Floor
    ctx.fillStyle = '#2a1a10';
    ctx.fillRect(0, h - 32, w, 32);
    for (let x = 0; x < w; x += 20) {
      ctx.fillStyle = (x / 20) % 2 ? '#1a0f08' : '#231509';
      ctx.fillRect(x, h - 32, 20, 4);
    }

    // Vault (giant metal box, top)
    const vx = w * 0.5, vy = 70, vw = 170, vh = 95;
    ctx.fillStyle = '#3a3028';
    ctx.fillRect(vx - vw/2, vy - vh/2, vw, vh);
    ctx.fillStyle = '#554438';
    ctx.fillRect(vx - vw/2, vy - vh/2, vw, 8);
    // Bolts
    ctx.fillStyle = '#8a6e50';
    for (let i = 0; i < 5; i++) {
      ctx.fillRect(vx - vw/2 + 10 + i * 35, vy - vh/2 + 12, 4, 4);
      ctx.fillRect(vx - vw/2 + 10 + i * 35, vy + vh/2 - 8, 4, 4);
    }
    // Eyes
    const blink = Math.sin(t * 2) > 0.9 ? 0 : 1;
    ctx.fillStyle = '#ff4422';
    ctx.fillRect(vx - 32, vy - 8, 18, 6 * blink);
    ctx.fillRect(vx + 14, vy - 8, 18, 6 * blink);
    // Mouth slit
    ctx.fillStyle = '#1a0500';
    ctx.fillRect(vx - 30, vy + 14, 60, 6);
    // Coin spitting out
    for (let i = 0; i < 3; i++) {
      const phase = ((t * 0.8 + i * 0.33) % 1);
      const cx = vx + Math.sin(t * 2 + i) * 10;
      const cy = vy + 20 + phase * 120;
      ctx.fillStyle = '#ffcc33';
      ctx.beginPath(); ctx.arc(cx, cy, 4 - phase * 2, 0, Math.PI * 2); ctx.fill();
    }

    // Player goblin at bottom
    const px = w * 0.3 + Math.sin(t * 1.5) * 40;
    const py = h - 50;
    ctx.fillStyle = '#4a7a30';
    ctx.fillRect(px - 7, py - 4, 14, 14);
    ctx.fillStyle = '#2a5020';
    ctx.fillRect(px - 6, py - 14, 12, 10);
    ctx.fillStyle = '#000';
    ctx.fillRect(px - 3, py - 10, 2, 2); ctx.fillRect(px + 1, py - 10, 2, 2);
    // Gun
    ctx.fillStyle = '#444';
    ctx.fillRect(px + 3, py - 4, 12, 3);

    // Muzzle flash + bullet
    if (Math.sin(t * 10) > 0) {
      ctx.fillStyle = '#ffdd66';
      ctx.beginPath(); ctx.arc(px + 16, py - 2, 4, 0, Math.PI * 2); ctx.fill();
    }
    // Flying bullet
    const bphase = (t * 1.4) % 1;
    const bx = px + 18 + bphase * (vx - px);
    const by = py - 2 + bphase * (vy + 10 - py);
    ctx.fillStyle = '#ffee99';
    ctx.fillRect(bx - 2, by - 1, 4, 2);
  }
});
