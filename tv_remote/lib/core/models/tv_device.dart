/// A TV discovered on the local network, independent of brand/protocol.
///
/// Aligned to the canonical wifi-remote tree: fields {id, name, host, brand}
/// and the 5-brand [TvBrand] enum. Both the TCP-probe and SSDP discovery paths
/// emit this shape; the UI only ever sees this type.
class TvDevice {
  const TvDevice({
    required this.id,
    required this.name,
    required this.host,
    required this.brand,
  });

  /// Stable identifier. Discovery uses the host so a TV found by both the TCP
  /// probe and SSDP dedupes to one entry.
  final String id;

  /// Human-friendly name to show in the device list.
  final String name;

  /// IP address (or hostname) on the LAN.
  final String host;

  /// Which brand/protocol handles this device.
  final TvBrand brand;

  @override
  String toString() => 'TvDevice($brand $name @ $host)';

  @override
  bool operator ==(Object other) =>
      other is TvDevice && other.id == id && other.host == host;

  @override
  int get hashCode => Object.hash(id, host);
}

/// Supported TV brands. `name` (the Dart enum-member name) is the stable id used
/// by [fromName] and by SavedTv.brandName; `label` is the display string.
enum TvBrand {
  lgWebos('LG'),
  roku('Roku'),
  samsungTizen('Samsung'),
  vizioSmartcast('Vizio'),
  sonyBravia('Sony');

  const TvBrand(this.label);
  final String label;

  /// Resolves a brand from its enum-member name (e.g. 'samsungTizen'),
  /// defaulting to [lgWebos] for null/unknown — matches the canonical tree.
  static TvBrand fromName(String? name) => TvBrand.values.firstWhere(
        (b) => b.name == name,
        orElse: () => TvBrand.lgWebos,
      );
}
