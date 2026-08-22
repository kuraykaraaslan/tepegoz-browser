# Phase 1a — Success criteria & handover note

Companion to [`phase-1a-walking-skeleton-mvp.md`](phase-1a-walking-skeleton-mvp.md). Records the MVP
success criteria (min / strong / failure-signal + metrics) and a handover note for the L7 Model Gateway

- DoD slice.

## MVP 4 conditions

| Condition       | Status  | Evidence                                                                                                                                                                                                    |
| --------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Valuable**    | met     | One end-to-end agentic task runs BYO-key, local-first: prompt → router → planner (DAG) → HITL plan preview → reactive tool loop through the Policy Kernel PEP → live Agent Console + Event Journal.         |
| **Usable**      | met     | Chrome-style shell (omnibox, tabs/groups, new-tab, bookmarks, settings), Do-mode composer, plan-preview + approval modals, token/quota indicator, localized en/tr.                                          |
| **Testable**    | met     | Deterministic agent-eval (golden-LLM replay) + acceptance scenarios with metrics; red-team injection corpus; unit suites across the gateway/router/ledger/policy; Playwright `_electron` smoke gated in CI. |
| **Deliverable** | partial | Runs from source; unsigned packaging exists (`release.yml`). Signing/auto-update hardening is deferred (Phase 0 follow-up), so "shippable installer" is not yet closed.                                     |

## Success criteria

- **Minimum (must hold):**
  - Every model call is capped (`maxTokens`) and timed (`timeoutMs`) — no uncapped/untimed call reaches a provider (`ModelGateway.complete` rejects otherwise).
  - No state-changing/destructive/financial tool runs without HITL approval; sensitive-site lockout hard-blocks; CAPTCHA/2FA is never auto-solved.
  - BYO-key: keys live only in the main process (`safeStorage`); never on IPC or in logs; no managed backend.
  - Usage is accounted per provider+model+capability and survives restart (SQLite Token Ledger).
- **Strong (target):**
  - `taskSuccessRate = 1`, `recoverySuccessRate = 1`, `toolErrorRate = 0`, `navigationValidationFailureRate = 0` on the deterministic acceptance scenarios (`packages/orchestrator/src/acceptance-eval.ts`).
  - Account quota enforced with an 80% warning + pre-flight block; auto-refund on system-error/CAPTCHA/loop.
  - Three cloud providers (Anthropic, OpenAI, Gemini) are drivable; on-device routing is wired (execution in 1b).
- **Failure signals (stop-the-line):**
  - Any path that sends a raw API key or un-redacted secret/PII over egress or into the Journal.
  - A tool call that mutates state or hits a sensitive site without passing the ToolGateway PEP.
  - A run that spends tokens past the account quota without a pre-flight block.
  - Model output rendered as raw HTML (injection surface).

## Metrics (where they live)

- Agent run metrics — task/recovery success, approvals, tool errors, navigation-validation failures,
  token usage — are computed by the orchestrator acceptance eval (`acceptance-eval.ts`) and asserted in
  `acceptance-eval.test.ts`.
- Token accounting — provider+model+capability, lifetime totals, quota status — is in the SQLite Token
  Ledger (`packages/persistence/token-store.ts`) + the in-memory `TokenLedger.budgetStatus()`.
- Coverage gate (S80/B85/F86/L80) runs in CI (`vitest.coverage.config.ts` scope).

## Handover note — L7 Model Gateway + DoD slice

**What shipped in this slice**

- **Gemini adapter** (`packages/model-gateway/src/providers/gemini.provider.ts`) — REST via `@tepegoz/http`
  (no vendor SDK); wired into the router (`GEMINI_MODEL` tiers) and `RUNNABLE_AI_PROVIDERS`. Anthropic +
  OpenAI + Gemini are now all drivable.
- **Singleton client per provider** — each adapter caches one underlying client per credential and reuses
  it across runs.
- **SQLite Token Ledger** — migration 12 (`token_usage`) + `TokenStore` (record/refund/lifetime/byModel/
  clear). Sync-ready (device_id + updated_at/version/tombstone) for a future tepegöz-account cloud sync.
- **Budget lifecycle** — `TokenLedger` gains quota/baseline/`budgetStatus`/`snapshotEntries`; the runtime
  seeds it; the IPC layer runs the pre-flight block, persists each run, auto-refunds system-error/CAPTCHA/
  loop runs, and raises the one-time 80% warning. New private pref `agentTokenQuota` (Settings → Cost).
- **Quota indicator** — the Agent Console token chip now shows lifetime/quota with an amber ≥80% state.
- **Docs/CI** — `docs/technical-ai-doc.md` (AI transparency record); Playwright `_electron` smoke is now a
  gated CI job (`e2e` in `ci.yml`, Electron-ABI rebuild + xvfb).

**Still open on Phase 1a (not in this slice)**

- Full DoD close-out: coverage gate green across the whole suite, i18n parity audit + IME regression
  matrix, UAT signoff (human-gated).
- L7 leftovers: `count_tokens` pre-flight sizing wired into routing; a per-provider "no-op → real" local
  execution backend (Phase 1b); provider model-id verification against live catalogs.

## Handover note — quality floor (2026-08-22)

**What the quality-floor line actually asked for, and where each half stands.** The line names seven
things. Five of them were already true and are now _enforced_ rather than asserted; two produced real
defects that are fixed here.

- **Input validation (zod).** All 138 payload-taking IPC handlers validate — and that was a convention,
  checked by nobody. `apps/desktop/src/main/ipc/payload-validation.test.ts` is now the check: it reads
  every `handle`/`handleAsync` call site and fails on a payload that is not parsed, and on
  `payload as T`, which type-checks, reads like validation, and does nothing. Verified by mutation:
  removing one `parsePayload` turns the suite red.
- **Error states (AppError).** This one was a genuine defect, not a formality. `toBoundary` maps a
  non-`AppError` to a flat `Internal error`, so ten user-reachable raw throws — no local translation
  model, no cloud provider key, no such connection, keychain unavailable, helper binary not found in
  the picked folder, wireproxy failed to come up — reached users as "Internal error", untranslated,
  while the log recorded them as main-process faults. They now throw `AppError` with codes and en+tr
  text, and `packages/i18n/src/error-codes-parity.test.ts` fails if any of the 36 coded errors in the
  tree loses its translation. Note `api-network.ts` documented one of these as "rejects naming the
  folder when nothing was found in it" — it did not; the message never reached the user.
- **Logging (redacted).** `Logger` shipped with **no test at all** and redacted on one axis: five
  provider key patterns matched against the serialized output. Anything opaque went to the log
  verbatim — including every password in the credential vault, which is opaque by construction, so no
  value pattern could ever have caught one. Redaction is now two-axis (field NAME as well as value
  shape), runs before serialization rather than after (a secret containing a quote used to survive
  JSON escaping), unwraps `Error` objects instead of logging `{}`, and is covered by 19 tests.
- **Policy Kernel + HITL.** Already enforced at the ToolGateway; Scoped Trust Profiles closed the last
  open half of line 55 the same day.
- **Backup/export awareness.** Bookmarks had import and no export — a local-first browser whose data
  cannot leave it is not local-first. `serializeBookmarksHtml` writes the Netscape format the parser
  already reads, so the round trip is _checked_ rather than claimed, and `docs/data-and-backup.md` now
  states where every piece of user data lives, what can be exported, what cannot (history, downloads,
  macros, tasks, agent memory, trust profiles, preferences — tracked in `known-issues.md`), and the two
  things people get wrong about restoring a profile copy: keychain-sealed data does not travel to
  another machine, and a WAL-mode `.db` must be copied closed.
- **Handover note.** This section.

**Stale claim retracted.** The previous handover note said `@tepegoz/human-input` lacked a build config
and `bookmarks-bar.test.tsx` failed lint, and that both blocked a fully-green repo run. Both were fixed
earlier in Phase 1a; `pnpm exec turbo run typecheck lint test` is 240/240 green, `pnpm e2e` 24/24, and
coverage is 79.49%.
