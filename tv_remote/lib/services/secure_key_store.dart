import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Persists per-device pairing secrets (the webOS `client-key`) in the OS
/// secure enclave — Keychain on iOS, Keystore-backed storage on Android — so we
/// can reconnect silently without re-triggering the on-screen accept prompt.
class SecureKeyStore {
  SecureKeyStore([FlutterSecureStorage? storage])
      : _storage = storage ??
            const FlutterSecureStorage(
              aOptions: AndroidOptions(encryptedSharedPreferences: true),
              iOptions: IOSOptions(
                accessibility: KeychainAccessibility.first_unlock,
              ),
            );

  final FlutterSecureStorage _storage;

  static String _key(String deviceId) => 'client_key::$deviceId';

  Future<String?> readClientKey(String deviceId) {
    return _storage.read(key: _key(deviceId));
  }

  Future<void> writeClientKey(String deviceId, String clientKey) {
    return _storage.write(key: _key(deviceId), value: clientKey);
  }

  Future<void> deleteClientKey(String deviceId) {
    return _storage.delete(key: _key(deviceId));
  }
}
