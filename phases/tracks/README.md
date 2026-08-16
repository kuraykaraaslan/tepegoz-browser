# Tracks — one-off plans that are not numbered phases

These are working plans that sit outside the numbered product roadmap
([`../README.md`](../README.md)) and outside the AI competence program
([`../ai-agent-super/README.md`](../ai-agent-super/README.md)). They live here so they are not lost,
**not** because they are scheduled.

> **Read the Status column before the document.** Only one of these is finished work; the other two
> are unscheduled, and one of them is an unapproved proposal that its own text flags as a security
> regression unless every hardening measure lands together. Nothing in this folder is committed
> roadmap. A track earns a phase row by being promoted into a `phase-*.md` file or an ADR — until
> then it is a written idea with an owner's name on it, not a plan of record.

| Track | Status | Scope |
|---|---|---|
| [code-claude-by-codex.md](code-claude-by-codex.md) | ✅ **Complete** (Faz 1–5, 2026-07-06) | Bringing `extensions/ext-agent` to a Claude-for-Chrome-class multi-step, multi-tab browser agent. Its outcomes are folded into Phases 1a / 1b / 2c — see the fold record in [`../README.md`](../README.md#completed-hardening-track-folded-into-phases-1a--1b--2c). |
| [code-cleanup-api.md](code-cleanup-api.md) | ⏸ **Deferred** — planned, unscheduled | Collapse the "çift başlılık": one tool-calling protocol, `AIAdaptor` → `CapabilityGroup`, and removal of a dormant second tool-call path. Intended as 3 PRs. No phase row, no DoD, no owner. |
| [express-settings.md](express-settings.md) | 📋 **Proposal** — awaiting approval | Serving `tepegoz://settings` from a loopback, token-protected internal Express server. ⚠️ Adds an HTTP trust boundary and a listening TCP socket; the document records a lower-attack-surface alternative (`protocol.handle`, socketless) in its Ek A. **Not approved. Do not implement from this file alone.** |

Language note: the two Turkish documents are kept in their original language — they are the record as
written. Project artifacts are English-first with Turkish a first-class locale
([`../README.md`](../README.md)).
