import 'package:equatable/equatable.dart';

class Conversation extends Equatable {
  final String id;
  final String type; // one_to_one, group
  final String updatedAt;
  final String? lastReadAt;
  final int unreadCount;
  final String? lastMessage;
  final String? lastMessageAt;
  final String? lastMessageSenderId;
  final OtherUser? otherUser;
  final GroupInfo? groupInfo;

  const Conversation({
    required this.id,
    required this.type,
    required this.updatedAt,
    this.lastReadAt,
    this.unreadCount = 0,
    this.lastMessage,
    this.lastMessageAt,
    this.lastMessageSenderId,
    this.otherUser,
    this.groupInfo,
  });

  factory Conversation.fromJson(Map<String, dynamic> json) {
    return Conversation(
      id: json['id'] ?? json['conversation_id'] ?? '',
      type: json['type'] ?? 'one_to_one',
      updatedAt: json['updated_at'] ?? DateTime.now().toIso8601String(),
      lastReadAt: json['last_read_at'],
      unreadCount: json['unread_count'] ?? 0,
      lastMessage: json['last_message'],
      lastMessageAt: json['last_message_at'],
      lastMessageSenderId: json['last_message_sender_id'],
      otherUser: json['other_user'] != null ? OtherUser.fromJson(json['other_user']) : null,
      groupInfo: json['group_info'] != null ? GroupInfo.fromJson(json['group_info']) : null,
    );
  }

  String get displayName {
    if (type == 'one_to_one') {
      return otherUser?.displayName ?? otherUser?.username ?? 'Unknown';
    }
    return groupInfo?.name ?? 'Group';
  }

  Conversation copyWith({int? unreadCount, String? lastMessage, String? lastMessageAt}) {
    return Conversation(
      id: id, type: type, updatedAt: updatedAt, lastReadAt: lastReadAt,
      unreadCount: unreadCount ?? this.unreadCount,
      lastMessage: lastMessage ?? this.lastMessage,
      lastMessageAt: lastMessageAt ?? this.lastMessageAt,
      lastMessageSenderId: lastMessageSenderId,
      otherUser: otherUser, groupInfo: groupInfo,
    );
  }

  @override
  List<Object?> get props => [id, type, updatedAt, unreadCount, lastMessage, lastMessageAt];
}

class OtherUser extends Equatable {
  final String userId;
  final String username;
  final String? displayName;
  final String? avatarUrl;
  final bool isOnline;

  const OtherUser({
    required this.userId,
    required this.username,
    this.displayName,
    this.avatarUrl,
    this.isOnline = false,
  });

  factory OtherUser.fromJson(Map<String, dynamic> json) {
    return OtherUser(
      userId: json['user_id'] ?? '',
      username: json['username'] ?? '',
      displayName: json['display_name'],
      avatarUrl: json['avatar_url'],
      isOnline: json['is_online'] ?? false,
    );
  }

  @override
  List<Object?> get props => [userId, username, displayName, avatarUrl, isOnline];
}

class GroupInfo extends Equatable {
  final String groupId;
  final String name;
  final String? description;
  final String? avatarUrl;
  final int memberCount;

  const GroupInfo({
    required this.groupId,
    required this.name,
    this.description,
    this.avatarUrl,
    this.memberCount = 0,
  });

  factory GroupInfo.fromJson(Map<String, dynamic> json) {
    return GroupInfo(
      groupId: json['group_id'] ?? json['id'] ?? '',
      name: json['name'] ?? '',
      description: json['description'],
      avatarUrl: json['avatar_url'],
      memberCount: json['member_count'] ?? 0,
    );
  }

  @override
  List<Object?> get props => [groupId, name, description, avatarUrl, memberCount];
}
