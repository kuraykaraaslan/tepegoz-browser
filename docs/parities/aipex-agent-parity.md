# Track — AIPex agent-capability parity

**Status:** 📋 **Proposed — not scheduled (2026-09-01).** No branch, no ADR number reserved, no owner
sign-off. This is a captured gap list in the shape of
[`browser-settings-feature-gap.md`](../tracks/browser-settings-feature-gap.md),
[`omnibox-competitive-parity.md`](omnibox-competitive-parity.md) and
[`webbrain-agent-parity.md`](webbrain-agent-parity.md): every row names its nearest existing Tepegöz
behaviour and a suggested phase home, so a future session can promote a row into a real `phase-*.md`
task or an `ai-agent` PR without re-deriving the comparison.

**Source:** a same-session deep read of `.junk/aipex` (`@aipexstudio/root` **0.0.2** — the monorepo
"new-aipex" refactor branch of **AIPex**, a shipping, **MIT-licensed** Chrome/Edge MV3
browser-automation extension whose store build is `manifest.json` version 2.2.39; the reviewed branch
compiles **34 tools** in its default bundle, has no `use-cases` package, and its own `migration/`
folder honestly counts the gaps against the ~70–82-tool store product) against this repo's AI surface
(`phases/ai-agent/`, `packages/orchestrator|model-gateway|capability-plane|security-policy|
agent-runtime|browser-tools|web-tools|tool-executor|local-inference|model-catalog|mcp-client|
recipe-compiler|macro-engine|notary|credential-vault|human-input`, `extensions/ext-agent`). The prose
comparison this track distills is [`docs/others/tepegoz-vs-aipex.md`](../versus/tepegoz-vs-aipex.md)
(Turkish, 2026-09-01); this file is the durable English track artifact. Key claims were re-verified
against source: `packages/core/src/agent/aipex.ts` (the `@openai/agents` loop), `config/ai-providers.ts`,
`conversation/compressor.ts`, `packages/browser-runtime/src/tools/index.ts` (`allBrowserTools`),
`automation/snapshot-manager.ts` + `iframe-manager.ts`, `ws-bridge/ws-mcp-server.ts`,
`mcp-bridge/src/daemon.ts` + `README.md`, `lib/vm/skill-api.ts` + `url-guard.ts`,
`runtime/automation-mode.ts`, `browser-ext/manifest.json` + `lib/ai-provider.ts`, and
`skill/SKILL.md`.

## Why this track exists

The comparison landed on an honest asymmetry: **AIPex is the more _accessible_ agent today — it lives
in the browser you already use, has a key-free cloud path, ships DOM-first perception, runs skill
code, and lets Claude Code / Cursor / a CI job drive your signed-in browser over MCP right now — while
Tepegöz is designed to be the safer, more accountable, Turkish-first one and has not proven it yet.**
Almost none of AIPex's lead requires abandoning Tepegöz's DNA (deterministic Policy Kernel before the
model, one ToolGateway PEP, taint/provenance, Notary replay receipts, non-mutative perception). The
one genuinely new question AIPex raises that Tepegöz has _named but not built_ — **"should external
agents be able to drive the Tepegöz browser through an MCP server?"** — already has a home (Phase 1b's
unbuilt MCP-server DoD line). This track's job is to say, for every AIPex capability the comparison
found: _does Tepegöz already have a seam for this, and if not, what would the Tepegöz-conformant
version look like_ — never "port the JS," always "re-derive the capability inside the existing
kernel/PEP/i18n/coverage discipline."

## How to read this

Each workstream below is written like an `ai-agent` phase section (Goal → Approach → new/changed
packages → ADRs owed → DoD-shaped bullets) so it can be lifted into a real phase file with minimal
rewriting. **Nothing here is committed roadmap.** Where a capability already has a named home in an
existing phase, an ADR, or the sibling [`webbrain-agent-parity.md`](webbrain-agent-parity.md) track,
this track says so explicitly and does **not** re-describe it — it only adds the detail the AIPex
reading surfaced that the existing text doesn't have yet. Per the "Already planned — do NOT
re-propose" rule in [`../README.md`](../../phases/README.md#deferred--adoption-gated-backlog-from-the-beyond-phases-synthesis),
**MCP server** (Bearer + rate-limit + Policy re-pass), vision fallback, local-SLM and cross-model
Context Package are **Phase 1b**; the managed zero-setup cloud default is **Phase 3** — several rows
below are "sharpen Phase 1b / Phase 3 with this detail," not "add a phase." AIPex and Tepegöz
independently converged on DOM/a11y-first perception with vision as fallback; that row is noted, not
worked.

## Ground rules — parity, not imitation

Six AIPex design choices are **deliberately not being matched**, because matching them would violate a
standing decision this repo already made after deliberation. Naming them here once, so no future
session re-proposes them by accident:

1. **No `execute_skill_script` / in-page code runtime.** AIPex runs untrusted skill scripts in a
   QuickJS WASM sandbox (`packages/browser-runtime/src/lib/vm/`), exposing `SKILL_API` with `fs`
   (full ZenFS read/write), `fetch`, `downloadFile`, and `registerTool`. ADR-0026 already measured the
   isolated-world sandbox path (**refuted**) and S9 ships skills as **prompt templates only, by
   explicit written design** ("cannot start itself", "cannot be weaponized"). The defensible next
   increment — a skill that _declares_ a narrow, SSRF-guarded, redirect-refusing HTTP tool — is
   already routed to [`webbrain-agent-parity.md`](webbrain-agent-parity.md) **P5 (extends S9)**.
   AIPex's `lib/vm/url-guard.ts` (RFC1918 + `169.254.169.254` + IPv6 ULA/link-local blocklist,
   `redirect: "error"`) is worth citing there as a reference implementation. Do **not** add a code
   interpreter.
2. **No page mutation for reference stability.** AIPex's `SnapshotManager` writes a
   `data-aipex-nodeid` attribute into the live DOM (via CDP `DOM.resolveNode` + `Runtime.callFunctionOn`)
   so element UIDs survive across snapshots. S2's identity-stable refs are **non-mutative by design** —
   the page is never modified to make the agent's bookkeeping easier. Keep them that way; diff/elision
   already solves cross-snapshot stability without touching the page.
3. **No unauthenticated local control port.** AIPex's `aipex-mcp-daemon` (`mcp-bridge/src/daemon.ts`)
   listens on `ws://127.0.0.1:9223` with **only a CSWSH Origin check** — it accepts any Node process
   (no `Origin` header) and any `chrome-extension://` origin, with **no token on the socket** — so any
   local process can call 30+ browser tools with no consent. Tepegöz's MCP-server surface (workstream
   P1) must require a Bearer token, rate-limit per client, and re-run **every** delegated call through
   `zod → PolicyKernel → HITL → audit`. The port is not the trust boundary; the PEP is.
4. **No always-on `computer` coordinate tool.** AIPex's default bundle includes `computer` — an
   Anthropic-computer-use-style pixel-space `left_click`/`type`/`scroll`/`key`/`left_click_drag`/`hover`
   tool. Coordinate action in Tepegöz stays coupled to **S10 vision escalation** (set-of-marks,
   escalation-only, inert today because it was never wired — Reactor's optional `captureVision`
   callback has no production caller; there is no `TEPEGOZ_VISION` flag, see the 2026-09-02 correction
   in [`phase-s10-vision-escalation.md`](../../phases/ai-agent/phase-s10-vision-escalation.md)) and must
   resolve the _actual target frame's host_ before
   the Policy Kernel grants (fail closed). It is not a standing tool in the default surface, and
   `ai-agent`'s "Never" list already forbids screenshots-every-step.
5. **No vendor agent SDK for the loop.** AIPex's agent core (`packages/core/src/agent/aipex.ts`) is
   built directly on `@openai/agents` `run()` (`maxTurns: 2000`, `stream: true`,
   `callModelInputFilter` for screenshot shaping), with planning done at the prompt level ("Enhanced
   Planning Framework + ReAct", TODO list, `TASK_COMPLETE` marker). `ai-agent`'s "Never" list
   already forbids vendor agent SDKs (`browser-use`/`nanobrowser` = _port techniques, never adopt_).
   The typed Planner→Executor→Reactor with a typed `Decision` stays.
6. **No web-page-reachable extension surface.** AIPex's `manifest.json` declares `externally_connectable`
   for `claudechrome.com`, `aipex.ing` and `http://localhost:*/*`, and a matched site can push
   `REPLAY_USER_MANUAL` steps into the extension. Tepegöz's renderer stays untrusted and there is **no
   page → agent channel**; `createWindow()` and the typed `contextBridge` are the only surface.

None of these are "AIPex did it wrong" — AIPex is an MV3 extension with no native process and no
policy kernel, and its `migration/` folder shows the team reasoning about the same trade-offs and
landing differently because their substrate is different. The point of naming them is that a future
reader of this track shouldn't reopen a decision that was already made for a documented reason.

---

## Capability inventory

Legend for **Home**: an existing phase/ADR name (or a `webbrain-agent-parity.md` workstream) means
"already planned, this row sharpens it, no new phase needed." **NEW** means no existing plan owns it
and this track proposes one. **Ground rules #N** means deliberately not matched.

| #   | AIPex capability                                                                                                                                                                                          | Nearest Tepegöz behaviour today                                                                                                                                                                     | Gap                                                                                                    | Home                                                                                                         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| 1   | MCP **server** — Claude Code / Cursor / Claude Desktop / Windsurf / VS Code Copilot delegate a task to your signed-in browser via `aipex-mcp-bridge` (stdio) + a shared local daemon; ~30 tools published | MCP **client** only (ADR-0018); external tools consumed through the one PEP; **no server surface**                                                                                                  | The opposite direction + a delegation transport that keeps the PEP in the loop                         | **Phase 1b** (already planned — "MCP server: Bearer + rate-limit + Policy re-pass"); **P1** sharpens its DoD |
| 2   | `browser-cli` / `aipex-cli` — terminal + CI drive the same runtime as MCP and the side panel                                                                                                              | No headless / CLI entry to the agent tool surface                                                                                                                                                   | A terminal/CI client on the same delegated, policy-gated path                                          | **P1** (same surface as the MCP server)                                                                      |
| 3   | Unauthenticated local control port — any local process → 30+ tools, CSWSH-Origin-checked only, no token                                                                                                   | No open local port; every call runs `zod → policy → HITL → audit`                                                                                                                                   | — (AIPex weakness)                                                                                     | **Ground rules #3** — P1's surface requires Bearer + rate-limit + full PEP re-pass                           |
| 4   | 15 provider cards / 3 real provider types (`openai`/`claude`/`google`) / a `custom` generic OpenAI-compatible card / model list fetched dynamically from `claudechrome.com/api/models`                    | 8 hand-written adapters; model ids hardcoded per provider                                                                                                                                           | A generic OpenAI-compatible card + a refreshable model catalog                                         | **`webbrain` P1 + Phase 3** (already planned); **P3** adds the dynamic model-list fetch + the `custom` card  |
| 5   | Zero-setup proxy — `claudechrome.com/api/ai`, session-cookie auth, `deepseek/deepseek-chat-v3.1` default; no key needed                                                                                   | BYO-key only; no key = no run                                                                                                                                                                       | A managed cloud default                                                                                | **Phase 3** (already planned — "works without the user entering a key")                                      |
| 6   | `search_elements` — glob/grep over the a11y tree → stable `uid` → `click`/`fill_element_by_uid`/`hover_element_by_uid`                                                                                    | DOM/a11y-first perception (ADR-0008); identity-stable refs + diff/elision (S2, `TEPEGOZ_PERCEPTION_V2`)                                                                                             | — (independent convergence; both cite token + latency)                                                 | **S2** (already planned) — no work, convergence noted                                                        |
| 7   | `data-aipex-nodeid` written into the live DOM for cross-snapshot UID stability                                                                                                                            | Non-mutative identity-stable refs + diff (S2)                                                                                                                                                       | — (Tepegöz deliberately non-mutative)                                                                  | **Ground rules #2** — not adopted                                                                            |
| 8   | Frame reach — `iframe-manager` CDP frame-merge, open + closed shadow-DOM piercing, Monaco/CodeMirror/ACE editor-model text via `get_editor_value`                                                         | Light-DOM-only perception (ADR-0008 / S2)                                                                                                                                                           | Frame + shadow-DOM reach; editor-model text (not rendered DOM)                                         | **`webbrain` P3-b (extends S2)**; **P2** adds the editor-content reader                                      |
| 9   | CDP-free DOM-snapshot library (`@aipexstudio/dom-snapshot`) — pure DOM walk, same node-id, glob search, same-origin iframe traversal                                                                      | `build-dom-tree-script` is already an injected DOM walk (not a CDP AXTree dump)                                                                                                                     | A no-CDP fallback strategy for when `debugger` attach fails or is contested                            | **P4 (NEW, small — extends `@tepegoz/browser-tools`)**                                                       |
| 10  | `computer` — Anthropic-computer-use-style pixel `click`/`type`/`scroll`/`key`/`drag` in the default bundle                                                                                                | Coordinate action only via S3 locator cascade / S10 set-of-marks                                                                                                                                    | A standing coordinate tool                                                                             | **Ground rules #4** — coordinate action stays S10-escalation-only                                            |
| 11  | `upload_file_to_input` — CDP `DOM.setFileInputFiles`; file bytes never read into the agent                                                                                                                | `upload_*` tools + CDP file-input binding already ship (Phase 2c)                                                                                                                                   | The "never read the bytes" technique, made explicit                                                    | **P4 (NEW, small — sharpen `@tepegoz/uploads`)**                                                             |
| 12  | `capture_screenshot(sendToLLM)` + `computer` as `[HIGH-COST FALLBACK]`; roadmap Vision `[ ]` unchecked                                                                                                    | S10 vision escalation ships **inert** — never wired, not flag-gated (Reactor's `captureVision?` callback has no production caller; correction dated 2026-09-02 in `phase-s10-vision-escalation.md`) | A usable fallback today — and on the Tepegöz side wiring work is still owed, not just a switch to flip | **S10 / Phase 1b** (already planned)                                                                         |
| 13  | `execute_skill_script` — QuickJS WASM sandbox (100 MB / 1 MB stack), ZenFS, `SKILL_API` `fs`/`fetch`/`downloadFile`/`registerTool`                                                                        | Skills = saved prompt templates only, "cannot be weaponized" (S9; ADR-0026/0027)                                                                                                                    | Code execution                                                                                         | **Ground rules #1** — not adopted; skill-declared _HTTP tools_ → `webbrain` P5                               |
| 14  | `SKILL_API.fetch` SSRF guard (`lib/vm/url-guard.ts` — RFC1918 + `169.254.169.254` + IPv6 ULA/link-local, `redirect: "error"`)                                                                             | `@tepegoz/web-tools` content guard + SSRF-safe sitemap reader                                                                                                                                       | —                                                                                                      | **`webbrain` P5 / S6** — cite `url-guard.ts` as a reference implementation                                   |
| 15  | Built-in skills `wcag22-a11y-audit`, `ux-audit-walkthrough`, `skill-creator-browser`                                                                                                                      | Skill library = saved prompt templates (S9)                                                                                                                                                         | Audit-shaped prompt templates                                                                          | **Backlog** — buildable under S9 as-is (templates, no code)                                                  |
| 16  | Agent-initiated `request_intervention` (captcha/2FA/ambiguity); auto-cancel on tab-switch / navigation; `passive`/`disabled` chat modes                                                                   | Human Handoff Controller + deterministic two-stage HITL (ADR-0013 / 0039); captcha = handoff, 2FA = broker                                                                                          | — (Tepegöz's is deterministic, not agent-asked)                                                        | **S6 / S8** — nothing to port; the auto-cancel-on-nav UX detail → **Backlog**                                |
| 17  | `@openai/agents` `run()` loop, `maxTurns: 2000`, prompt-level ReAct + `TASK_COMPLETE` marker                                                                                                              | Typed Planner→Executor→Reactor, typed `Decision`, `CompletionEvidence` (S0–S4)                                                                                                                      | — (vendor SDK vs typed machine)                                                                        | **Ground rules #5** — vendor agent SDK not adopted                                                           |
| 18  | `success:false` surfaced as `tool_call_error`; no completion evidence; roadmap `[ ] Evaluation - Online-Mind2Web`                                                                                         | `CompletionEvidence` + deterministic downgrade + trap fixtures + Checked/Contradicted badges (S4)                                                                                                   | — (AIPex weakness)                                                                                     | **S4** — nothing to reconcile                                                                                |
| 19  | Long-run durability from a mature library (maxTurns 2000, `session`, `rollbackLastAssistantTurn`, `interrupt`/`regenerate`)                                                                               | Single run, serialized, no checkpoint-resume (ADR-0013)                                                                                                                                             | Durable / parallel runs                                                                                | **`ai-agent` backlog + Phase 1b** (already named)                                                            |
| 20  | `focus` / `background` automation mode — a tool-surface filter (`filterToolsByMode` drops `computer` + screenshot tools in background)                                                                    | `ask`/`act`/`auto` autonomy + deny hard-blocks; no tool-surface trim by mode                                                                                                                        | A visual-tool trim for headless / background runs                                                      | **S8 / `webbrain` P8** — small, fold into tool-surface tiering                                               |
| 21  | `ConversationCompressor` — item-count / token-watermark trigger, `expandForToolCallClosure` keeps tool pairs whole                                                                                        | `cache-window.ts` lag-2 breakpoints + reactor working-state collapse                                                                                                                                | — (AIPex's own ledger calls it "intentionally simpler")                                                | **S1 / S7 + `webbrain` P9-a** — already routed                                                               |
| 22  | `externally_connectable` (`claudechrome.com`, `http://localhost:*`) + site-pushed `REPLAY_USER_MANUAL` steps                                                                                              | Renderer untrusted; no page → agent channel                                                                                                                                                         | —                                                                                                      | **Ground rules #6** — not adopted                                                                            |
| 23  | Voice input (Web Speech API only in this branch; legacy had 3-tier STT + ElevenLabs)                                                                                                                      | Nothing (voice HITL is Phase 10b)                                                                                                                                                                   | Real but niche                                                                                         | **Backlog** (Phase 10b candidate)                                                                            |
| 24  | `fake-mouse` visual cursor — focus-mode "the agent is acting here" feedback                                                                                                                               | `@tepegoz/human-input` real Catmull-Rom motion curves (different purpose — anti-bot, not feedback)                                                                                                  | An "agent is acting here" affordance                                                                   | **Backlog** (S8 delight)                                                                                     |
| 25  | `migration/` folder — an honest, itemized gap ledger (70→32 tools, voice degraded, `use-cases` absent)                                                                                                    | PROSE-LEDGER + `eval-results.md` + the statistical constitution                                                                                                                                     | — (both honest; different apparatus)                                                                   | n/a                                                                                                          |
| 26  | `en` + `zh` locale only; no Turkish README, locale, or adapter; Chinese-first heritage in comments                                                                                                        | EN + full TR parity enforced per package (ADR-0016); ≥10 Turkish-web H2H tasks required                                                                                                             | — (Tepegöz ahead)                                                                                      | n/a                                                                                                          |

---

## P1 — MCP server surface + governed delegation transport (sharpen Phase 1b)

**Goal.** Let external agents (Claude Code, Cursor, Claude Desktop, a CI job) delegate a task to the
Tepegöz browser — AIPex's single shipped, genuinely-useful differentiation — **without** copying the
part that makes AIPex's version unsafe: a local socket that any process can drive with no token and no
consent. In Tepegöz's version the transport is plumbing; the trust boundary stays the one ToolGateway
PEP.

**What AIPex actually built (verified).** `aipex-mcp-bridge` is a stdio MCP server that external
agents register (`npx -y aipex-mcp-bridge`). It auto-spawns `aipex-mcp-daemon`
(`mcp-bridge/src/daemon.ts`) on `ws://127.0.0.1:9223` with three paths — `/extension` (the AIPex
extension connects here as a WS _client_), `/bridge` (MCP bridge instances), `/cli` (`browser-cli` /
`aipex-cli`). `tools/list` returns a **static** `toolSchemas` array; `tools/call` is forwarded to the
extension, which runs `allBrowserTools` via `browserTool.invoke({}, JSON.stringify(args))` — **no
policy check, no HITL, no audit**, a flat 60 s timeout. Security is a CSWSH `Origin` check only
(`isOriginAllowed`): no `Origin` header (Node clients) and `chrome-extension://` are allowed, `http(s)`
origins rejected, bind is `127.0.0.1`, idle auto-shutdown after 30 s. **There is no token on the
socket.** `browser-cli` adds human-friendly command groups (`tab`, `page`, `interact`, `download`,
`intervention`, `skill`) over the same daemon.

**Approach.**

- **A `@tepegoz/mcp-server` package** (sibling to `@tepegoz/mcp-client`, Electron-free, host seam
  injected) that exposes a _bounded, explicitly published_ subset of the CapabilityRegistry to
  external callers. It advertises tool schemas from the **same registry** the internal agent uses, so
  there is one source of truth for names, danger classes, and zod argument schemas.
- **Every delegated call re-enters the one PEP.** `lookup → idempotency → zod safeParse → PolicyKernel
→ HITL → execute → audit` runs unchanged for a call that arrived over the server transport — a
  delegated `browser_type` is indistinguishable, from the ToolGateway's point of view, from a
  model-issued one. `isSensitiveSite` still hard-denies at every autonomy level. This is the whole
  point of ADR-0007's "one tool plane".
- **Auth + rate-limit on the transport, not instead of the PEP.** A per-client Bearer token
  (generated in Settings, stored via `safeStorage`, shown once), a `MAX_CALLS_PER_MINUTE` ceiling per
  client, and a per-token capability scope (which tool danger classes this token may even request).
  Contrast AIPex's zero-auth socket explicitly in the ADR so the reasoning is on record.
- **Unattended delegation fails safe.** A delegated call that would trigger a HITL escalation with no
  human present is **denied**, exactly as `@tepegoz/tasks`'s background runner already does for
  scheduled runs — the external agent gets a typed `AppError`, not a silent auto-approve.
- **A `tepegoz` CLI** (the `browser-cli` analog) that speaks to the same `@tepegoz/mcp-server` surface
  over the same authenticated transport — terminal and CI use the identical policy-gated path, never a
  side door.
- **Transport shape:** a local stdio MCP server for the `npx`/`claude mcp add` ergonomics AIPex has,
  plus optionally a loopback WS bound to `127.0.0.1` **with the Bearer token required on connect**
  (not merely an Origin check). No `externally_connectable`-style web-page reachability (Ground rules
  #6).
- **What stays exactly as designed:** the CapabilityRegistry, the PolicyKernel, the two-stage HITL,
  `EgressFirewall`, `TaintTracker`, and the audit journal are untouched — a delegated call is just a
  new _caller_, not a new _code path_.

**New/changed packages:** a new `@tepegoz/mcp-server` (registry publication + transport + auth +
rate-limit), a new `@tepegoz/cli` or an `apps/` bin for the terminal client, `@tepegoz/capability-plane`
(a "published externally" flag per descriptor — no PEP changes), `extensions/ext-agent` +
`@tepegoz/preferences` (token generation UI + a live "external agents connected" indicator).

**ADR:** this is the ADR Phase 1b's DoD already records as owed for the MCP-server surface — write it
as **"MCP server (ADR-0018 addendum, or its own number when Phase 1b opens it)"**, covering: the
bounded published subset, Bearer + rate-limit + scope, the mandatory PEP re-pass for every delegated
call, unattended fail-safe-deny, and the explicit rejection of AIPex's unauthenticated-port model.

**DoD shape (draft, for whichever session promotes this):**

- [ ] A delegated `tools/call` arriving over the server transport produces the **same** audit-journal
      entry shape, the same `PolicyKernel` decision, and the same HITL prompt as a model-issued call —
      proven by a test that runs one tool both ways and diffs the journal
- [ ] A connection without a valid Bearer token is refused at the transport before any tool schema is
      disclosed (deny-by-default; `tools/list` is not anonymous)
- [ ] A delegated call on a sensitive site (`isSensitiveSite`) is hard-denied at every autonomy level,
      same as an internal call
- [ ] A delegated call that would need an unattended HITL approval returns a typed `AppError`, never
      an auto-approve (the `@tepegoz/tasks` background-runner precedent)
- [ ] Rate-limit: the `N+1`-th call within the window is rejected with a retry hint, per client token
- [ ] The `tepegoz` CLI drives a real task end-to-end over the authenticated transport with no
      code path the internal agent doesn't also use
- [ ] i18n: token-generation flow, the "external agents connected" indicator, and every new
      `AppError` message get EN + TR parity in the owning package's dict (ADR-0016)
- [ ] Gated behind Phase 1b's MCP-server line being opened (this track does not open it unilaterally)

---

## P2 — Perception reach: frames, shadow DOM, editor content (sharpen S2 / S3; reuse `webbrain` P3-b)

**Goal.** Match what AIPex's perception actually reads _today_ — cross-origin iframes merged into one
tree, open and closed shadow roots pierced, and the text inside Monaco/CodeMirror/ACE editors — which
Tepegöz's light-DOM-only perception (ADR-0008 / S2) cannot see. The frame + shadow-DOM half of this is
**already `webbrain-agent-parity.md` P3-b (extends S2)**; this workstream exists to (a) confirm the
AIPex reading points at the same gap and (b) add the two pieces P3-b doesn't cover: editor-model text
and a CDP-free fallback.

**What AIPex actually built (verified).** `automation/snapshot-manager.ts` + `iframe-manager.ts` use
CDP `Accessibility.getFullAXTree` per frame, walk `Page.getFrameTree`, and merge child-frame AX trees
into the parent by `backendDOMNodeId`. `smart-locator.ts` extracts editor content from Monaco,
CodeMirror and ACE by reaching their JS model objects (not the rendered DOM, which is virtualized and
incomplete). Cross-snapshot identity is kept by writing `data-aipex-nodeid` into the DOM — which
Tepegöz will **not** do (Ground rules #2).

**Approach.**

- **Frames as addressable scopes, not a new tool family.** Extend S2's identity-stable ref model so a
  `<iframe>` is an enumerable, addressable target and `readPage`/`snapshotElements` can be scoped to
  it — conceptually a nested perception scope, addressed the way `tab_*` addresses tabs, not a
  parallel `iframe_click`/`iframe_type` surface. This is exactly `webbrain` P3-b; do it once, there.
- **Open shadow roots in the existing injected walk.** `build-dom-tree-script` already walks the DOM;
  extend it to descend open `shadowRoot`s in the same pass. **Closed** roots need CDP and are a
  documented Full-tier fallback (matching AIPex's own Chrome-only split), not a v1 requirement.
- **`browser_get_editor_value` (NEW, small).** A `dangerClass: 'read'` tool in `@tepegoz/browser-tools`
  that returns the _model text_ of a focused/nominated code editor (Monaco `getModel().getValue()`,
  CodeMirror `state.doc`, ACE `session.getValue()`) via the injected script — with the same
  `wrapUntrustedContent` treatment as `browser_get_page`. No new library. This is the one piece
  neither S2 nor `webbrain` P3-b currently names.
- **Non-mutative throughout.** Refs stay identity-stable by diff/elision, never by writing an
  attribute into the page (Ground rules #2).
- **Frame-host resolution for the Policy Kernel.** When perception (or a future coordinate action)
  targets an element inside a cross-origin iframe, the `PolicyKernel` must resolve the **actual
  target frame's host** for its `requiredHosts` check and fail closed — never grant on the top-level
  page's host. (`webbrain` P3-b already flags this; restate it here because AIPex's own permission
  model has an accepted residual risk exactly here.)

**New/changed packages:** `@tepegoz/browser-tools` (`build-dom-tree-script` shadow-DOM descent +
`browser_get_editor_value`), `@tepegoz/security-policy` (frame-host resolution in the perception/action
path). The iframe-scoping work is `webbrain` P3-b's — this track adds only the editor reader and the
non-mutation constraint.

**ADR:** no new ADR — this is an S2 sharpening (perception scope) plus one small `read`-class tool
through the existing `docs/adding-a-tool.md` checklist. If frame-host resolution turns out to need a
Policy Kernel change beyond a lookup, that is an **ADR-0006 addendum**, shared with `webbrain` P3-b.

**DoD shape (draft):**

- [ ] Perception enumerates same-origin and cross-origin `<iframe>`s as addressable scopes and can
      read/act within a named frame (shared with `webbrain` P3-b — one implementation)
- [ ] Open shadow roots are traversed by the existing injected DOM walk; closed roots degrade to a
      documented Full-tier CDP fallback, not an error
- [ ] `browser_get_editor_value` returns Monaco/CodeMirror/ACE model text (fixture-grounded for at
      least Monaco), `dangerClass: 'read'`, untrusted-content-wrapped, registered through the one
      CapabilityRegistry
- [ ] No `data-*` attribute is written into the page for ref stability — a test asserts the DOM is
      byte-identical before and after a snapshot
- [ ] A coordinate/element action targeting an element inside a cross-origin iframe is granted only
      after the Policy Kernel resolves that frame's host (fail-closed test)
- [ ] i18n: any new user-facing copy (e.g. "reading embedded frame") gets EN + TR parity

---

## P3 — Provider reach: generic OpenAI-compatible card + dynamic model catalog (sharpen `webbrain` P1 + Phase 3)

**Goal.** Close the two provider-reach gaps the AIPex reading surfaces that `webbrain-agent-parity.md`
P1 doesn't already name: (a) a single **generic `custom` card** where "add a provider" is a config
entry, not a code change, and (b) a **refreshable model list** so the model dropdown isn't a hardcoded
array that goes stale. The managed key-free path is **Phase 3**, already planned — cite, don't
rebuild.

**What AIPex actually built (verified).** `config/ai-providers.ts` lists 15 cards but only 3 real
`providerType`s (`openai`/`claude`/`google`); every other card (`openrouter`, `deepseek`, `groq`,
`together`, `mistral`, …) is `providerType: "openai"` and goes through `@ai-sdk/openai-compatible`. A
`custom` card takes `host` + key and needs no code. `browser-ext/lib/ai-provider.ts` builds providers
via the Vercel AI SDK; `createProxyProvider()` points a key-free client at
`claudechrome.com/api/ai` with cookie auth and `PROXY_DEFAULT_MODEL = "deepseek/deepseek-chat-v3.1"`.
The model list is fetched from `claudechrome.com/api/models` (≤200, cached). A stateful SSE transform
(`createEmptyToolArgsFinalizer`) patches parameterless tool calls that some providers stream as
`"arguments":""` — a real, non-obvious quirk worth knowing before writing an OpenAI-compatible
adapter.

**Approach.**

- **`webbrain` P1 owns the `OpenAICompatibleProvider` + provider catalog.** This row does not
  re-describe it. What it adds:
  - **A `custom` catalog entry shape** — `{ baseUrl, authMode, model, visionRegex? }` with no
    provider id of its own — so a user can point Tepegöz at any OpenAI-Chat-Completions endpoint from
    Settings without a new adapter, exactly AIPex's `custom` card. This lands _in_ `webbrain` P1's
    catalog, as one more entry kind.
  - **A refreshable model catalog.** `@tepegoz/model-catalog` already resumable-downloads and
    sha256-verifies GGUF weights; extend the same package (or a sibling) with a small _model-list_
    fetch per provider (llama.cpp `GET /props`, Ollama `GET /api/show`, or a provider's
    `/v1/models`), cache-backed with a stale-OK fallback to the hardcoded list. This is what lets the
    model dropdown reflect reality instead of a frozen array — and it is the piece `webbrain` P1's
    "catalog is a data file" framing assumes but doesn't build.
  - **A known-quirk note for the adapter author:** the `"arguments":""` streaming bug AIPex patches in
    `createEmptyToolArgsFinalizer` will hit Tepegöz's OpenAI-compatible adapter too; handle it in the
    adapter's stream parser, not with a blanket text replace.
- **The managed key-free path is Phase 3.** "Works without the user entering a key" is already a
  Phase 3 line; AIPex's proxy (cookie-auth, a cheap default model) is a concrete reference for what
  that looks like. Do **not** open it here.
- **What stays exactly as designed:** `ModelGateway.complete()`'s mandatory `maxTokens` + `timeoutMs`,
  `TokenLedger` recording, the single `CanonRequest`/`CanonResponse` schema, and `ModelRouter`'s
  capability→tier mapping are untouched — a `custom` catalog entry is just another leaf provider the
  router can select.

**New/changed packages:** `@tepegoz/model-gateway` (the `custom` entry kind + the streaming-quirk
handling — folded into `webbrain` P1's `OpenAICompatibleProvider`), `@tepegoz/model-catalog` (a
model-list fetch alongside the existing weight download), `extensions/ext-agent` /
`@tepegoz/preferences` (a "refresh models" affordance + the `custom` endpoint form).

**ADR:** extends **ADR-0005** (provider-agnostic gateway) — the same addendum `webbrain` P1 already
proposes; this row adds the model-list-refresh and `custom`-card clauses to it, no new number.

**DoD shape (draft):**

- [ ] A `custom` catalog entry (baseUrl + key, no code) passes the existing provider conformance
      tests against a real OpenAI-compatible endpoint
- [ ] The model list for a provider is fetched, cached, and falls back to the hardcoded list on
      failure — a test proves the dropdown still works offline
- [ ] The `"arguments":""` streaming case is handled in the OpenAI-compatible adapter's parser (unit
      test with a captured SSE transcript), not by string replacement
- [ ] `maxTokens` + `timeoutMs` remain mandatory for a `custom`-provider call (the gateway invariant
      is not relaxed for BYO endpoints)
- [ ] i18n: the `custom` endpoint form and "refresh models" copy get EN + TR parity

---

## P4 — Small perception/action technique carve-outs (NEW, small)

Two independent, small additions on top of tools that already ship. Each is `dangerClass: 'read'` or
inherits an existing gate, each registers through the one CapabilityRegistry, each gets a
`docs/adding-a-tool.md` entry and coverage on new pure logic.

### P4-a — CDP file-input upload without reading the bytes

Phase 2c already ships `upload_*` tools with a CDP file-input binding and a sandbox preflight. AIPex's
`upload_file_to_input` makes one thing explicit worth adopting as a stated guarantee: it sets the file
on the `<input>` via CDP `DOM.setFileInputFiles` and **never reads the file contents into the agent's
context**. Make that a written property of Tepegöz's upload path (the bytes go filesystem → CDP → page,
never filesystem → agent → page), assert it in a test, and note it in the tool's docstring — a small
hardening of an existing capability, no new tool.

### P4-b — CDP-free DOM-snapshot fallback strategy

AIPex ships `@aipexstudio/dom-snapshot`: a pure DOM-walk snapshot (same node-id scheme, glob search,
same-origin iframe traversal) with **no CDP dependency**, precisely so perception still works when a
`debugger`/CDP attach is slow, contested, or unavailable. Tepegöz's `build-dom-tree-script` is already
an injected DOM walk rather than a CDP AXTree dump, so Tepegöz is largely on this side of the line
already — but the _fallback discipline_ is worth making explicit: if the CDP-backed path (occlusion
re-check, backend node ids) fails to attach, degrade to the injected-script-only snapshot and mark the
result lower-fidelity, rather than failing the step. Small, additive to `@tepegoz/browser-tools`; no
new library, no ADR.

**DoD shape (draft, both sub-items):**

- [ ] A test proves the upload path never materializes file contents in the agent's message history
      (P4-a)
- [ ] A CDP-attach failure degrades perception to the injected-script snapshot with a fidelity marker,
      rather than throwing (P4-b)
- [ ] i18n: any new "reduced-fidelity page read" notice gets EN + TR parity

---

## Backlog (named, not written up)

- **Audit-shaped skill templates** — AIPex ships `wcag22-a11y-audit` and `ux-audit-walkthrough` as
  skill packages. The _prompt-template_ form of these (a saved instruction the model follows, no code)
  is buildable under S9 exactly as it stands today; worth a small content PR once S9's own sweep
  lands, not a workstream.
- **Intervention auto-cancel on navigation / tab-switch** — AIPex's `InterventionManager` cancels a
  pending human-intervention request when the page navigates or the tab changes, with a typed reason
  (`page_navigated`, `tab_switched`). Tepegöz's Human Handoff Controller could adopt the same
  auto-invalidation as a small robustness detail; fold into whichever session next touches S6/S8 HITL.
- **`background`-mode visual-tool trim** — AIPex's `filterToolsByMode` drops `computer` + screenshot
  tools when the run is backgrounded. This is a natural sub-case of `webbrain-agent-parity.md` P8
  (tool-surface tiering) and S8's backgroundable-runs work — a headless run doesn't need the vision
  surface. Fold into P8, don't open separately.
- **`fake-mouse` "agent is acting here" affordance** — AIPex draws a visual cursor during focus-mode
  automation so the user can see where the agent is clicking. Distinct from `@tepegoz/human-input`
  (real motion curves for anti-bot). A pure S8 delight item; revisit only if UAT shows users lose
  track of what the agent is doing on screen.
- **Voice input** — Web Speech API only in the reviewed branch (legacy AIPex had 3-tier STT +
  ElevenLabs + a WebGL particle visualization). Candidate home: Phase 10b (accessibility/voice) if
  voice HITL lands first; no daily-driver pull demonstrated for this product yet.

---

## Routing — what this track does not own

Per the existing convention ([`../README.md`](../../phases/README.md#routing--what-stays-out) /
[`ai-agent/README.md`](../../phases/ai-agent/README.md#routing--what-stays-out)), reference these,
never duplicate them:

| Stays with                               | Material                                                                                                                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Phase 1b**                             | The MCP **server** surface (P1 sharpens its DoD, does not invent it), vision fallback, split vision provider, local-SLM, cross-model Context Package, durable/parallel runs     |
| **Phase 3**                              | The managed, key-free zero-setup cloud default (AIPex's `claudechrome.com` proxy is the closest analog)                                                                         |
| **Phase 6**                              | Deterministic, model-free replay — AIPex has no equivalent (`replay-controller` is marked "not migrated"; `REPLAY_USER_MANUAL` is a site feature, not a model-free interpreter) |
| **Phase 7**                              | Notary / Replay Receipts — no AIPex equivalent (IndexedDB chat history + token metrics only), nothing to reconcile                                                              |
| **S2**                                   | Identity-stable refs, diff/elision, label resolution — P2 extends the _scope_ (frames, shadow DOM), not the model                                                               |
| **S9**                                   | Skill _templates_ as they exist today; skill-declared HTTP tools are `webbrain-agent-parity.md` P5, not this track                                                              |
| **S10**                                  | Escalation-only vision + set-of-marks — AIPex's `computer` / `capture_screenshot` fallback maps here, not to a standing tool (Ground rules #4)                                  |
| **`webbrain-agent-parity.md` P1**        | The `OpenAICompatibleProvider` + provider catalog — P3 adds the `custom` card and model-list refresh _into_ it                                                                  |
| **`webbrain-agent-parity.md` P3-b**      | iframe + shadow-DOM perception reach — P2 adds only the editor-content reader and the non-mutation constraint                                                                   |
| **`webbrain-agent-parity.md` P5 / P9-a** | HTTP-tool-declaring skills; explicit mid-run compaction — AIPex's QuickJS skills and `ConversationCompressor` map to these, already routed                                      |
| **ADR-0026 / 0029**                      | The `execute_js` / code-execution / DevTools boundary — Ground rules #1 keeps it closed                                                                                         |
| **ADR-0013 / 0039**                      | Two-stage HITL + CAPTCHA/2FA handoff shape — AIPex's agent-initiated `request_intervention` does not revisit it                                                                 |

## ADRs owed (numbers assigned when a session actually opens one of these)

- **P1:** the MCP-server ADR Phase 1b's DoD already records as owed — write it as an **ADR-0018
  addendum or its own number when Phase 1b opens the work**; it must cover the bounded published
  subset, Bearer + rate-limit + per-token scope, the mandatory PEP re-pass for every delegated call,
  unattended fail-safe-deny, and the explicit rejection of AIPex's unauthenticated local-port model.
- **P2:** no new ADR unless frame-host resolution needs a Policy Kernel change beyond a lookup — then
  an **ADR-0006 addendum**, shared with `webbrain-agent-parity.md` P3-b.
- **P3:** the **ADR-0005 addendum** `webbrain-agent-parity.md` P1 already proposes — this track adds
  the `custom`-card and model-list-refresh clauses to the same addendum, no new number.
- **P4:** none — two small carve-outs through the existing `docs/adding-a-tool.md` checklist.

No number is reserved here; per this repo's own multi-profile-track lesson
([`multi-profile-isolation.md`](../tracks/multi-profile-isolation.md) — an ADR-number collision from writing a
plan too far ahead of when it's actually opened), the number gets assigned at the point a session
actually starts the work, not now.
