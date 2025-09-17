import 'package:flutter/material.dart';
import '../services/api_client.dart';
import '../models/task.dart';

class MainScreen extends StatefulWidget {
  const MainScreen({super.key});

  @override
  State<MainScreen> createState() => _MainScreenState();
}

class _MainScreenState extends State<MainScreen> {
  int _currentIndex = 0;

  late final ApiClient _api;
  List<TaskModel> _tasks = const [];
  bool _isLoading = false;
  String? _error;

  static const List<Widget> _pages = <Widget>[
    _HomeTasksPage(),
    _PlaceholderPage(title: 'Search'),
    _PlaceholderPage(title: 'Notifications'),
    _PlaceholderPage(title: 'Settings'),
  ];
  static const List<String> _titles = <String>[
    'Tasks',
    'Search',
    'Alerts',
    'Settings',
  ];

  @override
  void initState() {
    super.initState();
    _api = const ApiClient(
      // TODO: adjust base URL and token as needed
      baseUrl: 'http://localhost',
      authToken: null,
    );
    _fetchTasks();
  }

  Future<void> _fetchTasks() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });
    try {
      final data = await _api.getTasks();
      final tasks = data.map((e) => TaskModel.fromJson(e)).toList();
      setState(() {
        _tasks = tasks;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
      });
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  Future<void> _openCreateTask() async {
    final String? taskTitle = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      builder: (sheetContext) {
        final TextEditingController controller = TextEditingController();
        return Padding(
          padding: EdgeInsets.only(
            left: 16,
            right: 16,
            top: 16,
            bottom: 16 + MediaQuery.of(sheetContext).viewInsets.bottom,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Create task',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 12),
              TextField(
                controller: controller,
                autofocus: true,
                decoration: const InputDecoration(
                  labelText: 'Task title',
                  border: OutlineInputBorder(),
                ),
                onSubmitted: (_) {
                  Navigator.of(sheetContext).pop(controller.text.trim());
                },
              ),
              const SizedBox(height: 12),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  TextButton(
                    onPressed: () => Navigator.of(sheetContext).pop(),
                    child: const Text('Cancel'),
                  ),
                  const SizedBox(width: 8),
                  ElevatedButton(
                    onPressed: () =>
                        Navigator.of(sheetContext).pop(controller.text.trim()),
                    child: const Text('Add'),
                  ),
                ],
              ),
            ],
          ),
        );
      },
    );
    if (!mounted) return;
    if (taskTitle != null && taskTitle.isNotEmpty) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Task created: $taskTitle')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(_titles[_currentIndex])),
      body: _currentIndex == 0
          ? _HomeTasksPageContent(
              isLoading: _isLoading,
              error: _error,
              tasks: _tasks,
              onRefresh: _fetchTasks,
            )
          : Center(child: _pages[_currentIndex]),
      floatingActionButton: FloatingActionButton(
        onPressed: _openCreateTask,
        child: const Icon(Icons.add),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _currentIndex,
        onDestinationSelected: (index) {
          setState(() {
            _currentIndex = index;
          });
        },
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.home_outlined),
            selectedIcon: Icon(Icons.home),
            label: 'Home',
          ),
          NavigationDestination(
            icon: Icon(Icons.search_outlined),
            selectedIcon: Icon(Icons.search),
            label: 'Search',
          ),
          NavigationDestination(
            icon: Icon(Icons.notifications_outlined),
            selectedIcon: Icon(Icons.notifications),
            label: 'Alerts',
          ),
          NavigationDestination(
            icon: Icon(Icons.settings_outlined),
            selectedIcon: Icon(Icons.settings),
            label: 'Settings',
          ),
        ],
      ),
    );
  }
}

class _PlaceholderPage extends StatelessWidget {
  final String title;
  const _PlaceholderPage({required this.title});

  @override
  Widget build(BuildContext context) {
    return Text(title, style: Theme.of(context).textTheme.headlineMedium);
  }
}

class _HomeTasksPage extends StatelessWidget {
  const _HomeTasksPage();

  @override
  Widget build(BuildContext context) {
    return const SizedBox.shrink();
  }
}

class _HomeTasksPageContent extends StatelessWidget {
  final bool isLoading;
  final String? error;
  final List<TaskModel> tasks;
  final Future<void> Function() onRefresh;

  const _HomeTasksPageContent({
    required this.isLoading,
    required this.error,
    required this.tasks,
    required this.onRefresh,
  });

  @override
  Widget build(BuildContext context) {
    if (isLoading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (error != null) {
      return Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            'Error loading tasks',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          Text(error!, textAlign: TextAlign.center),
          const SizedBox(height: 12),
          ElevatedButton(onPressed: onRefresh, child: const Text('Retry')),
        ],
      );
    }
    if (tasks.isEmpty) {
      return Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.inbox, size: 48),
          const SizedBox(height: 8),
          const Text('No tasks found'),
          const SizedBox(height: 12),
          ElevatedButton(onPressed: onRefresh, child: const Text('Refresh')),
        ],
      );
    }
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView.separated(
        padding: const EdgeInsets.symmetric(vertical: 8),
        itemCount: tasks.length,
        separatorBuilder: (_, __) => const Divider(height: 1),
        itemBuilder: (context, index) {
          final task = tasks[index];
          return ListTile(
            leading: const Icon(Icons.check_circle_outline),
            title: Text(task.name.isEmpty ? 'Untitled' : task.name),
            subtitle: task.description == null || task.description!.isEmpty
                ? null
                : Text(task.description!),
          );
        },
      ),
    );
  }
}
