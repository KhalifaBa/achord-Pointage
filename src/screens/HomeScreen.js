// src/screens/HomeScreen.js
import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Alert,
  ActivityIndicator, TouchableOpacity, Modal, Pressable, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTimings } from '../hooks/useTimings';
import {
  loadSettings, formatTime, formatDateFr, computeSummary, formatDuration,
  lunchCheck, LUNCH_MIN_MINUTES, parseTimeInput,
} from '../utils/storage';
import { sendTimingEmail } from '../utils/email';
import { useTheme } from '../utils/ThemeContext';
import { spacing, radius } from '../utils/theme';
import ActionButton from '../components/ActionButton';
import SummaryBar from '../components/SummaryBar';
import LiveClock from '../components/LiveClock';

// Libellés lisibles pour chaque clé de pointage
const KEY_LABELS = {
  arrival:         '✅ Arrivée',
  coffeeMornStart: '☕ Début café matin',
  coffeeMornEnd:   '☕ Fin café matin',
  lunchStart:      '🍽️ Début déjeuner',
  lunchEnd:        '🍽️ Fin déjeuner',
  coffeeAftnStart: '☕ Début café AM',
  coffeeAftnEnd:   '☕ Fin café AM',
  departure:       '🚪 Départ',
};

// Messages d'avertissement contextuels avant validation
const WARNINGS = {
  arrival:         { icon: '✅', title: "Confirmer l'arrivée", hint: "Vous êtes bien arrivé(e) au bureau ?" },
  coffeeMornStart: { icon: '☕', title: 'Début pause café', hint: 'Vous prenez votre pause café du matin ?' },
  coffeeMornEnd:   { icon: '☕', title: 'Fin pause café', hint: 'Vous reprenez le travail ?' },
  lunchStart:      { icon: '🍽️', title: 'Début déjeuner', hint: 'Vous partez déjeuner ?' },
  lunchEnd:        { icon: '🍽️', title: 'Fin déjeuner', hint: 'Vous reprenez après le déjeuner ?' },
  coffeeAftnStart: { icon: '☕', title: 'Début pause café AM', hint: "Vous prenez votre pause de l'après-midi ?" },
  coffeeAftnEnd:   { icon: '☕', title: 'Fin pause café AM', hint: 'Vous reprenez le travail ?' },
};

export default function HomeScreen({ navigation }) {
  const { colors } = useTheme();
  const { timings, dateStr, loading, stamp, editTiming, reset } = useTimings();
  const [settings, setSettings]               = useState(null);
  const [sending, setSending]                 = useState(false);

  // Modal confirmation action
  const [pendingKey, setPendingKey]           = useState(null); // clé à valider
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Modal départ
  const [showDepartModal, setShowDepartModal] = useState(false);
  // Modal reset
  const [showResetModal, setShowResetModal]   = useState(false);

  // Modal édition d'heure
  const [editKey, setEditKey]                 = useState(null);
  const [editInput, setEditInput]             = useState('');
  const [editError, setEditError]             = useState('');
  const [showEditModal, setShowEditModal]     = useState(false);

  useFocusEffect(useCallback(() => { loadSettings().then(setSettings); }, []));

  const {
    arrival, coffeeMornStart, coffeeMornEnd,
    lunchStart, lunchEnd, coffeeAftnStart, coffeeAftnEnd, departure,
  } = timings;

  // ── Stamp avec avertissement ─────────────────────────────────────────
  const handleStamp = (key) => {
    if (key === 'departure') { handleDeparturePress(); return; }
    setPendingKey(key);
    setShowConfirmModal(true);
  };

  const confirmStamp = async () => {
    setShowConfirmModal(false);
    if (!pendingKey) return;

    // Vérification spéciale fin déjeuner : durée minimum légale
    if (pendingKey === 'lunchEnd' && lunchStart) {
      const nowIso = new Date().toISOString();
      const mins = Math.round((new Date(nowIso) - new Date(lunchStart)) / 60000);
      if (mins < LUNCH_MIN_MINUTES) {
        Alert.alert(
          '⚠️ Pause trop courte',
          `La durée légale minimale de pause déjeuner est de ${LUNCH_MIN_MINUTES} minutes.\nDurée actuelle : ${mins} min.\n\nVoulez-vous quand même valider ?`,
          [
            { text: 'Attendre', style: 'cancel' },
            { text: 'Valider quand même', style: 'destructive', onPress: () => stamp(pendingKey) },
          ]
        );
        return;
      }
    }

    await stamp(pendingKey);
  };

  // ── Départ ────────────────────────────────────────────────────────────
  const handleDeparturePress = () => {
    if (!settings?.employeeName || !settings?.recipientEmail) {
      Alert.alert('Paramètres manquants', "Configurez votre nom et l'email destinataire dans ⚙️ Paramètres.",
        [{ text: 'Annuler', style: 'cancel' }, { text: 'Paramètres', onPress: () => navigation.navigate('Settings') }]);
      return;
    }
    if (!settings?.emailService) {
      Alert.alert('Service mail non configuré', "Choisissez Brevo ou EmailJS dans ⚙️ Paramètres.",
        [{ text: 'Annuler', style: 'cancel' }, { text: 'Paramètres', onPress: () => navigation.navigate('Settings') }]);
      return;
    }

    // Avertissement pause déj si non prise ou trop courte
    const lunch = lunchCheck(lunchStart, lunchEnd);
    if (!lunchStart) {
      Alert.alert(
        '⚠️ Aucune pause déjeuner',
        `Vous n'avez pas enregistré de pause déjeuner.\nRappel : la loi impose au moins ${LUNCH_MIN_MINUTES} min de pause au-delà de 6h de travail.\n\nContinuer quand même ?`,
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Continuer', onPress: () => setShowDepartModal(true) },
        ]
      );
      return;
    }
    if (!lunch.ok) {
      Alert.alert(
        '⚠️ Pause déjeuner trop courte',
        `Durée déjeuner : ${lunch.minutes} min.\nMinimum légal : ${LUNCH_MIN_MINUTES} min.\n\nContinuer quand même ?`,
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Continuer', onPress: () => setShowDepartModal(true) },
        ]
      );
      return;
    }

    setShowDepartModal(true);
  };

  const confirmDeparture = async () => {
    setShowDepartModal(false);
    setSending(true);
    const departureISO   = new Date().toISOString();
    await stamp('departure');
    const updatedTimings = { ...timings, departure: departureISO };
    const result = await sendTimingEmail({ dateStr, timings: updatedTimings, settings });
    setSending(false);
    if (result.success) {
      Alert.alert('✅ Mail envoyé', 'Le récapitulatif de pointage a bien été envoyé.');
    } else {
      Alert.alert("Erreur d'envoi", result.error || 'Une erreur est survenue.');
    }
  };

  // ── Édition d'heure ──────────────────────────────────────────────────
  const openEdit = (key) => {
    if (!timings[key]) return; // ne peut modifier que les heures déjà saisies
    setEditKey(key);
    setEditInput(formatTime(timings[key]));
    setEditError('');
    setShowEditModal(true);
  };

  const confirmEdit = async () => {
    const iso = parseTimeInput(editInput.trim(), dateStr);
    if (!iso) {
      setEditError('Format invalide. Utilisez HH:mm (ex : 08:45)');
      return;
    }
    await editTiming(editKey, iso);
    setShowEditModal(false);
  };

  const confirmReset = async () => { setShowResetModal(false); await reset(); };

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator color={colors.accent} size="large" /></View>;
  }

  const previewSummary = computeSummary({ ...timings, departure: new Date().toISOString() });
  const pendingInfo    = pendingKey ? WARNINGS[pendingKey] : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>

      {/* ── Modal Confirmation Action (stamp) ── */}
      <Modal visible={showConfirmModal} transparent animationType="fade" onRequestClose={() => setShowConfirmModal(false)}>
        <Pressable style={styles.overlay} onPress={() => setShowConfirmModal(false)}>
          <Pressable style={[styles.modalBox, { backgroundColor: colors.bgCard, borderColor: colors.border }]} onPress={() => {}}>
            <Text style={styles.modalIcon}>{pendingInfo?.icon ?? '⏱'}</Text>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{pendingInfo?.title ?? 'Confirmer'}</Text>
            <Text style={[styles.modalSub, { color: colors.textMuted }]}>{formatTime(new Date().toISOString())}</Text>
            <Text style={[styles.modalHint, { color: colors.textSecondary }]}>{pendingInfo?.hint}</Text>
            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.btnCancel, { borderColor: colors.border }]} onPress={() => setShowConfirmModal(false)}>
                <Text style={[styles.btnCancelTxt, { color: colors.textSecondary }]}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnConfirm, { backgroundColor: colors.accent }]} onPress={confirmStamp}>
                <Text style={styles.btnConfirmTxt}>Valider</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Modal Départ ── */}
      <Modal visible={showDepartModal} transparent animationType="fade" onRequestClose={() => setShowDepartModal(false)}>
        <Pressable style={styles.overlay} onPress={() => setShowDepartModal(false)}>
          <Pressable style={[styles.modalBox, { backgroundColor: colors.bgCard, borderColor: colors.border }]} onPress={() => {}}>
            <Text style={styles.modalIcon}>🚪</Text>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Confirmer le départ</Text>
            <Text style={[styles.modalSub, { color: colors.textMuted }]}>{formatDateFr(dateStr)}</Text>

            <View style={[styles.modalSummary, { backgroundColor: colors.bgInput, borderColor: colors.border }]}>
              <MRow label="Arrivée"  value={formatTime(arrival)}  color={colors.arrival} colors={colors} />
              {coffeeMornStart && <MRow label="Café matin" value={`${formatTime(coffeeMornStart)} → ${formatTime(coffeeMornEnd)}`} color={colors.coffeeMorn} colors={colors} />}
              {lunchStart      && <MRow label="Déjeuner"   value={`${formatTime(lunchStart)} → ${formatTime(lunchEnd)}`}           color={colors.lunch}      colors={colors} />}
              {coffeeAftnStart && <MRow label="Café AM"    value={`${formatTime(coffeeAftnStart)} → ${formatTime(coffeeAftnEnd)}`}  color={colors.coffeeAftn} colors={colors} />}
              <MRow label="Départ"   value="Maintenant"            color={colors.departure} colors={colors} />
              <View style={[styles.mDivider, { backgroundColor: colors.border }]} />
              <MRow label="Travail net" value={formatDuration(previewSummary.effectiveWork)} color={colors.success} colors={colors} bold />
            </View>

            <Text style={[styles.modalHint, { color: colors.textMuted }]}>Le mail sera envoyé automatiquement via {settings?.emailService === 'brevo' ? 'Brevo' : 'EmailJS'}.</Text>

            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.btnCancel, { borderColor: colors.border }]} onPress={() => setShowDepartModal(false)}>
                <Text style={[styles.btnCancelTxt, { color: colors.textSecondary }]}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnConfirm, { backgroundColor: colors.departure }]} onPress={confirmDeparture}>
                <Text style={styles.btnConfirmTxt}>Confirmer & Envoyer</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Modal Reset ── */}
      <Modal visible={showResetModal} transparent animationType="fade" onRequestClose={() => setShowResetModal(false)}>
        <Pressable style={styles.overlay} onPress={() => setShowResetModal(false)}>
          <Pressable style={[styles.modalBox, { backgroundColor: colors.bgCard, borderColor: colors.border }]} onPress={() => {}}>
            <Text style={styles.modalIcon}>⚠️</Text>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Réinitialiser ?</Text>
            <Text style={[styles.modalHint, { color: colors.textMuted }]}>Toutes les heures d'aujourd'hui seront effacées.{'\n'}Action irréversible.</Text>
            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.btnCancel, { borderColor: colors.border }]} onPress={() => setShowResetModal(false)}>
                <Text style={[styles.btnCancelTxt, { color: colors.textSecondary }]}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnConfirm, { backgroundColor: colors.danger }]} onPress={confirmReset}>
                <Text style={styles.btnConfirmTxt}>Réinitialiser</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Modal Édition d'heure ── */}
      <Modal visible={showEditModal} transparent animationType="slide" onRequestClose={() => setShowEditModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable style={styles.overlay} onPress={() => setShowEditModal(false)}>
            <Pressable style={[styles.modalBox, { backgroundColor: colors.bgCard, borderColor: colors.border }]} onPress={() => {}}>
              <Text style={styles.modalIcon}>✏️</Text>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Modifier l'heure</Text>
              <Text style={[styles.modalSub, { color: colors.textMuted }]}>{editKey ? KEY_LABELS[editKey] : ''}</Text>

              <TextInput
                style={[
                  styles.timeInput,
                  { borderColor: editError ? (colors.danger || '#e74c3c') : colors.border, color: colors.textPrimary, backgroundColor: colors.bgInput },
                ]}
                value={editInput}
                onChangeText={(t) => { setEditInput(t); setEditError(''); }}
                placeholder="HH:mm"
                placeholderTextColor={colors.textMuted}
                keyboardType="numbers-and-punctuation"
                autoFocus
                maxLength={5}
              />
              {!!editError && <Text style={[styles.errorText, { color: colors.danger || '#e74c3c' }]}>{editError}</Text>}
              <Text style={[styles.modalHint, { color: colors.textMuted }]}>
                Saisir l'heure au format 24h (ex : 08:45)
              </Text>

              <View style={styles.modalBtns}>
                <TouchableOpacity style={[styles.btnCancel, { borderColor: colors.border }]} onPress={() => setShowEditModal(false)}>
                  <Text style={[styles.btnCancelTxt, { color: colors.textSecondary }]}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btnConfirm, { backgroundColor: colors.accent }]} onPress={confirmEdit}>
                  <Text style={styles.btnConfirmTxt}>Enregistrer</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Header ── */}
      <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.bg }]}>
        <View style={styles.headerTop}>
          <Text style={[styles.appTitle, { color: colors.textMuted }]}>POINTAGE</Text>
          <TouchableOpacity onPress={() => setShowResetModal(true)} style={styles.resetBtn}>
            <Text style={[styles.resetBtnText, { color: colors.textMuted }]}>↺ Reset</Text>
          </TouchableOpacity>
        </View>
        <LiveClock dateStr={dateStr} />
        {settings?.employeeName ? (
          <View style={[styles.badge, { backgroundColor: colors.accentDim, borderColor: colors.accent + '44' }]}>
            <Text style={[styles.badgeText, { color: colors.accent }]}>{settings.employeeName.toUpperCase()}</Text>
          </View>
        ) : (
          <TouchableOpacity onPress={() => navigation.navigate('Settings')}>
            <Text style={{ textAlign: 'center', color: colors.warning, fontSize: 12, marginTop: spacing.xs }}>⚠️ Configurer vos paramètres →</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Boutons ── */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.md }} showsVerticalScrollIndicator={false}>

        <SLabel label="MATIN" colors={colors} />
        <ActionButton emoji="✅" label="Arrivée"           color={colors.arrival}    timestamp={arrival}         disabled={!!arrival}                        onPress={() => handleStamp('arrival')}         onLongPress={() => openEdit('arrival')} />
        <ActionButton emoji="☕" label="Début pause café"  color={colors.coffeeMorn} timestamp={coffeeMornStart} disabled={!arrival || !!coffeeMornStart}     onPress={() => handleStamp('coffeeMornStart')} onLongPress={() => openEdit('coffeeMornStart')} />
        <ActionButton emoji="☕" label="Fin pause café"    color={colors.coffeeMorn} timestamp={coffeeMornEnd}   disabled={!coffeeMornStart || !!coffeeMornEnd} onPress={() => handleStamp('coffeeMornEnd')}   onLongPress={() => openEdit('coffeeMornEnd')} />

        <SLabel label="DÉJEUNER" colors={colors} />
        <ActionButton emoji="🍽️" label="Début déjeuner"   color={colors.lunch}      timestamp={lunchStart}      disabled={!arrival || !!lunchStart}           onPress={() => handleStamp('lunchStart')}      onLongPress={() => openEdit('lunchStart')} />
        <ActionButton emoji="🍽️" label="Fin déjeuner"     color={colors.lunch}      timestamp={lunchEnd}        disabled={!lunchStart || !!lunchEnd}           onPress={() => handleStamp('lunchEnd')}        onLongPress={() => openEdit('lunchEnd')} />

        <SLabel label="APRÈS-MIDI (optionnel)" colors={colors} />
        <ActionButton emoji="☕" label="Début pause café"  color={colors.coffeeAftn} timestamp={coffeeAftnStart} disabled={!lunchEnd || !!coffeeAftnStart}      onPress={() => handleStamp('coffeeAftnStart')} onLongPress={() => openEdit('coffeeAftnStart')} />
        <ActionButton emoji="☕" label="Fin pause café"    color={colors.coffeeAftn} timestamp={coffeeAftnEnd}   disabled={!coffeeAftnStart || !!coffeeAftnEnd}  onPress={() => handleStamp('coffeeAftnEnd')}   onLongPress={() => openEdit('coffeeAftnEnd')} />

        <SLabel label="FIN DE JOURNÉE" colors={colors} />
        {sending ? (
          <View style={[styles.sendingBox, { borderColor: colors.departure + '44', backgroundColor: colors.bgCard }]}>
            <ActivityIndicator color={colors.departure} />
            <Text style={[styles.sendingText, { color: colors.textSecondary }]}>Envoi du mail en cours…</Text>
          </View>
        ) : (
          <ActionButton emoji="🚪" label="Départ — Envoyer le mail" color={colors.departure} timestamp={departure} disabled={!arrival || !!departure} onPress={() => handleStamp('departure')} onLongPress={() => openEdit('departure')} isLast />
        )}

        {/* Hint édition */}
        <Text style={[styles.editHint, { color: colors.textMuted }]}>
          ✏️ Appui long sur un événement pour modifier son heure
        </Text>

        <View style={{ height: spacing.xl }} />
      </ScrollView>

      <SummaryBar timings={timings} dateStr={dateStr} settings={settings} />
    </SafeAreaView>
  );
}

function SLabel({ label, colors }) {
  return <Text style={{ fontSize: 10, fontWeight: '700', color: colors.textMuted, letterSpacing: 3, textTransform: 'uppercase', marginTop: spacing.md, marginBottom: spacing.xs, marginLeft: spacing.xs }}>{label}</Text>;
}

function MRow({ label, value, color, colors, bold }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 }}>
      <Text style={{ fontSize: 13, color: colors.textSecondary }}>{label}</Text>
      <Text style={{ fontSize: bold ? 15 : 13, fontWeight: bold ? '800' : '600', fontFamily: 'Courier New', color, letterSpacing: 0.5 }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
  modalBox:     { width: '100%', borderRadius: radius.xl, borderWidth: 1, padding: spacing.xl, alignItems: 'center' },
  modalIcon:    { fontSize: 40, marginBottom: spacing.sm },
  modalTitle:   { fontSize: 20, fontWeight: '800', marginBottom: spacing.xs, letterSpacing: 0.3 },
  modalSub:     { fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.lg },
  modalSummary: { width: '100%', borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md, borderWidth: 1 },
  mDivider:     { height: 1, marginVertical: spacing.sm },
  modalHint:    { fontSize: 12, textAlign: 'center', lineHeight: 18, marginBottom: spacing.lg },
  modalBtns:    { flexDirection: 'row', gap: spacing.sm, width: '100%' },
  btnCancel:    { flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1, alignItems: 'center' },
  btnCancelTxt: { fontWeight: '600', fontSize: 14 },
  btnConfirm:   { flex: 2, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: 'center' },
  btnConfirmTxt:{ color: '#fff', fontWeight: '700', fontSize: 14 },
  header:       { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md, borderBottomWidth: 1 },
  headerTop:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  appTitle:     { fontSize: 11, fontWeight: '800', letterSpacing: 4, fontFamily: 'Courier New' },
  resetBtn:     { paddingVertical: 4, paddingHorizontal: spacing.sm },
  resetBtnText: { fontSize: 12, letterSpacing: 0.5 },
  badge:        { alignSelf: 'center', marginTop: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.xl, borderWidth: 1 },
  badgeText:    { fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  sendingBox:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingVertical: spacing.lg, borderRadius: radius.md, borderWidth: 1, marginBottom: spacing.sm },
  sendingText:  { fontSize: 14 },
  timeInput:    { width: '100%', borderWidth: 1.5, borderRadius: radius.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, fontSize: 32, fontWeight: '800', fontFamily: 'Courier New', textAlign: 'center', letterSpacing: 4, marginBottom: spacing.sm },
  errorText:    { fontSize: 12, marginBottom: spacing.sm },
  editHint:     { fontSize: 10, textAlign: 'center', letterSpacing: 0.5, marginTop: spacing.sm, opacity: 0.6 },
});
