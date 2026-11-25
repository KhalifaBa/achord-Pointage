// Vérifie le fichier créé de zéro :  node scripts/test-build.mjs [sortie.xlsx]
// Génère novembre 2026 et contrôle la structure (colonnes, formules, totaux).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { buildSuivi, buildName, weekTotalRows, monthInfo, DEFAULT_PROJECTS } from '../src/export/buildSuivi.js';
import { computeMonth, weekdayIndex, formatHours, ABSENCE_PROJECTS } from '../src/export/monthModel.js';

// Sans argument, on écrit dans le dossier temporaire : npm test ne salit rien.
const output = process.argv[2] || path.join(os.tmpdir(), 'test-genere.xlsx');

// Jours ouvrés de novembre 2026
const days = [];
for (let d = 1; d <= 30; d++) {
  const ds = `2026-11-${String(d).padStart(2, '0')}`;
  if (weekdayIndex(ds) < 5) days.push(ds);
}
assert.equal(days.length, 21, 'novembre 2026 = 21 jours ouvrés');

// Horaire type 9h30 → 18h, déjeuner 12h30-13h30 ; 11 novembre férié
const std = { arrival: 570, lunchStart: 750, lunchEnd: 810, departure: 1080, breaks: [] };
const times = Object.fromEntries(days.map((d) => [d, { ...std }]));

const fileDays = days.map((d) => ({
  dateStr: d,
  project: d === '2026-11-11' ? 'Férié' : 'Livindeco/Plateforme Web',
}));
const month = computeMonth(fileDays, times);

// ── Totaux hebdomadaires : mêmes lignes que le modèle de l'entreprise ──
assert.deepEqual(
  weekTotalRows(21).map((t) => `M${t.row}=H${t.from}:H${t.to}`),
  ['M7=H3:H7', 'M12=H8:H12', 'M17=H13:H17', 'M22=H18:H22'],
);
assert.deepEqual(
  weekTotalRows(22).map((t) => `M${t.row}=H${t.from}:H${t.to}`),
  ['M7=H3:H7', 'M12=H8:H12', 'M17=H13:H17', 'M22=H18:H22'],
  'octobre (22 jours) : pas de total sur la dernière ligne, comme le modèle',
);

const b64 = await buildSuivi(month.rows, { location: 'Bureau de Champ' });
fs.writeFileSync(output, Buffer.from(b64, 'base64'));

// ── Contrôles sur le XML produit ──
const zip = await JSZip.loadAsync(b64, { base64: true });
const suivi = await zip.file('xl/worksheets/sheet1.xml').async('string');

for (const part of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml',
  'xl/_rels/workbook.xml.rels', 'xl/styles.xml',
  'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml', 'xl/worksheets/sheet3.xml']) {
  assert.ok(zip.file(part), `partie manquante : ${part}`);
}

assert.ok(suivi.includes('Volume Horaire Quotidien'), 'en-tête H');
assert.ok(suivi.includes('Repos Hebdomadaire'), 'en-tête E');
assert.ok(suivi.includes('<f>MAX(0,(J2-I2+L2-K2)*24-0.5)</f>'), 'formule H2');
assert.ok(suivi.includes('<f>SUM(H18:H22)</f>'), 'total M22');
assert.ok(suivi.includes('sqref="D2:F22"'), 'liste déroulante Oui/Non');
assert.ok(suivi.includes('<formula1>"Oui,Non"</formula1>'), 'valeurs de la liste');

// Liste déroulante des projets sur la colonne B, via le nom défini
assert.ok(suivi.includes('sqref="B2:B22"'), 'liste déroulante Projet');
assert.ok(suivi.includes('<formula1>Projets</formula1>'), 'cible = nom défini');
const wbXml = await zip.file('xl/workbook.xml').async('string');
assert.ok(
  wbXml.includes(`<definedName name="Projets">Données!$B$2:$B$${DEFAULT_PROJECTS.length + 1}</definedName>`),
  'le nom « Projets » couvre toute la liste',
);
// Une liste écrite en dur dépasserait la limite Excel de 255 caractères
assert.ok(DEFAULT_PROJECTS.join(',').length > 255, 'le nom défini est bien nécessaire');
assert.ok(/state="frozen"/.test(suivi), 'ligne d\'en-tête figée');

// Le 11 novembre est férié : pas d'horaires, 0 h
const ferie = month.rows.find((r) => r.dateStr === '2026-11-11');
assert.equal(ferie.absent, true);
assert.equal(ferie.minutes, 0);
assert.equal(ferie.I, null);

// Le fichier généré doit rester relisible par l'app
const { readSuivi } = await import('../src/export/suiviXlsx.js');
const reread = await readSuivi(b64);
assert.equal(reread.dates.length, 21, 'relecture : 21 jours');
assert.equal(reread.month, '2026-11');
assert.ok(reread.projects.includes('CP'), 'relecture : liste des projets');
assert.deepEqual(
  reread.weekFormulas.map((w) => w.cell),
  ['M7', 'M12', 'M17', 'M22'],
  'relecture : totaux hebdomadaires',
);

assert.equal(buildName('2026-11'), '202611 - Suivi_Mensuel_KLO Novembre 2026.xlsx');

// ── monthInfo : même forme que readSuivi, sans fichier importé ──
const info = monthInfo('2026-11');
assert.equal(info.generated, true);
assert.equal(info.month, '2026-11');
assert.deepEqual(info.dates.map((d) => d.dateStr), days, 'mêmes jours ouvrés');
assert.deepEqual(info.dates.map((d) => d.row), reread.dates.map((d) => d.row), 'mêmes numéros de ligne');
assert.deepEqual(info.weekFormulas.map((w) => w.cell), ['M7', 'M12', 'M17', 'M22']);
assert.ok(info.projects.includes('Férié'), 'liste de projets fournie');

// ── Liste des projets : valeurs exactes, ordre compris ──
// L'espace final de « Outils Webservices » est invisible mais compte :
// c'est la valeur attendue par le fichier de l'entreprise.
assert.deepEqual(DEFAULT_PROJECTS, [
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
]);
assert.ok(DEFAULT_PROJECTS[5].endsWith(' '), 'espace final conservé');
for (const p of ABSENCE_PROJECTS) {
  assert.ok(DEFAULT_PROJECTS.includes(p), `absence « ${p} » proposée dans la liste`);
}

// L'onglet Données doit reprendre la liste dans cet ordre
const donnees = await (await JSZip.loadAsync(b64, { base64: true }))
  .file('xl/worksheets/sheet2.xml').async('string');
const ecrits = [...donnees.matchAll(/<t xml:space="preserve">([\s\S]*?)<\/t>/g)]
  .map((m) => m[1]).slice(2); // on saute les en-têtes « Jour » et « Contenu »
assert.deepEqual(ecrits.slice(0, DEFAULT_PROJECTS.length), DEFAULT_PROJECTS, 'onglet Données : ordre d\'origine');

// Février 2028 (bissextile, commence un mardi) : pas de week-end, lignes à la suite
const fev = monthInfo('2028-02');
assert.equal(fev.dates.length, 21);
assert.equal(fev.dates[0].dateStr, '2028-02-01');
assert.equal(fev.dates.at(-1).dateStr, '2028-02-29');
assert.ok(fev.dates.every((d, i) => d.row === i + 2), 'lignes consécutives');

// Un mois entier d'absences doit quand même produire un fichier valide
const cpRows = computeMonth(days.map((d) => ({ dateStr: d, project: 'CP' })), {}).rows;
const cpFile = await buildSuivi(cpRows, { location: 'Bureau' });
assert.ok(cpFile.length > 0, 'mois 100 % CP : fichier généré');

console.log('Semaines :', month.weeks.map((w) => formatHours(w.minutes)).join(' | '));
console.log('Mois     :', formatHours(month.total));
console.log('OK →', output);
