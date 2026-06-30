# tepegoz-browser — Phases (Progress Tracking)

This folder is the **executable, checkable** counterpart of the development plan (competitor analyses
under `docs/` + the approved architecture plan). Each phase is its own file; we **tick tasks as we do
them** with `- [ ]` / `- [x]`. This keeps the process resumable across sessions.

> **Source plan:** `\home\kuray\.claude-personal\plans\docs-u-inceleyerek-otomasyon-moonlit-petal.md`
> (to be moved into the repo as `docs/ARCHITECTURE.md` + `docs/ROADMAP.md`).
> **Compliance:** `//wsl.localhost/Ubuntu/home/kuray/internal-ai-rules` (BINDING — see plan §13).
> **Language:** Project artifacts are **English-first**; Turkish is a first-class supported locale.

## Phase index & status

| Phase | File | Goal | Status |
|---|---|---|---|
| 0 | [phase-0-foundation.md](phase-0-foundation.md) | Monorepo scaffold + core contracts + CI | 🟡 Core done (packaging/signing + Phase-1a-bound i18n deferred) |
| 1a | [phase-1a-walking-skeleton-mvp.md](phase-1a-walking-skeleton-mvp.md) | Walking-skeleton MVP (BYO-key local-first agentic core) | ⬜ Not started |
| 1b | [phase-1b-agentic-deepening.md](phase-1b-agentic-deepening.md) | Parallel DAG + durable handoff + per-task memory + prompt/rules | ⬜ Not started |
| 2 | [phase-2-adapters-safe-browsing.md](phase-2-adapters-safe-browsing.md) | Integration adapters + Safe-Browsing Suite | ⬜ Not started |
| 3 | [phase-3-backend-cloud-extensions.md](phase-3-backend-cloud-extensions.md) | Managed subscription + cloud memory sync + extensions | ⬜ Not started |
| 4 | [phase-4-maturation.md](phase-4-maturation.md) | Maturation (full extensions, cross-platform, enterprise) | ⬜ Not started |
| 5 | [phase-5-vpn-network-privacy.md](phase-5-vpn-network-privacy.md) | Per-profile VPN tunnels + Tor (network privacy) | ⬜ Not started |

Status legend: ⬜ Not started · 🟡 In progress · ✅ Done (DoD passed)

## Cross-cutting compliance gates applied to EVERY phase (see plan §13)

These apply in every phase; a phase DoD does not close without them:

- [ ] **Git:** branch-based (`<type>/<short-scope>` → self-review PR → main); origin **SSH**; **NO AI attribution trailer** in commits/PRs
- [ ] **Strict TS:** no `@ts-ignore`, `any` only in catch; all packages extend the root base tsconfig
- [ ] **Zod boundary `safeParse`:** IPC, LLM tool-call args (untrusted!), MCP, Skills, adapters, Journal, Policy inputs
- [ ] **AppError contract:** service throws → boundary catches → `{message, statusCode}`
- [ ] **Security:** renderer = untrusted; secure `createWindow()` + fuses; secrets only in main + `safeStorage`; redaction in Journal/logs
- [ ] **DoD gates:** self-review/code-review + coverage (S80/B70/F80/L80) + migration-safe DB + UAT signoff
- [ ] **i18n day-0 (mandatory):** every user-facing string comes from the i18n catalog (**en primary/source + tr full parity, first-class**); **NO hardcoded UI strings** (ESLint rule; exception: logs/`*.messages.ts`). Main-process user-facing text (native menu/dialog/notification/tray) is i18n too. **Each phase adds en+tr keys for the surfaces it ships, in the same PR** — never deferred.
- [ ] **Determinism-first:** rule-based CDP wherever possible; the model is used only for understanding/ambiguity
- [ ] **At phase start** re-read the relevant ruleset `_manifest.json` `blocking_rules` (especially `database-change-delivery.md` + `deployment-readiness.md` before any release/migration)

## How to use
1. Open the active phase's file, set its **Status** to 🟡.
2. Do tasks in order; tick each finished one with `- [x]`.
3. When all of a phase's DoD checkboxes are ticked, set Status to ✅ and update the table above.
4. Move to the next phase.
