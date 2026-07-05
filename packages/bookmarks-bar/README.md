# @tepegoz/bookmarks-bar

Presentational leaf: the Chrome-style **bookmarks bar** strip that sits under the nav toolbar
(`@tepegoz/nav-toolbar`). Renders a horizontal, scrollable row of bookmark chips; clicking one calls
the injected `onOpen(url)`.

Like the other chrome leaves (`tab-strip`, `window-controls`, `nav-toolbar`), it owns no strings and
has no bridge dependency — the host injects the `bookmarks` list, the `onOpen` action, and the
localized `labels`. Whether the bar shows at all is the host's decision (the `showBookmarksBar`
preference); this package just renders when asked.

```tsx
<BookmarksBar
  bookmarks={[{ url: 'https://x.com', title: 'X' }]}
  onOpen={(url) => navigate(url)}
  labels={{ bar: 'Bookmarks bar', empty: 'No bookmarks yet.' }}
/>
```

## Scripts
`pnpm typecheck` · `pnpm lint` · `pnpm test`
