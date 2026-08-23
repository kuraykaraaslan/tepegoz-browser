# Phase 2c — Classic Browser Essentials & Downloads

**Status:** 🟡 In progress (download/clipboard/upload manager slices) · **Estimate:** ~2–3 months · **Depends on:** Phase 1a (UI shell, omnibox,
`BookmarkStore`, partition machinery) + Phase 2 (`SafeBrowsingService` — reused for download hash checks) +
Phase 2b (tab shell)
**Goal:** Close the "boring but mandatory" gaps that separate a credible everyday browser from an agentic
demo: a real **download manager + safe-download policy**, and the classic table-stakes surfaces users assume
exist (find-in-page, print, PDF viewer, reader mode, page translation, screenshot), plus hierarchical
bookmarks, a private/disposable mode, a consolidated Permissions Center, and omnibox command mode. **Can run
in parallel with Phase 2 and Phase 2b** (all three are post-core daily-driver tracks). No net-new agent
capabilities — this is user-facing browser completeness; download _security_ reuses Phase 2's engine, and
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
- [ ] Coverage gate (S80/B85/F86/L80) + self-review/code-review + UAT signoff + migration-safe DB

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
- [x] **"Agent-downloaded"** provenance: an agent-initiated download is tagged + journaled with source domain + timestamp + agent task/`correlationId` (append-only "shown=recorded", ADR-0004)
- [x] Expose a `download_*` tool in the **Capability Plane** (Policy Kernel gated; **agent access
      deny-by-default**, HITL for any state-changing save) — never a direct renderer/agent filesystem write
- [x] **`@tepegoz/downloads` (headless store)** + **`@tepegoz/downloads-ui`** (presentational): list, progress,
      pause/resume/cancel, open, reveal-in-folder; actions injected via callbacks (Electron-free leaf)
- [ ] _Risk (ADR required):_ download trust model — agent-initiated download security class, quarantine
      lifecycle, and the "release from quarantine" HITL gate

### L10 — Download acceleration (rival evidence: IDM)

> **Where this came from.** [`research/competitors/idm-downloader.md`](../../research/competitors/idm-downloader.md).
> IDM is the reference product for download management, and the report separates its **complaints** (licensing,
> support, dated UI — not our problems) from **the reason people still install it**: segmented acceleration and
> a network monitor that catches every transfer. Tepegöz's manager currently has the safety half
> (quarantine, hashing, risk classification, redacted audit) and **not** the speed half, so a user comparing
> the two today loses throughput to gain safety. These tasks close that trade-off.

- [ ] **Segmented download engine** — split a transfer into N ranged `Range:`/206 requests and reassemble; keep
      the assembled file in quarantine until the hash of the whole is computed, so segmentation never weakens
      the existing trust path. Fall back to a single stream when the server refuses ranges
- [ ] **Dynamic connection count** — the segment count adapts to measured throughput and server behavior rather
      than a fixed setting; a host that penalizes parallel connections is detected and backed off. Per-host
      ceiling is user-visible and overridable (default conservative: we are a browser, not a scraper)
- [ ] **Resilient resume** — resume across an app restart and across a dropped connection, with exponential
      backoff and a bounded retry budget; a resumed transfer verifies the already-written bytes before
      continuing, never blindly appending
- [ ] **Speed + ETA metadata** — surface bytes/sec and estimated time remaining in the download record and the
      manager (already tracked as an open item in `packages/downloads/CHECKLIST.md`; this is the same task)
- [ ] **Retry command descriptor** for a failed download (also open in the package checklist)
- [ ] **Transfer capture beyond the page** — catch downloads the page did not initiate through a normal
      navigation (media elements, `blob:`/redirect chains) so the manager is not blind to a class of transfers;
      strictly in-browser, **no system-wide traffic interception** — that is IDM's model and it is out of scope
      on purpose (it needs a proxy/driver that contradicts this project's threat model)
- [ ] **Measurement, not assertion** — a benchmark that downloads a fixed set of files against a local server
      and records single-stream vs. segmented throughput. A speed claim without this number is vanity; the
      number is what a comparison against IDM or Chrome is allowed to cite

> **Deliberately out of scope from that report:** licence automation, distributor/support processes, UI theming
> and "modernization", and macOS-via-Wine. They are IDM-the-business's problems; only the transfer engine and
> the capture surface transfer to us.

### L9 — Classic essentials (Chromium/Electron surfaces)

- [x] **Find-in-page** (Ctrl+F): Chromium `webContents.findInPage` + match count + next/prev + highlight
      — `@tepegoz/find-bar` (chrome leaf, own en/tr dict) + `main/find-in-page.ts` + `ipc/ipc-find.ts`;
      Ctrl+F is handled in MAIN because the key arrives while the page has focus. Results are echoed with
      the query they were requested for so a slow `found-in-page` cannot flicker stale counts, and
      navigating away zeroes the counters. Match-case toggle included. 10 unit tests.
  - [x] The bar, the shortcut and the plumbing landed: `@tepegoz/find-bar` + `main/find-in-page.ts` +
        `ipc/ipc-find.ts`, 10 unit tests, plus a stale-query guard and a navigation reset.
  - [x] **Verified end to end.** `e2e/find-in-page.spec.ts` passes against the real app: the bar
        opens, the counter reads 1/3, Enter steps to 2/3, Escape closes.
  - [x] It did not work when first written, and the cause was ours. Electron's `findNext` option means
        "this request OPENS a find session", not "go to the next match"; we had it inverted, and
        Chromium answers a follow-up with no open session by emitting **nothing** — no event, no error.
        An earlier revision of this file blamed Playwright's CDP attachment; that was wrong and is
        retracted. Bisecting the running app ruled out webPreferences, the browsing session, per-tab
        zoom and an attached debugger before the options object was the only thing left. The broker now
        also promotes a follow-up to an opener when no session is open, and four unit tests cover it.
  - [ ] Switching tabs does not re-sync the counters to the newly-active tab (the bar keeps the
        previous tab's numbers until the next keystroke).
  - [ ] Separate harness constraint found here: `keyboard.press('Control+f')` never reaches Electron's
        main-process `before-input-event`, so the Ctrl+F shortcut is not drivable from Playwright.
- [ ] **Print + print-preview** (Ctrl+P): `webContents.print` / `printToPDF`; respects sensitive-site rules
- [ ] Built-in **PDF viewer** (Chromium PDF plugin surface; open-in-tab + save routes through Download Manager)
- [ ] **Reader mode** (Readability extraction → clean, localized reading view; opt-in per page)
- [ ] **Page translation** — **ADR required** (provider boundary): local model vs API, sensitive-site lockout,
      determinism/observation-recording impact (agent's own runs read untranslated source)
- [ ] User-facing **screenshot** (visible viewport + full-page) → stored as a **CAS blob** (reuse Phase 0/1b
      blob store; WebP), never inline base64
  - [x] Agent visual fallback down-payment: `@tepegoz/screenshots` + `browser_get_screenshot` can capture
        viewport/fullPage PNG for model context. The user-facing CAS/WebP screenshot surface remains open.
- [x] **Per-site zoom persistence** (`webContents.setZoomFactor` + per-origin store in preferences;
      restored on navigate) — `main/site-zoom.ts` + the private `siteZoomFactors` pref. Ctrl +/-/0 step a
      Chrome-style ladder (25%–500%); the stored factor is re-applied on every committed navigation, so
      crossing origins cannot inherit the previous site's zoom. Only non-100% origins are stored and
      Ctrl+0 deletes the key, so the pref cannot accumulate into a record of every site visited.
      13 unit tests. _(Uses `setZoomFactor`, not `setZoomLevel` as this line originally said: a factor is
      what the ladder and the stored value are expressed in.)_
  - [ ] No zoom indicator in the omnibox yet (Chrome shows one when a site is off 100%).
- [ ] **Spellcheck** (`session.setSpellCheckerLanguages` + built-in Chromium spellchecker; currently
      `spellcheck:false` in `window.ts`) — en/tr dictionaries, settings toggle
  - [ ] **Scope conflict — decide before building.** `ext-typo` already ships "local-first writing and
        typo assistance for editable web text" with its own downloaded en/tr dictionaries and settings.
        Implementing Chromium's spellchecker in core would duplicate a shipped extension's feature, which
        the working agreement forbids. The two are not identical (Chromium gives free red squiggles and
        native context-menu suggestions in every input; ext-typo is a richer opt-in assistant, and Chrome
        itself ships both), so this is a product call — not a coding task. `spellcheck:false` is still the
        live setting, so today neither path underlines anything in a plain text input.

### L9 — Bookmarks 2.0

- [ ] Extend the flat `BookmarkStore` (Phase 1a) with **folders/tags hierarchy** + full-text search
      (migration-safe, additive schema; existing bookmarks preserved)
  - [x] Folder hierarchy + search: `BookmarkTreeStore` (two fixed roots, create/move/remove, explicit
        ordering, cycle guard on reparent, cascade delete, root-protection, `listFlat` projection,
        `search` over url+title). Migration-safe and additive.
  - [ ] **Tags do not exist** — the store models folders only. The word "tags" in this line is unearned.
- [ ] **Bookmark Manager UI** (searchable tree; create/rename/move/delete folders; import/export standard
      HTML bookmarks file)
  - [x] `@tepegoz/bookmarks-ui` + `tepegoz://bookmarks`: searchable tree, new-folder, drag reorder/reparent
        (dnd-kit), rename/delete through the host's native context menu.
  - [ ] **Export to HTML is missing** — only import exists. `parseBookmarksHtml` has no serializing
        counterpart, so a user cannot get their bookmarks back out.
- [ ] **Import from Chrome/Firefox** — parse their exported Netscape-format HTML bookmarks (+ optional
      profile auto-detect); folder structure preserved; zod `safeParse` on each parsed entry (reuses the
      same import seam as the password Google-CSV provider already shipped)
  - [x] Netscape HTML parsing (Chrome/Edge/Firefox/Brave), folder structure preserved, per-source
        "Imported from X" root, url-scheme gate (`isBookmarkable`), duplicate skip, favicon restricted to
        http(s)/`data:image` and length-capped, recursion depth capped at 64.
  - [ ] **No zod `safeParse` on parsed entries** — validation is imperative, and two inputs stay
        unbounded: an entry's **title length** and the **total node count** of an imported file. An
        exported bookmarks file is untrusted input, so this is the cross-cutting gate below going
        unmet on a path that has already shipped.
  - [ ] Profile auto-detect (marked optional in this line) does not exist.

### L8/L9 — Private / disposable / guest mode

- [ ] Ephemeral **non-persisted session** (in-memory partition, no `persist:` prefix) on top of the existing
      partition machinery; a "private / agent-only" window chrome badge
- [ ] Leaves **nothing on close** (cookies/storage/cache/history discarded); **sensitive-site lockout still
      applies**; clearly distinct from Phase 3 multi-profile (this is throwaway, not a named identity)
- [ ] **The private-mode surface must say what it does not do.** A separate partition discards local
      state; it does **not** separate identity — the device, GPU, screen, fonts, installed-extension
      signature and network address are unchanged, so a site that fingerprints can link the private
      window to the ordinary one. Every mainstream browser has been criticized for letting its private
      mode imply otherwise; the badge and the new-window copy state the real scope in one sentence.
      Source: [`research/privacy/cross-profile-tracking.md`](../../research/privacy/cross-profile-tracking.md)
      — the same limit applies to named profiles in [Phase 3](phase-3-backend-cloud-extensions.md)

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

- [x] **Basic-auth dialog** (`app.on('login')`) — HTTP 401/407 credential prompt; credentials never
      logged, persisted or journaled (the log lines carry the origin only). `main/auth/basic-auth-broker.ts` + `@tepegoz/auth-prompt-ui`, zod-validated response, 9 unit tests. **This closed a real hole:** with no
      handler Chromium cancels the challenge, so 401-protected sites did not load at all. The dialog gives
      the origin its own line (phishing defence) and labels a PROXY challenge as one — relevant because
      Phase 5 routes tabs through SOCKS tunnels.
  - [ ] Autofill from the password vault (Phase 2 work) is not wired.
  - [ ] It prompts directly rather than through a `PermissionGuard` seam. Credential entry is not a
        capability grant, and forcing it through the permission engine would have meant modelling
        "username+password" as a permission — recorded as a deliberate deviation, not an oversight.
- [x] **Certificate-error warning** (`certificate-error` event) — block/proceed warning; "proceed anyway"
      is a per-site HITL decision; **sensitive-site lockout forbids proceed** (hard-blocked with NO prompt
      shown, so the habit is never taught). `main/auth/certificate-broker.ts` + `@tepegoz/cert-warning-ui`,
      8 broker tests + 6 dialog tests. Exceptions are **in-memory only** and die with the process — a
      persisted exception is a permanent transport-security downgrade. Cancel/backdrop/timeout/no-window
      all refuse; a refusal is not remembered, so a transient error can be retried.
  - [ ] **Deviation:** a blocking modal, not a **full-page interstitial**. The internal-page mechanism
        addresses canonical parameterless `tepegoz://` URLs and does not fit a per-navigation state
        carrying the failed URL + error code. Same security properties, different presentation.
  - [ ] The proceed decision is logged but **not journaled as an Event Journal observation** as this line
        asks.
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
