import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import '../screens/settings_screen.dart';

/// Navigation item model
class NavItem {
  final IconData icon;
  final String label;
  final Color? color;
  const NavItem({required this.icon, required this.label, this.color});
}

/// Task item model
class TaskItem {
  final String title;
  final String spot;
  final String priority;
  final String status;
  final List<String> assignees;
  final String createdAt;
  final List<String> tags;
  final String? approval;
  final String? sla;

  const TaskItem({
    required this.title,
    required this.spot,
    required this.priority,
    required this.status,
    required this.assignees,
    required this.createdAt,
    required this.tags,
    required this.approval,
    required this.sla,
  });

  TaskItem copyWith({
    String? title,
    String? spot,
    String? priority,
    String? status,
    List<String>? assignees,
    String? createdAt,
    List<String>? tags,
    String? approval,
    String? sla,
  }) {
    return TaskItem(
      title: title ?? this.title,
      spot: spot ?? this.spot,
      priority: priority ?? this.priority,
      status: status ?? this.status,
      assignees: assignees ?? this.assignees,
      createdAt: createdAt ?? this.createdAt,
      tags: tags ?? this.tags,
      approval: approval ?? this.approval,
      sla: sla ?? this.sla,
    );
  }
}

/// Custom chip widget
class CustomChip extends StatelessWidget {
  final String label;
  final Color color;
  final Color textColor;

  const CustomChip({
    super.key,
    required this.label,
    required this.color,
    this.textColor = Colors.white,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: textColor,
          fontSize: 12,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

/// Build assignee avatars
List<Widget> buildAssignees(List<String> assignees) {
  return assignees
      .take(3)
      .map(
        (name) => Padding(
          padding: const EdgeInsets.only(right: 6),
          child: CircleAvatar(
            radius: 10,
            backgroundColor: Colors.grey.shade300,
            child: Text(
              name.isNotEmpty ? name[0].toUpperCase() : '?',
              style: const TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: Colors.black87,
              ),
            ),
          ),
        ),
      )
      .toList();
}

/// Priority color helper
Color priorityColor(String priority) {
  switch (priority.toLowerCase()) {
    case 'high':
      return Colors.red.shade500;
    case 'medium':
      return Colors.orange.shade500;
    default:
      return Colors.green.shade500;
  }
}

/// Status color helper
Color statusColor(String status) {
  switch (status.toLowerCase()) {
    case 'in progress':
      return Colors.blue.shade500;
    case 'scheduled':
      return Colors.purple.shade400;
    case 'blocked':
      return Colors.red.shade400;
    case 'done':
      return Colors.green.shade600;
    default:
      return Colors.grey.shade500;
  }
}

/// Bottom navigation bar
class KeepBottomBar extends StatelessWidget {
  final List<NavItem> items;
  final int selectedIndex;
  final ValueChanged<int> onTap;
  final int boardsBadgeCount;

  const KeepBottomBar({
    super.key,
    required this.items,
    required this.selectedIndex,
    required this.onTap,
    this.boardsBadgeCount = 0,
  });

  @override
  Widget build(BuildContext context) {
    return BottomAppBar(
      shape: const CircularNotchedRectangle(),
      notchMargin: 8,
      color: Colors.white,
      padding: const EdgeInsets.symmetric(horizontal: 14),
      height: 68,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.start,
        children: [
          const SizedBox(width: 6),
          for (int i = 0; i < items.length; i++) ...[
            BarIcon(
              icon: items[i].icon,
              selected: i == selectedIndex,
              onTap: () => onTap(i),
              color: items[i].color,
              badgeCount: i == 2 ? boardsBadgeCount : null, // Index 2 is Boards
            ),
            if (i != items.length - 1) const SizedBox(width: 18),
          ],
        ],
      ),
    );
  }
}

/// Bar icon widget
class BarIcon extends StatelessWidget {
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;
  final Color? color;
  final int? badgeCount;

  const BarIcon({
    super.key,
    required this.icon,
    required this.selected,
    required this.onTap,
    this.color,
    this.badgeCount,
  });

  @override
  Widget build(BuildContext context) {
    return Stack(
      clipBehavior: Clip.none,
      children: [
        IconButton(
          onPressed: onTap,
          icon: Icon(
            icon,
            color: selected ? const Color(0xFF14B7A3) : (color ?? Colors.black87),
          ),
          tooltip: '',
          visualDensity: VisualDensity.compact,
        ),
        if (badgeCount != null && badgeCount! > 0)
          Positioned(
            right: 4,
            top: 4,
            child: Container(
              padding: const EdgeInsets.all(4),
              decoration: BoxDecoration(
                color: Colors.red,
                shape: BoxShape.circle,
                border: Border.all(color: Colors.white, width: 1.5),
              ),
              constraints: const BoxConstraints(
                minWidth: 18,
                minHeight: 18,
              ),
              child: Center(
                child: Text(
                  badgeCount! > 9 ? '9+' : '$badgeCount',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

/// Floating action button
class KeepFab extends StatelessWidget {
  final VoidCallback onPressed;
  final Color color;
  const KeepFab({super.key, required this.onPressed, required this.color});

  @override
  Widget build(BuildContext context) {
    return FloatingActionButton(
      elevation: 6,
      backgroundColor: color,
      shape: const CircleBorder(),
      onPressed: onPressed,
      child: const Icon(Icons.add, color: Colors.white, size: 28),
    );
  }
}

/// Active task banner
class ActiveTaskBanner extends StatelessWidget {
  final TaskItem task;
  final VoidCallback onDone;
  final VoidCallback onClear;

  const ActiveTaskBanner({
    super.key,
    required this.task,
    required this.onDone,
    required this.onClear,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
        border: Border(
          left: BorderSide(color: statusColor(task.status), width: 5),
        ),
      ),
      child: Row(
        children: [
          Icon(Icons.play_circle_fill, color: Colors.green.shade600),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Working on',
                  style: TextStyle(color: Colors.grey.shade700, fontSize: 12),
                ),
                Text(
                  task.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 15,
                  ),
                ),
              ],
            ),
          ),
          TextButton(onPressed: onDone, child: const Text('Done')),
          IconButton(icon: const Icon(Icons.close), onPressed: onClear),
        ],
      ),
    );
  }
}

/// App drawer
class KeepDrawer extends StatelessWidget {
  final bool isDarkMode;
  final bool compactCards;
  final int notificationCount;
  final VoidCallback onThemeToggle;
  final VoidCallback onCompactCardsToggle;
  final VoidCallback onNotificationsPressed;
  final VoidCallback onThemesPressed;

  const KeepDrawer({
    super.key,
    required this.isDarkMode,
    required this.compactCards,
    required this.notificationCount,
    required this.onThemeToggle,
    required this.onCompactCardsToggle,
    required this.onNotificationsPressed,
    required this.onThemesPressed,
  });

  // Inspirational quotes
  static const List<Map<String, String>> _quotes = [
    {'text': 'Every accomplishment starts with the decision to try.', 'author': 'John F. Kennedy'},
    {'text': 'The only way to do great work is to love what you do.', 'author': 'Steve Jobs'},
    {'text': 'Success is not final, failure is not fatal: it is the courage to continue that counts.', 'author': 'Winston Churchill'},
    {'text': 'Believe you can and you\'re halfway there.', 'author': 'Theodore Roosevelt'},
    {'text': 'The future belongs to those who believe in the beauty of their dreams.', 'author': 'Eleanor Roosevelt'},
    {'text': 'It does not matter how slowly you go as long as you do not stop.', 'author': 'Confucius'},
    {'text': 'Everything you\'ve ever wanted is on the other side of fear.', 'author': 'George Addair'},
    {'text': 'The best time to plant a tree was 20 years ago. The second best time is now.', 'author': 'Chinese Proverb'},
    {'text': 'Your limitation—it\'s only your imagination.', 'author': 'Unknown'},
    {'text': 'Great things never come from comfort zones.', 'author': 'Unknown'},
  ];

  // Image URLs from your client app
  static const List<String> _images = [
    'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80', // ocean waves
    'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=800&q=80', // forest path
    'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=800&q=80', // mountain range
    'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=800&q=80', // mountain lake
    'https://images.unsplash.com/photo-1502126324834-38f8e02d7160?auto=format&fit=crop&w=800&q=80', // climbing mountain
  ];

  int _getDailyIndex(int listLength) {
    // Changes once per day
    final now = DateTime.now();
    final daysSinceEpoch = now.millisecondsSinceEpoch ~/ (1000 * 60 * 60 * 24);
    return daysSinceEpoch % listLength;
  }

  @override
  Widget build(BuildContext context) {
    final quoteIndex = _getDailyIndex(_quotes.length);
    final imageIndex = _getDailyIndex(_images.length);
    final selectedQuote = _quotes[quoteIndex];
    final selectedImage = _images[imageIndex];

    return Drawer(
      child: SafeArea(
        child: ListView(
          padding: EdgeInsets.zero,
          children: [
            DrawerHeader(
              decoration: const BoxDecoration(color: Color(0xFF14B7A3)),
              child: Align(
                alignment: Alignment.bottomLeft,
                child: Row(
                  children: [
                    SvgPicture.asset(
                      'assets/images/whagons_logo.svg',
                      width: 40,
                      height: 40,
                      colorFilter: const ColorFilter.mode(
                        Colors.white,
                        BlendMode.srcIn,
                      ),
                    ),
                    const SizedBox(width: 12),
                    const Text(
                      'Whagons',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 24,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            ListTile(
              leading: Stack(
                clipBehavior: Clip.none,
                children: [
                  const Icon(Icons.notifications_outlined),
                  if (notificationCount > 0)
                    Positioned(
                      right: -2,
                      top: -2,
                      child: Container(
                        padding: const EdgeInsets.all(4),
                        decoration: BoxDecoration(
                          color: Colors.red,
                          shape: BoxShape.circle,
                          border: Border.all(color: Colors.white, width: 1.5),
                        ),
                        constraints: const BoxConstraints(
                          minWidth: 16,
                          minHeight: 16,
                        ),
                        child: Center(
                          child: Text(
                            notificationCount > 9 ? '9+' : '$notificationCount',
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 9,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
              title: const Text('Notifications'),
              trailing: notificationCount > 0
                  ? Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.red,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        '$notificationCount',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    )
                  : null,
              onTap: onNotificationsPressed,
            ),
            const Divider(),
            ListTile(
              leading: const Icon(Icons.person_outline),
              title: const Text('Profile'),
              onTap: () {
                Navigator.pop(context);
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (context) => const SettingsScreen(),
                  ),
                );
              },
            ),
            ListTile(
              leading: const Icon(Icons.palette_outlined),
              title: const Text('Themes'),
              onTap: onThemesPressed,
            ),
            ListTile(
              leading: const Icon(Icons.settings_outlined),
              title: const Text('Settings'),
              onTap: () {
                Navigator.pop(context);
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (context) => const SettingsScreen(),
                  ),
                );
              },
            ),
            const Divider(),
            SwitchListTile(
              secondary: Icon(isDarkMode ? Icons.dark_mode : Icons.light_mode),
              title: const Text('Dark Mode'),
              value: isDarkMode,
              onChanged: (_) => onThemeToggle(),
              activeColor: const Color(0xFF14B7A3),
            ),
            SwitchListTile(
              secondary: Icon(compactCards ? Icons.view_agenda : Icons.view_day),
              title: const Text('Compact Cards'),
              value: compactCards,
              onChanged: (_) => onCompactCardsToggle(),
              activeColor: const Color(0xFF14B7A3),
            ),
            const SizedBox(height: 20),
            // Inspirational Image & Quote
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: Container(
                      height: 160,
                      width: double.infinity,
                      decoration: BoxDecoration(
                        image: DecorationImage(
                          image: NetworkImage(selectedImage),
                          fit: BoxFit.cover,
                        ),
                      ),
                      child: Container(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.topCenter,
                            end: Alignment.bottomCenter,
                            colors: [
                              Colors.transparent,
                              Colors.black.withOpacity(0.7),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    '"${selectedQuote['text']}"',
                    style: TextStyle(
                      fontSize: 14,
                      fontStyle: FontStyle.italic,
                      color: Colors.grey.shade700,
                      height: 1.4,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    '— ${selectedQuote['author']}',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: Colors.grey.shade600,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }
}
