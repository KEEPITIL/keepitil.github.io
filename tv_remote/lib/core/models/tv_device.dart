/// A TV discovered on the local network, independent of brand/protocol.
///
/// Concrete protocol implementations (LG/webOS, later Samsung, Sony) produce
/// these from their own discovery mechanism. The UI only ever sees this type.
class TvDevice {
  const TvDevice({
    required this.id,
    required this.name,
    required this.host,
    required this.brand,
    this.modelName,
    this.location,
  });

  /// Stable identifier for this device (e.g. UPnP USN, or host as fallback).
  /// Used as the key under which a per-device pairing key is stored.
  final String id;

  /// Human-friendly name to show in the device list.
  final String name;

  /// IP address (or hostname) on the LAN.
  final String host;

  /// Which brand/protocol handles this device.
  final TvBrand brand;

  /// Optional model string parsed from the device description.
  final String? modelName;

  /// Optional UPnP device-description URL (SSDP LOCATION header).
  final String? location;

  @override
  String toString() => 'TvDevice($brand $name @ $host)';

  @override
  bool operator ==(Object other) =>
      other is TvDevice && other.id == id && other.host == host;

  @override
  int get hashCode => Object.hash(id, host);
}

/// Supported TV brands. Add a value here + a [TvProtocol] implementation to
/// onboard a new brand — nothing in the UI layer needs to change.
enum TvBrand {
  lgWebos('LG (webOS)');

  const TvBrand(this.label);
  final String label;
}
