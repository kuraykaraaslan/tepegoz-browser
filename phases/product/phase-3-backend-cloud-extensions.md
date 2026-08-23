# Phase 3 — Managed Subscription + Cloud Memory Sync + Extensions

**Status:** ⬜ Not started · **Estimate:** ~4–6 months · **Depends on:** Phase 2
**Goal:** Turn ON the optional **backend** layer: a managed model proxy for an easy start, cross-device
E2EE memory sync, and limited extension support. Because **local↔backend is pluggable** (thanks to Phase 0
sync-meta + ModelTransport), there is NO rewrite.

## Exit criteria (DoD)

- [ ] Works without the user entering a key via managed proxy; Zero-Trust gateway (JWT ownership/SSL-pin/rate-limit) active
- [ ] Opt-in E2EE cloud memory sync works across two devices; raw screenshots are NOT synced
- [ ] Limited MV3 extension allowlist + _*honest chrome.* compatibility matrix_* published
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
- [ ] **Local encrypted profile/workspace export-import** (device migration / offline backup): a
      `safeStorage`/passphrase-encrypted archive of profile data (bookmarks/history/preferences/workspaces,
      credentials still vault-scoped) — an **offline** path independent of E2EE cloud sync; reuses the Phase 7
      Data Rights export seam

#### Sync correctness bar (rival evidence: Brave)

> **Where this came from.** [`research/competitors/brave.md`](../../research/competitors/brave.md).
> Sync is Brave's **most-repeated complaint** despite privacy being its whole pitch — chains that break and
> force a full re-pair on every device, links saved on the phone never arriving on the desktop, and the one
> that names a specific bug: _"sildiklerim sonra tekrar geliyor"_ — **deletions resurrect**. That is a
> tombstone-handling failure, and it is the reason this project put `updated_at` / `version` / `tombstone` /
> UUID PK / `device_id` into the schema on day zero rather than retrofitting them here. These tasks make that
> head start into a checkable claim instead of a design intention.

- [ ] **Deletion is durable.** A delete on device A never reappears from device B's stale copy. Tombstones
      carry their own `updated_at` and win against an older write; tombstone retention is longer than the
      longest plausible offline period, and the retention window is written down
- [ ] **Conflict resolution is specified, not emergent** — per-entity rule (last-writer-wins on `version` +
      `updated_at`, with the tie broken by `device_id`), documented per table, and covered by a test that
      replays two divergent devices
- [ ] **No full re-pair as the recovery path.** A chain that desynchronizes repairs itself incrementally; if a
      reset is ever unavoidable it is scoped to one device and never silently drops local-only data
- [ ] **Sync status is legible** — per-device last-sync time, pending item count, and the last error in words;
      a sync that has been failing for a week must be visible without opening a log
- [ ] **Adversarial test suite** replaying the exact Brave complaint set: offline edits on both sides, delete
      vs. edit races, clock skew between devices, a device restored from an old backup, and a partially
      applied batch
- [ ] **Measurement:** convergence verified on a scripted three-device scenario, recorded in the results
      ledger — not "sync works" in prose

### ExtensionHost (extra requirement #9)

- [ ] limited MV3 (content-script/DNR/storage allowlist: Dark Reader, adblock-complement, reading tools) via `electron-chrome-extensions`
- [ ] _*honest chrome.* API compatibility matrix_* (what works/doesn't) published; NO "all extensions work" promise
- [ ] deep integrations (password managers, e.g. Bitwarden) as **native adapters** (not extensions)

### Multi-profile & extra adapter

- [ ] Full multi-profile targeting (BrowserContext isolation already exists; add UI/flow) — consultant/agency multi-client
- [ ] Notion adapter (OAuth + browser fallback); Adapter Registry **signed package** distribution

### Enterprise readiness foundation

- [ ] audit-log export skeleton; version-tagged prompt-injection attack-success-rate publication
