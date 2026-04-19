/* Depths — classic roguelike dungeon crawler (expanded).

   Systems (deep):
   - 3 classes: Warrior (hi HP/ATK), Rogue (crit/evasion), Mage (mana/spells)
   - Procedural dungeons (rooms + L-corridors + doors + occasional vault)
   - Turn-based grid movement w/ keyboard + mouse click-to-move (BFS pathfinding)
   - FOV via 64-ray raycast, persistent memory
   - 16 monsters + boss; status effects (poison/burn/slow/confuse/stun)
   - Items: weapons, armor, 8 potions, 7 scrolls, food, gold
   - Unidentified potions/scrolls with random flavor names per run
   - Hunger clock (satiated → hungry → starving → damage)
   - Shops w/ shopkeeper; buy/sell via mouse click
   - Altars: pray for random boon or curse
   - XP/levels; class-specific level-up (warrior +hp, rogue +dodge/crit, mage +mana)
   - Mana & spells (Mage): magic missile, fireball, freeze, blink
   - Animations: floating damage numbers, enemy shake, screen flash on hit
   - Minimap overlay
   - localStorage run persistence
*/
(() => {
  const TILE = 20;
  const COLS = 44, ROWS = 26;

  const T_WALL = 0, T_FLOOR = 1, T_DOOR_C = 2, T_DOOR_O = 3, T_STAIRS_DN = 4, T_STAIRS_UP = 5, T_ALTAR = 6, T_SHOP_MAT = 7, T_CHEST = 8, T_TRAP = 9, T_TRAP_SEEN = 10;

  // ------------- CLASSES ---------------
  const CLASSES = {
    warrior: { name:'Warrior', hp:28, mp:0, atk:5, def:2, dodge:0, crit:0.05, starter:['shortsword','leather'], desc:'Sturdy frontliner. High HP.' },
    rogue:   { name:'Rogue',   hp:22, mp:0, atk:4, def:1, dodge:0.15, crit:0.20, starter:['dagger','leather'], desc:'High crit, evasion, and stealth.' },
    mage:    { name:'Mage',    hp:18, mp:16, atk:2, def:1, dodge:0.05, crit:0.05, starter:['dagger'], desc:'Mana-based spells. Fragile.' },
  };

  // -------- MONSTERS ----------
  // ai: chase, slow, erratic, caster, boss, sentinel, breather, poisoner
  const MONSTERS = [
    { ch:'r', name:'rat',       col:'#a89070', hp:5,  atk:2, def:0, xp:2,  ai:'chase',    dMin:1, w:7 },
    { ch:'b', name:'bat',       col:'#806080', hp:4,  atk:2, def:0, xp:2,  ai:'erratic',  dMin:1, w:5 },
    { ch:'g', name:'goblin',    col:'#88c070', hp:9,  atk:3, def:1, xp:5,  ai:'chase',    dMin:1, w:6 },
    { ch:'s', name:'spider',    col:'#b080b0', hp:6,  atk:3, def:0, xp:6,  ai:'poisoner', dMin:2, w:4 },
    { ch:'k', name:'kobold',    col:'#c06060', hp:10, atk:4, def:1, xp:7,  ai:'chase',    dMin:2, w:5 },
    { ch:'z', name:'zombie',    col:'#6a9060', hp:18, atk:4, def:1, xp:10, ai:'slow',     dMin:3, w:4 },
    { ch:'o', name:'orc',       col:'#70a070', hp:16, atk:5, def:2, xp:13, ai:'chase',    dMin:3, w:5 },
    { ch:'S', name:'skeleton',  col:'#d8d0b0', hp:12, atk:6, def:2, xp:11, ai:'chase',    dMin:3, w:4 },
    { ch:'G', name:'gnoll',     col:'#c09060', hp:22, atk:7, def:2, xp:18, ai:'chase',    dMin:4, w:4 },
    { ch:'w', name:'wraith',    col:'#a0a0e0', hp:16, atk:7, def:2, xp:22, ai:'chase',    dMin:5, w:3 },
    { ch:'t', name:'troll',     col:'#407040', hp:30, atk:8, def:3, xp:28, ai:'chase',    dMin:5, w:4, regen:2 },
    { ch:'n', name:'naga',      col:'#60c0a0', hp:24, atk:7, def:2, xp:24, ai:'poisoner', dMin:5, w:3 },
    { ch:'D', name:'drake',     col:'#e07040', hp:36, atk:10,def:4, xp:40, ai:'breather', dMin:6, w:3 },
    { ch:'L', name:'lich',      col:'#c0e0ff', hp:40, atk:9, def:4, xp:55, ai:'caster',   dMin:7, w:3 },
    { ch:'M', name:'minotaur',  col:'#906040', hp:50, atk:12,def:4, xp:70, ai:'chase',    dMin:7, w:2 },
    { ch:'X', name:'demon',     col:'#a03050', hp:58, atk:13,def:5, xp:90, ai:'breather', dMin:7, w:2 },
  ];
  const BOSS = { ch:'A', name:'Ashen King', col:'#ff6030', hp:140, atk:15, def:6, xp:220, ai:'boss', breath:true };

  // -------- ITEMS --------
  const WEAPONS = [
    { id:'dagger',    name:'dagger',         atk:1, w:5 },
    { id:'shortsword',name:'short sword',    atk:3, w:5, dMin:1 },
    { id:'mace',      name:'mace',           atk:4, w:4, dMin:2 },
    { id:'longsword', name:'long sword',     atk:6, w:3, dMin:3 },
    { id:'warhammer', name:'warhammer',      atk:7, w:3, dMin:4, stun:0.15 },
    { id:'battleaxe', name:'battle axe',     atk:9, w:3, dMin:5 },
    { id:'rune_blade',name:'rune blade',     atk:12, w:2, dMin:6 },
    { id:'doombringer',name:'doombringer',   atk:16, w:1, dMin:7, crit:0.15 },
  ];
  const ARMORS = [
    { id:'leather',  name:'leather armor',   def:1, w:5 },
    { id:'chain',    name:'chain mail',      def:3, w:4, dMin:2 },
    { id:'plate',    name:'plate mail',      def:5, w:3, dMin:4 },
    { id:'rune_mail',name:'rune mail',       def:7, w:2, dMin:6 },
    { id:'ashplate', name:'ash plate',       def:10,w:1, dMin:7 },
  ];
  const POTIONS = [
    { id:'heal',     name:'potion of healing',    w:6 },
    { id:'heal_g',   name:'greater healing',      w:3, dMin:3 },
    { id:'strength', name:'potion of strength',   w:3 },
    { id:'tele',     name:'potion of blink',      w:3 },
    { id:'speed',    name:'potion of haste',      w:2, dMin:3 },
    { id:'mana',     name:'potion of mana',       w:3 },
    { id:'cure',     name:'potion of cure',       w:3 },
    { id:'vision',   name:'potion of true seeing',w:2 },
  ];
  const SCROLLS = [
    { id:'fireball', name:'scroll of fireball',   w:3 },
    { id:'mapping',  name:'scroll of mapping',    w:4 },
    { id:'teleport', name:'scroll of teleport',   w:3 },
    { id:'banish',   name:'scroll of banish',     w:2 },
    { id:'enchant',  name:'scroll of enchant',    w:2, dMin:2 },
    { id:'identify', name:'scroll of identify',   w:4 },
    { id:'magic_mis',name:'scroll of magic missile', w:3 },
  ];
  const FOODS = [
    { id:'ration',   name:'bread ration', restore: 400, w:6 },
    { id:'apple',    name:'apple',        restore: 150, w:4 },
    { id:'meat',     name:'cooked meat',  restore: 600, w:3 },
  ];

  // Potion flavor colors, scroll titles (randomized per run)
  const POTION_FLAVORS = ['red','blue','green','amber','violet','cloudy','fizzing','silver','black','golden','pink','emerald'];
  const SCROLL_WORDS = ['UXA','VELU','KIR','SHAM','ZYR','OTH','PREN','BANAR','QOL','FEX','AZOR','NURG','GLIM','REX','TOR','IRK'];

  // Spells (Mage)
  const SPELLS = [
    { id:'missile',  name:'Magic Missile', mp:2, key:'Q' },
    { id:'fireball', name:'Fireball',      mp:6, key:'E' },
    { id:'freeze',   name:'Freeze',        mp:4, key:'R' },
    { id:'blink',    name:'Blink',         mp:3, key:'T' },
  ];

  const DIRS4 = [[0,-1],[1,0],[0,1],[-1,0]];
  const DIRS8 = [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];

  class DepthsGame {
    constructor(canvas, manifest) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.manifest = manifest;
      this.state = 'idle';
      this.scene = 'classpick';
      this.log = [];
      this.time = 0;
      this.anim = 0;
      this.rng = this._mulberry((Date.now() & 0xffffffff) ^ 0x9e3779b9);
      this.boundKey = null;
      this.boundMouse = null;
      this.boundMove = null;
      this.mousePx = null;
      this.mouseTile = null;
      this.floaters = [];  // { x, y, text, color, t }
      this.effects = [];   // { type: 'flash'|'beam'|'burst'|'shake', data, t }
      this.shake = 0;
      this.pathPreview = null; // array of [x,y]
      this.popup = null;
      this.path = null; // auto-walk queue
      this._last = 0;
      this.floor = 1;
      this.player = null;
      this.dungeon = null;
      this.monsters = [];
      this.items = [];
      this.shopkeeper = null;
      this.deaths = 0;
      this.victory = false;
      this.heartstoneHeld = false;
      this.identified = {}; // id -> true
      this.potionFlavors = {};
      this.scrollTitles = {};
      this._randomizeFlavors();
      this.selectedClass = null;
      this.pickIdx = 0;
      this.highscore = this._loadScore();
      this.coinsOut = 0;
    }

    _mulberry(seed) {
      let a = seed >>> 0;
      return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    _rand(n) { return Math.floor(this.rng() * n); }
    _choose(arr) { return arr[this._rand(arr.length)]; }
    _weighted(arr, filter) {
      const pool = arr.filter(x => !filter || filter(x));
      const total = pool.reduce((s,x)=>s+(x.w||1),0);
      let r = this.rng() * total;
      for (const x of pool) { r -= (x.w||1); if (r <= 0) return x; }
      return pool[pool.length-1];
    }
    _randomizeFlavors() {
      const flavors = [...POTION_FLAVORS].sort(() => this.rng() - 0.5);
      POTIONS.forEach((p,i) => this.potionFlavors[p.id] = flavors[i % flavors.length] + ' potion');
      const titles = [...SCROLL_WORDS].sort(() => this.rng() - 0.5);
      SCROLLS.forEach((s,i) => this.scrollTitles[s.id] = 'scroll of ' + titles[i % titles.length]);
    }

    // ---------- lifecycle ----------
    begin() {
      this.state = 'playing';
      this.scene = 'classpick';
      this._addLog('Choose your class.');
      if (!this.boundKey) {
        this.boundKey = (e) => this._onKey(e);
        window.addEventListener('keydown', this.boundKey);
      }
      if (!this.boundMouse) {
        this.boundMouse = (e) => this._onClick(e);
        this.canvas.addEventListener('click', this.boundMouse);
      }
      if (!this.boundMove) {
        this.boundMove = (e) => this._onMove(e);
        this.canvas.addEventListener('mousemove', this.boundMove);
      }
      this._loop();
    }
    end() {
      this.state = 'idle';
      if (this.boundKey) { window.removeEventListener('keydown', this.boundKey); this.boundKey = null; }
      if (this.boundMouse) { this.canvas.removeEventListener('click', this.boundMouse); this.boundMouse = null; }
      if (this.boundMove) { this.canvas.removeEventListener('mousemove', this.boundMove); this.boundMove = null; }
      if (this._raf) cancelAnimationFrame(this._raf);
    }
    coinsEarned() {
      if (this.victory) return 60 + (this.player?this.player.level:0) * 5 + Math.floor((this.player?this.player.gold:0) / 50);
      const base = Math.max(0, (this.floor - 1) * 2 + (this.player?this.player.level:0));
      return base + Math.floor((this.player?this.player.gold:0) / 100);
    }

    _loop() {
      if (this.state !== 'playing') return;
      const now = performance.now();
      const dt = Math.min(0.05, (this._last ? (now - this._last)/1000 : 0.016));
      this._last = now;
      this._step(dt);
      this._draw();
      this._raf = requestAnimationFrame(()=>this._loop());
    }

    _step(dt) {
      this.time += dt; this.anim += dt;
      this.shake = Math.max(0, this.shake - dt * 12);
      for (const f of this.floaters) f.t += dt;
      this.floaters = this.floaters.filter(f => f.t < 1.2);
      for (const e of this.effects) e.t += dt;
      this.effects = this.effects.filter(e => e.t < (e.max||0.5));
      // auto-walk
      if (this.path && this.scene === 'play') {
        this._pathTimer = (this._pathTimer||0) + dt;
        if (this._pathTimer > 0.06) {
          this._pathTimer = 0;
          this._autoStep();
        }
      }
    }

    // ---------- new run ----------
    _pickClass(key) {
      this.selectedClass = key;
      const c = CLASSES[key];
      this._newRun(c);
      this.scene = 'play';
    }
    _newRun(c) {
      this.floor = 1;
      this.heartstoneHeld = false;
      this.victory = false;
      this.log = [];
      this.deaths = 0;
      this.identified = {};
      this.player = {
        x:0, y:0, ch:'@',
        cls: c,
        hp: c.hp, maxHp: c.hp,
        mp: c.mp, maxMp: c.mp,
        atk: c.atk, def: c.def,
        dodge: c.dodge, crit: c.crit,
        level: 1, xp: 0, xpNext: 20,
        inv: [], wep: null, arm: null,
        strBuff: 0, hasteTurns: 0, visionTurns: 0,
        poisonTurns: 0, confuseTurns: 0, stunTurns: 0,
        food: 1200, maxFood: 1500,
        gold: 20,
      };
      // starters
      for (const id of c.starter) {
        const w = WEAPONS.find(x=>x.id===id);
        const a = ARMORS.find(x=>x.id===id);
        if (w) this._addInv({ kind:'weapon', def:w, identified:true });
        if (a) this._addInv({ kind:'armor', def:a, identified:true });
      }
      this._addInv({ kind:'potion', def: POTIONS[0], identified:false });
      this._addInv({ kind:'potion', def: POTIONS[0], identified:false });
      this._addInv({ kind:'scroll', def: SCROLLS[1], identified:false });
      this._addInv({ kind:'food', def: FOODS[0] });
      // equip
      const firstWep = this.player.inv.find(i=>i.kind==='weapon');
      const firstArm = this.player.inv.find(i=>i.kind==='armor');
      if (firstWep) this.player.wep = firstWep.def;
      if (firstArm) this.player.arm = firstArm.def;
      this._buildFloor(1);
      this._addLog(`A ${c.name} descends. Find the Heartstone.`);
    }

    _addInv(it) {
      if (this.player.inv.length >= 12) { return false; }
      this.player.inv.push(it);
      return true;
    }

    _buildFloor(depth) {
      this.floor = depth;
      const map = new Uint8Array(COLS * ROWS);
      const seen = new Uint8Array(COLS * ROWS);
      const vis = new Uint8Array(COLS * ROWS);
      for (let i = 0; i < map.length; i++) map[i] = T_WALL;

      const rooms = [];
      const tries = 220;
      const roomMax = depth === 8 ? 5 : (10 + Math.min(depth, 6));
      for (let t = 0; t < tries && rooms.length < roomMax; t++) {
        const w = 4 + this._rand(8), h = 3 + this._rand(6);
        const x = 1 + this._rand(COLS - w - 2);
        const y = 1 + this._rand(ROWS - h - 2);
        let ok = true;
        for (const other of rooms) {
          if (x <= other.x + other.w + 1 && x + w + 1 >= other.x && y <= other.y + other.h + 1 && y + h + 1 >= other.y) { ok = false; break; }
        }
        if (!ok) continue;
        for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) map[yy * COLS + xx] = T_FLOOR;
        rooms.push({ x, y, w, h, cx: x + ((w/2)|0), cy: y + ((h/2)|0), kind:'room' });
      }
      // corridors
      for (let i = 1; i < rooms.length; i++) {
        const a = rooms[i-1], b = rooms[i];
        let cx = a.cx, cy = a.cy;
        const xdir = b.cx > cx ? 1 : -1, ydir = b.cy > cy ? 1 : -1;
        const horizFirst = this._rand(2) === 0;
        if (horizFirst) {
          while (cx !== b.cx) { if (map[cy*COLS+cx]===T_WALL) map[cy*COLS+cx]=T_FLOOR; cx += xdir; }
          while (cy !== b.cy) { if (map[cy*COLS+cx]===T_WALL) map[cy*COLS+cx]=T_FLOOR; cy += ydir; }
        } else {
          while (cy !== b.cy) { if (map[cy*COLS+cx]===T_WALL) map[cy*COLS+cx]=T_FLOOR; cy += ydir; }
          while (cx !== b.cx) { if (map[cy*COLS+cx]===T_WALL) map[cy*COLS+cx]=T_FLOOR; cx += xdir; }
        }
        map[cy*COLS+cx] = T_FLOOR;
      }
      // doors at room borders touching corridor floor
      for (const r of rooms) {
        for (let xx = r.x; xx < r.x + r.w; xx++) {
          for (const yy of [r.y - 1, r.y + r.h]) {
            if (yy < 0 || yy >= ROWS) continue;
            if (map[yy*COLS+xx] === T_FLOOR && this._rand(4) === 0) map[yy*COLS+xx] = T_DOOR_C;
          }
        }
        for (let yy = r.y; yy < r.y + r.h; yy++) {
          for (const xx of [r.x - 1, r.x + r.w]) {
            if (xx < 0 || xx >= COLS) continue;
            if (map[yy*COLS+xx] === T_FLOOR && this._rand(4) === 0) map[yy*COLS+xx] = T_DOOR_C;
          }
        }
      }

      // stairs
      const start = rooms[0];
      const endR = rooms[rooms.length - 1];
      if (depth < 8) map[endR.cy * COLS + endR.cx] = T_STAIRS_DN;
      else map[endR.cy * COLS + endR.cx] = T_ALTAR;
      this.player.x = start.cx; this.player.y = start.cy;
      if (depth > 1) {
        // put stairs-up somewhere in start room (decorative)
        const ux = start.x + 1 + this._rand(Math.max(1,start.w-2));
        const uy = start.y + 1 + this._rand(Math.max(1,start.h-2));
        if (map[uy*COLS+ux] === T_FLOOR && !(ux===start.cx && uy===start.cy)) map[uy*COLS+ux] = T_STAIRS_UP;
      }

      // Assign dungeon now so _tile/_walkable work during spawning
      this.dungeon = { map, seen, vis, rooms, depth };

      // Shop on floors 3 and 6
      this.shopkeeper = null;
      if ((depth === 3 || depth === 6) && rooms.length >= 2) {
        const shopR = rooms[1 + this._rand(rooms.length - 1)];
        shopR.kind = 'shop';
        // fill with T_SHOP_MAT tiles (for color)
        for (let yy = shopR.y; yy < shopR.y + shopR.h; yy++)
          for (let xx = shopR.x; xx < shopR.x + shopR.w; xx++)
            map[yy * COLS + xx] = T_SHOP_MAT;
        // place shopkeeper at a corner
        this.shopkeeper = { x: shopR.cx, y: shopR.cy, ch:'$', col:'#ffd86b', hp: 999, def:999, atk: 30, name:'shopkeeper' };
        // stock items on shop mat
        const stock = [];
        for (let i = 0; i < 5; i++) stock.push(this._rollItem(depth + 1, 0, 0));
        let placed = 0;
        for (let yy = shopR.y; yy < shopR.y + shopR.h && placed < stock.length; yy++) {
          for (let xx = shopR.x; xx < shopR.x + shopR.w && placed < stock.length; xx++) {
            if (xx === this.shopkeeper.x && yy === this.shopkeeper.y) continue;
            if ((xx + yy) & 1) continue; // sparse
            stock[placed].x = xx; stock[placed].y = yy; stock[placed].forsale = this._priceItem(stock[placed]);
            this.items.push(stock[placed]);
            placed++;
          }
        }
      }

      // Spawn monsters
      this.monsters = [];
      const monCount = 4 + Math.floor(depth * 1.8);
      const avail = MONSTERS.filter(m => (m.dMin||1) <= depth);
      for (let i = 0; i < monCount; i++) {
        const room = rooms[1 + this._rand(rooms.length - 1)];
        if (!room || room.kind === 'shop') continue;
        const x = room.x + this._rand(room.w);
        const y = room.y + this._rand(room.h);
        if (!this._walkable(x,y) || this._monAt(x,y)) continue;
        if (x === this.player.x && y === this.player.y) continue;
        const def = this._weighted(avail);
        this.monsters.push({
          x, y, def, hp: def.hp, maxHp: def.hp,
          awake:false, slowCarry:0, breathCd:0,
          burn:0, poison:0, frozen:0, stun:0, confuse:0,
        });
      }
      if (depth === 8) {
        const bx = endR.cx - 2, by = endR.cy;
        if (this._walkable(bx, by)) this.monsters.push({ x:bx, y:by, def:BOSS, hp:BOSS.hp, maxHp:BOSS.hp, awake:true, slowCarry:0, breathCd:0, burn:0, poison:0, frozen:0, stun:0, confuse:0 });
      }

      // Spawn items
      if (!this.items) this.items = [];
      // remove old-floor items that aren't shop
      this.items = this.items.filter(it => it.forsale);
      const itemCount = 3 + this._rand(3) + Math.floor(depth/2);
      for (let i = 0; i < itemCount; i++) {
        const room = rooms[1 + this._rand(rooms.length - 1)];
        if (!room || room.kind === 'shop') continue;
        const x = room.x + this._rand(room.w);
        const y = room.y + this._rand(room.h);
        if (!this._walkable(x, y)) continue;
        if (x === this.player.x && y === this.player.y) continue;
        this.items.push(this._rollItem(depth, x, y));
      }
      // guaranteed gear progression
      if ([2,4,6].includes(depth)) {
        const room = rooms[1 + this._rand(rooms.length - 1)];
        if (room && room.kind !== 'shop') {
          const x = room.x + this._rand(room.w);
          const y = room.y + this._rand(room.h);
          if (this._walkable(x,y)) this.items.push({ kind:'weapon', def:this._weighted(WEAPONS, w=>(w.dMin||1)<=depth), identified:false, x, y });
        }
      }

      this._computeFov();
      this._addLog(`Floor ${depth}.`);
      if (depth === 8) this._addLog('You sense a great presence.');
    }

    // ---------- utilities ----------
    _tile(x, y) {
      if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return T_WALL;
      return this.dungeon.map[y * COLS + x];
    }
    _walkable(x, y) {
      const t = this._tile(x, y);
      return t !== T_WALL && t !== T_DOOR_C;
    }
    _walkableForPath(x, y) {
      const t = this._tile(x, y);
      return t !== T_WALL;
    }
    _blocked(x, y) {
      if (!this._walkable(x, y)) return true;
      if (this.player && this.player.x === x && this.player.y === y) return true;
      if (this.shopkeeper && this.shopkeeper.x === x && this.shopkeeper.y === y) return true;
      for (const m of this.monsters) if (m.x === x && m.y === y) return true;
      return false;
    }
    _monAt(x, y) { return this.monsters.find(m => m.x === x && m.y === y); }
    _itemsAt(x, y) { return this.items.filter(i => i.x === x && i.y === y); }

    _priceItem(it) {
      if (it.kind === 'weapon') return 20 + (it.def.atk||1) * 10;
      if (it.kind === 'armor')  return 20 + (it.def.def||1) * 10;
      if (it.kind === 'potion') return 20 + (it.def.dMin||1) * 5;
      if (it.kind === 'scroll') return 25 + (it.def.dMin||1) * 5;
      if (it.kind === 'food')   return 15;
      return 10;
    }

    // ---------- FOV (raycast) ----------
    _computeFov() {
      const { vis, seen, map } = this.dungeon;
      for (let i = 0; i < vis.length; i++) vis[i] = 0;
      const radius = this.player.visionTurns > 0 ? 12 : 7;
      const px = this.player.x, py = this.player.y;
      const steps = 96;
      for (let a = 0; a < steps; a++) {
        const ang = (a / steps) * Math.PI * 2;
        const dx = Math.cos(ang), dy = Math.sin(ang);
        let x = px + 0.5, y = py + 0.5;
        for (let r = 0; r < radius; r++) {
          x += dx; y += dy;
          const ix = Math.floor(x), iy = Math.floor(y);
          if (ix < 0 || iy < 0 || ix >= COLS || iy >= ROWS) break;
          vis[iy * COLS + ix] = 1;
          seen[iy * COLS + ix] = 1;
          const t = map[iy*COLS+ix];
          if (t === T_WALL || t === T_DOOR_C) break;
        }
      }
      vis[py * COLS + px] = 1; seen[py * COLS + px] = 1;
    }

    // ---------- input ----------
    _onKey(e) {
      if (this.state !== 'playing') return;
      const k = e.key;
      if (this.scene === 'classpick') {
        const keys = Object.keys(CLASSES);
        if (k === 'ArrowUp' || k === 'w' || k === 'W') this.pickIdx = (this.pickIdx + keys.length - 1) % keys.length;
        else if (k === 'ArrowDown' || k === 's' || k === 'S') this.pickIdx = (this.pickIdx + 1) % keys.length;
        else if (k === 'Enter' || k === ' ') { this._pickClass(keys[this.pickIdx]); }
        else if (k === '1') { this._pickClass('warrior'); }
        else if (k === '2') { this._pickClass('rogue'); }
        else if (k === '3') { this._pickClass('mage'); }
        else return;
        e.preventDefault(); return;
      }
      if (this.scene === 'dead' || this.scene === 'won') {
        if (k === 'Enter' || k === ' ') { this.scene = 'classpick'; this.pickIdx = 0; }
        e.preventDefault(); return;
      }
      if (this.scene === 'invview') {
        if (k === 'Escape' || k === 'i' || k === 'I') { this.scene = 'play'; e.preventDefault(); return; }
        if (k >= '1' && k <= '9') { this._useInvSlot(parseInt(k,10)-1); e.preventDefault(); return; }
        if (k === 'd' || k === 'D') { /* drop prompt mode */ this.scene='play'; return; }
        return;
      }
      if (this.scene !== 'play') return;
      // cancel path
      if (this.path && (k.startsWith('Arrow') || k === 'w'||k==='a'||k==='s'||k==='d'||k==='W'||k==='A'||k==='S'||k==='D')) this.path = null;

      let dx = 0, dy = 0, wait = false;
      if (k === 'ArrowUp' || k === 'w' || k === 'W' || k === 'k') dy = -1;
      else if (k === 'ArrowDown' || k === 's' || k === 'S' || k === 'j') dy = 1;
      else if (k === 'ArrowLeft' || k === 'a' || k === 'A' || k === 'h') dx = -1;
      else if (k === 'ArrowRight' || k === 'd' || k === 'D' || k === 'l') dx = 1;
      else if (k === 'y') { dx = -1; dy = -1; }
      else if (k === 'u') { dx = 1; dy = -1; }
      else if (k === 'n') { dx = 1; dy = 1; }
      else if (k === 'b') { dx = -1; dy = 1; }
      else if (k === '.') wait = true;
      else if (k === 'g' || k === 'G') { this._pickup(); e.preventDefault(); this._enemyTurn(); this._computeFov(); return; }
      else if (k === '>') { this._descend(); e.preventDefault(); return; }
      else if (k === 'i' || k === 'I') { this.scene = 'invview'; e.preventDefault(); return; }
      else if (k === 'q' || k === 'Q') { this._castSpell('missile'); e.preventDefault(); return; }
      else if (k === 'e' || k === 'E') { this._castSpell('fireball'); e.preventDefault(); return; }
      else if (k === 'r' || k === 'R') { this._castSpell('freeze'); e.preventDefault(); return; }
      else if (k === 't' || k === 'T') { this._castSpell('blink'); e.preventDefault(); return; }
      else if (k >= '1' && k <= '9') { this._useInvSlot(parseInt(k,10) - 1); e.preventDefault(); return; }
      else return;
      e.preventDefault();
      if (wait || dx || dy) this._playerAct(dx, dy, wait);
    }

    _onMove(e) {
      const rect = this.canvas.getBoundingClientRect();
      const sx = this.canvas.width / rect.width, sy = this.canvas.height / rect.height;
      const px = (e.clientX - rect.left) * sx;
      const py = (e.clientY - rect.top) * sy;
      this.mousePx = { x:px, y:py };
      if (this.dungeon) {
        const ox = Math.floor((this.canvas.width - COLS*TILE)/2);
        const oy = 8;
        const tx = Math.floor((px - ox) / TILE);
        const ty = Math.floor((py - oy) / TILE);
        if (tx >= 0 && ty >= 0 && tx < COLS && ty < ROWS) this.mouseTile = { x: tx, y: ty };
        else this.mouseTile = null;
      }
    }

    _onClick(e) {
      if (this.scene === 'classpick') {
        const keys = Object.keys(CLASSES);
        const rect = this.canvas.getBoundingClientRect();
        const sy = this.canvas.height / rect.height;
        const py = (e.clientY - rect.top) * sy;
        const start = this.canvas.height/2 - 50;
        for (let i = 0; i < keys.length; i++) {
          const y = start + i*70;
          if (py >= y - 30 && py <= y + 30) { this._pickClass(keys[i]); return; }
        }
        return;
      }
      if (this.scene === 'dead' || this.scene === 'won') { this.scene = 'classpick'; return; }
      if (this.scene !== 'play') return;
      if (!this.mouseTile) return;
      const { x, y } = this.mouseTile;
      // adjacent click → single step/attack
      const dx = x - this.player.x, dy = y - this.player.y;
      if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1 && !(dx===0 && dy===0)) {
        this._playerAct(Math.sign(dx), Math.sign(dy), false);
        return;
      }
      // pathfind
      const path = this._bfsPath(this.player.x, this.player.y, x, y);
      if (path && path.length > 1) {
        this.path = path.slice(1);
      }
    }

    _autoStep() {
      if (!this.path || !this.path.length) { this.path = null; return; }
      // stop if enemy visible
      for (const m of this.monsters) {
        if (this.dungeon.vis[m.y*COLS+m.x] && m.def !== undefined) { this.path = null; return; }
      }
      const next = this.path.shift();
      const dx = next[0] - this.player.x, dy = next[1] - this.player.y;
      if (this._blocked(next[0], next[1])) { this.path = null; return; }
      this._playerAct(Math.sign(dx), Math.sign(dy), false);
      if (this.player.hp <= 0 || this.scene !== 'play') this.path = null;
    }

    _bfsPath(sx, sy, tx, ty) {
      if (!this._walkableForPath(tx, ty)) return null;
      const visited = new Uint8Array(COLS * ROWS);
      const prev = new Int32Array(COLS * ROWS); for (let i=0;i<prev.length;i++) prev[i] = -1;
      const q = [sy * COLS + sx];
      visited[sy * COLS + sx] = 1;
      let head = 0;
      while (head < q.length) {
        const cur = q[head++];
        if (cur === ty * COLS + tx) break;
        const cx = cur % COLS, cy = (cur / COLS) | 0;
        for (const d of DIRS4) {
          const nx = cx + d[0], ny = cy + d[1];
          if (nx<0||ny<0||nx>=COLS||ny>=ROWS) continue;
          const idx = ny * COLS + nx;
          if (visited[idx]) continue;
          if (!this._walkableForPath(nx, ny)) continue;
          if (this._monAt(nx, ny)) continue;
          visited[idx] = 1; prev[idx] = cur;
          q.push(idx);
        }
      }
      const target = ty * COLS + tx;
      if (!visited[target]) return null;
      const path = [];
      let c = target;
      while (c !== -1) { path.push([c % COLS, (c/COLS)|0]); c = prev[c]; }
      return path.reverse();
    }

    // ---------- acting ----------
    _playerAct(dx, dy, wait) {
      if (this.player.stunTurns > 0) {
        this.player.stunTurns--;
        this._addLog('You are stunned.');
        this._enemyTurn(); this._computeFov(); return;
      }
      if (this.player.confuseTurns > 0) {
        const d = DIRS8[this._rand(8)];
        dx = d[0]; dy = d[1];
        this.player.confuseTurns--;
        this._addLog('You stumble.');
      }
      if (wait) { this._tickPlayer(); this._enemyTurn(); this._computeFov(); return; }
      const nx = this.player.x + dx, ny = this.player.y + dy;
      const t = this._tile(nx, ny);
      if (t === T_DOOR_C) {
        this.dungeon.map[ny*COLS+nx] = T_DOOR_O;
        this._addLog('You open the door.');
        this._tickPlayer(); this._enemyTurn(); this._computeFov(); return;
      }
      if (this.shopkeeper && this.shopkeeper.x === nx && this.shopkeeper.y === ny) {
        this._addLog('The shopkeeper smiles. Walk onto items to see prices; attack adjacent space to buy.');
        return;
      }
      const m = this._monAt(nx, ny);
      if (m) { this._attack(this.player, m); }
      else if (this._walkable(nx, ny)) {
        this.player.x = nx; this.player.y = ny;
        const here = this._itemsAt(nx, ny);
        if (here.length) {
          const f = here.find(i=>i.forsale);
          if (f) this._addLog(`${this._itemName(f)} — ${f.forsale}g (G to buy)`);
          else this._addLog(`You see: ${here.map(i=>this._itemName(i)).join(', ')}. (G)`);
        }
        if (this._tile(nx,ny) === T_ALTAR) {
          if (this.floor === 8 && !this.heartstoneHeld) {
            this.heartstoneHeld = true;
            this._addLog('You seize the Heartstone. Cold as starlight.');
            this._floater(nx, ny, '✦', '#88e0ff');
          } else if (this.floor !== 8 && !this._prayed) {
            this._pray();
          }
        }
      } else {
        this._addLog('Blocked.');
        return;
      }
      this._tickPlayer();
      this._enemyTurn();
      this._computeFov();
      if (this.heartstoneHeld && this.floor === 8 && this.monsters.length === 0) {
        this.victory = true; this.scene = 'won';
        this._addLog('Silence. Victory.');
      }
    }

    _tickPlayer() {
      const p = this.player;
      if (p.strBuff > 0) p.strBuff--;
      if (p.hasteTurns > 0) p.hasteTurns--;
      if (p.visionTurns > 0) p.visionTurns--;
      if (p.poisonTurns > 0) {
        p.hp -= 1;
        this._floater(p.x, p.y, '-1', '#80ff80');
        p.poisonTurns--;
        if (p.hp <= 0) { this._die('poison'); return; }
      }
      // hunger
      p.food -= 1 + (p.hasteTurns > 0 ? 1 : 0);
      if (p.food <= 0) {
        p.hp -= 1;
        this._floater(p.x, p.y, '-1', '#c09060');
        p.food = 0;
        if (p.hp <= 0) { this._die('starvation'); return; }
        if ((this.time*10|0)%4===0) this._addLog('You are starving!');
      }
      // HP regen when not starving and not recently hit
      if (p.food > 200 && this._regenCd > 0) this._regenCd--;
      if (p.food > 200 && (this._regenCd||0) === 0 && p.hp < p.maxHp) {
        if ((this._regenTurn = (this._regenTurn||0)+1) >= 6) {
          p.hp = Math.min(p.maxHp, p.hp + 1);
          this._regenTurn = 0;
        }
      }
      // mana regen for mage
      if (p.cls.mp > 0 && p.mp < p.maxMp) {
        if ((this._manaTurn = (this._manaTurn||0)+1) >= 4) { p.mp = Math.min(p.maxMp, p.mp + 1); this._manaTurn = 0; }
      }
    }

    _descend() {
      if (this._tile(this.player.x, this.player.y) !== T_STAIRS_DN) { this._addLog('No stairs here.'); return; }
      if (this.floor >= 8) return;
      this.items = this.items.filter(i=>!i.forsale); // clear old shop stock on descend
      this._buildFloor(this.floor + 1);
    }

    _pickup() {
      const here = this._itemsAt(this.player.x, this.player.y);
      if (!here.length) { this._addLog('Nothing here.'); return; }
      for (const it of here) {
        if (it.forsale) {
          if (this.player.gold < it.forsale) { this._addLog(`Need ${it.forsale}g.`); continue; }
          this.player.gold -= it.forsale; delete it.forsale;
          this._addLog(`Bought ${this._itemName(it)}.`);
        }
        const idx = this.items.indexOf(it);
        if (idx >= 0) this.items.splice(idx, 1);
        if (it.kind === 'gold') { this.player.gold += it.amount; this._addLog(`+${it.amount} gold.`); continue; }
        if (!this._addInv(it)) { this._addLog('Inventory full.'); this.items.push(it); }
        else {
          this._addLog(`Picked up ${this._itemName(it)}.`);
          if (it.kind === 'weapon' && (!this.player.wep || it.def.atk > this.player.wep.atk)) { this.player.wep = it.def; this._addLog(`Wielding ${it.def.name}.`); }
          if (it.kind === 'armor' && (!this.player.arm || it.def.def > this.player.arm.def)) { this.player.arm = it.def; this._addLog(`Wearing ${it.def.name}.`); }
        }
      }
    }

    _useInvSlot(i) {
      const it = this.player.inv[i];
      if (!it) return;
      if (it.kind === 'potion') { this._quaff(it); this.player.inv.splice(i,1); this._tickPlayer(); this._enemyTurn(); this._computeFov(); }
      else if (it.kind === 'scroll') { this._read(it); this.player.inv.splice(i,1); this._tickPlayer(); this._enemyTurn(); this._computeFov(); }
      else if (it.kind === 'food') {
        this.player.food = Math.min(this.player.maxFood, this.player.food + it.def.restore);
        this._addLog(`You eat the ${it.def.name}.`);
        this.player.inv.splice(i,1);
        this._tickPlayer(); this._enemyTurn(); this._computeFov();
      }
      else if (it.kind === 'weapon') { this.player.wep = it.def; this._addLog(`Wielding ${it.def.name}.`); }
      else if (it.kind === 'armor') { this.player.arm = it.def; this._addLog(`Wearing ${it.def.name}.`); }
    }

    _quaff(it) {
      const id = it.def.id; this.identified[id] = true;
      if (id === 'heal') { const h = 14 + this._rand(6); this.player.hp = Math.min(this.player.maxHp, this.player.hp + h); this._addLog(`+${h} HP.`); this._floater(this.player.x, this.player.y, `+${h}`, '#80ff80'); }
      else if (id === 'heal_g') { this.player.maxHp += 5; this.player.hp = this.player.maxHp; this._addLog('Fully restored. Max HP +5.'); }
      else if (id === 'strength') { this.player.strBuff = 25; this._addLog('+2 ATK for 25 turns.'); }
      else if (id === 'tele') { this._teleportPlayer(6); this._addLog('You blink.'); }
      else if (id === 'speed') { this.player.hasteTurns = 20; this._addLog('Time slows.'); }
      else if (id === 'mana') { this.player.maxMp += 3; this.player.mp = Math.min(this.player.maxMp, this.player.mp + 8); this._addLog('Your mind clears. Max MP +3.'); }
      else if (id === 'cure') { this.player.poisonTurns = 0; this.player.confuseTurns = 0; this.player.stunTurns = 0; this._addLog('You feel cleansed.'); }
      else if (id === 'vision') { this.player.visionTurns = 40; this._addLog('Your sight sharpens.'); }
    }
    _read(it) {
      const id = it.def.id; this.identified[id] = true;
      if (id === 'fireball') {
        let hit = 0;
        for (const m of [...this.monsters]) {
          const d = Math.hypot(m.x - this.player.x, m.y - this.player.y);
          if (d <= 4.2) { this._dealDamage(m, 16 + this._rand(8), 'fire'); hit++; m.burn = 3; this._floater(m.x, m.y, 'BURN', '#ff6030'); }
        }
        this._effect('burst', { x: this.player.x, y: this.player.y, r: 4.2, color: '#ff7030' }, 0.5);
        this._addLog(`Fireball hits ${hit}.`);
      } else if (id === 'mapping') {
        for (let i = 0; i < this.dungeon.seen.length; i++) this.dungeon.seen[i] = 1;
        this._addLog('Map revealed.');
      } else if (id === 'teleport') { this._teleportPlayer(999); this._addLog('Whisked away.'); }
      else if (id === 'banish') {
        let n = 0;
        for (const m of [...this.monsters]) {
          const d = Math.hypot(m.x - this.player.x, m.y - this.player.y);
          if (d <= 6 && m.def !== BOSS) { this._removeMon(m); n++; }
        }
        this._addLog(`${n} banished.`);
      } else if (id === 'enchant') {
        if (this.player.wep) { this.player.wep.atk += 2; this._addLog(`Your ${this.player.wep.name} glows. +2 ATK.`); }
        else this._addLog('Nothing to enchant.');
      } else if (id === 'identify') {
        for (const inv of this.player.inv) if (inv.def) this.identified[inv.def.id] = true;
        this._addLog('All items identified.');
      } else if (id === 'magic_mis') {
        const target = this._nearestEnemyInLOS(8);
        if (target) { this._dealDamage(target, 18 + this._rand(6), 'arc'); this._effect('beam', { from:[this.player.x, this.player.y], to:[target.x, target.y], color:'#88c0ff' }, 0.3); this._addLog(`Missile hits the ${target.def.name}!`); }
        else this._addLog('No target in sight.');
      }
    }
    _teleportPlayer(maxR) {
      for (let tries = 0; tries < 400; tries++) {
        const x = this._rand(COLS), y = this._rand(ROWS);
        if (this._walkable(x, y) && !this._monAt(x, y)) {
          const d = Math.hypot(x - this.player.x, y - this.player.y);
          if (d <= maxR) { this.player.x = x; this.player.y = y; return; }
        }
      }
    }
    _nearestEnemyInLOS(range) {
      let best = null, bestD = 1e9;
      for (const m of this.monsters) {
        const d = Math.hypot(m.x - this.player.x, m.y - this.player.y);
        if (d > range) continue;
        if (!this.dungeon.vis[m.y*COLS+m.x]) continue;
        if (!this._los(this.player, m)) continue;
        if (d < bestD) { bestD = d; best = m; }
      }
      return best;
    }

    // ---------- spells ----------
    _castSpell(id) {
      if (this.player.cls !== CLASSES.mage) { this._addLog('Only a mage can cast.'); return; }
      const s = SPELLS.find(s=>s.id===id);
      if (!s) return;
      if (this.player.mp < s.mp) { this._addLog('Not enough mana.'); return; }
      if (id === 'missile') {
        const t = this._nearestEnemyInLOS(8);
        if (!t) { this._addLog('No target.'); return; }
        this.player.mp -= s.mp;
        this._dealDamage(t, 10 + this._rand(4) + this.player.level, 'arc');
        this._effect('beam', { from:[this.player.x, this.player.y], to:[t.x, t.y], color:'#88c0ff' }, 0.25);
        this._addLog(`Missile hits the ${t.def.name}.`);
      } else if (id === 'fireball') {
        const t = this._nearestEnemyInLOS(7);
        const cx = t ? t.x : this.player.x, cy = t ? t.y : this.player.y;
        this.player.mp -= s.mp;
        for (const m of [...this.monsters]) {
          const d = Math.hypot(m.x - cx, m.y - cy);
          if (d <= 2.5) { this._dealDamage(m, 14 + this._rand(6), 'fire'); m.burn = 3; }
        }
        this._effect('burst', { x: cx, y: cy, r: 2.5, color: '#ff7030' }, 0.45);
        this._addLog('Fireball!');
      } else if (id === 'freeze') {
        const t = this._nearestEnemyInLOS(6);
        if (!t) { this._addLog('No target.'); return; }
        this.player.mp -= s.mp;
        t.frozen = 3;
        this._dealDamage(t, 6 + this._rand(4), 'cold');
        this._effect('beam', { from:[this.player.x, this.player.y], to:[t.x, t.y], color:'#a0e0ff' }, 0.25);
        this._addLog(`The ${t.def.name} freezes.`);
      } else if (id === 'blink') {
        this.player.mp -= s.mp;
        this._teleportPlayer(6);
      }
      this._tickPlayer(); this._enemyTurn(); this._computeFov();
    }

    // ---------- combat ----------
    _attack(att, def) {
      const isPlayer = att === this.player;
      // dodge
      if (isPlayer === false && this.rng() < (this.player.dodge || 0)) {
        this._addLog(`You dodge the ${att.def.name}.`);
        this._floater(this.player.x, this.player.y, 'miss', '#a0a0ff');
        return;
      }
      const atk = isPlayer ? (this.player.atk + (this.player.wep ? this.player.wep.atk : 0) + (this.player.strBuff>0?2:0)) : att.def.atk;
      const arm = isPlayer ? (def.def.def || 0) : (this.player.def + (this.player.arm ? this.player.arm.def : 0));
      let raw = atk + this._rand(4);
      let crit = false;
      if (isPlayer && this.rng() < (this.player.crit + (this.player.wep && this.player.wep.crit ? this.player.wep.crit : 0))) { raw *= 2; crit = true; }
      const dmg = Math.max(1, raw - arm);
      if (isPlayer) {
        if (crit) this.shake = 0.4;
        this._dealDamage(def, dmg, crit ? 'crit' : 'hit');
        if (this.player.wep && this.player.wep.stun && this.rng() < this.player.wep.stun) { def.stun = 2; this._addLog(`The ${def.def.name} is stunned.`); }
        this._addLog(`You hit${crit?' CRITICALLY':''} the ${def.def.name} for ${dmg}.`);
      } else {
        this.player.hp -= dmg;
        this._floater(this.player.x, this.player.y, '-'+dmg, '#ff8080');
        this._regenCd = 12;
        this.shake = 0.25;
        this._addLog(`The ${att.def.name} hits you for ${dmg}.`);
        if (att.def.ai === 'poisoner' && this.rng() < 0.5) { this.player.poisonTurns = Math.max(this.player.poisonTurns, 6); this._addLog('You are poisoned!'); }
        if (this.player.hp <= 0) { this._die(att.def.name); }
      }
    }
    _dealDamage(m, dmg, kind) {
      m.hp -= dmg; m.awake = true;
      this._floater(m.x, m.y, '-'+dmg, kind === 'crit' ? '#ffd86b' : kind === 'fire' ? '#ff7030' : kind === 'cold' ? '#a0e0ff' : kind === 'arc' ? '#88c0ff' : '#ffffff');
      if (m.hp <= 0) this._killMonster(m);
    }
    _killMonster(m) {
      this._addLog(`Slain: ${m.def.name}. +${m.def.xp} XP.`);
      this.player.xp += m.def.xp;
      while (this.player.xp >= this.player.xpNext) {
        this.player.xp -= this.player.xpNext;
        this.player.level++;
        const cls = this.player.cls;
        if (cls === CLASSES.warrior) { this.player.maxHp += 7 + this._rand(3); this.player.atk += 1; }
        else if (cls === CLASSES.rogue) { this.player.maxHp += 5; this.player.atk += 1; this.player.dodge += 0.02; this.player.crit += 0.03; }
        else if (cls === CLASSES.mage) { this.player.maxHp += 4; this.player.maxMp += 3; this.player.atk += 1; }
        this.player.hp = this.player.maxHp;
        this.player.mp = this.player.maxMp;
        this.player.xpNext = Math.floor(this.player.xpNext * 1.7);
        this._addLog(`*** Level ${this.player.level}! ***`);
        this._floater(this.player.x, this.player.y, 'LEVEL UP', '#ffd86b');
      }
      if (this.rng() < 0.2 || m.def === BOSS) {
        const it = this._rollItem(this.floor, m.x, m.y);
        this.items.push(it);
      }
      this._removeMon(m);
    }
    _removeMon(m) {
      const i = this.monsters.indexOf(m);
      if (i >= 0) this.monsters.splice(i, 1);
    }
    _die(cause) {
      this.scene = 'dead';
      this.deaths++;
      this._addLog(`You perish (${cause}). ENTER to retry.`);
      const s = (this.floor-1)*100 + (this.player?this.player.level*20:0) + (this.player?this.player.gold:0);
      if (s > this.highscore) { this.highscore = s; this._saveScore(s); }
    }

    // ---------- enemy AI ----------
    _enemyTurn() {
      for (const m of [...this.monsters]) {
        if (m.hp <= 0) continue;
        if (m.burn > 0) { m.burn--; m.hp -= 3; this._floater(m.x, m.y, '-3', '#ff7030'); if (m.hp <= 0) { this._killMonster(m); continue; } }
        if (m.poison > 0) { m.poison--; m.hp -= 2; this._floater(m.x, m.y, '-2', '#80ff80'); if (m.hp <= 0) { this._killMonster(m); continue; } }
        if (m.stun > 0) { m.stun--; continue; }
        if (m.frozen > 0) { m.frozen--; continue; }
        if (m.def.ai === 'slow') { m.slowCarry = (m.slowCarry||0) + 1; if (m.slowCarry < 2) continue; m.slowCarry = 0; }
        if (m.def.regen) m.hp = Math.min(m.maxHp, m.hp + m.def.regen);

        const dist = Math.hypot(m.x - this.player.x, m.y - this.player.y);
        if (!m.awake) {
          if (dist < 8) m.awake = true;
          else {
            const d = DIRS4[this._rand(4)];
            const nx = m.x + d[0], ny = m.y + d[1];
            if (!this._blocked(nx, ny)) { m.x = nx; m.y = ny; }
            continue;
          }
        }
        // ranged
        if ((m.def.ai === 'breather' || m.def.breath) && dist <= 4 && (m.breathCd||0) <= 0 && this._los(m, this.player)) {
          const dmg = 9 + this._rand(5);
          this.player.hp -= Math.max(1, dmg - (this.player.arm ? this.player.arm.def : 0));
          this._floater(this.player.x, this.player.y, '-'+dmg, '#ff7030');
          this._effect('beam', { from:[m.x, m.y], to:[this.player.x, this.player.y], color:'#ff7030' }, 0.3);
          this._addLog(`The ${m.def.name} breathes fire. ${dmg} dmg.`);
          m.breathCd = 4; this.shake = 0.3;
          if (this.player.hp <= 0) { this._die(m.def.name); return; }
          continue;
        }
        if (m.breathCd > 0) m.breathCd--;
        if (m.def.ai === 'caster' && dist >= 2 && dist <= 8 && this._los(m, this.player)) {
          const dmg = 7 + this._rand(5);
          this.player.hp -= Math.max(1, dmg - (this.player.arm ? this.player.arm.def : 0));
          this._floater(this.player.x, this.player.y, '-'+dmg, '#a0e0ff');
          this._effect('beam', { from:[m.x, m.y], to:[this.player.x, this.player.y], color:'#a0e0ff' }, 0.25);
          this._addLog(`The ${m.def.name} hurls a bolt. ${dmg} dmg.`);
          if (this.player.hp <= 0) { this._die(m.def.name); return; }
          continue;
        }
        if (m.def.ai === 'erratic' && this._rand(3) === 0) {
          const d = DIRS8[this._rand(8)];
          const nx = m.x + d[0], ny = m.y + d[1];
          if (!this._blocked(nx, ny)) { m.x = nx; m.y = ny; }
          continue;
        }
        const ax = Math.abs(m.x - this.player.x), ay = Math.abs(m.y - this.player.y);
        if (ax <= 1 && ay <= 1 && (ax + ay > 0)) {
          this._attack(m, this.player);
          if (this.player.hp <= 0) return;
          continue;
        }
        const sx = Math.sign(this.player.x - m.x), sy = Math.sign(this.player.y - m.y);
        const tries = [[sx, sy], [sx, 0], [0, sy]];
        if (m.confuse > 0) { m.confuse--; tries.reverse(); }
        let moved = false;
        for (const t of tries) {
          const nx = m.x + t[0], ny = m.y + t[1];
          if ((t[0] || t[1]) && !this._blocked(nx, ny)) { m.x = nx; m.y = ny; moved = true; break; }
        }
        if (!moved && this._rand(3) === 0) {
          const d = DIRS4[this._rand(4)];
          const nx = m.x + d[0], ny = m.y + d[1];
          if (!this._blocked(nx, ny)) { m.x = nx; m.y = ny; }
        }
      }
    }
    _los(a, b) {
      let x0 = a.x, y0 = a.y, x1 = b.x, y1 = b.y;
      const dx = Math.abs(x1-x0), dy = Math.abs(y1-y0);
      const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let err = dx - dy;
      while (!(x0 === x1 && y0 === y1)) {
        if (!(x0 === a.x && y0 === a.y) && (this._tile(x0, y0) === T_WALL || this._tile(x0, y0) === T_DOOR_C)) return false;
        const e2 = 2*err;
        if (e2 > -dy) { err -= dy; x0 += sx; }
        if (e2 < dx)  { err += dx; y0 += sy; }
      }
      return true;
    }

    // ---------- altars ----------
    _pray() {
      this._prayed = true;
      const roll = this.rng();
      if (roll < 0.25) { this.player.maxHp += 5; this.player.hp = this.player.maxHp; this._addLog('A blessing. Max HP +5.'); }
      else if (roll < 0.45) { this.player.atk += 2; this._addLog('Your arm feels strong. +2 ATK.'); }
      else if (roll < 0.6) { this.player.def += 1; this._addLog('Your skin hardens. +1 DEF.'); }
      else if (roll < 0.75) { if (this.player.wep) { this.player.wep.atk += 2; this._addLog(`${this.player.wep.name} enchanted.`); } }
      else if (roll < 0.9) { this.player.gold += 30 + this._rand(40); this._addLog('Coins rain down.'); }
      else { this._addLog('The altar curses you!'); this.player.maxHp -= 3; this.player.hp = Math.min(this.player.hp, this.player.maxHp); }
    }

    // ---------- items helpers ----------
    _rollItem(depth, x, y) {
      const roll = this.rng();
      if (roll < 0.28) {
        return { kind:'potion', def: this._weighted(POTIONS, p=>(p.dMin||1)<=depth), identified:false, x, y };
      } else if (roll < 0.48) {
        return { kind:'scroll', def: this._weighted(SCROLLS, s=>(s.dMin||1)<=depth), identified:false, x, y };
      } else if (roll < 0.64) {
        return { kind:'weapon', def: Object.assign({}, this._weighted(WEAPONS, w=>(w.dMin||1)<=depth)), identified:false, x, y };
      } else if (roll < 0.78) {
        return { kind:'armor', def: Object.assign({}, this._weighted(ARMORS, a=>(a.dMin||1)<=depth)), identified:false, x, y };
      } else if (roll < 0.9) {
        return { kind:'food', def: this._weighted(FOODS), identified:true, x, y };
      } else {
        return { kind:'gold', amount: 8 + this._rand(12 + depth*4), x, y };
      }
    }
    _itemName(it) {
      if (it.kind === 'gold') return `${it.amount} gold`;
      if (it.kind === 'potion') return (it.identified || this.identified[it.def.id]) ? it.def.name : this.potionFlavors[it.def.id];
      if (it.kind === 'scroll') return (it.identified || this.identified[it.def.id]) ? it.def.name : this.scrollTitles[it.def.id];
      return it.def.name;
    }

    // ---------- effects / floaters ----------
    _floater(x, y, text, color) { this.floaters.push({ x, y, text, color, t: 0 }); }
    _effect(type, data, max) { this.effects.push({ type, data, t:0, max: max || 0.5 }); }

    _addLog(s) { this.log.push(s); if (this.log.length > 120) this.log.shift(); }

    _loadScore() { try { return parseInt(localStorage.getItem('depths_hiscore')||'0',10) || 0; } catch(_) { return 0; } }
    _saveScore(s) { try { localStorage.setItem('depths_hiscore', String(s)); } catch(_) {} }

    // ======================================================
    //                        DRAW
    // ======================================================
    _draw() {
      const ctx = this.ctx;
      const W = this.canvas.width, H = this.canvas.height;
      ctx.fillStyle = '#07070c';
      ctx.fillRect(0, 0, W, H);
      if (this.scene === 'classpick') return this._drawClassPick();
      if (!this.dungeon) return;

      const shakeX = (this.rng() - 0.5) * this.shake * 8;
      const shakeY = (this.rng() - 0.5) * this.shake * 8;
      const ox = Math.floor((W - COLS * TILE) / 2) + shakeX;
      const oy = 8 + shakeY;

      this._drawMap(ox, oy);
      this._drawItems(ox, oy);
      this._drawShopkeeper(ox, oy);
      this._drawMonsters(ox, oy);
      this._drawPlayer(ox, oy);
      this._drawEffects(ox, oy);
      this._drawFloaters(ox, oy);
      this._drawHoverInfo(ox, oy);

      this._drawHud(Math.floor((W - COLS*TILE) / 2), 8 + ROWS * TILE + 4, COLS * TILE);
      this._drawMinimap(W - 200, 14);

      if (this.scene === 'dead') this._drawOverlay('YOU HAVE DIED', '#ff5050', 'ENTER to retry.');
      if (this.scene === 'won') this._drawOverlay('VICTORY', '#66ff88', 'Heartstone recovered. ENTER.');
      if (this.scene === 'invview') this._drawInventory();
    }

    _drawMap(ox, oy) {
      const ctx = this.ctx;
      const { map, seen, vis } = this.dungeon;
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          const i = y * COLS + x;
          if (!seen[i]) continue;
          const t = map[i];
          const visible = vis[i];
          const tx = ox + x * TILE, ty = oy + y * TILE;
          // base fill
          let fill = '#15110e';
          if (t === T_FLOOR) fill = '#2a231c';
          else if (t === T_WALL) fill = '#44382c';
          else if (t === T_DOOR_C) fill = '#5a3a1e';
          else if (t === T_DOOR_O) fill = '#3a2812';
          else if (t === T_STAIRS_DN || t === T_STAIRS_UP) fill = '#443020';
          else if (t === T_ALTAR) fill = '#3a2018';
          else if (t === T_SHOP_MAT) fill = '#4a2a14';
          if (!visible) {
            // darken
            fill = this._mix(fill, '#0b0b12', 0.55);
          }
          ctx.fillStyle = fill;
          ctx.fillRect(tx, ty, TILE, TILE);
          // decoration
          if (t === T_WALL) {
            // brick seam
            ctx.fillStyle = visible ? '#2e2418' : '#1a160f';
            ctx.fillRect(tx, ty + TILE - 2, TILE, 1);
            ctx.fillRect(tx + (x%2===0?0:TILE/2), ty, 1, TILE);
          } else if (t === T_FLOOR) {
            if (((x*911) ^ (y*1013)) % 7 === 0) {
              ctx.fillStyle = visible ? '#3a3020' : '#1e1b14';
              ctx.fillRect(tx + 4, ty + 4, 2, 2);
            }
          } else if (t === T_DOOR_C) {
            ctx.fillStyle = visible ? '#7a4a20' : '#2c1d10';
            ctx.fillRect(tx + 3, ty + 3, TILE - 6, TILE - 6);
            ctx.fillStyle = '#ffd86b';
            if (visible) ctx.fillRect(tx + TILE - 7, ty + TILE/2 - 1, 2, 2);
          } else if (t === T_DOOR_O) {
            ctx.fillStyle = visible ? '#6a3818' : '#281810';
            ctx.fillRect(tx, ty, 4, TILE);
            ctx.fillRect(tx + TILE - 4, ty, 4, TILE);
          } else if (t === T_STAIRS_DN) {
            ctx.fillStyle = visible ? '#ffcc66' : '#6a5030';
            ctx.fillRect(tx + 4, ty + 4, 12, 2);
            ctx.fillRect(tx + 6, ty + 8, 10, 2);
            ctx.fillRect(tx + 8, ty + 12, 8, 2);
          } else if (t === T_STAIRS_UP) {
            ctx.fillStyle = visible ? '#ffcc66' : '#6a5030';
            ctx.fillRect(tx + 4, ty + 14, 12, 2);
            ctx.fillRect(tx + 6, ty + 10, 10, 2);
            ctx.fillRect(tx + 8, ty + 6, 8, 2);
          } else if (t === T_ALTAR) {
            // glowing rune
            const pulse = (Math.sin(this.time * 3) + 1) * 0.5;
            ctx.fillStyle = visible ? '#ff8030' : '#3a1810';
            ctx.fillRect(tx + 4, ty + 6, 12, 10);
            if (visible) {
              ctx.fillStyle = `rgba(255,200,80,${0.4 + pulse*0.4})`;
              ctx.fillRect(tx + 7, ty + 8, 6, 6);
            }
          } else if (t === T_SHOP_MAT) {
            if (visible) {
              ctx.fillStyle = '#702818';
              ctx.fillRect(tx + 2, ty + 2, TILE - 4, TILE - 4);
              ctx.fillStyle = '#902818';
              ctx.fillRect(tx + 3, ty + 3, TILE - 6, TILE - 6);
            }
          }
        }
      }
    }

    _drawItems(ox, oy) {
      const ctx = this.ctx;
      for (const it of this.items) {
        const vis = this.dungeon.vis[it.y*COLS+it.x];
        const seen = this.dungeon.seen[it.y*COLS+it.x];
        if (!seen) continue;
        if (!vis && !it.forsale) continue; // hide non-shop items in fog
        const tx = ox + it.x * TILE, ty = oy + it.y * TILE;
        const alpha = vis ? 1 : 0.5;
        ctx.globalAlpha = alpha;
        this._drawItemSprite(it, tx, ty);
        ctx.globalAlpha = 1;
        if (it.forsale && vis) {
          ctx.fillStyle = '#ffd86b';
          ctx.font = 'bold 10px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(it.forsale+'g', tx + TILE/2, ty - 2);
        }
      }
    }

    _drawItemSprite(it, tx, ty) {
      const ctx = this.ctx;
      const c = TILE/2;
      if (it.kind === 'gold') {
        const pulse = 0.5 + 0.5 * Math.sin(this.time * 4 + it.x + it.y);
        ctx.fillStyle = '#b08028';
        ctx.beginPath(); ctx.arc(tx+c, ty+c, 5, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = `rgba(255,220,100,${0.4+0.4*pulse})`;
        ctx.beginPath(); ctx.arc(tx+c-1, ty+c-1, 3, 0, Math.PI*2); ctx.fill();
      } else if (it.kind === 'potion') {
        ctx.fillStyle = '#6a4028';
        ctx.fillRect(tx+c-3, ty+c-7, 6, 3); // neck
        const col = this._potionColor(it);
        ctx.fillStyle = col;
        ctx.fillRect(tx+c-5, ty+c-4, 10, 9);
        ctx.fillStyle = this._mix(col, '#ffffff', 0.4);
        ctx.fillRect(tx+c-4, ty+c-3, 2, 2);
      } else if (it.kind === 'scroll') {
        ctx.fillStyle = '#d8c090';
        ctx.fillRect(tx+c-6, ty+c-5, 12, 10);
        ctx.fillStyle = '#6a4028';
        ctx.fillRect(tx+c-7, ty+c-5, 2, 10);
        ctx.fillRect(tx+c+5, ty+c-5, 2, 10);
        ctx.fillStyle = '#6a4028';
        ctx.fillRect(tx+c-4, ty+c-2, 8, 1);
        ctx.fillRect(tx+c-4, ty+c, 6, 1);
        ctx.fillRect(tx+c-4, ty+c+2, 8, 1);
      } else if (it.kind === 'weapon') {
        ctx.fillStyle = '#c0c0d0';
        ctx.fillRect(tx+c-1, ty+2, 3, 10);
        ctx.fillStyle = '#ffe09a';
        ctx.fillRect(tx+c-3, ty+11, 7, 2);
        ctx.fillStyle = '#804020';
        ctx.fillRect(tx+c-1, ty+13, 3, 4);
      } else if (it.kind === 'armor') {
        ctx.fillStyle = '#6a6aa0';
        ctx.fillRect(tx+c-5, ty+c-4, 10, 10);
        ctx.fillStyle = '#8a8ac0';
        ctx.fillRect(tx+c-3, ty+c-2, 2, 6);
        ctx.fillRect(tx+c+1, ty+c-2, 2, 6);
      } else if (it.kind === 'food') {
        ctx.fillStyle = '#c0803a';
        ctx.beginPath(); ctx.ellipse(tx+c, ty+c+1, 7, 5, 0, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#e0a060';
        ctx.fillRect(tx+c-4, ty+c-2, 3, 2);
      }
    }

    _potionColor(it) {
      // stable per flavor
      const flavor = this.potionFlavors[it.def.id] || 'red potion';
      const first = flavor.split(' ')[0];
      const map = { red:'#d03030', blue:'#3060d0', green:'#30a030', amber:'#d08030', violet:'#8030d0', cloudy:'#9090c0', fizzing:'#70d0d0', silver:'#c0c0e0', black:'#303040', golden:'#d0a030', pink:'#d080a0', emerald:'#30c070' };
      return map[first] || '#c050a0';
    }

    _drawShopkeeper(ox, oy) {
      if (!this.shopkeeper) return;
      const s = this.shopkeeper;
      if (!this.dungeon.vis[s.y*COLS+s.x]) return;
      const ctx = this.ctx;
      const tx = ox + s.x * TILE, ty = oy + s.y * TILE;
      // robe
      ctx.fillStyle = '#603010';
      ctx.fillRect(tx+4, ty+8, TILE-8, 10);
      // head
      ctx.fillStyle = '#d0a080';
      ctx.fillRect(tx+6, ty+2, TILE-12, 6);
      // gold glint
      ctx.fillStyle = '#ffd86b';
      ctx.fillRect(tx+7, ty+4, 2, 2);
      ctx.fillRect(tx+11, ty+4, 2, 2);
    }

    _drawMonsters(ox, oy) {
      const ctx = this.ctx;
      for (const m of this.monsters) {
        if (!this.dungeon.vis[m.y*COLS+m.x]) continue;
        const tx = ox + m.x * TILE, ty = oy + m.y * TILE;
        this._drawMonsterSprite(m, tx, ty);
        // status
        if (m.hp < m.maxHp) {
          const bw = TILE - 4, pct = m.hp / m.maxHp;
          ctx.fillStyle = '#222'; ctx.fillRect(tx + 2, ty - 2, bw, 2);
          ctx.fillStyle = pct > 0.5 ? '#5ab060' : pct > 0.25 ? '#e0b040' : '#e04040';
          ctx.fillRect(tx + 2, ty - 2, bw * pct, 2);
        }
        if (m.frozen > 0) { ctx.strokeStyle='#a0e0ff'; ctx.lineWidth=2; ctx.strokeRect(tx+1, ty+1, TILE-2, TILE-2); }
        if (m.burn > 0) { ctx.fillStyle = 'rgba(255,120,40,0.35)'; ctx.fillRect(tx, ty, TILE, TILE); }
      }
    }

    _drawMonsterSprite(m, tx, ty) {
      const ctx = this.ctx;
      const c = TILE/2;
      const col = m.def.col;
      const name = m.def.name;
      // generic body oval
      ctx.fillStyle = col;
      if (name === 'rat') {
        ctx.beginPath(); ctx.ellipse(tx+c, ty+c+2, 7, 4, 0, 0, Math.PI*2); ctx.fill();
        ctx.fillRect(tx+c+5, ty+c, 3, 2);
        ctx.fillStyle = '#000'; ctx.fillRect(tx+c-4, ty+c, 1, 1); ctx.fillRect(tx+c-6, ty+c, 1, 1);
      } else if (name === 'bat') {
        const flap = Math.sin(this.time*10 + m.x)*2;
        ctx.beginPath(); ctx.moveTo(tx+c, ty+c); ctx.lineTo(tx+c-8, ty+c-2+flap); ctx.lineTo(tx+c-4, ty+c+4); ctx.fill();
        ctx.beginPath(); ctx.moveTo(tx+c, ty+c); ctx.lineTo(tx+c+8, ty+c-2-flap); ctx.lineTo(tx+c+4, ty+c+4); ctx.fill();
        ctx.fillRect(tx+c-1, ty+c-2, 3, 5);
      } else if (name === 'spider') {
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(tx+c, ty+c, 5, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = col; ctx.lineWidth = 1;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          ctx.beginPath(); ctx.moveTo(tx+c, ty+c); ctx.lineTo(tx+c + Math.cos(a)*8, ty+c + Math.sin(a)*6); ctx.stroke();
        }
        ctx.fillStyle = '#f00'; ctx.fillRect(tx+c-2, ty+c-1, 1, 1); ctx.fillRect(tx+c+1, ty+c-1, 1, 1);
      } else if (name === 'goblin' || name === 'kobold' || name === 'orc' || name === 'gnoll') {
        ctx.fillRect(tx+c-5, ty+6, 10, 10); // body
        ctx.fillStyle = this._mix(col, '#ffffff', 0.2);
        ctx.fillRect(tx+c-4, ty+3, 8, 5); // head
        ctx.fillStyle = '#000'; ctx.fillRect(tx+c-2, ty+5, 1, 1); ctx.fillRect(tx+c+1, ty+5, 1, 1);
        // weapon
        ctx.fillStyle = '#c0c0d0'; ctx.fillRect(tx+c+5, ty+4, 2, 8);
      } else if (name === 'skeleton') {
        ctx.fillStyle = col;
        ctx.fillRect(tx+c-4, ty+3, 8, 5);
        ctx.fillRect(tx+c-3, ty+8, 6, 6);
        ctx.fillStyle = '#000'; ctx.fillRect(tx+c-2, ty+5, 1, 2); ctx.fillRect(tx+c+1, ty+5, 1, 2);
        ctx.fillStyle = col; ctx.fillRect(tx+c-5, ty+14, 10, 2);
      } else if (name === 'zombie') {
        ctx.fillRect(tx+c-5, ty+6, 10, 10);
        ctx.fillStyle = this._mix(col, '#000000', 0.3);
        ctx.fillRect(tx+c-4, ty+3, 8, 5);
        ctx.fillStyle = '#d03040'; ctx.fillRect(tx+c-2, ty+5, 1, 1); ctx.fillRect(tx+c+1, ty+5, 1, 1);
      } else if (name === 'wraith') {
        // translucent
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = col;
        for (let i = 0; i < 5; i++) {
          const yy = ty + 4 + i*2, xx = tx + c - 5 + Math.sin(this.time*3 + i)*2;
          ctx.fillRect(xx, yy, 10, 2);
        }
        ctx.globalAlpha = 1;
      } else if (name === 'troll') {
        ctx.fillRect(tx+c-6, ty+4, 12, 12);
        ctx.fillStyle = this._mix(col, '#000000', 0.3);
        ctx.fillRect(tx+c-5, ty+14, 3, 3); ctx.fillRect(tx+c+2, ty+14, 3, 3);
        ctx.fillStyle = '#b04040'; ctx.fillRect(tx+c-3, ty+7, 2, 2); ctx.fillRect(tx+c+1, ty+7, 2, 2);
      } else if (name === 'naga') {
        for (let i = 0; i < 5; i++) {
          const yy = ty + 3 + i*3, xx = tx + c - 3 + Math.sin(this.time*2 + i*0.7)*3;
          ctx.fillRect(xx, yy, 7, 2);
        }
        ctx.fillRect(tx+c-3, ty+2, 6, 4);
        ctx.fillStyle = '#f00'; ctx.fillRect(tx+c-1, ty+3, 1, 1); ctx.fillRect(tx+c+1, ty+3, 1, 1);
      } else if (name === 'drake' || name === 'demon') {
        ctx.fillRect(tx+c-7, ty+5, 14, 10);
        ctx.fillStyle = this._mix(col, '#000000', 0.3);
        ctx.fillRect(tx+c-8, ty+6, 3, 8); ctx.fillRect(tx+c+5, ty+6, 3, 8); // wings
        ctx.fillStyle = '#ffcc66';
        ctx.fillRect(tx+c-2, ty+7, 1, 1); ctx.fillRect(tx+c+1, ty+7, 1, 1);
      } else if (name === 'lich') {
        ctx.fillStyle = col;
        ctx.fillRect(tx+c-4, ty+7, 8, 8);
        ctx.fillStyle = '#fff';
        ctx.fillRect(tx+c-3, ty+3, 6, 5);
        ctx.fillStyle = '#4080c0'; ctx.fillRect(tx+c-2, ty+5, 1, 1); ctx.fillRect(tx+c+1, ty+5, 1, 1);
      } else if (name === 'minotaur') {
        ctx.fillRect(tx+c-6, ty+5, 12, 11);
        ctx.fillStyle = '#eee';
        ctx.fillRect(tx+c-5, ty+3, 2, 3); ctx.fillRect(tx+c+3, ty+3, 2, 3); // horns
        ctx.fillStyle = '#000'; ctx.fillRect(tx+c-2, ty+7, 1, 1); ctx.fillRect(tx+c+1, ty+7, 1, 1);
      } else if (name === 'Ashen King') {
        // crown
        ctx.fillStyle = '#ffcc66';
        ctx.fillRect(tx+c-7, ty+1, 14, 2);
        ctx.fillRect(tx+c-7, ty+3, 1, 2); ctx.fillRect(tx+c-3, ty+3, 1, 2); ctx.fillRect(tx+c+2, ty+3, 1, 2); ctx.fillRect(tx+c+6, ty+3, 1, 2);
        // body
        ctx.fillStyle = col;
        ctx.fillRect(tx+c-7, ty+5, 14, 12);
        ctx.fillStyle = '#ff3010';
        ctx.fillRect(tx+c-3, ty+8, 2, 2); ctx.fillRect(tx+c+1, ty+8, 2, 2);
      } else {
        // fallback ascii
        ctx.fillStyle = col; ctx.font = 'bold 16px monospace'; ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText(m.def.ch, tx+c, ty+c+1);
      }
    }

    _drawPlayer(ox, oy) {
      const ctx = this.ctx;
      const tx = ox + this.player.x * TILE, ty = oy + this.player.y * TILE;
      const c = TILE/2;
      const cls = this.player.cls;
      // body
      ctx.fillStyle = cls === CLASSES.warrior ? '#c88060' : cls === CLASSES.rogue ? '#403040' : '#4060a0';
      ctx.fillRect(tx+c-5, ty+6, 10, 10);
      // head
      ctx.fillStyle = '#e0b080';
      ctx.fillRect(tx+c-3, ty+3, 6, 5);
      // hair
      ctx.fillStyle = cls === CLASSES.warrior ? '#d0b070' : cls === CLASSES.rogue ? '#202020' : '#3060a0';
      ctx.fillRect(tx+c-3, ty+2, 6, 2);
      // eyes
      ctx.fillStyle = '#000';
      ctx.fillRect(tx+c-2, ty+5, 1, 1); ctx.fillRect(tx+c+1, ty+5, 1, 1);
      // weapon
      if (this.player.wep) {
        ctx.fillStyle = '#c0c0d0';
        ctx.fillRect(tx+c+4, ty+4, 2, 8);
        ctx.fillStyle = '#ffe09a';
        ctx.fillRect(tx+c+3, ty+11, 4, 1);
      }
      // heartstone aura
      if (this.heartstoneHeld) {
        const pulse = 0.5 + 0.5 * Math.sin(this.time * 5);
        ctx.strokeStyle = `rgba(150,220,255,${0.4+0.4*pulse})`;
        ctx.lineWidth = 2;
        ctx.strokeRect(tx + 1, ty + 1, TILE - 2, TILE - 2);
      }
    }

    _drawEffects(ox, oy) {
      const ctx = this.ctx;
      for (const e of this.effects) {
        const k = 1 - (e.t / e.max);
        if (e.type === 'beam') {
          const [ax, ay] = e.data.from, [bx, by] = e.data.to;
          ctx.strokeStyle = e.data.color;
          ctx.globalAlpha = k;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(ox + ax*TILE + TILE/2, oy + ay*TILE + TILE/2);
          ctx.lineTo(ox + bx*TILE + TILE/2, oy + by*TILE + TILE/2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        } else if (e.type === 'burst') {
          const r = e.data.r * TILE * (1 - k*0.2);
          ctx.strokeStyle = e.data.color;
          ctx.globalAlpha = k;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(ox + e.data.x*TILE + TILE/2, oy + e.data.y*TILE + TILE/2, r, 0, Math.PI*2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
    }

    _drawFloaters(ox, oy) {
      const ctx = this.ctx;
      for (const f of this.floaters) {
        const k = f.t / 1.2;
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = f.color;
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(f.text, ox + f.x*TILE + TILE/2, oy + f.y*TILE + TILE/2 - k*18);
        ctx.globalAlpha = 1;
      }
    }

    _drawHoverInfo(ox, oy) {
      if (!this.mouseTile) return;
      const { x, y } = this.mouseTile;
      if (!this.dungeon.seen[y*COLS+x]) return;
      const ctx = this.ctx;
      // outline
      ctx.strokeStyle = 'rgba(255,216,107,0.7)';
      ctx.lineWidth = 1;
      ctx.strokeRect(ox + x*TILE + 0.5, oy + y*TILE + 0.5, TILE-1, TILE-1);
      const m = this._monAt(x, y);
      const items = this._itemsAt(x, y);
      let info = '';
      if (m && this.dungeon.vis[y*COLS+x]) info = `${m.def.name}  HP ${m.hp}/${m.maxHp}`;
      else if (items.length) info = items.map(i=>this._itemName(i) + (i.forsale?` (${i.forsale}g)`:'')).join(', ');
      else {
        const t = this._tile(x,y);
        if (t === T_STAIRS_DN) info = 'stairs down';
        else if (t === T_ALTAR) info = 'altar';
        else if (t === T_DOOR_C) info = 'closed door';
      }
      if (info) {
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.font = '12px monospace'; ctx.textAlign = 'left';
        const w = ctx.measureText(info).width + 10;
        ctx.fillRect(ox + x*TILE + TILE, oy + y*TILE - 4, w, 18);
        ctx.fillStyle = '#ffe0a0';
        ctx.fillText(info, ox + x*TILE + TILE + 5, oy + y*TILE + 8);
      }
    }

    _drawHud(x, y, w) {
      const ctx = this.ctx;
      const H = this.canvas.height;
      ctx.fillStyle = '#161018';
      ctx.fillRect(x, y, w, H - y - 8);
      ctx.strokeStyle = '#3a2e20'; ctx.strokeRect(x+0.5, y+0.5, w-1, H - y - 9);

      const p = this.player;
      const atk = p.atk + (p.wep?p.wep.atk:0) + (p.strBuff>0?2:0);
      const def = p.def + (p.arm?p.arm.def:0);

      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.font = 'bold 12px monospace';
      ctx.fillStyle = '#ffd86b';
      ctx.fillText(`${p.cls.name}  Lv ${p.level}  XP ${p.xp}/${p.xpNext}`, x + 8, y + 6);
      // bars
      this._drawBar(x + 200, y + 6, 140, 12, p.hp/p.maxHp, '#c04040', `HP ${p.hp}/${p.maxHp}`);
      if (p.cls.mp > 0) this._drawBar(x + 350, y + 6, 140, 12, p.mp/p.maxMp, '#4060c0', `MP ${p.mp}/${p.maxMp}`);
      this._drawBar(x + (p.cls.mp>0?500:350), y + 6, 140, 12, p.food/p.maxFood, '#a07040',
        p.food > p.maxFood*0.5 ? 'Fed' : p.food > p.maxFood*0.2 ? 'Hungry' : p.food > 0 ? 'Starving' : 'STARVING!');

      ctx.fillStyle = '#cab090';
      ctx.font = '12px monospace';
      ctx.fillText(`ATK ${atk}  DEF ${def}  ◇ ${p.gold}  Floor ${this.floor}${this.heartstoneHeld?'  ✦HS':''}`, x + 8, y + 24);

      // Inventory row
      let ix = x + 8, iy = y + 42;
      for (let i = 0; i < 12; i++) {
        const it = p.inv[i];
        const col = it ? ((it.kind==='weapon' && it.def === p.wep) ? '#ffe08a' : (it.kind==='armor' && it.def === p.arm) ? '#80a0ff' : '#cab090') : '#554436';
        ctx.fillStyle = col;
        const lbl = it ? `${i+1}:${this._shortItemLabel(it)}` : `${i+1}:·`;
        ctx.fillText(lbl, ix, iy);
        ix += 82;
        if (i === 5) { ix = x + 8; iy += 16; }
      }
      ctx.fillStyle = '#888'; ctx.font = '10px monospace';
      let hint = '1-9 use · G grab · > descend · I inv · click to move/attack';
      if (p.cls === CLASSES.mage) hint += ' · Q missile E fireball R freeze T blink';
      ctx.fillText(hint, x + 8, y + 74);

      // log
      const logX = x + w - 360, logY = y + 6, logW = 354, logH = H - y - 20;
      ctx.fillStyle = '#0c0a10';
      ctx.fillRect(logX, logY, logW, logH);
      ctx.strokeStyle = '#2a2020'; ctx.strokeRect(logX+0.5, logY+0.5, logW-1, logH-1);
      ctx.fillStyle = '#d8c090';
      ctx.font = '11px monospace';
      const shown = this.log.slice(-6);
      for (let i = 0; i < shown.length; i++) {
        ctx.fillStyle = i === shown.length-1 ? '#ffe8b0' : '#998060';
        ctx.fillText(shown[i], logX + 6, logY + 6 + i * 13);
      }
    }

    _drawBar(x, y, w, h, pct, color, label) {
      const ctx = this.ctx;
      ctx.fillStyle = '#252028';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w * Math.max(0, Math.min(1, pct)), h);
      ctx.strokeStyle = '#000'; ctx.strokeRect(x+0.5, y+0.5, w-1, h-1);
      ctx.fillStyle = '#ffe0a0'; ctx.font = 'bold 10px monospace'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(label, x + w/2, y + h/2 + 1);
      ctx.textAlign = 'left';
    }

    _drawMinimap(x, y) {
      if (!this.dungeon) return;
      const ctx = this.ctx;
      const px = 3;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x, y, COLS*px + 6, ROWS*px + 6);
      for (let yy = 0; yy < ROWS; yy++) {
        for (let xx = 0; xx < COLS; xx++) {
          const i = yy*COLS + xx;
          if (!this.dungeon.seen[i]) continue;
          const t = this.dungeon.map[i];
          let col = '#222';
          if (t === T_WALL) col = '#554030';
          else if (t === T_FLOOR || t === T_DOOR_O || t === T_SHOP_MAT) col = '#706050';
          else if (t === T_DOOR_C) col = '#c88040';
          else if (t === T_STAIRS_DN) col = '#ffcc66';
          else if (t === T_ALTAR) col = '#ff8030';
          if (!this.dungeon.vis[i]) col = this._mix(col, '#000', 0.55);
          ctx.fillStyle = col;
          ctx.fillRect(x+3+xx*px, y+3+yy*px, px, px);
        }
      }
      // monsters as red dots
      for (const m of this.monsters) {
        if (!this.dungeon.vis[m.y*COLS+m.x]) continue;
        ctx.fillStyle = m.def === BOSS ? '#ff3030' : '#e06060';
        ctx.fillRect(x+3+m.x*px, y+3+m.y*px, px, px);
      }
      // player
      ctx.fillStyle = '#ffe08a';
      ctx.fillRect(x+3+this.player.x*px, y+3+this.player.y*px, px, px);
    }

    _drawInventory() {
      const ctx = this.ctx; const W = this.canvas.width, H = this.canvas.height;
      ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#1a1620'; ctx.fillRect(W/2-250, 60, 500, H-120);
      ctx.strokeStyle = '#ffd86b'; ctx.strokeRect(W/2-250, 60, 500, H-120);
      ctx.fillStyle = '#ffd86b'; ctx.font='bold 18px monospace'; ctx.textAlign='left'; ctx.textBaseline='top';
      ctx.fillText('INVENTORY', W/2-230, 76);
      ctx.font='13px monospace'; ctx.fillStyle = '#cab090';
      for (let i = 0; i < this.player.inv.length; i++) {
        const it = this.player.inv[i];
        const name = this._itemName(it);
        let note = '';
        if (it.kind === 'weapon') note = ` (+${it.def.atk} atk)`;
        if (it.kind === 'armor') note = ` (+${it.def.def} def)`;
        const equipped = (it.def === this.player.wep || it.def === this.player.arm) ? ' [EQUIPPED]' : '';
        ctx.fillStyle = equipped ? '#ffe08a' : '#cab090';
        ctx.fillText(`${i+1}. ${name}${note}${equipped}`, W/2-230, 110 + i*20);
      }
      ctx.fillStyle = '#888'; ctx.fillText('1-9 to use/equip · I or ESC to close', W/2-230, H - 80);
    }

    _shortItemLabel(it) {
      if (it.kind === 'potion') {
        const n = (it.identified || this.identified[it.def.id]) ? it.def.name.replace('potion of ','').slice(0,7) : this.potionFlavors[it.def.id].split(' ')[0].slice(0,7);
        return '!'+n;
      }
      if (it.kind === 'scroll') {
        const n = (it.identified || this.identified[it.def.id]) ? it.def.name.replace('scroll of ','').slice(0,7) : this.scrollTitles[it.def.id].split(' ')[2].slice(0,7);
        return '?'+n;
      }
      if (it.kind === 'weapon') return ')'+it.def.name.slice(0,8);
      if (it.kind === 'armor')  return '['+it.def.name.slice(0,8);
      if (it.kind === 'food')   return '%'+it.def.name.slice(0,8);
      return it.kind;
    }

    _drawClassPick() {
      const ctx = this.ctx;
      const W = this.canvas.width, H = this.canvas.height;
      ctx.fillStyle = '#0a0a14'; ctx.fillRect(0,0,W,H);
      ctx.fillStyle = '#ffcc66';
      ctx.font = 'bold 48px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('DEPTHS', W/2, 100);
      ctx.font = '14px monospace'; ctx.fillStyle = '#c0b090';
      ctx.fillText('Retrieve the Heartstone from the Ashen King.   8 floors.   One life.', W/2, 140);
      if (this.highscore > 0) {
        ctx.fillStyle = '#8a6030';
        ctx.fillText(`Best score: ${this.highscore}`, W/2, 165);
      }

      const keys = Object.keys(CLASSES);
      const start = H/2 - 50;
      for (let i = 0; i < keys.length; i++) {
        const c = CLASSES[keys[i]];
        const y = start + i * 70;
        const hover = (this.mouseTile && this.mousePx && this.mousePx.y >= y - 30 && this.mousePx.y <= y + 30);
        const sel = i === this.pickIdx || hover;
        ctx.fillStyle = sel ? '#3a2818' : '#1a1410';
        ctx.fillRect(W/2 - 200, y - 30, 400, 60);
        ctx.strokeStyle = sel ? '#ffcc66' : '#3a2e20';
        ctx.strokeRect(W/2 - 200 + 0.5, y - 30 + 0.5, 399, 59);
        ctx.fillStyle = '#ffd86b';
        ctx.font = 'bold 18px monospace'; ctx.textAlign='left';
        ctx.fillText(`${i+1}. ${c.name}`, W/2 - 180, y - 8);
        ctx.fillStyle = '#cab090'; ctx.font = '11px monospace';
        ctx.fillText(c.desc, W/2 - 180, y + 10);
        ctx.fillStyle = '#998060'; ctx.font = '11px monospace';
        ctx.fillText(`HP ${c.hp}  MP ${c.mp}  ATK ${c.atk}  DEF ${c.def}`, W/2 + 40, y - 8);
      }
      ctx.fillStyle = '#888'; ctx.font = '12px monospace'; ctx.textAlign='center';
      ctx.fillText('↑↓ or W/S to select · Enter or click to begin', W/2, H - 40);
    }

    _drawOverlay(title, color, sub) {
      const ctx = this.ctx;
      const W = this.canvas.width, H = this.canvas.height;
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = color;
      ctx.font = 'bold 56px monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(title, W/2, H/2 - 30);
      ctx.fillStyle = '#d8c090';
      ctx.font = '16px monospace';
      ctx.fillText(sub, W/2, H/2 + 20);
      if (this.player) {
        ctx.fillStyle = '#998060';
        ctx.fillText(`Floor ${this.floor}  Lv ${this.player.level}  ${this.player.gold}g`, W/2, H/2 + 50);
      }
    }

    _mix(a, b, k) {
      const ah = this._hex(a), bh = this._hex(b);
      const r = Math.floor(ah[0]*(1-k) + bh[0]*k);
      const g = Math.floor(ah[1]*(1-k) + bh[1]*k);
      const bb = Math.floor(ah[2]*(1-k) + bh[2]*k);
      return `rgb(${r},${g},${bb})`;
    }
    _hex(c) {
      if (c.startsWith('rgb')) {
        const m = c.match(/\d+/g); return [parseInt(m[0]), parseInt(m[1]), parseInt(m[2])];
      }
      const n = parseInt(c.slice(1), 16);
      return [(n>>16)&0xff, (n>>8)&0xff, n&0xff];
    }
  }

  NDP.attachGame('depths', DepthsGame);
})();
