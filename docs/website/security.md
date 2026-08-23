---
route: /security
title: Security
description: How Tepegöz keeps an autonomous agent inside limits — deterministic rules, an untrusted renderer, a fail-closed kernel — and what it has not yet proven.
nav: primary
status: ready
---

# Security

## Hero

### Headline

**An agent with your session is a security problem. We built for that first.**

### Subhead

Tepegöz renders untrusted content and lets a model act on pages you are logged into. Everything below
exists because that combination is dangerous, and because several shipped products have already proved
how it fails.

---

## Section 1 — The premise

### Body

Give a language model your browser and you have handed it your identity — your logged-in mail, your
bank, your cloud storage, your password manager. The model's judgement is now a security control, and
it is a bad one: it can be argued with by a web page.

So in Tepegöz the model is not a security control. **Rules are.** A deterministic kernel decides what a
tool call may do before the model is consulted, and the model's opinion cannot widen that decision.

---

## Section 2 — The five load-bearing decisions

### The renderer is untrusted

The window you are looking at can be manipulated by the page inside it, so it is given no authority. It
displays and it relays. Autonomy level, permission checks and approvals are evaluated in the privileged
process against state the renderer cannot reach. A compromised renderer that tries to approve something
is not disobeying a rule — it is asking a process that will not listen.

### Every tool call is classified before the model runs

Six tiers, derived from the tool, its validated arguments and its target: **read**, **UI-write**,
**data-egress**, **financial**, **credential**, **destructive**. The tier decides what happens. A step
that touches money, secrets or deletion cannot be auto-approved into existence by clever phrasing,
because the phrasing never reaches the decision.

### Page content is data, never instruction

Everything a page returns is normalized and screened at the boundary where it enters — injected
commands, forged system markers, and the rest of the known repertoire. This is the class of attack that
took down shipped competitors: a hidden instruction on a web page that the agent read as an order from
its user.

### Secrets never reach the model

Credentials live in an encrypted vault and are filled by a broker. The model can ask for a login to be
performed; it cannot ask for the password, and it never sees one. Keys are held only in the privileged
process, encrypted through the operating system's keychain, and redacted from logs.

### It fails closed

When a policy, a capability check or a network binding cannot reach a decision, the answer is no. A tab
bound to a tunnel that drops stops working rather than quietly falling back to your real connection —
the outcome you would want if you had been asked, which is the only sensible default when you cannot be.

---

## Section 3 — What is locked, permanently

### Body

Some things are not a setting.

- **Sensitive categories cannot be automated** — banking, crypto, health, password managers — including
  Turkish banking and the whole `gov.tr` tree. No autonomy level unlocks them.
- **CAPTCHA and human-verification challenges are never solved automatically.** They are handed to you.
- **The agent cannot widen its own permissions.** Grants are minted from a plan you approved, scoped to
  the domains and tool classes in that plan, and they expire when the run ends.
- **Irreversible actions require a specific confirmation** that names what is about to happen.

---

## Section 4 — Learning from other people's incidents

### Body

The agentic browser category has a public failure record, and it is short reading. Indirect prompt
injection driving real actions. An agent talked into reading a password manager's vault. A zero-click
instruction that deleted files in connected cloud storage. Screenshots that captured logged-in sessions
and shipped them to a server.

Tepegöz treats each of those as a test case rather than a headline. The published incidents are being
turned into adversarial scenarios that the browser must fail — because a defence with no scenario that
fails without it is an assumption, not a control.

**[CLAIM]** The incident-derived work items are tracked in the open, in
[the safety phase](../../phases/ai-agent-super/phase-s6-safety-control-plane.md).

---

## Section 5 — What we have not done

**[BUILD NOTE]** Do not move this below the fold and do not shorten it. On a security page, the
omissions are the credibility.

- **No independent security audit.** None has been performed.
- **Builds are unsigned.** Code signing is not configured, so anything you build is a development
  artifact and your operating system will say so.
- **No published release.** There is no update channel and no stable version.
- **The adversarial battery has not been run at claim grade.** The attack scenarios exist and the
  protocol is written; the measured attack-success-rate number does not exist yet, and we will not
  quote one until it does.
- **Some capabilities ship deliberately inert** — built, reviewed, and switched off until the
  surrounding controls are proven.

**[CLAIM]** The full threat model is published: [threat model](../threat-model.md). Known problems are
tracked at [known issues](../known-issues.md).

---

## Section 6 — Reporting a vulnerability

### Body

Security reports are the most valuable contribution this project can receive, and they are handled
accordingly.

**Please do not open a public issue.** Use GitHub's private vulnerability reporting on the repository,
or write to `kuraykaraaslan@gmail.com` with `[tepegoz-security]` in the subject.

What to expect, stated as a single maintainer can honestly commit: acknowledgement within **5 days**, an
initial assessment within **14 days**, and a fix on the main branch on a best-effort basis, tracked
publicly. Coordinated disclosure with a **90-day** default window. There is no bug bounty. Credit is
given unless you would rather stay anonymous.

Good-faith research under that policy is authorized, and this project will not pursue legal action over
it.

**Full policy, scope and safe harbour** → [SECURITY.md](../../SECURITY.md)

---

## Closing call to action

**Read the threat model** → [threat model](../threat-model.md) · **See the code** → GitHub

---

## Meta

- **Title tag:** Security — Tepegöz
- **Meta description:** How Tepegöz keeps an autonomous agent inside limits — deterministic rules, an
  untrusted renderer, a fail-closed kernel — and what it has not yet proven.
