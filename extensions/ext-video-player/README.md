# @tepegoz/ext-video-player

The **Unified Player** extension (`com.tepegoz.video-player`) — replaces every site's native `<video>`
controls with one consistent player, so playback speed, subtitle size, scaling, and keyboard
shortcuts work the same everywhere. Ships two surfaces sharing one set of controls: a compact toolbar
**popup** (single click) and a full internal **page** (double click). The player bundle is vendored
and version-pinned — no external CDN fetch — and regenerated through a dev-only script.

The host injects the page-reading/writing API; the extension never touches the global bridge
directly. The content script adopts videos on load, re-scans through a mutation observer for videos
added later, re-suppresses a page's controls if it restores them, and releases videos removed from
the document. The reported adopted-video count is schema-validated (untrusted page payload) and
bounded.

## Exports

- **`videoPlayerManifest`** — the manifest (`popup` + `page` surfaces, `read-page` / `write-page`
  permissions, Turkish name/description).
- **`VideoPlayerControls` / `VideoPlayerPopup` / `VideoPlayerPage`** — the shared controls and the
  two surface components.
- **`createVideoPlayerHost(ports)`** — the settings host: master enable switch, per-site disable
  (origin-matched, `http(s)` only, list bounded to 500), per-site scale (clamped 0.5–3, map bounded),
  default speed (clamped), chrome theme, auto-hide, keyboard toggle. `DEFAULT_VIDEO_PLAYER_SETTINGS`
  defaults YouTube to 1.4x. `normalizeOrigin` + `VIDEO_PLAYER_EXTENSION_ID` are exported alongside.
- **`videoPlayerDict` / `VideoPlayerStrings`** — this extension's own `en`/`tr` dictionary
  (parity-tested).
- Wire types: `VideoPlayerHostApi`, `VideoPlayerPageState`, `VideoPlayerSettings`,
  `VideoPlayerSkinOptions`, `VideoPlayerState`, `VideoPlayerSubtitleSize`, `VideoPlayerTheme`.

## Scripts

`pnpm typecheck` · `pnpm lint` · `pnpm test`
