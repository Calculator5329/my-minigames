/* 418 Linden — main game class. Owns night progression (1→4 switchboard,
   5 walkthrough), input → board routing, listen-in, save tracking. */
(function () {
  const NDP = window.NDP;
  const { BaseGame, Input, Storage } = NDP.Engine;
  const SB = NDP.switchboard;

  const W = 960, H = 600;

  class SwitchboardGame extends BaseGame {
    init() {
      const save = Storage.getGameData('switchboard') || {};
      this.save = { bestNight: save.bestNight || 0, endings: save.endings || {} };

      this.currentNight = 1;
      this.phase = 'intro';        // 'intro' | 'board' | 'walk' | 'done'
      this.board = SB.Board.makeBoard();
      this.nightState = null;           // nights.js state
      this.walk = null;             // walkthrough state
      this.drag = null;             // { cable, end }
      this.listening = false;
      this.focusHint = null;
      this.flags = {
        halberd_listened: false,
        halberd_calls_total: 0,
        final_self_call: null
      };
      // Night 1 onboarding: a 4-step coach mark sequence that advances when
      // the player does the thing it's prompting for. Once the player finishes
      // their first successful route on Night 1 the tutorial dismisses for
      // the rest of the run.
      //   0 = waiting for first ringing call
      //   1 = call is ringing, waiting for the player to click the lamp
      //   2 = call answered, waiting for the player to hold L
      //   3 = listening, waiting for a successful route
      //   4 = done, never show again
      this.tutorialStep = 0;
      this.tutorialDoneOnce = false;
      this.loadNight(this.currentNight);
      this.ambient = makeAmbient();
      this._inputBound = false;
      this.setHud(`<span>Night <b>${this.currentNight}</b> / 5</span>`);
    }

    loadNight(n) {
      SB.Voices.stopAll();
      // Escalation 0..1 used by the voice chain (more reverb / hiss / lower
      // bandpass ceiling as nights progress).
      SB.Voices.setEscalation(Math.min(1, (n - 1) / 4));
      this.phase = 'intro';
      this.introT = 0;
      if (n === 5) {
        this.nightState = null;
        this.walk = SB.Walk.startWalkthrough(SB.NIGHT5, this.flags);
        return;
      }
      const night = SB.NIGHTS[n - 1];
      this.nightState = SB.Nights.startNight(night);
      // Carry persistent flags across nights (halberd_listened survives).
      this.nightState.flags.halberd_listened = this.flags.halberd_listened;
      this.nightState.flags.halberd_calls_total = this.flags.halberd_calls_total;
      this.nightState.flags.final_self_call = this.flags.final_self_call;
      this.board = SB.Board.makeBoard();
    }

    update(dt) {
      if (!this._inputBound) {
        Input.on('mousedown', (e) => this._mouseDown(e));
        Input.on('mouseup', (e) => this._mouseUp(e));
        Input.on('keydown', (e) => this._keyDown(e));
        Input.on('keyup', (e) => this._keyUp(e));
        this._inputBound = true;
      }

      // Ambient hum pitch slides down over nights
      if (this.ambient) this.ambient.update(dt, this.nightState?.night.ambientPitch || this.walk?.n5.ambientPitch || 1);

      if (this.phase === 'intro') {
        this.introT += dt;
        // Night 1 has the long onboarding intro; later nights are short.
        const introDur = this.currentNight === 1 ? 9.0 : 3.2;
        if (this.introT >= introDur || Input.mouse.justPressed || Input.keys['Enter']) {
          this.phase = (this.currentNight === 5) ? 'walk' : 'board';
        }
        return;
      }

      if (this.phase === 'board' && this.nightState) {
        this._tickBoard(dt);
      } else if (this.phase === 'walk' && this.walk) {
        const hooks = {
          speak: (voice, text, id) => SB.Voices.play(id || ('walk_' + Math.random()), { voice, text }),
          narrate: (line) => {
            SB.Voices.play('narrate_' + Math.random(), { voice: 'you', text: line });
          },
          endingStart: (key) => {
            this.save.endings[key] = (this.save.endings[key] || 0) + 1;
            this.save.bestNight = 5;
            Storage.setGameData('switchboard', this.save);
          }
        };
        SB.Walk.tick(this.walk, dt, Input, hooks);

        // End of ending roll → game over
        if (this.walk.mode === 'ending' && this.walk.endingText
            && this.walk.endingIdx >= this.walk.endingText.length
            && this.walk.endingCd <= -3) {
          this.setScore(this._scoreFor(this.walk.endingKey));
          this.win();
        } else if (this.walk.mode === 'ending') {
          // allow it to finish rolling
        }
      }
    }

    _tickBoard(dt) {
      const st = this.nightState;
      const hooks = {
        ring: (c) => {
          SB.Voices.ring();
          SB.Voices.prefetchTranscript(this._cid(c));
        },
        missed: (c) => { this.flash('#d84a48', 0.15); },
        wrong: (c) => { this.flash('#d84a48', 0.25); this.shake(6, 0.2); SB.Voices.stop(this._cid(c)); },
        correct: (c) => { this.flash('#6cff9a', 0.1); SB.Voices.stop(this._cid(c)); },
        denied: (c) => { SB.Voices.stop(this._cid(c)); },
        answered: (c) => {
          SB.Voices.pickupBlip();
          SB.Voices.play(this._cid(c), { voice: c.voice, text: c.text });
        },
        whisper: (c) => {
          SB.Voices.whisper(this._wcid(c), { voice: c.voice, text: c.text });
          this.focusHint = c.text;
          this.focusHintT = 3.0;
        }
      };
      SB.Nights.tick(st, dt, hooks);

      // Update jack position while dragging
      if (this.drag) {
        this.drag.cable[this.drag.end].x = Input.mouse.x;
        this.drag.cable[this.drag.end].y = Input.mouse.y;
      }

      // Listen consumes no time hard, but we tag the flag for "halberd_listened"
      if (this.listening && st.focused) {
        SB.Nights.listenTick(st, st.focused, dt);
        if (st.focused.voice === 'halberd') this.flags.halberd_listened = true;
      }

      // Tutorial step machine — Night 1 only, and only until the first
      // successful route is committed. Each transition is monotone, so we
      // can't accidentally rewind if the player drops a call.
      if (this.currentNight === 1 && !this.tutorialDoneOnce) {
        if (this.tutorialStep === 0 && st.ringing.size > 0) this.tutorialStep = 1;
        if (this.tutorialStep === 1 && st.focused) this.tutorialStep = 2;
        if (this.tutorialStep === 2 && this.listening && st.focused) this.tutorialStep = 3;
      }

      // Score = composure + listen bonus, per night
      this.setScore(Math.floor(st.composure));

      // Transient hint fade
      if (this.focusHintT > 0) this.focusHintT -= dt;

      // HUD
      this.setHud(`<span>Night <b>${this.currentNight}</b> / 5</span>` +
                  `<span>Composure <b>${st.composure | 0}</b></span>` +
                  `<span>Calls <b>${st.active.size + st.ringing.size}</b></span>` +
                  (st.focused && st.focused.voice ? `<span style="color:#c7a35a">${SB.VOICES[st.focused.voice].name}</span>` : ''));

      // End-of-night
      if (st.done) {
        this.flags.halberd_listened = this.flags.halberd_listened || st.flags.halberd_listened;
        this.flags.halberd_calls_total += st.flags.halberd_calls_total;
        if (st.flags.final_self_call != null) this.flags.final_self_call = st.flags.final_self_call;

        if (st.outcome === 'broken') {
          this.setScore(Math.max(0, this.score - 50));
          this.gameOver();
          return;
        }
        // Advance to next night
        this.save.bestNight = Math.max(this.save.bestNight, this.currentNight);
        Storage.setGameData('switchboard', this.save);
        this.currentNight++;
        if (this.currentNight > 5) {
          // No Night 5 reached without walkthrough — shouldn't happen
          this.win();
          return;
        }
        this.loadNight(this.currentNight);
      }
    }

    _cid(c) { return `n${this.currentNight}_c${c.idx}`; }
    /* Whisper IDs are stable per night-and-call so the generator script can
       optionally bake matching files (whisper_n3_c3.mp3, etc). */
    _wcid(c) { return `whisper_n${this.currentNight}_c${c.idx}`; }

    _mouseDown(e) {
      if (this.phase !== 'board' || !this.nightState) return;
      const mx = Input.mouse.x, my = Input.mouse.y;
      // Prefer grabbing a jack first
      const picked = SB.Board.pickJack(this.board, mx, my);
      if (picked) {
        SB.Board.detachJack(picked.cable[picked.end]);
        this.drag = picked;
        return;
      }
      // Otherwise, clicking a ringing incoming lamp answers it.
      for (const s of this.board.sockets) {
        if (s.side !== 'in') continue;
        if (Math.hypot(s.x - mx, s.y - my) < 22 && this.nightState.ringing.has(s.line)) {
          SB.Nights.answer(this.nightState, s.line, {
            ring: () => {}, missed: () => {}, wrong: () => {}, correct: () => {}, denied: () => {},
            answered: (c) => {
              SB.Voices.pickupBlip();
              SB.Voices.play(this._cid(c), { voice: c.voice, text: c.text });
            },
            whisper: () => {}
          });
          return;
        }
        // Clicking an already-active call focuses it
        if (Math.hypot(s.x - mx, s.y - my) < 22 && this.nightState.active.has(s.line)) {
          this.nightState.focused = this.nightState.active.get(s.line);
          return;
        }
      }
    }

    _mouseUp(e) {
      if (this.phase !== 'board' || !this.nightState || !this.drag) return;
      const mx = Input.mouse.x, my = Input.mouse.y;
      const socket = SB.Board.pickSocket(this.board, mx, my);
      const cable = this.drag.cable;
      const end = this.drag.end;
      if (socket) {
        // Snap jack to the socket and check if the cable now forms a full route
        SB.Board.attachJackTo(cable[end], socket);
        // If the socket is an incoming ring, auto-answer if unanswered
        if (socket.side === 'in' && this.nightState.ringing.has(socket.line)) {
          SB.Nights.answer(this.nightState, socket.line, {
            ring: ()=>{}, missed: ()=>{}, wrong: ()=>{}, correct: ()=>{}, denied: ()=>{},
            answered: (c) => {
              SB.Voices.pickupBlip();
              SB.Voices.play(this._cid(c), { voice: c.voice, text: c.text });
            },
            whisper: ()=>{}
          });
        }
        // Check route when both ends are on sockets of different sides
        const ea = cable.a.socket, eb = cable.b.socket;
        if (ea && eb && ea.side !== eb.side) {
          const inSock = ea.side === 'in' ? ea : eb;
          const outSock = ea.side === 'out' ? ea : eb;
          const res = SB.Nights.commitRoute(this.nightState, inSock.line, outSock.line, {
            wrong: () => { this.flash('#d84a48', 0.2); this.shake(6, 0.2); },
            correct: () => {
              this.flash('#6cff9a', 0.1);
              if (this.currentNight === 1 && this.tutorialStep === 3) {
                this.tutorialStep = 4;
                this.tutorialDoneOnce = true;
              }
            },
            denied: () => {}
          });
          // After a route is committed, pop the jacks back to parked so
          // the cable is reusable.
          setTimeout(() => {
            cable.a.socket = null; cable.b.socket = null;
            cable.a.parked = true; cable.b.parked = true;
            const base = 180 + cable.id * 150;
            cable.a.x = base; cable.a.y = 520;
            cable.b.x = base + 24; cable.b.y = 520;
          }, 400);
        }
      } else {
        // Return to parked
        cable[end].parked = true;
        const base = 180 + cable.id * 150;
        cable[end].x = base + (end === 'b' ? 24 : 0);
        cable[end].y = 520;
      }
      this.drag = null;
    }

    _keyDown(e) {
      if (e.key === 'l' || e.key === 'L') {
        this.listening = true;
        SB.Voices.setListening(true);
      }
      if ((e.key === 'd' || e.key === 'D') && this.nightState && this.nightState.focused) {
        const line = this.nightState.focused.line;
        SB.Nights.denyCall(this.nightState, line, { denied: (c) => { SB.Voices.stop(this._cid(c)); } });
      }
    }
    _keyUp(e) {
      if (e.key === 'l' || e.key === 'L') {
        this.listening = false;
        SB.Voices.setListening(false);
      }
    }

    render(ctx) {
      if (this.phase === 'intro') return this._drawIntro(ctx);
      if (this.phase === 'board' && this.nightState) return this._drawBoard(ctx);
      if (this.phase === 'walk' && this.walk) return SB.Walk.render(ctx, this.walk);
    }

    _drawIntro(ctx) {
      ctx.fillStyle = '#0a0608'; ctx.fillRect(0, 0, W, H);
      const text = (this.currentNight === 5 ? SB.NIGHT5.intro : SB.NIGHTS[this.currentNight - 1].intro).split('\n');
      ctx.fillStyle = '#c7a35a';
      ctx.font = 'bold 28px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const flick = Math.random() < 0.02 ? 0.3 : 1;
      ctx.globalAlpha = flick;
      ctx.fillText(text[0] || '', W / 2, H / 2 - 20);
      ctx.font = '14px ui-monospace, monospace';
      ctx.fillStyle = '#a58a5a';
      for (let i = 1; i < text.length; i++) {
        ctx.fillText(text[i], W / 2, H / 2 + 20 + (i - 1) * 22);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#6a4a2a';
      ctx.font = '12px ui-monospace, monospace';
      ctx.fillText('click or press Enter to begin', W / 2, H - 60);
    }

    _drawBoard(ctx) {
      const st = this.nightState;
      SB.Board.render(ctx, this.board, {
        time: this.time,
        ringing: st.ringing,
        active: st.active,
        focused: st.focused,
        directory: st.directory,
        composure: st.composure,
        composureMax: st.composureMax,
        listening: this.listening,
        escalation: Math.min(1, (this.currentNight - 1) / 4),
        currentNight: this.currentNight,
        hudRight: `NIGHT ${this.currentNight} — ${Math.max(0, (st.night.durationSec - st.t) | 0)}s`
      });

      // Cable preview while dragging over a socket (snap target glow)
      if (this.drag) {
        const mx = Input.mouse.x, my = Input.mouse.y;
        const target = SB.Board.pickSocket(this.board, mx, my);
        if (target) {
          ctx.strokeStyle = '#ffec7a'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(target.x, target.y, 18, 0, Math.PI * 2); ctx.stroke();
        }
      }

      // Listening indicator
      if (this.listening && st.focused) {
        ctx.fillStyle = '#ffec7a';
        ctx.font = 'bold 12px ui-monospace, monospace';
        ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
        ctx.fillText('\u25CE listening…', W - 16, H - 10);
      }

      // Whisper overlay on dead channels
      if (this.focusHintT > 0 && this.focusHint) {
        ctx.fillStyle = `rgba(220,200,180,${Math.min(1, this.focusHintT / 1.5)})`;
        ctx.font = 'italic 13px ui-monospace, monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('"' + this.focusHint + '"', W / 2, 60);
      }

      // Night-1 coach marks
      if (this.currentNight === 1 && this.tutorialStep > 0 && this.tutorialStep < 4) {
        this._drawTutorial(ctx);
      }
    }

    /* Step-by-step coach marks for Night 1. Each step paints a banner under
       the header explaining the next action and (when meaningful) draws a
       pulsing arrow toward the relevant element on the board. */
    _drawTutorial(ctx) {
      const st = this.nightState;
      let title = '', sub = '', arrow = null;

      if (this.tutorialStep === 1) {
        title = 'STEP 1 — ANSWER THE CALL';
        sub = 'Click the glowing lamp on the INCOMING row.';
        // Arrow at the first ringing socket
        const first = st.ringing.values().next().value;
        if (first) {
          const sock = this.board.sockets.find(s => s.side === 'in' && s.line === first.line);
          if (sock) arrow = { x: sock.x, y: sock.y - 26, dir: 'down' };
        }
      } else if (this.tutorialStep === 2) {
        title = 'STEP 2 — LEAN IN';
        sub = 'Press and HOLD the [L] key to hear what the caller wants.';
        // Arrow at the caller card
        arrow = { x: 240, y: 360, dir: 'down' };
      } else if (this.tutorialStep === 3) {
        const want = st.focused && st.focused.request;
        const wantLine = want && st.directory ? st.directory[want] : null;
        const inLine = st.focused && st.focused.line;
        title = 'STEP 3 — CONNECT THE LINE';
        if (want && wantLine && inLine) {
          sub = `They want "${want}" — that\'s outgoing line ${wantLine}.\nDrag a cable from incoming ${inLine} (top) to outgoing ${wantLine} (bottom).`;
          // Arrow at the destination outgoing socket
          const out = this.board.sockets.find(s => s.side === 'out' && s.line === wantLine);
          if (out) arrow = { x: out.x, y: out.y + 26, dir: 'up' };
        } else {
          sub = 'Find their request in the DIRECTORY (right) and drag a cable from their incoming socket to that outgoing socket.';
        }
      }

      if (!title) return;
      // Pulsing banner just under the brass header
      const pulse = 0.85 + 0.15 * Math.sin(this.time * 4);
      const lines = sub.split('\n');
      const w = 720;
      const h = 30 + lines.length * 18 + 12;
      const x = (W - w) / 2, y = 36;
      ctx.fillStyle = `rgba(20,12,6,${(0.92 * pulse).toFixed(3)})`;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#ffec7a'; ctx.lineWidth = 2;
      ctx.strokeRect(x + 0.5, y + 0.5, w, h);
      ctx.fillStyle = '#ffec7a';
      ctx.font = 'bold 13px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(title, x + w / 2, y + 8);
      ctx.fillStyle = '#f4e6c4';
      ctx.font = '12px ui-monospace, monospace';
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], x + w / 2, y + 28 + i * 18);
      }

      if (arrow) this._drawCoachArrow(ctx, arrow.x, arrow.y, arrow.dir);
    }

    _drawCoachArrow(ctx, x, y, dir) {
      const t = this.time * 4;
      const bob = Math.sin(t) * 4;
      ctx.save();
      ctx.fillStyle = '#ffec7a';
      ctx.strokeStyle = '#3a2a18'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (dir === 'down') {
        const cy = y - 12 - bob;
        ctx.moveTo(x, y);
        ctx.lineTo(x - 9, cy);
        ctx.lineTo(x - 4, cy);
        ctx.lineTo(x - 4, cy - 18);
        ctx.lineTo(x + 4, cy - 18);
        ctx.lineTo(x + 4, cy);
        ctx.lineTo(x + 9, cy);
        ctx.closePath();
      } else { // 'up'
        const cy = y + 12 + bob;
        ctx.moveTo(x, y);
        ctx.lineTo(x - 9, cy);
        ctx.lineTo(x - 4, cy);
        ctx.lineTo(x - 4, cy + 18);
        ctx.lineTo(x + 4, cy + 18);
        ctx.lineTo(x + 4, cy);
        ctx.lineTo(x + 9, cy);
        ctx.closePath();
      }
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }

    _scoreFor(endingKey) {
      // Tuning: the "hidden" ending is the hardest, "route" the most cathartic,
      // "deny" explicitly a bad outcome.
      if (endingKey === 'hidden') return 500;
      if (endingKey === 'route')  return 300;
      return 120;
    }

    coinsEarned(score) { return Math.max(0, Math.floor(score / 20)); }

    onEnd() {
      SB.Voices.stopAll();
      if (this.ambient) this.ambient.stop();
    }
  }

  /* Minimal ambient hum via WebAudio. Two detuned oscillators + low-pass. */
  function makeAmbient() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      const ctx = new AC();
      const g = ctx.createGain(); g.gain.value = 0.04;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300;
      const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 55;
      const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 55.4;
      o1.connect(f); o2.connect(f); f.connect(g); g.connect(ctx.destination);
      o1.start(); o2.start();
      return {
        update(dt, pitchMul) {
          const target = 55 * pitchMul;
          o1.frequency.setTargetAtTime(target, ctx.currentTime, 1.5);
          o2.frequency.setTargetAtTime(target + 0.4, ctx.currentTime, 1.5);
        },
        stop() { try { o1.stop(); o2.stop(); ctx.close(); } catch(e){} }
      };
    } catch (e) { return null; }
  }

  NDP.attachGame('switchboard', SwitchboardGame);
})();
