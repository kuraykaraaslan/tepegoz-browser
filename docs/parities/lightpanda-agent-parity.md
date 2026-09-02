# Track — Lightpanda agent-capability parity

**Status:** 📋 **Proposed — not scheduled (2026-09-02).** No branch, no ADR number reserved, no owner
sign-off. This is a captured gap-analysis in the shape of
[`browser-settings-feature-gap.md`](../tracks/browser-settings-feature-gap.md) and
[`webbrain-agent-parity.md`](webbrain-agent-parity.md) — except this one closes with **zero proposed
workstreams**. That is the finding, not a shortcut: the rival is a different product category, and every
genuinely-shared axis this session could locate turns out to already be owned elsewhere or foreclosed by
a standing decision. The record exists so a future session doesn't re-run this analysis and land somewhere
different by accident.

**Source:** a same-session read of [`docs/others/tepegoz-vs-lightpanda.md`](../versus/tepegoz-vs-lightpanda.md)
(2026-09-01, itself sourced from `.junk/lightpanda`'s `README.md`/`AGENTS.md`/`CLAUDE.md`/`CONTRIBUTING.md`/
`LICENSING.md`/`SECURITY.md`, `src/agent/{Agent.zig,settings.zig,Conversation.zig,save.zig}`,
`src/script/{skill.zig,command.zig}`, `src/browser/tools.zig`, `src/mcp/{tools.zig,HttpServer.zig}`,
`src/SemanticTree.zig`, `src/Config.zig`, `src/server/cdp/domains/`, `src/telemetry/`,
`src/network/adblock/`) against this repo's AI surface, **plus a fresh independent re-read of the same
`.junk/lightpanda` checkout this session** to confirm the load-bearing claims before writing this file
down: `src/browser/tools.zig`'s `Tool` enum (28 members, confirmed by direct read), `driver_guidance`'s
cheap→expensive reading order and `$LP_*` credential-placeholder rules, `src/agent/Agent.zig`'s loop
ceilings (`max_turns = 100`, `max_tool_calls = 200`, `max_tokens = 4096`, `tool_choice = .auto`, lines
1701–1704), and the README's benchmark claim (933 real pages, 123MB peak / 5s vs. 2GB / 46s for headless
Chrome, ~9x / ~16x). Tepegoz-side claims were checked against source, not the comparison doc's prose: `grep`
for `@tepegoz/notary` under `apps/desktop` returns no hits (confirming ADR-0030's own "nothing in
`apps/desktop` calls this package yet" line), and `captureVision` appears only in
`packages/orchestrator/src/{reactor.ts,reactor-types.ts}` and its own test — never in a production caller —
confirming `phase-s10-vision-escalation.md`'s 2026-09-02 correction.

## Why this track exists

`tepegoz-vs-lightpanda.md` opens by naming its own asymmetry before comparing anything: **Lightpanda is
not an agent competitor.** It is a from-scratch, non-Chromium headless browser **engine** (V8 + Servo's
html5ever + libcurl, no graphics stack) whose primary interface is a CDP server (`lightpanda serve`) and a
one-shot dump command (`lightpanda fetch`); its reason to exist is running headless Chrome's job at a
fraction of the memory and wall-clock cost, published against 933 real pages (123MB / 5s vs. 2GB / 46s,
~9x / ~16x). It recently grew a thin native agent, an MCP **server**, multi-provider LLM support, and a
model-free replay format (PandaScript) on top of that engine — but the comparison doc is explicit that
this agent layer carries no policy kernel, no HITL, no taint tracking, no egress firewall, no
cryptographic audit trail, and no autonomy taxonomy. Tepegoz is the opposite shape: a full desktop
Electron/Chromium browser where the agent is one governed subsystem riding on top of a security-by-design
core. Two different bets, and the comparison doc's own conclusion states it plainly: **the overlap is
narrow, and this document was kept short compared to the other rival write-ups for exactly that reason.**

This track's job, per the same brief every rival-parity track uses, was to ask: for the axes where the two
products genuinely do overlap — **CDP compatibility, agent-optimized lightweight page loading (execute JS,
skip rendering), and raw resource consumption** — does Tepegoz have a seam, and if not, what would a
Tepegoz-conformant version look like? The honest answer, worked through below, is that **none of the three
survive as an actionable workstream.** Each is either a direct consequence of Lightpanda being a different
kind of engine (not a process Tepegoz can port without abandoning the full-Chromium-fidelity bet that this
repo's own comparison doc says is Tepegoz's actual advantage today), or it is already routed to an existing
phase/ADR that a new workstream here would only duplicate. Nothing below is a "Lightpanda did it and we
missed it" finding. It is a "we looked, and there is nothing here to take" finding, arrived at the same way
the other tracks arrive at their proposals — by reading the source, not by assuming a competitor's breadth
implies a Tepegoz gap.

## How to read this

There is no `## P1 … Pn` section in this track, because none survived. What follows instead is the
analysis that would normally sit behind each inventory row: the three named axes, examined one at a time,
plus a Ground rules section naming the adjacent things a future reader might be tempted to propose from the
same source material — a raw CDP automation server, `evaluate`/`execute_js`, PandaScript-style model-free
replay, in-process zero-IPC tool dispatch, parallel headless fan-out — each rejected against a specific
standing ADR or product decision, so nobody re-opens them without first reading why they were closed here.

## The three overlapping axes, examined

### Axis 1 — CDP compatibility

Lightpanda's CDP surface is **outward-facing**: `lightpanda serve` starts a CDP server so Puppeteer/
Playwright can attach via `browserWSEndpoint`, making Lightpanda a drop-in replacement for headless Chrome
in someone else's automation stack. Tepegoz already uses CDP — but **inward**, as its own agent's
perception substrate: ADR-0008 states perception is "driven by an out-of-process CDP driver," and
`browser_*` tools read the DOM/accessibility tree through it. So "CDP compatibility" is not a missing
capability here; Tepegoz's agent already speaks CDP to itself, and does so with full fidelity because it
sits on real Chromium rather than a from-scratch reimplementation. The only thing Lightpanda has that
Tepegoz does not is the **outward** direction — exposing a CDP endpoint so a third-party process can attach
to a live, authenticated browser session. That is not a gap; it is a surface this repo's threat model has
already refused once, for the more contained case of a local DevTools window (ADR-0029: "DevTools is
exposed to the user and is never an agent capability... A DevTools window is a live, scriptable console
attached to an authenticated session"). An externally-reachable CDP debug port is the same hazard at a
larger radius — it would let any process that can reach the port drive an authenticated session with zero
pass through the ToolGateway PEP, the Policy Kernel, or HITL. Nothing in ADR-0029's reasoning, or in
ADR-0006's model-before-model-never premise, would come out differently for this case. Not proposed.

### Axis 2 — Agent-optimized lightweight page loading (run JS, skip rendering)

This is Lightpanda's actual reason to exist, not a feature bolted onto an existing browser: no graphics
stack means no layout painting, no compositor, no GPU — `screenshot` renders a PNG of the engine's own text
layout, explicitly documented as secondary ("not a primary read") because it is not pixel-accurate to begin
with. That is inseparable from being a from-scratch engine. Tepegoz cannot "turn off rendering" for one tab
without either (a) already getting a version of this for free — Chromium already throttles/deprioritizes
work on background tabs the agent isn't looking at, the same way it would for any other browser tab — or
(b) actually building a second, non-Chromium rendering path, which is not a workstream, it is a different
product. And it would cut against the one place this repo's own comparison doc says Tepegoz is ahead today:
_"Bugün güvenilir okuma Tepegöz (Chromium sadakati)"_ — full Web-API coverage, real CORS, real rendering,
no "many sites now work" caveat. Trading that for a lighter-weight non-rendering mode would be adopting
Lightpanda's own trade-off (speed for web fidelity) in a product whose stated bet is the opposite one. Not
proposed.

### Axis 3 — Raw resource consumption

Lightpanda's ~9x / ~16x numbers (933-page benchmark, 123MB / 5s vs. 2GB / 46s) are a direct product of
Axis 2 plus a design built for **server-scale concurrency** — hundreds/thousands of simultaneous headless
sessions, an HTTP connection pool sized for fan-out (40 total / 6 per host), `new Page()` spawning
parallel, independent browsing contexts. Tepegoz is architecturally a single-user, single-window desktop
application; "cheaper to run at scale" is not a claim this product makes or needs to make. The one thing
in this axis that could, in principle, transfer without contradicting Tepegoz's own architecture — running
several tool-driven pages **concurrently** instead of the one this repo currently permits — is not actually
inspired by anything Lightpanda does differently at the engine level; it is a straightforward "let the
agent do more than one thing at once" ask that this repo has already named, already reasoned about, and
already parked: ADR-0013 fixes the agent at **one concurrent run**, and `ai-agent/README.md`'s own
routing table already lists **"True parallel background runs (relaxes ADR-0013's one-run-at-a-time — needs
a superseding ADR + real isolation)"** as backlog under its own program, not something this track should
re-propose from a different source. Citing it here would be re-deriving an already-named seam, which is
exactly what these tracks exist to avoid. Not proposed — see Routing below.

## Ground rules — parity, not imitation

None of the following are proposed by this track. They are named once, because each is the kind of thing a
future session might reach for after reading the same Lightpanda source this session read, and each already
has a settled answer:

1. **No externally-exposed CDP/automation server.** Covered under Axis 1 — the same hazard ADR-0029 already
   named for a local DevTools window (a live, scriptable, authenticated session outside the ToolGateway PEP),
   at a larger blast radius. Not revisited.
2. **No `evaluate`/`execute_js`-equivalent tool.** Lightpanda's `evaluate` (arbitrary page-side JavaScript)
   is the exact capability ADR-0026 measured and refused (isolated-world sandbox **refuted** by measurement)
   and ADR-0029 draws the line on a second way (DevTools-class capability is user-only, never an agent
   tool). Already named as a rejection in [`webbrain-agent-parity.md`](webbrain-agent-parity.md#ground-rules--parity-not-imitation)
   for the same reason; restated here because Lightpanda's own driver guidance frames `evaluate` as "an
   escape hatch... not a first resort," which is a softer framing than an outright ban and could read as an
   opening. It is not one.
3. **No PandaScript-equivalent model-free replay track.** Lightpanda's `/save` distills a session into
   vanilla JavaScript with no signature, no success oracle, and no self-healing selector — by its own
   comparison doc's assessment, Tepegoz's existing `@tepegoz/recipe-compiler` (signed, `evaluateAssertion`
   success oracle, selector-healing) plus `@tepegoz/macro-engine` already cover the same "prototype with the
   model, ship deterministic, token-free replay" story with **more** mechanism, already routed to Phase 6.
   A port would be a regression, not an addition. Not proposed.
4. **No in-process, zero-IPC tool dispatch.** Lightpanda's speed story depends partly on the agent running
   in the same process as the (renderer-less) engine — no IPC hop per tool call. Tepegoz's IPC hop between
   an untrusted renderer and the main process is not overhead to be optimized away; it is the security
   boundary this repo's own engineering rules state as non-negotiable ("Renderer is untrusted; one secure
   `createWindow()` factory; typed `contextBridge` only" — `CLAUDE.md`). Collapsing it for speed would be
   adopting Lightpanda's threat model (no renderer, no untrusted-content boundary to defend) in a product
   that has one. Not proposed.
5. **No parallel/concurrent multi-session fan-out.** Covered under Axis 3 — already named in
   `ai-agent/README.md`'s own routing table as evidence-gated backlog behind a superseding ADR to
   ADR-0013. Cited, not re-proposed.

None of this is "Lightpanda did it wrong." Lightpanda's own `README.md` and `LICENSING.md` show a team that
reasoned carefully about a different set of trade-offs for a different product — a server-scale automation
engine with no policy kernel to defend because it has no authenticated end-user session to defend it for.
The point of naming these here is the same as in every other track: so a future reader with the same source
material in front of them does not reopen a question that was already closed, for a stated reason, in this
session.

## Capability inventory

Legend: this table covers only the three axes the brief for this track named as genuinely overlapping. It
is short on purpose — see "Why this track exists" above for why the wider 23-row comparison in
`tepegoz-vs-lightpanda.md` did not produce more rows here. **Home = "Ground rules"** means the axis was
considered and explicitly rejected above, not silently skipped.

| #   | Axis (Lightpanda strength)                                                   | Nearest Tepegöz behaviour today                                                                                            | Verdict                                                                                                                                                                   | Home                                                             |
| --- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 1   | CDP server as the primary, externally-reachable interface                    | CDP used **inward**, as the agent's own perception driver (ADR-0008); no outward CDP endpoint, by design                   | Not a Tepegoz gap — different direction, and the outward direction is a security hazard this repo has already refused a smaller version of                                | **Ground rules #1**                                              |
| 2   | No rendering engine → agent-optimized lightweight page loads                 | Full Chromium render for every page (ADR-0008 DOM/a11y-first perception rides on real rendering, real CORS, real Web APIs) | Not adoptable without trading away the fidelity this repo's own comparison doc names as Tepegoz's actual advantage today                                                  | **Ground rules — Axis 2 (no ADR change, product-identity call)** |
| 3   | ~9x/~16x resource footprint at server-scale concurrency (933-page benchmark) | Single-user, single-window desktop app; agent fixed at one concurrent run (ADR-0013)                                       | Not a Tepegoz use case (no server-scale fan-out to optimize for); the one adjacent ask that would transfer (concurrent runs) is already named elsewhere, not by this axis | **`ai-agent`'s own routing table** (ADR-0013 backlog)            |

## Workstreams

None. See the three axes above and the Ground rules section for the reasoning; nothing here reached the bar
of "genuinely good and missing" that would justify a `## P1` section.

## Backlog (named, not written up)

None. A backlog entry would mean "real but low-priority, revisit later" — everything this track considered
is either already-owned by an existing phase/ADR or foreclosed by a standing product/security decision, not
merely deprioritized. There is nothing to revisit here unless one of those decisions itself changes, which
is a call for the owner, not a future session reading this track.

## Routing — what this track does not own

Per the existing convention ([`../README.md`](../../phases/README.md#deferred--adoption-gated-backlog-from-the-beyond-phases-synthesis) /
[`ai-agent/README.md`](../../phases/ai-agent/README.md#routing--what-stays-out)), reference these, never
duplicate them:

| Stays with                                       | Material                                                                                                    |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| **ADR-0008**                                     | CDP-driven, DOM/a11y-first perception (inward direction) — Axis 1's actual Tepegoz seam, already built      |
| **ADR-0029**                                     | DevTools/CDP exposure boundary — the reasoning Axis 1's outward direction would have to clear, and does not |
| **ADR-0026**                                     | `execute_js`/isolated-world code-exec — measured and refuted; Lightpanda's `evaluate` is the same shape     |
| **ADR-0013** + `ai-agent`'s own backlog          | Single-concurrent-run limit; parallel fan-out already named there, not here                                 |
| **Phase 6** (`recipe-compiler` / `macro-engine`) | Deterministic model-free replay — already ahead of PandaScript on mechanism                                 |
| **`webbrain-agent-parity.md`** Ground rules      | The `execute_js`/DevTools rejection this track restates rather than re-derives                              |

## ADRs owed

None. This track proposes no new capability, so it opens no addendum and reserves no number. If a future
session wants to reopen any of the three axes above — most plausibly Axis 2, a deliberate product-identity
trade rather than a technical gap — that would need its own ADR addendum (to ADR-0008, for perception) and
an owner decision to trade away stated Chromium fidelity, not a continuation of this track.
