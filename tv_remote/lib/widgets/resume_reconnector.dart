/// DROP-IN for the canonical wifi-remote tree.
///
/// Wraps a subtree and fires [onResumed] every time the app returns to the
/// foreground. Uses `with WidgetsBindingObserver` (only overriding the
/// lifecycle hook) so it stays robust across Flutter versions that add new
/// observer methods.
///
/// Integration (wrap the app root, or the home screen) — exact guard against
/// the canonical RemoteController: only re-arm when auto-connect is on, we have
/// a last host, and we're not already connected/connecting:
///   ResumeReconnector(
///     onResumed: () {
///       final c = context.read<RemoteController>();
///       final s = c.status;
///       if (c.autoConnectAtStart &&
///           c.lastHost != null &&
///           (s == ConnectionStatus.idle ||
///            s == ConnectionStatus.disconnected ||
///            s == ConnectionStatus.error)) {
///         c.connectOrWake(c.lastHost!);
///       }
///     },
///     child: const HomeScreen(),
///   )
library;

import 'package:flutter/widgets.dart';

class ResumeReconnector extends StatefulWidget {
  const ResumeReconnector({
    super.key,
    required this.child,
    required this.onResumed,
  });

  final Widget child;

  /// Invoked on each transition to [AppLifecycleState.resumed].
  final VoidCallback onResumed;

  @override
  State<ResumeReconnector> createState() => _ResumeReconnectorState();
}

class _ResumeReconnectorState extends State<ResumeReconnector>
    with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      widget.onResumed();
    }
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
