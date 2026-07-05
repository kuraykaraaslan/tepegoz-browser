# @tepegoz/browser-tools (L5)

The built-in **browser/tab capability descriptors** for the agent — read page, navigate, list/create
tabs, click/fill/press/scroll/snapshot — registered into `@tepegoz/capability-plane`'s
`CapabilityRegistry` and reachable only through the ToolGateway PEP, exactly like MCP or extension
tools. Electron-free: every concrete browser operation is injected via the `BrowserHost` interface,
which the app implements in `main/agent/browser-host.ts` over `TabManager`. Perception (building the
DOM/accessibility-tree snapshot the model sees, tiered DOM-first with vision as a fallback per
ADR-0008) is pure and lives alongside the tool registrations. Extracted from `apps/desktop` per
`docs/package-map.md`.

## Exports
- **`registerBuiltinTools(host, journal)`** — registers every built-in browser tool into the
  `CapabilityRegistry`, bound to the given `BrowserHost` + `JournalReader`.
- **`resetBuiltinToolsForTest`** — test seam to unregister and re-register cleanly between tests.
- **`BrowserHost`** — the injected host contract: `navigateActive`, `readActivePage`, `listTabs`,
  `createTab(url?, groupName?)`, `snapshotElements`, `clickElement(ref)`, `fillElement(ref, text)`,
  `pressKey`, `scroll`, and more — `ref`s stay valid until the next `snapshotElements()` call.
  `createTab`'s `groupName` groups agent-opened tabs by task.
- **`JournalReader`** / **`JournalEntry`** — the read-side seam into the append-only Event Journal used
  by the agent's journal-query tool.
- **`buildPageSnapshot`** / **`PageSnapshot`** — url/title/sanitized-text snapshot of the active page.
- **`buildElementsSnapshot`** / **`ElementsSnapshot`** — the finalized, sanitized interactable-element
  list (built on `@tepegoz/tool-executor`'s `finalizeElements`) for click/fill targeting.

## Scripts
`pnpm typecheck` · `pnpm lint` · `pnpm test`
