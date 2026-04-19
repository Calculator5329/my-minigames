/* BaseGame class. Every game extends this.
   Provides: state machine, shake, particles, sfx hooks, score, time. */
(function () {
  const NDP = (window.NDP = window.NDP || {});
  NDP.Engine = NDP.Engine || {};

  class BaseGame {
    constructor(canvas, manifest) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.w = canvas.width;
      this.h = canvas.height;
      this.manifest = manifest;
      this.id = manifest.id;

      this.state = 'title';   // 'title' | 'playing' | 'paused' | 'over' | 'won'
      this.score = 0;
      this.time = 0;          // seconds since start of current run

      this.particles = new NDP.Engine.ParticleSystem();
      this._shake = 0;
      this._shakeMag = 0;
      this._flash = 0;
      this._flashColor = null;

      this._hudText = '';     // set by games; displayed in top bar
      this._onEndCallbacks = [];

      this._paused = false;
    }

    /* --- Lifecycle hooks — subclasses override --- */
    init() {}
    update(dt) {}
    render(ctx) {}
    onInput(ev) {}
    onEnd(score) {}   // called with final score just before state flips to 'over'/'won'

    /* --- Framework --- */
    begin() {
      this.state = 'playing';
      this.score = 0;
      this.time = 0;
      this.particles.clear();
      this.init();
    }

    _step(dt) {
      if (this.state !== 'playing') return;
      this.time += dt;
      this.update(dt);
      this.particles.update(dt);
      if (this._shake > 0) this._shake = Math.max(0, this._shake - dt);
      if (this._flash > 0) this._flash = Math.max(0, this._flash - dt);
      NDP.Engine.Input.endFrame();
    }

    _draw() {
      const ctx = this.ctx;
      ctx.save();
      if (this._shake > 0) {
        const t = this._shake;
        const m = this._shakeMag * (t > 0.3 ? 1 : t / 0.3);
        ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
      }
      this.render(ctx);
      this.particles.render(ctx);
      ctx.restore();
      if (this._flash > 0 && this._flashColor) {
        ctx.globalAlpha = Math.min(1, this._flash * 2);
        NDP.Engine.Draw.rect(ctx, 0, 0, this.w, this.h, this._flashColor);
        ctx.globalAlpha = 1;
      }
    }

    shake(mag, dur) {
      this._shakeMag = Math.max(this._shakeMag, mag || 6);
      this._shake = Math.max(this._shake, dur || 0.25);
    }

    flash(color, dur) {
      this._flashColor = color;
      this._flash = Math.max(this._flash, dur || 0.15);
    }

    setScore(n) { this.score = n | 0; }
    addScore(n) { this.score = Math.max(0, (this.score | 0) + (n | 0)); }

    pause() { if (this.state === 'playing') this.state = 'paused'; }
    resume() { if (this.state === 'paused') this.state = 'playing'; }
    togglePause() {
      if (this.state === 'playing') this.state = 'paused';
      else if (this.state === 'paused') this.state = 'playing';
    }

    gameOver() {
      if (this.state === 'over' || this.state === 'won') return;
      this.onEnd(this.score);
      this.state = 'over';
    }
    win() {
      if (this.state === 'over' || this.state === 'won') return;
      this.onEnd(this.score);
      this.state = 'won';
    }

    setHud(text) { this._hudText = text; }
    getHud() { return this._hudText; }

    /* Convenience: particle bursts tied to events. */
    spark(x, y, n, color) {
      this.particles.burst(x, y, n || 14, {
        color: color || '#ffd86b', speed: 180, life: 0.5, size: 3, shape: 'circle'
      });
    }

    /* Allow games to register a tiny sound palette via this.sfx.play(name). */
    makeSfx(palette) {
      const audio = NDP.Engine.Audio;
      return {
        play(name, overrides) {
          const base = palette[name];
          if (!base) return;
          audio.beep(Object.assign({}, base, overrides || {}));
        }
      };
    }

    /* Subclasses call to award coins from this run. Default: 1 coin per 25 pts. */
    coinsEarned(score) {
      return Math.max(0, Math.floor(score / 25));
    }
  }

  NDP.Engine.BaseGame = BaseGame;

  /* Registry: manifest.js registers metadata first; game.js attaches the class
     and pushes it into the visible list. */
  NDP._manifests = {};
  NDP.games = [];
  NDP.registerManifest = function (m) {
    NDP._manifests[m.id] = m;
  };
  NDP.attachGame = function (id, klass) {
    const m = NDP._manifests[id];
    if (!m) { console.warn('No manifest for', id); return; }
    m.gameClass = klass;
    if (!NDP.games.includes(m)) NDP.games.push(m);
  };
})();
