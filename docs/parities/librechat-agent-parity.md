# Track — LibreChat agent-capability parity

**Status:** 📋 **Proposed — not scheduled (2026-09-01).** No branch, no ADR number reserved, no owner
sign-off. This is a captured gap list in the shape of
[`browser-settings-feature-gap.md`](../tracks/browser-settings-feature-gap.md),
[`webbrain-agent-parity.md`](webbrain-agent-parity.md) and [`aipex-agent-parity.md`](aipex-agent-parity.md):
every row names its nearest existing Tepegöz behaviour and a suggested phase/ADR home, so a future
session can promote a row into a real `phase-*.md` task or an `ai-agent` PR without re-deriving
the comparison.

**Source:** [`docs/others/tepegoz-vs-librechat.md`](../versus/tepegoz-vs-librechat.md) (Turkish,
2026-09-01, a same-session deep read of `.junk/librechat` — LibreChat `v0.8.8-rc1`, MIT, a self-hosted
multi-user AI chat platform + agent framework — against this repo's AI surface) plus a second same-session
pass **re-reading LibreChat source directly** rather than trusting the comparison's prose: `packages/api/
src/mcp/oauth/handler.ts` (OAuth flow + SSRF-hardened fetch), `packages/api/src/mcp/connection.ts`
(4 transports + connection-time SSRF re-validation), `packages/api/src/actions/tools.ts` +
`packages/data-provider/src/actions.ts` (OpenAPI-to-tool synthesis + the `none`/`service_http`
(basic/bearer/custom-header)/`oauth` auth-type enum), `packages/data-schemas/src/types/auditLog.ts` +
`.../types/admin.ts` (confirms the hash-chain design **and** confirms `AUDIT_ACTIONS` is exactly
`['grant.assigned', 'grant.removed']`, matching the comparison's claim verbatim), and this repo's own
`packages/web-tools/src/web-tools.ts` + `apps/desktop/src/main/web/web-tools-host.electron.ts` +
`packages/tasks/src/schemas.ts` + `docs/adr/{0006-policy-kernel-hitl,0018-mcp-client,0027-agent-memory,
0013-agent-orchestration-hitl,0026-agent-code-execution,0029-devtools-expose-boundary}.md` (confirms every
"nearest Tepegoz behaviour" cell below against real code, not the comparison's summary of it — see the
`web_get_page` finding under P2, which the comparison doc did not call out).

**Related:** [`docs/others/librechat-agent-ui-learnings.md`](../versus/librechat-agent-ui-learnings.md)
— a companion document that already extracted `extensions/ext-agent` panel-UX improvements from the same
LibreChat checkout into groups **A** (take directly), **B** (adapt), **C** (deliberately not taken) and
**D** (build order). **This track does not repeat that extraction** — [§ UI-surface items](#ui-surface-items--already-extracted-elsewhere-routed-here)
below links each A/B item to a phase/ADR home and a DoD hook, and cites that document instead of
re-describing what each item is.

## Why this track exists

The comparison landed on an honest asymmetry, and it is a _different_ asymmetry from the WebBrain and
AIPex tracks: **LibreChat is not a competing browser agent — it is a mature, shipping, self-hosted
multi-user AI chat platform with an agent framework bolted on**, MongoDB + Meilisearch + pgvector + OAuth/
LDAP/SAML + an admin panel + token billing, none of which Tepegoz is or needs to be. Most of what LibreChat
does better is **out of category** (multi-tenancy, RBAC, code interpreter, image generation, voice,
observability integrations) and is recorded once in the comparison's own "Örtüşmeyen alanlar" section
rather than re-litigated here. What is left after subtracting the category difference is narrower than
WebBrain's or AIPex's overlap, but genuinely real: a handful of places where LibreChat solved a problem
Tepegoz's own roadmap already names as open (MCP transport breadth, in particular — `docs/adr/
0018-mcp-client.md` itself says "`http_sse` in schema, transport not written"), one place where reading
LibreChat's source surfaced a **verified defect in this repo** that the comparison document did not call
out (§P2 — `web_get_page` has no SSRF protection at all), and a small set of concrete, narrow, low-risk
additions to already-shipped Tepegoz packages. This track's job is the same question the sibling tracks
ask: _does Tepegoz already have a seam for this, and if not, what would the Tepegoz-conformant version look
like_ — never "port the JS," always "re-derive the capability inside the existing kernel/PEP/i18n/coverage
discipline."

## How to read this

Each workstream below is written like an `ai-agent` phase section (Goal → Approach → new/changed
packages → ADR → DoD-shaped bullets) so it can be lifted into a real phase file with minimal rewriting.
**Nothing here is committed roadmap.** Where a capability already has a named home in an existing phase,
an ADR, or a sibling track, this track says so explicitly and does **not** re-describe it — it only adds
the detail this LibreChat reading surfaced that the existing text doesn't have yet. Per the "Already
planned — do NOT re-propose" rule in [`../README.md`](../../phases/README.md#deferred--adoption-gated-backlog-from-the-beyond-phases-synthesis),
provider-catalog breadth is **[`webbrain-agent-parity.md`](webbrain-agent-parity.md) P1**, MCP **server**
is **Phase 1b**, and HTTP-tool-declaring skills are **`webbrain-agent-parity.md` P5** — several rows below
are "sharpen that workstream with this detail," not "add a phase."

**Categorically out of scope (not evaluated as a gap, not a security rejection — a different product):**
multi-user auth/RBAC/admin panel, token billing, Code Interpreter's _remote-sandbox delegation model_ (its
code-exec mechanism is rejected below on security grounds; the _billing-for-compute_ framing is simply not
applicable to a single-user desktop app), image/voice generation, Agent Marketplace, Langfuse/OTel
observability. The comparison's own "Örtüşmeyen alanlar" section is the complete list — cited, not
repeated.

## Ground rules — parity, not imitation

Four LibreChat capabilities are **deliberately not being matched**, because matching them would violate a
standing decision this repo already made after deliberation. Naming them here once, so no future session
re-proposes them by accident. Three of the four are already reasoned through in
`librechat-agent-ui-learnings.md`'s §C table — cited here, not re-derived — with the ADR numbers added:

1. **No Code Interpreter.** LibreChat delegates `execute_code` to a remote sandboxed HTTP service (default
   `api.librechat.ai`) that runs Python/Node/Go/Rust/etc. ADR-0026 already measured the isolated-world
   sandbox path this repo would need for anything similar and the sandbox was **refuted by measurement**;
   ADR-0029 already drew the DevTools-class boundary as user-only. Tepegoz's own code-exec stays read-only
   by design (`librechat-agent-ui-learnings.md` §C). Do not add a code-exec tool, local or delegated.
2. **No Artifacts (live model-authored React/HTML/Mermaid rendered in the chat surface).** This is the same
   class of risk as Code Interpreter wearing a UI costume: it means running model-generated code **inside
   the renderer**, and this repo's renderer-untrusted architecture (CLAUDE.md: "Renderer is untrusted; one
   secure `createWindow()` factory; typed `contextBridge` only") exists precisely to keep that from being
   possible. No ADR number owns this exact surface because the surface has never been proposed before now;
   the rejection follows directly from the same reasoning ADR-0026 already wrote down for a sibling case.
3. **No subagents / multi-agent graphs.** LibreChat's `subagents` capability lets a model spawn isolated
   child runs (depth 5, 50 graph nodes, background execution, `check_background_task` polling). ADR-0013
   already committed this repo to **serialized, single-concurrent-run** execution. Opening a concurrency
   surface here would supersede ADR-0013, not extend it — out of this track's scope, already the subject
   of `ai-agent`'s own named backlog item ("True parallel background runs... needs a superseding
   ADR + real isolation" — [`ai-agent/README.md`](../../phases/ai-agent/README.md#routing--what-stays-out)).
4. **No Agent Plugins (skill + MCP server bundles auto-loaded at session start).** ADR-0027 (S9) states the
   rule this would break in one sentence: _"A skill can never start itself... the send gesture that
   authorises a task stays with the human."_ An auto-loaded bundle is a model-independent, pre-model
   expansion of tool surface with no send gesture behind it at all — a sharper version of the same
   violation. `librechat-agent-ui-learnings.md` §C names this too; the ADR citation is added here.

None of these are "LibreChat did it wrong" — LibreChat is a different threat model (a self-hosted platform
an operator configures and trusts its own users on) solving a different problem. The point of naming them
is that a future reader of this track shouldn't reopen a decision that was already made for a documented
reason.

---

## Capability inventory

Legend for **Home**: an existing phase/ADR/track name means "already planned or already owned elsewhere,
this row sharpens it, no new phase needed." **NEW** means no existing phase owns it and this track
proposes one. Rows scored "no gap" are evidence, not asks — they record where Tepegoz already wins the
axis, per the comparison's own "kim daha iyi" table, so a future reader doesn't re-litigate a closed
question.

| #   | LibreChat capability                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Nearest Tepegöz behaviour today                                                                                                                                                                                                                                                                                                                                                                                        | Gap                                                                                                                                                                                                                                                                                                             | Home                                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 4 MCP transports (stdio/websocket/sse/streamable-http) + full OAuth (PKCE, dynamic client registration, RFC 8707/9728, OBO) + a circuit breaker + live `tools/list_changed` refresh                                                                                                                                                                                                                                                                                                        | `stdio` only, connected; `http_sse` accepted in the config schema but **no transport written** (ADR-0018 says so itself); no OAuth                                                                                                                                                                                                                                                                                     | The single most concrete, already-acknowledged MCP gap this repo has                                                                                                                                                                                                                                            | **P1 (NEW — extends ADR-0018)**                                                                                                                                           |
| 2   | Every outbound fetch (MCP, MCP-OAuth, web search, Actions, OCR, model listing) goes through one **connection-time-IP-revalidated, DNS-rebinding-safe** hardened fetch (`isSSRFTarget`/`resolveHostnameSSRF`/`isAddressAllowed`, verified in `mcp/connection.ts` + `mcp/oauth/handler.ts`)                                                                                                                                                                                                  | `web_get_page`'s backing `fetchPage` (`apps/desktop/src/main/web/web-tools-host.electron.ts`) does a direct `client.get(input.url, …)` with **no private-IP/metadata check and no redirect restriction** — confirmed by reading the file, not by the comparison doc, which does not call this out; only the unrelated same-origin `sitemap-reader.ts` is SSRF-safe (by construction: same-origin only, zero redirects) | A real, verified gap in a tool that ships today                                                                                                                                                                                                                                                                 | **P2 (NEW — extends `@tepegoz/http`)**                                                                                                                                    |
| 3   | Provider catalog as **data**: `custom` endpoint (any OpenAI-compatible API, no code change), a 26-hostname brand-detection table, per-model `tokenConfig`, settings-search with a documented ordering                                                                                                                                                                                                                                                                                      | 8 providers hard-coded in a union type; `openai-compat` adapter exists but isn't catalog-driven                                                                                                                                                                                                                                                                                                                        | Exactly the ask `webbrain-agent-parity.md` P1 already makes                                                                                                                                                                                                                                                     | **webbrain-agent-parity P1** — sharpen with the 26-hostname brand table + settings-search ordering as a second reference, no new phase                                    |
| 4   | Actions: paste an OpenAPI spec → tools are synthesized automatically; `none`/`service_http` (basic/bearer/custom-header)/`oauth` auth; tool names carry a domain suffix so re-importing the same spec replaces (not duplicates) its tools                                                                                                                                                                                                                                                  | S9 skills are prompt templates only; `webbrain-agent-parity.md` P5 proposes a skill-declared, hand-written HTTP-tool manifest                                                                                                                                                                                                                                                                                          | The **paste-a-spec UX** and the auth-type taxonomy are worth adopting as an _import front-end_ that emits P5's manifest shape — not a third external-tool onboarding path alongside MCP-client and P5                                                                                                           | **P3 (NEW, small — front-end for webbrain-agent-parity P5)**                                                                                                              |
| 5   | Explicit mid-run summarization: a 3-way trigger union (`token_ratio` \| `remaining_tokens` \| `messages_to_refine`), `retainRecent`, a separate `contextPruning` pass, `reserveRatio` (deliberately lowered because summarization now exists), summarization routable to a **different, cheaper model**                                                                                                                                                                                    | `cache-window.ts` (lag-2 breakpoint) + Reactor working-state collapse (`COLLAPSED_STATE_PLACEHOLDER`) — both deterministic reordering/elision, **no model-generated running summary exists at all**                                                                                                                                                                                                                    | Not a UI gap (that part is ui-learnings A2) — an actual missing capability: nothing ever asks the model to summarize older turns                                                                                                                                                                                | **P4 (NEW, small — extends S1/S7)**                                                                                                                                       |
| 6   | Pending tool-call HITL responses are `approve` / `reject` / **`edit`** (the human fixes a wrong argument instead of blanket-approving or blanket-rejecting); a 24h durable approval window; `ask_user_question` is excluded from the tool list on any HITL-incapable path so the model can't stall waiting for an answer nobody can give                                                                                                                                                   | `ext-agent`'s approval is `approve`/`deny` only (`panel-modals.tsx`, cited in `librechat-agent-ui-learnings.md` §B3); no edit-then-approve path                                                                                                                                                                                                                                                                        | Edit-before-approve is a genuinely new capability, not covered by the ui-learnings extraction (which covers approval-history _display_, not argument editing)                                                                                                                                                   | **P5 (NEW, small — extends S6/S8)**                                                                                                                                       |
| 7   | `schedules` (experimental): cron trigger, `maxPerUser`, `minIntervalMinutes`, `autoDisableAfterFailures`, project-required flag                                                                                                                                                                                                                                                                                                                                                            | `@tepegoz/tasks`: interval/pageChange/external triggers, `cooldownMs`, `maxRunDurationMs` (`packages/tasks/src/schemas.ts`) — **no failure-based auto-disable exists** (confirmed: zero matches for `failureCount`/`autoDisable` in the package)                                                                                                                                                                       | One small, concrete, missing operator guardrail                                                                                                                                                                                                                                                                 | **P6 (NEW, small — extends `@tepegoz/tasks`, Phase M)**                                                                                                                   |
| 8   | MCP tool trust: annotations (`readOnlyHint`/`destructiveHint`) are **read nowhere in the codebase**; approval is an operator-authored glob allow/deny/ask list, default **off**                                                                                                                                                                                                                                                                                                            | `dangerClassFor` fail-safe-interprets the same annotations (missing/false hint → `state_changing` → ask); MCP tools pass through the **same PEP** as builtin tools, no separate path (ADR-0018 §3–6)                                                                                                                                                                                                                   | None — Tepegoz already ahead on this exact axis                                                                                                                                                                                                                                                                 | **No gap — evidence, cited in "Why this track exists"**                                                                                                                   |
| 9   | Model-written memory (`set_memory`/`delete_memory`), opt-in per-agent isolation, token/char budgets, **read-time PII re-validation** — but injected into the prompt as plain trusted text, with a prompt instruction as the only injection defense                                                                                                                                                                                                                                         | ADR-0027: write-time threat filter (`decideWrite`/`detectThreats`), advisory `role:'user'` injection **outside the trusted task fence**, live-DOM re-validation of hints, quarantine-not-delete                                                                                                                                                                                                                        | None architecturally — the "actually used in production" gap is S9's own already-stated "no host wiring" line, not a new ask                                                                                                                                                                                    | **No new workstream — cite S9 (already 🟠, already says this)**                                                                                                           |
| 10  | Hash-chained, append-only `AuditLog` (SHA-256 over canonical JSON, `prevHash`, `GENESIS_HASH`, unique `{chainKey, seq}`, 7-layer immutability enforcement — verified in `data-schemas/src/schema/auditLog.ts`) — but `AUDIT_ACTIONS` contains **exactly two values**, `grant.assigned`/`grant.removed` (verified in `types/admin.ts`, matching the comparison doc's claim exactly), and a failed write is **fail-open by default** (`RecordAuditEntryOptions.failClosed` defaults `false`) | Event-sourced Journal (redacted payload, `cas://` blob refs) + `@tepegoz/notary` (Ed25519-signed checkpoint, portable Replay Receipt, independent `tepegoz-verify` CLI) — **not wired into a live run** (Phase 7 🟡)                                                                                                                                                                                                   | Both sides built a real cryptographic chain and neither feeds it from real events today — the most symmetric finding in the whole comparison                                                                                                                                                                    | **No new workstream — cite Phase 7 (already the honest "not wired" state); Tepegoz's design (a third-party-verifiable portable receipt) is the better target once wired** |
| 11  | A ~305-line hand-maintained $/1M-token pricing table, `Balance`/`Transaction` records, auto-reload, pre-flight `checkBalance`; but keyed by **fragile substring match** and an unrecognized model is silently billed a `defaultRate` (the file's own comment admits this is fragile)                                                                                                                                                                                                       | `TokenLedger` counts provider+model+capability granularity; no pricing table yet — `$/task` publication is north-star condition #4, owned by S7                                                                                                                                                                                                                                                                        | Already S7's own headline metric — the only new content here is a design lesson worth writing into S7's approach: **key any future pricing table by exact provider-catalog id (webbrain-parity P1), never by substring match, and fail loudly on an unrecognized model rather than silently billing a default** | **Sharpens S7 — cite, no new phase**                                                                                                                                      |
| 12  | Prompt-injection defense: **zero matches** for "prompt injection" anywhere in the LibreChat repository; the closest thing is a 13-source PII/secret regex filter plus a content-provenance label (not an injection defense)                                                                                                                                                                                                                                                                | `@tepegoz/tool-executor`'s `sanitizeText` (zero-width/bidi/homoglyph) + `wrapUntrustedContent`, sitting under a model-**pre**-model deterministic Policy Kernel + `EgressFirewall` (7 finding classes including Shannon-entropy blobs)                                                                                                                                                                                 | None — Tepegoz already has a concept LibreChat's codebase does not                                                                                                                                                                                                                                              | **No gap — evidence row**                                                                                                                                                 |

---

## UI-surface items — already extracted elsewhere, routed here

`librechat-agent-ui-learnings.md` already did the panel-UX extraction for `extensions/ext-agent`, grouped
A (take directly) / B (adapt) / C (deliberately not taken) / D (build order). **This track does not repeat
that extraction.** The table below only adds what that document doesn't carry: a phase/ADR home and a
one-line DoD hook per item, so a future session can promote a row without re-reading the source comparison.
Group C is already covered by [Ground rules](#ground-rules--parity-not-imitation) above (items 2 and 4 map
to its Artifacts/Code-Interpreter-adjacent and Agent-Plugins entries); group D (implementation order) needs
no separate home — it already sequences A/B against each other.

| Item | What (see the doc for full detail)                                                                                 | Home                                                                                                                                                  | DoD hook                                                                                                                                                                                                                                                                          |
| ---- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1   | Steer queue + pending-steer chips + apply receipt                                                                  | extends S8 (`extensions/ext-agent` panel-state + a small IPC contract change)                                                                         | - [ ] a queued steer is **not applied** until the next model call and can be revoked/edited up to that point; the apply event is journalable (mirrors ADR-0027's "advisory, not a second instruction channel" framing — a queued steer is trusted user input, never page-derived) |
| A2   | Context-fullness gauge, separate from the cost/token counter                                                       | extends S1/S7; consumes the SAME data P4 below would also touch                                                                                       | - [ ] the gauge reads `cache-window`'s live breakpoint state — no new token-estimation logic, no new model call                                                                                                                                                                   |
| A3   | Activity-phase grouping + live tool-intent label, **derived from the Planner's DAG**, not model-generated headers  | extends S8                                                                                                                                            | - [ ] phase headers come from existing DAG step boundaries; tool-intent text comes from the tool descriptor's `description` field — zero additional model tokens spent on narration                                                                                               |
| A4   | Message-level copy / quote / edit-resend                                                                           | extends S8 (renderer-only, reuses `panel-attachments.ts`'s selected-text-attachment path)                                                             | - [ ] the quote chip is a variant of the existing attachment mechanism, not a parallel one                                                                                                                                                                                        |
| B1   | Multi-question `clarify` (up to 4 questions/turn, schema-bounded)                                                  | extends S6/S8 + `@tepegoz/shared-types` (schema change)                                                                                               | - [ ] question/option text passes through `sanitizeText`; answers are injected as trusted user input, outside the taint fence, exactly like today's single-question path                                                                                                          |
| B2   | Skill-active pill (visibility only — which skill shaped this turn)                                                 | extends S9, **after its own sweep** (same anti-debt gate `webbrain-agent-parity.md` P5 already states, since this is the same mechanism's UI surface) | - [ ] the pill never implies auto-loading — ADR-0027's "a skill can never start itself" stays intact; explicitly gated behind S9 reaching ✅                                                                                                                                      |
| B3   | Persistent approval-history card in the transcript (the approval modal itself stays — it is deliberately blocking) | extends S8, reads existing Journal entries                                                                                                            | - [ ] the card is read-only and Journal-sourced; it adds no new consent surface and cannot itself grant anything                                                                                                                                                                  |
| B4   | Provider/model/autonomy line at the top of each turn                                                               | extends S8, reads existing Journal entries                                                                                                            | - [ ] the line is read-only and Journal-sourced (the data already exists; only the panel doesn't show it)                                                                                                                                                                         |

---

## P1 — MCP transport + OAuth parity (extends ADR-0018)

**Goal.** Close the gap ADR-0018 already named on its own ("`http_sse` in schema, transport not written")
and add what it never speced at all — OAuth — without weakening anything ADR-0018 already decided: every
MCP tool still registers into the one `CapabilityRegistry`, still gets a fail-safe `dangerClassFor`
verdict from its annotations, and still passes through the same PEP as a builtin tool.

**Approach.**

- **Add `websocket` and `streamable-http` transports alongside the already-schema'd `http_sse`**, behind
  `@tepegoz/mcp-client`'s existing `Transport` seam (ADR-0018 §5: `main/mcp/transport.electron.ts` injects
  the concrete transport; the package itself stays Electron-free). The official
  `@modelcontextprotocol/sdk` (already pinned at `1.22.0` per ADR-0018) ships all four transport classes —
  this is wiring, not new protocol work.
- **OAuth, scoped narrower than LibreChat's:** PKCE (S256) + dynamic client registration + RFC 9728
  protected-resource discovery are worth adopting close to verbatim — LibreChat's own
  `packages/api/src/mcp/oauth/` is a clean, SDK-native implementation of the spec, not a LibreChat-specific
  invention. **What does not need to come along:** LibreChat's on-behalf-of (OBO) token exchange and its
  per-user token store exist because LibreChat is multi-tenant; Tepegoz is single-user, so tokens live in
  `@tepegoz/credential-vault` (BYO-key, OS-backed) like every other secret, not in a new per-user table.
- **Every new transport's outbound connection goes through P2's hardened-fetch primitive**, not a second
  one — LibreChat itself makes this mistake worth avoiding: its OAuth handler
  (`createHardenedOAuthFetch`) and its `MCPConnection` class each carry their **own** SSRF-hardening call
  site (`isSSRFTarget`/`resolveHostnameSSRF` appears in both `oauth/handler.ts` and `connection.ts`
  independently) rather than sharing one. Tepegoz should have exactly one hardened-fetch seam
  (P2's) that both the MCP transport layer and the OAuth flow call into.
- **Budgets and circuit-breaking**, sized down from LibreChat's per-user numbers to this repo's
  single-session reality: a tools-list page/byte cap (LibreChat's 50-page/1000-tool/5 MiB ceiling is a
  reasonable starting point, tunable), a reconnect circuit breaker, and `notifications/tools/list_changed`
  handling so a long-lived MCP connection's tool list can change without restarting the run.
- **Trust-warning text for a user-added server**, shown once at add-time (LibreChat's own wording — "this
  server was not reviewed; it may try to steal your data or trick the model into unwanted actions" — is
  worth adapting almost verbatim, translated EN+TR per ADR-0016).

**New/changed packages:** `@tepegoz/mcp-client` (transports, OAuth flow, budgets), `main/mcp/
transport.electron.ts` + a new `main/mcp/oauth.electron.ts` (Electron-side token storage via
`@tepegoz/credential-vault`), Settings → Connections UI (ADR-0018 §8 already scoped add/edit/remove to a
later phase — this is that later phase).

**ADR:** addendum to ADR-0018, recording the transport + OAuth decision and the "one hardened-fetch seam
shared with P2" rule explicitly, so a future session doesn't duplicate the SSRF check the way LibreChat's
own two call sites did.

**DoD shape (draft):**

- [ ] A `streamable-http` and a `websocket` MCP server both connect, list tools, and complete a `tools/call`
      round-trip through the existing PEP — same test shape ADR-0018 already uses for `stdio`
- [ ] An OAuth-protected MCP server completes PKCE + dynamic registration + RFC 9728 discovery end-to-end
      against a test server; the resulting token is stored via `@tepegoz/credential-vault`, never in
      plaintext, never logged
- [ ] The OAuth flow's outbound calls and every MCP transport's outbound calls resolve through the SAME
      hardened-fetch function P2 ships — a test proves there is one call site, not two
- [ ] i18n: the trust-warning copy, connection-state labels, and any new Settings → Connections controls
      ship EN+TR in the same PR

---

## P2 — Hardened outbound fetch for `@tepegoz/http` (extends `@tepegoz/web-tools`)

**Goal.** Close a **verified, shipping** gap this reading found and the comparison document did not call
out: `web_get_page`'s backing implementation fetches an arbitrary agent- or page-supplied URL with no
private-IP, loopback, or cloud-metadata check, and follows redirects without re-checking the redirect
target. An agent told to "fetch `http://169.254.169.254/latest/meta-data`" — or one following a link a
malicious page redirected to a LAN host — succeeds today.

**Approach.**

- **One hardened-fetch primitive in `@tepegoz/http`**, not a per-tool patch: reject a target whose hostname
  resolves (at **connection time**, not just at URL-parse time — this is the specific technique that
  defeats DNS rebinding, and it's the one piece of LibreChat's design worth copying closely: resolve the
  hostname, check the **resolved IP** against the private/loopback/link-local/multicast ranges, THEN
  connect to that literal IP, so a TTL-0 DNS answer can't swap the target between the check and the
  connect) is private (RFC1918), loopback, link-local (`169.254.0.0/16`, which is where AWS/GCP/Azure
  instance metadata lives), or otherwise non-routable. Apply this to `web_get_page`, `web_search`'s result
  fetch, and P1's new MCP transports/OAuth calls alike — one function, several call sites.
- **Redirects re-validated per hop, capped, and dropped rather than followed into a private target** —
  `sitemap-reader.ts` already has the right instinct (`maxRedirects: 0` on its one fetch, with a comment
  explaining why); generalize that instinct into the shared primitive instead of leaving it a local
  workaround in one file.
- **An explicit allowlist for the loopback exception this repo already needs**, matching the discipline
  `@tepegoz/security-policy`'s `egress-proxy.ts` already applies to VPN bypass rules
  (`LOOPBACK_HOSTS = {127.0.0.1, localhost, [::1], ::1}`, nothing wider) — local MCP `stdio`/dev tooling
  stays reachable, nothing else does.
- **No new enforcement mechanism** — `EgressFirewall`'s content-based scanning (secret/entropy detection on
  what comes back) is unaffected and unchanged; this closes the _target_ side (where a request may go), not
  the _content_ side (what a response may contain), which was already handled.

**New/changed packages:** `@tepegoz/http` (the hardened-fetch primitive + a `createHttpClient` option to
require it), `@tepegoz/web-tools` (no interface change — `WebToolsHost.fetch`/`.search` keep their
signature; only the desktop host implementation changes), `apps/desktop/src/main/web/
web-tools-host.electron.ts` (adopt the primitive, replacing the current direct `client.get`).

**ADR:** none needed — this is hardening an existing seam to match a decision already on record
(`EgressFirewall`, the sensitive-site lockout), not a new security decision.

**DoD shape (draft):**

- [ ] A request to a private/loopback/link-local/metadata target is rejected before any bytes are sent,
      proven with a unit test against the exact `169.254.169.254` case the sitemap reader's own test suite
      already uses as a canary (`sitemap-reader.test.ts` line "must be dropped")
- [ ] A redirect chain that lands on a private target is dropped, not followed — tested with a fixture
      server that 302s to a loopback address
- [ ] `web_get_page` and `web_search`'s result-page fetch both route through the new primitive — a test
      asserts there is no remaining direct `client.get`/`axios` call in `web-tools-host.electron.ts`
      bypassing it
- [ ] P1's new MCP/OAuth transports use the same primitive (cross-referenced in P1's own DoD)

---

## P3 — OpenAPI-spec import as a front-end for skill tool-manifests (extends webbrain-agent-parity P5)

**Goal.** LibreChat's Actions UX — paste an OpenAPI spec, get callable tools, pick an auth mode — is
genuinely good onboarding. Adopting it as a **fourth external-tool-registration path**, alongside
MCP-client (ADR-0018), P1's OAuth-MCP, and `webbrain-agent-parity.md` P5's skill-declared HTTP-tool
manifest, would fragment the "one PEP" promise into "one PEP, N onboarding stories." This workstream is
explicitly **not that** — it is an import UI that _emits_ P5's manifest shape, so there is still exactly
one way a narrow HTTP tool enters the system.

**Approach.**

- A parser that reads an OpenAPI 3.x spec and, for each operation, emits one entry in P5's tool-manifest
  shape (`{name, method, endpoint (fixed host, no redirects), parameters (from the operation's JSON
Schema), resultPolicy: 'untrusted'}`) — this is a **generator**, not a new runtime path; the emitted
  manifest is validated and stored exactly like a hand-written one.
- **Auth-type taxonomy worth adopting close to verbatim**, because it's a clean, complete small enum:
  `none` / `service_http` (with `basic`, `bearer`, or a custom header name) / `oauth`. `oauth` here reuses
  P1's OAuth flow and `@tepegoz/credential-vault` token storage — no second OAuth implementation.
  Domain-binding stays what P2 already enforces (fixed host, no redirects, hardened fetch) — LibreChat's
  own Actions layer leans on the same class of SSRF protection its MCP layer does, which is exactly the
  "one hardened primitive, many call sites" principle P1/P2 already establish.
- **The trust decision is still importing/enabling the skill**, per P5's own framing (`webbrain-agent-parity.md`
  P5: "Importing a skill is the trust boundary for its declared HTTPS endpoint") — an OpenAPI spec with 40
  operations is 40 tools a user is agreeing to at once, and the import UI should say so plainly before
  enabling.

**New/changed packages:** none beyond what `webbrain-agent-parity.md` P5 already names
(`@tepegoz/persistence` skill-store schema, S9's skill-loading path, `@tepegoz/capability-plane`
registration) plus a small OpenAPI-parsing utility, likely inside `@tepegoz/persistence` or a new
Electron-free leaf package next to it.

**ADR:** shares P5's addendum to ADR-0027 — this is a front-end on the same mechanism, not a new decision.

**DoD shape (draft):**

- [ ] Importing a spec produces manifest entries indistinguishable, from the ToolGateway's point of view,
      from a hand-written P5 manifest entry — same zod validation, same PEP path
- [ ] The import UI enumerates every operation that will become a tool and requires one explicit
      enable/trust action for the whole import, not per-operation
- [ ] Explicitly gated behind S9 reaching ✅ first, same as P5 (per the anti-debt rule — this is strictly
      more surface on the same not-yet-measured mechanism)
- [ ] i18n: import flow copy, the auth-mode picker, and the "N tools from this spec" trust summary ship
      EN+TR in the same PR

---

## P4 — Model-generated conversation summary as a compaction fallback tier (extends S1/S7)

**Goal.** `cache-window.ts` and the Reactor's working-state collapse are deterministic and cheap, but they
reorder and elide — neither ever asks the model to produce an actual running summary of what happened
earlier in a long conversation. LibreChat's `retainRecent`/`contextPruning`/token-ratio-triggered
summarization is a different, complementary tool: a last-resort compaction tier for the case deterministic
elision can't shrink further (a genuinely long back-and-forth, not just a lot of stale tool output).

**Approach.**

- Add a **fourth, last-resort compaction tier** behind the existing cache-window/collapse machinery: only
  triggers past a token-budget threshold cache-window elision alone can't clear, mirroring LibreChat's
  `token_ratio`/`remaining_tokens` trigger shape.
- **The summary call is a normal, budgeted `ModelGateway.complete()` call** — `maxTokens`+`timeoutMs`
  required like every other call (ADR-0005's own invariant), logged to `TokenLedger` under its own
  capability tag so its cost is visible and not hidden inside "reasoning" spend.
- **Route it to a cheaper/faster model than the task's main model**, same as LibreChat's own design —
  `ModelRouter`'s existing capability→tier mapping already has the shape for this (a `summarize` capability
  alongside `plan`/`exec`/`classify`), it just needs a new capability tag added, not a new routing
  subsystem.
- **Determinism-first tension, stated plainly:** this is a model call whose OUTPUT becomes part of the
  context that drives future tool calls — a wrong summary (a dropped constraint, a misremembered value) is
  a new failure class this repo hasn't had before. Mitigate by keeping the summary strictly **advisory
  narrative**, never a source of NEW facts the reactor acts on directly (the underlying `CompletionEvidence`
  and tool-result records it summarizes stay in the run's durable state, so a bad summary degrades
  narration quality, not ground truth) — the same "advisory, re-validated, never a second instruction
  channel" posture ADR-0027 already applies to memory.
- **A visible marker when this fires** (`librechat-agent-ui-learnings.md` A2's context-fullness gauge is the
  natural place to surface it), so the user sees "context was summarized here" the way LibreChat's own
  "Context automatically compacted" separator does.

**New/changed packages:** `@tepegoz/orchestrator` (the trigger + the summarize step), `@tepegoz/model-gateway`
(a `summarize` capability tag on `ModelRouter`), `extensions/ext-agent` (the visible marker, tying into A2).

**ADR:** addendum to ADR-0025 (streaming/context boundary) or a small new ADR under S7 — deferred to
whichever session actually opens this; no number reserved here, per the multi-profile-track lesson.

**DoD shape (draft):**

- [ ] The summarize call only fires past the threshold cache-window elision alone cannot clear — a test
      proves a normal-length run never invokes it
- [ ] The summary call is capped (`maxTokens`+`timeoutMs`) and its cost appears in `TokenLedger` under its
      own capability tag
- [ ] A trap-fixture test proves a summarized-then-continued run still completes correctly on a fact that
      was in the summarized portion — this is the actual claim being made, not just "it doesn't crash"
- [ ] The wall-clock/token verdict (does this net save or cost, once the summarize call itself is counted)
      is a claim for S7's own sweep to make, not this workstream — the DoD here is correctness, not the
      cost claim
- [ ] i18n: the visible "context summarized" marker ships EN+TR in the same PR as A2

---

## P5 — Edit a pending tool call's arguments before approving (extends S6/S8)

**Goal.** LibreChat's tool-approval HITL offers three answers — `approve` / `reject` / `edit` — not two.
Today's `ext-agent` approval modal (`panel-modals.tsx`) offers only approve/deny. The missing middle option
matters in a specific, common case: the agent got the _right tool, wrong argument_ (a mistyped recipient,
the wrong row selected, a slightly-off date), and today the only recovery is deny-and-hope-the-retry-does-
better or approve-and-accept-the-mistake.

**Approach.**

- **The edited arguments are NOT trusted just because a human typed them into a form field that started
  with model-generated content.** They go back through the **exact same pipeline** a fresh model-issued
  call would: zod `safeParse` against the tool's `inputSchema`, then `PolicyKernel.evaluate` again on the
  **edited** values — not the original ones. This is the one non-negotiable design constraint: an edit
  cannot be a side-channel that skips re-classification. Concretely, if editing the destination of a
  `download_*` call turns a `data-egress`-tier action into a `financial`-tier one, the edit must re-trigger
  the higher tier's prompt, not silently inherit the lower tier's already-granted approval.
  it re-prompts, it does not extend the grant" (`docs/adr/0006-policy-kernel-hitl.md`).
- **Provenance of the edit is journaled distinctly from the model's original proposal** — the audit record
  should show both the model's original argument values and the human's edited ones, so a later review can
  see exactly what changed and who changed it. This is a strictly more honest record than LibreChat's own
  (which records the final args, not the diff).
- **UI-side, this is additive to the existing modal**, not a replacement: `approve`/`deny` stay one click;
  `edit` opens the same argument fields LibreChat exposes (LibreChat renders the tool's JSON Schema as a
  form — worth copying that rendering approach, it's a solved problem) pre-filled with the model's values.

**New/changed packages:** `@tepegoz/agent-runtime` (the HITL response type gains an `edit` variant carrying
the revised arguments, which re-enters the PEP), `@tepegoz/security-policy` (no new logic — confirms the
existing `PolicyKernel.evaluate` re-run already handles re-classification correctly for this path, since it
is a pure function of tool×taint×target and doesn't care whether the args came from the model or an edit),
`extensions/ext-agent` (`panel-modals.tsx` gains the edit form + the argument-diff record in the transcript,
which can share plumbing with `librechat-agent-ui-learnings.md` B3's approval-history card).

**ADR:** addendum to ADR-0013 (agent orchestration + two-stage HITL) — the two-stage HITL model gains a
third response shape at the tool-level stage; the plan-preview stage is unaffected.

**DoD shape (draft):**

- [ ] An edited argument set is re-validated by zod and re-classified by `PolicyKernel.evaluate` before
      execution — a test proves an edit that raises the risk tier re-prompts rather than executing
- [ ] An edit can never widen scope past what the ORIGINAL call's classification would have allowed for a
      grant-covered action (mirrors ADR-0006's "an off-scope action re-prompts, it does not extend the
      grant")
- [ ] The journal records both the model's proposed arguments and the human's edited ones as distinct fields
- [ ] i18n: the edit form's labels and the "edited by you" transcript marker ship EN+TR in the same PR

---

## P6 — Task scheduler failure guardrails (extends `@tepegoz/tasks`, Phase M)

**Goal.** `@tepegoz/tasks` already has `cooldownMs` (LibreChat's `minIntervalMinutes` equivalent) and
`maxRunDurationMs`. It has no equivalent of LibreChat's `autoDisableAfterFailures` — a saved task with a
selector that broke, or a site that changed shape, will keep firing on its interval trigger forever,
retrying the same failure, rather than flagging itself for review.

**Approach.**

- Add a `consecutiveFailureCount` to `TaskDefinition` (or a companion record in `TaskStore`), incremented on
  a `TaskRunRecord` with `status: 'failed'`, reset to 0 on any successful run.
- A `maxConsecutiveFailures` field in `TaskPolicySchema` (optional, sensible default e.g. 3–5), past which
  the task's `status` flips to a new `disabled-after-failures` state — distinct from a user-initiated
  pause, so the Tasks UI can say _why_ it stopped rather than just that it's off.
- `notifyOnError` (already in `TaskPolicySchema`) fires on the disabling run specifically, so the user
  learns about it once rather than N times as it kept retrying.
- No change to the unattended-run trust model: a disabled task simply stops being scheduled; it does not
  change what a running task's `preapprovedWriteTools`/`allowedOrigins` may do.

**New/changed packages:** `@tepegoz/tasks` (schema + `TaskStore` + the desktop `TaskService` scheduler's
failure-counting), `@tepegoz/tasks-ui` (the disabled-after-failures state + reason, and a one-click
re-enable that resets the counter).

**ADR:** none needed — a deterministic guardrail on an already-shipped mechanism, not a new security
decision.

**DoD shape (draft):**

- [ ] N consecutive failed runs (configurable, defaulting to a small number) flips the task to
      `disabled-after-failures` and it is not scheduled again until a user re-enables it
- [ ] A single success resets the counter to 0
- [ ] The disabling run's failure triggers exactly one notification, not a repeat per subsequent
      would-have-fired interval
- [ ] i18n: the new task-status label and its explanatory copy ship EN+TR in the same PR

---

## Backlog (named, not written up)

- **Durable, resumable HITL approval window (LibreChat's 24h checkpoint-backed approval)** — real, but it's
  a special case of durable run resume, which `phases/product/phase-1b-agentic-deepening.md` already owns
  and is frozen out of v1. Revisit only once Phase 1b's durable-resume work actually lands; don't build a
  parallel resume mechanism just for the approval case.
- **A generic content-provenance taxonomy wider than Tepegoz's current binary untrusted/trusted split**
  (LibreChat's `user`/`administrator`/`model`/`tool`/`retrieval`/`system`/`external_agent`) — considered and
  set aside, not forgotten: `@tepegoz/security-policy`'s `Provenance` type is deliberately coarse
  (`isUntrustedProvenance` treats exactly `web`/`model` as untrusted, everything else as trusted) precisely
  to minimize the surface a misclassification could exploit. A finer taxonomy would need a concrete case it
  solves that the binary split doesn't, which this reading didn't surface. Worth revisiting only if a real
  scenario needs it, not proactively.

---

## Routing — what this track does not own

Per the existing convention ([`../README.md`](../../phases/README.md#deferred--adoption-gated-backlog-from-the-beyond-phases-synthesis)
/ [`ai-agent/README.md`](../../phases/ai-agent/README.md#routing--what-stays-out)), reference these, never
duplicate them:

| Stays with                            | Material                                                                                                                    |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **`webbrain-agent-parity.md` P1**     | Provider-catalog breadth (row 3 above sharpens it with LibreChat's brand-detection table + settings-search-order reference) |
| **`webbrain-agent-parity.md` P5**     | The base skill-tool-manifest mechanism P3 above builds an import front-end for                                              |
| **`librechat-agent-ui-learnings.md`** | All `extensions/ext-agent` panel-UX items (A1–A4, B1–B4) — routed with homes above, not re-extracted                        |
| **Phase 1b**                          | MCP **server**, durable resume/checkpoint (the Backlog's approval-window item), true parallel DAG                           |
| **Phase 7**                           | Notary/Journal wiring — already the honest "not connected" state; this track adds no new ask                                |
| **S7**                                | `$/task` publication (north-star condition #4) — row 11 above adds a design lesson, not a new ask                           |
| **S9**                                | Memory host-wiring — already S9's own stated remaining scope                                                                |
| **ADR-0013**                          | Single-concurrent-run — not revisited (see Ground rules, item 3)                                                            |
| **ADR-0026 / ADR-0029**               | Code-exec / DevTools boundary — not revisited (see Ground rules, item 1)                                                    |
| **ADR-0027**                          | "A skill never starts itself" — not revisited (see Ground rules, item 4)                                                    |

## ADRs owed (numbers assigned when a session actually opens one of these)

- P1: addendum to **ADR-0018** (MCP client — transport + OAuth)
- P2: none — hardening an existing seam, not a new decision
- P3: shares P5's addendum to **ADR-0027** (`webbrain-agent-parity.md`) — a front-end on the same mechanism
- P4: addendum to **ADR-0025** or a new small ADR under S7 — not determined here
- P5: addendum to **ADR-0013** (agent orchestration + two-stage HITL — a third tool-level response shape)
- P6: none — a deterministic guardrail, not a new security decision

No number is reserved here; per this repo's own multi-profile-track lesson (`multi-profile-isolation.md`
— an ADR-number collision from writing a plan too far ahead of when it's actually opened), the number gets
assigned at the point a session actually starts the work, not now.
