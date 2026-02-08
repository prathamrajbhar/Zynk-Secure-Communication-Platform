import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/helpers.dart';
import '../../../core/widgets/avatar_widget.dart';
import '../../auth/bloc/auth_bloc.dart';
import '../../auth/bloc/auth_event.dart';
import '../../auth/bloc/auth_state.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final _displayNameCtrl = TextEditingController();
  final _bioCtrl = TextEditingController();
  bool _isEditing = false;

  @override
  void initState() {
    super.initState();
    final user = context.read<AuthBloc>().currentUser;
    if (user != null) {
      _displayNameCtrl.text = user.displayName ?? '';
      _bioCtrl.text = user.bio ?? '';
    }
  }

  @override
  void dispose() {
    _displayNameCtrl.dispose();
    _bioCtrl.dispose();
    super.dispose();
  }

  void _saveProfile() {
    context.read<AuthBloc>().add(AuthProfileUpdateRequested(
      displayName: _displayNameCtrl.text.trim(),
      bio: _bioCtrl.text.trim(),
    ));
    setState(() => _isEditing = false);
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Profile updated')));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Profile'),
        actions: [
          if (_isEditing)
            TextButton(onPressed: _saveProfile, child: const Text('Save', style: TextStyle(color: AppColors.primary)))
          else
            IconButton(icon: const Icon(Icons.edit), onPressed: () => setState(() => _isEditing = true)),
        ],
      ),
      body: BlocBuilder<AuthBloc, AuthState>(
        builder: (context, state) {
          if (state is! AuthAuthenticated) return const Center(child: CircularProgressIndicator());
          final user = state.user;
          return SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              children: [
                // Avatar
                AvatarWidget(name: user.displayLabel, size: 96, avatarUrl: user.avatarUrl),
                const SizedBox(height: 12),
                Text('@${user.username}', style: TextStyle(color: Theme.of(context).textTheme.bodySmall?.color)),
                const SizedBox(height: 32),

                // Display name
                TextField(
                  controller: _displayNameCtrl,
                  enabled: _isEditing,
                  decoration: const InputDecoration(labelText: 'Display Name', prefixIcon: Icon(Icons.person_outline)),
                ),
                const SizedBox(height: 16),

                // Bio
                TextField(
                  controller: _bioCtrl,
                  enabled: _isEditing,
                  maxLines: 3,
                  decoration: const InputDecoration(labelText: 'Bio', prefixIcon: Icon(Icons.info_outline), alignLabelWithHint: true),
                ),
                const SizedBox(height: 16),

                // Email (read-only)
                TextField(
                  controller: TextEditingController(text: user.email ?? ''),
                  enabled: false,
                  decoration: const InputDecoration(labelText: 'Email', prefixIcon: Icon(Icons.email_outlined)),
                ),
                const SizedBox(height: 32),

                // Info section
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      children: [
                        _InfoRow(icon: Icons.shield, label: 'End-to-end encrypted', value: 'Enabled'),
                        const Divider(height: 24),
                        _InfoRow(icon: Icons.fingerprint, label: 'User ID', value: truncateText(user.id, 12)),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  const _InfoRow({required this.icon, required this.label, required this.value});
  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 20, color: AppColors.primary),
        const SizedBox(width: 12),
        Expanded(child: Text(label, style: const TextStyle(fontSize: 14))),
        Text(value, style: TextStyle(fontSize: 13, color: Theme.of(context).textTheme.bodySmall?.color)),
      ],
    );
  }
}
