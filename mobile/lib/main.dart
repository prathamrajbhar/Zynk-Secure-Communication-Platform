import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'core/api/api_client.dart';
import 'core/di/injection.dart';
import 'core/services/notification_service.dart';
import 'core/services/socket_service.dart';
import 'core/theme/app_theme.dart';
import 'features/auth/bloc/auth_bloc.dart';
import 'features/auth/bloc/auth_event.dart';
import 'features/auth/bloc/auth_state.dart';
import 'features/auth/screens/login_screen.dart';
import 'features/auth/screens/register_screen.dart';
import 'features/calls/bloc/call_bloc.dart';
import 'features/calls/bloc/call_state.dart';
import 'features/calls/screens/call_screen.dart';
import 'features/chat/bloc/chat_bloc.dart';
import 'features/chat/screens/conversation_list_screen.dart';
import 'features/chat/screens/new_chat_screen.dart';
import 'features/settings/screens/settings_screen.dart';
import 'features/settings/screens/profile_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await setupDependencies();
  await getIt<NotificationService>().initialize();
  runApp(const ZynkApp());
}

class ZynkApp extends StatelessWidget {
  const ZynkApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiBlocProvider(
      providers: [
        BlocProvider(
          create: (_) => AuthBloc(
            apiClient: getIt<ApiClient>(),
            socketService: getIt<SocketService>(),
          )..add(AuthCheckRequested()),
        ),
        BlocProvider(
          create: (_) => ChatBloc(
            apiClient: getIt<ApiClient>(),
            socketService: getIt<SocketService>(),
          ),
        ),
        BlocProvider(
          create: (_) => CallBloc(
            socketService: getIt<SocketService>(),
            notificationService: getIt<NotificationService>(),
          ),
        ),
      ],
      child: MaterialApp(
        title: 'Zynk',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.lightTheme,
        darkTheme: AppTheme.darkTheme,
        themeMode: ThemeMode.dark,
        home: const AuthGate(),
        routes: {
          '/login': (_) => const LoginScreen(),
          '/register': (_) => const RegisterScreen(),
          '/settings': (_) => const SettingsScreen(),
          '/profile': (_) => const ProfileScreen(),
          '/new-chat': (_) => const NewChatScreen(),
        },
      ),
    );
  }
}

class AuthGate extends StatelessWidget {
  const AuthGate({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocConsumer<AuthBloc, AuthState>(
      listener: (context, state) {
        if (state is AuthAuthenticated) {
          context.read<ChatBloc>().setupSocketListeners();
          context.read<CallBloc>().setupSocketListeners();
        }
      },
      builder: (context, state) {
        if (state is AuthLoading || state is AuthInitial) {
          return Scaffold(
            body: Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.shield, size: 72, color: AppColors.primary),
                  const SizedBox(height: 16),
                  const Text('Zynk', style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 24),
                  const CircularProgressIndicator(),
                ],
              ),
            ),
          );
        }

        if (state is AuthAuthenticated) {
          return BlocBuilder<CallBloc, CallState>(
            builder: (context, callState) {
              if (callState.status != CallStatus.idle) {
                return const CallScreen();
              }
              return const ConversationListScreen();
            },
          );
        }

        return const LoginScreen();
      },
    );
  }
}