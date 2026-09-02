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
  - [x] **Five of the six carry end-to-end evidence** (audited 2026-09-02, by listing `e2e/` against
        this line rather than by recalling what was built):

        | Feature        | Evidence                                                                   |
        | -------------- | -------------------------------------------------------------------------- |
        | Find-in-page   | `e2e/find-in-page.spec.ts`                                                 |
        | PDF viewer     | `e2e/pdf-viewer.spec.ts` — a real `application/pdf` mounts in-tab          |
        | Reader mode    | `e2e/reader-mode.spec.ts`                                                  |
        | Screenshot     | `e2e/user-screenshot.spec.ts`                                              |
        | Print → PDF    | `e2e/print-to-pdf.spec.ts` (new) — real `%PDF-` bytes from a loaded page   |
        | **Translation**| **none**                                                                   |

  - [x] **Print is covered at the layer a test can reach, and the note says which.** _Both the user's
        Save-as-PDF and the agent's `browser_export_pdf` come down to one `printToPDF` call; everything
        above it is a native save dialog or a capability handler, neither of which Playwright can
        drive. So the e2e pins the part that would silently break — that this Electron build renders a
        real page to real PDF bytes. `printToPDF` REJECTS on contents it cannot render, which is the
        whole reason `savePageAsPdf` reports a failure instead of writing nothing, and a page-to-PDF
        path that quietly stopped working would look identical from outside to one nobody had used._
  - [ ] **Translation is the one thing holding this line open, and it is not a coding gap.** _The
        feature is complete — local-model-first with a cloud fallback, the sensitive-site lockout,
        per-origin consent, glossary terms, en+tr — and it is unit-tested (`engine.test.ts`,
        `host.test.ts`). What it has never had is a run anyone watched: it needs either a downloaded
        local model or a configured provider key, so no automated test in this repo can translate a
        page, and none has. Saying "works end-to-end" on that basis would be exactly the unearned tick
        this file exists to prevent. **This belongs in the UAT pass** (with the same key that closes the
        Safe Browsing row), not in another commit._
- [x] **Hierarchical bookmarks** (folders/tags) + a searchable **Bookmark Manager** work; migration is additive
      — _**the first DoD line of this phase to close.** Folders, ordering, cycle guard, cascade delete and
      root protection (`BookmarkTreeStore`); a searchable manager with drag reorder/reparent, native
      rename/delete, Netscape-HTML import from Chrome/Edge/Firefox/Brave and export back out; and now
      tags. Migration v15 is additive — a junction table beside `bookmark_nodes`, nothing rewritten, and
      a database from before it keeps working with every bookmark simply untagged (asserted)._
- [x] **Private / disposable mode** opens an ephemeral (non-persisted) session that leaves nothing on close;
      sensitive-site lockout still holds
      — _**the second DoD line of this phase to close.** Ctrl+Shift+N or `windows:open-private`; the
      badge, the disclosure panel, en+tr. Measured end to end in
      [`e2e/private-window.spec.ts`](../../e2e/private-window.spec.ts), which reads the LIVE session
      (`isPersistent: false`, `storagePath: null`), sets a real cookie and finds it in the private jar
      and **not** in the ordinary one, then opens the SQLite file after the app has closed and asserts
      the page is in neither history nor the session snapshot._
- [x] **Permissions Center** shows + edits web permissions (camera/mic/location/notification) through the
      single PermissionGuard + a per-agent allow/approve/deny matrix (read-only view over the Policy Kernel)
      — _**the third DoD line of this phase to close.** Camera, microphone and geolocation joined the
      brokered set alongside notifications and the two clipboard permissions; every capability is
      independently settable per origin (ask / allow / block) from one surface, and the agent matrix
      renders beside it as a read-only view._
- [~] **Omnibox command mode** (`@agent` / ~~`@workspace`~~ / `@download` / `@skill`) routes to the right surface
  — _**three of the four are built and routed; `@workspace` is not, and cannot be from this phase.**
  A "workspace" is a **Phase 2b** noun — `phase-10` names 2b as the phase that delivers "workspaces,
  split-view, reading mode" — and no such surface exists anywhere in this product yet (checked: no
  IPC channel, no store, no UI). A `@workspace` command could therefore only route somewhere it
  invented, which is worse than an absent one. **This line depends on a phase it does not own**, and
  that is a roadmap defect worth recording rather than working around: it is why the box is `[~]`._
- [x] **i18n:** en+tr keys added for all new surfaces (download manager, find-bar, print/PDF/reader/translate,
      bookmark manager, private-mode chrome, Permissions Center, omnibox command hints, Site Info bubble)
      — _**the fourth DoD line of this phase to close**, and it closed by being made checkable rather
      than by being attested to._
  - _Site Info bubble done: `browser.siteInfo` (omnibox labels) + the top-level `siteInfo` namespace,
    en+tr, in `apps/desktop/src/i18n`; permission labels/state names reused from `@tepegoz/settings-ui`._
  - [x] **Every dictionary in the repo is now swept by one test**
        (`packages/i18n/src/dictionary-coverage.test.ts`, 2026-09-02): 27 dictionaries, en+tr present
        and key-for-key aligned. Each surface this line names maps to one of them — download manager →
        `downloads-ui`, find-bar → `find-bar`, reader → `reader`, translate → `ext-translate`, bookmark
        manager → `bookmarks-ui`, Permissions Center → `settings-ui`, print/PDF + private-mode chrome +
        omnibox command hints + Site Info → `apps/desktop`._
        — _**Writing it found two things, which is why it exists.** First: seventeen of the eighteen
        packages had their own parity test and `@tepegoz/reader` had none — silently, for as long as it
        has existed, because a per-package test is one somebody has to remember to write. Second, and
        worse: the sweep's own first version hardcoded `['packages', 'apps']` and therefore reported
        full coverage while missing the nine dictionaries under `extensions/` — including
        `ext-translate`, which this very line names. It now reads the groups from
        `pnpm-workspace.yaml`, so a new top-level group is covered the day it is added rather than the
        day someone notices._
        — _Mutation-verified: dropping one Turkish key from `@tepegoz/reader` fails exactly that
        package's row and names it._
        — _**What it does NOT prove**, said plainly so the tick is not read as more than it is: it
        proves the two locales agree, not that no component anywhere hardcodes an English string. That
        is a different rule (engineering-rules: no hardcoded UI strings) and it has no automated check
        yet._
- [~] ADRs accepted: **Download Trust Model** (agent-initiated download class + quarantine policy) —
  _**[ADR-0040](../../docs/adr/0040-download-trust-model.md) accepted.** Documents the shipped
  quarantine lifecycle + risk classification + the release/HITL gate + the agent security class,
  and speces the Safe-Browsing provider seam._ · **Page-Translation** provider boundary —
  _**[ADR-0042](../../docs/adr/0042-page-translation-provider-boundary.md) accepted** (owner call
  2026-09-01: hybrid — local model default, cloud per-origin opt-in, sensitive sites never reach
  cloud). Ratifies the shipped `@tepegoz/ext-translate` hybrid engine; the sensitive-site cloud lockout
  **and** the agent-run untranslated-source guarantee (`ensureUntranslatedForAgent` on `readPage` +
  `snapshotElements`) are wired. **Owed for the box:** the remaining agent DOM readers +
  auto-translate suppression for a run's duration._ ·
  **Safe-Browsing provider** — _**[ADR-0043](../../docs/adr/0043-safe-browsing-service-and-egress.md)
  accepted** (owner call 2026-09-01: direct to Google Safe Browsing v5, on by default, one
  Settings switch to disable). **Shipped 2026-09-01, all unit-tested:** `SafeBrowsingProvider` +
  `PrefixStore` + SB v5 full-hash/list clients + `SafeBrowsingRefreshScheduler` +
  `SafeBrowsingService` + `will-navigate` check & interstitial + `DownloadTrustProvider` into
  `DownloadService.init()` + the `safeBrowsingEnabled` toggle. Rice-Golomb decoding **and**
  incremental (delta) list updates are now done — `parseHashListDelta` / `applyHashListDelta` /
  `fourBytePrefixChecksum`, a stored `versionToken`, checksum-verified apply with a full-refresh
  fallback. **Inert** pending only a free-tier Google Safe Browsing API key (release input)._
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
- [x] `will-download` intercept in the browsing session → **quarantine** the file (temp, not-yet-trusted) +
      compute file hash + check via Phase 2 **`SafeBrowsingService`** (reuse, do NOT re-implement); community
      blocklist reuse where present
  - [x] _Stale box, corrected on inspection 2026-09-02 — every clause of this line has been code for a
        while. `handleWillDownload` is registered on EVERY browsing session (`BrowsingSessions.register`,
        `critical: true`, so a session the handler cannot attach to hosts no tab), the file is written
        to `userData/Downloads/quarantine`, `finishToQuarantine` hashes it with `sha256File` and asks
        the injected `DownloadTrustProvider`, and `main/index.ts` passes
        `SafeBrowsingService.downloadTrustProvider()` — the Phase 2 service, reused, not
        re-implemented. "Community blocklist reuse **where present**" is satisfied vacuously: there is
        none. The one caveat is already tracked as this phase's blocker rather than as this box's:
        without a Safe Browsing API key the provider answers `unknown`, so the check runs and settles
        every file at `quarantined` awaiting the human._
- [ ] **Media resolver tool.** The `download_*` tools manage downloads that have already started; nothing
      resolves a _public media URL_ (a YouTube transcript, a public video/image link) into a direct,
      verified resource. Add one resolver tool — and route the actual save through the **existing**
      quarantine → hash → SafeBrowsing → trust-gate path above, so it gains no new write path and no new
      trust exemption. Captured, not scheduled:
      [`../tracks/webbrain-agent-parity.md`](../../docs/parities/webbrain-agent-parity.md) P3-c.
- [~] **Executable/script** downloads (`.exe/.msi/.bat/.ps1/.sh/.dmg/...`) force an extra HITL confirm; zip/rar
  surface a content warning; nothing is "trusted" until the check passes
  - [x] _**zip/rar content warning shipped.** `archiveContentsUnverified(record)` in `@tepegoz/downloads`
        (true for `risk: 'archive'` while `quarantined`/`completed`) drives a distinct line in the
        Downloads manager, en+tr: the quarantine hash and the Safe Browsing check both look at the
        archive FILE, never inside it, so a `.zip` that passed can still expand to an executable. It is
        a **content warning, not a release gate** — `releaseNeedsApproval` stays `false` for an archive,
        asserted — so it does not teach a click-through habit on a file that is not itself dangerous to
        have on disk. 7 helper cases, mutation-verified._
  - [x] _**risk classification hardened** against a trailing dot/space (`report.exe.` → Windows writes
        and runs `report.exe`); `extensionOf` + `cleanFilename` now normalize `/[.\s]+$/` the way the OS
        does. See the download-trust commit._
  - [ ] _Executable/script "extra HITL confirm" beyond the existing quarantine + explicit Release click:
        the user releasing a quarantined `.exe` themselves is the current in-the-loop step (with the
        `riskyRelease` warning text), and the agent path is gated by ToolGateway HITL. Whether a
        dedicated per-release modal for executables is wanted on top of that is an owner call — box kept
        `[~]`._
- [x] **"Agent-downloaded"** provenance: an agent-initiated download is tagged + journaled with source domain + timestamp + agent task/`correlationId` (append-only "shown=recorded", ADR-0004)
- [x] Expose a `download_*` tool in the **Capability Plane** (Policy Kernel gated; **agent access
      deny-by-default**, HITL for any state-changing save) — never a direct renderer/agent filesystem write
- [x] **`@tepegoz/downloads` (headless store)** + **`@tepegoz/downloads-ui`** (presentational): list, progress,
      pause/resume/cancel, open, reveal-in-folder; actions injected via callbacks (Electron-free leaf)
- [x] _Risk (ADR required):_ download trust model — agent-initiated download security class, quarantine
      lifecycle, and the "release from quarantine" HITL gate — _[ADR-0040](../../docs/adr/0040-download-trust-model.md)._

### L10 — Download acceleration (rival evidence: IDM)

> **Where this came from.** [`../../docs/research/research-idm-downloader.md`](../../docs/research/research-idm-downloader.md).
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
- [x] **Resilient resume** — resume across an app restart and across a dropped connection, with exponential
      backoff and a bounded retry budget; a resumed transfer verifies the already-written bytes before
      continuing, never blindly appending
  - [x] **Resume across an app restart, with the byte check that makes it safe** (2026-09-02).
        _Before this, `resume` on a record whose `DownloadItem` was gone set the row to `in_progress`
        and moved nothing: a button that reports success and does nothing, which is worse than a
        disabled one — the user goes away and comes back to a transfer that never started._
        — _**"Verifies the already-written bytes" is the whole feature, and it is a pure function.**
        `planDownloadResume(record, bytesOnDisk)` compares what the FILE holds (measured) against what
        the record remembers and refuses to continue on any disagreement, on a missing validator
        (`ETag`/`Last-Modified`), on a non-resumable record, or when every byte is already there. The
        failure it prevents has no symptom: Electron continues writing at whatever offset it is handed,
        so a partial file plus a range from a changed resource produces a splice whose hash is computed
        over the splice — nothing downstream reports anything, the file simply disagrees with every
        other copy in the world. 10 tests, including that a `restart` can never carry a non-zero offset
        (the caller passes it straight to `createInterruptedDownload`)._
        — _**Migration 19 keeps what a restart-resume needs**: `url_chain` (redirects included —
        resuming the first URL can land somewhere else), `etag`, `last_modified`, and `partition`. The
        last one is a privacy requirement rather than a protocol one: a tunnel-bound transfer resumed
        on Direct after a restart would put the request on the clear route the user deliberately left.
        `retry` sidesteps that by re-running from the page you are on; a restart-resume has no page, so
        it has to know. None of the four reach the renderer — a URL chain can carry a signed query._
        — _**A row still reading `in_progress` at startup is corrected to `paused` on the way in.** No
        `DownloadItem` survives a restart, so that row was describing a transfer that is not happening,
        under a progress bar that would never move._
        — _The resumed item re-enters through `will-download` on its own session, so it picks up the
        same quarantine path, hash and trust gate as any other transfer. Nothing here bypasses them._
  - [x] **The dropped-connection half** (2026-09-02, the same day) — _exponential backoff (1s, 2s, 4s,
        8s, capped at 30s) and a budget of four attempts, in `planDownloadRetry`, which is a pure
        function so the policy can be read in one place rather than inferred from a timer._
        — _**It goes through the same `resumeInterrupted` path a manual resume takes**, so the
        byte-verification rule applies unchanged. An automatic retry that appended blindly would be
        worse than a manual one, because nobody watched it happen: if the bytes on disk cannot be
        trusted the row goes to `failed` and re-downloading from zero is left to the person._
        — _**A cancel is never retried.** It is the one interruption that carries an instruction, and
        it retires any pending retry rather than starting one._
        — _**While a retry is pending the row reads `paused`, and no `DownloadFailed` is journaled.**
        A row that says "failed" about a transfer that is about to continue tells the user something
        that is about to stop being true, and the audit log would hold an event that did not happen._
        — _**The attempt counter is in memory on purpose.** A restart is a new session and deserves a
        fresh budget; persisting it would leave a download that failed four times last week
        permanently un-retryable today. The timer is `unref`'d — a quit is a quit._
        — _Bounded on both sides by tests: a browser that gives up on the first dropped packet is one
        people stop downloading with, and one that retries forever hammers a server that is already
        telling it to stop. 6 tests._
- [x] **Speed + ETA metadata** — surface bytes/sec and estimated time remaining in the download record and the
      manager (already tracked as an open item in `packages/downloads/CHECKLIST.md`; this is the same task)
      — _`computeDownloadRate(samples, totalBytes)` is a pure helper in `@tepegoz/downloads` (unit-tested
      directly): two-or-more samples over a sliding ~4s window → `bytesPerSecond` + `etaSeconds`
      (`null` when the total is unknown or the rate is zero). The desktop `DownloadService` keeps that
      window trimmed per download in an **in-memory** `state.rates` map — the estimate is NEVER
      persisted or journaled (meaningless once the transfer stops) and rides only the live
      `downloads:state` push; `publicRecord` attaches it only while `status === 'in_progress'`. Pause
      drops the window so a resume starts a fresh estimate rather than averaging across the gap. The
      manager row shows "… · 1.2 MB/s · 0:42 left" (duration formatted locale-neutrally; only the "/s"
      and "left" strings are translated, en+tr)._
- [x] **Retry command descriptor** for a failed download (also open in the package checklist)
      — _`'retry'` joined `DOWNLOAD_COMMAND_ACTIONS` (+ schema, + `isRetryableStatus` guard = failed
      | canceled). It re-enters the SAME `will-download` path — quarantine, hash, trust check, HITL
      release gate — so it can never be a shortcut around any of that; the old record is dropped and
      the fresh attempt takes its place, Chrome-style. It needs a live web page and uses THAT page's
      session on purpose: the original browsing session (Direct / a Phase 5 tunnel) is not recorded,
      and silently retrying a tunnel-bound download on the clear path would be the exact leak the tab
      model guards against — retrying from the page you are on keeps it on the route you can see.
      `ipc-downloads.ts` resolves the sender window's active tab for the `wc`._
- [x] **Transfer capture beyond the page** — catch downloads the page did not initiate through a normal
      navigation (media elements, `blob:`/redirect chains) so the manager is not blind to a class of transfers;
      strictly in-browser, **no system-wide traffic interception** — that is IDM's model and it is out of scope
      on purpose (it needs a proxy/driver that contradicts this project's threat model)
  - [x] **Measured before building anything, and the measurement closed the row**
        (`e2e/spike-transfer-capture.spec.ts`, 2026-09-02). The row assumed a blind spot; there is
        none for the classes it names. A real page in the launched app, three real transfers, counting
        `will-download` on the live browsing session:

        | Transfer                                                              | Reaches `will-download`? |
        | --------------------------------------------------------------------- | ------------------------ |
        | `<a download href="blob:…">` clicked by the page (client-side export) | **yes**, as the blob URL |
        | 302 → `Content-Disposition: attachment`                               | **yes**, as the FINAL url |
        | `downloadURL(blobUrl)` from MAIN — the "Save video as" menu path      | **yes**                  |

        _So all three land on the handler registered for every browsing session, and therefore in
        quarantine → hash → trust gate like anything else. Nothing needed building; what needed doing
        was checking, because "the manager is blind to a class of transfers" was an assumption nobody
        had tested and it was wrong._
  - [ ] **The one real residual, named rather than left implied:** a `<video>` whose source is a
        MediaSource (`blob:` from MSE — how YouTube and most streaming sites deliver) has no single URL
        to fetch; the bytes arrive as segments the page appends. `downloadURL` on such a blob has
        nothing to download. Capturing THAT means recording and remuxing media segments, which is a
        media pipeline rather than a capture hook, and it is the same thing this row's own
        "no system-wide traffic interception" clause rules out. Not scheduled; recorded so the gap is
        a known shape rather than a surprise.
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
  - [x] Switching tabs does not re-sync the counters to the newly-active tab (the bar keeps the
        previous tab's numbers until the next keystroke).
        — _`useFindInPage` (`app-find.ts`) now takes the active tab id and re-issues the OPEN query
        against the newly active tab on a switch — the same `findNext: true` restart typing a fresh
        query already does, so it reuses the exact request shape main already handles instead of adding
        a new one. Nothing fires on mount, when the bar is closed, or when the query is empty — a
        switch must never spontaneously open a search nobody asked for. 5 unit tests
        (`app-find.test.ts`), one of which found the fix needs the query still IN FLIGHT to matter: a
        stale result for the tab just left must not overwrite the resynced count once the new tab's
        real answer arrives._
  - [ ] Separate harness constraint found here: `keyboard.press('Control+f')` never reaches Electron's
        main-process `before-input-event`, so the Ctrl+F shortcut is not drivable from Playwright.
- [~] **Print + print-preview** (Ctrl+P): `webContents.print` / `printToPDF`; respects sensitive-site rules — _**Ctrl+P works now; it never did.** The command was not missing — `printActive()` has existed all along and the right-click menu called it. What was missing was the KEY: `@tepegoz/shortcuts`, the registry that is the only place a global key may be bound, had no `print` entry, while `page-context-menu` printed the string `'Ctrl+P'` next to the row. The menu taught the user a key that was bound to nothing. **The same defect held for two siblings** — `Ctrl+S` (save) and `Ctrl+U` (view source) were advertised the same way and equally dead — so all three are now registered (`main` scope, for the reason `find` is: the key arrives while the PAGE has focus, where the chrome renderer never sees it). Wiring them exposed a real cycle: `keyboard-shortcuts.ts` cannot import the tab model, because `tabs-view-wiring.ts` imports IT (dependency-cruiser's `no-circular`, measured, not guessed). The bodies moved to `page-commands.ts` as free functions over one `WebContents`, following the `handleZoomShortcut` precedent — which also removed the duplication, since the keyboard and the menu now run the same code instead of the menu owning the only copy. `printActive()` was a bare `webContents.print()`: called with no callback it reports **nothing at all**, so a print that never happened looked exactly like one that did. It now distinguishes a user cancelling the dialog (the ordinary outcome) from a real failure (a warning carrying Chromium's reason). **Two gates, both mutation-verified:** `accelerators.test.tsx` walks every branch of the menu on win32/darwin/linux and fails if any row advertises a key that is neither in the registry nor in the declared platform-built-in set (removing `print` from the registry turns 5 tests red); `keyboard-shortcuts.test.ts` locks the dispatch, including that matching stays EXACT so Ctrl+Shift+P does not print (removing the dispatch case turns 2 red). The accelerator strings are now derived rather than typed, which fixed a defect nobody had reported: they were hardcoded Windows notation on every platform, so a Mac was told `Alt+←` for history when macOS uses `⌘←`, and `Ctrl+P` where it should read `⌘P`._ — _**`printToPDF` now landed too, so this box is code-complete.** "Save as PDF…" is a page right-click row (`main/print/print-to-pdf.electron.ts`), separate from `page-commands.ts` because that module is imported BY the tab model and therefore cannot reach `NotificationHost` — a measured cycle, not a preference. It asks for the path BEFORE rendering: generating a long page and then discarding it on Cancel is work for nothing, and on a slow page the dialog would arrive long after the click. It reports failure, which is the point of having it at all when the system dialog already offers a PDF printer — `printToPDF` rejects on a page it cannot render, and an unwritable path or a full disk are ordinary; a save that silently did nothing is the exact failure mode this file keeps recording. **The suggested file name is a security surface, not cosmetics:** it comes from `<title>`, which the PAGE sets, and lands in a native dialog's `defaultPath`. `pdf-filename.ts` strips both platforms' separators and any `..`, drops Windows-reserved and control characters, prefixes the reserved device names (`CON.pdf` is refused by the OS with any extension), and removes leading dots — a leading dot is a hidden file on unix, and the residue of a traversal attempt should not get to decide that. 12 sanitizer tests + 8 service tests. Two of those tests earned their keep during the writing: the traversal cases were passing a literal carriage return, because `\r` inside `C:\Users\kuray\report` written as an ordinary TS string is one character, not two — and while fixing the input they exposed that the sanitizer's own `[\/]` had been collapsed to `[\/]`, so backslashes were never being stripped at all._ — _**"Respects sensitive-site rules" is vacuous today and is NOT being ticked as if it were satisfied:** that lockout gates AUTOMATION, and no agent tool can print or save a PDF (checked — `browser-tools` and `capability-plane` have neither capability). Printing is a user action on their own screen; blocking a user from printing their own bank statement would be the wrong reading. The line becomes real only when an agent-initiated print exists. That is why this box stays `[~]` rather than `[x]` — the DoD line names a property this code does not yet have anything to apply._
- [x] Built-in **PDF viewer** (Chromium PDF plugin surface; open-in-tab + save routes through Download Manager)
      — _`webPreferences.plugins: true` on every browsed tab view turns on Chromium's bundled PDF
      viewer, so an `application/pdf` response renders in-tab (viewer toolbar + its own download
      button, which still funnels through `will-download` → DownloadService) instead of always
      downloading. In current Chromium `plugins` gates the internal PDF/print viewers only — NPAPI and
      Pepper are gone — so no plugin surface is re-opened. The three view-creation sites (fresh tab,
      revive-from-discard, cross-window rehost) were carrying three hand-copied `webPreferences`
      literals; they now share one `browsedViewWebPreferences(session)` factory in `tabs-shared.ts`,
      which is the single place the hardening invariants (contextIsolation/sandbox/no-preload/
      webSecurity) and `plugins` live. Tests: `tabs-shared.test.ts` pins the factory's invariants;
      `e2e/pdf-viewer.spec.ts` serves a real `application/pdf` and asserts the viewer mounts in the
      tab document rather than a download firing._
  - [~] **The agent can now SAVE a PDF; reading one is still open.** _Half built 2026-09-02:
        `browser_export_pdf` exists (`browser_save_pdf` was the intended name — the registry's
        `{domain}_{verb}_{noun}` rule rejected `save`, and `export` is both approved and the more
        honest verb). `browser_read_pdf` is not built._
        — _**It adds no write path, which was the whole condition.** `printToPDF` produces bytes;
        `DownloadService.ingestGeneratedFile` puts them through the SAME quarantine → hash →
        trust-check → human-release path every download takes. The agent can cause a file to exist in
        quarantine and nothing more; only a person can move it anywhere the user would look. The
        filename comes from the page title, so it goes through `pdfFileName` — the title is
        attacker-controlled and would otherwise reach a path._
        — _**`state_changing`, and `actor: 'agent'` is stamped by the HOST.** So the ToolGateway asks a
        human before the call, and `releaseNeedsApproval` refuses the record afterwards regardless of
        what the file turns out to be. Two gates, neither of which the model can set a field to avoid._
        — _**What comes back is an id and a filename, never a path.** The agent has no filesystem, and
        one real path string is how that stops being true. Pinned by a test._
        — _**A stale comment fell out of this.** `print-to-pdf.electron.ts` justified not gating the
        USER's Save-as-PDF on the sensitive-site list partly with "no agent tool can print or save a
        PDF (checked)". That sentence is now false, so the justification was rewritten to the one that
        survives: the user's own command on their own screen is not automation, and the agent's path is
        separately gated. This is exactly the line the phase note predicted would stop being vacuous._
  - [ ] **`browser_read_pdf` remains open, and its stated design is now REFUTED — measured, not
        argued.** _`e2e/spike-pdf-text.spec.ts` serves a real PDF that draws a known probe string,
        opens it in the built-in viewer, and tries every route that would not need a new PDF stack.
        All three return nothing:_

        | Route                                                             | Result             |
        | ----------------------------------------------------------------- | ------------------ |
        | `executeJavaScript('document.body.innerText')` in the tab         | **0 characters**   |
        | The same, in every frame of the subtree (incl. the viewer's own)  | **0 characters**   |
        | CDP `Accessibility.getFullAXTree`                                 | 6 nodes, **no names at all** |

        _So "reuse its text layer — no new PDF library, no new parsing attack surface" cannot be built
        as written. PDFium draws the text; it never becomes DOM, and in the default configuration it
        does not reach the accessibility tree either._
        — _**One thing the spike also found**, worth knowing before the next attempt: the app's own
        `CdpDriver` already holds the debugger on a browsed tab, so anything reaching for
        `debugger.attach` has to go through that driver rather than opening its own session._
        — _**The three honest options, none of them free.** (1) Turn on renderer accessibility (a
        Chromium flag, so it goes through the allowlist in the developer-settings track) and re-measure
        — the AX tree returning six unnamed nodes is consistent with PDF a11y simply being off, not
        with it being impossible. (2) Parse the bytes with a real PDF library, which is exactly the
        parsing attack surface the original note wanted to avoid — containable in the extraction
        sandbox or a utility process, but it is a new dependency and a new threat-model paragraph.
        (3) Hand the bytes to a multimodal model, which is S10 vision territory and costs a call per
        page. Picking among these is a design decision with a security cost attached, so it is written
        down here rather than guessed at._
        — _The spike stays in `e2e/` as the evidence. It asserts nothing and prints its findings, which
        is what makes it re-runnable the day someone tries option (1)._
        The original note follows as written:
  - [ ] **The agent still cannot read or save a PDF** — the note on the print row above verifies this
        (`browser-tools` and `capability-plane` have neither capability). Two small tools close it, both
        sitting on surfaces this phase already shipped rather than adding a PDF stack: a
        `browser_read_pdf` that extracts text from the **already-rendered** viewer (reuse its text layer —
        no new PDF library, no new parsing attack surface), `dangerClass: 'read'`, wrapped as untrusted
        content exactly like `browser_get_page`; and an agent-callable page→PDF save routed through the
        landed `printToPDF` path, which means it inherits `pdf-filename.ts`'s sanitizer and the Download
        Manager's trust gate rather than getting its own write path. Note that an agent-initiated print is
        also precisely what makes the print row's "respects sensitive-site rules" line non-vacuous. Sources:
        [`../tracks/webbrain-agent-parity.md`](../../docs/parities/webbrain-agent-parity.md) P3-a and
        [`../tracks/playwright-mcp-agent-parity.md`](../../docs/parities/playwright-mcp-agent-parity.md) P4.
- [x] **Reader mode** (Readability extraction → clean, localized reading view; opt-in per page)
      — _`@tepegoz/reader`: Readability-style scoring (paragraph density, discounted by link density,
      penalised on the class/id names that mark boilerplate), the reading view, en+tr. Page right-click
      → "Reading view". 21 tests._
      — _**The extractor produces BLOCKS, never HTML, and that is the security decision the whole
      feature rests on.** A reading view draws the body of an arbitrary page inside the TRUSTED app
      chrome — the one place in this browser where injected markup would run with the chrome's
      privileges. Filtering HTML to make that safe is a game you have to keep winning; handing the
      renderer typed blocks with plain-text fields is a game there is nothing to play. There is no
      `html` field in the model and no `dangerouslySetInnerHTML` in the view. Image `src` is the single
      attribute that survives, allow-listed to `http(s)`/`data:image` **twice** — in the page, and again
      in main on the value that becomes the attribute. The cost is accepted and stated: inline markup is
      flattened to text._
      — _**No `@mozilla/readability`, no jsdom.** Extraction runs INSIDE the page, where the document is
      already parsed, so no DOM implementation is shipped into main to re-parse it. The extractor is
      still a plain function of a `Document`, which is what keeps it testable — vitest's jsdom
      environment supplies one. The injected copy is generated from that same source by
      `scripts/generate-reader-bundle.ts` (the established `video-player-embed-bundle` pattern), so the
      thing that runs and the thing the tests exercise cannot drift: they ARE one source, compiled
      twice._
      — _**`null` is a real answer with its own copy.** Extraction declines on search results,
      dashboards and apps by design, and the UI says "this page does not look like an article" rather
      than "reader mode failed" — one is a fact the user can act on, the other sends them looking for a
      bug. Main treats the returned value as untrusted regardless of having written the source, and
      re-validates the whole shape: a hostile page can patch globals, and "we wrote it" is not a reason
      to trust what comes back across a boundary._
      — _The view is an **overlay**, not a navigation: the tab keeps its URL, history and scroll, so
      leaving it returns the user exactly where they were. Any navigation or tab switch closes it —
      an article left on screen over a different page would misattribute itself to that page._
      — _Mutation-verified: removing the image allow-list, the link-density guard, the STRIP skip in
      `text()`, or the "a block owns its subtree" return each turns a test red. **The subtree one did
      not, at first** — the plain-text list fixture had no element children to descend into, so it
      proved nothing; a `<li><p>…</p></li>` case was added and the property is now actually covered.
      Separately, the block-count test passed locally and timed out under coverage instrumentation; its
      fixture was the heaviest in the repo for no reason and is now cheap with a stated budget._
- [x] **Page translation** — _**[ADR-0042](../../docs/adr/0042-page-translation-provider-boundary.md)
      accepted + shipped** (hybrid: local model default, cloud per-origin opt-in, sensitive sites never
      reach cloud). The hybrid engine, per-origin session consent, translation memory and glossary in
      `@tepegoz/ext-translate` + `translate-host.electron.ts`; the **sensitive-site cloud lockout**
      (`isSensitiveOrigin` port → `runEngine` refuses cloud before any consent prompt); and the
      **agent-run untranslated-source guarantee** (`requireWcUntranslated` on every DOM read path +
      `maybeAutoTranslate` bailing while `hasActiveAgentRun()`). All three ADR-0042 conditions met;
      full turbo + unit tests green. (The DoD line above bundles translation with find/print/PDF/reader/
      screenshot — those are individually done too, but that line stays open pending one explicit
      end-to-end pass over the set.)_
- [x] User-facing **screenshot** (visible viewport + full-page) → stored as a **CAS blob** (reuse Phase 0/1b
      blob store; WebP), never inline base64
      — _Delivered in commit `18eee15` (this row was left unticked). Page right-click → viewport /
      full-page → `captureAndStore` (`main/screenshots/user-screenshot.electron.ts`): `capturePage`
      → PNG → WebP re-encode round trip through the trusted chrome renderer (`NativeImage` cannot
      encode WebP; Chromium can, only from a renderer) → `BlobStore.put` (a `cas://` ref, never
      inline base64). If the WebP encode fails or times out the PNG is stored and the record's
      `format` field SAYS `png` — a field that always claimed WebP would be one nobody could trust.
      Full-page capture is pixel-clipped at the agent path's own ceiling. `captureAndNotify` then
      toasts + files a notification-center entry naming the SIZE and format (the whole reason the
      WebP path exists is checkable file size)._
  - [x] Agent visual fallback down-payment: `@tepegoz/screenshots` + `browser_get_screenshot` can capture
        viewport/fullPage PNG for model context.
- [x] **Per-site zoom persistence** (`webContents.setZoomFactor` + per-origin store in preferences;
      restored on navigate) — `main/site-zoom.ts` + the private `siteZoomFactors` pref. Ctrl +/-/0 step a
      Chrome-style ladder (25%–500%); the stored factor is re-applied on every committed navigation, so
      crossing origins cannot inherit the previous site's zoom. Only non-100% origins are stored and
      Ctrl+0 deletes the key, so the pref cannot accumulate into a record of every site visited.
      13 unit tests. _(Uses `setZoomFactor`, not `setZoomLevel` as this line originally said: a factor is
      what the ladder and the stored value are expressed in.)_
  - [x] **Zoom indicator in the omnibox** (Chrome-style: a pill at the trailing edge of the address
        bar, shown only when the active tab is off 100%, with a −/level/+/Reset bubble).
        — _`@tepegoz/nav-toolbar`'s `ZoomIndicator` (leaf, i18n-agnostic — the host injects labels via
        `@tepegoz/browser-chrome`, en+tr). The active tab's factor rides `TabsState.activeZoomFactor`
        (read off the live `WebContents` when the state is built, so a `did-navigate` re-apply of the
        origin's stored level is already reflected); there is no dedicated push. The bubble's buttons
        go renderer→main on `zoom:command` → `WindowTabs.zoomActive` → the SAME `site-zoom` ladder +
        per-origin store the Ctrl +/-/0 shortcuts use (`applyZoomCommand`), then a state re-emit. A
        Ctrl shortcut handled outside the tab model (page- or chrome-focused) now also re-emits so the
        indicator repaints. Nothing optimistic in the renderer — main stays the source of truth._
        — _The **hamburger-menu zoom row** (`@tepegoz/browser-menu`'s `ZoomRow`, previously a disabled
        100% placeholder) is now live too: the menu popup is a child window with no `tabs:state`, so
        it reads the value over a new `zoom:get` invoke (`forSenderWindow` walks the popup up to its
        owning browser window) and re-reads after each −/+/reset; that row alone does not close the
        menu, Chrome-style. Tests: `applyZoomCommand` (5, `site-zoom.test.ts`), `toState` zoom
        pass-through (`tab-store.test.ts`), indicator show/hide + button routing (3,
        `nav-toolbar.test.tsx`), wired menu-zoom row (`main-menu-model.test.tsx`)._
  - [x] **Site Info bubble** (Chrome's Page Info panel: a leading omnibox control that shows a lock on
        `https://`, a red "Not secure" on `http://` — `http://localhost` included — and a gear on an
        internal page; clicking it opens a native popup with connection status, a certificate viewer,
        "N cookies in use" + Clear site data, and the per-origin permissions as inline Ask/Allow/Block
        controls + Reset, plus a "Site settings" deep-link). — _[ADR-0044](../../docs/adr/0044-page-info-and-connection-security.md).
        `PageSecurityLevel` + pure `classifyPageSecurity` in `@tepegoz/shared-types`; the cheap verdict
        rides `TabsState.activeSecurityLevel`, the full payload is pulled on demand over `page-info:get`
        (never throws — an internal/`file://` URL yields a null-heavy `PageInfo`). A
        `setCertificateVerifyProc` recorder on every browsing session captures the leaf cert + chain
        for the viewer and **always** returns `callback(-3)` (observe-only, never trusts). The bubble's
        permission edits write the SAME `sitePermissions` pref the Permissions Center uses — no
        parallel flow. Leading control lives in `@tepegoz/omnibox`, threaded through
        `@tepegoz/nav-toolbar` + `@tepegoz/browser-chrome`; popup surface `site-info` reuses
        `PopupWindowManager` (`align: 'start'`). Tests: `page-info.test.ts` (classifier matrix incl.
        `http://localhost` → not-secure, https+certError → dangerous), `certificate-recorder.electron.test.ts`
        (proc returns -3 for clean AND failed handshakes; LRU eviction), `ipc-page-info.electron.test.ts`
        (internal → nulls, http → not-secure + cookie/permission map), `omnibox.test.tsx` (+5: lock vs
        red "Not secure", opens with a rect, hidden for `unknown`)._
    - _Reworked 2026-09-02 ([ADR-0044 amendment](../../docs/adr/0044-page-info-and-connection-security.md#amendment-2026-09-02--the-bubble-is-a-stack-of-panes-and-it-lists-only-relevant-permissions)):
      the bubble is now three panes walked with a back arrow (rows → **Security** → **Certificate**,
      the viewer laid out like Chrome's General tab), and it lists a permission row ONLY for a
      capability this origin asked for this run or the user already decided — the six always-present
      dropdowns were crowding out the two lines the panel exists to show. `WebPermissionBroker` records
      "asked" in memory before every short-circuit; `permissionsFor` filters on it. The omnibox's left
      padding is now MEASURED from the leading control instead of `pl-9` / `pl-[6.5rem]`: the lock's
      hover pill was sitting on the `h` of `https://`, and the hardcoded alarm width was sized for the
      English "Not secure", not the Turkish "Güvenli değil". Tests: `permission-broker.test.ts` (5, new
      — the record survives a stored grant, the global notifications switch, and stops at `requestAll`'s
      first refusal), `ipc-page-info.electron.test.ts` (+2, and the "full map" case inverted)._
- [ ] **Spellcheck** (`session.setSpellCheckerLanguages` + built-in Chromium spellchecker; currently
      `spellcheck:false` in `window.ts`) — en/tr dictionaries, settings toggle
  - [ ] **Scope conflict — decide before building.** `ext-typo` already ships "local-first writing and
        typo assistance for editable web text" with its own downloaded en/tr dictionaries and settings.
        Implementing Chromium's spellchecker in core would duplicate a shipped extension's feature, which
        the working agreement forbids. The two are not identical (Chromium gives free red squiggles and
        native context-menu suggestions in every input; ext-typo is a richer opt-in assistant, and Chrome
        itself ships both), so this is a product call — not a coding task. `spellcheck:false` is still the
        live setting, so today neither path underlines anything in a plain text input.
- [x] **Unified "Clear browsing data" dialog with a time range** (last hour / 24 h / 7 days / 4 weeks /
      all time) + the full category list in one place — ~~today only "clear history" and "clear download
      history" exist, plus the Site Info bubble's per-site "clear site data".~~ _Built 2026-09-02.
      Settings → Privacy now opens one dialog: a range plus five categories (history, download list,
      cookies & site data, cache, agent conversations)._
  - [x] **Why one dialog and not three tidy ones.** _Clearing was three controls in three places, and
        the cost is not aesthetic: someone who wants the last hour gone clears one of the three and
        believes they cleared all of it. That is a privacy control that produces false confidence,
        which is worse than no control._
  - [x] **The time range does not reach cookies or the cache, and the dialog says so on those rows.**
        _Rows this app owns carry a timestamp, so a range is a `WHERE` clause. Cookies, site storage and
        the HTTP cache live in Chromium, and Electron's session API (`clearStorageData` / `clearData` /
        `clearCache`) exposes no "since" parameter at any version — Chromium has one internally and does
        not surface it. So those two are all-or-nothing, said next to the checkbox rather than in a
        footnote: a control whose real scope is wider than its label is worse than one that is honest
        about being blunt. Pinned by `TIME_RANGEABLE_CATEGORIES` and a test that asserts the split._
  - [x] **Saved passwords are deliberately NOT a category.** _Chrome offers them here; this does not.
        Deleting a credential is a different act from clearing a trace — it destroys user-authored data
        that outlives the browsing it happened during — and it has to be asked for where it can be
        confirmed on its own terms. The per-site clear already refuses to touch the vault for exactly
        this reason, so the wide clear inheriting the rule is consistency, not caution. A test pins it
        so it stays a decision rather than becoming an oversight someone later "fixes"._
  - [x] **Agent conversations are a category, because in this browser they are browsing data.** _No
        other browser has the row because no other browser has the data. Leaving what the user typed at
        the agent out of the one dialog people go to would make that dialog a half-truth._
  - [x] **The partition rules are the per-site clear's, inherited rather than re-derived.** _Browsing
        partitions only (the app's own chrome partition holds UI state, not browsing), and EVERY
        browsing partition — since Phase 5 a tab bound to a VPN/Tor connection keeps its cookies in that
        connection's own partition, and a clear that stopped at the base one would report success while
        leaving the sessions behind the tunnel intact._
  - [x] **Counts, not "Done", and a failed category is named.** _The whole point of one clear button is
        that the user stops checking, so it is the one place that must not quietly do less than it says.
        Each category is attempted independently; the result carries per-category counts and a `failed`
        list, and a missing database reports failure rather than "nothing to clear". Journalled as
        `BrowsingDataCleared` with counts only — the record of a clearing must not become a copy of what
        was cleared._
  - [x] **Which timestamp each range applies to was a decision per store.** _History ranges on the LAST
        visit (a page first seen last year but opened ten minutes ago IS part of the last hour).
        Downloads range on when the transfer STARTED, not `updated_at`, which moves with every progress
        write and would sweep a long transfer begun yesterday into an hour-long range. Terminal
        downloads only — a running one's row is what tracks it. 13 tests across the three stores and the
        pure range/boundary layer._
  - [x] **On-exit category-based clearing** (§6's third row) — _built 2026-09-02, the day after the
        dialog, reusing its categories rather than inventing a second vocabulary: two lists for the
        same act is how one of them ends up quietly narrower._
        — _**The "what if it is killed" question had an answer worth taking.** Firefox and Brave both
        run this in a quit handler, so a crash, a `kill`, or a flat battery leaves everything behind:
        the setting does nothing on the one exit the user did not choose, and says nothing about it.
        Here a marker in `meta` is armed at startup and retired only by a clear that actually
        FINISHED. So the normal case still clears at exit (which is what the setting says, and it
        means the data is gone while the app is closed), and every abnormal case is caught at the next
        launch — settled before the first window exists, because a window opening onto data the user
        asked to be rid of, even for a frame, is the failure this setting is bought to prevent._
        — _**The quit hook is deliberately not awaited.** Electron may take the process down mid-clear;
        that is precisely what the marker makes survivable, and a quit the user asked for is never
        blocked on housekeeping. Doing the clear twice is the worst outcome, and for a delete that is
        not a cost._
        — _**A marker that cannot be read is not a licence to delete something we cannot name**: an
        unparseable marker clears nothing, and a category a future build stopped knowing about is
        dropped rather than guessed at. Both pinned by tests._
        — _The UI says the kill-safety out loud in en+tr, because it is the difference from how every
        other browser ships this and an unstated guarantee is not one. 9 tests._
- [ ] **File-type / MIME handler actions** ("Open in app / Always ask / Save / Open in browser" per type;
      "automatically open safe files after downloading"). No home in the Download Manager work above.
      Scoped, not scheduled: [`../tracks/browser-settings-feature-gap.md`](../../docs/tracks/browser-settings-feature-gap.md) §15.
  - [ ] **Blocked on an owner call, not on effort — found 2026-09-02 while starting it.**
        [ADR-0040](../../docs/adr/0040-download-trust-model.md) §3 makes
        `commandNeedsApproval(record, 'open')` true unless a download is **both** `normal` risk **and**
        `safe` verdict. With `unknownTrustProvider` live every completed transfer settles at verdict
        `unknown`, so an "automatically open safe files" rule could never fire — it would be a fourth
        deliberately-inert capability waiting on the same missing Google Safe Browsing key. Making it
        fire would mean letting a standing per-type consent stand in for the per-download HITL, which
        is a **weakening of an accepted security ADR** and therefore an owner decision, not a coding
        one. Left open with the reason written down rather than half-built.
  - [x] **The two rows of §15 that were NOT blocked were built instead (2026-09-02).**
        _"Download-history auto-removal policy" and "Show downloads when they're done" — both real
        gaps against Safari and Chrome, neither touching the trust model._
        — _**Retention (`downloadHistoryRetention`: manual / after-day / on-completion).** `manual` is
        the default and the only policy that never deletes on its own: a download list that quietly
        empties itself cannot answer "did I actually download that?", which is most of what the list is
        for. The rule is a pure function (`downloadsToForget`) so the two callers — the startup sweep
        and the post-transfer one — cannot disagree about it, and it is applied at startup because rows
        age out while the app is closed. **The files are never touched**; this removes rows, which is
        what the Settings copy says. Three invariants pinned by tests: a transfer still moving is never
        swept (its row is what tracks it), a **quarantined** row is never swept however old (the file
        is waiting on a release decision and dropping the row strands it), and `on-completion` keeps
        failures and blocks — "as soon as they finish" means finished SUCCESSFULLY, and a failed
        download is exactly the row someone comes back for. 6 tests._
        — _**"Show downloads when they're done" (`showDownloadsWhenDone`, default on).** Opens the
        transfers panel once, on a transition INTO an ended state — never for a download that was
        already finished when the chrome mounted, because restoring yesterday's list is not an event.
        Cancelled transfers are excluded (the user did that themselves and popping a panel at them for
        their own action is how a setting gets turned off); `blocked` and `failed` are included,
        because an outcome nobody asked for is the one worth showing. The preference is read AT the
        moment it would act rather than cached on mount — it is a private setting, so it is not
        broadcast, and a cached copy would ignore the toggle until the chrome reloaded._
        — _Both are `private` in `SETTINGS_VISIBILITY`: how someone keeps their download list is a
        browsing-habit signal, and a page has no business reading it._

### L9 — Bookmarks 2.0

- [x] Extend the flat `BookmarkStore` (Phase 1a) with **folders/tags hierarchy** + full-text search
      (migration-safe, additive schema; existing bookmarks preserved)
  - [x] Folder hierarchy + search: `BookmarkTreeStore` (two fixed roots, create/move/remove, explicit
        ordering, cycle guard on reparent, cascade delete, root-protection, `listFlat` projection,
        `search` over url+title). Migration-safe and additive.
  - [x] **Tags.** ~~Do not exist — the store models folders only.~~ _They exist now, so the word in the
        line above is earned. Tags sit BESIDE the hierarchy rather than inside it, which is the point of
        having both: a bookmark lives in exactly one folder and carries any number of tags, so the two
        answer different questions — "where did I file this" and "what is this about" — instead of
        competing._
        — _**A junction table, not a comma-joined column.** A joined string cannot be indexed, cannot be
        searched without LIKE matching across tag boundaries ("work" finding "homework"), and turns
        renaming a tag into a string rewrite of every row. `ON DELETE CASCADE` mirrors what
        `bookmark_nodes` already does for its children, so a deleted bookmark cannot leave tags behind to
        be counted by the tag list forever (asserted)._
        — _**Two columns for one tag.** `tag` is what the user typed and is what is displayed; `tag_key`
        is the case-folded form and is what uniqueness and lookup use. So "Work" and "work" are one tag
        rather than two, while the label still reads the way its author wrote it — picking only one of
        those is the single most common complaint about tag systems. First spelling wins, so re-adding a
        tag you already have cannot silently re-case every existing use of it. Folding happens in the
        WRITER, not in SQL: SQLite's `LOWER()` is ASCII-only and would leave every Turkish tag unfolded
        in a product whose second language is Turkish._
        — _**A measured limit, stated rather than papered over.** Folding uses `toLowerCase()`, which is
        locale-independent, and the Turkish dotted/dotless I is where that differs from what a Turkish
        reader expects: `'IŞIK'.toLowerCase()` is `'işik'`, not `'ışık'`, so those two do **not** unify.
        Measured in node before the code was written. The alternative — `toLocaleLowerCase('tr')` — is
        worse, because the same tag would then fold differently depending on the UI language and a user
        switching to English would fork their own tags. A locale-independent rule that is occasionally
        surprising beats a locale-dependent one that is silently inconsistent. Pinned by a test so it
        stays a decision rather than an accident; every other Turkish letter (ş ğ ü ö ç) does fold._
        — _**Search includes tags**, because a user who took the trouble to tag a page expects the tag to
        find it — a search that ignored them would make tagging a filing habit with no payoff. `DISTINCT`,
        so a bookmark matching on its title and two of its tags is still one result. The tag input splits
        on commas and **not** on whitespace: "machine learning" is one tag, and a browser that quietly
        made it two would be wrong about exactly the thing its user most wanted to write. Editing is the
        whole comma-separated set as text, which is what makes REMOVING a tag the same gesture as adding
        one. Folders refuse tags — two grouping mechanisms on one node is how a bookmark manager becomes
        unexplainable._
        — _24 tests (17 store/normalization + 7 UI), mutation-verified: dropping the fold turns 7 red,
        removing tags from search 2, removing `DISTINCT` 1, letting folders be tagged 1._
- [x] **Bookmark Manager UI** (searchable tree; create/rename/move/delete folders; import/export standard
      HTML bookmarks file)
  - [x] `@tepegoz/bookmarks-ui` + `tepegoz://bookmarks`: searchable tree, new-folder, drag reorder/reparent
        (dnd-kit), rename/delete through the host's native context menu.
  - [x] **Export to HTML.** ~~Missing — only import exists.~~ _Stale line, corrected on inspection:
        `serializeBookmarksHtml` exists in `@tepegoz/bookmarks` and is wired end to end
        (`bookmarks:export` → preload → the manager's Export action). Netscape HTML rather than JSON on
        purpose: a JSON dump would be a backup only this application can restore, which is the shape of
        lock-in that looks like a feature. The parser reads what the serializer writes, so the round
        trip is checked rather than asserted._
  - [x] **What "full-text search" means here, said plainly.** _Substring matching over case-folded
        shadow columns (title, URL, tags), not an FTS5 index — and that is the choice, not a shortcut.
        A tokenized index cannot find `moz` inside `mozilla.org` without the user writing `moz*`, and
        typing a fragment of a domain is the single most common way people search their own bookmarks.
        The corpus is hundreds to low thousands of rows, where an inverted index buys nothing an index
        scan does not already give. Ticked with the mechanism named rather than left to be read as a
        promise of ranking and stemming that is not there._
  - [x] **Turkish search in the STORE, which was still broken after the manager was fixed.**
        _`BookmarkTreeStore.search` was `url LIKE ? OR title LIKE ? OR tag_key LIKE ?`, and SQLite's
        LIKE folds ASCII only: "İSTANBUL Gezisi" was unreachable by typing `istanbul`, "ISPARTA" by
        typing `ısparta`, "Şişli" by typing `sisli`. Not an error — an empty result list, which a user
        reads as "you have no such bookmark"._
        — _**Why it survived a fix that was already made.** The manager filters the loaded tree in the
        RENDERER with `foldForSearch`, and that surface has had a Turkish test since it was fixed. The
        visible search worked, so nobody suspected the store under it. The same defect had already been
        found and fixed for history in migration 16 — fixing one instance of a class and leaving the
        other is exactly how a bug comes back, and this is the other one._
        — _**Migration 17**, mirroring 16 exactly: `title_fold`/`url_fold` on `bookmark_nodes`,
        `tag_fold` on `bookmark_tags`, folded in the WRITER with the product's one search rule
        (`foldForSearch`), never SQLite `LOWER()`. `BookmarkTreeStore.reindexFoldsIfStale` backfills
        rows written before it and re-folds after a `BOOKMARK_FOLD_VERSION` bump — one code path for
        both, called at startup beside the history one, off the launch critical path._
        — _**`tag_fold` sits BESIDE `tag_key`, and replacing it would have been a bug.** `tag_key` is
        IDENTITY — it decides whether "Work" and "work" are one tag — and it must not strip accents, or
        "is" and "iş" would silently become the same tag. `tag_fold` is SEARCH, where collapsing them is
        precisely what the searcher wants. Pinned by a test that tags one bookmark both `İŞ` and `is`,
        asserts it still has two tags, and asserts either query finds it._
        — _9 tests; the fold runs before the `LIKE` escaping, so `%` and `_` are still literal text._
- [x] **Import from Chrome/Firefox** — parse their exported Netscape-format HTML bookmarks (+ optional
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
  - [x] **Profile auto-detect.** ~~Does not exist; marked optional, left open honestly rather than
        ticked.~~ _Built 2026-09-02, so the parenthesis in the line above is now earned rather than
        excused. The friction it removes is the whole point: importing used to begin with "first, go
        and export a file from the browser you are trying to leave", which is a chore placed exactly
        where a person is most likely to abandon the switch._
        — _**Two new readers, because an exported file and a live profile are not the same artifact.**
        `bookmark-import-chromium.ts` reads Chromium's own `Bookmarks` JSON (Chrome/Edge/Brave) and
        `bookmark-import-firefox.ts` turns `places.sqlite` rows into the same tree. Both feed
        `writeParsedBookmarksToStore`, extracted from the HTML path so the boundary `safeParse`, the
        scheme gate, the duplicate skip and the create-the-root-only-if-something-is-written rule
        cannot drift apart per source — which is how a second import path normally ends up with weaker
        checks than the first._
        — _**What each reader had to know.** Chromium: all three roots including `synced` (mobile),
        because dropping it would be a silent partial import; no favicons, because they live in a
        separate database and null is the honest answer. Firefox: skip the tags root (its children are
        pointers to bookmarks that already appear under the real roots, so importing it hands the user
        one copy per tag), skip separators and `place:` saved queries, order by `position`, and carry a
        visited set — `parent` is just an integer and a damaged profile can point a folder at its own
        descendant._
        — _**Firefox is read through a copy, never in place.** The live file is locked while Firefox
        runs — exactly when someone is most likely to be importing — and opening a SQLite file WRITES
        to it. A browser that quietly wrote into another browser's profile while "reading" it would
        deserve the complaint. The `-wal`/`-shm` sidecars are copied too, because in WAL mode the
        newest commits live there and a copy without them is a silently stale profile._
        — _**The renderer never sees a path.** Detection returns records carrying an opaque id (a
        truncated SHA-256 of the path); the renderer picks one by id and main resolves it by running
        detection again. So the untrusted side cannot name a file for the trusted side to open — the
        readable set is fixed by the detector, not by the payload — and the chrome never holds a string
        with the user's account name in it. The node-touching modules sit behind a
        `@tepegoz/bookmarks/profiles` entry because the renderer imports the package index at runtime
        and must not pull `node:fs` into its bundle._
        — _**Found by its own test:** a file that is not a database left `openDatabase` throwing
        part-way through construction, the handle unreachable and unclosed, the Windows scratch copy
        undeletable — and the cleanup then threw out of a function whose entire contract is to return
        null. Fixed at the cause (check the SQLite header before copying anything), with a silent
        best-effort cleanup behind it._
        — _**The UI is honest about when it reads.** Detection runs when the import step is opened, not
        at mount: a first-run window that scanned the disk before the user had said they wanted to
        import anything would be doing it behind their back. No profiles found renders no box at all,
        and every row's accessible name carries the profile it imports — a list of identically-named
        "Import" buttons is one of the oldest ways to make a screen reader useless. The onboarding
        hint that read "direct profile scanning is not used in this version" was rewritten in en+tr,
        because it had become false._
        — _39 tests (29 in `@tepegoz/bookmarks`, 5 new onboarding UI, plus the existing suites), repo
        typecheck + lint + 93 test tasks green._

### L8/L9 — Private / disposable / guest mode

- [x] Ephemeral **non-persisted session** (in-memory partition, no `persist:` prefix) on top of the existing
      partition machinery; a "private / agent-only" window chrome badge
  - [x] _**The missing `persist:` prefix is the whole feature**: Electron persists a partition to disk if
        and only if the name starts with it, so "leaves nothing" is enforced by Electron rather than by
        this app remembering to clean up. Asserted as a property of every name `privatePartitionKey` can
        produce, not as a spot check on one string._
  - [x] _**One partition for the whole run, shared by every private window** (Chrome's model): a link
        opened from one private window into another belongs to the same throwaway identity, and
        per-window partitions would sign the user out every time they opened a second window. So the
        discard waits for the LAST private window to close, not the first._
  - [x] _**Tunnels still apply.** A private tab on a profile whose General binding is Tor or a VPN lands
        on `tepegoz-private--conn-{id}`, through a provider installed by the binding layer exactly like
        `setNewTabSessionProvider`. Ignoring the route would have sent private traffic out over the clear
        path — the precise failure that provider exists to prevent, at its worst in the mode whose entire
        promise is privacy._
  - [x] _**Private sessions go through the same attacher plane** as every other browsing session. One
        that skipped it would have no ad/tracker filtering, no download quarantine and no User-Agent
        override: a privacy regression inside the privacy feature._
- [x] Leaves **nothing on close** (cookies/storage/cache/history discarded); **sensitive-site lockout still
      applies**; clearly distinct from Phase 3 multi-profile (this is throwaway, not a named identity)
  - [x] _**Three stores, and the partition only covers one of them.** Cookies/cache/site storage are
        handled by the in-memory partition. **Browsing history** is a separate SQLite store the tab model
        writes on every navigation — guarded at the WRITE, because record-then-delete leaves the row on
        disk in between and a crash in between leaves it there for good. **The session snapshot** is a
        third store, and the worst of the three: it would have put every private URL into SQLite and then
        REOPENED those tabs at the next launch, in an ordinary window. Each is asserted separately, from
        the real database file, after the app has closed._
  - [x] _**Discarding forgets the session object, not just its contents.** A retained `Session` keeps its
        in-memory jar alive, so the next private window would resume the previous identity — the one
        thing a disposable mode may never do._
  - [x] _**Sensitive-site lockout holds by construction**: `isSensitiveSite` takes a URL and nothing else
        — no session, no partition, no window — so there is no private-mode input for it to be routed
        around. Asserted as that property (including its arity), not assumed._
- [x] **The private-mode surface must say what it does not do.** A separate partition discards local
      state; it does **not** separate identity — the device, GPU, screen, fonts, installed-extension
      signature and network address are unchanged, so a site that fingerprints can link the private
      window to the ordinary one. Every mainstream browser has been criticized for letting its private
      mode imply otherwise; the badge and the new-window copy state the real scope in one sentence.
      Source: [`../../docs/research/research-cross-profile-tracking.md`](../../docs/research/research-cross-profile-tracking.md)
      — the same limit applies to named profiles in [Phase 3](phase-3-backend-cloud-extensions.md)
  - [x] _Built as `PrivateBadge`: a badge in the chrome, and a panel that states the LIMIT before the
        reassurance — "this does not make you anonymous; your device, screen, fonts and network address
        are unchanged" — then lists both halves side by side, what is discarded and what is not hidden.
        The ordering is the point: every mainstream browser earned this criticism by opening with what it
        discards and leaving the reader to infer the rest. It is a disclosure, not a warning — the mode
        is useful and the copy does not scold anyone for using it; it just refuses to be read as more
        than it is. en+tr. The e2e finds the private window BY this badge, so the disclosure rendering is
        load-bearing for the spec rather than merely present._

### L5/L8 — Permissions Center

- [x] **Web permissions UI** (camera/mic/location/notification/clipboard): per-site grant/deny/ask, all routed
      through the **single Policy/PermissionGuard** (same engine as Phase 2 `PopupAndPermissionGuard` + the
      Phase 1a notification permission-broker) — **no parallel permission flow**
  - [x] _**Brokering camera/mic/location is not a weakening of deny-by-default; it IS deny-by-default.**
        No site receives any of them without an explicit per-origin answer, and everything outside the
        capability union is still refused with no way to ask. What changed is that "ask" became
        reachable where it used to be a flat refusal. `security.test.ts` checks both halves rather than
        asserting them — it enumerates Electron's entire permission union and proves the complement is
        denied without the broker ever being consulted._
  - [x] _**`getUserMedia` arrives as ONE `media` request carrying `mediaTypes`**, which is why the
        mapping returns a LIST. Mapping it to a single capability would have meant a site granted the
        microphone silently receiving the camera too. Both grants are required, asked in sequence, and
        the sequence stops at the first refusal — a user who declines the camera is not then asked for
        the microphone for a call that is already not happening. A `media` request naming no media type
        at all is refused: there is no grant that could honestly cover it._
  - [x] _**`display-capture` stays outside the union deliberately**, and the UI says so rather than
        leaving it silently absent from a list of everything else. Unlike a camera, one mistaken
        "allow" there hands over every other window on the screen, including ones this browser does not
        own. Asserted by a test of its own._
  - [x] _**One write path.** Site permissions are ordinary preferences and go through the already
        validated preferences boundary — a second IPC channel to the same store would be a second thing
        to keep in agreement with it. A first draft added one; it was removed rather than left in._
  - [x] _`prompt` is used as the real stored "ask every time" state it has always been in
        `SITE_PERMISSION_STATES`, which distinguishes "never been asked about this site" (no entry)
        from "I decided I want to be asked". An earlier comment here claimed ask was merely the absence
        of a decision; that was wrong about this codebase and is corrected._
  - [x] _Consent-prompt copy per capability, en+tr, as an exhaustive `Record` — adding a capability to
        the union without giving it words is now a type error rather than a prompt that says "wants to
        show notifications" while asking for the camera._
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
  - [ ] **Still open, and still not resolved either way** (this UI now exists, and this did not become
        part of it — `fileSystem` remains refused by the handler, which is the half that is ours): the
        File System Access API
        (`showOpenFilePicker`/`showDirectoryPicker`) is present in browsed pages and does not reject —
        Chromium opens the native picker BEFORE requesting the `fileSystem` permission. Our half is
        covered (`fileSystem` is refused by the handler, asserted). What a page holds after a user picks
        a file could not be measured here: it needs a file chosen out of an OS dialog, which no
        automated run can drive. Belongs in this UI's scope when it is built — file access is a
        permission of at least the weight of the four this line already names, and it is not among them.
- [x] **Per-agent permission matrix** (allowed / requires-approval / denied) rendered as a **read-only view**
      over the Policy Kernel + Capability Plane audit — a UI surface, **not** a new decision engine
  - [x] _Every row is a real `PolicyKernel.evaluate` call on a registered `CapabilityRegistry`
        descriptor. Assembling it from a second copy of the rules would have been a second opinion, and
        the first time the two disagreed the user would be reading a UI that confidently contradicted
        what was actually in force. A test asserts the view reports whatever the kernel says —
        **including a verdict this module knows nothing about** — which is the property that keeps it a
        view rather than an engine._
  - [x] _Evaluated at the **baseline**: untainted arguments, no target URL. Taint and the sensitive-site
        lockout can only tighten a verdict, so this is the most permissive answer the kernel gives and
        therefore the honest ceiling to display. The subtitle says so on screen — showing a best case as
        if it were the only case is the kind of reassurance this repo keeps refusing to write._
  - [x] _Read-only with no control at all, and the panel says **why**: an editable copy here would be
        the parallel permission flow the line above forbids. A read-only table with no explanation
        reads like a broken one._
- [ ] **The content-permission grid beyond the five brokered capabilities.** `main/security.ts`
      default-denies USB / Serial / HID / Bluetooth / MIDI, autoplay, per-site JavaScript+images,
      protocol handlers, sensors, idle detection, window management, local fonts, background sync, FedCM,
      automatic downloads, and per-site PDF "open vs download" — all asserted denied by `security.test.ts`,
      none grantable from a UI. Chrome's `chrome://settings/content` exposes every one with a per-site
      exception list + a global default, plus a single "reset all permissions for this site". This is the
      Permissions Center's unbuilt tail — scoped, not scheduled, in
      [`../tracks/browser-settings-feature-gap.md`](../../docs/tracks/browser-settings-feature-gap.md) §14.

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

- [~] Extend the existing deterministic prefix engine (`tab:`/`history:`/`bookmark:` from Phase 1a) with
  **`@`-scoped commands**: `@agent <task>` (start an agent thread — the one place the omnibox crosses into
  AI), ~~`@workspace <name>`~~, `@download <query>`, `@skill <name>`; bridge to the command palette
  - [x] _**The deterministic-address-bar rule, restated precisely rather than broken.**
        `omnibox-suggest.ts` has always said the address bar "must NEVER start an AI thread (Comet
        lesson)", and that rule stands. What Comet got wrong was **implicit** routing: ordinary typed
        text silently becoming a model prompt, so a user could not tell which of the two they were
        doing. `@agent` is the opposite — a prefix typed on purpose, never inferred, and non-`@` input
        keeps the exact deterministic navigate/search behaviour it had. One explicit door is not the
        same thing as a missing wall. Five tests assert that text which LOOKS like a request ("book me
        a flight to Rome", "summarise this page", "what is the capital of France?") produces no agent
        action at all._
  - [x] _**No fuzzy matching, and no navigate action anywhere in command mode.** `@agnt` is not
        `@agent` — a command mode that guessed would be the implicit routing the rule forbids. And a
        stray Enter inside `@…` cannot open a page or run a web search, asserted across every command
        state. A command that finds nothing SAYS so rather than falling back to the ordinary list,
        which would have turned "@download tax return" into a web search for it._
  - [x] _**A prefix only fires when followed by a space or end-of-input**, so typing toward a longer
        command cannot trigger a shorter one mid-keystroke (`@agents` is not `@agent` + "s")._
  - [x] _**`@agent` and `@skill` route somewhere the user can SEE**: ensure a group, **open its Agent
        Console**, then start the run. Firing a run without opening the console would hand a task to
        something invisible — the user types a sentence and watches nothing happen, which is a worse
        failure than not having the command. `@skill` runs the skill's own stored PROMPT, never the
        name the dropdown displayed, which would quietly turn "run my saved skill" into "ask the agent
        about a word"._
  - [x] _**A bare `@` shows the command menu.** Without it the mode is invisible; picking an entry
        FILLS the box rather than running anything, so discovery can never itself be an action._
  - [ ] _`@workspace` — no surface to route to (see the DoD line above)._
  - [ ] _Bridge to the command palette not built. The palette exists (`Ctrl+K`) and command mode does
        not hand off to it; the four commands are self-contained today._
- [x] `@`-command hints + results localized; non-`@` input keeps the deterministic navigate/search behavior
  - [x] _en+tr for every hint, description and empty state. `omniboxAgentHint` says out loud what Enter
        will do — "hands this text to the agent, leaves the deterministic address bar" — because being
        told is the difference between an explicit door and a hidden one._

### Cross-cutting (as in every phase)

- [ ] i18n en+tr for all new surfaces (download manager, find-bar, print/PDF/reader/translate, bookmark
      manager + Chrome/Firefox import, private-mode chrome, Permissions Center, auth/cert/beforeunload
      dialogs, spellcheck toggle, omnibox command hints); zod `safeParse` at every
      IPC / download-metadata / bookmark-import trust boundary; AppError contract; renderer-untrusted security;
      DoD coverage gate; **NO AI attribution trailer** in commits/PRs
