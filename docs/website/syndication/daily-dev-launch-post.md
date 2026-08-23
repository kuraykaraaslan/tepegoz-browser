---
channel: daily.dev (Squad — native post, not a link submission)
status: ready-to-post
---

# daily.dev Squad post — launch

**[BUILD NOTE]** The three copy rules apply here harder than anywhere else on the site, because a
launch post is where they are most tempting to break:

1. **No unearned superlatives about the agent.** Nothing about it being better, smarter or faster. The
   benchmark spend has not been paid, so there is no number and this post does not imply one.
2. **State the pre-release condition.** No independent security audit, no independently measured
   automation. Both are in the body, not in a footnote.
3. **Split what works from what is planned.** Anything decided-but-unbuilt (per-category grants, wallet
   mandates, automatic CAPTCHA/2FA) stays out of a launch post entirely — a launch is the worst place
   to blur that line.

**[BUILD NOTE]** No competitor dunking. The category's published incidents are the reason the
architecture looks like this, and the post says so technically, by failure *shape*, without naming
anyone.

---

## Post title…

A launch title has one job: make a developer want to try it. It does **not** get to promise something
the body cannot support — no superlatives, no implied benchmark. Fortunately none of these need one;
they work by being concrete about things the category mostly does not do.

**Recommended — curiosity, on-brand, and the safety story hides inside it:**

> I named my browser after a cyclops so I'd remember to keep it on a leash

Tepegöz is the one-eyed giant of the Book of Dede Korkut. The joke lands, and it sets up the actual
argument — an agent with your logged-in session *is* a monster, so the cage was built first.

**Alternates by flavour:**

*Concrete and enticing — three attractive facts, no adjectives:*

> An AI browser with no account, no backend, and a Tor tunnel per tab

*Playful, aimed at signup fatigue:*

> An AI browser that has never once asked me to sign in

*For a security-leaning crowd:*

> The agent asks. The kernel decides. The model never gets a vote.

*The sober one, if the room is cynical about launches:*

> I built an agentic browser and have no benchmarks to show you

**Rejected**, with reasons:

- Anything with *"the smartest"*, *"finally"*, or *"the future of browsing"* — this audience reads that
  as a tell, and here it would also be a claim that cannot be supported.
- *"The most secure AI browser"* — superlative, unmeasured, and the adversarial battery has not been
  run at claim grade. Saying it would contradict the post's own argument.
- *"The AI browser that actually works"* — implies a completion rate. There is no measurement behind it,
  which is the one thing this project does not do.

---

## Add cover

The extensions page or the network-privacy settings screen — both are real captures of the running
app and both show something the category does not generally offer. Avoid a hero shot of an empty new
tab: it says nothing and this audience has seen a hundred of them.

---

## Share your thoughts

Tepegöz is the one-eyed giant of the Book of Dede Korkut — the monster an entire people had to answer
for. I named a browser after him because an AI agent holding your logged-in session is exactly that:
enormously capable and, unsupervised, dangerous. So I built the cage first and the agent second.

Every agentic browser launch also comes with a number. I don't have one, and this post isn't going to
imply I do. What I have is an architecture, and it is checkable, because all of it is AGPL-3.0 and
readable.

**[If you use the sober title instead, drop the first paragraph — the second one opens it cleanly.]**

**The one idea.** In most of these products the model is the security control: it is prompted to behave,
and a dialog asks you to confirm. That is the shape behind the category's public incidents — a page
that can argue with the thing deciding what happens next. So in mine the model isn't the control. A
deterministic kernel classifies every tool call **before the model runs** — by tool, by validated
arguments, by target — into six risk tiers, in the privileged process. The window you're looking at
gets no vote; a compromised renderer asking for approval is asking a process that will not listen.

The agent cannot widen its own permissions. Grants are minted from a plan you approved, scoped to the
domains in it, and they expire when the run ends. There is no tool in the capability plane that creates
or extends one — a missing capability, not a refused one.

**What it is.** A real browser first: tabs and groups, bookmarks, history, downloads with quarantine,
find-in-page, profiles. Bring your own key — Anthropic, OpenAI, Gemini, Kimi, or a model running fully
on-device. No account, no backend, no telemetry today. Your key is encrypted through the OS keychain and
stays in the privileged process.

**Three things you probably haven't seen elsewhere:**

- **Per-tab tunnels.** Bind one tab, a tab group, or the whole profile through WireGuard or Tor, chained
  Tor-over-VPN. Fail-closed: if the tunnel drops, those tabs stop rather than quietly falling back to
  your real connection.
- **`tepegoz-verify`** — a standalone CLI that verifies a proof-of-run bundle. No database, no network,
  no trusting whoever handed you the receipt to also grade it.
- **Model-free macros.** A deterministic interpreter with a sandboxed expression language, where every
  element step auto-waits instead of sleeping. Same result every run, no tokens burned.

**What I can't tell you.** There has been no independent security audit. The automation has not been
independently benchmarked — the protocol is written and pre-registered, including the clause that
withdraws the claim if it stops reproducing, and the runs have not been paid for. Until they are, I
describe how it decides, not how often it succeeds.

Signed builds for Windows, macOS and Linux, or three commands from source. If you want to check any of
the above, the interesting files are the policy kernel and the capability plane — that's the point of
shipping it this way.

github.com/kuraykaraaslan/tepegoz-browser

#opensource #security #electron #ai #javascript

---

## First comment (post it yourself, right after)

> Happy to get into specifics — particularly the risk-tier classification and why the autonomy level is
> resolved in the main process rather than the renderer. If you find a hole in the kernel, private
> vulnerability reporting is on the repo and good-faith research is explicitly authorised.
