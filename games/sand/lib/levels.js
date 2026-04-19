// games/sand/lib/levels.js
// Dual-entry module: Node (CommonJS) and browser (window.NDP.Sand.Levels).
//
// Task 21: level loader + validator.
//
//   Levels.validateLevel(obj, { knownLayers } = {}) -> { ok, errors }
//   Levels.validateLayers(obj)                      -> { ok, errors }
//   Levels.load({ basePath })                       -> Promise<{ layers, levels }>  (browser; uses fetch)
//   Levels.loadWith({ readFile, listDir, basePath })-> Promise<{ layers, levels }>  (testable)

(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Levels: mod.Levels };
    module.exports.Levels = mod.Levels;
  }
  if (typeof window !== 'undefined') {
    window.NDP = window.NDP || {};
    window.NDP.Sand = window.NDP.Sand || {};
    window.NDP.Sand.Levels = mod.Levels;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const ID_RE = /^[A-Za-z0-9_]+$/;

  function isString(v) { return typeof v === 'string'; }
  function isNumber(v) { return typeof v === 'number' && isFinite(v); }
  function isArray(v) { return Array.isArray(v); }
  function isObject(v) { return v && typeof v === 'object' && !Array.isArray(v); }

  function distinct(arr) {
    const s = new Set();
    for (const v of arr) {
      if (s.has(v)) return false;
      s.add(v);
    }
    return true;
  }

  function validateStarGoals(sg, errs) {
    if (!isObject(sg)) { errs.push('starGoals: must be object'); return; }
    for (const k of ['gates', 'ticks']) {
      const g = sg[k];
      if (!isObject(g)) { errs.push('starGoals.' + k + ': must be object'); continue; }
      if (!isNumber(g['3star'])) errs.push('starGoals.' + k + '.3star: must be number');
      if (!isNumber(g['2star'])) errs.push('starGoals.' + k + '.2star: must be number');
    }
  }

  function validateIO(io, errs) {
    if (!isObject(io)) { errs.push('io: must be object'); return { inputs: [], outputs: [] }; }
    const inputs = io.inputs;
    const outputs = io.outputs;
    if (!isArray(inputs) || inputs.length === 0) errs.push('io.inputs: must be non-empty array');
    else {
      for (const v of inputs) if (!isString(v)) { errs.push('io.inputs: must be strings'); break; }
      if (!distinct(inputs)) errs.push('io.inputs: must be distinct');
    }
    if (!isArray(outputs) || outputs.length === 0) errs.push('io.outputs: must be non-empty array');
    else {
      for (const v of outputs) if (!isString(v)) { errs.push('io.outputs: must be strings'); break; }
      if (!distinct(outputs)) errs.push('io.outputs: must be distinct');
    }
    return { inputs: isArray(inputs) ? inputs : [], outputs: isArray(outputs) ? outputs : [] };
  }

  function validateTruthTable(tt, io, errs) {
    if (!isArray(tt)) { errs.push('truthTable: must be array'); return; }
    for (let i = 0; i < tt.length; i++) {
      const row = tt[i];
      if (!isObject(row)) { errs.push('truthTable[' + i + ']: must be object'); continue; }
      if (!isArray(row.in) || row.in.length !== io.inputs.length) {
        errs.push('truthTable[' + i + '].in: length must be ' + io.inputs.length);
      }
      if (!isArray(row.out) || row.out.length !== io.outputs.length) {
        errs.push('truthTable[' + i + '].out: length must be ' + io.outputs.length);
      }
    }
  }

  function validateLevel(obj, opts) {
    const errs = [];
    opts = opts || {};
    const knownLayers = opts.knownLayers || null;

    if (!isObject(obj)) {
      return { ok: false, errors: ['level: must be object'] };
    }

    if (!isString(obj.id) || !obj.id) errs.push('id: required string');
    else if (!ID_RE.test(obj.id)) errs.push('id: must match /^[A-Za-z0-9_]+$/');

    if (!isString(obj.layer) || !obj.layer) errs.push('layer: required string');
    else if (knownLayers && knownLayers.indexOf(obj.layer) < 0) {
      errs.push('layer: unknown (' + obj.layer + ')');
    }

    if (!isNumber(obj.order) || obj.order < 0) errs.push('order: required number >= 0');

    if (!isString(obj.title)) errs.push('title: required string');
    if (!isString(obj.brief)) errs.push('brief: required string');

    if (!isArray(obj.allowedComponents)) errs.push('allowedComponents: required array');
    else {
      for (const v of obj.allowedComponents) {
        if (!isString(v)) { errs.push('allowedComponents: must be strings'); break; }
      }
    }

    const io = validateIO(obj.io, errs);
    validateTruthTable(obj.truthTable, io, errs);
    validateStarGoals(obj.starGoals, errs);

    if (obj.unlocksComponent !== undefined) {
      if (!isObject(obj.unlocksComponent)) errs.push('unlocksComponent: must be object');
      else {
        if (!isString(obj.unlocksComponent.id)) errs.push('unlocksComponent.id: required string');
        if (!isString(obj.unlocksComponent.name)) errs.push('unlocksComponent.name: required string');
      }
    }

    if (obj.referenceSolution !== undefined) {
      if (!isObject(obj.referenceSolution)) errs.push('referenceSolution: must be object');
    }

    return { ok: errs.length === 0, errors: errs };
  }

  function validateLayers(obj) {
    const errs = [];
    if (!isObject(obj)) return { ok: false, errors: ['layers: must be object'] };
    if (obj.version !== 1) errs.push('layers.version: must be 1');
    if (!isArray(obj.layers)) errs.push('layers.layers: must be array');
    else {
      for (let i = 0; i < obj.layers.length; i++) {
        const L = obj.layers[i];
        if (!isObject(L)) { errs.push('layers[' + i + ']: must be object'); continue; }
        if (!isString(L.id) || !L.id) errs.push('layers[' + i + '].id: required string');
        if (!isString(L.title)) errs.push('layers[' + i + '].title: required string');
        if (!isNumber(L.order)) errs.push('layers[' + i + '].order: required number');
      }
    }
    return { ok: errs.length === 0, errors: errs };
  }

  function joinPath(base, rest) {
    if (!base) return rest;
    if (base.endsWith('/')) return base + rest;
    return base + '/' + rest;
  }

  async function loadWith(opts) {
    opts = opts || {};
    const readFile = opts.readFile;
    const listDir = opts.listDir;
    const basePath = opts.basePath || 'games/sand/data';
    if (typeof readFile !== 'function') throw new Error('loadWith: readFile required');
    if (typeof listDir !== 'function') throw new Error('loadWith: listDir required');

    const layersRaw = await readFile(joinPath(basePath, 'layers.json'));
    const layersDoc = JSON.parse(layersRaw);
    const layersCheck = validateLayers(layersDoc);
    if (!layersCheck.ok) {
      throw new Error('layers.json invalid: ' + layersCheck.errors.join('; '));
    }
    const layers = layersDoc.layers.slice();
    const knownLayers = layers.map((L) => L.id);

    const files = await listDir(joinPath(basePath, 'levels'));
    const levels = {};
    for (const fn of files) {
      if (!fn || !fn.endsWith('.json')) continue;
      if (fn === 'index.json') continue;
      const raw = await readFile(joinPath(joinPath(basePath, 'levels'), fn));
      const doc = JSON.parse(raw);
      const check = validateLevel(doc, { knownLayers });
      if (!check.ok) {
        throw new Error('level ' + fn + ' invalid: ' + check.errors.join('; '));
      }
      levels[doc.id] = doc;
    }

    return { layers, levels };
  }

  async function load(opts) {
    opts = opts || {};
    const basePath = opts.basePath || 'games/sand/data';
    const readFile = async (path) => {
      const res = await fetch(path);
      if (!res.ok) throw new Error('fetch ' + path + ' -> ' + res.status);
      return await res.text();
    };
    // Browser listDir: read index.json with { files: [...] }.
    const listDir = async (path) => {
      const idxPath = joinPath(path, 'index.json');
      const res = await fetch(idxPath);
      if (!res.ok) throw new Error('fetch ' + idxPath + ' -> ' + res.status);
      const doc = JSON.parse(await res.text());
      return isArray(doc.files) ? doc.files : [];
    };
    return loadWith({ readFile, listDir, basePath });
  }

  const Levels = { validateLevel, validateLayers, load, loadWith };
  return { Levels };
});
