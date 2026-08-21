# @tepegoz/tab-engine

The pure, Electron-free **tab-state model** (ADR-0020, extending ADR-0012's per-tab `WebContentsView`
isolation): the insertion-ordered set of tabs, **tab groups** (color/name), pinning, the active tab, id
allocation, and the renderer-facing `TabsState` projection. The desktop app's `TabManager` owns the
actual `WebContentsView`s and all Electron I/O, and delegates every record mutation to `TabStore`, so
this state logic is unit-testable without an Electron runtime. Ordering/grouping invariants are enforced
centrally by `normalize()` (called after every structural mutation) rather than hand-maintained per
method: pinned tabs form a contiguous run before all unpinned tabs, each group's members occupy a
contiguous run anchored at the group's first member, pinned tabs cannot belong to a group (pinning
clears group membership and vice versa, matching Chrome), and empty groups are pruned. The canonical
order is `Map` insertion order — there is no per-tab index field. Note: tab groups, pinning, and
ordering are explicitly **organizational metadata only** (ADR-0020) — every web tab still shares the
one `persist:tepegoz-web` session; grouping carries no capability/permission/policy semantics and must
not be conflated with the agent's policy-isolation axis.

It also owns the agent's built-in **`tab_*` capabilities** (`registerTabTools`): tab enumeration/creation
is a tab-domain operation, registered as always-on `source: 'builtin'` tools behind the ToolGateway PEP
(ADR-0021/0024 update — no longer scoped to the Agent extension), bound to an injected `TabHost` that the
app implements over its `TabManager`. These drive the _live_ tabs and are a separate concern from
`TabStore`'s pure record state; they co-locate here because both belong to the tab domain.

## Exports

- **`registerTabTools({ host })`** — registers the `tab_*` agent tools (`tab_list_items`,
  `tab_get_item`, `tab_create_item`, `tab_update_item`, `tab_delete_item`) into the
  `CapabilityRegistry`, bound to an injected `TabHost`. Always-on; the app calls it once at startup.
- **`TabHost`** — the injected live-tab seam: `listTabs()`,
  `createTab(url?, groupName?, background?)`, `activateTab(id)`, and `closeTab(id)`.
- **`TabStore`** — the model itself: `add`/`get`/`has`/`delete`, group create/assign/remove/pin
  mutations, `normalize()` (the invariant pass), and `toState(nav)` which projects the current model
  to the renderer-facing `TabsState` (given back/forward nav availability).
- **`TAB_GROUP_COLORS`** / **`DEFAULT_GROUP_COLOR`** — the fixed Chrome-style group color palette and
  the default assigned to a freshly created group.
- **`TabGroup`** / **`TabGroupInfo`** / **`TabGroupColor`** — the group record (an engine-local alias
  of the wire `TabGroupInfo` from `@tepegoz/desktop-ipc`, kept separate so the store can evolve
  engine-only group fields later without touching the wire type).
- **`TabKind`** — `'web'` (backed by a `WebContentsView` in the app) or `'internal'` (a `tepegoz://`
  page with no view, rendered by chrome).
- **`TabRecord`** — the wire `TabInfo` shape plus the engine-only `kind` discriminator.

## Scripts

`pnpm typecheck` · `pnpm lint` · `pnpm test`
