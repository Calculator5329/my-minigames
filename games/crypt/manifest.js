NDP.registerManifest({
  id: 'crypt',
  title: 'Crypt',
  blurb: 'Top-down crawler — clear rooms, loot chests.',
  description: 'Explore a procedurally generated crypt. Clear each room of monsters, loot chests, descend the stairs. Your sword swings where you look. Every 3rd floor: a bigger room with more loot.',
  controls: 'Move: WASD / ARROWS  ·  Aim: MOUSE  ·  Attack: CLICK / SPACE',
  theme: { bg: '#1b1020', accent: '#b678ff', accent2: '#ffc96b' },

  /* We skip skeleton/slime/sword — those are animation sheets in the upstream
     repo and render as a grid when drawn whole; the procedural fallbacks are
     cleaner. Hero, potion, and stairs are single-frame and look great. */
  assets: [
    { key: 'cp_hero',    src: 'assets/dungeon/hero.png',    type: 'image' },
    { key: 'cp_potion',  src: 'assets/dungeon/potion.png',  type: 'image' },
    { key: 'cp_stairs',  src: 'assets/dungeon/stairs.png',  type: 'image' },
    { key: 'cp_swing',   src: 'assets/audio/hit.mp3',       type: 'audio', volume: 0.3 },
    { key: 'cp_loot',    src: 'assets/audio/coin.mp3',      type: 'audio', volume: 0.3 },
    { key: 'cp_hurt',    src: 'assets/audio/explosion.mp3', type: 'audio', volume: 0.3 }
  ],

  previewDraw(ctx, t, w, h) {
    // Dark floor
    ctx.fillStyle = '#1b1020'; ctx.fillRect(0, 0, w, h);
    // Room floor tiles (checker)
    for (let y = 30; y < h - 20; y += 24) {
      for (let x = 30; x < w - 20; x += 24) {
        const dark = ((x/24 + y/24) | 0) % 2;
        ctx.fillStyle = dark ? '#2d1a33' : '#251528';
        ctx.fillRect(x, y, 24, 24);
      }
    }
    // Walls
    ctx.fillStyle = '#4a2a55';
    ctx.fillRect(20, 20, w - 40, 12);
    ctx.fillRect(20, h - 32, w - 40, 12);
    ctx.fillRect(20, 20, 12, h - 40);
    ctx.fillRect(w - 32, 20, 12, h - 40);
    // Torches
    const flick = Math.sin(t * 14) * 3;
    ctx.fillStyle = '#ffcc66';
    ctx.beginPath(); ctx.arc(50, 50, 5 + flick * 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,200,100,0.15)';
    ctx.beginPath(); ctx.arc(50, 50, 26 + flick, 0, Math.PI * 2); ctx.fill();
    // Hero
    const hx = w * 0.5 + Math.sin(t * 1.8) * 20, hy = h * 0.6;
    ctx.fillStyle = '#66ccff';
    ctx.fillRect(hx - 7, hy - 2, 14, 14);
    ctx.fillStyle = '#ffd29a';
    ctx.fillRect(hx - 6, hy - 12, 12, 10);
    ctx.fillStyle = '#000';
    ctx.fillRect(hx - 3, hy - 8, 2, 2); ctx.fillRect(hx + 1, hy - 8, 2, 2);
    // Sword swinging
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(Math.sin(t * 6) * 1.2);
    ctx.fillStyle = '#ddd'; ctx.fillRect(8, -2, 16, 3);
    ctx.fillStyle = '#8a4a2a'; ctx.fillRect(6, -3, 3, 5);
    ctx.restore();
    // Skeleton enemy
    const ex = w * 0.25 + Math.cos(t * 2) * 10;
    ctx.fillStyle = '#e4e4e4'; ctx.fillRect(ex - 7, hy - 10, 14, 20);
    ctx.fillStyle = '#000'; ctx.fillRect(ex - 4, hy - 6, 2, 3); ctx.fillRect(ex + 2, hy - 6, 2, 3);
    // Chest
    const cx = w * 0.75;
    ctx.fillStyle = '#a06030'; ctx.fillRect(cx - 10, hy - 6, 20, 14);
    ctx.fillStyle = '#ffcc33'; ctx.fillRect(cx - 2, hy + 1, 4, 4);
  }
});
