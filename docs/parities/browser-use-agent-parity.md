# Track — Browser Use agent-capability parity

**Status:** 📋 **Proposed — not scheduled (2026-09-01).** No branch, no ADR number reserved, no owner
sign-off. This is a captured gap list in the shape of
[`browser-settings-feature-gap.md`](../tracks/browser-settings-feature-gap.md),
[`webbrain-agent-parity.md`](webbrain-agent-parity.md) and
[`aipex-agent-parity.md`](aipex-agent-parity.md): every row names its nearest existing Tepegöz
behaviour and a suggested phase home, so a future session can promote a row into a real `phase-*.md`
task or an `ai-agent` PR without re-deriving the comparison.

**Source:** a same-session deep read of `.junk/browser-use` (`browser-use` **v0.13.8** — a shipping,
MIT-licensed **Python library** that drives a Chromium instance via CDP; no GUI, plus a separate,
closed, paid **Browser Use Cloud** product) against this repo's AI surface
(`phases/ai-agent/{README,history,constitution}.md` + S0–S12, `packages/orchestrator|
model-gateway|capability-plane|security-policy|agent-runtime|browser-tools|web-tools|tool-executor|
local-inference|model-catalog|mcp-client|recipe-compiler|macro-engine|notary|credential-vault|
human-input`, `extensions/ext-agent`, `docs/adr/*`). The prose comparison this track distills is
[`docs/others/tepegoz-vs-browser-use.md`](../versus/tepegoz-vs-browser-use.md) (Turkish,
2026-09-01); this file is the durable English track artifact. Key claims were re-verified against
source rather than trusted from the comparison or from browser-use's own docs (which, per §2 below,
disagree with their own code in several places): `browser_use/agent/{service,prompts,views,judge,
variable_detector}.py`, `agent/system_prompts/system_prompt.md` + `system_prompt_flash.md`,
`agent/message_manager/service.py`, `tools/service.py`, `tools/registry/{service,views}.py`,
`tools/extraction/*`, `llm/{__init__,base,views}.py` + the `openai/anthropic/openrouter/orcarouter/
browser_use` provider subpackages, `browser/watchdogs/security_watchdog.py`,
`dom/serializer/serializer.py`, `mcp/{client,server,cli_mcp}.py` + `manifest.json` + root `server.json`,
`skills/service.py` + `skills/browser-use/SKILL.md`, `filesystem/file_system.py`, `tokens/service.py`,
`actor/*`, `integrations/gmail/*`, `sandbox/*`, `beta/service.py`, `README.md`/`CLAUDE.md`/`AGENTS.md`/
`BETA_AGENT_INTEGRATION_FEATURES.md`/`CLOUD.md`, `pyproject.toml`. On the Tepegöz side, claims were
checked against `packages/model-gateway/src/providers/openai-compat.provider.ts`,
`packages/shared-types/src/providers.ts`, `packages/security-policy/src/egress-firewall.ts`,
`packages/mcp-client/src/{connection,danger}.ts`, `docs/adr/{0026,0029,0039}-*.md`,
`docs/adr/0022-file-operations-sandbox.md`, `phases/ai-agent/history.md`, and
`phases/ai-agent/phase-s9-memory-skills.md`.

**Not an arm's-length rival.** Unlike WebBrain and AIPex, `browser-use` is Tepegöz's own agent's
**named technique-ancestor**. `phases/ai-agent/history.md`'s "build vs. buy" record already
evaluated it by name and rejected it **as a runtime dependency** ("Python (~99%) + Playwright: embedding
it means a separate Chromium and a Python sidecar... a packaging, security, and architecture liability")
while directing the program to **port its techniques** through `nanobrowser` (a TypeScript/CDP port of
the same approach) as the "ready reference." `apps/desktop/src/main/agent/build-dom-tree-script.ts`
still carries the header _"ported from the browser-use / nanobrowser technique"_ and runs in an isolated
world. This track is therefore not "what should we copy from a competitor" so much as **an audit of the
donor**, now that the port has shipped and matured independently: what did the original actually get
right that the port left on the table, and — just as important — what did it get right that Tepegöz's
own standing decisions (ADR-0026 chief among them) already correctly declined to copy.

## Why this track exists

The comparison lands on a doubly asymmetric picture. **Browser Use is a mature, widely-used Python
_library_** — 16+ first-class provider adapters (plus hundreds more through its own cloud model-routing
gateway), a raw-JavaScript `evaluate` tool, real 500-step production runs, a documented (if
convention-based) TOTP 2FA mechanism, both an MCP client _and_ two different MCP servers, an external
benchmark repo with a self-reported "#1 on the Odysseys leaderboard" claim — **and it has no GUI**: it is
consumed by developers writing their own automation code, not by an end user. **Tepegöz is a full
browser** whose agent is one subsystem among many, designed around a pre-model deterministic Policy
Kernel, an egress firewall, cryptographic replay receipts, and a fabricated-success detector browser-use
has no equivalent of — and, per `ai-agent`'s own honest status, has proven almost none of it at
claim-grade yet (every S-phase sits 🟠 measurement-owed). Reading the source rather than the marketing
narrows this further than the prose comparison alone suggests: several capabilities the comparison
credits to browser-use's "breadth" turn out, on inspection, to be **either a cloud-only feature with no
OSS mechanism at all** (CAPTCHA solving), **a hand-copied pattern repeated per provider rather than a
reusable abstraction** (there is no generic "OpenAI-compatible provider" class in browser-use — Tepegöz's
own `openai-compat.provider.ts` base class is already better factored), or **already fully owned by a
sibling track** (`webbrain-agent-parity.md` P1 already proposes the exact local-HTTP-server-engine +
generic-provider-catalog idea this comparison would otherwise re-derive). What is left, once the
already-rejected, already-owned-elsewhere, and already-ahead items are set aside, is a short list of
concrete, source-verified techniques worth porting **as behavior, never as code** — and one very old,
very on-point instruction this repo has been given twice now: _learn from `browser-use`, never adopt it
as a runtime dependency._

## How to read this

Each workstream below is written like an `ai-agent` phase section (Goal → Approach → new/changed
packages → ADR → DoD-shaped bullets) so it can be lifted into a real phase file with minimal rewriting.
**Nothing here is committed roadmap.** Where a capability already has a named home in an existing phase,
ADR, or a sibling track, this file says so explicitly and does **not** re-describe it — per the
"Already planned — do NOT re-propose" rule in
[`../README.md`](../../phases/README.md#deferred--adoption-gated-backlog-from-the-beyond-phases-synthesis), MCP
server / vision fallback / local-SLM / cost-saver toggle are **Phase 1b**; the managed zero-setup cloud
default is **Phase 3**. This track leans on its two siblings more than it re-derives: `webbrain-agent-
parity.md` **P1** (provider catalog + local HTTP-server engines) and **P3-a/b** (PDF/frame/shadow-DOM
perception) and **P9-a** (mid-run compaction) already cover most of what browser-use's source confirms
is missing; `aipex-agent-parity.md` **P1** already has the detailed, Bearer-token-gated MCP-server design
this repo would want regardless of which rival is being read. Citing them here, rather than writing a
second version, **is** the point of a track folder that already has two entries in it.

## Ground rules — parity, not imitation

Five browser-use design choices are **deliberately not being matched**, because matching them would
violate a standing decision this repo already made — in two cases, a decision this repo made _because
of_ browser-use specifically. Naming them here once, so no future session re-proposes them by accident:

1. **No `evaluate`-style arbitrary-JavaScript tool, and no exec-model MCP surface.** browser-use's
   `evaluate` action (`tools/service.py`, description quoted verbatim: _"Execute browser JavaScript...
   Use ONLY browser APIs... NO Node.js APIs..."_) runs unsandboxed `Runtime.evaluate` in the **live
   page's own JS context** — full DOM/cookie/`fetch`/`localStorage` access, no CSP, no network
   severance, no permission gate of any kind; the only "safety" is a prose instruction to the model.
   Even browser-use's own system prompt admits the risk (`&lt;efficiency_guidelines&gt;`: _"evaluate runs
   arbitrary JS that can modify the DOM, so it is never safe to chain other actions after it"_), and its
   `--cli-mcp` MCP server exposes a second instance of the same shape — a stateful exec model wrapping
   `browser_harness`. **This is not a hypothetical temptation for Tepegöz — it is the literal motivating
   case for [ADR-0026](../../docs/adr/0026-agent-code-execution.md)**, which opens: _"`browser-use`
   reported that adding a code-execution action beside click/type was their single largest measured
   competence jump"_ — and then measures the isolated-world design that reasoning implied, finds it hits
   a canary server on the first attempt, and ships something narrower instead: `code_exec_read` (a
   hidden, network-severed `BrowserWindow` holding a copied-not-loaded snapshot, `default-src 'none'`
   CSP, results capped with truncation reported, the audit journal carrying a **16-hex script hash and
   never the body**) allowed with the reason code `code_exec_read_journaled`; `code_exec_write` is
   **denied unconditionally**, declared on the tool descriptor rather than per call, and the whole
   capability is pinned to the `ask` tier until an adversarial battery clears. Tepegoz already answered
   browser-use's own finding — with a narrower, measured design, not a blanket refusal. Do not reopen
   this by adding `evaluate` or an exec-model MCP tool.
2. **No adoption as a runtime dependency — Python sidecar, second Chromium, or vendor-hosted execution
   process of any kind.** [`history.md`](../../phases/ai-agent/history.md)'s build-vs-buy verdict
   stands: _"embedding it means a separate Chromium and a Python sidecar... a packaging, security, and
   architecture liability."_ `ai-agent/README.md`'s "Never" list names `browser-use`/`nanobrowser`
   directly: _"port techniques, never adopt."_ This session's reading surfaced two more instances of the
   same underlying anti-pattern worth naming precisely because they are _new_ evidence, not a repeat of
   the old one: `browser_use/beta/service.py` (6,810 lines, excluded from type-checking) shells out to a
   separately-installed **Rust binary** (`browser-use-terminal`) over stdio JSON-RPC; `browser_use/
sandbox/` ships a user's Python closure — via `cloudpickle`, including captured globals and closure
   state — to `https://sandbox.api.browser-use.com` for **remote execution against a cloud-provisioned
   browser**. Neither is a JS-sandboxing technique to weigh against ADR-0026; both are "hand execution to
   an external process/service" in a new costume, and both are out of scope for a local-first browser on
   the same grounds as the original Python-sidecar verdict.
3. **No ungated tool or MCP-tool registration.** browser-use's own MCP client hardcodes `domains=None`
   when registering a discovered MCP tool as an action, with a comment admitting the removal of the
   filter it used to have (_"page_filter has been removed since we no longer use Page objects... Browser
   tools filtering would need to be done via domain filters instead"_ — it wasn't). Its `--mcp` server
   exposes `retry_with_browser_use_agent`, which spins up a **full autonomous `Agent`** for any MCP
   caller with only an admin-configured `allowed_domains` passthrough as a guard; its `--cli-mcp` server
   is the exec-model from item 1. Tepegoz's MCP **client** already differs by construction — every
   external tool passes through `dangerClassFor` (unknown annotation → the most restrictive class,
   `packages/mcp-client/src/danger.ts`) and the one ToolGateway PEP, same as a built-in tool. If and when
   Phase 1b's still-unbuilt MCP **server** line is opened, it inherits neither of browser-use's two
   patterns: no ungated registration, no exec-model tool. `aipex-agent-parity.md` P1 already specifies
   the alternative (Bearer token + rate-limit + a full PEP re-pass on every delegated call) — this ground
   rule adds browser-use's two servers as further, independent evidence for the same design, not a new
   one.
4. **No CAPTCHA-solver, and no claim without a mechanism behind it.** browser-use's OSS README is
   explicit that there is nothing to match here: _"For CAPTCHA handling, you need better browser
   fingerprinting and proxies. Use Browser Use Cloud."_ Yet its own system prompt tells the model
   _"CAPTCHAs are automatically solved by the browser... Do not attempt to solve CAPTCHAs manually"_ —
   a prompt-level claim with no OSS mechanism behind it at all. [ADR-0039](../../docs/adr/0039-user-granted-sensitive-capabilities.md)
   already ships something more honest than that sentence: an attempt-then-handoff design for CAPTCHA,
   and a real, deterministic TOTP-based 2FA auto-clear through the Credential Broker (§ P1 below). There
   is nothing to adopt here — naming this so a future session doesn't mistake browser-use's system-prompt
   claim for a capability actually worth matching.
5. **The `sensitive_data` technique may inform the eventual Credential Broker fill path; the OS-auth gate
   it waits behind is not a formality to skip.** browser-use's placeholder-substitution pattern genuinely
   works today (the model never sees the raw secret, only the tool-execution layer does) while Tepegoz's
   conceptually stronger Credential Broker — the agent has **no shape a secret could arrive in at all** —
   ships deliberately inert until an OS-auth gate exists (`phase-s6-safety-control-plane.md`: _"the agent
   ... refuses every fill until an OS-auth gate exists"_). That gap is real, and the temptation it creates
   is real: "ship browser-use's placeholder pattern now, gate it properly later." § P1 below borrows the
   _technique_; it does not, and no future session should, treat this as license to lift the gate early.

None of these are "browser-use did it wrong." Its own docs are candid about the trade-offs (the
`sensitive_data`-without-`allowed_domains` warning is logged, not hidden; the CAPTCHA gap is stated
outright in the README rather than implied away) — it is a developer library with no native process and
no policy kernel, and it reasoned about the same problems from a different substrate. The point of naming
these here is that a future reader of this track — or of ADR-0026, which this rival directly motivated —
shouldn't reopen a decision that already accounted for exactly this evidence.

---

## Capability inventory

Legend for **Home**: an existing phase/ADR/sibling-track name means "already planned or already owned,
this row sharpens it, no new work needed here." **NEW** means this track proposes a small addition.
**Ground rules #N** means deliberately not matched. **No gap** means Tepegöz's existing design is already
at parity or ahead and nothing is proposed.

| #   | Browser Use capability (source-verified)                                                                                                                                                                                                                                                                                                                                                                                              | Nearest Tepegöz behaviour today                                                                                                                                                                                                                                                | Gap                                                                                                      | Home                                                                                                                                                                                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 16+ hand-copied provider adapters (`openai`, `anthropic`, `openrouter`, `orcarouter`, …) + `ChatBrowserUse`'s server-side gateway resolving prefixed ids (`anthropic/claude-sonnet-4-6`) for "hundreds of models"                                                                                                                                                                                                                     | 8 hand-written adapters + `local`; an internal `OpenAICompatibleProvider` base class already shared by deepseek/xai/groq (`packages/model-gateway/src/providers/openai-compat.provider.ts`) but not user-configurable                                                          | A user-facing BYO/custom endpoint entry + local HTTP-server engine variants (Ollama/llama.cpp/LM Studio) | **`webbrain` P1** (already proposes exactly this; extend the existing base class, don't invent one — browser-use itself has **no** such generic class, each of its OpenAI-compatible adapters is a separately hand-copied `@dataclass`, so Tepegöz's factoring is already better than the thing being matched)                |
| 2   | `ChatBrowserUse` zero-key cloud gateway; Browser Use Cloud (stealth browsers, proxy rotation)                                                                                                                                                                                                                                                                                                                                         | BYO-key only; no key = no run                                                                                                                                                                                                                                                  | A managed, key-free default                                                                              | **Phase 3** (already planned)                                                                                                                                                                                                                                                                                                 |
| 3   | DOM/AX-tree perception + PDF auto-download+`pypdf` + open/closed shadow-DOM + iframe hidden-content hints + zero-LLM-cost `search_page`/`find_elements`/`find_text` (raw `Runtime.evaluate` of fixed, contributor-authored JS, not model-authored)                                                                                                                                                                                    | DOM/a11y-first (ADR-0008), identity-stable refs + diff/elision (S2); no PDF/shadow/iframe reach; no free-text page search primitive                                                                                                                                            | PDF/frame/shadow-DOM reach; a zero-model-cost "does this page contain X" tool                            | **`webbrain` P3-a/P3-b** (PDF, frame, shadow-DOM — already proposed, do not redo); free-text search → **P3-b (this track, NEW small)**                                                                                                                                                                                        |
| 4   | Password-field values excluded from the DOM snapshot, explicitly framed in-code as a prompt-injection defense (`dom/serializer/serializer.py`)                                                                                                                                                                                                                                                                                        | `@tepegoz/tool-executor` sanitizer (zero-width/bidi/homoglyph stripping) + Credential Broker design (agent has no shape a secret could occupy at all)                                                                                                                          | —                                                                                                        | **No gap** — convergent validation; Tepegoz's target design already subsumes this narrower case                                                                                                                                                                                                                               |
| 5   | `evaluate` (raw JS, unsandboxed) + `--cli-mcp` exec-model server                                                                                                                                                                                                                                                                                                                                                                      | —                                                                                                                                                                                                                                                                              | —                                                                                                        | **Ground rules #1**                                                                                                                                                                                                                                                                                                           |
| 6   | ~25 actions incl. `upload_file` (CVE-hardened path re-derivation), `save_as_pdf`, `dropdown_options`, no permission/confirmation gate on any action (confirmed absent from `registry/service.py`'s data model)                                                                                                                                                                                                                        | ~30 tools, all through one PEP: `zod → PolicyKernel → HITL → execute → audit`, none exempted                                                                                                                                                                                   | —                                                                                                        | **No gap** — Tepegoz's PEP discipline already exceeds this; nothing to port                                                                                                                                                                                                                                                   |
| 7   | 500-step real runs; 75%-budget nudge; forced schema-narrowing to `done`-only on step-ceiling/failure-ceiling (`DoneAgentOutput`); type-aware `ActionLoopDetector` hashing (index-only for click/fill, token-sorted for search, full-URL for navigate) + escalating advisory nudges at 5/8/12 repeats + a separate page-stagnation SHA-256 check; message compaction with an explicit anti-hallucination compaction-prompt instruction | Reactor no-progress replan + escape trigger (S0/C1, landed); `cache-window.ts` lag-2 breakpoints; no confirmed forced-terminal-report guarantee; no action-kind-aware loop hashing                                                                                             | A guaranteed non-silent terminal report + finer-grained loop bucketing                                   | **P1 (this track, NEW small — extends S3/S7 Reactor)**; mid-run **visible** compaction itself stays **`webbrain` P9-a** (cited, not redone — P1 below adds the anti-hallucination prompt-wording detail to that row)                                                                                                          |
| 8   | `pre_done_verification` prompt checklist; `judge.py` — a skepticism-primed secondary LLM judge that never overrides `success` but logs disagreement; `ActionResult.success=True` is a hard Pydantic-validator invariant (illegal unless `is_done=True`)                                                                                                                                                                               | `CompletionEvidence` + deterministic downgrade + trap fixtures + Checked/Contradicted badges + judge↔human calibration gated at ≥25 labels (S4/S11)                                                                                                                            | —                                                                                                        | **No gap** — S4 is mechanism-level, browser-use's is prompt-level; Tepegoz already ahead                                                                                                                                                                                                                                      |
| 9   | `SecurityWatchdog`'s `allowed_domains` glob matching (self-warned looseness: `"*.example.com" will match both subdomains AND the main domain`), IP-canonicalization-bypass hardening, opt-in (all URLs allowed if unset)                                                                                                                                                                                                              | Pre-model Policy Kernel (danger class + taint + sensitive-site) + `EgressFirewall` (secret/PII/entropy scan — payload-content-based, **not** network-target-based; confirmed no RFC1918/metadata-IP blocking exists in `egress-firewall.ts` today) + biometric high-risk gates | —                                                                                                        | **No gap architecturally** — Tepegoz is ahead by design; the RFC1918/metadata-IP gap noted here is real but belongs to a **mutating-fetch** capability Tepegoz doesn't have yet, not something browser-use's watchdog offers a technique for (its own coverage is navigation/tab-open only, not network-request-level either) |
| 10  | TOTP 2FA: convention-based (`sensitive_data` key ending `bu_2fa_code`) → `pyotp.TOTP(secret).now()`, computed at fill-time, never seen by the LLM; separately, Gmail-inbox OTP: raw email text handed to the LLM to read the code out of (weaker — the code passes through model context)                                                                                                                                             | ADR-0039: 2FA cleared automatically through the Credential Broker, "the model never receives the code" — same shape as the TOTP path, ships inert pending S6's OS-auth gate                                                                                                    | The concrete fill-technique to land the moment the gate exists                                           | **P1 (this track)** for the TOTP-shaped fill technique (sharpens ADR-0039/S6); Gmail-inbox OTP → **Phase 2** (Gmail adapter, frozen) — sharpen its DoD with this use-case, flagged as the weaker mechanism, when un-frozen                                                                                                    |
| 11  | `AgentHistoryList` JSON step history + PostHog telemetry (opt-out) + optional GIF export                                                                                                                                                                                                                                                                                                                                              | Notary: hash-chain + Ed25519 checkpoints + portable Replay Receipt + independent `tepegoz-verify` CLI + event-sourced journal                                                                                                                                                  | —                                                                                                        | **No gap** — Tepegoz ahead, Phase 7                                                                                                                                                                                                                                                                                           |
| 12  | Ollama + any local OpenAI-compatible server + open-weight `bu-30b-a3b-preview`; genuinely offline today                                                                                                                                                                                                                                                                                                                               | `local-inference` (node-llama-cpp, main-process) + sha256'd GGUF catalog; S12 unbuilt                                                                                                                                                                                          | Local HTTP-server engine variants                                                                        | **`webbrain` P1** (already proposes this exact addition)                                                                                                                                                                                                                                                                      |
| 13  | `TokenCost` — LiteLLM's public community pricing JSON fetched + cached (1-day TTL), split cached-vs-new-token cost, off by default (`include_cost=False` / `BROWSER_USE_CALCULATE_COST`)                                                                                                                                                                                                                                              | `TokenLedger` + `ModelRouter` capability→tier mapping; no automatic community price-table reuse                                                                                                                                                                                | An opt-in auto-refreshed pricing source                                                                  | **Fold into `webbrain` P1** if promoted (noted here, not opened separately)                                                                                                                                                                                                                                                   |
| 14  | None — CLI + conversation dump + optional GIF; Cloud has a closed web UI                                                                                                                                                                                                                                                                                                                                                              | Agent Console (Chat/Do/Make/Tasks), plan preview, replay timeline, evidence badges, steer, background+tray, Human Handoff Controller                                                                                                                                           | —                                                                                                        | **No gap** — Tepegoz ahead, browser-use OSS has no UI to compare                                                                                                                                                                                                                                                              |
| 15  | No persistent cross-run memory in OSS; skills are fully **cloud-hosted** (`BROWSER_USE_API_KEY` + `browser_use_sdk`, cookie-scoped params, first-100-of-`*`-wildcard cap)                                                                                                                                                                                                                                                             | S9 advisory per-domain memory + prompt-template skill library (explicit "templates only" boundary)                                                                                                                                                                             | —                                                                                                        | **No material gap** reachable from OSS; `webbrain` P5 already names the next increment (skills declaring HTTP tools) if ever wanted                                                                                                                                                                                           |
| 16  | MCP **both directions**: client (ungated registration) + **two** servers (`--mcp` fixed-tool-list incl. `retry_with_browser_use_agent`; `--cli-mcp` exec-model)                                                                                                                                                                                                                                                                       | MCP **client** only (ADR-0018), fully gated through `dangerClassFor` + PEP                                                                                                                                                                                                     | The opposite direction                                                                                   | **Phase 1b** (already planned) + **`aipex-agent-parity.md` P1** (detailed design); **Ground rules #3** rejects both of browser-use's specific server shapes by name                                                                                                                                                           |
| 17  | No general site-adapter system; one hardcoded Gmail integration; an optional, off-by-default harness-level `domain-skills/&lt;site&gt;/` concept in a _different_, coding-agent-facing `SKILL.md` (not the library itself)                                                                                                                                                                                                            | No agent site-adapter system; Phase 2's adapters are official-API-first                                                                                                                                                                                                        | —                                                                                                        | **`webbrain` P4** (already proposes the general site-guidance-adapter concept; browser-use's harness-level concept is narrower/differently-scoped, nothing to add)                                                                                                                                                            |
| 18  | Sandboxed file system: fixed subdirectory, basename-normalized paths, a disclosed-and-patched CVE (GHSA-j9hj-92j8-jv9h) in path-traversal-via-upload                                                                                                                                                                                                                                                                                  | `@tepegoz/file-operations` (ADR-0022): folder-grant whitelist + symlink-resolved canonical-path membership (`assertMembership(realPath)`) — a structurally different, likely-stronger design                                                                                   | Confirm (not presumed) the same bypass class is covered                                                  | **P3-a (this track, NEW small — extends ADR-0022)**                                                                                                                                                                                                                                                                           |
| 19  | `variable_detector.py` — post-hoc parameterization of a completed run (element-attribute strategy first, regex value-pattern fallback) for turning it into a reusable template                                                                                                                                                                                                                                                        | Recipe-compiler's "distiller" is named but not built (Phase 6)                                                                                                                                                                                                                 | —                                                                                                        | **Phase 6** (reference technique for the distiller when it's built; nothing opened now)                                                                                                                                                                                                                                       |
| 20  | `browser_use/sandbox/` — ships a user's Python closure via `cloudpickle` to a third-party cloud API for remote execution against a cloud browser                                                                                                                                                                                                                                                                                      | —                                                                                                                                                                                                                                                                              | —                                                                                                        | **Ground rules #2** — not pursued, antithetical to local-first                                                                                                                                                                                                                                                                |
| 21  | English-only; no Turkish anything                                                                                                                                                                                                                                                                                                                                                                                                     | EN+TR parity per package (ADR-0016), ≥10 Turkish-web H2H tasks required (S11)                                                                                                                                                                                                  | —                                                                                                        | **No gap** — Tepegoz ahead, decisively                                                                                                                                                                                                                                                                                        |
| 22  | External benchmark repo + self-reported "#1 on the Odysseys leaderboard, 87.4% average" (README) + `judge.py` LLM-judge                                                                                                                                                                                                                                                                                                               | Statistical constitution (Wilson CIs, pooled family aggregates, N≥10 for claims), anti-debt rule, PROSE-LEDGER, judge claim-barred below 25 human labels                                                                                                                       | —                                                                                                        | **No gap** — `ai-agent`'s existing "Never" list (_"anchoring to vendor self-reports"_) already forbids exactly this pattern; browser-use's own claim is a live example of what it forbids, nothing new to add                                                                                                                 |
| 23  | Shipping, widely used, real 500-step production runs, published (self-reported) leaderboard standing                                                                                                                                                                                                                                                                                                                                  | Skeleton wired, every S-phase 🟠 measurement-owed, three capabilities ship deliberately inert                                                                                                                                                                                  | —                                                                                                        | **No gap to close via a capability row** — this is the overall caveat this track's opening paragraph already carries, not a line item                                                                                                                                                                                         |

---

## P1 — Reactor long-run hardening: a guaranteed terminal report + type-aware loop bucketing (extends S3/S7 Reactor)

**Goal.** Confirm — and where missing, add — that a Tepegoz run **never ends in silence**. browser-use's
step-ceiling and failure-ceiling handling is small, deterministic, and precisely specified enough to
port as _behavior_, and its loop detector is more granular than a same-arguments-repeat check. Neither
requires a new subsystem; both are additive to the Reactor's existing no-progress replan/escape logic
(S0/C1, landed).

**What browser-use actually does (verified).** On the step immediately before `max_steps` (default
**500**, not the 100 its own `AGENTS.md` claims — a confirmed doc/code drift worth knowing before citing
browser-use's docs at face value) and on crossing `consecutive_failures &gt;= max_failures` (default
**5**, again not the 3 its docs state), it swaps the model's own output schema to `DoneAgentOutput` — a
schema that accepts **only** a `done`-shaped response — and injects one explicit instruction that the
task is ending now and to report what was accomplished, with `success` forced to `false` unless the task
is genuinely complete. A one-time, plain nudge fires at 75% of the step budget: consolidate results now,
"partial results are far more valuable than exhausting all steps with nothing saved." Separately, its
`ActionLoopDetector` normalizes a repeated action **differently by kind** before hashing — `click`/`fill`
by element index only (text differences don't matter), `search` by sorted/deduped query tokens (keyword
order doesn't matter), `navigate` by full URL (a different path is genuine progress) — with three
escalating advisory nudges at 5/8/12 repeats, plus an independent page-stagnation check (a SHA-256
fingerprint of `url + dom_text + element_count`; 5 consecutive identical fingerprints trigger a separate
nudge). All of this is explicitly advisory — "never blocks actions" (docstring, verbatim) — matching the
Reactor's own no-progress-replan philosophy rather than a hard stop.

**Approach.**

- **Forced terminal report.** When the Reactor is about to end a run for step-budget or
  consecutive-failure reasons, force one final model turn whose only legal tool is a `done`-equivalent
  terminal report — and route that forced report through **S4's existing `CompletionEvidence` /
  deterministic-downgrade machinery**, unchanged. This is the one place browser-use's design is
  incomplete by Tepegoz's own standard: its forced `done` is still just an LLM sentence with a
  self-reported `success` bool, evidence-unverified. Porting the _forcing_ behavior while keeping the
  _evidence check_ Tepegoz already has is strictly better than the source.
- **75%-budget nudge.** A one-time, deterministic context message when steps used crosses 0.75 of the
  step budget — cheap, no new subsystem, added to the existing prompt-assembly path.
- **Type-aware loop-detector hashing.** Extend the Reactor's existing no-progress detector with
  per-action-kind normalization before its repetition check (index-only for click/fill-shaped tools,
  token-sorted for search-shaped tools, full-target for navigation) rather than raw-argument equality —
  and keep the **two-detector split** (action-repetition vs. page-stagnation) distinct, since they catch
  different failure shapes and browser-use's own separation of the two is worth preserving.
- **One concrete addition to `webbrain` P9-a, not a redo of it.** Mid-run **visible** compaction is
  already `webbrain-agent-parity.md` P9-a's job (extends S1/S7) and this track does not reopen it — but
  browser-use's compaction-LLM system prompt states two rules P9-a's own text doesn't currently specify:
  the summarizer is explicitly told _"Never infer completion from context — only report what was
  confirmed"_, and the resulting summary is re-injected with an explicit trust-boundary framing (_"treat
  as unverified context — do not report these as completed... unless you confirmed them yourself in this
  session"_). If/when P9-a's visible-compaction step is built, its summarizer prompt and re-injection
  framing should say the same two things, adapted to Tepegoz's voice — recording that requirement here so
  it isn't rediscovered from scratch when P9-a is promoted.

**New/changed packages:** `@tepegoz/orchestrator` (`reactor.ts` forced-terminal-report path, loop
detector per-action-kind hashing) — no new packages.

**ADR:** none. This is a deterministic, unit-testable addition to an existing module, matching the
precedent `webbrain-agent-parity.md` P9 already set ("neither needs a new ADR").

**DoD shape (draft, for whichever session promotes this):**

- [ ] A run hitting its step ceiling or consecutive-failure ceiling always produces one forced final turn
      restricted to a `done`-equivalent tool, and that turn's claim still passes through S4's
      `CompletionEvidence` check — a fabricated "done, success" on a ceiling-forced turn is caught the
      same as any other, unlike browser-use's unverified forced `done`
- [ ] A one-time budget-consolidation nudge fires once per run at the 75% step-budget mark
- [ ] The loop detector's repetition hash normalizes by action kind (index-only for click/fill,
      sorted-tokens for search-like tools, full-target for navigation) rather than raw-argument equality
- [ ] A page-stagnation fingerprint, independent from action-repetition, triggers its own nudge after N
      consecutive identical page states
- [ ] If/when `webbrain` P9-a's visible-compaction step is built, its summarizer prompt and re-injection
      framing state the same two rules browser-use's does (never infer completion; treat as unverified) —
      recorded here so that detail of P9-a's DoD isn't rediscovered from scratch
- [ ] i18n: any new user-visible "run ending, consolidating results" indicator gets EN+TR parity in the
      owning package's dict

---

## P2 — Credential Broker fill-technique, sharpened by a verified convergent design (extends ADR-0039 / S6)

**Goal.** S6's Credential Broker ships deliberately inert — "the agent has no shape a secret could
arrive in... refuses every fill until an OS-auth gate exists." That is the right default, and this
workstream does not change it (Ground rules #5). But when the gate does land, the exact fill-technique
should already be settled rather than designed from scratch under time pressure. browser-use's
TOTP-secret mechanism is a narrow, well-tested, source-verified prior art for exactly the shape ADR-0039
already committed to ("Two-factor codes are completed by the Credential Broker... the model never
receives the code") — close enough to Tepegoz's own stated design that this is confirmation and detail,
not a new idea.

**What browser-use actually does (verified).** A `sensitive_data` entry whose key ends in the literal
suffix `bu_2fa_code` is treated specially: instead of substituting a stored value, `_replace_sensitive_data`
(`tools/registry/service.py`) computes `pyotp.TOTP(secret).now()` **at the moment of substitution**,
inside the tool-execution layer, and the LLM never sees the resulting 6-digit code at any point — not in
a message, not in a tool-call argument it authored, only as an opaque placeholder token it emitted.
Domain-scoping uses a `{domain_pattern: {key: value}}` shape (`match_url_with_domain_pattern`); an older,
flat `{key: value}` format is explicitly called out in-code as "only allowed for legacy reasons" — i.e.
even browser-use's own newer design considers unscoped credentials a mistake it is walking back from.

**Approach.**

- **Compute, never store, the live code.** A TOTP-secret credential kind in `@tepegoz/credential-vault`
  (add it if it does not already exist — verify at implementation time), protected the same way a
  password is (DPAPI/`safeStorage`). The fill computes the current code **inside the trusted process** at
  the moment of use — the same shape browser-use's `pyotp.TOTP(secret).now()` call has, but happening
  further from the model than browser-use's own placeholder-token round-trip requires, consistent with
  Tepegoz's stronger "no shape at all" design goal.
- **Domain-scoped by construction, reusing an existing seam rather than inventing a second one.** S9's
  grant-store already scopes remembered grants to `{task/skill, host, tool-tier}`
  (`phase-s9-memory-skills.md` PR4/PR5). A future credential-fill grant should be scoped on the same
  host dimension, not a parallel scoping mechanism — and should get the same explicit test S9's own doc
  already requires for its own grants ("Scope is a named skill, bound by the stored prompt... otherwise
  an untrusted renderer would simply name whichever skill holds the widest grant").
- **The substitution point stays inside the trusted process, at tool-execution time — never in a message
  built for the model.** This is stricter than browser-use's own placeholder-token pattern (which still
  requires the model to correctly emit and route an opaque token through its own tool call); confirm this
  is the intended shape when the gate lands, not something that regresses toward requiring a token round
  trip through the model's own output.

**New/changed packages:** `@tepegoz/credential-vault` (TOTP-secret credential kind, if not already
present), `@tepegoz/security-policy` / the Credential Broker fill path (S6), `@tepegoz/persistence`
(grant-store host-scoping reuse, no new store).

**ADR:** addendum to [ADR-0039](../../docs/adr/0039-user-granted-sensitive-capabilities.md) (and/or
ADR-0027 for the grant-scoping half) — no new number.

**DoD shape (draft, for whichever session promotes this):**

- [ ] A TOTP-secret credential kind exists in `@tepegoz/credential-vault` with the same at-rest
      protection as a stored password
- [ ] A 2FA fill computes the code inside the trusted process at the moment of use; the value never
      appears in a model message, a tool-call argument the model authored, or a Journal payload
      (extends the existing redaction path, does not duplicate it)
- [ ] A credential-fill grant is scoped to at minimum `(host, credential-kind)`, consulted at the same
      pre-model point S9's grants already are
- [ ] **Explicitly gated behind S6's OS-auth gate landing** — this workstream does not itself lift the
      inert-by-design state (per Ground rules #5 and the anti-debt rule)
- [ ] i18n: any new grant/consent copy carries EN+TR parity in the owning package's dict

---

## P3 — Small verification/perception carve-outs (NEW, small)

Two independent, small items — neither needs a new ADR, each registers through the existing checklist it
already belongs to.

### P3-a — File-sandbox traversal-guard regression coverage (extends ADR-0022)

browser-use's `filesystem/file_system.py` had a disclosed, patched CVE (**GHSA-j9hj-92j8-jv9h**) in
exactly this bug class: an agent-supplied path, naively joined, resolving outside the intended sandbox
directory during an upload. Its fix re-derives the path from the FileSystem-owned basename rather than
trusting the caller's path, then double-checks with `os.path.realpath` that the result stays inside the
sandbox. Tepegoz's [`@tepegoz/file-operations`](../../docs/adr/0022-file-operations-sandbox.md) takes a
structurally different and likely-already-stronger approach — a folder-grant whitelist with
`assertMembership(realPath)` resolving symlinks before every handler runs, rather than a single fixed
subdirectory — but this track's reading found no evidence that a test specifically exercises the bypass
shapes browser-use's CVE covers (relative traversal, symlink escape, and "trust the caller's path over
the sandboxed file's own identity"). This is a **verification** item, not a presumed bug: add the
regression coverage; change the guard only if the coverage finds a real gap.

### P3-b — In-page free-text search tool (extends S2, small)

browser-use's `search_page`/`find_elements`/`find_text` actions are deliberately **zero-LLM-cost** — a
raw `Runtime.evaluate` of fixed, **contributor-authored** JS (not model-authored — this is not the same
shape as `evaluate` and does not reopen Ground rules #1) that searches page text/CSS without spending a
model call, so the agent can cheaply learn "does this page contain X, and where" before deciding whether
to pull the full page. Tepegoz's `browser_get_elements`/`browser_get_page` return structured or full
content but have no equivalent cheap existence/location primitive. Add a small, verb-list-conformant
`browser_*` tool (naming pending `docs/adding-a-tool.md`'s checklist) that returns match locations for a
text/CSS query, `dangerClass: 'read'`, wrapped through the same untrusted-content path as any other page
read.

**DoD shape (draft, both sub-items):**

- [ ] A test exercises the file-sandbox membership check against relative-traversal and symlink-escape
      inputs specifically (P3-a); the guard is changed only if this finds a real gap
- [ ] The new page-search tool returns match locations for a text/CSS query without invoking the model,
      registered through the one `CapabilityRegistry`, `dangerClass: 'read'` (P3-b)
- [ ] i18n: neither sub-item is expected to add user-visible copy (both are agent-facing tool surfaces);
      confirm at implementation time

---

## Backlog (named, not written up)

- **Gmail-inbox OTP reading** — browser-use's `get_recent_emails` hands raw email text to the LLM to read
  a verification code out of, a real but structurally weaker mechanism than the TOTP path (the code
  passes through the model's context). Fold into Phase 2's (frozen) Gmail official-API adapter DoD when
  it is un-frozen, flagged explicitly as the weaker of the two mechanisms rather than silently copied.
- **Community pricing-table reuse for `TokenLedger`** — browser-use's `TokenCost` fetches and caches
  LiteLLM's public GitHub pricing JSON (1-day TTL), off by default. A reasonable opt-in addition to
  `webbrain-agent-parity.md` P1's provider-catalog work if that track is ever promoted; not opened
  separately here.
- **`variable_detector.py`'s two-strategy parameterization heuristic** (element-attribute match first,
  regex value-pattern fallback) for turning a completed run into a reusable template — reference material
  for Phase 6's not-yet-built recipe "distiller," named so a future Phase-6 session doesn't design the
  same two-strategy split from scratch. No work opened.
- **The `skills/browser-use/SKILL.md` harness-level `domain-skills/&lt;site&gt;/` concept** — narrower and
  differently-scoped (an opt-in, coding-agent-facing workspace convention, not part of the library's own
  runtime) than `webbrain-agent-parity.md` P4's already-proposed site-guidance-adapter system. No separate
  line; P4 already covers the concept this would otherwise re-derive.

---

## Routing — what this track does not own

Per the existing convention ([`../README.md`](../../phases/README.md#routing--what-stays-out) /
[`ai-agent/README.md`](../../phases/ai-agent/README.md#routing--what-stays-out)), reference these,
never duplicate them:

| Stays with                                 | Material                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Phase 1b**                               | The MCP **server** surface — browser-use's two server shapes (an ungated fixed-tool-list server, and an exec-model server) are further evidence for why every delegated call must re-enter the PEP, per Ground rules #3                                                                                                                         |
| **Phase 2**                                | The Gmail official-API adapter — browser-use's Gmail-inbox OTP-read is a concrete use-case for its (frozen) DoD, flagged as the weaker of two 2FA mechanisms (Backlog)                                                                                                                                                                          |
| **Phase 3**                                | The managed, key-free cloud default — `ChatBrowserUse`'s server-side model-routing gateway is the closest analog                                                                                                                                                                                                                                |
| **Phase 6**                                | Deterministic, model-free recipes — `variable_detector.py`'s parameterization heuristic is reference material for the not-yet-built distiller (Backlog), nothing to reconcile today                                                                                                                                                             |
| **Phase 7**                                | Notary / Replay Receipts — no browser-use equivalent (JSON history + optional GIF export), nothing to reconcile                                                                                                                                                                                                                                 |
| **S4**                                     | `CompletionEvidence` / verified outcomes — browser-use's `pre_done_verification` + `judge.py` are prompt-level; Tepegoz is already ahead mechanism-level, nothing to port                                                                                                                                                                       |
| **S6 / ADR-0039**                          | The Credential Broker + CAPTCHA/2FA handoff shape — P2 sharpens the eventual fill _technique_, it does not lift the OS-auth gate (Ground rules #5)                                                                                                                                                                                              |
| **ADR-0026**                               | Agent code execution — Ground rules #1 keeps the boundary exactly as measured; `code_exec_read`/`code_exec_write` already answer browser-use's own motivating finding                                                                                                                                                                           |
| **`webbrain-agent-parity.md` P1**          | Provider catalog + local HTTP-server engine variants — already covers the Ollama/llama.cpp/LM Studio addition comprehensively; this track adds only "extend the existing `openai-compat.provider.ts` base class, don't invent a new one" (browser-use itself has no such class to imitate) plus the optional pricing-table-reuse idea (Backlog) |
| **`webbrain-agent-parity.md` P3-a / P3-b** | PDF reading, frame + shadow-DOM perception — browser-use independently confirms the same gap; this track's only addition is the free-text search primitive (P3-b, this track)                                                                                                                                                                   |
| **`webbrain-agent-parity.md` P4**          | Site-guidance prompt adapters — browser-use's harness-level `domain-skills/` concept is narrower and already covered by P4's design                                                                                                                                                                                                             |
| **`webbrain-agent-parity.md` P9-a**        | Mid-run visible context compaction — this track's P1 adds the anti-hallucination compaction-prompt wording as a concrete detail to fold in when P9-a is promoted                                                                                                                                                                                |
| **`aipex-agent-parity.md` P1**             | The detailed, transport-agnostic MCP-server design (Bearer + rate-limit + full PEP re-pass) — already covers what a browser-use-shaped delegation surface would need too                                                                                                                                                                        |

## ADRs owed (numbers assigned when a session actually opens one of these)

- **P1:** none — deterministic Reactor/loop-detector additions, unit-testable, no sweep owed.
- **P2:** addendum to **ADR-0039** (and/or ADR-0027 for the grant-scoping half) — the credential
  fill-technique, explicitly gated behind S6's OS-auth gate landing.
- **P3:** none — P3-a is regression coverage on an existing ADR-0022 boundary; P3-b is one small
  `read`-class tool through the existing `docs/adding-a-tool.md` checklist.

No number is reserved here; per this repo's own multi-profile-track lesson
([`multi-profile-isolation.md`](../tracks/multi-profile-isolation.md) — an ADR-number collision from writing a plan
too far ahead of when it's actually opened), the number gets assigned at the point a session actually
starts the work, not now.
