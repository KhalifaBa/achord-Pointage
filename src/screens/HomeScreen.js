// src/screens/HomeScreen.js
import React, { useState, useCallback, useEffect, useRef } from 'react';
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
import { scheduleReminders } from '../utils/reminders';
import { nextQuickStep } from '../utils/quickStep';

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

// Ordre du « pointage en 1 tap »
const QUICK_STEPS = {
  arrival:         { emoji: '✅', label: "Pointer l'arrivée",   color: 'arrival' },
  coffeeMornEnd:   { emoji: '☕', label: 'Fin de la pause café', color: 'coffeeMorn' },
  lunchStart:      { emoji: '🍽️', label: 'Partir déjeuner',     color: 'lunch' },
  lunchEnd:        { emoji: '🍽️', label: 'Retour du déjeuner',  color: 'lunch' },
  coffeeAftnEnd:   { emoji: '☕', label: 'Fin de la pause café', color: 'coffeeAftn' },
  departure:       { emoji: '🚪', label: 'Pointer le départ',   color: 'departure' },
};

const UNDO_MS = 6000;

// Messages d'avertissement contextuels avant validation
const WARNINGS = {
  arrival:         { icon: '✅', title: "Confirmer l'arrivée", hint: 'Vous êtes bien arrivé(e) au bureau ?' },
  coffeeMornStart: { icon: '☕', title: 'Début pause café', hint: 'Vous prenez votre pause café du matin ?' },
  coffeeMornEnd:   { icon: '☕', title: 'Fin pause café', hint: 'Vous reprenez le travail ?' },
  lunchStart:      { icon: '🍽️', title: 'Début déjeuner', hint: `Vous partez déjeuner ?\n⚖️ Rappel : ${LUNCH_MIN_MINUTES} min minimum obligatoires.` },
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

  // Toast « Annuler » après un pointage en 1 tap
  const [undo, setUndo]                       = useState(null); // { key, label, time }
  const undoTimer                             = useRef(null);

  useFocusEffect(useCallback(() => { loadSettings().then(setSettings); }, []));

  // Rappels : recalculés quand on pointe l'arrivée / le départ ou qu'on change les réglages
  useEffect(() => {
    if (!settings || loading) return;
    scheduleReminders({ settings, dateStr, todayTimings: timings }).catch(() => {});
  }, [settings, loading, dateStr, timings.arrival, timings.departure]);

  useEffect(() => () => clearTimeout(undoTimer.current), []);

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

  /** Pointe la clé (avec la vérification légale du déjeuner). Retourne l'ISO ou null. */
  const doStamp = async (key) => {
    // Vérification stricte fin déjeuner : durée minimum légale obligatoire, non contournable
    if (key === 'lunchEnd' && lunchStart) {
      const nowIso = new Date().toISOString();
      const mins = Math.round((new Date(nowIso) - new Date(lunchStart)) / 60000);
      if (mins < LUNCH_MIN_MINUTES) {
        const remaining = LUNCH_MIN_MINUTES - mins;
        Alert.alert(
          '⛔ Pause trop courte',
          `La pause déjeuner doit durer au minimum ${LUNCH_MIN_MINUTES} minutes (obligation légale).\nDurée actuelle : ${mins} min.\nPatientez encore ${remaining} min avant de valider.`,
          [{ text: 'Compris', style: 'default' }]
        );
        return null;
      }
    }
    return stamp(key);
  };

  const confirmStamp = async () => {
    setShowConfirmModal(false);
    if (!pendingKey) return;
    await doStamp(pendingKey);
  };

  const showUndo = (key, iso) => {
    clearTimeout(undoTimer.current);
    setUndo({ key, label: KEY_LABELS[key], time: formatTime(iso) });
    undoTimer.current = setTimeout(() => setUndo(null), UNDO_MS);
  };

  const undoLast = async () => {
    if (!undo) return;
    clearTimeout(undoTimer.current);
    await editTiming(undo.key, null);
    setUndo(null);
  };

  // ── Pointage en 1 tap (sans modal, avec « Annuler ») ──────────────────
  const quickStamp = async () => {
    const key = nextQuickStep(timings);
    if (!key) return;
    if (key === 'departure') { handleDeparturePress(); return; } // garde le récap de fin de journée
    const iso = await doStamp(key);
    if (iso) showUndo(key, iso);
  };

  // ── Départ ────────────────────────────────────────────────────────────
  // Le départ ne fait QUE pointer. Le mail est un bouton à part (voir handleSendMail).
  const handleDeparturePress = () => {
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
    const iso = await stamp('departure');
    if (iso) showUndo('departure', iso);
  };

  // ── Mail (séparé du départ) ───────────────────────────────────────────
  const handleSendMail = async () => {
    if (!settings?.employeeName || !settings?.recipientEmail || !settings?.emailService) {
      Alert.alert('Mail non configuré', "Renseignez votre nom, le destinataire et le service mail dans ⚙️ Paramètres.",
        [{ text: 'Annuler', style: 'cancel' }, { text: 'Paramètres', onPress: () => navigation.navigate('Settings') }]);
      return;
    }
    setSending(true);
    const result = await sendTimingEmail({ dateStr, timings, settings });
    setSending(false);
    if (result.success) {
      await editTiming('mailSentAt', new Date().toISOString());
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

    // Validation stricte de la durée légale de pause déjeuner.
    // On simule le nouveau couple lunchStart/lunchEnd avec la modif en cours.
    if (editKey === 'lunchStart' || editKey === 'lunchEnd') {
      const simulatedStart = editKey === 'lunchStart' ? iso : lunchStart;
      const simulatedEnd   = editKey === 'lunchEnd'   ? iso : lunchEnd;
      if (simulatedStart && simulatedEnd) {
        const { ok, minutes } = lunchCheck(simulatedStart, simulatedEnd);
        if (!ok) {
          setEditError(`Refusé : pause déjeuner de ${minutes} min < minimum légal de ${LUNCH_MIN_MINUTES} min.`);
          return;
        }
      }
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

            <Text style={[styles.modalHint, { color: colors.textMuted }]}>Aucun mail n'est envoyé ici. Tu pourras l'envoyer ensuite avec le bouton 📧.</Text>

            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.btnCancel, { borderColor: colors.border }]} onPress={() => setShowDepartModal(false)}>
                <Text style={[styles.btnCancelTxt, { color: colors.textSecondary }]}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnConfirm, { backgroundColor: colors.departure }]} onPress={confirmDeparture}>
                <Text style={styles.btnConfirmTxt}>Confirmer le départ</Text>
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

        <QuickButton
          stepKey={nextQuickStep(timings)}
          workLabel={formatDuration(Math.max(0, previewSummary.effectiveWork ?? 0))}
          doneLabel={formatDuration(computeSummary(timings).effectiveWork)}
          colors={colors}
          onPress={quickStamp}
        />

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
        <ActionButton emoji="🚪" label="Départ" color={colors.departure} timestamp={departure} disabled={!arrival || !!departure} onPress={() => handleStamp('departure')} onLongPress={() => openEdit('departure')} />
        {sending ? (
          <View style={[styles.sendingBox, { borderColor: colors.accent + '44', backgroundColor: colors.bgCard }]}>
            <ActivityIndicator color={colors.accent} />
            <Text style={[styles.sendingText, { color: colors.textSecondary }]}>Envoi du mail en cours…</Text>
          </View>
        ) : (
          <ActionButton
            emoji="📧"
            label={timings.mailSentAt ? 'Renvoyer le mail' : 'Envoyer le mail'}
            color={colors.accent}
            timestamp={timings.mailSentAt}
            disabled={!departure}
            onPress={handleSendMail}
            allowRepeat
            isLast
          />
        )}

        {/* Hint édition */}
        <Text style={[styles.editHint, { color: colors.textMuted }]}>
          ✏️ Appui long sur un événement pour modifier son heure
        </Text>

        <View style={{ height: spacing.xl }} />
      </ScrollView>

      {undo && (
        <View style={[styles.toast, { backgroundColor: colors.bgCard, borderColor: colors.accent + '66' }]}>
          <Text style={[styles.toastTxt, { color: colors.textPrimary }]}>{undo.label} · {undo.time}</Text>
          <TouchableOpacity onPress={undoLast} style={styles.toastBtn}>
            <Text style={{ color: colors.accent, fontWeight: '800', fontSize: 14 }}>ANNULER</Text>
          </TouchableOpacity>
        </View>
      )}

      <SummaryBar timings={timings} dateStr={dateStr} settings={settings} />
    </SafeAreaView>
  );
}

function QuickButton({ stepKey, workLabel, doneLabel, colors, onPress }) {
  if (!stepKey) {
    return (
      <View style={[styles.quick, { borderColor: colors.success + '66', backgroundColor: colors.success + '15' }]}>
        <Text style={[styles.quickLabel, { color: colors.success }]}>🏁 Journée terminée</Text>
        <Text style={[styles.quickSub, { color: colors.textSecondary }]}>Travail net : {doneLabel}</Text>
      </View>
    );
  }
  const step = QUICK_STEPS[stepKey];
  const color = colors[step.color] || colors.accent;
  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onPress}
      style={[styles.quick, { borderColor: color, backgroundColor: color + '22' }]}>
      <Text style={styles.quickEmoji}>{step.emoji}</Text>
      <Text style={[styles.quickLabel, { color }]}>{step.label}</Text>
      <Text style={[styles.quickSub, { color: colors.textSecondary }]}>
        {stepKey === 'arrival' ? 'Un appui suffit' : `Travail en cours : ${workLabel}`}
      </Text>
    </TouchableOpacity>
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
  quick:        { borderWidth: 2, borderRadius: radius.xl, paddingVertical: spacing.lg, alignItems: 'center', marginTop: spacing.xs, marginBottom: spacing.sm },
  quickEmoji:   { fontSize: 34, marginBottom: 4 },
  quickLabel:   { fontSize: 20, fontWeight: '800', letterSpacing: 0.3 },
  quickSub:     { fontSize: 12, marginTop: 4 },
  toast:        { position: 'absolute', left: spacing.md, right: spacing.md, bottom: 130, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, elevation: 6, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8 },
  toastTxt:     { flex: 1, fontSize: 14, fontWeight: '600' },
  toastBtn:     { paddingVertical: 6, paddingHorizontal: spacing.sm },
  editHint:     { fontSize: 10, textAlign: 'center', letterSpacing: 0.5, marginTop: spacing.sm, opacity: 0.6 },
});
