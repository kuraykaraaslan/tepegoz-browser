/**
 * `@tepegoz/journal-tools` — the Electron-free home for the agent's built-in `journal_search_events`
 * tool: the `JournalReader`/`JournalEntry` read seam (injected by the app over the Event Journal) and
 * the `registerJournalTools` registration factory. Registers directly into the single
 * `CapabilityRegistry` behind the ToolGateway PEP as an always-on `source: 'builtin'` tool
 * (ADR-0021/0024 update — no longer scoped to the Agent extension).
 */
export { type JournalReader, type JournalEntry } from './host';
export { registerJournalTools } from './journal-tools';
