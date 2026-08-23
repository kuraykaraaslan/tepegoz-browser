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

Only from a wallet mandate you wrote — a ceiling, a payee list and an expiry, recorded before the run.
Outside an active mandate, a financial step needs an explicit confirmation that names the action.
Either way the decision is enforced in the privileged process rather than in the window you are looking
at, and the agent cannot widen a mandate it holds.

### Can it log into my bank?

Only if you enable it. Banking, crypto, health and password-manager sites — including Turkish banking
and the whole `gov.tr` tree — ship switched off behind a per-category grant. Nothing the agent does
turns one on; you do, deliberately, and you can revoke it at any time.

### Will it solve CAPTCHAs?

Yes. CAPTCHA and two-factor prompts are cleared automatically — two-factor codes are completed by the
credential broker, so the model never sees them. A challenge the browser cannot clear is handed back to
you rather than retried blindly.

Whether automating a given site is permitted is between you and that site; see [`/legal/terms`](/legal/terms).

### Are the builds signed?

Yes — code-signed on Windows and notarized on macOS, so neither SmartScreen nor Gatekeeper will warn
you. Every release also publishes a checksum. If you would rather not run a binary at all, `/download`
has the three commands that build the same application from source.

### Is it stable?

No. It is pre-release: early software with no independent security audit and no independently measured
automation. Known problems are
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
