# Track — Browserless agent-capability parity

**Status:** 📋 **Proposed — not scheduled (2026-09-02).** No branch, no ADR number reserved, no owner
sign-off. This is a captured gap list in the shape of
[`browser-settings-feature-gap.md`](../tracks/browser-settings-feature-gap.md) and
[`webbrain-agent-parity.md`](webbrain-agent-parity.md): every row names its nearest existing Tepegöz
behaviour and a suggested phase home, so a future session can promote a row into a real `phase-*.md` task
or an `ai-agent`/`ai/product` PR without re-deriving the comparison.

**Source:** a same-session deep read of `.junk/browserless` (Browserless v2.56 — a Docker-hosted,
SSPL-1.0/commercial-dual-licensed Browser-as-a-Service: `README.md`, `LICENSE`, and open-core `src/`
— `router.ts`, `limiter.ts`, `token.ts`, `network-security.ts`, `webhooks.ts`, `monitoring.ts`) against
`docs/others/tepegoz-vs-browserless.md` (the prior comparison) and this repo's AI/network surface
(`packages/http`, `packages/web-tools`, `packages/security-policy`, `packages/orchestrator`,
`apps/desktop/src/main/web/web-tools-host.electron.ts`, `docs/adr/*`). Every claim carried over from the
comparison doc was re-checked against current source rather than trusted as written — two corrections
came out of that pass and are recorded below where they matter, not asserted as new capability.

## Why this track exists

The comparison this track is built on already reaches an honest, load-bearing conclusion: **Browserless
and Tepegöz are not competitors, they are neighboring layers.** Browserless is a browser-_infrastructure_
product — a queued, health-monitored Chrome/Chromium/Edge/Firefox/WebKit pool that other people's
Puppeteer/Playwright scripts connect to over `ws://`/CDP. It has no model, no planner, no policy kernel —
the agent intelligence lives entirely in whatever script drives it. Tepegöz drives its own Chromium
in-process (`@tepegoz/browser-tools` `BrowserHost` + the desktop `cdp-driver*` modules) and has no
external pool to connect to, so "which is the better agent" is not a question Browserless's side can even
answer. This track's job is narrower than the WebBrain/AIPex tracks it sits beside: **find the small
number of things in Browserless's _open_ core that are genuinely good engineering Tepegöz's outbound-HTTP
and future parallel-run surfaces can learn from, and say so plainly when there is nothing to learn** —
most of what makes Browserless differentiated (BQL stealth, CAPTCHA solving, `/crawl` `/map` `/search`
`/smart-scrape`, the MCP server, session replay) is premium and closed, with no source in `.junk/browserless`
to read, port, or even meaningfully compare against.

## How to read this

Both workstreams below are written like an `ai-agent`/product-phase section (Goal → Approach →
new/changed packages → ADR owed → DoD-shaped bullets) so either can be lifted into a real phase file with
minimal rewriting. **Nothing here is committed roadmap.** One workstream is genuinely new and small; the
other sharpens a scheduler line [Phase 1b](../../phases/product/phase-1b-agentic-deepening.md) already states
("topological order → independent branches to parallel workers; join sync; adaptive throttling (default
5)") but does not yet have mechanics for — and Phase 1b is itself frozen out of v1, so that workstream is
explicitly reference material for whenever it resumes, not new work opened now. Per the "Already planned
— do NOT re-propose" rule in [`../README.md`](../../phases/README.md#deferred--adoption-gated-backlog-from-the-beyond-phases-synthesis),
Browserless's MCP **server** is Phase 1b's already-named "MCP SERVER surface," not a new ask.

## Ground rules — parity, not imitation

One Browserless capability is **deliberately not being matched**, because matching it would violate a
standing decision this repo already made after deliberation:

1. **No CAPTCHA solving.** Browserless's premium BrowserQL (BQL) layer solves CAPTCHAs on the caller's
   behalf, spending a third-party solver's quota. ADR-0039 already chose the opposite shape: CAPTCHA (and
   2FA) is a **Human Handoff** event — the agent stops, tells the user why, and hands back control. Keep
   the handoff; do not add a solver.

Everything else Browserless does that Tepegöz doesn't is not a rejected design, it's **unreadable** —
BQL's fingerprint randomization, residential-proxy rotation, `/crawl`/`/map`/`/search`/`/smart-scrape`,
the MCP server, and session-replay recording are all premium/closed. There is no ADR to write against
code that was never shipped to `.junk/browserless` in the first place; the honest classification for that
whole slice is "no source to adopt from," recorded once here rather than repeated per row below.

---

## Capability inventory

Legend for **Home**: an existing phase/ADR name means "already planned, this row sharpens it or simply
cites it, no new phase needed." **NEW** means no existing phase owns it and this track proposes one.
**N/A** means the capability doesn't transfer — different product category, different threat model, or no
source exists to read.

| #   | Browserless capability                                                                                                                                                                                                                                                                                                                                                             | Nearest Tepegöz behaviour today                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Gap                                                                                                                                                                                                  | Home                                                                                                                                                               |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Browser-as-a-Service: a queued, health-monitored Chrome/Chromium/Edge/Firefox/WebKit pool other scripts connect to over `ws://`/CDP                                                                                                                                                                                                                                                | Tepegöz drives its own Chromium in-process (`@tepegoz/browser-tools` `BrowserHost` + desktop `cdp-driver*`) — no external pool to connect to, no scripts to serve                                                                                                                                                                                                                                                                                                                                                      | None — different product category; Tepegöz is the browser+agent, not infrastructure a third-party script connects to                                                                                 | **N/A** — see "Why this track exists"                                                                                                                              |
| 2   | Multi-browser-engine support (chrome/chromium/edge/firefox/webkit), ARM64 Docker images                                                                                                                                                                                                                                                                                            | Single engine (Chromium/Electron)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Cross-engine automation/testing coverage                                                                                                                                                             | **N/A** — a native single-browser product has no second rendering engine to drive                                                                                  |
| 3   | `token.ts` API-token auth for a shared remote service                                                                                                                                                                                                                                                                                                                              | No remote service boundary — the user is the authenticated principal; `PolicyKernel` gates by danger-class + taint + site, not by caller identity                                                                                                                                                                                                                                                                                                                                                                      | None — different threat model                                                                                                                                                                        | **N/A** — no service boundary exists to authenticate against                                                                                                       |
| 4   | `limiter.ts`: concurrency + queue-size limits, health-check-gated admission (CPU/memory overload via `monitoring.ts`), a `bypassLimitsFn` escape hatch, per-job timeout with a dedicated `onTimeoutFn`, billing-clock-starts-at-execution-not-admission; `webhooks.ts` fire-and-forget alert hooks (queue/reject/timeout/error/health-fail), each a logged-not-thrown side channel | ADR-0013 serialized single run; Phase 1b's L3 already specifies "topological order → parallel workers; join sync; adaptive throttling (default 5)" as a scheduler goal, with no admission/backpressure/alerting mechanics written yet                                                                                                                                                                                                                                                                                  | The concrete queue-admission/backpressure/alerting shape Phase 1b's one-line scheduler goal doesn't have                                                                                             | **P2 (sharpens Phase 1b L3, frozen — reference only until 1b resumes)**                                                                                            |
| 5   | `network-security.ts`: `isBlockedNavigationUrl`/`findBlockedNavigationUrl` — an obfuscation-resistant (decimal/octal/hex IPv4, `::ffff:`-mapped IPv6) private-network + protocol classifier, checked before every navigation and every wire-protocol `goto`                                                                                                                        | `EgressFirewall` scans **outbound payload content** (secrets/entropy/PII) — a different check aimed at exfiltration, not destination. The sitemap/robots reader is "SSRF-safe by construction" only because it's same-origin-only with redirects disabled. **`web_get_page`/`web_search`'s `fetchPage` (`apps/desktop/src/main/web/web-tools-host.electron.ts`) calls `client.get(input.url, …)` — the model's/page's URL, dispatched through `@tepegoz/http`'s `createHttpClient` — with no host/IP check at all**    | A model-reachable, prompt-injection-triggerable fetch tool can be pointed at `127.0.0.1`, an RFC1918 LAN address, or `169.254.169.254` (cloud metadata) today with nothing stopping it               | **P1 (NEW, small — extends `@tepegoz/http`/`@tepegoz/web-tools`)**                                                                                                 |
| 6   | Premium (closed): BQL detector-evasion, fingerprint randomization, residential-proxy rotation, Chrome-extension injection (ad-block/CAPTCHA-solver)                                                                                                                                                                                                                                | `@tepegoz/human-input` movement realism (CDP `isTrusted` events); fingerprint-randomization posture is **Phase 2** (frozen)                                                                                                                                                                                                                                                                                                                                                                                            | No code in `.junk/browserless` to read                                                                                                                                                               | **N/A** — nothing to adopt from; Phase 2 already owns the one adjacent item (fingerprinting)                                                                       |
| 7   | Premium (closed): CAPTCHA solving via BQL                                                                                                                                                                                                                                                                                                                                          | ADR-0039 Human Handoff — hands control back to the user, never solves                                                                                                                                                                                                                                                                                                                                                                                                                                                  | —                                                                                                                                                                                                    | **Rejected — ADR-0039** (Ground rules, item 1)                                                                                                                     |
| 8   | Premium (closed): `/crawl` (whole-site async LLM-ready extraction), `/map` (sitemap + search-ranked links), `/search` (web search → markdown/HTML/screenshot per result), `/smart-scrape` (HTTP→proxy→headless→CAPTCHA escalation)                                                                                                                                                 | `@tepegoz/web-tools` (`web_search`/`web_get_page`, read-only, PEP-gated) + `@tepegoz/reader` (typed article extraction) — narrower, but open                                                                                                                                                                                                                                                                                                                                                                           | No code to read; this is the same "LLM-ready web extraction" axis already covered against dedicated products                                                                                         | **N/A here** — see `tepegoz-vs-firecrawl.md` / `tepegoz-vs-crawl4ai.md` for that axis; not re-litigated in this track                                              |
| 9   | Premium (closed): MCP **server** — Claude Desktop/Cursor/VS Code/Windsurf connect directly to Browserless's own browser automation                                                                                                                                                                                                                                                 | MCP **client** only (ADR-0018); routes external MCP tools into the one `CapabilityRegistry`/PEP                                                                                                                                                                                                                                                                                                                                                                                                                        | Opposite direction, already named                                                                                                                                                                    | **Phase 1b** (already planned — "MCP SERVER surface"; do not re-propose)                                                                                           |
| 10  | Premium (closed): session replay (event capture + video playback), persistent sessions (cookie/cache/localStorage retained up to 90 days)                                                                                                                                                                                                                                          | `ext-agent` replay timeline + event journal ship today. `@tepegoz/notary`'s Replay Receipt (hash-chain + Ed25519 checkpoint + standalone `tepegoz-verify` CLI) is **written and unit-tested, but `apps/desktop` does not import it anywhere** (confirmed: no import outside a doc-comment mention) — **no run produces a receipt today**, exactly as ADR-0030 itself already records. Native profile persistence already keeps cookies/cache/localStorage indefinitely; run-checkpoint resume is written but not wired | Nothing to close by imitation — Browserless's replay is debug/QA video, a different artifact than a cryptographic receipt. The real gap is **wiring an already-built package**, not a missing design | **Phase 7** (already planned, already the harder target; the one concrete next step it's missing is importing `@tepegoz/notary` into a live run, not a new design) |
| 11  | `monitoring.ts`/`metrics.ts`: cgroup-aware CPU/memory-overload admission gating (`systeminformation`, `/sys/fs/cgroup` reads)                                                                                                                                                                                                                                                      | `TokenLedger` (cost/quota) + diagnostic bundle export — a cost/audit focus, not a host-resource-pressure focus                                                                                                                                                                                                                                                                                                                                                                                                         | A single desktop app's resource-pressure question ("is a local model saturating this machine?") differs from a Docker fleet's ("should I reject a new session?")                                     | **Backlog** — named below, not written up                                                                                                                          |

---

## P1 — Destination-validation guard for agent-driven outbound fetch (NEW, small)

**Goal.** Close a real, verified gap: `web_get_page`/`web_search` dispatch whatever URL the model (or a
page, through indirect prompt injection — "visit this URL for more detail") supplies, through
`@tepegoz/http`'s `createHttpClient`, with **no check that the resolved host isn't loopback, an RFC1918
LAN address, a link-local address, or `169.254.169.254`/cloud-metadata.** This is precisely the class of
request Browserless's `network-security.ts` was built to reject before every navigation — not the code,
the _design_: a small, pure, obfuscation-resistant classifier (canonicalizing decimal/octal/hex/short-form
IPv4 and `::ffff:`-mapped IPv6 before matching a private-range/hostname/protocol blocklist) sitting at a
single choke point.

**Approach.**

- A new pure module (in `@tepegoz/http`, next to `egress-route.ts`, or a sibling) mirroring
  `isBlockedNavigationUrl`'s shape: canonicalize the resolved host, reject loopback / RFC1918 (`10.`,
  `172.16.-172.31.`, `192.168.`) / link-local (`169.254.`, `fe80:`) / cloud-metadata
  (`169.254.169.254`) / IPv6 equivalents (`::1`, `fc00::/7`, `::ffff:`-mapped v4), same canonicalization
  discipline Browserless's own doc-comments call out (decimal/octal/hex/short-form IPv4 all being
  equivalent to the caller but not to a naive string-prefix check).
- Enforce it at `createHttpClient` itself — the package's own docblock already calls it "the ONE outbound-
  HTTP seam for the whole app" — so every caller (`web-tools`, MCP HTTP transports, any future
  skill-declared endpoint) is covered by construction, not just `web_get_page`.
- Redirect discipline: `fetchPage` today sets no `maxRedirects` limit (unlike the sitemap reader's own
  correct `maxRedirects: 0`), so a same-looking URL could redirect to a blocked host after the first check
  passes. Either disable redirects for the general fetch tool too, or re-check the classifier on every hop.
- **An explicit, narrow allowlist is required, not optional** — this repo already has, and the
  `webbrain-agent-parity.md` track (P1) proposes more of, legitimate loopback-bound calls (a local
  Ollama/llama.cpp HTTP-server engine variant for `@tepegoz/model-gateway`'s local tier). The guard must
  distinguish "the agent's own `web_get_page`/`web_search` tool reaching into the user's LAN because a page
  or the model asked it to" (block) from "the app's own configured local-inference endpoint" (allow) —
  mirroring Browserless's own `allowedHosts` parameter design (a caller-supplied exception list, not a
  blanket bypass).
- Stays orthogonal to `EgressFirewall`: this is a **pre-dispatch destination check** (where can the
  request go), `EgressFirewall` is **content inspection** (what does the request carry). Neither replaces
  the other.
- `dangerClass` stays `'read'` — this hardens an existing tool, it does not add a new tier.

**New/changed packages:** `@tepegoz/http` (new destination-validation module + enforcement in
`createHttpClient`, with an explicit allowlist parameter), `apps/desktop/src/main/web/web-tools-host.electron.ts`
(redirect discipline for `fetchPage`).

**ADR:** addendum to **ADR-0006** (Policy Kernel) — record the invariant "any model-reachable HTTP tool
validates its destination before dispatch" next to the existing danger-class taxonomy, since this is a
pre-model, deterministic gate in the same spirit even though the mechanical check itself lives in
`@tepegoz/http`, not the kernel.

**DoD shape (draft, for whichever session promotes this):**

- [ ] `web_get_page`/`web_search` reject a URL resolving to loopback/RFC1918/link-local/cloud-metadata,
      including decimal/octal/hex-encoded IPv4 and IPv6-mapped forms — a test corpus mirroring
      Browserless's own canonicalization cases proves it
- [ ] A redirect cannot bounce an initially-allowed URL to a blocked host
- [ ] The allowlist path is exercised by a test proving a configured local-model HTTP-server endpoint
      (loopback, by design) still works after the guard lands
- [ ] `EgressFirewall`'s content checks are unaffected — this is an additive, separate gate
- [ ] i18n: if a blocked fetch surfaces a distinct user-visible reason (vs. today's generic failure),
      EN+TR parity in whichever dict owns the web-tools failure copy
- [ ] Coverage on the new pure classifier — small, pure, exactly what this repo's coverage ratchet rewards

---

## P2 — Queue/backpressure/alerting mechanics for the parallel-DAG scheduler (sharpens Phase 1b L3, frozen)

**Goal.** Phase 1b's L3 already commits to "topological order → independent branches to parallel workers;
join sync; adaptive throttling (default 5)" — a goal, not a mechanism. Phase 1b is frozen out of v1, so
this workstream is explicitly **reference material for whenever it resumes**, not new work opened now.
When it does, `limiter.ts` + `webhooks.ts` is the one concretely useful thing this comparison's own
conclusion names: not because Tepegöz needs to serve other users' scripts (it doesn't — Browserless
solves "N independent scripts share a browser pool," Tepegöz's problem is "one user's one task fans out
into parallel branches"), but because the **admission/backpressure/alerting mechanics are the same shape**
regardless of who the caller is.

**Approach.**

- Copy `Limiter`'s admission sequence as a checklist, not code: an optional health-gate → a capacity check
  (queue-full rejection with a legible reason, not a bare 503) → a soft "about to queue" signal → dispatch
  with a **per-branch start-clock that begins at execution, not admission** (directly reusable for
  Tepegöz's own `TokenLedger`/wall-clock accounting once branches run concurrently — "billing starts at
  execution" is exactly the distinction Tepegöz's cost reporting will need to keep honest under a real
  scheduler) → a typed timeout with its own callback, distinct from a generic tool error.
- `bypassLimitsFn` (a predicate that can admit a job even at capacity) maps cleanly onto a case Tepegoz's
  own scheduler will need: a branch that is a HITL-approval continuation should not queue behind unrelated
  newly-spawned branches.
- `webhooks.ts`'s shape — one function per alert kind (queue/reject/timeout/error/health-fail), each a
  fire-and-forget call whose own failure is logged, never thrown, never blocks the request it's alerting
  about — is a clean discipline for Tepegöz's own internal signals (Agent Console event feed / diagnostic
  bundle) even with no external webhook consumer: the transferable part is "an alerting side-channel must
  never be able to fail the main path," not the HTTP call itself.
- **Explicitly not transferable:** Docker-fleet CPU/memory-overload gating (`monitoring.ts` — see Backlog,
  a different resource-pressure question) and the multi-tenant "your plan allows N concurrent sessions"
  framing (no plans, one user, one machine).

**New/changed packages:** none opened by this track. This folds into Phase 1b's own phase file (as
mechanics detail under its existing L3 goal) and into whichever ADR eventually supersedes ADR-0013 for
true parallel runs — already flagged as owed in `ai-agent/README.md`'s own routing table ("True
parallel background runs … needs a superseding ADR + real isolation").

**ADR:** none opened by this track — Phase 1b's routing note already records that parallel runs need a
superseding ADR to ADR-0013 when the phase resumes; this workstream only supplies the mechanics detail to
fold into that ADR when it's actually written.

**DoD shape (draft, for whichever session resumes Phase 1b L3):**

- [ ] The admission sequence (health-gate → capacity → queue-warn → dispatch-with-execution-clock) is
      written into Phase 1b's own phase file as an explicit sub-checklist under L3, not left as one line
- [ ] A HITL-approval-continuation branch is provably not blocked behind unrelated newly-spawned branches
- [ ] Internal alerting (queue-full / branch-timeout / branch-error) never fails the main run path — a
      test proves an alert-sink failure is swallowed and logged, not thrown
- [ ] Explicitly gated behind Phase 1b actually resuming (frozen, out of v1) — this track does not open it

---

## Backlog (named, not written up)

- **CPU/memory-aware admission for local model runs (S12).** `monitoring.ts`'s cgroup-aware overload check
  answers "should this fleet reject a new session," which isn't Tepegöz's question — a single desktop app
  under memory/CPU pressure from its own local model is a narrower, different problem. Worth remembering
  if `S12`'s local-model track ever needs to shed load under real hardware constraints; not worth
  designing before that track needs it.

---

## Routing — what this track does not own

Per the existing convention ([`../README.md`](../../phases/README.md#routing--what-stays-out) /
[`ai-agent/README.md`](../../phases/ai-agent/README.md#routing--what-stays-out)), reference these,
never duplicate them:

| Stays with                                           | Material                                                                                                                                                                                                                                                |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Phase 1b**                                         | MCP server surface (Browserless's premium MCP server is the same "wrong direction" already named against WebBrain/AIPex); true parallel background runs / the ADR-0013-superseding decision (P2 sharpens the mechanics detail, does not open the phase) |
| **Phase 7**                                          | NotaryService / Replay Receipts — the real gap versus Browserless's session replay is wiring `@tepegoz/notary` into a live run, already Phase 7's own open item, not a new design this track needs to propose                                           |
| **Phase 2** (frozen)                                 | Fingerprint-randomization / anti-detection posture                                                                                                                                                                                                      |
| `tepegoz-vs-firecrawl.md` / `tepegoz-vs-crawl4ai.md` | The "LLM-ready web extraction" axis (Browserless's premium `/crawl` `/map` `/search` `/smart-scrape`) — same category, already compared elsewhere, and closed here anyway                                                                               |
| **ADR-0039**                                         | CAPTCHA/2FA Human Handoff shape — not revisited (Ground rules, item 1)                                                                                                                                                                                  |

## ADRs owed (numbers assigned when a session actually opens one of these)

- P1: addendum to **ADR-0006** (Policy Kernel — a new pre-dispatch destination-validation invariant for
  model-reachable HTTP tools)
- P2: none — folds into whichever future ADR supersedes **ADR-0013** for true parallel runs, already
  recorded as owed by `ai-agent/README.md`'s own routing table; this track adds detail, not a number

No number is reserved here; per this repo's own multi-profile-track lesson (`multi-profile-isolation.md`
— an ADR-number collision from writing a plan too far ahead of when it's actually opened), the number
gets assigned at the point a session actually starts the work, not now.
