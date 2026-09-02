# Track — Browser settings feature gap (Chrome / Brave / Safari / Firefox parity)

- **Status:** 📋 **Proposed — not scheduled, no owner sign-off.** This is a captured gap list, not a
  plan of record. A row earns a place on the roadmap by being promoted into a `phase-*.md` file or an
  ADR; until then it is a written observation with a date on it.
- **Origin:** a 2026-09-01 sweep of every `tepegoz://settings` screen and `preferences.model.ts`
  against Chrome, Brave, Safari and Firefox. The sweep **excluded** what Tepegöz already ships
  elsewhere: page translation, spellcheck/typo, the unified video player and the User-Agent switcher
  (all extension surfaces), and the **Site Info bubble** ([ADR-0044](../../docs/adr/0044-page-info-and-connection-security.md),
  Phase 2c). What remains below is the set with **no phase and no track** covering it.
- **Sibling track (different problem):** `settings-competitive-parity.md` — a 2026-08-28 audit that
  lives on branch `feat/settings-parity-honesty-wiring` and is **not merged here** — covers controls
  that are **built, persisted, and read by nothing**. That track is "wire what exists". This one is
  "what was never built". They do not overlap.
- **Owner decisions owed** (none are mine to take):
  1. Which of these become numbered-phase rows, which fold into an existing phase (2c / 3 / 5 / 8 /
     10b), and which stay here unscheduled.
  2. **Sync + account** (§10) is the largest single item and gates §9 autofill and §11 profiles being
     genuinely useful — it needs its own ADR before any row under it is actionable.
  3. **Live query suggestions** (§4) is a deliberate omission today (the omnibox is injected-source
     and deterministic — the "Comet lesson"). Reversing that is a decision, not a gap to close by
     default.

## Why

A user compares a new browser against Chrome within the first few screens of Settings. Tepegöz is
ahead on some axes a rival has nothing for (per-tab VPN, the agent, local-first everything) and behind
on a long tail of small, expected toggles — fonts, "restore previous session", a preferred-languages
list, the content-permission grid beyond camera/mic/geo. None of these are architecturally hard; they
were simply never written, and they are scattered across enough categories that dropping them into one
phase's DoD would misrepresent that phase's status. Hence one list, here.

Legend: **C** Chrome · **B** Brave · **S** Safari · **F** Firefox · _all_ = all four.
"Today" = the nearest existing Tepegöz behaviour. "Home" = where the row would land if promoted.

---

## 1. Startup / session

| Gap                                                                                                                         | Ships in | Today                                                                                        | Home |
| --------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------- | ---- |
| **"On startup: open the New Tab page / continue where you left off / open a specific set of pages"** — the three-way choice | all      | Tepegöz always restores tabs; no toggle. `startupMode` only selects window/background/kiosk. | 2b   |
| Open **several specific pages** at startup ("use current pages")                                                            | C/B/F    | single `homepageUrl`                                                                         | 2b   |
| **Warn before closing a window with multiple tabs**                                                                         | all      | no prompt                                                                                    | 2c   |
| Warn when opening many tabs at once                                                                                         | F        | —                                                                                            | 2c   |

## 2. Tabs / windows

| Gap                                                             | Ships in | Today                                                                                      | Home            |
| --------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------ | --------------- |
| "Open links in a new **tab** instead of a new window"           | F/S      | —                                                                                          | 2b              |
| "When I open a link in a new tab, **switch to it immediately**" | F/S      | —                                                                                          | 2b              |
| Ctrl+Tab cycles tabs in **most-recently-used** order            | F        | positional                                                                                 | 2b              |
| Tab **hover preview / thumbnail cards**                         | C/F      | —                                                                                          | 2b              |
| **Saved / named tab groups** management surface                 | C/S/F    | groups exist ([ADR-0020](../../docs/adr/0020-tab-boundary-model.md)); no settings for them | 2b (workspaces) |

## 3. Appearance / toolbar / fonts

| Gap                                                                                                                          | Ships in        | Today                              | Home                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------- | --------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Font customization** — standard / serif / sans-serif / fixed-width family + size + **minimum font size** + per-script font | all             | **nothing**                        | [developer-settings-surface](developer-settings-surface.md) plans the _engine-level_ keys; a polished user panel has no home |
| "Allow pages to choose their own fonts"                                                                                      | F               | always on                          | as above                                                                                                                     |
| **Page colours / high-contrast override**, custom text / background / link colour                                            | F               | —                                  | 10b                                                                                                                          |
| **Density**: compact / normal / touch                                                                                        | F               | fixed                              | 10b                                                                                                                          |
| **Toolbar customization** — add / remove / reorder buttons                                                                   | F (C/S limited) | fixed                              | none                                                                                                                         |
| "**Show Home button**" toggle                                                                                                | C/B/F           | —                                  | 2b                                                                                                                           |
| Bookmarks bar "**only on the New Tab page**" option                                                                          | C/F             | on/off only                        | 2c (Bookmarks 2.0)                                                                                                           |
| Address bar "**show full URL**" toggle                                                                                       | C/S             | always elided/!elided fixed        | [omnibox-competitive-parity](../parities/omnibox-competitive-parity.md)                                                      |
| **Theme gallery / installable themes**                                                                                       | C/B/F           | colour presets only                | none                                                                                                                         |
| "**Zoom text only**" mode                                                                                                    | F               | full-page zoom only                | 2c                                                                                                                           |
| **Site-specific zoom list** management UI                                                                                    | C/F             | `siteZoomFactors` persisted, no UI | 2c                                                                                                                           |

## 4. Search / address bar

| Gap                                                                                   | Ships in     | Today                                                           | Home                                                                           |
| ------------------------------------------------------------------------------------- | ------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **Live query suggestions from the search engine** (toggle)                            | all          | deliberately absent — omnibox is deterministic, injected-source | owner decision (see above)                                                     |
| Search-engine **keyword / shortcut** + "**@site** to search within a site"            | C/B/F        | custom engines have no keyword                                  | [omnibox-competitive-parity](../parities/omnibox-competitive-parity.md) Tier E |
| **Separate search engine for private windows**                                        | B/F          | shared                                                          | 2c (private mode)                                                              |
| Address-bar content switches: history / bookmarks / open tabs / shortcuts / clipboard | F (detailed) | fixed source set                                                | [omnibox-competitive-parity](../parities/omnibox-competitive-parity.md)        |

## 5. Privacy / tracking protection

| Gap                                                                                                                                               | Ships in                      | Today                          | Home                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------ | --------------------------------- |
| **Third-party cookie** policy (block all / block in private / allow) + per-site exceptions                                                        | all                           | "forget this site" only        | 2 (needs ADR)                     |
| "**Delete cookies and site data when all windows are closed**" + exception list                                                                   | C/B/F                         | —                              | 2                                 |
| **Tracking-protection levels** (Standard / Strict / Custom): trackers, cross-site cookies, **cryptominers**, **fingerprinters**, tracking content | F, B (Shields)                | `adblock` is on/off + cosmetic | 2                                 |
| **Per-site Shields / protection panel**                                                                                                           | B/F                           | —                              | 2 (or fold into Site Info bubble) |
| "Send a **Do Not Track** request"                                                                                                                 | C/F/B                         | —                              | 2                                 |
| **Global Privacy Control**                                                                                                                        | F/B                           | —                              | 2                                 |
| **Fingerprint protection / randomization**                                                                                                        | B; F (`resistFingerprinting`) | —                              | 2 (needs ADR)                     |
| "**Hide my IP address from trackers**"                                                                                                            | S/B                           | —                              | 5 (network privacy)               |
| Bounce-tracking / redirect-tracking protection                                                                                                    | F                             | —                              | 2                                 |

## 6. Clearing browsing data

| Gap                                                                                                                                       | Ships in | Today                                                             | Home |
| ----------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------- | ---- |
| ~~**Unified "Clear browsing data" dialog with a time range** (last hour / 24 h / 7 days / 4 weeks / all time)~~ **Built 2026-09-02**                                    | all      | Settings → Privacy, one dialog                                                     | 2c ✅ |
| ~~One place with the full category list~~ **Built 2026-09-02** — history, downloads, cookies/site data, cache, agent conversations. Passwords deliberately excluded (see the phase note); form data / site settings / hosted-app data are not stored separately yet | C/B/F    | one place                                                                          | 2c ✅ |
| **On-exit category-based clearing**                                                                                                       | B/F      | —                                                                 | 2c   |

## 7. Security

| Gap                                                                                     | Ships in   | Today                                                                                                                   | Home                          |
| --------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| **Secure DNS / DNS-over-HTTPS** + provider / custom-resolver choice                     | C/B/F/Edge | **none** (only noted as a process-wide leak residual in [phase-5](../../phases/product/phase-5-vpn-network-privacy.md)) | 5, promoted to a user feature |
| **HTTPS-Only mode / "Always use secure connections"** + HTTP warning                    | C/B/F      | tunnel-scoped only, planned                                                                                             | 5 (global)                    |
| **Safe Browsing levels** (Standard / Enhanced / Off) + "warn about dangerous downloads" | C/F        | `safeBrowsingEnabled` on/off; Settings panel WIP on this branch                                                         | 2                             |
| **Certificate store management** (view / import certs, PKCS#11 security devices)        | C/F/S      | session-only client-cert picker; no manager                                                                             | 2c or 4                       |
| "**Play DRM content**" / Widevine, "protected content identifiers"                      | F; C/B     | none — Phase E parks EME, demand-gated                                                                                  | Phase E                       |
| Encrypted Client Hello (ECH)                                                            | F          | —                                                                                                                       | 5                             |
| "**Require Touch ID / Windows Hello to view a private window**"                         | S/C        | —                                                                                                                       | 2c / 10b                      |
| **Biometric / screen-lock gate when autofilling a password**                            | C/B/S      | —                                                                                                                       | 2 (password manager)          |
| Confirm on quit (Cmd-Q)                                                                 | S          | —                                                                                                                       | 10b                           |

## 8. Passwords & passkeys

| Gap                                                       | Ships in | Today                                       | Home               |
| --------------------------------------------------------- | -------- | ------------------------------------------- | ------------------ |
| "**Offer to save passwords**" toggle                      | all      | —                                           | 2                  |
| "**Auto sign-in** / automatically fill sign-in details"   | C/B/F    | —                                           | 2                  |
| **Compromised / leaked password warning**                 | all      | "coming soon" in the UI, no phase behind it | 2                  |
| **Strong password generator**                             | all      | —                                           | 2                  |
| **Master password**                                       | F        | —                                           | 2 (needs decision) |
| **Passkey management** (list / delete / sync)             | all      | **none**                                    | 2                  |
| **TOTP / verification-code** storage                      | S        | —                                           | 4                  |
| Per-site "never save" exceptions                          | C/B/F    | —                                           | 2                  |
| **Direct password import from another browser** (not CSV) | C/B/F    | CSV import only                             | 2                  |
| On-device encryption / sync passphrase for passwords      | C        | —                                           | 3 (sync)           |

## 9. Autofill (addresses / payments)

| Gap                                                                 | Ships in | Today                                       | Home             |
| ------------------------------------------------------------------- | -------- | ------------------------------------------- | ---------------- |
| **Addresses / contact info** save-and-fill                          | all      | "coming soon" in the UI, no phase behind it | 3 (or new phase) |
| **Payment methods / cards** save-and-fill + CVC + mandatory re-auth | all      | "coming soon"                               | 3                |
| "Allow sites to check if you have payment methods saved"            | C        | —                                           | 3                |

## 10. Sync & account

| Gap                                                                                                                  | Ships in | Today               | Home |
| -------------------------------------------------------------------------------------------------------------------- | -------- | ------------------- | ---- |
| **Sign in with an account** (C Google · F Mozilla · S iCloud · B Sync chain)                                         | —        | **entirely absent** | 3    |
| **Choose what to sync**: bookmarks, history, open tabs, passwords, addresses, payments, settings, themes, extensions | C/B/F    | —                   | 3    |
| **Sync encryption passphrase**                                                                                       | C/F      | —                   | 3    |
| "**Tabs from other devices**" / send-tab-to-device                                                                   | all      | —                   | 3    |
| Device-list management                                                                                               | C/F      | —                   | 3    |

> Phase 3 names E2EE sync of bookmark/password/tab as a goal; the account model, the "choose what to
> sync" surface, and the passphrase are not yet decomposed anywhere. This whole section is blocked on
> owner decision #2.

## 11. Profiles & import

| Gap                                                                                            | Ships in | Today                                                                                                           | Home                  |
| ---------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------- | --------------------- |
| **Multiple profiles** / "Add profile" / guest mode                                             | C/B/S; F | absent in this build (lives on an abandoned branch) — see [multi-profile-isolation](multi-profile-isolation.md) | 3                     |
| Per-profile history / cookies / extensions / favourites / theme                                | S/C      | —                                                                                                               | 3                     |
| **Import bookmarks & settings from another browser** (Chrome / Edge / Firefox / Safari / HTML) | all      | Chrome/Firefox **bookmark** HTML import shipped (Phase 2c); settings/history import not                         | 10 (first-run import) |
| Firefox **Containers** / multi-account containers                                              | F        | tab groups are metadata only                                                                                    | out of scope? (owner) |

## 12. Languages

| Gap                                                                                                                                                | Ships in | Today                                                           | Home                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------- | ------------------------------ |
| **Preferred-languages list** — ordering + "add a language" + "offer to translate pages in this language" (Accept-Language priority)                | C/B/F    | single display language                                         | 8 (or 2c)                      |
| **Enhanced spellcheck** (sends text to Google)                                                                                                     | C        | local-only by design                                            | out of scope (privacy)         |
| Translation: "**always translate this language**", "**never translate this language / site**" list management + **offline language-pack download** | C/F      | translation ships as an extension; no list UI, no pack download | fold into `ext-translate` or 8 |

## 13. Accessibility (the Chrome / Firefox checkbox set)

10b covers Assistive Mode, voice control and family/protected profiles, but **not** this row-by-row set:

| Gap                                                                          | Ships in | Today            | Home |
| ---------------------------------------------------------------------------- | -------- | ---------------- | ---- |
| **Caret browsing** (F7)                                                      | C/F      | —                | 10b  |
| "**Search for text when you start typing**" / find-as-you-type               | F        | —                | 10b  |
| **Live caption**                                                             | C/Edge   | —                | 10b  |
| **Minimum font size** as a user setting                                      | C/F/S    | dev surface only | 10b  |
| "**Highlight each item as I Tab through a page**" / full keyboard navigation | S/F      | —                | 10b  |
| "**Always show scrollbars**"                                                 | F        | —                | 10b  |
| Briefly highlight the focused element                                        | C        | —                | 10b  |
| Automatic image descriptions / alt text                                      | C        | —                | 10b  |
| "Zoom with Ctrl + scroll" toggle                                             | F        | —                | 10b  |

## 14. Site & content permissions (beyond camera / mic / location / notifications / clipboard)

The Permissions Center brokers those five. Everything else in Chrome's `chrome://settings/content`
grid is default-denied in `main/security.ts` with **no per-site UI** — asserted denied by
`security.test.ts`, but a user cannot grant an exception:

- **USB, Serial, HID, Bluetooth, MIDI** per site
- **Autoplay** per site + a global policy (Block audio / Block audio+video / Allow) — dev surface only today
- **JavaScript / Images** per site — dev surface only today
- **Protocol handlers** ("let this site open `mailto:`")
- Motion / orientation sensors, idle detection, window management, local font access, background sync, federated identity (FedCM)
- **Automatic downloads** (multiple files) per site
- **PDF** "open vs download" per site + global
- Insecure content, payment handlers, VR/AR
- A single "**reset all permissions for this site**" action (the Site Info bubble has per-origin reset; a Settings-level list does not exist)

**Home:** 2c (Permissions Center is explicitly the "one place" for web permissions; this is its
unbuilt tail). The File System Access row is already tracked open in phase-2c.

## 15. Downloads & file handling

| Gap                                                                                        | Ships in                                  | Today    | Home |
| ------------------------------------------------------------------------------------------ | ----------------------------------------- | -------- | ---- |
| **File-type / MIME handler actions**: "Open in app / Always ask / Save / Open in browser"  | F ("Applications"); C ("auto-open types") | **none** | 2c   |
| "**Automatically open safe files after downloading**"                                      | S                                         | —        | 2c   |
| Download-history auto-removal policy ("after one day / manually / on successful download") | S                                         | —        | 2c   |
| "**Show downloads when they're done**"                                                     | C                                         | —        | 2c   |

## 16. Performance

| Gap                                                            | Ships in | Today                         | Home                                                      |
| -------------------------------------------------------------- | -------- | ----------------------------- | --------------------------------------------------------- |
| **Page preload / network prediction** toggle                   | C/B/F    | **none**                      | 2b or 5 (interacts with tunnel DNS-prefetch, see phase-5) |
| Content-process limit / "use recommended performance settings" | F        | —                             | 2b                                                        |
| **Energy Saver** / battery-based throttling                    | C/Edge   | partial — `pauseTasksOnSleep` | 2b                                                        |

## 17. Data collection / feedback

- Granular telemetry: technical data, interaction/usage data, **crash reports** (auto-send),
  **studies/experiments** opt-in, "personalized extension suggestions", "improve searches (send
  URLs)" — Tepegöz has one honest `telemetryEnabled` boolean. **Home:** none; a decision about
  whether to add granularity at all.

## 18. Misc

- **"Open system proxy settings"** button — _deliberately rejected_: Tepegöz refuses the OS proxy on
  purpose (per-tab tunnels are the model). Recorded here so it is not re-proposed.
- Chromecast / media casting settings — none. **Home:** none.
- Fast-start / "startup boost" (Edge/B) — none. **Home:** 2b.
- Manage your phone as a security key — none. **Home:** 4.

---

## Explicitly out of scope (do not re-propose)

| Item                                   | Why                                                                                    |
| -------------------------------------- | -------------------------------------------------------------------------------------- |
| Vertical tabs                          | Recorded out of scope in [phase-2b](../../phases/product/phase-2b-daily-driver-ux.md). |
| System proxy settings shortcut         | Tepegöz refuses the OS proxy by design (§18).                                          |
| DRM / Widevine / EME toggle            | Parked in Phase E, demand-gated — not a settings gap.                                  |
| "Enhanced spellcheck" (text to Google) | Violates local-first (§12).                                                            |
| Live search-engine query suggestions   | Deliberate omission (owner decision, §4).                                              |
| Firefox Containers                     | Superseded by the multi-profile model if that lands (§11).                             |
