/// Brand-agnostic remote commands.
///
/// The UI dispatches these; each [TvProtocol] implementation maps them onto its
/// own wire format (for LG/webOS, an `ssap://` URI). Keeping this enum free of
/// any LG-specific detail is what lets a second brand reuse the UI unchanged.
enum TvCommand {
  volumeUp,
  volumeDown,
  muteToggle,
  channelUp,
  channelDown,

  /// Cycle to / open the input picker. Some brands take a target input id via
  /// [TvCommandArgs.inputId]; others just step through inputs.
  switchInput,
}

/// Optional arguments for a command (e.g. which input to switch to).
class TvCommandArgs {
  const TvCommandArgs({this.inputId, this.mute});

  final String? inputId;
  final bool? mute;
}
