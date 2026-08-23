---
route: /turkey
title: Built with Turkish as a first language
description: Full Turkish parity, a dedicated Turkish keyboard pipeline, and a public-service track — in a category where rivals' own users file non-English input as a blocking defect.
nav: primary
status: ready
---

# Türkiye

**[BUILD NOTE]** This page exists in both languages like every other, but it is the one page where the
**Turkish version is the original** and the English version explains the position to an outside reader.
Translate accordingly — do not render the Turkish as a literal translation of this text.

## Hero

### Headline

**Turkish is not a translation here. It is a first language.**

### Subhead

Written in Turkey, for people who use Turkish every day — with the keyboard handling, the public-service
work, and the language parity that implies.

---

## Section 1 — Parity, enforced by the build

### Body

Every user-facing string in Tepegöz comes from a typed catalogue with English and Turkish at **full
parity**, added in the same change. This is not a convention people are asked to follow: a hardcoded
string in the interface **fails the build**, and a missing translation is a type error.

You can switch language at runtime, without a restart, and the browser starts in your operating system's
language.

---

## Section 2 — The keyboard, done properly

### Body

Turkish input breaks software in specific, well-known ways: the dotted and dotless `i`, the `ç ğ ı ö ş
ü` set, dead keys, and the fact that Q and F layouts are both in real use.

Tepegöz has a dedicated input pipeline for this, with a **regression matrix** that runs in continuous
integration — and it works independently of which language the interface is set to, because plenty of
people run an English interface and type Turkish all day.

**Why this is worth a section on a marketing site:** in the published user-feedback studies for rival
agentic browsers, non-English keyboard and IME handling is filed as a **P0 blocker**, with Turkish named
among the first languages needing repair and side-panel input specifically broken. This is the one place
in the comparison where the honest answer is that Tepegöz is ahead — so it is tested, not just claimed.

---

## Section 3 — Public services

### Body

A browser that automates tasks in Turkey eventually meets **e-Devlet, GİB, SGK and MHRS**. These are not
ordinary websites: a mistake has consequences that a retry cannot undo, and the sites themselves are
sensitive by category.

The design position is already fixed and recorded: **reading is free, writing is force-asked** with
biometric confirmation, regardless of the autonomy level in use — and the whole `gov.tr` and `bel.tr`
tree, along with Turkish banking, is locked out of automation by category.

**Status, stated plainly:** the classification layer is built and reviewed. The actual recipes and
locale packs do not exist yet. This is planned work with the trust model settled first, not a shipping
feature.

---

## Section 4 — Local, in both senses

### Body

Local-first means your data stays on your machine — relevant anywhere, and particularly relevant when
the alternative is a browser that ships your logged-in sessions to a server in another jurisdiction.

Tepegöz has no backend, no account and no telemetry, and it can run its agent entirely on a model on
your own hardware, with no network dependency at all.

---

## Section 5 — Where it is made

### Body

Written in Turkey by one developer, in the open, under AGPL-3.0. Windows is the primary target because
that is what most of the people this was built for actually use.

Turkish web tasks are also part of how the agent will be measured: the benchmark set reserves a named
Turkish-web stratum, so competence in Turkish is reported separately rather than averaged into an
English-heavy number.

---

## Closing call to action

**The story behind the name** → `/story` · **Get Tepegöz** → `/download`

---

## Meta

- **Title tag:** Türkiye — Tepegöz
- **Meta description:** Full Turkish parity, a dedicated Turkish keyboard pipeline, and a public-service
  track — in a category where rivals' own users file non-English input as a blocking defect.
