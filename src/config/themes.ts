import { ThemeName, ThemeColors } from '../models/types';

// Theme configurations inspired by the web app presets, simplified for React Native.
export const AppThemes = {
  default: 'default' as ThemeName,
  ocean: 'ocean' as ThemeName,
  sunset: 'sunset' as ThemeName,
  forest: 'forest' as ThemeName,
};

export const getLightTheme = (themeName: ThemeName): ThemeColors => {
  switch (themeName) {
    case 'ocean':
      return {
        primary: '#2563EB',
        secondary: '#F97316',
        background: '#F8FAFF',
        surface: '#FFFFFF',
        text: '#0F172A',
        textSecondary: '#64748B',
      };
    case 'sunset':
      return {
        primary: '#DC2626',
        secondary: '#F97316',
        background: '#FEF7F7',
        surface: '#FFFFFF',
        text: '#1C0A0A',
        textSecondary: '#7F1D1D',
      };
    case 'forest':
      return {
        primary: '#059669',
        secondary: '#047857',
        background: '#F7FDF9',
        surface: '#FFFFFF',
        text: '#0F2419',
        textSecondary: '#3F5F4E',
      };
    default: // default theme
      return {
        primary: '#1A56DB',
        secondary: '#2F6F6D',
        background: '#FAFAFA',
        surface: '#FFFFFF',
        text: '#111827',
        textSecondary: '#6B7280',
      };
  }
};

export const getDarkTheme = (themeName: ThemeName): ThemeColors => {
  switch (themeName) {
    case 'ocean':
      return {
        primary: '#60A5FA',
        secondary: '#FB923C',
        background: '#0C1524',
        surface: '#132033',
        text: '#F1F5F9',
        textSecondary: '#CBD5E1',
      };
    case 'sunset':
      return {
        primary: '#F87171',
        secondary: '#FB923C',
        background: '#1A0A0A',
        surface: '#2C1414',
        text: '#FEF2F2',
        textSecondary: '#FECACA',
      };
    case 'forest':
      return {
        primary: '#34D399',
        secondary: '#10B981',
        background: '#0A1F14',
        surface: '#1A2E24',
        text: '#ECFDF5',
        textSecondary: '#A7F3D0',
      };
    default: // default theme
      return {
        primary: '#5B8DEF',
        secondary: '#3F8F8C',
        background: '#1A1A1A',
        surface: '#242424',
        text: '#F5F5F5',
        textSecondary: '#9CA3AF',
      };
  }
};

export const getPrimaryColor = (themeName: ThemeName): string => {
  switch (themeName) {
    case 'ocean':
      return '#2563EB';
    case 'sunset':
      return '#DC2626';
    case 'forest':
      return '#059669';
    default:
      return '#1A56DB';
  }
};

// Theme metadata for theme selector
export const themeMetadata = [
  {
    id: 'default' as ThemeName,
    name: 'Default',
    description: 'Clean modern blue',
    icon: 'palette',
  },
  {
    id: 'ocean' as ThemeName,
    name: 'Ocean Breeze',
    description: 'Blue with coral highlights',
    icon: 'water',
  },
  {
    id: 'sunset' as ThemeName,
    name: 'Sunset Blaze',
    description: 'Warm red and orange',
    icon: 'weather-sunset',
  },
  {
    id: 'forest' as ThemeName,
    name: 'Emerald Forest',
    description: 'Rich green surfaces',
    icon: 'tree',
  },
];
