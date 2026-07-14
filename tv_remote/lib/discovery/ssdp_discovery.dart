/// DROP-IN for the canonical wifi-remote tree (adjust import paths + map
/// [SsdpBrand] onto your own brand enum on integrate).
///
/// SSDP (UPnP) discovery. Sends an `ssdp:all` M-SEARCH to 239.255.255.250:1900,
/// dedupes responders, infers brand from the SSDP headers, and — when the
/// headers are ambiguous — fetches the LOCATION device-description XML to read
/// <manufacturer>/<friendlyName>/<modelName>.
///
/// GATING: this must only run when [kMulticastEntitlementGranted] is true (see
/// entitlement_flags.dart). Without the multicast entitlement iOS drops the
/// outbound M-SEARCH and you get nothing — keep TCP-probe discovery as the
/// always-on fallback and call this only behind the flag.
library;

import 'dart:async';
import 'dart:convert';
import 'dart:io';

enum SsdpBrand { lg, samsung, sony, vizio, roku, unknown }

class SsdpDevice {
  const SsdpDevice({
    required this.host,
    required this.brand,
    this.location,
    this.friendlyName,
    this.server,
  });

  final String host;
  final SsdpBrand brand;
  final String? location;
  final String? friendlyName;
  final String? server;

  @override
  String toString() => 'SsdpDevice($brand @ $host ${friendlyName ?? ''})';
}

class SsdpDiscovery {
  static const _multicastAddress = '239.255.255.250';
  static const _multicastPort = 1900;

  /// Yields each distinct device as it responds, until [timeout] elapses.
  ///
  /// [resolveBrandFromDescription] fetches the LOCATION XML for responders whose
  /// headers don't name a brand (adds up to ~2s per unknown device, in
  /// parallel). Turn it off for a header-only fast pass.
  Stream<SsdpDevice> discover({
    Duration timeout = const Duration(seconds: 5),
    bool resolveBrandFromDescription = true,
  }) async* {
    final controller = StreamController<SsdpDevice>();
    final seen = <String>{};
    final pending = <Future<void>>[];
    RawDatagramSocket? socket;
    Timer? deadline;

    void emit(SsdpDevice d) {
      if (!controller.isClosed) controller.add(d);
    }

    try {
      socket = await RawDatagramSocket.bind(
        InternetAddress.anyIPv4,
        0,
        reuseAddress: true,
      );
      final sock = socket..broadcastEnabled = true;

      sock.listen((event) {
        if (event != RawSocketEvent.read) return;
        final datagram = sock.receive();
        if (datagram == null) return;

        final headers = _parseHeaders(String.fromCharCodes(datagram.data));
        final host = datagram.address.address;
        final key = headers['usn'] ?? headers['location'] ?? host;
        if (!seen.add(key)) return; // dedupe repeat announcements

        final headerBrand = _brandFrom([
          headers['server'],
          headers['usn'],
          headers['st'],
          headers['location'],
        ]);
        final location = headers['location'];

        if (headerBrand != SsdpBrand.unknown ||
            !resolveBrandFromDescription ||
            location == null) {
          emit(SsdpDevice(
            host: host,
            brand: headerBrand,
            location: location,
            server: headers['server'],
          ));
          return;
        }

        // Ambiguous header → resolve via the description XML (in parallel).
        pending.add(
          _resolveViaDescription(location).then((info) {
            emit(SsdpDevice(
              host: host,
              brand: info.brand,
              location: location,
              friendlyName: info.name,
              server: headers['server'],
            ));
          }).catchError((_) {
            emit(SsdpDevice(
              host: host,
              brand: SsdpBrand.unknown,
              location: location,
              server: headers['server'],
            ));
          }),
        );
      });

      // UDP is lossy — send the M-SEARCH a couple of times.
      final message = _buildMSearch('ssdp:all', mx: 3);
      for (var i = 0; i < 2; i++) {
        sock.send(
          message.codeUnits,
          InternetAddress(_multicastAddress),
          _multicastPort,
        );
      }

      deadline = Timer(timeout, () async {
        // Let in-flight description fetches finish before closing.
        await Future.wait(pending).catchError((_) => const <void>[]);
        if (!controller.isClosed) await controller.close();
      });

      yield* controller.stream;
    } finally {
      deadline?.cancel();
      socket?.close();
      if (!controller.isClosed) await controller.close();
    }
  }

  String _buildMSearch(String searchTarget, {required int mx}) {
    // CRLF line endings are mandatory per the SSDP spec.
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
      headers[line.substring(0, idx).trim().toLowerCase()] =
          line.substring(idx + 1).trim();
    }
    return headers;
  }

  /// Maps any collection of header/description strings onto a brand.
  SsdpBrand _brandFrom(Iterable<String?> parts) {
    final s = parts.whereType<String>().join(' ').toLowerCase();
    if (s.contains('roku')) return SsdpBrand.roku;
    if (s.contains('webos') || s.contains('lge') || s.contains('lg electronics')) {
      return SsdpBrand.lg;
    }
    if (s.contains('samsung') || s.contains('tizen')) return SsdpBrand.samsung;
    if (s.contains('sony') || s.contains('bravia')) return SsdpBrand.sony;
    if (s.contains('vizio') || s.contains('smartcast')) return SsdpBrand.vizio;
    return SsdpBrand.unknown;
  }

  Future<({SsdpBrand brand, String? name})> _resolveViaDescription(
    String location,
  ) async {
    final client = HttpClient()..connectionTimeout = const Duration(seconds: 2);
    try {
      final request = await client
          .getUrl(Uri.parse(location))
          .timeout(const Duration(seconds: 2));
      final response = await request.close().timeout(const Duration(seconds: 2));
      final body = await response
          .transform(const Utf8Decoder(allowMalformed: true))
          .join()
          .timeout(const Duration(seconds: 2));

      final manufacturer = _xmlTag(body, 'manufacturer');
      final name = _xmlTag(body, 'friendlyName');
      final model = _xmlTag(body, 'modelName');
      return (brand: _brandFrom([manufacturer, name, model]), name: name);
    } finally {
      client.close(force: true);
    }
  }

  String? _xmlTag(String xml, String tag) {
    final match = RegExp(
      '<$tag>(.*?)</$tag>',
      caseSensitive: false,
      dotAll: true,
    ).firstMatch(xml);
    return match?.group(1)?.trim();
  }
}
