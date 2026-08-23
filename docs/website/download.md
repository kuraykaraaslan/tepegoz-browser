---
route: /download
title: Download Tepegöz
description: Signed builds for Windows, macOS and Linux — or three commands from source. Bring your own AI key. Pre-release, and honest about which parts are unproven.
nav: primary
status: ready
---

# Download Tepegöz

**[BUILD NOTE]** This page was previously written in two states: **State A** (no release exists —
build from source plus a notify-me form) and **State B** (platform downloads at the top). The first
signed release has shipped, so **State B is now the live page** and State A survives only as the
build-from-source section further down. The unsigned-binary section has been removed because it no
longer describes reality; if signing ever lapses, it comes back before the download buttons do.

---

## Hero

### Headline

**Download Tepegöz.**

### Subhead

Signed builds for Windows, macOS and Linux. No account, no telemetry, no backend — add your own AI key
and it works.

---

## Downloads

| Platform    | Format                      |
| ----------- | --------------------------- |
| **Windows** | Installer (`.exe`)          |
| **macOS**   | Disk image (`.dmg`)         |
| **Linux**   | `.deb` · `.rpm` · `.tar.gz` |

Windows 11 is the primary target. macOS and Linux build and pass the full test suite on every push, but
receive less hands-on testing.

### Verify what you downloaded

Every release publishes a checksum alongside the binaries. Builds are code-signed on Windows and
notarized on macOS, so your operating system will not warn you — but the signature tells you the file
came from us, and the checksum tells you it arrived intact. Both are worth thirty seconds.

If you would rather not run a binary at all, **build from source** — the instructions below produce the
same application from code you can read.

---

## Then add a key

The browser works without one. The **agent** needs a model, so open Settings and add a key from
Anthropic, OpenAI, Google or Kimi — or point it at a local model and run entirely offline.

Your key is encrypted through your operating system's keychain and stays in the privileged process. You
pay your provider directly; there is no Tepegöz account and nothing is proxied through us.

---

## Build from source

Five minutes, and genuinely simple — there is no compiler step and no native database to rebuild.

### Requirements

- **Node.js 24 or newer** — the same runtime Electron 43 embeds, so the app and its tests run on
  identical ground
- **pnpm 10 or newer**

### Build it

```sh
git clone https://github.com/kuraykaraaslan/tepegoz-browser.git
cd tepegoz-browser
pnpm install --frozen-lockfile
pnpm dev
```

That is the whole thing. No build tools, no Python, no C++ toolchain, no database to compile.

---

## What you are getting

### Body

**Pre-release software.** Things will break, and two specific gaps are worth knowing before you trust it
with anything that matters:

- **No independent security audit has been performed.** The threat model is published and the
  architecture is readable, but no outside party has reviewed it.
- **The automation has not been independently benchmarked.** The adversarial battery and the
  head-to-head comparison are written and pre-registered; the runs have not been paid for, so there is
  no measured attack-success-rate or task-success number, and we will not quote one until there is.

What you can rely on: it is [AGPL-3.0](/legal/license), the entire source is public, there is no
account, no telemetry and no backend — and the problems we already know about are written down instead
of discovered by you.

**[CLAIM]** Known issues are published at [known issues](../known-issues.md). Phase-by-phase status is
at [the roadmap](../../phases/README.md).

---

## Closing call to action

**What is actually finished** → `/roadmap` · **Report a bug** → GitHub Issues · **Report a
vulnerability, privately** → `/security`

---

## Meta

- **Title tag:** Download Tepegöz
- **Meta description:** Signed builds for Windows, macOS and Linux — or three commands from source.
  Bring your own AI key. Pre-release, and honest about which parts are unproven.
