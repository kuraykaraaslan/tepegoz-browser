---
route: /open-source
title: Open source
description: Tepegöz is AGPL-3.0. The whole browser is readable, forkable and auditable — and nobody gets to close it and sell it back to you.
nav: primary
status: ready
---

# Open source

## Hero

### Headline

**All of it. Under a licence that keeps it that way.**

### Subhead

The security kernel, the agent runtime, the extensions, the network layer, the tests. Not a demo, not a
core with the interesting parts held back.

---

## Section 1 — Why it matters here specifically

### Body

You are being asked to install a browser that holds your keys, reads your logged-in pages and can act on
your behalf. "Trust us" is not an acceptable answer to any question about how it behaves.

So the answer is: **read it.** The rules that decide what the agent may do are a file you can open. The
place secrets are stored is a file you can open. The claim that there is no telemetry is checkable by
searching for the network call that would have to exist.

Open source here is not a licensing preference. It is the only form in which the security claims on this
site are worth anything.

---

## Section 2 — The licence

### Heading

**GNU Affero General Public License v3.0.**

### What it gives you

Run it for anything. Read it. Change it. Share it. Ship your own fork.

### What it asks in return

If you distribute a modified version, its source has to be available under the same licence. And
because it is the _Affero_ variant: **if you run a modified version as a network service, the people
using that service must be offered its source too.**

### Why this licence and not a permissive one

Plainly: to stop the obvious ending. A well-funded competitor takes a security-focused browser, closes
the fork, ships it as a hosted product, and returns nothing. AGPL makes that ending unavailable. It is a
deliberate trade — some companies will not touch AGPL code, and that cost was accepted on purpose.

The copyright is held by a single author, so a separate commercial licence is possible for anyone whose
situation genuinely requires one. Ask.

**Full text** → [/legal/license](/legal/license) · **Third-party components and their licences** →
[THIRD-PARTY-NOTICES.md](../../THIRD-PARTY-NOTICES.md)

---

## Section 3 — What the repository actually contains

### Body

Not a marketing repository with a build script.

- Roughly **seventy internal packages** behind one desktop shell, with module boundaries machine-enforced
- **Nine first-party extensions**
- An end-to-end suite that launches the **built** application, run on Windows, macOS and Linux on every
  push
- A published **threat model**, **39 architecture decision records**, and a phase-by-phase roadmap that
  states what has not been measured
- **Zero** `@ts-ignore`, **zero** skipped tests, and a dependency audit that is allowed to fail the
  build

**[CLAIM]** Every number above is checkable in the repository, and the continuous-integration
configuration that enforces them is public.

---

## Section 4 — Contributing

### Body

This is a single-maintainer, pre-release project. That shapes what is genuinely useful:

**Most valuable right now**

- Bug reports with a reproduction — a page fixture beats a description
- **Security findings**, reported privately
- Fixes for anything already on the known-issues list
- Turkish and English wording corrections
- macOS and Linux platform reports, since Windows gets the most hands-on testing

**Ask before building**

Anything large, and anything touching the security kernel, the model gateway or the IPC contract. Open
an issue and agree the approach first — a big unsolicited pull request in those areas usually cannot be
merged, and that wastes your evening, not ours.

**What CI will hold you to**

Strict TypeScript with no escape hatches, schema validation at every trust boundary, English and Turkish
strings in the same pull request, module boundary rules, coverage thresholds, and no AI attribution
trailers in commit messages. All of it is mechanical, and all of it is written down before you start.

**Start here** → [CONTRIBUTING.md](../../CONTRIBUTING.md) · **The binding rules** →
[engineering rules](../engineering-rules.md)

---

## Section 5 — Governance, honestly

### Body

One maintainer. No foundation, no steering committee, no corporate backer. Decisions that shape the
architecture are recorded as decision records in the repository, so you can read the reasoning even when
you disagree with the outcome — and contradicting an accepted one requires a new record, not a quiet
edit to the old.

Contributions are inbound-equals-outbound under AGPL-3.0. There is no contributor licence agreement and
no copyright assignment: your work stays yours, licensed the same way the project is.

---

## Closing call to action

**Read the source** → GitHub · **Report a vulnerability** → `/security`

---

## Meta

- **Title tag:** Open source — Tepegöz is AGPL-3.0
- **Meta description:** Tepegöz is AGPL-3.0. The whole browser is readable, forkable and auditable — and
  nobody gets to close it and sell it back to you.
