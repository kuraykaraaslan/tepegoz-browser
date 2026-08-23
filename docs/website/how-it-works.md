---
route: /how-it-works
title: How Tepegöz works
description: Goal to plan to action, with a deterministic security kernel deciding what the agent may do before the model ever runs.
nav: primary
status: needs-assets
---

# How it works

## Hero

### Headline

**You give it a goal. It gives you a plan. You keep the wheel.**

### Subhead

Tepegöz turns a sentence into steps, runs them on real pages, and shows you each one as it happens. What
it is allowed to do is decided by rules, in the privileged process, before the model is ever consulted.

---

## Section 1 — The four stages

**[BUILD NOTE]** Four numbered blocks with one illustration each. If a diagram is drawn, draw the
**boundary** — the untrusted page on one side, the kernel and the model on the other. That boundary is
the product.

### 1. Ask

Press `Ctrl+K` and type what you want, in English or Turkish. The command palette has four modes —
**Chat** for questions, **Do** for tasks on the current page, **Make** for producing something, and
**Tasks** for work that runs on a schedule.

The address bar stays a separate thing entirely. It navigates and searches, deterministically, and never
turns a typo into an AI request.

### 2. Perceive

Before acting, the agent reads the page the way an assistive technology would: a structural pass over
the live DOM that returns the elements a person could actually interact with — visible, on top, in the
viewport — including inside open shadow roots and same-origin frames.

Everything that comes back from a page is treated as **data, never as instructions**. Page text is
normalized and screened for injected commands at the boundary where it enters, because a web page that
can talk to your agent is a web page that can give it orders.

### 3. Decide

This is the part most agent products leave to the model. Tepegöz does not.

Every tool call is classified by a **deterministic policy kernel** before the model runs — by tool, by
argument, and by target — into one of six risk tiers: read, UI-write, data-egress, financial,
credential, destructive. The tier decides what happens next: run it, ask you, or refuse outright.

Two consequences worth stating plainly:

- **The window you are looking at does not get a vote.** Autonomy level, permissions and approvals are
  enforced in the main process. A compromised or manipulated page cannot approve anything on your
  behalf — it does not have the ability, not merely the permission.
- **The sensitive categories are off until you turn them on.** Banking, crypto, health and
  password-manager surfaces — including Turkish banking and the whole `gov.tr` tree — sit behind a
  per-category grant that ships disabled. The agent cannot enable one. Only you can, and that decision
  is enforced in the privileged process as well.

### 4. Act, and show its work

Steps run on real tabs. The live console shows the page, the action, what was observed, progress, token
cost, and errors — as it happens, not afterwards. Every step is written to an append-only event journal,
so a finished run can be replayed and audited.

When a step is irreversible, it stops and asks, with the specific action spelled out.

---

## Section 2 — What it does when things go wrong

### Body

Real pages break agents. Layouts shift under them, elements disappear between the decision and the
click, dialogs cover what they were about to press, and a bad loop can burn an hour and a budget doing
the same thing forever.

- **Stale references are caught structurally.** The agent compares the page's structure against what it
  saw when it decided; if the ground moved, it re-reads instead of clicking into the dark.
- **Loops are detected and stopped**, and the run is handed back to you rather than left to spin.
- **CAPTCHA and two-factor prompts are cleared automatically.** Two-factor codes are completed by the
  credential broker, so the second factor is filled without the model ever seeing it. A challenge the
  browser cannot clear is handed back to you rather than retried blindly.
- **Completion is checked, not assumed.** "I clicked the button" is not the same claim as "the thing
  happened", and the two are separated on purpose.

---

## Section 3 — Bring your own model

### Body

Tepegöz has no model of its own and no proxy in the middle. You add a key and it uses it:

| Provider           | Status                   |
| ------------------ | ------------------------ |
| Anthropic (Claude) | Supported                |
| OpenAI             | Supported                |
| Google Gemini      | Supported                |
| Kimi               | Supported                |
| Local models       | Supported, fully offline |

Keys are stored encrypted through the operating system's keychain, held only in the privileged process,
and redacted from logs. You pay your provider directly, at their prices. **Tepegöz takes no cut, sees no
traffic, and needs no account.**

Local models are the same seam, not a lesser mode: point it at a model on your own hardware and the
browser works with no network dependency at all.

---

## Section 4 — What the agent is not allowed to do

**[BUILD NOTE]** Present as a hard list. This section exists because "what can it do" is answered by
every competitor and "what can it never do" is answered by almost none.

- It cannot approve its own permissions. Grants are minted from a plan you approved and expire with the
  run; the agent cannot widen a grant it holds.
- It cannot reach a sensitive category — banking, crypto, health, password managers — that you have
  not enabled yourself. Those grants ship off, and nothing the agent does turns one on.
- It cannot send credentials to a model. Secrets are filled by a broker that the model never sees the
  contents of, and that includes two-factor codes.
- It cannot spend outside the wallet mandate you wrote. The ceiling, the payees and the expiry are
  yours; the agent can spend inside them and cannot raise any of them.
- It cannot delete things unattended without an explicit, specific confirmation.
- It cannot quietly fall back to your real connection when a tunnel it was bound to drops. It stops.

---

## Section 5 — The honest limits

### Heading

**Where this is still unproven.**

### Body

The mechanisms above are built and tested. What has **not** happened is independent measurement of how
well the agent completes real tasks compared to the alternatives. The benchmark protocol is written and
pre-registered — including the clause that says the claim is withdrawn the moment it stops
reproducing — but the runs have not been paid for.

Until they are, this page describes how Tepegöz decides, not how often it succeeds. Anyone telling you
their browser agent's success rate without a dated, blind-scored artifact is telling you a feeling.

**The full status, phase by phase** → `/roadmap`

---

## Closing call to action

**Get Tepegöz** → `/download` · **See what it ships with** → `/features`

---

## Meta

- **Title tag:** How Tepegöz works — plan, act, and stay in control
- **Meta description:** Goal to plan to action, with a deterministic security kernel deciding what the
  agent may do before the model ever runs.
