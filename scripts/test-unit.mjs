// Tests rapides, sans téléphone ni fichier de l'entreprise :  npm test
import assert from 'node:assert/strict';
import { computeMonth, formatHours, hhmmToMinutes, weekdayIndex, frenchHolidays } from '../src/export/monthModel.js';
import { nextQuickStep } from '../src/utils/quickStep.js';
import { buildBackup, planRestore } from '../src/utils/backupData.js';

let n = 0;
const test = (name, fn) => { fn(); n++; console.log('✓', name); };

// Jours ouvrés d'octobre 2026
const days = [];
for (let d = 1; d <= 31; d++) {
  const ds = `2026-10-${String(d).padStart(2, '0')}`;
  if (weekdayIndex(ds) < 5) days.push(ds);
}
const std = { arrival: 570, lunchStart: 750, lunchEnd: 810, departure: 1080, breaks: [] };

test('horaire type = 7h par jour, 35h par semaine', () => {
  const times = Object.fromEntries(days.map((d) => [d, { ...std }]));
  const m = computeMonth(days.map((d) => ({ dateStr: d, project: 'P' })), times);
  assert.equal(days.length, 22);
  assert.ok(m.rows.every((r) => r.minutes === 420 && r.dailyRest && r.weeklyRest && r.pause && !r.warnings.length));
  assert.deepEqual(m.weeks.map((w) => formatHours(w.minutes)), ['14h00', '35h00', '35h00', '35h00', '35h00']);
  assert.equal(formatHours(m.total), '154h00');
});

test('règles légales : repos 11h, pause 20 min, 10h max', () => {
  const times = Object.fromEntries(days.map((d) => [d, { ...std }]));
  times['2026-10-06'] = { ...std, arrival: hhmmToMinutes('4:30') };                        // repos < 11h
  times['2026-10-07'] = { ...std, lunchStart: null, lunchEnd: null };                      // pas de pause
  times['2026-10-08'] = { ...std, arrival: hhmmToMinutes('7:00'), departure: hhmmToMinutes('19:30') }; // > 10h
  const m = computeMonth(days.map((d) => ({ dateStr: d, project: 'P' })), times);
  const row = (d) => m.rows.find((r) => r.dateStr === d);
  assert.equal(row('2026-10-06').dailyRest, false);
  assert.equal(row('2026-10-07').pause, false);
  assert.ok(row('2026-10-08').warnings.some((w) => w.includes('10h')));
});

test('absence (CP) : 0h, horaires vides, attendu réduit', () => {
  const times = Object.fromEntries(days.map((d) => [d, { ...std }]));
  const m = computeMonth(days.map((d) => ({ dateStr: d, project: d === '2026-10-20' ? 'CP' : 'P' })), times);
  const cp = m.rows.find((r) => r.dateStr === '2026-10-20');
  assert.equal(cp.minutes, 0); assert.equal(cp.I, null);
  assert.equal(m.weeks[3].expected, 28 * 60);
});

test('jours fériés 2026', () => {
  const h = frenchHolidays(2026);
  for (const d of ['2026-01-01', '2026-04-06', '2026-05-14', '2026-05-25', '2026-11-11', '2026-12-25']) assert.ok(h.has(d), d);
});

test('pointage en 1 tap : ordre des étapes', () => {
  assert.equal(nextQuickStep({}), 'arrival');
  assert.equal(nextQuickStep({ arrival: 'x' }), 'lunchStart');
  assert.equal(nextQuickStep({ arrival: 'x', coffeeMornStart: 'x' }), 'coffeeMornEnd');
  assert.equal(nextQuickStep({ arrival: 'x', lunchStart: 'x' }), 'lunchEnd');
  assert.equal(nextQuickStep({ arrival: 'x', lunchStart: 'x', lunchEnd: 'x' }), 'departure');
  assert.equal(nextQuickStep({ arrival: 'x', lunchStart: 'x', lunchEnd: 'x', departure: 'x' }), null);
});

test('sauvegarde : sans clés API, restauration qui garde les clés du téléphone', () => {
  const settings = JSON.stringify({ employeeName: 'K', brevoApiKey: 'SECRET', location: 'Bureau' });
  const b = buildBackup([['settings', settings], ['timings_2026-10-01', '{}'], ['vide', null]]);
  assert.equal(b.app, 'achord-pointage');
  assert.ok(!JSON.stringify(b).includes('SECRET'));
  assert.ok(!('vide' in b.data));
  const pairs = planRestore(b, JSON.stringify({ brevoApiKey: 'PHONE_KEY' }));
  const restored = JSON.parse(pairs.find(([k]) => k === 'settings')[1]);
  assert.equal(restored.brevoApiKey, 'PHONE_KEY');
  assert.equal(restored.location, 'Bureau');
  assert.throws(() => planRestore({ app: 'autre' }, null));
});

console.log(`\n${n} tests OK`);
