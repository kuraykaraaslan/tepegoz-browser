# @tepegoz/browser-menu

Presentational leaf: a reusable, KUIreact-styled menu surface driven entirely by a generic
`MenuItem[]` model, so the same component backs both the main (hamburger) menu and
`@tepegoz/page-context-menu`'s web-page right-click menu. Renders items, separators, section labels,
a header block, an inline zoom control row, grouped icon-button rows, and submenu ("flyout") parent
rows with Up/Down/Home/End keyboard navigation. All row actions and content copy come in through the
`items` model (mixed in by the caller from whichever packages own that copy); the component only
owns its own structural strings (see `./i18n`, e.g. the zoom row's aria-labels). It does not own its
host window, top-level Escape/dismissal, or (for flyout rows) the submenu's open/close behavior —
those are driven by the host via the `flyout` prop.

## Exports
- **`Menu`** — renders a `MenuItem[]` model with keyboard navigation.
- **`MenuProps`** — `items`, `ariaLabel`, optional `className`/`autoFocus`, and `flyout` hooks.
- **`MenuFlyout`** — host hooks (`onOpen`/`onClose`) for flyout ("submenu") parent rows; this app
  opens a separate native popup window to the left rather than an in-window flyout.
- **`MenuItem`** / **`MenuAction`** — the generic, app-agnostic menu row model (item, separator,
  label, header, zoom, actions-group, and flyout-parent variants).

## Usage
```tsx
<Menu
  items={[
    { id: 'new-tab', label: t.newTab, shortcut: 'Ctrl+T', onSelect: newTab },
    { kind: 'separator' },
    { id: 'settings', label: t.settings, flyout: true },
  ]}
  ariaLabel={t.mainMenu}
  autoFocus
  flyout={{ onOpen: (id, rect) => openSubmenu(id, rect), onClose: closeSubmenu }}
/>
```

## Scripts
`pnpm typecheck` · `pnpm lint` · `pnpm test`
