// src/components/LiveClock.js
import React, { useState, useEffect } from 'react';
import { View, Text } from 'react-native';
import { useTheme } from '../utils/ThemeContext';
import { spacing } from '../utils/theme';
import { formatDateFr } from '../utils/storage';
import { format } from 'date-fns';

export default function LiveClock({ dateStr }) {
  const { colors } = useTheme();
  const [time, setTime] = useState('');
  useEffect(() => {
    const tick = () => setTime(format(new Date(), 'HH:mm:ss'));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <View style={{ alignItems: 'center', paddingVertical: spacing.md }}>
      <Text style={{ fontSize: 42, fontWeight: '200', fontFamily: 'Courier New', color: colors.accent, letterSpacing: 3 }}>{time}</Text>
      <Text style={{ fontSize: 12, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 2, marginTop: 2 }}>
        {dateStr ? formatDateFr(dateStr) : ''}
      </Text>
    </View>
  );
}
