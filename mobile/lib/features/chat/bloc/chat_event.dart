import 'package:equatable/equatable.dart';

abstract class ChatEvent extends Equatable {
  @override
  List<Object?> get props => [];
}

class ChatLoadConversations extends ChatEvent {}

class ChatSelectConversation extends ChatEvent {
  final String conversationId;
  ChatSelectConversation({required this.conversationId});
  @override
  List<Object?> get props => [conversationId];
}

class ChatClearSelection extends ChatEvent {}

class ChatLoadMessages extends ChatEvent {
  final String conversationId;
  final int offset;
  ChatLoadMessages({required this.conversationId, this.offset = 0});
  @override
  List<Object?> get props => [conversationId, offset];
}

class ChatSendMessage extends ChatEvent {
  final String conversationId;
  final String? recipientId;
  final String content;
  final String messageType;
  final String? replyToId;
  ChatSendMessage({required this.conversationId, this.recipientId, required this.content, this.messageType = 'text', this.replyToId});
  @override
  List<Object?> get props => [conversationId, recipientId, content, messageType, replyToId];
}

class ChatMessageReceived extends ChatEvent {
  final Map<String, dynamic> messageData;
  ChatMessageReceived({required this.messageData});
  @override
  List<Object?> get props => [messageData];
}

class ChatMessageStatusUpdated extends ChatEvent {
  final String messageId;
  final String status;
  ChatMessageStatusUpdated({required this.messageId, required this.status});
  @override
  List<Object?> get props => [messageId, status];
}

class ChatDeleteMessage extends ChatEvent {
  final String messageId;
  final bool forEveryone;
  ChatDeleteMessage({required this.messageId, this.forEveryone = false});
  @override
  List<Object?> get props => [messageId, forEveryone];
}

class ChatTypingStarted extends ChatEvent {
  final String conversationId;
  final String userId;
  ChatTypingStarted({required this.conversationId, required this.userId});
  @override
  List<Object?> get props => [conversationId, userId];
}

class ChatTypingStopped extends ChatEvent {
  final String conversationId;
  final String userId;
  ChatTypingStopped({required this.conversationId, required this.userId});
  @override
  List<Object?> get props => [conversationId, userId];
}

class ChatUserOnlineStatusChanged extends ChatEvent {
  final String userId;
  final bool isOnline;
  ChatUserOnlineStatusChanged({required this.userId, required this.isOnline});
  @override
  List<Object?> get props => [userId, isOnline];
}

class ChatSearchMessages extends ChatEvent {
  final String query;
  final String? conversationId;
  ChatSearchMessages({required this.query, this.conversationId});
  @override
  List<Object?> get props => [query, conversationId];
}

class ChatMarkAllRead extends ChatEvent {
  final String conversationId;
  ChatMarkAllRead({required this.conversationId});
  @override
  List<Object?> get props => [conversationId];
}
