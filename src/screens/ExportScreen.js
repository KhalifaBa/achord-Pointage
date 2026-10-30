// src/screens/ExportScreen.js
// Export du « Suivi Mensuel » :
//   1. Importer le fichier Excel du mois (celui envoyé par l'entreprise)
//   2. Choisir le projet de chaque jour (+ corriger les horaires si besoin)
//   3. Générer le fichier rempli et le partager

import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Modal, Pressable,
  TextInput, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../utils/ThemeContext';
import { spacing, radius } from '../utils/theme';
import { loadSettings, loadTimings, saveTimings, parseTimeInput, durationMinutes } from '../utils/storage';
import {
  computeMonth, isoToMinutes, minutesToHHmm, formatHours, hhmmToMinutes,
  dayNumber, dateStrFromDayNumber, weekdayIndex, frenchHolidays, ABSENCE_PROJECTS,
} from '../export/monthModel';
import { readSuivi, fillSuivi, filledName } from '../export/suiviXlsx';
import {
  pickXlsx, saveAndShare, saveSuiviFile, loadSuiviFile,
  loadMonthProjects, saveMonthProjects, notify, ask,
} from '../export/fileIO';

const DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const shortDate = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** Horaires stockés (ISO) → minutes pour le calcul */
function toMinutesDay(t) {
  if (!t) return null;
  const breaks = [];
  const cm = durationMinutes(t.coffeeMornStart, t.coffeeMornEnd);
  const ca = durationMinutes(t.coffeeAftnStart, t.coffeeAftnEnd);
  if (cm) breaks.push(cm);
  if (ca) breaks.push(ca);
  return {
    arrival: isoToMinutes(t.arrival),
    lunchStart: isoToMinutes(t.lunchStart),
    lunchEnd: isoToMinutes(t.lunchEnd),
    departure: isoToMinutes(t.departure),
    breaks,
  };
}

export default function ExportScreen({ navigation }) {
  const { colors } = useTheme();
  const s = makeStyles(colors);

  const [loading, setLoading]   = useState(true);
  const [busy, setBusy]         = useState(false);
  const [file, setFile]         = useState(null);   // { name, base64 }
  const [info, setInfo]         = useState(null);   // readSuivi()
  const [projects, setProjects] = useState({});     // dateStr → projet
  const [stored, setStored]     = useState({});     // dateStr → timings ISO
  const [settings, setSettings] = useState(null);

  const [picker, setPicker]     = useState(null);   // { mode: 'day', dateStr } | { mode: 'bulk' }
  const [editDay, setEditDay]   = useState(null);   // dateStr
  const [editForm, setEditForm] = useState({});
  const [editError, setEditError] = useState('');

  // ── Chargement ──
  const loadAll = useCallback(async (f) => {
    const st = await loadSettings();
    setSettings(st);
    if (!f) { setFile(null); setInfo(null); return; }
    const parsed = await readSuivi(f.base64);
    const first = parsed.dates[0].dateStr;
    // Les 7 jours avant le mois servent à vérifier les repos du début de mois
    const dates = [
      ...Array.from({ length: 7 }, (_, i) => dateStrFromDayNumber(dayNumber(first) - 7 + i)),
      ...parsed.dates.map((d) => d.dateStr),
    ];
    const entries = await Promise.all(dates.map(async (d) => [d, await loadTimings(d)]));
    const storedMap = Object.fromEntries(entries);

    const saved = await loadMonthProjects(parsed.month);
    // Jours fériés sans pointage → « Férié » proposé (modifiable)
    const holidays = frenchHolidays(Number(parsed.month.slice(0, 4)));
    const proj = { ...saved };
    for (const { dateStr } of parsed.dates) {
      if (!proj[dateStr] && holidays.has(dateStr) && !storedMap[dateStr]?.arrival && parsed.projects.includes('Férié')) {
        proj[dateStr] = 'Férié';
      }
    }
    setFile(f); setInfo(parsed); setStored(storedMap); setProjects(proj);
  }, []);

  useFocusEffect(useCallback(() => {
    let alive = true;
    (async () => {
      try {
        const f = await loadSuiviFile();
        if (alive) await loadAll(f);
      } catch (e) {
        notify('Erreur', e.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [loadAll]));

  // ── Calcul du mois ──
  const month = useMemo(() => {
    if (!info) return null;
    const times = {};
    for (const [d, t] of Object.entries(stored)) times[d] = toMinutesDay(t);
    const fileDays = info.dates.map((d) => ({ dateStr: d.dateStr, project: projects[d.dateStr] || '' }));
    return computeMonth(fileDays, times);
  }, [info, stored, projects]);

  // Totaux tels que la colonne M du fichier les calcule
  const fileTotals = useMemo(() => {
    if (!info || !month) return [];
    const byRow = new Map(info.dates.map((d, i) => [d.row, month.rows[i]]));
    return info.weekFormulas.map((w) => {
      let sum = 0;
      const days = [];
      for (let r = w.from; r <= w.to; r++) {
        const row = byRow.get(r);
        if (row) { sum += row.minutes; days.push(row.dateStr); }
      }
      return { ...w, minutes: sum, first: days[0], last: days[days.length - 1] };
    });
  }, [info, month]);

  const uncounted = useMemo(() => {
    if (!info) return [];
    return info.dates
      .filter((d) => !info.weekFormulas.some((w) => d.row >= w.from && d.row <= w.to))
      .map((d) => d.dateStr);
  }, [info]);

  // ── Actions ──
  const importFile = async () => {
    try {
      const f = await pickXlsx();
      if (!f) return;
      setBusy(true);
      await readSuivi(f.base64);          // vérifie que c'est bien un Suivi Mensuel
      await saveSuiviFile(f);
      await loadAll(f);
    } catch (e) {
      notify('Fichier non reconnu', e.message);
    } finally {
      setBusy(false);
    }
  };

  const setProject = async (dateStr, value) => {
    const next = { ...projects, [dateStr]: value };
    setProjects(next);
    await saveMonthProjects(info.month, next);
  };

  const applyBulk = async (value, onlyEmpty) => {
    const next = { ...projects };
    for (const { dateStr } of info.dates) {
      if (!onlyEmpty || !next[dateStr]) next[dateStr] = value;
    }
    setProjects(next);
    await saveMonthProjects(info.month, next);
  };

  const openEdit = (dateStr) => {
    const t = stored[dateStr] || {};
    const f = (iso) => (iso ? minutesToHHmm(isoToMinutes(iso)) : '');
    setEditForm({ arrival: f(t.arrival), lunchStart: f(t.lunchStart), lunchEnd: f(t.lunchEnd), departure: f(t.departure) });
    setEditError('');
    setEditDay(dateStr);
  };

  const fillStandardDay = () => {
    setEditForm({
      arrival: settings?.expectedArrival || '09:30',
      lunchStart: '12:30',
      lunchEnd: '13:30',
      departure: settings?.expectedDeparture || '18:00',
    });
    setEditError('');
  };

  const saveEdit = async () => {
    const keys = ['arrival', 'lunchStart', 'lunchEnd', 'departure'];
    const mins = {};
    for (const k of keys) {
      const v = (editForm[k] || '').trim();
      if (!v) { mins[k] = null; continue; }
      mins[k] = hhmmToMinutes(v);
      if (mins[k] === null) { setEditError(`Heure invalide : « ${v} » (format 09:30)`); return; }
    }
    if ((mins.lunchStart === null) !== (mins.lunchEnd === null)) { setEditError('Remplis le début ET la fin du déjeuner (ou aucun des deux).'); return; }
    const order = keys.map((k) => mins[k]).filter((v) => v !== null);
    if (order.some((v, i) => i > 0 && v <= order[i - 1])) { setEditError("Les heures doivent être dans l'ordre : arrivée < déjeuner < départ."); return; }

    const prev = stored[editDay] || {};
    const updated = { ...prev };
    for (const k of keys) updated[k] = mins[k] === null ? null : parseTimeInput(minutesToHHmm(mins[k]), editDay);
    await saveTimings(editDay, updated);
    setStored({ ...stored, [editDay]: updated });
    setEditDay(null);
  };

  const generate = async () => {
    const location = settings?.location?.trim();
    if (!location) {
      const go = await ask('Lieu de travail manquant', 'Renseigne « Lieu de travail » dans ⚙️ Paramètres (ex : Bureau de Champ).', 'Paramètres');
      if (go) navigation.navigate('Settings');
      return;
    }
    const missing = month.rows.filter((r) => !r.project);
    if (missing.length) {
      notify('Projets manquants', `Choisis un projet pour : ${missing.map((r) => shortDate(r.dateStr)).join(', ')}`);
      return;
    }
    const problems = month.rows.filter((r) => r.warnings.length);
    if (problems.length) {
      const list = problems.slice(0, 6).map((r) => `${shortDate(r.dateStr)} : ${r.warnings.join(', ')}`).join('\n');
      const ok = await ask('À vérifier', `${list}${problems.length > 6 ? '\n…' : ''}\n\nGénérer quand même ?`, 'Générer');
      if (!ok) return;
    }
    try {
      setBusy(true);
      const out = await fillSuivi(file.base64, month.rows, { location });
      await saveAndShare(filledName(file.name), out);
    } catch (e) {
      notify('Erreur pendant la génération', e.message);
    } finally {
      setBusy(false);
    }
  };

  // ── Rendu ──
  if (loading) {
    return <View style={[s.center, { backgroundColor: colors.bg }]}><ActivityIndicator color={colors.accent} size="large" /></View>;
  }

  if (!info) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <View style={s.center}>
          <Text style={{ fontSize: 48, marginBottom: spacing.md }}>📊</Text>
          <Text style={s.emptyTitle}>Suivi mensuel</Text>
          <Text style={s.emptyText}>Importe le fichier Excel du mois.{'\n'}L'app le remplit avec tes pointages.</Text>
          <TouchableOpacity style={s.primaryBtn} onPress={importFile} disabled={busy}>
            {busy ? <ActivityIndicator color={colors.bg} /> : <Text style={s.primaryTxt}>📂  Importer le fichier du mois</Text>}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const [y, m] = info.month.split('-').map(Number);
  const empty = month.rows.filter((r) => !r.project).length;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>

      {/* ── Choix du projet ── */}
      <Modal visible={!!picker} transparent animationType="fade" onRequestClose={() => setPicker(null)}>
        <Pressable style={s.overlay} onPress={() => setPicker(null)}>
          <Pressable style={s.modalBox} onPress={() => {}}>
            <Text style={s.modalTitle}>
              {picker?.mode === 'bulk' ? 'Projet pour tout le mois' : `Projet du ${picker ? shortDate(picker.dateStr) : ''}`}
            </Text>
            <ScrollView style={{ maxHeight: 420, width: '100%' }}>
              {info.projects.map((p) => {
                const selected = picker?.mode === 'day' && projects[picker.dateStr] === p;
                return (
                  <TouchableOpacity
                    key={p}
                    style={[s.option, selected && { borderColor: colors.accent, backgroundColor: colors.accentDim }]}
                    onPress={async () => {
                      const pk = picker;
                      setPicker(null);
                      if (pk.mode === 'day') await setProject(pk.dateStr, p);
                      else await applyBulk(p, pk.onlyEmpty);
                    }}
                  >
                    <Text style={[s.optionTxt, ABSENCE_PROJECTS.includes(p) && { color: colors.warning }]}>{p.trim()}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            {picker?.mode === 'bulk' && (
              <TouchableOpacity onPress={() => setPicker({ ...picker, onlyEmpty: !picker.onlyEmpty })} style={{ marginTop: spacing.md }}>
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                  {picker.onlyEmpty ? '☑' : '☐'}  Seulement les jours sans projet
                </Text>
              </TouchableOpacity>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Modifier les horaires d'un jour ── */}
      <Modal visible={!!editDay} transparent animationType="slide" onRequestClose={() => setEditDay(null)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={s.overlay} onPress={() => setEditDay(null)}>
            <Pressable style={s.modalBox} onPress={() => {}}>
              <Text style={s.modalTitle}>Horaires du {editDay ? shortDate(editDay) : ''}</Text>
              {[['arrival', 'Arrivée'], ['lunchStart', 'Début déjeuner'], ['lunchEnd', 'Fin déjeuner'], ['departure', 'Départ']].map(([k, label]) => (
                <View key={k} style={s.formRow}>
                  <Text style={s.formLabel}>{label}</Text>
                  <TextInput
                    style={s.formInput}
                    value={editForm[k]}
                    onChangeText={(v) => { setEditForm({ ...editForm, [k]: v }); setEditError(''); }}
                    placeholder="--:--"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numbers-and-punctuation"
                    maxLength={5}
                  />
                </View>
              ))}
              {!!editError && <Text style={{ color: colors.danger, fontSize: 12, marginBottom: spacing.sm }}>{editError}</Text>}
              <TouchableOpacity onPress={fillStandardDay} style={{ marginBottom: spacing.md }}>
                <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '600' }}>⏱  Horaire type (7h)</Text>
              </TouchableOpacity>
              <View style={s.modalBtns}>
                <TouchableOpacity style={s.btnCancel} onPress={() => setEditDay(null)}>
                  <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.btnConfirm} onPress={saveEdit}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Enregistrer</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── En-tête ── */}
      <View style={s.header}>
        <Text style={s.tag}>SUIVI MENSUEL</Text>
        <Text style={s.headerTitle}>{MONTHS[m - 1]} {y}</Text>
        <Text style={s.headerSub} numberOfLines={1}>{file.name}</Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
          <TouchableOpacity style={s.smallBtn} onPress={importFile}>
            <Text style={s.smallTxt}>📂 Autre fichier</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.smallBtn} onPress={() => setPicker({ mode: 'bulk', onlyEmpty: true })}>
            <Text style={s.smallTxt}>📌 Projet pour tout le mois</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: 140 }}>
        {month.weeks.map((w) => {
          const diff = w.minutes - w.expected;
          return (
            <View key={w.monday} style={{ marginBottom: spacing.md }}>
              {w.rows.map((r) => {
                const wd = weekdayIndex(r.dateStr);
                const timesTxt = r.absent
                  ? '—'
                  : `${minutesToHHmm(r.I)} · ${minutesToHHmm(r.J)}–${minutesToHHmm(r.K)} · ${minutesToHHmm(r.L)}`;
                return (
                  <View key={r.dateStr} style={[s.day, r.warnings.length > 0 && { borderColor: colors.warning + '88' }]}>
                    <View style={s.dayTop}>
                      <Text style={s.dayDate}>{DAY_NAMES[wd]} {shortDate(r.dateStr)}</Text>
                      <TouchableOpacity style={{ flex: 1 }} onPress={() => openEdit(r.dateStr)} disabled={r.absent}>
                        <Text style={[s.dayTimes, r.absent && { color: colors.textMuted }]}>{timesTxt}{!r.absent ? '  ✏️' : ''}</Text>
                      </TouchableOpacity>
                      <Text style={[s.dayHours, { color: r.minutes === 7 * 60 || r.absent ? colors.textPrimary : colors.warning }]}>
                        {formatHours(r.minutes)}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[s.projectChip, !r.project && { borderColor: colors.danger, borderStyle: 'dashed' }]}
                      onPress={() => setPicker({ mode: 'day', dateStr: r.dateStr })}
                    >
                      <Text style={[s.projectTxt, !r.project && { color: colors.danger }]} numberOfLines={1}>
                        {r.project ? r.project.trim() : 'Choisir le projet ▾'}
                      </Text>
                    </TouchableOpacity>
                    {r.warnings.length > 0 && <Text style={s.warn}>⚠️ {r.warnings.join(' · ')}</Text>}
                  </View>
                );
              })}
              <View style={s.weekBar}>
                <Text style={s.weekTxt}>Semaine du {shortDate(w.start)} au {shortDate(w.end)}</Text>
                <Text style={[s.weekTxt, { fontWeight: '800', color: diff === 0 ? colors.success : colors.warning }]}>
                  {formatHours(w.minutes)} / {formatHours(w.expected)} ({diff >= 0 ? '+' : ''}{formatHours(diff)})
                </Text>
              </View>
              {w.warnings.map((x) => <Text key={x} style={s.warn}>⚠️ {x}</Text>)}
            </View>
          );
        })}

        {/* ── Contrôle des formules M du fichier ── */}
        <View style={s.checkBox}>
          <Text style={s.checkTitle}>Colonne M du fichier (non modifiée)</Text>
          {fileTotals.map((t) => {
            const real = month.weeks.find((w) => w.start === t.first && w.end === t.last);
            return (
              <Text key={t.cell} style={[s.checkLine, !real && { color: colors.warning }]}>
                {t.cell} = {formatHours(t.minutes)} (du {shortDate(t.first)} au {shortDate(t.last)}){real ? ' ✓' : ' ⚠️ pas une vraie semaine'}
              </Text>
            );
          })}
          {uncounted.length > 0 && (
            <Text style={[s.checkLine, { color: colors.warning }]}>⚠️ Jours comptés dans aucun total : {uncounted.map(shortDate).join(', ')}</Text>
          )}
        </View>
      </ScrollView>

      {/* ── Barre du bas ── */}
      <View style={s.footer}>
        <View style={{ flex: 1 }}>
          <Text style={s.footerBig}>{formatHours(month.total)} <Text style={s.footerSmall}>/ {formatHours(month.expected)}</Text></Text>
          <Text style={[s.footerSmall, empty > 0 && { color: colors.danger }]}>
            {empty ? `${empty} jour(s) sans projet` : 'Tous les jours ont un projet'}
          </Text>
        </View>
        <TouchableOpacity style={[s.primaryBtn, { marginTop: 0 }, (busy || empty > 0) && { opacity: 0.5 }]} onPress={generate} disabled={busy}>
          {busy ? <ActivityIndicator color={colors.bg} /> : <Text style={s.primaryTxt}>📤 Générer l'Excel</Text>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function makeStyles(c) {
  return StyleSheet.create({
    safe:       { flex: 1, backgroundColor: c.bg },
    center:     { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: c.textPrimary, marginBottom: spacing.sm },
    emptyText:  { fontSize: 13, color: c.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: spacing.lg },
    primaryBtn: { backgroundColor: c.accent, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, borderRadius: radius.md, alignItems: 'center', marginTop: spacing.md },
    primaryTxt: { color: c.bg, fontWeight: '800', fontSize: 14 },

    header:      { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: c.border },
    tag:         { fontSize: 11, fontWeight: '800', letterSpacing: 4, color: c.textMuted, fontFamily: 'Courier New' },
    headerTitle: { fontSize: 22, fontWeight: '800', color: c.textPrimary, textTransform: 'capitalize', marginTop: 2 },
    headerSub:   { fontSize: 11, color: c.textMuted, marginTop: 2 },
    smallBtn:    { borderWidth: 1, borderColor: c.border, borderRadius: radius.md, paddingVertical: 6, paddingHorizontal: spacing.sm, backgroundColor: c.bgCard },
    smallTxt:    { fontSize: 12, color: c.textSecondary, fontWeight: '600' },

    day:         { backgroundColor: c.bgCard, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: spacing.sm, marginBottom: 6 },
    dayTop:      { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    dayDate:     { width: 72, fontSize: 13, fontWeight: '700', color: c.textPrimary },
    dayTimes:    { fontSize: 12, color: c.textSecondary, fontFamily: 'Courier New' },
    dayHours:    { fontSize: 14, fontWeight: '800', fontFamily: 'Courier New' },
    projectChip: { marginTop: 6, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, paddingVertical: 6, paddingHorizontal: spacing.sm, backgroundColor: c.bgInput },
    projectTxt:  { fontSize: 12, color: c.textPrimary },
    warn:        { fontSize: 11, color: c.warning, marginTop: 4 },

    weekBar:     { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.xs, paddingVertical: 6 },
    weekTxt:     { fontSize: 12, color: c.textSecondary },

    checkBox:    { borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: spacing.md, backgroundColor: c.bgCard },
    checkTitle:  { fontSize: 12, fontWeight: '800', color: c.textPrimary, marginBottom: 6 },
    checkLine:   { fontSize: 12, color: c.textSecondary, marginBottom: 3 },

    footer:      { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, backgroundColor: c.bgCard, borderTopWidth: 1, borderTopColor: c.border },
    footerBig:   { fontSize: 20, fontWeight: '800', color: c.textPrimary, fontFamily: 'Courier New' },
    footerSmall: { fontSize: 12, color: c.textSecondary, fontWeight: '500' },

    overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
    modalBox:    { width: '100%', maxWidth: 480, borderRadius: radius.xl, borderWidth: 1, borderColor: c.border, backgroundColor: c.bgCard, padding: spacing.lg, alignItems: 'center' },
    modalTitle:  { fontSize: 17, fontWeight: '800', color: c.textPrimary, marginBottom: spacing.md },
    option:      { borderWidth: 1, borderColor: c.border, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, marginBottom: 6 },
    optionTxt:   { fontSize: 13, color: c.textPrimary },
    formRow:     { flexDirection: 'row', alignItems: 'center', width: '100%', marginBottom: spacing.sm },
    formLabel:   { flex: 1, fontSize: 13, color: c.textSecondary },
    formInput:   { width: 100, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, paddingVertical: 8, textAlign: 'center', fontSize: 18, fontWeight: '700', fontFamily: 'Courier New', color: c.textPrimary, backgroundColor: c.bgInput },
    modalBtns:   { flexDirection: 'row', gap: spacing.sm, width: '100%' },
    btnCancel:   { flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, alignItems: 'center' },
    btnConfirm:  { flex: 2, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: 'center', backgroundColor: c.accent },
  });
}
