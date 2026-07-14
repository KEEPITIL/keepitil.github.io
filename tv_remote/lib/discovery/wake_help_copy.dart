/// DROP-IN for the canonical wifi-remote tree.
///
/// Per-brand "why won't my TV wake / how to enable Wi-Fi wake" help copy, as
/// pure data so your Settings/help UI renders it however it likes. Look up with
/// [wakeHelpFor] using a lowercase brand id ('lg','samsung','sony','vizio',
/// 'roku'); unknown ids return [genericWakeHelp].
///
/// Wording targets the deep-standby wake-failure case: the setting that keeps
/// the TV's Wi-Fi radio reachable while "off" so a magic packet can reach it.
library;

class WakeHelp {
  const WakeHelp({required this.title, required this.steps});
  final String title;
  final List<String> steps;
}

const WakeHelp genericWakeHelp = WakeHelp(
  title: 'Can’t wake your TV?',
  steps: [
    'Keep the TV plugged in and on the same Wi-Fi as this phone.',
    'In the TV’s network/power settings, enable the option that lets it turn '
        'on from a phone or network (names vary by brand).',
    'Some TVs only wake from light sleep — disable deep power-saving/Eco so the '
        'network stays reachable in standby.',
  ],
);

const Map<String, WakeHelp> _wakeHelp = {
  'lg': WakeHelp(
    title: 'Wake your LG TV over Wi-Fi',
    steps: [
      'On the TV: Settings → General → Devices → External Devices → turn on '
          '“Mobile TV On” (a.k.a. “Turn on via Wi-Fi”).',
      'Also enable “Quick Start+” (Settings → General → Energy Saving, or '
          'Devices) so the TV stays reachable in deep standby.',
      'Keep the TV plugged in and on the same Wi-Fi.',
    ],
  ),
  'samsung': WakeHelp(
    title: 'Wake your Samsung TV',
    steps: [
      'On the TV: Settings → General → Network → Expert Settings → turn on '
          '“Power On with Mobile”.',
      'Keep the TV plugged in and on the same network.',
    ],
  ),
  'sony': WakeHelp(
    title: 'Wake your Sony Bravia',
    steps: [
      'On the TV: Settings → Network & Internet → turn on “Remote Start” '
          '(older models: Settings → Network → Home Network Setup → Remote '
          'Start).',
      'Keep the TV plugged in and on the same Wi-Fi.',
    ],
  ),
  'vizio': WakeHelp(
    title: 'Wake your Vizio SmartCast TV',
    steps: [
      'Vizio wakes over the network only from light sleep. In the TV menu, '
          'turn off deep “Eco”/power-saving so networking stays on in standby.',
      'Keep the TV plugged in and on the same Wi-Fi.',
    ],
  ),
  'roku': WakeHelp(
    title: 'Wake your Roku TV',
    steps: [
      'On the TV: Settings → System → Power → turn on “Fast TV Start”.',
      'Keep the TV plugged in and on the same network.',
    ],
  ),
};

WakeHelp wakeHelpFor(String? brandId) =>
    _wakeHelp[(brandId ?? '').toLowerCase()] ?? genericWakeHelp;
