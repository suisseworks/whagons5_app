import 'package:flutter/material.dart';
import '../config/app_themes.dart';

class ThemesScreen extends StatelessWidget {
  final String currentTheme;
  final bool isDarkMode;
  final Function(String) onThemeSelected;

  const ThemesScreen({
    super.key,
    required this.currentTheme,
    required this.isDarkMode,
    required this.onThemeSelected,
  });

  @override
  Widget build(BuildContext context) {
    final backgroundColor = isDarkMode
        ? AppThemes.getDarkTheme(currentTheme).scaffoldBackgroundColor
        : AppThemes.getLightTheme(currentTheme).scaffoldBackgroundColor;

    final themes = [
      {
        'id': AppThemes.defaultTheme,
        'name': 'Default',
        'description': 'Classic teal theme',
        'icon': Icons.palette,
      },
      {
        'id': AppThemes.oceanTheme,
        'name': 'Ocean',
        'description': 'Cool blue waves',
        'icon': Icons.water,
      },
      {
        'id': AppThemes.sunsetTheme,
        'name': 'Sunset',
        'description': 'Warm orange and purple',
        'icon': Icons.wb_twilight,
      },
      {
        'id': AppThemes.forestTheme,
        'name': 'Forest',
        'description': 'Natural green tones',
        'icon': Icons.forest,
      },
    ];

    return Scaffold(
      backgroundColor: backgroundColor,
      appBar: AppBar(
        backgroundColor: backgroundColor,
        elevation: 0,
        leading: IconButton(
          icon: Icon(Icons.arrow_back, color: isDarkMode ? Colors.white : Colors.black87),
          onPressed: () => Navigator.pop(context),
        ),
        title: Text(
          'Choose Theme',
          style: TextStyle(
            color: isDarkMode ? Colors.white : Colors.black87,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      body: GridView.builder(
        padding: const EdgeInsets.all(16),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2,
          crossAxisSpacing: 16,
          mainAxisSpacing: 16,
          childAspectRatio: 0.85,
        ),
        itemCount: themes.length,
        itemBuilder: (context, index) {
          final theme = themes[index];
          final themeId = theme['id'] as String;
          final isSelected = themeId == currentTheme;
          final primaryColor = AppThemes.getPrimaryColor(themeId, isDarkMode);
          final themeBackgroundColor = isDarkMode
              ? AppThemes.getDarkTheme(themeId).scaffoldBackgroundColor
              : AppThemes.getLightTheme(themeId).scaffoldBackgroundColor;

          return GestureDetector(
            onTap: () => onThemeSelected(themeId),
            child: Container(
              decoration: BoxDecoration(
                color: themeBackgroundColor,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: isSelected ? primaryColor : Colors.grey.shade300,
                  width: isSelected ? 3 : 1,
                ),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.1),
                    blurRadius: 8,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  if (isSelected)
                    Align(
                      alignment: Alignment.topRight,
                      child: Padding(
                        padding: const EdgeInsets.all(8),
                        child: Icon(
                          Icons.check_circle,
                          color: primaryColor,
                          size: 24,
                        ),
                      ),
                    )
                  else
                    const SizedBox(height: 40),
                  Container(
                    width: 80,
                    height: 80,
                    decoration: BoxDecoration(
                      color: primaryColor,
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Icon(
                      theme['icon'] as IconData,
                      color: Colors.white,
                      size: 40,
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    theme['name'] as String,
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                      color: isDarkMode ? Colors.white : Colors.black87,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                    child: Text(
                      theme['description'] as String,
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 12,
                        color: isDarkMode ? Colors.white70 : Colors.black54,
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Container(
                        width: 20,
                        height: 20,
                        decoration: BoxDecoration(
                          color: primaryColor,
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 6),
                      Container(
                        width: 20,
                        height: 20,
                        decoration: BoxDecoration(
                          color: AppThemes.getLightTheme(themeId).colorScheme.secondary,
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 6),
                      Container(
                        width: 20,
                        height: 20,
                        decoration: BoxDecoration(
                          color: isDarkMode
                              ? AppThemes.getDarkTheme(themeId).colorScheme.surface
                              : AppThemes.getLightTheme(themeId).colorScheme.surface,
                          shape: BoxShape.circle,
                          border: Border.all(color: Colors.grey.shade400),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}
