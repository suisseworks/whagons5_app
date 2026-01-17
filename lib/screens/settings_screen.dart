import 'package:flutter/material.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  bool _notificationsEnabled = true;
  bool _emailNotifications = false;
  bool _pushNotifications = true;
  bool _soundEnabled = true;
  bool _vibrationEnabled = true;
  bool _darkModeEnabled = false;
  String _selectedLanguage = 'English';
  bool _biometricEnabled = false;
  bool _autoBackup = true;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF6F2E8),
      appBar: AppBar(
        backgroundColor: const Color(0xFFF6F2E8),
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.black87),
          onPressed: () => Navigator.pop(context),
        ),
        title: const Text(
          'Settings',
          style: TextStyle(color: Colors.black87, fontWeight: FontWeight.w600),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Account Section
          _buildSectionHeader('Account'),
          _buildCard(
            children: [
              _buildProfileTile(),
              const Divider(height: 1),
              _buildListTile(
                icon: Icons.email_outlined,
                title: 'Email',
                subtitle: 'user@whagons.com',
                onTap: () => _showComingSoon('Email settings'),
              ),
              const Divider(height: 1),
              _buildListTile(
                icon: Icons.phone_outlined,
                title: 'Phone',
                subtitle: '+1 (555) 123-4567',
                onTap: () => _showComingSoon('Phone settings'),
              ),
            ],
          ),
          const SizedBox(height: 20),

          // Notifications Section
          _buildSectionHeader('Notifications'),
          _buildCard(
            children: [
              _buildSwitchTile(
                icon: Icons.notifications_outlined,
                title: 'Enable Notifications',
                subtitle: 'Receive all notifications',
                value: _notificationsEnabled,
                onChanged: (value) => setState(() => _notificationsEnabled = value),
              ),
              const Divider(height: 1),
              _buildSwitchTile(
                icon: Icons.notifications_active_outlined,
                title: 'Push Notifications',
                subtitle: 'Alert on new tasks',
                value: _pushNotifications,
                onChanged: (value) => setState(() => _pushNotifications = value),
                enabled: _notificationsEnabled,
              ),
              const Divider(height: 1),
              _buildSwitchTile(
                icon: Icons.email_outlined,
                title: 'Email Notifications',
                subtitle: 'Daily task summary',
                value: _emailNotifications,
                onChanged: (value) => setState(() => _emailNotifications = value),
                enabled: _notificationsEnabled,
              ),
              const Divider(height: 1),
              _buildSwitchTile(
                icon: Icons.volume_up_outlined,
                title: 'Sound',
                subtitle: 'Notification sounds',
                value: _soundEnabled,
                onChanged: (value) => setState(() => _soundEnabled = value),
                enabled: _notificationsEnabled,
              ),
              const Divider(height: 1),
              _buildSwitchTile(
                icon: Icons.vibration_outlined,
                title: 'Vibration',
                subtitle: 'Vibrate on notifications',
                value: _vibrationEnabled,
                onChanged: (value) => setState(() => _vibrationEnabled = value),
                enabled: _notificationsEnabled,
              ),
            ],
          ),
          const SizedBox(height: 20),

          // Appearance Section
          _buildSectionHeader('Appearance'),
          _buildCard(
            children: [
              _buildSwitchTile(
                icon: Icons.dark_mode_outlined,
                title: 'Dark Mode',
                subtitle: 'Use dark theme',
                value: _darkModeEnabled,
                onChanged: (value) => setState(() => _darkModeEnabled = value),
              ),
              const Divider(height: 1),
              _buildListTile(
                icon: Icons.palette_outlined,
                title: 'Theme',
                subtitle: 'Customize app colors',
                trailing: const Icon(Icons.chevron_right, size: 20),
                onTap: () => _showComingSoon('Theme customization'),
              ),
              const Divider(height: 1),
              _buildListTile(
                icon: Icons.language_outlined,
                title: 'Language',
                subtitle: _selectedLanguage,
                trailing: const Icon(Icons.chevron_right, size: 20),
                onTap: () => _showLanguageDialog(),
              ),
            ],
          ),
          const SizedBox(height: 20),

          // Privacy & Security Section
          _buildSectionHeader('Privacy & Security'),
          _buildCard(
            children: [
              _buildSwitchTile(
                icon: Icons.fingerprint_outlined,
                title: 'Biometric Login',
                subtitle: 'Use fingerprint/face ID',
                value: _biometricEnabled,
                onChanged: (value) => setState(() => _biometricEnabled = value),
              ),
              const Divider(height: 1),
              _buildListTile(
                icon: Icons.lock_outline,
                title: 'Change Password',
                subtitle: 'Update your password',
                trailing: const Icon(Icons.chevron_right, size: 20),
                onTap: () => _showComingSoon('Password change'),
              ),
              const Divider(height: 1),
              _buildListTile(
                icon: Icons.shield_outlined,
                title: 'Privacy Policy',
                trailing: const Icon(Icons.chevron_right, size: 20),
                onTap: () => _showComingSoon('Privacy policy'),
              ),
              const Divider(height: 1),
              _buildListTile(
                icon: Icons.description_outlined,
                title: 'Terms of Service',
                trailing: const Icon(Icons.chevron_right, size: 20),
                onTap: () => _showComingSoon('Terms of service'),
              ),
            ],
          ),
          const SizedBox(height: 20),

          // Data & Storage Section
          _buildSectionHeader('Data & Storage'),
          _buildCard(
            children: [
              _buildSwitchTile(
                icon: Icons.backup_outlined,
                title: 'Auto Backup',
                subtitle: 'Backup data automatically',
                value: _autoBackup,
                onChanged: (value) => setState(() => _autoBackup = value),
              ),
              const Divider(height: 1),
              _buildListTile(
                icon: Icons.cloud_download_outlined,
                title: 'Download Data',
                subtitle: 'Export your data',
                trailing: const Icon(Icons.chevron_right, size: 20),
                onTap: () => _showComingSoon('Data export'),
              ),
              const Divider(height: 1),
              _buildListTile(
                icon: Icons.storage_outlined,
                title: 'Clear Cache',
                subtitle: '125 MB',
                trailing: const Icon(Icons.chevron_right, size: 20),
                onTap: () => _showClearCacheDialog(),
              ),
            ],
          ),
          const SizedBox(height: 20),

          // Support Section
          _buildSectionHeader('Support'),
          _buildCard(
            children: [
              _buildListTile(
                icon: Icons.help_outline,
                title: 'Help Center',
                trailing: const Icon(Icons.chevron_right, size: 20),
                onTap: () => _showComingSoon('Help center'),
              ),
              const Divider(height: 1),
              _buildListTile(
                icon: Icons.chat_bubble_outline,
                title: 'Contact Support',
                trailing: const Icon(Icons.chevron_right, size: 20),
                onTap: () => _showComingSoon('Contact support'),
              ),
              const Divider(height: 1),
              _buildListTile(
                icon: Icons.rate_review_outlined,
                title: 'Rate App',
                trailing: const Icon(Icons.chevron_right, size: 20),
                onTap: () => _showComingSoon('Rate app'),
              ),
              const Divider(height: 1),
              _buildListTile(
                icon: Icons.bug_report_outlined,
                title: 'Report Bug',
                trailing: const Icon(Icons.chevron_right, size: 20),
                onTap: () => _showComingSoon('Bug report'),
              ),
            ],
          ),
          const SizedBox(height: 20),

          // About Section
          _buildSectionHeader('About'),
          _buildCard(
            children: [
              _buildListTile(
                icon: Icons.info_outline,
                title: 'App Version',
                subtitle: '1.0.0 (Build 1)',
                onTap: () {},
              ),
              const Divider(height: 1),
              _buildListTile(
                icon: Icons.update_outlined,
                title: 'Check for Updates',
                trailing: const Icon(Icons.chevron_right, size: 20),
                onTap: () => _showComingSoon('Check updates'),
              ),
              const Divider(height: 1),
              _buildListTile(
                icon: Icons.article_outlined,
                title: 'What\'s New',
                trailing: const Icon(Icons.chevron_right, size: 20),
                onTap: () => _showComingSoon('Release notes'),
              ),
            ],
          ),
          const SizedBox(height: 20),

          // Logout Button
          _buildCard(
            children: [
              _buildListTile(
                icon: Icons.logout,
                title: 'Logout',
                titleColor: Colors.red,
                iconColor: Colors.red,
                onTap: () => _showLogoutDialog(),
              ),
            ],
          ),
          const SizedBox(height: 40),
        ],
      ),
    );
  }

  Widget _buildSectionHeader(String title) {
    return Padding(
      padding: const EdgeInsets.only(left: 4, bottom: 8),
      child: Text(
        title,
        style: TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w600,
          color: Colors.grey.shade700,
          letterSpacing: 0.5,
        ),
      ),
    );
  }

  Widget _buildCard({required List<Widget> children}) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(children: children),
    );
  }

  Widget _buildProfileTile() {
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      leading: const CircleAvatar(
        radius: 28,
        backgroundColor: Color(0xFF14B7A3),
        child: Text(
          'JD',
          style: TextStyle(
            color: Colors.white,
            fontSize: 18,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
      title: const Text(
        'John Doe',
        style: TextStyle(
          fontWeight: FontWeight.w600,
          fontSize: 16,
        ),
      ),
      subtitle: const Text('View and edit profile'),
      trailing: const Icon(Icons.chevron_right, size: 20),
      onTap: () => _showComingSoon('Profile editing'),
    );
  }

  Widget _buildListTile({
    required IconData icon,
    required String title,
    String? subtitle,
    Widget? trailing,
    VoidCallback? onTap,
    Color? titleColor,
    Color? iconColor,
  }) {
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      leading: Icon(icon, color: iconColor ?? Colors.grey.shade700, size: 24),
      title: Text(
        title,
        style: TextStyle(
          fontWeight: FontWeight.w500,
          fontSize: 15,
          color: titleColor ?? Colors.black87,
        ),
      ),
      subtitle: subtitle != null
          ? Text(
              subtitle,
              style: TextStyle(
                fontSize: 13,
                color: Colors.grey.shade600,
              ),
            )
          : null,
      trailing: trailing,
      onTap: onTap,
    );
  }

  Widget _buildSwitchTile({
    required IconData icon,
    required String title,
    String? subtitle,
    required bool value,
    required ValueChanged<bool> onChanged,
    bool enabled = true,
  }) {
    return SwitchListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      secondary: Icon(
        icon,
        color: enabled ? Colors.grey.shade700 : Colors.grey.shade400,
        size: 24,
      ),
      title: Text(
        title,
        style: TextStyle(
          fontWeight: FontWeight.w500,
          fontSize: 15,
          color: enabled ? Colors.black87 : Colors.grey.shade400,
        ),
      ),
      subtitle: subtitle != null
          ? Text(
              subtitle,
              style: TextStyle(
                fontSize: 13,
                color: enabled ? Colors.grey.shade600 : Colors.grey.shade400,
              ),
            )
          : null,
      value: value,
      onChanged: enabled ? onChanged : null,
      activeColor: const Color(0xFF14B7A3),
    );
  }

  void _showComingSoon(String feature) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('$feature coming soon')),
    );
  }

  void _showLanguageDialog() {
    final languages = ['English', 'Spanish', 'French', 'German', 'Portuguese'];
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Select Language'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: languages.map((lang) {
            return RadioListTile<String>(
              title: Text(lang),
              value: lang,
              groupValue: _selectedLanguage,
              activeColor: const Color(0xFF14B7A3),
              onChanged: (value) {
                setState(() => _selectedLanguage = value!);
                Navigator.pop(context);
              },
            );
          }).toList(),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
        ],
      ),
    );
  }

  void _showClearCacheDialog() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Clear Cache'),
        content: const Text('This will clear 125 MB of cached data. Continue?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () {
              Navigator.pop(context);
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Cache cleared successfully')),
              );
            },
            style: TextButton.styleFrom(foregroundColor: const Color(0xFF14B7A3)),
            child: const Text('Clear'),
          ),
        ],
      ),
    );
  }

  void _showLogoutDialog() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Logout'),
        content: const Text('Are you sure you want to logout?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () {
              Navigator.pop(context);
              Navigator.pop(context); // Go back to main screen
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Logged out successfully')),
              );
            },
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('Logout'),
          ),
        ],
      ),
    );
  }
}
