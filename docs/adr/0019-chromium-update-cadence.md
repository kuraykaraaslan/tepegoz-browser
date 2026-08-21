# ADR-0019: Electron/Chromium security-update cadence

- **Status:** Proposed
- **Date:** 2026-07-03
- **Relates to:** Phase 0 "Release & update hardening" (auto-update runtime) — this ADR governs the
  _upstream-version_ discipline that feeds that runtime; they are complementary, not the same decision.

## Context

A browser ships someone else's renderer: every tepegoz release embeds a specific Chromium via Electron.
Chromium security fixes (frequently actively-exploited 0-days) land upstream on a fixed cadence, and an
Electron stable follows shortly after. Our Phase 0 plan already designs the **delivery** side — signed
auto-update, staged rollout, rollback. What it does **not** yet state is the **intake** side: how quickly
we adopt a new Electron stable once it carries a Chromium security patch, and how that adoption is tracked.

Without a stated cadence, the embedded Chromium silently ages behind the pinned `electron` version — the
one class of vulnerability we cannot mitigate in our own code, because it lives in the engine we ship. A
reviewer flagged this as a distribution-blocking gap ("a browser cannot defer Chromium security patches");
the risk is real, but it is a **process** decision, not a feature, so it belongs in an ADR.

## Decision

- **Target adoption SLA.** A new Electron stable that carries a Chromium **security** patch is adopted onto
  `main` within **≤ 2 weeks** of its release (best-effort **≤ 72 h** when the patch addresses an
  actively-exploited CVE). Feature-only Electron bumps follow the normal dependency cadence.
- **Pinned + watched.** `electron` stays exactly version-pinned (no `^`/`~`); a dependency watcher
  (Renovate/Dependabot, already the repo's mechanism) opens the bump PR automatically and labels
  security-driven bumps distinctly.
- **Tracked against the release pipeline.** Each adopted bump flows through the existing
  `.github/workflows/release.yml` per-OS matrix + native-module rebuild + (once live) the Phase 0 signed
  auto-update / staged-rollout / rollback runtime — so a bad engine bump auto-reverts to last-known-good.
- **Recorded.** The embedded Electron/Chromium version + adoption date is written to `CHANGELOG.md` on every
  release, giving an auditable "how far behind upstream are we" trail.

## Consequences

- The one vulnerability class we cannot patch in our own code (the shipped engine) now has an explicit,
  auditable ceiling on staleness instead of drifting silently.
- Adds a recurring maintenance obligation (a bump can break native modules — `better-sqlite3` ABI, see
  `CLAUDE.md` — or fuses); the per-OS CI matrix + rebuild step is the guardrail, and the SLA makes the cost
  predictable rather than a fire-drill.
- **Backlinks to Phase 0:** the "Release & update hardening" checklist gains a line pointing here; this ADR
  owns the _cadence_, Phase 0 owns the _delivery runtime_.
- Rejected: **float `electron` on a range** (non-reproducible builds; a transitive bump could ship an
  unreviewed engine); **adopt only on our own feature cadence** (couples security latency to unrelated
  feature work — exactly the drift this ADR prevents).
