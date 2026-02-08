import 'package:equatable/equatable.dart';

abstract class AuthEvent extends Equatable {
  @override
  List<Object?> get props => [];
}

class AuthLoginRequested extends AuthEvent {
  final String username;
  final String password;

  AuthLoginRequested({required this.username, required this.password});

  @override
  List<Object?> get props => [username, password];
}

class AuthRegisterRequested extends AuthEvent {
  final String username;
  final String email;
  final String password;

  AuthRegisterRequested({required this.username, required this.email, required this.password});

  @override
  List<Object?> get props => [username, email, password];
}

class AuthLogoutRequested extends AuthEvent {}

class AuthCheckRequested extends AuthEvent {}

class AuthProfileUpdateRequested extends AuthEvent {
  final String? displayName;
  final String? bio;

  AuthProfileUpdateRequested({this.displayName, this.bio});

  @override
  List<Object?> get props => [displayName, bio];
}
