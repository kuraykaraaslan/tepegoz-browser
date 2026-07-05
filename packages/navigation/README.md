# @tepegoz/navigation

Pure TS URL logic shared by the omnibox and the main-process navigation guard: a scheme allow-list
for anything loaded into a browsing view, `tepegoz://` internal-page routing, and the trusted-origin
check used by the IPC sender allow-list. Zero-dep and Electron-free — the desktop app injects
`isPackaged` and its internal-page set via thin adapters, so this stays unit-testable and reusable by
every load entry point.

## Exports
- **`isWebUrl(url)`** — true only for `http(s)://` URLs; the only schemes ever loaded into an
  untrusted browsing view. Pure.
- **`internalPageUrl(input, internalUrls)`** — the canonical `tepegoz://…` URL if `input` addresses one
  of the app's internal pages (trailing slash tolerated), else `null`. `internalUrls` is supplied by
  the caller (app-specific), not hardcoded.
- **`toNavigationUrl(input, fallbackUrl, buildSearch?)`** — omnibox input → navigable URL: passes
  through an existing `http(s)` URL, infers `http(s)://` for a bare host/host:port (localhost defaults
  to `http`, everything else to `https`), and otherwise falls back to a web search
  (`buildSearch`, default DuckDuckGo). Anything that isn't a safe host/search — including dangerous
  schemes like `file:`/`javascript:`/`data:` typed or pasted in — falls through to search rather than
  loading as-is; this is the real guard for the programmatic `loadURL` path, which Electron's
  `will-navigate` event does not cover.
- **`isTrustedAppUrl(rawUrl, opts)`** — true only for the app's own content: `file://` always, plus the
  localhost dev server when `opts.isPackaged` is `false`. Uses exact `URL` host matching (not a string
  prefix), so a spoofed host like `http://localhost.evil.com` is rejected. Used by the IPC sender
  allow-list and the navigation guard.

## Scripts
`pnpm typecheck` · `pnpm lint` · `pnpm test`
