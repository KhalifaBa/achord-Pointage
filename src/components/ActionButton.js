// src/components/ActionButton.js
import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../utils/ThemeContext';
import { radius, spacing } from '../utils/theme';
import { formatTime } from '../utils/storage';

export default function ActionButton({ label, emoji, color, timestamp, disabled, onPress, isLast = false }) {
  const { colors } = useTheme();
  const done     = !!timestamp;
  const inactive = disabled && !done;

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.container,
        { borderColor: done ? color : inactive ? colors.border : color + '55', backgroundColor: colors.bgCard },
        done && { backgroundColor: color + '15' },
        isLast && styles.lastButton,
      ]}
    >
      <View style={styles.row}>
        <View style={[styles.dot, { backgroundColor: done ? color : inactive ? colors.textMuted : color + '55' }]} />
        <View style={styles.labelWrap}>
          <Text style={styles.emoji}>{emoji}</Text>
          <Text style={[
            styles.label,
            { color: done ? colors.textPrimary : inactive ? colors.textMuted : colors.textSecondary },
            isLast && { color: done ? colors.textPrimary : color },
          ]}>
            {label}
          </Text>
        </View>
        <Text style={[styles.time, { color: done ? color : colors.textMuted }]}>
          {done ? formatTime(timestamp) : '--:--'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container:   { borderWidth: 1, borderRadius: radius.md, paddingVertical: spacing.md, paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  lastButton:  { marginTop: spacing.sm, paddingVertical: spacing.lg, borderWidth: 1.5 },
  row:         { flexDirection: 'row', alignItems: 'center' },
  dot:         { width: 8, height: 8, borderRadius: 4, marginRight: spacing.md },
  labelWrap:   { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  emoji:       { fontSize: 18 },
  label:       { fontSize: 15, fontWeight: '500', letterSpacing: 0.2 },
  time:        { fontSize: 17, fontWeight: '700', fontFamily: 'Courier New', letterSpacing: 1 },
});
