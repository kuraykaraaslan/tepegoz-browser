# Track — OpenHands (Agent Canvas) agent-capability parity

**Status:** 📋 **Proposed — not scheduled (2026-09-01).** No branch, no ADR number reserved, no owner
sign-off. This is a captured gap list in the shape of
[`browser-settings-feature-gap.md`](../tracks/browser-settings-feature-gap.md) and
[`webbrain-agent-parity.md`](webbrain-agent-parity.md): every row names its nearest existing Tepegöz
behaviour and a suggested phase/ADR home, so a future session can promote a row into a real `phase-*.md`
task or an `ai-agent`/`ADR` PR without re-deriving the comparison.

**Source:** a same-session deep read of `.junk/openhands` (`@openhands/agent-canvas` v1.16.0, MIT-licensed
— "a self-hosted developer control center for coding agents and automations"; README/README.windows/
AGENTS.md, `docs/architecture.md`, `docs/ACP_AGENTS.md`, `docs/DefenseClaw.md`, `docs/SELF_HOSTING.md`,
`specs/{llm-defaults,mcp-settings,backend-management,canvas-extensions}.md`, `config/defaults.json`,
`package.json`, `src/api/{agent-server-adapter,canvas-ui-client-tool,launch-child-conversation-client-tool,
skills-service}.ts`, `src/api/option-service/`, `src/constants/{acp-providers,canvas-ui}.ts`,
`src/components/features/{settings/llm-profiles,settings/mcp-settings,browser,chat}/`,
`src/stores/{browser-store,goal-store}.ts`, `electron/`) against
[`docs/others/tepegoz-vs-openhands.md`](../versus/tepegoz-vs-openhands.md) (the existing Turkish
comparison, itself sourced the same way) and this repo's AI surface (`phases/ai-agent/`,
`packages/{orchestrator,model-gateway,capability-plane,security-policy,agent-runtime,browser-tools,
web-tools,tool-executor,mcp-client,tasks,credential-vault,persistence}`, `extensions/ext-agent`,
`docs/adr/*`). Several claims in the comparison doc were re-verified directly against this repo's source
for this track rather than taken on faith — notably ADR-0018's stdio-only transport and deferred config
UI, `@tepegoz/tasks`' already-schema'd-but-disabled `external` trigger, and S9's flat skill-store shape
(see the workstreams below for the exact citations).

## Why this track exists

The comparison this track distills landed on the **most asymmetric pairing in the whole `tepegoz-vs-*`
series — more lopsided than even Kilo Code's**. OpenHands Agent Canvas is not a coding agent, let alone a
browser agent: it is a **control center / host** that runs someone else's agent (its own
`software-agent-sdk`, or an external ACP agent — Claude Code, Codex, Gemini CLI) on a local, Docker, VM,
or cloud backend, schedules it, and manages parallel conversations. The agent loop, tool executor,
system-prompt construction, context compaction, and prompt-injection defense all live **outside this
repository**, in `software-agent-sdk` or inside whichever ACP agent is plugged in — `AGENTS.md` says so
explicitly ("this repo is only the agent-canvas frontend"). Tepegöz is the opposite kind of thing: a
security-by-design native browser with **one** built-in orchestrator (Planner→Executor→Reactor) that
reads pages, clicks, types, and completes tasks through a model-pre-gating deterministic kernel. Most of
what makes Canvas look impressive — the LiteLLM provider bridge, the embedded VS Code/terminal/git-diff
workspace, the ACP multiplexer itself — is either **already routed to an existing Tepegöz seam** (the
provider-breadth axis is `webbrain-agent-parity.md` P1's job, not a new one) or **category-specific to
being a coding-agent host**, and does not survive translation into "what should a browser agent do."

What _does_ survive, once the category noise is stripped out, is narrower and more useful than the raw
30-row comparison table suggests: Canvas's **MCP client configuration maturity** (transports, auth modes,
a real add/edit/remove UI) is genuinely ahead of Tepegöz's read-only, stdio-only Phase-1a slice; its
**automations** (cron/webhook-triggered runs) are a real capability `@tepegoz/tasks` has already reserved
a schema slot for and left switched off; and its **bundled-skill-with-keyword-trigger** model is a
genuinely different (and reasonable) activation mechanism from the explicit `load_skill` call S9 ships
today. One more thing is worth stating plainly because a reader of the raw comparison could miss it:
Canvas's own "event-sourced conversation" framing is not a gap to close — it is a **less rigorous cousin**
of a pattern Tepegöz already ships and has an ADR for. [ADR-0004](../../docs/adr/0004-event-sourced-journal.md)'s
append-only Event Journal (monotonic `lsn`, `deviceId` sync key, correlation id, redacted payload, a
`cas://` content-addressed blob store for anything large, deterministic fold-replay with **no LLM
re-call**) is the same idea Canvas gestures at, done more precisely, verified in this repo — whereas
Canvas's actual event store lives server-side in `software-agent-sdk`, which this comparison never reached.
This track's job, for every remaining Canvas capability the comparison found: does Tepegöz already have a
seam for this, and if not, what does the Tepegöz-conformant version look like — never "port the ACP
protocol," always "re-derive the capability inside the existing kernel/PEP/i18n/coverage discipline."

## How to read this

Each workstream below is written like an `ai-agent` phase section (Goal → Approach → new/changed
packages → ADR owed → DoD-shaped bullets) so it can be lifted into a real phase file or ADR PR with
minimal rewriting. **Nothing here is committed roadmap.** Where a capability already has a named home in
an existing phase, ADR, or another track (most often `webbrain-agent-parity.md`, which already claimed
the provider-breadth and context-compaction axes), this track says so explicitly and does **not**
re-describe it — it only adds the detail this comparison surfaced that the existing text doesn't have
yet. Per the "Already planned — do NOT re-propose" rule in
[`../README.md`](../../phases/README.md#deferred--adoption-gated-backlog-from-the-beyond-phases-synthesis) and
`ai-agent/README.md`'s own [Routing](../../phases/ai-agent/README.md#routing--what-stays-out) /
backlog table, several rows below are "cite the existing seam," not "add a phase."

## Ground rules — parity, not imitation

Four things Canvas does are **deliberately not being matched**, either because they contradict a standing
decision or because they do not survive the category difference. Naming them here once, so no future
session re-proposes them by accident:

1. **No opaque, pluggable third-party agent engine.** Canvas's `agent_kind` setting lets the same UI drive
   OpenHands' own SDK agent **or** an external ACP agent (Claude Code, Codex, Gemini CLI, or any custom
   Agent-Client-Protocol stdio server) — the tool-calling loop, and every tool-use decision inside it,
   happens **inside that opaque process**, not in Canvas. Tepegöz cannot adopt this shape without breaking
   the thing ADR-0006 and ADR-0013 exist to guarantee: a **model-pre-gating deterministic Policy Kernel**
   that sees every tool call before it executes, with no security decision delegated to the model or to
   an opaque subprocess. The legitimate overlapping goal — "let a capable external agent drive Tepegöz" —
   is not being rejected; it already has a conformant home, and a more specific trust model than ACP's:
   **Phase 1b's own planned MCP server surface**, which exposes `browser_*`/`tab_*`/`dom_*` tools to an
   external client (its own DoD line names "Claude/ChatGPT/Cursor") over Bearer auth + rate-limit, with
   **every call re-passing the same Policy Kernel** the internal agent obeys. That is the ACP idea, done
   through the one PEP instead of around it. See workstream context below and the Routing table.
2. **No remote backend registry.** Canvas's core value proposition — connect one frontend to a local /
   Docker sandbox / VM / OpenHands Cloud backend, health-probed and switchable — assumes the frontend and
   the agent process are separable and possibly remote. Tepegöz is a single local native application; the
   "backend" **is** the app. There is no analogous surface to build, not because the idea is rejected but
   because the premise does not apply. If a future need for a governed _remote_ agent target ever
   materializes, that is [Phase 9](../../phases/product/phase-9-safe-autonomy-delegation.md)'s
   transaction-mandate / signed-policy-bundle / governed-endpoint territory — a very different trust model
   from Canvas's health-probed switcher — not this track's to propose.
3. **No in-app coding workspace.** Files-with-git-diff, an embedded terminal (`xterm`), an embedded VS
   Code (`openvscode-server`), and planner/tasklist tabs are Canvas's core UI and make no sense for a
   browser agent. The nearest thing Tepegöz has to any of this — a model-callable code-execution or
   arbitrary-DOM-mutation tool — was already measured and explicitly rejected: ADR-0026 (the proposed
   isolated-world sandbox was **refuted** by measurement) and ADR-0029 (DevTools-class capability is
   user-only, never an agent tool). `webbrain-agent-parity.md`'s Ground rules already litigated this
   exact boundary for `execute_js`; this track does not reopen it, only reconfirms it applies here too.
4. **No "proceed unless blocked" default.** Canvas's `confirmation_mode`/`security_analyzer` settings can
   be configured strictly, but the underlying SDK's own stated default posture is "don't get blocked on
   confirmation, proceed unless irreversible/security prevents it" (per the source-doc reading behind the
   comparison this track is built from). ADR-0006 chose the opposite default on purpose: the Policy Kernel
   is model-**before**, and a missing or timed-out HITL response is a **deny**, never a silent proceed.
   This is a philosophical fork, not a missing feature, and it is not being narrowed to match Canvas's
   default.

None of these are "Canvas did it wrong" — a control center hosting an arbitrary, possibly-remote agent
process necessarily reasons about trust differently than a native app with one built-in orchestrator. The
point of naming them is that a future reader of this track shouldn't reopen a decision that was already
made for a documented reason, or mistake "Canvas's frontend can't see this" for "nothing enforces this."

---

## Capability inventory

Legend for **Home**: an existing phase/ADR/track name means "already planned, this row cites it, no new
work proposed here." **NEW** means no existing phase owns it and this track proposes one (though it may
still reuse an existing package).

| #   | OpenHands Agent Canvas capability                                                                                                                         | Nearest Tepegöz behaviour today                                                                                                                                                                                                                                                                                            | Gap                                                                                                                                                                                                                                                                                      | Home                                                                                                                                                                                                                                                      |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | LiteLLM bridge → ~hundreds of provider/model cards, provider search, "verified models"                                                                    | 8 hand-written providers + `local` (`CanonRequest`/`CanonResponse`)                                                                                                                                                                                                                                                        | Breadth + a generic OpenAI-compatible adapter + local HTTP-server engine variant                                                                                                                                                                                                         | **`webbrain-agent-parity.md` P1 — already proposed, extends ADR-0005.** Cite, do not re-propose.                                                                                                                                                          |
| 2   | MCP client config: `stdio`/`sse`/`shttp` transports, auth modes incl. `oauth2`, health-probe, add/edit/remove servers, marketplace/installed-servers list | ADR-0018's MCP client: **stdio-only** prod transport (`main/mcp/transport.electron.ts`), `McpSupervisor` reconnect/backoff, a **read-only** Settings → Connections status list; add/edit/remove explicitly deferred ("config via preferences meanwhile")                                                                   | Transport breadth + `oauth2` auth + a real add/edit/remove/marketplace UI                                                                                                                                                                                                                | **P1 (NEW — sharpens Phase 1b's already-named MCP-server-settings DoD line; addendum to ADR-0018)**                                                                                                                                                       |
| 3   | Secrets referenced by name (`LookupSecret`), resolved from a global store at agent-process spawn time — never persisted raw in the server/agent config    | `McpServerConfig.env: Record<string,string>` stores **raw** values; `@tepegoz/credential-vault` already stores "any number of labeled keys per provider" but nothing wires it to an MCP server's env                                                                                                                       | A vault-referenced env value for MCP stdio servers, instead of a plaintext one in preferences                                                                                                                                                                                            | **P1 sub-item (small, same ADR-0018 addendum)**                                                                                                                                                                                                           |
| 4   | Automations: cron- and webhook-triggered agent runs (Slack/GitHub/Linear), dispatch + run history                                                         | `@tepegoz/tasks`' `external` trigger: `source: 'telegram' \| 'webhook'` is **already named in the schema**, but `enabled: z.literal(false)` — a hard-disabled placeholder                                                                                                                                                  | Turning the placeholder on: inbound-trigger authentication, rate-limit, routing through the _same_ preapproved-write policy gate the `interval`/`pageChange` triggers already pass                                                                                                       | **P2 (NEW — extends `@tepegoz/tasks`; a new ADR for the inbound-trigger trust boundary)**                                                                                                                                                                 |
| 5   | Parallel / isolated child conversations (`launch_child_conversation` — local git worktree or cloud sandbox)                                               | One active agent run — ADR-0013 §Consequences: "Phase 1a assumes effectively one active run"                                                                                                                                                                                                                               | True parallel runs                                                                                                                                                                                                                                                                       | **Already named** in `ai-agent/README.md`'s own backlog table: _"True parallel background runs (relaxes ADR-0013's one-run-at-a-time — needs a superseding ADR + real isolation; S8 ships 'single run, backgroundable' first)."_ Cite, do not re-propose. |
| 6   | Context-meter + one-click "Compact context"                                                                                                               | `cache-window.ts` (lag-2 breakpoints) + Reactor working-state collapse; no visible mid-run compaction step                                                                                                                                                                                                                 | A visible compaction affordance                                                                                                                                                                                                                                                          | **`webbrain-agent-parity.md` P9-a — already proposed.** Cite, do not re-propose.                                                                                                                                                                          |
| 7   | Bundled skill catalog (`SKILL.md` + keyword triggers), auto-injected into the system prompt on a match; user/project/org skill tiers                      | S9 skill store: a flat `{id, name, prompt, startUrl, grantProfile}` list, loaded only by an explicit model `load_skill` call — no keyword matching, no tiers                                                                                                                                                               | Trigger-based auto-activation + project/org tiers                                                                                                                                                                                                                                        | **P3 (extends S9, after its own measurement sweep; addendum to ADR-0027 — a second, independent increment alongside `webbrain-agent-parity.md` P5, which targets tool-declaring skills, not activation)**                                                 |
| 8   | Global secrets keyed by exact env-var name, `LookupSecret` resolved at spawn, conflicting-credential-pair UI warnings                                     | `@tepegoz/credential-vault`: labeled, multi-key-per-provider DPAPI/`safeStorage` vault — already more general than "one secret per env-var name" in the one respect this repo can compare; the conceptually stronger analog, `Credential Broker` (S6), ships **inert** pending an OS-auth gate                             | Nothing net-new beyond row 3 (the MCP-env wiring)                                                                                                                                                                                                                                        | **No new row.** Cites S6's already-planned, dormant Credential Broker + row 3.                                                                                                                                                                            |
| 9   | LLM balance card, per-conversation metrics-store, subscription-auth type, OAuth provider connections                                                      | `TokenLedger` (per-call token/cost, `maxTokens`/`timeoutMs` mandatory) + S7's pre-registered $/wall-clock targets; managed subscription + billing/quota is [Phase 3](../../phases/product/phase-3-backend-cloud-extensions.md)'s own planned surface (`subscription/billing`, `managed proxy`, `billing/quota/rate-limit`) | A conversation-level cost rollup in the agent panel UI                                                                                                                                                                                                                                   | **Backlog** (small `ext-agent` item) for the rollup; **Phase 3** (already planned) for subscription/OAuth/billing. Cite, do not re-propose the latter.                                                                                                    |
| 10  | Event-sourced conversation persistence (conversations replay from an event log; child conversations get git-worktree isolation)                           | [ADR-0004](../../docs/adr/0004-event-sourced-journal.md): append-only Event Journal — monotonic `lsn`, `deviceId` sync key, correlation id, redacted payload, `cas://` blob store for large artifacts, deterministic fold-replay with **no LLM re-call**                                                                   | **None.** Tepegöz's version is the more rigorous of the two and is verified in-repo; Canvas's actual event store lives in the out-of-reach `software-agent-sdk`                                                                                                                          | **Already ADR-0004 — convergent design, no gap.**                                                                                                                                                                                                         |
| 11  | ACP protocol: swap OpenHands' own SDK agent for Claude Code / Codex / Gemini CLI / any ACP server as the engine                                           | One orchestrator (Planner→Executor→Reactor); no swappable third-party engine                                                                                                                                                                                                                                               | The narrow legitimate overlap — "let a capable external agent drive Tepegöz" — is **Phase 1b's own planned MCP server** (Bearer + rate-limit + full Policy Kernel re-pass on every call); the ACP **mechanism** (an opaque local subprocess with no per-call kernel re-pass) is rejected | **Already planned (Phase 1b MCP server)** for the goal; mechanism rejected — see Ground rules #1                                                                                                                                                          |
| 12  | Backend registry: point one frontend at local / Docker sandbox / VM / OpenHands Cloud, health-probed, switchable                                          | N/A — Tepegöz is the local native app; there is no separate "backend" to register                                                                                                                                                                                                                                          | Category mismatch, not a capability gap                                                                                                                                                                                                                                                  | **Ground rules #2 — not matched.** If ever revisited, Phase 9's governed-endpoint territory, not a Canvas-style switcher.                                                                                                                                 |
| 13  | Coding-agent workspace: files-with-git-diff, embedded terminal, embedded VS Code, planner/tasklist tabs                                                   | N/A — browser agent, not a coding agent                                                                                                                                                                                                                                                                                    | Category-specific, not portable                                                                                                                                                                                                                                                          | **Ground rules #3 — not matched**, already litigated by `webbrain-agent-parity.md` (ADR-0026/0029)                                                                                                                                                        |
| 14  | Frontend quality discipline: Stryker mutation testing, an i18n-completeness CI script, a custom `no-direct-agent-server-calls` lint guard                 | Per-package coverage floor (S80/B85/F86/L80 over 63 packages) + ADR-0016's per-package i18n parity test (build-time typed `tr: typeof en`) + `dependency-cruiser` layer rules                                                                                                                                              | A mutation-testing pass on the highest-value security packages                                                                                                                                                                                                                           | **Backlog** — an engineering-culture item, not an agent capability; not written up as a workstream.                                                                                                                                                       |
| 15  | Default agent posture: "don't get blocked on confirmation, proceed unless irreversible"                                                                   | ADR-0006: model-**before** deterministic Policy Kernel, fail-safe deny (no confirm handler / no response = deny)                                                                                                                                                                                                           | Philosophical, not a feature gap                                                                                                                                                                                                                                                         | **Ground rules #4 — not matched.**                                                                                                                                                                                                                        |

---

## P1 — MCP client configuration maturity (sharpens Phase 1b, addendum to ADR-0018)

**Goal.** Close the gap between ADR-0018's honestly-scoped Phase-1a slice ("1a ships a **read-only**
Settings → Connections status list… add/edit/remove of servers is deferred to Phase 1b") and Canvas's
`specs/mcp-settings.md` — without adopting Canvas's actual enforcement model (an agent-server that is the
MCP client, outside any pre-model kernel). Tepegöz's `@tepegoz/mcp-client` is already the client and
already routes every discovered tool through the one `CapabilityRegistry`/`ToolGateway` PEP (ADR-0018 §1);
this workstream only widens _how a server gets configured_, not _how its tools get executed_.

**Approach.**

- **Transport breadth.** `McpConnection`'s `Transport` seam already comes from the official
  `@modelcontextprotocol/sdk`, which ships `SSEClientTransport`/`StreamableHTTPClientTransport` alongside
  `StdioClientTransport` — only `main/mcp/transport.electron.ts` currently injects the stdio variant. Add
  `sse`/`shttp` variants behind the same `McpServerConfig.transport` discriminant Canvas uses as a
  reference shape, no new abstraction needed.
- **Auth modes.** Extend `McpServerConfig` with an auth-mode field (`none`/`bearer`/`header`/`oauth2`),
  mirroring Canvas's own set — `oauth2` is the one mode Tepegöz has no equivalent of anywhere else in the
  codebase, so this is genuinely new surface, not a re-derivation of an existing one.
- **A real Settings UI**: add/edit/remove servers, a health-probe indicator sourced from `McpSupervisor`'s
  existing `status()` snapshot (already computed, just not surfaced beyond the read-only list), and a
  small **curated, contributor-maintained catalog** of known-good MCP servers to install from (Canvas's
  "marketplace" — deliberately **not** a live, arbitrary-URL marketplace; a static, reviewed list, the
  same trust posture `@tepegoz/model-catalog`/`@tepegoz/extension-catalog` already use for GGUF weights
  and extensions).
- **Vault-referenced secrets (row 3).** Extend `McpServerConfig.env` so a value can be a
  `{ vaultRef: string }` pointer into `@tepegoz/credential-vault` instead of a raw string, resolved only
  at spawn time in the main process (never persisted, never logged) — the same "the raw secret only ever
  exists in main, briefly, at the point of use" discipline `ModelGateway` already applies to provider
  keys.
- **What stays exactly as designed:** every MCP tool still registers through the one `CapabilityRegistry`
  as a normal `ToolDescriptor`; `dangerClassFor`'s fail-safe default (unknown/malicious hint → most
  restrictive class) is untouched; zod+ajv boundary validation on `tools/list`/`tools/call` is untouched.
  This workstream is entirely about _how a server enters the registry_, never about _what happens once it
  has_.

**New/changed packages:** `@tepegoz/mcp-client` (transport variants, auth-mode field, vault-ref env
resolution), `@tepegoz/credential-vault` (no schema change — already general enough), the Settings UI
package that owns the Connections list today (add/edit/remove + health + catalog).

**ADR:** addendum to **ADR-0018** — record the transport/auth-mode/vault-ref decisions as the Phase-1b
"config via preferences meanwhile" deferral being paid off, not a new architectural decision.

**DoD shape (draft):**

- [ ] An `sse` and a `shttp` MCP server both connect, list tools, and execute a tool through the
      unchanged PEP — same conformance suite every stdio server already passes
- [ ] `oauth2` auth completes an end-to-end token exchange for at least one real MCP server
- [ ] Add/edit/remove from Settings round-trips through the same config store `McpSupervisor.reconcile()`
      already watches — no new reconciliation path
- [ ] A vault-referenced env value is never present in the on-disk preferences file in plaintext (test
      asserts this against the serialized config)
- [ ] The curated catalog is a static, reviewed data file (same shape as `model-catalog`'s JSON) — not a
      live index of arbitrary third-party URLs
- [ ] i18n: EN+TR for the new Settings screens (transport picker, auth-mode picker, health states,
      catalog entries' user-facing copy)

---

## P2 — Real automations: turn on `@tepegoz/tasks`' disabled `external` trigger (NEW)

**Goal.** `@tepegoz/tasks`' schema already anticipated this — `TaskExternalSource` is literally
`['telegram', 'webhook']` and the trigger type is fully specified (`ExternalTriggerSchema`) except for one
field: `enabled: z.literal(false)`. Canvas's Automation Server (cron + Slack/GitHub/Linear webhooks, run
history, dispatch) is real evidence this capability is worth having; the work is turning an already-named
placeholder on safely, not inventing a new trigger concept.

**Approach.**

- **Inbound webhook receiver**, scoped narrowly: a per-task, generated unguessable endpoint path plus a
  shared-secret HMAC signature check (the same posture Slack/GitHub webhooks themselves use) — reject
  unsigned or wrong-signature requests before they ever reach a task. This is a new **trust boundary**
  (the first time this repo accepts an unsolicited inbound network request that can start agent work) and
  gets the same zod `safeParse`-at-the-boundary discipline every other trust boundary already has.
- **Telegram source**: a bot-token-authenticated long-poll or webhook (Telegram's own webhook mode reuses
  the HMAC-equivalent secret-token header), scoped to a single chat id per task so an unrelated Telegram
  message can never trigger someone else's task.
- **Reuse, not reinvent, the run authorization.** A fired external trigger runs the task under the
  **exact same** `TaskPolicy` (`allowedOrigins`, `preapprovedWriteTools`, `maxRunDurationMs`) the
  `interval`/`pageChange` triggers already enforce, and through the **same single-agent-run lock** the
  Agent panel and the scheduler already share (per the completed Phase-1a/Code-claude work in
  `../README.md`'s fold record: "renderer-sender-independent background task runner, sharing the same
  single-agent-run lock as the Agent panel and fail-safe denying unattended HITL escalations"). An
  external trigger is a new _source of the start signal_, never a new _authority to act_.
- **Run history + dispatch UI**: surface fired-trigger events through the existing Task run-history
  record (`TaskRunRecord`) rather than a parallel automation log — Canvas's dispatch view is a reasonable
  UX reference, not a new backend concept.

**New/changed packages:** `@tepegoz/tasks` (`ExternalTriggerSchema.enabled` flips to a real boolean +
webhook secret/Telegram chat-id fields), a small new receiver surface (main-process HTTP listener or
Electron protocol handler — whichever this repo's existing IPC/network conventions favor), `@tepegoz/tasks-ui`
(dispatch/run-history surfacing).

**ADR:** one new ADR — "inbound webhook/bot triggers for saved tasks: HMAC/shared-secret authentication,
rate-limiting, and confirmation that firing a trigger reuses the existing `TaskPolicy` gate rather than
introducing a second one." Worth writing precisely because this is the first inbound-initiated agent
action in the codebase and a future contributor could otherwise be tempted to treat "it's just a
webhook" as exempt from the trust-boundary discipline everything else here follows.

**DoD shape (draft):**

- [ ] An unsigned or wrong-secret webhook request is rejected before any task lookup happens (test proves
      it, not just documents it)
- [ ] A fired external trigger cannot execute a tool `preapprovedWriteTools` doesn't already cover — same
      test shape S9/Phase-1a's task-policy tests already use
      Two external triggers on two different tasks cannot both start a run simultaneously — the existing
      single-run lock is exercised, not bypassed
- [ ] Rate-limiting on the receiver itself (a burst of webhook calls cannot spawn a burst of runs)
- [ ] i18n: EN+TR for the webhook-setup UI (secret display/rotate, Telegram bot linking, dispatch history)

---

## P3 — Skill catalog: trigger-based activation + tiers (extends S9, after its own sweep)

**Goal.** S9 shipped skills as an explicitly-invoked list — a skill only enters context when the model
calls `load_skill`. Canvas's bundled-skill model (a `SKILL.md` + keyword triggers, matched and injected
into the system prompt automatically, at three tiers — bundled/`@openhands/extensions`, user/project
`.agents/skills/`, and org-level cloud skills) is a **different increment** from what
`webbrain-agent-parity.md` P5 already proposed for S9 (P5 is about skills **declaring HTTP tools**; this
is about skills **activating themselves**). Both are legitimate next steps on the same ADR-0027 substrate
and are flagged separately here so a future session implementing one doesn't accidentally fold in or
collide with the other — per the anti-debt rule, **neither opens while S9 itself is still
measurement-owed.**

**Approach.**

- **Keyword-trigger matching**, deliberately simple and deterministic (substring/keyword match against
  the user's prompt and/or recent page context, not semantic/embedding-based) — matching Canvas's own
  approach and this repo's "determinism-first" rule: matching which skill _might_ be relevant is fine to
  do without a model call; whether to _use_ it is still the model's decision (same as today's explicit
  `load_skill`), the trigger only changes _whether it's surfaced as a candidate_, never auto-injects
  unreviewed content into the trusted prompt tier without the model choosing to load it.
- **Tiers**, reusing existing scoping the repo already has elsewhere: a **bundled** tier ships in the app
  package (curated, contributor-authored, same trust tier as today's skill prompts); a **user/local** tier
  is the existing per-profile `agent_skills` table, unchanged; a **project** tier (skills scoped to a
  site/origin, similar in spirit to `webbrain-agent-parity.md` P4's site-guidance adapters but staying
  strictly in the S9 skill lane, not the orchestrator prompt-injection lane P4 owns) is new. An **org/cloud**
  tier is explicitly **out of scope** — it depends on Phase 3's cloud-sync surface, which is frozen out of
  v1 and does not exist to extend.
- **Still cannot start a run.** S9's existing constraint holds without modification: a trigger-matched
  skill is a suggestion surfaced to the model (or, if the UX wants it, a one-tap "use this skill" prompt
  to the user) within an already-approved run — it never gains the ability to initiate one.

**New/changed packages:** `@tepegoz/persistence` (`agent_skills` schema gains an optional `triggers:
string[]` + `tier` field), the S9 skill-loading path in `@tepegoz/orchestrator`, a small bundled-skill
catalog data file (same "adding one is a data change" philosophy `webbrain-agent-parity.md` P1 already
established for providers).

**ADR:** addendum to **ADR-0027** (agent memory / S9's ADR) — explicitly noted as a **second, independent**
addendum alongside `webbrain-agent-parity.md` P5's own addendum to the same ADR, so both can land without
either invalidating the other's DoD.

**DoD shape (draft):**

- [ ] Keyword matching surfaces a candidate skill without ever injecting its prompt content until the
      model (or user) explicitly chooses it — a test proves an unmatched-but-present skill's text never
      appears in a sent prompt
- [ ] A bundled skill and a user-authored skill are indistinguishable to the loading path except for their
      trust tier (bundled = always available; user = per-profile)
- [ ] Explicitly gated behind S9 reaching ✅ first (not opened while S9 is still measurement-owed, per the
      anti-debt rule) — same gate `webbrain-agent-parity.md` P5 already states for its own S9 increment

---

## Backlog (named, not written up)

- **Conversation-level cost rollup in the agent panel.** `TokenLedger` already records per-call token/cost;
  Canvas's LLM-balance-card + per-conversation metrics-store is mostly a UI-aggregation problem over data
  Tepegöz already has. Fold into whichever session next touches `ext-agent`'s S7/S8 surfaces rather than
  opening a phase for it alone.
- **LLM profiles** (named, reusable, one-click-activate provider+model+params bundles) — a small Settings
  nicety on top of `credential-vault`'s existing labeled multi-key model and `ModelRouter`'s existing
  tier resolution; no new mechanism needed, just a saved-preset UI. Candidate home: whichever session next
  touches Phase 1a/2b Settings surfaces.
- **Mutation testing on the highest-value security packages** (`security-policy`'s `PolicyKernel`,
  `capability-plane`'s `ToolGateway`). Stryker-style, matching Canvas's own frontend quality tooling — this
  is an engineering-culture idea, not an agent capability, and is recorded here so it isn't lost rather
  than because this track owns it. No phase currently claims it.

---

## Routing — what this track does not own

Per the existing convention ([`../README.md`](../../phases/README.md#routing--what-stays-out) /
[`ai-agent/README.md`](../../phases/ai-agent/README.md#routing--what-stays-out)), reference these,
never duplicate them:

| Stays with                          | Material                                                                                                                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`webbrain-agent-parity.md` P1**   | Provider/model breadth, generic OpenAI-compatible adapter, local HTTP-server engine variant — Canvas's LiteLLM bridge is further evidence for a workstream that already exists |
| **`webbrain-agent-parity.md` P9-a** | Visible mid-run context compaction — Canvas's context-meter is further evidence, not a new ask                                                                                 |
| **`webbrain-agent-parity.md` P5**   | Tool-declaring skills — the _other_ independent S9 increment, distinct from this track's P3 (activation, not declaration)                                                      |
| **Phase 1b**                        | The MCP **server** surface (external agent drives Tepegöz) — the conformant version of ACP's "plug in an agent" goal; not this track's to design                               |
| **`ai-agent/README.md` backlog**    | "True parallel background runs" — the conformant home for Canvas's child conversations, needs a superseding ADR-0013, evidence-gated                                           |
| **Phase 3**                         | Managed-proxy zero-setup default, subscription/billing, OAuth provider connections, LLM balance service                                                                        |
| **Phase 9**                         | Governed endpoints / transaction mandates / signed policy bundles — the only conformant shape for anything resembling a remote "backend" target                                |
| **ADR-0026 / ADR-0029**             | `execute_js` / DevTools boundary — not reopened (see Ground rules #3)                                                                                                          |
| **ADR-0006**                        | Policy Kernel pre-model default-deny posture — not reopened (see Ground rules #4)                                                                                              |

## ADRs owed (numbers assigned when a session actually opens one of these)

- P1: addendum to **ADR-0018** (MCP client — transport breadth, `oauth2` auth mode, vault-referenced env
  secrets, add/edit/remove + curated-catalog UI; pays off the "config via preferences meanwhile" deferral)
- P2: one new ADR — inbound webhook/bot trigger trust boundary for `@tepegoz/tasks` (HMAC/shared-secret
  auth, rate-limit, confirmation that firing reuses the existing `TaskPolicy` gate rather than a new one)
- P3: addendum to **ADR-0027** (agent memory) — explicitly a **second, independent** addendum alongside
  `webbrain-agent-parity.md` P5's own addendum to the same ADR

No number is reserved here; per this repo's own multi-profile-track lesson (`multi-profile-isolation.md`
— an ADR-number collision from writing a plan too far ahead of when it's actually opened), the number
gets assigned at the point a session actually starts the work, not now.
