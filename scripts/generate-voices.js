#!/usr/bin/env node
/* Generate baked TTS voice samples for 418 Linden.

   Usage:
     TTS_API_KEY=sk-... node scripts/generate-voices.js
     TTS_PROVIDER=elevenlabs TTS_API_KEY=... node scripts/generate-voices.js
     TTS_PROVIDER=openai TTS_API_KEY=... node scripts/generate-voices.js

   Reads the call script by regex-parsing games/switchboard/content.js so we
   don't need a build step. Writes MP3s to assets/switchboard/voices/<id>.mp3.
   If a file already exists, it's skipped (pass --force to regenerate).

   Provider-specific voice mapping is in VOICE_MAP below — tweak to taste.
   Add --dry to print the list of lines without calling the API. */

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'assets', 'switchboard', 'voices');
const CONTENT = path.join(ROOT, 'games', 'switchboard', 'content.js');
const FORCE = process.argv.includes('--force');
const DRY = process.argv.includes('--dry');
const PROVIDER = process.env.TTS_PROVIDER || 'elevenlabs';
const KEY = process.env.TTS_API_KEY;

/* Per-voice hints per provider. These are suggestions — override in ENV:
   VOICE_halberd=abc123, etc. */
const VOICE_MAP = {
  elevenlabs: {
    halberd: 'EXAVITQu4vr4xnSDxMaL',     // Bella-ish (warm older woman)
    child:   'jsCqWAovK2LkecY7zXl4',     // Freya (young)
    crane:   'VR6AewLTigWG4xSOukaG',     // Arnold (upbeat male)
    doctor:  'onwK4e9ZLuTAKqWW03F9',     // Daniel (British clinical)
    weatherman: 'CYw3kZ02Hs0563khs1Fj',  // Dave (radio)
    you:     'pNInz6obpgDQGcFmaJgB',     // Adam (neutral)
    grocer:  'TxGEqnHWrfWFTfGW9XjX',     // Josh
    cabbie:  'AZnzlk1XvdvUeBnXmlld',     // Domi
    ma:      'ThT5KcBeYPX3keUQqHPh',     // Dorothy
    receptionist: 'XB0fDUnXU5powFXDhCwa' // Charlotte
  },
  openai: {
    halberd:'shimmer', child:'nova', crane:'onyx', doctor:'echo',
    weatherman:'fable', you:'alloy', grocer:'onyx', cabbie:'nova',
    ma:'shimmer', receptionist:'alloy'
  }
};

function parseContent() {
  const src = fs.readFileSync(CONTENT, 'utf8');
  /* Extract all { at: N, voice: 'x', request: ..., text: '...' } occurrences.
     We also grab Night 5 walkthrough lines and ending lines. */
  const out = [];
  const callRE = /\{\s*at:\s*(\d+)[^}]*?voice:\s*'(\w+)'[^}]*?text:\s*'((?:[^'\\]|\\.)*)'/gs;
  let m;
  // Night index tracking — rough: count `id: N` occurrences for nights.
  const nightOrder = [];
  const idRE = /id:\s*(\d+)/g;
  while ((m = idRE.exec(src))) nightOrder.push({ id: Number(m[1]), pos: m.index });

  let nightIdx = 0;
  while ((m = callRE.exec(src))) {
    // Determine night by nearest preceding `id: N`
    while (nightIdx + 1 < nightOrder.length && nightOrder[nightIdx + 1].pos < m.index) nightIdx++;
    const nightId = nightOrder[nightIdx] ? nightOrder[nightIdx].id : 1;
    const idx = out.filter(o => o.night === nightId).length;
    out.push({
      id: `n${nightId}_c${idx}`,
      night: nightId,
      voice: m[2],
      text: m[3].replace(/\\'/g, "'").replace(/\\"/g, '"')
    });
  }

  // Walkthrough lines — inside SB.NIGHT5.rooms, scraped by room.
  const roomBlockRE = /name:\s*'([^']+)',\s*description:[^,]+,\s*figure:[^,]+,\s*voice:\s*'(\w+)',\s*lines:\s*\[([\s\S]*?)\]/g;
  while ((m = roomBlockRE.exec(src))) {
    const room = m[1].toLowerCase();
    const voice = m[2];
    const lineRE = /'((?:[^'\\]|\\.)*)'/g;
    let lm, lineIdx = 0;
    while ((lm = lineRE.exec(m[3]))) {
      out.push({
        id: `walk_${room}_${lineIdx}`,
        night: 5,
        voice,
        text: lm[1].replace(/\\'/g, "'")
      });
      lineIdx++;
    }
  }

  // Ending narration (voice: 'you')
  const endingsRE = /endings:\s*\{([\s\S]*?)\}\s*\}/;
  const em = src.match(endingsRE);
  if (em) {
    const blockRE = /(\w+):\s*\[([\s\S]*?)\]/g;
    let bm;
    while ((bm = blockRE.exec(em[1]))) {
      const key = bm[1];
      const lineRE = /'((?:[^'\\]|\\.)*)'/g;
      let lm, i = 0;
      while ((lm = lineRE.exec(bm[2]))) {
        out.push({
          id: `ending_${key}_${i}`,
          night: 5,
          voice: 'you',
          text: lm[1].replace(/\\'/g, "'")
        });
        i++;
      }
    }
  }

  return out;
}

function httpsPost(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path, method: 'POST', headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}: ${Buffer.concat(chunks).toString('utf8').slice(0, 300)}`));
        }
        resolve(Buffer.concat(chunks));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function ttsElevenLabs(text, voiceId) {
  const body = JSON.stringify({
    text,
    model_id: 'eleven_monolingual_v1',
    voice_settings: { stability: 0.55, similarity_boost: 0.75 }
  });
  return httpsPost('api.elevenlabs.io', `/v1/text-to-speech/${voiceId}`, {
    'xi-api-key': KEY,
    'Content-Type': 'application/json',
    'Accept': 'audio/mpeg',
    'Content-Length': Buffer.byteLength(body)
  }, body);
}

async function ttsOpenAI(text, voiceId) {
  const body = JSON.stringify({
    model: 'tts-1',
    voice: voiceId,
    input: text,
    response_format: 'mp3'
  });
  return httpsPost('api.openai.com', '/v1/audio/speech', {
    'Authorization': `Bearer ${KEY}`,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body)
  }, body);
}

const PROVIDER_FN = { elevenlabs: ttsElevenLabs, openai: ttsOpenAI };

(async () => {
  const lines = parseContent();
  console.log(`Parsed ${lines.length} lines from content.js.`);
  if (DRY) {
    for (const l of lines) console.log(`  ${l.id} [${l.voice}] ${l.text.slice(0, 80)}`);
    return;
  }
  if (!KEY) {
    console.error('Set TTS_API_KEY (and optionally TTS_PROVIDER) and re-run. Game plays fine without — runtime will use SpeechSynthesis.');
    process.exit(1);
  }
  const fn = PROVIDER_FN[PROVIDER];
  if (!fn) { console.error('Unknown provider:', PROVIDER); process.exit(1); }
  const map = VOICE_MAP[PROVIDER];
  fs.mkdirSync(OUT_DIR, { recursive: true });

  let ok = 0, fail = 0, skipped = 0;
  for (const l of lines) {
    const out = path.join(OUT_DIR, l.id + '.mp3');
    if (!FORCE && fs.existsSync(out)) { skipped++; continue; }
    const voiceId = process.env[`VOICE_${l.voice}`] || map[l.voice] || map.you;
    try {
      const buf = await fn(l.text, voiceId);
      fs.writeFileSync(out, buf);
      console.log(`ok  : ${l.id} (${buf.length} bytes, ${l.voice})`);
      ok++;
      await new Promise(r => setTimeout(r, 120));  // gentle pacing
    } catch (e) {
      console.log(`FAIL: ${l.id} - ${e.message}`);
      fail++;
    }
  }
  console.log(`\nDone. ok=${ok} fail=${fail} skipped=${skipped}`);
})();
