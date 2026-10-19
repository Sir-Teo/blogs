#!/usr/bin/env node
// Generates:
//   1. assets/js/theorems-visualizations-core.js — minified IIFE bundle of
//      theorems-visualizations's canvas runtime (core.js, math.js, 17 kits)
//      plus 37 live viz(v) functions across all 13 fields and 8 bridges.
//   2. assets/data/theorems-visualizations-demo.json — compact catalog of all
//      6,684 written items, 11,541 dependency edges, 85 collections, 13 fields,
//      8 bridges, 450 landmark papers, and runtime/verification audit metrics.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const TV_ROOT = process.env.THEOREMS_VIZ || path.resolve(import.meta.dirname, '../../../theorems-visualizations');
const BLOG_ROOT = path.resolve(import.meta.dirname, '../..');
const ESBUILD = process.env.ESBUILD || path.resolve(BLOG_ROOT, '../web-katrain/node_modules/.bin/esbuild');

const indexData = JSON.parse(fs.readFileSync(path.join(TV_ROOT, 'data/index.json'), 'utf8'));
const plannedData = JSON.parse(fs.readFileSync(path.join(TV_ROOT, 'data/planned.json'), 'utf8'));

const byId = new Map(indexData.items.map((it, idx) => [it.id, { ...it, idx }]));
const colById = new Map(indexData.collections.map((c, idx) => [c.id, { ...c, idx }]));
const fieldById = new Map(indexData.fields.map((f, idx) => [f.id, { ...f, idx }]));

// 13 field flagships (one per field, each verified in light + dark)
const FLAGSHIPS = [
  { field: 'math', id: 'pma-4.19', highlight: 'Break compactness on (0, 2] to watch inf δ(p) collapse to 0' },
  { field: 'physics', id: 'mech-8.22', highlight: 'Drag the launch velocity vector: Kepler velocities trace an exact circle' },
  { field: 'cs', id: 'cplx-13.9', highlight: 'Step Grover iterations k to rotate the state by 2θ toward |ω⟩' },
  { field: 'stats', id: 'causal-4.4', highlight: 'Switch Berkeley vs kidney stones or drag the confounder mix' },
  { field: 'chem', id: 'pchem-3.3', highlight: 'Adjust T_H and T_C across coupled p–V and T–S Carnot diagrams' },
  { field: 'earth', id: 'geog-4.4', highlight: 'Drag Greenland to the equator to shed its 14× sec²φ Mercator inflation' },
  { field: 'bio', id: 'mathbio-3.3', highlight: 'Drag the initial state on the predator–prey phase plane' },
  { field: 'med', id: 'imaging-3.3', highlight: 'Place phantom discs and scrub the Radon sinogram & back-projection' },
  { field: 'eng', id: 'solid-3.3', highlight: 'Rotate the stress element by θ while Mohr’s circle sweeps 2θ' },
  { field: 'econ', id: 'macro-3.2', highlight: 'Shift saving rate s and depreciation δ in the Solow–Swan growth model' },
  { field: 'social', id: 'soc-1.2', highlight: 'Vary tolerance T% and watch mild preferences tip into segregation' },
  { field: 'arts', id: 'art-1.8', highlight: 'Slide vanishing points V_L, V_R while the station point tracks Thales’ circle' },
  { field: 'humanities', id: 'tech-2.9', highlight: 'Turn the Antikythera b1 gear or break one tooth to watch the pointer drift' },
];

// Additional live visualizations across all 8 cross-field bridges
const BRIDGE_LIVE_IDS = [
  // spectral (all 9 steps!)
  'ladr-5.5', 'ladr-7.12', 'ladr-7.29', 'ladr-7.96', 'ladr-7.70', 'fa-12.23', 'mech-10.8', 'mech-11.4', 'music-2.3',
  // fourier
  'pma-8.10', 'pma-8.11', 'rca-9.13', 'music-2.6', 'music-4.2', 'algo-4.11',
  // entropy
  'thermo-5.6', 'info-1.2', 'thermo-5.16', 'thermo-5.17', 'info-2.1', 'deep-1.9',
  // fixed-points
  'top-3.17', 'pma-9.23', 'ode-2.4', 'game-2.3', 'stoch-4.15',
  // action
  'mech-5.2', 'mech-5.7', 'mech-5.4', 'mech-7.3', 'qm-6.4',
  // contagion
  'soc-4.2', 'soc-1.8',
  // diffusion
  'pde-1.4', 'pde-3.4',
  // symmetry
  'music-8.1', 'rep-1.1',
];

const BUNDLED_IDS = [...new Set([...FLAGSHIPS.map((f) => f.id), ...BRIDGE_LIVE_IDS])].filter((id) => byId.has(id) && byId.get(id).viz);

console.log(`Bundling ${BUNDLED_IDS.length} live interactive visualizations...`);

// Group bundled IDs by chapter file and extract rich details + clean source excerpts
const byFile = new Map();
for (const id of BUNDLED_IDS) {
  const it = byId.get(id);
  if (!byFile.has(it.file)) byFile.set(it.file, []);
  byFile.get(it.file).push(id);
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-demo-'));
const entryLines = [
  `import { mount, richHTML, inlineHTML, renderRich, katexHTML, escapeHTML, resetColors, resolveColor } from ${JSON.stringify(path.join(TV_ROOT, 'assets/js/viz/core.js'))};`,
  `import * as M from ${JSON.stringify(path.join(TV_ROOT, 'assets/js/viz/math.js'))};`,
  `export const VIZ = {};`,
];

const itemsDetail = {};
let fileCounter = 0;

for (const [relFile, ids] of byFile) {
  const absFile = path.join(TV_ROOT, relFile);
  const mod = await import(pathToFileURL(absFile).href);
  const ch = mod.default;
  const col = ch.collection ?? ch.book;
  const rawSrc = fs.readFileSync(absFile, 'utf8');
  const expIdx = rawSrc.indexOf('export default');
  const dir = path.dirname(absFile);

  const fnEntries = [];
  for (const id of ids) {
    const item = ch.items.find((x) => `${col}-${x.num}` === id);
    if (!item || typeof item.viz !== 'function') continue;
    let fnSrc = item.viz.toString();
    if (/^viz\s*\(/.test(fnSrc)) fnSrc = 'function ' + fnSrc;
    fnEntries.push(`${JSON.stringify(id)}: ${fnSrc}`);

    // Extract a clean, readable 28-line snippet of viz(v) and detect API primitives used
    const lines = item.viz.toString().split('\n');
    // Dedent common leading spaces on lines 1..end
    const indent = lines.slice(1).filter((l) => l.trim()).reduce((m, l) => Math.min(m, l.match(/^\s*/)[0].length), 99);
    const cleanLines = lines.map((l, i) => (i === 0 ? l.replace(/^function\s+/, '') : l.slice(Math.min(indent, l.length))));
    const apis = [];
    const apiChecks = [
      ['v.stage3d', /\bv\.stage3d\b/],
      ['v.stage', /\bv\.stage\b/],
      ['s.handle', /\.handle\s*\(/],
      ['v.slider', /\bv\.slider\b/],
      ['v.select', /\bv\.select\b/],
      ['v.toggle', /\bv\.toggle\b/],
      ['v.animate', /\bv\.animate\b/],
      ['v.sim', /\bv\.sim\b/],
      ['v.readout', /\bv\.readout\b/],
      ['s.heat/raster', /\.(?:heat|raster)\s*\(/],
      ['s.contour', /\.contour\s*\(/],
      ['s.field', /\.field\s*\(/],
      ['v.M.rk4/rk45', /\bM\.(?:rk4|rk45)\b/],
      ['v.M.fft', /\bM\.(?:fft|dft|spectrum)\b/],
      ['v.M.eig/svd', /\bM\.(?:eig|eigSym|eigH|svd)\b/],
      ['v.graph', /\bv\.graph\b/],
      ['v.globe', /\bv\.globe\b/],
      ['v.quantum', /\bv\.quantum\b/],
      ['v.icons', /\bv\.icons\b/],
      ['v.pplane', /\bv\.pplane\b/],
      ['v.sound', /\bv\.sound/],
    ];
    const fullFnStr = item.viz.toString();
    for (const [label, re] of apiChecks) if (re.test(fullFnStr)) apis.push(label);

    const meta = byId.get(id);
    const colMeta = colById.get(col);
    itemsDetail[id] = {
      id,
      col,
      colShort: colMeta.short,
      colTitle: colMeta.title,
      field: colMeta.field,
      num: item.num,
      kind: item.kind,
      name: item.name,
      credit: item.credit || null,
      yr: meta.yr || null,
      statement: item.statement || '',
      caption: item.caption || '',
      deps: meta.deps || [],
      anc: meta.anc || 0,
      desc: meta.desc || 0,
      depth: meta.depth || 0,
      file: relFile,
      lines: cleanLines.length,
      apis,
      code: cleanLines.slice(0, 26).join('\n') + (cleanLines.length > 26 ? '\n  // …' : ''),
    };
  }

  const fnBody = fnEntries.join(',\n');
  const rawPreamble = rawSrc.slice(0, expIdx);
  const nonImportPreamble = rawPreamble.replace(/^\s*import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '');
  const combinedCode = nonImportPreamble + '\n' + fnBody;
  const preamble = rawPreamble.replace(/import\s+\{([^}]+)\}\s+from\s+['"](\.[^'"]+)['"];?/g, (_, specs, rel) => {
    const kept = specs
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s) => {
        const local = s.split(/\s+as\s+/).pop().trim();
        return new RegExp(`\\b${local}\\b`).test(combinedCode);
      });
    if (!kept.length) return '';
    return `import { ${kept.join(', ')} } from ${JSON.stringify(path.resolve(dir, rel))};`;
  });

  const wrapperPath = path.join(tmpDir, `mod_${fileCounter++}.mjs`);
  fs.writeFileSync(wrapperPath, `${preamble}\nexport const ITEMS = {\n${fnBody}\n};\n`);
  entryLines.push(`import { ITEMS as I_${fileCounter} } from ${JSON.stringify(wrapperPath)}; Object.assign(VIZ, I_${fileCounter});`);
}

entryLines.push(`export { mount, richHTML, inlineHTML, renderRich, katexHTML, escapeHTML, resetColors, resolveColor, M };`);
const entryPath = path.join(tmpDir, 'entry.mjs');
const coreOutPath = path.join(BLOG_ROOT, 'assets/js/theorems-visualizations-core.js');
fs.writeFileSync(entryPath, entryLines.join('\n'));

execFileSync(
  ESBUILD,
  [
    entryPath,
    '--bundle',
    '--format=iife',
    '--global-name=TheoremsVizCore',
    '--target=es2022',
    '--minify',
    `--outfile=${coreOutPath}`,
    '--log-level=warning',
  ],
  { stdio: 'inherit' }
);

fs.rmSync(tmpDir, { recursive: true, force: true });
console.log(`Wrote ${coreOutPath} (${(fs.statSync(coreOutPath).size / 1024).toFixed(1)} KB)`);

// Scan all content files for global runtime primitive usage & verification test stats
const primitiveCounts = {
  stage2d: 0,
  stage3d: 0,
  handles: 0,
  sliders: 0,
  selects: 0,
  toggles: 0,
  animates: 0,
  readouts: 0,
  ode: 0,
  fft: 0,
  linalg: 0,
  heatDomain: 0,
  kits: {
    graph: 0, pplane: 0, globe: 0, circuit: 0, mol: 0, quantum: 0,
    agents: 0, timeline: 0, table: 0, tree: 0, icons: 0, scene3: 0,
    fields: 0, curves: 0, steps: 0,
  },
};

const seenFiles = new Set(indexData.items.map((i) => i.file));
for (const relFile of seenFiles) {
  const src = fs.readFileSync(path.join(TV_ROOT, relFile), 'utf8');
  primitiveCounts.stage2d += (src.match(/\bv\.stage\s*\(/g) || []).length;
  primitiveCounts.stage3d += (src.match(/\bv\.stage3d\s*\(/g) || []).length;
  primitiveCounts.handles += (src.match(/\.handle\s*\(/g) || []).length;
  primitiveCounts.sliders += (src.match(/\bv\.slider\s*\(/g) || []).length;
  primitiveCounts.selects += (src.match(/\bv\.select\s*\(/g) || []).length;
  primitiveCounts.toggles += (src.match(/\bv\.toggle\s*\(/g) || []).length;
  primitiveCounts.animates += (src.match(/\bv\.(?:animate|sim)\s*\(/g) || []).length;
  primitiveCounts.readouts += (src.match(/\bv\.readout\s*\(/g) || []).length;
  primitiveCounts.ode += (src.match(/\bM\.(?:rk4|rk45|euler|implicitEuler|verlet|leapfrog|symplecticEuler|gillespie)\b/g) || []).length;
  primitiveCounts.fft += (src.match(/\bM\.(?:fft|ifft|fftReal|dft|fft2|spectrum|fourierCoeffs|trigCoeffs)\b/g) || []).length;
  primitiveCounts.linalg += (src.match(/\bM\.(?:eig|eigSym|eigH|eigC|svd|lu|qr|cholesky|solve|pinv|lstsq|expm)\b/g) || []).length;
  primitiveCounts.heatDomain += (src.match(/\.(?:heat|raster|domain|contour)\s*\(/g) || []).length;
  for (const k of Object.keys(primitiveCounts.kits)) {
    primitiveCounts.kits[k] += (src.match(new RegExp(`\\bv\\.${k}\\b`, 'g')) || []).length;
  }
}

// Longest reasoning chain (77 steps ending at cplx-13.9)
function computeLongestChain(targetId) {
  const chain = [targetId];
  while (true) {
    const cur = byId.get(chain[chain.length - 1]);
    if (!cur || !cur.deps || !cur.deps.length) break;
    const candidates = cur.deps.map((d) => byId.get(d)).filter(Boolean);
    if (!candidates.length) break;
    candidates.sort((a, b) => b.depth - a.depth || b.desc - a.desc);
    chain.push(candidates[0].id);
  }
  return chain.reverse();
}
const longestChainIds = computeLongestChain('cplx-13.9');

// Depth histogram by field (13 x 77)
const maxDepth = Math.max(...indexData.items.map((i) => i.depth));
const depthByField = indexData.fields.map(() => new Array(maxDepth + 1).fill(0));
for (const it of indexData.items) {
  const fIdx = fieldById.get(colById.get(it.col).field).idx;
  depthByField[fIdx][it.depth]++;
}

// Written cross-field edges + concrete top examples per field pair
const writtenFieldEdges = new Map();
const fieldPairExamples = new Map();
for (const it of indexData.items) {
  const toField = colById.get(it.col).field;
  for (const depId of it.deps) {
    const dep = byId.get(depId);
    if (!dep) continue;
    const fromField = colById.get(dep.col).field;
    if (fromField === toField) continue;
    const key = `${fromField}>${toField}`;
    writtenFieldEdges.set(key, (writtenFieldEdges.get(key) || 0) + 1);
    if (!fieldPairExamples.has(key)) fieldPairExamples.set(key, []);
    fieldPairExamples.get(key).push({
      from: dep.id,
      fromName: dep.name,
      to: it.id,
      toName: it.name,
      score: dep.desc + it.desc + it.anc,
    });
  }
}
const crossFieldFlows = indexData.fieldEdges
  .map((fe) => {
    const key = `${fe.from}>${fe.to}`;
    const exs = (fieldPairExamples.get(key) || [])
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map(({ from, fromName, to, toName }) => [from, fromName, to, toName]);
    return {
      from: fe.from,
      to: fe.to,
      total: fe.n,
      written: writtenFieldEdges.get(key) || 0,
      examples: exs,
    };
  })
  .sort((a, b) => b.written - a.written || b.total - a.total);

// Landmark papers (written + planned) for the timeline
const landmarkPapers = [];
for (const it of indexData.items) {
  if (it.kind === 'Paper' && it.yr != null) {
    landmarkPapers.push([
      it.id,
      colById.get(it.col).idx,
      it.yr,
      it.name,
      it.au || '',
      (it.intro || []).slice(0, 4),
      1, // written + interactive
    ]);
  }
}
for (const [colId, rows] of Object.entries(plannedData.cols || {})) {
  const cObj = colById.get(colId);
  if (!cObj) continue;
  for (const r of rows) {
    const kindName = plannedData.kinds[r[2]];
    const pMeta = r[7];
    if (kindName === 'Paper' && pMeta && pMeta.y != null) {
      landmarkPapers.push([
        `${colId}-${r[0]}`,
        cObj.idx,
        pMeta.y,
        r[3],
        pMeta.a || '',
        (pMeta.i || []).slice(0, 4),
        0,
      ]);
    }
  }
}
landmarkPapers.sort((a, b) => a[2] - b[2]);

// Kind counts
const kindCounts = {};
for (const it of indexData.items) kindCounts[it.kind] = (kindCounts[it.kind] || 0) + 1;

// Compact nodes array: [num, colIdx, x, y, depth, anc, desc, depsIdx[], name, yrOrNull, kindIdx]
const kindList = Object.keys(kindCounts).sort((a, b) => kindCounts[b] - kindCounts[a]);
const kindToIdx = new Map(kindList.map((k, i) => [k, i]));

const compactNodes = indexData.items.map((it) => [
  it.num,
  colById.get(it.col).idx,
  it.x,
  it.y,
  it.depth,
  it.anc,
  it.desc,
  it.deps.map((d) => byId.get(d)?.idx).filter((x) => x !== undefined),
  it.name,
  it.yr ?? null,
  kindToIdx.get(it.kind) ?? 0,
]);

// Bridges with step metadata
const bridgesOut = indexData.bridges.map((b) => ({
  slug: b.slug,
  title: b.title,
  blurb: b.blurb,
  steps: b.steps.map((st) => {
    const it = byId.get(st.id);
    if (it) {
      const colObj = colById.get(it.col);
      return {
        id: st.id,
        name: it.name,
        col: it.col,
        colShort: colObj.short,
        field: colObj.field,
        kind: it.kind,
        depth: it.depth,
        anc: it.anc,
        desc: it.desc,
        note: st.note,
        bundled: Boolean(itemsDetail[st.id]),
        written: true,
      };
    }
    const colPrefix = st.id.split('-')[0];
    const colObj = colById.get(colPrefix);
    return {
      id: st.id,
      name: st.id,
      col: colPrefix,
      colShort: colObj ? colObj.short : colPrefix.toUpperCase(),
      field: colObj ? colObj.field : 'math',
      kind: 'Planned',
      depth: null,
      anc: 0,
      desc: 0,
      note: st.note,
      bundled: false,
      written: false,
    };
  }),
}));

// Count verification test files by domain prefix
const testFiles = fs.readdirSync(path.join(TV_ROOT, 'tests')).filter((f) => f.startsWith('verification-') && f.endsWith('.test.mjs'));
let totalTestAssertions = 0;
let totalTestCases = 0;
for (const tf of testFiles) {
  const tsrc = fs.readFileSync(path.join(TV_ROOT, 'tests', tf), 'utf8');
  totalTestCases += (tsrc.match(/\btest\s*\(/g) || []).length;
  totalTestAssertions += (tsrc.match(/\b(?:near|assert\.|ok\(|close\()/g) || []).length;
}

const demoOut = {
  generated: indexData.generated,
  totals: {
    items: indexData.items.length,
    viz: indexData.items.filter((i) => i.viz).length,
    planned: indexData.plannedCount,
    edges: indexData.items.reduce((s, i) => s + i.deps.length, 0),
    crossFieldWritten: [...writtenFieldEdges.values()].reduce((a, b) => a + b, 0),
    crossFieldTotal: indexData.fieldEdges.reduce((s, e) => s + e.n, 0),
    collections: indexData.collections.length,
    fields: indexData.fields.length,
    chapters: indexData.collections.reduce((s, c) => s + c.chapters.filter((ch) => ch.count > 0).length, 0),
    papers: indexData.paperCount,
    datedItems: indexData.items.filter((i) => i.yr != null).length,
    bridges: indexData.bridges.length,
    bridgeSteps: indexData.bridges.reduce((s, b) => s + b.steps.length, 0),
    maxDepth,
    longestChainLen: longestChainIds.length,
    roots: indexData.items.filter((i) => i.deps.length === 0).length,
    rudinItems: indexData.items.filter((i) => ['pma', 'rca', 'fa'].includes(i.col)).length,
    verificationSuites: testFiles.length,
    verificationTests: totalTestCases,
    verificationChecks: totalTestAssertions,
  },
  kinds: kindList.map((k) => [k, kindCounts[k]]),
  primitives: primitiveCounts,
  fields: indexData.fields.map((f, idx) => {
    const fCols = indexData.collections.filter((c) => c.field === f.id);
    const fItems = indexData.items.filter((i) => colById.get(i.col).field === f.id);
    return {
      id: f.id,
      idx,
      title: f.title,
      short: f.short,
      color: f.color,
      collections: fCols.length,
      count: fItems.length,
      viz: fItems.filter((i) => i.viz).length,
      planned: fCols.reduce((s, c) => s + (c.planned || 0), 0),
      maxDepth: Math.max(0, ...fItems.map((i) => i.depth)),
      roots: fItems.filter((i) => i.deps.length === 0).length,
    };
  }),
  collections: indexData.collections.map((c, idx) => ({
    id: c.id,
    idx,
    short: c.short,
    title: c.title,
    field: c.field,
    fieldIdx: fieldById.get(c.field).idx,
    area: c.area,
    color: c.color,
    sourceType: c.source?.type || 'course',
    sourceAuthor: c.source?.author || null,
    count: c.count,
    viz: c.viz,
    planned: c.planned || 0,
    chapters: c.chapters.filter((ch) => ch.count > 0).length,
  })),
  map: indexData.map,
  nodes: compactNodes,
  longestChain: longestChainIds.map((id) => byId.get(id).idx),
  depthByField,
  crossFieldFlows,
  flagships: FLAGSHIPS,
  itemsDetail,
  bridges: bridgesOut,
  papers: landmarkPapers,
};

const jsonOutPath = path.join(BLOG_ROOT, 'assets/data/theorems-visualizations-demo.json');
fs.writeFileSync(jsonOutPath, JSON.stringify(demoOut));
console.log(`Wrote ${jsonOutPath} (${(fs.statSync(jsonOutPath).size / 1024).toFixed(1)} KB)`);
console.log('Summary totals:', demoOut.totals);
