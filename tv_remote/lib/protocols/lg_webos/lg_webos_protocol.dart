import 'dart:async';

import '../../core/models/connection_status.dart';
import '../../core/models/tv_command.dart';
import '../../core/models/tv_device.dart';
import '../../core/models/tv_input.dart';
import '../../core/protocol/tv_protocol.dart';
import '../../services/secure_key_store.dart';
import 'ssap_client.dart';
import 'ssap_commands.dart';
import 'ssdp_discovery.dart';

/// LG/webOS implementation of [TvProtocol].
///
/// Wires together SSDP discovery, the SSAP register/pair handshake, secure
/// client-key storage, and the brand-agnostic-command → ssap:// URI mapping.
class LgWebosProtocol implements TvProtocol {
  LgWebosProtocol({
    SecureKeyStore? keyStore,
    LgSsdpDiscovery? discovery,
  })  : _keyStore = keyStore ?? SecureKeyStore(),
        _discovery = discovery ?? LgSsdpDiscovery();

  final SecureKeyStore _keyStore;
  final LgSsdpDiscovery _discovery;

  SsapClient? _client;
  final _statusController = StreamController<ConnectionStatus>.broadcast();
  ConnectionStatus _status = ConnectionStatus.idle;

  @override
  TvBrand get brand => TvBrand.lgWebos;

  @override
  Stream<ConnectionStatus> get status => _statusController.stream;

  @override
  bool get isConnected =>
      _status == ConnectionStatus.connected && (_client?.isConnected ?? false);

  void _setStatus(ConnectionStatus s) {
    _status = s;
    if (!_statusController.isClosed) _statusController.add(s);
  }

  @override
  Stream<TvDevice> discover({Duration timeout = const Duration(seconds: 5)}) {
    return _discovery.discover(timeout: timeout);
  }

  @override
  Future<void> connect(TvDevice device) async {
    await disconnect(); // ensure a clean slate

    _setStatus(ConnectionStatus.connecting);
    final client = SsapClient(host: device.host);
    _client = client;

    try {
      await client.open();
      _setStatus(ConnectionStatus.pairing);

      final storedKey = await _keyStore.readClientKey(device.id);

      final newKey = await client.register(
        clientKey: storedKey,
        onAwaitingAccept: () => _setStatus(ConnectionStatus.awaitingUserAccept),
      );

      // Persist (or refresh) the key for silent reconnection next time.
      if (newKey != storedKey) {
        await _keyStore.writeClientKey(device.id, newKey);
      }

      _setStatus(ConnectionStatus.connected);
    } catch (e) {
      _setStatus(ConnectionStatus.error);
      await disconnect();
      rethrow;
    }
  }

  @override
  Future<void> sendCommand(TvCommand command, {TvCommandArgs? args}) async {
    final client = _client;
    if (client == null || !isConnected) {
      throw const TvProtocolException('Not connected to a TV');
    }

    switch (command) {
      case TvCommand.volumeUp:
        await client.request(SsapUri.volumeUp);
      case TvCommand.volumeDown:
        await client.request(SsapUri.volumeDown);
      case TvCommand.muteToggle:
        final mute = args?.mute ?? await _currentMuteToggled(client);
        await client.request(SsapUri.setMute, payload: {'mute': mute});
      case TvCommand.channelUp:
        await client.request(SsapUri.channelUp);
      case TvCommand.channelDown:
        await client.request(SsapUri.channelDown);
      case TvCommand.switchInput:
        final inputId = args?.inputId;
        if (inputId == null) {
          throw const TvProtocolException(
            'switchInput requires an inputId (query getExternalInputList first)',
          );
        }
        await client.request(SsapUri.switchInput, payload: {'inputId': inputId});
    }
  }

  /// Reads current mute state and returns its inverse, so a bare "mute" button
  /// toggles rather than always muting.
  Future<bool> _currentMuteToggled(SsapClient client) async {
    try {
      final status = await client.request(SsapUri.getAudioStatus);
      final current = status['mute'] as bool? ?? false;
      return !current;
    } catch (_) {
      return true; // if we can't read state, default to muting
    }
  }

  @override
  Future<List<TvInput>> listInputs() async {
    final client = _client;
    if (client == null || !isConnected) {
      throw const TvProtocolException('Not connected to a TV');
    }
    final payload = await client.request(SsapUri.getExternalInputList);
    final devices = (payload['devices'] as List?) ?? const [];
    return devices.whereType<Map>().map((raw) {
      final d = raw.cast<String, dynamic>();
      final id = d['id']?.toString() ?? d['appId']?.toString() ?? '';
      return TvInput(
        id: id,
        label: d['label']?.toString() ?? id,
        connected: d['connected'] as bool?,
      );
    }).where((input) => input.id.isNotEmpty).toList();
  }

  @override
  Future<void> disconnect() async {
    await _client?.close();
    _client = null;
    if (_status != ConnectionStatus.error) {
      _setStatus(ConnectionStatus.disconnected);
    }
  }

  /// Release the status stream. Call when the protocol instance is discarded.
  Future<void> dispose() async {
    await disconnect();
    await _statusController.close();
  }
}
