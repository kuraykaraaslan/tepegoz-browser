# @tepegoz/browser-tools (L5)

The built-in **`browser_*` capability descriptors** for the agent — read page, navigate a tab,
snapshot elements, click/fill/press/scroll — registered into `@tepegoz/capability-plane`'s
`CapabilityRegistry` and reachable only through the ToolGateway PEP, exactly like MCP or extension
tools. Electron-free: every concrete browser operation is injected via the `BrowserHost` interface,
which the app implements in `main/agent/browser-host.ts` over `TabManager`. Perception (building the
DOM/accessibility-tree snapshot the model sees, tiered DOM-first with vision as a fallback per
ADR-0008) is pure and lives alongside the tool registrations. Extracted from `apps/desktop` per
`docs/package-map.md`.

> **Domain split (ADR-0021/0024 update).** These are browser-domain tools, registered as always-on
> `source: 'builtin'` capabilities (the `@tepegoz/file-operations` pattern) — no longer scoped to the
> Agent extension. **Tab** tools (`tab_*`) live in `@tepegoz/tab-engine`; the **journal** tool
> (`journal_search_events`) lives in `@tepegoz/journal-tools`.

## Exports
- **`registerBrowserTools({ host })`** — registers every `browser_*` tool into the `CapabilityRegistry`,
  bound to the given `BrowserHost`. Always-on; the app calls it once at startup.
- **`BrowserHost`** — the injected host contract: `navigate(url, tabId?)`, `readPage(tabId?)`,
  `waitForLoad(tabId?, timeoutMs?)`, `snapshotElements(tabId?)`, `clickElement(ref, tabId?)`,
  `fillElement(ref, text, tabId?)`, `pressKey(key, tabId?)`, `scrollPage(direction, amount?, tabId?)`.
  Omitting `tabId` preserves active tab behavior; passing one scopes the operation to that browser tab.
  `browser_validate_page` uses `waitForLoad` + `readPage` as a lightweight post-action verification
  tool. `ref`s stay valid until the next `snapshotElements()` call on the same tab.
- **`buildPageSnapshot`** / **`PageSnapshot`** — url/title/sanitized-text snapshot of the active page.
- **`buildElementsSnapshot`** / **`ElementsSnapshot`** — the finalized, sanitized interactable-element
  list (built on `@tepegoz/tool-executor`'s `finalizeElements`) for click/fill targeting.

## Scripts
`pnpm typecheck` · `pnpm lint` · `pnpm test`
