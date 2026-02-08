import 'package:socket_io_client/socket_io_client.dart' as IO;
import '../config/app_config.dart';

class SocketService {
  IO.Socket? _socket;
  bool _isConnected = false;

  bool get isConnected => _isConnected;
  IO.Socket? get socket => _socket;

  void connect(String token) {
    _socket = IO.io(
      AppConfig.wsBaseUrl,
      IO.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': token})
          .enableAutoConnect()
          .enableReconnection()
          .setReconnectionDelay(1000)
          .setReconnectionAttempts(10)
          .build(),
    );

    _socket!.onConnect((_) {
      _isConnected = true;
    });

    _socket!.onDisconnect((_) {
      _isConnected = false;
    });

    _socket!.onConnectError((data) {
      _isConnected = false;
    });
  }

  void disconnect() {
    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
    _isConnected = false;
  }

  void emit(String event, dynamic data) {
    _socket?.emit(event, data);
  }

  void on(String event, Function(dynamic) callback) {
    _socket?.on(event, callback);
  }

  void off(String event) {
    _socket?.off(event);
  }

  void sendMessage({
    required String conversationId,
    String? recipientId,
    required String content,
    String messageType = 'text',
    String? replyToId,
  }) {
    emit('message:send', {
      'conversation_id': conversationId,
      'recipient_id': recipientId,
      'encrypted_content': content,
      'message_type': messageType,
      'reply_to_id': replyToId,
    });
  }

  void startTyping(String conversationId) {
    emit('typing:start', {'conversation_id': conversationId});
  }

  void stopTyping(String conversationId) {
    emit('typing:stop', {'conversation_id': conversationId});
  }

  void markAsRead(String messageId, String conversationId) {
    emit('message:read', {'message_id': messageId, 'conversation_id': conversationId});
  }

  void joinConversation(String conversationId) {
    emit('conversation:join', {'conversation_id': conversationId});
  }

  void leaveConversation(String conversationId) {
    emit('conversation:leave', {'conversation_id': conversationId});
  }
}
