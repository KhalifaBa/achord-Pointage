// src/utils/backup.js
// Sauvegarde / restauration de toutes les données de l'app dans un fichier .json.
// Utile pour changer de téléphone ou réinstaller l'app.
// Les clés API (Brevo, EmailJS) ne sont JAMAIS mises dans le fichier.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { pickTextFile, saveTextAndShare } from '../export/fileIO';
import { buildBackup, planRestore } from './backupData';

export async function exportBackup() {
  const keys = await AsyncStorage.getAllKeys();
  const entries = await AsyncStorage.multiGet(keys);
  const backup = buildBackup(entries);
  const day = backup.createdAt.slice(0, 10);
  await saveTextAndShare(`pointage-sauvegarde-${day}.json`, JSON.stringify(backup));
  return Object.keys(backup.data).length;
}

/** @returns nombre de jours de pointage restaurés, ou null si annulé */
export async function importBackup() {
  const file = await pickTextFile();
  if (!file) return null;
  let backup;
  try {
    backup = JSON.parse(file.text);
  } catch {
    throw new Error("Le fichier n'est pas un JSON valide.");
  }
  const pairs = planRestore(backup, await AsyncStorage.getItem('settings'));

  // L'index d'historique est fusionné (on ne perd pas les jours déjà sur ce téléphone)
  const idx = pairs.find(([k]) => k === 'history_index');
  if (idx) {
    const current = JSON.parse((await AsyncStorage.getItem('history_index')) || '[]');
    const merged = [...new Set([...JSON.parse(idx[1]), ...current])].sort().reverse();
    idx[1] = JSON.stringify(merged);
  }
  await AsyncStorage.multiSet(pairs);
  return pairs.filter(([k]) => k.startsWith('timings_')).length;
}
