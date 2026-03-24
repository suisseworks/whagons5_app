import { ThemeName, ThemeColors } from '../models/types';

// Theme configurations matching Flutter app
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
        primary: '#2196F3',
        secondary: '#03A9F4',
        background: '#E3F2FD',
        surface: '#FFFFFF',
        text: '#000000DE',
        textSecondary: '#00000099',
      };
    case 'sunset':
      return {
        primary: '#FF6B35',
        secondary: '#9C27B0',
        background: '#FFF3E0',
        surface: '#FFFFFF',
        text: '#000000DE',
        textSecondary: '#00000099',
      };
    case 'forest':
      return {
        primary: '#4CAF50',
        secondary: '#8D6E63',
        background: '#E8F5E9',
        surface: '#FFFFFF',
        text: '#000000DE',
        textSecondary: '#00000099',
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
        primary: '#2196F3',
        secondary: '#03A9F4',
        background: '#0D1B2A',
        surface: '#1B263B',
        text: '#FFFFFF',
        textSecondary: '#FFFFFFB3',
      };
    case 'sunset':
      return {
        primary: '#FF6B35',
        secondary: '#9C27B0',
        background: '#1A1423',
        surface: '#2D1B3D',
        text: '#FFFFFF',
        textSecondary: '#FFFFFFB3',
      };
    case 'forest':
      return {
        primary: '#4CAF50',
        secondary: '#8D6E63',
        background: '#1B2A1B',
        surface: '#2C3E2C',
        text: '#FFFFFF',
        textSecondary: '#FFFFFFB3',
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
      return '#2196F3';
    case 'sunset':
      return '#FF6B35';
    case 'forest':
      return '#4CAF50';
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
    name: 'Ocean',
    description: 'Cool blue waves',
    icon: 'water',
  },
  {
    id: 'sunset' as ThemeName,
    name: 'Sunset',
    description: 'Warm orange and purple',
    icon: 'weather-sunset',
  },
  {
    id: 'forest' as ThemeName,
    name: 'Forest',
    description: 'Natural green tones',
    icon: 'tree',
  },
];
