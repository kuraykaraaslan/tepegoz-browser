# @tepegoz/extensions-ui

Presentational leaf: the `tepegoz://extensions` manager shell (Chrome-style) — a searchable grid of
extension cards, each with an enable/disable toggle. It owns its own search state and i18n
dictionary (`useT(extensionsDict)`); the extension list, manifest labels, icons, and enabled state
all come from the host as `items`, so the package carries no app-specific extension/registry logic.

## Exports

- **`ExtensionsGrid`** — the searchable card grid.
- **`ExtensionCardItem`** — one card's data (`id`, `icon`, `name`, `description`, `meta`, `enabled`);
  hosts map their own extension/manifest objects into this shape.
- **`extensionsDict`** / **`ExtensionsStrings`** — the package's own i18n dictionary.

## Usage

```tsx
<ExtensionsGrid
  items={extensions.map((e) => ({
    id: e.id,
    icon: <ExtensionIcon manifest={e.manifest} />,
    name: e.manifest.name,
    description: e.manifest.description,
    meta: `v${e.manifest.version} · ${e.kind}`,
    enabled: e.enabled,
  }))}
  onToggle={(id, enabled) => setExtensionEnabled(id, enabled)}
/>
```

## Scripts

`pnpm typecheck` · `pnpm lint` · `pnpm test`
