/// DROP-IN for the canonical wifi-remote tree (adjust the tv_device.dart import
/// path on integrate).
///
/// SSDP (UPnP) discovery that emits the SAME `TvDevice` shape as the TCP probe,
/// so the two paths merge cleanly. Sends an `ssdp:all` M-SEARCH to
/// 239.255.255.250:1900, dedupes responders by host, infers brand from the SSDP
/// headers, and — when the headers are ambiguous — fetches the LOCATION
/// device-description XML to read <manufacturer>/<friendlyName>/<modelName>.
/// Responders that don't resolve to one of the 5 supported brands are dropped
/// (ssdp:all is noisy — printers, routers, speakers all answer).
///
/// GATING: only call this when both the multicast entitlement is live AND the
/// hosted config enables it — see `ssdpDiscoveryAllowed()` in
/// entitlement_flags.dart. Without the entitlement iOS silently drops the
/// outbound M-SEARCH; TCP-probe discovery stays the always-on fallback.
library;

import 'dart:async';
import 'dart:convert';
import 'dart:io';

import '../core/models/tv_device.dart';

class SsdpDiscovery {
  static const _multicastAddress = '239.255.255.250';
  static const _multicastPort = 1900;

  /// Yields each distinct supported TV as it responds, until [timeout] elapses.
  /// Deduped by host. Matches the TCP-probe signature: `discover({timeout})`.
  Stream<TvDevice> discover({
    Duration timeout = const Duration(seconds: 5),
  }) async* {
    final controller = StreamController<TvDevice>();
    final seenHosts = <String>{};
    final pending = <Future<void>>[];
    RawDatagramSocket? socket;
    Timer? deadline;

    void emit(TvDevice d) {
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
        if (!seenHosts.add(host)) return; // dedupe by host, once

        final headerBrand = _brandFrom([
          headers['server'],
          headers['usn'],
          headers['st'],
          headers['location'],
        ]);

        if (headerBrand != null) {
          emit(TvDevice(
            id: host,
            name: headerBrand.label,
            host: host,
            brand: headerBrand,
          ));
          return;
        }

        // Ambiguous headers — try the description XML (in parallel). If it still
        // doesn't name a supported brand, drop it silently.
        final location = headers['location'];
        if (location == null) return;
        pending.add(
          _resolveViaDescription(location).then((info) {
            if (info.brand == null) return;
            emit(TvDevice(
              id: host,
              name: info.name ?? info.brand!.label,
              host: host,
              brand: info.brand!,
            ));
          }).catchError((_) {/* unreachable host / bad XML → drop */}),
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

  /// Maps header/description strings onto a supported [TvBrand], or null.
  TvBrand? _brandFrom(Iterable<String?> parts) {
    final s = parts.whereType<String>().join(' ').toLowerCase();
    if (s.contains('roku')) return TvBrand.roku;
    if (s.contains('webos') || s.contains('lge') || s.contains('lg electronics')) {
      return TvBrand.lgWebos;
    }
    if (s.contains('samsung') || s.contains('tizen')) return TvBrand.samsungTizen;
    if (s.contains('sony') || s.contains('bravia')) return TvBrand.sonyBravia;
    if (s.contains('vizio') || s.contains('smartcast')) {
      return TvBrand.vizioSmartcast;
    }
    return null;
  }

  Future<({TvBrand? brand, String? name})> _resolveViaDescription(
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
