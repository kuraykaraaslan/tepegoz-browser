# Phase 1b — Agentic Deepening

**Status:** 🟡 Early down-payments  ·  **Estimate:** ~4–6 months  ·  **Depends on:** Phase 1a
**Goal:** Full agentic capabilities on top of the walking skeleton: multi-tab parallelism, durability
(checkpoint/resume + cross-agent handoff), per-task memory (GB scale), prompt/rules engine, vision
fallback, full capability plane, **tepegoz's MCP SERVER surface**, local SLM.

## Exit criteria (DoD)
- [ ] Multi-tab parallel task observable + resume success rate ≥ 95%
- [ ] Cross-agent handoff: one agent's half-finished task is continued by another (incl. a different model) from where it stopped
- [ ] Per-task memory GB-scale thresholds measured + documented (sqlite-vec → ANN switch threshold)
- [ ] **tepegoz MCP server** is consumable from an external client (Claude/ChatGPT/Cursor); MCP_Server_Design_Rules compliant
- [ ] **i18n:** en+tr keys added for new surfaces (memory audit panel, skills, prompt/rules UI, MCP server settings)
- [ ] Coverage + self-review + UAT signoff + migration-safe

## Tasks

### L3 — Parallel DAG execution (Shadow Workspace)
- [ ] Scheduler: topological order → independent branches to parallel workers; join sync; **adaptive throttling** (default 5)
- [~] sync/async/multi-tab **single abstraction**; each branch isolated BrowserContext + Agent Console stream _(down-payment shipped: browser tools accept optional `tabId`, desktop `BrowserHost` resolves target `WebContents` by tab, `AgentRunDeps.tabUrl(tabId)` feeds the correct URL into policy context, and CDP element refs are isolated per WebContents. **Per-tab `HumanInputAdapter` landed** — an adapter is now keyed by `WebContents` (WeakMap) with its CDP transport bound to that one tab, closing a real bug where naming a `tabId` silently dropped humanization, cursor motion AND `input_action` narration (the action teleported); `isPerceivable` is now asked per tab, so a background-driven tab drops pacing but never events. 3 tests. Still pending: true parallel branch scheduler, isolated BrowserContexts per branch, and per-branch Agent Console streams.)_
- [x] Tab-control foundation for multi-tab tasks: `tab_create_item`, `tab_list_items`, `tab_get_item`, `tab_update_item`, and `tab_delete_item` are available behind the CapabilityRegistry/ToolGateway; new tabs open in the background by default to avoid stealing focus.

> **Concurrency blockers — all six cleared 2026-08-20.** Agent
> *conversations* are ALREADY tab-group-scoped end to end (session key = groupId;
> `conversations`/`activeConversationIds` maps, the SQLite `group_id` column, `groupStates` in the panel,
> and `groupId` on every IPC event), a **per-group** run lock already exists next to the process-global
> one, and the panel already swaps content on group switch. What forced the global lock was the shared
> **page-driving** layer:
> 1. ~~one `HumanInputAdapter` for all tabs~~ — **done**, per-`WebContents` (see the row above).
> 2. ~~`CdpDriver.attached` is a single `WebContents`; `ensureAttached` detaches the rival tab~~ —
>    **done**: attachments are a per-tab `WeakSet`, so two tabs can be driven at once. Stated cost: N
>    driven tabs keep N sessions' domains enabled until those tabs are destroyed.
> 3. ~~`TabManager.webContentsForTab` resolves only against the focused window~~ — **done**: it now
>    searches every window (focused first), so a torn-off tab stays reachable by the run that opened it.
> 4. ~~`TokenLedger` statics + `reset()` at every run start~~ — **done**: per-run accumulators under an
>    `AsyncLocalStorage` scope wrapping the run *and its `finally`*, plus an ambient ledger for
>    out-of-run callers (translate/typo extensions). A run's `reset()` can no longer zero another's.
> 5. ~~a single `currentAgentRunId/GroupId/Send` pointer~~ — **done**: a runId-keyed channel map +
>    an ambient run scope. Out-of-band narration (input actions, pause/resume/steer) used to be
>    delivered to whichever run started LAST, labelled with that run's ids.
>
> 6. ~~"the active tab" is global, so two runs fight over one page~~ — **done**, and it is what let the
>    process-global lock go. A run now holds its **own working tab**: it latches the globally-active tab
>    the first time it needs one, then keeps driving that tab, following only its OWN navigations
>    (foreground `createTab`, `activateTab`, the newtab replace-in-place). The latch is what preserves
>    "summarize this page" — the page the user was looking at when they asked is the page the run binds
>    to, group membership irrelevant — while making two runs resolve to different tabs. It also fixes a
>    standing bug: a user switching tabs mid-run used to silently re-target the agent's next
>    `tabId`-less action. Policy site context (`activeTabUrl`) resolves through the SAME path, so the
>    site a call is judged against is always the site it will hit. Background tasks get their own latch
>    + group via `registerHeadlessRun`, so an unattended task cannot drive the user's foreground tab.
>
> **The process-global lock is GONE (2026-08-20); the gate is now one run per tab group.** What is still
> shared is deliberate: `ModelGateway.modelOverride` (a *preference* — applying to every live run is the
> intent) and `userHasControl` (yielding every run when the human grabs the mouse is the point).
>
> **Consequence handled the same day — unwatched approvals.** The Agent panel draws ONE group at a
> time, so an approval raised for another group landed in that group's state and was never drawn: the
> run would sit invisible until the 120s fail-safe rejected it, and the user would watch a task "fail"
> for no observable reason. Main now compares the request's group with the group of the tab the user is
> actually looking at, and pushes a centre/toast/native notification only when they differ (silent for
> the watched group, whose modal is already on screen — a duplicate there is the noise that teaches
> people to ignore the channel). en+tr.
>
> Two constraints hold throughout: ADR-0020 — a group may carry a **binding/UI** setting but **never** a
> policy/permission scope (so per-group *autonomy or permission* settings stay forbidden even once
> per-group runs exist) — and the group lifecycle is not the conversation lifecycle:
> `TabStore.normalize()` **prunes an empty group**, so a conversation must outlive the group id it was
> opened under.

### L2 — Durable handoff (extra requirement #1)
- [ ] XState node state machine (PENDING→READY→LEASED→RUNNING→{SUCCEEDED|FAILED|AWAITING_HITL|COMPENSATING})
- [~] Snapshot Store + Checkpointer (node boundary + periodic); resume = nearest snapshot + delta replay _(down-payment shipped: runtime checkpoints now capture plan decision, last successful step, page/tab snapshot metadata, terminal reason, and recovery advice, and desktop projects them into the Event Journal as `CheckpointWritten`. Still pending: durable resume from nearest checkpoint + delta replay.)_
- [ ] **Effect Ledger** (`idempotencyKey` + `fencing_token`) → no double side-effect on replay; Lease Manager (TTL + heartbeat)
- [ ] **agent-agnostic Context Package** (goal + hashed guardrail set + memory ref + last checkpoint LSN + open nodes + artifact summaries); provider transcript NOT embedded
- [ ] Recovery Coordinator + power-monitor resume; **handoff only at safe checkpoint boundaries**; rehydration protocol (rebuild CDP/MCP/sandbox/OAuth); different-model thinking-loss accepted + summary recovery
- [x] Run-scope isolation foundation: HITL/audit callbacks are scoped with `ToolGateway.runWithHandlers`, so future resumed/parallel runs do not share mutable handler state.
- [x] Cancel/start failure foundation: active run controllers are registered for cancellation, overlapping runs in the SAME tab group are fail-closed (the process-wide gate was retired 2026-08-20 — see the concurrency-blocker note above), and pre-stream startup failures surface in the Agent Console as `error` events.
- [x] Recovery taxonomy: classify transient navigation timeouts, stale element refs, page-changed failures, policy denial, auth/handoff, validation/unknown failures, and malformed model output before retrying.
- [x] Bounded recovery strategy: malformed model decisions get limited JSON repair attempts; recoverable tool failures feed back concrete next-step advice (`browser_get_elements`, `browser_validate_page`, `browser_get_page`) and repeated same-kind failures fail closed.

### L2 — Per-task memory (extra requirement #2, GB scale)
- [ ] `mem_<taskId>.sqlite` + CAS isolation; tiered HOT(RAM/LRU)/WARM(SQLite+FTS5+vec)/COLD(zstd)/CAS(blob)
- [ ] HybridRetriever: FTS5(BM25) + sqlite-vec(cosine) → RRF; embedding bge-m3/e5
- [ ] **Numeric decisions:** spill threshold, record/disk cost, **sqlite-vec → hnswlib/LanceDB ANN switch threshold** (~50–100k) — measure+document
- [ ] retention/GC (old task DBs + CAS refcount); shared-vs-isolated memory boundary + conflict
- [ ] **Memory Audit Panel** (viewable/deletable, default OFF opt-in)

### L8 — Prompt/Rules engine (extra requirement #3)
- [ ] PromptTemplate + Rule → `tepegoz.md`/`*.rules.yaml`/`*.prompt.md` → compiled JSON IR
- [ ] inheritance global→workspace→task→step; **sealed one-way narrowing** (Policy Kernel enforces deterministically; LLM-guidance part separate)
- [ ] versioning + signature; **template variable sanitization** (template injection); mid-conversation system message channel

### L4 — Vision fallback
- [ ] Vision only when DOM insufficient/layout changed (not every step); vision-heavy steps routed to Opus (high-res vision is Opus 4.7+)
- [x] Non-vision action verification foundation: `browser_validate_page` waits for load, reads the target page, returns URL/title, and optionally verifies expected text after navigation/page actions.
- [x] Screenshot/vision fallback foundation: when DOM/a11y + `browser_validate_page` are insufficient,
      `browser_get_screenshot` captures the target tab as viewport or bounded fullPage PNG and passes
      metadata + untrusted visual context to the model. Still pending above: vision-heavy model routing policy.

### L5 — Full Capability Plane + **tepegoz = MCP SERVER**
- [ ] **SkillRuntime** (SKILL.md frontmatter + lazy progressive-disclosure) + SkillRegistry + versioning
- [ ] tool-search optimization (Anthropic server-side); CapabilitySandbox (child process + Windows Job Object + fs/net allowlist; file:// off)
- [ ] **tepegoz MCP SERVER surface:** exposes its own tools (browser_*/tab_*/dom_*/journal_*) to external clients
  - [ ] transport: stdio + Streamable HTTP/SSE
  - [ ] **MCP_Server_Design_Rules compliance:** tool naming, standard error envelope, idempotency, **Bearer auth** (token never in tool param/log/response), one-domain-per-server, thin stateless handlers
  - [ ] inbound security: auth + **rate-limit** + schema validation; every exposed tool passes Policy Kernel + permission + audit (same gate as the internal surface)
  - [ ] end-to-end smoke with external client (Claude/ChatGPT/Cursor) + ADR (separate process + trust boundary)

### L7 — Local SLM + context management
- [ ] ONNX Runtime + DirectML (Windows NPU/GPU; CPU fallback) — summarize/classify/redact/loop-detect/embed on device
- [ ] **ModelRouter honors the cost-saver toggle** (Phase 1a settings flag): when ON, simple capabilities (classify/summarize/redact/loop-detect/embed) run on the local SLM to cut AI cost; transparent fallback to cloud on low confidence / unsupported task; per-capability routing + estimated savings surfaced in the Token Ledger
- [ ] Egress Firewall TS → **Rust (napi-rs)** port; compaction via local SLM or Sonnet (NOT Haiku)
- [ ] screenshot eviction (last 1-2 + `cas://hash`) + threshold-based compaction + prompt-cache prefix
- [ ] _Scope note:_ browser-level **tab discard/sleep + Task Manager UI** live in **Phase 2b** (OS
      integration & diagnostics). This L7 eviction/compaction is **agent-context** memory only — keep the
      two separate so the discard strategy is not registered twice.
