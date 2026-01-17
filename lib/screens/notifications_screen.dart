import 'package:flutter/material.dart';

class NotificationsScreen extends StatefulWidget {
  final Function(int)? onNotificationsRead;
  
  const NotificationsScreen({super.key, this.onNotificationsRead});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  final List<NotificationItem> _notifications = [
    NotificationItem(
      id: '1',
      title: 'Task assigned to you',
      message: 'Alex assigned "Check HVAC filters" to you',
      timestamp: DateTime.now().subtract(const Duration(minutes: 15)),
      isRead: false,
      icon: Icons.assignment_turned_in,
      color: Colors.blue,
    ),
    NotificationItem(
      id: '2',
      title: 'SLA breach warning',
      message: 'Task "Test emergency lights" is approaching SLA deadline',
      timestamp: DateTime.now().subtract(const Duration(hours: 2)),
      isRead: false,
      icon: Icons.warning_amber,
      color: Colors.orange,
    ),
    NotificationItem(
      id: '3',
      title: 'Task approved',
      message: 'Your task "Service elevator A" has been approved',
      timestamp: DateTime.now().subtract(const Duration(hours: 5)),
      isRead: true,
      icon: Icons.check_circle,
      color: Colors.green,
    ),
    NotificationItem(
      id: '4',
      title: 'New comment',
      message: 'Priya commented on "Inspect sprinklers"',
      timestamp: DateTime.now().subtract(const Duration(days: 1)),
      isRead: true,
      icon: Icons.comment,
      color: Colors.purple,
    ),
    NotificationItem(
      id: '5',
      title: 'Task completed',
      message: 'Sam marked "Grease door hinges" as done',
      timestamp: DateTime.now().subtract(const Duration(days: 2)),
      isRead: true,
      icon: Icons.done_all,
      color: Colors.teal,
    ),
  ];

  int get _unreadCount => _notifications.where((n) => !n.isRead).length;

  @override
  void initState() {
    super.initState();
    // Mark all as read when screen opens
    Future.delayed(const Duration(milliseconds: 500), () {
      if (mounted) {
        setState(() {
          for (var notification in _notifications) {
            notification.isRead = true;
          }
        });
        widget.onNotificationsRead?.call(0);
      }
    });
  }

  String _formatTimestamp(DateTime timestamp) {
    final now = DateTime.now();
    final difference = now.difference(timestamp);

    if (difference.inMinutes < 60) {
      return '${difference.inMinutes}m ago';
    } else if (difference.inHours < 24) {
      return '${difference.inHours}h ago';
    } else if (difference.inDays < 7) {
      return '${difference.inDays}d ago';
    } else {
      return '${timestamp.month}/${timestamp.day}/${timestamp.year}';
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        backgroundColor: const Color(0xFF14B7A3),
        foregroundColor: Colors.white,
        elevation: 0,
      ),
      body: _notifications.isEmpty
          ? Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.notifications_none,
                    size: 64,
                    color: Colors.grey.shade400,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'No notifications',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w600,
                      color: Colors.grey.shade600,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'You\'re all caught up!',
                    style: TextStyle(
                      fontSize: 14,
                      color: Colors.grey.shade500,
                    ),
                  ),
                ],
              ),
            )
          : ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: _notifications.length,
              separatorBuilder: (context, index) => const SizedBox(height: 8),
              itemBuilder: (context, index) {
                final notification = _notifications[index];
                return Container(
                  decoration: BoxDecoration(
                    color: notification.isRead
                        ? Colors.white
                        : Colors.blue.shade50,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: notification.isRead
                          ? Colors.grey.shade200
                          : Colors.blue.shade200,
                      width: 1,
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withOpacity(0.03),
                        blurRadius: 4,
                        offset: const Offset(0, 2),
                      ),
                    ],
                  ),
                  child: ListTile(
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 8,
                    ),
                    leading: CircleAvatar(
                      backgroundColor: notification.color.withOpacity(0.1),
                      child: Icon(
                        notification.icon,
                        color: notification.color,
                        size: 24,
                      ),
                    ),
                    title: Row(
                      children: [
                        Expanded(
                          child: Text(
                            notification.title,
                            style: TextStyle(
                              fontWeight: notification.isRead
                                  ? FontWeight.w600
                                  : FontWeight.w700,
                              fontSize: 15,
                            ),
                          ),
                        ),
                        if (!notification.isRead)
                          Container(
                            width: 8,
                            height: 8,
                            decoration: const BoxDecoration(
                              color: Color(0xFF14B7A3),
                              shape: BoxShape.circle,
                            ),
                          ),
                      ],
                    ),
                    subtitle: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const SizedBox(height: 4),
                        Text(
                          notification.message,
                          style: TextStyle(
                            fontSize: 14,
                            color: Colors.grey.shade700,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          _formatTimestamp(notification.timestamp),
                          style: TextStyle(
                            fontSize: 12,
                            color: Colors.grey.shade500,
                          ),
                        ),
                      ],
                    ),
                    onTap: () {
                      setState(() {
                        notification.isRead = true;
                      });
                      // Navigate to relevant screen based on notification type
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text('Opening: ${notification.title}'),
                          duration: const Duration(seconds: 1),
                        ),
                      );
                    },
                  ),
                );
              },
            ),
    );
  }
}

class NotificationItem {
  final String id;
  final String title;
  final String message;
  final DateTime timestamp;
  bool isRead;
  final IconData icon;
  final Color color;

  NotificationItem({
    required this.id,
    required this.title,
    required this.message,
    required this.timestamp,
    required this.isRead,
    required this.icon,
    required this.color,
  });
}
