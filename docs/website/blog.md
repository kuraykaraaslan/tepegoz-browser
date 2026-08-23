---
route: /blog
title: Build log
description: Development notes from an agentic browser built in the open — including the experiments that failed.
nav: footer
status: ready
---

# Build log

**[BUILD NOTE]** Index page plus editorial policy. Posts are separate files under `blog/`. For a
pre-release project this is the highest-leverage page on the site after the home page: it is the only
proof that the thing is alive.

## Hero

### Headline

**Build log.**

### Subhead

Notes from building an agentic browser in the open — architecture decisions, security work, and the
experiments that did not work.

---

## Editorial policy

**[BUILD NOTE]** Publish this. It sets expectations and it is a differentiator in a category of
announcement blogs.

- **Publish the refutations.** When a designed approach is tested and fails, that post gets written. One
  phase of this project records a measured refutation of its own specification; that is the standard.
- **No announcement without an artifact.** A post claiming a result links to the thing that produced it.
- **Cadence over polish.** A short honest note every few weeks beats a quarterly essay.
- **No competitor dunking.** Published incidents in the category are fair to analyse, technically and
  without gloating — they are how the whole field learns what an agentic browser must not do.

---

## Published

1. [**The screenshot that captured the wrong screen**](blog/the-screenshot-that-captured-the-wrong-screen.md)
   Why a browser whose tabs are isolated `WebContentsView`s cannot screenshot itself, the OS-level
   workaround that captured the operator's own desktop twice and was deleted, and the `desktopCapturer`
   path that works. Ends where it actually ended: the capture is solved, the agent recording is not.

---

## Launch posts

**[BUILD NOTE]** Six posts that exist as material already, drawn from work in the repository. Each has a
real conclusion, not a teaser.

1. **Why the model is not the security control**
   The failure shape behind the category's public incidents, and what a deterministic kernel that runs
   _before_ the model changes about it.

2. **We tested our own sandbox design and it failed**
   A phase specified an isolated-world approach for code execution. A cheap offline experiment refuted
   it. Why that got recorded as a result rather than quietly redesigned around.

3. **A kill switch that fails closed, and how we proved it**
   Killing a live tunnel endpoint against the built application and confirming that a proven-reachable
   clear path records nothing. Includes the residual leak we could not close and documented instead.

4. **Deleting a native database**
   Replacing `better-sqlite3` with Node's built-in SQLite removed a rebuild script, three CI steps, and
   a skip-guard that had been letting 63 tests sit out entire runs.

5. **What a browser agent must never do on its own**
   Enabling a sensitive category, widening a wallet mandate, and permission widening in general — the
   list, and why every one of them belongs to the user rather than the agent.

6. **Reading everyone else's complaints**
   What the published user studies of five rival agentic browsers say, what we changed because of them,
   and the ones we have not answered yet.

---

## Subscribe

**[BUILD NOTE]** RSS first — this audience uses it. An email option is fine, but it makes the site a
data controller: `/legal/privacy` must be live and accurate before the field exists.

---

## Meta

- **Title tag:** Build log — Tepegöz
- **Meta description:** Development notes from an agentic browser built in the open — including the
  experiments that failed.
