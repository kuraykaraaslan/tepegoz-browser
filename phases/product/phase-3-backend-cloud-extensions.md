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

- [ ] **Provider reach: turn "adding a provider" from a code change into a data change.** Eight
      hand-written adapters (`AIProvider` union) against rivals' 100+ cards. The fix is one generic
      `OpenAICompatibleProvider` class plus a **provider catalog data file** — id / label / `baseUrl` /
      auth mode / vision-model regex per entry — following the philosophy `@tepegoz/model-catalog` and
      `@tepegoz/extension-catalog` already use. That turns "8 providers" into "8 classes, N catalog
      entries". Both `@tepegoz/model-gateway` invariants are untouched: every call stays capped
      (`maxTokens`) and timed (`timeoutMs`), and every adapter still normalizes to
      `CanonRequest`/`CanonResponse` before anything downstream sees it; `@tepegoz/credential-vault` is
      already provider-agnostic and needs no change. Addendum to ADR-0005, not a supersession.
  - [ ] **Two enterprise auth shapes the generic card structurally cannot cover** — Azure OpenAI
        (resource-name + deployment-scoped auth) and AWS Bedrock (SigV4 signing, region + key triplet).
        A company holding an Azure or Bedrock contract cannot "just point at an OpenAI-compatible
        endpoint". Two more first-class adapter classes, an `authShape` discriminant on their catalog
        entries so Settings renders the right credential form without a per-card UI branch, and the same
        `CanonRequest` normalization as everything else. Feeds [phase-4](phase-4-maturation.md)'s
        enterprise story more than an individual BYO-key user.
  - [ ] **A dynamic model catalog** — fetch the live model list from a configured endpoint instead of
        pinning ids in source, so a new model does not need a release.
  - [ ] **Per-model system-prompt variants**, keyed off the catalog entry: models differ enough in
        tool-calling discipline that one prompt for all of them costs reliability.
  - [ ] **Local endpoints as alternate transports for the SAME `local` slot**, never new provider ids —
        `isLocalProvider()`/`RUNNABLE_AI_PROVIDERS` already single `'local'` out as key-free. An
        HTTP-server variant of `@tepegoz/local-inference`'s `LlamaEngine` (Ollama `/api/`, llama.cpp and
        LM Studio `/v1/`) lets a user who **already runs Ollama** point Tepegöz at it instead of
        downloading a second copy of the same weights through `@tepegoz/model-catalog`. BYO — not bundled,
        not downloaded by us. Copy the context-window auto-detection verbatim (llama.cpp `GET /props`,
        Ollama `GET /api/show`): it is what lets compaction self-tune instead of hardcoding 16k.
  - [ ] Settings surfaces the catalog **with search** (exact id/label → prefix → substring ordering is a
        small already-solved problem, worth copying). i18n: catalog labels are data, but the chrome around
        them — search placeholder, the "not usable yet" hint per `RUNNABLE_AI_PROVIDERS` — needs EN+TR.
  - [ ] _Second schema reference when this is written:_ LibreChat's `librechat.yaml` "Custom Endpoints"
        model reaches Ollama / groq / Cohere / Mistral / MLX / koboldcpp / together / OpenRouter / Perplexity /
        Deepseek / Qwen from **one configuration file and no proxy** — the same "a provider is data, not code"
        idea as WebBrain's 108 cards, in a different wrapper, and a useful cross-check on the catalog's shape.
        [`../../docs/others/librechat-agent-ui-learnings.md`](../../docs/versus/librechat-agent-ui-learnings.md).
  - Sources: [`../tracks/webbrain-agent-parity.md`](../../docs/parities/webbrain-agent-parity.md) P1,
    [`../tracks/aipex-agent-parity.md`](../../docs/parities/aipex-agent-parity.md) P3,
    [`../tracks/browseros-agent-agent-parity.md`](../../docs/parities/browseros-agent-agent-parity.md) P1,
    [`../tracks/kilocode-agent-parity.md`](../../docs/parities/kilocode-agent-parity.md) P1.
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
  - [ ] **The account + "choose what to sync" surface this implies, not yet decomposed anywhere**:
        sign-in with an account, the per-category sync checklist (bookmarks / history / open tabs /
        passwords / addresses / payments / settings / themes / extensions), a sync encryption passphrase,
        "tabs from other devices" + send-tab-to-device, and device-list management. Needs its own ADR —
        see [`../tracks/browser-settings-feature-gap.md`](../../docs/tracks/browser-settings-feature-gap.md) §10.
- [ ] **Autofill — addresses / contact info and payment methods** (save-and-fill, CVC, mandatory re-auth).
      The Settings UI already says "coming soon"; nothing sits behind it. Captured in
      [`../tracks/browser-settings-feature-gap.md`](../../docs/tracks/browser-settings-feature-gap.md) §9.
- [ ] **Import from another browser beyond bookmarks** — settings and history (Chrome / Edge / Firefox /
      Safari); today only Netscape-HTML **bookmark** import ships (Phase 2c). Pairs with the first-run
      import in [phase-10](phase-10-daily-driver-delight.md); listed in
      [`../tracks/browser-settings-feature-gap.md`](../../docs/tracks/browser-settings-feature-gap.md) §11.
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
