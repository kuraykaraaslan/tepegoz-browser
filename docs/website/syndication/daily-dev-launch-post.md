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

> We built an agentic browser and have no benchmarks to show you

**Alternates**, in descending order of how well they survive a skeptical scroll:

- An agentic browser where rules, not the model, decide what the agent may do
- Our browser's agent can't approve its own permissions. That's the whole design.
- Bring your own key, no account, no backend: an agentic browser under AGPL

**Rejected**, with reasons:

- Anything with *"the smartest"*, *"finally"*, or *"the future of browsing"* — this audience reads that
  as a tell, and in our case it would also be a claim we cannot support.
- *"The most secure AI browser"* — superlative, unmeasured, and the adversarial battery has not been
  run at claim grade. Saying it would contradict the post's own argument.

---

## Add cover

The extensions page or the network-privacy settings screen — both are real captures of the running
app and both show something the category does not generally offer. Avoid a hero shot of an empty new
tab: it says nothing and this audience has seen a hundred of them.

---

## Share your thoughts

Every agentic browser launch comes with a number. We don't have one, and this post isn't going to
imply we do.

What we have is an architecture, and it is checkable, because all of it is AGPL-3.0 and readable.

**The one idea.** In most of these products the model is the security control: it is prompted to behave,
and a dialog asks you to confirm. That is the shape behind the category's public incidents — a page
that can argue with the thing deciding what happens next. So in ours the model isn't the control. A
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

**What we can't tell you.** There has been no independent security audit. The automation has not been
independently benchmarked — the protocol is written and pre-registered, including the clause that
withdraws the claim if it stops reproducing, and the runs have not been paid for. Until they are, we
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
