/* Pong — Gauntlet of Five.
   ----------------------------------------------------------------------------
   The grandfather of arcade games rebuilt as a five-opponent ladder. Each foe
   has its own AI quirk and paddle skin; between matches you draft one of three
   random perks; the ladder ends in a Champion duel against twin stacked
   paddles. BaseGame stays in `state='playing'` for the whole gauntlet — the
   internal `phase` machine drives transitions.

   Phases (within state='playing'):
     intro     — title splash, click to begin
     splash    — VS card with portraits, auto-advances after ~1.5s
     match     — actual rallies; first to N points
     matchWin  — brief celebration, then shop or splash for next foe
     matchLose — brief defeat, then defeat phase
     shop      — pick 1 of 3 random perks
     victory   — Champion defeated; trophy + click to win()
     defeat    — gauntlet failed; click to gameOver()

   Persistent meta (Storage 'pong'):
     bestOpponentBeaten   — ladder rung furthest cleared (0..5)
     totalChampionships   — full clears of the gauntlet
     perks                — { perkId: true } any perk ever drafted
*/
(function () {
  const NDP = window.NDP;
  const { BaseGame, Input, Sprites } = NDP.Engine;
  const Storage = NDP.Engine.Storage;

  const W = 960, H = 600;
  const PADDLE_W = 14;
  const PADDLE_H_BASE = 96;
  const BALL_SIZE = 14;
  const PLAYER_X = 48;
  const CPU_X = W - 48 - PADDLE_W;
  const TOP_BAND_Y = 4, BOT_BAND_Y = H - 14, BAND_THICK = 10;

  // ---------------------------- Opponents ------------------------------------
  const OPPONENTS = [
    {
      id: 'rookie', name: 'ROOKIE', tag: 'fresh recruit',
      sprite: 'pong.opp_rookie', paddleSprite: 'pong.paddle_rookie',
      color: '#7ae07a', winsTo: 5,
      ai: { kind: 'tracker', slop: 50, speed: 280, recoverySpeed: 160 }
    },
    {
      id: 'cadet', name: 'CADET', tag: 'aggressive smasher',
      sprite: 'pong.opp_cadet', paddleSprite: 'pong.paddle_cadet',
      color: '#7ae0ff', winsTo: 5,
      ai: { kind: 'tracker', slop: 25, speed: 360, recoverySpeed: 280, smashBoost: 90 }
    },
    {
      id: 'veteran', name: 'VETERAN', tag: 'predictive · lazy recovery',
      sprite: 'pong.opp_veteran', paddleSprite: 'pong.paddle_veteran',
      color: '#caa890', winsTo: 5,
      ai: { kind: 'predictor', slop: 14, speed: 380, recoverySpeed: 90 }
    },
    {
      id: 'master', name: 'MASTER', tag: 'spin shots',
      sprite: 'pong.opp_master', paddleSprite: 'pong.paddle_master',
      color: '#ffd86b', winsTo: 5,
      ai: { kind: 'predictor', slop: 18, speed: 420, recoverySpeed: 240, spin: 220 }
    },
    {
      id: 'champion', name: 'CHAMPION', tag: 'twin paddles · best of 5',
      sprite: 'pong.opp_champion', paddleSprite: 'pong.paddle_champion',
      color: '#ff4466', winsTo: 3,
      ai: { kind: 'twin', slop: 16, speed: 520, recoverySpeed: 320, spin: 120 }
    }
  ];

  // ---------------------------- Perks ----------------------------------------
  const PERKS = [
    { id: 'wide',   name: 'WIDE PADDLE',   desc: '+30% paddle height',                 sprite: 'pong.perk_wide' },
    { id: 'curve',  name: 'CURVE RETURN',  desc: 'Spin balls with mouse motion',       sprite: 'pong.perk_curve' },
    { id: 'twin',   name: 'TWIN BALL',     desc: 'Brief 2nd ball at rally start',      sprite: 'pong.perk_twin' },
    { id: 'lazy',   name: 'WORN OPPONENT', desc: 'Foe recovery −40%',                  sprite: 'pong.perk_lazy' },
    { id: 'bumper', name: 'SIDE BUMPERS',  desc: 'Top/bottom mini-paddles · 1×/rally', sprite: 'pong.perk_bumper' }
  ];
  const PERKS_BY_ID = Object.fromEntries(PERKS.map(p => [p.id, p]));

  // ===========================================================================
  class PongGame extends BaseGame {
    init() {
      this.save = this._load();

      this.phase = 'intro';
      this.matchIx = 0;
      this.activePerks = {};         // perks chosen this gauntlet
      this.shopChoices = [];
      this.shopRects = [];
      this.splashTimer = 0;
      this.endTimer = 0;
      this.celebrationTimer = 0;
      this.matchCoinReward = 0;

      // Player paddle state.
      this.playerY = H / 2;
      this.playerYPrev = H / 2;
      this.playerVel = 0;            // px/s, drives curve perk

      // CPU paddle layout — replaced per-match in _startMatch.
      this.cpuPaddles = [{ y: H/2, target: H/2, half: 'all' }];

      // In-flight balls. Twin ball perk briefly adds a 2nd entry.
      this.balls = [];
      this.serveTimer = 0;
      this.serveDir = -1;
      this.rallies = 0;
      this.bumpers = { top: false, bottom: false };
      this.ballTrail = [];
      this.lastTrailEmit = 0;

      this.playerScore = 0;
      this.cpuScore = 0;

      this.sfx = this.makeSfx({
        wall:     { freq: 220,  type: 'square',   dur: 0.04, vol: 0.18 },
        paddle:   { freq: 440,  type: 'square',   dur: 0.06, vol: 0.28 },
        smash:    { freq: 320,  type: 'sawtooth', dur: 0.12, slide: 240, vol: 0.4 },
        score:    { freq: 660,  type: 'triangle', dur: 0.18, slide: -200, vol: 0.4 },
        cpuScore: { freq: 180,  type: 'sawtooth', dur: 0.22, slide: -80,  vol: 0.4 },
        win:      { freq: 880,  type: 'triangle', dur: 0.5,  slide: 220,  vol: 0.55 },
        lose:     { freq: 140,  type: 'sawtooth', dur: 0.5,  slide: -80,  vol: 0.5 },
        buy:      { freq: 1100, type: 'square',   dur: 0.10, vol: 0.4 },
        bumper:   { freq: 540,  type: 'triangle', dur: 0.06, vol: 0.3 }
      });

      this._refreshHud();
      Sprites.preload(OPPONENTS.map(o => o.sprite), 220, 220);
      Sprites.preload(['pong.ball_glow'], 36, 36);
    }

    onEnd() { this._save(); }

    _load() {
      return Object.assign(
        { bestOpponentBeaten: 0, totalChampionships: 0, perks: {} },
        Storage.getGameData('pong')
      );
    }
    _save() { Storage.setGameData('pong', this.save); }

    // ============================== UPDATE ===================================
    update(dt) {
      if (this.phase === 'intro')      return this._updateIntro(dt);
      if (this.phase === 'splash')     return this._updateSplash(dt);
      if (this.phase === 'match')      return this._updateMatch(dt);
      if (this.phase === 'matchWin')   return this._updateMatchEnd(dt, true);
      if (this.phase === 'matchLose')  return this._updateMatchEnd(dt, false);
      if (this.phase === 'shop')       return this._updateShop(dt);
      if (this.phase === 'victory')    return this._updateVictory(dt);
      if (this.phase === 'defeat')     return this._updateDefeat(dt);
    }

    _refreshHud() {
      const opp = OPPONENTS[Math.min(this.matchIx, OPPONENTS.length - 1)];
      const n = Math.min(this.matchIx + 1, OPPONENTS.length);
      this.setHud(
        `<span>Match <b>${n}/${OPPONENTS.length} — ${opp.name}</b></span>` +
        `<span>You <b>${this.playerScore}</b> · <b>${this.cpuScore}</b> Foe</span>` +
        `<span>Score <b>${this.score}</b></span>`
      );
    }

    // -------------------------- intro ----------------------------------------
    _updateIntro() {
      this._refreshHud();
      if (Input.mouse.justPressed) {
        Input.mouse.justPressed = false;
        this._startSplash(OPPONENTS[0]);
      }
    }

    // -------------------------- splash ---------------------------------------
    _startSplash() {
      this.phase = 'splash';
      this.splashTimer = 0;
      this.playerScore = 0;
      this.cpuScore = 0;
      this._refreshHud();
    }

    _updateSplash(dt) {
      this.splashTimer += dt;
      if (this.splashTimer > 1.6 || Input.mouse.justPressed) {
        Input.mouse.justPressed = false;
        this._startMatch(OPPONENTS[this.matchIx]);
      }
    }

    // -------------------------- match ----------------------------------------
    _startMatch(opp) {
      this.phase = 'match';
      this.playerScore = 0;
      this.cpuScore = 0;
      this.rallies = 0;
      this.serveDir = Math.random() < 0.5 ? -1 : 1;
      this.balls = [];
      this.serveTimer = 0.7;
      this.bumpers = { top: false, bottom: false };

      if (opp.ai.kind === 'twin') {
        this.cpuPaddles = [
          { y: H * 0.25, target: H * 0.25, half: 'top' },
          { y: H * 0.75, target: H * 0.75, half: 'bottom' }
        ];
      } else {
        this.cpuPaddles = [{ y: H/2, target: H/2, half: 'all' }];
      }

      this._refreshHud();
    }

    _spawnBall(opts) {
      return {
        x: opts.x != null ? opts.x : W / 2,
        y: opts.y != null ? opts.y : H / 2,
        vx: opts.vx || 0,
        vy: opts.vy || 0,
        speed: opts.speed || 380,
        ay: 0,
        isTwin: !!opts.isTwin,
        twinLife: opts.twinLife || 0
      };
    }

    _serve() {
      const ang = (Math.random() - 0.5) * Math.PI / 3;       // ±30°
      const speed = 380;
      this.balls = [this._spawnBall({
        vx: Math.cos(ang) * speed * this.serveDir,
        vy: Math.sin(ang) * speed,
        speed
      })];
      // Twin ball perk: spawn a phantom 2nd ball with a 1s lifetime so the
      // opening of each rally is hectic without permanently doubling state.
      if (this.activePerks.twin) {
        const ang2 = -ang;
        this.balls.push(this._spawnBall({
          x: W / 2, y: H / 2 + 32,
          vx: Math.cos(ang2) * speed * this.serveDir,
          vy: Math.sin(ang2) * speed,
          speed,
          isTwin: true,
          twinLife: 1.0
        }));
      }
      this.bumpers = { top: false, bottom: false };
      this.serveTimer = 0;
    }

    _updateMatch(dt) {
      const opp = OPPONENTS[this.matchIx];

      this._updatePlayerPaddle(dt);

      if (this.serveTimer > 0) {
        this.serveTimer -= dt;
        if (this.serveTimer <= 0) this._serve();
      }

      this._updateCpu(dt, opp);

      // Step every ball in flight; remove twins when they expire or escape.
      const halfP = this._paddleHeight() / 2;
      for (let i = this.balls.length - 1; i >= 0; i--) {
        const b = this.balls[i];
        if (b.isTwin) {
          b.twinLife -= dt;
          if (b.twinLife <= 0) { this.balls.splice(i, 1); continue; }
        }

        // Spin acceleration (Master / Champion shots only).
        if (b.ay) {
          b.vy += b.ay * dt;
          const maxVy = b.speed * 0.85;
          b.vy = clamp(b.vy, -maxVy, maxVy);
        }

        b.x += b.vx * dt;
        b.y += b.vy * dt;

        // Top/bottom walls.
        if (b.y < BALL_SIZE / 2) {
          b.y = BALL_SIZE / 2; b.vy = -b.vy; b.ay = 0;
          this.sfx.play('wall');
          this.particles.burst(b.x, b.y, 6, { color: '#e7ecf3', speed: 140, life: 0.3, size: 2 });
        }
        if (b.y > H - BALL_SIZE / 2) {
          b.y = H - BALL_SIZE / 2; b.vy = -b.vy; b.ay = 0;
          this.sfx.play('wall');
          this.particles.burst(b.x, b.y, 6, { color: '#e7ecf3', speed: 140, life: 0.3, size: 2 });
        }

        // Player paddle collision.
        if (b.vx < 0 &&
            b.x - BALL_SIZE / 2 < PLAYER_X + PADDLE_W &&
            b.x > PLAYER_X - 6 &&
            b.y > this.playerY - halfP &&
            b.y < this.playerY + halfP) {
          this._bouncePlayer(b);
          continue;
        }

        // Bumper deflection (perk only — top/bottom mini-paddles on player side).
        if (this.activePerks.bumper && b.vx < 0 && b.x < PLAYER_X + 60 && b.x > PLAYER_X - 30) {
          if (!this.bumpers.top && b.y - BALL_SIZE / 2 < TOP_BAND_Y + BAND_THICK) {
            b.y = TOP_BAND_Y + BAND_THICK + BALL_SIZE / 2;
            b.vy = Math.max(180, Math.abs(b.vy));
            b.vx = Math.abs(b.vx);
            b.ay = 0;
            this.bumpers.top = true;
            this.sfx.play('bumper');
            this.particles.burst(b.x, TOP_BAND_Y + BAND_THICK, 14, { color: '#ff4466', speed: 220, life: 0.4, size: 2 });
            continue;
          }
          if (!this.bumpers.bottom && b.y + BALL_SIZE / 2 > BOT_BAND_Y) {
            b.y = BOT_BAND_Y - BALL_SIZE / 2;
            b.vy = -Math.max(180, Math.abs(b.vy));
            b.vx = Math.abs(b.vx);
            b.ay = 0;
            this.bumpers.bottom = true;
            this.sfx.play('bumper');
            this.particles.burst(b.x, BOT_BAND_Y, 14, { color: '#ff4466', speed: 220, life: 0.4, size: 2 });
            continue;
          }
        }

        // CPU paddle collision (test all CPU paddles, take the first hit).
        let bounced = false;
        for (const p of this.cpuPaddles) {
          if (b.vx > 0 &&
              b.x + BALL_SIZE / 2 > CPU_X &&
              b.x < CPU_X + PADDLE_W + 6 &&
              b.y > p.y - PADDLE_H_BASE / 2 &&
              b.y < p.y + PADDLE_H_BASE / 2) {
            this._bounceCpu(b, p, opp);
            bounced = true;
            break;
          }
        }
        if (bounced) continue;

        // Goals — only the main ball can score; twin balls just despawn.
        if (b.x < -20) {
          if (b.isTwin) { this.balls.splice(i, 1); continue; }
          this._goalCpu();
          return;
        }
        if (b.x > W + 20) {
          if (b.isTwin) { this.balls.splice(i, 1); continue; }
          this._goalPlayer();
          return;
        }
      }

      // Trail emitter follows the main ball only.
      if (this.balls.length) {
        const main = this.balls[0];
        this.lastTrailEmit += dt;
        if (this.lastTrailEmit > 0.02) {
          this.lastTrailEmit = 0;
          this.ballTrail.push({ x: main.x, y: main.y, life: 0.3, age: 0 });
        }
      }
      for (let i = this.ballTrail.length - 1; i >= 0; i--) {
        this.ballTrail[i].age += dt;
        if (this.ballTrail[i].age >= this.ballTrail[i].life) this.ballTrail.splice(i, 1);
      }

      this._refreshHud();
    }

    _paddleHeight() {
      return PADDLE_H_BASE * (this.activePerks.wide ? 1.3 : 1);
    }

    _updatePlayerPaddle(dt) {
      const halfP = this._paddleHeight() / 2;
      const mouseY = Input.mouse.y;
      let dy = 0;
      if (mouseY > 0 && mouseY < H) {
        const diff = mouseY - this.playerY;
        dy = clamp(diff, -800 * dt, 800 * dt);
      }
      if (Input.keys['w'] || Input.keys['W'] || Input.keys['ArrowUp'])   dy = -640 * dt;
      if (Input.keys['s'] || Input.keys['S'] || Input.keys['ArrowDown']) dy =  640 * dt;
      this.playerYPrev = this.playerY;
      this.playerY = clamp(this.playerY + dy, halfP, H - halfP);
      this.playerVel = (this.playerY - this.playerYPrev) / Math.max(dt, 0.001);
    }

    _updateCpu(dt, opp) {
      // Pick the most threatening main ball (closest to CPU x, moving right).
      const incoming = this.balls
        .filter(b => !b.isTwin && b.vx > 0)
        .sort((a, b) => (CPU_X - a.x) - (CPU_X - b.x))[0];

      for (const p of this.cpuPaddles) {
        let target;
        let recovering;

        if (incoming) {
          const projY = (opp.ai.kind === 'predictor' || opp.ai.kind === 'twin')
            ? this._predictBallY(incoming)
            : incoming.y;
          if (p.half === 'top' && projY > H / 2) {
            target = H * 0.25; recovering = true;
          } else if (p.half === 'bottom' && projY <= H / 2) {
            target = H * 0.75; recovering = true;
          } else {
            target = projY + (Math.random() - 0.5) * opp.ai.slop;
            recovering = false;
          }
        } else {
          target = (p.half === 'top') ? H * 0.25
                 : (p.half === 'bottom') ? H * 0.75
                 : H / 2;
          recovering = true;
        }
        p.target = target;

        let speed = recovering ? opp.ai.recoverySpeed : opp.ai.speed;
        if (this.activePerks.lazy) speed *= recovering ? 0.6 : 0.85;

        const diff = target - p.y;
        const move = clamp(diff, -speed * dt, speed * dt);
        // Clamp each paddle inside its half (twin paddles never overlap).
        const minY = (p.half === 'bottom') ? H / 2 : PADDLE_H_BASE / 2;
        const maxY = (p.half === 'top')    ? H / 2 : H - PADDLE_H_BASE / 2;
        p.y = clamp(p.y + move, minY, maxY);
      }
    }

    // Bounce-projection — simulates wall bounces while the ball travels to CPU
    // x. Same algorithm as the original Pong CPU; reused here for the predictor
    // / twin opponents.
    _predictBallY(b) {
      let py = b.y, pvy = b.vy, px = b.x;
      let safety = 0;
      while (px < CPU_X && safety++ < 30) {
        const tToWall = pvy > 0 ? (H - py) / pvy : (-py / pvy);
        const tToTarget = (CPU_X - px) / b.vx;
        if (tToTarget < tToWall) {
          py += pvy * tToTarget;
          break;
        }
        py += pvy * tToWall;
        pvy = -pvy;
        px += b.vx * tToWall;
      }
      return py;
    }

    _bouncePlayer(b) {
      const halfP = this._paddleHeight() / 2;
      const rel = clamp((b.y - this.playerY) / halfP, -1, 1);
      const ang = rel * Math.PI / 3.5;
      b.speed = Math.min(820, b.speed + 14);
      b.vx = Math.cos(ang) * b.speed;
      b.vy = Math.sin(ang) * b.speed;
      b.ay = 0;
      // Curve perk lets the player impart spin via mouse motion.
      if (this.activePerks.curve) {
        b.ay = clamp(this.playerVel * 0.35, -320, 320);
      }
      b.x = PLAYER_X + PADDLE_W + BALL_SIZE / 2 + 1;
      if (!b.isTwin) this.rallies++;
      this.sfx.play('paddle', { freq: 440 + this.rallies * 14 });
      this.particles.burst(b.x, b.y, 8, { color: '#ffd86b', speed: 200, life: 0.35, size: 2.5 });
    }

    _bounceCpu(b, p, opp) {
      const rel = clamp((b.y - p.y) / (PADDLE_H_BASE / 2), -1, 1);
      const ang = rel * Math.PI / 3.5;
      let speedBoost = 14;
      if (opp.ai.smashBoost) speedBoost += opp.ai.smashBoost;
      b.speed = Math.min(900, b.speed + speedBoost);
      b.vx = -Math.cos(ang) * b.speed;
      b.vy = Math.sin(ang) * b.speed;
      b.ay = opp.ai.spin ? (rel >= 0 ? opp.ai.spin : -opp.ai.spin) : 0;
      b.x = CPU_X - BALL_SIZE / 2 - 1;
      if (!b.isTwin) this.rallies++;
      if (opp.ai.smashBoost) {
        this.sfx.play('smash');
        this.shake(3, 0.12);
      } else {
        this.sfx.play('paddle', { freq: 380 - Math.min(60, this.rallies * 4) });
      }
      this.particles.burst(b.x, b.y, 8, { color: opp.color, speed: 200, life: 0.35, size: 2.5 });
    }

    _goalPlayer() {
      this.playerScore++;
      this.sfx.play('score');
      this.flash('#4ade80', 0.15);
      this.shake(6, 0.2);
      this.serveDir = 1;
      this.rallies = 0;
      this.balls = [];
      this.serveTimer = 0.7;
      this._checkMatchEnd();
      this._refreshHud();
    }

    _goalCpu() {
      this.cpuScore++;
      this.sfx.play('cpuScore');
      this.flash('#ff3a3a', 0.15);
      this.shake(8, 0.3);
      this.serveDir = -1;
      this.rallies = 0;
      this.balls = [];
      this.serveTimer = 0.7;
      this._checkMatchEnd();
      this._refreshHud();
    }

    _checkMatchEnd() {
      const opp = OPPONENTS[this.matchIx];
      if (this.playerScore >= opp.winsTo)      this._resolveMatch(true);
      else if (this.cpuScore >= opp.winsTo)    this._resolveMatch(false);
    }

    _resolveMatch(playerWon) {
      const opp = OPPONENTS[this.matchIx];
      if (playerWon) {
        const matchN = this.matchIx + 1;
        const ballDiff = this.playerScore - this.cpuScore;
        const coins = 5 * matchN + Math.max(0, ballDiff);
        this.matchCoinReward = coins;
        this.addScore(100 * matchN + Math.max(0, ballDiff) * 25);
        Storage.addCoins(coins);
        this.save.bestOpponentBeaten = Math.max(this.save.bestOpponentBeaten || 0, matchN);
        this._save();
        this.phase = 'matchWin';
        this.celebrationTimer = 0;
        this.particles.burst(W / 2, H / 2, 60, { color: opp.color, speed: 320, life: 0.8 });
        this.flash('#ffd86b', 0.25);
        this.sfx.play('win');
      } else {
        this.phase = 'matchLose';
        this.endTimer = 0;
        this.flash('#ff3a3a', 0.3);
        this.shake(14, 0.5);
        this.sfx.play('lose');
      }
      this.balls = [];
      this._refreshHud();
    }

    // -------------------------- after-match phases ---------------------------
    _updateMatchEnd(dt, won) {
      if (won) {
        this.celebrationTimer += dt;
        if (this.celebrationTimer > 1.4 || Input.mouse.justPressed) {
          Input.mouse.justPressed = false;
          if (this.matchIx + 1 >= OPPONENTS.length) {
            // Champion just fell — go straight to the trophy splash.
            this.save.totalChampionships = (this.save.totalChampionships || 0) + 1;
            this._save();
            this.phase = 'victory';
            this.celebrationTimer = 0;
            this.particles.burst(W / 2, H / 2, 120, { color: '#ffd86b', speed: 380, life: 1.2 });
            this.flash('#ffd86b', 0.4);
            return;
          }
          this._enterShop();
        }
      } else {
        this.endTimer += dt;
        if (this.endTimer > 1.4 || Input.mouse.justPressed) {
          Input.mouse.justPressed = false;
          this.phase = 'defeat';
          this.endTimer = 0;
        }
      }
    }

    // -------------------------- shop -----------------------------------------
    _enterShop() {
      this.phase = 'shop';
      // Offer 3 random perks the player hasn't already drafted this gauntlet.
      // If everything is already taken, allow re-draft from the full pool.
      const fresh = PERKS.filter(p => !this.activePerks[p.id]);
      const pool = fresh.length >= 3 ? fresh : PERKS.slice();
      this.shopChoices = shuffle(pool.slice()).slice(0, 3);
      this.shopRects = [];
      this._refreshHud();
    }

    _updateShop() {
      this._refreshHud();
      if (!Input.mouse.justPressed) return;
      Input.mouse.justPressed = false;
      const mx = Input.mouse.x, my = Input.mouse.y;
      for (const r of this.shopRects) {
        if (mx < r.x || mx > r.x + r.w || my < r.y || my > r.y + r.h) continue;
        if (r.kind === 'skip') { this._advanceToNext(); return; }
        if (r.kind === 'perk') {
          this.activePerks[r.perk.id] = true;
          this.save.perks[r.perk.id] = true;
          this._save();
          this.sfx.play('buy');
          this.particles.burst(r.x + r.w / 2, r.y + r.h / 2, 24, { color: '#ffd86b', speed: 220, life: 0.7 });
          this._advanceToNext();
          return;
        }
      }
    }

    _advanceToNext() {
      this.matchIx++;
      if (this.matchIx >= OPPONENTS.length) {
        this.phase = 'victory';
        this.celebrationTimer = 0;
        return;
      }
      this._startSplash(OPPONENTS[this.matchIx]);
    }

    // -------------------------- endgame --------------------------------------
    _updateVictory(dt) {
      this.celebrationTimer += dt;
      if (Input.mouse.justPressed && this.celebrationTimer > 0.5) {
        Input.mouse.justPressed = false;
        this.win();
      }
    }

    _updateDefeat(dt) {
      this.endTimer += dt;
      if (Input.mouse.justPressed && this.endTimer > 0.4) {
        Input.mouse.justPressed = false;
        this.gameOver();
      }
    }

    // ============================== RENDER ===================================
    render(ctx) {
      this._drawBackdrop(ctx);
      if (this.phase === 'intro')     return this._renderIntro(ctx);
      if (this.phase === 'splash')    return this._renderSplash(ctx);
      if (this.phase === 'match' || this.phase === 'matchWin' || this.phase === 'matchLose')
        return this._renderMatch(ctx);
      if (this.phase === 'shop')      return this._renderShop(ctx);
      if (this.phase === 'victory')   return this._renderVictory(ctx);
      if (this.phase === 'defeat')    return this._renderDefeat(ctx);
    }

    _drawBackdrop(ctx) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255,255,255,0.025)';
      for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
    }

    _drawCenterLine(ctx) {
      ctx.fillStyle = '#3a3a3a';
      for (let y = 12; y < H; y += 24) ctx.fillRect(W / 2 - 2, y, 4, 14);
    }

    _renderIntro(ctx) {
      ctx.fillStyle = '#ffd86b';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = '#ffd86b'; ctx.shadowBlur = 16;
      ctx.font = 'bold 56px ui-monospace, monospace';
      ctx.fillText('PONG · GAUNTLET', W / 2, 110);
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#7ae0ff'; ctx.font = '17px ui-monospace, monospace';
      ctx.fillText('Five challengers. Pick a perk between each.', W / 2, 162);
      ctx.fillText('First to 5 each match — Champion is best of 5 with twin paddles.', W / 2, 186);

      const startX = W / 2 - 4 * 80;
      OPPONENTS.forEach((o, i) => {
        const x = startX + i * 160, y = 320;
        Sprites.draw(ctx, o.sprite, x, y, 110, 110, {
          fallback: () => { ctx.fillStyle = o.color; ctx.fillRect(x - 50, y - 50, 100, 100); }
        });
        ctx.fillStyle = '#fff'; ctx.font = '12px ui-monospace, monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(o.name, x, y + 60);
        ctx.fillStyle = o.color;
        ctx.fillText(`(${i + 1})`, x, y + 76);
      });

      ctx.textBaseline = 'middle';
      if (this.save.bestOpponentBeaten) {
        ctx.fillStyle = '#7ae0ff'; ctx.font = '13px ui-monospace, monospace';
        ctx.fillText(
          `Best run: defeated ${this.save.bestOpponentBeaten}/${OPPONENTS.length}` +
          (this.save.totalChampionships ? `   ·   Championships: ${this.save.totalChampionships}` : ''),
          W / 2, 470
        );
      }

      ctx.fillStyle = '#fff'; ctx.font = 'bold 22px ui-monospace, monospace';
      ctx.fillText('Click to enter the arena', W / 2, 524);
      ctx.fillStyle = '#7a6090'; ctx.font = '12px ui-monospace, monospace';
      ctx.fillText('Mouse Y · W/S · Arrow Keys', W / 2, 552);
    }

    _renderSplash(ctx) {
      const opp = OPPONENTS[this.matchIx];

      Sprites.draw(ctx, 'pong.vs_splash', W / 2, 220, 640, 320, { fallback: () => {} });

      ctx.fillStyle = '#fff'; ctx.font = 'bold 18px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(`MATCH ${this.matchIx + 1} / ${OPPONENTS.length}`, W / 2, 80);

      // Player on left.
      Sprites.draw(ctx, 'pong.paddle_player', W * 0.25, 320, 80, 240, {
        fallback: () => { ctx.fillStyle = '#e7ecf3'; ctx.fillRect(W * 0.25 - 30, 220, 60, 200); }
      });
      ctx.fillStyle = '#e7ecf3';
      ctx.font = 'bold 22px ui-monospace, monospace';
      ctx.fillText('YOU', W * 0.25, 470);

      // Opponent on right.
      Sprites.draw(ctx, opp.sprite, W * 0.75, 300, 220, 220, {
        fallback: () => { ctx.fillStyle = opp.color; ctx.fillRect(W * 0.75 - 110, 190, 220, 220); }
      });
      ctx.fillStyle = opp.color;
      ctx.shadowColor = opp.color; ctx.shadowBlur = 14;
      ctx.font = 'bold 24px ui-monospace, monospace';
      ctx.fillText(opp.name, W * 0.75, 440);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff'; ctx.font = '13px ui-monospace, monospace';
      ctx.fillText(opp.tag, W * 0.75, 466);
      ctx.fillText(`First to ${opp.winsTo}`, W * 0.75, 488);

      const activeIds = Object.keys(this.activePerks);
      if (activeIds.length) {
        ctx.fillStyle = '#7ae0ff'; ctx.font = '12px ui-monospace, monospace';
        ctx.fillText('Perks: ' + activeIds.map(id => PERKS_BY_ID[id].name).join(' · '), W / 2, 540);
      }
    }

    _renderMatch(ctx) {
      const opp = OPPONENTS[this.matchIx];
      this._drawCenterLine(ctx);

      // Faint giant scores in the background.
      ctx.font = 'bold 130px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(231,236,243,0.18)';
      ctx.fillText(this.playerScore.toString(), W * 0.28, 60);
      ctx.fillStyle = `rgba(${hexToRgb(opp.color)},0.18)`;
      ctx.fillText(this.cpuScore.toString(), W * 0.72, 60);

      this._drawScorePips(ctx, opp);

      // Ball trail.
      for (const t of this.ballTrail) {
        const a = 1 - t.age / t.life;
        ctx.fillStyle = `rgba(255,216,107,${a * 0.6})`;
        ctx.fillRect(t.x - 4, t.y - 4, 8, 8);
      }

      // Side bumpers (perk).
      if (this.activePerks.bumper) {
        ['top', 'bottom'].forEach((side) => {
          const used = this.bumpers[side];
          const y = side === 'top' ? TOP_BAND_Y : BOT_BAND_Y;
          ctx.save();
          ctx.fillStyle = used ? '#3a1424' : '#ff4466';
          if (!used) { ctx.shadowColor = '#ff4466'; ctx.shadowBlur = 12; }
          ctx.fillRect(PLAYER_X - 30, y, 80, BAND_THICK);
          ctx.restore();
        });
      }

      // Balls — sprite halo + emoji-style fallback.
      for (const b of this.balls) {
        const sz = b.isTwin ? BALL_SIZE * 0.85 : BALL_SIZE;
        Sprites.draw(ctx, 'pong.ball_glow', b.x, b.y, sz * 2.6, sz * 2.6, {
          alpha: b.isTwin ? 0.7 : 1,
          fallback: () => {
            ctx.save();
            ctx.shadowColor = '#ffd86b'; ctx.shadowBlur = 18;
            ctx.fillStyle = b.isTwin ? '#7ae0ff' : '#ffd86b';
            ctx.fillRect(b.x - sz / 2, b.y - sz / 2, sz, sz);
            ctx.restore();
          }
        });
      }

      // Player paddle (sprite scaled to perk-aware height).
      const halfP = this._paddleHeight() / 2;
      Sprites.draw(ctx, 'pong.paddle_player',
                   PLAYER_X + PADDLE_W / 2, this.playerY,
                   PADDLE_W * 1.6, halfP * 2, {
        fallback: () => {
          ctx.save();
          ctx.shadowColor = '#e7ecf3'; ctx.shadowBlur = 10;
          ctx.fillStyle = '#e7ecf3';
          ctx.fillRect(PLAYER_X, this.playerY - halfP, PADDLE_W, halfP * 2);
          ctx.restore();
        }
      });

      // CPU paddle(s).
      for (const p of this.cpuPaddles) {
        Sprites.draw(ctx, opp.paddleSprite,
                     CPU_X + PADDLE_W / 2, p.y,
                     PADDLE_W * 1.6, PADDLE_H_BASE, {
          fallback: () => {
            ctx.save();
            ctx.shadowColor = opp.color; ctx.shadowBlur = 10;
            ctx.fillStyle = opp.color;
            ctx.fillRect(CPU_X, p.y - PADDLE_H_BASE / 2, PADDLE_W, PADDLE_H_BASE);
            ctx.restore();
          }
        });
      }

      // Opponent badge — small portrait top-right.
      Sprites.draw(ctx, opp.sprite, W - 64, 64, 64, 64, {
        fallback: () => { ctx.fillStyle = opp.color; ctx.fillRect(W - 96, 32, 64, 64); }
      });
      ctx.strokeStyle = opp.color; ctx.lineWidth = 2;
      ctx.strokeRect(W - 96, 32, 64, 64);
      ctx.fillStyle = '#fff'; ctx.font = '11px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(opp.name, W - 64, 100);

      // Serve countdown.
      if (this.serveTimer > 0 && this.balls.length === 0) {
        ctx.fillStyle = '#ffd86b';
        ctx.font = 'bold 28px ui-monospace, monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const dir = this.serveDir > 0 ? '→' : '←';
        ctx.fillText('SERVE  ' + dir, W / 2, H / 2);
      }

      if (this.phase === 'matchWin')  this._renderMatchOverlay(ctx, true);
      if (this.phase === 'matchLose') this._renderMatchOverlay(ctx, false);
    }

    _drawScorePips(ctx, opp) {
      const winsTo = opp.winsTo;
      const w = 14, gap = 6;
      const totalW = winsTo * w + (winsTo - 1) * gap;
      let x = W / 2 - 24 - totalW;
      for (let i = 0; i < winsTo; i++, x += w + gap) {
        ctx.fillStyle = i < this.playerScore ? '#7ae0ff' : '#1a2a3a';
        ctx.fillRect(x, 24, w, 8);
      }
      x = W / 2 + 24;
      for (let i = 0; i < winsTo; i++, x += w + gap) {
        ctx.fillStyle = i < this.cpuScore ? opp.color : '#3a1a2a';
        ctx.fillRect(x, 24, w, 8);
      }
    }

    _renderMatchOverlay(ctx, won) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, H / 2 - 90, W, 180);
      ctx.fillStyle = won ? '#4ade80' : '#ff4466';
      ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 18;
      ctx.font = 'bold 56px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(won ? 'MATCH WON' : 'MATCH LOST', W / 2, H / 2 - 14);
      ctx.shadowBlur = 0;
      if (won) {
        ctx.fillStyle = '#ffd86b'; ctx.font = '18px ui-monospace, monospace';
        const next = OPPONENTS[this.matchIx + 1];
        const tail = next ? 'click to draft a perk' : 'click to claim the trophy';
        ctx.fillText(`+${this.matchCoinReward} coins · ${tail}`, W / 2, H / 2 + 38);
      } else {
        ctx.fillStyle = '#fff'; ctx.font = '18px ui-monospace, monospace';
        ctx.fillText('Click to see results', W / 2, H / 2 + 38);
      }
    }

    _renderShop(ctx) {
      ctx.fillStyle = '#ffd86b';
      ctx.font = 'bold 36px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = '#ffd86b'; ctx.shadowBlur = 14;
      ctx.fillText('LOCKER · DRAFT A PERK', W / 2, 80);
      ctx.shadowBlur = 0;

      const next = OPPONENTS[this.matchIx + 1];
      if (next) {
        ctx.fillStyle = '#7ae0ff'; ctx.font = '15px ui-monospace, monospace';
        ctx.fillText(`Next up: ${next.name} — ${next.tag}`, W / 2, 124);
      }

      this.shopRects = [];
      const cardW = 200, cardH = 280, gap = 30;
      const totalW = cardW * 3 + gap * 2;
      const startX = W / 2 - totalW / 2;
      const y = 170;
      const mx = Input.mouse.x, my = Input.mouse.y;

      this.shopChoices.forEach((p, i) => {
        const x = startX + i * (cardW + gap);
        const hovered = mx >= x && mx <= x + cardW && my >= y && my <= y + cardH;
        const everOwned = !!this.save.perks[p.id];
        this.shopRects.push({ x, y, w: cardW, h: cardH, kind: 'perk', perk: p });

        ctx.fillStyle = hovered ? '#1f1830' : '#0d0a18';
        ctx.fillRect(x, y, cardW, cardH);
        ctx.strokeStyle = hovered ? '#ffd86b' : '#3a2a4a';
        ctx.lineWidth = hovered ? 3 : 2;
        ctx.strokeRect(x, y, cardW, cardH);

        Sprites.draw(ctx, p.sprite, x + cardW / 2, y + 96, 110, 110, {
          fallback: () => { ctx.fillStyle = '#7ae0ff'; ctx.fillRect(x + cardW / 2 - 40, y + 56, 80, 80); }
        });

        ctx.fillStyle = '#ffd86b'; ctx.font = 'bold 16px ui-monospace, monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(p.name, x + cardW / 2, y + 170);

        ctx.fillStyle = '#fff'; ctx.font = '12px ui-monospace, monospace';
        wrapText(ctx, p.desc, x + cardW / 2, y + 200, cardW - 24, 16);

        if (everOwned) {
          ctx.fillStyle = '#7ae0ff'; ctx.font = '10px ui-monospace, monospace';
          ctx.fillText('● drafted before', x + cardW / 2, y + cardH - 22);
        }
      });

      const sw = 220, sh = 44;
      const sx = W / 2 - sw / 2, sy = y + cardH + 30;
      const skipHover = mx >= sx && mx <= sx + sw && my >= sy && my <= sy + sh;
      this.shopRects.push({ x: sx, y: sy, w: sw, h: sh, kind: 'skip' });
      ctx.fillStyle = skipHover ? '#1a3a4a' : '#0a1a2a';
      ctx.fillRect(sx, sy, sw, sh);
      ctx.strokeStyle = '#7ae0ff'; ctx.lineWidth = 2;
      ctx.strokeRect(sx, sy, sw, sh);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 14px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('SKIP — go in raw', sx + sw / 2, sy + sh / 2);
    }

    _renderVictory(ctx) {
      ctx.fillStyle = '#ffd86b';
      ctx.font = 'bold 72px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = '#ffd86b'; ctx.shadowBlur = 20;
      ctx.fillText('CHAMPION', W / 2, 130);
      ctx.shadowBlur = 0;

      Sprites.draw(ctx, 'pong.trophy', W / 2, 320, 240, 240, {
        fallback: () => { ctx.fillStyle = '#ffd86b'; ctx.fillRect(W / 2 - 60, 240, 120, 160); }
      });

      ctx.fillStyle = '#7ae0ff'; ctx.font = '18px ui-monospace, monospace';
      ctx.fillText('You cleared all five rungs of the gauntlet.', W / 2, 480);
      ctx.fillText(`Total championships: ${this.save.totalChampionships}`, W / 2, 506);

      ctx.fillStyle = '#fff'; ctx.font = 'bold 22px ui-monospace, monospace';
      ctx.fillText('Click to claim victory', W / 2, 552);
    }

    _renderDefeat(ctx) {
      const opp = OPPONENTS[Math.min(this.matchIx, OPPONENTS.length - 1)];
      ctx.fillStyle = '#ff4466';
      ctx.font = 'bold 56px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = '#ff4466'; ctx.shadowBlur = 16;
      ctx.fillText('GAUNTLET DOWN', W / 2, 130);
      ctx.shadowBlur = 0;

      Sprites.draw(ctx, opp.sprite, W / 2, 290, 220, 220, {
        fallback: () => { ctx.fillStyle = opp.color; ctx.fillRect(W / 2 - 110, 180, 220, 220); }
      });

      ctx.fillStyle = '#fff'; ctx.font = '18px ui-monospace, monospace';
      ctx.fillText(`Defeated by ${opp.name}`, W / 2, 430);
      ctx.fillStyle = '#7ae0ff'; ctx.font = '14px ui-monospace, monospace';
      ctx.fillText(`Cleared ${this.matchIx} of ${OPPONENTS.length} foes`, W / 2, 460);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 20px ui-monospace, monospace';
      ctx.fillText('Click to leave the arena', W / 2, 526);
    }

    // Coins are awarded match-by-match; coinsEarned() stays at zero so
    // BaseGame's tally doesn't double-count.
    coinsEarned() { return 0; }
  }

  // ===========================================================================
  // Helpers
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function hexToRgb(hex) {
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff].join(',');
  }

  function wrapText(ctx, text, cx, y, maxW, lineH) {
    const words = text.split(' ');
    let line = '', yy = y;
    for (const word of words) {
      const test = line ? (line + ' ' + word) : word;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, cx, yy); line = word; yy += lineH;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, cx, yy);
  }

  // index.html doesn't yet include games/pong/sprites.js — defensively inject
  // it here so the portrait/paddle/perk SVGs end up registered. Drawing falls
  // back to flat-colour rects until rasterisation finishes (typically the very
  // first frame), so the tiny async window is invisible in practice.
  (function ensureSprites() {
    if (Sprites.has('pong.opp_rookie')) return;
    if (typeof document === 'undefined') return;
    const s = document.createElement('script');
    s.src = 'games/pong/sprites.js?v=2';
    s.async = false;
    document.head.appendChild(s);
  })();

  NDP.attachGame('pong', PongGame);
})();
