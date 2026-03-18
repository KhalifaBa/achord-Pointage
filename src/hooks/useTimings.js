// src/hooks/useTimings.js
// Hook principal gérant l'état des pointages du jour

import { useState, useEffect, useCallback } from 'react';
import {
  loadTimings,
  saveTimings,
  EMPTY_TIMINGS,
  todayStr,
} from '../utils/storage';

export function useTimings() {
  const [dateStr, setDateStr]   = useState(todayStr());
  const [timings, setTimings]   = useState({ ...EMPTY_TIMINGS });
  const [loading, setLoading]   = useState(true);

  // Charge les pointages du jour au montage
  useEffect(() => {
    (async () => {
      const today = todayStr();
      setDateStr(today);
      const stored = await loadTimings(today);
      setTimings(stored);
      setLoading(false);
    })();
  }, []);

  // Vérification de changement de jour (polling toutes les minutes)
  useEffect(() => {
    const interval = setInterval(() => {
      const today = todayStr();
      if (today !== dateStr) {
        setDateStr(today);
        setTimings({ ...EMPTY_TIMINGS });
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [dateStr]);

  /**
   * Enregistre un pointage pour la clé donnée avec l'heure actuelle.
   * @param {string} key - ex: 'arrival', 'coffeeMornStart', etc.
   */
  const stamp = useCallback(async (key) => {
    const now = new Date().toISOString();
    const updated = { ...timings, [key]: now };
    setTimings(updated);
    await saveTimings(dateStr, updated);
    return now;
  }, [timings, dateStr]);

  /**
   * Réinitialise tous les pointages du jour.
   */
  const reset = useCallback(async () => {
    const fresh = { ...EMPTY_TIMINGS };
    setTimings(fresh);
    await saveTimings(dateStr, fresh);
  }, [dateStr]);

  return { timings, dateStr, loading, stamp, reset };
}
