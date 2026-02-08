import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../core/api/api_client.dart';
import '../../../core/models/models.dart';
import '../../../core/services/socket_service.dart';
import 'chat_event.dart';
import 'chat_state.dart';

class ChatBloc extends Bloc<ChatEvent, ChatState> {
  final ApiClient _apiClient;
  final SocketService _socketService;

  ChatBloc({required ApiClient apiClient, required SocketService socketService})
      : _apiClient = apiClient,
        _socketService = socketService,
        super(ChatInitial()) {
    on<ChatLoadConversations>(_onLoadConversations);
    on<ChatSelectConversation>(_onSelectConversation);
    on<ChatClearSelection>(_onClearSelection);
    on<ChatLoadMessages>(_onLoadMessages);
    on<ChatSendMessage>(_onSendMessage);
    on<ChatMessageReceived>(_onMessageReceived);
    on<ChatMessageStatusUpdated>(_onMessageStatusUpdated);
    on<ChatDeleteMessage>(_onDeleteMessage);
    on<ChatTypingStarted>(_onTypingStarted);
    on<ChatTypingStopped>(_onTypingStopped);
    on<ChatUserOnlineStatusChanged>(_onUserOnlineStatusChanged);
    on<ChatSearchMessages>(_onSearchMessages);
    on<ChatMarkAllRead>(_onMarkAllRead);
  }

  void setupSocketListeners() {
    _socketService.on('message:received', (data) {
      add(ChatMessageReceived(messageData: Map<String, dynamic>.from(data)));
    });
    _socketService.on('message:status', (data) {
      add(ChatMessageStatusUpdated(messageId: data['message_id'], status: data['status']));
    });
    _socketService.on('typing:start', (data) {
      add(ChatTypingStarted(conversationId: data['conversation_id'], userId: data['user_id']));
      Future.delayed(const Duration(seconds: 3), () {
        add(ChatTypingStopped(conversationId: data['conversation_id'], userId: data['user_id']));
      });
    });
    _socketService.on('typing:stop', (data) {
      add(ChatTypingStopped(conversationId: data['conversation_id'], userId: data['user_id']));
    });
    _socketService.on('user:online', (data) {
      add(ChatUserOnlineStatusChanged(userId: data['user_id'], isOnline: true));
    });
    _socketService.on('user:offline', (data) {
      add(ChatUserOnlineStatusChanged(userId: data['user_id'], isOnline: false));
    });
  }

  Future<void> _onLoadConversations(ChatLoadConversations event, Emitter<ChatState> emit) async {
    final currentState = state;
    if (currentState is! ChatLoaded) emit(ChatLoading());
    try {
      final response = await _apiClient.getConversations();
      final conversations = (response.data['conversations'] as List).map((c) => Conversation.fromJson(c)).toList();
      if (currentState is ChatLoaded) {
        emit(currentState.copyWith(conversations: conversations));
      } else {
        emit(ChatLoaded(conversations: conversations));
      }
    } catch (e) {
      emit(ChatError(message: 'Failed to load conversations'));
    }
  }

  Future<void> _onSelectConversation(ChatSelectConversation event, Emitter<ChatState> emit) async {
    final currentState = state;
    if (currentState is ChatLoaded) {
      _socketService.joinConversation(event.conversationId);
      emit(currentState.copyWith(activeConversationId: event.conversationId));
      add(ChatLoadMessages(conversationId: event.conversationId));
      add(ChatMarkAllRead(conversationId: event.conversationId));
    }
  }

  void _onClearSelection(ChatClearSelection event, Emitter<ChatState> emit) {
    final currentState = state;
    if (currentState is ChatLoaded) {
      if (currentState.activeConversationId != null) {
        _socketService.leaveConversation(currentState.activeConversationId!);
      }
      emit(currentState.copyWith(clearActiveConversation: true));
    }
  }

  Future<void> _onLoadMessages(ChatLoadMessages event, Emitter<ChatState> emit) async {
    final currentState = state;
    if (currentState is! ChatLoaded) return;
    try {
      final response = await _apiClient.getMessages(event.conversationId, offset: event.offset);
      final msgs = (response.data['messages'] as List).map((m) => Message.fromJson(m)).toList();
      final newMessages = Map<String, List<Message>>.from(currentState.messages);
      if (event.offset == 0) {
        newMessages[event.conversationId] = msgs;
      } else {
        newMessages[event.conversationId] = [...(newMessages[event.conversationId] ?? []), ...msgs];
      }
      emit(currentState.copyWith(messages: newMessages));
    } catch (_) {}
  }

  void _onSendMessage(ChatSendMessage event, Emitter<ChatState> emit) {
    _socketService.sendMessage(
      conversationId: event.conversationId,
      recipientId: event.recipientId,
      content: event.content,
      messageType: event.messageType,
      replyToId: event.replyToId,
    );
  }

  void _onMessageReceived(ChatMessageReceived event, Emitter<ChatState> emit) {
    final currentState = state;
    if (currentState is! ChatLoaded) return;
    final msg = Message.fromJson(event.messageData);
    final newMessages = Map<String, List<Message>>.from(currentState.messages);
    newMessages[msg.conversationId] = [msg, ...(newMessages[msg.conversationId] ?? [])];

    // Update conversation's last message
    final conversations = currentState.conversations.map((c) {
      if (c.id == msg.conversationId) {
        return c.copyWith(
          lastMessage: msg.encryptedContent,
          lastMessageAt: msg.createdAt,
          unreadCount: c.id == currentState.activeConversationId ? 0 : c.unreadCount + 1,
        );
      }
      return c;
    }).toList();

    // Sort conversations by last message time
    conversations.sort((a, b) => (b.lastMessageAt ?? b.updatedAt).compareTo(a.lastMessageAt ?? a.updatedAt));

    emit(currentState.copyWith(messages: newMessages, conversations: conversations));
  }

  void _onMessageStatusUpdated(ChatMessageStatusUpdated event, Emitter<ChatState> emit) {
    final currentState = state;
    if (currentState is! ChatLoaded) return;
    final newMessages = Map<String, List<Message>>.from(currentState.messages);
    for (final convId in newMessages.keys) {
      newMessages[convId] = newMessages[convId]!.map((m) {
        if (m.id == event.messageId) {
          return Message(
            id: m.id, conversationId: m.conversationId, senderId: m.senderId,
            encryptedContent: m.encryptedContent, messageType: m.messageType,
            metadata: m.metadata, status: event.status, createdAt: m.createdAt,
            editedAt: m.editedAt, senderUsername: m.senderUsername,
            senderDisplayName: m.senderDisplayName, senderAvatarUrl: m.senderAvatarUrl,
          );
        }
        return m;
      }).toList();
    }
    emit(currentState.copyWith(messages: newMessages));
  }

  Future<void> _onDeleteMessage(ChatDeleteMessage event, Emitter<ChatState> emit) async {
    try {
      await _apiClient.deleteMessage(event.messageId, forEveryone: event.forEveryone);
      final currentState = state;
      if (currentState is ChatLoaded && currentState.activeConversationId != null) {
        add(ChatLoadMessages(conversationId: currentState.activeConversationId!));
      }
    } catch (_) {}
  }

  void _onTypingStarted(ChatTypingStarted event, Emitter<ChatState> emit) {
    final currentState = state;
    if (currentState is! ChatLoaded) return;
    final newTyping = Map<String, List<String>>.from(currentState.typingUsers);
    final users = List<String>.from(newTyping[event.conversationId] ?? []);
    if (!users.contains(event.userId)) users.add(event.userId);
    newTyping[event.conversationId] = users;
    emit(currentState.copyWith(typingUsers: newTyping));
  }

  void _onTypingStopped(ChatTypingStopped event, Emitter<ChatState> emit) {
    final currentState = state;
    if (currentState is! ChatLoaded) return;
    final newTyping = Map<String, List<String>>.from(currentState.typingUsers);
    final users = List<String>.from(newTyping[event.conversationId] ?? []);
    users.remove(event.userId);
    newTyping[event.conversationId] = users;
    emit(currentState.copyWith(typingUsers: newTyping));
  }

  void _onUserOnlineStatusChanged(ChatUserOnlineStatusChanged event, Emitter<ChatState> emit) {
    final currentState = state;
    if (currentState is! ChatLoaded) return;
    final newOnline = Set<String>.from(currentState.onlineUsers);
    if (event.isOnline) {
      newOnline.add(event.userId);
    } else {
      newOnline.remove(event.userId);
    }
    emit(currentState.copyWith(onlineUsers: newOnline));
  }

  Future<void> _onSearchMessages(ChatSearchMessages event, Emitter<ChatState> emit) async {
    final currentState = state;
    if (currentState is! ChatLoaded) return;
    if (event.query.trim().length < 2) {
      emit(currentState.copyWith(searchResults: [], isSearching: false));
      return;
    }
    emit(currentState.copyWith(isSearching: true));
    try {
      final data = <String, dynamic>{'query': event.query, 'limit': 20};
      if (event.conversationId != null) data['conversation_id'] = event.conversationId;
      final response = await _apiClient.searchMessages(data);
      emit(currentState.copyWith(searchResults: response.data['results'] ?? [], isSearching: false));
    } catch (_) {
      emit(currentState.copyWith(isSearching: false));
    }
  }

  Future<void> _onMarkAllRead(ChatMarkAllRead event, Emitter<ChatState> emit) async {
    try {
      await _apiClient.markAllRead(event.conversationId);
      final currentState = state;
      if (currentState is ChatLoaded) {
        final conversations = currentState.conversations.map((c) {
          if (c.id == event.conversationId) return c.copyWith(unreadCount: 0);
          return c;
        }).toList();
        emit(currentState.copyWith(conversations: conversations));
      }
    } catch (_) {}
  }
}
