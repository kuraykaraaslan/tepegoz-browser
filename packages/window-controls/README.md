# @tepegoz/window-controls

Presentational leaf: the native-style caption buttons (minimize / maximize·restore / close) for a
frameless window, rendered at the end of the chrome title row (`@tepegoz/browser-chrome`). Pure
view — it owns no state of its own; the maximized flag and every action are injected, so the
package has zero dependencies beyond React and FontAwesome and has no dependency on the Electron
bridge. The host keeps its own `useWindowMaximized` hook for the underlying subscription.

## Exports

- **`WindowControls`** — renders the three caption buttons; swaps the maximize/restore icon and
  aria-label based on `isMaximized`.
- **`WindowControlsLabels`** — localized aria-labels (`minimize`, `maximize`, `restore`, `close`).
- **`WindowControlsProps`** — the full injected-props contract.

## Usage

```tsx
<WindowControls
  isMaximized={isMaximized}
  labels={{ minimize: t.minimize, maximize: t.maximize, restore: t.restore, close: t.close }}
  onMinimize={() => window.tepegoz.minimize()}
  onToggleMaximize={() => window.tepegoz.toggleMaximize()}
  onClose={() => window.tepegoz.close()}
/>
```

## Scripts

`pnpm typecheck` · `pnpm lint`
