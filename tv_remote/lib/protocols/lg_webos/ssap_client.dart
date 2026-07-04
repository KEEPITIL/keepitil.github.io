import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:web_socket_channel/io.dart';

import '../../core/models/connection_status.dart';
import 'lg_manifest.dart';

/// Low-level SSAP transport: opens the WebSocket, performs the register/pair
/// handshake, and multiplexes request/response frames by message id.
///
/// Knows nothing about our brand-agnostic command enum — that mapping lives in
/// `LgWebosProtocol`. This class is purely "send an ssap:// uri, get a payload".
class SsapClient {
  SsapClient({required this.host});

  /// LG TV LAN address.
  final String host;

  /// Secure port first (self-signed cert), plaintext as fallback.
  static const _securePort = 3001;
  static const _plainPort = 3000;

  IOWebSocketChannel? _channel;
  StreamSubscription? _sub;
  int _messageId = 0;

  /// Pending request completers keyed by message id.
  final _pending = <String, Completer<Map<String, dynamic>>>{};

  /// Completes when the TV returns a client-key (i.e. pairing accepted).
  Completer<String>? _registration;

  bool get isConnected => _channel != null;

  /// Opens the socket. Tries wss:3001 (accepting LG's self-signed cert) and
  /// falls back to ws:3000. Throws [TvProtocolException] if both fail.
  Future<void> open() async {
    try {
      _channel = await _connectSecure();
    } on Object catch (secureError) {
      try {
        _channel = _connectPlain();
      } on Object catch (plainError) {
        throw TvProtocolException(
          'Could not open SSAP socket to $host on :$_securePort or :$_plainPort',
          cause: '$secureError / $plainError',
        );
      }
    }

    _sub = _channel!.stream.listen(
      _onMessage,
      onError: _onSocketError,
      onDone: _onSocketDone,
      cancelOnError: false,
    );
  }

  /// wss:3001 with a custom HttpClient that accepts LG's self-signed cert.
  Future<IOWebSocketChannel> _connectSecure() async {
    final httpClient = HttpClient(context: SecurityContext(withTrustedRoots: false))
      // LG TVs present a self-signed certificate — trust it explicitly for
      // this host. We intentionally accept any cert here because the socket is
      // on the user's LAN to a device they physically control and pair with.
      ..badCertificateCallback = (X509Certificate cert, String h, int p) => true;

    final ws = await WebSocket.connect(
      'wss://$host:$_securePort',
      customClient: httpClient,
    );
    return IOWebSocketChannel(ws);
  }

  /// ws:3000 plaintext fallback for TVs/firmwares that don't serve wss.
  IOWebSocketChannel _connectPlain() {
    return IOWebSocketChannel.connect(
      Uri.parse('ws://$host:$_plainPort'),
    );
  }

  /// Sends the register frame and resolves with the client-key once the TV
  /// accepts. Pass a stored [clientKey] for a silent reconnect (no prompt).
  ///
  /// [onAwaitingAccept] fires when the TV has acknowledged the request and is
  /// showing its on-screen accept prompt (only during first-time pairing).
  Future<String> register({
    String? clientKey,
    void Function()? onAwaitingAccept,
    Duration timeout = const Duration(seconds: 60),
  }) {
    final completer = Completer<String>();
    _registration = completer;
    _onAwaitingAccept = onAwaitingAccept;

    final payload = buildRegisterPayload(clientKey: clientKey);
    _channel!.sink.add(jsonEncode(payload));

    return completer.future.timeout(
      timeout,
      onTimeout: () {
        _registration = null;
        throw const TvProtocolException(
          'Pairing timed out waiting for the TV prompt to be accepted',
        );
      },
    );
  }

  void Function()? _onAwaitingAccept;

  /// Sends an SSAP request and awaits the matching response payload.
  Future<Map<String, dynamic>> request(
    String uri, {
    Map<String, dynamic>? payload,
  }) {
    if (_channel == null) {
      throw const TvProtocolException('SSAP socket is not open');
    }
    final id = 'req_${_messageId++}';
    final completer = Completer<Map<String, dynamic>>();
    _pending[id] = completer;

    _channel!.sink.add(jsonEncode({
      'type': 'request',
      'id': id,
      'uri': uri,
      if (payload != null) 'payload': payload,
    }));

    return completer.future.timeout(
      const Duration(seconds: 8),
      onTimeout: () {
        _pending.remove(id);
        throw TvProtocolException('SSAP request timed out: $uri');
      },
    );
  }

  void _onMessage(dynamic raw) {
    final Map<String, dynamic> msg;
    try {
      msg = jsonDecode(raw as String) as Map<String, dynamic>;
    } catch (_) {
      return; // ignore non-JSON frames
    }

    final type = msg['type'] as String?;
    final id = msg['id'] as String?;
    final payload = (msg['payload'] as Map?)?.cast<String, dynamic>() ?? const {};

    // --- Registration lifecycle ---
    if (id == 'register_0' || _registration != null && _registration!.isCompleted == false) {
      if (type == 'response' && payload['pairingType'] == 'PROMPT') {
        // TV acknowledged the request and is showing the accept prompt.
        _onAwaitingAccept?.call();
        return;
      }
      if (type == 'registered') {
        final key = payload['client-key'] as String?;
        if (key != null && _registration?.isCompleted == false) {
          _registration!.complete(key);
          _registration = null;
        }
        return;
      }
      if (type == 'error' && _registration?.isCompleted == false) {
        _registration!.completeError(
          TvProtocolException('Pairing rejected: ${msg['error'] ?? payload}'),
        );
        _registration = null;
        return;
      }
    }

    // --- Request/response correlation ---
    if (id != null && _pending.containsKey(id)) {
      final completer = _pending.remove(id)!;
      if (type == 'error') {
        completer.completeError(
          TvProtocolException('SSAP error: ${msg['error'] ?? payload}'),
        );
      } else {
        completer.complete(payload);
      }
    }
  }

  void _onSocketError(Object error, StackTrace st) {
    _failAll(TvProtocolException('SSAP socket error', cause: error));
  }

  void _onSocketDone() {
    _failAll(const TvProtocolException('SSAP socket closed'));
  }

  void _failAll(TvProtocolException error) {
    for (final c in _pending.values) {
      if (!c.isCompleted) c.completeError(error);
    }
    _pending.clear();
    if (_registration?.isCompleted == false) {
      _registration!.completeError(error);
      _registration = null;
    }
  }

  Future<void> close() async {
    await _sub?.cancel();
    await _channel?.sink.close();
    _channel = null;
    _sub = null;
  }
}
