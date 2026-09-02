# Track — Anthropic Quickstarts (Computer Use / Browser Use) agent-capability parity

**Status:** 📋 **Proposed — not scheduled (2026-09-02).** No branch, no ADR number reserved, no owner
sign-off. This is a captured gap list in the shape of
[`browser-settings-feature-gap.md`](../tracks/browser-settings-feature-gap.md) and
[`webbrain-agent-parity.md`](webbrain-agent-parity.md): every row names its nearest existing Tepegöz
behaviour and a suggested phase home, so a future session can promote a row into a real `phase-*.md` task
or an `ai-agent`/ADR PR without re-deriving the comparison. This track is deliberately **short** —
see [Why this track exists](#why-this-track-exists) for the category reason.

**Source:** [`docs/others/tepegoz-vs-anthropic-quickstarts.md`](../versus/tepegoz-vs-anthropic-quickstarts.md)
(a same-session deep read of `.junk/anthropic-quickstarts` — `README.md`/`CLAUDE.md`; `browser-use-demo`'s
`tools/browser.py` + `loop.py` + `CHANGELOG.md`; `computer-use-demo`'s `loop.py` + `tools/groups.py`;
`computer-use-best-practices`'s `README.md` + `constants.py` + `sandbox/default.sb` +
`computer_use/{loop,image,trajectory}.py` + `tools/{base,browser,computer,batch,shell}.py`;
`agents/{agent.py,utils/connections.py}`; `autonomous-coding/security.py`; `managed-agents/*` — against
this repo's `phases/ai-agent/`, `packages/orchestrator|model-gateway|capability-plane|
security-policy|agent-runtime|browser-tools|tool-executor|mcp-client|notary|agent-eval`,
`extensions/ext-agent`, and `docs/adr/{0005,0006,0008,0013,0018,0026,0029,0030,0039}`) against
[`docs/research-computer-use-agents.md`](../research/research-computer-use-agents.md) (the broader
"partial-open SDK" research note covering AgentQL/Nova Act/OpenAI CUA sample alongside this rival) and a
**fresh independent re-read of the rival source** in this session — `computer-use-best-practices/README.md`
(CAUTION block, provider section), `computer_use/image.py`, `computer_use/loop.py`, `sandbox/default.sb`,
`browser-use-demo/README.md` — plus the current state of `@tepegoz/model-gateway`, `@tepegoz/orchestrator`,
`@tepegoz/screenshots`, `@tepegoz/security-policy`, and ADR-0026/0029/0030 in this repo, to catch anything
that shipped or stayed dormant since 2026-09-01.

## Why this track exists

The comparison this track distills from lands on a framing the two prior AI-agent parity tracks (WebBrain,
AIPex) did not need: **Anthropic Quickstarts is not a rival product, it is the model vendor's own MIT-licensed
teaching-scaffold collection** — every README says so itself (_"reference implementation for instructional
purposes only… there are no safeguards"_, `computer-use-best-practices/README.md`). Racing it on capability
breadth would be a category error. What survives that caveat is narrow but real: **(a)** the vendor's own
canonical computer-use/browser-use loop shape versus Tepegöz's Planner→Executor→Reactor — informative, not
actionable, because the vendor's own reference doesn't use the layering it would need to adopt anything
here; **(b)** `computer-use-best-practices`'s security guidance, read against Tepegöz's PolicyKernel/HITL —
already covered end-to-end in the comparison doc, and Tepegöz comes out ahead on three of the vendor's own
four rules, with the fourth (credential handling) conceptually ahead but shipped inert; **(c)** two small,
concrete, source-verified techniques — image/coordinate calibration and a provider request-size guard —
that are genuinely portable regardless of category. [`docs/research-computer-use-agents.md`](../research/research-computer-use-agents.md)
already ranks `computer-use-best-practices` as the single highest-value subdirectory across all four
"partial-open SDK" rivals it surveys and names the same overlap with Tepegöz's S1/S2/S7; this track does
not repeat that document's reasoning, it turns its one actionable line item into phase-shaped detail. This
track's job, per rival capability found genuinely good and genuinely missing: _does Tepegöz already have a
seam for this, and if not, what would the Tepegöz-conformant version look like_ — never "port the Python,"
always "re-derive inside the existing kernel/PEP/i18n/coverage discipline."

## How to read this

Each workstream below is written like an `ai-agent` phase section (Goal → Approach → new/changed
packages → ADR owed → DoD-shaped bullets) so it can be lifted into a real phase file with minimal
rewriting. **Nothing here is committed roadmap.** This track deliberately does **not** force a large
inventory the way the WebBrain/AIPex tracks did — most of the rival's surface (OS-level `pyautogui`
control, a containerized Linux desktop, a hosted `computer` toolset, Managed Agents' server-hosted
ecosystem) is either a different product category or already covered by an existing "Already planned —
do NOT re-propose" line in [`../README.md`](../../phases/README.md#deferred--adoption-gated-backlog-from-the-beyond-phases-synthesis).
Two workstreams below are genuinely new-but-small; everything else that looked promising on a first pass
turned out, on tracing it to the actual wired code, to already be shipped (prompt caching), already owed
elsewhere (Notary wiring), or to conflict with a standing ADR (see Ground rules).

**A correction made while writing this track, stated rather than silently fixed:** the source comparison
doc's "context/cache economy" section reads as if Tepegöz has no prompt caching (_"Tepegöz'de... compaction
yok"_ / `budget.md`'s 2026-08-21 line _"`cache_control` appears nowhere in the repo today"_). Re-reading
`@tepegoz/model-gateway` in this session shows that line is now stale: `cache-plan.ts` (pure breakpoint
decision + `cacheEffect`/`wasted`-hit detection), `providers/anthropic.provider.ts` (two `cache_control`
breakpoints — system+tools, and the last Reactor-promised-stable turn), and `@tepegoz/orchestrator`'s
`cache-window.ts` (`stableIndexBefore`, the lag-2 rule) landed together on 2026-08-21 (`414b4df`) and
`cacheEffect` is called from the live path in `gateway.ts:194`, not just tested. **It is wired, not
dormant** — only its dollar-savings claim is unmeasured, same ⏸-funded-sweep state as everything else in
this program. Treating a landed-but-unmeasured mechanism as "missing" would have produced a workstream that
re-invents code that already exists; the real, remaining gap is narrower and is P1 below.

## Ground rules — parity, not imitation

Six rival patterns are **deliberately not being matched**, because matching them would violate a standing
decision this repo already made after deliberation, or because the rival's own numbers show the pattern
depends on infrastructure Tepegöz has structurally opted out of. Naming them once so no future session
re-proposes them by accident:

1. **No VM/container/disposable-sandbox as the agent's trust boundary.** Every one of the rival's three
   agent demos assumes it: `computer-use-demo`/`browser-use-demo` ship as Docker containers,
   `computer-use-best-practices/README.md` tells the reader outright to run it inside "a disposable macOS
   VM" because the agent has "full control of your mouse, keyboard, and screen" with "no safeguards."
   Tepegöz's whole thesis is the opposite bet: the agent runs in the user's **real, signed-in browser
   session** (`persist:tepegoz-web`), and the boundary is [ADR-0006](../../docs/adr/0006-policy-kernel-hitl.md)'s
   deterministic pre-model **policy** kernel, not a process/VM partition. This is a harder problem the
   comparison doc is explicit Tepegöz has not yet proven it has solved (S0–S12 all sit 🟠
   measurement-owed) — but the fix for that is finishing the measurement, not adopting the vendor's easier,
   proven-but-different bet. Do not propose a sandboxed/VM execution mode for the agent.
2. **No `execute_js` / bash / python / editor / terminal agent tool.** `browser-use-demo` ships
   `execute_js` on the live page and its own system prompt _encourages_ using it
   (_"Use execute_js to extract data from JavaScript variables, localStorage…"_);
   `computer-use-best-practices` adds `bash`, `python`, and an `editor` tool, sandboxed with
   `sandbox-exec` (`sandbox/default.sb` — `deny default` + `deny network*` + scratch-only write + a
   secret-path (`~/.ssh`, `~/.aws`, `~/.gnupg`, `.env*`, …) read-deny list, verified in this session).
   [ADR-0026](../../docs/adr/0026-agent-code-execution.md) already measured the nearest equivalent
   design for Tepegöz (an isolated-world sandbox) and it was **refuted on the first attempt** — an
   isolated world shares the frame's network access, so it is a JS-principal boundary, not a network one.
   What ships instead (`code_exec_read`: a network-cancelled, cookie-free, `default-src 'none'` snapshot
   copy; `code_exec_write`: unconditional deny) is already stricter than the rival's own SBPL profile, and
   [ADR-0029](../../docs/adr/0029-devtools-expose-boundary.md) keeps DevTools/console/terminal-class access
   **user-only, never an agent tool**, enforced by a committed test
   (`no-devtools-tool.test.ts`). The rival's SBPL profile is a reasonable minimal reference _if_ Tepegöz ever
   reopens ADR-0026 — it is not a reason to reopen it, and there is no bash/python/terminal tool to sandbox
   in the first place.
3. **No pursuit of Anthropic's hosted `computer`/`browser` toolset schema to reach the vendor's server-side
   safety classifiers.** `computer-use-best-practices/README.md` states plainly that its computer-use
   prompt-injection screen — screenshot-content classification included — runs **only** when a request
   declares Anthropic's own dated computer tool (the hosted toolset); a custom tool schema falls back to a
   "generic safety path." Tepegöz's `CanonRequest`/`CanonResponse` normalizes all 8 providers to one shape
   ([ADR-0005](../../docs/adr/0005-provider-agnostic-ai.md)), so it is **structurally** on the generic path
   by design, not by oversight. This is a real, concrete, previously-unwritten-down cost of provider
   agnosticism — worth recording here once so a future session doesn't rediscover it as a bug — but the fix
   is not vendor lock-in; Tepegöz's own client-side stack (PolicyKernel + `EgressFirewall` + `TaintTracker` +
   `sanitizeText`/`wrapUntrustedContent`) is the deliberately-chosen substitute and is not being replaced.
4. **No first-party "advisor" server-side second-opinion tool as a substitute for the Reactor.**
   `computer-use-best-practices` can mid-run consult a stronger model (default Opus) server-side for
   advice the acting model may or may not follow (`_advisor_tool_param`, `BetaAdvisorTool20260301Param`,
   `tests/test_advisor.py`) — explicitly a first-party-only beta the demo's own `README.md` disables with a
   startup `ValueError` on any other provider. Tepegöz's Reactor already makes this kind of call
   deterministically and typed (`continue`/`retry`/`replan`/`stop`), provider-agnostically, and it decides
   rather than advises. Adopting the vendor's advisor tool as-is would both duplicate the Reactor and
   violate ADR-0005; nothing here is being added.
5. **No coordinate-first / screenshot-every-step perception as the default path.** `computer-use-demo` and
   `computer-use-best-practices`'s `computer` tool are pure screenshot+coordinate (19 actions); best
   practices' own `browser` tool is _also_ coordinate-based (15 actions, no `ref`). The program's own
   Never-list already forbids this (`README.md`). **One nuance worth recording, not rejecting:**
   `browser-use-demo`'s tool goes the other way — `ref`-based element targeting, and its own `README.md`
   titles a section "Advantages Over Coordinate-Based Automation" (verified in this session), attributing
   `ref` reliability to it being layout/resize-independent, unlike pixel coordinates. That is not a
   capability to reject — it is the vendor's **own** browser demo independently landing on
   [ADR-0008](../../docs/adr/0008-perception-cdp.md)'s DOM/a11y-first thesis. Nothing to import; the point
   is already made in code Tepegöz already ships.
6. **No `computer_batch`/`browser_batch` multi-tool-call-per-turn execution.** The rival's toolset lets the
   model issue several tool calls in one turn, executed as a batch, with a system-prompt nudge toward using
   it. [ADR-0013](../../docs/adr/0013-agent-orchestration-hitl.md) already made the opposite, deliberate
   trade: "execution is intentionally serialized" and the desktop IPC layer runs "at most one active agent
   task at a time" — every tool call passes through the single `ToolGateway` PEP (lookup → idempotency →
   zod → PolicyKernel → HITL → execute → audit) **one at a time**, because a per-tool HITL gate on a batch
   of N calls has no clean meaning ("approve all N sight-unseen" is not the same guarantee as "approve
   each"). The comparison doc already names this the consciously-paid latency cost of that guarantee; this
   track does not propose paying it back by adding batching.

## Capability inventory

Legend for **Home**: an existing phase/ADR/track name means "already planned or already covered, this
row cites it, no new work proposed here." **NEW** means this track proposes new (small) scope. **Backlog**
means real but small enough to fold into other work rather than write up as its own workstream. **N/A**
means the rival's technique has no Tepegöz analog to close because Tepegöz doesn't have the thing it would
attach to (see the cited Ground rules item).

| #   | Anthropic Quickstarts capability                                                                                                                                                                                                                                                 | Nearest Tepegöz behaviour today                                                                                                                                                                                                                                                                                                                                                                                                                                             | Gap                                                                                                                                                                                                                         | Home                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `computer_use/image.py` `target_image_size` — exact port of the API's tile-quantized resize algorithm; the README states the reasoning with a number: sending an image at a size the server will resize again produces "systematic click drift (~14% on a 16:10 MacBook screen)" | `@tepegoz/screenshots`'s `fitToBudget` (`vision-budget.ts`) — a continuous area/edge scale-down (`DEFAULT_PX_PER_TOKEN=750`, `DEFAULT_IMAGE_TOKEN_BUDGET=1200`, `MIN_EDGE=320`), **not** a per-provider tile-quantized fit                                                                                                                                                                                                                                                  | `fitToBudget` picks a size that approximates a token budget but not necessarily the exact size the target provider's vision encoder will actually use — the same drift class the rival's algorithm exists to prevent        | **P2 (NEW, small — sharpens S10's own downscale step, explicitly gated)**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2   | Per-surface request-body size ceiling (Vertex 18 MB / Bedrock 11 MB / none on first-party), enforced pre-flight inside the image pruner with a graceful force-prune-and-reset, verified in `README.md` in this session                                                           | `ModelGateway.complete()` (`gateway.ts`) enforces `maxTokens` (output cap) only — no pre-flight request **payload** size guard for any of the 8 providers                                                                                                                                                                                                                                                                                                                   | A large accumulated conversation (worse once S10 attaches images) can hit a provider's real wire-level limit and fail late, opaquely, at the network layer instead of degrading gracefully pre-flight                       | **P1 (NEW, small — extends S7)**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 3   | Prompt-cache breakpoints (up to 4: system + up to 3 trailing) + `compact_20260112` server-side autocompaction + per-turn `cache_eff` console line                                                                                                                                | `cache-plan.ts` + `anthropic.provider.ts` (2 breakpoints: system+tools, last-Reactor-stable-turn) + `cache-window.ts`'s lag-2 rule + `TokenLedger` cache-token accounting — **landed and wired** (`gateway.ts:194`), not dormant; dollar-savings unmeasured (⏸ funded, same as the whole program)                                                                                                                                                                           | An explicit, user-visible mid-run "context compacted" step (vs. Tepegöz's silent in-place collapse)                                                                                                                         | **already captured** — [`webbrain-agent-parity.md`](webbrain-agent-parity.md)'s **P9-a** (extends S1/S7), not re-proposed here; this row exists only to correct the "no caching" reading (see [How to read this](#how-to-read-this)) and to note the rival's own reasoning for _more than one_ breakpoint (surviving a mid-run image-prune "shift") does not straightforwardly transfer, because `cache-window.ts`'s own doc comment already explains why Tepegöz's in-place message mutation makes a naive multi-breakpoint ladder counter-productive, not merely unbuilt |
| 4   | Import-time tool-schema drift check (`name`/`description`/`input_schema` `ClassVar`s + `__init_subclass__`) — cheap, no runtime validation                                                                                                                                       | `CapabilityRegistry` + zod `safeParse` at the one `ToolGateway` PEP — stronger (runtime, not just import-time) but no equivalent static/registration-time check                                                                                                                                                                                                                                                                                                             | A cheap, additive DX guard Tepegöz doesn't have, independent of the runtime one it already has                                                                                                                              | **Backlog** (small, not written up as a phase)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 5   | MCP client (`agents/utils/connections.py`, stdio + SSE); Managed Agents defaults MCP tools to `always_ask`                                                                                                                                                                       | `@tepegoz/mcp-client` ([ADR-0018](../../docs/adr/0018-mcp-client.md)) — client, same direction, deeper: `McpSupervisor`, `dangerClassFor` (unknown annotation → most-restrictive class), same one PEP; native `mcp_servers` server-side connector explicitly rejected because it would bypass the local kernel                                                                                                                                                              | None — Tepegöz is already ahead on this axis                                                                                                                                                                                | **already covered — ADR-0018, do not re-propose**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 6   | `runs/<ts>/{meta.json,transcript.jsonl,system_prompt.txt,images/}` + a Streamlit trajectory viewer (`computer_use/trajectory.py`, verified in this session)                                                                                                                      | Event Journal + replay timeline + `@tepegoz/notary` — the algorithmic core (hash-chained checkpoints, Ed25519 signing, portable Replay Receipt, standalone `tepegoz-verify` CLI) is **written and tested**, but [ADR-0030](../../docs/adr/0030-notary-service.md) itself records: **"Nothing in `apps/desktop` calls this package yet"** — no migration adds chain columns to `events`, `EventJournal.append` computes no `selfHash`, no key is generated via `safeStorage` | The rival's ~60-line, unglamorous "it just writes files and they're readable" trajectory log independently validates that the missing piece is wiring, not algorithm — Tepegöz's mechanism is already more capable on paper | **already covered** — [Phase 7](../../phases/product/phase-7-verifiable-accountability.md) / ADR-0030, **not re-proposed**; the exact wiring gap ADR-0030 names is what this row confirms from the outside, nothing more                                                                                                                                                                                                                                                                                                                                                   |
| 7   | `sandbox-exec` SBPL profile for the bash/python tools (`sandbox/default.sb`) — deny-default, network-deny, scratch-only write, secret-path read-deny                                                                                                                             | N/A — Tepegöz ships no bash/python/shell/terminal agent tool to sandbox in the first place (ADR-0026/0029)                                                                                                                                                                                                                                                                                                                                                                  | None — the technique only matters if such a tool existed, and Tepegöz has decided it will not                                                                                                                               | **N/A — see Ground rules #2, not a gap**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

## P1 — Provider request-body size guard (extends S7)

**Goal.** Close the one concrete, source-verified gap in an otherwise-landed caching path: a pre-flight
guard against a provider's real wire-level request-size ceiling, so a large conversation degrades
gracefully instead of failing late and opaquely at the network layer — the same problem the rival solves
inside its image pruner, verified in this session (`computer-use-best-practices/README.md`: 18 MB on
Vertex, 11 MB on Bedrock, "force-prunes to `cfg.image_prune_min` images and resets the interval cycle").

**Approach.**

- Add a small, pure size-estimate function next to `cache-plan.ts`'s existing `contentChars` (which
  already sums text/image/tool_use/tool_result payload sizes per message) — reuse it rather than writing a
  second traversal.
- A per-adapter ceiling constant, keyed the same way the rival keys it (by wire surface, not by model):
  most of Tepegöz's 8 providers have no documented hard cap and get `Infinity`/unset; where a provider's
  own docs state one, record it next to that adapter file (`providers/anthropic.provider.ts`,
  `providers/gemini.provider.ts`, etc.) the way `MIN_CACHEABLE_TOKENS` already lives next to the caching
  logic it governs — a data constant, not new infrastructure.
- On the pre-flight check failing, **degrade, do not silently drop content**: report a structured
  `AppError` the Reactor already knows how to fold into its retry/recovery taxonomy (`ADR-0013`'s existing
  policy-denial/stale-selector/page-change/nav-timeout/transient categories already have a shape for "this
  call cannot proceed as composed" — add one more case, not a new mechanism), rather than a raw
  provider-side 413/400 the Reactor has never seen before.
- **What this explicitly does not do:** it does not add a second cache-breakpoint ladder or an
  autocompaction subsystem — per the Capability inventory row 3 correction, that work is already captured
  in [`webbrain-agent-parity.md`](webbrain-agent-parity.md)'s P9-a, and duplicating it here would be the
  exact cross-track re-proposal this repo's tracks convention warns against.

**New/changed packages:** `@tepegoz/model-gateway` (`cache-plan.ts` size-estimate helper reused at the
`gateway.ts` pre-flight check; a small per-adapter ceiling constant where a provider documents one).

**ADR:** none owed — this is additive detail to S7's already-open, non-ADR-gated DoD (the caching item it
sits beside, `L0` in `budget.md`, was itself never ADR-gated either).

**DoD shape (draft):**

- [ ] A pre-flight size check exists and is unit-tested against at least one adapter with a documented
      real ceiling (Vertex-equivalent or whichever provider's docs state one) and at least one with none
- [ ] A call that would exceed the ceiling fails through the existing Reactor retry/recovery taxonomy with
      a named category, never as an unrecognized provider-side HTTP error surfacing raw to the user
- [ ] No behavior change for the overwhelming majority of calls that never approach any ceiling — a
      regression test asserts the guard is a no-op below threshold
- [ ] i18n: if any user-facing message surfaces ("message shortened to fit the provider's limit" or
      similar), EN+TR parity in the same PR; if none is added, this line is explicitly N/A

## P2 — Vision coordinate-calibration ported into `fitToBudget` (extends S10, small, explicitly gated)

**Goal.** The day S10's vision escalation actually gains a production `captureVision` caller (it does not
today — `reactor.ts:655`'s `if (options.captureVision !== undefined)` has exactly one caller in the whole
tree, `vision-fallback-guard.test.ts`), the coordinate space the model reasons in should be the exact space
the target provider's vision encoder will use, not an approximation. `fitToBudget` picks a size by a
continuous token/area budget; the rival's `target_image_size` computes the same thing by the provider's own
tile-quantization rule and states, with a number, why the difference matters: sending a size the server
silently re-resizes produces coordinates the model never actually saw, "~14% [click drift] on a 16:10
MacBook screen."

**Approach.**

- Add a tile-quantized variant of the existing size search in `vision-budget.ts` — `n_tokens_for_px`/
  `n_tokens_for_img`'s ceiling-division-per-axis shape is a direct, small port of `target_image_size`'s
  core loop, not a new algorithm; `fitToBudget`'s existing `BudgetInput`/`BudgetResult` shape and its
  `MIN_EDGE` floor stay exactly as designed, this only changes how the interior size is chosen.
- Key the patch-size/tile-cap constants **per provider** (Anthropic's 28px/token, 1568px-edge, 1568-tile
  numbers are Anthropic-specific — do not hardcode them as if they applied to Gemini/OpenAI's own vision
  encoders, which quantize differently) — this is exactly the same "data constant living next to the
  adapter it governs" pattern as P1's ceiling and the existing catalog-entry philosophy this repo already
  uses for providers/models.
- **Explicitly gated per the anti-debt rule** — this is not opened as standalone work now. Recording the
  algorithm and its rationale here means the day a session actually wires a `captureVision` caller for
  S10, this number is ready rather than re-derived from scratch; it is not scope this track is asking to
  be scheduled today.

**New/changed packages:** `@tepegoz/screenshots` (`vision-budget.ts` — an additional tile-quantized fit
function alongside, not replacing, the existing continuous one, since the continuous one may still be the
right choice for non-vision-provider paths).

**ADR:** none owed — an implementation detail under S10's existing [ADR-0008](../../docs/adr/0008-perception-cdp.md)
mandate (DOM/a11y-first, vision as fallback), not a new decision.

**DoD shape (draft):**

- [ ] **Gated behind S10 reaching a real `captureVision` caller** — this DoD does not open until that
      gate does, per the anti-debt rule ("a new capability is not opened while the phase it builds on is
      still measurement-owed" — S10 today is both 🟠 measurement-owed and ships its capture path with zero
      production callers)
- [ ] When opened: a tile-quantized fit function is unit-tested against the exact per-provider constants
      the target adapter documents, matching the rival's own port-verification approach (assert against
      known input/output size pairs, not just "doesn't crash")
- [ ] The model-visible coordinate space and the space `fitToBudget` actually sent are provably the same
      size (a regression test), closing the exact drift class the rival's README quantifies
- [ ] No change to any non-vision path — this touches only the vision-escalation capture function, nothing
      in the default DOM/a11y perception loop

## Backlog (named, not written up)

- **Import-time tool-schema drift check** — cheap, additive DX guard (a build/registration-time assertion
  that a tool's declared name/description/schema hasn't silently drifted from its handler), independent of
  and weaker than the runtime zod `safeParse` Tepegöz already has at the one PEP. Small enough to fold into
  whichever session next touches `@tepegoz/capability-plane`'s tool-registration path, not worth a phase
  of its own.

## Routing — what this track does not own

Per the existing convention ([`../README.md`](../../phases/README.md#routing--what-stays-out) /
[`ai-agent/README.md`](../../phases/ai-agent/README.md#routing--what-stays-out)), reference these, never
duplicate them:

| Stays with                                                                                                                   | Material                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **[`webbrain-agent-parity.md`](webbrain-agent-parity.md) P9-a**                                                              | Explicit visible mid-run context compaction / "context compacted" marker — this track's Capability inventory row 3 confirms the gap, does not re-propose the fix                                                                                                                                                   |
| **[Phase 7](../../phases/product/phase-7-verifiable-accountability.md) / [ADR-0030](../../docs/adr/0030-notary-service.md)** | Wiring `@tepegoz/notary` into a live run — already named as owed by the ADR itself; this track's row 6 is independent confirmation, not new scope                                                                                                                                                                  |
| **[ADR-0018](../../docs/adr/0018-mcp-client.md)**                                                                            | MCP client depth — Tepegöz already ahead, nothing to add here                                                                                                                                                                                                                                                      |
| **[ADR-0005](../../docs/adr/0005-provider-agnostic-ai.md)**                                                                  | The vendor-lock-in cost of provider-agnosticism (row 2 of the source comparison's headline table) — named once in Ground rules #3, not something this track proposes paying down                                                                                                                                   |
| **[ADR-0006](../../docs/adr/0006-policy-kernel-hitl.md) / [ADR-0013](../../docs/adr/0013-agent-orchestration-hitl.md)**      | The trust-boundary bet (policy kernel, not VM/process isolation) and serialized per-tool execution — both deliberate, not revisited (Ground rules #1, #6)                                                                                                                                                          |
| **[ADR-0026](../../docs/adr/0026-agent-code-execution.md) / [ADR-0029](../../docs/adr/0029-devtools-expose-boundary.md)**    | `execute_js`/bash/python/editor/terminal/DevTools boundary — measured NO-GO + user-only decision, not reopened (Ground rules #2)                                                                                                                                                                                   |
| **[S10 — Vision Escalation](../../phases/ai-agent/phase-s10-vision-escalation.md)**                                          | The vision capability itself (triggers, escalation-rate ceiling, wiring a `captureVision` caller) — P2 only adds a downscale-algorithm detail, gated behind S10's own gate, not a redefinition of S10's scope                                                                                                      |
| **[`docs/research-computer-use-agents.md`](../research/research-computer-use-agents.md)**                                    | The cross-rival "partial-open SDK" synthesis (AgentQL, Nova Act, OpenAI CUA sample) — this track only develops that document's anthropic-quickstarts-specific action item; Nova Act's HITL-pattern / hata-taksonomisi notes and OpenAI CUA's replay-pipeline notes belong to their own future tracks, not this one |

## ADRs owed

None. Both P1 and P2 are additive implementation detail under ADRs already accepted (P1 sits beside S7's
existing, non-ADR-gated caching work; P2 sits inside ADR-0008's already-accepted vision-fallback mandate).
Per this repo's own multi-profile-track lesson (`multi-profile-isolation.md` — an ADR-number collision from
writing a plan too far ahead of when it's actually opened), no number is reserved here even preemptively;
if either workstream someday needs its own ADR, that gets decided and numbered at the point a session
actually starts the work, continuing from **0044** (the current head), not now.
