NDP.registerManifest({
  id: 'depths',
  title: 'Depths',
  blurb: 'Classic roguelike. 8 floors. One life.',
  description: 'Descend through procedurally generated dungeons. Turn-based grid combat, fog of war, items, potions, scrolls, weapons, armor. Eight floors, a throne room, and one chance to return with the Heartstone.',
  controls: 'Move/attack: ARROWS or WASD  ·  Wait: .  ·  Pick up: G  ·  Use item: 1-9  ·  Descend: >',
  theme: { bg: '#0a0a12', accent: '#ffcc66', accent2: '#66b3ff' },

  previewDraw(ctx, t, w, h) {
    ctx.fillStyle = '#0a0a12'; ctx.fillRect(0,0,w,h);
    // torchlight tile grid
    const ts = 14;
    const cols = Math.floor(w/ts), rows = Math.floor(h/ts);
    const cx = cols/2, cy = rows/2;
    for (let y=0;y<rows;y++) for (let x=0;x<cols;x++) {
      const d = Math.hypot(x-cx, y-cy);
      const flick = 0.15*Math.sin(t*3 + x*0.3 + y*0.5);
      const lit = Math.max(0, 1 - d/7 + flick);
      if (lit <= 0.05) continue;
      // wall/floor pattern
      const wall = ((x*73856093) ^ (y*19349663)) & 1 && d > 2.5 && Math.random() > 0.5;
      const base = wall ? [70,60,50] : [30,24,22];
      const r = Math.floor(base[0]*lit), g = Math.floor(base[1]*lit), b = Math.floor(base[2]*lit);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x*ts, y*ts, ts-1, ts-1);
    }
    // player @
    const px = Math.floor(cx)*ts, py = Math.floor(cy)*ts;
    ctx.fillStyle = '#ffe08a';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('@', px+ts/2, py+ts/2);
    // enemies around
    const enemies = [['g','#88d080',-3,-1],['k','#c06060',2,-2],['r','#b0a070',3,2],['s','#a080c0',-2,2]];
    enemies.forEach(([ch,col,dx,dy])=>{
      const ox = (Math.floor(cx)+dx)*ts, oy=(Math.floor(cy)+dy)*ts;
      ctx.fillStyle = col;
      ctx.fillText(ch, ox+ts/2, oy+ts/2);
    });
    // stairs
    ctx.fillStyle = '#ffcc66';
    ctx.fillText('>', (Math.floor(cx)+4)*ts+ts/2, (Math.floor(cy)+0)*ts+ts/2);
    // title vignette
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0,h-22,w,22);
    ctx.fillStyle = '#ffcc66';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('HP 20/20   ATK 4   DEF 2   Floor 1', 8, h-7);
  }
});
