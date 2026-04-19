/* Asset loader: images + audio samples with graceful fallback.
   Games call Assets.img('key') / Assets.hasImg('key') / Assets.sfx('key').
   If the file is missing (404 or pre-fetch), img() returns null — games should
   then fall back to procedural drawing. No network is required at runtime if
   the user has run `node scripts/fetch-assets.js` once. */
(function () {
  const NDP = (window.NDP = window.NDP || {});
  NDP.Engine = NDP.Engine || {};

  const imgs = Object.create(null);     // key -> HTMLImageElement (loaded)
  const imgsPending = Object.create(null);  // key -> Promise
  const imgsFailed = new Set();
  const audios = Object.create(null);   // key -> HTMLAudioElement

  function loadImage(key, src) {
    if (imgs[key]) return Promise.resolve(imgs[key]);
    if (imgsPending[key]) return imgsPending[key];
    const img = new Image();
    const p = new Promise((resolve) => {
      img.onload = () => { imgs[key] = img; resolve(img); };
      img.onerror = () => { imgsFailed.add(key); resolve(null); };
      img.src = src;
    });
    imgsPending[key] = p;
    return p;
  }

  function loadAudio(key, src, volume) {
    if (audios[key]) return audios[key];
    const a = new Audio();
    a.src = src;
    a.preload = 'auto';
    a.volume = volume == null ? 0.6 : volume;
    audios[key] = a;
    return a;
  }

  /* Play an audio sample (if loaded) by cloning, so overlapping plays work.
     Silently no-ops if the file is absent. Respects engine mute. */
  function playAudio(key, volume) {
    const a = audios[key];
    if (!a) return;
    if (NDP.Engine.Audio && NDP.Engine.Audio.isMuted && NDP.Engine.Audio.isMuted()) return;
    try {
      const clone = a.cloneNode();
      clone.volume = volume == null ? a.volume : volume;
      clone.play().catch(() => {});
    } catch (e) { /* ignore */ }
  }

  /* Preload an array of { key, src, type, volume } asset descriptors.
     Returns a Promise that resolves once all image attempts settle (audio is
     loaded lazily by the browser — we just register references). */
  function preload(list) {
    const promises = [];
    for (const a of list) {
      if (a.type === 'audio') {
        loadAudio(a.key, a.src, a.volume);
      } else {
        promises.push(loadImage(a.key, a.src));
      }
    }
    return Promise.all(promises);
  }

  const Assets = {
    preload,
    img(key) { return imgs[key] || null; },
    hasImg(key) { return !!imgs[key]; },
    failedImg(key) { return imgsFailed.has(key); },
    sfx: playAudio,
    audio(key) { return audios[key] || null; },
    /* Draw helper that draws an image centered, or calls fallback() if missing.
       `rot` optional (radians). `flipX` flips horizontally. */
    draw(ctx, key, x, y, w, h, opts) {
      const img = imgs[key];
      const o = opts || {};
      if (!img) { if (o.fallback) o.fallback(); return false; }
      ctx.save();
      ctx.translate(x, y);
      if (o.rot) ctx.rotate(o.rot);
      if (o.flipX) ctx.scale(-1, 1);
      if (o.alpha != null) ctx.globalAlpha = o.alpha;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
      ctx.restore();
      return true;
    },
    /* Draw a tile from a sprite sheet. sx,sy,sw,sh = source rect in sheet. */
    drawTile(ctx, key, sx, sy, sw, sh, dx, dy, dw, dh, opts) {
      const img = imgs[key];
      const o = opts || {};
      if (!img) { if (o.fallback) o.fallback(); return false; }
      ctx.save();
      if (o.flipX) {
        ctx.translate(dx + dw, dy);
        ctx.scale(-1, 1);
        dx = 0; dy = 0;
      }
      if (o.alpha != null) ctx.globalAlpha = o.alpha;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
      ctx.restore();
      return true;
    }
  };

  NDP.Engine.Assets = Assets;

  /* Registry for per-game asset declarations — games call
     Assets.register(id, [...]); main.js calls Assets.preload once on boot. */
  const registry = {};
  Assets.register = function (gameId, list) { registry[gameId] = list; };
  Assets.registryAll = function () {
    const all = [];
    Object.values(registry).forEach(list => all.push(...list));
    return all;
  };
})();
