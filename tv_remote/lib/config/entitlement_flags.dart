/// DROP-IN for the canonical wifi-remote tree (adjust import path on integrate).
///
/// The single gate for iOS multicast/broadcast-dependent networking. iOS 14+
/// silently drops multicast M-SEARCH and broadcast Wake-on-LAN unless the app
/// ships `com.apple.developer.networking.multicast`. Flip this to `true` in the
/// SAME build that ships the granted entitlement (App ID granted by Apple +
/// provisioning profile regenerated + Runner.entitlements key uncommented).
///
/// While `false`: SSDP discovery stays off, TCP-probe discovery is the only
/// path, and WoL should keep using unicast. When you flip it to `true`, also
/// switch the WoL path in connectOrWake from unicast to subnet-directed
/// broadcast — that's what actually fixes wake-after-long-standby (unicast dies
/// once the router's ARP entry for the sleeping TV expires).
const bool kMulticastEntitlementGranted = false;
