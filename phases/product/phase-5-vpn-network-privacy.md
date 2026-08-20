# Phase 5 — VPN & Network Privacy (per-tab & per-group tunnels + Tor)

**Status:** 🟡 In progress (decision layer landed 2026-08-19; **enforcement seam landed 2026-08-20** — per-session wiring registry, fail-closed egress config, verified `setProxy` call site, and a **passing automated leak test**; see [ADR-0011](../../docs/adr/0011-vpn-network-privacy.md) + its Amendment) · **Estimate:** ~4–6 months (5a, then optional 5b behind adoption)
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
  reload-on-switch is a documented trade-off, gated by a confirm in the Modal, and must be **fail-closed**
  (never a flash of clear-path traffic mid-switch).

## Exit criteria (DoD)
- [~] **Binding selectable at all three scopes — General, Group, Tab**; **multiple connections active concurrently**; **default = Direct** (pure local-first preserved — no tunnel unless opted in)
      _(the RESOLUTION rule is landed and tested — [connection-binding.ts](../../packages/tab-engine/src/connection-binding.ts). Nothing selects a binding yet: no UI, no connection pool, so "multiple connections active concurrently" has nothing to be concurrent with.)_
- [x] **Binding inheritance works:** a tab inherits its group's connection, a group inherits General; `tab override → group → General default → Direct` resolves correctly on group move/add/remove and on changing the General default
      _(landed: `resolveBinding` + `affectedByGroupChange` + `affectedByGeneralChange`, 19 tests covering the resolution order and both re-resolution directions.)_
- [ ] Tab **right-click → "Route this tab through…"** and group **right-click → "Route this group through…"** open a **Connection-picker Modal** (active connections + region/status + "Direct"); selection re-binds the tab/group; live per-tab **and** per-group indicators reflect it
- [~] **Fail-closed kill-switch per connection:** if a tunnel drops, **every tab resolving to it** (via direct override or group inheritance) is blocked — **no leak, no silent fallback to Direct** (verified by an automated leak test); rebinding-on-switch never leaks mid-transition
      _(the DECISION function is landed and tested — [kill-switch.ts](../../packages/security-policy/src/kill-switch.ts), 8 tests. **The automated leak test now exists and passes** — [spike-tunnel-failclosed.spec.ts](../../e2e/spike-tunnel-failclosed.spec.ts) kills a live SOCKS endpoint under the shipping app and measures that the next request fails while a **proven-reachable** clear path records nothing. **Still owed:** the pool that reports `up`/`down` in the first place, so nothing calls `killSwitchVerdicts` with real status yet; and the rebind-transition (reload-on-switch) leak, which needs the re-hosting path that does not exist.)_
- [~] **DNS-leak prevention:** tunnel/DoH DNS only inside a tunneled tab's partition; verified by leak test (no plaintext resolver for any tunnel-bound tab)
      _(**measured for the connection itself**: the spike proves the SOCKS request carries `DOMAINNAME`, i.e. the hostname is resolved by the proxy and never by the user's resolver, and `assertFailClosed` rejects SOCKS4 — the variant that has no hostname form — outright. **Not covered:** Chromium's DNS *prefetch*/preconnect predictor and DoH, which are process-wide rather than per-session; that residual is now its own task below.)_
- [~] **No cross-tab bleed:** a tab bound to connection A never egresses via B or Direct; distinct connections stay isolated (distinct partitions/ports; Tor streams isolated per connection)
      _(the partition/storage half is landed and tested: distinct connections get distinct partitions, an id that could collide throws instead of being sanitized into a shared cookie jar, and the spike shows a bound session's traffic reaching only the SOCKS endpoint. The **egress** half needs two live connections at once, which needs the pool; Tor stream isolation is untouched.)_
- [x] **Nothing else reaches the network on a tunneled page's behalf.** A swept-for, not assumed, list: popups, tab-strip favicons, page-opened tabs, and the app's own HTTP
      _(four paths the phase never listed, two of them live leaks. **Popups**: `window.open()` from a tunnel-bound page opened on the **clear path** — the options constant was pinned to the Direct partition; now `popupWindowOptions(openerSession)` via `webPreferences.session`. **Favicons**: the tab strip renders in the app chrome (no proxy, ever) and was handed the page's remote icon URL, so the browser chrome made a clear-path request to the viewed site on every navigation — main now fetches on the page's own session and inlines it ([tabs-favicon.electron.ts](../../apps/desktop/src/main/tabs-favicon.electron.ts)), with `TabFaviconSchema` rejecting a non-`data:` favicon at the IPC boundary and [spike-favicon-inline.spec.ts](../../e2e/spike-favicon-inline.spec.ts) measuring it in the shipping app. **Tab creation**: `createTab` now takes a `Session` (defaulting to the registry's Direct one), so a tab can exist on a tunnel partition at all, and a page-opened tab inherits its opener's session. **App-issued HTTP**: see the L8 row below.)_
- [x] **Per-session parity — every browsing partition is wired like the base one.** Ad/tracker filtering (DNR), download quarantine, the User-Agent override and "forget this site" reach a tunnel partition, not just `persist:tepegoz-web`
      _(landed: [browsing-sessions.electron.ts](../../apps/desktop/src/main/network/browsing-sessions.electron.ts) — one registry, retro-applying registration, exactly-once per session, and **critical** attachers whose failure refuses the partition rather than serving it half-wired. This was NOT in the original task list and is the prerequisite the rest of the phase silently assumed: before it, a tunnel partition loaded pages perfectly with no filtering, no quarantine, the wrong UA, and cookies that survived a site clear.)_
- [~] **ADR-0011** written + Accepted (VPN & network-privacy architecture: three-scope binding — General/Group/Tab — with `tab→group→General→Direct` resolution over per-connection SOCKS partitions, connection-pool lifecycle, reload-on-rebind trade-off, BYO vs managed, Tor trust model, reconciliation with "no system-proxy MITM")
      _([ADR-0011](../../docs/adr/0011-vpn-network-privacy.md) Accepted, **amended 2026-08-20** to cover the partition-key correction, the per-session wiring registry, the fail-closed egress configuration and the verified `setProxy` call site. Still explicitly undecided there: the connection pool, WireGuard/Tor providers, the Tor trust model, the picker UI.)_
- [ ] **Threat Model updated** (`docs/THREAT-MODEL.md`): tunnel compromise, DNS leak, split-tunnel/per-tab misbinding leakage, **group-inheritance misbinding** (tab silently on the wrong exit after a group move), rebind-transition leak, **Tor exit-node** risk + a `VPN/Tor tunnel` trust-boundary entry + revisit note
- [ ] **i18n:** en+tr full parity for all new surfaces (tab + group context-menu entries, connection-picker Modal, per-tab & per-group status/region indicator, reload-on-switch confirm, consent/disclosure copy)
- [ ] Coverage (S80/B70/F80/L80) + self-review/code-review + UAT signoff + migration-safe DB

> **What actually runs today (2026-08-20).** Two layers, and the boundary between them is the honest part.
>
> **Decision layer (pure, no Electron):** `resolveBinding`, `partitionKeyFor`,
> `affectedByGroupChange`/`affectedByGeneralChange`, `killSwitchVerdicts`, `tunnelProxyConfig`/
> `assertFailClosed`, and the app-HTTP egress route.
>
> **Enforcement seam (real Electron, running in the shipping app):** every browsing session is created
> through `BrowsingSessions` and carries the full filtering/quarantine/User-Agent plane; `assertFailClosed`
> gates the only `setProxy` call site; `ensureTunnelSession` verifies with `resolveProxy` that the tunnel
> actually took effect and throws instead of degrading; tabs and popups are created on a `Session` rather
> than a partition name, so they inherit their opener's network path; favicons are fetched on the page's
> own session and inlined, so the proxy-less app chrome never fetches anything for a browsed page. Measured
> end-to-end against the shipping app by
> [spike-tunnel-failclosed.spec.ts](../../e2e/spike-tunnel-failclosed.spec.ts) (routes through a live SOCKS
> endpoint with remote DNS; when that endpoint dies the next request fails while a **proven-reachable**
> clear path records nothing) and
> [spike-favicon-inline.spec.ts](../../e2e/spike-favicon-inline.spec.ts).
>
> **Still true, and not softened:** there is no connection pool, no WireGuard or Tor provider, and no UI —
> so **every tab in the browser is Direct today**, exactly as before. Nothing the user can click creates a
> tunnel. What changed is that the machinery a tunnel would run on is now real, wired and measured,
> against any local SOCKS endpoint — which is what removes "we cannot test this yet" as a reason.
>
> **Not fixable in this repo:** shipping a userspace-WireGuard bridge or a Tor daemon means shipping a
> native binary that opens a local listener, and that is gated on Phase 0's **Windows code-signing
> identity** (BLOCKING, not started, a user action). Development and testing no longer depend on it; a
> release does.

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
- [ ] **Connection pool** in the **main process only**: several tunnels **up concurrently**, each with its own local SOCKS5 loopback port; up / down / rotate / health-poll per connection; renderer never touches tunnel handles (typed `contextBridge` status only) — not started
- [x] **Per-session subsystem registry** — every browsing session is created through one place and carries the same wiring (webRequest/DNR, download quarantine, User-Agent), with **critical** attachers whose failure refuses the partition instead of serving it unfiltered ([browsing-sessions.electron.ts](../../apps/desktop/src/main/network/browsing-sessions.electron.ts), 12 tests). _Not in the original plan; the prerequisite everything below assumed._
- [x] **Partition-per-connection** (`persist:tepegoz-web--conn-{connId}`) → `session.setProxy({ proxyRules })` pointed at **that connection's** loopback SOCKS port — **explicitly NOT** an OS system proxy (preserves Phase 2 stance); `Direct` tabs stay on the **existing, unrenamed** `persist:tepegoz-web` partition so no user's cookies/logins are orphaned ([tunnel-session.electron.ts](../../apps/desktop/src/main/network/tunnel-session.electron.ts), 8 tests + the leak spike). _Takes a SOCKS port from a caller; the pool that produces one is the unticked item above._
- [~] **Binding API** (main): `setGeneralBinding(connectionId | 'direct')` + `bindGroup(groupId, connectionId | 'direct' | 'inherit')` + `bindTab(tabId, connectionId | 'direct' | 'inherit')` — resolves `tab override → group → General default → Direct`, re-hosts affected `WebContents` on the target partition (reload-on-switch), records the binding, and surfaces resolved bindings to the renderer; re-resolves on group add/move/remove **and on General-default change**; bindings survive tab move/detach within the profile
- [x] `proxyBypassRules` for loopback so IPC + localhost dev are never tunneled; **deny-by-default** for everything else on any tunnel-bound partition ([egress-proxy.ts](../../packages/security-policy/src/egress-proxy.ts), 16 tests). _Deliberately narrower than the line asked for: loopback literals only, **not** Chromium's `<local>` — a dotless-hostname bypass would send `http://intranet/` out the clear path and hand a LAN host the user's real address._

### L6/L7 — NetworkPrivacyProvider adapter (BYO 3rd-party, 5a)
> **Gated on distribution, not on design.** Every provider below ends in a shipped native binary that
> opens a local listener (userspace WireGuard bridge, `arti`/tor). That needs Phase 0's **Windows
> code-signing identity** — BLOCKING, not started, and a user action nobody in this repo can close —
> plus a Rust toolchain in CI (`packages/native-rs` is deliberately outside the JS build today).
> Development is *not* blocked on either: the routing seam takes any local SOCKS port, and the leak
> test stands one up in-process.
- [ ] `NetworkPrivacyProvider` interface (`connect/disconnect/status/rotate`, exposes a local SOCKS port) — one **instance per active connection**; registered to the **L5 Capability Plane** as a provider (same gateway / permission / audit path)
- [ ] `WireGuardConfigProvider`: import/parse `.conf`, **zod `safeParse` at the trust boundary** (untrusted user input); userspace WireGuard ↔ local SOCKS bridge; **multiple instances coexist** (distinct ports) — *native hot path candidate for `packages/native-rs` (Phase 1b crate)*
- [ ] Account-based providers (Mullvad/Proton-style): credentials + config **only in main via `safeStorage`**; never bundled/logged (redaction); per-connection isolation (multiple regions live at once)
- [ ] `ExecutionRouter`-style selection: deterministic provider/region pick when a tab requests a **new** connection; decision + reason → Event Journal

### Tor integration (5a)
- [ ] `TorProvider`: embedded Tor (**arti**, Rust) *or* bundled tor daemon exposing a local SOCKS port; same connection-pool + per-tab binding seam as VPN; a Tor connection is just another entry in the pool
- [ ] Per-tab **Tor / `.onion`** binding; new-circuit / circuit-rotation control surfaced in the Modal; **isolate streams per connection** (no circuit sharing across tabs bound to different Tor connections)
- [ ] **Exit-node = untrusted** assumption documented (ADR-0011 + threat model); force HTTPS-only / warn on cleartext over a Tor exit

### L8 — Security Kernel (egress + kill-switch)
- [~] Extend the **Egress Firewall**: **fail-closed kill-switch scoped per connection** — a connection dropping ⇒ **all tabs resolving to it** (direct override or group inheritance) have egress blocked (no fallback to the clear path); other connections' tabs unaffected
      _(the mechanism is landed and **measured**: proxy rules carry no `DIRECT` fallback and `assertFailClosed` rejects one in every spelling Chromium honours, so a dead endpoint yields `ERR_PROXY_CONNECTION_FAILED` rather than a clear-path request. Owed: the pool that reports the drop, and the per-connection scoping across two live connections.)_
- [x] **No `DIRECT` fallback, ever** — the one-token property the whole kill-switch rests on, asserted at the only `setProxy` call site rather than trusted to review
- [x] **WebRTC cannot escape the tunnel** — `disable_non_proxied_udp` per tunneled `WebContents`. _WebRTC opens UDP from the host stack while a SOCKS proxy carries TCP: without this a "tunneled" tab hands out the machine's real addresses in ICE candidates while every HTTP request goes through the tunnel. Was missing from this phase's DoD entirely._
- [x] **The app's OWN outbound HTTP has a stated route, and it is fail-closed.** `@tepegoz/http` is axios on Node's stack, so `session.setProxy` never touched it: the agent's `web_fetch`, sitemap reads, model-provider calls and MCP HTTP transports left on the clear path whatever any tab was bound to — a decision nobody had made rather than a bug
      _(**decided:** app-issued HTTP follows the **General** binding only. Tab/Group bindings answer "where does THIS page's traffic go" and a main-process request has no tab to inherit from. [egress-route.ts](../../packages/http/src/egress-route.ts) resolves it per request (so a long-lived provider client follows a General change) and **refuses** the request if a tunnel is in force with no transport installed — never a silent downgrade to Direct. Resolves to Direct today because nothing produces a SOCKS port yet; stops being inert when the pool lands.)_
- [ ] **DNS prefetch / preconnect / DoH residual** — the per-connection path resolves remotely (measured: `DOMAINNAME` reaches the SOCKS server), but Chromium's predictor and DoH are process-wide, not per-session. Decide and verify: disable the predictor for tunnel-bound contexts, or prove it never resolves for them
- [ ] **Partition teardown** — Electron can clear a partition's storage but not delete its directory, so a removed connection leaves its cookies/cache on disk. The pool's teardown needs an explicit clear step, or the "private" partition outlives the connection it belonged to
- [ ] **Rebind safety:** the reload-on-switch transition is atomic w.r.t. egress — no request escapes on the old (or Direct) path once a re-bind is requested
- [ ] **DNS-leak detection** + "cleartext-when-tunnel-expected" anomaly (per tab/partition) → agent-lockout + HITL on high risk
- [ ] Account for the **encrypted-tunnel blind spot**: anomaly scoring shifts to metadata/timing/volume (payload is opaque inside the tunnel) — documented, not silently weakened

### L9 — Browser UI
- [ ] **Selection at all three scopes** opens the same **Connection-picker Modal**, scoped accordingly: **General** — a network-privacy settings surface (default connection for the profile); **Group** — group context menu → "Route this group through…"; **Tab** — tab context menu → "Route this tab through…" (tab-strip / `tab-engine` right-click menus)
- [ ] **Connection-picker Modal:** lists **active connections** (region + live status + which tabs/groups use each), a **Direct** option, an **"Inherit"** option (Tab → group, Group → General), and an **"Add connection"** path (import WireGuard `.conf` / pick account region / start Tor); selecting a connection **re-binds the chosen scope** (with the reload-on-switch confirm; group/General scope warns how many members reload); all copy via `@tepegoz/i18n` (en+tr)
- [ ] **Per-tab tunnel indicator** (exit-region / Tor / Direct + kill-switch state; marks whether it's inherited vs overridden) + a **per-group indicator** (group color/badge shows the group's connection) + a profile-level connections overview; consent/disclosure copy (legal + perf trade-off) — all via `@tepegoz/i18n` (en+tr)

### L10 — Safe-Browsing interplay
- [x] Keep per-partition DNR (`@ghostery/adblocker-electron`) working **inside** every tunnel-bound partition; **no regression** to "NO system-proxy MITM"
      _(the multiplexer attaches per session instead of once per process — its one-shot `initialized` flag meant the first session got the whole filtering plane and every later one got nothing, silently. Registered as a **critical** attacher, so a session it cannot attach to is refused rather than served unfiltered.)_
- [ ] Document filter-vs-tunnel ordering (DNR applies before egress hits the connection's SOCKS endpoint), per binding

### 5b — Managed own-infra (optional; rides the Phase 3 backend)
- [ ] *Tepegöz-managed exit nodes* behind the **Phase 3 Zero-Trust gateway** + billing/quota/rate-limit + abuse protection — each managed exit is just another poolable connection a tab can bind to — *clearly tagged 5b; deferred behind adoption data*
- [ ] **License/legal review** (the original Phase 4 caveat: abuse liability, lawful-use ToS, jurisdiction) recorded in **ADR-0011**
- [ ] Managed-exit selection plugs into the **same** `NetworkPrivacyProvider` + connection-pool seam (no rewrite of 5a)
