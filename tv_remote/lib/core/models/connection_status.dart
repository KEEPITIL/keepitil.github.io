/// Lifecycle of a connection to a TV, surfaced to the UI.
enum ConnectionStatus {
  idle,

  /// Socket is opening.
  connecting,

  /// Socket is open but the TV has not yet accepted pairing.
  pairing,

  /// Waiting for the user to press "accept" on the TV's on-screen prompt.
  awaitingUserAccept,

  /// Paired and ready to send commands.
  connected,

  disconnected,
  error,
}

/// A discovery event or connection failure, ready to display.
class TvProtocolException implements Exception {
  const TvProtocolException(this.message, {this.cause});
  final String message;
  final Object? cause;

  @override
  String toString() =>
      'TvProtocolException: $message${cause != null ? ' ($cause)' : ''}';
}
