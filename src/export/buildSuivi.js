// src/export/buildSuivi.js
// Crée le fichier « Suivi Mensuel » de zéro, sans modèle à importer.
//
// Le classeur produit reprend exactement la mise en page du fichier fourni
// par l'entreprise : mêmes colonnes A→M, mêmes couleurs d'en-tête, mêmes
// formules H et M, mêmes listes déroulantes « Oui / Non ».
//
// On écrit le XML à la main (comme suiviXlsx.js) : JS pur + JSZip, donc ça
// marche sur Android, iOS, web et dans Node pour les tests.

import JSZip from 'jszip';
import { excelSerial, weekdayIndex } from './monthModel.js';

// ─── Référence : le modèle de l'entreprise ──────────────────────────

/** En-têtes, repris au caractère près (espace de « Jour », retours à la ligne). */
const HEADERS = [
  'Jour ',                            // A
  'Projet',                           // B
  'Localisation',                     // C
  'Repos Quotidien\n (11h)',          // D
  'Repos Hebdomadaire\n (35h)',       // E
  'Pause Obligatoire\n(20-30 mn)',    // F
  'Durée Pause Obligatoire',          // G
  'Volume Horaire Quotidien\n(heures)', // H
  'Debut',                            // I
  'Debut\npause dejeuner',            // J
  'fin\npause dejeuner',              // K
  'fin',                              // L
];

/** Largeurs de colonnes du modèle (colonne → largeur Excel). */
const WIDTHS = { A: 14.27, B: 65.63, C: 23.82, D: 22.36, E: 20.91, F: 17, G: 17, J: 15.54, K: 11 };

const HEADER_HEIGHT = 62.5;

/** Liste de projets de l'onglet « Données » (valeurs exactes, espaces compris). */
export const DEFAULT_PROJECTS = [
  'VirtualBuro Front',
  'VirtualBuro Back',
  'Livindeco/Outils Gestion Produits',
  'Livindeco/Plateforme Web',
  'Livindeco/Gestion Technique Serveur (Veille, Surveillance, Logs)',
  'Financial Data History/Outils Webservices ',
  'Financial Data History/Plateforme Web',
  'Financial Data History/API',
  'Backbone Web/Maintenance',
  'CP',
  'Arrêt Maladie',
  'Congés sans solde',
  'Férié',
  'Autres',
];

const MOIS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

// ─── Outils XML ─────────────────────────────────────────────────────

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

/** Cellule texte (chaîne en ligne : pas besoin de sharedStrings). */
const str = (ref, s, text) =>
  `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(text)}</t></is></c>`;

/** Cellule nombre ; `null` → cellule vide mais stylée. */
const num = (ref, s, n) =>
  n === null || n === undefined ? `<c r="${ref}" s="${s}"/>` : `<c r="${ref}" s="${s}"><v>${n}</v></c>`;

/** Cellule formule, avec la valeur déjà calculée en cache. */
const formula = (ref, s, f, cached) =>
  `<c r="${ref}" s="${s}"><f>${esc(f)}</f><v>${cached}</v></c>`;

/** Minutes depuis minuit → fraction de journée (ce qu'attend Excel). */
const asTime = (min) => (min === null || min === undefined ? null : min / 1440);

// ─── Styles ─────────────────────────────────────────────────────────
//
// Index utilisés dans tout le fichier (ordre du <cellXfs>) :
const S = {
  DEFAULT:      0,
  HEAD_GREEN:   1, // A1 et H1
  HEAD_NAVY:    2, // B1 → G1
  HEAD_PLAIN:   3, // I1 → L1
  DATE:         4, // colonne A
  BOXED:        5, // colonnes B et C : fond gris + bordures
  HOURS:        6, // colonne H : fond gris + bordures + 0,00
  TIME_TOP:     7, // colonnes I → L : bordure haute épaisse + h:mm
  CENTER:       8, // colonnes D, E, F
  TIME:         9, // colonne G
  WEEK:        10, // colonne M : total hebdomadaire
};

const FMT_DATE = 164; // dd/mm/yyyy (format français)
const FMT_HMM  = 20;  // h:mm (format Excel intégré)
const FMT_2DEC = 2;   // 0.00 (format Excel intégré)

const STYLES_XML = `${XML_HEAD}
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="${FMT_DATE}" formatCode="dd/mm/yyyy"/></numFmts>
<fonts count="3">
<font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>
<font><b/><sz val="12"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
<font><sz val="12"/><color rgb="FF000000"/><name val="Calibri"/><family val="2"/></font>
</fonts>
<fills count="5">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF00B050"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF002060"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFD9D9D9"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="3">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color indexed="64"/></left><right style="thin"><color indexed="64"/></right><top style="thin"><color indexed="64"/></top><bottom style="thin"><color indexed="64"/></bottom><diagonal/></border>
<border><left style="thin"><color indexed="64"/></left><right style="thin"><color indexed="64"/></right><top style="medium"><color indexed="64"/></top><bottom style="thin"><color indexed="64"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="11">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="1" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="${FMT_DATE}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="${FMT_2DEC}" fontId="0" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="${FMT_HMM}" fontId="0" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="${FMT_HMM}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="${FMT_2DEC}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
<dxfs count="0"/>
</styleSheet>`.replace(/\n/g, '');

// ─── Totaux hebdomadaires (colonne M) ───────────────────────────────

/**
 * Lignes qui portent un total `=SUM(H…:H…)`.
 *
 * Le modèle de l'entreprise les place en lignes 7, 12, 17, 22 — soit tous
 * les 5 jours à partir du 6e. Vérifié identique sur octobre et novembre
 * 2026, donc on reproduit tel quel plutôt que de « corriger » en semaines
 * calendaires.
 *
 * @param {number} count nombre de jours (lignes de données)
 * @returns {Array<{row:number, from:number, to:number}>}
 */
export function weekTotalRows(count) {
  const out = [];
  for (let i = 6; i <= count; i += 5) {
    const row = i + 1;          // ligne 1 = en-têtes
    out.push({ row, from: row - 4, to: row });
  }
  return out;
}

// ─── Onglet « Suivi » ───────────────────────────────────────────────

function suiviSheet(rows, location) {
  const cols = Object.entries(WIDTHS)
    .map(([c, w]) => {
      const n = c.charCodeAt(0) - 64;
      return `<col min="${n}" max="${n}" width="${w}" customWidth="1"/>`;
    })
    .join('');

  // Ligne d'en-tête
  const headCells = HEADERS.map((text, i) => {
    const ref = String.fromCharCode(65 + i) + '1';
    const s = i === 0 || i === 7 ? S.HEAD_GREEN : i <= 6 ? S.HEAD_NAVY : S.HEAD_PLAIN;
    return str(ref, s, text);
  }).join('');

  const body = [`<row r="1" ht="${HEADER_HEIGHT}" customHeight="1">${headCells}</row>`];

  const totals = weekTotalRows(rows.length);
  const totalByRow = new Map(totals.map((t) => [t.row, t]));
  const hoursByRow = new Map();

  rows.forEach((data, i) => {
    const r = i + 2;
    const hours = data.minutes / 60;
    hoursByRow.set(r, hours);

    const yesNo = (ok) => (ok ? 'Oui' : 'Non');
    const cells = [
      num(`A${r}`, S.DATE, excelSerial(data.dateStr)),
      str(`B${r}`, S.BOXED, data.project || ''),
      str(`C${r}`, S.BOXED, data.absent ? '' : location || ''),
      str(`D${r}`, S.CENTER, data.absent ? '' : yesNo(data.dailyRest)),
      str(`E${r}`, S.CENTER, data.absent ? '' : yesNo(data.weeklyRest)),
      str(`F${r}`, S.CENTER, data.absent ? '' : yesNo(data.pause)),
      num(`G${r}`, S.TIME, data.absent ? null : 30 / 1440),
      formula(`H${r}`, S.HOURS, `MAX(0,(J${r}-I${r}+L${r}-K${r})*24-0.5)`, hours),
      num(`I${r}`, S.TIME_TOP, asTime(data.I)),
      num(`J${r}`, S.TIME_TOP, asTime(data.J)),
      num(`K${r}`, S.TIME_TOP, asTime(data.K)),
      num(`L${r}`, S.TIME_TOP, asTime(data.L)),
    ];

    const t = totalByRow.get(r);
    if (t) {
      let sum = 0;
      for (let k = t.from; k <= t.to; k++) sum += hoursByRow.get(k) || 0;
      cells.push(formula(`M${r}`, S.WEEK, `SUM(H${t.from}:H${t.to})`, sum));
    }

    body.push(`<row r="${r}">${cells.join('')}</row>`);
  });

  const last = rows.length + 1;
  // Listes déroulantes « Oui / Non » sur les trois colonnes de contrôle
  const validation = rows.length
    ? `<dataValidations count="1"><dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1" sqref="D2:F${last}"><formula1>"Oui,Non"</formula1></dataValidation></dataValidations>`
    : '';

  return `${XML_HEAD}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
    + `<sheetPr><outlinePr summaryBelow="1" summaryRight="1"/></sheetPr>`
    + `<dimension ref="A1:M${Math.max(last, 1)}"/>`
    + `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    + `<sheetFormatPr defaultRowHeight="15"/>`
    + `<cols>${cols}</cols>`
    + `<sheetData>${body.join('')}</sheetData>`
    + validation
    + `</worksheet>`;
}

// ─── Onglet « Données » ─────────────────────────────────────────────
//
// Liste de référence des projets. L'app sait la relire (readSuivi), donc un
// fichier généré peut être réimporté plus tard sans perdre les libellés.

function donneesSheet(projects) {
  const rows = [`<row r="1">${str('A1', S.DEFAULT, 'Jour')}${str('B1', S.DEFAULT, 'Contenu')}</row>`];
  projects.forEach((p, i) => {
    rows.push(`<row r="${i + 2}">${str(`B${i + 2}`, S.DEFAULT, p)}</row>`);
  });
  return `${XML_HEAD}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
    + `<dimension ref="A1:B${projects.length + 1}"/>`
    + `<sheetViews><sheetView workbookViewId="0"/></sheetViews>`
    + `<sheetFormatPr defaultRowHeight="15"/>`
    + `<cols><col min="1" max="1" width="14.27" customWidth="1"/><col min="2" max="2" width="65.63" customWidth="1"/></cols>`
    + `<sheetData>${rows.join('')}</sheetData></worksheet>`;
}

// ─── Onglet « Synthèse » ────────────────────────────────────────────
//
// Le fichier d'origine utilise un tableau croisé dynamique, qui doit être
// actualisé à la main pour afficher autre chose que des zéros. Ici on met
// de vraies formules : le total par jour est juste dès l'ouverture.

function syntheseSheet(rows) {
  const last = rows.length + 1;
  const body = [
    `<row r="2">${str('A2', S.DEFAULT, 'Somme de Volume Horaire Quotidien\n(heures)')}</row>`,
    `<row r="3">${str('A3', S.DEFAULT, 'Étiquettes de lignes')}${str('B3', S.DEFAULT, 'Total général')}</row>`,
  ];
  rows.forEach((data, i) => {
    const r = i + 4;
    body.push(`<row r="${r}">`
      + num(`A${r}`, S.DATE, excelSerial(data.dateStr))
      + formula(`B${r}`, S.WEEK, `SUMIF(Suivi!$A$2:$A$${last},A${r},Suivi!$H$2:$H$${last})`, data.minutes / 60)
      + `</row>`);
  });
  const totalRow = rows.length + 4;
  const total = rows.reduce((a, d) => a + d.minutes, 0) / 60;
  body.push(`<row r="${totalRow}">`
    + str(`A${totalRow}`, S.DEFAULT, 'Total général')
    + formula(`B${totalRow}`, S.WEEK, `SUM(B4:B${totalRow - 1})`, total)
    + `</row>`);

  return `${XML_HEAD}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
    + `<dimension ref="A2:B${totalRow}"/>`
    + `<sheetViews><sheetView workbookViewId="0"/></sheetViews>`
    + `<sheetFormatPr defaultRowHeight="15"/>`
    + `<cols><col min="1" max="1" width="30" customWidth="1"/><col min="2" max="2" width="20" customWidth="1"/></cols>`
    + `<sheetData>${body.join('')}</sheetData></worksheet>`;
}

// ─── Assemblage du classeur ─────────────────────────────────────────

const CONTENT_TYPES = `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
  + `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`
  + `<Default Extension="xml" ContentType="application/xml"/>`
  + `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`
  + `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
  + `<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
  + `<Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
  + `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>`
  + `</Types>`;

const ROOT_RELS = `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
  + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>`
  + `</Relationships>`;

const WORKBOOK = `${XML_HEAD}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`
  + `<sheets>`
  + `<sheet name="Suivi" sheetId="1" r:id="rId1"/>`
  + `<sheet name="Données" sheetId="2" r:id="rId2"/>`
  + `<sheet name="Synthèse" sheetId="3" r:id="rId3"/>`
  + `</sheets>`
  + `<calcPr calcId="0" fullCalcOnLoad="1"/>`
  + `</workbook>`;

const WORKBOOK_RELS = `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
  + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>`
  + `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>`
  + `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/>`
  + `<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
  + `</Relationships>`;

/**
 * Crée le fichier du mois.
 *
 * @param {Array} rows      lignes calculées par computeMonth()
 * @param {Object} options
 * @param {string} options.location  texte de la colonne C
 * @param {string[]} [options.projects]  liste de l'onglet « Données »
 * @returns {Promise<string>} le classeur en base64
 */
export async function buildSuivi(rows, { location = '', projects } = {}) {
  if (!rows || !rows.length) throw new Error('Aucun jour à exporter pour ce mois.');

  // Projets du mois d'abord, puis la liste de référence, sans doublon
  const used = rows.map((r) => r.project).filter(Boolean);
  const list = [...new Set([...used, ...(projects || DEFAULT_PROJECTS)])];

  const zip = new JSZip();
  zip.file('[Content_Types].xml', CONTENT_TYPES);
  zip.file('_rels/.rels', ROOT_RELS);
  zip.file('xl/workbook.xml', WORKBOOK);
  zip.file('xl/_rels/workbook.xml.rels', WORKBOOK_RELS);
  zip.file('xl/styles.xml', STYLES_XML);
  zip.file('xl/worksheets/sheet1.xml', suiviSheet(rows, location));
  zip.file('xl/worksheets/sheet2.xml', donneesSheet(list));
  zip.file('xl/worksheets/sheet3.xml', syntheseSheet(rows));

  return zip.generateAsync({ type: 'base64', compression: 'DEFLATE' });
}

/**
 * Décrit un mois comme le ferait readSuivi() sur un fichier importé.
 *
 * Permet à tout l'écran d'export de fonctionner à l'identique, qu'on parte
 * d'un modèle de l'entreprise ou d'un fichier créé par l'app.
 *
 * @param {string} month  « 2026-11 »
 * @returns {{dates, projects, weekFormulas, month, generated: true}}
 */
export function monthInfo(month, projects = DEFAULT_PROJECTS) {
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const pad = (n) => String(n).padStart(2, '0');

  const dates = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${y}-${pad(m)}-${pad(d)}`;
    if (weekdayIndex(dateStr) < 5) dates.push({ row: dates.length + 2, dateStr }); // samedi/dimanche exclus
  }

  const weekFormulas = weekTotalRows(dates.length).map((t) => ({ cell: `M${t.row}`, ...t }));
  return { dates, projects: [...projects], weekFormulas, month, generated: true };
}

/**
 * Nom du fichier, dans le format utilisé par l'entreprise :
 *   « 202611 - Suivi_Mensuel_KLO Novembre 2026.xlsx »
 */
export function buildName(month, initials = 'KLO') {
  const [y, m] = month.split('-').map(Number);
  return `${y}${String(m).padStart(2, '0')} - Suivi_Mensuel_${initials} ${MOIS_FR[m - 1]} ${y}.xlsx`;
}
