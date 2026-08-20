# ADR-0011: VPN & network privacy — three-scope binding, per-connection partitions, fail-closed by construction

- **Status:** Accepted (binding-resolution + kill-switch layer; **amended 2026-08-20** — per-session
  wiring, the fail-closed egress configuration, the verified `setProxy` call site, and four further
  clear-path escapes closed (popups, favicons, tab creation, app-issued HTTP) — see Amendment)
- **Date:** 2026-08-19 (amended 2026-08-20)
- **Refines:** the existing per-partition session model (Phase 2's `NetworkFilterEngine` stance: no
  system-proxy MITM) · **complements** [ADR-0020](0020-tab-boundary-model.md) (Tab Boundary Model)
- **Phase:** [Phase 5 — VPN & Network Privacy](../../phases/product/phase-5-vpn-network-privacy.md), L0

## Context

The browser has one network identity today: a tab is either on the plain profile partition or it isn't.
Phase 5 asks for a second axis — **each tab, or a whole tab group, may bind to its own VPN/Tor
connection**, with several connections live at once, while every existing default (off, Direct, no
system-proxy MITM) stays exactly as it is for anyone who never opts in.

The risk that dominates every other design choice here is not "does the tunnel work" — it is **what
happens when it stops working**. A VPN/Tor connection can die at any moment: the wire, the exit node, the
provider. A browser that quietly falls back to the clear path in that instant produces the single worst
outcome a network-privacy feature can have, because it looks like nothing happened. The user has no
signal that the page they are now looking at went out unprotected.

## Decision

**Resolution is a pure function with one rule — tab override → group binding → General default →
Direct — and the kill-switch has no branch that defaults to allowed.**

Landed as two dependency-free modules, deliberately built and proven before anything that depends on
them (a connection pool, a SOCKS bridge, session wiring):

- **`resolveBinding`** (`@tepegoz/tab-engine/connection-binding.ts`) climbs exactly one scope at a time.
  `inherit` is never itself a destination — it always means "ask the next scope up" — and resolution
  always bottoms out at a real connection id or Direct. An **ungrouped** tab (`group: null`) and a tab
  whose **group is on `inherit`** both fall to General, and the function treats them identically on
  purpose: from General's point of view there is no difference between "no group to ask" and "the group
  had nothing to say".
- **`partitionKeyFor`** returns a `--conn-{connId}` partition, keyed by connection and never by group
  (**amended 2026-08-20**: the recorded `persist:tepegoz-profile-{id}--conn-{connId}` shape was wrong — see the
  Amendment) — groups are a binding/UI layer, so N
  groups sharing a connection share one partition, and Direct resolves to the plain existing profile
  partition untouched.
- **`affectedByGroupChange` / `affectedByGeneralChange`** answer "which tabs must reload" for a re-bind,
  and the rule is the same most-specific-wins logic run in reverse: a tab (or its group) holding any
  explicit binding — including an explicit `direct` — is insulated from a change above it. Getting this
  wrong in either direction is a real user-facing bug: reloading a tab that was never affected loses its
  state for nothing; failing to reload one that WAS affected leaves it silently on the old partition.
- **`killSwitchVerdicts`** (`@tepegoz/security-policy/kill-switch.ts`) is the fail-closed core. A tab
  resolved to a connection reads its live status: `up` → allowed, anything else — `down`, or a connection
  id the status map has **never even heard of** (torn down entirely) — → blocked. There is no third
  branch. A missing map entry is read as "unknown, therefore blocked", never as "no news, must be fine" —
  that is the exact shape of bug that would turn a dropped tunnel into a silent leak, so the function is
  structured so that outcome has no code path to reach.

## Consequences

**Positive.** The two properties the phase's DoD leads with — inheritance resolving correctly on every
group/General mutation, and the kill-switch never silently falling back to Direct — are proven by 24
tests against pure functions, before a single line of Electron, SOCKS, or proxy-configuration code
exists. A bug in either would be expensive to find once it is entangled with live network state; here it
cannot hide behind timing or a flaky connection.

**Scope, stated precisely.** This ADR is Accepted for the **binding-resolution and kill-switch decision
layer only** — the two pieces of L0 that have no dependency on the rest of the phase. It is explicitly
**not** Accepted for, and does not attempt to decide:

- the connection pool, lifecycle, or health-polling (nothing calls `killSwitchVerdicts` with real status
  yet — there is no real status to call it with);
- `WireGuardConfigProvider` / account-based providers / `TorProvider`;
- `session.setProxy` wiring, `proxyBypassRules`, or any actual SOCKS bridge;
- the Connection-picker Modal, tab/group context-menu entries, or any UI surface;
- Tor's exit-node-is-untrusted trust model, stream isolation, or the DNS-leak detector;
- the 5b managed-exit-node track, which additionally depends on the Phase 3 backend and is out of
  scope for 5a entirely.

Each of those is real remaining work with its own risk surface (a WireGuard parser sits at a genuine
trust boundary; `session.setProxy` interacting with the existing partition model needs its own scrutiny)
and belongs in its own ADR amendment or a follow-up ADR when it lands, not folded into this one by
implication.

**Negative / accepted.** A pure resolution layer proves the *decision* is correct; it says nothing yet
about whether the *enforcement* — the actual `session.setProxy` call, the actual SOCKS bridge — holds up
under a real dropped connection. That is precisely why the DoD's automated leak test is listed as
unstarted below rather than assumed satisfied by this layer.

**Owed, and stated rather than implied.** Everything in the "Scope" list above. The Threat Model update,
the i18n surfaces, and the automated leak/DNS-leak tests are all unstarted — this ADR covers the
foundation two of the phase's many DoD lines, not the phase.

---

## Amendment (2026-08-20) — enforcement: partitions, per-session wiring, and a verified `setProxy`

Accepted. This amendment covers three of the items the original explicitly left undecided, and states
plainly which ones it still does not touch.

### 1. The partition key was wrong, and the fix is "do not rename anything"

The original recorded `persist:tepegoz-profile-{id}--conn-{connId}`, on the stated assumption that Direct
resolved to "the plain existing profile partition untouched". That assumption did not hold: the browser
has never had a per-profile partition. Every browsed page in the product lives in one hard-coded
`persist:tepegoz-web` (`apps/desktop/src/main/tabs-shared.ts`), and profile isolation — where it exists,
on the unmerged multi-profile work — is done a level up, by running each profile as its own process over
its own `userData` directory. Shipping the recorded shape would therefore have RENAMED the partition
every existing user's cookies, logins and site storage live behind: a silent mass sign-out, delivered by
a privacy feature, to users who never enabled it.

The key is now derived from one exported constant:

- `DIRECT_PARTITION = 'persist:tepegoz-web'` — byte-identical to what the browser already uses, and now
  the single definition (`tabs-shared.ts` re-exports it rather than restating the literal, so the two
  cannot drift into two cookie jars).
- `partitionKeyFor({ connectionId })` → `persist:tepegoz-web--conn-{connId}`, a sibling *next to* the
  existing partition rather than a replacement for it. Phase 5 only ever adds.
- A connection id that is not a safe partition component **throws** instead of being sanitized. Quietly
  normalizing `vpn/a` and `vpn-a` onto one partition would put two connections' traffic in one cookie
  jar — the cross-tab bleed the phase forbids — and a throw at the binding boundary is recoverable
  where that bleed is not.

### 2. Every browsing subsystem is per-session now, because "one browsing session" was load-bearing

This is the structural change, and it is larger than the proxy work it enables. Every main-process
subsystem that needs a `Session` reached for `session.fromPartition('persist:tepegoz-web')` directly and
attached itself once at startup: the webRequest multiplexer (behind a one-shot `initialized` flag, so a
second session got **nothing**), download quarantine, the User-Agent override, "forget this site".

A tunnel partition under that model loads pages perfectly and has no ad/tracker filtering, no download
quarantine, the wrong User-Agent, and cookies that survive a site clear. Every one of those is a privacy
regression *inside the privacy feature*, and none of them is visible to the user.

`BrowsingSessions` (`apps/desktop/src/main/network/browsing-sessions.electron.ts`) inverts it: sessions
are created through one registry, subsystems `register()` per-session wiring instead of attaching once,
registration retro-applies to already-live sessions (so startup order cannot matter), and each attacher
runs exactly once per session. Attachers whose absence is a privacy regression rather than a missing
nicety — the filtering plane, download quarantine — are marked **critical**: if one cannot attach, the
partition is refused permanently rather than served half-wired. No session means no `WebContents` can be
hosted on it, which means no traffic. That is the fail-closed answer, and the permanence matters: an
exactly-once registry that allowed a retry would skip the attacher that failed and hand back a session
that looks wired and is not.

### 3. Fail-closed is a property of a value, checked at one call site

`@tepegoz/security-policy/egress-proxy.ts` makes "cannot leak" checkable rather than asserted:

- `tunnelProxyConfig(port)` emits `socks5://127.0.0.1:{port}` with **no `,DIRECT` fallback**. That single
  absent token *is* the kill-switch: with it, Chromium reads a dead tunnel as "go out the clear path";
  without it, the same dead tunnel yields `ERR_PROXY_CONNECTION_FAILED` and nothing leaves the machine.
- `assertFailClosed(config)` rejects a `DIRECT` fallback in every spelling Chromium honours, SOCKS4 (no
  hostname form → the resolver sees every site name), a non-loopback proxy address, an empty rule set,
  and a bypass list wider than loopback — notably **not** Chromium's `<local>`, which would send
  `http://intranet/` out the clear path and hand a LAN host the user's real address.
- `TUNNEL_WEBRTC_POLICY = 'disable_non_proxied_udp'`, applied per `WebContents`. WebRTC opens UDP straight
  from the host stack and a SOCKS proxy carries TCP, so without this a page in a "tunneled" tab hands out
  the machine's real addresses in ICE candidates while every HTTP request goes through the tunnel.

`ensureTunnelSession` (`main/network/tunnel-session.electron.ts`) is the **only** place a session is put
behind a tunnel, and it verifies rather than assumes. Ordering is load-bearing: the session is created
through `BrowsingSessions` **first**, so the filtering/quarantine/UA plane is attached before any proxy
exists to carry traffic. `setProxy` resolving means Chromium accepted the rules, not that it applies them,
so the bind completes only once `resolveProxy()` reports a SOCKS route for an ordinary https URL; a
`DIRECT` answer aborts the bind. A throw from this function must never be caught into "fall back to
Direct" — falling back **is** the leak.

### 4. The automated leak test now exists, and what it actually proves

The original recorded that the DoD's leak test "cannot exist until `session.setProxy` wiring lands,
because there is no real egress path for it to test". Both halves are addressed:
`e2e/spike-tunnel-failclosed.spec.ts` runs the shipping app against a real local SOCKS5 endpoint stood up
in-process — no shipped WireGuard/Tor binary, no code-signing, offline. It imports the shipping
`tunnelProxyConfig`/`partitionKeyFor` rather than restating them, so it cannot drift from production.

Measured, both passing:

- **Routed with remote DNS.** A tunnel-bound session reaches a `.test` host that resolves nowhere, and the
  SOCKS server records the request as `DOMAINNAME` — the hostname went to the proxy, not to the user's
  resolver.
- **Fail-closed on drop.** With Chromium's resolver pointed at a reachable address so that a clear-path
  request *would* succeed — proven by an untunneled control request that does hit the direct origin — the
  SOCKS endpoint is killed mid-session. The next request fails, and the direct origin records nothing.
  The control is what makes this a measurement and not a tautology: without it, "no direct hit" could
  simply mean the detector was blind.

**What it does not prove.** It exercises Chromium's proxy behaviour and our configuration, not a real
VPN: there is still no tunnel carrying traffic off this machine. And it says nothing about Chromium's DNS
*prefetch*/preconnect predictor or DoH, which are process-wide rather than per-session — that residual is
recorded as its own DoD line rather than folded into the passing result above.

### 5. Four more clear-path escapes, found by asking "what else reaches the network?"

The seam above routes a *page's* traffic. Sweeping the rest of the process for anything that reaches the
network on a browsed page's behalf turned up four more paths, none of which the phase document mentions.
Two were live leaks.

- **Popups.** `POPUP_WINDOW_OPTIONS` was a constant pinned to the Direct partition and returned from
  `setWindowOpenHandler`, so a `window.open()` from a tunnel-bound page opened a window on the **clear
  path** — and a popup reads to the user as a continuation of the same session, so nothing about it looks
  wrong. It is now `popupWindowOptions(openerSession)` using `webPreferences.session`: the popup is on the
  opener's exact session by construction, with no partition string that can drift.
- **Favicons.** The tab strip renders in the app chrome, on `persist:tepegoz-app`, which has no proxy and
  never will. `page-favicon-updated` handed it the page's remote icon URL and the chrome CSP allowed
  `img-src https:` — so the *browser chrome* made a clear-path request to the server of the page being
  viewed, on every navigation, tunnel or not. Main now fetches the icon on the page's own session and
  inlines it (`tabs-favicon.electron.ts`, bounded: 64 KiB, 8 s, 200-only, image content-type allowlist,
  per-session cache so a page cannot loop it). `TabFaviconSchema` rejects a non-`data:` favicon at the IPC
  boundary, so the invariant is enforced rather than commented. `img-src https:` survives only for stored
  bookmark icons imported from another browser — user-authored data, unrelated to what is open right now.
- **Tab creation was not partition-aware.** Every `WebContentsView` was built with a hard-coded partition
  string, so there was no way to put a tab on a tunnel session even though `ensureTunnelSession` returns
  one. `createTab` now takes a `Session` and defaults to `BrowsingSessions.direct()` — which also makes
  "no tab is ever hosted on a session the registry did not wire" true by construction rather than by
  convention. A page-opened tab inherits its opener's session, which is the phase's own inheritance rule
  applied at the only moment Electron allows it: a `WebContents` is bound to its session at creation.
- **App-issued HTTP bypasses Electron entirely.** `@tepegoz/http` is axios on Node's stack, so
  `session.setProxy` has no effect on it: the agent's `web_fetch`, sitemap reads, model-provider calls and
  MCP HTTP transports leave on the clear path regardless of any binding. That is not a bug — it is a
  decision nobody had made. **Decided here:** app-issued HTTP follows the **General** binding only. Tab
  and Group bindings answer "where does THIS page's traffic go" and a main-process request has no tab to
  inherit from; General is already defined as the profile-wide default. `egress-route.ts` implements it
  fail-closed — if a tunnel is in force and no transport is installed to honour it, the request is
  **refused**, never quietly sent direct. It resolves to Direct today because nothing produces a SOCKS
  port yet, and stops being inert the moment the pool lands.

**Measured, not asserted:** the favicon path has its own e2e against the shipping app
(`spike-favicon-inline.spec.ts`) — a real page declares an icon, the origin records the fetch, and the tab
state is asserted to carry `data:` and no `http`. The popup and tab-creation fixes are enforced by types
(`webPreferences.session` takes a `Session`, not a string) rather than by a measurement, because with no
connection pool there is still no second session in the running app for a tab to be opened from; that is
stated here rather than dressed up as a test.

### Still not decided here

Unchanged from the original scope list: the connection pool and health-polling, `WireGuardConfigProvider`
/ account providers / `TorProvider`, Tor's exit-node trust model and stream isolation, and every UI
surface. Note also that shipping any of the transports is gated on Phase 0's code-signing item, which is
a distribution prerequisite this ADR cannot close.
