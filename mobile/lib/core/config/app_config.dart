class AppConfig {
  static const String appName = 'Zynk';
  static const String apiBaseUrl = 'http://10.0.2.2:8000/api/v1'; // Android emulator
  static const String wsBaseUrl = 'http://10.0.2.2:8000';
  static const int apiTimeout = 30000;
  static const int maxFileSize = 100 * 1024 * 1024; // 100MB
  static const List<String> allowedImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  static const List<String> allowedFileTypes = [
    'application/pdf', 'text/plain', 'application/zip',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];
}
