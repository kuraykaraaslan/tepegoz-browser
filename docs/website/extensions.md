---
route: /extensions
title: Extensions
description: Nine first-party extensions ship with Tepegöz — ad blocking, macros, translation, writing help, scheduled tasks and more. Built in, not bolted on.
nav: primary
status: needs-assets
---

# Extensions

**[BUILD NOTE]** One card per extension, each with a real screenshot of its panel. Nine cards. Do not
use icons alone — these are working surfaces and they photograph well.

## Hero

### Headline

**Nine extensions, written by us, shipped with the browser.**

### Subhead

Not a store full of abandoned uploads asking for permission to read everything you do. First-party
features, built on the same capability plane and gated by the same security kernel as the agent.

---

## Section 1 — Why first-party

### Body

The browser extension model has an unhappy shape: the features people need most — blocking ads,
automating a task, fixing their writing — are the ones that need the most access, delivered by
third parties with the least accountability. Then a platform changes its rules and the ad blocker gets
quietly weakened.

Tepegöz builds those features itself, in the repository, under the same review as everything else. When
an extension needs to act on a page, it goes through the **same policy kernel** the agent does. Nothing
gets a private back door.

**Every one of these can also be driven by the agent** through a declared capability contract — so
"block ads on this site" or "run my invoice macro" is a sentence, not a menu hunt.

---

## Section 2 — The nine

### Adblock Shield

Ad and tracker blocking with cosmetic filtering, applied per session partition — including inside a
tunnelled tab, in the same order, with no system-wide proxy interception anywhere. Because Tepegöz is
not a Chrome extension, it is not subject to the platform restrictions that hollowed out blockers
elsewhere.

### Agent

The sidebar where you hand work to the browser: the conversation, the plan, the live step feed, and the
approval prompts. Also the home of the command palette's four modes.

### Macros

A deterministic successor to iMacros: record what you do, edit it as steps, replay it — **with no model
in the loop**, so the same macro does the same thing every time. Two surfaces: a resizable "Macro
Studio" beside the live page, and a manager for everything you have saved. The agent can list, run and
save macros too.

### Popup Blocker (strict)

Blocks pop-ups by default and, instead of silently swallowing them, offers the choice inline on the
notification: allow, open in the background, follow the redirect, or trust this site.

### Scheduled Tasks

Work that runs on a schedule instead of when you are watching — with the same approval rules, so an
unattended run still cannot spend money or delete things on its own.

### Translate

Full-page and selection translation, local-first: translation memory first, then an on-device model if
you have one installed, and only then a cloud fallback you have approved. The page rewrite is
**restoreable** — original nodes are kept and can be put back, rather than the destructive replacement
that breaks single-page applications.

### Typo

Writing and spelling help for editable text on any page, analysed locally. Dictionaries are downloaded
into your profile on demand, pinned by version and verified by hash — not bundled, not uploaded, not
sent anywhere for "review".

### User-Agent

Change how the browser identifies itself, from built-in presets across Chrome, Edge, Firefox and Safari
on Windows, macOS and iPhone — per site or globally.

### Unified Player

One consistent video player across sites, replacing whatever each page ships.

---

## Section 3 — Third-party extensions

### Body

Limited Chrome MV3 support is planned, with an **honest compatibility matrix** rather than a promise
that everything works — because it will not, and finding that out one extension at a time is a bad
experience.

Deep integrations that need real access, like password managers, are planned as native adapters instead
of extensions. An extension is the wrong trust boundary for your credentials.

---

## Closing call to action

**See the whole feature set** → `/features` · **How the capability plane keeps them honest** →
`/security`

---

## Meta

- **Title tag:** Extensions — Tepegöz
- **Meta description:** Nine first-party extensions ship with Tepegöz — ad blocking, macros,
  translation, writing help, scheduled tasks and more. Built in, not bolted on.
