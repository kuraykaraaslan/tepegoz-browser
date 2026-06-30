# Phase 5 — VPN & Network Privacy (per-profile tunnels + Tor)

**Status:** ⬜ Not started  ·  **Estimate:** ~4–6 months (5a, then optional 5b behind adoption)
**Depends on:** Phase 3 (managed-backend seam) + Phase 2 (`NetworkFilterEngine` / per-partition session model)
**Goal:** Give each profile an **optional, fail-closed network-privacy layer** — BYO VPN config first,
then optional managed exit nodes and Tor — **without** weakening the local-first default (off by default)
or the existing **"NO system-proxy MITM"** stance. Tunneling is **per-profile/partition** via
`session.setProxy()` to a local SOCKS endpoint, never an OS-level system proxy.
**Branch examples:** `feat/vpn-per-partition-routing`, `feat/wireguard-config-provider`, `feat/tor-provider`, `feat/egress-killswitch`

## Exit criteria (DoD)
- [ ] Per-profile VPN/Tor selectable; **default OFF** (pure local-first preserved — no tunnel unless the user opts in)
- [ ] **Fail-closed kill-switch:** if a tunnel drops, that partition's egress is blocked — **no leak** (verified by an automated leak test)
- [ ] **DNS-leak prevention:** tunnel/DoH DNS only inside a tunneled partition; verified by leak test (no plaintext resolver outside the tunnel)
- [ ] **ADR-0011** written + Accepted (VPN & network-privacy architecture: per-partition SOCKS routing, BYO vs managed, Tor trust model, reconciliation with "no system-proxy MITM")
- [ ] **Threat Model updated** (`docs/THREAT-MODEL.md`): tunnel compromise, DNS leak, split-tunnel leakage, **Tor exit-node** risk + a `VPN/Tor tunnel` trust-boundary entry + revisit note
- [ ] **i18n:** en+tr full parity for all new surfaces (per-profile network settings, status/region indicator, consent/disclosure copy)
- [ ] Coverage (S80/B70/F80/L80) + self-review/code-review + UAT signoff + migration-safe DB

## Tasks

### L0 — Core Shell (per-partition routing seam)
- [ ] Per-profile partition (`persist:tepegoz-profile-{id}`) → `session.setProxy({ proxyRules })` pointed at a **local SOCKS5 endpoint** (the active provider's loopback port) — **explicitly NOT** an OS system proxy (preserves Phase 2 stance)
- [ ] Tunnel **lifecycle in main process only**: up / down / rotate / health-poll; reflected per-partition; renderer never touches tunnel handles (typed `contextBridge` status only)
- [ ] `proxyBypassRules` for loopback/local so IPC + localhost dev are never tunneled; **deny-by-default** for everything else when a tunnel is selected

### L6/L7 — NetworkPrivacyProvider adapter (BYO 3rd-party, 5a)
- [ ] `NetworkPrivacyProvider` interface (`connect/disconnect/status/rotate`, exposes a local SOCKS port) — registered to the **L5 Capability Plane** as a provider (same gateway / permission / audit path)
- [ ] `WireGuardConfigProvider`: import/parse `.conf`, **zod `safeParse` at the trust boundary** (untrusted user input); userspace WireGuard ↔ local SOCKS bridge — *native hot path candidate for `packages/native-rs` (Phase 1b crate)*
- [ ] Account-based providers (Mullvad/Proton-style): credentials + config **only in main via `safeStorage`**; never bundled/logged (redaction); per-profile isolation
- [ ] `ExecutionRouter`-style selection: deterministic provider pick per profile; decision + reason → Event Journal

### Tor integration (5a)
- [ ] `TorProvider`: embedded Tor (**arti**, Rust) *or* bundled tor daemon exposing a local SOCKS port; same per-partition routing seam as VPN
- [ ] Per-profile **Tor / `.onion`** selection; new-circuit / circuit-rotation control surfaced to UI; isolate streams per partition (no circuit sharing across profiles)
- [ ] **Exit-node = untrusted** assumption documented (ADR-0011 + threat model); force HTTPS-only / warn on cleartext over a Tor exit

### L8 — Security Kernel (egress + kill-switch)
- [ ] Extend the **Egress Firewall**: **fail-closed kill-switch** — tunnel-down ⇒ partition egress blocked (no fallback to the clear path)
- [ ] **DNS-leak detection** + "cleartext-when-tunnel-expected" anomaly → agent-lockout + HITL on high risk
- [ ] Account for the **encrypted-tunnel blind spot**: anomaly scoring shifts to metadata/timing/volume (payload is opaque inside the tunnel) — documented, not silently weakened

### L9 — Browser UI
- [ ] Per-profile **network-privacy settings**: Off / VPN / Tor; provider config import; default **OFF**
- [ ] Live **tunnel status + exit-region indicator** + kill-switch state; consent/disclosure copy (legal + perf trade-off) — all via `@tepegoz/i18n` (en+tr)

### L10 — Safe-Browsing interplay
- [ ] Keep per-partition DNR (`@ghostery/adblocker-electron`) working **inside** a tunnel; **no regression** to "NO system-proxy MITM"
- [ ] Document filter-vs-tunnel ordering (DNR applies before egress hits the SOCKS endpoint)

### 5b — Managed own-infra (optional; rides the Phase 3 backend)
- [ ] *Tepegöz-managed exit nodes* behind the **Phase 3 Zero-Trust gateway** + billing/quota/rate-limit + abuse protection — *clearly tagged 5b; deferred behind adoption data*
- [ ] **License/legal review** (the original Phase 4 caveat: abuse liability, lawful-use ToS, jurisdiction) recorded in **ADR-0011**
- [ ] Managed-exit selection plugs into the **same** `NetworkPrivacyProvider` seam (no rewrite of 5a)
