# Tepegöz

**An agentic, security-first, local-first AI browser.**

Tepegöz watches the web with a single, focused eye — it understands a page, plans the steps,
and carries out real tasks on your behalf, while every action stays observable, reversible, and
under your control.

> **The name.** *Tepegöz* is the one-eyed giant of Turkish mythology — most famously the monster
> of the *Book of Dede Korkut* (Dede Korkut Kitabı). The single eye is the product metaphor: **one
> agent, one focused gaze on the page**, acting deliberately rather than blindly.

---

> ⚠️ **Project status: pre-implementation.** This repository currently holds the **plan and the
> competitor research** that drive the build. The product described below is the **target final
> state**; development is organized into phases (see [Roadmap](#roadmap)) and tracked task-by-task
> under [`phases/`](phases/). Nothing here ships yet — this README documents where Tepegöz is going.

---

## What Tepegöz is

Most "AI browsers" bolt a chat sidebar onto Chromium. Tepegöz is built the other way around: an
**agentic core** that can drive the browser end-to-end, wrapped in a **deterministic security
kernel** so that autonomy never means losing control.

You give it a goal in plain language. Tepegöz turns that goal into a **plan you can review and
edit**, executes it step by step across real tabs, and shows you exactly what it's doing in a **live
agent console** — every URL visited, every action taken, every token spent, with a replayable
timeline. Risky or irreversible steps stop and ask you first.

Three principles shape every decision:

- **Local-first.** The full agentic experience runs on *your* machine with *your* own AI key
  (Bring-Your-Own-Key). There is **zero dependency on a managed backend** to get value. A managed
  cloud tier is optional and added later — never required.
- **Security by design.** The renderer and any web content are treated as **untrusted**. A
  rule-based **Policy Kernel** classifies every tool call *before* the model runs, an **Egress
  Firewall** blocks data exfiltration, and **sensitive sites** (banking, crypto, health, password
  managers) are locked out of automation by default.
- **Observable & reversible.** Everything the agent does is recorded in an append-only **Event
  Journal**. Irreversible actions require a human-in-the-loop confirmation. You can always see what
  happened and why.

## Key features (target final state)

### Agentic automation
- **Command Palette** (`Ctrl+K`) with four modes — **Chat / Do / Make / Tasks** — as the primary way
  to drive the browser, alongside a deterministic address bar that *never* silently starts an AI thread.
- **Editable plan preview** — the agent shows its planned steps (each tagged read / state-changing /
  destructive / financial, with a cost estimate) and lets you edit before anything runs.
- **Live Agent Console** — per-step URL, action, progress, checkpoint, token cost, and errors, with a
  virtualized timeline you can replay.
- **Parallel multi-tab execution** — independent steps fan out to isolated browser contexts and run
  concurrently (a DAG scheduler with adaptive throttling), not one slow step at a time.
- **Durable tasks** — checkpoint/resume with a ≥95% resume target, an **Effect Ledger** with
  idempotency + fencing tokens so a resumed task never double-acts, and **cross-agent handoff**: a
  half-finished task can be picked up by another agent — even a different model — from where it stopped.
- **Per-task memory at GB scale** — tiered hot/warm/cold storage with hybrid retrieval (full-text
  BM25 + vector cosine), plus a **Memory Audit Panel** you can view and wipe (off by default, opt-in).
- **Loop detector + step cap** — repeated action signatures stop the agent and hand back to you, with
  your credits preserved.

### Real-world task completion
- **Integration adapters** with an **official-API-first** router — Google **Gmail / Drive / Calendar**
  (sending email is always human-confirmed), with a logged-in browser fallback only when no API exists.
- **Canva** via its existing remote **MCP** connector — no bespoke adapter.
- **MCP client *and* server.** Tepegöz consumes external MCP tools, and **exposes its own** browser /
  tab / DOM / journal tools to external clients (Claude, ChatGPT, Cursor…) over stdio + Streamable HTTP,
  behind Bearer auth, rate limiting, and the same policy gate as its internal surface.

### Trustworthy daily driver
- **Safe-Browsing Suite** — ad/tracker blocking (EasyList/EasyPrivacy, per-partition, no system-proxy
  MITM), Google Safe Browsing v5 (hash-prefix lookups; your URLs are never sent), and an
  **AgentThreatShield** that scores phishing/scam and egress anomalies on-device.
- **Human handoff for CAPTCHA / 2FA** — detected and handed to you gracefully; **never auto-solved.**
- **Cookie & storage inspector** — DevTools-style, fully isolated from the OAuth vault, agent access
  off by default.

### Privacy & provider choice
- **Provider-agnostic Model Gateway.** Claude is the default (Opus for planning, Sonnet for execution,
  Haiku for classification), with OpenAI and Gemini adapters. Keys live only in the main process,
  encrypted via OS `safeStorage`.
- **Token Ledger** — live quota indicator, 80% warning, and auto-refund on system errors, CAPTCHAs, or
  detected loops.
- **Optional cloud tier (later).** A managed proxy (no key needed), **opt-in end-to-end-encrypted**
  cross-device memory sync (raw screenshots are *never* synced), and browser bookmark/password/tab sync
  — all pluggable, so turning them on requires **no rewrite**.

### Built for everyone, including Turkey
- **English-first, Turkish first-class.** Every user-facing string comes from a type-safe i18n catalog
  with full English ⇄ Turkish parity — no hardcoded UI text, enforced by lint.
- **Turkish IME done right.** A dedicated input pipeline for Turkish-Q/F layouts, dead keys, and
  `ç ğ ı ö ş ü`, with a regression matrix — independent of the chosen UI language.
- Runtime language switching (no restart), OS-language default, WCAG 2.2 AA, RTL-ready.

## Architecture at a glance

Tepegöz is a layered, modular monorepo. Layers communicate only through typed, validated contracts;
direct cross-layer imports are forbidden and enforced in CI.

| Layer | Responsibility |
|------:|----------------|
| **L0 — Core Shell** | Secure Electron windowing, fuses, sandboxing, typed IPC |
| **L1 — Persistence** | SQLite (WAL) + append-only Event Journal + content-addressed blob store |
| **L2 — Durability & Memory** | Checkpoint/resume, handoff, per-task tiered memory |
| **L3 — Orchestrator** | Intent → DAG planner, parallel scheduler, loop detection |
| **L4 — Perception & Tools** | Out-of-process CDP driver, DOM + accessibility perception, content sanitizer |
| **L5 — Capability Plane** | Tool gateway (single PEP), skills runtime, MCP client + server |
| **L6 — Integration Adapters** | Official-API-first connectors with browser fallback |
| **L7 — Model Gateway** | Provider-agnostic AI routing, transports, Token Ledger |
| **L8 — Security Kernel** | Policy Kernel, Capability Broker, Egress Firewall, HITL, prompt/rules engine |
| **L9 — Browser UI** | Command Palette, Live Agent Console, browser shell, settings |
| **L10 — Safe Browsing** | Adblock, Safe Browsing, AgentThreatShield, popup/permission guard |

**Cross-cutting foundations:** event-sourced state, a strict Zod boundary on every untrusted input
(IPC, LLM tool-call args, MCP, adapters), a uniform `AppError` contract, redacted logging, and an
**i18n-from-day-0** mandate.

## Tech stack

- **Runtime:** Electron (secure `createWindow()` factory + fuses; renderer treated as untrusted)
- **UI:** React + TypeScript (strict) + a type-safe i18n catalog (i18next-style)
- **Build:** pnpm workspaces + Turborepo + `electron-vite` (main / preload / renderer targets)
- **Persistence:** `better-sqlite3` (WAL), FTS5 + `sqlite-vec` for hybrid retrieval
- **Automation:** Chrome DevTools Protocol (out-of-process driver)
- **AI:** provider-agnostic gateway — Anthropic Claude (default), OpenAI, Gemini; MCP client + server
- **On-device ML (later):** ONNX Runtime + DirectML for summarize/classify/redact/embed
- **Native (later):** Rust via `napi-rs` for the egress firewall and hot paths
- **Quality:** Vitest (unit/integration) + Playwright `_electron` (E2E); coverage gates in CI

## Getting started

> Setup instructions become live as **Phase 0** lands the monorepo scaffold. The intended developer
> workflow is:

```bash
# Install (frozen lockfile, all workspaces)
pnpm install --frozen-lockfile

# Lint, typecheck, test, and build across the monorepo
pnpm turbo run lint typecheck test build

# Run the app in development
pnpm dev
```

You'll bring your own AI provider key; it's stored encrypted in the OS keychain via `safeStorage` and
never leaves the main process.

## Project structure

```
tepegoz-browser/
├─ docs/        # Competitor & user-feedback research that informs the product
│              # (Atlas, Opera Neon, Perplexity Comet, Fellou, Claude extensions for ChatGPT/Gemini…)
├─ phases/      # Executable, checkable development plan — ticked as we go. One index plus four
│              # folders by truth status: product/ (Phases 0–12, M, E) · ai-agent-super/ (AI
│              # competence program) · tracks/ (one-off plans, not roadmap) · ai/ (tombstone)
└─ README.md    # You are here
```

As implementation begins, this fills out into a pnpm monorepo (`apps/*`, `packages/*`, `libs/*`) with
the layers described above.

## Roadmap

Development is sequenced so that the highest-risk, hardest-to-reverse decisions come first, and so that
**real user value ships before any cloud dependency exists.**

| Phase | Goal | Status |
|------:|------|--------|
| **0** | Monorepo scaffold, core contracts, security backbone, CI | ⬜ Not started |
| **1a** | Walking-skeleton MVP — BYO-key, local-first agentic core, one end-to-end task | ⬜ Not started |
| **1b** | Agentic deepening — parallel DAG, durable handoff, per-task memory, MCP server | ⬜ Not started |
| **2** | Integration adapters (Google, Canva) + Safe-Browsing Suite | ⬜ Not started |
| **3** | Optional managed subscription + E2EE cloud memory sync + extensions | ⬜ Not started |
| **4** | Maturation — full extensions, cross-platform (macOS/Linux), enterprise | ⬜ Not started |

Full, task-level detail lives in [`phases/`](phases/) and its [index](phases/README.md).

## Design commitments

These are non-negotiable and apply to every phase:

- **Local-first, no forced backend.** The cloud is always optional.
- **Deterministic security first.** Rules decide; the model is used only for understanding and
  ambiguity — never to grant itself permissions.
- **Privacy by default.** Telemetry off, sensitive sites locked, screenshots never synced raw,
  secrets only in the main process.
- **English-first, Turkish first-class** — and accessible (WCAG 2.2 AA).
- **Honesty over hype.** Where extension or platform compatibility is partial, it's documented with an
  honest matrix, not a "everything works" promise.

---

*Tepegöz — one eye on the web, both hands on the wheel kept by you.*
