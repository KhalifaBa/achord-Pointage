// src/screens/HistoryScreen.js
import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { loadAllHistory, formatDateFr, formatTime, formatDuration, computeSummary } from '../utils/storage';
import { useTheme } from '../utils/ThemeContext';
import { spacing, radius } from '../utils/theme';

export default function HistoryScreen() {
  const { colors } = useTheme();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  useFocusEffect(useCallback(() => {
    loadAllHistory().then((data) => { setHistory(data); setLoading(false); });
  }, []));

  if (loading) return <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator color={colors.accent} /></View>;

  if (history.length === 0) return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl }}>
        <Text style={{ fontSize: 48, marginBottom: spacing.md }}>📋</Text>
        <Text style={{ fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.sm }}>Aucun historique</Text>
        <Text style={{ fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 20 }}>Vos pointages des 30 derniers jours apparaîtront ici.</Text>
      </View>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.tag, { color: colors.textMuted }]}>HISTORIQUE</Text>
        <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>{history.length} jour(s) enregistré(s)</Text>
      </View>
      <FlatList
        data={history}
        keyExtractor={(item) => item.dateStr}
        contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}
        renderItem={({ item }) => (
          <DayCard item={item} expanded={expanded === item.dateStr} onToggle={() => setExpanded(expanded === item.dateStr ? null : item.dateStr)} colors={colors} />
        )}
      />
    </SafeAreaView>
  );
}

function DayCard({ item, expanded, onToggle, colors }) {
  const { dateStr, timings } = item;
  const summary    = computeSummary(timings);
  const isComplete = !!timings.arrival && !!timings.departure;
  return (
    <TouchableOpacity style={[styles.card, { backgroundColor: colors.bgCard, borderColor: expanded ? colors.accent + '44' : colors.border }]} onPress={onToggle} activeOpacity={0.8}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: spacing.sm }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: isComplete ? colors.success : colors.warning }} />
          <Text style={{ fontSize: 13, color: colors.textPrimary, fontWeight: '500', flex: 1 }}>{formatDateFr(dateStr)}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: colors.success, fontFamily: 'Courier New' }}>{formatDuration(summary.effectiveWork)}</Text>
          <Text style={{ fontSize: 10, color: colors.textMuted }}>{expanded ? '▲' : '▼'}</Text>
        </View>
      </View>
      {expanded && (
        <View style={[styles.detail, { borderTopColor: colors.border }]}>
          <DR label="Arrivée"  value={formatTime(timings.arrival)}   color={colors.arrival}   colors={colors} />
          {timings.coffeeMornStart && <DR label="Café matin" value={`${formatTime(timings.coffeeMornStart)} → ${formatTime(timings.coffeeMornEnd)} (${formatDuration(summary.coffeeMorn)})`} color={colors.coffeeMorn} colors={colors} />}
          {timings.lunchStart      && <DR label="Déjeuner"   value={`${formatTime(timings.lunchStart)} → ${formatTime(timings.lunchEnd)} (${formatDuration(summary.lunch)})`}               color={colors.lunch}      colors={colors} />}
          {timings.coffeeAftnStart && <DR label="Café AM"    value={`${formatTime(timings.coffeeAftnStart)} → ${formatTime(timings.coffeeAftnEnd)} (${formatDuration(summary.coffeeAftn)})`} color={colors.coffeeAftn} colors={colors} />}
          <DR label="Départ"   value={formatTime(timings.departure)}  color={colors.departure} colors={colors} />
          <View style={{ height: 1, backgroundColor: colors.border, marginVertical: spacing.sm }} />
          <DR label="Travail effectif" value={formatDuration(summary.effectiveWork)} color={colors.success} colors={colors} bold />
          <DR label="Pauses totales"   value={formatDuration(summary.totalPauses)}   color={colors.warning} colors={colors} />
        </View>
      )}
    </TouchableOpacity>
  );
}

function DR({ label, value, color, colors, bold }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
      <Text style={{ fontSize: 13, color: colors.textSecondary }}>{label}</Text>
      <Text style={{ fontSize: bold ? 15 : 13, fontWeight: bold ? '800' : '600', color, fontFamily: 'Courier New' }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md, borderBottomWidth: 1 },
  tag:    { fontSize: 11, fontWeight: '800', letterSpacing: 4, fontFamily: 'Courier New' },
  card:   { borderRadius: radius.md, borderWidth: 1, padding: spacing.md },
  detail: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1 },
});
