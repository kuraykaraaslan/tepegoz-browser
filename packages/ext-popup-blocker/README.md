# @tepegoz/ext-popup-blocker

"Popup Blocker (strict)": blocks pop-ups by default and offers allow / open-in-background / redirect /
trust-this-site actions inline on the "pop-up blocked" notification itself. Ships two surfaces — a
compact `popup` card under the toolbar icon (toggles + this session's recent blocked requests) and a
full `tepegoz://com.tepegoz.popup-blocker` page (toggles + the persistent trusted-origins allowlist).
Both surfaces render the same stateful `PopupBlockerControls`, driven entirely through the injected
`PopupBlockerHostApi` — no global bridge. The extension owns a curated, editable seed list of
well-known origins (OAuth/SSO, payments/3-D-Secure, video calls, productivity suites) whose popups are
core functionality rather than ad-driven noise; it is seeded once and fully user-editable thereafter.
This extension does not register any agent-callable capabilities.

## Exports
- **`popupBlockerManifest`** — the extension manifest (`com.tepegoz.popup-blocker`, popup + page surfaces, `tabs`/`navigate` permissions).
- **`PopupBlockerPopup`** — popup surface (compact card: toggles + recent blocked requests).
- **`PopupBlockerPage`** — page surface at `tepegoz://com.tepegoz.popup-blocker` (toggles + trusted-sites allowlist).
- **`PopupBlockerControls`** — the shared stateful controls, parameterized by `surface: 'popup' | 'page'`.
- **`DEFAULT_TRUSTED_POPUP_ORIGINS`** — the seed allowlist of trusted origins (OAuth, payments, video calls, productivity suites).
- **`PopupBlockerHostApi`** (type) — the host contract (get/set settings, recent requests, open in background tab).
- **`PopupBlockerSettings`** (type) — persisted settings shape (`enabled`, `showNotifications`, `trustedOrigins`).

## i18n
Own `src/i18n/{en,tr}.ts` dictionary (English + Turkish, parity-tested); consumed via `useT` from `@tepegoz/i18n/react`.

## Scripts
`pnpm typecheck` · `pnpm lint`
