NDP.registerManifest({
  id: 'orbital',
  title: 'Orbital',
  blurb: 'Hold the system. One path. Infinite dark.',
  description: 'Meteoric swarms pour from a hyperspace tear and march along a fixed trajectory toward your homeworld. Place crazy cool orbital towers along the path — dart stations, plasma cannons, beam arrays, gravity wells, solar flare turrets, and the mighty Singularity. Survive 15 rounds. Round 15 is a boss. Homage to the BTD lineage with its own twist.',
  controls: 'Build: CLICK tower in tray, then CLICK empty space · Select: CLICK placed tower · Start wave: SPACE · Fast-forward: F (or 2× button)',
  theme: { bg: '#05071a', accent: '#7ae0ff', accent2: '#ff9055' },

  assets: (() => {
    const sp = (window.NDP && window.NDP.OrbitalSprites) || {};
    return [
      { key: 'orb_meteor_tiny',   src: sp.meteor_tiny,   type: 'image' },
      { key: 'orb_meteor_small',  src: sp.meteor_small,  type: 'image' },
      { key: 'orb_meteor_med',    src: sp.meteor_med,    type: 'image' },
      { key: 'orb_meteor_big',    src: sp.meteor_big,    type: 'image' },
      { key: 'orb_ufo',           src: sp.ufo,           type: 'image' },
      { key: 'orb_elite',         src: sp.elite,         type: 'image' },
      { key: 'orb_boss',          src: sp.boss,          type: 'image' },
      { key: 'orb_turret_dart',   src: sp.turret_dart,   type: 'image' },
      { key: 'orb_turret_cannon', src: sp.turret_cannon, type: 'image' },
      { key: 'orb_turret_beam',   src: sp.turret_beam,   type: 'image' },
      { key: 'orb_turret_gravity',src: sp.turret_gravity,type: 'image' },
      { key: 'orb_turret_flare',  src: sp.turret_flare,  type: 'image' },
      { key: 'orb_turret_sing',   src: sp.turret_sing,   type: 'image' },
      { key: 'orb_turret_tesla',  src: sp.turret_tesla,  type: 'image' },
      { key: 'orb_turret_missile',src: sp.turret_missile,type: 'image' },
      { key: 'orb_turret_support',src: sp.turret_support,type: 'image' },
      { key: 'orb_turret_quant',  src: sp.turret_quant,  type: 'image' },
      { key: 'orb_turret_sniper', src: sp.turret_sniper, type: 'image' },
      { key: 'orb_turret_engineer', src: sp.turret_engineer, type: 'image' },
      { key: 'orb_turret_cryo',   src: sp.turret_cryo,   type: 'image' },
      { key: 'orb_turret_chrono', src: sp.turret_chrono, type: 'image' },
      { key: 'orb_turret_mortar', src: sp.turret_mortar, type: 'image' },
      { key: 'orb_turret_crystal',src: sp.turret_crystal,type: 'image' },
      { key: 'orb_enemy_swarmer', src: sp.enemy_swarmer, type: 'image' },
      { key: 'orb_enemy_summoner',src: sp.enemy_summoner,type: 'image' },
      { key: 'orb_bolt',          src: sp.bolt,          type: 'image' },
      { key: 'orb_plasma',        src: sp.plasma,        type: 'image' },
      { key: 'orb_laser',         src: 'assets/audio/laser.mp3',     type: 'audio', volume: 0.18 },
      { key: 'orb_boom',          src: 'assets/audio/explosion.mp3', type: 'audio', volume: 0.35 }
    ];
  })(),

  previewDraw(ctx, t, w, h) {
    // Deep space
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0a0522'); g.addColorStop(1, '#050715');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // Stars
    for (let i = 0; i < 60; i++) {
      const sx = (i * 37.1) % w, sy = (i * 53.7) % h;
      const tw = (Math.sin(t * 2 + i) + 1) / 2;
      ctx.fillStyle = `rgba(255,255,255,${0.25 + tw * 0.5})`;
      ctx.fillRect(sx, sy, 1, 1);
    }
    // Nebula wash
    const rg = ctx.createRadialGradient(w * 0.3, h * 0.4, 10, w * 0.3, h * 0.4, w * 0.5);
    rg.addColorStop(0, 'rgba(122,224,255,0.18)');
    rg.addColorStop(1, 'rgba(122,224,255,0)');
    ctx.fillStyle = rg; ctx.fillRect(0, 0, w, h);
    // Path (snaking glow)
    const pts = [
      [0.02, 0.5],[0.22, 0.22],[0.48, 0.30],[0.48, 0.72],
      [0.78, 0.72],[0.78, 0.32],[0.98, 0.50]
    ].map(p => [p[0] * w, p[1] * h]);
    ctx.strokeStyle = '#7ae0ff'; ctx.lineWidth = 4;
    ctx.shadowColor = '#7ae0ff'; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
    ctx.shadowBlur = 0;
    // Homeworld + tear
    ctx.fillStyle = '#ff9055';
    ctx.beginPath(); ctx.arc(pts[pts.length - 1][0] + 6, pts[pts.length - 1][1], 14, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ff4fd8'; ctx.lineWidth = 2;
    const tearA = t * 2;
    ctx.beginPath(); ctx.arc(pts[0][0] - 4, pts[0][1], 10 + Math.sin(tearA) * 2, 0, Math.PI * 2); ctx.stroke();
    // Meteor traveling
    const phase = (t * 0.25) % 1;
    const seg = Math.floor(phase * (pts.length - 1));
    const u = phase * (pts.length - 1) - seg;
    const a = pts[seg], b = pts[seg + 1] || pts[seg];
    const ex = a[0] + (b[0] - a[0]) * u, ey = a[1] + (b[1] - a[1]) * u;
    ctx.fillStyle = '#c48a68';
    ctx.beginPath(); ctx.arc(ex, ey, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6b4025';
    ctx.beginPath(); ctx.arc(ex - 2, ey - 2, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(ex + 3, ey + 1, 1.5, 0, Math.PI * 2); ctx.fill();
    // Tower
    const tx = pts[2][0] - 20, ty = pts[2][1] - 30;
    ctx.fillStyle = '#233048';
    ctx.beginPath(); ctx.arc(tx, ty, 11, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#7ae0ff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(tx, ty, 11, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#ffd86b';
    const barrelA = Math.atan2(ey - ty, ex - tx);
    ctx.save(); ctx.translate(tx, ty); ctx.rotate(barrelA);
    ctx.fillRect(0, -2, 14, 4); ctx.restore();
    // Bolt
    const blx = tx + Math.cos(barrelA) * (14 + (t * 400 % 60));
    const bly = ty + Math.sin(barrelA) * (14 + (t * 400 % 60));
    ctx.fillStyle = '#ffd86b';
    ctx.beginPath(); ctx.arc(blx, bly, 2, 0, Math.PI * 2); ctx.fill();
    // Singularity flourish
    const sgx = pts[4][0] - 24, sgy = pts[4][1] + 40;
    const pulse = (Math.sin(t * 3) + 1) / 2;
    ctx.fillStyle = `rgba(122,100,255,${0.6 + pulse * 0.3})`;
    ctx.beginPath(); ctx.arc(sgx, sgy, 7 + pulse * 3, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ff4fd8'; ctx.lineWidth = 1;
    for (let r = 10; r < 26; r += 5) {
      ctx.beginPath(); ctx.arc(sgx, sgy, r + pulse * 3, 0, Math.PI * 2); ctx.stroke();
    }
  }
});
