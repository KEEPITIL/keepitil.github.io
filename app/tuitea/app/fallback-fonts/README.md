TUITEA self-hosted engine fallback fonts
========================================

These are NOT app assets and are deliberately NOT declared in pubspec.yaml.
They are the files the Flutter web engine downloads *by itself*, mirrored onto
our own origin.

WHY THEY EXIST
--------------
CanvasKit resolves two font needs at runtime by fetching from
https://fonts.gstatic.com/s/ :

  1. `roboto/v32/KFOmCnqEu92Fr1Me4GZLCzYlKw.woff2`
     The engine's unconditional default text font. TUITEA's theme asks for
     '.SF Pro Text', which exists on iOS and nowhere on the web, so every
     single character of TUITEA on the web is drawn with this file.

  2. The Noto fallback family, chosen per codepoint. TUITEA's UI text contains
     ~50 literal emoji (the onboarding seedling, goal chips, habit rows, pet
     and health screens) plus arrows, bullets and dashes. Without a font that
     covers a codepoint it renders as a tofu box — which is exactly what the
     onboarding seedling was doing.

     Note the engine does NOT always route an emoji to Noto Color Emoji: the
     onboarding seedling U+1F331 resolves to `Noto Sans Symbols`. Mirroring
     only the colour-emoji shards was tried first and left the tofu in place.

A private family app must not need a Google-hosted asset to draw its own
onboarding screen. `web/index.html` therefore sets

    config: { fontFallbackBaseUrl: 'fallback-fonts/' }

which repoints BOTH of the above at this directory. The paths under here must
match the engine's expected paths byte for byte — the engine builds the URL as
`fontFallbackBaseUrl + <the path it would have used on gstatic>`.

WHAT IS HERE, AND WHAT IS NOT
-----------------------------
All 161 NON-CJK entries of the engine's fallback list (getFallbackFontList() in
font_fallback_data.dart), 9.3 MB. That is Latin, Greek, Cyrillic, symbols,
maths, music, colour emoji, and every single-file script from Arabic to
Zanabazar Square.

DELIBERATELY NOT MIRRORED: Noto Sans SC / TC / JP / KR / HK — 563 of the 724
entries and the overwhelming majority of the bytes. A Chinese, Japanese or
Korean codepoint now renders as tofu rather than triggering a download from
Google. TUITEA is a Latin-script household app; if that changes, mirror those
families here too rather than reverting fontFallbackBaseUrl.

THE SERVER PAYS, THE CLIENT DOES NOT
------------------------------------
9.3 MB sits on the server. Fallbacks are fetched lazily, per codepoint the app
actually paints, so a real launch pulls one or two files totalling tens of KB.

WHEN FLUTTER IS UPGRADED
------------------------
The engine hard-codes these filenames (see
flutter/bin/cache/flutter_web_sdk/lib/_engine/engine/canvaskit/fonts.dart and
.../font_fallback_data.dart). A Flutter upgrade can change the hashes or the
`v32` directory. If it does, these files stop being found and text/emoji go
blank. Re-mirror by reading the two files above and refetching the same paths
from https://fonts.gstatic.com/s/ .
