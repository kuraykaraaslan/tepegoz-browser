# Phase 5 — VPN & Network Privacy (per-tab & per-group tunnels + Tor)

**Status:** ⬜ Not started  ·  **Estimate:** ~4–6 months (5a, then optional 5b behind adoption)
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
  `WebContents` on the **session partition keyed by `(profile, connectionId)`** whose proxy points at that
  connection's SOCKS port. Tabs (across groups) that resolve to the same `(profile, connection)` share that
  partition's storage; `Direct` tabs use the plain profile partition. **Groups are a binding/UI layer, not
  a partition axis** — the partition key is still `(profile, connection)`, so N groups on the same
  connection share one partition.
- **Default binding = `Direct`** (pure local-first preserved). A new tab inherits its opener's (or group's)
  binding; a fresh ungrouped tab is `Direct` unless a profile default is set.
- **Re-binding a live tab/group** requires re-hosting the affected `WebContents` on the target partition ⇒
  those tabs **reload** (Electron binds a `WebContents` to its session at creation). Re-binding a group
  reloads every member that was inheriting (tabs with an explicit override are left alone). This
  reload-on-switch is a documented trade-off, gated by a confirm in the Modal, and must be **fail-closed**
  (never a flash of clear-path traffic mid-switch).

## Exit criteria (DoD)
- [ ] **Binding selectable at all three scopes — General, Group, Tab**; **multiple connections active concurrently**; **default = Direct** (pure local-first preserved — no tunnel unless opted in)
- [ ] **Binding inheritance works:** a tab inherits its group's connection, a group inherits General; `tab override → group → General default → Direct` resolves correctly on group move/add/remove and on changing the General default
- [ ] Tab **right-click → "Route this tab through…"** and group **right-click → "Route this group through…"** open a **Connection-picker Modal** (active connections + region/status + "Direct"); selection re-binds the tab/group; live per-tab **and** per-group indicators reflect it
- [ ] **Fail-closed kill-switch per connection:** if a tunnel drops, **every tab resolving to it** (via direct override or group inheritance) is blocked — **no leak, no silent fallback to Direct** (verified by an automated leak test); rebinding-on-switch never leaks mid-transition
- [ ] **DNS-leak prevention:** tunnel/DoH DNS only inside a tunneled tab's partition; verified by leak test (no plaintext resolver for any tunnel-bound tab)
- [ ] **No cross-tab bleed:** a tab bound to connection A never egresses via B or Direct; distinct connections stay isolated (distinct partitions/ports; Tor streams isolated per connection)
- [ ] **ADR-0011** written + Accepted (VPN & network-privacy architecture: three-scope binding — General/Group/Tab — with `tab→group→General→Direct` resolution over per-(profile,connection) SOCKS partitions, connection-pool lifecycle, reload-on-rebind trade-off, BYO vs managed, Tor trust model, reconciliation with "no system-proxy MITM")
- [ ] **Threat Model updated** (`docs/THREAT-MODEL.md`): tunnel compromise, DNS leak, split-tunnel/per-tab misbinding leakage, **group-inheritance misbinding** (tab silently on the wrong exit after a group move), rebind-transition leak, **Tor exit-node** risk + a `VPN/Tor tunnel` trust-boundary entry + revisit note
- [ ] **i18n:** en+tr full parity for all new surfaces (tab + group context-menu entries, connection-picker Modal, per-tab & per-group status/region indicator, reload-on-switch confirm, consent/disclosure copy)
- [ ] Coverage (S80/B70/F80/L80) + self-review/code-review + UAT signoff + migration-safe DB

## Tasks

### L0 — Core Shell (connection pool + per-tab routing seam)
- [ ] **Connection pool** in the **main process only**: several tunnels **up concurrently**, each with its own local SOCKS5 loopback port; up / down / rotate / health-poll per connection; renderer never touches tunnel handles (typed `contextBridge` status only)
- [ ] **Partition-per-`(profile, connectionId)`** (`persist:tepegoz-profile-{id}--conn-{connId}`) → `session.setProxy({ proxyRules })` pointed at **that connection's** loopback SOCKS port — **explicitly NOT** an OS system proxy (preserves Phase 2 stance); `Direct` tabs stay on the plain profile partition
- [ ] **Binding API** (main): `setGeneralBinding(profileId, connectionId | 'direct')` + `bindGroup(groupId, connectionId | 'direct' | 'inherit')` + `bindTab(tabId, connectionId | 'direct' | 'inherit')` — resolves `tab override → group → General default → Direct`, re-hosts affected `WebContents` on the target partition (reload-on-switch), records the binding, and surfaces resolved bindings to the renderer; re-resolves on group add/move/remove **and on General-default change**; bindings survive tab move/detach within the profile
- [ ] `proxyBypassRules` for loopback/local so IPC + localhost dev are never tunneled; **deny-by-default** for everything else on any tunnel-bound partition

### L6/L7 — NetworkPrivacyProvider adapter (BYO 3rd-party, 5a)
- [ ] `NetworkPrivacyProvider` interface (`connect/disconnect/status/rotate`, exposes a local SOCKS port) — one **instance per active connection**; registered to the **L5 Capability Plane** as a provider (same gateway / permission / audit path)
- [ ] `WireGuardConfigProvider`: import/parse `.conf`, **zod `safeParse` at the trust boundary** (untrusted user input); userspace WireGuard ↔ local SOCKS bridge; **multiple instances coexist** (distinct ports) — *native hot path candidate for `packages/native-rs` (Phase 1b crate)*
- [ ] Account-based providers (Mullvad/Proton-style): credentials + config **only in main via `safeStorage`**; never bundled/logged (redaction); per-connection isolation (multiple regions live at once)
- [ ] `ExecutionRouter`-style selection: deterministic provider/region pick when a tab requests a **new** connection; decision + reason → Event Journal

### Tor integration (5a)
- [ ] `TorProvider`: embedded Tor (**arti**, Rust) *or* bundled tor daemon exposing a local SOCKS port; same connection-pool + per-tab binding seam as VPN; a Tor connection is just another entry in the pool
- [ ] Per-tab **Tor / `.onion`** binding; new-circuit / circuit-rotation control surfaced in the Modal; **isolate streams per connection** (no circuit sharing across tabs bound to different Tor connections)
- [ ] **Exit-node = untrusted** assumption documented (ADR-0011 + threat model); force HTTPS-only / warn on cleartext over a Tor exit

### L8 — Security Kernel (egress + kill-switch)
- [ ] Extend the **Egress Firewall**: **fail-closed kill-switch scoped per connection** — a connection dropping ⇒ **all tabs resolving to it** (direct override or group inheritance) have egress blocked (no fallback to the clear path); other connections' tabs unaffected
- [ ] **Rebind safety:** the reload-on-switch transition is atomic w.r.t. egress — no request escapes on the old (or Direct) path once a re-bind is requested
- [ ] **DNS-leak detection** + "cleartext-when-tunnel-expected" anomaly (per tab/partition) → agent-lockout + HITL on high risk
- [ ] Account for the **encrypted-tunnel blind spot**: anomaly scoring shifts to metadata/timing/volume (payload is opaque inside the tunnel) — documented, not silently weakened

### L9 — Browser UI
- [ ] **Selection at all three scopes** opens the same **Connection-picker Modal**, scoped accordingly: **General** — a network-privacy settings surface (default connection for the profile); **Group** — group context menu → "Route this group through…"; **Tab** — tab context menu → "Route this tab through…" (tab-strip / `tab-engine` right-click menus)
- [ ] **Connection-picker Modal:** lists **active connections** (region + live status + which tabs/groups use each), a **Direct** option, an **"Inherit"** option (Tab → group, Group → General), and an **"Add connection"** path (import WireGuard `.conf` / pick account region / start Tor); selecting a connection **re-binds the chosen scope** (with the reload-on-switch confirm; group/General scope warns how many members reload); all copy via `@tepegoz/i18n` (en+tr)
- [ ] **Per-tab tunnel indicator** (exit-region / Tor / Direct + kill-switch state; marks whether it's inherited vs overridden) + a **per-group indicator** (group color/badge shows the group's connection) + a profile-level connections overview; consent/disclosure copy (legal + perf trade-off) — all via `@tepegoz/i18n` (en+tr)

### L10 — Safe-Browsing interplay
- [ ] Keep per-partition DNR (`@ghostery/adblocker-electron`) working **inside** every tunnel-bound partition; **no regression** to "NO system-proxy MITM"
- [ ] Document filter-vs-tunnel ordering (DNR applies before egress hits the connection's SOCKS endpoint), per binding

### 5b — Managed own-infra (optional; rides the Phase 3 backend)
- [ ] *Tepegöz-managed exit nodes* behind the **Phase 3 Zero-Trust gateway** + billing/quota/rate-limit + abuse protection — each managed exit is just another poolable connection a tab can bind to — *clearly tagged 5b; deferred behind adoption data*
- [ ] **License/legal review** (the original Phase 4 caveat: abuse liability, lawful-use ToS, jurisdiction) recorded in **ADR-0011**
- [ ] Managed-exit selection plugs into the **same** `NetworkPrivacyProvider` + connection-pool seam (no rewrite of 5a)
