# ADR-0011: VPN & network privacy — three-scope binding, per-(profile,connection) partitions, fail-closed by construction

- **Status:** Accepted (binding-resolution + kill-switch layer only — see Consequences)
- **Date:** 2026-08-19
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
- **`partitionKeyFor`** returns the exact `persist:tepegoz-profile-{id}--conn-{connId}` shape the phase
  specifies, keyed by `(profile, connection)` and never by group — groups are a binding/UI layer, so N
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
