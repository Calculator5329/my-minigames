NDP.registerManifest({
  id: 'learntoheist',
  title: 'Learn to Heist',
  blurb: 'Launch a goblin into orbit. Punch the vault.',
  description: 'The vault escaped into space with every coin in the world. Build a contraption in your workshop, launch off a ramp, stay airborne as long as you can, grab coins mid-flight, and spend them between runs on better gear. Beat 10 goals to reach orbit and punch the vault. Classic launch-and-upgrade loop — but with a goblin.',
  controls: 'Launch: CLICK angle, CLICK power  ·  Pitch: A·D / \u2190\u2192  ·  Boost: HOLD SPACE  ·  Glider: G  ·  Shop: S  ·  Retry: R',
  theme: { bg: '#8ecae6', accent: '#ffcc33', accent2: '#ff7755' },

  assets: [
    { key: 'lth_penguin',  src: 'assets/flight/penguin.png',  type: 'image' },
    { key: 'lth_rocket',   src: 'assets/flight/rocket.png',   type: 'image' },
    { key: 'lth_fighter',  src: 'assets/flight/fighter.png',  type: 'image' },
    { key: 'lth_ast_big',  src: 'assets/flight/asteroid_big.png',   type: 'image' },
    { key: 'lth_ast_med',  src: 'assets/flight/asteroid_med.png',   type: 'image' },
    { key: 'lth_ast_small',src: 'assets/flight/asteroid_small.png', type: 'image' },
    { key: 'lth_ufo',      src: 'assets/flight/ufo.png',      type: 'image' },
    { key: 'lth_enemy',    src: 'assets/flight/enemy.png',    type: 'image' },
    { key: 'lth_star',     src: 'assets/flight/star.png',     type: 'image' },
    { key: 'lth_star2',    src: 'assets/flight/star2.png',    type: 'image' },
    { key: 'lth_bullet',   src: 'assets/flight/bullet.png',   type: 'image' },
    { key: 'lth_gem',      src: 'assets/flight/gem_blue.png', type: 'image' },
    { key: 'lth_smoke',    src: 'assets/flight/smoke.png',    type: 'image' },
    { key: 'lth_fire',     src: 'assets/flight/fire.png',     type: 'image' },
    { key: 'lth_spark',    src: 'assets/flight/spark.png',    type: 'image' },
    { key: 'lth_particle_b', src: 'assets/flight/blue_particle.png',  type: 'image' },
    { key: 'lth_particle_y', src: 'assets/flight/yellow_particle.png',type: 'image' },
    { key: 'lth_coin',     src: 'assets/flight/coin.png',     type: 'image' },
    { key: 'lth_platform', src: 'assets/flight/platform.png', type: 'image' },
    { key: 'lth_explosion',src: 'assets/flight/explosion.png',type: 'image' },
    { key: 'lth_mushroom', src: 'assets/flight/mushroom.png', type: 'image' },
    { key: 'lth_launch_sfx',src:'assets/audio/launch.mp3',    type: 'audio', volume: 0.35 },
    { key: 'lth_coin_sfx', src: 'assets/audio/coin.mp3',      type: 'audio', volume: 0.25 },
    { key: 'lth_boom_sfx', src: 'assets/audio/explosion.mp3', type: 'audio', volume: 0.3 },
    { key: 'lth_hit_sfx',  src: 'assets/audio/hit.mp3',       type: 'audio', volume: 0.3 }
  ],

  previewDraw(ctx, t, w, h) {
    // animated parallax sky that ascends through bands
    const phase = (t * 0.2) % 1;
    const alt = phase * 2000;
    let top, bot;
    if (alt < 400) { top = '#8ecae6'; bot = '#b7e2f0'; }
    else if (alt < 1000) { top = '#4a6fa8'; bot = '#85a4cf'; }
    else if (alt < 1500) { top = '#2d3f72'; bot = '#5a6a9e'; }
    else { top = '#05020f'; bot = '#120830'; }
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, top); g.addColorStop(1, bot);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

    // stars at high altitude
    if (alt > 900) {
      const sA = Math.min(1, (alt - 900) / 600);
      ctx.globalAlpha = sA;
      for (let i = 0; i < 40; i++) {
        const sx = (i * 73.3 + t * 10) % w;
        const sy = (i * 17.1) % h;
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(sx, sy, 1, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // clouds at mid altitude
    if (alt < 1300) {
      const cA = Math.max(0.3, 1 - alt / 1300);
      ctx.globalAlpha = cA;
      for (let i = 0; i < 4; i++) {
        const cx = ((i * 90 + t * 30) % (w + 100)) - 50;
        const cy = 60 + i * 35;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(cx, cy, 26, 0, Math.PI * 2);
        ctx.arc(cx + 20, cy + 3, 22, 0, Math.PI * 2);
        ctx.arc(cx - 18, cy + 4, 18, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // ground at bottom if low altitude
    if (alt < 300) {
      ctx.fillStyle = '#355c28';
      ctx.fillRect(0, h - 30, w, 30);
      ctx.fillStyle = '#4a7a30';
      ctx.fillRect(0, h - 30, w, 3);
      // ramp
      ctx.fillStyle = '#5a4030';
      ctx.fillRect(20, h - 70, 30, 40);
      ctx.fillStyle = '#4a3525';
      ctx.beginPath();
      ctx.moveTo(50, h - 70); ctx.lineTo(120, h - 30); ctx.lineTo(50, h - 30); ctx.closePath(); ctx.fill();
    }

    // penguin / rocket trajectory
    const arcT = (t * 0.5) % 1;
    const px = 60 + arcT * (w - 120);
    const py = h - 60 - Math.sin(arcT * Math.PI) * (h - 120);
    // rocket body
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.atan2(-Math.cos(arcT * Math.PI) * (h - 120) / (w - 120), 1));
    ctx.fillStyle = '#dd4422';
    ctx.fillRect(-12, -5, 24, 10);
    ctx.fillStyle = '#ffcc33';
    ctx.beginPath(); ctx.moveTo(12, -5); ctx.lineTo(20, 0); ctx.lineTo(12, 5); ctx.closePath(); ctx.fill();
    // flame
    ctx.fillStyle = '#ff8833';
    ctx.beginPath(); ctx.moveTo(-12, -4); ctx.lineTo(-22 - Math.sin(t * 30) * 3, 0); ctx.lineTo(-12, 4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffdd55';
    ctx.beginPath(); ctx.moveTo(-12, -2); ctx.lineTo(-16, 0); ctx.lineTo(-12, 2); ctx.closePath(); ctx.fill();
    ctx.restore();

    // trailing particles
    for (let i = 0; i < 12; i++) {
      const tt = (arcT - i * 0.02 + 1) % 1;
      const tx = 60 + tt * (w - 120);
      const ty = h - 60 - Math.sin(tt * Math.PI) * (h - 120);
      ctx.globalAlpha = (1 - i / 12) * 0.8;
      ctx.fillStyle = i < 4 ? '#ff8833' : '#888';
      ctx.beginPath(); ctx.arc(tx, ty, 3 - i * 0.15, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // coin pickup sprinkle
    for (let i = 0; i < 5; i++) {
      const cx = ((i * 60 + t * 40) % w);
      const cy = h * 0.4 + Math.sin(t * 2 + i) * 20;
      ctx.fillStyle = '#ffcc33';
      ctx.beginPath(); ctx.arc(cx, cy, 4 + Math.sin(t * 6 + i) * 1.5, 0, Math.PI * 2); ctx.fill();
    }
  }
});
