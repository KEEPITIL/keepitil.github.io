import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/models/connection_status.dart';
import '../../core/models/tv_command.dart';
import '../../core/models/tv_input.dart';
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
    final controller = context.read<RemoteController>();
    showModalBottomSheet<void>(
      context: context,
      builder: (_) => ChangeNotifierProvider.value(
        value: controller,
        child: const _InputPickerSheet(),
      ),
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

/// Input picker that fetches the TV's real input list (getExternalInputList via
/// the protocol). Falls back to common fixed inputs if the TV reports none or
/// the query fails, so the button is always useful.
class _InputPickerSheet extends StatefulWidget {
  const _InputPickerSheet();

  @override
  State<_InputPickerSheet> createState() => _InputPickerSheetState();
}

class _InputPickerSheetState extends State<_InputPickerSheet> {
  static const _fallbackInputs = [
    TvInput(id: 'HDMI_1', label: 'HDMI 1'),
    TvInput(id: 'HDMI_2', label: 'HDMI 2'),
    TvInput(id: 'HDMI_3', label: 'HDMI 3'),
    TvInput(id: 'TV', label: 'Live TV'),
  ];

  bool _loading = true;
  List<TvInput> _inputs = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final inputs = await context.read<RemoteController>().listInputs();
    if (!mounted) return;
    setState(() {
      _inputs = inputs.isNotEmpty ? inputs : _fallbackInputs;
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: _loading
          ? const Padding(
              padding: EdgeInsets.all(32),
              child: Center(child: CircularProgressIndicator()),
            )
          : Column(
              mainAxisSize: MainAxisSize.min,
              children: _inputs.map((input) {
                return ListTile(
                  leading: const Icon(Icons.input),
                  title: Text(input.label),
                  trailing: input.connected == true
                      ? const Icon(Icons.check_circle,
                          size: 18, color: Colors.green)
                      : null,
                  onTap: () {
                    context.read<RemoteController>().send(
                          TvCommand.switchInput,
                          args: TvCommandArgs(inputId: input.id),
                        );
                    Navigator.of(context).pop();
                  },
                );
              }).toList(),
            ),
    );
  }
}
