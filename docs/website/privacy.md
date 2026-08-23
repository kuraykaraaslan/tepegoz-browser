---
route: /privacy
title: Privacy
description: No telemetry, no account, no backend. Where your data lives, what leaves your machine, and what a local-first browser cannot promise.
nav: primary
status: ready
---

# Privacy

**[BUILD NOTE]** This is the product privacy page — how the browser behaves. The website's own legal
privacy policy is a separate document at `/legal/privacy`. Link between them, do not merge them.

## Hero

### Headline

**We do not have your data. Not as a policy — as an architecture.**

### Subhead

There is no Tepegöz account, no Tepegöz server, and no telemetry. The browser works because it runs on
your machine, not because something of ours is running somewhere else.

---

## Section 1 — What we collect

### Heading

**Nothing.**

### Body

Tepegöz has no managed backend. It does not phone home on launch, does not report usage, does not
maintain a user identity, and does not require registration to do anything. There is no analytics
pipeline to opt out of, because there is no pipeline.

This is not a setting we hope you will trust. There is no server component to send anything to.

---

## Section 2 — What does leave your machine

### Body

Honesty is more useful than a zero. Three things leave, all of them yours, all of them visible:

**Your AI provider.** When the agent runs, the task and the page content it needs go to the provider
whose key you configured — Anthropic, OpenAI, Google or Kimi. That is a direct relationship between you
and them under their terms; nothing is proxied through us and we do not see it. Use a local model and
even this stops: nothing leaves at all.

**The web.** Pages you visit are fetched from the web, like any browser.

**Things you explicitly connect.** MCP tool servers you add, and dictionaries or model weights you
choose to download — each one an action you took, none of them on by default.

---

## Section 3 — Where your data lives

### Body

Everything is in one directory on your machine: the event journal, browsing history, bookmarks, agent
run history, preferences, and the encrypted vault.

- **API keys and stored credentials** are encrypted through the operating system's own keychain —
  DPAPI on Windows, Keychain on macOS — and held only in the privileged process.
- **Logs are redacted at the logger**, so a secret cannot reach a log file by way of a call site that
  forgot.
- **Nothing in the profile is synced anywhere**, because there is nowhere to sync it to.

**[CLAIM]** The exact locations, what you can export, and what a backup would miss are documented at
[data and backup](../data-and-backup.md) — including the gaps.

---

## Section 4 — Network privacy is built in

### Body

A tab, a tab group, or the whole profile can be routed through a **WireGuard tunnel or Tor**, including
Tor over VPN, with your own configuration. Nothing is bundled, nothing needs administrator rights, and
we do not run exit nodes.

If a tunnel drops, the tabs bound to it **stop**. There is no silent fallback to your real connection —
the failure mode that makes most kill switches decorative.

**How it works** → `/network-privacy`

---

## Section 5 — The agent and your privacy

### Body

An agent that can act on your behalf can also overshare on your behalf. The relevant controls:

- **An egress firewall** inspects outbound content for secrets and blocks what should not leave.
- **Sensitive categories ship disabled** — banking, crypto, health, password managers. Enabling one is
  a deliberate, per-category decision you make; the agent has no path to making it for you.
- **Screenshots are not part of the default loop.** Visual capture is deliberately switched off, and
  before it is ever enabled, redaction of logged-in session chrome and an explicit per-run consent are
  prerequisites, not follow-ups.
- **Every action is journalled locally**, so you can audit what the agent saw and did — and that journal
  never leaves your machine.

---

## Section 6 — What a local-first browser cannot promise

**[BUILD NOTE]** Keep. A privacy page that only lists strengths reads as marketing; one that names its
own limits reads as engineering.

- **Your AI provider sees what you send them.** Local-first removes the middleman, not the provider.
  Only a local model removes both.
- **Websites can still fingerprint you.** Fingerprinting resistance is not built yet. A tunnel hides
  your network address; it does not hide your browser. Until that work lands with a published
  before-and-after measurement, assume you are as identifiable as in any Chromium browser.
- **`safeStorage` protects against other users and offline access to your disk.** It does not protect
  against malware already running as you.
- **There has been no independent privacy or security audit.**

---

## Section 7 — When there is a cloud tier

### Body

A managed tier may exist one day: a proxy for people who do not want to hold a key, and optional
end-to-end-encrypted sync across devices. Three commitments are already fixed in the architecture:

1. **It is optional.** The browser will never require it, and the local path will never be degraded to
   sell it.
2. **Sync is end-to-end encrypted**, zero-knowledge, opt-in.
3. **Raw screenshots are never synced.**

---

## Closing call to action

**How the security kernel works** → `/security` · **The website's own privacy policy** →
`/legal/privacy`

---

## Meta

- **Title tag:** Privacy — Tepegöz
- **Meta description:** No telemetry, no account, no backend. Where your data lives, what leaves your
  machine, and what a local-first browser cannot promise.
