# Phase 1a — Walking-Skeleton MVP (BYO-key, local-first agentic core)

**Status:** 🟡 In progress  ·  **Estimate:** ~3–4 months  ·  **Depends on:** Phase 0
**Goal:** A narrow but END-TO-END working agentic core that runs fully local-first with the user's OWN
Claude/OpenAI/Gemini key — **observable + security-by-design**. ZERO dependency on a managed backend.
Deliberately narrow scope (vision/WebMCP/parallel-DAG/checkpoint-resume/prompt-rules → Phase 1b) to avoid
the "everything at once" immaturity trap.
**Branch examples:** `feat/model-gateway`, `feat/orchestrator`, `feat/agent-console`...

## Exit criteria (DoD) — quality floor cannot be lowered
- [ ] **One concrete end-to-end agentic task** works: user prompt → Policy Kernel/HITL → CDP automation → Event Journal → Live Agent Console
- [ ] MVP 4 conditions (valuable/usable/testable/deliverable) met; success criteria written (min/strong/failure-signal + metrics)
- [ ] Quality floor: input validation (zod) + error states (AppError) + logging (redacted) + Policy Kernel + HITL + backup/export awareness + handover note
- [ ] **i18n:** all shipped surfaces fully **en (primary) + tr (parity)**; no hardcoded strings (lint clean); IME regression matrix passes
- [ ] Coverage gate (S80/B70/F80/L80) + self-review/code-review + UAT signoff
- [ ] Red-team injection corpus v1 passes; sensitive-site lockout + HITL scenarios tested
- [ ] Smart address bar omnibox suggestions (history/bookmark/tab/search + inline calc) + basic session restore work

## Tasks

### L7 — Model Gateway (provider-agnostic, BYO-key)
- [ ] `base.provider` + `anthropic.provider` (Claude **default**: Opus 4.8 plan / Sonnet 4.6 exec / Haiku 4.5 classify) + `openai.provider` (2nd adapter); `gemini.provider` interface-ready
- [ ] `LocalTransport` (BYO-key, **safeStorage** vault); `ModelTransport`/`ModelRouter` interfaces on day 1 (local SLM no-op)
- [x] **Cost-saver preference** (persisted, settings-toggled): "use a local model for simple tasks" flag read by `ModelRouter`; in 1a the local SLM is a no-op placeholder → simple capabilities still resolve via cloud (real local routing activates in Phase 1b)
- [ ] **Every call:** mandatory `max_tokens` + timeout (30s/60s) + documented token budget; single singleton client per provider
- [ ] Token Ledger (SQLite, provider+model+capability) + live quota indicator + 80% warning + auto-refund (system error/CAPTCHA/loop)
- [ ] `technical-ai-doc.md` (models, DPA/model-card, risk category, human oversight, limits, UI disclosure)
- [x] ⚠️ model/SDK specifics (`output_config.effort` vs `budget_tokens`, `count_tokens`, prompt-caching) **verified against `claude-api` reference**

### L3 — Orchestrator (sequential; parallel in Phase 1b)
- [x] Planner: Intent → DAG (**sequential execution** first); each node risk-class (read/state-changing/destructive/financial) + cost estimate _(Planner Intent→DAG + sequential Executor done + tested; risk-class enforced at the ToolGateway/Policy Kernel; per-node cost estimate pending)_
- [ ] Editable **plan preview** (HITL) before execution
- [x] `MAX_AGENT_STEPS` hard-cap; Loop Detector (action-signature repeat → stop → HITL, credit preserved)
- [ ] Human Handoff Controller: CAPTCHA/2FA detection → graceful handoff + notification (**NO auto-solve**)

### L4 — Perception + tool-executor (DOM/a11y; vision in Phase 1b)
- [ ] CDP **out-of-process** driver; DOM + accessibility tree (`getFullAXTree`) perception
- [ ] page-stability wait (network-idle + MutationObserver)
- [ ] background tab open (`active:false`, no focus steal) + **symmetric tab authority** (closes what it opens)
- [x] `Content Sanitizer`: hidden/CSS-hidden + zero-width/bidi/homoglyph filtering → `[hidden content filtered]` _(pure sanitizer: zero-width strip, bidi-control strip, mixed-script flag, hidden→placeholder, untrusted-content XML wrap + anti-injection footer; CSS-visibility detection lands with the perception layer)_

### L8 — Core security (deterministic)
- [x] **Policy Kernel** (BEFORE the LLM): classify tool call read/state-changing/high-risk; tainted-arg → escalate _(deterministic kernel + sensitive-site lockout + tests; wiring into the ToolGateway pending L5)_
- [x] Capability Broker (single least-privilege gate agent↔tool) + Taint/Provenance Tracker (web data = untrusted) _(Capability Broker = the ToolGateway single PEP (L5); Taint/Provenance Tracker added: web/model provenance = untrusted, verbatim data-flow taint of tool args → feeds Policy Kernel `taintedArgs`; 11 tests)_
- [x] **Egress Firewall (TS)**: Base64/high-entropy exfil + cross-origin PII/token + agentic-blabbering block _(pure intrinsic detector: secret tokens/keys (Anthropic/OpenAI/AWS/GitHub/Google/JWT/Bearer/PEM) → block; Base64 runs + high-Shannon-entropy + PII (email/IBAN/Luhn card) → warn; redacted findings; 13 tests. Origin-aware cross-origin policy + system-prompt-leak/blabbering canary detection layer on at integration)_
- [ ] HITL & **Windows Hello** (focus-safe modal; HIGH-RISK biometric); **sensitive-site lockout** (bank/crypto/password/health)
- [ ] Scoped Trust Profiles + **Permission Debug** (reason codes)

### L5 — Minimal Capability/Tool Plane (CLIENT only; SERVER in Phase 1b)
- [ ] `CapabilityRegistry` + **`ToolGateway` (single PEP)** + built-in tools (browser_*, tab_*, dom_*, journal_*) _(registry + ToolGateway PEP wiring Policy Kernel/HITL/audit done + tested; built-in tools pending)_
- [x] **Tool naming** `{domain}_{verb}_{noun}` (lint-enforced) + **standard error envelope** + create/upload `idempotencyKey`
- [ ] MCP **client**: prefer Anthropic native connector (`mcp_servers`/`mcp_toolset`); thin stdio supervisor (health/backoff)
- [ ] tool-search defer rule (≥1 non-deferred); all tool inputs zod-validated in main before execution

### L9 — First-class browser UI (KUIreact-first, P0)
- [ ] **Command Palette** (Ctrl+K, 4 modes: Chat/Do/Make/Tasks) — KUIreact Modal+Input+virtualized
- [ ] Deterministic **smart address bar / omnibox** (does NOT start an AI thread): unified suggestions (history + bookmark + open tabs + default search engine) + **inline calculation** (`2+2`, unit convert) + `tab:`/`history:`/`bookmark:` filter prefixes + **quick-settings** access (theme/language/privacy toggle); suggestion source zod-validated, no raw-HTML render
- [ ] **Live Agent Console** (per step: URL/action/%progress/checkpoint/token-cost/error + timeline replay; **virtualized**)
- [ ] Browser shell: tab (optional group toggle), new-tab 3 options (AI/Favorites/Blank), reading mode, bookmark, OS-native password/passkey **POC** _(full WebAuthn + password manager → Phase 2)_
- [ ] **Basic session restore**: persist open tabs on quit/crash → restore on launch + reopen-closed-tab (Ctrl+Shift+T); event-journal projection (ADR-0004). _(Full workspace/named-session UI → Phase 2b.)_
- [x] **Settings page** (KUIreact, polished) — sectioned: **Providers & API keys** (safeStorage entry/validate/remove), **Appearance** (theme tokens), **Language** (runtime en/tr switch), **Privacy & telemetry** (default OFF, sensitive-site lockout), **Agent behavior**; hosts the **cost-saver "use a local model for simple tasks" toggle** (persisted via the L7 preference)
- [ ] Token/quota indicator + Connection Health Panel (reason codes) + onboarding **privacy/consent wizard** (telemetry OFF default, sensitive-site locked)
- [ ] frameless title bar (drag/no-drag + platform caption) + platform conventions + WCAG 2.2 AA + single SHORTCUTS registry + theme tokens

### i18n + IME (en primary; Turkish first-class) — on top of day-0 infra
- [ ] Full **English** UI/help/error/permission (**en primary/source**) + **Turkish full parity** (first-class)
- [ ] Fill IME regression matrix (Turkish TEXT input, independent of UI language): Turkish-Q/F, dead keys, ç/ğ/ı/ö/ş/ü; side-panel/command-palette inputs
- [x] runtime language switch; default = OS language (fallback to en if unsupported)

### AI Integration rules (implementation)
- [ ] **Streaming not written to DB** → on full validated response, one "committed" event to Journal
- [ ] **Raw AI output not rendered as HTML** (safe markdown); page content to model wrapped with XML-delimiter + anti-injection footer
- [ ] "AI-generated, may be wrong" label on every output; review&edit on side-effect actions
- [ ] **Irreversible action → HITL before agent loop**; PII redaction; EU AI Act risk gate

### Minimal safe-browsing core
- [ ] Safe Browsing v5 **hash-prefix lookup** (URL never sent) + Egress Firewall core (not full adblock/extensions)

### Test
- [ ] **Deterministic agent-eval** (recorded HAR/DOM fixtures + golden-LLM replay)
- [ ] Playwright `_electron` E2E (fixed test profile + **mock provider**)
- [ ] Red-team injection corpus v1; coverage gate; SQLite migration-safe tests
