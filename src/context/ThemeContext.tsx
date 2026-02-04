import React, { createContext, useContext, useState, ReactNode } from 'react';
import { ThemeName, ThemeColors } from '../models/types';
import { getLightTheme, getDarkTheme, getPrimaryColor } from '../config/themes';

interface ThemeContextType {
  themeName: ThemeName;
  isDarkMode: boolean;
  colors: ThemeColors;
  primaryColor: string;
  setThemeName: (theme: ThemeName) => void;
  toggleDarkMode: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [themeName, setThemeName] = useState<ThemeName>('default');
  const [isDarkMode, setIsDarkMode] = useState(false);

  const colors = isDarkMode ? getDarkTheme(themeName) : getLightTheme(themeName);
  const primaryColor = getPrimaryColor(themeName);

  const toggleDarkMode = () => {
    setIsDarkMode(prev => !prev);
  };

  return (
    <ThemeContext.Provider
      value={{
        themeName,
        isDarkMode,
        colors,
        primaryColor,
        setThemeName,
        toggleDarkMode,
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
