// App.js
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from './src/utils/ThemeContext';
import HomeScreen     from './src/screens/HomeScreen';
import HistoryScreen  from './src/screens/HistoryScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import { spacing } from './src/utils/theme';

const Tab = createBottomTabNavigator();
const icons = { Home: '⏱', History: '📋', Settings: '⚙️' };

function AppNavigator() {
  const { colors, themeKey } = useTheme();
  const isDark = ['dark', 'navy', 'warm'].includes(themeKey);
  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={colors.bg} />
      <NavigationContainer>
        <Tab.Navigator
          screenOptions={({ route }) => ({
            headerStyle: { backgroundColor: colors.bg, borderBottomWidth: 1, borderBottomColor: colors.border, elevation: 0, shadowOpacity: 0 },
            headerTintColor: colors.textPrimary,
            headerTitleStyle: { fontWeight: '700', letterSpacing: 0.5 },
            tabBarStyle: { backgroundColor: colors.bgCard, borderTopWidth: 1, borderTopColor: colors.border, paddingBottom: spacing.xs, height: 60 },
            tabBarActiveTintColor:   colors.accent,
            tabBarInactiveTintColor: colors.textMuted,
            tabBarLabelStyle: { fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },
            tabBarIcon: ({ focused }) => (
              <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>{icons[route.name]}</Text>
            ),
          })}
        >
          <Tab.Screen name="Home"     component={HomeScreen}     options={{ title: 'Pointage',  headerShown: false }} />
          <Tab.Screen name="History"  component={HistoryScreen}  options={{ title: 'Historique', headerTitle: 'Historique' }} />
          <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: 'Paramètres', headerTitle: 'Paramètres' }} />
        </Tab.Navigator>
      </NavigationContainer>
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppNavigator />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
