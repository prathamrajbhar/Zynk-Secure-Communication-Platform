import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../../core/models/message.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/helpers.dart';

class MessageBubble extends StatelessWidget {
  final Message message;
  final bool isOwn;
  final bool showAvatar;
  final List<Message> allMessages;
  final VoidCallback onReply;
  final Function(bool forEveryone) onDelete;

  const MessageBubble({
    super.key,
    required this.message,
    required this.isOwn,
    required this.showAvatar,
    required this.allMessages,
    required this.onReply,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    final isFile = message.isFileMessage;
    Map<String, dynamic>? fileData;
    if (isFile) {
      try { fileData = jsonDecode(message.encryptedContent); } catch (_) {}
    }

    // Find replied message
    Message? repliedMessage;
    if (message.replyToId != null) {
      try {
        repliedMessage = allMessages.firstWhere((m) => m.id == message.replyToId);
      } catch (_) {}
    }

    return GestureDetector(
      onLongPress: () => _showContextMenu(context),
      child: Padding(
        padding: EdgeInsets.only(
          left: isOwn ? 48 : 8,
          right: isOwn ? 8 : 48,
          bottom: showAvatar ? 8 : 2,
        ),
        child: Row(
          mainAxisAlignment: isOwn ? MainAxisAlignment.end : MainAxisAlignment.start,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            if (!isOwn && showAvatar)
              Padding(
                padding: const EdgeInsets.only(right: 6),
                child: CircleAvatar(
                  radius: 14,
                  backgroundColor: AppColors.primary,
                  child: Text(
                    getInitials(message.senderDisplayName ?? message.senderUsername ?? '?'),
                    style: const TextStyle(fontSize: 10, color: Colors.white, fontWeight: FontWeight.w600),
                  ),
                ),
              )
            else if (!isOwn)
              const SizedBox(width: 34),
            Flexible(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                decoration: BoxDecoration(
                  color: isOwn ? AppColors.primary : Theme.of(context).colorScheme.surface,
                  borderRadius: BorderRadius.only(
                    topLeft: const Radius.circular(18),
                    topRight: const Radius.circular(18),
                    bottomLeft: Radius.circular(isOwn ? 18 : 4),
                    bottomRight: Radius.circular(isOwn ? 4 : 18),
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Sender name (for group chats)
                    if (!isOwn && showAvatar && message.senderUsername != null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 2),
                        child: Text(
                          message.senderDisplayName ?? message.senderUsername!,
                          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: isOwn ? Colors.white70 : AppColors.primary),
                        ),
                      ),

                    // Reply preview
                    if (repliedMessage != null)
                      Container(
                        margin: const EdgeInsets.only(bottom: 6),
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          border: Border(left: BorderSide(color: isOwn ? Colors.white54 : AppColors.primary, width: 2)),
                          color: isOwn ? Colors.white.withAlpha(26) : AppColors.primary.withAlpha(26),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(repliedMessage.senderDisplayName ?? repliedMessage.senderUsername ?? '', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: isOwn ? Colors.white70 : AppColors.primary)),
                            Text(truncateText(repliedMessage.encryptedContent, 50), style: TextStyle(fontSize: 11, color: isOwn ? Colors.white60 : Theme.of(context).textTheme.bodySmall?.color), maxLines: 1, overflow: TextOverflow.ellipsis),
                          ],
                        ),
                      ),

                    // Content
                    if (isFile && fileData != null)
                      _buildFileContent(context, fileData)
                    else
                      Text(
                        message.encryptedContent,
                        style: TextStyle(fontSize: 14, color: isOwn ? Colors.white : null),
                      ),

                    // Time & status
                    const SizedBox(height: 3),
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (message.editedAt != null)
                          Text('edited ', style: TextStyle(fontSize: 10, color: isOwn ? Colors.white54 : Theme.of(context).textTheme.bodySmall?.color)),
                        Text(
                          formatMessageTime(message.createdAt),
                          style: TextStyle(fontSize: 10, color: isOwn ? Colors.white60 : Theme.of(context).textTheme.bodySmall?.color),
                        ),
                        if (isOwn) ...[
                          const SizedBox(width: 4),
                          Icon(
                            message.status == 'read' ? Icons.done_all : message.status == 'delivered' ? Icons.done_all : Icons.done,
                            size: 14,
                            color: message.status == 'read' ? Colors.blue[200] : Colors.white60,
                          ),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFileContent(BuildContext context, Map<String, dynamic> fileData) {
    final isImage = message.messageType == 'image';
    return Container(
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: isOwn ? Colors.white.withAlpha(26) : Theme.of(context).scaffoldBackgroundColor,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(isImage ? Icons.image : Icons.insert_drive_file, size: 28, color: isOwn ? Colors.white70 : AppColors.primary),
          const SizedBox(width: 8),
          Flexible(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(fileData['filename'] ?? (isImage ? 'Image' : 'File'), style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: isOwn ? Colors.white : null), maxLines: 1, overflow: TextOverflow.ellipsis),
                if (fileData['file_size'] != null) Text(formatFileSize(fileData['file_size']), style: TextStyle(fontSize: 11, color: isOwn ? Colors.white54 : Theme.of(context).textTheme.bodySmall?.color)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  void _showContextMenu(BuildContext context) {
    showModalBottomSheet(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(leading: const Icon(Icons.reply), title: const Text('Reply'), onTap: () { Navigator.pop(ctx); onReply(); }),
            ListTile(leading: const Icon(Icons.copy), title: const Text('Copy'), onTap: () { Clipboard.setData(ClipboardData(text: message.encryptedContent)); Navigator.pop(ctx); ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Copied'))); }),
            if (isOwn) ...[
              const Divider(height: 1),
              ListTile(leading: const Icon(Icons.delete_outline), title: const Text('Delete for me'), onTap: () { Navigator.pop(ctx); onDelete(false); }),
              ListTile(leading: const Icon(Icons.delete, color: Colors.red), title: const Text('Delete for everyone', style: TextStyle(color: Colors.red)), onTap: () { Navigator.pop(ctx); onDelete(true); }),
            ],
          ],
        ),
      ),
    );
  }
}
