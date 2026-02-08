import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../core/models/models.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/helpers.dart';
import '../../../core/widgets/avatar_widget.dart';
import '../../../core/services/socket_service.dart';
import '../../../core/di/injection.dart';
import '../../auth/bloc/auth_bloc.dart';
import '../../calls/bloc/call_bloc.dart';
import '../../calls/bloc/call_event.dart';
import '../bloc/chat_bloc.dart';
import '../bloc/chat_event.dart';
import '../bloc/chat_state.dart';
import '../widgets/message_bubble.dart';
import '../widgets/message_input.dart';

class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final ScrollController _scrollCtrl = ScrollController();
  Message? _replyTo;
  Timer? _typingTimer;

  @override
  void initState() {
    super.initState();
    _scrollCtrl.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollCtrl.dispose();
    _typingTimer?.cancel();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollCtrl.position.pixels >= _scrollCtrl.position.maxScrollExtent - 200) {
      // Load more messages
      final chatState = context.read<ChatBloc>().state;
      if (chatState is ChatLoaded && chatState.activeConversationId != null) {
        final currentMessages = chatState.activeMessages;
        context.read<ChatBloc>().add(ChatLoadMessages(
          conversationId: chatState.activeConversationId!,
          offset: currentMessages.length,
        ));
      }
    }
  }

  void _handleSend(String content, {String messageType = 'text'}) {
    final chatState = context.read<ChatBloc>().state;
    if (chatState is! ChatLoaded || chatState.activeConversationId == null) return;
    final conv = chatState.activeConversation;
    context.read<ChatBloc>().add(ChatSendMessage(
      conversationId: chatState.activeConversationId!,
      recipientId: conv?.type == 'one_to_one' ? conv?.otherUser?.userId : null,
      content: content,
      messageType: messageType,
      replyToId: _replyTo?.id,
    ));
    setState(() => _replyTo = null);
  }

  void _handleTyping(String conversationId) {
    final socket = getIt<SocketService>();
    socket.startTyping(conversationId);
    _typingTimer?.cancel();
    _typingTimer = Timer(const Duration(seconds: 2), () {
      socket.stopTyping(conversationId);
    });
  }

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<ChatBloc, ChatState>(
      builder: (context, state) {
        if (state is! ChatLoaded || state.activeConversationId == null) {
          return const Scaffold(body: Center(child: CircularProgressIndicator()));
        }

        final conv = state.activeConversation;
        final messages = state.activeMessages;
        final typingUsers = state.activeTypingUsers;
        final isOnline = conv?.otherUser != null && state.onlineUsers.contains(conv?.otherUser?.userId);
        final currentUserId = context.read<AuthBloc>().currentUser?.id ?? '';

        return Scaffold(
          appBar: AppBar(
            leadingWidth: 30,
            title: InkWell(
              onTap: () {
                // Navigate to contact/group info
              },
              child: Row(
                children: [
                  AvatarWidget(
                    name: conv?.displayName ?? '',
                    size: 36,
                    isOnline: isOnline,
                    isGroup: conv?.type == 'group',
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(conv?.displayName ?? '', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600), maxLines: 1, overflow: TextOverflow.ellipsis),
                        Text(
                          typingUsers.isNotEmpty ? 'typing...' : isOnline ? 'online' : 'offline',
                          style: TextStyle(
                            fontSize: 12,
                            color: typingUsers.isNotEmpty ? AppColors.primary : isOnline ? AppColors.success : null,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            actions: [
              if (conv?.type == 'one_to_one') ...[
                IconButton(
                  icon: const Icon(Icons.call),
                  onPressed: () {
                    context.read<CallBloc>().add(CallInitiate(
                      recipientId: conv!.otherUser!.userId,
                      callType: 'audio',
                      recipientName: conv.displayName,
                    ));
                  },
                ),
                IconButton(
                  icon: const Icon(Icons.videocam),
                  onPressed: () {
                    context.read<CallBloc>().add(CallInitiate(
                      recipientId: conv!.otherUser!.userId,
                      callType: 'video',
                      recipientName: conv.displayName,
                    ));
                  },
                ),
              ],
            ],
          ),
          body: Column(
            children: [
              // E2E banner
              Container(
                padding: const EdgeInsets.symmetric(vertical: 6),
                color: Theme.of(context).colorScheme.surface,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.lock, size: 12, color: Theme.of(context).textTheme.bodySmall?.color),
                    const SizedBox(width: 4),
                    Text('Messages are end-to-end encrypted', style: TextStyle(fontSize: 11, color: Theme.of(context).textTheme.bodySmall?.color)),
                  ],
                ),
              ),

              // Messages
              Expanded(
                child: messages.isEmpty
                    ? Center(
                        child: Text('No messages yet.\nSend a message to start the conversation.',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: Theme.of(context).textTheme.bodySmall?.color),
                        ),
                      )
                    : ListView.builder(
                        controller: _scrollCtrl,
                        reverse: true,
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                        itemCount: messages.length + (typingUsers.isNotEmpty ? 1 : 0),
                        itemBuilder: (context, index) {
                          if (typingUsers.isNotEmpty && index == 0) {
                            return _buildTypingIndicator();
                          }
                          final msgIndex = typingUsers.isNotEmpty ? index - 1 : index;
                          final msg = messages[msgIndex];
                          final isOwn = msg.senderId == currentUserId;
                          final showAvatar = msgIndex == messages.length - 1 || messages[msgIndex + 1].senderId != msg.senderId;

                          return MessageBubble(
                            message: msg,
                            isOwn: isOwn,
                            showAvatar: showAvatar,
                            allMessages: messages,
                            onReply: () => setState(() => _replyTo = msg),
                            onDelete: (forEveryone) {
                              context.read<ChatBloc>().add(ChatDeleteMessage(messageId: msg.id, forEveryone: forEveryone));
                            },
                          );
                        },
                      ),
              ),

              // Reply banner
              if (_replyTo != null)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.surface,
                    border: Border(top: BorderSide(color: Theme.of(context).dividerColor)),
                  ),
                  child: Row(
                    children: [
                      Icon(Icons.reply, size: 18, color: AppColors.primary),
                      const SizedBox(width: 8),
                      Container(width: 2, height: 32, color: AppColors.primary),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(_replyTo!.senderDisplayName ?? _replyTo!.senderUsername ?? '', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.primary)),
                            Text(truncateText(_replyTo!.encryptedContent, 60), style: TextStyle(fontSize: 12, color: Theme.of(context).textTheme.bodySmall?.color), maxLines: 1, overflow: TextOverflow.ellipsis),
                          ],
                        ),
                      ),
                      IconButton(icon: const Icon(Icons.close, size: 18), onPressed: () => setState(() => _replyTo = null)),
                    ],
                  ),
                ),

              // Input
              MessageInput(
                onSend: _handleSend,
                onTyping: () => _handleTyping(state.activeConversationId!),
                conversationId: state.activeConversationId!,
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildTypingIndicator() {
    return Padding(
      padding: const EdgeInsets.only(left: 16, bottom: 8),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surface,
              borderRadius: BorderRadius.circular(20),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: List.generate(3, (i) => _BouncingDot(delay: i * 150)),
            ),
          ),
        ],
      ),
    );
  }
}

class _BouncingDot extends StatefulWidget {
  final int delay;
  const _BouncingDot({required this.delay});
  @override
  State<_BouncingDot> createState() => _BouncingDotState();
}

class _BouncingDotState extends State<_BouncingDot> with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _animation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(vsync: this, duration: const Duration(milliseconds: 600));
    _animation = Tween<double>(begin: 0, end: -6).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeInOut),
    );
    Future.delayed(Duration(milliseconds: widget.delay), () {
      if (mounted) _controller.repeat(reverse: true);
    });
  }

  @override
  void dispose() { _controller.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _animation,
      builder: (_, __) => Container(
        margin: const EdgeInsets.symmetric(horizontal: 2),
        child: Transform.translate(
          offset: Offset(0, _animation.value),
          child: Container(
            width: 8, height: 8,
            decoration: BoxDecoration(
              color: Theme.of(context).textTheme.bodySmall?.color,
              shape: BoxShape.circle,
            ),
          ),
        ),
      ),
    );
  }
}
