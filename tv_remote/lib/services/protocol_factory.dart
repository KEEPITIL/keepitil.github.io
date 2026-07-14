import '../core/models/tv_device.dart';
import '../core/protocol/tv_protocol.dart';
import '../protocols/lg_webos/lg_webos_protocol.dart';

/// Maps a [TvBrand] to its [TvProtocol] implementation.
///
/// This is the one place new brands are registered. The state layer asks the
/// factory for a protocol by brand and never references a concrete class, so
/// adding Samsung/Sony is: implement [TvProtocol], add a case here.
class ProtocolFactory {
  /// Protocols used for discovery — one per supported brand. Phase 1 ships LG.
  static List<TvProtocol> discoveryProtocols() => [
        LgWebosProtocol(),
      ];

  /// A fresh protocol instance for connecting to a specific device.
  static TvProtocol forDevice(TvDevice device) {
    switch (device.brand) {
      case TvBrand.lgWebos:
        return LgWebosProtocol();
      case TvBrand.roku:
      case TvBrand.samsungTizen:
      case TvBrand.vizioSmartcast:
      case TvBrand.sonyBravia:
        throw UnsupportedError(
          '${device.brand.label} is not implemented in this foundation branch; '
          'it ships in the canonical multi-brand tree.',
        );
    }
  }
}
