# Phase 3 — Managed Subscription + Cloud Memory Sync + Extensions

**Status:** ⬜ Not started  ·  **Estimate:** ~4–6 months  ·  **Depends on:** Phase 2
**Goal:** Turn ON the optional **backend** layer: a managed model proxy for an easy start, cross-device
E2EE memory sync, and limited extension support. Because **local↔backend is pluggable** (thanks to Phase 0
sync-meta + ModelTransport), there is NO rewrite.

## Exit criteria (DoD)
- [ ] Works without the user entering a key via managed proxy; Zero-Trust gateway (JWT ownership/SSL-pin/rate-limit) active
- [ ] Opt-in E2EE cloud memory sync works across two devices; raw screenshots are NOT synced
- [ ] Limited MV3 extension allowlist + **honest chrome.* compatibility matrix** published
- [ ] **i18n:** en+tr keys added for new surfaces (subscription/billing, sync settings, extension management, profile picker)
- [ ] Coverage + self-review + UAT signoff + migration-safe (sync schema) + identity/auth rules (short-lived tokens)

## Tasks

### L7 — BackendTransport + Managed Proxy (extra requirement #7)
- [ ] `BackendTransport` (CanonRequest serialization, shared with handoff format); re-resolved at the proxy
- [ ] Managed proxy: tepegoz-managed key + **billing/quota/rate-limit** + abuse protection
- [ ] **Zero-Trust gateway:** server-side JWT ownership verification, SSL/cert pinning, strict rate-limit
- [ ] Hybrid pricing: small free quota + predictable usage-based + auto-refund on failed tasks
- [ ] Privacy-mode toggle (sensitivity=high → local preprocessing); identity-auth (short-lived, scoped, revocable token; proxy secret never bundled into the app)

### Cloud Memory Sync (extra requirement #2 advanced + #7)
- [ ] pluggable `CloudSyncAdapter`, **opt-in**, E2EE zero-knowledge (libsodium XChaCha20-Poly1305 + Argon2id)
- [ ] CRDT conflict resolution (yjs/automerge); CAS blob lazy/on-demand; BYO-storage (Drive/S3/WebDAV) + optional managed
- [ ] **raw screenshots NOT synced**; (no migration thanks to Phase 0 sync-meta)

### Browser sync (separate from agent memory)
- [ ] bookmark/password/tab E2EE sync — a layer independent of agent-memory sync

### ExtensionHost (extra requirement #9)
- [ ] limited MV3 (content-script/DNR/storage allowlist: Dark Reader, adblock-complement, reading tools) via `electron-chrome-extensions`
- [ ] **honest chrome.* API compatibility matrix** (what works/doesn't) published; NO "all extensions work" promise
- [ ] deep integrations (password managers, e.g. Bitwarden) as **native adapters** (not extensions)

### Multi-profile & extra adapter
- [ ] Full multi-profile targeting (BrowserContext isolation already exists; add UI/flow) — consultant/agency multi-client
- [ ] Notion adapter (OAuth + browser fallback); Adapter Registry **signed package** distribution

### Enterprise readiness foundation
- [ ] audit-log export skeleton; version-tagged prompt-injection attack-success-rate publication
