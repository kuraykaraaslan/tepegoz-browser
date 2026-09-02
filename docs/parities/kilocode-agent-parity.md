# Track — Kilo Code agent-capability parity

**Status:** 📋 **Proposed — not scheduled (2026-09-01).** No branch, no ADR number reserved, no owner
sign-off. This is a captured gap list in the shape of
[`browser-settings-feature-gap.md`](../tracks/browser-settings-feature-gap.md),
[`webbrain-agent-parity.md`](webbrain-agent-parity.md) and [`aipex-agent-parity.md`](aipex-agent-parity.md):
every row names its nearest existing Tepegöz behaviour and a suggested phase home, so a future session
can promote a row into a real `phase-*.md` task or an `ai-agent` PR without re-deriving the
comparison.

**Source:** a same-session deep read of
[`docs/others/tepegoz-vs-kilocode.md`](../versus/tepegoz-vs-kilocode.md) (Turkish, 2026-09-01)
against `.junk/kilocode` (`v7.5.6` — Kilo Code, a shipping, MIT-licensed AI **coding** agent: VS Code +
JetBrains extensions + `@kilocode/cli`, all clients of one core that is a fork of upstream **OpenCode**)
and this repo's AI surface (`phases/ai-agent/`, `packages/orchestrator|model-gateway|
capability-plane|security-policy|agent-runtime|browser-tools|web-tools|tool-executor|local-inference|
model-catalog|mcp-client|recipe-compiler|macro-engine|notary|credential-vault|human-input`,
`extensions/ext-agent`). Key claims were re-verified against source, restricted to the axes this track
carries forward (see **Scope** below):
`packages/opencode/src/permission/{evaluate,index}.ts` (the wildcard rule engine, `AskOutcome`
provenance, `allowEverything`/YOLO, `skillShell`/`sandboxEscalation` forced-human-reply,
config-path protection), `packages/opencode/src/agent/agent.ts` (the `Info` schema shared by native and
custom agents, the built-in `build`/`plan`/`general`/`explore`/`scout`/`compaction`/`title`/`summary`
roster, `cfg.agent` custom-agent merge, `Agent.generate`), `packages/opencode/src/kilocode/
modes-migrator.ts` + `rules-migrator.ts` (legacy `.kilocodemodes`/`AGENTS.md` → the current agent-config
shape), `packages/opencode/src/session/instruction.ts` (`AGENTS.md` global + project-tree loading),
`packages/opencode/src/session/compaction.ts` (the compaction budget constants), `packages/opencode/src/
session/prompt/*.txt` (the eight named per-model prompt variants), `packages/opencode/src/snapshot/
index.ts` (the shadow-git checkpoint store), and `packages/kilo-vscode/src/services/marketplace/
{types,api,relevance,installer}.ts` (the MCP/agent/skill marketplace: `api.kilo.ai/api/marketplace`,
workspace-relevance detection, install/remove flow).

## Scope — this is a different product category

Kilo Code is a **coding agent** (natural-language code edit/diff/patch, terminal, inline autocomplete,
codebase semantic search, IDE integration, a cloud layer). Tepegöz is a **browser agent + security-first
native browser**. `docs/others/tepegoz-vs-kilocode.md` names this asymmetry up front and still finds
seven axes where the two genuinely overlap. Per that document's own category warning, **this track
carries forward only those seven overlapping axes** and explicitly does not attempt parity on anything
that only makes sense for an editor-embedded agent:

**In scope (carried forward, one workstream group per axis):** multi-model/provider breadth · MCP
marketplace · the built-in mode system · the tool/permission model · context management · checkpoint ·
custom modes and standing rules.

**Explicitly out of scope — not a gap, a different product:** code editing/diff/`apply_patch`, terminal
(`bash`/`interactive_terminal`/`background_process`) + `kilo-sandbox` OS-level isolation, inline
autocomplete/FIM, codebase semantic indexing (`kilo-indexing`) + `semantic_search`, LSP integration, the
VS Code/JetBrains extensions and Agent Manager's worktree-isolated multi-session panel, the cloud layer
(KiloClaw, Cloud Agent, the PR code-review bot), `kilo-memory`'s capture→recall (a real Kilo capability,
but not one of the seven axes named for this track — S9's own advisory-memory line already owns
Tepegöz's side of that question), `kilo run --auto` promptless CI mode (tied to the terminal/CI surface
this track excludes), and office-file/image-generation tools. None of these are rejected on an ADR
ground — they are simply not this track's business, the same way `webbrain-agent-parity.md` left web
automation off AIPex's plate in reverse.

## Why this track exists

`docs/others/tepegoz-vs-kilocode.md` lands on the same shape of asymmetry the WebBrain and AIPex tracks
found: **on every overlapping axis Kilo Code is further along today** — more providers, a real MCP
marketplace, a mature mode/custom-agent system, a battle-tested compaction pipeline, a working shadow-git
checkpoint — **because it is a shipped, widely-used product and Tepegöz's agent is pre-1.0**, not because
Tepegöz's architecture is wrong. None of the seven axes require abandoning Tepegöz's DNA (the
model-_before_ deterministic Policy Kernel, one `ToolGateway` PEP, taint/provenance, per-package i18n
parity). This track's job, restricted to those seven axes, is to say for each Kilo capability the
comparison found: _does Tepegöz already have a seam for this, and if not, what would the
Tepegöz-conformant version look like_ — never "port the Effect/TypeScript," always "re-derive the
capability inside the existing kernel/PEP/i18n/coverage discipline."

One thing worth stating plainly because it surprised the source read: Kilo's own permission engine
already keeps `deny` undefeatable by its YOLO/`allowEverything` toggle (`resolve()` in
`permission/evaluate.ts` returns the base ruleset's `deny` before ever consulting the YOLO override), and
its own `Agent.generate` never lets the model author a permission ruleset — only a descriptive prompt
gets generated, the ruleset still comes from the deterministic default+config merge. Both of those are
independent confirmations that Tepegöz's own hard lines (autonomy can skip an _ask_, never a _deny_;
the model is never the one assigning a danger class) are not idiosyncratic — a mature, widely-used
sibling project converged on the same shape from a different starting point.

## How to read this

Each workstream below is written like an `ai-agent` phase section (Goal → Approach → new/changed
packages → ADR → DoD-shaped bullets) so it can be lifted into a real phase file with minimal rewriting.
**Nothing here is committed roadmap.** Where a capability already has a named home — in an existing
phase, an ADR, or a sibling track — this track says so explicitly and does **not** re-describe it; it
only adds the detail the Kilo Code reading surfaced that the existing text doesn't have yet. Two of the
seven axes ("mod sistemi" / built-in modes, and "custom modes/kurallar" / user-authored extensibility)
are handled by two separate workstreams (P3, P4) rather than one, because Kilo's own architecture treats
them as two different mechanisms internally — `agent/agent.ts` builds native and custom agents through
the _same_ `Info` schema and merge path (P3's territory), while `AGENTS.md`/`.kilo/rules` is a wholly
separate, always-injected instruction channel that exists independent of which mode is active (P4's
territory).

## Ground rules — parity, not imitation

Five Kilo Code design choices, all found on the seven in-scope axes, are **deliberately not being
matched**, because matching them would violate a standing decision this repo already made after
deliberation:

1. **No `code-mode`/`execute` confined-script MCP interpreter.** Kilo's `@opencode-ai/codemode` package
   lets the model write a program that calls connected MCP tools programmatically instead of issuing one
   tool call at a time (an experimental flag). Whatever efficiency win this buys, it is a code-execution
   surface, and ADR-0026 already measured the isolated-world sandbox path for exactly this kind of
   capability and **refuted** it; ADR-0029 draws the same line for DevTools-class access. The MCP
   _marketplace_ (workstream P2) is being matched; the confined script runtime that could ride alongside
   it in Kilo is not.
2. **No global or session-scoped "allow everything" toggle.** Kilo's `allowEverything`/YOLO is safer than
   it sounds (see "Why this track exists" above) — but this track does not propose adding an explicit
   blanket-approve lever to Tepegöz's autonomy taxonomy even in that safer shape. ADR-0006's line stays
   exactly where it is: `ask`/`act`/`auto`(+reserved `dangerous`) tune how much gets asked, never whether
   a `deny` fires, and there is no user-facing switch that skips every future ask for a session. Kilo's
   own deny-survives-YOLO design is cited above as _confirmation_ of Tepegöz's existing rule, not as a
   reason to add a new lever.
3. **No third-party marketplace text is trusted at the same tier as contributor-authored text — yet.**
   Kilo's Marketplace installs community-authored MCP servers, custom agents (whose `prompt` field
   becomes part of the system prompt), and skills, from `api.kilo.ai/api/marketplace`, with no visible
   supply-chain verification step beyond the fetch itself. This repo already has a home for that
   question — Phase 12's `SupplyChainGate` (ADR-0037) — and it is not built yet. P2/P3/P4 below are
   explicitly gated: **curated, first-party-authored catalog entries only**, until `SupplyChainGate`
   reaches a state where a third-party entry's trust can be verified before its text is ever concatenated
   into a system prompt.
4. **No model-authored permission ruleset or danger class, ever.** Kilo's own `Agent.generate` already
   respects this (see above) — restating it here is not correcting Kilo, it is nailing the same rule down
   for this track's own P3: a model may be asked to _draft_ a named profile's descriptive prompt text
   from a user's natural-language request, exactly as `Agent.generate` does, but the tool-surface/
   danger-class a profile carries is always chosen from a fixed, Kernel-recognized preset set — never
   generated, never inferred from the model's own output.
5. **No standing rule text is ever derived from page content or generated by the model at request time.**
   `AGENTS.md` in Kilo is user/contributor-authored, hierarchical, loaded from disk. P4 below inherits
   the exact framing `webbrain-agent-parity.md`'s P4 (site-guidance adapters) already established for
   this repo: trusted instruction text is a narrow, deliberate exception to "page content is data, not
   instructions," and it stays that way only by never being writable from anywhere the model or a page
   could reach.

---

## Capability inventory

Legend for **Home**: an existing phase/ADR/track name means "already planned or already covered, this
row sharpens it, no new phase needed." **NEW** means no existing phase owns it and this track proposes
one — restricted, per the Scope section, to the seven in-scope axes only.

| #   | Kilo Code capability                                                                                                                                                                                                                                               | Nearest Tepegöz behaviour today                                                                                                                                                         | Gap                                                                                                                                                                            | Home                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | ~24 AI-SDK provider packages + `models.dev` catalog + Kilo Gateway (zero-markup, keyless default)                                                                                                                                                                  | 8 hand-written adapters (`AIProvider` union) + `CanonRequest`/`CanonResponse` + `ModelRouter`                                                                                           | Breadth gap; the zero-setup/zero-markup gateway half is a cloud-layer concern                                                                                                  | `webbrain-agent-parity.md` **P1** (already the named home — sharpen, don't duplicate) for breadth; **Phase 3** (already planned) for the managed/zero-markup half |
| 2   | Per-model system-prompt variants — 8 named prompt families (`codex`/`gemini`/`beast`/`anthropic`/`trinity`/`ling`/`gpt55`/`kimi`) selected by the model's configured `prompt` field                                                                                | One orchestrator system-prompt assembly path, not keyed to the selected model                                                                                                           | No model-tuned prompt variants                                                                                                                                                 | **P1 (this track's addendum to `webbrain-agent-parity.md` P1)**                                                                                                   |
| 3   | MCP Marketplace (`kilo-vscode/services/marketplace`): discovery + install/remove for MCP servers, custom agents, and skills from `api.kilo.ai/api/marketplace`, with workspace-relevance suggestion (matched open files, installed VS Code extensions)             | MCP **client** only (ADR-0018); Settings has a unified Adaptors inventory listing _connected_ MCP/native/future adaptors, but no discovery/install catalog                              | No capability-discovery surface at all                                                                                                                                         | **P2 (NEW, extends ADR-0018 `mcp-client` + the existing Adaptors inventory UI)**                                                                                  |
| 4   | Built-in mode taxonomy (`build`/`plan`/`general`/`explore`/`scout`/hidden system agents), each just an entry in one `agents: Record<string, Info>` carrying a permission ruleset + a prompt                                                                        | Planner→Executor→Reactor internal phases + `ext-agent`'s Chat/Do/Make/Tasks palette + two-stage HITL plan-preview                                                                       | Chat ≈ Ask-mode's read-only value, plan-preview ≈ Plan-mode's "review before it runs" value — **already covered**; no named, Debug/Orchestrator-flavored presets exist         | **P3 (NEW — extends `ext-agent` + `capability-plane`'s existing `getToolsForMode` filter)**                                                                       |
| 5   | Custom agents (`cfg.agent`), `Agent.generate` (LLM drafts identifier/whenToUse/systemPrompt only — never the permission ruleset), legacy `.kilocodemodes` migration                                                                                                | No user/contributor-authored named profile mechanism                                                                                                                                    | Genuine gap                                                                                                                                                                    | **P3 (same workstream as row 4)**                                                                                                                                 |
| 6   | `AGENTS.md` (global + upward through the project tree) + `.kilo/rules`, one aggregate, always-injected context source, kill-switchable                                                                                                                             | S9 skills are prompt templates activated by `load_skill` during an approved run — not an always-injected background instruction channel                                                 | No "standing instructions" concept for a browsing profile at all                                                                                                               | **P4 (NEW — extends `@tepegoz/orchestrator`'s system-prompt assembly)**                                                                                           |
| 7   | Wildcard `allow`/`ask`/`deny` rule DSL (`Wildcard.match`), provenance-tagged rules, persisted `always` rules, `deny` always wins over any override                                                                                                                 | Coarse `ask`/`act`/`auto`(+`dangerous`) autonomy + deterministic `PolicyKernel` (danger class + taint + site) + S9 per-task remembered grants scoped to `(run, host)`                   | Tepegöz's model is narrower-scoped and was already judged the stronger design in `webbrain-agent-parity.md` P6                                                                 | **Already covered — cite ADR-0006 + S9, no gap**                                                                                                                  |
| 8   | `doom_loop` — exact-repeat tool-call (same tool, byte-identical JSON args) forces an `ask`                                                                                                                                                                         | Reactor no-progress replan + escape trigger (S0/C1, already landed) — a broader detector, not limited to byte-identical repeats                                                         | Tepegöz's mechanism already subsumes Kilo's narrower one                                                                                                                       | **Already covered — cite S3/Reactor** (the one narrower gap already logged is coordinate-click bucketing, `webbrain-agent-parity.md` P9-b)                        |
| 9   | `skillShell`/`sandboxEscalation` metadata forces an interactive human reply that no `allow`/YOLO rule can satisfy                                                                                                                                                  | `financial`/`destructive` danger classes force HITL regardless of autonomy; sensitive-site categorical hard `deny`; biometric gate for high-risk classes                                | Conceptually the same design, already built                                                                                                                                    | **Already covered — cite ADR-0006/S6/S8**                                                                                                                         |
| 10  | `AskOutcome.manual`/winning-`rule` returned from `Permission.ask` so a client can explain _why_ a call was auto-approved                                                                                                                                           | `PolicyKernel` already computes a machine-readable reason code (per ADR-0006) but whether it reaches the `ext-agent` approval/audit UI is unconfirmed                                   | Small UX gap: surface the reason, don't compute a new one                                                                                                                      | **P5 (small — sharpens S6/S8's existing UI)**                                                                                                                     |
| 11  | Compaction budget constants: `PRUNE_MINIMUM`/`PRUNE_PROTECT`, `TOOL_OUTPUT_MAX_CHARS=2000`, `DEFAULT_TAIL_TURNS=2`, preserve-recent budget = 25% of the usable window bounded to `[2000, 8000]` tokens, managed tool-output-to-file overflow for oversized results | `cache-window.ts` (lag-2 breakpoints) + Reactor working-state collapse; no visible mid-run "compacted" step                                                                             | Already named: `webbrain-agent-parity.md` **P9-a**                                                                                                                             | **P6 (this track's addendum to `webbrain-agent-parity.md` P9-a, with concrete reference numbers)**                                                                |
| 12  | Shadow-git checkpoint (`snapshot/index.ts`): `track`/`patch`/`restore`/`revert`/`diffFull`/`diffFile` against a separate `--git-dir`, 7-day retention, 256 KB diff cap, cross-process `flock`, resumable seed/materialize for large repos                          | Run-lifecycle checkpoints (`orchestrator`'s `recovery.ts`); "durable resume across app restarts" is still an open Phase 1b line; Notary (Phase 7) gives replay/accountability, not undo | The core capability (local file-edit undo) has no browser-agent analog — there are no local file mutations to snapshot; only the resume-safety _engineering pattern_ transfers | **P7 (narrow — sharpens Phase 1b's already-open durable-resume line; explicitly not a checkpoint/undo feature proposal)**                                         |

---

## P1 — Provider reach: per-model system-prompt variants (addendum to `webbrain-agent-parity.md` P1)

**Goal.** `webbrain-agent-parity.md` P1 already proposes the generic `OpenAICompatibleProvider` + a
data-driven provider catalog that turns "8 providers" into "8 classes, N catalog entries." Kilo's source
surfaces one concrete detail that proposal doesn't yet have: **the system prompt itself is not
one-size-fits-all across models.** `session/prompt/*.txt` ships eight named variants (`codex.txt`,
`gemini.txt`, `beast.txt`, `anthropic.txt`, `trinity.txt`, `ling.txt`, `kilocode-gpt-5.5.txt`,
`kimi.txt`, plus a `default.txt` fallback and `plan.txt`/`plan-mode.txt`/`plan-reminder-anthropic.txt`
overlays for Plan mode), selected off the model's configured `prompt` field — the same model behaves
measurably differently depending on how its own vendor's models respond to prompt structure (tool-call
verbosity, thinking-tag conventions, todo-list nudging), and Kilo tunes the base prompt per family rather
than writing one prompt every model has to tolerate.

**Approach.**

- Add a `promptVariant` field to the catalog entries `webbrain-agent-parity.md` P1 already proposes for
  `@tepegoz/model-gateway`, defaulting to a shared base prompt.
- Author variant overlays only where a real, measured behavioral difference justifies one — start from
  zero, not from Kilo's eight; a variant is added when a specific provider's tool-call or reasoning
  quirk is _observed_ in `agent-eval`, not speculatively.
- The orchestrator's existing system-prompt assembly path (`reactor-prompt.ts`/`messages.ts`) selects the
  overlay the same way it already selects the S9 profile/memory block and (once P4 lands) the standing
  rules block — no new prompt channel, one more optional section in the same assembly.
- Plan-mode-style overlay stacking (Kilo layers a Plan-specific reminder _on top of_ the per-model base)
  is a detail worth keeping in mind for P3's named profiles below, not solved twice.

**New/changed packages:** `@tepegoz/model-gateway` (catalog schema gains `promptVariant`),
`@tepegoz/orchestrator` (assembly picks the overlay).

**ADR:** none beyond `webbrain-agent-parity.md` P1's own owed addendum to ADR-0005 — this is detail
added to that same addendum, not a second one.

**DoD shape (draft):**

- [ ] A catalog entry with no `promptVariant` behaves byte-identically to today (no behavior change by
      default)
- [ ] At least one variant is backed by an `agent-eval` measurement showing the overlay improves a
      concrete metric for that provider family, not just a hunch ported from Kilo's list
- [ ] i18n: N/A — prompt variants are model-facing text, not user-facing UI copy (same treatment as
      `webbrain-agent-parity.md` P4's adapter notes)

---

## P2 — MCP capability marketplace (NEW, extends ADR-0018)

**Goal.** Tepegöz's `mcp-client` (ADR-0018) already lets a user _manually configure_ an MCP server, and
Settings' unified Adaptors inventory already lists what's connected. What's missing is _discovery_ —
Kilo's Marketplace is the concrete reference: a fetched catalog (`api.kilo.ai/api/marketplace`, JSON or
YAML, 5-minute cache, retry-with-backoff, 10s timeout) of installable MCP servers, custom agents, and
skills, each carrying `id`/`name`/`description`/`category`/`author`/`prerequisites`, installable to a
`global` or `project` scope, with workspace-relevance suggestion (does an open file match a
`suggest_for.filename` glob; is a named VS Code extension installed).

**Approach.**

- A read-only **catalog fetch**, same "adding an entry is a data change" philosophy this repo already
  uses for `@tepegoz/model-catalog` (GGUF weights) and `@tepegoz/extension-catalog`: one JSON schema
  (`id`/`name`/`description`/`category`/`type: 'mcp' | 'profile' | 'rule'` — matching this track's own
  P2/P3/P4 split rather than Kilo's `mcp`/`agent`/`skill` triad), fetched with the same retry/timeout/
  cache discipline Kilo's `api.ts` demonstrates, verified (sha256 per entry, same discipline as GGUF
  weights) before install.
- **Curated, first-party only for v1** (Ground rule 3) — the catalog is populated by this repo's own
  contributors until `SupplyChainGate` (Phase 12, ADR-0037) can verify a third-party submission's
  provenance before its config or prompt text is trusted.
- Installing an MCP-server entry from the catalog is exactly the ADR-0018 flow already in place (the
  catalog only prefills the connection form); the installed server's tools still go through
  `McpSupervisor`/`dangerClassFor`/the one `ToolGateway` PEP like every other MCP tool — the marketplace
  changes _discovery_, never _trust_.
- **Relevance suggestion, adapted, not copied.** Kilo's "does an open file match this glob" has no
  browser-agent analog (there is no open-file set) — the honest adaptation is "does the current tab's
  origin/host match a site-adapter or a domain this catalog entry declares relevance for," reusing
  `webbrain-agent-parity.md` P4's `SiteAdapter.urlPattern` shape rather than inventing a second
  relevance mechanism.
- Settings surfaces the catalog as a new tab on the existing Adaptors inventory page, not a separate
  screen.

**New/changed packages:** a new small `@tepegoz/capability-catalog` (or an extension of
`@tepegoz/mcp-client`, if the shape stays this close) for the fetch/cache/verify layer; Settings UI work
in `apps/desktop`'s existing Adaptors surface.

**ADR:** one new ADR — "capability catalog: discovery is separate from trust; every installed entry still
enters through the existing PEP; third-party entries wait on `SupplyChainGate`." No number reserved.

**DoD shape (draft):**

- [ ] A catalog entry installs an MCP server through the existing ADR-0018 flow with no new trust bypass
- [ ] Every catalog entry is sha256-verified before its config is ever used, matching `model-catalog`'s
      discipline
- [ ] The catalog ships empty of third-party entries until `SupplyChainGate` lands — explicitly gated,
      per the anti-debt rule, behind Phase 12 reaching a state where third-party provenance is checkable
- [ ] i18n: catalog chrome (search, category labels, install/remove buttons) gets EN+TR parity;
      contributor-authored entry descriptions are data, not UI strings (same treatment as
      `webbrain-agent-parity.md` P4's adapter notes)

---

## P3 — Named agent profiles (NEW, extends `ext-agent` + `capability-plane`)

**Goal.** Kilo's `build`/`plan`/`general`/`explore`/`scout` roster and any user's custom `cfg.agent` entry
are built through the exact same mechanism — one `Info` schema (`permission` ruleset + `prompt` +
`options`), merged the same way, distinguished only by a `native: boolean` flag. Tepegöz's `ext-agent`
already has a rough mode-shaped palette (Chat/Do/Make/Tasks) and `capability-plane` already filters tools
by mode (`getToolsForMode`, cited in `webbrain-agent-parity.md` P8) — but there is no user-facing way to
define a _named, reusable_ profile ("a cautious research profile that never fills forms," "a
fast-and-loose profile for my own throwaway test accounts") the way Kilo's Debug/Orchestrator-flavored
custom agents work.

**Approach.**

- A `AgentProfile` record: `{name, promptTone, toolTierPreset}`, where `toolTierPreset` is chosen from a
  **fixed, Kernel-recognized enum** (not a free-form ruleset — Ground rule 4) that maps to an existing
  tool-surface filter, reusing `webbrain-agent-parity.md` P8's tiering dimension
  (`compact`/`mid`/`full`) as the starting preset set rather than inventing a second tiering axis.
- **The Policy Kernel decides independently of the profile, always.** A profile can narrow which tools
  are _offered_ to the model (same mechanism as mode-based filtering today); it can never widen what the
  Kernel allows, and it carries no ability to touch `deny` classes, sensitive-site hard-deny, or the
  biometric gate — the same "adapter informs, kernel still decides" ordering
  `webbrain-agent-parity.md` P4 already established for site adapters, applied here to profiles instead
  of per-site notes.
- Optionally, the model may be asked to _draft_ a profile's name/prompt-tone text from a user's
  natural-language description, mirroring `Agent.generate` — but, per Ground rule 4, only the descriptive
  text is model-authored; `toolTierPreset` is always a value the user (or a curated catalog entry, gated
  per P2) explicitly picks from the fixed enum, never generated.
- Built-in presets (a Debug-flavored profile, a research-only profile) ship as first-party entries in the
  same mechanism user-defined profiles use — matching Kilo's own "native vs custom is just a flag" design
  — rather than a parallel hardcoded system.
- Marketplace-sourced profiles (P2) are subject to Ground rule 3: curated-only until `SupplyChainGate`
  lands, since a profile's prompt tone is exactly the kind of text that must not be blindly trusted from
  a third party.

**New/changed packages:** `extensions/ext-agent` (profile picker UI, optionally alongside the existing
Chat/Do/Make/Tasks palette rather than replacing it), `@tepegoz/capability-plane` (profile as a filter
dimension, same shape `getToolsForMode` already provides), `@tepegoz/persistence` (profile storage).

**ADR:** one new ADR — "named agent profiles are tool-surface presets and prompt-tone hints, never
permission-grant authorities; the Policy Kernel's `deny` and sensitive-site gates are unreachable by any
profile." No number reserved.

**DoD shape (draft):**

- [ ] A test proves a profile cannot widen what the Kernel allows — an action denied by `PolicyKernel`
      stays denied under every profile, including a model-drafted one
- [ ] `toolTierPreset` values come only from the fixed enum; a test proves a model-drafted profile cannot
      set an arbitrary tool list
- [ ] At least one built-in preset ships through the same mechanism as a user-defined profile (no
      parallel hardcoded path)
- [ ] i18n: profile names/descriptions the UI itself generates (not model-drafted prompt text) get EN+TR
      parity

---

## P4 — Standing agent rules, an `AGENTS.md` equivalent (NEW, extends `@tepegoz/orchestrator`)

**Goal.** Kilo's `AGENTS.md` (global config dir + walked upward through the project tree, one aggregate
context source, optionally joined by `.claude/CLAUDE.md`) is loaded and injected into **every** run
regardless of which mode is active — a channel P3's per-run profile selection doesn't cover. Tepegöz has
nothing like it: S9 skills only activate when the model calls `load_skill`, and `webbrain-agent-parity.md`
P4's site adapters only fire when a URL matches. There is no "always-on standing instruction" concept at
all — e.g. a user who always wants "never submit a form with a card number without an explicit
confirmation restated" or "prefer Turkish search results" currently has no durable place to say so once.

**Approach.**

- A small, global (and optionally per-profile, once P3 lands) `agent-rules.md`-equivalent: plain text,
  **user-authored only** — never model-generated, never derived from page content (Ground rule 5, the
  exact framing `webbrain-agent-parity.md` P4 already committed to for site adapters, extended here to a
  second trusted-text surface).
- Injected into the **existing** system-prompt assembly path in `@tepegoz/orchestrator`
  (`reactor-prompt.ts`/`messages.ts`), at the same trust tier as the S9 profile/memory block and the
  site-adapter block — one more optional section, not a new channel.
- **Rules inform, they do not grant.** Exactly like `webbrain-agent-parity.md` P4's finance-adapter
  precedent: a rule can say "ask before doing X," it cannot waive a Policy Kernel `ask`/`deny` — the
  Kernel decision is unaffected by rule text, by construction (the Kernel never reads prompt content).
- No hierarchical directory-walk the way Kilo's project-tree AGENTS.md works — Tepegöz has no
  "project directory" concept for a browsing session. Start with one global file; a per-profile variant
  (once P3's named profiles exist) is the natural next increment, not a v1 requirement.
- A visible "standing rules active (N)" indicator in `ext-agent`, mirroring the transparency Kilo gives a
  user over what instructions are silently shaping every run.

**New/changed packages:** `@tepegoz/orchestrator` (assembly reads the rules file), `apps/desktop`/
`extensions/ext-agent` (a small Settings surface to view/edit the file — reusing whatever this repo's
existing plain-text-preference editing pattern is, not a new editor).

**ADR:** one new ADR — "standing agent rules are trusted, user-authored, non-executable text; never
derived from page content or the model; never a substitute for the Policy Kernel" — cross-cited against
`webbrain-agent-parity.md` P4's site-adapter ADR since both establish the identical principle for two
different injection points; consider folding into one ADR covering both if both are opened in the same
session. No number reserved.

**DoD shape (draft):**

- [ ] Rules text is loaded from disk only — a test proves no code path can populate it from page content,
      a tool result, or model output
- [ ] A rule requesting a `financial`/`destructive`-class action still produces the normal HITL gate — a
      test proves the rule text cannot silently pre-approve
- [ ] The "standing rules active" indicator is visible whenever the file is non-empty
- [ ] i18n: the Settings surface (label, help text, "N rules active" indicator) gets EN+TR parity; the
      rule text itself is user-authored content, not UI copy

---

## P5 — Surface the Policy Kernel's approval reason in the UI (small, sharpens S6/S8)

**Goal.** Kilo's `Permission.ask` already returns `{manual, rule}` so a client can tell a user _why_ a
call went through without a prompt (a matched `allow` rule, its pattern, its provenance). Tepegöz's
`PolicyKernel` already computes a "machine-readable reason code" per ADR-0006 — this workstream is
narrower than it looks: confirm that reason code actually reaches `ext-agent`'s approval/audit surfaces,
and if it doesn't yet, wire it through rather than compute anything new.

**Approach.**

- Audit `extensions/ext-agent`'s existing audit trail / replay timeline / approval prompts for whether
  the Kernel's reason code is already rendered; if the plumbing exists end-to-end this workstream closes
  as a documentation/DoD-sharpening note, not code.
- Where it's missing, thread the existing reason code through the existing evidence-chip/audit-entry UI
  S8 already ships — no new computation, no new Kernel surface, purely wiring.

**New/changed packages:** `extensions/ext-agent` only (UI wiring), if any code is needed at all.

**ADR:** none — this uses ADR-0006's existing reason-code contract as-is.

**DoD shape (draft):**

- [ ] Every auto-approved tool call's audit entry shows the deciding reason code (danger class, matched
      site rule, or autonomy level) — not just "approved"
- [ ] i18n: reason-code display strings get EN+TR parity

---

## P6 — Context-compaction budget reference (addendum to `webbrain-agent-parity.md` P9-a)

**Goal.** `webbrain-agent-parity.md` P9-a already proposes an explicit, visible mid-run compaction step on
top of the existing `cache-window.ts` discipline. Kilo's `session/compaction.ts` supplies concrete,
shipped numbers worth citing as a starting reference rather than picking thresholds from nothing:
`PRUNE_MINIMUM`/`PRUNE_PROTECT` token floors, a 2,000-character cap on any single tool-output text kept
in context (`TOOL_OUTPUT_MAX_CHARS`), a 2-turn protected tail (`DEFAULT_TAIL_TURNS`), a "recent" budget
sized to 25% of the usable context window and bounded to `[2,000, 8,000]` tokens, and overflow of an
oversized tool result to a managed file with only a preview + path kept in-context.

**Approach.** No new mechanism beyond what P9-a already proposes — add these numbers as a documented
starting point for P9-a's own threshold design, to be tuned against Tepegöz's own token/cost telemetry
(S7) rather than copied blindly, since Tepegoz's message shape (page-perception-heavy, not
diff/patch-heavy) is different enough that Kilo's exact constants may not transfer as-is.

**New/changed packages:** none beyond what P9-a already names.

**ADR:** none, matching P9-a's own treatment.

**DoD shape (draft):** folds into P9-a's own DoD; no separate checklist.

---

## P7 — Checkpoint: a narrow, honest non-transfer (sharpens Phase 1b's open durable-resume line)

**Goal.** Be explicit about why Kilo's shadow-git checkpoint **does not port**, rather than silently
dropping the "checkpoint" axis or inventing a feature that doesn't fit. Kilo's snapshot exists because a
coding agent mutates local files the user might want back; a browser agent's mutations are mostly remote
(a form submitted to a server, a page navigated away from) — there is no local file tree to snapshot.
`docs/others/tepegoz-vs-kilocode.md` already reaches this conclusion in its own comparison: Tepegöz's
equivalent guarantee (know what happened, prove it, reverse a _local_ side effect where one exists) comes
from Notary replay receipts (Phase 7) and the pre-mutation origin gate (S4), not from an undo stack.

**What is honestly transferable is one engineering pattern, not the capability.** Kilo's snapshot service
locks across CLI-and-extension processes with a filesystem `flock` (`EffectFlock`), and resumes
interrupted background "materialization" work safely after a crash (seed → localize → pin, each step
checked before the next). Phase 1b's own DoD already carries an open line — "durable resume across app
restarts" — that needs exactly this kind of crash-safe, resumable, cross-process-safe design. This
workstream's only content is: **when a session picks up that line, `snapshot/index.ts`'s
lock-then-stage-then-pin ordering is worth reading as a reference for how to make a resume operation safe
to interrupt at any point**, not as code to port.

**Approach.** None beyond the citation above — no new package, no new capability, no new DoD line beyond
the one Phase 1b already has open.

**New/changed packages:** none.

**ADR:** none — Phase 1b's existing scope already covers durable resume; this adds a reference, not a
new decision.

**DoD shape (draft):** none separate from Phase 1b's own "durable resume across app restarts" line;
this workstream closes the moment that line's owning session has read this citation, whether or not it
changes the implementation.

---

## Backlog (named, not written up)

- **Marketplace workspace-relevance, browser-shaped.** Kilo suggests catalog entries by matching open
  files/installed extensions. P2 already adapts this narrowly to "current tab's origin matches an
  entry's declared relevance," reusing the site-adapter pattern — a richer version (matching the whole
  open tab set, or browsing history) is real but not designed here; revisit only if P2's narrow version
  proves too coarse in practice.
- **Kilo Gateway's `provider-usage`/`provider-debug`/balance display.** Cost-transparency UX (not one of
  the seven carried axes) that would sit naturally next to `TokenLedger` if a session ever opens a
  dedicated cost-transparency track; not written up here because it wasn't named in this track's scope.

---

## Routing — what this track does not own

| Stays with                                                      | Material                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`webbrain-agent-parity.md`](webbrain-agent-parity.md) **P1**   | Generic OpenAI-compatible provider + provider catalog — this track's P1 is an addendum only (the per-model prompt-variant detail)                                                                                                                                                                                                                             |
| [`webbrain-agent-parity.md`](webbrain-agent-parity.md) **P4**   | Site-guidance adapters — P2's relevance matching and P4's "trusted, non-page-derived text" framing both reuse this, not a duplicate                                                                                                                                                                                                                           |
| [`webbrain-agent-parity.md`](webbrain-agent-parity.md) **P8**   | Tool-surface tiering (`compact`/`mid`/`full`) — P3's `toolTierPreset` enum starts from this, doesn't redefine it                                                                                                                                                                                                                                              |
| [`webbrain-agent-parity.md`](webbrain-agent-parity.md) **P9-a** | Mid-run visible context compaction — P6 is a numeric addendum only                                                                                                                                                                                                                                                                                            |
| **Phase 3**                                                     | The managed/zero-setup cloud proxy and zero-markup gateway model — Kilo Gateway's cost shape is a cloud-layer concern, out of this track's scope                                                                                                                                                                                                              |
| **Phase 12 / ADR-0037**                                         | `SupplyChainGate` — third-party marketplace-content trust verification; P2/P3/P4 stay curated-only until this lands                                                                                                                                                                                                                                           |
| **ADR-0006 / S6 / S8**                                          | The deterministic Policy Kernel, hard sensitive-site deny, financial-class HITL, biometric gate — already the equivalent (and, per S8's own fixed bug, hardened) of Kilo's forced-human-reply + deny-survives-YOLO design                                                                                                                                     |
| **S3 / Reactor**                                                | No-progress replan — already the equivalent of Kilo's `doom_loop` detector, and broader                                                                                                                                                                                                                                                                       |
| **S9**                                                          | Per-task remembered `(run, host)` grants — already the equivalent, narrower-scoped, of Kilo's wildcard `always` rules                                                                                                                                                                                                                                         |
| **Phase 1b**                                                    | "Durable resume across app restarts" — P7 adds a reference citation to this already-open line, nothing more                                                                                                                                                                                                                                                   |
| Out of category (see **Scope**)                                 | Code edit/diff/`apply_patch`, `bash`/`interactive_terminal`/`kilo-sandbox`, inline autocomplete/FIM, `kilo-indexing`/`semantic_search`, LSP, VS Code/JetBrains + Agent Manager multi-session, KiloClaw/Cloud Agent/PR-review bot, `kilo-memory` capture→recall, `kilo run --auto` CI mode, office-file/image-generation tools — none of this track's business |

## ADRs owed (numbers assigned when a session actually opens one of these)

- P1: no new ADR — content added to `webbrain-agent-parity.md` P1's already-owed addendum to ADR-0005
- P2: one new ADR — "capability catalog: discovery is separate from trust; every installed entry still
  enters through the existing PEP"
- P3: one new ADR — "named agent profiles are tool-surface presets and prompt-tone hints, never
  permission-grant authorities"
- P4: one new ADR — "standing agent rules are trusted, user-authored, non-executable text; never a
  substitute for the Policy Kernel" (consider folding into one ADR together with `webbrain-agent-parity.md`
  P4's site-adapter ADR, since both state the same principle for two different injection points)
- P5, P6, P7: no ADR — wiring/reference-only workstreams against decisions already made

No number is reserved here; per this repo's own multi-profile-track lesson
(`multi-profile-isolation.md` — an ADR-number collision from writing a plan too far ahead of when it's
actually opened), the number gets assigned at the point a session actually starts the work, not now.
