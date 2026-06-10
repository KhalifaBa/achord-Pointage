// src/components/SummaryBar.js
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../utils/ThemeContext';
import { spacing } from '../utils/theme';
import { formatDuration, computeSummary, computeDelta, SCREEN_BREAK_MINUTES } from '../utils/storage';

export default function SummaryBar({ timings, dateStr, settings }) {
  const { colors } = useTheme();
  const summary = computeSummary(timings, settings);

  // Calcul avance / retard arrivée
  const arrivalDelta = computeDelta(timings.arrival, settings?.expectedArrival, dateStr, 'arrival');
  // Calcul avance / retard départ
  const departureDelta = computeDelta(timings.departure, settings?.expectedDeparture, dateStr, 'departure');

  const deltaLabel = (delta, mode) => {
    if (delta === null) return null;
    const abs = formatDuration(Math.abs(delta));
    if (delta > 0) return { text: `+${abs}`, color: colors.success };
    if (delta < 0) return { text: `-${abs}`, color: colors.danger || '#e74c3c' };
    return { text: '0min', color: colors.textMuted };
  };

  const arrInfo  = deltaLabel(arrivalDelta, 'arrival');
  const deptInfo = deltaLabel(departureDelta, 'departure');

  return (
    <View>
      {/* Ligne avance / retard */}
      {(arrInfo || deptInfo) && (
        <View style={[styles.deltaRow, { backgroundColor: colors.bgInput || colors.bgCard, borderTopColor: colors.border }]}>
          {arrInfo && (
            <DeltaBadge
              label={`Arrivée ${arrivalDelta > 0 ? '▲ avance' : arrivalDelta < 0 ? '▼ retard' : '●'}`}
              value={arrInfo.text}
              color={arrInfo.color}
              colors={colors}
            />
          )}
          {deptInfo && (
            <DeltaBadge
              label={`Départ ${departureDelta > 0 ? '▲ tardif' : departureDelta < 0 ? '▼ anticipé' : '●'}`}
              value={deptInfo.text}
              color={deptInfo.color}
              colors={colors}
            />
          )}
        </View>
      )}

      {/* Barre principale */}
      <View style={[styles.container, { backgroundColor: colors.bgCard, borderTopColor: colors.border }]}>
        <Stat label="Travail net" value={formatDuration(summary.effectiveWork)} color={colors.success} primary />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Stat label="Pauses totales" value={formatDuration(summary.totalPauses)} color={colors.warning} />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Stat label="Présence" value={formatDuration(summary.totalPresence)} color={colors.accent} />
      </View>

      {/* Note légale discrète */}
      <View style={[styles.legalNote, { backgroundColor: colors.bg, borderTopColor: colors.border }]}>
        <Text style={[styles.legalText, { color: colors.textMuted }]}>
          ⚖️ {SCREEN_BREAK_MINUTES}min pause écran déduite automatiquement (légal)
        </Text>
      </View>
    </View>
  );
}

function Stat({ label, value, color, primary }) {
  return (
    <View style={[styles.stat, primary && styles.statPrimary]}>
      <Text style={[styles.value, { color }]}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

function DeltaBadge({ label, value, color, colors }) {
  return (
    <View style={styles.deltaBadge}>
      <Text style={[styles.deltaValue, { color }]}>{value}</Text>
      <Text style={[styles.deltaLabel, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container:   { flexDirection: 'row', borderTopWidth: 1, paddingVertical: spacing.md, paddingHorizontal: spacing.md },
  stat:        { flex: 1, alignItems: 'center' },
  statPrimary: { flex: 1.2 },
  value:       { fontSize: 18, fontWeight: '800', fontFamily: 'Courier New', letterSpacing: 0.5 },
  label:       { fontSize: 10, color: '#888', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' },
  divider:     { width: 1, marginVertical: 2 },
  deltaRow:    { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderTopWidth: 1 },
  deltaBadge:  { alignItems: 'center' },
  deltaValue:  { fontSize: 14, fontWeight: '800', fontFamily: 'Courier New' },
  deltaLabel:  { fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 1 },
  legalNote:   { paddingVertical: 4, paddingHorizontal: spacing.md, borderTopWidth: 1 },
  legalText:   { fontSize: 9, textAlign: 'center', letterSpacing: 0.3 },
});
