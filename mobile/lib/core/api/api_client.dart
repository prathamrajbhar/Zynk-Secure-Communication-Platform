import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../config/app_config.dart';

class ApiClient {
  late final Dio dio;
  final FlutterSecureStorage _secureStorage = const FlutterSecureStorage();

  ApiClient() {
    dio = Dio(BaseOptions(
      baseUrl: AppConfig.apiBaseUrl,
      connectTimeout: Duration(milliseconds: AppConfig.apiTimeout),
      receiveTimeout: Duration(milliseconds: AppConfig.apiTimeout),
      headers: {'Content-Type': 'application/json'},
    ));

    dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        final token = await _secureStorage.read(key: 'session_token');
        if (token != null) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        return handler.next(options);
      },
      onError: (error, handler) async {
        if (error.response?.statusCode == 401) {
          final refreshed = await _refreshToken();
          if (refreshed) {
            final token = await _secureStorage.read(key: 'session_token');
            error.requestOptions.headers['Authorization'] = 'Bearer $token';
            final response = await dio.fetch(error.requestOptions);
            return handler.resolve(response);
          }
        }
        return handler.next(error);
      },
    ));
  }

  Future<bool> _refreshToken() async {
    try {
      final refreshToken = await _secureStorage.read(key: 'refresh_token');
      if (refreshToken == null) return false;

      final response = await Dio(BaseOptions(baseUrl: AppConfig.apiBaseUrl)).post(
        '/auth/refresh',
        data: {'refresh_token': refreshToken},
      );

      if (response.statusCode == 200) {
        await _secureStorage.write(key: 'session_token', value: response.data['session_token']);
        await _secureStorage.write(key: 'refresh_token', value: response.data['refresh_token']);
        return true;
      }
    } catch (_) {}
    return false;
  }

  Future<void> setTokens(String sessionToken, String refreshToken) async {
    await _secureStorage.write(key: 'session_token', value: sessionToken);
    await _secureStorage.write(key: 'refresh_token', value: refreshToken);
  }

  Future<void> clearTokens() async {
    await _secureStorage.delete(key: 'session_token');
    await _secureStorage.delete(key: 'refresh_token');
  }

  Future<String?> getToken() async {
    return _secureStorage.read(key: 'session_token');
  }

  // Auth
  Future<Response> login(String username, String password, String deviceId) =>
      dio.post('/auth/login', data: {'username': username, 'password': password, 'device_id': deviceId, 'device_name': 'Mobile App', 'device_type': 'mobile'});

  Future<Response> register(String username, String email, String password, String deviceId) =>
      dio.post('/auth/register', data: {'username': username, 'email': email, 'password': password, 'device_id': deviceId, 'device_name': 'Mobile App', 'device_type': 'mobile'});

  Future<Response> getMe() => dio.get('/auth/me');

  Future<Response> logout() => dio.post('/auth/logout');

  // Users
  Future<Response> searchUsers(String query) => dio.get('/users/search', queryParameters: {'q': query});
  Future<Response> getUser(String userId) => dio.get('/users/$userId');
  Future<Response> updateProfile(Map<String, dynamic> data) => dio.put('/users/profile', data: data);
  Future<Response> getContacts() => dio.get('/users/contacts');
  Future<Response> addContact(String contactUserId) => dio.post('/users/contacts', data: {'contact_user_id': contactUserId});
  Future<Response> blockUser(String contactId) => dio.put('/users/contacts/$contactId/block');
  Future<Response> unblockUser(String contactId) => dio.put('/users/contacts/$contactId/unblock');
  Future<Response> getBlockedContacts() => dio.get('/users/contacts/blocked');

  // Conversations
  Future<Response> getConversations() => dio.get('/messages/conversations');
  Future<Response> getMessages(String conversationId, {int limit = 50, int offset = 0}) =>
      dio.get('/messages/conversations/$conversationId', queryParameters: {'limit': limit, 'offset': offset});
  Future<Response> sendMessage(Map<String, dynamic> data) => dio.post('/messages/send', data: data);
  Future<Response> deleteMessage(String messageId, {bool forEveryone = false}) =>
      dio.delete('/messages/$messageId', queryParameters: {'for_everyone': forEveryone});
  Future<Response> editMessage(String messageId, String content) =>
      dio.put('/messages/$messageId', data: {'encrypted_content': content});
  Future<Response> searchMessages(Map<String, dynamic> data) => dio.post('/messages/search', data: data);
  Future<Response> markAllRead(String conversationId) => dio.put('/messages/conversations/$conversationId/read-all');

  // Groups
  Future<Response> createGroup(Map<String, dynamic> data) => dio.post('/groups', data: data);
  Future<Response> getGroups() => dio.get('/groups/my-groups');
  Future<Response> getGroup(String groupId) => dio.get('/groups/$groupId');
  Future<Response> updateGroup(String groupId, Map<String, dynamic> data) => dio.put('/groups/$groupId', data: data);
  Future<Response> addGroupMember(String groupId, String userId) =>
      dio.post('/groups/$groupId/members', data: {'user_id': userId});
  Future<Response> removeGroupMember(String groupId, String userId) => dio.delete('/groups/$groupId/members/$userId');

  // Calls
  Future<Response> initiateCall(Map<String, dynamic> data) => dio.post('/calls/initiate', data: data);
  Future<Response> answerCall(String callId, Map<String, dynamic> data) => dio.post('/calls/$callId/answer', data: data);
  Future<Response> endCall(String callId) => dio.post('/calls/$callId/end');
  Future<Response> declineCall(String callId) => dio.post('/calls/$callId/decline');
  Future<Response> getCallHistory() => dio.get('/calls/history');

  // Files
  Future<Response> uploadFile(FormData formData) =>
      dio.post('/files/upload', data: formData, options: Options(headers: {'Content-Type': 'multipart/form-data'}));
  Future<Response> downloadFile(String fileId) =>
      dio.get('/files/$fileId/download', options: Options(responseType: ResponseType.bytes));
  Future<Response> getFileMetadata(String fileId) => dio.get('/files/$fileId');
}
