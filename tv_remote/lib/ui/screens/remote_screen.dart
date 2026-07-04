import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/models/connection_status.dart';
import '../../core/models/tv_command.dart';
import '../../state/remote_controller.dart';
import '../widgets/remote_button.dart';

/// Bare-bones remote: volume, mute, channel, and an input switch. Full remote
/// layout, theming, ads, and IAP come in later phases.
class RemoteScreen extends StatelessWidget {
  const RemoteScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Consumer<RemoteController>(
          builder: (_, c, __) => Text(c.connectedDevice?.name ?? 'Remote'),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.link_off),
            tooltip: 'Disconnect',
            onPressed: () {
              context.read<RemoteController>().disconnect();
              Navigator.of(context).pop();
            },
          ),
        ],
      ),
      body: Consumer<RemoteController>(
        builder: (context, c, _) {
          final live = c.status == ConnectionStatus.connected;
          void send(TvCommand cmd, {TvCommandArgs? args}) =>
              live ? c.send(cmd, args: args) : null;

          return SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                children: [
                  _ConnectionBanner(status: c.status, error: c.lastError),
                  const SizedBox(height: 16),
                  Expanded(
                    child: GridView.count(
                      crossAxisCount: 2,
                      mainAxisSpacing: 16,
                      crossAxisSpacing: 16,
                      childAspectRatio: 1.4,
                      children: [
                        RemoteButton(
                          icon: Icons.volume_up,
                          label: 'Vol +',
                          onPressed: live ? () => send(TvCommand.volumeUp) : null,
                        ),
                        RemoteButton(
                          icon: Icons.volume_down,
                          label: 'Vol −',
                          onPressed:
                              live ? () => send(TvCommand.volumeDown) : null,
                        ),
                        RemoteButton(
                          icon: Icons.arrow_upward,
                          label: 'Ch +',
                          onPressed: live ? () => send(TvCommand.channelUp) : null,
                        ),
                        RemoteButton(
                          icon: Icons.arrow_downward,
                          label: 'Ch −',
                          onPressed:
                              live ? () => send(TvCommand.channelDown) : null,
                        ),
                        RemoteButton(
                          icon: Icons.volume_off,
                          label: 'Mute',
                          onPressed:
                              live ? () => send(TvCommand.muteToggle) : null,
                        ),
                        RemoteButton(
                          icon: Icons.input,
                          label: 'Input',
                          onPressed: live ? () => _pickInput(context) : null,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  void _pickInput(BuildContext context) {
    // Phase 1 offers the common fixed inputs. A later phase will populate this
    // from the LG protocol's getExternalInputList (already available as
    // LgWebosProtocol.listInputs) so the picker reflects the actual TV.
    showModalBottomSheet<void>(
      context: context,
      builder: (_) => const _InputPickerSheet(),
    );
  }
}

class _ConnectionBanner extends StatelessWidget {
  const _ConnectionBanner({required this.status, this.error});
  final ConnectionStatus status;
  final String? error;

  @override
  Widget build(BuildContext context) {
    final (color, text) = switch (status) {
      ConnectionStatus.connected => (Colors.green, 'Connected'),
      ConnectionStatus.error => (
          Theme.of(context).colorScheme.error,
          error ?? 'Connection error'
        ),
      _ => (Colors.orange, 'Reconnecting…'),
    };
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 12),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          Icon(Icons.circle, size: 10, color: color),
          const SizedBox(width: 8),
          Expanded(child: Text(text)),
        ],
      ),
    );
  }
}

/// Placeholder input picker. Wired to fetch real inputs from the LG protocol in
/// a later phase; the switchInput command already accepts an inputId.
class _InputPickerSheet extends StatelessWidget {
  const _InputPickerSheet();

  static const _commonInputs = {
    'HDMI 1': 'HDMI_1',
    'HDMI 2': 'HDMI_2',
    'HDMI 3': 'HDMI_3',
    'Live TV': 'TV',
  };

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: _commonInputs.entries.map((e) {
          return ListTile(
            leading: const Icon(Icons.input),
            title: Text(e.key),
            onTap: () {
              context.read<RemoteController>().send(
                    TvCommand.switchInput,
                    args: TvCommandArgs(inputId: e.value),
                  );
              Navigator.of(context).pop();
            },
          );
        }).toList(),
      ),
    );
  }
}
