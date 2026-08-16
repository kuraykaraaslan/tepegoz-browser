# Phase 1a — Success criteria & handover note

Companion to [`phase-1a-walking-skeleton-mvp.md`](phase-1a-walking-skeleton-mvp.md). Records the MVP
success criteria (min / strong / failure-signal + metrics) and a handover note for the L7 Model Gateway
+ DoD slice.

## MVP 4 conditions

| Condition | Status | Evidence |
|---|---|---|
| **Valuable** | met | One end-to-end agentic task runs BYO-key, local-first: prompt → router → planner (DAG) → HITL plan preview → reactive tool loop through the Policy Kernel PEP → live Agent Console + Event Journal. |
| **Usable** | met | Chrome-style shell (omnibox, tabs/groups, new-tab, bookmarks, settings), Do-mode composer, plan-preview + approval modals, token/quota indicator, localized en/tr. |
| **Testable** | met | Deterministic agent-eval (golden-LLM replay) + acceptance scenarios with metrics; red-team injection corpus; unit suites across the gateway/router/ledger/policy; Playwright `_electron` smoke gated in CI. |
| **Deliverable** | partial | Runs from source; unsigned packaging exists (`release.yml`). Signing/auto-update hardening is deferred (Phase 0 follow-up), so "shippable installer" is not yet closed. |

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
- Coverage gate (S80/B70/F80/L80) runs in CI (`vitest.coverage.config.ts` scope).

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
- Pre-existing branch debt surfaced during verification (NOT from this slice): `@tepegoz/human-input` has
  no `tsconfig.build.json` / node_modules (breaks `turbo run build`), and `packages/bookmarks-bar/src/
  bookmarks-bar.test.tsx:47` fails lint (`no-unsafe-assignment`). Both block a fully-green repo run and
  should be fixed before the Phase 1a DoD can close.
