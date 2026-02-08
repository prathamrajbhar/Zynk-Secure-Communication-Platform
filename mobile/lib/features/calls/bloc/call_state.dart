import 'package:equatable/equatable.dart';

enum CallStatus { idle, ringing, inCall, incoming }

class CallState extends Equatable {
  final CallStatus status;
  final String? callId;
  final String? recipientId;
  final String? recipientName;
  final String? callType; // audio, video
  final bool isMuted;
  final bool isVideoEnabled;
  final bool isSpeakerOn;
  final Duration duration;

  const CallState({
    this.status = CallStatus.idle,
    this.callId,
    this.recipientId,
    this.recipientName,
    this.callType,
    this.isMuted = false,
    this.isVideoEnabled = true,
    this.isSpeakerOn = false,
    this.duration = Duration.zero,
  });

  CallState copyWith({
    CallStatus? status,
    String? callId,
    String? recipientId,
    String? recipientName,
    String? callType,
    bool? isMuted,
    bool? isVideoEnabled,
    bool? isSpeakerOn,
    Duration? duration,
  }) {
    return CallState(
      status: status ?? this.status,
      callId: callId ?? this.callId,
      recipientId: recipientId ?? this.recipientId,
      recipientName: recipientName ?? this.recipientName,
      callType: callType ?? this.callType,
      isMuted: isMuted ?? this.isMuted,
      isVideoEnabled: isVideoEnabled ?? this.isVideoEnabled,
      isSpeakerOn: isSpeakerOn ?? this.isSpeakerOn,
      duration: duration ?? this.duration,
    );
  }

  @override
  List<Object?> get props => [status, callId, recipientId, recipientName, callType, isMuted, isVideoEnabled, isSpeakerOn, duration];
}
