# @tepegoz/omnibox

Presentational leaf: the browser's address bar. It owns the typed value, keeps it in sync with the
active tab's URL (except while the user is editing), evaluates inline arithmetic as the user types
(`evaluateOmniboxCalc`), and shows a deterministic unified suggestions dropdown (history/tab/search)
driven by an injected `onSuggest`. Navigation, tab-activation and the clipboard are all injected via
callbacks, so the package has no dependency on the Electron bridge — and the calc/suggestion path
never starts an AI thread or a search on its own.

## Exports

- **`Omnibox`** — the address-bar input; renders the calc chip and the suggestions listbox.
- **`OmniboxProps`** — its injected-props contract (`currentUrl`, `placeholder`, `onNavigate`,
  `onCalcResult`, `onSuggest`, `onActivateTab`).
- **`evaluateOmniboxCalc`** / **`CalcResult`** — the pure inline arithmetic evaluator.
- **`buildOmniboxSuggestions`**, **`parseOmniboxQuery`**, **`looksNavigable`**,
  **`MAX_OMNIBOX_SUGGESTIONS`** — the pure suggestion-building helpers hosts use to compose
  history/tab/search results before passing them to `onSuggest`.
- **`OmniboxSuggestion`**, **`OmniboxSuggestionKind`**, **`OmniboxAction`**, **`OmniboxScope`**,
  **`OmniboxQuery`**, **`OmniboxTabCandidate`**, **`OmniboxHistoryCandidate`**,
  **`OmniboxBookmarkCandidate`**, **`OmniboxSuggestSources`**, **`OmniboxSuggestLabels`** — the
  suggestion data types.

## Usage

```tsx
<Omnibox
  currentUrl={activeTab.url}
  placeholder={t.omniboxPlaceholder}
  onNavigate={(input) => navigate(input)}
  onSuggest={(query) => buildOmniboxSuggestions(query, sources, labels)}
  onActivateTab={(tabId) => activateTab(tabId)}
/>
```

## Scripts

`pnpm typecheck` · `pnpm lint` · `pnpm test`
