import 'package:flutter_test/flutter_test.dart';
import 'package:tv_remote/protocols/lg_webos/lg_manifest.dart';
import 'package:tv_remote/protocols/lg_webos/ssap_commands.dart';

void main() {
  group('SsapUri', () {
    test('command URIs use the ssap:// scheme', () {
      final uris = [
        SsapUri.volumeUp,
        SsapUri.volumeDown,
        SsapUri.setMute,
        SsapUri.channelUp,
        SsapUri.channelDown,
        SsapUri.switchInput,
        SsapUri.getExternalInputList,
      ];
      for (final uri in uris) {
        expect(uri, startsWith('ssap://'), reason: uri);
      }
    });
  });

  group('buildRegisterPayload', () {
    test('is a PROMPT registration and omits client-key when not paired', () {
      final payload = buildRegisterPayload();
      expect(payload['type'], 'register');
      final inner = payload['payload'] as Map<String, dynamic>;
      expect(inner['pairingType'], 'PROMPT');
      expect(inner.containsKey('client-key'), isFalse);
      expect(inner['manifest'], isA<Map>());
    });

    test('includes client-key for a silent reconnect', () {
      final payload = buildRegisterPayload(clientKey: 'abc123');
      final inner = payload['payload'] as Map<String, dynamic>;
      expect(inner['client-key'], 'abc123');
    });

    test('manifest advertises the audio + channel control permissions', () {
      final inner = buildRegisterPayload()['payload'] as Map<String, dynamic>;
      final manifest = inner['manifest'] as Map<String, dynamic>;
      final permissions = (manifest['permissions'] as List).cast<String>();
      expect(permissions, contains('CONTROL_AUDIO'));
      expect(permissions, contains('CONTROL_INPUT_TV'));
      expect(permissions, contains('READ_INPUT_DEVICE_LIST'));
    });
  });
}
