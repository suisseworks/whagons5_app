import 'dart:convert';
import 'package:http/http.dart' as http;

class ApiClient {
  final String baseUrl;
  final String? authToken;

  const ApiClient({required this.baseUrl, this.authToken});

  Map<String, String> _headers() => {
    'Content-Type': 'application/json',
    if (authToken != null) 'Authorization': 'Bearer $authToken',
  };

  Future<List<Map<String, dynamic>>> getTasks({
    int page = 1,
    int perPage = 20,
  }) async {
    final uri = Uri.parse('$baseUrl/api/tasks?page=$page&per_page=$perPage');
    final res = await http.get(uri, headers: _headers());
    if (res.statusCode >= 200 && res.statusCode < 300) {
      final decoded = json.decode(res.body) as Map<String, dynamic>;
      final data = decoded['data'];
      if (data is List) {
        return data.cast<Map<String, dynamic>>();
      }
      // Some endpoints may return plain arrays
      if (decoded is List) {
        return (decoded as List).cast<Map<String, dynamic>>();
      }
      return const [];
    }
    throw Exception('Failed to fetch tasks: ${res.statusCode}');
  }
}
