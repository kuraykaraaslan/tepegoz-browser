---
route: /features
title: Features
description: Everything Tepegöz ships today — browser, agent, security kernel, network privacy, extensions — separated honestly from what is still planned.
nav: primary
status: needs-assets
---

# Features

## Hero

### Headline

**A real browser, with an agent that can drive it.**

### Subhead

Everything below is split into what works today and what is planned. Nothing is listed twice, and
nothing planned is written as if it exists.

**[BUILD NOTE]** Use two visually distinct states — a solid "Available" marker and a clearly weaker
"Planned" marker — and let the reader filter. Do not merge the lists under a single heading; the
separation is the point of the page.

---

## The star

**[BUILD NOTE]** This legend must render before the first starred item. An unexplained ★ is noise, and
a star the reader cannot check is the same unearned-superlative move the rest of the site avoids.

> **★ marks a mechanism the category does not offer, or does the opposite of.** Every one is
> verifiable by reading the source — none of them is a performance claim. How well the agent completes
> tasks compared to the alternatives is still unmeasured, and that is on `/roadmap`.

---

## The browser

### Available

- **Tabs and tab groups** with drag-to-reorder, scroll-collapse, and per-group settings — each tab an
  isolated view, so one page cannot reach into another
- ★ **Deterministic address bar** with inline arithmetic and prefix commands (`tab:`, `history:`,
  `bookmark:`) — it navigates or searches, and never starts an AI thread by accident
- **Bookmarks** — a Chrome-style bookmarks bar with folder dropdowns and a two-pane manager with
  drag-and-drop, search and folders
- **History** with search, and back/forward dropdowns per tab
- ★ **Download manager** with pause and resume, risk classification, **quarantine before the file is
  trusted**, and a redacted audit record for every transfer
- ★ **Upload activity** — a redacted view of what left your machine, with cancel. Most browsers have
  no such surface at all
- **Find in page**, **profiles** with isolated storage, **native context menus**, per-site zoom
- **One keyboard-shortcut registry** — every shortcut is defined in a single place, so the same key
  cannot mean two things in two windows
- **Tray and hide-tabs modes** for work that should keep running without occupying your screen
- **Internal pages** for settings, downloads, uploads, bookmarks, history, extensions and tasks

### Planned

- Reader mode, print preview and built-in PDF viewing
- Split view and workspaces
- Vertical tabs
- Chrome MV3 extension support, with an honest compatibility matrix rather than a blanket promise

---

## The agent

### Available

- **Command palette** (`Ctrl+K`) with four modes: Chat, Do, Make, Tasks
- **Live agent console** — the page, the action, the observation, progress, token cost and errors, as
  they happen
- **Editable plans** with each step tagged read / state-changing / destructive / financial
- ★ **Risk-tiered approvals** — six tiers derived from the tool, its **validated arguments** and its
  target, not from a declared label the tool author supplied
- ★ **Plan-scoped grants** that expire with the run and cannot be widened by the agent
- ★ **Structural page perception** — the DOM and accessibility tree first, vision only as a fallback;
  pierces open shadow roots and same-origin frames
- ★ **Prompt-injection screening** that strips hidden, zero-width, bidi and homoglyph vectors out of
  page text before the model ever sees it
- ★ **Human-like input** — curved mouse paths with eased speed, jittered click and key timings, and a
  three-phase overshoot scroll, instead of instant straight-line jumps
- **Loop detection** and stale-reference recovery
- **Human handoff for CAPTCHA and 2FA** — detected and handed to you
- **Searchable run history** — every past conversation and task
- ★ **Macros** — a deterministic, **model-free** automation interpreter with a sandboxed expression
  language; every element step **auto-waits** instead of sleeping a fixed interval. The agent can drive
  them too
- **Scheduled tasks**
- ★ **Sealed unattended runs** — a scheduled run can only ever be a narrowing of what you approved
  while watching, and `destructive` / `financial` steps never auto-run
- ★ **MCP client** — external tool servers are treated identically to built-in ones: same kernel, same
  approvals, same audit, and every response re-validated rather than trusted
- ★ **On-device inference** for fully offline operation, with a grammar that makes a small local model
  physically unable to wrap its JSON in prose
- ★ **No uncapped and no untimed model call is possible** — a token ceiling and a timeout are enforced
  before the request reaches any provider
- ★ **Provider-agnostic by construction** — Anthropic, OpenAI, Gemini, Kimi and local models normalize
  to one canonical shape, so nothing above the gateway is written against a vendor

### Planned

- **Automatic CAPTCHA and 2FA clearing**, with handoff kept as the fallback
- Parallel multi-tab execution with a dependency-aware scheduler
- Durable checkpoint and resume, and handing an unfinished task to a different agent or model
- Long-term task memory with hybrid retrieval
- An **MCP server** surface, so other clients can drive Tepegöz's tools
- Integration adapters that prefer official APIs (Google Workspace, Canva) over browser automation

---

## Security

### Available

- ★ **Deterministic policy kernel** classifying every tool call **before the model runs** — security in
  plain code, not model guardrails
- ★ **One gateway for every tool** — built-in, MCP and extension capabilities all pass the same fixed
  sequence, so a tool source can never be the way policy gets bypassed
- ★ **Autonomy enforced in the privileged process** — the renderer displays and relays, it never decides
- ★ **Egress firewall** with secret and high-entropy detection on outbound content
- ★ **Credential broker and encrypted vault** — secrets are filled without the model ever seeing them,
  and raw passwords are never exposed over IPC
- ★ **Taint tracking** — web-derived data is marked at the boundary, and tainted plus state-changing
  forces a confirmation
- **Sensitive-site category map** covering banking, crypto, health, password managers, Turkish banking
  and the whole `gov.tr` tree
- ★ **Append-only event journal** of everything the agent did
- **Human-in-the-loop confirmation** for destructive and financial steps, enforced at the decision path
- ★ **Folder-sandboxed file access** — your folder-grant list *is* the authorization; there is no
  broader filesystem reach
- **Scoped trust profiles** — narrow what is allowed where, without turning protection off globally
- ★ **Hardened Electron shell** — one secure window factory, context isolation, sandboxing, fuses
  closed and verified on a packaged build
- ★ **Secrets are redacted at the logger**, so a call site that forgot cannot put one in a log file
- ★ **Agent output is never rendered as HTML** — markdown becomes React elements, never raw markup
- ★ **`tepegoz-verify`** — a standalone command-line tool that verifies a proof-of-run bundle without a
  database, a network call, or trusting whoever produced it
- Clipboard contents are kept out of persistent state, logs and journal payloads

### Planned

- **Per-category user grants** that let you enable banking, crypto, health or password-manager
  automation deliberately — off by default, and never enabled by the agent
- **Wallet mandates** — a ceiling, a payee list and an expiry that authorize spending within bounds
- Fingerprinting resistance, with a published before-and-after entropy measurement
- Google Safe Browsing and an on-device phishing and scam classifier
- Third-party cookie isolation
- Verifiable policy bundles, transaction mandates, and governed agent endpoints

---

## Network privacy

### Available

- ★ **Per-tab and per-group tunnels** — bind a single tab, an entire tab group, or the whole profile.
  Not offered anywhere else in the category
- **WireGuard** (userspace, no elevation, nothing bundled) and **Tor**
- **Tor over VPN**, chained
- ★ **Fail-closed kill switch** — if the tunnel drops, the bound tabs stop; there is no silent fallback
  to your real connection
- **Route badges** on tabs and groups, computed in the privileged process, never colour-only
- **DNS through the tunnel**, verified by a leak test

### Planned

- OpenVPN
- Managed exit nodes, if and only if there is demand for them

---

## Extensions

Nine first-party extensions ship with the browser.

### Available

- ★ **Translate** — local-first: translation memory, then an on-device model, then a cloud fallback you
  approved. The page rewrite is **restoreable**; original nodes are kept rather than destroyed
- ★ **Typo** — writing and spelling help, with dictionaries downloaded into your profile rather than
  bundled into the app
- ★ **Popup Blocker (strict)** — instead of silently swallowing a pop-up, it offers the choice inline
  on the notification: allow, open in background, follow the redirect, or trust the site
- ★ **Agent** — every tab group gets its own independent agent session, switching with the active tab
- ★ **Macros** — a record/edit/replay studio beside the page, plus a manager for saved automations
- **Adblock Shield** — ad and tracker blocking through a single network-filtering pipeline
- **User-Agent** — presets across Chrome/Edge/Firefox/Safari and desktop/mobile, or a custom string
- **Scheduled Tasks** — the surface for work that runs on a schedule
- **Unified Player** — one consistent video surface instead of each site's own

---

## Language and access

### Available

- **English and Turkish at full parity**, switchable at runtime without a restart
- ★ **A dedicated Turkish keyboard pipeline** — Q and F layouts, dead keys, `ç ğ ı ö ş ü` — with a
  regression matrix, independent of the interface language
- ★ **Hardcoded text fails the build** — every user-facing string comes from a typed catalogue

### In progress

- WCAG 2.2 AA is a standing requirement, verified per surface as each one lands
- In-app interface scaling for high-density displays

---

## Under the hood

- **Electron 43**, with the renderer treated as untrusted
- **React and strict TypeScript** — no escape hatches: the codebase contains zero `@ts-ignore`
- ★ **A real-result eval harness** that drives real pages with ground-truth scoring — dev-only and
  never shipped in the app, because it exists to measure the product rather than to be part of it
- ★ **One source of truth for every cross-layer contract**, with every trust boundary validating
  against it rather than re-declaring the shape
- ★ **The sandboxed preload is verified dependency-free**, so the bridge cannot pull in a module it is
  not allowed to load
- ★ **One outbound HTTP seam** — timeouts, redaction and error mapping live in a single place, and no
  vendor SDK is used
- **Data-driven catalogs** for extensions and on-device models — adding one is a data change, not a
  release
- **Node's built-in SQLite** — no native database module, nothing to compile
- **Roughly seventy internal packages** behind one desktop shell, with module boundaries enforced in
  continuous integration
- Tested on Windows, macOS and Linux on every push, including an end-to-end suite that launches the
  built application

---

## Closing call to action

**Get Tepegöz** → `/download` · **See what is not built yet** → `/roadmap`

---

## Meta

- **Title tag:** Features — Tepegöz
- **Meta description:** Everything Tepegöz ships today — browser, agent, security kernel, network
  privacy, extensions — separated honestly from what is still planned.
