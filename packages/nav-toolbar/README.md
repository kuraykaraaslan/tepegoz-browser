# @tepegoz/nav-toolbar

Presentational leaf: the browser navigation bar that sits below the title row
(`@tepegoz/browser-chrome`) — back/forward/reload/home buttons, the address bar
(`@tepegoz/omnibox`), an optional bookmark star, a host-provided `actions` slot (e.g. pinned
extension icons), and the main-menu control at the trailing edge. Every action is injected via
callbacks and the menu itself is a host-supplied `ReactNode` (button + its dropdown), so this
package stays bridge-agnostic and owns no strings of its own.

## Exports
- **`NavToolbar`** — the toolbar row; composes `Omnibox` and renders the nav buttons, the optional
  bookmark star (hidden unless `onToggleBookmark` is supplied), the `actions` slot, and `menu`.
- **`NAV_BTN`** — the shared Tailwind class string for a 32px toolbar icon button, exported so hosts
  can style matching controls (e.g. pinned extension icons) identically.
- **`NavToolbarLabels`** — localized aria-labels (`back`, `forward`, `reload`, `home`, optional
  `bookmarkAdd`/`bookmarkRemove`).
- **`NavToolbarProps`** — the full injected-props contract.

## Usage
```tsx
<NavToolbar
  canGoBack={canGoBack}
  canGoForward={canGoForward}
  labels={{ back: t.back, forward: t.forward, reload: t.reload, home: t.home }}
  onBack={() => goBack()}
  onForward={() => goForward()}
  onReload={() => reload()}
  onHome={() => navigate(homeUrl)}
  currentUrl={activeTab.url}
  omniboxPlaceholder={t.omniboxPlaceholder}
  onNavigate={(input) => navigate(input)}
  menu={<MainMenuButton />}
  actions={<ExtensionTray />}
/>
```

## Scripts
`pnpm typecheck` · `pnpm lint` · `pnpm test`
