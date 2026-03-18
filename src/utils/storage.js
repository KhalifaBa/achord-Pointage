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
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}min`;
  return `${h}h${String(m).padStart(2, '0')}`;
}

export function computeSummary(timings) {
  const { arrival, departure, coffeeMornStart, coffeeMornEnd, lunchStart, lunchEnd, coffeeAftnStart, coffeeAftnEnd } = timings;
  const coffeeMorn   = durationMinutes(coffeeMornStart, coffeeMornEnd);
  const lunch        = durationMinutes(lunchStart, lunchEnd);
  const coffeeAftn   = durationMinutes(coffeeAftnStart, coffeeAftnEnd);
  const totalPauses  = (coffeeMorn ?? 0) + (lunch ?? 0) + (coffeeAftn ?? 0);
  const totalPresence = durationMinutes(arrival, departure);
  const effectiveWork = totalPresence !== null ? totalPresence - totalPauses : null;
  return { coffeeMorn, lunch, coffeeAftn, totalPauses, totalPresence, effectiveWork };
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
