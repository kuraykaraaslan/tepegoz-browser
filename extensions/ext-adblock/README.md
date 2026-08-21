# @tepegoz/ext-adblock

"Adblock Shield": first-party ad and tracker blocking for Tepegöz. The extension owns the user-facing
settings, popup/page surfaces, and Electron-free host state. The desktop app wires the actual network
filtering to the browsing session through a single webRequest pipeline.

## Exports

- **`adblockManifest`** — the extension manifest (`com.tepegoz.adblock`, popup + page surfaces).
- **`AdblockPopup`** / **`AdblockPage`** — toolbar and full-page settings surfaces.
- **`createAdblockHost`** — Electron-free settings/state/recent-blocked host.
- **`AdblockHostApi`**, **`AdblockSettings`**, **`AdblockState`** — host-facing contracts.

## i18n

Own `src/i18n/{en,tr}.ts` dictionary (English + Turkish, parity-tested).
