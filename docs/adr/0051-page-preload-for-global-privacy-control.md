# ADR-0051: A one-line page preload for `navigator.globalPrivacyControl` — main frame only, registered and unregistered with the setting, no IPC from the page

- **Status:** Accepted (shipped 2026-10-10 — `preload/page-gpc.ts`, `network/gpc-preload.electron.ts`, the
  prefs reconciler and `e2e/gpc-property.spec.ts`; accepted by the implementer under the owner's standing
  "you select for best engineering case" for design questions, as a LOCAL commit the owner reviews before any
  push. **Also verified in a packaged build** (`electron-builder --dir`, Electron 44.2.0, preload loaded from
  inside `app.asar`): the page read `gpc: "true"` and `window.tepegoz`, `require` and `process` all
  `undefined`. That check was run by hand over the remote-debugging port, because the packaged app's fuses
  switch off the Node inspector Playwright's Electron launcher needs, so it is not part of the e2e suite.)
  Every number in the table was measured against the shipping app before any code was written.
- **Date:** 2026-10-10
- **Relates to:** [ADR-0012](0012-browser-tab-model.md) (browsed tabs are born with no preload) ·
  [ADR-0026](0026-agent-code-execution.md) (a sandbox is claimed only once measured) ·
  [ADR-0050](0050-https-only-on-tunnel-bound-tabs.md) (the request-time seam this builds beside)

## Context

Global Privacy Control has two halves: the `Sec-GPC: 1` request header and the
`navigator.globalPrivacyControl` property. The header half shipped on 2026-10-09 (`globalPrivacyControl`
preference, on by default, stamped on every browsing request by the web-request multiplexer, e2e-verified).
The property half did not, because it needs script running in the page's world before the page's own
scripts, and browsed tabs deliberately have **no preload** (`tabs-shared.ts`: "the page never reaches the
bridge"). That invariant is load-bearing — `e2e/internal-pages-unreachable.spec.ts` pins it — so adding a
preload is a security decision, not a convenience, and was left for an owner call.

## What was measured

All against the shipping app, page served from loopback, no code in the tree changed:

| Question                                                                                                                   | Result                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Does Chromium expose the property by itself?                                                                               | Absent by default. `--enable-blink-features=GlobalPrivacyControl` adds it, but its value is **`false` even while `Sec-GPC: 1` is sent**, and Electron has no setter. A property that reads `false` is worse than an absent one. **Rejected.** |
| Does a `session.registerPreloadScript({type:'frame'})` calling `webFrame.executeJavaScript` define it before page scripts? | **Yes** for the main frame: the page's first inline script reads `true`.                                                                                                                                                                      |
| Does the page gain any reach into the app through that preload?                                                            | **No.** In the page, `window.tepegoz`, `require` and `process` are all `undefined`; only the preload's own isolated world holds `electron`.                                                                                                   |
| Do subframes get it (`<iframe src>` cross-document, `srcdoc`)?                                                             | **No** — both read `undefined`.                                                                                                                                                                                                               |
| Do workers get it?                                                                                                         | **No** — `undefined`.                                                                                                                                                                                                                         |
| Does it apply to a tab already open when the preload is registered?                                                        | Only after that tab navigates or reloads.                                                                                                                                                                                                     |

## Decision (proposed)

1. **Register one session preload** on every browsing session, from the same `BrowsingSessions.register`
   seam that attaches the web-request multiplexer, so tunnel partitions and private sessions are covered by
   construction. The file is a single `webFrame.executeJavaScript` call that defines a getter on
   `Navigator.prototype` returning `true` — no `ipcRenderer`, no `contextBridge`, no reads of anything.
2. **The setting is enforced by registering and unregistering**, not by the page asking. The preload takes
   no input, so there is **no IPC channel from an untrusted page to main** and nothing for a hostile page to
   call. Toggling the preference calls `registerPreloadScript` / `unregisterPreloadScript` on every live
   browsing session; it takes effect on the next navigation of each tab, and the setting's description says
   so (as the autoplay one does).
3. **Main frame only, stated plainly.** The header still covers every request from every frame and worker;
   the property covers top-level documents. The Settings text and the feature-gap row say "top-level pages",
   not "all pages".
4. **Not done: `nodeIntegrationInSubFrames`.** It is the switch that would extend preloads to subframes, but
   it widens what a sandboxed subframe is born with across the whole app for one boolean on a navigator
   object. If subframe coverage is ever wanted it needs its own ADR and its own measurement.
5. **Pin the invariant, not just the feature.** The e2e that proves the property is `true` in the top frame
   must sit next to a check that `window.tepegoz`, `require` and `process` are still `undefined` there, so
   the first preload added to browsed tabs cannot be the last one anyone audits.

## Consequences

- Sites that read the property (rather than, or as well as, the header) see the signal on top-level loads —
  the case the GPC specification and the regulators' guidance both name.
- The browsed-tab "no preload" rule becomes "no preload except this one, which has no inputs and no
  outputs". That sentence belongs in `tabs-shared.ts` and the threat model when this is accepted.
- The getter is detectable (`Object.getOwnPropertyDescriptor(Navigator.prototype, ...)`). That is the same
  bit Firefox and Brave expose natively when GPC is on, so it distinguishes "has GPC on" rather than adding
  a new fingerprinting dimension.
- Subframes and workers read `undefined` while the header is sent. That is a documented gap, not a silent one.

## Alternatives rejected

- **Chromium's own flag** — reads `false` regardless (measured above).
- **`executeJavaScript` on `dom-ready` / `did-start-navigation`** — runs after page scripts have started;
  also the pattern the user-activation work already found unsafe (`executeJavaScript(code, true)` simulates
  a gesture).
- **A preload that reads the preference over IPC** — correct but opens a channel from a browsed page to main
  for a value main can enforce by registering the file or not.
- **Header only, forever** — defensible, and the current state; chosen against only because sites that
  check the property are the ones the signal is most likely to be honoured by.

## Acceptance (when this moves to Accepted)

Implementation is small (one file, one attacher, one reconciler). It is Accepted when an e2e shows, in one
run: `navigator.globalPrivacyControl === true` in a top-level page with the setting on; `undefined` with it
off after a reload; `window.tepegoz`, `require` and `process` `undefined` in both; and the subframe gap
asserted as it is, so a future change to it is a visible diff.
