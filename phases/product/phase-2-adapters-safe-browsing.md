# Phase 2 — Integration Adapters + Safe-Browsing Suite

**Status:** 🟡 In progress (ExecutionRouter + per-site data clearing landed 2026-08-19)  ·  **Estimate:** ~4–6 months  ·  **Depends on:** Phase 1b
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
- [~] `IntegrationAdapter` dual-backend: `ApiBackend` (official REST/SDK, **preferred**) + `BrowserBackend` (logged-in WebContentsView fallback) _(down-payment shipped: shared `AdaptorConnection` inventory model covers `mcp`, `rest`, `graphql`, `oauth_service`, and `local` adaptors with auth kind, permission scopes, state, tool count, and audit-required metadata; Settings surfaces them under one Adaptors panel. Real REST/GraphQL/OAuth adapter execution remains pending.)_
- [x] `ExecutionRouter`: **Official API > Browser-automation** (deterministic; decision+reason to event-log); on fallback the security class (read→state-changing) is re-evaluated
      _(landed: [execution-router.ts](../../packages/security-policy/src/execution-router.ts). Pure and deterministic — no model, no clock, no network. Falling back escalates the risk class because the two paths are **not** two ways of doing one thing: an API call has a declared scope and a revocable token, a browser fallback has the user's whole session and none. Even a READ escalates, since a browser read navigates a logged-in session. It also REFUSES when there is neither an adaptor nor a page, rather than guessing at one. **Not wired to a caller yet** — no adapter executes through it, because no REST/OAuth adapter exists to execute.)_
- [ ] `Credential Vault` + OAuth Broker: Authorization Code + **PKCE**, least-scope, refresh rotation, per-profile isolation, DPAPI/safeStorage + AES-256-GCM; **OAuth token never raw-visible to the agent**
- [ ] Reference adapters: **Google package** (Gmail read/draft/**send=HITL**, Drive→blob, Calendar) single OAuth client
- [ ] **Canva = existing remote MCP** (`mcp__claude_ai_Canva__*`) — do NOT write a custom adapter (MCP-vs-adapter criterion → ADR)
- [ ] Adapter **health-check + version-pinning + regression suite**; large output (Drive/Gmail thread) → CAS + reference+summary
- [~] each adapter registered to L5 Capability Plane as a ToolProvider (same gateway/permission/audit) _(down-payment shipped: MCP and local/native tool providers are projected into the same Adaptors inventory; `@tepegoz/web-tools` registers web search/get-page through ToolGateway/PolicyKernel. Future REST/GraphQL/OAuth adapters consume the same model.)_

### L10 — Safe-Browsing Suite (extra requirement #8)
- [ ] `NetworkFilterEngine`: `@ghostery/adblocker-electron` (EasyList/EasyPrivacy → DNR + cosmetic, **per-partition**) — **NO system-proxy MITM**
- [ ] `SafeBrowsingService` full: Google Safe Browsing v5 Update API (local hash-prefix) + community blocklist
- [ ] `AgentThreatShield`: **local SLM** (landed in Phase 1b) scam/phishing scoring + egress anomaly → on high risk agent-lockout + HITL; anti-blabbering
- [ ] `PopupAndPermissionGuard`: `setWindowOpenHandler` + background open; single policy-engine (no parallel permission flow)
- [ ] **Third-party cookie isolation (Total-Cookie-Protection style)**: per-site state partitioning on top of Chromium's partition mechanism (consistent with **per-partition** adblock above); Firefox TCP as reference — **ADR required** (partition scope per-context vs. per-site; must NOT break logged-in adapter/`BrowserBackend` sessions)
- [ ] **Fingerprinting protection**: noise on canvas/WebGL/font/audio entropy + `navigator` surface reduction; **per-site toggle** (strict/standard) for breakage — **ADR required** (scope + determinism/replay impact; agent's own automation runs `standard`, observations recorded per ADR-0004)

### Cookie & Storage editor (extra requirement #8)
- [ ] `CookieAndStorageInspector`: CDP/`session.cookies` **DevTools-only** inspect-edit; fully isolated from OAuth vault; **agent access off by default**
- [x] **Per-site data clearing** ("Forget this site" / `Clear-Site-Data`): cookies + storage + cache + service-worker + permissions in one action; isolated from OAuth vault — clearing recorded as a `SiteDataCleared` event (append-only "shown=recorded", ADR-0004) + user warning on silent credential loss
      _(landed: [site-data.ts](../../packages/security-policy/src/site-data.ts) + [ipc-site-data.ts](../../apps/desktop/src/main/ipc/ipc-site-data.ts) + a Settings row, EN+TR. **Two-step by construction** — the first click PLANS, which is what produces the warnings; a one-click version would sign people out of sites they were using without telling them. The credential vault is never in scope and has its own predicate, because that is the invariant most likely to be broken by someone adding "and also clear saved passwords" to this button. **Owed:** the per-site ADR the line asks for (the behaviour is implemented and documented in code; the ADR is not written), permissions are not part of the clear, and the offline-data warning is deliberately not probed — a warning we are unsure of trains people to ignore warnings.)_

### Credentials & Passkey (daily-driver) — **ADR required** (trust model, at phase start)
- [ ] **Full WebAuthn / passkey**: enable `navigator.credentials` in renderer + `setDevicePermissionHandler` (platform authenticator / Windows Hello bridge — shares the Windows Hello HITL path from Phase 1a)
- [ ] **Built-in password manager**: autofill + strong-password generation + `safeStorage`-encrypted vault + vault UI; breach/leak warning optional. **Constraint:** vault lives in main process (`safeStorage`, ADR-0005); renderer gets autofill only via narrow/zod-validated IPC; **agent access OFF by default** (ADR-0006 sensitive-site lockout already covers "password managers"). Cross-reference Phase 3 **password E2EE sync** + **Bitwarden native adapter** (sync/external layer; this is the local engine)

### Extensibility
- [ ] Adapter Registry + Community SDK skeleton: signed `adapter.json` + sandbox + install-time scope-review
