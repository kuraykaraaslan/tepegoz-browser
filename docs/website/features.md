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

## The browser

### Available

- **Tabs and tab groups** with drag-to-reorder, scroll-collapse, and per-group settings
- **Deterministic address bar** with inline arithmetic and prefix commands (`tab:`, `history:`,
  `bookmark:`) — it navigates or searches, and never starts an AI thread by accident
- **Bookmarks** — a Chrome-style bookmarks bar with folder dropdowns and a two-pane manager with
  drag-and-drop, search and folders
- **History** with search, and back/forward dropdowns per tab
- **Download manager** with pause and resume, risk classification, quarantine before the file is
  trusted, and a redacted audit record for every transfer
- **Upload activity** — a redacted view of what left your machine, with cancel
- **Find in page**, **profiles** with isolated storage, **native context menus**, per-site zoom
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
- **Risk-tiered approvals** — six tiers derived from the tool, its arguments and its target
- **Plan-scoped grants** that expire with the run and cannot be widened by the agent
- **Structural page perception** that pierces open shadow roots and same-origin frames
- **Prompt-injection screening** on everything a page returns, at the boundary where it enters
- **Loop detection** and stale-reference recovery
- **Human handoff for CAPTCHA and 2FA** — detected, never auto-solved
- **Searchable run history** — every past conversation and task
- **Macros** — record, edit and replay a deterministic automation, with no model in the loop
- **Scheduled tasks**
- **MCP client** — connect external tool servers, gated by the same policy kernel as everything else
- **On-device inference** for fully offline operation

### Planned

- Parallel multi-tab execution with a dependency-aware scheduler
- Durable checkpoint and resume, and handing an unfinished task to a different agent or model
- Long-term task memory with hybrid retrieval
- An **MCP server** surface, so other clients can drive Tepegöz's tools
- Integration adapters that prefer official APIs (Google Workspace, Canva) over browser automation

---

## Security

### Available

- **Deterministic policy kernel** classifying every tool call before the model runs
- **Autonomy enforced in the privileged process** — the renderer displays and relays, it never decides
- **Egress firewall** with secret detection on outbound content
- **Credential broker and encrypted vault** — secrets are filled without the model ever seeing them
- **Sensitive-site lockout** by category, including Turkish banking and the `gov.tr` tree
- **Append-only event journal** of everything the agent did
- **Human-in-the-loop confirmation** for destructive and financial steps, enforced at the decision path
- **Scoped trust profiles** — narrow what is allowed where, without turning protection off globally
- **Hardened Electron shell** — one secure window factory, context isolation, sandboxing, fuses closed
  and verified on a packaged build
- **`tepegoz-verify`** — a standalone command-line tool that verifies a proof-of-run bundle

### Planned

- Fingerprinting resistance, with a published before-and-after entropy measurement
- Google Safe Browsing and an on-device phishing and scam classifier
- Third-party cookie isolation
- Verifiable policy bundles, transaction mandates, and governed agent endpoints

---

## Network privacy

### Available

- **Per-tab and per-group tunnels** — bind a single tab, an entire tab group, or the whole profile
- **WireGuard** (userspace, no elevation, nothing bundled) and **Tor**
- **Tor over VPN**, chained
- **Fail-closed kill switch** — if the tunnel drops, the bound tabs stop; there is no silent fallback
- **Route badges** on tabs and groups, computed in the privileged process, never colour-only
- **DNS through the tunnel**, verified by a leak test

### Planned

- OpenVPN
- Managed exit nodes, if and only if there is demand for them

**More detail** → `/network-privacy`

---

## Extensions

Nine first-party extensions ship with the browser: **Adblock Shield**, **Agent**, **Macros**,
**Popup Blocker (strict)**, **Scheduled Tasks**, **Translate**, **Typo**, **User-Agent** and
**Unified Player**.

**What each one does** → `/extensions`

---

## Language and access

### Available

- **English and Turkish at full parity**, switchable at runtime without a restart
- **A dedicated Turkish keyboard pipeline** — Q and F layouts, dead keys, `ç ğ ı ö ş ü` — with a
  regression matrix, independent of the interface language
- Every user-facing string comes from a typed catalogue; hardcoded text fails the build

### In progress

- WCAG 2.2 AA is a standing requirement, verified per surface as each one lands
- In-app interface scaling for high-density displays

**Why Turkish is first-class here** → `/turkey`

---

## Under the hood

- **Electron 43**, with the renderer treated as untrusted
- **React and strict TypeScript** — no escape hatches: the codebase contains zero `@ts-ignore`
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
