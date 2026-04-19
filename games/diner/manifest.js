NDP.registerManifest({
  id: 'diner',
  title: 'Diner Rush',
  blurb: 'Five days. New ingredients. One food critic.',
  description: 'A 5-day campaign. Each day unlocks new ingredients (pickles, sauce, bacon, mushrooms) and tightens the queue. Buy permanent stations between days — better grill, fresh fridge, marketing. The final shift sends in the food critic, whose 7-stack order is brutal and whose tip is huge.',
  controls: 'Click ingredients to add  ·  Click customer to serve  ·  Click TRASH to reset plate  ·  Spend coins between days',
  theme: { bg: '#1a0e14', accent: '#ffb15e', accent2: '#ff4d6d' },

  previewDraw(ctx, t, w, h) {
    // warm diner backdrop
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#331820'); g.addColorStop(1, '#1a0e14');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // counter
    ctx.fillStyle = '#5a3424';
    ctx.fillRect(0, h*0.65, w, h*0.1);
    // plate
    const cx = w*0.35, cy = h*0.5;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(cx, cy+6, 40, 10, 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx, cy, 40, 14, 0, 0, Math.PI*2); ctx.fill();
    // burger
    ctx.fillStyle = '#c68b4a';
    ctx.fillRect(cx-22, cy-18, 44, 8);
    ctx.fillStyle = '#7ac74f';
    ctx.fillRect(cx-22, cy-10, 44, 3);
    ctx.fillStyle = '#b03a3a';
    ctx.fillRect(cx-22, cy-7, 44, 4);
    ctx.fillStyle = '#d4a36a';
    ctx.beginPath(); ctx.ellipse(cx, cy-20, 24, 8, 0, 0, Math.PI*2); ctx.fill();
    // customer silhouettes
    for (let i = 0; i < 3; i++) {
      const x = w*0.65 + i*w*0.1;
      const y = h*0.55;
      ctx.fillStyle = '#ffb15e';
      ctx.beginPath(); ctx.arc(x, y-14, 10, 0, Math.PI*2); ctx.fill();
      ctx.fillRect(x-8, y-4, 16, 18);
      // patience bar
      const p = ((t*0.4 + i*0.33) % 1);
      ctx.fillStyle = '#000a'; ctx.fillRect(x-12, y-30, 24, 3);
      ctx.fillStyle = p > 0.5 ? '#4ade80' : p > 0.25 ? '#ffd86b' : '#f87171';
      ctx.fillRect(x-12, y-30, 24*p, 3);
    }
  }
});
