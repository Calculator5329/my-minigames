/* Bulwark — roguelike tower defense.

   Architecture
   ------------
   One class (BulwarkGame) + a scene state machine:
     'choosing_commander' | 'map' | 'battle' | 'reward' | 'shop' | 'camp' | 'event' | 'defeat' | 'victory'

   A run is modeled as:
     { act, nodeRow, hp, maxHp, gold, relics, towers[], inventory[], map, visited }

   Persisted across runs in localStorage key 'bulwark_v1':
     { ash, unlocks: { commanders: [...], startingRelics: [...] }, lastRun: null | runState }

   Each battle owns:
     - a path (waypoints) through a grid
     - build zones (tiles you can drop towers on)
     - wave spec (list of waves, each a list of spawn entries)
     - local state: enemies[], placed[], projectiles[], gold, wave, timer, won/lost

   Towers, enemies, relics, and events are data-driven tables at top of this file.
*/
(function () {
  const NDP = window.NDP;
  const { BaseGame, Input } = NDP.Engine;

  const W = 960, H = 600;
  const TILE = 40;  // 24 x 15 grid
  const COLS = Math.floor(W / TILE);
  const ROWS = Math.floor(H / TILE);

  /* ==================== DATA TABLES ==================== */

  // Tower archetypes. tiers[i] is cumulative (base for t0, swaps for t1/t2).
  const TOWER_DEFS = {
    archer: {
      name: 'Archer', color: '#7ae0ff', cost: 40,
      desc: 'Fast, single-target. Cheap.',
      tiers: [
        { range: 140, cooldown: 0.55, dmg: 14, projSpeed: 520, pierce: 0 },
        { range: 160, cooldown: 0.45, dmg: 22, projSpeed: 560, pierce: 0, upgradeCost: 60 },
        { range: 190, cooldown: 0.35, dmg: 36, projSpeed: 620, pierce: 1, upgradeCost: 120 }
      ]
    },
    cannon: {
      name: 'Cannon', color: '#ff8c3a', cost: 65,
      desc: 'Slow AOE blast. Splash radius.',
      tiers: [
        { range: 130, cooldown: 1.2, dmg: 30, splash: 55, projSpeed: 260 },
        { range: 150, cooldown: 1.0, dmg: 48, splash: 65, projSpeed: 280, upgradeCost: 90 },
        { range: 170, cooldown: 0.8, dmg: 80, splash: 80, projSpeed: 320, upgradeCost: 160 }
      ]
    },
    frost: {
      name: 'Frost', color: '#b7e6ff', cost: 55,
      desc: 'Slows enemies, small damage.',
      tiers: [
        { range: 120, cooldown: 0.8, dmg: 6, slow: 0.35, slowDur: 1.6, projSpeed: 360 },
        { range: 140, cooldown: 0.7, dmg: 10, slow: 0.5, slowDur: 2.0, projSpeed: 400, upgradeCost: 70 },
        { range: 160, cooldown: 0.6, dmg: 16, slow: 0.65, slowDur: 2.4, projSpeed: 440, upgradeCost: 130 }
      ]
    },
    tesla: {
      name: 'Tesla', color: '#f5d542', cost: 90,
      desc: 'Chain lightning. Ignores armor.',
      tiers: [
        { range: 150, cooldown: 1.1, dmg: 20, chains: 2, chainRange: 80, armorPierce: true },
        { range: 160, cooldown: 0.95, dmg: 30, chains: 3, chainRange: 95, armorPierce: true, upgradeCost: 110 },
        { range: 180, cooldown: 0.8, dmg: 46, chains: 4, chainRange: 110, armorPierce: true, upgradeCost: 180 }
      ]
    },
    sniper: {
      name: 'Sniper', color: '#f472b6', cost: 110,
      desc: 'Long range, heavy single shot.',
      tiers: [
        { range: 360, cooldown: 1.6, dmg: 70, projSpeed: 800 },
        { range: 420, cooldown: 1.4, dmg: 110, projSpeed: 900, upgradeCost: 140 },
        { range: 500, cooldown: 1.2, dmg: 180, projSpeed: 1000, crit: 0.2, upgradeCost: 220 }
      ]
    }
  };

  // Enemies are data; per-wave spec decides which.
  const ENEMY_DEFS = {
    grunt:    { name:'Grunt',   hp:30,   speed:50,  color:'#ff4d6d', gold:4,  radius:12 },
    runner:   { name:'Runner',  hp:18,   speed:110, color:'#ffd86b', gold:5,  radius:10 },
    brute:    { name:'Brute',   hp:110,  speed:38,  color:'#8b2e3a', gold:9,  radius:16 },
    armored:  { name:'Armored', hp:70,   speed:45,  color:'#9ca3af', gold:7,  radius:14, armor:0.4 },
    shielded: { name:'Shielded',hp:45,   speed:50,  color:'#60a5fa', gold:8,  radius:13, shield:40 },
    bat:      { name:'Bat',     hp:22,   speed:85,  color:'#7c3aed', gold:4,  radius:9,  flying:true },
    swarm:    { name:'Swarm',   hp:10,   speed:90,  color:'#ef4444', gold:2,  radius:7 },
    warlock:  { name:'Warlock', hp:60,   speed:45,  color:'#a855f7', gold:10, radius:14, heals:true },
    // Elites / bosses
    juggernaut: { name:'Juggernaut', hp:900, speed:32, color:'#6d1a2a', gold:60, radius:24, armor:0.3 },
    hydra:      { name:'Hydra',      hp:1500,speed:28, color:'#14532d', gold:100, radius:28, split:'grunt', splitN:3 },
    lich:       { name:'Lich',       hp:2400,speed:24, color:'#2e1065', gold:160, radius:30, summons:'shielded', summonEvery:4 }
  };

  // Relics — passive effects. Applied via onInit or each-frame hooks.
  const RELICS = [
    { id:'gildedHandle', name:'Gilded Handle', desc:'+10 starting gold per battle.', rarity:'common' },
    { id:'longbow',      name:'Longbow',       desc:'Archers +25% range.', rarity:'common' },
    { id:'hotbarrel',    name:'Hot Barrel',    desc:'Cannons +20% fire rate.', rarity:'common' },
    { id:'gloves',       name:'Tinker Gloves', desc:'Towers cost 10% less.', rarity:'common' },
    { id:'lucky',        name:"Lucky Coin",    desc:'5% chance for bonus gold on kill.', rarity:'common' },
    { id:'stormcore',    name:'Stormcore',     desc:'Tesla chains +1.', rarity:'uncommon' },
    { id:'heavyshell',   name:'Heavy Shell',   desc:'Cannon splash +30%.', rarity:'uncommon' },
    { id:'scope',        name:'Brass Scope',   desc:'Sniper +30% damage.', rarity:'uncommon' },
    { id:'coldforge',    name:'Cold Forge',    desc:'Frost slows apply 40% longer.', rarity:'uncommon' },
    { id:'signet',       name:'Merchant Signet',desc:'Shops cost 20% less.', rarity:'uncommon' },
    { id:'champion',     name:"Champion's Crest",desc:'Elite kills give +25 gold.', rarity:'uncommon' },
    { id:'scholar',      name:'Battle Scholar',desc:'Wave clears give +5 gold.', rarity:'common' },
    { id:'focusStone',   name:'Focus Stone',   desc:'First tower placed each battle: +50% damage.', rarity:'uncommon' },
    { id:'ironbark',     name:'Ironbark',      desc:'+5 max HP at start of each act.', rarity:'uncommon' },
    { id:'bloodpact',    name:'Bloodpact',     desc:'Start battles with 2× gold; take +1 leak damage.', rarity:'rare' },
    { id:'crownbearer',  name:'Crownbearer',   desc:'After boss kills, +1 relic pick next reward.', rarity:'rare' },
    { id:'overclock',    name:'Overclock',     desc:'All towers fire rate +15%.', rarity:'rare' },
    { id:'phasecoil',    name:'Phase Coil',    desc:'Projectiles pierce +1 (stacks with tiers).', rarity:'rare' },
    { id:'pyrelens',     name:'Pyrelens',      desc:'Enemies burn for 5 dmg/s when first hit.', rarity:'rare' },
    { id:'aegis',        name:'Aegis',         desc:'Once per battle, ignore the first leak.', rarity:'rare' }
  ];

  /* ==================== PERSISTENCE ==================== */
  // Per-game wallet pattern (see docs/plans/2026-04-19-currency-migration.md):
  //   - `ash` (the meta currency) lives in `Storage.*GameWallet('bulwark')`;
  //     every spend goes through `spendGameWallet` so it can never overdraw,
  //     and shop UIs read the wallet directly.
  //   - `unlocks` and `lastRun` (run-resume snapshot) live in
  //     `Storage.setGameData('bulwark', {...})`.
  //   - `OLD_LS_KEY` is the pre-migration `localStorage` blob; `migrateLegacy`
  //     hoists it forward exactly once per device.
  const GAME_ID = 'bulwark';
  const OLD_LS_KEY = 'bulwark_v1';
  const Storage = (typeof NDP !== 'undefined' && NDP.Engine && NDP.Engine.Storage) || null;

  function migrateLegacy() {
    if (!Storage) return;
    try {
      const cur = Storage.getGameData(GAME_ID);
      if (cur && Object.keys(cur).length) return;        // already migrated
      const raw = localStorage.getItem(OLD_LS_KEY);
      if (!raw) return;
      const v = JSON.parse(raw);
      if (!v || typeof v !== 'object') return;
      const ash = (v.ash | 0);
      Storage.setGameData(GAME_ID, {
        unlocks: v.unlocks || {},
        lastRun: v.lastRun || null
      });
      if (ash > 0) Storage.setGameWallet(GAME_ID, ash);
      localStorage.removeItem(OLD_LS_KEY);
    } catch (e) {}
  }

  function loadMeta() {
    migrateLegacy();
    if (!Storage) return { ash: 0, unlocks: {}, lastRun: null };
    const data = Storage.getGameData(GAME_ID) || {};
    return {
      ash: Storage.getGameWallet(GAME_ID) | 0,
      unlocks: data.unlocks || {},
      lastRun: data.lastRun || null
    };
  }

  // saveMeta is the single sync point: in-memory `meta.ash` (the per-game
  // wallet), `unlocks`, and `lastRun` are mirrored back into Storage. Call
  // sites can keep mutating `meta.ash` directly; this writes the wallet
  // authoritatively at the end.
  function saveMeta(m) {
    if (!Storage) return;
    try {
      Storage.setGameData(GAME_ID, {
        unlocks: m.unlocks || {},
        lastRun: m.lastRun || null
      });
      Storage.setGameWallet(GAME_ID, Math.max(0, m.ash | 0));
    } catch (e) {}
  }

  /* ==================== MAIN CLASS ==================== */

  class BulwarkGame extends BaseGame {
    init() {
      this.meta = loadMeta();
      this.scene = 'title_actions';
      // Milestone counters for the per-game-wallet pattern. `coinsEarned()`
      // reads these to award *theme* coins; they intentionally never touch
      // `this.meta.ash` so the global theme economy stays decoupled from
      // run-internal currency.
      this.victoryAchieved = false;
      this.battlesCleared = 0;
      this.actsCleared = 0;
      this._endTriggered = false;
      this.sfx = this.makeSfx({
        place:  { freq: 520, type: 'triangle', dur: 0.08, slide: 200, vol: 0.35 },
        shoot:  { freq: 700, type: 'square', dur: 0.04, vol: 0.14 },
        hit:    { freq: 320, type: 'triangle', dur: 0.05, vol: 0.25 },
        kill:   { freq: 180, type: 'sawtooth', dur: 0.14, slide: -60, vol: 0.35 },
        leak:   { freq: 120, type: 'square', dur: 0.3, slide: -80, vol: 0.55 },
        wave:   { freq: 480, type: 'triangle', dur: 0.22, slide: 220, vol: 0.45 },
        reward: { freq: 880, type: 'triangle', dur: 0.2, slide: 440, vol: 0.5 },
        deny:   { freq: 180, type: 'square', dur: 0.08, slide: -60, vol: 0.3 },
        upgrade:{ freq: 660, type: 'triangle', dur: 0.12, slide: 330, vol: 0.45 },
        boss:   { freq: 80, type: 'noise', dur: 0.5, vol: 0.6, filter: 'lowpass' }
      });
      // Start a fresh run on begin; title_actions lets user either New Run or Resume
      this.run = this.newRun();
      this.battle = null;
      this.reward = null;
      this.shopState = null;
      this.campState = null;
      this.eventState = null;
      this.msg = null;
      this.drag = null;
      this.hoverTower = null;
      this.selectedTower = null;
      this.setHud(this._hud());
    }

    newRun() {
      const map = this.buildMap();
      return {
        act: 1,
        hp: 40,
        maxHp: 40,
        gold: 0,
        totalEarned: 0,
        relics: ['gildedHandle'],  // starting relic (configurable for commanders later)
        ownedTowers: ['archer', 'cannon'],  // unlocked tower types (can grow via rewards)
        map,
        curNode: map.startNode,
        visited: { [map.startNode.id]: true },
        defeatsBossAct: {},
        elitesDefeated: 0,
        battlesDefeated: 0
      };
    }

    /* ==================== MAP GENERATION ==================== */
    buildMap() {
      // 3 acts; each act has 8 rows × up to 3 columns; final row is a boss.
      // Nodes per act: start (1) → 7 rows of 2-3 random types → boss (1)
      const acts = [];
      let idc = 0;
      const nextId = () => 'n' + (idc++);
      for (let act = 1; act <= 3; act++) {
        const rows = [];
        const rowCount = 7;
        for (let r = 0; r < rowCount; r++) {
          const nPerRow = 2 + Math.floor(Math.random() * 2);
          const row = [];
          for (let c = 0; c < nPerRow; c++) {
            const type = this.rollNodeType(r, act);
            row.push({ id: nextId(), type, row: r, col: c, act, links: [] });
          }
          rows.push(row);
        }
        const boss = [{ id: nextId(), type: 'boss', row: rowCount, col: 0, act, links: [] }];
        rows.push(boss);
        const start = { id: nextId(), type: 'start', row: -1, col: 0, act, links: [] };
        // Connect start to all row 0
        start.links = rows[0].map(n => n.id);
        // Random forward connections
        for (let r = 0; r < rows.length - 1; r++) {
          const cur = rows[r], nxt = rows[r+1];
          for (const node of cur) {
            // each node connects to 1–2 nodes in next row
            const c = 1 + Math.floor(Math.random() * Math.min(2, nxt.length));
            const choices = nxt.slice().sort(()=>Math.random()-0.5).slice(0, c);
            node.links = choices.map(n => n.id);
          }
          // ensure every next-row node has at least one incoming
          for (const n of nxt) {
            const hasIn = cur.some(p => p.links.includes(n.id));
            if (!hasIn) {
              cur[Math.floor(Math.random()*cur.length)].links.push(n.id);
            }
          }
        }
        acts.push({ start, rows, boss: boss[0] });
      }
      const startNode = acts[0].start;
      const all = {};
      for (const a of acts) {
        all[a.start.id] = a.start;
        for (const row of a.rows) for (const n of row) all[n.id] = n;
      }
      return { acts, startNode, nodes: all };
    }

    rollNodeType(row, act) {
      // Weighted distribution by row depth
      const weights = {
        battle: 60 - Math.min(30, row * 3),
        elite: row >= 3 ? 15 + row * 2 : 0,
        shop: 12,
        camp: 14,
        event: 14
      };
      if (act === 1 && row < 2) { weights.elite = 0; }
      let total = 0;
      for (const k in weights) total += weights[k];
      let roll = Math.random() * total;
      for (const k in weights) {
        roll -= weights[k];
        if (roll <= 0) return k;
      }
      return 'battle';
    }

    /* ==================== HUD ==================== */
    _hud() {
      const r = this.run;
      const inBattle = this.scene === 'battle' && this.battle;
      const waveInfo = inBattle ? ` · Wave <b>${this.battle.wave}/${this.battle.waves.length}</b>` : '';
      const battleGold = inBattle ? ` · Gold <b>${this.battle.gold}</b>` : '';
      return `<span>Act <b>${r.act}/3</b></span><span>HP <b>${r.hp}/${r.maxHp}</b></span><span>Ash <b>${this.meta.ash||0}</b></span>${waveInfo}${battleGold}`;
    }

    /* ==================== UPDATE DISPATCH ==================== */
    update(dt) {
      this._flushClicks();
      switch (this.scene) {
        case 'title_actions': this.updateTitle(dt); break;
        case 'map': this.updateMap(dt); break;
        case 'battle': this.updateBattle(dt); break;
        case 'reward': this.updateReward(dt); break;
        case 'shop': this.updateShop(dt); break;
        case 'camp': this.updateCamp(dt); break;
        case 'event': this.updateEvent(dt); break;
        case 'defeat':
        case 'victory': this.updateEndScene(dt); break;
      }
      if (this.msg) {
        this.msg.age += dt;
        if (this.msg.age > this.msg.life) this.msg = null;
      }
      this.setHud(this._hud());
    }

    _flushClicks() {
      this.click = null;
      if (Input.mouse.justPressed) {
        this.click = { x: Input.mouse.x, y: Input.mouse.y };
      }
      this.release = null;
      if (Input.mouse.justReleased) {
        this.release = { x: Input.mouse.x, y: Input.mouse.y };
      }
    }

    /* ==================== TITLE / RESUME ==================== */
    updateTitle(dt) {
      if (!this.click) return;
      const cx = W/2, cy = H/2;
      const btnNew = { x: cx - 140, y: cy + 30, w: 280, h: 46, label: 'New Run' };
      const btnResume = { x: cx - 140, y: cy + 90, w: 280, h: 46,
        label: this.meta.lastRun ? 'Resume Last Run' : null };
      if (ptIn(this.click, btnNew)) {
        this.run = this.newRun();
        this.meta.lastRun = this.run; saveMeta(this.meta);
        this.scene = 'map';
        this.victoryAchieved = false;
        this.battlesCleared = 0;
        this.actsCleared = 0;
        this._endTriggered = false;
      } else if (btnResume.label && ptIn(this.click, btnResume) && this.meta.lastRun) {
        this.run = this.meta.lastRun;
        this.scene = 'map';
        this.victoryAchieved = false;
        this.battlesCleared = 0;
        this.actsCleared = 0;
        this._endTriggered = false;
      }
    }

    /* ==================== MAP ==================== */
    updateMap(dt) {
      if (!this.click) return;
      // click on a linked, unvisited node
      const reachable = this.reachableNodes();
      for (const n of reachable) {
        const p = this.nodeScreenPos(n);
        if (Math.hypot(this.click.x - p.x, this.click.y - p.y) < 22) {
          this.enterNode(n);
          return;
        }
      }
    }

    reachableNodes() {
      const cur = this.run.curNode;
      const linkIds = cur.links || [];
      return linkIds.map(id => this.run.map.nodes[id]).filter(Boolean);
    }

    nodeScreenPos(n) {
      const act = n.act;
      const actIx = act - 1;
      const x = 100 + actIx * ((W - 200) / 3) + n.col * 80 - 40;
      const y = 80 + (n.row < 0 ? 0 : (n.row + 1) * 58);
      return { x: Math.max(60, Math.min(W - 60, x)), y };
    }

    enterNode(n) {
      this.run.curNode = n;
      this.run.visited[n.id] = true;
      saveMeta(this.meta);
      if (n.type === 'battle') this.startBattle(false, false);
      else if (n.type === 'elite') this.startBattle(true, false);
      else if (n.type === 'boss')  this.startBattle(false, true);
      else if (n.type === 'shop')  this.enterShop();
      else if (n.type === 'camp')  this.enterCamp();
      else if (n.type === 'event') this.enterEvent();
      else this.scene = 'map';
    }

    /* ==================== BATTLE SETUP ==================== */
    startBattle(isElite, isBoss) {
      const B = {};
      B.isElite = isElite;
      B.isBoss = isBoss;
      B.path = this.generatePath(this.run.act, isBoss);
      B.buildZones = this.generateBuildZones(B.path);
      B.waves = this.generateWaves(this.run.act, isElite, isBoss);
      B.wave = 0;
      B.enemies = [];
      B.placed = [];
      B.projectiles = [];
      B.floaters = [];
      B.gold = this.startingGold(isBoss, isElite);
      B.prep = true;
      B.spawnTimer = 0;
      B.waveSpawnIx = 0;
      B.won = false;
      B.lost = false;
      B.aegisUsed = false;
      B.firstTowerPlaced = false;
      B.message = null;
      B.messageT = 0;
      this.battle = B;
      this.drag = null;
      this.selectedTower = null;
      this.scene = 'battle';
      this.flash('#7ae0ff', 0.15);
    }

    startingGold(isBoss, isElite) {
      let g = 90 + (this.run.act - 1) * 30;
      if (isElite) g += 20;
      if (isBoss) g += 40;
      if (this.hasRelic('gildedHandle')) g += 10;
      if (this.hasRelic('bloodpact')) g *= 2;
      return Math.floor(g);
    }

    generatePath(act, isBoss) {
      // Path from left edge to right edge through the middle.
      // Use a simple zig-zag with random twists. Restrict to the playable rect.
      const yBand = H - 80;  // playable zone top at ~80
      const minY = 100, maxY = H - 60;
      const pts = [];
      pts.push({ x: 0, y: 200 + Math.random() * 200 });
      const segs = isBoss ? 6 : 4 + Math.floor(Math.random() * 3);
      for (let i = 1; i < segs; i++) {
        const x = (i / segs) * W;
        const y = Math.max(minY, Math.min(maxY, pts[i-1].y + (Math.random() - 0.5) * 240));
        pts.push({ x, y });
      }
      pts.push({ x: W, y: pts[pts.length-1].y });
      // Snap to tile centers (but keep endpoints on edges).
      const snapped = pts.map((p, i) => {
        if (i === 0 || i === pts.length - 1) return p;
        const cx = Math.round(p.x / TILE) * TILE + TILE / 2;
        const cy = Math.round(p.y / TILE) * TILE + TILE / 2;
        return { x: cx, y: cy };
      });
      return snapped;
    }

    generateBuildZones(path) {
      // Tiles not on the path and not adjacent too closely, within play area.
      const onPath = new Set();
      for (let i = 0; i < path.length - 1; i++) {
        const a = path[i], b = path[i+1];
        const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 8);
        for (let s = 0; s <= steps; s++) {
          const u = s / steps;
          const x = a.x + (b.x - a.x) * u;
          const y = a.y + (b.y - a.y) * u;
          const col = Math.floor(x / TILE);
          const row = Math.floor(y / TILE);
          for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
            onPath.add((row+dr) + ',' + (col+dc));
          }
        }
      }
      const zones = [];
      for (let r = 2; r < ROWS - 1; r++) {
        for (let c = 0; c < COLS; c++) {
          const key = r + ',' + c;
          if (!onPath.has(key)) {
            zones.push({ r, c, x: c * TILE, y: r * TILE });
          }
        }
      }
      return zones;
    }

    generateWaves(act, isElite, isBoss) {
      const waves = [];
      const count = isBoss ? 4 : (isElite ? 3 : 2 + Math.floor(Math.random() * 2));
      for (let w = 0; w < count; w++) {
        const spec = [];
        const base = Math.floor(8 + w * 3 + act * 4);
        const hpMult = 1 + w * 0.25 + (act - 1) * 0.4 + (isElite ? 0.4 : 0) + (isBoss ? 0.6 : 0);
        // Regular enemies
        for (let i = 0; i < base; i++) {
          spec.push({ type: 'grunt', delay: 0.5 + Math.random() * 0.2, hpMult });
        }
        if (w >= 1) {
          const n = Math.floor(3 + act * 2);
          for (let i = 0; i < n; i++) spec.push({ type: 'runner', delay: 0.3 + Math.random()*0.2, hpMult });
        }
        if (w >= 1 && act >= 2) {
          for (let i = 0; i < 2; i++) spec.push({ type: 'armored', delay: 1.0, hpMult });
        }
        if (w >= 1 && act >= 2) {
          for (let i = 0; i < 3; i++) spec.push({ type: 'bat', delay: 0.6, hpMult });
        }
        if (w >= 2 || act >= 3) {
          for (let i = 0; i < 2; i++) spec.push({ type: 'brute', delay: 1.4, hpMult });
        }
        if (act >= 3) {
          for (let i = 0; i < 3; i++) spec.push({ type: 'shielded', delay: 0.8, hpMult });
        }
        if (isElite && w === count - 1) {
          spec.push({ type: 'juggernaut', delay: 2.0, hpMult: hpMult * 0.7 });
        }
        if (isBoss && w === count - 1) {
          if (act === 1) spec.push({ type: 'juggernaut', delay: 1.5, hpMult: 1 });
          if (act === 2) spec.push({ type: 'hydra',      delay: 1.5, hpMult: 1 });
          if (act === 3) spec.push({ type: 'lich',       delay: 1.5, hpMult: 1 });
        }
        // Shuffle so not clumped by type
        spec.sort(() => Math.random() - 0.5);
        waves.push(spec);
      }
      return waves;
    }

    /* ==================== BATTLE UPDATE ==================== */
    updateBattle(dt) {
      const B = this.battle;

      // UI buttons / interactions
      this.updateBattleUI(dt);

      if (B.prep) return;  // paused until START pressed

      // Spawn enemies for current wave
      const curSpec = B.waves[B.wave];
      if (curSpec && B.waveSpawnIx < curSpec.length) {
        B.spawnTimer -= dt;
        if (B.spawnTimer <= 0) {
          const spec = curSpec[B.waveSpawnIx++];
          const def = ENEMY_DEFS[spec.type];
          const hp = Math.round(def.hp * (spec.hpMult || 1) * (1 + (this.run.act - 1) * 0.15));
          const e = {
            type: spec.type, x: B.path[0].x, y: B.path[0].y,
            t: 0, seg: 0,
            hp, maxHp: hp,
            speed: def.speed, baseSpeed: def.speed,
            color: def.color, radius: def.radius,
            gold: def.gold, armor: def.armor || 0, shield: def.shield || 0,
            flying: !!def.flying, heals: !!def.heals,
            split: def.split, splitN: def.splitN || 0,
            summons: def.summons, summonEvery: def.summonEvery || 0, summonT: 0,
            slowFactor: 1, slowRemaining: 0,
            burnDps: 0, burnT: 0,
            alive: true
          };
          B.enemies.push(e);
          B.spawnTimer = Math.max(0.2, spec.delay || 0.5);
        }
      }

      // Move enemies along path
      for (const e of B.enemies) {
        if (!e.alive) continue;
        // Slow / burn
        if (e.slowRemaining > 0) {
          e.slowRemaining -= dt;
          e.speed = e.baseSpeed * (1 - e.slowFactor * this.slowBoost());
          if (e.slowRemaining <= 0) { e.slowFactor = 0; e.speed = e.baseSpeed; }
        }
        if (e.burnT > 0) {
          e.hp -= e.burnDps * dt;
          e.burnT -= dt;
          if (e.hp <= 0) { this.killEnemy(e); continue; }
        }
        // Heal aura (warlock)
        if (e.heals) {
          for (const o of B.enemies) {
            if (!o.alive || o === e) continue;
            if (Math.hypot(o.x - e.x, o.y - e.y) < 90) o.hp = Math.min(o.maxHp, o.hp + 8 * dt);
          }
        }
        // Summon (lich)
        if (e.summons) {
          e.summonT -= dt;
          if (e.summonT <= 0) {
            e.summonT = e.summonEvery;
            const def = ENEMY_DEFS[e.summons];
            const sPos = { x: e.x - 18, y: e.y };
            const s = {
              type: e.summons, x: sPos.x, y: sPos.y,
              t: e.t, seg: e.seg,
              hp: def.hp, maxHp: def.hp,
              speed: def.speed, baseSpeed: def.speed,
              color: def.color, radius: def.radius, gold: def.gold,
              armor: def.armor||0, shield: def.shield||0,
              flying:!!def.flying, alive: true, slowFactor:1, slowRemaining:0, burnDps:0, burnT:0
            };
            B.enemies.push(s);
          }
        }

        const a = B.path[e.seg], b = B.path[e.seg + 1];
        if (!b) {
          this.enemyLeak(e);
          continue;
        }
        const dx = b.x - a.x, dy = b.y - a.y;
        const len = Math.hypot(dx, dy);
        e.t += (e.speed * dt) / len;
        if (e.t >= 1) {
          e.t = 0; e.seg += 1;
          if (e.seg >= B.path.length - 1) { this.enemyLeak(e); continue; }
        }
        e.x = a.x + (b.x - a.x) * e.t;
        e.y = a.y + (b.y - a.y) * e.t;
      }

      // Tower AI
      for (const tw of B.placed) {
        tw.cd -= dt;
        const spec = this.towerSpec(tw);
        if (tw.cd > 0) continue;
        // Find target (enemy in range, furthest along path)
        let best = null, bestProg = -Infinity;
        for (const e of B.enemies) {
          if (!e.alive) continue;
          const d = Math.hypot(e.x - tw.x, e.y - tw.y);
          if (d > spec.range) continue;
          const prog = e.seg + e.t;
          if (prog > bestProg) { bestProg = prog; best = e; }
        }
        if (!best) continue;
        this.towerFire(tw, best);
        tw.cd = this.towerCooldown(tw);
      }

      // Projectiles
      for (const p of B.projectiles) {
        if (p.dead) continue;
        if (p.kind === 'chain') {
          // Already resolved on fire; decay visual
          p.life -= dt;
          if (p.life <= 0) p.dead = true;
          continue;
        }
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.life -= dt;
        if (p.life <= 0) { p.dead = true; continue; }
        // Hit target
        let hit = null;
        if (p.target && p.target.alive) {
          const d = Math.hypot(p.target.x - p.x, p.target.y - p.y);
          if (d < 14) hit = p.target;
        }
        if (!hit) {
          // Proximity check
          for (const e of B.enemies) {
            if (!e.alive) continue;
            if (Math.hypot(e.x - p.x, e.y - p.y) < e.radius + 4) { hit = e; break; }
          }
        }
        if (hit) this.resolveHit(p, hit);
      }
      B.projectiles = B.projectiles.filter(p => !p.dead);

      // Floaters
      for (const f of B.floaters) {
        f.age += dt; f.y += f.vy * dt;
      }
      B.floaters = B.floaters.filter(f => f.age < f.life);

      // End wave
      if (B.wave < B.waves.length && B.waveSpawnIx >= (B.waves[B.wave]||[]).length) {
        const alive = B.enemies.some(e => e.alive);
        if (!alive) {
          B.wave += 1;
          B.waveSpawnIx = 0;
          B.spawnTimer = 2.0;  // brief breather
          this.sfx.play('wave');
          if (this.hasRelic('scholar')) B.gold += 5;
          if (B.wave >= B.waves.length) {
            // Final wave; wait for next step to detect all cleared
          } else {
            this.battleMsg('Wave ' + (B.wave + 1) + ' / ' + B.waves.length);
          }
        }
      }

      // Battle end
      if (B.wave >= B.waves.length && B.enemies.every(e => !e.alive) && B.waveSpawnIx === 0) {
        if (!B.won) { B.won = true; this.finishBattle(true); }
      }
      if (this.run.hp <= 0) {
        if (!B.lost) { B.lost = true; this.finishBattle(false); }
      }
    }

    updateBattleUI(dt) {
      const B = this.battle;
      // START WAVE button hotspot
      const startBtn = { x: W - 170, y: 20, w: 150, h: 40 };
      const sellBtn  = this.selectedTower ? { x: 20, y: H - 70, w: 120, h: 44 } : null;
      const upgBtn   = this.selectedTower ? { x: 150, y: H - 70, w: 180, h: 44 } : null;

      if (this.click) {
        // Prep: click START
        if (B.prep && ptIn(this.click, startBtn)) {
          B.prep = false;
          B.spawnTimer = 0.5;
          this.battleMsg('Wave 1 / ' + B.waves.length);
          this.sfx.play('wave');
          return;
        }
        // Space also starts next wave
        // Click on tray to start drag
        const trayY = H - 100;
        const trayX = 20;
        let slot = 0;
        for (const tid of this.run.ownedTowers) {
          const r = { x: trayX + slot * 110, y: trayY, w: 100, h: 80, tid };
          if (ptIn(this.click, r)) {
            const cost = this.towerPurchaseCost(tid);
            if (B.gold >= cost) {
              this.drag = { tid, x: this.click.x, y: this.click.y };
            } else {
              this.sfx.play('deny');
              this.battleMsg('Not enough gold');
            }
            return;
          }
          slot++;
        }
        // Click placed tower to select
        for (const tw of B.placed) {
          if (Math.hypot(this.click.x - tw.x, this.click.y - tw.y) < 20) {
            this.selectedTower = tw;
            return;
          }
        }
        // Click sell
        if (sellBtn && ptIn(this.click, sellBtn)) {
          this.sellTower(this.selectedTower);
          this.selectedTower = null;
          return;
        }
        if (upgBtn && ptIn(this.click, upgBtn)) {
          this.upgradeTower(this.selectedTower);
          return;
        }
        // Clicked elsewhere → deselect
        this.selectedTower = null;
      }
      if (this.drag) {
        this.drag.x = Input.mouse.x; this.drag.y = Input.mouse.y;
      }
      if (this.release && this.drag) {
        this.placeDrag();
        this.drag = null;
      }
      // Space to start wave
      if (Input.keys[' '] && B.prep) {
        B.prep = false;
        B.spawnTimer = 0.5;
        this.battleMsg('Wave 1 / ' + B.waves.length);
        this.sfx.play('wave');
        Input.keys[' '] = false;
      }
    }

    towerPurchaseCost(tid) {
      let c = TOWER_DEFS[tid].cost;
      if (this.hasRelic('gloves')) c = Math.ceil(c * 0.9);
      return c;
    }

    placeDrag() {
      const B = this.battle;
      const tid = this.drag.tid;
      const cost = this.towerPurchaseCost(tid);
      if (B.gold < cost) return;
      const col = Math.floor(this.drag.x / TILE);
      const row = Math.floor(this.drag.y / TILE);
      // Must be a build zone and not already occupied
      const inZone = B.buildZones.some(z => z.r === row && z.c === col);
      const occupied = B.placed.some(p => p.r === row && p.c === col);
      if (!inZone || occupied) { this.sfx.play('deny'); return; }
      const tw = {
        tid, r: row, c: col,
        x: col * TILE + TILE / 2, y: row * TILE + TILE / 2,
        tier: 0, cd: 0, kills: 0, totalInvested: cost,
        firstPlaced: !B.firstTowerPlaced
      };
      B.firstTowerPlaced = true;
      B.gold -= cost;
      B.placed.push(tw);
      this.sfx.play('place');
      this.flash('#ffd86b', 0.05);
    }

    sellTower(tw) {
      if (!tw) return;
      const B = this.battle;
      B.gold += Math.floor(tw.totalInvested * 0.7);
      B.placed.splice(B.placed.indexOf(tw), 1);
      this.sfx.play('place', { slide: -120 });
    }

    upgradeTower(tw) {
      if (!tw) return;
      const B = this.battle;
      const def = TOWER_DEFS[tw.tid];
      if (tw.tier >= def.tiers.length - 1) { this.sfx.play('deny'); return; }
      const next = def.tiers[tw.tier + 1];
      const cost = next.upgradeCost;
      if (B.gold < cost) { this.sfx.play('deny'); return; }
      B.gold -= cost;
      tw.tier++;
      tw.totalInvested += cost;
      this.sfx.play('upgrade');
      this.flash('#ffd86b', 0.08);
    }

    towerSpec(tw) {
      // Tier spec is full replacement (we merge t0 across tiers)
      const def = TOWER_DEFS[tw.tid];
      const base = def.tiers[0];
      const override = def.tiers[tw.tier];
      const merged = Object.assign({}, base, override);
      // Relic mods
      if (tw.tid === 'archer' && this.hasRelic('longbow')) merged.range = merged.range * 1.25;
      if (this.hasRelic('phasecoil')) merged.pierce = (merged.pierce || 0) + 1;
      return merged;
    }

    towerCooldown(tw) {
      const spec = this.towerSpec(tw);
      let cd = spec.cooldown;
      if (tw.tid === 'cannon' && this.hasRelic('hotbarrel')) cd *= 0.8;
      if (this.hasRelic('overclock')) cd *= 0.85;
      return cd;
    }

    towerFire(tw, target) {
      const B = this.battle;
      const spec = this.towerSpec(tw);
      let dmg = spec.dmg;
      if (tw.firstPlaced && this.hasRelic('focusStone')) dmg *= 1.5;
      if (tw.tid === 'sniper' && this.hasRelic('scope')) dmg *= 1.3;
      if (tw.tid === 'sniper' && spec.crit && Math.random() < spec.crit) dmg *= 2;

      if (tw.tid === 'tesla') {
        // Chain lightning: hit target + chain to nearest up to N
        const chainRange = spec.chainRange;
        const chains = spec.chains;
        let cur = target;
        let visited = new Set([cur]);
        const line = [{ x: tw.x, y: tw.y }, { x: cur.x, y: cur.y }];
        this.dealDamage(cur, dmg, tw, true);
        for (let i = 0; i < chains; i++) {
          let next = null, nd = Infinity;
          for (const e of B.enemies) {
            if (!e.alive || visited.has(e)) continue;
            const d = Math.hypot(e.x - cur.x, e.y - cur.y);
            if (d < chainRange && d < nd) { nd = d; next = e; }
          }
          if (!next) break;
          visited.add(next);
          line.push({ x: next.x, y: next.y });
          this.dealDamage(next, dmg * 0.75, tw, true);
          cur = next;
        }
        B.projectiles.push({ kind: 'chain', line, life: 0.18, dead: false });
        this.sfx.play('shoot', { freq: 900 });
      } else if (tw.tid === 'sniper') {
        // Instant-hit
        this.dealDamage(target, dmg, tw, false);
        B.projectiles.push({ kind: 'beam', ax: tw.x, ay: tw.y, bx: target.x, by: target.y, life: 0.12, dead:false });
        this.sfx.play('shoot', { freq: 300, dur: 0.1 });
      } else {
        // Standard projectile
        const dx = target.x - tw.x, dy = target.y - tw.y;
        const L = Math.hypot(dx, dy) || 1;
        B.projectiles.push({
          kind: 'proj',
          x: tw.x, y: tw.y,
          vx: dx / L * spec.projSpeed,
          vy: dy / L * spec.projSpeed,
          life: 2.0,
          target,
          dmg, pierce: spec.pierce || 0,
          splash: spec.splash || 0,
          slow: spec.slow || 0,
          slowDur: spec.slowDur || 0,
          color: TOWER_DEFS[tw.tid].color,
          source: tw,
          hits: new Set(),
          dead: false
        });
        this.sfx.play('shoot', { freq: tw.tid === 'cannon' ? 200 : 700 });
      }
    }

    resolveHit(p, hit) {
      const B = this.battle;
      this.dealDamage(hit, p.dmg, p.source, false);
      if (p.slow) {
        hit.slowFactor = Math.max(hit.slowFactor, p.slow);
        hit.slowRemaining = Math.max(hit.slowRemaining, p.slowDur);
      }
      if (p.splash > 0) {
        for (const e of B.enemies) {
          if (!e.alive || e === hit) continue;
          const d = Math.hypot(e.x - p.x, e.y - p.y);
          let splash = p.splash;
          if (this.hasRelic('heavyshell')) splash *= 1.3;
          if (d <= splash) {
            this.dealDamage(e, p.dmg * 0.6, p.source, false);
          }
        }
        B.floaters.push({ x: p.x, y: p.y, text:'', life:0.25, age:0, vy:0, kind:'explosion', color:p.color });
      }
      if (p.pierce > 0) {
        p.pierce--;
        p.hits.add(hit);
        // Find a new target in front
        let next = null, bestD = Infinity;
        for (const e of B.enemies) {
          if (!e.alive || p.hits.has(e)) continue;
          const d = Math.hypot(e.x - p.x, e.y - p.y);
          if (d < 140 && d < bestD) { bestD = d; next = e; }
        }
        if (next) {
          const dx = next.x - p.x, dy = next.y - p.y;
          const L = Math.hypot(dx, dy) || 1;
          const sp = Math.hypot(p.vx, p.vy);
          p.vx = dx / L * sp; p.vy = dy / L * sp;
          p.target = next;
          p.life = Math.max(p.life, 1.0);
          return;
        }
      }
      p.dead = true;
    }

    dealDamage(e, dmg, source, armorPierce) {
      if (!e.alive) return;
      if (e.shield > 0 && !armorPierce) {
        const absorb = Math.min(e.shield, dmg);
        e.shield -= absorb; dmg -= absorb;
      }
      if (e.armor > 0 && !armorPierce) dmg *= (1 - e.armor);
      const first = (e.hp === e.maxHp);
      e.hp -= dmg;
      if (first && this.hasRelic('pyrelens')) { e.burnDps = 5; e.burnT = 4.0; }
      this.battle.floaters.push({ x: e.x + (Math.random()-0.5)*10, y: e.y - 10, text: Math.round(dmg).toString(), life: 0.5, age: 0, vy: -36, color: '#ffd86b' });
      if (e.hp <= 0) this.killEnemy(e);
    }

    killEnemy(e) {
      const B = this.battle;
      e.alive = false;
      let gold = e.gold;
      if (this.hasRelic('lucky') && Math.random() < 0.05) gold += 5;
      if (this.hasRelic('champion') && (e.type === 'juggernaut' || e.type === 'hydra' || e.type === 'lich')) gold += 25;
      B.gold += gold;
      this.particles.burst(e.x, e.y, 14, { color: e.color, speed: 180, life: 0.5 });
      B.floaters.push({ x: e.x, y: e.y - 6, text: '+' + gold, life: 0.7, age: 0, vy: -28, color: '#ffd86b' });
      this.sfx.play('kill', { freq: 180 + Math.min(200, e.maxHp / 5) });
      // Splitting
      if (e.split) {
        for (let i = 0; i < e.splitN; i++) {
          const def = ENEMY_DEFS[e.split];
          B.enemies.push({
            type: e.split, x: e.x + (Math.random()-0.5)*20, y: e.y,
            t: e.t, seg: e.seg,
            hp: def.hp, maxHp: def.hp,
            speed: def.speed, baseSpeed: def.speed,
            color: def.color, radius: def.radius,
            gold: def.gold, armor: def.armor||0, shield: def.shield||0,
            flying: !!def.flying,
            slowFactor:1, slowRemaining:0, burnDps:0, burnT:0, alive:true
          });
        }
      }
    }

    enemyLeak(e) {
      if (!e.alive) return;
      e.alive = false;
      const B = this.battle;
      if (this.hasRelic('aegis') && !B.aegisUsed) {
        B.aegisUsed = true;
        this.battleMsg('Aegis absorbed the leak!');
        this.flash('#7ae0ff', 0.2);
        return;
      }
      let dmg = 1;
      if (this.hasRelic('bloodpact')) dmg += 1;
      if (e.type === 'juggernaut') dmg = 6;
      if (e.type === 'hydra') dmg = 8;
      if (e.type === 'lich') dmg = 12;
      if (e.type === 'brute') dmg = 2;
      this.run.hp = Math.max(0, this.run.hp - dmg);
      this.sfx.play('leak');
      this.shake(6, 0.3);
      this.flash('#ff4d4d', 0.18);
    }

    finishBattle(won) {
      const B = this.battle;
      if (won) {
        // Gold reward + HP heal small
        this.run.totalEarned += B.gold;
        this.run.battlesDefeated++;
        this.battlesCleared++;       // milestone: counts toward theme coins
        if (B.isElite) this.run.elitesDefeated++;
        this.run.curNode.cleared = true;
        // Trigger reward scene
        setTimeout(() => { this.openReward(B.isElite, B.isBoss); }, 500);
      } else {
        // Defeat; grant ash to the per-game wallet (the source of truth).
        const ash = Math.floor(5 + this.run.battlesDefeated * 2 + this.run.elitesDefeated * 5 + (this.run.act - 1) * 10);
        this.meta.ash = (this.meta.ash || 0) + ash;
        this.meta.lastRun = null;
        saveMeta(this.meta);
        this.addScore(this.run.totalEarned + ash);
        this.defeatAsh = ash;
        this.scene = 'defeat';
        // Hand off to the engine state machine so main.js can show its end
        // overlay and `coinsEarned()` (theme coins) gets called for this run.
        // NG+/persistent: ash, unlocks carry over via the wallet/data store.
        if (!this._endTriggered) {
          this._endTriggered = true;
          this.gameOver();
        }
      }
    }

    battleMsg(txt) {
      this.battle.message = txt; this.battle.messageT = 2.0;
    }

    slowBoost() {
      return this.hasRelic('coldforge') ? 1.0 : 1.0;  // slow multiplier toggle — length handled separately
    }

    /* ==================== REWARD ==================== */
    openReward(isElite, isBoss) {
      this.sfx.play('reward');
      // 3 reward options: each a choice of: relic | new tower | gold/heal
      const options = [];
      // Always one relic choice
      options.push(this.generateRelicReward(isElite, isBoss));
      // A tower unlock if any left, else upgrade-all
      const notOwned = Object.keys(TOWER_DEFS).filter(t => !this.run.ownedTowers.includes(t));
      if (notOwned.length > 0) {
        const tid = notOwned[Math.floor(Math.random()*notOwned.length)];
        options.push({ kind: 'tower', tid, label: 'Unlock ' + TOWER_DEFS[tid].name, desc: TOWER_DEFS[tid].desc });
      } else {
        options.push({ kind: 'heal', amount: 12, label: 'Healing Salve', desc: 'Restore 12 HP.' });
      }
      // Gold or heal based on context
      const goldAmt = 40 + (this.run.act - 1) * 20 + (isBoss ? 50 : isElite ? 20 : 0);
      options.push({ kind: 'gold', amount: goldAmt, label: 'Coin Purse', desc: '+' + goldAmt + ' gold (adds to next battle).' });

      this.reward = {
        options,
        extra: isBoss && this.hasRelic('crownbearer') ? 2 : 1,
        picked: 0
      };
      this.scene = 'reward';
    }

    generateRelicReward(isElite, isBoss) {
      const pool = RELICS.filter(r => !this.run.relics.includes(r.id));
      // Weighted by rarity
      const weights = { common: 60, uncommon: 30, rare: 10 };
      const picks = pool.slice();
      picks.sort((a,b) => (weights[b.rarity] - weights[a.rarity]) * (Math.random() - 0.5));
      const relic = picks[0] || pool[0] || RELICS[0];
      return { kind: 'relic', relicId: relic.id, label: 'Relic: ' + relic.name, desc: relic.desc, rarity: relic.rarity };
    }

    updateReward(dt) {
      if (!this.click) return;
      const opts = this.reward.options;
      for (let i = 0; i < opts.length; i++) {
        const r = { x: 150 + i * 220, y: H/2 - 90, w: 180, h: 200 };
        if (ptIn(this.click, r)) {
          this.applyReward(opts[i]);
          this.reward.picked++;
          if (this.reward.picked >= this.reward.extra) {
            this.reward = null;
            this.returnToMapOrNextAct();
          } else {
            opts.splice(i, 1);
          }
          return;
        }
      }
      const skip = { x: W - 160, y: H - 70, w: 140, h: 44 };
      if (ptIn(this.click, skip)) {
        this.reward = null;
        this.returnToMapOrNextAct();
      }
    }

    applyReward(opt) {
      if (opt.kind === 'relic') {
        this.run.relics.push(opt.relicId);
        this.msg = { text: 'Gained: ' + opt.label, age:0, life:2, color:'#ffd86b' };
      } else if (opt.kind === 'tower') {
        this.run.ownedTowers.push(opt.tid);
        this.msg = { text: 'Unlocked tower: ' + TOWER_DEFS[opt.tid].name, age:0, life:2, color:'#7ae0ff' };
      } else if (opt.kind === 'heal') {
        this.run.hp = Math.min(this.run.maxHp, this.run.hp + opt.amount);
        this.msg = { text: 'Healed +' + opt.amount, age:0, life:2, color:'#4ade80' };
      } else if (opt.kind === 'gold') {
        this.run.nextBattleBonus = (this.run.nextBattleBonus||0) + opt.amount;
        this.msg = { text: '+' + opt.amount + ' battle gold', age:0, life:2, color:'#ffd86b' };
      }
    }

    returnToMapOrNextAct() {
      // If current node was a boss, advance act.
      const cur = this.run.curNode;
      if (cur.type === 'boss') {
        this.run.defeatsBossAct[this.run.act] = true;
        this.actsCleared++;          // milestone: counts toward theme coins
        if (this.run.act >= 3) {
          // Final act cleared — true campaign victory.
          this.scene = 'victory';
          this.meta.lastRun = null;  // run is over; clear resume snapshot
          saveMeta(this.meta);
          if (!this._endTriggered) {
            this._endTriggered = true;
            this.victoryAchieved = true;
            this.win();
          }
          return;
        }
        this.run.act++;
        if (this.hasRelic('ironbark')) this.run.maxHp += 5;
        this.run.maxHp += 5;
        this.run.hp = Math.min(this.run.maxHp, this.run.hp + 10);
        // Jump to next act start
        this.run.curNode = this.run.map.acts[this.run.act - 1].start;
        this.run.visited[this.run.curNode.id] = true;
      }
      this.meta.lastRun = this.run; saveMeta(this.meta);
      this.scene = 'map';
    }

    /* ==================== SHOP ==================== */
    enterShop() {
      // Offer 3 items with prices
      const mul = this.hasRelic('signet') ? 0.8 : 1;
      const items = [];
      items.push({ kind:'heal', amount: 15, price: Math.ceil(30 * mul), label: 'Patch Kit', desc:'Restore 15 HP' });
      const poolRelics = RELICS.filter(r => !this.run.relics.includes(r.id));
      if (poolRelics.length) {
        const r = poolRelics[Math.floor(Math.random()*poolRelics.length)];
        const base = r.rarity === 'rare' ? 120 : r.rarity === 'uncommon' ? 70 : 40;
        items.push({ kind:'relic', relicId:r.id, price: Math.ceil(base * mul), label:'Relic: '+r.name, desc:r.desc });
      }
      const unowned = Object.keys(TOWER_DEFS).filter(t => !this.run.ownedTowers.includes(t));
      if (unowned.length) {
        const tid = unowned[Math.floor(Math.random()*unowned.length)];
        items.push({ kind:'tower', tid, price: Math.ceil(60 * mul), label:'Unlock '+TOWER_DEFS[tid].name, desc:TOWER_DEFS[tid].desc });
      } else {
        items.push({ kind:'heal', amount: 25, price: Math.ceil(50 * mul), label: 'Greater Salve', desc:'Restore 25 HP' });
      }
      this.shopState = { items };
      this.scene = 'shop';
    }

    updateShop(dt) {
      if (!this.click) return;
      const items = this.shopState.items;
      for (let i = 0; i < items.length; i++) {
        const r = { x: 150 + i * 220, y: H/2 - 80, w: 180, h: 180 };
        if (ptIn(this.click, r)) {
          const it = items[i];
          if ((this.run.totalEarned||0) + 0 < it.price) {
            // using "gold" here is meta; ash? Actually shop spends meta gold from previous runs?
            // Simpler: shop uses totalEarned as shop currency bank? Let's gate on battlesDefeated*10+nextBattleBonus
          }
          // Shop uses meta ash? We'll let shop use accumulated ash from prior runs.
          if (this.meta.ash < it.price) { this.sfx.play('deny'); this.msg={text:'Need Ash: '+it.price,age:0,life:1.2,color:'#f87171'}; return; }
          this.meta.ash -= it.price;
          this.applyReward(it);
          items.splice(i, 1);
          saveMeta(this.meta);
          if (items.length === 0) { this.scene = 'map'; return; }
          return;
        }
      }
      const leave = { x: W - 160, y: H - 70, w: 140, h: 44 };
      if (ptIn(this.click, leave)) { this.scene = 'map'; }
    }

    /* ==================== CAMPFIRE ==================== */
    enterCamp() {
      this.campState = { done: false };
      this.scene = 'camp';
    }

    updateCamp(dt) {
      if (!this.click) return;
      const rRest = { x: W/2 - 220, y: H/2, w: 200, h: 80 };
      const rForge = { x: W/2 + 20, y: H/2, w: 200, h: 80 };
      if (ptIn(this.click, rRest)) {
        this.run.hp = Math.min(this.run.maxHp, this.run.hp + 25);
        this.msg = { text: 'Rested: +25 HP', age:0, life:1.5, color:'#4ade80' };
        this.scene = 'map';
      } else if (ptIn(this.click, rForge)) {
        // Forge: increase max HP
        this.run.maxHp += 8;
        this.run.hp += 8;
        this.msg = { text:'Forged: +8 Max HP', age:0, life:1.5, color:'#ffd86b' };
        this.scene = 'map';
      }
    }

    /* ==================== EVENT ==================== */
    enterEvent() {
      const events = [
        {
          title:'Wandering Tinker',
          text:'An old tinker offers to overhaul your gear.',
          options:[
            { label:'Accept (-10 HP, +1 random relic)', apply:(g)=>{ g.run.hp = Math.max(1, g.run.hp - 10); const pool = RELICS.filter(r=>!g.run.relics.includes(r.id)); const p = pool[Math.floor(Math.random()*pool.length)]; if (p) g.run.relics.push(p.id); }},
            { label:'Decline', apply:(g)=>{} }
          ]
        },
        {
          title:'Abandoned Shrine',
          text:'You find a shrine humming with power.',
          options:[
            { label:'Pray (50% +15 HP, 50% -10 HP)', apply:(g)=>{ if (Math.random()<0.5) g.run.hp = Math.min(g.run.maxHp, g.run.hp+15); else g.run.hp = Math.max(1, g.run.hp-10); }},
            { label:'Desecrate (-5 HP, +30 Ash)', apply:(g)=>{ g.run.hp = Math.max(1, g.run.hp-5); g.meta.ash = (g.meta.ash||0) + 30; saveMeta(g.meta); }},
            { label:'Walk past', apply:(g)=>{} }
          ]
        },
        {
          title:'Cache',
          text:'A reinforced cache pokes out of the ground.',
          options:[
            { label:'Pry it open (-3 HP, +Ash)', apply:(g)=>{ g.run.hp = Math.max(1, g.run.hp-3); g.meta.ash = (g.meta.ash||0) + 20; saveMeta(g.meta); }},
            { label:'Move on', apply:(g)=>{} }
          ]
        },
        {
          title:'Wounded Soldier',
          text:'A soldier offers their relic if you spare a moment.',
          options:[
            { label:'Help (gain a common relic)', apply:(g)=>{ const pool = RELICS.filter(r=>r.rarity==='common'&&!g.run.relics.includes(r.id)); const p = pool[Math.floor(Math.random()*pool.length)]; if (p) g.run.relics.push(p.id); }},
            { label:'Ignore', apply:(g)=>{} }
          ]
        }
      ];
      this.eventState = events[Math.floor(Math.random()*events.length)];
      this.scene = 'event';
    }

    updateEvent(dt) {
      if (!this.click) return;
      const ev = this.eventState;
      for (let i = 0; i < ev.options.length; i++) {
        const r = { x: W/2 - 230, y: H/2 + 20 + i*56, w: 460, h: 48 };
        if (ptIn(this.click, r)) {
          ev.options[i].apply(this);
          this.scene = 'map';
          return;
        }
      }
    }

    /* ==================== END SCENES ==================== */
    updateEndScene(dt) {
      if (!this.click) return;
      const r = { x: W/2 - 100, y: H - 100, w: 200, h: 50 };
      if (ptIn(this.click, r)) {
        if (this.scene === 'defeat' || this.scene === 'victory') {
          // Reset to title; clear per-run milestone counters so the next
          // run's `coinsEarned()` starts fresh.
          this.scene = 'title_actions';
          this.run = this.newRun();
          this.victoryAchieved = false;
          this.battlesCleared = 0;
          this.actsCleared = 0;
          this._endTriggered = false;
        }
      }
    }

    /* ==================== RENDER ==================== */
    render(ctx) {
      ctx.fillStyle = '#0b0e16'; ctx.fillRect(0, 0, W, H);
      switch (this.scene) {
        case 'title_actions': this.renderTitle(ctx); break;
        case 'map': this.renderMap(ctx); break;
        case 'battle': this.renderBattle(ctx); break;
        case 'reward': this.renderReward(ctx); break;
        case 'shop': this.renderShop(ctx); break;
        case 'camp': this.renderCamp(ctx); break;
        case 'event': this.renderEvent(ctx); break;
        case 'defeat': this.renderDefeat(ctx); break;
        case 'victory': this.renderVictory(ctx); break;
      }
      if (this.msg) {
        const a = Math.max(0, 1 - this.msg.age / this.msg.life);
        ctx.globalAlpha = a;
        ctx.fillStyle = this.msg.color || '#ffd86b';
        ctx.font = 'bold 18px ui-monospace, monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(this.msg.text, W/2, 40);
        ctx.globalAlpha = 1;
      }
    }

    renderTitle(ctx) {
      // Dark backdrop with subtle vignette
      const g = ctx.createRadialGradient(W/2, H/2, 40, W/2, H/2, W);
      g.addColorStop(0, '#1a1a2e'); g.addColorStop(1, '#05060a');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#ffd86b';
      ctx.font = 'bold 64px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('BULWARK', W/2, H/2 - 80);
      ctx.fillStyle = '#cbd5d0';
      ctx.font = '14px ui-monospace, monospace';
      ctx.fillText('Roguelike tower defense · One life per run', W/2, H/2 - 30);
      // Buttons
      this.renderButton(ctx, W/2 - 140, H/2 + 30, 280, 46, 'New Run', '#ffd86b');
      if (this.meta.lastRun) {
        this.renderButton(ctx, W/2 - 140, H/2 + 90, 280, 46, 'Resume Last Run', '#7ae0ff');
      }
      // Ash
      ctx.fillStyle = '#cbd5d0';
      ctx.font = '13px ui-monospace, monospace';
      ctx.fillText('Ash (persistent): ' + (this.meta.ash||0), W/2, H - 60);
    }

    renderButton(ctx, x, y, w, h, label, color) {
      const mx = Input.mouse.x, my = Input.mouse.y;
      const hover = mx >= x && mx <= x+w && my >= y && my <= y+h;
      ctx.fillStyle = hover ? shade(color, -0.2) : '#1a2030';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = color; ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 16px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, x + w/2, y + h/2);
    }

    renderMap(ctx) {
      // Star-field
      ctx.fillStyle = '#0b0e16'; ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 80; i++) {
        ctx.fillStyle = `rgba(200,220,255,${(i%5)*0.05+0.1})`;
        ctx.fillRect((i * 83) % W, (i * 41) % H, 1, 1);
      }
      // Act labels
      for (let a = 0; a < 3; a++) {
        const x = 100 + a * ((W - 200) / 3);
        ctx.fillStyle = (this.run.act === a+1) ? '#ffd86b' : '#4a5568';
        ctx.font = 'bold 16px ui-monospace, monospace';
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText('ACT ' + (a+1), x - 40, 20);
      }
      // Draw links
      const reachable = this.reachableNodes();
      const cur = this.run.curNode;
      for (const id in this.run.map.nodes) {
        const n = this.run.map.nodes[id];
        for (const lid of n.links || []) {
          const a = this.nodeScreenPos(n);
          const b = this.nodeScreenPos(this.run.map.nodes[lid]);
          ctx.strokeStyle = '#2a3548';
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
      // Highlight reachable
      for (const rn of reachable) {
        const p1 = this.nodeScreenPos(cur);
        const p2 = this.nodeScreenPos(rn);
        ctx.strokeStyle = '#ffd86baa';
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
      }
      // Nodes
      for (const id in this.run.map.nodes) {
        const n = this.run.map.nodes[id];
        const p = this.nodeScreenPos(n);
        const isCur = (n === cur);
        const isReach = reachable.includes(n);
        const visited = this.run.visited[n.id];
        this.drawNode(ctx, n, p.x, p.y, isCur, isReach, visited);
      }
      // Relics bar
      ctx.fillStyle = '#0a1014';
      ctx.fillRect(0, H - 80, W, 80);
      ctx.fillStyle = '#ffd86b';
      ctx.font = 'bold 13px ui-monospace, monospace';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('Relics:', 10, H - 75);
      for (let i = 0; i < this.run.relics.length; i++) {
        const r = RELICS.find(x => x.id === this.run.relics[i]);
        if (!r) continue;
        const rx = 10 + (i % 12) * 72;
        const ry = H - 58 + Math.floor(i / 12) * 20;
        ctx.fillStyle = r.rarity === 'rare' ? '#ff4fd8' : r.rarity === 'uncommon' ? '#7ae0ff' : '#ffd86b';
        ctx.fillRect(rx, ry, 64, 14);
        ctx.fillStyle = '#000';
        ctx.font = 'bold 9px ui-monospace, monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(r.name.slice(0, 12), rx + 32, ry + 7);
      }
      // Hover tooltip for relics
      const mx = Input.mouse.x, my = Input.mouse.y;
      for (let i = 0; i < this.run.relics.length; i++) {
        const r = RELICS.find(x => x.id === this.run.relics[i]);
        if (!r) continue;
        const rx = 10 + (i % 12) * 72;
        const ry = H - 58 + Math.floor(i / 12) * 20;
        if (mx >= rx && mx <= rx+64 && my >= ry && my <= ry+14) {
          this.drawTooltip(ctx, mx + 10, my - 10, r.name + '\n' + r.desc);
        }
      }
    }

    drawNode(ctx, n, x, y, isCur, isReach, visited) {
      const typeColor = { start:'#ffffff', battle:'#7ae0ff', elite:'#ff4fd8', shop:'#ffd86b', camp:'#4ade80', event:'#c084fc', boss:'#ff4d4d' };
      const color = typeColor[n.type] || '#666';
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = isReach ? 22 : 8;
      ctx.fillStyle = visited ? shade(color, -0.4) : color;
      ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#0b0e16';
      ctx.font = 'bold 14px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const letter = { battle:'⚔', elite:'★', shop:'$', camp:'♨', event:'?', boss:'☠', start:'◆' }[n.type] || '•';
      ctx.fillText(letter, x, y + 1);
      if (isCur) {
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, 20, 0, Math.PI*2); ctx.stroke();
      }
    }

    renderBattle(ctx) {
      const B = this.battle;
      // Background grid
      ctx.fillStyle = '#0b0e16'; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = '#14182a'; ctx.lineWidth = 1;
      for (let c = 0; c <= COLS; c++) { ctx.beginPath(); ctx.moveTo(c*TILE, 0); ctx.lineTo(c*TILE, H); ctx.stroke(); }
      for (let r = 0; r <= ROWS; r++) { ctx.beginPath(); ctx.moveTo(0, r*TILE); ctx.lineTo(W, r*TILE); ctx.stroke(); }
      // Build zones
      if (B.prep || this.drag) {
        for (const z of B.buildZones) {
          ctx.fillStyle = 'rgba(74,222,128,0.08)';
          ctx.fillRect(z.x + 2, z.y + 2, TILE - 4, TILE - 4);
        }
      }
      // Path
      ctx.strokeStyle = '#3a2a1a';
      ctx.lineWidth = 28;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(B.path[0].x, B.path[0].y);
      for (const p of B.path) ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.strokeStyle = '#5a3a1a';
      ctx.lineWidth = 22;
      ctx.beginPath();
      ctx.moveTo(B.path[0].x, B.path[0].y);
      for (const p of B.path) ctx.lineTo(p.x, p.y);
      ctx.stroke();
      // Path markers
      for (const p of B.path) {
        ctx.fillStyle = '#8a5a2a';
        ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI*2); ctx.fill();
      }

      // Selected tower range
      if (this.selectedTower) {
        const tw = this.selectedTower;
        const spec = this.towerSpec(tw);
        ctx.fillStyle = 'rgba(122,224,255,0.08)';
        ctx.beginPath(); ctx.arc(tw.x, tw.y, spec.range, 0, Math.PI*2); ctx.fill();
      }

      // Placed towers
      for (const tw of B.placed) {
        this.drawTower(ctx, tw);
      }

      // Enemies
      for (const e of B.enemies) {
        if (!e.alive) continue;
        this.drawEnemy(ctx, e);
      }

      // Projectiles
      for (const p of B.projectiles) {
        if (p.kind === 'proj') {
          ctx.save();
          ctx.shadowColor = p.color || '#ffd86b'; ctx.shadowBlur = 10;
          ctx.fillStyle = p.color || '#ffd86b';
          ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI*2); ctx.fill();
          ctx.restore();
        } else if (p.kind === 'beam') {
          ctx.strokeStyle = '#ff4fd8';
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(p.ax, p.ay); ctx.lineTo(p.bx, p.by); ctx.stroke();
        } else if (p.kind === 'chain') {
          ctx.save();
          ctx.strokeStyle = '#f5d542';
          ctx.lineWidth = 3;
          ctx.shadowColor = '#f5d542'; ctx.shadowBlur = 14;
          ctx.beginPath();
          for (let i = 0; i < p.line.length - 1; i++) {
            const a = p.line[i], b = p.line[i+1];
            ctx.moveTo(a.x, a.y);
            // Wavy lightning
            const segs = 5;
            for (let s = 1; s <= segs; s++) {
              const u = s / segs;
              const x = a.x + (b.x - a.x) * u + (Math.random()-0.5)*14;
              const y = a.y + (b.y - a.y) * u + (Math.random()-0.5)*14;
              ctx.lineTo(x, y);
            }
          }
          ctx.stroke();
          ctx.restore();
        }
      }

      // Floaters
      for (const f of B.floaters) {
        if (f.kind === 'explosion') {
          const a = 1 - f.age / f.life;
          ctx.save();
          ctx.globalAlpha = a;
          ctx.fillStyle = f.color;
          ctx.beginPath(); ctx.arc(f.x, f.y, 30 * (1 - a), 0, Math.PI*2); ctx.fill();
          ctx.restore();
        } else {
          const a = 1 - f.age / f.life;
          ctx.globalAlpha = a;
          ctx.fillStyle = f.color || '#ffd86b';
          ctx.font = 'bold 13px ui-monospace, monospace';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(f.text, f.x, f.y + (-f.vy*f.age));
          ctx.globalAlpha = 1;
        }
      }

      // Tray
      const trayY = H - 100;
      ctx.fillStyle = '#0a1014';
      ctx.fillRect(0, trayY - 10, W, 110);
      let slot = 0;
      for (const tid of this.run.ownedTowers) {
        const def = TOWER_DEFS[tid];
        const x = 20 + slot * 110;
        const cost = this.towerPurchaseCost(tid);
        const canAfford = B.gold >= cost;
        ctx.fillStyle = canAfford ? '#1a2030' : '#0f131a';
        ctx.fillRect(x, trayY, 100, 80);
        ctx.strokeStyle = def.color; ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, trayY + 1, 98, 78);
        // icon
        ctx.fillStyle = def.color;
        ctx.fillRect(x + 42, trayY + 18, 16, 24);
        ctx.fillStyle = '#2a3548';
        ctx.fillRect(x + 40, trayY + 14, 20, 8);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px ui-monospace, monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(def.name, x + 50, trayY + 52);
        ctx.fillStyle = canAfford ? '#ffd86b' : '#555';
        ctx.font = 'bold 11px ui-monospace, monospace';
        ctx.fillText('$' + cost, x + 50, trayY + 68);
        slot++;
      }

      // Gold display
      ctx.fillStyle = '#ffd86b';
      ctx.font = 'bold 22px ui-monospace, monospace';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('$ ' + B.gold, 14, 14);
      // HP display
      ctx.fillStyle = '#ff6e6e';
      ctx.fillText('♥ ' + this.run.hp + '/' + this.run.maxHp, 14, 44);

      // START WAVE button (prep only)
      if (B.prep) {
        this.renderButton(ctx, W - 170, 20, 150, 40, 'START WAVE', '#4ade80');
        ctx.fillStyle = '#cbd5d0';
        ctx.font = '12px ui-monospace, monospace';
        ctx.textAlign = 'right'; ctx.textBaseline = 'top';
        ctx.fillText(B.isBoss ? 'BOSS' : B.isElite ? 'ELITE' : 'Battle', W - 180, 66);
      } else {
        ctx.fillStyle = '#ffd86b';
        ctx.font = 'bold 16px ui-monospace, monospace';
        ctx.textAlign = 'right'; ctx.textBaseline = 'top';
        ctx.fillText('Wave ' + (B.wave + 1) + '/' + B.waves.length, W - 20, 24);
      }

      // Message banner
      if (B.message && B.messageT > 0) {
        B.messageT -= 0.016;
        ctx.fillStyle = '#ffd86b';
        ctx.font = 'bold 26px ui-monospace, monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(B.message, W/2, 80);
      }

      // Drag preview
      if (this.drag) {
        const def = TOWER_DEFS[this.drag.tid];
        ctx.save();
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = def.color;
        ctx.fillRect(this.drag.x - 10, this.drag.y - 14, 20, 28);
        ctx.restore();
        const spec = TOWER_DEFS[this.drag.tid].tiers[0];
        ctx.strokeStyle = def.color; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(this.drag.x, this.drag.y, spec.range, 0, Math.PI*2); ctx.stroke();
      }

      // Selected tower menu
      if (this.selectedTower) {
        const tw = this.selectedTower;
        const def = TOWER_DEFS[tw.tid];
        const spec = this.towerSpec(tw);
        const nextT = def.tiers[tw.tier + 1];
        ctx.fillStyle = '#0a1014';
        ctx.fillRect(0, H - 120, W, 20);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 13px ui-monospace, monospace';
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText(`${def.name} T${tw.tier+1}  ·  DMG ${spec.dmg}  RNG ${Math.round(spec.range)}  CD ${this.towerCooldown(tw).toFixed(2)}s  Kills ${tw.kills}`, 10, H - 118);
        // Sell
        this.renderButton(ctx, 20, H - 70, 120, 44, 'Sell +$' + Math.floor(tw.totalInvested*0.7), '#ff4d6d');
        if (nextT) {
          const canAfford = B.gold >= nextT.upgradeCost;
          this.renderButton(ctx, 150, H - 70, 180, 44, 'Upgrade $' + nextT.upgradeCost, canAfford ? '#ffd86b' : '#666');
        }
      }
    }

    drawTower(ctx, tw) {
      const def = TOWER_DEFS[tw.tid];
      ctx.fillStyle = '#1a2030';
      ctx.fillRect(tw.x - 16, tw.y - 16, 32, 32);
      ctx.fillStyle = def.color;
      ctx.fillRect(tw.x - 10, tw.y - 14, 20, 28);
      // tier pips
      for (let i = 0; i <= tw.tier; i++) {
        ctx.fillStyle = '#ffd86b';
        ctx.fillRect(tw.x - 9 + i * 6, tw.y + 14, 4, 3);
      }
      // head indicator
      ctx.fillStyle = shade(def.color, -0.3);
      ctx.fillRect(tw.x - 12, tw.y - 18, 24, 6);
    }

    drawEnemy(ctx, e) {
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.ellipse(e.x, e.y + e.radius + 4, e.radius, 4, 0, 0, Math.PI*2); ctx.fill();
      ctx.save();
      ctx.shadowColor = e.color; ctx.shadowBlur = 10;
      ctx.fillStyle = e.color;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.radius, 0, Math.PI*2); ctx.fill();
      ctx.restore();
      if (e.shield > 0) {
        ctx.strokeStyle = '#60a5fa';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.radius + 3, 0, Math.PI*2); ctx.stroke();
      }
      if (e.flying) {
        ctx.fillStyle = '#fff6';
        ctx.beginPath(); ctx.ellipse(e.x - e.radius - 3, e.y, 6, 2, 0, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(e.x + e.radius + 3, e.y, 6, 2, 0, 0, Math.PI*2); ctx.fill();
      }
      if (e.slowRemaining > 0) {
        ctx.strokeStyle = '#b7e6ff';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.radius + 2, 0, Math.PI*2); ctx.stroke();
      }
      // HP bar
      const fr = e.hp / e.maxHp;
      ctx.fillStyle = '#00000080';
      ctx.fillRect(e.x - e.radius, e.y - e.radius - 10, e.radius * 2, 4);
      ctx.fillStyle = fr > 0.5 ? '#4ade80' : fr > 0.25 ? '#ffd86b' : '#f87171';
      ctx.fillRect(e.x - e.radius, e.y - e.radius - 10, e.radius * 2 * fr, 4);
    }

    renderReward(ctx) {
      // Dim backdrop
      ctx.fillStyle = '#000a'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#ffd86b';
      ctx.font = 'bold 32px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('Choose a Reward', W/2, 80);
      const opts = this.reward.options;
      for (let i = 0; i < opts.length; i++) {
        const o = opts[i];
        const r = { x: 150 + i * 220, y: H/2 - 90, w: 180, h: 200 };
        const color = o.kind === 'relic' ? (o.rarity === 'rare' ? '#ff4fd8' : o.rarity === 'uncommon' ? '#7ae0ff' : '#ffd86b')
                      : o.kind === 'tower' ? '#4ade80' : '#ffd86b';
        ctx.fillStyle = '#10151f';
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.strokeStyle = color; ctx.lineWidth = 3;
        ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
        ctx.fillStyle = color;
        ctx.font = 'bold 16px ui-monospace, monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        wrapText(ctx, o.label, r.x + r.w/2, r.y + 20, r.w - 20, 18);
        ctx.fillStyle = '#cbd5d0';
        ctx.font = '13px ui-monospace, monospace';
        wrapText(ctx, o.desc, r.x + r.w/2, r.y + 80, r.w - 20, 16);
      }
      this.renderButton(ctx, W - 160, H - 70, 140, 44, 'Skip', '#ff4d6d');
    }

    renderShop(ctx) {
      ctx.fillStyle = '#120817'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#ffd86b';
      ctx.font = 'bold 32px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('Traveling Merchant', W/2, 60);
      ctx.fillStyle = '#cbd5d0';
      ctx.font = '13px ui-monospace, monospace';
      ctx.fillText('(Spend Ash · ' + (this.meta.ash||0) + ' available)', W/2, 100);
      const items = this.shopState.items;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const r = { x: 150 + i * 220, y: H/2 - 80, w: 180, h: 180 };
        ctx.fillStyle = '#10151f';
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.strokeStyle = '#ffd86b';
        ctx.lineWidth = 2;
        ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
        ctx.fillStyle = '#ffd86b';
        ctx.font = 'bold 15px ui-monospace, monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        wrapText(ctx, it.label, r.x + r.w/2, r.y + 20, r.w - 20, 18);
        ctx.fillStyle = '#cbd5d0';
        ctx.font = '12px ui-monospace, monospace';
        wrapText(ctx, it.desc, r.x + r.w/2, r.y + 76, r.w - 20, 15);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 16px ui-monospace, monospace';
        ctx.fillText(it.price + ' Ash', r.x + r.w/2, r.y + r.h - 28);
      }
      this.renderButton(ctx, W - 160, H - 70, 140, 44, 'Leave', '#7ae0ff');
    }

    renderCamp(ctx) {
      ctx.fillStyle = '#0f1b14'; ctx.fillRect(0, 0, W, H);
      // Firelight
      const g = ctx.createRadialGradient(W/2, H/2, 30, W/2, H/2, 400);
      g.addColorStop(0, '#ff8c3a55'); g.addColorStop(1, '#00000000');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#ffd86b';
      ctx.font = 'bold 28px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('Campfire', W/2, 100);
      ctx.fillStyle = '#cbd5d0';
      ctx.font = '14px ui-monospace, monospace';
      ctx.fillText('Rest for the night, or stoke the forge.', W/2, 130);
      this.renderButton(ctx, W/2 - 220, H/2, 200, 80, 'Rest (+25 HP)', '#4ade80');
      this.renderButton(ctx, W/2 + 20, H/2, 200, 80, 'Forge (+8 Max HP)', '#ffd86b');
    }

    renderEvent(ctx) {
      const ev = this.eventState;
      ctx.fillStyle = '#140a1a'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#c084fc';
      ctx.font = 'bold 28px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(ev.title, W/2, 100);
      ctx.fillStyle = '#cbd5d0';
      ctx.font = '14px ui-monospace, monospace';
      wrapText(ctx, ev.text, W/2, 140, 720, 20);
      for (let i = 0; i < ev.options.length; i++) {
        const r = { x: W/2 - 230, y: H/2 + 20 + i*56, w: 460, h: 48 };
        this.renderButton(ctx, r.x, r.y, r.w, r.h, ev.options[i].label, '#c084fc');
      }
    }

    renderDefeat(ctx) {
      ctx.fillStyle = '#1a0a0a'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#ff4d6d';
      ctx.font = 'bold 48px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('DEFEAT', W/2, H/2 - 60);
      ctx.fillStyle = '#cbd5d0';
      ctx.font = '16px ui-monospace, monospace';
      ctx.fillText('Battles: ' + this.run.battlesDefeated + '  ·  Elites: ' + this.run.elitesDefeated, W/2, H/2 - 20);
      ctx.fillStyle = '#ffd86b';
      ctx.fillText('+' + (this.defeatAsh||0) + ' Ash earned', W/2, H/2 + 10);
      this.renderButton(ctx, W/2 - 100, H - 100, 200, 50, 'Back to Title', '#7ae0ff');
    }

    renderVictory(ctx) {
      ctx.fillStyle = '#0a1a1a'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#4ade80';
      ctx.font = 'bold 48px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('VICTORY', W/2, H/2 - 60);
      ctx.fillStyle = '#cbd5d0';
      ctx.font = '16px ui-monospace, monospace';
      ctx.fillText('All three acts conquered.', W/2, H/2 - 20);
      ctx.fillStyle = '#ffd86b';
      ctx.fillText('Total Gold Earned: ' + this.run.totalEarned, W/2, H/2 + 10);
      this.renderButton(ctx, W/2 - 100, H - 100, 200, 50, 'Back to Title', '#7ae0ff');
    }

    drawTooltip(ctx, x, y, text) {
      const lines = text.split('\n');
      const w = Math.max(...lines.map(l => ctx.measureText(l).width)) + 16;
      const h = lines.length * 16 + 8;
      ctx.fillStyle = '#0a1014ee';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#ffd86b';
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      ctx.fillStyle = '#fff';
      ctx.font = '12px ui-monospace, monospace';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], x + 8, y + 4 + i * 16);
    }

    hasRelic(id) { return this.run.relics.includes(id); }

    // Theme coins are awarded per *milestone*, never per-pickup. `score`
    // here is inflated by in-run gold/ash, so we ignore it and pay out for
    // battles cleared, with a stiff bonus for clearing each act and a
    // capstone bonus for the final victory. Calibrated to land in the
    // 5–15 / 25–50 bands described in the migration plan.
    coinsEarned() {
      const battles = this.battlesCleared | 0;
      const acts = this.actsCleared | 0;
      const winBonus = this.victoryAchieved ? 25 : 0;
      return battles * 1 + acts * 5 + winBonus;
    }
  }

  /* ==================== HELPERS ==================== */
  function ptIn(p, r) { return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; }
  function shade(hex, pct) {
    if (hex.startsWith('rgb')) return hex;
    const h = hex.replace('#','');
    let r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16);
    r = Math.max(0, Math.min(255, r + r * pct));
    g = Math.max(0, Math.min(255, g + g * pct));
    b = Math.max(0, Math.min(255, b + b * pct));
    return `rgb(${r|0},${g|0},${b|0})`;
  }
  function wrapText(ctx, text, cx, y, maxW, lh) {
    const words = text.split(' ');
    let line = '';
    let yy = y;
    for (let i = 0; i < words.length; i++) {
      const test = line ? line + ' ' + words[i] : words[i];
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, cx, yy);
        line = words[i]; yy += lh;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, cx, yy);
  }

  NDP.attachGame('bulwark', BulwarkGame);
})();
