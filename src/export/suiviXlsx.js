// src/export/suiviXlsx.js
// Lit et remplit le fichier Excel « Suivi Mensuel » envoyé chaque mois.
//
// Principe : on modifie directement le XML du fichier, cellule par cellule.
// Tout le reste est gardé tel quel : formules (H, M), listes déroulantes,
// onglets Données et Synthèse, tableau croisé.
//
// JS pur + JSZip : marche sur Android, iOS, web et dans Node (tests).

import JSZip from 'jszip';
import { excelSerial, dateStrFromExcelSerial } from './monthModel.js';

// ─── Petits outils XML ──────────────────────────────────────────────

const decode = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/&amp;/g, '&');

const encode = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const CELL_RE = /<c r="([A-Z]+)(\d+)"[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g;

function colIndex(col) {
  let n = 0;
  for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

function attr(xml, name) {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(xml);
  return m ? m[1] : null;
}

function cellValue(cellXml, sharedStrings) {
  const t = attr(cellXml.slice(0, cellXml.indexOf('>') + 1), 't');
  if (t === 'inlineStr') {
    const m = /<t[^>]*>([\s\S]*?)<\/t>/.exec(cellXml);
    return m ? decode(m[1]) : '';
  }
  const v = /<v>([\s\S]*?)<\/v>/.exec(cellXml);
  if (!v) return null;
  if (t === 's') return sharedStrings[Number(v[1])] ?? '';
  if (t === 'str') return decode(v[1]);
  return Number(v[1]);
}

/** Contenu d'une ligne (<row r="n">…</row>) ou null */
function findRow(sheetXml, r) {
  const re = new RegExp(`<row r="${r}"[^>]*?(?:/>|>([\\s\\S]*?)</row>)`);
  const m = re.exec(sheetXml);
  return m ? { full: m[0], inner: m[1] || '', index: m.index } : null;
}

function rowCells(inner) {
  const map = new Map();
  for (const m of inner.matchAll(CELL_RE)) map.set(m[1], m[0]);
  return map;
}

// ─── Ouverture du fichier ───────────────────────────────────────────

async function openZip(input) {
  return JSZip.loadAsync(input, typeof input === 'string' ? { base64: true } : {});
}

async function sheetPaths(zip) {
  const wb = await zip.file('xl/workbook.xml').async('string');
  const rels = await zip.file('xl/_rels/workbook.xml.rels').async('string');
  const relTarget = {};
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    relTarget[attr(m[0], 'Id')] = attr(m[0], 'Target');
  }
  const out = {};
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const name = decode(attr(m[0], 'name'));
    let target = relTarget[attr(m[0], 'r:id')];
    if (!target) continue;
    target = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
    out[name] = target;
  }
  return out;
}

async function readSharedStrings(zip) {
  const f = zip.file('xl/sharedStrings.xml');
  if (!f) return [];
  const xml = await f.async('string');
  const out = [];
  for (const si of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    // Un <si> peut contenir plusieurs morceaux <t> (texte enrichi)
    out.push([...si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => decode(t[1])).join(''));
  }
  return out;
}

/**
 * Lit le fichier du mois.
 * @returns {{ dates: Array<{row, dateStr}>, projects: string[], weekFormulas: Array<{cell, row, from, to}>, month: string }}
 */
export async function readSuivi(input) {
  const zip = await openZip(input);
  const paths = await sheetPaths(zip);
  const suiviPath = paths['Suivi'];
  const donneesPath = paths['Données'];
  if (!suiviPath) throw new Error('Onglet « Suivi » introuvable dans ce fichier.');

  const ss = await readSharedStrings(zip);
  const suivi = await zip.file(suiviPath).async('string');

  const dates = [];
  const weekFormulas = [];
  for (const rowM of suivi.matchAll(/<row r="(\d+)"[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const r = Number(rowM[1]);
    if (r < 2 || !rowM[2]) continue;
    const cells = rowCells(rowM[2]);
    const a = cells.get('A');
    const serial = a ? cellValue(a, ss) : null;
    if (typeof serial === 'number' && serial > 30000) dates.push({ row: r, dateStr: dateStrFromExcelSerial(serial) });
    const mCell = cells.get('M');
    const f = mCell && /<f>SUM\(H(\d+):H(\d+)\)<\/f>/.exec(mCell);
    if (f) weekFormulas.push({ cell: `M${r}`, row: r, from: Number(f[1]), to: Number(f[2]) });
  }
  if (!dates.length) throw new Error('Aucune date trouvée en colonne A de l’onglet « Suivi ».');

  const projects = [];
  if (donneesPath) {
    const donnees = await zip.file(donneesPath).async('string');
    for (const rowM of donnees.matchAll(/<row r="(\d+)"[^>]*?>([\s\S]*?)<\/row>/g)) {
      if (Number(rowM[1]) < 2) continue;
      const b = rowCells(rowM[2]).get('B');
      const v = b ? cellValue(b, ss) : null;
      if (typeof v === 'string' && v.length) projects.push(v); // valeur EXACTE (espaces compris)
    }
  }

  return { dates, projects, weekFormulas, month: dates[0].dateStr.slice(0, 7) };
}

// ─── Styles : clone d'un style existant avec le format h:mm ─────────

const NUMFMT_HMM = 20; // format intégré Excel « h:mm »

function makeStyler(stylesXml) {
  const m = /<cellXfs count="(\d+)">([\s\S]*?)<\/cellXfs>/.exec(stylesXml);
  const xfs = [...m[2].matchAll(/<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g)].map((x) => x[0]);
  const added = [];
  const cache = new Map();

  const clone = (baseIndex, { numFmtId, center } = {}) => {
    const key = `${baseIndex}|${numFmtId}|${center}`;
    if (cache.has(key)) return cache.get(key);
    let xf = xfs[baseIndex] || xfs[0];
    if (numFmtId !== undefined) {
      xf = xf.replace(/numFmtId="\d+"/, `numFmtId="${numFmtId}"`);
      if (!/applyNumberFormat=/.test(xf)) xf = xf.replace('<xf ', '<xf applyNumberFormat="1" ');
      else xf = xf.replace(/applyNumberFormat="\d"/, 'applyNumberFormat="1"');
    }
    if (center && !/<alignment/.test(xf)) {
      const open = xf.endsWith('/>') ? xf.slice(0, -2) : xf.slice(0, xf.indexOf('>'));
      xf = `${open.replace('<xf ', '<xf applyAlignment="1" ')}><alignment horizontal="center" vertical="center"/></xf>`;
    }
    const index = xfs.length + added.length;
    added.push(xf);
    cache.set(key, index);
    return index;
  };

  const finish = () => {
    if (!added.length) return stylesXml;
    const all = xfs.concat(added);
    return stylesXml.replace(m[0], `<cellXfs count="${all.length}">${all.join('')}</cellXfs>`);
  };

  return { clone, finish };
}

// ─── Remplissage ────────────────────────────────────────────────────

const strCell = (ref, s, text) =>
  `<c r="${ref}"${s != null ? ` s="${s}"` : ''} t="inlineStr"><is><t xml:space="preserve">${encode(text)}</t></is></c>`;
const numCell = (ref, s, n) => {
  const open = `<c r="${ref}"${s != null ? ` s="${s}"` : ''}`;
  return n === null ? `${open}/>` : `${open}><v>${n}</v></c>`;
};

/**
 * Remplit le fichier.
 * @param input     fichier d'origine (base64 ou ArrayBuffer/Uint8Array)
 * @param rows      lignes calculées par computeMonth (dateStr, project, I, J, K, L, minutes, dailyRest, weeklyRest, pause)
 * @param location  texte de la colonne C
 * @returns base64 du nouveau fichier
 */
export async function fillSuivi(input, rows, { location }) {
  const zip = await openZip(input);
  const paths = await sheetPaths(zip);
  const suiviPath = paths['Suivi'];
  let sheet = await zip.file(suiviPath).async('string');
  const ss = await readSharedStrings(zip);
  const styler = makeStyler(await zip.file('xl/styles.xml').async('string'));

  const byDate = new Map(rows.map((r) => [r.dateStr, r]));
  const hoursByRow = new Map();

  // 1re passe : lignes de dates
  const rowNums = [...sheet.matchAll(/<row r="(\d+)"/g)].map((m) => Number(m[1])).filter((r) => r >= 2);
  for (const r of rowNums) {
    const found = findRow(sheet, r);
    if (!found || !found.inner) continue;
    const cells = rowCells(found.inner);
    const a = cells.get('A');
    const serial = a ? cellValue(a, ss) : null;
    if (typeof serial !== 'number') continue;
    const data = byDate.get(dateStrFromExcelSerial(serial));
    if (!data) continue;

    const styleOf = (col) => {
      const c = cells.get(col);
      const s = c ? attr(c.slice(0, c.indexOf('>') + 1), 's') : null;
      return s === null ? null : Number(s);
    };
    const baseText = styleOf('B') ?? 0;               // cellule « encadrée » du fichier
    const textStyle = styler.clone(baseText, { center: true });
    const timeStyle = (col) => styler.clone(styleOf(col) ?? baseText, { numFmtId: NUMFMT_HMM });
    const yesNo = (ok) => (ok ? 'Oui' : 'Non');
    const t = (min) => (min === null || min === undefined ? null : min / 1440);

    cells.set('B', strCell(`B${r}`, styleOf('B'), data.project));
    cells.set('C', strCell(`C${r}`, styleOf('C'), location));
    cells.set('D', strCell(`D${r}`, textStyle, yesNo(data.dailyRest)));
    cells.set('E', strCell(`E${r}`, textStyle, yesNo(data.weeklyRest)));
    cells.set('F', strCell(`F${r}`, textStyle, yesNo(data.pause)));
    cells.set('G', numCell(`G${r}`, styler.clone(baseText, { numFmtId: NUMFMT_HMM }), 30 / 1440));
    for (const [col, key] of [['I', 'I'], ['J', 'J'], ['K', 'K'], ['L', 'L']]) {
      cells.set(col, numCell(`${col}${r}`, timeStyle(col), t(data[key])));
    }
    // H : on garde la formule, on met juste à jour la valeur affichée en cache
    const h = cells.get('H');
    const hours = data.minutes / 60;
    hoursByRow.set(r, hours);
    if (h && /<f/.test(h)) {
      cells.set('H', /<v>/.test(h)
        ? h.replace(/<v>[^<]*<\/v>/, `<v>${hours}</v>`)
        : h.replace('</c>', `<v>${hours}</v></c>`));
    }

    const ordered = [...cells.entries()].sort((x, y) => colIndex(x[0]) - colIndex(y[0])).map((e) => e[1]).join('');
    const open = found.full.slice(0, found.full.indexOf('>') + 1).replace(/\/>$/, '>');
    sheet = sheet.slice(0, found.index) + open + ordered + '</row>' + sheet.slice(found.index + found.full.length);
  }

  // 2e passe : valeurs en cache des totaux M (formules SUM(Hx:Hy) inchangées)
  sheet = sheet.replace(/(<c r="M\d+"[^>]*>)<f>SUM\(H(\d+):H(\d+)\)<\/f>(?:<v>[^<]*<\/v>)?<\/c>/g, (all, open, a, b) => {
    let sum = 0;
    for (let r = Number(a); r <= Number(b); r++) sum += hoursByRow.get(r) || 0;
    return `${open}<f>SUM(H${a}:H${b})</f><v>${sum}</v></c>`;
  });

  zip.file(suiviPath, sheet);
  zip.file('xl/styles.xml', styler.finish());

  // Excel recalcule tout à l'ouverture
  let wb = await zip.file('xl/workbook.xml').async('string');
  if (!/fullCalcOnLoad/.test(wb)) {
    wb = /<calcPr\b/.test(wb)
      ? wb.replace('<calcPr', '<calcPr fullCalcOnLoad="1"')
      : wb.replace('</workbook>', '<calcPr fullCalcOnLoad="1"/></workbook>');
    zip.file('xl/workbook.xml', wb);
  }

  return zip.generateAsync({ type: 'base64', compression: 'DEFLATE' });
}

/** Nom du fichier rempli : « <nom d'origine sans .xlsx>_rempli.xlsx » */
export function filledName(originalName) {
  const base = (originalName || 'Suivi Mensuel').replace(/\.xlsx$/i, '');
  return `${base}_rempli.xlsx`;
}

export { excelSerial };
