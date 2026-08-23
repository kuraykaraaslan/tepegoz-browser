---
route: /roadmap
title: Roadmap and honest status
description: What is built, what is landed but unproven, and what does not exist yet. No phase is marked finished, because none has met its own bar.
nav: primary
status: ready
---

# Roadmap

**[BUILD NOTE]** This page must be regenerated from `phases/README.md` whenever that changes, or it
will become the thing it exists to prevent. Ideally build it from the file rather than transcribing it
by hand.

## Hero

### Headline

**Nothing here is marked finished. That is not modesty.**

### Subhead

A phase closes only when its definition of done passes **and** the result is recorded as a measurement.
By that rule, every phase of this project is still open — and saying so is more useful to you than a row
of green ticks would be.

---

## Section 1 — The three states

### Body

Most roadmaps have two states: done and not done. That hides the state that matters most in an AI
product.

- **Built and proven** — the code exists and its behaviour has been measured or is deterministic enough
  to be tested exhaustively.
- **Built and unproven** — the code exists, it is tested in isolation, and its real-world effectiveness
  has never been measured. **This is where most of the agent lives today.**
- **Not built** — described in the plan, absent from the product.

The second category is the honest one, and it is the one that disappears from every competitor's
marketing.

---

## Section 2 — What works today

### Body

- A complete browser shell: tabs and groups, bookmarks, history, downloads with quarantine, uploads,
  find-in-page, profiles, a deterministic address bar
- The agent end to end: command palette, live console, runtime, tool plane, browser tools — with four
  cloud providers and fully offline local inference
- The security kernel: policy classification, risk tiers, plan-scoped grants, human-in-the-loop,
  credential vault and broker, egress firewall, prompt-injection screening, event journal
- Network privacy with **real tunnels**: userspace WireGuard and Tor, chained Tor over VPN, per-tab and
  per-group binding, a fail-closed kill switch verified end to end against the built application
- Nine first-party extensions, and an MCP client
- English and Turkish at full parity, with a dedicated Turkish keyboard pipeline
- `tepegoz-verify`, a standalone proof-of-run verifier

---

## Section 3 — Built, not proven

### Body

**The entire agent competence programme.** Thirteen phases, all of them with capability code landed, all
of them still owing a measurement. The benchmark protocol is written and pre-registered — including a
withdrawal clause stating the claim dies the moment it stops reproducing — and the runs have not been
paid for.

Three capabilities ship **deliberately switched off**, and one phase records a **measured refutation of
its own original design** rather than quietly redesigning around the failure.

Also here: proof-of-run notarisation, transaction mandates, verifiable policy bundles, governed agent
endpoints, the recipe compiler, the Turkish public-service classifier and the supply-chain gate — each a
decision layer that is landed, reviewed, documented, and **not yet wired to a live call**.

---

## Section 4 — Not built

### Body

Parallel multi-tab execution · durable checkpoint, resume and hand-off between agents · long-term task
memory · official-API integration adapters · Google Safe Browsing · an MCP **server** surface ·
fingerprinting resistance · Chrome MV3 extension support · the optional managed cloud tier and encrypted
sync · macOS and Linux as first-class targets · code signing.

---

## Section 5 — The blockers, named by kind

**[BUILD NOTE]** Keep the kinds separate. Lumping them into "we need funding" is exactly the vagueness
this section exists to avoid.

| Blocker                      | What it actually needs                                           |
| ---------------------------- | ---------------------------------------------------------------- |
| The agent benchmark baseline | **API spend** — roughly $550–780 for the full sweep              |
| The head-to-head comparison  | **Rival subscriptions**, about $60/month — not API credit        |
| The local-model phase        | **Downloaded model weights**, not tokens                         |
| A real release               | **Code-signing identity** for Windows and macOS                  |
| Phase 0 closing              | A watched CI run, and the suite executing on macOS at least once |

---

## Section 6 — Why we publish this

### Body

Because the alternative is a benchmark number nobody can reproduce, and this category already has
several.

An agentic browser makes an unusually large promise: that it can act for you on pages that matter. The
only responsible way to make that promise is to be explicit about which parts are demonstrated, which
are merely built, and which are still a sentence in a plan.

**[CLAIM]** All of it is maintained in the repository, per phase, with the evidence or the absence of
it: [phase index](../../phases/README.md) · [AI competence programme](../../phases/ai-agent-super/README.md)
· [known issues](../known-issues.md)

---

## Closing call to action

**Get Tepegöz** → `/download` · **Help close a gap** → `/open-source`

---

## Meta

- **Title tag:** Roadmap and honest status — Tepegöz
- **Meta description:** What is built, what is landed but unproven, and what does not exist yet. No
  phase is marked finished, because none has met its own bar.
