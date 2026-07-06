# @tepegoz/ext-user-agent

A User-Agent switcher: lets the user change how the browser identifies itself to sites by picking a
built-in preset (Chrome/Edge/Firefox/Safari across Windows/macOS/iPhone/Android, Googlebot, or the
browser's own default) or pasting a custom UA string. Ships two surfaces — a compact `popup` card under
the toolbar icon and a full `tepegoz://com.tepegoz.user-agent` page — both rendering the same stateful
`UserAgentPicker`, driven entirely through the injected `UserAgentHostApi` (no global bridge). Applying
a selection reloads open tabs so the new identity takes effect immediately. The preset catalog is owned
entirely by this extension; the host only ever receives and applies the resolved UA string (or `null`
for the default). This extension does not register any agent-callable capabilities.

## Exports
- **`userAgentManifest`** — the extension manifest (`com.tepegoz.user-agent`, popup + page surfaces, `tabs`/`network` permissions).
- **`UserAgentPopup`** — popup surface (compact card).
- **`UserAgentPage`** — page surface at `tepegoz://com.tepegoz.user-agent`.
- **`UserAgentPicker`** — the shared stateful picker core (presets list + custom UA input), used by both surfaces.
- **`USER_AGENT_PRESETS`** — the built-in preset catalog (`id`, `label`, `ua`).
- **`matchPreset`** — resolves a UA string (or `null`) to its matching preset, if any.
- **`UserAgentPreset`** (type) — a single preset's shape.
- **`UserAgentHostApi`** (type) — the host contract (`getUserAgent` / `setUserAgent`).

## i18n
Own `src/i18n/{en,tr}.ts` dictionary (English + Turkish, parity-tested); consumed via `useT` from `@tepegoz/i18n/react`.

## Scripts
`pnpm typecheck` · `pnpm lint` · `pnpm test`
