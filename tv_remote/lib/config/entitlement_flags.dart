/// DROP-IN for the canonical wifi-remote tree (adjust import path on integrate).
///
/// Gate for iOS multicast/broadcast-dependent networking. iOS 14+ silently
/// drops multicast M-SEARCH and broadcast Wake-on-LAN unless the app ships
/// `com.apple.developer.networking.multicast`.
///
/// [kMulticastEntitlementGranted]: flip to `true` in the SAME build that ships
/// the granted entitlement (App ID granted by Apple + provisioning profile
/// regenerated + Runner.entitlements key uncommented). Until then, SSDP stays
/// off and TCP-probe discovery is the only path. (No WoL change is needed when
/// this flips — the existing WakeOnLan sender already broadcasts on 9/7 to
/// unicast + subnet + limited-broadcast; the grant just stops iOS dropping the
/// broadcast sends, which fixes wake-after-long-standby.)
const bool kMulticastEntitlementGranted = false;

/// Effective SSDP gate: entitlement live AND hosted config opted in.
///
/// Pass the `ssdp_enabled` bool parsed from keepitil.com/wifi-remote-config.json
/// (default `false` when the field is absent). The compile-time const is an AND
/// safety so SSDP can never run in a build that doesn't carry the entitlement,
/// even if the remote config says otherwise.
bool ssdpDiscoveryAllowed(bool ssdpEnabledFromConfig) =>
    kMulticastEntitlementGranted && ssdpEnabledFromConfig;
