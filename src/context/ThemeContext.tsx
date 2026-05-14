import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeName, ThemeColors } from '../models/types';
import { AppThemes, getLightTheme, getDarkTheme } from '../config/themes';

const STORAGE_KEY_SHOW_KPI = '@whagons/show_kpi_cards';
const STORAGE_KEY_DARK_MODE = '@whagons/dark_mode';
const STORAGE_KEY_THEME_NAME = '@whagons/theme_name';

const isThemeName = (value: string | null): value is ThemeName => (
  value !== null && Object.values(AppThemes).includes(value as ThemeName)
);

interface ThemeContextType {
  themeName: ThemeName;
  isDarkMode: boolean;
  colors: ThemeColors;
  primaryColor: string;
  /** Whether KPI cards strip is visible on the Tasks tab */
  showKpiCards: boolean;
  setThemeName: (theme: ThemeName) => void;
  toggleDarkMode: () => void;
  setShowKpiCards: (show: boolean) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const systemColorScheme = useColorScheme();
  const [themeName, setThemeName] = useState<ThemeName>('default');
  const [darkModeOverride, setDarkModeOverride] = useState<boolean | null>(null);
  const [showKpiCards, setShowKpiCardsState] = useState(true);

  // Follow system color scheme by default; allow manual override
  const isDarkMode = darkModeOverride !== null ? darkModeOverride : systemColorScheme === 'dark';

  const colors = isDarkMode ? getDarkTheme(themeName) : getLightTheme(themeName);
  const primaryColor = colors.primary;

  // Load persisted preferences on mount
  useEffect(() => {
    AsyncStorage.multiGet([STORAGE_KEY_SHOW_KPI, STORAGE_KEY_DARK_MODE, STORAGE_KEY_THEME_NAME]).then((entries) => {
      const kpiVal = entries[0][1];
      const darkVal = entries[1][1];
      const themeVal = entries[2][1];
      if (kpiVal !== null) setShowKpiCardsState(kpiVal === 'true');
      if (darkVal !== null) setDarkModeOverride(darkVal === 'true');
      if (isThemeName(themeVal)) setThemeName(themeVal);
    }).catch(() => {});
  }, []);

  const setSelectedThemeName = (theme: ThemeName) => {
    setThemeName(theme);
    AsyncStorage.setItem(STORAGE_KEY_THEME_NAME, theme).catch(() => {});
  };

  const toggleDarkMode = () => {
    const next = !isDarkMode;
    setDarkModeOverride(next);
    AsyncStorage.setItem(STORAGE_KEY_DARK_MODE, String(next)).catch(() => {});
  };

  const setShowKpiCards = (show: boolean) => {
    setShowKpiCardsState(show);
    AsyncStorage.setItem(STORAGE_KEY_SHOW_KPI, String(show)).catch(() => {});
  };

  return (
    <ThemeContext.Provider
      value={{
        themeName,
        isDarkMode,
        colors,
        primaryColor,
        showKpiCards,
        setThemeName: setSelectedThemeName,
        toggleDarkMode,
        setShowKpiCards,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
