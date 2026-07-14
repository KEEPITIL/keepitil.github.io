/// DROP-IN for the canonical wifi-remote tree.
///
/// Per-brand "why won't my TV wake / how to enable Wi-Fi wake" help copy, as
/// pure data so your Settings/help UI renders it however it likes. Look up with
/// [wakeHelpFor]; the lookup is tolerant of whatever brand string you pass —
/// enum name ('lgWebos', 'samsungTizen', 'sonyBravia', 'vizioSmartcast',
/// 'roku'), display label ('LG', 'Samsung', …), or SavedTv.brandName. Unknown
/// values return [genericWakeHelp].
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

const WakeHelp _lg = WakeHelp(
  title: 'Wake your LG TV over Wi-Fi',
  steps: [
    'On the TV: Settings → General → Devices → External Devices → turn on '
        '“Mobile TV On” (a.k.a. “Turn on via Wi-Fi”).',
    'Also enable “Quick Start+” (Settings → General → Energy Saving, or '
        'Devices) so the TV stays reachable in deep standby.',
    'Keep the TV plugged in and on the same Wi-Fi.',
  ],
);

const WakeHelp _samsung = WakeHelp(
  title: 'Wake your Samsung TV',
  steps: [
    'On the TV: Settings → General → Network → Expert Settings → turn on '
        '“Power On with Mobile”.',
    'Keep the TV plugged in and on the same network.',
  ],
);

const WakeHelp _sony = WakeHelp(
  title: 'Wake your Sony Bravia',
  steps: [
    'On the TV: Settings → Network & Internet → turn on “Remote Start” (older '
        'models: Settings → Network → Home Network Setup → Remote Start).',
    'Keep the TV plugged in and on the same Wi-Fi.',
  ],
);

const WakeHelp _vizio = WakeHelp(
  title: 'Wake your Vizio SmartCast TV',
  steps: [
    'Vizio wakes over the network only from light sleep. In the TV menu, turn '
        'off deep “Eco”/power-saving so networking stays on in standby.',
    'Keep the TV plugged in and on the same Wi-Fi.',
  ],
);

const WakeHelp _roku = WakeHelp(
  title: 'Wake your Roku TV',
  steps: [
    'On the TV: Settings → System → Power → turn on “Fast TV Start”.',
    'Keep the TV plugged in and on the same network.',
  ],
);

/// Tolerant lookup: matches on a brand token appearing anywhere in [brandId],
/// so enum names, labels, and SavedTv.brandName all resolve.
WakeHelp wakeHelpFor(String? brandId) {
  final s = (brandId ?? '').toLowerCase();
  if (s.contains('roku')) return _roku;
  if (s.contains('lg') || s.contains('webos')) return _lg;
  if (s.contains('samsung') || s.contains('tizen')) return _samsung;
  if (s.contains('sony') || s.contains('bravia')) return _sony;
  if (s.contains('vizio') || s.contains('smartcast')) return _vizio;
  return genericWakeHelp;
}
