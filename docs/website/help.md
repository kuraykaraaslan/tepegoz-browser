---
route: /help
title: Help and documentation
description: Install, add a model key, run your first agent task, set up a tunnel, and understand what Tepegöz will refuse to do.
nav: footer
status: needs-assets
---

# Help

**[BUILD NOTE]** This is the hub page. Each numbered guide below becomes its own child route once
written; the copy here is the hub plus the FAQ. Guides need screenshots taken from a real build.

## Hero

### Headline

**Getting started, and getting unstuck.**

---

## Guides

**[BUILD NOTE]** Card grid, four groups.

### First steps

1. **Install** — building from source until a release exists (`/download`)
2. **Add a model key** — Anthropic, OpenAI, Gemini or Kimi, and where it is stored
3. **Run entirely offline** — using a local model with no network dependency
4. **Your first agent task** — the command palette, the four modes, reading the plan

### The agent

5. **The four modes** — Chat, Do, Make and Tasks, and when each is right
6. **Reading the live console** — steps, observations, cost, errors
7. **Approvals** — risk tiers, what stops and asks, and why some things never unlock
8. **Macros** — recording a deterministic automation with no model in the loop
9. **Scheduled tasks** — unattended runs, and the limits that still apply
10. **Connecting MCP servers**

### Browser

11. **Tabs, groups and profiles**
12. **Downloads and quarantine**
13. **Extensions** — the nine that ship, and how to configure them
14. **Turkish keyboard** — Q and F layouts, dead keys, switching interface language

### Privacy and network

15. **Per-tab VPN and Tor** — importing a configuration, binding a tab or a group
16. **When a tunnel drops** — what the kill switch does and what you will see
17. **Where your data lives** — the profile directory, what you can export, what a backup misses

---

## Frequently asked

### Do I need an account?

No. There is no Tepegöz account and no way to create one.

### Do I need to pay Tepegöz?

No. The browser is free software and there is nothing to buy. If you use the agent, you pay **your AI
provider** directly at their prices, using your own key. We take no cut and see no traffic. A local
model costs nothing but your hardware.

### Which models work?

Anthropic, OpenAI, Google Gemini and Kimi, plus local models running on your own machine.

### Is my API key safe?

It is encrypted through your operating system's keychain and never leaves the privileged process — not
into a log, not into the interface, not into a prompt. Nothing is proxied through a server of ours,
because there is no server.

### Can the agent spend my money?

Only with an explicit confirmation that names the action. Financial steps are a separate risk tier that
cannot be auto-approved by any autonomy setting, and the decision is enforced in the privileged process
rather than in the window you are looking at.

### Can it log into my bank?

No. Banking, crypto, health and password-manager sites are locked out of automation by category —
including Turkish banking and the whole `gov.tr` tree — and no setting unlocks them.

### Will it solve CAPTCHAs?

No, deliberately. It detects them and hands the page to you.

### Why does my system say the app is unsigned?

Because it is. Code signing is not configured yet, so Windows SmartScreen and macOS Gatekeeper will both
warn you. `/download` explains what the warnings mean and how to build from source instead.

### Is it stable?

No. It is pre-release: no tagged version, no update channel, no security audit. Known problems are
published rather than discovered by you.

### Does it work on macOS and Linux?

It builds and passes the full test suite on both on every push, but Windows 11 is the primary target and
gets the hands-on testing. Reports from the other two are genuinely useful.

### How do I report a bug? A security hole?

Bugs: GitHub Issues, with a reproduction. **Security: never in a public issue** — use private
vulnerability reporting or email. See `/security`.

---

## Closing call to action

**Get Tepegöz** → `/download` · **Ask in the open** → GitHub Discussions

---

## Meta

- **Title tag:** Help and documentation — Tepegöz
- **Meta description:** Install, add a model key, run your first agent task, set up a tunnel, and
  understand what Tepegöz will refuse to do.
