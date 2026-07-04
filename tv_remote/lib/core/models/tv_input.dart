/// A selectable TV input/source, brand-agnostic.
///
/// LG/webOS produces these from `getExternalInputList`; other brands map their
/// own source lists onto the same shape so the UI's input picker is reusable.
class TvInput {
  const TvInput({
    required this.id,
    required this.label,
    this.connected,
  });

  /// Wire identifier passed back on switch (LG: e.g. `HDMI_1`, `TV`).
  final String id;

  /// Human-friendly name to show in the picker (e.g. "HDMI 1", "Live TV").
  final String label;

  /// Whether something is plugged into this input, if the TV reports it.
  final bool? connected;

  @override
  String toString() => 'TvInput($id "$label")';
}
