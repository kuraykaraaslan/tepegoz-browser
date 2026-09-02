# Track — AgentQL agent-capability parity

**Status:** 📋 **Proposed — not scheduled (2026-09-02).** No branch, no ADR number reserved, no owner
sign-off. This is a captured gap list in the shape of
[`browser-settings-feature-gap.md`](../tracks/browser-settings-feature-gap.md),
[`webbrain-agent-parity.md`](webbrain-agent-parity.md) and
[`aipex-agent-parity.md`](aipex-agent-parity.md): every row names its nearest existing Tepegöz
behaviour and a suggested phase home, so a future session can promote a row into a real `phase-*.md`
task or an `ai-agent` PR without re-deriving the comparison.

**Source:** [`docs/others/tepegoz-vs-agentql.md`](../versus/tepegoz-vs-agentql.md) (2026-09-01,
Turkish) against `.junk/agentql` — a **thin example repository** (144 files: ~25 Python/JS example
scripts + CI/security scaffolding; AgentQL's own resolver service and core SDK implementation are **not
in this checkout**). Most claims about AgentQL's mechanism are therefore vendor-documentation claims,
not source-verified — the comparison doc flags each one explicitly ("K"-tagged) and this track inherits
that discipline: nothing below is proposed on the strength of a README claim alone. A second, narrower
read: [`docs/research-computer-use-agents.md`](../research/research-computer-use-agents.md)'s AgentQL
section, which independently reached the same two concrete takeaways this track formalizes. Verified
against source for this track specifically: `packages/browser-tools/src/browser-tools.ts` (the
`browser_analyze_page` tool, S5), `packages/tool-executor/src/extraction-caps.ts` (`acceptScript`/
`capResult`), `phases/ai-agent/phase-s5-code-execution.md`,
`apps/desktop/src/main/macro/macro-selector-healer.electron.ts`, `docs/adr/0030-notary-service.md`, and
a repo-wide grep confirming `apps/desktop` does not import `@tepegoz/notary` and `phase-s10-vision-
escalation.md`'s 2026-09-02 correction that `captureVision` has no production caller.

## Why this track exists

The source comparison's own honest verdict is that this is **not a symmetric matchup**: AgentQL is not
a browser agent, it is a natural-language element-addressing and structured-data-extraction layer — one
piece of one subsystem of what Tepegöz is building. Architecturally the comparison lands almost entirely
in Tepegöz's favor for the reason the "Örtüşmeyen alanlar" section states plainly — AgentQL doesn't
decide, doesn't ask permission, doesn't produce accountable evidence, and every query leaves the device
by design, whereas Tepegöz resolves addressing on-device against an accessibility tree and gates every
action through one deterministic Policy Kernel before a model is ever consulted. The one place the
comparison honestly credits AgentQL as ahead **today** is developer/model ergonomics for **schema-shaped
structured extraction** (`query_data()`'s nested shape + `(integer)`/`(convert to …)` hints +
`paginate()`) — a genuine, narrow gap against `browser_analyze_page` (S5), which makes the model write
that same shaping logic in JavaScript from scratch every time. This track's job is to check whether that
one edge has a Tepegöz-conformant seam (it does) and to name the small, real addition — while explicitly
declining the parts of AgentQL's design that would mean adopting a cloud element-resolver dependency or
a hosted-browser-session model this repo's local-first, deterministic-first architecture already ruled
out for documented reasons.

## How to read this

The one workstream below is written like an `ai-agent` phase section (Goal → Approach →
new/changed packages → ADR → DoD-shaped bullets) so it can be lifted into S5's own phase file with
minimal rewriting. **Nothing here is committed roadmap.** Per the "Already planned — do NOT re-propose"
rule in [`../README.md`](../../phases/README.md#deferred--adoption-gated-backlog-from-the-beyond-phases-synthesis)
and per [`webbrain-agent-parity.md`](webbrain-agent-parity.md)'s own inventory, several AgentQL
capabilities that look novel in isolation already have a named home — a generic OpenAI-compatible
provider catalog is `webbrain-agent-parity.md` P1, an MCP surface in the opposite direction is Phase 1b,
self-healing selectors are Phase 6 / S9. This track cites those, it does not re-describe them.

## Ground rules — parity, not imitation

Five things AgentQL does are **deliberately not being matched**, because matching them would mean
adopting a shape this repo already rejected after deliberation, or because the claim behind them is not
evidenced from source. Naming them once so a future session doesn't re-propose them by accident:

1. **No cloud element-resolution service as the primary addressing path.** AgentQL's whole mechanism —
   `query_elements()`/`get_by_prompt()` — sends page structure to a vendor server per call
   (`AGENTQL_API_KEY` required; no local mode). ADR-0008 already chose the opposite shape: DOM/a11y-first
   perception resolved **on-device** against the accessibility tree, model consulted only for which `ref`
   to act on, never to resolve the ref itself. Adding a hosted resolver as a fallback or an alternative
   would reopen the exact trust boundary ADR-0008 closed, and it would make "sovereign / air-gapped mode"
   (Phase 8) a lie for that one tool. Not adding it.
2. **No remote/hosted browser session.** AgentQL's `create_browser_session()`/`use_remote_browser`
   (`.junk/agentql/examples/python/use_remote_browser.py`) runs the actual browser in the vendor's cloud,
   including on logged-in sessions (`log_into_sites`, `save_and_load_authenticated_session`). Tepegöz is
   a native desktop browser; multiplying the credential-exposure surface `@tepegoz/credential-vault` and
   the Credential Broker (ADR-0039) are designed to _minimize_ by routing a session through a third
   party's infrastructure is the opposite of this repo's local-first design. No equivalent is proposed.
3. **No adoption of "self-healing selectors" as an opaque, always-on cloud mechanism.** AgentQL claims
   UI-change resilience without publishing how ("K"-tagged in the source comparison — mechanism, model,
   and measurement are all unverifiable from this checkout). Tepegöz already has the deterministic-first
   version of the same goal: `apps/desktop/src/main/macro/macro-selector-healer.electron.ts` escalates to
   **one** scoped model call only after a deterministic `SelectorChain` replay fails, and even then the
   page-injected script enumerates candidates and computes each locator itself — the model picks an
   **index**, it never writes CSS/XPath. `docs/research-computer-use-agents.md`'s own verdict on this
   exact question stands: determinism-first means deterministic ref/selector resolution is tried first,
   a model is consulted only on ambiguity. Nothing here changes that ordering.
4. **No pursuit of "cross-site query portability."** The comparison doc tags this claim "K" too — evidenced
   only by AgentQL's own docs, not demonstrated in the checkout. Tepegöz's ref model is intentionally
   page-scoped (refs invalidate on navigation, per S2) and building a "same query, different site" layer
   on top would be new surface area nothing in the roadmap currently calls for. Not pursued on the
   strength of an unverified claim.
5. **No SDK/library consumption model.** AgentQL is a Playwright-wrapping Python/JS library plus a REST
   API, Chrome debugger extension, and playground — genuine developer tooling, but a different product
   category. Tepegöz is an application, not a library other developers import into their own automation
   scripts; there is no seam to build this against. Out of scope by the prompt's own category-mismatch
   rule, not by oversight.

None of this is "AgentQL did it wrong." AgentQL is optimizing for a different customer (a developer
writing a scraping/automation script who accepts a vendor dependency for ergonomics); Tepegöz is
optimizing for a user who wants an agent acting inside their own signed-in browser under a policy kernel
that never leaves the device. The point of naming these once is that a future reader shouldn't reopen a
decision already made for a documented reason.

---

## Capability inventory

Legend for **Home**: an existing phase/ADR/track name means "already planned or already decided against,
this row only cites it." **P1** means this track's own new item. Rows marked **K** in the source
comparison (AgentQL claim, not source-verified in `.junk/agentql`) are noted as such — they are not
treated as confirmed capability gaps.

| #   | AgentQL capability                                                                                                                                                 | Nearest Tepegöz behaviour today                                                                                                                                                                                                                                            | Gap                                                                                                                       | Home                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 1   | `query_elements()`/`get_by_prompt()` — NL query resolved by a cloud service into a Playwright locator                                                              | `browser_get_elements` → on-device a11y-tree `ref` list; model selects a `ref`, never writes a selector                                                                                                                                                                    | Different design, not a missing feature — ref-space targeting is structurally safer for a model                           | **Ground rules #1** — not pursued                                                                                   |
| 2   | "Self-healing" selectors across UI changes (**K**, mechanism unpublished)                                                                                          | Refs are snapshot-scoped (S2); `macro-selector-healer.electron.ts` escalates to one scoped model call, index-only, only after deterministic replay fails                                                                                                                   | AgentQL's version is opaque and unverified; Tepegöz's is narrower but auditable                                           | **Ground rules #3** — cite Phase 6 / S9 (selector hints re-resolved against S2 identity refs), not re-proposed here |
| 3   | "Cross-site query portability" (**K**)                                                                                                                             | No portable-query concept; refs are page-scoped by design                                                                                                                                                                                                                  | Unverified claim, no roadmap pull                                                                                         | **Ground rules #4** — not pursued                                                                                   |
| 4   | `query_data()` — nested schema + `(integer)`/`(convert to …)` type hints + `paginate()`                                                                            | `browser_analyze_page` (S5): model authors a JS snippet from scratch against a sandboxed page snapshot                                                                                                                                                                     | The model reasons out shaping/coercion/pagination logic itself every time — real ergonomics gap                           | **P1 (sharpens S5, small)**                                                                                         |
| 5   | `wait_for_page_ready_state()`                                                                                                                                      | `browser_validate_page` (bounded wait + visible-text check); macro-engine auto-wait                                                                                                                                                                                        | Equivalent capability, different call shape                                                                               | No gap — cite existing tool, not re-proposed                                                                        |
| 6   | No action/decision layer — developer writes `if`/`for`/retry in Python/JS                                                                                          | Planner→Executor→Reactor, typed `Decision`, two-stage HITL                                                                                                                                                                                                                 | Category mismatch — AgentQL isn't attempting this                                                                         | No Tepegöz counterpart needed                                                                                       |
| 7   | Model/provider choice: none — a closed resolver service, cost/latency opaque                                                                                       | 8 providers + `local`, `TokenLedger`, mandatory `maxTokens`/`timeoutMs`, single `CanonRequest`/`CanonResponse`                                                                                                                                                             | None — Tepegöz already ahead                                                                                              | No gap                                                                                                              |
| 8   | Every query leaves the device to the vendor's server; `use_remote_browser` can move the browser itself                                                             | On-device DOM/a11y perception + selector resolution; `local` model tier + sha256-verified GGUF catalog                                                                                                                                                                     | None — architectural, not a feature gap                                                                                   | **Ground rules #1/#2**                                                                                              |
| 9   | Credentials as plaintext module-level constants in example scripts; service-side handling unverified                                                               | `@tepegoz/credential-vault` (BYO-key, DPAPI/safeStorage) + Credential Broker — **but the broker ships inert, no OS-auth gate wired yet** (per S6's own phase doc)                                                                                                          | Conceptually ahead, practically tied (neither side has a working path today)                                              | **S6** (already planned, measurement-owed) — not re-proposed                                                        |
| 10  | `stealth_mode`/`humanlike-antibot` example code (random UA/timezone/mouse/scroll)                                                                                  | `@tepegoz/human-input` — Catmull-Rom mouse curves + Gaussian jitter, a real library, not example code                                                                                                                                                                      | None — Tepegöz already ahead                                                                                              | No gap                                                                                                              |
| 11  | MCP **server** (README claim, code not in this checkout) — external agents call AgentQL as a tool                                                                  | MCP **client** only (ADR-0018); tools flow through the one PEP                                                                                                                                                                                                             | Opposite direction, already named                                                                                         | **Phase 1b** (already planned — MCP server surface)                                                                 |
| 12  | Generic OpenAI-compatible LLM access — N/A (AgentQL exposes no model choice; a `perform_sentiment_analysis` example wires its own separate `gpt-3.5-turbo` client) | 8 hand-written adapters, no generic OpenAI-compatible card                                                                                                                                                                                                                 | Not actually an AgentQL capability to match — noted only because a _different_ rival (WebBrain) already surfaced this gap | **`webbrain-agent-parity.md` P1** — not duplicated here                                                             |
| 13  | No run-level accountability — script's own logs only                                                                                                               | Event-sourced Journal ships. `@tepegoz/notary` (hash-chained checkpoints, Ed25519 signatures, portable Replay Receipt, standalone `tepegoz-verify` CLI) is **written and unit-tested, but `apps/desktop` does not import it** — no run produces a receipt today (ADR-0030) | Neither side has a working cryptographic receipt today; Tepegöz's is a designed-but-unwired capability, not a shipped one | **Phase 7** (already planned, `🟡 in progress` per `phases/README.md`) — not re-proposed                            |
| 14  | REST API (no SDK), Chrome debugger extension, playground                                                                                                           | None — Tepegöz is an application, not a developer tool surface                                                                                                                                                                                                             | Category mismatch                                                                                                         | **Ground rules #5** — out of scope                                                                                  |
| 15  | English-only queries and examples; no localization surface                                                                                                         | Per-package EN+TR parity (ADR-0016); ≥10 Turkish-web H2H tasks required by the north-star                                                                                                                                                                                  | None — Tepegöz already ahead                                                                                              | No gap                                                                                                              |
| 16  | Zero published evals/benchmarks in this checkout; CI is lint/format/secret/CVE scanning only                                                                       | `@tepegoz/agent-eval` — ground-truth scoring, Wilson CIs, frozen fixtures, `bridgeClaim` publish-gate at N≥25 human labels                                                                                                                                                 | None — Tepegöz already ahead in eval discipline (though every S-phase is still 🟠 measurement-owed)                       | No gap                                                                                                              |

---

## P1 — Schema-shaped extraction scaffold for `browser_analyze_page` (sharpens S5, small)

**Goal.** Close the one ergonomics gap the comparison credits AgentQL with today — `query_data()`'s
declarative shape + type-conversion hints + `paginate()` — **without** adding a new tool, a new danger
class, a new sandbox, or a vendor dependency. The model still authors and owns the extraction script;
this only removes boilerplate coercion/shaping code from what it has to write by hand every call, the
same way S5's own "Not done, and why" section already flagged `browser_extract_table` as a pure
ergonomics gap not worth a second tool ("`browser_analyze_page` already returns table contents in one
call... a curated shape... not a capability [gap]").

**Approach.**

- **Add an optional `schema` field to `ExtractionArgs`**
  (`packages/browser-tools/src/browser-tools.ts:29`, currently `{ tabId?, script }`). When present, it
  describes the desired output shape — field names, an optional light type hint
  (`'text' | 'integer' | 'currency' | 'date'`), and whether a field is a list — mirroring the _shape_ of
  AgentQL's `{ price_currency products[] { name price(integer) } }` without adopting AgentQL's query
  grammar or its resolver: the schema is not executed server-side, it is rendered into a short JS
  coercion-helper snippet (`coerce(value, type)`) that gets prepended to the sandboxed execution context
  **before** the model's own script runs, so the model spends its step budget selecting the right DOM
  nodes, not hand-writing `parseInt`/currency-strip/date-format boilerplate every time. The model's script
  still decides selectors and structure; `schema` only removes repetitive scaffolding.
- **`acceptScript`/`capResult`** (`packages/tool-executor/src/extraction-caps.ts`) stay exactly as they
  are — the coercion helper is pure, injected text, not a new execution path, so the existing
  snapshot/session-cancel/CSP sandbox, the hash-only journal entry (ADR-0026), and the untrusted-content
  wrapping on the result are all untouched.
- **Pagination is documented guidance, not a new tool.** AgentQL's `paginate(page, QUERY, 3)` is a
  stateful helper across calls; S5's snapshot-per-call design makes a stateful multi-page tool more
  complexity than the problem needs. Instead, add a short usage note to `browser_analyze_page`'s tool
  description (or the orchestrator's existing prompt-assembly path, the same channel
  `webbrain-agent-parity.md` P4's site-guidance adapters use) describing the three-call loop: extract →
  click "next" (existing click tool) → extract again → merge in context. This is prompt scaffolding on
  an existing capability, not new plumbing.
- **What stays exactly as designed:** `code_exec_read`'s danger class, the RISK GATE (permanent `ask`-tier
  pin if any `atk_code_exec_*` fixture cannot reach zero exfil), the `MAX_SCRIPT_CHARS`/`MAX_RESULT_CHARS`/
  `MAX_RESULT_ITEMS`/`EXTRACTION_TIMEOUT_MS` bounds — none of this changes for a `schema`-shaped call.

**New/changed packages:** `packages/browser-tools` (optional `schema` arg + tool-description update),
`packages/tool-executor` (pure, unit-tested coercion-scaffold generator — no DOM access, no network, no
execution of its own).

**ADR:** none owed. This lands entirely inside ADR-0026's existing sandbox contract (S5) — record it as
a line item in `phase-s5-code-execution.md` when picked up, not a new decision.

**Anti-debt note:** S5 is 🟠 measurement-owed (PR0–PR1 landed; the adversarial sweep and RISK GATE
exercise are ⏸ funded, per `phases/ai-agent/README.md`'s phase index). Per the anti-debt rule, this
workstream is **explicitly gated behind S5 reaching ✅** — adding a scaffold on top of an unmeasured
sandbox before its own adversarial battery has run would stack an unverified capability on an unverified
one.

**DoD shape (draft, for whichever session promotes this):**

- [ ] `schema` is optional and strictly additive — omitting it produces byte-identical behavior to
      `browser_analyze_page` today (regression test)
- [ ] the coercion-scaffold generator is pure and unit-tested for each type hint (`text`/`integer`/
      `currency`/`date`, scalar vs list) and never itself touches the DOM or network
- [ ] the pagination usage note ships as prompt guidance text (not a new tool); a fixture proves a
      2-page extraction task completes inside the existing step budget
- [ ] `atk_code_exec_*` adversarial coverage is re-run (or confirmed unaffected) with `schema` present —
      the scaffold must not open a new injection surface for the coercion snippet itself
- [ ] i18n: none needed — tool descriptions and prompt scaffolding stay internal/English, matching S5's
      existing precedent (script bodies are not a localized UI surface)
- [ ] gated behind **S5 reaching ✅** first, per the anti-debt rule above

---

## Backlog (named, not written up)

- **Prompt-addressed element lookup (a `find`-style tool).** AgentQL's own comparison doc and
  `docs/research-computer-use-agents.md` both flag this as a worthwhile idea _in principle_ — resolving
  an element by natural-language description via a small, scoped model call when deterministic `ref`
  matching in S2 is ambiguous or fails. It is **not** proposed as a workstream here: determinism-first
  means deterministic ref resolution stays primary, and the two existing seams this would extend — Phase
  6's recipe-compiler self-healing selectors and S9's "selector hints re-resolved against S2 identity
  refs" — already target the same goal. Revisit only if S2's ref-resolution proves to be a real friction
  point in practice, per the research doc's own verdict; do not build ahead of that evidence.

---

## Routing — what this track does not own

Per the existing convention ([`../README.md`](../../phases/README.md#routing--what-stays-out) /
[`ai-agent/README.md`](../../phases/ai-agent/README.md#routing--what-stays-out)), reference these,
never duplicate them:

| Stays with                        | Material                                                                                                                                                                                  |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ADR-0008**                      | DOM/a11y-first perception, vision as escalation-only fallback — the architecture this track declines to route around (Ground rules #1)                                                    |
| **Phase 1b**                      | MCP **server** surface (Bearer + rate-limit + Policy re-pass) — AgentQL's README-claimed MCP server names the same opposite-direction gap `webbrain-agent-parity.md` row 17 already found |
| **`webbrain-agent-parity.md` P1** | Generic OpenAI-compatible provider catalog + provider breadth — not re-proposed here, AgentQL doesn't actually surface model choice to compare against                                    |
| **Phase 6**                       | Deterministic, model-free signed recipes + self-healing selectors — the deterministic-first analog to AgentQL's opaque "self-healing" claim                                               |
| **S9**                            | Selector hints re-resolved against S2 identity refs — the other half of the self-healing analog                                                                                           |
| **S6**                            | Credential Broker wiring (currently inert, no OS-auth gate) — not re-proposed, already the phase's own owed work                                                                          |
| **Phase 7**                       | `@tepegoz/notary` — written and unit-tested, not yet imported by `apps/desktop`; no run produces a Replay Receipt today. Already the phase's own recorded status, not restated as new     |
| **ADR-0026 / S5**                 | The extraction sandbox contract P1 builds inside — not reopened                                                                                                                           |

## ADRs owed (numbers assigned when a session actually opens one of these)

**None.** P1 lands entirely inside ADR-0026's existing contract (S5's isolated-snapshot extraction
sandbox); nothing in this track proposes a new capability class, a new trust boundary, or a new
enforcement mechanism. Per this repo's own multi-profile-track lesson
(`multi-profile-isolation.md` — an ADR-number collision from writing a plan too far ahead of when it's
actually opened), no number is reserved here even speculatively.
