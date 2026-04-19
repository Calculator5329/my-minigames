/* Inline SVG sprite atlas.
   Games register SVG strings keyed by name. The engine rasterises each into an
   offscreen canvas the first time it is requested at a given size and caches
   the result. From the game's POV this looks identical to using a bitmap
   sprite — but the source-of-truth is vector, so we get crisp rendering at
   any size and zero file fetches.

   Public API (window.NDP.Engine.Sprites):
     register(key, svgString)             — one-time register
     registerMany({ key: svg, ... })      — batch
     has(key)                             — truthy if registered
     bitmap(key, w, h) -> HTMLCanvas|null — rasterise + cache, return canvas
     draw(ctx, key, x, y, w, h, opts)     — draw centered, opts: rot, flipX, alpha, anchor
     preload(keys, w, h)                  — eager rasterise to avoid first-frame spike

   Notes:
   - Cache key is `${spriteKey}@${w}x${h}` so the same vector can yield several
     bitmaps for different sizes without resampling artefacts.
   - When a fresh bitmap isn't ready yet (Image still decoding), draw() falls
     through to opts.fallback() if provided. In practice rasterisation finishes
     almost instantly because everything is inline data: URIs.
   - The implementation deliberately uses Image.decode() rather than onload so
     drawing into an offscreen canvas is synchronous after the first call.
*/
(function () {
  const NDP = (window.NDP = window.NDP || {});
  NDP.Engine = NDP.Engine || {};

  const sources = Object.create(null);   // key -> svg string
  const cache = Object.create(null);     // "key@WxH" -> HTMLCanvasElement
  const pending = Object.create(null);   // "key@WxH" -> Promise<HTMLCanvasElement|null>

  function svgToDataUri(svg) {
    // Trim whitespace then percent-encode the # and unicode-safe parts.
    // Using base64 keeps payloads compact and decoding fast in Chromium.
    let s = svg.trim();
    if (!/^<svg[\s>]/.test(s)) {
      console.warn('[Sprites] SVG must start with <svg>:', s.slice(0, 60));
    }
    if (!/xmlns=/.test(s)) {
      s = s.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    const b64 = btoa(unescape(encodeURIComponent(s)));
    return 'data:image/svg+xml;base64,' + b64;
  }

  function cacheKey(key, w, h) {
    return key + '@' + (w | 0) + 'x' + (h | 0);
  }

  function rasterise(key, w, h) {
    const ck = cacheKey(key, w, h);
    if (cache[ck]) return Promise.resolve(cache[ck]);
    if (pending[ck]) return pending[ck];
    const svg = sources[key];
    if (!svg) {
      console.warn('[Sprites] missing sprite:', key);
      return Promise.resolve(null);
    }
    const uri = svgToDataUri(svg);
    const img = new Image();
    img.decoding = 'async';
    img.src = uri;
    const p = (img.decode ? img.decode() : new Promise(r => { img.onload = r; img.onerror = r; }))
      .then(() => {
        const c = document.createElement('canvas');
        c.width = Math.max(1, w | 0);
        c.height = Math.max(1, h | 0);
        const cx = c.getContext('2d');
        cx.imageSmoothingEnabled = true;
        cx.imageSmoothingQuality = 'high';
        cx.drawImage(img, 0, 0, c.width, c.height);
        cache[ck] = c;
        delete pending[ck];
        return c;
      })
      .catch(() => { delete pending[ck]; return null; });
    pending[ck] = p;
    return p;
  }

  const Sprites = {
    register(key, svg) {
      sources[key] = svg;
    },
    registerMany(map) {
      for (const k in map) sources[k] = map[k];
    },
    has(key) { return !!sources[key]; },
    sourceOf(key) { return sources[key] || null; },

    /* Synchronous lookup. If the bitmap isn't cached yet, fires off the
       rasterisation and returns null this frame. The next draw with the same
       size will succeed once decode finishes (typically within a frame). */
    bitmap(key, w, h) {
      const ck = cacheKey(key, w, h);
      if (cache[ck]) return cache[ck];
      rasterise(key, w, h);
      return null;
    },

    /* Eager preload — kick off rasterisation now, return promise for callers
       that want to await it. Safe to ignore the promise. */
    preload(keys, w, h) {
      const list = Array.isArray(keys) ? keys : [keys];
      return Promise.all(list.map(k => rasterise(k, w, h)));
    },

    /* Draw centered at (x, y) with size (w, h). opts:
         rot: rotation radians
         flipX: bool (mirror horizontally before drawing)
         alpha: 0..1
         anchor: { x, y } — default {0.5, 0.5} centered. (0,0) = top-left.
         fallback: () => void called when not yet rasterised
    */
    draw(ctx, key, x, y, w, h, opts) {
      const o = opts || {};
      const ax = o.anchor ? o.anchor.x : 0.5;
      const ay = o.anchor ? o.anchor.y : 0.5;
      const bmp = Sprites.bitmap(key, w, h);
      if (!bmp) { if (o.fallback) o.fallback(); return false; }
      ctx.save();
      ctx.translate(x, y);
      if (o.rot) ctx.rotate(o.rot);
      if (o.flipX) ctx.scale(-1, 1);
      if (o.alpha != null) ctx.globalAlpha = Math.max(0, Math.min(1, o.alpha));
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(bmp, -w * ax, -h * ay, w, h);
      ctx.restore();
      return true;
    }
  };

  NDP.Engine.Sprites = Sprites;
})();
