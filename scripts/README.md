# `scripts/` — repo-level tools

Four standalone Node ESM scripts. None of them is part of a package; run them from the **repo root**
(they resolve `apps/desktop` and `apps/desktop/resources/...` relative to `process.cwd()`).

Two of them produce the marketing site's assets. The bytes they produce are **published from the
website repo**, not from here — nothing under `.shots/` or `.recording/` is meant to be committed to
this repository, and both are gitignored for that reason.

## Two standing rules

**1. No OS-level screen grab. Ever.**
A whole-screen capture takes whatever is physically in front of the desktop, and Windows does not
guarantee foreground activation, so "in front" is not the window you asked for. It was tried here and
removed after it twice captured the **operator's own desktop** — once their personal browser with
their tabs and profile avatar, once a video playing on their screen. The only permitted moving-image
capture is Electron's `desktopCapturer` resolved by the target window's own `getMediaSourceId()`
(`record-agent.mjs`), which has no branch that can wander off the app. Both capture scripts carry this
rule in their header; do not weaken either copy.

**2. Captures use the public demo profile, and screenshots use a local page.**
`screenshots.mjs` serves its own page from `127.0.0.1` on an ephemeral port, so a still depends on
nobody else's uptime, shows nobody else's branding, and does not automate a third party's site. The
Electron profile is `C:\Users\Public\tepegoz-demo`, deliberately **outside the repo**: the app prints
its own profile path in the UI (the "wireproxy was not found, put it in …" notice on the network
settings page), and a repo-relative profile once put the operator's Windows username and a
`.shot-profile` test artifact into a public marketing screenshot.

The **agent recording** is the deliberate exception, and it is an owner decision rather than a drift:
the recording drives real public sites (a DuckDuckGo search, a Reddit thread) because a local form
does not demonstrate the thing the recording exists to demonstrate — an agent coping with a page
nobody built for it. The costs are accepted knowingly: the capture now depends on someone else's
uptime and markup, it shows another party's branding, and a re-record is not byte-reproducible. What
does **not** relax is everything else on this page — the profile stays public and outside the repo,
the capture stays window-scoped, and nothing staged or re-enacted may be published as a real run.

**Profile resets spare `models/`.** Both capture scripts wipe the demo profile's *entries* rather than
the directory, because `fetch-demo-model.mjs` puts a 1.1 GB `.gguf` under `models/` and a blanket
`rmSync(profileDir)` deletes it silently — the next run then re-downloads a gigabyte to reach the same
state. `screenshots.mjs` did exactly that until it was caught, while this file already claimed both
scripts spared it. If you add a third capture script, copy the `PROFILE_KEEP` set, not the wipe.

## Capturing tab content: what is true, and what this file used to say

Every tab is an isolated `WebContentsView` (ADR-0012 — `new WebContentsView(...)` in
`apps/desktop/src/main/tabs-window-base.ts`, attached with `win.contentView.addChildView(view)`).
That view is composited **outside the host window's own `webContents`**, so
`BrowserWindow.capturePage()` — which captures that host `webContents` — comes back with the browser
chrome drawn and the page area blank. Playwright's page screenshot has the same blind spot, for the
same reason: it is talking to the chrome renderer. All of that is still true.

What this file used to conclude from it was not. It said there could be **no shot of a loaded web
page**, and that "only `desktopCapturer` (i.e. video, of the whole window) sees a real page". That is
false, and the correction is one line of code: capture the **view's own** `webContents`, not the
window's.

```js
const views = win.contentView.children.filter((c) => c.webContents);
const img = await views[views.length - 1].webContents.capturePage();   // the page, in full
```

It was measured both ways before this was rewritten: a loaded `http://127.0.0.1` page and an internal
`tepegoz://settings` page each came back non-empty at 1440x784 through the view's `webContents`, and
each came back blank through `BrowserWindow.capturePage()`. `screenshots.mjs` now takes both captures
and composites the page into the chrome's hole at the view's reported bounds, so a product shot is two
sets of real pixels with a seam at a rectangle Electron itself supplied.

Two consequences worth carrying forward:

- **The caveat in the old text came true.** It warned that internal `tepegoz://` pages were *also*
  hosted in a `WebContentsView` (`createInternalPageView` in
  `apps/desktop/src/main/tabs-internal-page-view.ts`) and might one day stop appearing in the capture.
  They have: on this build every internal page returns blank through the host window. The page itself
  is fine — probed live, `tepegoz://settings` reports 183 nodes, `readyState: complete`, painted, with
  its nav labels present — so a blank shot is a capture defect and never evidence of a broken build.
- **`getByText` cannot see a page's DOM.** Playwright's `win` is the chrome renderer. The settings
  sub-page shots used to be selected by clicking a nav label through `win.getByText(...)`, which could
  never match, so all four silently logged "not reachable" for as long as that code existed. They are
  now addressed by URL fragment (`tepegoz://settings#providers`) — the shell keeps the active section
  in `location.hash`, which `CrossLink` in `settings-shared.tsx` already relies on.

## The scripts

### `check-doc-links.mjs` — `pnpm docs:links`

Fails if any relative markdown link under `phases/**` points at a file that does not exist (the
executable form of the S0 exit criterion). Pass roots to widen it: `pnpm docs:links docs .`.
Code spans are stripped first, because `phases/**` deliberately contains `git show <sha>:phases/…`
recovery commands naming deleted paths.

- **Needs:** Node only. No GUI, no build, no network.
- **Writes:** nothing. It reports to stdout and exits non-zero on a broken link.

### `fetch-demo-model.mjs`

Pre-downloads the catalog's recommended on-device model (`qwen2.5-1.5b-instruct-q4`) using the exact
`resolveModelFile` call the app's own `ModelManager.download()` makes, so the app sees a genuinely
installed model rather than something hand-placed. Run once; it exits early if the file is already
there. It exists only so the recording is not twenty minutes of a progress bar.

- **Needs:** Node, network, and `node-llama-cpp` installed (`pnpm install`). No GUI, no build.
- **Writes:** `C:\Users\Public\tepegoz-demo\models\qwen2.5-1.5b-instruct-q4.gguf`, **~1.1 GB**.
- Both capture scripts spare `models/` when they reset the demo profile, so this download survives
  repeated capture runs. Keep it that way — a blanket profile wipe re-charges 1.1 GB, silently.

### `screenshots.mjs` — product screenshots

```sh
pnpm exec turbo run build --filter=@tepegoz/desktop
node scripts/screenshots.mjs [out-dir]
```

Launches the built app under Playwright's `_electron` at 1440×900 and captures internal pages: new
tab, command palette, extensions, downloads, uploads, bookmarks, history, tasks, and the settings
sub-pages that carry the product's actual argument (providers, agent controls, network privacy,
privacy & telemetry). Real UI states only — nothing here stages an agent run, because the copy's
standing rule is that a mockup must not stand in for the real thing.

- **Needs:** a **real GUI session** (an interactive desktop — not CI, not SSH, not a headless agent
  shell) and a built `apps/desktop`.
- **Writes:** `<out-dir>/NN-name.png`. Default out-dir `.shots/` (gitignored).
- Launch gotchas, inherited from `e2e/smoke.spec.ts`: hand Electron the app **directory** (not
  `out/main/index.js`, which points `getAppPath()` somewhere the extension catalog does not live),
  and strip `ELECTRON_RUN_AS_NODE` from the env, which some shells set and which makes Electron run
  headless as Node.

### `record-agent.mjs` — WebM of the window

```sh
node scripts/fetch-demo-model.mjs           # once, ~1.1 GB
pnpm exec turbo run build --filter=@tepegoz/desktop
node scripts/record-agent.mjs [out-dir]
```

Records the app's own window via `desktopCapturer` + `MediaRecorder`, driving a local contact form.
The model is the on-device Qwen2.5 1.5B, so there is no API key, no spend, and no page content
leaving the machine — which also means the recording can be re-made by anyone without borrowing
someone's credentials.

- **Needs:** a **real GUI session**, a built `apps/desktop`, and the demo model (it exits with an
  error if the `.gguf` is missing).
- **Writes:** `<out-dir>/agent-run.webm` and `<out-dir>/agent-final.png`. Default out-dir
  `.recording/` (gitignored).
- **Known limitation — read the script header before publishing anything it produces.** The capture
  works; this harness's _dispatch_ does not. It types the goal into the command palette's `Do` mode,
  and that mode has no commands (`do: []` in
  `apps/desktop/src/renderer/src/command-palette-host.tsx`), so Enter starts nothing. The palette is
  the broken path — **not** agent dispatch: the Agent Console sidebar
  (`extensions/ext-agent/src/panel-actions.ts` `onRun()` → `api.runAgent(...)`) and the omnibox
  (`app-omnibox-history.ts` `startAgentRun()` → `window.tepegoz.runAgent(...)`) both dispatch today,
  and the sidebar is how the existing `agent-demo.gif` was driven. Until this script is re-pointed at
  one of those, it records the app, not the agent, and **its output must not be published as a
  recording of the agent working**.
