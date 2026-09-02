# Track — BrowserSkill agent-capability parity

**Status:** 📋 **Proposed — not scheduled (2026-09-01).** No branch, no ADR number reserved, no owner
sign-off. This is a captured gap list in the shape of
[`browser-settings-feature-gap.md`](../tracks/browser-settings-feature-gap.md),
[`webbrain-agent-parity.md`](webbrain-agent-parity.md) and [`aipex-agent-parity.md`](aipex-agent-parity.md):
every row names its nearest existing Tepegöz behaviour and a suggested phase home, so a future session
can promote a row into a real `phase-*.md` task or an `ai-agent` PR without re-deriving the
comparison.

**Source:** a same-session deep read of `.junk/browserskill` (**BrowserSkill**, Tencent, MIT-licensed;
`bsk` Rust CLI `v0.1.11` + a local daemon + an MV3 Chromium/Edge extension, live on the Chrome Web Store
and Edge Add-ons) against this repo's AI surface (`phases/ai-agent/`, `packages/orchestrator|
model-gateway|capability-plane|security-policy|agent-runtime|browser-tools|web-tools|tool-executor|
local-inference|model-catalog|mcp-client|recipe-compiler|macro-engine|notary|credential-vault|
human-input|tasks`, `extensions/ext-agent`). The prose comparison this track distills is
[`docs/others/tepegoz-vs-browserskill.md`](../versus/tepegoz-vs-browserskill.md) (Turkish,
2026-09-01); this file is the durable English track artifact. Key claims were re-verified directly
against source in this session: `crates/bsk-cli/skill/SKILL.md` (the full 327-line agent runbook,
including the "Red lines" and "Stop when the goal is met" sections), `docs/architecture.md` (system
diagram, session/sandbox model, concurrency table, security section), `apps/extension/src/tools/
borrow-confirmation.ts` (the fail-closed tab-borrow flow, `CONFIRMATION_TIMEOUT_MS`/
`BACKGROUND_TIMEOUT_MS` constants, OS-notification fallback), `apps/extension/src/tools/human-loop.ts`
(`handleRequestHelp`, typed `completion_criteria` polling, the tab-created/activated/navigation re-arm
listeners), and `evals/browser/README.md` (the agent-neutral deterministic fixture corpus and its
"unverified is never silently passed" discipline). Tepegöz-side claims were cross-checked against
`packages/security-policy/src/handoff-detector.ts` (`detectHandoff` — a deterministic text/keyword
scanner, not a resolution-tracking state machine) and `extensions/ext-agent/src/i18n/en.ts` (the current
handoff copy: _"Tepegöz has stopped and handed control back to you… Complete it yourself, then start a
new task"_ — confirming today's handoff is a hard stop, not a resumable pause).

**A correction to this track's own background material.** The reusable prompt that generated this
track lists `@tepegoz/notary` among Tepegöz's shipped AI surface. That package is real, written, and
unit-tested — but a repo-wide check for this track (`grep -r "@tepegoz/notary" apps/desktop/src`, and
`apps/desktop/package.json`) found **zero imports and zero dependency entries**. `apps/desktop` never
wires it in. This matches Phase 7's own honest status row ("NotaryService algorithmic core + standalone
`tepegoz-verify` CLI landed, tested by running the built binary; **not wired into a live run**"). So
this track does not say "Tepegöz has Notary"; it says **Notary is written and tested but not connected
— it produces no working receipt today**, everywhere the comparison would otherwise imply an active
capability.

## Why this track exists

The comparison landed on an honest asymmetry, and it is a different one from the `webbrain`/`aipex`
tracks: **BrowserSkill is not a competing browser agent at all.** It has no LLM, no agent loop, no
system prompt, no provider layer, no context management, no checkpoint — every one of those is supplied
by the _calling_ harness (Claude Code, Cursor, Codex, a CI job). BrowserSkill is an **agent-enablement
bridge**: a `bsk` CLI + local daemon + MV3 extension that lets a shell-capable outside agent drive the
user's own, already-logged-in Chromium browser through a `SKILL.md` instruction file and shell calls. It
is, in the owner's own framing, **the same direction as AIPex's `aipex-mcp-bridge`** — external agents
delegating a task to a real, signed-in browser — and it is a second, independently-designed reference
for the still-unbuilt line in Phase 1b's DoD ("MCP server: Bearer + rate-limit + Policy re-pass"), which
[`aipex-agent-parity.md`](aipex-agent-parity.md) P1 already sharpens in detail. What BrowserSkill adds
on top of that shared direction — and what makes it worth a second track rather than a footnote on
`aipex-agent-parity.md` — is a genuinely different, carefully-engineered answer to _"how do you let an
outside agent touch a browser without touching the user's own work"_: a separate, visible **Agent
Window**, and a fail-closed, OS-notification-backed **tab-borrow consent** flow for the rare case the
agent needs a tab the user is actually looking at. Neither of Tepegöz's existing delegation plans
(Phase 1b's DoD line, `aipex-agent-parity.md` P1) names either idea yet. This track's job is the same as
its siblings': for every BrowserSkill capability the comparison found, _does Tepegöz already have a seam
for this, and if not, what would the Tepegöz-conformant version look like_ — never "port the Rust/TS,"
always "re-derive the capability inside the existing kernel/PEP/i18n/coverage discipline."

## How to read this

Each workstream below is written like an `ai-agent` phase section (Goal → Approach → new/changed
packages → ADRs owed → DoD-shaped bullets) so it can be lifted into a real phase file with minimal
rewriting. **Nothing here is committed roadmap.** Where a capability already has a named home in an
existing phase, an ADR, or a sibling track (`webbrain-agent-parity.md`, `aipex-agent-parity.md`), this
track says so explicitly and does **not** re-describe it — it only adds the detail the BrowserSkill
reading surfaced that the existing text doesn't have yet. Per the "Already planned — do NOT re-propose"
rule in [`../README.md`](../../phases/README.md#deferred--adoption-gated-backlog-from-the-beyond-phases-synthesis),
the **MCP server** direction itself is **Phase 1b**, already sharpened once by `aipex-agent-parity.md`
P1 — this track's P1 is a _second_ sharpening pass, not a competing proposal.

## Ground rules — parity, not imitation

Four BrowserSkill design choices are **deliberately not being matched**, because matching them would
violate a standing decision this repo already made after deliberation. Naming them here once, so no
future session re-proposes them by accident:

1. **No `bsk evaluate` / raw-JS execution as an agent tool.** BrowserSkill's own SKILL.md names this its
   riskiest command in its own words — Red line 6: _"`evaluate` is powerful and risky — use only when
   snapshot + click/fill/select cannot suffice; never on credential surfaces."_ Enforcement is a written
   instruction to the _calling model_, backed only by a sandbox scope check ("restricted to Agent Window
   tabs"); there is no independent, code-level danger classification of what the JS actually does.
   ADR-0026 already measured Tepegöz's own isolated-world sandbox path for exactly this shape of
   capability and found it **refuted**; ADR-0029 already drew the line at DevTools-class capability
   being **user-only, never an agent tool**. Do not add `execute_js`, even scoped to agent-owned tabs.
2. **No "the calling model decides what's dangerous" permission model.** BrowserSkill's SKILL.md
   "Red lines" (no token theft, no long borrow, always stop the session, no post-success control) are
   _instructions the harness's own model is trusted to follow_ — verified in `docs/architecture.md`'s
   own "Security (v1)" section, which lists only loopback binding, an extension-origin allow-list at the
   WS handshake, and "no credential storage in bsk." There is no danger-class, taint, or sensitive-site
   check independent of the calling model's argument values. ADR-0006 already chose the opposite shape:
   a **deterministic PolicyKernel that decides pre-model**. Every delegation surface this track proposes
   (P1, P2) keeps going through that kernel — a connected external agent's own good behaviour is never
   the safety mechanism.
3. **No separate, out-of-process native daemon as the delegation transport.** BrowserSkill's own
   `docs/architecture.md` diagram is explicit: `bsk` CLI → JSON Lines/UDS → **a background daemon the
   CLI auto-spawns and the OS keeps running independently of any browser window**
   (`~/.bsk/daemon.lock`/`.sock`/`.pid`) → WebSocket → the extension. Tepegöz already _is_ the native
   process; a delegation surface belongs inside the Electron main process / a `@tepegoz/mcp-server`
   package (the shape `aipex-agent-parity.md` P1 already specifies), never a second always-on binary a
   user installs and manages independently of the app they already trust. This generalizes
   `ai-agent`'s existing "Never" line — no Python sidecar / second Chromium / vendor agent SDK —
   to: no extra out-of-process component, full stop.
4. **No LLM-interpreted trace-bundle replay as a substitute for deterministic replay.** `bsk record`
   writes a trace bundle (`trace.json` + `states/sN.txt` VOM snapshots) that a **model** later
   re-executes by reading each state file and re-issuing `target` role/name/tag + raw `value` actions —
   BrowserSkill's own docs are precise that this is "a guide, not an extended-control interpreter." That
   is a strictly _weaker_ primitive than what Tepegöz already has in Phase 6 — `@tepegoz/macro-engine` +
   `@tepegoz/recipe-compiler`, both **model-free**, with a success oracle and self-healing selectors. Do
   not regress to a model-in-the-loop replay format; the existing ownership test already answers this —
   _"if the model could be removed from the replay, it's Phase 6."_

None of these are "BrowserSkill did it wrong" — its own `docs/architecture.md` and SKILL.md show a team
that reasoned carefully about the same trade-offs and, being a CLI + daemon + extension with no native
process and no policy kernel of its own, landed differently. Two items worth confirming rather than
rejecting, because a careless reading of the comparison table could invent a gap that isn't there:
BrowserSkill's own observation-priority ordering (`observe`/`snapshot` → `get-html` → `screenshot`, "only
escalate… when the latest observation cannot answer the question") already agrees with Tepegöz's
DOM/a11y-first, vision-last-resort design (ADR-0008) — it ships **no vision model of its own** at all, so
there is nothing to reject on "screenshot-every-step." And BrowserSkill's `evaluate` runs in the
extension's content-script/CDP context, not inside Tepegöz's renderer trust boundary — "renderer-trusted
security decisions" (the `ai-agent` Never-list item) is not a temptation this comparison raises.

---

## Capability inventory

Legend for **Home**: an existing phase/ADR name (or a sibling track's workstream) means "already
planned, this row sharpens it, no new phase needed." **NEW** means no existing plan owns it and this
track proposes one. **Ground rules #N** means deliberately not matched.

| #   | BrowserSkill capability                                                                                                                                                                                                                                                                                                      | Nearest Tepegöz behaviour today                                                                                                                                               | Gap                                                                                                                                                        | Home                                                                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `SKILL.md` + `bsk` shell bridge letting Claude Code / Cursor / Codex / DeepSeek Harness drive the user's **already-logged-in** browser                                                                                                                                                                                       | MCP **client** only (ADR-0018); no surface for an external agent to drive Tepegöz                                                                                             | The opposite direction, same as AIPex's `mcp-bridge`                                                                                                       | **Phase 1b** (already planned) + `aipex-agent-parity.md` **P1** (already sharpens it); this track's **P1** adds two details neither names yet          |
| 2   | A separate, visible **Agent Window** — the user's own windows are never touched unless a tab is explicitly borrowed                                                                                                                                                                                                          | Sekme-grubu-başı oturum (tab-group-per-session) + background continuation + tray indicator, all inside the user's normal window                                               | No visually-separate window for delegated or unattended runs                                                                                               | **P1 (NEW — extends Phase 1b / aipex-track P1)**                                                                                                       |
| 3   | Fail-closed tab-borrow consent: in-page overlay + OS notification with Allow/Deny, verified `BACKGROUND_TIMEOUT_MS` auto-deny, explicit-authorization fallback when no window can host the overlay                                                                                                                           | No equivalent — Tepegöz's own agent operates in its own tab/window scope already, so "borrowing a foreground user tab" has never been a designed case                         | A consent primitive for the one case Phase 1b/AIPex-track P1 will eventually need: an external or background run touching a tab the user is actively using | **P1 (NEW — extends Phase 1b / aipex-track P1)**                                                                                                       |
| 4   | Per-session ref-store + daemon-serialized same-session RPCs; different sessions run fully parallel, isolated Agent Windows; `tab_list --scope` filters other sessions' tabs                                                                                                                                                  | Single concurrent run (ADR-0013); tab-group-per-session exists but no true parallel isolated runs                                                                             | Concurrency model detail for the still-unopened "true parallel background runs" item                                                                       | `ai-agent` **backlog** (already named, evidence-gated) — **P1** cites the concrete isolation shape when that item opens                                |
| 5   | `bsk request-help --completion-criteria` — typed `url_contains`/`url_matches`/`selector_exists`/`selector_missing`/`text_exists`/`text_missing`, `any`/`all`, `stable_for_ms` polling                                                                                                                                        | `detectHandoff` — a deterministic **text/keyword scanner** that only decides _whether_ to hand off, nothing about resolution                                                  | No typed, pollable "has the user actually finished" signal                                                                                                 | **P2 (NEW — extends ADR-0039 / `detectHandoff`)**                                                                                                      |
| 6   | Re-arm on `chrome.tabs.onCreated`/`onActivated` + `webNavigation.onCompleted` — the help overlay re-establishes itself if the page reloads or the user tabs away and back                                                                                                                                                    | None — nothing re-attaches a paused-handoff state to a changed tab/page                                                                                                       | Handoff state does not survive navigation/tab churn today                                                                                                  | **P2**                                                                                                                                                 |
| 7   | `request-help` **resumes the same session** in place (`continued`/`completed` outcome hands control back to the calling agent, which re-observes and continues)                                                                                                                                                              | Today's handoff banner is a **hard stop**: _"Complete it yourself, then start a new task"_ (verified, `ext-agent/src/i18n/en.ts`)                                             | No resume-in-place path for the run that was paused                                                                                                        | **P2** — the core gap this workstream closes                                                                                                           |
| 8   | `BSK_REQUEST_HELP=off` — unattended mode returns `outcome="disabled"` immediately, no overlay, no wait                                                                                                                                                                                                                       | `@tepegoz/tasks`'s background runner already fail-safe-denies an unattended HITL escalation (existing precedent)                                                              | A handoff specifically needs the same fail-closed treatment when no supervision is present — not yet an explicit rule at the handoff layer                 | **P2** — sharpens the existing `@tepegoz/tasks` precedent, does not invent a new mechanism                                                             |
| 9   | `bsk observe`'s bounded "perception probes" — `[hover first: …]` markers flag hover/focus-revealed menus so the agent hovers, re-observes, then clicks the newly-visible item                                                                                                                                                | S2 identity-stable refs + diff/elision (`TEPEGOZ_PERCEPTION_V2`) — passive; `hover` action exists (S3, landed) but perception never _signals_ that hovering would reveal more | The reactor has a `hover` tool but no perception-level hint telling it a hover would help                                                                  | **P3 (NEW, small — extends S2/ADR-0008)**                                                                                                              |
| 10  | `bsk emulate` — 7 device presets (iphone-14/-14-pro-max/-se, pixel-7, galaxy-s23, ipad-mini, galaxy-tab-s8) + manual viewport/UA/DPR/touch flags, per-tab CDP scope, field-merge semantics, `--off` clears everything                                                                                                        | No device-emulation tool                                                                                                                                                      | Nothing for a mobile-layout/behaviour task                                                                                                                 | **P4 (NEW, small)**                                                                                                                                    |
| 11  | Read-only `bsk console`/`bsk network` — bounded per-tab buffer (`--limit` max 200, `--max-text-chars` max 4096), **no** headers/bodies/timings captured, strictly read-only                                                                                                                                                  | None as agent tools (ADR-0029 keeps DevTools user-only)                                                                                                                       | Already the exact shape of a planned row                                                                                                                   | **`webbrain-agent-parity.md` P3-d** (already planned) — this track adds the verified numeric bounds as a reference default, does not re-propose        |
| 12  | `evals/browser/` — agent-neutral, deterministic fixture corpus; declarative smoke steps run **directly through the CLI, no model**; seeded `generated-form` DOM-variation matrix (label association, nesting, hydration delay, decoys, field order/ids); "missing adapter evidence is `unverified`, never silently `passed`" | `@tepegoz/agent-eval` — ground-truth task-success scoring, **model-in-the-loop**, gated by the `ai-agent` API budget                                                          | No zero-cost, zero-LLM smoke lane that proves the browser-tool primitives themselves work across DOM shapes, runnable on every PR for free                 | **P5 (NEW — extends `@tepegoz/agent-eval`)**                                                                                                           |
| 13  | `bsk evaluate` (raw CDP `Runtime.evaluate` as an agent tool)                                                                                                                                                                                                                                                                 | `execute_js` refused by design                                                                                                                                                | — (BrowserSkill's own stated highest-risk command)                                                                                                         | **Ground rules #1** — rejected (ADR-0026/0029)                                                                                                         |
| 14  | SKILL.md "Red lines" as instructions to the calling model, no independent danger classification                                                                                                                                                                                                                              | Model-argument-blind, pre-model `PolicyKernel` (ADR-0006)                                                                                                                     | —                                                                                                                                                          | **Ground rules #2** — not adopted                                                                                                                      |
| 15  | Rust CLI + always-on background daemon (`~/.bsk/daemon.*`), auto-spawn / idle-shutdown / self-update                                                                                                                                                                                                                         | Native Electron main process; no second binary                                                                                                                                | —                                                                                                                                                          | **Ground rules #3** — not adopted                                                                                                                      |
| 16  | `bsk record` trace bundles, replayed by a **model** reading `states/sN.txt`                                                                                                                                                                                                                                                  | `macro-engine` + `recipe-compiler` — model-free, oracle-verified replay (Phase 6)                                                                                             | — (Tepegöz's primitive is already strictly stronger)                                                                                                       | **Ground rules #4** — not adopted                                                                                                                      |
| 17  | `--redact-values` masks recorded form values as `[filled]`/`[empty]`                                                                                                                                                                                                                                                         | Journal/audit redaction exists generically                                                                                                                                    | A specific, small technique worth matching for any future action-level audit of form fills                                                                 | **Backlog** — fold into whichever session next touches Journal/audit redaction                                                                         |
| 18  | `bsk status` / `bsk doctor` / `bsk browsers` — connection health, deep diagnostics, connected-browser listing                                                                                                                                                                                                                | `tepegoz://developer` (ADR-0041) already surfaces flags/prefs/dev knobs                                                                                                       | A small connection/session-health diagnostics view, not a new subsystem                                                                                    | **Backlog** — fold into [`developer-settings-surface.md`](../tracks/developer-settings-surface.md)                                                     |
| 19  | `observe`/`snapshot` `--max-tokens`/`--max-depth`, `record --max-page-tokens` truncation flags                                                                                                                                                                                                                               | Diff + unchanged-run elision (S2) + `cache-window.ts` lag-2 breakpoints                                                                                                       | —                                                                                                                                                          | Already covered, **more aggressive by design** (per the source comparison) — no action; cite `webbrain-agent-parity.md` P9-a if this is ever revisited |
| 20  | UI/docs in English only; no Turkish, no regional adapter                                                                                                                                                                                                                                                                     | EN+TR parity enforced per package (ADR-0016); ≥10 Turkish-web H2H tasks required                                                                                              | — (Tepegöz ahead)                                                                                                                                          | n/a                                                                                                                                                    |

---

## P1 — Governed external-agent bridge: Agent Window + fail-closed tab-borrow consent (extends Phase 1b / `aipex-agent-parity.md` P1)

**Goal.** `aipex-agent-parity.md` P1 already specifies the hard part of letting an outside agent
(Claude Code, Cursor, a CI job) delegate a task to the Tepegöz browser: a `@tepegoz/mcp-server` package,
every delegated call re-entering the one PEP unchanged, Bearer + rate-limit + per-token scope, and
unattended fail-safe-deny. This workstream does **not** redo that design. It adds the two ideas
BrowserSkill's independent implementation contributes that neither Phase 1b's DoD line nor the AIPex
reading names: a **visually separate Agent Window**, and a **fail-closed tab-borrow consent** flow for
the one case a delegated (or scheduled/unattended) run legitimately needs a tab the user is already
looking at.

**What BrowserSkill actually built (verified).** Every `bsk session start` opens a dedicated Agent
Window, isolated from the user's own windows; write tools only ever touch tabs inside it (or a tab
explicitly **borrowed** in). `requestBorrowConfirmation` (`apps/extension/src/tools/
borrow-confirmation.ts`) walks the user's other normal windows in most-recently-focused order, injects
an in-page overlay into the first one that can host it, and **in parallel** raises an OS-level Chrome
notification (`requireInteraction: true`, Allow/Deny buttons) so the request is visible even if the
Agent Window has focus. The overlay auto-denies after `CONFIRMATION_TIMEOUT_MS` (5000 ms) plus its UI
transition; the whole flow has a `BACKGROUND_TIMEOUT_MS` safety net (5000 + 1000 + 150 + 500 ms) so the
promise can never hang. If every candidate window's content script is unreachable, the code does **not**
silently allow the borrow — it keeps the promise pending on the OS notification's own Allow/Deny buttons
as an "explicit-authorization fallback," and only times out to `false` if that never resolves either.
`session start --no-focus` opens the Agent Window without stealing the user's foreground focus, for
runs that shouldn't interrupt them.

**Approach.**

- **A dedicated Agent Window mode, reusable by both delegated and internal unattended runs.** Extend the
  existing tab-group-per-session model with an option to open the run's tabs in a **separate OS window**
  rather than a group inside the user's current window — for a `@tepegoz/mcp-server`-delegated task
  (P1's whole point) and, just as usefully, for a `@tepegoz/tasks` scheduled/background run the user
  never explicitly attended to. Reuse the existing background-continuation + tray-indicator affordance;
  add the window-separation as a mode, not a rebuild.
- **Fail-closed tab-borrow consent**, built for the one legitimate case a delegated or backgrounded run
  needs to touch a tab the user is actively using: an in-page overlay **and** an OS notification, raised
  together (not one as a fallback for the other reaching the user _late_ — BrowserSkill's own design
  intentionally races both); auto-deny on timeout; and the same "no candidate window reachable →
  explicit-authorization-only, never silent-allow" discipline. Wire the actual **decision** through the
  existing `PolicyKernel` — `isSensitiveSite` and the run's autonomy level still gate the tab regardless
  of who clicked Allow; the borrow overlay is a _consent_ step in front of the kernel, never a bypass of
  it (Ground rules #2).
- **`--no-focus`-equivalent** for background/scheduled runs that must not steal the user's foreground
  attention, reusing the existing continue-in-background plumbing.
- **What stays exactly as designed:** the CapabilityRegistry, the PolicyKernel, the two-stage HITL,
  `EgressFirewall`, `TaintTracker`, and the audit journal are untouched — Agent Window and borrow-consent
  are UX/session-shape additions on top of `aipex-agent-parity.md` P1's transport and auth design, not a
  new enforcement mechanism.

**New/changed packages:** the `aipex-agent-parity.md` P1 packages (`@tepegoz/mcp-server`,
`@tepegoz/capability-plane` publish-flag), plus the desktop tab/window layer (wherever tab-group-per-
session already lives) for the Agent-Window mode, and a small new consent surface in `extensions/
ext-agent` + `@tepegoz/security-policy` (borrow-request evaluation, still PolicyKernel-gated).

**ADR:** the same MCP-server ADR Phase 1b's DoD already records as owed (`aipex-agent-parity.md` P1's
line) — add the Agent-Window and fail-closed borrow-consent clauses to that same addendum rather than
opening a second ADR.

**DoD shape (draft, for whichever session promotes this):**

- [ ] A delegated or scheduled run can open in a visually distinct window, and the user's own foreground
      tabs are never enumerated or touched by that run unless explicitly borrowed
- [ ] A borrow request that receives no explicit user response (overlay unreachable, notification
      ignored, timeout) is **denied**, never silently allowed — proven by a test that starves every
      response channel
- [ ] A borrowed tab remains subject to the normal `PolicyKernel`/`isSensitiveSite` gate — consenting to
      the borrow does not waive it (test proves a borrowed sensitive-site tab still hard-denies)
- [ ] i18n: the borrow-consent overlay/notification copy and the Agent-Window mode toggle get EN+TR
      parity in the owning package's dict (ADR-0016)
- [ ] Gated behind Phase 1b's MCP-server line being opened (this track does not open it unilaterally)

---

## P2 — Handoff resume-in-place: typed completion criteria + re-arm (extends ADR-0039 / `detectHandoff`)

**Goal.** Close the gap between _detecting_ a handoff and _resuming the same run once it's resolved_.
Today, `detectHandoff` (`packages/security-policy/src/handoff-detector.ts`) is a precise, deterministic
keyword/text scanner that decides _whether_ a CAPTCHA/2FA/login wall is on the page — and that half is
good and stays exactly as designed. What happens next is a **hard stop**: the current copy in
`extensions/ext-agent/src/i18n/en.ts` reads _"Tepegöz has stopped and handed control back to you… Complete
it yourself, then start a new task."_ BrowserSkill's `bsk request-help` (`apps/extension/src/tools/
human-loop.ts`) solves the same problem by **pausing the same run in place** and resuming it
automatically once a typed, verifiable condition is met.

**What BrowserSkill actually built (verified).** `handleRequestHelp` brings the target tab to the
foreground, shows a prompt (optionally pointing at specific targets), and blocks. Resolution is typed:
`completion_criteria` is `{any: [...], all: [...], stable_for_ms}` over conditions (`url_contains`,
`url_matches`, `selector_exists`, `selector_missing`, `text_exists`, `text_missing`), polled every 500 ms
(`COMPLETION_POLL_MS`) and required to hold stable for `stable_for_ms` (default 1000 ms) before the call
resolves `outcome: "completed"`. Independently, the overlay **re-arms** — `attachHelpTabListener` and
`attachHelpNavigationListener` schedule `rearmHelp` on `chrome.tabs.onCreated`/`onActivated` and
`webNavigation.onCompleted`, so a page reload or a tab the user switched away from and back to still
shows the pending help state, debounced (`HELP_REARM_DEBOUNCE_MS`) and retried
(`HELP_REARM_MAX_ATTEMPTS`) against transient content-script-not-ready races. `note` carries free text
the user typed back to the caller as evidence. The doc is explicit that `outcome: "navigated"` is a
**deprecated** legacy signal — _"do not rely on navigation as a completion signal"_ — matching (not
contradicting) Tepegöz's own evidence-over-assumption philosophy.

**Approach.**

- **A typed completion-criteria shape**, added to the existing handoff signal
  (`packages/security-policy`), evaluated as pure, deterministic functions — URL substring/regex match
  and (where a page-read is already in flight for the current step) selector/text presence — polled on a
  fixed interval with a `stable_for_ms` debounce, same shape as BrowserSkill's. When criteria are
  supplied and match, the run **resumes in place** instead of terminating.
- **Re-arm the pending-handoff state** across tab/navigation events the same way BrowserSkill does:
  reload, tab-switch-away-and-back, and SPA navigation should not silently drop a pending handoff or
  force the user to notice a stale banner — the banner (or its underlying wait) re-establishes itself.
- **An explicit unattended kill-switch at the handoff layer**, restating the existing `@tepegoz/tasks`
  background-runner precedent (a scheduled/unattended run's HITL escalation with no supervisor present
  is denied, never silently proceeds) so a handoff specifically is covered by the same fail-safe rule,
  not just implied by it.
- **Capture the user's free-text note** (if any) when they resolve a handoff and feed it back into the
  run's context as evidence — small, and it is the one piece of BrowserSkill's design that costs almost
  nothing to add.
- **What stays exactly as designed:** `detectHandoff`'s deterministic, precision-tuned keyword scanning
  is untouched — this workstream is entirely about what happens _after_ a handoff fires, never about
  loosening or model-izing the trigger itself.

**New/changed packages:** `@tepegoz/security-policy` (completion-criteria evaluator, pure logic),
`@tepegoz/agent-runtime`/`@tepegoz/orchestrator` (resume-in-place instead of terminate-the-run),
`extensions/ext-agent` (re-arming banner, note capture, updated copy distinguishing "waiting, will
resume automatically" from today's "start a new task").

**ADR:** an addendum to **ADR-0039** (user-granted sensitive capabilities / the handoff shape) —
completion-criteria, re-arm, and the explicit unattended-kill-switch restatement, no new number.

**DoD shape (draft):**

- [ ] A handoff with `completion_criteria` resumes the **same** run automatically once the criteria hold
      stable for the configured duration — no user action beyond resolving the actual page challenge
- [ ] A handoff without `completion_criteria` behaves exactly as today (explicit user action required) —
      this is additive, not a behaviour change for the existing path
- [ ] A page reload or tab-switch-away-and-back while a handoff is pending does not lose the pending
      state (test proves re-arm)
- [ ] An unattended (`@tepegoz/tasks`-driven) run that hits a handoff with no supervisor present is
      denied/stopped, never silently proceeds — a test reuses the existing background-runner fail-safe
      pattern
- [ ] `outcome`/resolution never treats bare navigation as proof of completion (matches BrowserSkill's
      own documented lesson, restated as a Tepegöz test)
- [ ] i18n: EN+TR for the new "resuming automatically" vs. "start a new task" copy split, and any new
      completion-criteria-related messaging

---

## P3 — Disclosure-trigger perception hints (extends S2 / ADR-0008)

**Goal.** BrowserSkill's `bsk observe` runs "bounded perception probes" and annotates elements whose
interaction would reveal more UI — `[hover first: …]` — so the agent knows to `bsk hover` a nav trigger,
re-observe, and only then click the newly-visible item, instead of guessing blind or clicking a trigger
it didn't mean to activate. Tepegöz's S2 perception (identity-stable refs + diff/elision) is **passive**:
it reports what is currently rendered. The reactor already has a `hover` action (S3, landed 2026-08-18),
but nothing in perception tells it _when_ hovering would help — a hover-revealed dropdown or Web
Component menu is invisible until the model already suspects to look for it.

**Approach.**

- A small, **heuristic, read-only** annotation added to the existing serialized observation: flag
  elements whose accessible role/attributes suggest a disclosure trigger (`aria-haspopup`,
  `aria-expanded="false"` with a `aria-controls`/`aria-owns` target, common nav/menu trigger patterns
  already reachable from `build-dom-tree-script`'s existing walk) with a short hint text, the same
  purpose as BrowserSkill's `[hover first: …]` marker.
- **Deliberately not** an active-probing pass that hovers every candidate node before returning an
  observation (expensive, and it would mutate focus/hover state on the page as a side effect of a read).
  This stays a cheap, static heuristic on already-collected DOM/AX data — the model still has to choose
  to call the existing `hover` tool; perception only makes the option visible instead of hidden.
- No Policy Kernel or danger-class change: this is metadata riding on an existing `read`-class tool's
  output, same trust tier as any other perception annotation.

**New/changed packages:** `@tepegoz/browser-tools` (`build-dom-tree-script` disclosure-trigger heuristic

- observation annotation). No other package changes.

**ADR:** none — a sharpening of ADR-0008/S2's existing perception contract, not a new decision.

**DoD shape (draft):**

- [ ] A fixture page with a hover-revealed menu produces an observation carrying the disclosure hint on
      the trigger element, with no page mutation and no page interaction performed by the read itself
- [ ] The heuristic has a bounded false-positive rate on the existing perception fixture registry (does
      not fire on ordinary buttons/links) — measured, not just asserted
- [ ] i18n: none expected (internal tool-output annotation, not user-facing copy); confirm during review

---

## P4 — Device emulation tool (NEW, small)

**Goal.** Give the agent a way to check a page's mobile layout/behaviour — BrowserSkill's `bsk emulate`
is a small, well-specified, already-proven design worth reusing almost verbatim.

**Approach.**

- `browser_emulate_device` — `dangerClass: 'state_changing'` (reversible; an explicit "off" call restores
  the tab's real environment), scoped to the calling run's active/agent-owned tab, applying CDP
  viewport/User-Agent/touch overrides. A small curated preset table (a handful of common current
  device profiles) plus manual overrides (width/height/DPR/UA/touch), following BrowserSkill's own
  **field-merge** semantics — repeated calls change only the fields passed, not the whole state — and its
  **per-tab, not inherited by new tabs** scope discipline (re-apply after switching tabs, exactly as
  BrowserSkill's own doc warns).
- An explicit "clear" mode that removes every override and restores the tab's real environment, matching
  `bsk emulate --off`.
- Registered through the one `CapabilityRegistry` like every other tool; untrusted-content wrapping does
  not apply here (no page text is read), but the tool result reports the applied emulation state for the
  model to reason about.

**New/changed packages:** `@tepegoz/browser-tools` (new tool + CDP calls), `@tepegoz/capability-plane`
(registration).

**ADR:** none — a new `state_changing`-class tool through the existing `docs/adding-a-tool.md`
checklist.

**DoD shape (draft):**

- [ ] Emulation applied to one tab does not leak to a newly-created or newly-focused tab (test proves
      per-tab CDP scope)
- [ ] A second call with a partial override set (e.g. only width/height) preserves the fields not passed
      (field-merge test)
- [ ] The "clear" call restores the tab's real viewport/UA/touch state, verified by re-reading it
- [ ] i18n: any Settings/tool-picker surface naming this capability gets EN+TR parity

---

## P5 — Deterministic, model-free tool-conformance smoke corpus (extends `@tepegoz/agent-eval`)

**Goal.** Adopt BrowserSkill's "unverified is never silently passed" discipline as a genuinely useful
**new tier** of evaluation — not a replacement for `@tepegoz/agent-eval`'s ground-truth, model-in-the-loop
task-success scoring, but a cheap, always-on complement to it. `evals/browser/`'s core insight is that a
large share of "does this browser primitive actually work" questions need **no model at all**: a
declarative smoke workflow, fixed argument sequences, page-observable assertions, and a seeded
DOM-variation generator (`generated-form` varies label association, nesting depth, hydration delay,
decoy controls, field order/ids from one seed while holding the task and the oracle stable) that runs
directly through the CLI/daemon, in CI, for $0.

**Approach.**

- A sibling, model-free smoke lane inside (or beside) `@tepegoz/agent-eval` that drives the existing
  ToolGateway PEP directly — `browser_click`, `browser_type`, `browser_select`, etc. — with fixed
  arguments against local fixture pages, asserting page-emitted, run-scoped events (the exact discipline
  the existing fixture registries already use for the paired-arm sweeps), with **no LLM call and no API
  spend**.
- Borrow the seeded-matrix technique for perception-robustness regression coverage that today only comes
  from the `ai-agent` funded sweeps: derive N DOM shape variations from a seed, keep the task and
  the success oracle fixed, and make a failing seed reproducible and promotable into a named regression
  case — mirroring BrowserSkill's own "turn a user badcase into a regression" workflow.
- **Why this matters for the anti-debt ledger specifically:** some of what currently sits behind
  `ai-agent`'s "⏸ funded sweep" genuinely needs a paired LLM-reasoning comparison and cannot move
  for free. But a slice of it — "does the click/fill/select _primitive_ work correctly across N DOM
  shapes" — is not a model question at all, and could be discharged for $0 rather than waiting on the
  budget. This workstream does not claim to close any S-phase's sweep; it proposes the free lane that
  could shrink what a future funded sweep still has to cover.
- **What stays exactly as designed:** `@tepegoz/agent-eval`'s ground-truth task-success scoring, the
  statistical constitution, Wilson CIs, and the frozen fixture registries are untouched — this is an
  additional lane, not a replacement.

**New/changed packages:** extends `@tepegoz/agent-eval` (or a new small sibling package, e.g.
`@tepegoz/agent-eval-fixtures`, if the two lanes turn out to want different lifecycles); no
security/policy changes — this is test infrastructure.

**ADR:** none — an eval-infrastructure addition, not a product or security decision.

**DoD shape (draft):**

- [ ] A model-free smoke case runs a fixed tool-call sequence through the real ToolGateway PEP against a
      local fixture and asserts a page-emitted, run-scoped event — no LLM call in the path
- [ ] At least one seeded DOM-variation case exists (mirroring `generated-form`) with a documented seed
      and a stable oracle across variations
- [ ] A run that cannot produce independent evidence for a claim reports `unverified`, never `passed` —
      the corpus's own honesty rule, asserted by a test that deliberately withholds evidence
- [ ] Wired into CI as a fast, zero-cost gate, separate from the funded `ai-agent` sweeps
- [ ] i18n: none expected (internal test infrastructure); confirm during review

---

## Backlog (named, not written up)

- **`--redact-values`-style form-value masking for any future action-level audit trail.** BrowserSkill
  masks recorded form values as `[filled]`/`[empty]` in trace bundles. Tepegöz's Journal/audit redaction
  is already general-purpose; if a future session adds form-fill-level detail to an audit entry, apply
  the same masking discipline then — not worth a standalone workstream today.
- **`bsk status`/`bsk doctor`/`bsk browsers`-equivalent connection/session diagnostics.** Small,
  genuinely useful, and it already has a home: fold into [`developer-settings-surface.md`](../tracks/developer-settings-surface.md)
  / `tepegoz://developer` (ADR-0041) the next time that surface is touched, rather than opening a new
  track item for it.

---

## Routing — what this track does not own

Per the existing convention ([`../README.md`](../../phases/README.md#routing--what-stays-out) /
[`ai-agent/README.md`](../../phases/ai-agent/README.md#routing--what-stays-out)), reference these,
never duplicate them:

| Stays with                               | Material                                                                                                                                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Phase 1b**                             | The MCP **server** surface itself — P1 adds Agent-Window + borrow-consent on top, does not invent the surface                                                                                    |
| **`aipex-agent-parity.md` P1**           | The `@tepegoz/mcp-server` design — Bearer + rate-limit + per-token scope + mandatory PEP re-pass — this track's P1 builds on it, not around it                                                   |
| **`webbrain-agent-parity.md` P3-d**      | Read-only console/network diagnostics — this track only cites BrowserSkill's verified numeric bounds as a reference default                                                                      |
| **`webbrain-agent-parity.md` P9-a / S2** | Observation token-cap flags — already covered, more aggressively, by diff/elision + `cache-window.ts`                                                                                            |
| **`ai-agent` backlog**                   | True parallel background runs — P1 cites BrowserSkill's concurrency/isolation shape for when that item opens, does not open it                                                                   |
| **Phase 6**                              | Deterministic, model-free replay (`macro-engine`/`recipe-compiler`) — BrowserSkill's trace-bundle + LLM replay is explicitly **not** adopted (Ground rules #4)                                   |
| **Phase 7**                              | Notary / Replay Receipts — written and tested but **not wired into `apps/desktop`**, so it produces no working receipt today; no BrowserSkill equivalent exists either way, nothing to reconcile |
| **ADR-0026 / 0029**                      | `execute_js` / DevTools boundary — Ground rules #1 keeps it closed                                                                                                                               |
| **ADR-0006**                             | Pre-model deterministic PolicyKernel — Ground rules #2 keeps the calling-model-decides pattern out                                                                                               |
| **`developer-settings-surface.md`**      | CLI-style connection/session diagnostics — Backlog item, fold in there                                                                                                                           |

## ADRs owed (numbers assigned when a session actually opens one of these)

- **P1:** the same MCP-server ADR Phase 1b's DoD already records as owed (the addendum
  `aipex-agent-parity.md` P1 already names) — this track adds the Agent-Window and fail-closed
  borrow-consent clauses to it, no new number.
- **P2:** an addendum to **ADR-0039** (user-granted sensitive capabilities) — completion-criteria,
  re-arm, and the explicit unattended-kill-switch restatement at the handoff layer.
- **P3:** none — a sharpening of ADR-0008/S2's existing perception contract.
- **P4:** none — a new tool through the existing `docs/adding-a-tool.md` checklist.
- **P5:** none — eval-infrastructure addition, not a product or security decision.

No number is reserved here; per this repo's own multi-profile-track lesson
([`multi-profile-isolation.md`](../tracks/multi-profile-isolation.md) — an ADR-number collision from writing a
plan too far ahead of when it's actually opened), the number gets assigned at the point a session
actually starts the work, not now.
