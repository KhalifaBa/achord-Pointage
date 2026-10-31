// src/utils/reminders.js
// Rappels locaux (sans serveur) : « Tu as pointé ton arrivée ? » et « N'oublie pas ton départ ».
// - Seulement du lundi au vendredi.
// - Le rappel du jour est annulé dès que tu as pointé.
// - Rien sur le web.

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

const IS_WEB = Platform.OS === 'web';
const CHANNEL = 'rappels';
const DAYS_AHEAD = 10;

export const DEFAULT_REMINDERS = {
  remindersEnabled: false,
  arrivalReminderDelay: 10,   // minutes après l'heure d'arrivée théorique
  departureReminderDelay: 5,  // minutes après l'heure de départ théorique
};

if (!IS_WEB) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,   // anciennes versions
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/** Demande l'autorisation (si ask) et crée le canal Android. */
export async function ensureNotificationPermission({ ask = false } = {}) {
  if (IS_WEB) return false;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Rappels de pointage',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted' && ask) {
    ({ status } = await Notifications.requestPermissionsAsync());
  }
  return status === 'granted';
}

function atTime(day, hhmm, plusMinutes) {
  const [h, m] = (hhmm || '').split(':').map(Number);
  const d = new Date(day);
  d.setHours(h || 0, (m || 0) + (plusMinutes || 0), 0, 0);
  return d;
}

/**
 * Reprogramme tous les rappels des prochains jours ouvrés.
 * @param settings      paramètres de l'app (expectedArrival, expectedDeparture, remindersEnabled…)
 * @param dateStr       aujourd'hui (yyyy-MM-dd)
 * @param todayTimings  pointages du jour (pour ne pas rappeler ce qui est déjà fait)
 */
export async function scheduleReminders({ settings, dateStr, todayTimings = {} }) {
  if (IS_WEB) return 0;
  await Notifications.cancelAllScheduledNotificationsAsync();
  const cfg = { ...DEFAULT_REMINDERS, ...settings };
  if (!cfg.remindersEnabled) return 0;
  if (!(await ensureNotificationPermission())) return 0;

  const now = new Date();
  const [y, mo, d] = dateStr.split('-').map(Number);
  const today = new Date(y, mo - 1, d);
  let count = 0;

  for (let i = 0; i < DAYS_AHEAD; i++) {
    const day = new Date(today);
    day.setDate(today.getDate() + i);
    const wd = day.getDay();
    if (wd === 0 || wd === 6) continue; // week-end

    const isToday = i === 0;
    const plan = [];
    if (!(isToday && todayTimings.arrival)) {
      plan.push({
        date: atTime(day, cfg.expectedArrival || '09:30', cfg.arrivalReminderDelay),
        title: '⏱ Pointage',
        body: "Tu as pointé ton arrivée ? Un appui sur « Pointer l'arrivée ».",
      });
    }
    // Départ : pas de rappel aujourd'hui si déjà parti, ou jamais arrivé (congé…)
    if (!(isToday && (todayTimings.departure || !todayTimings.arrival))) {
      plan.push({
        date: atTime(day, cfg.expectedDeparture || '18:00', cfg.departureReminderDelay),
        title: '🚪 Départ',
        body: "N'oublie pas de pointer ton départ.",
      });
    }

    for (const n of plan) {
      if (n.date <= now) continue;
      await Notifications.scheduleNotificationAsync({
        content: { title: n.title, body: n.body, sound: true },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: n.date,
          channelId: CHANNEL,
        },
      });
      count++;
    }
  }
  return count;
}
