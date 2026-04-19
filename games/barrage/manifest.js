NDP.registerManifest({
  id: 'barrage',
  title: 'Barrage',
  blurb: 'Flak the skies. Defend the city.',
  description: 'Missiles rain from above. Click to detonate a flak burst anywhere on the sky — any missile caught in the shockwave explodes. Chain kills for bonuses. Keep at least one city standing.',
  controls: 'Aim + Fire: CLICK  ·  Bursts are expensive — make them count',
  theme: { bg: '#0a0612', accent: '#ff6e3a', accent2: '#4fc8ff' },

  previewDraw(ctx, t, w, h) {
    // night sky
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#160a26'); g.addColorStop(1, '#2a1418');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // stars
    ctx.fillStyle = '#ffffff80';
    for (let i = 0; i < 20; i++) ctx.fillRect((i*37)%w, (i*53)%(h*0.6), 1, 1);
    // ground
    ctx.fillStyle = '#221014'; ctx.fillRect(0, h*0.82, w, h*0.18);
    // cities
    const cities = [[w*0.2, h*0.82],[w*0.5, h*0.82],[w*0.8, h*0.82]];
    cities.forEach(c=>{
      ctx.fillStyle = '#4fc8ff';
      ctx.fillRect(c[0]-10, c[1]-14, 20, 14);
      ctx.fillRect(c[0]-6, c[1]-20, 12, 6);
    });
    // missiles
    for (let i = 0; i < 3; i++) {
      const x = 30 + ((t*40 + i*60) % (w-60));
      const y = ((t*30 + i*45) % (h*0.7)) + 20;
      ctx.strokeStyle = '#ff6e3a';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x-8, y-16); ctx.lineTo(x, y); ctx.stroke();
      ctx.fillStyle = '#ff6e3a'; ctx.beginPath(); ctx.arc(x,y,2,0,Math.PI*2); ctx.fill();
    }
    // flak burst
    const bx = w*0.6, by = h*0.35;
    const pulse = (Math.sin(t*3)+1)/2;
    ctx.strokeStyle = '#ffd86b';
    ctx.lineWidth = 2 + pulse*2;
    ctx.beginPath(); ctx.arc(bx, by, 20 + pulse*10, 0, Math.PI*2); ctx.stroke();
    ctx.fillStyle = `rgba(255,216,107,${0.4-pulse*0.3})`;
    ctx.beginPath(); ctx.arc(bx, by, 20 + pulse*10, 0, Math.PI*2); ctx.fill();
  }
});
