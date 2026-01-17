import 'package:flutter/material.dart';

/// Theme configurations for the application
class AppThemes {
  static const String defaultTheme = 'default';
  static const String oceanTheme = 'ocean';
  static const String sunsetTheme = 'sunset';
  static const String forestTheme = 'forest';

  static ThemeData getLightTheme(String themeName) {
    switch (themeName) {
      case oceanTheme:
        return ThemeData(
          brightness: Brightness.light,
          primaryColor: const Color(0xFF2196F3),
          scaffoldBackgroundColor: const Color(0xFFE3F2FD),
          colorScheme: ColorScheme.light(
            primary: const Color(0xFF2196F3),
            secondary: const Color(0xFF03A9F4),
            surface: Colors.white,
          ),
        );
      case sunsetTheme:
        return ThemeData(
          brightness: Brightness.light,
          primaryColor: const Color(0xFFFF6B35),
          scaffoldBackgroundColor: const Color(0xFFFFF3E0),
          colorScheme: ColorScheme.light(
            primary: const Color(0xFFFF6B35),
            secondary: const Color(0xFF9C27B0),
            surface: Colors.white,
          ),
        );
      case forestTheme:
        return ThemeData(
          brightness: Brightness.light,
          primaryColor: const Color(0xFF4CAF50),
          scaffoldBackgroundColor: const Color(0xFFE8F5E9),
          colorScheme: ColorScheme.light(
            primary: const Color(0xFF4CAF50),
            secondary: const Color(0xFF8D6E63),
            surface: Colors.white,
          ),
        );
      default: // defaultTheme
        return ThemeData(
          brightness: Brightness.light,
          primaryColor: const Color(0xFF14B7A3),
          scaffoldBackgroundColor: const Color(0xFFF6F2E8),
          colorScheme: ColorScheme.light(
            primary: const Color(0xFF14B7A3),
            secondary: const Color(0xFF0FB292),
            surface: Colors.white,
          ),
        );
    }
  }

  static ThemeData getDarkTheme(String themeName) {
    switch (themeName) {
      case oceanTheme:
        return ThemeData(
          brightness: Brightness.dark,
          primaryColor: const Color(0xFF2196F3),
          scaffoldBackgroundColor: const Color(0xFF0D1B2A),
          colorScheme: ColorScheme.dark(
            primary: const Color(0xFF2196F3),
            secondary: const Color(0xFF03A9F4),
            surface: const Color(0xFF1B263B),
          ),
        );
      case sunsetTheme:
        return ThemeData(
          brightness: Brightness.dark,
          primaryColor: const Color(0xFFFF6B35),
          scaffoldBackgroundColor: const Color(0xFF1A1423),
          colorScheme: ColorScheme.dark(
            primary: const Color(0xFFFF6B35),
            secondary: const Color(0xFF9C27B0),
            surface: const Color(0xFF2D1B3D),
          ),
        );
      case forestTheme:
        return ThemeData(
          brightness: Brightness.dark,
          primaryColor: const Color(0xFF4CAF50),
          scaffoldBackgroundColor: const Color(0xFF1B2A1B),
          colorScheme: ColorScheme.dark(
            primary: const Color(0xFF4CAF50),
            secondary: const Color(0xFF8D6E63),
            surface: const Color(0xFF2C3E2C),
          ),
        );
      default: // defaultTheme
        return ThemeData(
          brightness: Brightness.dark,
          primaryColor: const Color(0xFF14B7A3),
          scaffoldBackgroundColor: const Color(0xFF1A1F1E),
          colorScheme: ColorScheme.dark(
            primary: const Color(0xFF14B7A3),
            secondary: const Color(0xFF0FB292),
            surface: const Color(0xFF2C3432),
          ),
        );
    }
  }

  static Color getPrimaryColor(String themeName, bool isDark) {
    switch (themeName) {
      case oceanTheme:
        return const Color(0xFF2196F3);
      case sunsetTheme:
        return const Color(0xFFFF6B35);
      case forestTheme:
        return const Color(0xFF4CAF50);
      default:
        return const Color(0xFF14B7A3);
    }
  }
}
