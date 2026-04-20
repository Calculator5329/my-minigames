(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  if (typeof window !== 'undefined') {
    window.NDP = window.NDP || {};
    window.NDP.Sand = window.NDP.Sand || {};
    window.NDP.Sand.Levels = mod.Levels;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const ID_RE = /^[a-z0-9][a-z0-9_-]*$/;
  const BIT = new Set([0, 1]);

  function isString(v) { return typeof v === 'string' && v.length > 0; }
  function isNumber(v) { return typeof v === 'number' && isFinite(v); }
  function isArray(v)  { return Array.isArray(v); }
  function isObject(v) { return v && typeof v === 'object' && !Array.isArray(v); }
  function isBit(v)    { return BIT.has(v); }

  function validateIO(io, errs) {
    if (!isObject(io)) { errs.push('io: must be object'); return { inputs: [], outputs: [] }; }
    const ins = io.inputs, outs = io.outputs;
    if (!isArray(ins) || ins.length === 0) errs.push('io.inputs: must be non-empty array');
    if (!isArray(outs) || outs.length === 0) errs.push('io.outputs: must be non-empty array');
    const labels = new Set();
    const inputs = isArray(ins) ? ins : [];
    const outputs = isArray(outs) ? outs : [];
    for (const p of inputs) {
      if (!isObject(p) || !isString(p.label)) { errs.push('io.inputs: each must have label'); break; }
      if (labels.has(p.label)) errs.push('io.inputs: duplicate label ' + p.label);
      labels.add(p.label);
    }
    for (const p of outputs) {
      if (!isObject(p) || !isString(p.label)) { errs.push('io.outputs: each must have label'); break; }
      if (labels.has(p.label)) errs.push('io.outputs: duplicate label ' + p.label);
      labels.add(p.label);
    }
    return { inputs, outputs };
  }

  function validateTruthTable(tt, io, errs) {
    if (!isArray(tt) || tt.length === 0) { errs.push('truthTable: must be non-empty array'); return; }
    for (let i = 0; i < tt.length; i++) {
      const row = tt[i];
      if (!isObject(row)) { errs.push('truthTable[' + i + ']: must be object'); continue; }
      const rin = row.in, rout = row.out;
      if (isArray(rin)) {
        if (rin.length !== io.inputs.length) errs.push('truthTable[' + i + '].in: length ' + rin.length + ' != ' + io.inputs.length);
        for (const b of rin) if (!isBit(b)) { errs.push('truthTable[' + i + '].in: values must be 0|1'); break; }
      } else if (isObject(rin)) {
        for (const p of io.inputs) {
          if (!(p.label in rin)) errs.push('truthTable[' + i + '].in: missing ' + p.label);
          else if (!isBit(rin[p.label])) errs.push('truthTable[' + i + '].in[' + p.label + ']: must be 0|1');
        }
      } else {
        errs.push('truthTable[' + i + '].in: must be array or object');
      }
      if (isArray(rout)) {
        if (rout.length !== io.outputs.length) errs.push('truthTable[' + i + '].out: length ' + rout.length + ' != ' + io.outputs.length);
        for (const b of rout) if (!isBit(b)) { errs.push('truthTable[' + i + '].out: values must be 0|1'); break; }
      } else if (isObject(rout)) {
        for (const p of io.outputs) {
          if (!(p.label in rout)) errs.push('truthTable[' + i + '].out: missing ' + p.label);
          else if (!isBit(rout[p.label])) errs.push('truthTable[' + i + '].out[' + p.label + ']: must be 0|1');
        }
      } else {
        errs.push('truthTable[' + i + '].out: must be array or object');
      }
    }
  }

  function validateLevel(obj, opts) {
    opts = opts || {};
    const errs = [];
    if (!isObject(obj)) return { ok: false, errors: ['level: must be object'] };
    if (!isString(obj.id) || !ID_RE.test(obj.id)) errs.push('id: required, matches ' + ID_RE);
    if (!isString(obj.track)) errs.push('track: required');
    else if (opts.knownTracks && opts.knownTracks.indexOf(obj.track) < 0) errs.push('track: unknown (' + obj.track + ')');
    if (!isNumber(obj.order) || obj.order < 0) errs.push('order: required number >= 0');
    if (!isString(obj.title)) errs.push('title: required');
    if (!isString(obj.brief)) errs.push('brief: required');
    if (!isNumber(obj.difficulty) || obj.difficulty < 1 || obj.difficulty > 5) errs.push('difficulty: 1..5');
    if (!isArray(obj.availableGates)) errs.push('availableGates: must be array');
    else for (const g of obj.availableGates) if (!isString(g)) { errs.push('availableGates: entries must be strings'); break; }
    if (!isNumber(obj.parGates) || obj.parGates < 0) errs.push('parGates: required number >= 0');
    const io = validateIO(obj.io, errs);
    validateTruthTable(obj.truthTable, io, errs);
    if (obj.hints !== undefined) {
      if (!isArray(obj.hints)) errs.push('hints: must be array if present');
      else for (const h of obj.hints) if (!isString(h)) { errs.push('hints: entries must be strings'); break; }
    }
    if (obj.prerequisites !== undefined) {
      if (!isArray(obj.prerequisites)) errs.push('prerequisites: must be array if present');
      else for (const p of obj.prerequisites) if (!isString(p)) { errs.push('prerequisites: entries must be strings'); break; }
    }
    if (obj.unlocksComponent !== undefined) {
      const uc = obj.unlocksComponent;
      if (!isObject(uc) || !isString(uc.id) || !isString(uc.name)) errs.push('unlocksComponent: {id,name} required');
    }
    if (obj.sequential !== undefined && typeof obj.sequential !== 'boolean') errs.push('sequential: must be boolean if present');
    return { ok: errs.length === 0, errors: errs };
  }

  function validateTracks(obj) {
    const errs = [];
    if (!isObject(obj)) return { ok: false, errors: ['tracks: must be object'] };
    if (!isArray(obj.tracks) || obj.tracks.length === 0) errs.push('tracks: must be non-empty array');
    else {
      const ids = new Set();
      for (const t of obj.tracks) {
        if (!isObject(t) || !isString(t.id) || !isString(t.title) || !isNumber(t.order)) {
          errs.push('tracks[]: each needs { id, title, order }');
          continue;
        }
        if (ids.has(t.id)) errs.push('tracks: duplicate id ' + t.id);
        ids.add(t.id);
      }
    }
    return { ok: errs.length === 0, errors: errs };
  }

  async function loadWith(opts) {
    const { readFile, listDir, basePath } = opts;
    const tracksJson = JSON.parse(await readFile(basePath + '/tracks.json'));
    const tv = validateTracks(tracksJson);
    if (!tv.ok) throw new Error('tracks.json: ' + tv.errors.join('; '));
    const knownTracks = tracksJson.tracks.map(t => t.id);
    const levels = [];
    for (const t of tracksJson.tracks) {
      const dir = basePath + '/levels/' + t.id;
      let files;
      try { files = await listDir(dir); } catch (_e) { files = []; }
      files = files.filter(f => f.endsWith('.json')).sort();
      for (const f of files) {
        const obj = JSON.parse(await readFile(dir + '/' + f));
        const v = validateLevel(obj, { knownTracks });
        if (!v.ok) throw new Error(f + ': ' + v.errors.join('; '));
        levels.push(obj);
      }
    }
    return { tracks: tracksJson, levels };
  }

  return { Levels: { validateLevel, validateTracks, loadWith } };
});
