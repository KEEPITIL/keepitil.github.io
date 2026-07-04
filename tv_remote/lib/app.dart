import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'state/remote_controller.dart';
import 'ui/screens/discovery_screen.dart';

class TvRemoteApp extends StatelessWidget {
  const TvRemoteApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => RemoteController(),
      child: MaterialApp(
        title: 'TV Remote',
        theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(seedColor: Colors.indigo),
          useMaterial3: true,
        ),
        darkTheme: ThemeData(
          colorScheme: ColorScheme.fromSeed(
            seedColor: Colors.indigo,
            brightness: Brightness.dark,
          ),
          useMaterial3: true,
        ),
        home: const DiscoveryScreen(),
      ),
    );
  }
}
