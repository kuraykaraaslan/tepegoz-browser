---
route: /
title: Tepegöz — the browser that does the work
description: An agentic, security-first, local-first browser. It plans, acts on real pages, and shows you every step. Your key, your machine, your rules.
nav: primary
status: needs-assets
---

# Home

**[BUILD NOTE]** This page needs one thing more than copy: a **real recording of the agent working**.
A static screenshot cannot show the difference between a chat sidebar and an agent that drives tabs. If
the recording does not exist yet, the page does not ship — do not substitute a mockup.

---

## Hero

### Headline

**The browser that does the work.**

### Subhead

Tepegöz understands a page, plans the steps, and carries them out across real tabs — while every action
stays visible, reversible, and yours to stop. Your own AI key. Your own machine. No account required.

### Primary call to action

**Get Tepegöz** → `/download`

### Secondary call to action

**See how it works** → `/how-it-works`

### Status line, directly under the buttons

> **Pre-release.** Builds are signed and downloadable, but this is early software: there has been no
> independent security audit, and the automation has not been independently benchmarked.
> [What that means →](/roadmap)

**[BUILD NOTE]** This line is not a disclaimer to be styled into invisibility. It is the reason a
technical visitor trusts the rest of the page. Give it the same weight as body text.

---

## Section 1 — The problem, in one paragraph

### Heading

**Most "AI browsers" bolt a chat panel onto Chromium.**

### Body

You still do the clicking. The assistant summarizes the page you are already reading and hands the work
back to you. When one of them does act, you usually cannot see what it did, cannot stop it mid-step, and
find out it went wrong when something has already been sent, bought, or deleted.

Tepegöz is built the other way around: an **agentic core** that can drive the browser end to end, inside
a **deterministic security kernel** so that autonomy never means losing control.

---

## Section 2 — The three commitments

**[BUILD NOTE]** Three cards. Each headline is a promise the product can be held to; each body says how
it is enforced, not that it is important.

### Local-first

The full experience runs on your machine with your own AI key — Anthropic, OpenAI, Gemini, Kimi, or a
model running entirely offline on your own hardware. There is **no managed backend to depend on** and no
account to create. A hosted tier may exist later; it will never be required.

### Security by design

Web pages and the renderer are treated as untrusted. A rule-based **policy kernel classifies every tool
call before the model runs**, an egress firewall blocks data from leaving to places it should not, and
banking, crypto, health and password-manager sites ship switched off, and only you can enable them.

### Observable and reversible

Every action lands in an append-only event journal. Irreversible steps — money, credentials, deletion —
stop and ask you first, and the decision is enforced in the privileged process, not in the window you
are looking at. You can always see what happened and why.

---

## Section 3 — What it actually does

**[BUILD NOTE]** This is the demo section. One recording, chaptered, with the copy below as captions.
Show a real task on a real site. Show the plan. Show a confirmation gate firing. **Show it recovering
from something going wrong** — that is more persuasive than a clean run, and every visitor who has used
an agent knows it.

1. **Ask in plain language.** Press `Ctrl+K` and describe the goal — in English or Turkish.
2. **See the plan before it runs.** Steps are laid out and labelled by what they touch: read,
   state-changing, destructive, financial.
3. **Watch it work.** The live console shows the page it is on, the action it took, what it observed,
   and what it cost.
4. **Keep the wheel.** Anything irreversible stops and asks. You can interrupt at any step, and the
   whole run is replayable afterwards.

---

## Section 4 — Not an assistant bolted on. A browser.

### Body

Tepegöz is a browser first, and it behaves like one. Tabs and tab groups, bookmarks with a real manager,
history, a download manager with quarantine, find-in-page, profiles, native context menus. The address
bar is deterministic — it navigates or searches, and it **never quietly starts an AI conversation
because it thought that is what you meant**.

Nine first-party extensions ship with it: ad and tracker blocking, macros, translation, writing
assistance, a strict popup blocker, a user-agent switcher, a unified video player, scheduled tasks, and
the agent itself.

**Explore the features** → `/features`

---

## Section 5 — Privacy that is a mechanism, not a promise

### Body

Telemetry is off. Your API keys are encrypted by the operating system's own keychain and never leave the
privileged process — not into a log, not into a bundle, not into a prompt. And a tab or an entire tab
group can be **routed through its own WireGuard tunnel or through Tor**, including Tor over VPN, with a
fail-closed kill switch: if the tunnel drops, that tab stops rather than quietly falling back to your
real connection.

**How the network layer works** → `/network-privacy`

---

## Section 6 — Open source, and the licence means it

### Body

Tepegöz is **AGPL-3.0**. The whole browser — the security kernel, the agent runtime, the extensions —
is readable, forkable, and auditable. The licence is deliberately strong: nobody gets to take this,
close it, and run it as a service without giving the same freedom back.

**Read the code** → GitHub · **What AGPL means for you** → `/open-source`

---

## Section 7 — Where this is honest

**[BUILD NOTE]** Keep this section. It converts the audience that matters. Do not soften it in review.

### Heading

**What we have not proven yet.**

### Body

Every capability of the agent competence program is built and none of it is independently measured — the
benchmark spend has not been paid, and until it is, "our agent is better" is a sentence this project
will not write. No independent security audit has been performed. Several capabilities ship
deliberately switched off.

All of it is written down, per phase, with what is missing and why.

**See the honest status** → `/roadmap`

---

## Section 8 — Named for a giant with one eye

### Body

_Tepegöz_ is the one-eyed giant of Turkic mythology, the monster of the Book of Dede Korkut. The single
eye is the point: **one agent, one focused gaze on the page**, acting deliberately instead of blindly.

**Read the story** → `/story`

---

## Closing call to action

### Heading

**Build it, break it, tell us what broke.**

### Body

Tepegöz is pre-release and built in the open. The most valuable thing you can do right now is run it and
report what fails.

**Get Tepegöz** → `/download` · **Report a security issue** → `/security`

---

## Meta

- **Title tag:** Tepegöz — the browser that does the work
- **Meta description:** An agentic, security-first, local-first browser. It plans, acts on real pages,
  and shows you every step. Your key, your machine, your rules.
- **OG image:** the one-eye wordmark on a dark field, with the agent console visible behind it.
