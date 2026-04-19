/* Canvas drawing primitives + particle system + screen shake.
   Games use these so visual polish is consistent and cheap. */
(function () {
  const NDP = (window.NDP = window.NDP || {});
  NDP.Engine = NDP.Engine || {};

  const TAU = Math.PI * 2;

  const Draw = {
    clear(ctx, color) {
      ctx.fillStyle = color || '#000';
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    },

    rect(ctx, x, y, w, h, fill) {
      ctx.fillStyle = fill;
      ctx.fillRect(x, y, w, h);
    },

    rectOutline(ctx, x, y, w, h, stroke, lw) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lw || 1;
      ctx.strokeRect(x, y, w, h);
    },

    circle(ctx, x, y, r, fill) {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    },

    circleOutline(ctx, x, y, r, stroke, lw) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lw || 1;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.stroke();
    },

    line(ctx, x1, y1, x2, y2, stroke, lw) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lw || 1;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    },

    text(ctx, s, x, y, opts) {
      opts = opts || {};
      ctx.fillStyle = opts.color || '#fff';
      ctx.font = (opts.weight || '600') + ' ' + (opts.size || 16) + 'px ' + (opts.font || 'ui-monospace, Menlo, monospace');
      ctx.textAlign = opts.align || 'left';
      ctx.textBaseline = opts.baseline || 'alphabetic';
      ctx.fillText(s, x, y);
    },

    glow(ctx, color, blur, fn) {
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = blur;
      fn();
      ctx.restore();
    },

    // Draw `fn` once with a glow pass (big blur), then again crisp. Cheap neon.
    neon(ctx, color, blur, fn) {
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = blur;
      fn();
      ctx.shadowBlur = blur / 2;
      fn();
      ctx.restore();
    },

    polygon(ctx, points, fill, stroke, lw) {
      if (points.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
      ctx.closePath();
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
    },

    gradient(ctx, x1, y1, x2, y2, stops) {
      const g = ctx.createLinearGradient(x1, y1, x2, y2);
      stops.forEach(([t, c]) => g.addColorStop(t, c));
      return g;
    }
  };

  // ---------- Particle system ----------
  // Hard cap on simultaneous particles. Purely cosmetic — over the cap we
  // silently drop new emits, which keeps mass-death moments from spiking
  // GC + render time without changing any gameplay-visible state.
  const PARTICLE_CAP = 600;

  class ParticleSystem {
    constructor() { this.list = []; }

    emit(opts) {
      if (this.list.length >= PARTICLE_CAP) return null;
      // opts: x,y,vx,vy,ax,ay,life,size,color,fade,shrink,gravity,shape
      const p = {
        x: opts.x || 0, y: opts.y || 0,
        vx: opts.vx || 0, vy: opts.vy || 0,
        ax: opts.ax || 0, ay: opts.ay || 0,
        life: opts.life || 0.6,
        age: 0,
        size: opts.size || 3,
        color: opts.color || '#fff',
        fade: opts.fade !== false,
        shrink: opts.shrink !== false,
        gravity: opts.gravity || 0,
        shape: opts.shape || 'circle',
        drag: opts.drag || 0
      };
      this.list.push(p);
      return p;
    }

    burst(x, y, n, opts) {
      opts = opts || {};
      const speed = opts.speed || 120;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU;
        const s = speed * (0.3 + Math.random() * 0.9);
        this.emit(Object.assign({}, opts, {
          x, y,
          vx: Math.cos(a) * s, vy: Math.sin(a) * s,
          life: (opts.life || 0.5) * (0.6 + Math.random() * 0.8)
        }));
      }
    }

    update(dt) {
      // Compact in place via swap-and-pop: dead particles are overwritten
      // by the live one at the tail, then the tail is popped. O(1) removal
      // per particle vs splice's O(n) shift — matters once the list is
      // hundreds long, which mass deaths in late freeplay can produce.
      const list = this.list;
      let n = list.length;
      for (let i = 0; i < n; ) {
        const p = list[i];
        p.age += dt;
        if (p.age >= p.life) {
          list[i] = list[n - 1];
          n--;
          continue;
        }
        p.vx += (p.ax || 0) * dt;
        p.vy += ((p.ay || 0) + (p.gravity || 0)) * dt;
        if (p.drag) { p.vx *= (1 - p.drag * dt); p.vy *= (1 - p.drag * dt); }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        i++;
      }
      list.length = n;
    }

    render(ctx) {
      for (const p of this.list) {
        const t = p.age / p.life;
        const alpha = p.fade ? (1 - t) : 1;
        const size = p.shrink ? p.size * (1 - t) : p.size;
        ctx.globalAlpha = Math.max(0, alpha);
        if (p.shape === 'rect') {
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x - size, p.y - size, size * 2, size * 2);
        } else if (p.shape === 'streak') {
          ctx.strokeStyle = p.color;
          ctx.lineWidth = Math.max(0.5, size);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04);
          ctx.stroke();
        } else {
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(0.2, size), 0, TAU);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }

    clear() { this.list.length = 0; }
    count() { return this.list.length; }
  }

  NDP.Engine.Draw = Draw;
  NDP.Engine.ParticleSystem = ParticleSystem;
  NDP.Engine.TAU = TAU;

  // small color helpers
  NDP.Engine.Color = {
    alpha(hex, a) {
      const h = hex.replace('#', '');
      const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16);
      return `rgba(${r},${g},${b},${a})`;
    },
    lerp(a, b, t) {
      const pa = a.replace('#',''), pb = b.replace('#','');
      const ar = parseInt(pa.slice(0,2),16), ag = parseInt(pa.slice(2,4),16), ab = parseInt(pa.slice(4,6),16);
      const br = parseInt(pb.slice(0,2),16), bg = parseInt(pb.slice(2,4),16), bb = parseInt(pb.slice(4,6),16);
      const r = (ar + (br-ar)*t) | 0;
      const g = (ag + (bg-ag)*t) | 0;
      const bC = (ab + (bb-ab)*t) | 0;
      return `rgb(${r},${g},${bC})`;
    }
  };
})();
