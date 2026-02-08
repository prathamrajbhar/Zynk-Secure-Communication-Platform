import 'dart:async';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import '../../../core/services/socket_service.dart';
import '../../../core/services/notification_service.dart';
import 'call_event.dart';
import 'call_state.dart';

class CallBloc extends Bloc<CallEvent, CallState> {
  final SocketService _socketService;
  final NotificationService _notificationService;
  
  RTCPeerConnection? _peerConnection;
  MediaStream? _localStream;
  MediaStream? _remoteStream;
  Timer? _durationTimer;

  RTCPeerConnection? get peerConnection => _peerConnection;
  MediaStream? get localStream => _localStream;
  MediaStream? get remoteStream => _remoteStream;

  CallBloc({required SocketService socketService, required NotificationService notificationService})
      : _socketService = socketService,
        _notificationService = notificationService,
        super(const CallState()) {
    on<CallInitiate>(_onInitiate);
    on<CallIncoming>(_onIncoming);
    on<CallAnswer>(_onAnswer);
    on<CallDecline>(_onDecline);
    on<CallEnd>(_onEnd);
    on<CallIceCandidate>(_onIceCandidate);
    on<CallToggleMute>(_onToggleMute);
    on<CallToggleVideo>(_onToggleVideo);
    on<CallToggleSpeaker>(_onToggleSpeaker);
    on<CallEnded>(_onCallEnded);
  }

  void setupSocketListeners() {
    _socketService.on('call:incoming', (data) {
      add(CallIncoming(data: Map<String, dynamic>.from(data)));
    });
    _socketService.on('call:answered', (data) {
      add(CallAnswer(data: Map<String, dynamic>.from(data)));
    });
    _socketService.on('call:ice-candidate', (data) {
      add(CallIceCandidate(data: Map<String, dynamic>.from(data)));
    });
    _socketService.on('call:ended', (data) {
      add(CallEnded(data: Map<String, dynamic>.from(data)));
    });
    _socketService.on('call:declined', (data) {
      add(CallEnded(data: Map<String, dynamic>.from(data)));
    });
  }

  Future<void> _initWebRTC(bool isVideo) async {
    final config = {
      'iceServers': [
        {'urls': 'stun:stun.l.google.com:19302'},
        {'urls': 'stun:stun1.l.google.com:19302'},
      ]
    };

    _peerConnection = await createPeerConnection(config);

    _localStream = await navigator.mediaDevices.getUserMedia({
      'audio': true,
      'video': isVideo ? {'facingMode': 'user', 'width': 640, 'height': 480} : false,
    });

    for (final track in _localStream!.getTracks()) {
      await _peerConnection!.addTrack(track, _localStream!);
    }

    _peerConnection!.onIceCandidate = (candidate) {
      _socketService.emit('call:ice-candidate', {
        'call_id': state.callId,
        'candidate': candidate.toMap(),
      });
    };

    _peerConnection!.onTrack = (event) {
      if (event.streams.isNotEmpty) {
        _remoteStream = event.streams[0];
      }
    };
  }

  Future<void> _onInitiate(CallInitiate event, Emitter<CallState> emit) async {
    try {
      await _initWebRTC(event.callType == 'video');
      final offer = await _peerConnection!.createOffer();
      await _peerConnection!.setLocalDescription(offer);

      _socketService.emit('call:initiate', {
        'recipient_id': event.recipientId,
        'call_type': event.callType,
        'sdp_offer': offer.toMap(),
      });

      emit(state.copyWith(
        status: CallStatus.ringing,
        recipientId: event.recipientId,
        recipientName: event.recipientName,
        callType: event.callType,
        isVideoEnabled: event.callType == 'video',
      ));
    } catch (_) {
      await _cleanup();
    }
  }

  Future<void> _onIncoming(CallIncoming event, Emitter<CallState> emit) async {
    _notificationService.showCallNotification(
      callerName: event.data['caller_name'] ?? 'Unknown',
      callType: event.data['call_type'] ?? 'audio',
    );

    emit(state.copyWith(
      status: CallStatus.incoming,
      callId: event.data['call_id'],
      recipientId: event.data['caller_id'],
      recipientName: event.data['caller_name'],
      callType: event.data['call_type'],
    ));
  }

  Future<void> _onAnswer(CallAnswer event, Emitter<CallState> emit) async {
    try {
      if (state.status == CallStatus.incoming) {
        // We're answering an incoming call
        await _initWebRTC(state.callType == 'video');
        
        if (event.data?['sdp_offer'] != null) {
          await _peerConnection!.setRemoteDescription(
            RTCSessionDescription(event.data!['sdp_offer']['sdp'], event.data!['sdp_offer']['type']),
          );
        }

        final answer = await _peerConnection!.createAnswer();
        await _peerConnection!.setLocalDescription(answer);

        _socketService.emit('call:answer', {
          'call_id': state.callId,
          'sdp_answer': answer.toMap(),
        });
      } else if (state.status == CallStatus.ringing && event.data != null) {
        // Remote party answered our call
        if (event.data!['sdp_answer'] != null) {
          await _peerConnection!.setRemoteDescription(
            RTCSessionDescription(event.data!['sdp_answer']['sdp'], event.data!['sdp_answer']['type']),
          );
        }
      }

      _startDurationTimer(emit);
      emit(state.copyWith(
        status: CallStatus.inCall,
        callId: event.data?['call_id'] ?? state.callId,
      ));
      _notificationService.cancelAll();
    } catch (_) {
      await _cleanup();
      emit(const CallState());
    }
  }

  void _onDecline(CallDecline event, Emitter<CallState> emit) {
    _socketService.emit('call:decline', {'call_id': state.callId});
    _cleanup();
    _notificationService.cancelAll();
    emit(const CallState());
  }

  void _onEnd(CallEnd event, Emitter<CallState> emit) {
    _socketService.emit('call:end', {'call_id': state.callId});
    _cleanup();
    emit(const CallState());
  }

  void _onIceCandidate(CallIceCandidate event, Emitter<CallState> emit) {
    if (_peerConnection != null && event.data['candidate'] != null) {
      _peerConnection!.addCandidate(
        RTCIceCandidate(
          event.data['candidate']['candidate'],
          event.data['candidate']['sdpMid'],
          event.data['candidate']['sdpMLineIndex'],
        ),
      );
    }
  }

  void _onToggleMute(CallToggleMute event, Emitter<CallState> emit) {
    if (_localStream != null) {
      for (final track in _localStream!.getAudioTracks()) {
        track.enabled = state.isMuted;
      }
    }
    emit(state.copyWith(isMuted: !state.isMuted));
  }

  void _onToggleVideo(CallToggleVideo event, Emitter<CallState> emit) {
    if (_localStream != null) {
      for (final track in _localStream!.getVideoTracks()) {
        track.enabled = !state.isVideoEnabled;
      }
    }
    emit(state.copyWith(isVideoEnabled: !state.isVideoEnabled));
  }

  void _onToggleSpeaker(CallToggleSpeaker event, Emitter<CallState> emit) {
    emit(state.copyWith(isSpeakerOn: !state.isSpeakerOn));
  }

  void _onCallEnded(CallEnded event, Emitter<CallState> emit) {
    _cleanup();
    _notificationService.cancelAll();
    emit(const CallState());
  }

  void _startDurationTimer(Emitter<CallState> emit) {
    _durationTimer?.cancel();
    _durationTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (state.status == CallStatus.inCall) {
        emit(state.copyWith(duration: state.duration + const Duration(seconds: 1)));
      }
    });
  }

  Future<void> _cleanup() async {
    _durationTimer?.cancel();
    _localStream?.getTracks().forEach((track) => track.stop());
    _localStream?.dispose();
    _localStream = null;
    _remoteStream = null;
    await _peerConnection?.close();
    _peerConnection = null;
  }

  @override
  Future<void> close() {
    _cleanup();
    return super.close();
  }
}
