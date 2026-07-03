# Phase 1a — Walking-Skeleton MVP (BYO-key, local-first agentic core)

**Status:** 🟡 In progress  ·  **Estimate:** ~3–4 months  ·  **Depends on:** Phase 0
**Goal:** A narrow but END-TO-END working agentic core that runs fully local-first with the user's OWN
Claude/OpenAI/Gemini key — **observable + security-by-design**. ZERO dependency on a managed backend.
Deliberately narrow scope (vision/WebMCP/parallel-DAG/checkpoint-resume/prompt-rules → Phase 1b) to avoid
the "everything at once" immaturity trap.
**Branch examples:** `feat/model-gateway`, `feat/orchestrator`, `feat/agent-console`...

## Exit criteria (DoD) — quality floor cannot be lowered
- [~] **One concrete end-to-end agentic task** works: user prompt → Policy Kernel/HITL → CDP automation → Event Journal → Live Agent Console _(working end-to-end: prompt → ModelRouter → Planner (DAG) → ToolGateway Policy Kernel/HITL → built-in browser tools on the active tab → live Agent Console with approval modal. out-of-process CDP driver + a11y perception + page action tools (click/fill/press/scroll) landed (`CdpDriver`), and execution is now the **reactive** perceive→decide→act loop (`Reactor`) — the plan preview is still shown/approved (HITL), but the model then chooses each next action from the live page (so it can target real element `ref`s and recover from a failed step). Remaining: Event Journal projection of agent events + GUI/e2e verification of the CDP I/O)_
- [ ] MVP 4 conditions (valuable/usable/testable/deliverable) met; success criteria written (min/strong/failure-signal + metrics)
- [ ] Quality floor: input validation (zod) + error states (AppError) + logging (redacted) + Policy Kernel + HITL + backup/export awareness + handover note
- [ ] **i18n:** all shipped surfaces fully **en (primary) + tr (parity)**; no hardcoded strings (lint clean); IME regression matrix passes
- [ ] Coverage gate (S80/B70/F80/L80) + self-review/code-review + UAT signoff
- [x] Red-team injection corpus v1 passes; sensitive-site lockout + HITL scenarios tested _(deterministic corpus runs the real defense pipeline — sanitizer (zero-width/bidi/homoglyph/hidden) → taint→HITL → sensitive-site lockout → egress block/redaction; 11 cases, CI regression gate)_
- [x] Smart address bar omnibox suggestions (history/bookmark/tab/search + inline calc) + basic session restore work _(omnibox unified suggestions (history + bookmarks + open tabs + navigate/search) with `tab:`/`history:`/`bookmark:` prefixes + inline calc live; basic session restore (persist open tabs → restore on launch + Ctrl+Shift+T reopen-closed) live. Crash-safe/event-journal projection deferred within the L9 task note.)_

## Tasks

### L7 — Model Gateway (provider-agnostic, BYO-key)
- [ ] `base.provider` + `anthropic.provider` (Claude **default**: Opus 4.8 plan / Sonnet 4.6 exec / Haiku 4.5 classify) + `openai.provider` (2nd adapter); `gemini.provider` interface-ready
- [x] `LocalTransport` (BYO-key, **safeStorage** vault); `ModelTransport`/`ModelRouter` interfaces on day 1 (local SLM no-op) _(LocalTransport = CredentialVault (safeStorage/DPAPI); ModelRouter built: capability→tier (plan/exec/classify) + cost-saver local/cloud routing with Phase-1a local-SLM no-op → transparent cloud fallback; 7 tests. Real on-device transport execution lands in 1b)_
- [x] **Cost-saver preference** (persisted, settings-toggled): "use a local model for simple tasks" flag read by `ModelRouter`; in 1a the local SLM is a no-op placeholder → simple capabilities still resolve via cloud (real local routing activates in Phase 1b)
- [ ] **Every call:** mandatory `max_tokens` + timeout (30s/60s) + documented token budget; single singleton client per provider
- [ ] Token Ledger (SQLite, provider+model+capability) + live quota indicator + 80% warning + auto-refund (system error/CAPTCHA/loop)
- [ ] `technical-ai-doc.md` (models, DPA/model-card, risk category, human oversight, limits, UI disclosure)
- [x] ⚠️ model/SDK specifics (`output_config.effort` vs `budget_tokens`, `count_tokens`, prompt-caching) **verified against `claude-api` reference**

### L3 — Orchestrator (sequential; parallel in Phase 1b)
- [x] Planner: Intent → DAG (**sequential execution** first); each node risk-class (read/state-changing/destructive/financial) + cost estimate _(Planner Intent→DAG done + tested; risk-class enforced at the ToolGateway/Policy Kernel; per-node cost estimate pending. Execution has since moved from the static sequential `Executor` to the reactive `Reactor` loop (`reactor.ts`, 11 tests) — model decides the next tool call from the live page each turn, through the same ToolGateway PEP; the static Executor is retained for deterministic replays. Parallel DAG stays Phase 1b.)_
- [x] Editable **plan preview** (HITL) before execution _(after planning, the full DAG is shown in the Agent Console for review; the user can uncheck (skip) steps and must approve before ANY step runs — reject/timeout = nothing executes. en/tr)_
- [x] `MAX_AGENT_STEPS` hard-cap; Loop Detector (action-signature repeat → stop → HITL, credit preserved)
- [x] Human Handoff Controller: CAPTCHA/2FA detection → graceful handoff + notification (**NO auto-solve**) _(deterministic `detectHandoff(text,url)` in `@tepegoz/security-policy` (captcha + 2FA/OTP keyword/provider scan, captcha>2fa precedence, over-match-safe; 7 tests) → new Executor `guard` post-step hook + `'handoff'` StopReason (2 tests); AgentService wires it on perceived read content, emits a localized `'handoff'` console event + native OS Notification, and journals `HandoffRequested`. Agent never auto-solves; run stops, credit preserved. en/tr in the ext-agent dict, main-process `mainStrings().agent`.)_

### L4 — Perception + tool-executor (DOM/a11y; vision in Phase 1b)
- [x] CDP **out-of-process** driver; DOM + accessibility tree (`getFullAXTree`) perception _(`CdpDriver` (`apps/desktop/src/main/agent/cdp-driver.ts`) drives the active tab via `webContents.debugger` (out-of-process CDP), reads `Accessibility.getFullAXTree` → interactable-element set, and dispatches real `Input.*` events at the element box — never injects into the untrusted page. Pure element model (roles/sanitize/cap/ref-index) in `@tepegoz/tool-executor` `interactable.ts` (10 tests); new tools `browser_get_elements` (read) + `browser_update_page` (click/fill/press/scroll, state_changing→HITL) in `@tepegoz/browser-tools`. GUI/e2e verification of the CDP I/O still pending — unit layer green.)_
- [~] page-stability wait (network-idle + MutationObserver) _(load-idle (`did-stop-loading` + timeout) + a short settle delay bake into every CDP action; MutationObserver-based network-idle quiescence still pending)_
- [ ] background tab open (`active:false`, no focus steal) + **symmetric tab authority** (closes what it opens)
- [x] `Content Sanitizer`: hidden/CSS-hidden + zero-width/bidi/homoglyph filtering → `[hidden content filtered]` _(pure sanitizer: zero-width strip, bidi-control strip, mixed-script flag, hidden→placeholder, untrusted-content XML wrap + anti-injection footer; CSS-visibility detection lands with the perception layer)_

### L8 — Core security (deterministic)
- [x] **Policy Kernel** (BEFORE the LLM): classify tool call read/state-changing/high-risk; tainted-arg → escalate _(deterministic kernel + sensitive-site lockout + tests; wiring into the ToolGateway pending L5)_
- [x] Capability Broker (single least-privilege gate agent↔tool) + Taint/Provenance Tracker (web data = untrusted) _(Capability Broker = the ToolGateway single PEP (L5); Taint/Provenance Tracker added: web/model provenance = untrusted, verbatim data-flow taint of tool args → feeds Policy Kernel `taintedArgs`; 11 tests)_
- [x] **Egress Firewall (TS)**: Base64/high-entropy exfil + cross-origin PII/token + agentic-blabbering block _(pure intrinsic detector: secret tokens/keys (Anthropic/OpenAI/AWS/GitHub/Google/JWT/Bearer/PEM) → block; Base64 runs + high-Shannon-entropy + PII (email/IBAN/Luhn card) → warn; redacted findings; 13 tests. Origin-aware cross-origin policy + system-prompt-leak/blabbering canary detection layer on at integration)_
- [ ] HITL & **Windows Hello** (focus-safe modal; HIGH-RISK biometric); **sensitive-site lockout** (bank/crypto/password/health)
- [ ] Scoped Trust Profiles + **Permission Debug** (reason codes)

### L5 — Minimal Capability/Tool Plane (CLIENT only; SERVER in Phase 1b)
- [x] `CapabilityRegistry` + **`ToolGateway` (single PEP)** + built-in tools (browser_*, tab_*, dom_*, journal_*) _(registry + ToolGateway PEP wiring Policy Kernel/HITL/audit done + tested; built-in tools live: browser_get_page (sanitized perception), browser_update_location, tab_list_items, tab_create_item + **journal_search_events** (read-only audit-trail query over the append-only Event Journal via an injected `JournalReader` seam → keeps browser-tools persistence-free; zod-gated `{ limit?, correlationId? }`, returns compact already-redacted summaries; 3 tests) — all wired into the running app via AgentService)_
- [x] **Tool naming** `{domain}_{verb}_{noun}` (lint-enforced) + **standard error envelope** + create/upload `idempotencyKey`
- [x] MCP **client** (ADR-0018): external MCP servers' tools surfaced into the single ToolGateway PEP (NOT the Anthropic native connector — that would bypass the local Policy Kernel) via a thin **stdio supervisor** (exponential backoff + reconnect + `reconcile`). New `@tepegoz/mcp-client` (Electron-free: SDK `Client`+`StdioClientTransport` injected by `main/mcp/*.electron.ts`): `NameMapper` maps external names → conformant synthetic ids (`{domain}_{verb}_{noun}` + reverse), zod re-validates every SDK response, **ajv** validates tool inputs at the boundary, annotations→dangerClass is fail-safe (`readOnlyHint`→read else `state_changing`→HITL), `CapabilityRegistry.unregister` added. Config from **prefs + enabled-extensions' `manifest.mcpServer`** (extension "skills" become agent tools). Read-only Settings→Connections status list (en/tr). 33 mcp-client tests + registry/preferences/extension-sdk/config-source tests. _(Anthropic native connector + tepegöz-as-MCP-server → Phase 1b.)_
- [ ] tool-search defer rule (≥1 non-deferred); all tool inputs zod-validated in main before execution

### L9 — First-class browser UI (KUIreact-first, P0)
- [ ] **Command Palette** (Ctrl+K, 4 modes: Chat/Do/Make/Tasks) — KUIreact Modal+Input+virtualized
- [~] Deterministic **smart address bar / omnibox** (does NOT start an AI thread): unified suggestions (history + bookmark + open tabs + default search engine) + **inline calculation** (`2+2`, unit convert) + `tab:`/`history:`/`bookmark:` filter prefixes + **quick-settings** access (theme/language/privacy toggle); suggestion source zod-validated, no raw-HTML render _(inline calculation live: safe recursive-descent evaluator (no eval) shows `= result` in the omnibox and copies on Enter; the omnibox stays deterministic (no AI thread). **Unified suggestions dropdown live**: navigate/search primary action + matching open tabs (switch-to-tab) + **bookmarks** (curated, ranked above history) + browsing history (most-visited-first) + `tab:`/`history:`/`bookmark:` scope prefixes, cross-source URL dedup — pure `buildOmniboxSuggestions` in `@tepegoz/omnibox` (23 tests), full keyboard nav (↑/↓/Enter/Esc) + ARIA combobox/listbox, plain-text render (no raw HTML), en/tr hints. Remaining: unit-convert + quick-settings access)_
- [x] **Live Agent Console** (per step: URL/action/%progress/checkpoint/token-cost/error + timeline replay; **virtualized**) _(live per-step event stream (plan/step_start/step_ok/step_error/awaiting_approval/done/error) + Do-mode prompt + blocking HITL approval modal + AI-disclaimer + cancel, en/tr. Remaining: token-cost column, timeline replay, list virtualization)_
- [~] Browser shell: tab (optional group toggle), new-tab 3 options (AI/Favorites/Blank), reading mode, bookmark, OS-native password/passkey **POC** _(full WebAuthn + password manager → Phase 2)_ _(**bookmark** live: `BookmarkStore` (persistence, migration v3, 6 tests) + zod-gated IPC (toggle/list/is-bookmarked, http(s)-only) + Chrome-style star toggle right of the omnibox (filled/outline, disabled on non-web pages, en/tr) feeding the omnibox bookmark suggestions. Remaining: tab groups, new-tab 3-options, reading mode, password/passkey POC)_
- [~] **Basic session restore**: persist open tabs on quit/crash → restore on launch + reopen-closed-tab (Ctrl+Shift+T); event-journal projection (ADR-0004). _(Full workspace/named-session UI → Phase 2b.)_ _(**live**: `SessionStore` (persistence, JSON snapshot in the local `meta` table, defensive shape-validating `load`, 6 tests) persists the ordered web-tab URLs + active index (debounced on state change + synchronously on window close, before `reset`); `TabManager.restoreSession()` reopens them on launch (first focused, rest background) or a single default tab if none. Reopen-closed-tab via an in-memory LIFO stack (cap 25) → `tabs:reopen-closed` IPC + **Ctrl+Shift+T** (renderer shortcut + native ⋮-menu item, en/tr). Remaining: crash-safe snapshot on unclean exit + event-journal projection)_
- [x] **Settings page** (KUIreact, polished) — sectioned: **Providers & API keys** (safeStorage entry/validate/remove), **Appearance** (theme tokens), **Language** (runtime en/tr switch), **Privacy & telemetry** (default OFF, sensitive-site lockout), **Agent behavior**; hosts the **cost-saver "use a local model for simple tasks" toggle** (persisted via the L7 preference) _(Chrome-style: opens as an internal **tepegoz://settings** tab with a left-sidebar + search + sections)_
- [~] **Internal extension framework** (pulled forward from L10) — uniform built-in extension registry (Agent = first extension) shown as **toolbar icons right of the omnibox** (Chrome-style) + a puzzle → **tepegoz://extensions** manager (searchable cards + per-extension status toggle, persisted in prefs) + a ⋮-menu Extensions submenu. Generalized internal-page model (tepegoz://settings + tepegoz://extensions rendered by the trusted chrome as view-less tabs). _MV3 / third-party extensions remain L10 / Phase 3._
- [~] Token/quota indicator + Connection Health Panel (reason codes) + onboarding **privacy/consent wizard** (telemetry OFF default, sensitive-site locked) _(live token indicator in the Agent Console — aggregate in/out/total from the Token Ledger, pushed after each run + on demand. Connection Health Panel + onboarding consent wizard pending)_
- [~] **Theme engine** (system/light/dark): single app-wide theme application path that updates renderer, popup, and internal-page surfaces from the `theme` preference; live OS theme sync, early boot apply to avoid FOUC, and token-level contrast consistency across light/dark surfaces.
- [ ] frameless title bar (drag/no-drag + platform caption) + platform conventions + WCAG 2.2 AA + single SHORTCUTS registry + theme tokens

### i18n + IME (en primary; Turkish first-class) — on top of day-0 infra
> **Model:** strings live **per package** ([ADR-0016](../docs/adr/0016-per-package-i18n.md)) — each owner's
> `src/i18n` dict via `defineDict`, React surfaces `useT(dict)`, main via `pick`/`mainStrings`, leaves
> string-free. The parity/no-hardcoded/full-en+tr outcomes below hold **per dict**.
- [ ] Full **English** UI/help/error/permission (**en primary/source**) + **Turkish full parity** (first-class)
- [ ] Fill IME regression matrix (Turkish TEXT input, independent of UI language): Turkish-Q/F, dead keys, ç/ğ/ı/ö/ş/ü; side-panel/command-palette inputs
- [x] runtime language switch; default = OS language (fallback to en if unsupported)

### AI Integration rules (implementation)
- [ ] **Streaming not written to DB** → on full validated response, one "committed" event to Journal
- [x] **Raw AI output not rendered as HTML** (safe markdown); page content to model wrapped with XML-delimiter + anti-injection footer _(perception wraps page text via wrapUntrustedContent (XML delimiter + anti-injection footer); Agent Console renders plain text, never HTML. Rich safe-markdown rendering of chat output is a later surface)_
- [x] "AI-generated, may be wrong" label on every output; review&edit on side-effect actions _(AI-disclaimer in the Agent Console; side-effecting tools (state_changing/destructive/financial) gated by HITL approval modal via the Policy Kernel)_
- [~] **Irreversible action → HITL before agent loop**; PII redaction; EU AI Act risk gate _(HITL gates state-changing/destructive/financial tools at the ToolGateway; PII/egress redaction available via the Egress Firewall (wiring into the model-egress path pending); EU AI Act gate pending)_

### Minimal safe-browsing core
- [ ] Safe Browsing v5 **hash-prefix lookup** (URL never sent) + Egress Firewall core (not full adblock/extensions)

### Test
- [x] **Deterministic agent-eval** (recorded HAR/DOM fixtures + golden-LLM replay) _(golden-LLM replay via MockProvider canned plan → real Planner (parse/validate/unknown-tool reject) → Executor → ToolGateway (Policy Kernel + HITL approve/deny) → asserted outcomes; no network/key. HAR/DOM page fixtures land with the CDP perception layer)_
- [ ] Playwright `_electron` E2E (fixed test profile + **mock provider**)
- [ ] Red-team injection corpus v1; coverage gate; SQLite migration-safe tests
