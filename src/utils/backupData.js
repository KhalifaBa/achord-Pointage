// src/utils/backupData.js
// Construction / vérification des sauvegardes (JS pur, testable avec Node)

const APP_ID = 'achord-pointage';
const SECRET_FIELDS = ['brevoApiKey', 'emailjsServiceId', 'emailjsTemplateId', 'emailjsPublicKey'];

/** Construit le contenu de la sauvegarde (fonction pure, testable) */
export function buildBackup(entries, now = new Date()) {
  const data = {};
  for (const [key, value] of entries) {
    if (value === null || value === undefined) continue;
    if (key === 'settings') {
      try {
        const s = JSON.parse(value);
        for (const f of SECRET_FIELDS) delete s[f];
        data[key] = JSON.stringify(s);
        continue;
      } catch { /* valeur illisible : copiée telle quelle */ }
    }
    data[key] = value;
  }
  return { app: APP_ID, version: 1, createdAt: now.toISOString(), data };
}

/** Prépare la restauration : garde les clés API actuelles du téléphone (fonction pure) */
export function planRestore(backup, currentSettingsRaw) {
  if (!backup || backup.app !== APP_ID || typeof backup.data !== 'object') {
    throw new Error("Ce fichier n'est pas une sauvegarde de l'app de pointage.");
  }
  const pairs = Object.entries(backup.data).filter(([, v]) => typeof v === 'string');
  return pairs.map(([key, value]) => {
    if (key !== 'settings' || !currentSettingsRaw) return [key, value];
    try {
      const current = JSON.parse(currentSettingsRaw);
      const restored = JSON.parse(value);
      for (const f of SECRET_FIELDS) if (current[f]) restored[f] = current[f];
      return [key, JSON.stringify(restored)];
    } catch {
      return [key, value];
    }
  });
}
