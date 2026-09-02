---
route: /compare
title: How Tepegöz compares
description: An honest comparison against other agentic browsers — on architecture and control, not on benchmark scores we have not run.
nav: primary
status: ready
---

# Compare

**[BUILD NOTE]** This page has a rule that outranks its persuasiveness: **no completion-rate or
success-rate comparison until the pre-registered head-to-head artifact exists.** When it does, add the
numbers here — win or lose — with the date and the rival build strings, and relax nothing else. Until
then, the page compares design, not performance.

## Hero

### Headline

**We are not going to show you a benchmark we have not run.**

### Subhead

Every agentic browser claims its agent is the best one. Almost none publishes a dated, blind-scored
result you could reproduce. So this page compares what can be checked today: what each product lets an
agent do, and who decides.

---

## Section 1 — What we will not claim

### Body

Tepegöz has not been independently benchmarked against Perplexity Comet, ChatGPT Atlas, Fellou, Opera
Neon or Claude for Chrome. The protocol for that comparison is written and committed in advance — the
task list, the rubric, the blind scoring, and the clause that withdraws the claim the moment it stops
reproducing. It has not been executed, because it needs rival subscriptions and API spend that have not
been paid.

When it runs, **version one is published even if Tepegöz loses.**

Anything you read on this page is architecture you can verify by reading source code, or a published
incident you can look up.

---

## Section 2 — The design differences

**[BUILD NOTE]** Table. Left column = the question a technical buyer actually asks.

| Question                                     | Tepegöz                                                                           | Common in the category                                               |
| -------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Who decides what the agent may do?           | A deterministic rule kernel, in the privileged process, **before** the model runs | The model, prompted to behave, plus a per-action confirmation dialog |
| Where is the autonomy setting enforced?      | Main process; the window you see has no vote                                      | Frequently in the UI layer                                           |
| Is page content ever treated as instruction? | No — screened and marked as data at the boundary where it enters                  | The class of failure behind the category's published incidents       |
| Can the agent widen its own permissions?     | No. Grants come from a plan you approved and expire with the run                  | Varies; often a global "skip confirmations" mode                     |
| Sensitive sites                              | Banking, crypto, health and password managers ship off; only you can enable one   | Usually the same permission as anything else                         |
| Where do your API keys live?                 | Your OS keychain, privileged process only. No account, no proxy                   | Often a vendor account with a hosted proxy                           |
| Does it work with no backend at all?         | Yes — including a fully local model                                               | Rarely; a vendor subscription is usually the product                 |
| Per-tab VPN or Tor                           | Yes, with a fail-closed kill switch                                               | Not offered                                                          |
| Can you read the source?                     | All of it, AGPL-3.0                                                               | Mostly closed                                                        |
| Is the automation independently benchmarked? | **No — and we say so**                                                            | Claimed, rarely with a reproducible artifact                         |

---

## Section 3 — What the category has already got wrong

### Body

This is the part of a comparison that is fair to make, because it is public record rather than opinion.
Independent reports and disclosures across shipped agentic browsers describe: indirect prompt injection
turning page content into real actions; an agent induced to read a password manager's vault; a
zero-click instruction that deleted files in connected cloud storage; screenshots capturing logged-in
sessions; and approval prompts so undifferentiated that users learned to click through them.

Tepegöz's answer is not that it is immune. It is that each of those is being turned into an adversarial
test the browser has to fail — because a defence with no scenario that fails without it is an
assumption, not a control. The work is tracked publicly, per item.

**[CLAIM]** Source studies and where each finding landed in the plan:
[research index](../research/README.md).

---

## Section 4 — Where rivals are ahead

**[BUILD NOTE]** Do not delete this section in review. A comparison page with no losses is an
advertisement, and technical readers price it accordingly.

- **They ship.** Signed installers, update channels, mobile apps. Tepegöz has none of that yet.
- **They are proven in the field** at a scale no pre-release project can claim.
- **Extension ecosystems.** Chrome MV3 support here is limited and planned; if you depend on a specific
  extension today, that is a real reason to stay where you are.
- **Polish and platform breadth.** macOS and Linux work but get less testing; Windows is the focus.
- **Their agents may simply be better at the task you care about.** Nobody has measured, including us.

---

## Section 5 — Who should actually use Tepegöz

### Body

**A good fit if** you want automation you can audit; you would rather bring your own key than rent an
assistant; you need per-tab network isolation; you work in Turkish and are tired of it being an
afterthought; or you are the kind of person who reads the source before installing a browser.

**A bad fit if** you need something stable today, you want a signed installer and automatic updates, you
depend on Chrome extensions, or you want a mobile browser. Come back later — the roadmap says honestly
when "later" might be.

---

## Closing call to action

**See the design for yourself** → `/how-it-works` · **The honest status** → `/roadmap`

---

## Meta

- **Title tag:** How Tepegöz compares
- **Meta description:** An honest comparison against other agentic browsers — on architecture and
  control, not on benchmark scores we have not run.
