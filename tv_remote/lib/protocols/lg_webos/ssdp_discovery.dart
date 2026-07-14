import 'dart:async';
import 'dart:io';

import '../../core/models/tv_device.dart';

/// SSDP (UPnP) discovery for LG/webOS TVs.
///
/// Sends an M-SEARCH datagram to the multicast group 239.255.255.250:1900 and
/// listens for unicast responses. LG TVs answer the webOS second-screen search
/// target; we also accept any response whose SERVER/USN headers look like LG or
/// whose device-description advertises webOS.
///
/// Named `LgSsdpDiscovery` to avoid clashing with the brand-agnostic
/// `SsdpDiscovery` under lib/discovery/ (the cross-brand drop-in). This LG-only
/// variant is what `LgWebosProtocol.discover` uses in this foundation branch.
class LgSsdpDiscovery {
  static const _multicastAddress = '239.255.255.250';
  static const _multicastPort = 1900;

  /// Search targets to probe. The first is LG-specific; `ssdp:all` is a wide
  /// net so we still find TVs that don't answer the LG-specific ST.
  static const _searchTargets = <String>[
    'urn:lge-com:service:webos-second-screen:1',
    'ssdp:all',
  ];

  /// Yields each distinct LG device as it responds, until [timeout] elapses.
  Stream<TvDevice> discover({
    Duration timeout = const Duration(seconds: 5),
  }) async* {
    final controller = StreamController<TvDevice>();
    final seen = <String>{};
    RawDatagramSocket? socket;
    Timer? deadline;

    try {
      socket = await RawDatagramSocket.bind(
        InternetAddress.anyIPv4,
        0,
        reuseAddress: true,
      );
      socket.broadcastEnabled = true;

      final sock = socket;
      sock.listen((event) {
        if (event != RawSocketEvent.read) return;
        final datagram = sock.receive();
        if (datagram == null) return;

        final response = String.fromCharCodes(datagram.data);
        final headers = _parseHeaders(response);
        if (!_looksLikeLg(headers)) return;

        final host = datagram.address.address;
        final usn = headers['usn'] ?? host;
        if (!seen.add(usn)) return; // dedupe repeat announcements

        controller.add(TvDevice(
          id: usn,
          name: _deviceName(headers) ?? 'LG webOS TV',
          host: host,
          brand: TvBrand.lgWebos,
        ));
      });

      // Fire an M-SEARCH for each search target.
      for (final st in _searchTargets) {
        final message = _buildMSearch(st, mx: 3);
        sock.send(
          message.codeUnits,
          InternetAddress(_multicastAddress),
          _multicastPort,
        );
      }

      deadline = Timer(timeout, () {
        if (!controller.isClosed) controller.close();
      });

      yield* controller.stream;
    } finally {
      deadline?.cancel();
      socket?.close();
      if (!controller.isClosed) await controller.close();
    }
  }

  String _buildMSearch(String searchTarget, {required int mx}) {
    // CRLF line endings are required by the SSDP spec.
    return 'M-SEARCH * HTTP/1.1\r\n'
        'HOST: $_multicastAddress:$_multicastPort\r\n'
        'MAN: "ssdp:discover"\r\n'
        'MX: $mx\r\n'
        'ST: $searchTarget\r\n'
        '\r\n';
  }

  Map<String, String> _parseHeaders(String response) {
    final headers = <String, String>{};
    for (final line in response.split('\r\n')) {
      final idx = line.indexOf(':');
      if (idx <= 0) continue;
      final key = line.substring(0, idx).trim().toLowerCase();
      final value = line.substring(idx + 1).trim();
      headers[key] = value;
    }
    return headers;
  }

  bool _looksLikeLg(Map<String, String> headers) {
    final haystack = [
      headers['server'],
      headers['usn'],
      headers['st'],
      headers['location'],
    ].whereType<String>().join(' ').toLowerCase();
    return haystack.contains('lge') ||
        haystack.contains('webos') ||
        haystack.contains('lg ') ||
        haystack.contains('second-screen');
  }

  String? _deviceName(Map<String, String> headers) {
    // SSDP headers rarely carry a friendly name; the LOCATION XML has it. For
    // Phase 1 we keep discovery light and let the user identify by IP; the
    // description fetch can be added later if multiple LG TVs coexist.
    return headers['server'];
  }
}
