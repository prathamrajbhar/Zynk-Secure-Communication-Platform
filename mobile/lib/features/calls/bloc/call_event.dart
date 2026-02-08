import 'package:equatable/equatable.dart';

abstract class CallEvent extends Equatable {
  @override
  List<Object?> get props => [];
}

class CallInitiate extends CallEvent {
  final String recipientId;
  final String callType; // audio, video
  final String recipientName;
  CallInitiate({required this.recipientId, required this.callType, required this.recipientName});
  @override
  List<Object?> get props => [recipientId, callType, recipientName];
}

class CallIncoming extends CallEvent {
  final Map<String, dynamic> data;
  CallIncoming({required this.data});
  @override
  List<Object?> get props => [data];
}

class CallAnswer extends CallEvent {
  final Map<String, dynamic>? data;
  CallAnswer({this.data});
  @override
  List<Object?> get props => [data];
}

class CallDecline extends CallEvent {}

class CallEnd extends CallEvent {}

class CallIceCandidate extends CallEvent {
  final Map<String, dynamic> data;
  CallIceCandidate({required this.data});
  @override
  List<Object?> get props => [data];
}

class CallToggleMute extends CallEvent {}

class CallToggleVideo extends CallEvent {}

class CallToggleSpeaker extends CallEvent {}

class CallEnded extends CallEvent {
  final Map<String, dynamic>? data;
  CallEnded({this.data});
  @override
  List<Object?> get props => [data];
}
