# Tracks — one-off plans that are not numbered phases

These are working plans that sit outside the numbered product roadmap
([`../README.md`](../README.md)) and outside the AI competence program
([`../ai-agent-super/README.md`](../ai-agent-super/README.md)). They live here so they are not lost,
**not** because they are scheduled.

> **Read the Status column before the document.** Two of these are finished; one is unscheduled; one is
> a superseded proposal that its own text flags as a security regression unless every hardening measure
> lands together. Nothing in this folder is committed roadmap. A track earns a phase row by being
> promoted into a `phase-*.md` file or an ADR — until then it is a written idea with an owner's name on
> it, not a plan of record.

| Track                                              | Status                                | Scope                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [code-claude-by-codex.md](code-claude-by-codex.md) | ✅ **Complete** (Faz 1–5, 2026-07-06) | Bringing `extensions/ext-agent` to a Claude-for-Chrome-class multi-step, multi-tab browser agent. Its outcomes are folded into Phases 1a / 1b / 2c — see the fold record in [`../README.md`](../README.md#completed-hardening-track-folded-into-phases-1a--1b--2c).                                             |
| [code-cleanup-api.md](code-cleanup-api.md)         | ⏸ **Deferred** — planned, unscheduled | Collapse the "çift başlılık": one tool-calling protocol, `AIAdaptor` → `CapabilityGroup`, and removal of a dormant second tool-call path. Intended as 3 PRs. No phase row, no DoD, no owner.                                                                                                                    |
| [protocol-tepegoz-pages.md](protocol-tepegoz-pages.md) | ✅ **Faz 0–3 done** (2026-08-26) | Serving `tepegoz://` internal pages as real pages via `protocol.registerSchemesAsPrivileged` + `protocol.handle` — socketless. `settings`/`extensions`/`history`/`downloads`/`uploads`/`bookmarks` are all real `WebContentsView`s now (settings' native context menu e2e-verified), root-causing and working around a real Electron bug along the way (subresource requests never reach a `protocol.handle`-on-named-session handler; the fix inlines the whole shared bundle into one self-contained document). `tepegoz://tasks` out of scope — no UI renders it. |
| [express-settings.md](express-settings.md)         | 🗄️ **Superseded** — not implemented   | Serving `tepegoz://settings` from a loopback, token-protected internal Express server. ⚠️ Its own text flags this as a security regression unless every hardening measure lands together. Superseded by [protocol-tepegoz-pages.md](protocol-tepegoz-pages.md) (its Ek A); kept for the threat-model record. **Not approved. Do not implement from this file.** |

Language note: the Turkish-language documents are kept in their original language — they are the record
as written. Project artifacts are English-first with Turkish a first-class locale
([`../README.md`](../README.md)).
