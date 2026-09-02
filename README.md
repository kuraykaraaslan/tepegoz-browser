# Tepegöz

**An agentic, security-first, local-first AI browser.**

[![CI](https://github.com/kuraykaraaslan/tepegoz-browser/actions/workflows/ci.yml/badge.svg)](https://github.com/kuraykaraaslan/tepegoz-browser/actions/workflows/ci.yml)
[![License: AGPL v3](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D24-informational.svg)](package.json)

Tepegöz watches the web with a single, focused eye — it understands a page, plans the steps, and
carries out real tasks on your behalf, while every action stays observable, reversible, and under your
control.

> **The name.** _Tepegöz_ is the one-eyed giant of Turkish mythology — most famously the monster of the
> _Book of Dede Korkut_. The single eye is the product metaphor: **one agent, one focused gaze on the
> page**, acting deliberately rather than blindly.

---

## Project status — read this first

**Pre-release. Shipped and signed; not stable, not audited.**

Signed installers are published for Windows, macOS and Linux, and the source builds in three commands.
What is still missing is measurement: **no independent security audit** has been performed and the
automation has **not** been independently benchmarked. **No development phase is closed yet**; the
roadmap tracks status by what has been _measured_, not by what has been written, and by that bar every
phase still reads amber. See [`phases/README.md`](phases/README.md) for the per-phase truth.

One claim this project deliberately does **not** make: that its agent is good at browsing. All thirteen
phases of the AI competence program have landed their code, and **every one of them is still
"measurement-owed"** — the benchmark spend to prove or refute them has not been paid
([`phases/ai-agent/README.md`](phases/ai-agent/README.md)). Treat the automation as
promising and unproven, and read [`docs/known-issues.md`](docs/known-issues.md) before trusting it with
anything that matters.

### What works today

Built, tested in CI on Windows/macOS/Linux, and exercised in the running app:

- **A real browser shell.** Tabs and tab strip, a deterministic omnibox (with inline calculation) that
  _never_ silently starts an AI thread, back/forward history dropdowns, bookmarks with a bar and a
  two-pane manager, history, a downloads manager with quarantine, an upload activity surface,
  find-in-page, profiles, native context menus, tray and hide-tabs modes, and a settings surface —
  frameless chrome assembled from `@tepegoz/*` leaf packages.
- **An agent that drives the browser.** Agent panel and live console, the agent runtime, the tool
  plane, and browser tools are wired end to end. Bring your own key: **Anthropic, OpenAI, Gemini, or
  Kimi**, plus **on-device inference** via `node-llama-cpp` for local models. Keys are encrypted in the
  OS keychain through `safeStorage` and never leave the main process.
- **A deterministic security kernel.** Policy kernel, capability plane, egress firewall with secret
  detection, credential broker and vault, content-guard against prompt injection at the perception
  boundary, an append-only event journal, and human-in-the-loop confirmation for destructive or
  financial steps — with autonomy enforced in the main process, never in the renderer.
- **Network privacy that actually tunnels.** Userspace WireGuard (via `wireproxy`) and Tor providers,
  chained Tor-over-VPN, a connection pool, three-scope binding, and per-tab and per-group route badges
  — measured end to end in the shipping app. Nothing is bundled and nothing needs elevation.
- **Nine first-party extensions** on an in-house extension SDK: Adblock Shield, Agent, Macros
  (a deterministic iMacros successor — record, edit, replay), Popup Blocker, Tasks, Translate, Typo,
  User-Agent switcher, and a Unified video Player.
- **MCP client.** Tepegöz consumes external MCP tool servers, behind the same policy gate as its
  internal tools.
- **English and Turkish at full parity**, runtime language switching, a dedicated Turkish IME pipeline
  with a regression matrix, and WCAG 2.2 AA as a standing requirement.
- **`tepegoz-verify`** — a standalone CLI that verifies a proof-of-run bundle, tested by running the
  built binary.

### Landed but not proven

Code exists and is tested in isolation; it is **not** wired to a live path, or its effectiveness has
never been measured:

- The entire **AI competence program** (S0–S12) — capabilities are in, measurement is owed. Three
  capabilities ship **deliberately inert** (credential fill, hint recall, vision), and one phase records
  a **measured refutation** of its own original design rather than quietly dropping it.
- **Notary / proof-of-run**, **transaction mandates**, **verifiable policy bundles**, **governed agent
  endpoints**, the **recipe compiler** IR, the **Kamu** (Turkish public-service) step classifier, and
  the **supply-chain gate** — decision layers landed with ADRs accepted, none wired to a live call.

### Not built

Parallel multi-tab DAG execution · durable checkpoint/resume and cross-agent handoff · GB-scale tiered
task memory · integration adapters (Google, Canva) · Safe Browsing v5 · an **MCP server** surface ·
Chrome MV3 extension support · the optional managed cloud tier and E2EE sync · macOS/Linux as
first-class targets (they build and pass CI; Windows 11 gets the real testing).

---

## What Tepegöz is

Most "AI browsers" bolt a chat sidebar onto Chromium. Tepegöz is built the other way around: an
**agentic core** that can drive the browser end-to-end, wrapped in a **deterministic security kernel**
so that autonomy never means losing control.

You give it a goal in plain language. Tepegöz turns that goal into steps, executes them across real
tabs, and shows you what it is doing in a live agent console — every URL visited, every action taken,
every token spent. Risky or irreversible steps stop and ask you first.

Three principles shape every decision:

- **Local-first.** The full agentic experience runs on _your_ machine with _your_ own AI key. There is
  **zero dependency on a managed backend**. A managed cloud tier is optional and later — never required.
- **Security by design.** The renderer and any web content are treated as **untrusted**. A rule-based
  policy kernel classifies every tool call _before_ the model runs, an egress firewall blocks
  exfiltration, and sensitive sites (banking, crypto, health, password managers) are locked out of
  automation by default.
- **Observable & reversible.** Everything the agent does is recorded in an append-only event journal.
  Irreversible actions require human confirmation. You can always see what happened and why.

## Getting started

**Requirements:** Node **>= 24** (what Electron 43 embeds — app and tests run the same runtime) and
pnpm **>= 10**. No compiler and no native database build: the database is Node's built-in `node:sqlite`.

```sh
pnpm install --frozen-lockfile

# The full gate: typecheck · lint · test · build
pnpm exec turbo run typecheck lint test build

# Launch the app
pnpm dev
```

To use the agent, add your own AI provider key in Settings. It is encrypted with the OS keychain via
`safeStorage` and stays in the main process — it is never written to `.env`, the bundle, or a log.

Contributor setup, the gates CI enforces, and where to read first:
[`CONTRIBUTING.md`](CONTRIBUTING.md).

## Architecture at a glance

A layered, modular monolith: one desktop app over ~70 `@tepegoz/*` packages. Layers communicate only
through typed, validated contracts; cross-layer imports are forbidden and enforced in CI by
`dependency-cruiser`.

|                         Layer | Responsibility                                                               |
| ----------------------------: | ---------------------------------------------------------------------------- |
|           **L0 — Core Shell** | Secure Electron windowing, fuses, sandboxing, typed IPC                      |
|          **L1 — Persistence** | SQLite (WAL) + append-only event journal + content-addressed blob store      |
|  **L2 — Durability & Memory** | Checkpoint/resume, handoff, per-task tiered memory                           |
|         **L3 — Orchestrator** | Intent → plan, scheduling, loop detection                                    |
|   **L4 — Perception & Tools** | Out-of-process CDP driver, DOM + accessibility perception, content sanitizer |
|     **L5 — Capability Plane** | Tool gateway (single policy enforcement point), skills runtime, MCP          |
| **L6 — Integration Adapters** | Official-API-first connectors with browser fallback                          |
|        **L7 — Model Gateway** | Provider-agnostic AI routing, transports, token ledger                       |
|      **L8 — Security Kernel** | Policy kernel, capability broker, egress firewall, HITL                      |
|           **L9 — Browser UI** | Command palette, live agent console, browser shell, settings                 |
|       **L10 — Safe Browsing** | Adblock, popup/permission guard, threat shield                               |

L2's durability, L6's adapters, and parts of L10 are on the "not built" list above — the model is the
target shape, not a claim that every layer is full.

**Cross-cutting:** event-sourced state, a strict zod boundary on every untrusted input, a uniform
`AppError` contract, redacted logging, and i18n from day zero. The binding rules are
[`docs/engineering-rules.md`](docs/engineering-rules.md).

## Tech stack

- **Runtime:** Electron 43 (secure `createWindow()` factory + fuses; renderer treated as untrusted)
- **UI:** React + strict TypeScript + a type-safe per-package i18n catalog
- **Build:** pnpm workspaces + Turborepo + `electron-vite`
- **Persistence:** Node's built-in **`node:sqlite`** (WAL) — no native module, no ABI to match
- **Automation:** Chrome DevTools Protocol
- **AI:** provider-agnostic gateway — Anthropic, OpenAI, Gemini, Kimi; local models via
  `node-llama-cpp`; MCP client
- **Native:** Rust via `napi-rs` — placeholder package, not yet in a hot path
- **Quality:** Vitest + Playwright `_electron`, with coverage, module-boundary, doc-link, audit, and
  formatting gates in CI on all three platforms

## Repository layout

```
tepegoz-browser/
├─ apps/desktop/    # L0 Electron shell — thin, over the packages below
├─ packages/        # ~70 @tepegoz/* packages (private, bundled — never published to npm)
├─ extensions/      # 9 first-party extensions on the in-house extension SDK
├─ e2e/             # Playwright `_electron` suites against the BUILT app
├─ test-fixtures/   # Frozen page fixtures, including hostile ones (excluded from formatting)
├─ docs/            # ADRs, threat model, architecture index, engineering rules
├─ research/        # Imported competitor/market research (not repo documentation)
└─ phases/          # The executable roadmap, ticked as work lands
```

## Roadmap

Sequenced so the highest-risk, hardest-to-reverse decisions come first, and so real user value exists
before any cloud dependency does. Status below is copied from the roadmap's own ledger — **nothing reads
✅**, because a phase closes only when its definition of done passes and the result is recorded.

| Phase                     | Goal                                                         | Status                                                                 |
| ------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| **0** Foundation          | Monorepo, core contracts, security backbone, CI              | 🟡 6/7 exit criteria evidenced                                         |
| **1a** Walking skeleton   | BYO-key local-first agentic core, one end-to-end task        | 🟡 In progress — console/runtime/tool plane/browser tools live         |
| **2b/2c** Daily driver    | Tabs, DevTools boundary, downloads, clipboard, uploads       | 🟡 In progress                                                         |
| **5** Network privacy     | Per-tab and per-group VPN tunnels + Tor                      | 🟡 **5a working with real tunnels**; OpenVPN deferred                  |
| **M** Macros              | Deterministic record/replay automation                       | 🟡 Core shipped                                                        |
| **AI** Agent competence   | The 13-phase agent competence program (S0–S12)               | 🟡 All code landed · **every phase measurement-owed**                  |
| **6, 7, 9, 11, 12**       | Recipes · notary · mandates · Kamu pack · developer platform | ⏸ Frozen out of v1 — decision layers landed, none wired to a live call |
| **1b, 2, 3, 4, 8, 10, E** | Durability · adapters · cloud tier · maturation · delight    | ⏸ Frozen out of v1 — not started                                       |

Task-level detail: [`phases/`](phases/) and its [index](phases/README.md).

## Design commitments

Non-negotiable, and they apply to every phase:

- **Local-first, no forced backend.** The cloud is always optional.
- **Deterministic security first.** Rules decide; the model is used for understanding and ambiguity —
  never to grant itself permissions.
- **Privacy by default.** Telemetry off, sensitive sites locked, secrets only in the main process.
- **English-first, Turkish first-class** — and accessible (WCAG 2.2 AA).
- **Honesty over hype.** Where compatibility or competence is partial, it is documented with an honest
  matrix and an explicit "not measured", not an "everything works" promise. This README's status
  section is that commitment applied to itself.

## Security

Tepegöz renders untrusted content and lets a model act on pages you are logged into. Security reports
are the most valuable contribution this project can receive.

**Do not file a vulnerability as a public issue.** Follow [`SECURITY.md`](SECURITY.md) — it covers
private reporting, scope, response targets, and safe harbor. The trust model is
[`docs/threat-model.md`](docs/threat-model.md).

## Contributing

Bug reports with reproductions, security findings, localization corrections, and macOS/Linux platform
reports are the most useful things right now. Read [`CONTRIBUTING.md`](CONTRIBUTING.md) first — the CI
gates are strict and mechanical, and the guide tells you what they are before they turn a PR red.
Participation is governed by the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

Copyright (C) 2026 Kuray Karaaslan.

Tepegöz is free software: you may redistribute it and/or modify it under the terms of the **GNU Affero
General Public License, version 3** as published by the Free Software Foundation. It is distributed in
the hope that it will be useful, but **WITHOUT ANY WARRANTY**; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See [`LICENSE`](LICENSE) for the full terms.

The AGPL's network clause (§13) matters here: if you modify Tepegöz and make it available to users over
a network, those users must be offered the corresponding source of your modified version.

Third-party code and assets redistributed in this repository — and the licenses they arrive under — are
recorded in [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).

---

_Tepegöz — one eye on the web, both hands on the wheel kept by you._
