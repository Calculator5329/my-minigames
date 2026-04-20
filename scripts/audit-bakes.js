#!/usr/bin/env node
/* Audit baked transcripts for "model framing" preamble — phrases like
   "Understood. I'll deliver...", "Sure, here is the line...", etc.
   These takes have a contaminated audio file (the model spoke the framing
   out loud as part of the take) and need to be re-baked.

   Usage:
     node scripts/audit-bakes.js          # report only
     node scripts/audit-bakes.js --purge  # delete bad .wav/.mp3/.txt so the
                                          # next bake regenerates them
*/

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'assets', 'switchboard', 'voices');
const PURGE = process.argv.includes('--purge');

// Phrases that almost certainly indicate the model spoke its compliance reply
// instead of (or before) the actual line. Anchored at start to avoid
// false-positives on legitimate dialogue.
const FRAMING_PREFIX = /^(?:["'\s]*)(understood|sure|of course|here(?:'| i)s|i'?ll|i will|okay|ok|got it|alright|certainly|absolutely|right(?:[,.]| then)|let me|happy to|noted|copy that|as requested)\b/i;

// Mid-sentence tells that the model is narrating what it's about to do.
const FRAMING_MID = /\b(?:deliver|perform|recite|read|voice|speak|say)\b[^.\n]{0,40}\b(?:line|script|dialogue|character|in[- ]character)\b/i;

// Quoted-line tell: the model wraps the actual script in quotes after a
// preamble, e.g.  Understood. ...:  "Bellhop. There's a guest..."
// We only count this if the quoted block is preceded by a colon or "say(s)".
const FRAMING_QUOTED = /(?::|\bsays?\b)\s*["“][^"”]{4,}["”]\s*$/;

if (!fs.existsSync(DIR)) {
  console.error('No voices folder at', DIR);
  process.exit(1);
}

const txts = fs.readdirSync(DIR).filter(f => f.endsWith('.txt')).sort();
console.log(`Scanning ${txts.length} transcript files in ${DIR}\n`);

const bad = [];
for (const f of txts) {
  const t = fs.readFileSync(path.join(DIR, f), 'utf8').trim();
  const reasons = [];
  if (FRAMING_PREFIX.test(t)) reasons.push('framing-prefix');
  if (FRAMING_MID.test(t))    reasons.push('framing-mid');
  if (FRAMING_QUOTED.test(t)) reasons.push('framing-quoted');
  if (reasons.length) bad.push({ f, t, reasons });
}

if (!bad.length) {
  console.log('All transcripts look clean.');
  process.exit(0);
}

console.log(`Found ${bad.length} contaminated takes:\n`);
for (const { f, t, reasons } of bad) {
  console.log(`  ${f}  [${reasons.join(',')}]`);
  console.log(`    ${t.slice(0, 140).replace(/\s+/g, ' ')}${t.length > 140 ? '…' : ''}`);
}

if (!PURGE) {
  console.log('\nRe-run with --purge to delete the .wav/.mp3/.txt for each, then bake again.');
  process.exit(0);
}

let deleted = 0;
for (const { f } of bad) {
  const base = f.replace(/\.txt$/, '');
  for (const ext of ['txt', 'wav', 'mp3']) {
    const p = path.join(DIR, base + '.' + ext);
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
      deleted++;
    }
  }
}
console.log(`\nPurged ${deleted} files. Re-run scripts\\rebake-cascadia.cmd (without --force) to regenerate just the missing ones.`);
