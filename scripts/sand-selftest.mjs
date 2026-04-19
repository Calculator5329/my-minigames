// scripts/sand-selftest.mjs
// Sand cartridge self-test: load every level JSON, validate, rebuild its
// referenceSolution graph, and ensure LevelRun.test passes on the truth table.
//
// Usage: node scripts/sand-selftest.mjs
// Exit code: 0 on full pass, 1 on any failure.

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { Model } = require('../games/sand/lib/model.js');
const { LevelRun } = require('../games/sand/lib/levelrun.js');
const { Levels } = require('../games/sand/lib/levels.js');
const { Analyze } = require('../games/sand/lib/analyze.js');

const __dirname = dirname(fileURLToPath(import.meta.url));
const LEVELS_DIR = resolve(__dirname, '..', 'games', 'sand', 'data', 'levels');
const INDEX_PATH = join(LEVELS_DIR, 'index.json');

function readJSON(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function summarizeRow(row) {
  const ins = Object.entries(row.inputs).map(([k, v]) => `${k}=${v}`).join(' ');
  const exp = Object.entries(row.expected).map(([k, v]) => `${k}=${v}`).join(' ');
  const act = Object.entries(row.actual).map(([k, v]) => `${k}=${v}`).join(' ');
  return `inputs{${ins}} expected{${exp}} actual{${act}} settled=${row.settled} ticks=${row.ticks}`;
}

function main() {
  const index = readJSON(INDEX_PATH);
  const files = index.files || [];
  let failures = 0;
  let passes = 0;

  console.log(`sand-selftest: loading ${files.length} level(s) from ${LEVELS_DIR}`);

  for (const file of files) {
    const path = join(LEVELS_DIR, file);
    let obj;
    try {
      obj = readJSON(path);
    } catch (err) {
      console.log(`\u2717 ${file}  — cannot parse JSON: ${err.message}`);
      failures++;
      continue;
    }

    const id = obj.id || file;

    // 1) Validate against Levels schema.
    const check = Levels.validateLevel(obj, { knownLayers: ['L1'] });
    if (!check.ok) {
      console.log(`\u2717 ${id}  — validation errors:`);
      for (const e of check.errors) console.log(`    - ${e}`);
      failures++;
      continue;
    }

    // 2) Rebuild referenceSolution graph.
    if (!obj.referenceSolution) {
      console.log(`\u2717 ${id}  — missing referenceSolution`);
      failures++;
      continue;
    }

    let graph;
    try {
      graph = Model.fromJSON(obj.referenceSolution);
    } catch (err) {
      console.log(`\u2717 ${id}  — Model.fromJSON failed: ${err.message}`);
      failures++;
      continue;
    }

    // 3) Run the truth table.
    let result;
    try {
      result = LevelRun.test(graph, obj, { maxTicks: 128 });
    } catch (err) {
      console.log(`\u2717 ${id}  — LevelRun.test threw: ${err.message}`);
      failures++;
      continue;
    }

    if (!result.passed) {
      const fi = result.firstFailure;
      const row = fi >= 0 ? result.rows[fi] : null;
      console.log(`\u2717 ${id}  — truth table failed`);
      if (row) console.log(`    row[${fi}]: ${summarizeRow(row)}`);
      if (result.conflicts && result.conflicts.length) {
        console.log(`    conflicts: ${result.conflicts.length}`);
      }
      failures++;
      continue;
    }

    const gates = Analyze.gateCount(graph);
    const ticks = Analyze.tickDepth(graph);
    console.log(`\u2713 ${id}  gates=${gates} ticks=${ticks} rows=${result.rows.length}`);
    passes++;
  }

  const total = files.length;
  console.log('');
  console.log(`${passes}/${total} levels passed`);
  if (failures > 0) {
    console.log(`FAIL: ${failures} level(s) failed`);
  } else {
    console.log('OK: all levels pass');
  }
  process.exit(failures > 0 ? 1 : 0);
}

main();
