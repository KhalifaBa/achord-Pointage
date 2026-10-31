// src/screens/SettingsScreen.js
// Paramètres : identité, service mail (Brevo/EmailJS), thème

import React, { useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, KeyboardAvoidingView, Platform, Switch,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { loadSettings, saveSettings, loadTimings, todayStr } from '../utils/storage';
import { ensureNotificationPermission, scheduleReminders } from '../utils/reminders';
import { exportBackup, importBackup } from '../utils/backup';
import { notify } from '../export/fileIO';
import { useTheme } from '../utils/ThemeContext';
import { radius, spacing, themes } from '../utils/theme';

export default function SettingsScreen() {
  const { colors, themeKey, setTheme } = useTheme();

  const [employeeName,       setEmployeeName]       = useState('');
  const [recipientEmail,     setRecipientEmail]     = useState('');
  const [senderEmail,        setSenderEmail]        = useState('');
  const [emailService,       setEmailService]       = useState('brevo'); // 'brevo' | 'emailjs'
  const [brevoApiKey,        setBrevoApiKey]        = useState('');
  const [emailjsServiceId,   setEmailjsServiceId]   = useState('');
  const [emailjsTemplateId,  setEmailjsTemplateId]  = useState('');
  const [emailjsPublicKey,   setEmailjsPublicKey]   = useState('');
  const [expectedArrival,    setExpectedArrival]    = useState('09:30');
  const [expectedDeparture,  setExpectedDeparture]  = useState('18:00');
  const [location,           setLocation]           = useState('');
  const [remindersEnabled,   setRemindersEnabled]   = useState(false);
  const [saved, setSaved] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadSettings().then((s) => {
        setEmployeeName(s.employeeName        || '');
        setRecipientEmail(s.recipientEmail    || '');
        setSenderEmail(s.senderEmail          || '');
        setEmailService(s.emailService        || 'brevo');
        setBrevoApiKey(s.brevoApiKey          || '');
        setEmailjsServiceId(s.emailjsServiceId   || '');
        setEmailjsTemplateId(s.emailjsTemplateId || '');
        setEmailjsPublicKey(s.emailjsPublicKey   || '');
        setExpectedArrival(s.expectedArrival     || '09:30');
        setExpectedDeparture(s.expectedDeparture || '18:00');
        setLocation(s.location || '');
        setRemindersEnabled(!!s.remindersEnabled);
      });
      setSaved(false);
    }, [])
  );

  const handleSave = async () => {
    if (!employeeName.trim()) {
      Alert.alert('Champ requis', 'Veuillez saisir votre nom.');
      return;
    }
    let reminders = remindersEnabled;
    if (reminders && Platform.OS !== 'web') {
      const ok = await ensureNotificationPermission({ ask: true });
      if (!ok) {
        reminders = false;
        setRemindersEnabled(false);
        notify('Notifications refusées', "Autorise les notifications de l'app dans les réglages du téléphone pour recevoir les rappels.");
      }
    }
    const newSettings = {
      employeeName:      employeeName.trim(),
      recipientEmail:    recipientEmail.trim(),
      senderEmail:       senderEmail.trim(),
      emailService,
      brevoApiKey:       brevoApiKey.trim(),
      emailjsServiceId:  emailjsServiceId.trim(),
      emailjsTemplateId: emailjsTemplateId.trim(),
      emailjsPublicKey:  emailjsPublicKey.trim(),
      expectedArrival:   expectedArrival.trim() || '09:30',
      expectedDeparture: expectedDeparture.trim() || '18:00',
      location:          location.trim(),
      remindersEnabled:  reminders,
    };
    await saveSettings(newSettings);
    const today = todayStr();
    scheduleReminders({ settings: newSettings, dateStr: today, todayTimings: await loadTimings(today) }).catch(() => {});
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleExport = async () => {
    try {
      await exportBackup();
    } catch (e) {
      notify('Erreur', e.message);
    }
  };

  const handleImport = async () => {
    try {
      const days = await importBackup();
      if (days === null) return;
      notify('✅ Restauré', `${days} jour(s) de pointage restauré(s). Rouvre les onglets pour voir les données.`);
      const st = await loadSettings();
      setEmployeeName(st.employeeName || ''); setRecipientEmail(st.recipientEmail || '');
      setLocation(st.location || ''); setRemindersEnabled(!!st.remindersEnabled);
    } catch (e) {
      notify('Restauration impossible', e.message);
    }
  };

  const s = makeStyles(colors);

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">

          {/* ══════════════════════════════════════════
              IDENTITÉ
          ══════════════════════════════════════════ */}
          <SectionTitle label="IDENTITÉ" colors={colors} />

          <Field label="Votre nom complet *" placeholder="ex : Marie Dupont"
            value={employeeName} onChangeText={setEmployeeName}
            autoCapitalize="words" colors={colors} />

          <Field label="Email destinataire (RH / manager)" placeholder="rh@entreprise.com"
            value={recipientEmail} onChangeText={setRecipientEmail}
            keyboardType="email-address" colors={colors} />

          <Field label="Votre email (expéditeur)" placeholder="vous@entreprise.com"
            value={senderEmail} onChangeText={setSenderEmail}
            keyboardType="email-address" colors={colors} />

          <Field label="Lieu de travail (export Excel)" placeholder="ex : Bureau de Champ"
            value={location} onChangeText={setLocation}
            autoCapitalize="sentences" colors={colors} />

          {/* ══════════════════════════════════════════
              SERVICE D'ENVOI
          ══════════════════════════════════════════ */}
          <SectionTitle label="SERVICE D'ENVOI MAIL" colors={colors} />

          {/* Sélecteur Brevo / EmailJS */}
          <View style={s.serviceRow}>
            <ServiceTab
              label="Brevo"
              sublabel="300 mails/jour gratuits"
              selected={emailService === 'brevo'}
              onPress={() => setEmailService('brevo')}
              colors={colors}
            />
            <ServiceTab
              label="EmailJS"
              sublabel="200 mails/mois gratuits"
              selected={emailService === 'emailjs'}
              onPress={() => setEmailService('emailjs')}
              colors={colors}
            />
          </View>

          {/* ── Champs Brevo ── */}
          {emailService === 'brevo' && (
            <View style={s.serviceBlock}>
              <Text style={s.serviceHint}>
                1. Créez un compte gratuit sur{' '}
                <Text style={{ color: colors.accent }}>brevo.com</Text>{'\n'}
                2. Settings → SMTP & API → API Keys → Créer une clé{'\n'}
                3. Collez-la ci-dessous
              </Text>
              <Field
                label="Clé API Brevo *"
                placeholder="xkeysib-..."
                value={brevoApiKey}
                onChangeText={setBrevoApiKey}
                colors={colors}
                mono
              />
            </View>
          )}

          {/* ── Champs EmailJS ── */}
          {emailService === 'emailjs' && (
            <View style={s.serviceBlock}>
              <Text style={s.serviceHint}>
                1. Créez un compte sur{' '}
                <Text style={{ color: colors.accent }}>emailjs.com</Text>{'\n'}
                2. Add New Service → connectez votre Gmail / Outlook{'\n'}
                3. Créez un template avec les variables :{'\n'}
                {'   '}{'{{'}to_email{'}}'}, {'{{'}subject{'}}'}, {'{{'}message{'}}'}
              </Text>
              <Field label="Service ID *" placeholder="service_xxxxxxx"
                value={emailjsServiceId} onChangeText={setEmailjsServiceId}
                colors={colors} mono />
              <Field label="Template ID *" placeholder="template_xxxxxxx"
                value={emailjsTemplateId} onChangeText={setEmailjsTemplateId}
                colors={colors} mono />
              <Field label="Public Key *" placeholder="xxxxxxxxxxxxxxxxxxxxxx"
                value={emailjsPublicKey} onChangeText={setEmailjsPublicKey}
                colors={colors} mono />
            </View>
          )}

          {/* ══════════════════════════════════════════
              HORAIRE CONTRACTUEL
          ══════════════════════════════════════════ */}
          <SectionTitle label="HORAIRE CONTRACTUEL" colors={colors} />

          <View style={[s.serviceBlock, { marginBottom: spacing.md }]}>
            <Text style={s.serviceHint}>
              Ces heures servent à calculer vos avances et retards affichés dans la barre de résumé. Elles ne sont pas transmises par mail.
            </Text>
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <View style={{ flex: 1 }}>
                <Field label="Arrivée théorique" placeholder="09:30"
                  value={expectedArrival} onChangeText={setExpectedArrival}
                  keyboardType="numbers-and-punctuation" colors={colors} mono />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Départ théorique" placeholder="18:00"
                  value={expectedDeparture} onChangeText={setExpectedDeparture}
                  keyboardType="numbers-and-punctuation" colors={colors} mono />
              </View>
            </View>
          </View>

          {/* ══════════════════════════════════════════
              RAPPELS
          ══════════════════════════════════════════ */}
          <SectionTitle label="RAPPELS" colors={colors} />
          <View style={[s.serviceBlock, { flexDirection: 'row', alignItems: 'center' }]}>
            <View style={{ flex: 1, paddingRight: spacing.md }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPrimary }}>Me rappeler de pointer</Text>
              <Text style={[s.serviceHint, { marginBottom: 0 }]}>
                Arrivée théorique + 10 min et départ + 5 min, du lundi au vendredi. Pas de rappel si c'est déjà pointé.
              </Text>
            </View>
            <Switch value={remindersEnabled} onValueChange={setRemindersEnabled}
              trackColor={{ true: colors.accent, false: colors.border }} />
          </View>

          {/* ══════════════════════════════════════════
              SAUVEGARDE
          ══════════════════════════════════════════ */}
          <SectionTitle label="SAUVEGARDE" colors={colors} />
          <View style={s.serviceBlock}>
            <Text style={s.serviceHint}>
              Pour changer de téléphone sans rien perdre. Les clés API ne sont pas incluses.
            </Text>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <TouchableOpacity style={s.backupBtn} onPress={handleExport}>
                <Text style={s.backupTxt}>💾 Sauvegarder</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.backupBtn} onPress={handleImport}>
                <Text style={s.backupTxt}>📥 Restaurer</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ══════════════════════════════════════════
              THÈME
          ══════════════════════════════════════════ */}
          <SectionTitle label="APPARENCE" colors={colors} />

          <View style={s.themeGrid}>
            {Object.entries(themes).map(([key, t]) => (
              <TouchableOpacity
                key={key}
                style={[
                  s.themeCard,
                  { backgroundColor: t.bgCard, borderColor: themeKey === key ? colors.accent : t.border },
                ]}
                onPress={() => setTheme(key)}
                activeOpacity={0.8}
              >
                {/* Mini preview de couleurs */}
                <View style={s.themeSwatches}>
                  {[t.arrival, t.coffeeMorn, t.lunch, t.departure].map((c, i) => (
                    <View key={i} style={[s.swatch, { backgroundColor: c }]} />
                  ))}
                </View>
                <Text style={[s.themeIcon]}>{t.icon}</Text>
                <Text style={[s.themeName, { color: themeKey === key ? colors.accent : t.textSecondary }]}>
                  {t.name}
                </Text>
                {themeKey === key && (
                  <View style={[s.themeCheck, { backgroundColor: colors.accent }]}>
                    <Text style={{ fontSize: 9, color: t.bg, fontWeight: '800' }}>✓</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>

          {/* ══════════════════════════════════════════
              BOUTON SAUVEGARDER
          ══════════════════════════════════════════ */}
          <TouchableOpacity
            style={[s.saveBtn, saved && { backgroundColor: colors.success }]}
            onPress={handleSave}
            activeOpacity={0.8}
          >
            <Text style={s.saveBtnText}>
              {saved ? '✓  Paramètres sauvegardés' : 'Sauvegarder'}
            </Text>
          </TouchableOpacity>

          <View style={s.footer}>
            <Text style={[s.footerText, { color: colors.textMuted }]}>Pointage Pro · v1.0.0</Text>
            <Text style={[s.footerText, { color: colors.textMuted }]}>100% local · gratuit</Text>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Composants internes ─────────────────────────────────────────────

function SectionTitle({ label, colors }) {
  return (
    <Text style={{
      fontSize: 11, fontWeight: '800', color: colors.textMuted,
      letterSpacing: 3, textTransform: 'uppercase',
      marginTop: spacing.lg, marginBottom: spacing.sm,
    }}>
      {label}
    </Text>
  );
}

function ServiceTab({ label, sublabel, selected, onPress, colors }) {
  return (
    <TouchableOpacity
      style={{
        flex: 1, alignItems: 'center', paddingVertical: spacing.md,
        borderRadius: radius.md, marginHorizontal: 4,
        borderWidth: 1.5,
        borderColor: selected ? colors.accent : colors.border,
        backgroundColor: selected ? colors.accentDim : colors.bgCard,
      }}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={{ fontSize: 14, fontWeight: '700', color: selected ? colors.accent : colors.textSecondary }}>
        {label}
      </Text>
      <Text style={{ fontSize: 10, color: colors.textMuted, marginTop: 2 }}>{sublabel}</Text>
    </TouchableOpacity>
  );
}

function Field({ label, placeholder, value, onChangeText, keyboardType, autoCapitalize, colors, mono }) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textMuted, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: spacing.sm }}>
        {label}
      </Text>
      <TextInput
        style={{
          backgroundColor: colors.bgInput,
          borderWidth: 1, borderColor: colors.border,
          borderRadius: radius.md,
          paddingHorizontal: spacing.md, paddingVertical: spacing.md,
          fontSize: mono ? 13 : 16,
          color: colors.textPrimary,
          fontFamily: mono ? 'Courier New' : undefined,
        }}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType || 'default'}
        autoCapitalize={autoCapitalize || 'none'}
        autoCorrect={false}
        returnKeyType="done"
      />
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────

function makeStyles(colors) {
  return StyleSheet.create({
    safe:      { flex: 1, backgroundColor: colors.bg },
    container: { padding: spacing.lg, paddingBottom: spacing.xxl },

    serviceRow: { flexDirection: 'row', marginBottom: spacing.sm },
    serviceBlock: {
      backgroundColor: colors.bgCard, borderRadius: radius.md,
      borderWidth: 1, borderColor: colors.border,
      padding: spacing.md, marginBottom: spacing.md,
    },
    serviceHint: {
      fontSize: 12, color: colors.textSecondary,
      lineHeight: 20, marginBottom: spacing.md,
    },

    themeGrid: {
      flexDirection: 'row', flexWrap: 'wrap',
      gap: spacing.sm, marginBottom: spacing.lg,
    },
    themeCard: {
      width: '47%', borderRadius: radius.md, borderWidth: 1.5,
      padding: spacing.md, alignItems: 'center', position: 'relative',
    },
    themeSwatches: { flexDirection: 'row', gap: 4, marginBottom: spacing.sm },
    swatch: { width: 14, height: 14, borderRadius: 7 },
    themeIcon: { fontSize: 22, marginBottom: 4 },
    themeName: { fontSize: 13, fontWeight: '700' },
    themeCheck: {
      position: 'absolute', top: 8, right: 8,
      width: 18, height: 18, borderRadius: 9,
      alignItems: 'center', justifyContent: 'center',
    },

    backupBtn: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', backgroundColor: colors.bgInput },
    backupTxt: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },

    saveBtn: {
      backgroundColor: colors.accent,
      paddingVertical: spacing.md + 2,
      borderRadius: radius.md,
      alignItems: 'center',
      marginBottom: spacing.xl,
      marginTop: spacing.sm,
    },
    saveBtnText: { fontSize: 15, fontWeight: '700', color: colors.bg, letterSpacing: 0.5 },

    footer: { alignItems: 'center', gap: 4, marginTop: spacing.md },
    footerText: { fontSize: 11, letterSpacing: 0.5 },
  });
}
