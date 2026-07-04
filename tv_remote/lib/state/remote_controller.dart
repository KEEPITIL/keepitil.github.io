import 'dart:async';

import 'package:flutter/foundation.dart';

import '../core/models/connection_status.dart';
import '../core/models/tv_command.dart';
import '../core/models/tv_device.dart';
import '../core/models/tv_input.dart';
import '../core/protocol/tv_protocol.dart';
import '../services/protocol_factory.dart';

/// Application state for the remote. The UI observes this; it never touches a
/// protocol implementation directly. All brand specifics stay behind
/// [TvProtocol].
class RemoteController extends ChangeNotifier {
  final List<TvDevice> devices = [];
  bool isScanning = false;

  TvDevice? connectedDevice;
  ConnectionStatus status = ConnectionStatus.idle;
  String? lastError;

  TvProtocol? _activeProtocol;
  StreamSubscription<TvDevice>? _discoverySub;
  StreamSubscription<ConnectionStatus>? _statusSub;

  /// Scan the LAN across every supported brand's discovery mechanism.
  Future<void> scan({Duration timeout = const Duration(seconds: 5)}) async {
    await _discoverySub?.cancel();
    devices.clear();
    lastError = null;
    isScanning = true;
    notifyListeners();

    final protocols = ProtocolFactory.discoveryProtocols();
    // Merge each brand's discovery stream into one.
    final merged = StreamGroup.merge(
      protocols.map((p) => p.discover(timeout: timeout)),
    );

    _discoverySub = merged.listen(
      (device) {
        if (!devices.contains(device)) {
          devices.add(device);
          notifyListeners();
        }
      },
      onError: (Object e) {
        lastError = e.toString();
        notifyListeners();
      },
      onDone: () {
        isScanning = false;
        notifyListeners();
      },
    );
  }

  /// Connect to (and pair with, if needed) [device].
  Future<void> connect(TvDevice device) async {
    lastError = null;
    await _teardownConnection();

    final protocol = ProtocolFactory.forDevice(device);
    _activeProtocol = protocol;
    connectedDevice = device;

    _statusSub = protocol.status.listen((s) {
      status = s;
      notifyListeners();
    });

    try {
      await protocol.connect(device);
    } catch (e) {
      lastError = e.toString();
      status = ConnectionStatus.error;
      notifyListeners();
    }
  }

  Future<void> send(TvCommand command, {TvCommandArgs? args}) async {
    final protocol = _activeProtocol;
    if (protocol == null) return;
    try {
      await protocol.sendCommand(command, args: args);
    } catch (e) {
      lastError = e.toString();
      notifyListeners();
    }
  }

  /// Fetch the connected TV's inputs for the picker. Returns an empty list if
  /// not connected or the TV doesn't report inputs.
  Future<List<TvInput>> listInputs() async {
    final protocol = _activeProtocol;
    if (protocol == null || !protocol.isConnected) return const [];
    try {
      return await protocol.listInputs();
    } catch (e) {
      lastError = e.toString();
      notifyListeners();
      return const [];
    }
  }

  Future<void> disconnect() async {
    await _teardownConnection();
    connectedDevice = null;
    status = ConnectionStatus.disconnected;
    notifyListeners();
  }

  Future<void> _teardownConnection() async {
    await _statusSub?.cancel();
    _statusSub = null;
    final protocol = _activeProtocol;
    _activeProtocol = null;
    if (protocol != null) {
      await protocol.disconnect();
    }
  }

  @override
  void dispose() {
    _discoverySub?.cancel();
    _statusSub?.cancel();
    _activeProtocol?.disconnect();
    super.dispose();
  }
}

/// Minimal stream merger so we don't pull in the `async` package just for this.
class StreamGroup {
  static Stream<T> merge<T>(Iterable<Stream<T>> streams) {
    final controller = StreamController<T>();
    final subs = <StreamSubscription<T>>[];
    var open = 0;

    void maybeClose() {
      if (open == 0 && !controller.isClosed) controller.close();
    }

    controller.onCancel = () async {
      for (final s in subs) {
        await s.cancel();
      }
    };

    for (final stream in streams) {
      open++;
      subs.add(stream.listen(
        controller.add,
        onError: controller.addError,
        onDone: () {
          open--;
          maybeClose();
        },
      ));
    }

    if (open == 0) controller.close();
    return controller.stream;
  }
}
