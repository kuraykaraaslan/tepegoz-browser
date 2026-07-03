# Phase 1b — Agentic Deepening

**Status:** ⬜ Not started  ·  **Estimate:** ~4–6 months  ·  **Depends on:** Phase 1a
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
- [ ] sync/async/multi-tab **single abstraction**; each branch isolated BrowserContext + Agent Console stream

### L2 — Durable handoff (extra requirement #1)
- [ ] XState node state machine (PENDING→READY→LEASED→RUNNING→{SUCCEEDED|FAILED|AWAITING_HITL|COMPENSATING})
- [ ] Snapshot Store + Checkpointer (node boundary + periodic); resume = nearest snapshot + delta replay
- [ ] **Effect Ledger** (`idempotencyKey` + `fencing_token`) → no double side-effect on replay; Lease Manager (TTL + heartbeat)
- [ ] **agent-agnostic Context Package** (goal + hashed guardrail set + memory ref + last checkpoint LSN + open nodes + artifact summaries); provider transcript NOT embedded
- [ ] Recovery Coordinator + power-monitor resume; **handoff only at safe checkpoint boundaries**; rehydration protocol (rebuild CDP/MCP/sandbox/OAuth); different-model thinking-loss accepted + summary recovery

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
