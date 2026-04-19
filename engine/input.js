/* Input abstraction: keys held, mouse pos, click/press listeners.
   Games read via NDP.Engine.Input; the engine wires events to whatever is
   currently mounted. */
(function () {
  const NDP = (window.NDP = window.NDP || {});
  NDP.Engine = NDP.Engine || {};

  const Input = {
    keys: Object.create(null),
    mouse: { x: 0, y: 0, down: false, justPressed: false, justReleased: false },
    _listeners: { keydown: [], keyup: [], mousedown: [], mouseup: [], mousemove: [] },
    _bound: null,
    _canvas: null,

    attach(canvas) {
      this._canvas = canvas;
      const self = this;

      const handlers = {
        keydown: (e) => {
          self.keys[e.key] = true;
          self.keys[e.code] = true;
          self._listeners.keydown.forEach(fn => fn(e));
        },
        keyup: (e) => {
          self.keys[e.key] = false;
          self.keys[e.code] = false;
          self._listeners.keyup.forEach(fn => fn(e));
        },
        mousedown: (e) => {
          self._updateMouse(e);
          self.mouse.down = true;
          self.mouse.justPressed = true;
          self._listeners.mousedown.forEach(fn => fn(e));
        },
        mouseup: (e) => {
          self._updateMouse(e);
          self.mouse.down = false;
          self.mouse.justReleased = true;
          self._listeners.mouseup.forEach(fn => fn(e));
        },
        mousemove: (e) => {
          self._updateMouse(e);
          self._listeners.mousemove.forEach(fn => fn(e));
        },
        contextmenu: (e) => e.preventDefault()
      };

      window.addEventListener('keydown', handlers.keydown);
      window.addEventListener('keyup', handlers.keyup);
      canvas.addEventListener('mousedown', handlers.mousedown);
      window.addEventListener('mouseup', handlers.mouseup);
      canvas.addEventListener('mousemove', handlers.mousemove);
      canvas.addEventListener('contextmenu', handlers.contextmenu);

      this._bound = { canvas, handlers };
    },

    detach() {
      if (!this._bound) return;
      const { canvas, handlers } = this._bound;
      window.removeEventListener('keydown', handlers.keydown);
      window.removeEventListener('keyup', handlers.keyup);
      canvas.removeEventListener('mousedown', handlers.mousedown);
      window.removeEventListener('mouseup', handlers.mouseup);
      canvas.removeEventListener('mousemove', handlers.mousemove);
      canvas.removeEventListener('contextmenu', handlers.contextmenu);
      this._bound = null;
      this._canvas = null;
      this.keys = Object.create(null);
      this._listeners = { keydown: [], keyup: [], mousedown: [], mouseup: [], mousemove: [] };
      this.mouse = { x: 0, y: 0, down: false, justPressed: false, justReleased: false };
    },

    _updateMouse(e) {
      if (!this._canvas) return;
      const r = this._canvas.getBoundingClientRect();
      const sx = this._canvas.width / r.width;
      const sy = this._canvas.height / r.height;
      this.mouse.x = (e.clientX - r.left) * sx;
      this.mouse.y = (e.clientY - r.top) * sy;
    },

    // Call once per frame at end of update to clear one-frame flags.
    endFrame() {
      this.mouse.justPressed = false;
      this.mouse.justReleased = false;
    },

    on(evt, fn) { this._listeners[evt] && this._listeners[evt].push(fn); },
    off(evt, fn) {
      if (!this._listeners[evt]) return;
      const i = this._listeners[evt].indexOf(fn);
      if (i >= 0) this._listeners[evt].splice(i, 1);
    }
  };

  NDP.Engine.Input = Input;
})();
