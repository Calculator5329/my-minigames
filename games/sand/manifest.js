NDP.registerManifest({
  id: 'sand',
  title: 'Sand',
  blurb: 'Build logic from gates. Climb to an ALU.',
  description: 'Learn digital logic hands-on. Start with AND, OR, NOT and build up through adders, multiplexers, flip-flops, and a 4-bit ALU. Drag gates from the palette; wire outputs to inputs; chase 3-star solutions by minimizing gate count.',
  controls: 'Drag gate from palette onto canvas \u00b7 Drag output port to input port to wire \u00b7 Click input pad to toggle \u00b7 Right-drag pans \u00b7 Wheel zooms \u00b7 Delete removes selected',
  theme: { bg: '#0a0f1a', accent: '#ffd86b', accent2: '#7ae0ff' },
  assets: [],
  previewDraw(ctx, t, w, h) {
    // Simple animated AND-gate vignette.
    ctx.fillStyle = '#0a0f1a';
    ctx.fillRect(0, 0, w, h);
    // Grid dots.
    ctx.fillStyle = '#1a2240';
    for (let gx = 10; gx < w; gx += 20) for (let gy = 10; gy < h; gy += 20) ctx.fillRect(gx, gy, 1, 1);
    // Gate body (AND shape) centered.
    const cx = w / 2, cy = h / 2;
    ctx.strokeStyle = '#ffd86b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 28, cy - 16);
    ctx.lineTo(cx + 0,  cy - 16);
    ctx.arc(cx, cy, 16, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(cx - 28, cy + 16);
    ctx.closePath();
    ctx.stroke();
    // Input wires: animate 0/1 on A; B steady 1.
    const a = (Math.floor(t) % 2) === 0 ? 0 : 1;
    ctx.strokeStyle = a ? '#ffd86b' : '#4a5266';
    ctx.beginPath(); ctx.moveTo(cx - 60, cy - 8); ctx.lineTo(cx - 28, cy - 8); ctx.stroke();
    ctx.strokeStyle = '#ffd86b';
    ctx.beginPath(); ctx.moveTo(cx - 60, cy + 8); ctx.lineTo(cx - 28, cy + 8); ctx.stroke();
    // Output wire.
    ctx.strokeStyle = (a && 1) ? '#ffd86b' : '#4a5266';
    ctx.beginPath(); ctx.moveTo(cx + 16, cy); ctx.lineTo(cx + 60, cy); ctx.stroke();
  }
});
