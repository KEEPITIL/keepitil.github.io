# TV Remote (Flutter)

Cross-platform TV remote, architected for multiple brands from day one. **Phase
1** delivers a working LG/webOS connection: discover the TV on the LAN, pair over
the SSAP WebSocket, and control volume / channel / mute / input from a
bare-bones screen. iOS is the first target.

Full remote UI, AdMob, and the $2.99 remove-ads IAP are later phases.

## Architecture

Everything a brand needs to implement lives behind one interface,
[`TvProtocol`](lib/core/protocol/tv_protocol.dart): `discover`, `connect`,
`sendCommand`, `disconnect`. LG/webOS is the first implementation; Samsung and
Sony will be new implementations behind the same interface. The UI and state
layers only ever touch brand-agnostic types (`TvDevice`, `TvCommand`,
`ConnectionStatus`), so onboarding a brand never touches the UI.

```
lib/
├── main.dart / app.dart              # entry point + MaterialApp + Provider
├── core/
│   ├── models/                       # TvDevice, TvCommand, ConnectionStatus
│   └── protocol/tv_protocol.dart     # ← the reuse seam (abstract interface)
├── protocols/
│   └── lg_webos/                     # first concrete brand
│       ├── lg_webos_protocol.dart    #   implements TvProtocol
│       ├── ssdp_discovery.dart       #   UDP M-SEARCH → 239.255.255.250:1900
│       ├── ssap_client.dart          #   wss:3001 (self-signed) / ws:3000
│       ├── ssap_commands.dart        #   ssap:// URI catalog (from lgtv2)
│       └── lg_manifest.dart          #   register/pairing manifest
├── services/
│   ├── secure_key_store.dart         # flutter_secure_storage (client-key)
│   └── protocol_factory.dart         # brand → TvProtocol (register brands here)
├── state/remote_controller.dart      # ChangeNotifier: UI ↔ protocol
└── ui/                               # discovery + remote screens, buttons
```

**Layer separation:** UI (`ui/`) never imports anything under `protocols/`. It
talks to `RemoteController` (state), which talks to `TvProtocol` (protocol) via
`ProtocolFactory`. Adding a brand = implement `TvProtocol` + add one case to
`ProtocolFactory` + one value in `TvBrand`.

## How Phase 1 works (LG/webOS)

1. **Discovery** — `SsdpDiscovery` binds a UDP socket, sends an M-SEARCH to the
   SSDP multicast group `239.255.255.250:1900` for the LG second-screen target
   (plus `ssdp:all`), and surfaces any responder whose headers look like LG.
2. **Pairing** — `SsapClient` opens `wss://<tv>:3001`, **accepting LG's
   self-signed certificate** via a custom `HttpClient.badCertificateCallback`,
   with `ws://<tv>:3000` as a fallback. It sends the SSAP `register` manifest
   (`pairingType: PROMPT`), the TV shows an on-screen **Accept** prompt, and on
   acceptance returns a `client-key`.
3. **Secure storage** — the returned `client-key` is stored per-device in the OS
   keychain via `flutter_secure_storage`, so subsequent launches reconnect
   silently (no prompt).
4. **Commands** — brand-agnostic `TvCommand`s map to `ssap://` requests:
   volume up/down, mute (toggles via current state), channel up/down, and input
   switching.

The SSAP command formats and register manifest are ported from the open-source
[`lgtv2`](https://github.com/hobbyquaker/lgtv2) (Node) and
[`aiowebostv`](https://github.com/home-assistant-libs/aiowebostv) /
[`PyWebOSTV`](https://github.com/supersaiyanmode/PyWebOSTV) (Python) libraries.

## First-time setup (on your Mac)

This repo contains the hand-authored Dart, config, and iOS notes. Generate the
platform folders and pull deps:

```bash
cd tv_remote
flutter create .          # fills in ios/ (Xcode project), android/, etc.
                          # without overwriting lib/, pubspec.yaml, or test/
flutter pub get
```

### iOS: local-network permission (required — fails silently otherwise)

iOS 14+ blocks local-network access until the user grants a prompt, and it fails
**silently** if misconfigured (discovery just finds nothing). After
`flutter create .`:

1. Merge the keys from
   [`ios/Runner/Info.plist.additions`](ios/Runner/Info.plist.additions) into the
   generated `ios/Runner/Info.plist` — `NSLocalNetworkUsageDescription` and
   `NSBonjourServices`.
2. Add the **Multicast Networking** entitlement
   (`com.apple.developer.networking.multicast`). This one requires a one-time
   request to Apple for your App ID, then adding the capability in Xcode
   (Signing & Capabilities). Sending to the multicast group is dropped by iOS
   without it. Details are in the `.additions` file.

Then run on a **real device on the same Wi-Fi as the TV** (the iOS Simulator
cannot reach the LAN / multicast):

```bash
flutter run -d <your-iphone>
```

## Try it

1. Turn the LG TV on, same Wi-Fi as the phone.
2. Launch the app → it scans and lists the TV.
3. Tap it → **Accept** the prompt on the TV screen (first time only).
4. Use Vol ±, Ch ±, Mute, Input.

## Notes / known follow-ups

- Discovery identifies TVs by IP for Phase 1; fetching the SSDP `LOCATION` XML
  for a friendly name is a small later add (matters only with multiple LG TVs).
- The input picker fetches the TV's real inputs via `getExternalInputList`
  (exposed as `TvProtocol.listInputs`) and falls back to common fixed inputs if
  the TV reports none or the query fails.
- Very old webOS firmware may require the legacy signed manifest — see the note
  at the bottom of [`lg_manifest.dart`](lib/protocols/lg_webos/lg_manifest.dart).

## Tests

```bash
flutter test
```

Covers the SSAP URI catalog and the register-payload shape (PROMPT pairing,
client-key inclusion, permission set).
