# @tepegoz/newtab-ui

Presentational `tepegoz://newtab` start page — the new-tab **3-option chooser** (AI / Favorites /
Blank) from Phase 1a L9.

Leaf package (ADR-0016/0017 model): it owns its own i18n dict (`./i18n`, en source + tr parity) and
never imports back into the desktop app. All data and side effects are injected via props:

- `listFavorites()` — load the user's bookmarks (the desktop chrome maps `window.tepegoz.listBookmarks`).
- `onOpenFavorite(url)` — navigate the current tab (`navigateTab`).
- `onOpenAgent()` — open the Agent Console (the "AI" option; the chrome toggles the agent sidebar).

The three options are a segmented chooser: **Favorites** (grid of saved pages, default view),
**AI** (opens the agent), **Blank** (a clean start). Rendered by `apps/desktop` App.tsx when the active
tab addresses `tepegoz://newtab`; a blank new tab (Ctrl+T / new-tab button / startup) lands here.
