import 'package:equatable/equatable.dart';

class User extends Equatable {
  final String id;
  final String username;
  final String? displayName;
  final String? email;
  final String? phone;
  final String? avatarUrl;
  final String? bio;
  final String? publicKey;
  final bool isOnline;
  final String? lastSeenAt;

  const User({
    required this.id,
    required this.username,
    this.displayName,
    this.email,
    this.phone,
    this.avatarUrl,
    this.bio,
    this.publicKey,
    this.isOnline = false,
    this.lastSeenAt,
  });

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['id'] ?? json['user_id'] ?? '',
      username: json['username'] ?? '',
      displayName: json['display_name'],
      email: json['email'],
      phone: json['phone'],
      avatarUrl: json['avatar_url'],
      bio: json['bio'],
      publicKey: json['public_key'],
      isOnline: json['is_online'] ?? false,
      lastSeenAt: json['last_seen_at'],
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'username': username,
    'display_name': displayName,
    'email': email,
    'phone': phone,
    'avatar_url': avatarUrl,
    'bio': bio,
    'public_key': publicKey,
  };

  User copyWith({
    String? id, String? username, String? displayName,
    String? email, String? phone, String? avatarUrl,
    String? bio, String? publicKey, bool? isOnline, String? lastSeenAt,
  }) {
    return User(
      id: id ?? this.id, username: username ?? this.username,
      displayName: displayName ?? this.displayName, email: email ?? this.email,
      phone: phone ?? this.phone, avatarUrl: avatarUrl ?? this.avatarUrl,
      bio: bio ?? this.bio, publicKey: publicKey ?? this.publicKey,
      isOnline: isOnline ?? this.isOnline, lastSeenAt: lastSeenAt ?? this.lastSeenAt,
    );
  }

  String get displayLabel => displayName ?? username;

  @override
  List<Object?> get props => [id, username, displayName, email, phone, avatarUrl, bio, publicKey, isOnline, lastSeenAt];
}
