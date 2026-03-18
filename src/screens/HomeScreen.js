// src/screens/HomeScreen.js
import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Alert,
  ActivityIndicator, TouchableOpacity, Modal, Pressable,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTimings } from '../hooks/useTimings';
import { loadSettings, formatTime, formatDateFr, computeSummary, formatDuration } from '../utils/storage';
import { sendTimingEmail } from '../utils/email';
import { useTheme } from '../utils/ThemeContext';
import { spacing, radius } from '../utils/theme';
import ActionButton from '../components/ActionButton';
import SummaryBar from '../components/SummaryBar';
import LiveClock from '../components/LiveClock';

export default function HomeScreen({ navigation }) {
  const { colors } = useTheme();
  const { timings, dateStr, loading, stamp, reset } = useTimings();
  const [settings, setSettings]               = useState(null);
  const [sending, setSending]                 = useState(false);
  const [showDepartModal, setShowDepartModal] = useState(false);
  const [showResetModal, setShowResetModal]   = useState(false);

  useFocusEffect(useCallback(() => { loadSettings().then(setSettings); }, []));

  const { arrival, coffeeMornStart, coffeeMornEnd, lunchStart, lunchEnd, coffeeAftnStart, coffeeAftnEnd, departure } = timings;

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
      Alert.alert('Erreur d\'envoi', result.error || 'Une erreur est survenue.');
    }
  };

  const confirmReset = async () => { setShowResetModal(false); await reset(); };

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator color={colors.accent} size="large" /></View>;
  }

  const previewSummary = computeSummary({ ...timings, departure: new Date().toISOString() });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>

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
              <MRow label="Travail effectif" value={formatDuration(previewSummary.effectiveWork)} color={colors.success} colors={colors} bold />
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
        <ActionButton emoji="✅" label="Arrivée" color={colors.arrival} timestamp={arrival} disabled={!!arrival} onPress={() => stamp('arrival')} />
        <ActionButton emoji="☕" label="Début pause café" color={colors.coffeeMorn} timestamp={coffeeMornStart} disabled={!arrival || !!coffeeMornStart} onPress={() => stamp('coffeeMornStart')} />
        <ActionButton emoji="☕" label="Fin pause café"   color={colors.coffeeMorn} timestamp={coffeeMornEnd}   disabled={!coffeeMornStart || !!coffeeMornEnd} onPress={() => stamp('coffeeMornEnd')} />

        <SLabel label="DÉJEUNER" colors={colors} />
        <ActionButton emoji="🍽️" label="Début déjeuner" color={colors.lunch} timestamp={lunchStart} disabled={!arrival || !!lunchStart} onPress={() => stamp('lunchStart')} />
        <ActionButton emoji="🍽️" label="Fin déjeuner"   color={colors.lunch} timestamp={lunchEnd}   disabled={!lunchStart || !!lunchEnd} onPress={() => stamp('lunchEnd')} />

        <SLabel label="APRÈS-MIDI (optionnel)" colors={colors} />
        <ActionButton emoji="☕" label="Début pause café" color={colors.coffeeAftn} timestamp={coffeeAftnStart} disabled={!lunchEnd || !!coffeeAftnStart} onPress={() => stamp('coffeeAftnStart')} />
        <ActionButton emoji="☕" label="Fin pause café"   color={colors.coffeeAftn} timestamp={coffeeAftnEnd}   disabled={!coffeeAftnStart || !!coffeeAftnEnd} onPress={() => stamp('coffeeAftnEnd')} />

        <SLabel label="FIN DE JOURNÉE" colors={colors} />
        {sending ? (
          <View style={[styles.sendingBox, { borderColor: colors.departure + '44', backgroundColor: colors.bgCard }]}>
            <ActivityIndicator color={colors.departure} />
            <Text style={[styles.sendingText, { color: colors.textSecondary }]}>Envoi du mail en cours…</Text>
          </View>
        ) : (
          <ActionButton emoji="🚪" label="Départ — Envoyer le mail" color={colors.departure} timestamp={departure} disabled={!arrival || !!departure} onPress={handleDeparturePress} isLast />
        )}

        <View style={{ height: spacing.xl }} />
      </ScrollView>

      <SummaryBar timings={timings} />
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
});
