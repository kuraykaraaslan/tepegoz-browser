# @tepegoz/desktop-ipc

The typed IPC contract shared by the desktop app's main process, preload and renderer (`domain:action`
channel names; ADR-0009's error boundary). Ships as **two entries**: the default `.` entry is
dependency-free (verified zero zod imports) so the sandboxed preload — which cannot `require` external
npm modules — can import it safely; the runtime zod validators live in the separate `./schemas` entry,
which is main-process only. This package owns the `Preferences`, `TabInfo`/`TabGroupInfo`, and
`TepegozApi` types — the single source other packages (`@tepegoz/preferences`, the desktop app) build
on rather than duplicating.

## Exports

### `.` (zod-free — preload-safe)
- **`Preferences`** — the full persisted-preferences shape (theme, locale, telemetry, default AI
  provider, extensions, MCP servers, agent/local-model config, file-access grants, …). Owned here; the
  `@tepegoz/preferences` package pins its zod schema to this type via `satisfies`.
- **`TabInfo`** / **`TabGroupInfo`** / **`TabsState`** / **`TabGroupColor`** — tab and tab-group wire
  types (ADR-0020: drag-reorder, grouping, pinning).
- **`TepegozApi`** — the shape of the typed `contextBridge` API the preload exposes to the renderer.
- **`IpcChannels`** — the map of every channel name (`domain:action`) plus internal-page addresses.
- **`IpcBoundaryError`**, **`encodeBoundaryMessage`**, **`decodeBoundaryError`** — the ADR-0009 error
  transport. Electron serializes a thrown `Error` as its message string only, so the main-side boundary
  encodes `{ message, statusCode }` into that string (`"[403] Action blocked by policy"`) and the
  preload decodes it back into a typed `IpcBoundaryError`, so the renderer never has to parse a bare
  string.
- **`PUBLIC_SETTING_KEYS`** / **`SETTINGS_VISIBILITY`** / **`PublicSettings`** / **`SettingsHostApi`** —
  the fail-closed public/private classification of every preference (typed as
  `Record<keyof Preferences, …>`, so a new preference is a compile error until explicitly classified)
  and the curated read-only settings surface exposed to extensions.
- Re-exports of the Agent extension's wire types (`AgentEvent`, `AgentPlanStep`, `AgentConfig`, …),
  `BookmarkEntry`/`BookmarkTreeNode` (from `@tepegoz/bookmarks`), `HistoryEntry` (from
  `@tepegoz/persistence`), `PopupBlockerSettings`, and other cross-cutting DTOs — all type-only, so
  they erase away and add nothing to the preload bundle.

### `./schemas` (zod — main-process only)
- Zod validators for every untrusted IPC payload arriving from the renderer: credentials
  (`AddProviderKeyInputSchema`, `RemoveKeyByIdSchema`, `ReorderKeysSchema`, …), tabs
  (`TabMoveSchema`, `TabPinSchema`, `TabGroupCreateSchema`, …), history, bookmarks, popups, logins,
  macros, the agent run/approval flow, and more — one schema per channel, safeParse'd at the IPC
  boundary before a handler ever sees the payload.

## Notes
- The two-entry split (`exports` in `package.json`: `"."` and `"./schemas"`) is the single most
  important fact about this package — importing zod from the default entry would break the sandboxed
  preload bundle.

## Scripts
`pnpm typecheck` · `pnpm lint`
