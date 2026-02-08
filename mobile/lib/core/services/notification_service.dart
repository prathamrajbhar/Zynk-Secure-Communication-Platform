import 'package:flutter_local_notifications/flutter_local_notifications.dart';

class NotificationService {
  final FlutterLocalNotificationsPlugin _plugin = FlutterLocalNotificationsPlugin();

  Future<void> initialize() async {
    const androidSettings = AndroidInitializationSettings('@mipmap/ic_launcher');
    const iosSettings = DarwinInitializationSettings(
      requestAlertPermission: true,
      requestBadgePermission: true,
      requestSoundPermission: true,
    );
    const settings = InitializationSettings(android: androidSettings, iOS: iosSettings);
    await _plugin.initialize(settings, onDidReceiveNotificationResponse: _onNotificationTap);
  }

  void _onNotificationTap(NotificationResponse response) {
    // Handle notification tap - navigate to conversation
  }

  Future<void> showMessageNotification({
    required String title,
    required String body,
    String? conversationId,
  }) async {
    const androidDetails = AndroidNotificationDetails(
      'messages', 'Messages',
      channelDescription: 'Message notifications',
      importance: Importance.high,
      priority: Priority.high,
      showWhen: true,
    );
    const iosDetails = DarwinNotificationDetails(presentAlert: true, presentBadge: true, presentSound: true);
    const details = NotificationDetails(android: androidDetails, iOS: iosDetails);
    await _plugin.show(
      DateTime.now().millisecondsSinceEpoch.remainder(100000),
      title, body, details,
      payload: conversationId,
    );
  }

  Future<void> showCallNotification({required String callerName, required String callType}) async {
    const androidDetails = AndroidNotificationDetails(
      'calls', 'Calls',
      channelDescription: 'Call notifications',
      importance: Importance.max,
      priority: Priority.max,
      fullScreenIntent: true,
    );
    const details = NotificationDetails(android: androidDetails);
    await _plugin.show(0, 'Incoming $callType call', callerName, details);
  }

  Future<void> cancelAll() async {
    await _plugin.cancelAll();
  }
}
