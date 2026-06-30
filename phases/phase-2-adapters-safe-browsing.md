# Phase 2 — Integration Adapters + Safe-Browsing Suite

**Status:** ⬜ Not started  ·  **Estimate:** ~4–6 months  ·  **Depends on:** Phase 1b
**Goal:** Complete real daily tasks end-to-end (official-API first) + add daily-driver trust foundations
(adblock, scam protection, cookie editor). **Stays local-first; no managed backend.**

## Exit criteria (DoD)
- [ ] At least Gmail + Drive + Calendar adapters work end-to-end via official API; Canva via MCP
- [ ] Adblock + Safe Browsing + AgentThreatShield active; cookie editor works
- [ ] Adapter health-check + version-pinning + regression suite exist; security re-evaluated on browser fallback
- [ ] **i18n:** en+tr keys added for new surfaces (adapter consent/scope screens, safe-browsing settings, cookie editor)
- [ ] Coverage + self-review + UAT signoff + migration-safe

## Tasks

### L6 — Integration Adapter Layer (extra requirement #5)
- [ ] `IntegrationAdapter` dual-backend: `ApiBackend` (official REST/SDK, **preferred**) + `BrowserBackend` (logged-in WebContentsView fallback)
- [ ] `ExecutionRouter`: **Official API > Browser-automation** (deterministic; decision+reason to event-log); on fallback the security class (read→state-changing) is re-evaluated
- [ ] `Credential Vault` + OAuth Broker: Authorization Code + **PKCE**, least-scope, refresh rotation, per-profile isolation, DPAPI/safeStorage + AES-256-GCM; **OAuth token never raw-visible to the agent**
- [ ] Reference adapters: **Google package** (Gmail read/draft/**send=HITL**, Drive→blob, Calendar) single OAuth client
- [ ] **Canva = existing remote MCP** (`mcp__claude_ai_Canva__*`) — do NOT write a custom adapter (MCP-vs-adapter criterion → ADR)
- [ ] Adapter **health-check + version-pinning + regression suite**; large output (Drive/Gmail thread) → CAS + reference+summary
- [ ] each adapter registered to L5 Capability Plane as a ToolProvider (same gateway/permission/audit)

### L10 — Safe-Browsing Suite (extra requirement #8)
- [ ] `NetworkFilterEngine`: `@ghostery/adblocker-electron` (EasyList/EasyPrivacy → DNR + cosmetic, **per-partition**) — **NO system-proxy MITM**
- [ ] `SafeBrowsingService` full: Google Safe Browsing v5 Update API (local hash-prefix) + community blocklist
- [ ] `AgentThreatShield`: **local SLM** (landed in Phase 1b) scam/phishing scoring + egress anomaly → on high risk agent-lockout + HITL; anti-blabbering
- [ ] `PopupAndPermissionGuard`: `setWindowOpenHandler` + background open; single policy-engine (no parallel permission flow)

### Cookie & Storage editor (extra requirement #8)
- [ ] `CookieAndStorageInspector`: CDP/`session.cookies` **DevTools-only** inspect-edit; fully isolated from OAuth vault; **agent access off by default**

### Extensibility
- [ ] Adapter Registry + Community SDK skeleton: signed `adapter.json` + sandbox + install-time scope-review
