# @tepegoz/journal-tools (L5)

The Electron-free home for the agent's built-in **`journal_search_events`** capability — read recent
audit events from the append-only Event Journal. Registered into `@tepegoz/capability-plane`'s
`CapabilityRegistry` and reachable only through the ToolGateway PEP, as an always-on `source: 'builtin'`
tool (the `@tepegoz/file-operations` pattern). Persistence-free: the concrete read is injected via the
`JournalReader` seam, which the app implements in `main/agent/journal-host.electron.ts` over
`EventJournal` + the SQLite db.

> **Domain split (ADR-0021/0024 update).** The audit journal is its own domain — this tool used to live
> on the Agent extension (`com.tepegoz.agent`). It is now an always-on builtin, split out alongside the
> `browser_*` (`@tepegoz/browser-tools`) and `tab_*` (`@tepegoz/tab-engine`) tools.

## Exports

- **`registerJournalTools({ host })`** — registers `journal_search_events` into the `CapabilityRegistry`,
  bound to an injected `JournalReader`. Always-on; the app calls it once at startup.
- **`JournalReader`** / **`JournalEntry`** — the read-side seam into the append-only Event Journal (a
  compact, already-redacted projection).

## Scripts

`pnpm typecheck` · `pnpm lint` · `pnpm test`
