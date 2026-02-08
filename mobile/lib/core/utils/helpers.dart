import 'package:intl/intl.dart';

String formatMessageTime(String? dateStr) {
  if (dateStr == null) return '';
  final date = DateTime.tryParse(dateStr)?.toLocal();
  if (date == null) return '';
  final now = DateTime.now();
  final diff = now.difference(date);
  if (diff.inMinutes < 1) return 'now';
  if (diff.inHours < 1) return '${diff.inMinutes}m ago';
  if (diff.inDays < 1) return DateFormat.Hm().format(date);
  if (diff.inDays < 7) return DateFormat.E().add_Hm().format(date);
  return DateFormat.MMMd().add_Hm().format(date);
}

String formatConversationTime(String? dateStr) {
  if (dateStr == null) return '';
  final date = DateTime.tryParse(dateStr)?.toLocal();
  if (date == null) return '';
  final now = DateTime.now();
  final diff = now.difference(date);
  if (diff.inDays < 1) return DateFormat.Hm().format(date);
  if (diff.inDays < 2) return 'Yesterday';
  if (diff.inDays < 7) return DateFormat.E().format(date);
  return DateFormat.MMMd().format(date);
}

String getInitials(String name) {
  final parts = name.trim().split(' ');
  if (parts.length >= 2) return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
  return name.isNotEmpty ? name[0].toUpperCase() : '?';
}

String truncateText(String text, int maxLen) {
  if (text.length <= maxLen) return text;
  return '${text.substring(0, maxLen)}...';
}

String formatFileSize(int bytes) {
  if (bytes < 1024) return '$bytes B';
  if (bytes < 1048576) return '${(bytes / 1024).toStringAsFixed(1)} KB';
  return '${(bytes / 1048576).toStringAsFixed(1)} MB';
}
