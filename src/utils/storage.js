// src/utils/storage.js
// Gestion de la persistance locale avec AsyncStorage

import AsyncStorage from '@react-native-async-storage/async-storage';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

const KEYS = {
  SETTINGS:       'settings',
  TIMINGS_PREFIX: 'timings_',
  HISTORY_INDEX:  'history_index',
};

// ─── Constantes légales ─────────────────────────────────────────────
// Pause écran réglementaire : 30 min/jour, déduite automatiquement du temps de travail effectif
export const SCREEN_BREAK_MINUTES = 30;
// Durée minimale légale de pause déjeuner (Art. L3121-16 Code du travail)
export const LUNCH_MIN_MINUTES = 20;

// ─── Paramètres utilisateur ─────────────────────────────────────────

export async function saveSettings(settings) {
  await AsyncStorage.setItem(KEYS.SETTINGS, JSON.stringify(settings));
}

export async function loadSettings() {
  const raw = await AsyncStorage.getItem(KEYS.SETTINGS);
  return raw ? JSON.parse(raw) : {
    employeeName:      '',
    recipientEmail:    '',
    senderEmail:       '',
    emailService:      '',      // 'brevo' | 'emailjs'
    brevoApiKey:       '',
    emailjsServiceId:  '',
    emailjsTemplateId: '',
    emailjsPublicKey:  '',
    expectedArrival:   '09:30', // Heure d'arrivée contractuelle (HH:mm)
    expectedDeparture: '18:00', // Heure de départ contractuelle (HH:mm)
  };
}

// ─── Pointages ──────────────────────────────────────────────────────

export function todayStr() {
  return format(new Date(), 'yyyy-MM-dd');
}

export function dateKey(dateStr) {
  return KEYS.TIMINGS_PREFIX + dateStr;
}

export const EMPTY_TIMINGS = {
  arrival:         null,
  coffeeMornStart: null,
  coffeeMornEnd:   null,
  lunchStart:      null,
  lunchEnd:        null,
  coffeeAftnStart: null,
  coffeeAftnEnd:   null,
  departure:       null,
};

export async function saveTimings(dateStr, timings) {
  await AsyncStorage.setItem(dateKey(dateStr), JSON.stringify(timings));
  const index = await loadHistoryIndex();
  if (!index.includes(dateStr)) {
    const updated = [dateStr, ...index].slice(0, 30);
    await AsyncStorage.setItem(KEYS.HISTORY_INDEX, JSON.stringify(updated));
  }
}

export async function loadTimings(dateStr) {
  const raw = await AsyncStorage.getItem(dateKey(dateStr));
  return raw ? JSON.parse(raw) : { ...EMPTY_TIMINGS };
}

export async function loadHistoryIndex() {
  const raw = await AsyncStorage.getItem(KEYS.HISTORY_INDEX);
  return raw ? JSON.parse(raw) : [];
}

export async function loadAllHistory() {
  const index = await loadHistoryIndex();
  const entries = await Promise.all(
    index.map(async (dateStr) => ({
      dateStr,
      timings: await loadTimings(dateStr),
    }))
  );
  return entries;
}

// ─── Calculs ────────────────────────────────────────────────────────

export function durationMinutes(start, end) {
  if (!start || !end) return null;
  return Math.round((new Date(end) - new Date(start)) / 60000);
}

export function formatDuration(minutes) {
  if (minutes === null || minutes === undefined) return '--';
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0) return `${m}min`;
  return `${h}h${String(m).padStart(2, '0')}`;
}

/**
 * Calcule le delta (en minutes) entre l'heure réelle (ISO) et l'heure théorique (HH:mm).
 * Valeur positive = en avance (ou départ tardif), négative = en retard (ou départ anticipé).
 * Pour l'arrivée :  positif = en retard, négatif = en avance  → on inverse le signe
 * Pour le départ  : positif = en avance (parti tôt), négatif = parti tard → on inverse
 *
 * Convention retournée : positif = AVANCE, négatif = RETARD
 */
export function computeDelta(actualIso, expectedHHmm, dateStr, mode = 'arrival') {
  if (!actualIso || !expectedHHmm) return null;
  const [hh, mm] = expectedHHmm.split(':').map(Number);
  const [y, mo, d] = dateStr.split('-').map(Number);
  const expected = new Date(y, mo - 1, d, hh, mm, 0);
  const actual   = new Date(actualIso);
  const diffMin  = Math.round((actual - expected) / 60000);
  // Arrivée : diff positif = en retard → retourner négatif (retard)
  // Départ  : diff positif = parti tard  → retourner positif (avance = parti après l'heure)
  if (mode === 'arrival') return -diffMin;
  return diffMin;
}

/**
 * Vérifie que la durée de déjeuner respecte le minimum légal.
 * Retourne { ok, minutes } — ok = true si >= LUNCH_MIN_MINUTES ou non renseigné.
 */
export function lunchCheck(lunchStart, lunchEnd) {
  if (!lunchStart || !lunchEnd) return { ok: true, minutes: null };
  const minutes = durationMinutes(lunchStart, lunchEnd);
  return { ok: minutes >= LUNCH_MIN_MINUTES, minutes };
}

export function computeSummary(timings, settings = {}) {
  const {
    arrival, departure,
    coffeeMornStart, coffeeMornEnd,
    lunchStart, lunchEnd,
    coffeeAftnStart, coffeeAftnEnd,
  } = timings;

  const coffeeMorn   = durationMinutes(coffeeMornStart, coffeeMornEnd);
  const lunch        = durationMinutes(lunchStart, lunchEnd);
  const coffeeAftn   = durationMinutes(coffeeAftnStart, coffeeAftnEnd);
  const totalPauses  = (coffeeMorn ?? 0) + (lunch ?? 0) + (coffeeAftn ?? 0);
  const totalPresence = durationMinutes(arrival, departure);

  // Temps de travail brut (présence - pauses explicites)
  const grossWork = totalPresence !== null ? totalPresence - totalPauses : null;
  // On déduit automatiquement la pause écran légale (30 min) — non visible par l'utilisateur
  const effectiveWork = grossWork !== null ? grossWork - SCREEN_BREAK_MINUTES : null;

  return { coffeeMorn, lunch, coffeeAftn, totalPauses, totalPresence, effectiveWork, grossWork };
}

export function formatTime(iso) {
  if (!iso) return '--:--';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function formatDateFr(dateStr) {
  const [y, m, d] = dateStr.split('-');
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return format(date, 'EEEE d MMMM yyyy', { locale: fr });
}

/**
 * Parse une saisie "HH:mm" et retourne un ISO string pour la date donnée,
 * ou null si invalide.
 */
export function parseTimeInput(hhmm, dateStr) {
  const match = hhmm.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;
  const [y, mo, d] = dateStr.split('-').map(Number);
  return new Date(y, mo - 1, d, Number(match[1]), Number(match[2]), 0).toISOString();
}
