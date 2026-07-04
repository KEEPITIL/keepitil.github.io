import 'package:flutter/material.dart';

/// A large, tappable remote-control button. Bare-bones for Phase 1; the full
/// remote UI comes in a later phase.
class RemoteButton extends StatelessWidget {
  const RemoteButton({
    super.key,
    required this.icon,
    required this.label,
    required this.onPressed,
  });

  final IconData icon;
  final String label;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return ElevatedButton(
      onPressed: onPressed,
      style: ElevatedButton.styleFrom(
        padding: const EdgeInsets.symmetric(vertical: 20),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
        ),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 28),
          const SizedBox(height: 6),
          Text(label),
        ],
      ),
    );
  }
}
