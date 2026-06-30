# ADR-0012: Browser tab model — isolated WebContentsView per tab

- **Status:** Accepted
- **Date:** 2026-06-30

## Context
Tepegöz is a real browser, not just an agent UI: the user opens tabs that load arbitrary, **untrusted
web pages**. The app chrome (frameless title bar, tab strip, omnibox, nav) is our trusted UI and holds
the privileged `window.tepegoz` contextBridge. Untrusted page content must never share a process,
session, or bridge with that chrome — this is the browser's core trust boundary. Electron 30+ offers
`WebContentsView` (the successor to `BrowserView`) as the supported way to host multiple web contents
in one window.

## Decision
- **One `WebContentsView` per tab**, managed by a main-process `TabManager` (static service). The
  active tab's view is laid into the content area **below** the chrome using bounds the renderer
  reports (ResizeObserver → `tabs:set-bounds`, DIP). Background tabs stay alive but are detached from
  the window's view tree.
- **Separate session from the chrome.** Browsing views use `partition: 'persist:tepegoz-web'`; the
  chrome uses `persist:tepegoz-app`. Browsing views run with `sandbox + contextIsolation +
  nodeIntegration:false + webSecurity:true` and **no preload** — web pages cannot reach the bridge or
  Node. (Per-site / ephemeral partitions and profiles are a later phase.)
- **Navigation policy is per-surface, not global.** The chrome window is locked to app content
  (`will-navigate` deny in `createWindow`). Browsing views may navigate the web but block non-web
  schemes and route `window.open`/`target=_blank` to **new tabs**. Permission requests are denied by
  default for every surface (HITL grants come later).
- **Chrome ↔ tabs over typed IPC only:** fire-and-forget controls (`tabs:*`, `window:*`) are
  sender-validated (exact-host allow-list, ADR-0009 sibling) and zod-validated; state is pushed via
  `tabs:state`. The chrome renders the chrome; the web page is the overlaid view.

## Consequences
- The untrusted-web/trusted-chrome boundary is structural (separate process + session + no bridge),
  not convention — prompt injection or a hostile page cannot reach privileged IPC.
- The renderer must keep the content bounds in sync (resize, maximize, DPI); a chrome-rendered overlay
  (e.g. Settings) hides the web view via `tabs:set-content-visible`.
- Rejected: a single `<webview>`/iframe in the chrome renderer (weaker isolation, shares the chrome
  process/CSP) and `BrowserView` (legacy, being phased out in favor of `WebContentsView`).
- Future ADRs refine this: per-tab/profile partition isolation, checkpoint/resume of tab state, and
  agent-driven tabs (the agent's browsed pages reuse this same isolated-view model).
