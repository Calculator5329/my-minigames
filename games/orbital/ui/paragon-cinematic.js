/* Orbital — paragon unlock cinematic.
   ~1.2s sequence on purchase: screen flash + radial particles (immediate),
   banner slides in at top, sim frozen for the duration. Transient state
   lives on game._paragonFx. */
(function () {
  const NDP = window.NDP;
  const O = NDP.Orbital;

  const DURATION = 1.2;

  function start(game, tower, paragonDef) {
    game._paragonFx = {
      t: 0,
      tower,
      name: paragonDef.name,
      accent: paragonDef.accent || '#ffd86b'
    };
    if (game.particles && game.particles.burst) {
      game.particles.burst(tower.x, tower.y, 120, {
        color: paragonDef.accent || '#ffd86b',
        life: 1.2, speed: 400, size: 5
      });
    }
    if (game.flash) game.flash(paragonDef.accent || '#ffd86b', 0.45);
  }

  function tick(game, dt) {
    if (!game._paragonFx) return;
    game._paragonFx.t += dt;
    if (game._paragonFx.t >= DURATION) game._paragonFx = null;
  }

  function active(game) { return !!game._paragonFx; }

  function draw(ctx, game) {
    const fx = game._paragonFx;
    if (!fx) return;
    const p = Math.min(1, fx.t / DURATION);
    const slideIn = Math.min(1, p * 3);
    const slideOut = Math.max(0, 1 - Math.max(0, (p - 0.75) * 4));
    const alpha = Math.min(slideIn, slideOut);
    const bannerY = 60 - (1 - slideIn) * 40;
    const panelW = (game.panel && game.panel.w) || 0;
    const cx = (game.canvas.width - panelW) / 2;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = 'bold 28px ui-sans-serif, system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = fx.accent;
    ctx.shadowBlur = 20;
    ctx.fillStyle = fx.accent;
    ctx.fillText('\u2605 ' + fx.name.toUpperCase() + ' \u2605', cx, bannerY);
    ctx.restore();
  }

  O.ParagonCinematic = { start, tick, draw, active };
})();
