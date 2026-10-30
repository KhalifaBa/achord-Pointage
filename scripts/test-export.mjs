// Test de l'export Suivi Mensuel avec Node :
//   node scripts/test-export.mjs <fichier_du_mois.xlsx> [sortie.xlsx]
// Remplit un fichier d'octobre 2026 avec des horaires fictifs et vérifie les calculs.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { readSuivi, fillSuivi } from '../src/export/suiviXlsx.js';
import { computeMonth, hhmmToMinutes, formatHours, weekdayIndex } from '../src/export/monthModel.js';

const [input, output = 'test-rempli.xlsx'] = process.argv.slice(2);
const buf = fs.readFileSync(input);

// Données fictives : horaire type, sauf 3 jours (court, long, déjeuner de 25 min)
const std = { arrival: 570, lunchStart: 750, lunchEnd: 810, departure: 1080, breaks: [] }; // 9:30 12:30-13:30 18:00
const special = {
  '02': { ...std, departure: hhmmToMinutes('16:00') },
  '07': { ...std, departure: hhmmToMinutes('19:00') },
  '14': { ...std, lunchStart: hhmmToMinutes('12:30'), lunchEnd: hhmmToMinutes('12:55') },
};
const times = {};
for (let d = 1; d <= 31; d++) {
  const dd = String(d).padStart(2, '0');
  const ds = `2026-10-${dd}`;
  if (weekdayIndex(ds) < 5) times[ds] = special[dd] || { ...std }; // lundi → vendredi
}

const info = await readSuivi(buf);
assert.equal(info.dates.length, 22);
assert.equal(info.month, '2026-10');
assert.ok(info.projects.includes('CP'));
const PROJECT = info.projects[0];
assert.deepEqual(info.weekFormulas.map((w) => `${w.cell}=H${w.from}:H${w.to}`), ['M7=H3:H7', 'M12=H8:H12', 'M17=H13:H17', 'M22=H18:H22']);

const fileDays = info.dates.map((d) => ({ dateStr: d.dateStr, project: PROJECT }));
const month = computeMonth(fileDays, times);
const weeks = month.weeks.map((w) => formatHours(w.minutes));
console.log('Semaines :', weeks.join(' | '), '— Mois :', formatHours(month.total));
assert.deepEqual(weeks, ['12h00', '36h00', '35h35', '35h00', '35h00']);
assert.equal(formatHours(month.total), '153h35');
assert.ok(month.rows.every((r) => r.dailyRest && r.weeklyRest && r.pause));

// Cas « Non » : repos quotidien trop court + absence
const t2 = { ...times, '2026-10-06': { ...times['2026-10-06'], arrival: hhmmToMinutes('4h30') } };
const m2 = computeMonth(fileDays.map((d) => (d.dateStr === '2026-10-20' ? { ...d, project: 'CP' } : d)), t2);
assert.equal(m2.rows.find((r) => r.dateStr === '2026-10-06').dailyRest, false);
const cp = m2.rows.find((r) => r.dateStr === '2026-10-20');
assert.equal(cp.minutes, 0); assert.equal(cp.I, null); assert.equal(cp.dailyRest, true);
assert.equal(m2.weeks[3].expected, 28 * 60);

const out = await fillSuivi(buf, month.rows, { location: 'Bureau' });
fs.writeFileSync(output, Buffer.from(out, 'base64'));
console.log('OK →', output);
