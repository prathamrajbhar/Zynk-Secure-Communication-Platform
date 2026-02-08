import 'package:get_it/get_it.dart';
import '../api/api_client.dart';
import '../services/socket_service.dart';
import '../services/notification_service.dart';

final getIt = GetIt.instance;

Future<void> setupDependencies() async {
  // Core services
  getIt.registerLazySingleton<ApiClient>(() => ApiClient());
  getIt.registerLazySingleton<SocketService>(() => SocketService());
  getIt.registerLazySingleton<NotificationService>(() => NotificationService());
}
