import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:uuid/uuid.dart';
import '../../../core/api/api_client.dart';
import '../../../core/models/user.dart';
import '../../../core/services/socket_service.dart';
import 'auth_event.dart';
import 'auth_state.dart';

class AuthBloc extends Bloc<AuthEvent, AuthState> {
  final ApiClient _apiClient;
  final SocketService _socketService;
  User? _currentUser;

  User? get currentUser => _currentUser;

  AuthBloc({required ApiClient apiClient, required SocketService socketService})
      : _apiClient = apiClient,
        _socketService = socketService,
        super(AuthInitial()) {
    on<AuthCheckRequested>(_onCheckAuth);
    on<AuthLoginRequested>(_onLogin);
    on<AuthRegisterRequested>(_onRegister);
    on<AuthLogoutRequested>(_onLogout);
    on<AuthProfileUpdateRequested>(_onProfileUpdate);
  }

  Future<void> _onCheckAuth(AuthCheckRequested event, Emitter<AuthState> emit) async {
    emit(AuthLoading());
    try {
      final token = await _apiClient.getToken();
      if (token == null) {
        emit(AuthUnauthenticated());
        return;
      }
      final response = await _apiClient.getMe();
      if (response.statusCode == 200) {
        _currentUser = User.fromJson(response.data['user']);
        _socketService.connect(token);
        emit(AuthAuthenticated(user: _currentUser!));
      } else {
        emit(AuthUnauthenticated());
      }
    } catch (_) {
      emit(AuthUnauthenticated());
    }
  }

  Future<void> _onLogin(AuthLoginRequested event, Emitter<AuthState> emit) async {
    emit(AuthLoading());
    try {
      final deviceId = const Uuid().v4();
      final response = await _apiClient.login(event.username, event.password, deviceId);
      if (response.statusCode == 200) {
        await _apiClient.setTokens(
          response.data['session_token'],
          response.data['refresh_token'],
        );
        _currentUser = User.fromJson(response.data['user']);
        _socketService.connect(response.data['session_token']);
        emit(AuthAuthenticated(user: _currentUser!));
      } else {
        emit(AuthError(message: response.data['error'] ?? 'Login failed'));
        emit(AuthUnauthenticated());
      }
    } catch (e) {
      final msg = _extractErrorMessage(e);
      emit(AuthError(message: msg));
      emit(AuthUnauthenticated());
    }
  }

  Future<void> _onRegister(AuthRegisterRequested event, Emitter<AuthState> emit) async {
    emit(AuthLoading());
    try {
      final deviceId = const Uuid().v4();
      final response = await _apiClient.register(event.username, event.email, event.password, deviceId);
      if (response.statusCode == 201) {
        await _apiClient.setTokens(
          response.data['session_token'],
          response.data['refresh_token'],
        );
        _currentUser = User.fromJson(response.data['user']);
        _socketService.connect(response.data['session_token']);
        emit(AuthAuthenticated(user: _currentUser!));
      } else {
        emit(AuthError(message: response.data['error'] ?? 'Registration failed'));
        emit(AuthUnauthenticated());
      }
    } catch (e) {
      final msg = _extractErrorMessage(e);
      emit(AuthError(message: msg));
      emit(AuthUnauthenticated());
    }
  }

  Future<void> _onLogout(AuthLogoutRequested event, Emitter<AuthState> emit) async {
    try {
      await _apiClient.logout();
    } catch (_) {}
    _socketService.disconnect();
    await _apiClient.clearTokens();
    _currentUser = null;
    emit(AuthUnauthenticated());
  }

  Future<void> _onProfileUpdate(AuthProfileUpdateRequested event, Emitter<AuthState> emit) async {
    if (_currentUser == null) return;
    try {
      final data = <String, dynamic>{};
      if (event.displayName != null) data['display_name'] = event.displayName;
      if (event.bio != null) data['bio'] = event.bio;
      final response = await _apiClient.updateProfile(data);
      if (response.statusCode == 200) {
        _currentUser = _currentUser!.copyWith(
          displayName: event.displayName ?? _currentUser!.displayName,
          bio: event.bio ?? _currentUser!.bio,
        );
        emit(AuthAuthenticated(user: _currentUser!));
      }
    } catch (_) {}
  }

  String _extractErrorMessage(dynamic e) {
    if (e is Exception) {
      try {
        final dynamic error = e;
        return error.response?.data?['error']?.toString() ?? 'An error occurred';
      } catch (_) {}
    }
    return 'An error occurred. Please try again.';
  }
}
