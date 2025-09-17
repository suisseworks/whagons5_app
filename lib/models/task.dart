class TaskModel {
  final int id;
  final String name;
  final String? description;

  const TaskModel({required this.id, required this.name, this.description});

  factory TaskModel.fromJson(Map<String, dynamic> json) {
    return TaskModel(
      id: (json['id'] as num).toInt(),
      name: (json['name'] ?? json['title'] ?? '').toString(),
      description: json['description'] as String?,
    );
  }
}
