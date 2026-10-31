// src/export/fileIO.js
// Choisir le fichier Excel du mois, puis enregistrer / partager le fichier rempli.
// Android / iOS : expo-document-picker + expo-file-system + expo-sharing.
// Web (PWA)     : sélecteur de fichier du navigateur + téléchargement.

import { Platform, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// ─── base64 (web) ───────────────────────────────────────────────────

function arrayBufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ─── Choisir le fichier du mois ─────────────────────────────────────

/** @returns {Promise<{name, base64} | null>} */
export async function pickXlsx() {
  const res = await DocumentPicker.getDocumentAsync({
    type: [XLSX_MIME, 'application/octet-stream', '*/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (res.canceled || !res.assets?.length) return null;
  const asset = res.assets[0];

  let base64;
  if (Platform.OS === 'web') {
    const buf = asset.file ? await asset.file.arrayBuffer() : await (await fetch(asset.uri)).arrayBuffer();
    base64 = arrayBufferToBase64(buf);
  } else {
    base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
  }
  return { name: asset.name || 'Suivi Mensuel.xlsx', base64 };
}

/** Choisir un fichier texte (ex : sauvegarde .json). @returns {Promise<{name, text} | null>} */
export async function pickTextFile(types = ['application/json', 'text/plain', '*/*']) {
  const res = await DocumentPicker.getDocumentAsync({ type: types, copyToCacheDirectory: true, multiple: false });
  if (res.canceled || !res.assets?.length) return null;
  const asset = res.assets[0];
  const text = Platform.OS === 'web'
    ? (asset.file ? await asset.file.text() : await (await fetch(asset.uri)).text())
    : await FileSystem.readAsStringAsync(asset.uri);
  return { name: asset.name, text };
}

/** Enregistrer / partager un fichier texte (ex : sauvegarde .json) */
export async function saveTextAndShare(name, text, mimeType = 'application/json') {
  if (Platform.OS === 'web') {
    const blob = new Blob([text], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return;
  }
  const uri = FileSystem.cacheDirectory + name.replace(/[\\/:*?"<>|]/g, '_');
  await FileSystem.writeAsStringAsync(uri, text);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType, dialogTitle: 'Enregistrer la sauvegarde' });
  } else {
    notify('Fichier créé', uri);
  }
}

// ─── Enregistrer / partager le fichier rempli ───────────────────────

export async function saveAndShare(name, base64) {
  if (Platform.OS === 'web') {
    const blob = new Blob([base64ToBytes(base64)], { type: XLSX_MIME });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return;
  }
  const uri = FileSystem.cacheDirectory + name.replace(/[\\/:*?"<>|]/g, '_');
  await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: XLSX_MIME,
      UTI: 'org.openxmlformats.spreadsheetml.sheet',
      dialogTitle: 'Envoyer le suivi mensuel',
    });
  } else {
    notify('Fichier créé', uri);
  }
}

// ─── Mémoriser le dernier fichier importé ───────────────────────────

const FILE_KEY = 'suivi_file';
const projectsKey = (month) => `suivi_projects_${month}`;
const DEFAULT_PROJECT_KEY = 'suivi_default_project';

export async function loadDefaultProject() {
  return AsyncStorage.getItem(DEFAULT_PROJECT_KEY);
}
export async function saveDefaultProject(project) {
  await AsyncStorage.setItem(DEFAULT_PROJECT_KEY, project);
}

export async function saveSuiviFile(file) {
  await AsyncStorage.setItem(FILE_KEY, JSON.stringify(file));
}
export async function loadSuiviFile() {
  const raw = await AsyncStorage.getItem(FILE_KEY);
  return raw ? JSON.parse(raw) : null;
}
export async function loadMonthProjects(month) {
  const raw = await AsyncStorage.getItem(projectsKey(month));
  return raw ? JSON.parse(raw) : {};
}
export async function saveMonthProjects(month, map) {
  await AsyncStorage.setItem(projectsKey(month), JSON.stringify(map));
}

// ─── Messages (Alert ne fait rien sur le web) ───────────────────────

export function notify(title, message) {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

export function ask(title, message, okLabel = 'Continuer') {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Annuler', style: 'cancel', onPress: () => resolve(false) },
      { text: okLabel, onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}
