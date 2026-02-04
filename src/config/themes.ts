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
        primary: '#14B7A3',
        secondary: '#0FB292',
        background: '#F6F2E8',
        surface: '#FFFFFF',
        text: '#000000DE',
        textSecondary: '#00000099',
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
        primary: '#14B7A3',
        secondary: '#0FB292',
        background: '#1A1F1E',
        surface: '#2C3432',
        text: '#FFFFFF',
        textSecondary: '#FFFFFFB3',
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
      return '#14B7A3';
  }
};

// Theme metadata for theme selector
export const themeMetadata = [
  {
    id: 'default' as ThemeName,
    name: 'Default',
    description: 'Classic teal theme',
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
