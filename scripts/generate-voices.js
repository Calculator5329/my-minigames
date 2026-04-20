#!/usr/bin/env node
/* Generate baked TTS voice samples for 418 Linden.

   Providers (set TTS_PROVIDER):
     openrouter  — OpenRouter, model openai/gpt-audio-mini (cheap), with full
                   per-character voice-direction prompts. NOTE: OpenAI audio
                   models on OpenRouter route through OpenAI; if your account
                   has a BYOK OpenAI key configured with "Always use this key",
                   that key is used. If it is invalid/expired you must fix it
                   in https://openrouter.ai/settings/integrations or the
                   request will 401. Reads OPENROUTER_API_KEY (or TTS_API_KEY).
     openai      — Direct OpenAI tts-1 (no voice direction). TTS_API_KEY.
     elevenlabs  — Direct ElevenLabs. TTS_API_KEY.

   Reads the call script + voice profiles by parsing games/switchboard/content.js
   so we don't need a build step. Writes WAVs (or MP3s, per provider) to
   assets/switchboard/voices/<id>.<ext>. Existing files are skipped unless
   --force is passed.

   Useful flags:
     --dry             list lines without calling any API
     --force           regenerate even if file exists
     --night N         only generate Night N (1..5)
     --voice <key>     only generate this voice key (e.g. halberd)
     --whisper         also bake whisper variants for dead-line lines
     --model <id>      override OpenRouter model id

   Usage examples:
     OPENROUTER_API_KEY=sk-or-... node scripts/generate-voices.js
     OPENROUTER_API_KEY=sk-or-... node scripts/generate-voices.js --night 1 --voice halberd
*/

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'assets', 'switchboard', 'voices');
const CONTENT = path.join(ROOT, 'games', 'switchboard', 'content.js');

const argv = process.argv.slice(2);
const FORCE = argv.includes('--force');
const DRY = argv.includes('--dry');
const WHISPERS = argv.includes('--whisper');
const PROVIDER = process.env.TTS_PROVIDER || 'openrouter';
const KEY = process.env.OPENROUTER_API_KEY || process.env.TTS_API_KEY;
const NIGHT_FILTER = numArg('--night');
const VOICE_FILTER = strArg('--voice');
const MODEL_OVERRIDE = strArg('--model');

function numArg(name) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : null;
}
function strArg(name) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
}

/* Per-provider voice/voiceId map. The OpenRouter `voice` is whatever the
   underlying OpenAI gpt-audio model accepts. We then pass per-character
   direction notes via the system prompt.

   Hotel Cascadia cast (per docs/plans/2026-04-19-cascadia.md § Cast):
     kestral     — Mrs. Kestral, room 412   (elderly, kind)
     ashworth    — Mr. Ashworth, room 88    (businessman, polite)
     pryce       — Dr. Pryce, room 1102     (clinical, calm)
     bellhop     — The Bellhop              (calm, then only inhale)
     houseman    — The Houseman             (flat inventory bleed)
     child312    — The Child in 312         (a 9-year-old with a man's voice)
     replacement — The Replacement          (22-year-old new operator)
     architect   — Auber Quint              (the dead architect, slow)

   The masculine slot deliberately lands on child312 — the lore is that her
   reset rolled her body back further than her mind and her voice never
   came along. The mismatched voice IS the horror. */
const VOICE_MAP = {
  openrouter: {
    kestral: 'shimmer', ashworth: 'onyx',  pryce:    'echo',  bellhop: 'fable',
    houseman: 'echo',   child312: 'onyx',  replacement: 'alloy', architect: 'echo'
  },
  openai: {
    kestral: 'shimmer', ashworth: 'onyx',  pryce:    'echo',  bellhop: 'fable',
    houseman: 'echo',   child312: 'onyx',  replacement: 'alloy', architect: 'echo'
  },
  elevenlabs: {
    kestral:    'EXAVITQu4vr4xnSDxMaL',
    ashworth:   'VR6AewLTigWG4xSOukaG',
    pryce:      'onwK4e9ZLuTAKqWW03F9',
    bellhop:    'CYw3kZ02Hs0563khs1Fj',
    houseman:   'TxGEqnHWrfWFTfGW9XjX',
    child312:   'AZnzlk1XvdvUeBnXmlld',
    replacement:'XB0fDUnXU5powFXDhCwa',
    architect:  'pNInz6obpgDQGcFmaJgB'
  }
};

/* Parse content.js to extract:
   - VOICE_PROFILES: { voiceKey: { ttsHint, direction, voice } }
   - LINES: [ { id, night, voice, text } ]
   - WHISPER_LINES: those with onDeadLine: true */
function parseContent() {
  const src = fs.readFileSync(CONTENT, 'utf8');

  // Extract voice profile direction hints. Look for blocks shaped like:
  //   foo: { ... ttsHint: '...', direction: '...' ... }
  const profiles = {};
  const profRE = /(\w+):\s*\{[\s\S]*?ttsHint:\s*'((?:[^'\\]|\\.)*)'[\s\S]*?direction:\s*'((?:[^'\\]|\\.)*)'/g;
  let pm;
  while ((pm = profRE.exec(src))) {
    profiles[pm[1]] = {
      ttsHint: unescape(pm[2]),
      direction: unescape(pm[3])
    };
  }

  const out = [];

  // Calls per night. Each call object spans multiple lines and includes
  // optional onDeadLine: true and optional 'flag' or 'critical' keys.
  // We split content into per-night chunks first.
  const nightBlockRE = /\{\s*id:\s*(\d+),\s*durationSec:[\s\S]*?calls:\s*\[([\s\S]*?)\],?\s*deadlineNote/g;
  let nm;
  while ((nm = nightBlockRE.exec(src))) {
    const nightId = Number(nm[1]);
    const block = nm[2];
    const callRE = /\{\s*at:\s*\d+[^}]*?voice:\s*'(\w+)'[^}]*?text:\s*'((?:[^'\\]|\\.)*)'(?:[^}]*?(onDeadLine:\s*true))?[^}]*?\}/g;
    let cm, idx = 0;
    while ((cm = callRE.exec(block))) {
      const voice = cm[1];
      const text = unescape(cm[2]);
      const isDead = !!cm[3];
      // Skip "empty" lines — bellhop dead-socket calls in Hotel Cascadia
      // use text:'...' as a signal that this lamp rings without a voice
      // (the right play is to let it ring out). The runtime never plays
      // their audio, so don't burn API quota baking them.
      const isVoiceless = !text || text.replace(/[^A-Za-z0-9]/g, '').length === 0;
      if (!isVoiceless) {
        out.push({
          id: `n${nightId}_c${idx}`,
          night: nightId, voice, text, isDead
        });
        if (isDead && WHISPERS) {
          out.push({
            id: `whisper_n${nightId}_c${idx}`,
            night: nightId, voice, text, isWhisper: true
          });
        }
      }
      idx++;                // index keeps advancing so runtime IDs stay aligned
    }
  }

  // Walkthrough room lines (Night 5). Description and figure may contain
  // commas, so we match by string boundaries instead of comma-stops.
  const roomBlockRE = /name:\s*'([^']+)',\s*description:\s*'(?:[^'\\]|\\.)*',\s*figure:\s*'(?:[^'\\]|\\.)*',\s*voice:\s*'(\w+)',\s*lines:\s*\[([\s\S]*?)\]/g;
  let rm;
  while ((rm = roomBlockRE.exec(src))) {
    const room = rm[1].toLowerCase();
    const voice = rm[2];
    const lineRE = /'((?:[^'\\]|\\.)*)'/g;
    let lm, lineIdx = 0;
    while ((lm = lineRE.exec(rm[3]))) {
      out.push({
        id: `walk_${room}_${lineIdx++}`,
        night: 5, voice, text: unescape(lm[1])
      });
    }
  }

  // Endings narration (voice: 'you'). The endings block sits inside NIGHT5;
  // the file ends with closing braces for endings, NIGHT5, and the IIFE,
  // so just grab everything up to the first stray "}" line at minimum nesting.
  const endingsStart = src.indexOf('endings:');
  if (endingsStart > 0) {
    // Find matching close brace by depth-tracking from the first '{' after endings:
    const open = src.indexOf('{', endingsStart);
    let depth = 0, end = -1;
    for (let i = open; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    const endingsBlock = end > 0 ? src.slice(open + 1, end) : '';
    const blockRE = /(\w+):\s*\[([\s\S]*?)\]/g;
    let bm;
    while ((bm = blockRE.exec(endingsBlock))) {
      const key = bm[1];
      const lineRE = /'((?:[^'\\]|\\.)*)'/g;
      let lm, i = 0;
      while ((lm = lineRE.exec(bm[2]))) {
        out.push({
          id: `ending_${key}_${i++}`,
          night: 5, voice: 'replacement', text: unescape(lm[1])
        });
      }
    }
  }

  return { profiles, lines: out };
}

function unescape(s) {
  return s.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\n/g, '\n');
}

// Loose comparison so we only flag real drift, not punctuation/case nits.
function normalize(s) {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// Detect compliance-reply contamination — "Understood. I'll deliver…" etc.
// These takes have the framing baked into the audio and must be re-rolled.
const FRAMING_PREFIX = /^(?:["'\s]*)(understood|sure|of course|here(?:'| i)s|i'?ll|i will|okay|ok|got it|alright|certainly|absolutely|right(?:[,.]| then)|let me|happy to|noted|copy that|as requested)\b/i;
const FRAMING_MID    = /\b(?:deliver|perform|recite|read|voice|speak|say)\b[^.\n]{0,40}\b(?:line|script|dialogue|character|in[- ]character)\b/i;
function looksFramed(t) {
  if (!t) return false;
  return FRAMING_PREFIX.test(t) || FRAMING_MID.test(t);
}

/* Wrap raw signed-16-bit little-endian PCM in a minimal RIFF/WAVE header so
   the resulting file plays in any browser <audio> element. */
function pcm16ToWav(pcm, sampleRate, channels) {
  const byteRate = sampleRate * channels * 2;
  const blockAlign = channels * 2;
  const dataLen = pcm.length;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataLen, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);          // PCM chunk size
  header.writeUInt16LE(1, 20);           // PCM format
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(16, 34);          // bits per sample
  header.write('data', 36);
  header.writeUInt32LE(dataLen, 40);
  return Buffer.concat([header, pcm]);
}

function httpsPost(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path, method: 'POST', headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}: ${Buffer.concat(chunks).toString('utf8').slice(0, 400)}`));
        }
        resolve(Buffer.concat(chunks));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/* OpenRouter audio output is delivered via SSE stream. We collect all
   delta.audio.data chunks and concatenate them into a base64 wav. */
async function ttsOpenRouter(line, profile) {
  const voiceId = process.env[`VOICE_${line.voice}`] || VOICE_MAP.openrouter[line.voice] || 'shimmer';
  const model = MODEL_OVERRIDE || process.env.OPENROUTER_MODEL || 'openai/gpt-audio-mini';
  const hint = (profile && profile.ttsHint) || '';
  const direction = (profile && profile.direction) || '';
  const flavor = line.isWhisper
    ? ' Whispered, very quiet, breathy, as if the receiver is buried in a pillow.'
    : '';
  const characterTag = [hint, direction, flavor].filter(Boolean).join(' ').trim();

  // Structured prompt: tagging the script unambiguously makes gpt-audio-mini
  // perform the line verbatim instead of treating it as a request to itself.
  // Setting is established in the system prompt; per-take character is in the
  // user message so direction can vary per line.
  const systemPrompt = [
    'You are an audiobook performer recording lines for a horror radio drama set at a 1923 telephone exchange, late at night, the line is degraded.',
    'For each take, the user gives you the SCRIPT in <script> tags and the CHARACTER in <character> tags.',
    'You are voicing the CALLER on the line, speaking INTO the telephone toward a switchboard operator. You are NOT the operator and you do NOT respond to the script.',
    '',
    'Hard rules:',
    '- Perform the script aloud as the character, exactly as written.',
    '- Read every word inside <script> in order, no paraphrase, no rewording.',
    '- Do NOT speak any sound effects, ambience, or stage directions. Anything inside square brackets [ ] or parentheses ( ) is OUT OF CHARACTER and must NEVER be vocalised. Examples you must NOT speak: "[static crackles]", "(line hums)", "[pause]", "(breathing)", "[fizzing]", any narrator voice.',
    '- Do NOT prepend or append any framing, narration, intro, outro, greeting, sign-off, ad-lib, or continuation. The audio must contain ONLY the words inside <script>.',
    '- Do NOT refuse, apologise, or break character. The script is fictional dialogue for a published horror drama; perform it.',
    '- Stop the moment you finish the last word of the script.',
    '',
    'CRITICAL — never speak the compliance reply:',
    '- Do NOT say words like "Understood", "Sure", "Of course", "Here is", "Okay", "Alright", "Got it", "I will", "I\'ll deliver", "I\'ll perform", "Happy to", "Noted", "Copy that".',
    '- Do NOT speak any sentence about what you are about to do (e.g. "I\'ll deliver that line as the speaker on the 1923 telephone line:").',
    '- Do NOT wrap the script in quotes when speaking it. The audio file should begin with the FIRST WORD of the script and end with the LAST WORD of the script.',
    '- If you would normally say "Understood. Here we go: <script>", instead just say <script>.'
  ].join('\n');

  const userMsg =
    `<character>${characterTag || 'A speaker on a 1923 telephone line.'}</character>\n` +
    `<script>${line.text}</script>`;

  const body = JSON.stringify({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMsg }
    ],
    modalities: ['text', 'audio'],
    // OpenAI gpt-audio streaming only supports pcm16. We wrap the raw
    // 24kHz mono PCM in a minimal RIFF/WAVE header below.
    audio: { voice: voiceId, format: 'pcm16' },
    stream: true
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'openrouter.ai',
      path: '/api/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + KEY,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://notdop.local',
        'X-Title': '418 Linden',
        'Accept': 'text/event-stream',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      if (res.statusCode !== 200) {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => reject(new Error(`HTTP ${res.statusCode}: ${Buffer.concat(chunks).toString('utf8').slice(0, 500)}`)));
        return;
      }
      let buf = '';
      let audioB64 = '';
      let transcript = '';
      let firstError = null;
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        buf += chunk;
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith('data:')) continue;
          const data = t.slice(5).trim();
          if (data === '[DONE]') continue;
          if (!data) continue;
          try {
            const j = JSON.parse(data);
            if (j.error && !firstError) firstError = JSON.stringify(j.error).slice(0, 300);
            const a = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.audio;
            if (a && a.data) audioB64 += a.data;
            if (a && a.transcript) transcript += a.transcript;
          } catch (e) { /* keepalives */ }
        }
      });
      res.on('end', () => {
        if (firstError && !audioB64) return reject(new Error(firstError));
        if (!audioB64) return reject(new Error('no audio chunks returned'));
        const pcm = Buffer.from(audioB64, 'base64');
        resolve({ buf: pcm16ToWav(pcm, 24000, 1), ext: 'wav', transcript: transcript.trim() });
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function ttsOpenAI(line) {
  const voiceId = process.env[`VOICE_${line.voice}`] || VOICE_MAP.openai[line.voice] || 'alloy';
  const body = JSON.stringify({
    model: 'tts-1', voice: voiceId, input: line.text, response_format: 'mp3'
  });
  const buf = await httpsPost('api.openai.com', '/v1/audio/speech', {
    'Authorization': `Bearer ${KEY}`,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body)
  }, body);
  return { buf, ext: 'mp3' };
}

async function ttsElevenLabs(line) {
  const voiceId = process.env[`VOICE_${line.voice}`] || VOICE_MAP.elevenlabs[line.voice];
  if (!voiceId) throw new Error('no eleven voice for ' + line.voice);
  const body = JSON.stringify({
    text: line.text, model_id: 'eleven_monolingual_v1',
    voice_settings: { stability: 0.55, similarity_boost: 0.75 }
  });
  const buf = await httpsPost('api.elevenlabs.io', `/v1/text-to-speech/${voiceId}`, {
    'xi-api-key': KEY,
    'Content-Type': 'application/json',
    'Accept': 'audio/mpeg',
    'Content-Length': Buffer.byteLength(body)
  }, body);
  return { buf, ext: 'mp3' };
}

const PROVIDER_FN = {
  openrouter: ttsOpenRouter,
  openai: ttsOpenAI,
  elevenlabs: ttsElevenLabs
};

(async () => {
  const { profiles, lines } = parseContent();
  const filtered = lines.filter(l =>
    (!NIGHT_FILTER || l.night === NIGHT_FILTER) &&
    (!VOICE_FILTER || l.voice === VOICE_FILTER));

  console.log(`Parsed ${lines.length} total lines (${filtered.length} after filters).`);

  if (DRY) {
    for (const l of filtered) {
      const p = profiles[l.voice] || {};
      console.log(`  [N${l.night}] ${l.id.padEnd(28)} ${l.voice.padEnd(12)} ${l.text.slice(0, 70)}`);
      if (p.direction) console.log(`        DIR: ${p.direction.slice(0, 90)}…`);
    }
    return;
  }
  if (!KEY) {
    console.error('Set OPENROUTER_API_KEY (or TTS_API_KEY) and re-run.');
    console.error('Game still plays without baked audio — runtime falls back to SpeechSynthesis.');
    process.exit(1);
  }
  const fn = PROVIDER_FN[PROVIDER];
  if (!fn) { console.error('Unknown provider:', PROVIDER); process.exit(1); }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  let ok = 0, fail = 0, skipped = 0;
  for (const l of filtered) {
    // Skip if any expected extension already exists
    const existing = ['wav', 'mp3'].map(e => path.join(OUT_DIR, l.id + '.' + e)).find(fs.existsSync);
    if (!FORCE && existing) { skipped++; continue; }
    const profile = profiles[l.voice];
    try {
      // Roll the take. If the transcript looks like the model spoke its
      // compliance reply ("Understood. I'll deliver…") the audio is
      // contaminated — re-roll once. Two-takes-or-bust keeps the cost
      // bounded for the rare drift cases.
      let { buf, ext, transcript } = await fn(l, profile);
      let rerolled = false;
      if (looksFramed(transcript)) {
        rerolled = true;
        await new Promise(r => setTimeout(r, 250));
        const retake = await fn(l, profile);
        if (!looksFramed(retake.transcript)) {
          buf = retake.buf; ext = retake.ext; transcript = retake.transcript;
        } else {
          // Both takes framed; keep the second but flag for manual review.
          buf = retake.buf; ext = retake.ext; transcript = retake.transcript;
        }
      }
      const out = path.join(OUT_DIR, l.id + '.' + ext);
      fs.writeFileSync(out, buf);
      // Save the actual spoken transcript next to the WAV so the runtime can
      // display what was actually said instead of the original script. This
      // keeps the caller-card text in lock-step with the audio even if the
      // model occasionally drifts. The runtime separately ignores any
      // transcript that still looks framed, falling back to call.text.
      if (transcript) {
        fs.writeFileSync(path.join(OUT_DIR, l.id + '.txt'), transcript);
      }
      const drift = transcript && normalize(transcript) !== normalize(l.text)
        ? ' [drift]' : '';
      const framed = looksFramed(transcript) ? ' [STILL FRAMED]' : (rerolled ? ' [re-rolled]' : '');
      console.log(`ok  : ${l.id.padEnd(28)} (${l.voice}, ${buf.length} bytes ${ext})${drift}${framed}`);
      ok++;
      await new Promise(r => setTimeout(r, 150));
    } catch (e) {
      console.log(`FAIL: ${l.id.padEnd(28)} (${l.voice}) - ${e.message}`);
      fail++;
      // If the very first request fails with a credentials/BYOK error, bail
      // early — no point burning quota on the same problem 60 times.
      if (ok === 0 && /401|403|invalid_api_key|byok/i.test(e.message)) {
        console.error('\nAborting: provider returned an auth error on the first call.');
        console.error('If using openrouter and you see "Incorrect API key" referencing an');
        console.error('OpenAI sk-proj key, you have a BYOK OpenAI key configured at');
        console.error('https://openrouter.ai/settings/integrations that is invalid or');
        console.error('expired. Disable "Always use this key" or update the BYOK key,');
        console.error('then re-run.');
        break;
      }
    }
  }
  console.log(`\nDone. ok=${ok} fail=${fail} skipped=${skipped}`);
})();
