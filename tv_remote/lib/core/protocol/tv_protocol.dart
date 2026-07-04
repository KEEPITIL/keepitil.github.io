import '../models/connection_status.dart';
import '../models/tv_command.dart';
import '../models/tv_device.dart';
import '../models/tv_input.dart';

/// The single seam every TV brand plugs into.
///
/// Discovery, pairing, connect/disconnect, and command dispatch are defined
/// here in brand-neutral terms. `LgWebosProtocol` is the first implementation;
/// Samsung and Sony will be additional implementations behind this same
/// interface, so the UI and state layers never learn a brand's wire details.
abstract interface class TvProtocol {
  /// Which brand this implementation serves.
  TvBrand get brand;

  /// Discover devices of this brand on the LAN.
  ///
  /// Returns a stream so the UI can render devices as they respond rather than
  /// blocking on a fixed timeout. Caller cancels the subscription to stop.
  Stream<TvDevice> discover({Duration timeout});

  /// Connect to [device] and ensure we are paired.
  ///
  /// If a stored client-key exists it is used for a silent reconnect. Otherwise
  /// the TV shows an on-screen accept prompt ([ConnectionStatus.awaitingUserAccept]);
  /// on acceptance the returned key is persisted for next time.
  ///
  /// Emits status transitions; completes (the future) once
  /// [ConnectionStatus.connected] is reached or throws on failure.
  Future<void> connect(TvDevice device);

  /// Send a brand-agnostic command over the live connection.
  Future<void> sendCommand(TvCommand command, {TvCommandArgs? args});

  /// List the TV's selectable inputs/sources for a picker. Requires an active
  /// connection. Brands that can't enumerate inputs may return an empty list.
  Future<List<TvInput>> listInputs();

  /// Close the connection and release resources.
  Future<void> disconnect();

  /// Broadcast stream of connection-state changes for the UI to observe.
  Stream<ConnectionStatus> get status;

  /// Whether a command can currently be sent.
  bool get isConnected;
}
