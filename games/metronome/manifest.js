NDP.registerManifest({
  id: 'metronome',
  title: 'Metronome',
  blurb: 'Four lanes. Tap on the beat.',
  description: 'Notes fall down four lanes. Hit the key when a note reaches the target line. Miss three in a row and the song stops. Tempo climbs the longer you survive.',
  controls: 'Lanes: D F J K  ·  Pause: ESC',
  theme: { bg: '#0a0820', accent: '#6cf', accent2: '#f0c' },

  previewDraw(ctx, t, w, h) {
    ctx.fillStyle = '#0a0820'; ctx.fillRect(0, 0, w, h);
    // Four lanes
    const laneW = (w - 40) / 4;
    const targetY = h - 36;
    const colors = ['#ff4fd8', '#6cf', '#6cff9a', '#ffd86b'];
    for (let i = 0; i < 4; i++) {
      const lx = 20 + i * laneW;
      ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fillRect(lx + 4, 10, laneW - 8, h - 20);
      // Falling notes
      for (let n = 0; n < 3; n++) {
        const ny = ((t * 80 + n * 80 + i * 30) % h) - 10;
        ctx.fillStyle = colors[i];
        ctx.fillRect(lx + 8, ny, laneW - 16, 10);
      }
      // Target bar
      ctx.fillStyle = '#fff';
      ctx.fillRect(lx + 4, targetY, laneW - 8, 2);
    }
    // Pulse beat at top
    const pulse = 0.5 + 0.5 * Math.sin(t * 6);
    ctx.fillStyle = `rgba(255,255,255,${0.2 + pulse * 0.5})`;
    ctx.fillRect(0, 0, w, 4);
  }
});
