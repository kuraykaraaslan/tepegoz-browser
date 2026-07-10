# Phase AI-7 — Navigation Grounding (evidence-gated URLs, visible-nav-first, no escape-hatch)

**Status:** ⬜ Not started  ·  **Depends on:** [AI-2](phase-ai-2-perception-buildtree.md), [AI-3](phase-ai-3-agent-loop.md), [AI-4](phase-ai-4-action-vocabulary.md)  ·  **Track:** [`phases/ai`](README.md)
**Goal:** Stop the agent from **leaving the page prematurely** when the real work is *on* it. The two escape
vectors are the same anti-pattern wearing different hats: **fabricating a URL** and **bailing to
`web_search`** (or off-origin navigation) to dodge a hard in-page subtask (a menu, a modal, a form). Encode
one ordering — *exhaust the visible on-page route → search only when the destination is genuinely off-site
→ guess a conventional path only when the DOM or a sitemap supports it* — **in code**, not as a
system-prompt sentence. This is the code that lets [AI-6](phase-ai-6-consolidation.md) finally delete the
`/blog`-guessing prose.

## Why (the systematic gap — from the 2026-07 external audit, `s01`)

The "try `/blog`, `/posts`, `/about`" heuristic lives **only as prose** in the reactor
`BROWSING_STRATEGY` ([`reactor.ts:285-304`](../../packages/orchestrator/src/reactor.ts)) and the parallel
planner guidance ([`planner.ts:92-95`](../../packages/orchestrator/src/planner.ts)). Nothing in code
enforces "visible navigation first," and — worse — the prose **contradicts** the desired behaviour: it
tells the model to *append a conventional path to the origin* with **no DOM-link or sitemap gate**. A grep
for `sitemap`/`robots` across the repo returns **zero** hits — there is no sitemap/robots parsing anywhere.

Meanwhile a genuine "find X when the destination is unknown" primitive already ships and is live in the
reactor's tool set — `web_search_items` (a real DuckDuckGo fetch,
[`web-tools-host.electron.ts`](../../apps/desktop/src/main/web/web-tools-host.electron.ts), registered
always-on at [`index.ts`](../../apps/desktop/src/main/index.ts)) — but `BROWSING_STRATEGY` **never steers
the model to it**. So the model reaches for URL fabrication precisely when it should be searching or
reading the page's own links.

**The mirror-image risk (external audit `s31`): `web_search` as an escape hatch.** Surfacing search
(above) is right, but search + URL-guessing are *also the most common competence anti-pattern* — the agent
**bails off the page** rather than doing the hard on-page work (open the drawer, dismiss the modal, fill the
form, page through the list). Today `web_search_items` is a fully **un-gated** `read` tool with a neutral
description ([`web-tools.ts:26-29`](../../packages/web-tools/src/web-tools.ts)) and **nothing measures the
escape** — no "left the target origin / used search when an on-page route existed" signal exists (it is
absent from the `s26` metric set too). The only counter-force is the AI-3 don't-give-up prose + the
completion validator, and neither fires on a *search*, because a search is a legitimate-looking action, not
a `finish`. So both escapes must pass through **one** gate: *is the visible on-page route exhausted?*

This is **empirically confirmed, not hypothetical**: the first live-model run
([`eval-results-2026-07.md`](eval-results-2026-07.md), finding #4) names the escape hatch *the biggest
remaining competence anti-pattern* — on hard multi-step tasks the agent navigated to a guessed `target.com`
or web-searched "how to dismiss a cookie banner" instead of using the on-page widget, across
`blog_behind_menu`, `shadow_dom_nav`, `div_button_products`, and the new `cookie-consent`/`login-form`/
`contact-form`/`pagination` scenarios. It is called out there as **the next high-leverage competence
target**, mapping to this phase + AI-4 `s16`.

## What "grounded navigation" means (the ordering, in code)

1. **Exhaust the visible on-page route first (persistence gate).** Prefer a link/button already in the
   [AI-2](phase-ai-2-perception-buildtree.md) element snapshot (with its `href`), or one revealed by opening
   a menu/drawer, dismissing a modal, scrolling (`scroll_to_text`), or paging. Any *escape* — search,
   off-origin nav, or a guessed path — is only considered **after** this route is genuinely exhausted, not
   as a first move to dodge a hard subtask. This gate governs steps 2 and 3 below.
2. **Search only when the destination is genuinely off-site / unknown.** With the persistence gate passed,
   `web_search_items` is the first-class "I don't know the URL" primitive instead of typing a guessed URL
   (respecting the URL allow-list / Policy plane). It is **not** a shortcut around on-page work: a search
   whose answer was reachable on the current page is an *escape*, and is what the `s31` measurement below is
   built to catch.
3. **Guess only on evidence.** A conventional path (`/blog`, `/login`, `/checkout`, …) is allowed **only
   when the DOM or a sitemap supports it**: a candidate derived from an on-page link/anchor, or an entry in
   the origin's `sitemap.xml` (discovered via `robots.txt`). An ungrounded origin+path concatenation is
   **not** offered as an action; if nothing is grounded, the agent persists on-page, searches (gate
   permitting), or finishes with a clear limitation — it does not blind-poke `/blog`.

## Exit criteria (DoD)
- [ ] A **navigation-candidate resolver** (pure, package-level; zod at the CDP read boundary) that, given
      the goal + the current element snapshot, returns candidates ranked **visible-link → search-result →
      sitemap-backed path**, each tagged with its *evidence source*. An origin+path with **no** DOM/sitemap
      backing is never returned as a candidate.
- [ ] A **sitemap/robots reader**: fetch `robots.txt` → `Sitemap:` entries → `sitemap.xml` (bounded,
      through `@tepegoz/http` + the Egress/URL-allow-list plane, cached per origin for the run). A path the
      agent wants to visit is confirmable against it; absent/unreachable sitemap → that path is simply
      ungrounded (no guess), not an error.
- [ ] `web_search_items` is **surfaced in the browsing strategy** as the destination-unknown move, so the
      model searches rather than fabricates when no visible route exists.
- [ ] **`s31` — the search/off-origin escape is behind the persistence gate.** `web_search` and off-origin
      navigation are only offered once the on-page route is exhausted (the same resolver as above): its tool
      description and the strategy make clear it is *not* a way to skip a menu/modal/form, and — where cheap
      and deterministic — an on-page candidate that satisfies the goal is preferred over a search result.
      (Keep it a steer, not a hard block: a legitimately off-site task must still be able to search.)
- [ ] **`s31` measurement — escape rate.** The [AI-1](phase-ai-1-eval-harness.md) harness records an
      **escape / on-page-persistence** metric: how often a run left the task's origin or called `web_search`
      when an on-page route existed (today *nothing* measures this). Add an **escape-bait** fixture whose
      shallow move is to search / guess a URL but whose answer requires persisting on-page (a hard modal +
      form behind it); the fix must lower the escape rate **without** regressing genuinely off-site tasks.
- [ ] The `/blog`-guessing **prose is removed** from `reactor.ts` `BROWSING_STRATEGY` and `planner.ts`
      (this is the [AI-6](phase-ai-6-consolidation.md) retirement, done here because this phase supplies the
      capability that subsumes it) — kept only as a small, general "prefer a route you can see or verify"
      nudge. Prompt-string tests updated.
- [ ] **Measured on the [AI-1](phase-ai-1-eval-harness.md) harness:** `blog_not_linked` (blog reachable
      only by a non-landing route) and a new **URL-hallucination trap** fixture (a site whose `/blog` 404s
      but whose blog is linked/behind a menu, and one where the real path is only in `sitemap.xml`) flip to
      pass **without** the guessing prose; the held-out set does not regress; the agent does **not** fabricate
      a 404 path when an evidence-backed route exists.
- [ ] **i18n:** none (internal navigation logic + model-facing tool text in English). Coverage + self-review.

## Tasks
- [ ] Candidate resolver over the AI-2 snapshot: rank on-page `href`s by goal relevance; expose as guidance
      the reactor/planner can consume deterministically (no model call inside the resolver).
- [ ] Sitemap/robots reader in an Electron-free package (host-injected fetch seam), zod-validated, bounded,
      per-origin cached; wire the URL-allow-list/Policy checks so discovery can't become an SSRF vector.
- [ ] Reactor/planner: replace the "append a conventional path to the origin" prose with a code path that
      only proposes a path when the resolver/sitemap grounds it; surface `web_search_items` for the
      destination-unknown case.
- [ ] Fixtures + eval scenarios: `url-hallucination-trap` (404 on the guessed path, real route visible/behind
      a menu) and `sitemap-only-route` (target path present only in `sitemap.xml`); measure fabrication rate
      before/after.
- [ ] Fold the removed prose into the [AI-6](phase-ai-6-consolidation.md) audit trail (proven-subsumed).

## Scope notes
- This is the **code that closes `s01` and `s31`** and the concrete subsumption AI-6 was waiting on for the
  `/blog` lines — keep the two in lockstep (don't delete the prose until this phase's eval proves the fix).
- **The `s01`↔`s31` tension is resolved by one gate, not two rules.** Surfacing `web_search` (`s01`) and
  constraining it as an escape hatch (`s31`) are the same policy: *exhaust the visible on-page route, then
  escape only for a genuinely off-site/unknown destination.* Implement the persistence gate once; both
  behaviours fall out of it. Do **not** turn this into a hard block on search — that would break legitimate
  off-site research; it is a **steer + measurement**, and the escape-rate metric is what keeps it honest.
- The don't-give-up **persistence** behaviour itself is AI-3's (reveal menus, don't finish early); AI-7 adds
  the *navigation-target* discipline (where it's allowed to go), and the escape metric that scores both.
- Do **not** disable direct `browser_update_location` for genuinely known URLs (the user pasting a link, an
  `href` read from the page). The target is *fabricated* origin+path guesses, not all navigation.
- Related but distinct: AI-4's **tab auto-switch on click** (a click that spawns a new tab) — cross-reference,
  don't duplicate.
