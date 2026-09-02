# Track — Notte agent-capability parity

**Status:** 📋 **Proposed — not scheduled (2026-09-01).** No branch, no ADR number reserved, no owner
sign-off. This is a captured gap list in the shape of
[`browser-settings-feature-gap.md`](../tracks/browser-settings-feature-gap.md),
[`webbrain-agent-parity.md`](webbrain-agent-parity.md), and
[`aipex-agent-parity.md`](aipex-agent-parity.md): every row names its nearest existing Tepegöz behaviour
and a suggested phase home, so a future session can promote a row into a real `phase-*.md` task or an
`ai-agent` PR without re-deriving the comparison.

**Source:** a same-session deep read of `docs/others/tepegoz-vs-notte.md` (the Turkish comparison this
track distills) cross-checked directly against `.junk/notte`'s source — `packages/notte-agent/src/
notte_agent/{agent.py, falco/{agent.py, prompt.py, system.md}, common/{validator.py, conversation.py},
workflow.py, agent_fallback.py}`, `packages/notte-browser/src/notte_browser/{captcha.py, vault.py,
tools/base.py}`, `packages/notte-core/src/notte_core/actions/actions.py`, `packages/notte-core/src/
notte_core/config.toml`, `packages/notte-llm/src/notte_llm/engine.py`, `packages/notte-integrations/src/
notte_integrations/sessions/*`, `docs/src/mcp-server.mdx` — against this repo's AI surface
(`phases/ai-agent/`, `packages/orchestrator|model-gateway|capability-plane|security-policy|
agent-runtime|browser-tools|web-tools|macro-engine|recipe-compiler|credential-vault|human-input|
mcp-client|persistence|shared-types`, `extensions/ext-agent`, `docs/adr/*`). Every claim below that
touches a live code path was re-verified against the actual file in this repo or in `.junk/notte`, not
taken from the comparison doc's prose alone.

## Why this track exists

Notte is an asymmetric comparison to begin with — an open-source Python **web-automation framework**
(`pip install notte`, `litellm`-backed, no native tool-calling) plus a **hosted commercial API**
(`api.notte.cc`), not a browser. The comparison it's built from found the asymmetry is honest in both
directions: **Notte is the more capable, more mature, benchmarked agent today; Tepegöz is designed to be
the safer, more accountable one and has not proven it yet.** Unlike WebBrain, most of Notte's edge does
**not** decompose into a clean "surface-area gap to close" — reading its source turned up three different
shapes:

1. **Breadth Tepegöz already has a proposal for.** Notte's `litellm`-driven 16+ provider reach and
   OpenRouter meta-router restate exactly the gap `webbrain-agent-parity.md`'s P1 already opened
   (generic OpenAI-compatible provider + catalog). Its shadow-DOM/iframe/vision-by-default perception
   restates `webbrain-agent-parity.md`'s P3-b and S2/S10's own unfinished DoD. Its hosted MCP server
   restates the same "opposite direction, already named" row `webbrain-agent-parity.md` and
   `aipex-agent-parity.md` P1 already recorded. These rows below **sharpen those existing homes with
   Notte-specific detail**, they do not reopen them.
2. **Capabilities that contradict a standing ADR decision.** `evaluate_js` (arbitrary agent-callable JS),
   cloud CAPTCHA-solving, bot-detection evasion (`patchright` + residential proxy + swappable external CDP
   sessions), a zero-approval credential vault, and a general mailbox/SMS-reading tool for automated 2FA
   are all real, shipped, and — read from Notte's own source — genuinely load-bearing for its "gets the
   job done" reputation. Every one of them is also something this repo's ADRs already, deliberately,
   reject. Naming them here (Ground rules, below) closes off six more re-proposals before they happen.
3. **A small residue that is genuinely good, genuinely missing, and genuinely Tepegöz-conformant.** After
   (1) and (2) are subtracted, three concrete capabilities are left: schema-constrained structured page
   extraction (Notte's `scrape` action), a deterministic-replay-to-agent escalation hand-off (Notte's
   `AgentFallback`/`WorkflowAgent` pattern), and an agent-initiated clarifying question distinct from a
   permission prompt (Notte's `HelpAction`, ironically a stub in Notte's own OSS build). These get full
   workstreams below.

**One correction to the record this track exists to make plainly.** The comparison doc's "Örtüşmeyen
alanlar" section lists Notte's `Trajectory` append-only log against Tepegöz's **Notary** — hash-chain +
Ed25519-signed checkpoints + portable Replay Receipts + an independent `tepegoz-verify` CLI — and the
architecture comparison there is accurate. What it doesn't say plainly enough: `@tepegoz/notary` is
written and unit-tested, but **`apps/desktop` does not import it anywhere** (verified by grep across
`apps/desktop/src` — the only hit is a docblock comment naming Notary as a future consumer, not an
import). It produces **no working receipt for a live run today.** Phase 7's own status row already says
this honestly ("NotaryService algorithmic core + standalone `tepegoz-verify` CLI landed... not wired into
a live run") — this track just makes sure that qualifier travels with the claim everywhere Notary gets
named, including in the Routing table below.

Notte is also, in real ways, a different product category — a developer library + hosted browser-session
service, not a browser a person opens. Its hosted API, external CDP session backends
(Browserbase/Steel/Anchor/Hyperbrowser), and "change an import, add a `cli.` prefix" local↔cloud ergonomics
are real strengths **for that category** and are out of scope here, the same way WebBrain's site-adapter
count was out of scope for Phase 2's official-API adapters. This track only follows the overlapping axis:
what does a _browser agent_ need, that Notte's source shows working, that Tepegöz-conformant means could
still exist inside the Policy Kernel / single ToolGateway PEP / per-package i18n discipline.

## How to read this

Each full workstream below (P1–P3) is written like an `ai-agent` phase section (Goal → Approach →
new/changed packages → ADR owed → DoD-shaped bullets) so it can be lifted into a real phase file with
minimal rewriting. **Nothing here is committed roadmap.** Rows in the capability inventory whose Home is
an existing phase or another track's workstream are **not** re-derived — they cite the existing home and
add only the delta detail Notte's source contributes that the cited home doesn't already have.

## Ground rules — parity, not imitation

Six Notte capabilities are **deliberately not being matched**, because matching them would violate a
standing decision this repo already made, or would relax a decision that ships inert but on purpose.
Naming them here once, so no future session re-proposes them by accident:

1. **No `evaluate_js` / arbitrary page-mutation tool.** Notte's `EvaluateJsAction`
   (`packages/notte-core/src/notte_core/actions/actions.py`) lets the model run arbitrary JavaScript
   against the live page and read back the result — no sandbox, no isolation, described in its own
   docstring as a way to extract data "without LLM processing." ADR-0026 already measured this class of
   idea for Tepegöz (isolated-world sandbox **refuted** by a live canary hit) and ADR-0029 already drew
   the DevTools-class boundary: this stays user-only, never an agent tool. `browser_analyze_page` (S5)
   is the closest thing Tepegöz has, and it inverts the risk shape on purpose — the model authors an
   extraction _script_ that runs inside a request-cancelling sandbox holding a _copy_ of the page, never
   the live DOM, and the tool is simply absent when the host can't provide that sandbox. Same rejection
   as `webbrain-agent-parity.md` item 2; restated here because Notte's version is shipped and used, not
   hypothetical.
2. **No cloud CAPTCHA-solving.** `CaptchaSolveAction` + the session's `solve_captchas` flag exist in
   Notte's action set, but its own `CaptchaHandler.is_available: ClassVar[bool] = False`
   (`packages/notte-browser/src/notte_browser/captcha.py`) — solving only exists behind Notte's hosted
   API, and the open-source path raises `CaptchaSolverNotAvailableError`. ADR-0039 already chose the
   opposite shape for Tepegöz: CAPTCHA is a **Human Handoff** event, not a solved obstacle. Same
   rejection as `webbrain-agent-parity.md` item 1.
3. **No bot-detection evasion.** Notte's default browser backend is `patchright` (an anti-detection
   Playwright patch), and its hosted tier adds residential proxies plus swap-in external CDP session
   backends (`packages/notte-integrations/src/notte_integrations/sessions/{browserbase,steel,anchor,
hyperbrowser}.py`). `@tepegoz/human-input`'s Catmull-Rom cursor curves exist for a different reason —
   naturalistic interaction and accessibility realism, not fingerprint evasion — and Tepegöz's stance on
   an obstacle a site puts up is Human Handoff, not evasion. Nothing here is a code gap to close; it's a
   philosophy this repo already chose not to share.
4. **No general mailbox/SMS-reading tool for automated 2FA.** Notte's `EmailReadAction`/
   `EmailVerificationReadAction`/`SmsReadAction` (backed by the hosted **Persona** digital-identity
   product) give the model a general-purpose inbox reader, used for account-creation and verification
   flows. Tepegöz's own eventual answer to "clear a pending 2FA prompt" is narrower by design: the
   Credential Broker (S6, ships inert on purpose — "the agent has no shape a secret could arrive in,"
   `phase-s6-safety-control-plane.md`) is meant to clear **one specific, already-pending 2FA code**
   through an OS-auth-gated path (per the original scoping note: "2FA is the one thing that does get
   automatically cleared, and only through the Credential Broker, never a page-embedded widget," ADR-0039).
   That is a materially smaller surface than "read the inbox." This row is a negative example worth
   keeping on record: when S6's credential-broker gate is eventually wired, it should stay a
   single-purpose code-clear, never grow into a Persona-style mailbox reader.
5. **No zero-approval vault fill.** Notte's `BaseVault`/`VaultSecretsScreenshotMask`
   (`packages/notte-browser/src/notte_browser/vault.py`) replace a placeholder with the real credential
   at execution time and mask it from screenshots and structured-completion input — but nothing gates
   _whether_ the fill happens; the moment the model targets a credentialed field, the value goes in.
   Tepegöz's Credential Broker is already stricter by design (no shape a secret could arrive in until an
   OS-auth gate exists) — that gate shipping inert is S6's own tracked gap, not something this track
   reopens or relaxes to match Notte's frictionless version.
6. **No anchoring to a published vendor self-report benchmark.** Notte publishes **open-operator-evals**,
   a real, public leaderboard against browser-use/Convergence (self-report 86.2%, LLM-eval 79.0%). The
   "Never" list in `ai-agent/README.md` already forbids "anchoring to vendor self-reports" —
   S11's `bridgeClaim` refuses to publish below 25 human labels for exactly this reason. Nothing to add;
   restated here so a future session doesn't read "Notte has a leaderboard, we should match the number"
   as an invitation to skip S11's own discipline.

None of these are "Notte did it wrong." Notte's target user is a developer who brought their own
Playwright session and accepted the trade-offs; Tepegöz's target user has a signed-in bank session in
the next tab. The point of naming these once is that a future reader of this track shouldn't reopen a
decision that was already made for a documented reason.

---

## Capability inventory

Legend for **Home**: an existing phase/ADR/track-workstream name means "already planned or proposed, this
row sharpens it with Notte-specific detail, no new phase needed." **NEW** means no existing home owns it
and this track proposes one. Rows resolved entirely in Ground rules (above) are marked **reject**.

| #   | Notte capability                                                                                                                                                                                                                                                  | Nearest Tepegöz behaviour today                                                                                                                                                                                                                                                 | Gap                                                                                                     | Home                                                                                                                             |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `litellm` → 16+ named providers + OpenRouter meta-router; local = any Ollama/llama.cpp endpoint via `litellm`                                                                                                                                                     | 8 hand-written adapters (`AI_PROVIDERS` in `shared-types/src/providers.ts`) + `local` (node-llama-cpp, in-process only); an internal `openai-compat.provider.ts` base exists but only backs 3 built-in adapters (DeepSeek/xAI/Groq), not a user-facing generic card             | Breadth + a user-facing generic OpenAI-compatible catalog entry + alternate local-server transports     | **`webbrain-agent-parity.md` P1 (sharpen)** — Notte's scale is added justification for the catalog design already proposed there |
| 2   | Default-on vision (`use_vision=true`) + CDP shadow-DOM piercing + cross-origin iframe evaluation + a `deep` LLM-tagging perception mode as fallback to `fast` DOM parsing + a `scrape`/`/scrape` endpoint                                                         | DOM/a11y-first (ADR-0008) + diff/dedupe/elision (S2); vision escalation-only and ships **inert** (S10 — never wired, not flag-gated: `captureVision` has no production caller; correction dated 2026-09-02 in `phase-s10-vision-escalation.md`); no shadow-DOM/iframe reach yet | More page types read live today; un-inerting S10 means doing the wiring, not flipping a flag            | **`webbrain-agent-parity.md` P3-b / S2 / S10 (sharpen)**                                                                         |
| 3   | `scrape` action: extraction against an optional caller-supplied JSON schema (Pydantic `response_format`), distinct from a full-page markdown dump — implemented by Notte's own scraping/pruning pipeline, not model-authored code                                 | `browser_get_article`/`browser_get_page`/`web_get_page` return prose/markdown; `browser_analyze_page` (S5) requires the **model** to author extraction JS that runs in a sandboxed page copy                                                                                    | No lower-friction "give me data matching this shape" tool that doesn't require the model to write code  | **P1 (NEW, small — extends S2's page-reading family)**                                                                           |
| 4   | `session.execute()` deterministic primitives + `AgentFallback` context manager: a scripted step that fails hands off to one bounded, single-step agent-reasoned rescue, then the script resumes                                                                   | `@tepegoz/macro-engine` (control-flow interpreter) and `@tepegoz/recipe-compiler` (signed replay + `evaluateAssertion` oracle) are both separate from the agent; a broken step aborts or surfaces to the user, with no audited single-step agent rescue                         | A structured, audited "deterministic run, agent rescues one step" escape hatch                          | **P2 (NEW — extends Phase 6: macro-engine + recipe-compiler)**                                                                   |
| 5   | `Workflow`/`WorkflowAgent` (`workflow.py`): record an agent trajectory once, replay each step deterministically, fall back to full agent reasoning when the trajectory is exhausted or the last replayed step failed; `workflow_variables` parametrize the replay | Recipe-compiler already does signed, model-free replay + self-healing selectors + a success oracle — **stricter** than Notte's unsigned JSON replay — but has no "fall back to one bounded agent-reasoned step when self-healing itself fails"                                  | The specific escalation behaviour, not the replay mechanism (Tepegoz is already ahead there)            | Phase 6 / recipe-compiler (sharpen — folds into P2's DoD below)                                                                  |
| 6   | `HelpAction`: a distinct "ask for clarification" action the model can emit mid-task (today a stub in Notte's OSS build — "Human in the loop is not implemented yet => fail immediately", `notte_agent/agent.py`)                                                  | Two-stage HITL (plan preview + tool-level approval) covers permission asks; nothing lets the model pause and put a free-text clarifying question to the user when the _task itself_, not a risky action, is ambiguous                                                           | An agent-initiated question distinct from a permission prompt                                           | **P3 (NEW, small — extends agent-runtime/orchestrator Reactor + S8 assistant-ux)**                                               |
| 7   | Hosted MCP **server** (`https://api.notte.cc/mcp/`, `docs/src/mcp-server.mdx`) — Claude Code/Cursor/Codex/Claude Desktop delegate a task to a signed-in cloud Notte browser session                                                                               | MCP **client** only (ADR-0018); the opposite direction is already named as unbuilt                                                                                                                                                                                              | The opposite direction, already routed                                                                  | **Phase 1b / `aipex-agent-parity.md` P1 (already proposed — cite, no new)**                                                      |
| 8   | Published self-report benchmark (**open-operator-evals**) vs browser-use/Convergence, with real if vendor-produced numbers                                                                                                                                        | S11's pre-registered H2H protocol + `bridgeClaim` (refuses to publish below 25 human labels); the "Never" list already forbids anchoring to self-reports                                                                                                                        | Nothing to add — a discipline choice already made, restated as a live counter-example                   | **S11 (already planned — cite; see Ground rules item 6)**                                                                        |
| 9   | `notifier.py`: a Discord/Slack/email webhook fired on run completion                                                                                                                                                                                              | Nothing                                                                                                                                                                                                                                                                         | Real, but niche — no daily-driver pull demonstrated for this product                                    | **Backlog**                                                                                                                      |
| 10  | `patchright` stealth + residential proxy + swap-in external CDP session backends (Browserbase/Steel/Anchor/Hyperbrowser)                                                                                                                                          | `@tepegoz/human-input` naturalistic cursor movement (different purpose); CAPTCHA/2FA → Human Handoff                                                                                                                                                                            | Deliberately not matched                                                                                | **Ground rules — reject (item 3)**                                                                                               |
| 11  | `email_read`/`sms_read`/`email_verification_read` (Persona mailbox tools) for automated verification-code retrieval                                                                                                                                               | Credential Broker (S6, ships inert) — no shape a secret could arrive in; ADR-0039 keeps 2FA a narrow, single-code auto-clear                                                                                                                                                    | Deliberately not matched as a general tool; sharpens the shape the eventual 2FA-clear feature must keep | **Ground rules — reject (item 4) / S6 credential broker (negative example)**                                                     |
| 12  | Vault fills a credential with **no approval gate** the moment the model targets a credentialed field                                                                                                                                                              | Credential Broker: no shape a secret could arrive in until an OS-auth gate exists (S6, inert by design)                                                                                                                                                                         | Tepegoz's design is already stricter; nothing to adopt                                                  | **Ground rules — reject (item 5)**                                                                                               |
| 13  | `EvaluateJsAction`: model-callable arbitrary JS on the live page                                                                                                                                                                                                  | `browser_analyze_page` (S5): model-authored extraction JS in a sandboxed **copy**, never the live page                                                                                                                                                                          | Deliberately not matched                                                                                | **Ground rules — reject (item 1)** — ADR-0026/0029                                                                               |
| 14  | `CaptchaSolveAction` + `solve_captchas` (cloud-only solver)                                                                                                                                                                                                       | Human Handoff (`detectHandoff`) — CAPTCHA stops the run and hands back to the user                                                                                                                                                                                              | Deliberately not matched                                                                                | **Ground rules — reject (item 2)** — ADR-0039                                                                                    |

---

## P1 — Schema-constrained structured page extraction (NEW, small, extends S2)

**Goal.** Give the agent a way to ask for data **shaped like a schema** — "the title, price, and SKU of
this product" as a typed object — without either (a) dumping the whole page as markdown and making the
model do the extraction in its own head, the only option today, or (b) requiring the model to author a
JavaScript extraction script for `browser_analyze_page` (S5), which is a materially higher-friction and
more error-prone path for a task that is fundamentally "read this shape off the page."

**Approach.**

- A new read-only tool, `browser_extract_data`, taking a caller-supplied JSON Schema (a subset — object/
  array/string/number/boolean, no arbitrary `$ref`/format keywords, mirroring the deliberately narrow
  schema support S4's `response_format` validation already uses elsewhere in this repo) and an optional
  natural-language `instructions` string, matching Notte's `ScrapeAction` shape
  (`instructions`, `only_main_content`, `selector`, `response_format`).
- **Extraction stays deterministic-first, not a second code-exec path.** Rather than routing through
  Notte's own LLM-in-the-loop scraping pipeline, reuse the existing DOM/a11y-first perception (S2) to
  produce the candidate text/structure, then let the model's _own_ completion call (already happening
  every step) parse that structure into the requested schema — this tool's job is framing and validating
  the request/response against the schema (zod `safeParse` on the way out, same as every other tool
  boundary), not adding a second inference call the way Notte's server-side scrape pipeline does.
- Untrusted-content wrapping is identical to `browser_get_article`/`browser_get_page` — extracted values
  are page-derived, taint-tracked, never treated as instructions.
- `dangerClass: 'read'`, registered through the one `CapabilityRegistry` like every other tool — no policy
  or HITL changes needed, this is a new leaf on the existing perception family.

**New/changed packages:** `@tepegoz/browser-tools` (new tool + schema-validation helper), no changes
below the tool layer.

**DoD shape (draft):**

- [ ] `browser_extract_data` returns a value that validates against the caller's schema or a structured
      "could not extract" result — never a silent partial match
- [ ] Reuses S2's existing DOM read path — no second live-page traversal, no new perception primitive
- [ ] Schema support is the same narrow subset already validated elsewhere in this repo (object/array/
      string/number/boolean; reject unsupported keywords rather than silently ignoring them)
- [ ] i18n: any user-visible "extracting structured data…" progress copy gets EN+TR parity

---

## P2 — Deterministic-run → agent escalation hand-off (NEW, extends Phase 6: macro-engine + recipe-compiler)

**Goal.** Match the practical value of Notte's `AgentFallback` context manager and `WorkflowAgent`'s
replay-with-healing pattern — a scripted or replayed run that hits a broken step doesn't have to abort or
silently degrade; it can hand that **one step** to a bounded, fully-audited agent-reasoned rescue and then
resume — **without** blurring Phase 6's own ownership test ("if the model could be removed from the
replay, it's Phase 6"). Notte's version blends the two freely inside one loop; Tepegöz's version keeps
them as two distinct, separately-attested events.

**Note on timing.** Phase 6 is itself **frozen (out of v1)** — this workstream is recorded now so the
design is ready when Phase 6 resumes, not proposed to start before it does. It is not gated the way an
`ai-agent` S-phase capability would be (Phase 6 isn't measurement-owed, it's scope-frozen); the
distinction matters because the two vocabularies mean different things.

**Approach.**

- **The signed/oracled portion of a recipe or macro run stays exactly as attested — no change.** When a
  step fails validation (a stale selector recipe self-healing can't resolve, a macro control-flow branch
  with no matching case), the run **stops** and surfaces a distinct, explicit choice to the user: "resume
  with agent assistance for this one step" — never a silent, in-band fallback the way `AgentFallback`
  free-flows.
- **Accepting that offer starts a normal, fully-gated single-step agent invocation** — same ToolGateway
  PEP, same PolicyKernel pass, same HITL, same audit trail as any other agent action — scoped to
  completing _only_ the failed step (bounded step budget, e.g. 1–3 actions), not a full re-plan of the
  remaining recipe/macro.
- **On success, the recipe/macro resumes from the next recorded step**, exactly like `WorkflowAgent`'s
  "replay if intact, else re-reason" pattern — but the boundary between "replayed" and "agent-rescued"
  segments is recorded in the run's journal/audit trail as two different provenance kinds, so a later
  Notary receipt (once wired) can distinguish "this was proven deterministic" from "this was a supervised
  rescue" rather than reporting the whole run under one undifferentiated claim.
- **Parametrized replay** (Notte's `workflow_variables`) — confirm recipe-compiler's existing IR already
  supports parametrized recipes; if not, that's a small addition to the same IR, not a new mechanism.

**New/changed packages:** `@tepegoz/macro-engine`, `@tepegoz/recipe-compiler` (the hand-off trigger + the
two-kind provenance marker), `@tepegoz/orchestrator` (the bounded single-step agent invocation path),
`extensions/ext-agent` (the "resume with agent assistance?" prompt).

**ADR:** an addendum to **ADR-0031** (recipe-compiler trust model) recording that a failed replay may
offer an explicit, HITL-gated hand-off to a bounded single-step agent run — the replay's signed/oracled
segment stays exactly as attested; the hand-off is a distinct, separately audited event, never a silent
blend of the two. This is worth writing down precisely because it sits right next to the "if the model
could be removed from the replay, it's Phase 6" ownership test and a future contributor could otherwise
be tempted to let the boundary blur.

**DoD shape (draft):**

- [ ] A recipe/macro run that hits an unresolvable step **stops** and asks, rather than silently
      escalating — a test proves the escalation is never automatic
- [ ] The agent-rescued segment goes through the exact same PEP/PolicyKernel/HITL/audit path as any other
      agent action — no bypass for "just this one step"
- [ ] The run's provenance record distinguishes replayed-and-attested steps from agent-rescued steps
- [ ] Parametrized replay (recipe-compiler IR variables) is confirmed or added
- [ ] i18n: the "resume with agent assistance?" prompt and its outcome messaging get EN+TR parity

---

## P3 — Agent-initiated clarifying question (NEW, small — extends agent-runtime/orchestrator + S8)

**Goal.** Give the model a way to say "the task is ambiguous, I need one more piece of information from
you" that is distinct from both a permission prompt (which asks the user to approve a _specific action_)
and a bare failure. Notte names this well even though its own OSS implementation is a stub
(`HelpAction` → "Human in the loop is not implemented yet => fail immediately") — the _shape_ of the idea
(a third response kind alongside "act" and "done") is worth having; Tepegöz should actually build it.

**Approach.**

- Add a new typed `Decision` outcome to the Reactor (ADR-0013) — `clarify` — alongside the existing
  continue/retry/replan/stop set. The model emits it with a short free-text question instead of an
  action; the Reactor pauses the run (not cancels it) and surfaces the question to the user through the
  existing `ext-agent` panel, the same visual slot a plan-preview or tool-approval prompt uses today.
- The user's free-text reply is appended to the run's task context as a new user turn and the run resumes
  — no new trust boundary, no new capability grant; it is a **conversation** turn, not a tool call, so it
  does not go through the ToolGateway PEP at all (it grants nothing).
- Fail-safe default matches the rest of the two-stage HITL system: if the run is unattended (a scheduled
  `@tepegoz/tasks` run with no user present), `clarify` is treated as a **stop**, never a silent
  assumption — asking a question nobody can answer is not the same failure mode as Notte's "fail
  immediately," but the effect (the run does not proceed on a guess) is the same, which is the correct
  fail-safe shape.

**New/changed packages:** `@tepegoz/orchestrator` (Reactor `Decision` union), `@tepegoz/agent-runtime`
(the pause/resume plumbing — already has two-stage HITL pause/resume to extend), `extensions/ext-agent`
(the clarifying-question prompt UI, reusing the plan-preview/approval slot).

**DoD shape (draft):**

- [ ] A `clarify` decision pauses the run (not cancels it) and the reply resumes it as a new user turn
- [ ] An unattended/scheduled run treats `clarify` as a stop, never an unattended guess — a test proves it
- [ ] The clarifying-question turn never reaches the ToolGateway PEP — it grants no capability
- [ ] Explicitly **gated behind S8 reaching ✅ first** (the UI surfacing half of this lives in S8's own
      assistant-ux scope, which is still measurement-owed; not opened as new capability-plane surface
      while S8 sits 🟠, per the anti-debt rule)
- [ ] i18n: the clarifying-question prompt and reply affordance get EN+TR parity

---

## Backlog (named, not written up)

- **Run-completion notifiers** (Discord/Slack/email webhook, Notte's `notifier.py`) — real, but niche; no
  daily-driver pull demonstrated for a browser a user is already looking at (unlike Notte's headless/CI
  use case, where a webhook is the only way to know a run finished). Fold into whichever session next
  touches `@tepegoz/tasks`'s run-completion surface rather than opening a workstream for it alone.
- **OpenRouter-style meta-router as a first-class provider entry** (vs. just another catalog data row) —
  folds into `webbrain-agent-parity.md` P1's catalog design; not a separate mechanism, not written up here.

---

## Routing — what this track does not own

Per the existing convention ([`../README.md`](../../phases/README.md#deferred--adoption-gated-backlog-from-the-beyond-phases-synthesis)
/ [`ai-agent/README.md`](../../phases/ai-agent/README.md#routing--what-stays-out)), reference these,
never duplicate them:

| Stays with                                 | Material                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `webbrain-agent-parity.md` P1              | Provider-catalog breadth + local HTTP-server transports — Notte's `litellm`/OpenRouter scale is added justification, not a new design                                                                                                                                                                                                                                 |
| `webbrain-agent-parity.md` P3-b / S2 / S10 | Shadow-DOM + iframe perception reach + vision escalation — Notte's default-on vision and `deep`-tagging mode sharpen the existing DoD, do not reopen the escalation-only decision                                                                                                                                                                                     |
| **Phase 1b** / `aipex-agent-parity.md` P1  | MCP **server** surface — Notte's hosted MCP is the same "external agent delegates to Tepegöz" direction already named there                                                                                                                                                                                                                                           |
| **S11**                                    | H2H benchmark discipline — Notte's published leaderboard is a live counter-example for the "Never" list's self-report-anchoring rule, not a model to match                                                                                                                                                                                                            |
| **Phase 7**                                | NotaryService / Replay Receipts — the algorithmic core is written and unit-tested but **not imported by `apps/desktop`**, so it produces no receipt for a live run today; Notte's `Trajectory`+tracer is a working-but-unsigned analog, already weaker even before Notary is wired — no reconciliation owed, Phase 7's own DoD already tracks the wiring gap honestly |
| **ADR-0026 / ADR-0029**                    | `execute_js`/DevTools boundary — Notte's `evaluate_js` does not reopen it                                                                                                                                                                                                                                                                                             |
| **ADR-0039**                               | CAPTCHA/2FA Human Handoff shape — Notte's cloud solver + Persona mailbox tools do not reopen it                                                                                                                                                                                                                                                                       |
| **S6** (credential broker)                 | The OS-auth gate before any fill — Notte's zero-approval vault does not relax it                                                                                                                                                                                                                                                                                      |

## ADRs owed (numbers assigned when a session actually opens one of these)

- P1 (structured extraction): no new ADR — a new read-only tool registered through the existing
  `CapabilityRegistry`, same as `browser_get_article` needed none.
- P2 (deterministic-run → agent escalation): addendum to **ADR-0031** (recipe-compiler trust model) —
  records the two-kind provenance boundary between a replayed/attested step and an agent-rescued one.
- P3 (clarifying question): no new ADR — an addition to the Reactor's typed `Decision` set already
  governed by **ADR-0013**; grants no new capability, so it does not touch the Policy Kernel's boundary.

No number is reserved here; per this repo's own multi-profile-track lesson
(`multi-profile-isolation.md` — an ADR-number collision from writing a plan too far ahead of when it's
actually opened), the number gets assigned at the point a session actually starts the work, not now.
