import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeName, ThemeColors } from '../models/types';
import { getLightTheme, getDarkTheme, getPrimaryColor } from '../config/themes';

const STORAGE_KEY_SHOW_KPI = '@whagons/show_kpi_cards';

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
  const [themeName, setThemeName] = useState<ThemeName>('default');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [showKpiCards, setShowKpiCardsState] = useState(true);

  const colors = isDarkMode ? getDarkTheme(themeName) : getLightTheme(themeName);
  const primaryColor = getPrimaryColor(themeName);

  // Load persisted KPI preference on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY_SHOW_KPI).then((val) => {
      if (val !== null) setShowKpiCardsState(val === 'true');
    }).catch(() => {});
  }, []);

  const toggleDarkMode = () => {
    setIsDarkMode(prev => !prev);
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
