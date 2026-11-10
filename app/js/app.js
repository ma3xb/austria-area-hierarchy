const DATA = '../deliverables/austria-hierarchy.topojson';
const REL_CSV = '../deliverables/AT_PLZ_Brick_Relation.csv';

const LEVELS = {
  postalcodes: { label: 'postal codes', key: 'plz' },
  macrobricks: { label: 'macrobricks', key: 'macro' },
  standardregions: { label: 'standardregions', key: 'streg' },
  bundeslaender: { label: 'Bundesländer', key: 'bl' },
  nanobricks: { label: 'nanobricks', key: 'nano' },
};
const SRC_STYLE = {
  osm_boundary: { color: '#1d4f85', fillColor: '#3b82c4', weight: 1, fillOpacity: 0.25 },
  derived: { color: '#a05a10', fillColor: '#e8913a', weight: 1, fillOpacity: 0.4 },
};
const BL_HUE = { 1: 28, 2: 48, 3: 100, 4: 150, 5: 190, 6: 215, 7: 255, 8: 290, 9: 335 };
const HOVER = { weight: 3, fillOpacity: 0.7 };

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '–').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const info = $('info');

const CE_BOUNDS = L.latLngBounds([42.5, 2.0], [56.5, 25.0]);   // central Europe
const map = L.map('map', { maxBounds: CE_BOUNDS, maxBoundsViscosity: 1, zoomControl: false, preferCanvas: true, zoomSnap: .25, zoomDelta: .5, wheelPxPerZoomLevel: 90 }).setView([47.6, 13.4], 8);
L.control.zoom({ position: 'topright' }).addTo(map);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19, referrerPolicy: 'strict-origin-when-cross-origin',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);
map.createPane('split').style.zIndex = 450;
const splitRenderer = L.svg({ pane: 'split' });   // own SVG renderer: a 2nd canvas on top would swallow mouse events for the layers below
const fitMinZoom = () => map.setMinZoom(map.getBoundsZoom(CE_BOUNDS, true));
fitMinZoom(); map.on('resize', fitMinZoom);
const SEL_HINT = '<br><small>Click for full information</small>';
function label(p, lvl) {
  if (lvl === 'postalcodes') return `<b>${esc(p.plz)}</b> ${esc(p.municipality)}`;
  if (lvl === 'macrobricks') return `<b>${esc(p.macro)}</b> ${esc(p.macro_name)}`;
  if (lvl === 'standardregions') return `<b>${esc(p.streg)}</b> ${esc(p.streg_name)}`;
  if (lvl === 'bundeslaender') return `<b>${esc(p.bl_name)}</b>`;
  return `<b>${esc(p.nano)}</b> ${esc(p.nano_name)}`;
}

let topo, feats = {}, level = 'postalcodes';
const layers = {};   // level -> L.FeatureGroup
const byKey = {};    // level -> Map(key -> leaflet layer)
let splitLayer;

// ---- colours: hue = Bundesland, lightness varies per unit inside it ----
const macroIdx = {};
function colour(p, lvl) {
  const bl = p.bl ?? String(p.macro || '').slice(0, 1);
  const h = BL_HUE[bl] ?? 0;
  const id = String(p.macro ?? p.streg ?? p.bl ?? '');
  let n = 0;
  for (const c of id) n = (n * 31 + c.charCodeAt(0)) % 997;
  const l = lvl === 'bundeslaender' ? 55 : 42 + (n % 6) * 7;
  return `hsl(${h} 60% ${l}%)`;
}
function styleFor(f, lvl) {
  const p = f.properties;
  if (lvl === 'postalcodes') return SRC_STYLE[p.source];
  if (lvl === 'nanobricks') return { color: '#fff', weight: 0.8, fillColor: colour(p, lvl), fillOpacity: 0.6 };
  return { color: '#333', weight: lvl === 'bundeslaender' ? 2 : 1, fillColor: colour(p, lvl), fillOpacity: 0.5 };
}

// ---- popups / info text ----
const pct = s => `${Math.round(s * 100)}%`;
function describe(p, lvl) {
  if (lvl === 'postalcodes') {
    const bricks = p.bricks ? p.bricks.split(';').map(x => { const [m, s] = x.split(':'); return `${m} ${s}`; }).join(', ') : '–';
    return `<b>${esc(p.plz)}</b> ${esc(p.municipality)}${p.is_split ? ' <b style="color:#c0392b">· split PLZ</b>' : ''}<br>` +
      `Macrobrick: ${esc(p.macro)} ${esc(p.macro_name)}<br>Standardregion: ${esc(p.streg_name)} · ${esc(p.bl_name)}<br>` +
      `Bricks: ${esc(bricks)}<br>${(p.n_addr ?? 0).toLocaleString('en')} addresses · ${p.source === 'derived' ? 'derived (approx.)' : 'OSM boundary'}`;
  }
  if (lvl === 'macrobricks') return `<b>${esc(p.macro)}</b> ${esc(p.macro_name)}<br>${esc(p.streg_name)} · ${esc(p.bl_name)}<br>${p.n_plz} PLZ (${p.n_split_plz} split) · ${p.n_nano} nanobricks · ${p.area_km2} km²<br>Confidence: ${esc(p.confidence)}`;
  if (lvl === 'standardregions') return `<b>${esc(p.streg)}</b> ${esc(p.streg_name)}<br>${p.n_macro} macrobricks · ${p.area_km2} km²`;
  if (lvl === 'bundeslaender') return `<b>${esc(p.bl_name)}</b><br>${p.n_macro} macrobricks · ${p.area_km2} km²`;
  return `<b>${esc(p.nano)}</b> ${esc(p.nano_name)}<br>Macrobrick ${esc(p.macro)} ${esc(p.macro_name)}<br>${p.area_km2} km²${p.shares_face_with ? `<br>shares polygon with ${esc(p.shares_face_with)}` : ''}`;
}

function buildLevel(lvl) {
  const group = L.featureGroup();
  byKey[lvl] = new Map();
  const sub = {};
  const mk = src => sub[src] ??= L.geoJSON(null, {
    style: f => styleFor(f, lvl),
    onEachFeature: (f, l) => {
      byKey[lvl].set(f.properties[LEVELS[lvl].key], l);
      l.bindPopup(() => describe(f.properties, lvl));
      l.on({
        mouseover: () => { l.setStyle(HOVER); l.bringToFront(); info.innerHTML = label(f.properties, lvl) + SEL_HINT; },
        mouseout: () => sub[src].resetStyle(l),
        click: () => { info.innerHTML = describe(f.properties, lvl); },
      });
    },
  });
  for (const f of feats[lvl]) {
    const src = lvl === 'postalcodes' ? f.properties.source : 'all';
    mk(src).addData(f);
  }
  Object.entries(sub).forEach(([src, g]) => { g.src = src; group.addLayer(g); });
  group.sub = sub;
  layers[lvl] = group;
}

function buildSplit() {
  splitLayer = L.geoJSON(feats.plz_parts, {
    pane: 'split', renderer: splitRenderer,
    style: f => ({ color: '#c0392b', weight: 2, dashArray: '5 3', fillColor: colour({ macro: f.properties.macro }, 'macrobricks'), fillOpacity: 0.75 }),
    onEachFeature: (f, l) => {
      const parts = feats.plz_parts.filter(x => x.properties.plz === f.properties.plz)
        .map(x => `${esc(x.properties.macro)} ${esc(x.properties.macro_name)}: ${pct(x.properties.share)}${x.properties.is_file_brick ? ' (PLZ file brick)' : ''}`).join('<br>');
      const html = `<b>Split PLZ ${esc(f.properties.plz)}</b><br>${parts}<br><i>cut: ${esc(f.properties.split_rule)}</i>`;
      l.bindPopup(html);
      l.on({ mouseover: () => { info.innerHTML = `<b>Split PLZ ${esc(f.properties.plz)}</b>` + SEL_HINT; l.setStyle({ weight: 3.5 }); }, mouseout: () => splitLayer.resetStyle(l), click: () => { info.innerHTML = html; } });
    },
  });
}

function legend() {
  $('legend').innerHTML = level === 'postalcodes'
    ? '<div><i class="sw boundary"></i> OSM postal-code boundary</div><div><i class="sw derived"></i> derived from addresses</div>'
    : '<div>Colour hue = Bundesland, shade = unit</div>';
  $('legend').innerHTML += '<div><i class="sw split"></i> split PLZ part (dashed red outline, fill = brick)</div>';
}

function applyView() {
  $('srcgrp').hidden = level !== 'postalcodes';
  for (const [lvl, g] of Object.entries(layers)) if (lvl !== level) map.removeLayer(g);
  if (!layers[level]) buildLevel(level);
  const g = layers[level];
  if (level === 'postalcodes') {
    const want = { osm_boundary: $('f-osm').checked, derived: $('f-derived').checked };
    Object.entries(g.sub).forEach(([src, sl]) => want[src] ? g.addLayer(sl) : g.removeLayer(sl));
    const n = feats.postalcodes.filter(f => want[f.properties.source]).length;
    $('count').textContent = `${n} postal codes`;
    $('hint').style.color = '#555'; $('hint').textContent = `${n} postal codes loaded`;
  } else {
    $('count').textContent = `${feats[level].length} ${LEVELS[level].label}`;
    $('hint').textContent = '';
  }
  g.addTo(map);
  if (level === 'postalcodes' && g.sub.derived && $('f-derived').checked) g.sub.derived.bringToFront();
  if (splitLayer) { $('f-split').checked ? splitLayer.addTo(map) : map.removeLayer(splitLayer); }
  legend();
}

fetch(DATA).then(r => r.json()).then(t => {
  topo = t;
  for (const k of [...Object.keys(LEVELS), 'plz_parts']) feats[k] = topojson.feature(t, t.objects[k]).features;
  const h = new URLSearchParams(location.hash.slice(1));
  if (LEVELS[h.get('level')]) { level = h.get('level'); document.querySelector(`input[name=level][value=${level}]`).checked = true; }
  buildSplit();
  applyView();
  $('loading').classList.add('hide');
  buildTables().then(() => {
    if (h.get('table') && tables[h.get('table')]) { $('dataset').value = h.get('table'); showTable(h.get('table')); }
    if (h.get('tab') === 'table') document.querySelector('.tab[data-tab=table]').click();
  });
}).catch(e => { $('loading').textContent = 'Failed to load data: ' + e.message; });

document.querySelectorAll('input[name=level]').forEach(r => r.addEventListener('change', () => { level = r.value; applyView(); }));
['f-osm', 'f-derived', 'f-split'].forEach(id => $(id).addEventListener('change', applyView));

// ---- search ----
$('search').addEventListener('submit', ev => {
  ev.preventDefault();
  const q = $('q').value.trim().toLowerCase();
  const hint = $('hint');
  if (!feats.postalcodes || !q) return;
  const go = (lvl, key) => {
    document.querySelector(`input[name=level][value=${lvl}]`).checked = true;
    level = lvl; applyView();
    const l = byKey[lvl].get(key);
    if (l) { map.fitBounds(l.getBounds()); l.openPopup(l.getBounds().getCenter()); }
  };
  if (feats.postalcodes.some(f => f.properties.plz === q)) { hint.textContent = ''; return go('postalcodes', q); }
  const mac = feats.macrobricks.find(f => f.properties.macro === q || (f.properties.macro_name || '').toLowerCase().includes(q));
  if (mac) { hint.textContent = ''; return go('macrobricks', mac.properties.macro); }
  const hits = feats.postalcodes.filter(f => ['municipality', 'district'].some(k => (f.properties[k] || '').toLowerCase().includes(q)));
  if (hits.length) {
    document.querySelector('input[name=level][value=postalcodes]').checked = true; level = 'postalcodes'; applyView();
    map.fitBounds(L.featureGroup(hits.map(f => byKey.postalcodes.get(f.properties.plz))).getBounds());
    hint.style.color = '#555'; hint.textContent = `${hits.length} postal codes match`; return;
  }
  hint.style.color = '#b00'; hint.textContent = 'Not found';
});

// ---- tabs ----
document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === b));
  $('view-map').hidden = b.dataset.tab !== 'map';
  $('view-table').hidden = b.dataset.tab !== 'table';
  if (b.dataset.tab === 'map') map.invalidateSize();
}));

// ---- table: generic, columns derived from the data; per-column search/filter ----
let tables = {}, cur = null, filters = {}, sort = {};
const TEXT_IDS = /(^|_)(id|plz)$/i;
const TABLE_NAMES = { postalcodes: 'Postal codes', relation: 'PLZ x brick relation', plz_parts: 'Split PLZ parts', macrobricks: 'Macrobricks', standardregions: 'Standardregions', bundeslaender: 'Bundesländer', nanobricks: 'Nanobricks' };

function parseCsv(txt) {
  const lines = txt.replace(/^﻿/, '').trim().split(/\r?\n/);
  const head = lines[0].split(';');
  return lines.slice(1).map(l => Object.fromEntries(l.split(';').map((v, i) => {
    const k = head[i];
    if (!TEXT_IDS.test(k) && /^-?\d+(,\d+)?$/.test(v)) return [k, Number(v.replace(',', '.'))];
    return [k, v];
  })));
}

async function buildTables() {
  for (const k of ['postalcodes', 'plz_parts', 'macrobricks', 'standardregions', 'bundeslaender', 'nanobricks']) tables[k] = feats[k].map(f => f.properties);
  try { tables.relation = parseCsv(await (await fetch(REL_CSV)).text()); } catch (e) { /* relation table optional */ }
  $('dataset').innerHTML = Object.keys(TABLE_NAMES).filter(k => tables[k]).map(k => `<option value="${k}">${TABLE_NAMES[k]} (${tables[k].length})</option>`).join('');
  $('dataset').onchange = () => showTable($('dataset').value);
  $('reset').onclick = () => { filters = {}; showTable(cur, true); };
  showTable('postalcodes');
}

function showTable(name, keepSort) {
  cur = name; filters = {};
  const rows = tables[name], cols = Object.keys(rows[0] || {});
  if (!keepSort) sort[name] ??= { key: cols[0], dir: 1 };
  const tbl = $('tbl'), head = tbl.tHead;
  head.innerHTML = '<tr></tr><tr></tr>';
  const meta = {};
  cols.forEach(c => {
    const vals = rows.map(r => r[c]);
    const num = vals.every(v => typeof v === 'number');
    const distinct = [...new Set(vals.map(v => String(v ?? '')))];
    meta[c] = { num, select: !num && distinct.length <= 12 ? distinct.sort() : null };
    const th = document.createElement('th'); th.textContent = c;
    th.onclick = () => { const s = sort[name]; sort[name] = { key: c, dir: s.key === c ? -s.dir : 1 }; renderRows(); };
    head.rows[0].appendChild(th);
    const fh = document.createElement('th'); let el;
    if (meta[c].select) {
      el = document.createElement('select');
      el.innerHTML = '<option value="">All</option>' + meta[c].select.map(v => `<option value="${esc(v)}">${esc(v) || '(empty)'}</option>`).join('');
    } else {
      el = document.createElement('input'); el.placeholder = num ? 'e.g. >100, <=5' : 'filter…';
    }
    el.addEventListener('input', () => { filters[c] = el.value.trim().toLowerCase(); renderRows(); });
    fh.appendChild(el); head.rows[1].appendChild(fh);
  });
  tbl.dataset.meta = '';
  tbl._meta = meta; tbl._cols = cols;
  renderRows();
}

function matches(v, c, f, m) {
  if (m.select) return String(v ?? '').toLowerCase() === f;
  if (m.num) {
    const mm = f.match(/^(>=|<=|>|<|=)?\s*(-?\d+(?:[.,]\d+)?)$/);
    if (!mm) return String(v).includes(f);
    const n = +mm[2].replace(',', '.');
    return { '>': v > n, '<': v < n, '>=': v >= n, '<=': v <= n }[mm[1]] ?? v === n;
  }
  return String(v ?? '').toLowerCase().includes(f);
}

function renderRows() {
  const tbl = $('tbl'), meta = tbl._meta, cols = tbl._cols, all = tables[cur];
  const rows = all.filter(r => cols.every(c => !filters[c] || matches(r[c], c, filters[c], meta[c])));
  const s = sort[cur];
  rows.sort((a, b) => ((a[s.key] ?? '') > (b[s.key] ?? '') ? 1 : (a[s.key] ?? '') < (b[s.key] ?? '') ? -1 : 0) * s.dir);
  tbl.tBodies[0].innerHTML = rows.map(r => '<tr>' + cols.map(c => {
    const v = r[c];
    return `<td${meta[c].num ? ' class="num"' : ''}>${v === null || v === undefined ? '' : meta[c].num ? v.toLocaleString('en') : esc(v)}</td>`;
  }).join('') + '</tr>').join('');
  $('tcount').textContent = `${rows.length} of ${all.length} rows`;
}
