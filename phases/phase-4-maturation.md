# Phase 4 — Maturation (Full Extensions, Cross-Platform, Enterprise)

**Status:** ⬜ Not started  ·  **Estimate:** ~6+ months (ongoing; scope branches on adoption data)
**Depends on:** Phase 3  ·  **Goal:** Open deep technical bets only if adoption data warrants; otherwise
deepen the local-first + security leadership. None of this blocks MVP value.

## Exit criteria (DoD)
- [ ] Each opened deep bet (full-Chromium / cross-platform / enterprise) decided with its own ADR + cost/risk analysis
- [ ] **i18n:** additional locales beyond en/tr (infra already ready) added if needed; new surfaces have en+tr (+extra) parity
- [ ] Coverage + self-review + UAT signoff + migration-safe

## Tasks

### Full Chrome Web Store compatibility DECISION (only if adoption data warrants)
- [ ] patched-Chromium custom build (Brave/Vivaldi model) **cost/CVE-burden analysis** + **honest warning:** this is NOT a change hideable behind the capability-plane interface (renderer/IPC/CDP fundamentally affected; serious load for a small team) — ADR
- [ ] if pursued, AppContainer→WASM hardening behind the CapabilitySandbox interface

### Cross-platform expansion (macOS / Linux)
- [ ] native module abstractions: credential vault (Keychain/libsecret), biometric (platform), local SLM (CoreML/Metal/Vulkan ↔ DirectML)
- [ ] per-OS QA + IME regression + security-patch matrix; macOS notarize + Developer ID

### Ecosystem & enterprise
- [ ] Built-in VPN (deferred): 3rd-party integration or own-infra decision (license/legal) — ADR
- [ ] Connector/Skill **marketplace** (signed Ed25519 + provenance + sandbox + scope-review)
- [ ] Enterprise: RBAC, SIEM/audit export, SSO, real org-policy, SOC2 path
- [ ] Extended adapter library + site-specific connectors (a pre-WebMCP layer that raises end-to-end completion rate)

### WebMCP (future-ready)
- [ ] When WebMCP adoption grows on the web, promote `navigator.modelContext` to a first-class fast path (currently optional/dead-code; speed comes from official-API adapters)
