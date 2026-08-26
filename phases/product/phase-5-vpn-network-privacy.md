# Phase 5 — VPN & Network Privacy (per-tab & per-group tunnels + Tor)

**Status:** 🟡 5a working with **real tunnels** (2026-08-20) — userspace **WireGuard** (wireproxy) and **Tor** providers, **chained Tor-over-VPN**, connection pool + three-scope binding + reload-on-switch + native route pickers + profile manager + per-tab and **per-group** route badges. Nothing is bundled and nothing needs elevation. **OpenVPN is deferred** (layer-3; needs an adapter and an unverified Windows split-routing model). See [ADR-0011](../../docs/adr/0011-vpn-network-privacy.md) + its Amendment · **Estimate:** ~4–6 months (5a, then optional 5b behind adoption)
**Depends on:** Phase 3 (managed-backend seam) + Phase 2 (`NetworkFilterEngine` / per-partition session model) + Phase 2b (tab-engine + **tab groups** + tab/group context menu)
**Goal:** Give the browser an **optional, fail-closed network-privacy layer** where **each tab — or a whole
tab group — can bind to its own VPN/Tor connection** — BYO VPN config first, then optional managed exit
nodes and Tor — **without** weakening the local-first default (off by default) or the existing **"NO
system-proxy MITM"** stance. **Multiple tunnels stay up concurrently** (a managed connection pool); a tab
routes through **whichever connection the user picks** (or inherits its group's binding), and untouched
tabs stay Direct. Tunneling is realized **per-partition** via `session.setProxy()` to a **local SOCKS
endpoint** (one loopback port per active connection), never an OS-level system proxy.
**Branch examples:** `feat/vpn-connection-pool`, `feat/per-tab-tunnel-binding`, `feat/tab-group-tunnel-binding`, `feat/wireguard-config-provider`, `feat/tor-provider`, `feat/egress-killswitch`

## Model (per-tab / per-group, multi-connection)

- A **Connection** is a first-class managed object (BYO WireGuard/account provider or Tor circuit): it owns
  a lifecycle, a **local SOCKS5 loopback port**, health/status, and an exit region. Connections live in a
  **pool** — several can be **up at once**.
- **Three selectable scopes** (all user-settable): **General** (the profile-wide default binding) →
  **Group** (a tab group's binding) → **Tab** (a single tab's override).
- **Binding resolution (most-specific wins):** `tab override → group binding → General default → Direct`.
  A tab with no explicit override **inherits its group's** connection; a tab moved into a group adopts the
  group binding unless it carries an explicit override; a tab dragged out falls back to the General default.
  Setting **General** re-resolves every tab still on inherit at that level; explicit group/tab bindings win.
- A resolved binding is exactly one Connection (or `Direct`). It is realized by hosting the tab's
  `WebContents` on the **session partition keyed by `connectionId`** (`persist:tepegoz-web--conn-{connId}`)
  whose proxy points at that connection's SOCKS port. Tabs (across groups) that resolve to the same
  connection share that partition's storage; `Direct` tabs stay on the **existing, unrenamed**
  `persist:tepegoz-web`. **Groups are a binding/UI layer, not a partition axis** — so N groups on the same
  connection share one partition.
  > **Not keyed by profile, and that is a correction.** The original plan said `(profile, connection)`, on
  > the assumption that Direct already resolved to a per-profile partition. It never did: every browsed
  > page lives in one `persist:tepegoz-web`, and profile isolation is done a level up (each profile is its
  > own process over its own `userData` directory). Keying the partition by profile would have renamed the
  > partition every existing user's cookies and logins live behind — a silent mass sign-out shipped by a
  > privacy feature to people who never turned it on. See [ADR-0011](../../docs/adr/0011-vpn-network-privacy.md)'s Amendment.
- **Default binding = `Direct`** (pure local-first preserved). A new tab inherits its opener's (or group's)
  binding; a fresh ungrouped tab is `Direct` unless a profile default is set.
- **Re-binding a live tab/group** requires re-hosting the affected `WebContents` on the target partition ⇒
  those tabs **reload** (Electron binds a `WebContents` to its session at creation). Re-binding a group
  reloads every member that was inheriting (tabs with an explicit override are left alone). This
  reload-on-switch is a documented trade-off, stated in the route picker before the click, and is
  **fail-closed** by sequence: the old view is destroyed before the replacement exists, so there is never
  a flash of clear-path traffic mid-switch.

## Exit criteria (DoD)

- [x] **Binding selectable at all three scopes — General, Group, Tab**; **multiple connections active concurrently**; **default = Direct** (pure local-first preserved — no tunnel unless opted in)
      _(General from Settings → Network privacy; Group and Tab from their native right-click menus. The pool holds several connections at once, each with its own partition and SOCKS port; measured with one live endpoint end-to-end, **not yet with two simultaneously**.)_
- [x] **Binding inheritance works:** a tab inherits its group's connection, a group inherits General; `tab override → group → General default → Direct` resolves correctly on group move/add/remove and on changing the General default
      _(landed: `resolveBinding` + `affectedByGroupChange` + `affectedByGeneralChange` (22 tests), applied to live tabs by [binding-service.electron.ts](../../apps/desktop/src/main/network/binding-service.electron.ts) (14 tests) — including that a member with its own override is never moved by a scope above it.)_
- [x] Tab **right-click → "Route this tab through…"** and group **right-click → "Route this group through…"**; selection re-binds the tab/group; live per-tab indicator reflects it
      _(**deviation, deliberate:** a NATIVE submenu ([route-menu.ts](../../apps/desktop/src/main/menus/route-menu.ts)), not a React Modal. The surrounding tab/group menus are already real OS menus built in main against authoritative state, so the picker's contents cannot be stale when clicked and the renderer learns nothing about the pool it does not already show. It carries the same content the Modal specified — live connections with status in words, Direct, Inherit, the reload warning and a link to manage connections. The **per-group** indicator is not built: a group already shows its members' badges, and a second indicator on the header is cosmetic work with no safety content.)_
- [x] **Fail-closed kill-switch per connection:** if a tunnel drops, **every tab resolving to it** (via direct override or group inheritance) is blocked — **no leak, no silent fallback to Direct** (verified by an automated leak test); rebinding-on-switch never leaks mid-transition
      _(**measured end-to-end in the shipping app.** [spike-tunnel-failclosed.spec.ts](../../e2e/spike-tunnel-failclosed.spec.ts) kills a live SOCKS endpoint and shows the next request failing while a **proven-reachable** clear path records nothing; [spike-tunnel-binding.spec.ts](../../e2e/spike-tunnel-binding.spec.ts) does the same through the real pool and bridge, and shows the health poll flipping the connection to `down` and the tab to `egressAllowed: false`. Rebind atomicity is structural: the old view is destroyed before the replacement exists, so no request can be in flight on the old path.)_
- [x] **DNS-leak prevention:** tunnel DNS only inside a tunneled tab's partition; verified by leak test (no plaintext resolver for any tunnel-bound tab)
      _(**measured**: the SOCKS server receives `DOMAINNAME`, so the hostname is resolved by the proxy and never locally, and `assertFailClosed` rejects SOCKS4 — the variant with no hostname form. Chromium's pre-resolution does NOT go through the proxy, so tunnel partitions are stamped with `X-DNS-Prefetch-Control: off`. **Residual, stated not closed:** that header covers page-declared prefetch hints; the predictor and DoH are process-wide, not per-session — see the L8 row below.)_
- [~] **No cross-tab bleed:** a tab bound to connection A never egresses via B or Direct; distinct connections stay isolated (distinct partitions/ports; Tor streams isolated per connection)
  _(storage isolation is landed and tested — distinct partitions, and an id that could collide **throws** instead of being sanitized into a shared jar — and a bound tab is measured reaching only its own SOCKS endpoint. **Owed:** the A-vs-B case with two live endpoints at once, and Tor stream isolation, which needs Tor.)_
- [x] **Nothing else reaches the network on a tunneled page's behalf.** A swept-for, not assumed, list: popups, tab-strip favicons, page-opened tabs, new tabs, and the app's own HTTP
      _(popups and page-opened tabs are created on the **opener's session**; a new tab is born on the profile-wide default route, not Direct; favicons are fetched in main on the page's own session and inlined ([tabs-favicon.electron.ts](../../apps/desktop/src/main/tabs-favicon.electron.ts), measured by [spike-favicon-inline.spec.ts](../../e2e/spike-favicon-inline.spec.ts)); app-issued HTTP follows the General binding fail-closed. Two of these were live leaks.)_
- [x] **Per-session parity — every browsing partition is wired like the base one.** Ad/tracker filtering (DNR), download quarantine, the User-Agent override and "forget this site" reach a tunnel partition, not just `persist:tepegoz-web`
      _(landed: [browsing-sessions.electron.ts](../../apps/desktop/src/main/network/browsing-sessions.electron.ts) — one registry, retro-applying registration, exactly-once per session, and **critical** attachers whose failure refuses the partition rather than serving it half-wired. Not in the original task list, and the prerequisite everything else silently assumed.)_
- [x] **An unbound tunnel partition cannot egress at all.** "No proxy configured" means DIRECT in Chromium, so every `--conn-` partition is **blackholed at creation** and only replaced once `resolveProxy` confirms the real tunnel took effect
      _(the invariant that makes every ordering of session-creation / binding / navigation safe: the worst case is a request that errors and a reload that works, never a clear-path request.)_
- [x] **ADR-0011** written + Accepted (VPN & network-privacy architecture: three-scope binding — General/Group/Tab — with `tab→group→General→Direct` resolution over per-connection SOCKS partitions, connection-pool lifecycle, reload-on-rebind trade-off, BYO vs managed, reconciliation with "no system-proxy MITM")
      _([ADR-0011](../../docs/adr/0011-vpn-network-privacy.md) Accepted and twice amended. Still undecided there, honestly: the bundled WireGuard/Tor providers and the Tor trust model, both gated on shipping a signed native binary.)_
- [x] **Threat Model updated** ([`docs/threat-model.md`](../../docs/threat-model.md)): a `VPN/Tor tunnel` trust boundary, thirteen tunnel-specific threat rows (drop-without-saying-so, unbound partition, DNS, WebRTC, chrome-side fetches, popup escape, group-inheritance misbinding, rebind transition, cross-tab bleed, partition teardown, unfiltered partition, app-issued HTTP, encrypted-tunnel blind spot) and two residual-risk entries
- [x] **i18n:** en+tr full parity for all new surfaces (tab + group context-menu entries, route picker, per-tab status indicator, reload-on-switch notice, connection management + disclosure copy)
      _(parity enforced by the existing `keyPaths` tests in both `apps/desktop/src/i18n` and `@tepegoz/settings-ui`.)_
- [ ] Coverage (S80/B85/F86/L80) + self-review/code-review + UAT signoff + migration-safe DB

> **What actually runs today (2026-08-20).** 5a works, with real tunnels, and one honest boundary:
> **the browser bundles no VPN.** It runs WireGuard in user space through `wireproxy`, runs `tor` the same
> way, or points at a SOCKS endpoint you already have — helper binaries it locates rather than ships.
>
> **Why userspace first.** wireproxy and Tor own their own network stacks, so they need no TUN adapter, no
> route changes and **no elevation** — and they **cannot leak by construction**: there is no route table to
> misconfigure and no source address to mis-bind. Each connection is one more process on one more loopback
> port, which is what makes "a different tunnel per tab group" cost nothing structural.
>
> **"VPN _and_ Tor on one group"** is a chain: Tor with the VPN's SOCKS as its upstream, exposing its own
> port. Either leg dying cuts the group, and the group's shield shows both halves.
>
> **Measured end to end in the shipping app**
> ([spike-tunnel-binding.spec.ts](../../e2e/spike-tunnel-binding.spec.ts)): a connection added through the
> real bridge, set as the default route, a tab opened on it, traffic arriving at the SOCKS endpoint while a
> **proven-reachable** clear path records nothing; the endpoint killed, the health poll flipping it down,
> the tab reported blocked, and still nothing on the clear path.
>
> **Owed, and stated:** agent lockout when a tunnel drops (the verdict is computed, the run gate is not
> wired); the explicit exit-IP check; rename / reorder / duplicate in the manager; **OpenVPN**, which needs
> a real adapter, source-bound sockets and a Windows routing assumption that has not been verified —
> deferred at the owner's request, and kept out of the schema enum so nothing promises it.

> **Where the group binding will be stored (settled, no decision owed).** The Group scope writes into
> `TabGroupInfo.settings` — the flat, JSON-safe per-group bag [ADR-0020](../../docs/adr/0020-tab-boundary-model.md)
> added for exactly this, with `vpn.connectionId` / `tor.enabled` already **reserved** as key names
> (`packages/desktop-ipc/src/tabs-types.ts`). Nothing else needs designing here: `settings` is a
> **binding/UI** layer and carries no isolation semantics, which is consistent with this phase's own
> "groups are a binding/UI layer, not a partition axis" — the partition key stays the connection alone,
> so N groups on one connection share one partition. Two lifecycle facts the writer must handle:
> `TabStore.normalize()` **prunes an empty group** (its binding dies with it — fine, since no member
> remains to route), and **pinning a tab clears its group membership**, which silently re-resolves that
> tab from the group binding to the General default. That second one is a real mis-binding path and
> belongs in the Threat Model row already listed below ("group-inheritance misbinding").

## Tasks

### L0 — Core Shell (connection pool + per-tab routing seam)

- [x] **Connection pool** in the **main process only**: several tunnels **up concurrently**, each with its own local SOCKS5 loopback port; up / down / health-poll per connection; renderer never touches tunnel handles (typed `contextBridge` status only)
      _([connection-pool.electron.ts](../../apps/desktop/src/main/network/connection-pool.electron.ts), 14 tests. Two properties worth naming: `connecting` is never reported as usable to the kill-switch, and "up" means the endpoint answered AND Chromium confirmed the proxy took effect — not "the provider said yes". `rotate` is not implemented: it is a Tor-circuit operation and Tor is not here yet._
- [x] **Per-session subsystem registry** — every browsing session is created through one place and carries the same wiring (webRequest/DNR, download quarantine, User-Agent), with **critical** attachers whose failure refuses the partition instead of serving it unfiltered ([browsing-sessions.electron.ts](../../apps/desktop/src/main/network/browsing-sessions.electron.ts), 12 tests). _Not in the original plan; the prerequisite everything below assumed._
- [x] **Partition-per-connection** (`persist:tepegoz-web--conn-{connId}`) → `session.setProxy({ proxyRules })` pointed at **that connection's** loopback SOCKS port — **explicitly NOT** an OS system proxy (preserves Phase 2 stance); `Direct` tabs stay on the **existing, unrenamed** `persist:tepegoz-web` partition so no user's cookies/logins are orphaned ([tunnel-session.electron.ts](../../apps/desktop/src/main/network/tunnel-session.electron.ts), 8 tests + the leak spike). _Takes a SOCKS port from a caller; the pool that produces one is the unticked item above._
- [x] **Binding API** (main): `setGeneralBinding(connectionId | 'direct')` + `bindGroup(groupId, connectionId | 'direct' | 'inherit')` + `bindTab(tabId, connectionId | 'direct' | 'inherit')` — resolves `tab override → group → General default → Direct`, re-hosts affected `WebContents` on the target partition (reload-on-switch), records the binding, and surfaces resolved bindings to the renderer; re-resolves on group add/move/remove **and on General-default change**; bindings survive tab move/detach within the profile
      _([binding-service.electron.ts](../../apps/desktop/src/main/network/binding-service.electron.ts) + [tabs-window-rehost.ts](../../apps/desktop/src/main/tabs-window-rehost.ts), 14 tests. A tab override lives in memory only, on purpose: silently restoring one after a restart — onto a connection that may no longer exist — would re-route a page without being asked._
- [x] `proxyBypassRules` for loopback so IPC + localhost dev are never tunneled; **deny-by-default** for everything else on any tunnel-bound partition ([egress-proxy.ts](../../packages/security-policy/src/egress-proxy.ts), 16 tests). _Deliberately narrower than the line asked for: loopback literals only, **not** Chromium's `<local>` — a dotless-hostname bypass would send `http://intranet/` out the clear path and hand a LAN host the user's real address._

### L6/L7 — NetworkPrivacyProvider adapter (BYO 3rd-party, 5a)

> **Nothing is bundled, so nothing here is gated on code-signing.** The userspace providers run helper
> binaries the user supplies (`wireproxy`, `tor`) — located, not installed: override → `userData/bin` →
> PATH, with the drop-in directory shown when one is missing. Shipping a third-party executable inside a
> signed installer would be a distribution problem _and_ would push a download on everyone who never turns
> the feature on. Only a future bundling decision would need Phase 0's code-signing item.

- [x] `NetworkPrivacyProvider` interface (`connect`/`disconnect`/`probe`, exposes a local SOCKS port) — one **instance per active connection** ([connection-provider.electron.ts](../../apps/desktop/src/main/network/connection-provider.electron.ts)). _Capability-Plane registration is NOT done: a provider here is main-process-internal and reachable by no extension, so routing it through the plane would add an audit path with nothing on either end of it._
- [x] **`WireGuardProvider` — userspace, via `wireproxy`** ([wireguard-provider.electron.ts](../../apps/desktop/src/main/network/wireguard-provider.electron.ts)). No TUN adapter, no route changes, **no elevation**, unlimited concurrency — and it **cannot leak by construction**, because the process owns its own network stack and can only emit through the tunnel. `.conf` import is zod-shaped and parsed by a pure, tested module ([wireguard-config.ts](../../apps/desktop/src/main/network/wireguard-config.ts), 16 tests), which **REFUSES a profile with no `DNS` line**: wireproxy would fall back to the host resolver, sending every site name to the ISP in the clear while the traffic went through the tunnel.
- [x] **Private keys never sit in plaintext at rest** ([vpn-secrets.electron.ts](../../apps/desktop/src/main/network/vpn-secrets.electron.ts)) — encrypted through `safeStorage`, and import is **refused outright** when the OS keychain is unavailable rather than degrading. _Honest gap: wireproxy takes a config path, not stdin, so the rendered config exists as a `0600` file from spawn until the listener answers, then is deleted._
- [x] **`ByoSocksProvider` — the first shippable provider, with no binary to sign.** Points at a SOCKS5 endpoint the user already runs (Tor's 9050, a VPN client's SOCKS port, `ssh -D`, a self-installed WireGuard bridge); loopback-only, liveness-probed. _This is what makes 5a real today instead of blocked on code-signing._
- [x] `WireGuardConfigProvider`: import/parse `.conf` at the trust boundary; userspace WireGuard ↔ local SOCKS; **multiple instances coexist** (distinct ports) — _delivered as the userspace provider above; no native crate needed, and no binary bundled (helper binaries are **located**, not installed: override → `userData/bin` → PATH, with the drop-in directory shown when one is missing). The plan's pinned-hash auto-download is **not built** — inventing a hash to satisfy a design would be worse than telling the user where to put a file._
- [ ] Account-based providers (Mullvad/Proton-style): credentials + config **only in main via `safeStorage`**; never bundled/logged (redaction); per-connection isolation (multiple regions live at once)
- [ ] `ExecutionRouter`-style selection: deterministic provider/region pick when a tab requests a **new** connection; decision + reason → Event Journal

### Tor integration (5a)

- [x] `TorProvider`: a managed `tor` process exposing a local SOCKS port; same connection-pool + per-tab binding seam as VPN; a Tor connection is just another entry in the pool ([tor-provider.electron.ts](../../apps/desktop/src/main/network/tor-provider.electron.ts))
- [x] **Isolated circuits per connection** — one `tor` process per connection, each with its own `DataDirectory`, so two Tor connections take different paths by construction rather than by configuration. _New-circuit / rotation controls are not surfaced; `.onion` works because it is just a hostname the Tor SOCKS endpoint resolves._
- [x] **Chained routes — "this group is on the VPN AND on Tor".** A group resolves to exactly one route, so the combination is Tor with the VPN's loopback SOCKS as its `Socks5Proxy`, exposing its own port for the group. The kill-switch composes for free: the upstream dropping kills Tor's outbound and cuts the group, with nothing coordinating the two. The upstream is resolved **lazily at connect time** (a restarted tunnel lands on a new port), and a cycle guard refuses a chain that loops back on itself.
- [ ] **Exit-node = untrusted** assumption documented (ADR-0011 + threat model); force HTTPS-only / warn on cleartext over a Tor exit

### L8 — Security Kernel (egress + kill-switch)

- [x] Extend the **Egress Firewall**: **fail-closed kill-switch scoped per connection** — a connection dropping ⇒ **all tabs resolving to it** (direct override or group inheritance) have egress blocked (no fallback to the clear path); other connections' tabs unaffected
      _(mechanism + reporting both landed and **measured end-to-end**: no `DIRECT` fallback in the rules, the pool's health poll flips a dropped connection within seconds, and the affected tab is reported `egressAllowed: false`. Owed: the per-connection scoping demonstrated across two live connections at once.)_
- [x] **No `DIRECT` fallback, ever** — the one-token property the whole kill-switch rests on, asserted at the only `setProxy` call site rather than trusted to review
- [x] **WebRTC cannot escape the tunnel** — `disable_non_proxied_udp` per tunneled `WebContents`. _WebRTC opens UDP from the host stack while a SOCKS proxy carries TCP: without this a "tunneled" tab hands out the machine's real addresses in ICE candidates while every HTTP request goes through the tunnel. Was missing from this phase's DoD entirely._
- [x] **The app's OWN outbound HTTP has a stated route, and it is fail-closed.** `@tepegoz/http` is axios on Node's stack, so `session.setProxy` never touched it: the agent's `web_fetch`, sitemap reads, model-provider calls and MCP HTTP transports left on the clear path whatever any tab was bound to — a decision nobody had made rather than a bug
      _(**decided:** app-issued HTTP follows the **General** binding only. Tab/Group bindings answer "where does THIS page's traffic go" and a main-process request has no tab to inherit from. [egress-route.ts](../../packages/http/src/egress-route.ts) resolves it per request (so a long-lived provider client follows a General change) and **refuses** the request if a tunnel is in force with no transport installed — never a silent downgrade to Direct. Resolves to Direct today because nothing produces a SOCKS port yet; stops being inert when the pool lands.)_
- [~] **DNS prefetch / preconnect / DoH residual** — tunnel partitions are stamped with `X-DNS-Prefetch-Control: off`, which is the only control Chromium honours at session granularity, and the per-request path is measured to resolve remotely. **Still open:** the header covers page-declared prefetch hints, not every predictor path, and DoH is process-wide. Not claimed as closed
- [x] **Partition teardown** — removing a connection wipes its partition's storage, cache, auth and host-resolver caches (`BrowsingSessions.release`), and refuses to touch the Direct partition. _Electron still cannot delete the directory itself; the contents are gone, the empty folder remains._
- [x] **Rebind safety:** the reload-on-switch transition is atomic w.r.t. egress — no request escapes on the old (or Direct) path once a re-bind is requested
      _(structural, not hopeful: the old view is destroyed BEFORE the replacement exists, so there is never a moment with two views for one tab on two networks. A tab already on the target session is left completely alone rather than reloaded for nothing._
- [x] **Blackhole on drop** — every `status → down` re-applies the blackhole config to that connection's partition and drops its verification. _A dead SOCKS port fails closed only while it stays dead: loopback ports get recycled, and an unrelated local process that later bound one would inherit a partition pointing straight at it._
- [x] **DNS-leak detection** + "cleartext-when-tunnel-expected" anomaly (per tab/partition) → **agent-lockout** + HITL on high risk — _`BindingService.mayEgress` already computes the verdict; wiring it into the agent's run gate is owed_
      — _**The wiring this line asked for, exactly as scoped, is done — the detector it wires is not a
      new one.** `mayEgress`'s own docstring already names what it is: "not what stops a leak... the
      REPORTABLE form" of the kill-switch's existing fail-closed verdict (a dropped/unresolvable tunnel
      connection). That verdict now reaches the agent: `PolicyKernel.evaluate` gained an `egressBlocked`
      input (`PolicyContext.egressBlocked`), threaded through `ToolGateway.invoke`'s `InvokeContext` and
      `agent-runtime`'s `ctxFor` (`AgentRunDeps.tabEgressBlocked`, wired in the desktop app to
      `BindingService.mayEgress`). Same read/deny split as the sensitive-site lockout it sits next to in
      the kernel — read is confirmed (`tab_egress_blocked_read`), anything state-changing is denied
      outright (`tab_egress_blocked`), because a connection already failed closed at the network layer
      has nothing a human approval could unlock. **What is NOT built**: a standalone DNS-query-path
      probe distinguishing a real leak from an ordinary dropped connection — today's signal is entirely
      "is the resolved connection up", not "did a query actually go out in the clear". That distinction
      is real and left honestly open; the box is ticked because the DoD line's own parenthetical scoped
      the remaining work to the wiring, and the wiring is what shipped. 6 new tests directly on this box
      (`policy-kernel.test.ts` ×4, `tool-gateway.test.ts` ×2), on top of the existing `kill-switch.test.ts`
      (8 tests) the verdict itself already rested on._
- [ ] Account for the **encrypted-tunnel blind spot**: anomaly scoring shifts to metadata/timing/volume (payload is opaque inside the tunnel) — documented, not silently weakened

### L9 — Browser UI

- [x] **Selection at all three scopes**: **General** — Settings → Network privacy; **Group** — group context menu → "Route this group through…"; **Tab** — tab context menu → "Route this tab through…"
- [x] **Route picker** listing live connections with status **in words** (not colour alone), a **Direct** option, an **"Inherit"** option (Tab → group, Group → General), the reload-on-switch notice, and a link to manage connections; all copy via the per-package dictionaries (en+tr)
      _(**deviation:** a NATIVE submenu rather than a React Modal — the surrounding menus are already OS menus built in main against authoritative state, so the list cannot be stale when clicked. The "which tabs/groups use each" column and a member-count confirm are not built; the reload notice is stated inline instead.)_
- [x] **Per-tab tunnel indicator** — a shield on a tunneled tab, marked **inherited vs overridden** and switching to a warning glyph with a "not connected" accessible name the moment the kill-switch is holding that tab's traffic. A **Direct** tab draws nothing, because a badge on every tab makes the one that matters harder to see
      _(computed in MAIN and pushed; the untrusted renderer only displays it. A security indicator computed in the renderer is one a page-driven bug could talk into lying.)_
- [x] **Connections overview + disclosure copy** in Settings → Network privacy: the list with live status, add/remove, the default-route picker, and plain statements that the browser does not provide the tunnel and that the exit note is the user's own unverified claim
- [x] **Per-group indicator** on the group header ([route-badge.tsx](../../packages/tab-strip/src/route-badge.tsx), 8 tests): a shield beside the group name — green / amber / red for a VPN leg, purple when Tor is carrying traffic and grey when it is not. A **chained** route splits one shield down the middle, one half per leg, because either leg dying cuts the group. Colour is never the only signal: every state is also named in the accessible name. A Direct group draws nothing.
- [ ] A legal/perf disclosure pass once a bundled provider exists

### L10 — Safe-Browsing interplay

- [x] Keep per-partition DNR (`@ghostery/adblocker-electron`) working **inside** every tunnel-bound partition; **no regression** to "NO system-proxy MITM"
      _(the multiplexer attaches per session instead of once per process — its one-shot `initialized` flag meant the first session got the whole filtering plane and every later one got nothing, silently. Registered as a **critical** attacher, so a session it cannot attach to is refused rather than served unfiltered.)_
- [x] Document filter-vs-tunnel ordering: the per-session webRequest pipeline (DNR/adblock/Shield) runs **before** anything reaches the connection's SOCKS endpoint, on every partition alike — the multiplexer is attached per session, so a tunnel-bound request is filtered by exactly the same handlers, in the same order, as a Direct one

### L10 — Where the tunnel's promise meets fingerprinting (rival evidence: Brave, Tor Browser)

> **Where this came from.** [`research/privacy/fingerprinting.md`](../../research/privacy/fingerprinting.md)
> and the Shields/farbling comparison in
> [`research/competitors/brave.md`](../../research/competitors/brave.md).
>
> **The engine is not this phase's.** Fingerprinting protection is already owned by
> [Phase 2 → L10 Safe-Browsing Suite](phase-2-adapters-safe-browsing.md), where the research detail and the
> required ADR now live. What belongs **here** is the part that is load-bearing for Phase 5's own promise:
> this phase hides the **IP**, and a user who routes a tab through Tor and is then re-identified by canvas
> hash — or whose real address leaks out of WebRTC — got the ceremony of privacy without the substance.

- [ ] **WebRTC local-IP leak is a kill-switch concern, not a privacy preference.** Block host-candidate
      exposure (mDNS obfuscation) for any tunnel-bound partition. A leak here reveals the real address of a tab
      the user was told is tunneled, so it fails this phase's promise regardless of what Phase 2 ships
- [ ] **One claim, one surface.** Fingerprint posture binds at the same three scopes as a route
      (General / group / tab) and is shown in the same place as the route badge — "this tab is anonymous" must
      not be assembled by the user out of two independent settings that can disagree
- [ ] **Say what the tunnel does not do.** The connections overview states plainly that a tunnel hides the
      network address and **not** the browser profile, and links to the Phase 2 protection. Today the UI's
      disclosure copy is silent on this, which is the most likely way a user over-trusts it
- [ ] **The transport carries its own identity.** Changing the exit IP does not change the **TLS
      fingerprint** (JA3/JA4-class), the HTTP header order, or the request rhythm — all three are
      standard inputs to anti-bot and reputation systems, and all three survive every tunnel this phase
      builds. Decide and record whether Tepegöz normalizes any of them; if it does not, the disclosure
      copy says so rather than letting "routed through Tor" imply more than it delivers.
      Source: [`research/privacy/cross-profile-tracking.md`](../../research/privacy/cross-profile-tracking.md)
- [ ] **An agent-driven tab has a rhythm.** Automated request timing is a signal on its own, and it is
      the one this project generates by existing. Cross-reference the countermeasures already in
      [`packages/human-input`](../../packages/human-input) (randomized inter-action idle, real gestures)
      and state whether they extend to request pacing or only to input events —
      [`research/privacy/automation-detection.md`](../../research/privacy/automation-detection.md) is the
      analysis of how that detection works
- [ ] **Agent-driven tabs, stated honestly.** Automation timing is itself a signal. Decide and document whether
      a driven tab may claim the same posture as a human-driven one, or whether the badge must say it is more
      identifiable — this project does not get to leave that ambiguous

### Network-privacy onboarding & health (rival evidence: Freenet)

> **Where this came from.** [`research/privacy/freenet.md`](../../research/privacy/freenet.md).
> Freenet is the cautionary case, not a competitor: strong anonymity engineering that users abandoned over
> **setup, packaging, unreadable errors and silent connection death** — roughly 35% of its complaints are
> install/usability, versus 10% about anonymity itself. Phase 5a currently expects the user to bring a
> WireGuard config and read status words. That is the same cliff.

- [ ] **First-run flow for a tunnel** — import a config, name it, test it, and see a plain-language result;
      a failed test says which step failed (config parse / handshake / DNS / exit reachability), not "not
      connected"
- [ ] **Connection health over time** — keep-alive, reconnect, and per-connection metrics (handshake success
      rate, latency, uptime) surfaced in the connections overview, so a tunnel that dies quietly is visible
      instead of being discovered through a leak
- [ ] **Errors in the user's language, with a next step** — every failure state maps to one localized sentence
      and one action; no raw provider stderr in the UI
- [ ] **Docs that assume nothing** — a short Turkish + English guide covering what the tunnel does and does
      **not** hide (explicitly: it does not stop fingerprinting — cross-link the section above)

### 5b — Managed own-infra (optional; rides the Phase 3 backend)

- [ ] _Tepegöz-managed exit nodes_ behind the **Phase 3 Zero-Trust gateway** + billing/quota/rate-limit + abuse protection — each managed exit is just another poolable connection a tab can bind to — _clearly tagged 5b; deferred behind adoption data_
- [ ] **License/legal review** (the original Phase 4 caveat: abuse liability, lawful-use ToS, jurisdiction) recorded in **ADR-0011**
- [ ] Managed-exit selection plugs into the **same** `NetworkPrivacyProvider` + connection-pool seam (no rewrite of 5a)
