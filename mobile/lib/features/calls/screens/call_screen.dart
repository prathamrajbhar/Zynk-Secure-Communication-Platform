import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/helpers.dart';
import '../bloc/call_bloc.dart';
import '../bloc/call_event.dart';
import '../bloc/call_state.dart';

class CallScreen extends StatelessWidget {
  const CallScreen({super.key});

  String _formatDuration(Duration d) {
    final mins = d.inMinutes.remainder(60).toString().padLeft(2, '0');
    final secs = d.inSeconds.remainder(60).toString().padLeft(2, '0');
    return d.inHours > 0 ? '${d.inHours}:$mins:$secs' : '$mins:$secs';
  }

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<CallBloc, CallState>(
      builder: (context, state) {
        if (state.status == CallStatus.idle) {
          return const SizedBox.shrink();
        }

        final isIncoming = state.status == CallStatus.incoming;
        final isInCall = state.status == CallStatus.inCall;
        final isVideo = state.callType == 'video';

        return Scaffold(
          backgroundColor: const Color(0xFF1A1A2E),
          body: SafeArea(
            child: Stack(
              children: [
                // Background gradient
                Container(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        AppColors.primary.withAlpha(51),
                        const Color(0xFF1A1A2E),
                      ],
                    ),
                  ),
                ),

                // Main content
                Column(
                  children: [
                    const Spacer(),
                    // Avatar
                    CircleAvatar(
                      radius: 56,
                      backgroundColor: AppColors.primary,
                      child: Text(
                        getInitials(state.recipientName ?? 'Unknown'),
                        style: const TextStyle(fontSize: 36, color: Colors.white, fontWeight: FontWeight.bold),
                      ),
                    ),
                    const SizedBox(height: 20),
                    // Name
                    Text(
                      state.recipientName ?? 'Unknown',
                      style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: Colors.white),
                    ),
                    const SizedBox(height: 8),
                    // Status
                    Text(
                      isIncoming
                          ? 'Incoming ${state.callType} call...'
                          : isInCall
                              ? _formatDuration(state.duration)
                              : 'Calling...',
                      style: TextStyle(
                        fontSize: 16,
                        color: isInCall ? AppColors.success : Colors.white70,
                      ),
                    ),
                    const Spacer(),

                    // In-call controls
                    if (isInCall)
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 40),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                          children: [
                            _CallButton(
                              icon: state.isMuted ? Icons.mic_off : Icons.mic,
                              label: state.isMuted ? 'Unmute' : 'Mute',
                              isActive: state.isMuted,
                              onTap: () => context.read<CallBloc>().add(CallToggleMute()),
                            ),
                            if (isVideo)
                              _CallButton(
                                icon: state.isVideoEnabled ? Icons.videocam : Icons.videocam_off,
                                label: state.isVideoEnabled ? 'Camera' : 'Camera Off',
                                isActive: !state.isVideoEnabled,
                                onTap: () => context.read<CallBloc>().add(CallToggleVideo()),
                              ),
                            _CallButton(
                              icon: state.isSpeakerOn ? Icons.volume_up : Icons.volume_down,
                              label: 'Speaker',
                              isActive: state.isSpeakerOn,
                              onTap: () => context.read<CallBloc>().add(CallToggleSpeaker()),
                            ),
                          ],
                        ),
                      ),

                    const SizedBox(height: 40),

                    // Action buttons
                    if (isIncoming)
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                        children: [
                          _ActionButton(
                            icon: Icons.call_end,
                            color: Colors.red,
                            label: 'Decline',
                            onTap: () => context.read<CallBloc>().add(CallDecline()),
                          ),
                          _ActionButton(
                            icon: Icons.call,
                            color: Colors.green,
                            label: 'Accept',
                            onTap: () => context.read<CallBloc>().add(CallAnswer()),
                          ),
                        ],
                      )
                    else
                      _ActionButton(
                        icon: Icons.call_end,
                        color: Colors.red,
                        label: 'End Call',
                        onTap: () => context.read<CallBloc>().add(CallEnd()),
                      ),

                    const SizedBox(height: 48),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _CallButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool isActive;
  final VoidCallback onTap;

  const _CallButton({required this.icon, required this.label, this.isActive = false, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 52,
            height: 52,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: isActive ? Colors.white24 : Colors.white12,
            ),
            child: Icon(icon, color: isActive ? AppColors.primary : Colors.white, size: 24),
          ),
          const SizedBox(height: 8),
          Text(label, style: const TextStyle(color: Colors.white70, fontSize: 11)),
        ],
      ),
    );
  }
}

class _ActionButton extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String label;
  final VoidCallback onTap;

  const _ActionButton({required this.icon, required this.color, required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(shape: BoxShape.circle, color: color),
            child: Icon(icon, color: Colors.white, size: 32),
          ),
          const SizedBox(height: 8),
          Text(label, style: const TextStyle(color: Colors.white, fontSize: 13)),
        ],
      ),
    );
  }
}
