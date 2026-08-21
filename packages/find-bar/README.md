# @tepegoz/find-bar

Presentational leaf: the **Ctrl+F find-in-page bar** (Phase 2c, "classic browser essentials"). Electron-free
— the host runs `webContents.findInPage` in the main process and feeds the counts back down as props, so
this package never touches the bridge and can be unit-tested in jsdom.

Unlike `@tepegoz/window-controls`, this leaf **self-localizes** from its own dict (ADR-0016) rather than
taking `labels` props: the counter has to choose between "no results" and `n/m` itself, so the strings are
part of its behaviour, not decoration.

## Exports
- **`FindBar`** — the bar: query input, `n/m` counter, match-case toggle, prev/next steppers, close.
  Focuses and selects its input on mount, so re-pressing Ctrl+F retypes over the previous query.
  Enter / Shift+Enter step matches and Escape closes, handled on the input so those keys never reach
  the page underneath.
- **`FindBarProps`** — the injected-props contract.
- **`findBarDict`** — this package's `en`/`tr` dictionary.

## Usage
```tsx
<FindBar
  query={query}
  activeMatch={result.activeMatchOrdinal}
  totalMatches={result.matches}
  matchCase={matchCase}
  onQueryChange={setQuery}
  onNext={() => window.tepegoz.findNext(query, { forward: true })}
  onPrevious={() => window.tepegoz.findNext(query, { forward: false })}
  onToggleMatchCase={() => setMatchCase((v) => !v)}
  onClose={() => window.tepegoz.findStop()}
/>
```

## Scripts
`pnpm typecheck` · `pnpm lint` · `pnpm test`
