import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../core/theme/app_theme.dart';
import '../../auth/bloc/auth_bloc.dart';
import '../../auth/bloc/auth_event.dart';
import '../../auth/bloc/auth_state.dart';
import 'profile_screen.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: BlocBuilder<AuthBloc, AuthState>(
        builder: (context, state) {
          final user = state is AuthAuthenticated ? state.user : null;
          return ListView(
            children: [
              // Profile header
              if (user != null)
                InkWell(
                  onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ProfileScreen())),
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Row(
                      children: [
                        CircleAvatar(radius: 28, backgroundColor: AppColors.primary, child: Text(user.displayLabel[0].toUpperCase(), style: const TextStyle(fontSize: 22, color: Colors.white, fontWeight: FontWeight.bold))),
                        const SizedBox(width: 16),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(user.displayLabel, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
                              Text('@${user.username}', style: TextStyle(color: Theme.of(context).textTheme.bodySmall?.color)),
                            ],
                          ),
                        ),
                        const Icon(Icons.chevron_right),
                      ],
                    ),
                  ),
                ),
              const Divider(height: 1),

              // Privacy
              _SettingsSection(
                title: 'Privacy & Security',
                children: [
                  _SettingsTile(icon: Icons.lock, title: 'Privacy', subtitle: 'Last seen, profile photo, about', onTap: () {}),
                  _SettingsTile(icon: Icons.security, title: 'Security', subtitle: 'Two-step verification', onTap: () {}),
                  _SettingsTile(icon: Icons.block, title: 'Blocked Users', subtitle: 'Manage blocked contacts', onTap: () {}),
                ],
              ),

              // Notifications
              _SettingsSection(
                title: 'Notifications',
                children: [
                  _SettingsTile(icon: Icons.notifications, title: 'Notifications', subtitle: 'Message, group & call notifications', onTap: () {}),
                ],
              ),

              // Appearance
              _SettingsSection(
                title: 'Appearance',
                children: [
                  _SettingsTile(
                    icon: Icons.dark_mode,
                    title: 'Theme',
                    subtitle: 'Dark mode',
                    trailing: Switch(
                      value: Theme.of(context).brightness == Brightness.dark,
                      onChanged: (_) {
                        // Theme toggle would be handled by a ThemeCubit
                      },
                      activeTrackColor: AppColors.primary,
                    ),
                    onTap: () {},
                  ),
                ],
              ),

              // Devices
              _SettingsSection(
                title: 'Devices',
                children: [
                  _SettingsTile(icon: Icons.devices, title: 'Linked Devices', subtitle: 'Manage your active sessions', onTap: () {}),
                ],
              ),

              // About
              _SettingsSection(
                title: 'About',
                children: [
                  _SettingsTile(icon: Icons.info_outline, title: 'About Zynk', subtitle: 'Version 1.0.0', onTap: () {}),
                  _SettingsTile(icon: Icons.description_outlined, title: 'Terms & Privacy Policy', onTap: () {}),
                ],
              ),

              // Sign out
              Padding(
                padding: const EdgeInsets.all(16),
                child: ElevatedButton.icon(
                  onPressed: () {
                    showDialog(
                      context: context,
                      builder: (ctx) => AlertDialog(
                        title: const Text('Sign Out'),
                        content: const Text('Are you sure you want to sign out?'),
                        actions: [
                          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
                          TextButton(
                            onPressed: () {
                              Navigator.pop(ctx);
                              context.read<AuthBloc>().add(AuthLogoutRequested());
                            },
                            child: const Text('Sign Out', style: TextStyle(color: Colors.red)),
                          ),
                        ],
                      ),
                    );
                  },
                  icon: const Icon(Icons.logout, color: Colors.red),
                  label: const Text('Sign Out', style: TextStyle(color: Colors.red)),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.red.withAlpha(26),
                    elevation: 0,
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _SettingsSection extends StatelessWidget {
  final String title;
  final List<Widget> children;
  const _SettingsSection({required this.title, required this.children});
  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 20, 16, 8),
          child: Text(title, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.primary)),
        ),
        ...children,
      ],
    );
  }
}

class _SettingsTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? subtitle;
  final Widget? trailing;
  final VoidCallback onTap;
  const _SettingsTile({required this.icon, required this.title, this.subtitle, this.trailing, required this.onTap});
  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(icon, color: AppColors.primary),
      title: Text(title),
      subtitle: subtitle != null ? Text(subtitle!, style: TextStyle(fontSize: 12, color: Theme.of(context).textTheme.bodySmall?.color)) : null,
      trailing: trailing ?? const Icon(Icons.chevron_right, size: 20),
      onTap: onTap,
    );
  }
}
