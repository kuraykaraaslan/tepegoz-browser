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

**2. Captures use a local page and the public demo profile.**
Both capture scripts serve their own page from `127.0.0.1` on an ephemeral port, so a capture depends
on nobody else's uptime, shows nobody else's branding, and does not automate a third party's site. The
Electron profile is `C:\Users\Public\tepegoz-demo`, deliberately **outside the repo**: the app prints
its own profile path in the UI (the "wireproxy was not found, put it in …" notice on the network
settings page), and a repo-relative profile once put the operator's Windows username and a
`.shot-profile` test artifact into a public marketing screenshot.

## What cannot be screenshotted: tab content

Every tab is an isolated `WebContentsView` (ADR-0012 — `new WebContentsView(...)` in
`apps/desktop/src/main/tabs-window-base.ts`, attached with `win.contentView.addChildView(view)`).
That view is composited **outside the host window's own `webContents`**, so
`BrowserWindow.capturePage()` — which captures that host `webContents` — comes back with the browser
chrome drawn and the page area blank. Playwright's page screenshot has the same blind spot, for the
same reason: it is talking to the chrome renderer.

So there is **no shot of a loaded web page** in `screenshots.mjs`, and that is not an oversight —
it is the reason `record-agent.mjs` exists at all. Only `desktopCapturer` (i.e. video, of the whole
window) sees a real page.

> Caveat worth knowing before you trust this in a future run: internal `tepegoz://` pages are today
> **also** hosted in a `WebContentsView` (`createInternalPageView` in
> `apps/desktop/src/main/tabs-internal-page-view.ts`), yet they have historically come back in the
> capture, which is why `screenshots.mjs` sticks to them. If a run ever returns a blank internal page
> too, that is the reason — re-verify empirically rather than assuming either way.

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
