import 'dart:io';
import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../../../core/api/api_client.dart';
import '../../../core/di/injection.dart';
import '../../../core/theme/app_theme.dart';

class MessageInput extends StatefulWidget {
  final Function(String content, {String messageType}) onSend;
  final VoidCallback onTyping;
  final String conversationId;

  const MessageInput({super.key, required this.onSend, required this.onTyping, required this.conversationId});

  @override
  State<MessageInput> createState() => _MessageInputState();
}

class _MessageInputState extends State<MessageInput> {
  final _controller = TextEditingController();
  bool _isUploading = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _send() {
    final text = _controller.text.trim();
    if (text.isEmpty) return;
    widget.onSend(text);
    _controller.clear();
  }

  Future<void> _pickImage() async {
    final picker = ImagePicker();
    final image = await picker.pickImage(source: ImageSource.gallery, maxWidth: 1920, maxHeight: 1920, imageQuality: 80);
    if (image != null) await _uploadFile(File(image.path), 'image');
  }

  Future<void> _pickFile() async {
    final result = await FilePicker.platform.pickFiles(allowMultiple: false);
    if (result != null && result.files.isNotEmpty) {
      final file = File(result.files.first.path!);
      await _uploadFile(file, 'file');
    }
  }

  Future<void> _uploadFile(File file, String messageType) async {
    setState(() => _isUploading = true);
    try {
      final api = getIt<ApiClient>();
      final formData = FormData.fromMap({
        'file': await MultipartFile.fromFile(file.path, filename: file.path.split('/').last),
        'conversation_id': widget.conversationId,
      });
      final response = await api.uploadFile(formData);
      final content = '{"file_id":"${response.data['file_id']}","filename":"${response.data['filename']}","file_size":${response.data['file_size']},"mime_type":"${response.data['mime_type']}"}';
      widget.onSend(content, messageType: messageType);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Failed to upload file')));
      }
    }
    setState(() => _isUploading = false);
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        border: Border(top: BorderSide(color: Theme.of(context).dividerColor)),
      ),
      child: SafeArea(
        top: false,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            // Attachment
            IconButton(
              icon: _isUploading
                  ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.attach_file, size: 22),
              onPressed: _isUploading ? null : () => _showAttachMenu(),
            ),

            // Emoji button
            IconButton(
              icon: const Icon(Icons.emoji_emotions_outlined, size: 22),
              onPressed: () {
                // Could show emoji picker
              },
            ),

            // TextField
            Expanded(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxHeight: 120),
                child: TextField(
                  controller: _controller,
                  maxLines: null,
                  textInputAction: TextInputAction.newline,
                  decoration: InputDecoration(
                    hintText: 'Type a message...',
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: BorderSide.none),
                    filled: true,
                    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                  ),
                  onChanged: (_) => widget.onTyping(),
                ),
              ),
            ),

            const SizedBox(width: 4),

            // Send
            ValueListenableBuilder(
              valueListenable: _controller,
              builder: (context, value, child) {
                return IconButton(
                  icon: Icon(Icons.send, color: value.text.trim().isNotEmpty ? AppColors.primary : null),
                  onPressed: value.text.trim().isNotEmpty ? _send : null,
                );
              },
            ),
          ],
        ),
      ),
    );
  }

  void _showAttachMenu() {
    showModalBottomSheet(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.image, color: AppColors.primary),
              title: const Text('Photo'),
              onTap: () { Navigator.pop(ctx); _pickImage(); },
            ),
            ListTile(
              leading: const Icon(Icons.insert_drive_file, color: AppColors.primary),
              title: const Text('File'),
              onTap: () { Navigator.pop(ctx); _pickFile(); },
            ),
          ],
        ),
      ),
    );
  }
}
