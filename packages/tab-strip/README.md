# @tepegoz/tab-strip

Presentational leaf: the horizontal browser tab strip that sits in the chrome title row (composed
by `@tepegoz/browser-chrome`). Renders favicon-with-fallback tab chips, translates mouse-wheel
deltas into horizontal scroll, collapses title/close affordances via container queries, and (ADR- 0020) renders tab groups as colored contiguous runs with dnd-kit drag-reorder (tabs and whole
groups) plus a drag overlay. Selection, close, context-menu, new-tab, move/group mutations are all
injected via callbacks — the strip only captures drag intent and reports it; ordering/grouping
invariants are enforced by the host's model, so the package has no dependency on the Electron
bridge and owns no strings of its own.

## Exports

- **`TabStrip`** — the tab strip; renders `tabs` (+ optional `groups`), handles select/close/new/
  context-menu, drag-reorder, group collapse/rename/assign, and inline group-name editing.
- **`TabDescriptor`** — the minimal per-tab shape the strip renders (`id`, `title`, `faviconUrl`,
  `isLoading`, optional `pinned`/`groupId`); hosts pass their own richer tab objects (structural).
- **`TabGroupDescriptor`** — a tab group (`id`, `name`, `color`, `collapsed`) rendered as a colored
  container wrapping its contiguous member run.
- **`TabStripLabels`** — localized aria-labels/fallback strings (`tablist`, `untitled`, `closeTab`,
  `newTab`, optional `unnamedGroup`/`toggleGroup`).
- **`TabStripProps`** — the full injected-props contract.

## Usage

```tsx
<TabStrip
  tabs={tabs}
  groups={tabGroups}
  activeId={activeTabId}
  labels={{ tablist: t.tabs, untitled: t.untitled, closeTab: t.closeTab, newTab: t.newTab }}
  onSelect={(id) => selectTab(id)}
  onClose={(id) => closeTab(id)}
  onContextMenu={(id) => openTabMenu(id)}
  onNew={() => newTab()}
  onMove={(id, toIndex) => moveTab(id, toIndex)}
/>
```

## Scripts

`pnpm typecheck` · `pnpm lint` · `pnpm test`
