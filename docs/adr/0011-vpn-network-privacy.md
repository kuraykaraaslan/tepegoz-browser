# ADR-0011: VPN & network privacy — three-scope binding, per-connection partitions, fail-closed by construction

- **Status:** Accepted (binding-resolution + kill-switch layer; **amended 2026-08-20** — per-session
  wiring, the fail-closed egress configuration, the verified `setProxy` call site, four clear-path escapes
  closed (popups, favicons, tab creation, app-issued HTTP), the working feature (pool, bindings,
  re-hosting, blackholed partitions, surfaces), and **real tunnels**: userspace WireGuard + Tor, chained
  Tor-over-VPN, and blackhole-on-drop — see Amendment)
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

### 6. The feature, working: pool, bindings, re-hosting, and the surfaces that drive them

Accepted. This closes the items section 5 listed as "still not decided here", except the two that are
genuinely blocked.

**The first provider ships no binary.** The phase names three provider families (BYO WireGuard, account
providers, Tor) and every one of them ends in the same place — a **SOCKS5 endpoint on loopback** — and
every one of them needs a signed native binary this repo cannot produce yet. So the seam is defined in
terms of that endpoint, and the first provider is `ByoSocksProvider`: point at a SOCKS5 port the user
already runs (Tor's 9050, a VPN client's local SOCKS, `ssh -D`, a userspace WireGuard bridge they
installed). That is a real, shippable feature today for exactly the audience this phase is for, and it is
the same seam the bundled providers implement later, so nothing above it is rewritten when they land.

**The pool separates liveness from permission.** A provider answers "is my endpoint responding"; whether
a tab may egress stays `killSwitchVerdicts`' job. Two rules keep that honest: `connecting` is never
reported as usable — `statusMap` emits only `up`/`down`, and anything not confirmed up is `down` — and
"up" means the endpoint answered **and** `ensureTunnelSession` verified with `resolveProxy` that Chromium
adopted the proxy. A connection reported up that cannot carry traffic is the precise state in which a
user believes they are protected and is not.

**Applying a binding has one order, and it is the safety property.** `BindingService` resolves the scope,
brings the connection up, verifies it, and only then re-hosts. If any step fails the tab is left exactly
where it was — never moved optimistically (which would tell the user they are protected when the tunnel
is dead) and never redirected to Direct (which is the leak). Applies are sequential, so two tabs moving
onto one connection cannot race to bring it up.

**Re-hosting is destroy-then-create, in that order.** Electron binds a `WebContents` to its session at
creation, so a route change means a new view and a reload — the cost the phase accepted up front. The
ordering is what makes the transition non-leaking: there is never a moment with two views for one tab
alive on two networks. A tab already on the target session is left completely alone.

**An unbound tunnel partition is blackholed.** This is the invariant that makes every *other* ordering
safe. "No proxy configured" is not neutral in Chromium — it means DIRECT — so a `--conn-` partition that
exists but has not been bound would send a tab that believes it is tunneled straight out the clear path.
Every tunnel partition therefore gets `BLACKHOLE_PROXY_CONFIG` (a loopback port nothing listens on, no
`DIRECT`) the instant it is created, replaced only after verification. The worst case across all orderings
becomes "a request errors and a reload works", never "a request leaks". It is also what lets a **new tab**
be born on the profile-wide default route synchronously, which it must be: a user who set "everything
through Tor" and then pressed Ctrl+T getting a clear-path tab is the whole feature failing.

**Storage teardown is part of removal.** Removing a connection wipes its partition's storage, cache, auth
and host-resolver caches, and drops every binding that pointed at it. Without the second half, tabs would
sit blocked on `unknown_connection_failclosed` with no route back — correctly blocked, and unfixable by
the user, since the connection they would need is gone.

**UI deviation, recorded rather than glossed.** The phase specifies a Connection-picker **Modal**. What
landed is a **native submenu** on the tab and group context menus, plus a Settings surface for the General
scope and connection management. The surrounding menus are already real OS menus built in main against
authoritative state, so the picker's contents cannot be stale by the time they are clicked and the
renderer learns nothing about the pool it does not already display. Not built: the "which tabs/groups use
each connection" column, a member-count confirm, and the per-group header indicator. The per-tab indicator
is computed in main and pushed — a security indicator computed in the untrusted renderer is one a
page-driven bug could talk into lying.

**Measured, not asserted.** `e2e/spike-tunnel-binding.spec.ts` runs the shipping app: a connection added
through the real bridge, set as the default route, a new tab opened, its traffic arriving at the SOCKS
endpoint while a **proven-reachable** clear path records nothing; then the endpoint is killed, the health
poll flips it to `down`, the tab is reported blocked, and still nothing reaches the clear path.

**Blocked, not skipped.** Bundled WireGuard/Tor providers (Phase 0 code-signing plus a Rust toolchain in
CI), Tor stream isolation (needs Tor), and 5b managed exits (needs the Phase 3 backend). Open and stated:
two live connections measured simultaneously, Chromium's DNS prefetch/preconnect predictor and DoH — which
are process-wide, so the per-session `X-DNS-Prefetch-Control: off` stamp is a mitigation and not a
closure — and HTTPS-only enforcement for tunnel-bound tabs.

### 7. Real tunnels: WireGuard and Tor in user space, and how "VPN *and* Tor" is expressed

Accepted. Until now the only provider was `ByoSocksProvider` — "point at a SOCKS port you already run".
Two providers now produce tunnels themselves, and the choice of *which* two is the substance of this
section.

**Userspace first, and the ordering is not arbitrary.** `wireproxy` runs WireGuard over a private TCP/IP
stack and exposes the result as a SOCKS5 listener; Tor already is one. Both therefore:

- need **no TUN adapter, no route changes, and no elevation** — an untunneled tab cannot be affected by a
  tunnel coming up, and the browser never asks for administrative rights;
- **cannot leak by construction** — the process owns its own network stack and can only emit packets
  through its tunnel. There is no route table to misconfigure and no source address to mis-bind, which
  are the two ways a kernel-level VPN silently sends traffic the wrong way;
- are **unlimited in number** — one more process on one more loopback port, which is what makes "a
  different tunnel per tab group" cost nothing structural.

OpenVPN is deliberately **absent from the schema enum**, not merely unimplemented. It is layer-3 with no
common userspace stack, so it needs a real adapter plus source-bound sockets and a Windows routing
assumption that is not yet verified. Adding the enum member before the provider exists would be a promise
the code cannot keep.

**The DNS refusal.** wireproxy resolves hostnames itself using the `DNS` line from `[Interface]`. With no
such line it falls back to the host resolver — so the traffic would go through the tunnel while every
site name went to the user's ISP in the clear. `parseWireGuardConfig` therefore **rejects a profile with
no DNS**, with a message naming the fix, rather than accepting it or picking a resolver on the user's
behalf. Choosing one would mean sending their browsing to a third party they did not select.

**"This group is on the VPN *and* on Tor" is a chain, not two routes.** A group resolves to exactly one
route, so the combination is Tor configured with the VPN's loopback SOCKS port as its `Socks5Proxy`,
exposing its own port for the group to bind to. The kill-switch composes for free: if the upstream VPN
drops, Tor's outbound dies with it and the group is cut, with nothing having to coordinate the two. The
upstream is resolved **lazily, at connect time** — a restarted wireproxy lands on a new ephemeral port,
and a value captured at construction would quietly point Tor at whatever now holds the old one. A cycle
guard refuses a config that chains back to itself instead of recursing until the stack gives out.

**One Tor process per connection**, each with its own `DataDirectory`. A shared process would be lighter,
but two connections would then share guards and possibly circuits — and "these two groups take different
paths through Tor" is the entire reason a user would create two Tor connections rather than one.

**Secrets.** A WireGuard profile is a private key, so it is stored encrypted through `safeStorage` and
referenced by connection id; `networkConnections` in preferences keeps only what is safe to show in a
list. Import is **refused outright when the OS keychain is unavailable** — falling back to plaintext "so
the feature works" would put a key on disk the user believes is protected. One honest gap: wireproxy
takes a config path rather than stdin, so the rendered config exists as a `0600` file from spawn until
the listener answers, then is deleted. That is the narrowest window available, not a comfortable one.

**Helper binaries are located, not installed.** Neither is bundled: shipping a third-party executable
inside a signed installer is a distribution problem, and neither is needed by anyone who does not turn the
feature on. The search order is override → `userData/bin` → `PATH`, and a missing binary makes the
connection report down with the directory to drop it in. The plan's pinned-hash auto-download is **not
built** — inventing a hash to satisfy a design would be worse than telling the user where to put a file.

**Blackhole on drop (zero-leak hardening #1).** A dead SOCKS port fails closed only while it stays dead;
loopback ports are recycled, and an unrelated local process that later bound one would inherit a browser
partition pointing straight at it. Every `status → down` therefore re-applies `BLACKHOLE_PROXY_CONFIG` to
that partition and drops its verification, so recovery must pass `resolveProxy` again.

**The group badge.** A shield beside the group name, because the group is the scope people actually bind a
route to. Colour is never the only signal — every state also has words in the accessible name, since this
particular red-vs-green is "protected" vs "not protected". A chained route splits one shield down the
middle: VPN half in the health palette, Tor half purple when carrying traffic and grey when not. A Direct
group draws nothing, because a shield on every group would bury the ones that mean something.

**Not built, and stated rather than implied:** agent lockout on a dropped tunnel (zero-leak hardening #2),
the explicit exit-IP check, and rename/reorder/duplicate in the manager.

### Still not decided here

What remains after section 7: the **OpenVPN** provider and the Windows split-routing model it depends on
(source-bound sockets over a high-metric per-tunnel default route — unverified, and deferred at the
owner's request); Tor's exit-node trust model and HTTPS-only enforcement for tunnel-bound tabs; and the 5b
managed-exit track, which needs the Phase 3 backend. Bundling any helper binary in the installer remains
gated on Phase 0 code-signing — and remains unnecessary, since nothing is bundled.
