import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../core/api/api_client.dart';
import '../../../core/di/injection.dart';
import '../../../core/models/user.dart';
import '../../../core/widgets/avatar_widget.dart';
import '../bloc/chat_bloc.dart';
import '../bloc/chat_event.dart';

class NewChatScreen extends StatefulWidget {
  const NewChatScreen({super.key});

  @override
  State<NewChatScreen> createState() => _NewChatScreenState();
}

class _NewChatScreenState extends State<NewChatScreen> {
  final _searchCtrl = TextEditingController();
  List<User> _searchResults = [];
  bool _isSearching = false;

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _search(String query) async {
    if (query.trim().length < 2) {
      setState(() => _searchResults = []);
      return;
    }
    setState(() => _isSearching = true);
    try {
      final response = await getIt<ApiClient>().searchUsers(query.trim());
      final users = (response.data['users'] as List).map((u) => User.fromJson(u)).toList();
      setState(() { _searchResults = users; _isSearching = false; });
    } catch (_) {
      setState(() => _isSearching = false);
    }
  }

  Future<void> _startChat(User user) async {
    try {
      final api = getIt<ApiClient>();
      final response = await api.sendMessage({
        'recipient_id': user.id,
        'encrypted_content': '👋 Hello!',
        'message_type': 'text',
      });
      final conversationId = response.data['conversation_id'];
      if (mounted) {
        context.read<ChatBloc>().add(ChatLoadConversations());
        context.read<ChatBloc>().add(ChatSelectConversation(conversationId: conversationId));
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Failed to start chat')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('New Chat')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: TextField(
              controller: _searchCtrl,
              decoration: const InputDecoration(
                hintText: 'Search by username...',
                prefixIcon: Icon(Icons.search),
              ),
              onChanged: _search,
              autofocus: true,
            ),
          ),
          if (_isSearching)
            const Padding(
              padding: EdgeInsets.all(24),
              child: CircularProgressIndicator(),
            ),
          Expanded(
            child: _searchResults.isEmpty
                ? Center(
                    child: Text(
                      _searchCtrl.text.isEmpty ? 'Search for users by username' : 'No users found',
                      style: TextStyle(color: Theme.of(context).textTheme.bodySmall?.color),
                    ),
                  )
                : ListView.builder(
                    itemCount: _searchResults.length,
                    itemBuilder: (context, index) {
                      final user = _searchResults[index];
                      return ListTile(
                        leading: AvatarWidget(name: user.displayLabel, size: 44),
                        title: Text(user.displayLabel, style: const TextStyle(fontWeight: FontWeight.w600)),
                        subtitle: Text('@${user.username}', style: TextStyle(color: Theme.of(context).textTheme.bodySmall?.color)),
                        onTap: () => _startChat(user),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}
