import 'package:equatable/equatable.dart';
import '../../../core/models/models.dart';

abstract class ChatState extends Equatable {
  @override
  List<Object?> get props => [];
}

class ChatInitial extends ChatState {}

class ChatLoading extends ChatState {}

class ChatLoaded extends ChatState {
  final List<Conversation> conversations;
  final String? activeConversationId;
  final Map<String, List<Message>> messages;
  final Map<String, List<String>> typingUsers;
  final Set<String> onlineUsers;
  final List<dynamic> searchResults;
  final bool isSearching;

  ChatLoaded({
    this.conversations = const [],
    this.activeConversationId,
    this.messages = const {},
    this.typingUsers = const {},
    this.onlineUsers = const {},
    this.searchResults = const [],
    this.isSearching = false,
  });

  ChatLoaded copyWith({
    List<Conversation>? conversations,
    String? activeConversationId,
    bool clearActiveConversation = false,
    Map<String, List<Message>>? messages,
    Map<String, List<String>>? typingUsers,
    Set<String>? onlineUsers,
    List<dynamic>? searchResults,
    bool? isSearching,
  }) {
    return ChatLoaded(
      conversations: conversations ?? this.conversations,
      activeConversationId: clearActiveConversation ? null : (activeConversationId ?? this.activeConversationId),
      messages: messages ?? this.messages,
      typingUsers: typingUsers ?? this.typingUsers,
      onlineUsers: onlineUsers ?? this.onlineUsers,
      searchResults: searchResults ?? this.searchResults,
      isSearching: isSearching ?? this.isSearching,
    );
  }

  Conversation? get activeConversation {
    if (activeConversationId == null) return null;
    try {
      return conversations.firstWhere((c) => c.id == activeConversationId);
    } catch (_) {
      return null;
    }
  }

  List<Message> get activeMessages => activeConversationId != null ? (messages[activeConversationId!] ?? []) : [];
  List<String> get activeTypingUsers => activeConversationId != null ? (typingUsers[activeConversationId!] ?? []) : [];

  @override
  List<Object?> get props => [conversations, activeConversationId, messages, typingUsers, onlineUsers, searchResults, isSearching];
}

class ChatError extends ChatState {
  final String message;
  ChatError({required this.message});
  @override
  List<Object?> get props => [message];
}
