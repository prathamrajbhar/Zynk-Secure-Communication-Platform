import 'package:equatable/equatable.dart';

class Message extends Equatable {
  final String id;
  final String conversationId;
  final String senderId;
  final String encryptedContent;
  final String messageType; // text, image, file, audio, video
  final Map<String, dynamic>? metadata;
  final String status; // sent, delivered, read
  final String createdAt;
  final String? editedAt;
  final String? senderUsername;
  final String? senderDisplayName;
  final String? senderAvatarUrl;
  final String? replyToId;

  const Message({
    required this.id,
    required this.conversationId,
    required this.senderId,
    required this.encryptedContent,
    this.messageType = 'text',
    this.metadata,
    this.status = 'sent',
    required this.createdAt,
    this.editedAt,
    this.senderUsername,
    this.senderDisplayName,
    this.senderAvatarUrl,
    this.replyToId,
  });

  factory Message.fromJson(Map<String, dynamic> json) {
    return Message(
      id: json['id'] ?? json['message_id'] ?? '',
      conversationId: json['conversation_id'] ?? '',
      senderId: json['sender_id'] ?? '',
      encryptedContent: json['encrypted_content'] ?? json['content'] ?? '',
      messageType: json['message_type'] ?? 'text',
      metadata: json['metadata'],
      status: json['status'] ?? 'sent',
      createdAt: json['created_at'] ?? DateTime.now().toIso8601String(),
      editedAt: json['edited_at'],
      senderUsername: json['sender_username'],
      senderDisplayName: json['sender_display_name'],
      senderAvatarUrl: json['sender_avatar_url'],
      replyToId: json['reply_to_id'] ?? json['metadata']?['reply_to_id'],
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'conversation_id': conversationId,
    'sender_id': senderId,
    'encrypted_content': encryptedContent,
    'message_type': messageType,
    'metadata': metadata,
    'status': status,
    'created_at': createdAt,
    'edited_at': editedAt,
  };

  bool get isFileMessage => messageType == 'file' || messageType == 'image';

  @override
  List<Object?> get props => [id, conversationId, senderId, encryptedContent, messageType, status, createdAt, editedAt];
}
