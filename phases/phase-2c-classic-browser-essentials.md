# Phase 2c — Classic Browser Essentials & Downloads

**Status:** 🟡 In progress (download/clipboard/upload manager slices)  ·  **Estimate:** ~2–3 months  ·  **Depends on:** Phase 1a (UI shell, omnibox,
`BookmarkStore`, partition machinery) + Phase 2 (`SafeBrowsingService` — reused for download hash checks) +
Phase 2b (tab shell)
**Goal:** Close the "boring but mandatory" gaps that separate a credible everyday browser from an agentic
demo: a real **download manager + safe-download policy**, and the classic table-stakes surfaces users assume
exist (find-in-page, print, PDF viewer, reader mode, page translation, screenshot), plus hierarchical
bookmarks, a private/disposable mode, a consolidated Permissions Center, and omnibox command mode. **Can run
in parallel with Phase 2 and Phase 2b** (all three are post-core daily-driver tracks). No net-new agent
capabilities — this is user-facing browser completeness; download *security* reuses Phase 2's engine, and
permissions reuse the single Policy/PermissionGuard (no parallel permission flow).
**Branch examples:** `feat/download-manager`, `feat/classic-essentials`, `feat/bookmarks-2`,
`feat/private-mode`, `feat/permissions-center`, `feat/omnibox-commands`

## Exit criteria (DoD)
- [ ] A file downloads via a real **Download Manager** (pause/resume/cancel/open/reveal); every download is
      quarantined + hash-checked against Safe Browsing; executables/scripts force HITL; an agent-initiated
      download is tagged and journaled with source domain + task
- [ ] **Find-in-page**, **print + preview**, built-in **PDF viewer**, **reader mode**, **page translation**,
      and a user-facing **screenshot** (viewport + full-page → CAS blob) all work end-to-end
- [ ] **Hierarchical bookmarks** (folders/tags) + a searchable **Bookmark Manager** work; migration is additive
- [ ] **Private / disposable mode** opens an ephemeral (non-persisted) session that leaves nothing on close;
      sensitive-site lockout still holds
- [ ] **Permissions Center** shows + edits web permissions (camera/mic/location/notification) through the
      single PermissionGuard + a per-agent allow/approve/deny matrix (read-only view over the Policy Kernel)
- [ ] **Omnibox command mode** (`@agent` / `@workspace` / `@download` / `@skill`) routes to the right surface
- [ ] **i18n:** en+tr keys added for all new surfaces (download manager, find-bar, print/PDF/reader/translate,
      bookmark manager, private-mode chrome, Permissions Center, omnibox command hints)
- [ ] ADRs accepted: **Download Trust Model** (agent-initiated download class + quarantine policy);
      **Page-Translation** provider boundary (local model vs API; sensitive-site lockout) — no code before acceptance
- [ ] Coverage gate (S80/B70/F80/L80) + self-review/code-review + UAT signoff + migration-safe DB

## Tasks

### L10 — Safe Downloads + Download Manager
- [x] Slice 1 foundation: `@tepegoz/downloads` headless types/reducer/schemas/tests, IPC/preload
      contracts, download preferences, Event Journal event names, and layer rules.
- [x] Slice 2 service: desktop `DownloadService` wires `will-download`, saves first to quarantine, hashes the
      file, stores a SQLite projection, and emits redacted Event Journal audit records.
- [x] Slice 3 UI/settings: `@tepegoz/downloads-ui`, `tepegoz://downloads`, main-menu Downloads action, and
      Settings download location / ask-each-time / clear-history controls.
- [x] Combined transfer activity popup: toolbar indicator appears when download/upload activity exists and
      opens a single recent activity menu for both directions.
- [x] Slice 5 capability tools: `download_list_items`, `download_get_item`, `download_create_item`, and
      `download_update_item` registered in the Capability Plane with redacted records, idempotency for create,
      and ToolGateway HITL for state-changing actions.
- [ ] `will-download` intercept in the browsing session → **quarantine** the file (temp, not-yet-trusted) +
      compute file hash + check via Phase 2 **`SafeBrowsingService`** (reuse, do NOT re-implement); community
      blocklist reuse where present
- [ ] **Executable/script** downloads (`.exe/.msi/.bat/.ps1/.sh/.dmg/...`) force an extra HITL confirm; zip/rar
      surface a content warning; nothing is "trusted" until the check passes
- [x] **"Agent-downloaded"** provenance: an agent-initiated download is tagged + journaled with source domain
      + timestamp + agent task/`correlationId` (append-only "shown=recorded", ADR-0004)
- [x] Expose a `download_*` tool in the **Capability Plane** (Policy Kernel gated; **agent access
      deny-by-default**, HITL for any state-changing save) — never a direct renderer/agent filesystem write
- [x] **`@tepegoz/downloads` (headless store)** + **`@tepegoz/downloads-ui`** (presentational): list, progress,
      pause/resume/cancel, open, reveal-in-folder; actions injected via callbacks (Electron-free leaf)
- [ ] *Risk (ADR required):* download trust model — agent-initiated download security class, quarantine
      lifecycle, and the "release from quarantine" HITL gate

### L9 — Classic essentials (Chromium/Electron surfaces)
- [ ] **Find-in-page** (Ctrl+F): Chromium `webContents.findInPage` + match count + next/prev + highlight
- [ ] **Print + print-preview** (Ctrl+P): `webContents.print` / `printToPDF`; respects sensitive-site rules
- [ ] Built-in **PDF viewer** (Chromium PDF plugin surface; open-in-tab + save routes through Download Manager)
- [ ] **Reader mode** (Readability extraction → clean, localized reading view; opt-in per page)
- [ ] **Page translation** — **ADR required** (provider boundary): local model vs API, sensitive-site lockout,
      determinism/observation-recording impact (agent's own runs read untranslated source)
- [ ] User-facing **screenshot** (visible viewport + full-page) → stored as a **CAS blob** (reuse Phase 0/1b
      blob store; WebP), never inline base64
- [ ] **Per-site zoom persistence** (`webContents.setZoomLevel` + per-origin store in preferences; restored
      on navigate) — the current shell has no zoom memory
- [ ] **Spellcheck** (`session.setSpellCheckerLanguages` + built-in Chromium spellchecker; currently
      `spellcheck:false` in `window.ts`) — en/tr dictionaries, settings toggle

### L9 — Bookmarks 2.0
- [ ] Extend the flat `BookmarkStore` (Phase 1a) with **folders/tags hierarchy** + full-text search
      (migration-safe, additive schema; existing bookmarks preserved)
- [ ] **Bookmark Manager UI** (searchable tree; create/rename/move/delete folders; import/export standard
      HTML bookmarks file)
- [ ] **Import from Chrome/Firefox** — parse their exported Netscape-format HTML bookmarks (+ optional
      profile auto-detect); folder structure preserved; zod `safeParse` on each parsed entry (reuses the
      same import seam as the password Google-CSV provider already shipped)

### L8/L9 — Private / disposable / guest mode
- [ ] Ephemeral **non-persisted session** (in-memory partition, no `persist:` prefix) on top of the existing
      partition machinery; a "private / agent-only" window chrome badge
- [ ] Leaves **nothing on close** (cookies/storage/cache/history discarded); **sensitive-site lockout still
      applies**; clearly distinct from Phase 3 multi-profile (this is throwaway, not a named identity)

### L5/L8 — Permissions Center
- [ ] **Web permissions UI** (camera/mic/location/notification/clipboard): per-site grant/deny/ask, all routed
      through the **single Policy/PermissionGuard** (same engine as Phase 2 `PopupAndPermissionGuard` + the
      Phase 1a notification permission-broker) — **no parallel permission flow**
  - [x] Slice 1 foundation: `@tepegoz/clipboard` headless operation/policy/audit types, schemas/tests, and
        `sitePermissions` shape extended for `clipboardRead`/`clipboardWrite`.
  - [x] Slice 4 service/broker: desktop `ClipboardService` centralizes native clipboard/WebContents
        operations with content-free audit; `WebPermissionBroker` handles notifications + clipboard
        read/write through one per-origin prompt/reset path.
  - [x] Slice 5 capability tools: `clipboard_get_text` and `clipboard_create_text` registered as HITL-gated
        Capability Plane tools; write requires an idempotency key and audit remains content-free.
- [ ] **Per-agent permission matrix** (allowed / requires-approval / denied) rendered as a **read-only view**
      over the Policy Kernel + Capability Plane audit — a UI surface, **not** a new decision engine

### L5/L8 — Upload Broker + Upload Activity
- [x] Upload Slice 1 foundation: `@tepegoz/uploads` redacted records/reducer/risk helpers, zod schemas,
      `upload_*` Capability Plane registration, IPC contract channels, and layer rules.
- [x] Upload Slice 2 service: desktop `UploadService` validates file sandbox access, binds files to
      target file inputs with CDP, observes upload requests, and writes content-free Event Journal audit.
- [x] Upload Slice 3 UI: `@tepegoz/uploads-ui`, `tepegoz://uploads`, preload IPC wiring, menu/navigation.
- [x] Combined transfer activity popup shows upload activity alongside download activity from one toolbar
      indicator.
- [ ] Native file picker interception remains deferred; v1 focuses on agent-controlled file input uploads.

### L8/L9 — Browser-completeness dialogs (auth / cert / navigation)
- [ ] **Basic-auth dialog** (`app.on('login')`) — HTTP 401 credential prompt routed through the single
      **PermissionGuard** seam (no parallel flow); optional autofill from the password vault (Phase 2 work);
      credentials never logged (reuse `Logger.redact`)
- [ ] **Certificate-error interstitial** (`certificate-error` event) — full-page block/proceed warning; a
      "proceed anyway" is a per-site **HITL** decision journaled as an observation; **sensitive-site lockout
      forbids proceed**
- [ ] **`beforeunload` confirmation** — honor the page's unload prompt (leave/stay) via a localized dialog;
      agent-driven navigations record the prompt but never auto-dismiss a real data-loss warning

### L9 — Omnibox command mode
- [ ] Extend the existing deterministic prefix engine (`tab:`/`history:`/`bookmark:` from Phase 1a) with
      **`@`-scoped commands**: `@agent <task>` (start an agent thread — the one place the omnibox crosses into
      AI), `@workspace <name>`, `@download <query>`, `@skill <name>`; bridge to the command palette
- [ ] `@`-command hints + results localized; non-`@` input keeps the deterministic navigate/search behavior

### Cross-cutting (as in every phase)
- [ ] i18n en+tr for all new surfaces (download manager, find-bar, print/PDF/reader/translate, bookmark
      manager + Chrome/Firefox import, private-mode chrome, Permissions Center, auth/cert/beforeunload
      dialogs, spellcheck toggle, omnibox command hints); zod `safeParse` at every
      IPC / download-metadata / bookmark-import trust boundary; AppError contract; renderer-untrusted security;
      DoD coverage gate; **NO AI attribution trailer** in commits/PRs
