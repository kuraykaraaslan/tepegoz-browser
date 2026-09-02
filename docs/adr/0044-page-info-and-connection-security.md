# ADR-0044: Site Info bubble & connection-security surface — a `PageSecurityLevel` taxonomy, an observe-only certificate recorder, and no parallel permission flow

- **Status:** Accepted (shipped: the `PageSecurityLevel` classifier in `@tepegoz/shared-types`, the
  `setCertificateVerifyProc` recorder on browsing sessions, the `page-info:get` IPC + `activeSecurityLevel`
  on `TabsState`, the leading omnibox site-info control in `@tepegoz/omnibox`, and the native `site-info`
  popup surface — all unit-tested)
- **Date:** 2026-09-01
- **Refines:** [ADR-0016](0016-per-package-i18n.md) (the bubble's strings live in the app-chrome
  dictionary, not a new leaf) · **accounts to** [ADR-0009](0009-boundary-mapping.md) (the new IPC handler
  never throws for an odd URL) · **relates to** the Permissions Center (Phase 2c) — the bubble edits the
  _same_ `sitePermissions` preference, it is not a second store
- **Phase:** [Phase 2c — Classic Browser Essentials](../../phases/product/phase-2c-classic-browser-essentials.md), L0/L1

## Context

Clicking the affordance at the start of Chrome's address bar opens a **Page Info bubble**: connection
security (secure / **Not secure** for `http://` / Dangerous), a certificate viewer, "N cookies in
use" with a clear action, and the site's permissions as inline Allow/Block/Ask controls. This browser
had none of it. `@tepegoz/omnibox` rendered a bare `<input>` with no leading affordance, nothing
classified a page's transport security, `TabInfo`/`TabsState` carried no security state, and the
per-origin grants `WebPermissionBroker` already stores were visible only in Settings.

Two problems needed a decision rather than just code:

1. **There is no Electron API for a loaded page's certificate.** `webContents` exposes none;
   `app.on('certificate-error')` only fires on failure. Showing a certificate viewer requires
   observing TLS verification itself.
2. **Editing permissions from the bubble** must not become a second decision engine sitting next to
   the Permissions Center and the broker.

## Decision

### 1. A coarse `PageSecurityLevel`, classified from the URL

`@tepegoz/shared-types/page-info.ts` owns `PageSecurityLevel` —
`'secure' | 'not-secure' | 'dangerous' | 'internal' | 'file' | 'unknown'` — and a pure
`classifyPageSecurity(url, { certErrorCode?, proceededPastCertError? })`:

- `tepegoz:` / `chrome:` / `about:` / `devtools:` → `internal`; `file:` / `view-source:` → `file`;
- `https:` → `secure`, or `dangerous` when a certificate error was recorded for the host **or** the
  user clicked through a warning for the origin this run;
- `http:` → `not-secure` — **including `http://localhost`**. A local dev server is still plaintext,
  and the screenshots this was built from show `localhost:3000` marked "not secure". This is a
  deliberate call against the "localhost is a secure context" framing: secure-context is about what
  web APIs a page may call, not about whether the bytes on the wire are protected.
- anything else → `unknown`, and the omnibox control is hidden.

The cheap verdict rides `TabsState.activeSecurityLevel` (already the push channel) so the omnibox
glyph renders synchronously. Everything expensive is pulled on demand (§3).

### 2. The certificate recorder observes; it never decides

`apps/desktop/src/main/network/certificate-recorder.electron.ts` registers a
`session.setCertificateVerifyProc` on every browsing session (via `BrowsingSessions.register`, as a
**non-critical** attacher). The proc records `request.certificate` (+ its `.issuerCert` chain),
`verificationResult` and `errorCode` in a bounded LRU keyed by hostname (cap 256), then calls
**`callback(-3)` unconditionally** — "use Chromium's own verdict".

`callback(-3)` is the whole safety argument: returning `0` (accept) here would trust every
certificate on the machine. The module has **no `callback` call site that passes anything else**, and
a test asserts the proc returns `-3` for both a clean and a failed handshake. Chromium's own
`certificate-error` path still fires for a genuinely bad certificate exactly as before — the recorder
is a passive tap.

Risks accepted and recorded here: only one verify proc may be set per session, so this module now
**owns** that hook for browsing sessions (nothing else set one); a buggy recorder that threw would,
because it is non-critical, simply leave the bubble with no certificate to show, not break page
loads.

### 3. `page-info:get` — assembled on demand, never throws

A new `page-info:get` IPC handler (`ipc-page-info.ts`) builds the full `PageInfo`: origin/host/scheme,
`level` (from `classifyPageSecurity` + the recorded error + the cert-error broker's session
exceptions), the flattened certificate + chain, a cookie count summed across every browsing partition
(mirroring `ipc-site-data.ts`'s probe), the permission rows worth showing (see the 2026-09-02
amendment; originally the full brokered map), and the standing trust level for the host. An unparseable string, an internal page or a
`file://` resource resolves to a null-heavy `PageInfo` — the bubble shows a short "local page" note,
it is not an error (ADR-0009: services throw, but "the user opened the info bubble on a settings page"
is a real answer, not a fault). Main resolves the URL from the **sender window's active tab**, never
from a renderer-supplied string — the renderer does not get to say which origin's cookies and
permissions to reveal.

### 4. The bubble edits the existing permission store — no parallel flow

The `site-info` popup surface writes permission changes through the same
`updatePreferences({ sitePermissions })` path the Permissions Center uses; `WebPermissionBroker`
already reads `PreferenceStore.getAll().sitePermissions`. "Reset permissions" deletes the origin key.
"Clear site data" reuses `clearSiteData` (Phase 2). Permission labels and state names are reused from
`@tepegoz/settings-ui`'s `permissionsCenter` dictionary. There is no new permission model, no new
broker, and no second source of truth.

### 5. Strings live in the app-chrome dictionary

The bubble is app chrome, like the main menu — so `browser.siteInfo` (the omnibox labels) and the
top-level `siteInfo` namespace (the popup body) live in `apps/desktop/src/i18n/{en,tr}.ts`, not in a
new leaf package (ADR-0016: only genuinely shared core strings leave the app, and a bubble opened
from the app's own chrome is not that).

## Consequences

- The address bar now has a leading control across three packages (`@tepegoz/omnibox` renders it;
  `@tepegoz/nav-toolbar` and `@tepegoz/browser-chrome` thread the props). It is absolutely positioned
  over the input's left padding so the input keeps its own border and focus ring — the omnibox focus
  ring must not move to a wrapper.
- `http://` pages now read as a warning (red glyph + "Not secure" text), which is a visible behaviour
  change for anyone running local dev servers. This is intended.
- The certificate viewer shows issuer / validity / fingerprint / chain but **no subjectAltNames** —
  Electron's `Certificate` does not carry them. The schema field is kept for a later PEM parse; the
  bubble omits the row when it is empty.
- One `setCertificateVerifyProc` per session is now spent. A future feature that needs its own must
  compose with this recorder rather than replace it.

## Amendment (2026-09-02) — the bubble is a stack of panes, and it lists only relevant permissions

Accepted. Three corrections to what shipped, all of them about what the panel SAYS rather than what it
is allowed to do. The trust boundaries, the on-demand assembly and the single permission store are
unchanged.

### 1. Permissions are listed only where there is something to say

`permissionsFor(origin)` no longer returns all six brokered capabilities. It returns the ones this
origin **asked for this run**, plus the ones the user **already decided** (an explicit `prompt`
included, so a row does not vanish under the cursor when it is set back to "Ask"). A site that never
wanted the camera does not get a camera row: six always-present dropdowns are noise, and the noise was
crowding out the two lines — connection and cookies — the panel exists to show. Everything omitted is
still reachable from Site settings, which is where standing decisions belong.

"Asked for this run" is recorded by `WebPermissionBroker.request` in a module-level map keyed by
origin, before every short-circuit — a request answered from a stored grant, or refused because
notifications are off globally, is exactly the one a user may want to revisit. It is deliberately
**in memory**: "has this site ever asked" is not a user decision, and persisting it would grow a
second, quieter history of every origin's capability probes. A fresh run starts from the stored
decisions alone.

### 2. Three panes, walked with a back arrow — not one scrolling wall

The bubble is now Chrome's shape: a short row list (connection · cookies · Site settings), where
"Connection is secure" drills into a **Security** pane (icon, verdict, the explanatory body, and a
"Certificate is valid / is not valid" row) and that drills into the **Certificate** viewer, laid out
like Chrome's General tab — Issued to / Issued by / Validity period / SHA-256 / Also covers /
Certification path. Each pane carries a back arrow, the pane title, and the host beneath it. The
`ResizeObserver` that sizes the native popup window already covers the height change, because the
observed element stays mounted across a pane swap.

### 3. The address bar's left padding is measured, not guessed

The original consequence — "absolutely positioned over the input's left padding" — stands, but the
padding was two fixed classes: `pl-9` for the glyph and `pl-[6.5rem]` for the glyph plus the alarm
word. `pl-9` left ~2px between the lock's hover pill and the text, so the pill sat on the `h` of
`https://`; `pl-[6.5rem]` was sized for the English "Not secure" and is overrun by the Turkish
"Güvenli değil" — a hardcoded width for a localized string is a bug in every locale but one. The
omnibox now measures the control (a `ResizeObserver`, so a late webfont or a changed word re-measures)
and sets `paddingLeft` from it. The control keeps its absolute position; the focus ring still belongs
to the input alone.
