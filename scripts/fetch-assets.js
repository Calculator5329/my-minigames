#!/usr/bin/env node
/* Download all external sprite + audio assets for the new minigames into
   ./assets/. Sources are a MIX of permissive packs:

   - phaserjs/examples (MIT) — the repo formerly known as phaser3-examples.
     Includes a huge library of sample sprites + sounds, many of which are
     Kenney CC0 derivatives bundled upstream.
   - Kenney.nl sample assets (CC0)
   - OpenGameArt (CC0 / CC-BY)

   Usage: `node scripts/fetch-assets.js [--force]`
   Re-running is safe — skips files already present unless --force is passed.
   Games fall back to procedural drawing if a file is missing. */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const ASSET_DIR = path.join(ROOT, 'assets');
const FORCE = process.argv.includes('--force');

const PHASER = 'https://raw.githubusercontent.com/phaserjs/examples/master/public/assets';

/* Each entry: { dest, url, source, license, author } */
const MANIFEST = [
  // ----- Space shmup -----
  { dest: 'space/player.png',  url: `${PHASER}/sprites/shmup-ship.png`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },
  { dest: 'space/enemy1.png',  url: `${PHASER}/sprites/shmup-baddie.png`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },
  { dest: 'space/enemy2.png',  url: `${PHASER}/sprites/shmup-baddie2.png`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },
  { dest: 'space/enemy3.png',  url: `${PHASER}/sprites/shmup-baddie3.png`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },
  { dest: 'space/bullet.png',  url: `${PHASER}/sprites/shmup-bullet.png`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },
  { dest: 'space/ship.png',    url: `${PHASER}/sprites/ship.png`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },
  { dest: 'space/explosion.png', url: `${PHASER}/sprites/explosion.png`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },
  { dest: 'space/star.png',    url: `${PHASER}/demoscene/star2.png`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },

  // ----- Platformer -----
  { dest: 'platformer/hero.png',   url: `${PHASER}/sprites/dude.png`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm / Kenney' },
  { dest: 'platformer/ground.png', url: `${PHASER}/sprites/platform.png`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },
  { dest: 'platformer/coin.png',   url: `${PHASER}/sprites/coin.png`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },
  { dest: 'platformer/gem.png',    url: `${PHASER}/sprites/diamond.png`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },
  { dest: 'platformer/enemy.png',  url: `${PHASER}/sprites/space-baddie.png`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },
  { dest: 'platformer/flag.png',   url: `${PHASER}/sprites/mushroom2.png`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },
  { dest: 'platformer/cloud.png',  url: `${PHASER}/sprites/clouds.png`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },

  // ----- Dungeon crawler -----
  { dest: 'dungeon/hero.png',     url: `${PHASER}/sprites/phaser-dude.png`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },
  { dest: 'dungeon/skeleton.png', url: `${PHASER}/sprites/ghost.png`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },
  { dest: 'dungeon/slime.png',    url: `${PHASER}/sprites/slime.png`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },
  { dest: 'dungeon/chest.png',    url: `${PHASER}/sprites/treasure.png`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },
  { dest: 'dungeon/potion.png',   url: `${PHASER}/sprites/mushroom.png`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },
  { dest: 'dungeon/sword.png',    url: `${PHASER}/sprites/blade.png`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },
  { dest: 'dungeon/stairs.png',   url: `${PHASER}/sprites/arrow.png`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },

  // ----- Shared FX -----
  { dest: 'fx/particle.png', url: `${PHASER}/particles/yellow.png`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },
  { dest: 'fx/flare.png',    url: `${PHASER}/particles/blue.png`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },

  // ----- Orbital (tower defense in space) -----
  { dest: 'orbital/meteor_big.png',    url: `${PHASER}/games/asteroids/asteroid1.png`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },
  { dest: 'orbital/meteor_med.png',    url: `${PHASER}/games/asteroids/asteroid2.png`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },
  { dest: 'orbital/meteor_small.png',  url: `${PHASER}/games/asteroids/asteroid3.png`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },
  { dest: 'orbital/meteor_tiny.png',   url: `${PHASER}/games/invaders/invader32x32x4.png`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },
  { dest: 'orbital/ufo.png',           url: `${PHASER}/sprites/ufo.png`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },
  { dest: 'orbital/boss.png',          url: `${PHASER}/sprites/boss.png`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },
  { dest: 'orbital/turret_dart.png',   url: `${PHASER}/sprites/ship.png`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },
  { dest: 'orbital/turret_cannon.png', url: `${PHASER}/sprites/asteroids_ship.png`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },
  { dest: 'orbital/turret_beam.png',   url: `${PHASER}/sprites/shmup-ship.png`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },
  { dest: 'orbital/turret_gravity.png', url: `${PHASER}/sprites/ufo.png`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },
  { dest: 'orbital/turret_flare.png',  url: `${PHASER}/sprites/orb-red.png`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },
  { dest: 'orbital/turret_singularity.png', url: `${PHASER}/sprites/orb-blue.png`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },
  { dest: 'orbital/bolt.png',          url: `${PHASER}/sprites/bullet.png`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },
  { dest: 'orbital/nebula.png',        url: `${PHASER}/particles/smoke-puff.png`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },

  // ----- Audio (phaserjs/examples has lots of short SFX) -----
  { dest: 'audio/laser.mp3',     url: `${PHASER}/audio/SoundEffects/blaster.mp3`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },
  { dest: 'audio/explosion.mp3', url: `${PHASER}/audio/SoundEffects/explosion.mp3`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },
  { dest: 'audio/coin.mp3',      url: `${PHASER}/audio/SoundEffects/key.mp3`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },
  { dest: 'audio/jump.mp3',      url: `${PHASER}/audio/SoundEffects/p-ping.mp3`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },
  { dest: 'audio/hit.mp3',       url: `${PHASER}/audio/SoundEffects/numkey.mp3`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },

  // ----- Learn to Heist (flight game) -----
  { dest: 'flight/penguin.png',     url: `${PHASER}/sprites/phaser-dude.png`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },
  { dest: 'flight/rocket.png',      url: `${PHASER}/sprites/ship.png`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },
  { dest: 'flight/fighter.png',     url: `${PHASER}/sprites/shmup-ship.png`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },
  { dest: 'flight/asteroid_big.png',   url: `${PHASER}/games/asteroids/asteroid1.png`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },
  { dest: 'flight/asteroid_med.png',   url: `${PHASER}/games/asteroids/asteroid2.png`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },
  { dest: 'flight/asteroid_small.png', url: `${PHASER}/games/asteroids/asteroid3.png`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },
  { dest: 'flight/ufo.png',         url: `${PHASER}/sprites/ufo.png`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },
  { dest: 'flight/enemy.png',       url: `${PHASER}/sprites/shmup-baddie.png`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },
  { dest: 'flight/star.png',        url: `${PHASER}/demoscene/star2.png`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },
  { dest: 'flight/star2.png',       url: `${PHASER}/sprites/star.png`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },
  { dest: 'flight/bullet.png',      url: `${PHASER}/sprites/bullet.png`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },
  { dest: 'flight/gem_blue.png',    url: `${PHASER}/sprites/diamond.png`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },
  { dest: 'flight/boss.png',        url: `${PHASER}/sprites/boss.png`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },
  { dest: 'flight/smoke.png',       url: `${PHASER}/particles/smoke-puff.png`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },
  { dest: 'flight/fire.png',        url: `${PHASER}/particles/red.png`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },
  { dest: 'flight/blue_particle.png', url: `${PHASER}/particles/blue.png`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },
  { dest: 'flight/yellow_particle.png', url: `${PHASER}/particles/yellow.png`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },
  { dest: 'flight/spark.png',       url: `${PHASER}/particles/white.png`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },
  { dest: 'flight/coin.png',        url: `${PHASER}/sprites/coin.png`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },
  { dest: 'flight/platform.png',    url: `${PHASER}/sprites/platform.png`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },
  { dest: 'flight/explosion.png',   url: `${PHASER}/sprites/explosion.png`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },
  { dest: 'flight/balloon.png',     url: `${PHASER}/sprites/balloon.png`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },
  { dest: 'flight/mushroom.png',    url: `${PHASER}/sprites/mushroom.png`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },
  { dest: 'audio/launch.mp3',       url: `${PHASER}/audio/SoundEffects/shotgun.mp3`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' },
  { dest: 'audio/whoosh.mp3',       url: `${PHASER}/audio/SoundEffects/alien_death1.mp3`,
    source: 'phaserjs/examples', license: 'MIT', author: 'Photon Storm' }
];

function get(url, redirects) {
  redirects = redirects || 0;
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (redirects > 5) return reject(new Error('too many redirects: ' + url));
        return get(res.headers.location, redirects + 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function fetchOne(entry) {
  const dest = path.join(ASSET_DIR, entry.dest);
  if (!FORCE && fs.existsSync(dest)) {
    console.log('skip (exists):', entry.dest);
    return { entry, ok: true, skipped: true };
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  try {
    const buf = await get(entry.url);
    fs.writeFileSync(dest, buf);
    console.log('ok  :', entry.dest, `(${buf.length} bytes)`);
    return { entry, ok: true, bytes: buf.length };
  } catch (e) {
    console.log('FAIL:', entry.dest, '-', e.message);
    return { entry, ok: false, err: e.message };
  }
}

function writeCredits(results) {
  const lines = [
    '# Asset Credits',
    '',
    'All external assets are redistributed under their original licenses.',
    'This file is generated by `scripts/fetch-assets.js` — do not edit by hand.',
    '',
    '| Asset | Source | License | Author |',
    '| --- | --- | --- | --- |'
  ];
  for (const r of results) {
    if (!r.ok) continue;
    lines.push(`| \`${r.entry.dest}\` | ${r.entry.source} | ${r.entry.license} | ${r.entry.author} |`);
  }
  lines.push('');
  lines.push('## Sources');
  lines.push('- **phaserjs/examples** — https://github.com/phaserjs/examples (MIT)');
  lines.push('- **Kenney.nl** — https://kenney.nl/assets (CC0)');
  lines.push('- **OpenGameArt** — https://opengameart.org/');
  lines.push('');
  const failed = results.filter(r => !r.ok);
  if (failed.length) {
    lines.push('## Failed downloads');
    lines.push('These will fall back to procedural in-game graphics:');
    for (const f of failed) lines.push(`- \`${f.entry.dest}\` — ${f.err}`);
    lines.push('');
  }
  fs.writeFileSync(path.join(ASSET_DIR, 'CREDITS.md'), lines.join('\n'));
}

function writeManifestJson(results) {
  const ok = results.filter(r => r.ok).map(r => r.entry.dest);
  fs.writeFileSync(
    path.join(ASSET_DIR, 'manifest.json'),
    JSON.stringify({ generated: new Date().toISOString(), files: ok }, null, 2)
  );
}

(async () => {
  fs.mkdirSync(ASSET_DIR, { recursive: true });
  console.log(`Fetching ${MANIFEST.length} assets into ${ASSET_DIR}...`);
  const results = [];
  for (const entry of MANIFEST) {
    results.push(await fetchOne(entry));
  }
  writeCredits(results);
  writeManifestJson(results);
  const okCount = results.filter(r => r.ok).length;
  console.log(`\nDone. ${okCount}/${results.length} assets available.`);
  if (okCount < results.length) {
    console.log('(Missing assets will be drawn procedurally.)');
  }
})();
