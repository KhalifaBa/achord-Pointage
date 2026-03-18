# Pointage Pro 📱

Application mobile de pointage en entreprise — **100% gratuite, 100% locale, aucun serveur**.

Remplace l'envoi manuel de mails de pointage quotidien.

---

## ✨ Fonctionnalités

- **8 boutons de pointage** chronologiques (arrivée, pauses, départ)
- **Désactivation automatique** après chaque action (pas de doublons)
- **Envoi automatique** du mail récapitulatif au départ via le client mail natif
- **Historique 30 jours** consultable et détaillé
- **Calcul automatique** du temps de travail effectif
- **Réinitialisation automatique** chaque nouveau jour
- **Fonctionne hors ligne** — aucune connexion requise

---

## 🛠️ Stack technique

| Technologie | Usage |
|---|---|
| React Native + Expo | Framework mobile cross-platform |
| AsyncStorage | Persistance locale des données |
| Expo Mail Composer | Envoi via le client mail natif |
| React Navigation | Navigation par onglets |
| date-fns | Formatage des dates/heures |

---

## 🚀 Installation & démarrage rapide

### Prérequis

- [Node.js](https://nodejs.org/) v18+ installé
- [Expo Go](https://expo.dev/client) sur votre téléphone (Android ou iOS)

### Étapes

```bash
# 1. Cloner / décompresser le projet
cd pointage-app

# 2. Installer les dépendances
npm install

# 3. Démarrer le serveur de développement
npx expo start
```

4. Scannez le QR code avec **Expo Go** (Android) ou l'**appareil photo** (iOS)

---

## 📦 Générer l'APK Android gratuitement (EAS Build)

### 1. Créer un compte Expo (gratuit)
```
https://expo.dev/signup
```

### 2. Installer EAS CLI
```bash
npm install -g eas-cli
```

### 3. Se connecter
```bash
eas login
```

### 4. Initialiser le projet
```bash
eas build:configure
```

### 5. Générer l'APK (plan gratuit — ~15 min de build)
```bash
# APK installable directement sur Android
eas build --platform android --profile preview
```

Le lien de téléchargement de l'APK sera affiché à la fin du build.  
Vous pouvez aussi suivre l'avancement sur https://expo.dev

### Générer un AAB pour le Google Play Store
```bash
eas build --platform android --profile production
```

---

## 🍎 Tester sur iOS

### Via Expo Go (sans compte Apple Developer)
1. Installez **Expo Go** depuis l'App Store
2. Lancez `npx expo start`
3. Scannez le QR code avec l'appareil photo iOS

### Build iOS via EAS (nécessite un compte Apple Developer — 99$/an)
```bash
eas build --platform ios --profile production
```

---

## ⚙️ Configuration de l'app

Au premier lancement, allez dans l'onglet **⚙️ Paramètres** et saisissez :

| Champ | Description | Obligatoire |
|---|---|---|
| Nom complet | Votre prénom + nom | ✅ |
| Email destinataire | Email de votre RH / manager | ✅ |
| Email expéditeur | Votre email professionnel | Optionnel |

---

## 📋 Format du mail envoyé

```
Objet : Pointage du lundi 15 janvier 2024 — Marie Dupont

Bonjour,

Voici mon récapitulatif de pointage pour le lundi 15 janvier 2024 :

🕐 Arrivée            : 08:47
☕ Pause café matin   : 10:15 → 10:28 (13min)
🍽️  Déjeuner           : 12:30 → 13:32 (62min)
☕ Pause café après-midi : —
🚪 Départ             : 17:45

⏱️  Temps de travail effectif : 7h53
📊 Temps de pauses total      : 1h15

Cordialement,
Marie Dupont
```

---

## 📁 Structure du projet

```
pointage-app/
├── App.js                     # Navigation principale
├── app.json                   # Configuration Expo
├── eas.json                   # Configuration EAS Build
├── package.json
└── src/
    ├── components/
    │   ├── ActionButton.js    # Bouton de pointage réutilisable
    │   ├── LiveClock.js       # Horloge temps réel
    │   └── SummaryBar.js      # Barre récapitulative
    ├── hooks/
    │   └── useTimings.js      # Hook gestion des pointages
    ├── screens/
    │   ├── HomeScreen.js      # Écran principal
    │   ├── HistoryScreen.js   # Historique 30 jours
    │   └── SettingsScreen.js  # Configuration
    └── utils/
        ├── email.js           # Composition et envoi mail
        ├── storage.js         # AsyncStorage + calculs
        └── theme.js           # Design system (couleurs, spacing)
```

---

## 🔒 Confidentialité

- **Aucune donnée n'est envoyée à un serveur**
- Tout est stocké localement sur l'appareil via AsyncStorage
- Les mails sont composés localement et envoyés via votre client mail habituel
- Désinstallez l'app pour effacer toutes les données

---

## 🐛 Problèmes courants

| Problème | Solution |
|---|---|
| "No mail client available" | Configurez un client mail sur votre téléphone (Gmail, Outlook…) |
| Le mail ne s'envoie pas | Vérifiez l'email destinataire dans Paramètres |
| Les données sont perdues | AsyncStorage est lié à l'installation — ne désinstallez pas sans backup |
| L'heure est incorrecte | L'app utilise l'heure système de votre téléphone |

---

## 📄 Licence

MIT — libre d'utilisation et de modification.
# achord-Pointage
