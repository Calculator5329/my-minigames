/* Hotel Cascadia — main game class. Owns night progression (1→4 board,
   5 walkthrough), input → board routing, listen-in, save tracking.

   Phase machine:
     intro    : night title card. Press Enter / click to begin.
     board    : the switchboard. Calls ring, you route, composure ticks.
     ledger   : inter-night inventory card from SB.LEDGER_BY_NIGHT.
     takeover : composure broke; the Replacement takes the headset for a
                moment, then the same night restarts.
     walk     : Night 5 — the operator's office walkthrough.
     done     : ending played; win()/gameOver() already called. */
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
      this.phase = 'intro';
      this.board = SB.Board.makeBoard(SB.NIGHTS[0].lineCount);
      this.nightState = null;
      this.walk = null;
      this.drag = null;
      this.listening = false;
      this.focusHint = null;
      this.focusHintT = 0;
      // Persistent flags carried across nights. Replacement_route is set
      // on Night 4 and read on Night 5; architect counters accumulate.
      this.flags = {
        replacement_route: null,                 // 'floor_zero' | 'line_3' | 'denied'
        architect_rest_count: 0,
        architect_misses_total: 0
      };
      // Night 1 onboarding — same step machine as before, just pointed at
      // the hotel's first directory.
      this.tutorialStep = 0;
      this.tutorialDoneOnce = false;
      // Restart machinery — when composure hits 0 we don't gameOver, we
      // run a 3-second "Replacement takeover" overlay and reload the same
      // night with composure refilled.
      this.takeoverT = 0;
      this.takeoverPrompt = '';
      // Visual transient effects. lampPulses backs V1 (glass-tink halos
      // when a lamp goes out). dustMotes backs V3 (slow particles drifting
      // through the oil-lamp light cone). Camera shake is handled by the
      // engine base class via this.shake(mag, dur).
      this.lampPulses = [];      // [{ x, y, t, max, color }]
      this.dustMotes = [];       // [{ x, y, vx, vy, life, max, r }]
      this.dustSpawnAcc = 0;
      // Park-after-route timers, board-owned so they die with loadNight().
      // No more wall-clock setTimeouts that can fire after a takeover.
      // Ledger machinery — auto-advance after 7s, skip on Enter/click.
      this.ledgerT = 0;
      this.ledgerLines = null;
      // Bleed scheduler — random other-line whisper while listening.
      this.nextBleedAt = 4;
      this.timeAcc = 0;

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
      // Defensive: kill any in-flight drag, lamp pulses, or pending shake
      // so a takeover restart can't leak interaction state from the
      // previous attempt.
      this.drag = null;
      this.lampPulses = [];
      this.dustMotes = [];
      // Spin up a fresh jumpscare director per night. It owns its own
      // cooldowns and overlay timers; restarting wipes them.
      this.scares = (SB.Scares && SB.Scares.create) ? SB.Scares.create() : null;
      if (n === 5) {
        this.nightState = null;
        this.walk = SB.Walk.startWalkthrough(SB.NIGHT5, this.flags);
        return;
      }
      const night = SB.NIGHTS[n - 1];
      this.nightState = SB.Nights.startNight(night);
      // Carry persistent flags into the new night's flag bag so anything
      // reading nightState.flags can see the cumulative counts.
      this.nightState.flags.replacement_route = this.flags.replacement_route;
      this.nightState.flags.architect_rest_count = this.flags.architect_rest_count;
      this.nightState.flags.architect_misses_total = this.flags.architect_misses_total;
      this.board = SB.Board.makeBoard(night.lineCount);
    }

    update(dt) {
      this.timeAcc += dt;
      if (!this._inputBound) {
        Input.on('mousedown', (e) => this._mouseDown(e));
        Input.on('mouseup', (e) => this._mouseUp(e));
        Input.on('keydown', (e) => this._keyDown(e));
        Input.on('keyup', (e) => this._keyUp(e));
        this._inputBound = true;
      }

      if (this.ambient) this.ambient.update(dt, this.nightState?.night.ambientPitch || this.walk?.n5.ambientPitch || 1);

      if (this.phase === 'intro') {
        this.introT += dt;
        const introDur = this.currentNight === 1 ? 9.0 : 3.6;
        if (this.introT >= introDur || Input.mouse.justPressed || Input.keys['Enter']) {
          this.phase = (this.currentNight === 5) ? 'walk' : 'board';
        }
        return;
      }

      if (this.phase === 'ledger') {
        this.ledgerT += dt;
        const ledgerDur = 7.5;
        if (this.ledgerT >= ledgerDur || Input.mouse.justPressed || Input.keys['Enter']) {
          this.currentNight++;
          if (this.currentNight > 5) { this.win(); return; }
          this.loadNight(this.currentNight);
        }
        return;
      }

      if (this.phase === 'takeover') {
        this.takeoverT += dt;
        if (this.takeoverT >= 3.2) {
          // Restart same night, composure refilled.
          this.takeoverT = 0;
          this.loadNight(this.currentNight);
        }
        return;
      }

      if (this.phase === 'board' && this.nightState) {
        this._tickBoard(dt);
      } else if (this.phase === 'walk' && this.walk) {
        const hooks = {
          speak: (voice, text, id) => SB.Voices.play(id || ('walk_' + Math.random()), { voice, text }),
          narrate: (line, id) => {
            SB.Voices.play(id || ('narrate_' + Math.random()), { voice: 'replacement', text: line });
          },
          endingStart: (key) => {
            this.save.endings[key] = (this.save.endings[key] || 0) + 1;
            this.save.bestNight = 5;
            Storage.setGameData('switchboard', this.save);
          }
        };
        SB.Walk.tick(this.walk, dt, Input, hooks);

        if (this.walk.mode === 'ending' && this.walk.endingText
            && this.walk.endingIdx >= this.walk.endingText.length
            && this.walk.endingCd <= -3) {
          this.setScore(this._scoreFor(this.walk.endingKey));
          this.win();
        }
      }
    }

    _tickBoard(dt) {
      const st = this.nightState;
      // Cable auto-park timer + camera-shake decay (V7).
      if (this.board && this.board.cables) {
        for (const cb of this.board.cables) {
          if (cb.parkAt != null && st.t >= cb.parkAt) {
            cb.a.socket = null; cb.b.socket = null;
            cb.a.parked = true; cb.b.parked = true;
            const base = 180 + cb.id * 150;
            cb.a.x = base; cb.a.y = 520;
            cb.b.x = base + 24; cb.b.y = 520;
            cb.parkAt = null;
          }
        }
      }
      // Decay lamp-pulse list (V1 glass-tink halo).
      if (this.lampPulses.length) {
        for (const p of this.lampPulses) p.t += dt;
        this.lampPulses = this.lampPulses.filter(p => p.t < p.max);
      }
      // Tick the jumpscare director — it owns its own cooldown and
      // event-overlay timers. Always runs while a night is active.
      if (this.scares && SB.Scares) {
        const compPct = st.composure / st.composureMax;
        SB.Scares.tick(this.scares, dt, compPct, this.currentNight, {
          board: this.board,
          directory: st.directory,
          architectWindowActive: !!st.architectWindowActive
        });
      }

      // Spawn / advance dust motes (V3) — slow, drifting through the
      // oil-lamp light cone above the board. Spawn cadence ~6/sec.
      this.dustSpawnAcc += dt;
      while (this.dustSpawnAcc > 0.16 && this.dustMotes.length < 60) {
        this.dustSpawnAcc -= 0.16;
        this.dustMotes.push({
          x: 200 + Math.random() * 560,
          y: 80 + Math.random() * 250,
          vx: -6 + Math.random() * 12,
          vy: -2 + Math.random() * 4,
          life: 0,
          max: 6 + Math.random() * 8,
          r: 0.5 + Math.random() * 1.4
        });
      }
      for (const m of this.dustMotes) {
        m.life += dt;
        m.x += m.vx * dt;
        m.y += m.vy * dt;
      }
      this.dustMotes = this.dustMotes.filter(m => m.life < m.max);
      // Helper used by hooks below to spawn a fading halo at a lamp socket.
      const tinkAt = (line, color) => {
        if (!this.board) return;
        const sock = this.board.sockets.find(s => s.side === 'in' && s.line === line);
        if (sock) this.lampPulses.push({ x: sock.x, y: sock.y, t: 0, max: 0.55, color: color || '#ffcc33' });
      };
      const hooks = {
        ring: (c) => {
          SB.Voices.ring();
          SB.Voices.prefetchTranscript(this._cid(c));
          if (c.architect) {
            // The 3:14 inhale lasts the full architect TTL so the breath
            // sits under whichever line plays once you answer.
            try { SB.Voices.inhale(8000); } catch (e) {}
          }
          if (c.bellhopDead) {
            // Dead-bellhop lines have no voice — skip prefetching audio.
          }
        },
        missed: (c) => {
          this.flash('#d84a48', 0.15);
          tinkAt(c.line, '#d84a48');
        },
        wrong: (c) => {
          this.flash('#d84a48', 0.25); this.shake(8, 0.25);
          tinkAt(c.line, '#d84a48');
          SB.Voices.stop(this._cid(c));
        },
        correct: (c) => {
          this.flash('#6cff9a', 0.1);
          tinkAt(c.line, c.architect ? '#ff5544' : '#6cff9a');
          SB.Voices.stop(this._cid(c));
        },
        denied: (c) => { SB.Voices.stop(this._cid(c)); tinkAt(c.line, '#a58a5a'); },
        bellhopIgnored: (c) => { tinkAt(c.line, '#5a3030'); },
        archivedShown: (entry) => { this.focusHint = `${entry} — ARCHIVED`; this.focusHintT = 3.5; },
        answered: (c) => {
          SB.Voices.pickupBlip();
          if (c.bellhopDead) {
            // No voice on dead lines. Just static. Player should DENY or
            // route nowhere — the lesson lands quickly.
            return;
          }
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

      // Listen tracking + bleed scheduler
      if (this.listening && st.focused) {
        SB.Nights.listenTick(st, st.focused, dt);
        this.nextBleedAt -= dt;
        if (this.nextBleedAt <= 0 && st.ringing.size > 0) {
          // Pick a ringing call other than the focused one
          const others = Array.from(st.ringing.values()).filter(c => c !== st.focused && !c.bellhopDead);
          if (others.length) {
            const pick = others[(Math.random() * others.length) | 0];
            try { SB.Voices.bleed(this._cid(pick) + '_bleed', { voice: pick.voice, text: pick.text }); } catch (e) {}
          }
          this.nextBleedAt = 5 + Math.random() * 4;
        }
      } else {
        this.nextBleedAt = 4;
      }

      // Tutorial step machine — Night 1 only
      if (this.currentNight === 1 && !this.tutorialDoneOnce) {
        if (this.tutorialStep === 0 && st.ringing.size > 0) this.tutorialStep = 1;
        if (this.tutorialStep === 1 && st.focused) this.tutorialStep = 2;
        if (this.tutorialStep === 2 && this.listening && st.focused) this.tutorialStep = 3;
      }

      this.setScore(Math.floor(st.composure));

      if (this.focusHintT > 0) this.focusHintT -= dt;

      // HUD
      const arch = st.architectWindowActive ? ' <span style="color:#ff5544">3:14 AM</span>' : '';
      this.setHud(`<span>Night <b>${this.currentNight}</b> / 5</span>` +
                  `<span>Composure <b>${st.composure | 0}</b></span>` +
                  `<span>Calls <b>${st.active.size + st.ringing.size}</b></span>` + arch +
                  (st.focused && st.focused.voice ? `<span style="color:#c7a35a">${SB.VOICES[st.focused.voice].name}</span>` : ''));

      // End-of-night
      if (st.done) {
        // Carry persistent flags upstream
        if (st.flags.replacement_route) this.flags.replacement_route = st.flags.replacement_route;
        this.flags.architect_rest_count = Math.max(this.flags.architect_rest_count, st.flags.architect_rest_count);
        this.flags.architect_misses_total = Math.max(this.flags.architect_misses_total, st.flags.architect_misses_total);

        if (st.outcome === 'broken') {
          // Replacement takeover — restart same night.
          this.phase = 'takeover';
          this.takeoverT = 0;
          this.takeoverPrompt = `THE REPLACEMENT HAS TAKEN THE HEADSET.\nNIGHT ${this.currentNight} BEGINS AGAIN.`;
          this.flash('#a01e1c', 0.5);
          SB.Voices.stopAll();
          return;
        }
        // Survived — go to ledger
        this.save.bestNight = Math.max(this.save.bestNight, this.currentNight);
        Storage.setGameData('switchboard', this.save);
        this.phase = 'ledger';
        this.ledgerT = 0;
        this.ledgerLines = (SB.LEDGER_BY_NIGHT && SB.LEDGER_BY_NIGHT[this.currentNight]) || null;
      }
    }

    _cid(c) { return `n${this.currentNight}_c${c.idx}`; }
    _wcid(c) { return `whisper_n${this.currentNight}_c${c.idx}`; }

    _mouseDown(e) {
      if (this.phase !== 'board' || !this.nightState) return;
      const mx = Input.mouse.x, my = Input.mouse.y;
      const picked = SB.Board.pickJack(this.board, mx, my);
      if (picked) {
        SB.Board.detachJack(picked.cable[picked.end]);
        this.drag = picked;
        return;
      }
      for (const s of this.board.sockets) {
        if (s.side !== 'in') continue;
        if (Math.hypot(s.x - mx, s.y - my) < 22 && this.nightState.ringing.has(s.line)) {
          SB.Nights.answer(this.nightState, s.line, this._silentHooks((c) => {
            SB.Voices.pickupBlip();
            if (!c.bellhopDead) SB.Voices.play(this._cid(c), { voice: c.voice, text: c.text });
          }));
          return;
        }
        if (Math.hypot(s.x - mx, s.y - my) < 22 && this.nightState.active.has(s.line)) {
          this.nightState.focused = this.nightState.active.get(s.line);
          return;
        }
      }
    }

    _silentHooks(answeredFn) {
      return {
        ring: () => {}, missed: () => {}, wrong: () => {}, correct: () => {}, denied: () => {},
        bellhopIgnored: () => {}, archivedShown: () => {},
        answered: answeredFn, whisper: () => {}
      };
    }

    _mouseUp(e) {
      if (this.phase !== 'board' || !this.nightState || !this.drag) return;
      const mx = Input.mouse.x, my = Input.mouse.y;
      const socket = SB.Board.pickSocket(this.board, mx, my);
      const cable = this.drag.cable;
      const end = this.drag.end;
      if (socket) {
        SB.Board.attachJackTo(cable[end], socket);
        if (socket.side === 'in' && this.nightState.ringing.has(socket.line)) {
          SB.Nights.answer(this.nightState, socket.line, this._silentHooks((c) => {
            SB.Voices.pickupBlip();
            if (!c.bellhopDead) SB.Voices.play(this._cid(c), { voice: c.voice, text: c.text });
          }));
        }
        const ea = cable.a.socket, eb = cable.b.socket;
        if (ea && eb && ea.side !== eb.side) {
          const inSock = ea.side === 'in' ? ea : eb;
          const outSock = ea.side === 'out' ? ea : eb;
          SB.Nights.commitRoute(this.nightState, inSock.line, outSock.line, {
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
          // Park this cable in 0.4s via a board-owned timer. If the night
          // restarts (takeover) before then, this.board is replaced and
          // the timer reference goes with it — no zombie state.
          cable.parkAt = (this.nightState ? this.nightState.t : 0) + 0.4;
        }
      } else {
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
      if (this.phase === 'intro')    return this._drawIntro(ctx);
      if (this.phase === 'ledger')   return this._drawLedger(ctx);
      if (this.phase === 'takeover') return this._drawTakeover(ctx);
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
      ctx.fillText(text[0] || '', W / 2, H / 2 - 20 - (text.length - 1) * 11);
      ctx.font = '14px ui-monospace, monospace';
      ctx.fillStyle = '#a58a5a';
      for (let i = 1; i < text.length; i++) {
        ctx.fillText(text[i], W / 2, H / 2 + 20 + (i - 1) * 22 - (text.length - 1) * 11);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#6a4a2a';
      ctx.font = '12px ui-monospace, monospace';
      ctx.fillText('click or press Enter to begin', W / 2, H - 60);
    }

    _drawLedger(ctx) {
      ctx.fillStyle = '#0a0608'; ctx.fillRect(0, 0, W, H);
      // Inventory card frame
      const cx = W / 2, cy = H / 2;
      const cw = 720, ch = 320;
      ctx.fillStyle = '#1b1208';
      ctx.fillRect(cx - cw / 2, cy - ch / 2, cw, ch);
      ctx.strokeStyle = '#6a4a20'; ctx.lineWidth = 2;
      ctx.strokeRect(cx - cw / 2 + 0.5, cy - ch / 2 + 0.5, cw, ch);
      const lines = this.ledgerLines || ['INTER-NIGHT LEDGER'];
      ctx.fillStyle = '#c7a35a';
      ctx.font = 'bold 14px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(lines[0], cx, cy - ch / 2 + 24);
      ctx.fillStyle = '#e8d7a0';
      ctx.font = '13px ui-monospace, monospace';
      ctx.textAlign = 'left';
      const reveal = Math.min(lines.length - 1, Math.floor(this.ledgerT * 1.2));
      for (let i = 1; i <= reveal; i++) {
        ctx.fillText(lines[i], cx - cw / 2 + 36, cy - ch / 2 + 60 + (i - 1) * 24);
      }
      ctx.fillStyle = '#6a4a2a';
      ctx.font = '11px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('click or press Enter to start the next night', cx, cy + ch / 2 - 20);
    }

    _drawTakeover(ctx) {
      ctx.fillStyle = '#0a0608'; ctx.fillRect(0, 0, W, H);
      // Big red overlay flash
      ctx.fillStyle = `rgba(160,30,28,${(0.55 - this.takeoverT * 0.12).toFixed(2)})`;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#c7a35a';
      ctx.font = 'bold 22px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const lines = (this.takeoverPrompt || '').split('\n');
      lines.forEach((l, i) => ctx.fillText(l, W / 2, H / 2 - 14 + i * 30));
      // Caption — the Replacement's polite line
      ctx.fillStyle = '#e8d7a0';
      ctx.font = '13px ui-monospace, monospace';
      ctx.fillText('"Sorry — let me take that for you. You looked tired."', W / 2, H / 2 + 80);
    }

    _drawBoard(ctx) {
      const st = this.nightState;
      const archAge = (st.archivedShownAt != null) ? (st.t - st.archivedShownAt) : null;
      // V7: rising-edge architect kick — small thump the moment 3:14 opens.
      if (st.architectWindowActive && !this._lastArchActive) {
        this.shake(5, 0.35);
      }
      this._lastArchActive = st.architectWindowActive;
      // V7: subtle "operator breathing" — the camera drifts on a slow
      // 4-second cycle, magnified slightly while leaning in (the player
      // is literally close to the desk). Engine shake stacks on top.
      const breathX = Math.sin(this.timeAcc * 0.62) * (this.listening ? 1.6 : 0.8);
      const breathY = Math.sin(this.timeAcc * 0.81) * (this.listening ? 1.2 : 0.6);
      ctx.save();
      ctx.translate(breathX, breathY);
      SB.Board.render(ctx, this.board, {
        time: this.timeAcc,
        ringing: st.ringing,
        active: st.active,
        focused: st.focused,
        directory: st.directory,
        composure: st.composure,
        composureMax: st.composureMax,
        listening: this.listening,
        escalation: Math.min(1, (this.currentNight - 1) / 4),
        currentNight: this.currentNight,
        architectWindowActive: st.architectWindowActive,
        archivedEntry: st.archivedEntry,
        archivedShown: st.archivedSticky,
        archivedAge: archAge,
        newLines: st.night.newLines || [],
        clockLabel: this._clockLabel(st),
        hudRight: `NIGHT ${this.currentNight} — ${Math.max(0, (st.night.durationSec - st.t) | 0)}s`,
        // V1+V3: pass through transient visual state owned by the game.
        lampPulses: this.lampPulses,
        dustMotes: this.dustMotes,
        // V2: nightState clock (cable.parkAt is in this same coordinate)
        t: st.t,
        // Jumpscare director overrides (read-only; null when nothing is
        // currently glitching).
        headerOverride: this.scares && this.scares.headerOverride,
        cardOverride: this.scares && this.scares.cardOverride,
        dirOverride: this.scares && this.scares.dirOverride
      });
      ctx.restore();

      // Jumpscare overlays — drawn outside the breathing translate so
      // hand-at-edge silhouettes hug the actual canvas edge and the
      // power flicker covers the entire frame.
      if (this.scares && SB.Scares) {
        SB.Scares.render(ctx, this.scares);
      }

      if (this.drag) {
        const mx = Input.mouse.x, my = Input.mouse.y;
        const target = SB.Board.pickSocket(this.board, mx, my);
        if (target) {
          ctx.strokeStyle = '#ffec7a'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(target.x, target.y, 18, 0, Math.PI * 2); ctx.stroke();
        }
      }

      if (this.listening && st.focused) {
        ctx.fillStyle = '#ffec7a';
        ctx.font = 'bold 12px ui-monospace, monospace';
        ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
        ctx.fillText('\u25CE listening…', W - 16, H - 10);
      }

      if (this.focusHintT > 0 && this.focusHint) {
        ctx.fillStyle = `rgba(220,200,180,${Math.min(1, this.focusHintT / 1.5)})`;
        ctx.font = 'italic 13px ui-monospace, monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('"' + this.focusHint + '"', W / 2, 80);
      }

      if (this.currentNight === 1 && this.tutorialStep > 0 && this.tutorialStep < 4) {
        this._drawTutorial(ctx);
      }
    }

    /* In-game wall clock label. Drift the year backward when the player is
       composure-fragile so the hotel's "you are next" tells. */
    _clockLabel(st) {
      // Seconds since night start as fraction of full duration → minutes past 3:00 AM
      const minsPast = Math.floor((st.t / Math.max(60, st.night.durationSec)) * 60);
      const hh = 3, mm = String(minsPast % 60).padStart(2, '0');
      const compPct = st.composure / st.composureMax;
      const baseYear = compPct < 0.25 ? '????' : '1986';
      return `${hh}:${mm} AM — ${baseYear}`;
    }

    _drawTutorial(ctx) {
      const st = this.nightState;
      let title = '', sub = '', arrow = null;

      if (this.tutorialStep === 1) {
        title = 'STEP 1 — ANSWER THE CALL';
        sub = 'Click the glowing lamp on the INCOMING row.';
        const first = st.ringing.values().next().value;
        if (first) {
          const sock = this.board.sockets.find(s => s.side === 'in' && s.line === first.line);
          if (sock) arrow = { x: sock.x, y: sock.y - 26, dir: 'down' };
        }
      } else if (this.tutorialStep === 2) {
        title = 'STEP 2 — LEAN IN';
        sub = 'Press and HOLD the [L] key to hear what the caller wants.';
        arrow = { x: 240, y: 360, dir: 'down' };
      } else if (this.tutorialStep === 3) {
        const want = st.focused && st.focused.request;
        const wantLine = want && st.directory ? st.directory[want] : null;
        const inLine = st.focused && st.focused.line;
        title = 'STEP 3 — CONNECT THE LINE';
        if (want && wantLine && inLine) {
          sub = `They want "${want}" — that\'s outgoing line ${wantLine}.\nDrag a cable from incoming ${inLine} (top) to outgoing ${wantLine} (bottom).`;
          const out = this.board.sockets.find(s => s.side === 'out' && s.line === wantLine);
          if (out) arrow = { x: out.x, y: out.y + 26, dir: 'up' };
        } else {
          sub = 'Find their request in the DIRECTORY (right) and drag a cable from their incoming socket to that outgoing socket.';
        }
      }
      if (!title) return;
      const pulse = 0.85 + 0.15 * Math.sin(this.timeAcc * 4);
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
      const t = this.timeAcc * 4;
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
      } else {
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
      if (endingKey === 'demolition') return 600;     // best — earned over 5 nights
      if (endingKey === 'check_out')  return 250;     // the loop
      return 100;                                     // understudy
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
