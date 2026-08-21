# @tepegoz/browser-chrome

Presentational leaf: the frameless window's whole chrome frame. Composes the other extracted chrome
packages — the draggable title row (brand mark + `@tepegoz/tab-strip` + `@tepegoz/window-controls`)
and the navigation row (`@tepegoz/nav-toolbar`, which itself composes `@tepegoz/omnibox`). Every
`window.tepegoz` action and the `isMaximized` flag are injected via props; the host fills the
toolbar's `actions` slot (its `ExtensionTray`) and an optional `captionLeading` slot (e.g. the
notification-center bell) next to the caption buttons. String-free: it takes a single composed
`BrowserChromeStrings` object (`common`/`window`/`browser`) rather than owning any i18n dictionary
itself — the host builds it from `useT(coreDict)` plus its own `browserDict`.

## Exports

- **`BrowserChrome`** — renders the title row + navigation row, wiring tab/group/window/navigation
  props down into `TabStrip`, `WindowControls`, and `NavToolbar`.
- **`BrowserChromeStrings`** — the exact string slices this chrome renders (`common.appName`,
  `window.{minimize,maximize,restore,close}`, and the `browser` slice covering tabs/groups/nav/
  omnibox/bookmark labels).
- **`BrowserChromeProps`** — the full injected-props contract (tab strip, tab groups, window
  caption, navigation, omnibox, bookmark star, and slot props).

## Usage

```tsx
<BrowserChrome
  t={{ common: coreT.common, window: coreT.window, browser: browserT }}
  tabs={tabs}
  tabGroups={tabGroups}
  activeTabId={activeTabId}
  onSelectTab={selectTab}
  onCloseTab={closeTab}
  onTabContextMenu={openTabMenu}
  onNewTab={newTab}
  isMaximized={isMaximized}
  onMinimize={() => window.tepegoz.minimize()}
  onToggleMaximize={() => window.tepegoz.toggleMaximize()}
  onClose={() => window.tepegoz.close()}
  currentUrl={activeTab.url}
  canGoBack={canGoBack}
  canGoForward={canGoForward}
  onBack={goBack}
  onForward={goForward}
  onReload={reload}
  onHome={goHome}
  onNavigate={navigate}
  menu={<MainMenuButton />}
  toolbarActions={<ExtensionTray />}
/>
```

## Scripts

`pnpm typecheck` · `pnpm lint` · `pnpm test`
