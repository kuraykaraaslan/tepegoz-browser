---
route: /download
title: Get Tepegöz
description: There is no installer yet. Tepegöz is built from source today — three commands, no compiler, no native database. Here is exactly how.
nav: primary
status: ready
---

# Get Tepegöz

**[BUILD NOTE]** This page has two states. **State A (now):** no release exists, so the page is
build-from-source plus a notify-me form. **State B (after the first tag):** platform download buttons
move to the top, build-from-source moves down, and the unsigned-binary section becomes the most
important thing on the page. Both states are written below. Ship State A honestly rather than shipping
a download button that leads to a 404 — a dead button is the fastest way to lose a technical audience.

---

## State A — today

### Headline

**There is no installer yet.**

### Subhead

Tepegöz is pre-release. You can build and run it today in about five minutes, and the build is
genuinely simple — there is no compiler step and no native database to rebuild.

### Requirements

- **Node.js 24 or newer** — the same runtime Electron 43 embeds, so the app and its tests run on
  identical ground
- **pnpm 10 or newer**
- Windows 11 is the primary target. macOS and Linux build and pass the full test suite on every push,
  but receive less hands-on testing.

### Build it

```sh
git clone https://github.com/kuraykaraaslan/tepegoz-browser.git
cd tepegoz-browser
pnpm install --frozen-lockfile
pnpm dev
```

That is the whole thing. No build tools, no Python, no C++ toolchain, no database to compile.

### Then add a key

The browser works without one. The **agent** needs a model, so open Settings and add a key from
Anthropic, OpenAI, Google or Kimi — or point it at a local model and run entirely offline.

Your key is encrypted through your operating system's keychain and stays in the privileged process. You
pay your provider directly; there is no Tepegöz account and nothing is proxied through us.

### Tell me when there is a release

**[BUILD NOTE]** Email capture, single field, one clear sentence about what it will be used for.
Collecting an address makes the site a data controller under Turkish and EU law — `/legal/privacy` must
be live before this form is.

> One email when the first release lands. Nothing else, no list, unsubscribe in one click.

---

## State B — after the first release

### Headline

**Download Tepegöz.**

| Platform    | Format                      |
| ----------- | --------------------------- |
| **Windows** | Installer (`.exe`)          |
| **macOS**   | Disk image (`.dmg`)         |
| **Linux**   | `.deb` · `.rpm` · `.tar.gz` |

### Read this before you run it

**Builds are not code-signed.** Code signing is not configured for this project yet, which has a
concrete consequence: **your operating system will warn you, and it is right to.**

- **Windows** will show a SmartScreen warning: "Windows protected your PC." To continue anyway, choose
  **More info → Run anyway**.
- **macOS** will refuse to open it on the first attempt. Use **System Settings → Privacy & Security →
  Open Anyway**.

We are not going to tell you those warnings are nothing. They exist precisely so that unsigned software
has to be run deliberately. Verify the checksum published with each release, and if you would rather
not run unsigned code, **build from source** — the instructions above produce the same application from
code you can read.

Signing is tracked as blocking for a real release.

---

## Both states — what you are getting

### Body

**Pre-release software.** No stable version, no update channel, no security audit. Things will break,
and the automation has not been independently benchmarked against anything.

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

- **Title tag:** Get Tepegöz — build from source
- **Meta description:** There is no installer yet. Tepegöz is built from source today — three commands,
  no compiler, no native database. Here is exactly how.
