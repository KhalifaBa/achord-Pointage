// src/utils/ThemeContext.js
// Contexte React pour le thème global — persisté dans AsyncStorage

import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { themes } from './theme';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [themeKey, setThemeKey] = useState('dark');

  // Charge le thème sauvegardé au démarrage
  useEffect(() => {
    AsyncStorage.getItem('app_theme').then((saved) => {
      if (saved && themes[saved]) setThemeKey(saved);
    });
  }, []);

  const setTheme = async (key) => {
    if (!themes[key]) return;
    setThemeKey(key);
    await AsyncStorage.setItem('app_theme', key);
  };

  const colors = themes[themeKey];

  return (
    <ThemeContext.Provider value={{ colors, themeKey, setTheme, themes }}>
      {children}
    </ThemeContext.Provider>
  );
}

// Hook pratique : const { colors } = useTheme();
export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme doit être utilisé dans <ThemeProvider>');
  return ctx;
}
