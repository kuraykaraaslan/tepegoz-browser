# @tepegoz/settings-ui

Presentational leaf: the generic settings shell — a sidebar of sections (with optional Chrome/Edge-
style group headings) plus a search box that filters across every section's `searchText`, and a
scrollable content area with an optional `banner` slot above it. It owns its own active-section and
search state and its own i18n dictionary (`useT(settingsDict)`, e.g. the search placeholder and "no
results" copy); the page title reuses the shared core dict's `common.settings`. Section *content* —
every actual settings control, provider, theme, and i18n string inside a section — is entirely
host-supplied; this package is a layout shell, not the settings pages themselves. Also exports
`ComingSoonCard`, a placeholder card for not-yet-wired settings sections that adds zero schema
fields.

## Exports
- **`SettingsLayout`** — the sidebar + search + content shell.
- **`SettingsSection`** — one section: `id`, `label`, `icon`, `searchText`, `content` (host-supplied
  `ReactNode`), and optional `group` for sidebar grouping.
- **`ComingSoonCard`** — a type-safe placeholder card (title/description/preview items) for a
  feature that isn't implemented yet; persists nothing, calls no IPC.
- **`settingsDict`** / **`SettingsStrings`** — the package's own i18n dictionary.

## Usage
```tsx
<SettingsLayout
  titleIcon={<Icon name="gear" />}
  sections={[
    { id: 'general', label: t.general, icon: <Icon name="home" />, searchText: 'general theme language', content: <GeneralSection /> },
    { id: 'privacy', label: t.privacy, icon: <Icon name="lock" />, searchText: 'privacy cookies', content: <ComingSoonCard title={t.privacy} /> },
  ]}
/>
```

## Scripts
`pnpm typecheck` · `pnpm lint` · `pnpm test`
