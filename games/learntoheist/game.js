/* Learn to Heist — main class.
   Phases: workshop -> aim -> power -> flight -> report.
   Drives simulation, spawning, rendering, shop, goals, and save state. */
(function () {
  const NDP = window.NDP;
  const LTH = NDP.LTH;
  const { Input, Draw, Color, TAU, Assets } = NDP.Engine;

  const W = 960, H = 600;

  class LearnToHeistGame extends NDP.Engine.BaseGame {
    constructor(canvas, manifest) {
      super(canvas, manifest);
      this.sfx = this.makeSfx({
        launch:   { freq: 180, dur: 0.35, type: 'sawtooth', vol: 0.12, slide: 220 },
        boost:    { freq: 120, dur: 0.08, type: 'square',   vol: 0.06, slide: 60 },
        coin:     { freq: 920, dur: 0.06, type: 'sine',     vol: 0.10 },
        fuel:     { freq: 620, dur: 0.14, type: 'triangle', vol: 0.10, slide: 180 },
        boing:    { freq: 400, dur: 0.22, type: 'square',   vol: 0.12, slide: 260 },
        bird:     { freq: 220, dur: 0.14, type: 'sawtooth', vol: 0.10, slide: -140 },
        crash:    { freq: 80,  dur: 0.4,  type: 'sawtooth', vol: 0.15, slide: -40 },
        ding:     { freq: 1200,dur: 0.12, type: 'sine',     vol: 0.10 },
        unlock:   { freq: 660, dur: 0.2,  type: 'square',   vol: 0.12, slide: 120 },
        tick:     { freq: 800, dur: 0.02, type: 'square',   vol: 0.03 },
        hit:      { freq: 300, dur: 0.1,  type: 'sawtooth', vol: 0.1 }
      });
    }

    init() {
      this.save = LTH.loadSave();
      this.world = LTH.World.newWorld();
      this.phase = 'workshop';       // workshop | aim | power | flight | report | shop
      this.prevPhase = null;

      // Run-scoped state
      this.cam = { x: 0, y: 0 };
      this.player = this._newPlayer();
      this.pickups = [];
      this.hazards = [];
      this.projectiles = [];
      this.effects = [];           // floating scores / notifications
      this.trails = [];            // booster trail particles
      this.spawnCursor = 200;      // next world x to spawn at
      this.spawnCursorTop = 0;     // next altitude band to spawn above

      // Launch UI state
      this.aimAngle = 0.7;     // radians, upward-forward bias
      this.aimMeterT = 0;
      this.powerT = 0;
      this.power = 0;

      // Run metrics
      this.run = {
        distance: 0, altitude: 0, maxAltitude: 0,
        coins: 0, mult: 1.0, multT: 0,
        time: 0, stunts: 0,
        fuelUsed: 0, pickups: 0, hazardsHit: 0,
        reachedSpace: false,
        flipT: 0, flipCount: 0,
        bossPunched: false
      };

      // Current modifier (picked each workshop entry)
      this.modifier = this._pickModifier();

      // Shop UI
      this.shopSel = 'ramp';
      this.shopFlash = 0;

      // Tutorial cue
      this.showHelp = true;

      this._applyStats();

      this.setHud(''); // rendered via overlay
    }

    // ---------- setup helpers ----------
    _newPlayer() {
      return {
        x: 0, y: 80,           // altitude in world units (y up = positive going up visually)
        vx: 0, vy: 0,
        angle: 0,
        av: 0,
        flying: false, dead: false,
        fuel: 1.0,
        boosterT: 0,
        gliderOpen: false,
        stallT: 0,
        spriteStage: 0,
        tiltInput: 0
      };
    }

    _pickModifier() {
      const m = LTH.MODIFIERS;
      return m[(Math.random() * m.length) | 0];
    }

    _applyStats() {
      this.stats = LTH.currentStats(this.save);
    }

    // ---------- phase transitions ----------
    _enterFlight() {
      const s = this.stats;
      const ang = this.aimAngle;
      const p = this.power;           // 0..1
      // Even a low-power launch should give you a real flight; a perfect
      // tap should feel rewarding. Starts at 55% of ramp rating, peaks at 130%.
      const basePower = (s.power || 420) * (0.55 + p * 0.75);
      const modPower = basePower + (this.modifier.w || 0);
      // aim angle uses canvas convention (negative = up). Flip Y for world (up = +y).
      const vx = Math.cos(ang) * modPower;
      const vy = -Math.sin(ang) * modPower;
      this.player.x = 0;
      this.player.y = 80;
      this.player.vx = vx;
      this.player.vy = vy;
      this.player.flying = true;
      this.player.angle = ang;
      this.player.fuel = s.fuel || 1.0;
      this.phase = 'flight';
      this.save.totalLaunches++;
      LTH.writeSave(this.save);
      this.sfx.play('launch');
      this.shake(8, 0.3);
      this.flash('#ffcc33', 0.12);
      // Pre-seed spawns ahead
      this.pickups.length = 0;
      this.hazards.length = 0;
      this.projectiles.length = 0;
      this.spawnCursor = 400;
      this._seedSpawns(0, 8000);
    }

    _endRun(reason) {
      if (this.phase === 'report') return;
      this.phase = 'report';
      // Coin payout
      const mod = this.modifier.coinMult || 1;
      const perk = 1 + (this.stats.coinBonus || 0);
      const earned = Math.round(this.run.coins * mod * perk);
      this.run.earned = earned;
      this.save.coins += earned;
      this.save.totalCoinsEarned += earned;
      if (this.run.distance > this.save.bestDistance) this.save.bestDistance = Math.round(this.run.distance);
      if (this.run.maxAltitude > this.save.bestAltitude) this.save.bestAltitude = Math.round(this.run.maxAltitude);
      if (this.run.coins > this.save.bestCoins) this.save.bestCoins = this.run.coins;

      // Check goals
      this.run.completedGoals = [];
      for (const g of LTH.GOALS) {
        if (this.save.goalsDone.indexOf(g.id) !== -1) continue;
        const val = this._goalProgress(g);
        if (val >= g.target) {
          this.save.goalsDone.push(g.id);
          this.save.coins += g.reward;
          this.run.completedGoals.push(g);
        }
      }

      // stage progression
      const doneCount = this.save.goalsDone.length;
      this.save.stageIdx = Math.min(LTH.STAGES.length - 1, Math.floor(doneCount / 2));
      if (this.run.bossPunched) this.save.bossBeaten = true;

      LTH.writeSave(this.save);
      this.sfx.play('crash');
      this.shake(10, 0.4);
    }

    _goalProgress(g) {
      switch (g.kind) {
        case 'distance': return this.run.distance;
        case 'altitude': return this.run.maxAltitude;
        case 'coins':    return this.run.coins;
        case 'stunts':   return this.run.stunts;
        case 'time':     return this.run.time;
        case 'boss':     return this.run.bossPunched ? 1 : 0;
      }
      return 0;
    }

    // ---------- update ----------
    update(dt) {
      switch (this.phase) {
        case 'workshop': return this._updateWorkshop(dt);
        case 'aim':      return this._updateAim(dt);
        case 'power':    return this._updatePower(dt);
        case 'flight':   return this._updateFlight(dt);
        case 'report':   return this._updateReport(dt);
        case 'shop':     return this._updateShop(dt);
      }
    }

    _updateWorkshop(dt) {
      const k = Input.keys;
      if (Input.mouse.justPressed) { this.phase = 'aim'; this.aimMeterT = 0; }
      if (k[' '] || k['Space']) { this.phase = 'aim'; this.aimMeterT = 0; k[' '] = false; }
      if (k['s'] || k['S']) { this.prevPhase = 'workshop'; this.phase = 'shop'; k['s'] = false; k['S'] = false; }
      if (k['r'] || k['R']) {
        // reroll modifier
        this.modifier = this._pickModifier();
        k['r'] = false; k['R'] = false;
        this.sfx.play('tick');
      }
    }

    _updateAim(dt) {
      this.aimMeterT += dt;
      // Smooth slow oscillation between ~20° and ~80° above horizontal.
      // Slower than the original so you can actually time it instead of
      // mashing on a moving target.
      const osc = Math.sin(this.aimMeterT * 1.55);
      this.aimAngle = -0.9 + osc * 0.55;   // canvas convention (negative = up)
      if (Input.mouse.justPressed) {
        this.phase = 'power';
        this.powerT = 0;
        this.sfx.play('tick');
      }
    }

    _updatePower(dt) {
      this.powerT += dt;
      // Triangle wave with a longer period so the peak is hittable.
      const f = (this.powerT * 0.8) % 2;
      this.power = f < 1 ? f : 2 - f;
      if (Input.mouse.justPressed) { this._enterFlight(); }
    }

    _updateFlight(dt) {
      const p = this.player;
      const s = this.stats;
      const mod = this.modifier;
      this.run.time += dt;

      // -----------------------------------------------------------
      // PITCH CONTROL
      // -----------------------------------------------------------
      // Direct authority: A/LEFT raises nose, D/RIGHT drops nose.
      // No auto-recovery — the body stays exactly where you put it,
      // which is what makes a Learn-to-Fly style sim feel "real."
      const k = Input.keys;
      const ROT_RATE = 1.9;   // rad/sec while held
      let rot = 0;
      if (k['a'] || k['A'] || k['ArrowLeft'])  rot -= ROT_RATE;
      if (k['d'] || k['D'] || k['ArrowRight']) rot += ROT_RATE;
      p.angle += rot * dt;
      p.angle = Math.atan2(Math.sin(p.angle), Math.cos(p.angle));

      if (k['g'] || k['G']) {
        p.gliderOpen = !p.gliderOpen;
        k['g'] = false; k['G'] = false;
        this.sfx.play('tick');
      }

      // -----------------------------------------------------------
      // AERODYNAMICS
      // -----------------------------------------------------------
      // Velocity vector + angle of attack. Both use canvas convention
      // (atan2(-vy, vx)) so AoA = velAngle - bodyAngle. Positive AoA
      // means the nose is pitched ABOVE the velocity vector — that's
      // when wings generate lift.
      const speed = Math.hypot(p.vx, p.vy);
      const velAngle = speed > 1 ? Math.atan2(-p.vy, p.vx) : p.angle;
      let aoa = velAngle - p.angle;
      while (aoa >  Math.PI) aoa -= Math.PI * 2;
      while (aoa < -Math.PI) aoa += Math.PI * 2;

      // Air density falls off with altitude. Sea level ≈ 1.0; effectively
      // vacuum past 2500m. Both lift AND drag scale with density, so
      // high-altitude flight is fast but the wings stop biting.
      const density = Math.max(0.04, 1 - Math.max(0, p.y) / 2500);

      // Auto-glider perk: pop the wings open at apex.
      if ((s.autoGlider || false) && !p.gliderOpen && p.vy < 0) p.gliderOpen = true;

      // Lift coefficient: tiny base lift from the body shape, big boost
      // when the glider is deployed (scaled by glider tier). Lift scales
      // with speed² and a sin(AoA)-shaped curve that *stalls* past ~34°.
      const baseLiftCoef = 0.0028 + (p.gliderOpen ? (s.lift || 0) * 0.020 : 0);
      const STALL = 0.6;            // ~34°
      let liftShape;
      if (Math.abs(aoa) < STALL) {
        liftShape = Math.sin(aoa * 1.55);
      } else {
        // post-stall: lift collapses and even reverses slightly
        const over = Math.abs(aoa) - STALL;
        const peak = Math.sin(STALL * 1.55);
        liftShape = Math.sign(aoa) * Math.max(-0.25, peak - over * 2.4);
      }
      const liftMag = baseLiftCoef * density * speed * speed * liftShape;

      // Drag: small streamlined drag, plus a heavy broadside penalty.
      // Stalled = even more drag, which is what makes a stalled wing feel
      // like a brick.
      const baseDrag = (s.drag || 0.012);
      const broadside = 1 + Math.abs(aoa) * 2.4 + (Math.abs(aoa) > STALL ? 2.2 : 0);
      const dragMag = baseDrag * density * speed * speed * broadside * 0.0034;

      // Apply lift perpendicular to velocity (in world y-up frame, the
      // CCW perpendicular of (vx, vy) is (-vy, vx)) and drag opposite to it.
      if (speed > 1) {
        const invS = 1 / speed;
        const perpX = -p.vy * invS;
        const perpY =  p.vx * invS;
        p.vx += perpX * liftMag * dt;
        p.vy += perpY * liftMag * dt;
        p.vx -= (p.vx * invS) * dragMag * dt;
        p.vy -= (p.vy * invS) * dragMag * dt;
      }

      // -----------------------------------------------------------
      // GRAVITY
      // -----------------------------------------------------------
      // Constant pull, very slightly weakened once you're truly in space
      // so orbital play doesn't feel hopeless. NOT used as a fudge for
      // making the lower atmosphere feel floaty.
      const gStrength = p.y < 1800 ? 520 : Math.max(140, 520 - (p.y - 1800) * 0.18);
      p.vy -= gStrength * dt;

      // -----------------------------------------------------------
      // BOOSTER
      // -----------------------------------------------------------
      // Pure thrust along the nose. You steer with pitch, the booster
      // adds energy in whatever direction you're already pointing —
      // exactly like the rocket in the later Learn to Fly games.
      // Tier 0 thrust (900) beats gravity (520) so even a starter
      // booster pointed straight up actually CLIMBS.
      const boosting = (k[' '] || k['Space']) && p.fuel > 0;
      if (boosting) {
        const thrust = (s.thrust || 900) * (mod.thrustMult || 1);
        p.vx +=  Math.cos(p.angle) * thrust * dt;
        p.vy += -Math.sin(p.angle) * thrust * dt;
        // Engagement kick: an instantaneous impulse the moment the
        // booster lights so the player feels the rocket "fire" rather
        // than ramp. Only on the first frame of a press.
        if (!p._wasBoosting) {
          const kick = thrust * 0.04;
          p.vx +=  Math.cos(p.angle) * kick;
          p.vy += -Math.sin(p.angle) * kick;
          this.sfx.play('boost', { freq: 220, dur: 0.18, vol: 0.10 });
          this.shake(3, 0.12);
        }
        p._wasBoosting = true;
        p.fuel -= 0.16 * dt;
        this.run.fuelUsed += dt;
        p.boosterT += dt;
        // Throttle the boost loop sfx — the old `% 0.05 < dt` test fires
        // basically every frame at 60 fps, which sounds like a buzzsaw.
        p._boostSfxT = (p._boostSfxT || 0) - dt;
        if (p._boostSfxT <= 0) {
          this.sfx.play('boost');
          p._boostSfxT = 0.09;
        }
        for (let i = 0; i < 3; i++) {
          this.trails.push({
            x: p.x - Math.cos(p.angle) * 22 + (Math.random() - 0.5) * 10,
            y: p.y + Math.sin(p.angle) * 22 + (Math.random() - 0.5) * 10,
            vx: -p.vx * 0.18 - Math.cos(p.angle) * 80 + (Math.random() - 0.5) * 70,
            vy: -p.vy * 0.18 + Math.sin(p.angle) * 80 + (Math.random() - 0.5) * 70,
            life: 0.7, age: 0,
            size: 8 + Math.random() * 5,
            color: i === 0 ? '#ffdd55' : (i === 1 ? '#ff8833' : '#ff5522')
          });
        }
      } else {
        p._wasBoosting = false;
        if (p.fuel < 0) p.fuel = 0;
      }

      // Track flips (full rotations while airborne, altitude > 50)
      if (p._lastAngle == null) p._lastAngle = p.angle;
      let dAng = p.angle - p._lastAngle;
      while (dAng > Math.PI) dAng -= Math.PI * 2;
      while (dAng < -Math.PI) dAng += Math.PI * 2;
      p._lastAngle = p.angle;
      if (p.y > 50) {
        p._spinAccum = (p._spinAccum || 0) + dAng;
        if (Math.abs(p._spinAccum) > Math.PI * 2) {
          this.run.stunts++;
          p._spinAccum -= Math.sign(p._spinAccum) * Math.PI * 2;
          this._addFloat(p.x, p.y, '+50 STUNT', '#ff7ad8');
          this.run.coins += 50;
          this.sfx.play('ding');
        }
      } else {
        p._spinAccum = 0;
      }

      // integrate
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      // keep angle sensible
      p.angle = Math.atan2(Math.sin(p.angle), Math.cos(p.angle));

      // Ground collision — skip across the grass at shallow angles
      // (Learn to Fly's skipping-stone feel), pancake on steep impacts.
      if (p.y <= 0) {
        p.y = 0;
        if (p.vy < 0) {
          const impactAngle = Math.atan2(-p.vy, Math.abs(p.vx) + 1);
          if (impactAngle > 0.7 || speed < 90) {
            this._explode(p.x, 5, 14, '#ff8833');
            this.sfx.play('crash');
            this._endRun('ground');
            return;
          }
          p.vy = Math.abs(p.vy) * 0.45;
          p.vx *= 0.82;
          this.sfx.play('boing');
          if (Math.abs(p.vx) > 120) this._addFloat(p.x, 30, 'SKIP!', '#ffdd77');
        }
      }

      // Update metrics
      if (p.x > this.run.distance) this.run.distance = p.x;
      this.run.altitude = p.y;
      if (p.y > this.run.maxAltitude) this.run.maxAltitude = p.y;
      if (p.y > 1800 && !this.run.reachedSpace) { this.run.reachedSpace = true; this._addFloat(p.x, p.y, 'SPACE!', '#ffffff'); }

      // Camera follow (with lead)
      const camLag = 0.12;
      const targetCamX = p.x + p.vx * 0.18;
      const targetCamY = Math.max(80, p.y + 60);
      this.cam.x += (targetCamX - this.cam.x) * (1 - Math.pow(0.0001, dt));
      this.cam.y += (targetCamY - this.cam.y) * (1 - Math.pow(0.001, dt));

      // Multiplier decay
      if (this.run.multT > 0) {
        this.run.multT -= dt;
        if (this.run.multT <= 0) this.run.mult = 1;
      }

      // Spawning — ensure pickups/hazards exist ahead of player
      if (p.x + 2000 > this.spawnCursor) {
        this._seedSpawns(this.spawnCursor, this.spawnCursor + 2500);
      }
      this._updatePickups(dt);
      this._updateHazards(dt);
      this._updateProjectiles(dt);
      this._updateTrails(dt);
      this._updateEffects(dt);

      // Boss / vault punch — when reaching orbit near the vault
      if (p.y > 2400 && !this.run.bossPunched) {
        this._bossCheck(dt);
      }

      // End run if we come to a stop on the ground
      if (p.y < 2 && Math.abs(p.vx) < 10) {
        this._endRun('stopped');
      }
    }

    _bossCheck(dt) {
      const p = this.player;
      const v = this.world.vault;
      v.x += v.vx * dt;
      v.y += v.vy * dt;
      const dx = v.x - p.x, dy = v.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d < 60) {
        this.run.bossPunched = true;
        this._addFloat(p.x, p.y + 40, 'PUNCH!', '#ffcc33');
        this._explode(v.x, v.y, 60, '#ffcc33');
        this.run.coins += 500;
        this.sfx.play('unlock');
        this.shake(20, 0.8);
        this.flash('#ffcc33', 0.4);
      }
    }

    // ---------- spawning ----------
    _seedSpawns(x0, x1) {
      const step = 80;
      for (let x = x0; x < x1; x += step + Math.random() * 100) {
        const altSample = Math.max(40, 150 + Math.random() * 2200);
        const band = LTH.bandIndex(altSample);
        // pick weighted entry
        const total = LTH.SPAWNS.reduce((a, e) => a + (e.w[band] || 0), 0);
        if (total <= 0) continue;
        let r = Math.random() * total;
        let chosen = null;
        for (const e of LTH.SPAWNS) {
          const w = e.w[band] || 0;
          if (r < w) { chosen = e; break; }
          r -= w;
        }
        if (!chosen) continue;
        if (chosen.hazard) this._spawnHazard(chosen.id, x, altSample);
        else this._spawnPickup(chosen.id, x, altSample);
      }
      this.spawnCursor = x1;
    }

    _spawnPickup(id, x, y) {
      const def = LTH.PICKUP_DEFS[id];
      if (!def) return;
      this.pickups.push({
        id, x, y,
        r: def.r,
        def,
        t: Math.random() * Math.PI * 2,
        taken: false
      });
    }

    _spawnHazard(id, x, y) {
      const def = LTH.HAZARD_DEFS[id];
      if (!def) return;
      this.hazards.push({
        id, x, y,
        r: def.r, def,
        vx: (Math.random() - 0.5) * 40,
        vy: (Math.random() - 0.5) * 30,
        t: 0, fireT: 0.6 + Math.random()
      });
    }

    // ---------- updates for entities ----------
    _updatePickups(dt) {
      const p = this.player;
      const mag = this.stats.magnet || 0;
      for (let i = this.pickups.length - 1; i >= 0; i--) {
        const pk = this.pickups[i];
        pk.t += dt;
        // cull behind player
        if (pk.x < p.x - 1200) { this.pickups.splice(i, 1); continue; }
        const dx = p.x - pk.x, dy = p.y - pk.y;
        const d = Math.hypot(dx, dy);
        if (mag > 0 && d < mag && d > 2 && !pk.taken) {
          pk.x += (dx / d) * 400 * dt;
          pk.y += (dy / d) * 400 * dt;
        }
        if (d < pk.r + 16) this._collectPickup(pk, i);
      }
    }

    _collectPickup(pk, i) {
      const p = this.player;
      const def = pk.def;
      if (pk.id === 'coin') {
        this.run.coins += Math.round((def.value || 1) * this.run.mult);
        this.sfx.play('coin', { freq: 900 + Math.random() * 300 });
        this._coinBurst(pk.x, pk.y, 4);
      } else if (pk.id === 'coin_stack') {
        this.run.coins += Math.round((def.value || 5) * this.run.mult);
        this.sfx.play('coin', { freq: 1100 });
        this._coinBurst(pk.x, pk.y, 12);
      } else if (pk.id === 'fuel') {
        p.fuel = Math.min((this.stats.fuel || 1) + 0.2, p.fuel + 0.5);
        this.sfx.play('fuel');
        this._addFloat(pk.x, pk.y, '+FUEL', '#5fd4ff');
      } else if (pk.id === 'mult') {
        this.run.mult = Math.min(5, this.run.mult + 0.5);
        this.run.multT = 8;
        this.sfx.play('ding');
        this._addFloat(pk.x, pk.y, 'x' + this.run.mult.toFixed(1), '#ff7ad8');
      } else if (pk.id === 'balloon') {
        p.vy += def.boost;
        this.sfx.play('boing');
        this._addFloat(pk.x, pk.y, 'BOING', '#ff6677');
      } else if (pk.id === 'cloud') {
        // soft bounce + decelerate
        p.vy *= 0.7; p.vx *= 0.9;
        // don't remove clouds instantly — they're scenery-passable. Skip removal.
        return;
      } else if (pk.id === 'trampoline') {
        p.vy = Math.abs(p.vy) + def.boost;
        this.sfx.play('boing');
        this._addFloat(pk.x, pk.y, 'BOING!', '#ffcc33');
      } else if (pk.id === 'ring') {
        // ring pass = bonus
        this.run.coins += Math.round(15 * this.run.mult);
        this.sfx.play('ding', { freq: 1400 });
        this._addFloat(pk.x, pk.y, '+15 RING', '#ffdd77');
        this._coinBurst(pk.x, pk.y, 8);
      }
      pk.taken = true;
      this.pickups.splice(i, 1);
      this.run.pickups++;
    }

    _updateHazards(dt) {
      const p = this.player;
      for (let i = this.hazards.length - 1; i >= 0; i--) {
        const h = this.hazards[i];
        h.t += dt;
        const def = h.def;
        // movement
        if (def.chase) {
          const dx = p.x - h.x, dy = p.y - h.y;
          const d = Math.hypot(dx, dy) || 1;
          h.vx += (dx / d) * 60 * dt;
          h.vy += (dy / d) * 40 * dt;
          h.vx *= 0.98; h.vy *= 0.98;
        } else {
          // gentle drift
          h.vx += Math.sin(h.t * 1.3) * 10 * dt;
          h.vy += Math.cos(h.t * 0.9) * 10 * dt;
        }
        h.x += h.vx * dt;
        h.y += h.vy * dt;
        // cull
        if (h.x < p.x - 1200) { this.hazards.splice(i, 1); continue; }
        // enemy shoots
        if (def.shoots) {
          h.fireT -= dt;
          if (h.fireT <= 0 && Math.abs(p.x - h.x) < 900 && Math.abs(p.y - h.y) < 700) {
            h.fireT = 1.6 + Math.random() * 1.4;
            const dx = p.x - h.x, dy = p.y - h.y;
            const d = Math.hypot(dx, dy) || 1;
            this.projectiles.push({
              x: h.x, y: h.y,
              vx: (dx / d) * 380, vy: (dy / d) * 380,
              life: 2.4, r: 4, dmg: 10, color: '#ff4455'
            });
          }
        }
        // collide with player — real iframes gate ALL hazard types
        const dx = p.x - h.x, dy = p.y - h.y;
        if (dx * dx + dy * dy < (h.r + 16) * (h.r + 16) && (p._hitIframe || 0) <= 0) {
          this._applyHazardHit(h);
          // every hazard removes on hit, including stormclouds — no DoT.
          this.hazards.splice(i, 1);
        }
      }
      p._hitIframe = Math.max(0, (p._hitIframe || 0) - dt);
    }

    _applyHazardHit(h) {
      const p = this.player;
      const def = h.def;
      // Hazards never kill — they brake your speed and shove you off course.
      // The only way the run ends is hitting the ground.
      p.vx *= def.speedHit;
      p.vy *= def.speedHit;
      if (def.drag) p.vx -= p.vx * def.drag * 60;
      // small angular kick so a hit feels disruptive without flipping you
      p.angle += (Math.random() - 0.5) * 0.6;
      this.sfx.play('hit');
      this.shake(6, 0.2);
      this.flash('#ff4444', 0.1);
      p._hitIframe = 1.1;
      this.run.hazardsHit++;
      this._addFloat(h.x, h.y, 'OOF!', '#ff7777');
      this._explode(h.x, h.y, 12, def.color);
    }

    _updateProjectiles(dt) {
      const p = this.player;
      for (let i = this.projectiles.length - 1; i >= 0; i--) {
        const b = this.projectiles[i];
        b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
        if (b.life <= 0) { this.projectiles.splice(i, 1); continue; }
        const dx = p.x - b.x, dy = p.y - b.y;
        if (dx * dx + dy * dy < (b.r + 14) * (b.r + 14) && !p._hitIframe) {
          // bullets just shove you and burn briefly — no kill
          p.vx *= 0.8;
          p.vy *= 0.8;
          p._hitIframe = 0.3;
          this.sfx.play('hit');
          this.shake(4, 0.12);
          this._addFloat(b.x, b.y, 'HIT', '#ff7777');
          this.projectiles.splice(i, 1);
        }
      }
    }

    _updateTrails(dt) {
      for (let i = this.trails.length - 1; i >= 0; i--) {
        const t = this.trails[i];
        t.age += dt;
        if (t.age >= t.life) { this.trails.splice(i, 1); continue; }
        t.x += t.vx * dt;
        t.y += t.vy * dt;
        t.vx *= 0.96; t.vy *= 0.96;
      }
    }

    _updateEffects(dt) {
      for (let i = this.effects.length - 1; i >= 0; i--) {
        const e = this.effects[i];
        e.age += dt;
        if (e.age >= e.life) { this.effects.splice(i, 1); continue; }
        e.y += 40 * dt;
      }
    }

    _addFloat(x, y, text, color) {
      this.effects.push({ x, y, text, color: color || '#fff', life: 1.2, age: 0 });
    }

    _coinBurst(x, y, n) {
      this.particles.burst(x, y, n, {
        color: '#ffcc33', speed: 220, life: 0.5, size: 3, shape: 'circle'
      });
    }

    _explode(x, y, n, color) {
      this.particles.burst(x, y, n, { color: color || '#ff8833', speed: 280, life: 0.6, size: 4 });
    }

    _updateReport(dt) {
      const k = Input.keys;
      if (Input.mouse.justPressed || k['Enter'] || k['r'] || k['R']) {
        this._reset();
        k['Enter'] = false; k['r'] = false; k['R'] = false;
      }
      if (k['s'] || k['S']) {
        this.prevPhase = 'report'; this.phase = 'shop';
        k['s'] = false; k['S'] = false;
      }
    }

    _reset() {
      // reset run state, pick new modifier, back to workshop
      this.player = this._newPlayer();
      this.pickups = [];
      this.hazards = [];
      this.projectiles = [];
      this.trails = [];
      this.effects = [];
      this.particles.clear();
      this.spawnCursor = 200;
      this.run = {
        distance: 0, altitude: 0, maxAltitude: 0,
        coins: 0, mult: 1.0, multT: 0,
        time: 0, stunts: 0,
        fuelUsed: 0, pickups: 0, hazardsHit: 0,
        reachedSpace: false,
        flipCount: 0, bossPunched: false
      };
      this.cam.x = 0; this.cam.y = 0;
      this.modifier = this._pickModifier();
      this._applyStats();
      this.phase = 'workshop';
    }

    _updateShop(dt) {
      const k = Input.keys;
      const keys = Object.keys(LTH.UPGRADES);
      if (k['ArrowUp'] || k['w'] || k['W']) {
        const i = keys.indexOf(this.shopSel);
        this.shopSel = keys[(i - 1 + keys.length) % keys.length];
        this.sfx.play('tick');
        k['ArrowUp'] = false; k['w'] = false; k['W'] = false;
      }
      if (k['ArrowDown'] || k['s'] && false) {}
      if (k['ArrowDown']) {
        const i = keys.indexOf(this.shopSel);
        this.shopSel = keys[(i + 1) % keys.length];
        this.sfx.play('tick');
        k['ArrowDown'] = false;
      }
      if (k['Enter'] || k[' '] || Input.mouse.justPressed) {
        if (LTH.buyNextTier(this.shopSel, this.save)) {
          this.sfx.play('unlock');
          this.shopFlash = 0.8;
          this._applyStats();
          LTH.writeSave(this.save);
        } else {
          this.sfx.play('hit');
        }
        k['Enter'] = false; k[' '] = false;
      }
      if (k['Escape'] || k['q'] || k['Q']) {
        this.phase = this.prevPhase || 'workshop';
        k['Escape'] = false; k['q'] = false; k['Q'] = false;
      }
      if (this.shopFlash > 0) this.shopFlash = Math.max(0, this.shopFlash - dt);
    }

    // =====================================================
    //                    RENDERING
    // =====================================================
    render(ctx) {
      switch (this.phase) {
        case 'workshop': return this._drawWorkshop(ctx);
        case 'aim':
        case 'power':    return this._drawLaunchUi(ctx);
        case 'flight':   return this._drawFlight(ctx);
        case 'report':   return this._drawReport(ctx);
        case 'shop':     return this._drawShop(ctx);
      }
    }

    _drawWorkshop(ctx) {
      // Set camera to 0
      this.cam.x = 0; this.cam.y = 0;
      LTH.World.render(ctx, this.world, this.cam, W, H, 0.016);
      LTH.World.renderRamp(ctx, this.cam, W, H, this.save.tiers.ramp | 0);

      // Pre-launch goblin on ramp
      const rampBase = 80 + (this.save.tiers.ramp | 0) * 20;
      const gx = W * 0.5 + 10, gy = (H - 30) - rampBase + 4;
      this._drawVehicle(ctx, gx, gy, 0, false);

      // Intro card
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(W * 0.18, 60, W * 0.64, 170);
      ctx.strokeStyle = '#ffcc33'; ctx.lineWidth = 2;
      ctx.strokeRect(W * 0.18 + 0.5, 60.5, W * 0.64, 170);
      Draw.text(ctx, 'LEARN TO HEIST', W / 2, 100, { size: 30, color: '#ffcc33', weight: '800', align: 'center' });
      Draw.text(ctx, 'Click to begin aim \u2022 then click to lock power. Good luck, goblin.',
        W / 2, 130, { size: 13, color: '#fff', align: 'center' });
      // status line
      Draw.text(ctx, 'Coins: \u25CF ' + this.save.coins + '     Launches: ' + this.save.totalLaunches +
        '     Best Dist: ' + this.save.bestDistance + 'm     Best Alt: ' + this.save.bestAltitude + 'm',
        W / 2, 158, { size: 12, color: '#aee', align: 'center' });
      Draw.text(ctx, 'Today\'s Weather: ' + this.modifier.name + ' \u2014 ' + this.modifier.desc,
        W / 2, 182, { size: 12, color: '#ffcc33', align: 'center' });
      Draw.text(ctx, '[S] Workshop   [R] Reroll Weather   [Click/Space] Launch',
        W / 2, 208, { size: 11, color: '#b8cdd8', align: 'center' });

      // Goal progress strip
      const done = this.save.goalsDone.length;
      Draw.text(ctx, 'Goals ' + done + ' / ' + LTH.GOALS.length, 30, 40, { size: 14, color: '#ffcc33', weight: '700' });
      for (let i = 0; i < LTH.GOALS.length; i++) {
        const filled = this.save.goalsDone.indexOf(LTH.GOALS[i].id) !== -1;
        ctx.fillStyle = filled ? '#ffcc33' : 'rgba(255,255,255,0.2)';
        ctx.fillRect(30 + i * 18, 46, 14, 14);
      }
    }

    _drawLaunchUi(ctx) {
      // Still drawn over workshop scene
      this._drawWorkshop(ctx);
      // Overlay: aim / power meter
      if (this.phase === 'aim') {
        // arc indicator
        const cx = W / 2 + 10, cy = H - 110;
        ctx.strokeStyle = '#ffcc33'; ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, cy, 80, Math.PI * 1.2, Math.PI * 1.8);
        ctx.stroke();
        const ang = this.aimAngle; // radians
        const rx = cx + Math.cos(ang) * 80;
        const ry = cy + Math.sin(ang) * 80;
        ctx.strokeStyle = '#ff7755'; ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(cx, cy); ctx.lineTo(rx, ry);
        ctx.stroke();
        // ballistic preview: dotted parabola showing where a mid-power
        // launch at this angle would carry you (no-lift, no-drag estimate).
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.setLineDash([4, 6]);
        ctx.lineWidth = 2;
        ctx.beginPath();
        const pv = (this.stats.power || 420) * 0.95;
        const vx0 = Math.cos(ang) * pv;
        const vy0 = -Math.sin(ang) * pv;     // canvas y-down
        let px = cx, py = cy;
        ctx.moveTo(px, py);
        for (let t = 0; t < 1.4; t += 0.05) {
          px = cx + vx0 * t * 0.5;
          py = cy + (vy0 * t + 0.5 * 520 * t * t) * 0.5;
          if (py > cy + 90 || px > W) break;
          ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        Draw.text(ctx, 'CLICK to lock ANGLE', W / 2, 80, { size: 22, color: '#ffcc33', weight: '800', align: 'center' });
      } else {
        // power bar
        const cx = W / 2 - 140, cy = H - 70;
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(cx, cy, 280, 20);
        const segs = 20;
        for (let i = 0; i < segs; i++) {
          const t = i / segs;
          const filled = t <= this.power;
          if (!filled) continue;
          const color = t < 0.4 ? '#66ff88' : t < 0.7 ? '#ffcc33' : '#ff4455';
          ctx.fillStyle = color;
          ctx.fillRect(cx + 2 + i * 14, cy + 2, 12, 16);
        }
        ctx.strokeStyle = '#ffcc33'; ctx.lineWidth = 2;
        ctx.strokeRect(cx + 0.5, cy + 0.5, 280, 20);
        Draw.text(ctx, 'CLICK at PEAK POWER', W / 2, 80, { size: 22, color: '#ffcc33', weight: '800', align: 'center' });
      }
    }

    _drawFlight(ctx) {
      LTH.World.render(ctx, this.world, this.cam, W, H, 0.016);
      LTH.World.renderRamp(ctx, this.cam, W, H, this.save.tiers.ramp | 0);

      // Render pickups
      for (const pk of this.pickups) this._drawPickup(ctx, pk);
      // Hazards
      for (const hz of this.hazards) this._drawHazard(ctx, hz);
      // Projectiles
      for (const b of this.projectiles) {
        const sx = b.x - this.cam.x + W / 2;
        const sy = this.cam.y - b.y + H * 0.4;
        ctx.fillStyle = b.color;
        ctx.beginPath(); ctx.arc(sx, sy, b.r, 0, TAU); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(sx, sy, b.r * 0.4, 0, TAU); ctx.fill();
      }

      // Trails (under player)
      for (const t of this.trails) {
        const sx = t.x - this.cam.x + W / 2;
        const sy = this.cam.y - t.y + H * 0.4;
        const a = 1 - t.age / t.life;
        ctx.globalAlpha = a;
        ctx.fillStyle = t.color;
        ctx.beginPath();
        ctx.arc(sx, sy, t.size * a, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Player
      const p = this.player;
      const psx = p.x - this.cam.x + W / 2;
      const psy = this.cam.y - p.y + H * 0.4;

      // Velocity vector indicator — a thin yellow arrow showing where you're
      // *actually* moving. The gap between this and your nose is your angle
      // of attack: small gap = clean lift, large gap = drag/stall.
      const vSpeed = Math.hypot(p.vx, p.vy);
      if (vSpeed > 30) {
        const len = Math.min(60, 14 + vSpeed * 0.05);
        const vAng = Math.atan2(-p.vy, p.vx);
        const ex = psx + Math.cos(vAng) * len;
        const ey = psy + Math.sin(vAng) * len;
        ctx.strokeStyle = 'rgba(255,221,85,0.55)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(psx, psy); ctx.lineTo(ex, ey);
        ctx.stroke();
        // little arrowhead
        ctx.fillStyle = 'rgba(255,221,85,0.8)';
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - Math.cos(vAng - 0.4) * 6, ey - Math.sin(vAng - 0.4) * 6);
        ctx.lineTo(ex - Math.cos(vAng + 0.4) * 6, ey - Math.sin(vAng + 0.4) * 6);
        ctx.closePath();
        ctx.fill();
      }

      this._drawVehicle(ctx, psx, psy, p.angle, true);

      // STALL warning ring — pulses red when AoA crosses the stall edge.
      if (vSpeed > 60) {
        const vAng = Math.atan2(-p.vy, p.vx);
        let aoa = vAng - p.angle;
        while (aoa > Math.PI) aoa -= Math.PI * 2;
        while (aoa < -Math.PI) aoa += Math.PI * 2;
        if (Math.abs(aoa) > 0.6) {
          const pulse = 0.45 + Math.sin(p._lastAngle * 12 + this.run.time * 14) * 0.25;
          ctx.strokeStyle = 'rgba(255,80,80,' + pulse.toFixed(2) + ')';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(psx, psy, 28, 0, TAU);
          ctx.stroke();
          if ((this.run.time * 4) % 1 < 0.5) {
            Draw.text(ctx, 'STALL', psx, psy - 36, {
              size: 11, color: '#ff7777', weight: '800', align: 'center'
            });
          }
        }
      }

      // Floating text effects
      for (const e of this.effects) {
        const sx = e.x - this.cam.x + W / 2;
        const sy = this.cam.y - e.y + H * 0.4;
        const a = 1 - e.age / e.life;
        ctx.globalAlpha = a;
        Draw.text(ctx, e.text, sx, sy - e.age * 30, {
          size: 16, color: e.color, weight: '800', align: 'center'
        });
      }
      ctx.globalAlpha = 1;

      // HUD
      this._drawFlightHud(ctx);
    }

    _drawVehicle(ctx, sx, sy, angle, flying) {
      const stage = Math.min(LTH.STAGES.length - 1, this.save.stageIdx | 0);
      const stageDef = LTH.STAGES[stage];
      const booster = (this.save.tiers.booster | 0);
      const glider = (this.save.tiers.glider | 0);
      const body = (this.save.tiers.body | 0);
      const gOpen = flying && (this.player && this.player.gliderOpen);

      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(-angle); // our world angles flipped

      // Glider wings
      if (glider > 0 && gOpen) {
        ctx.fillStyle = ['#888', '#c84', '#4b8', '#49c', '#a6f'][Math.min(4, glider - 1)];
        ctx.beginPath();
        ctx.moveTo(-4, 0);
        ctx.lineTo(-18, -18 - glider * 2);
        ctx.lineTo(22, -8);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#000a';
        ctx.beginPath();
        ctx.moveTo(-4, 0);
        ctx.lineTo(-18, 18 + glider * 2);
        ctx.lineTo(22, 8);
        ctx.closePath(); ctx.fill();
      }

      // Body (varies with tier)
      if (Assets.hasImg('lth_rocket') && body >= 3) {
        Assets.draw(ctx, 'lth_rocket', 0, 0, 50, 22);
      } else {
        // draw procedurally
        const bodyColors = ['#7a5a3a', '#8a6a4a', '#99a0aa', '#b0b6c0', '#c0c7d3', '#ffcc33'];
        ctx.fillStyle = bodyColors[body] || '#7a5a3a';
        ctx.fillRect(-20, -8, 40, 16);
        // nose
        ctx.fillStyle = '#ffcc33';
        ctx.beginPath();
        ctx.moveTo(20, -8); ctx.lineTo(30, 0); ctx.lineTo(20, 8); ctx.closePath();
        ctx.fill();
        // side stripe
        ctx.fillStyle = '#ff4455';
        ctx.fillRect(-18, -2, 34, 3);
        // goblin window
        ctx.fillStyle = '#5fd4ff';
        ctx.beginPath(); ctx.arc(4, 0, 5, 0, TAU); ctx.fill();
        ctx.fillStyle = stageDef.tint;
        ctx.beginPath(); ctx.arc(4, 0, 3, 0, TAU); ctx.fill();
      }

      // Booster flame (if flying + boosting)
      const p = this.player;
      const boosting = flying && (Input.keys[' '] || Input.keys['Space']) && p.fuel > 0;
      if (boosting) {
        const flicker = 10 + Math.sin(Date.now() * 0.025) * 5 + Math.random() * 3;
        const len = 14 + booster * 3;
        // outer plume — long orange flame
        ctx.fillStyle = '#ff5522';
        ctx.beginPath();
        ctx.moveTo(-20, -10);
        ctx.lineTo(-20 - len - flicker, 0);
        ctx.lineTo(-20, 10);
        ctx.closePath(); ctx.fill();
        // mid orange
        ctx.fillStyle = '#ff8833';
        ctx.beginPath();
        ctx.moveTo(-20, -7);
        ctx.lineTo(-20 - (len - 4) - flicker * 0.7, 0);
        ctx.lineTo(-20, 7);
        ctx.closePath(); ctx.fill();
        // bright yellow core
        ctx.fillStyle = '#ffdd55';
        ctx.beginPath();
        ctx.moveTo(-20, -4);
        ctx.lineTo(-20 - (len - 8) - flicker * 0.4, 0);
        ctx.lineTo(-20, 4);
        ctx.closePath(); ctx.fill();
        // white-hot tip
        ctx.fillStyle = '#ffffee';
        ctx.beginPath();
        ctx.moveTo(-20, -2);
        ctx.lineTo(-26, 0);
        ctx.lineTo(-20, 2);
        ctx.closePath(); ctx.fill();
        // heat glow
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = '#ff6622';
        ctx.beginPath(); ctx.arc(-24, 0, 10 + booster * 1.5, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
      }

      ctx.restore();
    }

    _drawPickup(ctx, pk) {
      const sx = pk.x - this.cam.x + W / 2;
      const sy = this.cam.y - pk.y + H * 0.4;
      if (sx < -80 || sx > W + 80 || sy < -80 || sy > H + 80) return;
      if (pk.id === 'coin' || pk.id === 'coin_stack') {
        const bob = Math.sin(pk.t * 5) * 3;
        const w = pk.id === 'coin_stack' ? 20 : 10;
        ctx.fillStyle = '#7a5a15';
        ctx.fillRect(sx - w / 2, sy - 5 + bob, w, 10);
        ctx.fillStyle = '#ffcc33';
        ctx.fillRect(sx - w / 2, sy - 6 + bob, w, 10);
        ctx.fillStyle = '#fff4a8';
        ctx.fillRect(sx - w / 2, sy - 6 + bob, w, 2);
      } else if (pk.id === 'fuel') {
        ctx.fillStyle = '#2a2a40';
        ctx.fillRect(sx - 8, sy - 12, 16, 20);
        ctx.fillStyle = '#5fd4ff';
        ctx.fillRect(sx - 6, sy - 10, 12, 16);
        Draw.text(ctx, 'F', sx, sy + 3, { size: 10, color: '#001', weight: '800', align: 'center' });
      } else if (pk.id === 'mult') {
        const s = 1 + Math.sin(pk.t * 8) * 0.15;
        ctx.save(); ctx.translate(sx, sy); ctx.scale(s, s);
        ctx.fillStyle = '#ff7ad8';
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const a = -Math.PI / 2 + i * Math.PI * 2 / 5;
          const r = i % 2 === 0 ? 12 : 6;
          ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath(); ctx.fill();
        Draw.text(ctx, 'x', 0, 4, { size: 10, color: '#fff', align: 'center', weight: '800' });
        ctx.restore();
      } else if (pk.id === 'balloon') {
        ctx.fillStyle = pk.def.color;
        ctx.beginPath(); ctx.arc(sx, sy - 8, 16, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ff9ea8';
        ctx.beginPath(); ctx.arc(sx - 4, sy - 12, 5, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#888'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(sx, sy + 6); ctx.lineTo(sx, sy + 18); ctx.stroke();
      } else if (pk.id === 'cloud') {
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(sx, sy, 32, 0, TAU);
        ctx.arc(sx + 22, sy + 4, 26, 0, TAU);
        ctx.arc(sx - 22, sy + 5, 22, 0, TAU);
        ctx.arc(sx + 8, sy - 12, 22, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
      } else if (pk.id === 'trampoline') {
        ctx.fillStyle = '#cc4455';
        ctx.fillRect(sx - 40, sy - 8, 80, 10);
        ctx.fillStyle = '#ffcc33';
        ctx.fillRect(sx - 40, sy - 10, 80, 3);
        ctx.fillStyle = '#221';
        ctx.fillRect(sx - 40, sy + 2, 6, 18);
        ctx.fillRect(sx + 34, sy + 2, 6, 18);
      } else if (pk.id === 'ring') {
        // floating ring
        const bob = Math.sin(pk.t * 3) * 4;
        ctx.strokeStyle = '#ffdd77'; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.arc(sx, sy + bob, 42, 0, TAU); ctx.stroke();
        ctx.strokeStyle = '#fff4a8'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(sx, sy + bob, 42, 0, TAU); ctx.stroke();
      }
    }

    _drawHazard(ctx, h) {
      const sx = h.x - this.cam.x + W / 2;
      const sy = this.cam.y - h.y + H * 0.4;
      if (sx < -120 || sx > W + 120 || sy < -120 || sy > H + 120) return;
      if (h.id === 'bird') {
        // flappy wings
        const wing = Math.sin(h.t * 18) * 8;
        ctx.fillStyle = '#8d6e3a';
        ctx.beginPath(); ctx.arc(sx, sy, 8, 0, TAU); ctx.fill();
        ctx.fillStyle = '#6a4e24';
        ctx.beginPath();
        ctx.ellipse(sx - 10, sy - wing, 12, 5, -0.3, 0, TAU);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(sx + 10, sy + wing, 12, 5, 0.3, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#ffc33c';
        ctx.beginPath(); ctx.moveTo(sx + 6, sy); ctx.lineTo(sx + 14, sy + 2); ctx.lineTo(sx + 6, sy + 3); ctx.closePath(); ctx.fill();
      } else if (h.id === 'stormcloud') {
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = '#444a55';
        ctx.beginPath();
        ctx.arc(sx, sy, 48, 0, TAU);
        ctx.arc(sx + 34, sy + 5, 38, 0, TAU);
        ctx.arc(sx - 34, sy + 5, 34, 0, TAU);
        ctx.arc(sx + 10, sy - 18, 30, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
        // lightning
        if (Math.sin(h.t * 5) > 0.7) {
          ctx.strokeStyle = '#ffff77'; ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(sx, sy + 30); ctx.lineTo(sx + 6, sy + 45); ctx.lineTo(sx - 4, sy + 55);
          ctx.stroke();
        }
      } else if (h.id === 'ufo') {
        // saucer
        ctx.fillStyle = '#3a3a55';
        ctx.beginPath(); ctx.ellipse(sx, sy + 2, 22, 7, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#9999ee';
        ctx.beginPath(); ctx.ellipse(sx, sy, 18, 6, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#5fd4ff';
        ctx.beginPath(); ctx.ellipse(sx, sy - 4, 10, 5, 0, 0, TAU); ctx.fill();
        // beam
        ctx.fillStyle = 'rgba(140,220,255,0.2)';
        ctx.beginPath();
        ctx.moveTo(sx - 12, sy + 5);
        ctx.lineTo(sx - 22, sy + 60);
        ctx.lineTo(sx + 22, sy + 60);
        ctx.lineTo(sx + 12, sy + 5);
        ctx.closePath(); ctx.fill();
      } else if (h.id === 'asteroid') {
        ctx.fillStyle = '#6a5a4a';
        ctx.beginPath();
        ctx.moveTo(sx - 24, sy - 8);
        ctx.lineTo(sx - 10, sy - 22);
        ctx.lineTo(sx + 14, sy - 18);
        ctx.lineTo(sx + 26, sy - 2);
        ctx.lineTo(sx + 20, sy + 20);
        ctx.lineTo(sx - 4, sy + 22);
        ctx.lineTo(sx - 22, sy + 12);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#3a2e24';
        ctx.beginPath(); ctx.arc(sx - 6, sy - 4, 4, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(sx + 8, sy + 8, 3, 0, TAU); ctx.fill();
      } else if (h.id === 'enemy') {
        // red fighter
        ctx.fillStyle = '#ff4455';
        ctx.beginPath();
        ctx.moveTo(sx - 18, sy - 10);
        ctx.lineTo(sx + 14, sy);
        ctx.lineTo(sx - 18, sy + 10);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#661522';
        ctx.fillRect(sx - 18, sy - 2, 32, 4);
        ctx.fillStyle = '#ffeeaa';
        ctx.beginPath(); ctx.arc(sx - 2, sy, 3, 0, TAU); ctx.fill();
      }
    }

    _drawFlightHud(ctx) {
      // Top bar with key stats
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, 0, W, 46);
      ctx.fillStyle = 'rgba(255,204,51,0.6)';
      ctx.fillRect(0, 44, W, 2);

      const fuelPct = Math.max(0, this.player.fuel / (this.stats.fuel || 1));
      Draw.text(ctx, 'FUEL', 14, 24, { size: 11, color: '#9be' });
      ctx.fillStyle = '#220'; ctx.fillRect(50, 15, 240, 14);
      ctx.fillStyle = fuelPct > 0.2 ? '#5fd4ff' : '#ffaa55';
      ctx.fillRect(50, 15, 240 * fuelPct, 14);

      Draw.text(ctx, 'DIST ' + Math.round(this.run.distance) + 'm', 320, 28, { size: 14, color: '#ffcc33', weight: '700' });
      Draw.text(ctx, 'ALT '  + Math.round(this.run.altitude) + 'm', 460, 28, { size: 14, color: '#9fd8ff', weight: '700' });
      Draw.text(ctx, 'COIN \u25CF ' + this.run.coins, 580, 28, { size: 14, color: '#ffee99', weight: '700' });
      if (this.run.mult > 1) {
        Draw.text(ctx, 'x' + this.run.mult.toFixed(1), 720, 28, { size: 15, color: '#ff7ad8', weight: '800' });
      }
      Draw.text(ctx, 'SPD ' + Math.round(Math.hypot(this.player.vx, this.player.vy)), 780, 28, { size: 14, color: '#aee', weight: '700' });
      Draw.text(ctx, 'T ' + this.run.time.toFixed(1) + 's', 900, 28, { size: 12, color: '#888', weight: '700', align: 'right' });

      // Alt-o-meter (vertical on right side)
      const am = { x: W - 26, y: 60, h: H - 110 };
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(am.x, am.y, 8, am.h);
      const maxShow = 2500;
      const ap = Math.min(1, this.run.altitude / maxShow);
      ctx.fillStyle = '#ffcc33';
      ctx.fillRect(am.x, am.y + am.h - am.h * ap, 8, 3);
      // band markers
      for (const b of LTH.SKY_BANDS) {
        if (b.alt === 0) continue;
        const tp = Math.min(1, b.alt / maxShow);
        const ty = am.y + am.h - am.h * tp;
        ctx.strokeStyle = '#888'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(am.x - 3, ty); ctx.lineTo(am.x + 11, ty); ctx.stroke();
      }

      // Modifier tag
      Draw.text(ctx, this.modifier.name, 14, H - 10, { size: 11, color: '#ffcc33' });
      // Controls hint
      Draw.text(ctx, 'A/D or \u2190/\u2192 pitch \u00b7 SPACE boost \u00b7 G glider \u00b7 dive for speed, pull up to soar',
        W - 20, H - 10, { size: 10, color: '#aaa', align: 'right' });
    }

    _drawReport(ctx) {
      // Darkened scene
      this._drawFlight(ctx);
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0, 0, W, H);
      const bx = W / 2 - 300, by = 60, bw = 600, bh = H - 120;
      ctx.fillStyle = '#0d1018'; ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = '#ffcc33'; ctx.lineWidth = 3;
      ctx.strokeRect(bx + 0.5, by + 0.5, bw, bh);
      Draw.text(ctx, 'RUN REPORT', W / 2, by + 42, { size: 26, color: '#ffcc33', align: 'center', weight: '800' });

      const lines = [
        ['Distance',     Math.round(this.run.distance) + ' m'],
        ['Max Altitude', Math.round(this.run.maxAltitude) + ' m'],
        ['Airtime',      this.run.time.toFixed(1) + ' s'],
        ['Coins Found',  this.run.coins],
        ['Stunts',       this.run.stunts],
        ['Pickups',      this.run.pickups],
        ['Hazards Hit',  this.run.hazardsHit]
      ];
      let y = by + 80;
      for (const [lab, val] of lines) {
        Draw.text(ctx, lab, bx + 40, y, { size: 14, color: '#bcd', weight: '600' });
        Draw.text(ctx, String(val), bx + bw - 40, y, { size: 14, color: '#fff', weight: '700', align: 'right' });
        y += 22;
      }

      // Coin payout line
      y += 14;
      ctx.strokeStyle = '#335'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(bx + 40, y); ctx.lineTo(bx + bw - 40, y); ctx.stroke();
      y += 24;
      const mod = this.modifier;
      Draw.text(ctx, 'Weather mult', bx + 40, y, { size: 13, color: '#ffcc33' });
      Draw.text(ctx, 'x' + (mod.coinMult || 1).toFixed(2), bx + bw - 40, y, { size: 13, color: '#ffcc33', align: 'right' });
      y += 20;
      Draw.text(ctx, 'Perk bonus',   bx + 40, y, { size: 13, color: '#ffcc33' });
      Draw.text(ctx, 'x' + (1 + (this.stats.coinBonus || 0)).toFixed(2), bx + bw - 40, y, { size: 13, color: '#ffcc33', align: 'right' });
      y += 26;
      Draw.text(ctx, 'COINS EARNED', bx + 40, y, { size: 16, color: '#ffcc33', weight: '800' });
      Draw.text(ctx, '\u25CF ' + (this.run.earned | 0), bx + bw - 40, y, { size: 18, color: '#ffcc33', weight: '800', align: 'right' });

      // Goals newly cleared
      if (this.run.completedGoals && this.run.completedGoals.length) {
        y += 28;
        Draw.text(ctx, 'Goals cleared:', bx + 40, y, { size: 13, color: '#6ecf6e', weight: '700' });
        y += 18;
        for (const g of this.run.completedGoals) {
          Draw.text(ctx, '\u2605 ' + g.desc + '  (+' + g.reward + ')', bx + 60, y, { size: 12, color: '#6ecf6e' });
          y += 16;
        }
      }

      // Bottom prompts
      Draw.text(ctx, '[Click / Enter / R] Launch Again    [S] Workshop', W / 2, by + bh - 20, { size: 13, color: '#aaa', align: 'center' });
    }

    _drawShop(ctx) {
      // Background (faded workshop)
      this.cam.x = 0; this.cam.y = 0;
      LTH.World.render(ctx, this.world, this.cam, W, H, 0.016);
      LTH.World.renderRamp(ctx, this.cam, W, H, this.save.tiers.ramp | 0);

      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(0, 0, W, H);

      const bx = 40, by = 40, bw = W - 80, bh = H - 80;
      ctx.fillStyle = '#0c0f18'; ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = '#ffcc33'; ctx.lineWidth = 3;
      ctx.strokeRect(bx + 0.5, by + 0.5, bw, bh);

      Draw.text(ctx, 'WORKSHOP', W / 2, by + 40, { size: 28, color: '#ffcc33', align: 'center', weight: '800' });
      Draw.text(ctx, '\u25CF ' + this.save.coins + ' coins', W / 2, by + 66, { size: 15, color: '#ffee99', align: 'center' });

      // Categories list left column
      const keys = Object.keys(LTH.UPGRADES);
      const listX = bx + 30, listY = by + 110, rowH = 54;
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const u = LTH.UPGRADES[key];
        const selected = this.shopSel === key;
        const tier = this.save.tiers[key] | 0;
        const y = listY + i * rowH;
        ctx.fillStyle = selected ? '#1d2538' : '#151920';
        ctx.fillRect(listX, y, 300, rowH - 6);
        ctx.strokeStyle = selected ? '#ffcc33' : '#333'; ctx.lineWidth = selected ? 2 : 1;
        ctx.strokeRect(listX + 0.5, y + 0.5, 300, rowH - 6);
        Draw.text(ctx, u.name, listX + 16, y + 20, { size: 15, color: '#ffcc33', weight: '700' });
        Draw.text(ctx, u.tiers[tier].label, listX + 16, y + 38, { size: 12, color: '#b8cdd8' });
        // tier dots
        for (let t = 0; t < u.tiers.length; t++) {
          ctx.fillStyle = t <= tier ? '#ffcc33' : '#333';
          ctx.fillRect(listX + 220 + t * 12, y + 32, 8, 8);
        }
      }

      // Detail panel right
      const dx = bx + 360, dy = by + 110;
      const u = LTH.UPGRADES[this.shopSel];
      const curTier = this.save.tiers[this.shopSel] | 0;
      const curDef = u.tiers[curTier];
      const nextDef = u.tiers[curTier + 1];
      ctx.fillStyle = '#151920';
      ctx.fillRect(dx, dy, bw - 390, bh - 140);
      ctx.strokeStyle = '#ffcc33'; ctx.lineWidth = 1;
      ctx.strokeRect(dx + 0.5, dy + 0.5, bw - 390, bh - 140);

      Draw.text(ctx, u.name, dx + 20, dy + 34, { size: 22, color: '#ffcc33', weight: '800' });
      Draw.text(ctx, u.desc, dx + 20, dy + 60, { size: 12, color: '#b8cdd8' });

      Draw.text(ctx, 'Owned:', dx + 20, dy + 96, { size: 13, color: '#fff', weight: '700' });
      Draw.text(ctx, curDef.label, dx + 80, dy + 96, { size: 13, color: '#9bc' });

      Draw.text(ctx, 'Stats:', dx + 20, dy + 122, { size: 13, color: '#fff', weight: '700' });
      let sy = dy + 142;
      Object.keys(curDef).forEach(k => {
        if (k === 'label' || k === 'cost') return;
        Draw.text(ctx, k + ': ' + curDef[k], dx + 40, sy, { size: 12, color: '#aaa' });
        sy += 16;
      });

      if (nextDef) {
        Draw.text(ctx, 'Next:', dx + 20, sy + 16, { size: 13, color: '#fff', weight: '700' });
        Draw.text(ctx, nextDef.label + ' \u2014 \u25CF ' + nextDef.cost, dx + 80, sy + 16,
          { size: 13, color: this.save.coins >= nextDef.cost ? '#ffcc33' : '#664' });
        sy += 40;
        Object.keys(nextDef).forEach(k => {
          if (k === 'label' || k === 'cost') return;
          const delta = (curDef[k] != null && typeof curDef[k] === 'number' && typeof nextDef[k] === 'number')
            ? (nextDef[k] - curDef[k] > 0 ? ' (+' + (nextDef[k] - curDef[k]).toFixed(2) + ')' :
              ' (' + (nextDef[k] - curDef[k]).toFixed(2) + ')') : '';
          Draw.text(ctx, k + ': ' + nextDef[k] + delta, dx + 40, sy, { size: 12, color: '#66cc77' });
          sy += 16;
        });
      } else {
        Draw.text(ctx, 'MAXED', dx + 20, sy + 40, { size: 16, color: '#ffcc33', weight: '800' });
      }

      // Buy button
      if (nextDef) {
        const btnX = dx + 20, btnY = by + bh - 80, btnW = bw - 430;
        const canAfford = this.save.coins >= nextDef.cost;
        ctx.fillStyle = canAfford ? (this.shopFlash > 0 ? '#ffffaa' : '#ffcc33') : '#333';
        ctx.fillRect(btnX, btnY, btnW, 40);
        Draw.text(ctx, canAfford ? 'BUY (\u25CF ' + nextDef.cost + ')' : 'NOT ENOUGH COINS',
          btnX + btnW / 2, btnY + 26, {
            size: 14, color: canAfford ? '#0a0a0a' : '#888', weight: '800', align: 'center'
          });
      }

      Draw.text(ctx, '[ARROWS] Select  [SPACE/ENTER/CLICK] Buy  [Q/ESC] Close',
        W / 2, by + bh - 18, { size: 11, color: '#aaa', align: 'center' });

      // Goals panel at bottom-left
      const gx = listX, gy = by + bh - 80 - keys.length * 0; // static
      const goalsX = listX, goalsY = by + bh - 160;
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(goalsX, goalsY, 300, 130);
      ctx.strokeStyle = '#ffcc33'; ctx.lineWidth = 1;
      ctx.strokeRect(goalsX + 0.5, goalsY + 0.5, 300, 130);
      Draw.text(ctx, 'Goals (' + this.save.goalsDone.length + '/' + LTH.GOALS.length + ')', goalsX + 12, goalsY + 20, {
        size: 13, color: '#ffcc33', weight: '700'
      });
      for (let i = 0; i < Math.min(5, LTH.GOALS.length); i++) {
        const g = LTH.GOALS[i + Math.max(0, this.save.goalsDone.length - 2)];
        const done = this.save.goalsDone.indexOf(g.id) !== -1;
        ctx.fillStyle = done ? '#6ecf6e' : '#334';
        ctx.fillRect(goalsX + 12, goalsY + 30 + i * 18, 10, 10);
        Draw.text(ctx, g.desc, goalsX + 28, goalsY + 40 + i * 18, {
          size: 11, color: done ? '#9de39d' : '#aab'
        });
      }
    }
  }

  NDP.attachGame('learntoheist', LearnToHeistGame);
})();
