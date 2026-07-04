import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/models/connection_status.dart';
import '../../state/remote_controller.dart';
import 'remote_screen.dart';

/// Lists LG TVs found on the LAN and lets the user pick one to connect/pair.
class DiscoveryScreen extends StatefulWidget {
  const DiscoveryScreen({super.key});

  @override
  State<DiscoveryScreen> createState() => _DiscoveryScreenState();
}

class _DiscoveryScreenState extends State<DiscoveryScreen> {
  @override
  void initState() {
    super.initState();
    // Kick off a scan once the first frame is up (so the local-network
    // permission prompt appears in a user-visible context on iOS).
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<RemoteController>().scan();
    });
  }

  Future<void> _connect(BuildContext context, device) async {
    final controller = context.read<RemoteController>();
    await controller.connect(device);
    if (!context.mounted) return;
    if (controller.status == ConnectionStatus.connected) {
      Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => const RemoteScreen()),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Find your TV'),
        actions: [
          Consumer<RemoteController>(
            builder: (_, c, __) => IconButton(
              icon: c.isScanning
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.refresh),
              onPressed: c.isScanning ? null : () => c.scan(),
            ),
          ),
        ],
      ),
      body: Consumer<RemoteController>(
        builder: (context, c, _) {
          if (c.devices.isEmpty) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.tv_off,
                        size: 64, color: Theme.of(context).disabledColor),
                    const SizedBox(height: 16),
                    Text(
                      c.isScanning
                          ? 'Scanning the local network…'
                          : 'No LG TVs found. Make sure the TV is on and on '
                              'the same Wi-Fi, then tap refresh.',
                      textAlign: TextAlign.center,
                    ),
                    if (c.lastError != null) ...[
                      const SizedBox(height: 12),
                      Text(c.lastError!,
                          style: TextStyle(color: Theme.of(context).colorScheme.error)),
                    ],
                  ],
                ),
              ),
            );
          }

          return ListView.separated(
            itemCount: c.devices.length,
            separatorBuilder: (_, __) => const Divider(height: 1),
            itemBuilder: (context, i) {
              final d = c.devices[i];
              final connecting = c.connectedDevice == d &&
                  c.status != ConnectionStatus.connected &&
                  c.status != ConnectionStatus.error;
              return ListTile(
                leading: const Icon(Icons.tv),
                title: Text(d.name),
                subtitle: Text('${d.brand.label} • ${d.host}'
                    '${_statusSuffix(c, d)}'),
                trailing: connecting
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.chevron_right),
                onTap: () => _connect(context, d),
              );
            },
          );
        },
      ),
    );
  }

  String _statusSuffix(RemoteController c, device) {
    if (c.connectedDevice != device) return '';
    switch (c.status) {
      case ConnectionStatus.awaitingUserAccept:
        return ' • Accept the prompt on your TV';
      case ConnectionStatus.pairing:
        return ' • Pairing…';
      case ConnectionStatus.connecting:
        return ' • Connecting…';
      case ConnectionStatus.error:
        return ' • Failed — tap to retry';
      default:
        return '';
    }
  }
}
