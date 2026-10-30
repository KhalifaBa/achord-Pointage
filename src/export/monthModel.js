// src/export/monthModel.js
// Calculs du mois pour l'export « Suivi Mensuel » — JS pur (aucun import React Native),
// donc testable avec Node.
//
// Toutes les heures sont en MINUTES depuis minuit (ex : 9h30 = 570).

export const DAY_TARGET_MIN = 7 * 60;          // 35h / 5 jours
export const MANDATORY_BREAK_MIN = 30;         // retiré par la formule H du fichier
export const ABSENCE_PROJECTS = ['CP', 'Arrêt Maladie', 'Congés sans solde', 'Férié'];

const DAILY_REST_MIN  = 11 * 60;  // L3131-1
const WEEKLY_REST_MIN = 35 * 60;  // L3132-2 (24h + 11h)
const BREAK_MIN       = 20;       // L3121-16 (au-delà de 6h)
const MAX_DAY_MIN     = 10 * 60;  // L3121-18
const MAX_WEEK_MIN    = 48 * 60;  // L3121-20

// ─── Dates ──────────────────────────────────────────────────────────

export function parseDateStr(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return { y, m, d };
}

/** Numéro de jour absolu (UTC) — pour comparer des dates sans souci de fuseau. */
export function dayNumber(dateStr) {
  const { y, m, d } = parseDateStr(dateStr);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

export function dateStrFromDayNumber(n) {
  const dt = new Date(n * 86400000);
  const p = (x) => String(x).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}`;
}

/** Lundi = 0 … dimanche = 6 */
export function weekdayIndex(dateStr) {
  return (new Date(dayNumber(dateStr) * 86400000).getUTCDay() + 6) % 7;
}

export function mondayOf(dateStr) {
  return dateStrFromDayNumber(dayNumber(dateStr) - weekdayIndex(dateStr));
}

/** Date Excel (numéro de série, système 1900) */
export function excelSerial(dateStr) {
  return dayNumber(dateStr) - Math.round(Date.UTC(1899, 11, 30) / 86400000);
}

export function dateStrFromExcelSerial(serial) {
  return dateStrFromDayNumber(Math.floor(serial) + Math.round(Date.UTC(1899, 11, 30) / 86400000));
}

// ─── Heures ─────────────────────────────────────────────────────────

/** ISO (stocké par l'app) → minutes locales depuis minuit */
export function isoToMinutes(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

export function hhmmToMinutes(text) {
  const m = /^\s*([01]?\d|2[0-3])\s*[:hH]\s*([0-5]\d)?\s*$/.exec(text || '');
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2] || 0);
}

export function minutesToHHmm(min) {
  if (min === null || min === undefined) return '--:--';
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

/** 425 → "7h05" ; -63 → "-1h03" */
export function formatHours(min) {
  if (min === null || min === undefined) return '--';
  const sign = min < 0 ? '-' : '';
  const a = Math.abs(Math.round(min));
  return `${sign}${Math.floor(a / 60)}h${String(a % 60).padStart(2, '0')}`;
}

/**
 * Même calcul que la formule H du fichier :
 *   MAX(0, (J-I + L-K)*24 - 0,5)   (une cellule vide vaut 0)
 * Résultat en minutes.
 */
export function formulaMinutes({ arrival, lunchStart, lunchEnd, departure }) {
  const v = (x) => (x === null || x === undefined ? 0 : x);
  if (arrival == null && departure == null) return 0;
  return Math.max(0, (v(lunchStart) - v(arrival)) + (v(departure) - v(lunchEnd)) - MANDATORY_BREAK_MIN);
}

// ─── Calcul du mois ─────────────────────────────────────────────────

/**
 * @param {Array<{dateStr, project}>} fileDays  jours (lignes) du fichier, dans l'ordre
 * @param {Object} times  dateStr → { arrival, lunchStart, lunchEnd, departure, breaks: [durées min] }
 *                        Peut contenir des jours AVANT le mois (pour vérifier le repos du 1er jour).
 */
export function computeMonth(fileDays, times) {
  const absMin = (dateStr, min) => dayNumber(dateStr) * 1440 + min;

  // Liste triée de tous les jours travaillés connus (pour les repos)
  const known = Object.keys(times)
    .filter((d) => times[d] && times[d].arrival != null && times[d].departure != null)
    .sort();

  const lastDepartureBefore = (dateStr) => {
    for (let i = known.length - 1; i >= 0; i--) {
      if (known[i] < dateStr) return absMin(known[i], times[known[i]].departure);
    }
    return null;
  };

  const rows = fileDays.map(({ dateStr, project }) => {
    const t = times[dateStr] || {};
    const absent = ABSENCE_PROJECTS.includes(project);
    const warnings = [];

    const hasTimes = t.arrival != null || t.departure != null;
    const complete = t.arrival != null && t.departure != null;

    if (!project) warnings.push('Projet manquant');
    if (absent && hasTimes) warnings.push(`Horaires ignorés (${project})`);
    if (!absent && !complete) warnings.push(hasTimes ? 'Horaires incomplets' : 'Aucun horaire');

    const I = absent ? null : t.arrival ?? null;
    const J = absent ? null : t.lunchStart ?? null;
    const K = absent ? null : t.lunchEnd ?? null;
    const L = absent ? null : t.departure ?? null;
    const minutes = absent ? 0 : formulaMinutes({ arrival: I, lunchStart: J, lunchEnd: K, departure: L });

    let dailyRest = true;
    let pause = true;
    let dailyRestKnown = true;

    if (!absent && complete) {
      // 1. Repos quotidien ≥ 11h
      const prev = lastDepartureBefore(dateStr);
      if (prev === null) dailyRestKnown = false;
      else dailyRest = absMin(dateStr, I) - prev >= DAILY_REST_MIN;

      // 3. Pause ≥ 20 min si la journée dépasse 6h
      const presence = L - I;
      const breaks = [...(t.breaks || [])];
      if (J != null && K != null) breaks.push(K - J);
      const worked = presence - breaks.reduce((a, b) => a + b, 0);
      if (worked > 6 * 60) pause = breaks.some((b) => b >= BREAK_MIN);

      // 4. Max 10h / jour (temps réellement travaillé)
      if (worked > MAX_DAY_MIN) warnings.push(`Plus de 10h travaillées (${formatHours(worked)})`);
      if (!dailyRest) warnings.push('Repos quotidien < 11h');
      if (!pause) warnings.push('Pause < 20 min');
    }

    return {
      dateStr, project: project || '', absent,
      I, J, K, L, minutes,
      dailyRest, dailyRestKnown, pause,
      weeklyRest: true,
      warnings,
    };
  });

  // ── Semaines (lundi → vendredi) ──
  const weeks = [];
  for (const row of rows) {
    const monday = mondayOf(row.dateStr);
    let w = weeks[weeks.length - 1];
    if (!w || w.monday !== monday) {
      w = { monday, rows: [], minutes: 0, expected: 0 };
      weeks.push(w);
    }
    w.rows.push(row);
    w.minutes += row.minutes;
    if (!row.absent) w.expected += DAY_TARGET_MIN;
  }

  for (const w of weeks) {
    // 2. Repos hebdo ≥ 35h : du dernier départ avant la semaine à la 1re arrivée de la semaine
    const weekDays = known.filter((d) => mondayOf(d) === w.monday);
    let weeklyOk = true;
    if (weekDays.length) {
      const first = weekDays[0];
      const prev = lastDepartureBefore(first);
      if (prev !== null) weeklyOk = absMin(first, times[first].arrival) - prev >= WEEKLY_REST_MIN;
    }
    w.weeklyRest = weeklyOk;
    for (const r of w.rows) {
      r.weeklyRest = weeklyOk;
      if (!weeklyOk && !r.absent) r.warnings.push('Repos hebdomadaire < 35h');
    }
    w.start = w.rows[0].dateStr;
    w.end = w.rows[w.rows.length - 1].dateStr;
    w.warnings = [];
    if (w.minutes > MAX_WEEK_MIN) w.warnings.push(`Plus de 48h dans la semaine (${formatHours(w.minutes)})`);
  }

  const total = rows.reduce((a, r) => a + r.minutes, 0);
  const expected = weeks.reduce((a, w) => a + w.expected, 0);
  return { rows, weeks, total, expected };
}

// ─── Jours fériés (France métropolitaine) ───────────────────────────

function easterSunday(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  const p = (x) => String(x).padStart(2, '0');
  return `${y}-${p(month)}-${p(day)}`;
}

export function frenchHolidays(year) {
  const easter = dayNumber(easterSunday(year));
  const fixed = ['01-01', '05-01', '05-08', '07-14', '08-15', '11-01', '11-11', '12-25'].map((md) => `${year}-${md}`);
  const moving = [1, 39, 50].map((n) => dateStrFromDayNumber(easter + n)); // lundi Pâques, Ascension, Pentecôte
  return new Set([...fixed, ...moving]);
}
