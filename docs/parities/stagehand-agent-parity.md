# Track — Stagehand agent-capability parity

**Status:** 📋 **Proposed — not scheduled (2026-09-01).** No branch, no ADR number reserved, no owner
sign-off. This is a captured gap list in the shape of
[`browser-settings-feature-gap.md`](../tracks/browser-settings-feature-gap.md),
[`omnibox-competitive-parity.md`](omnibox-competitive-parity.md),
[`webbrain-agent-parity.md`](webbrain-agent-parity.md) and
[`aipex-agent-parity.md`](aipex-agent-parity.md): every row names its nearest existing Tepegöz
behaviour and a suggested phase home, so a future session can promote a row into a real `phase-*.md`
task or an `ai-agent` PR without re-deriving the comparison.

**Source:** a same-session deep read of `.junk/stagehand` (Stagehand v4.0.2 — Browserbase's shipping,
MIT-licensed, TypeScript+Python+Go **browser-agent SDK**, not a product) against this repo's AI surface
(`phases/ai-agent/`, `packages/orchestrator|model-gateway|capability-plane|security-policy|
agent-runtime|browser-tools|web-tools|tool-executor|local-inference|model-catalog|mcp-client|
recipe-compiler|macro-engine|notary|credential-vault|human-input`, `extensions/ext-agent`). The prose
comparison this track distills is
[`docs/others/tepegoz-vs-stagehand.md`](../versus/tepegoz-vs-stagehand.md) (Turkish, 2026-09-01);
this file is the durable English track artifact. Its own methodology note lists the source files read:
`packages/sdk-ts/src/{stagehand,page,batch,webmcp,rpcClient}.ts`, `packages/extension/{inference,prompt,
runtime}.ts` + `services/{actService,extractService,observeService,cacheService}.ts` +
`understudy/a11y/snapshot/{a11yTree,domTree,capture}.ts` + `llm/{LLMProvider,LLMClient,gatewayClient,
clientLlmClient}.ts` + `understudy/domainPolicy.ts`, `packages/protocol/{schemas,schema-registry}.ts`,
`packages/integrations/core/src/{facade/{tools,contract},harness/{redact,index}}.ts` +
`packages/integrations/README.md`, `packages/integrations/claude-agent-sdk/src/session.ts`,
`packages/docs/v4/**`, `packages/sdk-ts/examples/*`, `rules/`. Key claims below were re-verified
against that source in this session rather than taken on the comparison doc's word alone.

## Why this track exists

The comparison landed on a **structurally asymmetric** verdict, sharper than either prior track: Stagehand
is not a rival agent, it is a rival **library** — a developer `import`s it and builds their own agent loop,
permission model, and UI on top; Tepegöz ships all three inside one product. Read naively, most of
Stagehand's "wins" (Playwright-shaped driver, Model Gateway, managed cache, WebMCP, a 9-harness MCP
ecosystem) are either **category-mismatched** (a library ergonomics story that doesn't apply to a
non-embeddable product) or **already named** by the two sibling tracks this repo just wrote
(`webbrain-agent-parity.md`'s provider catalog / frame-perception work, `aipex-agent-parity.md`'s MCP-server
design). What is left after subtracting both of those is a **short, real list**: one genuinely new
capability class (page-declared tools via WebMCP), one genuinely new design gap (an intra-run,
model-still-in-the-loop action cache distinct from Phase 6's model-_free_ signed recipes), one perception
detail worth pulling forward from "later" to "now" (closed shadow-DOM + OOPIF piercing, which Stagehand
ships in production today), and one credential-handling pattern that must be explicitly **rejected** rather
than adopted. This track's job is the same as its siblings': for every Stagehand capability the comparison
found, _does Tepegöz already have a seam for this, and if not, what would the Tepegöz-conformant version
look like_ — never "port the JS," always "re-derive the capability inside the existing kernel/PEP/i18n/
coverage discipline," and never re-describe what a sibling track already owns.

## Category note — what is out of scope because Stagehand is a different kind of thing

Per the read-method's own instruction ("a rival in a different product category: only carry
overlapping-axis capabilities, explicitly exclude the category-specific ones"), three Stagehand
"advantages" are **not capability gaps at all** and are not carried into the inventory below:

- **The multi-language SDK form factor itself** (TS + Python + Go, `import`ed into someone else's app).
  Tepegöz is a full Electron browser, not an embeddable library, and has no plan to become one — nothing
  in any phase proposes shipping tepegoz-the-agent as a package another developer's code calls into.
- **The Playwright-compatible `page`/`locator`/`context` developer API surface** as an _exposed contract_.
  Tepegoz's browser tools are agent-callable capabilities behind a policy gate, not a driver library a
  third-party test suite would import. Where Stagehand's locator work reveals a real _perception_
  capability gap (closed shadow DOM, iframe reach) that is carried forward below — but as a tool
  capability, never as a re-exposed `page.locator()`-shaped API.
- **`code mode`** (an external coding assistant writes a Stagehand script, a developer runs it with no
  per-step inference) as a _product workflow_. The underlying idea — pre-authored, inference-free,
  replayable automation — is exactly [Phase 6](../../phases/product/phase-6-deterministic-automation.md)'s territory
  already, and is folded into workstream P2 below rather than treated as a distinct ask.

## How to read this

Each workstream below is written like an `ai-agent` phase section (Goal → Approach → new/changed
packages → ADR → DoD-shaped bullets) so it can be lifted into a real phase file with minimal rewriting.
**Nothing here is committed roadmap.** Where a capability already has a named home in an existing phase,
an ADR, or a sibling track, this track says so explicitly and does **not** re-describe it — it only adds
the detail the Stagehand reading surfaced that the existing text doesn't have yet. Per the "Already
planned — do NOT re-propose" rule in [`../README.md`](../../phases/README.md#deferred--adoption-gated-backlog-from-the-beyond-phases-synthesis),
the **MCP server** surface, provider-catalog breadth, and frame/shadow-DOM perception reach are already
proposed in detail by `aipex-agent-parity.md` P1, `webbrain-agent-parity.md` P1, and
`webbrain-agent-parity.md` P3-b / `aipex-agent-parity.md` P2 respectively — several rows below are
"sharpen an already-proposed track's design with this Stagehand-specific detail," not "add a workstream."

## Ground rules — parity, not imitation

Two Stagehand design choices are **deliberately not being matched**, because matching them would violate
a standing decision this repo already made, or would reopen one under a different name. Naming them here
once, so no future session re-proposes them by accident:

1. **No un-gated secret substitution as a stand-in for the Credential Broker.** Stagehand's `variables`
   mechanism (`%name%` placeholders) keeps a secret's _value_ out of the model's context — only the name
   is sent, the value is substituted locally right before the action executes — and is a genuinely
   reasonable pattern **for a library with no policy kernel**. But it has no OS-authentication gate: the
   value still flows straight from the calling code into an action argument, and Stagehand's own docs
   concede that if caching is on, `variables` calls still reach the cache service (only logs are reliably
   redacted). Tepegoz's Credential Broker made the opposite, stricter bet on purpose: the agent has **no
   shape a secret could arrive in at all** until an OS-auth gate exists, and every fill is refused until
   then — which is _why_ it ships inert (S6, [`phase-s6-safety-control-plane.md`](../../phases/ai-agent/phase-s6-safety-control-plane.md)).
   Adopting a `variables`-style "keep it out of the prompt, substitute locally" shortcut would be adopting
   exactly the design S6's inertness exists to refuse. If a _pattern_ is worth borrowing at all, it is the
   naming discipline (the model only ever sees a symbolic reference, never a raw secret token in its own
   output) — but the substitution itself stays behind the OS-auth gate S6 already specifies, not in front
   of it.
2. **No page-authored or batch-authored JS execution as an agent-callable tool.** Stagehand's
   `experimentalBatch` runs a serialized JS callback against a Playwright-compatible facade in the page —
   safe _in Stagehand's own hands_ only because the caller is trusted developer code invoking it once, not
   a model deciding per-step to run arbitrary script. Tepegoz has no equivalent "trusted developer code"
   layer between the model and the page — every tool call in this product is potentially model-issued, so
   the same mechanism here would be indistinguishable from the `execute_js` tool
   [ADR-0026](../../docs/adr/0026-agent-code-execution.md) already measured and refused (the isolated-world
   sandbox was **refuted**, not merely deferred) and that [ADR-0029](../../docs/adr/0029-devtools-expose-boundary.md)
   keeps DevTools-class capability user-only. Tepegoz's actual analog to "pre-authored, inference-free,
   deterministic automation" is [Phase 6](../../phases/product/phase-6-deterministic-automation.md)'s `macro-engine`
   and `recipe-compiler` — a **non-JS**, model-free control-flow shape purpose-built to not need arbitrary
   script execution. Workstream P2 below is that answer; a JS-callback tool is not being added alongside
   it.

Neither of these is "Stagehand did it wrong" — Stagehand is a library with no native process, no policy
kernel, and a caller it can reasonably trust to be the developer's own code; both patterns are defensible
in that setting. The point of naming them here is that a future reader of this track shouldn't reopen a
decision made for a documented reason, in a product where the trust assumption that made the original
pattern safe does not hold.

---

## Capability inventory

Legend for **Home**: an existing phase/ADR name (or a sibling track's workstream) means "already planned,
this row sharpens it, no new workstream needed." **NEW** means no existing plan owns it and this track
proposes one. **Ground rules #N** means deliberately not matched.

| #   | Stagehand capability                                                                                                                                                                   | Nearest Tepegöz behaviour today                                                                                                                                                                                                          | Gap                                                                                                                                                        | Home                                                                                                                        |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 1   | **WebMCP** (`page.tools()`) — discover + call tools the _page itself_ declares, behind an experimental Chromium flag                                                                   | Nothing — no concept of a page-declared, model-callable tool at all                                                                                                                                                                      | A wholly new trust class: a tool whose existence and schema come from the page, not from a developer/config                                                | **P1 (NEW, extends ADR-0018)**                                                                                              |
| 2   | Server-side managed action cache (`cacheService.ts`) — instruction+page+options key, model config excluded, replay without inference until it breaks, then fall back to full inference | `cache-window.ts` (prompt-level, lag-2 breakpoints) — nothing at the _action-result_ level; [Phase 6](../../phases/product/phase-6-deterministic-automation.md)'s recipe-compiler is signed + model-**free**, a different, heavier thing | An intra-run inference-skip cache that stays model-in-the-loop on miss, sitting between cache-window (prompt-level) and recipe-compiler (fully model-free) | **P2 (NEW-ish, sharpens S7)**                                                                                               |
| 3   | `selfHeal` — selector miss triggers one re-snapshot + one re-inference retry, capped                                                                                                   | [Phase 6](../../phases/product/phase-6-deterministic-automation.md) already names "self-healing selectors" as in scope; S3's locator cascade + identity refs (S2) also contribute                                                        | Already-planned territory; sharpen the DoD with Stagehand's concrete bound (**one** retry, re-snapshot-triggered, not open-ended)                          | **Phase 6** (already planned — sharpen only, folded into P2's writeup)                                                      |
| 4   | Closed shadow-DOM + OOPIF piercing via CDP, shipped in production today; frame-qualified `[frame-backendNodeId]` identity + `xpathMap`                                                 | `webbrain-agent-parity.md` P3-b / `aipex-agent-parity.md` P2 already scope open shadow roots as v1 and **defer closed roots to "a documented Full-tier fallback, not a v1 requirement"**                                                 | Evidence that closed-shadow + OOPIF is buildable _now_, not just eventually — worth pulling forward                                                        | **P3 (sharpens `webbrain` P3-b / `aipex` P2 with a promotion case, not a new perception workstream)**                       |
| 5   | `variables` — secret name to model, value substituted locally, kept out of logs (not reliably out of cache)                                                                            | Credential Broker — no shape a secret could arrive in until OS-auth exists (deliberately inert, S6)                                                                                                                                      | —                                                                                                                                                          | **Ground rules #1** — not adopted                                                                                           |
| 6   | `experimentalBatch` — a developer-authored JS callback run once against a Playwright-shaped facade in the page                                                                         | Nothing — and nothing should exist here                                                                                                                                                                                                  | —                                                                                                                                                          | **Ground rules #2** — not adopted; [Phase 6](../../phases/product/phase-6-deterministic-automation.md) is the actual answer |
| 7   | Browserbase Model Gateway — omit `model` → server auto-selects per call; omit key, give model → routes to Gateway, no account needed                                                   | `ModelRouter`'s capability→tier mapping already does _deterministic_ per-call routing (plan/exec/classify → tier); no keyless managed path                                                                                               | The keyless/managed half is **Phase 3** ("works without the user entering a key"); the auto-selection half already exists architecturally                  | **Phase 3** (already planned) — no new workstream                                                                           |
| 8   | BYO-LLM callback — sovereign-neutral request/response callback, the _only_ path for Bedrock/Azure-native/Cohere/self-hosted-non-OpenAI-wire providers                                  | `webbrain-agent-parity.md` P1's `OpenAICompatibleProvider` + catalog covers anything that speaks the OpenAI Chat Completions wire format; a raw non-wire-compatible callback is narrower still                                           | A thin addendum to an already-proposed workstream, not a new one                                                                                           | **`webbrain` P1** (already proposed) — sharpen only, one sentence in P2 below's "what stays as designed"                    |
| 9   | 3-tool facade (`run`/`snapshot`/`screenshot`) exposed as both a stdio MCP server and an in-process tool set to 9 external harnesses                                                    | `aipex-agent-parity.md` P1 already proposes a bounded, Bearer-gated `@tepegoz/mcp-server` exposing "a bounded, explicitly published subset" of the registry, without specifying _how_ bounded                                            | A concrete reference shape (exactly 3 tools, not the full ~30) worth folding into P1's still-open "how bounded" question                                   | **`aipex` P1** (already proposed) — sharpen only, one paragraph, no new workstream                                          |
| 10  | OTel spans + `stagehand.metrics()` + Browserbase's hosted session-replay dashboard (vendor-hosted, works today)                                                                        | `ext-agent`'s replay timeline already ships in-product; [Notary](../../phases/product/phase-7-verifiable-accountability.md) (Phase 7) is the architecturally heavier, cryptographic answer but is measurement-owed                       | A structured, OTel-compatible trace export for developer debugging — genuinely real, genuinely low-priority                                                | **Backlog**                                                                                                                 |
| 11  | Playwright `waitForSelector`/`LoadState`/`Timeout`, `dragAndDrop`                                                                                                                      | S3 already ships bounded waits (`browser_validate_condition`); **drag is a known, already-tracked open item** — S3 PR6 spike-first, HITL-fallback, explicitly **not a DoD gate**                                                         | Nothing to propose — already an open, named line in a landed phase                                                                                         | **S3** (already tracked) — n/a                                                                                              |
| 12  | `agent()` removed in v4; no CUA mode; migration doc says "no equivalent, own the loop yourself"                                                                                        | Planner→Executor→Reactor, typed `Decision`, single serialized run (ADR-0013)                                                                                                                                                             | — (both projects converge on "no built-in autonomous loop shortcut," for different reasons)                                                                | n/a — convergence noted, not worked                                                                                         |
| 13  | Multi-language SDK (TS+Python+Go), Playwright-compatible `page`/`locator`/`context` API as an exported developer contract                                                              | Not applicable — Tepegoz is not an embeddable library                                                                                                                                                                                    | —                                                                                                                                                          | **Category note** — out of scope                                                                                            |
| 14  | `code mode` (external coding assistant authors a script, developer runs it, no per-step inference)                                                                                     | [Phase 6](../../phases/product/phase-6-deterministic-automation.md)'s deterministic recipe/macro shape                                                                                                                                   | —                                                                                                                                                          | **Phase 6** (already planned) — folded into P2                                                                              |
| 15  | `domainPolicy.ts` (CDP Fetch-layer host allow/block) + Browserbase `blockAds`                                                                                                          | `EgressFirewall` (Shannon-entropy secret/exfil scanning) + `PolicyKernel` (danger-class + taint + site, pre-model) is already broader                                                                                                    | — (Tepegoz already ahead)                                                                                                                                  | n/a                                                                                                                         |
| 16  | Türkçe / bölgesel derinlik: none (multi-language means TS/Python/Go, not human locale)                                                                                                 | EN+TR parity per package (ADR-0016), ≥10 Turkish-web H2H tasks required, Phase 11 e-Devlet/KVKK track                                                                                                                                    | — (Tepegoz already ahead)                                                                                                                                  | n/a                                                                                                                         |

---

## P1 — WebMCP page-declared tool ingestion (NEW, extends ADR-0018)

**Goal.** Stagehand's WebMCP support (`page.tools()`) points at a real, near-future browser capability
that neither sibling track names: a **page itself** can declare a set of Model-Context-Protocol-shaped
tools (behind an experimental Chromium flag today, `--enable-features=WebMCPTesting`) that a driving
agent can discover and call. This is architecturally distinct from Tepegoz's existing MCP **client**
surface (ADR-0018) in one load-bearing way: an MCP client tool comes from a server the _user or developer
configured_ (a trust decision made once, out of band); a WebMCP tool comes from **whatever page happens to
be open**, declared by content the model may itself be reading. If Tepegoz ever ingests this, it must
enter through the exact same distrust model page-derived _data_ already gets — a page-declared tool is
closer to "a script tag asking to be treated as a capability" than to "an admin-configured integration,"
and must never be granted the implicit trust an explicitly-added MCP server gets today.

**Approach.**

- **Treat a WebMCP source as a distinct, maximally-distrusted `McpSupervisor` source**, not a new
  subsystem. `@tepegoz/mcp-client`'s existing `dangerClassFor` already has a rule for "unknown annotation
  → most restrictive class" (ADR-0018) for a _configured_ server the user chose to add; a page-declared
  tool gets that same treatment **unconditionally** — every WebMCP tool is `dangerClass: 'destructive'`
  (or the ceiling class) regardless of what the page's own manifest claims, because the manifest itself is
  untrusted content the same way page text is.
- **No implicit grant.** Registering an external MCP server today is a one-time, explicit developer/user
  action (Settings → Adaptors). A WebMCP tool set changes with every navigation — the equivalent trust
  event is "this site wants to expose N tools to the agent," surfaced as its own HITL-shaped prompt the
  first time a given origin's WebMCP tools are ever invoked, not silently auto-discovered and auto-callable
  the way Stagehand's `page.tools()` is.
- **Tool call arguments and results are taint-wrapped like any other page-derived content.** A WebMCP
  tool's declared schema is data for zod `safeParse`, never trusted instruction text; its **result** goes
  through the same `wrapUntrustedContent`/taint path as `browser_get_page`'s output — a page cannot use its
  own declared tool to hand the model an unwrapped instruction.
- **Off by default, behind the same posture as the underlying browser feature.** Chromium ships this
  behind an experimental flag; Tepegoz's own flag (`TEPEGOZ_WEBMCP` or similar) stays off until the
  upstream feature stabilizes and the origin-scoped grant UX above exists — this is explicitly a "build the
  seam, ship it inert" case in the same family as S6/S9/S10's inert capabilities, not a rushed default-on.
- **What stays exactly as designed:** the one `ToolGateway` PEP (lookup → idempotency → zod →
  `PolicyKernel` → HITL → execute → audit) is unchanged — a WebMCP tool is a new _source_ feeding the same
  `CapabilityRegistry`, never a parallel invocation path.

**New/changed packages:** `@tepegoz/mcp-client` (a `WebMcpSource` alongside the existing configured-server
source, sharing `McpSupervisor`/`dangerClassFor` but with the ceiling class forced and no persisted
per-origin trust until the first-use grant), `@tepegoz/tool-executor` (taint-wrap WebMCP results),
`extensions/ext-agent` (the per-origin "this site wants to expose tools" grant UI).

**ADR:** an addendum to **ADR-0018** (MCP client) — record explicitly why a page-declared tool source gets
the ceiling danger class unconditionally and an origin-scoped one-time grant, unlike a configured server.

**DoD shape (draft, for whichever session promotes this):**

- [ ] A WebMCP tool's declared schema never bypasses zod `safeParse`, even when the page's own manifest
      claims a looser shape
- [ ] Every WebMCP tool call carries the ceiling danger class regardless of the page's self-declared
      annotation — a test proves a page cannot self-declare its way to a lower class
- [ ] First invocation of any tool from a given origin requires an explicit, visible grant; the grant is
      scoped to that origin and does not carry over to a different site
- [ ] A WebMCP tool's result is taint-wrapped identically to `browser_get_page`'s output before it reaches
      the model
- [ ] Ships behind a **real, wired** flag, off by default, with the flag's gate state recorded explicitly
      (open/inert, not silently defaulted on) — and recorded accurately: S10's vision tier was written up
      as living behind a `TEPEGOZ_VISION` flag that was never implemented; it is inert because Reactor's
      optional `captureVision` callback has no production caller (correction dated 2026-09-02 in
      [`phase-s10-vision-escalation.md`](../../phases/ai-agent/phase-s10-vision-escalation.md)). Do not repeat
      that here — if the flag does not exist in code, the record must not claim it does
- [ ] i18n: the per-origin grant prompt gets EN+TR parity in `extensions/ext-agent`'s dict

---

## P2 — Intra-run action-result cache, model-in-the-loop on miss (sharpens S7; distinguished from Phase 6)

**Goal.** Stagehand's server-side cache is a genuinely different mechanism from both of Tepegoz's existing
"skip the model" ideas, and the difference is worth stating precisely because it decides which phase owns
it. `cache-window.ts` operates at the **prompt** level (keeping message ordering cache-friendly for
provider-side prompt caching); [Phase 6](../../phases/product/phase-6-deterministic-automation.md)'s recipe-compiler
operates at the **fully model-free, signed** level (a recipe that survives the ownership test: "if the
model could be removed from the replay, it's Phase 6"). Stagehand's cache sits **between** them: it skips
inference for a repeated `act`/`extract` call keyed on (instruction, page content, options — explicitly
**not** model config), but on a cache miss or a broken selector it falls straight back to full inference,
same run, no compilation or signing step. Per Phase 6's own ownership test, this does **not** qualify as a
Phase 6 recipe — the model is never actually removable from the loop, only skippable when the cache hits.
Nothing in S7 (speed/cost) currently names this shape either; S7's PR2–PR4 cut validation cadence,
human-realism delay, and decision-encoding size, but never "has this exact action already produced this
exact result this run."

**Approach.**

- **A small, explicit cache layer inside the reactor's action-dispatch path** (near
  [`reactor.ts`](../../packages/orchestrator/src/reactor.ts), the same file S7 PR2 already touches for
  cadence), keyed on `(dangerClass-stable tool name, argument hash, a structural page-signature — the
same djb2 signature S7's adaptive-cadence trigger already computes in `readPage`)`. **Model
  identity/config is explicitly excluded from the key**, matching Stagehand's own finding — a cache entry
  should be reusable across a mid-run model switch, since it records what the _page_ did, not what the
  _model_ decided.
- **Cache miss or a stale/broken target (selector no longer resolves against the current identity-stable
  ref) falls back to full inference in the same turn — never a hard failure.** This is the "self-heal"
  half of the row-3 inventory entry: bounded to **one** re-snapshot-and-reinference retry before treating
  it as a normal replan, matching Stagehand's own cap rather than an open-ended retry loop.
  [Phase 6](../../phases/product/phase-6-deterministic-automation.md)'s own "self-healing selectors" line already
  claims this territory in the README index — this workstream is where that claim gets its concrete
  shape, since Phase 6's file itself has not yet specified one.
- **Still passes through the one `ToolGateway` PEP every time**, cache hit or miss — the cache short-
  circuits the model's _decision_, never the policy/HITL/audit path a dispatched tool call already goes
  through. This is the load-bearing difference from a "skip the security check because we've done this
  before" cache, which is not being built.
- **Scoped to a single run by default.** Stagehand's cache is server-side and persists across runs/users;
  Tepegoz's version starts **intra-run only** (same conversation/task), which sidesteps the cross-run
  staleness and multi-tenant cache-poisoning questions a persistent cache would raise, and is the smaller,
  reviewable first cut. Cross-run persistence (closer to what Stagehand actually ships) is a deliberate
  **not-yet** — flag it as a follow-up, not part of this DoD.
- **What stays exactly as designed:** `TokenLedger`, `ModelRouter`, and every S7 mechanism (adaptive
  cadence, visibility-gated realism, quick-mode encoding) are untouched — this is an additive dispatch-path
  optimization, not a change to any of them.

**New/changed packages:** `@tepegoz/orchestrator` (the cache layer + the bounded self-heal retry, both
near `reactor.ts`), no `@tepegoz/security-policy` change (the PEP re-runs unconditionally on both hit and
miss).

**ADR:** none required — this stays inside `ADR-0013` (orchestration, serialized execution) and
`ADR-0007` (single tool plane) exactly as they already read, the way S7's own "no ADR" line reasons about
its own changes. If cross-run persistence is ever proposed as a follow-up, that would need its own ADR
(cache-poisoning, staleness, and multi-tab scope all become real questions once the cache outlives the run
that populated it) — explicitly **not** covered by this DoD.

**DoD shape (draft):**

- [ ] A repeated identical action (same tool, same args, same page structural signature) within one run
      skips inference and dispatches directly — measured as a token-count delta, tying into S7's own
      `$`/task target
- [ ] Model identity/config is excluded from the cache key — a test proves a mid-run provider switch still
      hits the cache for an action recorded under a different model
- [ ] A cache hit whose target no longer resolves triggers exactly **one** re-snapshot-and-reinference
      retry before falling through to a normal replan — not an open-ended loop
- [ ] Every dispatched action re-enters the full `ToolGateway` PEP on both cache hit and cache miss — a
      test proves a cached action cannot skip `PolicyKernel`/HITL/audit
- [ ] Cache is scoped to the run; a test proves a fresh run starts with an empty cache (no cross-run
      persistence in this DoD)
- [ ] i18n: N/A unless a user-visible "reused a prior result" indicator is added, in which case EN+TR
      parity in the owning package's dict

---

## P3 — Pull closed shadow-DOM + OOPIF forward from "later" to "now" (sharpens `webbrain` P3-b / `aipex` P2)

This is not a new perception workstream — `webbrain-agent-parity.md` P3-b and `aipex-agent-parity.md` P2
already fully specify the design (frames as addressable, non-mutative perception scopes; open shadow roots
in the existing injected DOM walk; frame-host resolution at the Policy Kernel before any grant). Both of
those tracks explicitly park **closed** shadow roots as _"a documented Full-tier fallback, not a v1
requirement"_ on the reasoning that closed roots need CDP and neither WebBrain nor AIPex's source proved
that path out. Stagehand's source is the missing evidence: it pierces closed shadow roots **and** merges
out-of-process iframe (OOPIF) accessibility trees in production today, via CDP's frame/AX-tree APIs, with a
frame-qualified node-identity scheme (`[frame-backendNodeId]`) and a per-frame `xpathMap`. That is a
concrete, working reference implementation for the exact CDP surface P3-b/P2 currently defer — worth
recording so a future session promoting P3-b/P2 doesn't have to re-derive "is this even CDP-buildable" from
scratch, and can consider pulling closed-shadow support into the v1 scope of that workstream rather than
its Full-tier fallback.

**What to add to P3-b/P2's existing writeup, not a separate DoD:** when a session picks up
`webbrain-agent-parity.md` P3-b (or `aipex-agent-parity.md` P2), the closed-shadow-DOM sub-task should cite
Stagehand's frame/AX-tree merge approach as its reference mechanism, and re-evaluate whether closed roots
belong in that workstream's v1 DoD instead of its documented fallback tier — with the same non-mutative
constraint (`aipex` Ground rules #2) and the same frame-host-resolution-before-grant rule
(`webbrain` P3-b) both sibling tracks already require unchanged.

**ADR:** none of its own — shares whichever addendum P3-b/P2 eventually needs (an ADR-0006 addendum if
frame-host resolution requires a Policy Kernel change beyond a lookup, per both sibling tracks' existing
text).

---

## Backlog (named, not written up)

- **OTel-compatible trace export for developer debugging** — Stagehand's `stagehand.metrics()` + OTel
  spans are a real, working observability surface; Tepegoz's answer is architecturally heavier (Notary,
  Phase 7, measurement-owed) and product-facing (`ext-agent`'s replay timeline) rather than
  developer-facing. A structured trace export would be a smaller, parallel addition once Phase 7 or S7
  next gets touched — not worth a workstream of its own today.
- **Provider-quality leaderboard for act/extract/observe-shaped micro-tasks** — Stagehand's
  `stagehand.dev/evals` is a published, Braintrust-backed model-selection leaderboard; Tepegöz's
  `agent-eval` is a ground-truth agent-capability harness, a different instrument for a different question.
  A small, low-stakes "which configured model is fastest/cheapest at classify-tier calls" leaderboard could
  ride `ModelRouter`'s existing tier data if it's ever wanted — speculative, not worth designing now.

---

## Routing — what this track does not own

Per the existing convention ([`../README.md`](../../phases/README.md#routing--what-stays-out) /
[`ai-agent/README.md`](../../phases/ai-agent/README.md#routing--what-stays-out)), reference these,
never duplicate them:

| Stays with                                                       | Material                                                                                                                                                                                                               |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`aipex-agent-parity.md` P1**                                   | The MCP **server** surface (transport, Bearer auth, rate-limit, PEP re-pass) — this track's row 9 adds only the "3-tool minimal facade" shape as a reference for its still-open "how bounded" question                 |
| **`webbrain-agent-parity.md` P1**                                | The `OpenAICompatibleProvider` + provider catalog — this track's row 8 adds only the BYO-callback-for-non-OpenAI-wire-formats note                                                                                     |
| **`webbrain-agent-parity.md` P3-b / `aipex-agent-parity.md` P2** | Frame + shadow-DOM perception reach, including the promotion case P3 above hands them                                                                                                                                  |
| **Phase 3**                                                      | The managed, key-free zero-setup cloud default — Stagehand's Model Gateway is a concrete reference, not a reason to reopen the design                                                                                  |
| **Phase 6**                                                      | Deterministic, model-free signed recipes + self-healing selectors — `code mode` and the model-free half of `selfHeal` map here; the model-**in-the-loop** half is P2, deliberately kept separate by the ownership test |
| **S3**                                                           | `drag`/`dragAndDrop` — already a named, spike-first, not-a-gate open item; nothing new to add                                                                                                                          |
| **S7**                                                           | Wall-clock/`$` targets and the adaptive-cadence/realism/quick-mode mechanisms — P2 is additive to this phase, not a redesign of it                                                                                     |
| **ADR-0018**                                                     | MCP **client** architecture — P1 is an addendum, not a new client design                                                                                                                                               |
| **ADR-0026 / 0029**                                              | The `execute_js`/code-execution/DevTools boundary — Ground rules #2 keeps it closed                                                                                                                                    |
| **S6 (credential broker)**                                       | Secret-handling design — Ground rules #1 keeps its OS-auth-gate shape, does not add a substitution shortcut                                                                                                            |

## ADRs owed (numbers assigned when a session actually opens one of these)

- **P1:** an addendum to **ADR-0018** (MCP client) — the page-declared-tool-source trust model (ceiling
  danger class, one-time origin-scoped grant, taint-wrapped results).
- **P2:** none — stays inside ADR-0013/ADR-0007 as they read today; a future cross-run-persistence
  follow-up (explicitly out of this DoD) would need its own new ADR.
- **P3:** none of its own — shares whichever ADR-0006 addendum `webbrain-agent-parity.md` P3-b /
  `aipex-agent-parity.md` P2 eventually need.

No number is reserved here; per this repo's own multi-profile-track lesson
([`multi-profile-isolation.md`](../tracks/multi-profile-isolation.md) — an ADR-number collision from writing a plan
too far ahead of when it's actually opened), the number gets assigned at the point a session actually
starts the work, not now.
