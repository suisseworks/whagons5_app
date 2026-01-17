import 'package:flutter/material.dart';
import '../config/app_themes.dart';
import '../widgets/shared_widgets.dart';
import 'task_detail_screen.dart';
import 'create_task_screen.dart';
import 'themes_screen.dart';
import 'notifications_screen.dart';

class MainScreen extends StatefulWidget {
  const MainScreen({super.key});

  @override
  State<MainScreen> createState() => _MainScreenState();
}

class _MainScreenState extends State<MainScreen> {
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();
  final List<String> _workspaces = const [
    'Everything',
    'Shared',
    'Workspace A',
    'Workspace B',
    'Workspace C',
  ];
  String _selectedWorkspace = 'Everything';
  int _selectedNav = 0;
  TaskItem? _activeTask;
  bool _compactCards = false;
  String _selectedTheme = AppThemes.defaultTheme;
  bool _isDarkMode = false;
  int _notificationCount = 2; // Unread notifications count

  static const List<NavItem> _navItems = [
    NavItem(icon: Icons.checklist_outlined, label: 'Tasks', color: null),
    NavItem(icon: Icons.forum_outlined, label: 'Colab', color: null),
    NavItem(icon: Icons.people_outline, label: 'Boards', color: null),
    NavItem(
      icon: Icons.cleaning_services_outlined,
      label: 'Cleaning',
      color: Colors.blue,
    ),
  ];

  final List<TaskItem> _tasks = [
    TaskItem(
      title: 'Check HVAC filters',
      spot: 'Building A',
      priority: 'High',
      status: 'Open',
      assignees: ['Alex', 'Mia'],
      createdAt: 'Today 8:15 AM',
      tags: ['HVAC', 'Preventive'],
      approval: 'Awaiting lead',
      sla: null,
    ),
    TaskItem(
      title: 'Inspect fire extinguishers',
      spot: 'Floor 3',
      priority: 'High',
      status: 'In progress',
      assignees: ['Sam'],
      createdAt: 'Today 7:50 AM',
      tags: ['Safety'],
      approval: null,
      sla: 'SLA 4h',
    ),
    TaskItem(
      title: 'Clean lobby glass',
      spot: 'Main Lobby',
      priority: 'Low',
      status: 'Open',
      assignees: ['Leo', 'Cam'],
      createdAt: 'Yesterday 5:10 PM',
      tags: ['Cleaning'],
      approval: null,
      sla: null,
    ),
    TaskItem(
      title: 'Test emergency lights',
      spot: 'Basement',
      priority: 'High',
      status: 'Blocked',
      assignees: ['Priya'],
      createdAt: 'Today 6:40 AM',
      tags: ['Safety', 'Electrical'],
      approval: null,
      sla: 'SLA breached',
    ),
    TaskItem(
      title: 'Replace hallway bulbs',
      spot: 'Floor 2',
      priority: 'Medium',
      status: 'Open',
      assignees: ['Tom'],
      createdAt: 'Today 9:05 AM',
      tags: ['Electrical'],
      approval: null,
      sla: null,
    ),
    TaskItem(
      title: 'Service elevator A',
      spot: 'Shaft 1',
      priority: 'High',
      status: 'Scheduled',
      assignees: ['Alex', 'Priya'],
      createdAt: 'Yesterday 4:30 PM',
      tags: ['Elevator'],
      approval: 'Ops approval',
      sla: null,
    ),
    TaskItem(
      title: 'Calibrate thermostats',
      spot: 'Offices',
      priority: 'Medium',
      status: 'In progress',
      assignees: ['Mia'],
      createdAt: 'Today 8:45 AM',
      tags: ['HVAC'],
      approval: null,
      sla: null,
    ),
    TaskItem(
      title: 'Patch wall paint',
      spot: 'Conference Room',
      priority: 'Low',
      status: 'Open',
      assignees: ['Cam'],
      createdAt: 'Yesterday 3:20 PM',
      tags: ['Paint'],
      approval: null,
      sla: null,
    ),
    TaskItem(
      title: 'Check water pressure',
      spot: 'Roof Tank',
      priority: 'Medium',
      status: 'Open',
      assignees: ['Leo'],
      createdAt: 'Today 9:20 AM',
      tags: ['Plumbing'],
      approval: null,
      sla: null,
    ),
    TaskItem(
      title: 'Clean AC ducts',
      spot: 'Wing C',
      priority: 'High',
      status: 'Scheduled',
      assignees: ['Sam', 'Priya'],
      createdAt: 'Yesterday 2:00 PM',
      tags: ['HVAC', 'Deep clean'],
      approval: null,
      sla: null,
    ),
    TaskItem(
      title: 'Replace air filter',
      spot: 'Server Room',
      priority: 'High',
      status: 'In progress',
      assignees: ['Alex'],
      createdAt: 'Today 7:30 AM',
      tags: ['HVAC', 'Critical'],
      approval: null,
      sla: null,
    ),
    TaskItem(
      title: 'Grease door hinges',
      spot: 'Storage',
      priority: 'Low',
      status: 'Done',
      assignees: ['Cam'],
      createdAt: 'Yesterday 11:40 AM',
      tags: ['General'],
      approval: null,
      sla: null,
    ),
    TaskItem(
      title: 'Inspect sprinklers',
      spot: 'Floor 4',
      priority: 'High',
      status: 'Open',
      assignees: ['Tom', 'Leo'],
      createdAt: 'Today 8:05 AM',
      tags: ['Safety'],
      approval: null,
      sla: null,
    ),
    TaskItem(
      title: 'Tile repair',
      spot: 'Restroom East',
      priority: 'Medium',
      status: 'Scheduled',
      assignees: ['Priya'],
      createdAt: 'Yesterday 1:55 PM',
      tags: ['Repairs'],
      approval: null,
      sla: null,
    ),
    TaskItem(
      title: 'Check smoke detectors',
      spot: 'Dorm Wing',
      priority: 'High',
      status: 'Open',
      assignees: ['Sam'],
      createdAt: 'Today 9:10 AM',
      tags: ['Safety', 'Electrical'],
      approval: null,
      sla: null,
    ),
    TaskItem(
      title: 'Refill janitorial stock',
      spot: 'Supply Closet',
      priority: 'Low',
      status: 'Open',
      assignees: ['Mia'],
      createdAt: 'Today 8:55 AM',
      tags: ['Supplies'],
      approval: null,
      sla: null,
    ),
    TaskItem(
      title: 'Deep clean carpets',
      spot: 'Lobby',
      priority: 'Medium',
      status: 'Scheduled',
      assignees: ['Alex', 'Cam'],
      createdAt: 'Yesterday 2:45 PM',
      tags: ['Cleaning', 'Deep clean'],
      approval: null,
      sla: null,
    ),
    TaskItem(
      title: 'Window seal inspection',
      spot: 'Floor 5',
      priority: 'Medium',
      status: 'Open',
      assignees: ['Leo'],
      createdAt: 'Today 7:20 AM',
      tags: ['Inspection'],
      approval: null,
      sla: null,
    ),
    TaskItem(
      title: 'Test backup generator',
      spot: 'Utility Yard',
      priority: 'High',
      status: 'Scheduled',
      assignees: ['Tom', 'Priya'],
      createdAt: 'Yesterday 5:00 PM',
      tags: ['Power'],
      approval: null,
      sla: null,
    ),
    TaskItem(
      title: 'Parking lines repaint',
      spot: 'Parking Lot',
      priority: 'Low',
      status: 'Open',
      assignees: ['Sam'],
      createdAt: 'Today 6:55 AM',
      tags: ['Paint'],
      approval: null,
      sla: null,
    ),
  ];

  Color get _backgroundColor {
    if (_isDarkMode) {
      return AppThemes.getDarkTheme(_selectedTheme).scaffoldBackgroundColor;
    }
    return AppThemes.getLightTheme(_selectedTheme).scaffoldBackgroundColor;
  }

  Color get _primaryColor {
    return AppThemes.getPrimaryColor(_selectedTheme, _isDarkMode);
  }

  Color get _cardColor {
    return _isDarkMode
        ? AppThemes.getDarkTheme(_selectedTheme).colorScheme.surface
        : Colors.white;
  }

  Color get _textColor {
    return _isDarkMode ? Colors.white : Colors.black87;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: _scaffoldKey,
      backgroundColor: _backgroundColor,
      floatingActionButtonLocation: FloatingActionButtonLocation.endDocked,
      floatingActionButton: KeepFab(
        onPressed: _openCreateTask,
        color: _primaryColor,
      ),
      appBar: AppBar(
        backgroundColor: _backgroundColor,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        primary: true,
        toolbarHeight: 72,
        leadingWidth: 56,
        leading: Padding(
          padding: const EdgeInsets.only(left: 8, top: 10, bottom: 10),
          child: Align(
            alignment: Alignment.centerLeft,
            child: IconButton(
              constraints: const BoxConstraints.tightFor(width: 36, height: 36),
              padding: EdgeInsets.zero,
              iconSize: 24,
              icon: Icon(Icons.menu, color: _textColor),
              onPressed: () => _scaffoldKey.currentState?.openDrawer(),
              tooltip: 'Menu',
            ),
          ),
        ),
        titleSpacing: 0,
        title: Padding(
          padding: const EdgeInsets.only(left: 4),
          child: Row(
            children: [
              PopupMenuButton<String>(
                padding: EdgeInsets.zero,
                initialValue: _selectedWorkspace,
                onSelected: (value) =>
                    setState(() => _selectedWorkspace = value),
                itemBuilder: (context) => _workspaces
                    .map((w) => PopupMenuItem<String>(value: w, child: Text(w)))
                    .toList(),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      _selectedWorkspace,
                      style: TextStyle(
                        color: _textColor,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Icon(Icons.keyboard_arrow_down, color: _textColor),
                  ],
                ),
              ),
            ],
          ),
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                IconButton(
                  padding: EdgeInsets.zero,
                  icon: Icon(Icons.filter_list, color: _textColor),
                  tooltip: 'Filter',
                  onPressed: () {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Filters coming soon')),
                    );
                  },
                ),
                const SizedBox(width: 4),
                Stack(
                  clipBehavior: Clip.none,
                  children: [
                    IconButton(
                      padding: EdgeInsets.zero,
                      icon: Icon(Icons.account_circle_outlined, color: _textColor),
                      tooltip: 'Profile',
                      onPressed: () => _scaffoldKey.currentState?.openDrawer(),
                    ),
                    if (_notificationCount > 0)
                      Positioned(
                        right: 6,
                        top: 6,
                        child: Container(
                          padding: const EdgeInsets.all(4),
                          decoration: BoxDecoration(
                            color: Colors.red,
                            shape: BoxShape.circle,
                            border: Border.all(color: _backgroundColor, width: 1.5),
                          ),
                          constraints: const BoxConstraints(
                            minWidth: 18,
                            minHeight: 18,
                          ),
                          child: Center(
                            child: Text(
                              _notificationCount > 9 ? '9+' : '$_notificationCount',
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
                ),
              ],
            ),
          ),
        ],
      ),
      drawer: KeepDrawer(
        isDarkMode: _isDarkMode,
        compactCards: _compactCards,
        notificationCount: _notificationCount,
        onThemeToggle: () {
          setState(() {
            _isDarkMode = !_isDarkMode;
          });
        },
        onCompactCardsToggle: () {
          setState(() {
            _compactCards = !_compactCards;
          });
        },
        onNotificationsPressed: () {
          Navigator.pop(context);
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (context) => NotificationsScreen(
                onNotificationsRead: (count) {
                  setState(() {
                    _notificationCount = count;
                  });
                },
              ),
            ),
          );
        },
        onThemesPressed: () {
          Navigator.pop(context);
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (context) => ThemesScreen(
                currentTheme: _selectedTheme,
                isDarkMode: _isDarkMode,
                onThemeSelected: (theme) {
                  setState(() {
                    _selectedTheme = theme;
                  });
                  Navigator.pop(context);
                },
              ),
            ),
          );
        },
      ),
      body: SafeArea(
        child: Column(
          children: [
            if (_activeTask != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
                child: ActiveTaskBanner(
                  task: _activeTask!,
                  onDone: () => _setActiveTask(null, markDone: true),
                  onClear: () => _setActiveTask(null),
                ),
              ),
            Expanded(child: _buildBody()),
          ],
        ),
      ),
      bottomNavigationBar: KeepBottomBar(
        items: _navItems,
        selectedIndex: _selectedNav,
        onTap: (index) => setState(() => _selectedNav = index),
        boardsBadgeCount: 5,
      ),
    );
  }

  void _openCreateTask() {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (context) => CreateTaskScreen(
          onCreateTask: (newTask) {
            setState(() {
              _tasks.insert(0, newTask);
            });
            Navigator.pop(context);
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Task created successfully')),
            );
          },
        ),
      ),
    );
  }

  void _openTaskDetail(TaskItem task) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (context) => TaskDetailScreen(
          task: task,
          onSetActive: () {
            Navigator.pop(context);
            _setActiveTask(task);
          },
          onMarkDone: () {
            Navigator.pop(context);
            final index = _tasks.indexWhere((t) => t.title == task.title);
            if (index != -1) {
              _updateTask(index, task.copyWith(status: 'Done'));
            }
          },
        ),
      ),
    );
  }

  Future<bool> _handleSwipe(DismissDirection direction, int index) async {
    final task = _tasks[index];
    if (direction == DismissDirection.startToEnd) {
      // Swipe right: mark done
      _updateTask(index, task.copyWith(status: 'Done'));
      if (_activeTask?.title == task.title) {
        _setActiveTask(null, markDone: false);
      }
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Marked as done')));
      }
    } else if (direction == DismissDirection.endToStart) {
      // Swipe left: assign "You" if not present
      if (!task.assignees.contains('You')) {
        final updatedAssignees = [...task.assignees, 'You'];
        _updateTask(index, task.copyWith(assignees: updatedAssignees));
        if (mounted) {
          ScaffoldMessenger.of(
            context,
          ).showSnackBar(const SnackBar(content: Text('Assigned to You')));
        }
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Already assigned to You')),
          );
        }
      }
    }
    return false; // prevent removal
  }

  void _updateTask(int index, TaskItem newTask) {
    setState(() {
      _tasks[index] = newTask;
    });
  }

  void _setActiveTask(TaskItem? task, {bool markDone = false}) {
    setState(() {
      if (markDone && _activeTask != null) {
        final activeIndex = _tasks.indexWhere(
          (t) => t.title == _activeTask!.title,
        );
        if (activeIndex != -1) {
          _tasks[activeIndex] = _tasks[activeIndex].copyWith(status: 'Done');
        }
      }
      _activeTask = task;
    });
    if (task != null && mounted) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Now working on "${task.title}"')));
    }
  }

  Widget _buildBody() {
    if (_selectedNav == 0) {
      return ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: _tasks.length,
        separatorBuilder: (_, __) => const SizedBox(height: 12),
        itemBuilder: (context, index) {
          final task = _tasks[index];
          final double cardPadding = _compactCards ? 10 : 14;
          return Dismissible(
            key: ValueKey('${task.title}-$index'),
            direction: DismissDirection.horizontal,
            confirmDismiss: (direction) => _handleSwipe(direction, index),
            background: Container(
              decoration: BoxDecoration(
                color: Colors.green.shade100,
                borderRadius: BorderRadius.circular(12),
              ),
              alignment: Alignment.centerLeft,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: const Row(
                children: [
                  Icon(Icons.check, color: Colors.green, size: 24),
                  SizedBox(width: 8),
                  Text('Mark done', style: TextStyle(color: Colors.green)),
                ],
              ),
            ),
            secondaryBackground: Container(
              decoration: BoxDecoration(
                color: Colors.blue.shade100,
                borderRadius: BorderRadius.circular(12),
              ),
              alignment: Alignment.centerRight,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: const Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  Text('Assign', style: TextStyle(color: Colors.blue)),
                  SizedBox(width: 8),
                  Icon(Icons.person_add, color: Colors.blue, size: 24),
                ],
              ),
            ),
            child: GestureDetector(
              onTap: () => _openTaskDetail(task),
              child: Container(
                decoration: BoxDecoration(
                  color: _cardColor,
                  borderRadius: BorderRadius.circular(12),
                  border: Border(
                    left: BorderSide(color: statusColor(task.status), width: 5),
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(0.05),
                      blurRadius: 6,
                      offset: const Offset(0, 2),
                    ),
                  ],
                ),
                padding: EdgeInsets.fromLTRB(
                  12,
                  cardPadding,
                  cardPadding,
                  cardPadding,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            task.title,
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                        Icon(Icons.more_vert, color: Colors.grey.shade700),
                      ],
                    ),
                    SizedBox(height: _compactCards ? 6 : 8),
                    Row(
                      children: [
                        CustomChip(
                          label: task.priority,
                          color: priorityColor(task.priority),
                        ),
                        const SizedBox(width: 8),
                        CustomChip(
                          label: task.spot,
                          color: Colors.grey.shade200,
                          textColor: Colors.black87,
                        ),
                        const SizedBox(width: 8),
                        ...buildAssignees(task.assignees),
                      ],
                    ),
                    if (!_compactCards) const SizedBox(height: 8),
                    if (!_compactCards && task.tags.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Wrap(
                          spacing: 6,
                          runSpacing: 6,
                          children: task.tags
                              .take(4)
                              .map(
                                (t) => CustomChip(
                                  label: t,
                                  color: Colors.grey.shade100,
                                  textColor: Colors.black87,
                                ),
                              )
                              .toList(),
                        ),
                      ),
                    if (!_compactCards) const SizedBox(height: 4),
                    if (!_compactCards)
                      Row(
                        children: [
                          Icon(
                            Icons.schedule,
                            size: 16,
                            color: Colors.grey.shade600,
                          ),
                          const SizedBox(width: 6),
                          Text(
                            'Created ${task.createdAt}',
                            style: TextStyle(
                              color: Colors.grey.shade700,
                              fontSize: 12,
                            ),
                          ),
                          const Spacer(),
                          if (task.approval != null)
                            CustomChip(
                              label: task.approval!,
                              color: Colors.blue.shade100,
                              textColor: Colors.blue.shade900,
                            )
                          else if (task.sla != null)
                            CustomChip(
                              label: task.sla!,
                              color:
                                  task.sla!.toLowerCase().contains('breached')
                                  ? Colors.red.shade100
                                  : Colors.teal.shade100,
                              textColor:
                                  task.sla!.toLowerCase().contains('breached')
                                  ? Colors.red.shade900
                                  : Colors.teal.shade900,
                            ),
                        ],
                      ),
                  ],
                ),
              ),
            ),
          );
        },
      );
    }

    if (_selectedNav == 1) {
      return Column(
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: _cardColor,
              border: Border(
                bottom: BorderSide(color: Colors.grey.shade200, width: 1),
              ),
            ),
            child: Row(
              children: [
                Icon(
                  Icons.forum_outlined,
                  color: Colors.grey.shade700,
                  size: 20,
                ),
                const SizedBox(width: 8),
                Text(
                  'Workspace Chat',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: Colors.grey.shade800,
                  ),
                ),
                const Spacer(),
                Text(
                  _selectedWorkspace,
                  style: TextStyle(fontSize: 14, color: Colors.grey.shade600),
                ),
              ],
            ),
          ),
          Expanded(
            child: Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.chat_bubble_outline,
                    size: 64,
                    color: Colors.grey.shade400,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'Workspace Chat',
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Chat with your $_selectedWorkspace team',
                    style: TextStyle(color: Colors.grey.shade600),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'Coming soon',
                    style: TextStyle(
                      color: Colors.grey.shade500,
                      fontSize: 12,
                      fontStyle: FontStyle.italic,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      );
    }

    if (_selectedNav == 2) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.people_outline, size: 64, color: Colors.grey.shade400),
            const SizedBox(height: 16),
            Text(
              'Boards',
              style: Theme.of(
                context,
              ).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 8),
            Text(
              'Communication boards coming soon',
              style: TextStyle(color: Colors.grey.shade600),
            ),
          ],
        ),
      );
    }

    if (_selectedNav == 3) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.cleaning_services_outlined,
              size: 64,
              color: Colors.grey.shade400,
            ),
            const SizedBox(height: 16),
            Text(
              'Cleaning',
              style: Theme.of(
                context,
              ).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 8),
            Text(
              'Cleaning management coming soon',
              style: TextStyle(color: Colors.grey.shade600),
            ),
          ],
        ),
      );
    }

    return Center(
      child: Text(
        _navItems[_selectedNav].label,
        style: Theme.of(context).textTheme.titleMedium,
      ),
    );
  }
}
