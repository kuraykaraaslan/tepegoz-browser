# @tepegoz/page-context-menu

Presentational leaf: the _model_ for the Chrome-style web-page right-click context menu. It does not
render anything itself — `buildPageContextMenuModel` builds a generic `MenuItem[]` (the same model
type consumed by `@tepegoz/browser-menu`'s `<Menu>`), branching on the right-click context (editable
field, link, image, video/audio, text selection, or the generic page menu). The host captures the
`PageContextMenuContext` at right-click time, supplies the wired `PageContextMenuActions`, renders
the returned model with `<Menu>`, and hosts the popup window itself. Rows with no matching action
render as disabled, keyboard-skipped placeholders (e.g. Cast, Lens, reading mode) — the same
convention the main (hamburger) menu uses. Owns its own content strings (see `./i18n`).

## Exports

- **`buildPageContextMenuModel`** — `(t, ctx, actions) => MenuItem[]`, the pure model builder.
- **`PageContextMenuContext`** — everything captured at right-click time (`canGoBack`,
  `canGoForward`, `selectionText`, `linkUrl`, `srcUrl`, `mediaType`, `isEditable`, and the
  `canCopy`/`canCut`/`canPaste`/`canSelectAll` edit flags).
- **`PageContextMenuActions`** — the wired callbacks (back/forward/reload, save/print/view-source/
  inspect, copy/cut/paste/select-all, link and media actions); actions omitted here render as
  disabled placeholders.
- **`PageContextMenuMediaType`** — the media kind under the cursor (mirrors Electron's
  `context-menu` event `params.mediaType`).

## Usage

```tsx
const items = buildPageContextMenuModel(t, ctx, {
  back: () => goBack(),
  forward: () => goForward(),
  reload: () => reload(),
  copy: () => copySelection(),
  copyLink: () => copyToClipboard(ctx.linkUrl),
  // ...remaining wired actions
});

<Menu items={items} ariaLabel={t.pageContextMenu} autoFocus />;
```

## Scripts

`pnpm typecheck` · `pnpm lint` · `pnpm test`
