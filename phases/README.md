# tepegoz-browser — Phases (Progress Tracking)

This folder is the **executable, checkable** counterpart of the development plan (competitor analyses
under `docs/` + the approved architecture plan). Each phase is its own file; we **tick tasks as we do
them** with `- [ ]` / `- [x]`. This keeps the process resumable across sessions.

> **Architecture:** [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) — the in-repo index of the
> L0–L10 layer model and every owning document. **This folder is the roadmap** (no `docs/ROADMAP.md`;
> the out-of-repo source plan `\home\kuray\.claude-personal\plans\docs-u-inceleyerek-otomasyon-moonlit-petal.md`
> is superseded by what is realized here, in code, and in `../docs/adr/`).
> **Compliance:** `//wsl.localhost/Ubuntu/home/kuray/internal-ai-rules` (BINDING — see plan §13).
> **Language:** Project artifacts are **English-first**; Turkish is a first-class supported locale.
> **Architecture / package map:** `../docs/package-map.md` (+ [ADR-0015](../docs/adr/0015-package-extraction-roadmap.md),
> [ADR-0016](../docs/adr/0016-per-package-i18n.md)) — the **realized** module map. `apps/desktop` is now a thin
> Electron shell over ~16 `@tepegoz/*` packages (chrome-leaf UI, main-process cores, the `desktop-ipc`
> contract, `tab-engine`, `browser-tools`, per-package i18n dicts). **New work targets a package, not
> `apps/desktop` growth**, and respects the `../dependency-cruiser.cjs` layer rules.

## Folder map

Everything in this folder's root is either this index or a directory — planning documents live in
exactly one of the four, chosen by **truth status**. Put a new document in the folder whose status it
actually has; do not start a fifth pile.

| Folder | What it holds | Truth status |
|---|---|---|
| [`product/`](product/) | The numbered product roadmap — Phases 0–12 plus M (Macros) and E (Extras) | Committed · sequenced · DoD-gated |
| [`ai-agent-super/`](ai-agent-super/README.md) | The sole authoritative AI agent competence program (v3, S0–S12) | Committed · sequenced · measurement-gated |
| [`tracks/`](tracks/README.md) | One-off plans outside the numbered roadmap — one complete, one deferred, one unapproved proposal | **Mixed — read that folder's index first. Not roadmap.** |
| [`ai/`](ai/README.md) | The retired v2 AI track | Tombstone stub — redirects only, add nothing |

## Phase index & status

| Phase | File | Goal | Status |
|---|---|---|---|
| 0 | [phase-0-foundation.md](product/phase-0-foundation.md) | Monorepo scaffold + core contracts + CI | 🟡 Core done (packaging/signing + release/update hardening + Phase-1a-bound i18n deferred) |
| 1a | [phase-1a-walking-skeleton-mvp.md](product/phase-1a-walking-skeleton-mvp.md) | Walking-skeleton MVP (BYO-key local-first agentic core) | 🟡 In progress (agent console/runtime/tool plane/browser tools live; e2e + remaining gates pending) |
| 1b | [phase-1b-agentic-deepening.md](product/phase-1b-agentic-deepening.md) | Parallel DAG + durable handoff + per-task memory + prompt/rules | 🟡 Early down-payments (tabId-scoped browser control + validation + visual fallback; durable resume/parallel DAG pending) |
| 2 | [phase-2-adapters-safe-browsing.md](product/phase-2-adapters-safe-browsing.md) | Integration adapters + Safe-Browsing Suite | 🟡 In progress (ExecutionRouter with fallback risk re-classification; "forget this site" with warn-before-confirm) |
| 2b | [phase-2b-daily-driver-ux.md](product/phase-2b-daily-driver-ux.md) | Daily-driver browser UX (tabs/PWA/DevTools) — parallel with Phase 2 | 🟡 In progress (DevTools boundary + ADR-0029, closing an inspect-element hole; honest per-tab resource accounting) |
| 2c | [phase-2c-classic-browser-essentials.md](product/phase-2c-classic-browser-essentials.md) | Classic browser essentials + downloads (find/print/PDF/reader/translate/bookmarks/private/permissions) — parallel with Phase 2/2b | 🟡 In progress (download/clipboard/upload manager slices) |
| 3 | [phase-3-backend-cloud-extensions.md](product/phase-3-backend-cloud-extensions.md) | Managed subscription + cloud memory sync + extensions | ⬜ Not started |
| 4 | [phase-4-maturation.md](product/phase-4-maturation.md) | Maturation (full extensions, cross-platform, enterprise) | ⬜ Not started |
| 5 | [phase-5-vpn-network-privacy.md](product/phase-5-vpn-network-privacy.md) | Per-tab & per-group VPN tunnels + Tor (network privacy) | 🟡 In progress (three-scope binding-resolution + fail-closed kill-switch decision layer landed and ADR-0011 accepted; no connection pool or UI yet — every tab is still Direct) |
| 6 | [phase-6-deterministic-automation.md](product/phase-6-deterministic-automation.md) | Deterministic replayable automation (RecipeCompiler + Watchers + Scheduler + Macros) | ⬜ Not started |
| 7 | [phase-7-verifiable-accountability.md](product/phase-7-verifiable-accountability.md) | Verifiable accountability & proof-of-run (Notary + Dashboard + Dry-Run + Data Rights) | 🟡 In progress (NotaryService algorithmic core + standalone `tepegoz-verify` CLI landed, tested by running the built binary; not wired into a live run) |
| 8 | [phase-8-local-intelligence-sovereignty.md](product/phase-8-local-intelligence-sovereignty.md) | Local-first intelligence & sovereignty (air-gapped mode + Trust Mesh + semantic history/KG) | ⬜ Not started |
| 9 | [phase-9-safe-autonomy-delegation.md](product/phase-9-safe-autonomy-delegation.md) | Safe autonomy & governed delegation (Mandates + Policy Bundles + Agent Endpoints) | ⬜ Not started |
| 10 | [phase-10-daily-driver-delight.md](product/phase-10-daily-driver-delight.md) | Daily-driver delight (Time-Travel Tabs + Tab Janitor + Research Canvas + Magic Moment) | ⬜ Not started |
| 10b | [phase-10b-accessibility-voice-reach.md](product/phase-10b-accessibility-voice-reach.md) | Accessibility, voice & inclusive reach (Assistive Mode + voice HITL + Guarded profiles) — parallel with 10 | ⬜ Not started |
| 11 | [phase-11-regional-trust-kamu.md](product/phase-11-regional-trust-kamu.md) | Regional trust pack (e-Devlet/GİB/SGK/MHRS Kamu adapters + Locale-as-a-Plugin) | ⬜ Not started |
| 12 | [phase-12-developer-platform-marketplace.md](product/phase-12-developer-platform-marketplace.md) | Developer platform & marketplace economy (SDK/CLI + Site-Recipe Library + SBOM gate) | ⬜ Not started |
| M | [phase-macros.md](product/phase-macros.md) | Macros extension (`@tepegoz/ext-macros`) — iMacros successor: record/edit/replay, robust selectors, agent capabilities (down-payment on Phase 6) | 🟡 Core shipped |
| E | [phase-extras.md](product/phase-extras.md) | Extras — special-track, demand-gated items off the 0–12 critical path (e.g. DRM/Widevine) | ⬜ Not started |
| AI | [ai-agent-super/README.md](ai-agent-super/README.md) | **The sole authoritative AI agent competence roadmap (v3).** Takes Do mode to a browser agent competitive with Claude for Chrome (reliability + safety) and Perplexity Comet (assistant UX), under a falsifiable four-condition "world's best" claim: S0 truth & repair → S1–S2 substrate (native tool-calling, streaming, perception v2) → S3–S5 reliability (actions, verified outcomes, code-exec) → S6–S9 control & trust (safety plane, assistant UX, memory/skills) → S10–S12 frontier (vision escalation, H2H benchmark, local model). Supersedes v2 ([ai/README.md](ai/README.md) is a tombstone); v1 (AI-1..8, the `browser-use`/`nanobrowser` port) is archived in [ai-agent-super/archive/](ai-agent-super/archive/README.md) with its honest status history | 🟡 In progress — **all 13 phases (S0–S12) have landed their capability code and every one sits at 🟠 measurement-owed.** Nothing reads ✅: the full-registry baseline, every paired sweep and the H2H are ⏸ awaiting a funded key, and S12 additionally needs downloaded local weights. Three capabilities ship deliberately inert (S6 credential fill, S9 hint recall, S10 vision) and S5 records a **measured refutation** of its own specified sandbox. See [ai-agent-super/README.md](ai-agent-super/README.md) for the per-phase rows and the stated anti-debt breach |

Status legend: ⬜ Not started · 🟡 In progress · ✅ Done (DoD passed)

## Completed hardening track (folded into Phases 1a / 1b / 2c)

See [`tracks/code-claude-by-codex.md`](tracks/code-claude-by-codex.md) for the resumable plan and
[`../docs/new/claude-versus.md`](../docs/new/claude-versus.md) for the research/status table. The completed
work has been folded into Phase 1a/1b as follows:

- [x] Phase 1a: run-scoped `ToolGateway` HITL/audit context, cancellation wiring, startup-error visibility.
- [x] Phase 1a: Agent Console conversation history is now local-profile persistent, searchable from a
      header dropdown, restorable into the panel, and available through the ext-agent page surface
      (`tepegoz://com.tepegoz.agent`), not as a core system page.
- [x] Phase 1a: explicit run state machine + journaled checkpoints with plan decision, last successful
      step, page/tab snapshot metadata, terminal reason, and recovery advice.
- [x] Phase 1a: tab tool expansion (`tab_get_item`, `tab_update_item`, `tab_delete_item`) and background tab
      creation.
- [x] Phase 1b down-payment: `tabId`-scoped browser tools and per-WebContents CDP element references.
- [x] Phase 1b down-payment: `browser_validate_page` action-verification tool.
- [x] Phase 1b down-payment: `@tepegoz/screenshots` + `browser_get_screenshot` visual fallback with
      viewport/fullPage capture, bounded metadata, and desktop host adapter.
- [x] Phase 1b down-payment: retry/recovery taxonomy for policy denial, stale selectors, page changes,
      navigation timeout, auth handoff, transient failures, and malformed model output.
- [x] Phase 2c down-payment: download/clipboard manager domain packages, IPC/preload contracts, web-permission
      preference shape, layer rules, DownloadService quarantine flow, SQLite projection, and redacted audit.
- [x] Phase 2c down-payment: `tepegoz://downloads`, presentational Downloads UI, main-menu action, and
      Settings download controls.
- [x] Phase 2c down-payment: centralized ClipboardService and generic WebPermissionBroker for
      notifications + clipboard permissions.
- [x] Phase 2c down-payment: `download_*` and `clipboard_*` Capability Plane tools registered with
      ToolGateway HITL/idempotency policy.
- [x] Phase 2c down-payment: `@tepegoz/uploads` domain package, redacted upload activity contract,
      IPC channels, and `upload_*` Capability Plane tool registration.
- [x] Phase 2c down-payment: desktop UploadService, CDP file-input binding, file sandbox preflight,
      request observation, and redacted upload audit.
- [x] Phase 2c down-payment: `tepegoz://uploads`, presentational Uploads UI, internal navigation, and
      main-menu action.
- [x] Phase 2c down-payment: combined toolbar transfer indicator/popup for recent downloads and uploads.
- [x] Phase 1b down-payment: action-recovery fixtures for screenshot fallback, changed=false form recovery,
      and table-reading flows.
- [x] Code-claude Faz 3 down-payment: `@tepegoz/tasks` saved-task/trigger domain package with
      interval/page-change/external-placeholder triggers, narrow preapproval policy, run/artifact records,
      and `task_*` Capability Plane descriptors (`task_create_run` follows the repo tool-naming rule).
- [x] Code-claude Faz 3 down-payment: task persistence migration + `TaskStore` for saved tasks, run
      history, artifacts, and trigger state.
- [x] Code-claude Faz 3 down-payment: desktop `TaskService` scheduler with interval/page-change checks,
      queue coalescing, notifications, and redacted task audit events. Runner binding remains in the
      next code-claude slice.
- [x] Code-claude Faz 3 down-payment: renderer-sender-independent background task runner, sharing the
      same single-agent-run lock as the Agent panel and fail-safe denying unattended HITL escalations.
- [x] Code-claude Faz 3 down-payment: `tepegoz://tasks` internal page, `@tepegoz/tasks-ui`, task IPC/preload
      surface, live task-state push, and main-menu Tasks action. The Agent panel "Save as task" affordance
      was removed pending the next Tasks product rework.
- [x] Code-claude Faz 3 down-payment: task capability tools are registered into the unified ToolGateway,
      and unattended task runs auto-approve state-changing tools only inside the saved task's exact
      origin + preapproved-write policy.
- [x] Code-claude Faz 4 down-payment: `@tepegoz/web-tools` exposes web search/get-page tools through the
      unified ToolGateway/PolicyKernel, and MCP results now use the normalized `ok/summary/content`
      tool-result envelope.
- [x] Code-claude Faz 4 down-payment: Settings now has a unified Adaptors inventory for MCP,
      local/native, and future REST/GraphQL/OAuth service adaptors, with tool counts, capability scopes,
      connection state, auth kind, and audit-required badges.
- [x] Code-claude Faz 4 down-payment: tool/adaptor settings expose category/source, risk,
      argument-schema presence, and idempotency requirement for MCP and built-in tools.
- [x] Code-claude Faz 5 down-payment: `@tepegoz/orchestrator` now has deterministic acceptance/eval
      scenarios for heading extraction, multi-tab research, form-fill-before-submit, action recovery,
      and CAPTCHA/2FA handoff, plus metrics for task success, recovery success, approvals, tool errors,
      navigation validation failures, and token usage.
- [ ] Phase 1b remaining: durable resume across app restarts, true parallel DAG, vision model routing/eviction.

> **Phase E (Extras) is not sequenced.** It is not numbered into the 0–12 flow and nothing depends on it; each
> item is a recorded, demand-gated decision that graduates to its own branch/ADR only when pull is shown.

> **Phases 6–12 are the _next-horizon_ track** distilled from the "beyond Phases 0–5" synthesis — they build
> **on top of a finished Phases 0–5**, not gaps in it. Through-line: tepegöz's event-sourced + deterministic +
> policy-gated DNA is a set of latent products no cloud-LLM competitor can build —
> **"Demonstrate once, run forever, prove everything, leak nothing."** Sequence these by their `Depends on`
> field, **not** by number (e.g. 6 + 7 are near-horizon foundations; `10b` runs **parallel** with `10`; 12 is
> adoption-gated). New ADRs for these phases continue from **0012** (`0011` is reserved for Phase 5 VPN) and are
> written at each phase's start, per the existing convention.

## Cross-cutting compliance gates applied to EVERY phase (see plan §13)

These apply in every phase; a phase DoD does not close without them:

- [ ] **Git:** branch-based (`<type>/<short-scope>` → self-review PR → main); origin **SSH**; **NO AI attribution trailer** in commits/PRs
- [ ] **Strict TS:** no `@ts-ignore`, `any` only in catch; all packages extend the root base tsconfig
- [ ] **Modular architecture (realized):** new features live in a `@tepegoz/*` package (or extension), NOT by growing `apps/desktop` (which stays Electron-native glue: bootstrap · `createWindow` · `ipcMain` wiring · native menus · DI · DB init). Keep packages Electron-free where possible (inject the bridge via callbacks / a host interface, e.g. `BrowserHost`, `SecretCrypto`, injected `isPackaged`/file-path); presentational **leaf** packages stay string-free; every new package gets a `dependency-cruiser` layer rule + (renderer) a Tailwind `@source`. Module map: [`docs/package-map.md`](../docs/package-map.md).
- [ ] **Zod boundary `safeParse`:** IPC, LLM tool-call args (untrusted!), MCP, Skills, adapters, Journal, Policy inputs
- [ ] **AppError contract:** service throws → boundary catches → `{message, statusCode}`
- [ ] **Security:** renderer = untrusted; secure `createWindow()` + fuses; secrets only in main + `safeStorage`; redaction in Journal/logs
- [ ] **DoD gates:** self-review/code-review + coverage (S80/B70/F80/L80) + migration-safe DB + UAT signoff
- [ ] **i18n day-0 (mandatory) — per-package ([ADR-0016](../docs/adr/0016-per-package-i18n.md)):** the owning package/extension declares its feature strings in its **own** `src/i18n/{en,tr,index}.ts` via `defineDict({ en, tr })` (typing `tr` as `typeof en` → a missing/mismatched Turkish key is a **build error**, per dict) + a co-located parity test (`keyPaths` from `@tepegoz/i18n/testing`). Only the shared core (`common` · `window` · `errors`) lives in `@tepegoz/i18n`. React surfaces **self-localize** via `@tepegoz/i18n/react` `useT(dict)` — no `t` prop-drilling; presentational **leaf** packages stay string-free and take `labels` via props; the **main process stays React-free** and resolves strings with `pick(dict, mainLocale())` (`mainStrings()`) — native menu/dialog/notification/tray included. **NO hardcoded UI strings.** **en (source) + tr (full parity), first-class** — each phase ships its surfaces' strings in the **owner's** dict, in the same PR — never deferred.
- [ ] **Determinism-first:** rule-based CDP wherever possible; the model is used only for understanding/ambiguity
- [ ] **At phase start** re-read the relevant ruleset `_manifest.json` `blocking_rules` (especially `database-change-delivery.md` + `deployment-readiness.md` before any release/migration)

## How to use
1. Open the active phase's file, set its **Status** to 🟡.
2. Do tasks in order; tick each finished one with `- [x]`.
3. When all of a phase's DoD checkboxes are ticked, set Status to ✅ and update the table above.
4. Move to the next phase.

## Deferred / adoption-gated backlog (from the beyond-phases synthesis)

Sound, DNA-aligned, but **not headline bets** — parked here so they aren't lost. Promote an item into a phase
once its parent foundation has shipped and demand is shown.

**Second-order enrichments (ride a parent phase):** personal-dashboard new-tab briefing · offline reading queue
· "Look Packs" theming (S-effort polish on theme tokens + marketplace signing) · failure-replay learning ·
time-travel debugger · replayable RAG provenance · memory firewall (redaction refinement of the Trust Mesh) ·
multi-agent crews · agent-builds-agent · journal-mined proactive suggestions. _(Each is a smaller surface on
Phase 6 RecipeCompiler / Phase 7 Notary+fold / Phase 8 global index / Phase 1a–2b UI.)_

**Special-track extras (cannot be done in routine development):** now live in their own
[Phase E — Extras](product/phase-extras.md) (e.g. DRM/Widevine — castLabs ECS build + VMP signing). Off the 0–12
critical path; demand-gated.

**Deprioritized moonshots (with reason):**
- **TEE / confidential-computing** for the managed proxy — Provider Trust Mesh + Sovereign Mode (Phase 8) give
  the same "operator can't read your data" guarantee by keeping data local, far cheaper. Revisit if a buyer
  demands server-side attested compute.
- **ZK proof of policy compliance** — Notary Replay Receipts + the deterministic causal explainer (Phase 7)
  already give content-free, third-party-verifiable proof. Revisit only for content-hiding-proof demand.
- **Post-quantum hybrid envelope** for CloudSync/journal — low present impact; a versioned `crypto_suite`
  agility field now, defer ML-KEM/ML-DSA until sync has real volume.
- **On-device LoRA/QLoRA personalization + federated LoRA sync** — KG + RAG provenance (Phase 8) already give
  inspectable, deletable, rebuildable personalization without baking PII into opaque weights.
- **Data-Dignity Vault / behavioral-data marketplace** — keep the local vault + Memory Audit primitives; cut
  the sell-your-data market (KVKK/GDPR entanglement + brand risk).
- **Cross-org A2A negotiation protocol** — ship the standalone primitives (signed identity, notarized
  transcript, mandate bounding, scoped grants — Phases 7/9); defer the protocol until counterparty adoption
  exists.
- **Decentralized identity / W3C VC / EUDI-eIDAS wallet** — constrain to `did:key` + signed Replay Receipts;
  treat EUDI as a future pluggable adapter.
- **Mobile companion read-only approver app** — DNA-sound (no agent/keys on phone, out-of-band HITL via E2EE
  relay + fencing token), but a whole second platform; deferred behind desktop wedges.
- **Roughtime / secure-time service** — minimal time-stamping lives inside NotaryService; defer a standalone
  multi-server anchor until anchoring/VC features are in demand.
- **Deepfake/AI-voice shield + C2PA provenance reading** — AgentThreatShield (Phase 2) + Content Sanitizer
  cover the deterministic baseline; C2PA web adoption too partial. The net-new sliver (session-level egress
  covert-channel scoring that **escalates to HITL, never silently blocks**) folds into the Egress Firewall
  Rust port — advisory only.

**Already planned — do NOT re-propose (consume the seam instead):** VPN/Tor/kill-switch → Phase 5 ·
local-SLM / per-task memory / HybridRetriever / cost-saver toggle / vision fallback / MCP server (Bearer +
rate-limit + Policy re-pass) / Effect-Ledger fencing / cross-model Context Package → Phase 1b · WebAuthn-passkey
+ built-in password manager → Phase 2 · managed-proxy Zero-Trust gateway / E2EE CloudSync (CRDT) / MV3 allowlist
/ RBAC-SIEM-SSO-SOC2 / cross-platform / version-tagged ASR publication → Phases 3–4.
