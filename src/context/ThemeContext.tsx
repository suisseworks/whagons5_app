import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeName, ThemeColors } from '../models/types';
import { getLightTheme, getDarkTheme, getPrimaryColor } from '../config/themes';

const STORAGE_KEY_SHOW_KPI = '@whagons/show_kpi_cards';
const STORAGE_KEY_DARK_MODE = '@whagons/dark_mode';

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
  const primaryColor = getPrimaryColor(themeName);

  // Load persisted preferences on mount
  useEffect(() => {
    AsyncStorage.multiGet([STORAGE_KEY_SHOW_KPI, STORAGE_KEY_DARK_MODE]).then((entries) => {
      const kpiVal = entries[0][1];
      const darkVal = entries[1][1];
      if (kpiVal !== null) setShowKpiCardsState(kpiVal === 'true');
      if (darkVal !== null) setDarkModeOverride(darkVal === 'true');
    }).catch(() => {});
  }, []);

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
        setThemeName,
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
