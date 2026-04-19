NDP.registerManifest({
  id: 'starfall',
  title: 'Starfall',
  blurb: 'Vertical shmup through an asteroid storm.',
  description: 'Pilot a lone fighter through waves of invaders. Shoot, weave, collect power-ups. Every tenth wave is a boss.',
  controls: 'Move: WASD / ARROWS  ·  Fire: SPACE / CLICK  ·  Pause: ESC',
  theme: { bg: '#05080f', accent: '#6cf', accent2: '#f0c' },

  assets: [
    { key: 'sf_player',   src: 'assets/space/player.png',    type: 'image' },
    { key: 'sf_enemy1',   src: 'assets/space/enemy1.png',    type: 'image' },
    { key: 'sf_enemy2',   src: 'assets/space/enemy2.png',    type: 'image' },
    { key: 'sf_enemy3',   src: 'assets/space/enemy3.png',    type: 'image' },
    { key: 'sf_bullet',   src: 'assets/space/bullet.png',    type: 'image' },
    { key: 'sf_ship',     src: 'assets/space/ship.png',      type: 'image' },
    { key: 'sf_star',     src: 'assets/space/star.png',      type: 'image' },
    { key: 'sf_expl',     src: 'assets/space/explosion.png', type: 'image' },
    { key: 'sf_laser',    src: 'assets/audio/laser.mp3',     type: 'audio', volume: 0.25 },
    { key: 'sf_boom',     src: 'assets/audio/explosion.mp3', type: 'audio', volume: 0.4 },
    { key: 'sf_hit',      src: 'assets/audio/hit.mp3',       type: 'audio', volume: 0.3 }
  ],

  previewDraw(ctx, t, w, h) {
    // Space background
    ctx.fillStyle = '#05080f'; ctx.fillRect(0, 0, w, h);
    // Stars
    for (let i = 0; i < 50; i++) {
      const sx = (i * 73.3 + t * (20 + (i % 5) * 10)) % w;
      const sy = (i * 41.7) % h;
      const b = (i % 7) / 7;
      ctx.fillStyle = `rgba(${200 + b * 55},${220 + b * 35},255,${0.3 + b * 0.7})`;
      ctx.fillRect(sx, sy, 1 + (i % 3 === 0 ? 1 : 0), 1 + (i % 3 === 0 ? 1 : 0));
    }
    // Nebula wash
    const grad = ctx.createRadialGradient(w * 0.7, h * 0.3, 10, w * 0.7, h * 0.3, w * 0.5);
    grad.addColorStop(0, 'rgba(255,80,200,0.25)');
    grad.addColorStop(1, 'rgba(255,80,200,0)');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
    // Ship
    const px = w * 0.5 + Math.sin(t * 1.4) * 40;
    const py = h * 0.75;
    ctx.fillStyle = '#6cf';
    ctx.beginPath();
    ctx.moveTo(px, py - 16); ctx.lineTo(px - 12, py + 10); ctx.lineTo(px + 12, py + 10);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffd'; ctx.fillRect(px - 2, py - 4, 4, 6);
    // Thruster
    ctx.fillStyle = '#f0c';
    ctx.beginPath();
    ctx.moveTo(px - 6, py + 10); ctx.lineTo(px, py + 18 + Math.sin(t * 30) * 4); ctx.lineTo(px + 6, py + 10);
    ctx.closePath(); ctx.fill();
    // Invaders
    for (let i = 0; i < 4; i++) {
      const ex = (w * 0.15) + i * (w * 0.2) + Math.sin(t * 2 + i) * 10;
      const ey = 40 + Math.sin(t * 3 + i) * 8;
      ctx.fillStyle = '#7f7';
      ctx.fillRect(ex - 10, ey - 6, 20, 12);
      ctx.fillStyle = '#000';
      ctx.fillRect(ex - 6, ey - 2, 3, 3); ctx.fillRect(ex + 3, ey - 2, 3, 3);
    }
    // A bullet
    const bx = px, by = py - 16 - ((t * 300) % 200);
    ctx.fillStyle = '#ffec7a'; ctx.fillRect(bx - 1, by - 6, 3, 10);
  }
});
