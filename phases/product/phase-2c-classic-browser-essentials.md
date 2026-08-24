# Phase 2c — Classic Browser Essentials & Downloads

**Status:** 🟡 In progress (download/clipboard/upload manager slices; page-command shortcuts) · **Estimate:** ~2–3 months · **Depends on:** Phase 1a (UI shell, omnibox,
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
- [~] **Print + print-preview** (Ctrl+P): `webContents.print` / `printToPDF`; respects sensitive-site rules — _**Ctrl+P works now; it never did.** The command was not missing — `printActive()` has existed all along and the right-click menu called it. What was missing was the KEY: `@tepegoz/shortcuts`, the registry that is the only place a global key may be bound, had no `print` entry, while `page-context-menu` printed the string `'Ctrl+P'` next to the row. The menu taught the user a key that was bound to nothing. **The same defect held for two siblings** — `Ctrl+S` (save) and `Ctrl+U` (view source) were advertised the same way and equally dead — so all three are now registered (`main` scope, for the reason `find` is: the key arrives while the PAGE has focus, where the chrome renderer never sees it). Wiring them exposed a real cycle: `keyboard-shortcuts.ts` cannot import the tab model, because `tabs-view-wiring.ts` imports IT (dependency-cruiser's `no-circular`, measured, not guessed). The bodies moved to `page-commands.ts` as free functions over one `WebContents`, following the `handleZoomShortcut` precedent — which also removed the duplication, since the keyboard and the menu now run the same code instead of the menu owning the only copy. `printActive()` was a bare `webContents.print()`: called with no callback it reports **nothing at all**, so a print that never happened looked exactly like one that did. It now distinguishes a user cancelling the dialog (the ordinary outcome) from a real failure (a warning carrying Chromium's reason). **Two gates, both mutation-verified:** `accelerators.test.tsx` walks every branch of the menu on win32/darwin/linux and fails if any row advertises a key that is neither in the registry nor in the declared platform-built-in set (removing `print` from the registry turns 5 tests red); `keyboard-shortcuts.test.ts` locks the dispatch, including that matching stays EXACT so Ctrl+Shift+P does not print (removing the dispatch case turns 2 red). The accelerator strings are now derived rather than typed, which fixed a defect nobody had reported: they were hardcoded Windows notation on every platform, so a Mac was told `Alt+←` for history when macOS uses `⌘←`, and `Ctrl+P` where it should read `⌘P`._ — _**`printToPDF` now landed too, so this box is code-complete.** "Save as PDF…" is a page right-click row (`main/print/print-to-pdf.electron.ts`), separate from `page-commands.ts` because that module is imported BY the tab model and therefore cannot reach `NotificationHost` — a measured cycle, not a preference. It asks for the path BEFORE rendering: generating a long page and then discarding it on Cancel is work for nothing, and on a slow page the dialog would arrive long after the click. It reports failure, which is the point of having it at all when the system dialog already offers a PDF printer — `printToPDF` rejects on a page it cannot render, and an unwritable path or a full disk are ordinary; a save that silently did nothing is the exact failure mode this file keeps recording. **The suggested file name is a security surface, not cosmetics:** it comes from `<title>`, which the PAGE sets, and lands in a native dialog's `defaultPath`. `pdf-filename.ts` strips both platforms' separators and any `..`, drops Windows-reserved and control characters, prefixes the reserved device names (`CON.pdf` is refused by the OS with any extension), and removes leading dots — a leading dot is a hidden file on unix, and the residue of a traversal attempt should not get to decide that. 12 sanitizer tests + 8 service tests. Two of those tests earned their keep during the writing: the traversal cases were passing a literal carriage return, because `\r` inside `C:\Users\kuray\report` written as an ordinary TS string is one character, not two — and while fixing the input they exposed that the sanitizer's own `[\/]` had been collapsed to `[\/]`, so backslashes were never being stripped at all._ — _**"Respects sensitive-site rules" is vacuous today and is NOT being ticked as if it were satisfied:** that lockout gates AUTOMATION, and no agent tool can print or save a PDF (checked — `browser-tools` and `capability-plane` have neither capability). Printing is a user action on their own screen; blocking a user from printing their own bank statement would be the wrong reading. The line becomes real only when an agent-initiated print exists. That is why this box stays `[~]` rather than `[x]` — the DoD line names a property this code does not yet have anything to apply._
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
  - [x] **Export to HTML.** ~~Missing — only import exists.~~ _Stale line, corrected on inspection:
        `serializeBookmarksHtml` exists in `@tepegoz/bookmarks` and is wired end to end
        (`bookmarks:export` → preload → the manager's Export action). Netscape HTML rather than JSON on
        purpose: a JSON dump would be a backup only this application can restore, which is the shape of
        lock-in that looks like a feature. The parser reads what the serializer writes, so the round
        trip is checked rather than asserted._
- [ ] **Import from Chrome/Firefox** — parse their exported Netscape-format HTML bookmarks (+ optional
      profile auto-detect); folder structure preserved; zod `safeParse` on each parsed entry (reuses the
      same import seam as the password Google-CSV provider already shipped)
  - [x] Netscape HTML parsing (Chrome/Edge/Firefox/Brave), folder structure preserved, per-source
        "Imported from X" root, url-scheme gate (`isBookmarkable`), duplicate skip, favicon restricted to
        http(s)/`data:image` and length-capped, recursion depth capped at 64.
  - [x] **zod `safeParse` + bounds on parsed entries.** _The gate was unmet on a path that had already
        shipped: the IPC envelope was validated (source, format, a 10 MB payload cap) and nothing
        checked what the PARSER produced from it. `bookmark-import-limits.ts` now owns the boundary —
        title 300, URL 4096, favicon 100 000, 50 000 nodes, depth 64 — with
        `ImportedBookmarkFolderSchema` `safeParse`d before a single row is written. **Both halves exist
        and neither replaces the other:** the caps are enforced INSIDE the scan, because a bound checked
        after the tree exists is a bound on nothing — the memory has already been spent — while the
        schema is what makes the shape checked rather than assumed and survives a future edit to the
        parser. Over-long values are truncated rather than rejected: a malformed title is not a reason
        to lose the URL it belongs to. Hitting the node cap sets `truncated`, which the import surface
        now says out loud in en+tr — a partial import that reports itself as complete is worse than one
        that failed, because the user stops looking._
        — _**Reading it for the bounds found a crash.** `String.fromCodePoint` throws a `RangeError`
        above U+10FFFF, so `&#99999999;` anywhere in an untrusted file — a title, a URL, an attribute —
        took the entire import down. `Number.isFinite` does not catch it; 99999999 is perfectly finite.
        Lone surrogates were the quieter half of the same guard: `fromCodePoint` ACCEPTS them, and they
        produce ill-formed UTF-16 that reached SQLite and the UI unnoticed. 15 tests, mutation-verified
        (removing the guard turns 3 red, the node cap 2, the title cap 1) — the importer had exactly one
        test before this._
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
  - [x] **The deny-by-default floor this UI sits on is now tested, and was not.** `main/security.ts` —
        the handler deciding whether a browsed page reaches the camera, the microphone, the screen, the
        user's location or their files — had **no test at all**. `security.test.ts` now enumerates
        Electron's ENTIRE permission union and asserts everything outside the three brokered
        capabilities is refused, so a permission added by a future Electron is denied by the test's own
        construction and a capability quietly added to `permissionCapability` fails it (25 tests;
        mutation-verified — flipping the default to grant turns 20 red). Paired with
        [`e2e/platform-defaults.spec.ts`](../../e2e/platform-defaults.spec.ts), which measures what a
        REAL page actually gets in the launched app: camera/mic/screen/geolocation refused, USB /
        Bluetooth / Serial refused for want of a device-selection handler, WebHID resolving with an
        empty array (it RESOLVES rather than rejecting — "resolved" is not a grant, and a looser test
        would have read it as one), and no `require`/`process`/`module` in a browsed page. The sweep
        found **no further hole**; it is committed because "no hole" is worth something only as a
        measurement, not as a belief. See [`docs/threat-model.md`](../../docs/threat-model.md) §Platform
        defaults for the full table and the class it belongs to.
  - [ ] **Open, and not resolved either way:** the File System Access API
        (`showOpenFilePicker`/`showDirectoryPicker`) is present in browsed pages and does not reject —
        Chromium opens the native picker BEFORE requesting the `fileSystem` permission. Our half is
        covered (`fileSystem` is refused by the handler, asserted). What a page holds after a user picks
        a file could not be measured here: it needs a file chosen out of an OS dialog, which no
        automated run can drive. Belongs in this UI's scope when it is built — file access is a
        permission of at least the weight of the four this line already names, and it is not among them.
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
  - [x] The proceed decision is now journaled as an Event Journal observation
        (`CertificateErrorProceeded`). _`Logger` is a process log — it rotates, it is not queryable, and
        it is not where this product says its auditable facts live (ADR-0004). The exception itself is
        in-memory and dies with the process, deliberately, which is exactly WHY the decision needs a
        permanent row: otherwise the fact that it ever happened leaves no trace anywhere. **Only the
        weakening choice is recorded** — a refusal restores the default and leaves nothing to audit, and
        refusals are deliberately not remembered, so recording them would let one broken site write
        unbounded rows and bury the one line that matters. A sensitive site writes nothing either: it is
        hard-blocked with no prompt, so there was never a user decision to record._
- [x] **Client-certificate chooser** (`select-client-certificate`) — _**not on the original list, because
      nobody had noticed the default.** This is the mirror of the row above and the two defaults are
      opposite: for a bad SERVER certificate Electron rejects, which is safe; for a CLIENT certificate
      Electron's own typings say "Using `event.preventDefault()` prevents the application from using the
      first certificate from the store" — i.e. with no handler it **silently sends the first client
      certificate in the OS store to any site that asks**. This app had no handler. A client certificate
      is a private-key-backed assertion of WHO THE USER IS, and in this product's primary market they are
      ordinary — e-Devlet and corporate enrolment both put one in the Windows store — so a page that
      merely requested client authentication received a signed proof of the user's identity on first
      contact, with the user never told. Chrome prompts. We were sending. Nothing in `docs/` or `phases/`
      had ever mentioned client certificates, which is why it survived: the roadmap tracked our code, and
      the platform had supplied a behaviour underneath it. `main/auth/client-certificate-broker.ts` +
      `ClientCertPicker` in `@tepegoz/cert-warning-ui`, zod-validated response, 10 broker tests + 5 dialog
      tests. **The fix is `event.preventDefault()` on the handler's first line**; everything after it is
      what keeps the browser usable. Cancel, timeout, no-window and an empty offer list all send NOTHING.
      The choice is remembered **per origin, for this run only** — TLS client auth re-negotiates per
      connection, so asking every time would make the browser unusable on exactly the sites that need it,
      and persisting it would be a standing instruction to identify yourself, written once and forgotten.
      **The certificate never crosses to the renderer:** the prompt carries display strings and answers
      with an INDEX, so the worst an untrusted renderer can do is name a different entry from the list the
      user was shown. The picker puts "do not send" first and focused, and pre-selects nothing — a chooser
      that defaulted to one certificate would be the same defect with a dialog in front of it. Locked by
      [e2e/application-menu.spec.ts](../../e2e/application-menu.spec.ts), which asks the LAUNCHED app
      whether it answers the event, because the defect was the ABSENCE of a call. The listener count is
      asserted as **2**, and that second one is the interesting half: measured by deleting the
      registration and re-launching, Electron installs an internal listener of its own — that internal one
      is what sends the first certificate._
  - [x] **Both halves closed.** _**Journaled** as `ClientCertificateSent` — sending a client certificate
        is an identity disclosure and belongs in the journal for the same reason the certificate-error
        decision does. The record carries the **origin and the certificate's `fingerprint`, never its
        `subjectName`**: in this product's primary market that subject is the user's own name and
        national ID, and the journal is permanent and local. The fingerprint answers "which certificate"
        without answering "who", which is the rule the broker's log lines already followed — this
        carries it into the store that keeps things forever. Written once per origin per run rather than
        once per handshake, because client auth renegotiates per connection and a row for each would be
        noise._
        — _**Reviewable and withdrawable.** Settings → Privacy → "Sites you identified yourself to"
        lists what this run remembers, `listClientCertificateChoices()` → `cert:client-list`. A
        remembered "yes" is a standing instruction to identify yourself, and an instruction the user
        cannot see is one they cannot withdraw. **Refusals are listed too** — a remembered NO is as much
        a decision as a yes, and someone who refused by reflex and now needs the site has no other way
        back. Origins only; the certificate never leaves the main process and neither does the name it
        carries. The surface states its own limit rather than hiding it: forgetting means you will be
        asked again — **a certificate already sent cannot be taken back**._
        — _Forgetting is all-or-nothing on purpose. A per-origin forget would need the untrusted
        renderer to name which decision to drop, and there is nothing to gain from letting it steer
        that. 15 broker/journal tests, mutation-verified: removing either journal call turns tests red,
        journaling a refusal turns one red, and adding `subjectName` to the listing turns two red._
- [x] **`beforeunload` confirmation** — honor the page's unload prompt (leave/stay) via a localized dialog;
      agent-driven navigations record the prompt but never auto-dismiss a real data-loss warning
      — _**this was not a missing feature, it was an inverted one.** Measured before anything was written
      ([`e2e/beforeunload.spec.ts`](../../e2e/beforeunload.spec.ts)): with no `will-prevent-unload`
      listener Electron does **not** fall back to Chromium's "Leave site?" dialog the way a browser does.
      It cancels the navigation outright — `listenersBefore: 0`, event `fired: 1`, `ERR_ABORTED`, URL
      unchanged. A page with a dirty form did not warn the user; it silently refused to go anywhere,
      forever, and the only symptom was a browser that looked frozen. Any page could pin a user to
      itself by registering a handler. **`phase-s3` had asserted the opposite** — that a tab the agent
      never touched "keeps Chromium's normal 'leave site?' prompt untouched" — and that half is now
      retracted in place: the scoping was right, the platform default it assumed did not exist, and no
      linter, type checker or unit test could ever have said so, because all three read the code that IS
      there. Same class as the DevTools accelerator and the client certificate; third entry in
      [`docs/threat-model.md`](../../docs/threat-model.md) §Platform defaults._
      — _**The close path had the mirror defect and it is the more expensive one.**
      `webContents.close()` does not fire `beforeunload` **at all** unless passed `waitForBeforeUnload`
      (Electron's own typings), so Ctrl+W discarded unsaved work with the page's warning unrun. A
      navigation that silently refuses is recoverable; a tab that silently closes is not. `closeTab` now
      asks the page **before** any teardown and the tab stays visible until the user answers — what
      Chrome does, and the reason the store is not touched above that line. One mechanism covers both
      outcomes: a page with nothing to say is destroyed immediately, a page whose user chose "leave" is
      destroyed after the prompt, and `destroyed` retries the close in both cases; "stay" produces
      neither and the tab simply remains._
      — _Two properties are load-bearing, not cosmetic. **"Stay" is both the `defaultId` and the
      `cancelId`**, so Enter, Escape and the window close button all keep the page — leaving is the
      answer that discards the user's typing, and a destructive answer must never be what a stray
      keypress picks. **A page cannot re-prompt its way to a captive tab**: after a "leave" answer the
      same page is not asked again for a 5s grace window, so a redirect chain or a re-entrant handler
      cannot keep asking until the user gives up. The window is refreshed rather than one-shot, so a page
      that keeps firing only extends its own silence. The page's own message is never shown — Chromium
      stopped rendering custom `beforeunload` text in 2016 because pages used it for scareware, and
      Electron hands us none anyway._
      — _Native and synchronous, unlike the auth/cert brokers' renderer modals, and it has to be:
      `preventDefault()` must be called before the listener returns, so there is no room for an async IPC
      round trip. That puts it under the Phase-1 native-i18n gate, which is why en+tr exist. **The agent
      half of the DoD line holds by construction:** `attachDialogInterceptor` calls the broker's
      `suppressUnloadPrompt`, so a driven tab is allowed through silently and recorded for the model via
      `interceptionNote` — the run is never shown a modal nobody is watching, and the human prompt is
      never auto-dismissed. The dependency points agent → browser, never the reverse._
      — _21 unit tests + 1 e2e, all mutation-verified: dropping `preventDefault()` from the allow branch
      turns 2 red, making "leave" the default turns 1 red, dropping `waitForBeforeUnload` turns 1 red,
      and removing the install call from `wireView` makes the e2e read `listeners: 0` — the exact
      pre-fix number. **Two of the tests found real defects in the code they were written for:** the
      grace window read a backwards clock (`Date.now()` steps back over an NTP correction) as "inside the
      window" and would have silenced a warning the user should have seen; and the allow branch was
      written as a bare `return`, which in Electron's inverted semantics is a **veto**, not an allow — so
      the anti-trap window was trapping the user rather than releasing them._

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
