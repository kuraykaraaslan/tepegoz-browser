# @tepegoz/history-ui

Presentational leaf: the `tepegoz://history` browsing-history manager (Chrome-style) — a search box
plus a newest-first, lazily-paginated list of visited pages, each removable, with a "Clear all"
action. It owns its search/list/pagination state (an `IntersectionObserver` sentinel loads 50 items
at a time as the user scrolls) and its own i18n dictionary (`useT(historyDict)`); the actual data
source (`list`/`remove`/`clear`) is injected by the host, so the package has no dependency on the
Electron bridge.

## Exports

- **`HistoryPage`** — the history manager view.
- **`HistoryItem`** — the minimal history entry the view renders (`url`, `title`, `ts`); hosts pass
  their own richer entries (structural).
- **`HistoryPageProps`** — the injected data source (`list(query, offset)`, `remove(url)`,
  `clear()`).
- **`historyDict`** / **`HistoryStrings`** — the package's own i18n dictionary.

## Usage

```tsx
<HistoryPage
  list={(query, offset) => window.tepegoz.history.search(query, offset)}
  remove={(url) => window.tepegoz.history.remove(url)}
  clear={() => window.tepegoz.history.clear()}
/>
```

## Scripts

`pnpm typecheck` · `pnpm lint` · `pnpm test`
