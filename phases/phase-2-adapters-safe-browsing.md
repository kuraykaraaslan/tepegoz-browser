# Phase 2 — Integration Adapters + Safe-Browsing Suite

**Status:** ⬜ Not started  ·  **Estimate:** ~4–6 months  ·  **Depends on:** Phase 1b
**Goal:** Complete real daily tasks end-to-end (official-API first) + add daily-driver trust foundations
(adblock, scam protection, cookie editor). **Stays local-first; no managed backend.**

## Exit criteria (DoD)
- [ ] At least Gmail + Drive + Calendar adapters work end-to-end via official API; Canva via MCP
- [ ] Adblock + Safe Browsing + AgentThreatShield active; cookie editor works
- [ ] Cookie isolation + fingerprinting protection + per-site data clearing active; WebAuthn/passkey + built-in password manager work (agent access OFF)
- [ ] Adapter health-check + version-pinning + regression suite exist; security re-evaluated on browser fallback
- [ ] **i18n:** en+tr keys added for new surfaces (adapter consent/scope screens, safe-browsing settings, cookie editor, cookie-isolation/fingerprint toggles, password manager/passkey UI)
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
- [ ] **Third-party cookie isolation (Total-Cookie-Protection style)**: per-site state partitioning on top of Chromium's partition mechanism (consistent with **per-partition** adblock above); Firefox TCP as reference — **ADR required** (partition scope per-context vs. per-site; must NOT break logged-in adapter/`BrowserBackend` sessions)
- [ ] **Fingerprinting protection**: noise on canvas/WebGL/font/audio entropy + `navigator` surface reduction; **per-site toggle** (strict/standard) for breakage — **ADR required** (scope + determinism/replay impact; agent's own automation runs `standard`, observations recorded per ADR-0004)

### Cookie & Storage editor (extra requirement #8)
- [ ] `CookieAndStorageInspector`: CDP/`session.cookies` **DevTools-only** inspect-edit; fully isolated from OAuth vault; **agent access off by default**
- [ ] **Per-site data clearing** ("Forget this site" / `Clear-Site-Data`): cookies + storage + cache + service-worker + permissions in one action; isolated from OAuth vault — **ADR required**: clearing recorded as a `SiteDataCleared` event (append-only "shown=recorded", ADR-0004) + user warning on silent credential loss

### Credentials & Passkey (daily-driver) — **ADR required** (trust model, at phase start)
- [ ] **Full WebAuthn / passkey**: enable `navigator.credentials` in renderer + `setDevicePermissionHandler` (platform authenticator / Windows Hello bridge — shares the Windows Hello HITL path from Phase 1a)
- [ ] **Built-in password manager**: autofill + strong-password generation + `safeStorage`-encrypted vault + vault UI; breach/leak warning optional. **Constraint:** vault lives in main process (`safeStorage`, ADR-0005); renderer gets autofill only via narrow/zod-validated IPC; **agent access OFF by default** (ADR-0006 sensitive-site lockout already covers "password managers"). Cross-reference Phase 3 **password E2EE sync** + **Bitwarden native adapter** (sync/external layer; this is the local engine)

### Extensibility
- [ ] Adapter Registry + Community SDK skeleton: signed `adapter.json` + sandbox + install-time scope-review
