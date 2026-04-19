NDP.registerManifest({
  id: 'bulwark',
  title: 'Bulwark',
  blurb: 'Roguelike tower defense. Deep run. One life.',
  description: 'Choose a route through a branching map of battles, elites, shops, events and campfires. Every battle: place towers along the path, survive waves, then pick a reward. Relics combine in unexpected ways. Three acts, three bosses, one life per run. Ash earned persists across runs and unlocks more.',
  controls: 'Map: CLICK node  ·  Battle: DRAG tower from tray  ·  Upgrade/sell: CLICK tower  ·  Start wave: SPACE or CLICK BUTTON',
  theme: { bg: '#0b0e16', accent: '#ffd86b', accent2: '#7ae0ff' },

  previewDraw(ctx, t, w, h) {
    // Parchment map vibe with connected nodes + a glowing battle
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#1a1a2e'); g.addColorStop(1, '#0b0e16');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // faint grid
    ctx.strokeStyle = '#1b2540';
    ctx.lineWidth = 1;
    for (let i = 0; i < w; i += 20) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke(); }
    for (let j = 0; j < h; j += 20) { ctx.beginPath(); ctx.moveTo(0, j); ctx.lineTo(w, j); ctx.stroke(); }
    // path
    ctx.strokeStyle = '#ffd86b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(10, h*0.85);
    const pts = [[w*0.2,h*0.6],[w*0.45,h*0.7],[w*0.6,h*0.4],[w*0.8,h*0.5],[w-10,h*0.2]];
    pts.forEach(p=>ctx.lineTo(p[0],p[1]));
    ctx.stroke();
    // nodes
    const types = ['battle','elite','shop','camp','boss'];
    const colors = { battle:'#7ae0ff', elite:'#ff4fd8', shop:'#ffd86b', camp:'#4ade80', boss:'#ff4d4d' };
    pts.forEach((p,i)=>{
      const type = types[i];
      const pulse = (Math.sin(t*2 + i) + 1) / 2;
      ctx.save();
      ctx.shadowColor = colors[type]; ctx.shadowBlur = 10 + pulse*6;
      ctx.fillStyle = colors[type];
      ctx.beginPath(); ctx.arc(p[0], p[1], 11, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    });
    // enemy marching
    const phase = (t * 0.5) % 1;
    const seg = Math.floor(phase * (pts.length - 1));
    const u = phase * (pts.length - 1) - seg;
    const a = pts[seg], b = pts[seg+1] || pts[seg];
    const ex = a[0] + (b[0]-a[0])*u;
    const ey = a[1] + (b[1]-a[1])*u;
    ctx.fillStyle = '#ff4d6d';
    ctx.beginPath(); ctx.arc(ex, ey, 4, 0, Math.PI*2); ctx.fill();
    // tower
    ctx.fillStyle = '#7ae0ff';
    ctx.fillRect(w*0.3, h*0.4, 10, 14);
    ctx.fillStyle = '#ffd86b';
    ctx.fillRect(w*0.3-2, h*0.4-4, 14, 6);
  }
});
