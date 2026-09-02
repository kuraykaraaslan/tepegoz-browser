# Track — Skyvern agent-capability parity

**Status:** 📋 **Proposed — not scheduled (2026-09-01).** No branch, no ADR number reserved, no owner
sign-off. This is a captured gap list in the shape of
[`browser-settings-feature-gap.md`](../tracks/browser-settings-feature-gap.md),
[`omnibox-competitive-parity.md`](omnibox-competitive-parity.md),
[`webbrain-agent-parity.md`](webbrain-agent-parity.md) and
[`aipex-agent-parity.md`](aipex-agent-parity.md): every row names its nearest existing Tepegöz
behaviour and a suggested phase home, so a future session can promote a row into a real `phase-*.md`
task or an `ai-agent` PR without re-deriving the comparison.

**Source:** a same-session deep read of
[`docs/others/tepegoz-vs-skyvern.md`](../versus/tepegoz-vs-skyvern.md) (Turkish, 2026-09-01)
against `.junk/skyvern` (Skyvern OSS, AGPL-3.0 — a shipping backend automation service: Playwright-style
SDK, REST API, no-code workflow builder, self-hosted server + Skyvern Cloud) and this repo's AI surface
(`phases/ai-agent/`, `packages/orchestrator|model-gateway|capability-plane|security-policy|
agent-runtime|browser-tools|web-tools|tool-executor|local-inference|model-catalog|mcp-client|
recipe-compiler|macro-engine|notary|credential-vault|human-input|tasks|downloads`, `extensions/
ext-agent`). Every load-bearing claim below was **re-verified against Skyvern's own source in this
session**, not taken from the comparison doc on faith — file:line citations are given throughout, and
three claims in the comparison doc are corrected where the source reads differently (noted inline):
Skyvern's browsing-agent loop has **no coordinate-click loop detector** (that technique lives in a
separate copilot tool-dispatch subsystem, keyed by a SHA-256 tool+argument identity hash, not pixel
coordinates); its PDF handling is **workflow-block-level** (`PDF_PARSER`/`PDF_FILL`/`SPLIT_PDF` blocks),
not part of the live perception scrape (`skyvern/webeye/scraper/scraper.py` has no PDF code at all); and
its `prompt_evaluation/` directory is a small dataset-staging utility, not a full evaluation harness.
Key files read: `skyvern/webeye/actions/action_types.py` + `actions.py`, `skyvern/webeye/scraper/
scraper.py`, `skyvern/forge/agent.py` + `agent_functions.py`, `skyvern/forge/prompts/skyvern/
extract-action.j2` + `task_v2.j2`, `skyvern/forge/sdk/api/llm/config_registry.py`, `skyvern/forge/sdk/
browser_action_policy.py` + `browser_egress_policy.py` + `browser_effect_approval.py`, `skyvern/forge/
log_redaction.py`, `skyvern/webeye/utils/captcha_solver.py`, `skyvern/forge/sdk/copilot/mcp_adapter.py`

- `loop_detection.py`, `skyvern/forge/sdk/cache/extraction_cache.py`, `skyvern/core/script_generations/`,
  `skyvern/services/self_heal_reliability_service.py` + `script_reviewer_v3/`, `skyvern/schemas/
workflows.py` (`BlockType`), `skyvern/forge/sdk/core/security.py` (webhook signing), `skills/skyvern/`,
  `bitwarden-cli-server/`, `fern/integrations/mcp.mdx` + `fern/credentials/totp.mdx` + `fern/workflows/*`,
  `evaluation/datasets/`.

## Why this track exists

The comparison this track distills opens with a framing that matters more here than in the sibling
tracks: **this is not a same-category comparison.** WebBrain and AIPex are both browser-embedded agents
— the axis of comparison is direct. Skyvern is a **backend automation platform**: a Playwright-style
Python/TS SDK (`page.act/extract/validate/prompt`), a REST API, a no-code visual workflow builder, a
self-hosted server, and a paid cloud — with a browsing agent as one component inside it, not a browser at
all. A large share of what makes Skyvern impressive — the SDK, the API, the no-code builder, the
Zapier/Make.com/n8n connectors, the managed cloud — has **no Tepegöz analog and is not proposed here**
(see Routing, below); Tepegöz is a consumer browser with an embedded agent, and building a competing
backend-RPA product is not this repo's bet. What _is_ directly comparable is the narrower slice both
projects share: how each perceives a page, acts on it, decides when a run is done, handles credentials
and secrets, defends against a hostile page, and replays a task deterministically. On **that** slice, the
comparison lands on the same asymmetry the sibling tracks found: **Skyvern is more capable and more
proven today — live product, published WebBench/WebVoyager numbers, real RPA customers, a working
credential/2FA/captcha stack; Tepegöz is designed to be the safer, more accountable one and has not
proven it yet.** Almost none of Skyvern's lead on the shared slice requires abandoning Tepegöz's DNA
(deterministic Policy Kernel before the model, one ToolGateway PEP, taint/provenance, Notary replay
receipts, DOM/a11y-first perception) — it is a surface-area and shipped-maturity gap, not an architecture
one. This track's job is to say, for every Skyvern capability on the shared slice: _does Tepegöz already
have a seam for this (here, or in `webbrain-agent-parity.md` / `aipex-agent-parity.md`), and if not, what
would the Tepegöz-conformant version look like_ — never "port the Python," always "re-derive the
capability inside the existing kernel/PEP/i18n/coverage discipline."

## How to read this

Each workstream below is written like an `ai-agent` phase section (Goal → Approach → new/changed
packages → ADR → DoD-shaped bullets) so it can be lifted into a real phase file with minimal rewriting.
**Nothing here is committed roadmap.** Where a capability already has a named home in an existing phase,
an ADR, or a sibling track, this file says so explicitly and does **not** re-describe it. Per the
"Already planned — do NOT re-propose" rule in
[`../README.md`](../../phases/README.md#deferred--adoption-gated-backlog-from-the-beyond-phases-synthesis), the
generic OpenAI-compatible provider catalog is **`webbrain-agent-parity.md` P1**, the MCP **server**
surface is **`aipex-agent-parity.md` P1** (itself sharpening **Phase 1b**'s own unbuilt MCP-server DoD
line), the egress-firewall SSRF check is **`webbrain-agent-parity.md` P6**, and deterministic model-free
replay is **Phase 6** — several rows below are "this corroborates an existing plan with a concrete
reference implementation," not "add a phase."

## Ground rules — parity, not imitation

Four Skyvern design choices are **deliberately not being matched**, because matching them would violate
a standing decision this repo already made after deliberation. Naming them here once, so no future
session re-proposes them by accident:

1. **No CAPTCHA solving.** Skyvern's `SOLVE_CAPTCHA` action drives a four-arm ladder
   (`skyvern/webeye/utils/captcha_solver.py`): a DOM checkbox click, an in-frame reCAPTCHA anchor click,
   a solver-extension arm, and a token route — the last two calling
   `app.AGENT_FUNCTION.auto_solve_captchas()` / `solve_recaptcha_token()`, whose **OSS base
   implementations both hard-return `False`** (`skyvern/forge/agent_functions.py:1747-1762`, docstring:
   _"Cloud override provides actual solving; OSS base is a no-op"_) — the real solve is cloud-only.
   ADR-0039 already chose the opposite shape for this repo: CAPTCHA is a **Human Handoff** event — the
   agent stops, tells the user why, and hands back control. 2FA is the one thing that _does_ get
   automatically cleared, and only through the Credential Broker, never a solved/injected token (see P4).
   Keep the handoff; do not add a solver, cloud or local.
2. **No `execute_js` / arbitrary page-mutation action.** Skyvern's `ActionType.EXECUTE_JS`
   (`skyvern/webeye/actions/action_types.py:37`) runs `evaluate_in_main_world(page, action.js_code)`
   (`handler.py:9458-9472`) — and, tellingly, **Skyvern's own deterministic policy layer already treats it
   as unsafe**: `browser_action_policy.py:207` classes it `ActionClass.UNSUPPORTED`, which the "browser
   action firewall" denies outright whenever a run is policy-enrolled, and the planner prompt
   (`extract-action.j2`) never offers `execute_js` in its action-type list to begin with — it is a
   code-level escape hatch its own authors gate off, not something exposed to the model. ADR-0026 already
   measured this path for Tepegoz (isolated-world sandbox **refuted**) and ADR-0029 already drew the
   line: DevTools-class capability is **user-only, never an agent tool, never on a sensitive site.** Not
   being added, regardless of how Skyvern gates its own version.
3. **No hybrid screenshot-by-default perception, and no standing computer-use coordinate tool.** Skyvern's
   default perception is hybrid: alongside the DOM element tree it takes bounding-box-annotated split
   screenshots most steps (`take_split_screenshots`, `scraper.py:661-668`), dropping to one screenshot
   only when the token budget is low. On top of that, Skyvern ships **dedicated computer-use engines** —
   `RunEngine.openai_cua` / `anthropic_cua` / `ui_tars` / `yutori_navigator`
   (`skyvern/schemas/run_enums.py:9-26`), each with its own action-generator method in `agent.py`
   (`_generate_cua_actions`, `_generate_anthropic_actions`, `_generate_ui_tars_actions`,
   `_generate_yutori_navigator_actions`) and its own `ENABLE_YUTORI`-style provider flag. `ai-agent`'s
   own "Never" list already forbids screenshots-every-step; vision stays **escalation-only** (ADR-0008,
   owned by S10). Coordinate action stays coupled to S10's set-of-marks escalation, never a standing tool
   — the same line `aipex-agent-parity.md` Ground rule #4 already drew against AIPex's `computer` tool.
4. **No vendor agent SDK for the loop.** Skyvern's own workflow **copilot** — a separate subsystem from
   the browsing-task loop — is built directly on the **OpenAI Agents SDK**: `mcp_adapter.py` imports
   `agents.agent.AgentBase` and `agents.mcp.server.MCPServer`, and its `SkyvernOverlayMCPServer`
   (`mcp_adapter.py:1220`) subclasses the SDK's `MCPServer` while wrapping a `fastmcp.Client` transport.
   `ai-agent`'s "Never" list already forbids vendor agent SDKs (`browser-use`/`nanobrowser` = _port
   techniques, never adopt_) — the same line `aipex-agent-parity.md` Ground rule #5 already drew against
   AIPex's `@openai/agents` loop. The typed Planner→Executor→Reactor with a typed `Decision` stays.

None of these are "Skyvern did it wrong" — Skyvern is a mature platform with a cloud tier that absorbs
the parts it declines to open-source, and its own OSS boundary comments (_"the OSS boundary forbids
importing here"_, `browser_action_policy.py:1-6`) show a team that reasoned about the same trade-offs and
landed differently because a hosted multi-tenant service has a cloud to put things in. The point of
naming these here is that a future reader of this track shouldn't reopen a decision already made for a
documented reason.

---

## Capability inventory

Legend for **Home**: an existing phase/ADR/track name means "already planned, this row sharpens it, no
new phase needed." **NEW** means no existing plan owns it and this track proposes one. **Ground rules
#N** means deliberately not matched. **Out of category** means Skyvern's product-platform surface with no
Tepegöz analog (see Routing).

| #   | Skyvern capability                                                                                                                                                                                                                                                                                          | Nearest Tepegöz behaviour today                                                                                                                                                                                    | Gap                                                                | Home                                                                                                                                           |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 32 `ENABLE_*` provider flags across ~16–18 families (LiteLLM router) + `SECONDARY_LLM_KEY` cheap tier                                                                                                                                                                                                       | 8 hand-written adapters + `local`                                                                                                                                                                                  | Breadth + a generic OpenAI-compatible adapter                      | **`webbrain` P1** (already proposed — sharpens, cite)                                                                                          |
| 2   | Dedicated computer-use engines: `openai_cua`/`anthropic_cua`/`ui_tars`/`yutori_navigator`, each with its own action-generator in `agent.py`                                                                                                                                                                 | Coordinate action only via S10 set-of-marks escalation                                                                                                                                                             | —                                                                  | **Ground rules #3** — not adopted                                                                                                              |
| 3   | Local endpoints working today (`ENABLE_OLLAMA`, LiteLLM proxy)                                                                                                                                                                                                                                              | `local` provider (node-llama-cpp)                                                                                                                                                                                  | Local HTTP-server transport variant                                | **`webbrain` P1** (already proposed — cite)                                                                                                    |
| 4   | Hybrid DOM + split-screenshot perception, token-gated screenshot count, `trim_element_tree`                                                                                                                                                                                                                 | DOM/a11y-first (ADR-0008); vision escalation-only                                                                                                                                                                  | —                                                                  | **Ground rules #3** — not adopted                                                                                                              |
| 5   | `IncrementalScrapePage` — DOM-mutation-observer-driven rescrape for dropdown/custom-select options (`scraper.py:931`)                                                                                                                                                                                       | Static snapshot + diff/elision (S2); no live-mutation rescrape for async-populated widgets                                                                                                                         | A narrow rescrape trigger for post-click dynamic option lists      | **P2 (NEW small, extends S2/S3)**                                                                                                              |
| 6   | `add_frame_interactable_elements` — iframe subtree attachment into the element tree                                                                                                                                                                                                                         | Light-DOM-only perception (ADR-0008/S2)                                                                                                                                                                            | Frame reach                                                        | **`webbrain` P3-b / `aipex` P2** (already proposed — cite, don't duplicate)                                                                    |
| 7   | `PDF_PARSER`/`PDF_FILL`/`SPLIT_PDF` workflow **blocks** (not part of live perception — confirmed absent from `scraper.py`)                                                                                                                                                                                  | Phase 2c ships a PDF _viewer_ (human-facing); no agent tool, no block                                                                                                                                              | Agent-callable PDF read; a macro/recipe PDF step                   | **`webbrain` P3-a** (agent read tool, already proposed) + **P5 below** (block form)                                                            |
| 8   | `ActionType.EXECUTE_JS`, itself classed `UNSUPPORTED` by Skyvern's own policy and never offered to the planner                                                                                                                                                                                              | —                                                                                                                                                                                                                  | —                                                                  | **Ground rules #2** — corroborates the existing decision, not a gap                                                                            |
| 9   | 27-member `ActionType` enum incl. `PASTE_TEXT` (bulk grid/table paste)                                                                                                                                                                                                                                      | ~30 tools, no bulk-paste primitive                                                                                                                                                                                 | A grid/table bulk-fill primitive                                   | **Backlog** (small, extends S3)                                                                                                                |
| 10  | `task_v2.j2` planner: navigate/extract/loop/compute mini-goals, `required_subgoals`, specialist LLM calls; v1 loop `MAX_STEPS_PER_RUN=10` default, recursive step execution                                                                                                                                 | Planner (Intent→DAG) → Executor → Reactor, typed `Decision` (S0–S3)                                                                                                                                                | —                                                                  | Already covered — no gap                                                                                                                       |
| 11  | Copilot tool-dispatch loop detector: SHA-256 tool+argument identity streak, `MAX_CONSECUTIVE_SAME_TOOL=3` (`loop_detection.py`) — **a separate subsystem from the browsing-agent loop**, not coordinate-based                                                                                               | Reactor no-progress replan (S0/C1, landed)                                                                                                                                                                         | — (functionally equivalent technique, already shipped)             | Already covered — no gap (comparison-doc correction: no coordinate-click detector exists in Skyvern's browsing loop)                           |
| 12  | `browser_action_policy.py` "browser action firewall" — pure decision core consuming an externally-supplied, cloud-only verdict, fails closed to `UNKNOWN`; `browser_effect_approval.py` PREVIEW→COMMIT field-diff before dispatch, `observe`/`enforce` modes; default-autonomous run (no OSS per-tool HITL) | Model-**pre** deterministic Policy Kernel (ADR-0006); two-stage HITL (plan preview + per-tool), fail-safe                                                                                                          | —                                                                  | Tepegöz already ahead — no gap; PREVIEW→COMMIT's live-field-diff is a citable reference detail, not a new mechanism                            |
| 13  | `browser_egress_policy.py` — RFC1918/`metadata`/`.local` blocklist + IDNA/NFKC host normalization + DNS-rebind check via `ipaddress.is_private/is_loopback/...`                                                                                                                                             | `EgressFirewall.inspectEgress` (Shannon entropy)                                                                                                                                                                   | Confirm the same block targets are covered                         | **`webbrain` P6** (already proposed — cite, don't duplicate)                                                                                   |
| 14  | `log_redaction.py` — exact-name (not substring) `SENSITIVE_HEADERS`/`SENSITIVE_FIELDS` redaction, incl. TOTP-specific keys                                                                                                                                                                                  | Journal/log redaction (existing, per repo-wide rule)                                                                                                                                                               | Audit that the field list is as exhaustive                         | **Backlog** (small, reference list to check the existing redaction against)                                                                    |
| 15  | `extract-action.j2`/`task_v2.j2` anti-fabrication prompt discipline (`required_subgoals`, `complete_criterion`, termination guardrails)                                                                                                                                                                     | `CompletionEvidence` + deterministic downgrade + trap fixtures (S4)                                                                                                                                                | —                                                                  | Tepegöz already ahead — no gap                                                                                                                 |
| 16  | Signed webhooks (`x-skyvern-signature`/`x-skyvern-timestamp`, HMAC-SHA256, `security.py:49-86`) + optional Laminar tracing hook (best-effort, non-fatal) + run/step video/artifact recording                                                                                                                | Notary (hash-chain + Ed25519 receipts) + event-sourced Journal — cryptographic, not operational-integration-shaped                                                                                                 | Outbound integration hooks (webhook, optional trace export)        | **P1 (NEW, extends Phase 7)**                                                                                                                  |
| 17  | 4 credential-vault backends: own Fernet vault, Bitwarden/vaultwarden (`bw serve` REST bridge), 1Password (`OP_SERVICE_ACCOUNT_TOKEN`), Azure Key Vault (`AzureCredentialVaultService`); working `agent.login()` fill flow                                                                                   | Credential Broker (`@tepegoz/security-policy`, PR6 landed) — **"the broker currently refuses every fill"** until an OS-auth gate exists (`phase-s6-safety-control-plane.md` PR6 notes)                             | Multi-backend bridge pattern, once the broker is reachable at all  | **P3 (sharpen S6 PR6, gated behind its OS-auth gate landing)**                                                                                 |
| 18  | 5 TOTP/2FA paths (authenticator secret/QR/`otpauth://`, email-forward, SMS-forward, webhook, magic link); `otp_service.py` priority payload→credential-backed TOTP→webhook polling; `TOTP_LIFESPAN_MINUTES=10`                                                                                              | `detectHandoff` → hands 2FA to the user today; **ADR-0039 PR9 already plans** auto-clear "routed through the PR6 credential broker so the code never enters model context" — **"Nothing here is landed"**          | A concrete multi-path design for PR9                               | **P4 (sharpen ADR-0039 PR9, gated behind S6's broker)**                                                                                        |
| 19  | CAPTCHA solving ladder (4 arms; OSS bases return `False`)                                                                                                                                                                                                                                                   | Human Handoff Controller (ADR-0039)                                                                                                                                                                                | —                                                                  | **Ground rules #1** — not adopted                                                                                                              |
| 20  | Scripts/Code 2.0: `libcst`-based workflow→Python codegen (`core/script_generations/`); self-heal `AIFallbackMode` (`fallback`\|`proactive`, try-selector-then-AI in generated `skyvern_page.py.click()`), `self_heal_daily_cap` rate limit; adaptive `:v2` cache-key suffix                                 | `@tepegoz/recipe-compiler` (model-free, signed, `evaluateAssertion` oracle) + Phase 6's own bounded healing ladder (re-stabilize → re-bind selector → ONE scoped model replan → HITL) — **already the same shape** | A daily-cap rate-limit on the "one scoped model replan" fallback   | **Phase 6** (already planned — sharpen with the `fallback`/`proactive` naming + a daily-cap detail)                                            |
| 21  | In-process extraction cache: LRU (outer, by `workflow_run_id`, cap 256) + FIFO (inner, per-run entries, cap 64); a **named but cloud-only hook** for a cross-run Redis tier, not shipped OSS code                                                                                                           | No extraction-result cache                                                                                                                                                                                         | A bounded in-process cache for repeated same-page extractions      | **Backlog** (folds into S7/S9 cost-honesty metrics)                                                                                            |
| 22  | 30-member `BlockType` no-code workflow engine (incl. `HTTP_REQUEST`, `PDF_PARSER`/`FILL`, `GOOGLE_SHEETS_READ`/`WRITE`, `SEND_EMAIL`, `EMAIL_INBOX`, `WORKFLOW_TRIGGER`); visual drag-and-drop builder; OSS-supported schedules; Zapier/Make.com/n8n connectors                                             | `@tepegoz/tasks` (interval/page-change/external triggers) + `@tepegoz/macro-engine` (control flow, CSV loops, already-shipped) + Phase M's own planned scheduler/watchers (M8)                                     | The in-category block-type gap: HTTP request + PDF read/fill steps | **P5 (NEW small, extends Phase 6 + Phase M)**; the visual builder + SaaS connectors are **out of category** (Routing)                          |
| 23  | MCP: a 35-tool/6-category **server** (`fern/integrations/mcp.mdx`) reachable from 5–6 documented clients, **plus** the copilot itself as an MCP **client** (OpenAI Agents SDK + `fastmcp`)                                                                                                                  | MCP **client** only (ADR-0018); no server surface exists anywhere in the repo (verified: only UI for _outbound_ connections to external servers)                                                                   | The opposite direction                                             | **`aipex` P1** (already proposed — cite, don't duplicate); the copilot's vendor-SDK choice is **Ground rules #4**                              |
| 24  | Deliberately **no** site adapters — "vision generalizes" thesis, WebBench cited as evidence                                                                                                                                                                                                                 | No site adapters — not yet built                                                                                                                                                                                   | —                                                                  | Neither side has it; **`webbrain` P4** already proposes Tepegöz-side site-guidance adapters (unrelated to Skyvern) — no new ask here           |
| 25  | Published WebBench (64.4%) / WebVoyager (85.8%) numbers; `evaluation/datasets/` incl. the MIT-vendored 200-task Odysseys set (arXiv:2604.24964) + WebVoyager jsonl + 15 per-site result reports                                                                                                             | `agent-eval` harness, ground-truth-first, Wilson CIs, `bridgeClaim` refusability — but **no published number yet** (all S-phases 🟠)                                                                               | —                                                                  | Not a gap in kind — S11's own mission; Odysseys/WebVoyager task shapes are a citable reference set for S11's task authoring, no new workstream |
| 26  | Turkish/regional depth: none (English-only, US-centric examples)                                                                                                                                                                                                                                            | EN+TR parity enforced per package (ADR-0016); ≥10 Turkish-web H2H tasks required; Phase 11 kamu/e-Devlet track                                                                                                     | —                                                                  | Tepegöz already ahead — no gap                                                                                                                 |
| 27  | AI-augmented Playwright SDK (`page.act/extract/validate/prompt`), REST API, Python/TS client libraries, no-code visual builder, Zapier/Make.com/n8n SaaS connectors, managed cloud                                                                                                                          | None — Tepegöz is a consumer browser, not a developer automation platform                                                                                                                                          | —                                                                  | **Out of category** (Routing) — no workstream                                                                                                  |

---

## P1 — Operational observability: signed webhooks + optional trace hook (NEW, extends Phase 7)

**Goal.** Skyvern's Notary-equivalent gap runs the other way: Tepegöz's `@tepegoz/notary` gives
cryptographic, third-party-verifiable proof of a run that Skyvern has no analog for, but Skyvern gives
something Tepegöz doesn't — a way for a **third-party system** to be notified when a run finishes, and an
optional plug-in point for external observability tooling. Neither weakens the other; this workstream
adds the integration half without touching the proof half.

**What Skyvern actually built (verified).** Outbound webhooks are HMAC-SHA256 signed:
`generate_skyvern_webhook_signature()` (`skyvern/forge/sdk/core/security.py:49-86`) produces
`x-skyvern-timestamp` + `x-skyvern-signature` headers over the canonical JSON payload, keyed by the
caller's own API key — a receiver re-computes the same HMAC to verify authenticity, no shared secret
beyond the key the caller already has. Optional **Laminar** tracing (`skyvern/forge/sdk/trace/lmnr.py`)
is initialized best-effort at startup — a failure to init is caught and logged, never crashes the app
(`api_app.py:418-435`) — and specifically disables Skyvern's own auto-instrumentation
(`disabled_instruments={Instruments.SKYVERN, Instruments.PATCHRIGHT}`) so the external tracer doesn't
double-count spans Skyvern already tracks itself.

**Approach.**

- **Signed outbound webhooks**, modeled directly on Skyvern's header shape (`x-tepegoz-timestamp` /
  `x-tepegoz-signature`, HMAC-SHA256 over the canonical run-summary JSON, keyed by a per-endpoint secret
  generated in Settings). Fired from the **existing** run-completion/failure events already flowing
  through the Journal — this is a new **subscriber** on an existing event stream, not a new event source.
  Payload content is the same class of data the Accountability Dashboard already renders (Phase 7 L9):
  run outcome, danger-class summary, HITL counts — never a raw page snapshot or a secret.
- **An optional trace-export seam**, not a Laminar-specific integration — a `TraceExporter` interface
  (analogous to how `@tepegoz/security-policy`'s intent-critic is an injected seam, per S6 PR4's
  mechanism notes) that a self-hosting user can point at any OpenTelemetry-compatible collector. Absent ⇒
  nothing runs, matching S6 PR4's "absent means nothing runs" precedent. This avoids a hard dependency on
  any one vendor's SDK while giving the same opt-in observability Skyvern's Laminar hook provides.
- **What stays exactly as designed:** the Notary hash-chain, Ed25519 checkpoint signing, and the
  standalone `tepegoz-verify` CLI are untouched — a webhook is a _notification_, not a _proof_; a receiver
  who wants proof still needs a Replay Receipt, which a webhook payload can reference by id but never
  substitutes for.

**New/changed packages:** a new small module inside `@tepegoz/notary` or a sibling
`@tepegoz/webhooks` (Electron-free, host seam for the HTTP client), `@tepegoz/preferences` (per-endpoint
secret generation UI), wiring into the existing Journal event stream (no new event types needed).

**ADR:** an addendum to **ADR-0030** (NotaryService) — the webhook is a consumer of the same Journal
events the Notary already chains, not a new trust primitive.

**DoD shape (draft, for whichever session promotes this):**

- [ ] A webhook delivery's HMAC signature verifies against the documented header shape, unit-tested with
      a known key/payload/signature triple (mirroring Skyvern's own
      `test_docs_webhook_verification_snippets.py` pattern — ship the verification snippet in the docs,
      test it against the real signer)
- [ ] Webhook payloads never carry a raw page snapshot, a secret, or PII beyond what the Accountability
      Dashboard already surfaces — a test asserts the payload shape is a strict subset
- [ ] `TraceExporter` absent by default; a failing exporter never blocks or slows a run (best-effort,
      matching Skyvern's own non-fatal init pattern)
- [ ] i18n: endpoint-management UI (add/remove/test a webhook, secret rotation) gets EN+TR parity

---

## P2 — Incremental rescrape for dynamically-populated widgets (NEW small, extends S2/S3)

**Goal.** Match one narrow, concrete perception gap Skyvern's own scraper names explicitly: a custom
`<select>`/combobox that populates its option list only after a click (React/MUI/Ant-Design-style
widgets) isn't visible in a static DOM snapshot taken before the click. S2's diff/elision model handles
_changed_ content between two snapshots; it doesn't yet trigger a **targeted** rescrape scoped to "the
subtree that just appeared."

**What Skyvern actually built (verified).** `IncrementalScrapePage` (`scraper.py:931`) starts a DOM
`MutationObserver` (`start_listen_dom_increment`/`stop_listen_dom_increment`, JS
`startGlobalIncrementalObserver`/`stopGlobalIncrementalObserver`, lines 991-1005) scoped to the moment
right after a click, and is invoked specifically around dropdown/custom-select detection
(`handler.py:6218-6237`, comment: _"the post-click dropdown/custom-select rescrape below"_).

**Approach.**

- Reuse S2's identity-stable ref model and diff engine — this is not a new perception primitive, it's a
  **new trigger**: after a `browser_click` on an element whose role/aria pattern matches a
  listbox/combobox opener, run one bounded, short-window DOM-mutation watch (reuse whatever mutation
  hook `build-dom-tree-script.ts` already has access to, or add a minimal one scoped to a single
  subtree) and feed only the _newly appeared_ subtree through the existing diff/elision path.
  Time-boxed and subtree-scoped so it cannot become a general "watch the whole page" primitive.
- No new tool — this augments `browser_click`'s existing perception refresh, the same way S3's
  click-time occlusion re-check already augments click without being a separate capability.

**New/changed packages:** `@tepegoz/browser-tools` (the mutation-watch trigger + subtree-scoped diff),
no `@tepegoz/security-policy` changes (perception, not action).

**ADR:** none — an S2 perception refinement through the existing `docs/adding-a-tool.md`-adjacent
perception-change process, not a new capability class.

**DoD shape (draft):**

- [ ] A fixture with a click-populated custom `<select>` shows the newly-appeared options in the next
      perception snapshot without a full-page rescrape
- [ ] The mutation watch is time-boxed and subtree-scoped — a test asserts it does not fire on unrelated
      page mutations elsewhere on the page
- [ ] No token-budget regression on pages without this pattern (the trigger is opt-in per click, not
      always-on)

---

## P3 — Credential vault: multi-backend bridge pattern (sharpen S6 PR6, gated behind its own OS-auth gate)

**Goal.** S6 PR6 already landed the Credential Broker's **design property** — the agent is never given a
shape a secret could arrive in; main resolves a "request credential for domain" intent, fills via CDP
after an OS-auth gate, and the model never sees the value. What it does not yet have is **a backend to
resolve against**, because the phase's own notes are explicit: _"there is no OS-auth gate implementation
yet... so the broker currently refuses every fill"_ (`phase-s6-safety-control-plane.md`, PR6 mechanism
notes). This workstream is not "unblock the broker" (that's the OS-auth spike PR6 already names as
owed) — it's "once unblocked, resolve against more than one backend," using Skyvern's shipped adapters as
concrete reference implementations rather than inventing the shape from scratch.

**What Skyvern actually built (verified).** Four backends behind one `CredentialVaultType`: its own local
Fernet-encrypted vault (`skyvern_credential_vault_service.py`, honestly documented in `.env.example` as
storing the key next to the ciphertext unless a production operator moves it to an external secret
store); a Bitwarden/vaultwarden bridge via `bw serve` (`bitwarden-cli-server/`, a Docker-wrapped CLI
server the Skyvern process talks to over HTTP instead of shelling out); 1Password via
`OP_SERVICE_ACCOUNT_TOKEN`; and Azure Key Vault (`AzureCredentialVaultService`, a dedicated service
class). All four are used from the same `agent.login(credential_type, credential_id)` call site.

**Approach.**

- **Explicitly gated behind S6's OS-auth spike landing first** — per the anti-debt rule, this does not
  open on top of a broker that still refuses every fill by design.
- Once gated open: extend the broker's resolution step with a small `CredentialBackend` interface
  (`resolve(domain, credentialRef) → secret`, main-process only, never crossing into the agent's context)
  with the local `@tepegoz/credential-vault` (DPAPI/`safeStorage`) as the default backend and Bitwarden's
  `bw serve` REST shape as the first external reference implementation — it's the simplest of Skyvern's
  four (a local HTTP bridge to a CLI the user already runs), and unlike 1Password/Azure it needs no cloud
  service-account provisioning to try.
- **What stays exactly as designed:** the eTLD+1 site-match, the ambiguity-is-a-refusal rule, and the
  "human asked before decryption" ordering from PR6's mechanism notes carry over unchanged to every
  backend — a backend swap changes _where_ the secret comes from, never _whether_ the agent sees it.

**New/changed packages:** `@tepegoz/security-policy` (the `CredentialBackend` interface, alongside the
existing broker logic), `@tepegoz/credential-vault` (stays the default backend, unchanged), a new small
adapter module for the Bitwarden `bw serve` shape.

**ADR:** an addendum to whichever ADR S6's OS-auth spike produces for the credential broker (the phase
doc records this as still owed, not yet numbered) — record the multi-backend interface decision there,
not as a new number.

**DoD shape (draft, gated):**

- [ ] Gated behind S6's OS-auth gate landing — this DoD does not open until that PR is closed
- [ ] A `CredentialBackend` swap changes zero call-site code in the broker's intent-resolution path
- [ ] The Bitwarden backend never surfaces the vault's own unlock/session token to the agent, same
      no-shape-for-a-secret guarantee PR6 already tests for the local vault
- [ ] i18n: backend-selection UI in Settings gets EN+TR parity

---

## P4 — TOTP/2FA automated-clear reference design (sharpen ADR-0039 PR9, gated behind S6's broker)

**Goal.** ADR-0039 already decided 2FA should auto-clear through the Credential Broker rather than stay a
handoff forever — PR9's own doc is unambiguous that this is designed but **"Nothing here is landed."**
This workstream gives that still-unbuilt PR9 a concrete, multi-path design, using Skyvern's shipped
TOTP handling as the reference rather than starting from a blank page.

**What Skyvern actually built (verified).** Five paths (`fern/credentials/totp.mdx:7-12`): (1) an
authenticator secret, `otpauth://` URI, or QR-code upload, code generated locally; (2) email-forwarded
verification code; (3) SMS-forwarded code; (4) a caller-hosted webhook Skyvern polls
(`totp_verification_url`); (5) a one-time magic login link. Resolution priority is explicit:
_"payload → credential-backed TOTP → webhook polling"_ (`otp_service.py:692`), and codes expire on a
`TOTP_LIFESPAN_MINUTES=10` clock (`config.py:728`). `VERIFICATION_CODE` is a first-class `ActionType`.

**Approach.**

- **Explicitly gated behind S6's broker (same as P3)** — 2FA auto-clear only makes sense once the broker
  can resolve _any_ secret; TOTP is one more secret kind, not a separate mechanism.
- The reference priority order maps directly onto Tepegoz's existing kernel-then-broker shape: a
  **stored authenticator secret** (local TOTP generation, `otpauth://`/QR import into the credential
  vault — no network round-trip, the cleanest of the five and the one to build first) resolves before any
  **out-of-band poll** (email/SMS/webhook) is attempted. A stored secret never enters model context, same
  guarantee as a password fill; an out-of-band poll result is treated as **untrusted, page-derived-shaped
  data** the moment it's read, routed through the same taint/`wrapUntrustedContent` path as any other
  external content before it reaches the fill step.
- Magic-link and webhook variants are **explicitly deferred** past a first cut — they require Tepegoz to
  either poll an inbox (out of scope; no email integration exists) or expose a receiving webhook endpoint
  of its own (a bigger surface than a desktop app should open by default). The stored-secret path alone
  covers the majority of real 2FA flows and is the only one with no external dependency.
- **What stays exactly as designed:** `detectHandoff`'s CAPTCHA handling is unchanged (Ground rules #1);
  only the 2FA half of `detectHandoff`'s scope moves to the broker, and only when a stored secret exists
  — an unrecognized or unsupported 2FA method still falls back to the existing handoff.

**New/changed packages:** `@tepegoz/security-policy` (the broker's TOTP-resolution path, `otpauth://`
parsing), `@tepegoz/credential-vault` (stores the authenticator secret alongside passwords), a small TOTP
code-generation utility (RFC 6238, no new dependency needed — this is a well-understood ~30-line
algorithm, not a library pull).

**ADR:** the implementation record ADR-0039 PR9 already calls for — no new number, this is that PR's own
design being written down before the code, per the constitution's fixture-freeze-before-capability-code
discipline.

**DoD shape (draft, gated):**

- [ ] Gated behind S6's OS-auth gate landing (same gate as P3 — this is one more broker-resolved secret
      kind)
- [ ] A stored authenticator secret fills a TOTP field with **zero** entries of the code in model context
      — reuses PR6's exhaustive `Object.keys` assertion pattern
- [ ] An out-of-band-sourced code (were it ever added) is taint-wrapped before reaching the fill step —
      out of scope for the first cut, but the interface shape must not preclude it later
- [ ] CAPTCHA handling is untouched — a test proves `detectHandoff`'s CAPTCHA path is unaffected by the
      2FA change
- [ ] i18n: EN+TR for the "using your saved authenticator" consent surface

---

## P5 — Macro/recipe block-type gap: HTTP request + PDF read/fill steps (NEW small, extends Phase 6 + Phase M)

**Goal.** Phase 6's model-free recipes and `@tepegoz/macro-engine` already have real control flow
(`if`/`repeat`/`forEachRow`, unlimited variables, a sandboxed expression language) — Skyvern's 30-member
`BlockType` catalog is not a reason to build a competing workflow engine (that's out of category, see
Routing), but two of its block _kinds_ are genuinely missing primitives that fit inside the engine
Tepegöz already has: an HTTP-request step and a PDF read/fill step. Everything else in Skyvern's catalog
(`GOOGLE_SHEETS_READ/WRITE`, `SEND_EMAIL`, `EMAIL_INBOX`, third-party SaaS connectors) is a managed
integration surface with no Tepegöz analog and stays out of scope.

**What Skyvern actually built (verified).** The full `BlockType` enum (`skyvern/schemas/workflows.py:
474-505`, 30 members) includes `HTTP_REQUEST`, `PDF_PARSER`, `PDF_FILL`, and `SPLIT_PDF` alongside the
control-flow blocks (`FOR_LOOP`, `WHILE_LOOP`, `CONDITIONAL`) Tepegoz's macro-engine already has.

**Approach.**

- **An HTTP-request macro step** that wraps `webbrain-agent-parity.md` P6's gated mutating-fetch tool
  (`@tepegoz/web-tools` write-method support, per-run grant, `EgressFirewall` coverage) rather than
  building a second HTTP client — a macro step is a _caller_ of that capability, not a new trust
  boundary. It re-passes `MacroHost.checkPolicy` exactly as every other step already does (Phase M's own
  M6 discipline: "state-changing step re-passes the Policy Kernel at run time").
  **Depends on** `webbrain` P6 landing first — this is its consumer, not a substitute.
- **A PDF read/fill step** built on the same viewer Phase 2c ships and `webbrain-agent-parity.md` P3-a's
  `browser_read_pdf` tool — again a caller, not a new PDF library. A _fill_ variant (Skyvern's `PDF_FILL`)
  is deferred to a follow-up once the read half is proven; filling untrusted-form fields is a bigger
  surface than reading text and deserves its own DoD line rather than riding this one's coattails.
- **What stays exactly as designed:** macro-engine's sandboxed expression language, per-step error
  policy (`onError: stop|skip|retry`), and sensitive-site lockout (M6) are unchanged — a new step _kind_
  slots into the existing `Step` union, it does not add a new execution path.

**New/changed packages:** `@tepegoz/macro-engine` (two new `Step` kinds), `@tepegoz/ext-macros` (editor
Add-step-picker entries), depends on `@tepegoz/web-tools` (from `webbrain` P6) and `@tepegoz/browser-tools`
(from `webbrain` P3-a).

**ADR:** none new — both new step kinds are thin wrappers over capabilities their own workstreams
(`webbrain` P6, `webbrain` P3-a) already own the ADR discussion for.

**DoD shape (draft):**

- [ ] Explicitly gated behind `webbrain` P6 (gated fetch) landing — the HTTP-request step has nothing to
      call otherwise
- [ ] An HTTP-request step denies without an active per-run grant, identical to the underlying tool's own
      DoD (no separate grant model for the macro-step wrapper)
- [ ] A PDF-read step returns the same text `browser_read_pdf` would for the same document — one
      implementation, two call sites
- [ ] i18n: EN+TR for the two new Add-step-picker entries and their inline editors

---

## P6 — Small hardening additions

### P6-a — Self-heal daily-cap rate limit (extends Phase 6's bounded ladder)

Phase 6's own DoD already specifies a bounded healing ladder — "re-stabilize + idempotent retry →
re-perceive/re-bind selector → ONE scoped model replan → graceful stop to HITL" — and
`macro-selector-healer.electron.ts` already implements the "one scoped model replan, model only picks an
index, never authors a selector" half of it. Skyvern's `self_heal_cap.py` adds one detail worth copying:
a **daily cap** on how many times the model-replan fallback may fire for a given recipe/macro
(`check_and_increment_self_heal_cap()`, a Redis-keyed counter in Skyvern's version; a local SQLite counter
scoped to `recipeId`/`macroId` × day is the equivalent here). This bounds runaway model spend on a recipe
that started silently failing its selectors on every run, independent of the existing per-call
"ONE scoped replan" ceiling.

### P6-b — Bulk grid/table paste primitive

Skyvern's `PASTE_TEXT` action type exists specifically for grid/spreadsheet-style inputs where typing
cell-by-cell is both slow and easy to mis-target. Tepegoz's `browser_type` types one field at a time; a
small `browser_paste_grid` (or an extension of the existing type tool with a tabular-value argument) that
writes a block of values into a detected grid/table input in one call is a narrow, additive primitive —
`dangerClass: 'ui-write'` like any other fill, no new trust boundary.

**DoD shape (draft, both sub-items):** both are unit-tested pure-logic additions to existing modules
(`@tepegoz/recipe-compiler`/`macro-engine` for P6-a, `@tepegoz/browser-tools` for P6-b); neither needs a
new ADR.

---

## Backlog (named, not written up)

- **In-process extraction cache** — Skyvern's bounded LRU(outer)/FIFO(inner) in-process cache for
  repeated same-page extractions (`extraction_cache.py`) has no Tepegoz analog. Worth folding into
  whichever session next touches S7/S9's cost-honesty metrics (repeat-domain cost drop), not a standing
  workstream on its own.
- **Redaction-list audit** — Skyvern's `log_redaction.py` `SENSITIVE_HEADERS`/`SENSITIVE_FIELDS` are
  exact-name matched (not substring, to avoid false positives like `credential_id`) and include several
  TOTP-specific keys (`cached_totp`, `totp_identifier`, `totp_url`). Worth a quick audit that Tepegoz's
  own Journal/log redaction covers an equivalent field list once P4 adds TOTP handling — small, fold into
  whichever PR ships P4.
- **Odysseys/WebVoyager task-shape reference** — `evaluation/datasets/` (a 200-task, MIT-licensed,
  vendored Odysseys set plus WebVoyager jsonl files) is a citable reference for how a long-horizon,
  multi-site task benchmark is authored, when S11 gets to writing its own ≥20-task battery. Not a
  dependency, not a dataset to import — a shape to look at.

---

## Routing — what this track does not own

Per the existing convention ([`../README.md`](../../phases/README.md#routing--what-stays-out) /
[`ai-agent/README.md`](../../phases/ai-agent/README.md#routing--what-stays-out)), reference these,
never duplicate them:

| Stays with                                 | Material                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`webbrain-agent-parity.md` P1**          | The generic OpenAI-compatible provider adapter + catalog; local-endpoint HTTP-server transport                                                                                                                                                                                                                                                                                                                                                                      |
| **`webbrain-agent-parity.md` P3-a / P3-b** | Agent-callable PDF text extraction; iframe/shadow-DOM perception reach                                                                                                                                                                                                                                                                                                                                                                                              |
| **`webbrain-agent-parity.md` P4**          | Site-guidance prompt adapters (Skyvern deliberately has none; unrelated, no new ask from this comparison)                                                                                                                                                                                                                                                                                                                                                           |
| **`webbrain-agent-parity.md` P6**          | The gated, per-run-granted mutating-fetch tool — P5 above is its _consumer_, not a duplicate                                                                                                                                                                                                                                                                                                                                                                        |
| **`aipex-agent-parity.md` P1**             | The MCP **server** surface (Bearer + rate-limit + PEP re-pass); Skyvern's own 35-tool server is corroborating evidence the direction is worth building, not a reason to re-derive it here                                                                                                                                                                                                                                                                           |
| **Phase 1b**                               | The MCP-server DoD line itself, vision fallback, local-SLM, durable/parallel runs                                                                                                                                                                                                                                                                                                                                                                                   |
| **Phase 6**                                | Deterministic, model-free replay, the bounded self-heal ladder — Skyvern's Scripts/Code-2.0 codegen and `AIFallbackMode` are reference details (P6-a), not a reason to rebuild the ladder                                                                                                                                                                                                                                                                           |
| **Phase 7**                                | NotaryService / Replay Receipts — Skyvern has no cryptographic-proof analog; P1 adds the integration half (webhooks/tracing) it lacks, without touching the proof half                                                                                                                                                                                                                                                                                              |
| **S4**                                     | `CompletionEvidence` / fabricated-success defence — already ahead of Skyvern's prompt-driven equivalent, nothing to reconcile                                                                                                                                                                                                                                                                                                                                       |
| **S6 / ADR-0039**                          | The Credential Broker and its still-owed OS-auth gate; P3/P4 both explicitly gate behind it landing, they do not reopen or accelerate it                                                                                                                                                                                                                                                                                                                            |
| **ADR-0026 / 0029**                        | The `execute_js`/DevTools boundary — Ground rules #2 stays closed, not reopened                                                                                                                                                                                                                                                                                                                                                                                     |
| **N/A — out of category**                  | Skyvern's developer-facing surface with no Tepegöz analog: the Playwright-style SDK (`page.act/extract/validate/prompt`), REST API, Python/TS client libraries, no-code visual workflow builder, and Zapier/Make.com/n8n connectors. Tepegoz is a consumer browser with an embedded agent, not a developer automation platform; the only plausible future home is Phase 12 (developer platform & marketplace), itself frozen out of v1. Not proposed by this track. |

## ADRs owed (numbers assigned when a session actually opens one of these)

- **P1:** addendum to **ADR-0030** (NotaryService) — the webhook/trace-export decision as a consumer of
  existing Journal events, not a new trust primitive.
- **P2:** none — an S2 perception refinement through the existing process, not a new capability class.
- **P3:** addendum to whichever ADR S6's OS-auth gate spike produces (not yet numbered) — the
  multi-backend `CredentialBackend` interface decision.
- **P4:** the implementation record ADR-0039 PR9 already calls for — no new number.
- **P5:** none — both step kinds are thin wrappers whose ADR discussion belongs to the tools they call
  (`webbrain` P6, `webbrain` P3-a).
- **P6:** none — small additions to existing modules through `docs/adding-a-tool.md`.

No number is reserved here; per this repo's own multi-profile-track lesson
([`multi-profile-isolation.md`](../tracks/multi-profile-isolation.md) — an ADR-number collision from writing a plan
too far ahead of when it's actually opened), the number gets assigned at the point a session actually
starts the work, not now.
