// src/components/SummaryBar.js
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../utils/ThemeContext';
import { spacing } from '../utils/theme';
import { formatDuration, computeSummary } from '../utils/storage';

export default function SummaryBar({ timings }) {
  const { colors } = useTheme();
  const summary = computeSummary(timings);
  return (
    <View style={[styles.container, { backgroundColor: colors.bgCard, borderTopColor: colors.border }]}>
      <Stat label="Travail effectif" value={formatDuration(summary.effectiveWork)} color={colors.success} primary />
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      <Stat label="Pauses totales"   value={formatDuration(summary.totalPauses)}   color={colors.warning} />
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      <Stat label="Présence"         value={formatDuration(summary.totalPresence)}  color={colors.accent} />
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

const styles = StyleSheet.create({
  container:   { flexDirection: 'row', borderTopWidth: 1, paddingVertical: spacing.md, paddingHorizontal: spacing.md },
  stat:        { flex: 1, alignItems: 'center' },
  statPrimary: { flex: 1.2 },
  value:       { fontSize: 18, fontWeight: '800', fontFamily: 'Courier New', letterSpacing: 0.5 },
  label:       { fontSize: 10, color: '#888', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' },
  divider:     { width: 1, marginVertical: 2 },
});
